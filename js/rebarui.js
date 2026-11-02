/* ═══ Donatı arayüzü — özellik paneli bölümü ve "Donatı metrajı" penceresi ═══
 * Hesap bim/rebar.js'te (saf). Burada yalnız gösterim; değişiklikler editörün geri al günlüğünden geçer.
 * Kaynak ayrımı her yerde görünür: "Statik projeden (elle)" kesin, "Yönetmelik minimumu" tahmini.
 */
import { esc, icon, modal, toast, fmtNum, downloadBlob } from './ui.js';
import { concreteElements, rulesOf, takeoff, minSpec, rebarReport, rebarCsv, MODES, KIND_T, DIAMETERS, DEFAULT_RULES } from './bim/rebar.js';

const kg = v => `${fmtNum(v, 1)} kg`;
const barsTable = bars => bars.length ? `<table class="rb-t"><thead><tr><th>Rol</th><th>Ø</th><th>Adet</th><th>Boy</th><th>kg</th></tr></thead><tbody>${bars.map(b => `<tr><td>${esc(b.role)}</td><td>${b.d}</td><td>${b.n}</td><td>${fmtNum(b.len / 100, 2)} m</td><td>${fmtNum(b.kg, 1)}</td></tr>`).join('')}</tbody></table>` : '';
const LABELS = {
  kolon: [['n', 'Boyuna adet', ''], ['d', 'Boyuna Ø', 'mm'], ['sd', 'Etriye Ø', 'mm'], ['sc', 'Sarılma aralığı', 'cm'], ['s', 'Orta aralık', 'cm'], ['lc', 'Sarılma boyu', 'cm']],
  kiris: [['nt', 'Üst adet', ''], ['dt', 'Üst Ø', 'mm'], ['nb', 'Alt adet', ''], ['db', 'Alt Ø', 'mm'], ['sd', 'Etriye Ø', 'mm'], ['sc', 'Sarılma aralığı', 'cm'], ['s', 'Orta aralık', 'cm'], ['lc', 'Sarılma boyu', 'cm']],
  slab: [['dx', 'X Ø', 'mm'], ['sx', 'X aralık', 'cm'], ['dy', 'Y Ø', 'mm'], ['sy', 'Y aralık', 'cm']],
  wall: [['dv', 'Düşey Ø', 'mm'], ['sv', 'Düşey aralık', 'cm'], ['dh', 'Yatay Ø', 'mm'], ['sh', 'Yatay aralık', 'cm']],
};
const specTxt = (k, s) => k === 'kolon' ? `${s.n}Ø${s.d} · etriye Ø${s.sd}/${s.sc}–${s.s} cm (sarılma ${s.lc} cm)`
  : k === 'kiris' ? `üst ${s.nt}Ø${s.dt} · alt ${s.nb}Ø${s.db} · etriye Ø${s.sd}/${s.sc}–${s.s} cm`
  : k === 'slab' ? `X Ø${s.dx}/${s.sx} · Y Ø${s.dy}/${s.sy} cm${s.top ? ' · alt + üst' : ' · alt'}`
  : `düşey Ø${s.dv}/${s.sv} · yatay Ø${s.dh}/${s.sh} cm · iki yüz`;

