// B4A+B4B — rölöve ↔ proje karşılaştırması, safhalar, eşleştirme, rapor ve pafta çıktıları: node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compareDrawings, diffCsv, summarize } from '../js/bim/diff.js';
import { runCommand, applyPatch } from '../js/bim/commands.js';
import { History } from '../js/bim/history.js';
import { revisionPrims, revisionSheet, revisionDxf, REV_STYLE } from '../js/revview.js';

const FILE = JSON.parse(readFileSync(new URL('./fixtures/eski-proje-v1.saggcad.json', import.meta.url), 'utf8'));
const J = o => JSON.stringify(o);
const rolove = () => JSON.parse(J(FILE.project.drawings[0].plan));
const copyOf = R => JSON.parse(J(R));   // uygulamadaki kopyalama ile aynı: kimlikler korunur
const cmp = (A, B, o) => { const ja = J(A), jb = J(B), r = compareDrawings(A, B, o); assert.equal(J(A), ja, 'kaynak değişmedi'); assert.equal(J(B), jb, 'hedef değişmedi'); return r; };
const E = (r, key) => r.entries.find(e => e.key === key);
const changed = r => r.entries.filter(e => e.status !== 'unchanged').map(e => `${e.key}:${e.status}`);

test('1–2: rölöve kopyası → tüm elemanlar aynı kimlikle eşleşir, değişiklik yok; salt okunur', () => {
  const A = rolove(), B = copyOf(A), r = cmp(A, B);
  assert.deepEqual(changed(r), []);
  assert.equal(E(r, 'L0/wfx001').status, 'unchanged'); assert.equal(E(r, 'L0/wfx001').phase, 'existing');
  assert.ok(r.entries.length > 40 && r.entries.every(e => e.status === 'unchanged'));
  assert.equal(r.summary.total.walls.kept, r.summary.total.walls.source);
});

test('3: yalnız kalınlığı değişen duvar yeni duvar sayılmaz (geometrisi değişen, aynı kimlik)', () => {
  const A = rolove(), B = copyOf(A); B.walls.find(w => w.id === 'wfx003').t = 30;
  const r = cmp(A, B), e = E(r, 'L0/wfx003');
  assert.equal(e.status, 'geometry'); assert.deepEqual(e.changes.map(c => c.key), ['t']);
  assert.equal(e.autoPhase, 'modify'); assert.equal(r.summary.total.walls.new, 0); assert.equal(r.summary.total.walls.demolish, 0);
  // varsayılan kalınlık ile açık değer aynıysa fark yok (t: 0 ↔ meta.wallT)
  const C = copyOf(A), w = C.walls.find(x => x.t === (C.meta.wallT || 15)); if (w) { delete w.t; assert.equal(E(cmp(A, C), `L0/${w.id}`).status, 'unchanged'); }
});

test('4: taşınan duvar (tolerans içi kayma değişiklik sayılmaz)', () => {
  const A = rolove(), B = copyOf(A), w = B.walls.find(x => x.id === 'wfx006');
  w.a = { x: w.a.x + 40, y: w.a.y }; w.b = { x: w.b.x + 40, y: w.b.y };
  assert.deepEqual(E(cmp(A, B), 'L0/wfx006').changes.map(c => c.key), ['a', 'b']);
  const C = copyOf(A), v = C.walls.find(x => x.id === 'wfx006'); v.a = { x: v.a.x + 0.3, y: v.a.y };
  assert.equal(E(cmp(A, C), 'L0/wfx006').status, 'unchanged', '0,3 cm < 0,5 cm tolerans');
});

test('5–6: silinen ve yeni çizilen duvar; önerilen kaldırma kesin karar değildir', () => {
  const A = rolove(), B = copyOf(A);
  B.walls = B.walls.filter(w => w.id !== 'wfx004'); B.walls.push({ id: 'wYENI', a: { x: 0, y: 900 }, b: { x: 300, y: 900 }, t: 15 });
  const r = cmp(A, B);
  const d = E(r, 'L0/wfx004'); assert.equal(d.status, 'removed'); assert.equal(d.autoPhase, 'demolish'); assert.equal(d.decision, null, 'öneri, onay yok');
  const n = E(r, 'L0/wYENI'); assert.equal(n.status, 'added'); assert.equal(n.phase, 'new');
  assert.equal(r.summary.total.walls.demolish, 1); assert.equal(r.summary.total.walls.new, 1);
});

