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

## v0.3 UI — Arayüz revizyonu (tamamlandı)
Swiss Minimalism + Professional CAD: #1786FF vurgu, #0F1B2D üst çubuk, #1D2631 koyu panel, #F6F8FB çizim zemini, Inter.
- [x] 2D / 3D / yan yana modları korundu
- [x] Menü çubuğu (Dosya, Çizim, Model, Görünüm, Belgele, Araçlar)
- [x] Kategorili, açıklamalı, kısayollu araç çubuğu
- [x] Gizlenebilir / genişliği ayarlanabilir özellik paneli
- [x] Proje gezgini (katlar, çizimler, görünümler, paftalar)
- [x] Durum çubuğu (koordinat, ölçek, birim, yakalama, otomatik kayıt)
- [x] Komut paleti (Ctrl+K)
- [x] Çalışma alanı ön ayarları (Rölöve, Mimari model, 3D görselleştirme)
- [x] Açık / koyu tema; çizim ve model renkleri sabit
- [x] Mobil dokunmatik araç düzeni

Sonraki aşama: [parametrik BIM çekirdeği](BIM-CEKIRDEK.md).

## B1 — BIM eleman şeması ve tür sistemi (tamamlandı, salt okunur)
- [x] `js/bim/`: eleman şeması, tür sistemi, eski veri adaptörü, ilişki modeli ve doğrulaması, okuma API'si
- [x] Özellik panelinde salt okunur BIM bölümü; BIM model raporu
- [x] Eski proje dosyası örneği ve 8 senaryolu test; isteğe bağlı tarayıcı testi
- [ ] B2: yazma modeli, tür düzenleme arayüzü, duvar birleşimleri, parametrik kısıtlar ([plan](BIM-CEKIRDEK.md#b2--eleman-ilişkileri-ve-parametrik-kısıtlar-teknik-plan))

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
