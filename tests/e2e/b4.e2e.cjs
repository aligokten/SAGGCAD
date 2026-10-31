/* B4A+B4B uçtan uca: çizim kökeni, Revizyon Karşılaştırması penceresi, safha / toplu / eşleştirme / revizyon kodu ve
 * geri alma, çizimde göster (kat geçişi, vurgu), görünürlük filtreleri, kaynak sonradan değişince uyarı, CSV / PDF rapor,
 * yıkım / yeni imalat / karşılaştırma paftaları (PDF vektörel, SVG, DXF), eski proje aç / kaydet, mobil, çevrimdışı.
 * İsteğe bağlı — proje bağımlılığı değildir:  npm start ; node tests/e2e/b4.e2e.cjs http://localhost:8080/
 * Playwright yoksa test atlanır ve bunu açıkça bildirir (başarılı sayılmaz).
 */
const path = require('path'), fs = require('fs');
let chromium, devices;
try { ({ chromium, devices } = require('playwright')); } catch { console.log('ATLANDI: playwright bulunamadı — bu test çalıştırılmadı'); process.exit(2); }
const BASE = process.argv[2] || 'http://localhost:8080/';
const FIXTURE = path.join(__dirname, '..', 'fixtures', 'eski-proje-v1.saggcad.json');
const OUT = process.env.B4_OUT || null;   // örnek çıktıların kaydedileceği klasör (isteğe bağlı)
const ok = (c, m) => { if (!c) throw new Error('B4 HATA: ' + m); console.log('✓', m); };

async function importFixture(p) {
  await p.goto(BASE); await p.waitForSelector('[data-imp]', { state: 'attached' });
  await p.setInputFiles('[data-imp]', FIXTURE); await p.waitForSelector('.dw-list');
}
const runCmd = (p, id) => p.evaluate(id => { window.SAGGCAD.cmds().find(c => c.id === id).run(); }, id);
async function dl(p, fn) { const [d] = await Promise.all([p.waitForEvent('download'), fn()]); const f = await d.path(); const buf = fs.readFileSync(f); if (OUT) fs.copyFileSync(f, path.join(OUT, d.suggestedFilename())); return { name: d.suggestedFilename(), buf }; }

