// Akslar ve kolon / kiriş referans noktaları (js/grids.js) — saf geometri. node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import { letterOf, nextGridName, gridAxisKind, gridArray, parseSpacing, gridIntersections, itemCorners, beamEnds, moveByCorner, beamFromEnds, anchorCenter, beamAlignOffset, structSnapPts, gridSvg } from '../js/grids.js';
import { planToDXF } from '../js/exporters.js';
import { planBounds } from '../js/plan-geom.js';

const near = (a, b, e = 1e-6) => assert.ok(Math.abs(a - b) <= e, `${a} ≈ ${b}`);
const nearP = (p, q) => { near(p.x, q.x, 0.011); near(p.y, q.y, 0.011); };

test('aks adları: harf dizisi, yön, devam eden numaralandırma', () => {
  assert.deepEqual([0, 1, 25, 26, 27, 51, 52].map(letterOf), ['A', 'B', 'Z', 'AA', 'AB', 'AZ', 'BA']);
  assert.equal(gridAxisKind({ a: { x: 0, y: 0 }, b: { x: 1000, y: 30 } }), 'letter');
  assert.equal(gridAxisKind({ a: { x: 0, y: 0 }, b: { x: 20, y: 800 } }), 'number');
  assert.equal(nextGridName([], 'letter'), 'A');
  assert.equal(nextGridName([], 'number'), '1');
  assert.equal(nextGridName([{ name: 'A' }, { name: 'C' }, { name: '1' }, { name: 'X1' }], 'letter'), 'D');
  assert.equal(nextGridName([{ name: 'A' }, { name: '2' }, { name: '7' }], 'number'), '8');
  assert.equal(nextGridName([{ name: 'Z' }], 'letter'), 'AA');
});

test('aralık ayrıştırma: boşluk, ;, 3x400, ondalık virgül; geçersiz → null', () => {
  assert.deepEqual(parseSpacing('400 500 400'), [400, 500, 400]);
  assert.deepEqual(parseSpacing('3x350'), [350, 350, 350]);
  assert.deepEqual(parseSpacing('2×300;450,5'), [300, 300, 450.5]);
  assert.deepEqual(parseSpacing(''), []);
  assert.equal(parseSpacing('400 abc'), null);
  assert.equal(parseSpacing('-200'), null);
  assert.equal(parseSpacing('0'), null);
});

test('aks sistemi: konumlar, taşma, adlar, kesişim sayısı', () => {
  let i = 0;
  const g = gridArray({ xs: [400, 500], ys: [350], x0: 100, y0: 50, over: 150, uid: () => 'g' + (++i) });
  const v = g.filter(x => /^\d+$/.test(x.name)), h = g.filter(x => /^[A-Z]+$/.test(x.name));
  assert.deepEqual(v.map(x => x.name), ['1', '2', '3']);
  assert.deepEqual(h.map(x => x.name), ['A', 'B']);
  assert.deepEqual(v.map(x => x.a.x), [100, 500, 1000]);
  assert.deepEqual(h.map(x => x.a.y), [50, 400]);
  assert.deepEqual([v[0].a.y, v[0].b.y], [-100, 550]);   // 50−150, 400+150
  assert.deepEqual([h[0].a.x, h[0].b.x], [-50, 1150]);
  const X = gridIntersections(g);
  assert.equal(X.length, 6);
  assert.ok(X.some(p => p.x === 500 && p.y === 400 && p.g.includes('2') && p.g.includes('B')));
  // mevcut akslardan devam
  const g2 = gridArray({ xs: [300], ys: [], existing: g, uid: () => 'h' + (++i) });
  assert.deepEqual(g2.map(x => x.name), ['4', '5']);
});

test('kesişim: kesişmeyen ve paralel akslar sayılmaz', () => {
  const A = { name: 'A', a: { x: 0, y: 0 }, b: { x: 100, y: 0 } }, B = { name: 'B', a: { x: 0, y: 50 }, b: { x: 100, y: 50 } }, C = { name: '1', a: { x: 200, y: -10 }, b: { x: 200, y: 60 } };
  assert.equal(gridIntersections([A, B, C]).length, 0);
  const D = { name: '2', a: { x: 50, y: -10 }, b: { x: 50, y: 60 } };
  assert.deepEqual(gridIntersections([A, D]).map(p => [p.x, p.y]), [[50, 0]]);
});

test('kolon köşeleri: dönüşsüz ve 90° / 30° dönüşlü', () => {
  const c = { type: 'kolon', x: 100, y: 200, w: 40, d: 20, rot: 0 };
  assert.deepEqual(itemCorners(c), [{ x: 80, y: 190 }, { x: 120, y: 190 }, { x: 120, y: 210 }, { x: 80, y: 210 }]);
  const r = itemCorners({ ...c, rot: 90 });
  nearP(r[0], { x: 110, y: 180 }); nearP(r[2], { x: 90, y: 220 });
  // köşelerin merkeze uzaklığı dönüşle değişmez
  for (const q of itemCorners({ ...c, rot: 30 })) near(Math.hypot(q.x - 100, q.y - 200), Math.hypot(20, 10), 0.02);
});

