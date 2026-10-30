/* B3 uçtan uca tarayıcı testi (isteğe bağlı — proje bağımlılığı değildir).
 *   npm start                    # http://localhost:8080
 *   node tests/e2e/b3.e2e.cjs http://localhost:8080/
 * Playwright yoksa test atlanır ve bunu açıkça bildirir (başarılı sayılmaz).
 */
const path = require('path');
let chromium, devices;
try { ({ chromium, devices } = require('playwright')); } catch { console.log('ATLANDI: playwright bulunamadı — bu test çalıştırılmadı'); process.exit(2); }
const BASE = process.argv[2] || 'http://localhost:8080/';
const FIXTURE = path.join(__dirname, '..', 'fixtures', 'eski-proje-v1.saggcad.json');
const ok = (c, m) => { if (!c) throw new Error('B3 HATA: ' + m); console.log('✓', m); };

async function openFixture(p) {
  await p.goto(BASE); await p.waitForSelector('[data-imp]', { state: 'attached' });
  await p.setInputFiles('[data-imp]', FIXTURE); await p.waitForSelector('.dw-list');
  await p.click('.dw-card.main a.btn-primary'); await p.waitForSelector('#ps2d svg.pe-svg'); await p.waitForTimeout(500);
}
const helpers = p => ({
  E: (fn, a) => p.evaluate(fn, a),
  W: id => p.evaluate(id => { const R = window.SAGGCAD.editor.root; return [R, ...(R.levels || [])].flatMap(P => P.walls).find(w => w.id === id); }, id),
  scr: (x, y) => p.evaluate(([x, y]) => { const e = window.SAGGCAD.editor, r = e.svg.getBoundingClientRect(); return { x: r.left + e.ox + x * e.s, y: r.top + e.oy + y * e.s }; }, [x, y]),
  J: () => p.evaluate(() => JSON.stringify(window.SAGGCAD.editor.root)),
  undo: async () => { await p.evaluate(() => document.activeElement?.blur()); await p.keyboard.press('Control+z'); await p.waitForTimeout(150); },
  redo: async () => { await p.evaluate(() => document.activeElement?.blur()); await p.keyboard.press('Control+Shift+z'); await p.waitForTimeout(150); },
});

