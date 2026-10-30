# Örnek villa — rölöve ↔ tadilat projesi metrajı (B4C)

Kaynak: `tests/fixtures/villa-ornek.saggcad.json` (2 kat; dış duvar tuğla 19 + EPS 5 mantolama, iç bölme tuğla 10). Tablolar motor çıktısıdır (`js/bim/quantities.js`, `js/bim/qtydiff.js`); bu dosya `node tests/fixtures/villa-report.mjs` ile yeniden üretilir.

Tadilat: salon–yatak odası duvarı kaldırılır (açık plan), banyo duvarı gazbetonla tamamen yenilenir, salon penceresi 180 → 240 cm, yeni gazbeton bölme ve bahçe kapısı; 1. katta banyo duvarı 2,80 → 2,60 m (karar bekliyor).

## 1. Duvar metrajı (rölöve)

| Kat | Duvar | Kompozit | Boy (m) | Kalınlık (m) | Yükseklik (m) | Brüt alan (m²) | Net alan (m²) | Hacim (m³) | Durum |
|---|---|---|--:|--:|--:|--:|--:|--:|---|
| Zemin kat | zd1 | Dış duvar — tuğla 19 + EPS 5 (mantolama) | 12,00 | 0,265 | 2,80 | 33,60 | 31,45 | 8,319 | tamam |
| Zemin kat | zd2 | Dış duvar — tuğla 19 + EPS 5 (mantolama) | 10,00 | 0,265 | 2,80 | 28,00 | 26,20 | 6,928 | tamam |
| Zemin kat | zd3 | Dış duvar — tuğla 19 + EPS 5 (mantolama) | 12,00 | 0,265 | 2,80 | 33,60 | 31,50 | 8,332 | tamam |
| Zemin kat | zd4 | Dış duvar — tuğla 19 + EPS 5 (mantolama) | 10,00 | 0,265 | 2,80 | 28,00 | 25,30 | 6,689 | tamam |
| Zemin kat | zi1 | İç bölme — tuğla 10 | 10,00 | 0,140 | 2,80 | 28,00 | 26,11 | 3,571 | tamam |
| Zemin kat | zi2 | İç bölme — tuğla 10 | 5,00 | 0,140 | 2,80 | 14,00 | 12,32 | 1,666 | tamam |
| Zemin kat | zi3 | İç bölme — tuğla 10 | 7,00 | 0,140 | 2,80 | 19,60 | 17,71 | 2,421 | tamam |
| 1. Kat | kd1 | Dış duvar — tuğla 19 + EPS 5 (mantolama) | 12,00 | 0,265 | 2,80 | 33,60 | 31,50 | 8,332 | tamam |
| 1. Kat | kd2 | Dış duvar — tuğla 19 + EPS 5 (mantolama) | 10,00 | 0,265 | 2,80 | 28,00 | 28,00 | 7,405 | tamam |
| 1. Kat | kd3 | Dış duvar — tuğla 19 + EPS 5 (mantolama) | 12,00 | 0,265 | 2,80 | 33,60 | 31,50 | 8,332 | tamam |
| 1. Kat | kd4 | Dış duvar — tuğla 19 + EPS 5 (mantolama) | 10,00 | 0,265 | 2,80 | 28,00 | 28,00 | 7,420 | tamam |
| 1. Kat | ki1 | İç bölme — tuğla 10 | 10,00 | 0,140 | 2,80 | 28,00 | 26,11 | 3,577 | tamam |
| 1. Kat | ki2 | İç bölme — tuğla 10 | 6,00 | 0,140 | 2,80 | 16,80 | 15,12 | 2,058 | tamam |

## 2. Döşeme metrajı (rölöve)

| Kat | Döşeme | Brüt alan (m²) | Net alan (m²) | Kalınlık (cm) | Hacim (m³) | Durum |
|---|---|--:|--:|--:|--:|---|
| Zemin kat | zs1 (balkon) | 10,02 | 10,02 | 22,0 | 2,204 | tamam |
| 1. Kat | Kat döşemesi | 125,56 | 125,56 | 15,0 | 18,834 | uyarı: Döşeme kalınlığı 15 cm, kompozit 22 cm — katman hacimleri kompozitten, döşeme hacmi kalınlıktan; kontrol edin |

## 3. Mahal metrajı (rölöve)

| Kat | Mahal | Net zemin (m²) | Çevre (m) | Yükseklik (m) | Duvar kaplaması (m²) | Süpürgelik (m) |
|---|---|--:|--:|--:|--:|--:|
| Zemin kat | Salon | 39,41 | 25,19 | 2,80 | 64,60 | 22,39 |
| Zemin kat | Mutfak | 25,41 | 20,19 | 2,80 | 51,52 | 18,49 |
| Zemin kat | Banyo | 20,62 | 18,19 | 2,80 | 48,89 | 17,39 |
| Zemin kat | Yatak odası | 25,81 | 21,19 | 2,80 | 52,64 | 20,29 |
| 1. Kat | Ebeveyn yatak | 56,44 | 31,07 | 2,80 | 82,99 | 30,17 |
| 1. Kat | Çocuk odası | 27,81 | 21,19 | 2,80 | 55,76 | 19,49 |
| 1. Kat | Banyo 2 | 27,81 | 21,19 | 2,80 | 55,55 | 20,39 |

_Duvar kaplaması: çevre × mahal yüksekliği − tüm açıklıklar (varsayılan politika); süpürgelik: çevre − kapı genişlikleri._

## 4. Malzeme toplamları (rölöve, proje geneli)

