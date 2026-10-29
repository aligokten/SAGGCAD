// B2B-3 — duvar hareketi, açıklık ilişkileri, mahal sınırı: node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runCommand, planCommand, applyPatch } from '../js/bim/commands.js';
import { analyzeJoins } from '../js/bim/joins.js';
import { levelWallGeometry, overlapReport } from '../js/bim/wallgeom.js';
import { polyArea } from '../js/plan-geom.js';

const FILE = JSON.parse(readFileSync(new URL('./fixtures/eski-proje-v1.saggcad.json', import.meta.url), 'utf8'));
const root = () => JSON.parse(JSON.stringify(FILE.project.drawings[0].plan));
const wall = (R, id) => [R, ...R.levels].flatMap(P => P.walls).find(w => w.id === id);
const op = (R, id) => [R, ...R.levels].flatMap(P => P.openings).find(o => o.id === id);
const ok = r => { assert.equal(r.ok, true, JSON.stringify(r.errors)); assert.equal(r.applied, true); return r; };

test('duvar ucunu taşıma: birleşen uçlar birlikte, geri alma birebir', () => {
  const R = root(), j0 = JSON.stringify(R);
  const r = ok(runCommand(R, { op: 'moveWallEnd', id: 'wfx001', end: 'b', to: { x: 557.5, y: -7.5 } }));
  assert.deepEqual(wall(R, 'wfx001').b, { x: 557.5, y: -7.5 });
  assert.deepEqual(wall(R, 'wfx002').a, { x: 557.5, y: -7.5 }, 'L / T düğümündeki uçlar birlikte');
  assert.deepEqual(wall(R, 'wfx005').a, { x: 557.5, y: -7.5 });
  assert.ok(r.summary.walls.includes('wfx002'));
  applyPatch(R, r.patch, 'undo'); assert.equal(JSON.stringify(R), j0);
  applyPatch(R, r.patch, 'redo'); assert.deepEqual(wall(R, 'wfx001').b, { x: 557.5, y: -7.5 });
  // bağlantısız taşıma: yalnız bu uç
  const R2 = root(); ok(runCommand(R2, { op: 'moveWallEnd', id: 'wfx001', end: 'b', to: { x: 557.5, y: -7.5 }, connected: false }));
  assert.deepEqual(wall(R2, 'wfx002').a, { x: 527.5, y: -7.5 });
});

test('açıklıklar duvarla birlikte hareket eder; uzunlukta sabit uca uzaklık korunur', () => {
  const R = root(), o0 = { ...op(R, 'ofx00e') };   // wfx001 üzerinde pencere, pos 260
  ok(runCommand(R, { op: 'offsetWall', id: 'wfx001', d: -30 }));   // duvarın tamamı (n yönünde) taşındı
  assert.equal(op(R, 'ofx00e').pos, o0.pos, 'ötelemede konum aynı');
  assert.deepEqual(wall(R, 'wfx001').a, { x: -7.5, y: -37.5 });
  assert.deepEqual(wall(R, 'wfx004').b, { x: -7.5, y: -37.5 }, 'birleşen duvar ucu izler');
  const R2 = root();
  ok(runCommand(R2, { op: 'setWallLength', id: 'wfx001', length: 600, anchor: 'b' }));   // b sabit: başlangıç 65 cm geri
  assert.equal(op(R2, 'ofx00e').pos, 260 + 65, 'b sabitken b ucuna uzaklık korunur');
  const R3 = root(); ok(runCommand(R3, { op: 'setWallLength', id: 'wfx001', length: 600, anchor: 'a' }));
  assert.equal(op(R3, 'ofx00e').pos, 260);
  // birleşen duvarın açıklığı: wfx005 (a ucu düğümde) üzerindeki pencere b ucuna uzaklığını korur
  const R4 = root(), p5 = op(R4, 'ofx00g').pos;
  ok(runCommand(R4, { op: 'moveWallEnd', id: 'wfx001', end: 'b', to: { x: 507.5, y: -7.5 } }));
  assert.equal(op(R4, 'ofx00g').pos, p5 + 20);
});

