// B3-A — merkezi işlem günlüğü: node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { History, diffState, applyOps } from '../js/bim/history.js';
import { runCommand } from '../js/bim/commands.js';

const FILE = JSON.parse(readFileSync(new URL('./fixtures/eski-proje-v1.saggcad.json', import.meta.url), 'utf8'));
const root = () => JSON.parse(JSON.stringify(FILE.project.drawings[0].plan));
const J = o => JSON.stringify(o);
/* editör benzeri yardımcı: eski yol eylemi (open + değiştir) ve BIM komutu */
function rig() {
  let R = root(); const H = new History(() => R);
  return {
    get R() { return R; }, H,
    act(label, fn) { H.open(label); fn(R); H.close(); },
    cmd(c) { H.close(); const r = runCommand(R, c); assert.equal(r.ok, true, J(r.errors)); H.record(r.patch, r.label); return r; },
  };
}

test('tek günlük: farklı katlardaki değişiklik tek kayıt, Ctrl+Z hepsini geri alır, yineleme birebir', () => {
  const x = rig(), j0 = J(x.R);
  x.act('Çoklu düzenleme', R => {   // iki katta 15 eleman
    R.walls.forEach((w, i) => { if (i < 10) w.t = 30; });
    R.levels[0].walls.forEach(w => { w.t = 22; });
    R.openings.slice(0, 3).forEach(o => { o.w = 70; });
  });
  assert.equal(x.H.undo.length, 1); const j1 = J(x.R);
  x.H.step('undo'); assert.equal(J(x.R), j0, 'tek adımda tüm katlar');
  x.H.step('redo'); assert.equal(J(x.R), j1);
});

test('kat değişince geçmiş korunur; kayıtlar kat bağımsız sırayla geri alınır', () => {
  const x = rig(), s = [J(x.R)];
  x.act('Zemin', R => { R.walls[0].t = 31; }); s.push(J(x.R));
  x.act('1. kat', R => { R.levels[0].walls[0].t = 18; }); s.push(J(x.R));
  x.cmd({ op: 'setInstanceParam', id: 'wfx003', key: 'thickness', value: 25 }); s.push(J(x.R));
  x.act('Zemin 2', R => { R.items[0].x += 10; }); s.push(J(x.R));
  for (let i = s.length - 2; i >= 0; i--) { x.H.step('undo'); assert.equal(J(x.R), s[i], `geri al ${i}`); }
  for (let i = 1; i < s.length; i++) { x.H.step('redo'); assert.equal(J(x.R), s[i], `yinele ${i}`); }
});

test('kat silme ve geri alma: kat kimliği, içeriği ve sırası korunur', () => {
  const x = rig(), j0 = J(x.R), lv = x.R.levels[0];
  x.act('Kat sil', R => { R.levels.splice(0, 1); });
  assert.equal(x.R.levels.length, 0);
  x.H.step('undo'); assert.equal(J(x.R), j0);
  assert.equal(x.R.levels[0].id, lv.id); assert.equal(x.R.levels[0].walls.length, 2); assert.equal(x.R.levels[0].openings[0].wallId, 'wfxu1');
  // kat ekleme de geri alınır; yeni katın kimliği korunarak yinelenir
  x.act('Kat ekle', R => { R.levels.push({ id: 'lvNEW', v: 1, kind: 'floor', name: '2. Kat', slab: 15, walls: [{ id: 'wN', a: { x: 0, y: 0 }, b: { x: 100, y: 0 }, t: 15 }], openings: [], rooms: [], items: [], meta: { wallH: 280 } }); });
  x.H.step('undo'); assert.equal(x.R.levels.length, 1); x.H.step('redo'); assert.equal(x.R.levels[1].id, 'lvNEW');
});

test('eleman silme, duvar çizme ve BIM türü değişikliği geri alınır', () => {
  const x = rig(), j0 = J(x.R);
  x.act('Sil', R => { R.walls = R.walls.filter(w => w.id !== 'wfx004'); R.openings = R.openings.filter(o => o.wallId !== 'wfx004'); });
  x.act('Duvar çizimi', R => { R.walls.push({ id: 'wA', a: { x: 0, y: 900 }, b: { x: 300, y: 900 }, t: 15 }, { id: 'wB', a: { x: 300, y: 900 }, b: { x: 300, y: 1100 }, t: 15 }); });
  x.cmd({ op: 'duplicateType', from: 'DIS-DUV-01', id: 'DIS-DUV-02', name: 'A', params: { compositeId: 'dis-gazbeton' } });
  x.cmd({ op: 'assignType', ids: ['wfx001', 'wfxu1', 'wA'], typeId: 'DIS-DUV-02' });   // iki katta
  assert.equal(x.R.levels[0].walls[0].bimType, 'DIS-DUV-02');
  x.H.step('undo'); assert.equal(x.R.levels[0].walls[0].bimType, undefined); assert.equal(x.R.walls[0].bimType, undefined);
  while (x.H.undo.length) x.H.step('undo');
  assert.equal(J(x.R), j0);
});

test('atomiklik: uygulanamayan kayıt kökü değiştirmez; iptal edilen eylem geri döner', () => {
  const x = rig();
  x.act('A', R => { R.walls[0].t = 40; R.levels[0].walls[0].t = 41; });
  const j = J(x.R);
  x.R.levels[0].walls = x.R.levels[0].walls.filter(w => w.id !== 'wfxu1');   // kaydın hedefi dışarıdan silindi
  const j2 = J(x.R);
  assert.throws(() => x.H.step('undo'));
  assert.equal(J(x.R), j2, 'kısmi geri alma yok'); assert.equal(x.H.undo.length, 1, 'kayıt yerinde');
  assert.notEqual(j, j2);
  // iptal (abort): açık eylem temele döner
  const y = rig(), k0 = J(y.R);
  y.H.open('Sürükle'); y.R.walls[0].a = { x: 999, y: 999 }; y.R.levels[0].walls.pop();
  assert.equal(y.H.abort(), true); assert.equal(J(y.R), k0); assert.equal(y.H.undo.length, 0);
});

test('fark motoru: anahtar sırası, eklenen / silinen alan ve kimliksiz diziler birebir', () => {
  const a = { k: 1, arr: [1, 2, 3], o: { x: 1, y: 2 }, items: [{ id: 'a', v: 1 }, { id: 'b', v: 2 }], z: 'q' };
  const b = JSON.parse(J(a)); delete b.o.x; b.o.w = 5; b.arr.push(4); b.items.reverse(); b.items[0].v = 9; b.n = null;
  const ops = diffState(a, b), A = JSON.parse(J(a));
  applyOps(A, ops, 'redo'); assert.equal(J(A), J(b));
  applyOps(A, ops, 'undo'); assert.equal(J(A), J(a));
  assert.deepEqual(diffState(a, JSON.parse(J(a))), [], 'eşit durumda fark yok');
});
