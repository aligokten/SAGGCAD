/* ═══ B4D arayüzü — Sürüm Kaydet, Proje Sürümleri yöneticisi, karşılaştırma, geri yükleme, dışa / içe aktarma ═══
 * "İşlem Geçmişi" (zaman çizelgesi, Ctrl+Z) yalnız açık düzenleme oturumudur; "Proje Sürümleri" kalıcı kayıt
 * noktalarıdır. Bu dosya yalnız arayüzdür; veri işlemleri versions.js'tedir.
 *
 * ctx: { project() → güncel proje nesnesi, flush() → bekleyen düzenleme + otomatik kaydı diske yazar,
 *        retire(p) / unretire(p) → üzerine geri yüklemede eski nesnenin kaydını engelle / geri aç,
 *        onRestored({ mode, project, recovery }), slug(s) }
 */
import { esc, icon, modal, toast, confirmDlg, fmtNum, downloadBlob } from './ui.js';
import { planThumbSvg } from './plan2d.js';
import { dataBlob, parseProjectFile, importProject } from './store.js';
import {
  saveVersion, listVersions, loadVersion, verifyVersion, updateVersion, deleteVersion, compareVersions, restoreVersion,
  exportWithVersions, importVersions, storageSummary, stamp, VersionError, KINDS, STATUS, APP_VERSION, versionSettings, DEFAULT_VERSION_SETTINGS,
} from './versions.js';

const kb = n => n < 1024 ? `${n} B` : n < 1048576 ? `${fmtNum(n / 1024, 1)} KB` : `${fmtNum(n / 1048576, 1)} MB`;
const SESSION_NOTE = `<div class="vr-sep"><div><b>${icon('undo')}İşlem Geçmişi</b><span>Mevcut düzenleme oturumu — Ctrl+Z / zaman çizelgesi. Bellekte tutulur, sekme kapanınca silinir.</span></div>
  <div><b>${icon('clock')}Proje Sürümleri</b><span>Kalıcı kayıt noktaları — bu cihazın tarayıcı deposunda saklanır, karşılaştırılır ve geri yüklenir.</span></div></div>`;

/* ── Sürüm Kaydet… ── */
export async function saveVersionDialog(ctx) {
  const p = ctx.project(); if (!p) return null;
  const now = Date.now();
  const r = await modal({ title: 'Sürüm kaydet', body: `
    <label>Sürüm adı<input class="inp" id="vrName" maxlength="120" value="${esc(`Sürüm — ${stamp(now)}`)}"></label>
    <label>Not <small class="muted">(isteğe bağlı — ne değişti, kime gönderildi…)</small><textarea class="inp" id="vrNote" rows="3" maxlength="2000"></textarea></label>
    <p class="muted small">Projenin tüm çizimleri, katları, BIM elemanları, revizyon kararları, metraj fiyatları ve görselleri kalıcı bir kayıt noktası olarak saklanır. Bekleyen değişiklikler önce kaydedilir.</p>`,
    actions: [{ k: 'no', t: 'Vazgeç' }, { k: 'ok', t: 'Sürümü kaydet', cls: 'btn-primary', icon: 'check' }] });
  if (r?.k !== 'ok') return null;
  return doSave(ctx, { name: r.el.querySelector('#vrName').value, note: r.el.querySelector('#vrNote').value });
}
async function doSave(ctx, opts) {
  const p = ctx.project();
  try {
    await ctx.flush();
    const res = await saveVersion(p.id, opts);
    if (!res.ok) { toast(`Değişiklik yok — bu içerik zaten "${res.duplicate.name}" (${stamp(res.duplicate.createdAt)}) olarak kayıtlı; yeni sürüm oluşturulmadı`); return res; }
    toast(`"${res.version.name}" kaydedildi — ${stamp(res.version.createdAt)}`);
    return res;
  } catch (e) { if (!(e instanceof VersionError)) console.error(e); toast(e.message || 'Sürüm kaydedilemedi', 'err'); return { ok: false, error: e }; }
}

