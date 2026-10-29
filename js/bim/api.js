/* ═══ BIM çekirdeği — servis katmanı (B1, B2A) ═══
 * Çizim arayüzü karmaşık veri yapılarını doğrudan yönetmek yerine bu API'yi kullanır.
 *
 *   const bim = createBim(() => editor.root, { getVersion: () => editor.rev });
 *   bim.getElement('w123'); bim.getElementsByType('wall'); bim.resolveElementParameters('w123');
 *   bim.commands.plan({ op: 'updateType', id: 'DIS-DUV-02', params: { compositeId: 'dis-gazbeton' } });   // önizleme
 *   bim.commands.run({ op: 'assignType', ids: ['w1'], typeId: 'DIS-DUV-02' });   // editör üzerinden (geri alınabilir)
 *
 * Okuma API'leri dondurulmuş (Object.freeze) eleman görünümleri döndürür; eski kayda başvuru (legacy) dışarı verilmez —
 * yanlışlıkla yapılan bir atama veriyi değiştiremez. Tüm fonksiyonlar geçersiz girdide null / [] döndürür.
 * Yazma yalnızca komutlarla yapılır: commands.run() kayıtlı yürütücüye (editör: geri al / yinele + otomatik kayıt) gider;
 * yürütücü yoksa reddedilir. B1'in deneysel yazma API'leri yalnızca önizleme (dryRun) olarak kalır.
 *
 * Önbellek: getVersion verilirse model yalnız (kök, sürüm) değişince yeniden türetilir — editör her değişiklikte sürümü
 * artırır. Verilmezse (testler, editörsüz kullanım) tüm planın içerik imzası (FNV-1a) karşılaştırılır.
 */
import { buildModel, schemaInfo } from './adapter.js';
import { CLASSES, validateElement as validateEl } from './schema.js';
import { getType, listTypes, resolveParameters, materialLink, typeParameters, deriveType, validateType, saveCustomType } from './types.js';
import { validateRelations, inverseIndex, relationsOf } from './relations.js';
import { planCommand, summaryText, COMMANDS } from './commands.js';

const freeze = o => { if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); for (const v of Object.values(o)) freeze(v); } return o; };
/* dışa verilen eleman: eski kayıt başvurusu olmadan, derin kopya ve dondurulmuş */
const publicEl = el => { const { legacy, ...e } = el; return freeze(JSON.parse(JSON.stringify(e))); };

