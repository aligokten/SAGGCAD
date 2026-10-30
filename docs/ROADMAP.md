# SAGGCAD Yol Haritası

Sürümler (`package.json`): 0.2.0 bağımsız program · 0.3.0 yapı elemanları, kesit / görünüş ve arayüz revizyonu ·
0.3.1 B1 BIM çekirdeği (salt okunur) · 0.4.0-b2a B2A parametrik BIM düzenleme · **0.4.0-b2b** B2B akıllı duvar
birleşimleri (geliştirme sürümleri; `main`'e birleştirilene kadar `claude/bim-b2a` ve `claude/bim-b2b` dallarında).

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

## 0.4.0-b2b · B2B — Akıllı duvar birleşimleri ve parametrik yapı ilişkileri (tamamlandı)
- [x] B2B-1 birleşim grafiği (`joins.js`): L / T / X / I / serbest uç, toleranslar, sorun raporları, `joinedAt`
- [x] B2B-2 katman önceliği ve ortak kırpma geometrisi (`geom2d.js`, `wallgeom.js`), 2D plan, kütüphanede öncelik
- [x] B2B-3 duvar komutları, açıklık konum politikası, mahal sınırı, otomatik birleşimi kapatma
- [x] B2B-4 3D mesh (`mesh.js`) ve kesit ortak geometriden; kata bağlı duvar / kolon / kiriş; kesit penceresi aboneliği; panelde birleşim ve kat bağı
- [x] Testler: 4 yeni birim test dosyası, `tests/e2e/b2b.e2e.cjs`; örnek SVG'ler `docs/b2b/`
- [x] Kanvas sürüklemenin komut katmanına alınması → B3
- [ ] Yay duvar birleşimleri → B3'te parametreler; katman / birleşim geometrisi sonrası

## 0.5.0-b3 · B3 — Bağımlılık grafiği, merkezi işlem geçmişi, artımlı BIM modelleme (tamamlandı; yay katmanları kısmi)
- [x] B3-A merkezi işlem günlüğü (`history.js`): tek günlük, katlar arası tek Ctrl+Z, kat ekle / sil geri alınır, atomik
- [x] B3-A kanvas sürüklemesi bırakınca `moveWallEnd` / `offsetWall` komutu; sığmayan açıklık reddi; dokunmatik korunur
- [x] B3-B bağımlılık grafiği (`deps.js`): `getAffectedElements`, döngü tespiti, kısıt sırası, değişiklik olayları
- [x] B3-C artımlı birleşim / katman geometrisi, önbellekli birleşim grafiği, komut kopyası önbelleği, prizma önbelleği
- [x] B3-C 3D kısmi güncelleme (değişen duvar ağları, eski geometri bırakılır, kamera korunur)
- [x] B3-D sıralı kısıt çözücü (`solver.js`), Model Sağlığı paneli, 1000 adımlık stres testi
- [x] B3-D parametrik yay parametreleri ve `setArcGeometry` (yarıçap / ok, tolerans 0,5 cm)
- [ ] Yay duvar kompozit katman temizliği, teğet birleşimleri ve 3D / kesit gövdesi — eski yaklaşımda, raporlanıyor (`ARC_LEGACY`) → B4 sonrası
- Ölçümler ve sınırlar: [BIM-CEKIRDEK.md › B3](BIM-CEKIRDEK.md#b3--bağımlılık-grafiği-merkezi-işlem-geçmişi-ve-artımlı-bim-modelleme)

## 0.5.1-u1 · U1 — UniCAD esinli iş akışı (tamamlandı)
Referans: [UniCAD](https://github.com/UNITRONIX/UniCAD) (FreeCAD çatalı, Fusion 360 tarzı). Kod taşınmadı, kavramlar yeniden yazıldı — [eşleme](UNICAD-REFERANS.md).
- [x] İşlem zaman çizelgesi (B3 günlüğü üzerinde, geri sarma) · [x] Seçim filtresi · [x] Akıllı Bas-Çek (Q)
- [x] İmleçte komut paleti (S) ve sabitleme · [x] 3D gezinme çubuğu ve görünüm stilleri
- [ ] Sonraki adaylar: 2D kayan bağlamsal araç paleti (FusionSketchPalette), render ışık ön ayarları (TaskRenderStudio)

## 0.6.0-b4 · B4A + B4B — Rölöve–proje karşılaştırması ve akıllı tadilat yönetimi (tamamlandı)
Ayrıntı: [REVIZYON.md](REVIZYON.md) · örnek çıktılar: [b4/](b4/)
- [x] Karşılaştırma motoru (`js/bim/diff.js`): kimlikle eşleştirme, 6 durum, toleranslar, anlamsız fark yok sayma, kat kotları, öneriler, doğrulanan elle eşleştirme
- [x] Çizim kökeni (`sourceDrawingId`, `sourceCreatedAt`, `revisionLabel`); kaynak sonradan değişince uyarı
- [x] Tadilat safhaları (Mevcut / Yıkılacak / Yeni / Değiştirilecek): öneri ↔ karar ayrımı, toplu sınıflandırma, tek Ctrl+Z
- [x] Revizyon görünümü (katman, lejant, görünürlük filtreleri, Göster → kat + vurgu)
- [x] Paftalar: Mevcut Durum, Yıkım / Söküm, Yeni Yapılacak İmalat, Revizyon Karşılaştırma — vektörel PDF, SVG, DXF
- [x] Fark raporu: kat başına + toplam, CSV (Excel) ve PDF

## 0.6.1-b4c · B4C — Akıllı imalat metrajı ve tadilat metraj farkı (tamamlandı)
Ayrıntı: [REVIZYON.md › B4C](REVIZYON.md#b4c--ilave-ve-azalan-imalat-metrajı-061-b4c-uygulandı) · örnek: [b4c/villa-metraj.md](b4c/villa-metraj.md)
- [x] Metraj motoru (`quantities.js`): duvar brüt / net alan, boy, hacim, katman hacim / yüzey; doğrama; döşeme + balkon; mahal kaplamaları; açıklık düşüm politikası
- [x] Metraj farkı (`qtydiff.js`): mevcut / yeni / net / söküm / yeni imalat; müdahale yöntemi (tamamen / kısmi / yüzey / karar yok); onay bekleyen ayrı
- [x] Metraj Farkı sekmesi: filtreler (kat, mahal, malzeme, eleman, safha, kategori), gruplama, aile toplamları, satır → çizimde vurgu
- [x] Kullanıcı birim fiyatı (imalat / söküm), TRY, KDV dahil / hariç; fiyatsız kalem açıkça işaretli
- [x] CSV (Excel TR) ve PDF metraj raporu — PDF'te gömülü yazı tipiyle Türkçe karakterler (B4 PDF'leri de)
- [x] Artımlı metraj (B3 önbelleği) ve tam yol eşitliği
- [x] **Tasarım sınırları (MAX)**: duvar / açıklık / mahal / kat / bina yüksekliği / taban ve kat alanı üst sınırları → Model Sağlığı
- [ ] Yay duvar metrajı (ARC_LEGACY), merdiven / çatı / kolon-kiriş / tesisat metrajı
- [ ] **B4D** — Adlandırılmış proje sürümleri ve güvenli geri yükleme ([uygulama planı](REVIZYON.md#b4d--adlandırılmış-proje-sürümleri-ve-güvenli-geri-yükleme-uygulama-planı))

- [ ] Akıllı mahal ve malzeme listeleri (mahal bazlı yüzey / kaplama, malzeme toplamları, dışa aktarma)

## Sıradaki aşamalar
- [ ] Akıllı metraj tabloları (tür, malzeme, kat ve mahal bazlı; birleşim temizliği sonrası hacim; dışa aktarma)
- [ ] Gelişmiş pafta düzenleyici (çoklu görünüş yerleşimi, antet, ölçek, revizyon tablosu)
- [ ] IFC4 dışa aktarma (IfcWall / IfcSlab / IfcColumn / IfcBeam / IfcOpeningElement, kompozit katmanlar `IfcMaterialLayerSet`)
- [ ] Parametrik merdiven ve çatı araçları (tür sistemi ve kat bağlarıyla)
- [ ] Proje genelinde ortak BIM tür kütüphanesi (rölöve ve proje çizimlerinin türleri paylaşması; içe / dışa aktarma)

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
