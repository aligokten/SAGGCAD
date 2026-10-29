// B2A — parametrik BIM düzenleme: komut motoru, tür yönetimi, geçersiz kılma, geri al: node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { planCommand, runCommand, applyPatch, summaryText, noteLegacyEdit } from '../js/bim/commands.js';
import { createBim } from '../js/bim/api.js';
import { getType } from '../js/bim/types.js';
import { buildModel } from '../js/bim/adapter.js';
import { compOf, compThickness } from '../js/materials.js';
import { planToDXF } from '../js/exporters.js';
import { drawView, viewsOf } from '../js/sections.js';
import { planMetrics } from '../js/plan-geom.js';

const FILE = JSON.parse(readFileSync(new URL('./fixtures/eski-proje-v1.saggcad.json', import.meta.url), 'utf8'));
const root = () => JSON.parse(JSON.stringify(FILE.project.drawings[0].plan));
const W12 = ['wfx001', 'wfx003', 'wfx004', 'wfx005', 'wfx006', 'wfx007', 'wfx008', 'wfx009', 'wfx00a', 'wfx00b', 'wfx00c', 'wfx00d'];
const wall = (R, id) => [R, ...R.levels].flatMap(P => P.walls).find(w => w.id === id);
const ok = r => { assert.equal(r.ok, true, JSON.stringify(r.errors)); assert.equal(r.applied, true); return r; };
const T = k => compThickness(compOf(null, k));

/* minimal editör geçmişi: bimCommand / undo / redo ile aynı yığın mantığı */
function history(R) {
  const u = [], r = [];
  return {
    run(cmd) { const x = runCommand(R, cmd); if (x.applied) { u.push(x.patch); r.length = 0; } return x; },
    undo() { const p = u.pop(); applyPatch(R, p, 'undo'); r.push(p); },
    redo() { const p = r.pop(); applyPatch(R, p, 'redo'); u.push(p); },
  };
}
/* DIS-DUV-02 senaryosu: 12 duvar, katmanlar dış sıva / taş yünü / gazbeton / iç sıva */
function scenario() {
  const R = root(), H = history(R);
  ok(H.run({ op: 'duplicateType', from: 'DIS-DUV-01', id: 'DIS-DUV-02', name: 'Dış duvar — gazbeton + taş yünü', params: { compositeId: 'dis-gazbeton' } }));
  ok(H.run({ op: 'assignType', ids: W12, typeId: 'DIS-DUV-02' }));
  return { R, H };
}

test('1 — yeni özel BIM tipi oluşturma', () => {
  const R = root(), json0 = JSON.stringify(R);
  const p = planCommand(R, { op: 'createType', type: { id: 'kol-ba-40', cls: 'column', name: 'Kolon 40/40', params: { materialId: 'betonarme', width: 40, depth: 40, loadBearing: true } } });
  assert.equal(p.ok, true); assert.equal(JSON.stringify(R), json0, 'planCommand kökü değiştirmez');
  ok(runCommand(R, { op: 'createType', type: { id: 'KOL-BA-40', cls: 'column', name: 'Kolon 40/40', params: { materialId: 'betonarme', width: 40, depth: 40, loadBearing: true } } }));
  const t = getType(R, 'KOL-BA-40');
  assert.equal(t.name, 'Kolon 40/40'); assert.equal(t.params.width, 40); assert.equal(t.rev, 1); assert.equal(t.builtin, undefined);
  assert.equal(R.meta.bimTypes.length, 1, 'tür proje verisinde (meta.bimTypes)');
  // hatalı tanımlar reddedilir, veri değişmez
  const j = JSON.stringify(R);
  for (const bad of [
    { id: 'KOL-BA-40', cls: 'column', name: 'aynı kimlik', params: {} },
    { id: 'DIS-DUV-01', cls: 'wall', name: 'yerleşik kimlik', params: {} },
    { id: 'x', cls: 'wall', name: 'kısa kimlik', params: {} },
    { id: 'DUV-X', cls: 'wall', name: '', params: {} },
    { id: 'DUV-X', cls: 'wall', name: 'kalınlık', params: { thickness: -4 } },
    { id: 'DUV-X', cls: 'wall', name: 'kompozit', params: { compositeId: 'yok-boyle' } },
    { id: 'DUV-X', cls: 'wall', name: 'döşeme kompoziti', params: { compositeId: 'dos-balkon' } },
    { id: 'DUV-X', cls: 'level', name: 'sınıf', params: {} },
  ]) assert.equal(runCommand(R, { op: 'createType', type: bad }).ok, false, bad.name);
  assert.equal(JSON.stringify(R), j);
});

