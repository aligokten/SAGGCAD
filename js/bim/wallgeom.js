/* ═══ BIM çekirdeği — ortak duvar geometrisi ve katman temizliği (B2B-2) ═══
 * Her duvar katmanı, birleşim grafiğine (joins.js) göre kırpılmış ayrık dışbükey çokgenlerle temsil edilir.
 * 2D plan, 3D model, kesit / görünüş ve metraj aynı çokgenleri kullanır; böylece birleşimde boşluk ya da çift hacim
 * oluşmaz. Hesap belirlenimcidir ve kayda yazılmaz (kullanıcının girdiği duvar koordinatları değişmez).
 *
 * Katman önceliği (0–9; yüksek olan birleşimde sürer):
 *   9 taşıyıcı çekirdek · 7 taşıyıcı olmayan ana katman · 6 diğer kâgir / beton katman · 4 ısı / ses yalıtımı ·
 *   3 su / buhar yalıtımı · 2 levha, hava boşluğu · 1 sıva, kaplama
 * Projeye özel öncelik kompozit katmanının 3. değeri olarak saklanır ([malzeme, kalınlık, öncelik]); yoksa yukarıdaki
 * varsayılan malzeme grubundan türetilir (eski kompozitler yeniden yazılmaz).
 *
 * Birleşim kuralları (köşe bölgesi = iki duvar şeridinin kesişimi; katman bantlarıyla hücrelere bölünür):
 *   L  çekirdek–çekirdek: yüksek öncelik sürer, eşitse gönye (köşegen) · çekirdek, karşı duvarın iç katmanlarını geçip
 *      onun çekirdeğine ulaşır · dış katmanlar köşeyi sarar (resim çerçevesi: dışa yakın olan sürer; aynı derinlikte
 *      öncelik, o da eşitse köşegen) · iç katmanlar iç köşede aynı kuralla buluşur
 *   T  kol duvarın her katmanı ana duvarın katmanlarını yakın yüzden başlayarak, öncelikleri kendisinden düşük olduğu
 *      sürece geçer; ilk eşit / yüksek öncelikli katmanda durur. Ana duvar süreklidir.
 *   X  kesişim hücresi öncelik yüksek olana; eşitse (belirlenimci) kimliği önce gelen duvara
 *   I  uçlar düğümde dik kesilir · STAR açıortaylarla bölünür · serbest uç işaretlenen noktada biter
 *   LEGACY (yay duvar içeren düğüm) eski yarım kalınlık uzatması korunur ve sorun olarak raporlanır (B3)
 */
import { analyzeJoins } from './joins.js';
import { sub, add, mul, dot, cross, len, norm, perp, hp, hpThrough, hpFlip, clipAll, diffAll, bigQuad, area, absArea, interArea, lineX, edgeCoverage, centroid } from './geom2d.js';
import { compOf, compThickness, matOf, wallKind } from '../materials.js';
import { V, wallExt } from '../plan-geom.js';

export const PRIO_LABEL = { 9: 'Taşıyıcı çekirdek', 8: 'Taşıyıcı', 7: 'Ana katman', 6: 'Kâgir / beton', 5: 'Dolgu', 4: 'Yalıtım', 3: 'Su / buhar yalıtımı', 2: 'Levha / boşluk', 1: 'Sıva / kaplama', 0: 'En düşük' };
const GROUP_PRIO = { tasiyici: 6, kagir: 6, metal: 6, dolgu: 5, yalitim: 4, su: 3, levha: 2, bosluk: 2, siva: 1, kaplama: 1 };
export const GENERIC_MAT = { k: '', t: 'Genel', col: '#24272B', hat: 'yok', generic: true };

