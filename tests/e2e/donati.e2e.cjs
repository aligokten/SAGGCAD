/* Donatı hesabı ve metrajı — uçtan uca. Sonuçlar çizim JSON'undan ve bim/rebar.js'in elle doğrulanmış değerlerinden.
 *   npm start ; node tests/e2e/donati.e2e.cjs http://localhost:8080/
 * Playwright yoksa test atlanır ve bunu açıkça bildirir (başarılı sayılmaz).
 */
const path = require('path'), fs = require('fs');
let chromium, devices;
try { ({ chromium, devices } = require('playwright')); } catch { console.log('ATLANDI: playwright bulunamadı — bu test çalıştırılmadı'); process.exit(2); }
const BASE = process.argv[2] || 'http://localhost:8080/';
const VILLA = path.join(__dirname, '..', 'fixtures', 'villa-ornek.saggcad.json');
const OUT = process.env.DONATI_OUT || null;
const ok = (c, m) => { if (!c) throw new Error('DONATI HATA: ' + m); console.log('✓', m); };

async function openVilla(p) {
  await p.goto(BASE); await p.waitForSelector('[data-imp]', { state: 'attached' });
  await p.setInputFiles('[data-imp]', VILLA); await p.waitForSelector('.dw-list');
  await p.evaluate(() => { location.hash = `#/p/${window.SAGGCAD.project.id}/plan?d=dwvP`; }); await p.waitForSelector('#ps2d svg.pe-svg'); await p.waitForTimeout(400);
  await p.evaluate(() => { const e = window.SAGGCAD.editor; e.s = 0.45; e.ox = 120; e.oy = 160; e.render(); });
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
  const blur = () => E(() => { document.activeElement?.blur(); });
  const item = id => E(id => JSON.parse(JSON.stringify(window.SAGGCAD.editor.root.items.find(i => i.id === id) || null)), id);
  const kgOf = id => E(async id => { const M = await import('./js/bim/rebar.js'); const R = window.SAGGCAD.editor.root; const el = M.concreteElements(R).find(e => e.id === id); return M.takeoff(el, M.rulesOf(R)).kg; }, id);
  await openVilla(p);

  // ── 1. kolon yerleştir (30×50) → panelde Donatı bölümü, başlangıçta tanımsız ──
  await blur(); await p.keyboard.press('l'); await p.waitForTimeout(60);
  await p.fill('#peColW', '30'); await p.press('#peColW', 'Tab'); await p.fill('#peColD', '50'); await p.press('#peColD', 'Tab');
  const q = await scr(1500, 300); await p.mouse.click(q.x, q.y); await p.waitForTimeout(150);
  const cid = await E(() => { const e = window.SAGGCAD.editor, it = e.root.items.at(-1); e.setTool('select'); e.setSel([{ kind: 'item', id: it.id }]); return it.id; });
  await p.waitForTimeout(100);
  ok(!!cid && (await item(cid)).type === 'kolon', 'kolon yerleştirildi ve seçili');
  ok(await E(() => !!document.querySelector('.pe-insp .rb-insp [data-k="rb.mode"]') && document.querySelector('.pe-insp [data-k="rb.mode"]').value === 'none'), 'özellik panelinde "Donatı" bölümü: kaynak "Tanımsız"');
  ok(!(await item(cid)).rb, 'tanımsızken kayda donatı yazılmadı (varsayım yok)');

  // ── 2. yönetmelik minimumu ──
  await p.selectOption('.pe-insp [data-k="rb.mode"]', 'min'); await p.waitForTimeout(120);
  let it = await item(cid);
  ok(JSON.stringify(it.rb) === '{"mode":"min"}', 'minimum: kayıtta yalnız kaynak (değerler kesitten türetilir)');
  ok(await E(() => /10Ø14/.test(document.querySelector('.pe-insp .rb-insp').textContent) && /ön tahmin/.test(document.querySelector('.pe-insp .rb-insp').textContent)), 'panel: 10Ø14 · etriye Ø8, "ön tahmin" uyarısı');
  const kMin = await kgOf(cid);
  ok(Math.abs(kMin - 54.397) < 0.01, `minimum donatı 54,40 kg (elle hesap: 10×3,36×1,208 + 23×1,52×0,395) — ${kMin.toFixed(3)}`);

  // ── 3. elle (statik projeden): minimum değerler açıkça kopyalanır, sonra düzenlenir ──
  await p.selectOption('.pe-insp [data-k="rb.mode"]', 'manual'); await p.waitForTimeout(120);
  it = await item(cid);
  ok(it.rb.mode === 'manual' && it.rb.n === 10 && it.rb.d === 14 && it.rb.sd === 8 && it.rb.sc === 10 && it.rb.s === 15, 'elle: minimum değerler kayda açıkça yazıldı');
  await p.fill('.pe-insp [data-k="r.rb.n"]', '12'); await p.press('.pe-insp [data-k="r.rb.n"]', 'Tab'); await p.waitForTimeout(120);
  await p.selectOption('.pe-insp [data-k="r.rb.d"]', '16'); await p.waitForTimeout(120);
  it = await item(cid);
  ok(it.rb.n === 12 && it.rb.d === 16, 'elle: 12Ø16 girildi');
  const kMan = await kgOf(cid);
  const exp = 12 * (2.8 + 0.4 * 1.6) * (7850 * Math.PI * 0.016 ** 2 / 4) + 23 * 1.52 * (7850 * Math.PI * 0.008 ** 2 / 4);
  ok(Math.abs(kMan - exp) < 1e-6, `elle donatı metrajı ${kMan.toFixed(2)} kg (12 × 3,44 m Ø16 + etriyeler)`);
  await p.fill('.pe-insp [data-k="r.rb.s"]', '30'); await p.press('.pe-insp [data-k="r.rb.s"]', 'Tab'); await p.waitForTimeout(120);
  ok(await E(() => /orta bölge aralığı 30 cm/.test(document.querySelector('.pe-insp .rb-insp .rv-warn')?.textContent || '')), 'yönetmelik sınırını aşan aralık uyarıldı (değer değiştirilmedi)');
  ok((await item(cid)).rb.s === 30, 'kullanıcı değeri korundu');
  await blur(); await p.keyboard.press('Control+z'); await p.waitForTimeout(120);
  ok((await item(cid)).rb.s === 15, 'Ctrl+Z: donatı değişikliği geri alındı');
  if (OUT) await p.screenshot({ path: path.join(OUT, 'donati-panel.png') });

  // ── 4. Donatı metrajı penceresi ──
  await E(() => { window.SAGGCAD.cmds().find(c => c.id === 'model.rebar').run(); });
  await p.waitForSelector('.rb [data-rbd], .rb .rb-el');
  const t1 = await E(() => ({ total: document.querySelector('[data-rt="total"]').textContent, manual: document.querySelector('[data-rt="manual"]').textContent, min: document.querySelector('[data-rt="min"]').textContent, rows: document.querySelectorAll('.rb-el tbody tr').length, none: document.querySelectorAll('.rb-el tbody tr.rb-none').length, warn: /tanımsız/.test(document.querySelector('.rb').textContent) }));
  ok(t1.rows >= 2 && t1.none >= 1 && t1.warn, `pencere: ${t1.rows} betonarme eleman (kolon + balkon döşemesi), tanımsız olanlar ayrı ve uyarılı`);
  ok(/^0 kg$/.test(t1.min) && t1.manual === t1.total, `kesin / tahmini ayrı: toplam ${t1.total}, statik projeden ${t1.manual}, minimum ${t1.min}`);
  await p.click('[data-rmin]'); await p.waitForTimeout(200);
  const slabRb = await E(() => JSON.stringify(window.SAGGCAD.editor.root.slabs.find(s => s.id === 'zs1').rb));
  ok(slabRb === '{"mode":"min"}', 'tanımsızlara minimum atandı (balkon döşemesi); elle girilen kolona dokunulmadı');
  ok((await item(cid)).rb.mode === 'manual', 'kolonun elle donatısı korundu');
  const t2 = await E(() => ({ min: document.querySelector('[data-rt="min"]').textContent, d8: !!document.querySelector('[data-rbd] tr[data-d="8"]'), d16: !!document.querySelector('[data-rbd] tr[data-d="16"]') }));
  ok(t2.min !== '0 kg' && t2.d8 && t2.d16, `çap toplamları Ø8 ve Ø16; minimum tahmini ${t2.min}`);
  const rep = await E(async () => { const M = await import('./js/bim/rebar.js'); const r = M.rebarReport(window.SAGGCAD.editor.root); return { total: r.totals.total, sum: r.byDiameter.reduce((s, x) => s + x.kg, 0), man: r.totals.manual, min: r.totals.min }; });
  ok(Math.abs(rep.total - rep.sum) < 1e-9 && Math.abs(rep.total - rep.man - rep.min) < 1e-9, 'genel toplam = çap toplamları = kesin + tahmini');
  // kurallar: bindirme 50Ø → kolon boyuna boyu 2,80 + 0,80
  await p.click('.rb-rules summary'); await p.fill('[data-ru="lap"]', '50'); await p.press('[data-ru="lap"]', 'Tab'); await p.waitForTimeout(150);
  ok(await E(() => window.SAGGCAD.editor.root.meta.rebar?.lap === 50), 'kural (bindirme 50Ø) projeye yazıldı');
  const kLap = await kgOf(cid);
  const exp2 = 12 * (2.8 + 0.5 * 1.6) * (7850 * Math.PI * 0.016 ** 2 / 4) + 23 * 1.52 * (7850 * Math.PI * 0.008 ** 2 / 4);
  ok(Math.abs(kLap - exp2) < 1e-6, 'kural değişince metraj yeniden hesaplandı');
  // CSV
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('[data-rcsv]')]);
  const csv = fs.readFileSync(await dl.path(), 'utf8');
  if (OUT) fs.copyFileSync(await dl.path(), path.join(OUT, dl.suggestedFilename()));
  ok(csv.charCodeAt(0) === 0xFEFF && /Statik projeden \(elle\)/.test(csv) && /Yönetmelik minimumu \(yaklaşık\)/.test(csv) && /ÇAP TOPLAMI/.test(csv), 'CSV: BOM, kaynak sütunu, çap toplamı');
  if (OUT) await p.screenshot({ path: path.join(OUT, 'donati-metraji.png') });
  // satırdan elemana git
  await p.click('.rb-el tr[data-rel="zs1"] [data-go]'); await p.waitForTimeout(200);
  ok(await E(() => window.SAGGCAD.editor.sel?.id === 'zs1' && !document.querySelector('.modal-back')), 'satırdan elemana gidildi (seçildi)');
  ok(await E(() => /Döşeme/.test(document.querySelector('.pe-insp .rb-insp h4').textContent)), 'döşeme panelinde donatı bölümü');
  // toplu atama tek geri al
  await blur(); await p.keyboard.press('Control+z'); await p.waitForTimeout(120);   // kural
  await p.keyboard.press('Control+z'); await p.waitForTimeout(120);                 // toplu minimum
  ok(await E(() => !window.SAGGCAD.editor.root.slabs.find(s => s.id === 'zs1').rb), 'toplu minimum atama tek Ctrl+Z ile geri alındı');

  // ── 5. betonarme olmayan eleman: bölüm yok; kayıt / yeniden aç ──
  await E(() => { const e = window.SAGGCAD.editor; e.setSel([{ kind: 'wall', id: e.root.walls[0].id }]); });
  ok(await E(() => !document.querySelector('.pe-insp .rb-insp')), 'tuğla duvarda donatı bölümü yok');
  await p.waitForTimeout(700);
  const before = JSON.stringify((await item(cid)).rb);
  await p.reload(); await p.waitForSelector('#ps2d svg.pe-svg'); await p.waitForTimeout(400);
  ok(JSON.stringify((await item(cid)).rb) === before, 'kaydet / yeniden aç: donatı tanımı korunuyor');
  ok(!errs.length, 'konsol / sayfa hatası yok' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await b.close();

  // ── 6. mobil ──
  const mb = await chromium.launch(); const mp = await (await mb.newContext({ ...devices['Pixel 7'] })).newPage(); const merr = [];
  mp.on('pageerror', e => merr.push(e.message)); mp.on('console', m => m.type() === 'error' && merr.push(m.text()));
  await openVilla(mp);
  await mp.evaluate(() => { window.SAGGCAD.cmds().find(c => c.id === 'model.rebar').run(); });
  await mp.waitForSelector('.rb');
  ok(await mp.evaluate(() => { const r = document.querySelector('.modal').getBoundingClientRect(); return r.left >= -1 && r.right <= innerWidth + 1; }), 'mobil: donatı metrajı penceresi ekrana sığıyor');
  await mp.tap('[data-rmin]'); await mp.waitForTimeout(200);
  ok(await mp.evaluate(() => window.SAGGCAD.editor.root.slabs.find(s => s.id === 'zs1').rb?.mode === 'min'), 'mobil: toplu minimum atama');
  ok(!merr.length, 'mobil: konsol hatası yok' + (merr.length ? ': ' + merr.join(' | ') : ''));
  await mb.close();
  console.log('DONATI uçtan uca: TÜMÜ GEÇTİ');
})().catch(e => { console.error(e); process.exit(1); });