/* ── Proje Sürümleri… ── */
export async function versionsDialog(ctx) {
  const p = ctx.project(); if (!p) return;
  const checked = new Map();   // id → verifyVersion sonucu (oturum boyunca)
  let list = [];
  const body = document.createElement('div'); body.className = 'vr';
  const draw = async () => {
    list = await listVersions(p.id);
    const sum = await storageSummary(p.id);
    const opts = sel => `<option value="current" ${sel === 'current' ? 'selected' : ''}>Güncel proje</option>${list.map(v => `<option value="${v.id}" ${sel === v.id ? 'selected' : ''}>${esc(v.name)} · ${stamp(v.createdAt)}</option>`).join('')}`;
    body.innerHTML = `${SESSION_NOTE}
      <div class="vr-bar"><button class="btn btn-primary btn-sm" data-vnew>${icon('plus')}Sürüm kaydet…</button>
        <span class="muted small">${list.length} sürüm · içerik ${kb(sum.snapshots)} · görseller ${kb(sum.assetsStored)} (${sum.uniqueAssets} tekil)${sum.autoCount ? ` · ${sum.autoCount} otomatik` : ''}</span></div>
      ${list.length > 1 || list.length === 1 ? `<div class="vr-cmp"><label>Karşılaştır<select class="inp" data-ca>${opts(list[0]?.id)}</select></label><span aria-hidden="true">→</span><label>ile<select class="inp" data-cb>${opts('current')}</select></label><button class="btn btn-ghost btn-sm" data-cgo>${icon('layers')}Karşılaştır</button></div>` : ''}
      ${list.length ? `<ul class="vr-list">${list.map(row).join('')}</ul>` : `<div class="vr-empty"><b>Henüz sürüm yok</b><p class="muted small">Önemli bir aşamada (rölöve tamamlandı, müşteriye sunuldu, revizyon onaylandı…) "Sürüm kaydet" ile kalıcı bir kayıt noktası oluşturun.</p></div>`}`;
    for (const v of list) if (!checked.has(v.id)) verifyVersion(v.id).then(r => { checked.set(v.id, r); paint(v.id); });
  };
  const chip = id => { const r = checked.get(id); const st = r?.status || 'unchecked'; return `<span class="vr-st st-${st}" title="${esc((r?.problems || []).join('\n'))}">${esc(STATUS[st] || st)}</span>`; };
  const paint = id => { const el = body.querySelector(`[data-v="${id}"] .vr-st`); if (el) el.outerHTML = chip(id); };
  const row = v => `<li class="vr-row" data-v="${v.id}">
      <div class="vr-main"><div class="vr-t"><b>${esc(v.name)}</b><span class="vr-k k-${v.kind}">${esc(KINDS[v.kind] || v.kind)}</span>${v.important && v.kind === 'auto' ? '<span class="vr-k">önemli</span>' : ''}${chip(v.id)}</div>
        <div class="vr-m muted small"><span>${stamp(v.createdAt)}</span><span>${kb(v.size + (v.assetsSize || 0))}</span><span>SAGGCAD ${esc(v.appVersion || '?')}</span><span>${v.stats?.drawings ?? '?'} çizim · ${v.stats?.elements ?? '?'} eleman · ${v.stats?.photos ?? 0} görsel</span>${v.importedFrom ? '<span>içe aktarıldı</span>' : ''}</div>
        ${v.note ? `<p class="vr-note">${esc(v.note)}</p>` : ''}</div>
      <div class="vr-act">
        <button class="btn btn-ghost btn-xs" data-va="prev">${icon('eye')}Önizle</button>
        <button class="btn btn-ghost btn-xs" data-va="cmp" title="Bu sürümü güncel proje ile karşılaştır">${icon('layers')}Güncel ile</button>
        <button class="btn btn-ghost btn-xs" data-va="cmp2" title="Başka bir sürümle karşılaştır">${icon('layers')}Başka sürümle</button>
        <button class="btn btn-ghost btn-xs" data-va="copy" title="Yeni bir proje olarak geri yükle (güncel proje değişmez)">${icon('copy')}Kopya olarak geri yükle</button>
        <button class="btn btn-ghost btn-xs danger-t" data-va="over" title="Güncel projenin üzerine geri yükle (önce kurtarma sürümü alınır)">${icon('undo')}Üzerine geri yükle</button>
        <button class="btn btn-ghost btn-xs" data-va="exp" title="Bu sürümü ayrı bir .saggcad.json yedeği olarak indir">${icon('download')}Yedek</button>
        <button class="btn btn-ghost btn-xs" data-va="ren" title="Adı / notu düzenle (içerik değişmez)">${icon('edit')}</button>
        <button class="btn btn-ghost btn-xs danger-t" data-va="del" title="Sil">${icon('trash')}</button>
      </div></li>`;
  const act = async (a, id) => {
    const v = list.find(x => x.id === id);
    if (a === 'prev') return previewDialog(id);
    if (a === 'cmp') return compareDialog(ctx, id, 'current');
    if (a === 'cmp2') { const s = body.querySelector('[data-ca]'); if (s) { s.value = id; const b = body.querySelector('[data-cb]'); const other = list.find(x => x.id !== id); if (b && other) b.value = other.id; b?.focus(); } return; }
    if (a === 'copy') return restoreCopy(ctx, v);
    if (a === 'over') return restoreOver(ctx, v);
    if (a === 'exp') return exportVersionFile(ctx, v);
    if (a === 'ren') {
      const r = await modal({ title: 'Sürümü düzenle', body: `<label>Ad<input class="inp" id="vrName" maxlength="120" value="${esc(v.name)}"></label><label>Not<textarea class="inp" id="vrNote" rows="3">${esc(v.note || '')}</textarea></label>${v.kind === 'auto' ? `<label class="vr-chk"><input type="checkbox" id="vrImp" ${v.important ? 'checked' : ''}> Önemli — otomatik temizlikte silinmesin</label>` : ''}<p class="muted small">Ad ve not değişikliği sürümün içeriğini ve karmasını değiştirmez.</p>`, actions: [{ k: 'no', t: 'Vazgeç' }, { k: 'ok', t: 'Kaydet', cls: 'btn-primary' }] });
      if (r?.k !== 'ok') return;
      await updateVersion(id, { name: r.el.querySelector('#vrName').value, note: r.el.querySelector('#vrNote').value, ...(r.el.querySelector('#vrImp') ? { important: r.el.querySelector('#vrImp').checked } : {}) });
      return draw();
    }
    if (a === 'del') {
      if (!await confirmDlg(`"${v.name}" sürümü kalıcı olarak silinecek. ${v.kind === 'recovery' ? 'Bu bir kurtarma noktasıdır — geri yüklemeden önceki durum yalnız burada saklanıyor olabilir. ' : ''}Bu işlem geri alınamaz.`)) return;
      await deleteVersion(id); checked.delete(id); toast('Sürüm silindi'); return draw();
    }
  };
  body.addEventListener('click', async e => {
    if (e.target.closest('[data-vnew]')) { await saveVersionDialog(ctx); return draw(); }
    if (e.target.closest('[data-cgo]')) { const A = body.querySelector('[data-ca]').value, B = body.querySelector('[data-cb]').value; if (A === B) return toast('Aynı kayıt iki kez seçildi', 'err'); return compareDialog(ctx, A, B); }
    const b = e.target.closest('[data-va]'); if (!b) return;
    b.disabled = true;
    try { await act(b.dataset.va, b.closest('[data-v]').dataset.v); } catch (er) { console.error(er); toast(er.message || 'İşlem yapılamadı', 'err'); } finally { b.disabled = false; }
  });
  await draw();
  return modal({ title: 'Proje Sürümleri — kalıcı kayıt noktaları', wide: true, body, actions: [{ k: 'ok', t: 'Kapat', cls: 'btn-primary' }] });
}

