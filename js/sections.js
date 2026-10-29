/* ═══ Kesit ve cephe görünüşleri — otomatik ölçülendirme, ölçekli pafta ═══
 * Model (tüm katlar) düşey prizmalara ayrılır: duvar parçaları (açıklıklar arasında, katman katman), kat döşemeleri ve
 * döşeme elemanları (katman katman), kolon, kiriş, pencere camı / kapı kanadı; çatılar yüzey olarak.
 * Görünüş: d yönünde bakılır; ekran x = p·r (r = d'nin sağı), ekran y = −z. Yüzeyler derinliğe göre uzaktan yakına boyanır.
 * Kesit: düzlemin önündeki geometri atılır; düzlemdeki prizma yüzleri malzeme rengi + taramayla "kesilen" olarak çizilir.
 * Ölçü / yazı boyları kağıtta sabittir (mm); modelde 1:N ölçek için N/10 ile büyütülür.
 */
import { V, wallLen, wallDir, wallNormal, wallExt, planLevels, polyArea } from './plan-geom.js';
import { roofFaces, outlineOf, coverOf } from './roof.js';
import { compOf, compThickness, matOf, hatchDefs, hatchFill } from './materials.js';
import { wallComp } from './structure.js';
import { unitOf, fmtL, kotM, scaleOf, fitPaper, SCALES } from './units.js';
import { esc, modal, toast, downloadBlob, $, $$, icon, fmtNum } from './ui.js';

const GENERIC = { k: '', t: 'Genel', col: '#D9D6CF', hat: 'kagir' };
const GLASS = { k: 'cam', t: 'Cam', col: '#CFE8EE', hat: 'yok' };
const LEAF = { k: 'kanat', t: 'Kapı kanadı', col: '#C9A27A', hat: 'yok' };

