/* B4D uçtan uca — kalıcı proje sürümleri, gerçek IndexedDB ile (her tarayıcı bağlamı ayrı, boş bir test veritabanıdır;
 * kullanıcının verisine dokunmaz). Ekrandaki yazıya değil, IndexedDB'deki proje JSON'una, BIM elemanlarına ve görsel
 * baytlarının karmasına bakar.
 *   npm start ; node tests/e2e/b4d.e2e.cjs http://localhost:8080/
 * Playwright yoksa test atlanır ve bunu açıkça bildirir (başarılı sayılmaz).
 */
const path = require('path'), fs = require('fs');
let chromium, devices;
try { ({ chromium, devices } = require('playwright')); } catch { console.log('ATLANDI: playwright bulunamadı — bu test çalıştırılmadı'); process.exit(2); }
const BASE = process.argv[2] || 'http://localhost:8080/';
const FIX = n => path.join(__dirname, '..', 'fixtures', n);
const VILLA = FIX('villa-ornek.saggcad.json'), OLD = FIX('eski-proje-v1.saggcad.json');
const OUT = process.env.B4D_OUT || null;
const ok = (c, m) => { if (!c) throw new Error('B4D HATA: ' + m); console.log('✓', m); };

/* sayfa içi yardımcılar: bildirim kaydı + uygulamanın kendi modülleri (aynı örnekler) */
async function setup(p) {
  await p.addInitScript(() => { addEventListener('DOMContentLoaded', () => {
    window.__toasts = [];
    new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => n.classList?.contains('toast') && window.__toasts.push((n.classList.contains('err') ? 'ERR ' : '') + n.textContent.trim())))).observe(document.body, { childList: true, subtree: true });
    window.__V = () => import('./js/versions.js'); window.__ST = () => import('./js/store.js');
  }); });
}
const lastToast = p => p.evaluate(() => window.__toasts.at(-1) || '');
const runCmd = (p, id) => p.evaluate(id => { window.SAGGCAD.cmds().find(c => c.id === id).run(); }, id);
async function dl(p, fn) { const [d] = await Promise.all([p.waitForEvent('download'), fn()]); const f = await d.path(); if (OUT) fs.copyFileSync(f, path.join(OUT, d.suggestedFilename())); return { name: d.suggestedFilename(), text: fs.readFileSync(f, 'utf8') }; }
async function importFile(p, file, withVersions = null) {
  await p.goto(BASE + '#/'); await p.waitForSelector('[data-imp]', { state: 'attached' });
  await p.setInputFiles('[data-imp]', file);
  if (withVersions !== null) { await p.waitForSelector('.modal .modal-foot'); await p.click(`.modal-foot [data-k="${withVersions ? 'ok' : 'no'}"]`); }
  await p.waitForFunction(() => /^#\/p\/[^/]+$/.test(location.hash) && window.SAGGCAD.project);
  await p.waitForTimeout(250);
  return p.evaluate(() => window.SAGGCAD.project.id);
}
const closeModals = p => p.evaluate(() => document.querySelectorAll('.modal-back').forEach(m => m.remove()));

(async () => {
  if (OUT) fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch();

  /* ═══ 18. IndexedDB v1 → v2 yükseltmesi: eski veri (proje, görsel, ayar) aynen korunur ═══ */
  {
    const ctx = await b.newContext(); const p = await ctx.newPage(); await setup(p);
    await p.goto(BASE + 'manifest.webmanifest');   // aynı köken, uygulama çalışmıyor → v1 veritabanını elle kur
    const OLDP = JSON.parse(fs.readFileSync(OLD, 'utf8')).project;
    const seeded = await p.evaluate(async P => {
      const d = await new Promise((res, rej) => { const r = indexedDB.open('saggcad', 1); r.onupgradeneeded = () => { const d = r.result; d.createObjectStore('projects', { keyPath: 'id' }); d.createObjectStore('blobs'); d.createObjectStore('kv'); }; r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
      const c = Object.assign(document.createElement('canvas'), { width: 40, height: 30 }); const g = c.getContext('2d'); g.fillStyle = '#1786FF'; g.fillRect(0, 0, 40, 30); g.fillStyle = '#fff'; g.fillRect(5, 5, 10, 10);
      const blob = await new Promise(r => c.toBlob(r, 'image/png'));
      P.photos = [{ id: 'phOld1', tag: 'rolove', caption: 'Eski kroki', t: 1 }];
      P.drawings[0].plan.meta = { ...(P.drawings[0].plan.meta || {}), bg: { photoId: 'phOld1', x: 0, y: 0, w: 400, ar: 0.75, opacity: 0.5 } };
      await new Promise((res, rej) => { const t = d.transaction(['projects', 'blobs', 'kv'], 'readwrite'); t.objectStore('projects').put(P); t.objectStore('blobs').put(blob, 'phOld1'); t.objectStore('kv').put({ company: { name: 'Eski Ofis' }, jnGap: 2 }, 'settings'); t.oncomplete = res; t.onerror = () => rej(t.error); });
      d.close();
      return { json: JSON.stringify(P), bytes: [...new Uint8Array(await blob.arrayBuffer())] };
    }, OLDP);
    await p.goto(BASE); await p.waitForSelector('.dw-list');
    const after = await p.evaluate(async () => {
      const ST = await window.__ST(), V = await window.__V();
      const d = await ST.openDb();
      const P = await ST.getProject('prfx1') || (await ST.listProjects())[0];
      const blob = await ST.getBlob('phOld1');
      const set = await ST.loadSettings();
      return { ver: d.version, stores: [...d.objectStoreNames].sort(), idx: [...d.transaction('versions').objectStore('versions').indexNames].sort(), json: JSON.stringify(P), bytes: [...new Uint8Array(await blob.arrayBuffer())], company: set.company.name, jnGap: set.jnGap, vers: (await V.listVersions(P.id)).length };
    });
    ok(after.ver === 2 && JSON.stringify(after.stores) === JSON.stringify(['blobs', 'kv', 'projects', 'snapshots', 'versionAssets', 'versions']), `IndexedDB v1 → v2: yeni depolar eklendi, eskiler korundu (${after.stores.join(', ')})`);
    ok(JSON.stringify(after.idx) === JSON.stringify(['assets', 'projectHash', 'projectId', 'projectId_createdAt']), 'versions indeksleri: projectId, projectId+createdAt, assets, projectId+hash');
    const a = JSON.parse(after.json), s0 = JSON.parse(seeded.json);
    ok(a.id === s0.id && JSON.stringify(a.drawings) === JSON.stringify(s0.drawings) && JSON.stringify(a.photos) === JSON.stringify(s0.photos), 'eski proje: kimlik, çizimler, BIM elemanları ve görsel listesi aynen');
    ok(JSON.stringify(after.bytes) === JSON.stringify(seeded.bytes), 'eski görsel (blob) bayt bayt korundu');
    ok(after.company === 'Eski Ofis' && after.jnGap === 2 && after.vers === 0, 'eski ayarlar korundu; sürüm yok');
    // yükseltme engellenirse (başka sekme v1 bağlantısını kapatmıyor): veri kaybı yok, anlaşılır mesaj
    const c2 = await b.newContext(); const q1 = await c2.newPage(); await q1.goto(BASE + 'manifest.webmanifest');
    await q1.evaluate(async () => { await new Promise(res => { const r = indexedDB.open('saggcad', 1); r.onupgradeneeded = () => { const d = r.result; d.createObjectStore('projects', { keyPath: 'id' }); d.createObjectStore('blobs'); d.createObjectStore('kv'); }; r.onsuccess = () => { window.__hold = r.result; const t = r.result.transaction('projects', 'readwrite'); t.objectStore('projects').put({ id: 'prKeep', name: 'Korunacak', drawings: [{ id: 'dwK', name: 'Rölöve', kind: 'rolove', main: true, plan: { walls: [], rooms: [], items: [], rails: [], openings: [] } }], photos: [], updatedAt: 1 }); t.oncomplete = res; }; }); });
    const q2 = await c2.newPage(); await q2.goto(BASE); await q2.waitForSelector('.card.empty', { timeout: 10000 });
    ok(/başka bir SAGGCAD sekmesi/.test(await q2.textContent('.card.empty')), 'yükseltme engellendi: "diğer sekmeleri kapatın" mesajı, sessiz hata yok');
    await q1.close(); await q2.reload(); await q2.waitForSelector('.sc-page');
    ok(await q2.evaluate(async () => (await (await import('./js/store.js')).getProject('prKeep'))?.name === 'Korunacak'), 'engel kalkınca yükseltme tamamlandı, v1 verisi yerinde');
    await c2.close(); await ctx.close();
  }

  /* ═══ ana akışlar ═══ */
  const ctx = await b.newContext({ viewport: { width: 1440, height: 920 }, acceptDownloads: true });
  const p = await ctx.newPage(); const errs = [];
  p.setDefaultTimeout(20000);
  p.on('pageerror', e => errs.push('PAGE: ' + e.message)); p.on('console', m => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errs.push('CONSOLE: ' + m.text()));
  await setup(p);
  const E = (fn, a) => p.evaluate(fn, a);

  // 1. boş proje — ilk sürüm (arayüzden)
  await p.goto(BASE); await p.waitForSelector('[data-new]');
  await p.click('[data-new]'); await p.fill('#npn', 'Boş deneme'); await p.click('.modal-foot [data-k="ok"]');
  await p.waitForSelector('#ps2d svg.pe-svg'); await p.waitForTimeout(300);
  await runCmd(p, 'file.vsave'); await p.waitForSelector('#vrName');
  await p.fill('#vrName', 'İlk boş sürüm'); await p.fill('#vrNote', 'boş proje'); await p.click('.modal-foot [data-k="ok"]');
  await p.waitForFunction(() => window.__toasts.some(t => t.includes('kaydedildi')));
  const empty = await E(async () => { const V = await window.__V(), ST = await window.__ST(); const id = window.SAGGCAD.project.id; const vs = await V.listVersions(id); const v = await V.loadVersion(vs[0].id); const P = await ST.getProject(id); delete P.updatedAt; return { n: vs.length, name: vs[0].name, note: vs[0].note, same: V.canonical(P) === V.canonical(v.snapshot.project), schema: vs[0].schema, app: vs[0].appVersion, idOk: /^ver_/.test(vs[0].id), hashOk: /^sha256:[0-9a-f]{64}$/.test(vs[0].hash) }; });
  ok(empty.n === 1 && empty.name === 'İlk boş sürüm' && empty.note === 'boş proje' && empty.same, '1. boş proje: ilk sürüm kaydedildi, anlık görüntü = IndexedDB proje kaydı');
  ok(empty.idOk && empty.hashOk && empty.schema === 1 && empty.app === '0.6.2-b4d', 'sürüm kaydı: ver_ kimliği, sha256 karması, schema 1, appVersion 0.6.2-b4d');
  ok(/İlk boş sürüm/.test(await lastToast(p)) && /\d\d\.\d\d\.\d{4} \d\d:\d\d/.test(await lastToast(p)), 'başarı bildirimi: sürüm adı + tarih/saat');

  // 2–5. villa: çok çizim, çok kat, BIM, B4 kararları, B4C fiyatları + görsel (altlık)
  const pid = await importFile(p, VILLA);
  await E(async () => {
    const ST = await window.__ST(), S = window.SAGGCAD;
    const c = Object.assign(document.createElement('canvas'), { width: 120, height: 80 }); const g = c.getContext('2d'); g.fillStyle = '#0F1B2D'; g.fillRect(0, 0, 120, 80); g.fillStyle = '#1786FF'; g.beginPath(); g.arc(60, 40, 30, 0, 7); g.fill();
    const blob = await new Promise(r => c.toBlob(r, 'image/png'));
    await ST.putBlob('phVilla1', blob);
    S.project.photos.push({ id: 'phVilla1', tag: 'rolove', caption: 'Saha krokisi', t: Date.now() });
    S.project.drawings[0].plan.meta.bg = { photoId: 'phVilla1', x: 0, y: 0, w: 1200, ar: 0.66, opacity: 0.4 };
    await ST.saveProject(S.project);
  });
  await p.evaluate(() => { location.hash = `#/p/${window.SAGGCAD.project.id}/plan?d=dwvP`; }); await p.waitForSelector('#ps2d svg.pe-svg'); await p.waitForTimeout(400);
  await runCmd(p, 'file.vsave'); await p.waitForSelector('#vrName'); await p.fill('#vrName', 'v1 — rölöve + tadilat'); await p.click('.modal-foot [data-k="ok"]');
  await p.waitForFunction(() => window.__toasts.some(t => t.includes('v1 — rölöve')));
  const v1 = await E(async pid => {
    const V = await window.__V(), ST = await window.__ST();
    const [m] = await V.listVersions(pid); const v = await V.loadVersion(m.id); const P = await ST.getProject(pid); delete P.updatedAt;
    const dp = v.snapshot.project.drawings.find(d => d.id === 'dwvP').plan;
    const blob = await ST.getBlob('phVilla1'); const h = await V.sha256(blob);
    const asset = await ST.txMulti(['versionAssets'], 'readonly', S => new Promise(r => { const q = S.versionAssets.get(h); q.onsuccess = () => r(q.result); }));
    return { id: m.id, hash: m.hash, same: V.canonical(P) === V.canonical(v.snapshot.project), drawings: v.snapshot.project.drawings.length, levels: dp.levels.length, walls: dp.walls.length + dp.levels.reduce((s, L) => s + (L.walls || L.plan?.walls || []).length, 0), phases: Object.keys(dp.meta.revision.phases || {}).length, methods: Object.keys(dp.meta.revision.methods || {}).length, prices: JSON.stringify(dp.meta.revision.qty?.prices || {}), code: dp.meta.revision.code, assetRef: v.snapshot.assets.phVilla1, h, assetSame: (await V.sha256(asset.blob)) === h, assetHashes: m.assetHashes, stats: m.stats };
  }, pid);
  ok(v1.same && v1.drawings === 2, '2. çok çizimli proje: anlık görüntü IndexedDB kaydıyla birebir (2 çizim)');
  ok(v1.levels === 1 && v1.walls >= 7 && v1.stats.levels >= 2, `3. çok katlı BIM: katlar ve duvarlar sürümde (${v1.walls} duvar, ${v1.stats.elements} eleman)`);
  ok(v1.phases > 0 && v1.methods > 0 && !!v1.code, `4. B4 revizyon kararları (safha ${v1.phases}, yöntem ${v1.methods}, kod ${v1.code}) sürümde`);
  ok(v1.prices !== '{}', '5. B4C birim fiyatları sürümde');
  ok(v1.assetRef === v1.h && v1.assetSame && v1.assetHashes.length === 1, '15. görsel içerik karmasıyla versionAssets\'te, baytlar aynı');

  // 6. aynı içerik → yeni sürüm yok, kullanıcı bilgilendirilir
  await runCmd(p, 'file.vsave'); await p.waitForSelector('#vrName'); await p.click('.modal-foot [data-k="ok"]');
  await p.waitForFunction(() => window.__toasts.some(t => t.includes('Değişiklik yok')));
  ok(await E(async pid => (await (await window.__V()).listVersions(pid)).length, pid) === 1, '6. aynı karma: yeni sürüm oluşturulmadı, "Değişiklik yok" bildirimi');

  // 7. ad / not değişikliği anlık görüntüyü değiştirmez
  const ren = await E(async id => { const V = await window.__V(); const a = await V.loadVersion(id); await V.updateVersion(id, { name: 'v1 — müşteriye sunulan', note: 'ilk sunum' }); const b = await V.loadVersion(id); return { same: a.json === b.json && a.meta.hash === b.meta.hash, name: b.meta.name, note: b.meta.note }; }, v1.id);
  ok(ren.same && ren.name === 'v1 — müşteriye sunulan' && ren.note === 'ilk sunum', '7. yeniden adlandırma / not: içerik ve karma değişmedi');

  // bekleyen (400 ms gecikmeli) otomatik kayıt boşaltılır: düzenlemeden HEMEN sonra kaydedilen sürüm o düzenlemeyi içerir
  await E(() => { const E = window.SAGGCAD.editor; const w = E.root.walls.find(w => w.id === 'zd1'); E.bimCommand({ op: 'setInstanceParam', id: w.id, key: 'thickness', value: 30 }); });
  const editedT = await E(() => window.SAGGCAD.editor.root.walls.find(w => w.id === 'zd1').t);
  const v2 = await E(async () => { const r = await window.SAGGCAD.verCtx().flush().then(async () => (await window.__V()).saveVersion(window.SAGGCAD.project.id, { name: 'v2 — duvar 30 cm' })); return r.version; });
  const v2t = await E(async id => (await (await window.__V()).loadVersion(id)).snapshot.project.drawings.find(d => d.id === 'dwvP').plan.walls.find(w => w.id === 'zd1').t, v2.id);
  ok(editedT === 30 ? v2t === 30 : v2t === editedT, `bekleyen otomatik kayıt boşaltıldı: hemen alınan sürüm son düzenlemeyi içeriyor (t=${v2t})`);
  // 8. liste sırası: yeniden eskiye; liste yalnız meta veri
  const order = await E(async pid => { const V = await window.__V(); const vs = await V.listVersions(pid); return { names: vs.map(v => v.name), noSnap: vs.every(v => !('snapshot' in v) && !('json' in v)) }; }, pid);
  ok(order.names[0] === 'v2 — duvar 30 cm' && order.names[1] === 'v1 — müşteriye sunulan' && order.noSnap, '8. liste: yeniden eskiye, anlık görüntü okunmadan');

  // 9–11. karşılaştırma (arayüz): sürüm ↔ güncel, sürüm ↔ sürüm, metraj farkı
  await E(() => { const E = window.SAGGCAD.editor; E.root.openings.shift(); E.changed(); });
  await p.waitForTimeout(500);
  await runCmd(p, 'file.versions'); await p.waitForSelector('.vr-list');
  await p.waitForFunction(() => document.querySelectorAll('.vr-st.st-ok').length === 2);
  ok(await E(() => document.querySelectorAll('.vr-row').length === 2 && !!document.querySelector('.vr-sep') && /İşlem Geçmişi/.test(document.querySelector('.vr-sep').textContent) && /Proje Sürümleri/.test(document.querySelector('.vr-sep').textContent)), 'yönetici: 2 sürüm "Sağlam"; "İşlem Geçmişi" ve "Proje Sürümleri" ayrımı görünür');
  if (OUT) await p.screenshot({ path: path.join(OUT, 'proje-surumleri.png') });
  await p.click(`[data-v="${v2.id}"] [data-va="cmp"]`); await p.waitForSelector('[data-vdiff]');
  const cmpCur = await E(() => { const s = document.querySelector('[data-vdiff] [data-vdw="dwvP"]'); return s && { removed: +s.querySelector('[data-c="removed"]').textContent, rows: s.querySelectorAll('.vr-qty tbody tr').length, txt: s.textContent }; });
  ok(cmpCur && cmpCur.removed >= 1 && cmpCur.rows > 0 && /onay bekleyen/.test(cmpCur.txt), `9/11. sürüm ↔ güncel: kaldırılan doğrama ${cmpCur?.removed}, ${cmpCur?.rows} metraj satırı, söküm/yeni "onay bekleyen"`);
  if (OUT) await p.screenshot({ path: path.join(OUT, 'surum-karsilastirma.png') });
  await p.click('.modal-back:last-child .modal-foot [data-k="ok"]'); await p.waitForTimeout(250);
  await p.selectOption('[data-ca]', v1.id); await p.selectOption('[data-cb]', v2.id); await p.click('[data-cgo]'); await p.waitForSelector('.modal-back:last-child [data-vdiff]');
  const cmpVV = await E(() => { const s = document.querySelector('.modal-back:last-child [data-vdiff] [data-vdw="dwvP"]'); return s && { geo: +s.querySelector('[data-c="geometry"]').textContent + +s.querySelector('[data-c="params"]').textContent, rolove: /Değişiklik yok/.test(document.querySelector('.modal-back:last-child [data-vdiff]').textContent) }; });
  ok(cmpVV && cmpVV.geo >= 1 && cmpVV.rolove, '10. sürüm ↔ sürüm: duvar kalınlığı farkı bulundu; rölöve ↔ rölöve değişmedi');
  const api = await E(async ([a, b]) => { const V = await window.__V(); const r = await V.compareVersions(a, b); const d = r.drawings.find(x => x.b.id === 'dwvP'); return { wall: d.qty.rows.find(x => /Duvar hacmi/.test(x.label)), firm: d.qty.rows.every(x => x.demolish === 0 && x.build === 0) }; }, [v1.id, v2.id]);
  ok(api.wall && api.wall.net > 0 && api.firm, `11. metraj farkı (B4C quantityDiff): duvar hacmi net +${api.wall?.net.toFixed(3)} m³; onaysız müdahale kesin gösterilmedi`);
  await closeModals(p);

  // 12. kopya olarak geri yükle
  await runCmd(p, 'file.versions'); await p.waitForSelector('.vr-list'); await p.click(`[data-v="${v1.id}"] [data-va="copy"]`);
  await p.waitForSelector('#vrCopy'); await p.fill('#vrCopy', 'Villa — v1 kopyası'); await p.click('.modal-back:last-child .modal-foot [data-k="ok"]');
  await p.waitForFunction(pid => window.SAGGCAD.project && window.SAGGCAD.project.id !== pid && /^#\/p\//.test(location.hash), pid);
  await p.waitForTimeout(300);
  const cp = await E(async ([pid, vid]) => {
    const V = await window.__V(), ST = await window.__ST(); const P = await ST.getProject(window.SAGGCAD.project.id), orig = await ST.getProject(pid), v = await V.loadVersion(vid);
    const ph = P.photos[0]; const blob = await ST.getBlob(ph.id);
    const ids = x => x.drawings.flatMap(d => [d.id, ...['walls', 'openings', 'rooms'].flatMap(k => (d.plan[k] || []).map(o => o.id)), ...(d.plan.levels || []).flatMap(L => ['walls', 'openings', 'rooms'].flatMap(k => ((L.plan || L)[k] || []).map(o => o.id)))]).join(',');
    return { id: P.id, name: P.name, from: P.restoredFrom, ids: ids(P) === ids(v.snapshot.project), phNew: ph.id !== 'phVilla1', bg: P.drawings[0].plan.meta.bg.photoId === ph.id, bytes: (await V.sha256(blob)) === v.snapshot.assets.phVilla1, origOk: orig.photos[0].id === 'phVilla1' && !!(await ST.getBlob('phVilla1')), origWall: orig.drawings.find(d => d.id === 'dwvP').plan.walls.find(w => w.id === 'zd1').t, n: (await ST.listProjects()).length };
  }, [pid, v1.id]);
  ok(cp.id !== pid && cp.name === 'Villa — v1 kopyası' && cp.from?.versionId === v1.id && cp.from.mode === 'copy', '12. kopya: yeni proje kimliği, restoredFrom kaydı');
  ok(cp.ids, '12. kopya: çizim ve BIM eleman kimlikleri sürümdekiyle aynı (proje kapsamında)');
  ok(cp.phNew && cp.bg && cp.bytes, '12. kopya: görsel yeni kimlikle, altlık başvurusu yeniden bağlandı, baytlar aynı');
  ok(cp.origOk && cp.origWall === v2t, 'kopya sonrası özgün proje ve görseli değişmedi');
  const copyId = cp.id;

  // 16. görsel projeden silindikten sonra eski sürümü geri yükle (görsel geri gelir)
  await p.evaluate(pid => { location.hash = `#/p/${pid}`; }, pid); await p.waitForSelector('[data-ph]');
  await p.click('[data-ph="phVilla1"] [data-phd]'); await p.click('.modal-foot [data-k="ok"]'); await p.waitForTimeout(600);
  await E(async () => { const ST = await window.__ST(); await ST.txMulti(['blobs'], 'readwrite', S => { S.blobs.delete('phVilla1'); }); });
  ok(await E(async pid => { const P = await (await window.__ST()).getProject(pid); return !P.photos.length && P.drawings[0].plan.meta.bg === null; }, pid), 'görsel projeden silindi (altlık başvurusu kaldırıldı, blob silindi)');
  ok(await E(async id => (await (await window.__V()).verifyVersion(id, { deep: true })).status === 'ok', v1.id), '15. proje görseli silinse de sürüm "Sağlam" (versionAssets kopyası)');
  const before = await E(async pid => { const P = await (await window.__ST()).getProject(pid); delete P.updatedAt; return P; }, pid);

  // 13–14. üzerine geri yükle + zorunlu kurtarma sürümü (arayüzden)
  await p.evaluate(pid => { location.hash = `#/p/${pid}/plan?d=dwvP`; }, pid); await p.waitForSelector('#ps2d svg.pe-svg'); await p.waitForTimeout(300);
  const oldRef = await p.evaluateHandle(() => window.SAGGCAD.project);
  await runCmd(p, 'file.versions'); await p.waitForSelector('.vr-list'); await p.click(`[data-v="${v1.id}"] [data-va="over"]`);
  await p.waitForSelector('#vrAck'); await p.click('.modal-back:last-child .modal-foot [data-k="ok"]'); await p.waitForTimeout(200);
  ok(await E(() => !!document.querySelector('#vrAck') && window.__toasts.at(-1).includes('Onay kutusunu')), 'üzerine geri yükleme onay kutusu işaretlenmeden başlamaz');
  await p.check('#vrAck'); await p.click('.modal-back:last-child .modal-foot [data-k="ok"]');
  await p.waitForFunction(() => window.__toasts.some(t => t.includes('geri yüklendi')));
  await p.waitForSelector('#ps2d svg.pe-svg'); await p.waitForTimeout(400);
  const ov = await E(async ([pid, vid, before]) => {
    const V = await window.__V(), ST = await window.__ST(); const P = await ST.getProject(pid), v = await V.loadVersion(vid);
    const vs = await V.listVersions(pid); const rec = vs.find(x => x.kind === 'recovery'); const rv = await V.loadVersion(rec.id);
    const strip = x => { const y = JSON.parse(JSON.stringify(x)); delete y.updatedAt; delete y.restoredFrom; return V.canonical(y); };
    const blob = await ST.getBlob(P.photos[0]?.id);
    return { content: strip(P) === strip({ ...v.snapshot.project, createdAt: P.createdAt }), id: P.id === pid, from: P.restoredFrom?.mode, rec: rec && /^Geri yükleme öncesi — \d\d\.\d\d\.\d{4} \d\d:\d\d$/.test(rec.name) && rec.important, recSame: strip(rv.snapshot.project) === strip(before), img: !!blob && (await V.sha256(blob)) === v.snapshot.assets.phVilla1 && P.drawings[0].plan.meta.bg?.photoId === 'phVilla1', wall: P.drawings.find(d => d.id === 'dwvP').plan.walls.find(w => w.id === 'zd1').t, editorNew: window.SAGGCAD.project !== null, editorWall: window.SAGGCAD.editor.root.walls.find(w => w.id === 'zd1').t, hist: window.SAGGCAD.editor.hist.undo.length };
  }, [pid, v1.id, before]);
  ok(ov.content && ov.id && ov.from === 'overwrite', '13. üzerine: proje içeriği sürümle birebir, proje kimliği aynı');
  ok(ov.rec && ov.recSame, '14. zorunlu kurtarma sürümü "Geri yükleme öncesi — tarih/saat", içeriği geri yükleme öncesi durum');
  ok(ov.img, '16. silinen görsel geri yüklendi (aynı kimlik, aynı baytlar, altlık başvurusu geri geldi)');
  ok(ov.editorWall === ov.wall && ov.hist === 0, 'editör yeni nesneyle açıldı (eski nesne tutulmuyor), oturum işlem geçmişi sıfır');
  // 25. gecikmeli otomatik kayıt / eski nesne geri yüklenen projeyi ezemez
  const race = await p.evaluate(async old => { const ST = await window.__ST(); old.name = 'ESKİ NESNE'; let err = null; try { await ST.saveProject(old); } catch (e) { err = e.code; } return { err, same: old !== window.SAGGCAD.project }; }, oldRef);
  await p.waitForTimeout(800);
  ok(race.err === 'retired' && race.same && await E(async pid => (await (await window.__ST()).getProject(pid)).name !== 'ESKİ NESNE', pid), '25. eski nesnenin (bekleyen otomatik kayıt) yazması reddedildi; geri yüklenen proje ezilmedi');
  // düzenle → hemen geri yükle (API, arayüzle aynı yol): bekleyen kayıt kurtarma sürümüne girer, sonra ezilmez
  await E(() => { const E = window.SAGGCAD.editor; const w = E.root.walls.find(w => w.id === 'zd1'); E.bimCommand({ op: 'setInstanceParam', id: w.id, key: 'thickness', value: 33 }); });
  const race2 = await E(async ([pid, vid]) => {
    const V = await window.__V(), ST = await window.__ST(), C = window.SAGGCAD.verCtx(); const old = window.SAGGCAD.project;
    await C.flush(); C.retire(old);
    const r = await V.restoreVersion(vid, { mode: 'overwrite', confirm: true, projectId: pid });
    await C.onRestored(r);
    await new Promise(res => setTimeout(res, 900));
    const P = await ST.getProject(pid); const rv = await V.loadVersion(r.recovery.id);
    return { now: P.drawings.find(d => d.id === 'dwvP').plan.walls.find(w => w.id === 'zd1').t, rec: rv.snapshot.project.drawings.find(d => d.id === 'dwvP').plan.walls.find(w => w.id === 'zd1').t };
  }, [pid, v1.id]);
  ok(race2.rec === 33 && race2.now === 26.5, `25. düzenleme + hemen geri yükleme: düzenleme kurtarma sürümünde (t=${race2.rec}), proje sürüm değerinde (t=${race2.now})`);
  await p.waitForSelector('#ps2d svg.pe-svg'); await p.waitForTimeout(300);

  // 19. kota dolu: sürüm yazılamaz → yarım kayıt yok, başarı bildirimi yok; geri yüklemede kurtarma yazılamazsa geri yükleme yok
  const quota = await E(async ([pid, vid]) => {
    const V = await window.__V(), ST = await window.__ST();
    const n0 = (await V.listVersions(pid)).length, P0 = JSON.stringify(await ST.getProject(pid));
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...a) { if (this.name === 'snapshots') throw new DOMException('Kota doldu (benzetim)', 'QuotaExceededError'); return put.apply(this, a); };
    const E = window.SAGGCAD.editor; const w = E.root.walls.find(w => w.id === 'zd1'); E.bimCommand({ op: 'setInstanceParam', id: w.id, key: 'thickness', value: 31 });
    await window.SAGGCAD.verCtx().flush();
    const P1 = JSON.stringify(await ST.getProject(pid));
    let e1 = null, e2 = null;
    try { await V.saveVersion(pid, { name: 'kotada' }); } catch (e) { e1 = e.code + ': ' + e.message; }
    try { await V.restoreVersion(vid, { mode: 'overwrite', confirm: true, projectId: pid }); } catch (e) { e2 = e.code; }
    IDBObjectStore.prototype.put = put;
    const vs = await V.listVersions(pid);
    const orphan = await ST.txMulti(['versions', 'snapshots'], 'readonly', S => new Promise(r => { const a = S.versions.getAllKeys(), b = S.snapshots.getAllKeys(); b.onsuccess = () => r(a.result.length === b.result.length); }));
    return { e1, e2, n: vs.length === n0, unchanged: JSON.stringify(await ST.getProject(pid)) === P1, changedBefore: P1 !== P0, orphan };
  }, [pid, v1.id]);
  ok(/^quota: Depolama alanı dolu/.test(quota.e1) && quota.n && quota.orphan, '19. kota dolu: anlaşılır hata, sürüm sayısı aynı, yarım kayıt (meta var / içerik yok) oluşmadı');
  ok(quota.e2 === 'recovery-failed' && quota.unchanged, '14. kurtarma sürümü yazılamayınca geri yükleme yapılmadı, proje değişmedi');
  // arayüz: kota hatasında başarı bildirimi yok
  await E(() => { const put = IDBObjectStore.prototype.put; window.__put = put; IDBObjectStore.prototype.put = function (...a) { if (this.name === 'snapshots') throw new DOMException('q', 'QuotaExceededError'); return put.apply(this, a); }; });
  await E(() => { window.__toasts.length = 0; });
  await runCmd(p, 'file.vsave'); await p.waitForSelector('#vrName'); await p.fill('#vrName', 'kota denemesi'); await p.click('.modal-foot [data-k="ok"]');
  await p.waitForFunction(() => window.__toasts.length > 0);
  ok(await E(() => window.__toasts.every(t => t.startsWith('ERR ')) && /Depolama alanı dolu/.test(window.__toasts[0])), 'arayüz: kota hatası gösterildi, "kaydedildi" bildirimi yok');
  await E(() => { IDBObjectStore.prototype.put = window.__put; });

  // 20–21. bozuk anlık görüntü, karma uyuşmazlığı, yarım kayıt, gelecek şema, eksik görsel
  const bad = await E(async pid => {
    const V = await window.__V(), ST = await window.__ST();
    const mk = async name => (await V.saveVersion(pid, { name, allowDuplicate: true })).version;
    const a = await mk('bozulacak'), c = await mk('yarım'), f = await mk('gelecek'), j = await mk('json');
    await ST.txMulti(['snapshots', 'versions'], 'readwrite', S => {
      S.snapshots.get(a.id).onsuccess = e => { const r = e.target.result; r.json = r.json.replace('"zd1"', '"zdX"'); S.snapshots.put(r); };
      S.snapshots.delete(c.id);
      S.versions.put({ ...f, schema: 2, appVersion: '9.0.0' });
    });
    const jh = await V.sha256('{bozuk');
    await ST.txMulti(['snapshots', 'versions'], 'readwrite', S => { S.snapshots.put({ id: j.id, json: '{bozuk' }); S.versions.put({ ...j, hash: jh }); });
    const code = async id => { try { await V.loadVersion(id); return 'ok'; } catch (e) { return e.code; } };
    const rest = async id => { try { await V.restoreVersion(id, { mode: 'copy' }); return 'restored'; } catch (e) { return e.code; } };
    return { a: await code(a.id), c: await code(c.id), f: await code(f.id), j: await code(j.id), ra: await rest(a.id), rc: await rest(c.id), va: (await V.verifyVersion(a.id)).status, ids: [a.id, c.id, f.id, j.id] };
  }, pid);
  ok(bad.a === 'corrupt' && bad.va === 'corrupt' && bad.ra === 'corrupt', '21. karma uyuşmazlığı: sürüm "Bozuk", açılmaz, geri yüklenmez');
  ok(bad.j === 'corrupt', '20. bozuk JSON anlık görüntü reddedildi');
  ok(bad.c === 'incomplete' && bad.rc === 'incomplete', 'yarım kalmış kayıt (içerik yok) tanındı ve reddedildi');
  ok(bad.f === 'future', 'daha yeni SAGGCAD şeması: "bu sürümde açılamaz"');
  await runCmd(p, 'file.versions'); await p.waitForSelector('.vr-list');
  await p.waitForFunction(ids => ids.every(id => document.querySelector(`[data-v="${id}"] .vr-st:not(.st-unchecked)`)), bad.ids);
  ok(await E(ids => ['corrupt', 'incomplete', 'future', 'corrupt'].every((s, i) => document.querySelector(`[data-v="${ids[i]}"] .vr-st`).classList.contains('st-' + s)), bad.ids), 'yönetici: bozuk / yarım / yeni şema sürümleri işaretli');
  await closeModals(p);
  await E(async ids => { await (await window.__V()).deleteVersions(ids); }, bad.ids);
  // eksik görsel → sağlam değil, hangi başvurunun eksik olduğu raporlanır
  const miss = await E(async ([pid, h]) => {
    const V = await window.__V(), ST = await window.__ST();
    const blob = await ST.txMulti(['versionAssets'], 'readonly', S => new Promise(r => { const q = S.versionAssets.get(h); q.onsuccess = () => r(q.result); }));
    await ST.txMulti(['versionAssets'], 'readwrite', S => { S.versionAssets.delete(h); });
    const vs = await V.listVersions(pid); const v = vs.find(x => x.assetHashes.includes(h));
    const chk = await V.verifyVersion(v.id); let rc = null; try { await V.restoreVersion(v.id, { mode: 'copy' }); } catch (e) { rc = e.code + ': ' + e.message; }
    const r2 = await V.restoreVersion(v.id, { mode: 'copy', allowMissing: true });
    await ST.txMulti(['versionAssets'], 'readwrite', S => { S.versionAssets.put(blob); });
    const after = await V.verifyVersion(v.id, { deep: true });
    await ST.deleteProject(r2.project);
    return { st: chk.status, prob: chk.problems.join(' | '), rc, partial: r2.missing.length === 1, after: after.status };
  }, [pid, v1.h]);
  ok(miss.st === 'missing' && /Saha krokisi/.test(miss.prob), `eksik görsel: sürüm "Eksik görsel", eksik başvuru adıyla raporlandı (${miss.prob})`);
  ok(/^missing-assets: .*Saha krokisi/.test(miss.rc) && miss.partial && miss.after === 'ok', 'eksik görselle geri yükleme yalnız açık onayla; görsel geri konunca yeniden "Sağlam"');

  // 22. eski .saggcad.json
  const oldId = await importFile(p, OLD);
  ok(await E(async id => { const P = await (await window.__ST()).getProject(id); return P.drawings.map(d => d.id).join() === 'dwfx1,dwfx2'; }, oldId), '22. eski .saggcad.json açıldı, çizim kimlikleri korundu');

  // 23–24. dışa / içe aktarma (sürümlerle): arayüz → dosya; aynı veritabanına geri al → kimlik çakışması yok
  await p.evaluate(pid => { location.hash = `#/p/${pid}`; }, pid); await p.waitForSelector('[data-exp]');
  await p.click('[data-exp]'); await p.waitForSelector('[name=vrx]');
  await p.check('[name=vrx][value=ver]');
  const file = await dl(p, () => p.click('.modal-foot [data-k="ok"]'));
  const fx = JSON.parse(file.text);
  ok(fx.format === 'saggcad' && fx.version === 1 && fx.project.id === pid && fx.versions.length >= 3 && Object.keys(fx.versionAssets).length === 1 && Object.keys(fx.blobs).length === 1, `23. dışa aktarma: biçim aynı (version 1), ${fx.versions.length} sürüm + görselleri ek alanlarda`);
  // bir sürümü bozup dosyaya ekle → içe aktarmada reddedilir ve raporlanır
  fx.versions.push({ meta: { ...fx.versions[0].meta, name: 'kurcalanmış' }, json: fx.versions[0].json.replace('"zd1"', '"zdY"') });
  const tf = path.join(OUT || require('os').tmpdir(), 'b4d-ithal.saggcad.json'); fs.writeFileSync(tf, JSON.stringify(fx));
  const before2 = await E(async () => { const ST = await window.__ST(); return (await ST.listProjects()).map(x => x.id); });
  const impId = await importFile(p, tf, true);
  await p.waitForSelector('.modal .modal-body ul'); const rejTxt = await p.textContent('.modal .modal-body ul'); await closeModals(p);
  const imp = await E(async ([pid, impId, n]) => {
    const V = await window.__V(), ST = await window.__ST(); const P = await ST.getProject(impId), O = await ST.getProject(pid);
    const vs = await V.listVersions(impId); const ov = await V.listVersions(pid);
    const ok = await Promise.all(vs.map(v => V.verifyVersion(v.id, { deep: true }).then(r => r.status)));
    const imgO = await ST.getBlob(O.photos[0].id), imgP = await ST.getBlob(P.photos[0].id);
    return { newId: impId !== pid, same: P.drawings.map(d => d.plan.walls.map(w => w.id).join()).join('|') === O.drawings.map(d => d.plan.walls.map(w => w.id).join()).join('|'), vs: vs.length, bound: vs.every(v => v.projectId === impId && v.importedFrom?.projectId === pid), ok: ok.every(s => s === 'ok'), orig: ov.length, phRemap: P.photos[0].id !== O.photos[0].id && P.drawings[0].plan.meta.bg.photoId === P.photos[0].id, imgs: !!imgO && !!imgP && (await V.sha256(imgO)) === (await V.sha256(imgP)), projects: (await ST.listProjects()).length === n + 1 };
  }, [pid, impId, before2.length]);
  ok(imp.newId && imp.same && imp.projects, '24. aynı proje kimliği varken içe aktarma: yeni kimlikli kopya, eleman kimlikleri aynı, mevcut proje ezilmedi');
  ok(imp.vs === fx.versions.length - 1 && imp.bound && imp.ok, `24. ${imp.vs} sürüm yeni proje kimliğine bağlandı, karma ve görseller doğrulandı`);
  ok(/kurcalanmış/.test(rejTxt) && /karma uyuşmuyor/.test(rejTxt), 'bozuk sürüm içe aktarılmadı ve raporlandı');
  ok(imp.phRemap && imp.imgs, 'çakışan görsel kimliği yeniden adlandırıldı; iki projenin görseli ayrı ve sağlam');
  // boş bir veritabanına içe aktarma: proje kimliği korunur, sürümler gelir
  {
    const c3 = await b.newContext(); const q = await c3.newPage(); await setup(q);
    const id3 = await importFile(q, tf, true); await closeModals(q);
    const r3 = await q.evaluate(async id => { const V = await window.__V(); const vs = await V.listVersions(id); const r = await V.restoreVersion(vs.at(-1).id, { mode: 'copy' }); return { n: vs.length, img: !!(await (await window.__ST()).getBlob(r.project.photos[0].id)) }; }, id3);
    ok(id3 === pid && r3.n === fx.versions.length - 1 && r3.img, 'başka cihaz (boş veritabanı): proje kimliği korundu, sürümler ve görselleri geri yüklenebilir');
    await c3.close();
  }

  // 17. proje silme: yalnız o projenin sürümleri silinir; başka sürümlerin kullandığı görsel korunur
  const del = await E(async ([pid, copyId, h]) => {
    const V = await window.__V(), ST = await window.__ST();
    const cv = (await V.saveVersion(copyId, { name: 'kopyanın sürümü' })).version;
    return { cv: cv.id, shares: cv.assetHashes.includes(h) };
  }, [pid, copyId, v1.h]);
  ok(del.shares, 'kopya projenin sürümü aynı görsel karmasını paylaşıyor (tekilleştirme)');
  await p.goto(BASE + '#/'); await p.waitForSelector(`[data-p="${impId}"]`);
  await p.click(`[data-p="${impId}"] [data-pa="del"]`); await p.waitForSelector('.modal-body p');
  ok(/kalıcı sürümü de silinir/.test(await p.textContent('.modal-body p')), 'silme onayı sürüm sayısını ve yedek önerisini söylüyor');
  await p.click('.modal-foot [data-k="ok"]'); await p.waitForTimeout(600);
  const del2 = await E(async ([impId, pid, cv, h]) => {
    const V = await window.__V(), ST = await window.__ST();
    const asset = await ST.txMulti(['versionAssets'], 'readonly', S => new Promise(r => { const q = S.versionAssets.count(h); q.onsuccess = () => r(q.result); }));
    return { gone: !(await ST.getProject(impId)) && (await V.listVersions(impId)).length === 0, others: (await V.listVersions(pid)).length > 0, asset, cvOk: (await V.verifyVersion(cv, { deep: true })).status };
  }, [impId, pid, del.cv, v1.h]);
  ok(del2.gone && del2.others && del2.asset === 1 && del2.cvOk === 'ok', '17. proje silindi + sürümleri; paylaşılan görsel diğer sürümler için korundu');
  const free = await E(async ([copyId, pid, h]) => {
    const V = await window.__V(), ST = await window.__ST();
    for (const id of [copyId, pid]) await V.deleteProjectVersions(id);
    return ST.txMulti(['versionAssets'], 'readonly', S => new Promise(r => { const q = S.versionAssets.count(h); q.onsuccess = () => r(q.result); }));
  }, [copyId, pid, v1.h]);
  ok(free === 0, 'son başvuran sürüm silinince görsel versionAssets\'ten temizlendi (başvuru sayımı)');

  // 8 (ayarlar). otomatik proje sürümleri: pafta öncesi, revizyon kodu, günlük; tekrarsız; sınırda yalnız eski otomatikler silinir
  await p.click('[data-settings]'); await p.waitForSelector('[data-vs="auto"]');
  await p.check('[data-vs="auto"]'); await p.fill('[data-vs="maxAuto"]', '2'); await p.click('.modal-foot [data-k="ok"]'); await p.waitForTimeout(300);
  ok(await E(async () => { const s = await (await window.__ST()).loadSettings(); return s.versions.auto === true && s.versions.maxAuto === 2 && s.versions.daily && s.versions.beforeExport; }), 'ayar: otomatik sürümler açıldı, sınır 2 (kalıcı)');
  await p.evaluate(pid => { location.hash = `#/p/${pid}/plan?d=dwvP`; }, pid); await p.waitForSelector('#ps2d svg.pe-svg');
  await p.waitForFunction(pid => window.__V().then(V => V.listVersions(pid)).then(vs => vs.some(v => v.reason === 'daily')), pid);
  await p.evaluate(pid => { location.hash = `#/p/${pid}`; }, pid); await p.waitForSelector('[data-vlist]'); await p.waitForTimeout(500);
  ok(await E(async pid => (await (await window.__V()).listVersions(pid)).filter(v => v.reason === 'daily').length === 1, pid), 'günlük otomatik sürüm: proje açılınca bir kez (ikinci açılışta tekrar yok)');
  await (async () => { await p.evaluate(() => { const S = window.SAGGCAD; S.manual = 0; }); })();
  await E(async pid => { await (await window.__V()).saveVersion(pid, { name: 'elle önemli', allowDuplicate: true }); }, pid).catch(() => {});
  await p.evaluate(pid => { location.hash = `#/p/${pid}/plan?d=dwvP`; }, pid); await p.waitForSelector('#ps2d svg.pe-svg'); await p.waitForTimeout(300);
  await E(() => { const E = window.SAGGCAD.editor; E.bimCommand({ op: 'setRevisionCode', code: 'R9' }); });
  await p.waitForFunction(pid => window.__V().then(V => V.listVersions(pid)).then(vs => vs.some(v => v.reason === 'revcode')), pid);
  await E(() => { const E = window.SAGGCAD.editor; const w = E.root.walls.find(w => w.id === 'zd1'); E.bimCommand({ op: 'setInstanceParam', id: w.id, key: 'thickness', value: 28 }); });
  await p.waitForTimeout(500);
  const exp = await dl(p, () => p.evaluate(() => { window.SAGGCAD.cmds().find(c => c.id === 'file.export').run(); return new Promise(r => setTimeout(r, 300)); }).then(() => p.click('[data-x="pafta"]')));
  ok(/\.pdf$/.test(exp.name), 'pafta indirildi');
  const autos = await E(async pid => { const vs = await (await window.__V()).listVersions(pid); return { auto: vs.filter(v => v.kind === 'auto').map(v => v.reason), manual: vs.filter(v => v.kind === 'manual').length }; }, pid);
  ok(autos.auto.length === 2 && autos.auto[0] === 'export' && autos.auto.includes('revcode') && !autos.auto.includes('daily'), `otomatik: pafta öncesi + revizyon kodu; sınır 2 → en eski otomatik (günlük) silindi (${autos.auto.join(', ')})`);
  ok(autos.manual >= 1, 'sınır temizliği elle kaydedilen sürümlere dokunmadı');
  const dupAuto = await E(async pid => { const V = await window.__V(); const r = await V.autoVersion(pid, 'export', { versions: { auto: true } }); return r.ok === false && !!r.duplicate; }, pid);
  ok(dupAuto, 'aynı içerik için ikinci otomatik sürüm oluşturulmadı');
  ok(!errs.length, 'konsol / sayfa hatası yok' + (errs.length ? ': ' + errs.join(' | ') : ''));

  // 26. çevrimdışı: sürüm modülleri önbellekte; sürüm kaydet / liste / geri yükleme çalışır
  await E(async () => { if (location.protocol !== 'https:') await navigator.serviceWorker.register('sw.js'); await navigator.serviceWorker.ready; });
  await p.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 20000 });
  ok(await E(async () => { const c = await caches.open((await caches.keys()).find(k => k.startsWith('saggcad-'))); return (await Promise.all(['js/versions.js', 'js/verui.js'].map(u => c.match(u)))).every(Boolean); }), 'sw önbelleği: versions.js, verui.js');
  await ctx.setOffline(true);
  await p.reload(); await p.waitForSelector('#ps2d svg.pe-svg', { timeout: 15000 }); await p.waitForTimeout(300);
  await E(() => { const E = window.SAGGCAD.editor; const w = E.root.walls.find(w => w.id === 'zd1'); E.bimCommand({ op: 'setInstanceParam', id: w.id, key: 'thickness', value: 27 }); });
  await runCmd(p, 'file.vsave'); await p.waitForSelector('#vrName'); await p.fill('#vrName', 'çevrimdışı sürüm'); await p.click('.modal-foot [data-k="ok"]');
  await p.waitForFunction(() => window.__toasts.some(t => t.includes('çevrimdışı sürüm')));
  await runCmd(p, 'file.versions'); await p.waitForSelector('.vr-list');
  ok(await E(() => document.querySelector('.vr-row .vr-t b').textContent === 'çevrimdışı sürüm'), '26. çevrimdışı: sürüm kaydedildi ve listede');
  await closeModals(p);
  await ctx.setOffline(false);
  await ctx.close();

  /* ═══ 27. mobil: kaydet, liste, kopya geri yükleme, karşılaştırma erişilebilir ═══ */
  {
    const mc = await b.newContext({ ...devices['Pixel 7'], acceptDownloads: true }); const m = await mc.newPage(); await setup(m); const merr = [];
    m.on('pageerror', e => merr.push(e.message)); m.on('console', x => x.type() === 'error' && merr.push(x.text()));
    const mid = await importFile(m, VILLA);
    await m.evaluate(id => { location.hash = `#/p/${id}/plan?d=dwvP`; }, mid); await m.waitForSelector('#ps2d svg.pe-svg'); await m.waitForTimeout(400);
    await m.click('[data-burger]'); await m.waitForSelector('.cmdk-back input'); await m.fill('.cmdk-back input', 'Sürüm Kaydet'); await m.keyboard.press('Enter');
    await m.waitForSelector('#vrName'); await m.click('.modal-foot [data-k="ok"]');
    await m.waitForFunction(() => window.__toasts.some(t => t.includes('kaydedildi')));
    await m.evaluate(() => { const E = window.SAGGCAD.editor; const w = E.root.walls.find(w => w.id === 'zd1'); E.bimCommand({ op: 'setInstanceParam', id: w.id, key: 'thickness', value: 30 }); });
    await m.waitForTimeout(500);
    await m.click('[data-burger]'); await m.waitForSelector('.cmdk-back input'); await m.fill('.cmdk-back input', 'Proje Sürümleri'); await m.keyboard.press('Enter');
    await m.waitForSelector('.vr-list');
    const lay = await m.evaluate(() => { const vw = innerWidth; const els = [...document.querySelectorAll('.modal, .vr-row, .vr-act .btn, .vr-cmp')]; return { fit: els.every(e => { const r = e.getBoundingClientRect(); return r.left >= -1 && r.right <= vw + 1; }), noHScroll: document.querySelector('.modal-body').scrollWidth <= document.querySelector('.modal-body').clientWidth + 1, tap: [...document.querySelectorAll('.vr-act .btn')].every(e => e.getBoundingClientRect().height >= 32) }; });
    ok(lay.fit && lay.noHScroll && lay.tap, 'mobil: yönetici ekrana sığıyor, yatay kaydırma yok, dokunma hedefleri ≥ 32 px');
    if (OUT) await m.screenshot({ path: path.join(OUT, 'mobil-proje-surumleri.png') });
    await m.tap('.vr-row [data-va="cmp"]'); await m.waitForSelector('[data-vdiff]');
    ok(await m.evaluate(() => { const r = document.querySelector('.modal-back:last-child .modal').getBoundingClientRect(); return r.right <= innerWidth + 1 && !!document.querySelector('[data-vdiff] [data-vdw]'); }), 'mobil: güncel proje ile karşılaştırma açıldı');
    await m.tap('.modal-back:last-child .modal-foot [data-k="ok"]'); await m.waitForTimeout(250);
    await m.tap('.vr-row [data-va="copy"]'); await m.waitForSelector('#vrCopy'); await m.tap('.modal-back:last-child .modal-foot [data-k="ok"]');
    await m.waitForFunction(id => window.SAGGCAD.project && window.SAGGCAD.project.id !== id, mid);
    ok(await m.evaluate(async () => !!(await (await window.__ST()).getProject(window.SAGGCAD.project.id))?.restoredFrom), 'mobil: kopya olarak geri yükleme');
    ok(!merr.length, 'mobil: konsol hatası yok' + (merr.length ? ': ' + merr.join(' | ') : ''));
    await mc.close();
  }
  await b.close();
  console.log('B4D uçtan uca: TÜMÜ GEÇTİ');
})().catch(e => { console.error(e); process.exit(1); });
