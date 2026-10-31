// B2B-1 — duvar birleşim grafiği: node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeJoins, wallJoinInfo, JOIN_TOL } from '../js/bim/joins.js';
import { buildModel } from '../js/bim/adapter.js';
import { validateRelations } from '../js/bim/relations.js';

const W = (id, ax, ay, bx, by, t = 20, x = {}) => ({ id, a: { x: ax, y: ay }, b: { x: bx, y: by }, t, h: 0, ...x });
const plan = walls => ({ v: 1, walls, openings: [], rooms: [], items: [], meta: { wallT: 20, wallH: 280 } });
const kinds = G => G.joins.map(j => j.kind).sort().join(',');
const pt = (p, x, y, e = 1e-6) => assert.ok(Math.abs(p.x - x) < e && Math.abs(p.y - y) < e, `nokta ${JSON.stringify(p)} ≠ (${x}, ${y})`);

test('L birleşimi 90°: düğüm noktası, açı, kimlik', () => {
  const G = analyzeJoins(plan([W('w1', 0, 0, 400, 0), W('w2', 400, 0, 400, 300)]));
  assert.equal(kinds(G), 'L'); const j = G.joins[0];
  assert.equal(j.id, 'L:w1.b|w2.a'); assert.ok(Math.abs(j.angle - 90) < 1e-9); pt(j.at, 400, 0);
  assert.equal(G.endJoin.get('w1.b'), j.id); assert.equal(G.endJoin.get('w2.a'), j.id);
  assert.equal(G.endJoin.get('w1.a'), undefined, 'serbest uç');
  assert.deepEqual(wallJoinInfo(G, 'w1').b.walls, ['w2']); assert.equal(wallJoinInfo(G, 'w1').a, null);
});

test('dar ve geniş açılı L birleşimleri; çok dar açı uyarısı', () => {
  for (const deg of [30, 60, 120, 150]) {
    const r = deg * Math.PI / 180, G = analyzeJoins(plan([W('w1', 0, 0, 400, 0), W('w2', 400, 0, 400 - 300 * Math.cos(r), 300 * Math.sin(r))]));
    assert.equal(kinds(G), 'L', `${deg}°`); assert.ok(Math.abs(G.joins[0].angle - deg) < 1e-6, `${deg}° ölçüldü ${G.joins[0].angle}`);
    assert.equal(G.issues.length, 0);
  }
  const r = 8 * Math.PI / 180, G = analyzeJoins(plan([W('w1', 0, 0, 400, 0), W('w2', 400, 0, 400 - 300 * Math.cos(r), 300 * Math.sin(r))]));
  assert.equal(kinds(G), 'L'); assert.ok(G.issues.some(i => i.code === 'ACUTE_ANGLE'));
});

test('T birleşimi: eksende biten ve ana duvar yüzünde biten kol; üç uçlu düğüm', () => {
  const G = analyzeJoins(plan([W('h', 0, 0, 600, 0), W('s', 300, 0, 300, 300, 10)]));
  assert.equal(kinds(G), 'T'); assert.equal(G.joins[0].id, 'T:h.body|s.a'); pt(G.joins[0].at, 300, 0);
  const G2 = analyzeJoins(plan([W('h', 0, 0, 600, 0), W('s', 300, 10, 300, 300, 10)]));   // ana duvarın yüzünde (t/2 = 10)
  assert.equal(kinds(G2), 'T'); assert.equal(G2.joins[0].contact, 10);
  const G3 = analyzeJoins(plan([W('h1', 0, 0, 300, 0), W('h2', 300, 0, 600, 0), W('s', 300, 0, 300, 300, 10)]));
  assert.equal(kinds(G3), 'T'); assert.deepEqual(G3.joins[0].members.map(m => m.role), ['pair', 'pair', 'stem']);
  assert.equal(G3.joins[0].members[2].id, 's');
});

test('X birleşimi: gövde kesişimi ve dört uçlu düğüm', () => {
  const G = analyzeJoins(plan([W('a', 0, 0, 600, 0), W('b', 300, -200, 300, 200)]));
  assert.equal(kinds(G), 'X'); pt(G.joins[0].at, 300, 0); assert.equal(G.joins[0].id, 'X:a.body|b.body');
  const G2 = analyzeJoins(plan([W('a1', 0, 0, 300, 0), W('a2', 300, 0, 600, 0), W('b1', 300, -200, 300, 0), W('b2', 300, 0, 300, 200)]));
  assert.equal(kinds(G2), 'X'); assert.equal(G2.joins[0].members.length, 4);
});

