/* ═══ BIM çekirdeği — eleman tür sistemi (B1, B2A) ═══
 * Archicad "favori" / Revit "Family Type" karşılığı: tür, bir sınıftaki elemanların ortak parametre takımıdır.
 * Aynı türden istenen sayıda eleman olabilir. Tür parametreleri ile eleman (instance) parametreleri ayrı tutulur;
 * resolveParameters() ikisini birleştirir ve her değerin kaynağını (tür / eleman / kat / türetilmiş) bildirir.
 *
 * Yerleşik türler koddadır ve değişmez. Projeye özel türler kök planın meta.bimTypes dizisinde saklanır
 * (kompozit kütüphanesiyle aynı yerde — proje dosyasıyla birlikte kaydedilir / taşınır). Özel tür, yerleşik türün
 * kimliğini kullanamaz; bir yerleşik türden türetilirse `base` alanında onu belirtir.
 * Kompozit ve malzemeler materials.js'ten okunur, burada yeniden tanımlanmaz.
 * B2A: özel tür başka bir özel türden de türetilebilir (`base` doğrudan kaynak türü gösterir; parametreler
 * türetme anında kopyalanır, temel tür sonradan değişince alt tür kendiliğinden değişmez).
 * Türler ve tür ataması yalnızca commands.js üzerinden (geri alınabilir işlem olarak) yazılır.
 */
import { WALL_KINDS, SLAB_KINDS, COLUMN_MATS, compOf, compThickness, matOf } from '../materials.js';
import { CLASSES, getAt } from './schema.js';
import { FIELDS, TYPE_KEYS, checkValue } from './fields.js';

const T = (id, cls, name, params, extra = {}) => Object.freeze({ id, cls, name, params: Object.freeze({ ...params }), builtin: true, rev: 1, ...extra });

const WALL_TYPE_IDS = { dis: 'DIS-DUV-01', ic: 'IC-DUV-01', perde: 'PERDE-01', yigma: 'YIGMA-01', hafif: 'HAFIF-DUV-01', istinat: 'ISTINAT-01', parapet: 'PARAPET-01' };
const SLAB_TYPE_IDS = { ara: 'DOS-ARA-01', zemin: 'DOS-ZEM-01', balkon: 'DOS-BAL-01', teras: 'DOS-TER-01' };
const MAT_CODE = { betonarme: 'BA', celik: 'CE', 'ahsap-sert': 'AH', 'tugla-dolu': 'YI' };

export const BUILTIN_TYPES = Object.freeze([
  T('GEN-DUV-00', 'wall', 'Genel duvar (türsüz)', { function: null, compositeId: null, loadBearing: false }),
  ...WALL_KINDS.map(k => T(WALL_TYPE_IDS[k.k], 'wall', k.t, { function: k.k, compositeId: k.comp, loadBearing: !!k.struct, height: k.k === 'parapet' ? 110 : 280 })),
  ...COLUMN_MATS.map(m => T(`KOL-${MAT_CODE[m.k]}-01`, 'column', `Kolon — ${m.t}`, { materialId: m.k, shape: 'rect', width: 30, depth: 30, loadBearing: true })),
  ...COLUMN_MATS.filter(m => m.k !== 'tugla-dolu').map(m => T(`KIR-${MAT_CODE[m.k]}-01`, 'beam', `Kiriş — ${m.t}`, { materialId: m.k, width: 25, depth: 50, loadBearing: true })),
  T('DOS-KAT-00', 'slab', 'Kat döşemesi (kattan)', { function: 'kat', compositeId: null }),
  T('DOS-GEN-00', 'slab', 'Döşeme (türsüz)', { function: null, compositeId: null, thickness: 15 }),
  ...SLAB_KINDS.map(k => T(SLAB_TYPE_IDS[k.k], 'slab', k.t, { function: k.k, compositeId: k.comp })),
  T('KAP-01', 'door', 'Kapı', { width: 90, height: 210 }),
  T('PEN-01', 'window', 'Pencere', { width: 120, height: 140, sill: 90 }),
  T('BOS-01', 'opening', 'Kapısız boşluk / kemer', { width: 90, height: 220 }),
  T('MAH-01', 'room', 'Mahal', {}),
  T('CAT-01', 'roof', 'Çatı', {}),
  T('MRD-01', 'stair', 'Merdiven', {}),
  T('KRK-01', 'railing', 'Korkuluk', { height: 110 }),
  T('DON-01', 'furnishing', 'Donatı / mobilya', {}),
]);
export const DEFAULT_TYPE = Object.freeze({ wall: 'GEN-DUV-00', column: 'KOL-BA-01', beam: 'KIR-BA-01', slab: 'DOS-GEN-00', door: 'KAP-01', window: 'PEN-01', opening: 'BOS-01', room: 'MAH-01', roof: 'CAT-01', stair: 'MRD-01', railing: 'KRK-01', furnishing: 'DON-01' });

