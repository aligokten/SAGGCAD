/* ═══ BIM çekirdeği — güvenli yazma motoru (B2A) ═══
 * Tüm BIM değişiklikleri buradaki komutlardan geçer. Akış:
 *   1. kökün geçici kopyası alınır (gerçek veri okunur, değiştirilmez)
 *   2. girdi, eleman ve tür doğrulanır
 *   3. işlem kopya üzerinde hesaplanır; her alan değişikliği yamaya (patch) kaydedilir
 *   4. kopyadan BIM modeli türetilir; etkilenen elemanlarda yeni doğrulama hatası varsa komut reddedilir
 *   5. geçerliyse yama gerçek köke tek işlem olarak uygulanır (bir adım bile başarısız olursa hepsi geri alınır)
 * Yama alan düzeyindedir ({ lv, coll, id, key, before, after }) ve kayıtları kimliğiyle bulur; editör bunu geri al /
 * yinele yığınına tek kayıt olarak koyar (plan2d.js → bimCommand). Eski plan verisi tek kaynaktır; BIM modeli
 * her seferinde ondan türetilir, ayrıca yazılmaz.
 *
 * Komutlar: createType, duplicateType, updateType, deleteType, assignType, setInstanceParam, resetInstanceParam,
 *           setElementLevelBinding.  planCommand() hiçbir şeyi değiştirmez (önizleme / özet); runCommand() uygular.
 */
import { CLASSES, validateElement } from './schema.js';
import { buildModel } from './adapter.js';
import { getType, typeParameters, validateType, deriveType } from './types.js';
import { FIELDS, TYPE_KEYS, fieldOf, clsOfLegacy, readField, checkValue, ovOf, sameVal } from './fields.js';
import { compOf, compThickness, matOf } from '../materials.js';
import { V, wallLen, wallNormal } from '../plan-geom.js';

export const COMMANDS = ['createType', 'duplicateType', 'updateType', 'deleteType', 'assignType', 'setInstanceParam', 'resetInstanceParam', 'setElementLevelBinding'];

class CmdError extends Error {}
const fail = m => { throw new CmdError(m); };
const clone = v => v === undefined ? undefined : JSON.parse(JSON.stringify(v));
const levelPlans = R => [R, ...(Array.isArray(R?.levels) ? R.levels : [])];
const LEGACY_COLLS = ['walls', 'openings', 'rooms', 'items', 'slabs', 'roofs', 'stairs', 'rails'];
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const META = { lv: -1, coll: 'meta', id: null };

/* ───────────── yama ───────────── */
function targetOf(root, e, create = false) {
  if (e.coll === 'meta') { if (!root.meta && create) root.meta = {}; return root.meta || null; }
  const P = levelPlans(root)[e.lv], arr = P?.[e.coll];
  return Array.isArray(arr) ? arr.find(x => x && typeof x === 'object' && x.id === e.id) || null : null;
}
/* silinmiş alanı özgün anahtar sırasıyla geri koy (geri alınan kayıt JSON olarak birebir aynı olsun) */
function restoreAt(o, k, v, order) {
  if (has(o, k) || !order.includes(k)) { o[k] = v; return; }
  const cur = Object.entries(o); for (const [q] of cur) delete o[q];
  const m = new Map(cur); m.set(k, v);
  for (const q of order) if (m.has(q)) { o[q] = m.get(q); m.delete(q); }
  for (const [q, x] of m) o[q] = x;
}
/* yamayı uygula (dir 'redo') ya da geri al ('undo'); bir kayıt bulunamazsa uygulanan adımlar geri sarılır ve hata fırlatılır */
export function applyPatch(root, patch, dir = 'redo') {
  if (!root || !Array.isArray(patch)) throw new Error('Geçersiz yama');
  const list = dir === 'undo' ? [...patch].reverse() : patch, done = [];
  try {
    for (const e of list) {
      const o = targetOf(root, e, true);
      if (!o) throw new Error(`Kayıt bulunamadı: ${e.id || e.coll} (kat ${e.lv})`);
      const [h, v] = dir === 'undo' ? [e.hadBefore, e.before] : [e.hasAfter, e.after];
      done.push([o, e.key, has(o, e.key), o[e.key], Object.keys(o)]);
      if (h && !has(o, e.key) && dir === 'undo' && Array.isArray(e.order)) restoreAt(o, e.key, clone(v), e.order);   // alan sırası birebir
      else if (h) o[e.key] = clone(v); else delete o[e.key];
    }
  } catch (err) {
    for (const [o, k, h, v, order] of done.reverse()) { if (h) restoreAt(o, k, v, order); else delete o[k]; }
    throw err;
  }
  return root;
}

