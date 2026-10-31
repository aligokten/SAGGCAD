/* ═══ Akıllı Bas-Çek (Q) — U1, UniCAD "Smart PressPull" esinli ═══
 * Tek kısayol, seçime göre bağlamsal ölçü düzenleme: seçili nesnenin sınıfına göre kipler (ötele, kalınlık, yükseklik,
 * yarıçap …) sunulur; değer BIM komutuyla uygulanır (doğrulanır, tek geri alınabilir işlem, sığmayan açıklık reddi).
 * Saf: kip listesi ve komut üretimi burada; arayüz plan2d.js'tedir.
 */
import { arcStats } from './plan-geom.js';

const n1 = v => +(+v).toFixed(1);
const param = (id, key) => v => ({ op: 'setInstanceParam', id, key, value: +v });

/* sel: { kind, id }, o: kayıt, P: kat planı, meta: etkin meta → [{ k, t, value, unit, rel?, min?, cmd(v) }] | null */
export function pressPullModes(sel, o, P, meta = {}) {
  if (!sel || !o) return null;
  if (sel.kind === 'wall') {
    if (o.arc) {
      const st = arcStats((P.walls || []).filter(w => w.arc?.id === o.arc.id)); if (!st) return null;
      return [
        { k: 'radius', t: 'Yarıçap', value: n1(st.r), unit: 'cm', min: n1(st.chord / 2), cmd: v => ({ op: 'setArcGeometry', arcId: o.arc.id, radius: +v }) },
        { k: 'sagitta', t: 'Ok yüksekliği', value: n1(st.sag), unit: 'cm', min: 1, cmd: v => ({ op: 'setArcGeometry', arcId: o.arc.id, sagitta: +v }) },
      ];
    }
    return [
      { k: 'offset', t: 'Ötele (it / çek)', value: 0, unit: 'cm', rel: true, cmd: v => ({ op: 'offsetWall', id: o.id, d: +v }) },
      { k: 'thickness', t: 'Kalınlık', value: n1(o.t || meta.wallT || 15), unit: 'cm', min: 2, cmd: param(o.id, 'thickness') },
      { k: 'height', t: 'Yükseklik', value: n1(o.h || meta.wallH || 280), unit: 'cm', min: 1, cmd: param(o.id, 'height') },
    ];
  }
  if (sel.kind === 'opening') {
    const m = [{ k: 'width', t: 'Genişlik', value: n1(o.w), unit: 'cm', min: 20, cmd: param(o.id, 'width') }, { k: 'height', t: 'Yükseklik', value: n1(o.h), unit: 'cm', min: 10, cmd: param(o.id, 'height') }];
    if (o.type === 'window') m.push({ k: 'sill', t: 'Denizlik', value: n1(o.sill || 0), unit: 'cm', min: 0, cmd: param(o.id, 'sill') });
    return m;
  }
  if (sel.kind === 'room') return [{ k: 'height', t: 'Mahal yüksekliği', value: n1(o.h || meta.wallH || 280), unit: 'cm', min: 1, cmd: param(o.id, 'height') }];
  if (sel.kind === 'slab') return [
    { k: 'thickness', t: 'Kalınlık', value: n1(o.t || 15), unit: 'cm', min: 1, cmd: param(o.id, 'thickness') },
    { k: 'topOffset', t: 'Üst kot', value: n1(o.top || 0), unit: 'cm', cmd: param(o.id, 'topOffset') },
  ];
  if (sel.kind === 'item' && o.type === 'kolon') return [
    { k: 'height', t: 'Yükseklik', value: n1(o.h), unit: 'cm', min: 1, cmd: param(o.id, 'height') },
    { k: 'width', t: 'Genişlik', value: n1(o.w), unit: 'cm', min: 1, cmd: param(o.id, 'width') },
    { k: 'depth', t: 'Derinlik', value: n1(o.d), unit: 'cm', min: 1, cmd: param(o.id, 'depth') },
  ];
  if (sel.kind === 'item' && o.type === 'kiris') return [
    { k: 'depth', t: 'Kiriş yüksekliği', value: n1(o.h), unit: 'cm', min: 1, cmd: param(o.id, 'depth') },
    { k: 'width', t: 'Kiriş genişliği', value: n1(o.d), unit: 'cm', min: 1, cmd: param(o.id, 'width') },
    { k: 'length', t: 'Uzunluk', value: n1(o.w), unit: 'cm', min: 1, cmd: param(o.id, 'length') },
  ];
  return null;
}
/* girilen metin → sayı ("12,5" ve "+20" / "-15" kabul); geçersizse null */
export function parseLen(txt) {
  const v = parseFloat(String(txt ?? '').trim().replace(',', '.'));
  return Number.isFinite(v) ? v : null;
}
