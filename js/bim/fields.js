/* ═══ BIM çekirdeği — parametre ↔ eski kayıt alanı eşlemesi (B2A) ═══
 * Her düzenlenebilir BIM parametresinin eski plan kaydındaki karşılığı, değer türü ve sınırları.
 * Eski kayıt tek kaynaktır: komutlar (commands.js) yalnızca buradaki alanlara yazar; çizim motorları (2D / 3D / kesit /
 * metraj / DXF) bu alanları zaten okuduğu için ek bir eşzamanlama katmanı gerekmez.
 *
 * Tanım: { f: eski alan, v: değer türü, scope: 'type' | 'both' | 'instance', min, signed, nullable,
 *          level: true → alan boşsa değer kattan gelir (duvar / mahal yüksekliği), opts: seçenek listesi }
 *   scope 'type'     — türe ait (işlev, kolon malzemesi): eleman tek başına değiştiremez; tür değiştirilir
 *   scope 'both'     — tür varsayılanı; eleman açık geçersiz kılma (override) ile ayrılabilir
 *   scope 'instance' — yalnız elemana ait (konum, alt kot, uzunluk)
 */
import { WALL_KINDS, SLAB_KINDS, COLUMN_MATS, USES, compOf, compThickness, materialsOf } from '../materials.js';

const L = (f, o = {}) => ({ f, v: 'len', scope: 'both', min: 1, ...o });
export const FIELDS = {
  wall: {
    function: { f: 'kind', v: 'enum', scope: 'type', nullable: true, opts: () => WALL_KINDS.map(k => [k.k, k.t]) },
    compositeId: { f: 'comp', v: 'comp', scope: 'both', nullable: true, use: 'wall' },
    thickness: L('t', { min: 2 }),
    height: L('h', { level: true }),
    baseOffset: L('z0', { scope: 'instance', signed: true, min: null }),
    loadBearing: { f: 'struct', v: 'bool', scope: 'both' },
    materialId: { f: 'mat', v: 'mat', scope: 'instance', nullable: true },
  },
  column: {
    materialId: { f: 'mat', v: 'enum', scope: 'type', opts: () => COLUMN_MATS.map(m => [m.k, m.t]) },
    shape: { f: 'shape', v: 'enum', scope: 'both', opts: () => [['rect', 'Dikdörtgen'], ['round', 'Dairesel']] },
    width: L('w'), depth: L('d'), height: L('h'),
    baseOffset: L('z', { scope: 'instance', signed: true, min: null }),
    rotation: { f: 'rot', v: 'angle', scope: 'instance' },
    loadBearing: { f: 'struct', v: 'bool', scope: 'both' },
  },
  beam: {
    materialId: { f: 'mat', v: 'enum', scope: 'type', opts: () => COLUMN_MATS.filter(m => m.k !== 'tugla-dolu').map(m => [m.k, m.t]) },
    width: L('d'), depth: L('h'),
    length: L('w', { scope: 'instance' }),
    topOffset: { f: null, v: 'len', scope: 'instance', signed: true, min: null },   // üst kot = z + h
    rotation: { f: 'rot', v: 'angle', scope: 'instance' },
    loadBearing: { f: 'struct', v: 'bool', scope: 'both' },
  },
  slab: {
    function: { f: 'kind', v: 'enum', scope: 'type', opts: () => SLAB_KINDS.map(k => [k.k, k.t]) },
    compositeId: { f: 'comp', v: 'comp', scope: 'both', nullable: true, use: 'slab' },
    thickness: L('t'),
    topOffset: L('top', { scope: 'instance', signed: true, min: null }),
  },
  door: { width: L('w', { min: 30 }), height: L('h', { min: 50 }) },
  window: { width: L('w', { min: 20 }), height: L('h', { min: 10 }), sill: L('sill', { min: 0 }) },
  opening: { width: L('w', { min: 20 }), height: L('h', { min: 50 }) },
  room: { height: L('h', { level: true }) },
};
/* tür editöründe gösterilen parametreler (sıra önemli: kompozit kalınlıktan önce uygulanır) */
export const TYPE_KEYS = Object.fromEntries(Object.entries(FIELDS).map(([c, F]) => [c, Object.keys(F).filter(k => F[k].scope !== 'instance')]));
export const fieldOf = (cls, key) => FIELDS[cls]?.[key] || null;

