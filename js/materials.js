/* ═══ Malzeme kütüphanesi ve kompozit yapılar (duvar / döşeme katmanları) ═══
 * Değerler tipik tasarım değerleridir: EN ISO 10456 tablo değerleri ve yaygın ürünlerin performans beyanları (DoP).
 * TS 825 ısı yalıtım hesabında ve akustik raporda kullanılan ürünün kendi beyan değeri esas alınmalıdır;
 * değerler projeye özel olarak "Malzemeler ve yapılar" penceresinden değiştirilebilir.
 *
 * Birimler: rho kg/m³ · lam W/(m·K) (λ) · c J/(kg·K) · mu (buhar difüzyon direnç faktörü, boyutsuz) · d (katman) cm
 * Akustik: Rw tek katmanlı ağır yapılar için kütle yasası (EN 12354-1 Ek B: Rw = 37,5·log m' − 42, m' ≥ 150 kg/m²);
 * döşemede çıplak ağır plak için Ln,w,eq = 164 − 35·log m' (EN 12354-2 Ek B). Hafif / çok kabuklu sistemlerde test değeri gerekir.
 */

export const MAT_GROUPS = [
  ['tasiyici', 'Taşıyıcı / beton'], ['kagir', 'Kâgir (tuğla, blok, taş)'], ['yalitim', 'Isı / ses yalıtımı'],
  ['siva', 'Sıva, harç, şap'], ['kaplama', 'Kaplama'], ['levha', 'Levha / ahşap'], ['su', 'Su / buhar yalıtımı'],
  ['metal', 'Metal / cam'], ['dolgu', 'Zemin / dolgu'], ['bosluk', 'Hava boşluğu'],
];

