/* ═══ BIM çekirdeği — tadilat metraj farkı (B4C) ═══
 * İki çizimin metrajını (quantities.js) B4 karşılaştırmasıyla (diff.js: eşleştirme + safha) birleştirir. SAF.
 * Üç kavram ayrı tutulur:
 *   net fark   = yeni − mevcut (geometrik; eleman adedinden bağımsız → bölünen / birleşen duvarlar kalem toplamında dengelenir)
 *   söküm      = kaldırılacak miktar,  yeni imalat = yapılacak miktar
 * Söküm / imalat KESİN toplamlara yalnız kullanıcı kararıyla girer:
 *   yıkılacak / yeni → safha kararı (meta.revision.phases) onaylı olmalı
 *   değiştirilecek → müdahale yöntemi (meta.revision.methods) seçilmiş olmalı:
 *     replace  tamamen sökülüp yeniden yapılır     → söküm = mevcut, imalat = yeni (tüm kalemler)
 *     partial  kısmi müdahale                       → söküm = max(0, mevcut − yeni), imalat = max(0, yeni − mevcut)
 *     surface  yalnız yüzey / kaplama               → yüzey kalemleri (sıva, kaplama, mahal kaplaması) tam; diğerleri yok
 *     undecided / yok                               → kesin 0; "onay bekleyen" sütununda kısmi senaryo tahmini
 * Onaysız öneriler ayrı "bekleyen" sütunlarında gösterilir — kesin toplamlara karışmaz.
 */
import { compareDrawings } from './diff.js';
import { drawingQuantities, CATS } from './quantities.js';

export const METHODS = Object.freeze({ replace: 'Tamamen sökülüp yeniden yapılacak', partial: 'Kısmi müdahale', surface: 'Yalnız yüzey / kaplama değişecek', undecided: 'Henüz kararlaştırılmadı' });
const SURFACE = new Set(['siva', 'kaplama', 'mahal']);
/* toplanabilir kalem aileleri: yalnız aynı ölçünün farklı malzeme / ölçü sınıfları toplanır (brüt + net gibi alternatif
 * ölçüler ya da zemin + tavan gibi farklı yüzeyler birbirine EKLENMEZ) */
export const FAMILIES = Object.freeze({
  'wall-area': 'net duvar yüzeyi', 'wall-gross': 'brüt duvar yüzeyi', 'wall-len': 'duvar boyu', 'layer-vol': 'katman hacmi', 'layer-area': 'katman yüzeyi',
  door: 'kapı adedi', window: 'pencere adedi', opening: 'boşluk adedi', 'slab-area': 'net döşeme alanı', 'slab-gross': 'brüt döşeme alanı', floor: 'zemin kaplaması',
});
export const familyOf = item => String(item).split(':')[0];
const isSurfaceItem = r => SURFACE.has(r.category);

