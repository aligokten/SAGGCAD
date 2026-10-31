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
import { analyzeJoins, updateJoins, originOf } from './joins.js';
import { sub, add, mul, dot, cross, len, norm, perp, hp, hpThrough, hpFlip, clipAll, diffAll, bigQuad, area, absArea, interArea, lineX, edgeCoverage, centroid, bbox, bbHit } from './geom2d.js';
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

/* ── ana hesap: bir katın duvar geometrisi ──
 * B3-C: artımlı. Önbellek duvar başına kayıt imzası tutar; değişen duvar kümesi (D) için birleşim grafiği yerel
 * güncellenir (joins.updateJoins) ve yalnız etkilenen duvarların katman çokgenleri yeniden hesaplanır. Güvenli tam hesap:
 * ilk çağrı, kompozit / malzeme / varsayılan kalınlık değişimi, tekrar eden kimlik, büyük değişiklik, çakışma ayrıştırması
 * gereken durum ve `full: true`. Sonuç tam hesapla eşdeğerdir (tests/b3-incremental.test.mjs). */
const CACHE = new WeakMap();
export const GEO_STATS = { full: 0, incremental: 0, reused: 0, fallback: {}, last: null };   // last: son çağrının yolu (Model Sağlığı)
const hash = s => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return `${s.length}:${h >>> 0}`; };
function libSig(R, T) { try { return hash(JSON.stringify([R?.meta?.composites || null, R?.meta?.materials || null, T])); } catch { return Math.random(); } }
function wallSigs(P) {
  const m = new Map(); let dup = false;
  for (const w of Array.isArray(P.walls) ? P.walls : []) { if (!w || typeof w.id !== 'string') continue; if (m.has(w.id)) dup = true; m.set(w.id, JSON.stringify(w)); }
  return { m, dup };
}
export function levelWallGeometry(R, P, { T, full = false } = {}) {
  const wallT = +(T ?? P?.meta?.wallT ?? R?.meta?.wallT) || 15;
  if (!P || typeof P !== 'object') return compute(R, P, wallT);
  const c = CACHE.get(P) || CACHE.get(originOf(P)), lib = libSig(R, wallT), sigs = wallSigs(P);   // komut kopyası: özgün planın önbelleğinden
  const fullRun = why => { GEO_STATS.full++; GEO_STATS.last = { mode: 'full', why: why || 'ilk', walls: sigs.m.size }; if (why) GEO_STATS.fallback[why] = (GEO_STATS.fallback[why] || 0) + 1; const res = compute(R, P, wallT); CACHE.set(P, { lib, sigs: sigs.m, res }); return res; };
  if (full || !c) return fullRun(full ? 'istek' : null);
  if (c.lib !== lib) return fullRun('kütüphane');
  if (sigs.dup) return fullRun('tekrar eden kimlik');
  const D = new Set();
  for (const [id, sg] of sigs.m) if (c.sigs.get(id) !== sg) D.add(id);
  for (const id of c.sigs.keys()) if (!sigs.m.has(id)) D.add(id);
  if (!D.size) { GEO_STATS.reused++; GEO_STATS.last = { mode: 'reused', walls: sigs.m.size }; if (CACHE.get(P) !== c) CACHE.set(P, c); return c.res; }
  if (D.size > Math.max(64, sigs.m.size * 0.25)) return fullRun('büyük değişiklik');
  if ([...D].some(id => c.res.walls.get(id)?.legacy || P.walls.find(w => w.id === id)?.arc)) return fullRun('yay');
  const res = incremental(R, P, wallT, c.res, D);
  if (!res) return fullRun('yerel çakışma');
  GEO_STATS.incremental++; GEO_STATS.last = { mode: 'incremental', changed: D.size, affected: res.diag.incremental.affected.length, walls: sigs.m.size };
  CACHE.set(P, { lib, sigs: sigs.m, res });
  return res;
}
/* duvarın tüm parçalarının sınır kutusu (parça dizileri değişmez → dizi kimliğiyle önbellek) */
const BOX = new WeakMap(), SBOX = new WeakMap();
function wallBox(layerPieces) {
  let b = null;
  for (const arr of layerPieces) {
    let c = BOX.get(arr);
    if (c === undefined) { c = null; for (const p of arr) { const q = bbox(p); c = c ? { x0: Math.min(c.x0, q.x0), y0: Math.min(c.y0, q.y0), x1: Math.max(c.x1, q.x1), y1: Math.max(c.y1, q.y1) } : q; } BOX.set(arr, c); }
    if (c) b = b ? { x0: Math.min(b.x0, c.x0), y0: Math.min(b.y0, c.y0), x1: Math.max(b.x1, c.x1), y1: Math.max(b.y1, c.y1) } : c;
  }
  return b;
}
function incremental(R, P, wallT, prev, D) {
  const { G, affected } = updateJoins(prev.joins, P, D, { T: wallT });
  // önceki ayrıştırmalar etkilenen duvarlara dokunuyorsa sıra küresel: tam hesap
  if (prev.diag.resolved.some(r => affected.has(r.keep) || affected.has(r.lose) || D.has(r.keep) || D.has(r.lose))) return null;
  // eksenleri güncel kayıt nesnelerine bağla (önizleme / geri al kayıt nesnelerini yenileyebilir)
  const cur = new Map(P.walls.filter(w => w && typeof w.id === 'string').map(w => [w.id, w]));
  for (const [id, ax] of G.axes) { const w = cur.get(id); if (w && ax.w !== w) G.axes.set(id, { ...ax, w }); }
  const sub = compute(R, P, wallT, { Gj: G, scope: affected });
  const W = new Map();
  for (const id of G.axes.keys()) { const S = sub.walls.get(id) || prev.walls.get(id); if (S) W.set(id, S); }   // kayıt sırası
  // yeni çakışma (etkilenen duvar parçaları ↔ diğerleri) varsa tam hesap (ayrıştırma küresel ve sıralı)
  const items = [];
  // ayrıştırmada kırpılan (kaybeden) duvarlar: tam yolun ham çakışma denetimi gibi ayrıştırma ÖNCESİ parçalarla
  const pre = prev.diag.prePieces || new Map();
  const piecesOf = S => { const raw = !affected.has(S.id) && pre.get(S.id); return S.layers.map((l, k) => raw ? raw[k] : l.pieces); };
  const boxOf = S => { if (pre.has(S.id)) return wallBox(piecesOf(S)); let b = SBOX.get(S); if (b === undefined) { b = wallBox(piecesOf(S)); SBOX.set(S, b); } return b; };   // S oluştuktan sonra değişmez
  const hotBox = [];
  for (const id of affected) { const S = W.get(id); if (S) { const b = boxOf(S); if (b) hotBox.push(b); } }
  for (const S of W.values()) {
    const hot = affected.has(S.id);
    if (!hot) { const b = boxOf(S); if (!b || !hotBox.some(h => bbHit(h, b))) continue; }   // sıcak duvarlara değmeyen duvar çifte giremez
    const pcs = piecesOf(S);
    S.layers.forEach((l, k) => { for (const p of pcs[k]) items.push({ wid: S.id, layer: l.idx, p, bb: bbox(p), hot }); });
  }
  let bad = false;
  const hotRaw = [];   // ham çakışma raporu aynı duvarın katmanlarını da sayar (tam yoldaki overlapReport ile aynı ölçüt)
  piecePairs(items, (A, B) => {
    if (bad || !(A.hot || B.hot)) return;
    const a = interArea(A.p, B.p); if (!(a > 0.01)) return;
    if (A.wid !== B.wid) bad = true; else hotRaw.push({ a: `${A.wid}#${A.layer}`, b: `${B.wid}#${B.layer}`, area: a });
  });
  if (bad) return null;
  const resolved = prev.diag.resolved, hotOf = x => affected.has(x.split('#')[0]);
  const issues = [...G.issues, ...joinIssues(G), ...prev.issues.filter(i => i.code === 'GEOM_OVERLAP_RESOLVED')];
  return { joins: G, walls: W, issues, diag: { rawOverlaps: [...prev.diag.rawOverlaps.filter(o => !hotOf(o.a) && !hotOf(o.b)), ...hotRaw].sort((x, y) => (x.a + x.b < y.a + y.b ? -1 : 1)), resolved, prePieces: pre, incremental: { changed: [...D].sort(), affected: [...affected].sort() } } };
}
/* yay / çok uçlu düğüm bilgileri (tam ve artımlı yolda aynı) */
function joinIssues(Gj) {
  const out = [];
  for (const j of Gj.joins) {
    const ids = j.members.map(m => m.id);
    if (j.kind === 'LEGACY') out.push({ severity: 'info', code: 'ARC_LEGACY', ids, id: ids[0], msg: `Yay duvar birleşimi (${ids.join(', ')}): eski uzatma kuralı kullanıldı; katman temizliği B3'te` });
    if (j.kind === 'STAR') out.push({ severity: 'info', code: 'STAR_JOIN', ids, id: ids[0], msg: `${ids.length} duvarlık düğüm (${ids.join(', ')}): açıortay birleşimi; katman önceliği uygulanmadı` });
  }
  return out;
}

