/* B4C uçtan uca: Metraj Farkı sekmesi (filtre, gruplama, müdahale yöntemi, birim fiyat, toplam, çizimde göster), CSV / PDF
 * (gömülü yazı tipi), geri al / yinele, kaydet / yeniden aç, tasarım sınırları (MAX) → Model Sağlığı, mobil, çevrimdışı.
 * İsteğe bağlı — proje bağımlılığı değildir:  npm start ; node tests/e2e/b4c.e2e.cjs http://localhost:8080/
 * Playwright yoksa test atlanır ve bunu açıkça bildirir (başarılı sayılmaz).
 */
const path = require('path'), fs = require('fs');
let chromium, devices;
try { ({ chromium, devices } = require('playwright')); } catch { console.log('ATLANDI: playwright bulunamadı — bu test çalıştırılmadı'); process.exit(2); }
const BASE = process.argv[2] || 'http://localhost:8080/';
const VILLA = path.join(__dirname, '..', 'fixtures', 'villa-ornek.saggcad.json');
const OUT = process.env.B4C_OUT || null;
const ok = (c, m) => { if (!c) throw new Error('B4C HATA: ' + m); console.log('✓', m); };
const runCmd = (p, id) => p.evaluate(id => { window.SAGGCAD.cmds().find(c => c.id === id).run(); }, id);
async function dl(p, fn) { const [d] = await Promise.all([p.waitForEvent('download'), fn()]); const f = await d.path(); const buf = fs.readFileSync(f); if (OUT) fs.copyFileSync(f, path.join(OUT, d.suggestedFilename())); return { name: d.suggestedFilename(), buf }; }
async function openVilla(p) {
  await p.goto(BASE); await p.waitForSelector('[data-imp]', { state: 'attached' });
  await p.setInputFiles('[data-imp]', VILLA); await p.waitForSelector('.dw-list');
  await p.evaluate(() => { const S = window.SAGGCAD; location.hash = `#/p/${S.project.id}/plan?d=dwvP`; }); await p.waitForSelector('#ps2d svg.pe-svg'); await p.waitForTimeout(400);
}
const cell = (p, label, col) => p.evaluate(([label, col]) => { const tr = [...document.querySelectorAll('.rv-qty tbody tr')].find(r => r.querySelector('td')?.textContent.trim().startsWith(label)); return tr ? tr.children[col].textContent.trim() : null; }, [label, col]);

