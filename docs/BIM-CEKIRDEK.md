# Parametrik BIM çekirdeği

Hedef: elemanların (duvar, döşeme, kolon, kiriş, açıklık, mahal, çatı, merdiven) geometrisini parametrelerinden ve
ilişkilerinden **türeten** bir çekirdek; bir parametre değiştiğinde bağlı elemanlar, metraj, kesit / görünüş ve 3D
kendiliğinden güncellenir. Referans: Archicad 30 (eleman → kompozit → kat), Revit (Family Type, tür / örnek parametreleri).

| Aşama | Kapsam | Durum |
|---|---|---|
| **B1** | Eleman şeması, tür sistemi, eski veri adaptörü, ilişki modeli, okuma API'si | **Tamamlandı (salt okunur)** |
| B2 | Yazma modeli, eleman ilişkileri ve parametrik kısıtlar, duvar birleşimleri | Planlandı (aşağıda) |
| B3 | Bağımlılık grafiği, artımlı türetme (plan / 3D / kesit / metraj) | Planlanacak |
| B4 | İşlem tabanlı geri al–yinele, rölöve ↔ proje eleman farkı | Planlanacak |
| B5 | IFC 4 dışa aktarma, pafta düzenleyici | Planlanacak |

---

## B1 — Eleman şeması ve tür sistemi (tamamlandı)

### Mimari
```
js/bim/
  schema.js     eleman zarfı, sınıflar (IFC karşılıkları), parametre tanımları, validateElement
  types.js      yerleşik türler, projeye özel türler, typeForLegacy, resolveParameters, materialLink, deneysel tür kaydı
  adapter.js    eski plan verisi → BIM modeli (salt okur, belirlenimci, kimlik korur), schemaInfo
  relations.js  ilişki türleri, validateRelations, ters dizin, relationsOf
  api.js        createBim(getRoot): servis katmanı (okuma API'si + experimental yazma, varsayılan dryRun)
  ui.js         özellik paneli BIM bölümü ve proje BIM raporu (salt okunur)
```
Bağlantılar: `main.js` her çizim ekranında `createBim(() => editor.root)` kurar ve editöre `bim` seçeneğiyle verir;
`plan2d.js` özellik panelinin altına BIM bölümünü ekler (hata olursa panel etkilenmez); Araçlar → **BIM model raporu**.
Tarayıcı konsolundan `SAGGCAD.bim` ile erişilebilir.

### Veri modeli — örnek duvar
Eski kayıt (ana kaynak, değişmeden kalır):
```json
{ "id": "wfx001", "a": {"x":-7.5,"y":-7.5}, "b": {"x":527.5,"y":-7.5}, "t": 26.5, "h": 0,
  "kind": "dis", "struct": false, "comp": "dis-tugla-eps" }
```
Türetilen BIM elemanı:
```json
{
  "schema": 1, "id": "wfx001", "cls": "wall", "typeId": "DIS-DUV-01", "typeSource": "derived", "levelId": "L0",
  "geom":  { "a": {"x":-7.5,"y":-7.5}, "b": {"x":527.5,"y":-7.5}, "length": 535, "thickness": 26.5,
             "height": 280, "baseOffset": 0, "refLine": "axis", "arc": null },
  "props": { "function": "dis", "loadBearing": false, "compositeId": "dis-tugla-eps", "materialId": null,
             "layerFlip": false, "color": null },
  "rels":  [{ "kind": "containedIn", "target": "L0" }],
  "inherited": { "height": "level" },
  "vis":   { "visible": true, "layer": "DUVAR", "ifc": "IfcWall" },
  "meta":  { "createdAt": null, "modifiedAt": null, "origin": "legacy", "src": { "coll": "walls", "level": 0, "index": 0 } }
}
```
Tür `DIS-DUV-01` (yerleşik): `{ function: "dis", compositeId: "dis-tugla-eps", loadBearing: false, height: 280 }`;
`thickness` kompozitten hesaplanır (26,5 cm). `resolveElementParameters("wfx001")` her parametrenin değerini ve
kaynağını verir: `thickness → type`, `height → level` (kat yüksekliğinden), duvar 30 cm yapılırsa `thickness → instance`
(tür değeri 26,5 ile birlikte, "geçersiz kılma").

### Tür sistemi
- Yerleşik türler (`BUILTIN_TYPES`, dondurulmuş): duvar işlevleri (`DIS-DUV-01`, `IC-DUV-01`, `PERDE-01`, `YIGMA-01`,
  `HAFIF-DUV-01`, `ISTINAT-01`, `PARAPET-01`, türsüz `GEN-DUV-00`), kolon / kiriş malzemeleri (`KOL-BA-01`, `KIR-CE-01`…),
  döşeme işlevleri (`DOS-ARA-01`, `DOS-BAL-01`…; kat döşemesi `DOS-KAT-00`), açıklık, mahal, çatı, merdiven, korkuluk, donatı.
