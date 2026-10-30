/* ═══ BIM çekirdeği — rölöve ↔ proje karşılaştırma motoru (B4A) ═══
 * İki çizimin (kök plan + katlar) yapı elemanlarını karşılaştırır. SAF ve SALT OKUNUR: girdiler değiştirilmez,
 * sonuç kalıcı ikinci bir model değildir — her seferinde kaynak ve hedeften türetilir. Sonuç belirlenimci sıralıdır.
 *
 * Eşleştirme: aynı kat (kat kimliği) içinde aynı eleman kimliği. Farklı katta aynı kimlik ya da kat içinde tekrar eden
 * kimlik → "güvenle eşleştirilemeyen". Kimliği farklı ama aynı yerdeki elemanlar OTOMATİK eşleştirilmez; yalnız öneri
 * (suggestions) üretilir. Kullanıcının onayladığı eşleştirmeler hedef çizimin `meta.revision.matches` alanından okunur
 * ve doğrulanır — geçersiz olanlar uygulanmaz, `invalidMatches` içinde raporlanır.
 *
 * Durumlar: unchanged | geometry | params | removed (yalnız kaynakta) | added (yalnız hedefte) | uncertain
 * Safhalar (tadilat müdahalesi): existing | demolish | new | modify — otomatik öneri (auto) ile kullanıcı kararı
 * (`meta.revision.phases`) ayrı tutulur; etkin safha = karar || öneri.
 */
import { polyArea, planLevels } from '../plan-geom.js';

export const TOL = Object.freeze({ len: 0.5, angle: 0.1, area: 0.01 /* m² */ });
export const STATUS = Object.freeze({ unchanged: 'Değişmeyen', geometry: 'Geometrisi değişen', params: 'Parametreleri değişen', removed: 'Yalnız kaynakta', added: 'Yalnız hedefte', uncertain: 'Güvenle eşleştirilemeyen' });
export const PHASES = Object.freeze({ existing: 'Mevcut / korunacak', demolish: 'Yıkılacak / sökülecek', new: 'Yeni', modify: 'Değiştirilecek' });
const AUTO = { unchanged: 'existing', geometry: 'modify', params: 'modify', removed: 'demolish', added: 'new', uncertain: null };
const COLLS = ['walls', 'openings', 'rooms', 'items', 'slabs', 'stairs', 'rails', 'roofs'];
/* anlamsız farklar: önbellek / arayüz / zaman alanları, türetilmiş bağlar */
const IGNORE = new Set(['createdAt', 'updatedAt', 'sel', 'hover', 'cache']);
const IGNORE_BY = { rooms: new Set(['walls']) };
/* geometri alanları (sınıf başına); gerisi parametre */
const GEOM = {
  walls: ['a', 'b', 't', 'h', 'z0', 'arc', 'face'], openings: ['wallId', 'pos', 'w', 'h', 'sill'], rooms: ['pts', 'fz'],
  items: ['x', 'y', 'w', 'd', 'h', 'z', 'rot'], slabs: ['pts', 't', 'top'], stairs: ['x', 'y', 'w', 'l', 'rot', 'h', 'pts'],
  rails: ['a', 'b', 'h'], roofs: ['pts', 'base', 'pitch'],
};
export function kindOf(coll, o) {
  if (coll === 'walls') return 'wall';
  if (coll === 'openings') return o?.type === 'window' ? 'window' : o?.type === 'door' ? 'door' : 'opening';
  if (coll === 'items') return o?.type === 'kolon' ? 'column' : o?.type === 'kiris' ? 'beam' : 'item';
  return { rooms: 'room', slabs: 'slab', stairs: 'stair', rails: 'rail', roofs: 'roof' }[coll] || coll;
}
const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
/* anahtar sırasından bağımsız karşılaştırma */
const canon = v => Array.isArray(v) ? v.map(canon) : isObj(v) ? Object.fromEntries(Object.keys(v).filter(k => !k.startsWith('_') && !IGNORE.has(k)).sort().map(k => [k, canon(v[k])])) : v;
const num = v => typeof v === 'number' && Number.isFinite(v);
function sameVal(a, b, tol = TOL.len) {
  if (num(a) && num(b)) return Math.abs(a - b) <= tol;
  if (isObj(a) && isObj(b) && num(a.x) && num(b.x)) return Math.hypot(a.x - b.x, a.y - b.y) <= tol && Object.keys(a).filter(k => k !== 'x' && k !== 'y').every(k => sameVal(a[k], b[k], tol));
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => sameVal(x, b[i], tol));
  return JSON.stringify(canon(a)) === JSON.stringify(canon(b));
}
const levelsOf = R => R ? planLevels(R).map(l => ({ P: l.plan, id: l.idx === 0 ? 'L0' : l.plan?.id, idx: l.idx, name: l.name, z: l.z, h: l.h, slab: l.slab })) : [];
const levelH = (R, P) => +(P?.meta?.wallH || R?.meta?.wallH || 280);
/* karşılaştırılan alan değeri (etkin): duvar kalınlığı / yüksekliği varsayılandan */
function field(R, P, coll, o, k) {
  if (coll === 'walls' && k === 't') return +(o.t || P?.meta?.wallT || R?.meta?.wallT || 15);
  if (coll === 'walls' && k === 'h') return +(o.h || levelH(R, P));
  if (coll === 'rooms' && k === 'fz') return +(o.fz || 0);
  return o[k];
}
const len = w => (w?.a && w?.b ? Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y) : 0);
const areaM2 = pts => Array.isArray(pts) && pts.length >= 3 ? Math.abs(polyArea(pts)) / 1e4 : 0;