/* ── önizleme (salt okunur) ── */
async function previewDialog(id) {
  let v, chk;
  try { v = await loadVersion(id); chk = await verifyVersion(id, { deep: true }); } catch (e) { return toast(e.message, 'err'); }
  const P = v.snapshot.project, m = v.meta;
  return modal({ title: `Önizleme — ${m.name}`, wide: true, body: `<div class="vr-prev">
    <div class="vr-m small"><span>${stamp(m.createdAt)}</span><span>${esc(KINDS[m.kind] || m.kind)}</span><span>SAGGCAD ${esc(m.appVersion)}</span><span>${kb(m.size)} + görseller ${kb(m.assetsSize || 0)}</span><span class="vr-st st-${chk.status}">${esc(STATUS[chk.status])}</span></div>
    ${chk.problems.length ? `<p class="rv-warn">${icon('alert')}<span>${chk.problems.map(esc).join('<br>')}</span></p>` : ''}
    <p><b>${esc(P.name)}</b>${P.client ? ` · ${esc(P.client)}` : ''}${P.address ? ` · ${esc(P.address)}` : ''}</p>${m.note ? `<p class="vr-note">${esc(m.note)}</p>` : ''}
    <div class="vr-thumbs">${P.drawings.map(d => `<figure><div class="vr-th">${planThumbSvg(d.plan)}</div><figcaption>${esc(d.name)}<small>${d.main ? 'Rölöve' : esc(d.kind || '')}</small></figcaption></figure>`).join('')}</div>
    <p class="muted small">Karma ${esc(m.hash.slice(0, 23))}… · ${P.drawings.length} çizim · ${(P.photos || []).length} görsel. Önizleme salt okunurdur; güncel proje değişmez.</p></div>`,
    actions: [{ k: 'ok', t: 'Kapat', cls: 'btn-primary' }] });
}

