/* U1 (UniCAD esinli) uçtan uca: seçim filtresi, zaman çizelgesi, Akıllı Bas-Çek (Q), imleçte palet (S) ve sabitleme,
 * 3D gezinme çubuğu ve görünüm stili, mobil. İsteğe bağlı — proje bağımlılığı değildir.
 *   npm start ; node tests/e2e/u1.e2e.cjs http://localhost:8080/
 * Playwright yoksa test atlanır ve bunu açıkça bildirir (başarılı sayılmaz).
 */
const path = require('path');
let chromium, devices;
try { ({ chromium, devices } = require('playwright')); } catch { console.log('ATLANDI: playwright bulunamadı — bu test çalıştırılmadı'); process.exit(2); }
const BASE = process.argv[2] || 'http://localhost:8080/';
const FIXTURE = path.join(__dirname, '..', 'fixtures', 'eski-proje-v1.saggcad.json');
const ok = (c, m) => { if (!c) throw new Error('U1 HATA: ' + m); console.log('✓', m); };

async function open(p) {
  await p.goto(BASE); await p.waitForSelector('[data-imp]', { state: 'attached' });
  await p.setInputFiles('[data-imp]', FIXTURE); await p.waitForSelector('.dw-list');
  await p.click('.dw-card.main a.btn-primary'); await p.waitForSelector('#ps2d svg.pe-svg'); await p.waitForTimeout(400);
  await p.evaluate(() => { const e = window.SAGGCAD.editor; e.s = 1.1; e.ox = 300; e.oy = 160; e.render(); });
}
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await (await b.newContext({ viewport: { width: 1600, height: 950 } })).newPage(); const errs = [];
  p.setDefaultTimeout(20000);
  p.on('pageerror', e => errs.push('PAGE: ' + e.message)); p.on('console', m => m.type() === 'error' && errs.push('CONSOLE: ' + m.text()));
  const E = (fn, a) => p.evaluate(fn, a);
  const scr = (x, y) => E(([x, y]) => { const e = window.SAGGCAD.editor, r = e.svg.getBoundingClientRect(); return { x: r.left + e.ox + x * e.s, y: r.top + e.oy + y * e.s }; }, [x, y]);
  const J = () => E(() => JSON.stringify(window.SAGGCAD.editor.root));
  const blur = () => E(() => { document.activeElement?.blur(); });
  await open(p);

  // ── seçim filtresi ──
  const win = await scr(190, -7.5);   // pencere ofx00e (wfx001 üzerinde; kesit hattından uzak)
  await p.mouse.click(win.x, win.y); await p.waitForTimeout(150);
  ok((await E(() => window.SAGGCAD.editor.sel)).kind === 'opening', 'filtre yokken pencere seçilir');
  await p.click('[data-a="filter"]'); await p.click('.pe-filter [data-sf="wall"]'); await p.waitForTimeout(100);
  await p.mouse.click(win.x, win.y); await p.waitForTimeout(150);
  ok((await E(() => window.SAGGCAD.editor.sel))?.kind === 'wall', 'yalnız "Duvar" filtresi: aynı noktada duvar seçildi');
  await E(() => window.SAGGCAD.editor.selectAll());
  ok(await E(() => window.SAGGCAD.editor.selList().every(s => s.kind === 'wall')), 'Tümünü seç filtreye uyar');
  await p.click('.pe-filter [data-sf="*"]'); await E(() => window.SAGGCAD.editor.setSel([]));
  ok(await E(() => window.SAGGCAD.editor.selFilter.size === 0 && localStorage.getItem('sg-selfilter') === '[]'), '"Tümü" filtreyi temizler (kalıcı ayar)');

  // ── zaman çizelgesi ──
  const s0 = await J();
  await p.click('[data-a="tl"]');
  ok(await E(() => !document.querySelector('.pe-tl').hidden && !!document.querySelector('.pe-tl .tl-empty')), 'zaman çizelgesi açıldı (boş)');
  await E(() => { const e = window.SAGGCAD.editor; e.bimCommand({ op: 'setInstanceParam', id: 'wfx003', key: 'thickness', value: 25 }); });
  const s1 = await J();
  await E(() => { const e = window.SAGGCAD.editor; e.hist.open('Taşıma'); e.root.items[0].x += 30; e.hist.close(); e.changed(); });
  const s2 = await J();
  await E(() => window.SAGGCAD.editor.bimCommand({ op: 'offsetWall', id: 'wfx006', d: -20 }));
  const s3 = await J();
  ok(await E(() => document.querySelectorAll('.pe-tl .tl-chip:not(.start)').length === 3 && document.querySelectorAll('.pe-tl .tl-chip.bim').length === 2), '3 işlem 3 çip (2 BIM komutu işaretli)');
  await p.click('.pe-tl [data-tl="1"]'); await p.waitForTimeout(150);
  ok(await J() === s1 && await E(() => document.querySelectorAll('.pe-tl .tl-chip.undone').length === 2), '1. çipe tıklama: model o işlemden sonraki duruma sarıldı');
  await p.click('.pe-tl [data-tl="0"]'); await p.waitForTimeout(150);
  ok(await J() === s0, 'başlangıç çipi: açılış durumu');
  await p.click('.pe-tl [data-tl="3"]'); await p.waitForTimeout(150);
  ok(await J() === s3, 'son çip: tüm işlemler yinelendi');
  await p.click('.pe-tl [data-tl="2"]'); await blur(); await p.keyboard.press('Control+z'); await p.waitForTimeout(150);
  ok(await J() === s1, 'zaman çizelgesi ile Ctrl+Z aynı günlüğü kullanır');
  await p.keyboard.press('Control+Shift+z'); await p.keyboard.press('Control+Shift+z'); await p.waitForTimeout(150);
  ok(await J() === s3 && s2 !== s3, 'yinele sona kadar');

  // ── Akıllı Bas-Çek (Q) ──
  await E(() => window.SAGGCAD.editor.setSel([{ kind: 'wall', id: 'wfx006' }])); await blur();
  const w0 = await E(() => JSON.stringify(window.SAGGCAD.editor.root.walls.find(w => w.id === 'wfx006')));
  await p.keyboard.press('q'); await p.waitForSelector('.pe-pp:not([hidden]) input');
  ok(await E(() => [...document.querySelectorAll('.pe-pp [data-pp]')].map(b => b.textContent).join('|')) === 'Ötele (it / çek)|Kalınlık|Yükseklik', 'Q: duvar için kipler (ötele, kalınlık, yükseklik)');
  await p.fill('.pe-pp input', '15'); await p.keyboard.press('Enter'); await p.waitForTimeout(200);
  const w1 = await E(() => window.SAGGCAD.editor.root.walls.find(w => w.id === 'wfx006'));
  ok(JSON.stringify(w1) !== w0 && await E(() => document.querySelector('.pe-pp').hidden), 'ötele 15 cm uygulandı (offsetWall), kutu kapandı');
  await blur(); await p.keyboard.press('q'); await p.waitForSelector('.pe-pp:not([hidden]) input');
  await p.keyboard.press('Tab');
  ok(await E(() => document.querySelector('.pe-pp .chip.on').textContent) === 'Kalınlık', 'Tab ile kip değişir');
  await p.fill('.pe-pp input', '1'); await p.keyboard.press('Enter'); await p.waitForTimeout(150);
  ok(await E(() => !document.querySelector('.pe-pp').hidden), 'alt sınırın altındaki değer reddedildi, kutu açık');
  await p.fill('.pe-pp input', '24'); await p.keyboard.press('Enter'); await p.waitForTimeout(200);
  ok(await E(() => window.SAGGCAD.editor.root.walls.find(w => w.id === 'wfx006').t) === 24, 'kalınlık 24 cm');
  await blur(); await p.keyboard.press('Control+z'); await p.waitForTimeout(150);
  ok(await E(() => window.SAGGCAD.editor.root.walls.find(w => w.id === 'wfx006').t) !== 24, 'Bas-Çek tek Ctrl+Z ile geri alınır');
  await E(() => window.SAGGCAD.editor.setSel([])); await blur(); await p.keyboard.press('q'); await p.waitForTimeout(150);
  ok(await E(() => document.querySelector('.pe-pp').hidden && !!document.querySelector('.toast')), 'seçim yokken Q: kısa yönlendirme mesajı');
  await E(() => window.SAGGCAD.editor.setSel([{ kind: 'wall', id: 'wfx006' }])); await blur(); await p.keyboard.press('q'); await p.waitForSelector('.pe-pp:not([hidden]) input');
  const sQ = await J(); await p.keyboard.press('Escape'); await p.waitForTimeout(100);
  ok(await E(() => document.querySelector('.pe-pp').hidden) && await J() === sQ, 'Esc: değişiklik yok');

  // ── imleçte palet (S) ve sabitleme ──
  await p.mouse.move(700, 420); await blur(); await p.keyboard.press('s'); await p.waitForSelector('.cmdk-back.at-cursor');
  const pos = await E(() => { const r = document.querySelector('.cmdk').getBoundingClientRect(); return { x: r.left, y: r.top }; });
  ok(Math.abs(pos.x - 660) < 5 && Math.abs(pos.y - 400) < 5, `S: palet imleçte açıldı (${Math.round(pos.x)}, ${Math.round(pos.y)})`);
  await p.fill('.cmdk input', 'model sağlığı'); await p.waitForTimeout(80);
  await p.click('.cmdk-list button.on .cmdk-pin');
  await p.fill('.cmdk input', ''); await p.waitForTimeout(80);
  ok(await E(() => document.querySelector('.cmdk-h')?.textContent === 'Sabitlenenler' && document.querySelector('.cmdk-list button span').textContent === 'Model Sağlığı'), 'sabitlenen komut paletin başında');
  await p.keyboard.press('Escape'); await p.waitForTimeout(100);
  await p.click('.pe-tools [data-tool="wall"]'); await p.waitForTimeout(80);
  await E(() => { const i = document.createElement('input'); i.id = 'tmpI'; document.body.append(i); i.focus(); });
  await p.keyboard.press('s'); await p.waitForTimeout(100);
  ok(!(await E(() => !!document.querySelector('.cmdk-back'))), 'yazı alanında S palet açmaz');
  await E(() => { document.getElementById('tmpI').remove(); window.SAGGCAD.editor.setTool('select'); });

  // ── 3D gezinme çubuğu ve görünüm stili ──
  await p.click('#psMode [data-m="3d"]'); await p.waitForSelector('#p3host canvas', { timeout: 30000 }); await p.waitForTimeout(900);
  const cam = () => E(() => { const c = window.SAGGCAD.p3.camera, t = window.SAGGCAD.p3.controls.target; return [c.position.x, c.position.y, c.position.z, t.x, t.y, t.z].map(v => +v.toFixed(3)); });
  const views = {};
  for (const v of ['front', 'right', 'back', 'left', 'top', 'iso']) { await p.click(`#p3nav [data-v="${v}"]`); await p.waitForTimeout(60); views[v] = await cam(); }
  const [fx, , fz, tx, , tz] = views.front, [rx, , rz] = views.right;
  ok(Math.abs(fx - tx) < 0.01 && fz > tz && rx > tx && Math.abs(rz - tz) < 0.01 && views.back[2] < tz && views.left[0] < tx, 'Ön / Sağ / Arka / Sol kameraları doğru eksende');
  ok(views.top[1] > views.front[1] && new Set(Object.values(views).map(String)).size === 6, 'Üst ve izometrik görünüm farklı');
  await p.selectOption('#p3style', 'clay'); await p.waitForTimeout(100);
  ok(await E(() => !!window.SAGGCAD.p3.scene.overrideMaterial && localStorage.getItem('sg-3dstyle') === 'clay'), 'Beyaz maket stili (malzeme geçersiz kılma), kalıcı');
  await p.selectOption('#p3style', 'dark'); await p.waitForTimeout(100);
  ok(await E(() => !window.SAGGCAD.p3.scene.overrideMaterial && window.SAGGCAD.p3.scene.background.getHexString() === '18212b'), 'Koyu stüdyo stili');
  await p.selectOption('#p3style', 'default');
  ok(!errs.length, 'konsol / sayfa hatası yok' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await b.close();

  // ── mobil ──
  const mb = await chromium.launch(); const mp = await (await mb.newContext({ ...devices['Pixel 7'] })).newPage(); const merr = [];
  mp.on('pageerror', e => merr.push(e.message)); mp.on('console', m => m.type() === 'error' && merr.push(m.text()));
  await mp.goto(BASE); await mp.waitForSelector('[data-imp]', { state: 'attached' });
  await mp.setInputFiles('[data-imp]', FIXTURE); await mp.waitForSelector('.dw-list');
  await mp.click('.dw-card.main a.btn-primary'); await mp.waitForSelector('#ps2d svg.pe-svg'); await mp.waitForTimeout(400);
  await mp.evaluate(() => { document.querySelector('[data-a="tl"]').click(); document.querySelector('[data-a="filter"]').click(); });
  const ov = await mp.evaluate(() => { const vw = innerWidth; return ['.pe-tl', '.pe-filter'].map(s => { const r = document.querySelector(s).getBoundingClientRect(); return r.width > 0 && r.left >= -1 && r.right <= vw + 1; }); });
  ok(ov.every(Boolean), 'mobil: zaman çizelgesi ve filtre ekrana sığıyor (yatay kaydırma yok)');
  ok(!merr.length, 'mobil: konsol hatası yok' + (merr.length ? ': ' + merr.join(' | ') : ''));
  await mb.close();
  console.log('U1: TÜMÜ GEÇTİ');
})().catch(e => { console.error(e.message); process.exit(1); });
