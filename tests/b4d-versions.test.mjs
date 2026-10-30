// B4D — kalıcı proje sürümleri: saf parçalar (belirlenimci JSON, karma, anlık görüntü, kimlik eşleme, karşılaştırma,
// dosya doğrulama). IndexedDB'li akışlar (kaydet / geri yükle / yükseltme / kota) tarayıcıda: tests/e2e/b4d.e2e.cjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { canonical, sha256, snapshotOf, compareVersions, versionSettings, DEFAULT_VERSION_SETTINGS, APP_VERSION, SNAPSHOT_SCHEMA } from '../js/versions.js';
import { remapIds, parseProjectFile, FILE_VERSION } from '../js/store.js';

const villa = () => JSON.parse(readFileSync(new URL('./fixtures/villa-ornek.saggcad.json', import.meta.url)));
const old = () => readFileSync(new URL('./fixtures/eski-proje-v1.saggcad.json', import.meta.url), 'utf8');
const clone = o => JSON.parse(JSON.stringify(o));

test('canonical: anahtar sırası ve önbellek alanlarından bağımsız, belirlenimci', () => {
  const a = { b: 1, a: { y: [1, { d: 2, c: 3 }], x: 'ş' }, _cache: { big: 1 }, u: undefined };
  const b = { a: { x: 'ş', y: [1, { c: 3, d: 2 }] }, b: 1 };
  assert.equal(canonical(a), canonical(b));
  assert.equal(canonical(a), '{"a":{"x":"ş","y":[1,{"c":3,"d":2}]},"b":1}');
  assert.equal(canonical([1, undefined, NaN, Infinity]), '[1,null,null,null]');
});

