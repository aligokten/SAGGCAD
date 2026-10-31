// B3 performans ölçümü (isteğe bağlı): node tests/bench/b3.bench.mjs [duvar sayıları, virgülle]
// Izgara plan (kompozit duvarlar, her 5. duvarda kapı, her 4. düğümde kolon). Her ölçüm: ısınmadan sonra medyan.
import { createBim } from '../../js/bim/api.js';
import { runCommand } from '../../js/bim/commands.js';
import { History } from '../../js/bim/history.js';
import { levelWallGeometry, wallPrisms, wallQuantities, GEO_STATS } from '../../js/bim/wallgeom.js';
import { prismFaces } from '../../js/bim/mesh.js';
import os from 'node:os';

function gridPlan(n, cell = 400) {
  const P = { v: 1, walls: [], openings: [], rooms: [], items: [], dims: [], labels: [], rails: [], stairs: [], slabs: [], sections: [], meta: { wallH: 280, wallT: 20 }, levels: [] };
  for (let i = 0; i <= n; i++) for (let j = 0; j < n; j++) {
    const ext = !(i % n);
    P.walls.push({ id: `h${i}_${j}`, a: { x: j * cell, y: i * cell }, b: { x: (j + 1) * cell, y: i * cell }, t: ext ? 26.5 : 14, comp: ext ? 'dis-tugla-eps' : 'ic-tugla' });
    P.walls.push({ id: `v${i}_${j}`, a: { x: i * cell, y: j * cell }, b: { x: i * cell, y: (j + 1) * cell }, t: ext ? 26.5 : 14, comp: ext ? 'dis-tugla-eps' : 'ic-tugla' });
    if ((i + j) % 4 === 0) P.items.push({ id: `c${i}_${j}`, type: 'kolon', x: i * cell, y: j * cell, w: 30, d: 30, h: 0, z: 0, rot: 0, mat: 'betonarme', struct: true, bimTop: { mode: 'level', off: 0 } });
  }
  P.walls.forEach((w, k) => { if (k % 5 === 0) P.openings.push({ id: 'o' + w.id, wallId: w.id, type: 'door', pos: 200, w: 90, h: 210, sill: 0 }); });
  return P;
}
const med = a => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const t = fn => { const t0 = performance.now(); fn(); return performance.now() - t0; };
const rep = (fn, n) => med(Array.from({ length: n }, (_, i) => t(() => fn(i))));
const f = v => +v.toFixed(v < 10 ? 2 : 1);

const sizes = (process.argv[2] || '100,500,2000,5000').split(',').map(Number), rows = [];
for (const N of sizes) {
  const n = Math.max(2, Math.round((-2 + Math.sqrt(4 + 8 * N)) / 4)), R = gridPlan(n), meta = R.meta;   // 2n(n+1) ≈ N
  const row = { walls: R.walls.length, elements: 0 };
  // ilk yükleme: BIM modeli + rapor + birleşim geometrisi + prizmalar
  row.initialLoadMs = f(t(() => { const b = createBim(() => R, { getVersion: () => 0 }); row.elements = b.report().elements; levelWallGeometry(R, R, { full: true }); wallPrisms(R, R, meta); }));
  row.fullGeometryMs = f(rep(() => levelWallGeometry(R, R, { full: true }), 3));
  const mid = R.walls[Math.floor(R.walls.length / 2) + n].id, W = () => R.walls.find(w => w.id === mid);
  // tek duvar: kalınlık (artımlı geometri), komutla uç taşıma (komut + artımlı geometri)
  const inc0 = GEO_STATS.incremental;
  row.singleWallGeometryMs = f(rep(i => { W().t = i % 2 ? 20 : 14; levelWallGeometry(R, R); }, 30));
  row.incrementalUsed = GEO_STATS.incremental - inc0;
  const w0 = { ...W() }, node = w0.b;
  row.moveEndCmdMs = f(rep(i => { const r = runCommand(R, { op: 'moveWallEnd', id: mid, end: 'b', to: { x: node.x + (i % 2 ? 10 : 0), y: node.y } }); if (!r.ok) throw new Error(r.errors[0]); levelWallGeometry(R, R); }, 15));
  // 3D (CPU kısmı): artımlı prizmalar + değişen duvar ve komşularının yüzleri (plan3d.update ile aynı halka)
  row.update3dCpuMs = f(rep(i => {
    W().t = i % 2 ? 20 : 14;
    const { byWall } = wallPrisms(R, R, meta), ids = new Set([mid]);
    const bb = l => l.reduce((b, pr) => pr.poly.reduce((c, q) => ({ x0: Math.min(c.x0, q.x), y0: Math.min(c.y0, q.y), x1: Math.max(c.x1, q.x), y1: Math.max(c.y1, q.y) }), b), { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity });
    const boxes = new Map([...byWall].map(([id, l]) => [id, bb(l)])), hit = (a, b) => a.x0 <= b.x1 + 0.5 && b.x0 <= a.x1 + 0.5 && a.y0 <= b.y1 + 0.5 && b.y0 <= a.y1 + 0.5;
    const ring = s => { const out = new Set(s), bx = [...s].map(id => boxes.get(id)); for (const [id, b] of boxes) if (bx.some(x => hit(x, b))) out.add(id); return out; };
    prismFaces([...ring(ring(ids))].flatMap(id => byWall.get(id)));
  }, 15));
  row.full3dCpuMs = f(rep(() => { levelWallGeometry(R, R, { full: true }); prismFaces(wallPrisms(R, R, meta).prisms); }, 2));
  row.quantitiesMs = f(rep(i => { W().t = i % 2 ? 20 : 14; wallQuantities(R, R, meta); }, 10));
  // bağlı eleman: kat yüksekliği (kata bağlı kolon / duvar) komutu
  row.levelHeightCmdMs = f(rep(i => { const r = runCommand(R, { op: 'setLevelHeight', level: 0, height: i % 2 ? 300 : 280 }); if (!r.ok) throw new Error(r.errors[0]); }, 5));
  // BIM raporu (değişiklikten sonra yeniden kurulum)
  let v = 0; const bim = createBim(() => R, { getVersion: () => v }); bim.report();
  row.bimReportAfterChangeMs = f(rep(() => { v++; bim.report(); }, 3));
  // geri al / yinele (merkezi günlük) + artımlı geometri
  const H = new History(() => R), r = runCommand(R, { op: 'setInstanceParam', id: mid, key: 'thickness', value: 18 }); H.record(r.patch, 'x'); levelWallGeometry(R, R);
  row.undoRedoMs = f(rep(i => { H.step(i % 2 ? 'redo' : 'undo'); levelWallGeometry(R, R); }, 20));
  rows.push(row);
  console.error(JSON.stringify(row));
}
console.log(JSON.stringify({ node: process.version, cpu: os.cpus()[0]?.model, cores: os.cpus().length, fallback: GEO_STATS.fallback, rows }, null, 2));
