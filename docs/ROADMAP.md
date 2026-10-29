# SAGGCAD Yol Haritası

## v0.2 — Bağımsız program (tamamlandı)
- TadilatBodrum Saha "Rölöve & 3D" modülü (`aligokten/tadilatbodrum.com`, `public/saha`, commit `f8d5070`) ayrı programa taşındı
- Kendi proje yönetimi: projeler, çoklu çizim (rölöve + proje seçenekleri), görseller, yerel depo, proje dosyası
- İş takibi, müşteri, teklif, anket, paylaşım ve bulut (Firebase) bağımlılıkları çıkarıldı
- Dolap tasarlayıcıdaki "Teklife ekle" → "Kalemleri kopyala" (teklif modülü yok)
- GitHub Pages yayını, CI, çevrimdışı çalışma (PWA)

## Kaynakla eşitleme
Saha uygulamasında rölöve modülüne yapılan geliştirmeler buraya elle taşınır. Taşınan dosyalar `js/` altında aynı adla
durur; SAGGCAD'e özgü dosyalar `main.js`, `store.js`, `print.js`, `sample.js` ve `css/saggcad.css`'tir.
Kaynakta değiştirilen yerler: `catalog.js` (varsayılan firma bilgisi), `cabdesign.js` (teklif düğmesi), marka metinleri
(`plan2d.js` PNG başlığı, `exporters.js`, `labels.js`, `docview.js`).

## Sıradaki adımlar
Eklenmesi istenen özellikler ve referans programlar bu bölüme işlenecek.

- [ ] _(özellik listesi bekleniyor)_

## Referans programlar
- [ ] _(liste bekleniyor)_
