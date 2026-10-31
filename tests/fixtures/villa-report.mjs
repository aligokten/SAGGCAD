// Örnek villa metraj tabloları (Markdown) — motor çıktısından üretilir: node tests/fixtures/villa-report.mjs > docs/b4c/villa-metraj.md
import { readFileSync } from 'node:fs';
import { drawingQuantities, CATS } from '../../js/bim/quantities.js';
import { quantityDiff, aggregate } from '../../js/bim/qtydiff.js';
import { matOf } from '../../js/materials.js';
const F = JSON.parse(readFileSync(new URL('./villa-ornek.saggcad.json', import.meta.url), 'utf8')), [A, B] = F.project.drawings.map(d => d.plan);
const n = (v, d = 2) => v === null || v === undefined ? '—' : (+v).toLocaleString('tr-TR', { minimumFractionDigits: d, maximumFractionDigits: d });
const LN = { L0: 'Zemin kat', k1: '1. Kat' };
const out = [];
const p = s => out.push(s);
p('# Örnek villa — rölöve ↔ tadilat projesi metrajı (B4C)\n');
p('Kaynak: `tests/fixtures/villa-ornek.saggcad.json` (2 kat; dış duvar tuğla 19 + EPS 5 mantolama, iç bölme tuğla 10). Tablolar motor çıktısıdır (`js/bim/quantities.js`, `js/bim/qtydiff.js`); bu dosya `node tests/fixtures/villa-report.mjs` ile yeniden üretilir.\n');
p('Tadilat: salon–yatak odası duvarı kaldırılır (açık plan), banyo duvarı gazbetonla tamamen yenilenir, salon penceresi 180 → 240 cm, yeni gazbeton bölme ve bahçe kapısı; 1. katta banyo duvarı 2,80 → 2,60 m (karar bekliyor).\n');
const QA = drawingQuantities(A);
p('## 1. Duvar metrajı (rölöve)\n');
p('| Kat | Duvar | Kompozit | Boy (m) | Kalınlık (m) | Yükseklik (m) | Brüt alan (m²) | Net alan (m²) | Hacim (m³) | Durum |'); p('|---|---|---|--:|--:|--:|--:|--:|--:|---|');
for (const e of QA.elements.filter(e => e.cls === 'wall')) p(`| ${LN[e.level]} | ${e.id} | ${e.compName || '—'} | ${n(e.q.L)} | ${n(e.q.T, 3)} | ${n(e.q.H)} | ${n(e.q.gross)} | ${n(e.q.net)} | ${n(e.q.volume, 3)} | ${e.status === 'ok' ? 'tamam' : e.status} |`);
p('\n## 2. Döşeme metrajı (rölöve)\n');
p('| Kat | Döşeme | Brüt alan (m²) | Net alan (m²) | Kalınlık (cm) | Hacim (m³) | Durum |'); p('|---|---|--:|--:|--:|--:|---|');
for (const e of QA.elements.filter(e => e.cls === 'slab')) p(`| ${LN[e.level]} | ${e.id === '#kat-dosemesi' ? 'Kat döşemesi' : `${e.id} (${e.type})`} | ${n(e.q.gross)} | ${n(e.q.net)} | ${n(e.q.t, 1)} | ${n(e.q.net * e.q.t / 100, 3)} | ${e.status === 'ok' ? 'tamam' : `uyarı: ${e.note}`} |`);
p('\n## 3. Mahal metrajı (rölöve)\n');
p('| Kat | Mahal | Net zemin (m²) | Çevre (m) | Yükseklik (m) | Duvar kaplaması (m²) | Süpürgelik (m) |'); p('|---|---|--:|--:|--:|--:|--:|');
for (const e of QA.elements.filter(e => e.cls === 'room')) p(`| ${LN[e.level]} | ${e.name} | ${n(e.q.area)} | ${n(e.q.perim)} | ${n(e.q.h)} | ${n(e.q.wall)} | ${n(e.q.skirting)} |`);
p('\n_Duvar kaplaması: çevre × mahal yüksekliği − tüm açıklıklar (varsayılan politika); süpürgelik: çevre − kapı genişlikleri._\n');
p('## 4. Malzeme toplamları (rölöve, proje geneli)\n');
p('| Kategori | Malzeme | Hacim (m³) |'); p('|---|---|--:|');
for (const x of QA.totals.project.filter(x => x.item.startsWith('layer-vol:')).sort((a, b) => b.qty - a.qty)) p(`| ${CATS[x.category] || x.category} | ${matOf(A, x.material)?.t || x.material || 'Genel'} | ${n(x.qty, 3)} |`);
const D = quantityDiff(A, B), agg = aggregate(D.lines), prices = B.meta.revision.qty.prices;
p('\n## 5. Tadilat metraj farkı (rölöve → proje)\n');
p('Söküm ve yeni imalat yalnız onaylı kararları içerir; "onay bekleyen" sütunu tahmindir. Fiyatlar örnek kullanıcı girişidir (KDV hariç, TRY).\n');
p('| İmalat | Birim | Mevcut | Yeni | Net fark | Söküm | Yeni imalat | Onay bekleyen (söküm / imalat) |'); p('|---|---|--:|--:|--:|--:|--:|--:|');
for (const g of agg.groups) {
  const rows = g.rows.filter(r => Math.abs(r.net) > 1e-9 || r.demolish || r.build || r.demolishPending || r.buildPending); if (!rows.length) continue;
  p(`| **${g.title}** | | | | | | | |`);
  for (const r of rows) p(`| ${r.label} | ${r.unit} | ${n(r.before)} | ${n(r.after)} | ${r.net > 0 ? '+' : ''}${n(r.net)} | ${n(r.demolish)} | ${n(r.build)} | ${r.demolishPending || r.buildPending ? `${n(r.demolishPending)} / ${n(r.buildPending)}` : ''} |`);
}
p(`\nKarar bekleyen elemanlar: ${D.pending.map(x => `\`${x.key}\` (${x.reason})`).join(', ') || 'yok'}.`);
p(`\nGirilen birim fiyatlar: ${Object.entries(prices).map(([k, v]) => `\`${k}\` ${n(v)}`).join(', ')}.`);
console.log(out.join('\n'));
