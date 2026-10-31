/* ═══ Tadilat / revizyon görünümü ve paftaları (B4B) ═══
 * Karşılaştırma sonucundan (bim/diff.js) tek bir vektörel ilkel listesi üretilir; aynı ilkellerden:
 *   • editördeki revizyon katmanı (SVG, ekran),  • ölçekli pafta (SVG, mm),  • DXF R12 (katman + renk + çizgi tipi),
 *   • vektörel PDF (jsPDF çizim komutları; raster değil).
 * Revizyon renkleri yalnız bu gösterimdedir (marka renkleri değişmez); renge bağımlı olmayan ayrım çizgi tipi ve tarama ile:
 *   mevcut = ince sürekli + gri dolgu · yıkılacak = kesik çizgi + 45° tarama · yeni = kalın sürekli + çapraz tarama ·
 *   değişen = kesik-noktalı (hedef konum) + noktalı eski konum.
 * Çıktılar kaynak çizimleri değiştirmez.
 */
import { V, wallDir, wallNormal, polyArea } from './plan-geom.js';
import { fitPaper } from './units.js';
import { PHASES } from './bim/diff.js';
import { pdfFont } from './pdffont.js';

export const REV_STYLE = Object.freeze({
  existing: { stroke: '#6B7280', fill: '#D9DCE1', dash: null, w: 0.25, hatch: null, layer: 'REV-MEVCUT', aci: 8, lt: 'CONTINUOUS' },
  demolish: { stroke: '#D33A4A', fill: null, dash: [2, 1.2], w: 0.35, hatch: [45], layer: 'REV-YIKIM', aci: 1, lt: 'DASHED' },
  new: { stroke: '#15803D', fill: '#D5F0DC', dash: null, w: 0.5, hatch: [45, 135], layer: 'REV-YENI', aci: 3, lt: 'CONTINUOUS' },
  modify: { stroke: '#D97706', fill: '#FDE7C8', dash: [3, 0.8, 0.5, 0.8], w: 0.4, hatch: null, layer: 'REV-DEGISEN', aci: 30, lt: 'DASHDOT' },
  before: { stroke: '#1786FF', fill: null, dash: [0.6, 0.8], w: 0.25, hatch: null, layer: 'REV-ESKI-KONUM', aci: 5, lt: 'DOT' },
  room: { stroke: '#9CA3AF', fill: null, dash: null, w: 0.13, hatch: null, layer: 'REV-MAHAL', aci: 9, lt: 'CONTINUOUS' },
  text: { stroke: '#111827', layer: 'REV-YAZI', aci: 7 },
});
export const SHEET_KINDS = Object.freeze({
  existing: { t: 'Mevcut Durum Planı', side: 'src' },
  demolition: { t: 'Yıkım / Söküm Planı', side: 'src' },
  new: { t: 'Yeni Yapılacak İmalat Planı', side: 'dst' },
  compare: { t: 'Revizyon Karşılaştırma Planı', side: 'both' },
});
const P2 = q => [+q.x.toFixed(3), +q.y.toFixed(3)];
const lvPlan = (R, lvId) => !R ? null : lvId === 'L0' ? R : (R.levels || []).find(l => l?.id === lvId) || null;

