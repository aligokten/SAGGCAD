/* ═══ BIM çekirdeği — tek çizimin imalat metrajı (B4C) ═══
 * SAF ve BELİRLENİMCİ: kökü değiştirmez; sonuç kalıcı ikinci bir model değildir. Tam hassasiyetle hesaplanır, yuvarlama
 * yalnız gösterimde yapılır. Kaynaklar yeniden yazılmadı:
 *   duvar → wallgeom.levelWallGeometry (B2B birleşim temizliği: çift hacim yok) + wallPrisms (açıklıklar düşülmüş prizmalar)
 *          + wallZones (açıklık bölgeleri); hacim çapraz denetimi wallQuantities ile aynı prizmalardan,
 *   mahal → plan-geom polyArea / polyPerim (roomMetrics ile aynı yakınlık kuralı), döşeme → kompozit kalınlıkları.
 * Satır: { item, unit, qty, category, material, level, element (KAT/kimlik), cls, type, rooms, method, status, note }
 *   status: ok | warning | unknown (unknown → qty null: "hesaplanamadı / manuel kontrol gerekli", ASLA 0 değil)
 * Artımlı: duvar sonucu prizma dizisi kimliği + kayıt imzasıyla önbelleklenir (B3); tam yol `{ full: true }`.
 */
import { levelWallGeometry, wallPrisms, wallZones, wallQuantities } from './wallgeom.js';
import { absArea } from './geom2d.js';
import { compOf, compThickness, matOf, slabKind, SLAB_KINDS, materialsOf, MATERIALS } from '../materials.js';
const knownMat = (R, k) => materialsOf(R).some(m => m.k === k) || MATERIALS.some(m => m.k === k);   // matOf tanımsızda yer tutucu döndürür
import { planLevels, polyArea, polyPerim, wallLen, wallDir, projSeg, V, pointInPoly } from '../plan-geom.js';
import { stairOutline } from '../stairs.js';
import { outlineOf } from '../roof.js';

export const CATS = Object.freeze({
  'beton': 'Betonarme', 'kagir': 'Tuğla / gazbeton / kâgir', 'isi': 'Isı yalıtımı', 'ses': 'Ses yalıtımı', 'su': 'Su / buhar yalıtımı',
  'siva': 'Sıva', 'kaplama': 'Kaplama / levha', 'diger': 'Diğer malzeme', 'duvar': 'Duvar', 'doseme': 'Döşeme', 'mahal': 'Mahal kaplaması', 'dograma': 'Kapı / pencere',
});
export const OPENING_POLICIES = Object.freeze({ all: 'Tüm açıklıklar düşülür', over: 'Eşikten büyük açıklıklar düşülür', none: 'Açıklık düşülmez' });
export const DEFAULT_POLICY = Object.freeze({ openings: 'all', threshold: 0.5 /* m² */ });
export const QTY_STATS = { walls: 0, reused: 0 };
const ACOUSTIC = new Set(['camyunu', 'tasyunu']);

/* malzeme → imalat kategorisi (katmanın kompozitteki rolüne göre yalıtım ısı / ses ayrımı) */
export function matCategory(R, k, comp = null) {
  const m = k && knownMat(R, k) ? matOf(R, k) : null; if (!m || m.generic) return 'diger';
  if (k === 'betonarme' || m.g === 'tasiyici') return 'beton';
  if (m.g === 'kagir' || m.g === 'dolgu') return 'kagir';
  if (m.g === 'yalitim') return ACOUSTIC.has(k) && comp && String(comp.use || '').includes('int') ? 'ses' : 'isi';
  if (m.g === 'su') return 'su';
  if (m.g === 'siva') return 'siva';
  if (m.g === 'kaplama' || m.g === 'levha') return 'kaplama';
  return 'diger';
}
const matName = (R, k) => (k ? matOf(R, k)?.t || k : 'Genel (malzemesiz)');
const short = t => String(t).split(' (')[0].split(' — ')[0];
const levelsOf = R => planLevels(R).map(l => ({ ...l, id: l.idx === 0 ? 'L0' : l.plan.id, meta: { ...R.meta, ...(l.plan.meta || {}) } }));