/* hat: kesit / plan taraması (beton: noktalı-çapraz, kâgir: 45° çizgi, yalıtım: dalga, ahşap: lif, sıva: nokta, yok: düz dolgu) */
export const MATERIALS = [
  { k: 'betonarme', g: 'tasiyici', t: 'Betonarme (C25/30–C30/37, ~%2 donatı)', rho: 2400, lam: 2.5, c: 1000, mu: 130, fire: 'A1', col: '#B9B6AF', hat: 'beton' },
  { k: 'beton', g: 'tasiyici', t: 'Beton, donatısız / grobeton', rho: 2200, lam: 1.65, c: 1000, mu: 120, fire: 'A1', col: '#C7C3BA', hat: 'beton' },
  { k: 'celik', g: 'metal', t: 'Yapı çeliği (S235–S355)', rho: 7800, lam: 50, c: 450, mu: null, fire: 'A1', col: '#7C8794', hat: 'celik' },
  { k: 'aluminyum', g: 'metal', t: 'Alüminyum', rho: 2700, lam: 160, c: 880, mu: null, fire: 'A1', col: '#A9B2BC', hat: 'celik' },
  { k: 'cam', g: 'metal', t: 'Cam (soda-kireç)', rho: 2500, lam: 1.0, c: 750, mu: null, fire: 'A1', col: '#CFE8EE', hat: 'yok' },
  { k: 'tugla-yatay', g: 'kagir', t: 'Yatay delikli tuğla (TS EN 771-1)', rho: 850, lam: 0.40, c: 1000, mu: 5, fire: 'A1', col: '#D9906A', hat: 'kagir', note: 'λ ürüne göre 0,33–0,45' },
  { k: 'tugla-dusey', g: 'kagir', t: 'Düşey delikli yalıtımlı tuğla / blok', rho: 750, lam: 0.28, c: 1000, mu: 5, fire: 'A1', col: '#D48E69', hat: 'kagir', note: 'λ ürüne göre 0,16–0,30' },
  { k: 'tugla-dolu', g: 'kagir', t: 'Dolu tuğla', rho: 1800, lam: 0.80, c: 1000, mu: 10, fire: 'A1', col: '#C47A57', hat: 'kagir' },
  { k: 'gazbeton-400', g: 'kagir', t: 'Gazbeton G2/04 (400 kg/m³)', rho: 400, lam: 0.11, c: 1000, mu: 5, fire: 'A1', col: '#E6E1D6', hat: 'kagir2', note: 'λ beyanı 0,09–0,11' },
  { k: 'gazbeton-600', g: 'kagir', t: 'Gazbeton G4/06 (600 kg/m³)', rho: 600, lam: 0.16, c: 1000, mu: 6, fire: 'A1', col: '#DDD7CA', hat: 'kagir2' },
  { k: 'kalker', g: 'kagir', t: 'Doğal taş — kalker (orta sert)', rho: 2000, lam: 1.4, c: 1000, mu: 50, fire: 'A1', col: '#CDBFA3', hat: 'tas' },
  { k: 'granit', g: 'kagir', t: 'Doğal taş — granit', rho: 2700, lam: 2.8, c: 1000, mu: 10000, fire: 'A1', col: '#A9A39B', hat: 'tas' },
  { k: 'eps', g: 'yalitim', t: 'EPS ısı yalıtım levhası (λ 0,035)', rho: 20, lam: 0.035, c: 1450, mu: 60, fire: 'E', col: '#F4F1C9', hat: 'yalitim', note: 'grafitli EPS 0,031–0,032' },
  { k: 'xps', g: 'yalitim', t: 'XPS ısı yalıtım levhası', rho: 32, lam: 0.034, c: 1450, mu: 150, fire: 'E', col: '#D8E7F5', hat: 'yalitim' },
  { k: 'tasyunu', g: 'yalitim', t: 'Taş yünü levha (cephe / döşeme)', rho: 120, lam: 0.036, c: 1030, mu: 1, fire: 'A1', col: '#E9D79B', hat: 'yalitim' },
  { k: 'camyunu', g: 'yalitim', t: 'Cam yünü (bölme / çatı arası)', rho: 20, lam: 0.037, c: 1030, mu: 1, fire: 'A1', col: '#F1E6A6', hat: 'yalitim' },
  { k: 'pir', g: 'yalitim', t: 'PIR / PUR köpük levha', rho: 32, lam: 0.023, c: 1400, mu: 60, fire: 'B–E', col: '#F2E3C4', hat: 'yalitim', note: 'yangın sınıfı ürüne / yüzey kaplamasına göre' },
  { k: 'siva-cimento', g: 'siva', t: 'Çimento esaslı sıva / şap (çimento-kum)', rho: 1800, lam: 1.0, c: 1000, mu: 10, fire: 'A1', col: '#D6D3CC', hat: 'siva' },
  { k: 'siva-kirec', g: 'siva', t: 'Kireç-çimento sıva / ince dış sıva', rho: 1600, lam: 0.80, c: 1000, mu: 10, fire: 'A1', col: '#E2DED5', hat: 'siva' },
  { k: 'siva-alci', g: 'siva', t: 'Alçı sıva', rho: 1000, lam: 0.40, c: 1000, mu: 10, fire: 'A1', col: '#F1EFEA', hat: 'siva' },
  { k: 'alcipan', g: 'levha', t: 'Alçı levha (12,5 mm)', rho: 900, lam: 0.25, c: 1000, mu: 10, fire: 'A2-s1,d0', col: '#EEEDE8', hat: 'yok' },
  { k: 'ahsap-yumusak', g: 'levha', t: 'Ahşap — yumuşak (çam, ladin)', rho: 500, lam: 0.13, c: 1600, mu: 50, fire: 'D-s2,d0', col: '#D8B98A', hat: 'ahsap' },
  { k: 'ahsap-sert', g: 'levha', t: 'Ahşap — sert (meşe, kayın) / masif parke', rho: 700, lam: 0.18, c: 1600, mu: 50, fire: 'D-s2,d0', col: '#B98A5A', hat: 'ahsap' },
  { k: 'osb', g: 'levha', t: 'OSB levha', rho: 650, lam: 0.13, c: 1700, mu: 50, fire: 'D-s2,d0', col: '#D9B680', hat: 'ahsap' },
  { k: 'laminat', g: 'kaplama', t: 'Laminat parke (HDF)', rho: 850, lam: 0.17, c: 1700, mu: 50, fire: 'Cfl-s1', col: '#C9A27A', hat: 'ahsap' },
  { k: 'seramik', g: 'kaplama', t: 'Seramik / porselen karo', rho: 2300, lam: 1.3, c: 840, mu: null, fire: 'A1', col: '#D2D7DA', hat: 'yok' },
  { k: 'mermer', g: 'kaplama', t: 'Mermer kaplama', rho: 2800, lam: 3.5, c: 1000, mu: 10000, fire: 'A1', col: '#E5E2DC', hat: 'tas' },
  { k: 'kiremit', g: 'kaplama', t: 'Kil kiremit', rho: 2000, lam: 1.0, c: 800, mu: 40, fire: 'A1', col: '#C2603E', hat: 'yok' },
  { k: 'bitum', g: 'su', t: 'Bitümlü su yalıtım membranı', rho: 1100, lam: 0.23, c: 1000, mu: 50000, fire: 'E', col: '#3A3A3A', hat: 'yok' },
  { k: 'pe', g: 'su', t: 'PE folyo / buhar kesici', rho: 920, lam: 0.33, c: 2200, mu: 100000, fire: 'E', col: '#8FB6C9', hat: 'yok' },
  { k: 'kum-cakil', g: 'dolgu', t: 'Kum-çakıl dolgu', rho: 1900, lam: 2.0, c: 1050, mu: 50, fire: 'A1', col: '#D8CDB4', hat: 'dolgu' },
  { k: 'toprak', g: 'dolgu', t: 'Toprak (kil / silt)', rho: 1500, lam: 1.5, c: 1500, mu: 50, fire: 'A1', col: '#B59C7A', hat: 'dolgu' },
  { k: 'hava', g: 'bosluk', t: 'Durgun hava boşluğu (≥ 2,5 cm)', rho: 1.2, lam: null, R: 0.18, c: 1000, mu: 1, fire: '—', col: '#FFFFFF', hat: 'yok', note: 'R = 0,18 m²K/W (EN ISO 6946, havalandırılmayan düşey boşluk)' },
];