export function createBim(getRoot, { getVersion = null } = {}) {
  let cache = null;    // { root, key, model (iç), pub (Map), inv, memo }
  let pinned = null;   // withSnapshot süresince sabit durum
  let bump = 0;        // invalidate() sayacı
  let executor = null; // komut yürütücü (editör)
  let builds = 0;      // türetme sayısı (performans ölçümü / test)
  const sigOf = root => {
    let s; try { s = JSON.stringify(root) ?? ''; } catch { return NaN; }
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return `${s.length}:${h >>> 0}`;
  };
  const rootOf = () => (typeof getRoot === 'function' ? getRoot() : getRoot);
  const state = () => {
    if (pinned) return pinned;
    const root = rootOf();
    const key = `${bump}|${getVersion ? getVersion() : sigOf(root)}`;
    if (!cache || cache.root !== root || cache.key !== key) {
      const model = buildModel(root); builds++;
      const pub = new Map([...model.elements].map(([id, el]) => [id, publicEl(el)]));
      cache = { root, key, model, pub, inv: inverseIndex(model), memo: {} };
    }
    return cache;
  };
  const memo = (k, fn) => { const s = state(); return k in s.memo ? s.memo[k] : (s.memo[k] = fn(s)); };
  const str = v => typeof v === 'string' && v.length > 0;
  const els = () => memo('els', s => [...s.pub.values()]);

  const api = {
    /* modeli bir sonraki çağrıda yeniden türet (editör değişiklik olayında çağırır) */
    refresh() { bump++; cache = null; return api; },
    invalidate() { bump++; return api; },
    /* fn süresince modeli bir kez türetip sabitler (okuma yoğun arayüz çizimleri için); fn içinde veri değiştirilmemeli */
    withSnapshot(fn) { const outer = pinned; pinned = state(); try { return fn(api); } finally { pinned = outer; } },
    stats: () => ({ builds, cached: !!cache, tracked: !!getVersion }),
    model: () => memo('pubModel', s => freeze({ ...s.model, elements: s.pub, order: [...s.model.order], issues: s.model.issues.map(i => ({ ...i })), levels: s.model.levels.map(l => JSON.parse(JSON.stringify(l))) })),
    schemaInfo: () => schemaInfo(state().root),
    getLevels: () => state().model.levels.map(l => JSON.parse(JSON.stringify(l))),
    getElement: id => (str(id) && state().pub.get(id)) || null,
    getElementsByType: cls => str(cls) ? els().filter(e => e.cls === cls) : [],
    getElementsByLevel: levelId => str(levelId) ? els().filter(e => e.levelId === levelId) : [],
    getElementsByTypeId: typeId => str(typeId) ? (api.typeUsage().get(typeId)?.ids || []).map(id => state().pub.get(id)) : [],
    getElementType: typeId => getType(state().root, typeId),
    getTypeParameters: typeId => { const t = getType(state().root, typeId); return t ? typeParameters(state().root, t) : null; },
    listTypes: cls => listTypes(state().root, str(cls) ? cls : null),
    /* tür kullanımı: typeId → { total, explicit, derived, ids } (önbellekli) */
    typeUsage: () => memo('usage', () => {
      const m = new Map();
      for (const e of els()) {
        const u = m.get(e.typeId) || { total: 0, explicit: 0, derived: 0, ids: [] };
        u.total++; u[e.typeSource === 'explicit' ? 'explicit' : 'derived']++; u.ids.push(e.id); m.set(e.typeId, u);
      }
      return m;
    }),
    getElementRelations: id => { if (!str(id)) return null; const s = state(); return relationsOf(s.model, s.inv, id); },
    validateElement: x => validateEl(typeof x === 'string' ? api.getElement(x) : x),
    resolveElementParameters: id => { const el = str(id) && state().model.elements.get(id); return el ? resolveParameters(state().root, el) : []; },
    getMaterialLink: id => { const el = api.getElement(id); return el ? materialLink(state().root, el) : null; },
    getIssues() {
      return memo('issues', s => {
        const el = [];
        for (const e of s.model.elements.values()) {
          const v = validateEl(e);
          v.errors.forEach(m => el.push({ severity: 'error', code: 'ELEMENT_INVALID', id: e.id, msg: `${CLASSES[e.cls]?.t || e.cls} ${e.id}: ${m}` }));
          v.warnings.forEach(m => el.push({ severity: 'warning', code: 'ELEMENT_WARNING', id: e.id, msg: `${CLASSES[e.cls]?.t || e.cls} ${e.id}: ${m}` }));
          const ml = materialLink(s.root, e);
          if (ml.compositeMissing) el.push({ severity: 'warning', code: 'COMPOSITE_MISSING', id: e.id, msg: `${CLASSES[e.cls]?.t} ${e.id}: kompozit yapı "${ml.compositeId}" kütüphanede yok` });
          if (!getType(s.root, e.typeId)) el.push({ severity: 'error', code: 'TYPE_MISSING', id: e.id, msg: `${CLASSES[e.cls]?.t} ${e.id}: tür "${e.typeId}" bulunamadı` });
          if (e.legacy?.bimType && e.typeSource !== 'explicit') el.push({ severity: 'warning', code: 'TYPE_REF_INVALID', id: e.id, msg: `${CLASSES[e.cls]?.t} ${e.id}: atanmış tür "${e.legacy.bimType}" bulunamadı ya da sınıfa uymuyor; mevcut alanlardan türetildi` });
        }
        return freeze([...s.model.issues, ...validateRelations(s.model), ...el].map(i => ({ ...i })));
      }).slice();
    },
    issuesFor: id => api.getIssues().filter(i => i.id === id),
    report() {
      return memo('report', s => {
        const byCls = {}, byType = {};
        for (const e of s.model.elements.values()) { byCls[e.cls] = (byCls[e.cls] || 0) + 1; byType[e.typeId] = (byType[e.typeId] || 0) + 1; }
        const iss = api.getIssues(), sev = k => iss.filter(i => i.severity === k).length;
        return freeze({ schema: s.model.schemaVersion, legacyFormat: s.model.legacyFormat, levels: s.model.levels.length, elements: s.model.elements.size, byClass: byCls, byType, issues: { error: sev('error'), warning: sev('warning'), info: sev('info') } });
      });
    },

    /* yazma: yalnız komutlarla */
    commands: {
      list: () => COMMANDS.slice(),
      /* önizleme: kökü değiştirmez; { ok, errors, warnings, summary, patch, text } */
      plan: cmd => { const r = planCommand(rootOf(), cmd); return { ...r, text: summaryText(r.summary) }; },
      /* uygula: kayıtlı yürütücü (editör) üzerinden; yoksa reddedilir — geri al ve kayıt atlanamaz */
      run: cmd => executor ? executor(cmd) : { ok: false, applied: false, errors: ['Yazma yürütücüsü yok: BIM değişiklikleri editör üzerinden (geri alınabilir işlem olarak) uygulanır'] },
      setExecutor: fn => { executor = typeof fn === 'function' ? fn : null; },
      summaryText,
    },

    /* B1 deneysel API'leri: yalnız önizleme. Gerçek yazma isteği reddedilir (geri al / kayıt atlanmasın diye). */
    experimental: {
      deriveType: (baseId, id, name, params) => deriveType(state().root, baseId, id, name, params),
      validateType: t => validateType(t, state().root),
      saveType(type, opt) {
        if (opt?.dryRun === false) return { ok: false, errors: ['B2A: türler commands.run({ op: "createType" | "updateType" }) ile kaydedilir'] };
        return saveCustomType(JSON.parse(JSON.stringify(state().root || {})), type, { dryRun: true });
      },
      assignType(id, typeId, opt) {
        if (opt?.dryRun === false) return { ok: false, errors: ['B2A: tür ataması commands.run({ op: "assignType" }) ile yapılır'] };
        const r = planCommand(state().root, { op: 'assignType', ids: [id], typeId });
        const el = api.getElement(id);
        return r.ok ? { ok: true, dryRun: true, change: { op: 'assignType', id, from: el?.typeId ?? null, to: typeId } } : { ok: false, errors: r.errors };
      },
    },
  };
  return api;
}