/* eleman çokgenleri (plan, cm) */
function wallQuad(w, T) {
  const n = wallNormal(w), t = (+w.t || T) / 2;
  return [V.add(w.a, V.mul(n, t)), V.add(w.b, V.mul(n, t)), V.sub(w.b, V.mul(n, t)), V.sub(w.a, V.mul(n, t))];
}
function openingQuad(o, w, T) {
  const u = wallDir(w), n = wallNormal(w), t = (+w.t || T) / 2 + 1, c = V.add(w.a, V.mul(u, o.pos)), A = V.sub(c, V.mul(u, o.w / 2)), B = V.add(c, V.mul(u, o.w / 2));
  return [V.add(A, V.mul(n, t)), V.add(B, V.mul(n, t)), V.sub(B, V.mul(n, t)), V.sub(A, V.mul(n, t))];
}
function itemQuad(it) {
  const a = (+it.rot || 0) * Math.PI / 180, c = Math.cos(a), s = Math.sin(a), hw = (+it.w || 0) / 2, hd = (+it.d || 0) / 2;
  return [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([x, y]) => ({ x: it.x + x * c - y * s, y: it.y + x * s + y * c }));
}
function shapeOf(R, P, coll, o) {
  const T = +(P?.meta?.wallT || R?.meta?.wallT || 15);
  if (coll === 'walls' && o.a && o.b) return wallQuad(o, T);
  if (coll === 'openings') { const w = (P.walls || []).find(x => x.id === o.wallId); return w ? openingQuad(o, w, T) : null; }
  if (coll === 'items' && (o.type === 'kolon' || o.type === 'kiris')) return itemQuad(o);
  if ((coll === 'rooms' || coll === 'slabs') && Array.isArray(o.pts) && o.pts.length > 2) return o.pts;
  return null;
}
/* dışbükey çokgen içinde paralel tarama çizgileri (açı derece, aralık cm) */
function hatchLines(pts, deg, gap) {
  const a = deg * Math.PI / 180, d = { x: Math.cos(a), y: Math.sin(a) }, n = { x: -d.y, y: d.x }, out = [];
  const proj = pts.map(p => p.x * n.x + p.y * n.y), lo = Math.min(...proj), hi = Math.max(...proj);
  for (let c = Math.ceil(lo / gap) * gap; c <= hi; c += gap) {
    const hits = [];
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], q = pts[(i + 1) % pts.length], fp = p.x * n.x + p.y * n.y - c, fq = q.x * n.x + q.y * n.y - c;
      if ((fp < 0) !== (fq < 0)) { const t = fp / (fp - fq); hits.push({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t }); }
    }
    if (hits.length >= 2) { hits.sort((u, v) => (u.x * d.x + u.y * d.y) - (v.x * d.x + v.y * d.y)); out.push([hits[0], hits.at(-1)]); }
  }
  return out;
}

