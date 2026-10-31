/* ═══ Yapı elemanları: duvar türü / kompozit katmanlar, kolon, kiriş, döşeme, kesit hattı ═══
 * Çizim (plan SVG), özellik paneli parçaları ve "Malzemeler ve yapılar" kütüphane penceresi.
 * Veri: duvar  { kind, struct, comp, lflip, mat }   — comp: kompozit anahtarı, lflip: katman sırası ters (1. katman −normal tarafta)
 *       kolon  item { type: 'kolon', shape: 'rect'|'round', mat, struct }
 *       kiriş  item { type: 'kiris', w: uzunluk, d: genişlik b, h: yükseklik, z: alt kot, mat }
 *       döşeme P.slabs[] { id, name, kind, comp, pts, top }   — top: üst yüz kotu (katın ±0'ına göre)
 *       kesit  P.sections[] { id, name, a, b, side }         — side: bakış yönü (+1: a→b'nin solu / −1: sağı)
 */
import { V, wallDir, wallNormal, wallExt, polyArea, polyCentroid } from './plan-geom.js';
import {
  MATERIALS, COMPOSITES, MAT_GROUPS, USES, WALL_KINDS, SLAB_KINDS, COLUMN_MATS,
  compOf, compositesOf, materialsOf, matOf, compThickness, statsHtml, hatchDefs, hatchFill, wallKind, slabKind,
} from './materials.js';
import { esc, fmtNum, modal, toast, $, $$, icon } from './ui.js';
import { UNITS, SCALES, unitOf, fmtL } from './units.js';
import { levelWallGeometry, wallOutline, layerPrio, PRIO_LABEL } from './bim/wallgeom.js';

const pts = a => a.map(p => `${p.x},${p.y}`).join(' ');
const INK = '#24272B';

/* ───────────── tarama tanımları ───────────── */
export function structDefs(s) {
  const pre = 'hx' + Math.round(1000 / s);
  return { pre, defs: hatchDefs(pre, 7 / s, 0.6 / s, '#4A4E54') };
}

/* duvar için kompozit: tanımlı yapı ya da tek malzemeli duvar (kalınlık = duvar kalınlığı) */
export function wallComp(R, w, T) {
  const c = compOf(R, w.comp); if (c) return c;
  if (!w.mat) return null;
  const k = wallKind(w)?.k;
  return { k: '', t: matOf(R, w.mat).t, use: k === 'ic' || k === 'hafif' ? 'wall-int' : 'wall-ext', layers: [[w.mat, w.t || T]], core: 0 };
}

/* ───────────── plan çizimi ───────────── */
/* kompozit duvar: katman şeritleri (renk + tarama), taşıyıcı katman sınırı kalın */
export function wallLayersSvg(R, P, w, pre, px) {
  if (w.arc) return '';
  const comp = wallComp(R, w, P.meta.wallT); if (!comp) return '';
  const t = w.t || P.meta.wallT, tot = compThickness(comp) || t, k = t / tot;
  if (t / px(1) < 7) return '';   // çok küçük ölçekte düz dolgu yeterli
  const e = wallExt(P, w), u = wallDir(w), n = wallNormal(w), sd = w.lflip ? -1 : 1;
  const A = V.sub(w.a, V.mul(u, e.a)), B = V.add(w.b, V.mul(u, e.b));
  let o = '', cum = 0;
  const line = off => { const a = V.add(A, V.mul(n, off)), b = V.add(B, V.mul(n, off)); return [a, b]; };
  comp.layers.forEach(([mk, d], i) => {
    const m = matOf(R, mk), d0 = sd * (t / 2 - cum * k), d1 = sd * (t / 2 - (cum + d) * k);
    const [a0, b0] = line(d0), [a1, b1] = line(d1), poly = pts([a0, b0, b1, a1]);
    o += `<polygon points="${poly}" fill="${m.col}"/>`;
    const hf = hatchFill(pre, m); if (hf !== 'none') o += `<polygon points="${poly}" fill="${hf}"/>`;
    if (i) o += `<line x1="${a0.x}" y1="${a0.y}" x2="${b0.x}" y2="${b0.y}" stroke="${INK}" stroke-width="${px(i === comp.core || i === comp.core + 1 ? 1.1 : 0.5)}"/>`;
    cum += +d || 0;
  });
  const [f1a, f1b] = line(t / 2), [f2a, f2b] = line(-t / 2);
  o += `<path d="M${f1a.x} ${f1a.y}L${f1b.x} ${f1b.y}M${f2a.x} ${f2a.y}L${f2b.x} ${f2b.y}" stroke="${INK}" stroke-width="${px(1.4)}" fill="none"/>`;
  return `<g class="wlayers" pointer-events="none">${o}</g>`;
}

