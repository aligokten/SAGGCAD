# Parametrik BIM çekirdeği

Hedef: elemanların (duvar, döşeme, kolon, kiriş, açıklık, mahal, çatı, merdiven) geometrisini parametrelerinden ve
ilişkilerinden **türeten** bir çekirdek; bir parametre değiştiğinde bağlı elemanlar, metraj, kesit / görünüş ve 3D
kendiliğinden güncellenir. Referans: Archicad 30 (eleman → kompozit → kat), Revit (Family Type, tür / örnek parametreleri).

| Aşama | Kapsam | Durum |
|---|---|---|
| **B1** | Eleman şeması, tür sistemi, eski veri adaptörü, ilişki modeli, okuma API'si | **Tamamlandı** (sürüm 0.3.1) |
| **B2A** | Güvenli yazma motoru (komutlar), tür yöneticisi, düzenlenebilir parametreler, geçersiz kılma, geri al | **Tamamlandı** (sürüm 0.4.0-b2a) |
| **B2B** | Akıllı duvar birleşimleri (L / T / X / I), katman önceliği, ortak 2D / 3D / kesit geometrisi, duvar hareketi, mahal sınırı, kata bağlı geometri | **Tamamlandı** (sürüm 0.4.0-b2b) |
| B3 | Bağımlılık grafiği, artımlı model güncelleme, tek işlem günlüğü, yay duvar birleşimleri | Planlandı (aşağıda) |
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
- Geçersiz kılma: B2A'da kayıttaki isteğe bağlı `bimOv` dizisi (açık geçersiz kılınan parametreler); `resolveParameters`
  bunları "override" kaynağıyla gösterir (aşağıda B2A).

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

### Arayüz (B1: salt okunur — B2A'da düzenlenebilir, aşağıda)
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

### Bilinen sınırlar (B1) — B2A'da kapananlar işaretli
- ~~BIM modeli salt okunurdur; tür oluşturma / düzenleme ve tür atama için arayüz yok~~ → B2A
- Eski kayıtlarda zaman damgası olmadığından `createdAt` / `modifiedAt` eski elemanlarda `null`; B2 yazma modeli dolduracak.
- Kat döşemesi elemanının sınır çokgeni BIM modelinde hesaplanmaz (`geom.outline: null`, `fromLevel: true`); 3D ve kesit
  bunu mevcut `outlineOf` ile üretmeye devam eder.
- Yay duvar ayrı eleman değil; parçalar `geom.arc` grup bilgisiyle ayrı duvar elemanlarıdır.
- Ölçü çizgisi, yazı ve kesit hattı (belgeleme nesneleri) modele alınmaz; mutfak / dolap ve mobilya genel `furnishing`.
- ~~Önbellek değişimi her sorguda tüm planın JSON özetiyle algılanır~~ → B2A: editör sürümü (`rev`); yeniden türetme hâlâ
  tüm model için (B3).

---

## B2A — Parametrik BIM düzenleme (tamamlandı)

### Mimari
```
js/bim/
  fields.js     BIM parametresi ↔ eski kayıt alanı eşlemesi (değer türü, sınır, kapsam, kata bağlılık), bimOv okuma
  commands.js   yazma motoru: planCommand (önizleme) / runCommand (uygula), alan düzeyinde yama, applyPatch (geri al / yinele),
                tür parametresi yayılımı, eski panel düzenlemelerinin geçersiz kılma kaydı (noteLegacyEdit), özet metni
  manager.js    Model → "BIM Türleri ve Parametreler" penceresi
  api.js        okuma API'si (dondurulmuş görünümler), commands.plan / commands.run, olay tabanlı önbellek
  ui.js         özellik paneli BIM bölümü: tür atama, "Türe döndür", "Kata bağlı", kaynak rozetleri
```
Editör (`plan2d.js`): `bimCommand(cmd)` komutu çalıştırır, yamayı geri al yığınına **tek kayıt** olarak koyar
(`{ bim: patch, label }`), çizimi ve paneli yeniler, `onChange` ile otomatik kaydı tetikler. `undo()` / `redo()` bu kaydı
`applyPatch` ile geri alır / yineler; kat planı anlık görüntüleri eskisi gibi çalışır. Editör her değişiklikte `rev`
sürümünü artırır; BIM önbelleği bu sürümle geçersizleşir.

