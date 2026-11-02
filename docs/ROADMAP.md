# SAGGCAD yol haritası — FreeCAD / UniCAD tezgâhı

Temel: FreeCAD 1.0 / UniCAD + BIM tezgâhı. SAGGCAD kendi geometri motorunu yazmaz; BIM nesnelerini (Wall, Structure,
Window, Axis, BuildingPart, Material) okur ve özellik / komut ekler. Saf hesaplar `saggcad/core`'da (FreeCAD'siz test).

## 0.7.0 — temel (tamamlandı)
- [x] Tezgâh iskeleti (InitGui, package.xml, simgeler), CI: pytest + FreeCAD (conda-forge) bütünleşik test
- [x] Aks sistemi (BIM Axis / Axis System), ad devamı
- [x] Donatı: tanımla / minimum ata / metraj / kurallar; Spreadsheet + CSV (web sürümüyle aynı hesap, aynı testler)

## Web sürümünden (arsiv/web) taşınacaklar
| Web modülü | FreeCAD karşılığı / plan |
|---|---|
| Rölöve 2D editörü (duvar, oda, kapı, pencere, ölçü) | BIM Wall / Space / Window / Dimension — SAGGCAD: "ölçüyle oda" ve rölöve kısayolları, kroki altlığı (Image plane) |
| Aks + kolon / kiriş köşe yerleştirme | BIM Axis (✓), kolonu köşeden / aks kesişimine yerleştirme komutu (Snap + yerleşim noktası) |
| Revizyon karşılaştırması (rölöve ↔ proje: yıkım / yeni / değişen) | İki BuildingPart / iki belge arasında kimlik (IFC GlobalId) eşleştirme; yıkım–yeni renklendirme ve TechDraw paftaları |
| B4C imalat metrajı ve tadilat metraj farkı | BIM Schedule + SAGGCAD metraj kalemleri (duvar brüt / net alan, doğrama, kaplama), fiyat, CSV / PDF |
| B4D proje sürümleri | FreeCAD belge yedekleri + adlandırılmış sürüm (FCStd kopyası + karma) ve sürüm ↔ sürüm karşılaştırma |
| Donatı | ✓ 0.7.0 — sonra: mesnet ek donatısı, pilye, perde uç bölgesi, temel, açıklık düşümü, donatı açılım paftası (TechDraw), BIM Rebar nesneleriyle iki yönlü |
| Pafta (ölçekli PDF, antet) | TechDraw şablonları: SAGGCAD antet şablonu, revizyon tablosu |

## İlkeler
- Miktarları varsayarak üretme; tahmini değerler her yerde ayrı ve etiketli.
- FreeCAD belgesinde kalıcı veri (özellik / meta veri); geri al / yinele FreeCAD işlemleriyle.
- Kullanıcının çizimlerine otomatik yıkıcı dönüşüm yok.
