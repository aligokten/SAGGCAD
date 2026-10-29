// Yapı fiziği hesapları ve kesit / görünüş üretimi: node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import { compOf, compStats, compThickness, COMPOSITES, MATERIALS } from '../js/materials.js';
import { samplePlan } from '../js/sample.js';
import { drawView, viewsOf, viewDxf, buildSolids } from '../js/sections.js';
import { toU, fromU, fmtL, fitPaper } from '../js/units.js';

const R0 = { meta: {} };

test('dış duvar kompoziti: kalınlık, kütle, U, Rw', () => {
  const c = compOf(R0, 'dis-tugla-eps'), st = compStats(R0, c);
  assert.equal(compThickness(c), 26.5);
  assert.ok(Math.abs(st.mass - 190.5) < 0.01, `m' ${st.mass}`);
  // R = 0,005/0,8 + 0,05/0,035 + 0,19/0,40 + 0,02/0,40 ; Rt = R + 0,13 + 0,04
  const R = 0.005 / 0.8 + 0.05 / 0.035 + 0.19 / 0.4 + 0.02 / 0.4;
  assert.ok(Math.abs(st.U - 1 / (R + 0.17)) < 1e-9);
  assert.equal(st.rw, Math.round(37.5 * Math.log10(190.5) - 42));
  assert.equal(st.fire, 'E');   // EPS
});

test('hafif bölmede kütle yasası yerine test değeri, hava boşluğu R sabit', () => {
  const st = compStats(R0, compOf(R0, 'alcipan-100'));
  assert.equal(st.rw, 50); assert.equal(st.rwSrc, 'test');
  const air = compStats(R0, { use: 'wall-int', layers: [['hava', 5]] });
  assert.ok(Math.abs(air.R - 0.18) < 1e-9);
});

test('tüm kompozitlerin malzemeleri tanımlı', () => {
  const keys = new Set(MATERIALS.map(m => m.k));
  for (const c of COMPOSITES) for (const [k] of c.layers) assert.ok(keys.has(k), `${c.k}: ${k}`);
});

test('birim dönüşümü ve pafta seçimi', () => {
  const R = { meta: { unit: 'm' } };
  assert.equal(toU(350, R), 3.5); assert.equal(fromU(3.5, R), 350); assert.equal(fmtL(350, R), '3,5');
  assert.equal(fitPaper(1000, 600, 50).k, 'A4');   // 1:50 → 200 × 120 mm + kenar / antet
  assert.equal(fitPaper(1000, 600, 20).k, 'A2');   // 1:20 → 500 × 300 mm
  assert.equal(fitPaper(10000, 6000, 20), null);
});

test('görünüş ve kesit: kesilen katmanlar, ölçüler, DXF', async () => {
  const P = samplePlan();
  P.walls.forEach(w => { w.comp = 'dis-tugla-eps'; w.t = 26.5; });
  P.sections = [{ id: 's1', name: 'A', a: { x: 250, y: -100 }, b: { x: 250, y: 900 }, side: 1 }];
  const { S } = buildSolids(P);
  assert.ok(S.some(s => s.kind === 'glass') && S.some(s => s.kind === 'door'));
  const vs = viewsOf(P);
  assert.equal(vs.length, 5);
  const el = drawView(P, vs[0], { N: 100 });
  assert.ok(el.prims.some(p => p.t === 'text' && p.str === '±0,00'));
  const sec = drawView(P, vs.find(v => v.type === 'sec'), { N: 50 });
  const cut = sec.prims.filter(p => p.layer?.startsWith('KESILEN-'));
  assert.ok(cut.some(p => p.layer === 'KESILEN-EPS') && cut.some(p => p.layer === 'KESILEN-TUGLA-YATAY'), 'kesilen duvar katmanları');
  assert.ok(sec.prims.some(p => p.layer === 'OLCU' && p.t === 'text'));
  const dxf = await viewDxf(sec).text();
  assert.ok(dxf.includes('KESILEN-EPS') && dxf.trim().endsWith('EOF'));
});
