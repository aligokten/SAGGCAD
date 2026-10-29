/* ═══ SAGGCAD — bağımsız rölöve ve mimari çizim programı ═══
 * Ekranlar: Projeler → Proje (çizimler, krokiler) → Çizim (2D editör + 3D + render).
 * Çizim motoru (plan2d / plan3d / içe-dışa aktarma / mutfak-dolap / çatı / merdiven) TadilatBodrum Saha
 * uygulamasının "Rölöve & 3D" modülünden alınmıştır; burada iş takibinden bağımsız çalışır.
 */
import { uid, newProject, listProjects, getProject, saveProject, deleteProject, putBlob, blobUrl, compressImage, loadSettings, saveSettings, exportProject, importProject } from './store.js';
import { icon, esc, h, $, $$, toast, modal, confirmDlg, promptDlg, fmtNum, fmtDate, debounce, downloadBlob } from './ui.js';
import { PlanEditor, planThumbSvg, planImageUrl, planSheetView, TOOLS } from './plan2d.js';
import { scaleOf, unitOf, kotM, UNITS, SCALES } from './units.js';
import { levelName, planLevels } from './plan-geom.js';
import { viewsOf } from './sections.js';
import { mountMenubar, mountNavigator, mountStatusbar, openPalette, bindPaletteKey, WORKSPACES, getWorkspace, setWorkspaceKey, getTheme, toggleTheme, applyTheme } from './workbench.js';
import { useName, modelName } from './openings.js';
import { emptyPlan, planMetrics, roomMetrics } from './plan-geom.js';
import { samplePlan } from './sample.js';
import { printDoc, docHeader, docFooter } from './print.js';

const S = { settings: null, project: null, editor: null, p3: null, dw: null };
window.SAGGCAD = S;   // tarayıcı konsolundan erişim (otomasyon / hata ayıklama)
const view = () => $('#view');

/* ── kayıt ── */
let saveUI = null;      // durum çubuğundaki otomatik kayıt göstergesi (çizim ekranında)
let unbindKeys = null;  // ekrana özel klavye kısayolları
const hhmm = () => new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
const persist = debounce(p => saveProject(p).then(() => saveUI?.('ok', hhmm())).catch(e => { saveUI?.('err'); toast('Kaydedilemedi: ' + e.message, 'err'); }), 400);
const save = () => { if (!S.project) return; saveUI?.('busy'); persist(S.project); };
const saveSet = () => saveSettings(S.settings).catch(() => {});

/* belge / etiket modülleri "iş" nesnesi bekler: projeyi o biçime çevir */
const jobOf = p => ({ id: p.id, code: p.name, customer: { name: p.client || '' }, plan: mainOf(p).plan, kesifDate: p.createdAt });

/* ── çizimler ── */
const DRAW_KINDS = [{ k: 'proje', t: 'Proje / tasarım' }, { k: 'rolove', t: 'Rölöve (ek)' }, { k: 'diger', t: 'Diğer' }];
const kindOf = k => DRAW_KINDS.find(x => x.k === k) || DRAW_KINDS[0];
const mainOf = p => p.drawings.find(d => d.main) || p.drawings[0];
const drawingOf = (p, id) => p.drawings.find(d => d.id === id) || mainOf(p);
const anyLv = (p, k) => !!p && [p, ...(p.levels || []).filter(l => l.kind !== 'roof')].some(x => x[k]?.length);
const hasContent = p => !!(p?.walls?.length || p?.rooms?.length || p?.items?.length || p?.rails?.length);
const clonePlan = p => p ? JSON.parse(JSON.stringify(p)) : emptyPlan();
const slug = s => String(s || 'cizim').normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/ı/g, 'i').replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'cizim';
const planUrl = (p, d, extra = '') => `#/p/${p.id}/plan?d=${d.id}${extra}`;

/* ── görseller (kroki, altlık, render) ── */
async function addBlobPhoto(blob, meta = {}) {
  const id = uid('ph');
  await putBlob(id, blob);
  const ph = { id, tag: meta.tag || 'rolove', caption: meta.caption || '', t: Date.now() };
  S.project.photos.push(ph); save();
  return ph;
}
async function addPhotos(files, meta) {
  const out = [];
  for (const f of files) { const { blob } = await compressImage(f); out.push(await addBlobPhoto(blob, { ...meta, caption: meta?.caption || f.name.replace(/\.[^.]+$/, '') })); }
  return out;
}
const hydratePhotos = root => $$('img[data-src]', root).forEach(img => blobUrl(img.dataset.src).then(u => { img.src = u; }));

async function pickPhoto() {
  const p = S.project;
  const body = h(`<div><label class="btn btn-primary">${icon('upload')}Yeni görsel yükle<input type="file" accept="image/*" hidden></label>
    <div class="gallery pick">${p.photos.map(x => `<button class="gimg" data-id="${x.id}"><img data-src="${x.id}" alt=""><span>${esc(x.caption)}</span></button>`).join('')}</div></div>`);
  hydratePhotos(body);
  return new Promise(res => {
    let done = false;
    modal({ title: 'Görsel seç', body, wide: true, actions: [{ k: 'no', t: 'Vazgeç' }],
      onOpen: (el, close) => {
        $('input', el).onchange = async e => { const [ph] = await addPhotos(e.target.files, { tag: 'rolove' }); done = true; res(ph); close(null); };
        el.onclick = e => { const b = e.target.closest('[data-id]'); if (b) { done = true; res(p.photos.find(x => x.id === b.dataset.id)); close(null); } };
      } }).then(() => { if (!done) res(null); });
  });
}

/* ═════════ yönlendirme ═════════ */
async function route() {
  if (S.project) await saveProject(S.project).catch(() => {});   // bekleyen kaydı ekran değişmeden yaz
  teardownPlan();
  saveUI = null; unbindKeys?.(); unbindKeys = null;
  document.body.classList.remove('plan-mode');
  const [path] = location.hash.slice(1).split('?');
  const parts = path.split('/').filter(Boolean);
  try {
    if (parts[0] === 'p' && parts[1]) {
      if (S.project?.id !== parts[1]) S.project = await getProject(parts[1]);
      if (!S.project) { location.hash = '#/'; return; }
      return parts[2] === 'plan' ? planScreen() : projectScreen();
    }
    S.project = null;
    return homeScreen();
  } catch (e) {
    console.error(e);
    view().innerHTML = `<div class="card empty"><b>Bir hata oluştu</b><p class="muted">${esc(e.message)}</p><a class="btn btn-primary" href="#/">Projelere dön</a></div>`;
  }
}

const topbar = (crumbs = '') => `<header class="sc-top">
  <a class="sc-brand" href="#/">SAGG<span>CAD</span></a>${crumbs}
  <div class="sc-top-act">
    <button class="wb-search hide-m" data-cmdk title="Komut ara (Ctrl+K)">${icon('search')}<span>Komut ara</span><kbd>Ctrl K</kbd></button>
    <button class="icon-btn" data-theme-t title="Açık / koyu tema">${icon(getTheme() === 'dark' ? 'sun' : 'eye')}</button>
    <button class="btn btn-ghost btn-sm" data-settings>${icon('settings')}<span>Ayarlar</span></button></div>
</header>`;
/* projeler / proje ekranı: üst çubuk düğmeleri ve komut paleti */
function bindTop() {
  $('[data-settings]')?.addEventListener('click', settingsDialog);
  const cmds = () => [
    { id: 'home.new', cat: 'file', t: 'Yeni proje…', ic: 'plus', run: newProjectDialog },
    ...(S.project ? [
      { id: 'proj.draw', cat: 'file', t: 'Rölöve çizimini aç', ic: 'edit', run: () => { location.hash = planUrl(S.project, mainOf(S.project)); } },
      { id: 'proj.newdw', cat: 'file', t: 'Yeni çizim…', ic: 'plus', run: () => newDrawingDialog(S.project) },
      { id: 'proj.exp', cat: 'file', t: 'Proje dosyasını indir', ic: 'download', run: async () => downloadBlob(await exportProject(S.project), `${slug(S.project.name)}.saggcad.json`) },
    ] : []),
    { id: 'home.list', cat: 'file', t: 'Tüm projeler', ic: 'home', run: () => { location.hash = '#/'; } },
    { id: 'home.settings', cat: 'tools', t: 'Ayarlar…', ic: 'settings', run: settingsDialog },
    { id: 'home.theme', cat: 'view', t: 'Koyu tema', run: () => { toggleTheme(); route(); }, on: () => getTheme() === 'dark' },
  ];
  $('[data-cmdk]')?.addEventListener('click', () => openPalette(cmds));
  $('[data-theme-t]')?.addEventListener('click', () => { toggleTheme(); route(); });
  unbindKeys?.(); unbindKeys = bindPaletteKey(cmds);
}

