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

### BIM çekirdeği (B1 → B3 — parametrik düzenleme, artımlı model)
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
- **B3 — merkezi geçmiş ve artımlı model**: çizim başına tek geri al / yinele günlüğü (katlar arası, kat ekleme / silme
  dahil, tek Ctrl+Z); kanvasta duvar sürüklemesi bırakınca BIM komutu olur (sığmayan açıklık reddedilir); bağımlılık
  grafiği; yalnız etkilenen duvarlar yeniden hesaplanır ve 3D'de yalnız onların ağları yenilenir (kamera korunur);
  sıralı kısıt çözücü çakışmaları raporlar, sessizce düzeltmez. **Araçlar → Model Sağlığı**: eleman, kata bağlı,
  birleşim sorunu, çözülemeyen kısıt, geçersiz geometri, son güncelleme; önerilen düzeltmeyi "Uygula". Yay duvarda
  yarıçap / ok yüksekliği parametrik (panelde "Yarıçap").
- **Rölöve–proje karşılaştırması ve tadilat (B4)**: Model → *Revizyon karşılaştırması (tadilat)…* iki çizimi eleman
  kimliğiyle karşılaştırır (değişmeyen / geometrisi değişen / parametreleri değişen / yalnız kaynakta / yalnız hedefte /
  güvenle eşleştirilemeyen); kalınlığı değişen duvar yeni duvar sayılmaz, farklı kimlikle yeniden çizilen eleman yalnız
  öneriyle ve onayla eşleşir. Safhalar (Mevcut, Yıkılacak, Yeni, Değiştirilecek) önce öneri, onayla karar; tek Ctrl+Z.
  Revizyon görünümü (yıkım kırmızı kesik + tarama, yeni yeşil çapraz tarama, değişen turuncu + eski konum), Mevcut Durum /
  Yıkım / Yeni İmalat / Karşılaştırma paftaları (vektörel PDF, SVG, DXF), fark raporu (CSV, PDF). Ayrıntı:
  [docs/REVIZYON.md](docs/REVIZYON.md), örnekler: [docs/b4](docs/b4).
- **İmalat metrajı ve tadilat farkı (B4C)**: Revizyon penceresi → *Metraj Farkı*: duvar (brüt / net alan, boy, hacim,
  katman hacimleri), doğrama, döşeme, mahal kaplamaları; mevcut / yeni / net fark / söküm / yeni imalat ayrı; söküm ve imalat
  yalnız onaylı safha ve müdahale yöntemiyle kesinleşir. İsteğe bağlı birim fiyat (kullanıcı girer), CSV ve Türkçe karakterli
  PDF rapor. **Tasarım sınırları (maksimum)**: Model menüsü; aşımlar Model Sağlığı'nda. Örnek: [docs/b4c](docs/b4c).
