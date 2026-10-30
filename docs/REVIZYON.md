# Rölöve–Proje Karşılaştırması ve Tadilat Yönetimi (B4A + B4B)

Sürüm `0.6.0-b4`. Kayıt biçimi (`.saggcad.json`) korunur; yeni alanların hepsi isteğe bağlıdır, eski dosyalar aynen açılır.

## Modüller
| Dosya | Görev |
|---|---|
| `js/bim/diff.js` | Karşılaştırma motoru (saf, salt okunur): eşleştirme, durumlar, safha önerisi + karar, öneriler, özet, CSV |
| `js/bim/commands.js` | Yeni komutlar: `setRevisionPhase`, `matchElements`, `unmatchElements`, `setRevisionCode` (tek geri alınabilir işlem) |
| `js/revview.js` | Revizyon ilkelleri → ekran katmanı (SVG), ölçekli pafta (SVG, mm), DXF R12, vektörel PDF |
| `js/revui.js` | Model → **Revizyon karşılaştırması (tadilat)…** penceresi |
| `js/main.js` | Çizim kökeni (kopyalama), revizyon görünümü şeridi, menü komutları |
| `js/plan2d.js` | Editörde revizyon katmanı kancası (`setRevision`) — çizim verisine dokunmaz |

## Veri (hepsi isteğe bağlı)
- **Çizim kaydı** (`project.drawings[i]`): `sourceDrawingId`, `sourceCreatedAt`, `revisionLabel` — yalnız bir çizim
  başka bir çizimin kopyasından oluşturulunca yazılır (proje ekranı → Kopyala, ya da Yeni çizim → "… kopyasından").
  Eski / bağımsız çizimlere otomatik kaynak atanmaz. Kopyalama eleman ve kat kimliklerini korur (derin kopya).
- **Hedef çizim planı** `meta.revision`: `{ code?, phases?: { 'KAT/kimlik': 'existing'|'demolish'|'new'|'modify' },
  matches?: [{ level, src, dst }] }` — yalnız kullanıcı kararları. Karşılaştırma sonucu **saklanmaz**; her seferinde
  kaynak ve hedeften türetilir. Kararların hepsi kaldırılınca alan kayıttan silinir.

## Eşleştirme kuralları
1. Aynı kat kimliği (`L0` = zemin, diğerleri `levels[i].id`) içinde aynı eleman kimliği → eşleşir.
2. Aynı kimlik başka katta, kat içinde tekrar eden kimlik ya da farklı eleman sınıfı → **güvenle eşleştirilemeyen**.
3. Kimliği farklı ama aynı yerdeki elemanlar **otomatik eşleşmez**; öneri üretilir (duvar uçları ≤ 4 cm, açıklık aynı
   duvar ve ≤ 5 cm, mahal ağırlık merkezi ≤ 20 cm ve alan ±%5, kolon / donatı ≤ 5 cm). Onaylanan öneri `matches`'e yazılır.
4. Kullanıcı eşleştirmesi doğrulanır (kaynak ve hedef aynı katta eşleşmemiş olmalı, sınıf aynı olmalı); geçersizse
   uygulanmaz, `invalidMatches` içinde gerekçesiyle raporlanır ve pencerede gösterilir.

## Durumlar ve toleranslar
`unchanged` · `geometry` · `params` · `removed` (yalnız kaynakta) · `added` (yalnız hedefte) · `uncertain`.
- Geometri alanları: duvar `a, b, t (etkin), h (etkin), z0, arc, face`; açıklık `wallId, pos, w, h, sill`; mahal `pts, fz`;
  kolon / kiriş / donatı `x, y, w, d, h, z, rot`; döşeme `pts, t, top`. Diğer alanlar parametre (kompozit, tür, malzeme…).
- Tolerans: uzunluk / koordinat **0,5 cm**; etkin değerler (boş kalınlık = kat varsayılanı) karşılaştırılır.
- Anlamsız farklar yok sayılır: anahtar sırası, `_` önekli alanlar, `createdAt / updatedAt / cache…`, mahalin türetilmiş
  `walls` bağ listesi. Kat kotları (z, yükseklik, döşeme) ayrıca karşılaştırılır. Sonuç girdi sırasından bağımsız ve belirlenimci.