/* kullanım: yüzey ısıl dirençleri (EN ISO 6946) — Rsi iç, Rse dış (m²K/W) */
export const USES = {
  'wall-ext': { t: 'Dış duvar', rsi: 0.13, rse: 0.04, kind: 'wall' },
  'wall-int': { t: 'İç duvar', rsi: 0.13, rse: 0.13, kind: 'wall' },
  'wall-ground': { t: 'Toprağa temaslı duvar', rsi: 0.13, rse: 0, kind: 'wall' },
  'slab-int': { t: 'Ara kat döşemesi', rsi: 0.17, rse: 0.17, kind: 'slab' },
  'slab-ground': { t: 'Toprağa oturan döşeme', rsi: 0.17, rse: 0, kind: 'slab' },
  'slab-ext': { t: 'Dış havaya açık döşeme (çıkma, pilotiye)', rsi: 0.17, rse: 0.04, kind: 'slab' },
  'roof': { t: 'Teras / çatı döşemesi', rsi: 0.10, rse: 0.04, kind: 'slab' },
};

/* hazır yapılar — duvarda katmanlar dıştan içe (ya da 1. yüzden 2. yüze), döşemede üstten alta.
 * core: taşıyıcı / ana katman sırası (kesitte kalın çizgiyle sınırlanır) */
