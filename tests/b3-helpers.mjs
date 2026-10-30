// B3 testleri için ortak yardımcılar (test dosyası değildir)
import { levelWallGeometry } from '../js/bim/wallgeom.js';
const r6 = v => Math.round(v * 1e6) / 1e6;
/* karşılaştırma imzası: birleşimler, duvar başına katman çokgenleri (koordinat), sorunlar, ham çakışma */
export function geoSig(g) {
  const walls = [...g.walls.values()].map(S => [S.id, S.legacy, S.layers.map(l => [l.idx, l.mat, l.prio, l.pieces.map(p => p.map(q => [r6(q.x), r6(q.y)]))])]).sort((a, b) => a[0] < b[0] ? -1 : 1);
  const joins = g.joins.joins.map(j => j.id).sort();
  const issues = g.issues.map(i => `${i.code}:${(i.ids || []).join(',')}`).sort();
  return JSON.stringify({ walls, joins, issues, raw: g.diag.rawOverlaps.length });
}
export const fullSig = (R, P) => geoSig(levelWallGeometry(R, JSON.parse(JSON.stringify(P)), { full: true }));
/* ızgara plan: n × n hücre, kompozit duvarlar, kapılar */
export function gridPlan(n, { cell = 400 } = {}) {
  const P = { v: 1, walls: [], openings: [], rooms: [], items: [], slabs: [], sections: [], meta: { wallH: 280, wallT: 20 }, levels: [] };
  for (let i = 0; i <= n; i++) for (let j = 0; j < n; j++) {
    P.walls.push({ id: `h${i}_${j}`, a: { x: j * cell, y: i * cell }, b: { x: (j + 1) * cell, y: i * cell }, t: i % n ? 14 : 26.5, comp: i % n ? 'ic-tugla' : 'dis-tugla-eps' });
    P.walls.push({ id: `v${i}_${j}`, a: { x: i * cell, y: j * cell }, b: { x: i * cell, y: (j + 1) * cell }, t: i % n ? 14 : 26.5, comp: i % n ? 'ic-tugla' : 'dis-tugla-eps' });
  }
  P.walls.filter((w, k) => k % 5 === 0).forEach(w => P.openings.push({ id: 'o' + w.id, wallId: w.id, type: 'door', pos: 200, w: 90, h: 210, sill: 0 }));
  return P;
}
