/* ═══ Çalışma tezgâhı — menü çubuğu, komut paleti, proje gezgini, durum çubuğu, tema, çalışma alanları ═══
 * Çizim motorundan bağımsızdır: yalnızca komut listesi (run / on / when) ve veri sağlayıcılarla çalışır.
 * Komut: { id, t, cat, k?, ic?, kw?, run(), on?() → bool (işaretli), when?() → bool (etkin), sep? }
 */
import { icon, esc, $, $$ } from './ui.js';

export const MENUS = [
  { id: 'file', t: 'Dosya' }, { id: 'draw', t: 'Çizim' }, { id: 'model', t: 'Model' },
  { id: 'view', t: 'Görünüm' }, { id: 'doc', t: 'Belgele' }, { id: 'tools', t: 'Araçlar' },
];
const catName = id => MENUS.find(m => m.id === id)?.t || '';

/* ───────────── tema ─────────────
 * Arayüz yüzeyleri temaya göre değişir; çizim alanı, plan ve 3D renkleri sabittir (css/ui.css). */
const THEME_KEY = 'sg-theme';
export const getTheme = () => { try { return localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light'; } catch { return 'light'; } };
export function applyTheme(t = getTheme()) {
  document.documentElement.dataset.theme = t;
  try { localStorage.setItem(THEME_KEY, t); } catch { /* yok say */ }
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', '#0F1B2D');
}
export const toggleTheme = () => applyTheme(getTheme() === 'dark' ? 'light' : 'dark');

/* ───────────── çalışma alanı ön ayarları ───────────── */
export const WORKSPACES = [
  { k: 'rolove', t: 'Rölöve', d: 'Sahada ölçü: 2D plan, duvar, mahal, açıklık ve ölçü araçları', mode: '2d', nav: true, insp: true, groups: ['sel', 'wall', 'open', 'furn', 'doc'] },
  { k: 'model', t: 'Mimari model', d: 'Tüm araçlar; 2D ve 3D yan yana, yapı elemanları ve belgeleme', mode: 'split', nav: true, insp: true, groups: null },
  { k: 'viz', t: '3D görselleştirme', d: '3D model, kamera, güneş ve render; paneller kapalı', mode: '3d', nav: false, insp: false, groups: null },
];
const WS_KEY = 'sg-workspace';
export const getWorkspace = () => { try { return WORKSPACES.find(w => w.k === localStorage.getItem(WS_KEY)) || null; } catch { return null; } };
export const setWorkspaceKey = k => { try { localStorage.setItem(WS_KEY, k); } catch { /* yok say */ } };

/* Türkçe duyarsız arama anahtarı */
const norm = s => String(s || '').toLocaleLowerCase('tr').normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/ı/g, 'i');

/* ───────────── menü çubuğu ───────────── */
export function mountMenubar(host, commands) {
  host.innerHTML = MENUS.map(m => `<div class="mb-m" data-m="${m.id}"><button class="mb-b" type="button" aria-haspopup="true">${m.t}</button></div>`).join('');
  let open = null;
  const close = () => { $$('.mb-dd', host).forEach(d => d.remove()); $$('.mb-m.on', host).forEach(x => x.classList.remove('on')); open = null; };
  const show = m => {
    close(); open = m.dataset.m; m.classList.add('on');
    const list = commands().filter(c => c.cat === open);
    const dd = document.createElement('div'); dd.className = 'mb-dd'; dd.setAttribute('role', 'menu');
    dd.innerHTML = list.map(c => {
      const dis = c.when && !c.when(), on = c.on?.();
      return `${c.sep ? '<hr>' : ''}<button type="button" role="menuitem" data-c="${c.id}" ${dis ? 'disabled' : ''} class="${on ? 'on' : ''}">
        <i class="mb-chk">${on ? icon('check') : c.ic ? icon(c.ic) : ''}</i><span>${esc(c.t)}</span>${c.k ? `<kbd>${esc(c.k)}</kbd>` : ''}</button>`;
    }).join('');
    m.append(dd);
  };
  host.addEventListener('click', e => {
    const it = e.target.closest('[data-c]');
    if (it) { const c = commands().find(x => x.id === it.dataset.c); close(); c?.run(); return; }
    const m = e.target.closest('.mb-m'); if (!m) return;
    open === m.dataset.m ? close() : show(m);
  });
  host.addEventListener('pointerover', e => { const m = e.target.closest('.mb-m'); if (open && m && m.dataset.m !== open) show(m); });
  document.addEventListener('pointerdown', e => { if (open && !host.contains(e.target)) close(); });
  document.addEventListener('keydown', e => { if (open && e.key === 'Escape') close(); });
  return { close };
}

/* ───────────── komut paleti (Ctrl+K) ───────────── */
const RECENT_KEY = 'sg-cmd-recent', PIN_KEY = 'sg-cmd-pins';   // U1: sabitlenen komutlar (UniCAD FusionCommandPalette esinli)
let lastPtr = null;   // S ile imleçte açmak için son işaretçi konumu
if (typeof document !== 'undefined') document.addEventListener('pointermove', e => { lastPtr = { x: e.clientX, y: e.clientY }; }, { passive: true });
export function openPalette(commands, { placeholder = 'Komut ya da araç arayın…', at = null } = {}) {
  if ($('.cmdk-back')) return;
  let recent = []; try { recent = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); } catch { /* yok */ }
  let pins = []; try { pins = JSON.parse(localStorage.getItem(PIN_KEY) || '[]'); } catch { /* yok */ }
  const all = commands().filter(c => !c.when || c.when());
  const back = document.createElement('div'); back.className = 'cmdk-back';
  back.innerHTML = `<div class="cmdk" role="dialog" aria-label="Komut paleti"><div class="cmdk-in">${icon('search')}<input type="text" placeholder="${esc(placeholder)}" aria-label="Komut ara" autocomplete="off" spellcheck="false"><kbd>Esc</kbd></div><div class="cmdk-list" role="listbox"></div>
    <div class="cmdk-foot"><span><kbd>↑</kbd><kbd>↓</kbd> seç</span><span><kbd>Enter</kbd> çalıştır</span><span><kbd>Ctrl</kbd><kbd>K</kbd> aç / kapat</span></div></div>`;
  document.body.append(back);
  if (at) {   // imleçte (S): pencere içinde kalacak biçimde
    const box = $('.cmdk', back); back.classList.add('at-cursor');
    const w = Math.min(560, innerWidth - 16), x = Math.max(8, Math.min(innerWidth - w - 8, at.x - 40)), y = Math.max(8, Math.min(innerHeight - 380, at.y - 20));
    Object.assign(box.style, { position: 'absolute', left: x + 'px', top: y + 'px', width: w + 'px', margin: 0 });
  }
  const inp = $('input', back), list = $('.cmdk-list', back);
  let items = [], cur = 0;
  const draw = () => {
    const q = norm(inp.value).split(/\s+/).filter(Boolean);
    if (q.length) {
      items = all.map(c => ({ c, hay: norm(`${c.t} ${catName(c.cat)} ${c.kw || ''}`) })).filter(x => q.every(w => x.hay.includes(w)))
        .sort((a, b) => (norm(b.c.t).startsWith(q[0]) - norm(a.c.t).startsWith(q[0])) || a.c.t.localeCompare(b.c.t, 'tr')).map(x => x.c);
    } else {
      const pc = pins.map(id => all.find(c => c.id === id)).filter(Boolean);
      const rc = recent.filter(id => !pins.includes(id)).map(id => all.find(c => c.id === id)).filter(Boolean);
      items = [...pc.map(c => ({ ...c, _pin: true })), ...rc.map(c => ({ ...c, _recent: true })), ...all.filter(c => !recent.includes(c.id) && !pins.includes(c.id))];
    }
    cur = Math.min(cur, Math.max(0, items.length - 1));
    let lastCat = null;
    list.innerHTML = items.map((c, i) => {
      const head = q.length ? '' : c._pin ? (lastCat !== '_p' ? (lastCat = '_p', '<div class="cmdk-h">Sabitlenenler</div>') : '') : (c._recent ? (lastCat !== '_r' ? (lastCat = '_r', '<div class="cmdk-h">Son kullanılanlar</div>') : '') : (lastCat !== c.cat ? (lastCat = c.cat, `<div class="cmdk-h">${esc(catName(c.cat))}</div>`) : ''));
      const pinned = pins.includes(c.id);
      return `${head}<button type="button" role="option" class="${i === cur ? 'on' : ''}" data-i="${i}"><i>${c.on?.() ? icon('check') : c.ic ? icon(c.ic) : ''}</i><span>${esc(c.t)}</span>${q.length ? `<small>${esc(catName(c.cat))}</small>` : ''}${c.k ? `<kbd>${esc(c.k)}</kbd>` : ''}<em class="cmdk-pin ${pinned ? 'on' : ''}" data-pin="${esc(c.id)}" role="button" aria-label="${pinned ? 'Sabitlemeyi kaldır' : 'Sabitle'}" title="${pinned ? 'Sabitlemeyi kaldır' : 'Paletin başına sabitle'}">${icon('star')}</em></button>`;
    }).join('') || '<p class="cmdk-none">Eşleşen komut yok</p>';
    $('button.on', list)?.scrollIntoView({ block: 'nearest' });
  };
  const close = () => { back.remove(); document.removeEventListener('keydown', onKey, true); };
  const run = i => {
    const c = items[i]; if (!c) return;
    close();
    recent = [c.id, ...recent.filter(x => x !== c.id)].slice(0, 6);
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(recent)); } catch { /* yok say */ }
    c.run();
  };
  const onKey = e => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); cur = Math.min(items.length - 1, cur + 1); draw(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); cur = Math.max(0, cur - 1); draw(); }
    else if (e.key === 'Enter') { e.preventDefault(); run(cur); }
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); e.stopPropagation(); close(); }
  };
  document.addEventListener('keydown', onKey, true);
  inp.addEventListener('input', () => { cur = 0; draw(); });
  back.addEventListener('pointerdown', e => { if (e.target === back) close(); });
  list.addEventListener('click', e => {
    const pn = e.target.closest('[data-pin]');
    if (pn) { e.stopPropagation(); const id = pn.dataset.pin; pins = pins.includes(id) ? pins.filter(x => x !== id) : [...pins, id].slice(-12); try { localStorage.setItem(PIN_KEY, JSON.stringify(pins)); } catch { /* yok */ } draw(); inp.focus(); return; }
    const b = e.target.closest('[data-i]'); if (b) run(+b.dataset.i);
  });
  list.addEventListener('pointermove', e => { const b = e.target.closest('[data-i]'); if (b && +b.dataset.i !== cur) { cur = +b.dataset.i; $$('button', list).forEach(x => x.classList.toggle('on', +x.dataset.i === cur)); } });
  draw(); inp.focus();
}
/* Ctrl+K kısayolu (ekran başına bir kez bağlanır, ekran değişince kaldırılır) */
export function bindPaletteKey(commands) {
  const onKey = e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openPalette(commands); return; }
    // U1: S — imleçte komut paleti (yazı alanında, açık pencerede ya da değiştirici tuşla değil)
    const tag = e.target?.tagName;
    if (e.key.toLowerCase() === 's' && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey && !['INPUT', 'TEXTAREA', 'SELECT'].includes(tag) && !e.target?.isContentEditable && !document.querySelector('.modal-back, .cmdk-back')) {
      e.preventDefault(); openPalette(commands, { at: lastPtr || { x: innerWidth / 2, y: innerHeight / 3 } });
    }
  };
  document.addEventListener('keydown', onKey);
  return () => document.removeEventListener('keydown', onKey);
}