/* ───────────── model → prizmalar ───────────── */
export function buildSolids(R) {
  const S = [], F = [];   // S: düşey prizmalar, F: çatı yüzeyleri (3B çokgen)
  const L = planLevels(R);
  const quad = (a, u, n, s0, s1, o0, o1) => [V.add(V.add(a, V.mul(u, s0)), V.mul(n, o0)), V.add(V.add(a, V.mul(u, s1)), V.mul(n, o0)), V.add(V.add(a, V.mul(u, s1)), V.mul(n, o1)), V.add(V.add(a, V.mul(u, s0)), V.mul(n, o1))];
  const layersZ = (comp, top, fallbackT, fallbackM) => {   // döşeme katmanları üstten alta
    if (!comp) return [{ z1: top, z0: top - fallbackT, m: fallbackM, core: true }];
    let z = top; return comp.layers.map(([k, d], i) => { const r = { z1: z, z0: z - d, m: matOf(R, k), core: i === (comp.core ?? 0) }; z -= d; return r; });
  };
  for (const lv of L) {
    const P = lv.plan, meta = { ...R.meta, ...(P.meta || {}) }, Z = lv.z, id = lv.idx;
    // kat döşemesi (zemin katta zemin döşemesi)
    const slabT = lv.idx ? lv.slab : (+R.meta.slab || 0);
    if (slabT > 0) {
      const src = lv.kind === 'roof' ? L[lv.idx - 1]?.plan : P;
      const pts = src && outlineOf({ ...src, meta: { ...R.meta, ...(src.meta || {}) } });
      const comp = compOf(R, lv.idx ? P.slabComp : R.meta.slabComp);
      if (pts) for (const ly of layersZ(comp, Z, slabT, matOf(R, 'betonarme'))) S.push({ kind: 'slab', poly: pts, z0: ly.z0, z1: ly.z1, m: ly.m, core: ly.core, lv: id });
    }
    for (const sl of P.slabs || []) {
      if (!sl.pts || sl.pts.length < 3) continue;
      const comp = compOf(R, sl.comp);
      for (const ly of layersZ(comp, Z + (+sl.top || 0), +sl.t || 15, matOf(R, 'betonarme'))) S.push({ kind: 'slab', poly: sl.pts, z0: ly.z0, z1: ly.z1, m: ly.m, core: ly.core, lv: id });
    }
    if (lv.kind !== 'roof') {
      for (const w of P.walls || []) {
        const Lw = wallLen(w); if (Lw < 1) continue;
        const t = w.t || meta.wallT, H = w.h || meta.wallH, B = Math.min(+w.z0 || 0, H - 1);
        const u = wallDir(w), n = wallNormal(w), ex = wallExt(P, w), comp = wallComp(R, w, meta.wallT);
        const sd = w.lflip ? -1 : 1, tot = comp ? compThickness(comp) || t : t, k = t / tot;
        let cum = 0;
        const lays = comp ? comp.layers.map(([mk, d], i) => { const o0 = sd * (t / 2 - cum * k), o1 = sd * (t / 2 - (cum + d) * k); cum += +d || 0; return { o0, o1, m: matOf(R, mk), core: i === (comp.core ?? 0) }; }) : [{ o0: t / 2, o1: -t / 2, m: GENERIC, core: true }];
        const piece = (s0, s1, y0, y1) => {
          if (s1 - s0 < 0.5 || y1 - y0 < 0.5) return;
          for (const ly of lays) S.push({ kind: 'wall', wid: w.id, poly: quad(w.a, u, n, s0, s1, ly.o0, ly.o1), z0: Z + y0, z1: Z + y1, m: ly.m, core: ly.core, lv: id });
        };
        const ops = (P.openings || []).filter(o => o.wallId === w.id).sort((a, b) => a.pos - b.pos);
        let s = -ex.a;
        for (const o of ops) {
          const o0 = o.pos - o.w / 2, o1 = o.pos + o.w / 2, sill = B + (o.type === 'window' ? (+o.sill || 0) : 0), top = Math.min(H, sill + (+o.h || 0));
          piece(s, o0, B, H); piece(o0, o1, B, sill); piece(o0, o1, top, H);
          if (o.type !== 'gap') S.push({ kind: o.type === 'window' ? 'glass' : 'door', wid: w.id, poly: quad(w.a, u, n, o0, o1, t * 0.12, -t * 0.12), z0: Z + sill, z1: Z + top, m: o.type === 'window' ? GLASS : LEAF, lv: id, op: true });
          s = o1;
        }
        piece(s, Lw + ex.b, B, H);
      }
      for (const it of P.items || []) {
        if (it.type !== 'kolon' && it.type !== 'kiris') continue;
        const a = (it.rot || 0) * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a), W = it.w / 2, D = it.d / 2;
        const poly = it.shape === 'round'
          ? Array.from({ length: 20 }, (_, i) => { const q = i / 20 * Math.PI * 2; return { x: it.x + Math.cos(q) * W, y: it.y + Math.sin(q) * W }; })
          : [[-W, -D], [W, -D], [W, D], [-W, D]].map(([x, y]) => ({ x: it.x + x * ca - y * sa, y: it.y + x * sa + y * ca }));
        S.push({ kind: it.type === 'kolon' ? 'col' : 'beam', poly, z0: Z + (+it.z || 0), z1: Z + (+it.z || 0) + it.h, m: matOf(R, it.mat || 'betonarme'), core: true, lv: id });
      }
    }
    for (const rf of P.roofs || []) {
      const base = (lv.kind === 'roof' ? 0 : lv.h) + (+rf.base || 0), cv = coverOf(rf);
      for (const f of roofFaces(rf, base)) {
        if (f.kind === 'parapet') {
          const Lp = V.dist(f.a, f.b); if (Lp < 1) continue;
          const u = V.norm(V.sub(f.b, f.a)), n = { x: -u.y, y: u.x };
          S.push({ kind: 'wall', poly: quad(f.a, u, n, -10, Lp + 10, 10, -10), z0: Z + f.z0, z1: Z + f.z0 + f.h, m: GENERIC, core: true, lv: id });
        } else F.push({ kind: f.kind, pts: f.pts.map(p => ({ x: p.x, y: p.y, z: p.z + Z })), col: f.kind === 'gable' ? (meta.wallColor || '#F7F5F0') : cv.c, lv: id });
      }
    }
  }
  return { S, F, L };
}

/* ───────────── geometri yardımcıları ───────────── */
/* çokgeni f(p) ≥ 0 tarafında bırak (Sutherland-Hodgman) */
function clip(poly, f) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length], fa = f(a), fb = f(b);
    if (fa >= 0) out.push(a);
    if ((fa >= 0) !== (fb >= 0)) { const t = fa / (fa - fb); out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, ...(a.z !== undefined ? { z: a.z + (b.z - a.z) * t } : {}) }); }
  }
  return out;
}

/* ───────────── görünüm tanımları ───────────── */
/* kuzey = plan yukarısı (−y) */
export const ELEVATIONS = [
  { id: 'el-k', name: 'Kuzey cephesi', d: { x: 0, y: 1 } },
  { id: 'el-g', name: 'Güney cephesi', d: { x: 0, y: -1 } },
  { id: 'el-d', name: 'Doğu cephesi', d: { x: -1, y: 0 } },
  { id: 'el-b', name: 'Batı cephesi', d: { x: 1, y: 0 } },
];
export function sectionsOf(R) {
  return [R, ...(R.levels || [])].flatMap((P, i) => (P.sections || []).map(s => ({ ...s, lvIdx: i })));
}
export function viewsOf(R) {
  return [...ELEVATIONS.map(e => ({ ...e, type: 'el' })), ...sectionsOf(R).map(s => {
    const u = V.norm(V.sub(s.b, s.a)), d = V.mul({ x: -u.y, y: u.x }, s.side || 1);
    return { id: s.id, type: 'sec', name: `${s.name}–${s.name} kesiti`, d, a: s.a, b: s.b };
  })];
}

