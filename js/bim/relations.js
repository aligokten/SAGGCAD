/* ═══ BIM çekirdeği — eleman ilişkileri (B1: veri modeli, doğrulama, sorgu) ═══
 * İlişki: { kind, target } — kaynak elemanın rels dizisinde durur.
 *   containedIn  her eleman → bulunduğu / referans aldığı kat (kolon, kiriş için referans kat)
 *   hostedBy     kapı, pencere, boşluk → bağlı olduğu duvar
 *   boundedBy    mahal → sınır duvarları (eski modeldeki room.walls sırasıyla; boş yuvalar raporlanır)
 *   joinedAt     duvar → birleştiği duvar (B2B: joins.js birleşim grafiğinden türetilir; join: birleşim kimliği, end: uç)
 * Bağımlılık grafiği ve artımlı güncelleme B3 kapsamındadır.
 */
import { CLASSES } from './schema.js';

export const REL_KINDS = {
  containedIn: { t: 'Bulunduğu kat', from: null, to: ['level'] },
  hostedBy: { t: 'Bağlı olduğu duvar', from: ['door', 'window', 'opening'], to: ['wall'] },
  boundedBy: { t: 'Sınır elemanı', from: ['room'], to: ['wall'] },
  joinedAt: { t: 'Birleştiği duvar', from: ['wall'], to: ['wall'] },
};

/* model üzerinde ters dizin: hedef → [{ kind, source }] */
export function inverseIndex(model) {
  const inv = new Map();
  for (const el of model.elements.values()) for (const r of el.rels || []) {
    if (!r.target) continue;
    if (!inv.has(r.target)) inv.set(r.target, []);
    inv.get(r.target).push({ kind: r.kind, source: el.id });
  }
  return inv;
}

const label = el => `${CLASSES[el.cls]?.t || el.cls} ${el.id}`;

/* ilişki doğrulaması — hiçbir şeyi silmez / düzeltmez, yalnızca raporlar */
export function validateRelations(model) {
  const out = [], lv = new Map(model.levels.map(l => [l.id, l]));
  const find = id => model.elements.get(id) || lv.get(id) || null;
  for (const el of model.elements.values()) {
    for (const r of el.rels || []) {
      const K = REL_KINDS[r.kind];
      if (!K) { out.push({ severity: 'warning', code: 'REL_KIND_UNKNOWN', id: el.id, msg: `${label(el)}: bilinmeyen ilişki türü "${r.kind}"` }); continue; }
      if (K.from && !K.from.includes(el.cls)) out.push({ severity: 'warning', code: 'REL_SOURCE_CLASS', id: el.id, msg: `${label(el)}: "${r.kind}" bu sınıf için tanımlı değil` });
      if (!r.target) {
        if (r.kind === 'boundedBy') out.push({ severity: 'info', code: 'ROOM_WALL_SLOT_EMPTY', id: el.id, target: null, msg: `${label(el)}: ${r.slot + 1}. sınır duvarı yok (silinmiş ya da ortak duvar)` });
        else out.push({ severity: 'error', code: 'REL_TARGET_EMPTY', id: el.id, target: null, msg: `${label(el)}: "${K.t}" ilişkisinin hedefi boş` });
        continue;
      }
      const t = find(r.target);
      if (!t) { out.push({ severity: 'error', code: 'REL_TARGET_MISSING', id: el.id, target: r.target, msg: `${label(el)}: ${K.t.toLocaleLowerCase('tr')} (${r.target}) bulunamadı` }); continue; }
      if (!K.to.includes(t.cls)) out.push({ severity: 'error', code: 'REL_TARGET_CLASS', id: el.id, target: r.target, msg: `${label(el)}: ${r.target} bir ${K.to.map(c => CLASSES[c].t.toLocaleLowerCase('tr')).join(' / ')} değil (${CLASSES[t.cls]?.t})` });
      if (r.kind !== 'containedIn' && t.levelId && t.levelId !== el.levelId) out.push({ severity: 'warning', code: 'REL_CROSS_LEVEL', id: el.id, target: r.target, msg: `${label(el)}: ilişkili eleman başka katta (${t.levelId})` });
    }
    // geometri ilişkisi: açıklık duvarın içinde mi
    const host = (el.rels || []).find(r => r.kind === 'hostedBy' && r.target), w = host && model.elements.get(host.target);
    if (w && w.cls === 'wall' && Number.isFinite(el.geom.position) && Number.isFinite(w.geom.length) && Number.isFinite(el.geom.width)) {
      if (el.geom.position - el.geom.width / 2 < -0.5 || el.geom.position + el.geom.width / 2 > w.geom.length + 0.5)
        out.push({ severity: 'warning', code: 'OPENING_OUTSIDE_WALL', id: el.id, target: w.id, msg: `${label(el)}: açıklık duvar uzunluğunu aşıyor` });
    }
  }
  return out;
}

/* bir elemanın ilişkileri: giden (rels) ve gelen (ters dizin) */
export function relationsOf(model, inv, id) {
  const el = model.elements.get(id) || model.levels.find(l => l.id === id);
  if (!el) return null;
  return {
    outgoing: (el.rels || []).map(r => ({ kind: r.kind, target: r.target, label: REL_KINDS[r.kind]?.t || r.kind, exists: !!(r.target && (model.elements.has(r.target) || model.levels.some(l => l.id === r.target))) })),
    incoming: (inv.get(id) || []).map(r => ({ kind: r.kind, source: r.source, label: REL_KINDS[r.kind]?.t || r.kind })),
  };
}
