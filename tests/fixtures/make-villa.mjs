// Örnek villa fikstürü üretici (B4C teslim örneği): node tests/fixtures/make-villa.mjs
// Rölöve (mevcut) + proje (tadilat) çizimi; proje rölövenin kopyası (köken), kararlar meta.revision'da.
import { writeFileSync } from 'node:fs';
const J = o => JSON.parse(JSON.stringify(o));
const W = (id, ax, ay, bx, by, comp, t) => ({ id, a: { x: ax, y: ay }, b: { x: bx, y: by }, t, h: 0, comp, kind: comp.startsWith('dis') ? 'dis' : 'ic' });
const ext = (p, a, b, c, d) => [W(p + '1', a, b, c, b, 'dis-tugla-eps', 26.5), W(p + '2', c, b, c, d, 'dis-tugla-eps', 26.5), W(p + '3', c, d, a, d, 'dis-tugla-eps', 26.5), W(p + '4', a, d, a, b, 'dis-tugla-eps', 26.5)];
const R = (id, name, floor, x0, y0, x1, y1) => ({ id, name, floor, pts: [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }] });
const e = 13.25, i = 7;   // dış duvar yarı kalınlığı, iç duvar yarı kalınlığı
const zemin = {
  v: 1, walls: [...ext('zd', 0, 0, 1200, 1000),
    W('zi1', 700, 0, 700, 1000, 'ic-tugla', 14),        // salon | mutfak + banyo
    W('zi2', 700, 550, 1200, 550, 'ic-tugla', 14),      // mutfak | banyo
    W('zi3', 0, 600, 700, 600, 'ic-tugla', 14)],        // salon | yatak
  openings: [
    { id: 'zk1', wallId: 'zd1', type: 'door', pos: 350, w: 100, h: 215, sill: 0 },
    { id: 'zp1', wallId: 'zd4', type: 'window', pos: 300, w: 180, h: 150, sill: 85 },
    { id: 'zp2', wallId: 'zd2', type: 'window', pos: 275, w: 120, h: 120, sill: 100 },
    { id: 'zp3', wallId: 'zd3', type: 'window', pos: 850, w: 150, h: 140, sill: 90 },
    { id: 'zp4', wallId: 'zd2', type: 'window', pos: 780, w: 60, h: 60, sill: 160 },
    { id: 'zk2', wallId: 'zi1', type: 'door', pos: 275, w: 90, h: 210, sill: 0 },
    { id: 'zk3', wallId: 'zi2', type: 'door', pos: 250, w: 80, h: 210, sill: 0 },
    { id: 'zk4', wallId: 'zi3', type: 'door', pos: 550, w: 90, h: 210, sill: 0 }],
  rooms: [R('zr1', 'Salon', 'parke', e, e, 700 - i, 600 - i), R('zr2', 'Mutfak', 'seramik', 700 + i, e, 1200 - e, 550 - i), R('zr3', 'Banyo', 'seramik', 700 + i, 550 + i, 1200 - e, 1000 - e), R('zr4', 'Yatak odası', 'parke', e, 600 + i, 700 - i, 1000 - e)],
  items: [], dims: [], labels: [], rails: [], stairs: [], sections: [], roofs: [],
  slabs: [{ id: 'zs1', kind: 'balkon', comp: 'dos-balkon', pts: [{ x: 300, y: -180 }, { x: 900, y: -180 }, { x: 900, y: -13 }, { x: 300, y: -13 }] }],
  meta: { wallH: 280, wallT: 20, slab: 0, scale: 50 },
  levels: [{ id: 'k1', kind: 'floor', name: '1. Kat', slab: 15, slabComp: 'dos-seramik',
    walls: [...ext('kd', 0, 0, 1200, 1000), W('ki1', 600, 0, 600, 1000, 'ic-tugla', 14), W('ki2', 600, 500, 1200, 500, 'ic-tugla', 14)],
    openings: [{ id: 'kp1', wallId: 'kd1', type: 'window', pos: 300, w: 150, h: 140, sill: 90 }, { id: 'kp2', wallId: 'kd3', type: 'window', pos: 300, w: 150, h: 140, sill: 90 }, { id: 'kk1', wallId: 'ki1', type: 'door', pos: 250, w: 90, h: 210, sill: 0 }, { id: 'kk2', wallId: 'ki2', type: 'door', pos: 300, w: 80, h: 210, sill: 0 }],
    rooms: [R('kr1', 'Ebeveyn yatak', 'parke', e, e, 600 - i, 1000 - e), R('kr2', 'Çocuk odası', 'parke', 600 + i, e, 1200 - e, 500 - i), R('kr3', 'Banyo 2', 'seramik', 600 + i, 500 + i, 1200 - e, 1000 - e)],
    items: [], slabs: [], stairs: [], rails: [], dims: [], labels: [], sections: [], meta: { wallH: 280 } }],
};
// proje: rölövenin kopyası + tadilat
const proje = J(zemin);
proje.walls = proje.walls.filter(w => w.id !== 'zi3');                         // salon–yatak duvarı kaldırılır (açık plan)
proje.openings = proje.openings.filter(o => o.wallId !== 'zi3');
proje.rooms = proje.rooms.filter(r => r.id !== 'zr4'); proje.rooms.find(r => r.id === 'zr1').pts = [{ x: e, y: e }, { x: 700 - i, y: e }, { x: 700 - i, y: 1000 - e }, { x: e, y: 1000 - e }];
proje.rooms.find(r => r.id === 'zr1').name = 'Salon + yemek';
proje.walls.find(w => w.id === 'zi2').comp = 'ic-gazbeton'; proje.walls.find(w => w.id === 'zi2').t = 13;   // banyo duvarı gazbetonla yenilenir
proje.openings.find(o => o.id === 'zp1').w = 240;                               // salon penceresi büyür
proje.walls.push(W('zn1', 250, 1000, 250, 700, 'ic-gazbeton', 13));            // yeni bölme (çalışma köşesi)
proje.openings.push({ id: 'zn2', wallId: 'zd3', type: 'door', pos: 450, w: 90, h: 215, sill: 0 });   // bahçe kapısı
proje.levels[0].walls.find(w => w.id === 'ki2').h = 260;                       // 1. kat banyo duvarı asma tavanla kısalır
proje.meta.revision = { code: 'R1', phases: { 'L0/zi3': 'demolish', 'L0/zn1': 'new', 'L0/zn2': 'new', 'L0/zk4': 'demolish', 'L0/zi2': 'modify', 'L0/zp1': 'modify' }, methods: { 'L0/zi2': 'replace', 'L0/zp1': 'replace' },
  qty: { prices: { 'wall-area:tugla-yatay|demolish': 180, 'wall-area:gazbeton-600|build': 950, 'layer-area:siva-alci|build': 260, 'door:90×215|build': 14500, 'door:90×210|demolish': 900 } } };
const now = Date.parse('2026-10-30T10:00:00Z');
const file = { format: 'saggcad', version: 1, blobs: {}, project: { id: 'pjvilla', name: 'Örnek villa', client: 'Örnek müşteri', address: '', note: 'B4C metraj örneği', createdAt: now, updatedAt: now, photos: [],
  drawings: [{ id: 'dwvR', name: 'Rölöve (mevcut durum)', kind: 'rolove', main: true, plan: zemin, createdAt: now, updatedAt: now },
    { id: 'dwvP', name: 'Tadilat projesi', kind: 'proje', plan: proje, sourceDrawingId: 'dwvR', sourceCreatedAt: now + 1000, revisionLabel: 'R1', createdAt: now + 1000, updatedAt: now + 2000 }] } };
writeFileSync(new URL('./villa-ornek.saggcad.json', import.meta.url), JSON.stringify(file, null, 1));
console.log('villa-ornek.saggcad.json yazıldı');
