/* B2B uçtan uca tarayıcı testi (isteğe bağlı — proje bağımlılığı değildir).
 *   npm start                     # http://localhost:8080
 *   node tests/e2e/b2b.e2e.cjs http://localhost:8080/
 * Playwright yoksa test atlanır ve bunu açıkça bildirir (başarılı sayılmaz).
 */
const path = require('path');
let chromium, devices;
try { ({ chromium, devices } = require('playwright')); } catch { console.log('ATLANDI: playwright bulunamadı — bu test çalıştırılmadı'); process.exit(2); }
const BASE = process.argv[2] || 'http://localhost:8080/';
const FIXTURE = path.join(__dirname, '..', 'fixtures', 'eski-proje-v1.saggcad.json');
const ok = (c, m) => { if (!c) throw new Error('B2B HATA: ' + m); console.log('✓', m); };

(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await b.newContext({ viewport: { width: 1600, height: 950 }, acceptDownloads: true });
  const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', e => errs.push('PAGE: ' + e.message)); p.on('console', m => m.type() === 'error' && errs.push('CONSOLE: ' + m.text()));
  const shot = n => process.env.SHOTS ? p.screenshot({ path: path.join(process.env.SHOTS, n) }) : null;
  const E = (fn, a) => p.evaluate(fn, a);
  const W = id => p.evaluate(id => { const R = window.SAGGCAD.editor.root; return [R, ...(R.levels || [])].flatMap(P => P.walls).find(w => w.id === id); }, id);
  const openBim = async () => { await p.waitForSelector('.bim-sec'); if (!(await p.$('.bim-sec[open]'))) await p.click('.bim-sec summary'); };

  // 1) yeni proje: duvar çizerken otomatik birleşim
  await p.goto(BASE); await p.waitForSelector('[data-new]');
  await p.click('[data-new]'); await p.fill('#npn', 'B2B'); await p.click('.modal-foot [data-k=ok]');
  await p.waitForSelector('#ps2d svg.pe-svg'); await p.waitForTimeout(400);
  await p.click('.tool[data-tool=wall]');
  const scr = (x, y) => E(([x, y]) => { const e = window.SAGGCAD.editor, r = e.svg.getBoundingClientRect(); return { x: r.left + e.ox + x * e.s, y: r.top + e.oy + y * e.s }; }, [x, y]);
  const C = await E(() => { const e = window.SAGGCAD.editor, r = e.svg.getBoundingClientRect(); const c = e.toW(r.width / 2, r.height / 2); return { x: Math.round(c.x / 10) * 10, y: Math.round(c.y / 10) * 10 }; });
  for (const [dx, dy] of [[-200, -150], [200, -150], [200, 150]]) { const q = await scr(C.x + dx, C.y + dy); await p.mouse.click(q.x, q.y); await p.waitForTimeout(80); }
  await p.keyboard.press('Escape'); await p.waitForTimeout(150);
  const j1 = await E(() => { const b = window.SAGGCAD.bim, w = b.getElementsByType('wall'); return w.map(x => b.getWallJoinInfo(x.id)); });
  ok(j1.length === 2 && j1.some(j => j.b?.kind === 'L') && j1.some(j => j.a?.kind === 'L'), 'çizim sırasında L birleşimi algılandı');
  ok(await p.locator('#ps2d .walls path.wallc').count() === 1, '2D: birleşen duvarlar tek kontur olarak çizildi');
  // T kolu çiz
  await p.click('.tool[data-tool=wall]');
  for (const [dx, dy] of [[0, -150], [0, 150]]) { const q = await scr(C.x + dx, C.y + dy); await p.mouse.click(q.x, q.y); await p.waitForTimeout(80); }
  await p.keyboard.press('Escape'); await p.waitForTimeout(150);
  const kinds = await E(() => { const b = window.SAGGCAD.bim; return b.model().issues.length >= 0 && [...new Set(b.getElementsByType('wall').flatMap(w => { const j = b.getWallJoinInfo(w.id); return [j.a?.kind, j.b?.kind, ...j.body.map(x => x.kind)].filter(Boolean); }))].sort(); });
  ok(kinds.includes('T') && kinds.includes('L'), 'T birleşimi algılandı: ' + kinds.join(','));
  const ov = await E(async () => { const m = await import('./js/bim/wallgeom.js'), e = window.SAGGCAD.editor; return m.overlapReport(m.levelWallGeometry(e.root, e.plan)).length; });
  ok(ov === 0, '2D ortak geometride çakışma yok');

  // 2) eski proje: panelde Birleşim ve Referans
  await p.goto(BASE); await p.waitForSelector('[data-imp]', { state: 'attached' });
  await p.setInputFiles('[data-imp]', FIXTURE); await p.waitForSelector('.dw-list');
  await p.click('.dw-card.main a.btn-primary'); await p.waitForSelector('#ps2d svg.pe-svg'); await p.waitForTimeout(500);
  await E(() => window.SAGGCAD.editor.setSel([{ kind: 'wall', id: 'wfx001' }])); await openBim();
  const jt = await p.textContent('.bim-sec .bim-joins');
  ok(jt.includes('L köşe') && jt.includes('T birleşimi'), 'panel: başlangıç / bitiş birleşimi gösteriliyor');
  ok(await p.locator('.bim-sec [data-bim-ref]').count() === 1 && (await p.textContent('.bim-sec')).includes('Yalıtım'), 'panel: referans çizgisi ve katman öncelikleri');
  await p.locator('.bim-sec h5:has-text("Birleşim")').scrollIntoViewIfNeeded(); await shot('b2b-insp.png');
  // otomatik birleşimi kapat / aç (geri alınabilir)
  await p.uncheck('.bim-sec [data-bim-join=a]'); await p.waitForTimeout(150);
  ok(JSON.stringify((await W('wfx001')).joinOff) === '["a"]' && !(await E(() => window.SAGGCAD.bim.getWallJoinInfo('wfx001').a)), 'başlangıç ucunda otomatik birleşim kapatıldı');
  await p.keyboard.press('Control+z'); await p.waitForTimeout(150);
  ok(!(await W('wfx001')).joinOff, 'birleşim kapatma geri alındı');
  // referans çizgisi: geometri yerinde
  const a0 = JSON.stringify((await W('wfx001')).a);
  await openBim(); await p.selectOption('.bim-sec [data-bim-ref]', 'face+'); await p.waitForTimeout(150);
  ok((await W('wfx001')).face === 1 && JSON.stringify((await W('wfx001')).a) === a0, 'referans çizgisi değişti, koordinatlar aynı');
  await p.keyboard.press('Control+z'); await p.waitForTimeout(100);

  // 3) uzunluk: sığmayan pencere reddedilir; geçerli uzunluk bağlı uçlarla tek adımda
  const j0 = await E(() => JSON.stringify(window.SAGGCAD.editor.root));
  await E(() => window.SAGGCAD.editor.setSel([{ kind: 'wall', id: 'wfx001' }]));
  await p.fill('.pe-insp [data-k=len]', '300'); await p.dispatchEvent('.pe-insp [data-k=len]', 'change'); await p.waitForTimeout(200);
  ok(j0 === await E(() => JSON.stringify(window.SAGGCAD.editor.root)) && (await p.textContent('.toasts')).includes('sığmıyor'), 'pencereye yetmeyen uzunluk reddedildi, veri değişmedi');
  await p.fill('.pe-insp [data-k=len]', '565'); await p.dispatchEvent('.pe-insp [data-k=len]', 'change'); await p.waitForTimeout(200);
  ok((await W('wfx001')).b.x === 557.5 && (await W('wfx002')).a.x === 557.5, 'uzunluk değişti, birleşen duvar ucu izledi');
  // wfx002'nin yalnız üst ucu taşındı (eğikleşti): salonun KD köşesi y = 0'da ve yeni eksene 7,5 cm uzaklıkta olmalı
  const salon = await E(() => { const R = window.SAGGCAD.editor.root, q = R.rooms[0].pts[1], w = R.walls.find(x => x.id === 'wfx002'), dx = w.b.x - w.a.x, dy = w.b.y - w.a.y, L = Math.hypot(dx, dy);
    return { q, d: Math.abs((q.x - w.a.x) * dy - (q.y - w.a.y) * dx) / L, name: R.rooms[0].name }; });
  ok(salon.q.y === 0 && Math.abs(salon.d - 7.5) < 0.02 && salon.name === 'Salon', `mahal sınırı eğikleşen duvarı izledi (köşe ${salon.q.x}, ${salon.q.y}; eksene ${salon.d.toFixed(2)} cm)`);
  await E(() => document.activeElement?.blur()); await p.keyboard.press('Control+z'); await p.waitForTimeout(150);
  ok(j0 === await E(() => JSON.stringify(window.SAGGCAD.editor.root)), 'tek adımda birebir geri alındı');

  // 4) 3D: ortak geometri, kapalı yüzey
  await p.click('#psMode [data-m="3d"]'); await p.waitForSelector('#p3host canvas', { timeout: 30000 }); await p.waitForTimeout(900);
  const m3 = await E(async () => {
    const S = window.SAGGCAD, mw = await import('./js/bim/wallgeom.js'), mm = await import('./js/bim/mesh.js'), R = S.editor.root;
    const { prisms } = mw.wallPrisms(R, R, R.meta), c = mm.meshChecks(mm.prismFaces(prisms), prisms);
    let meshes = 0; S.p3.root.traverse(o => { if (o.isMesh && o.userData.wall) meshes++; });
    return { meshes, ...c };
  });
  ok(m3.meshes >= 12 && m3.inward === 0 && m3.internal === 0 && m3.closure < 1e-3 && Math.abs(m3.volume - m3.expected) < 1e-3 * m3.expected, `3D: ${m3.meshes} duvar mesh'i, kapalı yüzey, ters normal / iç yüz yok`);
  await shot('b2b-3d.png');
  await p.click('#psMode [data-m="2d"]'); await p.waitForTimeout(300);

  // 5) kat bağı: duvar üst kat döşemesi üstüne; kat yüksekliği panelden değişince güncellenir
  await E(() => window.SAGGCAD.editor.setSel([{ kind: 'wall', id: 'wfx003' }])); await openBim();
  await p.selectOption('.bim-sec [data-bim-top]', 'nextSlabTop'); await p.waitForTimeout(150);
  ok((await W('wfx003')).h === 295, 'duvar üst kat döşemesi üstüne bağlandı (280 + 15)');
  await E(() => window.SAGGCAD.editor.setSel([])); await p.waitForTimeout(100);
  await p.fill('.pe-insp [data-k="meta.wallH"]', '300'); await p.dispatchEvent('.pe-insp [data-k="meta.wallH"]', 'change'); await p.waitForTimeout(200);
  ok((await W('wfx003')).h === 315 && (await E(() => window.SAGGCAD.editor.root.meta.wallH)) === 300, 'kat yüksekliği değişti → bağlı duvar güncellendi');
  await E(() => document.activeElement?.blur()); await p.keyboard.press('Control+z'); await p.waitForTimeout(150);
  ok((await W('wfx003')).h === 295 && (await E(() => window.SAGGCAD.editor.root.meta.wallH)) === 280, 'kat yüksekliği değişikliği bağlı elemanlarla birlikte geri alındı');

  // 6) açık kesit penceresi değişiklikte yenilenir; kapanınca abonelik kalkar
  await p.keyboard.press('Control+k'); await p.keyboard.type('Kesit ve görünüşler'); await p.keyboard.press('Enter');
  await p.waitForSelector('.vw-canvas'); await p.click('.vw-side [data-v=scfx1]'); await p.waitForTimeout(200);
  const s0 = await p.innerHTML('.vw-canvas'), subs1 = await E(() => window.SAGGCAD.viewSubs);
  await E(() => window.SAGGCAD.bim.commands.run({ op: 'setInstanceParam', id: 'wfx003', key: 'thickness', value: 40 }));
  await p.waitForTimeout(400);
  ok(subs1 === 1 && s0 !== await p.innerHTML('.vw-canvas'), 'açık kesit penceresi değişiklikten sonra yenilendi');
  await p.click('.modal-foot [data-k=close]'); await p.waitForSelector('.modal-back', { state: 'detached' });
  ok((await E(() => window.SAGGCAD.viewSubs)) === 0, 'pencere kapanınca abonelik kaldırıldı (sızıntı yok)');

  // 7) kaydet / yeniden aç
  await E(() => window.SAGGCAD.bim.commands.run({ op: 'setJoinEnabled', id: 'wfx004', end: 'a', enabled: false }));
  await p.waitForTimeout(900); await p.reload(); await p.waitForSelector('#ps2d svg.pe-svg'); await p.waitForTimeout(500);
  const rel = await E(() => { const b = window.SAGGCAD.bim; return { off: b.getWallJoinInfo('wfx004').joinOff, top: b.getTopBinding('wfx003'), t: b.getElement('wfx003').geom.thickness }; });
  ok(JSON.stringify(rel.off) === '["a"]' && rel.top?.mode === 'nextSlabTop' && rel.t === 40, 'kaydet / yeniden aç: birleşim kapatma, kat bağı ve kalınlık korundu');
  await p.click('.mb-m[data-m=file] .mb-b');
  const [d] = await Promise.all([p.waitForEvent('download'), p.click('.mb-dd [data-c="file.dxf"]')]);
  ok(!!(await d.path()), 'DXF dışa aktarıldı');
  ok(!errs.length, 'masaüstü: konsol hatası yok ' + (errs.length ? JSON.stringify(errs) : ''));
  await b.close();

  // 8) mobil: panelde birleşim bölümü kullanılabilir
  const b2 = await chromium.launch(); const mctx = await b2.newContext({ ...devices['iPhone 13'] }); const m = await mctx.newPage(); const merr = [];
  m.on('pageerror', e => merr.push(e.message)); m.on('console', x => x.type() === 'error' && merr.push(x.text()));
  await m.goto(BASE); await m.waitForSelector('[data-imp]', { state: 'attached' });
  await m.setInputFiles('[data-imp]', FIXTURE); await m.waitForSelector('.dw-list');
  await m.tap('.dw-card.main a.btn-primary'); await m.waitForSelector('#ps2d svg.pe-svg'); await m.waitForTimeout(500);
  await m.evaluate(() => window.SAGGCAD.editor.setSel([{ kind: 'wall', id: 'wfx001' }])); await m.waitForSelector('.bim-sec');
  if (!(await m.$('.bim-sec[open]'))) await m.tap('.bim-sec summary');
  await m.locator('.bim-sec [data-bim-join=b]').scrollIntoViewIfNeeded();
  const bx = await m.locator('.bim-sec [data-bim-join=b]').boundingBox(), sw = await m.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
  ok(bx && bx.x >= 0 && bx.x + bx.width <= 390 && sw[0] <= sw[1], 'mobil: birleşim denetimi ekranda, yatay taşma yok');
  await m.tap('.bim-sec [data-bim-join=b]'); await m.waitForTimeout(150);
  ok(JSON.stringify(await m.evaluate(() => window.SAGGCAD.editor.root.walls[0].joinOff)) === '["b"]', 'mobil: dokunarak birleşim kapatıldı');
  if (process.env.SHOTS) await m.screenshot({ path: path.join(process.env.SHOTS, 'b2b-mobile.png') });
  ok(!merr.length, 'mobil: konsol hatası yok ' + (merr.length ? JSON.stringify(merr) : ''));
  await b2.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
