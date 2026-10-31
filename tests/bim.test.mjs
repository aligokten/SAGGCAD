// B1 — BIM eleman şeması ve tür sistemi: node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildModel, schemaInfo } from '../js/bim/adapter.js';
import { createBim } from '../js/bim/api.js';
import { validateElement, BIM_SCHEMA_VERSION } from '../js/bim/schema.js';
import { getType, listTypes, saveCustomType, deriveType, resolveParameters, BUILTIN_TYPES } from '../js/bim/types.js';
import { validateRelations } from '../js/bim/relations.js';
import { planToDXF } from '../js/exporters.js';
import { drawView, viewsOf } from '../js/sections.js';
import { planMetrics } from '../js/plan-geom.js';

const FILE = JSON.parse(readFileSync(new URL('./fixtures/eski-proje-v1.saggcad.json', import.meta.url), 'utf8'));
const root = () => JSON.parse(JSON.stringify(FILE.project.drawings[0].plan));   // her test kendi kopyasıyla

test('1 — eski proje dosyası açılıyor (biçim, çizimler, katlar)', () => {
  assert.equal(FILE.format, 'saggcad');
  assert.equal(FILE.project.drawings.length, 2);
  for (const d of FILE.project.drawings) {
    const m = buildModel(d.plan);
    assert.ok(m.elements.size > 0, d.name);
    assert.ok(!m.issues.some(i => i.code === 'ROOT_INVALID'));
  }
  const R = root(), info = schemaInfo(R);
  assert.equal(info.readable, true); assert.equal(info.primary, 'legacy'); assert.equal(info.bimSchema, BIM_SCHEMA_VERSION);
  const m = buildModel(R);
  assert.deepEqual(m.levels.map(l => [l.id, l.name]), [['L0', 'Zemin kat'], ['lvfx1', '1. Kat']]);
});

test('2 — duvar, kolon, kiriş ve döşeme doğru eşleniyor', () => {
  const bim = createBim(root());
  const w = bim.getElement('wfx001');
  assert.equal(w.cls, 'wall'); assert.equal(w.levelId, 'L0');
  assert.equal(w.geom.thickness, 26.5); assert.equal(w.geom.height, 280); assert.equal(w.inherited.height, 'level');
  assert.equal(w.props.function, 'dis'); assert.equal(w.props.compositeId, 'dis-tugla-eps'); assert.equal(w.props.loadBearing, false);
  assert.deepEqual(w.rels[0], { kind: 'containedIn', target: 'L0' });
  const c1 = bim.getElement('ifxcol1'), c2 = bim.getElement('ifxcol2');
  assert.equal(c1.cls, 'column'); assert.equal(c1.typeId, 'KOL-BA-01'); assert.equal(c1.geom.shape, 'rect');
  assert.equal(c2.typeId, 'KOL-CE-01'); assert.equal(c2.geom.shape, 'round'); assert.equal(c2.props.loadBearing, true);
  const b = bim.getElement('ifxbeam1');
  assert.equal(b.cls, 'beam'); assert.equal(b.geom.length, 300); assert.equal(b.geom.width, 25); assert.equal(b.geom.depth, 50); assert.equal(b.geom.topOffset, 280);
  const s = bim.getElement('slfx1');
  assert.equal(s.cls, 'slab'); assert.equal(s.typeId, 'DOS-BAL-01'); assert.equal(s.geom.thickness, 22); assert.equal(s.geom.area, 7);
  const ks = bim.getElement('lvfx1:kat-dosemesi');   // kat döşemesi: türetilmiş eleman
  assert.equal(ks.cls, 'slab'); assert.equal(ks.typeId, 'DOS-KAT-00'); assert.equal(ks.geom.thickness, 15); assert.equal(ks.meta.origin, 'derived');
  assert.equal(bim.getElementsByType('wall').length, 15);
  assert.equal(bim.getElementsByLevel('lvfx1').filter(e => e.cls === 'wall').length, 2);
  for (const e of bim.model().elements.values()) assert.ok(validateElement(e).ok, e.id + ' ' + validateElement(e).errors);
});

test('3 — eleman kimlikleri korunuyor ve benzersiz', () => {
  const R = root(), m = buildModel(R);
  const legacyIds = [R, ...R.levels].flatMap(P => ['walls', 'openings', 'rooms', 'items', 'slabs'].flatMap(k => (P[k] || []).map(o => o.id)));
  for (const id of legacyIds) assert.ok(m.elements.has(id), id);
  assert.equal(new Set(m.order).size, m.order.length);
  // kimliksiz ve çift kimlikli kayıt: düşürülmez, raporlanır
  R.items.push({ type: 'kolon', x: 0, y: 0, w: 30, d: 30, h: 280 });
  R.walls.push({ ...R.walls[0] });
  const m2 = buildModel(R);
  assert.equal(m2.elements.size, m.elements.size + 2);
  assert.ok(m2.issues.some(i => i.code === 'ID_MISSING'));
  assert.ok(m2.issues.some(i => i.code === 'ID_DUPLICATE' && i.id === 'wfx001'));
});