/* ── karşılaştırma ── */
export async function compareDialog(ctx, a, b) {
  let res;
  try { await ctx.flush(); res = await compareVersions(a, b, { current: ctx.project() }); } catch (e) { console.error(e); return toast(e.message || 'Karşılaştırılamadı', 'err'); }
  return modal({ title: `Karşılaştırma — ${res.a.label} → ${res.b.label}`, wide: true, body: `<div class="vr-diff" data-vdiff>${compareHtml(res)}</div>`, actions: [{ k: 'ok', t: 'Kapat', cls: 'btn-primary' }] });
}
const sgn = n => (n > 0 ? '+' : '') + fmtNum(n, 2);
export function compareHtml(res) {
  if (res.identical) return `<p class="vr-same">${icon('check')}İki kayıt arasında fark yok.</p>`;
  const parts = [];
  if (res.info.length) parts.push(`<section><h4>Proje bilgisi</h4><div class="mtable">${res.info.map(i => `<div><span>${esc(i.label)}</span><b>${esc(i.before || '—')} → ${esc(i.after || '—')}</b></div>`).join('')}</div></section>`);
  if (res.addedDrawings.length || res.removedDrawings.length) parts.push(`<section><h4>Çizimler</h4><div class="mtable">${res.addedDrawings.map(d => `<div><span>Eklenen çizim</span><b>${esc(d.name)}</b></div>`).join('')}${res.removedDrawings.map(d => `<div><span>Kaldırılan çizim</span><b>${esc(d.name)}</b></div>`).join('')}</div></section>`);
  const ph = res.photos;
  if (ph.added.length || ph.removed.length || ph.changed.length) parts.push(`<section><h4>Görseller</h4><p class="small">${ph.added.length} eklenen · ${ph.removed.length} kaldırılan · ${ph.changed.length} değişen</p></section>`);
  if (!res.comparable) parts.push(`<p class="rv-warn">${icon('alert')}<span>Karşılaştırılabilir çizim yok — iki kayıtta ortak (aynı kimlikli) çizim ya da rölöve bulunamadı.</span></p>`);
  for (const d of res.drawings) {
    if (d.identical) { parts.push(`<section class="vr-dw"><h4>${esc(d.a.name)}${d.a.name !== d.b.name ? ` → ${esc(d.b.name)}` : ''}</h4><p class="muted small">Değişiklik yok.</p></section>`); continue; }
    const c = d.counts, s = d.summary;
    parts.push(`<section class="vr-dw" data-vdw="${esc(d.b.id)}"><h4>${esc(d.a.name)}${d.a.name !== d.b.name ? ` → ${esc(d.b.name)}` : ''} <small class="muted">${d.a.kind === 'rolove' ? 'rölöve ↔ rölöve' : 'tasarım ↔ tasarım'}</small></h4>
      <div class="met-chips sm"><span><small>Eklenen</small><b data-c="added">${c.added}</b></span><span><small>Kaldırılan</small><b data-c="removed">${c.removed}</b></span><span><small>Geometri</small><b data-c="geometry">${c.geometry}</b></span><span><small>Parametre</small><b data-c="params">${c.params}</b></span>${c.uncertain ? `<span><small>Belirsiz</small><b data-c="uncertain">${c.uncertain}</b></span>` : ''}</div>
      <p class="small">Duvar ${s.walls.source} → ${s.walls.target} · kapı +${s.doors.added}/−${s.doors.removed} · pencere +${s.windows.added}/−${s.windows.removed}</p>
      ${d.levelChanges.length ? `<p class="small"><b>Kat değişiklikleri:</b> ${d.levelChanges.map(l => `${esc(l.name || l.level)} (${l.status === 'added' ? 'eklendi' : l.status === 'removed' ? 'kaldırıldı' : l.changes.map(x => x.key).join(', ')})`).join(' · ')}</p>` : ''}
      ${d.rooms.length ? `<p class="small"><b>Mahaller:</b> ${d.rooms.map(r => `${esc(r.name || r.id)} ${r.before === null ? 'yeni' : r.after === null ? 'kaldırıldı' : `${fmtNum(r.before)} → ${fmtNum(r.after)} m²`}`).join(' · ')}</p>` : ''}
      ${d.typeChanges.length ? `<p class="small"><b>BIM türü değişen:</b> ${d.typeChanges.map(t => `${esc(t.key)} ×${t.n}`).join(', ')}</p>` : ''}
      ${d.materialChanges.length ? `<p class="small"><b>Malzeme değişen:</b> ${d.materialChanges.map(t => `${esc(t.key)} ×${t.n}`).join(', ')}</p>` : ''}
      ${d.qty.rows.length ? `<div class="vr-qty"><table><thead><tr><th>İmalat</th><th>Birim</th><th>Önce</th><th>Sonra</th><th>Net fark</th><th title="Sürümler arası farkta tadilat kararı yoktur">Söküm (onay bekleyen)</th><th title="Sürümler arası farkta tadilat kararı yoktur">Yeni (onay bekleyen)</th></tr></thead><tbody>${d.qty.rows.map(r => `<tr><td>${esc(r.label)}${r.unknown ? ' <small class="muted">(hesaplanamayan var)</small>' : ''}</td><td>${esc(r.unit)}</td><td>${fmtNum(r.before)}</td><td>${fmtNum(r.after)}</td><td><b>${sgn(r.net)}</b></td><td>${r.demolishPending ? fmtNum(r.demolishPending) : ''}</td><td>${r.buildPending ? fmtNum(r.buildPending) : ''}</td></tr>`).join('')}</tbody></table></div>
        <p class="muted small">Net fark iki kayıtlı durumun ölçümüdür. Söküm ve yeni imalat miktarları sürümler arasında tadilat kararı içermediği için <b>onay bekleyen</b> olarak gösterilir — kesin metraj için Revizyon karşılaştırmasında safhaları onaylayın.</p>` : '<p class="muted small">Metraj farkı yok.</p>'}
      ${d.prices.changes.length ? `<p class="small"><b>Birim fiyat değişen:</b> ${d.prices.changes.map(x => `${esc(x.key)} ${x.before ?? '—'} → ${x.after ?? '—'}`).join(' · ')}<br>Onay bekleyen miktarların tutarı: önceki fiyatlarla ${fmtNum(d.prices.costA)} · yeni fiyatlarla ${fmtNum(d.prices.costB)} ${esc(d.prices.currency)}${d.prices.missing ? ' (bazı kalemlerin fiyatı girilmemiş)' : ''}</p>` : ''}
    </section>`);
  }
  return parts.join('');
}