export const COMPOSITES = [
  { k: 'dis-tugla-eps', t: 'Dış duvar — tuğla 19 + EPS 5 (mantolama)', use: 'wall-ext', core: 2,
    layers: [['siva-kirec', 0.5], ['eps', 5], ['tugla-yatay', 19], ['siva-alci', 2]] },
  { k: 'dis-gazbeton', t: 'Dış duvar — gazbeton 20 + taş yünü 5', use: 'wall-ext', core: 2,
    layers: [['siva-kirec', 0.5], ['tasyunu', 5], ['gazbeton-400', 20], ['siva-alci', 2]] },
  { k: 'dis-perde', t: 'Dış duvar — betonarme perde 25 + taş yünü 6', use: 'wall-ext', core: 2,
    layers: [['siva-kirec', 0.5], ['tasyunu', 6], ['betonarme', 25], ['siva-alci', 1.5]] },
  { k: 'perde-25', t: 'Betonarme perde 25 (iç)', use: 'wall-int', core: 1,
    layers: [['siva-alci', 1], ['betonarme', 25], ['siva-alci', 1]] },
  { k: 'ic-tugla', t: 'İç bölme — tuğla 10', use: 'wall-int', core: 1,
    layers: [['siva-alci', 2], ['tugla-yatay', 10], ['siva-alci', 2]] },
  { k: 'ic-gazbeton', t: 'İç bölme — gazbeton 10', use: 'wall-int', core: 1,
    layers: [['siva-alci', 1.5], ['gazbeton-600', 10], ['siva-alci', 1.5]] },
  { k: 'alcipan-100', t: 'Hafif bölme — alçı levha 2+2, profil 50 + cam yünü', use: 'wall-int', core: 2, rw: 50,
    rwNote: 'tipik sistem test değeri (CW 50, 2 × 12,5 mm her yüzde, 40–50 mm mineral yün)',
    layers: [['alcipan', 1.25], ['alcipan', 1.25], ['camyunu', 5], ['alcipan', 1.25], ['alcipan', 1.25]] },
  { k: 'yigma-tas', t: 'Yığma taşıyıcı — kalker taş 50', use: 'wall-ext', core: 1,
    layers: [['siva-kirec', 2], ['kalker', 50], ['siva-kirec', 2]] },
  { k: 'istinat', t: 'Bodrum / istinat — betonarme 30 + XPS 5 + bitümlü yalıtım', use: 'wall-ground', core: 2,
    layers: [['xps', 5], ['bitum', 0.5], ['betonarme', 30], ['siva-cimento', 1.5]] },
  { k: 'parapet', t: 'Parapet — tuğla 10', use: 'wall-ext', core: 1,
    layers: [['siva-kirec', 2], ['tugla-yatay', 10], ['siva-kirec', 2]] },
  { k: 'dos-seramik', t: 'Ara kat döşemesi — seramik, şap 5, betonarme 15', use: 'slab-int', core: 2,
    layers: [['seramik', 1], ['siva-cimento', 5], ['betonarme', 15], ['siva-alci', 1]] },
  { k: 'dos-parke', t: 'Ara kat döşemesi — parke, yüzer şap, betonarme 15', use: 'slab-int', core: 4,
    layers: [['laminat', 0.8], ['pe', 0.02], ['siva-cimento', 5], ['tasyunu', 2], ['betonarme', 15], ['siva-alci', 1]] },
  { k: 'dos-zemin', t: 'Zemine oturan döşeme — XPS 5, betonarme 15, grobeton', use: 'slab-ground', core: 4,
    layers: [['seramik', 1], ['siva-cimento', 5], ['xps', 5], ['pe', 0.02], ['betonarme', 15], ['beton', 10], ['kum-cakil', 15]] },
  { k: 'dos-teras', t: 'Teras çatı — XPS 8, bitümlü yalıtım, betonarme 15', use: 'roof', core: 5,
    layers: [['seramik', 1], ['siva-cimento', 4], ['bitum', 0.8], ['xps', 8], ['beton', 5], ['betonarme', 15], ['siva-alci', 1]] },
  { k: 'dos-balkon', t: 'Balkon / çıkma — seramik, şap, betonarme 15', use: 'slab-ext', core: 3,
    layers: [['seramik', 1], ['siva-cimento', 4], ['bitum', 0.5], ['betonarme', 15], ['siva-kirec', 1.5]] },
];