### Komut akışı
1. Kökün geçici kopyası alınır (gerçek veri okunur, değiştirilmez).
2. Girdi, eleman (kimlik tek olmalı), tür ve değer (`fields.js` kuralları) doğrulanır.
3. İşlem kopyada hesaplanır; her alan değişikliği yamaya yazılır (`{ lv, coll, id, key, before, after }`).
4. Kopyadan BIM modeli türetilir; etkilenen elemanlarda **yeni** doğrulama hatası varsa komut reddedilir.
5. Yama gerçek köke uygulanır; bir kayıt bulunamazsa uygulanan adımlar geri sarılır (yarım veri kalmaz).
6–9. Editör: geri al kaydı → önbellek (sürüm) → çizim ve panel → otomatik kayıt.

Komutlar: `createType`, `duplicateType`, `updateType`, `deleteType`, `assignType`, `setInstanceParam`,
`resetInstanceParam`, `setElementLevelBinding`. Önizleme: `SAGGCAD.bim.commands.plan(cmd)`; uygulama:
`SAGGCAD.bim.commands.run(cmd)` (editör yürütücüsü üzerinden; yürütücü yoksa reddedilir). B1'in deneysel yazma API'leri
gerçek yazmayı reddeder (geri al ve kayıt atlanamaz).