/* ═════════ projeler ═════════ */
async function homeScreen() {
  const list = await listProjects();
  view().innerHTML = `${topbar()}
  <div class="sc-page">
    <div class="row-between"><h2>Projeler <small class="muted">${list.length}</small></h2>
      <div class="row wrap">
        <label class="btn btn-ghost btn-sm">${icon('upload')}Proje dosyası aç<input type="file" accept=".json,.saggcad,application/json" hidden data-imp></label>
        <button class="btn btn-primary btn-sm" data-new>${icon('plus')}Yeni proje</button></div></div>
    ${list.length ? `<div class="dw-list">${list.map(p => {
      const m = mainOf(p), has = hasContent(m.plan);
      return `<div class="dw-card" data-p="${p.id}">
        <a class="thumb-wrap" href="#/p/${p.id}">${has ? planThumbSvg(m.plan) : `<div class="dw-empty">${icon('ruler')}<span>Boş proje</span></div>`}</a>
        <div class="dw-info"><div class="dw-t"><b>${esc(p.name)}</b><span class="dw-kind">${p.drawings.length} çizim</span></div>
          <p class="muted small">${p.client ? esc(p.client) + ' · ' : ''}Son değişiklik ${fmtDate(p.updatedAt, true)}</p>
          <div class="row wrap"><a class="btn btn-primary btn-sm" href="#/p/${p.id}/plan?d=${m.id}">${icon('edit')}Çizimi aç</a>
            <a class="btn btn-ghost btn-sm" href="#/p/${p.id}">${icon('layers')}Proje</a>
            <button class="btn btn-ghost btn-sm" data-pa="exp" title="Proje dosyasını indir (yedek / başka cihaza taşıma)">${icon('download')}</button>
            <button class="btn btn-ghost btn-sm danger-t" data-pa="del" title="Sil">${icon('trash')}</button></div></div></div>`;
    }).join('')}</div>`
    : `<div class="card empty"><div class="empty-ic">${icon('ruler')}</div><b>Henüz proje yok</b>
        <p class="muted">Yeni bir proje açıp ölçtüğünüz mahalleri duvar, kapı, pencere ve donatılarıyla çizin; plan otomatik olarak 3D modele dönüşür.
        Mevcut bir AutoCAD DXF'ini ya da plan PDF'ini de içe aktarabilirsiniz.</p>
        <button class="btn btn-primary" data-new>${icon('plus')}Yeni proje</button></div>`}
  </div>`;
  bindTop();
  $$('[data-new]').forEach(b => b.onclick = newProjectDialog);
  $('[data-imp]').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    try { const p = await importProject(await f.text()); toast(`"${p.name}" açıldı`); location.hash = `#/p/${p.id}`; }
    catch (err) { toast('Dosya açılamadı: ' + err.message, 'err'); }
  };
  $$('[data-pa]').forEach(b => b.onclick = async () => {
    const p = list.find(x => x.id === b.closest('[data-p]').dataset.p);
    if (b.dataset.pa === 'exp') return downloadBlob(await exportProject(p), `${slug(p.name)}.saggcad.json`);
    if (!await confirmDlg(`"${p.name}" projesi ve tüm çizimleri silinecek.`)) return;
    await deleteProject(p); toast('Proje silindi'); homeScreen();
  });
}

async function newProjectDialog() {
  const r = await modal({ title: 'Yeni proje', body: `
    <div class="grid2"><label>Proje adı<input class="inp" id="npn" placeholder="ör. Yalıkavak villa"></label>
      <label>Müşteri / mal sahibi<input class="inp" id="npc" placeholder="isteğe bağlı"></label></div>
    <label>Başlangıç<select class="inp" id="nps"><option value="empty">Boş çizim</option><option value="import">DXF / PDF'ten aktar</option><option value="sample">Örnek plan (araçları denemek için)</option></select></label>`,
    actions: [{ k: 'no', t: 'Vazgeç' }, { k: 'ok', t: 'Oluştur', cls: 'btn-primary' }] });
  if (r?.k !== 'ok') return;
  const start = $('#nps', r.el).value;
  const p = newProject($('#npn', r.el).value.trim() || `Proje ${new Date().toLocaleDateString('tr-TR')}`, start === 'sample' ? samplePlan() : emptyPlan());
  p.client = $('#npc', r.el).value.trim();
  await saveProject(p);
  S.project = p;
  location.hash = planUrl(p, mainOf(p), start === 'import' ? '&import=1' : '');
}

async function settingsDialog() {
  const c = S.settings.company;
  const f = (k, t, ph = '') => `<label>${t}<input class="inp" data-c="${k}" value="${esc(c[k] || '')}" placeholder="${ph}"></label>`;
  const r = await modal({ title: 'Ayarlar', body: `
    <p class="muted small">Firma bilgileri PDF belgelerin (doğrama listesi, zemin sipariş listesi, dolap çizimleri) ve parça etiketlerinin başlığında görünür.</p>
    <div class="grid2">${f('name', 'Firma / ofis adı')}${f('phone', 'Telefon')}${f('email', 'E-posta')}${f('web', 'Web sitesi')}</div>
    ${f('address', 'Adres')}`,
    actions: [{ k: 'no', t: 'Vazgeç' }, { k: 'ok', t: 'Kaydet', cls: 'btn-primary' }] });
  if (r?.k !== 'ok') return;
  $$('[data-c]', r.el).forEach(i => { c[i.dataset.c] = i.value.trim(); });
  await saveSettings(S.settings); toast('Ayarlar kaydedildi');
}

/* ═════════ proje: çizimler ve krokiler ═════════ */
function projectScreen() {
  const p = S.project;
  const card = d => {
    const has = hasContent(d.plan), met = planMetrics(d.plan), url = planUrl(p, d);
    return `<div class="dw-card ${d.main ? 'main' : ''}" data-dw="${d.id}">
      <a class="thumb-wrap" href="${url}">${has ? planThumbSvg(d.plan) : `<div class="dw-empty">${icon('ruler')}<span>Boş çizim</span></div>`}</a>
      <div class="dw-info">
        <div class="dw-t"><b>${esc(d.name)}</b><span class="dw-kind k-${d.kind}">${d.main ? 'Rölöve' : kindOf(d.kind).t}</span></div>
        ${has ? `<div class="met-chips sm"><span><small>Mahal</small><b>${met.rooms.length}</b></span><span><small>Zemin</small><b>${fmtNum(met.floor)} m²</b></span><span><small>Net duvar</small><b>${fmtNum(met.wall)} m²</b></span></div>` : `<p class="muted small">${d.main ? 'Ölçtüğünüz mahalleri duvar, kapı, pencere ve donatılarıyla çizin; plan otomatik olarak 3D modele dönüşür.' : 'Henüz çizim yok.'}</p>`}
        <div class="row wrap">
          <a class="btn btn-primary btn-sm" href="${url}">${icon('edit')}${has ? 'Aç' : 'Çizime başla'}</a>
          ${has ? `<a class="btn btn-ghost btn-sm" href="${url}&v=3d">${icon('cube')}3D</a><a class="btn btn-ghost btn-sm" href="${url}&v=3d&r=1">${icon('sparkle')}Render</a>` : ''}
          ${!has ? `<a class="btn btn-ghost btn-sm" href="${url}&import=1">${icon('upload')}DXF / PDF aktar</a>` : ''}
          ${d.main && !has ? `<button class="btn btn-ghost btn-sm" data-dwa="tpl">${icon('layers')}Örnek plan</button>` : ''}
          ${anyLv(d.plan, 'openings') ? `<button class="btn btn-ghost btn-sm" data-dwa="jn" title="Kapı / pencere listesi, ölçülü (PDF)">${icon('print')}Doğrama listesi</button>` : ''}
          ${anyLv(d.plan, 'rooms') ? `<button class="btn btn-ghost btn-sm" data-dwa="fl" title="Zemin kaplaması malzemelerine göre sipariş listesi (PDF)">${icon('layers')}Zemin sipariş listesi</button>` : ''}
          ${has ? `<button class="btn btn-ghost btn-sm" data-dwa="copy" title="Kopyasını oluştur">${icon('copy')}</button>` : ''}
          <button class="btn btn-ghost btn-sm" data-dwa="ren" title="Yeniden adlandır">${icon('edit')}</button>
          ${d.main ? '' : `<button class="btn btn-ghost btn-sm danger-t" data-dwa="del" title="Sil">${icon('trash')}</button>`}
        </div>
      </div>
    </div>`;
  };
  const photos = p.photos;
  view().innerHTML = `${topbar(`<span class="sc-crumb">›</span><b class="sc-crumb">${esc(p.name)}</b>`)}
  <div class="sc-page">
    <div class="card">
      <div class="row-between"><h3>Proje bilgisi</h3><button class="btn btn-ghost btn-sm" data-exp>${icon('download')}Proje dosyasını indir</button></div>
      <div class="grid3">
        <label>Proje adı<input class="inp" data-f="name" value="${esc(p.name)}"></label>
        <label>Müşteri / mal sahibi<input class="inp" data-f="client" value="${esc(p.client)}"></label>
        <label>Adres<input class="inp" data-f="address" value="${esc(p.address)}"></label></div>
      <label>Not<textarea class="inp" rows="2" data-f="note">${esc(p.note)}</textarea></label>
    </div>
    <div class="card plan-card">
      <div class="row-between"><h3>Çizimler <small class="muted">${p.drawings.length}</small></h3>
        <div class="row wrap"><button class="btn btn-ghost btn-sm" data-sketch title="Kağıt üzerinde çizip ölçü almak için ızgaralı A4 altlık">${icon('ruler')}Çizim altlığı (A4)</button><button class="btn btn-primary btn-sm" data-newdw>${icon('plus')}Yeni çizim</button></div></div>
      <p class="muted small">Rölöve mevcut durumu gösterir. Yeni düzen için "Proje" çizimi ekleyin; rölöve proje çiziminde soluk altlık olarak görünür. Birden fazla seçenek de hazırlayabilirsiniz.</p>
      <div class="dw-list">${p.drawings.map(card).join('')}</div>
    </div>
    <div class="card">
      <div class="row-between"><h3>Kroki, rölöve fotoğrafları ve renderlar</h3>
        <label class="btn btn-ghost btn-sm">${icon('upload')}Kroki ekle<input type="file" accept="image/*" multiple hidden data-up></label></div>
      <div class="gallery">${photos.map(x => `<div class="gimg" data-ph="${x.id}"><img data-src="${x.id}" alt=""><span>${esc(x.caption)}</span><button class="icon-btn" data-phd title="Sil">${icon('trash')}</button></div>`).join('') || '<p class="muted small">Elle çizilmiş krokilerin fotoğrafını ekleyin; çizim editöründe "Altlık" olarak kullanıp üzerinden ölçekli çizebilirsiniz.</p>'}</div>
    </div>
  </div>`;
  bindTop();
  hydratePhotos(view());
  $$('[data-f]').forEach(i => i.oninput = () => { p[i.dataset.f] = i.value; save(); });
  $('[data-exp]').onclick = async () => downloadBlob(await exportProject(p), `${slug(p.name)}.saggcad.json`);
  $('[data-newdw]').onclick = () => newDrawingDialog(p);
  $('[data-sketch]').onclick = async () => { const { sketchDialog } = await import('./forms.js'); sketchDialog({ job: jobOf(p), settings: S.settings, fname: `${slug(p.name)}-rolove-altligi` }); };
  $$('[data-dwa]').forEach(b => b.onclick = async () => {
    const id = b.closest('[data-dw]').dataset.dw, d = drawingOf(p, id), a = b.dataset.dwa;
    if (a === 'jn') return printJoinery(p, d, d.plan);
    if (a === 'fl') return printFloorOrder(p, d, d.plan);
    if (a === 'tpl') { d.plan = samplePlan(); save(); location.hash = planUrl(p, d); return; }
    if (a === 'del') { if (!await confirmDlg(`"${d.name}" çizimi silinecek.`)) return; p.drawings = p.drawings.filter(x => x.id !== id); }
    if (a === 'ren') { const n = await promptDlg('Çizimin adı', d.name); if (!n?.trim()) return; d.name = n.trim(); d.updatedAt = Date.now(); }
    if (a === 'copy') p.drawings.push({ id: uid('dw'), name: `${d.name} (kopya)`, kind: d.main ? 'proje' : d.kind, plan: clonePlan(d.plan), createdAt: Date.now(), updatedAt: Date.now() });
    save(); projectScreen();
  });
  $('[data-up]').onchange = async e => { await addPhotos(e.target.files, { tag: 'rolove' }); projectScreen(); };
  $$('[data-phd]').forEach(b => b.onclick = async () => {
    const id = b.closest('[data-ph]').dataset.ph;
    if (!await confirmDlg('Görsel silinecek.')) return;
    p.photos = p.photos.filter(x => x.id !== id);
    for (const d of p.drawings) if (d.plan?.meta?.bg?.photoId === id) d.plan.meta.bg = null;
    save(); projectScreen();
  });
}