/* B2B: birleşimleri temizlenmiş duvarlar — ortak geometriden (bim/wallgeom.js) katman çokgenleri ve tek kontur.
 * Türsüz (kompozitsiz, malzemesiz) duvar koyu dolgu (eski görünüm); kompozitli duvarda katman rengi + tarama.
 * Çok küçük ölçekte (duvar < 7 px) katmanlar yerine düz dolgu. Yay duvarlar (legacy) burada çizilmez. */
export function wallGeomSvg(R, P, pre, px) {
  const geo = levelWallGeometry(R, P, { T: P.meta?.wallT });
  let fill = '';
  for (const S of geo.walls.values()) {
    if (S.legacy) continue;
    const layered = !S.layers[0]?.generic && S.ax.t / px(1) >= 7;
    for (const l of S.layers) for (const p of l.pieces) {
      const q = pts(p);
      // aynı renkte ince kontur: komşu hücreler arasındaki kenar yumuşatma çizgisini kapatır
      if (!layered) { fill += `<polygon class="wallp" points="${q}" fill="${INK}" stroke="${INK}" stroke-width="${px(0.35)}"/>`; continue; }
      fill += `<polygon points="${q}" fill="${l.m.col}" stroke="${l.m.col}" stroke-width="${px(0.35)}"/>`;
      const hf = hatchFill(pre, l.m); if (hf !== 'none') fill += `<polygon points="${q}" fill="${hf}"/>`;
    }
  }
  const o = wallOutline(geo), d = segs => segs.map(([a, b]) => `M${a.x} ${a.y}L${b.x} ${b.y}`).join('');
  return `<g class="walls" pointer-events="none">${fill}
    ${o.seams.length ? `<path d="${d(o.seams)}" stroke="${INK}" stroke-width="${px(0.5)}" fill="none"/>` : ''}
    ${o.cores.length ? `<path d="${d(o.cores)}" stroke="${INK}" stroke-width="${px(1.1)}" fill="none"/>` : ''}
    <path class="wallc" d="${d(o.contour)}" stroke="${INK}" stroke-width="${px(1.4)}" stroke-linecap="square" fill="none"/></g>`;
}

/* döşeme: dolgu + kesik-noktalı sınır; ad ve kalınlık etiketi */
export function slabSvg(R, P, sl, pre, px, sel) {
  if (!sl.pts || sl.pts.length < 3) return '';
  const comp = compOf(R, sl.comp), core = comp ? matOf(R, comp.layers[comp.core ?? 0]?.[0]) : matOf(R, 'betonarme');
  const hf = hatchFill(pre, core), c = polyCentroid(sl.pts), d = comp ? compThickness(comp) : (+sl.t || 15);
  return `<g class="slab ${sel ? 'sel' : ''}">
    <polygon points="${pts(sl.pts)}" fill="${core.col}" fill-opacity="0.32"/>
    ${hf !== 'none' ? `<polygon points="${pts(sl.pts)}" fill="${hf}" opacity="0.35"/>` : ''}
    <polygon points="${pts(sl.pts)}" fill="none" stroke="#5B6068" stroke-width="${px(sel ? 2.2 : 1.3)}" stroke-dasharray="${px(10)} ${px(3)} ${px(2)} ${px(3)}"/>
    <text class="lbl" x="${c.x}" y="${c.y - px(18)}" font-size="${px(11)}" fill="#5B6068">${esc(sl.name || slabKind(sl).t)} · d=${fmtL(d, R)}</text></g>`;
}