### Saklanan veri (kayıt biçimi değişmedi)
- `root.meta.bimTypes` — projeye özel türler `{ id, cls, name, params, base?, rev }` (B1'deki yer).
- Kayıt üzerinde isteğe bağlı `bimType` — açık atanmış tür; `bimOv` — açık geçersiz kılınan parametre anahtarları
  (ör. `["compositeId", "thickness"]`). Eski sürümler bu alanları yok sayar; `plan.v` ve `.saggcad.json` biçimi aynı.
- Parametre değerleri her zaman eski alanlarda (`t`, `h`, `comp`, `kind`, `struct`, `w`, `d` …) durur: 2D, 3D, kesit,
  metraj ve DXF bu alanları okuduğu için ek eşzamanlama yoktur.

### Düzenlenebilir BIM türleri — kullanım
1. **Model → BIM Türleri ve Parametreler…** (ya da Ctrl+K "BIM Türleri"; panelde "Türleri yönet…").
2. Sol listeden sınıf (Duvar, Kolon, Kiriş, Döşeme; Kapı / Pencere / Boşluk ölçüleri) ve tür seçin. Sayı rozeti türü
   kullanan eleman sayısıdır. Yerleşik türler kilitli: **Çoğalt** ile özel tür oluşturun (özel türden de türetilebilir).
3. Özel türde ad, işlev, kompozit yapı, kalınlık (kompozit yoksa), yükseklik, taşıyıcılık; kolon / kirişte malzeme ve
   kesit ölçüleri düzenlenir. Değişiklik yapılırken pencerede canlı özet görünür, ör.
   *"Bu değişiklik 12 duvarı etkileyecek. 2 duvarda özel kalınlık ve kompozit yapı korunacak."*
4. **Değişiklikleri uygula** tek geri alınabilir işlemdir (Ctrl+Z).
5. Çizimde elemanları seçip **Seçili elemanlara ata** ya da özellik panelinde **BIM tipi** listesinden tür atayın.
6. Panelde bir değeri türden farklı yaparsanız açık geçersiz kılma oluşur (kırmızı "Geçersiz kılındı" rozeti) ve
   **Türe döndür** düğmesi çıkar. Duvar / mahal yüksekliği için **Kata bağlı** anahtarı kat yüksekliğini izletir.
7. Kullanılmayan özel tür silinir; kullanılan tür yalnız başka bir türe **yeniden atanarak** silinir.

### Tek düzenleyici kuralı
Geometri ve yapı değerleri panelin mevcut alanlarından (kalınlık, yükseklik, kompozit …) düzenlenir; BIM bölümü aynı
parametre için ikinci bir giriş alanı göstermez. Panel düzenlemesi açık türü olan elemanda komutlarla aynı kurala göre
`bimOv`'a işlenir. Türe ait bir parametre (duvar / döşeme işlevi, kolon / kiriş malzemesi, açıklık türü) panelden
değişirse eleman türden ayrılır ve mevcut alanlardan türetilmiş türe döner (bildirimle).

### Tür değişikliğinin yayılımı ve eski projeler için geçiş kuralı
Tür parametresi değişince yalnızca bu türe **açık atanmış** elemanlar (`bimType`) değerlendirilir; her parametre için:
1. `bimOv`'da varsa → değer korunur.
2. Kata bağlı yükseklik (alan boş) → kat yüksekliğini izlemeye devam eder.
3. Değer eski tür değerine eşitse (ya da alan boşsa) → yeni tür değerini alır.
4. Açık kayıt yok ve değer eski tür değerinden farklıysa (B1 / eski proje verisi) → **değer korunur** ve aynı işlemde
   `bimOv`'a eklenir. Eski değerler hiçbir koşulda topluca silinmez; kural belirlenimcidir ve geri alınabilir.
Kompozit kalınlığı belirler: kompozit değişince kalınlığı geçersiz kılınmamış duvarlar yeni kompozit kalınlığını alır.
Türetilmiş (yerleşik, değişmez) türlerdeki elemanlar etkilenmez. Tür türetmesi kopyadır: temel tür sonradan değişince alt
tür değişmez (`base` yalnız kökeni gösterir).

### Çizim motorlarıyla entegrasyon
Değerler eski alanlara yazıldığı için değişiklikten sonra editör tüm görünümü yeniden çizer: 2D plan (kalınlık, katman
taraması), 3D (açıkken 350 ms gecikmeli yeniden kurulum), kesit / görünüş penceresi (açılışta yeniden hesaplanır),
metraj ve DXF. Uçtan uca testte kalınlık değişiminin 2D katmanlara, yükseklik değişiminin 3D'ye yansıdığı ve geri alınca
birebir döndüğü doğrulanır. Açık olan kesit / görünüş penceresi kendiliğinden yenilenmez (yeniden açılır) — B3'te
değişiklik olaylarıyla eşzamanlanacak.

### Performans (ölçüm)
`node tests/bench/bim.bench.mjs 2000` — 2000 duvar, 1000 pencere, 500 kolon (3500 eleman); Intel Xeon 2,8 GHz, node 22:

| Ölçüm | Sonuç |
|---|---|
| İlk türetme (`report`) | ≈ 82 ms |
| Sorgu çifti (getElement + resolveElementParameters), içerik imzası (B1 yöntemi) | ≈ 8,0 ms |
| Aynı sorgu çifti, editör sürümüyle (B2A) | ≈ 0,009 ms |
| Önbellekli rapor / tür kullanımı | < 0,01 ms |
| Değişiklik sonrası yeniden türetme | ≈ 62 ms |
| 500 duvara tür atama önizlemesi (`planCommand`) | ≈ 49 ms |

Editörde sorgular artık tüm planı JSON'a çevirmez; değişiklikten sonraki yeniden türetme hâlâ tüm model içindir (B3:
artımlı). Editörsüz kullanımda (testler) içerik imzası yedek olarak kalır.

