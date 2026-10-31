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
import { quantityDiff, aggregate, costOf, qtyCsv, METHODS } from './bim/qtydiff.js';
import { CATS, OPENING_POLICIES, DEFAULT_POLICY } from './bim/quantities.js';

const KIND_T = { wall: 'Duvar', door: 'Kapı', window: 'Pencere', opening: 'Boşluk', room: 'Mahal', column: 'Kolon', beam: 'Kiriş', slab: 'Döşeme', stair: 'Merdiven', rail: 'Korkuluk', roof: 'Çatı', item: 'Donatı' };
const ST_CLS = { unchanged: 'st-u', geometry: 'st-g', params: 'st-p', removed: 'st-r', added: 'st-a', uncertain: 'st-x' };
const PH_CLS = { existing: 'ph-e', demolish: 'ph-d', new: 'ph-n', modify: 'ph-m' };
const levelNames = R => Object.fromEntries(planLevels(R).map(l => [l.idx === 0 ? 'L0' : l.plan.id, l.name]));
const slug = s => String(s || 'cizim').normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/ı/g, 'i').replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'cizim';
const when = t => t ? new Date(t).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' }) : '—';

/* durum (pencere açılışları arasında) */
const UI = { src: null, dst: null, level: '*', status: '*', phase: '*', overlay: 'compare', overlayFilter: 'all', sheet: 'demolition', fmt: 'pdf', tab: 'el', q: { room: '*', material: '*', cls: '*', category: '*', group: 'category' } };

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
          + (e.decision ? '<br><small class="ok-t">onaylandı</small>' : e.phase ? '<br><small class="muted">otomatik öneri</small>' : '')
          + (e.phase === 'modify' ? (editable() ? `<br><select class="inp mini" data-method aria-label="Müdahale yöntemi"><option value="">Müdahale: karar yok</option>${Object.entries(METHODS).filter(([k]) => k !== 'undecided').map(([k, t]) => opt(k, rev.methods?.[e.key] || '', t)).join('')}</select>` : `<br><small>${esc(METHODS[rev.methods?.[e.key]] || 'Müdahale kararı yok')}</small>`) : '') : ''}</td>
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
      <div class="seg rv-tabs" role="tablist"><button data-tab="el" class="${UI.tab === 'el' ? 'on' : ''}" role="tab">Elemanlar</button><button data-tab="qty" class="${UI.tab === 'qty' ? 'on' : ''}" role="tab">Metraj Farkı</button></div>
      ${UI.tab === 'qty' ? qtyPart(S, D, LN) : `<div class="mh-grid">${card('Kaynak duvar', T.walls.source)}${card('Korunacak duvar', T.walls.kept)}${card('Önerilen kaldırma', T.walls.demolish, T.walls.demolish ? 'err' : '')}${card('Yeni duvar', T.walls.new, T.walls.new ? 'ok' : '')}${card('Değiştirilen duvar', T.walls.modify, T.walls.modify ? 'warn' : '')}${card('Kapı + / −', `${T.doors.added} / ${T.doors.removed}`)}${card('Pencere + / −', `${T.windows.added} / ${T.windows.removed}`)}${card('Karşılaştırılamayan', T.uncertain, T.uncertain ? 'err' : '')}</div>
      ${T.rooms.length ? `<details class="rv-rooms"><summary>Mahal alanı değişiklikleri (${T.rooms.length})</summary><div class="mtable">${T.rooms.map(r => `<div><span>${esc(r.name || r.id)} <small class="muted">${esc(STATUS[r.status])}</small></span><b>${r.before === null ? '—' : fmtNum(r.before, 2)} → ${r.after === null ? '—' : fmtNum(r.after, 2)} m²</b></div>`).join('')}</div></details>` : ''}
      ${R.levels.some(l => l.status !== 'unchanged') ? `<p class="rv-warn">${icon('alert')}Kat kotları farklı: ${R.levels.filter(l => l.status !== 'unchanged').map(l => `${esc(l.name)} (${l.changes.map(c => `${c.key} ${c.before}→${c.after}`).join(', ') || esc(STATUS[l.status])})`).join(' · ')}</p>` : ''}
      ${R.invalidMatches.length ? `<div class="rv-warn">${icon('alert')}Uygulanamayan eşleştirmeler:<ul>${R.invalidMatches.map(m => `<li>${esc(m.src)} → ${esc(m.dst)}: ${esc(m.reason)} ${editable() ? `<button class="btn btn-xs btn-ghost" data-unmatch="${esc(m.dst)}" data-lv="${esc(m.level)}">Kaldır</button>` : ''}</li>`).join('')}</ul></div>` : ''}
      ${R.suggestions.length ? `<details class="rv-sug" open><summary>Eşleştirme önerileri (${R.suggestions.length}) — aynı yerde, kimliği farklı elemanlar; onaylamadan eşleştirilmez</summary><div class="mtable">${R.suggestions.map(s => `<div><span>${esc(KIND_T[s.kind] || s.kind)} <code>${esc(s.src)}</code> → <code>${esc(s.dst)}</code> <small class="muted">${esc(s.why)}</small></span>${editable() ? `<button class="btn btn-xs btn-primary" data-match="${esc(s.src)}|${esc(s.dst)}|${esc(s.level)}">Eşleştir</button>` : ''}</div>`).join('')}</div></details>` : ''}
      ${editable() ? `<div class="rv-bulk"><span class="muted small">Seçilenler:</span>${Object.entries(PHASES).map(([k, t]) => `<button class="btn btn-xs btn-ghost" data-bulk="${k}"><i class="rv-ph ${PH_CLS[k]}"></i>${esc(t)}</button>`).join('')}<button class="btn btn-xs btn-ghost" data-bulk="">Öneriye döndür</button></div>` : ''}
      <div class="rv-list"><table class="mat-tbl"><thead><tr><th>${editable() ? '<input type="checkbox" data-pickall aria-label="Tümünü seç">' : ''}</th><th>Eleman</th><th>Karşılaştırma</th><th>Safha</th><th class="r">Ölçü</th></tr></thead><tbody>${rows || '<tr><td colspan="5" class="muted">Bu filtrede fark yok</td></tr>'}</tbody></table>${list.length > 400 ? `<p class="muted small">İlk 400 satır gösteriliyor (${list.length}). Tamamı CSV raporunda.</p>` : ''}</div>`}
      <div class="rv-foot">
        <div class="rv-g"><b>Çizimde göster</b><select class="inp mini" data-ov>${Object.entries(SHEET_KINDS).map(([k, v]) => opt(k, UI.overlay, v.t)).join('')}</select><select class="inp mini" data-ovf>${opt('all', UI.overlayFilter, 'Tüm elemanlar')}${opt('demolish', UI.overlayFilter, 'Yalnız yıkılacaklar')}${opt('new', UI.overlayFilter, 'Yalnız yeniler')}${opt('modify', UI.overlayFilter, 'Yalnız değişenler')}${opt('existing', UI.overlayFilter, 'Yalnız korunacaklar')}</select><button class="btn btn-xs btn-primary" data-overlay>${icon('eye')}Revizyon görünümü</button></div>
        <div class="rv-g"><b>Rapor</b><button class="btn btn-xs btn-ghost" data-csv>${icon('download')}CSV (Excel)</button><button class="btn btn-xs btn-ghost" data-rpdf>${icon('print')}PDF</button></div>
        <div class="rv-g"><b>Pafta</b><select class="inp mini" data-sheet>${Object.entries(SHEET_KINDS).map(([k, v]) => opt(k, UI.sheet, v.t)).join('')}</select><select class="inp mini" data-fmt>${['pdf', 'svg', 'dxf'].map(f => opt(f, UI.fmt, f.toUpperCase())).join('')}</select><button class="btn btn-xs btn-ghost" data-sheetdl>${icon('download')}İndir</button></div>
      </div>
      <p class="muted small">Sayılar eleman adedidir; imalat metrajı ya da maliyet değildir. Otomatik safhalar öneridir — yıkım kararı onaylanmadıkça kesin sayılmaz.</p>
    </div>`;
  };
  /* ── Metraj Farkı sekmesi ── */
  let QD = null;
  const fmt = (v, d = 2) => v === null || v === undefined ? '—' : (+v).toLocaleString('tr-TR', { minimumFractionDigits: d, maximumFractionDigits: d });
  const sgn = v => (v > 5e-10 ? '+' : '') + fmt(v);
  const qtyPart = (S, D, LN) => {
    const opt = (v, cur, t) => `<option value="${esc(v)}" ${v === cur ? 'selected' : ''}>${esc(t)}</option>`;
    QD = quantityDiff(rootOf(S), rootOf(D), { compare: R });
    const rev = rootOf(D).meta?.revision || {}, qs = rev.qty || {}, prices = qs.prices || {}, cur = qs.currency || 'TRY', vat = qs.vat || 'excl', pol = { ...DEFAULT_POLICY, ...qs };
    const F = { level: UI.level, phase: UI.phase, ...UI.q, groupBy: UI.q.group };
    const agg = aggregate(QD.lines, F);
    const opts = (k, f) => [...new Set(QD.lines.flatMap(l => (k === 'rooms' ? l.rooms : [l[k]])).filter(Boolean))].sort().map(v => opt(v, UI.q[f], f === 'category' ? (CATS[v] || v) : f === 'room' ? roomName(v) : v)).join('');
    const roomName = id => { for (const Rt of [rootOf(D), rootOf(S)]) for (const l of planLevels(Rt)) { const r = (l.plan.rooms || []).find(x => x.id === id); if (r) return r.name || id; } return id; };
    let grand = 0, grandMissing = false;
    const body = agg.groups.map(g => {
      let gs = 0, gm = false;
      const rows = g.rows.map(r => {
        const c = costOf(r, prices); gs += c.amount; gm ||= c.missing;
        const flag = r.unknown ? `<i class="rv-st st-x" title="${r.unknown} eleman hesaplanamadı — manuel kontrol">hesaplanamadı ${r.unknown}</i>` : r.warning ? `<i class="rv-st st-g" title="${r.warning} uyarılı satır">uyarı</i>` : '';
        const pIn = (kind, v) => editable() ? `<input class="inp mini rv-price" type="number" min="0" step="0.01" inputmode="decimal" data-price="${esc(r.item)}" data-pk="${kind}" value="${Number.isFinite(v) ? v : ''}" placeholder="—" aria-label="${kind === 'build' ? 'İmalat' : 'Söküm'} birim fiyatı">` : (Number.isFinite(v) ? fmt(v) : '—');
        return `<tr data-keys="${esc(r.keys.join(' '))}"><td><button class="link" data-qshow title="Çizimde göster">${esc(r.label)}</button> ${flag}${r.pending ? ` <i class="rv-st" title="Karar bekleyen eleman">${r.pending} onay bekliyor</i>` : ''}</td><td>${esc(r.unit)}</td>
          <td class="r">${fmt(r.before)}</td><td class="r">${fmt(r.after)}</td><td class="r ${r.net < -5e-10 ? 'danger-t' : r.net > 5e-10 ? 'ok-t' : ''}">${sgn(r.net)}</td><td class="r">${fmt(r.demolish)}</td><td class="r">${fmt(r.build)}</td>
          <td class="r muted">${r.demolishPending || r.buildPending ? `${fmt(r.demolishPending)} / ${fmt(r.buildPending)}` : ''}</td>
          <td class="r nowrap">${pIn('build', prices[`${r.item}|build`])} ${pIn('demolish', prices[`${r.item}|demolish`])}</td><td class="r">${r.build > 0 || r.demolish > 0 ? (c.missing ? `<small class="muted">fiyat girilmedi</small>${c.amount ? `<br>${fmt(c.amount)}` : ''}` : fmt(c.amount)) : ''}</td></tr>`;
      }).join('');
      grand += gs; grandMissing ||= gm;
      const tot = g.totals.map(t => `<tr class="rv-tot"><td>Toplam ${esc(t.label)}</td><td>${esc(t.unit)}</td><td class="r">${fmt(t.before)}</td><td class="r">${fmt(t.after)}</td><td class="r">${sgn(t.net)}</td><td class="r">${fmt(t.demolish)}</td><td class="r">${fmt(t.build)}</td><td></td><td></td><td></td></tr>`).join('') + (gs || gm ? `<tr class="rv-tot"><td colspan="9">${esc(g.title)} tutarı</td><td class="r">${fmt(gs)}${gm ? ' *' : ''}</td></tr>` : '');
      return `<tr class="rv-gh"><td colspan="10">${esc(g.title)}</td></tr>${rows}${tot}`;
    }).join('');
    const unknownEls = QD.qa.elements.concat(QD.qb.elements).filter(e => e.status === 'unknown');
    return `<div class="rv-qf">
        <label>Mahal<select class="inp mini" data-qf="room">${opt('*', UI.q.room, 'Tümü')}${opts('rooms', 'room')}</select></label>
        <label>Malzeme<select class="inp mini" data-qf="material">${opt('*', UI.q.material, 'Tümü')}${opts('material', 'material')}</select></label>
        <label>Eleman<select class="inp mini" data-qf="cls">${opt('*', UI.q.cls, 'Tümü')}${opts('cls', 'cls')}</select></label>
        <label>Kategori<select class="inp mini" data-qf="category">${opt('*', UI.q.category, 'Tümü')}${opts('category', 'category')}</select></label>
        <label>Grupla<select class="inp mini" data-qf="group">${opt('category', UI.q.group, 'İmalat kategorisi')}${opt('material', UI.q.group, 'Malzeme')}${opt('none', UI.q.group, 'Gruplama yok')}</select></label>
        <label>Açıklık düşümü<select class="inp mini" data-qset="openings" ${editable() ? '' : 'disabled'}>${Object.entries(OPENING_POLICIES).map(([k, t]) => opt(k, pol.openings, t)).join('')}</select></label>
        ${pol.openings === 'over' ? `<label>Eşik (m²)<input class="inp mini" type="number" step="0.05" min="0" data-qset="threshold" value="${pol.threshold}" ${editable() ? '' : 'disabled'}></label>` : ''}
        <label>Para birimi<input class="inp mini" data-qset="currency" value="${esc(cur)}" maxlength="3" ${editable() ? '' : 'disabled'}></label>
        <label>KDV<select class="inp mini" data-qset="vat" ${editable() ? '' : 'disabled'}>${opt('excl', vat, 'Fiyatlar KDV hariç')}${opt('incl', vat, 'Fiyatlar KDV dahil')}</select></label>
      </div>
      ${QD.pending.length ? `<p class="rv-warn">${icon('alert')}${QD.pending.length} eleman için karar bekleniyor (safha onayı / müdahale yöntemi). Bunların miktarları kesin söküm ve yeni imalat toplamlarına girmez; "Onay bekleyen" sütununda tahmin olarak görünür.</p>` : ''}
      ${unknownEls.length ? `<p class="rv-warn">${icon('alert')}${unknownEls.length} eleman için metraj hesaplanamadı (manuel kontrol gerekli): ${unknownEls.slice(0, 6).map(e => `<code>${esc(e.element)}</code> ${esc(e.q.note || '')}`).join(' · ')}</p>` : ''}
      <div class="rv-list rv-qty"><table class="mat-tbl"><thead><tr><th>İmalat</th><th>Birim</th><th class="r">Mevcut</th><th class="r">Yeni</th><th class="r">Net fark</th><th class="r">Söküm</th><th class="r">Yeni imalat</th><th class="r" title="Onaysız: söküm / imalat tahmini">Onay bekleyen</th><th class="r">Birim fiyat (${esc(cur)})<br><small>imalat / söküm</small></th><th class="r">Tutar (${esc(cur)})</th></tr></thead>
        <tbody>${body || '<tr><td colspan="10" class="muted">Bu filtrede metraj yok</td></tr>'}</tbody>
        <tfoot><tr class="rv-tot"><td colspan="9">Genel toplam tutar (KDV ${vat === 'incl' ? 'dahil' : 'hariç'})</td><td class="r">${grand || grandMissing ? `${fmt(grand)}${grandMissing ? ' *' : ''}` : '—'}</td></tr></tfoot></table></div>
      <p class="muted small">Miktarlar BIM modelinden (B2B birleşim temizliği sonrası katman geometrisi) hesaplanır; tam hassasiyetle toplanır, yalnız gösterimde yuvarlanır. Net fark geometriktir; söküm ve yeni imalat yalnız onaylı kararları içerir. Fiyatlar yalnız kullanıcı girişidir${grandMissing ? '; * eksik fiyatlı kalem var — tutar eksik' : ''}.</p>
      <div class="rv-foot"><div class="rv-g"><b>Metraj</b><button class="btn btn-xs btn-ghost" data-qcsv>${icon('download')}CSV (Excel)</button><button class="btn btn-xs btn-ghost" data-qpdf>${icon('print')}PDF rapor</button></div></div>`;
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
      else if ('method' in d) return cmd({ op: 'setInterventionMethod', keys: [t.closest('tr').dataset.key], method: t.value || null });
      else if ('qf' in d) UI.q[d.qf] = t.value;
      else if ('qset' in d) return cmd({ op: 'setQtySettings', [d.qset]: d.qset === 'threshold' ? +t.value : d.qset === 'currency' ? t.value.toUpperCase() : t.value });
      else if ('price' in d) return cmd({ op: 'setQtyPrice', item: d.price, kind: d.pk, price: t.value === '' ? null : +t.value });
      else if ('phase' in d) return cmd({ op: 'setRevisionPhase', keys: [t.closest('tr').dataset.key], phase: t.value || null });
      else if ('pickall' in d) { el.querySelectorAll('[data-pick]').forEach(c => { c.checked = t.checked; }); return; }
      else if ('pick' in d) return;
      draw();
    });
    el.addEventListener('click', async e => {
      const b2 = e.target.closest('button'); if (!b2) return; const d = b2.dataset;
      if ('tab' in d) { UI.tab = d.tab; draw(); return; }
      if ('qshow' in d) { const keys = b2.closest('tr').dataset.keys.split(' ').filter(Boolean); const lv = keys[0]?.split('/')[0]; if (keys.length && showOverlay(keys)) { close(null); ctx.goLevel?.(lv); } return; }
      if ('qcsv' in d) { const { S, D } = ctxNames(); const qs = rootOf(D).meta?.revision?.qty || {}; downloadBlob(new Blob([qtyCsv(aggregate(QD.lines, { level: UI.level, phase: UI.phase, ...UI.q, groupBy: UI.q.group }), { prices: qs.prices || {}, currency: qs.currency || 'TRY', vat: qs.vat || 'excl', title: `${p.name} — ${S.name} → ${D.name} — metraj farkı` })], { type: 'text/csv;charset=utf-8' }), `${slug(p.name)}-metraj-farki.csv`); return; }
      if ('qpdf' in d) { try { const { S, D, LN } = ctxNames(); const r = await qtyPdf({ QD, UI, p, S, D, LN, rev: rootOf(D).meta?.revision || {}, company: ctx.settings?.company?.name || '' }); if (r.lossy) toast('PDF yazı tipi gömülemedi: Türkçe karakterler ASCII karşılıklarıyla yazıldı', 'err'); downloadBlob(r.blob, `${slug(p.name)}-metraj-raporu.pdf`); } catch (er) { console.error(er); toast('PDF oluşturulamadı', 'err'); } return; }
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
  let y = 18;
  const line = (t, size = 9, bold = false) => { if (y > 282) { pdf.addPage([210, 297], 'p'); y = 16; } pdf.setFont(pdf.font.family, bold ? 'bold' : 'normal'); pdf.setFontSize(size); pdf.text(pdf.font.text(t), 14, y); y += size * 0.5 + 1.6; };
  line('SAGGCAD — Revizyon karşılaştırma raporu', 14, true);
  line(`Proje: ${p.name}   Kaynak: ${S.name}   Hedef: ${D.name}   Tarih: ${new Date().toLocaleDateString('tr-TR')}`, 9);
  line('Sayılar eleman adedidir; imalat metrajı ya da maliyet değildir.', 8);
  y += 2;
  const sumLine = (name, T) => { line(name, 11, true); line(`Duvar: kaynak ${T.walls.source}, hedef ${T.walls.target}, korunacak ${T.walls.kept}, önerilen kaldırma ${T.walls.demolish}, yeni ${T.walls.new}, değişen ${T.walls.modify}`); line(`Kapı +${T.doors.added} / -${T.doors.removed}   Pencere +${T.windows.added} / -${T.windows.removed}   Karşılaştırılamayan ${T.uncertain}`); T.rooms.forEach(r => line(`  Mahal ${r.name || r.id}: ${r.before ?? '-'} → ${r.after ?? '-'} m² (${STATUS[r.status]})`, 8)); y += 1.5; };
  for (const [lv, T] of Object.entries(R.summary.levels)) if (level === '*' || level === lv) sumLine(LN[lv] || lv, T);
  if (level === '*') sumLine('Toplam', R.summary.total);
  line('Fark listesi', 11, true);
  R.entries.filter(e => e.status !== 'unchanged' && (level === '*' || e.level === level)).forEach(e => line(`${LN[e.level] || e.level} | ${KIND_T[e.kind] || e.kind} ${e.srcId && e.dstId && e.srcId !== e.dstId ? `${e.srcId} → ${e.dstId}` : e.id} | ${STATUS[e.status]} | ${PHASES[e.phase] || '-'}${e.decision ? ' (onaylı)' : ' (öneri)'}${e.changes.length ? ` | ${e.changes.map(c => c.key).join(', ')}` : ''}`, 8));
  return pdf.output('blob');
}

/* ── metraj raporu (PDF, A4 yatay, gömülü DejaVu Sans; gömülemezse lossy: true döner ve kullanıcıya bildirilir) ── */
async function qtyPdf({ QD, UI, p, S, D, LN, rev, company }) {
  const pdf = await newPdf(297, 210), F = pdf.font, T = F.text, qs = rev.qty || {}, prices = qs.prices || {}, cur = qs.currency || 'TRY', vat = qs.vat || 'excl';
  const agg = aggregate(QD.lines, { level: UI.level, phase: UI.phase, ...UI.q, groupBy: UI.q.group });
  const n = (v, d = 2) => v === null || v === undefined ? '—' : (+v).toLocaleString('tr-TR', { minimumFractionDigits: d, maximumFractionDigits: d });
  const cols = [{ t: 'İmalat', w: 86 }, { t: 'Birim', w: 13 }, { t: 'Mevcut', w: 21, r: 1 }, { t: 'Yeni', w: 21, r: 1 }, { t: 'Net fark', w: 21, r: 1 }, { t: 'Söküm', w: 21, r: 1 }, { t: 'Yeni imalat', w: 22, r: 1 }, { t: 'Onay bekleyen', w: 26, r: 1 }, { t: `Tutar (${cur})`, w: 38, r: 1 }];
  let y = 14;
  const page = () => { pdf.addPage([297, 210], 'l'); y = 14; head(); };
  const text = (str, x, yy, { size = 8, bold = false, right = false, color = [17, 17, 17] } = {}) => { pdf.setFont(F.family, bold ? 'bold' : 'normal'); pdf.setFontSize(size); pdf.setTextColor(...color); pdf.text(T(str), x, yy, right ? { align: 'right' } : undefined); };
  const head = () => { let x = 12; pdf.setDrawColor(17, 17, 17); pdf.setLineWidth(0.3); pdf.line(12, y + 1.6, 285, y + 1.6); cols.forEach(c => { text(c.t, c.r ? x + c.w - 1 : x, y, { bold: true, right: !!c.r, size: 7.5 }); x += c.w; }); y += 5.5; };
  const row = (vals, o = {}) => { if (y > 196) page(); let x = 12; cols.forEach((c, i) => { const v = String(vals[i] ?? ''); const s2 = !c.r && v.length > 62 ? v.slice(0, 60) + '…' : v; text(s2, c.r ? x + c.w - 1 : x, y, { right: !!c.r, ...o }); x += c.w; }); y += 4.6; };
  text('SAGGCAD', 12, y, { size: 16, bold: true }); text(company || '', 285, y, { size: 9, right: true }); y += 7;
  text('İmalat metrajı ve tadilat farkı', 12, y, { size: 12, bold: true }); y += 6;
  text(`Proje: ${p.name}    Kaynak (mevcut): ${S.name}    Hedef (yeni): ${D.name}`, 12, y, { size: 8.5 }); y += 4.6;
  text(`Kat: ${UI.level === '*' ? 'tüm katlar' : (LN[UI.level] || UI.level)}    Mahal: ${UI.q.room === '*' ? 'tümü' : UI.q.room}    Tarih: ${new Date().toLocaleDateString('tr-TR')}    Revizyon: ${rev.code || D.revisionLabel || '—'}    Fiyatlar KDV ${vat === 'incl' ? 'dahil' : 'hariç'}`, 12, y, { size: 8.5 }); y += 7;
  head();
  let grand = 0, missing = false;
  for (const g of agg.groups) {
    if (y > 190) page();
    text(g.title, 12, y, { bold: true, size: 8.5 }); y += 4.8;
    let gs = 0, gm = false;
    for (const r of g.rows) {
      const c = costOf(r, prices); gs += c.amount; gm ||= c.missing;
      row([r.label + (r.unknown ? ` [${r.unknown} hesaplanamadı]` : ''), r.unit, n(r.before), n(r.after), (r.net > 5e-10 ? '+' : '') + n(r.net), n(r.demolish), n(r.build), r.demolishPending || r.buildPending ? `${n(r.demolishPending)} / ${n(r.buildPending)}` : '', r.build > 0 || r.demolish > 0 ? (c.missing ? 'fiyat girilmedi' : n(c.amount)) : '']);
    }
    for (const t of g.totals) row([`Toplam ${t.label}`, t.unit, n(t.before), n(t.after), (t.net > 5e-10 ? '+' : '') + n(t.net), n(t.demolish), n(t.build), '', ''], { bold: true });
    if (gs || gm) row([`${g.title} tutarı`, '', '', '', '', '', '', '', n(gs) + (gm ? ' *' : '')], { bold: true });
    grand += gs; missing ||= gm; y += 1.5;
  }
  if (y > 185) page();
  row(['GENEL TOPLAM TUTAR', '', '', '', '', '', '', '', (grand || missing ? n(grand) : '—') + (missing ? ' *' : '')], { bold: true });
  y += 4;
  const notes = [
    'Varsayımlar: miktarlar BIM modelinden hesaplanmıştır (duvar: eksen boyu × yükseklik; hacim: B2B katman prizmaları, birleşimde çift sayım yok, açıklıklar düşülmüş).',
    `Mahal duvar kaplaması: ${OPENING_POLICIES[{ ...DEFAULT_POLICY, ...qs }.openings]}. Net fark geometriktir; söküm ve yeni imalat yalnız onaylı safha / müdahale kararlarını içerir.`,
    QD.pending.length ? `Uyarı: ${QD.pending.length} eleman için karar bekleniyor; "Onay bekleyen" sütunu tahmindir.` : '',
    QD.qa.elements.concat(QD.qb.elements).some(e => e.status === 'unknown') ? 'Uyarı: hesaplanamayan elemanlar var (ör. eski yay duvar) — miktarları tabloda yoktur, manuel kontrol gerekir.' : '',
    missing ? '* Birim fiyatı girilmemiş kalem var — tutar eksiktir.' : '',
    'Fiyatlar kullanıcı girişidir; program fiyat önermez.', F.lossy ? 'UYARI: PDF yazı tipi gömülemedi; Türkçe karakterler ASCII karşılıklarıyla yazıldı.' : '',
  ].filter(Boolean);
  for (const t of notes) { if (y > 200) page(); text(t, 12, y, { size: 7.5, color: [80, 80, 80] }); y += 4.2; }
  return { blob: pdf.output('blob'), lossy: F.lossy, pdf };
}
