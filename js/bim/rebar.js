/* ═══ Betonarme donatı hesabı ve metrajı ═══
 * SAF modül (DOM yok). Kolon, kiriş, döşeme ve betonarme perde / duvar için çubuk boyu, adet ve ağırlık (kg) üretir.
 *
 * İki kaynak, hiçbir zaman karıştırılmaz:
 *   manual  — "Statik projeden": kullanıcının girdiği donatı (çap, adet, aralık). Metraj kesindir (girdi kadar).
 *   min     — "Yönetmelik minimumu (yaklaşık)": TS 500 / TBDY 2018'in minimum koşullarından (donatı oranı, en küçük
 *             çap / adet, en büyük aralık, sarılma bölgesi) türetilen ÖN TAHMİN. Statik hesabın yerini tutmaz; raporda
 *             ayrı sütunda ve "tahmini" etiketiyle gösterilir. Kural katsayıları `meta.rebar` içinde düzenlenebilir.
 *   none    — donatı tanımlanmamış: metraja girmez, "tanımsız" sayılır (varsayım üretilmez).
 *
 * Birimler: geometri cm, çap mm, boy cm (çıktıda m), ağırlık kg. Çelik birim ağırlığı 7850 kg/m³.
 * Eleman verisi: kolon / kiriş öğesinde `rb`, döşemede `rb`, duvarda `rb` (isteğe bağlı alan — eski projeler değişmez).
 */
import { planLevels, polyArea } from '../plan-geom.js';
import { compOf, WALL_KINDS } from '../materials.js';

export const DIAMETERS = [8, 10, 12, 14, 16, 18, 20, 22, 25, 28, 32];
export const STEEL_DENSITY = 7850;
/* kg/m: ρ·π·Ø²/4 (Ø8 → 0,395; Ø10 → 0,617; Ø12 → 0,888; Ø16 → 1,578) */
export const kgPerM = d => STEEL_DENSITY * Math.PI * (d / 1000) ** 2 / 4;
export const barArea = d => Math.PI * (d / 10) ** 2 / 4;   // cm²
const FCK = { C20: 20, C25: 25, C30: 30, C35: 35, C40: 40, C45: 45, C50: 50 };
const FYK = { B420C: 420, B500C: 500 };

/* kurallar: proje (kök plan) `meta.rebar` — varsayılanlar üzerine yazılır */
export const DEFAULT_RULES = Object.freeze({
  concrete: 'C25', steel: 'B420C',
  cover: { col: 3, beam: 3, slab: 2, wall: 2.5 },   // paspayı (etriye / en dış çubuk dış yüzüne), cm
  lap: 40,        // bindirme boyu, ×Ø (kolonda üst kata filiz; 12 m'yi aşan çubukta ek)
  endHook: 12,    // boyuna çubuk uç bükümü, ×Ø (her uç)
  stirHook: 10,   // etriye 135° kanca, ×Ø (her kanca)
  stock: 1200,    // ticari çubuk boyu, cm
  min: {
    colRho: 0.01, colRhoMax: 0.04, colMinD: 14, colMinN: 4, colMinNRound: 6, stirMinD: 8,
    colConfMax: 15, colMidMax: 20,                       // sarılma bölgesinde / dışında en büyük etriye aralığı, cm
    beamMinD: 12, beamMinN: 2, beamConfMax: 15,
    slabRhoTotal: 0.0035, slabMinD: 8, slabSmax: 25,     // iki doğrultuda çalışan döşeme: iki doğrultu toplamı
    wallRho: 0.0025, wallMinD: 10, wallSmax: 25,         // perde gövdesi: her doğrultuda, iki yüz toplamı
  },
});
export function rulesOf(root) {
  const r = root?.meta?.rebar || {};
  return { ...DEFAULT_RULES, ...r, cover: { ...DEFAULT_RULES.cover, ...(r.cover || {}) }, min: { ...DEFAULT_RULES.min, ...(r.min || {}) } };
}
export const MODES = { none: 'Tanımsız', min: 'Yönetmelik minimumu (yaklaşık)', manual: 'Statik projeden (elle)' };
export const KIND_T = { kolon: 'Kolon', kiris: 'Kiriş', slab: 'Döşeme', wall: 'Perde / betonarme duvar' };