test('2 — yerleşik tipten özel tip türetme; yerleşik tür değiştirilemez', () => {
  const R = root();
  ok(runCommand(R, { op: 'duplicateType', from: 'DIS-DUV-01', id: 'DIS-DUV-02', name: 'Dış duvar — gazbeton', params: { compositeId: 'dis-gazbeton' } }));
  const t = getType(R, 'DIS-DUV-02');
  assert.equal(t.base, 'DIS-DUV-01'); assert.equal(t.params.function, 'dis'); assert.equal(t.params.compositeId, 'dis-gazbeton');
  assert.equal(createBim(R).getTypeParameters('DIS-DUV-02').thickness, T('dis-gazbeton'), 'kalınlık kompozitten');
  const r = runCommand(R, { op: 'updateType', id: 'DIS-DUV-01', params: { height: 300 } });
  assert.equal(r.ok, false); assert.match(r.errors[0], /yerleşik/);
  assert.equal(runCommand(R, { op: 'deleteType', id: 'DIS-DUV-01' }).ok, false);
});

test('3 — özel tipten başka bir özel tip türetme', () => {
  const R = root();
  ok(runCommand(R, { op: 'duplicateType', from: 'DIS-DUV-01', id: 'DIS-DUV-02', name: 'A', params: { compositeId: 'dis-gazbeton' } }));
  ok(runCommand(R, { op: 'duplicateType', from: 'DIS-DUV-02', id: 'DIS-DUV-03', name: 'B', params: { loadBearing: true } }));
  const t = getType(R, 'DIS-DUV-03');
  assert.equal(t.base, 'DIS-DUV-02', 'temel = doğrudan kaynak özel tür');
  assert.equal(t.params.compositeId, 'dis-gazbeton'); assert.equal(t.params.loadBearing, true);
  // türetme anında kopya: temel tür sonradan değişince alt tür değişmez
  ok(runCommand(R, { op: 'updateType', id: 'DIS-DUV-02', params: { compositeId: 'dis-tugla-eps' } }));
  assert.equal(getType(R, 'DIS-DUV-03').params.compositeId, 'dis-gazbeton');
  // temel tür silinince alt türün temeli bir üst türe taşınır
  ok(runCommand(R, { op: 'deleteType', id: 'DIS-DUV-02' }));
  assert.equal(getType(R, 'DIS-DUV-03').base, 'DIS-DUV-01');
});