test('7: aynı konumda farklı kimlikle yeniden çizilen duvar otomatik eşleşmez; öneri üretilir; onaylı eşleştirme uygulanır', () => {
  const A = rolove(), B = copyOf(A), w = B.walls.find(x => x.id === 'wfx005');
  w.id = 'wYENIDEN';
  const r = cmp(A, B);
  assert.equal(E(r, 'L0/wfx005').status, 'removed'); assert.equal(E(r, 'L0/wYENIDEN').status, 'added');
  const s = r.suggestions.find(x => x.src === 'wfx005'); assert.ok(s && s.dst === 'wYENIDEN' && s.score > 0.9, JSON.stringify(r.suggestions));
  // kullanıcı onayı (komut) → eşleşir, değişmeyen olur
  const m = runCommand(B, { op: 'matchElements', level: 'L0', src: 'wfx005', dst: 'wYENIDEN' }); assert.equal(m.ok, true);
  const r2 = cmp(A, B), e = E(r2, 'L0/wYENIDEN');
  assert.equal(e.status, 'unchanged'); assert.equal(e.manual, true); assert.equal(e.srcId, 'wfx005'); assert.ok(!E(r2, 'L0/wfx005'));
});

test('geçersiz / belirsiz eşleştirmeler sessizce kabul edilmez', () => {
  const A = rolove(), B = copyOf(A);
  B.meta.revision = { matches: [{ level: 'L0', src: 'yok', dst: 'wfx001' }, { level: 'L0', src: 'wfx001', dst: 'ofx00e' }, { level: 'lvYOK', src: 'a', dst: 'b' }] };
  const r = cmp(A, B);
  assert.equal(r.invalidMatches.length, 3, JSON.stringify(r.invalidMatches));
  assert.ok(r.invalidMatches.every(m => m.reason));
  assert.equal(E(r, 'L0/wfx001').manual, false, 'uygulanmadı');
  // sınıf farklı eşleştirme
  const C = copyOf(A); C.walls.find(x => x.id === 'wfx005').id = 'wX'; C.openings.find(o => o.id === 'ofx00f').id = 'oX';
  C.meta.revision = { matches: [{ level: 'L0', src: 'wfx005', dst: 'oX' }] };
  assert.match(cmp(A, C).invalidMatches[0].reason, /sınıfları farklı/);
});

test('8: farklı katta aynı kimlik yanlış eşleşmez (güvenle eşleştirilemeyen)', () => {
  const A = rolove(), B = copyOf(A);
  const w = B.walls.find(x => x.id === 'wfx002'); B.walls = B.walls.filter(x => x !== w); B.levels[0].walls.push(w);   // başka kata taşındı
  const r = cmp(A, B);
  assert.equal(E(r, 'L0/wfx002').status, 'uncertain'); assert.equal(E(r, 'lvfx1/wfx002').status, 'uncertain');
  assert.match(E(r, 'L0/wfx002').reason, /başka katta/);
  assert.equal(r.summary.total.uncertain, 2);
  // benzer konumdaki farklı kat elemanları önerilmez
  assert.ok(!r.suggestions.some(s => s.src === 'wfx002' || s.dst === 'wfx002'));
});

test('9–10: yeni ve kaldırılan kapı / pencere', () => {
  const A = rolove(), B = copyOf(A);
  B.openings = B.openings.filter(o => o.id !== 'ofx00e');   // pencere kaldırıldı
  B.openings.push({ id: 'oKAPI', wallId: 'wfx003', type: 'door', pos: 120, w: 90, h: 210, sill: 0 });
  const r = cmp(A, B);
  assert.equal(E(r, 'L0/ofx00e').status, 'removed'); assert.equal(E(r, 'L0/ofx00e').kind, 'window');
  assert.equal(E(r, 'L0/oKAPI').status, 'added'); assert.equal(E(r, 'L0/oKAPI').kind, 'door');
  assert.deepEqual([r.summary.total.windows.removed, r.summary.total.doors.added], [1, 1]);
  const C = copyOf(A); C.openings.find(o => o.id === 'ofx00e').pos += 30; C.openings.find(o => o.id === 'ofx00e').frame = 'antrasit';
  const e = E(cmp(A, C), 'L0/ofx00e'); assert.equal(e.status, 'geometry'); assert.deepEqual(e.changes.map(c => c.key).sort(), ['frame', 'pos']);
});

test('11: mahal alanı değişikliği (alan önce / sonra); mahal duvar bağı listesi anlamsız fark değildir', () => {
  const A = rolove(), B = copyOf(A), r0 = B.rooms.find(x => x.id === 'rfx00m');
  r0.pts = r0.pts.map(p => ({ x: p.x > 200 ? p.x + 50 : p.x, y: p.y }));
  const r = cmp(A, B), e = E(r, 'L0/rfx00m');
  assert.equal(e.status, 'geometry'); assert.ok(e.after.area > e.before.area);
  assert.equal(r.summary.total.rooms.length, 1); assert.equal(r.summary.total.rooms[0].name, r0.name);
  const C = copyOf(A); C.rooms[0].walls = ['başka']; C.rooms[0].name = C.rooms[0].name + ' 2';
  assert.deepEqual(E(cmp(A, C), `L0/${C.rooms[0].id}`).changes.map(c => c.key), ['name']);
});