/* src, dst: çizim kökleri → { lines (eleman × kalem), compare, qa, qb, pending, issues } */
export function quantityDiff(src, dst, { compare = null, revision = dst?.meta?.revision || null, full = false } = {}) {
  const C = compare || compareDrawings(src, dst, { revision }), methods = revision?.methods || {};
  const qa = drawingQuantities(src, { full, policy: revision?.qty || null }), qb = drawingQuantities(dst, { full, policy: revision?.qty || null });
  const byEl = rows => { const m = new Map(); for (const r of rows) (m.get(r.element) || m.set(r.element, []).get(r.element)).push(r); return m; };
  const A = byEl(qa.rows), B = byEl(qb.rows), lines = [], issues = [...qa.issues.map(i => ({ ...i, side: 'kaynak' })), ...qb.issues.map(i => ({ ...i, side: 'hedef' }))];
  const seenA = new Set(), seenB = new Set();
  // karşılaştırma dışı ama iki tarafta aynı anahtarlı türetilmiş satırlar (kat döşemesi): miktar farkına göre korunur / değişir
  const pseudo = [...A.keys()].filter(k => k.includes('/#') && B.has(k)).map(k => {
    const [level, id] = k.split('/'), sa = A.get(k).reduce((s, r) => s + (r.qty || 0), 0), sb = B.get(k).reduce((s, r) => s + (r.qty || 0), 0), same = Math.abs(sa - sb) < 1e-9;
    return { key: k, level, srcId: id, dstId: id, kind: A.get(k)[0].cls, status: same ? 'unchanged' : 'geometry', phase: same ? 'existing' : 'modify', decision: null };
  });
  for (const e of [...C.entries, ...pseudo]) {
    const ka = e.srcId ? `${e.level}/${e.srcId}` : null, kb = e.dstId ? `${e.level}/${e.dstId}` : null;
    const ra = (ka && A.get(ka)) || [], rb = (kb && B.get(kb)) || [];
    if (ka) seenA.add(ka); if (kb) seenB.add(kb);
    if (!ra.length && !rb.length) continue;
    const method = e.phase === 'modify' ? (methods[e.key] || null) : null;
    const items = new Map();
    for (const [side, rows] of [['a', ra], ['b', rb]]) for (const r of rows) {
      const x = items.get(r.item) || items.set(r.item, { item: r.item, label: r.label, unit: r.unit, category: r.category, material: r.material, a: 0, b: 0, unknown: false, warn: [], rooms: new Set(), surface: isSurfaceItem(r) }).get(r.item);
      if (r.qty === null) x.unknown = true; else x[side] += r.qty;
      if (r.status !== 'ok' && r.note) x.warn.push(r.note);
      r.rooms.forEach(id => x.rooms.add(id));
    }
    for (const x of items.values()) {
      const net = x.b - x.a, dec = calc(e, method, x);
      lines.push({
        key: e.key, level: e.level, srcId: e.srcId, dstId: e.dstId, cls: e.kind, type: (rb[0] || ra[0])?.type ?? null, status: e.status,
        phase: e.phase, phaseConfirmed: !!e.decision, method, rooms: [...x.rooms].sort(),
        item: x.item, label: x.label, unit: x.unit, category: x.category, material: x.material,
        before: x.unknown ? null : x.a, after: x.unknown ? null : x.b, net: x.unknown ? null : net,
        demolish: x.unknown ? null : dec.demolish, build: x.unknown ? null : dec.build, demolishPending: x.unknown ? null : dec.dp, buildPending: x.unknown ? null : dec.bp,
        basis: dec.basis, validation: x.unknown ? 'unknown' : x.warn.length ? 'warning' : dec.pending ? 'pending' : 'ok', note: [...new Set(x.warn)].join(' · '),
      });
    }
  }
  // karşılaştırmada yer almayan metraj satırları (ör. kat döşemesi, kimliksiz) — yine eşleştirilir
  const extra = (M, seen, side) => { for (const [k, rows] of M) if (!seen.has(k)) issues.push({ code: 'QTY_UNMATCHED', side, element: k, msg: `${k}: karşılaştırmada eşleşmedi (${rows.length} satır) — yalnız ${side === 'kaynak' ? 'mevcut' : 'yeni'} toplamına girer` }); };
  extra(A, seenA, 'kaynak'); extra(B, seenB, 'hedef');
  for (const [k, rows] of A) if (!seenA.has(k)) rows.forEach(r => lines.push(orphan(r, 'a')));
  for (const [k, rows] of B) if (!seenB.has(k)) rows.forEach(r => lines.push(orphan(r, 'b')));
  lines.sort((p, q) => p.level.localeCompare(q.level) || p.key.localeCompare(q.key) || p.item.localeCompare(q.item));
  const pending = [...C.entries, ...pseudo].filter(e => (e.phase === 'modify' && !methods[e.key]) || ((e.phase === 'demolish' || e.phase === 'new') && !e.decision) || e.status === 'uncertain').map(e => ({ key: e.key, phase: e.phase, status: e.status, reason: e.status === 'uncertain' ? 'güvenle eşleştirilemedi' : e.phase === 'modify' ? 'müdahale yöntemi seçilmedi' : 'safha onaylanmadı' }));
  return { lines, compare: C, qa, qb, pending, issues };
}
function orphan(r, side) {
  const v = r.qty;
  return { key: r.element, level: r.level, srcId: side === 'a' ? r.element.split('/')[1] : null, dstId: side === 'b' ? r.element.split('/')[1] : null, cls: r.cls, type: r.type, status: side === 'a' ? 'removed' : 'added', phase: null, phaseConfirmed: false, method: null, rooms: r.rooms,
    item: r.item, label: r.label, unit: r.unit, category: r.category, material: r.material, before: side === 'a' ? v : 0, after: side === 'b' ? v : 0, net: v === null ? null : side === 'b' ? v : -v,
    demolish: 0, build: 0, demolishPending: 0, buildPending: 0, basis: 'eşleşmeyen satır (yalnız toplamda)', validation: v === null ? 'unknown' : 'pending', note: 'Karşılaştırma eşleştirmesi yok' };
}
/* karar → söküm / imalat (kesin) ve bekleyen (onaysız senaryo) */
function calc(e, method, x) {
  const a = x.a, b = x.b, part = { demolish: Math.max(0, a - b), build: Math.max(0, b - a) };
  const Z = { demolish: 0, build: 0, dp: 0, bp: 0, pending: false, basis: '' };
  switch (e.phase) {
    case 'existing': return { ...Z, basis: 'korunur' };
    case 'demolish': return e.decision ? { ...Z, demolish: a, basis: 'yıkım (onaylı)' } : { ...Z, dp: a, pending: true, basis: 'yıkım önerisi (onay bekliyor)' };
    case 'new': return e.decision ? { ...Z, build: b, basis: 'yeni imalat (onaylı)' } : { ...Z, bp: b, pending: true, basis: 'yeni eleman (safha onayı bekliyor)' };
    case 'modify':
      if (method === 'replace') return { ...Z, demolish: a, build: b, basis: METHODS.replace };
      if (method === 'partial') return { ...Z, ...part, basis: METHODS.partial };
      if (method === 'surface') return x.surface ? { ...Z, demolish: a, build: b, basis: METHODS.surface } : { ...Z, basis: `${METHODS.surface} — yapı katmanına dokunulmaz` };
      return { ...Z, dp: part.demolish, bp: part.build, pending: true, basis: 'müdahale yöntemi seçilmedi — kısmi senaryo tahmini' };
    default: return { ...Z, pending: true, basis: 'eşleştirilemedi — manuel kontrol' };
  }
}