/* ───────────── çalışma oturumu (geçici kopya) ───────────── */
function session(root) {
  const W = clone(root); W.meta ||= {};
  const patch = [], byKey = new Map(), touched = new Set(), warnings = [];
  /* t: { lv, coll, id } — o: W içindeki kayıt; v === undefined → alanı sil */
  const set = (t, o, k, v) => {
    const h = has(o, k), cur = h ? o[k] : undefined;
    if (v === undefined ? !h : (h && JSON.stringify(cur) === JSON.stringify(v))) return false;
    const key = `${t.lv}|${t.coll}|${t.id}|${k}`;
    let e = byKey.get(key);
    if (!e) { e = { lv: t.lv, coll: t.coll, id: t.id, key: k, before: clone(cur), hadBefore: h, ...(h ? { order: Object.keys(o) } : {}) }; byKey.set(key, e); patch.push(e); }
    if (v === undefined) delete o[k]; else o[k] = clone(v);
    e.after = clone(v); e.hasAfter = v !== undefined;
    if (t.id) touched.add(t.id);
    return true;
  };
  /* kimliği tek olan eski kayıt */
  const find = id => {
    if (typeof id !== 'string' || !id) fail('Eleman kimliği yok');
    const hits = [];
    levelPlans(W).forEach((P, lv) => LEGACY_COLLS.forEach(coll => (Array.isArray(P?.[coll]) ? P[coll] : []).forEach(o => { if (o && typeof o === 'object' && o.id === id) hits.push({ t: { lv, coll, id }, o, P, cls: clsOfLegacy(coll, o) }); })));
    if (!hits.length) fail(`Eleman bulunamadı ya da düzenlenemez: ${id}`);
    if (hits.length > 1) fail(`Kimlik tekrar ediyor (${id}); önce BIM raporundaki kimlik sorununu giderin`);
    return hits[0];
  };
  const records = pred => {
    const out = [];
    levelPlans(W).forEach((P, lv) => LEGACY_COLLS.forEach(coll => (Array.isArray(P?.[coll]) ? P[coll] : []).forEach(o => {
      if (o && typeof o === 'object' && typeof o.id === 'string' && pred(o, coll)) out.push({ t: { lv, coll, id: o.id }, o, P, cls: clsOfLegacy(coll, o) });
    })));
    return out;
  };
  const types = () => (Array.isArray(W.meta.bimTypes) ? W.meta.bimTypes : []);
  const setTypes = list => set(META, W.meta, 'bimTypes', list.length ? list : undefined);
  return { W, patch, set, find, records, types, setTypes, touched, warnings };
}

