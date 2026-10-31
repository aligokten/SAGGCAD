// B3-B — bağımlılık grafiği ve değişiklik olayları: node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildModel } from '../js/bim/adapter.js';
import { buildDeps, getAffectedElements, findCycles, constraintOrder, changedIdsOf } from '../js/bim/deps.js';
import { runCommand } from '../js/bim/commands.js';
import { History } from '../js/bim/history.js';

const FILE = JSON.parse(readFileSync(new URL('./fixtures/eski-proje-v1.saggcad.json', import.meta.url), 'utf8'));
const root = () => JSON.parse(JSON.stringify(FILE.project.drawings[0].plan));
const graph = R => buildDeps(buildModel(R), R);

test('duvar → birleşen duvarlar, açıklıklar, mahaller, görünüş ve metraj', () => {
  const R = root(), G = graph(R), A = getAffectedElements(G, ['wfx001']);
  for (const id of ['wfx002', 'wfx004', 'wfx005', 'ofx00e', 'rfx00m', 'view:L0', 'qty:L0']) assert.ok(A.includes(id), id);
  assert.ok(!A.includes('wfxu1'), 'başka kattaki duvar etkilenmez');
  assert.ok(!A.includes('ofxu1'));
  // mahal ↔ ortak duvar (yuvası boş) geometrik eşleme: wfx002 mutfağı da etkiler
  assert.ok(getAffectedElements(G, ['wfx002']).includes('rfx00n'));
});

test('kat → kata bağlı elemanlar ve üst katlar; tür → atanmış elemanlar; kompozit / malzeme zinciri', () => {
  const R = root();
  assert.equal(runCommand(R, { op: 'setTopBinding', id: 'ifxcol1', mode: 'level' }).ok, true);
  assert.equal(runCommand(R, { op: 'duplicateType', from: 'DIS-DUV-01', id: 'DIS-DUV-02', name: 'A', params: { compositeId: 'dis-gazbeton' } }).ok, true);
  assert.equal(runCommand(R, { op: 'assignType', ids: ['wfx003', 'wfxu1'], typeId: 'DIS-DUV-02' }).ok, true);
  const G = graph(R);
  const L = getAffectedElements(G, ['L0'], { depth: 0 });
  assert.ok(L.includes('ifxcol1') && L.includes('wfx003'), 'kata bağlı (bimTop, h = 0) elemanlar');
  assert.ok(L.includes('lvfx1') && L.includes('wfxu1'), 'üst kat ve onun bağlı elemanları');
  const T = getAffectedElements(G, ['type:DIS-DUV-02'], { depth: 0 });
  assert.ok(T.includes('wfx003') && T.includes('wfxu1') && !T.includes('wfx004'));
  const C = getAffectedElements(G, ['comp:dis-gazbeton'], { depth: 0 });
  assert.ok(C.includes('type:DIS-DUV-02') && C.includes('wfx003'));
  const M = getAffectedElements(G, ['mat:gazbeton-400'], { depth: 0 });
  assert.ok(M.includes('comp:dis-gazbeton') && M.includes('wfx003'), 'malzeme → kompozit → duvar');
  // belirlenimci sıra: kat aşaması önce, sonra kimlik
  assert.equal(L[0], 'L0'); assert.deepEqual(getAffectedElements(graph(R), ['L0'], { depth: 0 }), L);
});

test('döngü tespiti ve kısıt sırası', () => {
  const G = { drives: new Map([['a', new Set(['b'])], ['b', new Set(['c'])], ['c', new Set(['a'])], ['x', new Set(['y'])]]), affects: new Map(), stageOf: () => 'derived' };
  assert.deepEqual(findCycles(G), [['a', 'b', 'c']]);
  const r = constraintOrder(G, ['a', 'b', 'c']); assert.equal(r.ok, false); assert.deepEqual(r.cycles, [['a', 'b', 'c']]);
  const r2 = constraintOrder(G, ['y', 'x']); assert.equal(r2.ok, true); assert.deepEqual(r2.order, ['x', 'y']);
  // gerçek modelde kısıt döngüsü yok
  assert.deepEqual(findCycles(graph(root())), []);
  const R = root(), G2 = graph(R), ord = constraintOrder(G2, getAffectedElements(G2, ['L0'], { depth: 0 }));
  assert.equal(ord.ok, true); assert.equal(ord.order[0], 'L0');
  assert.ok(ord.order.indexOf('lvfx1') > 0);
});

test('değişiklik olayları: komut yaması ve fark adımlarından değişen kimlikler', () => {
  const R = root(), r = runCommand(R, { op: 'moveWallEnd', id: 'wfx001', end: 'b', to: { x: 557.5, y: -7.5 } });
  const ids = changedIdsOf({ kind: 'cmd', patch: r.patch }, R);
  for (const id of ['wfx001', 'wfx002', 'wfx005', 'rfx00m']) assert.ok(ids.includes(id), id);
  const H = new History(() => R2), R2 = root(), events = [];
  H.onRecord = (e, dir) => events.push([dir, changedIdsOf(e, R2)]);
  H.open('x'); R2.levels[0].walls[0].t = 33; R2.meta.wallH = 300; H.close();
  assert.deepEqual(events[0][0], 'do'); assert.ok(events[0][1].includes('wfxu1') && events[0][1].includes('lvfx1') && events[0][1].includes('L0'));
  H.step('undo'); assert.equal(events[1][0], 'undo');
  const s = runCommand(R2, { op: 'setLevelHeight', level: 1, height: 300 });
  assert.ok(changedIdsOf({ kind: 'cmd', patch: s.patch }, R2).includes('lvfx1'));
});