(async () => {
  if (OUT) fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1500, height: 950 }, acceptDownloads: true });
  const p = await ctx.newPage(); const errs = [];
  p.setDefaultTimeout(20000);
  p.on('pageerror', e => errs.push('PAGE: ' + e.message)); p.on('console', m => m.type() === 'error' && errs.push('CONSOLE: ' + m.text()));
  const E = (fn, a) => p.evaluate(fn, a), blur = () => E(() => { document.activeElement?.blur(); });
  await openVilla(p);
  const R0 = await E(() => JSON.stringify(window.SAGGCAD.project.drawings.find(d => d.main).plan));

  // ── Metraj Farkı sekmesi ──
  await runCmd(p, 'model.revision'); await p.waitForSelector('.rv');
  await p.click('[data-tab="qty"]'); await p.waitForSelector('.rv-qty');
  ok(await cell(p, 'Yatay delikli tuğla duvar (brüt yüzey)', 2) === '352,80' && await cell(p, 'Yatay delikli tuğla duvar (brüt yüzey)', 5) === '33,60', 'tuğla brüt: mevcut 352,80 m², kesin söküm 33,60 m² (7,00×2,80 + 5,00×2,80)');
  ok(await cell(p, 'Gazbeton G4/06 duvar (brüt yüzey)', 6) === '22,40' && await cell(p, 'Gazbeton G4/06 duvar (brüt yüzey)', 4) === '+22,40', 'gazbeton: yeni imalat 22,40 m², net +22,40');
  ok(await cell(p, 'Pencere 240×150 cm', 6) === '1,00' && await cell(p, 'Pencere 180×150 cm', 5) === '1,00', 'doğrama: 180×150 söküm, 240×150 montaj ayrı');
  ok(await E(() => [...document.querySelectorAll('.rv-warn')].some(w => /3 eleman için karar bekleniyor/.test(w.textContent))), 'karar bekleyen 3 eleman uyarısı (kesin toplama girmez)');
  ok(await E(() => [...document.querySelectorAll('.rv-gh td')].map(t => t.textContent).includes('Duvar') && document.querySelectorAll('.rv-tot').length > 3), 'gruplama ve grup toplam satırları');
  const amount = await cell(p, 'Gazbeton G4/06 duvar (net yüzey)', 9);
  ok(/^19\.684,00$/.test(amount), `birim fiyat (kullanıcı): 20,72 m² × 950 = 19.684,00 TRY (${amount})`);
  ok(await E(() => [...document.querySelectorAll('.rv-qty tbody td')].some(t => t.textContent.includes('fiyat girilmedi'))), 'fiyatı girilmemiş kalem "fiyat girilmedi" (0 değil)');
  if (OUT) await p.screenshot({ path: path.join(OUT, 'metraj-farki-sekmesi.png') });
  // filtre: kat 1 + kategori
  await p.selectOption('[data-level]', 'k1'); await p.waitForTimeout(100);
  ok(await cell(p, 'Yatay delikli tuğla duvar (brüt yüzey)', 4) === '-1,20', '1. kat filtresi: banyo duvarı 6,00 m × (2,60 − 2,80) = −1,20 m²');
  ok(await cell(p, 'Yatay delikli tuğla duvar (brüt yüzey)', 5) === '0,00' && /^0,00 \/ 1,20$|1,20/.test(await cell(p, 'Yatay delikli tuğla duvar (brüt yüzey)', 7)), 'yöntem seçilmedi: kesin söküm 0, onay bekleyen 1,20');
  await p.selectOption('[data-level]', '*');
  // ── müdahale yöntemi (Elemanlar sekmesi) → kesin toplama girer; tek Ctrl+Z ──
  await p.click('[data-tab="el"]'); await p.selectOption('[data-status]', '*'); await p.waitForTimeout(100);
  await p.selectOption('.rv-list tr[data-key="k1/ki2"] [data-method]', 'partial'); await p.waitForTimeout(150);
  await p.click('[data-tab="qty"]'); await p.selectOption('[data-level]', 'k1'); await p.waitForTimeout(100);
  ok(await cell(p, 'Yatay delikli tuğla duvar (brüt yüzey)', 5) === '1,20', 'kısmi müdahale onayı: söküm 1,20 m² kesin toplamda');
  // ── birim fiyat girişi (kullanıcı) + tek Ctrl+Z ──
  await p.selectOption('[data-level]', '*'); await p.waitForTimeout(100);
  const tr = '.rv-qty tbody tr:has(td button:text-is("Yatay delikli tuğla duvar (brüt yüzey)"))';
  await p.fill(`${tr} [data-pk="demolish"]`, '200'); await p.dispatchEvent(`${tr} [data-pk="demolish"]`, 'change'); await p.waitForTimeout(150);
  ok(await cell(p, 'Yatay delikli tuğla duvar (brüt yüzey)', 9) === '6.960,00', 'söküm fiyatı 200 × 34,80 = 6.960,00');
  await p.click('.modal-foot [data-k="ok"]'); await p.waitForTimeout(200);
  const price = () => E(() => window.SAGGCAD.editor.root.meta.revision.qty.prices['wall-gross:tugla-yatay|demolish']);
  ok(await price() === 200, 'fiyat çizimde saklandı (meta.revision.qty)');
  await blur(); await p.keyboard.press('Control+z'); await p.waitForTimeout(120);
  ok(await price() === undefined, 'fiyat tek Ctrl+Z ile geri alındı');
  await p.keyboard.press('Control+z'); await p.waitForTimeout(120);
  ok(await E(() => window.SAGGCAD.editor.root.meta.revision.methods['k1/ki2']) === undefined, 'müdahale yöntemi tek Ctrl+Z ile geri alındı');
  await p.keyboard.press('Control+Shift+z'); await p.keyboard.press('Control+Shift+z'); await p.waitForTimeout(150);
  ok(await price() === 200 && await E(() => window.SAGGCAD.editor.root.meta.revision.methods['k1/ki2']) === 'partial', 'yinele: yöntem ve fiyat geri geldi');
  // ── satırdan çizimde göster ──
  await runCmd(p, 'model.revision'); await p.waitForSelector('.rv'); await p.click('[data-tab="qty"]');
  await p.click('.rv-qty tbody tr:has(td button:text-is("Gazbeton G4/06 duvar (net yüzey)")) [data-qshow]'); await p.waitForTimeout(300);
  ok(await E(() => document.querySelectorAll('.rev-layer .rev-hl').length) >= 2, 'metraj satırı → ilgili duvarlar (zi2, zn1) çizimde vurgulandı');
  // ── CSV ──
  await runCmd(p, 'model.revision'); await p.waitForSelector('.rv'); await p.click('[data-tab="qty"]');
  const csv = await dl(p, () => p.click('[data-qcsv]')), txt = csv.buf.toString('utf8'), rows = txt.replace(/^﻿/, '').trim().split('\r\n').map(l => l.split(';'));
  const tg = rows.find(r => r[1] === 'Yatay delikli tuğla duvar (brüt yüzey)');
  ok(txt.startsWith('﻿') && tg && tg[2] === 'm²' && tg[3] === '352,800' && tg[6] === '34,800' && tg[12] === '6960,000', `CSV: BOM, ";", ondalık virgül, birim; tuğla brüt 352,800 / söküm 34,800 / tutar 6960,000`);
  ok(rows.some(r => r[0] === 'GENEL TOPLAM TUTAR') && rows.some(r => /TOPLAM$/.test(r[0])), 'CSV grup ve genel toplam satırları');
  // ── PDF (gömülü yazı tipi) ──
  const pdf = await dl(p, () => p.click('[data-qpdf]')), ps = pdf.buf.toString('latin1');
  const pdfText = await E(async bytes => {   // uygulamanın pdf.js'iyle metni çıkar
    const pdfjs = await import('./vendor/pdfjs/pdf.min.mjs'); pdfjs.GlobalWorkerOptions.workerSrc = 'vendor/pdfjs/pdf.worker.min.mjs';
    const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes) }).promise, pg = await doc.getPage(1), tc = await pg.getTextContent();
    return { pages: doc.numPages, text: tc.items.map(i => i.str).join(' '), w: pg.view[2], h: pg.view[3] };
  }, [...pdf.buf]);
  ok(ps.startsWith('%PDF-') && /\/FontFile2/.test(ps), `PDF metraj raporu: yazı tipi gömülü (${(pdf.buf.length / 1024).toFixed(0)} kB, ${pdfText.pages} sayfa, A4 yatay ${Math.round(pdfText.w)}×${Math.round(pdfText.h)} pt)`);
  ok(['İmalat metrajı ve tadilat farkı', 'Örnek villa', 'Yatay delikli tuğla duvar (brüt yüzey)', 'Söküm', 'Tadilat projesi', 'R1'].every(t => pdfText.text.includes(t)), 'PDF metninde Türkçe karakterler korunmuş (İ, ı, ş, ğ, ü, ö, ç)');
  await p.click('.modal-foot [data-k="ok"]'); await p.waitForTimeout(200);
  // ── tasarım sınırları (MAX) ──
  await runCmd(p, 'model.limits'); await p.waitForSelector('[data-lim]');
  await p.fill('[data-lim="maxRoomArea"]', '30'); await p.fill('[data-lim="maxWallLength"]', '1100');
  await p.click('.modal-foot [data-k="ok"]'); await p.waitForTimeout(300);
  const lim = await E(() => window.SAGGCAD.editor.root.meta.limits);
  ok(lim.maxRoomArea === 30 && lim.maxWallLength === 1100, 'sınırlar kaydedildi (meta.limits)');
  await runCmd(p, 'tools.health'); await p.waitForSelector('.model-health');
  const lt = await E(() => [...document.querySelectorAll('.model-health .bim-iss li')].map(li => li.textContent).filter(t => /sınır/.test(t)));
  ok(lt.some(t => /Salon \+ yemek alanı: .* > sınır 30 m²/.test(t)) && lt.some(t => /boyu: 1\.?200 cm > sınır 1\.?100 cm/.test(t)), `Model Sağlığı sınır aşımları: ${lt.length}`);
  await p.click('.modal-foot [data-k="ok"]'); await p.waitForTimeout(200);
  ok(await E(() => window.SAGGCAD.editor.root.walls.find(w => w.id === 'zd1').b.x) === 1200, 'aşımda çizim değiştirilmedi');
  await blur(); await p.keyboard.press('Control+z'); await p.waitForTimeout(120);
  ok(await E(() => window.SAGGCAD.editor.root.meta.limits) === undefined, 'sınırlar tek Ctrl+Z ile geri alındı');
  await p.keyboard.press('Control+Shift+z'); await p.waitForTimeout(120);
  // ── kaydet / yeniden aç ──
  ok(await E(() => JSON.stringify(window.SAGGCAD.project.drawings.find(d => d.main).plan)) === R0, 'metraj ve kararlar rölöve JSON\'unu değiştirmedi');
  await p.waitForTimeout(900);
  const before = await E(() => JSON.stringify(window.SAGGCAD.editor.root.meta));
  await p.reload(); await p.waitForSelector('#ps2d svg.pe-svg'); await p.waitForTimeout(400);
  ok(await E(() => JSON.stringify(window.SAGGCAD.editor.root.meta)) === before, 'kaydet / yeniden aç: fiyat, yöntem, sınır korunuyor');
  ok(!errs.length, 'konsol / sayfa hatası yok' + (errs.length ? ': ' + errs.join(' | ') : ''));
  // ── çevrimdışı: metraj + PDF yazı tipi önbellekte ──
  await E(async () => { if (location.protocol !== 'https:') await navigator.serviceWorker.register('sw.js'); await navigator.serviceWorker.ready; });
  await p.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 20000 });
  const cached = await E(async () => { const c = await caches.open((await caches.keys()).find(k => k.startsWith('saggcad-'))); return Promise.all(['js/bim/quantities.js', 'js/bim/qtydiff.js', 'js/pdffont.js', 'vendor/fonts/DejaVuSans.ttf', 'vendor/jspdf.umd.min.js'].map(async u => !!(await c.match(new URL(u, location.href).href)))); });
  ok(cached.every(Boolean), 'metraj modülleri, jsPDF ve yazı tipi çevrimdışı önbellekte');
  await ctx.setOffline(true);
  await p.reload(); await p.waitForSelector('#ps2d svg.pe-svg', { timeout: 15000 }); await p.waitForTimeout(400);
  await runCmd(p, 'model.revision'); await p.waitForSelector('.rv'); await p.click('[data-tab="qty"]'); await p.waitForSelector('.rv-qty');
  const off = await dl(p, () => p.click('[data-qpdf]'));
  ok(/\/FontFile2/.test(off.buf.toString('latin1')), 'çevrimdışı: Metraj Farkı açıldı, PDF yazı tipi gömülü');
  await ctx.setOffline(false);
  await b.close();
  // ── mobil ──
  const mb = await chromium.launch(); const mp = await (await mb.newContext({ ...devices['Pixel 7'] })).newPage(); const merr = [];
  mp.on('pageerror', e => merr.push(e.message)); mp.on('console', m => m.type() === 'error' && merr.push(m.text()));
  await openVilla(mp);
  await mp.evaluate(() => window.SAGGCAD.cmds().find(c => c.id === 'model.revision').run()); await mp.waitForSelector('.rv'); await mp.click('[data-tab="qty"]'); await mp.waitForSelector('.rv-qty');
  const fit = await mp.evaluate(() => { const vw = innerWidth, m = document.querySelector('.modal').getBoundingClientRect(), list = document.querySelector('.rv-qty').getBoundingClientRect(); return { m: m.right <= vw + 1 && m.left >= 0, list: list.right <= vw + 1, sw: document.documentElement.scrollWidth <= vw + 1 }; });
  ok(fit.m && fit.list && fit.sw, 'mobil: Metraj Farkı penceresi ekrana sığıyor (tablo kendi içinde kayar)');
  await mp.evaluate(() => { document.querySelector('.modal-foot [data-k="ok"]').click(); window.SAGGCAD.cmds().find(c => c.id === 'model.limits').run(); }); await mp.waitForSelector('[data-lim]');
  ok(await mp.evaluate(() => document.querySelector('.modal').getBoundingClientRect().right <= innerWidth + 1), 'mobil: tasarım sınırları penceresi sığıyor');
  ok(!merr.length, 'mobil: konsol hatası yok' + (merr.length ? ': ' + merr.join(' | ') : ''));
  await mb.close();
  console.log('B4C: TÜMÜ GEÇTİ');
})().catch(e => { console.error(e.message); process.exit(1); });
