/* ═══ BIM çekirdeği — duvar birleşim grafiği (B2B-1) ═══
 * Bir kattaki duvarların birbirleriyle geometrik ilişkisi, her seferinde mevcut duvar verisinden türetilir (kalıcı ikinci
 * veri kaynağı yoktur). Yalnız kullanıcının bir uçta otomatik birleşimi kapatması (`joinOff: ['a'|'b']`) kayda yazılır.
 *
 * Birleşim türleri (referans: duvar ekseni):
 *   L — iki duvar ucu aynı noktada, açı ≠ 180°          I — iki uç aynı noktada, doğrusal devam
 *   T — bir duvar ucu başka bir duvarın gövdesinde (eksen üzerinde ya da kalınlık bandı içinde) ya da üç uçlu düğümde
 *       doğrusal bir çift + bir kol
 *   X — iki duvar gövdesi kesişiyor ya da dört uçlu düğümde iki doğrusal çift
 *   STAR — başka çok uçlu düğüm (genel açıortay birleşimi)   LEGACY — yay duvar içeren düğüm (eski davranış korunur)
 *   serbest uç — bağlantı yok
 * Toleranslar ayrıdır: uçların aynı nokta sayılması için eksen toleransı (0,5 cm — çizim motorunun V.eq değeri);
 * T teması için ana duvarın kalınlık bandı + temas toleransı (1 cm). Bandın dışında kalan komşu duvar birleşmez.
 * Sorunlar: sıfır uzunluk, çakışan / üst üste binen duvar, neredeyse paralel uçlar, çok dar açı, çok kısa duvar.
 * Birleşim kimliği belirlenimcidir: tür + sıralı "duvar.uç" listesi (ör. "L:w1.b|w2.a").
 */
import { sub, add, mul, dot, cross, len, norm, perp } from './geom2d.js';

export const JOIN_TOL = Object.freeze({ axis: 0.5, contact: 1, parallelDeg: 2, acuteDeg: 15, minLen: 0.5 });
const RAD = Math.PI / 180;
const COS_PAR = Math.cos(JOIN_TOL.parallelDeg * RAD);

/* duvar ekseni bilgisi */
export function wallAxis(w, T = 15) {
  if (!w || !w.a || !w.b || !Number.isFinite(+w.a.x + +w.a.y + +w.b.x + +w.b.y)) return null;
  const a = { x: +w.a.x, y: +w.a.y }, b = { x: +w.b.x, y: +w.b.y }, d = sub(b, a), L = len(d);
  const u = L > 1e-9 ? mul(d, 1 / L) : { x: 1, y: 0 };
  return { id: w.id, w, a, b, L, u, n: perp(u), t: +w.t > 0 ? +w.t : +T || 15, arc: !!w.arc, off: new Set(Array.isArray(w.joinOff) ? w.joinOff : []) };
}

/* basit ızgara dizini */
function grid(cell) {
  const m = new Map(), key = (i, j) => `${i},${j}`;
  return {
    add(x0, y0, x1, y1, v) { for (let i = Math.floor(x0 / cell); i <= Math.floor(x1 / cell); i++) for (let j = Math.floor(y0 / cell); j <= Math.floor(y1 / cell); j++) { const k = key(i, j); (m.get(k) || m.set(k, []).get(k)).push(v); } },
    query(x0, y0, x1, y1) { const s = new Set(); for (let i = Math.floor(x0 / cell); i <= Math.floor(x1 / cell); i++) for (let j = Math.floor(y0 / cell); j <= Math.floor(y1 / cell); j++) for (const v of m.get(key(i, j)) || []) s.add(v); return [...s]; },
  };
}
const angDeg = (d1, d2) => Math.acos(Math.max(-1, Math.min(1, dot(d1, d2)))) / RAD;
const endKey = m => m.end ? `${m.id}.${m.end}` : `${m.id}.body`;
const joinId = (kind, members) => `${kind}:${members.map(endKey).sort().join('|')}`;