/* katman önceliği */
export function layerPrio(R, comp, i, struct = false) {
  const L = comp?.layers?.[i]; if (!L) return struct ? 9 : 7;
  if (Number.isFinite(+L[2]) && L[2] !== null && L[2] !== '') return Math.max(0, Math.min(9, Math.round(+L[2])));
  const m = matOf(R, L[0]);
  if (i === (comp.core ?? 0)) return struct || m.g === 'tasiyici' ? 9 : 7;
  return GROUP_PRIO[m.g] ?? 2;
}
/* duvarın kompoziti (structure.js wallComp ile aynı kural; geometri modülü çizimden bağımsız kalsın diye burada) */
function compOfWall(R, w, T) {
  const c = compOf(R, w.comp); if (c) return c;
  if (!w.mat) return null;
  const k = wallKind(w)?.k;
  return { k: '', t: matOf(R, w.mat).t, use: k === 'ic' || k === 'hafif' ? 'wall-int' : 'wall-ext', layers: [[w.mat, w.t || T]], core: 0 };
}
/* katman bantları (eksenden normal yönünde ötelenme aralıkları) */
export function wallLayers(R, w, T) {
  const t = +w.t || +T || 15, comp = compOfWall(R, w, T), struct = !!w.struct;
  if (!comp) return [{ idx: 0, mat: '', m: GENERIC_MAT, lo: -t / 2, hi: t / 2, core: true, prio: struct ? 9 : 7, generic: true }];
  const tot = compThickness(comp) || t, k = t / tot, sd = w.lflip ? -1 : 1, core = comp.core ?? 0;
  let cum = 0;
  return comp.layers.map(([mk, d], i) => {
    const o0 = sd * (t / 2 - cum * k), o1 = sd * (t / 2 - (cum + (+d || 0)) * k); cum += +d || 0;
    return { idx: i, mat: mk, m: matOf(R, mk), lo: Math.min(o0, o1), hi: Math.max(o0, o1), core: i === core, prio: layerPrio(R, comp, i, struct) };
  }).filter(l => l.hi - l.lo > 1e-6);
}

/* şerit yarı düzlemleri: eksenden [lo, hi] ötelenme aralığı */
const bandHP = (ax, lo, hi) => [hp(ax.n, dot(ax.n, ax.a) + lo), hp(mul(ax.n, -1), -(dot(ax.n, ax.a) + hi))];
const sideSign = v => (v > 1e-9 ? 1 : v < -1e-9 ? -1 : 0);

/* ── ana hesap: bir katın duvar geometrisi ── */
const CACHE = new WeakMap();
function sigOf(R, P, T) {
  let s; try { s = JSON.stringify([P.walls, R?.meta?.composites || null, R?.meta?.materials || null, T]); } catch { return Math.random(); }
  let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return `${s.length}:${h >>> 0}`;
}
export function levelWallGeometry(R, P, { T } = {}) {
  const wallT = +(T ?? P?.meta?.wallT ?? R?.meta?.wallT) || 15;
  if (P && typeof P === 'object') { const c = CACHE.get(P), sg = sigOf(R, P, wallT); if (c && c.sig === sg) return c.res; const res = compute(R, P, wallT); CACHE.set(P, { sig: sg, res }); return res; }
  return compute(R, P, wallT);
}