test('I birleşimi: aynı doğru üzerinde devam; çakışan doğrusal duvar uyarısı', () => {
  const G = analyzeJoins(plan([W('a', 0, 0, 300, 0), W('b', 300, 0, 700, 0, 30)]));
  assert.equal(kinds(G), 'I');
  const G2 = analyzeJoins(plan([W('a', 0, 0, 300, 0), W('b', 200, 0, 500, 0)]));
  assert.equal(G2.joins.length, 0); assert.ok(G2.issues.some(i => i.code === 'OVERLAP'));
  const G3 = analyzeJoins(plan([W('a', 0, 0, 300, 0), W('b', 0, 0, 200, 0)]));   // aynı uçtan aynı yöne
  assert.ok(G3.issues.some(i => i.code === 'OVERLAP'));
});

test('komşu ama temas etmeyen duvarlar birleşmez; tolerans sınırı', () => {
  const t = 20, near = t / 2 + JOIN_TOL.contact;
  const A = analyzeJoins(plan([W('h', 0, 0, 600, 0), W('s', 300, near + 0.5, 300, 300, 10)]));
  assert.equal(A.joins.length, 0, 'bandın 1,5 cm dışında: birleşmez');
  const B = analyzeJoins(plan([W('h', 0, 0, 600, 0), W('s', 300, near - 0.5, 300, 300, 10)]));
  assert.equal(kinds(B), 'T', 'temas toleransı içinde: T');
  const C = analyzeJoins(plan([W('w1', 0, 0, 400, 0), W('w2', 400.8, 0, 400.8, 300)]));
  assert.equal(C.joins.length, 0, '0,8 cm aralıklı uçlar L sayılmaz (eksen toleransı 0,5)');
  const D = analyzeJoins(plan([W('w1', 0, 0, 400, 0), W('w2', 400.3, 0.2, 400.3, 300)]));
  assert.equal(kinds(D), 'L');
  const E = analyzeJoins(plan([W('p1', 0, 0, 400, 0), W('p2', 0, 40, 400, 40)]));   // paralel komşular
  assert.equal(E.joins.length, 0); assert.equal(E.issues.length, 0);
});

test('hatalı durumlar raporlanır: sıfır uzunluk, kısa duvar, tekrar eden kimlik, kapatılmış birleşim', () => {
  const G = analyzeJoins(plan([W('z', 10, 10, 10.2, 10), W('k', 0, 0, 12, 0), W('d', 0, 0, 0, 300), W('d', 50, 50, 90, 50), W('w1', 0, 500, 300, 500, 20, { joinOff: ['b'] }), W('w2', 300, 500, 300, 800)]));
  const codes = G.issues.map(i => i.code);
  for (const c of ['ZERO_LENGTH', 'SHORT_WALL', 'ID_DUPLICATE', 'JOIN_DISABLED']) assert.ok(codes.includes(c), c);
  assert.ok(!G.joins.some(j => j.members.some(m => m.id === 'w1' && m.end === 'b')), 'kapatılan uç birleşmedi');
});

test('belirlenimci: duvar sırası değişse de aynı birleşimler', () => {
  const ws = [W('w1', 0, 0, 400, 0), W('w2', 400, 0, 400, 300), W('w3', 400, 300, 0, 300), W('w4', 0, 300, 0, 0), W('s', 200, 0, 200, 300, 10), W('x', -100, 150, 500, 150, 10)];
  const ref = analyzeJoins(plan(ws)).joins.map(j => j.id);
  const shuffled = [ws[3], ws[5], ws[1], ws[4], ws[0], ws[2]];
  assert.deepEqual(analyzeJoins(plan(shuffled)).joins.map(j => j.id), ref);
  assert.deepEqual(analyzeJoins(plan(ws)).joins.map(j => j.id), ref, 'tekrar çağrı');
  assert.equal(ref.filter(k => k.startsWith('L:')).length, 4);
});

test('joinedAt ilişkisi BIM modelinde, doğrulamadan geçer; veri değişmez', () => {
  const P = plan([W('w1', 0, 0, 400, 0), W('w2', 400, 0, 400, 300), W('s', 200, 0, 200, 300, 10)]), j0 = JSON.stringify(P);
  const m = buildModel(P), r = m.elements.get('w1').rels.filter(x => x.kind === 'joinedAt');
  assert.deepEqual(r.map(x => [x.target, x.joinKind, x.end]).sort(), [['s', 'T', 'body'], ['w2', 'L', 'b']]);
  assert.ok(!validateRelations(m).some(i => i.code.startsWith('REL_')), JSON.stringify(validateRelations(m)));
  assert.equal(JSON.stringify(P), j0);
});