test('anlamsız farklar: anahtar sırası, zaman / önbellek alanları, _ önekli alanlar değişiklik sayılmaz; sonuç belirlenimci', () => {
  const A = rolove(), B = copyOf(A);
  B.walls = B.walls.map(w => Object.fromEntries(Object.entries(w).reverse()));
  B.walls[0]._cache = { x: 1 }; B.walls[1].updatedAt = Date.now(); B.rooms[0].createdAt = 5;
  const r = cmp(A, B); assert.deepEqual(changed(r), []);
  assert.equal(J(cmp(A, B)), J(r), 'aynı girdi → aynı sonuç');
  // giriş sırası farklı → aynı rapor
  const C = copyOf(A); C.walls.reverse(); C.openings.reverse(); assert.equal(J(cmp(A, C).entries), J(r.entries));
});

test('12–13: iki tasarım alternatifi; kaynak sonradan değişince karşılaştırma güncel kaynaktan', () => {
  const A = rolove(), P1 = copyOf(A), P2 = copyOf(A);
  P1.walls.find(w => w.id === 'wfx003').t = 30;
  P2.walls = P2.walls.filter(w => w.id !== 'wfx003');
  const r = cmp(P1, P2);
  assert.equal(E(r, 'L0/wfx003').status, 'removed'); assert.equal(changed(r).length, 1);
  // kaynak (rölöve) değişti: hedefte olmayan yeni duvar → yalnız kaynakta
  A.walls.push({ id: 'wSONRA', a: { x: 0, y: 1000 }, b: { x: 200, y: 1000 }, t: 15 });
  assert.equal(E(cmp(A, P1), 'L0/wSONRA').status, 'removed');
});

test('kat kotları karşılaştırılır', () => {
  const A = rolove(), B = copyOf(A); B.meta.wallH = 300;
  const r = cmp(A, B), L1 = r.levels.find(l => l.level === 'lvfx1');
  assert.equal(r.levels.find(l => l.level === 'L0').status, 'geometry');
  assert.ok(L1.changes.some(c => c.key === 'z'), 'üst katın kotu da değişir');
});

test('14–15: safha atama / toplu sınıflandırma / eşleştirme / revizyon kodu — her biri tek geri alınabilir işlem', () => {
  const A = rolove(), B = copyOf(A); B.walls = B.walls.filter(w => w.id !== 'wfx004'); B.walls.find(w => w.id === 'wfx005').id = 'wR';
  const H = new History(() => B), j0 = J(B), run = c => { const r = runCommand(B, c); assert.equal(r.ok, true, J(r.errors)); H.record(r.patch, r.label); };
  run({ op: 'setRevisionPhase', keys: ['L0/wfx004'], phase: 'demolish' });
  assert.equal(E(cmp(A, B), 'L0/wfx004').decision, 'demolish');
  run({ op: 'setRevisionPhase', keys: ['L0/wfx001', 'L0/wfx002', 'L0/wfx003'], phase: 'modify' });
  assert.equal(H.undo.length, 2, 'toplu sınıflandırma tek kayıt');
  run({ op: 'matchElements', level: 'L0', src: 'wfx005', dst: 'wR' });
  run({ op: 'setRevisionCode', code: 'R2' });
  assert.equal(B.meta.revision.code, 'R2'); assert.equal(H.undo.length, 4);
  const r = cmp(A, B);
  assert.deepEqual(['L0/wfx001', 'L0/wfx002', 'L0/wfx003'].map(k => E(r, k).phase), ['modify', 'modify', 'modify']);
  H.step('undo'); assert.equal(B.meta.revision.code, undefined);
  H.step('undo'); assert.equal(E(cmp(A, B), 'L0/wR').status, 'added', 'eşleştirme geri alındı');
  H.step('undo'); H.step('undo'); assert.equal(J(B), j0, 'tüm kararlar geri alındı; kayıt biçimi aynı');
  // safhayı öneriye döndürme ve geçersiz safha
  run({ op: 'setRevisionPhase', keys: ['L0/wfx004'], phase: 'new' }); run({ op: 'setRevisionPhase', keys: ['L0/wfx004'], phase: null });
  assert.equal(B.meta.revision, undefined, 'boş karar alanı kayda yazılmaz');
  assert.equal(runCommand(B, { op: 'setRevisionPhase', keys: ['L0/wfx004'], phase: 'yik' }).ok, false);
});

