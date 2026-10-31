/* ═══ BIM çekirdeği — eski veri modeli adaptörü (B1) ═══
 * Eski plan verisini (proje → çizim → kök plan + levels[]) BIM eleman zarfına çevirir.
 * Kurallar:
 *   • Salt okur: girdi planı hiçbir koşulda değiştirmez (testle doğrulanır).
 *   • Belirlenimcidir: aynı girdi her zaman aynı çıktıyı verir (zaman damgası / rastgele kimlik üretmez).
 *   • Kimlikleri korur: eleman kimliği eski kimliğin aynısıdır. Kimliği olmayan kayıt düşürülmez; türetilmiş,
 *     kararlı bir kimlik alır ve sorun olarak raporlanır.
 *   • Bilinmeyen alanları kaybetmez: eski kaydın tamamı elemanın `legacy` alanında başvuru olarak durur.
 * Ana kayıt kaynağı eski modeldir; BIM modeli bundan her seferinde yeniden türetilir, geri yazılmaz.
 */
import { V, planLevels, polyArea, wallLen } from '../plan-geom.js';
import { compOf, compThickness } from '../materials.js';
import { BIM_SCHEMA_VERSION, GROUND_LEVEL_ID, CLASSES } from './schema.js';
import { typeForLegacy } from './types.js';
import { analyzeJoins } from './joins.js';

export const LEGACY_FORMAT = 1;   // plan.v

/* kat kimliği: zemin kat (kök plan) sabit 'L0'; ek katlar kendi kimliği, yoksa sıraya dayalı kararlı kimlik */
export const levelIdOf = (lv, idx) => idx === 0 ? GROUND_LEVEL_ID : (typeof lv?.id === 'string' && lv.id ? lv.id : `L${idx}`);

const COLLS = ['walls', 'openings', 'rooms', 'items', 'slabs', 'roofs', 'stairs', 'rails'];
const num = (v, d = null) => (typeof v === 'number' && Number.isFinite(v)) ? v : (v != null && v !== '' && Number.isFinite(+v) ? +v : d);
const pt = p => (p && Number.isFinite(+p.x) && Number.isFinite(+p.y)) ? { x: +p.x, y: +p.y } : null;
const pts = a => Array.isArray(a) ? a.map(pt) : [];

