# SAGGCAD

**SAGGCAD**, mimari rölöve ve 2B teknik çizim için geliştirilen bağımsız bir CAD programıdır.
Daha önce başka bir uygulamanın içinde eklenti olarak yer alan rölöve/çizim aracı, burada
kendi başına çalışan bir program olarak ele alınmıştır. Tarayıcıda çalışır, kurulum gerektirmez.

🌐 Canlı sürüm: <https://aligokten.github.io/SAGGCAD/> (`main` dalına her gönderimde otomatik yayınlanır)

## Mevcut özellikler (v0.1 şablon)

| Alan | Özellik |
|---|---|
| Çizim | Çizgi, çoklu çizgi (açık/kapalı), dikdörtgen, daire, yazı |
| Rölöve | Hizalı ölçü (otomatik değer), mesafe/açı ölçme, kapalı alan ve çevre hesabı |
| Düzenleme | Tıklayarak / pencere / kesişen seçim, taşıma, silme, geri al–yinele |
| Hassasiyet | Nesne kenetleme (uç, orta, merkez), grid kenetleme, ORTO |
| Giriş | AutoCAD tarzı komut satırı: `x,y`, `@dx,dy`, `@uzunluk<açı`, yalnız uzunluk |
| Katmanlar | Hazır rölöve katmanları (DUVAR, KAPI, PENCERE, OLCU, YAZI, ROLOVE-NOKTA), renk, gizle, kilitle |
| Dosya | `.saggcad` (JSON) kaydet/aç, tarayıcıda otomatik kayıt, **DXF (R12)** ve **SVG** dışa aktarma |

## Kısayollar

| Komut / Tuş | İşlev |
|---|---|
| `L` `PL` `REC` `C` | Çizgi, çoklu çizgi, dikdörtgen, daire |
| `DIM` `T` `M` `DI` | Ölçü, yazı, taşı, mesafe ölç |
| `U` / `Ctrl+Z`, `Ctrl+Y` | Geri al / yinele |
| `E` / `Delete` | Seçileni sil |
| `Z` / çift tık | Tümünü göster |
| `K` | Çoklu çizgiyi kapat |
| `Enter` / sağ tık | Komutu bitir |
| `Esc` | İptal |
| `F3` `F7` `F8` `F9` | OSNAP, GRID, ORTO, SNAP |
| Orta tuş / `Alt`+sürükle, tekerlek | Kaydır, yakınlaştır |
| `?` | Komut listesi |

Birim metredir. Ondalık ayırıcı nokta (`2.75`), koordinat ayırıcı virgüldür (`3,4`).

## Geliştirme

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # birim testleri (Vitest)
npm run build    # dist/ klasörüne üretim derlemesi
```

## Proje yapısı

```
src/
  core/      geometri, nesne modeli, belge + geri alma, kenetleme, koordinat girişi
  view/      görünüm dönüşümü (pan/zoom) ve canvas çizici
  tools/     çizim araçları (her araç Tool arayüzünü uygular)
  io/        .saggcad, DXF ve SVG
  ui/        katman ve özellik panelleri
  app.ts     uygulama: fare, klavye, komut satırı
tests/       Vitest testleri
```

Yeni bir araç eklemek için `src/tools/tool.ts` içindeki `Tool` arayüzünü uygulayıp
`src/app.ts` içindeki `TOOLS` listesine eklemek yeterlidir.

## Yol haritası

Eklenecek özellikler ve referans alınacak programlar ayrıca belirlenecektir; bkz. [docs/ROADMAP.md](docs/ROADMAP.md).
