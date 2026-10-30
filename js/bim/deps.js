/* ═══ BIM çekirdeği — bağımlılık grafiği ve değişiklik olayları (B3-B) ═══
 * Grafik BIM modelinden (adapter.buildModel) türetilir; ikinci bir kalıcı model değildir.
 * Düğümler: eleman kimliği · kat kimliği · 'type:ID' · 'comp:KEY' · 'mat:KEY' · 'view:LEVEL' · 'qty:LEVEL'
 * Kenar X → Y: "X değişirse Y etkilenir". İki tür:
 *   etki (affects)   — birleşen duvarlar (karşılıklı), duvar → açıklıklar / mahaller, eleman → görünüş / metraj
 *   kısıt (drives)   — yönlü sürücü ilişki: kat → kata bağlı eleman, kat → üst kat, tür → atanmış eleman,
 *                      kompozit → kullanan eleman / tür, malzeme → kompozit / eleman, duvar → barındırılan açıklık
 * Kısıt kenarları kısıt çözücünün (solver.js) sırasıdır; döngü bulunursa işlem güvenli biçimde reddedilir.
 * Değişiklik olayları: commands.js yaması ve history.js fark adımlarından değişen kimlikler (changedIdsOf).
 */
import { CLASSES } from './schema.js';
import { compOf, compositesOf } from '../materials.js';

/* kısıt aşamaları (çözücü sırası) */
export const STAGES = ['level', 'binding', 'wall', 'join', 'opening', 'room', 'slab', 'derived'];
const STAGE_OF = { level: 'level', wall: 'wall', column: 'binding', beam: 'binding', door: 'opening', window: 'opening', opening: 'opening', room: 'room', slab: 'slab', roof: 'slab', stair: 'derived', railing: 'derived', furnishing: 'derived' };

export function buildDeps(model, root) {
  const affects = new Map(), drives = new Map(), kind = new Map();
  const add = (m, a, b) => { if (!a || !b || a === b) return; (m.get(a) || m.set(a, new Set()).get(a)).add(b); };
  const node = (id, k) => { if (!kind.has(id)) kind.set(id, k); };
  const levels = model.levels || [];
  levels.forEach((L, i) => {
    node(L.id, 'level'); node(`view:${L.id}`, 'view'); node(`qty:${L.id}`, 'qty');
    if (levels[i + 1]) { add(drives, L.id, levels[i + 1].id); add(affects, L.id, levels[i + 1].id); }   // üst katların kotu
  });
  const comps = compositesOf(root);
  for (const c of comps) { node(`comp:${c.k}`, 'composite'); for (const [mk] of c.layers || []) { node(`mat:${mk}`, 'material'); add(drives, `mat:${mk}`, `comp:${c.k}`); } }
  for (const el of model.elements.values()) {
    node(el.id, el.cls);
    const lv = el.levelId;
    add(affects, el.id, `view:${lv}`); add(affects, el.id, `qty:${lv}`);
    // tür
    if (el.typeId) { node(`type:${el.typeId}`, 'type'); add(drives, `type:${el.typeId}`, el.id); }
    // kompozit / malzeme
    const cid = el.props?.compositeId; if (cid && compOf(root, cid)) add(drives, `comp:${cid}`, el.id);
    const mid = el.props?.materialId; if (mid) { node(`mat:${mid}`, 'material'); add(drives, `mat:${mid}`, el.id); }
    // kat bağı: yükseklik kattan (h boş) ya da bimTop
    if (el.inherited?.height === 'level' || el.legacy?.bimTop || el.meta?.origin === 'derived') add(drives, lv, el.id);
    add(affects, lv, el.id);   // kat kotu değişince tüm elemanların mutlak konumu
    for (const r of el.rels || []) {
      if (!r.target) continue;
      if (r.kind === 'hostedBy') { add(drives, r.target, el.id); add(affects, r.target, el.id); }
      else if (r.kind === 'boundedBy') add(affects, r.target, el.id);
      else if (r.kind === 'joinedAt') add(affects, el.id, r.target);
    }
  }
  // tür → kompozit (türün kompoziti değişince türü kullananlar)
  const types = new Set([...kind].filter(([, k]) => k === 'type').map(([id]) => id));
  for (const t of Array.isArray(root?.meta?.bimTypes) ? root.meta.bimTypes : []) {
    const cid = t?.params?.compositeId; if (cid && types.has(`type:${t.id}`)) add(drives, `comp:${cid}`, `type:${t.id}`);
  }
  // mahal ↔ duvar geometrik eşleme (yuvasız ortak duvarlar): duvar kenara paralel ve kalınlık bandı + 2 cm içinde
  for (const room of model.elements.values()) {
    if (room.cls !== 'room' || !Array.isArray(room.geom.outline)) continue;
    const o = room.geom.outline, walls = [...model.elements.values()].filter(w => w.cls === 'wall' && w.levelId === room.levelId && w.geom.a && w.geom.b);
    for (let i = 0; i < o.length; i++) {
      const a = o[i], b = o[(i + 1) % o.length]; if (!a || !b) continue;
      const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, du = norm(sub(b, a));
      for (const w of walls) {
        const u = norm(sub(w.geom.b, w.geom.a)); if (Math.abs(du.x * u.x + du.y * u.y) < 0.999) continue;
        const L = Math.hypot(w.geom.b.x - w.geom.a.x, w.geom.b.y - w.geom.a.y), s = (m.x - w.geom.a.x) * u.x + (m.y - w.geom.a.y) * u.y;
        if (s <= 0 || s >= L) continue;
        const d = Math.abs((m.x - w.geom.a.x) * -u.y + (m.y - w.geom.a.y) * u.x);
        if (d <= (w.geom.thickness || 15) / 2 + 2) add(affects, w.id, room.id);
      }
    }
  }
  return { affects, drives, kind, stageOf: id => STAGE_OF[kind.get(id)] || (kind.get(id) === 'level' ? 'level' : 'derived') };
}
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
const norm = a => { const l = Math.hypot(a.x, a.y) || 1; return { x: a.x / l, y: a.y / l }; };

