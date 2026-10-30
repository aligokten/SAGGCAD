/* ═══ Revizyon Karşılaştırması penceresi (B4A + B4B) ═══
 * Kaynak / hedef çizim seçimi, kat ve değişiklik filtresi, özet, eleman fark listesi, safha kararı (tek / toplu),
 * elle eşleştirme önerileri, revizyon kodu, çizimde göster (revizyon katmanı), rapor (CSV / PDF) ve tadilat paftaları
 * (PDF vektörel / SVG / DXF). Karşılaştırma her açılışta kaynak ve hedeften türetilir; yalnız kullanıcı kararları
 * hedef çizimin meta.revision alanına BIM komutuyla (tek geri alınabilir işlem) yazılır.
 */
import { esc, modal, toast, downloadBlob, icon, fmtNum } from './ui.js';
import { compareDrawings, diffCsv, STATUS, PHASES } from './bim/diff.js';
import { revisionPrims, primsSvg, revisionSheet, revisionDxf, revisionPdf, newPdf, SHEET_KINDS } from './revview.js';
import { planLevels } from './plan-geom.js';

const KIND_T = { wall: 'Duvar', door: 'Kapı', window: 'Pencere', opening: 'Boşluk', room: 'Mahal', column: 'Kolon', beam: 'Kiriş', slab: 'Döşeme', stair: 'Merdiven', rail: 'Korkuluk', roof: 'Çatı', item: 'Donatı' };
const ST_CLS = { unchanged: 'st-u', geometry: 'st-g', params: 'st-p', removed: 'st-r', added: 'st-a', uncertain: 'st-x' };
const PH_CLS = { existing: 'ph-e', demolish: 'ph-d', new: 'ph-n', modify: 'ph-m' };
const levelNames = R => Object.fromEntries(planLevels(R).map(l => [l.idx === 0 ? 'L0' : l.plan.id, l.name]));
const slug = s => String(s || 'cizim').normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/ı/g, 'i').replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'cizim';
const when = t => t ? new Date(t).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' }) : '—';

/* durum (pencere açılışları arasında) */
const UI = { src: null, dst: null, level: '*', status: '*', phase: '*', overlay: 'compare', overlayFilter: 'all', sheet: 'demolition', fmt: 'pdf' };

