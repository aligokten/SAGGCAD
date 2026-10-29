// B2B-2 — kompozit katman temizliği ve ortak duvar geometrisi: node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import { levelWallGeometry, overlapReport, piecesArea, wallOutline, wallQuantities, layerPrio } from '../js/bim/wallgeom.js';
import { area, lineX, sub, add, mul, perp, norm } from '../js/bim/geom2d.js';
import { compOf, compThickness, COMPOSITES } from '../js/materials.js';

const W = (id, ax, ay, bx, by, t, comp, x = {}) => ({ id, a: { x: ax, y: ay }, b: { x: bx, y: by }, t, h: 0, ...(comp ? { comp } : {}), ...x });
const geo = (walls, R = { meta: {} }) => levelWallGeometry(R, { walls, openings: [], meta: { wallT: 20, wallH: 280 } });
const total = g => [...g.walls.values()].reduce((s, S) => s + S.layers.reduce((q, l) => q + piecesArea(l.pieces), 0), 0);
const layerArea = (g, id, mat) => g.walls.get(id).layers.filter(l => l.mat === mat).reduce((s, l) => s + piecesArea(l.pieces), 0);
/* çakışma yok: hem birleşim kurallarının ham çıktısında hem son geometride */
const noOverlap = (g, m = '') => { assert.deepEqual(g.diag.rawOverlaps, [], `ham ${m}`); assert.deepEqual(overlapReport(g), [], m); assert.equal(g.diag.resolved.length, 0, m); };
const close = (a, b, e = 1e-6, m = '') => assert.ok(Math.abs(a - b) <= e * Math.max(1, Math.abs(b)), `${m} ${a} ≠ ${b}`);
/* kontur kapalı mı: her uç noktası tam iki kontur parçasında */
function closedContour(g) {
  const { contour } = wallOutline(g), key = p => `${p.x.toFixed(3)},${p.y.toFixed(3)}`, deg = new Map();
  for (const [a, b] of contour) for (const p of [a, b]) deg.set(key(p), (deg.get(key(p)) || 0) + 1);
  return [...deg.values()].every(n => n % 2 === 0);
}
/* L için beklenen dış hat: serbest uç köşeleri + dış köşe + iç köşe (her açıda) */
function lOutline(A, B, ta, tb) {
  const u1 = norm(sub(A.b, A.a)), u2 = norm(sub(B.b, B.a)), n1 = perp(u1), n2 = perp(u2);
  const P = (p, n, o) => add(p, mul(n, o));
  const c1 = lineX(P(A.a, n1, ta / 2), u1, P(B.a, n2, tb / 2), u2), c2 = lineX(P(A.a, n1, -ta / 2), u1, P(B.a, n2, -tb / 2), u2);
  return [P(A.a, n1, ta / 2), c1, P(B.b, n2, tb / 2), P(B.b, n2, -tb / 2), c2, P(A.a, n1, -ta / 2)];
}

test('L birleşimi 90°: dış hat alanı korunur, çakışma yok, kontur kapalı, katmanlar köşeyi sarar', () => {
  const walls = [W('w1', 0, 0, 400, 0, 26.5, 'dis-tugla-eps'), W('w2', 400, 0, 400, 300, 26.5, 'dis-tugla-eps')], g = geo(walls);
  close(total(g), Math.abs(area(lOutline(walls[0], walls[1], 26.5, 26.5))), 1e-9, 'alan');
  close(total(g), 700 * 26.5, 1e-9);
  noOverlap(g); assert.ok(closedContour(g));
  // her malzeme iki duvar boyunca sürekli: aynı malzeme alanı = şerit boyu × kalınlık (dış hat çevresinde)
  const comp = compOf(null, 'dis-tugla-eps');
  for (const [mk, d] of comp.layers) assert.ok(layerArea(g, 'w1', mk) + layerArea(g, 'w2', mk) > 0, mk);
  close(layerArea(g, 'w1', 'tugla-yatay') + layerArea(g, 'w2', 'tugla-yatay'), 19 * (700 - 2 * (26.5 / 2 - (0.5 + 5 + 19 / 2))), 1e-9, 'çekirdek gönye ile buluşur');
});