const fl = (v, step = 1) => Math.floor(v / step + 1e-9) * step;
const ceil = v => Math.ceil(v - 1e-9);

/* ── geometri: modelden betonarme elemanlar ── */
const betonThk = comp => comp ? comp.layers.filter(([m]) => m === 'betonarme').reduce((s, [, d]) => s + (+d || 0), 0) : 0;
export function slabConcreteT(R, sl) { const c = compOf(R, sl.comp); return c ? betonThk(c) : (+sl.t || 15); }
export function wallConcreteT(R, w) { return betonThk(compOf(R, w.comp || WALL_KINDS.find(k => k.k === w.kind)?.comp)); }
export const isConcreteItem = it => (it?.type === 'kolon' || it?.type === 'kiris') && (it.mat || 'betonarme') === 'betonarme';

/* model → [{ key, level, levelName, kind, id, name, geom, rb, P }] */
export function concreteElements(R) {
  const out = [];
  for (const L of planLevels(R)) {
    if (L.kind === 'roof') continue;
    const P = L.plan, lv = L.idx === 0 ? 'L0' : P.id, H0 = L.h;
    let nc = 0, nb = 0;
    for (const it of P.items || []) {
      if (!isConcreteItem(it)) continue;
      if (it.type === 'kolon') out.push({ key: `${lv}/${it.id}`, level: L.idx, levelName: L.name, kind: 'kolon', coll: 'item', id: it.id, name: it.label && it.label !== 'Kolon' ? it.label : `S${++nc}`, rb: it.rb, geom: { b: +it.w, h: it.shape === 'round' ? +it.w : +it.d, round: it.shape === 'round', H: +it.h || H0 } });
      else out.push({ key: `${lv}/${it.id}`, level: L.idx, levelName: L.name, kind: 'kiris', coll: 'item', id: it.id, name: it.label && it.label !== 'K' ? it.label : `K${++nb}`, rb: it.rb, geom: { L: +it.w, b: +it.d, h: +it.h } });
    }
    (P.slabs || []).forEach((sl, i) => { const t = slabConcreteT(R, sl); if (t > 0 && sl.pts?.length >= 3) out.push({ key: `${lv}/${sl.id}`, level: L.idx, levelName: L.name, kind: 'slab', coll: 'slab', id: sl.id, name: sl.name || `D${i + 1}`, rb: sl.rb, geom: { pts: sl.pts, t } }); });
    let nw = 0;
    for (const w of P.walls || []) {
      const t = wallConcreteT(R, w); if (!(t > 0)) continue;
      const len = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y);
      const ops = (P.openings || []).filter(o => o.wallId === w.id).length;
      out.push({ key: `${lv}/${w.id}`, level: L.idx, levelName: L.name, kind: 'wall', coll: 'wall', id: w.id, name: `P${++nw}`, rb: w.rb, geom: { L: len, t, H: +w.h || H0, openings: ops } });
    }
  }
  return out;
}

