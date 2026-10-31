# SAGGCAD

**SAGGCAD**, rölöve ve mimari çizim için bağımsız bir programdır. Tarayıcıda çalışır, kurulum ve hesap gerektirmez,
internet olmadan da açılır (telefon / tablette *Ana ekrana ekle* ile uygulama gibi kurulur).

Çizim motoru, [TadilatBodrum Saha](https://kesif.tadilatbodrum.com) uygulamasının **Rölöve & 3D** modülünden
(`aligokten/tadilatbodrum.com` → `public/saha`, commit `f8d5070`) alınmıştır. Orada iş takibinin bir sekmesi olan araç,
burada müşteri / teklif / keşif akışından bağımsız, kendi proje yönetimiyle çalışır.

🌐 Canlı sürüm: <https://aligokten.github.io/SAGGCAD/> (`main` dalına her gönderimde otomatik yayınlanır) ·
sürüm **0.4.0-b2b** (B2B geliştirme sürümü; sürüm geçmişi [docs/ROADMAP.md](docs/ROADMAP.md))

## Özellikler

### Arayüz (0.3)
- **Menü çubuğu:** Dosya, Çizim, Model, Görünüm, Belgele, Araçlar — tüm komutlar ve kısayolları.
- **Komut paleti (Ctrl+K):** her komut ve araç aranabilir; son kullanılanlar üstte. Mobilde ☰ düğmesi aynı listeyi açar.
- **Araç çubuğu:** Seçim, Duvar ve mahal, Kapı ve pencere, Yapı elemanları, Donatı, Belgeleme grupları;
  üzerine gelince açıklama ve kısayol.
- **Proje gezgini (Ctrl+B):** katlar, çizimler (rölöve / proje alternatifleri), görünümler (2D, 3D, cepheler, kesitler), paftalar.
- **Özellik paneli (Ctrl+I):** gizlenebilir, kenarından sürüklenerek genişletilebilir.
- **Durum çubuğu:** imleç koordinatı, ölçek, birim, yaslama / orto / ölçü, adım, etkin kat, otomatik kayıt durumu.
- **Çalışma alanları:** Rölöve (2D, sade araçlar), Mimari model (2D + 3D yan yana, tüm araçlar), 3D görselleştirme.
- **Açık / koyu tema** (Görünüm menüsü ya da üst çubuk); çizim alanı ve model renkleri temadan etkilenmez.
- Küçük ekranda araçlar altta yatay, 52 px dokunma hedefli; özellikler alt sayfada, gezgin çekmecede.
- Klavye kısayolları: F1 ya da Araçlar → Klavye kısayolları.

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

### Yapı elemanları (Archicad'deki yapı araçlarına karşılık)
- **Duvar türü / işlevi:** dış duvar, iç bölme, betonarme perde, yığma taşıyıcı, hafif bölme (alçı levha), bodrum / istinat, parapet;
  taşıyıcı / taşıyıcı değil işareti. Tür seçilince kompozit yapı ve kalınlık gelir; dış duvarda dış yüz otomatik binanın dışına alınır.
- **Kolon** (L): dikdörtgen ya da dairesel; betonarme, çelik, ahşap, yığma; planda malzeme taramasıyla dolu kesit.
- **Kiriş** (B): iki nokta; genişlik / yükseklik, üst kotu döşeme altına hizalı; planda kesik çizgi.
- **Döşeme** (F): köşelerle ya da dış hattan otomatik; ara kat, zemine oturan, balkon / çıkma, teras; üst yüz kotu.
- Kat döşemesine de kompozit yapı atanır (kat kotu yapının kalınlığından hesaplanır).

### BIM çekirdeği (B1 + B2A — parametrik düzenleme)
- Tüm yapı elemanları (duvar, kolon, kiriş, döşeme, kapı, pencere, boşluk, mahal, çatı, merdiven, korkuluk) ortak bir
  BIM şemasıyla okunur: kalıcı kimlik, sınıf (IFC karşılığı), tür, kat, geometri ve özellikler ayrı, ilişkiler.
- **Model → BIM Türleri ve Parametreler**: yerleşik türleri çoğaltıp projeye özel türler oluşturun (ör. `DIS-DUV-02`),
  işlev / kompozit / kalınlık / yükseklik / taşıyıcılık düzenleyin, elemanlara atayın. Tür değişince aynı türdeki
  elemanlar güncellenir; elemanda özel olarak değiştirilmiş değerler korunur ("Bu değişiklik 12 duvarı etkileyecek…").
- Özellik panelinin **BIM** bölümü: tür atama, her değerin kaynağı (Tür / Geçersiz kılındı / Eleman / Kat / Hesaplanan),
  **Türe döndür**, **Kata bağlı** yükseklik. Tüm BIM değişiklikleri tek adımda geri alınır (Ctrl+Z).
- **Akıllı duvar birleşimleri (B2B)**: L / T / X / I birleşimleri çizerken algılanır; kompozit katmanlar önceliğe göre
  temizlenir (çekirdek sürer, kaplama sarar). 2D plan, 3D model, kesit ve duvar metrajı aynı geometriden üretilir —
  köşede boşluk ya da çift hacim yok. Panelde birleşimler, referans çizgisi, katman öncelikleri, uç başına otomatik
  birleşim ve kat bağı (duvar / kolon / kiriş üst kotu). Örnekler: [docs/b2b](docs/b2b).
- Eski projeler aynen açılır: kayıt biçimi değişmedi; türler `meta.bimTypes`, atama `bimType`, geçersiz kılma `bimOv`
  isteğe bağlı alanlarında. Ayrıntı: [docs/BIM-CEKIRDEK.md](docs/BIM-CEKIRDEK.md).

### Malzeme katmanları ve yapı fiziği
- **Kompozit yapılar:** duvar ve döşemelerde katman katman malzeme ve kalınlık; taşıyıcı katman; katmanlar planda ve kesitte renk + taramayla.
- **Malzemeler ve yapılar** penceresi: hazır yapıları düzenleme, kopyalama, yeni yapı ve malzeme ekleme (projeye özel).
- Her malzeme için yoğunluk ρ, ısı iletkenliği λ, özgül ısı c, buhar difüzyon direnci μ, yangına tepki sınıfı.
- Her duvar / döşeme için otomatik: toplam kalınlık, birim alan kütlesi m', **U-değeri** (EN ISO 6946), R<sub>T</sub>, s<sub>d</sub>,
  **R<sub>w</sub>** (kütle yasası, EN 12354-1 Ek B; hafif sistemlerde test değeri), döşemede **L<sub>n,w,eq</sub>** (EN 12354-2 Ek B), en düşük yangın sınıfı.
- Değerler EN ISO 10456 ve yaygın ürün beyanlarına dayalı tipik tasarım değerleridir; projede ürünün performans beyanı (DoP) girilmelidir.

### Ölçek ve birim
- **Ölçü birimi** mm / cm / m: plan ölçüleri, özellik paneli girişleri, kesit / görünüş ölçüleri (kotlar her zaman metre).
- **Çizim ölçeği** 1:1 … 1:1000: ölçekli paftada çizimin kağıttaki boyu; yazı ve ölçü boyları kağıtta sabit.
- **Ölçekli pafta (PDF):** plan, kesit ve görünüşler gerçek ölçekte, antetli, grafik ölçekli; kağıt boyu (A4–A0) otomatik.

### Kesit ve görünüşler
- **Kesit hattı** (X) aracıyla istenen sayıda kesit; dört **cephe görünüşü** (plan yukarısı kuzey).
- Kesilen duvar, döşeme, kolon, kiriş katmanlarıyla taranır; arkada kalanlar görünüş olarak çizilir; çatılar dahil.
- **Otomatik ölçülendirme:** kat kotları arası zincir ve toplam yükseklik, kot işaretleri, genel genişlik, kesilen duvar /
  açıklık zinciri, kesilen duvarda parapet – lento düşey zinciri.
- Çıktı: ölçekli pafta PDF (tek görünüm ya da tümü), SVG, DXF (mm, katmanlı).

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
npm test         # sözdizimi denetimi + çizim motoru, yapı fiziği ve BIM testleri (node --test)
node tests/e2e/b1.e2e.cjs http://localhost:8080/    # isteğe bağlı tarayıcı testleri (Playwright gerekir)
node tests/e2e/b2a.e2e.cjs http://localhost:8080/
node tests/e2e/b2b.e2e.cjs http://localhost:8080/
npm run svg      # L / T / X birleşim örnekleri → docs/b2b/*.svg
npm run bench    # BIM servis katmanı ölçümü
```

Herhangi bir statik sunucu da olur; dosyayı doğrudan `file://` ile açmak ES modülleri nedeniyle çalışmaz.

## Yapı

```
index.html, manifest.webmanifest, sw.js   giriş sayfası, PWA bildirimi, çevrimdışı önbellek
js/main.js        SAGGCAD kabuğu: projeler, proje ekranı, çizim ekranı (2D / 3D / yan yana), dışa aktarma, listeler
js/store.js       yerel depo (IndexedDB): projeler, görseller, ayarlar, proje dosyası içe / dışa aktarma
js/plan2d.js      2D rölöve editörü          js/plan3d.js      3D görünüm ve render
js/materials.js   malzeme / kompozit / yapı fiziği   js/structure.js   yapı elemanları (çizim, panel, kütüphane)
js/sections.js    kesit ve görünüşler, pafta  js/units.js       birim ve ölçek
js/workbench.js   menü, komut paleti, gezgin, durum çubuğu, tema, çalışma alanları (motordan bağımsız)
css/ui.css        arayüz tasarım sistemi ve temalar
js/bim/           BIM çekirdeği: schema, types, fields, adapter, relations, commands, wallcmds, api, ui, manager,
                  joins, wallgeom, geom2d, mesh (duvar birleşimleri ve ortak geometri)
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
