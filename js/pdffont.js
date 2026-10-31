/* ═══ PDF yazı tipi: DejaVu Sans gömme (B4C) ═══
 * jsPDF'in standart yazı tipleri (Helvetica, WinAnsi) Türkçe ı, ş, ğ, İ harflerini içermez. vendor/fonts altındaki
 * DejaVu Sans (Bitstream Vera türevi, serbest lisans: vendor/fonts/LICENSE-dejavu) PDF'e gömülür.
 * Gömme başarısız olursa (dosya yok / çevrimdışı önbellekte değil) Helvetica'ya düşülür ve sonuç `lossy: true` olur —
 * çağıran bunu kullanıcıya bildirmelidir; karakter kaybı gizlenmez.
 */
const FILES = { normal: 'DejaVuSans.ttf', bold: 'DejaVuSans-Bold.ttf' };
let cache = null;
const b64 = buf => { let s = ''; const u = new Uint8Array(buf); for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
async function load() {
  if (cache) return cache;
  cache = Promise.all(Object.entries(FILES).map(async ([style, f]) => { const r = await fetch(`vendor/fonts/${f}`); if (!r.ok) throw new Error(`${f}: ${r.status}`); return [style, f, b64(await r.arrayBuffer())]; }))
    .catch(e => { cache = null; throw e; });
  return cache;
}
/* pdf'e yazı tipini ekle → { family, lossy, text(s) }; text: gömülemediyse ASCII karşılığa çevirir */
export async function pdfFont(pdf) {
  try {
    for (const [style, f, data] of await load()) { pdf.addFileToVFS(f, data); pdf.addFont(f, 'DejaVu', style); }
    pdf.setFont('DejaVu', 'normal');
    return { family: 'DejaVu', lossy: false, text: s => String(s ?? '') };
  } catch (e) {
    console.warn('PDF yazı tipi gömülemedi; Türkçe karakterler ASCII karşılıklarıyla yazılacak', e);
    return { family: 'helvetica', lossy: true, text: s => String(s ?? '').replace(/ğ/g, 'g').replace(/Ğ/g, 'G').replace(/ş/g, 's').replace(/Ş/g, 'S').replace(/ı/g, 'i').replace(/İ/g, 'I').replace(/²/g, '2').replace(/³/g, '3') };
  }
}