/* kolon: dolu kesit (malzeme rengi + tarama), dairesel ya da dikdörtgen */
export function columnSvg(R, it, pre, px) {
  const m = matOf(R, it.mat || 'betonarme'), hf = hatchFill(pre, m), sw = px(1.4);
  const shape = it.shape === 'round'
    ? f => `<circle r="${it.w / 2}" fill="${f}"/>`
    : f => `<rect x="${-it.w / 2}" y="${-it.d / 2}" width="${it.w}" height="${it.d}" fill="${f}"/>`;
  const out = it.shape === 'round' ? `<circle r="${it.w / 2}" fill="none" stroke="${INK}" stroke-width="${sw}"/>` : `<rect x="${-it.w / 2}" y="${-it.d / 2}" width="${it.w}" height="${it.d}" fill="none" stroke="${INK}" stroke-width="${sw}"/>`;
  return shape(m.col) + (hf !== 'none' ? shape(hf) : '') + out;
}

/* kiriş: kesim düzleminin üstünde → kesik çizgi; eksen ve etiket */
export function beamSvg(R, it, px) {
  const x0 = -it.w / 2, y0 = -it.d / 2, fs = Math.min(px(10), it.d * 0.6);
  return `<rect x="${x0}" y="${y0}" width="${it.w}" height="${it.d}" fill="#9AA0A8" fill-opacity="0.12" stroke="${INK}" stroke-width="${px(1.2)}" stroke-dasharray="${px(7)} ${px(4)}"/>
    <line x1="${x0}" y1="0" x2="${-x0}" y2="0" stroke="${INK}" stroke-width="${px(0.6)}" stroke-dasharray="${px(10)} ${px(3)} ${px(2)} ${px(3)}" opacity="0.7"/>
    <text class="itemtxt" y="${-it.d / 2 - px(4)}" font-size="${fs}">${esc(it.label || 'K')} ${fmtL(it.d, R, 0)}/${fmtL(it.h, R, 0)}</text>`;
}

/* kesit hattı: kalın kesik-noktalı çizgi, uçlarda ad ve bakış yönü okları */
export function sectionMarkSvg(sec, px, sel) {
  const u = V.norm(V.sub(sec.b, sec.a)), n0 = { x: -u.y, y: u.x }, n = V.mul(n0, sec.side || 1), r = px(11);
  const col = sel ? '#0EA5E9' : '#C2410C';
  const end = (p, out) => {
    const c = V.add(p, V.mul(u, out * r * 1.6)), tip = V.add(c, V.mul(n, r * 2.2)), b1 = V.add(c, V.mul(u, r * 0.7)), b2 = V.sub(c, V.mul(u, r * 0.7));
    return `<path d="M${b1.x} ${b1.y}L${tip.x} ${tip.y}L${b2.x} ${b2.y}Z" fill="${col}"/><circle cx="${c.x}" cy="${c.y}" r="${r}" fill="#fff" stroke="${col}" stroke-width="${px(1.6)}"/>
      <text x="${c.x}" y="${c.y + px(4)}" font-size="${px(11)}" font-weight="700" text-anchor="middle" fill="${col}" font-family="Inter,Arial">${esc(sec.name || 'A')}</text>`;
  };
  return `<g class="secmark">
    <line x1="${sec.a.x}" y1="${sec.a.y}" x2="${sec.b.x}" y2="${sec.b.y}" stroke="${col}" stroke-width="${px(sel ? 2.6 : 1.8)}" stroke-dasharray="${px(14)} ${px(4)} ${px(3)} ${px(4)}"/>
    ${end(sec.a, -1)}${end(sec.b, 1)}</g>`;
}

