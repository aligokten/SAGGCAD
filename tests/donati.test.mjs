// Betonarme donatı hesabı ve metrajı (js/bim/rebar.js) — elle (analitik) hesaplanmış beklenen değerlerle. node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { kgPerM, barArea, minSpec, takeoff, scanBars, concreteElements, rebarReport, rebarCsv, rulesOf, DEFAULT_RULES as R } from '../js/bim/rebar.js';

const near = (a, b, e = 1e-6, m = '') => assert.ok(Math.abs(a - b) <= e, `${m} ${a} ≈ ${b}`);
const rect = (w, h) => [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }];

test('çubuk birim ağırlığı (7850 kg/m³) ve kesit alanı', () => {
  near(kgPerM(8), 0.3946, 1e-4); near(kgPerM(10), 0.6165, 1e-4); near(kgPerM(12), 0.8878, 1e-4); near(kgPerM(16), 1.5783, 1e-4);
  near(barArea(14), 1.5394, 1e-4);
});

test('kolon 30×50, H 280 — yönetmelik minimumu: %1 → 10Ø14, etriye Ø8 10/15, sarılma 50 cm', () => {
  const g = { b: 30, h: 50, H: 280 }, s = minSpec('kolon', g, R);
  assert.deepEqual(s, { mode: 'min', n: 10, d: 14, sd: 8, sc: 10, s: 15, lc: 50 });   // 0,01·1500 = 15 cm² / 1,539 → 9,75 → 10 (çift)
  const t = takeoff({ kind: 'kolon', geom: g, rb: { mode: 'min' } }, R);
  const [L, E] = t.bars;
  assert.equal(L.len, 336);            // 280 + 40·1,4 filiz
  assert.equal(E.n, 23);               // uçlarda 2×(50/10+1) = 12, ortada 180 cm: ⌈180/15⌉−1 = 11
  assert.equal(E.len, 152);            // 2·(30−6) + 2·(50−6) = 136 + 2·10·0,8 kanca
  near(t.kg, 10 * 3.36 * kgPerM(14) + 23 * 1.52 * kgPerM(8), 1e-9);
  near(t.concrete, 0.42, 1e-12);
  assert.equal(t.warnings.length, 0);
});

test('kiriş 25×50, L 500 — minimum oran 0,8·fctd/fyd (C25 / B420C)', () => {
  const g = { L: 500, b: 25, h: 50 }, s = minSpec('kiris', g, R);
  near(s.rhoMin, 0.8 * (0.35 * 5 / 1.5) / (420 / 1.15), 1e-5);
  assert.equal(s.nb, 3);   // 0,00256·25·46 = 2,94 cm² → 3Ø12
  assert.equal(s.nt, 2); assert.equal(s.dt, 12);
  const t = takeoff({ kind: 'kiris', geom: g, rb: { mode: 'min' } }, R);
  assert.deepEqual(t.bars.map(b => [b.d, b.n, b.len]), [[12, 2, 528.8], [12, 3, 528.8], [8, 31, 142]]);
});

test('döşeme 500×400, t 15 — iki doğrultu toplam %0,35: Ø8/19, tarama ile çubuk sayısı ve boyu', () => {
  const g = { pts: rect(500, 400), t: 15 }, s = minSpec('slab', g, R);
  assert.equal(s.sx, 19);                        // 0,00175·15·100 = 2,625 cm²/m; 0,503·100/2,625 = 19,15 → 19
  const t = takeoff({ kind: 'slab', geom: g, rb: { mode: 'min' } }, R);
  assert.deepEqual(t.bars.map(b => [b.d, b.n, b.len]), [[8, 21, 515.2], [8, 27, 415.2]]);   // (396/19)+1 = 21 çubuk × (496 + 2·12·0,8)
  assert.ok(t.warnings.some(w => /mesnet üst donatısı/.test(w)), 'minimumda yalnız alt hasır olduğu söyleniyor');
  // L biçimli çokgen: tarama parçaları
  const L = [{ x: 0, y: 0 }, { x: 600, y: 0 }, { x: 600, y: 300 }, { x: 300, y: 300 }, { x: 300, y: 600 }, { x: 0, y: 600 }];
  const segs = scanBars(L, 'x', 20, 2);
  assert.ok(segs.some(x => Math.abs(x - 596) < 1e-6) && segs.some(x => Math.abs(x - 296) < 1e-6));
  near(segs.reduce((a, b) => a + b, 0), 596 * 15 + 296 * 15, 1e-6);   // y 2..298: 15 çubuk tam, y 302..598: 15 çubuk yarım
});

test('perde 400×25, H 280 — gövde %0,25 her doğrultu, iki yüz; açıklık uyarısı', () => {
  const g = { L: 400, t: 25, H: 280, openings: 1 };
  assert.deepEqual(minSpec('wall', g, R), { mode: 'min', dv: 10, sv: 25, dh: 10, sh: 25 });
  const t = takeoff({ kind: 'wall', geom: g, rb: { mode: 'min' } }, R);
  assert.deepEqual(t.bars.map(b => [b.d, b.n, b.len]), [[10, 32, 320], [10, 24, 419]]);
  assert.ok(t.warnings.some(w => /açıklık düşülmedi/.test(w)));
});