/* iki kayıt arasındaki farklar → { geometry: [{ key, before, after }], params: [...] } */
function changesOf(RA, PA, RB, PB, coll, a, b) {
  const G = new Set(GEOM[coll] || []), ign = IGNORE_BY[coll] || new Set(), geometry = [], params = [];
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b), ...G])].filter(k => k !== 'id' && !k.startsWith('_') && !IGNORE.has(k) && !ign.has(k)).sort();
  for (const k of keys) {
    const va = G.has(k) ? field(RA, PA, coll, a, k) : a[k], vb = G.has(k) ? field(RB, PB, coll, b, k) : b[k];
    if (va === undefined && vb === undefined) continue;
    if (sameVal(va, vb)) continue;
    (G.has(k) ? geometry : params).push({ key: k, before: va, after: vb });
  }
  return { geometry, params };
}
function metricsOf(R, P, coll, o) {
  if (!o) return null;
  if (coll === 'walls') return { length: +len(o).toFixed(2), thickness: field(R, P, coll, o, 't'), height: field(R, P, coll, o, 'h') };
  if (coll === 'rooms') return { area: +areaM2(o.pts).toFixed(3) };
  if (coll === 'slabs') return { area: +areaM2(o.pts).toFixed(3) };
  if (coll === 'openings') return { width: o.w, height: o.h };
  return null;
}

/* öneriler: aynı kat ve sınıfta, kimliği farklı ama aynı yerdeki eleman çiftleri (otomatik uygulanmaz) */
function suggest(lvId, src, dst, onlyA, onlyB) {
  const out = [];
  for (const a of onlyA) for (const b of onlyB) {
    if (a.coll !== b.coll || a.kind !== b.kind) continue;
    const A = a.o, B = b.o; let score = 0, why = '';
    if (a.coll === 'walls' && A.a && B.a) {
      const d = Math.min(Math.hypot(A.a.x - B.a.x, A.a.y - B.a.y) + Math.hypot(A.b.x - B.b.x, A.b.y - B.b.y), Math.hypot(A.a.x - B.b.x, A.a.y - B.b.y) + Math.hypot(A.b.x - B.a.x, A.b.y - B.a.y));
      if (d <= 4) { score = 1 - d / 8; why = `uçlar ${d.toFixed(1)} cm içinde`; }
    } else if (a.coll === 'rooms' && A.pts?.length > 2 && B.pts?.length > 2) {
      const c = p => p.reduce((s, q) => ({ x: s.x + q.x / p.length, y: s.y + q.y / p.length }), { x: 0, y: 0 }), ca = c(A.pts), cb = c(B.pts), d = Math.hypot(ca.x - cb.x, ca.y - cb.y);
      const ar = areaM2(A.pts), br = areaM2(B.pts);
      if (d <= 20 && Math.abs(ar - br) <= Math.max(0.05 * ar, 0.1)) { score = 0.8 - d / 100; why = `ağırlık merkezi ${d.toFixed(0)} cm, alan ${ar.toFixed(2)} → ${br.toFixed(2)} m²`; }
    } else if (a.coll === 'openings' && A.wallId === B.wallId && num(A.pos) && num(B.pos)) {
      const d = Math.abs(A.pos - B.pos); if (d <= 5 && A.type === B.type) { score = 0.9 - d / 50; why = `aynı duvarda, konum farkı ${d.toFixed(1)} cm`; }
    } else if (num(A.x) && num(B.x) && A.type === B.type) {
      const d = Math.hypot(A.x - B.x, A.y - B.y); if (d <= 5) { score = 0.9 - d / 50; why = `konum farkı ${d.toFixed(1)} cm`; }
    }
    if (score > 0) out.push({ level: lvId, kind: a.kind, src: A.id, dst: B.id, score: +score.toFixed(3), why });
  }
  // her eleman en iyi önerisiyle; eşit puanda kimlik sırası (belirlenimci)
  out.sort((x, y) => y.score - x.score || (x.src + x.dst).localeCompare(y.src + y.dst));
  const usedA = new Set(), usedB = new Set(), best = [];
  for (const s of out) { if (usedA.has(s.src) || usedB.has(s.dst)) continue; usedA.add(s.src); usedB.add(s.dst); best.push(s); }
  return best;
}

