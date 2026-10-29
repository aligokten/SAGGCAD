// BIM servis katmanı ölçümü (isteğe bağlı): node tests/bench/bim.bench.mjs [duvar sayısı]
// İçerik imzası (getVersion yok, B1 davranışı) ile editör sürümü (getVersion, B2A) karşılaştırılır.
import { createBim } from '../../js/bim/api.js';
import { planCommand } from '../../js/bim/commands.js';

const N = +process.argv[2] || 2000;
const R = { v: 1, walls: [], openings: [], rooms: [], items: [], dims: [], labels: [], rails: [], stairs: [], slabs: [], sections: [], meta: { wallH: 280, wallT: 15 }, levels: [] };
for (let i = 0; i < N; i++) {
  const x = (i % 50) * 400, y = Math.floor(i / 50) * 400;
  R.walls.push({ id: 'w' + i, a: { x, y }, b: { x: x + 380, y }, t: 20, h: 0, kind: i % 3 ? 'ic' : 'dis', comp: i % 3 ? 'ic-tugla' : 'dis-tugla-eps' });
  if (i % 2) R.openings.push({ id: 'o' + i, wallId: 'w' + i, type: 'window', pos: 190, w: 120, h: 140, sill: 90 });
  if (i % 4 === 0) R.items.push({ id: 'c' + i, type: 'kolon', x, y, w: 30, d: 30, h: 280, z: 0, rot: 0, mat: 'betonarme', struct: true });
}
const time = (fn, n = 1) => { const t = performance.now(); for (let i = 0; i < n; i++) fn(i); return (performance.now() - t) / n; };
const Q = 200, ids = R.walls.map(w => w.id);
const query = b => i => { b.getElement(ids[i % ids.length]); b.resolveElementParameters(ids[(i * 7) % ids.length]); };
const sig = createBim(() => R); sig.report();
let v = 0; const ver = createBim(() => R, { getVersion: () => v }); ver.report();
const out = {
  elements: sig.report().elements,
  firstBuildMs: +time(() => createBim(() => R, { getVersion: () => 0 }).report()).toFixed(1),
  querySignatureMs: +time(query(sig), Q).toFixed(3),
  queryVersionMs: +time(query(ver), Q).toFixed(3),
  reportCachedMs: +time(() => ver.report(), Q).toFixed(4),
  typeUsageCachedMs: +time(() => ver.typeUsage(), Q).toFixed(4),
  rebuildAfterChangeMs: +time(() => { v++; ver.report(); }, 5).toFixed(1),
  planAssign500Ms: (() => { const r = planCommand(R, { op: 'duplicateType', from: 'DIS-DUV-01', id: 'DIS-DUV-02', name: 'x' }); return r.ok ? +time(() => planCommand(R, { op: 'assignType', ids: ids.slice(0, 500), typeId: 'DIS-DUV-01' }), 3).toFixed(1) : null; })(),
  builds: { signature: sig.stats().builds, version: ver.stats().builds },
};
console.log(JSON.stringify(out, null, 2));
