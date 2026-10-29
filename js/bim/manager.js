/* ═══ BIM çekirdeği — "BIM Türleri ve Parametreler" penceresi (B2A) ═══
 * Tür listesi (kullanım sayılarıyla), parametre editörü ve canlı değişiklik özeti tek pencerede.
 * Tüm değişiklikler editörün bimCommand() yolundan geçer: doğrulanır, tek geri alınabilir işlem olarak uygulanır,
 * çizim ve özellik paneli yenilenir, otomatik kayıt tetiklenir.
 *   • yerleşik türler salt okunur; çoğaltılarak özel tür oluşturulur (özel türden de türetilebilir)
 *   • özel tür: ad ve parametreler düzenlenir; aynı türdeki elemanlar güncellenir, geçersiz kılınan değerler korunur
 *   • kullanılmayan özel tür silinir; kullanılan tür yalnız başka bir türe yeniden atanarak silinir
 * Tam editör: duvar, kolon, kiriş, döşeme. Kapı / pencere / boşluk ölçüleri aynı altyapıyla; mahal, çatı, merdiven
 * türleri bu aşamada yalnız listelenir.
 */
import { esc, fmtNum, modal, icon } from '../ui.js';
import { unitOf, toU, fromU } from '../units.js';
import { CLASSES } from './schema.js';
import { DEFAULT_TYPE, suggestTypeId } from './types.js';
import { FIELDS, TYPE_KEYS } from './fields.js';
import { reportCmd } from './ui.js';
import { compositesOf, compOf, compThickness, USES } from '../materials.js';

const TABS = [['wall', 'Duvar'], ['column', 'Kolon'], ['beam', 'Kiriş'], ['slab', 'Döşeme'], ['door', 'Kapı'], ['window', 'Pencere'], ['opening', 'Boşluk'], ['room', 'Mahal'], ['stair', 'Merdiven'], ['roof', 'Çatı']];
const LABEL = { function: 'İşlev', compositeId: 'Kompozit yapı', thickness: 'Kalınlık', height: 'Yükseklik', loadBearing: 'Taşıyıcı eleman', materialId: 'Malzeme', shape: 'Kesit', width: 'Genişlik / en', depth: 'Derinlik / boy', sill: 'Denizlik' };
const SEL_CLS = (ed, s) => {
  const o = ed.obj(s); if (!o) return null;
  if (s.kind === 'wall') return 'wall'; if (s.kind === 'slab') return 'slab'; if (s.kind === 'room') return 'room';
  if (s.kind === 'opening') return o.type === 'window' ? 'window' : o.type === 'door' ? 'door' : 'opening';
  if (s.kind === 'item') return o.type === 'kolon' ? 'column' : o.type === 'kiris' ? 'beam' : null;
  return null;
};
const opt = (v, t, cur) => `<option value="${esc(v ?? '')}" ${String(cur ?? '') === String(v ?? '') ? 'selected' : ''}>${esc(t)}</option>`;
const clone = v => JSON.parse(JSON.stringify(v ?? null));

