// B2B-4 — 3D / kesit / metraj tutarlılığı, kata bağlı geometri, uyumluluk: node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { wallPrisms, wallQuantities, levelWallGeometry, overlapReport, piecesArea } from '../js/bim/wallgeom.js';
import { prismFaces, meshChecks, toThree, threeWindingOk } from '../js/bim/mesh.js';
import { buildSolids, drawView } from '../js/sections.js';
import { runCommand, applyPatch } from '../js/bim/commands.js';
import { createBim } from '../js/bim/api.js';
import { buildModel } from '../js/bim/adapter.js';
import { planLevels } from '../js/plan-geom.js';
import { COMPOSITES } from '../js/materials.js';

const FILE = JSON.parse(readFileSync(new URL('./fixtures/eski-proje-v1.saggcad.json', import.meta.url), 'utf8'));
const root = () => JSON.parse(JSON.stringify(FILE.project.drawings[0].plan));
const W = (id, ax, ay, bx, by, t, comp, x = {}) => ({ id, a: { x: ax, y: ay }, b: { x: bx, y: by }, t, h: 0, ...(comp ? { comp } : {}), ...x });
const sample = () => ({ v: 1, walls: [W('w1', 0, 0, 400, 0, 26.5, 'dis-tugla-eps'), W('w2', 400, 0, 400, 300, 26.5, 'dis-tugla-eps'), W('w3', 0, 300, 400, 300, 26.5, 'dis-tugla-eps'), W('w4', 0, 0, 0, 300, 26.5, 'dis-tugla-eps'), W('s', 200, 0, 200, 300, 14, 'ic-tugla'), W('x', 100, -100, 100, 150, 20, 'perde-25', { struct: true })],
  openings: [{ id: 'o1', wallId: 'w1', type: 'window', pos: 300, w: 80, h: 120, sill: 90 }, { id: 'o2', wallId: 's', type: 'door', pos: 150, w: 90, h: 210, sill: 0 }], rooms: [], items: [], slabs: [], sections: [{ id: 'k1', name: 'A', a: { x: 300, y: -150 }, b: { x: 300, y: 450 }, side: 1 }], meta: { wallH: 280, wallT: 20 }, levels: [] });
const close = (a, b, e = 1e-6, m = '') => assert.ok(Math.abs(a - b) <= e * Math.max(1, Math.abs(b)), `${m} ${a} ≠ ${b}`);

test('2D ve 3D geometri tutarlılığı: kapalı yüzey, dışa bakan normal, iç yüz yok, hacim = 2D alan × yükseklik − açıklıklar', () => {
  for (const [name, R] of [['örnek', sample()], ['eski proje', root()]]) {
    const P = R, meta = { ...R.meta }, { prisms, geo } = wallPrisms(R, P, meta), faces = prismFaces(prisms), c = meshChecks(faces, prisms);
    assert.ok(c.closure < 1e-6 * c.expected, `${name}: kapalı yüzey (${c.closure})`);
    close(c.volume, c.expected, 1e-9, `${name} hacim`);
    assert.equal(c.inward, 0, `${name}: ters normal`); assert.equal(c.internal, 0, `${name}: iç / çakışan yüz`);
    assert.equal(threeWindingOk(toThree(faces)), 0, `${name}: Three.js üçgen sarımı`);
    // 3D taban izi = 2D katman çokgenleri (açıklıksız bölge tam yükseklikte)
    const foot2d = [...geo.walls.values()].filter(S => !S.legacy).reduce((s, S) => s + S.layers.reduce((q, l) => q + piecesArea(l.pieces), 0), 0);
    const bottom = faces.filter(f => f.kind === 'bottom' && Math.abs(f.pts[0][2] - Math.min(...prisms.map(p => p.z0))) < 1e-6);
    const zoneB = Math.min(...prisms.map(p => p.z0)), q = wallQuantities(R, P, meta);
    assert.ok(bottom.length > 0);
    const openVol = R.openings.reduce((s, o) => { const w = R.walls.find(x => x.id === o.wallId); return w ? s + o.w * (+w.t || 20) * Math.min(o.h, 280 - (o.type === 'window' ? o.sill : 0)) : s; }, 0);
    if (name === 'örnek') close(q.total * 1e6, foot2d * 280 - openVol, 1e-9, 'metraj');
    close(q.total * 1e6, c.expected, 1e-9, `${name}: metraj = 3D hacim`);
    assert.ok(zoneB <= 0);
  }
});

