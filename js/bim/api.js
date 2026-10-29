/* ═══ BIM çekirdeği — servis katmanı (B1) ═══
 * Çizim arayüzü karmaşık veri yapılarını doğrudan yönetmek yerine bu API'yi kullanır.
 * Okuma API'leri kararlıdır; kalıcı veri değiştirenler `experimental` altındadır ve varsayılan olarak dryRun çalışır
 * (yazma modeli B2 öncesinde kesinleşecek). Tüm fonksiyonlar geçersiz girdide hata fırlatmak yerine null / [] döndürür.
 *
 *   const bim = createBim(() => editor.root);
 *   bim.getElement('w123'); bim.getElementsByType('wall'); bim.resolveElementParameters('w123');
 */
import { buildModel, schemaInfo } from './adapter.js';
import { CLASSES, validateElement as validateEl } from './schema.js';
import { getType, listTypes, resolveParameters, materialLink, typeParameters, saveCustomType, deriveType, validateType } from './types.js';
import { validateRelations, inverseIndex, relationsOf } from './relations.js';

export function createBim(getRoot) {
  let cache = null;    // { root, sig, model, inv, relIssues }
  let pinned = null;   // withSnapshot süresince sabit durum (panel tek çizimde API'yi birçok kez çağırır)
  /* içerik imzası (FNV-1a): yerinde değişen eski veri (ör. taşınan duvar ucu) de yeniden türetmeyi tetikler */
  const sigOf = root => {
    let s; try { s = JSON.stringify(root) ?? ''; } catch { return NaN; }
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return `${s.length}:${h >>> 0}`;
  };
  const state = () => {
    if (pinned) return pinned;
    const root = typeof getRoot === 'function' ? getRoot() : getRoot;
    const sig = sigOf(root);
    if (!cache || cache.root !== root || cache.sig !== sig) {
      const model = buildModel(root);
      cache = { root, sig, model, inv: inverseIndex(model), relIssues: null };
    }
    return cache;
  };
  const str = v => typeof v === 'string' && v.length > 0;

  const api = {
    /* modeli bir sonraki çağrıda yeniden türet (eski veri değiştiğinde çağrılabilir; imza da değişimi yakalar) */
    refresh() { cache = null; return api; },
    /* fn süresince modeli bir kez türetip sabitler (okuma yoğun arayüz çizimleri için); fn içinde veri değiştirilmemeli */
    withSnapshot(fn) { const outer = pinned; pinned = state(); try { return fn(api); } finally { pinned = outer; } },
    model: () => state().model,
    schemaInfo: () => schemaInfo(state().root),
    getLevels: () => state().model.levels.map(l => ({ ...l })),
    getElement: id => (str(id) && state().model.elements.get(id)) || null,
    getElementsByType: cls => str(cls) ? [...state().model.elements.values()].filter(e => e.cls === cls) : [],
    getElementsByLevel: levelId => str(levelId) ? [...state().model.elements.values()].filter(e => e.levelId === levelId) : [],
    getElementsByTypeId: typeId => str(typeId) ? [...state().model.elements.values()].filter(e => e.typeId === typeId) : [],
    getElementType: typeId => getType(state().root, typeId),
    getTypeParameters: typeId => { const t = getType(state().root, typeId); return t ? typeParameters(state().root, t) : null; },
    listTypes: cls => listTypes(state().root, str(cls) ? cls : null),
    getElementRelations: id => { if (!str(id)) return null; const s = state(); return relationsOf(s.model, s.inv, id); },
    /* id ya da eleman nesnesi */
    validateElement: x => validateEl(typeof x === 'string' ? api.getElement(x) : x),
    resolveElementParameters: id => { const el = api.getElement(id); return el ? resolveParameters(state().root, el) : []; },
    getMaterialLink: id => { const el = api.getElement(id); return el ? materialLink(state().root, el) : null; },
    /* sorunlar: adaptör + ilişkiler + eleman doğrulaması (veri değiştirilmez) */
    getIssues() {
      const s = state();
      if (!s.relIssues) {
        const el = [];
        for (const e of s.model.elements.values()) {
          const v = validateEl(e);
          v.errors.forEach(m => el.push({ severity: 'error', code: 'ELEMENT_INVALID', id: e.id, msg: `${CLASSES[e.cls]?.t || e.cls} ${e.id}: ${m}` }));
          v.warnings.forEach(m => el.push({ severity: 'warning', code: 'ELEMENT_WARNING', id: e.id, msg: `${CLASSES[e.cls]?.t || e.cls} ${e.id}: ${m}` }));
          const ml = materialLink(s.root, e);
          if (ml.compositeMissing) el.push({ severity: 'warning', code: 'COMPOSITE_MISSING', id: e.id, msg: `${CLASSES[e.cls]?.t} ${e.id}: kompozit yapı "${ml.compositeId}" kütüphanede yok` });
          if (!getType(s.root, e.typeId)) el.push({ severity: 'error', code: 'TYPE_MISSING', id: e.id, msg: `${CLASSES[e.cls]?.t} ${e.id}: tür "${e.typeId}" bulunamadı` });
        }
        s.relIssues = [...s.model.issues, ...validateRelations(s.model), ...el];
      }
      return s.relIssues.slice();
    },
    issuesFor: id => api.getIssues().filter(i => i.id === id),
    /* özet: sınıf başına sayım, kullanılan türler, sorun sayıları */
    report() {
      const s = state(), byCls = {}, byType = {};
      for (const e of s.model.elements.values()) { byCls[e.cls] = (byCls[e.cls] || 0) + 1; byType[e.typeId] = (byType[e.typeId] || 0) + 1; }
      const iss = api.getIssues(), sev = k => iss.filter(i => i.severity === k).length;
      return { schema: s.model.schemaVersion, legacyFormat: s.model.legacyFormat, levels: s.model.levels.length, elements: s.model.elements.size, byClass: byCls, byType, issues: { error: sev('error'), warning: sev('warning'), info: sev('info') } };
    },

    /* deneysel yazma API'leri — varsayılan dryRun; B1 arayüzü bunları çağırmaz */
    experimental: {
      deriveType: (baseId, id, name, params) => deriveType(state().root, baseId, id, name, params),
      validateType,
      saveType: (type, opt) => { const r = saveCustomType(state().root, type, opt); if (r.ok && opt?.dryRun === false) api.refresh(); return r; },
      /* bir elemana açık tür ata (eski kayda `bimType` alanı yazar; diğer alanlara dokunmaz) */
      assignType(id, typeId, { dryRun = true } = {}) {
        const el = api.getElement(id), t = getType(state().root, typeId);
        if (!el) return { ok: false, errors: ['Eleman bulunamadı'] };
        if (!t || t.cls !== el.cls) return { ok: false, errors: [`"${typeId}" bu sınıf için geçerli bir tür değil`] };
        if (!el.legacy) return { ok: false, errors: ['Türetilmiş elemana tür atanamaz (kat döşemesi)'] };
        const change = { op: 'assignType', id, from: el.typeId, to: typeId };
        if (!dryRun) { el.legacy.bimType = typeId; api.refresh(); }
        return { ok: true, dryRun, change };
      },
    },
  };
  return api;
}