/* ── geri yükleme ── */
async function restoreCopy(ctx, v) {
  const p = ctx.project();
  const r = await modal({ title: 'Kopya olarak geri yükle', body: `<p>"${esc(v.name)}" sürümü <b>yeni bir proje</b> olarak açılacak. Güncel proje değişmez.</p><label>Yeni projenin adı<input class="inp" id="vrCopy" value="${esc(`${p.name} — ${v.name}`)}"></label>`, actions: [{ k: 'no', t: 'Vazgeç' }, { k: 'ok', t: 'Kopya olarak geri yükle', cls: 'btn-primary' }] });
  if (r?.k !== 'ok') return;
  const name = r.el.querySelector('#vrCopy').value;
  await ctx.flush();
  let res;
  try { res = await restoreVersion(v.id, { mode: 'copy', name }); } catch (e) {
    if (e.code !== 'missing-assets') throw e;
    if (!await confirmDlg(`${e.message}. Eksik görseller olmadan geri yüklensin mi?`, 'Eksik görsellerle sürdür', false)) return;
    res = await restoreVersion(v.id, { mode: 'copy', name, allowMissing: true });
  }
  toast(`"${res.project.name}" oluşturuldu${res.missing.length ? ` — ${res.missing.length} görsel eksik` : ''}`);
  return ctx.onRestored(res);
}
async function restoreOver(ctx, v) {
  const p = ctx.project();
  const r = await modal({ title: 'Mevcut projenin üzerine geri yükle', body: `
    <p>"<b>${esc(p.name)}</b>" projesinin güncel durumu "<b>${esc(v.name)}</b>" (${stamp(v.createdAt)}) sürümüyle <b>değiştirilecek</b>.</p>
    <ul class="small"><li>Önce güncel durum <b>"Geri yükleme öncesi — tarih/saat"</b> adıyla kurtarma sürümü olarak kaydedilir; kaydedilemezse geri yükleme yapılmaz.</li>
      <li>Bu işlem <b>Ctrl+Z ile geri alınamaz</b>. Geri dönmek için kurtarma sürümünü geri yükleyin.</li>
      <li>Açık düzenleme oturumunun işlem geçmişi temizlenir.</li></ul>
    <label class="vr-chk"><input type="checkbox" id="vrAck"> Anladım, güncel projenin üzerine yaz</label>`,
    actions: [{ k: 'no', t: 'Vazgeç' }, { k: 'ok', t: 'Üzerine geri yükle', cls: 'btn-danger', validate: el => { const ok = el.querySelector('#vrAck').checked; if (!ok) toast('Onay kutusunu işaretleyin', 'err'); return ok; } }] });
  if (r?.k !== 'ok') return;
  await ctx.flush();
  ctx.retire(p);   // gecikmeli otomatik kayıt eski nesneyle geri yüklenen projeyi ezemesin
  let res;
  try {
    try { res = await restoreVersion(v.id, { mode: 'overwrite', confirm: true, projectId: p.id }); } catch (e) {
      if (e.code !== 'missing-assets') throw e;
      if (!await confirmDlg(`${e.message}. Eksik görseller olmadan geri yüklensin mi?`, 'Eksik görsellerle sürdür', false)) { ctx.unretire(p); return; }
      res = await restoreVersion(v.id, { mode: 'overwrite', confirm: true, projectId: p.id, allowMissing: true });
    }
  } catch (e) { ctx.unretire(p); throw e; }
  toast(`"${v.name}" geri yüklendi. Kurtarma noktası: "${res.recovery?.name}"`);
  return ctx.onRestored(res);
}

