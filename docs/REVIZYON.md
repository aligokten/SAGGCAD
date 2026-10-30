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

## B4D — Kalıcı proje sürümleri, akıllı karşılaştırma ve güvenli geri yükleme (0.6.2-b4d, uygulandı)

İki ayrı kavram vardır ve arayüzde ayrı adlandırılır:

| | İşlem Geçmişi — mevcut düzenleme oturumu | Proje Sürümleri — kalıcı kayıt noktaları |
|---|---|---|
| Nerede | Bellek (`bim/history.js`, U1 zaman çizelgesi) | IndexedDB (`versions`, `snapshots`, `versionAssets`) |
| Ömür | Sekme / çizim kapanınca silinir | Kullanıcı silene kadar; dosyayla taşınabilir |
| Geri dönüş | Ctrl+Z / zaman çizelgesi | Kopya olarak ya da üzerine geri yükleme |

### Modüller
- `js/store.js` — IndexedDB v2 yükseltmesi, çok depolu atomik işlem `txMulti`, kota hatası tanıma `isQuota`, "emekli" proje
  nesnesi koruması (`retireProject` → `saveProject` reddeder), görsel kimliği eşleme `remapIds`, dosya doğrulama
  `parseProjectFile`, görsel kimliği çakışmasına dayanıklı `importProject`.
- `js/versions.js` — çekirdek API: `snapshotOf`, `saveVersion`, `listVersions`, `loadVersion`, `verifyVersion`,
  `updateVersion` (ad / not), `deleteVersion(s)`, `compareVersions`, `restoreVersion`, `autoVersion` / `pruneAuto`,
  `exportWithVersions`, `importVersions`, `storageSummary`.
- `js/verui.js` — arayüz: *Sürüm Kaydet…*, *Proje Sürümleri…* yöneticisi, önizleme, karşılaştırma raporu, geri yükleme
  onayları, dışa aktarma seçimi, içe aktarma raporu, ayarlar bölümü.
- `js/main.js` — Dosya menüsü / komut paleti (`file.vsave` *Ctrl+Alt+S*, `file.versions`), proje sayfası düğmeleri,
  `flushSave` (bekleyen düzenleme + otomatik kayıt boşaltma), otomatik sürüm kancaları, sekmeler arası bildirim
  (`BroadcastChannel`).

### IndexedDB v1 → v2
Yalnız **ekleme** yapan yükseltme (`onupgradeneeded` içinde, tek sürüm değişikliği işlemi):

| Depo | Durum | Anahtar | İçerik |
|---|---|---|---|
| `projects` | v1, dokunulmaz | `id` | proje kaydı (biçim değişmedi) |
| `blobs` | v1, dokunulmaz | görsel kimliği | proje görselleri |
| `kv` | v1, dokunulmaz | `settings` | ayarlar (+ isteğe bağlı `versions` alanı) |
| `versions` | **yeni** | `id` (`ver_…`) | meta veri: `projectId, projectName, name, note, createdAt, appVersion, schema, hash, size, assetsSize, assetHashes, assetSizes, assetRefs, missingAssets, kind, important, reason, stats` (+ içe aktarılanda `importedFrom`). İndeksler: `projectId`, `projectId_createdAt` `[projectId, createdAt]`, `assets` (multiEntry, başvuru sayımı), `projectHash` `[projectId, hash]` (aynı içerik denetimi) |
| `snapshots` | **yeni** | `id` (= sürüm kimliği) | `{ id, json }` — belirlenimci JSON |
| `versionAssets` | **yeni** | `hash` | `{ hash, blob, type, size }` — içerik karmasıyla tekilleştirilmiş görseller |

- Görevdeki kayıt şemasındaki `snapshot` alanı bilerek ayrı depoya (`snapshots`) alındı: liste yalnız meta veriyi okur,
  anlık görüntü yalnız önizleme / karşılaştırma / geri yüklemede tembel yüklenir. Sürümler proje kaydının içine konmaz.