test('4 — kompozit ve tür bağlantıları', () => {
  const bim = createBim(root());
  assert.equal(bim.getElement('wfx001').typeId, 'DIS-DUV-01');
  assert.equal(bim.getElement('wfx001').typeSource, 'derived');
  assert.equal(bim.getElement('wfx003').typeId, 'GEN-DUV-00');   // türsüz eski duvar
  const tp = bim.getTypeParameters('DIS-DUV-01');
  assert.equal(tp.compositeId, 'dis-tugla-eps'); assert.equal(tp.thickness, 26.5); assert.equal(tp.height, 280); assert.equal(tp.loadBearing, false);
  const ml = bim.getMaterialLink('wfx001');
  assert.equal(ml.composite.id, 'dis-tugla-eps'); assert.equal(ml.composite.layers, 4); assert.equal(ml.compositeMissing, false);
  const par = Object.fromEntries(bim.resolveElementParameters('wfx001').map(p => [p.k, p]));
  assert.equal(par.thickness.source, 'type'); assert.equal(par.height.source, 'level'); assert.equal(par.compositeId.value, 'dis-tugla-eps');
  // B2A: düzenlenebilirlik alan eşlemesinden gelir — türe ait (işlev) ve hesaplanan (uzunluk) parametreler elemanda düzenlenmez
  assert.equal(par.function.editable, false); assert.equal(par.length.editable, false);
  assert.equal(par.thickness.editable, true); assert.equal(par.height.levelBindable, true);
  // eleman tür değerinden farklıysa geçersiz kılma olarak görünür
  const R = root(); R.walls[0].t = 30;
  const p2 = Object.fromEntries(createBim(R).resolveElementParameters('wfx001').map(p => [p.k, p]));
  assert.equal(p2.thickness.source, 'instance'); assert.equal(p2.thickness.overridden, true); assert.equal(p2.thickness.typeValue, 26.5);
  // aynı türden birden çok eleman
  R.walls[2].kind = 'dis';
  assert.equal(createBim(R).getElementsByTypeId('DIS-DUV-01').length, 2);
  // açık atanmış tür
  R.walls[3].bimType = 'PERDE-01';
  const e3 = createBim(R).getElement(R.walls[3].id);
  assert.equal(e3.typeId, 'PERDE-01'); assert.equal(e3.typeSource, 'explicit');
  // sınıfa uymayan atama yok sayılır
  R.walls[4].bimType = 'KOL-BA-01';
  assert.equal(createBim(R).getElement(R.walls[4].id).typeSource, 'default');
});

test('5 — bir türün değiştirilmesi ilgisiz türleri etkilemiyor', () => {
  const R = root(), before = JSON.stringify(BUILTIN_TYPES);
  const t = deriveType(R, 'DIS-DUV-01', 'DIS-DUV-02', 'Dış duvar — gazbeton', { compositeId: 'dis-gazbeton' });
  const dry = saveCustomType(R, t);
  assert.equal(dry.ok, true); assert.equal(dry.dryRun, true); assert.equal(R.meta.bimTypes, undefined);   // dryRun: kök değişmez
  saveCustomType(R, t, { dryRun: false });
  assert.equal(getType(R, 'DIS-DUV-02').params.compositeId, 'dis-gazbeton');
  saveCustomType(R, { ...t, params: { ...t.params, height: 300 } }, { dryRun: false });
  assert.equal(getType(R, 'DIS-DUV-02').params.height, 300); assert.equal(getType(R, 'DIS-DUV-02').rev, 2);
  assert.equal(getType(R, 'DIS-DUV-01').params.compositeId, 'dis-tugla-eps');
  assert.equal(getType(R, 'DIS-DUV-01').params.height, 280);
  assert.equal(JSON.stringify(BUILTIN_TYPES), before);
  assert.equal(listTypes(R, 'wall').length, BUILTIN_TYPES.filter(x => x.cls === 'wall').length + 1);
  assert.equal(saveCustomType(R, { ...t, id: 'DIS-DUV-01' }).ok, false);   // yerleşik tür üzerine yazılamaz
  assert.ok(Object.isFrozen(getType(R, 'DIS-DUV-01').params));
  // tür proje verisiyle saklanır: JSON gidiş-dönüşte korunur
  const R2 = JSON.parse(JSON.stringify(R));
  assert.equal(getType(R2, 'DIS-DUV-02').name, 'Dış duvar — gazbeton');
});