test('kesit ve malzeme metrajı tutarlılığı: kesit prizmaları = ortak geometri; kesilen katman kalınlıkları', () => {
  const R = sample(), { S } = buildSolids(R), walls = S.filter(x => x.kind === 'wall');
  const vS = walls.reduce((s, x) => s + Math.abs(piecesArea([x.poly])) * (x.z1 - x.z0), 0) / 1e6, q = wallQuantities(R, R, R.meta);
  close(vS, q.total, 1e-9, 'kesit hacmi = metraj');
  const byMatS = {}; for (const x of walls) byMatS[x.m.k || 'genel'] = (byMatS[x.m.k || 'genel'] || 0) + Math.abs(piecesArea([x.poly])) * (x.z1 - x.z0) / 1e6;
  for (const [k, v] of Object.entries(q.byMat)) close(byMatS[k] || 0, v, 1e-9, k);
  // x = 300 kesiti w1 ve w3'ü dik keser: kesilen katmanların yatay genişlikleri kompozit kalınlıklarına eşit
  const V = drawView(R, { type: 'sec', id: 'k1', name: 'A', d: { x: 1, y: 0 }, a: { x: 300, y: -150 }, b: { x: 300, y: 450 } }, { N: 50, dims: false });
  const cut = V.prims.filter(p => String(p.layer).startsWith('KESILEN-'));
  const wid = k => cut.filter(p => p.layer === 'KESILEN-' + k).reduce((s, p) => s + Math.abs(p.pts[1][0] - p.pts[0][0]) * Math.abs(p.pts[2][1] - p.pts[0][1]), 0);
  assert.ok(wid('EPS') > 0 && wid('TUGLA-YATAY') > 0);
  close(wid('TUGLA-YATAY') / wid('EPS'), 19 / 5, 1e-6, 'tuğla / EPS kesit alan oranı = kalınlık oranı');
});

test('kata bağlı yükseklik: duvar, kolon, kiriş; kat yüksekliği ve döşeme değişince güncellenir; geçersiz bağ reddedilir', () => {
  const R = root(), j0 = JSON.stringify(R), patches = [];
  const ok = r => { assert.equal(r.ok, true, JSON.stringify(r.errors)); patches.push(r.patch); return r; };
  ok(runCommand(R, { op: 'setTopBinding', id: 'wfx001', mode: 'nextSlabTop', offset: 0 }));   // zemin kat 280 + 1. kat döşemesi 15
  assert.equal(R.walls[0].h, 295); assert.deepEqual(R.walls[0].bimTop, { mode: 'nextSlabTop', off: 0 });
  ok(runCommand(R, { op: 'setTopBinding', id: 'ifxcol1', mode: 'level', offset: 0 }));
  ok(runCommand(R, { op: 'setTopBinding', id: 'ifxbeam1', mode: 'level', offset: 0 }));   // kiriş üstü döşeme altında: z = 280 − 50
  assert.equal(R.items.find(i => i.id === 'ifxbeam1').z, 230);
  ok(runCommand(R, { op: 'setLevelHeight', level: 0, height: 300 }));
  assert.equal(R.meta.wallH, 300); assert.equal(R.walls[0].h, 315); assert.equal(R.items.find(i => i.id === 'ifxcol1').h, 300); assert.equal(R.items.find(i => i.id === 'ifxbeam1').z, 250);
  assert.equal(planLevels(R)[1].z, 315, 'üst kat kotu');
  ok(runCommand(R, { op: 'setLevelSlab', level: 1, thickness: 20 }));
  assert.equal(R.walls[0].h, 320, 'üst kat döşemesi kalınlaştı → bağlı duvar uzadı'); assert.equal(R.items.find(i => i.id === 'ifxcol1').h, 300);
  ok(runCommand(R, { op: 'setTopBinding', id: 'ifxbeam1', mode: 'level', offset: -10 }));
  assert.equal(R.items.find(i => i.id === 'ifxbeam1').z, 240);
  // geçersiz: üst kat yok (1. kat çatıya kadar bağlanamaz), negatif yükseklik, çatı yok
  assert.equal(runCommand(R, { op: 'setTopBinding', id: 'wfxu1', mode: 'nextSlabTop' }).ok, false);
  assert.equal(runCommand(R, { op: 'setTopBinding', id: 'ifxcol1', mode: 'level', offset: -400 }).ok, false);
  assert.equal(runCommand(R, { op: 'setLevelHeight', level: 0, height: 10 }).ok, false);
  assert.equal(runCommand(R, { op: 'setTopBinding', id: 'ofx00e', mode: 'level' }).ok, false);
  // sabit: bağ kalkar, değer kalır
  ok(runCommand(R, { op: 'setTopBinding', id: 'ifxcol1', mode: 'fixed' }));
  ok(runCommand(R, { op: 'setLevelHeight', level: 0, height: 320 }));
  assert.equal(R.items.find(i => i.id === 'ifxcol1').h, 300, 'sabit kolon değişmez');
  for (const p of patches.reverse()) applyPatch(R, p, 'undo');
  assert.equal(JSON.stringify(R), j0, 'tüm kat bağı işlemleri birebir geri alındı');
});