/* ── karşılaştırma ── src, dst: çizim kökleri; revision: hedef çizimin meta.revision (isteğe bağlı) */
export function compareDrawings(src, dst, { revision = dst?.meta?.revision || null } = {}) {
  const LA = levelsOf(src), LB = levelsOf(dst), entries = [], invalidMatches = [], suggestions = [], levelEntries = [];
  const decisions = isObj(revision?.phases) ? revision.phases : {};
  const matches = Array.isArray(revision?.matches) ? revision.matches : [];
  // kat başına kimlik dizini (tekrar eden kimlik ve katlar arası kimlik denetimi için)
  const index = Ls => { const m = new Map(); Ls.forEach(L => COLLS.forEach(coll => (Array.isArray(L.P?.[coll]) ? L.P[coll] : []).forEach(o => { if (o && typeof o.id === 'string') (m.get(o.id) || m.set(o.id, []).get(o.id)).push({ L, coll, o }); }))); return m; };
  const IA = index(LA), IB = index(LB);
  const lvIds = [...new Set([...LA.map(l => l.id), ...LB.map(l => l.id)])].filter(Boolean);
  for (const lvId of lvIds) {
    const la = LA.find(l => l.id === lvId), lb = LB.find(l => l.id === lvId);
    // kat kotları
    if (la && lb) {
      const ka = { z: la.z, h: la.h, slab: la.slab }, kb = { z: lb.z, h: lb.h, slab: lb.slab };
      const ch = Object.keys(ka).filter(k => !sameVal(ka[k], kb[k])).map(k => ({ key: k, before: ka[k], after: kb[k] }));
      levelEntries.push({ level: lvId, name: lb.name, status: ch.length ? 'geometry' : 'unchanged', changes: ch });
    } else levelEntries.push({ level: lvId, name: (lb || la).name, status: lb ? 'added' : 'removed', changes: [] });
    const onlyA = [], onlyB = [];
    const listA = la ? COLLS.flatMap(coll => (Array.isArray(la.P?.[coll]) ? la.P[coll] : []).filter(o => o && typeof o.id === 'string').map(o => ({ coll, o, kind: kindOf(coll, o) }))) : [];
    const listB = lb ? COLLS.flatMap(coll => (Array.isArray(lb.P?.[coll]) ? lb.P[coll] : []).filter(o => o && typeof o.id === 'string').map(o => ({ coll, o, kind: kindOf(coll, o) }))) : [];
    const byB = new Map(); listB.forEach(x => (byB.get(x.o.id) || byB.set(x.o.id, []).get(x.o.id)).push(x));
    const seenB = new Set();
    for (const a of listA) {
      const id = a.o.id, here = byB.get(id) || [];
      const dupA = (IA.get(id) || []).length > 1, dupB = (IB.get(id) || []).length > 1;
      const otherLevelB = (IB.get(id) || []).some(x => x.L.id !== lvId), otherLevelA = (IA.get(id) || []).some(x => x.L.id !== lvId);
      if (dupA || here.length > 1 || (!here.length && otherLevelB) || (here.length && here[0].coll !== a.coll)) {
        entries.push(entry('uncertain', lvId, a, here[0] || null, src, la, dst, lb, { reason: here.length && here[0].coll !== a.coll ? 'aynı kimlik farklı eleman sınıfında' : dupA || here.length > 1 ? 'kimlik tekrar ediyor' : 'aynı kimlik başka katta' }));
        here.forEach(b => seenB.add(b)); continue;
      }
      if (!here.length) { onlyA.push(a); continue; }
      const b = here[0]; seenB.add(b);
      if (dupB || otherLevelA) { entries.push(entry('uncertain', lvId, a, b, src, la, dst, lb, { reason: 'kimlik tekrar ediyor' })); continue; }
      entries.push(pairEntry(lvId, a, b, src, la, dst, lb, false));
    }
    for (const b of listB) {
      if (seenB.has(b)) continue;
      const otherLevelA = (IA.get(b.o.id) || []).some(x => x.L.id !== lvId), dupB = (IB.get(b.o.id) || []).length > 1;
      if (otherLevelA || dupB) { entries.push(entry('uncertain', lvId, null, b, src, la, dst, lb, { reason: dupB ? 'kimlik tekrar ediyor' : 'aynı kimlik başka katta' })); continue; }
      onlyB.push(b);
    }
    // kullanıcı eşleştirmeleri (doğrulanır)
    for (const m of matches.filter(m => m && (m.level ?? 'L0') === lvId)) {
      const a = onlyA.find(x => x.o.id === m.src), b = onlyB.find(x => x.o.id === m.dst);
      const why = !a ? `kaynak eleman ${m.src} bu katta eşleşmemiş olarak yok` : !b ? `hedef eleman ${m.dst} bu katta eşleşmemiş olarak yok` : a.coll !== b.coll || a.kind !== b.kind ? `eleman sınıfları farklı (${a.kind} ↔ ${b.kind})` : null;
      if (why) { invalidMatches.push({ ...m, level: lvId, reason: why }); continue; }
      onlyA.splice(onlyA.indexOf(a), 1); onlyB.splice(onlyB.indexOf(b), 1);
      entries.push(pairEntry(lvId, a, b, src, la, dst, lb, true));
    }
    suggestions.push(...suggest(lvId, src, dst, onlyA, onlyB));
    onlyA.forEach(a => entries.push(entry('removed', lvId, a, null, src, la, dst, lb)));
    onlyB.forEach(b => entries.push(entry('added', lvId, null, b, src, la, dst, lb)));
  }
  for (const m of matches.filter(m => m && !lvIds.includes(m.level ?? 'L0'))) invalidMatches.push({ ...m, reason: 'kat bulunamadı' });
  // safhalar: öneri + karar
  for (const e of entries) {
    e.autoPhase = AUTO[e.status];
    const d = decisions[e.key];
    e.decision = d && PHASES[d] ? d : null;
    e.phase = e.decision || e.autoPhase;
  }
  const order = ['L0', ...LB.slice(1).map(l => l.id), ...LA.slice(1).map(l => l.id)];
  const rank = id => { const i = order.indexOf(id); return i < 0 ? 999 : i; };
  entries.sort((x, y) => rank(x.level) - rank(y.level) || COLLS.indexOf(x.coll) - COLLS.indexOf(y.coll) || x.key.localeCompare(y.key));
  const unknownDecisions = Object.keys(decisions).filter(k => !entries.some(e => e.key === k)).sort();
  return { entries, levels: levelEntries, suggestions, invalidMatches, unknownDecisions, summary: summarize(entries, levelEntries) };
}
function pairEntry(lvId, a, b, src, la, dst, lb, manual) {
  const ch = changesOf(src, la.P, dst, lb.P, a.coll, a.o, b.o);
  const status = ch.geometry.length ? 'geometry' : ch.params.length ? 'params' : 'unchanged';
  return entry(status, lvId, a, b, src, la, dst, lb, { changes: [...ch.geometry, ...ch.params], geometryKeys: ch.geometry.map(c => c.key), manual });
}
function entry(status, level, a, b, src, la, dst, lb, extra = {}) {
  const x = b || a, id = (b || a).o.id;
  return {
    key: `${level}/${id}`, level, status, coll: x.coll, kind: x.kind, id, srcId: a?.o.id ?? null, dstId: b?.o.id ?? null,
    name: b?.o.name || a?.o.name || null, before: a ? metricsOf(src, la?.P, a.coll, a.o) : null, after: b ? metricsOf(dst, lb?.P, b.coll, b.o) : null,
    changes: [], geometryKeys: [], manual: false, ...extra,
  };
}