/* yapı elemanı türleri (Archicad'deki "yapı işlevi" ve "konum"a karşılık) */
export const WALL_KINDS = [
  { k: 'dis', t: 'Dış duvar', struct: false, comp: 'dis-tugla-eps' },
  { k: 'ic', t: 'İç bölme duvarı', struct: false, comp: 'ic-tugla' },
  { k: 'perde', t: 'Betonarme perde (taşıyıcı)', struct: true, comp: 'perde-25' },
  { k: 'yigma', t: 'Yığma taşıyıcı duvar', struct: true, comp: 'yigma-tas' },
  { k: 'hafif', t: 'Hafif bölme (alçı levha)', struct: false, comp: 'alcipan-100' },
  { k: 'istinat', t: 'Bodrum / istinat duvarı', struct: true, comp: 'istinat' },
  { k: 'parapet', t: 'Parapet / korkuluk duvarı', struct: false, comp: 'parapet' },
];
export const SLAB_KINDS = [
  { k: 'ara', t: 'Ara kat döşemesi', comp: 'dos-seramik' },
  { k: 'zemin', t: 'Zemine oturan döşeme', comp: 'dos-zemin' },
  { k: 'balkon', t: 'Balkon / çıkma (konsol)', comp: 'dos-balkon' },
  { k: 'teras', t: 'Teras / düz çatı döşemesi', comp: 'dos-teras' },
];
export const COLUMN_MATS = [
  { k: 'betonarme', t: 'Betonarme' }, { k: 'celik', t: 'Çelik profil' }, { k: 'ahsap-sert', t: 'Ahşap' }, { k: 'tugla-dolu', t: 'Yığma (tuğla / taş)' },
];
export const STRUCT_MATS = COLUMN_MATS;

const pick = (arr, k) => arr.find(x => x.k === k);
export const wallKind = w => pick(WALL_KINDS, w?.kind) || null;
export const slabKind = s => pick(SLAB_KINDS, s?.kind) || SLAB_KINDS[0];

/* projeye özel kütüphane: root.meta.materials / root.meta.composites varsa onlar (tam liste), yoksa varsayılanlar */
export const materialsOf = root => root?.meta?.materials?.length ? root.meta.materials : MATERIALS;
export const compositesOf = root => root?.meta?.composites?.length ? root.meta.composites : COMPOSITES;
export const matOf = (root, k) => pick(materialsOf(root), k) || pick(MATERIALS, k) || { k, t: k, rho: 0, lam: 1, c: 1000, mu: 1, fire: '—', col: '#ddd', hat: 'yok' };
export const compOf = (root, k) => k ? (pick(compositesOf(root), k) || pick(COMPOSITES, k) || null) : null;
export const compThickness = comp => comp ? +comp.layers.reduce((s, [, d]) => s + (+d || 0), 0).toFixed(2) : 0;

const FIRE_ORDER = ['A1', 'A2', 'B', 'C', 'D', 'E', 'F'];
const fireRank = f => { const m = /^(A1|A2|B|C|D|E|F)/.exec(String(f || '').replace(/fl$/, '')); return m ? FIRE_ORDER.indexOf(m[1]) : -1; };