/* ── dışa aktarma ── */
async function exportVersionFile(ctx, v) {
  const x = await loadVersion(v.id);
  const { getAssetBlob } = await assetApi();
  const blobs = {};
  for (const [id, h] of Object.entries(x.snapshot.assets || {})) { const b = h && await getAssetBlob(h); if (b) blobs[id] = await new Promise(r => { const f = new FileReader(); f.onload = () => r(f.result); f.readAsDataURL(b); }); }
  const project = { ...x.snapshot.project, updatedAt: v.createdAt, exportedFromVersion: { id: v.id, name: v.name, hash: v.hash } };
  downloadBlob(dataBlob({ format: 'saggcad', version: 1, project, blobs }), `${ctx.slug(project.name)}-surum-${ctx.slug(v.name)}.saggcad.json`);
  toast('Sürüm yedeği indirildi');
}
const assetApi = async () => {
  const { txMulti } = await import('./store.js');
  return { getAssetBlob: h => txMulti(['versionAssets'], 'readonly', S => new Promise(res => { const r = S.versionAssets.get(h); r.onsuccess = () => res(r.result?.blob || null); r.onerror = () => res(null); })) };
};
/* "Proje dosyasını indir": sürüm yoksa doğrudan; varsa yalnız güncel / güncel + seçilmiş sürümler */
export async function exportProjectDialog(ctx, p = ctx.project()) {
  await ctx.flush?.();
  const list = await listVersions(p.id);
  const file = `${ctx.slug(p.name)}.saggcad.json`;
  if (!list.length) return downloadBlob(dataBlob(await exportWithVersions(p)), file);
  const r = await modal({ title: 'Proje dosyasını indir', body: `
    <label class="vr-chk"><input type="radio" name="vrx" value="cur" checked> Yalnız güncel proje</label>
    <label class="vr-chk"><input type="radio" name="vrx" value="ver"> Güncel proje + seçilmiş geçmiş sürümler</label>
    <div class="vr-xl">${list.map(v => `<label class="vr-chk"><input type="checkbox" data-xv="${v.id}" ${v.kind !== 'auto' ? 'checked' : ''}> ${esc(v.name)} <small class="muted">${stamp(v.createdAt)} · ${kb(v.size + (v.assetsSize || 0))}</small></label>`).join('')}</div>
    <p class="muted small">Dosya biçimi değişmez (.saggcad.json); sürümler ve görselleri ek alanlarda taşınır. Eski SAGGCAD sürümleri ek alanları yok sayıp projeyi açar.</p>`,
    actions: [{ k: 'no', t: 'Vazgeç' }, { k: 'ok', t: 'İndir', cls: 'btn-primary', icon: 'download' }] });
  if (r?.k !== 'ok') return;
  const ids = r.el.querySelector('[name=vrx]:checked').value === 'ver' ? [...r.el.querySelectorAll('[data-xv]:checked')].map(i => i.dataset.xv) : [];
  try { downloadBlob(dataBlob(await exportWithVersions(p, ids)), file); toast(ids.length ? `Proje ve ${ids.length} sürüm indirildi` : 'Proje dosyası indirildi'); }
  catch (e) { toast(e.message || 'Dışa aktarılamadı', 'err'); }
}