const BUILTIN_BY_ID = new Map(BUILTIN_TYPES.map(t => [t.id, t]));
const customTypes = root => (Array.isArray(root?.meta?.bimTypes) ? root.meta.bimTypes : []).filter(t => t && typeof t.id === 'string' && CLASSES[t.cls] && !BUILTIN_BY_ID.has(t.id));

/* projedeki tüm türler: yerleşik + projeye özel (özel türler yerleşik kimlikleri gölgeleyemez) */
export function listTypes(root, cls = null) {
  const all = [...BUILTIN_TYPES, ...customTypes(root)];
  return cls ? all.filter(t => t.cls === cls) : all;
}
export function getType(root, id) {
  if (typeof id !== 'string') return null;
  return BUILTIN_BY_ID.get(id) || customTypes(root).find(t => t.id === id) || null;
}

/* eski veri modelindeki bir elemanın türü:
 *   explicit — elemanda geçerli bir `bimType` alanı varsa (ileriye dönük; B1 arayüzü bu alanı yazmaz)
 *   derived  — duvar işlevi (kind), döşeme işlevi, kolon / kiriş malzemesi gibi mevcut alanlardan
 *   default  — sınıfın türsüz varsayılanı */
export function typeForLegacy(root, cls, o) {
  const ex = o && getType(root, o.bimType);
  if (ex && ex.cls === cls) return { typeId: ex.id, typeSource: 'explicit' };
  let id = null;
  if (cls === 'wall') id = WALL_TYPE_IDS[o?.kind];
  else if (cls === 'slab') id = o?.levelSlab ? 'DOS-KAT-00' : SLAB_TYPE_IDS[o?.kind];
  else if (cls === 'column') id = `KOL-${MAT_CODE[o?.mat || 'betonarme'] || 'BA'}-01`;
  else if (cls === 'beam') id = `KIR-${MAT_CODE[o?.mat || 'betonarme'] || 'BA'}-01`;
  if (id && getType(root, id)) return { typeId: id, typeSource: 'derived' };
  return { typeId: DEFAULT_TYPE[cls] || null, typeSource: 'default' };
}

/* türün etkin parametreleri: kompozitten türeyen kalınlık dahil */
export function typeParameters(root, type) {
  if (!type) return {};
  const p = { ...type.params };
  if (p.compositeId) { const c = compOf(root, p.compositeId); if (c) p.thickness = compThickness(c); }
  return p;
}

const same = (a, b) => (typeof a === 'number' && typeof b === 'number') ? Math.abs(a - b) < 1e-6 : a === b;

/* eleman parametrelerini çöz: her tanımlı parametre için değer ve kaynağı.
 * source: 'type' (türden) | 'override' (elemanda açık geçersiz kılma — `bimOv`) | 'instance' (eleman değeri türden farklı,
 *         açık kayıt yok — eski proje / B1 verisi) | 'level' (kattan devralınan) | 'derived' (hesaplanan)
 * editable: parametrenin komutlarla (setInstanceParam) yazılabilir olup olmadığı; scope 'type' olanlar türden değiştirilir. */
export function resolveParameters(root, el) {
  if (!el || !CLASSES[el.cls]) return [];
  const type = getType(root, el.typeId), tp = typeParameters(root, type), inh = el.inherited || {}, ov = new Set(el.ovKeys || []);
  const F = FIELDS[el.cls] || {}, writable = el.meta?.origin === 'legacy';
  return CLASSES[el.cls].params.map(spec => {
    const iv = getAt(el, spec.at), tv = tp[spec.k], f = F[spec.k];
    let value = iv, source;
    if (inh[spec.k]) source = inh[spec.k];
    else if (ov.has(spec.k)) source = 'override';
    else if (spec.scope === 'instance') source = 'instance';
    else if (iv === undefined || iv === null) { value = tv ?? null; source = tv !== undefined ? 'type' : 'instance'; }
    else if (tv === undefined || tv === null) source = 'instance';
    else source = same(iv, tv) ? 'type' : 'instance';
    const derivedOnly = source === 'derived' || (el.cls === 'slab' && spec.k === 'thickness' && !!el.props?.compositeId);
    const editable = !!(writable && f && f.scope !== 'type' && !derivedOnly);
    const overridden = (source === 'override' || source === 'instance') && tv != null && spec.scope !== 'instance' && !same(value, tv);
    return { k: spec.k, t: spec.t, unit: spec.unit, type: spec.type, scope: f?.scope || spec.scope, value: value ?? null, typeValue: tv ?? null, source,
      overridden, explicitOverride: ov.has(spec.k), resettable: !!(writable && f && overridden && f.scope !== 'type'), levelBindable: !!(writable && f?.level), editable };
  });
}