test('duvara sığmayan açıklık: komut reddedilir, veri değişmez', () => {
  const R = root(), j0 = JSON.stringify(R);
  const r = runCommand(R, { op: 'setWallLength', id: 'wfx001', length: 300 });
  assert.equal(r.ok, false); assert.match(r.errors[0], /ofx00e.*sığmıyor/);
  const r2 = runCommand(R, { op: 'moveWallEnd', id: 'wfx001', end: 'a', to: { x: 300, y: -7.5 } });
  assert.equal(r2.ok, false);
  assert.equal(runCommand(R, { op: 'setWallLength', id: 'wfx001', length: 0 }).ok, false);
  assert.equal(runCommand(R, { op: 'moveWallEnd', id: 'wfx001', end: 'c', to: { x: 0, y: 0 } }).ok, false);
  assert.equal(runCommand(R, { op: 'offsetWall', id: 'ofx00e', d: 10 }).ok, false, 'duvar olmayan eleman');
  assert.equal(JSON.stringify(R), j0);
});

test('mahal sınırı: değişen kenar duvarı izler, ad / kimlik / kaplama korunur; belirsiz mahal değişmez', () => {
  const R = root(), salon0 = JSON.parse(JSON.stringify(R.rooms[0]));
  const r = ok(runCommand(R, { op: 'offsetWall', id: 'wfx002', d: -50 }));   // salon–mutfak ortak duvarı 50 cm doğuya
  const s = R.rooms[0], m = R.rooms[1];
  assert.deepEqual(s.pts.map(p => [p.x, p.y]), [[0, 0], [570, 0], [570, 420], [0, 420]]);
  assert.equal(s.id, salon0.id); assert.equal(s.name, 'Salon'); assert.equal(s.floor, salon0.floor); assert.deepEqual(s.walls, salon0.walls); assert.equal(s.rect, true);
  assert.equal(m.pts[0].x, 585, 'mutfak batı kenarı (ortak duvar, boş yuva) eksene 7,5 cm uzaklığı koruyarak');
  assert.ok(Math.abs(Math.abs(polyArea(s.pts)) / 1e4 - 5.7 * 4.2) < 1e-9);
  assert.deepEqual(r.summary.rooms.updated.sort(), ['rfx00m', 'rfx00n']);
  // kapalı olmayan / belirsiz sınır: iki aday duvar eşit uzaklıkta → mahal değiştirilmez, raporlanır
  const R2 = root();
  R2.walls.push({ id: 'wDUP', a: { x: 542.5, y: -7.5 }, b: { x: 542.5, y: 427.5 }, t: 15, h: 0 });   // mutfak batı kenarına ikinci aday
  R2.rooms[1].walls = [null, null, null, null];
  const m0 = JSON.stringify(R2.rooms[1].pts), r2 = ok(runCommand(R2, { op: 'offsetWall', id: 'wfx002', d: -10 }));
  assert.equal(JSON.stringify(R2.rooms[1].pts), m0);
  assert.ok(r2.warnings.some(w => /Mahal sınırı güncellenmedi/.test(w)) || !r2.summary.rooms.updated.includes('rfx00n'));
});