## Safhalar
Otomatik **öneri**: değişmeyen → Mevcut, değişen → Değiştirilecek, yalnız kaynakta → Yıkılacak (önerilen kaldırma),
yalnız hedefte → Yeni. **Karar** (`phases`) öneriden ayrı tutulur; panelde "otomatik öneri" / "onaylandı" olarak görünür.
Etkin safha = karar ‖ öneri. BIM eleman sınıfları değişmez.

## Revizyon görünümü ve paftalar
- Pencere → **Çizimde göster**: editörde revizyon katmanı (plan soluk), üstte lejant şeridi. Görünürlük: tüm / yalnız
  yıkılacak / yeni / değişen / korunacak. Listeden **Göster** ilgili kata geçer ve elemanı vurgular.
- Gösterim kuralları (yalnız revizyonda; marka renkleri değişmez), renge bağımlı olmayan ayrımla:
  mevcut ince sürekli + gri dolgu · yıkılacak kesik çizgi + 45° tarama (kırmızı) · yeni kalın sürekli + çapraz tarama (yeşil) ·
  değişen kesik-noktalı (turuncu) + eski konum noktalı (mavi).
- Paftalar: **Mevcut Durum**, **Yıkım / Söküm**, **Yeni Yapılacak İmalat**, **Revizyon Karşılaştırma** — ölçekli (çizim
  ölçeği, varsayılan 1:50), kat başına bir pafta; antette proje, çizim, kat, ölçek, tarih, revizyon kodu, açıklama, firma;
  lejant. Çıktılar: **PDF (vektörel, gerçek ölçek)**, **SVG (mm)**, **DXF R12 (mm; katman başına renk ve çizgi tipi)**.
- Örnekler: [`docs/b4/`](b4/) — `Yikim-Sokum-Plani.{pdf,svg,dxf,png}`, `Yeni-Yapilacak-Imalat-Plani.{pdf,svg,png}`,
  `Mevcut-Durum-Plani.svg`, `Revizyon-Karsilastirma-Plani.{pdf,dxf}`, `fark-raporu.{csv,pdf}`, görünüm ekran görüntüleri.

## Fark raporu
Kat başına ve toplam: kaynak / hedef duvar, korunacak, önerilen kaldırma, yeni, değiştirilen; eklenen / kaldırılan kapı ve
pencere; mahal alanı değişiklikleri; karşılaştırılamayan. **CSV** (Excel: UTF-8 BOM, `;`, ondalık virgül) ve **PDF**.
Sayılar eleman adedidir — imalat metrajı ya da maliyet değildir (B4C).

## Testler
- `tests/b4-diff.test.mjs` (16 test): senaryo 1–15, 16 (ilkeller + SVG / DXF), 17 (CSV), 18 (eski dosya); her
  karşılaştırmada kaynak ve hedef JSON'unun değişmediği doğrulanır; geçersiz eşleştirmeler; belirlenimcilik.
- `tests/e2e/b4.e2e.cjs` (Playwright, 37 kontrol): köken, pencere, safha / toplu / eşleştirme / kod ve Ctrl+Z, U1 zaman
  çizelgesi, Göster (kat + vurgu), görünürlük filtresi, CSV = panel, PDF rapor, 8 pafta indirmesi (PDF vektörel: görüntü
  nesnesi yok, renk `0.83 0.23 0.29 RG`, kesik desen 2 / 1,2 mm, A3 gerçek ölçü; SVG mm + 1:50; DXF katman rengi / çizgi
  tipi / mm), kaynak sonradan değişti, kaynak JSON değişmedi, kaydet / yeniden yükle, çevrimdışı, mobil.

## Bilinen sınırlar
- Revizyon çiziminde duvarlar eksen + kalınlık dikdörtgeni olarak gösterilir (B2B katman temizliği / birleşim gönyesi
  revizyon paftasında uygulanmaz); yay duvar parçalı. Merdiven, korkuluk, çatı ve mobilya revizyon çizimine girmez
  (karşılaştırma listesinde ve raporda vardır).
