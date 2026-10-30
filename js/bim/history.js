/* ═══ BIM çekirdeği — merkezi işlem günlüğü (B3-A) ═══
 * Çizim başına TEK geri al / yinele günlüğü. Kat başına yığınların yerini alır: kat değişince geçmiş kaybolmaz, bir işlem
 * farklı katlardaki elemanları değiştirse de tek Ctrl+Z hepsini geri alır, kat ekleme / silme de geri alınır.
 *
 * Kayıt türleri (bir kayıt = bir kullanıcı eylemi):
 *   • diff — eski düzenleme yolları: eylem başında kökün temel kopyası alınır (open), eylem bitince (close) temel ile güncel
 *     kök arasındaki yapısal fark kaydedilir. Fark kimlikli dizilerde (duvar, açıklık, kat …) kimlikle eşlenir; yalnız
 *     değişen alanlar ve eklenen / kaldırılan kayıtlar saklanır (bellek dostu, anahtar sırası korunur).
 *   • cmd — BIM komutlarının (commands.js) alan düzeyindeki yaması.
 * Uygulama atomiktir: bir adım başarısız olursa o kayıttaki tüm adımlar geri sarılır ve hata fırlatılır; kök değişmez.
 * Kök nesne yerinde güncellenir (kimliği değişmez). Kayıt biçimi (.saggcad.json) değişmez; günlük kalıcı değildir.
 */
import { applyPatch } from './commands.js';

const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const clone = v => v === undefined ? undefined : JSON.parse(JSON.stringify(v));
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
/* kimlikli dizi: her eleman nesne ve benzersiz string id */
function idArray(a) {
  if (!Array.isArray(a)) return false;
  const s = new Set();
  for (const x of a) { if (!isObj(x) || typeof x.id !== 'string' || s.has(x.id)) return false; s.add(x.id); }
  return true;
}
function equal(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') return Number.isNaN(a) && Number.isNaN(b);
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) { if (a.length !== b.length) return false; for (let i = 0; i < a.length; i++) if (!equal(a[i], b[i])) return false; return true; }
  const ka = Object.keys(a), kb = Object.keys(b); if (ka.length !== kb.length) return false;
  for (let i = 0; i < ka.length; i++) { const k = ka[i]; if (!has(b, k) || !equal(a[k], b[k])) return false; }
  // anahtar sırası farkı da fark sayılır (geri alınan kayıt JSON olarak birebir olsun)
  return ka.every((k, i) => kb[i] === k);
}

/* ── yapısal fark: a → b ── op: { t: 'set', path, had, before, has, after, order? } | { t: 'arr', path, beforeIds, afterIds, removed, added } */
export function diffState(a, b, path = [], ops = []) {
  if (isObj(a) && isObj(b)) {
    const ka = Object.keys(a), kb = Object.keys(b);
    const orderChanged = ka.filter(k => has(b, k)).join('\u0001') !== kb.filter(k => has(a, k)).join('\u0001');
    if (orderChanged) { ops.push(setOp(path, a, b)); return ops; }   // ortak anahtar sırası değişti: nesne bütün olarak
    for (const k of ka) if (!has(b, k)) ops.push({ t: 'set', path: [...path, k], had: true, before: clone(a[k]), has: false, order: ka });
    for (const k of ka) if (has(b, k) && !equal(a[k], b[k])) diffChild(a[k], b[k], [...path, k], ops);
    for (const k of kb) if (!has(a, k)) ops.push({ t: 'set', path: [...path, k], had: false, has: true, after: clone(b[k]), orderAfter: kb });
    return ops;
  }
  ops.push(setOp(path, a, b));
  return ops;
}
function setOp(path, a, b) { return { t: 'set', path, had: true, before: clone(a), has: true, after: clone(b) }; }
function diffChild(a, b, path, ops) {
  if (isObj(a) && isObj(b)) return diffState(a, b, path, ops);
  if (idArray(a) && idArray(b) && (a.length || b.length)) {
    const ia = a.map(x => x.id), ib = b.map(x => x.id), sa = new Set(ia), sb = new Set(ib);
    const removed = {}, added = {};
    for (const x of a) if (!sb.has(x.id)) removed[x.id] = clone(x);
    for (const x of b) if (!sa.has(x.id)) added[x.id] = clone(x);
    const common = ia.filter(id => sb.has(id)), commonB = ib.filter(id => sa.has(id));
    if (Object.keys(removed).length || Object.keys(added).length || common.join('\u0001') !== commonB.join('\u0001'))
      ops.push({ t: 'arr', path, beforeIds: ia, afterIds: ib, removed, added });
    const mb = new Map(b.map(x => [x.id, x]));
    for (const x of a) if (sb.has(x.id) && !equal(x, mb.get(x.id))) diffState(x, mb.get(x.id), [...path, { id: x.id }], ops);
    return ops;
  }
  ops.push(setOp(path, a, b));
  return ops;
}