async function newDrawingDialog(p, then) {
  const n = p.drawings.filter(d => d.kind === 'proje').length + 1;
  const srcs = p.drawings.filter(d => hasContent(d.plan));
  const r = await modal({ title: 'Yeni çizim', body: `
    <div class="grid2">
      <label>Ad<input class="inp" id="dwn" value="Proje ${n}"></label>
      <label>Tür<select class="inp" id="dwk">${DRAW_KINDS.map(k => `<option value="${k.k}">${k.t}</option>`).join('')}</select></label>
    </div>
    <label>Başlangıç<select class="inp" id="dws">
      ${srcs.map((d, i) => `<option value="${d.id}" ${i === 0 ? 'selected' : ''}>"${esc(d.name)}" çiziminin kopyasından</option>`).join('')}
      <option value="" ${srcs.length ? '' : 'selected'}>Boş çizim</option></select></label>
    <p class="muted small">Proje çizimini rölövenin kopyasından başlatın; duvar yıkıp ekleyin, mahalleri ve mutfak / dolapları yeniden düzenleyin. Rölöve çizimi değişmeden kalır ve projede soluk altlık olarak görünür.</p>`,
    actions: [{ k: 'no', t: 'Vazgeç' }, { k: 'ok', t: 'Oluştur', cls: 'btn-primary' }] });
  if (r?.k !== 'ok') return;
  const src = $('#dws', r.el).value;
  const d = { id: uid('dw'), name: $('#dwn', r.el).value.trim() || `Proje ${n}`, kind: $('#dwk', r.el).value, plan: src ? clonePlan(drawingOf(p, src).plan) : emptyPlan(), createdAt: Date.now(), updatedAt: Date.now() };
  if (d.plan.meta && !src) d.plan.meta.bg = null;
  p.drawings.push(d); save();
  then ? then(d) : (location.hash = planUrl(p, d));
}

/* ═════════ çizim ekranı (2D editör + 3D + render) ═════════ */
function teardownPlan() {
  S.editor?.destroy(); S.editor = null;
  S.p3?.dispose(); S.p3 = null;
}