/* ── ilkeller ── result: compareDrawings sonucu · mode: existing | demolition | new | compare · filter: all | <safha> */
export function revisionPrims(src, dst, result, lvId, { mode = 'compare', filter = 'all', highlight = null } = {}) {
  const PA = lvPlan(src, lvId), PB = lvPlan(dst, lvId), prims = [];
  const byKey = new Map(result.entries.filter(e => e.level === lvId).map(e => [e.key, e]));
  const add = (pts, style, extra = {}) => {
    if (!pts || pts.length < 2) return;
    const S = REV_STYLE[style];
    prims.push({ t: 'poly', pts: pts.map(P2), style, closed: extra.closed !== false, fill: extra.noFill ? null : S.fill, ...extra });
    if (S.hatch && !extra.noHatch && pts.length > 2) for (const deg of S.hatch) for (const [a, b] of hatchLines(pts, deg, extra.gap || 6)) prims.push({ t: 'line', a: P2(a), b: P2(b), style, hatch: true });
  };
  const want = ph => filter === 'all' || filter === ph;
  const ORDER = ['rooms', 'slabs', 'walls', 'items', 'openings'];
  const draw = (R, P, side) => {
    if (!P) return;
    for (const coll of ORDER) for (const o of P[coll] || []) {
      if (!o || typeof o.id !== 'string') continue;
      const e = byKey.get(`${lvId}/${o.id}`) || [...byKey.values()].find(x => (side === 'src' ? x.srcId : x.dstId) === o.id);
      let ph = e?.phase || 'existing';
      if (mode === 'existing') ph = 'existing';
      else if (mode === 'demolition') ph = ph === 'demolish' ? 'demolish' : 'existing';
      else if (mode === 'new') ph = ph === 'new' ? 'new' : ph === 'modify' ? 'modify' : 'existing';
      if (side === 'src' && (mode === 'compare' || mode === 'new') && ph !== 'demolish') continue;   // karşılaştırmada kaynaktan yalnız kaldırılanlar
      if (side === 'dst' && mode === 'compare' && ph === 'demolish') continue;
      if (!want(ph)) continue;
      const pts = shapeOf(R, P, coll, o); if (!pts) continue;
      if (coll === 'rooms') {
        prims.push({ t: 'poly', pts: pts.map(P2), style: 'room', closed: true, fill: null, key: e?.key });
        const c = pts.reduce((s, q) => ({ x: s.x + q.x / pts.length, y: s.y + q.y / pts.length }), { x: 0, y: 0 }), A = Math.abs(polyArea(pts)) / 1e4;
        prims.push({ t: 'text', x: +c.x.toFixed(2), y: +c.y.toFixed(2), s: 14, str: `${o.name || ''}${o.name ? ' ' : ''}${A.toLocaleString('tr-TR', { maximumFractionDigits: 2 })} m²`, style: 'text', anchor: 'middle' });
        continue;
      }
      if (coll === 'slabs') { add(pts, ph, { noFill: true, noHatch: true, key: e?.key }); continue; }
      add(pts, ph, { key: e?.key, opening: coll === 'openings', fill: coll === 'openings' ? '#FFFFFF' : REV_STYLE[ph].fill, noHatch: coll === 'openings' });
      // değişen: eski konum (kaynak geometrisi) noktalı
      if (ph === 'modify' && (mode === 'compare' || mode === 'new') && e?.srcId && e.geometryKeys?.length && PA) {
        const o0 = (PA[coll] || []).find(x => x?.id === e.srcId), p0 = o0 && shapeOf(src, PA, coll, o0);
        if (p0) add(p0, 'before', { noFill: true, key: e.key });
      }
    }
  };
  if (SHEET_KINDS[mode]?.side === 'src' || mode === 'compare' || mode === 'new') draw(src, PA, 'src');
  if (mode === 'new' || mode === 'compare') draw(dst, PB, 'dst');
  if (highlight) { const H = new Set([].concat(highlight)); prims.filter(q => H.has(q.key) && q.t === 'poly').forEach(q => prims.push({ ...q, style: 'hl', fill: null, hl: true })); }   // tek anahtar ya da dizi (metraj satırı)
  const xs = prims.flatMap(q => q.t === 'poly' ? q.pts.map(p => p[0]) : q.t === 'line' ? [q.a[0], q.b[0]] : [q.x]), ys = prims.flatMap(q => q.t === 'poly' ? q.pts.map(p => p[1]) : q.t === 'line' ? [q.a[1], q.b[1]] : [q.y]);
  const box = xs.length ? { x0: Math.min(...xs) - 60, y0: Math.min(...ys) - 60, x1: Math.max(...xs) + 60, y1: Math.max(...ys) + 60 } : { x0: 0, y0: 0, x1: 100, y1: 100 };
  return { prims, box };
}

/* ── SVG gövdesi: k = 1 cm başına çizgi ölçeği (ekranda vector-effect, paftada mm → cm) ── */
export function primsSvg(prims, { screen = false, N = 50 } = {}) {
  const mm = v => screen ? v * 4 : v * N / 10;   // çizgi kalınlığı: ekranda px, paftada model cm
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  return prims.map(q => {
    if (q.hl) return `<path d="M${q.pts.map(p => p.join(' ')).join('L')}Z" fill="none" stroke="#1786FF" stroke-width="${screen ? 4 : mm(0.7)}" ${screen ? 'vector-effect="non-scaling-stroke"' : ''} stroke-opacity=".9" class="rev-hl"/>`;
    const S = REV_STYLE[q.style] || REV_STYLE.existing, ve = screen ? ' vector-effect="non-scaling-stroke"' : '';
    const dash = S.dash ? ` stroke-dasharray="${S.dash.map(v => +mm(v).toFixed(2)).join(' ')}"` : '';
    if (q.t === 'line') return `<line x1="${q.a[0]}" y1="${q.a[1]}" x2="${q.b[0]}" y2="${q.b[1]}" stroke="${S.stroke}" stroke-width="${+mm(q.hatch ? 0.13 : S.w).toFixed(3)}"${ve} data-l="${S.layer}"/>`;
    if (q.t === 'text') return `<text x="${q.x}" y="${q.y}" font-size="${screen ? q.s : q.s * N / 50}" text-anchor="${q.anchor || 'start'}" font-family="Inter,Arial,sans-serif" fill="${S.stroke}" data-l="${S.layer}">${esc(q.str)}</text>`;
    return `<path d="M${q.pts.map(p => p.join(' ')).join('L')}${q.closed ? 'Z' : ''}" fill="${q.fill || 'none'}" stroke="${S.stroke}" stroke-width="${+mm(S.w).toFixed(3)}"${dash}${ve} data-l="${S.layer}"${q.key ? ` data-k="${esc(q.key)}"` : ''}/>`;
  }).join('');
}
export function legendItems(mode) {
  const ks = mode === 'existing' ? ['existing'] : mode === 'demolition' ? ['existing', 'demolish'] : mode === 'new' ? ['existing', 'new', 'modify'] : ['existing', 'demolish', 'new', 'modify', 'before'];
  return ks.map(k => ({ k, t: k === 'before' ? 'Değişen elemanın eski konumu' : PHASES[k], desc: { existing: 'ince sürekli çizgi, gri dolgu', demolish: 'kesik çizgi, 45° tarama', new: 'kalın sürekli çizgi, çapraz tarama', modify: 'kesik-noktalı çizgi', before: 'noktalı çizgi' }[k] }));
}

