// B3-C — artımlı ↔ tam hesap eşitliği, 3D kısmi güncelleme verisi: node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { levelWallGeometry, wallPrisms, wallQuantities, GEO_STATS, overlapReport } from '../js/bim/wallgeom.js';
import { analyzeJoins, joinGraph, linkPlan, JOIN_STATS } from '../js/bim/joins.js';
import { runCommand, applyPatch } from '../js/bim/commands.js';

const FILE = JSON.parse(readFileSync(new URL('./fixtures/eski-proje-v1.saggcad.json', import.meta.url), 'utf8'));
import { geoSig, gridPlan } from './b3-helpers.mjs';
const r6 = v => Math.round(v * 1e6) / 1e6;
const fullSig = (R, P) => geoSig(levelWallGeometry(R, JSON.parse(JSON.stringify(P)), { full: true }));
let seed = 12345; const rnd = () => (seed = (seed * 48271) % 2147483647) / 2147483647, pick = a => a[Math.floor(rnd() * a.length)];

test('artımlı birleşim grafiği = tam analiz (rastgele düzenlemeler)', () => {
  const R = { meta: {} }, P = gridPlan(5);
  levelWallGeometry(R, P);
  for (let k = 0; k < 120; k++) {
    const w = pick(P.walls), op = rnd();
    if (op < 0.35) { const e = rnd() < 0.5 ? 'a' : 'b'; w[e] = { x: w[e].x + Math.round((rnd() - 0.5) * 60), y: w[e].y + Math.round((rnd() - 0.5) * 60) }; }
    else if (op < 0.55) w.t = pick([10, 14, 20, 26.5]);
    else if (op < 0.7) w.comp = pick(['ic-tugla', 'dis-tugla-eps', 'perde-25', 'alcipan-100']);
    else if (op < 0.8 && P.walls.length > 10) P.walls.splice(P.walls.indexOf(w), 1);
    else P.walls.push({ id: 'n' + k, a: { x: Math.round(rnd() * 2000), y: Math.round(rnd() * 2000) }, b: { x: Math.round(rnd() * 2000), y: Math.round(rnd() * 2000) }, t: 14, comp: 'ic-tugla' });
    const inc = levelWallGeometry(R, P), ref = levelWallGeometry(R, JSON.parse(JSON.stringify(P)), { full: true });
    assert.deepEqual(inc.joins.joins.map(j => j.id), ref.joins.joins.map(j => j.id), `adım ${k}: birleşimler (sıralı)`);
    const idx = G => JSON.stringify([[...G.endJoin].sort(), [...G.byWall].map(([id, l]) => [id, [...l].sort()]).sort()]);
    assert.equal(idx(inc.joins), idx(ref.joins), `adım ${k}: uç / duvar dizinleri`);
    assert.equal(geoSig(inc), geoSig(ref), `adım ${k}: geometri`);
  }
  // rastgele uzun duvarlar planı hızla çakışmalarla doldurur → çoğu adım güvenli tam hesaba düşer; burada ölçüt doğruluktur
  assert.ok(GEO_STATS.incremental > 5, `artımlı yol kullanıldı (${GEO_STATS.incremental}; tam ${GEO_STATS.full}; ${JSON.stringify(GEO_STATS.fallback)})`);
});

test('gerçekçi düzenlemeler: artımlı yol kullanılır ve tam hesapla birebir', () => {
  const R = { meta: {} }, P = gridPlan(8);
  levelWallGeometry(R, P);
  const inc0 = GEO_STATS.incremental;
  for (let k = 0; k < 80; k++) {
    const w = pick(P.walls), op = rnd();
    if (op < 0.4) {   // köşe sürükleme: düğümde birleşen tüm duvar uçları birlikte (moveWallEnd gibi)
      const e = rnd() < 0.5 ? 'a' : 'b', n = { ...w[e] }, to = { x: n.x + Math.round((rnd() - 0.5) * 40), y: n.y + Math.round((rnd() - 0.5) * 40) };
      for (const q of P.walls) for (const f of ['a', 'b']) if (Math.hypot(q[f].x - n.x, q[f].y - n.y) < 0.01) q[f] = { ...to };
    }
    else if (op < 0.7) w.t = pick([10, 14, 20]);
    else if (op < 0.85) w.comp = pick(['ic-tugla', 'alcipan-100']);
    else { const o = P.openings.find(q => q.wallId === w.id); if (o) o.pos = 100 + Math.round(rnd() * 150); else w.t = 12; }
    const inc = levelWallGeometry(R, P);
    assert.equal(geoSig(inc), fullSig(R, P), `adım ${k}`);
  }
  // eğik dörtlü düğüm gerçek katman çakışması üretebilir → küresel ayrıştırma (tam hesap) doğru davranıştır
  assert.ok(GEO_STATS.incremental - inc0 >= 8, `artımlı yol (${GEO_STATS.incremental - inc0}/80; ${JSON.stringify(GEO_STATS.fallback)})`);
});

test('temiz modelde kalınlık / kompozit / açıklık düzenlemeleri: her adım artımlı (ya da değişmeyen önbellek) ve birebir', () => {
  const R = { meta: {} }, P = gridPlan(8);
  levelWallGeometry(R, P);
  const inc0 = GEO_STATS.incremental + GEO_STATS.reused;
  for (let k = 0; k < 60; k++) {
    const w = pick(P.walls), op = rnd();
    if (op < 0.4) w.t = pick([10, 12, 14, 20]);
    else if (op < 0.7) w.comp = pick(['ic-tugla', 'alcipan-100']);
    else { const o = P.openings.find(q => q.wallId === w.id); if (o) o.pos = 100 + Math.round(rnd() * 150); else w.t = 16; }
    assert.equal(geoSig(levelWallGeometry(R, P)), fullSig(R, P), `adım ${k}`);
  }
  assert.equal(GEO_STATS.incremental + GEO_STATS.reused - inc0, 60, JSON.stringify(GEO_STATS.fallback));
});