/* ───────────── özellik paneli ───────────── */
const opt = (v, t, cur) => `<option value="${esc(v)}" ${String(cur ?? '') === String(v) ? 'selected' : ''}>${esc(t)}</option>`;
const compOptions = (R, kind, cur, none = 'Yok — tek malzeme') => opt('', none, cur || '') + compositesOf(R).filter(c => (USES[c.use]?.kind || 'wall') === kind).map(c => opt(c.k, `${c.t} (${fmtNum(compThickness(c), 1)} cm)`, cur)).join('');
const matOptions = (R, cur, groups = null) => MAT_GROUPS.filter(([g]) => !groups || groups.includes(g)).map(([g, t]) => {
  const ms = materialsOf(R).filter(m => m.g === g); return ms.length ? `<optgroup label="${esc(t)}">${ms.map(m => opt(m.k, m.t, cur)).join('')}</optgroup>` : '';
}).join('');

/* duvar: tür / işlev, taşıyıcılık, kompozit ya da tek malzeme + yapı fiziği */
export function wallStructInsp(R, w, T) {
  const comp = wallComp(R, w, T);
  return `<h4>Yapı ve malzeme</h4>
    <label>Tür / işlev<select class="inp sm" data-k="wkind">${opt('', '— Seçilmedi', w.kind || '')}${WALL_KINDS.map(k => opt(k.k, k.t, w.kind)).join('')}</select></label>
    <label class="check"><input type="checkbox" data-k="struct" ${w.struct ? 'checked' : ''}> Taşıyıcı eleman</label>
    <label>Kompozit yapı (katmanlar)<select class="inp sm" data-k="comp">${compOptions(R, 'wall', w.comp)}</select></label>
    ${w.comp ? '' : `<label>Malzeme<select class="inp sm" data-k="mat">${opt('', '— Belirtilmedi', w.mat || '')}${matOptions(R, w.mat)}</select></label>`}
    ${comp ? statsHtml(R, comp, { esc, fmtNum, compact: true }) : '<p class="muted small">Kompozit yapı ya da malzeme seçildiğinde katmanlar planda ve kesitte taranır; yoğunluk, ısı ve ses yalıtım değerleri hesaplanır.</p>'}
    <div class="row wrap">${w.comp ? `<button class="btn btn-xs btn-ghost" data-act="lflip" title="Katman sırasını duvarın diğer yüzüne al">${icon('rotate')}Katmanları ters çevir</button>` : ''}<button class="btn btn-xs btn-ghost" data-act="lib">${icon('layers')}Malzemeler ve yapılar</button></div>`;
}

/* tek malzemeli eleman (kolon / kiriş): hacim, ağırlık */
function solidStats(R, matK, vol) {
  const m = matOf(R, matK);
  return `<div class="mtable"><div><span>Hacim</span><b>${fmtNum(vol, 3)} m³</b></div><div><span>Ağırlık (ρ ${fmtNum(m.rho, 0)} kg/m³)</span><b>${fmtNum(vol * m.rho, 0)} kg</b></div>
    <div><span>Isı iletkenliği λ</span><b>${m.lam ? fmtNum(m.lam, 3) + ' W/mK' : '—'}</b></div><div><span>Yangına tepki</span><b>${esc(m.fire)}</b></div></div>`;
}