/* tek bir eski kaydı BIM elemanına çevir. ctx: { root, plan (kat planı), meta (birleşik), levelId, levelIdx, coll, index } */
export function elementFromLegacy(ctx, o) {
  const { root, meta, levelId } = ctx, base = (cls, geom, props, rels = []) => {
    const t = typeForLegacy(root, cls, o);
    return {
      schema: BIM_SCHEMA_VERSION, id: null, cls, typeId: t.typeId, typeSource: t.typeSource, levelId,
      geom, props, rels: [{ kind: 'containedIn', target: levelId }, ...rels], inherited: {}, ovKeys: Array.isArray(o?.bimOv) ? o.bimOv.filter(k => typeof k === 'string') : [],
      vis: { visible: true, layer: CLASSES[cls].layer, ifc: CLASSES[cls].ifc },
      meta: { createdAt: num(o?.createdAt), modifiedAt: num(o?.updatedAt), origin: 'legacy', src: { coll: ctx.coll, level: ctx.levelIdx, index: ctx.index } },
    };
  };
  let el;
  switch (ctx.coll) {
    case 'walls': {
      const H = num(o.h, 0) || num(meta.wallH, 280), T = num(o.t, 0) || num(meta.wallT, 15);
      el = base('wall', {
        a: pt(o.a), b: pt(o.b), length: pt(o.a) && pt(o.b) ? +wallLen(o).toFixed(3) : null, thickness: T, height: H, baseOffset: num(o.z0, 0),
        refLine: o.face ? (o.face > 0 ? 'face+' : 'face-') : 'axis', arc: o.arc ? { id: o.arc.id ?? null, index: num(o.arc.i, 0) } : null,
      }, {
        function: o.kind || null, loadBearing: !!o.struct, compositeId: o.comp || null, materialId: o.mat || null, layerFlip: !!o.lflip, color: o.color || null,
      });
      if (!num(o.h, 0)) el.inherited.height = 'level';
      if (!num(o.t, 0)) el.inherited.thickness = 'level';
      break;
    }
    case 'openings': {
      const cls = o.type === 'window' ? 'window' : o.type === 'door' ? 'door' : 'opening';
      el = base(cls, { position: num(o.pos), width: num(o.w), height: num(o.h), sill: cls === 'window' ? num(o.sill, 0) : 0, flip: !!o.flip, side: num(o.side, 1) },
        { model: o.model || null, use: o.use || null, frameColor: o.fc || null, leafColor: o.lc || null, rail: !!o.rail },
        [{ kind: 'hostedBy', target: typeof o.wallId === 'string' ? o.wallId : null }]);
      break;
    }
    case 'rooms': {
      const outline = pts(o.pts);
      el = base('room', { outline, area: outline.every(Boolean) && outline.length >= 3 ? +(Math.abs(polyArea(outline)) / 1e4).toFixed(4) : null, height: num(o.h, 0) || num(meta.wallH, 280), floorOffset: num(o.fz, 0), rect: !!o.rect },
        { name: o.name ?? '', floorFinish: o.floor || null, wallColor: o.wallColor || null },
        (Array.isArray(o.walls) ? o.walls : []).map((w, i) => ({ kind: 'boundedBy', target: typeof w === 'string' ? w : null, slot: i })));
      if (!num(o.h, 0)) el.inherited.height = 'level';
      break;
    }
    case 'items': {
      const cls = o.type === 'kolon' ? 'column' : o.type === 'kiris' ? 'beam' : 'furnishing';
      const g = { position: pt(o), width: num(o.w), depth: num(o.d), height: num(o.h), baseOffset: num(o.z, 0), rotation: num(o.rot, 0) };
      if (cls === 'column') g.shape = o.shape === 'round' ? 'round' : 'rect';
      if (cls === 'beam') { Object.assign(g, { length: num(o.w), width: num(o.d), depth: num(o.h), topOffset: num(o.z, 0) + (num(o.h, 0) || 0) }); delete g.height; }
      el = base(cls, g, cls === 'furnishing'
        ? { itemType: o.type || null, label: o.label ?? '', color: o.color || null, cabinet: !!o.cab }
        : { materialId: o.mat || 'betonarme', loadBearing: o.struct !== false, label: o.label ?? '', color: o.color || null });
      break;
    }
    case 'slabs': {
      const comp = compOf(root, o.comp), outline = pts(o.pts);
      el = base('slab', { outline, area: outline.every(Boolean) && outline.length >= 3 ? +(Math.abs(polyArea(outline)) / 1e4).toFixed(4) : null, thickness: comp ? compThickness(comp) : num(o.t, 15), topOffset: num(o.top, 0) },
        { function: o.kind || null, compositeId: o.comp || null, name: o.name ?? '' });
      if (comp) el.inherited.thickness = 'derived';
      break;
    }
    case 'roofs':
      el = base('roof', { outline: pts(o.pts), slope: num(o.slope), overhang: num(o.overhang), baseOffset: num(o.base, 0), parapet: num(o.parapet) },
        { roofType: o.type || null, cover: o.cover || null, ridge: o.ridge ?? null });
      break;
    case 'stairs':
      el = base('stair', { position: pt(o), rotation: num(o.rot, 0), width: num(o.w), rise: num(o.H), risers: num(o.N), going: num(o.g), baseOffset: num(o.z0, 0) },
        { stairType: o.type || null, construction: o.build || null, turn: o.turn || null, openingAbove: o.void !== false });
      break;
    case 'rails':
      el = base('railing', { a: pt(o.a), b: pt(o.b), length: pt(o.a) && pt(o.b) ? +V.dist(o.a, o.b).toFixed(3) : null, height: num(o.h, 110) }, { railKind: o.kind || null });
      break;
    default: return null;
  }
  el.id = typeof o.id === 'string' && o.id ? o.id : null;
  el.legacy = o;   // başvuru: kopyalanmaz, değiştirilmez (bilinmeyen alanlar kaybolmaz)
  return el;
}

/* kat döşemesi: eski modelde ayrı kayıt değil, katın kalınlık alanı → kararlı kimlikli türetilmiş döşeme elemanı */
function levelSlabElement(root, L, levelId) {
  const t = L.idx ? L.slab : num(root.meta?.slab, 0);
  if (!(t > 0)) return null;
  const compId = (L.idx ? L.plan.slabComp : root.meta?.slabComp) || null, comp = compOf(root, compId);
  const el = elementFromLegacy({ root, meta: root.meta || {}, levelId, levelIdx: L.idx, coll: 'slabs', index: -1 }, { id: `${levelId}:kat-dosemesi`, levelSlab: true, comp: compId, t, top: 0, pts: [] });
  el.geom = { outline: null, area: null, thickness: comp ? compThickness(comp) : t, topOffset: 0, fromLevel: true };
  el.props.function = 'kat';
  el.inherited = { thickness: 'level', compositeId: 'level' };
  el.meta.origin = 'derived'; el.meta.src = { coll: 'level.slab', level: L.idx, index: -1 };
  el.legacy = null;
  return el;
}