export function openTypeManager(ed, { cls, typeId } = {}) {
  const bim = ed.bim, R = () => ed.root, U = unitOf(ed.root);
  const sels = () => (ed.msel?.length ? ed.msel : ed.sel ? [ed.sel] : []);
  const st = { cls: cls || (ed.sel && SEL_CLS(ed, ed.sel)) || 'wall', cur: typeId || null, draft: null, name: '', reassign: '' };
  const body = document.createElement('div'); body.className = 'tm';

  const curType = () => bim.getElementType(st.cur);
  const resetDraft = () => { const t = curType(); st.draft = t ? clone(t.params) : null; st.name = t?.name || ''; st.reassign = ''; };
  const pick = id => { st.cur = id; resetDraft(); };
  const ensureCur = () => {
    const list = bim.listTypes(st.cls);
    if (!list.some(t => t.id === st.cur)) {
      const el = ed.sel && bim.getElement(ed.sel.id);
      pick(el && el.cls === st.cls ? el.typeId : (list.find(t => !t.builtin)?.id || DEFAULT_TYPE[st.cls] || list[0]?.id || null));
    } else if (!st.draft) resetDraft();
  };
  const dirty = () => { const t = curType(); return !!t && !t.builtin && (JSON.stringify(st.draft) !== JSON.stringify(t.params) || st.name.trim() !== t.name); };
  const run = cmd => { const r = ed.bimCommand(cmd); reportCmd(r); return r; };

  /* tür parametresi alanı */
  const field = (k, t, ro) => {
    const F = FIELDS[st.cls][k], v = st.draft?.[k], dis = ro ? 'disabled' : '';
    if (k === 'thickness' && st.draft?.compositeId) {
      const c = compOf(R(), st.draft.compositeId);
      return `<label>${LABEL[k]}<div class="tm-ro">${c ? `${fmtNum(compThickness(c), 1)} cm — kompozitten` : '—'}</div></label>`;
    }
    if (F.v === 'bool') return `<label class="check"><input type="checkbox" data-tp="${k}" ${v ? 'checked' : ''} ${dis}> ${LABEL[k]}</label>`;
    if (F.v === 'enum') return `<label>${LABEL[k]}<select class="inp sm" data-tp="${k}" ${dis}>${F.nullable ? opt('', '— Belirtilmedi', v) : ''}${F.opts().map(([a, b]) => opt(a, b, v)).join('')}</select></label>`;
    if (F.v === 'comp') {
      const cs = compositesOf(R()).filter(c => (USES[c.use]?.kind || 'wall') === F.use);
      return `<label>${LABEL[k]}<select class="inp sm" data-tp="${k}" ${dis}>${opt('', 'Yok', v)}${cs.map(c => opt(c.k, `${c.t} (${fmtNum(compThickness(c), 1)} cm)`, v)).join('')}</select></label>`;
    }
    if (F.v === 'len') return `<label>${LABEL[k] || k}<div class="inp-unit sm"><input type="number" inputmode="decimal" step="${U.step}" data-tp="${k}" data-len="1" value="${v == null ? '' : toU(v, R())}" placeholder="${F.level ? 'kattan' : '—'}" ${dis}><span>${U.k}</span></div></label>`;
    return '';
  };

  const draw = () => bim.withSnapshot(() => {
    ensureCur();
    const list = bim.listTypes(st.cls), usage = bim.typeUsage(), t = curType(), ro = !t || t.builtin;
    const u = t ? usage.get(t.id) || { total: 0, explicit: 0, derived: 0 } : null;
    const keys = TYPE_KEYS[st.cls] || [], editable = keys.length > 0;
    const selIds = sels().filter(s => SEL_CLS(ed, s) === st.cls).map(s => s.id);
    let preview = '';
    if (t && !t.builtin && dirty()) {
      const p = bim.commands.plan({ op: 'updateType', id: t.id, name: st.name, params: st.draft });
      preview = p.ok ? `<div class="tm-sum ok">${esc(p.text || 'Değişiklik uygulanmaya hazır.')}${p.warnings.length ? `<br><small>${esc(p.warnings[0])}</small>` : ''}</div>`
        : `<div class="tm-sum err">${esc(p.errors.join(' · '))}</div>`;
    }
    const others = list.filter(x => x.id !== t?.id);
    body.innerHTML = `
      <div class="seg tm-tabs">${TABS.map(([k, n]) => `<button data-cls="${k}" class="${k === st.cls ? 'on' : ''}">${n}</button>`).join('')}</div>
      <div class="tm-wrap">
        <div class="tm-list">
          ${list.map(x => { const n = usage.get(x.id)?.total || 0; return `<button class="lib-item ${x.id === st.cur ? 'on' : ''}" data-tid="${esc(x.id)}">
            <b>${esc(x.id)}${x.builtin ? ' <i class="tm-lock" title="Yerleşik — salt okunur">🔒</i>' : ''}</b><small>${esc(x.name)}</small><em class="tm-n" title="Kullanan eleman">${n}</em></button>`; }).join('')}
          <div class="row wrap"><button class="btn btn-xs btn-ghost" data-tm="new">${icon('plus')}Yeni tür</button>${t ? `<button class="btn btn-xs btn-ghost" data-tm="dup">${icon('copy')}Çoğalt</button>` : ''}</div>
        </div>
        <div class="tm-ed">
          ${t ? `
          <div class="tm-head"><b class="mono">${esc(t.id)}</b><span class="muted small">${esc(CLASSES[t.cls].t)} · ${t.builtin ? 'yerleşik (salt okunur)' : `projeye özel · sürüm ${t.rev || 1}`}${t.base ? ` · temel: ${esc(t.base)}` : ''}</span></div>
          <label>Tür adı<input class="inp sm" data-tn value="${esc(st.name)}" ${ro ? 'disabled' : ''}></label>
          ${editable ? `<div class="grid2 tm-fields">${keys.map(k => field(k, t, ro)).join('')}</div>` : '<p class="muted small">Bu sınıfın tür parametreleri sonraki aşamada (B2B / B3) düzenlenebilir olacak; türler listelenir ve atanabilir.</p>'}
          <div class="mtable"><div><span>Kullanan eleman</span><b>${u.total}</b></div><div><span>Açık atanmış / türetilmiş</span><b>${u.explicit} / ${u.derived}</b></div></div>
          ${t.builtin ? '<p class="muted small">Yerleşik türler değiştirilemez. Kendi türünüzü oluşturmak için "Çoğalt"ı kullanın; çoğaltılan tür projeyle birlikte kaydedilir.</p>' : ''}
          ${preview}
          <div class="row wrap tm-acts">
            ${!t.builtin ? `<button class="btn btn-xs btn-primary" data-tm="apply" ${dirty() ? '' : 'disabled'}>${icon('check')}Değişiklikleri uygula</button><button class="btn btn-xs btn-ghost" data-tm="revert" ${dirty() ? '' : 'disabled'}>Taslağı sıfırla</button>` : ''}
            <button class="btn btn-xs btn-ghost" data-tm="assign" ${selIds.length ? '' : 'disabled'} title="Çizimde seçili ${CLASSES[st.cls].t.toLowerCase()} elemanlarına ata">Seçili elemanlara ata${selIds.length ? ` (${selIds.length})` : ''}</button>
          </div>
          ${!t.builtin ? `<div class="tm-del">${u.explicit
            ? `<label>Silmek için yeniden ata<select class="inp sm" data-tm-re>${opt('', '— Tür seçin', st.reassign)}${others.map(x => opt(x.id, `${x.id} — ${x.name}`, st.reassign)).join('')}</select></label>
               <button class="btn btn-xs btn-danger" data-tm="del" ${st.reassign ? '' : 'disabled'}>${icon('trash')}Yeniden ata ve sil (${u.explicit})</button>`
            : `<button class="btn btn-xs btn-ghost danger-t" data-tm="del">${icon('trash')}Türü sil</button>`}</div>` : ''}
          ` : '<p class="muted">Bu sınıfta tür yok.</p>'}
        </div>
      </div>`;
  });

  body.addEventListener('click', e => {
    const c = e.target.closest('[data-cls]'); if (c) { st.cls = c.dataset.cls; st.cur = null; st.draft = null; return draw(); }
    const ti = e.target.closest('[data-tid]'); if (ti) { pick(ti.dataset.tid); return draw(); }
    const a = e.target.closest('[data-tm]')?.dataset.tm; if (!a) return;
    const t = curType();
    if (a === 'new' || a === 'dup') {
      const from = a === 'new' ? DEFAULT_TYPE[st.cls] : t.id, src = bim.getElementType(from), id = suggestTypeId(R(), from);
      const r = run({ op: 'duplicateType', from, id, name: a === 'new' ? `Yeni ${CLASSES[st.cls].t.toLowerCase()} türü` : `${src.name} (kopya)` });
      if (r.applied) pick(id);
    } else if (a === 'apply' && t) { const r = run({ op: 'updateType', id: t.id, name: st.name, params: st.draft }); if (r.applied) resetDraft(); }
    else if (a === 'revert') resetDraft();
    else if (a === 'assign' && t) run({ op: 'assignType', ids: sels().filter(s => SEL_CLS(ed, s) === st.cls).map(s => s.id), typeId: t.id });
    else if (a === 'del' && t) { const r = run({ op: 'deleteType', id: t.id, reassignTo: st.reassign || null }); if (r.applied) { st.cur = st.reassign || null; st.draft = null; } }
    draw();
  });
  body.addEventListener('change', e => {
    const el = e.target;
    if (el.dataset.tmRe !== undefined) { st.reassign = el.value; return draw(); }
    if (el.dataset.tn !== undefined) { st.name = el.value; return draw(); }
    const k = el.dataset.tp; if (!k || !st.draft) return;
    const F = FIELDS[st.cls][k];
    let v = el.type === 'checkbox' ? el.checked : el.value;
    if (F.v === 'len') v = el.value === '' ? null : +fromU(+el.value, R()).toFixed(2);
    if ((F.v === 'enum' || F.v === 'comp') && v === '') v = null;
    if (v === null && !F.nullable && !F.level) delete st.draft[k]; else st.draft[k] = v;
    if (k === 'compositeId' && v) delete st.draft.thickness;
    draw();
  });
  body.addEventListener('input', e => { if (e.target.dataset.tn !== undefined) st.name = e.target.value; });

  draw();
  return modal({ title: 'BIM Türleri ve Parametreler', body, wide: true, actions: [{ k: 'ok', t: 'Kapat', cls: 'btn-primary' }] });
}