(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await b.newContext({ viewport: { width: 1600, height: 950 }, acceptDownloads: true });
  const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', e => errs.push('PAGE: ' + e.message)); p.on('console', m => m.type() === 'error' && errs.push('CONSOLE: ' + m.text()));
  const { E, W, scr, J, undo, redo } = helpers(p);
  const shot = n => process.env.SHOTS ? p.screenshot({ path: path.join(process.env.SHOTS, n) }) : null;
  await openFixture(p);
  await E(() => { const e = window.SAGGCAD.editor; e.s = 1.1; e.ox = 300; e.oy = 160; e.render(); });

  // ── B3-A: kanvas sürüklemesi BIM komutuyla ──
  const j0 = await J();
  await E(() => window.SAGGCAD.editor.setSel([{ kind: 'wall', id: 'wfx001' }]));
  const B = await scr(527.5, -7.5), T = await scr(557.5, -7.5);
  await p.mouse.move(B.x, B.y); await p.mouse.down(); await p.mouse.move(B.x + 10, B.y, { steps: 3 }); await p.mouse.move(T.x, T.y, { steps: 6 }); await p.mouse.up(); await p.waitForTimeout(200);
  const w1 = await W('wfx001'), w2 = await W('wfx002'), last = await E(() => window.SAGGCAD.editor.hist.stats());
  ok(Math.abs(w1.b.x - 557.5) < 0.6 && Math.abs(w2.a.x - w1.b.x) < 1e-9, `uç sürükleme: duvar ucu ${w1.b.x}, birleşen duvar izledi`);
  ok(last.labels.at(-1).startsWith('Duvar wfx001'), 'sürükleme BIM komutu olarak tek kayıt: ' + last.labels.at(-1));
  ok(await E(() => window.SAGGCAD.editor.root.rooms[0].pts[1].x) !== 520, 'bağlı mahal sınırı güncellendi');
  await undo(); ok(j0 === await J(), 'Ctrl+Z: sürükleme ve bağlı değişiklikler birebir geri alındı');
  await redo(); ok(Math.abs((await W('wfx001')).b.x - 557.5) < 0.6, 'Ctrl+Shift+Z: yinelendi'); await undo();
  // gövde sürükleme → offsetWall; pencere duvarla gider
  const M = await scr(60, -7.5), M2 = await scr(60, -47.5), pos0 = await E(() => window.SAGGCAD.editor.root.openings.find(o => o.id === 'ofx00e').pos);
  await p.mouse.move(M.x, M.y); await p.mouse.down(); await p.mouse.move(M.x, M.y - 10, { steps: 3 }); await p.mouse.move(M2.x, M2.y, { steps: 6 }); await p.mouse.up(); await p.waitForTimeout(200);
  ok(Math.abs((await W('wfx001')).a.y + 47.5) < 0.6 && Math.abs((await W('wfx004')).b.y - (await W('wfx001')).a.y) < 1e-9 && (await E(() => window.SAGGCAD.editor.root.openings.find(o => o.id === 'ofx00e').pos)) === pos0, 'gövde sürükleme: duvar ötelendi, köşe duvarı izledi, pencere duvarla gitti');
  await undo(); ok(j0 === await J(), 'öteleme geri alındı');
  // geçersiz sürükleme: pencereye yetmeyen kısaltma reddedilir, model değişmez
  const A = await scr(-7.5, -7.5), A2 = await scr(330, -7.5);
  await p.mouse.move(A.x, A.y); await p.mouse.down(); await p.mouse.move(A.x + 10, A.y, { steps: 3 }); await p.mouse.move(A2.x, A2.y, { steps: 8 }); await p.mouse.up(); await p.waitForTimeout(250);
  ok(j0 === await J() && (await p.textContent('.toasts')).includes('Sürükleme uygulanmadı'), 'geçersiz sürükleme reddedildi; model eski hâlinde');
  ok((await E(() => window.SAGGCAD.editor.hist.stats().undo)) === 0, 'reddedilen sürükleme geçmişe kayıt eklemedi');

  // ── tek günlük: katlar arası ve kat değişimi ──
  await E(() => { const c = window.SAGGCAD.bim.commands; c.run({ op: 'duplicateType', from: 'DIS-DUV-01', id: 'DIS-DUV-02', name: 'A', params: { compositeId: 'dis-gazbeton' } }); });
  await E(() => window.SAGGCAD.bim.commands.run({ op: 'assignType', ids: ['wfx001', 'wfx003', 'wfx004', 'wfx005', 'wfx006', 'wfx007', 'wfx008', 'wfx009', 'wfx00a', 'wfx00b', 'wfx00c', 'wfx00d', 'wfxu1', 'wfxu2', 'wfx002'], typeId: 'DIS-DUV-02' }));
  ok((await W('wfxu1')).bimType === 'DIS-DUV-02' && (await W('wfx003')).bimType === 'DIS-DUV-02', 'iki kattan 15 duvara tür atandı');
  await E(() => window.SAGGCAD.editor.setLevel(1)); await p.waitForTimeout(150);
  await undo();
  ok(!(await W('wfxu1')).bimType && !(await W('wfx003')).bimType, '1. kattayken tek Ctrl+Z iki kattaki 15 duvarın atamasını geri aldı');
  await E(() => window.SAGGCAD.editor.setLevel(0)); await p.waitForTimeout(100);
  await redo(); ok((await W('wfxu1')).bimType === 'DIS-DUV-02', 'kat değişince geçmiş korunuyor (yinele)');
  await undo(); await undo();
  // kat silme ve geri alma
  const lvId = await E(() => window.SAGGCAD.editor.root.levels[0].id);
  await E(() => window.SAGGCAD.editor.setLevel(1)); await p.waitForTimeout(100);
  const jPre = await J();   // kata geçiş, kata boş koleksiyonları ekler (prep — mevcut normalleştirme)
  await E(() => { window.SAGGCAD.editor.deleteLevel(); }); await p.waitForSelector('.modal-foot [data-k=ok]'); await p.click('.modal-foot [data-k=ok]'); await p.waitForSelector('.modal-back', { state: 'detached' }); await p.waitForTimeout(200);
  ok((await E(() => (window.SAGGCAD.editor.root.levels || []).length)) === 0, 'kat silindi');
  await undo();
  ok((await E(() => window.SAGGCAD.editor.root.levels[0]?.id)) === lvId && (await W('wfxu1')) && jPre === await J(), 'kat silme geri alındı: kat kimliği ve içeriği birebir');
  ok((await E(() => [...document.querySelectorAll('select option')].some(o => o.textContent.includes('1. Kat')))), 'kat listesi yenilendi');

  ok(!errs.length, 'konsol hatası yok ' + (errs.length ? JSON.stringify(errs) : ''));
  await shot('b3-desktop.png');
  await b.close();

  // ── mobil: dokunmatik duvar ucu sürükleme ──
  const b2 = await chromium.launch(); const mctx = await b2.newContext({ ...devices['iPhone 13'] }); const m = await mctx.newPage(); const merr = [];
  m.on('pageerror', e => merr.push(e.message)); m.on('console', x => x.type() === 'error' && merr.push(x.text()));
  const H = helpers(m);
  await m.goto(BASE); await m.waitForSelector('[data-imp]', { state: 'attached' });
  await m.setInputFiles('[data-imp]', FIXTURE); await m.waitForSelector('.dw-list');
  await m.tap('.dw-card.main a.btn-primary'); await m.waitForSelector('#ps2d svg.pe-svg'); await m.waitForTimeout(500);
  await H.E(() => { const e = window.SAGGCAD.editor; e.s = 0.5; e.ox = 40; e.oy = 120; e.render(); e.setSel([{ kind: 'wall', id: 'wfx001' }]); });
  const mj0 = await H.J(), P0 = await H.scr(527.5, -7.5), P1 = await H.scr(577.5, -7.5);
  // gerçek dokunma olayları (CDP): tarayıcı pointerType 'touch' işaretçi olayları üretir
  const cdp = await mctx.newCDPSession(m); await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 }); const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((q, i) => ({ x: q.x, y: q.y, id: i + 1 })) });
  await touch('touchStart', [P0]);
  for (let i = 1; i <= 10; i++) await touch('touchMove', [{ x: P0.x + (P1.x - P0.x) * i / 10, y: P0.y }]);
  await touch('touchEnd', []);
  await m.waitForTimeout(250);
  const mw = await H.W('wfx001');
  ok(Math.abs(mw.b.x - 577.5) < 1.5 && (await H.W('wfx002')).a.x === mw.b.x, `mobil: dokunarak uç sürüklendi (${mw.b.x}), birleşen duvar izledi`);
  await m.evaluate(() => window.SAGGCAD.editor.undo()); await m.waitForTimeout(150);
  ok(mj0 === await H.J(), 'mobil: geri alındı');
  // iki parmak (pinch) yakınlaştırma modeli değiştirmez
  const s0 = await m.evaluate(() => window.SAGGCAD.editor.s);
  // iki parmak: headless Chromium CDP ile çok noktalı dokunma üretmiyor (B2B'de de aynı) → uygulamanın işaretçi mantığına
  // iki 'touch' işaretçisi gönderilir; sentetik kimlikte hata veren setPointerCapture yalnız bu adımda etkisizleştirilir
  await m.evaluate(() => {
    const svg = window.SAGGCAD.editor.svg, cap = svg.setPointerCapture; svg.setPointerCapture = () => {};
    const r = svg.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const ev = (t, id, x, y) => svg.dispatchEvent(new PointerEvent(t, { pointerId: id, pointerType: 'touch', clientX: x, clientY: y, bubbles: true, buttons: t === 'pointerup' ? 0 : 1 }));
    ev('pointerdown', 11, cx - 40, cy); ev('pointerdown', 12, cx + 40, cy);
    for (let i = 1; i <= 5; i++) { ev('pointermove', 11, cx - 40 - i * 15, cy); ev('pointermove', 12, cx + 40 + i * 15, cy); }
    ev('pointerup', 11, cx - 115, cy); ev('pointerup', 12, cx + 115, cy);
    svg.setPointerCapture = cap;
  });
  await m.waitForTimeout(150);
  const s1 = await m.evaluate(() => window.SAGGCAD.editor.s), same = mj0 === await H.J();
  ok(s1 > s0 && same, `mobil: iki parmakla yakınlaştırma çalışıyor (ölçek ${s0.toFixed(3)} → ${s1.toFixed(3)}), model değişmedi (${same})`);
  ok(!merr.length, 'mobil: konsol hatası yok ' + (merr.length ? JSON.stringify(merr) : ''));
  await b2.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
