# Parametrik BIM çekirdeği — geliştirme planı (ayrı aşama)

UI revizyonu (v0.3) çizim motoruna dokunmadan arayüzü yeniledi. Parametrik BIM çekirdeği, veri modelini
değiştireceği için ayrı ve geriye dönük uyumlu bir aşama olarak ele alınacak.

## Hedef
Elemanların (duvar, döşeme, kolon, kiriş, açıklık, mahal, çatı, merdiven) geometrisini parametrelerinden ve
birbirleriyle ilişkilerinden **türeten** bir çekirdek: bir parametre değiştiğinde bağlı elemanlar, metraj, kesit /
görünüş ve 3D kendiliğinden güncellenir. Archicad 30'daki eleman → katman → kat (story) mantığı referanstır.

## Aşamalar

### B1 — Eleman şeması ve tür (tip) sistemi
- `js/bim/schema.js`: eleman türleri, ortak alanlar (`id`, `type`, `level`, `params`, `rels`), sürüm alanı.
- Eleman **tipleri** (Archicad "favori" / IFC Type): parametre takımları projede tanımlanır, örnekler tipe bağlanır.
- Mevcut `plan.walls / rooms / openings / items / slabs` dizileri **okunarak** yeni yapıya eşlenir (göç katmanı);
  `.saggcad.json` v1 dosyaları açılmaya devam eder, kayıt v2 + v1 uyumlu alanlarla yazılır.

### B2 — İlişkiler ve kısıtlar
- Duvar birleşimleri (L / T / X) ve **katman önceliği** (kompozit köşe temizliği).
- Açıklık ↔ duvar, mahal ↔ sınırlayan duvarlar, döşeme ↔ kat kotu, kolon / kiriş ↔ kat yüksekliği bağları.
- Kat (story) tanımları: kot, yükseklik, "üst kata bağlı" yükseklikler (duvar üst kotu = üst kat döşeme altı).

### B3 — Türetme ve yeniden hesaplama
- Bağımlılık grafiği; değişen parametreden etkilenen elemanların kirli (dirty) işaretlenmesi ve artımlı güncelleme.
- Geometri üreticileri: plan (2D sembol), 3D (mesh), kesit (prizma + katman) aynı türetilmiş modelden.
- Metraj ve yapı fiziği (U, Rw, m') türetilmiş modelden.

### B4 — Değişiklik geçmişi ve işbirliği hazırlığı
- Komut / işlem tabanlı geri al–yinele (bugünkü anlık görüntü yerine), değişiklik kümeleri.
- Rölöve ↔ proje alternatifleri arasında eleman bazlı fark (yıkılan / yeni / korunan) durumu.

### B5 — Değişim formatları
- IFC 4 dışa aktarma (IfcWall, IfcSlab, IfcColumn, IfcBeam, IfcOpeningElement, IfcSpace, malzeme katmanları).
- Pafta düzenleyici: proje gezginindeki "Paftalar" bölümünde birden çok görünümü tek paftaya yerleştirme.

## Kabul ölçütleri (her aşama)
- Mevcut IndexedDB kayıtları ve `.saggcad.json` dosyaları kayıpsız açılır; `npm test` ve uçtan uca akışlar geçer.
- Rölöve çizimleri ve proje alternatifleri korunur; dışa aktarma çıktıları (DXF, 3D, kesit) eşdeğer kalır.