function compute(R, P, wallT) {
  const Gj = analyzeJoins(P, { T: wallT }), issues = Gj.issues.slice(), W = new Map();
  for (const ax of Gj.axes.values()) {
    const layers = wallLayers(R, ax.w, wallT).map(l => ({ ...l, band: bandHP(ax, l.lo, l.hi), add: [], cut: [] }));
    const free = { a: [[hp(ax.u, dot(ax.u, ax.a))]], b: [[hp(mul(ax.u, -1), -dot(ax.u, ax.b))]] };
    W.set(ax.id, { id: ax.id, ax, layers, ends: { ...free }, legacy: ax.arc, joins: { a: null, b: null, body: [] } });
  }
  const R0 = (ax, at) => bigQuad(at, ax.t * 20 + 2000);
  const cell = (at, h1, h2) => clipAll(bigQuad(at, 5000), [...h1, ...h2]);
  // yakın yüz yarı düzlemi: x tarafındaki duvarın gövdesi için, H duvarının (d yönünden bakan) yakın yüzünün ötesi
  const nearFace = (H, d) => { const s = sideSign(dot(d, H.n)) || 1, n = mul(H.n, s); return hp(n, dot(n, H.a) + H.t / 2); };
  const sideOf = (at, d) => hpThrough(at, d);

  for (const j of Gj.joins) {
    const ms = j.members.map(m => ({ ...m, S: W.get(m.id) })).filter(m => m.S);
    for (const m of ms) { if (m.end) m.S.joins[m.end] = j; else m.S.joins.body.push(j); }
    if (j.kind === 'LEGACY') {
      for (const m of ms) if (!m.S.legacy && m.end) {
        const e = wallExt(P, m.S.ax.w)[m.end] || 0, ax = m.S.ax;
        m.S.ends[m.end] = [[m.end === 'a' ? hp(ax.u, dot(ax.u, ax.a) - e) : hp(mul(ax.u, -1), -(dot(ax.u, ax.b) + e))]];
      }
      issues.push({ severity: 'info', code: 'ARC_LEGACY', ids: ms.map(m => m.id), id: ms[0]?.id, msg: `Yay duvar birleşimi (${ms.map(m => m.id).join(', ')}): eski uzatma kuralı kullanıldı; katman temizliği B3'te` });
      continue;
    }
    if (j.kind === 'I') { for (const m of ms) m.S.ends[m.end] = [[sideOf(j.at, m.d)]]; continue; }
    if (j.kind === 'STAR') {
      const sorted = [...ms].sort((p, q) => Math.atan2(p.d.y, p.d.x) - Math.atan2(q.d.y, q.d.x));
      sorted.forEach((m, k) => {
        const hs = [sideOf(j.at, m.d)];
        for (const nb of [sorted[(k + 1) % sorted.length], sorted[(k - 1 + sorted.length) % sorted.length]]) {
          if (nb === m) continue;
          const gap = Math.acos(Math.max(-1, Math.min(1, dot(m.d, nb.d))));
          if (gap >= Math.PI - 1e-6) continue;
          const b = norm(add(m.d, nb.d)); let nn = perp(b); if (dot(nn, m.d) < 0) nn = mul(nn, -1);
          hs.push(hpThrough(j.at, nn));
        }
        m.S.ends[m.end] = [hs];
      });
      issues.push({ severity: 'info', code: 'STAR_JOIN', ids: ms.map(m => m.id), id: ms[0]?.id, msg: `${ms.length} duvarlık düğüm (${ms.map(m => m.id).join(', ')}): açıortay birleşimi; katman önceliği uygulanmadı` });
      continue;
    }
    if (j.kind === 'L') {
      const [A, B] = ms, a = A.S.ax, b = B.S.ax;
      A.S.ends[A.end] = [[nearFace(b, A.d)]]; B.S.ends[B.end] = [[nearFace(a, B.d)]];
      const cls = (S, ax, dOther) => {
        const inn = sideSign(dot(ax.n, dOther)) || 1, L = S.layers, core = L.findIndex(l => l.core) >= 0 ? L.findIndex(l => l.core) : L.reduce((bi, l, i) => (l.prio > L[bi].prio ? i : bi), 0);
        const cc = (L[core].lo + L[core].hi) / 2 * inn;
        const info = L.map((l, i) => ({ i, c: (l.lo + l.hi) / 2 * inn, side: i === core ? 'core' : ((l.lo + l.hi) / 2 * inn > cc ? 'in' : 'out'), prio: l.prio }));
        const outs = info.filter(x => x.side === 'out').sort((p, q) => p.c - q.c), ins = info.filter(x => x.side === 'in').sort((p, q) => q.c - p.c);
        outs.forEach((x, k) => { x.depth = k; }); ins.forEach((x, k) => { x.depth = k; }); info[core].depth = 0;
        return { inn, info };
      };
      const ca = cls(A.S, a, B.d), cb = cls(B.S, b, A.d);
      const owner = (p, q) => {
        if (p.side === 'core' && q.side === 'core') return p.prio > q.prio ? 1 : q.prio > p.prio ? 2 : 0;
        if (p.side === 'core') return q.side === 'in' ? 1 : 2;
        if (q.side === 'core') return p.side === 'in' ? 2 : 1;
        if (p.side !== q.side) return p.side === 'out' ? 1 : 2;
        if (p.depth !== q.depth) return p.depth < q.depth ? 1 : 2;
        if (p.prio !== q.prio) return p.prio > q.prio ? 1 : 2;
        return 0;
      };
      A.S.layers.forEach((la, i) => B.S.layers.forEach((lb, k) => {
        const c = cell(j.at, la.band, lb.band); if (!c) return;
        const o = owner(ca.info[i], cb.info[k]);
        if (o === 1) la.add.push(c); else if (o === 2) lb.add.push(c);
        else {
          // köşegen: hücrenin dış–dış köşesinden iç–iç köşesine
          const oa = ca.inn > 0 ? la.lo : la.hi, ia = ca.inn > 0 ? la.hi : la.lo, ob = cb.inn > 0 ? lb.lo : lb.hi, ib = cb.inn > 0 ? lb.hi : lb.lo;
          const P1 = lineX(add(a.a, mul(a.n, oa)), a.u, add(b.a, mul(b.n, ob)), b.u), P2 = lineX(add(a.a, mul(a.n, ia)), a.u, add(b.a, mul(b.n, ib)), b.u);
          const e = P1 && P2 ? sub(P2, P1) : null;
          if (!e || len(e) < 1e-9) { la.add.push(c); return; }
          let nn = perp(norm(e)); if (dot(nn, A.d) < 0) nn = mul(nn, -1);
          const h = hpThrough(P1, nn), c1 = clipAll(c, [h]), c2 = clipAll(c, [hpFlip(h)]);
          if (c1) la.add.push(c1); if (c2) lb.add.push(c2);
        }
      }));
      continue;
    }
    if (j.kind === 'T') {
      const stem = ms.find(m => m.role === 'stem'), hosts = ms.filter(m => m.role !== 'stem'), s = stem.S.ax;
      if (hosts.length === 1 && !hosts[0].end) {   // gövdede T
        const H = hosts[0].S, h = H.ax;
        stem.S.ends[stem.end] = [[nearFace(h, stem.d)]];
        crossT(stem, H, h, j.at, null);
      } else {   // üç uçlu düğüm: doğrusal çift (ana duvar) + kol
        for (const m of hosts) m.S.ends[m.end] = [[sideOf(j.at, m.d)]];
        stem.S.ends[stem.end] = hosts.map(m => [nearFace(m.S.ax, stem.d), sideOf(j.at, m.d)]);
        for (const m of hosts) crossT(stem, m.S, m.S.ax, j.at, sideOf(j.at, m.d));
      }
      continue;
    }
    if (j.kind === 'X') {
      if (ms.every(m => !m.end)) {   // gövde kesişimi
        const [A, B] = ms;
        resolveX(A.S, B.S, j.at, []);
      } else {   // dört uçlu düğüm: iki doğrusal çift
        for (const m of ms) m.S.ends[m.end] = [[sideOf(j.at, m.d)]];
        const g0 = ms.filter(m => m.group === 0), g1 = ms.filter(m => m.group === 1);
        for (const p of g0) for (const q of g1) resolveX(p.S, q.S, j.at, [sideOf(j.at, p.d), sideOf(j.at, q.d)]);
      }
      continue;
    }
  }
  /* T: kol katmanları ana duvar katmanlarını yakın yüzden düşük öncelik boyunca geçer */
  function crossT(stem, H, h, at, side) {
    const sg = sideSign(dot(stem.d, h.n)) || 1;
    const order = [...H.layers].sort((p, q) => (q.lo + q.hi) * sg - (p.lo + p.hi) * sg);   // yakından uzağa
    for (const ls of stem.S.layers) {
      for (const lh of order) {
        if (lh.prio >= ls.prio) break;
        const c = cell(at, ls.band, [...lh.band, ...(side ? [side] : [])]); if (!c) continue;
        ls.add.push(c); lh.cut.push(c);
      }
    }
  }
  /* X: kesişim hücreleri önceliğe göre */
  function resolveX(A, B, at, extra) {
    const [first, second] = A.id < B.id ? [A, B] : [B, A];
    for (const la of first.layers) for (const lb of second.layers) {
      const c = cell(at, la.band, [...lb.band, ...extra]); if (!c) continue;
      if (lb.prio > la.prio) la.cut.push(c); else lb.cut.push(c);
    }
  }

  // gövde çokgenleri + eklenen hücreler − kesilen hücreler
  for (const S of W.values()) {
    const ax = S.ax, base = R0(ax, V.lerp(ax.a, ax.b, 0.5));
    for (const l of S.layers) {
      let pieces = [];
      for (const ea of S.ends.a) for (const eb of S.ends.b) { const p = clipAll(base, [...l.band, ...ea, ...eb]); if (p) pieces.push(p); }
      pieces.push(...l.add);
      for (const c of l.cut) pieces = diffAll(pieces, c);
      l.pieces = pieces;
      delete l.add; delete l.cut;
    }
  }
  return { joins: Gj, walls: W, issues };
}