- **Proje Sürümleri (B4D)**: Dosya → *Sürüm Kaydet…* (Ctrl+Alt+S, ad + not) ve *Proje Sürümleri…*: kalıcı kayıt noktaları
  (tüm çizimler, katlar, BIM elemanları, revizyon kararları, fiyatlar ve görseller; SHA-256 ile doğrulanır, aynı içerik iki kez
  kaydedilmez). Önizleme, güncel proje ya da başka sürümle karşılaştırma (eleman ve metraj farkı), **kopya olarak** ya da
  önce otomatik kurtarma sürümü alınarak **üzerine** geri yükleme, sürümlerle birlikte dışa / içe aktarma, isteğe bağlı
  otomatik sürümler (Ayarlar). *İşlem Geçmişi* (Ctrl+Z, zaman çizelgesi) yalnız açık oturumdur; sürümler kalıcıdır.
  Ayrıntı: [docs/REVIZYON.md](docs/REVIZYON.md#b4d--kalıcı-proje-sürümleri-akıllı-karşılaştırma-ve-güvenli-geri-yükleme-062-b4d-uygulandı).
- **UniCAD esinli iş akışı (U1)**: işlem **zaman çizelgesi** (bir adıma tıklayıp modeli o ana sar), **seçim filtresi**,
  **Akıllı Bas-Çek** (`Q`: seçime göre ötele / kalınlık / yükseklik / yarıçap…), imleçte **komut paleti** (`S`) ve
  sabitlenen komutlar, 3D **gezinme çubuğu** (Üst / Ön / Arka / Sol / Sağ / izometrik) ve **görünüm stilleri**
  (Koyu stüdyo, Beyaz maket). Ayrıntı: [docs/UNICAD-REFERANS.md](docs/UNICAD-REFERANS.md).
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
| Proje | **.saggcad.json** (görsellerle; isteğe bağlı seçilmiş proje sürümleriyle) |

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
node tests/e2e/b4d.e2e.cjs http://localhost:8080/       # B4D: proje sürümleri, gerçek IndexedDB
node tests/e2e/b4d-perf.e2e.cjs http://localhost:8080/  # B4D: 100 / 500 / 1000 sürüm ölçümü
npm run svg      # L / T / X birleşim örnekleri → docs/b2b/*.svg
npm run bench    # BIM servis katmanı ölçümü
npm run bench:b3 # B3: 100 / 500 / 2000 / 5000 duvar — artımlı geometri, komut, 3D, metraj, geri al
```

Herhangi bir statik sunucu da olur; dosyayı doğrudan `file://` ile açmak ES modülleri nedeniyle çalışmaz.

## Yapı

```
index.html, manifest.webmanifest, sw.js   giriş sayfası, PWA bildirimi, çevrimdışı önbellek
js/main.js        SAGGCAD kabuğu: projeler, proje ekranı, çizim ekranı (2D / 3D / yan yana), dışa aktarma, listeler
js/store.js       yerel depo (IndexedDB v2): projeler, görseller, ayarlar, proje dosyası içe / dışa aktarma
js/versions.js    B4D proje sürümleri: anlık görüntü + SHA-256, kaydet / listele / karşılaştır / geri yükle
js/verui.js       B4D arayüzü: Sürüm Kaydet, Proje Sürümleri yöneticisi, karşılaştırma, geri yükleme
js/plan2d.js      2D rölöve editörü          js/plan3d.js      3D görünüm ve render
js/materials.js   malzeme / kompozit / yapı fiziği   js/structure.js   yapı elemanları (çizim, panel, kütüphane)
js/sections.js    kesit ve görünüşler, pafta  js/units.js       birim ve ölçek
js/workbench.js   menü, komut paleti, gezgin, durum çubuğu, tema, çalışma alanları (motordan bağımsız)
js/timeline.js    işlem zaman çizelgesi      js/presspull.js   Akıllı Bas-Çek (Q) kipleri
js/revview.js     revizyon katmanı / paftaları (SVG, DXF, PDF)   js/revui.js   Revizyon Karşılaştırması penceresi
js/pdffont.js     PDF'e DejaVu Sans gömme (vendor/fonts, lisans: vendor/fonts/LICENSE-dejavu)
css/ui.css        arayüz tasarım sistemi ve temalar
js/bim/           BIM çekirdeği: schema, types, fields, adapter, relations, commands, wallcmds, api, ui, manager,
                  joins, wallgeom, geom2d, mesh (duvar birleşimleri ve ortak geometri),
                  history (merkezi işlem günlüğü), deps (bağımlılık grafiği), solver (kısıt çözücü),
                  diff (rölöve ↔ proje karşılaştırması), quantities / qtydiff (metraj ve metraj farkı)
js/plan-geom.js   plan geometrisi ve metraj   js/importer.js, importui.js   DXF / PDF içe aktarma
js/exporters.js   DXF, DAE, 3DS, STL, DXF 3D  js/cabinet.js, cabdesign.js   mutfak / dolap tasarlayıcı
js/roof.js, stairs.js, tiles.js, openings.js, fixtures.js, joinery.js, floororder.js, labels.js, cnc.js, forms.js …
tests/            node --test birim testleri; tests/e2e/ Playwright uçtan uca; tests/bench/ ölçümler
```

## Lisanslar

Gömülü kütüphanelerin lisansları `vendor/` altındadır: three.js, three-gpu-pathtracer, three-mesh-bvh, dxf-parser,
html2canvas, jsPDF, qrcode (MIT), pdf.js (Apache-2.0), DejaVu Sans yazı tipi (Bitstream Vera türevi serbest lisans, `vendor/fonts/LICENSE-dejavu`).

## Yol haritası

Eklenecek özellikler ve referans alınacak programlar: [docs/ROADMAP.md](docs/ROADMAP.md).