/* ctx: { project, drawing (açık çizim), editor, settings, onShow(fn | null) } */
export function openRevision(ctx) {
  const { project: p, drawing: dw, editor: E } = ctx;
  const dws = p.drawings;
  if (dws.length < 2) { toast('Karşılaştırma için en az iki çizim gerekli — önce rölövenin kopyasından bir proje çizimi oluşturun', 'err'); return; }
  const byId = id => dws.find(d => d.id === id);
  UI.dst = byId(UI.dst)?.id || dw.id;
  UI.src = byId(UI.src) && UI.src !== UI.dst ? UI.src : (byId(byId(UI.dst)?.sourceDrawingId)?.id || (dws.find(d => d.main && d.id !== UI.dst) || dws.find(d => d.id !== UI.dst)).id);
  let R = null, el = null;
  const rootOf = d => (d.id === dw.id ? E.root : d.plan);   // açık çizim: editörün güncel kökü
  const compute = () => {
    const S = byId(UI.src), D = byId(UI.dst);
    R = compareDrawings(rootOf(S), rootOf(D));
    return R;
  };
  const editable = () => UI.dst === dw.id;
  const cmd = c => { const r = E.bimCommand(c); if (!r.ok) toast(r.errors[0], 'err'); else if (r.applied) toast(r.label); draw(); return r; };

  const body = () => {
    const S = byId(UI.src), D = byId(UI.dst), LN = { ...levelNames(rootOf(S)), ...levelNames(rootOf(D)) };
    compute();
    const lvs = [...new Set(R.entries.map(e => e.level))];
    const T = UI.level === '*' ? R.summary.total : (R.summary.levels[UI.level] || R.summary.total);
    const list = R.entries.filter(e => (UI.level === '*' || e.level === UI.level) && (UI.status === '*' ? e.status !== 'unchanged' : e.status === UI.status) && (UI.phase === '*' || e.phase === UI.phase));
    const prov = D.sourceDrawingId ? (byId(D.sourceDrawingId)
      ? `"${esc(D.name)}", "${esc(byId(D.sourceDrawingId).name)}" çiziminin kopyasından ${when(D.sourceCreatedAt)} tarihinde oluşturuldu${D.revisionLabel ? ` (${esc(D.revisionLabel)})` : ''}.`
      : `Kaynak çizim (${esc(D.sourceDrawingId)}) bu projede bulunamadı.`) : 'Hedef çizim için kayıtlı bir kaynak yok (eski ya da bağımsız çizim).';
    const stale = D.sourceDrawingId === S.id && S.updatedAt && D.sourceCreatedAt && S.updatedAt > D.sourceCreatedAt;
    const card = (t, v, cls = '') => `<div class="mh-card ${cls}"><b>${v}</b><span>${t}</span></div>`;
    const rev = rootOf(D).meta?.revision || {};
    const opt = (v, cur, t) => `<option value="${esc(v)}" ${v === cur ? 'selected' : ''}>${esc(t)}</option>`;
    const rows = list.slice(0, 400).map(e => `<tr data-key="${esc(e.key)}">
        <td>${editable() ? `<input type="checkbox" data-pick aria-label="Seç">` : ''}</td>
        <td><b>${esc(KIND_T[e.kind] || e.kind)}</b><br><small class="mono">${esc(e.srcId && e.dstId && e.srcId !== e.dstId ? `${e.srcId} → ${e.dstId}` : e.id)}</small>${e.name ? `<br><small>${esc(e.name)}</small>` : ''}</td>
        <td>${UI.level === '*' ? `<small>${esc(LN[e.level] || e.level)}</small><br>` : ''}<i class="rv-st ${ST_CLS[e.status]}">${esc(STATUS[e.status])}</i>${e.manual ? ' <i class="rv-st st-m" title="Kullanıcı eşleştirmesi">elle</i>' : ''}${e.reason ? `<br><small class="danger-t">${esc(e.reason)}</small>` : ''}${e.changes.length ? `<br><small>${esc(e.changes.slice(0, 4).map(c => c.key).join(', '))}</small>` : ''}</td>
        <td>${e.phase || e.status === 'uncertain' ? (editable() ? `<select class="inp mini" data-phase aria-label="Safha"><option value="">${e.autoPhase ? `Öneri: ${esc(PHASES[e.autoPhase])}` : '— karar verin —'}</option>${Object.entries(PHASES).map(([k, t]) => opt(k, e.decision, t)).join('')}</select>` : `<i class="rv-ph ${PH_CLS[e.phase] || ''}">${esc(PHASES[e.phase] || '—')}</i>`)
          + (e.decision ? '<br><small class="ok-t">onaylandı</small>' : e.phase ? '<br><small class="muted">otomatik öneri</small>' : '') : ''}</td>
        <td class="r nowrap">${e.before?.area !== undefined || e.after?.area !== undefined ? `<small>${fmtNum(e.before?.area ?? 0, 2)} → ${fmtNum(e.after?.area ?? 0, 2)} m²</small><br>` : ''}${e.before?.length !== undefined || e.after?.length !== undefined ? `<small>${fmtNum(e.before?.length ?? 0, 1)} → ${fmtNum(e.after?.length ?? 0, 1)} cm</small><br>` : ''}<button class="btn btn-xs btn-ghost" data-show>${icon('eye')}Göster</button></td></tr>`).join('');
    return `<div class="rv">
      <div class="rv-top">
        <label>Kaynak (mevcut durum)<select class="inp" data-src>${dws.filter(d => d.id !== UI.dst).map(d => opt(d.id, UI.src, d.name)).join('')}</select></label>
        <label>Hedef (önerilen)<select class="inp" data-dst>${dws.filter(d => d.id !== UI.src).map(d => opt(d.id, UI.dst, d.name)).join('')}</select></label>
        <label>Kat<select class="inp" data-level>${opt('*', UI.level, 'Tüm katlar')}${lvs.map(l => opt(l, UI.level, LN[l] || l)).join('')}</select></label>
        <label>Değişiklik<select class="inp" data-status>${opt('*', UI.status, 'Tüm farklar')}${Object.entries(STATUS).map(([k, t]) => opt(k, UI.status, t)).join('')}</select></label>
        <label>Safha<select class="inp" data-phasef>${opt('*', UI.phase, 'Tümü')}${Object.entries(PHASES).map(([k, t]) => opt(k, UI.phase, t)).join('')}</select></label>
        <label>Revizyon kodu<input class="inp" data-revcode value="${esc(rev.code || D.revisionLabel || '')}" maxlength="24" ${editable() ? '' : 'disabled'}></label>
      </div>
      <p class="muted small rv-prov">${prov} Karşılaştırma <b>güncel</b> kaynak ve hedef üzerinden yapılır; kaynak çizim değiştirilmez.</p>
      ${stale ? `<p class="rv-warn">${icon('alert')}Kaynak çizim, kopya alındıktan sonra değişti (${when(S.updatedAt)}). Farklar kaynağın güncel hâline göredir.</p>` : ''}
      ${!editable() ? `<p class="rv-warn">${icon('alert')}Safha kararları ve eşleştirmeler hedef çizimde saklanır. Düzenlemek için hedef çizimi açın. <button class="btn btn-xs btn-ghost" data-opendst>Hedef çizimi aç</button></p>` : ''}
      <div class="mh-grid">${card('Kaynak duvar', T.walls.source)}${card('Korunacak duvar', T.walls.kept)}${card('Önerilen kaldırma', T.walls.demolish, T.walls.demolish ? 'err' : '')}${card('Yeni duvar', T.walls.new, T.walls.new ? 'ok' : '')}${card('Değiştirilen duvar', T.walls.modify, T.walls.modify ? 'warn' : '')}${card('Kapı + / −', `${T.doors.added} / ${T.doors.removed}`)}${card('Pencere + / −', `${T.windows.added} / ${T.windows.removed}`)}${card('Karşılaştırılamayan', T.uncertain, T.uncertain ? 'err' : '')}</div>
      ${T.rooms.length ? `<details class="rv-rooms"><summary>Mahal alanı değişiklikleri (${T.rooms.length})</summary><div class="mtable">${T.rooms.map(r => `<div><span>${esc(r.name || r.id)} <small class="muted">${esc(STATUS[r.status])}</small></span><b>${r.before === null ? '—' : fmtNum(r.before, 2)} → ${r.after === null ? '—' : fmtNum(r.after, 2)} m²</b></div>`).join('')}</div></details>` : ''}
      ${R.levels.some(l => l.status !== 'unchanged') ? `<p class="rv-warn">${icon('alert')}Kat kotları farklı: ${R.levels.filter(l => l.status !== 'unchanged').map(l => `${esc(l.name)} (${l.changes.map(c => `${c.key} ${c.before}→${c.after}`).join(', ') || esc(STATUS[l.status])})`).join(' · ')}</p>` : ''}
      ${R.invalidMatches.length ? `<div class="rv-warn">${icon('alert')}Uygulanamayan eşleştirmeler:<ul>${R.invalidMatches.map(m => `<li>${esc(m.src)} → ${esc(m.dst)}: ${esc(m.reason)} ${editable() ? `<button class="btn btn-xs btn-ghost" data-unmatch="${esc(m.dst)}" data-lv="${esc(m.level)}">Kaldır</button>` : ''}</li>`).join('')}</ul></div>` : ''}
      ${R.suggestions.length ? `<details class="rv-sug" open><summary>Eşleştirme önerileri (${R.suggestions.length}) — aynı yerde, kimliği farklı elemanlar; onaylamadan eşleştirilmez</summary><div class="mtable">${R.suggestions.map(s => `<div><span>${esc(KIND_T[s.kind] || s.kind)} <code>${esc(s.src)}</code> → <code>${esc(s.dst)}</code> <small class="muted">${esc(s.why)}</small></span>${editable() ? `<button class="btn btn-xs btn-primary" data-match="${esc(s.src)}|${esc(s.dst)}|${esc(s.level)}">Eşleştir</button>` : ''}</div>`).join('')}</div></details>` : ''}
      ${editable() ? `<div class="rv-bulk"><span class="muted small">Seçilenler:</span>${Object.entries(PHASES).map(([k, t]) => `<button class="btn btn-xs btn-ghost" data-bulk="${k}"><i class="rv-ph ${PH_CLS[k]}"></i>${esc(t)}</button>`).join('')}<button class="btn btn-xs btn-ghost" data-bulk="">Öneriye döndür</button></div>` : ''}
      <div class="rv-list"><table class="mat-tbl"><thead><tr><th>${editable() ? '<input type="checkbox" data-pickall aria-label="Tümünü seç">' : ''}</th><th>Eleman</th><th>Karşılaştırma</th><th>Safha</th><th class="r">Ölçü</th></tr></thead><tbody>${rows || '<tr><td colspan="5" class="muted">Bu filtrede fark yok</td></tr>'}</tbody></table>${list.length > 400 ? `<p class="muted small">İlk 400 satır gösteriliyor (${list.length}). Tamamı CSV raporunda.</p>` : ''}</div>
      <div class="rv-foot">
        <div class="rv-g"><b>Çizimde göster</b><select class="inp mini" data-ov>${Object.entries(SHEET_KINDS).map(([k, v]) => opt(k, UI.overlay, v.t)).join('')}</select><select class="inp mini" data-ovf>${opt('all', UI.overlayFilter, 'Tüm elemanlar')}${opt('demolish', UI.overlayFilter, 'Yalnız yıkılacaklar')}${opt('new', UI.overlayFilter, 'Yalnız yeniler')}${opt('modify', UI.overlayFilter, 'Yalnız değişenler')}${opt('existing', UI.overlayFilter, 'Yalnız korunacaklar')}</select><button class="btn btn-xs btn-primary" data-overlay>${icon('eye')}Revizyon görünümü</button></div>
        <div class="rv-g"><b>Rapor</b><button class="btn btn-xs btn-ghost" data-csv>${icon('download')}CSV (Excel)</button><button class="btn btn-xs btn-ghost" data-rpdf>${icon('print')}PDF</button></div>
        <div class="rv-g"><b>Pafta</b><select class="inp mini" data-sheet>${Object.entries(SHEET_KINDS).map(([k, v]) => opt(k, UI.sheet, v.t)).join('')}</select><select class="inp mini" data-fmt>${['pdf', 'svg', 'dxf'].map(f => opt(f, UI.fmt, f.toUpperCase())).join('')}</select><button class="btn btn-xs btn-ghost" data-sheetdl>${icon('download')}İndir</button></div>
      </div>
      <p class="muted small">Sayılar eleman adedidir; imalat metrajı ya da maliyet değildir. Otomatik safhalar öneridir — yıkım kararı onaylanmadıkça kesin sayılmaz.</p>
    </div>`;
  };
  let drawing = false;   // yeniden giriş koruması: odaktaki alanın blur → change olayı çizim sırasında yeniden çizim istemesin
  const draw = () => {
    if (!el || drawing) return;
    drawing = true;
    try {
      if (el.contains(document.activeElement)) document.activeElement.blur();   // bekleyen change önce işlenir
      const sc = el.querySelector('.rv-list')?.scrollTop; el.innerHTML = body(); if (sc) el.querySelector('.rv-list').scrollTop = sc;
    } finally { drawing = false; }
  };
  const keysPicked = () => [...el.querySelectorAll('[data-pick]:checked')].map(c => c.closest('tr').dataset.key);
  const ctxNames = () => { const S = byId(UI.src), D = byId(UI.dst); return { S, D, LN: { ...levelNames(rootOf(S)), ...levelNames(rootOf(D)) } }; };
  const levelsFor = () => UI.level === '*' ? [...new Set(R.entries.map(e => e.level))] : [UI.level];
  const sheetsFor = mode => { const { S, D, LN } = ctxNames(); const rev = rootOf(D).meta?.revision || {}; const N = +(rootOf(D).meta?.scale || 50) || 50;
    return levelsFor().map(lv => revisionSheet(rootOf(S), rootOf(D), R, lv, { mode, N, project: p.name, drawing: mode === 'existing' || mode === 'demolition' ? S.name : D.name, level: LN[lv] || lv, revision: rev.code || D.revisionLabel || '', description: `${S.name} → ${D.name}`, company: ctx.settings?.company?.name || '' })); };
  // çizimde göster: editör açık çizimdeyse revizyon katmanı kurulur
  const showOverlay = (highlight = null) => {
    if (UI.dst !== dw.id && UI.src !== dw.id) { toast('Revizyon görünümü için kaynak ya da hedef çizimi açın', 'err'); return false; }
    const S = byId(UI.src), D = byId(UI.dst), mode = UI.overlay, filter = UI.overlayFilter;
    ctx.onShow?.(lvId => { const res = compareDrawings(rootOf(S), rootOf(D)); return primsSvg(revisionPrims(rootOf(S), rootOf(D), res, lvId, { mode, filter, highlight }).prims, { screen: true }); }, { mode, filter, highlight });
    return true;
  };
  modal({ title: 'Revizyon Karşılaştırması', wide: true, body: '<div class="rv-host"></div>', actions: [{ k: 'ok', t: 'Kapat', cls: 'btn-primary' }], onOpen: (b, close) => {
    el = b.querySelector('.rv-host'); draw();
    el.addEventListener('change', e => {
      const t = e.target, d = t.dataset;
      if ('src' in d) UI.src = t.value; else if ('dst' in d) UI.dst = t.value; else if ('level' in d) UI.level = t.value; else if ('status' in d) UI.status = t.value; else if ('phasef' in d) UI.phase = t.value;
      else if ('ov' in d) UI.overlay = t.value; else if ('ovf' in d) UI.overlayFilter = t.value; else if ('sheet' in d) UI.sheet = t.value; else if ('fmt' in d) UI.fmt = t.value;
      else if ('revcode' in d) return cmd({ op: 'setRevisionCode', code: t.value });
      else if ('phase' in d) return cmd({ op: 'setRevisionPhase', keys: [t.closest('tr').dataset.key], phase: t.value || null });
      else if ('pickall' in d) { el.querySelectorAll('[data-pick]').forEach(c => { c.checked = t.checked; }); return; }
      else if ('pick' in d) return;
      draw();
    });
    el.addEventListener('click', async e => {
      const b2 = e.target.closest('button'); if (!b2) return; const d = b2.dataset;
      if ('bulk' in d) { const ks = keysPicked(); if (!ks.length) return toast('Önce listeden eleman seçin'); return cmd({ op: 'setRevisionPhase', keys: ks, phase: d.bulk || null }); }
      if ('match' in d) { const [src, dst, level] = d.match.split('|'); return cmd({ op: 'matchElements', level, src, dst }); }
      if ('unmatch' in d) return cmd({ op: 'unmatchElements', level: d.lv, dst: d.unmatch });
      if ('opendst' in d) { close(null); ctx.openDrawing?.(UI.dst); return; }
      if ('show' in d) {
        const key = b2.closest('tr').dataset.key, lv = key.split('/')[0];
        if (showOverlay(key)) { close(null); ctx.goLevel?.(lv); }
        return;
      }
      if ('overlay' in d) { if (showOverlay()) close(null); return; }
      if ('csv' in d) { const { S, D, LN } = ctxNames(); downloadBlob(new Blob([diffCsv(R, { levelNames: LN })], { type: 'text/csv;charset=utf-8' }), `${slug(p.name)}-revizyon-${slug(S.name)}-${slug(D.name)}.csv`); return; }
      if ('rpdf' in d) { try { const blob = await reportPdf(R, ctxNames(), p, UI.level); downloadBlob(blob, `${slug(p.name)}-revizyon-raporu.pdf`); } catch (er) { console.error(er); toast('PDF oluşturulamadı', 'err'); } return; }
      if ('sheetdl' in d) {
        const sheets = sheetsFor(UI.sheet), base = `${slug(p.name)}-${slug(SHEET_KINDS[UI.sheet].t)}`;
        try {
          if (UI.fmt === 'pdf') { const pdf = await revisionPdf(sheets); downloadBlob(pdf.output('blob'), `${base}.pdf`); }
          else sheets.forEach((S, i) => downloadBlob(new Blob([UI.fmt === 'svg' ? S.svg : revisionDxf(S)], { type: UI.fmt === 'svg' ? 'image/svg+xml' : 'application/dxf' }), `${base}${sheets.length > 1 ? `-${i + 1}` : ''}.${UI.fmt}`));
        } catch (er) { console.error(er); toast('Pafta oluşturulamadı', 'err'); }
      }
    });
  } });
}