/* özet: kat başına ve toplam (etkin safhalarla; kaba sayım — metraj değildir) */
export function summarize(entries, levels = []) {
  const blank = () => ({ walls: { source: 0, target: 0, kept: 0, demolish: 0, new: 0, modify: 0 }, doors: { added: 0, removed: 0 }, windows: { added: 0, removed: 0 }, openings: { added: 0, removed: 0 }, rooms: [], uncertain: 0, byStatus: Object.fromEntries(Object.keys(STATUS).map(k => [k, 0])), byPhase: Object.fromEntries(Object.keys(PHASES).map(k => [k, 0])) });
  const per = new Map(), total = blank();
  for (const e of entries) {
    const S = per.get(e.level) || per.set(e.level, blank()).get(e.level);
    for (const T of [S, total]) {
      T.byStatus[e.status]++; if (e.phase) T.byPhase[e.phase]++;
      if (e.status === 'uncertain') T.uncertain++;
      if (e.kind === 'wall') {
        if (e.srcId) T.walls.source++; if (e.dstId) T.walls.target++;
        if (e.phase === 'existing') T.walls.kept++; else if (e.phase) T.walls[e.phase]++;
      }
      const grp = e.kind === 'door' ? 'doors' : e.kind === 'window' ? 'windows' : e.kind === 'opening' ? 'openings' : null;
      if (grp && (e.status === 'added' || e.status === 'removed')) T[grp][e.status]++;
      if (e.kind === 'room' && e.status !== 'unchanged') T.rooms.push({ level: e.level, id: e.id, name: e.name, before: e.before?.area ?? null, after: e.after?.area ?? null, status: e.status });
    }
  }
  return { total, levels: Object.fromEntries([...per].sort(([a], [b]) => (a === 'L0' ? -1 : b === 'L0' ? 1 : a.localeCompare(b)))), levelChanges: levels.filter(l => l.status !== 'unchanged') };
}