test('4 — BIM elemanına tip atama', () => {
  const { R } = scenario(), bim = createBim(R);
  for (const id of W12) {
    const w = wall(R, id);
    assert.equal(w.bimType, 'DIS-DUV-02'); assert.equal(w.comp, 'dis-gazbeton'); assert.equal(w.t, T('dis-gazbeton')); assert.equal(w.kind, 'dis');
    assert.equal(w.h, 0, 'kata bağlı yükseklik korunur');
    assert.equal(bim.getElement(id).typeSource, 'explicit');
  }
  assert.equal(bim.getElementsByTypeId('DIS-DUV-02').length, 12);
  assert.equal(bim.typeUsage().get('DIS-DUV-02').explicit, 12);
  // sınıfa uymayan atama ve türetilmiş kat döşemesi reddedilir
  const j = JSON.stringify(R);
  assert.equal(runCommand(R, { op: 'assignType', ids: ['ifxcol1'], typeId: 'DIS-DUV-02' }).ok, false);
  assert.equal(runCommand(R, { op: 'assignType', ids: ['L0:kat-dosemesi'], typeId: 'DOS-ARA-01' }).ok, false);
  assert.equal(runCommand(R, { op: 'assignType', ids: ['wfx001', 'ifxcol1'], typeId: 'DIS-DUV-02' }).ok, false, 'toplu atamada tek hata hepsini durdurur');
  assert.equal(JSON.stringify(R), j);
  // kolon ve kiriş türleri
  ok(runCommand(R, { op: 'createType', type: { id: 'KOL-BA-40', cls: 'column', name: 'Kolon 40', params: { materialId: 'betonarme', shape: 'rect', width: 40, depth: 40, loadBearing: true } } }));
  ok(runCommand(R, { op: 'assignType', ids: ['ifxcol1'], typeId: 'KOL-BA-40' }));
  const c = R.items.find(i => i.id === 'ifxcol1'); assert.equal(c.w, 40); assert.equal(c.d, 40);
  // türden ayırma: mevcut alanlardan türetilmiş türe döner
  ok(runCommand(R, { op: 'assignType', ids: ['wfx003'], typeId: null }));
  assert.equal(wall(R, 'wfx003').bimType, undefined); assert.equal(createBim(R).getElement('wfx003').typeId, 'DIS-DUV-01');
});

test('5 / 6 / 7 — tip parametresi değişince uygun elemanlar güncellenir, geçersiz kılınanlar korunur', () => {
  const { R, H } = scenario();
  // iki duvarda kalınlık açıkça değiştirildi (komutla ve eski panel düzenlemesiyle)
  ok(H.run({ op: 'setInstanceParam', id: 'wfx004', key: 'thickness', value: 32 }));
  const w5 = wall(R, 'wfx005'); w5.t = 35; delete w5.comp; noteLegacyEdit(R, 'wall', w5, 't');
  assert.deepEqual(wall(R, 'wfx004').bimOv, ['compositeId', 'thickness']); assert.deepEqual(w5.bimOv, ['compositeId', 'thickness']);
  const p = planCommand(R, { op: 'updateType', id: 'DIS-DUV-02', params: { compositeId: 'dis-tugla-eps' } });
  assert.equal(p.summary.elements, 12); assert.equal(p.summary.affected, 10);
  assert.equal(summaryText(p.summary), 'Bu değişiklik 12 duvarı etkileyecek. 2 duvarda özel kalınlık ve kompozit yapı korunacak.');
  ok(H.run({ op: 'updateType', id: 'DIS-DUV-02', params: { compositeId: 'dis-tugla-eps' } }));
  for (const id of W12.filter(x => x !== 'wfx004' && x !== 'wfx005')) { const w = wall(R, id); assert.equal(w.comp, 'dis-tugla-eps', id); assert.equal(w.t, 26.5, id); }
  assert.equal(wall(R, 'wfx004').t, 32); assert.equal(wall(R, 'wfx005').t, 35);
  assert.equal(wall(R, 'wfx002').comp, 'perde-25', 'başka türdeki duvar etkilenmez');
  // yükseklik: kata bağlı duvarlar kat yüksekliğini izler; kattan ayrılmış duvar tür yüksekliğini alır
  ok(H.run({ op: 'setElementLevelBinding', id: 'wfx006', key: 'height', bound: false }));
  assert.equal(wall(R, 'wfx006').h, 280);
  const p2 = planCommand(R, { op: 'updateType', id: 'DIS-DUV-02', params: { height: 300 } });
  assert.equal(p2.summary.level.height, 11); assert.match(summaryText(p2.summary), /11 duvarda yükseklik kata bağlı kalacak/);
  ok(H.run({ op: 'updateType', id: 'DIS-DUV-02', params: { height: 300 } }));
  assert.equal(wall(R, 'wfx006').h, 300); assert.equal(wall(R, 'wfx007').h, 0);
  // kaynaklar
  const par = id => Object.fromEntries(createBim(R).resolveElementParameters(id).map(x => [x.k, x]));
  assert.equal(par('wfx004').thickness.source, 'override'); assert.equal(par('wfx004').thickness.resettable, true);
  assert.equal(par('wfx007').thickness.source, 'type'); assert.equal(par('wfx007').height.source, 'level');
  assert.equal(par('wfx006').height.source, 'type');
});

