/* Aks aracı ve kolon / kiriş köşe tutamaçları — uçtan uca, gerçek fare etkileşimiyle. Sonuçlar ekran yazısından değil
 * çizim JSON'undan (editor.root) doğrulanır.
 *   npm start ; node tests/e2e/aks.e2e.cjs http://localhost:8080/
 * Playwright yoksa test atlanır ve bunu açıkça bildirir (başarılı sayılmaz).
 */
const path = require('path'), fs = require('fs');
let chromium, devices;
try { ({ chromium, devices } = require('playwright')); } catch { console.log('ATLANDI: playwright bulunamadı — bu test çalıştırılmadı'); process.exit(2); }
const BASE = process.argv[2] || 'http://localhost:8080/';
const FIXTURE = path.join(__dirname, '..', 'fixtures', 'eski-proje-v1.saggcad.json');
const OUT = process.env.AKS_OUT || null;
const ok = (c, m) => { if (!c) throw new Error('AKS HATA: ' + m); console.log('✓', m); };

async function open(p) {
  await p.goto(BASE); await p.waitForSelector('[data-imp]', { state: 'attached' });
  await p.setInputFiles('[data-imp]', FIXTURE); await p.waitForSelector('.dw-list');
  await p.click('.dw-card.main a.btn-primary'); await p.waitForSelector('#ps2d svg.pe-svg'); await p.waitForTimeout(400);
  await p.evaluate(() => { const e = window.SAGGCAD.editor; e.s = 0.5; e.ox = 40; e.oy = 120; e.render(); });
}

