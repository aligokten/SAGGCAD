/* B4D performans ölçümü — gerçek tarayıcı, gerçek IndexedDB (ayrı, boş test bağlamı). 100 / 500 / 1000 sentetik sürüm.
 * Her sürüm bir öncekinden bir duvar kalınlığıyla ayrılır (farklı karma); hepsi aynı görseli paylaşır (tekilleştirme).
 *   npm start ; node tests/e2e/b4d-perf.e2e.cjs http://localhost:8080/  [çıktı JSON: B4D_PERF=dosya.json]
 * Playwright yoksa ölçüm atlanır ve bunu açıkça bildirir.
 */
const fs = require('fs'), path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); } catch { console.log('ATLANDI: playwright bulunamadı — ölçüm yapılmadı'); process.exit(2); }
const BASE = process.argv[2] || 'http://localhost:8080/';
const VILLA = path.join(__dirname, '..', 'fixtures', 'villa-ornek.saggcad.json');

(async () => {
  const b = await chromium.launch(); const p = await (await b.newContext()).newPage();
  p.setDefaultTimeout(600000);
  await p.goto(BASE); await p.waitForSelector('.sc-page');
  const res = await p.evaluate(async villa => {
    const V = await import('./js/versions.js'), ST = await import('./js/store.js');
    const now = () => performance.now(), avg = a => a.reduce((s, x) => s + x, 0) / a.length, pct = (a, q) => [...a].sort((x, y) => x - y)[Math.floor(a.length * q)];
    // ≈ 300 KB sıkıştırılamaz görsel (gürültü PNG)
    const c = Object.assign(document.createElement('canvas'), { width: 320, height: 240 }); const g = c.getContext('2d'); const im = g.createImageData(320, 240);
    for (let i = 0; i < im.data.length; i++) im.data[i] = (Math.random() * 256) | 0;
    g.putImageData(im, 0, 0); const blob = await new Promise(r => c.toBlob(r, 'image/png'));
    const P = JSON.parse(villa).project; P.photos = [{ id: 'phPerf', tag: 'rolove', caption: 'gürültü', t: 1 }];
    await ST.putBlob('phPerf', blob); await ST.saveProject(P);
    const json = V.canonical(V.snapshotOf(P, { phPerf: 'sha256:x' }));
    const t0 = now(); for (let i = 0; i < 50; i++) await V.sha256(json); const hashSnap = (now() - t0) / 50;
    const t1 = now(); for (let i = 0; i < 20; i++) await V.sha256(blob); const hashImg = (now() - t1) / 20;
    const t2 = now(); for (let i = 0; i < 50; i++) V.canonical(V.snapshotOf(P, {})); const canon = (now() - t2) / 50;
    const out = { snapshotBytes: V.byteLen(json), imageBytes: blob.size, hashSnapshotMs: hashSnap, hashImageMs: hashImg, canonicalMs: canon, checkpoints: [] };
    const saves = []; const wall = P.drawings[1].plan.walls[0];
    for (let n = 1; n <= 1000; n++) {
      wall.t = 20 + n / 100;
      const s = now(); const r = await V.saveVersion(P.id, { name: `perf ${n}`, project: P }); saves.push(now() - s);
      if (!r.ok) throw new Error('kaydedilemedi ' + n);
      if (n === 100 || n === 500 || n === 1000) {
        const l0 = now(); const list = await V.listVersions(P.id); const listMs = now() - l0;
        const oldest = list.at(-1), newest = list[0];
        const p0 = now(); await V.loadVersion(oldest.id); const previewMs = now() - p0;
        const v0 = now(); await V.verifyVersion(oldest.id, { deep: true }); const verifyMs = now() - v0;
        const c0 = now(); const cmp = await V.compareVersions(oldest.id, newest.id); const compareMs = now() - c0;
        const r0 = now(); const rc = await V.restoreVersion(newest.id, { mode: 'copy' }); const restoreMs = now() - r0;
        await ST.deleteProject(rc.project);
        const sum = await V.storageSummary(P.id); const est = await navigator.storage.estimate();
        const recent = saves.slice(-100);
        out.checkpoints.push({ n, saveAvgMs: avg(recent), saveP95Ms: pct(recent, 0.95), listMs, previewMs, verifyMs, compareMs, restoreCopyMs: restoreMs, compareRows: cmp.drawings[1].qty.rows.length, storage: sum, usageBytes: est.usage });
      }
    }
    out.dedup = { referencedIfCopied: out.checkpoints.at(-1).storage.assetsReferenced, stored: out.checkpoints.at(-1).storage.assetsStored };
    return out;
  }, fs.readFileSync(VILLA, 'utf8'));
  const kb = n => (n / 1024).toFixed(1) + ' KB', mb = n => (n / 1048576).toFixed(2) + ' MB', ms = n => n.toFixed(1) + ' ms';
  console.log(`anlık görüntü ${kb(res.snapshotBytes)} · görsel ${kb(res.imageBytes)} · belirlenimci JSON ${ms(res.canonicalMs)} · SHA-256 anlık görüntü ${ms(res.hashSnapshotMs)} · SHA-256 görsel ${ms(res.hashImageMs)}`);
  console.log('N\tkaydet ort/p95\tliste\tönizleme\tderin denetim\tkarşılaştır\tkopya geri yükle\tiçerik\tgörsel (tekil)\tIndexedDB kullanım');
  for (const c of res.checkpoints) console.log(`${c.n}\t${ms(c.saveAvgMs)} / ${ms(c.saveP95Ms)}\t${ms(c.listMs)}\t${ms(c.previewMs)}\t${ms(c.verifyMs)}\t${ms(c.compareMs)}\t${ms(c.restoreCopyMs)}\t${mb(c.storage.snapshots)}\t${kb(c.storage.assetsStored)} (${c.storage.uniqueAssets})\t${mb(c.usageBytes)}`);
  console.log(`tekilleştirme: 1000 sürüm görseli kopyalansaydı ${mb(res.dedup.referencedIfCopied)}, saklanan ${kb(res.dedup.stored)}`);
  if (process.env.B4D_PERF) fs.writeFileSync(process.env.B4D_PERF, JSON.stringify(res, null, 1));
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
