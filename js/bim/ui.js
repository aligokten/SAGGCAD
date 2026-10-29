/* ═══ BIM çekirdeği — arayüz parçaları (B1, B2A) ═══
 * Özellik panelindeki BIM bölümü ve proje BIM raporu.
 * B2A: bölüm tür atamasını, "Türe döndür"ü ve kat bağını komutlarla (editor.bimCommand → geri alınabilir) yapar.
 * Geometri / yapı değerleri tek yerden, panelin mevcut alanlarından düzenlenir (aynı parametrenin ikinci bir
 * düzenleyicisi yoktur); bu bölüm değerin kaynağını gösterir ve türden ayrılan değeri türe döndürür.
 */
import { esc, fmtNum, toast } from '../ui.js';
import { CLASSES } from './schema.js';
import { REL_KINDS } from './relations.js';

export const SRC = { type: ['Tür', 'b-type'], override: ['Geçersiz kılındı', 'b-ovr'], instance: ['Eleman', 'b-inst'], level: ['Kat', 'b-lvl'], derived: ['Hesaplanan', 'b-der'] };
const TSRC = { explicit: 'atanmış', derived: 'mevcut alanlardan türetildi', default: 'varsayılan (türsüz)' };

/* editörün seçim türü → eski koleksiyon (BIM kimliği eski kimlikle aynıdır) */
const SUPPORTED = new Set(['wall', 'opening', 'room', 'item', 'slab', 'roof', 'stair', 'rail']);

export function fmtVal(p) {
  const v = p.value;
  if (v === null || v === undefined || v === '') return '—';
  if (p.type === 'bool') return v ? 'Evet' : 'Hayır';
  if (typeof v === 'number') return `${fmtNum(v, p.unit === 'm²' ? 2 : 1)}${p.unit ? ' ' + p.unit : ''}`;
  return esc(String(v));
}
export const srcBadge = s => `<i class="bim-src ${SRC[s]?.[1] || ''}">${SRC[s]?.[0] || esc(s)}</i>`;

export function bimInspHtml(bim, sel, R) {
  if (!bim || !sel || !SUPPORTED.has(sel.kind)) return '';
  return bim.withSnapshot(() => inspHtml(bim, sel, R));
}
function inspHtml(bim, sel) {
  const el = bim.getElement(sel.id); if (!el) return '';
  const C = CLASSES[el.cls], type = bim.getElementType(el.typeId), lvl = bim.getLevels().find(l => l.id === el.levelId);
  const ml = bim.getMaterialLink(el.id), rel = bim.getElementRelations(el.id), iss = bim.issuesFor(el.id);
  const params = bim.resolveElementParameters(el.id), writable = el.meta?.origin === 'legacy';
  const types = bim.listTypes(el.cls), opt = (v, t, on) => `<option value="${esc(v)}" ${on ? 'selected' : ''}>${esc(t)}</option>`;
  const typeSel = writable ? `<select class="inp sm" data-bim="type" aria-label="BIM tipi">
      ${el.typeSource === 'explicit' ? opt('', 'Türden ayır (mevcut alanlardan türet)', false) : opt('', `${type?.id || el.typeId} — ${TSRC[el.typeSource]}`, true)}
      <optgroup label="Yerleşik">${types.filter(t => t.builtin).map(t => opt(t.id, `${t.id} — ${t.name}`, el.typeSource === 'explicit' && t.id === el.typeId)).join('')}</optgroup>
      ${types.some(t => !t.builtin) ? `<optgroup label="Projeye özel">${types.filter(t => !t.builtin).map(t => opt(t.id, `${t.id} — ${t.name}`, el.typeSource === 'explicit' && t.id === el.typeId)).join('')}</optgroup>` : ''}
    </select>` : `<b>${esc(type ? `${type.id} — ${type.name}` : el.typeId)}</b>`;
  const acts = p => (p.resettable ? `<button class="btn btn-xs btn-ghost" data-bim-reset="${esc(p.k)}" title="Türün değerine döndür">Türe döndür</button>` : '')
    + (p.levelBindable ? `<label class="check" title="Yükseklik kat yüksekliğinden gelsin"><input type="checkbox" data-bim-lv="${esc(p.k)}" ${p.source === 'level' ? 'checked' : ''}> Kata bağlı</label>` : '');
  const row = p => `<tr data-p="${esc(p.k)}"><td>${esc(p.t)}</td><td class="r nowrap">${fmtVal(p)}${p.overridden ? `<br><small class="muted">tür: ${fmtVal({ ...p, value: p.typeValue })}</small>` : ''}</td><td class="r">${srcBadge(p.source)}</td></tr>`
    + (acts(p) ? `<tr class="bim-act-row" data-p="${esc(p.k)}"><td colspan="3">${acts(p)}</td></tr>` : '');
  const geo = params.filter(p => CLASSES[el.cls].params.find(x => x.k === p.k)?.at.startsWith('geom.')), str = params.filter(p => !geo.includes(p));
  const tbl = (h, ps) => ps.length ? `<h5>${h}</h5><table class="mat-tbl bim-par"><tbody>${ps.map(row).join('')}</tbody></table>` : '';
  return `<details class="bim-sec">
    <summary><span class="bim-badge">BIM</span><b>${esc(type?.id || el.typeId)}</b><small>${esc(C.t)}</small></summary>
    <h5>Kimlik</h5>
    <div class="mtable bim-id">
      <div><span>Eleman kimliği</span><b class="mono">${esc(el.id)}</b></div>
      <div><span>BIM sınıfı</span><b>${esc(C.t)} · ${esc(C.ifc)}</b></div>
      <div><span>Bağlı kat</span><b>${esc(lvl ? `${lvl.name} (${lvl.id})` : el.levelId)}</b></div>
      <div><span>Tür kaynağı</span><b>${esc(TSRC[el.typeSource] || el.typeSource)}</b></div>
      ${ml?.compositeId ? `<div><span>Kompozit</span><b>${ml.composite ? `${esc(ml.composite.name)} · ${fmtNum(ml.composite.thickness, 1)} cm · ${ml.composite.layers} katman` : `<span class="danger-t">${esc(ml.compositeId)} (yok)</span>`}</b></div>` : ''}
      ${ml?.materialId ? `<div><span>Malzeme</span><b>${esc(ml.material?.name || ml.materialId)}</b></div>` : ''}
    </div>
    <label class="bim-type">BIM tipi${typeSel}</label>
    ${tbl('Geometri', geo)}${tbl('Yapı', str)}
    <p class="bim-legend small">${['type', 'override', 'instance', 'level', 'derived'].map(srcBadge).join('')}</p>
    ${rel ? `<div class="bim-rel">${rel.outgoing.filter(r => r.kind !== 'containedIn').map(r => `<span class="${r.exists ? '' : 'danger-t'}">${esc(REL_KINDS[r.kind]?.t || r.kind)}: <code>${esc(r.target || '—')}</code></span>`).join('')}
      ${rel.incoming.length ? `<span>Bağlı elemanlar: ${rel.incoming.length}</span>` : ''}</div>` : ''}
    ${iss.length ? `<ul class="bim-iss">${iss.map(i => `<li class="s-${i.severity}">${esc(i.msg)}</li>`).join('')}</ul>` : ''}
    <p class="muted small">Değerleri panelin yukarıdaki alanlarından düzenleyin: atanmış türden farklı bir değer açık geçersiz kılma olur ve "Türe döndür" ile geri alınır. Tür parametreleri Model → BIM Türleri ve Parametreler penceresinde düzenlenir.</p>
    <div class="row wrap"><button class="btn btn-xs btn-ghost" data-bim="mgr">Türleri yönet…</button></div>
  </details>`;
}