/* ── yönetmelik minimumu (ön tahmin) ── */
export function minSpec(kind, g, rules = DEFAULT_RULES) {
  const M = rules.min, cv = rules.cover;
  if (kind === 'kolon') {
    const Ac = g.round ? Math.PI * g.b ** 2 / 4 : g.b * g.h, As = M.colRho * Ac, nMin = g.round ? M.colMinNRound : M.colMinN;
    let d = M.colMinD, n = nMin;
    for (const dd of DIAMETERS.filter(x => x >= M.colMinD)) { d = dd; n = Math.max(nMin, ceil(As / barArea(dd))); if (!g.round && n % 2) n++; if (n <= (g.round ? 16 : 12)) break; }
    const bmin = Math.min(g.b, g.h), sd = Math.max(M.stirMinD, DIAMETERS.find(x => x >= d / 3) || 8);
    const sc = Math.max(5, fl(Math.min(bmin / 3, M.colConfMax))), s = Math.max(sc, fl(Math.min(bmin / 2, M.colMidMax)));
    const lc = Math.ceil(Math.max(g.b, g.h, (g.H || 0) / 6, 50));
    return { mode: 'min', n, d, sd, sc, s, lc };
  }
  if (kind === 'kiris') {
    const fck = FCK[rules.concrete] || 25, fyk = FYK[rules.steel] || 420;
    const fctd = 0.35 * Math.sqrt(fck) / 1.5, fyd = fyk / 1.15, rho = 0.8 * fctd / fyd;
    const deff = g.h - cv.beam - 1, As = rho * g.b * deff, d = M.beamMinD;
    const nb = Math.max(M.beamMinN, ceil(As / barArea(d)));
    const sc = Math.max(5, fl(Math.min(g.h / 4, M.beamConfMax))), s = Math.max(sc, fl(deff / 2));
    return { mode: 'min', nt: M.beamMinN, dt: d, nb, db: d, sd: M.stirMinD, sc, s, lc: Math.ceil(2 * g.h), rhoMin: +rho.toFixed(5) };
  }
  if (kind === 'slab') {
    const d = M.slabMinD, As = M.slabRhoTotal / 2 * g.t * 100;   // her doğrultu, cm²/m
    const s = Math.max(5, fl(Math.min(barArea(d) * 100 / As, 1.5 * g.t, M.slabSmax), 0.5));
    return { mode: 'min', dx: d, sx: s, dy: d, sy: s, top: false };
  }
  if (kind === 'wall') {
    const d = M.wallMinD, As = M.wallRho * g.t * 100 / 2;   // her yüz, her doğrultu, cm²/m
    const s = Math.max(5, fl(Math.min(barArea(d) * 100 / As, M.wallSmax), 0.5));
    return { mode: 'min', dv: d, sv: s, dh: d, sh: s };
  }
  return null;
}
/* kullanıcı tanımı + kaynak: none → null; min → minSpec; manual → kayıtlı değerler (eksik alan = hata, varsayım yok) */
const FIELDS = { kolon: ['n', 'd', 'sd', 'sc', 's', 'lc'], kiris: ['nt', 'dt', 'nb', 'db', 'sd', 'sc', 's', 'lc'], slab: ['dx', 'sx', 'dy', 'sy'], wall: ['dv', 'sv', 'dh', 'sh'] };
export const fieldsOf = kind => FIELDS[kind] || [];
export function specOf(el, rules) {
  const rb = el.rb || {}, mode = rb.mode || 'none';
  if (mode === 'min') return minSpec(el.kind, el.geom, rules);
  if (mode === 'manual') {
    const missing = FIELDS[el.kind].filter(k => !(+rb[k] > 0) && !(k === 'lc'));
    return missing.length ? { mode, invalid: missing } : { ...rb, mode };
  }
  return null;
}

/* ── çubuk listesi (metraj) ── */
/* uzun çubukta ek: ticari boyu aşarsa her ek için bindirme */
function withLaps(len, d, R) { const n = len > R.stock ? ceil(len / R.stock) - 1 : 0; return { len: len + n * R.lap * d / 10, laps: n }; }
function stirrupCount(len, lc, sc, s) {
  if (!(len > 0)) return 0;
  if (2 * lc >= len) return fl(len / sc) + 1;
  const nc = fl(lc / sc) + 1, mid = len - 2 * lc;
  return 2 * nc + Math.max(0, ceil(mid / s) - 1);
}
/* çokgeni yatay (dir 'x') ya da düşey (dir 'y') çizgilerle tara: her çubuğun kesişim parçaları (cm) */
export function scanBars(pts, dir, s, cover) {
  const P = dir === 'x' ? pts : pts.map(p => ({ x: p.y, y: p.x }));
  const ys = P.map(p => p.y), y0 = Math.min(...ys) + cover, y1 = Math.max(...ys) - cover;
  const bars = [];
  if (y1 < y0) return bars;
  const n = fl((y1 - y0) / s) + 1, step = n > 1 ? (y1 - y0) / (n - 1) : 0;
  for (let i = 0; i < n; i++) {
    const y = n > 1 ? y0 + i * step : (y0 + y1) / 2, xs = [];
    for (let j = 0; j < P.length; j++) {
      const a = P[j], b = P[(j + 1) % P.length];
      if ((a.y <= y && b.y > y) || (b.y <= y && a.y > y)) xs.push(a.x + (y - a.y) / (b.y - a.y) * (b.x - a.x));
    }
    xs.sort((u, v) => u - v);
    for (let k = 0; k + 1 < xs.length; k += 2) { const L = xs[k + 1] - xs[k] - 2 * cover; if (L > 0) bars.push(L); }
  }
  return bars;
}