function planScreen() {
  const p = S.project;
  const qs = new URLSearchParams(location.hash.split('?')[1] || '');
  const dw = drawingOf(p, qs.get('d'));
  dw.plan ??= emptyPlan();
  S.dw = dw;
  const main = mainOf(p);
  const small = matchMedia('(max-width: 860px)').matches;
  let ws = getWorkspace();
  let mode = qs.get('v') === '3d' ? '3d' : (ws && !small ? ws.mode : '2d');
  if (small && mode === 'split') mode = '2d';
  let navOn = small ? false : (localStorage.getItem('sg-nav-off') !== '1');
  document.body.classList.add('plan-mode');
  view().innerHTML = `<div class="plan-screen" data-mode="${mode}">
    <header class="ps-head">
      <a href="#/p/${p.id}" class="icon-btn" aria-label="Projeye dön" title="Projeye dön">${icon('back')}</a>
      <a class="wb-mark" href="#/" title="Projeler">SAGG<i>CAD</i></a>
      <button class="icon-btn wb-burger" data-burger aria-label="Menü ve komutlar" title="Menü ve komutlar">${icon('menu')}</button>
      <nav class="wb-menu" id="wbMenu" aria-label="Ana menü"></nav>
      <div class="ps-t"><b>${esc(p.name)}</b>
        <select class="ps-dw" id="psDw" aria-label="Çizim">${p.drawings.map(d => `<option value="${d.id}" ${d.id === dw.id ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}<option value="+">+ Yeni çizim…</option></select></div>
      <select class="wb-ws hide-m" id="wbWs" title="Çalışma alanı ön ayarı" aria-label="Çalışma alanı">${['<option value="">Çalışma alanı…</option>', ...WORKSPACES.map(w => `<option value="${w.k}" ${ws?.k === w.k ? 'selected' : ''}>${esc(w.t)}</option>`)].join('')}</select>
      <div class="seg big" id="psMode"><button data-m="2d">2D</button><button data-m="3d">${icon('cube')}3D</button><button data-m="split" class="hide-m">Yan yana</button></div>
      <div class="ps-act">
        <button class="wb-search hide-m" data-cmdk title="Komut ara (Ctrl+K)">${icon('search')}<span>Komut ara</span><kbd>Ctrl K</kbd></button>
        <button class="icon-btn" data-views title="Kesit ve görünüşler">${icon('eye')}</button>
        <button class="icon-btn" data-exp title="Dışa aktar">${icon('download')}</button>
        <button class="btn btn-primary btn-sm" data-render>${icon('sparkle')}<span>Render</span></button>
      </div>
    </header>
    <div class="ps-body">
      <aside class="ps-nav" id="psNav" aria-label="Proje gezgini"></aside>
      <div class="ps-2d" id="ps2d"></div>
      <div class="ps-3d" id="ps3d">
        <div class="p3-bar">
          <div class="seg" id="cam"><button data-c="orbit" class="on">Kuşbakışı</button><button data-c="top">Üstten</button><button data-c="interior">${icon('walk')}İç mekan</button></div>
          <select class="inp mini" id="p3room" hidden></select>
          <button class="tgl" data-t="cut">${icon('layers')}<span>Kesit</span></button>
          <button class="tgl" data-t="ceiling">${icon('home')}<span>Tavan</span></button>
          <label class="sl">${icon('sun2')}<input type="range" min="0" max="360" step="5" id="sunAz" title="Güneş yönü"></label>
          <label class="sl">↕<input type="range" min="5" max="85" step="1" id="sunEl" title="Güneş yüksekliği"></label>
          <label class="sl">☀︎<input type="range" min="0.4" max="2" step="0.05" id="expo" title="Pozlama"></label>
        </div>
        <div class="p3-host" id="p3host"><div class="p3-load"><div class="spin"></div><p>3D model hazırlanıyor…</p></div></div>
        <p class="p3-hint" id="p3hint">Sürükle: döndür · iki parmak / sağ tık: kaydır · tekerlek / kıstırma: yakınlaştır</p>
      </div>
    </div>
    <footer class="ps-status" id="psStatus"></footer>
  </div>`;
  const root = $('.plan-screen');
  root.classList.toggle('nav-off', !navOn);
  const sync3d = debounce(() => S.p3?.setPlan(S.editor.root), 350);
  const refresh = debounce(() => { nav?.render(); sb?.render(); }, 120);
  S.editor = new PlanEditor($('#ps2d'), dw.plan, {
    onChange: pl => { dw.plan = pl; dw.updatedAt = Date.now(); save(); if (mode !== '2d') sync3d(); refresh(); },
    onLevel: lv => { if (S.p3) { S.p3.opt.level = lv; S.p3.build(); } refresh(); },
    views: id => openViews(id),
    // proje çiziminde rölöve (mevcut durum) soluk altlık olarak görünür
    ghost: !dw.main && hasContent(main.plan) ? main.plan : null,
    resolvePhoto: id => blobUrl(id),
    pickBackground: pickPhoto,
    addImage: (blob, caption) => addBlobPhoto(blob, { tag: 'rolove', caption }),
    cab: {
      // bağımsız sürümde teklif modülü yok: dolap kalemleri metin olarak kopyalanır
      addQuoteItems: async items => {
        const txt = items.map(i => `${i.desc} — ${fmtNum(i.qty)} ${i.unit}${i.price ? ` × ${fmtNum(i.price)}` : ''}`).join('\n');
        try { await navigator.clipboard.writeText(txt); toast(`${items.length} kalem panoya kopyalandı`); } catch { modal({ title: 'Kalemler', body: `<textarea class="inp" rows="10" style="width:100%">${esc(txt)}</textarea>` }); }
      },
      printSheet: (title, body) => printDoc(`<div class="pdoc">${docHeader(S.settings, title, metaLine(p))}${body}${docFooter()}</div>`, `${title} ${p.name}`),
      priceOf: (k, def) => S.settings.catalog?.find(c => c.id === k)?.price ?? def,
      settings: S.settings, saveSettings: saveSet, job: jobOf(p), montajFor: () => null,
    },
  });
  const E = S.editor;
  const setMode = async m => {
    if (small && m === 'split') m = '2d';
    mode = m; root.dataset.mode = m;
    $$('#psMode button').forEach(b => b.classList.toggle('on', b.dataset.m === m));
    if (m !== '2d') await ensure3d();
    setTimeout(() => { S.editor?.render(); S.p3?.resize(); }, 50);
    nav?.render();
  };
  const setNav = on => { navOn = on; root.classList.toggle('nav-off', !on); if (!small) localStorage.setItem('sg-nav-off', on ? '0' : '1'); setTimeout(() => { S.editor?.render(); S.p3?.resize(); }, 30); };
  const applyWs = w => {
    ws = w; setWorkspaceKey(w.k); $('#wbWs').value = w.k;
    E.setToolGroups(w.groups); E.toggleInsp(w.insp); if (!small) setNav(w.nav);
    setMode(w.mode); toast(`Çalışma alanı: ${w.t}`);
  };
  $('#psMode').onclick = e => { const b = e.target.closest('[data-m]'); if (b) setMode(b.dataset.m); };
  $('#psDw').onchange = e => {
    const v = e.target.value;
    if (v === '+') { e.target.value = dw.id; return newDrawingDialog(p); }
    location.hash = planUrl(p, drawingOf(p, v), mode !== '2d' ? '&v=3d' : '');
  };
  $('#wbWs').onchange = e => { const w = WORKSPACES.find(x => x.k === e.target.value); if (w) applyWs(w); };
  if (ws) E.setToolGroups(ws.groups);
  const fname = ext => `${slug(p.name)}-${slug(dw.main ? 'rolove' : dw.name)}.${ext}`;
  const sheetMeta = () => ({ project: p.name, client: p.client, company: S.settings.company?.name || '', unit: unitOf(S.editor.root).k });
  const openViews = async id => {
    const { openViews: ov } = await import('./sections.js');
    ov(S.editor.root, { focus: id, ...sheetMeta(), fname: fname('x').replace(/\.x$/, '') });
  };
  // 3D model: görünür 3D yoksa geçici, ekran dışı bir görüntüleyici kurulur
  const with3d = async fn => {
    if (S.p3) { S.p3.setPlan(S.editor.root); return fn(S.p3); }
    const { Plan3D } = await import('./plan3d.js');
    const host = h('<div style="position:fixed;left:-3000px;top:0;width:400px;height:300px"></div>'); document.body.append(host);
    const p3 = new Plan3D(host);
    try { await p3.init(); p3.opt.level = S.editor.lv; p3.setPlan(S.editor.root); return await fn(p3); } finally { p3.dispose(); host.remove(); }
  };
  const EXPORTS = [
    ['dxf2', '2D çizim', 'DXF', 'AutoCAD / ArchiCAD / NanoCAD — duvar, kapı, pencere, oda, mobilya, ölçü katmanlarıyla (mm)'],
    ['png', '2D çizim', 'PNG', 'Plan görseli — proje görsellerine de kaydedilir'],
    ['pafta', '2D çizim', 'Ölçekli pafta (PDF)', 'Etkin kat planı gerçek ölçekte, antetli; ölçek ve birim Çizim ayarlarından'],
    ['views', 'Kesit / görünüş', 'Kesit ve cepheler', 'Dört cephe ve kesit hatları — otomatik ölçü ve kotlarla PDF, SVG, DXF'],
    ['etiket', 'Etiket', 'Parça etiketleri (10 × 6 cm PDF)', 'Dolap parçaları ve kapı / pencereler için QR kodlu, barkodlu etiketler — her sayfa bir etiket'],
    ['cnc', 'Mutfak / dolap', 'CNC kesim şablonu (DXF)', 'Çizimdeki tüm mutfak ve dolapların parçaları levhalara yerleşik; menteşe ve raf pimi delikleri, kenar bandı işaretli'],
    ['dograma', 'Liste', 'Doğrama listesi (PDF)', 'Kapı ve pencereler: poz numaraları, ölçülü görünüşler, imalat ölçüleri, adet ve m²'],
    ['zemin', 'Liste', 'Zemin sipariş listesi (PDF)', 'Zemin kaplamaları malzemeye göre: karo adedi ve kutu, parke / laminat paketi, yapıştırıcı, derz dolgu, şilte, süpürgelik'],
    ['dae', '3D model', 'SketchUp (.dae)', 'SketchUp: Dosya → İçe aktar → Collada; malzeme renkleriyle'],
    ['3ds', '3D model', '3DS', '3ds Max, SketchUp Pro, Rhino, Blender (cm)'],
    ['stl', '3D model', 'STL', '3D yazıcı / CAD (mm)'],
    ['dxf3', '3D model', 'DXF 3D', 'AutoCAD 3D — 3DFACE yüzeyler, katman = nesne (mm)'],
    ['glb', '3D model', 'GLB', 'Web, AR, Blender — dokularıyla'],
  ];
  const exportDialog = async () => {
    if (!hasContent(S.editor.root)) return toast('Çizim boş', 'err');
    const r = await modal({ title: `Dışa aktar — ${dw.name}`, body: `<div class="exp-list">${EXPORTS.map(([k, g, t, d]) => `<button class="exp-opt" data-x="${k}"><small>${g}</small><b>${k === 'pafta' ? `Ölçekli pafta 1:${scaleOf(S.editor.root)} (PDF)` : t}</b><span>${d}</span></button>`).join('')}</div>
      <p class="muted small">SketchUp'ın kendi .skp biçimi kapalı bir formattır ve tarayıcıda yazılamaz; SketchUp, .dae (Collada) dosyasını doğrudan içe aktarır ve kaydettiğinizde .skp olur.</p>`,
      actions: [{ k: 'no', t: 'Kapat' }], onOpen: (el, close) => el.onclick = e => { const b = e.target.closest('[data-x]'); if (b) close({ k: b.dataset.x }); } });
    const k = r?.k; if (k && k !== 'no') doExport(k);
  };
  const doExport = async k => {
    if (!hasContent(S.editor.root)) return toast('Çizim boş', 'err');
    try {
      if (k === 'png') return savePng();
      if (k === 'views') return openViews(null);
      if (k === 'pafta') {
        const R = S.editor.root, N = scaleOf(R), V0 = planSheetView(R, S.editor.plan, N, `${dw.name} — ${levelName(R, S.editor.lv)}`);
        if (!V0) return toast('Plan boş', 'err');
        const { sheetSvg, sheetPdf } = await import('./sections.js');
        const sh = sheetSvg(V0, sheetMeta());
        downloadBlob(await sheetPdf([sh]), fname(`1-${N}.pdf`));
        return toast(`Pafta indirildi (${sh.paper.k}) — %100 / "gerçek boyut" ile yazdırın`);
      }
      if (k === 'dograma') return printJoinery(p, dw, S.editor.root);
      if (k === 'zemin') return printFloorOrder(p, dw, S.editor.root);
      if (k === 'etiket') {
        const cabs = S.editor.plan.items.filter(it => it.type === 'cabinet' && it.cab).map((it, i) => ({ cab: it.cab, label: it.label || `Dolap ${i + 1}` }));
        // doğrama etiketleri tüm katlar için (numaralar doğrama listesiyle aynı)
        const R = S.editor.root, allO = [R, ...(R.levels || [])].flatMap(x => x.openings || []);
        const off = new Set(p.jnOff?.[dw.id] || []), jnOnly = off.size ? new Set(allO.map(o => o.id).filter(id => !off.has(id))) : null;
        const { labelsDialog } = await import('./labels.js');
        return labelsDialog({ cabs, plan: R, job: jobOf(p), settings: S.settings, fname: fname('x').replace(/\.x$/, ''), jnOnly, montaj: null });
      }
      if (k === 'cnc') {
        const cabs = S.editor.plan.items.filter(it => it.type === 'cabinet' && it.cab).map((it, i) => ({ cab: it.cab, label: it.label || `Dolap ${i + 1}` }));
        const { cncDialog } = await import('./cnc.js');
        return cncDialog(cabs, { title: `${p.name} ${dw.main ? 'Rolove' : dw.name}`, fname: fname('x').replace(/\.x$/, ''), settings: S.settings, saveSettings: saveSet });
      }
      if (k === 'dxf2') { const { planToDXF } = await import('./exporters.js'); downloadBlob(planToDXF(S.editor.plan), fname('dxf')); return toast('DXF indirildi'); }
      toast('3D model hazırlanıyor…');
      const ex = await import('./exporters.js');
      const blob = await with3d(async p3 => {
        if (k === 'glb') return p3.exportGLB();
        const gr = await p3.exportGroups();
        return { dae: () => ex.toDAE(gr, `${p.name} ${dw.name}`), '3ds': () => ex.to3DS(gr), stl: () => ex.toSTL(gr), dxf3: () => ex.toDXF3D(gr) }[k]();
      });
      downloadBlob(blob, fname({ dae: 'dae', '3ds': '3ds', stl: 'stl', dxf3: '3d.dxf', glb: 'glb' }[k]));
      toast(`${({ dae: 'SketchUp (.dae)', '3ds': '3DS', stl: 'STL', dxf3: 'DXF 3D', glb: 'GLB' })[k]} indirildi (${Math.max(1, Math.round(blob.size / 1024))} KB)`);
    } catch (e) { console.error(e); toast('Dışa aktarılamadı: ' + e.message, 'err'); }
  };
  const savePng = async () => {
    const blob = await S.editor.exportPng({ title: `${p.name} — ${dw.name}` });
    if (!blob) return toast('Plan boş', 'err');
    await addBlobPhoto(blob, { tag: 'rolove', caption: `${dw.main ? 'Rölöve planı' : dw.name} ` + new Date().toLocaleDateString('tr-TR') });
    downloadBlob(blob, fname('png'));
    toast('Plan görseli proje görsellerine kaydedildi');
  };
  const render = async () => { if (mode === '2d') await setMode('3d'); renderDialog(); };

  /* ── komutlar: menü çubuğu, komut paleti ve mobil menü ortak ── */
  const tool = t => () => { if (mode === '3d') setMode('2d'); E.setTool(t); };
  const toolCmds = (cat, groups) => TOOLS.filter(t => groups.includes(t.g)).map((t, i) => ({ id: 'tool.' + t.k, cat, t: t.t, k: t.key.toUpperCase(), ic: t.ic, kw: t.d, run: tool(t.k), on: () => E.tool === t.k, sep: i > 0 && TOOLS.filter(x => groups.includes(x.g))[i - 1].g !== t.g }));
  const opt = (k, t, key) => ({ id: 'opt.' + k, cat: 'view', t, k: key, run: () => E.setOpt(k, !E.opt[k]), on: () => !!E.opt[k] });
  const commands = () => [
    { id: 'file.new', cat: 'file', t: 'Yeni çizim…', ic: 'plus', run: () => newDrawingDialog(p) },
    { id: 'file.project', cat: 'file', t: 'Proje sayfasına dön', ic: 'back', run: () => { location.hash = `#/p/${p.id}`; } },
    { id: 'file.projects', cat: 'file', t: 'Tüm projeler', ic: 'home', run: () => { location.hash = '#/'; } },
    { id: 'file.import', cat: 'file', t: 'DXF / PDF içe aktar…', ic: 'upload', sep: true, run: () => { setMode(mode === '3d' ? '2d' : mode); E.importDialog(); } },
    { id: 'file.bg', cat: 'file', t: 'Altlık görseli…', ic: 'image', run: () => E.bgDialog() },
    { id: 'file.export', cat: 'file', t: 'Dışa aktar…', ic: 'download', k: 'Ctrl Shift E', sep: true, run: exportDialog },
    { id: 'file.dxf', cat: 'file', t: '2D DXF olarak dışa aktar', run: () => doExport('dxf2') },
    { id: 'file.png', cat: 'file', t: 'Plan görseli (PNG)', run: () => doExport('png') },
    { id: 'file.save', cat: 'file', t: 'Proje dosyasını indir (.saggcad.json)', ic: 'file', sep: true, run: async () => downloadBlob(await exportProject(p), `${slug(p.name)}.saggcad.json`) },
    { id: 'file.settings', cat: 'file', t: 'Ayarlar…', ic: 'settings', sep: true, run: settingsDialog },
    ...toolCmds('draw', ['sel', 'wall', 'open', 'furn']),
    { id: 'draw.room', cat: 'draw', t: 'Ölçüyle oda…', ic: 'plus', sep: true, run: () => E.addRoomDialog() },
    { id: 'edit.undo', cat: 'draw', t: 'Geri al', k: 'Ctrl Z', ic: 'undo', sep: true, run: () => E.undo() },
    { id: 'edit.redo', cat: 'draw', t: 'Yinele', k: 'Ctrl Y', ic: 'redo', run: () => E.redo() },
    { id: 'edit.copy', cat: 'draw', t: 'Kopyala', k: 'Ctrl C', ic: 'copy', run: () => E.copySel() },
    { id: 'edit.cut', cat: 'draw', t: 'Kes', k: 'Ctrl X', ic: 'cut', run: () => E.cutSel() },
    { id: 'edit.paste', cat: 'draw', t: 'Yapıştır', k: 'Ctrl V', ic: 'paste', run: () => E.paste() },
    { id: 'edit.all', cat: 'draw', t: 'Tümünü seç', k: 'Ctrl A', run: () => E.selectAll() },
    { id: 'edit.del', cat: 'draw', t: 'Seçileni sil', k: 'Del', ic: 'trash', run: () => E.del(), when: () => !!(E.sel || E.msel.length) },
    { id: 'edit.clear', cat: 'draw', t: 'Tüm çizimi temizle…', run: () => E.clearAll() },
    ...toolCmds('model', ['model']),
    { id: 'model.slab', cat: 'model', t: 'Dış hattan otomatik döşeme', ic: 'floor', sep: true, run: () => E.autoSlab() },
    { id: 'model.roof', cat: 'model', t: 'Dış hattan otomatik çatı', ic: 'roof', run: () => E.autoRoof() },
    { id: 'model.level', cat: 'model', t: 'Kat ekle…', ic: 'layers', sep: true, run: () => E.addLevelDialog() },
    { id: 'model.rooflv', cat: 'model', t: 'Çatı planı ekle', ic: 'roof', run: () => E.addRoofLevel() },
    ...planLevels(E.root).map((l, i) => ({ id: 'lv.' + l.idx, cat: 'model', t: `Kata geç: ${l.name}`, sep: i === 0, run: () => E.setLevel(l.idx), on: () => E.lv === l.idx })),
    { id: 'model.cab', cat: 'model', t: 'Mutfak / dolap tasarla (seçili duvar)', ic: 'kitchen', sep: true, run: () => E.cabFromSelection() },
    { id: 'model.lib', cat: 'model', t: 'Malzemeler ve yapılar…', ic: 'layers', run: () => E.openLibrary() },
    { id: 'view.2d', cat: 'view', t: '2D plan', k: '', ic: 'grid', run: () => setMode('2d'), on: () => mode === '2d' },
    { id: 'view.3d', cat: 'view', t: '3D model', ic: 'cube', run: () => setMode('3d'), on: () => mode === '3d' },
    { id: 'view.split', cat: 'view', t: 'Yan yana (2D + 3D)', run: () => setMode('split'), on: () => mode === 'split', when: () => !small },
    { id: 'view.fit', cat: 'view', t: 'Sığdır', ic: 'fit', sep: true, run: () => E.fit() },
    { id: 'view.nav', cat: 'view', t: 'Proje gezgini', k: 'Ctrl B', sep: true, run: () => setNav(!navOn), on: () => navOn },
    { id: 'view.insp', cat: 'view', t: 'Özellik paneli', k: 'Ctrl I', run: () => E.toggleInsp(), on: () => E.inspVisible() },
    opt('dims', 'Ölçüleri göster'), opt('snap', 'Izgaraya yasla'), opt('ortho', 'Açı yakalama (orto)'),
    ...WORKSPACES.map((w, i) => ({ id: 'ws.' + w.k, cat: 'view', t: `Çalışma alanı: ${w.t}`, kw: w.d, sep: i === 0, run: () => applyWs(w), on: () => ws?.k === w.k })),
    { id: 'view.theme', cat: 'view', t: 'Koyu tema', sep: true, run: () => { toggleTheme(); }, on: () => getTheme() === 'dark' },
    ...toolCmds('doc', ['doc']),
    { id: 'doc.views', cat: 'doc', t: 'Kesit ve görünüşler…', ic: 'eye', sep: true, run: () => openViews(null) },
    { id: 'doc.pafta', cat: 'doc', t: 'Ölçekli plan paftası (PDF)', ic: 'print', run: () => doExport('pafta') },
    { id: 'doc.jn', cat: 'doc', t: 'Doğrama listesi (PDF)…', ic: 'print', sep: true, run: () => doExport('dograma') },
    { id: 'doc.fl', cat: 'doc', t: 'Zemin sipariş listesi…', run: () => doExport('zemin') },
    { id: 'doc.lbl', cat: 'doc', t: 'Parça etiketleri…', run: () => doExport('etiket') },
    { id: 'doc.cnc', cat: 'doc', t: 'CNC kesim şablonu…', run: () => doExport('cnc') },
    { id: 'tools.cmdk', cat: 'tools', t: 'Komut paleti', k: 'Ctrl K', ic: 'search', run: () => openPalette(commands) },
    { id: 'tools.draw', cat: 'tools', t: 'Çizim ayarları (birim, ölçek)', ic: 'settings', run: () => { setMode(mode === '3d' ? '2d' : mode); E.setSel([]); E.toggleInsp(true); } },
    { id: 'tools.scale', cat: 'tools', t: 'Planı ölçekle (bilinen ölçüden)', ic: 'ruler', run: tool('scale') },
    { id: 'tools.render', cat: 'tools', t: 'Gerçekçi render…', ic: 'sparkle', sep: true, run: render },
    { id: 'tools.keys', cat: 'tools', t: 'Klavye kısayolları', ic: 'list', sep: true, run: () => keysDialog() },
  ];
  S.cmds = commands;

  /* ── menü, gezgin, durum çubuğu ── */
  mountMenubar($('#wbMenu'), commands);
  const nav = mountNavigator($('#psNav'), {
    data: () => {
      const R = E.root;
      return {
        levels: planLevels(R).map(l => ({ idx: l.idx, name: l.name, kind: l.kind, sub: l.kind === 'roof' ? 'çatı' : kotM(l.z), active: l.idx === E.lv })),
        drawings: p.drawings.map(d => ({ id: d.id, name: d.name, main: d.main, sub: d.main ? 'Rölöve' : kindOf(d.kind).t, active: d.id === dw.id })),
        views: [{ id: '2d', name: '2D plan', ic: 'grid', active: mode !== '3d' }, { id: '3d', name: '3D model', ic: 'cube', active: mode !== '2d' },
          ...viewsOf(R).map(v => ({ id: v.id, name: v.name, sub: v.type === 'sec' ? 'kesit' : 'cephe' }))],
        sheets: [{ id: 'pafta', name: `Plan paftası 1:${scaleOf(R)}`, sub: levelName(R, E.lv) }, { id: 'views', name: 'Kesit / görünüş paftaları', sub: 'PDF' }],
      };
    },
    act: (k, id) => {
      if (small) setNav(false);
      if (k === 'level') return E.setLevel(+id);
      if (k === 'drawing') { if (id !== dw.id) location.hash = planUrl(p, drawingOf(p, id), mode !== '2d' ? '&v=3d' : ''); return; }
      if (k === 'view') return id === '2d' ? setMode(mode === '3d' ? '2d' : mode) : id === '3d' ? setMode(mode === '2d' ? '3d' : mode) : openViews(id);
      if (k === 'sheet') return id === 'pafta' ? doExport('pafta') : openViews(null);
      if (k === 'add-level') return E.addLevelDialog();
      if (k === 'add-roof') return E.addRoofLevel();
      if (k === 'add-drawing') return newDrawingDialog(p);
    },
  });
  const sb = mountStatusbar($('#psStatus'), {
    state: () => ({ unit: unitOf(E.root).k, units: UNITS, scale: scaleOf(E.root), scales: SCALES, opts: E.opt, steps: [1, 5, 10, 25, 50], level: levelName(E.root, E.lv) }),
    on: {
      unit: k => { E.root.meta.unit = k; E.changed(); E.renderHud(); },
      scale: n => { E.root.meta.scale = n; E.changed(); },
      opt: (k, v) => E.setOpt(k, v),
    },
  });
  saveUI = (st, at) => sb.save(st, at);
  const host2d = $('#ps2d');
  host2d.addEventListener('pe:cursor', e => sb.cursor(e.detail, v => fmtNum(v * unitOf(E.root).f, unitOf(E.root).d)));
  host2d.addEventListener('pe:opt', () => sb.render());
  host2d.addEventListener('pe:level', () => refresh());
  host2d.addEventListener('pe:layout', () => S.p3?.resize());
  unbindKeys = bindPaletteKey(commands);
  const onKeys = e => {
    const ctrl = e.ctrlKey || e.metaKey, k = e.key.toLowerCase(), typing = /INPUT|TEXTAREA|SELECT/.test(e.target.tagName);
    if (ctrl && k === 'b') { e.preventDefault(); setNav(!navOn); }
    else if (ctrl && k === 'i') { e.preventDefault(); E.toggleInsp(); }
    else if (ctrl && e.shiftKey && k === 'e') { e.preventDefault(); exportDialog(); }
    else if (!typing && !ctrl && e.key === 'F1') { e.preventDefault(); keysDialog(); }
  };
  document.addEventListener('keydown', onKeys);
  // küçük ekranda gezgin çekmecesi: dışına dokununca kapanır
  const onTapOut = e => { if (small && navOn && !e.target.closest('.ps-nav, [data-burger], .cmdk-back, .modal-back')) setNav(false); };
  document.addEventListener('pointerdown', onTapOut, true);
  const prevUnbind = unbindKeys; unbindKeys = () => { prevUnbind(); document.removeEventListener('keydown', onKeys); document.removeEventListener('pointerdown', onTapOut, true); };

  $('[data-cmdk]').onclick = () => openPalette(commands);
  $('[data-burger]').onclick = () => openPalette(commands, { placeholder: 'Menü — komut ya da araç arayın…' });
  $('[data-views]').onclick = () => openViews(null);
  $('[data-exp]').onclick = exportDialog;
  $('[data-render]').onclick = render;
  setMode(mode).then(() => { if (qs.get('r')) renderDialog(); if (qs.get('import')) S.editor.importDialog(); });
}