test('T teması koparsa uyarı; referans çizgisi geometriyi değiştirmez; otomatik birleşim kapatılır / açılır', () => {
  const P = { v: 1, walls: [{ id: 'h', a: { x: 0, y: 0 }, b: { x: 600, y: 0 }, t: 20 }, { id: 's', a: { x: 300, y: 0 }, b: { x: 300, y: 300 }, t: 10 }], openings: [], rooms: [], items: [], levels: [], meta: { wallT: 20, wallH: 280 } };
  const r = ok(runCommand(P, { op: 'offsetWall', id: 'h', d: -40 }));
  assert.ok(r.warnings.some(w => /T bağlantısı koptu/.test(w)));
  const P2 = JSON.parse(JSON.stringify(P)); P2.walls[0].a = { x: 0, y: 0 }; P2.walls[0].b = { x: 600, y: 0 };
  const g0 = JSON.stringify(P2.walls[1]);
  ok(runCommand(P2, { op: 'setWallReference', id: 's', ref: 'face+' })); assert.equal(P2.walls[1].face, 1);
  const { face, ...rest } = P2.walls[1]; assert.equal(JSON.stringify(rest), g0, 'koordinatlar aynı');
  ok(runCommand(P2, { op: 'setWallReference', id: 's', ref: 'axis' })); assert.equal(P2.walls[1].face, undefined);
  P2.walls[1].a = { x: 300, y: 0 };
  assert.equal(analyzeJoins(P2).joins.length, 1);
  ok(runCommand(P2, { op: 'setJoinEnabled', id: 's', end: 'a', enabled: false })); assert.deepEqual(P2.walls[1].joinOff, ['a']);
  assert.equal(analyzeJoins(P2).joins.length, 0, 'kapatılan birleşim');
  ok(runCommand(P2, { op: 'setJoinEnabled', id: 's', end: 'a', enabled: true })); assert.equal(P2.walls[1].joinOff, undefined);
  assert.equal(analyzeJoins(P2).joins.length, 1);
});

test('hareket sonrası birleşim geometrisi yeniden hesaplanır, çakışma oluşmaz', () => {
  // örnek dosyada aynı doğruda tekrar çizilmiş duvarlar var (wfx003 / wfx00b): raporlanır ve son geometride ayrıştırılır
  const R = root(), base = levelWallGeometry(R, R);
  assert.ok(base.issues.some(i => i.code === 'OVERLAP' && i.ids.includes('wfx00b')));
  ok(runCommand(R, { op: 'offsetWall', id: 'wfx002', d: -50 }));
  ok(runCommand(R, { op: 'setInstanceParam', id: 'wfx002', key: 'thickness', value: 35 }));
  const g = levelWallGeometry(R, R);
  assert.deepEqual(overlapReport(g), []);
  assert.ok(g.diag.resolved.every(r => ['wfx00b', 'wfx008', 'wfx00c'].includes(r.lose) || ['wfx00b'].includes(r.keep)), JSON.stringify(g.diag.resolved));
});

test('çoklu katta BIM komutları geri alınır (üst kat duvarı)', () => {
  const R = root(), j0 = JSON.stringify(R), patches = [];
  patches.push(ok(runCommand(R, { op: 'offsetWall', id: 'wfxu2', d: 20 })).patch);   // dik duvar, normal (−1, 0): x − 20
  assert.equal(wall(R, 'wfxu1').b.x, 480, 'üst katta wfxu2 ötelemesi bağlı wfxu1 ucunu da taşıdı');
  patches.push(ok(runCommand(R, { op: 'setWallLength', id: 'wfxu1', length: 450 })).patch);
  assert.equal(wall(R, 'wfxu1').b.x, 450); assert.deepEqual(wall(R, 'wfxu2').a, { x: 450, y: 0 });
  assert.equal(op(R, 'ofxu1').pos, 200, 'kapı başlangıç ucuna uzaklığını korudu');
  patches.push(ok(runCommand(R, { op: 'setInstanceParam', id: 'wfx001', key: 'thickness', value: 30 })).patch);
  assert.equal(R.levels[0].walls[0].id, 'wfxu1');
  for (const p of patches.reverse()) applyPatch(R, p, 'undo');
  assert.equal(JSON.stringify(R), j0);
  const p = planCommand(R, { op: 'offsetWall', id: 'wfxu2', d: 20 }); assert.ok(p.patch.every(e => e.lv === 1), 'yama üst katı hedefliyor');
});