test('sha256: bilinen test vektörü ve sha256: öneki', async () => {
  assert.equal(await sha256('abc'), 'sha256:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.equal(await sha256(new TextEncoder().encode('abc')), await sha256('abc'));
});

test('anlık görüntü: tüm proje içeriği (çizimler, katlar, BIM, revizyon, fiyatlar) var; updatedAt yok', async () => {
  const p = villa().project;
  const s = snapshotOf(p, {});
  assert.equal(s.schema, SNAPSHOT_SCHEMA);
  assert.equal(s.project.updatedAt, undefined);
  assert.equal(s.project.drawings.length, 2);
  const P = s.project.drawings[1].plan;
  assert.deepEqual(Object.keys(P.meta.revision).sort(), ['code', 'methods', 'phases', 'qty']);
  assert.ok(P.levels.length === 1 && P.walls.length === 7);
  // içerik aynı, kaydetme zamanı farklı → aynı karma
  const q = clone(p); q.updatedAt = p.updatedAt + 99999;
  assert.equal(await sha256(canonical(snapshotOf(q))), await sha256(canonical(snapshotOf(p))));
  // içerik değişince karma değişir
  q.drawings[1].plan.walls[0].t += 1;
  assert.notEqual(await sha256(canonical(snapshotOf(q))), await sha256(canonical(snapshotOf(p))));
  // görsel içeriği karmaya dahil
  assert.notEqual(canonical(snapshotOf(p, { ph1: 'sha256:aa' })), canonical(snapshotOf(p, { ph1: 'sha256:bb' })));
});

test('remapIds: yalnız tam eşleşen görsel kimliklerini değiştirir; eleman kimlikleri korunur', () => {
  const p = { id: 'pr1', photos: [{ id: 'ph1' }], drawings: [{ id: 'dw1', plan: { meta: { bg: { photoId: 'ph1' } }, walls: [{ id: 'ph1x' }], levels: [{ plan: { meta: { bg: { photoId: 'ph1' } } } }] } }] };
  const r = remapIds(p, { ph1: 'phN' });
  assert.equal(r.photos[0].id, 'phN');
  assert.equal(r.drawings[0].plan.meta.bg.photoId, 'phN');
  assert.equal(r.drawings[0].plan.levels[0].plan.meta.bg.photoId, 'phN');
  assert.equal(r.drawings[0].plan.walls[0].id, 'ph1x');
  assert.equal(r.drawings[0].id, 'dw1');
  assert.equal(p.photos[0].id, 'ph1', 'girdi değişmez');
});

test('karşılaştırma: sürüm ↔ sürüm — geometri, kaldırılan eleman, malzeme, tür, fiyat; söküm/yeni onay bekleyen', async () => {
  const A = villa().project, B = clone(A);
  const P = B.drawings[1].plan;
  P.walls[0].b.x += 50;                       // geometri
  P.openings.splice(P.openings.findIndex(o => o.wallId === 'zd1'), 1);   // kaldırılan kapı
  P.rooms[0].floor = 'seramik';               // malzeme
  P.walls[1].comp = 'ic-tugla-10';            // BIM tür / kompozit
  P.meta.revision.qty.prices = { ...(P.meta.revision.qty.prices || {}), 'wall.vol|build': 1234 };
  const r = await compareVersions({ project: A, label: 'v1' }, { project: B, label: 'v2' });
  assert.equal(r.comparable, true);
  assert.equal(r.identical, false);
  const [R, D] = r.drawings;
  assert.equal(R.identical, true, 'rölöve ↔ rölöve: değişiklik yok');
  assert.equal(D.a.kind, 'proje');
  assert.equal(D.counts.removed, 1);
  assert.ok(D.counts.geometry >= 1);
  assert.ok(D.materialChanges.some(m => m.key === 'floor'));
  assert.ok(D.typeChanges.some(m => m.key === 'comp'));
  assert.deepEqual(D.prices.changes.map(c => c.key), ['wall.vol|build']);
  assert.ok(D.qty.rows.length > 0);
  // sürümler arası farkta tadilat kararı uygulanmaz: kesin söküm / yeni imalat yok, onay bekleyen var
  assert.ok(D.qty.rows.every(x => x.demolish === 0 && x.build === 0));
  assert.ok(D.qty.rows.some(x => x.buildPending > 0 || x.demolishPending > 0));
  assert.ok(D.qty.pending > 0);
  // girdi değişmedi
  assert.equal(A.drawings[1].plan.rooms[0].floor, villa().project.drawings[1].plan.rooms[0].floor);
});

test('karşılaştırma: özdeş kayıtlar, proje bilgisi, eklenen / kaldırılan çizim, karşılaştırılamayan', async () => {
  const A = villa().project;
  assert.equal((await compareVersions({ project: A }, { project: clone(A) })).identical, true);
  const B = clone(A); B.client = 'Yeni müşteri'; B.drawings.pop(); B.drawings.push({ id: 'dwX', name: 'Seçenek B', kind: 'proje', plan: clone(A.drawings[1].plan) });
  const r = await compareVersions({ project: A }, { project: B });
  assert.deepEqual(r.info.map(i => i.key), ['client']);
  assert.deepEqual(r.removedDrawings.map(d => d.id), ['dwvP']);
  assert.deepEqual(r.addedDrawings.map(d => d.id), ['dwX']);
  // kimliği farklı rölöveler yine rölöve ↔ rölöve eşlenir
  const C = clone(A); C.drawings = [{ ...clone(A.drawings[0]), id: 'dwOther' }];
  const rc = await compareVersions({ project: A }, { project: C });
  assert.equal(rc.drawings.length, 1);
  assert.equal(rc.drawings[0].b.id, 'dwOther');
  // hiç ortak çizim yok
  const E = clone(A); E.drawings = [{ id: 'dwZ', name: 'Z', kind: 'diger', plan: clone(A.drawings[1].plan) }];
  const F = clone(A); F.drawings = [{ id: 'dwY', name: 'Y', kind: 'diger', plan: clone(A.drawings[1].plan) }];
  assert.equal((await compareVersions({ project: E }, { project: F })).comparable, false);
});

test('dosya doğrulama: eski .saggcad.json açılır; bozuk JSON / yabancı / gelecek biçim anlaşılır hatayla reddedilir', () => {
  const d = parseProjectFile(old());
  assert.equal(d.project.drawings.length, 2);
  assert.equal(FILE_VERSION, 1);
  assert.throws(() => parseProjectFile('{"format":"saggcad","proj'), /geçerli JSON değil/);
  assert.throws(() => parseProjectFile('{"format":"başka"}'), /Geçerli bir SAGGCAD proje dosyası değil/);
  assert.throws(() => parseProjectFile(JSON.stringify({ format: 'saggcad', version: 2, project: { drawings: [] } })), /daha yeni bir SAGGCAD/);
});

test('ayarlar: otomatik sürümler varsayılan kapalı; eksik alanlar varsayılanla dolar', () => {
  assert.equal(APP_VERSION, '0.6.2-b4d');
  assert.equal(versionSettings({}).auto, false);
  assert.deepEqual(versionSettings({ versions: { auto: true, maxAuto: 5 } }), { ...DEFAULT_VERSION_SETTINGS, auto: true, maxAuto: 5 });
});