/* ───────────── alan yazıcıları ───────────── */
const r2 = n => +(+n).toFixed(2);
function writeParam(S, rec, key, value, { keepThickness = false } = {}) {
  const { t, o, P, cls } = rec, F = fieldOf(cls, key);
  if (!F) fail(`"${key}" parametresi ${CLASSES[cls]?.t || cls} için düzenlenemez`);
  const put = (k, v) => S.set(t, o, k, v);
  if (cls === 'wall' && key === 'thickness') {
    if (value == null) fail('Duvar kalınlığı boş olamaz');
    const T0 = +o.t || +P.meta?.wallT || +S.W.meta.wallT || 15;
    if (o.face && Math.abs(T0 - value) > 1e-6) {   // yüzden çizilmiş duvar: çizilen yüz yerinde kalır, eksen kayar (plan2d setWallT ile aynı)
      const sh = V.mul(wallNormal(o), o.face * (T0 - value) / 2), A = V.add(o.a, sh), B = V.add(o.b, sh), a0 = { ...o.a }, b0 = { ...o.b };
      (P.walls || []).forEach(w => {
        if (!w || typeof w.id !== 'string') return;
        const wt = { lv: t.lv, coll: 'walls', id: w.id };
        if (w.a && V.eq(w.a, a0)) S.set(wt, w, 'a', { x: r2(A.x), y: r2(A.y) }); else if (w.a && V.eq(w.a, b0)) S.set(wt, w, 'a', { x: r2(B.x), y: r2(B.y) });
        if (w.b && V.eq(w.b, a0)) S.set(wt, w, 'b', { x: r2(A.x), y: r2(A.y) }); else if (w.b && V.eq(w.b, b0)) S.set(wt, w, 'b', { x: r2(B.x), y: r2(B.y) });
      });
    }
    put('t', value);
    const c = compOf(S.W, o.comp);
    if (c && Math.abs(compThickness(c) - value) > 0.01) { put('comp', undefined); S.warnings.push(`${o.id}: kalınlık kompozitten farklı — kompozit yapı kaldırıldı`); }
    return;
  }
  if (cls === 'wall' && key === 'compositeId') {
    if (value == null) { put('comp', undefined); return; }
    put('comp', value); put('mat', undefined);
    if (!keepThickness) writeParam(S, rec, 'thickness', compThickness(compOf(S.W, value)));
    else S.warnings.push(`${o.id}: kalınlık geçersiz kılındığı için kompozit kalınlığı uygulanmadı`);
    return;
  }
  if (cls === 'wall' && key === 'materialId' && value != null && o.comp) fail('Kompozit yapısı olan duvara tek malzeme atanamaz; önce kompoziti kaldırın');
  if ((cls === 'column' || cls === 'beam') && key === 'materialId') { put('mat', value); put('color', matOf(S.W, value).col); return; }
  if (cls === 'column' && key === 'shape') { put('shape', value); if (value === 'round') put('d', +o.w); return; }
  if (cls === 'column' && key === 'width' && o.shape === 'round') { put('w', value); put('d', value); return; }
  if (cls === 'beam' && key === 'length') {   // başlangıç ucu sabit
    const a = (+o.rot || 0) * Math.PI / 180, u = { x: Math.cos(a), y: Math.sin(a) }, st = V.sub(o, V.mul(u, (+o.w || 0) / 2)), c = V.add(st, V.mul(u, value / 2));
    put('x', r2(c.x)); put('y', r2(c.y)); put('w', value); return;
  }
  if (cls === 'beam' && key === 'depth') { const top = (+o.z || 0) + (+o.h || 0); put('h', value); put('z', r2(top - value)); return; }
  if (cls === 'beam' && key === 'topOffset') { put('z', r2(value - (+o.h || 0))); return; }
  if (cls === 'slab' && key === 'thickness' && compOf(S.W, o.comp)) fail('Döşeme kalınlığı kompozit yapıdan hesaplanır; kompoziti değiştirin ya da kaldırın');
  if ((cls === 'door' || cls === 'window' || cls === 'opening') && key === 'width') {
    const w = (P.walls || []).find(x => x && x.id === o.wallId);
    if (w) {
      const L = wallLen(w), nv = Math.min(value, L - 2);
      if (nv < value) S.warnings.push(`${o.id}: genişlik duvar uzunluğuna göre ${r2(nv)} cm ile sınırlandı`);
      put('w', r2(nv)); put('pos', r2(Math.max(nv / 2, Math.min(L - nv / 2, +o.pos || 0)))); return;
    }
  }
  put(F.f, value == null ? undefined : value);
}

/* bimOv dizisini güncelle (boşsa alan silinir) */
const writeOv = (S, rec, ov) => S.set(rec.t, rec.o, 'bimOv', ov.size ? [...ov].filter(k => fieldOf(rec.cls, k)).sort() : undefined);