/* ── rapor: CSV (Excel uyumlu: UTF-8 BOM, noktalı virgül, ondalık virgül) ── */
export function diffCsv(result, { levelNames = {} } = {}) {
  const q = v => { const s = v === null || v === undefined ? '' : typeof v === 'number' ? String(+v.toFixed(3)).replace('.', ',') : String(v); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const rows = [['Kat', 'Sınıf', 'Kimlik (kaynak)', 'Kimlik (hedef)', 'Ad', 'Karşılaştırma', 'Önerilen safha', 'Karar', 'Etkin safha', 'Elle eşleştirme', 'Değişen alanlar', 'Önce', 'Sonra', 'Not']];
  for (const e of result.entries) rows.push([levelNames[e.level] || e.level, e.kind, e.srcId, e.dstId, e.name, STATUS[e.status], PHASES[e.autoPhase] || '', e.decision ? PHASES[e.decision] : '', PHASES[e.phase] || '', e.manual ? 'evet' : '', e.changes.map(c => c.key).join(', '), e.before ? JSON.stringify(e.before) : '', e.after ? JSON.stringify(e.after) : '', e.reason || '']);
  rows.push([]); rows.push(['ÖZET', 'Kapsam', 'Kaynak duvar', 'Hedef duvar', 'Korunacak', 'Önerilen kaldırma', 'Yeni duvar', 'Değiştirilen', 'Eklenen kapı', 'Kaldırılan kapı', 'Eklenen pencere', 'Kaldırılan pencere', 'Karşılaştırılamayan']);
  const line = (name, T) => ['ÖZET', name, T.walls.source, T.walls.target, T.walls.kept, T.walls.demolish, T.walls.new, T.walls.modify, T.doors.added, T.doors.removed, T.windows.added, T.windows.removed, T.uncertain];
  for (const [lv, T] of Object.entries(result.summary.levels)) rows.push(line(levelNames[lv] || lv, T));
  rows.push(line('Toplam', result.summary.total));
  rows.push([]); rows.push(['Not: sayılar eleman adedidir; imalat metrajı ya da maliyet değildir (B4C).']);
  return '﻿' + rows.map(r => r.map(q).join(';')).join('\r\n') + '\r\n';
}