test('6 — eksik / bozuk ilişkiler veri kaybı olmadan raporlanıyor', () => {
  const R = root(), json0 = JSON.stringify(R), bim = createBim(R);
  const orphan = bim.getElement('ofxorphan');
  assert.ok(orphan, 'yetim pencere modelde duruyor');
  const iss = bim.getIssues();
  assert.ok(iss.some(i => i.code === 'REL_TARGET_MISSING' && i.id === 'ofxorphan' && i.target === 'wSILINMIS'));
  assert.ok(iss.some(i => i.code === 'ROOM_WALL_SLOT_EMPTY'));
  assert.equal(JSON.stringify(R), json0, 'rapor veriyi değiştirmedi');
  // yanlış sınıflı hedef ve bozuk kayıt
  R.openings.push({ id: 'oX', wallId: 'ifxcol1', type: 'door', pos: 10, w: 90, h: 210 });
  R.rooms.push('bozuk');
  R.items.push({ id: 'iBad', type: 'kolon', x: 'abc', y: 0, w: -5, d: 30, h: 280 });
  const b2 = createBim(R), i2 = b2.getIssues();
  assert.ok(i2.some(i => i.code === 'REL_TARGET_CLASS' && i.id === 'oX'));
  assert.ok(i2.some(i => i.code === 'RECORD_INVALID'));
  assert.ok(i2.some(i => i.code === 'ELEMENT_INVALID' && i.id === 'iBad'));
  assert.ok(b2.getElement('iBad'), 'geçersiz eleman da modelde, düşürülmedi');
  assert.ok(Array.isArray(validateRelations(b2.model())));
  assert.ok(b2.getElementRelations('wfx001').incoming.length >= 1);
});

test('7 — dönüştürme tekrarlandığında sonuç değişmiyor, girdi değişmiyor', () => {
  const R = root(), json0 = JSON.stringify(R);
  const a = buildModel(R), b = buildModel(R);
  const ser = m => JSON.stringify({ levels: m.levels, issues: m.issues, els: m.order.map(id => { const { legacy, ...e } = m.elements.get(id); return e; }) });
  assert.equal(ser(a), ser(b));
  assert.equal(JSON.stringify(R), json0);
  // dondurulmuş girdiyle de çalışır (yazma girişimi olursa hata verirdi)
  const deep = o => { if (o && typeof o === 'object') { Object.values(o).forEach(deep); Object.freeze(o); } return o; };
  assert.doesNotThrow(() => buildModel(deep(root())));
  // API güvenli: geçersiz girdide hata yok
  const bim = createBim(R);
  assert.equal(bim.getElement(null), null); assert.equal(bim.getElement(42), null); assert.deepEqual(bim.getElementsByType(undefined), []);
  assert.equal(bim.getElementType({}), null); assert.deepEqual(bim.resolveElementParameters('yok'), []);
  assert.equal(createBim(null).report().elements, 0);
  assert.equal(createBim({}).getIssues()[0].code, 'ROOT_INVALID');
  // deneysel tür atama: yalnız önizleme; B2A'da gerçek yazma reddedilir (geri al / kayıt atlanmasın)
  const dr = bim.experimental.assignType('wfx003', 'IC-DUV-01');
  assert.equal(dr.ok, true); assert.equal(R.walls[2].bimType, undefined);
  assert.equal(bim.experimental.assignType('wfx003', 'IC-DUV-01', { dryRun: false }).ok, false);
  assert.equal(bim.experimental.saveType({ id: 'X-01', cls: 'wall', name: 'x', params: {} }, { dryRun: false }).ok, false);
  assert.equal(JSON.stringify(R), json0, 'deneysel API veriyi değiştirmedi');
  // yerinde değişiklik (aynı uzunlukta JSON) önbelleği geçersiz kılar
  R.walls[0].a = { x: R.walls[0].a.x + 1, y: R.walls[0].a.y };
  assert.notEqual(bim.getElement('wfx001').geom.a.x, buildModel(JSON.parse(json0)).elements.get('wfx001').geom.a.x);
});

test('8 — mevcut 2D / kesit / dışa aktarma çıktıları BIM türetmesinden etkilenmiyor', async () => {
  const R = root();
  const dxf0 = await new Response(planToDXF(R)).text(), met0 = JSON.stringify(planMetrics(R));
  const sec0 = JSON.stringify(drawView(R, viewsOf(R).find(v => v.type === 'sec'), { N: 50 }).prims);
  const bim = createBim(R); bim.report(); bim.getIssues(); bim.resolveElementParameters('wfx001');
  assert.equal(await new Response(planToDXF(R)).text(), dxf0);
  assert.equal(JSON.stringify(planMetrics(R)), met0);
  assert.equal(JSON.stringify(drawView(R, viewsOf(R).find(v => v.type === 'sec'), { N: 50 }).prims), sec0);
});