/* özellik paneli: seçili betonarme elemanın donatısı (eleman betonarme değilse '') */
export function rebarInspHtml(R, id) {
  const el = concreteElements(R).find(e => e.id === id); if (!el) return '';
  const rules = rulesOf(R), t = takeoff(el, rules), mode = el.rb?.mode || 'none';
  let body = '';
  if (mode === 'min') body = `<p class="small"><b>${esc(specTxt(el.kind, t.spec))}</b></p><p class="muted small">Yönetmelik minimumundan (TS 500 / TBDY 2018 en az koşulları) türetilen <b>ön tahmin</b>; statik hesabın yerini tutmaz. Kesitin ölçüsü değişince kendiliğinden güncellenir.</p><button class="btn btn-xs btn-ghost" data-act="rbManual">${icon('edit')}Elle düzenlemek için kopyala</button>`;
  if (mode === 'manual') {
    body = `<div class="grid2">${LABELS[el.kind].map(([k, l, u]) => {
      const v = el.rb[k] ?? '';
      if (u === 'mm') return `<label>${l}<select class="inp sm" data-k="r.rb.${k}" data-num="1">${['', ...DIAMETERS].map(d => `<option value="${d}" ${+v === d ? 'selected' : ''}>${d ? 'Ø' + d : '—'}</option>`).join('')}</select></label>`;
      return `<label>${l}<div class="inp-unit sm"><input type="number" min="0" step="${u ? 0.5 : 1}" inputmode="decimal" data-k="r.rb.${k}" data-num="1" value="${v}"><span>${u || 'ad.'}</span></div></label>`;
    }).join('')}</div>${el.kind === 'slab' ? `<label class="vr-chk"><input type="checkbox" data-k="r.rb.top" ${el.rb.top ? 'checked' : ''}> Üst hasır da aynı (alt + üst)</label>` : ''}`;
  }
  const sum = mode === 'none' ? '<p class="muted small">Donatı tanımlanmamış — metraja girmez. Statik projedeki donatıyı girin ya da yönetmelik minimumuyla ön tahmin alın.</p>'
    : `<div class="mtable"><div><span>Donatı</span><b>${kg(t.kg)}</b></div><div><span>Beton</span><b>${fmtNum(t.concrete, 3)} m³</b></div><div><span>Oran</span><b>${fmtNum(t.ratio, 0)} kg/m³</b></div></div>${barsTable(t.bars)}`;
  const warn = t.warnings.length ? `<div class="rv-warn">${icon('alert')}<ul>${t.warnings.map(w => `<li>${esc(w)}</li>`).join('')}</ul></div>` : '';
  return `<div class="rb-insp"><h4>Donatı <small class="muted">${esc(KIND_T[el.kind])}</small></h4>
    <label>Kaynak<select class="inp sm" data-k="rb.mode">${Object.entries(MODES).map(([k, t2]) => `<option value="${k}" ${mode === k ? 'selected' : ''}>${esc(t2)}</option>`).join('')}</select></label>
    ${body}${sum}${warn}</div>`;
}
/* "Elle" seçilince (ya da kopyala): o anki minimum değerleri AÇIKÇA kayda yazılır — sonradan sessiz varsayım olmaz */
export function manualFromMin(R, id) {
  const el = concreteElements(R).find(e => e.id === id); if (!el) return null;
  const s = minSpec(el.kind, el.geom, rulesOf(R)); const { mode, rhoMin, ...rest } = s;   // eslint-disable-line no-unused-vars
  return { mode: 'manual', ...rest };
}

/* ── Donatı metrajı penceresi ──
 * ctx: { editor, project, drawing, printSheet(title, html) } */