test('5b — eski proje verisi: açık kaydı olmayan farklı değerler silinmez, açık kayda dönüşür', () => {
  const { R } = scenario();
  // B1 / eski sürüm verisi: bimType var, bimOv yok; bir duvarın kalınlığı türden farklı
  const w = wall(R, 'wfx008'); w.t = 40; delete w.comp; delete w.bimOv;
  const r = ok(runCommand(R, { op: 'updateType', id: 'DIS-DUV-02', params: { compositeId: 'dis-tugla-eps' } }));
  assert.equal(w.t, 40, 'eski değer korunur'); assert.deepEqual(w.bimOv, ['compositeId', 'thickness']);
  assert.equal(r.summary.implicit.thickness, 1);
  assert.equal(wall(R, 'wfx009').t, 26.5);
});

test('8 — Türe döndür', () => {
  const { R } = scenario();
  ok(runCommand(R, { op: 'setInstanceParam', id: 'wfx004', key: 'thickness', value: 32 }));
  assert.equal(wall(R, 'wfx004').comp, undefined, 'kompozitten farklı kalınlık kompoziti kaldırır (eski panel davranışı)');
  ok(runCommand(R, { op: 'resetInstanceParam', id: 'wfx004', key: 'thickness' }));
  const w = wall(R, 'wfx004');
  assert.equal(w.t, T('dis-gazbeton')); assert.equal(w.comp, 'dis-gazbeton'); assert.equal(w.bimOv, undefined);
  // türde değeri olmayan / elemana ait parametre döndürülemez
  assert.equal(runCommand(R, { op: 'resetInstanceParam', id: 'wfx004', key: 'baseOffset' }).ok, false);
  // türe eşit değer geçersiz kılma sayılmaz
  ok(runCommand(R, { op: 'setInstanceParam', id: 'wfx004', key: 'loadBearing', value: true }));
  assert.deepEqual(w.bimOv, ['loadBearing']);
  ok(runCommand(R, { op: 'setInstanceParam', id: 'wfx004', key: 'loadBearing', value: false }));
  assert.equal(w.bimOv, undefined);
  // türe ait parametre elemanda değiştirilemez
  assert.equal(runCommand(R, { op: 'setInstanceParam', id: 'wfx004', key: 'function', value: 'ic' }).ok, false);
  // eski panelden işlev değişirse eleman türden ayrılır
  w.kind = 'ic'; assert.equal(noteLegacyEdit(R, 'wall', w, 'wkind'), 'detached'); assert.equal(w.bimType, undefined);
});

test('9 — tip silme ve kullanılan tipleri koruma', () => {
  const { R } = scenario();
  const r = runCommand(R, { op: 'deleteType', id: 'DIS-DUV-02' });
  assert.equal(r.ok, false); assert.match(r.errors[0], /12 elemanda kullanılıyor/);
  assert.ok(getType(R, 'DIS-DUV-02'));
  assert.equal(runCommand(R, { op: 'deleteType', id: 'DIS-DUV-02', reassignTo: 'KOL-BA-01' }).ok, false, 'başka sınıfa yeniden atama yok');
  ok(runCommand(R, { op: 'createType', type: { id: 'DIS-DUV-09', cls: 'wall', name: 'Kullanılmayan', params: {} } }));
  ok(runCommand(R, { op: 'deleteType', id: 'DIS-DUV-09' }));
  assert.equal(getType(R, 'DIS-DUV-09'), null);
  ok(runCommand(R, { op: 'deleteType', id: 'DIS-DUV-02', reassignTo: 'DIS-DUV-01' }));
  assert.equal(getType(R, 'DIS-DUV-02'), null); assert.equal(R.meta.bimTypes, undefined);
  for (const id of W12) { const w = wall(R, id); assert.equal(w.bimType, 'DIS-DUV-01'); assert.equal(w.comp, 'dis-tugla-eps'); }
});

