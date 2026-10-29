# SAGGCAD Yol Haritası

Sürümler (`package.json`): 0.2.0 bağımsız program · 0.3.0 yapı elemanları, kesit / görünüş ve arayüz revizyonu ·
0.3.1 B1 BIM çekirdeği (salt okunur) · **0.4.0-b2a** B2A parametrik BIM düzenleme (geliştirme sürümü; `main`'e
birleştirilene kadar `claude/bim-b2a` dalında).

## v0.2.0 — Bağımsız program (tamamlandı)
- TadilatBodrum Saha "Rölöve & 3D" modülü (`aligokten/tadilatbodrum.com`, `public/saha`, commit `f8d5070`) ayrı programa taşındı
- Kendi proje yönetimi: projeler, çoklu çizim (rölöve + proje seçenekleri), görseller, yerel depo, proje dosyası
- İş takibi, müşteri, teklif, anket, paylaşım ve bulut (Firebase) bağımlılıkları çıkarıldı
- Dolap tasarlayıcıdaki "Teklife ekle" → "Kalemleri kopyala" (teklif modülü yok)
- GitHub Pages yayını, CI, çevrimdışı çalışma (PWA)

## v0.3.0 — Yapı elemanları, malzeme katmanları, kesit / görünüş (tamamlandı)
Referans: Archicad 30 (duvar / kolon / kiriş / döşeme araçları, kompozit yapılar, yapı malzemeleri, kesit ve görünüş, otomatik ölçülendirme).
- [x] Duvar türü / işlevi ve taşıyıcılık; kolon, kiriş, döşeme araçları
- [x] Ölçü birimi (mm / cm / m) ve çizim ölçeği; ölçekli pafta PDF
- [x] Kesit hattı, dört cephe, kesitte katman taraması, otomatik ölçü ve kotlar; PDF / SVG / DXF
- [x] Duvar ve döşemelerde kompozit katmanlar; malzeme ve yapı kütüphanesi
- [x] Malzeme özellikleri (ρ, λ, c, μ, yangın sınıfı) ve yapı fiziği (U, m', Rw, Ln,w, sd)

Bilinen sınırlar / sonraki adaylar: kompozit duvar köşelerinde katman önceliği (temizleme) yok; kesitte merdiven ve mobilya
çizilmez; yay duvarlarda katman gösterimi yok; PDF paftası raster (≈200 dpi); TS 825 bölgesel U sınır değeri denetimi yok.

## v0.3.0 UI — Arayüz revizyonu (tamamlandı)
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

## 0.3.1 · B1 — BIM eleman şeması ve tür sistemi (tamamlandı, salt okunur)
- [x] `js/bim/`: eleman şeması, tür sistemi, eski veri adaptörü, ilişki modeli ve doğrulaması, okuma API'si
- [x] Özellik panelinde salt okunur BIM bölümü; BIM model raporu
- [x] Eski proje dosyası örneği ve 8 senaryolu test; isteğe bağlı tarayıcı testi

## 0.4.0-b2a · B2A — Parametrik BIM düzenleme (tamamlandı)
- [x] `js/bim/commands.js`: güvenli yazma motoru (kopyada hesapla → doğrula → tek işlem uygula; hata olursa geri sar)
- [x] Komutlar: createType, duplicateType, updateType, deleteType, assignType, setInstanceParam, resetInstanceParam, setElementLevelBinding
- [x] Editör geri al / yinele ile tek adım; otomatik kayıt; B1 deneysel yazma API'leri kapatıldı
- [x] Model → BIM Türleri ve Parametreler penceresi: tür listesi + kullanım sayısı, çoğaltma (özelden de), düzenleme, canlı özet, atama, güvenli silme
- [x] Özellik panelinde tür atama, geçersiz kılma rozeti, Türe döndür, kata bağlı yükseklik
- [x] Tür değişikliği aynı türdeki elemanlara yayılır; açık / örtük geçersiz kılınan değerler korunur (eski veri geçiş kuralı)
- [x] Olay tabanlı BIM önbelleği (editör sürümü), dondurulmuş okuma görünümleri; ölçüm: `tests/bench/bim.bench.mjs`
- [x] Testler: `tests/bim-b2a.test.mjs` (14 senaryo), `tests/e2e/b2a.e2e.cjs`
- [ ] B2B: akıllı duvar birleşimleri ([plan](BIM-CEKIRDEK.md#b2b--akıllı-duvar-birleşimleri-teknik-plan))
- [ ] B3: bağımlılık grafiği, artımlı türetme, tek işlem günlüğü

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