test('eski proje dosyaları: açmak ve geometri hesaplamak veriyi değiştirmez; B2A alanları korunur', () => {
  for (const d of FILE.project.drawings) {
    const R = JSON.parse(JSON.stringify(d.plan)), j = JSON.stringify(R);
    for (const L of planLevels(R)) { levelWallGeometry(R, L.plan); wallPrisms(R, L.plan, { ...R.meta, ...L.plan.meta }); }
    buildSolids(R); createBim(R).wallQuantities(); createBim(R).getWallJoinInfo('wfx001');
    assert.equal(JSON.stringify(R), j, d.name);
  }
  // B2A ile kaydedilmiş veri (bimType, bimOv, meta.bimTypes) + B2B alanları (joinOff, bimTop, katman önceliği)
  const R = root();
  assert.ok(runCommand(R, { op: 'duplicateType', from: 'DIS-DUV-01', id: 'DIS-DUV-02', name: 'A', params: { compositeId: 'dis-gazbeton' } }).ok);
  assert.ok(runCommand(R, { op: 'assignType', ids: ['wfx001'], typeId: 'DIS-DUV-02' }).ok);
  assert.ok(runCommand(R, { op: 'setJoinEnabled', id: 'wfx004', end: 'a', enabled: false }).ok);
  assert.ok(runCommand(R, { op: 'setTopBinding', id: 'ifxcol1', mode: 'level' }).ok);
  R.meta.composites = JSON.parse(JSON.stringify(COMPOSITES)); R.meta.composites.find(c => c.k === 'dis-gazbeton').layers[1][2] = 8;   // taş yünü: 4 → 8   // projeye özel öncelik
  const saved = JSON.parse(JSON.stringify(R)), b = createBim(saved);
  assert.equal(b.getElement('wfx001').typeId, 'DIS-DUV-02');
  assert.deepEqual(b.getWallJoinInfo('wfx004').joinOff, ['a']); assert.equal(b.getWallJoinInfo('wfx004').a, null);
  assert.deepEqual(b.getTopBinding('ifxcol1'), { mode: 'level', off: 0 });
  assert.equal(saved.v, 1, 'kayıt biçimi sürümü aynı');
  assert.equal(b.getWallJoinInfo('wfx001').layers.find(l => l.mat === 'tasyunu').prio, 8, 'katman önceliği kayıtla gelir');
  assert.equal(createBim(root()).getWallJoinInfo('wfx001').layers.find(l => l.mat === 'eps').prio, 4, 'varsayılan yalıtım önceliği');
  assert.ok(buildModel(saved).elements.size > 40);
});

test('B2B: BIM modeli duvar birleşimlerini ilişki ve rapor olarak verir', () => {
  const b = createBim(sample()), J = b.getWallJoinInfo('w1');
  assert.equal(J.a.kind, 'L'); assert.equal(J.b.kind, 'L'); assert.deepEqual(J.body.map(x => x.kind).sort(), ['T', 'X']);
  assert.equal(J.ref, 'axis'); assert.ok(J.layers.find(l => l.core).prio >= 7);
  assert.ok(b.getElementRelations('w1').outgoing.some(r => r.kind === 'joinedAt' && r.target === 's'));
  const q = b.wallQuantities()[0]; assert.ok(q.total > 0 && q.byMat['tugla-yatay'] > 0);
  assert.deepEqual(overlapReport(levelWallGeometry(sample(), sample())), []);
});