export function columnInsp(R, it, num) {
  const round = it.shape === 'round', A = round ? Math.PI * (it.w / 200) ** 2 : (it.w / 100) * (it.d / 100);
  return `<h4>Kolon</h4>
    <div class="grid2"><label>Kesit<select class="inp sm" data-k="shape">${opt('rect', 'Dikdörtgen', it.shape || 'rect')}${opt('round', 'Dairesel', it.shape)}</select></label>
      <label>Malzeme<select class="inp sm" data-k="mat">${COLUMN_MATS.map(m => opt(m.k, m.t, it.mat || 'betonarme')).join('')}</select></label></div>
    <div class="grid2">${num('w', round ? 'Çap' : 'En (b)', it.w)}${round ? '' : num('d', 'Boy (h)', it.d)}${num('h', 'Yükseklik', it.h)}${num('z', 'Alt kot', it.z || 0)}</div>
    ${num('rot', 'Dönüş', it.rot, '°', 15)}
    <label class="check"><input type="checkbox" data-k="struct" ${it.struct !== false ? 'checked' : ''}> Taşıyıcı eleman</label>
    ${solidStats(R, it.mat || 'betonarme', A * it.h / 100)}
    <div class="row"><button class="btn btn-xs btn-ghost" data-act="rot90">${icon('rotate')}90°</button><button class="btn btn-xs btn-ghost" data-act="dup">${icon('copy')}Çoğalt</button></div>`;
}

export function beamInsp(R, it, num, wallH) {
  return `<h4>Kiriş</h4>
    <label>Malzeme<select class="inp sm" data-k="mat">${COLUMN_MATS.map(m => opt(m.k, m.t, it.mat || 'betonarme')).join('')}</select></label>
    <div class="grid2">${num('w', 'Uzunluk', +it.w.toFixed(1))}${num('d', 'Genişlik (b)', it.d)}${num('h', 'Yükseklik (h)', it.h)}${num('top', 'Üst kot', (it.z || 0) + it.h)}</div>
    ${num('rot', 'Doğrultu', it.rot, '°', 15)}
    <p class="muted small">Kiriş planda kesik çizgiyle (kesim düzleminin üstünde) gösterilir. Üst kot katın ±0,00 kotuna göredir; döşeme altına hizalamak için düğmeyi kullanın (kat yüksekliği ${fmtNum(wallH, 0)} cm).</p>
    ${solidStats(R, it.mat || 'betonarme', (it.w / 100) * (it.d / 100) * (it.h / 100))}
    <div class="row wrap"><button class="btn btn-xs btn-ghost" data-act="beamTop">Döşeme altına hizala</button><button class="btn btn-xs btn-ghost" data-act="dup">${icon('copy')}Çoğalt</button></div>`;
}

export function slabInsp(R, sl, num, edges) {
  const comp = compOf(R, sl.comp), d = comp ? compThickness(comp) : (+sl.t || 15), A = Math.abs(polyArea(sl.pts)) / 1e4;
  return `<h4>Döşeme</h4>
    <label>Ad<input class="inp sm" data-k="name" value="${esc(sl.name || '')}" placeholder="${esc(slabKind(sl).t)}"></label>
    <label>Tür<select class="inp sm" data-k="skind">${SLAB_KINDS.map(k => opt(k.k, k.t, sl.kind || 'ara')).join('')}</select></label>
    <label>Kompozit yapı<select class="inp sm" data-k="comp">${compOptions(R, 'slab', sl.comp, 'Yok — betonarme plak')}</select></label>
    <div class="grid2">${comp ? '' : num('t', 'Kalınlık', d)}${num('top', 'Üst yüz kotu', +sl.top || 0)}</div>
    <div class="mtable"><div><span>Alan</span><b>${fmtNum(A)} m²</b></div><div><span>Kalınlık</span><b>${fmtNum(d, 1)} cm</b></div><div><span>Hacim</span><b>${fmtNum(A * d / 100, 2)} m³</b></div></div>
    ${comp ? statsHtml(R, comp, { esc, fmtNum, compact: true }) : solidStats(R, 'betonarme', A * d / 100)}
    <div class="row wrap"><button class="btn btn-xs btn-ghost" data-act="slabOutline">Dış hattan yeniden oluştur</button><button class="btn btn-xs btn-ghost" data-act="lib">${icon('layers')}Malzemeler ve yapılar</button></div>
    ${edges}`;
}