function compute(R, P, wallT, { Gj = analyzeJoins(P, { T: wallT }), scope = null } = {}) {
  const issues = scope ? [] : Gj.issues.slice(), W = new Map();
  // kapsam: yalnız etkilenen duvarlar ve birleşim ortakları (ortakların sonucu atılır)
  const joinsIn = scope ? Gj.joins.filter(j => j.members.some(m => scope.has(m.id))) : Gj.joins;
  const need = scope ? new Set(joinsIn.flatMap(j => j.members.map(m => m.id)).concat([...scope])) : null;
  for (const ax of Gj.axes.values()) {
    if (need && !need.has(ax.id)) continue;
    const layers = wallLayers(R, ax.w, wallT).map(l => ({ ...l, band: bandHP(ax, l.lo, l.hi), add: [], cut: [] }));
    const free = { a: [[hp(ax.u, dot(ax.u, ax.a))]], b: [[hp(mul(ax.u, -1), -dot(ax.u, ax.b))]] };
    W.set(ax.id, { id: ax.id, ax, layers, ends: { ...free }, legacy: ax.arc, joins: { a: null, b: null, body: [] } });
  }
  const R0 = (ax, at) => bigQuad(at, ax.t * 20 + 2000);
  const cell = (at, h1, h2) => clipAll(bigQuad(at, 5000), [...h1, ...h2]);
  // yakın yüz yarı düzlemi: x tarafındaki duvarın gövdesi için, H duvarının (d yönünden bakan) yakın yüzünün ötesi
  const nearFace = (H, d) => { const s = sideSign(dot(d, H.n)) || 1, n = mul(H.n, s); return hp(n, dot(n, H.a) + H.t / 2); };
  const sideOf = (at, d) => hpThrough(at, d);

  for (const j of joinsIn) {
    const ms = j.members.map(m => ({ ...m, S: W.get(m.id) })).filter(m => m.S);
    for (const m of ms) { if (m.end) m.S.joins[m.end] = j; else m.S.joins.body.push(j); }
    if (j.kind === 'LEGACY') {
      for (const m of ms) if (!m.S.legacy && m.end) {
        const e = wallExt(P, m.S.ax.w)[m.end] || 0, ax = m.S.ax;
        m.S.ends[m.end] = [[m.end === 'a' ? hp(ax.u, dot(ax.u, ax.a) - e) : hp(mul(ax.u, -1), -(dot(ax.u, ax.b) + e))]];
      }
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

  // gövde çokgenleri + eklenen hücreler − kesilen hücreler (kapsamda yalnız etkilenen duvarlar)
  for (const S of W.values()) {
    if (scope && !scope.has(S.id)) { W.delete(S.id); continue; }
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
  if (scope) return { walls: W };
  issues.push(...joinIssues(Gj));
  const raw = overlapReport({ walls: W });   // birleşim kurallarından sonra kalan çakışma (temiz birleşimlerde 0 olmalı)
  const snap = new Map([...W.values()].map(S => [S.id, S.layers.map(l => l.pieces)]));   // parçalar yerinde değişmez, diziler yenilenir
  const resolved = resolveOverlaps(W), prePieces = new Map([...new Set(resolved.map(r => r.lose))].map(id => [id, snap.get(id)]));
  if (resolved.length) issues.push({ severity: 'warning', code: 'GEOM_OVERLAP_RESOLVED', ids: [...new Set(resolved.flatMap(r => [r.keep, r.lose]))].sort(), id: resolved[0].lose,
    msg: `Üst üste binen duvar katmanları ayrıştırıldı (${[...new Set(resolved.map(r => `${r.keep}↔${r.lose}`))].join(', ')}); çift hacim metraja girmez — çizimde tekrar eden duvarları kontrol edin` });
  return { joins: Gj, walls: W, issues, diag: { rawOverlaps: raw, resolved, prePieces } };
}

/* son güvence: hâlâ çakışan katman parçaları (ör. aynı doğruda tekrar çizilmiş duvarlar) önceliğe göre ayrıştırılır —
 * yüksek öncelikli katman kalır, eşitse kimliği önce gelen duvar; diğerinden çakışan bölge çıkarılır */
function resolveOverlaps(W) {
  const all = [];
  for (const S of W.values()) for (const l of S.layers) for (const p of l.pieces) all.push({ S, l, p, bb: bbox(p) });
  const pairs = [];
  piecePairs(all, (A, B) => { if (A.S !== B.S && interArea(A.p, B.p) > 0.01) pairs.push([A, B]); });
  if (!pairs.length) return [];
  pairs.sort(([a, b], [c, d]) => (a.S.id + b.S.id < c.S.id + d.S.id ? -1 : 1));
  const out = [];
  // kaybedenin parçası değişince güncel parçaları üzerinden çıkarılır (parça → güncel liste eşlemesi)
  const cur = new Map(all.map(x => [x, [x.p]]));
  for (const [A, B] of pairs) {
    const keepA = A.l.prio > B.l.prio || (A.l.prio === B.l.prio && A.S.id < B.S.id), [K, L] = keepA ? [A, B] : [B, A];
    const before = cur.get(L), keepPieces = cur.get(K);
    let rest = before;
    for (const kp of keepPieces) rest = diffAll(rest, kp);
    const lost = before.reduce((s, q) => s + absArea(q), 0) - rest.reduce((s, q) => s + absArea(q), 0);
    if (lost <= 0.01) continue;
    L.l.pieces = L.l.pieces.filter(q => !before.includes(q)).concat(rest);
    cur.set(L, rest);
    out.push({ keep: K.S.id, lose: L.S.id, area: lost });
  }
  return out;
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
/* duvar başına prizma önbelleği (B3-C): geometri nesnesi (S) aynı ve açıklık bölgeleri aynıysa önceki dizi aynen döner —
 * dizi kimliği "değişmedi" anlamına gelir (3D kısmi güncelleme ve metraj bunu kullanır) */
const PRISMS = new WeakMap();
export function wallPrisms(R, P, meta) {
  const geo = levelWallGeometry(R, P, { T: meta.wallT }), out = [], byWall = new Map(), rec = new Map((P.walls || []).map(w => [w?.id, w]));
  for (const S of geo.walls.values()) {
    if (S.legacy) continue;
    const { zones } = wallZones(P, rec.get(S.id) || S.ax.w, meta), key = JSON.stringify(zones.map(z => [z.s0, z.s1, z.z0, z.z1]));
    let c = PRISMS.get(S);
    if (!c || c.key !== key) {
      const list = [];
      for (const l of S.layers) for (const piece of l.pieces) for (const z of zones) {
        const p = clipS(piece, S.ax, z.s0, z.s1); if (!p) continue;
        list.push({ wid: S.id, poly: p, z0: z.z0, z1: z.z1, m: l.m, mat: l.mat, core: l.core, prio: l.prio, layer: l.idx, generic: !!l.generic });
      }
      c = { key, list }; PRISMS.set(S, c);
    }
    byWall.set(S.id, c.list); out.push(...c.list);
  }
  return { prisms: out, geo, byWall };
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

/* ── doğrulama: katmanlar arası çakışma alanı (test ve tanı); ızgara + sınır kutusu ile aday çiftler ── */
function piecePairs(items, fn) {
  const cell = 200, m = new Map();
  items.forEach((it, i) => { const b = it.bb; for (let x = Math.floor(b.x0 / cell); x <= Math.floor(b.x1 / cell); x++) for (let y = Math.floor(b.y0 / cell); y <= Math.floor(b.y1 / cell); y++) { const k = x + ',' + y; (m.get(k) || m.set(k, []).get(k)).push(i); } });
  const seen = new Set();
  for (const list of m.values()) for (let a = 0; a < list.length; a++) for (let c = a + 1; c < list.length; c++) {
    const i = Math.min(list[a], list[c]), k = Math.max(list[a], list[c]), key = i * 1e7 + k;
    if (seen.has(key)) continue; seen.add(key);
    if (bbHit(items[i].bb, items[k].bb)) fn(items[i], items[k]);
  }
}
export function overlapReport(geo, minArea = 0.01) {
  const all = [];
  for (const S of geo.walls.values()) for (const l of S.layers || []) for (const p of l.pieces || []) all.push({ wid: S.id, layer: l.idx, p, bb: bbox(p) });
  const bad = [];
  piecePairs(all, (A, B) => { const a = interArea(A.p, B.p); if (a > minArea) bad.push({ a: `${A.wid}#${A.layer}`, b: `${B.wid}#${B.layer}`, area: a }); });
  return bad.sort((x, y) => (x.a + x.b < y.a + y.b ? -1 : 1));
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