/* ───────────── tür parametrelerini elemana uygula ───────────── */
function typeOfRec(S, rec) {
  const ex = getType(S.W, rec.o.bimType);
  return ex && ex.cls === rec.cls ? ex : null;
}
function applyType(S, rec, type, { keepOverrides = true, sum } = {}) {
  const tp = typeParameters(S.W, type), ov = keepOverrides ? ovOf(rec.o) : new Set(), F = FIELDS[rec.cls] || {};
  for (const k of TYPE_KEYS[rec.cls] || []) {
    if (!has(tp, k) || tp[k] === undefined) continue;
    if (ov.has(k)) { if (sum) sum.kept[k] = (sum.kept[k] || 0) + 1; continue; }
    if (F[k].level && readField(S.W, rec.cls, k, rec.o) == null) { if (sum) sum.level[k] = (sum.level[k] || 0) + 1; continue; }
    if (rec.cls === 'slab' && k === 'thickness' && (tp.compositeId || compOf(S.W, rec.o.comp))) continue;   // kompozitten
    if (rec.cls === 'wall' && k === 'thickness' && tp.compositeId) continue;   // kompozitle birlikte yazıldı
    if (tp[k] === null && !F[k].nullable) continue;
    writeParam(S, rec, k, tp[k], { keepThickness: ov.has('thickness') });
  }
  S.set(rec.t, rec.o, 'bimType', type.id);
  writeOv(S, rec, ov);
}

/* ───────────── komutlar ───────────── */
const typeList = S => S.types().map(clone);
const normParams = (S, cls, params) => {
  const out = {};
  for (const k of TYPE_KEYS[cls] || []) if (params && has(params, k) && params[k] !== undefined) out[k] = params[k];
  if (out.compositeId) delete out.thickness;   // kalınlık kompozitten
  return out;
};
const customOf = (S, id) => {
  const t = S.types().find(x => x && x.id === id);
  if (!t) { if (getType(null, id)) fail(`${id} yerleşik bir türdür; değiştirilemez — çoğaltarak özel tür oluşturun`); fail(`Tür bulunamadı: ${id}`); }
  return t;
};
const usage = (S, id) => S.records(o => o.bimType === id);