/* ───────────── çizim üretimi ─────────────
 * Çıktı: model birimli (cm) ilkel listesi ve sınırlar. y ekseni −z (SVG'de yukarı pozitif kot). */
export function drawView(R, view, { N = scaleOf(R), dims = true, hatch = true } = {}) {
  const { S, F, L } = buildSolids(R);
  const d = V.norm(view.d), r = { x: -d.y, y: d.x }, X = p => V.dot(p, r), D = p => V.dot(p, d);
  const sec = view.type === 'sec', A = view.a, eps = 0.05;
  const fPlane = p => V.dot(V.sub(p, A), d);
  const xl = sec ? Math.min(X(view.a), X(view.b)) : -Infinity, xh = sec ? Math.max(X(view.a), X(view.b)) : Infinity;
  const faces = [], cuts = [], cutLines = [], prims = [];
  const K = N / 10;   // kağıtta 1 mm = K cm (model)
  for (const so of S) {
    if (!sec && so.z1 <= 0.5) continue;   // görünüşte zemin altı (temel, zemin döşemesi katmanları) çizilmez
    let poly = so.poly;
    if (sec) {
      poly = clip(poly, p => fPlane(p) + eps);
      poly = clip(poly, p => X(p) - xl); poly = clip(poly, p => xh - X(p));
      if (poly.length < 3) continue;
    }
    const ccw = polyArea(poly) > 0 ? 1 : -1;   // plan y aşağı: alan işareti dönüş yönü
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      if (V.dist(a, b) < 0.01) continue;
      const onPlane = sec && Math.abs(fPlane(a)) < eps * 4 && Math.abs(fPlane(b)) < eps * 4;
      const ed = V.norm(V.sub(b, a)), ne = V.mul({ x: ed.y, y: -ed.x }, ccw);   // dış normal
      if (onPlane) { const x0 = Math.min(X(a), X(b)), x1 = Math.max(X(a), X(b)); if (x1 - x0 > 0.01) cuts.push({ x0, x1, z0: so.z0, z1: so.z1, so }); continue; }
      if (V.dot(ne, d) >= -1e-6) continue;   // izleyiciye bakmıyor
      faces.push({ pts: [[X(a), -so.z0], [X(b), -so.z0], [X(b), -so.z1], [X(a), -so.z1]], depth: (D(a) + D(b)) / 2, so, x0: Math.min(X(a), X(b)), x1: Math.max(X(a), X(b)) });
    }
  }
  for (const f of F) {
    let pts = f.pts;
    if (sec) {
      const before = pts; pts = clip(pts, p => fPlane(p) + eps); pts = clip(pts, p => X(p) - xl); pts = clip(pts, p => xh - X(p));
      // kesilen çatı yüzeyi: düzlemdeki kenar
      const on = pts.filter(p => Math.abs(fPlane(p)) < eps * 4);
      if (on.length >= 2 && before.some(p => fPlane(p) < -eps)) { on.sort((p, q) => X(p) - X(q)); cutLines.push({ a: [X(on[0]), -on[0].z], b: [X(on.at(-1)), -on.at(-1).z] }); }
      if (pts.length < 3) continue;
    }
    faces.push({ pts: pts.map(p => [X(p), -p.z]), depth: pts.reduce((s, p) => s + D(p), 0) / pts.length, roof: f });
  }
  if (!faces.length && !cuts.length) return null;
  faces.sort((a, b) => b.depth - a.depth);   // uzaktan yakına

  // sınırlar
  const all = [...faces.flatMap(f => f.pts), ...cuts.flatMap(c => [[c.x0, -c.z0], [c.x1, -c.z1]])];
  let x0 = Math.min(...all.map(p => p[0])), x1 = Math.max(...all.map(p => p[0])), zTop = Math.max(...all.map(p => -p[1])), zBot = Math.min(0, ...all.map(p => -p[1]));

  const lite = c => mix(c, '#FFFFFF', 0.55);
  // zemin altı (kesitte toprak taraması)
  if (sec) prims.push({ t: 'poly', pts: [[x0 - 60 * K, -zBot], [x1 + 60 * K, -zBot], [x1 + 60 * K, -zBot + 6 * K], [x0 - 60 * K, -zBot + 6 * K]], fill: '#EFE8DA', hatch: hatch ? 'dolgu' : null, stroke: null, layer: 'ZEMIN' });
  for (const f of faces) {
    const so = f.so;
    const fill = f.roof ? f.roof.col : so.op ? so.m.col : so.kind === 'slab' ? '#D8D4CC' : so.kind === 'col' || so.kind === 'beam' ? lite(so.m.col) : lite(so.m.col);
    prims.push({ t: 'poly', pts: f.pts, fill, stroke: '#3A3E44', sw: sec ? 0.18 : 0.25, layer: sec ? 'GORUNUS' : 'CEPHE' });
  }
  // kesilen elemanlar: renk + tarama, kalın sınır
  for (const c of cuts) {
    const pts = [[c.x0, -c.z0], [c.x1, -c.z0], [c.x1, -c.z1], [c.x0, -c.z1]];
    prims.push({ t: 'poly', pts, fill: c.so.m.col, hatch: hatch && c.so.m.hat !== 'yok' ? c.so.m.hat : null, stroke: '#111', sw: c.so.core ? 0.5 : 0.3, layer: 'KESILEN-' + (c.so.m.k || 'GENEL').toUpperCase() });
  }
  for (const l of cutLines) prims.push({ t: 'line', a: l.a, b: l.b, stroke: '#111', sw: 0.7, layer: 'KESILEN-CATI' });
  // zemin çizgisi
  prims.push({ t: 'line', a: [x0 - 80 * K, 0], b: [x1 + 80 * K, 0], stroke: '#111', sw: 0.7, layer: 'ZEMIN' });

  if (dims) autoDims(R, { prims, faces, cuts, L, x0, x1, zTop, zBot, K, sec });

  // tüm ilkellerin sınırı (ölçüler dahil)
  const pp = prims.flatMap(p => p.t === 'poly' ? p.pts : p.t === 'line' ? [p.a, p.b] : [[p.x, p.y]]);
  const bx0 = Math.min(...pp.map(p => p[0])), bx1 = Math.max(...pp.map(p => p[0])), by0 = Math.min(...pp.map(p => p[1])), by1 = Math.max(...pp.map(p => p[1]));
  return { prims, box: { x0: bx0, x1: bx1, y0: by0, y1: by1 }, N, name: view.name, sec };
}

