# UniCAD referansı (U1)

[UniCAD](https://github.com/UNITRONIX/UniCAD), FreeCAD 1.2-dev üzerine Fusion 360 tarzı bir iş akışı ekleyen açık kaynak
bir parametrik CAD çatalıdır (C++ / Qt 6 / OpenCASCADE / Coin3D, LGPL-2.1). SAGGCAD derlemesiz bir tarayıcı uygulaması
olduğundan UniCAD kodu **taşınmadı**; UniCAD'in kendi eklediği arayüz kavramları incelenip SAGGCAD'in mevcut mimarisi
(B3 merkezi işlem günlüğü, BIM komutları, Three.js görünümü) üzerinde **yeniden yazıldı**. Bu nedenle LGPL kapsamında
kod paylaşımı yoktur; yalnız tasarım fikirleri referans alınmıştır.

## Eşleme

| UniCAD bileşeni | Ne yapar (UniCAD) | SAGGCAD karşılığı | Durum |
|---|---|---|---|
| `FusionTimeline` | Parametrik özellik geçmişi şeridi, çipe tıklayınca seçme, geri sarma imleci | **İşlem zaman çizelgesi** (`js/timeline.js`, 2D çubuk → "Zaman çizelgesi"): B3 günlüğünün her kaydı bir çip; BIM komutları mavi numaralı; bir çipe tıklayınca model o işlemden hemen sonraki duruma sarılır, ileri çipe tıklayınca yinelenir; geri alınmış kayıtlar soluk kesikli; sarma atomik | ✅ |
| `FusionSelectionBar` | Seçim filtreleri (nokta / kenar / yüz / gövde / özellik), VEYA mantığı, boşsa her şey | **Seçim filtresi** (2D çubuk → "Filtre"): Duvar, Kapı / pencere, Mahal, Eleman / donatı, Döşeme / çatı, Ölçü / yazı / kesit; tıklama, alan seçimi ve Tümünü seç filtreye uyar; seçili nesnenin tutamaçları etkilenmez; ayar kalıcı | ✅ |
| Smart PressPull (`Q`) | Seçime göre uyarlanan meta komut (çizim → Extrude, yüz → OffsetFace) | **Akıllı Bas-Çek** (`Q`, `js/presspull.js`): duvar → ötele / kalınlık / yükseklik; yay → yarıçap / ok; kapı-pencere → genişlik / yükseklik / denizlik; mahal → yükseklik; döşeme → kalınlık / üst kot; kolon / kiriş → boyutlar. Değer BIM komutuyla uygulanır (doğrulama, tek Ctrl+Z); Tab kip değiştirir | ✅ |
| `FusionCommandPalette` (`S`) | İmleçte açılan palet, arama, sabitlenen ve son komutlar | **İmleçte palet** (`S`) + **sabitleme** (★): mevcut Ctrl+K paletine imleç konumu ve "Sabitlenenler" bölümü eklendi; yazı alanında S çalışmaz | ✅ |
| `FusionNavigationBar` | Görünüm altında gezinme: yörünge, kaydır, sığdır, görünüm ön ayarları | **3D gezinme çubuğu**: Sığdır / izometrik, Üst, Ön, Arka, Sol, Sağ (`Plan3D.viewPreset`) | ✅ |
| `ViewportStyleManager` | Shapr3D tarzı görünüm stili ön ayarları | **Görünüm stili**: Varsayılan, Koyu stüdyo, Beyaz maket (`Plan3D.setStyle`, kalıcı) | ✅ |
| `CommandSearchDialog` (`Ctrl+/`) | Komut arama | SAGGCAD'de zaten var (Ctrl+K) | — |
| `FusionTabToolbar` | Sekmeli araç çubuğu (SKETCH / SOLID / …) | SAGGCAD'in gruplu araç rafı ve menüsü aynı işi görüyor; değiştirilmedi (tasarım dili korunur) | — |
| `FusionSketchPalette` | Çizim kipinde kayan araç paleti | Aday: 2D'de bağlama göre kayan mini palet | 🔜 |
| `TaskRenderStudio` | Işık / zemin / dolgu ışığı ayarları | Aday: render penceresine ışık ön ayarları | 🔜 |
| Birleşik Join / Cut, yüz araçları | Katı modelleme (OCCT) | BIM duvar modelinde karşılığı yok (duvar / açıklık komutları bu işi görür) | — |

## Kısayollar
- `Q` Akıllı Bas-Çek (seçili nesne) · `S` imleçte komut paleti · `Ctrl+K` komut paleti · `Ctrl+Z` / `Ctrl+Shift+Z` geri al / yinele

## Testler
- `tests/u1.test.mjs` (birim): zaman çizelgesi çipleri, her konuma sarma birebir, başarısız sarmada başlangıca dönüş;
  Bas-Çek kipleri ve komutları, uzunluk girdisi.
- `tests/e2e/u1.e2e.cjs` (Playwright): filtre, zaman çizelgesi, Bas-Çek (Tab, alt sınır reddi, Esc, Ctrl+Z), S paleti ve
  sabitleme, 3D görünüm ön ayarları ve stiller, mobil sığma.
