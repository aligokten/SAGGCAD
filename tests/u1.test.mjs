// U1 — UniCAD esinli özellikler: zaman çizelgesi ve Akıllı Bas-Çek mantığı: node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { History } from '../js/bim/history.js';
import { runCommand } from '../js/bim/commands.js';
import { timelineItems, rollTo } from '../js/timeline.js';
import { pressPullModes, parseLen } from '../js/presspull.js';

const FILE = JSON.parse(readFileSync(new URL('./fixtures/eski-proje-v1.saggcad.json', import.meta.url), 'utf8'));
const root = () => JSON.parse(JSON.stringify(FILE.project.drawings[0].plan));
const J = o => JSON.stringify(o);

function rig() {
  const R = root(), H = new History(() => R), s = [J(R)];
  const act = (l, fn) => { H.open(l); fn(R); H.close(); s.push(J(R)); };
  const cmd = c => { const r = runCommand(R, c); assert.equal(r.ok, true); H.record(r.patch, r.label); s.push(J(R)); };
  act('Zemin', P => { P.walls[0].t = 31; });
  cmd({ op: 'setInstanceParam', id: 'wfx003', key: 'thickness', value: 25 });
  act('1. kat', P => { P.levels[0].walls[0].t = 18; });
  cmd({ op: 'offsetWall', id: 'wfx006', d: -20 });
  return { R, H, s };
}

test('zaman çizelgesi: çipler, konum, geri alınmışlar', () => {
  const { H } = rig();
  let T = timelineItems(H);
  assert.equal(T.items.length, 4); assert.equal(T.pos, 4);
  assert.deepEqual(T.items.map(i => i.kind), ['diff', 'cmd', 'diff', 'cmd']);
  H.step('undo');
  T = timelineItems(H);
  assert.equal(T.pos, 3); assert.equal(T.items[3].done, false); assert.equal(T.items.length, 4, 'geri alınan kayıt şeritte kalır');
});

test('zaman çizelgesi: herhangi bir noktaya sarma birebir; ileri / geri', () => {
  const { R, H, s } = rig();
  for (const n of [2, 0, 3, 1, 4, 4, 0]) {
    const r = rollTo(H, n);
    assert.equal(r.ok, true); assert.equal(J(R), s[n], `konum ${n}`); assert.equal(timelineItems(H).pos, n);
  }
  assert.equal(rollTo(H, 99).ok, true); assert.equal(J(R), s[4], 'sınır: en sona');
});

test('zaman çizelgesi: sarma başarısız olursa başlangıç konumuna dönülür', () => {
  const { R, H, s } = rig();
  rollTo(H, 4);
  R.levels[0].walls = R.levels[0].walls.filter(w => w.id !== 'wfxu1');   // 3. kaydın hedefi dışarıdan silindi
  const j = J(R), r = rollTo(H, 0);
  assert.equal(r.ok, false); assert.ok(r.error);
  assert.equal(J(R), j, 'model sarma öncesi durumda'); assert.equal(timelineItems(H).pos, 4);
  assert.notEqual(j, s[4]);
});

test('Bas-Çek kipleri: duvar, yay, açıklık, mahal, döşeme, kolon, kiriş; komutlar geçerli', () => {
  const R = root(), meta = R.meta, w = R.walls.find(x => x.id === 'wfx006');
  const M = pressPullModes({ kind: 'wall', id: w.id }, w, R, meta);
  assert.deepEqual(M.map(m => m.k), ['offset', 'thickness', 'height']);
  assert.equal(runCommand(R, M[0].cmd(25)).ok, true, 'ötele');
  assert.equal(runCommand(R, M[1].cmd(22)).ok, true, 'kalınlık');
  assert.equal(R.walls.find(x => x.id === 'wfx006').t, 22);
  const o = R.openings.find(x => x.id === 'ofx00e'), MO = pressPullModes({ kind: 'opening', id: o.id }, o, R, meta);
  assert.deepEqual(MO.map(m => m.k), ['width', 'height', 'sill']);
  const big = runCommand(R, MO[0].cmd(5000));   // duvardan geniş: komut duvar boyuna sınırlar ve uyarır (B2A davranışı)
  assert.equal(big.ok, true); assert.match(big.warnings[0], /sınırlandı/);
  const ow = R.openings.find(x => x.id === 'ofx00e'), L = 535;
  assert.ok(ow.pos - ow.w / 2 >= -0.01 && ow.pos + ow.w / 2 <= L + 0.01, 'açıklık duvar içinde kalır');
  const r = R.rooms[0]; assert.equal(pressPullModes({ kind: 'room', id: r.id }, r, R, meta)[0].k, 'height');
  assert.equal(runCommand(R, pressPullModes({ kind: 'room', id: r.id }, r, R, meta)[0].cmd(260)).ok, true);
  const col = R.items.find(i => i.type === 'kolon'); assert.deepEqual(pressPullModes({ kind: 'item', id: col.id }, col, R, meta).map(m => m.k), ['height', 'width', 'depth']);
  assert.equal(pressPullModes({ kind: 'dim', id: 'x' }, {}, R, meta), null);
  assert.equal(pressPullModes(null, null, R, meta), null);
  // yay
  const P = { walls: [], openings: [], meta: { wallT: 20 } };
  [[0, 0, 100, 40], [100, 40, 200, 50], [200, 50, 300, 40], [300, 40, 400, 0]].forEach(([a, b, c, d], i) => P.walls.push({ id: 'a' + i, a: { x: a, y: b }, b: { x: c, y: d }, t: 20, arc: { id: 'Q', i, off: 0 } }));
  const MA = pressPullModes({ kind: 'wall', id: 'a1' }, P.walls[1], P, P.meta);
  assert.deepEqual(MA.map(m => m.k), ['radius', 'sagitta']); assert.deepEqual(MA[0].cmd(300), { op: 'setArcGeometry', arcId: 'Q', radius: 300 });
});

test('uzunluk girdisi: virgül, işaret, geçersiz', () => {
  assert.equal(parseLen('12,5'), 12.5); assert.equal(parseLen('-15'), -15); assert.equal(parseLen('+20'), 20);
  assert.equal(parseLen('abc'), null); assert.equal(parseLen(''), null);
});
