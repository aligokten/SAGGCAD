/* ═══ B4D — kalıcı proje sürümleri (adlandırılmış kayıt noktaları) ═══
 * İşlem geçmişinden (history.js — yalnız açık düzenleme oturumu, bellekte) AYRIDIR: sürümler IndexedDB'de kalıcıdır.
 *
 *   versions       meta veri (ad, not, tarih, karma, boyut, görsel karmaları) — liste yalnız bunu okur
 *   snapshots      { id, json } — belirlenimci (anahtarları sıralı) JSON; SHA-256 karması bu metnin karmasıdır
 *   versionAssets  { hash, blob, type, size } — görseller içerik karmasıyla bir kez saklanır (sürümler arası tekilleştirme)
 *
 * Anlık görüntü = proje kaydının TAMAMI (bilgiler, çizimler, katlar, BIM elemanları, kompozit/tür tanımları, revizyon
 * kararları, safhalar, metraj ayarları, yöntemler, fiyatlar, pafta/görünüş ayarları — hepsi çizim kökünde durur) +
 * görsel karmaları. Hariç: projenin `updatedAt` alanı (kaydetme zamanı, içerik değil) ve `_` önekli önbellek alanları.
 *
 * Geri yükleme
 *   kopya (varsayılan) → yeni proje kimliği; eleman / çizim kimlikleri proje kapsamında korunur; görsel kimlikleri
 *                        yenilenir ve tüm başvurular (altlık vb.) yeni kimliğe bağlanır; `restoredFrom` yazılır.
 *   üzerine            → önce ZORUNLU kurtarma sürümü ("Geri yükleme öncesi — tarih"); kurtarma sürümü kaydedilemezse
 *                        geri yükleme yapılmaz. Proje + görseller tek IndexedDB işleminde (atomik) yazılır: işlem yarıda
 *                        kalırsa veritabanı eski hâlinde kalır. Proje çapında geri yükleme Ctrl+Z ile geri ALINMAZ —
 *                        geri dönüş yolu kurtarma sürümüdür.
 */
import { uid, getProject, getBlob, txMulti, isQuota, remapIds, exportData } from './store.js';
import { compareDrawings } from './bim/diff.js';
import { quantityDiff, aggregate, costOf } from './bim/qtydiff.js';

export const APP_VERSION = '0.6.2-b4d';
export const SNAPSHOT_SCHEMA = 1;
export const KINDS = { manual: 'Elle kaydedildi', auto: 'Otomatik', recovery: 'Kurtarma noktası', import: 'İçe aktarıldı' };
export const STATUS = { ok: 'Sağlam', unchecked: 'Denetlenmedi', missing: 'Eksik görsel', corrupt: 'Bozuk (karma uyuşmuyor)', incomplete: 'Yarım kayıt', future: 'Daha yeni SAGGCAD sürümü' };
export const DEFAULT_VERSION_SETTINGS = Object.freeze({ auto: false, daily: true, beforeExport: true, onRevCode: true, maxAuto: 20, maxMB: 200 });
export const versionSettings = s => ({ ...DEFAULT_VERSION_SETTINGS, ...(s?.versions || {}) });

export class VersionError extends Error {
  constructor(code, message, extra = {}) { super(message); this.code = code; Object.assign(this, extra); }
}

/* ── belirlenimci JSON: nesne anahtarları sıralı, undefined / fonksiyon atlanır, `_` önekli önbellekler atlanır ── */
export function canonical(v) {
  if (v === null || typeof v !== 'object') {
    if (typeof v === 'number') return Number.isFinite(v) ? JSON.stringify(v) : 'null';
    return v === undefined || typeof v === 'function' ? 'null' : JSON.stringify(v);
  }
  if (Array.isArray(v)) return `[${v.map(x => (x === undefined || typeof x === 'function' ? 'null' : canonical(x))).join(',')}]`;
  const ks = Object.keys(v).filter(k => !k.startsWith('_') && v[k] !== undefined && typeof v[k] !== 'function').sort();
  return `{${ks.map(k => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`;
}