(async () => {
  if (OUT) fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1500, height: 950 }, acceptDownloads: true });
  const p = await ctx.newPage(); const errs = [];
  p.setDefaultTimeout(20000);
  p.on('pageerror', e => errs.push('PAGE: ' + e.message)); p.on('console', m => m.type() === 'error' && errs.push('CONSOLE: ' + m.text()));
  const E = (fn, a) => p.evaluate(fn, a);
  const blur = () => E(() => { document.activeElement?.blur(); });
  await importFixture(p);
  const P0 = await E(() => JSON.stringify(window.SAGGCAD.project.drawings.find(d => d.main).plan));

  // ── 1: rölöve kopyasından proje çizimi (köken) ──
  await p.click('[data-dw="dwfx1"] [data-dwa="copy"]'); await p.waitForTimeout(300);
  const nd = await E(() => { const d = window.SAGGCAD.project.drawings.at(-1), m = window.SAGGCAD.project.drawings.find(x => x.main); return { id: d.id, src: d.sourceDrawingId, at: d.sourceCreatedAt, rl: d.revisionLabel, same: JSON.stringify(d.plan) === JSON.stringify(m.plan) }; });
  ok(nd.src === 'dwfx1' && nd.at > 0 && nd.rl === 'R1' && nd.same, 'kopya: kaynak çizim, oluşturma zamanı ve revizyon etiketi kaydedildi; kimlikler korundu');
  ok(await E(() => window.SAGGCAD.project.drawings.find(d => d.id === 'dwfx2').sourceDrawingId === undefined), 'eski çizime otomatik kaynak atanmadı');

  // proje çizimini aç ve düzenle: kalınlık, sil, yeni duvar, kapı ekle, yeniden çizim (farklı kimlik), mahal
  await E(id => { location.hash = `#/p/${window.SAGGCAD.project.id}/plan?d=${id}`; }, nd.id); await p.waitForSelector('#ps2d svg.pe-svg'); await p.waitForTimeout(300);
  await E(() => {
    const e = window.SAGGCAD.editor;
    e.bimCommand({ op: 'setInstanceParam', id: 'wfx003', key: 'thickness', value: 30 });
    e.hist.open('Tadilat'); const R = e.root;
    R.walls = R.walls.filter(w => w.id !== 'wfx004'); R.openings = R.openings.filter(o => o.wallId !== 'wfx004');
    R.walls.push({ id: 'wYENI1', a: { x: 0, y: 700 }, b: { x: 300, y: 700 }, t: 15 });
    R.walls.find(w => w.id === 'wfx005').id = 'wYENIDEN';
    R.openings.forEach(o => { if (o.wallId === 'wfx005') o.wallId = 'wYENIDEN'; });
    R.openings.push({ id: 'oKAPI1', wallId: 'wfx003', type: 'door', pos: 120, w: 90, h: 210, sill: 0 });
    R.levels[0].walls[0].t = 25;   // üst katta değişiklik
    e.hist.close(); e.changed();
  });

  // ── pencere ──
  await runCmd(p, 'model.revision'); await p.waitForSelector('.rv');
  const cards = async () => E(() => Object.fromEntries([...document.querySelectorAll('.rv .mh-card')].map(c => [c.querySelector('span').textContent, c.querySelector('b').textContent])));
  let C = await cards();
  ok(C['Önerilen kaldırma'] === '2' && C['Yeni duvar'] === '2' && C['Değiştirilen duvar'] === '2' && C['Kapı + / −'] === '1 / 1', `özet: ${JSON.stringify(C)}`);
  ok(await E(() => document.querySelector('.rv-prov').textContent.includes('kopyasından')), 'köken bilgisi gösteriliyor');
  ok(await E(() => [...document.querySelectorAll('.rv-sug [data-match]')].some(b => b.dataset.match.startsWith('wfx005|wYENIDEN'))), '7: farklı kimlikli yeniden çizim → yalnız öneri (otomatik eşleşmedi)');

  // ── 14: safha ataması + Ctrl+Z ──
  const rowSel = k => `.rv-list tr[data-key="${k}"]`;
  await p.selectOption(`${rowSel('L0/wfx004')} [data-phase]`, 'demolish'); await p.waitForTimeout(150);
  ok(await E(() => window.SAGGCAD.editor.root.meta.revision?.phases?.['L0/wfx004'] === 'demolish') && await E(s => document.querySelector(s).textContent.includes('onaylandı'), rowSel('L0/wfx004')), 'safha onaylandı (yıkılacak)');
  // ── toplu sınıflandırma ──
  await p.check(`${rowSel('L0/wfx003')} [data-pick]`); await p.check(`${rowSel('L0/wYENI1')} [data-pick]`);
  await p.click('.rv-bulk [data-bulk="modify"]'); await p.waitForTimeout(150);
  ok(await E(() => { const ph = window.SAGGCAD.editor.root.meta.revision.phases; return ph['L0/wfx003'] === 'modify' && ph['L0/wYENI1'] === 'modify'; }), 'toplu sınıflandırma (2 eleman)');
  // ── 15: elle eşleştirme ──
  await p.click('.rv-sug [data-match^="wfx005|wYENIDEN"]'); await p.waitForTimeout(150);
  ok(await E(() => !!document.querySelector('.rv-list tr[data-key="L0/wYENIDEN"]') === false || document.querySelector('.rv-list tr[data-key="L0/wYENIDEN"] .st-m')), 'eşleştirme uygulandı (değişmeyen ya da "elle" işaretli)');
  // ── revizyon kodu ──
  await p.fill('[data-revcode]', 'R2-A'); await p.dispatchEvent('[data-revcode]', 'change'); await p.waitForTimeout(150);
  ok(await E(() => window.SAGGCAD.editor.root.meta.revision.code === 'R2-A'), 'revizyon kodu R2-A');
  await p.click('.modal-foot [data-k="ok"]'); await p.waitForTimeout(250);
  // geri al: kod → eşleştirme → toplu → safha (her biri tek Ctrl+Z); zaman çizelgesi aynı günlük
  const rev = () => E(() => JSON.stringify(window.SAGGCAD.editor.root.meta.revision || null));
  const steps = [];
  for (let i = 0; i < 4; i++) { await blur(); await p.keyboard.press('Control+z'); await p.waitForTimeout(120); steps.push(await rev()); }
  ok(!JSON.parse(steps[0]).code && JSON.parse(steps[1]).matches === undefined && JSON.parse(steps[2]).phases['L0/wfx003'] === undefined && steps[3] === 'null', 'kod / eşleştirme / toplu / safha: dört ayrı tek Ctrl+Z');
  for (let i = 0; i < 4; i++) { await blur(); await p.keyboard.press('Control+Shift+z'); await p.waitForTimeout(120); }
  ok(JSON.parse(await rev()).code === 'R2-A', 'yinele: kararlar geri geldi');
  await p.click('[data-a="tl"]'); await p.waitForTimeout(100);
  ok(await E(() => [...document.querySelectorAll('.pe-tl .tl-chip span')].map(s => s.textContent).some(t => t.includes('Revizyon kodu'))), 'U1 zaman çizelgesinde revizyon kayıtları görünüyor');
  await p.click('[data-a="tl"]');

  // ── çizimde göster: kat geçişi + vurgu ──
  await runCmd(p, 'model.revision'); await p.waitForSelector('.rv');
  await p.selectOption('[data-level]', 'lvfx1'); await p.waitForTimeout(100);
  const k1 = await E(() => document.querySelector('.rv-list tr[data-key^="lvfx1/"]')?.dataset.key);
  await p.click(`.rv-list tr[data-key="${k1}"] [data-show]`); await p.waitForTimeout(300);
  ok(await E(() => window.SAGGCAD.editor.lv === 1 && !!document.querySelector('.rev-layer .rev-hl') && !!document.querySelector('.rev-banner')), `"Göster": 1. kata geçildi, ${k1} vurgulandı, revizyon şeridi açık`);
  // görünürlük filtresi
  await runCmd(p, 'model.revision'); await p.waitForSelector('.rv');
  await p.selectOption('[data-level]', '*'); await p.selectOption('[data-ovf]', 'demolish'); await p.click('[data-overlay]'); await p.waitForTimeout(300);
  await E(() => window.SAGGCAD.editor.setLevel(0)); await p.waitForTimeout(150);
  const styles = await E(() => [...new Set([...document.querySelectorAll('.rev-layer path[data-k]')].map(x => x.getAttribute('data-l')))]);
  ok(styles.length === 1 && styles[0] === 'REV-YIKIM', `"Yalnız yıkılacaklar" filtresi: ${styles.join(',')}`);
  if (OUT) await p.screenshot({ path: path.join(OUT, 'revizyon-gorunumu-yikim.png') });
  await runCmd(p, 'model.revision'); await p.waitForSelector('.rv'); await p.selectOption('[data-ovf]', 'all'); await p.click('[data-overlay]'); await p.waitForTimeout(300);
  const st2 = await E(() => [...new Set([...document.querySelectorAll('.rev-layer path[data-k]')].map(x => x.getAttribute('data-l')))].sort());
  ok(['REV-DEGISEN', 'REV-MEVCUT', 'REV-YENI', 'REV-YIKIM'].every(l => st2.includes(l)), `karşılaştırma görünümü: ${st2.join(', ')}`);
  if (OUT) await p.screenshot({ path: path.join(OUT, 'revizyon-gorunumu-karsilastirma.png') });
  ok(await E(() => document.querySelector('#ps2d .pe').classList.contains('rev-on')), 'revizyon görünümü açık (plan soluk)');

  // ── raporlar ──
  await runCmd(p, 'model.revision'); await p.waitForSelector('.rv');
  const csv = await dl(p, () => p.click('[data-csv]'));
  const rows = csv.buf.toString('utf8').replace(/^﻿/, '').trim().split('\r\n').map(l => l.split(';'));
  const tot = rows.find(r => r[0] === 'ÖZET' && r[1] === 'Toplam');
  const sum = await E(() => { const t = document.querySelectorAll('.rv .mh-card b'); return [...t].map(x => x.textContent); });
  ok(csv.name.endsWith('.csv') && tot && +tot[5] === +sum[2] && +tot[6] === +sum[3] && +tot[7] === +sum[4], `17: CSV toplamları panelle aynı (kaldırma ${tot?.[5]}, yeni ${tot?.[6]}, değişen ${tot?.[7]})`);
  const rp = await dl(p, () => p.click('[data-rpdf]'));
  ok(rp.buf.slice(0, 5).toString() === '%PDF-' && rp.buf.length > 2000, `PDF rapor (${(rp.buf.length / 1024).toFixed(1)} kB)`);

  // ── 16: paftalar ──
  await p.selectOption('[data-level]', 'L0');
  for (const [sheet, fmt] of [['demolition', 'pdf'], ['demolition', 'svg'], ['demolition', 'dxf'], ['new', 'pdf'], ['new', 'svg'], ['existing', 'svg'], ['compare', 'pdf'], ['compare', 'dxf']]) {
    await p.selectOption('[data-sheet]', sheet); await p.selectOption('[data-fmt]', fmt);
    const f = await dl(p, () => p.click('[data-sheetdl]')), s = f.buf.toString('latin1');
    if (fmt === 'pdf') ok(s.startsWith('%PDF-') && !/\/Subtype\s*\/Image/.test(s), `${sheet} PDF: vektörel (görüntü nesnesi yok) — ${f.name}`);
    if (fmt === 'svg') { const t = f.buf.toString('utf8'); ok(/width="\d+mm"/.test(t) && t.includes('1:50') && t.includes('R2-A') && t.includes(sheet === 'demolition' ? '#D33A4A' : sheet === 'new' ? '#15803D' : '#6B7280'), `${sheet} SVG: mm ölçekli kağıt, 1:50, revizyon kodu, renk`); }
    if (fmt === 'dxf') ok(/REV-YIKIM\r\n70\r\n0\r\n62\r\n1\r\n6\r\nDASHED/.test(s) && /\$INSUNITS\r\n70\r\n4/.test(s), `${sheet} DXF: yıkım katmanı kırmızı + kesik çizgi, mm`);
  }
  // vektörel PDF içeriği (sıkıştırmasız üret): renk, kesik çizgi, gerçek ölçek kağıt
  const pdfInfo = await E(async () => {
    const [{ compareDrawings }, V] = await Promise.all([import('./js/bim/diff.js'), import('./js/revview.js')]);
    const S = window.SAGGCAD, src = S.project.drawings.find(d => d.main).plan, dst = S.editor.root, r = compareDrawings(src, dst);
    const sh = V.revisionSheet(src, dst, r, 'L0', { mode: 'demolition', N: 50 }), pdf = await V.revisionPdf([sh], { compress: false }), out = pdf.output();
    return { sample: (out.match(/[\d. ]+ RG/g) || []).slice(0, 6).join(' | ') + ' || ' + (out.match(/\[[^\]]*\] \d+ d/g) || []).slice(0, 3).join(' | '), red: /0\.83 0\.23 0\.29 RG/.test(out), dash: /\[5\.669\d* 3\.401\d*\] 0\.? d/.test(out), box: out.match(/\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/)?.slice(1).map(Number), paper: sh.paper, img: /\/Subtype \/Image/.test(out) };
  });
  ok(pdfInfo.red && pdfInfo.dash && !pdfInfo.img && Math.abs(pdfInfo.box[0] - pdfInfo.paper.w / 25.4 * 72) < 1, `PDF: yıkım rengi (#D33A4A → 0.83 0.23 0.29 RG), kesik desen 2 / 1,2 mm, ${pdfInfo.paper.k} gerçek ölçü (${pdfInfo.box.map(v => v.toFixed(0)).join('×')} pt)`);
  await p.click('.modal-foot [data-k="ok"]'); await p.waitForTimeout(200);

  // ── 13: kaynak sonradan değişti ──
  await E(() => { const S = window.SAGGCAD, m = S.project.drawings.find(d => d.main); m.plan.walls.push({ id: 'wSONRA', a: { x: 0, y: 1100 }, b: { x: 200, y: 1100 }, t: 15 }); m.updatedAt = Date.now() + 1000; });
  await runCmd(p, 'model.revision'); await p.waitForSelector('.rv');
  ok(await E(() => [...document.querySelectorAll('.rv-warn')].some(x => x.textContent.includes('kopya alındıktan sonra değişti')) && !!document.querySelector('.rv-list tr[data-key="L0/wSONRA"]')), '13: kaynak değişti uyarısı; fark güncel kaynaktan (wSONRA yalnız kaynakta)');
  await p.click('.modal-foot [data-k="ok"]'); await p.waitForTimeout(200);
  await E(() => { const m = window.SAGGCAD.project.drawings.find(d => d.main); m.plan.walls = m.plan.walls.filter(w => w.id !== 'wSONRA'); });
  ok(await E(() => JSON.stringify(window.SAGGCAD.project.drawings.find(d => d.main).plan)) === P0, 'karşılaştırma ve paftalar kaynak (rölöve) JSON\'unu değiştirmedi');

  // ── 18: kaydet → proje dosyası → yeniden içe aktar ──
  await p.waitForTimeout(900);
  const proj = await E(() => JSON.stringify(window.SAGGCAD.project));
  await p.reload(); await p.waitForSelector('#ps2d svg.pe-svg'); await p.waitForTimeout(400);
  const back = await E(() => JSON.parse(JSON.stringify(window.SAGGCAD.project)));
  const pj = JSON.parse(proj);
  ok(JSON.stringify(back.drawings.map(d => [d.id, d.sourceDrawingId, d.revisionLabel, d.plan.meta?.revision])) === JSON.stringify(pj.drawings.map(d => [d.id, d.sourceDrawingId, d.revisionLabel, d.plan.meta?.revision])), '18: kaydet / yeniden yükle: köken ve kararlar korundu');
  ok(back.drawings.find(d => d.main).plan.walls.map(w => w.id).join() === JSON.parse(P0).walls.map(w => w.id).join(), 'eleman kimlikleri değişmedi');
  ok(!errs.length, 'konsol / sayfa hatası yok' + (errs.length ? ': ' + errs.join(' | ') : ''));

  // ── 20: çevrimdışı ──
  await E(async () => { if (location.protocol !== 'https:') await navigator.serviceWorker.register('sw.js'); await navigator.serviceWorker.ready; });
  await p.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 20000 });
  const cached = await E(async () => { const c = await caches.open((await caches.keys()).find(k => k.startsWith('saggcad-'))); return Promise.all(['js/bim/diff.js', 'js/revview.js', 'js/revui.js'].map(async u => !!(await c.match(new URL(u, location.href).href)))); });
  ok(cached.every(Boolean), 'yeni modüller çevrimdışı önbellekte');
  await ctx.setOffline(true);
  await p.reload(); await p.waitForSelector('#ps2d svg.pe-svg', { timeout: 15000 }); await p.waitForTimeout(400);
  await runCmd(p, 'model.revision'); await p.waitForSelector('.rv');
  ok(await E(() => document.querySelectorAll('.rv .mh-card').length === 8), '20: çevrimdışı Revizyon Karşılaştırması açıldı');
  await ctx.setOffline(false);
  await b.close();

  // ── 19: mobil ──
  const mb = await chromium.launch(); const mp = await (await mb.newContext({ ...devices['Pixel 7'] })).newPage(); const merr = [];
  mp.on('pageerror', e => merr.push(e.message)); mp.on('console', m => m.type() === 'error' && merr.push(m.text()));
  await importFixture(mp);
  await mp.click('[data-dw="dwfx1"] [data-dwa="copy"]'); await mp.waitForTimeout(300);
  await mp.evaluate(() => { const S = window.SAGGCAD, d = S.project.drawings.at(-1); location.hash = `#/p/${S.project.id}/plan?d=${d.id}`; }); await mp.waitForSelector('#ps2d svg.pe-svg'); await mp.waitForTimeout(300);
  await mp.evaluate(() => { const e = window.SAGGCAD.editor; e.hist.open('x'); e.root.walls.pop(); e.hist.close(); e.changed(); window.SAGGCAD.cmds().find(c => c.id === 'model.revision').run(); });
  await mp.waitForSelector('.rv');
  const fit = await mp.evaluate(() => { const vw = innerWidth, r = document.querySelector('.modal').getBoundingClientRect(), wide = [...document.querySelectorAll('.rv *')].filter(x => x.getBoundingClientRect().right > vw + 1 && !x.closest('.rv-list')); return { left: r.left, right: r.right, vw, over: wide.length, sw: document.documentElement.scrollWidth }; });
  ok(fit.left >= 0 && fit.right <= fit.vw + 1 && fit.over === 0 && fit.sw <= fit.vw + 1, `19: mobilde pencere ekrana sığıyor (${Math.round(fit.right)} ≤ ${fit.vw})`);
  await mp.click('[data-overlay]'); await mp.waitForTimeout(300);
  const bn = await mp.evaluate(() => { const r = document.querySelector('.rev-banner').getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth + 1; });
  ok(bn, 'mobil: revizyon şeridi ekrana sığıyor');
  ok(!merr.length, 'mobil: konsol hatası yok' + (merr.length ? ': ' + merr.join(' | ') : ''));
  await mb.close();
  console.log('B4: TÜMÜ GEÇTİ');
})().catch(e => { console.error(e.message); process.exit(1); });
