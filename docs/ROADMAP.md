# SAGGCAD Yol Haritası

## v0.2 — Bağımsız program (tamamlandı)
- TadilatBodrum Saha "Rölöve & 3D" modülü (`aligokten/tadilatbodrum.com`, `public/saha`, commit `f8d5070`) ayrı programa taşındı
- Kendi proje yönetimi: projeler, çoklu çizim (rölöve + proje seçenekleri), görseller, yerel depo, proje dosyası
- İş takibi, müşteri, teklif, anket, paylaşım ve bulut (Firebase) bağımlılıkları çıkarıldı
- Dolap tasarlayıcıdaki "Teklife ekle" → "Kalemleri kopyala" (teklif modülü yok)
- GitHub Pages yayını, CI, çevrimdışı çalışma (PWA)

## v0.3 — Yapı elemanları, malzeme katmanları, kesit / görünüş (tamamlandı)
Referans: Archicad 30 (duvar / kolon / kiriş / döşeme araçları, kompozit yapılar, yapı malzemeleri, kesit ve görünüş, otomatik ölçülendirme).
- [x] Duvar türü / işlevi ve taşıyıcılık; kolon, kiriş, döşeme araçları
- [x] Ölçü birimi (mm / cm / m) ve çizim ölçeği; ölçekli pafta PDF
- [x] Kesit hattı, dört cephe, kesitte katman taraması, otomatik ölçü ve kotlar; PDF / SVG / DXF
- [x] Duvar ve döşemelerde kompozit katmanlar; malzeme ve yapı kütüphanesi
- [x] Malzeme özellikleri (ρ, λ, c, μ, yangın sınıfı) ve yapı fiziği (U, m', Rw, Ln,w, sd)

Bilinen sınırlar / sonraki adaylar: kompozit duvar köşelerinde katman önceliği (temizleme) yok; kesitte merdiven ve mobilya
çizilmez; yay duvarlarda katman gösterimi yok; PDF paftası raster (≈200 dpi); TS 825 bölgesel U sınır değeri denetimi yok.

## Kaynakla eşitleme
Saha uygulamasında rölöve modülüne yapılan geliştirmeler buraya elle taşınır. Taşınan dosyalar `js/` altında aynı adla
durur; SAGGCAD'e özgü dosyalar `main.js`, `store.js`, `print.js`, `sample.js`, `materials.js`, `structure.js`,
`sections.js`, `units.js` ve `css/saggcad.css`'tir. `plan2d.js` ve `plan3d.js`'e yapı elemanları için bağlantı noktaları eklendi.
Kaynakta değiştirilen yerler: `catalog.js` (varsayılan firma bilgisi), `cabdesign.js` (teklif düğmesi), marka metinleri
(`plan2d.js` PNG başlığı, `exporters.js`, `labels.js`, `docview.js`).

## Sıradaki adımlar
Eklenmesi istenen özellikler ve referans programlar bu bölüme işlenecek.

- [ ] _(özellik listesi bekleniyor)_

## Referans programlar
- [ ] _(liste bekleniyor)_