const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
export async function sha256(data) {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data instanceof ArrayBuffer || ArrayBuffer.isView(data) ? data : new Uint8Array(await data.arrayBuffer());
  return 'sha256:' + hex(await crypto.subtle.digest('SHA-256', bytes));
}
export const byteLen = s => new TextEncoder().encode(s).length;

/* anlık görüntü nesnesi (saf): proje + { görsel kimliği → içerik karması | null (eksik) } */
export function snapshotOf(project, assets = {}) {
  const { updatedAt, ...rest } = project;   // eslint-disable-line no-unused-vars
  return { schema: SNAPSHOT_SCHEMA, project: JSON.parse(canonical(rest)), assets: Object.fromEntries(Object.entries(assets).sort()) };
}
const statsOf = p => {
  let elements = 0, levels = 0;
  const count = P => ['walls', 'openings', 'rooms', 'items', 'rails', 'columns', 'beams', 'slabs', 'stairs', 'roofs'].reduce((s, k) => s + (Array.isArray(P?.[k]) ? P[k].length : 0), 0);
  for (const d of p.drawings || []) { elements += count(d.plan); for (const L of d.plan?.levels || []) { levels++; elements += count(L.plan || L); } }
  return { drawings: (p.drawings || []).length, photos: (p.photos || []).length, elements, levels };
};

/* ── sürüm kaydet ──
 * options: name, note, kind ('manual' | 'auto' | 'recovery' | 'import'), reason, important, project (bellekteki nesne;
 * verilmezse IndexedDB'deki kayıt okunur — çağıran önce bekleyen otomatik kaydı boşaltmalıdır), allowDuplicate */