const C = {
  createType(S, { type }) {
    if (!type || typeof type !== 'object') fail('Tür tanımı yok');
    const id = typeof type.id === 'string' ? type.id.trim().toUpperCase() : type.id;
    if (getType(S.W, id)) fail(`Bu kimlikte bir tür zaten var: ${id}`);
    const t = { id, cls: type.cls, name: String(type.name ?? '').trim(), params: normParams(S, type.cls, type.params), ...(type.base ? { base: type.base } : {}) };
    const errs = validateType(t, S.W); if (errs.length) fail(errs.join(' · '));
    S.setTypes([...typeList(S), { ...t, rev: 1 }]);
    return { label: `Tür oluşturuldu: ${id}`, summary: { typeId: id, cls: t.cls, op: 'create' } };
  },
  duplicateType(S, { from, id, name, params }) {
    const b = getType(S.W, from); if (!b) fail(`Kaynak tür bulunamadı: ${from}`);
    const d = deriveType(S.W, from, id, name || `${b.name} (kopya)`, params || {});
    return { ...C.createType(S, { type: d }), label: `Tür çoğaltıldı: ${from} → ${id}` };
  },
  updateType(S, { id, name, params }) {
    const prev = customOf(S, id), cls = prev.cls;
    const oldTP = typeParameters(S.W, getType(S.W, id));
    const merged = { ...prev.params };
    if (params && typeof params === 'object') for (const [k, v] of Object.entries(params)) { if (v === undefined) delete merged[k]; else merged[k] = v; }
    const next = { id, cls, name: name != null ? String(name).trim() : prev.name, params: normParams(S, cls, merged), ...(prev.base ? { base: prev.base } : {}) };
    const errs = validateType(next, S.W); if (errs.length) fail(errs.join(' · '));
    S.setTypes(typeList(S).map(t => t.id === id ? { ...next, rev: (+prev.rev || 0) + 1 } : t));
    const newTP = typeParameters(S.W, getType(S.W, id)), F = FIELDS[cls] || {};
    const changed = (TYPE_KEYS[cls] || []).filter(k => !sameVal(oldTP[k], newTP[k]));
    const recs = usage(S, id), sum = { typeId: id, cls, op: 'update', elements: recs.length, affected: 0, kept: {}, level: {}, implicit: {}, keptGroups: {}, changedKeys: changed };
    for (const rec of recs) {
      const ov = ovOf(rec.o), orig = Object.fromEntries(changed.map(k => [k, readField(S.W, cls, k, rec.o)]));
      const inc = (o, k) => { o[k] = (o[k] || 0) + 1; }, follow = [];
      // 1. sınıflandır: açık geçersiz kılma → korunur; kata bağlı → kat izlenir; eski tür değerine eşit (ya da alan boş) → türü
      //    izler; farklı ve açık kaydı yok (eski proje / B1 verisi) → değer korunur ve açık kayda dönüştürülür
      let ovChanged = false;
      for (const k of changed) {
        if (ov.has(k)) { inc(sum.kept, k); continue; }
        if (F[k].level && orig[k] == null) { inc(sum.level, k); continue; }
        if (cls === 'slab' && k === 'thickness' && (newTP.compositeId || compOf(S.W, rec.o.comp))) continue;   // kompozitten
        if ((orig[k] == null && !F[k].nullable) || sameVal(orig[k], oldTP[k])) follow.push(k);
        else { ov.add(k); ovChanged = true; inc(sum.kept, k); inc(sum.implicit, k); }
      }
      // 2. yaz: kompozit, kalınlığı da belirler (kalınlık korunuyorsa kompozit kalınlığı uygulanmaz)
      const n0 = S.patch.length;
      for (const k of follow) {
        if (cls === 'wall' && k === 'thickness' && follow.includes('compositeId') && newTP.compositeId) continue;   // kompozitle yazılır
        if (newTP[k] === null && !F[k].nullable) continue;
        writeParam(S, rec, k, newTP[k] ?? null, { keepThickness: ov.has('thickness') });
      }
      if (ovChanged) writeOv(S, rec, ov);
      if (S.patch.slice(n0).some(e => e.key !== 'bimOv')) sum.affected++;
      const kk = changed.filter(k => ov.has(k)).join('+'); if (kk) sum.keptGroups[kk] = (sum.keptGroups[kk] || 0) + 1;
    }
    return { label: `Tür güncellendi: ${id}`, summary: sum };
  },
  deleteType(S, { id, reassignTo = null }) {
    const prev = customOf(S, id), recs = usage(S, id);
    if (recs.length && !reassignTo) fail(`${id} türü ${recs.length} elemanda kullanılıyor; silmek için başka bir türe yeniden atayın`);
    let to = null;
    if (reassignTo) {
      to = getType(S.W, reassignTo);
      if (!to || to.id === id) fail(`Yeniden atanacak tür geçersiz: ${reassignTo}`);
      if (to.cls !== prev.cls) fail(`${reassignTo} başka bir sınıfın türü`);
    }
    for (const rec of recs) applyType(S, rec, to);
    // bu türden türetilmiş özel türler temel olarak silinen türün temelini gösterir
    S.setTypes(typeList(S).filter(t => t.id !== id).map(t => t.base === id ? (prev.base ? { ...t, base: prev.base } : (({ base, ...r }) => r)(t)) : t));
    return { label: `Tür silindi: ${id}`, summary: { typeId: id, cls: prev.cls, op: 'delete', reassigned: recs.length, reassignTo: to?.id || null } };
  },
  assignType(S, { ids, id, typeId, keepOverrides = true }) {
    const list = [...new Set(Array.isArray(ids) ? ids : [id])];
    if (!list.length || list.some(x => typeof x !== 'string')) fail('Atanacak eleman yok');
    const type = typeId == null ? null : getType(S.W, typeId);
    if (typeId != null && !type) fail(`Tür bulunamadı: ${typeId}`);
    const sum = { typeId: typeId ?? null, op: 'assign', elements: list.length, kept: {}, level: {}, cls: type?.cls || null };
    for (const x of list) {
      const rec = S.find(x);
      if (type) {
        if (rec.cls !== type.cls) fail(`${x}: ${CLASSES[rec.cls]?.t || rec.cls} elemanına ${CLASSES[type.cls]?.t} türü atanamaz`);
        applyType(S, rec, type, { keepOverrides, sum });
      } else { S.set(rec.t, rec.o, 'bimType', undefined); S.set(rec.t, rec.o, 'bimOv', undefined); }   // türden ayır: mevcut alanlardan türetilmiş türe döner
    }
    return { label: type ? `Tür atandı: ${type.id} (${list.length})` : `Türden ayrıldı (${list.length})`, summary: sum };
  },
  setInstanceParam(S, { id, key, value }) {
    const rec = S.find(id), F = fieldOf(rec.cls, key);
    if (!F) fail(`"${key}" parametresi ${CLASSES[rec.cls]?.t || rec.cls} için düzenlenemez`);
    if (F.scope === 'type') fail(`"${key}" türe ait bir parametredir; elemanın türünü değiştirin ya da türü düzenleyin`);
    const c = checkValue(S.W, rec.cls, key, value); if (!c.ok) fail(c.error);
    if (c.value == null && F.level) return C.setElementLevelBinding(S, { id, key, bound: true });
    writeParam(S, rec, key, c.value);
    const type = typeOfRec(S, rec);
    if (type && F.scope !== 'instance') {   // açık tür: türden farklı değer açık geçersiz kılmadır
      const tp = typeParameters(S.W, type), ov = ovOf(rec.o);
      if (has(tp, key)) { if (sameVal(c.value, tp[key])) ov.delete(key); else ov.add(key); }
      if (rec.cls === 'wall' && key === 'thickness' && !rec.o.comp && tp.compositeId) ov.add('compositeId');
      if (rec.cls === 'wall' && key === 'compositeId') ov.delete('thickness');
      writeOv(S, rec, ov);
    }
    return { label: `${CLASSES[rec.cls].t} ${id}: ${key}`, summary: { op: 'set', id, key } };
  },
  resetInstanceParam(S, { id, key }) {
    const rec = S.find(id), F = fieldOf(rec.cls, key);
    if (!F || F.scope === 'instance') fail(`"${key}" türden gelen bir parametre değil`);
    const type = typeOfRec(S, rec) || getType(S.W, buildModel(S.W).elements.get(id)?.typeId);
    if (!type) fail('Elemanın türü bulunamadı');
    const tp = typeParameters(S.W, type), ov = ovOf(rec.o);
    if (rec.cls === 'wall' && key === 'thickness' && tp.compositeId) {   // kalınlık kompozitten gelir: ikisi birlikte türe döner
      writeParam(S, rec, 'compositeId', tp.compositeId); ov.delete('compositeId');
    } else {
      if (!has(tp, key) || tp[key] === undefined) fail(`${type.id} türünde "${key}" değeri yok`);
      if (tp[key] === null && !F.nullable) fail(`${type.id} türünde "${key}" değeri yok`);
      writeParam(S, rec, key, tp[key]);
      if (key === 'compositeId') ov.delete('thickness');
    }
    ov.delete(key);
    if (rec.o.bimType) writeOv(S, rec, ov);
    return { label: `${CLASSES[rec.cls].t} ${id}: ${key} türe döndü`, summary: { op: 'reset', id, key } };
  },
  setElementLevelBinding(S, { id, key = 'height', bound }) {
    const rec = S.find(id), F = fieldOf(rec.cls, key);
    if (!F?.level) fail(`"${key}" parametresi kata bağlanamaz (B2A: duvar ve mahal yüksekliği)`);
    if (typeof bound !== 'boolean') fail('bound evet / hayır olmalı');
    const ov = ovOf(rec.o);
    if (bound) { S.set(rec.t, rec.o, F.f, undefined); ov.delete(key); }
    else {
      const cur = readField(S.W, rec.cls, key, rec.o) ?? (+rec.P.meta?.wallH || +S.W.meta.wallH || 280);
      S.set(rec.t, rec.o, F.f, cur);
      const type = typeOfRec(S, rec), tv = type ? typeParameters(S.W, type)[key] : undefined;
      if (type && tv != null && !sameVal(cur, tv)) ov.add(key);
    }
    if (rec.o.bimType) writeOv(S, rec, ov);
    return { label: `${CLASSES[rec.cls].t} ${id}: yükseklik ${bound ? 'kata bağlandı' : 'kattan ayrıldı'}`, summary: { op: 'level', id, key, bound } };
  },
};