/* tek eleman: { bars: [{ role, d, n, len (cm, her biri), m (toplam), kg }], concrete (m³), kg, ratio (kg/m³), warnings } */
export function takeoff(el, rules = DEFAULT_RULES) {
  const R = rules, g = el.geom, spec = specOf(el, R), warnings = [], bars = [];
  const add = (role, d, n, len) => { if (n > 0 && len > 0) bars.push({ role, d: +d, n, len: +len.toFixed(1), m: n * len / 100, kg: n * len / 100 * kgPerM(d) }); };
  let concrete = 0;
  if (el.kind === 'kolon') concrete = (g.round ? Math.PI * g.b ** 2 / 4 : g.b * g.h) * g.H / 1e6;
  if (el.kind === 'kiris') concrete = g.b * g.h * g.L / 1e6;
  if (el.kind === 'slab') concrete = Math.abs(polyArea(g.pts)) * g.t / 1e6;
  if (el.kind === 'wall') { concrete = g.L * g.t * g.H / 1e6; if (g.openings) warnings.push(`${g.openings} açıklık düşülmedi (beton ve donatı brüt)`); }
  if (!spec) return { spec: null, mode: 'none', bars, concrete, kg: 0, ratio: 0, warnings };
  if (spec.invalid) return { spec, mode: spec.mode, bars, concrete, kg: 0, ratio: 0, warnings: [`eksik alan: ${spec.invalid.join(', ')} — metraja girmedi`], invalid: true };
  const M = R.min;
  if (el.kind === 'kolon') {
    const c = R.cover.col, long = withLaps(g.H + R.lap * spec.d / 10, spec.d, R);
    add('Boyuna (üst kata filiz dahil)', spec.d, spec.n, long.len);
    const per = g.round ? Math.PI * (g.b - 2 * c) : 2 * (g.b - 2 * c) + 2 * (g.h - 2 * c);
    const lc = +spec.lc > 0 ? +spec.lc : Math.max(g.b, g.h, g.H / 6, 50);
    add(g.round ? 'Fret / çember etriye' : 'Etriye', spec.sd, stirrupCount(g.H, lc, spec.sc, spec.s), per + 2 * R.stirHook * spec.sd / 10);
    const rho = spec.n * barArea(spec.d) / (g.round ? Math.PI * g.b ** 2 / 4 : g.b * g.h);
    if (spec.mode === 'manual') {
      if (rho < M.colRho - 1e-9) warnings.push(`boyuna donatı oranı %${(rho * 100).toFixed(2)} < %${M.colRho * 100} (minimum)`);
      if (rho > M.colRhoMax) warnings.push(`boyuna donatı oranı %${(rho * 100).toFixed(2)} > %${M.colRhoMax * 100} (maksimum)`);
      if (spec.d < M.colMinD) warnings.push(`boyuna çap Ø${spec.d} < Ø${M.colMinD}`);
      if (spec.n < (g.round ? M.colMinNRound : M.colMinN)) warnings.push(`boyuna çubuk sayısı ${spec.n} < ${g.round ? M.colMinNRound : M.colMinN}`);
      if (spec.sd < M.stirMinD) warnings.push(`etriye Ø${spec.sd} < Ø${M.stirMinD}`);
      const bmin = Math.min(g.b, g.h);
      if (spec.sc > Math.min(bmin / 3, M.colConfMax) + 1e-9) warnings.push(`sarılma bölgesi aralığı ${spec.sc} cm > ${fl(Math.min(bmin / 3, M.colConfMax), 0.1)} cm`);
      if (spec.s > Math.min(bmin / 2, M.colMidMax) + 1e-9) warnings.push(`orta bölge aralığı ${spec.s} cm > ${fl(Math.min(bmin / 2, M.colMidMax), 0.1)} cm`);
    }
    if (long.laps) warnings.push(`boyuna çubukta ${long.laps} ek (> ${R.stock / 100} m)`);
  }
  if (el.kind === 'kiris') {
    const c = R.cover.beam;
    for (const [role, n, d] of [['Üst boyuna', spec.nt, spec.dt], ['Alt boyuna', spec.nb, spec.db]]) {
      const l = withLaps(g.L + 2 * R.endHook * d / 10, d, R); add(role, d, n, l.len);
      if (l.laps) warnings.push(`${role.toLowerCase()} çubukta ${l.laps} ek`);
    }
    const lc = +spec.lc > 0 ? +spec.lc : 2 * g.h;
    add('Etriye', spec.sd, stirrupCount(g.L, lc, spec.sc, spec.s), 2 * (g.b - 2 * c) + 2 * (g.h - 2 * c) + 2 * R.stirHook * spec.sd / 10);
    if (spec.mode === 'manual') {
      if (spec.nb < M.beamMinN || spec.db < M.beamMinD) warnings.push(`alt donatı ${spec.nb}Ø${spec.db} < ${M.beamMinN}Ø${M.beamMinD}`);
      if (spec.nt < M.beamMinN || spec.dt < M.beamMinD) warnings.push(`üst donatı ${spec.nt}Ø${spec.dt} < ${M.beamMinN}Ø${M.beamMinD}`);
      const mn = minSpec('kiris', g, R);
      if (spec.nb * barArea(spec.db) < mn.nb * barArea(mn.db) - 1e-9) warnings.push(`alt donatı alanı minimum oranın (${(mn.rhoMin * 100).toFixed(3)}%) altında`);
      if (spec.sd < M.stirMinD) warnings.push(`etriye Ø${spec.sd} < Ø${M.stirMinD}`);
    }
  }
  if (el.kind === 'slab') {
    const c = R.cover.slab, layers = spec.top ? 2 : 1;
    for (const [dir, d, s] of [['x', spec.dx, spec.sx], ['y', spec.dy, spec.sy]]) {
      const segs = scanBars(g.pts, dir, s, c);
      const tot = segs.reduce((S, L) => S + withLaps(L + 2 * R.endHook * d / 10, d, R).len, 0);
      if (segs.length) bars.push({ role: `${dir === 'x' ? 'X' : 'Y'} doğrultusu${layers > 1 ? ' (alt + üst)' : ' (alt)'}`, d: +d, n: segs.length * layers, len: +(tot / segs.length).toFixed(1), m: tot * layers / 100, kg: tot * layers / 100 * kgPerM(d) });
    }
    if (spec.mode === 'manual') {
      const smax = Math.min(1.5 * g.t, M.slabSmax), rho = (barArea(spec.dx) / spec.sx + barArea(spec.dy) / spec.sy) / g.t;
      if (spec.sx > smax + 1e-9 || spec.sy > smax + 1e-9) warnings.push(`aralık > ${fl(smax, 0.1)} cm`);
      if (rho < M.slabRhoTotal - 1e-9) warnings.push(`iki doğrultu toplam oran %${(rho * 100).toFixed(3)} < %${(M.slabRhoTotal * 100).toFixed(2)}`);
    }
    if (spec.mode === 'min') warnings.push('yalnız alt hasır (iki doğrultuda çalışan döşeme minimumu); mesnet üst donatısı statik hesaba bağlı');
  }
  if (el.kind === 'wall') {
    const c = R.cover.wall, vert = withLaps(g.H + R.lap * spec.dv / 10, spec.dv, R), nv = fl((g.L - 2 * c) / spec.sv) + 1, nh = fl((g.H - 2 * c) / spec.sh) + 1;
    add('Düşey (iki yüz, filiz dahil)', spec.dv, 2 * nv, vert.len);
    const hz = withLaps(g.L - 2 * c + 2 * R.endHook * spec.dh / 10, spec.dh, R);
    add('Yatay (iki yüz)', spec.dh, 2 * nh, hz.len);
    if (spec.mode === 'manual') {
      const rv = 2 * barArea(spec.dv) / spec.sv / g.t, rh = 2 * barArea(spec.dh) / spec.sh / g.t;
      if (rv < M.wallRho - 1e-9 || rh < M.wallRho - 1e-9) warnings.push(`gövde oranı (düşey %${(rv * 100).toFixed(3)}, yatay %${(rh * 100).toFixed(3)}) < %${(M.wallRho * 100).toFixed(2)}`);
      if (spec.sv > M.wallSmax || spec.sh > M.wallSmax) warnings.push(`aralık > ${M.wallSmax} cm`);
    }
  }
  const kg = bars.reduce((s, b) => s + b.kg, 0);
  return { spec, mode: spec.mode, bars, concrete, kg, ratio: concrete > 0 ? kg / concrete : 0, warnings };
}