test('10 — hatalı komut hiçbir veriyi değiştirmez', () => {
  const { R } = scenario(), j = JSON.stringify(R);
  const bad = [
    null, {}, { op: 'yok' }, { op: 'setInstanceParam', id: 'wfx001', key: 'thickness', value: -3 },
    { op: 'setInstanceParam', id: 'wfx001', key: 'thickness', value: 'abc' }, { op: 'setInstanceParam', id: 'yok', key: 'thickness', value: 20 },
    { op: 'setInstanceParam', id: 'wfx001', key: 'yokParam', value: 1 }, { op: 'setInstanceParam', id: 'wfx001', key: 'compositeId', value: 'dos-balkon' },
    { op: 'setInstanceParam', id: 'slfx1', key: 'thickness', value: 20 }, { op: 'setInstanceParam', id: 'ifxcol1', key: 'width', value: 0 },
    { op: 'setElementLevelBinding', id: 'ifxcol1', key: 'height', bound: true }, { op: 'assignType', ids: [], typeId: 'DIS-DUV-02' },
    { op: 'assignType', ids: ['wfx001'], typeId: 'YOK-01' }, { op: 'updateType', id: 'DIS-DUV-02', params: { thickness: 0, compositeId: null } },
    { op: 'updateType', id: 'YOK-01', params: {} }, { op: 'createType', type: null },
  ];
  for (const c of bad) { const r = runCommand(R, c); assert.equal(r.ok, false, JSON.stringify(c)); assert.ok(r.errors.length); }
  assert.equal(JSON.stringify(R), j);
  // geçersiz eleman üretecek değişiklik reddedilir (doğrulama kopyada): pencere genişliği duvara sığdırılır, uyarı verilir
  const r = runCommand(R, { op: 'setInstanceParam', id: 'ofx001', key: 'width', value: 5000 });
  if (r.ok) assert.ok(r.warnings.some(w => /sınırlandı/.test(w)));
  // uygulama sırasında bir kayıt kaybolursa yarım değişiklik kalmaz
  const R2 = root(), p = planCommand(R2, { op: 'assignType', ids: ['wfx001', 'wfx003'], typeId: 'IC-DUV-01' }), j2 = JSON.stringify(R2);
  R2.walls = R2.walls.filter(w => w.id !== 'wfx003');
  const j3 = JSON.stringify(R2);
  assert.throws(() => applyPatch(R2, p.patch, 'redo'));
  assert.equal(JSON.stringify(R2), j3, 'geri sarıldı'); assert.notEqual(j2, j3);
});

