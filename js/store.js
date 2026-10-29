/* SAGGCAD yerel depo: projeler, çizimler ve görseller tarayıcının IndexedDB'sinde tutulur.
 * Sunucu / hesap gerekmez; Projeler ekranından JSON yedek alınıp başka cihaza taşınabilir.
 * Görseller (kroki fotoğrafı, altlık, render) ayrı bir depoda blob olarak saklanır.
 */
import { DEFAULT_SETTINGS } from './catalog.js';

export const uid = (p = '') => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const clone = o => JSON.parse(JSON.stringify(o));

const DB_NAME = 'saggcad', DB_VER = 1;
let dbp = null;
function db() {
  return dbp ||= new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, DB_VER);
    r.onupgradeneeded = () => {
      const d = r.result;
      if (!d.objectStoreNames.contains('projects')) d.createObjectStore('projects', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('blobs')) d.createObjectStore('blobs');
      if (!d.objectStoreNames.contains('kv')) d.createObjectStore('kv');
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => { dbp = null; rej(r.error); };
  });
}
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
export const saveProject = p => { p.updatedAt = Date.now(); return tx('projects', 'readwrite', s => req(s.put(clone(p)))); };
export async function deleteProject(p) {
  await tx('blobs', 'readwrite', s => (p.photos || []).forEach(ph => s.delete(ph.id)));
  return tx('projects', 'readwrite', s => req(s.delete(p.id)));
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
export async function exportProject(p) {
  const blobs = {};
  for (const ph of p.photos || []) { const b = await getBlob(ph.id); if (b) blobs[ph.id] = await toDataUrl(b); }
  return new Blob([JSON.stringify({ format: 'saggcad', version: 1, project: p, blobs })], { type: 'application/json' });
}
export async function importProject(text) {
  const d = JSON.parse(text);
  if (d.format !== 'saggcad' || !d.project?.drawings) throw new Error('Geçerli bir SAGGCAD proje dosyası değil');
  const p = d.project;
  const exists = await getProject(p.id);
  if (exists) p.id = uid('pr');   // aynı proje açıksa üzerine yazma, kopya olarak ekle
  for (const [id, url] of Object.entries(d.blobs || {})) await putBlob(id, await (await fetch(url)).blob());
  await saveProject(p);
  return p;
}
