/* B2A uçtan uca tarayıcı testi (isteğe bağlı — proje bağımlılığı değildir).
 * Gereken: Playwright + Chromium kurulu bir ortam ve çalışan statik sunucu.
 *   npm start                     # http://localhost:8080
 *   node tests/e2e/b2a.e2e.cjs http://localhost:8080/
 * Playwright yoksa test atlanır ve bunu açıkça bildirir (başarılı sayılmaz).
 */
const path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); } catch { console.log('ATLANDI: playwright bulunamadı — bu test çalıştırılmadı'); process.exit(2); }
const BASE = process.argv[2] || 'http://localhost:8080/';
const FIXTURE = path.join(__dirname, '..', 'fixtures', 'eski-proje-v1.saggcad.json');
const W12 = ['wfx001', 'wfx003', 'wfx004', 'wfx005', 'wfx006', 'wfx007', 'wfx008', 'wfx009', 'wfx00a', 'wfx00b', 'wfx00c', 'wfx00d'];
const ok = (c, m) => { if (!c) throw new Error('B2A HATA: ' + m); console.log('✓', m); };

(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await b.newContext({ viewport: { width: 1600, height: 950 }, acceptDownloads: true });
  const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', e => errs.push('PAGE: ' + e.message)); p.on('console', m => m.type() === 'error' && errs.push('CONSOLE: ' + m.text()));
  const W = id => p.evaluate(id => { const R = window.SAGGCAD.editor.root; return [R, ...(R.levels || [])].flatMap(P => P.walls).find(w => w.id === id); }, id);
  const closeModal = async () => { await p.click('.modal-foot [data-k=ok]'); await p.waitForSelector('.modal-back', { state: 'detached' }); };
  const openMgr = async () => { await p.keyboard.press('Control+k'); await p.keyboard.type('BIM Türleri'); await p.keyboard.press('Enter'); await p.waitForSelector('.tm'); };
  const shot = n => process.env.SHOTS ? p.screenshot({ path: path.join(process.env.SHOTS, n) }) : null;

  await p.goto(BASE); await p.waitForSelector('[data-imp]', { state: 'attached' });
  await p.setInputFiles('[data-imp]', FIXTURE); await p.waitForSelector('.dw-list');
  await p.click('.dw-card.main a.btn-primary'); await p.waitForSelector('#ps2d svg.pe-svg'); await p.waitForTimeout(500);
  ok((await p.evaluate(() => window.SAGGCAD.bim.report().elements)) > 40, 'eski proje açıldı, BIM modeli türetildi');

  // 1) tür yöneticisi: yerleşik tür salt okunur, çoğaltılarak özel tür
  await openMgr();
  ok(await p.locator('.tm-tabs [data-cls=wall].on').count() === 1 && await p.locator('.tm [data-tid="DIS-DUV-01"] .tm-lock').count() === 1, 'BIM Türleri penceresi açıldı (yerleşik tür kilitli)');
  await p.click('.tm [data-tid="DIS-DUV-01"]');
  ok(await p.locator('.tm [data-tp]:not([disabled])').count() === 0 && await p.locator('.tm [data-tm=apply]').count() === 0, 'yerleşik tür düzenlenemiyor');
  await p.click('.tm [data-tm=dup]'); await p.waitForSelector('.tm [data-tid="DIS-DUV-02"].on');
  await p.fill('.tm [data-tn]', 'Dış duvar — gazbeton + taş yünü'); await p.dispatchEvent('.tm [data-tn]', 'change');
  await p.selectOption('.tm [data-tp=compositeId]', 'dis-gazbeton');
  await p.click('.tm [data-tm=apply]'); await p.waitForTimeout(150);
  const t2 = await p.evaluate(() => window.SAGGCAD.bim.getElementType('DIS-DUV-02'));
  ok(t2 && t2.params.compositeId === 'dis-gazbeton' && t2.base === 'DIS-DUV-01' && t2.name.includes('gazbeton'), 'özel tür DIS-DUV-02 oluşturuldu (dış sıva / taş yünü / gazbeton / iç sıva)');
  await closeModal();

  // 2) 12 duvara tür atama (çoklu seçim → pencere)
  await p.evaluate(ids => window.SAGGCAD.editor.setSel(ids.map(id => ({ kind: 'wall', id }))), W12);
  await openMgr(); await p.click('.tm [data-tid="DIS-DUV-02"]');
  ok((await p.textContent('.tm [data-tm=assign]')).includes('(12)'), 'seçili 12 duvar ataması hazır');
  await p.click('.tm [data-tm=assign]'); await p.waitForTimeout(150);
  ok(await p.evaluate(() => window.SAGGCAD.bim.getElementsByTypeId('DIS-DUV-02').length) === 12 && (await W('wfx003')).t === 27.5, '12 duvar DIS-DUV-02 türünde, kalınlık kompozitten 27,5 cm');
  await closeModal();

  // 3) iki duvarda eski panelden kalınlık değişikliği → açık geçersiz kılma
  for (const [id, t] of [['wfx004', 32], ['wfx005', 35]]) {
    await p.evaluate(id => window.SAGGCAD.editor.setSel([{ kind: 'wall', id }]), id);
    await p.fill('.pe-insp [data-k=t]', String(t)); await p.dispatchEvent('.pe-insp [data-k=t]', 'change'); await p.waitForTimeout(120);
  }
  ok(JSON.stringify((await W('wfx004')).bimOv) === '["compositeId","thickness"]', 'panelden kalınlık değişince açık geçersiz kılma kaydı oluştu');
  await p.waitForSelector('.bim-sec'); if (!(await p.$('.bim-sec[open]'))) await p.click('.bim-sec summary');
  ok((await p.textContent('.bim-sec tr[data-p=thickness]')).includes('Geçersiz kılındı') && await p.locator('.bim-sec [data-bim-reset=thickness]').count() === 1, 'panelde "Geçersiz kılındı" ve "Türe döndür" görünüyor');
  await shot('b2a-insp.png');

  // 4) tür kompoziti değişti: canlı özet + toplu güncelleme
  await openMgr(); await p.click('.tm [data-tid="DIS-DUV-02"]');
  await p.selectOption('.tm [data-tp=compositeId]', 'dis-tugla-eps'); await p.waitForSelector('.tm-sum');
  const sum = await p.textContent('.tm-sum');
  ok(sum.includes('Bu değişiklik 12 duvarı etkileyecek. 2 duvarda özel kalınlık ve kompozit yapı korunacak.'), 'canlı özet: ' + sum.trim());
  await shot('b2a-mgr.png');
  const layersSvg = () => p.evaluate(() => [...document.querySelectorAll('#ps2d .walls')].map(g => g.innerHTML).join('|'));
  const layers0 = await layersSvg();
  await p.click('.tm [data-tm=apply]'); await p.waitForTimeout(150); await closeModal();
  ok((await W('wfx003')).t === 26.5 && (await W('wfx003')).comp === 'dis-tugla-eps' && (await W('wfx004')).t === 32 && (await W('wfx005')).t === 35, 'uygun 10 duvar güncellendi, 2 özel kalınlık korundu');
  ok((await p.evaluate(() => window.SAGGCAD.editor.T(window.SAGGCAD.editor.plan.walls.find(w => w.id === 'wfx003')))) === 26.5 && (await layersSvg()) !== layers0, '2D plan yeni kalınlık ve katmanlarla çizildi');

  // 5) tek adımda geri al / yinele (Ctrl+Z / Ctrl+Shift+Z)
  await p.click('#ps2d svg.pe-svg', { position: { x: 40, y: 40 } }).catch(() => {});
  await p.keyboard.press('Escape'); await p.keyboard.press('Control+z'); await p.waitForTimeout(150);
  ok((await W('wfx003')).t === 27.5 && (await W('wfx003')).comp === 'dis-gazbeton' && (await p.evaluate(() => window.SAGGCAD.bim.getElementType('DIS-DUV-02').params.compositeId)) === 'dis-gazbeton', 'tür güncellemesi tek adımda geri alındı');
  await p.keyboard.press('Control+Shift+z'); await p.waitForTimeout(150);
  ok((await W('wfx003')).t === 26.5 && (await W('wfx004')).t === 32, 'yinelendi');

  // 6) Türe döndür ve geri al
  await p.evaluate(() => window.SAGGCAD.editor.setSel([{ kind: 'wall', id: 'wfx004' }])); await p.waitForSelector('.bim-sec');
  if (!(await p.$('.bim-sec[open]'))) await p.click('.bim-sec summary');
  await p.click('.bim-sec [data-bim-reset=thickness]'); await p.waitForTimeout(150);
  ok((await W('wfx004')).t === 26.5 && (await W('wfx004')).comp === 'dis-tugla-eps' && !(await W('wfx004')).bimOv, 'Türe döndür: kalınlık ve kompozit türden');
  await p.keyboard.press('Control+z'); await p.waitForTimeout(150);
  ok((await W('wfx004')).t === 32, 'Türe döndür geri alındı');

  // 7) kat bağı ve 3D yüksekliği
  await p.click('#psMode [data-m="3d"]'); await p.waitForSelector('#p3host canvas', { timeout: 30000 }); await p.waitForTimeout(900);
  const ySum = () => p.evaluate(() => { let s = 0; window.SAGGCAD.p3.root.traverse(o => { if (!o.isMesh || o.name !== 'Duvar') return; const g = o.geometry; if (g?.parameters?.height) s += o.position.y + g.parameters.height; else if (g) { g.computeBoundingBox(); s += o.position.y + g.boundingBox.max.y; } }); return +s.toFixed(4); });
  await p.evaluate(() => { const v = window.SAGGCAD.p3; v.opt.cut = false; v.build(); });   // 3D varsayılan kesit (110 cm) kapalı: tam yükseklik
  const y0 = await ySum();
  const r7 = await p.evaluate(() => window.SAGGCAD.bim.commands.run({ op: 'setElementLevelBinding', id: 'wfx006', key: 'height', bound: false }));
  const r8 = await p.evaluate(() => window.SAGGCAD.bim.commands.run({ op: 'setInstanceParam', id: 'wfx006', key: 'height', value: 330 }));
  await p.waitForTimeout(900);
  ok(r7.applied && r8.applied && (await W('wfx006')).h === 330 && (await ySum()) !== y0, 'yükseklik değişti → 3D model güncellendi (komut API → editör yürütücüsü)');
  await p.evaluate(() => { window.SAGGCAD.editor.undo(); window.SAGGCAD.editor.undo(); }); await p.waitForTimeout(900);
  await p.evaluate(() => window.SAGGCAD.p3.build());
  ok((await W('wfx006')).h === 0 && (await ySum()) === y0, 'geri alınca 3D model birebir eski hâlinde');
  await p.click('#psMode [data-m="2d"]'); await p.waitForTimeout(300);

  // 8) tür silme koruması, kullanılmayan tür silme
  await openMgr(); await p.click('.tm [data-tid="DIS-DUV-02"]');
  ok(await p.locator('.tm [data-tm=del][disabled]').count() === 1 && (await p.textContent('.tm-del')).includes('(12)'), 'kullanılan tür yeniden atama seçilmeden silinemiyor');
  await p.click('.tm [data-tm=dup]'); await p.waitForSelector('.tm [data-tid="DIS-DUV-03"].on');
  await p.click('.tm [data-tm=del]'); await p.waitForTimeout(150);
  ok(!(await p.evaluate(() => window.SAGGCAD.bim.getElementType('DIS-DUV-03'))), 'kullanılmayan özel tür silindi');
  await p.click('.tm-tabs [data-cls=column]');
  ok(await p.locator('.tm [data-tid="KOL-BA-01"]').count() === 1, 'kolon türleri listeleniyor');
  await closeModal();

  // 9) hatalı komut veriyi değiştirmez
  const j0 = await p.evaluate(() => JSON.stringify(window.SAGGCAD.editor.root));
  const bad = await p.evaluate(() => window.SAGGCAD.bim.commands.run({ op: 'setInstanceParam', id: 'wfx001', key: 'thickness', value: -5 }));
  ok(!bad.ok && j0 === await p.evaluate(() => JSON.stringify(window.SAGGCAD.editor.root)), 'hatalı komut reddedildi, veri değişmedi');

  // 10) kaydet / yeniden aç
  await p.waitForTimeout(900); await p.reload(); await p.waitForSelector('#ps2d svg.pe-svg'); await p.waitForTimeout(600);
  const after = await p.evaluate(() => { const b = window.SAGGCAD.bim; return { n: b.getElementsByTypeId('DIS-DUV-02').length, t: b.getElementType('DIS-DUV-02')?.params.compositeId, src: b.resolveElementParameters('wfx004').find(x => x.k === 'thickness').source }; });
  ok(after.n === 12 && after.t === 'dis-tugla-eps' && after.src === 'override', 'kaydet / yeniden aç: tür, atamalar ve geçersiz kılma korundu');

  // 11) dışa aktarma ve mobil görünüm
  await p.click('.mb-m[data-m=file] .mb-b');
  const [d] = await Promise.all([p.waitForEvent('download'), p.click('.mb-dd [data-c="file.dxf"]')]);
  ok(!!(await d.path()), 'DXF dışa aktarıldı');
  await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(300);
  await openMgr();
  const box = await p.locator('.tm-ed').boundingBox(), lst = await p.locator('.tm-list').boundingBox();
  ok(box && lst && box.y > lst.y && box.width <= 390, 'telefon genişliğinde tür yöneticisi tek sütun');
  await shot('b2a-mobile.png');
  await closeModal();
  ok(!errs.length, 'konsol hatası yok ' + (errs.length ? JSON.stringify(errs) : ''));
  await b.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