/* klavye kısayolları penceresi */
function keysDialog() {
  const rows = [...TOOLS.map(t => [t.key.toUpperCase(), t.t]), ['Ctrl K', 'Komut paleti'], ['Ctrl Z / Ctrl Y', 'Geri al / yinele'], ['Ctrl C / X / V', 'Kopyala / kes / yapıştır'], ['Ctrl A', 'Tümünü seç'],
    ['Del', 'Seçileni sil'], ['Esc', 'Çizimi bitir / seçimi kaldır'], ['Enter', 'Zinciri bitir'], ['← ↑ → ↓', 'Uzunluk yazıp yönle ilerle'], ['Boşluk + sürükle', 'Kaydır'],
    ['Ctrl B', 'Proje gezgini'], ['Ctrl I', 'Özellik paneli'], ['Ctrl Shift E', 'Dışa aktar'], ['F1', 'Bu pencere']];
  modal({ title: 'Klavye kısayolları', wide: true, body: `<div class="keys-grid">${rows.map(([k, t]) => `<div><kbd>${esc(k)}</kbd><span>${esc(t)}</span></div>`).join('')}</div>`, actions: [{ k: 'ok', t: 'Kapat', cls: 'btn-primary' }] });
}

const metaLine = (p, extra = '') => `<div class="p-meta"><span>Proje <b>${esc(p.name)}</b></span>${p.client ? `<span>Müşteri <b>${esc(p.client)}</b></span>` : ''}${extra}<span>Tarih <b>${fmtDate(Date.now())}</b></span></div>`;