/* ── duvar ── */
const WALL_MEMO = new WeakMap();
function wallSig(P, w, meta, policyKey) { return JSON.stringify([w, (P.openings || []).filter(o => o.wallId === w.id), meta.wallH, meta.wallT, policyKey]); }
function wallQty(R, P, meta, S, prisms, w, geoIssues) {
  if (S.legacy) return { status: 'unknown', note: w.arc ? 'Yay duvar (ARC_LEGACY): güvenilir katman geometrisi yok — hesaplanamadı, manuel kontrol gerekli' : 'Eski geometri — hesaplanamadı, manuel kontrol gerekli' };
  const { zones, H, B } = wallZones(P, w, meta), L = wallLen(w), h = H - B;
  if (!(L > 0) || !(h > 0)) return { status: 'unknown', note: 'Sıfır uzunluk ya da yükseklik — hesaplanamadı' };
  const clip = z => Math.max(0, Math.min(L, z.s1) - Math.max(0, z.s0));
  const net = zones.reduce((s, z) => s + clip(z) * (z.z1 - z.z0), 0) / 1e4, gross = L * h / 1e4;
  // açıklık alanı: duvar gövdesi içinde kalan kısım (eşik / lento duvar yüksekliği ile sınırlı)
  const ops = (P.openings || []).filter(o => o.wallId === w.id), openArea = gross - net;
  // hacim: B2B prizmaları (birleşim temizliği sonrası, açıklıklar düşülmüş)
  const byMat = new Map();
  let volume = 0;
  for (const pr of prisms || []) { const v = absArea(pr.poly) * (pr.z1 - pr.z0) / 1e6; volume += v; const k = pr.mat || ''; byMat.set(k, (byMat.get(k) || 0) + v); }
  // brüt hacim (açıklıksız) ve analitik açıklık boşluğu → bağımsız denetim
  const foot = S.layers.reduce((s, l) => s + l.pieces.reduce((q, p) => q + absArea(p), 0), 0) / 1e4;
  const T = S.layers.reduce((s, l) => s + (l.hi - l.lo), 0) / 100 || (+w.t || meta.wallT || 15) / 100;
  const voidAnalytic = ops.reduce((s, o) => { const z = zones.filter(x => x.op === o); const hole = o.w / 100 * ((H - B) / 100) - z.reduce((q, x) => q + (x.s1 - x.s0) * (x.z1 - x.z0), 0) / 1e4; return s + Math.max(0, hole) * T; }, 0);
  const grossVol = foot * h / 100, dev = Math.abs(grossVol - volume - voidAnalytic);
  const notes = [], comp = w.comp ? compOf(R, w.comp) : null;
  let status = 'ok';
  if (w.comp && !comp) { status = 'warning'; notes.push(`Kompozit bulunamadı (${w.comp}) — genel malzeme`); }
  for (const [k] of byMat) if (k && !knownMat(R, k)) { status = 'warning'; notes.push(`Malzeme tanımsız: ${k} — kategorisi "Diğer", kontrol edin`); }
  if (byMat.has('') && !w.comp) notes.push('Malzemesiz duvar: katman metrajı "Genel"');
  const overlapped = geoIssues.some(i => i.code === 'GEOM_OVERLAP_RESOLVED' && (i.ids || []).includes(w.id));
  if (overlapped) { status = 'warning'; notes.push('Çakışan duvar: üst üste binen hacim ayrıştırıldı (çift sayım yok); duvar hacmi komşusuyla paylaşıldı'); }
  else if (dev > Math.max(0.005 * grossVol, 1e-6)) { status = 'warning'; notes.push(`Hacim denetimi: brüt − açıklık − net = ${dev.toFixed(4)} m³ (açıklık birleşim bölgesine taşıyor olabilir)`); }
  // katmanlar: hacim (m³) ve yüz katmanlarında alan (m²): eksenin + tarafı yüz A, − tarafı yüz B
  const layers = S.layers.map(l => ({ mat: l.mat || '', cat: matCategory(R, l.mat, comp), face: l.lo >= -1e-9 ? 'A' : l.hi <= 1e-9 ? 'B' : 'core', thick: (l.hi - l.lo) / 100, core: l.core }));
  const mats = [...new Set(layers.map(l => l.mat))].map(k => ({ mat: k, cat: matCategory(R, k, comp), volume: byMat.get(k) || 0, area: layers.some(l => l.mat === k && l.face !== 'core' && (matCategory(R, k, comp) === 'siva' || matCategory(R, k, comp) === 'kaplama')) ? net * layers.filter(l => l.mat === k && l.face !== 'core').length : null }));
  const core = layers.find(l => l.core) || layers.slice().sort((a, b) => b.thick - a.thick)[0];
  return { status, note: notes.join(' · '), L: L / 100, T, H: h / 100, gross, net, openArea, volume, grossVol, coreMat: core?.mat || '', mats, openings: ops.length };
}