test('17: CSV raporu doğru sayımlar (Excel: BOM, noktalı virgül)', () => {
  const A = rolove(), B = copyOf(A);
  B.walls = B.walls.filter(w => w.id !== 'wfx004'); B.walls.push({ id: 'wYENI', a: { x: 0, y: 900 }, b: { x: 300, y: 900 }, t: 15 }); B.walls.find(w => w.id === 'wfx003').t = 30;
  const r = cmp(A, B), csv = diffCsv(r, { levelNames: { L0: 'Zemin kat', lvfx1: '1. Kat' } });
  assert.ok(csv.startsWith('﻿'));
  const rows = csv.trim().split('\r\n').map(l => l.split(';'));
  assert.equal(rows.length - 1 - 5 - Object.keys(r.summary.levels).length, r.entries.length, 'her eleman bir satır');
  const tot = rows.find(x => x[0] === 'ÖZET' && x[1] === 'Toplam');
  assert.deepEqual(tot.slice(2, 8).map(Number), [A.walls.length + A.levels[0].walls.length, B.walls.length + B.levels[0].walls.length, r.summary.total.walls.kept, 1, 1, 1]);
  assert.match(csv, /imalat metrajı ya da maliyet değildir/);
});

test('16: yıkım planı ilkeleri ve DXF / SVG çıktıları: renk, çizgi tipi, tarama, ölçek korunur', () => {
  const A = rolove(), B = copyOf(A); B.walls = B.walls.filter(w => w.id !== 'wfx004'); B.walls.push({ id: 'wYENI', a: { x: 0, y: 900 }, b: { x: 300, y: 900 }, t: 15 });
  const r = cmp(A, B);
  const dem = revisionPrims(A, B, r, 'L0', { mode: 'demolition' });
  assert.ok(dem.prims.some(q => q.style === 'demolish' && q.t === 'poly' && q.key === 'L0/wfx004'));
  assert.ok(dem.prims.some(q => q.style === 'demolish' && q.hatch), 'yıkım taraması');
  assert.ok(!dem.prims.some(q => q.style === 'new'), 'yıkım planında yeni eleman yok');
  const nw = revisionPrims(A, B, r, 'L0', { mode: 'new' });
  assert.ok(nw.prims.some(q => q.style === 'new' && q.key === 'L0/wYENI') && !nw.prims.some(q => q.style === 'demolish'));
  const only = revisionPrims(A, B, r, 'L0', { mode: 'compare', filter: 'demolish' });
  assert.ok(only.prims.filter(q => q.t === 'poly' && q.style !== 'room').every(q => q.style === 'demolish'));
  const S = revisionSheet(A, B, r, 'L0', { mode: 'demolition', N: 50, project: 'Proje', drawing: 'Rölöve', level: 'Zemin kat', revision: 'R1', description: 'test', company: 'Firma' });
  // SVG: ölçek matrisi 10 / N, renk ve kesik çizgi
  assert.match(S.svg, /matrix\(0\.2 0 0 0\.2 /); assert.ok(S.svg.includes(REV_STYLE.demolish.stroke) && S.svg.includes('stroke-dasharray'));
  for (const t of ['Proje', 'Rölöve', 'Zemin kat', '1:50', 'R1', 'Firma', 'Yıkım / Söküm Planı', 'Lejant']) assert.ok(S.svg.includes(t), t);
  // DXF: katmanlar, renk (ACI), çizgi tipi tablosu, birim mm
  const dxf = revisionDxf(S);
  assert.ok(/LTYPE[\s\S]*DASHED/.test(dxf));
  assert.ok(/\r\nREV-YIKIM\r\n70\r\n0\r\n62\r\n1\r\n6\r\nDASHED/.test(dxf), 'yıkım katmanı kırmızı (1), kesik');
  assert.ok(/\$INSUNITS\r\n70\r\n4/.test(dxf));
  // ölçek: duvar kalınlığı (15 cm) paftada 15 × 10 / 50 = 3 mm
  const w = A.walls.find(x => x.id === 'wfx004'), q = dem.prims.find(p => p.key === 'L0/wfx004' && p.t === 'poly');
  const thick = Math.hypot(q.pts[1][0] - q.pts[2][0], q.pts[1][1] - q.pts[2][1]);
  assert.ok(Math.abs(thick * S.map.k - (w.t || 15) * 10 / 50) < 1e-6);
});

test('18: eski proje dosyası — kaynak / safha bilgisi yokken çalışır; kayıt biçimi değişmez', () => {
  const F = JSON.parse(J(FILE));
  for (const d of F.project.drawings) assert.equal(d.sourceDrawingId, undefined);
  const [A, B] = F.project.drawings.map(d => d.plan), jb = J(B);
  const r = compareDrawings(A, B);
  assert.ok(r.entries.length > 0); assert.deepEqual(r.invalidMatches, []); assert.equal(J(B), jb);
  assert.equal(r.entries.filter(e => e.decision).length, 0);
  assert.equal(J(summarize(r.entries, r.levels)), J(r.summary));
});
