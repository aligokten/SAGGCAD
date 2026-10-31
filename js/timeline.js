/* ═══ İşlem zaman çizelgesi (U1 — UniCAD FusionTimeline esinli) ═══
 * Merkezi işlem günlüğünün (bim/history.js) yatay şerit görünümü. Her kayıt bir "çip"tir; konum imleci yapılan
 * (geri alınabilir) kayıtlarla geri alınmış (yinelenebilir) kayıtları ayırır. Bir çipe tıklamak modeli o işlemden
 * hemen sonraki duruma sarar (ardışık geri al / yinele). Saf mantık burada; arayüz plan2d.js'tedir.
 * Sarma atomiktir: bir adım başarısız olursa başlangıç konumuna dönülür ve hata bildirilir.
 */

/* günlük → çipler: { n (1'den), label, kind: 'cmd' | 'diff', t, done } ve konum (yapılan kayıt sayısı) */
export function timelineItems(hist) {
  const done = hist.undo.map((e, i) => ({ n: i + 1, label: e.label || 'Düzenleme', kind: e.kind, t: e.t || 0, done: true }));
  const undone = [...hist.redo].reverse().map((e, i) => ({ n: done.length + i + 1, label: e.label || 'Düzenleme', kind: e.kind, t: e.t || 0, done: false }));
  return { items: [...done, ...undone], pos: done.length };
}

/* modeli `target` kayıt yapılmış duruma sar (0 = günlüğün başı). → { ok, steps, error? } */
export function rollTo(hist, target) {
  hist.close();
  const total = hist.undo.length + hist.redo.length, to = Math.max(0, Math.min(total, target | 0)), from = hist.undo.length;
  let steps = 0;
  try {
    while (hist.undo.length > to) { hist.step('undo'); steps++; }
    while (hist.undo.length < to) { hist.step('redo'); steps++; }
    return { ok: true, steps };
  } catch (e) {
    // başlangıca dön (geri sarılamazsa bile durum tutarlı kalır: her adım kendi içinde atomik)
    try { while (hist.undo.length > from) hist.step('undo'); while (hist.undo.length < from) hist.step('redo'); } catch { /* bildirildi */ }
    return { ok: false, steps, error: e?.message || String(e) };
  }
}
