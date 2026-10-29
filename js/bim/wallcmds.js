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
import { V, wallLen, wallDir, wallNormal, projSeg, polyArea, planLevels } from '../plan-geom.js';
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
    const P = rec.P, lv = rec.t.lv, out = { updated: [], unresolved: [] }, ref = S.orig(lv);
    const refWall = id => (ref.walls || []).find(w => w && w.id === id);
    // yalnız geometrisi gerçekten değişen duvarlar (aynı komut tekrar edilince mahal yeniden hesaplanmaz — idempotent)
    const moved = id => { const a = refWall(id), b = P.walls.find(x => x.id === id); return !!(a && b) && (!V.eq(a.a, b.a, 1e-6) || !V.eq(a.b, b.b, 1e-6) || (+a.t || 0) !== (+b.t || 0)); };
    const changed = new Set(changedIds.filter(moved));
    if (!changed.size) return out;
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
      if (pts.every((q, i) => Math.abs(q.x - room.pts[i].x) <= 0.02 && Math.abs(q.y - room.pts[i].y) <= 0.02)) continue;   // yuvarlama toleransı
      S.set(tgt(lv, 'rooms', room.id), room, 'pts', pts);
      if (room.rect && !isAxisRect(pts)) S.set(tgt(lv, 'rooms', room.id), room, 'rect', undefined);
      out.updated.push(room.id);
    }
    if (out.unresolved.length) S.warnings.push(`Mahal sınırı güncellenmedi: ${out.unresolved.map(u => `${u.name || u.id} (${u.why})`).join(', ')}`);
    return out;
  }

  /* ── kata bağlı geometri ──
   * Kayıtta isteğe bağlı `bimTop: { mode: 'level' | 'nextSlabTop', off }` (duvar, kolon, kiriş). Üst kot (katın ±0'ına göre):
   *   level        = kat yüksekliği + off          (üst kat döşemesinin altı; off < 0 ile altına ofset)
   *   nextSlabTop  = kat yüksekliği + üst katın döşeme kalınlığı + off   (üst kat döşemesinin üstü)
   * Değer eski alanlara yazılır (duvar h, kolon h = üst − z, kiriş z = üst − h); çizim motorları değişmeden okur.
   * Geçersiz bağ (üst kat yok, çatı katı, sıfır / negatif yükseklik) reddedilir. */
  const topOf = (S, lv, mode, off) => {
    const L = planLevels(S.W), cur = L[lv]; if (!cur) fail('Kat bulunamadı');
    if (cur.kind === 'roof') fail('Çatı planı katında kat bağı yok');
    if (mode === 'level') return cur.h + off;
    if (mode === 'nextSlabTop') { const nx = L[lv + 1]; if (!nx) fail('Üst kat yok: "üst kat döşemesi üstü" bağlantısı geçersiz'); return cur.h + nx.slab + off; }
    fail(`Geçersiz bağ türü: ${mode}`);
  };
  const BINDABLE = { wall: 1, column: 1, beam: 1 };
  function applyTop(S, rec, b) {
    const top = topOf(S, rec.t.lv, b.mode, +b.off || 0), o = rec.o, put = (k, v) => S.set(rec.t, o, k, v);
    if (rec.cls === 'wall') {
      const B = Math.min(+o.z0 || 0, 0);
      if (top - B < 1) fail(`Duvar ${o.id}: bağlı üst kot ${r2(top)} cm — yükseklik sıfır ya da negatif olur`);
      if (b.mode === 'level' && !(+b.off)) { put('h', 0); return; }   // kat yüksekliğini doğrudan izler (eski kat bağı)
      put('h', r2(top)); return;
    }
    if (rec.cls === 'column') { const h = top - (+o.z || 0); if (h < 1) fail(`Kolon ${o.id}: bağlı yükseklik ${r2(h)} cm (en az 1)`); put('h', r2(h)); return; }
    if (rec.cls === 'beam') { const z = top - (+o.h || 0); if (z < 0) fail(`Kiriş ${o.id}: alt kotu ${r2(z)} cm olur (döşemenin altına iner)`); put('z', r2(z)); }
  }
  /* katlardaki bağlı elemanları yeniden hesapla */
  function syncBindings(S, lvs) {
    let n = 0;
    for (const lv of lvs) {
      const P = S.level(lv); if (!P) continue;
      for (const coll of ['walls', 'items']) for (const o of (P[coll] || [])) {
        if (!o?.bimTop || typeof o.id !== 'string') continue;
        const cls = coll === 'walls' ? 'wall' : o.type === 'kolon' ? 'column' : o.type === 'kiris' ? 'beam' : null; if (!cls) continue;
        const n0 = S.patch.length; applyTop(S, { t: tgt(lv, coll, o.id), o, cls, P }, o.bimTop); if (S.patch.length > n0) n++;
      }
    }
    return n;
  }

  return {
    setTopBinding(S, { id, mode, offset = 0 }) {
      const rec = S.find(id);
      if (!BINDABLE[rec.cls]) fail(`${id}: kat bağı yalnız duvar, kolon ve kirişte`);
      if (!Number.isFinite(+offset) || Math.abs(+offset) > 1e4) fail('Ofset geçersiz');
      if (mode === 'fixed') {
        S.set(rec.t, rec.o, 'bimTop', undefined);
        if (rec.cls === 'wall' && !(+rec.o.h > 0)) S.set(rec.t, rec.o, 'h', r2(planLevels(S.W)[rec.t.lv]?.h || 280));   // kat yüksekliği sabit değer olarak yazılır
        return { label: `${id}: sabit yükseklik`, summary: { op: 'setTopBinding', id, mode } };
      }
      if (mode !== 'level' && mode !== 'nextSlabTop') fail(`Geçersiz bağ türü: ${mode}`);
      const b = { mode, off: r2(+offset) };
      applyTop(S, rec, b);
      S.set(rec.t, rec.o, 'bimTop', b);
      return { label: `${id}: üst kot ${mode === 'level' ? 'kat yüksekliğine' : 'üst kat döşemesi üstüne'} bağlandı${b.off ? ` (${b.off > 0 ? '+' : ''}${b.off} cm)` : ''}`, summary: { op: 'setTopBinding', id, mode, off: b.off } };
    },
    setLevelHeight(S, { level, height }) {
      const P = S.level(level); if (!P) fail('Kat bulunamadı');
      if (!(Number.isFinite(+height) && +height >= 50 && +height <= 2000)) fail('Kat yüksekliği 50–2000 cm olmalı');
      P.meta ||= {};
      S.set({ lv: level, coll: 'levelMeta', id: null }, P.meta, 'wallH', r2(+height));
      const n = syncBindings(S, [level]);
      return { label: `Kat yüksekliği ${r2(height)} cm`, summary: { op: 'setLevelHeight', level, height: +height, bound: n } };
    },
    setLevelSlab(S, { level, thickness }) {
      if (!(Number.isFinite(+thickness) && +thickness >= 0 && +thickness <= 300)) fail('Döşeme kalınlığı 0–300 cm olmalı');
      if (level === 0) S.set({ lv: -1, coll: 'meta', id: null }, S.W.meta, 'slab', r2(+thickness));
      else { const P = S.level(level); if (!P) fail('Kat bulunamadı'); S.set({ lv: level, coll: 'level', id: null }, P, 'slab', r2(+thickness)); }
      const n = level > 0 ? syncBindings(S, [level - 1]) : 0;   // alt kattaki "üst kat döşemesi üstü" bağları
      return { label: `Döşeme kalınlığı ${r2(thickness)} cm`, summary: { op: 'setLevelSlab', level, thickness: +thickness, bound: n } };
    },
    syncLevelBindings(S) {
      const n = syncBindings(S, planLevels(S.W).map(l => l.idx));
      return { label: 'Kat bağları güncellendi', summary: { op: 'syncLevelBindings', bound: n } };
    },
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