/* tüm modeli türet: { schemaVersion, legacyFormat, levels, elements (Map), order, issues } */
export function buildModel(root) {
  const issues = [], elements = new Map(), order = [], levels = [];
  if (!root || typeof root !== 'object' || !Array.isArray(root.walls)) {
    issues.push({ severity: 'error', code: 'ROOT_INVALID', id: null, msg: 'Plan verisi okunamadı (walls dizisi yok)' });
    return { schemaVersion: BIM_SCHEMA_VERSION, legacyFormat: num(root?.v), levels, elements, order, issues };
  }
  let L;
  try { L = planLevels(root); } catch (e) { issues.push({ severity: 'error', code: 'LEVELS_INVALID', id: null, msg: 'Katlar okunamadı: ' + e.message }); L = [{ plan: root, idx: 0, name: 'Zemin kat', kind: 'floor', slab: 0, z: 0, h: num(root.meta?.wallH, 280) }]; }
  const seenLv = new Set();
  for (const lv of L) {
    let levelId = levelIdOf(lv.plan, lv.idx);
    if (seenLv.has(levelId)) { issues.push({ severity: 'warning', code: 'LEVEL_ID_DUPLICATE', id: levelId, msg: `Kat kimliği tekrar ediyor: ${levelId} (${lv.name}); sıra kimliği kullanıldı` }); levelId = `L${lv.idx}`; }
    seenLv.add(levelId);
    levels.push({ schema: BIM_SCHEMA_VERSION, id: levelId, cls: 'level', idx: lv.idx, name: lv.name, kind: lv.kind, geom: { elevation: lv.z, height: lv.h, slabThickness: lv.slab }, props: {}, rels: [], meta: { origin: 'legacy', src: { coll: lv.idx ? 'levels' : 'root', level: lv.idx, index: lv.idx - 1 } } });
    const P = lv.plan || {}, meta = { ...(root.meta || {}), ...(P.meta || {}) };
    const add = el => {
      if (!el) return;
      if (!el.id) {
        el.id = `legacy:${levelId}:${el.meta.src.coll}:${el.meta.src.index}`;
        issues.push({ severity: 'warning', code: 'ID_MISSING', id: el.id, msg: `${CLASSES[el.cls].t} kaydının kimliği yok; geçici kimlik verildi (veri değiştirilmedi)` });
      }
      if (elements.has(el.id)) {
        const first = elements.get(el.id);
        issues.push({ severity: 'error', code: 'ID_DUPLICATE', id: el.id, msg: `Kimlik tekrar ediyor: ${el.id} (${CLASSES[first.cls].t} ve ${CLASSES[el.cls].t}); ikinci kayıt ayrı tutuldu` });
        el.id = `${el.id}#${el.meta.src.coll}:${el.meta.src.level}:${el.meta.src.index}`;
      }
      elements.set(el.id, el); order.push(el.id);
    };
    add(levelSlabElement(root, lv, levelId));
    for (const coll of COLLS) {
      const arr = P[coll];
      if (arr == null) continue;
      if (!Array.isArray(arr)) { issues.push({ severity: 'error', code: 'COLL_INVALID', id: null, msg: `${lv.name}: "${coll}" dizi değil, atlandı (veri değiştirilmedi)` }); continue; }
      if (lv.kind === 'roof' && coll !== 'roofs' && arr.length) issues.push({ severity: 'info', code: 'ROOF_LEVEL_CONTENT', id: levelId, msg: `Çatı planı katında ${arr.length} adet "${coll}" kaydı var` });
      arr.forEach((o, index) => {
        if (!o || typeof o !== 'object') { issues.push({ severity: 'error', code: 'RECORD_INVALID', id: null, msg: `${lv.name}: ${coll}[${index}] nesne değil, atlandı` }); return; }
        add(elementFromLegacy({ root, plan: P, meta, levelId, levelIdx: lv.idx, coll, index }, o));
      });
    }
    // B2B: duvar birleşimleri geometriden türetilir → joinedAt ilişkileri ve birleşim sorunları
    if (Array.isArray(P.walls) && P.walls.length > 1) {
      let G = null; try { G = analyzeJoins(P, { T: num(meta.wallT, 15) }); } catch (e) { issues.push({ severity: 'error', code: 'JOINS_FAILED', id: levelId, msg: `${lv.name}: birleşim grafiği hesaplanamadı (${e.message})` }); }
      if (G) {
        for (const j of G.joins) for (const m of j.members) {
          const el = elements.get(m.id); if (!el || el.cls !== 'wall' || el.levelId !== levelId) continue;
          for (const o of j.members) if (o.id !== m.id) el.rels.push({ kind: 'joinedAt', target: o.id, join: j.id, joinKind: j.kind, end: m.end || 'body' });
        }
        for (const i of G.issues) issues.push({ severity: i.severity, code: 'JOIN_' + i.code, id: i.id, ids: i.ids, msg: `${lv.name}: ${i.msg}` });
      }
    }
  }
  return { schemaVersion: BIM_SCHEMA_VERSION, legacyFormat: num(root.v, LEGACY_FORMAT), levels, elements, order, issues };
}

/* şema bilgisi ve geçiş denetimi: B1'de hiçbir geçiş veriye yazılmaz (yalnız rapor) */
export function schemaInfo(root) {
  const v = num(root?.v, null);
  return {
    legacyFormat: v ?? LEGACY_FORMAT, legacyFormatDeclared: v !== null, bimSchema: BIM_SCHEMA_VERSION,
    readable: v === null || v <= LEGACY_FORMAT, primary: 'legacy',
    note: 'B1: kayıt kaynağı eski plan verisidir; BIM modeli her açılışta bundan türetilir ve dosyaya yazılmaz.',
  };
}
