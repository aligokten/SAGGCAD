/* ═══ BIM çekirdeği — eleman şeması (B1) ═══
 * Her yapı elemanı aynı zarfı paylaşır; geometri (geom) ile özellikler (props) ayrıdır:
 *
 *   {
 *     schema: 1,                         // BIM eleman şeması sürümü
 *     id: 'w…',                          // kalıcı kimlik — eski veri modelindeki kimliğin kendisi
 *     cls: 'wall',                       // eleman sınıfı (aşağıdaki CLASSES)
 *     typeId: 'DIS-DUV-01',              // eleman türü (types.js)
 *     typeSource: 'explicit'|'derived'|'default',
 *     levelId: 'L0',                     // bağlı olduğu kat (zemin kat 'L0', ek katlar kendi lv… kimliği)
 *     geom: { … },                       // konum, yönelim, ölçüler (cm, derece)
 *     props: { … },                      // işlev, taşıyıcılık, malzeme / kompozit, kullanım
 *     rels: [{ kind, target }],          // diğer elemanlarla ilişkiler (relations.js)
 *     vis: { visible, layer, ifc },      // görünürlük ve sınıflandırma
 *     meta: { createdAt, modifiedAt, origin, src: { coll, level, index } }
 *   }
 *
 * B1'de ana kayıt kaynağı eski plan verisidir; bu zarf ondan türetilir (adapter.js) ve hiçbir zaman geri yazılmaz.
 */

export const BIM_SCHEMA_VERSION = 1;
export const GROUND_LEVEL_ID = 'L0';

/* parametre tanımı: k anahtar, t etiket, unit birim, type veri türü, at elemandaki yeri (geom.* | props.*),
 * scope: 'type' (tür parametresi, tür değeri esas) | 'instance' (yalnız eleman) | 'both' (tür varsayılanı, eleman geçersiz kılabilir) */
const P = (k, t, at, type = 'length', scope = 'both', unit = type === 'length' ? 'cm' : type === 'angle' ? '°' : '') => ({ k, t, at, type, scope, unit });