test('komutlar + geri al ile artımlı ↔ tam: eski proje dosyası', () => {
  const R = JSON.parse(JSON.stringify(FILE.project.drawings[0].plan)), patches = [];
  levelWallGeometry(R, R);
  const steps = [
    { op: 'moveWallEnd', id: 'wfx001', end: 'b', to: { x: 557.5, y: -7.5 } }, { op: 'offsetWall', id: 'wfx006', d: -30 },
    { op: 'setInstanceParam', id: 'wfx003', key: 'thickness', value: 30 }, { op: 'setWallLength', id: 'wfx00b', length: 260 },
    { op: 'setJoinEnabled', id: 'wfx004', end: 'a', enabled: false }, { op: 'setInstanceParam', id: 'wfx007', key: 'compositeId', value: 'perde-25' },
  ];
  for (const c of steps) {
    const r = runCommand(R, c); assert.equal(r.ok, true, JSON.stringify([c, r.errors])); patches.push(r.patch);
    assert.equal(geoSig(levelWallGeometry(R, R)), fullSig(R, R), c.op);
  }
  for (const p of patches.reverse()) { applyPatch(R, p, 'undo'); assert.equal(geoSig(levelWallGeometry(R, R)), fullSig(R, R), 'geri al'); }
});

test('2D / 3D / metraj artımlı yolda tam yolla aynı', () => {
  const R = { meta: {} }, P = gridPlan(4), meta = P.meta;
  wallPrisms(R, P, meta);
  P.walls[7].b = { x: P.walls[7].b.x + 35, y: P.walls[7].b.y }; P.walls[12].t = 20;
  const a = wallPrisms(R, P, meta), Q = JSON.parse(JSON.stringify(P));
  levelWallGeometry(R, Q, { full: true }); const b = wallPrisms(R, Q, meta);
  const sig = x => JSON.stringify(x.prisms.map(p => [p.wid, p.layer, p.z0, p.z1, p.poly.map(q => [r6(q.x), r6(q.y)])]).sort((m, n) => (JSON.stringify(m) < JSON.stringify(n) ? -1 : 1)));
  assert.equal(sig(a), sig(b));
  assert.ok(Math.abs(wallQuantities(R, P, meta).total - wallQuantities(R, Q, meta).total) < 1e-9);
  assert.deepEqual(overlapReport(levelWallGeometry(R, P)), []);
});

test('güvenli tam hesap: kütüphane değişimi, tekrar eden kimlik, çakışma', () => {
  const R = { meta: {} }, P = gridPlan(3);
  levelWallGeometry(R, P);
  const before = { ...GEO_STATS.fallback };
  R.meta.composites = JSON.parse(JSON.stringify((await_import()).COMPOSITES)); R.meta.composites[0].layers[1][2] = 9;
  levelWallGeometry(R, P);
  assert.equal((GEO_STATS.fallback['kütüphane'] || 0), (before['kütüphane'] || 0) + 1);
  P.walls.push({ ...P.walls[0] });   // tekrar eden kimlik
  levelWallGeometry(R, P); assert.ok(GEO_STATS.fallback['tekrar eden kimlik'] >= 1);
  P.walls.pop();
  P.walls.push({ id: 'dup', a: { ...P.walls[0].a }, b: { ...P.walls[0].b }, t: 14, comp: 'ic-tugla' });   // üst üste çizim
  const g = levelWallGeometry(R, P); assert.deepEqual(overlapReport(g), []); assert.equal(geoSig(g), fullSig(R, P));
});
import { COMPOSITES } from '../js/materials.js';
function await_import() { return { COMPOSITES }; }

test('önbellekli birleşim grafiği (komut kopyası özgünden başlar) = tam analiz', () => {
  const P = gridPlan(6), sig = G => JSON.stringify([G.joins.map(j => [j.id, j.kind, j.members]), G.issues.map(i => [i.code, i.ids]).sort(), [...G.endJoin].sort(), [...G.byWall].map(([k, l]) => [k, [...l].sort()]).sort(), [...G.axes.keys()]]);
  joinGraph(P);
  const inc0 = JOIN_STATS.incremental;
  for (let k = 0; k < 40; k++) {
    const Q = JSON.parse(JSON.stringify(P)); linkPlan(Q, P);
    const w = pick(Q.walls), e = rnd() < 0.5 ? 'a' : 'b';
    if (rnd() < 0.5) w[e] = { x: w[e].x + Math.round((rnd() - 0.5) * 50), y: w[e].y + Math.round((rnd() - 0.5) * 50) }; else w.t = pick([10, 14, 20]);
    const G = joinGraph(Q);
    assert.equal(sig(G), sig(analyzeJoins(Q)), `adım ${k}`);
    assert.ok([...G.axes].every(([id, ax]) => ax.w === Q.walls.find(x => x.id === id)), 'eksenler kopyanın kayıtlarına bağlı');
    if (k % 3 === 0) { Object.assign(P, Q); joinGraph(P); }   // ara sıra uygula (özgün ilerler)
  }
  assert.ok(JOIN_STATS.incremental - inc0 >= 30, `artımlı birleşim (${JOIN_STATS.incremental - inc0}/40)`);
});