/* ── tablo: filtre + gruplama + toplam (tam hassasiyet; gösterimde yuvarla) ── */
export function aggregate(lines, { level = '*', room = '*', material = '*', cls = '*', phase = '*', category = '*', groupBy = 'category' } = {}) {
  const ok = l => (level === '*' || l.level === level) && (room === '*' || l.rooms.includes(room)) && (material === '*' || l.material === material) && (cls === '*' || l.cls === cls) && (phase === '*' || l.phase === phase) && (category === '*' || l.category === category);
  const rows = new Map();
  for (const l of lines.filter(ok)) {
    const k = `${l.item}|${l.unit}`;
    const x = rows.get(k) || rows.set(k, { item: l.item, label: l.label, unit: l.unit, category: l.category, material: l.material, before: 0, after: 0, net: 0, demolish: 0, build: 0, demolishPending: 0, buildPending: 0, unknown: 0, warning: 0, pending: 0, keys: new Set() }).get(k);
    if (l.before === null) { x.unknown++; } else for (const f of ['before', 'after', 'net', 'demolish', 'build', 'demolishPending', 'buildPending']) x[f] += l[f];
    if (l.validation === 'warning') x.warning++; if (l.validation === 'pending') x.pending++;
    x.keys.add(l.key);
  }
  const list = [...rows.values()].map(x => ({ ...x, keys: [...x.keys].sort() })).sort((a, b) => (CATS[a.category] || a.category).localeCompare(CATS[b.category] || b.category, 'tr') || a.label.localeCompare(b.label, 'tr') || a.unit.localeCompare(b.unit));
  const groups = new Map();
  for (const r of list) { const g = groupBy === 'category' ? r.category : groupBy === 'material' ? (r.material || '-') : '*'; (groups.get(g) || groups.set(g, []).get(g)).push(r); }
  const sum = rs => rs.reduce((s, r) => ({ before: s.before + r.before, after: s.after + r.after, net: s.net + r.net, demolish: s.demolish + r.demolish, build: s.build + r.build }), { before: 0, after: 0, net: 0, demolish: 0, build: 0 });
  const totalsOf = rs => { const fam = new Map(); for (const r of rs) { const f = familyOf(r.item); if (!FAMILIES[f]) continue; const k = `${f}|${r.unit}`; (fam.get(k) || fam.set(k, []).get(k)).push(r); } return [...fam].filter(([, x]) => x.length > 1).map(([k, x]) => ({ family: k.split('|')[0], label: FAMILIES[k.split('|')[0]], unit: x[0].unit, ...sum(x) })); };
  return { rows: list, groups: [...groups].map(([g, rs]) => ({ group: g, title: CATS[g] || g, rows: rs, totals: totalsOf(rs) })) };
}

