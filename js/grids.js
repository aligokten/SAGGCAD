/* ═══ Akslar (yapı aks sistemi) ve kolon / kiriş referans noktaları ═══
 * Saf geometri: çizim editörü (plan2d.js) ve testler kullanır.
 *
 * Aks kaydı (kat planında `grids` dizisi; isteğe bağlı — eski projelerde yok):
 *   { id, a: {x,y}, b: {x,y}, name: 'A' | '1' …, bub: 'both' | 'a' | 'b' | 'none' }
 * Zemin kattaki (kök plan) akslar üst katlarda da görünür ve yaslama noktasıdır; her kat kendi akslarını da taşıyabilir.
 * Adlandırma: yatay akslar harf (A, B, C … Z, AA …), düşey akslar rakam (1, 2, 3 …); eğik aks yönüne göre en yakını.
 *
 * Kolon / kiriş öğeleri (items, type 'kolon' | 'kiris'): merkez (x, y), w (kirişte boy), d, rot (derece, SVG yönü).
 * Dünya = merkez + R(rot) · yerel.
 */

const rad = d => (d || 0) * Math.PI / 180;
export const rotPt = (p, deg) => { const a = rad(deg), c = Math.cos(a), s = Math.sin(a); return { x: p.x * c - p.y * s, y: p.x * s + p.y * c }; };
const r2 = v => +v.toFixed(2);

