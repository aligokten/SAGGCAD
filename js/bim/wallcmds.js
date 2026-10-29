/* ═══ BIM çekirdeği — duvar geometrisi komutları ve bağlı elemanlar (B2B-3) ═══
 * commands.js'in güvenli akışında çalışır (geçici kopya → doğrulama → tek geri alınabilir yama). Burada yalnız komutların
 * hesap mantığı vardır; S oturumu commands.js'ten gelir (S.find, S.set, S.W, S.warnings).
 *
 * Açıklık (kapı / pencere / boşluk) konum politikası — açıklığın `pos` değeri duvar başlangıcından (a) eksen boyunca:
 *   • duvarın tamamı taşınırsa (offsetWall) açıklık duvarla birlikte gider (pos değişmez)
 *   • uç taşınır / uzunluk değişirse sabit kalan uca olan uzaklık korunur (a sabitse pos aynı; b sabitse pos += ΔL)
 *   • yeni boya sığmayan açıklık varsa komut reddedilir (boyut ya da konum sessizce değiştirilmez)
 * Birleşen duvarlar: aynı noktada biten duvar uçları (V.eq, 0,5 cm) birlikte taşınır; kendi açıklıkları da aynı
 * politikayla değerlendirilir. Bir T kolunun teması koparsa uyarı verilir (kol otomatik uzatılmaz).
 * Mahaller: yalnız sınır duvarı değişen kenarlar hareket eder; kenar, duvar ekseniyle arasındaki mevcut uzaklığı koruyarak
 * duvarı izler (kullanıcının çizdiği boşluk / kalınlık ilişkisi değişmez). Diğer kenarlar yerinde kalır; köşeler komşu
 * kenar çizgilerinin kesişimidir. Değişen kenarın duvarı belirsizse (yuvası boş ve birden çok / hiç aday yoksa), kenarlar
 * paralel düşerse ya da sonuç ters döner / kendini keserse mahal değiştirilmez ve raporlanır. Mahal kimliği, adı,
 * kaplaması ve diğer alanları korunur (yalnız pts; dikdörtgen değilse `rect` bayrağı).
 */
import { V, wallLen, wallDir, wallNormal, projSeg, polyArea } from '../plan-geom.js';
import { analyzeJoins } from './joins.js';

const r2 = n => +(+n).toFixed(2);
const P2 = p => ({ x: r2(p.x), y: r2(p.y) });
const tgt = (lv, coll, id) => ({ lv, coll, id });