/* ── fiyat: kullanıcı girer; girilmemişse tutar "fiyat yok" (0 değil) ── */
export function costOf(row, prices = {}) {
  const pb = prices[`${row.item}|build`], pd = prices[`${row.item}|demolish`];
  const parts = [];
  if (row.build > 0) parts.push(Number.isFinite(pb) ? row.build * pb : null);
  if (row.demolish > 0) parts.push(Number.isFinite(pd) ? row.demolish * pd : null);
  if (!parts.length) return { amount: 0, missing: false };
  if (parts.some(v => v === null)) return { amount: parts.filter(v => v !== null).reduce((s, v) => s + v, 0), missing: true };
  return { amount: parts.reduce((s, v) => s + v, 0), missing: false };
}

/* ── CSV (Excel TR: UTF-8 BOM, ';', ondalık virgül, birimler, grup ve toplam satırları) ── */
export function qtyCsv(agg, { prices = {}, currency = 'TRY', vat = 'excl', title = '' } = {}) {
  const n = v => v === null || v === undefined ? '' : (+v).toFixed(3).replace('.', ',');
  const q = s => { s = String(s ?? ''); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const out = [[title], ['Kategori', 'İmalat', 'Birim', 'Mevcut', 'Yeni', 'Net fark', 'Söküm (kesin)', 'Yeni imalat (kesin)', 'Söküm (onay bekleyen)', 'Yeni imalat (onay bekleyen)', `İmalat birim fiyatı (${currency})`, `Söküm birim fiyatı (${currency})`, `Tutar (${currency}, KDV ${vat === 'incl' ? 'dahil' : 'hariç'})`, 'Not']];
  let grand = 0, grandMissing = false;
  for (const g of agg.groups) {
    let gs = 0, gm = false;
    for (const r of g.rows) {
      const c = costOf(r, prices); gs += c.amount; gm ||= c.missing;
      out.push([g.title, r.label, r.unit, n(r.before), n(r.after), (r.net > 0 ? '+' : '') + n(r.net), n(r.demolish), n(r.build), n(r.demolishPending), n(r.buildPending), n(prices[`${r.item}|build`]), n(prices[`${r.item}|demolish`]), !(r.build > 0 || r.demolish > 0) ? '' : c.missing ? 'fiyat girilmedi' : n(c.amount), [r.unknown ? `${r.unknown} eleman hesaplanamadı` : '', r.warning ? `${r.warning} uyarı` : '', r.pending ? `${r.pending} onay bekliyor` : ''].filter(Boolean).join('; ')]);
    }
    for (const t of g.totals) out.push([`${g.title} TOPLAM`, `Toplam ${t.label}`, t.unit, n(t.before), n(t.after), (t.net > 0 ? '+' : '') + n(t.net), n(t.demolish), n(t.build), '', '', '', '', '', '']);
    if (g.rows.some(r => r.build > 0 || r.demolish > 0)) out.push([`${g.title} TUTAR`, '', '', '', '', '', '', '', '', '', '', '', gm ? `${n(gs)} (eksik fiyat var)` : n(gs), '']);
    grand += gs; grandMissing ||= gm;
  }
  out.push(['GENEL TOPLAM TUTAR', '', '', '', '', '', '', '', '', '', '', '', grandMissing ? `${n(grand)} (eksik fiyat var)` : n(grand), '']);
  out.push([]); out.push(['Not: miktarlar BIM modelinden hesaplanmıştır; fiyatlar kullanıcı girişidir. Kesin söküm / imalat yalnız onaylı safha ve müdahale kararlarını içerir.']);
  return '﻿' + out.map(r => r.map(q).join(';')).join('\r\n') + '\r\n';
}