/* ───────────── proje gezgini ─────────────
 * data(): { levels:[{idx,name,sub,active}], drawings:[{id,name,sub,active,main}], views:[{id,name,sub}], sheets:[{id,name,sub}] }
 * act(kind, id): 'level' | 'drawing' | 'view' | 'sheet' | 'add-level' | 'add-roof' | 'add-drawing' */
export function mountNavigator(host, { data, act }) {
  let closed = {}; try { closed = JSON.parse(localStorage.getItem('sg-nav-closed') || '{}'); } catch { /* yok */ }
  const sec = (k, t, rows, add) => `<section class="nv-s ${closed[k] ? 'off' : ''}" data-s="${k}">
    <header><button type="button" class="nv-t" data-tog="${k}">${icon('chevR')}<span>${t}</span><small>${rows.length}</small></button>${add || ''}</header>
    <div class="nv-rows">${rows.join('') || '<p class="nv-empty">—</p>'}</div></section>`;
  const row = (kind, r) => `<button type="button" class="nv-r ${r.active ? 'on' : ''}" data-k="${kind}" data-id="${esc(r.id ?? r.idx)}" title="${esc(r.name)}">${r.ic ? icon(r.ic) : ''}<span>${esc(r.name)}</span>${r.sub ? `<small>${esc(r.sub)}</small>` : ''}</button>`;
  const render = () => {
    const d = data();
    host.innerHTML = `<div class="nv-head"><b>Proje gezgini</b></div>
      ${sec('levels', 'Katlar', d.levels.map(r => row('level', { ...r, ic: r.kind === 'roof' ? 'roof' : 'layers' })), `<span class="nv-add"><button type="button" class="icon-btn sm" data-a="add-level" title="Kat ekle">${icon('plus')}</button><button type="button" class="icon-btn sm" data-a="add-roof" title="Çatı planı ekle">${icon('roof')}</button></span>`)}
      ${sec('drawings', 'Çizimler', d.drawings.map(r => row('drawing', { ...r, ic: r.main ? 'ruler' : 'edit' })), `<span class="nv-add"><button type="button" class="icon-btn sm" data-a="add-drawing" title="Yeni çizim">${icon('plus')}</button></span>`)}
      ${sec('views', 'Görünümler', d.views.map(r => row('view', { ...r, ic: r.ic || 'eye' })))}
      ${sec('sheets', 'Paftalar', d.sheets.map(r => row('sheet', { ...r, ic: 'file' })))}`;
  };
  host.addEventListener('click', e => {
    const tg = e.target.closest('[data-tog]');
    if (tg) { const k = tg.dataset.tog; closed[k] = !closed[k]; try { localStorage.setItem('sg-nav-closed', JSON.stringify(closed)); } catch { /* yok */ } tg.closest('.nv-s').classList.toggle('off', closed[k]); return; }
    const a = e.target.closest('[data-a]'); if (a) return act(a.dataset.a);
    const r = e.target.closest('.nv-r'); if (r) act(r.dataset.k, r.dataset.id);
  });
  render();
  return { render };
}