/* etkilenen elemanlarda yeni doğrulama hatası var mı */
function newErrors(root, W, ids) {
  if (!ids.size) return [];
  const before = buildModel(root).elements, after = buildModel(W).elements, out = [];
  for (const id of ids) {
    const a = after.get(id); if (!a) continue;
    const e0 = new Set(before.get(id) ? validateElement(before.get(id)).errors : []);
    validateElement(a).errors.filter(m => !e0.has(m)).forEach(m => out.push(`${id}: ${m}`));
  }
  return out;
}

/* komutu kopya üzerinde hesapla — kökü değiştirmez. → { ok, errors, warnings, patch, summary, label } */
export function planCommand(root, cmd) {
  const res = (o) => ({ ok: false, errors: [], warnings: [], patch: [], summary: null, label: '', ...o });
  if (!root || typeof root !== 'object' || !Array.isArray(root.walls)) return res({ errors: ['Plan verisi yok'] });
  if (!cmd || typeof cmd !== 'object' || !COMMANDS.includes(cmd.op)) return res({ errors: [`Bilinmeyen komut: ${cmd?.op}`] });
  let S;
  try {
    S = session(root);
    const out = C[cmd.op](S, cmd) || {};
    const patch = S.patch.filter(e => e.hadBefore !== e.hasAfter || JSON.stringify(e.before) !== JSON.stringify(e.after));
    const errs = newErrors(root, S.W, S.touched);
    if (errs.length) return res({ errors: ['Komut geçersiz eleman üretirdi; değişiklik yapılmadı', ...errs], warnings: S.warnings, summary: out.summary, label: out.label });
    return res({ ok: true, warnings: S.warnings, patch, summary: out.summary || null, label: out.label || cmd.op });
  } catch (e) {
    if (e instanceof CmdError) return res({ errors: [e.message], warnings: S?.warnings || [] });
    return res({ errors: ['Beklenmeyen hata: ' + (e?.message || e)] });
  }
}
/* komutu hesapla ve köke tek işlem olarak uygula (başarısızlıkta kök değişmeden kalır) */
export function runCommand(root, cmd) {
  const r = planCommand(root, cmd);
  if (!r.ok || !r.patch.length) return { ...r, applied: false };
  try { applyPatch(root, r.patch, 'redo'); } catch (e) { return { ...r, ok: false, applied: false, errors: ['Uygulama başarısız, değişiklikler geri alındı: ' + e.message] }; }
  return { ...r, applied: true };
}

