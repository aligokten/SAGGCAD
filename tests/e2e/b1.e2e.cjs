/* B1 uçtan uca tarayıcı testi (isteğe bağlı — proje bağımlılığı değildir).
 * Gereken: Playwright + Chromium kurulu bir ortam ve çalışan statik sunucu.
 *   npm start                    # http://localhost:8080
 *   node tests/e2e/b1.e2e.cjs http://localhost:8080/
 * Playwright yoksa test atlanır ve bunu açıkça bildirir (başarılı sayılmaz).
 */
const path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); } catch { console.log('ATLANDI: playwright bulunamadı — bu test çalıştırılmadı'); process.exit(2); }
const BASE = process.argv[2] || 'http://localhost:8080/';
const FIXTURE = path.join(__dirname, '..', 'fixtures', 'eski-proje-v1.saggcad.json');
const ok = (c, m) => { if (!c) throw new Error('B1 HATA: ' + m); console.log('✓', m); };

(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await b.newContext({ viewport: { width: 1600, height: 950 }, acceptDownloads: true });
  const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', e => errs.push('PAGE: ' + e.message)); p.on('console', m => m.type() === 'error' && errs.push('CONSOLE: ' + m.text()));
  await p.goto(BASE); await p.waitForSelector('[data-imp]', { state: 'attached' });

  // A) eski sürüm proje dosyası açılıyor
  await p.setInputFiles('[data-imp]', FIXTURE); await p.waitForSelector('.dw-list');
  ok(await p.locator('.dw-card').count() === 2, 'eski proje dosyası içe aktarıldı (2 çizim)');
  await p.click('.dw-card.main a.btn-primary'); await p.waitForSelector('#ps2d svg.pe-svg'); await p.waitForTimeout(500);
  const before = await p.evaluate(() => JSON.stringify(window.SAGGCAD.editor.root));
  const rep = await p.evaluate(() => window.SAGGCAD.bim.report());
  ok(rep.byClass.column === 2 && rep.byClass.beam === 1 && rep.levels === 2, `BIM modeli türetildi: ${rep.elements} eleman, ${rep.levels} kat`);

  // B) özellik panelinde salt okunur BIM bilgisi
  await p.evaluate(() => window.SAGGCAD.editor.setSel([{ kind: 'wall', id: 'wfx001' }]));
  await p.waitForSelector('.bim-sec'); await p.click('.bim-sec summary'); await p.waitForTimeout(150);
  const txt = await p.textContent('.bim-sec');
  ok(txt.includes('DIS-DUV-01') && txt.includes('wfx001') && txt.includes('Dış duvar — tuğla 19'), 'panelde BIM türü, eleman kimliği ve kompozit görünüyor');
  ok(await p.locator('.bim-sec input, .bim-sec select, .bim-sec textarea').count() === 0, 'BIM parametreleri düzenlenebilir gibi gösterilmiyor');
  ok(await p.locator('.pe-insp [data-k=t]').count() === 1, 'mevcut kalınlık alanı yerinde');
  if (process.env.SHOTS) await p.screenshot({ path: path.join(process.env.SHOTS, 'b1-insp.png') });
  ok(before === await p.evaluate(() => JSON.stringify(window.SAGGCAD.editor.root)), 'BIM paneli veriyi değiştirmedi');

  // C) mevcut düzenleme çalışıyor; BIM değişikliği izliyor
  await p.fill('.pe-insp [data-k=t]', '30'); await p.dispatchEvent('.pe-insp [data-k=t]', 'change'); await p.waitForTimeout(200);
  const th = await p.evaluate(() => window.SAGGCAD.bim.resolveElementParameters('wfx001').find(x => x.k === 'thickness'));
  ok(th.value === 30 && th.source === 'instance' && th.typeValue === 26.5, 'kalınlık değişince BIM parametresi eleman kaynağına geçti');

  // D) bozuk ilişki raporu (Araçlar → BIM model raporu)
  await p.keyboard.press('Control+k'); await p.keyboard.type('bim model'); await p.keyboard.press('Enter');
  await p.waitForSelector('.bim-report');
  ok((await p.textContent('.bim-report')).includes('wSILINMIS'), 'BIM raporu bozuk ilişkiyi gösteriyor');
  if (process.env.SHOTS) await p.screenshot({ path: path.join(process.env.SHOTS, 'b1-report.png') });
  await p.click('.modal-foot [data-k=ok]');

  // E) yeni dış duvarlar çiz; kaydet ve yeniden aç
  await p.waitForSelector('.modal-back', { state: 'detached' });
  await p.click('.tool[data-tool=wall]'); await p.selectOption('#peWK', 'dis');
  const C = await p.evaluate(() => { const e = window.SAGGCAD.editor, r = e.svg.getBoundingClientRect(); return e.toW(r.width / 2, r.height / 2 + 80); });
  const scr = (x, y) => p.evaluate(([x, y]) => { const e = window.SAGGCAD.editor, r = e.svg.getBoundingClientRect(); return { x: r.left + e.ox + x * e.s, y: r.top + e.oy + y * e.s }; }, [x, y]);
  for (const [dx, dy] of [[-150, 0], [150, 0], [150, 200]]) { const q = await scr(C.x + dx, C.y + dy); await p.mouse.click(q.x, q.y); await p.waitForTimeout(80); }
  await p.keyboard.press('Escape');
  const n = await p.evaluate(() => window.SAGGCAD.bim.getElementsByTypeId('DIS-DUV-01').length);
  ok(n >= 3, `aynı türden birden çok duvar: DIS-DUV-01 × ${n}`);
  const ids = await p.evaluate(() => window.SAGGCAD.editor.root.walls.map(w => w.id));
  await p.waitForTimeout(800); await p.reload(); await p.waitForSelector('#ps2d svg.pe-svg'); await p.waitForTimeout(500);
  ok(JSON.stringify(ids) === JSON.stringify(await p.evaluate(() => window.SAGGCAD.editor.root.walls.map(w => w.id))), `kaydet / yeniden aç: ${ids.length} duvar kimliği aynı`);
  ok(await p.evaluate(() => !JSON.stringify(window.SAGGCAD.editor.root).includes('"schema":1')), 'kayıtta BIM zarfı yok (eski model ana kaynak)');

  // F) 3D ve dışa aktarma
  await p.click('#psMode [data-m="3d"]'); await p.waitForSelector('#p3host canvas', { timeout: 30000 });
  await p.click('.mb-m[data-m=file] .mb-b');
  const [d] = await Promise.all([p.waitForEvent('download'), p.click('.mb-dd [data-c="file.dxf"]')]);
  ok(!!(await d.path()), '3D açıldı, DXF dışa aktarıldı');
  ok(!errs.length, 'konsol hatası yok ' + (errs.length ? JSON.stringify(errs) : ''));
  await b.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