export function openRebarReport(ctx) {
  const E = ctx.editor;
  let level = '*';
  const root = () => E.root;
  const body = document.createElement('div'); body.className = 'rb';
  const draw = () => {
    const R = root(), rep = rebarReport(R, { level }), T = rep.totals, ru = rep.rules;
    const lvls = [...new Map(concreteElements(R).map(e => [e.level, e.levelName])).entries()];
    body.innerHTML = `
      <div class="rb-bar"><label>Kat<select class="inp sm" data-rlv><option value="*">Tüm katlar</option>${lvls.map(([i, n]) => `<option value="${i}" ${String(level) === String(i) ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></label>
        <button class="btn btn-sm btn-ghost" data-rmin title="Donatısı tanımsız betonarme elemanlara yönetmelik minimumu (tek geri al adımı)">${icon('layers')}Tanımsızlara minimum ata</button>
        <button class="btn btn-sm btn-ghost" data-rcsv>${icon('download')}CSV</button>
        ${ctx.printSheet ? `<button class="btn btn-sm btn-ghost" data-rprint>${icon('print')}Yazdır / PDF</button>` : ''}</div>
      <div class="met-chips"><span><small>Toplam donatı</small><b data-rt="total">${fmtNum(T.total, 1)} kg</b></span><span><small>Statik projeden (kesin)</small><b data-rt="manual">${fmtNum(T.manual, 1)} kg</b></span><span><small>Minimum tahmini</small><b data-rt="min">${fmtNum(T.min, 1)} kg</b></span><span><small>Beton (tanımlı)</small><b>${fmtNum(T.concreteDefined, 2)} m³</b></span><span><small>Oran</small><b>${fmtNum(T.ratio, 0)} kg/m³</b></span></div>
      ${T.undefined ? `<p class="rv-warn">${icon('alert')}<span>${T.undefined} betonarme elemanın donatısı tanımsız — metraja girmedi.</span></p>` : ''}
      ${T.invalid ? `<p class="rv-warn">${icon('alert')}<span>${T.invalid} elemanın elle girilen donatısı eksik — metraja girmedi.</span></p>` : ''}
      ${T.min > 0 ? `<p class="muted small">"Minimum tahmini" TS 500 / TBDY 2018 en az koşullarından (donatı oranı, en küçük çap / adet, en büyük aralık, sarılma bölgesi) türetilen ön tahmindir; uygulama ve sipariş için statik projedeki donatı girilmelidir.</p>` : ''}
      ${rep.byDiameter.length ? `<h4>Çap toplamları</h4><table class="rb-t" data-rbd><thead><tr><th>Çap</th><th>kg/m</th><th>Toplam boy</th><th>Toplam</th><th>Statik projeden</th><th>Minimum tahmini</th></tr></thead><tbody>${rep.byDiameter.map(x => `<tr data-d="${x.d}"><td>Ø${x.d}</td><td>${fmtNum(x.kgPerM, 3)}</td><td>${fmtNum(x.m, 1)} m</td><td><b>${fmtNum(x.kg, 1)} kg</b></td><td>${fmtNum(x.kgManual, 1)}</td><td>${fmtNum(x.kgMin, 1)}</td></tr>`).join('')}<tr class="rb-tot"><td>Toplam</td><td></td><td>${fmtNum(rep.byDiameter.reduce((s, x) => s + x.m, 0), 1)} m</td><td><b>${fmtNum(T.total, 1)} kg</b><br><small>${fmtNum(T.total / 1000, 3)} t</small></td><td>${fmtNum(T.manual, 1)}</td><td>${fmtNum(T.min, 1)}</td></tr></tbody></table>` : ''}
      <h4>Elemanlar <small class="muted">${rep.rows.length}</small></h4>
      ${rep.rows.length ? `<table class="rb-t rb-el"><thead><tr><th>Kat</th><th>Eleman</th><th>Donatı</th><th>Kaynak</th><th>Beton</th><th>Donatı</th><th>kg/m³</th></tr></thead><tbody>${rep.rows.map(r => `<tr data-rel="${esc(r.id)}" data-rlvl="${r.level}" class="${r.mode === 'none' ? 'rb-none' : ''}"><td>${esc(r.levelName)}</td><td><button class="link" data-go>${esc(r.name)}</button> <small class="muted">${esc(KIND_T[r.kind])}</small></td><td>${r.spec && !r.invalid ? esc(specTxt(r.kind, r.spec)) : '—'}${r.warnings.length ? ` <span class="rb-w" title="${esc(r.warnings.join('\n'))}">${icon('alert')}${r.warnings.length}</span>` : ''}</td><td><span class="rb-mode m-${r.mode}">${esc(r.mode === 'min' ? 'Minimum (tahmini)' : r.mode === 'manual' ? 'Statik proje' : 'Tanımsız')}</span></td><td>${fmtNum(r.concrete, 3)} m³</td><td>${r.kg ? kg(r.kg) : '—'}</td><td>${r.kg ? fmtNum(r.ratio, 0) : '—'}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">Bu çizimde betonarme eleman yok (kolon / kiriş malzemesi betonarme, döşeme ya da perde duvar betonarme katmanlı olmalı).</p>'}
      <details class="rb-rules"><summary>Hesap kuralları (proje geneli)</summary>
        <div class="grid3"><label>Beton<select class="inp sm" data-ru="concrete">${['C20', 'C25', 'C30', 'C35', 'C40', 'C45', 'C50'].map(c => `<option ${ru.concrete === c ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
          <label>Çelik<select class="inp sm" data-ru="steel">${['B420C', 'B500C'].map(c => `<option ${ru.steel === c ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
          <label>Ticari çubuk boyu<div class="inp-unit sm"><input type="number" data-ru="stock" value="${ru.stock / 100}"><span>m</span></div></label></div>
        <div class="grid3"><label>Bindirme<div class="inp-unit sm"><input type="number" data-ru="lap" value="${ru.lap}"><span>×Ø</span></div></label>
          <label>Boyuna uç bükümü<div class="inp-unit sm"><input type="number" data-ru="endHook" value="${ru.endHook}"><span>×Ø</span></div></label>
          <label>Etriye kancası<div class="inp-unit sm"><input type="number" data-ru="stirHook" value="${ru.stirHook}"><span>×Ø</span></div></label></div>
        <div class="grid3">${[['col', 'Paspayı kolon'], ['beam', 'Paspayı kiriş'], ['slab', 'Paspayı döşeme'], ['wall', 'Paspayı perde']].map(([k, t]) => `<label>${t}<div class="inp-unit sm"><input type="number" step="0.5" data-ru="cover.${k}" value="${ru.cover[k]}"><span>cm</span></div></label>`).join('')}</div>
        <p class="muted small">Boylar: kolon boyuna = kat yüksekliği + bindirme (üst kata filiz); kiriş boyuna = kiriş boyu + iki uç bükümü; etriye = çekirdek çevresi + iki 135° kanca; döşeme = çokgen içinde paspayı kadar içeriden kesilen çubuklar + uç bükümleri; 12 m'yi aşan çubukta her ek için bindirme. Kesme boyu ve fire eklenmez. Varsayılanlara dönmek için: <button class="link" data-rreset>sıfırla</button></p>
      </details>`;
  };
  const setRules = patch => {
    const R = root(), cur = rulesOf(R);
    E.snap('Donatı kuralları');
    R.meta.rebar = { ...(R.meta.rebar || {}), ...patch(cur) };
    E.changed(); draw();
  };
  body.addEventListener('change', e => {
    const t = e.target;
    if (t.matches('[data-rlv]')) { level = t.value; return draw(); }
    if (t.matches('[data-ru]')) {
      const k = t.dataset.ru, v = t.tagName === 'SELECT' ? t.value : +t.value;
      if (t.tagName !== 'SELECT' && !(v > 0)) { toast('Pozitif bir sayı girin', 'err'); return draw(); }
      setRules(cur => k.startsWith('cover.') ? { cover: { ...cur.cover, [k.slice(6)]: v } } : { [k]: k === 'stock' ? v * 100 : v });
    }
  });
  body.addEventListener('click', e => {
    if (e.target.closest('[data-rreset]')) { E.snap('Donatı kuralları'); delete root().meta.rebar; E.changed(); return draw(); }
    if (e.target.closest('[data-rmin]')) {
      const els = concreteElements(root()).filter(x => (level === '*' || x.level === +level) && !(x.rb?.mode && x.rb.mode !== 'none'));
      if (!els.length) return toast('Donatısı tanımsız betonarme eleman yok');
      E.snap('Minimum donatı ata');
      const R = root(), plans = [R, ...(R.levels || [])];
      for (const x of els) {
        const P = plans[x.level], coll = x.coll === 'item' ? P.items : x.coll === 'slab' ? P.slabs : P.walls;
        const o = coll.find(q => q.id === x.id); if (o) o.rb = { mode: 'min' };
      }
      E.changed(); draw(); return toast(`${els.length} elemana yönetmelik minimumu atandı (tahmini) — Ctrl+Z ile geri alınır`);
    }
    if (e.target.closest('[data-rcsv]')) {
      const rep = rebarReport(root(), { level });
      return downloadBlob(new Blob([rebarCsv(rep, `${ctx.project?.name || ''} — ${ctx.drawing?.name || ''} — donatı metrajı`)], { type: 'text/csv;charset=utf-8' }), `${slugOf(ctx.project?.name)}-donati-metraji.csv`);
    }
    if (e.target.closest('[data-rprint]')) {
      const rep = rebarReport(root(), { level });
      return ctx.printSheet('Donatı Metrajı', printHtml(rep));
    }
    const go = e.target.closest('[data-go]');
    if (go) {
      const tr = go.closest('tr'), id = tr.dataset.rel, lv = +tr.dataset.rlvl;
      const el = concreteElements(root()).find(x => x.id === id);
      if (lv !== E.lv) E.setLevel(lv);
      E.setSel([{ kind: el.coll, id }]); E.toggleInsp?.(true);
      document.querySelectorAll('.modal-back').forEach(m => m.remove());
    }
  });
  draw();
  return modal({ title: 'Donatı metrajı — betonarme elemanlar', wide: true, body, actions: [{ k: 'ok', t: 'Kapat', cls: 'btn-primary' }] });
}
const slugOf = s => String(s || 'proje').normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/ı/g, 'i').replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'proje';
function printHtml(rep) {
  const T = rep.totals;
  return `<table class="ptable"><thead><tr><th>Çap</th><th>kg/m</th><th>Toplam boy (m)</th><th>Toplam (kg)</th><th>Statik projeden (kg)</th><th>Minimum tahmini (kg)</th></tr></thead><tbody>${rep.byDiameter.map(x => `<tr><td>Ø${x.d}</td><td>${fmtNum(x.kgPerM, 3)}</td><td>${fmtNum(x.m, 1)}</td><td>${fmtNum(x.kg, 1)}</td><td>${fmtNum(x.kgManual, 1)}</td><td>${fmtNum(x.kgMin, 1)}</td></tr>`).join('')}<tr><td><b>Toplam</b></td><td></td><td></td><td><b>${fmtNum(T.total, 1)}</b></td><td>${fmtNum(T.manual, 1)}</td><td>${fmtNum(T.min, 1)}</td></tr></tbody></table>
    <h3>Elemanlar</h3><table class="ptable"><thead><tr><th>Kat</th><th>Eleman</th><th>Kaynak</th><th>Rol</th><th>Ø</th><th>Adet</th><th>Boy (m)</th><th>kg</th></tr></thead><tbody>${rep.rows.filter(r => r.bars.length).flatMap(r => r.bars.map((b, i) => `<tr><td>${i ? '' : esc(r.levelName)}</td><td>${i ? '' : esc(r.name + ' · ' + KIND_T[r.kind])}</td><td>${i ? '' : esc(MODES[r.mode])}</td><td>${esc(b.role)}</td><td>${b.d}</td><td>${b.n}</td><td>${fmtNum(b.len / 100, 2)}</td><td>${fmtNum(b.kg, 1)}</td></tr>`)).join('')}</tbody></table>
    <p class="small">${T.undefined ? `${T.undefined} elemanın donatısı tanımsız (metraja girmedi). ` : ''}"Minimum tahmini" satırları TS 500 / TBDY 2018 en az koşullarından türetilmiş ön tahmindir; statik projenin yerini tutmaz. Kesme boyu ve fire dahil değildir.</p>`;
}
export { DEFAULT_RULES };