/* ── adlandırma ── */
export const letterOf = n => { let s = ''; n++; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
const letterIdx = s => [...s].reduce((n, ch) => n * 26 + (ch.charCodeAt(0) - 64), 0) - 1;
/* yatay ağırlıklı aks → harf, düşey ağırlıklı → rakam */
export const gridAxisKind = g => Math.abs(g.b.x - g.a.x) >= Math.abs(g.b.y - g.a.y) ? 'letter' : 'number';
export function nextGridName(grids, kind) {
  const names = (grids || []).map(g => String(g.name || ''));
  if (kind === 'letter') { const used = names.filter(n => /^[A-Z]+$/.test(n)).map(letterIdx); return letterOf(used.length ? Math.max(...used) + 1 : 0); }
  const used = names.filter(n => /^\d+$/.test(n)).map(Number); return String(used.length ? Math.max(...used) + 1 : 1);
}

/* ── aks sistemi: aralık listelerinden akslar ──
 * xs: düşey aksların (rakam) ardışık aralıkları, ys: yatay aksların (harf) aralıkları — cm. Başlangıç (x0, y0) ilk aks
 * kesişimidir; akslar en dış akslardan `over` kadar taşar. Adlar mevcut akslardan devam eder. */
export function gridArray({ xs = [], ys = [], x0 = 0, y0 = 0, over = 150, existing = [], uid = (() => { let i = 0; return () => 'ax' + (++i); })() } = {}) {
  const X = [x0], Y = [y0];
  for (const d of xs) X.push(X.at(-1) + d);
  for (const d of ys) Y.push(Y.at(-1) + d);
  const xmin = Math.min(...X) - over, xmax = Math.max(...X) + over, ymin = Math.min(...Y) - over, ymax = Math.max(...Y) + over;
  const out = [], all = [...existing];
  const add = (a, b, kind) => { const g = { id: uid(), a, b, name: nextGridName(all, kind), bub: 'both' }; all.push(g); out.push(g); };
  if (xs.length || !ys.length) for (const x of X) add({ x: r2(x), y: r2(ymin) }, { x: r2(x), y: r2(ymax) }, 'number');
  if (ys.length || !xs.length) for (const y of Y) add({ x: r2(xmin), y: r2(y) }, { x: r2(xmax), y: r2(y) }, 'letter');
  return out;
}
/* "400 500 400", "3x400", "400;350" → [400, 500, 400] / [400, 400, 400] (geçersiz → null) */
export function parseSpacing(s) {
  const out = [];
  for (const tok of String(s || '').trim().split(/[\s;]+/).filter(Boolean)) {
    const m = tok.replace(',', '.').match(/^(?:(\d+)\s*[x×*]\s*)?(\d+(?:\.\d+)?)$/i);
    if (!m) return null;
    const n = m[1] ? +m[1] : 1, v = +m[2];
    if (!(v > 0) || n < 1 || n > 200) return null;
    for (let i = 0; i < n; i++) out.push(v);
  }
  return out;
}

/* ── kesişimler (yaslama) ── */
export function segX(a, b, c, d) {
  const r = { x: b.x - a.x, y: b.y - a.y }, s = { x: d.x - c.x, y: d.y - c.y }, den = r.x * s.y - r.y * s.x;
  if (Math.abs(den) < 1e-9) return null;
  const qp = { x: c.x - a.x, y: c.y - a.y }, t = (qp.x * s.y - qp.y * s.x) / den, u = (qp.x * r.y - qp.y * r.x) / den;
  if (t < -1e-6 || t > 1 + 1e-6 || u < -1e-6 || u > 1 + 1e-6) return null;
  return { x: r2(a.x + r.x * t), y: r2(a.y + r.y * t) };
}
export function gridIntersections(grids) {
  const out = [];
  for (let i = 0; i < grids.length; i++) for (let j = i + 1; j < grids.length; j++) { const p = segX(grids[i].a, grids[i].b, grids[j].a, grids[j].b); if (p) out.push({ ...p, g: [grids[i].name, grids[j].name] }); }
  return out;
}

/* ── kolon / kiriş referans noktaları ── */
export const isStruct = it => it?.type === 'kolon' || it?.type === 'kiris';
/* yerel köşeler (0 sol üst, 1 sağ üst, 2 sağ alt, 3 sol alt — dönüşsüz plan görünümünde) */
export const LOCAL_CORNERS = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
export function itemCorners(it) {
  return LOCAL_CORNERS.map(([sx, sy]) => { const q = rotPt({ x: sx * it.w / 2, y: sy * it.d / 2 }, it.rot); return { x: r2(it.x + q.x), y: r2(it.y + q.y) }; });
}
/* kiriş eksen uçları (a: yerel −x, b: yerel +x) */
export function beamEnds(it) {
  const u = rotPt({ x: it.w / 2, y: 0 }, it.rot);
  return { a: { x: r2(it.x - u.x), y: r2(it.y - u.y) }, b: { x: r2(it.x + u.x), y: r2(it.y + u.y) } };
}
/* diğer çizimlerin yaslanacağı noktalar: köşeler, merkez, kiriş uçları */
export function structSnapPts(it) {
  const pts = itemCorners(it).map(p => ({ ...p, k: 'corner' }));
  pts.push({ x: it.x, y: it.y, k: 'end' });
  if (it.type === 'kiris') { const e = beamEnds(it); pts.push({ ...e.a, k: 'end' }, { ...e.b, k: 'end' }); }
  return pts;
}
/* tutulan referans noktası (köşe i ya da merkez) hedefe gelecek şekilde yeni merkez */
export function moveByCorner(it, i, target) {
  const [sx, sy] = LOCAL_CORNERS[i], q = rotPt({ x: sx * it.w / 2, y: sy * it.d / 2 }, it.rot);
  return { x: r2(target.x - q.x), y: r2(target.y - q.y) };
}
/* kiriş ucunu taşı: diğer uç sabit; merkez, boy ve açı yeniden */
export function beamFromEnds(a, b) {
  const L = Math.hypot(b.x - a.x, b.y - a.y), ang = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
  return { x: r2((a.x + b.x) / 2), y: r2((a.y + b.y) / 2), w: +L.toFixed(1), rot: +((ang + 360) % 360).toFixed(2) };
}

/* ── yerleştirme noktası (kolon aracı) ── */
export const ANCHORS = [
  { k: 'c', t: 'Merkez' }, { k: 'tl', t: 'Sol üst köşe' }, { k: 'tr', t: 'Sağ üst köşe' }, { k: 'br', t: 'Sağ alt köşe' }, { k: 'bl', t: 'Sol alt köşe' },
];
const ANCHOR_SIGN = { c: [0, 0], tl: [-1, -1], tr: [1, -1], br: [1, 1], bl: [-1, 1] };
/* tıklanan nokta = seçilen referans noktası → kolon merkezi */
export function anchorCenter(p, w, d, rot = 0, anchor = 'c') {
  const [sx, sy] = ANCHOR_SIGN[anchor] || [0, 0], q = rotPt({ x: sx * w / 2, y: sy * d / 2 }, rot);
  return { x: r2(p.x - q.x), y: r2(p.y - q.y) };
}
/* kiriş çizgisi hizası: eksen | sağ yüz (gövde çizim yönünün solunda) | sol yüz — yön y aşağı ekran koordinatında */
export const BEAM_ALIGNS = [{ k: 'axis', t: 'Çizgi eksende' }, { k: 'right', t: 'Çizgi sağ yüzde' }, { k: 'left', t: 'Çizgi sol yüzde' }];
export function beamAlignOffset(a, b, d, align = 'axis') {
  if (align === 'axis') return { x: 0, y: 0 };
  const L = Math.hypot(b.x - a.x, b.y - a.y) || 1, u = { x: (b.x - a.x) / L, y: (b.y - a.y) / L }, right = { x: -u.y, y: u.x };
  const k = align === 'right' ? -d / 2 : d / 2;   // çizgi sağ yüzdeyse gövde sola kayar
  return { x: right.x * k, y: right.y * k };
}

/* ── çizim (SVG) ── px: ekran piksel → model birimi */
export const GRID_STYLE = { stroke: '#C0392B', bubble: '#FFFFFF', text: '#0F1B2D' };
export function gridSvg(g, px, { sel = false, inherited = false } = {}) {
  const L = Math.hypot(g.b.x - g.a.x, g.b.y - g.a.y); if (L < 1e-6) return '';
  const u = { x: (g.b.x - g.a.x) / L, y: (g.b.y - g.a.y) / L }, R = px(11), bub = g.bub || 'both';
  const ends = [['a', g.a, -1], ['b', g.b, 1]].filter(([k]) => bub === 'both' || bub === k);
  const op = inherited ? 0.55 : 1;
  let o = `<g class="grid-ax${sel ? ' sel' : ''}" data-grid="${g.id}" opacity="${op}">`;
  o += `<line x1="${g.a.x}" y1="${g.a.y}" x2="${g.b.x}" y2="${g.b.y}" stroke="${GRID_STYLE.stroke}" stroke-width="${px(sel ? 1.8 : 1)}" stroke-dasharray="${px(14)} ${px(3)} ${px(2)} ${px(3)}" fill="none"/>`;
  for (const [, p, sgn] of ends) {
    const c = { x: p.x + u.x * R * sgn, y: p.y + u.y * R * sgn };
    o += `<circle cx="${c.x}" cy="${c.y}" r="${R}" fill="${GRID_STYLE.bubble}" stroke="${GRID_STYLE.stroke}" stroke-width="${px(1.3)}"/>`
      + `<text x="${c.x}" y="${c.y}" font-size="${px(11)}" font-weight="700" font-family="Inter,Arial,sans-serif" fill="${GRID_STYLE.text}" text-anchor="middle" dominant-baseline="central">${String(g.name || '').replace(/[<&>"]/g, ch => ({ '<': '&lt;', '&': '&amp;', '>': '&gt;', '"': '&quot;' })[ch])}</text>`;
  }
  return o + '</g>';
}