test('elle girilen donatı: kesin metraj; sınır dışı değerlere uyarı; eksik alan metraja girmez', () => {
  const g = { b: 40, h: 40, H: 300 };
  const ok = takeoff({ kind: 'kolon', geom: g, rb: { mode: 'manual', n: 8, d: 16, sd: 10, sc: 10, s: 20, lc: 60 } }, R);
  assert.equal(ok.warnings.length, 0);
  assert.equal(ok.bars[0].len, 364);   // 300 + 40·1,6
  const low = takeoff({ kind: 'kolon', geom: g, rb: { mode: 'manual', n: 4, d: 12, sd: 6, sc: 20, s: 30 } }, R);
  assert.ok(['oranı', 'Ø12', 'Ø6', 'sarılma', 'orta'].every(k => low.warnings.some(w => w.includes(k))), low.warnings.join(' | '));
  const bad = takeoff({ kind: 'kolon', geom: g, rb: { mode: 'manual', n: 8 } }, R);
  assert.equal(bad.kg, 0); assert.ok(bad.invalid);
  const none = takeoff({ kind: 'kolon', geom: g }, R);
  assert.equal(none.mode, 'none'); assert.equal(none.kg, 0);
});

test('12 m üstü çubuk: her ek için bindirme', () => {
  const t = takeoff({ kind: 'kiris', geom: { L: 1500, b: 30, h: 60 }, rb: { mode: 'manual', nt: 2, dt: 16, nb: 2, db: 16, sd: 8, sc: 10, s: 20 } }, R);
  assert.equal(t.bars[0].len, 1500 + 2 * 12 * 1.6 + 40 * 1.6);   // 1538,4 > 1200 → 1 ek
  assert.ok(t.warnings.some(w => /1 ek/.test(w)));
});

test('model üzerinden rapor: elemanlar, çap toplamları, kesin / tahmini ayrımı, kurallar, CSV', async () => {
  const d = JSON.parse(readFileSync(new URL('./fixtures/villa-ornek.saggcad.json', import.meta.url)));
  const P = JSON.parse(JSON.stringify(d.project.drawings[1].plan));
  P.items.push({ id: 'k1', type: 'kolon', x: 0, y: 0, w: 30, d: 50, h: 280, mat: 'betonarme', rb: { mode: 'min' } },
    { id: 'k2', type: 'kolon', x: 500, y: 0, w: 30, d: 50, h: 280, mat: 'betonarme', rb: { mode: 'manual', n: 8, d: 16, sd: 10, sc: 10, s: 15, lc: 50 } },
    { id: 'k3', type: 'kolon', x: 900, y: 0, w: 20, d: 20, h: 280, mat: 'celik' },
    { id: 'b1', type: 'kiris', x: 250, y: 0, w: 500, d: 25, h: 50, rot: 0, mat: 'betonarme' });
  const els = concreteElements(P);
  assert.deepEqual(els.filter(e => e.kind !== 'slab' && e.kind !== 'wall').map(e => e.id).sort(), ['b1', 'k1', 'k2'], 'çelik kolon betonarme sayılmaz');
  assert.ok(els.some(e => e.kind === 'slab' && e.id === 'zs1'), 'balkon döşemesi betonarme katmanlı');
  const rep = rebarReport(P);
  const T = rep.totals;
  near(T.min, 10 * 3.36 * kgPerM(14) + 23 * 1.52 * kgPerM(8), 1e-6, 'yalnız k1 minimum');
  assert.ok(T.manual > 0 && T.undefined >= 2, 'k2 kesin; kiriş ve döşeme tanımsız');
  near(T.total, rep.byDiameter.reduce((s, x) => s + x.kg, 0), 1e-9);
  near(rep.byDiameter.find(x => x.d === 14).kgMin, 10 * 3.36 * kgPerM(14), 1e-9);
  assert.equal(rep.byDiameter.find(x => x.d === 14).kgManual, 0);
  // kurallar proje düzeyinde: bindirme 50Ø → kolon boyuna boyu değişir
  P.meta.rebar = { lap: 50, cover: { col: 4 } };
  assert.equal(rulesOf(P).cover.beam, 3);
  const k1 = rebarReport(P).rows.find(r => r.id === 'k1');
  assert.equal(k1.bars[0].len, 280 + 50 * 1.4);
  const csv = rebarCsv(rebarReport(P), 'deneme');
  assert.ok(csv.startsWith('﻿') && csv.includes('Yönetmelik minimumu (yaklaşık)') && csv.includes('Statik projeden (elle)') && /;3,36;/.test(rebarCsv(rebarReport({ ...P, meta: { ...P.meta, rebar: undefined } }), '')));
});