export async function saveVersion(projectId, options = {}) {
  const p = options.project || await getProject(projectId);
  if (!p) throw new VersionError('no-project', 'Proje bulunamadı — sürüm kaydedilmedi');
  const assets = {}, assetRecs = new Map(), missing = [];
  for (const ph of p.photos || []) {
    const b = await getBlob(ph.id);
    if (!b) { assets[ph.id] = null; missing.push(ph.id); continue; }
    const hash = await sha256(b);
    assets[ph.id] = hash;
    assetRecs.set(hash, { hash, blob: b, type: b.type || '', size: b.size });
  }
  const json = canonical(snapshotOf(p, assets));
  const hash = await sha256(json);
  // aynı içerik + son sürüm: yalnız iki indeks okuması (sürüm sayısından bağımsız)
  const [dup, last] = await txMulti(['versions'], 'readonly', S => Promise.all([
    new Promise(res => { const r = S.versions.index('projectHash').get([projectId, hash]); r.onsuccess = () => res(r.result || null); r.onerror = () => res(null); }),
    new Promise(res => { const r = S.versions.index('projectId_createdAt').openCursor(IDBKeyRange.bound([projectId, -Infinity], [projectId, Infinity]), 'prev'); r.onsuccess = () => res(r.result?.value || null); r.onerror = () => res(null); }),
  ]));
  if (dup && !options.allowDuplicate) return { ok: false, duplicate: dup, hash };
  const kind = KINDS[options.kind] ? options.kind : 'manual';
  const now = Date.now();
  const meta = {
    id: uid('ver_'), projectId, projectName: p.name || '', name: (options.name || '').trim() || defaultName(kind, now), note: options.note || '',
    createdAt: Math.max(now, (last?.createdAt || 0) + 1),   // aynı milisaniyede iki sürüm: sıra yine kesin
    appVersion: APP_VERSION, schema: SNAPSHOT_SCHEMA, hash, size: byteLen(json), assetsSize: [...assetRecs.values()].reduce((s, a) => s + a.size, 0),
    assetHashes: [...assetRecs.keys()].sort(), assetSizes: Object.fromEntries([...assetRecs.values()].map(a => [a.hash, a.size])), assetRefs: assets, missingAssets: missing,
    kind, important: options.important ?? kind !== 'auto', reason: options.reason || '', stats: statsOf(p),
  };
  try {
    await txMulti(['versions', 'snapshots', 'versionAssets'], 'readwrite', S => {
      S.versions.put(meta); S.snapshots.put({ id: meta.id, json });
      for (const a of assetRecs.values()) S.versionAssets.count(a.hash).onsuccess = e => { if (!e.target.result) S.versionAssets.put(a); };
    });
  } catch (e) {
    if (isQuota(e)) throw new VersionError('quota', 'Depolama alanı dolu — sürüm kaydedilmedi. Eski otomatik sürümleri silip yeniden deneyin; projeniz değişmedi.', { cause: e });
    throw new VersionError('write', `Sürüm kaydedilemedi (${e?.name || e?.message || 'hata'}). Projeniz değişmedi.`, { cause: e });
  }
  return { ok: true, version: meta };
}
const pad = n => String(n).padStart(2, '0');
export const stamp = t => { const d = new Date(t); return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const defaultName = (kind, t) => kind === 'recovery' ? `Geri yükleme öncesi — ${stamp(t)}` : kind === 'auto' ? `Otomatik — ${stamp(t)}` : `Sürüm — ${stamp(t)}`;

/* ── liste: yalnız meta veri, yeniden eskiye ── */
export async function listVersions(projectId) {
  const out = await txMulti(['versions'], 'readonly', S => new Promise((res, rej) => {
    const r = S.versions.index('projectId_createdAt').getAll(IDBKeyRange.bound([projectId, -Infinity], [projectId, Infinity]));
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  }));
  return out.reverse();
}
export const getVersionMeta = id => txMulti(['versions'], 'readonly', S => new Promise(res => { const r = S.versions.get(id); r.onsuccess = () => res(r.result || null); }));
/* ad / not / önem değişikliği: anlık görüntü ve karma DEĞİŞMEZ */
export async function updateVersion(id, patch = {}) {
  return txMulti(['versions'], 'readwrite', S => new Promise((res, rej) => {
    const r = S.versions.get(id);
    r.onsuccess = () => {
      const m = r.result; if (!m) return rej(new VersionError('missing', 'Sürüm bulunamadı'));
      for (const k of ['name', 'note', 'important']) if (k in patch) m[k] = k === 'name' ? (String(patch.name).trim() || m.name) : patch[k];
      S.versions.put(m); res(m);
    };
  }));
}

/* ── yükle: anlık görüntü yalnız burada okunur; karma, şema ve bütünlük denetlenir ── */
export async function loadVersion(id, { verify = true } = {}) {
  const [meta, snap] = await txMulti(['versions', 'snapshots'], 'readonly', S => Promise.all([S.versions.get(id), S.snapshots.get(id)].map(r => new Promise(res => { r.onsuccess = () => res(r.result || null); r.onerror = () => res(null); }))));
  if (!meta) throw new VersionError('missing', 'Sürüm bulunamadı');
  if (!snap || typeof snap.json !== 'string') throw new VersionError('incomplete', `"${meta.name}" sürümünün içeriği eksik (yarım kalmış kayıt) — açılamaz`, { meta });
  if ((meta.schema || 0) > SNAPSHOT_SCHEMA) throw new VersionError('future', `"${meta.name}" daha yeni bir SAGGCAD sürümüyle (${meta.appVersion}) kaydedilmiş — bu sürümde açılamaz`, { meta });
  if (verify && await sha256(snap.json) !== meta.hash) throw new VersionError('corrupt', `"${meta.name}" sürümünün karması uyuşmuyor — içerik bozulmuş, kullanılmadı`, { meta });
  let snapshot;
  try { snapshot = JSON.parse(snap.json); } catch { throw new VersionError('corrupt', `"${meta.name}" sürümü okunamadı (bozuk JSON)`, { meta }); }
  if (!snapshot?.project?.drawings || (snapshot.schema || 0) > SNAPSHOT_SCHEMA) throw new VersionError(snapshot?.schema > SNAPSHOT_SCHEMA ? 'future' : 'corrupt', `"${meta.name}" geçerli bir proje anlık görüntüsü değil`, { meta });
  return { meta, snapshot, json: snap.json };
}

const getAsset = hash => txMulti(['versionAssets'], 'readonly', S => new Promise(res => { const r = S.versionAssets.get(hash); r.onsuccess = () => res(r.result || null); r.onerror = () => res(null); }));
/* bütünlük denetimi: karma, şema, görsel başvuruları (deep: görsel baytlarının karması da yeniden hesaplanır) */
export async function verifyVersion(id, { deep = false } = {}) {
  let v;
  try { v = await loadVersion(id); } catch (e) { return { status: STATUS[e.code] ? e.code : 'corrupt', problems: [e.message] }; }
  const problems = [];
  for (const [phId, hash] of Object.entries(v.snapshot.assets || {})) {
    const cap = v.snapshot.project.photos?.find(x => x.id === phId)?.caption || phId;
    if (!hash) { problems.push(`"${cap}" görseli sürüm kaydedilirken de eksikti`); continue; }
    const a = await getAsset(hash);
    if (!a?.blob) problems.push(`"${cap}" görseli (${hash.slice(7, 19)}…) depoda yok`);
    else if (deep && await sha256(a.blob) !== hash) problems.push(`"${cap}" görselinin içeriği bozulmuş`);
  }
  return { status: problems.length ? 'missing' : 'ok', problems, meta: v.meta };
}

/* ── sil: meta + içerik; hiçbir sürümün başvurmadığı görseller aynı işlemde temizlenir (başvuru sayımı indeksle) ── */
export async function deleteVersion(id) { return deleteVersions([id]); }
export async function deleteVersions(ids) {
  return txMulti(['versions', 'snapshots', 'versionAssets'], 'readwrite', S => new Promise(res => {
    let left = ids.length; const freed = new Set();
    if (!left) return res({ deleted: 0, freedAssets: 0 });
    for (const id of ids) {
      const g = S.versions.get(id);
      g.onsuccess = () => {
        const m = g.result;
        S.versions.delete(id); S.snapshots.delete(id);
        const hs = m?.assetHashes || [];
        let n = hs.length;
        const done = () => { if (--left === 0) res({ deleted: ids.length, freedAssets: freed.size }); };
        if (!n) return done();
        for (const h of hs) S.versions.index('assets').count(h).onsuccess = e => { if (!e.target.result) { S.versionAssets.delete(h); freed.add(h); } if (--n === 0) done(); };
      };
    }
  }));
}
export async function deleteProjectVersions(projectId) { return deleteVersions((await listVersions(projectId)).map(v => v.id)); }

/* ── depolama özeti (yalnız meta veriden): anlık görüntüler + tekil görseller (karma başına bir kez) ── */
export async function storageSummary(projectId) {
  const vs = projectId ? await listVersions(projectId) : await txMulti(['versions'], 'readonly', S => new Promise(res => { const r = S.versions.getAll(); r.onsuccess = () => res(r.result); }));
  const uniq = new Map();
  for (const v of vs) for (const [h, n] of Object.entries(v.assetSizes || {})) uniq.set(h, n);
  return { count: vs.length, autoCount: vs.filter(v => v.kind === 'auto').length, snapshots: vs.reduce((s, v) => s + (v.size || 0), 0),
    assetsReferenced: vs.reduce((s, v) => s + (v.assetsSize || 0), 0), assetsStored: [...uniq.values()].reduce((s, n) => s + n, 0), uniqueAssets: uniq.size };
}

/* ── otomatik sürümler: otomatik kayıttan (her değişiklik) ayrı; aynı karma tekrar kaydedilmez; sınır aşılınca yalnız
 * ESKİ OTOMATİK sürümler silinir — elle kaydedilen, kurtarma ve "önemli" işaretli sürümler asla silinmez ── */
export async function autoVersion(projectId, reason, settings, options = {}) {
  const cfg = versionSettings(settings);
  if (!cfg.auto) return { ok: false, skipped: 'off' };
  if (reason === 'daily' && !cfg.daily || reason === 'export' && !cfg.beforeExport || reason === 'revcode' && !cfg.onRevCode) return { ok: false, skipped: 'rule' };
  const names = { daily: 'Günlük otomatik', export: 'Pafta dışa aktarımı öncesi', revcode: `Revizyon kodu değişti${options.code ? ` → ${options.code}` : ''}` };
  const r = await saveVersion(projectId, { kind: 'auto', reason, important: false, name: `${names[reason] || 'Otomatik'} — ${stamp(Date.now())}`, project: options.project });
  if (r.ok) r.pruned = await pruneAuto(projectId, cfg);
  return r;
}
export async function dailyDue(projectId, now = Date.now()) {
  const day = t => new Date(t).toDateString();
  return !(await listVersions(projectId)).some(v => v.kind === 'auto' && v.reason === 'daily' && day(v.createdAt) === day(now));
}
export async function pruneAuto(projectId, cfg) {
  const vs = await listVersions(projectId);
  const autos = vs.filter(v => v.kind === 'auto' && !v.important).sort((a, b) => a.createdAt - b.createdAt);
  const drop = []; let bytes = autos.reduce((s, v) => s + v.size + (v.assetsSize || 0), 0);
  const maxB = (+cfg.maxMB || DEFAULT_VERSION_SETTINGS.maxMB) * 1048576, maxN = Math.max(1, +cfg.maxAuto || DEFAULT_VERSION_SETTINGS.maxAuto);
  for (const v of autos) { if (autos.length - drop.length <= maxN && bytes <= maxB) break; if (autos.length - drop.length <= 1) break; drop.push(v.id); bytes -= v.size + (v.assetsSize || 0); }
  if (drop.length) await deleteVersions(drop);
  return drop;
}

/* ── karşılaştırma: B4 compareDrawings + B4C quantityDiff (yeni motor yok) ──
 * a, b: 'current' (bellekteki güncel proje) | sürüm kimliği | { project } anlık görüntüsü */
const projOf = async (x, current) => x === 'current' ? { label: 'Güncel proje', project: current } : typeof x === 'string' ? (v => ({ label: v.meta.name, meta: v.meta, project: v.snapshot.project, assets: v.snapshot.assets }))(await loadVersion(x)) : { label: x.label || 'Anlık görüntü', project: x.project, assets: x.assets };
const INFO_KEYS = [['name', 'Proje adı'], ['client', 'Müşteri'], ['address', 'Adres'], ['note', 'Not']];
const TYPE_RE = /type|comp|kind/i, MAT_RE = /mat|floor|finish|ceil|skirt|tile|color|colour/i;
export async function compareVersions(a, b, { current = null } = {}) {
  const A = await projOf(a, current), B = await projOf(b, current);
  const PA = A.project, PB = B.project;
  const info = INFO_KEYS.filter(([k]) => (PA[k] || '') !== (PB[k] || '')).map(([k, t]) => ({ key: k, label: t, before: PA[k] || '', after: PB[k] || '' }));
  const da = new Map(PA.drawings.map(d => [d.id, d])), db = new Map(PB.drawings.map(d => [d.id, d]));
  const pairs = [], added = [], removed = [];
  for (const d of PA.drawings) if (db.has(d.id)) pairs.push([d, db.get(d.id)]); else removed.push(d);
  for (const d of PB.drawings) if (!da.has(d.id)) added.push(d);
  // kimlik tutmayan rölöveler (ör. ayrı projeden kopya) yine rölöve ↔ rölöve eşlenir
  const ra = removed.find(d => d.main), rb = added.find(d => d.main);
  if (ra && rb) { pairs.push([ra, rb]); removed.splice(removed.indexOf(ra), 1); added.splice(added.indexOf(rb), 1); }
  const drawings = pairs.map(([x, y]) => drawingDiff(x, y));
  const ph = (P, assets) => new Map((P.photos || []).map(p => [p.id, { ...p, hash: assets?.[p.id] }]));
  const pa = ph(PA, A.assets), pb = ph(PB, B.assets);
  const photos = { added: [...pb.values()].filter(p => !pa.has(p.id)), removed: [...pa.values()].filter(p => !pb.has(p.id)), changed: [...pb.values()].filter(p => pa.has(p.id) && (pa.get(p.id).caption !== p.caption || (p.hash && pa.get(p.id).hash && pa.get(p.id).hash !== p.hash))) };
  return {
    a: { label: A.label, meta: A.meta || null }, b: { label: B.label, meta: B.meta || null }, info, drawings,
    addedDrawings: added.map(d => ({ id: d.id, name: d.name, kind: d.kind })), removedDrawings: removed.map(d => ({ id: d.id, name: d.name, kind: d.kind })), photos,
    comparable: drawings.length > 0,
    identical: !info.length && !added.length && !removed.length && drawings.every(d => d.identical) && !photos.added.length && !photos.removed.length && !photos.changed.length,
  };
}
function drawingDiff(x, y) {
  // sürümler arası fark iki KAYITLI durumun farkıdır: tadilat kararları (rölöve → proje) uygulanmaz, bu yüzden
  // söküm / yeni imalat "onay bekleyen" sütunlarına düşer; yalnız net fark kesin ölçümdür
  const C = compareDrawings(x.plan, y.plan, { revision: null });
  const Q = quantityDiff(x.plan, y.plan, { compare: C, revision: null });
  const agg = aggregate(Q.lines, { groupBy: 'category' });
  const changed = C.entries.filter(e => e.status !== 'unchanged');
  const keyCount = {};
  for (const e of changed) for (const c of e.changes || []) keyCount[c.key] = (keyCount[c.key] || 0) + 1;
  const pa = x.plan?.meta?.revision?.qty?.prices || {}, pb = y.plan?.meta?.revision?.qty?.prices || {};
  const priceChanges = [...new Set([...Object.keys(pa), ...Object.keys(pb)])].filter(k => pa[k] !== pb[k]).sort().map(k => ({ key: k, before: pa[k] ?? null, after: pb[k] ?? null }));
  const rows = agg.rows.filter(r => Math.abs(r.net) > 1e-9 || r.demolishPending || r.buildPending || r.unknown);
  const costA = rows.reduce((s, r) => s + costOf({ ...r, build: r.buildPending, demolish: r.demolishPending }, pa).amount, 0);
  const costB = rows.reduce((s, r) => s + costOf({ ...r, build: r.buildPending, demolish: r.demolishPending }, pb).amount, 0);
  const missingPrice = rows.some(r => costOf({ ...r, build: r.buildPending, demolish: r.demolishPending }, pb).missing);
  return {
    a: { id: x.id, name: x.name, kind: x.main ? 'rolove' : x.kind }, b: { id: y.id, name: y.name, kind: y.main ? 'rolove' : y.kind },
    summary: C.summary.total, levelChanges: C.summary.levelChanges, rooms: C.summary.total.rooms,
    counts: { added: C.entries.filter(e => e.status === 'added').length, removed: C.entries.filter(e => e.status === 'removed').length, geometry: C.entries.filter(e => e.status === 'geometry').length, params: C.entries.filter(e => e.status === 'params').length, uncertain: C.entries.filter(e => e.status === 'uncertain').length },
    typeChanges: Object.entries(keyCount).filter(([k]) => TYPE_RE.test(k)).map(([k, n]) => ({ key: k, n })),
    materialChanges: Object.entries(keyCount).filter(([k]) => MAT_RE.test(k) && !TYPE_RE.test(k)).map(([k, n]) => ({ key: k, n })),
    paramKeys: keyCount,
    qty: { rows, groups: agg.groups.map(g => ({ title: g.title, totals: g.totals })), pending: Q.pending.length, issues: Q.issues },
    prices: { changes: priceChanges, costA, costB, missing: missingPrice, currency: y.plan?.meta?.revision?.qty?.currency || 'TRY' },
    identical: !changed.length && !C.summary.levelChanges.length && !priceChanges.length && canonical(x.plan) === canonical(y.plan),
    entries: changed.map(e => ({ level: e.level, kind: e.kind, id: e.id, name: e.name, status: e.status, keys: (e.changes || []).map(c => c.key) })),
  };
}

/* ── geri yükleme ── */
const photoIdsOf = P => (P.photos || []).map(x => x.id);
/* sürümün görselleri: { görsel kimliği → { hash, blob } }; eksik olanlar ayrıca listelenir */
async function assetsOf(snapshot) {
  const out = new Map(), missing = [];
  for (const [id, hash] of Object.entries(snapshot.assets || {})) {
    const a = hash ? await getAsset(hash) : null;
    if (a?.blob) out.set(id, a); else missing.push(snapshot.project.photos?.find(p => p.id === id)?.caption || id);
  }
  return { assets: out, missing };
}
/* options: mode 'copy' (varsayılan) | 'overwrite'; overwrite için confirm: true ZORUNLU; allowMissing: eksik görselle sürdür;
 * name (kopya adı); onRecovery(meta) — kurtarma sürümü yazıldıktan sonra */
export async function restoreVersion(versionId, options = {}) {
  const mode = options.mode === 'overwrite' ? 'overwrite' : 'copy';
  const v = await loadVersion(versionId);
  const { assets, missing } = await assetsOf(v.snapshot);
  if (missing.length && !options.allowMissing) throw new VersionError('missing-assets', `Sürümdeki ${missing.length} görsel depoda yok: ${missing.join(', ')}`, { missing });
  const P = JSON.parse(JSON.stringify(v.snapshot.project));
  const now = Date.now();
  const restoredFrom = { versionId: v.meta.id, versionName: v.meta.name, projectId: v.meta.projectId, hash: v.meta.hash, createdAt: v.meta.createdAt, at: now, mode };
  if (mode === 'copy') {
    const map = Object.fromEntries(photoIdsOf(P).map(id => [id, uid('ph')]));
    const p = remapIds(P, map);
    p.id = uid('pr'); p.name = (options.name || '').trim() || `${P.name} — ${v.meta.name}`; p.createdAt = now; p.updatedAt = now; p.restoredFrom = restoredFrom;
    p.photos = (p.photos || []).filter(ph => assets.has(Object.keys(map).find(k => map[k] === ph.id)) || options.allowMissing);
    await writeRestore(p, Object.entries(map).filter(([o]) => assets.has(o)).map(([o, n]) => [n, assets.get(o).blob]), []);
    return { mode, project: p, photoMap: map, missing };
  }
  if (options.confirm !== true) throw new VersionError('confirm', 'Üzerine geri yükleme açık onay ister');
  const targetId = options.projectId || v.meta.projectId;
  const cur = await getProject(targetId);
  if (!cur) throw new VersionError('no-project', 'Üzerine yazılacak proje bulunamadı — kopya olarak geri yükleyin');
  // 1) zorunlu kurtarma sürümü — kaydedilemezse geri yükleme YAPILMAZ
  let recovery;
  try {
    const r = await saveVersion(targetId, { kind: 'recovery', important: true, name: `Geri yükleme öncesi — ${stamp(now)}`, note: `"${v.meta.name}" sürümü üzerine geri yüklenmeden önce otomatik alındı`, allowDuplicate: false });
    recovery = r.ok ? r.version : r.duplicate;   // aynı içerik zaten kayıtlıysa o sürüm kurtarma noktasıdır
  } catch (e) {
    throw new VersionError('recovery-failed', `Kurtarma sürümü kaydedilemediği için geri yükleme yapılmadı: ${e.message}`, { cause: e });
  }
  options.onRecovery?.(recovery);
  // 2) görsel kimlikleri: bu projenin olmayan bir görselin üzerine asla yazılmaz (gerekirse yeni kimlik)
  const own = new Set(photoIdsOf(cur)), map = {};
  for (const id of photoIdsOf(P)) if (!own.has(id) && await getBlob(id)) map[id] = uid('ph');
  const p = remapIds(P, map);
  p.id = targetId; p.createdAt = cur.createdAt ?? P.createdAt; p.updatedAt = now; p.restoredFrom = restoredFrom;
  const keep = new Set(photoIdsOf(p));
  const writes = Object.keys(v.snapshot.assets || {}).filter(id => assets.has(id)).map(id => [map[id] || id, assets.get(id).blob]);
  // eski görseller: kurtarma sürümünde kopyaları var → aynı işlemde temizlenir
  await writeRestore(p, writes, [...own].filter(id => !keep.has(id)));
  return { mode, project: p, recovery, photoMap: map, missing };
}
async function writeRestore(p, blobs, drop) {
  try {
    await txMulti(['projects', 'blobs'], 'readwrite', S => { for (const [id, b] of blobs) S.blobs.put(b, id); for (const id of drop) S.blobs.delete(id); S.projects.put(JSON.parse(JSON.stringify(p))); });
  } catch (e) {
    if (isQuota(e)) throw new VersionError('quota', 'Depolama alanı dolu — geri yükleme yapılmadı, proje değişmedi', { cause: e });
    throw new VersionError('write', `Geri yükleme yazılamadı (${e?.name || e?.message}); proje değişmedi`, { cause: e });
  }
}

/* ── dışa aktarma: .saggcad.json biçimi (format 'saggcad', version 1) korunur; sürümler isteğe bağlı ek alanlardır.
 * Eski SAGGCAD sürümleri bilmedikleri `versions` / `versionAssets` alanlarını yok sayar. ── */
const toDataUrl = b => new Promise(r => { const f = new FileReader(); f.onload = () => r(f.result); f.readAsDataURL(b); });
export async function exportWithVersions(p, versionIds = []) {
  const d = await exportData(p);
  if (!versionIds.length) return d;
  d.versions = []; d.versionAssets = {};
  for (const id of versionIds) {
    const v = await loadVersion(id);   // bozuk sürüm dışa aktarılmaz (hata fırlatır)
    d.versions.push({ meta: v.meta, json: v.json });
    for (const h of v.meta.assetHashes || []) if (!d.versionAssets[h]) { const a = await getAsset(h); if (!a?.blob) throw new VersionError('missing-assets', `"${v.meta.name}" sürümünün bir görseli depoda yok — dışa aktarılamadı`); d.versionAssets[h] = await toDataUrl(a.blob); }
  }
  return d;
}

/* içe aktarılan dosyadaki sürümleri doğrula ve yeni proje kimliğine bağla; bozuklar atlanır ve raporlanır */
export async function importVersions(d, projectId) {
  const ok = [], bad = [], recs = [], assets = new Map();
  const existing = new Set((await listVersions(projectId)).map(v => v.hash));
  for (const item of Array.isArray(d.versions) ? d.versions : []) {
    const m = item?.meta, name = m?.name || '(adsız)';
    try {
      if (!m || typeof item.json !== 'string' || !m.hash) throw new Error('eksik alan');
      if ((m.schema || 0) > SNAPSHOT_SCHEMA) throw new Error(`daha yeni SAGGCAD sürümü (${m.appVersion || '?'})`);
      if (await sha256(item.json) !== m.hash) throw new Error('karma uyuşmuyor');
      const snap = JSON.parse(item.json);
      if (!snap?.project?.drawings) throw new Error('proje içeriği yok');
      for (const h of m.assetHashes || []) {
        if (assets.has(h)) continue;
        const url = d.versionAssets?.[h]; if (!url) throw new Error('görsel eksik');
        const blob = await (await fetch(url)).blob();
        if (await sha256(blob) !== h) throw new Error('görsel karması uyuşmuyor');
        assets.set(h, { hash: h, blob, type: blob.type || '', size: blob.size });
      }
      if (existing.has(m.hash)) { bad.push({ name, reason: 'aynı içerik zaten kayıtlı (atlandı)' }); continue; }
      existing.add(m.hash);
      const meta = { ...m, id: uid('ver_'), projectId, importedFrom: { id: m.id, projectId: m.projectId }, importedAt: Date.now() };
      recs.push({ meta, json: item.json }); ok.push(meta);
    } catch (e) { bad.push({ name, reason: e.message }); }
  }
  if (recs.length) {
    try {
      await txMulti(['versions', 'snapshots', 'versionAssets'], 'readwrite', S => {
        for (const r of recs) { S.versions.put(r.meta); S.snapshots.put({ id: r.meta.id, json: r.json }); }
        for (const a of assets.values()) S.versionAssets.count(a.hash).onsuccess = e => { if (!e.target.result) S.versionAssets.put(a); };
      });
    } catch (e) {
      if (isQuota(e)) throw new VersionError('quota', 'Depolama alanı dolu — sürümler içe aktarılamadı (proje aktarıldı)', { cause: e });
      throw e;
    }
  }
  return { imported: ok, rejected: bad };
}