/* ── ölçekli pafta (mm): çizim + lejant + antet (proje, çizim, kat, ölçek, tarih, revizyon, açıklama, firma) ── */
export function revisionSheet(src, dst, result, lvId, { mode = 'compare', N = 50, project = '', drawing = '', level = '', revision = '', description = '', company = '', date = new Date().toLocaleDateString('tr-TR'), filter = 'all' } = {}) {
  const { prims, box } = revisionPrims(src, dst, result, lvId, { mode, filter });
  const w = box.x1 - box.x0, h = box.y1 - box.y0, P = fitPaper(w, h + 600 * 0, N, { title: 50 }) || { k: 'A0', w: 1189, h: 841 };
  const M = 10, TB = { w: 150, h: 42 }, k = 10 / N;
  const dx = (P.w - w * k) / 2 - box.x0 * k, dy = M + (P.h - M * 2 - TB.h - h * k) / 2 - box.y0 * k;
  const title = SHEET_KINDS[mode]?.t || 'Revizyon planı';
  const L = legendItems(mode), LG = { w: 70, h: 8 + L.length * 7 };
  // pafta düzeyi ilkeller (mm): çerçeve, lejant, antet — PDF / DXF için de kullanılır
  const sheet = [];
  const T = (x, y, s, str, o = {}) => sheet.push({ t: 'text', x, y, s, str: String(str ?? ''), ...o });
  const R = (x, y, w2, h2, o = {}) => sheet.push({ t: 'rect', x, y, w: w2, h: h2, ...o });
  R(M / 2, M / 2, P.w - M, P.h - M, { lw: 0.5 });
  const lx = M + 2, ly = P.h - M - LG.h - 2;
  R(lx, ly, LG.w, LG.h, { lw: 0.3, fill: '#FFFFFF' }); T(lx + 3, ly + 5, 2.8, 'Lejant', { b: true });
  L.forEach((it, i) => { const y = ly + 9 + i * 7; sheet.push({ t: 'swatch', x: lx + 3, y: y - 2.5, w: 10, h: 4, style: it.k }); T(lx + 15, y, 2.4, it.t, { b: true }); T(lx + 15, y + 2.8, 1.9, it.desc, { c: '#555555' }); });
  const tx = P.w - M - TB.w, ty = P.h - M - TB.h;
  R(tx, ty, TB.w, TB.h, { lw: 0.5, fill: '#FFFFFF' });
  [10, 20, 31].forEach(y => sheet.push({ t: 'line', a: [tx, ty + y], b: [tx + TB.w, ty + y], lw: 0.25 }));
  sheet.push({ t: 'line', a: [tx + 75, ty + 10], b: [tx + 75, ty + TB.h], lw: 0.25 }); sheet.push({ t: 'line', a: [tx + 115, ty + 10], b: [tx + 115, ty + 31], lw: 0.25 });
  T(tx + 3, ty + 7, 4.6, 'SAGGCAD', { b: true }); T(tx + TB.w - 3, ty + 7, 2.8, company, { anchor: 'end' });
  T(tx + 3, ty + 13.5, 1.9, 'Proje', { c: '#666666' }); T(tx + 3, ty + 18, 3, project, { b: true });
  T(tx + 78, ty + 13.5, 1.9, 'Çizim', { c: '#666666' }); T(tx + 78, ty + 18, 2.6, drawing, { b: true });
  T(tx + 118, ty + 13.5, 1.9, 'Kat', { c: '#666666' }); T(tx + 118, ty + 18, 2.6, level, { b: true });
  T(tx + 3, ty + 24, 1.9, 'Pafta', { c: '#666666' }); T(tx + 3, ty + 29, 3.3, title, { b: true });
  T(tx + 78, ty + 24, 1.9, 'Ölçek', { c: '#666666' }); T(tx + 78, ty + 29, 3, `1:${N}`, { b: true });
  T(tx + 118, ty + 24, 1.9, 'Revizyon', { c: '#666666' }); T(tx + 118, ty + 29, 3, revision || '—', { b: true });
  T(tx + 3, ty + 35, 1.9, 'Açıklama', { c: '#666666' }); T(tx + 3, ty + 39.5, 2.3, description || '—');
  T(tx + 78, ty + 35, 1.9, 'Tarih', { c: '#666666' }); T(tx + 78, ty + 39.5, 2.6, date, { b: true });
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const sheetSvgEls = sheet.map(q => {
    if (q.t === 'rect') return `<rect x="${q.x}" y="${q.y}" width="${q.w}" height="${q.h}" fill="${q.fill || 'none'}" stroke="#111" stroke-width="${q.lw}"/>`;
    if (q.t === 'line') return `<line x1="${q.a[0]}" y1="${q.a[1]}" x2="${q.b[0]}" y2="${q.b[1]}" stroke="#111" stroke-width="${q.lw}"/>`;
    if (q.t === 'swatch') { const S = REV_STYLE[q.style]; return `<rect x="${q.x}" y="${q.y}" width="${q.w}" height="${q.h}" fill="${S.fill || '#fff'}" stroke="${S.stroke}" stroke-width="${S.w}"${S.dash ? ` stroke-dasharray="${S.dash.join(' ')}"` : ''}/>${(S.hatch || []).map(d => `<line x1="${q.x + (d === 45 ? 0 : q.w)}" y1="${q.y + q.h}" x2="${q.x + (d === 45 ? q.w : 0)}" y2="${q.y}" stroke="${S.stroke}" stroke-width="0.15"/>`).join('')}`; }
    return `<text x="${q.x}" y="${q.y}" font-size="${q.s}" font-family="Inter,Arial,sans-serif"${q.b ? ' font-weight="700"' : ''}${q.anchor === 'end' ? ' text-anchor="end"' : ''} fill="${q.c || '#111'}">${esc(q.str)}</text>`;
  }).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${P.w}mm" height="${P.h}mm" viewBox="0 0 ${P.w} ${P.h}"><rect width="${P.w}" height="${P.h}" fill="#fff"/>
<g transform="matrix(${k} 0 0 ${k} ${dx} ${dy})">${primsSvg(prims, { N })}</g>${sheetSvgEls}</svg>`;
  return { svg, paper: P, prims, sheet, N, map: { k, dx, dy }, title };
}

/* ── DXF (R12, mm): katman başına renk ve çizgi tipi; tarama çizgi olarak ── */
export function revisionDxf(S) {
  const out = [], p = (c, v) => out.push(String(c), typeof v === 'number' ? String(+v.toFixed(3)) : v);
  const used = [...new Set(S.prims.map(q => REV_STYLE[q.hl ? 'existing' : q.style]?.layer).filter(Boolean)), 'REV-PAFTA'];
  const LT = { DASHED: [5, -3], DASHDOT: [6, -2, 0, -2], DOT: [0, -1.5] };
  p(0, 'SECTION'); p(2, 'HEADER'); p(9, '$ACADVER'); p(1, 'AC1009'); p(9, '$INSUNITS'); p(70, 4); p(0, 'ENDSEC');
  p(0, 'SECTION'); p(2, 'TABLES');
  p(0, 'TABLE'); p(2, 'LTYPE'); p(70, 4);
  p(0, 'LTYPE'); p(2, 'CONTINUOUS'); p(70, 0); p(3, 'Solid line'); p(72, 65); p(73, 0); p(40, 0);
  for (const [n, pat] of Object.entries(LT)) { p(0, 'LTYPE'); p(2, n); p(70, 0); p(3, n); p(72, 65); p(73, pat.length); p(40, pat.reduce((s, v) => s + Math.abs(v), 0)); pat.forEach(v => p(49, v)); }
  p(0, 'ENDTAB');
  p(0, 'TABLE'); p(2, 'LAYER'); p(70, used.length);
  for (const L of used) { const st = Object.values(REV_STYLE).find(s => s.layer === L); p(0, 'LAYER'); p(2, L); p(70, 0); p(62, st?.aci ?? 7); p(6, st?.lt || 'CONTINUOUS'); }
  p(0, 'ENDTAB'); p(0, 'ENDSEC'); p(0, 'SECTION'); p(2, 'ENTITIES');
  const { k, dx, dy } = S.map, X = x => x * k + dx, Y = y => S.paper.h - (y * k + dy);   // paftada mm, y yukarı
  for (const q of S.prims) {
    const st = REV_STYLE[q.hl ? 'existing' : q.style] || REV_STYLE.existing, L = st.layer;
    if (q.hl) continue;
    if (q.t === 'poly') { p(0, 'POLYLINE'); p(8, L); p(66, 1); p(10, 0); p(20, 0); p(30, 0); p(70, q.closed ? 1 : 0); q.pts.forEach(([x, y]) => { p(0, 'VERTEX'); p(8, L); p(10, X(x)); p(20, Y(y)); p(30, 0); }); p(0, 'SEQEND'); p(8, L); }
    else if (q.t === 'line') { p(0, 'LINE'); p(8, L); if (q.hatch) p(6, 'CONTINUOUS'); p(10, X(q.a[0])); p(20, Y(q.a[1])); p(30, 0); p(11, X(q.b[0])); p(21, Y(q.b[1])); p(31, 0); }
    else if (q.t === 'text') { p(0, 'TEXT'); p(8, L); p(10, X(q.x)); p(20, Y(q.y)); p(30, 0); p(40, q.s * k); p(1, q.str); if (q.anchor === 'middle') { p(72, 1); p(11, X(q.x)); p(21, Y(q.y)); p(31, 0); } }
  }
  for (const q of S.sheet) {
    if (q.t === 'rect' || q.t === 'swatch') { const pts = [[q.x, q.y], [q.x + q.w, q.y], [q.x + q.w, q.y + q.h], [q.x, q.y + q.h]]; const L = q.t === 'swatch' ? REV_STYLE[q.style].layer : 'REV-PAFTA'; p(0, 'POLYLINE'); p(8, L); p(66, 1); p(10, 0); p(20, 0); p(30, 0); p(70, 1); pts.forEach(([x, y]) => { p(0, 'VERTEX'); p(8, L); p(10, x); p(20, S.paper.h - y); p(30, 0); }); p(0, 'SEQEND'); p(8, L); }
    else if (q.t === 'line') { p(0, 'LINE'); p(8, 'REV-PAFTA'); p(10, q.a[0]); p(20, S.paper.h - q.a[1]); p(30, 0); p(11, q.b[0]); p(21, S.paper.h - q.b[1]); p(31, 0); }
    else if (q.t === 'text' && q.str) { p(0, 'TEXT'); p(8, 'REV-PAFTA'); p(10, q.x); p(20, S.paper.h - q.y); p(30, 0); p(40, q.s); p(1, q.str); }
  }
  p(0, 'ENDSEC'); p(0, 'EOF');
  return out.join('\r\n') + '\r\n';
}

/* ── vektörel PDF (jsPDF çizim komutları; gerçek ölçek, mm) ── */
let jsp = null;
const loadJsPdf = () => jsp ||= new Promise((res, rej) => { if (window.jspdf) return res(window.jspdf); const s = document.createElement('script'); s.src = 'vendor/jspdf.umd.min.js'; s.onload = () => res(window.jspdf); s.onerror = () => { jsp = null; rej(new Error('jsPDF yüklenemedi')); }; document.head.append(s); });
/* metin: gömülü DejaVu Sans (Türkçe karakterler korunur); gömülemezse pdffont.js ASCII'ye düşer ve pdf.lossyText = true */
export async function revisionPdf(sheets, { compress = true } = {}) {
  const { jsPDF } = await loadJsPdf();
  let pdf = null, F = null;
  const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  for (const S of sheets) {
    const P = S.paper, ori = P.w >= P.h ? 'l' : 'p';
    if (!pdf) { pdf = new jsPDF({ orientation: ori, unit: 'mm', format: [P.w, P.h], compress }); F = await pdfFont(pdf); pdf.lossyText = F.lossy; } else pdf.addPage([P.w, P.h], ori);
    const TR = F.text;
    const { k, dx, dy } = S.map, X = x => x * k + dx, Y = y => y * k + dy;
    for (const q of S.prims) {
      const st = q.hl ? null : REV_STYLE[q.style]; if (!st) continue;
      if (q.t !== 'text') { pdf.setDrawColor(...rgb(st.stroke)); pdf.setLineWidth(q.hatch ? 0.13 : st.w || 0.2); pdf.setLineDashPattern(st.dash && !q.hatch ? st.dash : [], 0); }
      if (q.t === 'poly') {
        const pts = q.pts.map(([x, y]) => [X(x), Y(y)]), segs = pts.slice(1).map((pt, i) => [pt[0] - pts[i][0], pt[1] - pts[i][1]]);
        if (q.fill) pdf.setFillColor(...rgb(q.fill));
        pdf.lines(segs, pts[0][0], pts[0][1], [1, 1], q.fill ? 'FD' : 'S', !!q.closed);
      } else if (q.t === 'line') pdf.line(X(q.a[0]), Y(q.a[1]), X(q.b[0]), Y(q.b[1]));
      else if (q.t === 'text') { pdf.setFont(F.family, 'normal'); pdf.setTextColor(17, 24, 39); pdf.setFontSize(q.s * k / 0.3528); pdf.text(TR(q.str), X(q.x), Y(q.y), { align: q.anchor === 'middle' ? 'center' : 'left' }); }
    }
    pdf.setLineDashPattern([], 0);
    for (const q of S.sheet) {
      if (q.t === 'rect') { pdf.setDrawColor(17, 17, 17); pdf.setLineWidth(q.lw); if (q.fill) pdf.setFillColor(255, 255, 255); pdf.rect(q.x, q.y, q.w, q.h, q.fill ? 'FD' : 'S'); }
      else if (q.t === 'line') { pdf.setDrawColor(17, 17, 17); pdf.setLineWidth(q.lw); pdf.line(q.a[0], q.a[1], q.b[0], q.b[1]); }
      else if (q.t === 'swatch') { const st = REV_STYLE[q.style]; pdf.setDrawColor(...rgb(st.stroke)); pdf.setLineWidth(st.w); pdf.setLineDashPattern(st.dash || [], 0); pdf.setFillColor(...rgb(st.fill || '#FFFFFF')); pdf.rect(q.x, q.y, q.w, q.h, 'FD'); pdf.setLineDashPattern([], 0); }
      else if (q.t === 'text' && q.str) { pdf.setFont(F.family, q.b ? 'bold' : 'normal'); const c = rgb(q.c || '#111111'); pdf.setTextColor(...c); pdf.setFontSize(q.s / 0.3528); pdf.text(TR(q.str), q.x, q.y, q.anchor === 'end' ? { align: 'right' } : undefined); }
    }
  }
  return pdf;
}
/* boş vektörel PDF belgesi (rapor için) */
export async function newPdf(w = 210, h = 297, { compress = true } = {}) { const { jsPDF } = await loadJsPdf(); const pdf = new jsPDF({ orientation: w >= h ? 'l' : 'p', unit: 'mm', format: [w, h], compress }); const F = await pdfFont(pdf); pdf.font = F; pdf.lossyText = F.lossy; return pdf; }
export { lvPlan };