/* ── içe aktarma: biçim + sürüm doğrulaması; aynı proje kimliği asla ezilmez ── */
export async function importFileFlow(text) {
  const d = parseProjectFile(text);
  const nv = Array.isArray(d.versions) ? d.versions.length : 0;
  try {
    const est = await navigator.storage?.estimate?.();
    if (est?.quota && est.quota - est.usage < text.length * 1.2) throw new Error(`Tarayıcı deposunda yer yok (boş ${kb(est.quota - est.usage)}, gerekli ≈ ${kb(text.length)}) — dosya içe aktarılmadı`);
  } catch (e) { if (/yer yok/.test(e.message)) throw e; }
  let withVersions = false;
  if (nv) {
    const r = await modal({ title: 'Proje dosyası', body: `<p>Dosyada güncel projeyle birlikte <b>${nv} proje sürümü</b> var.</p><p class="muted small">Sürümler karma ve şema denetiminden geçer; bozuk olanlar atlanır ve raporlanır.</p>`, actions: [{ k: 'no', t: 'Yalnız projeyi aç' }, { k: 'ok', t: 'Sürümlerle birlikte aç', cls: 'btn-primary' }] });
    if (!r) return null;
    withVersions = r.k === 'ok';
  }
  const p = await importProject(text, { parsed: d });
  let rep = null;
  if (withVersions) rep = await importVersions(d, p.id);
  const renamed = p._import?.renamedFrom;
  toast(`"${p.name}" açıldı${renamed ? ' (aynı kimlikli proje zaten vardı — kopya olarak eklendi)' : ''}${rep ? ` · ${rep.imported.length} sürüm` : ''}`);
  if (rep?.rejected.length) modal({ title: 'Bazı sürümler içe aktarılmadı', body: `<ul>${rep.rejected.map(x => `<li><b>${esc(x.name)}</b> — ${esc(x.reason)}</li>`).join('')}</ul>`, actions: [{ k: 'ok', t: 'Tamam', cls: 'btn-primary' }] });
  return { project: p, versions: rep };
}