test('11 — işlem geri alınır ve yeniden uygulanır (tek adım)', () => {
  const R = root(), H = history(R), j0 = JSON.stringify(R);
  ok(H.run({ op: 'duplicateType', from: 'DIS-DUV-01', id: 'DIS-DUV-02', name: 'A', params: { compositeId: 'dis-gazbeton' } }));
  const j1 = JSON.stringify(R);
  ok(H.run({ op: 'assignType', ids: [...W12, 'wfxu1', 'wfxu2'], typeId: 'DIS-DUV-02' }));   // iki kat birden
  const j2 = JSON.stringify(R);
  assert.equal(wall(R, 'wfxu1').comp, 'dis-gazbeton', 'üst kattaki duvar da');
  ok(H.run({ op: 'updateType', id: 'DIS-DUV-02', params: { compositeId: 'dis-tugla-eps' } }));
  const j3 = JSON.stringify(R);
  H.undo(); assert.equal(JSON.stringify(R), j2, 'tür güncellemesi tek adımda geri alındı');
  H.undo(); assert.equal(JSON.stringify(R), j1);
  H.undo(); assert.equal(JSON.stringify(R), j0, 'başlangıç verisi birebir');
  H.redo(); H.redo(); H.redo(); assert.equal(JSON.stringify(R), j3, 'yineleme birebir');
  // yüzden çizilmiş duvarda kalınlık: çizilen yüz yerinde kalır, bağlı uçlar birlikte kayar; geri alınca eski geometri
  const R2 = root(), w = R2.walls[0]; w.face = 1; const n = R2.walls.filter(x => (x.a.x === w.a.x && x.a.y === w.a.y) || (x.b.x === w.a.x && x.b.y === w.a.y)).length;
  const j4 = JSON.stringify(R2), r = ok(runCommand(R2, { op: 'setInstanceParam', id: w.id, key: 'thickness', value: 40 }));
  assert.notDeepEqual(w.a, JSON.parse(j4).walls[0].a); assert.ok(r.patch.filter(e => e.key === 'a' || e.key === 'b').length >= n + 1);
  applyPatch(R2, r.patch, 'undo'); assert.equal(JSON.stringify(R2), j4);
});

test('12 — kaydetme ve yeniden açma (JSON gidiş-dönüş)', () => {
  const { R } = scenario();
  ok(runCommand(R, { op: 'setInstanceParam', id: 'wfx004', key: 'thickness', value: 32 }));
  const file = JSON.parse(JSON.stringify({ ...FILE, project: { ...FILE.project, drawings: [{ ...FILE.project.drawings[0], plan: R }, FILE.project.drawings[1]] } }));
  const R2 = file.project.drawings[0].plan, b = createBim(R2);
  assert.equal(b.getElementType('DIS-DUV-02').name, 'Dış duvar — gazbeton + taş yünü');
  assert.equal(b.getElement('wfx004').typeSource, 'explicit');
  assert.equal(Object.fromEntries(b.resolveElementParameters('wfx004').map(p => [p.k, p])).thickness.source, 'override');
  assert.equal(b.getElementsByTypeId('DIS-DUV-02').length, 12);
  assert.equal(JSON.stringify(R2), JSON.stringify(R));
  // kayıt biçimi değişmedi: plan.v aynı, yeni alanlar yalnız isteğe bağlı alanlar
  assert.equal(R2.v, FILE.project.drawings[0].plan.v);
  const keys = new Set(R2.walls.flatMap(w => Object.keys(w))), old = new Set(FILE.project.drawings[0].plan.walls.flatMap(w => Object.keys(w)));
  assert.deepEqual([...keys].filter(k => !old.has(k)).sort(), ['bimOv', 'bimType']);
});

test('13 — eski proje dosyasıyla uyumluluk: açmak veri değiştirmez, B2A alanları olmadan çalışır', () => {
  for (const d of FILE.project.drawings) {
    const R = JSON.parse(JSON.stringify(d.plan)), j = JSON.stringify(R), b = createBim(R);
    b.report(); b.getIssues(); b.typeUsage(); for (const e of b.getElementsByType('wall')) b.resolveElementParameters(e.id);
    assert.equal(JSON.stringify(R), j, d.name);
  }
  // getElement dondurulmuş, eski kayda başvuru vermez
  const R = root(), b = createBim(R), e = b.getElement('wfx001');
  assert.equal(e.legacy, undefined); assert.ok(Object.isFrozen(e) && Object.isFrozen(e.geom));
  assert.throws(() => { 'use strict'; e.geom.thickness = 1; });
  assert.equal(R.walls[0].t, 26.5);
  // B1'de yazılmış geçersiz bimType: veri korunur, türetilmiş türe düşülür ve raporlanır
  R.walls[2].bimType = 'SILINMIS-01';
  const b2 = createBim(R);
  assert.equal(b2.getElement('wfx003').typeSource, 'default');
  assert.ok(b2.getIssues().some(i => i.code === 'TYPE_REF_INVALID' && i.id === 'wfx003'));
  assert.equal(R.walls[2].bimType, 'SILINMIS-01');
});