test('dar (30°, 60°) ve geniş (120°, 150°) açılı L: alan korunumu ve çakışmasızlık', () => {
  for (const deg of [30, 60, 120, 150]) {
    const r = deg * Math.PI / 180, walls = [W('w1', 0, 0, 400, 0, 26.5, 'dis-tugla-eps'), W('w2', 400, 0, 400 - 300 * Math.cos(r), 300 * Math.sin(r), 26.5, 'dis-tugla-eps')], g = geo(walls);
    close(total(g), Math.abs(area(lOutline(walls[0], walls[1], 26.5, 26.5))), 1e-9, `${deg}°`);
    noOverlap(g, `${deg}°`); assert.ok(closedContour(g), `${deg}° kontur`);
  }
});

test('T birleşimi: kol çekirdeği ana duvarın düşük öncelikli katmanlarını geçer, kaplamalar yüzde biter', () => {
  const walls = [W('h', 0, 0, 600, 0, 26.5, 'dis-tugla-eps'), W('s', 300, 0, 300, 300, 14, 'ic-tugla')], g = geo(walls);
  close(total(g), 600 * 26.5 + (300 - 13.25) * 14, 1e-9);
  noOverlap(g); assert.ok(closedContour(g));
  // ana duvarın yakın yüzündeki (kol tarafı) sıva ve EPS, kolun çekirdeği (10 cm) kadar kesildi; ana çekirdek tam
  close(layerArea(g, 'h', 'siva-kirec'), 600 * 0.5 - 10 * 0.5); close(layerArea(g, 'h', 'eps'), 600 * 5 - 10 * 5);
  close(layerArea(g, 'h', 'tugla-yatay'), 600 * 19);
  close(layerArea(g, 's', 'tugla-yatay'), 10 * (300 - 13.25) + 10 * 5.5, 1e-9, 'kol çekirdeği EPS + sıvayı geçti');
});

test('X birleşimi: kesişim hücresi önceliğe göre; perde çekirdeği tuğlayı keser', () => {
  const walls = [W('a', 0, 0, 600, 0, 14, 'ic-tugla'), W('b', 300, -200, 300, 200, 27, 'perde-25', { struct: true })], g = geo(walls);
  close(total(g), 600 * 14 + 400 * 27 - 14 * 27, 1e-9);
  noOverlap(g); assert.ok(closedContour(g));
  close(layerArea(g, 'b', 'betonarme'), 400 * 25, 1e-9, 'perde çekirdeği kesintisiz');
  close(layerArea(g, 'a', 'tugla-yatay'), 600 * 10 - 25 * 10, 1e-9);
  // eğik kesişim (60°)
  const r = Math.PI / 3, g2 = geo([W('a', 0, 0, 600, 0, 14, 'ic-tugla'), W('b', 300 - 200 * Math.cos(r), -200 * Math.sin(r), 300 + 200 * Math.cos(r), 200 * Math.sin(r), 20)]);
  close(total(g2), 600 * 14 + 400 * 20 - 14 * 20 / Math.sin(r), 1e-9); noOverlap(g2);
});

test('aynı doğru (I), farklı kalınlık, serbest uç: çift hacim yok', () => {
  const g = geo([W('a', 0, 0, 300, 0, 20), W('b', 300, 0, 700, 0, 30)]);
  close(total(g), 300 * 20 + 400 * 30, 1e-9, 'I uçları düğümde dik kesilir (eski yarım kalınlık uzatması yok)');
  const g2 = geo([W('w1', 0, 0, 300, 0, 20), W('w2', 300, 0, 300, 220, 35)]);
  close(total(g2), 317.5 * 20 + 230 * 35 - 35 * 20, 1e-9); noOverlap(g2); assert.ok(closedContour(g2));
});