/* ───────────── özet metni ───────────── */
const NOUN = {   // [belirtme, bulunma] durumları
  wall: ['duvarı', 'duvarda'], column: ['kolonu', 'kolonda'], beam: ['kirişi', 'kirişte'], slab: ['döşemeyi', 'döşemede'],
  door: ['kapıyı', 'kapıda'], window: ['pencereyi', 'pencerede'], opening: ['boşluğu', 'boşlukta'], room: ['mahali', 'mahalde'],
};
const PNAME = { thickness: 'kalınlık', height: 'yükseklik', compositeId: 'kompozit yapı', loadBearing: 'taşıyıcılık', width: 'genişlik / en', depth: 'derinlik / boy', shape: 'kesit', sill: 'denizlik', function: 'işlev', materialId: 'malzeme' };
export function summaryText(sum) {
  if (!sum || sum.op !== 'update') return '';
  const [acc, loc] = NOUN[sum.cls] || ['elemanı', 'elemanda'];
  if (!sum.changedKeys?.length) return 'Parametre değişikliği yok (yalnız ad).';
  if (!sum.elements) return 'Bu türe atanmış eleman yok; yalnız tür tanımı değişecek.';
  const parts = [`Bu değişiklik ${sum.elements} ${acc} etkileyecek.`];
  // eleman başına: aynı elemanda korunan parametreler tek cümlede (ör. "2 duvarda özel kalınlık ve kompozit yapı korunacak")
  const order = ['thickness', 'height', 'compositeId'];
  for (const [g, n] of Object.entries(sum.keptGroups || {})) {
    const ks = g.split('+').sort((a, b) => (order.indexOf(a) + 1 || 9) - (order.indexOf(b) + 1 || 9)).map(k => PNAME[k] || k);
    parts.push(`${n} ${loc} özel ${ks.length > 1 ? ks.slice(0, -1).join(', ') + ' ve ' + ks.at(-1) : ks[0]} korunacak.`);
  }
  for (const [k, n] of Object.entries(sum.level || {})) parts.push(`${n} ${loc} ${PNAME[k] || k} kata bağlı kalacak.`);
  return parts.join(' ');
}

