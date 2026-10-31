// B3-D — 1000 adımlık rastgele stres testi: node --test
// Karışık BIM komutları + eski yol düzenlemeleri (merkezi günlük) + rastgele geri al / yinele. Her adımda:
//   artımlı geometri ≡ tam hesap (koordinat, katman, birleşim, sorun), metraj alan / hacim ≡, eleman kimlikleri ve
//   ilişkileri (önbellekli ↔ önbelleksiz model) ≡, kısıt çözücü hatasız çalışır.
// Sonda: tüm geri almalar başlangıç JSON'unu, tüm yinelemeler son JSON'u birebir verir.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runCommand } from '../js/bim/commands.js';
import { History } from '../js/bim/history.js';
import { buildModel } from '../js/bim/adapter.js';
import { levelWallGeometry, wallQuantities } from '../js/bim/wallgeom.js';
import { solve } from '../js/bim/solver.js';
import { planLevels } from '../js/plan-geom.js';
import { geoSig } from './b3-helpers.mjs';

const FILE = JSON.parse(readFileSync(new URL('./fixtures/eski-proje-v1.saggcad.json', import.meta.url), 'utf8'));
const J = o => JSON.stringify(o);
let seed = 20261030; const rnd = () => (seed = (seed * 48271) % 2147483647) / 2147483647, pick = a => a[Math.floor(rnd() * a.length)];
const STEPS = +process.env.B3_STRESS_STEPS || 1000;

test(`rastgele ${STEPS} adım: artımlı ≡ tam, geçmiş birebir`, () => {
  const R = JSON.parse(J(FILE.project.drawings[0].plan)), H = new History(() => R, { limit: 10000 }), j0 = J(R), stat = { cmd: 0, rejected: 0, legacy: 0, undo: 0, redo: 0 };
  const plans = () => planLevels(R).filter(l => l.kind !== 'roof').map(l => l.plan);
  const walls = () => plans().flatMap(P => P.walls);
  let nid = 0;
  for (let k = 0; k < STEPS; k++) {
    const op = rnd();
    if (op < 0.12 && H.canUndo()) { H.step('undo'); stat.undo++; }
    else if (op < 0.18 && H.canRedo()) { H.step('redo'); stat.redo++; }
    else if (op < 0.75) {   // BIM komutu
      const w = pick(walls()), e = rnd() < 0.5 ? 'a' : 'b', c = pick([
        { op: 'moveWallEnd', id: w.id, end: e, to: { x: w[e].x + Math.round((rnd() - 0.5) * 80), y: w[e].y + Math.round((rnd() - 0.5) * 80) } },
        { op: 'offsetWall', id: w.id, d: Math.round((rnd() - 0.5) * 60) },
        { op: 'setInstanceParam', id: w.id, key: 'thickness', value: pick([10, 15, 20, 25]) },
        { op: 'setInstanceParam', id: w.id, key: 'height', value: pick([0, 240, 300]) },
        { op: 'setInstanceParam', id: w.id, key: 'compositeId', value: pick(['ic-tugla', 'dis-tugla-eps', 'perde-25']) },
        { op: 'setWallLength', id: w.id, length: 100 + Math.round(rnd() * 500) },
        { op: 'setJoinEnabled', id: w.id, end: e, enabled: rnd() < 0.5 },
        { op: 'setLevelHeight', level: pick([0, 1]), height: pick([260, 280, 300]) },
      ]);
      const r = runCommand(R, c);
      if (r.ok) { H.record(r.patch, r.label); stat.cmd++; } else stat.rejected++;
    } else {   // eski yol: duvar ekle / sil, açıklık kaydır (fark kaydı)
      H.open('Düzenleme'); const P = pick(plans()), q = rnd();
      if (q < 0.4 && P.walls.length < 30) { const a = { x: Math.round(rnd() * 900), y: Math.round(rnd() * 700) }; P.walls.push({ id: `ws${nid++}`, a, b: { x: a.x + Math.round((rnd() - 0.5) * 600), y: a.y + Math.round((rnd() - 0.5) * 600) }, t: 15 }); }
      else if (q < 0.65 && P.walls.length > 6) { const w = pick(P.walls); P.walls.splice(P.walls.indexOf(w), 1); P.openings = P.openings.filter(o => o.wallId !== w.id); }
      else if (P.openings.length) { const o = pick(P.openings); o.pos = Math.max(o.w / 2, o.pos + Math.round((rnd() - 0.5) * 40)); }
      H.close(); stat.legacy++;
    }
    // değişmezler
    const meta = R.meta;
    for (const P of plans()) {
      const m = { ...meta, ...(P.meta || {}) }, inc = levelWallGeometry(R, P, { T: m.wallT }), C = JSON.parse(J(P)), ref = levelWallGeometry(R, C, { T: m.wallT, full: true });
      assert.equal(geoSig(inc), geoSig(ref), `adım ${k}: geometri`);
      const qa = wallQuantities(R, P, m), qb = wallQuantities(R, C, m);
      assert.ok(Math.abs(qa.total - qb.total) < 1e-9, `adım ${k}: hacim`);
      assert.equal(J([...qa.walls.values()].map(x => [x.id, +x.footprint.toFixed(9)])), J([...qb.walls.values()].map(x => [x.id, +x.footprint.toFixed(9)])), `adım ${k}: alan`);
    }
    const rel = Mo => J([...Mo.elements.values()].map(e => [e.id, e.cls, e.levelId, (e.rels || []).map(r => `${r.kind}:${r.target}:${r.join || ''}:${r.end || ''}`).sort()]));
    assert.equal(rel(buildModel(R)), rel(buildModel(JSON.parse(J(R)))), `adım ${k}: kimlik / ilişki`);
    if (k % 25 === 0) assert.ok(Array.isArray(solve(R).conflicts), `adım ${k}: çözücü`);
  }
  const jEnd = J(R), n = H.undo.length;
  while (H.canUndo()) H.step('undo');
  assert.ok(n < H.limit, `günlük sınırı aşılmadı: ${n}`);   // tam geri dönüş için tüm kayıtlar günlükte
  assert.equal(J(R), j0, 'tüm geri almalar başlangıç durumu');
  while (H.canRedo()) H.step('redo');
  assert.equal(J(R), jEnd, 'tüm yinelemeler son durum');
  assert.ok(stat.cmd > 300 && stat.legacy > 100 && stat.undo > 50, JSON.stringify(stat));
  console.log('# stres:', JSON.stringify(stat));
});
