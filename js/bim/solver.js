/* ═══ BIM çekirdeği — sıralı kısıt çözücü (B3-D) ═══
 * Bağımlılık grafiğinin (deps.js) aşama sırasıyla modeli denetler:
 *   kat kotu / yüksekliği → kata bağlı kolon, kiriş, duvar → duvar geometrisi → birleşimler → açıklıklar → mahaller
 *   → döşemeler → türetilmiş metraj / görünüş
 * Çözücü SAF'tır: kökü değiştirmez, hiçbir çakışmayı sessizce düzeltmez. Her çakışma { stage, code, severity, ids, msg }
 * olarak raporlanır; otomatik giderilebilenler için önerilen BIM komutu (fix) eklenir — uygulamak kullanıcının kararıdır
 * (Model Sağlığı → "Uygula"; tek geri alınabilir işlem). Kısıt döngüsü bulunursa sıra kurulmaz, döngü raporlanır.
 * changed verilirse yalnız etkilenen kapsam (getAffectedElements) denetlenir; verilmezse tüm model.
 */
import { buildModel } from './adapter.js';
import { buildDeps, getAffectedElements, constraintOrder, STAGES } from './deps.js';
import { joinGraph } from './joins.js';
import { bindingTarget } from './wallcmds.js';
import { wallQuantities } from './wallgeom.js';
import { planLevels, wallLen, polyArea } from '../plan-geom.js';
import { compOf, compThickness } from '../materials.js';
import { outlineOf } from '../roof.js';

const fin = v => typeof v === 'number' && Number.isFinite(v);
const pt = p => !!p && fin(p.x) && fin(p.y);
const r2 = n => +(+n).toFixed(2);

