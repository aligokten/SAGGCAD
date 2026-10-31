/* B3-C 3D kısmi güncelleme uçtan uca testi (isteğe bağlı — proje bağımlılığı değildir).
 *   npm start                       # http://localhost:8080
 *   node tests/e2e/b3-3d.e2e.cjs http://localhost:8080/
 * Her düzenlemeden sonra kısmi güncellenen sahne, sıfırdan kurulan sahneyle (duvar ağları, açıklık nesneleri,
 * döşeme) birebir karşılaştırılır; kamera / hedef / güneş korunur; eski geometri bellekten bırakılır.
 * Playwright yoksa test atlanır ve bunu açıkça bildirir (başarılı sayılmaz).
 */
const path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); } catch { console.log('ATLANDI: playwright bulunamadı — bu test çalıştırılmadı'); process.exit(2); }
const BASE = process.argv[2] || 'http://localhost:8080/';
const FIXTURE = path.join(__dirname, '..', 'fixtures', 'eski-proje-v1.saggcad.json');
const ok = (c, m) => { if (!c) throw new Error('B3-3D HATA: ' + m); console.log('✓', m); };

(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await (await b.newContext({ viewport: { width: 1500, height: 900 } })).newPage(); const errs = [];
  p.on('pageerror', e => errs.push('PAGE: ' + e.message)); p.on('console', m => m.type() === 'error' && errs.push('CONSOLE: ' + m.text()));
  await p.goto(BASE); await p.waitForSelector('[data-imp]', { state: 'attached' });
  await p.setInputFiles('[data-imp]', FIXTURE); await p.waitForSelector('.dw-list');
  await p.click('.dw-card.main a.btn-primary'); await p.waitForSelector('#ps2d svg.pe-svg'); await p.waitForTimeout(400);
  await p.click('#psMode [data-m="3d"]'); await p.waitForSelector('#p3host canvas', { timeout: 30000 }); await p.waitForTimeout(900);
  // sahne imzası: kat grubu başına ad + duvar / sahip / mahal etiketi + konum + köşe dizisi (yuvarlatılmış), sıralı
  await p.evaluate(() => {
    const r = v => Math.round(v * 1e4) / 1e4;
    window.__sig = () => {
      const P3 = window.SAGGCAD.p3, out = [];
      P3.root.updateMatrixWorld(true);
      const tag = o => { for (let q = o; q && q !== P3.root; q = q.parent) { const u = q.userData; if (u.wall || u.ownerWall || u.roomObj || u.levelSlab) return u.wall || u.ownerWall || u.roomObj || 'döşeme'; } return null; };
      let other = 0;
      P3.root.traverse(o => {
        if (!o.isMesh && !o.isLight) return;
        if (!tag(o)) { other++; return; }   // mobilya vb. (bazı bitki modelleri rastgele yapraklıdır) yalnız sayıyla
        const pos = o.geometry?.attributes?.position, e = o.matrixWorld.elements.map(r);
        out.push(JSON.stringify([o.name, tag(o), o.material?.color?.getHexString?.() || '', e, pos ? Array.from(pos.array, r) : []]));
      });
      return out.sort().join('\n') + '\ndiğer:' + other;
    };
    window.__cam = () => { const P3 = window.SAGGCAD.p3; return JSON.stringify([P3.camera.position.toArray().map(r), P3.controls?.target?.toArray().map(r), P3.sun?.position.toArray().map(r)]); };
    window.__geoCount = () => window.SAGGCAD.p3.renderer.info.memory.geometries;
  });
  const step = async (label, fn, expectMode = 'partial') => {
    const cam0 = await p.evaluate(() => window.__cam());
    const r = await p.evaluate(fn);
    if (r && r.ok === false) throw new Error(label + ': ' + JSON.stringify(r.errors));
    const res = await p.evaluate(() => { const P3 = window.SAGGCAD.p3, t = performance.now(); P3.setPlan(window.SAGGCAD.editor.root); return { ms: performance.now() - t, last: P3.stats3d.last }; });
    const part = await p.evaluate(() => window.__sig()), cam1 = await p.evaluate(() => window.__cam());
    await p.evaluate(() => window.SAGGCAD.p3.build());
    const full = await p.evaluate(() => window.__sig());
    ok(res.last.mode === expectMode, `${label}: ${res.last.mode === 'partial' ? `kısmi güncelleme (${res.last.walls.length} duvar ağı, ${res.ms.toFixed(1)} ms)` : `güvenli tam kurulum (${res.ms.toFixed(1)} ms)`}`);
    if (part !== full && process.env.DBG) { const A = new Set(part.split('\n')), B = new Set(full.split('\n')); console.log('YALNIZ KISMİ:', [...A].filter(x => !B.has(x)).map(x => x.slice(0, 160))); console.log('YALNIZ TAM:', [...B].filter(x => !A.has(x)).map(x => x.slice(0, 160))); }
    ok(part === full, `${label}: kısmi sahne = tam kurulum (${part.split('\n').length} nesne)`);
    ok(cam0 === cam1, `${label}: kamera, hedef ve güneş korundu`);
    return res;
  };
  const cmd = c => window.SAGGCAD.editor.bimCommand(c);
  // isınma: ilk kısmi güncellemede sahne dolu olsun
  await p.evaluate(() => { const P3 = window.SAGGCAD.p3; P3.camera.position.set(9, 7, 11); P3.controls?.target.set(3, 0, 2); P3.controls?.update(); P3.setPlan(window.SAGGCAD.editor.root, { full: true }); });
  const g0 = await p.evaluate(() => window.__geoCount());
  await step('Kalınlık', () => window.SAGGCAD.editor.bimCommand({ op: 'setInstanceParam', id: 'wfx003', key: 'thickness', value: 30 }));
  await step('Yükseklik', () => window.SAGGCAD.editor.bimCommand({ op: 'setInstanceParam', id: 'wfx006', key: 'height', value: 240 }));
  await step('Uç sürükleme', () => window.SAGGCAD.editor.bimCommand({ op: 'moveWallEnd', id: 'wfx001', end: 'b', to: { x: 557.5, y: -7.5 } }));
  await step('Pencere taşıma', () => { const e = window.SAGGCAD.editor; e.hist.open('Taşıma'); e.root.openings.find(o => o.id === 'ofx00e').pos = 200; e.hist.close(); e.changed(); });   // kanvas sürüklemesiyle aynı yol
  await step('Kompozit değişimi', () => window.SAGGCAD.editor.bimCommand({ op: 'setInstanceParam', id: 'wfx007', key: 'compositeId', value: 'perde-25' }));
  await step('Geri al (Ctrl+Z)', () => { window.SAGGCAD.editor.undo(); });
  await step('Kat yüksekliği', () => window.SAGGCAD.editor.bimCommand({ op: 'setLevelHeight', level: 0, height: 300 }), 'full');
  // bellek: tekrarlanan güncellemelerde geometri sayısı büyümez
  for (let i = 0; i < 6; i++) await p.evaluate(i => { const e = window.SAGGCAD.editor; e.bimCommand({ op: 'setInstanceParam', id: 'wfx003', key: 'thickness', value: 20 + (i % 2) * 5 }); window.SAGGCAD.p3.setPlan(e.root); window.SAGGCAD.p3.renderer.render(window.SAGGCAD.p3.scene, window.SAGGCAD.p3.camera); }, i);
  const g1 = await p.evaluate(() => window.__geoCount());
  ok(g1 <= g0 + 4, `eski BufferGeometry'ler bırakıldı (GPU geometri sayısı ${g0} → ${g1})`);
  ok(!errs.length, 'konsol / sayfa hatası yok' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await b.close();
  console.log('B3 3D KISMİ GÜNCELLEME: TÜMÜ GEÇTİ');
})().catch(e => { console.error(e.message); process.exit(1); });
