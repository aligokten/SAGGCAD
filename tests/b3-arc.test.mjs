// B3-D — parametrik yay duvar (parametreler + setArcGeometry): node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import { runCommand, applyPatch } from '../js/bim/commands.js';
import { arcParameters, ARC_TOL } from '../js/bim/wallcmds.js';
import { levelWallGeometry } from '../js/bim/wallgeom.js';
import { solve } from '../js/bim/solver.js';
import { arcWallVerts, arcApex } from '../js/plan-geom.js';

/* editördeki yay aracıyla aynı kayıt: 3 nokta → parçalı duvarlar { arc: { id, i, off } } */
function arcPlan() {
  const p1 = { x: 0, y: 0 }, p2 = { x: 600, y: 0 }, g = arcWallVerts(p1, p2, arcApex(p1, p2, 150, -1));
  const P = { v: 1, walls: [], openings: [], rooms: [], items: [], slabs: [], sections: [], meta: { wallH: 280, wallT: 20 }, levels: [] };
  for (let i = 0; i < g.n; i++) P.walls.push({ id: `wa${i}`, a: { ...g.pts[i] }, b: { ...g.pts[i + 1] }, t: 20, h: 0, arc: { id: 'arc1', i, off: 0 } });
  P.walls.push({ id: 'wl', a: { x: 0, y: 0 }, b: { x: 0, y: 400 }, t: 20 }, { id: 'wr', a: { x: 600, y: 0 }, b: { x: 600, y: 400 }, t: 20 });
  const mid = P.walls[Math.floor(g.n / 2)];
  P.openings.push({ id: 'oa', wallId: mid.id, type: 'window', pos: Math.hypot(mid.b.x - mid.a.x, mid.b.y - mid.a.y) / 2, w: 8, h: 140, sill: 90 });
  return P;
}

test('yay parametreleri: yarıçap, açılar, yay boyu, kiriş, ok yüksekliği', () => {
  const A = arcParameters(arcPlan(), 'arc1');
  const R = (150 * 150 + 300 * 300) / (2 * 150);   // ok h, kiriş yarısı c: R = (h² + c²) / 2h
  assert.ok(Math.abs(A.radius - R) <= ARC_TOL, `${A.radius} ≈ ${R}`);
  assert.equal(A.chordLength, 600); assert.ok(Math.abs(A.sagitta - 150) < 0.5);
  assert.ok(Math.abs(A.arcLength - Math.abs(A.sweep) * Math.PI / 180 * A.radius) < 0.05);
  assert.ok(A.segmentLength <= A.arcLength + 0.01 && A.segmentLength > A.arcLength * 0.999, 'parçalı boy ≈ yay boyu');
  assert.equal(A.geometry, 'legacy');
});

test('setArcGeometry: yarıçap / ok değişir, uçlar sabit, parça sayısı korunur, geri alma birebir', () => {
  const P = arcPlan(), j0 = JSON.stringify(P), A0 = arcParameters(P, 'arc1');
  const r = runCommand(P, { op: 'setArcGeometry', arcId: 'arc1', radius: 500 });
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  const A = arcParameters(P, 'arc1');
  assert.ok(Math.abs(A.radius - 500) <= ARC_TOL, String(A.radius));
  assert.equal(A.segments, A0.segments); assert.equal(A.chordLength, 600);
  assert.deepEqual(P.walls.find(w => w.id === 'wl').a, { x: 0, y: 0 }, 'bağlı düz duvar yerinde');
  const o = P.openings[0], host = P.walls.find(w => w.id === o.wallId), L = Math.hypot(host.b.x - host.a.x, host.b.y - host.a.y);
  assert.ok(o.pos - o.w / 2 >= -0.01 && o.pos + o.w / 2 <= L + 0.01, 'açıklık parçaya sığıyor');
  assert.equal(runCommand(P, { op: 'setArcGeometry', arcId: 'arc1', sagitta: 80 }).ok, true);
  assert.ok(Math.abs(arcParameters(P, 'arc1').sagitta - 80) < 0.5);
  // geri al: iki komut
  const Q = arcPlan(), p1 = runCommand(Q, { op: 'setArcGeometry', arcId: 'arc1', radius: 500 }).patch, p2 = runCommand(Q, { op: 'setArcGeometry', arcId: 'arc1', sagitta: 80 }).patch;
  applyPatch(Q, p2, 'undo'); applyPatch(Q, p1, 'undo'); assert.equal(JSON.stringify(Q), j0);
});

test('setArcGeometry reddi: kiriş yarısından küçük yarıçap, sığmayan açıklık, bilinmeyen yay — kök değişmez', () => {
  const P = arcPlan(), j = JSON.stringify(P);
  assert.match(runCommand(P, { op: 'setArcGeometry', arcId: 'arc1', radius: 200 }).errors[0], /kiriş yarısından/);
  assert.match(runCommand(P, { op: 'setArcGeometry', arcId: 'yok', radius: 400 }).errors[0], /Yay bulunamadı/);
  const o = P.openings[0], host = P.walls.find(w => w.id === o.wallId), L = Math.hypot(host.b.x - host.a.x, host.b.y - host.a.y);
  o.w = +(L - 0.3).toFixed(2); o.pos = L / 2; const j2 = JSON.stringify(P);
  const r = runCommand(P, { op: 'setArcGeometry', arcId: 'arc1', sagitta: 5 });   // neredeyse düz: parçalar kısalır → açıklık sığmaz
  assert.equal(r.ok, false); assert.match(r.errors[0], /sığmıyor/);
  assert.equal(JSON.stringify(P), j2, 'reddedilen komut kökü değiştirmez');
  o.w = 8; assert.equal(runCommand(P, { op: 'setArcGeometry', arcId: 'arc1', sagitta: 5 }).ok, true, 'küçük açıklıkla kabul');
});

test('yay duvar geometrisi eski yaklaşımda kalır ve raporlanır (ARC_LEGACY); çözücü ve artımlı yol güvenli', () => {
  const P = arcPlan(), R = { meta: {} }, g = levelWallGeometry(R, P);
  assert.ok(g.issues.some(i => i.code === 'ARC_LEGACY'));
  assert.ok(solve(P).ok);
  runCommand(P, { op: 'setArcGeometry', arcId: 'arc1', radius: 450 });
  const inc = levelWallGeometry(R, P), full = levelWallGeometry(R, JSON.parse(JSON.stringify(P)), { full: true });
  assert.equal(JSON.stringify([...inc.walls.keys()]), JSON.stringify([...full.walls.keys()]));
});
