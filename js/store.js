/* SAGGCAD yerel depo: projeler, çizimler ve görseller tarayıcının IndexedDB'sinde tutulur.
 * Sunucu / hesap gerekmez; Projeler ekranından JSON yedek alınıp başka cihaza taşınabilir.
 * Görseller (kroki fotoğrafı, altlık, render) ayrı bir depoda blob olarak saklanır.
 */
import { DEFAULT_SETTINGS } from './catalog.js';

export const uid = (p = '') => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const clone = o => JSON.parse(JSON.stringify(o));

/* IndexedDB sürümü 2 (B4D): yalnız EKLEME yapan yükseltme — v1 depoları (projects, blobs, kv) olduğu gibi kalır.
 *   versions       sürüm meta verisi (anlık görüntü YOK; liste hızlı): indeksler projectId, projectId_createdAt, assets (multiEntry), projectHash (aynı içerik denetimi)
 *   snapshots      sürüm içeriği { id (= sürüm kimliği), json } — yalnız önizleme / karşılaştırma / geri yüklemede okunur
 *   versionAssets  görseller, içerik SHA-256'sıyla { hash, blob, type, size } — sürümler arasında tekilleştirilir
 * Yükseltme işlemi atomiktir: başarısız olursa IndexedDB v1 verisini aynen korur ve açılış hatası bildirilir. */
const DB_NAME = 'saggcad', DB_VER = 2;
let dbp = null;
export const DB_INFO = { name: DB_NAME, version: DB_VER };
function db() {
  return dbp ||= new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, DB_VER);
    r.onupgradeneeded = () => {
      const d = r.result;
      if (!d.objectStoreNames.contains('projects')) d.createObjectStore('projects', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('blobs')) d.createObjectStore('blobs');
      if (!d.objectStoreNames.contains('kv')) d.createObjectStore('kv');
      if (!d.objectStoreNames.contains('versions')) {
        const v = d.createObjectStore('versions', { keyPath: 'id' });
        v.createIndex('projectId', 'projectId'); v.createIndex('projectId_createdAt', ['projectId', 'createdAt']); v.createIndex('assets', 'assetHashes', { multiEntry: true }); v.createIndex('projectHash', ['projectId', 'hash']);
      }
      if (!d.objectStoreNames.contains('snapshots')) d.createObjectStore('snapshots', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('versionAssets')) d.createObjectStore('versionAssets', { keyPath: 'hash' });
    };
    r.onblocked = () => { dbp = null; rej(Object.assign(new Error('Veritabanı yükseltmesi başka bir SAGGCAD sekmesi açık olduğu için bekliyor — diğer sekmeleri kapatıp yeniden deneyin'), { code: 'blocked' })); };
    r.onsuccess = () => { const d = r.result; d.onversionchange = () => { d.close(); dbp = null; }; res(d); };
    r.onerror = () => { dbp = null; rej(Object.assign(new Error(`Yerel veritabanı açılamadı (${r.error?.name || 'hata'}). Verileriniz silinmedi.`), { code: 'open', cause: r.error })); };
  });
}
export { db as openDb };
/* çok depolu tek işlem (atomik): fn(stores) yalnız IDB istekleri kullanmalı (araya başka await girerse işlem kendiliğinden kapanır) */
export async function txMulti(names, mode, fn) {
  const d = await db();
  return new Promise((res, rej) => {
    let t;
    try { t = d.transaction(names, mode); } catch (e) { rej(e); return; }
    const S = Object.fromEntries(names.map(n => [n, t.objectStore(n)]));
    let out, err = null;
    try { Promise.resolve(fn(S, t)).then(v => { out = v; }, e => { err = e; try { t.abort(); } catch { /* kapanmış */ } }); } catch (e) { err = e; try { t.abort(); } catch { /* kapanmış */ } }
    t.oncomplete = () => err ? rej(err) : res(out);
    t.onerror = e => { e.preventDefault?.(); };
    t.onabort = () => rej(err || t.error || new Error('İşlem iptal edildi'));
  });
}
export const isQuota = e => !!e && (e.name === 'QuotaExceededError' || e.code === 22 || /quota/i.test(e.message || '') || isQuota(e.cause));
async function tx(store, mode, fn) {
  const d = await db();
  return new Promise((res, rej) => {
    const t = d.transaction(store, mode), s = t.objectStore(store);
    let out;
    Promise.resolve(fn(s)).then(v => { out = v; });
    t.oncomplete = () => res(out);
    t.onerror = t.onabort = () => rej(t.error);
  });
}
const req = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

