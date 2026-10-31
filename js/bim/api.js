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
import { levelWallGeometry, wallQuantities, PRIO_LABEL } from './wallgeom.js';
import { wallJoinInfo } from './joins.js';
import { buildDeps, getAffectedElements, findCycles, constraintOrder } from './deps.js';
import { solve } from './solver.js';
import { arcParameters } from './wallcmds.js';
import { planLevels } from '../plan-geom.js';

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
    /* B2B: duvar birleşimleri, referans çizgisi, katman öncelikleri, kat bağı */
    getWallJoinInfo(id) {
      const el = str(id) && state().model.elements.get(id); if (!el || el.cls !== 'wall' || !el.legacy) return null;
      const R = state().root, L = planLevels(R)[el.meta.src.level]; if (!L) return null;
      const P = L.plan, geo = levelWallGeometry(R, P, { T: P.meta?.wallT ?? R.meta?.wallT }), S = geo.walls.get(id), o = el.legacy;
      const info = wallJoinInfo(geo.joins, id);
      return freeze(JSON.parse(JSON.stringify({ ...info, issues: geo.issues.filter(i => (i.ids || []).includes(id)), legacy: !!S?.legacy, ref: o.face ? (o.face > 0 ? 'face+' : 'face-') : 'axis',
        joinOff: Array.isArray(o.joinOff) ? o.joinOff : [], top: o.bimTop || null,
        layers: (S?.layers || []).map(l => ({ idx: l.idx, mat: l.mat, name: l.m.t, prio: l.prio, prioLabel: PRIO_LABEL[l.prio] || '', core: l.core, thickness: +(l.hi - l.lo).toFixed(2) })) })));
    },
    /* B3-B: bağımlılık grafiği (modelden türetilir, önbellekli) */
    deps: () => memo('deps', s => buildDeps(s.model, s.root)),
    getAffectedElements: (ids, opt) => getAffectedElements(api.deps(), Array.isArray(ids) ? ids : [ids], opt),
    constraintCycles: () => memo('cycles', () => findCycles(api.deps())),
    constraintOrder: ids => constraintOrder(api.deps(), ids),
    /* B3-D: sıralı kısıt çözücü (saf; öneriler fixes içinde, uygulanmaz) */
    solveConstraints: (changed = null) => changed ? solve(state().root, { changed, model: state().model }) : memo('solve', s => solve(s.root, { model: s.model })),
    getArcParameters: arcId => { if (!str(arcId)) return null; for (const l of planLevels(state().root)) { const a = arcParameters(l.plan, arcId); if (a) return { ...a, levelId: l.idx === 0 ? 'L0' : l.plan.id }; } return null; },
    /* Model Sağlığı özeti */
    health: () => memo('health', s => {
      const sol = api.solveConstraints(), iss = s.model.issues, G = api.deps();
      const lvIds = new Set(s.model.levels.map(l => l.id)), bound = [...s.model.elements.values()].filter(e => [...lvIds].some(l => G.drives.get(l)?.has(e.id)) && (e.legacy?.bimTop || e.inherited?.height === 'level')).length;
      const geoCodes = new Set(['WALL_INVALID', 'ROOM_INVALID', 'SLAB_INVALID', 'OPENING_FIT', 'OPENING_HOST', 'QTY_INVALID', 'QTY_FAILED']);
      return {
        elements: s.model.elements.size, bound,
        joinIssues: iss.filter(i => String(i.code).startsWith('JOIN_') && i.severity !== 'info').length,
        unsolved: sol.conflicts.length, errors: sol.conflicts.filter(c => c.severity === 'error').length,
        invalidGeometry: sol.conflicts.filter(c => geoCodes.has(c.code)).length + iss.filter(i => i.code === 'GEOM_OVERLAP_RESOLVED').length,
        cycles: api.constraintCycles().length, solve: sol,
      };
    }),
    getTopBinding: id => { const el = str(id) && state().model.elements.get(id); return el?.legacy ? (el.legacy.bimTop ? { ...el.legacy.bimTop } : null) : null; },
    /* B2B: duvar metrajı (birleşimlerde çift sayım yok): kat başına toplam ve malzeme hacimleri */
    wallQuantities: () => memo('wallQ', s => planLevels(s.root).filter(l => l.kind !== 'roof').map(l => {
      const meta = { ...s.root.meta, ...(l.plan.meta || {}) }, q = wallQuantities(s.root, l.plan, meta);
      return { level: l.idx, name: l.name, total: q.total, byMat: q.byMat, legacy: q.legacy, walls: [...q.walls.values()] };
    })),
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