/* yapı fiziği: kütle, ısıl direnç, U-değeri, buhar direnci, akustik tahmin, yangın sınıfı */
export function compStats(root, comp) {
  if (!comp) return null;
  const use = USES[comp.use] || USES['wall-ext'];
  let mass = 0, R = 0, sd = 0, worst = null;
  const layers = comp.layers.map(([k, d]) => {
    const m = matOf(root, k), dm = (+d || 0) / 100;
    const r = m.lam ? dm / m.lam : (m.R || 0), ms = (m.rho || 0) * dm;
    mass += ms; R += r; sd += (m.mu || 0) * dm;
    if (m.mu === null) sd = Infinity;
    if (fireRank(m.fire) > fireRank(worst?.fire)) worst = m;
    return { m, d: +d || 0, R: r, mass: ms };
  });
  const Rt = R + use.rsi + use.rse, U = Rt ? 1 / Rt : 0;
  const ground = comp.use === 'slab-ground' || comp.use === 'wall-ground';
  const rw = comp.rw ?? (mass >= 150 ? Math.round(37.5 * Math.log10(mass) - 42) : null);
  const lnw = use.kind === 'slab' && !ground && mass >= 100 ? Math.round(164 - 35 * Math.log10(mass)) : null;
  return {
    use, layers, d: compThickness(comp), mass, R, Rt, U, sd, rw, rwSrc: comp.rw != null ? 'test' : rw != null ? 'mass' : null, lnw,
    fire: worst ? worst.fire : '—', fireMat: worst?.t || '', ground,
  };
}

/* malzeme / yapı özellik tablosu (denetçi panelinde ve kütüphane penceresinde ortak) */
export function statsHtml(root, comp, { esc, fmtNum, compact = false } = {}) {
  const st = compStats(root, comp); if (!st) return '';
  const f = (v, d = 2) => v == null || !Number.isFinite(v) ? '∞' : fmtNum(v, d);
  const rows = st.layers.map(L => `<tr><td><i class="mat-sw" style="background:${L.m.col}"></i>${esc(L.m.t)}</td><td class="r">${fmtNum(L.d, 2)}</td>${compact ? '' : `<td class="r">${fmtNum(L.m.rho, 0)}</td><td class="r">${L.m.lam ? fmtNum(L.m.lam, 3) : '—'}</td>`}<td class="r">${fmtNum(L.R, 3)}</td></tr>`).join('');
  return `<table class="mat-tbl"><thead><tr><th>Katman</th><th class="r">d cm</th>${compact ? '' : '<th class="r">ρ kg/m³</th><th class="r">λ W/mK</th>'}<th class="r">R m²K/W</th></tr></thead><tbody>${rows}</tbody></table>
    <div class="mtable mat-sum">
      <div><span>Toplam kalınlık</span><b>${fmtNum(st.d, 1)} cm</b></div>
      <div><span>Birim alan kütlesi m'</span><b>${fmtNum(st.mass, 0)} kg/m²</b></div>
      <div><span>U-değeri (${esc(st.use.t.toLocaleLowerCase('tr'))}${st.ground ? ', toprak etkisi hariç' : ''})</span><b>${fmtNum(st.U, 3)} W/m²K</b></div>
      <div><span>Toplam ısıl direnç R<sub>T</sub></span><b>${fmtNum(st.Rt, 2)} m²K/W</b></div>
      <div><span>Buhar difüzyon eşdeğer kalınlığı s<sub>d</sub></span><b>${f(st.sd, 1)} m</b></div>
      <div><span>Hava sesi yalıtımı R<sub>w</sub></span><b>${st.rw != null ? `≈ ${st.rw} dB` : '—'}</b></div>
      ${st.lnw != null ? `<div><span>Darbe sesi L<sub>n,w,eq</sub> (çıplak plak)</span><b>≈ ${st.lnw} dB</b></div>` : ''}
      <div><span>Yangına tepki (en düşük katman)</span><b>${esc(st.fire)}</b></div>
    </div>
    <p class="muted small">${st.rwSrc === 'test' ? `R<sub>w</sub>: ${esc(comp.rwNote || 'sistem test değeri')}. ` : st.rwSrc === 'mass' ? 'R<sub>w</sub>: kütle yasası tahmini (EN 12354-1 Ek B). ' : 'R<sub>w</sub>: hafif yapı — kütle yasası geçersiz, sistem test değeri girin. '}${st.lnw != null ? 'L<sub>n,w,eq</sub>: EN 12354-2 Ek B; yüzer şap / kaplama iyileştirmesi (ΔL<sub>w</sub>) dahil değildir. ' : ''}Isıl değerler EN ISO 6946 ile (yüzey dirençleri dahil); malzeme değerleri tipik tasarım değerleridir — ürünün performans beyanını (DoP) esas alın.</p>`;
}