/* ── projeler ── */
// plan-geom.js uid için bu dosyayı içe aktardığından boş plan dışarıdan verilir (döngüsel içe aktarma olmasın)
export function newProject(name, plan) {
  const now = Date.now();
  return {
    id: uid('pr'), name, client: '', address: '', note: '', createdAt: now, updatedAt: now,
    // ilk çizim rölövedir (mevcut durum); proje / tasarım çizimleri genellikle onun kopyasından başlar
    drawings: [{ id: uid('dw'), name: 'Rölöve (mevcut durum)', kind: 'rolove', main: true, plan, createdAt: now, updatedAt: now }],
    photos: [],
  };
}

export const listProjects = () => tx('projects', 'readonly', s => req(s.getAll()))
  .then(a => a.sort((x, y) => y.updatedAt - x.updatedAt));
export const getProject = id => tx('projects', 'readonly', s => req(s.get(id)));
/* B4D: "emekli" proje nesneleri (üzerine geri yükleme sonrası eski editörün nesnesi) kaydedilemez — gecikmeli otomatik
 * kayıt geri yüklenen projeyi ezemez */
const retired = new WeakSet();
export const retireProject = p => { if (p && typeof p === 'object') retired.add(p); };
export const isRetired = p => retired.has(p);
export const unretireProject = p => retired.delete(p);
export const saveProject = p => {
  if (retired.has(p)) return Promise.reject(Object.assign(new Error('Bu proje nesnesi geri yükleme sonrası geçersiz — eski veri kaydedilmedi'), { code: 'retired' }));
  p.updatedAt = Date.now(); return tx('projects', 'readwrite', s => req(s.put(clone(p))));
};
/* proje silme: proje + görselleri tek işlemde. Sürümler ayrı silinir (versions.deleteProjectVersions) — sürüm
 * görselleri versionAssets deposunda kendi kopyalarıyla durduğundan proje görsellerinin silinmesi onları etkilemez. */
export async function deleteProject(p) {
  return txMulti(['projects', 'blobs'], 'readwrite', S => { (p.photos || []).forEach(ph => S.blobs.delete(ph.id)); S.projects.delete(p.id); });
}

/* ── görseller ── */
export const putBlob = (id, blob) => tx('blobs', 'readwrite', s => req(s.put(blob, id)));
export const getBlob = id => tx('blobs', 'readonly', s => req(s.get(id)));
const urls = new Map();
export async function blobUrl(id) {
  if (urls.has(id)) return urls.get(id);
  const b = await getBlob(id); if (!b) return '';
  const u = URL.createObjectURL(b); urls.set(id, u); return u;
}

/* fotoğrafları yüklemeden önce küçült (altlık için 2048 px yeterli) */
export async function compressImage(file, max = 2048, q = 0.85) {
  if (!file.type.startsWith('image/') || file.type === 'image/svg+xml') return { blob: file, w: 0, h: 0 };
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const s = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width * s), h = Math.round(bmp.height * s);
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    c.getContext('2d').drawImage(bmp, 0, 0, w, h);
    const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', q));
    return { blob: blob || file, w, h };
  } catch { return { blob: file, w: 0, h: 0 }; }
}