- Pafta başına bir kat; çok katlı PDF birden çok sayfa olarak üretilir. Pafta düzeni (konum, ölçek) elle düzenlenemez.
- (B4C'de giderildi) PDF'lerde DejaVu Sans gömülür; Türkçe karakterler korunur. Gömme başarısız olursa kullanıcıya bildirilir.
- Kat eşleştirmesi kat kimliğiyle yapılır; kimliği değişmiş bir kat (sil + yeniden ekle) eşleşmez.
- Elle eşleştirme yalnız aynı kat içinde ve bire bir; bölünen / birleştirilen duvar (1 ↔ 2) eşlemesi yoktur — B4C'de
  metraj farkı bu durumu alanla değerlendirecektir.
- Kararlar (safha, eşleştirme, kod) hedef çizim açıkken düzenlenebilir; başka iki çizim karşılaştırılırken salt okunur gösterilir.

---

## B4C — İlave ve azalan imalat metrajı (0.6.1-b4c, uygulandı)

### Modüller
| Dosya | Görev |
|---|---|
| `js/bim/quantities.js` | Tek çizimin metrajı (saf, belirlenimci, artımlı): duvar, katman, açıklık / doğrama, döşeme, mahal |
| `js/bim/qtydiff.js` | İki çizimin metraj farkı: B4 eşleştirmesi + safha + müdahale yöntemi → mevcut / yeni / net / söküm / yeni imalat; filtre, gruplama, toplam, fiyat, CSV |
| `js/bim/commands.js` | `setInterventionMethod`, `setQtyPrice`, `setQtySettings`, `setDesignLimits` (tek geri alınabilir işlem) |
| `js/revui.js` | Revizyon penceresinde **Metraj Farkı** sekmesi, müdahale yöntemi seçimi, fiyat girişi, CSV / PDF metraj raporu |
| `js/pdffont.js` | PDF'e DejaVu Sans gömme (Türkçe karakterler); başarısızlık açıkça bildirilir |
| `js/bim/solver.js` | **Tasarım sınırları (MAX)** denetimi (`checkLimits`) |

### Metraj satırı
Her satır: eleman (`KAT/kimlik`), kat, mahal ilişkisi (mahalin duvar bağı), eleman sınıfı, BIM türü, malzeme / kompozit, imalat
kategorisi, birim, miktar, hesaplama yöntemi, doğrulama durumu (`ok` / `warning` / `unknown`). Fark satırında ayrıca kaynak ve
hedef kimlik, mevcut, yeni, net fark, söküm, yeni imalat, onay bekleyen söküm / imalat, dayanak (karar). Tam hassasiyetle
hesaplanır; yuvarlama yalnız gösterimde; proje toplamı kat toplamlarının aynı sırada toplamıdır (fark yok).

### Ölçüm yöntemleri ve varsayımlar
- **Duvar**: boy = eksen boyu; yükseklik = duvar ya da kat yüksekliği (alt kot dahil); brüt alan = boy × yükseklik (tek yüz);
  net alan = açıklık bölgeleri (`wallZones`) çıkarılmış; açıklık yalnız duvar gövdesi içindeki kısmıyla düşülür (duvar üstünü
  aşan pencere kırpılır). Hacim ve katman hacimleri = B2B katman prizmaları (birleşim temizliği sonrası, açıklıklar düşülmüş) —
  L / T birleşimlerinde çift hacim yok; çapraz denetim: eleman toplamı = `wallQuantities` (fark 1e-6'dan büyükse `QTY_RECONCILE`)
  ve brüt hacim − analitik açıklık boşluğu − net hacim ≤ %0,5 (aşarsa uyarı).
- **Katman**: kategori malzeme grubundan (betonarme, kâgir, ısı / ses yalıtımı — taş / cam yünü iç bölmede ses, su yalıtımı,
  sıva, kaplama, diğer). Yüz katmanlarının (sıva, kaplama) alanı = net duvar alanı × o malzemenin yüz sayısı.
- **Döşeme**: brüt alan = çokgen; net = brüt − tamamen içerdeki alt kat merdiven boşlukları; boşluk sınırı kesiyorsa net
  kesin sayılmaz (uyarı). Hacim = net × kalınlık (kompozit varsa kompozit kalınlığı); balkon / teras ayrı kalem; kat döşemesi
  (üst katlar, dış hattan) ayrı; kat kalınlığı ile kompozit kalınlığı farklıysa uyarı.
- **Mahal**: net zemin = mahal çokgeni; zemin kaplaması (malzemesine göre) ve tavan = net zemin (düz tavan); duvar kaplaması =
  çevre × mahal yüksekliği − açıklıklar (**politika**: tümü / eşikten büyükler / hiçbiri; eşik varsayılan 0,5 m²; mahal sınırına
  yakınlık kuralı `roomMetrics` ile aynı); süpürgelik = çevre − kapı genişlikleri; çevre.
- **Doğrama**: kimlik, tür, genişlik, yükseklik, adet, alan, bağlı duvar, kat, tadilat durumu; ölçü sınıfına göre gruplanır
  (`Kapı 90×210 cm`); söküm ve montaj ayrı sütunlarda.

### Tadilat farkı kuralları
- **Net fark** = yeni − mevcut, geometrik ve kalem toplamı üzerinden (eleman adedinden bağımsız → bölünen / birleşen duvarlar
  dengelenir). **Söküm** ve **yeni imalat** ayrı kavramlardır ve kesin toplamlara yalnız kullanıcı kararıyla girer:
  yıkılacak / yeni → safha onaylı; değiştirilecek → müdahale yöntemi seçilmiş: *tamamen yeniden* (söküm = mevcut, imalat = yeni),
  *kısmi* (fark kadar), *yalnız yüzey* (sıva / kaplama / mahal kaplaması kalemleri tam; yapı kalemlerine dokunulmaz).
  Kararsız / onaysız → kesin 0, **onay bekleyen** sütununda kısmi senaryo tahmini. Güvenle eşleştirilemeyen → kesin 0, manuel kontrol.
- Kimliksiz türetilmiş satırlar (kat döşemesi) iki tarafta aynı anahtarla eşleşir; miktar değişmişse "değiştirilecek, karar bekliyor".
- **Grup toplamları** yalnız toplanabilir kalem aileleri için verilir (ör. *net duvar yüzeyi* tüm malzemeler; *katman hacmi*;
  *kapı adedi*). Brüt + net, zemin + tavan gibi alternatif / farklı yüzeyler birbirine eklenmez.
- **Fiyat**: yalnız kullanıcı girer (imalat ve söküm birim fiyatı ayrı); para birimi varsayılan TRY; KDV dahil / hariç açıkça
  yazılır; fiyatı girilmemiş kalem "fiyat girilmedi" (0 değil), grup / genel tutarda "eksik fiyat var". Otomatik fiyat yok.
- Kararlar ve fiyatlar hedef çizimin `meta.revision` alanında (`methods`, `qty: { prices, currency, vat, openings, threshold }`);
  metraj sonucu saklanmaz, her seferinde türetilir.

### Artımlı hesap
Duvar metrajı, B3 prizma önbelleğinin dizi kimliği + duvar / açıklık / kat yüksekliği imzasıyla önbelleklenir: değişmeyen duvarın
sonucu yeniden kullanılır, bir duvar değişince yalnız etkilenen duvarlar (B3 artımlı geometri: komşular dahil) yeniden hesaplanır;
kompozit / tür değişimi imzayı değiştirir. `{ full: true }` güvenli tam yol; testte her adımda artımlı = tam.

### Örnek: villa
[`docs/b4c/villa-metraj.md`](b4c/villa-metraj.md) — duvar, döşeme, mahal, malzeme tabloları ve tadilat farkı;
[`metraj-farki.csv`](b4c/metraj-farki.csv), [`metraj-raporu.pdf`](b4c/metraj-raporu.pdf), arayüz görüntüsü. Fikstür:
`tests/fixtures/villa-ornek.saggcad.json` (üretici `make-villa.mjs`, tablolar `villa-report.mjs`).

### Doğruluk
Analitik beklenenlerle doğrulanan (birim testleri, 1e-6 tolerans): tek duvar alan / hacim, kapı ve pencere düşümü (duvar
üstünü aşan pencere dahil), farklı kalınlıklar, **L birleşimi 5,04 m³** (510×20 + 20×390 cm² × 2,80), **T birleşimi 5,544 m³**,
kompozit katmanlar (iç tuğla: tuğla 1,40 m³, alçı sıva 0,56 m³ / 28 m²), yükseklik, döşeme ve balkon, mahal kaplaması ve
üç politika, tamamen kaldırma, yeni duvar, kısmi / tamamen / yüzey kararları, farklı malzemeyle yenileme (tuğla 10 m² söküm,
gazbeton 12 m² imalat, net +2), bölünen / birleşen duvar (net 0), doğrama söküm / montaj, kat ve proje toplamı.

### Desteklenmeyen / kesin sayılmayan
- **Yay duvarlar** (ARC_LEGACY): metraj "hesaplanamadı — manuel kontrol" (miktar boş, 0 değil).
- Merdiven, korkuluk, çatı, kolon / kiriş hacmi, mobilya / donatı, tesisat: B4C metrajında yok.
- Eğimli / kırık tavan, mahal içi farklı yükseklikler, çok katmanlı zemin kaplaması (şap + kaplama ayrı) yok — düz tavan ve
  tek kaplama varsayılır. Döşeme boşluğu yalnız alt kat merdiveni; kısmi boşluk uyarı verir.
- Duvar alanı eksen boyuyla (iç / dış yüz boy farkı yok); köşe kesişim payı katman hacminde doğru, yüzey alanında eksen kadar.
- Çakışan (üst üste çizilmiş) duvarlarda hacim tek sayılır (B2B ayrıştırması) ama alan / boy her duvar için sayılır — uyarı verilir.

## Tasarım sınırları (MAX)
Model → **Tasarım sınırları (maksimum)…**: duvar yüksekliği, boyu, kalınlığı; açıklık genişliği; mahal alanı; kat sayısı; bina
yüksekliği (en üst kat üstü); taban alanı (zemin kat dış hattı); toplam kat alanı (dış hatlar). Hedef çizimin `meta.limits`
alanında (isteğe bağlı; tek Ctrl+Z). Aşımlar kısıt çözücüde (`LIMIT_*`) **uyarı** olarak Model Sağlığı'nda listelenir;
çizim kendiliğinden değiştirilmez.

---

## B4D — Adlandırılmış proje sürümleri ve güvenli geri yükleme (uygulama planı)
1. **Depo** (`js/store.js`): IndexedDB sürüm 2 → yeni `versions` deposu `{ id, projectId, name, note, createdAt, appVersion,
   schema, hash, size, snapshot }`, `projectId + createdAt` dizini. Anlık görüntü = proje JSON'u (çizimler + meta); görseller
   kimlikle başvurulur (kopyalanmaz). Yükseltme mevcut `projects` deposuna dokunmaz.
2. **Modül** `js/versions.js` (saf çekirdek + depo bağlantısı): `snapshotOf(project)` (belirlenimci JSON + FNV özeti),
   `saveVersion(project, { name, note })` (aynı özet → yeni kayıt yok), `listVersions`, `loadVersion`, `deleteVersion`
   (onaylı), `diffVersions(a, b)` → çizim başına B4 `compareDrawings` + B4C `quantityDiff`.
3. **Geri yükleme (yıkıcı olmayan)**: varsayılan "kopya olarak aç" — sürüm yeni proje ya da yeni çizim(ler) olarak eklenir,
   kimlikler korunur, `sourceDrawingId` + `restoredFrom: versionId` yazılır. "Üzerine yaz" yalnız açık onayla ve önce
   otomatik "geri yükleme öncesi" sürümü alınarak; işlem tek adım ve B3 günlüğünde geri alınabilir (proje düzeyi kayıt).
4. **Bütünlük**: şema / `appVersion` denetimi, eksik görsel başvuruları raporu, özet doğrulaması (bozuk anlık görüntü açılmaz),
   IndexedDB kota hatasında kullanıcıya açık mesaj (kısmi yazım yok — tek işlem).
5. **Arayüz**: Dosya → *Sürüm kaydet…* (ad + not), *Sürümler…* (liste: ad, tarih, boyut, not; Karşılaştır → Revizyon penceresi
   sürüm ↔ güncel; Kopya olarak aç; Üzerine yaz; Sil). Zaman çizelgesiyle (U1) karışmaz: günlük oturum içidir, sürüm kalıcıdır.
6. **Dışa aktarma**: `.saggcad.json`'a isteğe bağlı `versions` dizisi (kullanıcı seçerse); içe aktarmada kimlik çakışması raporu.
7. **Testler**: kaydet → değiştir → karşılaştır → kopya olarak geri yükle (JSON birebir), üzerine yazmada ön-sürüm ve geri
   alma, aynı özette tekrar kayıt yok, bozuk anlık görüntü reddi, kota dolu (sahte), eski veritabanı (v1) yükseltmesi,
   çevrimdışı, mobil, B1–B4C regresyonları.
