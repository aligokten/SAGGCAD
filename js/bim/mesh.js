/* ═══ BIM çekirdeği — duvar prizmalarından 3D yüzey (B2B-4) ═══
 * Girdi: wallgeom.wallPrisms çıktısı ({ wid, poly (plan, cm), z0, z1 }). Çıktı: düzlemsel yüzler ve üçgen dizileri.
 * • Üst / alt yüz: her prizmanın çokgeni (dışbükey → yelpaze üçgenleme)
 * • Yan yüz: prizma kenarı boyunca; komşu prizmanın ortak kenarıyla örtüşen kısımda, komşunun yükseklik aralığı
 *   çıkarılır → birleşimlerde ve katman sınırlarında iç (çakışan) yüz kalmaz, açıklık kenarları (söve) kalır
 * • Denetim: kapalılık (Σ alan·normal ≈ 0), hacim (diverjans = prizma hacimleri), dışa bakan normal, iç yüz sayısı
 * Eksen: plan (x, y) + kot z. Three.js'e geçiş (x, z, y) bir yansımadır; toThree() üçgen sarımını bunun için çevirir.
 */
import { edgeCoverage, area as area2 } from './geom2d.js';

const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/* prizma yüzeyleri → [{ pts: [[x, y, z]…], n: [nx, ny, nz], pi (prizma), wid, kind: 'top'|'bottom'|'side' }] */
export function prismFaces(prisms, { tol = 1e-3 } = {}) {
  const faces = [], edges = [];
  prisms.forEach((pr, pi) => {
    const p = area2(pr.poly) < 0 ? [...pr.poly].reverse() : pr.poly;   // saat yönü tersi (yukarıdan bakış)
    faces.push({ pts: p.map(q => [q.x, q.y, pr.z1]), n: [0, 0, 1], pi, wid: pr.wid, kind: 'top' });
    faces.push({ pts: [...p].reverse().map(q => [q.x, q.y, pr.z0]), n: [0, 0, -1], pi, wid: pr.wid, kind: 'bottom' });
    for (let i = 0; i < p.length; i++) edges.push({ a: p[i], b: p[(i + 1) % p.length], key: pi, pi });
  });
  const cov = edgeCoverage(edges, tol);
  cov.forEach((parts, i) => {
    const e = edges[i], pr = prisms[e.pi], dx = e.b.x - e.a.x, dy = e.b.y - e.a.y, L = Math.hypot(dx, dy), n = [dy / L, -dx / L, 0];
    for (const part of parts) {
      const A = { x: e.a.x + dx * part.t0, y: e.a.y + dy * part.t0 }, B = { x: e.a.x + dx * part.t1, y: e.a.y + dy * part.t1 };
      // örtüşen komşuların yükseklik aralıkları çıkarılır
      let free = [[pr.z0, pr.z1]];
      for (const k of part.others_i || []) {
        const o = prisms[edges[k].pi]; if (edges[k].pi === e.pi) continue;
        free = free.flatMap(([u, v]) => { const lo = Math.max(u, o.z0), hi = Math.min(v, o.z1); if (hi - lo <= tol) return [[u, v]]; return [[u, lo], [hi, v]].filter(([x, y]) => y - x > tol); });
      }
      for (const [z0, z1] of free) faces.push({ pts: [[A.x, A.y, z0], [B.x, B.y, z0], [B.x, B.y, z1], [A.x, A.y, z1]], n, pi: e.pi, wid: pr.wid, kind: 'side' });
    }
  });
  return faces;
}

/* yüz alanı vektörü (Newell) */
const areaVec = pts => { const s = [0, 0, 0]; for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; s[0] += (a[1] - b[1]) * (a[2] + b[2]); s[1] += (a[2] - b[2]) * (a[0] + b[0]); s[2] += (a[0] - b[0]) * (a[1] + b[1]); } return s.map(v => v / 2); };

/* denetimler */
export function meshChecks(faces, prisms) {
  const sum = [0, 0, 0]; let vol = 0, inward = 0, maxA = 0;
  const cen = prisms.map(pr => { const n = pr.poly.length, c = pr.poly.reduce((s, q) => [s[0] + q.x / n, s[1] + q.y / n], [0, 0]); return [c[0], c[1], (pr.z0 + pr.z1) / 2]; });
  for (const f of faces) {
    const av = areaVec(f.pts); sum[0] += av[0]; sum[1] += av[1]; sum[2] += av[2]; maxA = Math.max(maxA, Math.hypot(...av));
    if (dot3(av, f.n) <= 0) inward++;   // sarım yönü normalle uyumsuz
    const fc = f.pts.reduce((s, q) => [s[0] + q[0] / f.pts.length, s[1] + q[1] / f.pts.length, s[2] + q[2] / f.pts.length], [0, 0, 0]);
    if (dot3(sub3(fc, cen[f.pi]), f.n) <= 0) inward++;   // normal prizmanın dışına bakmalı
    vol += dot3(fc, av) / 3;
  }
  const expected = prisms.reduce((s, pr) => s + Math.abs(area2(pr.poly)) * (pr.z1 - pr.z0), 0);
  // iç yüz: kalan yan yüzler arasında aynı düzlemde ve ters yönlü örtüşen çift olmamalı
  const side = faces.filter(f => f.kind === 'side');
  const ed = side.map((f, i) => ({ a: { x: f.pts[0][0], y: f.pts[0][1] }, b: { x: f.pts[1][0], y: f.pts[1][1] }, key: i }));
  let internal = 0;
  edgeCoverage(ed).forEach((parts, i) => { for (const p of parts) for (const k of p.others_i || []) { const A = side[i], B = side[k]; if (k > i && Math.min(A.pts[2][2], B.pts[2][2]) - Math.max(A.pts[0][2], B.pts[0][2]) > 1e-3) internal++; } });
  return { closure: Math.hypot(...sum), volume: vol, expected, inward, internal, faces: faces.length };
}

/* Three.js dizileri (metre): plan x → X, kot → Y, plan y → Z (yansıma: üçgen sarımı çevrilir) */
export function toThree(faces, scale = 0.01) {
  const pos = [], nor = [], groups = new Map();
  for (const f of faces) {
    const P = f.pts.map(q => [q[0] * scale, q[2] * scale, q[1] * scale]), N = [f.n[0], f.n[2], f.n[1]];
    const g = groups.get(f.wid) || groups.set(f.wid, { pos: [], nor: [] }).get(f.wid);
    for (let i = 1; i + 1 < P.length; i++) for (const v of [P[0], P[i + 1], P[i]]) { g.pos.push(...v); g.nor.push(...N); }   // [0, i+1, i]: yansıma düzeltmesi
  }
  for (const g of groups.values()) { pos.push(...g.pos); nor.push(...g.nor); }
  return { groups, pos, nor };
}
/* üçgen normali sarımla uyumlu mu (Three.js düzeninde) — test / tanı */
export function threeWindingOk(g) {
  let bad = 0;
  for (let i = 0; i < g.pos.length; i += 9) {
    const a = g.pos.slice(i, i + 3), b = g.pos.slice(i + 3, i + 6), c = g.pos.slice(i + 6, i + 9), n = g.nor.slice(i, i + 3);
    if (dot3(cross3(sub3(b, a), sub3(c, a)), n) <= 0) bad++;
  }
  return bad;
}