/* ── açıklık bölgeleri: duvar boyunca (s) ve düşey (z) aralıklar; dış bölgeler sonsuz (birleşim uzantıları dahil) ── */
export function wallZones(P, w, meta) {
  const H = +w.h || +meta.wallH || 280, B = Math.min(+w.z0 || 0, H - 1), L = V.dist(w.a, w.b), out = [];
  const ops = (P.openings || []).filter(o => o.wallId === w.id).sort((a, b) => a.pos - b.pos);
  let s = -Infinity;
  for (const o of ops) {
    const o0 = o.pos - o.w / 2, o1 = o.pos + o.w / 2, sill = B + (o.type === 'window' ? (+o.sill || 0) : 0), top = Math.min(H, sill + (+o.h || 0));
    out.push({ s0: s, s1: o0, z0: B, z1: H }, { s0: o0, s1: o1, z0: B, z1: Math.min(sill, H), op: o }, { s0: o0, s1: o1, z0: top, z1: H, op: o });
    s = o1;
  }
  out.push({ s0: s, s1: Infinity, z0: B, z1: H });
  return { zones: out.filter(z => z.z1 - z.z0 > 0.5 && z.s1 - z.s0 > 0.5), H, B, L };
}
/* çokgeni duvar boyunca [s0, s1] aralığına kırp */
export function clipS(poly, ax, s0, s1) {
  const hs = [];
  if (Number.isFinite(s0)) hs.push(hp(ax.u, dot(ax.u, ax.a) + s0));
  if (Number.isFinite(s1)) hs.push(hp(mul(ax.u, -1), -(dot(ax.u, ax.a) + s1)));
  return clipAll(poly, hs);
}