export function solve(root, { changed = null, model = null } = {}) {
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const M = model || buildModel(root), G = buildDeps(M, root), conflicts = [], fixes = [];
  const scope = changed ? new Set(getAffectedElements(G, changed)) : null;
  const inScope = id => !scope || scope.has(id);
  const add = (stage, code, severity, ids, msg, fix) => { conflicts.push({ stage, code, severity, ids: [...ids].sort(), msg }); if (fix && !fixes.some(f => JSON.stringify(f.cmd) === JSON.stringify(fix))) fixes.push({ cmd: fix, why: msg }); };
  // sıra: kapsamdaki düğümler kısıt grafiğinde topolojik — döngü varsa çözülemez
  const nodes = scope ? [...scope] : [...G.kind.keys()];
  const ord = constraintOrder(G, nodes);
  if (!ord.ok) {
    for (const c of ord.cycles) add('level', 'CONSTRAINT_CYCLE', 'error', c, `Kısıt döngüsü: ${c.join(' → ')} — sıra kurulamadı, model değiştirilmedi`);
    return report(conflicts, fixes, [], scope, t0);
  }
  const L = planLevels(root), ids = new Map(L.map((l, i) => [i === 0 ? 'L0' : l.plan.id, l]));
  const stagesRun = [];
  const stage = (name, fn) => { stagesRun.push(name); fn(); };

  stage('level', () => {
    for (const [id, l] of ids) {
      if (!inScope(id)) continue;
      if (l.kind !== 'roof' && !(fin(l.h) && l.h >= 50 && l.h <= 2000)) add('level', 'LEVEL_HEIGHT', 'error', [id], `${l.name}: kat yüksekliği ${l.h} cm geçersiz (50–2000)`);
      if (!(fin(l.slab) && l.slab >= 0 && l.slab <= 300)) add('level', 'LEVEL_SLAB', 'error', [id], `${l.name}: döşeme kalınlığı ${l.slab} cm geçersiz (0–300)`);
      if (!fin(l.z)) add('level', 'LEVEL_ELEVATION', 'error', [id], `${l.name}: kat kotu hesaplanamadı`);
    }
  });
  stage('binding', () => {
    L.forEach((l, lv) => {
      for (const coll of ['walls', 'items']) for (const o of l.plan[coll] || []) {
        if (!o?.bimTop || typeof o.id !== 'string' || !inScope(o.id)) continue;
        const cls = coll === 'walls' ? 'wall' : o.type === 'kolon' ? 'column' : o.type === 'kiris' ? 'beam' : null; if (!cls) continue;
        const r = bindingTarget(root, lv, cls, o, o.bimTop);
        if (r.error) { add('binding', 'BINDING_INVALID', 'error', [o.id], `${o.id}: ${r.error}`); continue; }
        const cur = +o[r.key] || 0;
        if (Math.abs(cur - r.value) > 0.01) add('binding', 'BINDING_STALE', 'warning', [o.id], `${o.id}: kata bağlı ${r.key === 'z' ? 'alt kot' : 'yükseklik'} ${r2(cur)} cm, olması gereken ${r.value} cm`, { op: 'syncLevelBindings' });
      }
    });
  });
  stage('wall', () => {
    for (const l of L) for (const w of l.plan.walls || []) {
      if (!w || !inScope(w.id)) continue;
      if (!pt(w.a) || !pt(w.b)) { add('wall', 'WALL_INVALID', 'error', [w.id], `Duvar ${w.id}: uç koordinatı geçersiz`); continue; }
      if (wallLen(w) < 1) add('wall', 'WALL_INVALID', 'error', [w.id], `Duvar ${w.id}: uzunluk ${r2(wallLen(w))} cm (en az 1)`);
      if (w.t !== undefined && !(+w.t > 0)) add('wall', 'WALL_INVALID', 'error', [w.id], `Duvar ${w.id}: kalınlık ${w.t} geçersiz`);
    }
  });
  stage('join', () => {
    for (const [lid, l] of ids) {
      if (l.kind === 'roof' || !(l.plan.walls || []).length) continue;
      const meta = { ...root.meta, ...(l.plan.meta || {}) };
      let J; try { J = joinGraph(l.plan, { T: +meta.wallT || 15 }); } catch (e) { add('join', 'JOINS_FAILED', 'error', [lid], `${l.name}: birleşim grafiği hesaplanamadı (${e.message})`); continue; }
      for (const i of J.issues) if (i.severity !== 'info' && (i.ids || []).some(inScope)) add('join', 'JOIN_' + i.code, i.severity, i.ids || [], `${l.name}: ${i.msg}`);
    }
  });
  stage('opening', () => {
    for (const l of L) {
      const walls = new Map((l.plan.walls || []).filter(Boolean).map(w => [w.id, w])), meta = { ...root.meta, ...(l.plan.meta || {}) };
      for (const o of l.plan.openings || []) {
        if (!o || !inScope(o.id)) continue;
        const w = walls.get(o.wallId);
        if (!w) { add('opening', 'OPENING_HOST', 'error', [o.id], `${o.id}: bağlı olduğu duvar (${o.wallId}) yok`); continue; }
        const Lw = wallLen(w), h = +o.h || 0, H = +w.h || l.h || +meta.wallH || 280;
        if (o.pos - o.w / 2 < -0.01 || o.pos + o.w / 2 > Lw + 0.01) add('opening', 'OPENING_FIT', 'error', [o.id, w.id], `${o.id} (${r2(o.w)} cm) duvar ${w.id} (${r2(Lw)} cm) içine sığmıyor`);
        if ((o.type === 'window' ? +o.sill || 0 : 0) + h > H + 0.01) add('opening', 'OPENING_HEIGHT', 'warning', [o.id, w.id], `${o.id}: üst kotu (${r2((o.type === 'window' ? +o.sill || 0 : 0) + h)} cm) duvar yüksekliğini (${r2(H)} cm) aşıyor`);
      }
    }
  });
  stage('room', () => {
    for (const l of L) for (const r of l.plan.rooms || []) {
      if (!r || !inScope(r.id)) continue;
      if (!Array.isArray(r.pts) || r.pts.length < 3 || !r.pts.every(pt)) { add('room', 'ROOM_INVALID', 'error', [r.id], `Mahal ${r.name || r.id}: sınır çokgeni geçersiz`); continue; }
      if (Math.abs(polyArea(r.pts)) < 1) add('room', 'ROOM_INVALID', 'error', [r.id], `Mahal ${r.name || r.id}: alanı sıfır`);
    }
  });
  stage('slab', () => {
    for (const l of L) for (const s of l.plan.slabs || []) {
      if (!s || !inScope(s.id)) continue;
      if (!Array.isArray(s.pts) || s.pts.length < 3 || !s.pts.every(pt)) add('slab', 'SLAB_INVALID', 'error', [s.id], `Döşeme ${s.id}: çokgen geçersiz`);
    }
  });
  stage('derived', () => {
    for (const [lid, l] of ids) {
      if (l.kind === 'roof' || (scope && !scope.has(`qty:${lid}`) && !scope.has(lid))) continue;
      try {
        const q = wallQuantities(root, l.plan, { ...root.meta, ...(l.plan.meta || {}) });
        if (!fin(q.total)) add('derived', 'QTY_INVALID', 'error', [lid], `${l.name}: duvar metrajı sayı değil`);
      } catch (e) { add('derived', 'QTY_FAILED', 'error', [lid], `${l.name}: metraj hesaplanamadı (${e.message})`); }
    }
  });
  // MAX: kullanıcının tasarım sınırları (meta.limits) — yalnız rapor, değer değiştirilmez
  for (const v of checkLimits(root)) if (!scope || v.ids.some(inScope) || !v.ids.length) add('derived', v.code, 'warning', v.ids, v.msg);
  return report(conflicts, fixes, stagesRun, scope, t0, ord.order);
}

