/* ═══ BIM çekirdeği — arayüz parçaları (B1: salt okunur) ═══
 * Özellik panelinde seçili elemanın BIM bilgisi ve proje için BIM model raporu.
 * Hiçbir parametre burada düzenlenmez; düzenleme mevcut özellik paneli alanlarıyla yapılır.
 */
import { esc, fmtNum } from '../ui.js';
import { CLASSES } from './schema.js';
import { REL_KINDS } from './relations.js';

const SRC = { type: ['Tür', 'b-type'], instance: ['Eleman', 'b-inst'], level: ['Kat', 'b-lvl'], derived: ['Türetilmiş', 'b-der'], override: ['Geçersiz kılma', 'b-ovr'] };
const TSRC = { explicit: 'atanmış', derived: 'mevcut alanlardan türetildi', default: 'varsayılan (türsüz)' };

/* editörün seçim türü → eski koleksiyon (BIM kimliği eski kimlikle aynıdır) */
const SUPPORTED = new Set(['wall', 'opening', 'room', 'item', 'slab', 'roof', 'stair', 'rail']);

function val(p, R) {
  const v = p.value;
  if (v === null || v === undefined || v === '') return '—';
  if (p.type === 'bool') return v ? 'Evet' : 'Hayır';
  if (typeof v === 'number') return `${fmtNum(v, p.unit === 'm²' ? 2 : 1)}${p.unit ? ' ' + p.unit : ''}`;
  return esc(String(v));
}

export function bimInspHtml(bim, sel, R) {
  if (!bim || !sel || !SUPPORTED.has(sel.kind)) return '';
  return bim.withSnapshot(() => inspHtml(bim, sel, R));
}
function inspHtml(bim, sel, R) {
  const el = bim.getElement(sel.id); if (!el) return '';
  const C = CLASSES[el.cls], type = bim.getElementType(el.typeId), lvl = bim.getLevels().find(l => l.id === el.levelId);
  const ml = bim.getMaterialLink(el.id), rel = bim.getElementRelations(el.id), iss = bim.issuesFor(el.id);
  const params = bim.resolveElementParameters(el.id);
  return `<details class="bim-sec">
    <summary><span class="bim-badge">BIM</span><b>${esc(type?.id || el.typeId)}</b><small>${esc(C.t)}</small></summary>
    <div class="mtable bim-id">
      <div><span>Eleman kimliği</span><b class="mono">${esc(el.id)}</b></div>
      <div><span>Sınıf</span><b>${esc(C.t)} · ${esc(C.ifc)}</b></div>
      <div><span>BIM türü</span><b>${esc(type ? `${type.id} — ${type.name}` : el.typeId)}</b></div>
      <div><span>Tür kaynağı</span><b>${esc(TSRC[el.typeSource] || el.typeSource)}</b></div>
      <div><span>Kat</span><b>${esc(lvl ? `${lvl.name} (${lvl.id})` : el.levelId)}</b></div>
      ${ml?.compositeId ? `<div><span>Kompozit</span><b>${ml.composite ? `${esc(ml.composite.name)} · ${fmtNum(ml.composite.thickness, 1)} cm · ${ml.composite.layers} katman` : `<span class="danger-t">${esc(ml.compositeId)} (yok)</span>`}</b></div>` : ''}
      ${ml?.materialId ? `<div><span>Malzeme</span><b>${esc(ml.material?.name || ml.materialId)}</b></div>` : ''}
    </div>
    <table class="mat-tbl bim-par"><thead><tr><th>Parametre</th><th class="r">Değer</th><th>Kaynak</th></tr></thead><tbody>
      ${params.map(p => `<tr><td>${esc(p.t)}</td><td class="r">${val(p, R)}${p.overridden ? `<br><small class="muted">tür: ${val({ ...p, value: p.typeValue }, R)}</small>` : ''}</td><td><i class="bim-src ${SRC[p.source]?.[1] || ''}">${SRC[p.source]?.[0] || p.source}</i></td></tr>`).join('')}
    </tbody></table>
    ${rel ? `<div class="bim-rel">${rel.outgoing.filter(r => r.kind !== 'containedIn').map(r => `<span class="${r.exists ? '' : 'danger-t'}">${esc(REL_KINDS[r.kind]?.t || r.kind)}: <code>${esc(r.target || '—')}</code></span>`).join('')}
      ${rel.incoming.length ? `<span>Bağlı elemanlar: ${rel.incoming.length}</span>` : ''}</div>` : ''}
    ${iss.length ? `<ul class="bim-iss">${iss.map(i => `<li class="s-${i.severity}">${esc(i.msg)}</li>`).join('')}</ul>` : ''}
    <p class="muted small">BIM parametreleri bu sürümde salt okunurdur; değerler yukarıdaki alanlardan ve türden gelir.</p>
  </details>`;
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