export const CLASSES = {
  level: { t: 'Kat', ifc: 'IfcBuildingStorey', params: [P('elevation', 'Kat kotu', 'geom.elevation', 'length', 'instance'), P('height', 'Kat yüksekliği', 'geom.height', 'length', 'instance'), P('slabThickness', 'Döşeme kalınlığı', 'geom.slabThickness', 'length', 'instance')] },
  wall: {
    t: 'Duvar', ifc: 'IfcWall', layer: 'DUVAR', params: [
      P('function', 'İşlev', 'props.function', 'enum', 'type'),
      P('compositeId', 'Kompozit yapı', 'props.compositeId', 'ref', 'both'),
      P('thickness', 'Kalınlık', 'geom.thickness'),
      P('height', 'Yükseklik', 'geom.height'),
      P('baseOffset', 'Alt kot', 'geom.baseOffset', 'length', 'instance'),
      P('length', 'Uzunluk (eksen)', 'geom.length', 'length', 'instance'),
      P('loadBearing', 'Taşıyıcı', 'props.loadBearing', 'bool'),
      P('materialId', 'Malzeme', 'props.materialId', 'ref', 'instance'),
    ],
  },
  column: {
    t: 'Kolon', ifc: 'IfcColumn', layer: 'KOLON', params: [
      P('materialId', 'Malzeme', 'props.materialId', 'ref', 'type'), P('shape', 'Kesit', 'geom.shape', 'enum'),
      P('width', 'En / çap', 'geom.width'), P('depth', 'Boy', 'geom.depth'), P('height', 'Yükseklik', 'geom.height'),
      P('baseOffset', 'Alt kot', 'geom.baseOffset', 'length', 'instance'), P('rotation', 'Dönüş', 'geom.rotation', 'angle', 'instance'),
      P('loadBearing', 'Taşıyıcı', 'props.loadBearing', 'bool'),
    ],
  },
  beam: {
    t: 'Kiriş', ifc: 'IfcBeam', layer: 'KIRIS', params: [
      P('materialId', 'Malzeme', 'props.materialId', 'ref', 'type'), P('width', 'Genişlik (b)', 'geom.width'), P('depth', 'Yükseklik (h)', 'geom.depth'),
      P('length', 'Uzunluk', 'geom.length', 'length', 'instance'), P('topOffset', 'Üst kot', 'geom.topOffset', 'length', 'instance'),
      P('rotation', 'Doğrultu', 'geom.rotation', 'angle', 'instance'), P('loadBearing', 'Taşıyıcı', 'props.loadBearing', 'bool'),
    ],
  },
  slab: {
    t: 'Döşeme', ifc: 'IfcSlab', layer: 'DOSEME', params: [
      P('function', 'İşlev', 'props.function', 'enum', 'type'), P('compositeId', 'Kompozit yapı', 'props.compositeId', 'ref'),
      P('thickness', 'Kalınlık', 'geom.thickness'), P('topOffset', 'Üst yüz kotu', 'geom.topOffset', 'length', 'instance'),
      P('area', 'Alan', 'geom.area', 'number', 'instance', 'm²'),
    ],
  },
  door: {
    t: 'Kapı', ifc: 'IfcDoor', layer: 'KAPI', params: [
      P('model', 'Model', 'props.model', 'enum'), P('use', 'Kullanım', 'props.use', 'enum'),
      P('width', 'Genişlik', 'geom.width'), P('height', 'Yükseklik', 'geom.height'), P('position', 'Duvar başından (eksen)', 'geom.position', 'length', 'instance'),
    ],
  },
  window: {
    t: 'Pencere', ifc: 'IfcWindow', layer: 'PENCERE', params: [
      P('model', 'Model', 'props.model', 'enum'), P('use', 'Kullanım', 'props.use', 'enum'),
      P('width', 'Genişlik', 'geom.width'), P('height', 'Yükseklik', 'geom.height'), P('sill', 'Denizlik', 'geom.sill'),
      P('position', 'Duvar başından (eksen)', 'geom.position', 'length', 'instance'),
    ],
  },
  opening: {
    t: 'Boşluk', ifc: 'IfcOpeningElement', layer: 'BOSLUK', params: [
      P('width', 'Genişlik', 'geom.width'), P('height', 'Yükseklik', 'geom.height'), P('position', 'Duvar başından (eksen)', 'geom.position', 'length', 'instance'),
    ],
  },
  room: {
    t: 'Mahal', ifc: 'IfcSpace', layer: 'MAHAL', params: [
      P('name', 'Ad', 'props.name', 'text', 'instance'), P('floorFinish', 'Zemin kaplaması', 'props.floorFinish', 'enum', 'instance'),
      P('height', 'Net yükseklik', 'geom.height'), P('floorOffset', 'Döşeme kotu', 'geom.floorOffset', 'length', 'instance'),
      P('area', 'Alan', 'geom.area', 'number', 'instance', 'm²'),
    ],
  },
  roof: {
    t: 'Çatı', ifc: 'IfcRoof', layer: 'CATI', params: [
      P('roofType', 'Çatı tipi', 'props.roofType', 'enum'), P('slope', 'Eğim', 'geom.slope', 'angle'), P('overhang', 'Saçak', 'geom.overhang'),
      P('cover', 'Örtü', 'props.cover', 'enum'), P('baseOffset', 'Oturma kotu', 'geom.baseOffset', 'length', 'instance'),
    ],
  },
  stair: {
    t: 'Merdiven', ifc: 'IfcStair', layer: 'MERDIVEN', params: [
      P('stairType', 'Merdiven tipi', 'props.stairType', 'enum'), P('construction', 'Yapım', 'props.construction', 'enum'),
      P('width', 'Kol genişliği', 'geom.width'), P('rise', 'Toplam yükseklik', 'geom.rise'), P('risers', 'Rıht sayısı', 'geom.risers', 'number', 'instance'),
      P('baseOffset', 'Başlangıç kotu', 'geom.baseOffset', 'length', 'instance'),
    ],
  },
  railing: { t: 'Korkuluk', ifc: 'IfcRailing', layer: 'KORKULUK', params: [P('railKind', 'Tür', 'props.railKind', 'enum'), P('height', 'Yükseklik', 'geom.height'), P('length', 'Uzunluk', 'geom.length', 'length', 'instance')] },
  furnishing: { t: 'Donatı / mobilya', ifc: 'IfcFurnishingElement', layer: 'MOBILYA', params: [P('itemType', 'Tür', 'props.itemType', 'enum', 'instance'), P('width', 'En', 'geom.width', 'length', 'instance'), P('depth', 'Derinlik', 'geom.depth', 'length', 'instance'), P('height', 'Yükseklik', 'geom.height', 'length', 'instance')] },
};
export const ELEMENT_CLASSES = Object.keys(CLASSES).filter(k => k !== 'level');