- Yükseltme başarısız olursa IndexedDB işlemi geri alınır, v1 verisi aynen kalır; başlangıç ekranı açılış hatasını gösterir.
  Başka bir sekme v1 bağlantısını açık tutuyorsa (`blocked`) "diğer sekmeleri kapatın" mesajı çıkar; engel kalkınca
  yükseltme tamamlanır (e2e testiyle doğrulandı).

### Anlık görüntü ve karma
- Anlık görüntü `{ schema: 1, project, assets: { görselKimliği → sha256 | null } }`. `project` proje kaydının **tamamıdır**:
  bilgiler, çizimler, katlar, BIM elemanları, kompozit / tür tanımları (`meta.bimTypes`), revizyon kodu, safha kararları,
  eşleştirmeler, müdahale yöntemleri, metraj ayarları ve birim fiyatlar, tasarım sınırları, kesit / görünüş tanımları,
  pafta ölçeği / birimi. Hariç: projenin `updatedAt` alanı (kaydetme zamanı) ve `_` önekli önbellekler (GPU / geometri
  önbellekleri zaten kayıtta tutulmaz).
- Belirlenimci JSON (`canonical`): nesne anahtarları sıralı, `undefined` atlanır, sonlu olmayan sayılar `null`.
  `hash = "sha256:" + SHA-256(json)` (Web Crypto). Görsel içeriği `assets` üzerinden karmaya girer.
- Aynı proje için aynı karma zaten kayıtlıysa yeni sürüm yazılmaz; kullanıcıya "Değişiklik yok — bu içerik zaten "…"
  olarak kayıtlı" bildirilir. Ad / not değişikliği yalnız meta veriyi değiştirir.

### Sürüm kaydetme akışı
1. Açık alan düzenlemesi bitirilir (`blur` → `change`), bekleyen 400 ms gecikmeli otomatik kayıt iptal edilip güncel proje
   hemen yazılır (`flushSave`). Bu adım başarısızsa sürüm yazılmaz.
2. Proje IndexedDB'den okunur; görseller okunup karması alınır.
3. Meta veri + içerik + yeni görseller **tek işlemde** yazılır: işlem yarıda kalırsa (kota, sekme kapanması) hiçbir parça
   kalmaz — "meta var / içerik yok" durumu oluşmaz. Kota dolu → `quota` hatası, "kaydedildi" bildirimi gösterilmez.

```js
import { saveVersion, listVersions, restoreVersion } from './js/versions.js';
const r = await saveVersion(project.id, { name: 'Müşteriye sunulan', note: 'R2 — mutfak duvarı kaldırıldı' });
// r → { ok: true, version: { id: 'ver_…', hash: 'sha256:…', createdAt, size, assetHashes, … } }
//   ya da { ok: false, duplicate: { …aynı içerikli sürüm… } }
const [son] = await listVersions(project.id);            // yeniden eskiye, yalnız meta veri
const kopya = await restoreVersion(son.id);               // varsayılan: kopya → yeni proje kimliği
const ust = await restoreVersion(son.id, { mode: 'overwrite', confirm: true });   // önce kurtarma sürümü
```

### Geri yükleme
- **Kopya (varsayılan)**: yeni proje kimliği; çizim ve BIM eleman kimlikleri proje kapsamında aynen korunur (B4 eşleştirme ve
  karar başvuruları geçerli kalır); görsellere yeni kimlik verilir, `meta.bg.photoId` dahil tüm başvurular `remapIds` ile yeni
  kimliğe bağlanır; `restoredFrom { versionId, versionName, projectId, hash, createdAt, at, mode }` yazılır. Özgün proje
  değişmez.