test('14 — 2D / kesit / metraj / DXF: komutlar çizim motorlarına yansır, geri alınca birebir döner', async () => {
  const R = root(), sec = () => JSON.stringify(drawView(R, viewsOf(R).find(v => v.type === 'sec'), { N: 50 }).prims);
  const dxf = async () => new Response(planToDXF(R)).text(), met = () => JSON.stringify(planMetrics(R));
  const s0 = sec(), d0 = await dxf(), m0 = met(), H = history(R);
  ok(H.run({ op: 'duplicateType', from: 'DIS-DUV-01', id: 'DIS-DUV-02', name: 'A', params: { compositeId: 'dis-gazbeton' } }));
  ok(H.run({ op: 'assignType', ids: W12, typeId: 'DIS-DUV-02' }));
  ok(H.run({ op: 'updateType', id: 'DIS-DUV-02', params: { compositeId: 'ic-tugla' } }));   // iç bölme yapısı: belirgin kalınlık farkı
  assert.notEqual(await dxf(), d0, 'DXF duvar kalınlığını yansıtır');
  assert.notEqual(sec(), s0, 'kesit yeni katmanları yansıtır');
  ok(H.run({ op: 'setInstanceParam', id: 'slfx1', key: 'compositeId', value: 'dos-seramik' }));
  const sec2 = sec(); H.undo(); assert.notEqual(sec2, sec(), 'döşeme kompoziti kesite yansır');
  H.undo(); H.undo(); H.undo();
  assert.equal(sec(), s0); assert.equal(await dxf(), d0); assert.equal(met(), m0);
  // model ve yükseklik: kattan ayrılan duvar 3D / kesitte tür yüksekliğini kullanır (eski alan h)
  ok(runCommand(R, { op: 'setElementLevelBinding', id: 'wfx001', key: 'height', bound: false }));
  ok(runCommand(R, { op: 'setInstanceParam', id: 'wfx001', key: 'height', value: 250 }));
  assert.equal(R.walls[0].h, 250); assert.equal(buildModel(R).elements.get('wfx001').geom.height, 250);
});

test('API — önbellek, yürütücü ve salt okunur görünümler', () => {
  const R = root();
  let v = 0; const b = createBim(() => R, { getVersion: () => v });
  b.report(); b.getIssues(); b.typeUsage(); b.getElementsByType('wall');
  assert.equal(b.stats().builds, 1, 'sorgular aynı türetmeyi paylaşır');
  b.report(); assert.equal(b.stats().builds, 1);
  v++; b.report(); assert.equal(b.stats().builds, 2, 'sürüm artınca yeniden türetilir');
  // yürütücü olmadan yazma yok
  const r = b.commands.run({ op: 'assignType', ids: ['wfx001'], typeId: 'IC-DUV-01' });
  assert.equal(r.ok, false); assert.equal(R.walls[0].bimType, undefined);
  const pv = b.commands.plan({ op: 'assignType', ids: ['wfx001'], typeId: 'IC-DUV-01' });
  assert.equal(pv.ok, true); assert.equal(R.walls[0].bimType, undefined, 'önizleme yazmaz');
  b.commands.setExecutor(cmd => { const x = runCommand(R, cmd); v++; return x; });
  assert.equal(b.commands.run({ op: 'assignType', ids: ['wfx001'], typeId: 'IC-DUV-01' }).applied, true);
  assert.equal(b.getElement('wfx001').typeId, 'IC-DUV-01');
});