- Kompozit ve malzemeler `materials.js` kütüphanesinden okunur (yeniden yazılmadı).
- Projeye özel türler kök planın `meta.bimTypes` dizisinde saklanır (kompozit kütüphanesiyle aynı yer; proje dosyası ve
  IndexedDB kaydıyla birlikte taşınır). Yerleşik kimlik kullanılamaz; `base` ile türediği tür belirtilir; her kayıtta `rev` artar.
- Tür ataması: eski kayıtta geçerli `bimType` alanı varsa **explicit**; yoksa mevcut alanlardan **derived**
  (duvar `kind`, döşeme `kind`, kolon / kiriş `mat`); hiçbiri yoksa sınıfın türsüz **default** türü.
- Geçersiz kılma altyapısı: `resolveParameters` elemanın `overrides` alanını en üst öncelikle uygular (B1'de bu alanı
  dolduran bir arayüz yok; B2 yazma modelinde kullanılacak).

### Eski projelerle uyumluluk
- Ana kayıt kaynağı eski plan verisidir. BIM modeli her açılışta **ondan türetilir, dosyaya ya da IndexedDB'ye yazılmaz**
  (iki modelin eşzamanlı yazılması yok → tutarsızlık oluşamaz). Uçtan uca test, kayıtta BIM zarfı bulunmadığını doğrular.
- Adaptör girdiyi değiştirmez (dondurulmuş nesneyle test edilir), aynı girdiden aynı çıktıyı verir, eleman kimliği eski
  kimliğin aynısıdır. Zemin kat `L0`, ek katlar kendi `lv…` kimliğiyle; kat döşemesi kararlı `‹kat›:kat-dosemesi` kimliğiyle.
- Kimliği olmayan, çift kimlikli, nesne olmayan ya da dizi olmayan kayıtlar **düşürülmez**; kararlı geçici kimlik alır ve
  sorun olarak raporlanır. Bilinmeyen alanlar elemanın `legacy` başvurusunda kalır.
- Şema sürümü: eleman `schema: 1`; `schemaInfo(root)` eski biçimi (`plan.v`) ve okunabilirliği bildirir. B1'de
  hiçbir geçiş veriye uygulanmaz.
- Deneysel yazma API'leri (`experimental.saveType`, `experimental.assignType`) varsayılan `dryRun: true` çalışır;
  gerçek yazmada yalnızca `meta.bimTypes` ve kaydın `bimType` alanına dokunur. B1 arayüzü bunları çağırmaz.

### İlişkiler
`containedIn` (her eleman → kat; kolon / kiriş için referans kat), `hostedBy` (kapı / pencere / boşluk → duvar),
`boundedBy` (mahal → sınır duvarları, eski `room.walls` sırasıyla). Doğrulama: hedef yok, hedef sınıfı yanlış, boş hedef,
boş sınır yuvası (bilgi), katlar arası ilişki, açıklığın duvar dışına taşması. Sorgu: giden ve gelen (ters dizin) ilişkiler.

### Arayüz (salt okunur)
Özellik panelinin altında katlanabilir **BIM** bölümü: eleman kimliği, sınıf ve IFC karşılığı, tür ve tür kaynağı, kat,
kompozit / malzeme bağlantısı, parametre tablosu (değer + kaynak: Tür / Eleman / Kat / Türetilmiş), ilişkiler ve
elemana ait sorunlar. Düzenleme alanı içermez; mevcut düzenleme alanları değişmedi.