/* ── tek çizimin metrajı ── */
export function drawingQuantities(R, { full = false, policy = R?.meta?.revision?.qty || null } = {}) {
  const pol = { ...DEFAULT_POLICY, ...(policy || {}) }, polKey = `${pol.openings}|${pol.threshold}`;
  const rows = [], elements = [], issues = [];
  const row = (o) => rows.push({ rooms: [], method: '', status: 'ok', note: '', type: null, ...o });
  for (const lv of levelsOf(R)) {
    if (lv.kind === 'roof') continue;
    const P = lv.plan, meta = lv.meta, lid = lv.id;
    if (!P || !Array.isArray(P.walls)) continue;
    // duvarlar
    let geo = null, byWall = new Map();
    try { const wp = wallPrisms(R, full ? JSON.parse(JSON.stringify(P)) : P, meta); geo = wp.geo; byWall = wp.byWall; } catch (e) { issues.push({ level: lid, code: 'QTY_GEOMETRY', msg: `Duvar geometrisi hesaplanamadı: ${e.message}` }); }
    const roomOfWall = new Map();
    for (const r of P.rooms || []) for (const wid of r.walls || []) if (wid) (roomOfWall.get(wid) || roomOfWall.set(wid, []).get(wid)).push(r.id);
    for (const w of P.walls) {
      if (!w || typeof w.id !== 'string') continue;
      const S = geo?.walls.get(w.id), key = `${lid}/${w.id}`, prisms = byWall.get(w.id);
      let q;
      if (!S) q = { status: 'unknown', note: 'Geometri bulunamadı — hesaplanamadı' };
      else {
        const sig = wallSig(P, w, meta, polKey), c = !full && prisms && WALL_MEMO.get(prisms);
        if (c && c.sig === sig && c.S === S) { q = c.q; QTY_STATS.reused++; }
        else { q = wallQty(R, P, meta, S, prisms, w, geo?.issues || []); QTY_STATS.walls++; if (prisms) WALL_MEMO.set(prisms, { sig, S, q }); }
      }
      const comp = w.comp ? compOf(R, w.comp) : null, base = { level: lid, element: key, cls: 'wall', type: w.bimType || null, rooms: roomOfWall.get(w.id) || [], status: q.status, note: q.note };
      elements.push({ ...base, id: w.id, comp: w.comp || null, compName: comp?.t || null, q });
      if (q.status === 'unknown') { row({ ...base, item: 'wall-unknown', label: 'Duvar — metraj hesaplanamadı', unit: 'adet', qty: null, category: 'duvar', material: null, method: 'manuel kontrol' }); continue; }
      const coreName = short(matName(R, q.coreMat));
      row({ ...base, item: `wall-area:${q.coreMat}`, label: `${coreName} duvar (net yüzey)`, unit: 'm²', qty: q.net, category: 'duvar', material: q.coreMat, method: 'eksen boyu × yükseklik − açıklıklar (tek yüz)' });
      row({ ...base, item: `wall-gross:${q.coreMat}`, label: `${coreName} duvar (brüt yüzey)`, unit: 'm²', qty: q.gross, category: 'duvar', material: q.coreMat, method: 'eksen boyu × yükseklik' });
      row({ ...base, item: `wall-len:${q.coreMat}`, label: `${coreName} duvar boyu`, unit: 'm', qty: q.L, category: 'duvar', material: q.coreMat, method: 'eksen boyu' });
      row({ ...base, item: 'wall-volume', label: 'Duvar hacmi (net, tüm katmanlar)', unit: 'm³', qty: q.volume, category: 'duvar', material: null, method: 'B2B katman prizmaları (birleşim temizliği, açıklıklar düşülmüş)' });
      for (const m of q.mats) {
        row({ ...base, item: `layer-vol:${m.mat}`, label: `${short(matName(R, m.mat))} — katman hacmi`, unit: 'm³', qty: m.volume, category: m.cat, material: m.mat, method: 'katman prizmaları' });
        if (m.area !== null) row({ ...base, item: `layer-area:${m.mat}`, label: `${short(matName(R, m.mat))} — yüzey`, unit: 'm²', qty: m.area, category: m.cat, material: m.mat, method: 'net duvar yüzeyi × kat sayısı (yüz)' });
      }
    }
    // açıklıklar (doğrama)
    for (const o of P.openings || []) {
      if (!o || typeof o.id !== 'string') continue;
      const w = P.walls.find(x => x.id === o.wallId), kind = o.type === 'window' ? 'window' : o.type === 'door' ? 'door' : 'opening';
      const T = { door: 'Kapı', window: 'Pencere', opening: 'Boşluk' }[kind], size = `${+(+o.w).toFixed(1)}×${+(+o.h).toFixed(1)}`;
      const base = { level: lid, element: `${lid}/${o.id}`, cls: kind, type: o.model || o.bimType || null, rooms: [], status: w ? 'ok' : 'warning', note: w ? '' : `Bağlı duvar yok (${o.wallId})`, host: o.wallId, size, width: +o.w, height: +o.h };
      elements.push({ ...base, id: o.id, q: { w: +o.w, h: +o.h, area: o.w * o.h / 1e4 } });
      row({ ...base, item: `${kind}:${size}`, label: `${T} ${size} cm`, unit: 'adet', qty: 1, category: 'dograma', material: null, method: 'adet' });
      row({ ...base, item: `${kind}-area`, label: `${T} alanı`, unit: 'm²', qty: o.w * o.h / 1e4, category: 'dograma', material: null, method: 'genişlik × yükseklik' });
    }
    // döşemeler (eleman) ve kat döşemesi
    const belowStairs = lv.idx > 0 ? (planLevels(R)[lv.idx - 1]?.plan?.stairs || []).filter(s => s.void !== false).map(stairOutline).filter(Boolean) : [];
    const slabRows = (pts, t, comp, kindK, key, id, label) => {
      const gross = Math.abs(polyArea(pts)) / 1e4; let net = gross, status = 'ok', note = '';
      for (const v of belowStairs) {
        const inside = v.every(q => pointInPoly(q, pts)), touch = v.some(q => pointInPoly(q, pts));
        if (inside) net -= Math.abs(polyArea(v)) / 1e4; else if (touch) { status = 'warning'; note = 'Merdiven boşluğu döşeme sınırını kesiyor — net alan kesin değil'; }
      }
      if (comp && Math.abs(compThickness(comp) - t) > 0.01) { status = 'warning'; note = [note, `Döşeme kalınlığı ${t} cm, kompozit ${compThickness(comp)} cm — katman hacimleri kompozitten, döşeme hacmi kalınlıktan; kontrol edin`].filter(Boolean).join(' · '); }
      const base = { level: lid, element: key, cls: 'slab', type: kindK, rooms: [], status, note };
      elements.push({ ...base, id, q: { gross, net, t } });
      const kk = kindK === 'kat' ? label : slabKind({ kind: kindK })?.t || label;
      row({ ...base, item: `slab-area:${kindK}`, label: `${short(kk)} (net alan)`, unit: 'm²', qty: net, category: 'doseme', material: null, method: 'çokgen alanı − tam içerdeki merdiven boşlukları' });
      row({ ...base, item: `slab-gross:${kindK}`, label: `${short(kk)} (brüt alan)`, unit: 'm²', qty: gross, category: 'doseme', material: null, method: 'çokgen alanı' });
      row({ ...base, item: 'slab-volume', label: 'Döşeme hacmi', unit: 'm³', qty: net * t / 100, category: 'doseme', material: null, method: 'net alan × kalınlık' });
      if (comp) for (const [mk, d] of comp.layers || []) row({ ...base, item: `layer-vol:${mk}`, label: `${short(matName(R, mk))} — katman hacmi`, unit: 'm³', qty: net * d / 100, category: matCategory(R, mk, comp), material: mk, method: 'net alan × katman kalınlığı' });
    };
    for (const s of P.slabs || []) {
      if (!s || !Array.isArray(s.pts) || s.pts.length < 3) { if (s?.id) issues.push({ level: lid, code: 'QTY_SLAB', id: s.id, msg: 'Döşeme çokgeni geçersiz — hesaplanamadı' }); continue; }
      const comp = compOf(R, s.comp), t = comp ? compThickness(comp) : (+s.t || 15);
      slabRows(s.pts, t, comp, s.kind || 'ara', `${lid}/${s.id}`, s.id, 'Döşeme');
    }
    if (lv.idx > 0 && lv.slab > 0) {
      const pts = outlineOf({ ...P, meta });
      if (pts) slabRows(pts, lv.slab, compOf(R, P.slabComp), 'kat', `${lid}/#kat-dosemesi`, '#kat-dosemesi', 'Kat döşemesi');
    }
    // mahaller
    for (const r of P.rooms || []) {
      if (!r || typeof r.id !== 'string') continue;
      if (!Array.isArray(r.pts) || r.pts.length < 3) { issues.push({ level: lid, code: 'QTY_ROOM', id: r.id, msg: `Mahal ${r.name || r.id}: sınır geçersiz — hesaplanamadı` }); continue; }
      const area = Math.abs(polyArea(r.pts)) / 1e4, perim = polyPerim(r.pts) / 100, h = (+r.h || +meta.wallH || 280) / 100;
      let openA = 0, doorW = 0, deducted = 0, kept = 0;
      for (const o of P.openings || []) {
        const w = P.walls.find(x => x.id === o.wallId); if (!w) continue;
        const c = V.add(w.a, V.mul(wallDir(w), o.pos));
        let near = false;
        for (let i = 0; i < r.pts.length && !near; i++) near = projSeg(c, r.pts[i], r.pts[(i + 1) % r.pts.length]).d <= (w.t || meta.wallT || 15) * 0.75 + 2;   // roomMetrics ile aynı kural
        if (!near) continue;
        const a = (o.w / 100) * Math.min(h, (o.h || 0) / 100);
        if (pol.openings === 'all' || (pol.openings === 'over' && a > pol.threshold)) { openA += a; deducted++; } else kept++;
        if (o.type !== 'window') doorW += o.w / 100;
      }
      const base = { level: lid, element: `${lid}/${r.id}`, cls: 'room', type: r.floor || null, rooms: [r.id], status: 'ok', note: kept ? `${kept} açıklık politikaya göre düşülmedi` : '' };
      elements.push({ ...base, id: r.id, name: r.name || '', q: { area, perim, h, wall: Math.max(0, perim * h - openA), skirting: Math.max(0, perim - doorW) } });
      const nm = r.name ? ` — ${r.name}` : '';
      row({ ...base, item: 'room-area', label: 'Net zemin alanı', unit: 'm²', qty: area, category: 'mahal', material: null, method: 'mahal çokgeni' });
      row({ ...base, item: `floor:${r.floor || '-'}`, label: `Zemin kaplaması (${r.floor || 'belirtilmemiş'})`, unit: 'm²', qty: area, category: 'mahal', material: r.floor || null, method: 'net zemin alanı' });
      row({ ...base, item: 'ceiling', label: 'Tavan kaplaması', unit: 'm²', qty: area, category: 'mahal', material: null, method: 'net zemin alanı (düz tavan)' });
      row({ ...base, item: 'wall-finish', label: 'Duvar kaplaması (mahal içi)', unit: 'm²', qty: Math.max(0, perim * h - openA), category: 'mahal', material: null, method: `çevre × mahal yüksekliği − açıklıklar (${OPENING_POLICIES[pol.openings]}${pol.openings === 'over' ? ` > ${pol.threshold} m²` : ''}; ${deducted} düşüldü)` });
      row({ ...base, item: 'skirting', label: 'Süpürgelik', unit: 'm', qty: Math.max(0, perim - doorW), category: 'mahal', material: null, method: 'çevre − kapı genişlikleri' });
      row({ ...base, item: 'room-perim', label: 'Mahal çevresi', unit: 'm', qty: perim, category: 'mahal', material: null, method: 'çokgen çevresi' });
      void nm;
    }
    // çapraz denetim: duvar hacmi toplamı = wallQuantities (aynı prizmalar)
    try {
      const wq = wallQuantities(R, P, meta), mine = elements.filter(e => e.level === lid && e.cls === 'wall' && e.q.status !== 'unknown').reduce((s, e) => s + e.q.volume, 0);
      if (Math.abs(wq.total - mine) > 1e-6) issues.push({ level: lid, code: 'QTY_RECONCILE', msg: `Duvar hacmi uzlaşmadı: ${mine} ≠ ${wq.total}` });
    } catch { /* geometri hatası yukarıda raporlandı */ }
  }
  return { rows, elements, issues, policy: pol, totals: totalsOf(rows) };
}