/* yol çözümü: string anahtar (nesne) | { id } (kimlikli dizi) */
function resolve(root, path) {
  let o = root;
  for (const seg of path) {
    if (o == null) return undefined;
    o = typeof seg === 'object' ? (Array.isArray(o) ? o.find(x => x && x.id === seg.id) : undefined) : o[seg];
  }
  return o;
}
const failPath = path => { throw new Error(`Geçmiş yolu bulunamadı: ${path.map(s => typeof s === 'object' ? `#${s.id}` : s).join('.')}`); };
/* silinmiş anahtarı özgün sırasıyla geri koy */
function putKey(o, k, v, order) {
  if (!order || has(o, k) || !order.includes(k)) { o[k] = v; return; }
  const cur = Object.entries(o); for (const [q] of cur) delete o[q];
  const m = new Map(cur); m.set(k, v);
  for (const q of order) if (m.has(q)) { o[q] = m.get(q); m.delete(q); }
  for (const [q, x] of m) o[q] = x;
}
/* tek adımı uygula; geri sarma için önceki durumu döndür */
function applyOp(root, op, dir) {
  if (op.t === 'set') {
    if (!op.path.length) {   // kök: içerik yerinde değiştirilir
      const v = clone(dir === 'undo' ? op.before : op.after), prev = clone(root);
      for (const k of Object.keys(root)) delete root[k]; Object.assign(root, v);
      return () => { for (const k of Object.keys(root)) delete root[k]; Object.assign(root, prev); };
    }
    const parent = resolve(root, op.path.slice(0, -1)), k = op.path.at(-1);
    if (parent == null || typeof parent !== 'object' || typeof k === 'object') failPath(op.path);
    const [h, v] = dir === 'undo' ? [op.had, op.before] : [op.has, op.after], prevHad = has(parent, k), prev = parent[k], prevOrder = Object.keys(parent);
    if (h) putKey(parent, k, clone(v), dir === 'undo' ? op.order : op.orderAfter); else delete parent[k];
    return () => { if (prevHad) putKey(parent, k, prev, prevOrder); else delete parent[k]; };
  }
  if (op.t === 'arr') {
    const arr = resolve(root, op.path); if (!Array.isArray(arr)) failPath(op.path);
    const prev = arr.slice(), m = new Map(arr.filter(x => x && typeof x.id === 'string').map(x => [x.id, x]));
    const [ids, extra] = dir === 'undo' ? [op.beforeIds, op.removed] : [op.afterIds, op.added];
    const next = ids.map(id => m.get(id) ?? (extra[id] !== undefined ? clone(extra[id]) : failPath([...op.path, { id }])));
    arr.length = 0; arr.push(...next);
    return () => { arr.length = 0; arr.push(...prev); };
  }
  throw new Error('Bilinmeyen geçmiş adımı');
}
/* adım listesini atomik uygula */
export function applyOps(root, ops, dir = 'redo') {
  const list = dir === 'undo' ? [...ops].reverse() : ops, undoers = [];
  try { for (const op of list) undoers.push(applyOp(root, op, dir)); }
  catch (e) { for (const u of undoers.reverse()) u(); throw e; }
  return root;
}

/* ── günlük ── */
export class History {
  constructor(getRoot, { limit = 200, onRecord = null } = {}) {
    this.getRoot = getRoot; this.limit = limit; this.onRecord = onRecord;   // onRecord(entry, 'do' | 'undo' | 'redo'): değişiklik olayı
    this.undo = []; this.redo = []; this.base = null; this.baseLabel = ''; this.rev = 0;
  }
  /* eski yol eylemi başlıyor: açık eylem varsa kapanır; yeni temel kopya alınır */
  open(label = 'Düzenleme') { this.close(); this.base = clone(this.getRoot()); this.baseLabel = label; }
  /* açık eylemi kapat: fark varsa kayıt olur */
  close() {
    if (!this.base) return null;
    const ops = diffState(this.base, this.getRoot()); this.base = null;
    if (!ops.length) return null;
    return this.push({ kind: 'diff', ops, label: this.baseLabel });
  }
  /* açık eylemi iptal et: kök temele döner */
  abort() {
    if (!this.base) return false;
    const ops = diffState(this.base, this.getRoot()); this.base = null;
    if (ops.length) applyOps(this.getRoot(), ops, 'undo');
    return ops.length > 0;
  }
  /* BIM komut yaması (commands.js) */
  record(patch, label) { this.close(); if (Array.isArray(patch) && patch.length) return this.push({ kind: 'cmd', patch, label }); return null; }
  push(e) { e.t = Date.now(); this.undo.push(e); if (this.undo.length > this.limit) this.undo.shift(); this.redo = []; this.rev++; this.onRecord?.(e, 'do'); return e; }
  canUndo() { return this.undo.length > 0 || (!!this.base && diffState(this.base, this.getRoot()).length > 0); }
  canRedo() { return this.redo.length > 0; }
  step(dir) {
    this.close();
    const from = dir === 'undo' ? this.undo : this.redo, to = dir === 'undo' ? this.redo : this.undo;
    const e = from.at(-1); if (!e) return null;
    const root = this.getRoot();
    if (e.kind === 'cmd') applyPatch(root, e.patch, dir); else applyOps(root, e.ops, dir);   // hata: fırlatır, kök değişmez
    from.pop(); to.push(e); this.rev++; this.onRecord?.(e, dir);
    return e;
  }
  clear() { this.undo = []; this.redo = []; this.base = null; this.rev++; }
  stats() { return { undo: this.undo.length, redo: this.redo.length, open: !!this.base, labels: this.undo.slice(-5).map(e => e.label) }; }
}