async function ensure3d() {
  if (S.p3) { S.p3.opt.level = S.editor.lv; S.p3.setPlan(S.editor.root); return S.p3; }
  const { Plan3D } = await import('./plan3d.js');
  const host = $('#p3host'); if (!host) return;
  const p3 = new Plan3D(host);
  try { await p3.init(); } catch (e) { $('.p3-load', host).innerHTML = `<p class="warn">3D başlatılamadı: ${esc(e.message)}</p>`; return; }
  if (!$('#p3host') || !S.editor) { p3.dispose(); return; }
  S.p3 = p3;
  $('.p3-load', host)?.remove();
  p3.opt.level = S.editor.lv; p3.setPlan(S.editor.root);
  const sel = $('#p3room');
  const fillRooms = () => { sel.innerHTML = S.editor.root.rooms.map(r => `<option value="${r.id}">${esc(r.name)}</option>`).join(''); };
  $('#sunAz').value = p3.opt.sunAz; $('#sunEl').value = p3.opt.sunEl; $('#expo').value = p3.opt.exposure;
  $('#sunAz').oninput = e => p3.set('sunAz', +e.target.value);
  $('#sunEl').oninput = e => p3.set('sunEl', +e.target.value);
  $('#expo').oninput = e => p3.set('exposure', +e.target.value);
  $$('.p3-bar [data-t]').forEach(b => b.classList.toggle('on', !!p3.opt[b.dataset.t]));
  $$('.p3-bar [data-t]').forEach(b => b.onclick = () => { const k = b.dataset.t; p3.set(k, !p3.opt[k]); b.classList.toggle('on', p3.opt[k]); });
  $('#cam').onclick = e => {
    const b = e.target.closest('[data-c]'); if (!b) return;
    const c = b.dataset.c;
    if (c === 'interior') {
      fillRooms();
      if (!S.editor.root.rooms.length) return toast('İç mekan için önce oda çizin', 'err');
      sel.hidden = false;
      if (!p3.opt.ceiling) { p3.set('ceiling', true); $('.p3-bar [data-t="ceiling"]').classList.add('on'); }
      if (p3.opt.cut) { p3.set('cut', false); $('.p3-bar [data-t="cut"]').classList.remove('on'); }
      p3.interior(sel.value);
      $('#p3hint').textContent = 'Sürükle: etrafına bak · zemine dokun: oraya yürü';
    } else {
      sel.hidden = true;
      if (p3.opt.ceiling) { p3.set('ceiling', false); $('.p3-bar [data-t="ceiling"]').classList.remove('on'); }
      c === 'top' ? p3.top() : p3.frame();
      $('#p3hint').textContent = 'Sürükle: döndür · iki parmak / sağ tık: kaydır · tekerlek / kıstırma: yakınlaştır';
    }
    $$('#cam button').forEach(x => x.classList.toggle('on', x === b));
  };
  sel.onchange = () => p3.interior(sel.value);
  return p3;
}