/* toplamlar: kat başına ve proje (kalem anahtarıyla); tam hassasiyet, proje = katların toplamı (aynı sırada) */
export function totalsOf(rows, keyOf = r => r.item) {
  const lv = new Map();
  for (const r of rows) {
    const T = lv.get(r.level) || lv.set(r.level, new Map()).get(r.level), k = keyOf(r);
    const x = T.get(k) || T.set(k, { item: k, label: r.label, unit: r.unit, category: r.category, material: r.material, qty: 0, unknown: 0, warning: 0, n: 0 }).get(k);
    if (r.qty === null) x.unknown++; else x.qty += r.qty;
    if (r.status === 'warning') x.warning++;
    x.n++;
  }
  const levels = Object.fromEntries([...lv].map(([l, T]) => [l, [...T.values()].sort((a, b) => a.item.localeCompare(b.item))]));
  const proj = new Map();
  for (const l of Object.keys(levels)) for (const x of levels[l]) { const y = proj.get(x.item) || proj.set(x.item, { ...x, qty: 0, unknown: 0, warning: 0, n: 0 }).get(x.item); y.qty += x.qty; y.unknown += x.unknown; y.warning += x.warning; y.n += x.n; }
  return { levels, project: [...proj.values()].sort((a, b) => a.item.localeCompare(b.item)) };
}
export { SLAB_KINDS };