/* katın birleşim grafiği → { axes, joins, endJoin, byWall, issues } */
export function analyzeJoins(P, { T } = {}) {
  const wallT = T ?? +P?.meta?.wallT ?? 15;
  const axes = new Map(), issues = [], joins = [], endJoin = new Map(), byWall = new Map();
  const issue = (severity, code, ids, msg) => issues.push({ severity, code, ids, id: ids[0] ?? null, msg });
  for (const w of Array.isArray(P?.walls) ? P.walls : []) {
    if (!w || typeof w.id !== 'string') continue;
    const ax = wallAxis(w, wallT); if (!ax) { issue('error', 'WALL_INVALID', [w.id], `Duvar ${w.id}: uç noktaları geçersiz`); continue; }
    if (ax.L < JOIN_TOL.minLen) { issue('warning', 'ZERO_LENGTH', [w.id], `Duvar ${w.id}: uzunluk sıfıra yakın (${ax.L.toFixed(2)} cm); birleşime katılmadı`); continue; }
    if (axes.has(w.id)) { issue('error', 'ID_DUPLICATE', [w.id], `Duvar kimliği tekrar ediyor: ${w.id}; ikinci kayıt birleşime katılmadı`); continue; }
    if (!ax.arc && ax.L < ax.t) issue('info', 'SHORT_WALL', [w.id], `Duvar ${w.id}: uzunluğu (${ax.L.toFixed(1)} cm) kalınlığından kısa`);
    axes.set(w.id, ax);
  }
  const addJoin = j => { j.id = joinId(j.kind, j.members); joins.push(j); for (const m of j.members) { if (m.end) endJoin.set(`${m.id}.${m.end}`, j.id); (byWall.get(m.id) || byWall.set(m.id, []).get(m.id)).push(j.id); } };

  // 1) uç düğümleri (eksen toleransı)
  const ends = [];
  for (const ax of axes.values()) for (const e of ['a', 'b']) {
    if (ax.off.has(e)) { issue('info', 'JOIN_DISABLED', [ax.id], `Duvar ${ax.id}: ${e === 'a' ? 'başlangıç' : 'bitiş'} ucunda otomatik birleşim kapalı`); continue; }
    ends.push({ id: ax.id, end: e, p: ax[e], d: e === 'a' ? ax.u : mul(ax.u, -1), arc: ax.arc });
  }
  const gE = grid(4); ends.forEach((x, i) => gE.add(x.p.x, x.p.y, x.p.x, x.p.y, i));
  const par = ends.map((_, i) => i), find = i => (par[i] === i ? i : (par[i] = find(par[i])));
  ends.forEach((x, i) => { for (const j of gE.query(x.p.x - 1, x.p.y - 1, x.p.x + 1, x.p.y + 1)) if (j > i && Math.abs(ends[j].p.x - x.p.x) < JOIN_TOL.axis && Math.abs(ends[j].p.y - x.p.y) < JOIN_TOL.axis && ends[j].id !== x.id) par[find(j)] = find(i); });
  const clusters = new Map(); ends.forEach((x, i) => { const r = find(i); (clusters.get(r) || clusters.set(r, []).get(r)).push(x); });

  const gW = grid(250);
  for (const ax of axes.values()) { const m = ax.t / 2 + JOIN_TOL.contact; gW.add(Math.min(ax.a.x, ax.b.x) - m, Math.min(ax.a.y, ax.b.y) - m, Math.max(ax.a.x, ax.b.x) + m, Math.max(ax.a.y, ax.b.y) + m, ax.id); }
  const singles = [];
  for (const cl of clusters.values()) {
    cl.sort((p, q) => endKey(p) < endKey(q) ? -1 : 1);
    const at = cl.reduce((c, x) => add(c, mul(x.p, 1 / cl.length)), { x: 0, y: 0 }), k = cl.length;
    const mem = cl.map(x => ({ id: x.id, end: x.end, d: x.d }));
    if (k === 1) { singles.push(cl[0]); continue; }
    if (cl.some(x => x.arc)) { addJoin({ kind: 'LEGACY', at, members: mem }); continue; }
    const opp = (x, y) => dot(x.d, y.d) < -COS_PAR, same = (x, y) => dot(x.d, y.d) > COS_PAR;
    if (k === 2) {
      const [x, y] = cl;
      if (same(x, y)) { issue('warning', 'OVERLAP', [x.id, y.id], `Duvar ${x.id} ve ${y.id} aynı yönde üst üste biniyor; birleştirilmedi`); continue; }
      if (opp(x, y)) { addJoin({ kind: 'I', at, members: mem.map(m => ({ ...m, role: 'pair' })) }); continue; }
      const angle = angDeg(x.d, y.d);
      if (angle < JOIN_TOL.acuteDeg) issue('warning', 'ACUTE_ANGLE', [x.id, y.id], `Duvar ${x.id} ve ${y.id} çok dar açıyla (${angle.toFixed(1)}°) birleşiyor`);
      addJoin({ kind: 'L', at, angle, members: mem.map(m => ({ ...m, role: 'corner' })) });
      continue;
    }
    // çok uçlu düğüm: doğrusal çiftleri bul
    const pairs = [];
    for (let i = 0; i < k; i++) for (let j = i + 1; j < k; j++) if (opp(cl[i], cl[j])) pairs.push([i, j]);
    const dup = []; for (let i = 0; i < k; i++) for (let j = i + 1; j < k; j++) if (same(cl[i], cl[j])) dup.push([cl[i].id, cl[j].id]);
    dup.forEach(([a, b]) => issue('warning', 'OVERLAP', [a, b], `Duvar ${a} ve ${b} aynı yönde üst üste biniyor`));
    if (!dup.length && k === 3 && pairs.length === 1) {
      const [i, j] = pairs[0], s = [0, 1, 2].find(q => q !== i && q !== j);
      addJoin({ kind: 'T', at, members: [{ ...mem[i], role: 'pair' }, { ...mem[j], role: 'pair' }, { ...mem[s], role: 'stem' }], angle: angDeg(cl[s].d, cl[i].d) });
    } else if (!dup.length && k === 4 && pairs.length === 2 && new Set(pairs.flat()).size === 4) {
      addJoin({ kind: 'X', at, members: pairs.flatMap(([i, j], g) => [{ ...mem[i], role: 'pair', group: g }, { ...mem[j], role: 'pair', group: g }]), angle: angDeg(cl[pairs[0][0]].d, cl[pairs[1][0]].d) });
    } else {
      if (dup.length) { issue('warning', 'NODE_OVERLAP', cl.map(x => x.id), `${k} duvarlık düğümde üst üste binen duvarlar var; açıortay birleşimi uygulandı`); }
      addJoin({ kind: 'STAR', at, members: mem.map(m => ({ ...m, role: 'star' })) });
    }
  }

  // 2) T teması: tek uç, başka bir duvarın gövdesinde (kalınlık bandı + temas toleransı)
  for (const x of singles) {
    if (x.arc) continue;
    const me = axes.get(x.id), r = 60;
    let best = null;
    for (const hid of gW.query(x.p.x - r, x.p.y - r, x.p.x + r, x.p.y + r)) {
      if (hid === x.id) continue;
      const H = axes.get(hid); if (!H || H.arc) continue;
      if (Math.abs(dot(x.d, H.u)) > COS_PAR) continue;   // paralel: T değil
      const s = dot(sub(x.p, H.a), H.u), off = dot(sub(x.p, H.a), H.n);
      if (s < JOIN_TOL.axis || s > H.L - JOIN_TOL.axis) continue;   // gövde dışında (uç düğümü değil)
      if (Math.abs(off) > H.t / 2 + JOIN_TOL.contact) continue;     // temas etmiyor
      // kol gövdesi ana duvarın bir tarafına gitmeli (ana duvarı boydan boya geçmiyorsa)
      const far = dot(sub(add(x.p, mul(x.d, me.L)), H.a), H.n);
      if (Math.sign(far) !== Math.sign(dot(x.d, H.n))) continue;
      const score = Math.abs(off);
      if (!best || score < best.score - 1e-9 || (Math.abs(score - best.score) <= 1e-9 && hid < best.hid)) best = { hid, score, s, off };
    }
    if (best) addJoin({ kind: 'T', at: add(axes.get(best.hid).a, mul(axes.get(best.hid).u, best.s)), contact: +best.off.toFixed(3), angle: angDeg(x.d, axes.get(best.hid).u), members: [{ id: best.hid, end: null, role: 'host' }, { id: x.id, end: x.end, d: x.d, role: 'stem' }] });
  }

  // 3) gövde kesişimi (X) ve çakışan doğrusal duvarlar
  const seen = new Set();
  for (const A of axes.values()) {
    if (A.arc) continue;
    const m = A.t;
    for (const bid of gW.query(Math.min(A.a.x, A.b.x) - m, Math.min(A.a.y, A.b.y) - m, Math.max(A.a.x, A.b.x) + m, Math.max(A.a.y, A.b.y) + m)) {
      const B = axes.get(bid); if (!B || B.arc || B.id === A.id) continue;
      const key = A.id < B.id ? `${A.id}|${B.id}` : `${B.id}|${A.id}`; if (seen.has(key)) continue; seen.add(key);
      const c = cross(A.u, B.u);
      if (Math.abs(c) < Math.sin(JOIN_TOL.parallelDeg * RAD)) {   // paralel: aynı doğru üzerinde örtüşme?
        const off = Math.abs(dot(sub(B.a, A.a), A.n));
        if (off < Math.max(A.t, B.t) / 2) {
          const s0 = dot(sub(B.a, A.a), A.u), s1 = dot(sub(B.b, A.a), A.u), lo = Math.max(0, Math.min(s0, s1)), hi = Math.min(A.L, Math.max(s0, s1));
          if (hi - lo > JOIN_TOL.axis) issue('warning', 'OVERLAP', [A.id, B.id].sort(), `Duvar ${A.id} ve ${B.id} ${(hi - lo).toFixed(1)} cm boyunca üst üste biniyor (çift hacim riski)`);
        }
        continue;
      }
      const s = cross(sub(B.a, A.a), B.u) / c, t = cross(sub(B.a, A.a), A.u) / c;
      const mA = JOIN_TOL.axis, mB = JOIN_TOL.axis;
      if (s > mA && s < A.L - mA && t > mB && t < B.L - mB) {
        addJoin({ kind: 'X', at: add(A.a, mul(A.u, s)), angle: angDeg(A.u, B.u), members: [A.id, B.id].sort().map((id, g) => ({ id, end: null, role: 'cross', group: g })) });
      }
    }
  }
  joins.sort((p, q) => p.id < q.id ? -1 : p.id > q.id ? 1 : 0);
  return { axes, joins, endJoin, byWall, issues };
}