async function renderDialog() {
  const p3 = S.p3 || await ensure3d(); if (!p3) return;
  const p = S.project;
  const body = h(`<div class="render-dlg">
    <p class="muted">Render, 3D görünümdeki mevcut kamera açısından alınır. İç mekan render'ı için önce "İç mekan" kamerasına geçin.</p>
    <div class="grid2">
      <label>Kalite<select class="inp" id="rq">
        <option value="pt">Fotogerçekçi (path tracing) — yavaş</option>
        <option value="fast">Hızlı önizleme — saniyeler</option></select></label>
      <label>Çözünürlük<select class="inp" id="rs">
        <option value="1280x720">1280 × 720</option><option value="1920x1080" selected>1920 × 1080 (Full HD)</option>
        <option value="2560x1440">2560 × 1440</option><option value="1600x1600">1600 × 1600 (kare)</option><option value="1080x1350">1080 × 1350 (Instagram)</option><option value="1080x1920">1080 × 1920 (Story)</option></select></label>
      <label>Örnek sayısı (kalite)<select class="inp" id="rn"><option value="64">64 — taslak</option><option value="200" selected>200 — iyi</option><option value="500">500 — yüksek</option><option value="1200">1200 — çok yüksek</option></select></label>
    </div>
    <div class="render-prog" hidden><div class="bar"><i></i></div><span>Hazırlanıyor…</span></div>
    <div class="render-out" hidden><img alt="Render"></div>
  </div>`);
  let ctrl = null, blob = null;
  await modal({ title: 'Gerçekçi render', body, wide: true,
    actions: [{ k: 'close', t: 'Kapat' }, { k: 'dl', t: 'İndir', icon: 'download' }, { k: 'save', t: 'Projeye kaydet', icon: 'check' }, { k: 'go', t: 'Render al', cls: 'btn-primary', icon: 'sparkle' }],
    onOpen: el => {
      const foot = el.parentElement.querySelector('.modal-foot');
      const btn = k => foot.querySelector(`[data-k="${k}"]`);
      btn('dl').hidden = btn('save').hidden = true;
      const go = btn('go'), prog = $('.render-prog', el), out = $('.render-out', el);
      foot.onclick = async e => {
        const k = e.target.closest('[data-k]')?.dataset.k;
        if (k === 'close') { ctrl?.abort(); }
        if (k === 'dl' && blob) downloadBlob(blob, `${slug(p.name)}-render-${Date.now()}.png`);
        if (k === 'save' && blob) {
          const jpg = await toJpeg(blob);
          await addBlobPhoto(jpg, { tag: 'render', caption: `Render${S.dw && !S.dw.main ? ' · ' + S.dw.name : ''} · ${p3.opt.mode === 'interior' ? (S.editor.root.rooms.find(r => r.id === p3.opt.roomId)?.name || 'iç mekan') : 'genel görünüm'}` });
          toast('Render projeye kaydedildi'); btn('save').hidden = true;
        }
      };
      // modal() varsayılan kapatma davranışını sadece "close" için kullan
      $$('.modal-foot [data-k]', el.parentElement).forEach(b => { if (b.dataset.k !== 'close') b.onclick = null; });
      go.onclick = async () => {
        const [w, hh] = $('#rs', el).value.split('x').map(Number), q = $('#rq', el).value, n = +$('#rn', el).value;
        go.disabled = true; prog.hidden = false; out.hidden = true; btn('dl').hidden = btn('save').hidden = true;
        ctrl = new AbortController();
        const t0 = performance.now();
        try {
          const notes = [];
          blob = await p3.renderImage({ w, h: hh, quality: q, samples: n, signal: ctrl.signal,
            onNote: m => { notes.push(m); toast(m); },
            onProgress: (v, smp) => { $('.bar i', prog).style.width = Math.round(v * 100) + '%'; $('span', prog).textContent = smp ? `Örnek ${smp}/${n} · ${Math.round((performance.now() - t0) / 1000)} sn` : 'Sahne hazırlanıyor…'; } });
          $('img', out).src = URL.createObjectURL(blob); out.hidden = false;
          $('span', prog).textContent = `Tamamlandı · ${Math.round((performance.now() - t0) / 1000)} sn${notes.length ? ' · ' + notes.at(-1) : ''}`;
          btn('dl').hidden = btn('save').hidden = false;
        } catch (e) {
          console.error(e);
          $('span', prog).textContent = 'Render hatası: ' + e.message + (q === 'pt' ? ' — "Hızlı" kaliteyi deneyin.' : '');
        } finally { go.disabled = false; }
      };
    } });
  ctrl?.abort();
}
async function toJpeg(blob) {
  const bmp = await createImageBitmap(blob);
  const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height;
  c.getContext('2d').drawImage(bmp, 0, 0);
  return new Promise(r => c.toBlob(r, 'image/jpeg', 0.92));
}

/* ═════════ listeler (PDF) ═════════ */
/* doğrama listesi: kapı / pencere pozları, ölçülü görünüşler */
async function printJoinery(p, dw, plan) {
  const { joineryHtml, joineryItems } = await import('./joinery.js');
  const items = plan ? joineryItems(plan) : [];
  if (!items.length) return toast('Çizimde kapı / pencere yok', 'err');
  const off = new Set(p.jnOff?.[dw.id] || []);
  const sel = new Set(items.map(x => x.o.id).filter(id => !off.has(id)));
  const num = new Map(items.map((x, i) => [x.o.id, i + 1]));
  const GR = [['door', 'Kapılar'], ['window', 'Pencereler'], ['opening', 'Kapısız boşluklar']].filter(([t]) => items.some(x => x.o.type === t));
  // seçim haritası: her açıklığın sıra numarası plan üzerinde; birden çok katta harita kat kat gösterilir
  const lvs = [...new Map(items.map(x => [x.lv, { lv: x.lv, name: x.lvName, P: x.P }])).values()].sort((a, b) => a.lv - b.lv);
  let mapLv = lvs[0].lv;
  const ov = s => items.filter(x => x.lv === mapLv).map(x => {
    const q = { x: x.c.x - x.n.x * x.sd * (x.t / 2 + 14 / s), y: x.c.y - x.n.y * x.sd * (x.t / 2 + 14 / s) }, r = 10 / s;
    return `<g class="jn-pin" data-o="${x.o.id}"><circle cx="${q.x}" cy="${q.y}" r="${r}"/><text x="${q.x}" y="${q.y + 4 / s}" font-size="${11 / s}" text-anchor="middle">${num.get(x.o.id)}</text></g>`;
  }).join('');
  const row = x => `<label class="jn-row"><input type="checkbox" data-o="${x.o.id}" ${sel.has(x.o.id) ? 'checked' : ''}><span class="jn-n">${num.get(x.o.id)}</span>
    <span><b>${x.o.type === 'opening' ? 'Boşluk' : esc(useName(x.o))}</b> <small>${fmtNum(x.o.w, 1)} × ${fmtNum(x.o.h, 1)}${x.o.type === 'window' ? ' · parapet ' + fmtNum(x.o.sill || 0, 1) : ''}</small><br><small class="muted">${esc(x.where)}${x.o.type !== 'opening' ? ' · ' + esc(modelName(x.o)) : ''}</small></span></label>`;
  const r = await modal({ title: 'Doğrama listesi', wide: true, body: `
    <p class="muted small">${esc(dw.name)} — listeye eklenecek kapı ve pencereleri seçin. Aynı ölçü ve özellikteki seçili doğramalar tek pozda toplanır.</p>
    <div class="jn-pick">
      <div>${lvs.length > 1 ? `<div class="row wrap jn-quick jn-lvs">${lvs.map(L => `<button class="btn btn-xs btn-ghost" data-lvm="${L.lv}">${esc(L.name)}</button>`).join('')}</div>` : ''}
      <div class="jn-map">${planThumbSvg(lvs[0].P, 600, 380, false, false, ov)}</div></div>
      <div class="jn-side">
        <div class="row wrap jn-quick"><button class="btn btn-xs btn-ghost" data-q="all">Tümü</button><button class="btn btn-xs btn-ghost" data-q="none">Hiçbiri</button>${GR.length > 1 ? GR.map(([t, n]) => `<button class="btn btn-xs btn-ghost" data-q="${t}">Yalnız ${n.toLocaleLowerCase('tr')}</button>`).join('') : ''}</div>
        <div class="jn-list">${GR.map(([t, n]) => `<div class="jn-grp"><label class="jn-gh"><input type="checkbox" data-g="${t}"> ${n}</label>${items.filter(x => x.o.type === t).map(row).join('')}</div>`).join('')}</div>
        <p class="small jn-cnt"></p>
      </div>
    </div>
    <div class="grid2"><label>Montaj boşluğu (her kenar, cm)<input class="inp" type="number" id="jnGap" min="0" max="5" step="0.5" value="${S.settings.jnGap ?? 1}"></label>
      <label class="check" style="align-self:end"><input type="checkbox" id="jnKey" checked> Anahtar plan (poz numaraları plan üzerinde)</label></div>
    <p class="muted small">İmalat ölçüsü = açıklık − 2 × boşluk (kapıda yükseklikten yalnızca üst boşluk düşülür). 0 girilirse imalat ölçüsü gösterilmez.</p>`,
    actions: [{ k: 'no', t: 'Vazgeç' }, { k: 'ok', t: 'PDF hazırla', cls: 'btn-primary', icon: 'print', validate: () => { if (!sel.size) { toast('En az bir kapı / pencere seçin', 'err'); return false; } return true; } }],
    onOpen: el => {
      const sync = () => {
        $$('[data-o]', el).forEach(x => x.tagName === 'INPUT' ? (x.checked = sel.has(x.dataset.o)) : x.classList.toggle('on', sel.has(x.dataset.o)));
        $$('[data-g]', el).forEach(g => { const ids = items.filter(x => x.o.type === g.dataset.g).map(x => x.o.id), n = ids.filter(id => sel.has(id)).length; g.checked = n === ids.length; g.indeterminate = n > 0 && n < ids.length; });
        $$('[data-lvm]', el).forEach(b => b.classList.toggle('on', +b.dataset.lvm === mapLv));
        $('.jn-cnt', el).textContent = `${sel.size} / ${items.length} seçili`;
      };
      el.addEventListener('change', e => {
        const t = e.target;
        if (t.dataset.o) t.checked ? sel.add(t.dataset.o) : sel.delete(t.dataset.o);
        if (t.dataset.g) items.filter(x => x.o.type === t.dataset.g).forEach(x => t.checked ? sel.add(x.o.id) : sel.delete(x.o.id));
        sync();
      });
      el.addEventListener('click', e => {
        const pin = e.target.closest('.jn-pin'), q = e.target.closest('[data-q]'), lvb = e.target.closest('[data-lvm]');
        if (lvb) { mapLv = +lvb.dataset.lvm; $('.jn-map', el).innerHTML = planThumbSvg(lvs.find(L => L.lv === mapLv).P, 600, 380, false, false, ov); return sync(); }
        if (pin) { const id = pin.dataset.o; sel.has(id) ? sel.delete(id) : sel.add(id); $(`.jn-row [data-o="${id}"]`, el)?.closest('.jn-row').scrollIntoView({ block: 'nearest' }); }
        if (q) { sel.clear(); items.filter(x => q.dataset.q === 'all' || q.dataset.q === x.o.type).forEach(x => sel.add(x.o.id)); }
        if (pin || q) sync();
      });
      sync();
    } });
  if (r?.k !== 'ok') return;
  const gap = Math.max(0, Math.min(5, +$('#jnGap', r.el).value || 0)), key = $('#jnKey', r.el).checked;
  if (S.settings.jnGap !== gap) { S.settings.jnGap = gap; saveSet(); }
  // seçim çizim bazında hatırlanır (yeni eklenen açıklıklar varsayılan olarak seçili gelir)
  (p.jnOff ||= {})[dw.id] = items.map(x => x.o.id).filter(id => !sel.has(id)); save();
  const body = joineryHtml(plan, { gap, only: sel, keyPlan: key ? (ov, P) => planImageUrl(P || plan, 900, 560, ov) : null });
  printDoc(`<div class="pdoc">${docHeader(S.settings, 'Doğrama Listesi', metaLine(p, `<span>Çizim <b>${esc(dw.name)}</b></span>`))}${body}${docFooter()}</div>`, `Doğrama Listesi ${p.name}`);
}