/* kompozit / malzeme bağlantısının çözümü (görüntüleme ve doğrulama için) */
export function materialLink(root, el) {
  const cid = el?.props?.compositeId, mid = el?.props?.materialId;
  const comp = cid ? compOf(root, cid) : null, mat = mid ? matOf(root, mid) : null;
  return { compositeId: cid || null, composite: comp ? { id: comp.k, name: comp.t, thickness: compThickness(comp), layers: comp.layers.length } : null, compositeMissing: !!cid && !comp,
    materialId: mid || null, material: mat && mat.t !== mid ? { id: mid, name: mat.t } : null };
}

/* ── projeye özel tür doğrulaması ve kaydı ──
 * saveCustomType düşük düzeyli bir yardımcıdır: verilen kökü (commands.js'te geçici kopyayı) değiştirir.
 * Arayüz ve API türleri doğrudan bununla değil, geri alınabilir komutlarla (createType / updateType) yazar. */
export function validateType(t, root = null) {
  const errors = [];
  if (!t || typeof t !== 'object') return ['Tür nesne değil'];
  if (typeof t.id !== 'string' || !/^[A-Z0-9][A-Z0-9-]{1,31}$/.test(t.id)) errors.push('Tür kimliği büyük harf, rakam ve tire içermeli (ör. DIS-DUV-02)');
  if (BUILTIN_BY_ID.has(t.id)) errors.push('Yerleşik tür kimliği kullanılamaz');
  if (!CLASSES[t.cls] || t.cls === 'level') errors.push(`Geçersiz sınıf: ${t.cls}`);
  if (typeof t.name !== 'string' || !t.name.trim()) errors.push('Tür adı boş');
  if (!t.params || typeof t.params !== 'object' || Array.isArray(t.params)) errors.push('Parametreler (params) yok');
  if (t.base != null) {
    const b = getType(root, t.base);
    if (!b) errors.push(`Temel tür bulunamadı: ${t.base}`);
    else if (b.cls !== t.cls) errors.push(`Temel tür başka sınıftan: ${t.base}`);
    else if (b.id === t.id) errors.push('Tür kendisinden türetilemez');
  }
  // parametre değerleri: yalnız bu sınıfın tür parametreleri, alan kurallarıyla
  if (t.params && typeof t.params === 'object' && FIELDS[t.cls]) {
    for (const [k, v] of Object.entries(t.params)) {
      if (!TYPE_KEYS[t.cls].includes(k)) { if (v != null) errors.push(`"${k}" bu sınıfın tür parametresi değil`); continue; }
      if (v == null) continue;
      const c = checkValue(root, t.cls, k, v); if (!c.ok) errors.push(c.error);
    }
  }
  return errors;
}
export function saveCustomType(root, type, { dryRun = true } = {}) {
  const errors = validateType(type, root);
  if (errors.length) return { ok: false, errors };
  const list = Array.isArray(root?.meta?.bimTypes) ? root.meta.bimTypes : [];
  const prev = list.find(t => t.id === type.id) || null;
  const next = { id: type.id, cls: type.cls, name: type.name.trim(), params: JSON.parse(JSON.stringify(type.params)), ...(type.base ? { base: type.base } : {}), rev: (prev?.rev || 0) + 1 };
  if (!dryRun) { root.meta ||= {}; root.meta.bimTypes = [...list.filter(t => t.id !== type.id), next]; }
  return { ok: true, dryRun, change: { op: prev ? 'update' : 'create', type: next, prev } };
}
/* yerleşik ya da özel bir türden yeni özel tür taslağı (kökü değiştirmez); base = kaynak tür */
export function deriveType(root, baseId, id, name, params = {}) {
  const b = getType(root, baseId); if (!b) return null;
  return { id, cls: b.cls, name, params: { ...b.params, ...params }, base: b.id };
}
/* kullanılmayan bir kimlik öner: DIS-DUV-01 → DIS-DUV-02 … */
export function suggestTypeId(root, baseId) {
  const m = /^(.*?)(\d+)$/.exec(baseId || '') || [null, (baseId || 'TUR') + '-', '0'];
  const used = new Set(listTypes(root).map(t => t.id));
  for (let n = +m[2] + 1; n < 1000; n++) { const id = `${m[1]}${String(n).padStart(m[2].length || 2, '0')}`; if (!used.has(id)) return id; }
  return null;
}