export function sectionInsp(sec) {
  return `<h4>Kesit hattı</h4>
    <label>Ad<input class="inp sm" data-k="name" value="${esc(sec.name || '')}"></label>
    <p class="muted small">Kesit tüm katları keser; oklar bakış yönünü gösterir. Hattın önünde kalan yapı çizilmez, kesilen elemanlar katmanlarıyla taranır.</p>
    <div class="row wrap"><button class="btn btn-xs btn-primary" data-act="views">${icon('eye')}Kesiti aç</button><button class="btn btn-xs btn-ghost" data-act="secFlip">${icon('rotate')}Bakış yönünü çevir</button></div>`;
}

/* seçimsiz panel: çizim ayarları (birim, ölçek), kat döşemesi yapısı */
export function drawingSettingsInsp(R, slabComp) {
  return `<h4>Çizim ayarları</h4>
    <div class="grid2"><label>Ölçü birimi<select class="inp sm" data-k="root.unit">${UNITS.map(u => opt(u.k, u.t, unitOf(R).k)).join('')}</select></label>
      <label>Çizim ölçeği<select class="inp sm" data-k="root.scale">${SCALES.map(n => opt(n, `1:${n}`, +R.meta.scale || 50)).join('')}</select></label></div>
    <p class="muted small">Birim plandaki ölçü yazılarında, özellik panelinde ve kesit / görünüşlerde kullanılır. Ölçek, ölçekli paftada (PDF) çizimin kağıttaki boyunu belirler; yazı boyları kağıtta sabittir.</p>
    <label>Kat döşemesi yapısı<select class="inp sm" data-k="lv.slabComp">${compOptions(R, 'slab', slabComp, 'Yok — yalnız kalınlık')}</select></label>
    <div class="row wrap"><button class="btn btn-xs btn-primary" data-act="views">${icon('eye')}Kesit ve görünüşler</button><button class="btn btn-xs btn-ghost" data-act="lib">${icon('layers')}Malzemeler ve yapılar</button></div>`;
}

/* ───────────── "Malzemeler ve yapılar" kütüphane penceresi ─────────────
 * Projeye özel tam liste root.meta.composites / root.meta.materials olarak kaydedilir. */