/* zemin sipariş listesi: mahaller malzemeye göre gruplanır (PDF / metin) */
async function printFloorOrder(p, dw, plan) {
  const F = await import('./floororder.js'), { floorOf } = await import('./catalog.js');
  const RM = plan ? F.floorRooms(plan) : [], rooms = RM.map(x => x.r);
  if (!RM.length) return toast('Çizimde oda / mahal yok', 'err');
  const off = new Set(p.flOff?.[dw.id] || []), sel = new Set(rooms.map(r => r.id).filter(id => !off.has(id)));
  const cfg = JSON.parse(JSON.stringify(p.floorCfg || {}));
  const mats = [...new Set(rooms.map(r => r.floor || 'parke'))];
  const other = mats.filter(k => F.FLOOR_MAT[k]);
  const numIn = (k, f, v, u, st = 'any') => `<label>${f}<div class="inp-unit sm"><input type="number" inputmode="decimal" step="${st}" min="0" data-c="${k}" value="${v}"><span>${u}</span></div></label>`;
  const matBox = k => { const c = F.matCfg(k, cfg); return `<div class="fo-mat" data-m="${k}"><b>${esc(floorOf(k).t)}</b>
    <label>Ürün / seri<input class="inp sm" data-c="name" value="${esc(c.name)}" placeholder="isteğe bağlı"></label>
    <div class="grid3">${numIn('fire', 'Fire', c.fire, '%', 1)}${c.packT === 'paket' ? numIn('pack', 'Paket', c.pack, 'm²') : ''}${c.kgm2 ? numIn('kgm2', 'Sarfiyat', c.kgm2, 'kg/m²') + numIn('bag', 'Torba', c.bag, 'kg', 1) : ''}</div></div>`; };
  const row = ({ r, P, name }) => `<label class="jn-row"><input type="checkbox" data-r="${r.id}" ${sel.has(r.id) ? 'checked' : ''}><span><b>${esc(name)}</b> <small>${fmtNum(Math.abs(roomMetrics(P, r).area))} m²</small><br><small class="muted">${esc(floorOf(r.floor).t)}${r.tile ? ` · ${fmtNum(r.tile.w, 1)} × ${fmtNum(r.tile.l, 1)}${r.tile.name ? ' · ' + esc(r.tile.name) : ''}` : ''}</small></span></label>`;
  const read = el => { $$('.fo-mat', el).forEach(b => { const k = b.dataset.m, c = (cfg[k] ||= {}); $$('[data-c]', b).forEach(i => { c[i.dataset.c] = i.type === 'number' ? Math.max(0, +i.value || 0) : i.value.trim(); }); }); };
  const summary = el => { read(el); const g = F.floorOrderData(plan, { only: sel, cfg }); $('.fo-sum', el).innerHTML = g.length ? `<table class="p-table sm"><tbody>${F.orderLines(g).map(([c, t, n, , o]) => `<tr${c ? '' : ' class="sub"'}><td><b>${c}</b></td><td>${esc(t)}${n ? `<br><small class="muted">${esc(n)}</small>` : ''}</td><td class="r">${o}</td></tr>`).join('')}</tbody></table>` : '<p class="muted small">Mahal seçin.</p>'; };
  const need = () => sel.size > 0 || (toast('En az bir mahal seçin', 'err'), false);
  const r = await modal({ title: 'Zemin sipariş listesi', wide: true, body: `
    <p class="muted small">${esc(dw.name)} — listeye girecek mahalleri seçin. Seramik / karo mahallerinde boyut, döşeme şekli ve derz, odanın "döşeme hesabı" bölümünden alınır; aynı malzeme ve ürün tek kalemde toplanır.</p>
    <div class="jn-pick">
      <div class="jn-side"><div class="row wrap jn-quick"><button class="btn btn-xs btn-ghost" data-q="all">Tümü</button><button class="btn btn-xs btn-ghost" data-q="none">Hiçbiri</button>${mats.length > 1 ? mats.map(k => `<button class="btn btn-xs btn-ghost" data-q="${k}">Yalnız ${esc(floorOf(k).t.toLocaleLowerCase('tr'))}</button>`).join('') : ''}</div>
        <div class="jn-list">${RM.map(row).join('')}</div></div>
      <div class="jn-side">${other.map(matBox).join('')}<div class="fo-sum"></div></div>
    </div>
    <label class="check"><input type="checkbox" id="foKey" checked> Anahtar plan (malzeme kodları plan üzerinde)</label>`,
    actions: [{ k: 'no', t: 'Vazgeç' }, { k: 'txt', t: 'Metni kopyala', icon: 'copy', validate: need }, { k: 'ok', t: 'PDF hazırla', cls: 'btn-primary', icon: 'print', validate: need }],
    onOpen: el => {
      const sync = () => { $$('[data-r]', el).forEach(x => x.checked = sel.has(x.dataset.r)); summary(el); };
      el.addEventListener('change', e => { const t = e.target; if (t.dataset.r) t.checked ? sel.add(t.dataset.r) : sel.delete(t.dataset.r); sync(); });
      el.addEventListener('input', e => { if (e.target.dataset.c) summary(el); });
      el.addEventListener('click', e => { const q = e.target.closest('[data-q]'); if (!q) return; sel.clear(); rooms.filter(x => q.dataset.q === 'all' || (x.floor || 'parke') === q.dataset.q).forEach(x => sel.add(x.id)); sync(); });
      sync();
    } });
  if (!r || r.k === 'no') return;
  read(r.el);
  (p.flOff ||= {})[dw.id] = rooms.map(x => x.id).filter(id => !sel.has(id)); p.floorCfg = cfg; save();
  const groups = F.floorOrderData(plan, { only: sel, cfg });
  if (r.k === 'txt') {
    const strip = x => String(x).replace(/<[^>]+>/g, '');
    const txt = [`Zemin sipariş listesi — ${p.name}${p.client ? ' · ' + p.client : ''} (${dw.name})`, ...F.orderLines(groups).map(([c, t, n, q, o]) => `${c ? c + ' ' : '   – '}${t}${n ? ' (' + n + ')' : ''}: ${strip(o)}${c ? ' — ' + q : ''}`)].join('\n');
    try { await navigator.clipboard.writeText(txt); toast('Sipariş listesi kopyalandı'); } catch { await modal({ title: 'Sipariş listesi', body: `<textarea class="inp" rows="12" style="width:100%">${esc(txt)}</textarea>`, actions: [{ k: 'ok', t: 'Kapat' }] }); }
    return;
  }
  const key = $('#foKey', r.el).checked;
  const body = F.floorOrderHtml(plan, groups, { keyPlan: key ? (ov, P) => planImageUrl(P || plan, 900, 560, ov) : null });
  printDoc(`<div class="pdoc">${docHeader(S.settings, 'Zemin Kaplaması Sipariş Listesi', metaLine(p, `<span>Çizim <b>${esc(dw.name)}</b></span>`))}${body}${docFooter()}</div>`, `Zemin Siparis ${p.name}`);
}

/* ═════════ başlat ═════════ */
(async () => {
  applyTheme();
  try {
    S.settings = await loadSettings();
  } catch (e) {
    view().innerHTML = `<div class="card empty"><b>Tarayıcı depolaması kullanılamıyor</b><p class="muted">SAGGCAD çizimleri bu cihazda saklar; gizli pencerede ya da depolama kapalıyken çalışmaz. (${esc(e.message)})</p></div>`;
    return;
  }
  addEventListener('hashchange', route);
  // sekme kapanırken bekleyen kaydı hemen yaz
  addEventListener('pagehide', () => S.project && saveProject(S.project));
  route();
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