/* eski koleksiyon + kayıt → BIM sınıfı */
export function clsOfLegacy(coll, o) {
  if (!o || typeof o !== 'object') return null;
  switch (coll) {
    case 'walls': return 'wall';
    case 'openings': return o.type === 'window' ? 'window' : o.type === 'door' ? 'door' : 'opening';
    case 'items': return o.type === 'kolon' ? 'column' : o.type === 'kiris' ? 'beam' : 'furnishing';
    case 'slabs': return 'slab';
    case 'rooms': return 'room';
    case 'roofs': return 'roof';
    case 'stairs': return 'stair';
    case 'rails': return 'railing';
    default: return null;
  }
}
export const COLLS_OF = { wall: 'walls', door: 'openings', window: 'openings', opening: 'openings', column: 'items', beam: 'items', furnishing: 'items', slab: 'slabs', room: 'rooms', roof: 'roofs', stair: 'stairs', railing: 'rails' };

const pos = v => (typeof v === 'number' || typeof v === 'string') && +v > 0 ? +v : null;
/* eski kayıttaki güncel değer; null → alan boş (kattan / varsayılandan gelir) */
export function readField(root, cls, key, o) {
  const F = fieldOf(cls, key); if (!F || !o) return null;
  if (cls === 'beam' && key === 'topOffset') return (+o.z || 0) + (+o.h || 0);
  if (cls === 'column' && key === 'shape') return o.shape === 'round' ? 'round' : 'rect';
  if ((cls === 'column' || cls === 'beam') && key === 'materialId') return o.mat || 'betonarme';
  if ((cls === 'column' || cls === 'beam') && key === 'loadBearing') return o.struct !== false;
  if (cls === 'slab' && key === 'thickness') { const c = compOf(root, o.comp); return c ? compThickness(c) : pos(o.t); }
  const v = o[F.f];
  if (F.v === 'bool') return !!v;
  if (F.v === 'len' || F.v === 'angle') return F.min === null || F.signed ? (Number.isFinite(+v) && v !== '' && v != null ? +v : 0) : pos(v);
  return v === undefined || v === '' ? null : v;
}

/* değer doğrulama ve normalleştirme → { ok, value } | { ok: false, error } */
export function checkValue(root, cls, key, v) {
  const F = fieldOf(cls, key); if (!F) return { ok: false, error: `"${key}" parametresi bu sınıfta düzenlenemez` };
  if (v === null || v === undefined || v === '') {
    if (F.nullable || F.level) return { ok: true, value: null };
    return { ok: false, error: `${key}: değer boş olamaz` };
  }
  switch (F.v) {
    case 'len': case 'angle': {
      const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? +v : NaN;
      if (!Number.isFinite(n)) return { ok: false, error: `${key}: sayı değil (${v})` };
      if (F.v === 'len' && F.min != null && n < F.min) return { ok: false, error: `${key}: en az ${F.min} cm olmalı (${n})` };
      if (Math.abs(n) > 1e5) return { ok: false, error: `${key}: değer çok büyük (${n})` };
      return { ok: true, value: +n.toFixed(2) };
    }
    case 'bool': return typeof v === 'boolean' ? { ok: true, value: v } : { ok: false, error: `${key}: evet / hayır olmalı` };
    case 'enum': return F.opts().some(([k]) => k === v) ? { ok: true, value: v } : { ok: false, error: `${key}: geçersiz seçenek (${v})` };
    case 'comp': {
      const c = compOf(root, v);
      if (!c) return { ok: false, error: `Kompozit yapı bulunamadı: ${v}` };
      if ((USES[c.use]?.kind || 'wall') !== F.use) return { ok: false, error: `"${c.t}" ${F.use === 'wall' ? 'duvar' : 'döşeme'} yapısı değil` };
      return { ok: true, value: c.k };
    }
    case 'mat': return materialsOf(root).some(m => m.k === v) ? { ok: true, value: v } : { ok: false, error: `Malzeme bulunamadı: ${v}` };
  }
  return { ok: false, error: `${key}: desteklenmeyen değer türü` };
}

/* elemanın açık geçersiz kılma kayıtları (eski kayıtta isteğe bağlı `bimOv` dizisi; eski sürümler yok sayar) */
export const ovOf = o => new Set(Array.isArray(o?.bimOv) ? o.bimOv.filter(k => typeof k === 'string') : []);
export const sameVal = (a, b) => (typeof a === 'number' && typeof b === 'number') ? Math.abs(a - b) < 1e-6 : (a ?? null) === (b ?? null);