export function wallCommands(fail) {
  const wallRec = (S, id) => {
    const rec = S.find(id);
    if (rec.cls !== 'wall') fail(`${id} bir duvar değil`);
    if (rec.o.arc) fail(`${id} yay duvar parçası: yay duvar geometrisi bu aşamada komutla değiştirilemez (B3)`);
    return rec;
  };
  /* noktada biten duvar uçları (aynı kat) */
  const endsAt = (P, p, skip = null) => (P.walls || []).flatMap(w => (w && typeof w.id === 'string' && w !== skip) ? ['a', 'b'].filter(e => w[e] && V.eq(w[e], p)).map(e => ({ w, e })) : []);

  /* açıklıkları yeni boya göre yerleştir: anchor 'a' | 'b' — sabit kalan uç */
  function reflowOpenings(S, lv, P, w, L0, L1, anchor, errors) {
    for (const o of (P.openings || []).filter(x => x && x.wallId === w.id)) {
      const pos = anchor === 'b' ? (+o.pos || 0) + (L1 - L0) : (+o.pos || 0), half = (+o.w || 0) / 2;
      if (pos - half < -0.01 || pos + half > L1 + 0.01) { errors.push(`${o.type === 'window' ? 'Pencere' : o.type === 'door' ? 'Kapı' : 'Boşluk'} ${o.id} (${r2(o.w)} cm) duvar ${w.id}'in yeni boyuna (${r2(L1)} cm) sığmıyor`); continue; }
      if (Math.abs(pos - o.pos) > 1e-9) S.set(tgt(lv, 'openings', o.id), o, 'pos', r2(pos));
    }
  }
  /* uçları taşı: moves = [{ w, e, to }] (aynı kat). Açıklıklar ve T temasları değerlendirilir. */
  function applyMoves(S, rec, moves, summary) {
    const P = rec.P, lv = rec.t.lv, errors = [], before = analyzeJoins(P), L0 = new Map(moves.map(m => [m.w.id, wallLen(m.w)]));
    const anchorOf = new Map();
    for (const m of moves) { const k = m.w.id; anchorOf.set(k, anchorOf.has(k) ? 'none' : (m.e === 'a' ? 'b' : 'a')); }
    for (const m of moves) S.set(tgt(lv, 'walls', m.w.id), m.w, m.e, P2(m.to));
    for (const [id, anchor] of anchorOf) {
      const w = P.walls.find(x => x.id === id), L1 = wallLen(w);
      if (L1 < 1) errors.push(`Duvar ${id} uzunluğu ${r2(L1)} cm olurdu (en az 1 cm)`);
      if (anchor !== 'none') reflowOpenings(S, lv, P, w, L0.get(id), L1, anchor, errors);
      else reflowOpenings(S, lv, P, w, L0.get(id), L1, 'a', errors);
    }
    if (errors.length) fail(errors.join(' · '));
    // T temasları: önceden bu duvarlara bağlı olup kopan kollar
    const after = analyzeJoins(P), ids = new Set(anchorOf.keys());
    const tOf = G => new Set(G.joins.filter(j => j.kind === 'T' && j.members.some(m => ids.has(m.id))).map(j => j.id));
    const lost = [...tOf(before)].filter(j => !tOf(after).has(j));
    if (lost.length) S.warnings.push(`T bağlantısı koptu: ${lost.join(', ')} (kol duvarı kendiliğinden uzatılmadı)`);
    summary.walls = [...ids]; summary.lostJoins = lost;
    summary.rooms = syncRooms(S, rec, [...ids]);
    return summary;
  }

  /* mahal çokgeni: sınır duvarı değişen kenarlar duvarı izler (eksene uzaklık korunur), diğerleri yerinde kalır */
  function syncRooms(S, rec, changedIds) {
    const P = rec.P, lv = rec.t.lv, out = { updated: [], unresolved: [] }, changed = new Set(changedIds), ref = S.orig(lv);
    const refWall = id => (ref.walls || []).find(w => w && w.id === id);
    for (const room of (P.rooms || [])) {
      if (!room || !Array.isArray(room.pts) || room.pts.length < 3) continue;
      const n = room.pts.length, edges = room.pts.map((a, i) => ({ a, b: room.pts[(i + 1) % n] }));
      // kenar → sınır duvarı (önce yuva, yoksa eski geometride kenara paralel, kalınlık bandı + 2 cm içindeki en yakın duvar)
      const wallOf = edges.map(({ a, b }, i) => {
        const slot = Array.isArray(room.walls) ? room.walls[i] : null;
        if (slot && refWall(slot)) return slot;
        const m = V.lerp(a, b, 0.5), du = V.norm(V.sub(b, a));
        const c = (ref.walls || []).filter(w => w && !w.arc && typeof w.id === 'string' && Math.abs(V.dot(wallDir(w), du)) > 0.999)
          .map(w => ({ w, q: projSeg(m, w.a, w.b) })).filter(({ w, q }) => q.t > 0 && q.t < 1 && q.d <= (+w.t || +ref.meta?.wallT || 15) / 2 + 2)
          .sort((x, y) => x.q.d - y.q.d);
        return c.length && (c.length === 1 || c[1].q.d - c[0].q.d > 0.5) ? c[0].w.id : null;
      });
      const touched = wallOf.map(id => !!id && changed.has(id));
      if (!touched.some(Boolean)) {
        // yuvasız kenar değişen bir duvara yakın mıydı? (belirsiz eşleme) → rapor
        continue;
      }
      const fail1 = why => out.unresolved.push({ id: room.id, name: room.name, why });
      const lines = edges.map(({ a, b }, i) => {
        if (!touched[i]) return { p: a, u: V.norm(V.sub(b, a)) };
        const w0 = refWall(wallOf[i]), w = P.walls.find(x => x.id === wallOf[i]);
        const off = V.dot(V.sub(a, w0.a), wallNormal(w0));   // kenarın eski eksene işaretli uzaklığı
        return { p: V.add(w.a, V.mul(wallNormal(w), off)), u: wallDir(w), flip: V.dot(wallDir(w), V.sub(b, a)) < 0 };
      });
      const pts = [];
      for (let i = 0; i < n; i++) {
        const A = lines[(i - 1 + n) % n], B = lines[i], den = A.u.x * B.u.y - A.u.y * B.u.x;
        if (Math.abs(den) < 1e-9) { pts.length = 0; break; }
        const s = ((B.p.x - A.p.x) * B.u.y - (B.p.y - A.p.y) * B.u.x) / den;
        pts.push(P2(V.add(A.p, V.mul(A.u, s))));
      }
      if (pts.length !== n) { fail1('ardışık kenarlar paralel'); continue; }
      if (Math.sign(polyArea(pts)) !== Math.sign(polyArea(room.pts)) || Math.abs(polyArea(pts)) < 1) { fail1('yeni sınır ters döndü ya da alanı sıfır'); continue; }
      if (selfIntersects(pts)) { fail1('yeni sınır kendini kesiyor'); continue; }
      if (JSON.stringify(pts) === JSON.stringify(room.pts)) continue;
      S.set(tgt(lv, 'rooms', room.id), room, 'pts', pts);
      if (room.rect && !isAxisRect(pts)) S.set(tgt(lv, 'rooms', room.id), room, 'rect', undefined);
      out.updated.push(room.id);
    }
    if (out.unresolved.length) S.warnings.push(`Mahal sınırı güncellenmedi: ${out.unresolved.map(u => `${u.name || u.id} (${u.why})`).join(', ')}`);
    return out;
  }

  return {
    moveWallEnd(S, { id, end, to, connected = true }) {
      const rec = wallRec(S, id);
      if (end !== 'a' && end !== 'b') fail('Uç "a" ya da "b" olmalı');
      if (!to || !Number.isFinite(+to.x) || !Number.isFinite(+to.y)) fail('Hedef nokta geçersiz');
      const p0 = { ...rec.o[end] };
      const moves = connected ? endsAt(rec.P, p0) : [{ w: rec.o, e: end }];
      if (!moves.some(m => m.w === rec.o && m.e === end)) moves.push({ w: rec.o, e: end });
      return { label: `Duvar ${id}: ${end === 'a' ? 'başlangıç' : 'bitiş'} ucu taşındı`, summary: applyMoves(S, rec, moves.map(m => ({ ...m, to: { x: +to.x, y: +to.y } })), { op: 'moveWallEnd', id, end, connected: moves.length - 1 }) };
    },
    setWallLength(S, { id, length, anchor = 'a' }) {
      const rec = wallRec(S, id), w = rec.o;
      if (!(Number.isFinite(+length) && +length >= 1)) fail('Uzunluk en az 1 cm olmalı');
      if (anchor !== 'a' && anchor !== 'b') fail('Sabit uç "a" ya da "b" olmalı');
      const fix = w[anchor], other = anchor === 'a' ? 'b' : 'a', dir = V.norm(V.sub(w[other], fix)), to = V.add(fix, V.mul(dir, +length));
      const moves = endsAt(rec.P, { ...w[other] }); if (!moves.some(m => m.w === w)) moves.push({ w, e: other });
      return { label: `Duvar ${id}: uzunluk ${r2(length)} cm`, summary: applyMoves(S, rec, moves.map(m => ({ ...m, to })), { op: 'setWallLength', id, length: +length, anchor }) };
    },
    offsetWall(S, { id, d, connected = true }) {
      const rec = wallRec(S, id), w = rec.o;
      if (!Number.isFinite(+d) || Math.abs(+d) > 1e5) fail('Öteleme geçersiz');
      const sh = V.mul(wallNormal(w), +d), moves = [];
      for (const e of ['a', 'b']) {
        const p = { ...w[e] }, to = V.add(p, sh);
        for (const m of (connected ? endsAt(rec.P, p) : [{ w, e }])) moves.push({ ...m, to });
        if (!moves.some(m => m.w === w && m.e === e)) moves.push({ w, e, to });
      }
      // kendi açıklıkları duvarla birlikte gider (iki uç birlikte taşındığı için pos değişmez)
      return { label: `Duvar ${id}: ${r2(d)} cm ötelendi`, summary: applyMoves(S, rec, moves, { op: 'offsetWall', id, d: +d }) };
    },
    setWallReference(S, { id, ref }) {
      const rec = wallRec(S, id), v = { axis: undefined, 'face+': 1, 'face-': -1 }[ref];
      if (!['axis', 'face+', 'face-'].includes(ref)) fail('Referans "axis", "face+" ya da "face-" olmalı');
      S.set(rec.t, rec.o, 'face', v);   // yalnız referans: duvar geometrisi yerinde kalır
      return { label: `Duvar ${id}: referans ${ref === 'axis' ? 'eksen' : ref === 'face+' ? 'yüz (+)' : 'yüz (−)'}`, summary: { op: 'setWallReference', id, ref } };
    },
    setJoinEnabled(S, { id, end, enabled }) {
      const rec = wallRec(S, id);
      if (end !== 'a' && end !== 'b') fail('Uç "a" ya da "b" olmalı');
      if (typeof enabled !== 'boolean') fail('enabled evet / hayır olmalı');
      const off = new Set(Array.isArray(rec.o.joinOff) ? rec.o.joinOff : []);
      if (enabled) off.delete(end); else off.add(end);
      S.set(rec.t, rec.o, 'joinOff', off.size ? [...off].sort() : undefined);
      return { label: `Duvar ${id}: ${end === 'a' ? 'başlangıç' : 'bitiş'} ucunda otomatik birleşim ${enabled ? 'açıldı' : 'kapatıldı'}`, summary: { op: 'setJoinEnabled', id, end, enabled } };
    },
  };
}

function isAxisRect(p) { return p.length === 4 && p.every((q, i) => { const r = p[(i + 1) % 4]; return Math.abs(q.x - r.x) < 0.01 || Math.abs(q.y - r.y) < 0.01; }); }
function selfIntersects(p) {
  const n = p.length, X = (a, b, c, d) => { const o = (p1, p2, p3) => Math.sign((p2.x - p1.x) * (p3.y - p1.y) - (p2.y - p1.y) * (p3.x - p1.x)); return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0; };
  for (let i = 0; i < n; i++) for (let j = i + 2; j < n; j++) { if (i === 0 && j === n - 1) continue; if (X(p[i], p[(i + 1) % n], p[j], p[(j + 1) % n])) return true; }
  return false;
}