/* ── proje raporu: eleman satırları + çap toplamları; kesin (elle) ve tahmini (minimum) ayrı ── */
export function rebarReport(R, { level = '*' } = {}) {
  const rules = rulesOf(R), rows = [];
  for (const el of concreteElements(R)) {
    if (level !== '*' && el.level !== +level) continue;
    rows.push({ ...el, ...takeoff(el, rules) });
  }
  const byD = new Map();
  const T = { manual: 0, min: 0, concrete: 0, concreteDefined: 0, undefined: 0, invalid: 0, count: rows.length };
  for (const r of rows) {
    T.concrete += r.concrete;
    if (r.mode === 'none') { T.undefined++; continue; }
    if (r.invalid) { T.invalid++; continue; }
    T.concreteDefined += r.concrete; T[r.mode] += r.kg;
    for (const b of r.bars) {
      const x = byD.get(b.d) || byD.set(b.d, { d: b.d, kgPerM: kgPerM(b.d), m: 0, kg: 0, mManual: 0, kgManual: 0, mMin: 0, kgMin: 0 }).get(b.d);
      x.m += b.m; x.kg += b.kg;
      if (r.mode === 'manual') { x.mManual += b.m; x.kgManual += b.kg; } else { x.mMin += b.m; x.kgMin += b.kg; }
    }
  }
  T.total = T.manual + T.min;
  T.ratio = T.concreteDefined > 0 ? T.total / T.concreteDefined : 0;
  return { rules, rows, byDiameter: [...byD.values()].sort((a, b) => a.d - b.d), totals: T };
}

