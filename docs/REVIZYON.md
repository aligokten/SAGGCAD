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
- Vektörel PDF standart yazı tipini (Helvetica) kullanır; Türkçe özel harfler PDF'te ASCII karşılıklarıyla yazılır
  (ı → i, ş → s, ğ → g). SVG ve DXF'te Türkçe karakterler korunur.
- Kat eşleştirmesi kat kimliğiyle yapılır; kimliği değişmiş bir kat (sil + yeniden ekle) eşleşmez.
- Elle eşleştirme yalnız aynı kat içinde ve bire bir; bölünen / birleştirilen duvar (1 ↔ 2) eşlemesi yoktur — B4C'de
  metraj farkı bu durumu alanla değerlendirecektir.
- Kararlar (safha, eşleştirme, kod) hedef çizim açıkken düzenlenebilir; başka iki çizim karşılaştırılırken salt okunur gösterilir.

---

## B4C — İlave ve azalan imalat metrajı (teknik plan)
Amaç: iki çizim arasındaki **miktar** farkı (adet değil); B4A eşleştirmesi ve safhaları üzerinde.
1. **Kaynaklar** (yeniden yazılmaz): `wallQuantities` (B2B, birleşim temizliği sonrası katman hacimleri, duvar başına),
   `wallgeom.wallPrisms`, açıklık listesi, `roomMetrics`, döşeme çokgenleri, malzeme / kompozit kütüphanesi.
2. **Model**: `js/bim/qtydiff.js` → `quantityDiff(src, dst, compareResult)` → satırlar `{ level, element, phase, item,
   unit, before, after, delta, sign: 'ilave'|'azalan' }`. Kalemler:
   - Duvar **brüt alan** (boy × yükseklik) ve **net alan** (açıklıklar düşülmüş), iki yüz ayrı (iç / dış kaplama için).
   - **Katman bazlı malzeme hacmi** (m³) — kompozit katmanı başına; birleşimde çift sayım yok (B2B prizmaları).
   - Kapı / pencere **adet** ve ölçü sınıfı (genişlik × yükseklik), söküm ve yeni montaj ayrı.
   - Döşeme **alanı** ve kompozit katman hacmi; mahal **zemin / duvar / tavan kaplaması** alanı (`floor`, `wallColor`, tavan).
3. **Kural**: miktar farkı safhaya göre: Yıkılacak → azalan (söküm), Yeni → ilave, Değiştirilecek → hem söküm hem ilave
   (önce / sonra geometri), Mevcut → fark yok. Bölünen / birleştirilen duvarlar alan dengesiyle (eşleştirme gerekmeden).
4. **Arayüz**: Revizyon penceresine "Metraj farkı" sekmesi; kat / malzeme / kalem gruplaması; CSV / PDF; birim fiyat
   alanı yalnız kullanıcı girerse (varsayılan fiyat yok).
5. **Test**: elle hesaplanmış fikstür (L köşe, T birleşim, açıklıklı duvar), çift sayım yok, safha değişince işaret
   değişimi, `wallQuantities` toplamıyla tutarlılık, yuvarlama (m², m³: 3 basamak).

## B4D — Adlandırılmış proje sürümleri ve güvenli geri yükleme (teknik plan)
1. **Depo**: IndexedDB'de ayrı `versions` deposu `{ id, projectId, name, note, createdAt, appVersion, hash, snapshot }`;
   anlık görüntü = proje JSON'u (görseller hariç, kimlikle başvuru). Proje dosyasına isteğe bağlı `versions` dizisi
   (dışa aktarmada kullanıcı seçer).
2. **Oluşturma**: "Sürüm kaydet…" (ad + not); otomatik sürüm yalnız kullanıcı açarsa (ör. her paftalama öncesi).
   İçerik özeti (FNV) aynıysa yeni sürüm yazılmaz.
3. **Karşılaştırma**: sürüm ↔ güncel ya da sürüm ↔ sürüm — B4A motoru çizim başına aynen kullanılır.
4. **Geri yükleme** (yıkıcı olmayan): seçilen sürüm **yeni bir çizim / proje kopyası** olarak açılır; güncel proje
   üzerine yazma yalnız açık onayla ve önce otomatik "geri yükleme öncesi" sürümü alınarak yapılır. Kimlikler korunur.
5. **Bütünlük**: anlık görüntü şema doğrulaması, eksik görsel başvurularının raporu, uygulama sürümü uyumsuzluğunda uyarı.
6. **Test**: kaydet → değiştir → karşılaştır → geri yükle (kopya) JSON eşitliği; üzerine yazmada ön-sürüm; IndexedDB
   kotası dolu senaryosu; çevrimdışı.