/* ───────────── eski özellik paneli düzenlemeleri ─────────────
 * Panel alanları (kalınlık, yükseklik, kompozit …) eski kaydı doğrudan değiştirir ve editörün plan anlık görüntüsüyle
 * geri alınır. Açık türü olan elemanda bu düzenleme, komutlarla aynı kurala göre geçersiz kılma kaydına işlenir:
 * türden farklı değer → bimOv'a eklenir, türle aynı değer → çıkarılır. Türe ait bir parametre (işlev, kolon malzemesi,
 * açıklık türü) panelden değişirse eleman türden ayrılır ve mevcut alanlardan türetilmiş türe döner.
 * Dönüş: 'detached' | 'updated' | null. Yalnız verilen kaydı değiştirir. */
const LEGACY_EDIT = {
  wall: { t: ['thickness', 'compositeId'], h: ['height'], struct: ['loadBearing'], comp: ['compositeId', 'thickness'], wkind: '*' },
  column: { w: ['width', 'depth'], d: ['depth'], h: ['height'], shape: ['shape', 'depth'], struct: ['loadBearing'], mat: '*' },
  beam: { d: ['width'], h: ['depth'], struct: ['loadBearing'], mat: '*' },
  slab: { skind: '*', comp: ['compositeId'], t: ['thickness'] },
  door: { w: ['width'], h: ['height'], type: '*' }, window: { w: ['width'], h: ['height'], sill: ['sill'], type: '*' }, opening: { w: ['width'], h: ['height'], type: '*' },
  room: { h: ['height'] },
};
export function noteLegacyEdit(root, cls, o, legacyKey) {
  if (!o || typeof o !== 'object' || !o.bimType) return null;
  const keys = LEGACY_EDIT[cls]?.[legacyKey]; if (!keys) return null;
  const type = getType(root, o.bimType);
  if (keys === '*' || !type || type.cls !== cls) { delete o.bimType; delete o.bimOv; return 'detached'; }
  const tp = typeParameters(root, type), ov = ovOf(o), F = FIELDS[cls] || {};
  for (const k of keys) {
    if (!F[k] || F[k].scope === 'instance' || !has(tp, k) || tp[k] === undefined) continue;
    const cur = readField(root, cls, k, o);
    if (F[k].level && cur == null) ov.delete(k);
    else if (sameVal(cur, tp[k])) ov.delete(k); else ov.add(k);
  }
  if (ov.size) o.bimOv = [...ov].sort(); else delete o.bimOv;
  return 'updated';
}