/* etkilenen kümesi: değişenler + kısıt kenarları boyunca kapanış + etki kenarlarında `depth` adım.
 * Birleşen duvarlar iki adım (komşunun komşusu köşe kırpmasını etkiler). Sonuç belirlenimci sıralıdır
 * (aşama sırası, sonra kimlik). */
export function getAffectedElements(G, changedIds, { depth = 2 } = {}) {
  const out = new Set(), q = [];
  for (const id of changedIds || []) if (typeof id === 'string') { out.add(id); q.push([id, 0]); }
  while (q.length) {
    const [id, d] = q.shift();
    for (const n of G.drives.get(id) || []) if (!out.has(n)) { out.add(n); q.push([n, d]); }   // kısıtlar: sonuna kadar
    if (d < depth) for (const n of G.affects.get(id) || []) if (!out.has(n)) { out.add(n); q.push([n, d + 1]); }
  }
  const rank = id => STAGES.indexOf(G.stageOf(id));
  return [...out].sort((a, b) => rank(a) - rank(b) || (a < b ? -1 : a > b ? 1 : 0));
}

/* kısıt grafiğinde döngü (Tarjan SCC) → [[id…]…] (her biri en az 2 düğüm ya da öz-döngü) */
export function findCycles(G, nodes = null) {
  const idx = new Map(), low = new Map(), on = new Set(), st = [], out = []; let i = 0;
  const all = nodes ? [...nodes] : [...new Set([...G.drives.keys(), ...[...G.drives.values()].flatMap(s => [...s])])];
  const strong = v => {
    idx.set(v, i); low.set(v, i); i++; st.push(v); on.add(v);
    for (const w of G.drives.get(v) || []) {
      if (!idx.has(w)) { strong(w); low.set(v, Math.min(low.get(v), low.get(w))); }
      else if (on.has(w)) low.set(v, Math.min(low.get(v), idx.get(w)));
    }
    if (low.get(v) === idx.get(v)) {
      const c = []; let w; do { w = st.pop(); on.delete(w); c.push(w); } while (w !== v);
      if (c.length > 1 || G.drives.get(v)?.has(v)) out.push(c.sort());
    }
  };
  for (const v of all.sort()) if (!idx.has(v)) strong(v);
  return out;
}
/* kısıt sırası (topolojik, aşama + kimlik ile belirlenimci); döngü varsa { ok: false, cycles } */
export function constraintOrder(G, ids) {
  const set = new Set(ids), cycles = findCycles(G, set);
  if (cycles.length) return { ok: false, cycles };
  const indeg = new Map([...set].map(id => [id, 0]));
  for (const a of set) for (const b of G.drives.get(a) || []) if (set.has(b)) indeg.set(b, indeg.get(b) + 1);
  const rank = id => STAGES.indexOf(G.stageOf(id)), cmp = (a, b) => rank(a) - rank(b) || (a < b ? -1 : 1);
  const ready = [...set].filter(id => !indeg.get(id)).sort(cmp), order = [];
  while (ready.length) {
    const v = ready.shift(); order.push(v);
    for (const w of G.drives.get(v) || []) if (set.has(w)) { indeg.set(w, indeg.get(w) - 1); if (!indeg.get(w)) { ready.push(w); ready.sort(cmp); } }
  }
  return { ok: true, order };
}

/* ── değişiklik olayları: yama / fark adımlarından değişen kimlikler ── */
export function changedIdsOf(entry, root = null) {
  const ids = new Set(), levelIds = (root ? [root, ...(root.levels || [])] : []).map((L, i) => (i === 0 ? 'L0' : L?.id));
  const patch = entry?.patch || (entry?.kind === 'cmd' ? entry.patch : null);
  if (Array.isArray(patch)) for (const e of patch) {
    if (e.id) ids.add(e.id);
    if (e.coll === 'meta') { ids.add('meta'); if (e.key === 'bimTypes') { for (const t of [...(e.before || []), ...(e.after || [])]) if (t?.id) ids.add(`type:${t.id}`); } else ids.add('L0'); }
    if ((e.coll === 'level' || e.coll === 'levelMeta') && levelIds[e.lv]) ids.add(levelIds[e.lv]);
  }
  const ops = entry?.ops || (entry?.kind === 'diff' ? entry.ops : null);
  if (Array.isArray(ops)) for (const op of ops) {
    let lvl = 'L0';
    op.path.forEach((seg, i) => {
      if (typeof seg === 'object') { if (op.path[i - 1] === 'levels') lvl = seg.id; ids.add(seg.id); }
    });
    if (op.t === 'arr') { for (const id of [...Object.keys(op.removed || {}), ...Object.keys(op.added || {})]) ids.add(id); }
    const last = op.path.at(-1);
    if (op.path[0] === 'meta' || op.path.includes('meta') || (typeof last === 'string' && op.path.length <= 3 && ['slab', 'name', 'kind', 'slabComp'].includes(last))) ids.add(lvl);
    if (op.path.length === 0 || (op.path.length === 1 && op.path[0] !== 'levels')) ids.add('L0');
  }
  return [...ids].sort();
}
export const DEP_NODE_KINDS = Object.freeze(Object.keys(CLASSES));