### Testler
- `tests/bim-b2a.test.mjs` (node, CI'da): yeni tür, yerleşikten / özelden türetme, tür atama, tür parametresi değişimi,
  12 duvarlık yayılım ve özel değerlerin korunması, eski veri geçiş kuralı, Türe döndür, tür silme koruması, hatalı
  komutların veriyi değiştirmemesi ve yarım uygulamanın geri sarılması, tek adımda geri al / yinele (birebir JSON),
  JSON gidiş-dönüş, eski dosya uyumluluğu, DXF / kesit / metraj regresyonu, önbellek ve yürütücü.
- `tests/e2e/b2a.e2e.cjs` (Playwright): pencere üzerinden tür oluşturma ve atama, panel düzenlemesiyle geçersiz kılma,
  canlı özet, toplu güncelleme, Ctrl+Z / Ctrl+Shift+Z, Türe döndür, 3D yükseklik, silme koruması, kaydet / yeniden aç,
  DXF, telefon genişliği, konsol hatası.

### Bilinen sınırlar (B2A)
- Geri al yığını kat başınadır (mevcut tasarım). Bir BIM komutu başka katlardaki elemanları da değiştirdiyse geri alma
  yalnız komutun verildiği katın yığınından yapılır; o katta komuttan **önce** alınmış bir kat anlık görüntüsü geri
  alınırsa o kattaki tür değerleri de eski hâline döner (veri kaybı değil, alan değeri geri döner). B3'te tek işlem günlüğü.
- Kat silme geri al yığınlarını sıfırlar (mevcut davranış); öncesindeki BIM komutları geri alınamaz.
- Tür parametreleri: mahal, çatı, merdiven türleri yalnız listelenir / atanır; kapı ve pencerede yalnız ölçüler.
  Eleman başka kata taşınamaz (`setElementLevelBinding` yalnız duvar / mahal yüksekliği).
- ~~Kolon / kiriş yüksekliği kata bağlanamaz~~ → B2B: `setTopBinding` (duvar, kolon, kiriş)
- Yay duvar parçaları ayrı elemandır; türü parça parça atanır.
- Türler çizim kökünde (`meta.bimTypes`) durur: aynı projedeki iki çizim (rölöve / proje) türleri paylaşmaz.
- ~~Açık kesit / görünüş penceresi değişiklikte kendiliğinden yenilenmez.~~ → B2B: editör değişiklik olayına abone
- Çok büyük planlarda değişiklik başına tam yeniden türetme (3500 elemanda ≈ 60 ms) — B3 artımlı türetme.

---

## B2B — Akıllı duvar birleşimleri ve parametrik yapı ilişkileri (tamamlandı)

Öncelik görsel değil geometrik doğruluktur: 2D plan, 3D model, kesit / görünüş ve duvar metrajı **aynı** kırpılmış katman
çokgenlerinden üretilir. Birleşim bilgisi kayda yazılmaz; her seferinde duvar verisinden türetilir.

### Mimari
```
js/bim/
  geom2d.js    saf 2D geometri: yarı düzlem kırpma, dışbükey fark, kesişim alanı, kenar örtüşmesi, sınır kutusu
  joins.js     birleşim grafiği: L / T / X / I / STAR / LEGACY, serbest uç, sorunlar, belirlenimci kimlik, wallJoinInfo
  wallgeom.js  katman öncelikleri, birleşim kuralları, katman çokgenleri, açıklık bölgeleri, prizmalar, metraj, kontur,
               çakışma raporu ve son güvence ayrıştırması (levelWallGeometry önbellekli)
  mesh.js      prizmalardan 3D yüzey: paylaşılan yan yüz eleme, kapalılık / hacim / normal / iç yüz denetimi, Three.js dizileri
  wallcmds.js  duvar komutları (moveWallEnd, offsetWall, setWallLength, setWallReference, setJoinEnabled),
               açıklık konum politikası, mahal sınırı güncellemesi, kata bağlı geometri (setTopBinding, setLevelHeight,
               setLevelSlab, syncLevelBindings)
structure.js   wallGeomSvg — 2D çizim (geometriden ayrı; yalnız çizer)
plan3d.js      düz duvarlar ortak prizmalardan tek BufferGeometry (duvar başına); kapı / pencere elemanları eskisi gibi
sections.js    buildSolids düz duvarlarda ortak prizmaları kullanır; açık kesit penceresi editör değişikliğine abone
```

### Birleşim grafiği (B2B-1)
- **L**: iki uç aynı noktada (eksen toleransı 0,5 cm), açı ≠ 180°. 15°'nin altında `ACUTE_ANGLE` uyarısı.
- **I**: iki uç aynı noktada, doğrusal devam (2° tolerans) → uçlar düğümde dik kesilir; eski yarım kalınlık uzatması
  (çift hacim) kalktı.
- **T**: uç başka bir duvarın gövdesinde; temas sınırı ana duvarın kalınlık bandı + 1 cm (eksen toleransından ayrı).
  Üç uçlu düğümde doğrusal çift + kol da T'dir. Bandın dışındaki komşu duvar birleşmez (test: 1,5 cm dışarıda birleşmez).
- **X**: gövdeler kesişiyor ya da dört uçlu düğümde iki doğrusal çift. **STAR**: diğer çok uçlu düğümler (açıortay).
  **LEGACY**: yay duvar içeren düğüm — eski uzatma korunur, `ARC_LEGACY` ile raporlanır.
- Sorunlar: `ZERO_LENGTH`, `SHORT_WALL`, `OVERLAP` (aynı doğruda üst üste / aynı uçtan aynı yöne), `ID_DUPLICATE`,
  `JOIN_DISABLED`, `NODE_OVERLAP`, `GEOM_OVERLAP_RESOLVED`. BIM modelinde `JOIN_*` sorunu ve `joinedAt` ilişkisi olarak görünür.
- Kimlik belirlenimci: `L:w1.b|w2.a`, `T:h.body|s.a` … (duvar sırası değişse de aynı).

### Katman önceliği ve temizlik kuralları (B2B-2)
Varsayılan öncelik (0–9): 9 taşıyıcı çekirdek (taşıyıcı duvar ya da beton çekirdek) · 7 taşıyıcı olmayan ana katman ·
6 diğer kâgir / beton · 5 dolgu · 4 ısı / ses yalıtımı · 3 su / buhar yalıtımı · 2 levha, hava boşluğu · 1 sıva, kaplama.
Projeye özel öncelik "Malzemeler ve yapılar" penceresinde katman başına seçilir; kompozit katmanının 3. değeri olarak
saklanır (`[malzeme, kalınlık, öncelik]`). Eski kompozitler yeniden yazılmaz; değer yoksa malzeme grubundan türetilir.

Köşe bölgesi iki duvar şeridinin kesişimidir ve katman bantlarıyla hücrelere bölünür:

| Birleşim | Kural |
|---|---|
| L — çekirdek / çekirdek | yüksek öncelik hücreyi alır; eşitse gönye (hücre köşegeni) |
| L — çekirdek / karşı duvarın iç katmanı | çekirdek geçer, karşı çekirdeğe ulaşır |
| L — çekirdek / karşı duvarın dış katmanı | dış katman köşeyi sarar |
| L — aynı taraftaki katmanlar | dışa (içte: iç yüze) yakın olan sürer; aynı derinlikte öncelik; o da eşitse köşegen |
| T | kol katmanı ana duvar katmanlarını yakın yüzden itibaren öncelikleri kendisinden **düşük** olduğu sürece geçer, ilk eşit / yüksekte durur; ana duvar sürekli |
| X | hücre öncelik yüksek olana; eşitse kimliği önce gelen duvara |
| Son güvence | kurallardan sonra hâlâ çakışan parça (ör. tekrar çizilmiş duvar) öncelikle ayrıştırılır ve `GEOM_OVERLAP_RESOLVED` ile raporlanır |

Örnek çıktılar: `docs/b2b/*.svg` (`npm run svg`) — L 90° / 60° / 135°, perde ↔ tuğla, T dış ↔ iç bölme, T hafif bölme,
T perde kolu, X perde ↔ tuğla, farklı kalınlıklı L. Her dosyanın alt yazısında alan ve çakışma sayısı (hepsinde 0).

### 2D / 3D / kesit (B2B-2, B2B-4)
- 2D: katman çokgenleri (renk + tarama) ve tek kontur; kontur, kenar örtüşmesinden hesaplanır (ortak kenar çizilmez,
  malzeme sınırı ince, çekirdek sınırı kalın). Duvar çizilirken, taşınırken, kalınlığı değişirken birleşim yeniden
  hesaplanır (önbellek duvar verisi değişince yenilenir). Kullanıcının girdiği koordinatlar değişmez.
- 3D: duvar başına tek `BufferGeometry`; paylaşılan yan yüzler (birleşim, katman sınırı, açıklık bölgesi sınırı)
  elenir, söve yüzleri kalır. Denetim: kapalılık vektörü ≈ 0, diverjans hacmi = prizma hacmi, ters normal 0, iç yüz 0,
  Three.js sarımı doğru (eksen dönüşümü yansıma olduğu için çevrilir).
- Kesit: `buildSolids` aynı prizmaları kullanır; kesilen katmanların alan oranı kompozit kalınlık oranına eşit (test).
- Açık "Kesit ve görünüşler" penceresi editörün `pe:change` olayına abone olur ve güncel kökten yeniden çizer;
  pencere kapanınca abonelik kaldırılır (testte sayaç 1 → 0).

### Duvar hareketi ve bağlı elemanlar (B2B-3)
- Komutlar geçici kopyada hesaplanır, doğrulanır ve tek geri alınabilir işlem olarak uygulanır. Özette etkilenen duvarlar,
  mahaller ve kopan T bağlantıları döner; panelin "Uzunluk" alanı artık `setWallLength` komutunu kullanır.
- Açıklık politikası: ötelemede açıklık duvarla gider; uç / uzunluk değişiminde sabit kalan uca uzaklık korunur;
  yeni boya sığmayan açıklık varsa komut **reddedilir** (boyut / konum sessizce değişmez).
- Birleşen uçlar (0,5 cm) birlikte taşınır; kopan T bağlantısı uyarılır (kol uzatılmaz).
- Mahal: yalnız sınır duvarı gerçekten değişen kenarlar hareket eder, duvar eksenine olan mevcut uzaklık korunur.
  Belirsiz eşleme, paralel kenar, ters dönme ya da kendini kesme durumunda mahal değişmez ve raporlanır. Kimlik, ad,
  kaplama ve diğer alanlar korunur. İşlem idempotenttir (aynı komut tekrar edilince mahal yeniden yuvarlanmaz).
- `setWallReference` yalnız referansı (`face`) değiştirir; koordinatlar yerinde kalır. `setJoinEnabled` bir uçta
  otomatik birleşimi kapatır / açar (`joinOff` — kullanıcı tercihi, türetilmiş veri değildir).

### Metraj
`bim.wallQuantities()` kat başına duvar hacmi ve malzeme hacimleri (birleşimlerde çift sayım yok; açıklıklar düşülür).
Test: metraj = 3D diverjans hacmi = kesit prizma hacmi; malzeme toplamı = toplam hacim. Mahal net alanı ve duvar alanı
mevcut `planMetrics` ile devam eder.

### Kata bağlı geometri (B2B-4)
`bimTop: { mode, off }` (isteğe bağlı alan; duvar, kolon, kiriş):
- `level`: üst kot = kat yüksekliği + ofset (üst kat döşemesi altı; kiriş için `off < 0` ile altına)
- `nextSlabTop`: üst kot = kat yüksekliği + üst katın döşeme kalınlığı + ofset
- `fixed`: bağ yok (duvarda o anki yükseklik açık değer olarak yazılır)
Değer eski alanlara yazılır (duvar `h`, kolon `h = üst − z`, kiriş `z = üst − h`). Kat yüksekliği (`setLevelHeight`) ve
döşeme kalınlığı (`setLevelSlab`) komutla değişir ve bağlı elemanlar aynı işlemde güncellenir; panelin ilgili alanları bu
komutları kullanır. Üst kat yoksa `nextSlabTop`, çatı katında bağ, sıfır / negatif yükseklik ve döşeme altına inen
kiriş reddedilir. Bağlı elemanın yüksekliği panelden elle değişirse bağ kaldırılır (bildirimle).

### Arayüz
Özellik panelinin BIM bölümünde, duvar için **Birleşim ve referans** (başlangıç / bitiş / gövde birleşimleri ve bağlı
duvarlar, uç başına "Otomatik" anahtarı, referans çizgisi, katman öncelikleri, birleşim sorunları) ve duvar / kolon /
kiriş için **Kat bağı** (üst kot türü + ofset). Mobilde aynı denetimler dokunmayla çalışır (testte doğrulandı).

### Ölçümler
`npm run bench` (Intel Xeon 2,8 GHz, node 22):

| Durum | Süre |
|---|---|
| Örnek proje (13 duvar) geometri, ilk hesap | ≈ 3 ms |
| Aynı, önbellekten | ≈ 0,02 ms |
| 22 duvarlık ızgara, 121 birleşim | ≈ 50 ms |
| 66 duvarlık ızgara, 1089 X kesişimi (aşırı durum) | ≈ 130 ms (ızgara dizini öncesi 4,3 s) |

### Testler
- `tests/joins.test.mjs` (9), `tests/wallgeom.test.mjs` (10), `tests/b2b-cmds.test.mjs` (7), `tests/b2b-3d.test.mjs` (5) —
  alan korunumu (beklenen dış hat çokgeniyle), ham ve son çakışma, kapalı kontur, katman alanları, hacim ve mesh denetimleri.
- `tests/e2e/b2b.e2e.cjs` (Playwright): çizerken L / T, tek kontur, panel bölümleri, birleşim kapatma / geri al, referans,
  sığmayan pencere reddi, bağlı uç + mahal, birebir geri al, 3D mesh denetimi, kat bağı + kat yüksekliği + geri al, kesit
  penceresi yenilenmesi ve abonelik temizliği, kaydet / yeniden aç, DXF, mobil, konsol hatası.

### Bilinen sınırlar (B2B)
- **Yay duvarlar**: birleşim temizliği uygulanmaz; eski çizim ve uzatma kuralı korunur, `ARC_LEGACY` ile raporlanır (B3).
- STAR (4'ten fazla ya da doğrusal çifti olmayan çok uçlu) düğümlerde açıortay birleşimi; katman önceliği uygulanmaz,
  farklı kalınlıklarda küçük boşluk kalabilir (`STAR_JOIN` raporlanır).
- Kanvasta uç / gövde sürükleme hâlâ eski doğrudan yazma yoludur (açıklık sığma denetimi ve mahal güncellemesi yalnız
  komutlarda ve paneldeki uzunluk alanında). B3'te sürükleme komut katmanına alınacak.
- "Malzemeler ve yapılar" penceresinde döşeme kompoziti değişince kat bağı güncellemesi ayrı bir geri al adımıdır.
- Geri al yığını hâlâ kat başınadır (B2A sınırı).
- Mahal yeniden hesabı yalnız komutla değişen duvarlara bağlı kenarlarda; mahalin kapalı döngüsünü sıfırdan bulma yok.
- 3D'de duvar katman renkleri ayrı gösterilmez (eski görünüm: duvar / oda rengi); kesit ve 2D katmanlı.
- Kesit penceresi açıkken plan düzenlenemez (pencere modaldır); yenilenme API / geri al gibi dış değişikliklerde çalışır.

---

## B3 — Bağımlılık grafiği ve artımlı model güncelleme (teknik plan)

Hedef: her değişiklikte tüm modeli yeniden türetmek yerine yalnız etkilenen elemanları yeniden hesaplamak; tüm
düzenleme yollarını (kanvas sürükleme dahil) komut katmanına almak; kat başına geri al yığınını tek işlem günlüğüyle
değiştirmek; yay duvar birleşimlerini desteklemek.

### B3.1 Değişiklik olayları ve kirli işaretleme
- `commands.js` yaması zaten alan düzeyinde: `{ lv, coll, id, key }`. Editör her uygulanan yamayı `pe:patch` olayıyla
  yayınlar; eski doğrudan yazma yolları (sürükleme, panel alanları) için `editor.touch(lv, coll, id, keys)` eklenir.
- `js/bim/deps.js`: bağımlılık grafiği — düğümler eleman kimlikleri; kenarlar:
  duvar → birleşim komşuları (joins), duvar → açıklıklar (hostedBy), duvar → mahaller (boundedBy / geometrik eşleme),
  kat → kata bağlı elemanlar (bimTop, h = 0), tür → atanmış elemanlar (bimType), kompozit → kullanan duvar / döşemeler.
- Kirli küme = değişen kimlikler + grafikte bir adım (geometri için birleşim komşuları iki adım).

### B3.2 Artımlı türetme
- `adapter.buildModel` → eleman başına `elementFromLegacy` önbelleği (kimlik + kayıt imzası); yalnız kirli elemanlar
  yeniden üretilir, `issues` ve ters dizin artımlı güncellenir.
- `wallgeom`: kat başına birleşim grafiği ızgara dizini kalıcı tutulur; kirli duvar + komşuları için hücre çözümü yeniden
  yapılır, diğer duvarların katman çokgenleri korunur. Kabul ölçütü: 2000 duvarlı katta tek duvar taşıma < 10 ms.
- 3D: duvar başına mesh zaten ayrı; yalnız kirli duvarların `BufferGeometry`'si değiştirilir (tam `build()` yerine).
- Kesit / metraj: kat ve eleman başına önbellek; açık kesit penceresi yalnız etkilenen katı yeniden çizer.

### B3.3 Tek işlem günlüğü (geri al / yinele)
- Kat başına anlık görüntü yığını yerine proje (çizim) başına tek günlük: her kayıt bir yama (alan düzeyi) ya da
  eski yol için kat anlık görüntüsü farkı (JSON diff → yama). Katlar arası geri alma tutarlı olur; kat silme günlüğü
  sıfırlamaz (kat ekleme / silme de yama olur).
- Kanvas sürüklemesi: hareket boyunca önizleme, bırakınca `moveWallEnd` / `offsetWall` komutu (açıklık sığma
  denetimi ve mahal güncellemesi sürüklemede de geçerli).

### B3.4 Genel kısıt çözücü (sıralı, döngü denetimli)
- Kurallar: kat bağı → birleşen uçlar → barındırılan açıklıklar → mahal sınırı → döşeme dış hattı. Topolojik sıra;
  döngü bulunursa işlem reddedilir ve döngü raporlanır.
- Mahal sınırı: duvar grafiğinden kapalı döngü bulma (yüz izleme), birden çok çözümde kullanıcıya seçim.

### B3.5 Yay duvar birleşimleri
- Yay parçaları tek mantıksal eleman (`arc.id`) olarak ele alınır; uçta teğet doğrultusuyla L / T kuralları; katman
  bantları yarıçap ötelemesiyle; kırpma eğri yaklaşık (parça çokgenleri) ama alan korunumlu.

### B3.6 Testler ve kabul
- Artımlı ↔ tam türetme eşitliği (rastgele düzenleme dizileri, 1000 adım): model, katman çokgenleri, prizma ve metraj aynı.
- Performans bütçeleri `npm run bench` ile CI dışında ölçülür ve belgeye işlenir.
- Tek günlükle çok katlı geri al / yinele birebir JSON; sürükleme komutlarının uçtan uca testi.
