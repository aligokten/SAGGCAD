/* B3-D uçtan uca: Model Sağlığı, önerilen düzeltme (geri alınabilir), parametrik yay, kayıt / yeniden yükleme,
 * çevrimdışı (service worker yeni modülleri önbellekte). İsteğe bağlı — proje bağımlılığı değildir.
 *   npm start ; node tests/e2e/b3-ui.e2e.cjs http://localhost:8080/
 * Playwright yoksa test atlanır ve bunu açıkça bildirir (başarılı sayılmaz).
 */
const path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); } catch { console.log('ATLANDI: playwright bulunamadı — bu test çalıştırılmadı'); process.exit(2); }
const BASE = process.argv[2] || 'http://localhost:8080/';
const FIXTURE = path.join(__dirname, '..', 'fixtures', 'eski-proje-v1.saggcad.json');
const ok = (c, m) => { if (!c) throw new Error('B3-UI HATA: ' + m); console.log('✓', m); };

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1500, height: 900 } });
  const p = await ctx.newPage(); const errs = [], infos = [];
  p.setDefaultTimeout(20000);
  const failed = []; p.on('requestfailed', r => failed.push(r.url()));
  p.on('pageerror', e => errs.push('PAGE: ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text()); if (m.type() === 'info' && m.text().includes('Model Sağlığı')) infos.push(m.text()); });
  const E = (fn, a) => p.evaluate(fn, a);
  await p.goto(BASE); await p.waitForSelector('[data-imp]', { state: 'attached' });
  await p.setInputFiles('[data-imp]', FIXTURE); await p.waitForSelector('.dw-list');
  await p.click('.dw-card.main a.btn-primary'); await p.waitForSelector('#ps2d svg.pe-svg'); await p.waitForTimeout(500);
  const runCmd = id => E(id => { window.SAGGCAD.cmds().find(c => c.id === id).run(); }, id);   // run() pencere kapanınca çözülür — beklenmez

  // ── Model Sağlığı ──
  await runCmd('tools.health'); await p.waitForSelector('.model-health');
  const cards = await E(() => [...document.querySelectorAll('.mh-card')].map(c => [c.querySelector('span').textContent, +c.querySelector('b').textContent]));
  const C = Object.fromEntries(cards);
  ok(C['Eleman'] > 20 && 'Kata bağlı' in C && 'Birleşim sorunu' in C && 'Çözülemeyen kısıt' in C && 'Geçersiz geometri' in C, `Model Sağlığı sayaçları: ${JSON.stringify(C)}`);
  ok(await E(() => [...document.querySelectorAll('.model-health .bim-iss li')].some(li => li.textContent.includes('ofxorphan'))), 'sahipsiz açıklık kısa mesajla listelendi (aşama etiketiyle)');
  ok(infos.length > 0, 'ayrıntılar konsolda (console.info)');
  ok(await E(() => [...document.querySelectorAll('.mh-last div')].map(d => d.textContent).join(' | ').includes('Duvar geometrisi')), 'son model güncellemesi / geometri yolu / 3D durumu gösteriliyor');
  await p.click('.modal-foot [data-k="ok"]'); await p.waitForTimeout(250);

  // ── önerilen düzeltme: kat yüksekliği eski yoldan değişti → bağlı kolon eski kalır → "Uygula" (komut, geri alınabilir) ──
  ok(await E(() => window.SAGGCAD.editor.bimCommand({ op: 'setTopBinding', id: 'ifxcol1', mode: 'level' }).ok), 'kolon kata bağlandı');
  await E(() => { const e = window.SAGGCAD.editor; e.hist.open('Kat ayarı'); e.root.meta.wallH = 320; e.hist.close(); e.changed(); });
  const hCol = () => E(() => window.SAGGCAD.editor.root.items.find(i => i.id === 'ifxcol1').h);
  const h0 = await hCol();
  await runCmd('tools.health'); await p.waitForSelector('.model-health [data-mh-fix]');
  ok(h0 !== 320 - 0 && (await E(() => window.SAGGCAD.bim.health().solve.conflicts.some(c => c.code === 'BINDING_STALE'))), `bağ çakışması raporlandı, değer kendiliğinden değişmedi (h = ${h0})`);
  await p.click('.model-health [data-mh-fix]'); await p.waitForTimeout(300);
  ok(await hCol() === 320 && !(await E(() => window.SAGGCAD.bim.health().solve.conflicts.some(c => c.code === 'BINDING_STALE'))), 'Uygula → kolon yüksekliği 320, çakışma kalmadı');
  await p.click('.modal-foot [data-k="ok"]'); await p.waitForTimeout(250);
  await E(() => document.activeElement?.blur()); await p.keyboard.press('Control+z'); await p.waitForTimeout(200);
  ok(await hCol() === h0, 'düzeltme tek Ctrl+Z ile geri alındı');
  await p.keyboard.press('Control+Shift+z'); await p.waitForTimeout(200);

  // ── parametrik yay: panelde yarıçap → setArcGeometry komutu ──
  await E(() => {
    const e = window.SAGGCAD.editor, P = e.root, p1 = { x: 0, y: 900 }, p2 = { x: 600, y: 900 };
    e.hist.open('Yay duvar');
    const n = 12, c = { x: 300, y: 900 + 225 }, r = 375, a1 = Math.atan2(p1.y - c.y, p1.x - c.x), a2 = Math.atan2(p2.y - c.y, p2.x - c.x);
    let sw = a2 - a1; if (sw > 0) sw -= 2 * Math.PI;   // üstten geçen yay
    const pts = Array.from({ length: n + 1 }, (_, i) => i === 0 ? p1 : i === n ? p2 : { x: +(c.x + r * Math.cos(a1 + sw * i / n)).toFixed(2), y: +(c.y + r * Math.sin(a1 + sw * i / n)).toFixed(2) });
    for (let i = 0; i < n; i++) P.walls.push({ id: `wy${i}`, a: pts[i], b: pts[i + 1], t: 20, h: 0, arc: { id: 'arcE2E', i, off: 0 } });
    e.hist.close(); e.changed();
    e.setSel(e.arcSel('wy0'));
  });
  await p.waitForSelector('[data-ak="r"]');
  const A0 = await E(() => window.SAGGCAD.bim.getArcParameters('arcE2E'));
  ok(Math.abs(A0.radius - 375) < 1 && A0.segments === 12, `yay parametreleri okundu (R ${A0.radius}, ${A0.sweep}°, yay ${A0.arcLength} cm)`);
  await p.fill('[data-ak="r"]', '520'); await p.dispatchEvent('[data-ak="r"]', 'change'); await p.waitForTimeout(300);
  const A1 = await E(() => window.SAGGCAD.bim.getArcParameters('arcE2E'));
  ok(Math.abs(A1.radius - 520) <= A1.tolerance && A1.chordLength === 600, `yarıçap 520 cm (tolerans ${A1.tolerance} cm), kiriş sabit`);
  await p.fill('[data-ak="r"]', '100'); await p.dispatchEvent('[data-ak="r"]', 'change'); await p.waitForTimeout(300);
  ok(Math.abs((await E(() => window.SAGGCAD.bim.getArcParameters('arcE2E'))).radius - 520) <= 0.5 && await E(() => !!document.querySelector('.toast')), 'geçersiz yarıçap reddedildi (kısa hata mesajı), yay değişmedi');
  await E(() => document.activeElement?.blur()); await p.keyboard.press('Control+z'); await p.waitForTimeout(200);
  ok(Math.abs((await E(() => window.SAGGCAD.bim.getArcParameters('arcE2E'))).radius - 375) < 1, 'yay değişikliği geri alındı');

  // ── kayıt / yeniden yükleme ──
  const jBefore = await E(() => JSON.stringify(window.SAGGCAD.editor.root));
  await p.waitForTimeout(900); await p.reload(); await p.waitForSelector('#ps2d svg.pe-svg'); await p.waitForTimeout(600);
  ok(await E(() => JSON.stringify(window.SAGGCAD.editor.root)) === jBefore, 'kayıt sonrası yeniden yükleme: çizim birebir');

  // ── çevrimdışı ──
  // uygulama sw.js'i yalnız https'te kaydeder (yayın); yerel sunucuda aynı dosya burada elle kaydedilir
  await E(async () => { if (location.protocol !== 'https:') await navigator.serviceWorker.register('sw.js'); await navigator.serviceWorker.ready; });
  await p.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 20000 });
  const cached = await E(async () => { const c = await caches.open((await caches.keys()).find(k => k.startsWith('saggcad-'))); return Promise.all(['js/bim/history.js', 'js/bim/deps.js', 'js/bim/solver.js', 'js/plan3d.js'].map(async u => [u, !!(await c.match(new URL(u, location.href).href))])); });
  ok(cached.every(([, v]) => v), `yeni modüller çevrimdışı önbellekte: ${cached.map(([u]) => u.split('/').pop()).join(', ')}`);
  ok(await E(async () => (await caches.keys()).includes('saggcad-v7')), 'önbellek sürümü saggcad-v7');
  await ctx.setOffline(true);
  await p.reload(); await p.waitForSelector('#ps2d svg.pe-svg', { timeout: 15000 }); await p.waitForTimeout(500);
  ok(await E(() => JSON.stringify(window.SAGGCAD.editor.root)) === jBefore, 'çevrimdışı yeniden yükleme: uygulama ve çizim açıldı');
  await runCmd('tools.health'); await p.waitForSelector('.model-health');
  ok(true, 'çevrimdışı Model Sağlığı açıldı (kısıt çözücü yüklü)');
  await ctx.setOffline(false);
  // çevrimdışıyken yalnız Google Fonts isteği düşebilir (yazı tipi sistem yedeğine döner) — diğer her hata başarısızlık
  const fontOnly = failed.length && failed.every(u => /fonts\.(googleapis|gstatic)\.com/.test(u));
  const real = errs.filter(e => !(fontOnly && e.includes('Failed to load resource')));
  if (failed.length) console.log('  (çevrimdışı düşen istekler:', failed.map(u => new URL(u).host).join(', ') + ')');
  ok(!real.length, 'konsol / sayfa hatası yok' + (real.length ? ': ' + real.join(' | ') : ''));
  await b.close();
  console.log('B3 ARAYÜZ: TÜMÜ GEÇTİ');
})().catch(e => { console.error(e.message); process.exit(1); });