| Kategori | Malzeme | Hacim (m³) |
|---|---|--:|
| Tuğla / gazbeton / kâgir | Yatay delikli tuğla (TS EN 771-1) | 54,048 |
| Betonarme | Betonarme (C25/30–C30/37, ~%2 donatı) | 20,337 |
| Isı yalıtımı | EPS ısı yalıtım levhası (λ 0,035) | 11,334 |
| Sıva | Alçı sıva | 9,785 |
| Sıva | Çimento esaslı sıva / şap (çimento-kum) | 6,679 |
| Kaplama / levha | Seramik / porselen karo | 1,356 |
| Sıva | Kireç-çimento sıva / ince dış sıva | 1,290 |
| Su / buhar yalıtımı | Bitümlü su yalıtım membranı | 0,050 |

## 5. Tadilat metraj farkı (rölöve → proje)

Söküm ve yeni imalat yalnız onaylı kararları içerir; "onay bekleyen" sütunu tahmindir. Fiyatlar örnek kullanıcı girişidir (KDV hariç, TRY).

| İmalat | Birim | Mevcut | Yeni | Net fark | Söküm | Yeni imalat | Onay bekleyen (söküm / imalat) |
|---|---|--:|--:|--:|--:|--:|--:|
| **Duvar** | | | | | | | |
| Duvar hacmi (net, tüm katmanlar) | m³ | 75,05 | 72,66 | -2,39 | 4,09 | 2,61 | 0,16 / 0,00 |
| Gazbeton G4/06 duvar (brüt yüzey) | m² | 0,00 | 22,40 | +22,40 | 0,00 | 22,40 |  |
| Gazbeton G4/06 duvar (net yüzey) | m² | 0,00 | 20,72 | +20,72 | 0,00 | 20,72 |  |
| Gazbeton G4/06 duvar boyu | m | 0,00 | 8,00 | +8,00 | 0,00 | 8,00 |  |
| Yatay delikli tuğla duvar (brüt yüzey) | m² | 352,80 | 318,00 | -34,80 | 33,60 | 0,00 | 1,20 / 0,00 |
| Yatay delikli tuğla duvar (net yüzey) | m² | 330,82 | 296,76 | -34,07 | 30,03 | 0,00 | 1,20 / 0,00 |
| Yatay delikli tuğla duvar boyu | m | 126,00 | 114,00 | -12,00 | 12,00 | 0,00 |  |
| **Isı yalıtımı** | | | | | | | |
| EPS ısı yalıtım levhası — katman hacmi | m³ | 11,33 | 11,19 | -0,14 | 0,00 | 0,00 |  |
| **Kapı / pencere** | | | | | | | |
| Kapı 90×210 cm | adet | 3,00 | 2,00 | -1,00 | 1,00 | 0,00 |  |
| Kapı 90×215 cm | adet | 0,00 | 1,00 | +1,00 | 0,00 | 1,00 |  |
| Kapı alanı | m² | 11,18 | 11,23 | +0,05 | 1,89 | 1,94 |  |
| Pencere 180×150 cm | adet | 1,00 | 0,00 | -1,00 | 1,00 | 0,00 |  |
| Pencere 240×150 cm | adet | 0,00 | 1,00 | +1,00 | 0,00 | 1,00 |  |
| Pencere alanı | m² | 10,80 | 11,70 | +0,90 | 2,70 | 3,60 |  |
| **Mahal kaplaması** | | | | | | | |
| Duvar kaplaması (mahal içi) | m² | 411,96 | 375,63 | -36,34 | 0,00 | 0,00 | 52,64 / 18,24 |
| Mahal çevresi | m | 158,21 | 144,89 | -13,32 | 0,00 | 0,00 | 21,19 / 7,87 |
| Net zemin alanı | m² | 223,32 | 224,27 | +0,95 | 0,00 | 0,00 | 25,81 / 26,77 |
| Süpürgelik | m | 148,61 | 136,19 | -12,42 | 0,00 | 0,00 | 20,29 / 8,77 |
| Tavan kaplaması | m² | 223,32 | 224,27 | +0,95 | 0,00 | 0,00 | 25,81 / 26,77 |
| Zemin kaplaması (parke) | m² | 149,47 | 150,43 | +0,95 | 0,00 | 0,00 | 25,81 / 26,77 |
| **Sıva** | | | | | | | |
| Alçı sıva — katman hacmi | m³ | 9,78 | 9,13 | -0,66 | 1,16 | 0,59 | 0,05 / 0,00 |
| Alçı sıva — yüzey | m² | 428,19 | 404,34 | -23,86 | 60,06 | 41,44 | 2,40 / 0,00 |
| Kireç-çimento sıva / ince dış sıva — katman hacmi | m³ | 1,29 | 1,28 | -0,01 | 0,00 | 0,00 |  |
| Kireç-çimento sıva / ince dış sıva — yüzey | m² | 233,45 | 230,61 | -2,84 | 0,00 | 0,00 |  |
| **Tuğla / gazbeton / kâgir** | | | | | | | |
| Gazbeton G4/06 — katman hacmi | m³ | 0,00 | 2,01 | +2,01 | 0,00 | 2,01 |  |
| Yatay delikli tuğla — katman hacmi | m³ | 54,05 | 50,46 | -3,59 | 2,93 | 0,00 | 0,12 / 0,00 |

Karar bekleyen elemanlar: `L0/zr1` (müdahale yöntemi seçilmedi), `L0/zr4` (safha onaylanmadı), `k1/ki2` (müdahale yöntemi seçilmedi).

Girilen birim fiyatlar: `wall-area:tugla-yatay|demolish` 180,00, `wall-area:gazbeton-600|build` 950,00, `layer-area:siva-alci|build` 260,00, `door:90×215|build` 14.500,00, `door:90×210|demolish` 900,00.