### Testler
- `tests/bim.test.mjs` (node, CI'da): 8 senaryo — eski proje dosyası açılıyor; duvar / kolon / kiriş / döşeme eşlemesi;
  kimliklerin korunması ve benzersizliği (kimliksiz / çift kayıt raporlanır); kompozit ve tür bağlantıları (türetilmiş,
  açık atanmış, geçersiz kılma, aynı türden çoklu eleman); türün değiştirilmesi ilgisiz türleri etkilemiyor; bozuk
  ilişkiler veri kaybı olmadan raporlanıyor; dönüşüm tekrarlanabilir ve girdiyi değiştirmiyor; DXF / metraj / kesit
  çıktıları BIM türetmesinden etkilenmiyor. Örnek eski dosya: `tests/fixtures/eski-proje-v1.saggcad.json`.
- `tests/e2e/b1.e2e.cjs` (isteğe bağlı, Playwright gerekir; CI'da çalışmaz): eski dosyayı içe aktarma, panelde BIM
  bilgisi, düzenleme sonrası parametre kaynağı, BIM raporu, aynı türden duvar çizme, kaydet / yeniden aç, 3D ve DXF.

### Bilinen sınırlar (B1)
- BIM modeli salt okunurdur; tür oluşturma / düzenleme ve tür atama için arayüz yok (yalnızca deneysel API).
- Eski kayıtlarda zaman damgası olmadığından `createdAt` / `modifiedAt` eski elemanlarda `null`; B2 yazma modeli dolduracak.
- Kat döşemesi elemanının sınır çokgeni BIM modelinde hesaplanmaz (`geom.outline: null`, `fromLevel: true`); 3D ve kesit
  bunu mevcut `outlineOf` ile üretmeye devam eder.
- Yay duvar ayrı eleman değil; parçalar `geom.arc` grup bilgisiyle ayrı duvar elemanlarıdır.
- Ölçü çizgisi, yazı ve kesit hattı (belgeleme nesneleri) modele alınmaz; mutfak / dolap ve mobilya genel `furnishing`.
- Önbellek değişimi tüm planın JSON özetiyle (FNV-1a) algılar; panel çizimi tek anlık görüntü kullanır. Çok büyük
  planlarda (binlerce eleman) her sorgu O(boyut) maliyetlidir — B3'te değişiklik olaylarıyla artımlı hale gelecek.

---

## B2 — Eleman ilişkileri ve parametrik kısıtlar (teknik plan)

### B2.1 Tek kaynaklı yazma modeli
- `bim.apply(op)` komutları (`setParam`, `assignType`, `saveType`, `moveEnds`, `setLevelBinding`…) eski kayda çevrilip
  **yalnızca eski modele** yazılır; editörün `snap()` / `changed()` akışından geçer (geri al ve otomatik kayıt korunur).
  BIM modeli yine türetilir → iki model asla ayrı yazılmaz.
- Her işlem `validateElement` + ilişki doğrulamasından geçer; hata varsa uygulanmaz ve raporlanır.
- Eski kayda yeni alanlar yalnızca isteğe bağlı eklenir (`bimType`, `bimOverrides`, `top`), eski sürümler bunları yok sayar;
  `.saggcad.json` sürümü 1 kalır (geriye uyum), alanların varlığı `schemaInfo` ile raporlanır.

### B2.2 Tür ve parametre arayüzü
- "Türler" paneli (Malzemeler ve yapılar penceresinin yanında): türleri listeleme, yerleşikten türetme, ad / parametre /
  kompozit düzenleme, kullanıldığı eleman sayısı.
- Özellik panelinde BIM parametreleri düzenlenebilir olur: tür parametresi değişince aynı türdeki tüm elemanlar güncellenir;
  eleman değeri türden ayrılınca "geçersiz kılma" rozeti ve "türe döndür" eylemi.

### B2.3 Duvar birleşimleri (ilişki grafiği)
- Uç nokta dizini (ızgara karması) → L / T / X birleşim tespiti; `joins` ilişkisi (`kind: 'joinedAt'`, uç a/b, açı).
- Kompozit katman önceliği: taşıyıcı (core) katman öncelikli, kaplama katmanları birleşimde kesilir; plan katman çizimi ve
  kesit prizmaları birleşim grafiğinden kırpılır (bugünkü üst üste binme giderilir).

### B2.4 Parametrik kısıtlar
- Kat bağı: duvar / kolon üst kotu "üst kat döşeme altı + ofset" (`top: { level: 'next', offset }`); kat yüksekliği
  değişince bağlı elemanlar uyar.
- Barındırılan açıklık: duvar uzunluğu / yönü değişince açıklık göreli konumunu korur; duvar dışına taşarsa kısıt ihlali.
- Mahal sınırları: `boundedBy` duvarlarından mahal çokgeninin yeniden üretilmesi (kapalı döngü bulma); kopukluk raporu.
- Kiriş → kolon mesnet ilişkisi (`supportedBy`), döşeme → taşıyıcı duvar / kiriş.
- Çözücü: B2'de tek geçişli, sıralı kural uygulayıcı (kat bağı → barındırma → mahal); döngü tespiti ve rapor.
  Genel kısıt çözücü B3'te.

### B2.5 Testler ve kabul
- Birim: birleşim tespiti (L / T / X / serbest uç), katman önceliği kırpma geometrisi, kat bağlı yükseklik, açıklık
  göreli konumu, mahal döngüsü, `apply` işlemlerinin geri al ile tam dönüşü.
- Uyumluluk: `eski-proje-v1` dosyası B2 ile açılıp kaydedildiğinde B1 sürümünde de açılabilmeli (alan eklemeleri isteğe bağlı).
- Uçtan uca: tür parametresi değişince aynı türdeki duvarların planda ve 3D'de güncellenmesi; geri al.