export async function libraryDialog(R, { focus } = {}) {
  const C = JSON.parse(JSON.stringify(compositesOf(R))), M = JSON.parse(JSON.stringify(materialsOf(R)));
  let tab = 'comp', cur = Math.max(0, C.findIndex(c => c.k === focus));
  const root = { meta: { composites: C, materials: M } };   // anlık hesap için
  const compEd = () => {
    const c = C[cur]; if (!c) return '<p class="muted">Yapı yok.</p>';
    return `<div class="lib-ed">
      <div class="grid2"><label>Ad<input class="inp sm" data-c="t" value="${esc(c.t)}"></label>
        <label>Kullanım<select class="inp sm" data-c="use">${Object.entries(USES).map(([k, u]) => opt(k, u.t, c.use)).join('')}</select></label></div>
      <p class="muted small">${USES[c.use]?.kind === 'slab' ? 'Katmanlar üstten alta.' : 'Katmanlar dış yüzden iç yüze (iç duvarda 1. yüzden 2. yüze).'}</p>
      <table class="mat-tbl lib-layers"><thead><tr><th>#</th><th>Malzeme</th><th class="r">d (cm)</th><th>Taşıyıcı</th><th title="Birleşimde yüksek öncelikli katman sürer">Öncelik</th><th></th></tr></thead><tbody>
      ${c.layers.map(([mk, d, pr], i) => { const def = layerPrio(root, { ...c, layers: c.layers.map(([a, b]) => [a, b]) }, i), has = Number.isFinite(+pr) && pr !== null && pr !== ''; return `<tr data-i="${i}"><td>${i + 1}</td><td><select class="inp sm" data-l="m">${matOptions(root, mk)}</select></td>
        <td><input class="inp sm" type="number" step="0.1" min="0" data-l="d" value="${d}"></td>
        <td><input type="radio" name="core" data-l="core" ${(c.core ?? 0) === i ? 'checked' : ''}></td>
        <td><select class="inp sm" data-l="p" title="${esc(PRIO_LABEL[has ? +pr : def] || '')}">${opt('', `Varsayılan (${def})`, has ? String(+pr) : '')}${[9, 8, 7, 6, 5, 4, 3, 2, 1, 0].map(n => opt(String(n), `${n} — ${PRIO_LABEL[n]}`, has ? String(+pr) : '')).join('')}</select></td>
        <td class="nowrap"><button class="icon-btn sm" data-la="up" title="Yukarı">↑</button><button class="icon-btn sm" data-la="dn" title="Aşağı">↓</button><button class="icon-btn sm danger-t" data-la="del" title="Sil">${icon('x')}</button></td></tr>`; }).join('')}
      </tbody></table>
      <div class="row wrap"><button class="btn btn-xs btn-ghost" data-ca="addL">${icon('plus')}Katman ekle</button>
        <label class="mini-l">Ölçülmüş R<sub>w</sub> <input class="inp sm" type="number" step="1" data-c="rw" value="${c.rw ?? ''}" placeholder="kütle yasası" style="width:90px"> dB</label></div>
      <p class="muted small">Öncelik duvar birleşimlerinde hangi katmanın süreceğini belirler (9 taşıyıcı çekirdek … 1 sıva / kaplama). "Varsayılan" malzeme grubundan türetilir.</p>
      ${statsHtml(root, c, { esc, fmtNum })}
    </div>`;
  };
  const matEd = () => `<div class="lib-mats"><table class="mat-tbl"><thead><tr><th></th><th>Malzeme</th><th class="r">ρ kg/m³</th><th class="r">λ W/mK</th><th class="r">c J/kgK</th><th class="r">μ</th><th>Yangın</th></tr></thead><tbody>
    ${M.map((m, i) => `<tr data-m="${i}"><td><input type="color" data-f="col" value="${m.col}"></td><td><input class="inp sm" data-f="t" value="${esc(m.t)}"></td>
      <td><input class="inp sm" type="number" data-f="rho" value="${m.rho}"></td><td><input class="inp sm" type="number" step="0.001" data-f="lam" value="${m.lam ?? ''}" ${m.lam == null ? 'disabled title="Hava boşluğu: R sabit"' : ''}></td>
      <td><input class="inp sm" type="number" data-f="c" value="${m.c}"></td><td><input class="inp sm" type="number" data-f="mu" value="${m.mu ?? ''}" placeholder="∞"></td><td><input class="inp sm" data-f="fire" value="${esc(m.fire)}" style="width:80px"></td></tr>`).join('')}
    </tbody></table><button class="btn btn-xs btn-ghost" data-ma="add">${icon('plus')}Malzeme ekle</button>
    <p class="muted small">Değerler EN ISO 10456 tablo değerleri ve yaygın ürün beyanlarına dayalı tipik tasarım değerleridir. Projede kullanılan ürünün performans beyanındaki (DoP) λ, yoğunluk ve yangın sınıfını girin.</p></div>`;
  const body = document.createElement('div');
  const draw = () => {
    body.innerHTML = `<div class="seg lib-tabs"><button data-tab="comp" class="${tab === 'comp' ? 'on' : ''}">Yapılar (kompozit)</button><button data-tab="mat" class="${tab === 'mat' ? 'on' : ''}">Malzemeler</button></div>
      ${tab === 'comp' ? `<div class="lib-wrap"><div class="lib-list">${C.map((c, i) => `<button class="lib-item ${i === cur ? 'on' : ''}" data-ci="${i}"><b>${esc(c.t)}</b><small>${esc(USES[c.use]?.t || '')} · ${fmtNum(compThickness(c), 1)} cm</small></button>`).join('')}
        <div class="row wrap"><button class="btn btn-xs btn-ghost" data-ca="new">${icon('plus')}Yeni</button><button class="btn btn-xs btn-ghost" data-ca="copy">${icon('copy')}Kopyala</button><button class="btn btn-xs btn-ghost danger-t" data-ca="del">${icon('trash')}Sil</button></div></div>${compEd()}</div>` : matEd()}`;
  };
  draw();
  body.addEventListener('click', e => {
    const t = e.target.closest('[data-tab]'); if (t) { tab = t.dataset.tab; return draw(); }
    const ci = e.target.closest('[data-ci]'); if (ci) { cur = +ci.dataset.ci; return draw(); }
    const ca = e.target.closest('[data-ca]')?.dataset.ca, la = e.target.closest('[data-la]')?.dataset.la, c = C[cur];
    if (ca === 'new') { C.push({ k: 'y' + Date.now().toString(36), t: 'Yeni yapı', use: 'wall-int', core: 0, layers: [['tugla-yatay', 10]] }); cur = C.length - 1; }
    else if (ca === 'copy' && c) { C.splice(cur + 1, 0, { ...JSON.parse(JSON.stringify(c)), k: 'y' + Date.now().toString(36), t: c.t + ' (kopya)' }); cur++; }
    else if (ca === 'del' && c) { if (C.length < 2) return toast('En az bir yapı kalmalı', 'err'); C.splice(cur, 1); cur = Math.max(0, cur - 1); }
    else if (ca === 'addL' && c) c.layers.push(['siva-alci', 1]);
    else if (la && c) {
      const i = +e.target.closest('[data-i]').dataset.i, L = c.layers;
      if (la === 'del') { if (L.length < 2) return toast('En az bir katman kalmalı', 'err'); L.splice(i, 1); if (c.core >= L.length) c.core = L.length - 1; }
      if (la === 'up' && i > 0) { [L[i - 1], L[i]] = [L[i], L[i - 1]]; if (c.core === i) c.core--; else if (c.core === i - 1) c.core++; }
      if (la === 'dn' && i < L.length - 1) { [L[i + 1], L[i]] = [L[i], L[i + 1]]; if (c.core === i) c.core++; else if (c.core === i + 1) c.core--; }
    } else if (e.target.closest('[data-ma]')) M.push({ k: 'm' + Date.now().toString(36), g: 'kagir', t: 'Yeni malzeme', rho: 1000, lam: 0.5, c: 1000, mu: 10, fire: 'A1', col: '#CCCCCC', hat: 'kagir' });
    else return;
    draw();
  });
  body.addEventListener('change', e => {
    const el = e.target, c = C[cur];
    if (el.dataset.c && c) { const k = el.dataset.c; c[k] = k === 'rw' ? (el.value === '' ? undefined : +el.value) : el.value; if (k === 'rw' && c.rw === undefined) delete c.rw; }
    else if (el.dataset.l && c) {
      const i = +el.closest('[data-i]').dataset.i;
      if (el.dataset.l === 'm') c.layers[i][0] = el.value;
      else if (el.dataset.l === 'd') c.layers[i][1] = Math.max(0, +el.value || 0);
      else if (el.dataset.l === 'p') { if (el.value === '') c.layers[i].length = 2; else c.layers[i][2] = Math.max(0, Math.min(9, +el.value)); }   // birleşim önceliği (boş: malzemeden)
      else c.core = i;
    } else if (el.dataset.f) {
      const m = M[+el.closest('[data-m]').dataset.m], f = el.dataset.f;
      m[f] = ['rho', 'lam', 'c', 'mu'].includes(f) ? (el.value === '' ? null : +el.value) : el.value;
    } else return;
    draw();
  });
  const r = await modal({ title: 'Malzemeler ve yapılar', body, wide: true, actions: [{ k: 'reset', t: 'Varsayılanlara dön', cls: 'btn-ghost' }, { k: 'no', t: 'Vazgeç' }, { k: 'ok', t: 'Kaydet', cls: 'btn-primary' }] });
  if (r?.k === 'reset') { delete R.meta.composites; delete R.meta.materials; return true; }
  if (r?.k !== 'ok') return false;
  R.meta.composites = C; R.meta.materials = M;
  return true;
}

export { COMPOSITES, MATERIALS };
