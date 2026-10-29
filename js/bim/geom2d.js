/* ═══ BIM çekirdeği — 2D geometri çekirdeği (B2B) ═══
 * Duvar birleşimlerinde kullanılan saf geometri işlemleri; çizim / DOM bilgisi yoktur.
 * Tüm bölgeler dışbükey çokgen listeleriyle temsil edilir:
 *   • yarı düzlem kırpma (Sutherland–Hodgman) — dışbükey çokgende kararlı, kendini kesen çıktı üretmez
 *   • dışbükey fark A \ B = ⋃ᵢ (A ∩ B'nin ilk i−1 kenarının içi ∩ i. kenarın dışı) — ayrık dışbükey parçalar
 *   • sıfır alanlı / iğne parçalar EPS_AREA altında atılır; yinelenen ardışık köşeler birleştirilir
 * Yön: alan işareti (y aşağı düzlemde) korunur; çıktılar saat yönünün tersine (polyArea > 0) normalize edilir.
 */
export const EPS = 1e-6;          // nokta / doğru karşılaştırma (cm)
export const EPS_AREA = 1e-4;     // bu alandan küçük parça atılır (cm²)

export const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
export const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y });
export const mul = (a, k) => ({ x: a.x * k, y: a.y * k });
export const dot = (a, b) => a.x * b.x + a.y * b.y;
export const cross = (a, b) => a.x * b.y - a.y * b.x;
export const len = a => Math.hypot(a.x, a.y);
export const norm = a => { const l = Math.hypot(a.x, a.y) || 1; return { x: a.x / l, y: a.y / l }; };
export const perp = u => ({ x: -u.y, y: u.x });

export function area(p) { let s = 0; for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; s += a.x * b.y - b.x * a.y; } return s / 2; }
export const absArea = p => Math.abs(area(p));
export const centroid = p => { const A = area(p); if (Math.abs(A) < EPS) return p.reduce((c, q) => ({ x: c.x + q.x / p.length, y: c.y + q.y / p.length }), { x: 0, y: 0 }); let cx = 0, cy = 0; for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length], f = a.x * b.y - b.x * a.y; cx += (a.x + b.x) * f; cy += (a.y + b.y) * f; } return { x: cx / (6 * A), y: cy / (6 * A) }; };

/* yarı düzlem: { n, c } → içerisi dot(n, x) − c ≥ 0 */
export const hp = (n, c) => ({ n, c });
export const hpThrough = (p, n) => ({ n, c: dot(n, p) });          // p'den geçen, n yönü içeride
export const hpFlip = h => ({ n: mul(h.n, -1), c: -h.c });
export const hpVal = (h, x) => dot(h.n, x) - h.c;

/* ardışık yinelenen / doğrusal köşeleri temizle; normalize yön */
export function clean(p) {
  const out = [];
  for (const q of p) { const l = out.at(-1); if (!l || Math.abs(l.x - q.x) > EPS || Math.abs(l.y - q.y) > EPS) out.push(q); }
  while (out.length > 1 && Math.abs(out[0].x - out.at(-1).x) <= EPS && Math.abs(out[0].y - out.at(-1).y) <= EPS) out.pop();
  // doğrusal ara köşeleri at (dışbükey çokgende güvenli)
  for (let i = 0; out.length > 3 && i < out.length;) {
    const a = out[(i - 1 + out.length) % out.length], b = out[i], c = out[(i + 1) % out.length];
    if (Math.abs(cross(sub(b, a), sub(c, b))) <= EPS * Math.max(1, len(sub(c, a)))) out.splice(i, 1); else i++;
  }
  if (out.length < 3 || absArea(out) < EPS_AREA) return null;
  return area(out) < 0 ? out.reverse() : out;
}
/* dışbükey çokgeni yarı düzlemle kırp */
export function clipHP(p, h) {
  if (!p || p.length < 3) return null;
  const out = [];
  for (let i = 0; i < p.length; i++) {
    const a = p[i], b = p[(i + 1) % p.length], fa = hpVal(h, a), fb = hpVal(h, b);
    if (fa >= -EPS) out.push(a);
    if ((fa > EPS && fb < -EPS) || (fa < -EPS && fb > EPS)) { const t = fa / (fa - fb); out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }); }
  }
  return clean(out);
}
export const clipAll = (p, hs) => hs.reduce((q, h) => q && clipHP(q, h), p);
/* dışbükey çokgenin kenar yarı düzlemleri (içe bakan) */
export function edgesHP(p) {
  const q = area(p) < 0 ? [...p].reverse() : p;
  return q.map((a, i) => { const b = q[(i + 1) % q.length], e = norm(sub(b, a)); return hpThrough(a, perp(e)); });
}
/* A \ B (ikisi de dışbükey) → ayrık dışbükey parçalar */
export const bbox = p => { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const q of p) { if (q.x < x0) x0 = q.x; if (q.y < y0) y0 = q.y; if (q.x > x1) x1 = q.x; if (q.y > y1) y1 = q.y; } return { x0, y0, x1, y1 }; };
export const bbHit = (a, b, e = 1e-9) => a.x0 < b.x1 - e && b.x0 < a.x1 - e && a.y0 < b.y1 - e && b.y0 < a.y1 - e;
export function diff(A, B) {
  if (!A) return [];
  if (!B || !bbHit(bbox(A), bbox(B)) || !overlaps(A, B)) return [A];
  const out = []; let rest = A;
  for (const h of edgesHP(B)) {
    if (!rest) break;
    const outside = clipHP(rest, hpFlip(h)); if (outside) out.push(outside);
    rest = clipHP(rest, h);
  }
  return out;
}
/* parça listesinden dışbükey çokgen çıkar */
export const diffAll = (pieces, B) => pieces.flatMap(p => diff(p, B));
/* kesişim alanı > EPS_AREA mı (dışbükey) */
export function interArea(A, B) { const r = clipAll(A, edgesHP(B)); return r ? absArea(r) : 0; }
export const overlaps = (A, B) => interArea(A, B) > EPS_AREA;

