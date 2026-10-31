// B4C — imalat metrajı ve tadilat metraj farkı: elle (analitik) hesaplanmış beklenen değerlerle. node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { drawingQuantities, totalsOf, QTY_STATS } from '../js/bim/quantities.js';
import { quantityDiff, aggregate, costOf, qtyCsv } from '../js/bim/qtydiff.js';
import { runCommand } from '../js/bim/commands.js';
import { History } from '../js/bim/history.js';
import { wallQuantities } from '../js/bim/wallgeom.js';
import { checkLimits, solve } from '../js/bim/solver.js';

const J = o => JSON.stringify(o);
const near = (a, b, m, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${m}: ${a} ≠ ${b}`);
const plan = (walls = [], extra = {}) => ({ v: 1, walls, openings: [], rooms: [], items: [], slabs: [], sections: [], dims: [], labels: [], rails: [], stairs: [], meta: { wallH: 280, wallT: 20 }, levels: [], ...extra });
const W = (id, ax, ay, bx, by, t = 20, o = {}) => ({ id, a: { x: ax, y: ay }, b: { x: bx, y: by }, t, ...o });
const el = (Q, id) => Q.elements.find(e => e.element.endsWith('/' + id));
const rowsOf = (Q, id) => Q.rows.filter(r => r.element.endsWith('/' + id));
const q = (Q, id, item) => rowsOf(Q, id).filter(r => r.item === item || r.item.startsWith(item)).reduce((s, r) => s + r.qty, 0);
const cmd = (R, c) => { const r = runCommand(R, c); assert.equal(r.ok, true, J(r.errors)); return r; };
const line = (agg, pred) => agg.rows.find(pred);

test('1: tek duvar brüt / net alan, boy, hacim (5,00 × 2,80 m, 20 cm)', () => {
  const R = plan([W('w', 0, 0, 500, 0)]), j = J(R), Q = drawingQuantities(R), E = el(Q, 'w').q;
  near(E.L, 5, 'boy'); near(E.T, 0.2, 'kalınlık'); near(E.H, 2.8, 'yükseklik');
  near(E.gross, 14, 'brüt alan'); near(E.net, 14, 'net alan'); near(E.volume, 2.8, 'hacim (5 × 0,2 × 2,8)');
  assert.equal(J(R), j, 'çizim değişmedi');
});

test('2–3: kapı ve pencere boşlukları yalnız duvarı gerçekten etkilediği ölçüde düşülür', () => {
  const R = plan([W('w', 0, 0, 500, 0)]);
  R.openings.push({ id: 'd', wallId: 'w', type: 'door', pos: 150, w: 90, h: 210, sill: 0 });
  let E = el(drawingQuantities(R), 'w').q;
  near(E.net, 14 - 0.9 * 2.1, 'kapı: 14 − 1,89'); near(E.volume, 2.8 - 0.9 * 2.1 * 0.2, 'kapı hacmi'); near(E.gross, 14, 'brüt değişmez');
  R.openings.push({ id: 'p', wallId: 'w', type: 'window', pos: 380, w: 120, h: 140, sill: 90 });
  E = el(drawingQuantities(R), 'w').q;
  near(E.net, 14 - 1.89 - 1.2 * 1.4, 'pencere: − 1,68');
  // duvar yüksekliğini aşan pencere: yalnız duvar içindeki kısım (sill 200 → üst 280'de kesilir, 0,80 m)
  const R2 = plan([W('w', 0, 0, 500, 0)]); R2.openings.push({ id: 'p', wallId: 'w', type: 'window', pos: 250, w: 120, h: 150, sill: 200 });
  near(el(drawingQuantities(R2), 'w').q.net, 14 - 1.2 * 0.8, 'duvar üstünü aşan pencere kırpılır');
});

test('4: farklı duvar kalınlıkları', () => {
  const Q = drawingQuantities(plan([W('a', 0, 0, 500, 0, 10), W('b', 0, 500, 500, 500, 30)]));
  near(el(Q, 'a').q.volume, 5 * 0.1 * 2.8, '10 cm'); near(el(Q, 'b').q.volume, 5 * 0.3 * 2.8, '30 cm');
  near(el(Q, 'b').q.net, 14, 'alan kalınlıktan bağımsız');
});

test('5–6: L ve T birleşiminde çift hacim yok (analitik birleşik alan × yükseklik); wallQuantities ile uzlaşma', () => {
  // L: A (0,0)–(500,0), B (0,0)–(0,400), 20 cm → birleşik plan alanı 510×20 + 20×390 = 18 000 cm²
  const L = plan([W('A', 0, 0, 500, 0), W('B', 0, 0, 0, 400)]), QL = drawingQuantities(L);
  near(el(QL, 'A').q.volume + el(QL, 'B').q.volume, 18000 * 280 / 1e6, 'L hacmi 5,04 m³');
  near(wallQuantities(L, L, L.meta).total, 5.04, 'wallQuantities ile aynı');
  // T: A (0,0)–(600,0), B (300,0)–(300,400) → 600×20 + 20×390 = 19 800 cm²
  const T = plan([W('A', 0, 0, 600, 0), W('B', 300, 0, 300, 400)]), QT = drawingQuantities(T);
  near(el(QT, 'A').q.volume + el(QT, 'B').q.volume, 19800 * 280 / 1e6, 'T hacmi 5,544 m³');
  assert.equal(QT.issues.filter(i => i.code === 'QTY_RECONCILE').length, 0, 'eleman toplamı = wallQuantities');
});

test('7: kompozit katman metrajı (iç tuğla: alçı 2 + tuğla 10 + alçı 2)', () => {
  const R = plan([W('w', 0, 0, 500, 0, 14, { comp: 'ic-tugla' })]), Q = drawingQuantities(R);
  near(q(Q, 'w', 'layer-vol:tugla-yatay'), 5 * 0.10 * 2.8, 'tuğla 1,40 m³');
  near(q(Q, 'w', 'layer-vol:siva-alci'), 5 * 0.04 * 2.8, 'alçı sıva 0,56 m³ (iki yüz)');
  near(q(Q, 'w', 'layer-area:siva-alci'), 2 * 14, 'alçı sıva yüzeyi 28 m² (iki yüz)');
  near(el(Q, 'w').q.volume, q(Q, 'w', 'layer-vol:tugla-yatay') + q(Q, 'w', 'layer-vol:siva-alci'), 'katmanlar toplamı = duvar hacmi');
  assert.equal(rowsOf(Q, 'w').find(r => r.item.startsWith('layer-vol:tugla')).category, 'kagir');
  assert.equal(rowsOf(Q, 'w').find(r => r.item.startsWith('wall-area')).label, 'Yatay delikli tuğla duvar (net yüzey)');
});

test('8: duvar yüksekliği değişince alan ve hacim', () => {
  const R = plan([W('w', 0, 0, 500, 0, 20, { h: 300 })]), E = el(drawingQuantities(R), 'w').q;
  near(E.gross, 15, '5 × 3'); near(E.volume, 3, '5 × 0,2 × 3');
});

test('9: döşeme alanı, kalınlığı ve kompozit katmanları; balkon ayrı kalem', () => {
  const R = plan([], { slabs: [{ id: 's1', pts: [{ x: 0, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 300 }, { x: 0, y: 300 }], t: 15 }, { id: 's2', kind: 'balkon', comp: 'dos-seramik', pts: [{ x: 0, y: 400 }, { x: 200, y: 400 }, { x: 200, y: 500 }, { x: 0, y: 500 }] }] });
  const Q = drawingQuantities(R);
  near(q(Q, 's1', 'slab-area:ara'), 12, '4 × 3'); near(q(Q, 's1', 'slab-volume'), 1.8, '12 × 0,15');
  near(q(Q, 's2', 'slab-area:balkon'), 2, 'balkon 2 m² ayrı kalem');
  near(q(Q, 's2', 'layer-vol:betonarme'), 2 * 0.15, 'balkon betonarme katmanı'); near(q(Q, 's2', 'slab-volume'), 2 * 0.22, 'kompozit kalınlığı 22 cm');
});

test('10: mahal kaplamaları ve açıklık düşüm politikası', () => {
  const R = plan([W('a', 0, 0, 400, 0), W('b', 400, 0, 400, 300), W('c', 400, 300, 0, 300), W('d', 0, 300, 0, 0)]);
  R.rooms.push({ id: 'r', name: 'Oda', floor: 'parke', pts: [{ x: 10, y: 10 }, { x: 390, y: 10 }, { x: 390, y: 290 }, { x: 10, y: 290 }] });
  R.openings.push({ id: 'd', wallId: 'a', type: 'door', pos: 200, w: 90, h: 210, sill: 0 });
  const area = 3.8 * 2.8, per = 2 * (3.8 + 2.8);
  let Q = drawingQuantities(R);
  near(q(Q, 'r', 'room-area'), area, 'net zemin'); near(q(Q, 'r', 'floor:parke'), area, 'zemin kaplaması'); near(q(Q, 'r', 'ceiling'), area, 'tavan');
  near(q(Q, 'r', 'room-perim'), per, 'çevre'); near(q(Q, 'r', 'skirting'), per - 0.9, 'süpürgelik: kapı düşülür');
  near(q(Q, 'r', 'wall-finish'), per * 2.8 - 0.9 * 2.1, 'duvar kaplaması: kapı düşülür (tümü)');
  Q = drawingQuantities(R, { policy: { openings: 'none' } }); near(q(Q, 'r', 'wall-finish'), per * 2.8, 'politika: düşülmez');
  Q = drawingQuantities(R, { policy: { openings: 'over', threshold: 2 } }); near(q(Q, 'r', 'wall-finish'), per * 2.8, 'politika: 1,89 m² < 2 m² eşik → düşülmez');
  Q = drawingQuantities(R, { policy: { openings: 'over', threshold: 1 } }); near(q(Q, 'r', 'wall-finish'), per * 2.8 - 1.89, 'eşik 1 m² → düşülür');
  assert.ok(drawingQuantities(plan([W('w', 0, 0, 100, 0)])).rows.length > 0, 'mahalsiz proje çökmez');
});

/* tadilat: mevcut tuğla duvar → kaynak; hedef değişiklikleri */
const base = () => plan([W('w', 0, 0, 500, 0, 14, { comp: 'ic-tugla' }), W('k', 0, 600, 500, 600, 20)]);
const aggOf = (A, B) => aggregate(quantityDiff(A, B).lines);
const AREA_T = r => r.item === 'wall-area:tugla-yatay', AREA_G = r => r.item === 'wall-area:gazbeton-600';

test('11: mevcut duvarın tamamen kaldırılması — onaylı yıkım kesin, onaysız bekleyen', () => {
  const A = base(), B = JSON.parse(J(A)); B.walls = B.walls.filter(w => w.id !== 'w');
  let r = line(aggOf(A, B), AREA_T);
  near(r.before, 14, 'mevcut'); near(r.after, 0, 'yeni'); near(r.net, -14, 'net'); near(r.demolish, 0, 'onaysız → kesin söküm 0'); near(r.demolishPending, 14, 'bekleyen');
  cmd(B, { op: 'setRevisionPhase', keys: ['L0/w'], phase: 'demolish' });
  r = line(aggOf(A, B), AREA_T); near(r.demolish, 14, 'onaylı söküm 14 m²'); near(r.build, 0, 'imalat yok');
});

test('12: yeni duvar eklenmesi', () => {
  const A = base(), B = JSON.parse(J(A)); B.walls.push(W('n', 0, 900, 300, 900, 13, { comp: 'ic-gazbeton' }));
  cmd(B, { op: 'setRevisionPhase', keys: ['L0/n'], phase: 'new' });
  const r = line(aggOf(A, B), AREA_G); near(r.build, 3 * 2.8, 'yeni imalat 8,40 m²'); near(r.net, 8.4, 'net +8,40'); near(r.demolish, 0, 'söküm yok');
});

test('13: kısmi tadilat kararı (duvar 5,00 → 4,00 m): yöntem seçilmeden kesin toplama girmez', () => {
  const A = base(), B = JSON.parse(J(A)); B.walls.find(w => w.id === 'w').b.x = 400;
  let r = line(aggOf(A, B), AREA_T);
  near(r.net, -2.8, 'net −2,80'); near(r.demolish, 0, 'yöntem yok → kesin 0'); near(r.demolishPending, 2.8, 'kısmi senaryo tahmini');
  cmd(B, { op: 'setInterventionMethod', keys: ['L0/w'], method: 'partial' });
  r = line(aggOf(A, B), AREA_T); near(r.demolish, 2.8, 'kısmi: fark kadar söküm'); near(r.build, 0, 'imalat yok');
  cmd(B, { op: 'setInterventionMethod', keys: ['L0/w'], method: 'replace' });
  r = line(aggOf(A, B), AREA_T); near(r.demolish, 14, 'tamamen: söküm 14'); near(r.build, 11.2, 'imalat 11,20'); near(r.net, -2.8, 'net değişmez');
  cmd(B, { op: 'setInterventionMethod', keys: ['L0/w'], method: 'surface' });
  const agg = aggOf(A, B);
  near(line(agg, AREA_T).demolish, 0, 'yüzey: yapı kalemine dokunulmaz');
  near(line(agg, x => x.item === 'layer-area:siva-alci').demolish, 28, 'yüzey: sıva sökümü 28 m²'); near(line(agg, x => x.item === 'layer-area:siva-alci').build, 22.4, 'sıva imalatı 22,4 m²');
});

test('14: farklı malzemeyle yenileme (tuğla 10 m² → gazbeton 12 m², tamamen yeniden): söküm, imalat ve net ayrı', () => {
  const A = plan([W('w', 0, 0, 357.142857142857, 0, 14, { comp: 'ic-tugla' })]);   // 3,5714 × 2,8 = 10 m²
  const B = plan([W('w', 0, 0, 428.571428571429, 0, 13, { comp: 'ic-gazbeton' })]);   // 4,2857 × 2,8 = 12 m²
  cmd(B, { op: 'setRevisionPhase', keys: ['L0/w'], phase: 'modify' });
  cmd(B, { op: 'setInterventionMethod', keys: ['L0/w'], method: 'replace' });
  const agg = aggOf(A, B), t = line(agg, AREA_T), g = line(agg, AREA_G);
  near(t.before, 10, 'tuğla mevcut 10', 1e-9); near(t.demolish, 10, 'tuğla sökümü 10', 1e-9); near(t.build, 0, 'tuğla imalatı 0');
  near(g.after, 12, 'gazbeton yeni 12', 1e-9); near(g.build, 12, 'gazbeton imalatı 12', 1e-9); near(g.demolish, 0, 'gazbeton sökümü 0');
  near(g.net + t.net, 2, 'geometrik net alan +2,00', 1e-9);
});

test('15: bölünen duvar (1 → 2) ve birleşen duvarlar: kalem toplamı fiziksel miktara göre', () => {
  const A = plan([W('w', 0, 0, 500, 0)]), B = plan([W('w1', 0, 0, 250, 0), W('w2', 250, 0, 500, 0)]);
  const agg = aggOf(A, B), r = line(agg, x => x.item === 'wall-area:');
  near(r.before, 14, 'mevcut 14'); near(r.after, 14, 'bölünmüş toplam 14'); near(r.net, 0, 'net 0 (eleman adedi farklı)');
  near(line(agg, x => x.item === 'wall-volume').net, 0, 'hacim net 0');
  const r2 = line(aggOf(B, A), x => x.item === 'wall-area:'); near(r2.net, 0, 'birleşme: net 0');
});

test('16: doğrama sökümü ve montajı ayrı', () => {
  const A = plan([W('w', 0, 0, 500, 0)]); A.openings.push({ id: 'd', wallId: 'w', type: 'door', pos: 150, w: 90, h: 210, sill: 0 });
  const B = plan([W('w', 0, 0, 500, 0)]); B.openings.push({ id: 'p', wallId: 'w', type: 'window', pos: 350, w: 120, h: 140, sill: 90 });
  cmd(B, { op: 'setRevisionPhase', keys: ['L0/d'], phase: 'demolish' }); cmd(B, { op: 'setRevisionPhase', keys: ['L0/p'], phase: 'new' });
  const agg = aggOf(A, B);
  const d = line(agg, x => x.item === 'door:90×210'), p = line(agg, x => x.item === 'window:120×140');
  assert.deepEqual([d.before, d.after, d.demolish, d.build], [1, 0, 1, 0]); assert.deepEqual([p.before, p.after, p.demolish, p.build], [0, 1, 0, 1]);
  near(line(agg, x => x.item === 'door-area').demolish, 1.89, 'söküm alanı');
});

test('17–18: kat toplamları ve proje genel toplamı (yuvarlama olmadan birebir)', () => {
  const R = plan([W('a', 0, 0, 333.3, 0), W('b', 0, 300, 177.7, 300)]);
  R.levels.push({ id: 'k1', kind: 'floor', name: '1. Kat', slab: 15, walls: [W('c', 0, 0, 411.1, 0), W('d', 0, 300, 123.4, 300)], openings: [], rooms: [], items: [], slabs: [], stairs: [], rails: [], meta: { wallH: 300 } });
  const Q = drawingQuantities(R), T = Q.totals, item = T.project.find(x => x.item === 'wall-volume');
  near(T.levels.L0.find(x => x.item === 'wall-volume').qty, (3.333 + 1.777) * 0.2 * 2.8, 'zemin kat', 1e-9);
  near(T.levels.k1.find(x => x.item === 'wall-volume').qty, (4.111 + 1.234) * 0.2 * 3.0, '1. kat (300 cm)', 1e-9);
  assert.equal(item.qty, T.levels.L0.find(x => x.item === 'wall-volume').qty + T.levels.k1.find(x => x.item === 'wall-volume').qty, 'proje = katlar toplamı (birebir)');
  const t2 = totalsOf(Q.rows); assert.equal(J(t2), J(T), 'belirlenimci');
});

test('19: CSV — BOM, noktalı virgül, ondalık virgül, birim, grup ve toplam satırları, fiyat girilmemiş', () => {
  const A = base(), B = JSON.parse(J(A)); B.walls = B.walls.filter(w => w.id !== 'w');
  cmd(B, { op: 'setRevisionPhase', keys: ['L0/w'], phase: 'demolish' });
  const agg = aggOf(A, B), csv = qtyCsv(agg, { prices: { 'wall-area:tugla-yatay|demolish': 45.5 }, currency: 'TRY', vat: 'excl', title: 'Test' });
  assert.ok(csv.startsWith('﻿'));
  const rows = csv.trim().split('\r\n').map(l => l.split(';'));
  const t = rows.find(r => r[1] === 'Yatay delikli tuğla duvar (net yüzey)');
  assert.deepEqual(t.slice(2, 8), ['m²', '14,000', '0,000', '-14,000', '14,000', '0,000']);
  assert.equal(t[12], '637,000', '14 × 45,5 = 637');
  const tw = rows.find(r => r[0] === 'Duvar TOPLAM' && r[1] === 'Toplam net duvar yüzeyi');
  assert.ok(tw && tw[2] === 'm²' && tw[3] === '28,000', 'grup toplamı: yalnız aynı ölçü ailesi (net yüzey: tuğla 14 + diğer 14 = 28), brüt eklenmez');
  assert.ok(!rows.some(r => r[0] === 'Duvar TOPLAM' && r[1] === '' ), 'karışık birim / ölçü toplamı yok');
  assert.ok(rows.some(r => r[12] === 'fiyat girilmedi'), 'fiyatsız kalem 0 değil');
  assert.match(csv, /GENEL TOPLAM TUTAR;.*eksik fiyat var/);
  assert.match(rows[1][12], /KDV hariç/);
  assert.equal(costOf({ build: 2, demolish: 0, item: 'x' }, {}).missing, true);
});

test('21: müdahale, fiyat ve ayarlar tek geri alınabilir işlem', () => {
  const B = base(), H = new History(() => B), j0 = J(B), run = c => { const r = runCommand(B, c); assert.equal(r.ok, true, J(r.errors)); H.record(r.patch, r.label); };
  run({ op: 'setInterventionMethod', keys: ['L0/w', 'L0/k'], method: 'replace' });
  run({ op: 'setQtyPrice', item: 'wall-area:tugla-yatay', kind: 'build', price: 650 });
  run({ op: 'setQtySettings', currency: 'EUR', vat: 'incl', openings: 'over', threshold: 1.5 });
  assert.deepEqual(B.meta.revision.qty, { currency: 'EUR', openings: 'over', prices: { 'wall-area:tugla-yatay|build': 650 }, threshold: 1.5, vat: 'incl' });
  assert.equal(H.undo.length, 3);
  H.step('undo'); H.step('undo'); assert.equal(B.meta.revision.qty, undefined); H.step('undo'); assert.equal(J(B), j0);
  H.step('redo'); H.step('redo'); assert.equal(B.meta.revision.qty.prices['wall-area:tugla-yatay|build'], 650);
  for (const bad of [{ op: 'setInterventionMethod', keys: ['L0/w'], method: 'yik' }, { op: 'setQtyPrice', item: 'x', price: -1 }, { op: 'setQtySettings', vat: 'x' }]) assert.equal(runCommand(B, bad).ok, false);
});

test('23: eski proje dosyası — metraj çökmez, kayıt değişmez, uzlaşma', () => {
  const F = JSON.parse(readFileSync(new URL('./fixtures/eski-proje-v1.saggcad.json', import.meta.url), 'utf8'));
  const [A, B] = F.project.drawings.map(d => d.plan), ja = J(A), jb = J(B);
  const Q = drawingQuantities(A); assert.ok(Q.rows.length > 50);
  assert.equal(Q.issues.filter(i => i.code === 'QTY_RECONCILE').length, 0, 'duvar hacmi = wallQuantities');
  const D = quantityDiff(A, B); assert.ok(D.lines.length > 0);
  assert.equal(J(A), ja); assert.equal(J(B), jb);
  assert.ok(Q.elements.find(e => e.element === 'L0/ofxorphan').status === 'warning', 'sahipsiz açıklık uyarılı');
});

test('24: artımlı ↔ tam metraj eşitliği (düzenleme dizisi), önbellek kullanılır', () => {
  const R = plan([W('a', 0, 0, 500, 0, 14, { comp: 'ic-tugla' }), W('b', 500, 0, 500, 400), W('c', 0, 0, 0, 400), W('d', 0, 400, 500, 400)]);
  R.openings.push({ id: 'o', wallId: 'a', type: 'door', pos: 250, w: 90, h: 210, sill: 0 });
  const sig = Q => J(Q.rows.map(r => [r.element, r.item, r.qty === null ? null : +r.qty.toFixed(9), r.status]));
  drawingQuantities(R);
  const r0 = QTY_STATS.reused;
  const edits = [P => { P.walls[1].t = 25; }, P => { P.openings[0].pos = 200; }, P => { P.walls[3].h = 300; }, P => { P.walls[0].comp = 'ic-gazbeton'; P.walls[0].t = 13; }, P => { P.walls[2].b.y = 450; P.walls[3].a.y = 450; }];
  for (const f of edits) { f(R); assert.equal(sig(drawingQuantities(R)), sig(drawingQuantities(R, { full: true })), 'artımlı = tam'); }
  assert.ok(QTY_STATS.reused > r0, `değişmeyen duvar sonuçları yeniden kullanıldı (${QTY_STATS.reused - r0})`);
});

test('hata durumları: eksik / bozuk malzeme, çakışan duvar, yay duvar, belirsiz karar', () => {
  // eksik kompozit
  let Q = drawingQuantities(plan([W('w', 0, 0, 500, 0, 20, { comp: 'YOK-KOMPOZIT' })]));
  assert.equal(el(Q, 'w').status, 'warning'); assert.match(el(Q, 'w').note, /Kompozit bulunamadı/);
  // bozuk malzeme: proje kompozitinde tanımsız malzeme
  const R = plan([W('w', 0, 0, 500, 0, 15, { comp: 'ozel' })]); R.meta.composites = [{ k: 'ozel', t: 'Özel', layers: [['tanimsiz-mlz', 15]] }];
  Q = drawingQuantities(R); assert.equal(el(Q, 'w').status, 'warning'); assert.match(el(Q, 'w').note, /tanımsız/);
  // çakışan (tekrar çizilmiş) duvar: hacim bir kez
  Q = drawingQuantities(plan([W('a', 0, 0, 500, 0), W('b', 0, 0, 500, 0)]));
  near(el(Q, 'a').q.volume + el(Q, 'b').q.volume, 2.8, 'üst üste iki duvar → hacim tek (2,8 m³)');
  assert.ok([el(Q, 'a'), el(Q, 'b')].some(e => e.status === 'warning' && /Çakışan/.test(e.note)));
  // yay duvar: 0 değil "hesaplanamadı"
  const arc = plan([W('y0', 0, 0, 100, 40, 20, { arc: { id: 'A', i: 0, off: 0 } }), W('y1', 100, 40, 200, 0, 20, { arc: { id: 'A', i: 1, off: 0 } })]);
  Q = drawingQuantities(arc);
  assert.equal(el(Q, 'y0').status, 'unknown'); assert.match(el(Q, 'y0').note, /hesaplanamadı/);
  assert.ok(rowsOf(Q, 'y0').every(r => r.qty === null), 'miktar null (0 değil)');
  const agg = aggregate(quantityDiff(arc, arc).lines); assert.ok(agg.rows.find(r => r.item === 'wall-unknown').unknown > 0);
  // belirsiz karar: farklı katta aynı kimlik → kesin toplama girmez
  const A2 = base(), B2 = JSON.parse(J(A2)); const w = B2.walls.find(x => x.id === 'w'); B2.walls = B2.walls.filter(x => x !== w);
  B2.levels.push({ id: 'k1', kind: 'floor', slab: 15, walls: [w], openings: [], rooms: [], items: [], slabs: [], meta: {} });
  const D = quantityDiff(A2, B2), lw = D.lines.filter(l => l.key.endsWith('/w'));
  assert.ok(lw.length && lw.every(l => l.demolish === 0 && l.build === 0 && l.status === 'uncertain'));
  assert.ok(D.pending.some(p => p.reason === 'güvenle eşleştirilemedi'));
});

test('MAX: tasarım sınırları — aşımlar raporlanır, değer değişmez; geri alınabilir', () => {
  const R = plan([W('a', 0, 0, 600, 0, 20, { h: 320 }), W('b', 0, 0, 0, 300, 35)]);
  R.openings.push({ id: 'o', wallId: 'a', type: 'door', pos: 300, w: 250, h: 210, sill: 0 });
  R.rooms.push({ id: 'r', name: 'Salon', pts: [{ x: 0, y: 0 }, { x: 600, y: 0 }, { x: 600, y: 500 }, { x: 0, y: 500 }] });
  const H = new History(() => R), r = runCommand(R, { op: 'setDesignLimits', limits: { maxWallHeight: 300, maxWallLength: 550, maxWallThickness: 30, maxOpeningWidth: 200, maxRoomArea: 25, maxLevels: 1, maxBuildingHeight: 400 } });
  assert.equal(r.ok, true); H.record(r.patch, r.label);
  const j = J(R), V = checkLimits(R).map(v => v.code).sort();
  assert.deepEqual(V, ['LIMIT_OPENINGWIDTH', 'LIMIT_ROOMAREA', 'LIMIT_WALLHEIGHT', 'LIMIT_WALLLENGTH', 'LIMIT_WALLTHICKNESS']);
  assert.equal(J(R), j, 'denetim çizimi değiştirmez');
  assert.equal(solve(R).conflicts.filter(c => c.code.startsWith('LIMIT_')).length, 5, 'Model Sağlığı (çözücü) raporlar');
  assert.equal(runCommand(R, { op: 'setDesignLimits', limits: { maxXYZ: 3 } }).ok, false);
  assert.equal(runCommand(R, { op: 'setDesignLimits', limits: { maxLevels: -1 } }).ok, false);
  H.step('undo'); assert.equal(R.meta.limits, undefined); assert.deepEqual(checkLimits(R), []);
});