/* CSV (Excel TR: UTF-8 BOM, ';', ondalık virgül) */
export function rebarCsv(rep, title = '') {
  const n = (v, k = 2) => (+v).toFixed(k).replace('.', ',');
  const q = s => { s = String(s ?? ''); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const out = [[title], ['Kat', 'Eleman', 'Tür', 'Kaynak', 'Rol', 'Çap (mm)', 'Adet', 'Boy (m, her biri)', 'Toplam boy (m)', 'Ağırlık (kg)', 'Beton (m³)', 'Not']];
  for (const r of rep.rows) {
    if (!r.bars.length) { out.push([r.levelName, r.name, KIND_T[r.kind], MODES[r.mode], '', '', '', '', '', '', n(r.concrete, 3), r.warnings.join('; ')]); continue; }
    r.bars.forEach((b, i) => out.push([r.levelName, r.name, KIND_T[r.kind], MODES[r.mode], b.role, b.d, b.n, n(b.len / 100), n(b.m), n(b.kg), i ? '' : n(r.concrete, 3), i ? '' : r.warnings.join('; ')]));
  }
  out.push([]); out.push(['ÇAP TOPLAMI', 'Çap (mm)', 'kg/m', 'Toplam boy (m)', 'Toplam (kg)', 'Statik projeden (kg)', 'Minimum tahmini (kg)']);
  for (const x of rep.byDiameter) out.push(['', x.d, n(x.kgPerM, 3), n(x.m), n(x.kg), n(x.kgManual), n(x.kgMin)]);
  const T = rep.totals;
  out.push([]); out.push(['GENEL TOPLAM (kg)', n(T.total), 'Statik projeden', n(T.manual), 'Minimum tahmini', n(T.min), 'Tanımsız eleman', T.undefined]);
  return '﻿' + out.map(r => r.map(q).join(';')).join('\r\n');
}