/* "geom.thickness" gibi yoldan değer okuma */
export const getAt = (o, path) => path.split('.').reduce((a, k) => (a == null ? undefined : a[k]), o);

const isNum = v => typeof v === 'number' && Number.isFinite(v);
const isPt = p => p && isNum(p.x) && isNum(p.y);

/* eleman doğrulaması: veri türleri ve geometrik geçerlilik. Değiştirmez; yalnızca rapor verir. */
export function validateElement(el) {
  const errors = [], warnings = [];
  if (!el || typeof el !== 'object') return { ok: false, errors: ['Eleman nesne değil'], warnings };
  if (typeof el.id !== 'string' || !el.id) errors.push('Kimlik (id) yok');
  const C = CLASSES[el.cls];
  if (!C) errors.push(`Bilinmeyen sınıf: ${el.cls}`);
  if (el.cls !== 'level' && (typeof el.levelId !== 'string' || !el.levelId)) errors.push('Bağlı kat (levelId) yok');
  if (el.cls !== 'level' && typeof el.typeId !== 'string') errors.push('Eleman türü (typeId) yok');
  if (!el.geom || typeof el.geom !== 'object') errors.push('Geometri (geom) yok');
  if (!el.props || typeof el.props !== 'object') errors.push('Özellikler (props) yok');
  if (!Array.isArray(el.rels)) errors.push('İlişkiler (rels) dizi değil');
  const g = el.geom || {};
  const pos = (k, t) => { if (g[k] !== undefined && !(isNum(g[k]) && g[k] > 0)) errors.push(`${t} pozitif sayı değil (${g[k]})`); };
  switch (el.cls) {
    case 'wall':
      if (!isPt(g.a) || !isPt(g.b)) errors.push('Duvar uç noktaları geçersiz');
      else if (Math.hypot(g.b.x - g.a.x, g.b.y - g.a.y) < 0.5) warnings.push('Duvar uzunluğu sıfıra yakın');
      pos('thickness', 'Kalınlık'); pos('height', 'Yükseklik'); break;
    case 'column': case 'beam': case 'furnishing':
      if (!isPt(g.position)) errors.push('Konum geçersiz');
      pos('width', 'En'); pos('depth', 'Boy / derinlik'); if (el.cls !== 'beam') pos('height', 'Yükseklik'); break;
    case 'slab': case 'room': case 'roof':
      // kat döşemesinin sınırı katın dış hattından türetilir (fromLevel); eski modelde ayrı çokgen yoktur
      if (!(el.cls === 'slab' && g.fromLevel) && (!Array.isArray(g.outline) || g.outline.length < 3 || !g.outline.every(isPt))) errors.push('Sınır çokgeni geçersiz (en az 3 nokta)');
      if (el.cls === 'slab') pos('thickness', 'Kalınlık'); break;
    case 'door': case 'window': case 'opening':
      pos('width', 'Genişlik'); pos('height', 'Yükseklik');
      if (!isNum(g.position)) errors.push('Duvar üzerindeki konum geçersiz'); break;
    case 'stair': if (!isPt(g.position)) errors.push('Konum geçersiz'); pos('width', 'Genişlik'); break;
    case 'railing': if (!isPt(g.a) || !isPt(g.b)) errors.push('Uç noktaları geçersiz'); break;
  }
  return { ok: !errors.length, errors, warnings };
}
