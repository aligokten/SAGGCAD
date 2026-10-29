# SAGGCAD

**SAGGCAD**, rölöve ve mimari çizim için bağımsız bir programdır. Tarayıcıda çalışır, kurulum ve hesap gerektirmez,
internet olmadan da açılır (telefon / tablette *Ana ekrana ekle* ile uygulama gibi kurulur).

Çizim motoru, [TadilatBodrum Saha](https://kesif.tadilatbodrum.com) uygulamasının **Rölöve & 3D** modülünden
(`aligokten/tadilatbodrum.com` → `public/saha`, commit `f8d5070`) alınmıştır. Orada iş takibinin bir sekmesi olan araç,
burada müşteri / teklif / keşif akışından bağımsız, kendi proje yönetimiyle çalışır.

🌐 Canlı sürüm: <https://aligokten.github.io/SAGGCAD/> (`main` dalına her gönderimde otomatik yayınlanır)

## Özellikler

### Projeler ve çizimler
- Her projede birden fazla çizim: **Rölöve (mevcut durum)** ve **Proje / tasarım** seçenekleri (Proje 1, Proje 2…).
  Proje çizimi genellikle rölövenin kopyasından başlar; rölöve projede **soluk kesik çizgili altlık** olarak görünür.
- Kroki / fotoğraf / render görselleri projeyle birlikte saklanır.
- Veriler tarayıcıda (IndexedDB) tutulur. **Proje dosyasını indir** ile çizimler ve görseller tek `.saggcad.json`
  dosyasına alınır; başka cihazda **Proje dosyası aç** ile açılır.

### 2D rölöve editörü
- **Duvar:** noktaları işaretleyin ya da uzunluğu yazıp yön okuna basın (→ ↓ ← ↑) — sahada ölçülen değerleri birebir
  girmek için. Başlangıç noktasına dönünce oda otomatik oluşur. Yay duvar.
- **Ölçüyle oda:** en × boy girerek bitişik oda ekleme; dikdörtgen ve çokgen oda.
- Kapı / pencere / boşluk (model, kullanım, kasa ve kanat renkleri), korkuluk, mobilya ve donatı kütüphanesi, merdiven, çatı,
  ölçü çizgisi, yazı; çok katlı yapı (kat ekle, çatı planı).
- **Altlık:** elle çizilmiş krokinin fotoğrafını arkaya koyup iki nokta ile ölçekleyerek üzerinden çizme.
- Izgaraya / uçlara yaslama, 0-45-90° yakalama, geri al / yinele, oda bazlı metraj (zemin, net duvar).
- Kısayollar: V seç, W duvar, R oda, D kapı, P pencere, M mobilya, O ölçü, T yazı, Ctrl+Z / Ctrl+Y, Del, Esc.

### İçe aktarma (DXF / PDF)
- AutoCAD **DXF** veya vektör **PDF** plan otomatik olarak çizime dönüşür: duvarlar paralel çift çizgilerden, kapılar
  açılım yayından, pencereler cam çizgilerinden, odalar kapalı alanlardan; oda adları çizimdeki yazılardan.
- DXF birimi dosyadan okunur; **Ölçekle** aracıyla bilinen bir ölçüden düzeltme. Taranmış PDF altlık olarak eklenir.
- DWG için AutoCAD'de *Farklı Kaydet → DXF* (veya ücretsiz ODA File Converter).

### 3D ve render
- Plan otomatik olarak 3D'ye çevrilir: kuşbakışı / üstten / **iç mekan** (yürüme), kesit, tavan, güneş yönü ve yüksekliği.
- **Render:** *Hızlı* (gölge + ortam kapatma) veya *Fotogerçekçi* (GPU path tracing).

### Mutfak ve giysi dolabı tasarlayıcı
- Seçili duvara otomatik mutfak / dolap dizimi, modül türleri, malzeme, kulp, menteşe markası, ankastre cihazlar, davlumbaz, LED.
- Ön görünüş, iç düzen, 3D önizleme, **kesim listesi** ve donanım listesi; PDF, ön görünüş DXF, kesim listesi CSV.

### Dışa aktarma
| Tür | Biçim |
|---|---|
| 2D çizim | **DXF** (katmanlı, mm), **PNG** |
| 3D model | SketchUp **.dae**, **3DS**, **STL**, **DXF 3D**, **GLB** |
| Listeler | **Doğrama listesi** (PDF), **zemin sipariş listesi** (PDF / metin), parça **etiketleri** (QR kodlu PDF) |
| İmalat | **CNC kesim şablonu** (DXF, levhalara yerleşik) |
| Kağıt | Izgaralı **A4 rölöve çizim altlığı** |

Belge başlıklarındaki firma bilgisi **Ayarlar**'dan girilir.

## Çalıştırma

Derleme adımı yoktur — saf ES modülleri. three.js, three-gpu-pathtracer, pdf.js, dxf-parser, jsPDF, html2canvas ve
qrcode `vendor/` altında gömülüdür (çevrimdışı çalışır).

```bash
npm start        # http://localhost:8080  (python3 -m http.server)
npm test         # sözdizimi denetimi + çizim motoru duman testleri (node --test)
```

Herhangi bir statik sunucu da olur; dosyayı doğrudan `file://` ile açmak ES modülleri nedeniyle çalışmaz.

## Yapı

```
index.html, manifest.webmanifest, sw.js   giriş sayfası, PWA bildirimi, çevrimdışı önbellek
js/main.js        SAGGCAD kabuğu: projeler, proje ekranı, çizim ekranı (2D / 3D / yan yana), dışa aktarma, listeler
js/store.js       yerel depo (IndexedDB): projeler, görseller, ayarlar, proje dosyası içe / dışa aktarma
js/plan2d.js      2D rölöve editörü          js/plan3d.js      3D görünüm ve render
js/plan-geom.js   plan geometrisi ve metraj   js/importer.js, importui.js   DXF / PDF içe aktarma
js/exporters.js   DXF, DAE, 3DS, STL, DXF 3D  js/cabinet.js, cabdesign.js   mutfak / dolap tasarlayıcı
js/roof.js, stairs.js, tiles.js, openings.js, fixtures.js, joinery.js, floororder.js, labels.js, cnc.js, forms.js …
tests/            node --test duman testleri
```

## Lisanslar

Gömülü kütüphanelerin lisansları `vendor/` altındadır: three.js, three-gpu-pathtracer, three-mesh-bvh, dxf-parser,
html2canvas, jsPDF, qrcode (MIT), pdf.js (Apache-2.0).

## Yol haritası

Eklenecek özellikler ve referans alınacak programlar: [docs/ROADMAP.md](docs/ROADMAP.md).