/* ── tasarım sınırları (maksimum) ── meta.limits: { maxWallHeight, maxWallLength, maxWallThickness (cm), maxOpeningWidth (cm),
 * maxRoomArea (m²), maxLevels, maxBuildingHeight (cm, en üst katın üstü), maxFootprint (m², zemin kat dış hattı),
 * maxFloorArea (m², katların dış hat alanları toplamı) } → aşan her değer için { code, ids, msg, value, limit } */
export const LIMITS = Object.freeze({
  maxWallHeight: { t: 'En büyük duvar yüksekliği', unit: 'cm' }, maxWallLength: { t: 'En büyük duvar boyu', unit: 'cm' },
  maxWallThickness: { t: 'En büyük duvar kalınlığı', unit: 'cm' }, maxOpeningWidth: { t: 'En büyük açıklık genişliği', unit: 'cm' },
  maxRoomArea: { t: 'En büyük mahal alanı', unit: 'm²' }, maxLevels: { t: 'En fazla kat sayısı', unit: 'kat' },
  maxBuildingHeight: { t: 'En büyük bina yüksekliği', unit: 'cm' }, maxFootprint: { t: 'En büyük taban alanı (zemin kat dış hattı)', unit: 'm²' },
  maxFloorArea: { t: 'En büyük toplam kat alanı (dış hatlar)', unit: 'm²' },
});
export function checkLimits(root) {
  const lim = root?.meta?.limits; if (!lim || typeof lim !== 'object') return [];
  const out = [], f = v => (+v).toLocaleString('tr-TR', { maximumFractionDigits: 2 }), L = planLevels(root).filter(l => l.kind !== 'roof');
  const over = (key, value, ids, what) => { const m = +lim[key]; if (Number.isFinite(m) && value > m + 1e-9) out.push({ code: 'LIMIT_' + key.replace(/^max/, '').toUpperCase(), ids, value, limit: m, msg: `${what}: ${f(value)} ${LIMITS[key].unit} > sınır ${f(m)} ${LIMITS[key].unit}` }); };
  for (const l of L) {
    const meta = { ...root.meta, ...(l.plan.meta || {}) };
    for (const w of l.plan.walls || []) {
      if (!w?.a || !w?.b) continue;
      const comp = w.comp ? compOf(root, w.comp) : null, t = comp ? compThickness(comp) : (+w.t || +meta.wallT || 15);
      over('maxWallHeight', +w.h || l.h, [w.id], `Duvar ${w.id} yüksekliği`); over('maxWallLength', wallLen(w), [w.id], `Duvar ${w.id} boyu`); over('maxWallThickness', t, [w.id], `Duvar ${w.id} kalınlığı`);
    }
    for (const o of l.plan.openings || []) if (o?.id) over('maxOpeningWidth', +o.w || 0, [o.id], `${o.type === 'window' ? 'Pencere' : o.type === 'door' ? 'Kapı' : 'Açıklık'} ${o.id} genişliği`);
    for (const r of l.plan.rooms || []) if (Array.isArray(r?.pts) && r.pts.length > 2) over('maxRoomArea', Math.abs(polyArea(r.pts)) / 1e4, [r.id], `Mahal ${r.name || r.id} alanı`);
  }
  over('maxLevels', L.length, [], 'Kat sayısı');
  const top = L.length ? Math.max(...L.map(l => l.z + l.h)) : 0; over('maxBuildingHeight', top, [], 'Bina yüksekliği (en üst kat üstü)');
  const area = l => { const p = outlineOf({ ...l.plan, meta: { ...root.meta, ...(l.plan.meta || {}) } }); return p ? Math.abs(polyArea(p)) / 1e4 : 0; };
  if (L[0]) over('maxFootprint', area(L[0]), [], 'Taban alanı (zemin kat dış hattı)');
  over('maxFloorArea', L.reduce((s, l) => s + area(l), 0), [], 'Toplam kat alanı (dış hatlar)');
  return out;
}
function report(conflicts, fixes, stages, scope, t0, order = []) {
  const rank = s => STAGES.indexOf(s);
  conflicts.sort((a, b) => rank(a.stage) - rank(b.stage) || (a.ids[0] || '').localeCompare(b.ids[0] || '') || a.code.localeCompare(b.code));
  const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  return { ok: !conflicts.some(c => c.severity === 'error'), conflicts, fixes, stages, order, scope: scope ? scope.size : null, ms: +(t1 - t0).toFixed(1) };
}