test('farklı kompozit öncelikleri ve taşıyıcı çekirdek: perde ↔ tuğla L köşesi', () => {
  const walls = [W('p', 0, 0, 300, 0, 27, 'perde-25', { struct: true }), W('t', 300, 0, 300, 220, 14, 'ic-tugla')], g = geo(walls);
  assert.equal(layerPrio(null, compOf(null, 'perde-25'), 1, true), 9); assert.equal(layerPrio(null, compOf(null, 'ic-tugla'), 1, false), 7);
  close(total(g), Math.abs(area(lOutline(walls[0], walls[1], 27, 14))), 1e-9); noOverlap(g);
  // perde çekirdeği çekirdek hücresini tümüyle alır (gönye yok) ve tuğla çekirdeğinin dış yüzüne kadar uzanır: 25 × (300 + 5);
  // tuğla duvarın dış sıvası köşeyi sarmaya devam eder (dış kaplama kesintisiz)
  close(layerArea(g, 'p', 'betonarme'), 25 * (300 + 5), 1e-9);
  close(layerArea(g, 't', 'tugla-yatay'), 10 * (220 - 12.5) - 10 * 0 + 0, 1e-9);
});

test('projeye özel katman önceliği davranışı değiştirir; eski kompozitler yeniden yazılmaz', () => {
  const comps = JSON.parse(JSON.stringify(COMPOSITES)), before = JSON.stringify(COMPOSITES);
  const walls = [W('h', 0, 0, 600, 0, 26.5, 'dis-tugla-eps'), W('s', 300, 0, 300, 300, 14, 'ic-tugla')];
  const g0 = geo(walls, { meta: { composites: comps } });
  comps.find(c => c.k === 'dis-tugla-eps').layers[1][2] = 9;   // EPS'yi en yükseğe çek: kol çekirdeği EPS'de durur
  const g1 = geo(walls, { meta: { composites: comps } });
  assert.ok(layerArea(g1, 's', 'tugla-yatay') < layerArea(g0, 's', 'tugla-yatay'));
  close(layerArea(g1, 'h', 'eps'), 600 * 5, 1e-9, 'EPS kesintisiz');
  close(total(g1), total(g0), 1e-9); noOverlap(g1);
  assert.equal(JSON.stringify(COMPOSITES), before);
  assert.equal(compThickness(comps.find(c => c.k === 'dis-tugla-eps')), 26.5, 'öncelik kalınlığı etkilemez');
});

test('dış yüz referanslı duvarlar ve hafif bölme → dış duvar birleşimi', () => {
  const g = geo([W('h', 0, 0, 600, 0, 26.5, 'dis-tugla-eps', { face: 1 }), W('s', 300, 13.25, 300, 300, 10, 'alcipan-100')]);
  assert.equal(g.joins.joins[0].kind, 'T'); noOverlap(g);
  close(total(g), 600 * 26.5 + (300 - 13.25) * 10, 1e-9);
});

test('tekrar çizilmiş (üst üste binen) duvar: raporlanır, metrajda çift hacim yok', () => {
  const g = geo([W('a', 0, 0, 400, 0, 20), W('b', 200, 0, 600, 0, 20)]);
  assert.ok(g.issues.some(i => i.code === 'OVERLAP')); assert.ok(g.issues.some(i => i.code === 'GEOM_OVERLAP_RESOLVED'));
  assert.ok(g.diag.rawOverlaps.length > 0); assert.deepEqual(overlapReport(g), []);
  close(total(g), 600 * 20, 1e-9, 'birleşim alanı');
});

test('metraj: duvar hacmi ve malzeme hacimleri çakışma olmadan; açıklıklar düşülür', () => {
  const P = { walls: [W('w1', 0, 0, 400, 0, 26.5, 'dis-tugla-eps'), W('w2', 400, 0, 400, 300, 26.5, 'dis-tugla-eps')], openings: [{ id: 'o', wallId: 'w1', type: 'window', pos: 200, w: 100, h: 120, sill: 90 }], meta: { wallT: 20, wallH: 280 } };
  const q = wallQuantities({ meta: {} }, P, P.meta);
  close(q.total, (700 * 26.5 * 280 - 100 * 26.5 * 120) / 1e6, 1e-9);
  close(Object.values(q.byMat).reduce((s, v) => s + v, 0), q.total, 1e-12);
  close(q.byMat['tugla-yatay'] + q.byMat.eps + q.byMat['siva-kirec'] + q.byMat['siva-alci'], q.total, 1e-12);
});