/* okunabilir PDF raporu (vektörel metin; kat başına özet + fark listesi) */
async function reportPdf(R, { S, D, LN }, p, level) {
  const pdf = await newPdf(210, 297);
  const TR = s => String(s ?? '').replace(/ğ/g, 'g').replace(/Ğ/g, 'G').replace(/ş/g, 's').replace(/Ş/g, 'S').replace(/ı/g, 'i').replace(/İ/g, 'I').replace(/²/g, '2');
  let y = 18;
  const line = (t, size = 9, bold = false) => { if (y > 282) { pdf.addPage([210, 297], 'p'); y = 16; } pdf.setFont('helvetica', bold ? 'bold' : 'normal'); pdf.setFontSize(size); pdf.text(TR(t), 14, y); y += size * 0.5 + 1.6; };
  line('SAGGCAD - Revizyon karsilastirma raporu', 14, true);
  line(`Proje: ${p.name}   Kaynak: ${S.name}   Hedef: ${D.name}   Tarih: ${new Date().toLocaleDateString('tr-TR')}`, 9);
  line('Sayilar eleman adedidir; imalat metraji ya da maliyet degildir.', 8);
  y += 2;
  const sumLine = (name, T) => { line(name, 11, true); line(`Duvar: kaynak ${T.walls.source}, hedef ${T.walls.target}, korunacak ${T.walls.kept}, onerilen kaldirma ${T.walls.demolish}, yeni ${T.walls.new}, degisen ${T.walls.modify}`); line(`Kapi +${T.doors.added} / -${T.doors.removed}   Pencere +${T.windows.added} / -${T.windows.removed}   Karsilastirilamayan ${T.uncertain}`); T.rooms.forEach(r => line(`  Mahal ${r.name || r.id}: ${r.before ?? '-'} -> ${r.after ?? '-'} m2 (${STATUS[r.status]})`, 8)); y += 1.5; };
  for (const [lv, T] of Object.entries(R.summary.levels)) if (level === '*' || level === lv) sumLine(LN[lv] || lv, T);
  if (level === '*') sumLine('Toplam', R.summary.total);
  line('Fark listesi', 11, true);
  R.entries.filter(e => e.status !== 'unchanged' && (level === '*' || e.level === level)).forEach(e => line(`${LN[e.level] || e.level} | ${KIND_T[e.kind] || e.kind} ${e.srcId && e.dstId && e.srcId !== e.dstId ? `${e.srcId} -> ${e.dstId}` : e.id} | ${STATUS[e.status]} | ${PHASES[e.phase] || '-'}${e.decision ? ' (onayli)' : ' (oneri)'}${e.changes.length ? ` | ${e.changes.map(c => c.key).join(', ')}` : ''}`, 8));
  return pdf.output('blob');
}