/* komut sonucunu kullanıcıya bildir */
export function reportCmd(r) {
  if (!r) return;
  if (!r.ok) toast(r.errors?.[0] || 'İşlem yapılamadı', 'err');
  else if (!r.applied) toast('Değişiklik yok');
  else toast(r.warnings?.length ? r.warnings[0] : r.label);
}
/* BIM bölümündeki denetimler → komutlar (editör: geri al / yinele + otomatik kayıt) */
export function bindBimInsp(sec, ed, openManager) {
  const id = ed.sel?.id; if (!sec || !id) return;
  sec.addEventListener('change', e => {
    const t = e.target;
    if (t.dataset.bim === 'type') reportCmd(ed.bimCommand({ op: 'assignType', ids: [id], typeId: t.value || null }));
    else if (t.dataset.bimLv) reportCmd(ed.bimCommand({ op: 'setElementLevelBinding', id, key: t.dataset.bimLv, bound: t.checked }));
  });
  sec.addEventListener('click', e => {
    const b = e.target.closest('[data-bim-reset], [data-bim="mgr"]'); if (!b) return;
    if (b.dataset.bimReset) reportCmd(ed.bimCommand({ op: 'resetInstanceParam', id, key: b.dataset.bimReset }));
    else openManager?.();
  });
}

/* proje BIM raporu (Araçlar menüsü) */
export function bimReportHtml(bim) { return bim.withSnapshot(() => reportHtml(bim)); }
function reportHtml(bim) {
  const r = bim.report(), iss = bim.getIssues(), si = bim.schemaInfo();
  const rows = Object.entries(r.byClass).sort((a, b) => b[1] - a[1]).map(([c, n]) => `<div><span>${esc(CLASSES[c]?.t || c)}</span><b>${n}</b></div>`).join('');
  const types = Object.entries(r.byType).sort((a, b) => b[1] - a[1]).map(([t, n]) => { const T = bim.getElementType(t); return `<div><span><code>${esc(t)}</code> ${esc(T?.name || '')}</span><b>${n}</b></div>`; }).join('');
  return `<div class="bim-report">
    <p class="muted small">Şema sürümü ${r.schema} · eski veri biçimi v${r.legacyFormat} · ${r.levels} kat · ${r.elements} eleman. ${esc(si.note)}</p>
    <div class="grid2"><div><h4>Sınıflar</h4><div class="mtable">${rows || '<p class="muted small">Eleman yok</p>'}</div></div>
      <div><h4>Kullanılan türler</h4><div class="mtable">${types || '<p class="muted small">—</p>'}</div></div></div>
    <h4>Doğrulama <small class="muted">${r.issues.error} hata · ${r.issues.warning} uyarı · ${r.issues.info} bilgi</small></h4>
    ${iss.length ? `<ul class="bim-iss">${iss.slice(0, 200).map(i => `<li class="s-${i.severity}">${esc(i.msg)}</li>`).join('')}</ul>` : '<p class="muted small">Sorun bulunmadı.</p>'}
    <p class="muted small">Rapor yalnızca bilgi verir: hiçbir kayıt silinmez ya da düzeltilmez.</p>
  </div>`;
}