function mix(a, b, t) {
  const p = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  if (!/^#[0-9a-f]{6}$/i.test(a)) return b;
  const A = p(a), B = p(b);
  return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join('');
}

/* ───────────── otomatik ölçülendirme ─────────────
 * sol: kat kotları arası zincir ölçü + toplam yükseklik; sağ: kot işaretleri; alt: genel genişlik + açıklık / kesilen duvar zinciri;
 * kesitte kesilen her duvar için parapet – lento düşey zinciri. */
function autoDims(R, { prims, faces, cuts, L, x0, x1, zTop, K, sec }) {
  const ts = 2.5 * K, gap = 8 * K, ext = 2 * K;
  const fmt = cm => fmtL(cm, R, unitOf(R).k === 'mm' ? 0 : unitOf(R).k === 'm' ? 2 : 0);
  const dimH = (xs, y, layer = 'OLCU') => {   // yatay zincir (y: model ekranı, aşağı +)
    xs = dedupe(xs); if (xs.length < 2) return;
    prims.push({ t: 'line', a: [xs[0], y], b: [xs.at(-1), y], stroke: '#222', sw: 0.18, layer });
    xs.forEach(x => { prims.push({ t: 'line', a: [x, y - ext * 1.6], b: [x, y + ext], stroke: '#222', sw: 0.18, layer }); prims.push({ t: 'line', a: [x - ext, y + ext], b: [x + ext, y - ext], stroke: '#222', sw: 0.35, layer }); });
    for (let i = 1; i < xs.length; i++) { const w = xs[i] - xs[i - 1]; if (w < ts * 0.8) continue; prims.push({ t: 'text', x: (xs[i] + xs[i - 1]) / 2, y: y - ext * 0.8, s: ts, str: fmt(w), anchor: 'middle', layer }); }
  };
  const dimV = (zs, x, layer = 'OLCU') => {   // düşey zincir (zs: kot, cm)
    zs = dedupe(zs); if (zs.length < 2) return;
    prims.push({ t: 'line', a: [x, -zs[0]], b: [x, -zs.at(-1)], stroke: '#222', sw: 0.18, layer });
    zs.forEach(z => { prims.push({ t: 'line', a: [x - ext, -z], b: [x + ext * 1.6, -z], stroke: '#222', sw: 0.18, layer }); prims.push({ t: 'line', a: [x - ext, -z + ext], b: [x + ext, -z - ext], stroke: '#222', sw: 0.35, layer }); });
    for (let i = 1; i < zs.length; i++) { const hgt = zs[i] - zs[i - 1]; if (hgt < ts * 0.8) continue; prims.push({ t: 'text', x: x - ext * 0.8, y: -(zs[i] + zs[i - 1]) / 2, s: ts, str: fmt(hgt), anchor: 'middle', rot: -90, layer }); }
  };
  const levels = L.filter(l => l.kind !== 'roof');
  const zs = [0, ...levels.map(l => l.z), levels.at(-1).z + levels.at(-1).h, zTop];
  dimV(zs, x0 - gap * 2.2);
  if (dedupe(zs).length > 2) dimV([0, zTop], x0 - gap * 3.4);   // toplam yükseklik (zincirden farklıysa)
  // kot işaretleri (sağ)
  const kx = x1 + gap * 1.5;
  const marks = [...levels.map(l => ({ z: l.z, t: l.name })), { z: zTop, t: 'En üst' }];
  dedupeBy(marks, m => m.z).forEach(m => {
    const y = -m.z, s = 2.2 * K;
    prims.push({ t: 'line', a: [x1 + gap * 0.4, y], b: [kx + gap * 2.6, y], stroke: '#222', sw: 0.18, dash: true, layer: 'KOT' });
    prims.push({ t: 'poly', pts: [[kx, y], [kx - s, y - s * 1.5], [kx + s, y - s * 1.5]], fill: '#222', stroke: null, layer: 'KOT' });
    prims.push({ t: 'text', x: kx + s * 1.6, y: y - s * 0.4, s: ts, str: kotM(m.z), anchor: 'start', layer: 'KOT' });
    prims.push({ t: 'text', x: kx + s * 1.6, y: y + ts * 1.1, s: ts * 0.8, str: m.t, anchor: 'start', layer: 'KOT' });
  });
  // alt: genel genişlik + zincir
  const yb = gap * 1.6;
  if (sec) {
    const byWall = new Map();
    cuts.filter(c => c.so.kind === 'wall' || c.so.kind === 'col').forEach(c => { const k = (c.so.wid || c.so.kind + c.x0.toFixed(0)) + ':' + c.so.lv; const e = byWall.get(k) || { x0: Infinity, x1: -Infinity }; e.x0 = Math.min(e.x0, c.x0); e.x1 = Math.max(e.x1, c.x1); byWall.set(k, e); });
    dimH([x0, ...[...byWall.values()].flatMap(e => [e.x0, e.x1]), x1].sort((a, b) => a - b), yb);
    // kesilen duvarlarda düşey zincir: alt kot, parapet, lento, üst
    const seen = new Set();
    const wcuts = new Map();
    cuts.filter(c => c.so.kind === 'wall' || c.so.op).forEach(c => { const k = (c.so.wid || '') + ':' + c.so.lv; const a = wcuts.get(k) || []; a.push(c); wcuts.set(k, a); });
    for (const cs of wcuts.values()) {
      if (!cs.some(c => c.so.op)) continue;
      const zz = dedupe(cs.flatMap(c => [c.z0, c.z1])), key = zz.map(z => Math.round(z)).join(',');
      if (seen.has(key)) continue; seen.add(key);
      dimV(zz, Math.max(...cs.map(c => c.x1)) + gap * 0.9);
    }
  } else {
    // görünüşte önde görünen açıklıkların kenarları (derin duvar yüzünün arkasında kalanlar hariç)
    const walls = faces.filter(f => f.so && f.so.kind === 'wall');
    const vis = faces.filter(f => f.so?.op).filter(f => {
      const mx = (f.x0 + f.x1) / 2, mz = -(f.pts[0][1] + f.pts[2][1]) / 2;
      return !walls.some(w => w.depth < f.depth - 40 && w.x0 <= mx && w.x1 >= mx && -w.pts[0][1] <= mz && -w.pts[2][1] >= mz);
    });
    const xs = [x0, ...vis.flatMap(f => [f.x0, f.x1]), x1].sort((a, b) => a - b);
    if (xs.length > 2) dimH(xs, yb);
    dimH([x0, x1], yb + gap);
  }
  if (sec) dimH([x0, x1], yb + gap);
}
const dedupe = a => { const s = [...a].filter(Number.isFinite).sort((x, y) => x - y), o = []; for (const v of s) if (!o.length || v - o.at(-1) > 0.5) o.push(v); return o; };
const dedupeBy = (a, f) => { const o = []; for (const v of [...a].sort((x, y) => f(x) - f(y))) if (!o.length || Math.abs(f(v) - f(o.at(-1))) > 0.5) o.push(v); return o; };

/* ───────────── SVG / pafta ───────────── */
/* model cm → SVG; sw (mm, kağıtta) → model birimi */
export function viewSvgBody(V0, pre = 'sv') {
  const K = V0.N / 10;
  let o = hatchDefs(pre, 1.6 * K, 0.12 * K, '#333');
  for (const p of V0.prims) {
    const sw = p.sw ? `stroke="${p.stroke}" stroke-width="${p.sw * K}"${p.dash ? ` stroke-dasharray="${2 * K} ${1.2 * K}"` : ''}` : 'stroke="none"';
    if (p.t === 'poly') {
      const pts = p.pts.map(q => `${q[0].toFixed(2)},${q[1].toFixed(2)}`).join(' ');
      o += `<polygon points="${pts}" fill="${p.fill || 'none'}" ${p.stroke ? sw : 'stroke="none"'} stroke-linejoin="round"/>`;
      if (p.hatch) o += `<polygon points="${pts}" fill="url(#${pre}-${p.hatch})" stroke="none"/>`;
    } else if (p.t === 'line') o += `<line x1="${p.a[0].toFixed(2)}" y1="${p.a[1].toFixed(2)}" x2="${p.b[0].toFixed(2)}" y2="${p.b[1].toFixed(2)}" ${sw} stroke-linecap="round"/>`;
    else if (p.t === 'text') o += `<text x="${p.x.toFixed(2)}" y="${p.y.toFixed(2)}" font-size="${p.s.toFixed(2)}" font-family="Inter,Arial,sans-serif" text-anchor="${p.anchor || 'start'}" fill="#111"${p.rot ? ` transform="rotate(${p.rot} ${p.x.toFixed(2)} ${p.y.toFixed(2)})"` : ''}>${esc(p.str)}</text>`;
  }
  return o;
}
export function viewSvg(V0, pad = 0) {
  const b = V0.box, K = V0.N / 10, m = pad * K;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${b.x0 - m} ${b.y0 - m} ${b.x1 - b.x0 + 2 * m} ${b.y1 - b.y0 + 2 * m}"><rect x="${b.x0 - m}" y="${b.y0 - m}" width="${b.x1 - b.x0 + 2 * m}" height="${b.y1 - b.y0 + 2 * m}" fill="#fff"/>${viewSvgBody(V0)}</svg>`;
}

/* ölçekli pafta: kağıt mm biriminde; çizim 1:N; sağ altta antet */
export function sheetSvg(V0, { project = '', client = '', company = '', unit = 'cm', paper = null } = {}) {
  const b = V0.box, N = V0.N, w = b.x1 - b.x0, hgt = b.y1 - b.y0;
  const P = paper || fitPaper(w, hgt, N) || { k: 'A0', w: 1189, h: 841 };
  const M = 10, TB = { w: 120, h: 34 };
  const k = 10 / N, dx = (P.w - w * k) / 2 - b.x0 * k, dy = M + (P.h - M * 2 - TB.h - hgt * k) / 2 - b.y0 * k;
  const date = new Date().toLocaleDateString('tr-TR');
  const tb = `<g transform="translate(${P.w - M - TB.w} ${P.h - M - TB.h})" font-family="Inter,Arial,sans-serif" fill="#111">
    <rect width="${TB.w}" height="${TB.h}" fill="#fff" stroke="#111" stroke-width="0.5"/>
    <line x1="0" y1="11" x2="${TB.w}" y2="11" stroke="#111" stroke-width="0.25"/><line x1="0" y1="22" x2="${TB.w}" y2="22" stroke="#111" stroke-width="0.25"/><line x1="70" y1="11" x2="70" y2="${TB.h}" stroke="#111" stroke-width="0.25"/>
    <text x="3" y="7.6" font-size="5" font-weight="800">SAGG<tspan fill="#0EA5E9">CAD</tspan></text><text x="${TB.w - 3}" y="7.4" font-size="3" text-anchor="end">${esc(company)}</text>
    <text x="3" y="15" font-size="2.2" fill="#666">Proje</text><text x="3" y="19.5" font-size="3.4" font-weight="700">${esc(project)}${client ? ` · ${esc(client)}` : ''}</text>
    <text x="73" y="15" font-size="2.2" fill="#666">Ölçek · birim</text><text x="73" y="19.5" font-size="3.4" font-weight="700">1:${N} · ${esc(unit)}</text>
    <text x="3" y="26" font-size="2.2" fill="#666">Çizim</text><text x="3" y="31" font-size="3.6" font-weight="700">${esc(V0.name)}</text>
    <text x="73" y="26" font-size="2.2" fill="#666">Tarih · pafta</text><text x="73" y="31" font-size="3.4" font-weight="700">${date} · ${P.k}</text></g>`;
  // grafik ölçek çubuğu (sol alt): 0 – 1 – 2 – 5 m
  const seg = N <= 20 ? 50 : N <= 50 ? 100 : N <= 100 ? 200 : 500, sb = [0, 1, 2, 4].map(i => i * seg);
  const bar = `<g transform="translate(${M + 2} ${P.h - M - 6})" font-family="Inter,Arial" font-size="2.4" fill="#111">${sb.slice(0, -1).map((v, i) => `<rect x="${v * k}" y="0" width="${(sb[i + 1] - v) * k}" height="1.6" fill="${i % 2 ? '#fff' : '#111'}" stroke="#111" stroke-width="0.2"/>`).join('')}${sb.map(v => `<text x="${v * k}" y="5" text-anchor="middle">${fmtNum(v / 100, 1)}</text>`).join('')}<text x="${sb.at(-1) * k + 3}" y="1.8">m</text></g>`;
  return { svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${P.w}mm" height="${P.h}mm" viewBox="0 0 ${P.w} ${P.h}">
    <rect width="${P.w}" height="${P.h}" fill="#fff"/><rect x="${M / 2}" y="${M / 2}" width="${P.w - M}" height="${P.h - M}" fill="none" stroke="#111" stroke-width="0.5"/>
    <g transform="matrix(${k} 0 0 ${k} ${dx} ${dy})">${V0.raw || viewSvgBody(V0, 'ps')}</g>${bar}${tb}</svg>`, paper: P };
}

/* pafta → PDF (gerçek ölçekte; %100 / "gerçek boyut" yazdırılmalı). SVG yüksek çözünürlükte görüntüye çevrilir. */
let jsp = null;
const loadJsPdf = () => jsp ||= new Promise((res, rej) => { if (window.jspdf) return res(window.jspdf); const s = document.createElement('script'); s.src = 'vendor/jspdf.umd.min.js'; s.onload = () => res(window.jspdf); s.onerror = () => { jsp = null; rej(new Error('jsPDF yüklenemedi')); }; document.head.append(s); });
export async function sheetPdf(sheets) {
  const { jsPDF } = await loadJsPdf();
  let pdf = null;
  for (const { svg, paper: P } of sheets) {
    const dpi = Math.min(200, Math.floor(9000 / (Math.max(P.w, P.h) / 25.4)));
    const pxW = Math.round(P.w / 25.4 * dpi), pxH = Math.round(P.h / 25.4 * dpi);
    const img = new Image(); img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg.replace(/width="[\d.]+mm" height="[\d.]+mm"/, `width="${pxW}" height="${pxH}"`));
    await img.decode();
    const c = document.createElement('canvas'); c.width = pxW; c.height = pxH;
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, pxW, pxH); g.drawImage(img, 0, 0, pxW, pxH);
    const ori = P.w >= P.h ? 'l' : 'p';
    if (!pdf) pdf = new jsPDF({ orientation: ori, unit: 'mm', format: [P.w, P.h], compress: true });
    else pdf.addPage([P.w, P.h], ori);
    pdf.addImage(c.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, P.w, P.h);
  }
  return pdf.output('blob');
}

/* ───────────── DXF (R12, mm) ───────────── */
export function viewDxf(V0) {
  const out = [], p = (c, v) => out.push(String(c), typeof v === 'number' ? String(+v.toFixed(3)) : v);
  const layers = [...new Set(V0.prims.map(q => q.layer || '0'))];
  p(0, 'SECTION'); p(2, 'HEADER'); p(9, '$ACADVER'); p(1, 'AC1009'); p(9, '$INSUNITS'); p(70, 4); p(0, 'ENDSEC');
  p(0, 'SECTION'); p(2, 'TABLES'); p(0, 'TABLE'); p(2, 'LAYER'); p(70, layers.length);
  layers.forEach(l => { p(0, 'LAYER'); p(2, l); p(70, 0); p(62, l.startsWith('KESILEN') ? 7 : l === 'OLCU' ? 3 : l === 'KOT' ? 1 : 8); p(6, 'CONTINUOUS'); });
  p(0, 'ENDTAB'); p(0, 'ENDSEC'); p(0, 'SECTION'); p(2, 'ENTITIES');
  const X = v => v * 10, Y = v => -v * 10;   // cm → mm, y yukarı
  for (const q of V0.prims) {
    const L = q.layer || '0';
    if (q.t === 'poly') {
      p(0, 'POLYLINE'); p(8, L); p(66, 1); p(10, 0); p(20, 0); p(30, 0); p(70, 1);
      q.pts.forEach(([x, y]) => { p(0, 'VERTEX'); p(8, L); p(10, X(x)); p(20, Y(y)); p(30, 0); });
      p(0, 'SEQEND'); p(8, L);
    } else if (q.t === 'line') { p(0, 'LINE'); p(8, L); p(10, X(q.a[0])); p(20, Y(q.a[1])); p(30, 0); p(11, X(q.b[0])); p(21, Y(q.b[1])); p(31, 0); }
    else if (q.t === 'text') {
      p(0, 'TEXT'); p(8, L); p(10, X(q.x)); p(20, Y(q.y)); p(30, 0); p(40, q.s * 10); p(1, q.str);
      if (q.rot) p(50, -q.rot);
      if (q.anchor === 'middle') { p(72, 1); p(11, X(q.x)); p(21, Y(q.y)); p(31, 0); }
    }
  }
  p(0, 'ENDSEC'); p(0, 'EOF');
  return new Blob([out.join('\r\n') + '\r\n'], { type: 'application/dxf' });
}

/* ───────────── pencere: kesit ve görünüşler ───────────── */
export async function openViews(R, { focus = null, project = '', client = '', company = '', fname = 'cizim' } = {}) {
  const views = viewsOf(R);
  if (!views.length) return;
  let cur = views.find(v => v.id === focus) || views[0], N = scaleOf(R), dims = true, hatch = true;
  const body = document.createElement('div');
  body.className = 'vw';
  const draw = () => {
    const V0 = drawView(R, cur, { N, dims, hatch });
    const fit = V0 && fitPaper(V0.box.x1 - V0.box.x0, V0.box.y1 - V0.box.y0, N);
    body.innerHTML = `<div class="vw-side">
        <h4>Görünüşler</h4>${views.filter(v => v.type === 'el').map(v => `<button class="lib-item ${v.id === cur.id ? 'on' : ''}" data-v="${v.id}"><b>${esc(v.name)}</b></button>`).join('')}
        <h4>Kesitler</h4>${views.filter(v => v.type === 'sec').map(v => `<button class="lib-item ${v.id === cur.id ? 'on' : ''}" data-v="${v.id}"><b>${esc(v.name)}</b></button>`).join('') || '<p class="muted small">Planda "Kesit hattı" aracıyla kesit çizin (kısayol X).</p>'}
      </div>
      <div class="vw-main">
        <div class="row wrap vw-bar">
          <label class="mini-l">Ölçek <select class="inp sm" data-o="N">${SCALES.filter(n => n >= 10).map(n => `<option value="${n}" ${n === N ? 'selected' : ''}>1:${n}</option>`).join('')}</select></label>
          <label class="mini-l"><input type="checkbox" data-o="dims" ${dims ? 'checked' : ''}> Otomatik ölçü ve kotlar</label>
          <label class="mini-l"><input type="checkbox" data-o="hatch" ${hatch ? 'checked' : ''}> Malzeme taraması</label>
          <span class="muted small">${fit ? `Pafta: ${fit.k} ${fit.land ? 'yatay' : 'dikey'}` : 'Bu ölçekte A0\'a sığmıyor — ölçeği küçültün'}</span>
        </div>
        <div class="vw-canvas">${V0 ? viewSvg(V0, 12) : '<p class="muted">Bu görünümde çizilecek eleman yok. Kesit hattının yapıyı kestiğinden emin olun.</p>'}</div>
        <p class="muted small">${cur.type === 'el' ? 'Plan yukarısı kuzey kabul edilir. ' : 'Kesilen elemanlar katmanlarıyla taranır, kesit düzleminin arkasında kalanlar görünüş olarak çizilir. '}Ölçüler ${esc(unitOf(R).t.toLocaleLowerCase('tr'))}, kotlar metre. Yazı ve ölçü boyları seçilen ölçeğe göre ayarlanır.</p>
      </div>`;
    body._V = V0;
  };
  draw();
  body.addEventListener('click', e => { const b = e.target.closest('[data-v]'); if (b) { cur = views.find(v => v.id === b.dataset.v); draw(); } });
  body.addEventListener('change', e => { const o = e.target.dataset.o; if (!o) return; if (o === 'N') N = +e.target.value; else if (o === 'dims') dims = e.target.checked; else hatch = e.target.checked; draw(); });
  const meta = { project, client, company, unit: unitOf(R).k };
  const slug = s => String(s).normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/ı/g, 'i').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '');
  await modal({ title: 'Kesit ve görünüşler', body, wide: true,
    actions: [{ k: 'close', t: 'Kapat' }, { k: 'dxf', t: 'DXF', icon: 'download' }, { k: 'svg', t: 'SVG', icon: 'download' }, { k: 'all', t: 'Tümü (PDF)', icon: 'print' }, { k: 'pdf', t: 'Ölçekli pafta (PDF)', cls: 'btn-primary', icon: 'print' }],
    onOpen: (el) => {
      const foot = el.parentElement.querySelector('.modal-foot');
      $$('[data-k]', foot).forEach(b => { if (b.dataset.k === 'close') return; b.onclick = async () => {
        const V0 = body._V, k = b.dataset.k;
        if (!V0 && k !== 'all') return toast('Görünüm boş', 'err');
        try {
          if (k === 'svg') return downloadBlob(new Blob([viewSvg(V0, 12)], { type: 'image/svg+xml' }), `${fname}-${slug(V0.name)}.svg`);
          if (k === 'dxf') { downloadBlob(viewDxf(V0), `${fname}-${slug(V0.name)}.dxf`); return toast('DXF indirildi (mm)'); }
          b.disabled = true; toast('Pafta hazırlanıyor…');
          const list = k === 'all' ? views.map(v => drawView(R, v, { N, dims, hatch })).filter(Boolean) : [V0];
          const sheets = list.map(v => sheetSvg(v, meta));
          downloadBlob(await sheetPdf(sheets), `${fname}-${k === 'all' ? 'kesit-gorunusler' : slug(V0.name)}-1-${N}.pdf`);
          toast(`PDF indirildi — %100 / "gerçek boyut" ile yazdırın (${sheets.map(s => s.paper.k).join(', ')})`);
        } catch (err) { console.error(err); toast('Dışa aktarılamadı: ' + err.message, 'err'); } finally { b.disabled = false; }
      }; });
    } });
}