/* doğru kesişimi: p + s·u ile q + t·v → nokta | null (paralel) */
export function lineX(p, u, q, v) {
  const d = cross(u, v); if (Math.abs(d) < 1e-12) return null;
  const s = cross(sub(q, p), v) / d; return add(p, mul(u, s));
}
/* çok büyük dörtgen (merkez c, yarı kenar R) — sonsuz şeritleri kırpmak için başlangıç */
export const bigQuad = (c, R) => [{ x: c.x - R, y: c.y - R }, { x: c.x + R, y: c.y - R }, { x: c.x + R, y: c.y + R }, { x: c.x - R, y: c.y + R }];

/* ── kenar örtüşmesi: çizim konturu ve 3D yan yüz eleme için ──
 * edges: [{ a, b, key }] (key: malzeme / sahip). Aynı doğru üzerindeki kenarların örtüşen kısımları bulunur.
 * Dönüş: her kenar için [{ t0, t1, others: [key…] }] aralıkları (t: kenar boyunca 0..1). */
export function edgeCoverage(edges, tol = 1e-3) {
  const res = edges.map(() => []), items = [];
  edges.forEach((e, i) => {
    const d = sub(e.b, e.a), L = len(d); if (L < tol) return;
    let u = mul(d, 1 / L);
    if (u.x < -EPS || (Math.abs(u.x) <= EPS && u.y < 0)) u = mul(u, -1);   // yön bağımsız
    items.push({ i, u, ang: Math.atan2(u.y, u.x), off: dot(perp(u), e.a), s0: Math.min(dot(u, e.a), dot(u, e.b)), s1: Math.max(dot(u, e.a), dot(u, e.b)), fwd: dot(u, d) > 0 });
  });
  // aynı doğru: açı ve ötelenme toleransla kümelenir (yuvarlama sınırına düşen kenarlar ayrılmaz)
  items.sort((p, q) => p.ang - q.ang || p.off - q.off);
  const groups = []; let cur = [];
  const flush = () => { if (!cur.length) return; cur.sort((p, q) => p.off - q.off); let g = [cur[0]]; for (let k = 1; k < cur.length; k++) { if (cur[k].off - cur[k - 1].off <= tol) g.push(cur[k]); else { groups.push(g); g = [cur[k]]; } } groups.push(g); cur = []; };
  for (const it of items) { if (cur.length && it.ang - cur.at(-1).ang > 1e-6) flush(); cur.push(it); }
  flush();
  for (const g of groups) {
    if (g.length < 2) { for (const x of g) res[x.i] = [{ t0: 0, t1: 1, others: [] }]; continue; }
    for (const x of g) {
      const cuts = new Set([x.s0, x.s1]);
      for (const y of g) if (y !== x && y.s1 > x.s0 + tol && y.s0 < x.s1 - tol) { cuts.add(Math.max(x.s0, y.s0)); cuts.add(Math.min(x.s1, y.s1)); }
      const cs = [...cuts].sort((p, q) => p - q), out = [];
      for (let k = 0; k + 1 < cs.length; k++) {
        const s0 = cs[k], s1 = cs[k + 1]; if (s1 - s0 < tol) continue;
        const mid = (s0 + s1) / 2, others = g.filter(y => y !== x && y.s0 <= mid && y.s1 >= mid).map(y => edges[y.i].key);
        const T = s => x.fwd ? (s - x.s0) / (x.s1 - x.s0) : (x.s1 - s) / (x.s1 - x.s0);
        const t0 = T(s0), t1 = T(s1);
        out.push({ t0: Math.min(t0, t1), t1: Math.max(t0, t1), others, others_i: g.filter(y => y !== x && y.s0 <= mid && y.s1 >= mid).map(y => y.i) });
      }
      res[x.i] = out.sort((p, q) => p.t0 - q.t0);
    }
  }
  return res;
}
