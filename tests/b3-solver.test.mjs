// B3-D — sıralı kısıt çözücü: node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { solve } from '../js/bim/solver.js';
import { STAGES } from '../js/bim/deps.js';
import { runCommand } from '../js/bim/commands.js';

const FILE = JSON.parse(readFileSync(new URL('./fixtures/eski-proje-v1.saggcad.json', import.meta.url), 'utf8'));
const root = () => JSON.parse(JSON.stringify(FILE.project.drawings[0].plan));
const codes = r => r.conflicts.map(c => c.code);

test('eski proje: aşamalar sırayla çalışır, yalnız bilinen sorun raporlanır, kök değişmez', () => {
  const R = root(), j = JSON.stringify(R), r = solve(R);
  assert.deepEqual(r.stages, STAGES);
  // fikstür bilerek sahipsiz bir açıklık içerir (silinmiş duvara bağlı) — tek hata o olmalı
  assert.deepEqual(r.conflicts.filter(c => c.severity === 'error').map(c => [c.code, c.ids]), [['OPENING_HOST', ['ofxorphan']]]);
  assert.equal(JSON.stringify(R), j, 'çözücü saf');
  assert.ok(r.conflicts.some(c => c.code === 'JOIN_OVERLAP'), 'üst üste duvar (wfx003 / wfx00b) uyarı olarak raporlanır');
});

test('kat yüksekliği eski yoldan değişince bağlı kolon: çakışma raporu + önerilen komut; sessiz düzeltme yok', () => {
  const R = root();
  assert.equal(runCommand(R, { op: 'setTopBinding', id: 'ifxcol1', mode: 'level' }).ok, true);
  assert.equal(solve(R).conflicts.filter(c => c.stage === 'binding').length, 0);
  R.meta.wallH = 320;   // komut dışı (eski panel) değişiklik
  const j = JSON.stringify(R), r = solve(R, { changed: ['L0'] });
  const c = r.conflicts.find(x => x.code === 'BINDING_STALE');
  assert.ok(c && c.ids.includes('ifxcol1'), JSON.stringify(r.conflicts));
  assert.deepEqual(r.fixes.map(f => f.cmd), [{ op: 'syncLevelBindings' }]);
  assert.equal(JSON.stringify(R), j, 'kök değişmedi');
  assert.equal(runCommand(R, r.fixes[0].cmd).ok, true);
  assert.equal(solve(R).conflicts.filter(x => x.stage === 'binding').length, 0, 'öneri uygulanınca çözülür');
});

test('çözülemeyen kısıtlar: sığmayan açıklık, geçersiz bağ, bozuk mahal — aşama sırasıyla', () => {
  const R = root();
  R.walls.find(w => w.id === 'wfx001').b.x = R.walls.find(w => w.id === 'wfx001').a.x + 150;   // pencere (180 cm) sığmaz
  R.items.find(i => i.id === 'ifxcol1').bimTop = { mode: 'nextSlabTop', off: 0 };
  R.levels = R.levels.slice(0, 0); R.walls.push({ id: 'wbad', a: { x: 0, y: 0 }, b: { x: 0.2, y: 0 }, t: 15 });
  R.rooms.push({ id: 'rbad', name: 'Bozuk', pts: [{ x: 0, y: 0 }, { x: 10, y: 0 }] });
  const r = solve(R);
  assert.equal(r.ok, false);
  for (const k of ['OPENING_FIT', 'BINDING_INVALID', 'WALL_INVALID', 'ROOM_INVALID']) assert.ok(codes(r).includes(k), k);
  const st = r.conflicts.map(c => STAGES.indexOf(c.stage));
  assert.deepEqual(st, [...st].sort((a, b) => a - b), 'aşama sırası');
});

test('kapsam: değişen eleman verilirse yalnız etkilenenler denetlenir', () => {
  const R = root();
  R.levels[0].rooms.push({ id: 'rbad2', name: 'Bozuk', pts: [] });   // başka katta
  const all = solve(R), sc = solve(R, { changed: ['wfx001'] });
  assert.ok(codes(all).includes('ROOM_INVALID'));
  assert.ok(!codes(sc).includes('ROOM_INVALID'), 'kapsam dışı');
  assert.ok(sc.scope > 0 && sc.scope < all.order.length);
  assert.ok(sc.order.indexOf('wfx001') < sc.order.indexOf('ofx00e') || sc.order.indexOf('ofx00e') === -1);
});