/* ── ayarlar (firma bilgisi, doğrama boşluğu, CNC levha ayarları…) ── */
export async function loadSettings() {
  const s = await tx('kv', 'readonly', st => req(st.get('settings')));
  return { ...clone(DEFAULT_SETTINGS), ...(s || {}), company: { ...DEFAULT_SETTINGS.company, ...(s?.company || {}) } };
}
export const saveSettings = s => tx('kv', 'readwrite', st => req(st.put(clone(s), 'settings')));

/* ── yedek: proje + görselleri tek JSON dosyasında ── */
const toDataUrl = b => new Promise(r => { const f = new FileReader(); f.onload = () => r(f.result); f.readAsDataURL(b); });
export const FILE_VERSION = 1;   // .saggcad.json biçimi; B4D sürümleri isteğe bağlı EK alanlardır (versions, versionAssets)
export async function exportData(p) {
  const blobs = {};
  for (const ph of p.photos || []) { const b = await getBlob(ph.id); if (b) blobs[ph.id] = await toDataUrl(b); }
  return { format: 'saggcad', version: FILE_VERSION, project: p, blobs };
}
export const dataBlob = d => new Blob([JSON.stringify(d)], { type: 'application/json' });
export async function exportProject(p) { return dataBlob(await exportData(p)); }

/* B4D: kimlik eşlemesi — nesne ağacında DEĞERİ tam olarak eski kimlik olan dizgileri yenisiyle değiştirir (görsel
 * kimlikleri: altlık başvuruları vb.). Yalnız verilen eşlemeyi uygular; eleman kimliklerine dokunmaz. */
export function remapIds(o, map) {
  if (!map || !Object.keys(map).length) return o;
  const walk = v => typeof v === 'string' ? (Object.hasOwn(map, v) ? map[v] : v) : Array.isArray(v) ? v.map(walk) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)])) : v;
  return walk(o);
}
/* dosyayı çözümle ve doğrula (yazmaz) */
export function parseProjectFile(text) {
  let d;
  try { d = JSON.parse(text); } catch { throw new Error('Dosya okunamadı — geçerli JSON değil (bozuk ya da yarım indirilmiş olabilir)'); }
  if (d?.format !== 'saggcad' || !d.project?.drawings || !Array.isArray(d.project.drawings)) throw new Error('Geçerli bir SAGGCAD proje dosyası değil');
  if ((+d.version || 1) > FILE_VERSION) throw new Error(`Bu dosya daha yeni bir SAGGCAD sürümüyle kaydedilmiş (dosya biçimi ${d.version}); önce uygulamayı güncelleyin`);
  return d;
}
/* içe aktarma: aynı proje kimliği varsa ASLA üzerine yazılmaz (yeni kimlikli kopya); başka bir projeye ait görsel
 * kimliği çakışırsa görsele yeni kimlik verilir ve başvurular güncellenir. Eleman / çizim kimlikleri değişmez. */
export async function importProject(text, { parsed = null } = {}) {
  const d = parsed || parseProjectFile(text);
  let p = d.project;
  const exists = await getProject(p.id);
  const originalId = p.id;
  if (exists) p.id = uid('pr');
  const map = {};
  for (const id of Object.keys(d.blobs || {})) if (await getBlob(id)) map[id] = uid('ph');
  if (Object.keys(map).length) { const id = p.id; p = remapIds(p, map); p.id = id; }
  const blobs = [];
  for (const [id, url] of Object.entries(d.blobs || {})) blobs.push([map[id] || id, await (await fetch(url)).blob()]);
  p.updatedAt = Date.now();
  // proje + görseller tek işlemde: yarıda kalırsa hiçbir şey yazılmaz
  await txMulti(['projects', 'blobs'], 'readwrite', S => { for (const [id, b] of blobs) S.blobs.put(b, id); S.projects.put(clone(p)); });
  return Object.assign(p, { _import: { renamedFrom: exists ? originalId : null, photoMap: map } });
}