/* bir duvarın uç birleşim özeti (arayüz) */
export function wallJoinInfo(G, id) {
  const J = new Map(G.joins.map(j => [j.id, j]));
  const endOf = e => { const jid = G.endJoin.get(`${id}.${e}`); const j = jid && J.get(jid); return j ? { id: j.id, kind: j.kind, walls: j.members.filter(m => m.id !== id).map(m => m.id) } : null; };
  const body = (G.byWall.get(id) || []).map(jid => J.get(jid)).filter(j => j && j.members.some(m => m.id === id && !m.end));
  return { a: endOf('a'), b: endOf('b'), body: body.map(j => ({ id: j.id, kind: j.kind, walls: j.members.filter(m => m.id !== id).map(m => m.id) })),
    issues: G.issues.filter(i => i.ids.includes(id)) };
}

/* ── B3-C: birleşim grafiğinin yerel güncellemesi ──
 * D: değişen / eklenen / silinen duvar kimlikleri. D'nin eski ve yeni geometrisi çevresindeki duvarlarla alt analiz yapılır;
 * D'ye dokunan ya da uçlarından birini yeni D birleşimleriyle paylaşan eski birleşimler bırakılır, alt analizden D'ye
 * dokunan ya da bırakılan uçları kullanan birleşimler eklenir. Sonuç tam analizle aynı birleşim kümesidir (testle
 * karşılaştırılır). Dönüş: { G (yeni grafik), affected (geometrisi yeniden hesaplanacak duvarlar) } */
