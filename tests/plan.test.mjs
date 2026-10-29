// Çizim motorunun tarayıcısız çalışan kısımları için duman testleri: node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyPlan, planMetrics, roomMetrics } from '../js/plan-geom.js';
import { samplePlan } from '../js/sample.js';
import { planToDXF } from '../js/exporters.js';

test('boş plan geçerli yapıda', () => {
  const p = emptyPlan();
  for (const k of ['walls', 'rooms', 'openings', 'items']) assert.ok(Array.isArray(p[k]), k);
});

test('örnek planın metrajı', () => {
  const p = samplePlan();
  const m = planMetrics(p);
  assert.equal(m.rooms.length, 4);
  assert.ok(m.floor > 50 && m.floor < 60, `zemin ${m.floor}`);
  const salon = p.rooms.find(r => r.name === 'Salon');
  assert.ok(Math.abs(Math.abs(roomMetrics(p, salon).area) - 21.84) < 0.05);
});

test('DXF çıktısı katmanları ve EOF içerir', async () => {
  const blob = planToDXF(samplePlan());
  const txt = typeof blob === 'string' ? blob : await blob.text();
  assert.match(txt, /AC1009|AC10\d\d/);
  for (const l of ['DUVAR', 'KAPI', 'PENCERE']) assert.ok(txt.includes(l), l);
  assert.ok(txt.trim().endsWith('EOF'));
});
