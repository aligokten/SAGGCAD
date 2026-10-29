/* Belge başlığı / altlığı (doğrama listesi, zemin sipariş listesi, dolap çizimleri) ve önizleme */
import { esc } from './ui.js';

export function printDoc(html, title = 'SAGGCAD') {
  import('./docview.js').then(m => m.openDocument(html, title));
}

export function docHeader(settings, title, sub = '') {
  const c = settings.company || {};
  return `<header class="p-head">
    <img src="assets/logo.png" class="p-logo" alt="">
    <div class="p-co"><b>${esc(c.name)}</b>${[c.address, c.phone, c.email, c.web].filter(Boolean).map(esc).join('<br>')}</div>
  </header>
  <div class="p-title"><h1>${esc(title)}</h1>${sub}</div>`;
}

export const docFooter = () => `<footer class="p-foot"><div class="p-bar"></div></footer>`;