- **Üzerine**: açık onay kutusu zorunlu (API'de `confirm: true`). Önce **zorunlu kurtarma sürümü**
  "Geri yükleme öncesi — gg.aa.yyyy ss:dd" (`kind: 'recovery'`, önemli) kaydedilir; kaydedilemezse geri yükleme yapılmaz
  (`recovery-failed`). Ardından proje + görseller tek işlemde yazılır (atomik; yarıda kalırsa eski hâl). Bu projeye ait
  olmayan bir görsel kimliğinin üzerine asla yazılmaz (gerekirse yeni kimlik). Eski editör nesnesi "emekliye" ayrılır:
  gecikmeli otomatik kayıt ya da `pagehide` kaydı geri yüklenen projeyi ezemez; ekran yeniden kurulur, oturum işlem geçmişi
  sıfırlanır. Aynı projeyi açık tutan diğer sekmelere `BroadcastChannel` ile haber verilir.
- Proje çapında geri yükleme **Ctrl+Z ile geri alınamaz** — geri dönüş yolu kurtarma sürümüdür (arayüz bunu açıkça söyler).
- Eksik görsel varsa geri yükleme durur ve hangi görselin eksik olduğunu söyler; yalnız kullanıcı onaylarsa görselsiz sürer.

### Görsel bütünlüğü
- Sürüm görselleri `versionAssets`'te **kendi kopyalarıyla** durur: proje görselinin silinmesi ya da proje silinmesi
  sürümleri etkilemez. Aynı görsel tüm sürümlerde bir kez saklanır.
- Silmede başvuru sayımı (`assets` indeksi) aynı işlemde yapılır: hiçbir sürümün başvurmadığı görsel temizlenir, paylaşılan
  görsel (ör. kopya projenin sürümü) korunur.
- `verifyVersion(id, { deep })`: karma, şema, içerik varlığı, görsel başvuruları (`deep`: görsel baytlarının karması).
  Yönetici her sürüm için durum gösterir: Sağlam / Eksik görsel / Bozuk / Yarım kayıt / Daha yeni SAGGCAD sürümü.

### Karşılaştırma
Yeni bir motor yoktur: çizim başına B4 `compareDrawings` + B4C `quantityDiff` / `aggregate` / `costOf`.
Güncel ↔ sürüm, sürüm ↔ sürüm. Çizimler kimlikle eşlenir (rölöve ↔ rölöve, tasarım ↔ tasarım); kimliği tutmayan rölöveler
yine rölöve olarak eşlenir. Rapor: proje bilgisi farkları, eklenen / kaldırılan çizim, görsel farkları; çizim başına
eklenen / kaldırılan / geometri / parametre / belirsiz sayıları, duvar – kapı – pencere özeti, kat değişiklikleri, mahal alanları,
BIM tür ve malzeme değişen alanlar, metraj satırları (önce, sonra, net fark), birim fiyat değişiklikleri ve tutarlar.
Sürümler arasında tadilat kararı (rölöve → proje safhası) **uygulanmaz**: net fark ölçülmüş farktır, söküm / yeni imalat
miktarları **"onay bekleyen"** sütunlarındadır — kesin hesap gibi gösterilmez. Ortak çizim yoksa "Karşılaştırılabilir
çizim yok" denir.

Örnek (villa, e2e testinden): v1 → v2'de `zd1` duvar kalınlığı 26,5 → 30 cm: *Tadilat projesi* — Geometri 1;
"Duvar hacmi (net, tüm katmanlar)" net **+1,094 m³**, söküm / yeni yalnız "onay bekleyen"; *Rölöve* — değişiklik yok.

### Otomatik proje sürümleri (Ayarlar, varsayılan kapalı)
Otomatik kayıttan ayrıdır. Seçenekler: günde bir (proje açılınca), pafta dışa aktarmadan önce (plan paftası ve revizyon
paftaları), revizyon kodu değişince. Aynı içerik tekrar kaydedilmez. Sınırlar: proje başına en çok otomatik sürüm sayısı ve
MB; aşılınca **yalnız en eski otomatik** sürümler silinir — elle kaydedilen, kurtarma ve "önemli" işaretli sürümler asla.

### Dışa / içe aktarma
- *Proje dosyasını indir*: sürüm yoksa doğrudan; varsa "Yalnız güncel proje" ya da "Güncel proje + seçilmiş geçmiş sürümler".
  Biçim aynı kalır (`format: 'saggcad', version: 1`); sürümler `versions: [{ meta, json }]`, görselleri
  `versionAssets: { hash → dataURL }` ek alanlarındadır. Eski SAGGCAD bu alanları yok sayıp projeyi açar.
- *Yedek* (sürüm satırı): o sürümü bağımsız bir `.saggcad.json` olarak indirir.
- İçe aktarma: bozuk JSON, yabancı dosya, daha yeni dosya biçimi anlaşılır hatayla reddedilir. Aynı proje kimliği varsa
  **asla üzerine yazılmaz** — yeni kimlikli kopya eklenir; başka projeye ait görsel kimliği çakışırsa görsel yeniden
  adlandırılır. Sürümler isteğe bağlıdır; her biri şema + karma + görsel karması denetiminden geçer, yeni proje kimliğine
  bağlanır (`importedFrom`), bozuklar atlanıp raporlanır. İçe aktarmadan önce `navigator.storage.estimate()` ile yer
  denetlenir. Proje + görseller tek işlemde yazılır.

### Hata durumları
| Durum | Davranış |
|---|---|
| Kota dolu | `quota`: "Depolama alanı dolu — sürüm kaydedilmedi"; yarım kayıt yok; başarı bildirimi yok |
| Veritabanı yükseltmesi başarısız / engelli | v1 verisi aynen; açılış ekranında neden |
| Yarım yazılmış sürüm (içerik yok) | `incomplete`, açılmaz / geri yüklenmez |
| Bozuk JSON / karma uyuşmazlığı | `corrupt`, kullanılmaz |
| Eksik görsel | `missing`, hangi görsel olduğu yazılır; geri yükleme yalnız onayla |
| Daha yeni SAGGCAD sürümü (şema / dosya biçimi) | `future`, "önce uygulamayı güncelleyin" |
| Proje kimliği çakışması (içe aktarma) | yeni kimlikli kopya |
| Otomatik kayıt ↔ geri yükleme yarışı | önce boşaltma (bekleyen düzenleme kurtarma sürümüne girer), sonra eski nesne emekli |

### Testler
- `tests/b4d-versions.test.mjs` (8, Node): belirlenimci JSON, SHA-256 test vektörü, anlık görüntü kapsamı / `updatedAt`
  hariç, `remapIds`, sürüm ↔ sürüm karşılaştırma (geometri, kaldırılan eleman, malzeme, kompozit, fiyat, onay bekleyen),
  özdeş / bilgi / çizim ekleme-çıkarma / karşılaştırılamayan, dosya doğrulama, ayar varsayılanları.
- `tests/e2e/b4d.e2e.cjs` (70 denetim, gerçek IndexedDB, her bağlam ayrı test veritabanı): görevdeki 1–27 numaralı
  senaryoların tamamı — IndexedDB v1 yükseltmesi (proje, görsel baytları, ayarlar) ve engelli yükseltme, boş proje, çok çizim /
  çok kat / B4 kararları / B4C fiyatları, aynı karma, yeniden adlandırma, liste sırası, bekleyen otomatik kaydın boşaltılması,
  sürüm ↔ güncel / sürüm ↔ sürüm / metraj farkı, kopya ve üzerine geri yükleme (proje JSON'u, eleman kimlikleri, görsel
  baytlarının karması), zorunlu kurtarma sürümü ve yazılamadığında iptal, silinen görselin geri gelmesi, proje silme ve
  paylaşılan görsel, kota dolu (benzetim: `IDBObjectStore.put` QuotaExceededError), bozuk / yarım / yeni şema / eksik görsel,
  eski `.saggcad.json`, sürümlerle dışa / içe aktarma (aynı ve boş veritabanı), otomatik kayıt ↔ geri yükleme yarışı,
  otomatik sürümler ve sınır temizliği, çevrimdışı, mobil. Ekran yazısına değil, IndexedDB içeriğine bakar.
- `tests/e2e/b4d-perf.e2e.cjs`: performans ölçümü (aşağıda).
- Regresyon: `npm test` 137/137; e2e b1 13, b2a 25, b2b 25, b3 20, b3-3d 23, b3-ui 18, u1 29, b4 37, b4c 32 — hepsi geçti.

### Performans (gerçek ölçüm — Chromium headless, bu geliştirme kapsayıcısı)
Villa örneği (2 çizim, 65 eleman; anlık görüntü 8.3 KB) + 1 sıkıştırılamaz görsel (301.5 KB). Her sürüm farklı karma.
Belirlenimci JSON 0.7 ms · SHA-256 anlık görüntü 0.1 ms · SHA-256 görsel 3.2 ms (her kayıtta görsel karması yeniden alınır).

| Sürüm | Kaydet ort / p95 (ms) | Liste (ms) | Önizleme (ms) | Derin denetim (ms) | Karşılaştır (ms) | Kopya geri yükle (ms) | İçerik | Görsel (tekil) | IndexedDB kullanımı |
|---|---|---|---|---|---|---|---|---|---|
| 100 | 8.6 / 14.0 | 6.0 | 1.4 | 5.0 | 180 | 7.9 | 0.81 MB | 301.5 KB | 1.13 MB |
| 500 | 8.4 / 10.9 | 31.7 | 1.7 | 11.4 | 127 | 11.1 | 4.07 MB | 301.5 KB | 2.98 MB |
| 1000 | 7.8 / 13.0 | 63.6 | 1.5 | 5.0 | 111 | 13.1 | 8.13 MB | 301.5 KB | 5.32 MB |

- Tekilleştirme: 1000 sürümde görsel kopyalansaydı 294.4 MB; saklanan 301.5 KB.
- İlk ölçümde kaydetme süresi sürüm sayısıyla doğrusal büyüyordu (aynı içerik denetimi tüm listeyi okuyordu: 100 → 11 ms,
  1000 → 64 ms). `projectHash` indeksine geçildi; ölçüm tekrarlandı (tablo) — kaydetme artık sürüm sayısından bağımsız.
- Liste süresi sürüm sayısıyla doğrusaldır (yalnız meta veri; 1000 sürümde ≈ 60 ms). Ham veri: [docs/b4d/perf.json](b4d/perf.json).
- Ölçümler kapsayıcıda; gerçek cihaz (özellikle mobil) daha yavaş olabilir. IndexedDB kullanımı tarayıcının sıkıştırması
  nedeniyle içerik toplamından küçük görünebilir.

### Bilinen sınırlar
- Sürümler yalnız bu cihazın tarayıcı deposundadır; tarayıcı verisi silinirse gider — dosyaya dışa aktarma önerilir.
  `navigator.storage.persist()` istenmiyor.
- Anlık görüntüler tam kopyadır (fark tabanlı değil); 1000 villa sürümü ≈ 8 MB. Büyük projelerde otomatik sürüm sınırı önemlidir.
- Üzerine geri yükleme Ctrl+Z ile geri alınmaz (kurtarma sürümü ile geri dönülür).
- Sekmeler arası koruma `BroadcastChannel` ile; desteklemeyen tarayıcıda başka sekmede açık eski proje nesnesi hâlâ
  kaydedebilir (aynı projeyi iki sekmede düzenlemeyin).
- Karşılaştırmada sürümler arası söküm / yeni imalat kesinleşmez (bilinçli; tadilat kararı yalnız rölöve → proje akışında).
- Görsellerin her kayıtta karması alınır (300 KB'lik görselde ≈ 3 ms); çok sayıda büyük görselde kaydetme uzar.
- Sürüm satırı *Yedek* dosyası projenin o anki hâlidir; o sürümün kendi geçmiş sürümlerini içermez.