export function updateJoins(prev, P, D, { T } = {}) {
  const wallT = T ?? +P?.meta?.wallT ?? 15, walls = (Array.isArray(P?.walls) ? P.walls : []).filter(w => w && typeof w.id === 'string');
  const boxes = [], grow = (a, b, m) => boxes.push({ x0: Math.min(a.x, b.x) - m, y0: Math.min(a.y, b.y) - m, x1: Math.max(a.x, b.x) + m, y1: Math.max(a.y, b.y) + m });
  let maxT = 0; for (const ax of prev.axes.values()) maxT = Math.max(maxT, ax.t); for (const w of walls) maxT = Math.max(maxT, +w.t || wallT);
  const M = maxT + JOIN_TOL.contact + JOIN_TOL.axis + 2;
  for (const id of D) {
    const o = prev.axes.get(id); if (o) grow(o.a, o.b, M);
    const w = walls.find(x => x.id === id); if (w?.a && w?.b) grow(w.a, w.b, M);
  }
  const hit = w => w?.a && w?.b && boxes.some(b => Math.max(w.a.x, w.b.x) >= b.x0 && Math.min(w.a.x, w.b.x) <= b.x1 && Math.max(w.a.y, w.b.y) >= b.y0 && Math.min(w.a.y, w.b.y) <= b.y1);
  const C = walls.filter(hit);
  // alt analizdeki aday duvarların eski birleşim ortakları da dahil (uç birleşimleri bölgede tam görünsün)
  const cIds = new Set(C.map(w => w.id));
  const sub = analyzeJoins({ ...P, walls: C }, { T: wallT });
  const touchesD = j => j.members.some(m => D.has(m.id));
  const endKeys = js => new Set(js.flatMap(j => j.members.filter(m => m.end).map(m => `${m.id}.${m.end}`)));
  const subD = sub.joins.filter(touchesD), subDEnds = endKeys(subD);
  const dropped = prev.joins.filter(j => touchesD(j) || j.members.some(m => m.end && subDEnds.has(`${m.id}.${m.end}`)));
  const droppedEnds = endKeys(dropped), dropSet = new Set(dropped.map(j => j.id));
  const added = sub.joins.filter(j => touchesD(j) || j.members.some(m => m.end && droppedEnds.has(`${m.id}.${m.end}`)));
  const byId = new Map(prev.joins.filter(j => !dropSet.has(j.id)).map(j => [j.id, j]));
  for (const j of added) byId.set(j.id, j);
  const joins = [...byId.values()].sort((p, q) => p.id < q.id ? -1 : p.id > q.id ? 1 : 0);
  // eksenler
  // eksenler kayıt sırasıyla (tam analizle aynı sıra): bölgedekiler alt analizden, diğerleri önceki grafikten
  const axes = new Map();
  for (const w of walls) { const ax = cIds.has(w.id) ? sub.axes.get(w.id) : prev.axes.get(w.id); if (ax && !axes.has(w.id)) axes.set(w.id, ax); }
  const endJoin = new Map(), byWall = new Map();
  for (const j of joins) for (const m of j.members) { if (m.end) endJoin.set(`${m.id}.${m.end}`, j.id); (byWall.get(m.id) || byWall.set(m.id, []).get(m.id)).push(j.id); }
  const affected = new Set([...D].filter(id => axes.has(id)));
  for (const j of [...dropped, ...added]) for (const m of j.members) if (axes.has(m.id)) affected.add(m.id);
  // sorunlar: etkilenen duvarlara ait olanlar alt analizden, diğerleri önceki grafikten
  const touch = i => (i.ids || []).some(id => affected.has(id) || D.has(id));
  const issues = [...prev.issues.filter(i => !touch(i)), ...sub.issues.filter(i => touch(i) && (i.ids || []).every(id => cIds.has(id)))];
  return { G: { axes, joins, endJoin, byWall, issues }, affected, candidates: C.length };
}