/* ── ayarlar: otomatik proje sürümleri (otomatik kayıttan ayrı) ── */
export function autoSettingsHtml(settings) {
  const c = versionSettings(settings);
  return `<fieldset class="vr-set"><legend>Otomatik Proje Sürümleri</legend>
    <p class="muted small">Otomatik kayıt her değişikliği anında saklar; bu seçenek ise belirli anlarda ayrı, kalıcı <b>sürüm</b> oluşturur. Aynı içerik iki kez kaydedilmez. Sınır aşılınca yalnız en eski otomatik sürümler silinir — elle kaydedilen ve kurtarma sürümleri asla silinmez.</p>
    <label class="vr-chk"><input type="checkbox" data-vs="auto" ${c.auto ? 'checked' : ''}> Otomatik proje sürümlerini aç</label>
    <div class="vr-set-g"><label class="vr-chk"><input type="checkbox" data-vs="daily" ${c.daily ? 'checked' : ''}> Günde bir (proje açıldığında)</label>
      <label class="vr-chk"><input type="checkbox" data-vs="beforeExport" ${c.beforeExport ? 'checked' : ''}> Pafta dışa aktarmadan önce</label>
      <label class="vr-chk"><input type="checkbox" data-vs="onRevCode" ${c.onRevCode ? 'checked' : ''}> Revizyon kodu değişince</label></div>
    <div class="grid2"><label>En çok otomatik sürüm (proje başına)<input class="inp" type="number" min="1" max="500" data-vs="maxAuto" value="${c.maxAuto}"></label>
      <label>Otomatik sürümler için en çok alan (MB)<input class="inp" type="number" min="5" max="5000" data-vs="maxMB" value="${c.maxMB}"></label></div></fieldset>`;
}
export function readAutoSettings(el) {
  const o = { ...DEFAULT_VERSION_SETTINGS };
  el.querySelectorAll('[data-vs]').forEach(i => { o[i.dataset.vs] = i.type === 'checkbox' ? i.checked : Math.max(1, Math.round(+i.value || DEFAULT_VERSION_SETTINGS[i.dataset.vs])); });
  return o;
}
export { APP_VERSION };