(async () => {
  if (OUT) fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1600, height: 950 }, acceptDownloads: true });
  const p = await ctx.newPage(); const errs = [];
  p.setDefaultTimeout(15000);
  p.on('pageerror', e => errs.push('PAGE: ' + e.message)); p.on('console', m => m.type() === 'error' && errs.push('CONSOLE: ' + m.text()));
  const E = (fn, a) => p.evaluate(fn, a);
  const scr = (x, y) => E(([x, y]) => { const e = window.SAGGCAD.editor, r = e.svg.getBoundingClientRect(); return { x: r.left + e.ox + x * e.s, y: r.top + e.oy + y * e.s }; }, [x, y]);
  const click = async (x, y) => { const q = await scr(x, y); await p.mouse.move(q.x, q.y, { steps: 3 }); await p.mouse.click(q.x, q.y); await p.waitForTimeout(60); };
  const drag = async (x0, y0, x1, y1) => { const a = await scr(x0, y0), c = await scr(x1, y1); await p.mouse.move(a.x, a.y); await p.mouse.down(); await p.mouse.move((a.x + c.x) / 2, (a.y + c.y) / 2, { steps: 4 }); await p.mouse.move(c.x, c.y, { steps: 4 }); await p.mouse.up(); await p.waitForTimeout(120); };
  const R = () => E(() => JSON.parse(JSON.stringify(window.SAGGCAD.editor.root)));
  const blur = () => E(() => { document.activeElement?.blur(); });
  const esc = async () => { await blur(); await p.keyboard.press('Escape'); await p.waitForTimeout(60); };
  await open(p);
  const r0 = await R();

  // ── 1. Aks aracı: araç çubuğunda, A kısayolu; iki tıkla aks, yönüne göre ad ──
  ok(await E(() => !!document.querySelector('.pe-tools [data-g="model"] [data-tool="grid"]')), 'araç çubuğunda "Aks" (Yapı elemanları grubu)');
  await blur(); await p.keyboard.press('a'); await p.waitForTimeout(80);
  ok(await E(() => window.SAGGCAD.editor.tool === 'grid' && /Aks sistemi/.test(document.querySelector('.pe-hud').textContent)), 'A kısayolu → Aks aracı; HUD\'da "Aks sistemi…" ve sıradaki adlar');
  await click(1001, -48); await click(1003, 702);
  await click(952, 2); await click(1597, 1);
  let r = await R();
  ok(r.grids?.length === 2, 'iki aks çizildi (araç etkin kalıyor, art arda)');
  const [g1, gA] = r.grids;
  ok(g1.name === '1' && gA.name === 'A', `düşey aks rakam (${g1.name}), yatay aks harf (${gA.name})`);
  ok(g1.a.x === 1000 && g1.b.x === 1000 && gA.a.y === 0 && gA.b.y === 0, 'ızgara + dik çizim yaslaması: aks koordinatları tam (x=1000, y=0)');
  ok(await E(() => document.querySelectorAll('#ps2d .grid-ax circle').length === 4 && [...document.querySelectorAll('#ps2d .grid-ax text')].map(t => t.textContent).sort().join() === '1,1,A,A'), 'planda aks çizgisi + iki uçta baloncuk ve ad');

  // ── 2. Aks sistemi (toplu): tek geri al adımı ──
  await p.click('[data-gridarr]'); await p.waitForSelector('#gaX');
  await p.fill('#gaX', '2x200'); await p.fill('#gaY', '300'); await p.fill('#gaX0', '1100'); await p.fill('#gaY0', '100'); await p.fill('#gaO', '100');
  await p.click('.modal-foot [data-k="ok"]'); await p.waitForTimeout(200);
  r = await R();
  const names = r.grids.map(g => g.name);
  ok(r.grids.length === 7 && ['2', '3', '4', 'B', 'C'].every(n => names.includes(n)), `aks sistemi: 3 düşey + 2 yatay, adlar mevcut akslardan devam (${names.join(' ')})`);
  const g3 = r.grids.find(g => g.name === '3'), gC = r.grids.find(g => g.name === 'C');
  ok(g3.a.x === 1300 && g3.a.y === 0 && g3.b.y === 500 && gC.a.y === 400 && gC.a.x === 1000 && gC.b.x === 1600, 'aks sistemi konumları ve taşma (100 cm) doğru');
  await esc(); await p.keyboard.press('Control+z'); await p.waitForTimeout(120);
  ok((await R()).grids.length === 2, 'aks sistemi tek Ctrl+Z ile geri alındı');
  await p.keyboard.press('Control+y'); await p.waitForTimeout(120);
  ok((await R()).grids.length === 7, 'Ctrl+Y ile yinelendi');
  if (OUT) await p.screenshot({ path: path.join(OUT, 'aks-sistemi.png') });

  // ── 3. Kolon: yerleştirme noktası (köşe) + aks kesişimine yaslama ──
  await esc(); await blur(); await p.keyboard.press('l'); await p.waitForTimeout(80);
  ok(await E(() => !!document.querySelector('#peColA')), 'kolon HUD: yerleştirme noktası seçimi');
  await p.selectOption('#peColA', 'tl'); await p.waitForTimeout(60);
  await click(1004, 3);   // 1-A kesişimine yakın
  r = await R();
  let c1 = r.items.at(-1);
  ok(c1.type === 'kolon' && c1.x === 1015 && c1.y === 15, `sol üst köşeden yerleştirme: köşe 1-A kesişiminde (0,0 → merkez ${c1.x}, ${c1.y})`);
  await p.selectOption('#peColA', 'c'); await p.waitForTimeout(60);
  await click(1097, 103);   // 2-B kesişimi (1100, 100)
  r = await R(); const c2 = r.items.at(-1);
  ok(c2.x === 1100 && c2.y === 100, 'merkezden yerleştirme: merkez 2-B kesişiminde');
  // döndürülmüş kolon, sağ alt köşeden
  await p.selectOption('#peColA', 'br'); await p.fill('#peColR', '90'); await p.press('#peColR', 'Tab'); await p.waitForTimeout(60);
  await click(1502, 402);   // 4-C (1500, 400)
  r = await R(); const c3 = r.items.at(-1);
  const c3br = await E(async id => { const G = await import('./js/grids.js'); const it = window.SAGGCAD.editor.root.items.find(i => i.id === id); return G.itemCorners(it)[2]; }, c3.id);
  ok(c3.rot === 90 && Math.abs(c3br.x - 1500) < 0.02 && Math.abs(c3br.y - 400) < 0.02, `90° dönük kolon: sağ alt köşe 4-C kesişiminde (${c3br.x}, ${c3br.y})`);
  await p.selectOption('#peColA', 'c'); await p.fill('#peColR', '0'); await p.press('#peColR', 'Tab');
  await esc(); await esc();

  // ── 4. Köşeden tutup taşı: seçili kolonun sağ alt köşesi → 3-C kesişimi ──
  await click(1015, 15);   // ilk kolonu seç
  ok(await E(id => window.SAGGCAD.editor.sel?.id === id && document.querySelectorAll('#ps2d .hdl.corner').length === 4, c1.id), 'seçili kolonda 4 köşe tutamacı');
  await drag(1030, 30, 1303, 397);   // sağ alt köşe → 3-C (1300, 400)
  r = await R(); c1 = r.items.find(i => i.id === c1.id);
  ok(c1.x === 1285 && c1.y === 385 && c1.w === 30 && c1.d === 30, `köşeden taşıma: sağ alt köşe 3-C kesişimine yaslandı (merkez ${c1.x}, ${c1.y}), ölçü değişmedi`);
  await blur(); await p.keyboard.press('Control+z'); await p.waitForTimeout(120);
  r = await R();
  ok(r.items.find(i => i.id === c1.id).x === 1015, 'köşeden taşıma tek Ctrl+Z ile geri alındı');
  await p.keyboard.press('Control+y'); await p.waitForTimeout(120);
  // başka kolonun köşesine yaslama: c2'nin sol üst köşesini c1'in sağ alt köşesine (1300,400) değil, c1 sol üst (1270,370)
  await click(1100, 100);
  await drag(1085, 85, 1272, 372);
  r = await R(); const c2m = r.items.find(i => i.id === c2.id);
  ok(c2m.x === 1285 && c2m.y === 385, `başka kolonun köşesine yaslama: sol üst köşe diğer kolonun sol üst köşesinde (merkez ${c2m.x}, ${c2m.y})`);
  await blur(); await p.keyboard.press('Control+z'); await p.waitForTimeout(120);
  await esc();

  // ── 5. Kiriş: aks kesişimleri arası, uçtan uzatma, yüz hizası ──
  await blur(); await p.keyboard.press('b'); await p.waitForTimeout(80);
  ok(await E(() => !!document.querySelector('#peBmA')), 'kiriş HUD: çizgi hizası (eksen / sağ yüz / sol yüz)');
  await click(1102, 98); await click(1298, 102);
  r = await R(); let bm = r.items.at(-1);
  ok(bm.type === 'kiris' && bm.x === 1200 && bm.y === 100 && bm.w === 200 && bm.rot === 0, `kiriş eksen: 2-B → 3-B (merkez ${bm.x}, ${bm.y}, boy ${bm.w})`);
  await p.selectOption('#peBmA', 'right'); await p.waitForTimeout(60);
  await click(1102, 402); await click(1298, 398);
  r = await R(); const bm2 = r.items.at(-1);
  ok(bm2.y === 387.5 && bm2.x === 1200, `çizgi sağ yüzde: gövde çizgiye göre içeri kaydı (merkez y=${bm2.y}, b=25)`);
  await p.selectOption('#peBmA', 'axis'); await esc(); await esc();
  await click(1200, 100);
  ok(await E(id => window.SAGGCAD.editor.sel?.id === id, bm.id), 'kiriş seçildi');
  await drag(1300, 100, 1497, 103);   // b ucu → 4-B (1500, 100)
  r = await R(); bm = r.items.find(i => i.id === bm.id);
  ok(bm.w === 400 && bm.x === 1300 && bm.y === 100 && bm.rot === 0, `kiriş ucundan uzatma: diğer uç sabit, boy ${bm.w}, merkez ${bm.x}`);
  await drag(1100 - 0, 100 - 12.5, 1100, 400 - 12.5 + 1);   // sol üst köşeden tut → aşağı (C aksı hizası yakını)
  r = await R(); const bm3 = r.items.find(i => i.id === bm.id);
  ok(bm3.w === 400 && bm3.rot === 0 && bm3.x === 1300 && bm3.y === 400, `kirişi sol üst köşesinden tutup taşıma: köşe öbür kirişin eksen ucuna (1100, 387.5) yaslandı (merkez y ${bm.y} → ${bm3.y}), boy ve açı korundu`);
  await blur(); await p.keyboard.press('Control+z'); await p.waitForTimeout(120); await esc();

  // ── 6. Aks: özellik paneli, seçim filtresi, uç tutamacı, silme ──
  await click(1000, 250);   // aks 1 (kolonlardan uzak)
  ok(await E(() => window.SAGGCAD.editor.sel?.kind === 'grid' && !!document.querySelector('.pe-insp [data-k="name"]')), 'aks seçildi, özellik panelinde ad ve baloncuk');
  await p.fill('.pe-insp [data-k="name"]', '1a'); await p.press('.pe-insp [data-k="name"]', 'Tab'); await p.waitForTimeout(100);
  await p.selectOption('.pe-insp [data-k="bub"]', 'b'); await p.waitForTimeout(100);
  r = await R(); let ax = r.grids.find(g => g.id === g1.id);
  ok(ax.name === '1a' && ax.bub === 'b', 'ad ve baloncuk değişti');
  await drag(1000, 700, 1004, 803);
  r = await R(); ax = r.grids.find(g => g.id === g1.id);
  ok(ax.b.x === 1000 && ax.b.y === 805 && ax.a.y === -50, `aks ucu tutamacı: dik + adım yaslaması, diğer uç sabit (${ax.b.x}, ${ax.b.y})`);
  await E(() => window.SAGGCAD.editor.setSelFilter(['anno']));
  await esc(); await click(1000, 250);
  ok(await E(() => window.SAGGCAD.editor.sel?.kind === 'grid'), 'seçim filtresi "Ölçü / yazı / kesit / aks" aksı seçer');
  await E(() => window.SAGGCAD.editor.setSelFilter([]));
  await blur(); await p.keyboard.press('Delete'); await p.waitForTimeout(100);
  ok((await R()).grids.length === 6, 'Delete ile aks silindi');
  await p.keyboard.press('Control+z'); await p.waitForTimeout(100);
  ok((await R()).grids.length === 7, 'silme geri alındı');

  // ── 7. Diğer çizimler aks kesişimine yaslanır (duvar) ──
  await esc(); await esc(); await E(() => { window.SAGGCAD.editor.wallFace = false; }); await blur(); await p.keyboard.press('w'); await p.waitForTimeout(80);
  await click(1296, 104); await click(1504, 97); await p.keyboard.press('Escape'); await p.waitForTimeout(100);
  r = await R(); const nw = r.walls.at(-1);
  ok(nw.a.x === 1300 && nw.a.y === 100 && nw.b.x === 1500 && nw.b.y === 100, 'duvar aracı aks kesişimlerine yaslanıyor');
  await p.keyboard.press('Control+z'); await p.waitForTimeout(100); await esc();

  // ── 8. Üst kat: zemin aksları soluk görünür, yaslanır, seçilmez ──
  await E(() => { window.SAGGCAD.editor.addLevelDialog(); });
  await p.waitForSelector('#lvC'); await p.selectOption('#lvC', 'none'); await p.click('.modal-foot [data-k="ok"]'); await p.waitForTimeout(300);
  const lvInfo = await E(() => ({ lv: window.SAGGCAD.editor.lv, n: document.querySelectorAll('#ps2d .grid-ax[opacity="0.55"]').length, all: document.querySelectorAll('#ps2d .grid-ax').length }));
  ok(lvInfo.lv >= 1 && lvInfo.n === 7, `üst katta zemin katın 7 aksı soluk görünüyor (${JSON.stringify(lvInfo)})`);
  await blur(); await p.keyboard.press('l'); await click(1298, 403);
  r = await R(); const LV = r.levels[lvInfo.lv - 1], up = LV.items.at(-1);
  ok(up.x === 1300 && up.y === 400 && !LV.grids?.length, 'üst katta kolon zemin aksının kesişimine yaslandı; aks kopyalanmadı');
  await esc(); await esc(); await click(1000, 250);
  ok(await E(() => window.SAGGCAD.editor.sel?.kind !== 'grid'), 'zemin aksı üst katta seçilemiyor (yalnız referans)');
  await E(() => window.SAGGCAD.editor.setLevel(0)); await p.waitForTimeout(150);

  // ── 9. DXF (AKS katmanı), kayıt / yeniden aç, eski çizim verisi ──
  const [dl] = await Promise.all([p.waitForEvent('download'), E(() => { window.SAGGCAD.cmds().find(c => c.id === 'file.dxf').run(); })]);
  const dxf = fs.readFileSync(await dl.path(), 'utf8').split(/\r?\n/);
  ok(dxf.filter((x, i) => x === 'CIRCLE' && dxf[i + 2] === 'AKS').length === 14 - 1, `DXF: AKS katmanında aks çizgileri ve baloncuklar (${dxf.filter((x, i) => x === 'CIRCLE' && dxf[i + 2] === 'AKS').length} baloncuk)`);
  await p.waitForTimeout(700);
  const before = JSON.stringify((await R()).grids);
  await p.reload(); await p.waitForSelector('#ps2d svg.pe-svg'); await p.waitForTimeout(400);
  ok(JSON.stringify((await R()).grids) === before, 'kaydet / yeniden aç: akslar korunuyor');
  r = await R();
  ok(JSON.stringify(r.walls.map(w => [w.id, w.a, w.b])) === JSON.stringify(r0.walls.map(w => [w.id, w.a, w.b])), 'mevcut duvarlar değişmedi');
  ok(!errs.length, 'konsol / sayfa hatası yok' + (errs.length ? ': ' + errs.join(' | ') : ''));
  if (OUT) { await E(() => { const e = window.SAGGCAD.editor; e.s = 0.5; e.ox = 40; e.oy = 120; e.render(); }); await click(1100, 100); await p.screenshot({ path: path.join(OUT, 'aks-kolon-kiris.png') }); }
  await b.close();

  // ── 10. mobil: araç ve aks sistemi penceresi ──
  const mb = await chromium.launch(); const mp = await (await mb.newContext({ ...devices['Pixel 7'] })).newPage(); const merr = [];
  mp.on('pageerror', e => merr.push(e.message)); mp.on('console', m => m.type() === 'error' && merr.push(m.text()));
  await open(mp);
  await mp.evaluate(() => window.SAGGCAD.editor.setTool('grid')); await mp.waitForTimeout(150);
  await mp.tap('[data-gridarr]'); await mp.waitForSelector('#gaX');
  ok(await mp.evaluate(() => { const r = document.querySelector('.modal').getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth; }), 'mobil: aks sistemi penceresi ekrana sığıyor');
  await mp.tap('.modal-foot [data-k="ok"]'); await mp.waitForTimeout(200);
  ok(await mp.evaluate(() => window.SAGGCAD.editor.root.grids.length === 6), 'mobil: varsayılan aks sistemi (3 × 3) oluşturuldu');
  ok(!merr.length, 'mobil: konsol hatası yok' + (merr.length ? ': ' + merr.join(' | ') : ''));
  await mb.close();
  console.log('AKS uçtan uca: TÜMÜ GEÇTİ');
})().catch(e => { console.error(e); process.exit(1); });