test('köşeden taşıma: tutulan köşe hedefe gelir (dönüşlü dahil)', () => {
  for (const rot of [0, 30, 90, 217]) {
    const c = { type: 'kolon', x: 0, y: 0, w: 50, d: 30, rot };
    for (let i = 0; i < 4; i++) {
      const t = { x: 333.3, y: -120.7 }, m = moveByCorner(c, i, t);
      nearP(itemCorners({ ...c, ...m })[i], t);
    }
  }
});

test('yerleştirme noktası: tıklanan nokta = seçilen köşe; merkez değişmez', () => {
  const p = { x: 500, y: 400 };
  assert.deepEqual(anchorCenter(p, 30, 50, 0, 'c'), p);
  assert.deepEqual(anchorCenter(p, 30, 50, 0, 'tl'), { x: 515, y: 425 });
  assert.deepEqual(anchorCenter(p, 30, 50, 0, 'br'), { x: 485, y: 375 });
  const cc = anchorCenter(p, 30, 50, 45, 'tr'), cs = itemCorners({ x: cc.x, y: cc.y, w: 30, d: 50, rot: 45 });
  nearP(cs[1], p);   // sağ üst köşe tıklanan noktada
});

test('kiriş: uçlar, uçtan yeniden kurma, hiza ofseti', () => {
  const b = { type: 'kiris', ...beamFromEnds({ x: 0, y: 0 }, { x: 600, y: 0 }), d: 25 };
  assert.deepEqual([b.x, b.y, b.w, b.rot], [300, 0, 600, 0]);
  const e = beamEnds(b); nearP(e.a, { x: 0, y: 0 }); nearP(e.b, { x: 600, y: 0 });
  const b2 = beamFromEnds({ x: 0, y: 0 }, { x: 0, y: -400 });
  assert.equal(b2.rot, 270); assert.equal(b2.w, 400);
  const e2 = beamEnds({ ...b2, d: 25 }); nearP(e2.a, { x: 0, y: 0 }); nearP(e2.b, { x: 0, y: -400 });
  // çizgi sağ yüzde: gövde çizim yönünün soluna (sağa çizilen kirişte ekran yukarısı, −y)
  const ro = beamAlignOffset({ x: 0, y: 0 }, { x: 600, y: 0 }, 25, 'right'); near(ro.x, 0); near(ro.y, -12.5);
  const lo = beamAlignOffset({ x: 0, y: 0 }, { x: 600, y: 0 }, 25, 'left'); near(lo.x, 0); near(lo.y, 12.5);
  assert.deepEqual(beamAlignOffset({ x: 0, y: 0 }, { x: 600, y: 0 }, 25, 'axis'), { x: 0, y: 0 });
  const pts = structSnapPts({ ...b, type: 'kiris' });
  assert.equal(pts.filter(p => p.k === 'corner').length, 4);
  assert.ok(pts.some(p => p.x === 0 && p.y === 0) && pts.some(p => p.x === 600 && p.y === 0));
});

test('çizim ve DXF: aks baloncuğu, ad kaçışı, AKS katmanı; planBounds aksları içerir', async () => {
  const g = { id: 'ax1', a: { x: 0, y: 0 }, b: { x: 0, y: 800 }, name: '<1>', bub: 'b' };
  const svg = gridSvg(g, n => n);
  assert.equal((svg.match(/<circle/g) || []).length, 1);
  assert.ok(svg.includes('&lt;1&gt;') && !svg.includes('<1>'));
  assert.equal(gridSvg({ ...g, bub: 'none' }, n => n).includes('<circle'), false);
  const plan = { walls: [{ id: 'w', a: { x: 100, y: 100 }, b: { x: 300, y: 100 }, t: 20 }], openings: [], rooms: [], items: [], rails: [], labels: [], dims: [], stairs: [], meta: { wallT: 20 }, grids: [{ ...g, name: 'A', bub: 'both' }] };
  const dxf = await planToDXF(plan).text();
  const ents = dxf.split('\n').map(x => x.trim());
  assert.ok(ents.filter((x, i) => x === 'LINE' && ents[i + 2] === 'AKS').length === 1);
  assert.equal(ents.filter((x, i) => x === 'CIRCLE' && ents[i + 2] === 'AKS').length, 2);
  assert.deepEqual(planBounds(plan), { x0: 0, y0: 0, x1: 300, y1: 800 });
  // aks yoksa eski davranış
  assert.equal((await planToDXF({ ...plan, grids: undefined }).text()).includes('CIRCLE'), false);
});