/* ── tarama desenleri (SVG <pattern>, model birimi cm) ──
 * sp: desen aralığı, sw: çizgi kalınlığı (ikisi de çizim biriminde); id öneki aynı belgede birden çok tanımı ayırır */
export function hatchDefs(pre, sp, sw, ink = '#24272B') {
  const P = (k, w, h, body, rot = 0) => `<pattern id="${pre}-${k}" patternUnits="userSpaceOnUse" width="${w}" height="${h}"${rot ? ` patternTransform="rotate(${rot})"` : ''}>${body}</pattern>`;
  const L = (x1, y1, x2, y2, f = 1) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${ink}" stroke-width="${sw * f}"/>`;
  const s = sp;
  return `<defs>
    ${P('kagir', s, s, L(0, 0, 0, s), 45)}
    ${P('kagir2', s * 2, s * 2, L(0, 0, 0, s * 2, 0.8), 45)}
    ${P('tas', s * 1.4, s * 1.4, L(0, 0, 0, s * 1.4) + L(0, 0, s * 1.4, 0), 45)}
    ${P('beton', s * 2.2, s * 2.2, `<circle cx="${s * 0.5}" cy="${s * 0.6}" r="${sw * 1.1}" fill="${ink}"/><circle cx="${s * 1.6}" cy="${s * 1.5}" r="${sw * 0.8}" fill="${ink}"/><path d="M${s * 1.2} ${s * 0.3}l${s * 0.35} ${s * 0.25}l${-s * 0.42} ${s * 0.1}Z" fill="none" stroke="${ink}" stroke-width="${sw * 0.8}"/><path d="M${s * 0.3} ${s * 1.5}l${s * 0.3} ${s * 0.32}l${-s * 0.4} ${s * 0.05}Z" fill="none" stroke="${ink}" stroke-width="${sw * 0.8}"/>`)}
    ${P('yalitim', s * 1.2, s * 1.2, `<path d="M0 ${s * 0.6}Q${s * 0.3} 0 ${s * 0.6} ${s * 0.6}T${s * 1.2} ${s * 0.6}" fill="none" stroke="${ink}" stroke-width="${sw}"/>`)}
    ${P('ahsap', s * 3, s * 0.9, `<path d="M0 ${s * 0.45}C${s} ${s * 0.15} ${s * 2} ${s * 0.75} ${s * 3} ${s * 0.45}" fill="none" stroke="${ink}" stroke-width="${sw * 0.8}"/>`)}
    ${P('siva', s * 0.8, s * 0.8, `<circle cx="${s * 0.2}" cy="${s * 0.25}" r="${sw * 0.7}" fill="${ink}"/><circle cx="${s * 0.6}" cy="${s * 0.62}" r="${sw * 0.6}" fill="${ink}"/>`)}
    ${P('dolgu', s * 1.6, s * 1.6, `<circle cx="${s * 0.4}" cy="${s * 0.4}" r="${sw * 1.6}" fill="none" stroke="${ink}" stroke-width="${sw * 0.7}"/><circle cx="${s * 1.2}" cy="${s * 1.1}" r="${sw}" fill="${ink}"/>`)}
    ${P('celik', s, s, L(0, 0, 0, s, 1.4), 45)}
  </defs>`;
}
/* katman dolgusu: renk + (varsa) tarama */
export const hatchFill = (pre, m) => m.hat && m.hat !== 'yok' ? `url(#${pre}-${m.hat})` : 'none';