/* ── katın duvar prizmaları (3D, kesit, metraj): { wid, poly, z0, z1, m, core, prio, layer } ── */
export function wallPrisms(R, P, meta) {
  const geo = levelWallGeometry(R, P, { T: meta.wallT }), out = [];
  for (const S of geo.walls.values()) {
    if (S.legacy) continue;
    const { zones } = wallZones(P, S.ax.w, meta);
    for (const l of S.layers) for (const piece of l.pieces) for (const z of zones) {
      const p = clipS(piece, S.ax, z.s0, z.s1); if (!p) continue;
      out.push({ wid: S.id, poly: p, z0: z.z0, z1: z.z1, m: l.m, mat: l.mat, core: l.core, prio: l.prio, layer: l.idx, generic: !!l.generic });
    }
  }
  return { prisms: out, geo };
}

/* ── metraj: duvar başına taban alanı, hacim, malzeme hacimleri (birleşimde çift sayım yok) ── */
export function wallQuantities(R, P, meta) {
  const { prisms, geo } = wallPrisms(R, P, meta), per = new Map(), byMat = {};
  for (const S of geo.walls.values()) {
    if (S.legacy) continue;
    per.set(S.id, { id: S.id, footprint: S.layers.reduce((s, l) => s + l.pieces.reduce((q, p) => q + absArea(p), 0), 0) / 1e4, volume: 0, byMat: {} });
  }
  for (const pr of prisms) {
    const v = absArea(pr.poly) * (pr.z1 - pr.z0) / 1e6, q = per.get(pr.wid); if (!q) continue;
    const k = pr.mat || 'genel';
    q.volume += v; q.byMat[k] = (q.byMat[k] || 0) + v; byMat[k] = (byMat[k] || 0) + v;
  }
  const total = [...per.values()].reduce((s, q) => s + q.volume, 0);
  return { walls: per, byMat, total, legacy: [...geo.walls.values()].filter(S => S.legacy).map(S => S.id) };
}

/* ── doğrulama: katmanlar arası çakışma alanı (test ve tanı) ── */
export function overlapReport(geo, minArea = 0.01) {
  const all = [];
  for (const S of geo.walls.values()) for (const l of S.layers || []) for (const p of l.pieces || []) all.push({ wid: S.id, layer: l.idx, p });
  const bad = [];
  for (let i = 0; i < all.length; i++) for (let k = i + 1; k < all.length; k++) {
    const A = all[i], B = all[k], a = interArea(A.p, B.p);
    if (a > minArea) bad.push({ a: `${A.wid}#${A.layer}`, b: `${B.wid}#${B.layer}`, area: a });
  }
  return bad;
}

/* ── 2D kontur: kenarların örtüşmesine göre dış hat, malzeme sınırı ve çekirdek sınırı ── */
export function wallOutline(geo) {
  const edges = [];
  for (const S of geo.walls.values()) {
    if (S.legacy) continue;
    for (const l of S.layers) for (const p of l.pieces) for (let i = 0; i < p.length; i++) edges.push({ a: p[i], b: p[(i + 1) % p.length], key: `${l.mat}|${l.core ? 1 : 0}`, mat: l.mat, core: l.core, wid: S.id });
  }
  const cov = edgeCoverage(edges), contour = [], seams = [], cores = [];
  cov.forEach((parts, i) => {
    const e = edges[i], d = sub(e.b, e.a);
    for (const pt of parts) {
      const A = add(e.a, mul(d, pt.t0)), B = add(e.a, mul(d, pt.t1));
      if (!pt.others.length) { contour.push([A, B]); continue; }
      if (pt.others_i.some(k => k < i)) continue;   // ortak kenar bir kez
      const o = edges[pt.others_i[0]];
      if (o.mat !== e.mat) (o.core !== e.core ? cores : seams).push([A, B]);
      else if (o.core !== e.core) cores.push([A, B]);
    }
  });
  return { contour, seams, cores };
}

/* yardımcı: parça listesinin toplam alanı */
export const piecesArea = ps => ps.reduce((s, p) => s + absArea(p), 0);
export { centroid, area };
