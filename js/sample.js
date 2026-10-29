/* Örnek plan — boş bir projede "Örnek plan" ile açılır (araçları denemek için). */
import { uid } from './store.js';
import { emptyPlan, rectRoom } from './plan-geom.js';

/* örnek daire planı (salon, mutfak, yatak odası, banyo) */
export function samplePlan() {
  const p = emptyPlan();
  const salon = rectRoom(p, 0, 0, 520, 420, 'Salon');
  const mutfak = rectRoom(p, 520 + 15, 0, 300, 420, 'Mutfak');
  const yatak = rectRoom(p, 0, 420 + 15, 380, 360, 'Yatak Odası');
  const banyo = rectRoom(p, 380 + 15, 420 + 15, 230, 260, 'Banyo');
  mutfak.floor = 'seramik'; banyo.floor = 'mermer'; banyo.wallColor = '#DDE4E4'; salon.floor = 'parke';
  const w = id => p.walls.find(x => x.id === id);
  const op = (wid, type, pos, wd, hh, sill) => wid && p.openings.push({ id: uid('o'), wallId: wid, type, pos, w: wd, h: hh, sill, flip: false, side: 1 });
  op(salon.walls[0], 'window', 260, 180, 150, 80); op(salon.walls[3], 'door', 200, 100, 215, 0);
  op(mutfak.walls[0], 'window', 150, 120, 120, 100); op(mutfak.walls[3] || salon.walls[1], 'gap', 210, 120, 220, 0);
  op(yatak.walls[3], 'window', 180, 140, 140, 90); op(yatak.walls[0] || salon.walls[2], 'door', 280, 90, 210, 0);
  op(banyo.walls[0] || yatak.walls[1], 'door', 120, 80, 210, 0); op(banyo.walls[1], 'window', 130, 60, 60, 150);
  const it = (type, x, y, rot = 0, wd, d) => { const f = { koltuk: [85, 85, 85, '#C7A27A'], kanepe: [220, 90, 85, '#9AA3AE'], sehpa: [110, 60, 40, '#6E5341'], tv: [180, 45, 50, '#2E3135'], yatak: [160, 200, 50, '#ECE8E1'], gardirop: [200, 60, 240, '#F2F0EC'], tezgah: [300, 62, 90, '#F4F4F2'], ada: [180, 90, 90, '#22B8C8'], buzdolabi: [70, 70, 190, '#D9DCDF'], klozet: [38, 60, 40, '#FFFFFF'], lavabo: [80, 48, 85, '#FFFFFF'], dus: [90, 90, 5, '#F5F5F5'], bitki: [50, 50, 120, '#4F8A4B'], masa: [180, 90, 75, '#8A6A4F'] }[type]; p.items.push({ id: uid('i'), type, label: type, x, y, w: wd || f[0], d: d || f[1], h: f[2], z: 0, rot, color: f[3] }); };
  it('kanepe', 260, 340, 180); it('sehpa', 260, 270); it('tv', 260, 25); it('bitki', 480, 380); it('koltuk', 75, 290, 90);
  it('tezgah', 535 + 31, 210, 270, 300); it('ada', 535 + 185, 250, 90); it('buzdolabi', 535 + 260, 40);
  it('yatak', 190, 435 + 260, 180); it('gardirop', 190, 435 + 31, 0);
  it('klozet', 395 + 30, 435 + 230, 180); it('lavabo', 395 + 150, 435 + 236, 180); it('dus', 395 + 185, 435 + 50);
  p.items.forEach(x => { x.label = { koltuk: 'Berjer', kanepe: 'Kanepe', sehpa: 'Sehpa', tv: 'TV', bitki: 'Bitki', masa: 'Masa', tezgah: 'Tezgah', ada: 'Ada', buzdolabi: 'Buzdolabı', yatak: 'Yatak', gardirop: 'Gardırop', klozet: 'WC', lavabo: 'Lavabo', dus: 'Duş' }[x.type]; });
  return p;
}