/* ───────────── durum çubuğu ─────────────
 * state(): { unit, units:[{k,t}], scale, scales:[], opts:{snap,ortho,dims,step}, steps:[], level }
 * on: { unit(k), scale(n), opt(k, v) } */
export function mountStatusbar(host, { state, on }) {
  const draw = () => {
    const s = state();
    host.innerHTML = `<span class="st-xy" title="İmleç konumu">X <b data-x>—</b> Y <b data-y>—</b> <i data-u>${esc(s.unit)}</i></span>
      <span class="st-sep"></span>
      <label class="st-f" title="Çizim ölçeği">Ölçek <select data-s="scale">${s.scales.map(n => `<option value="${n}" ${n === s.scale ? 'selected' : ''}>1:${n}</option>`).join('')}</select></label>
      <label class="st-f" title="Ölçü birimi">Birim <select data-s="unit">${s.units.map(u => `<option value="${u.k}" ${u.k === s.unit ? 'selected' : ''}>${u.k}</option>`).join('')}</select></label>
      <span class="st-sep"></span>
      ${[['snap', 'Yasla'], ['ortho', 'Orto'], ['dims', 'Ölçüler']].map(([k, t]) => `<button type="button" class="st-t ${s.opts[k] ? 'on' : ''}" data-o="${k}" title="${t}">${t}</button>`).join('')}
      <label class="st-f" title="Yaslama adımı">Adım <select data-s="step">${s.steps.map(n => `<option value="${n}" ${n === s.opts.step ? 'selected' : ''}>${n} cm</option>`).join('')}</select></label>
      <span class="st-grow"></span>
      <span class="st-lv" title="Etkin kat">${icon('layers')}<span data-lv>${esc(s.level)}</span></span>
      <span class="st-save" data-save title="Otomatik kayıt">${icon('check')}<span>Kaydedildi</span></span>`;
  };
  host.addEventListener('change', e => {
    const k = e.target.dataset.s; if (!k) return;
    if (k === 'unit') on.unit(e.target.value); else if (k === 'scale') on.scale(+e.target.value); else on.opt('step', +e.target.value);
  });
  host.addEventListener('click', e => { const b = e.target.closest('[data-o]'); if (b) on.opt(b.dataset.o, !b.classList.contains('on')); });
  draw();
  return {
    render: draw,
    cursor(p, fmt) { const x = $('[data-x]', host), y = $('[data-y]', host); if (x) { x.textContent = fmt(p.x); y.textContent = fmt(-p.y); } },
    save(st, at) {
      const el = $('[data-save]', host); if (!el) return;
      el.className = 'st-save ' + st;
      el.innerHTML = st === 'busy' ? `<i class="st-dot"></i><span>Kaydediliyor…</span>` : st === 'err' ? `${icon('alert')}<span>Kaydedilemedi</span>` : `${icon('check')}<span>Kaydedildi${at ? ' ' + at : ''}</span>`;
    },
  };
}
