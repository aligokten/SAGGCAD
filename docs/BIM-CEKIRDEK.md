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

## B3 — Bağımlılık grafiği, merkezi işlem geçmişi ve artımlı BIM modelleme

Sürüm `0.5.0-b3`. Kayıt biçimi (`.saggcad.json`) değişmedi; eski veri tek doğruluk kaynağı, BIM modeli ondan türetilir.
Yeni modüller: `js/bim/history.js`, `js/bim/deps.js`, `js/bim/solver.js`. Değişenler: `joins.js` (`updateJoins`,
`joinGraph`), `wallgeom.js` (artımlı hesap, prizma önbelleği), `wallcmds.js` (`setArcGeometry`, `bindingTarget`,
`arcParameters`), `commands.js` (kopya bağlama), `adapter.js`, `api.js`, `ui.js`, `plan2d.js`, `plan3d.js`, `main.js`, `sw.js`.

### B3-A Merkezi işlem günlüğü (`history.js`)
- Çizim başına **tek** geri al / yinele günlüğü (kat başına yığınların yerine). Bir kullanıcı eylemi = bir kayıt.
- İki kayıt türü: `cmd` (BIM komutunun alan düzeyindeki yaması) ve `diff` (eski düzenleme yolları: eylem başında
  `open()` kökün kopyasını alır, `close()` kopya ile güncel kök arasındaki yapısal farkı kaydeder). Fark kimlikli
  dizilerde kimlikle eşlenir; yalnız değişen alanlar ve eklenen / silinen kayıtlar saklanır; anahtar sırası korunur.
- Uygulama atomiktir: bir adım başarısız olursa o kaydın tüm adımları geri sarılır, kök değişmez, hata bildirilir
  ("Geri alınamadı — model değiştirilmedi").
- Kat değişince geçmiş korunur; iki katta 15 elemanı değiştiren işlem tek Ctrl+Z ile geri alınır; kat ekleme / silme
  ve geri alma kat kimliğini ve içeriğini birebir korur. `onRecord` değişiklik olayını (`model-change`) üretir.

### B3-A Kanvas sürüklemesi BIM komutuyla
- Sürükleme boyunca önizleme (eski yol); bırakınca önizleme geri sarılır (`abort`) ve **tek** komut çalışır:
  uç tutamacı → `moveWallEnd`, gövde → `offsetWall`. Açıklık sığma denetimi, bağlı uçlar ve mahal güncellemesi
  sürüklemede de geçerlidir; sığmayan açıklık sürüklemeyi reddeder (model değişmez, kısa hata mesajı).
- Esc / iptal önizlemeyi geri sarar. Dokunmatik tek parmak sürükleme ve iki parmak yakınlaştırma korunur.

### B3-B Bağımlılık grafiği (`deps.js`)
- Grafik BIM modelinden türetilir (ikinci kalıcı model yok). Düğümler: eleman, kat, `type:ID`, `comp:KEY`, `mat:KEY`,
  `view:KAT`, `qty:KAT`. İki kenar türü: **etki** (birleşen duvarlar, duvar → açıklık / mahal, eleman → görünüş / metraj)
  ve **kısıt** (kat → kata bağlı eleman ve üst kat, tür → eleman, kompozit → tür / eleman, malzeme → kompozit,
  duvar → barındırılan açıklık).
- `getAffectedElements(ids)`: kısıt kenarlarında sonuna kadar, etki kenarlarında iki adım; belirlenimci sıra
  (aşama, sonra kimlik). `findCycles` (Tarjan), `constraintOrder` (topolojik; döngüde `{ ok: false, cycles }`).
- API: `bim.deps()`, `bim.getAffectedElements()`, `bim.constraintCycles()`, `bim.constraintOrder()`.

### B3-C Artımlı geometri
- `levelWallGeometry`: plan nesnesi başına duvar imzası önbelleği. Değişen kümede (D) birleşim grafiği yerel olarak
  güncellenir (`updateJoins`: eski / yeni konumun komşuluğunda alt analiz, dizinler yamanır) ve yalnız etkilenen
  duvarların katman çokgenleri hesaplanır. Komşu duvarlar değişmemiş geometri nesnesini aynen paylaşır.
- **Güvenli tam hesap** (sonuç her zaman tam hesapla aynı): ilk çağrı, kompozit / malzeme / varsayılan kalınlık değişimi,
  tekrar eden kimlik, büyük değişiklik (> %25), yay duvar, etkilenen duvarlara dokunan katman çakışması ayrıştırması
  ya da yeni çakışma (ayrıştırma küresel ve sıralıdır). Ham çakışma denetimi, ayrıştırmada kırpılan duvarların
  ayrıştırma öncesi parçalarıyla yapılır (tam yoldaki ölçütle aynı).
- `joinGraph(P)`: önbellekli birleşim grafiği; komut oturumunun kopyası `linkPlan` ile özgün plana bağlanır, kopyanın
  ilk sorgusu özgünün grafiğinden ve geometrisinden başlar (komut başına iki tam analiz kalktı).
- Duvar prizmaları (`wallPrisms`) duvar başına önbellekli; dizi kimliği "değişmedi" anlamına gelir (3D ve metraj).

### B3-C 3D kısmi güncelleme (`plan3d.update`)
- Sahne imzası (duvar, açıklık, mahal dışı her şey + görünüm seçenekleri) aynıysa yalnız değişen duvarların ağları
  yenilenir: prizma dizisi ya da kayıt / açıklık imzası değişen duvarlar + yüz ayıklamasında bunlara değen duvarlar.
  Eski `BufferGeometry`'ler bırakılır (`dispose`); kamera, hedef, güneş ve gezinme dokunulmaz. Mahal değişikliği
  (kot 0) yalnız o mahalin nesnelerini, döşeme dış hattı değişirse yalnız döşemeyi yeniler. Kat yüksekliği, kot,
  görünüm seçeneği, yay duvar ya da çukur döşeme değişiminde tam kurulum (güvenli).
- Doğrulama: her senaryoda kısmi sahne, sıfırdan kurulan sahneyle nesne nesne (konum + köşe dizisi) karşılaştırılır.

### B3-D Sıralı kısıt çözücü (`solver.js`)
- Aşamalar: kat kotu / yüksekliği → kata bağlı kolon, kiriş, duvar → duvar geometrisi → birleşimler → açıklıklar →
  mahaller → döşemeler → metraj. `changed` verilirse yalnız etkilenen kapsam denetlenir.
- **Saf**: kökü değiştirmez, hiçbir çakışmayı sessizce düzeltmez. Çakışma `{ stage, code, severity, ids, msg }`;
  otomatik giderilebilenler için önerilen komut (`fixes`, ör. `syncLevelBindings`) ayrıca verilir ve yalnız kullanıcı
  "Uygula" derse tek geri alınabilir komut olarak çalışır. Kısıt döngüsü bulunursa sıra kurulmaz, döngü raporlanır.
- Kat bağı hedefi (`bindingTarget`) komutlar ve çözücüde ortaktır.

### B3-D Yay duvar
- Yay, parçalı düz duvar zinciri olarak saklanır (`arc: { id, i, off }`) — eski projeler aynen açılır.
- **Parametrik**: `bim.getArcParameters(arcId)` → yarıçap, merkez, başlangıç / bitiş açısı, açı, yay boyu, kiriş,
  ok yüksekliği, parça sayısı, tolerans. `setArcGeometry { arcId, radius | sagitta }`: uçlar (kiriş) sabit, parça sayısı
  korunur, köşeler eşit açılı; açıklıklar yeniden yerleşir, sığmayan açıklık komutu reddeder; mahaller izler;
  tek geri alınabilir işlem. Tolerans: istenen ↔ elde edilen yarıçap **0,5 cm** (aşılırsa reddedilir). Panelde
  "Yarıçap" alanı bu komutu kullanır.
- **Eski davranış korunur ve raporlanır**: yayın kompozit katman temizliği, teğet birleşimleri ve 3D / kesit gövdesi
  B2B öncesi yaklaşımdadır (`ARC_LEGACY` bilgisi; artımlı yol yayda tam hesaba döner). Kalınlık / kompozit / yükseklik
  yay parçalarına uygulanır; açıklık bir parçaya bağlıdır.

### B3-D Model Sağlığı
- Araçlar → **Model Sağlığı** (komut paleti: "Model Sağlığı"): eleman sayısı, kata bağlı eleman, birleşim sorunu,
  çözülemeyen kısıt, geçersiz geometri; son model güncellemesi (eylem, değişen kimlik sayısı, geri al / yinele, saat),
  duvar geometrisinin yolu (artımlı / tam ve nedeni), 3D güncelleme türü, kısıt denetimi süresi. Kısa mesajlar aşama
  etiketiyle; ayrıntılar `console.info('[Model Sağlığı]', …)`.

### Ölçümler (`npm run bench:b3`)
Donanım: Intel Xeon @ 2,80 GHz, 4 çekirdek (paylaşımlı bulut kapsayıcısı), Node.js v22.22.0. Yöntem: ızgara plan
(kompozit dış / iç duvarlar, her 5. duvarda kapı, her 4. düğümde kata bağlı kolon); her ölçüm ısınmadan sonra medyan
(tek duvar 30, diğerleri 3–20 tekrar). "Tek duvar" = bir duvarın kalınlığı değişir → artımlı birleşim + katman
geometrisi. Ölçümler arasında ±%15 oynama gözlendi (paylaşımlı makine).

| Duvar (eleman) | İlk yükleme | Tam geometri | **Tek duvar (artımlı)** | Uç taşıma komutu | 3D güncelleme CPU (kısmi / tam) | Metraj | Kat yüksekliği komutu | BIM raporu | Geri al / yinele |
|---|---|---|---|---|---|---|---|---|---|
| 112 (149) | 114 ms | 32 ms | **3,3 ms** | 12 ms | 9 / 60 ms | 3,3 ms | 1,9 ms | 8,6 ms | 2,1 ms |
| 480 (636) | 127 ms | 78 ms | **4,7 ms** | 18 ms | 6 / 214 ms | 7,8 ms | 8,0 ms | 13,5 ms | 3,2 ms |
| 1984 (2629) | 506 ms | 350 ms | **8,3 ms** | 56 ms | 20 / 973 ms | 29 ms | 35 ms | 64 ms | 11 ms |
| 5100 (6757) | 1432 ms | 936 ms | **28 ms** | 165 ms | 74 / 2353 ms | 88 ms | 110 ms | 267 ms | 23 ms |

- Hedef "2000 duvarlı katta tek duvar artımlı geometri < 10 ms": **8,3 ms** (bu ölçüm; tekrar eden çalıştırmalarda
  8,6–10,6 ms aralığı görüldü — sınırda). Doğruluktan ödün verilmedi: her artımlı sonuç testlerde tam hesapla birebir.
- Tarayıcıda (Chromium, SwiftShader WebGL) 1984 duvar: 3D kısmi güncelleme **17,6 ms**, tam kurulum 322 ms.
- Uç taşıma komutu B3 öncesi 2000 duvarda ~148 ms'ydi (komut kopyasında iki tam birleşim analizi); önbellekli
  birleşim grafiğiyle ~47–56 ms. Kalan süre komutun kopyalama + doğrulama (iki model türetme) maliyetidir.

### Artımlı ↔ tam eşitlik
Karşılaştırılan: duvar başına katman çokgenleri (koordinat, 1e-6), katman / malzeme / öncelik, birleşim kimlikleri
(sıralı), uç / duvar dizinleri, sorun kodları, ham çakışma sayısı, metraj alan / hacim, 3D prizma çokgenleri,
eleman kimlikleri ve ilişkileri (önbellekli ↔ önbelleksiz model).
- `tests/b3-incremental.test.mjs`: rastgele 120 düzenleme (uzun çaprazlar dahil), gerçekçi 80 düzenleme, temiz modelde
  60 düzenleme (%100 artımlı), komut + geri al dizisi, 2D / 3D / metraj, güvenli tam hesap durumları, `joinGraph` kopya.
- `tests/b3-stress.test.mjs`: **1000 adım** (≈570 komut, ≈25 reddedilen, ≈270 eski yol düzenlemesi, ≈120 geri al,
  yinele) — her adımda eşitlik; sonunda tüm geri almalar başlangıç JSON'unu, tüm yinelemeler son JSON'u birebir verir.

### Testler
`npm test` (birim, 87 test): `b3-history`, `b3-deps`, `b3-incremental`, `b3-solver`, `b3-arc`, `b3-stress` + önceki
aşamalar. Tarayıcı (isteğe bağlı, Playwright): `tests/e2e/b3.e2e.cjs` (sürükleme komutları, geri al / yinele, katlar
arası, kat silme, dokunmatik), `b3-3d.e2e.cjs` (kalınlık, yükseklik, uç sürükleme, pencere taşıma, kompozit, geri al,
kat yüksekliği: kısmi = tam, kamera korunur, bellek bırakılır), `b3-ui.e2e.cjs` (Model Sağlığı, önerilen düzeltme,
parametrik yay, kayıt / yeniden yükleme, çevrimdışı).

### Bilinen sınırlar (B3)
- Yay duvarın katman temizliği, teğet birleşimi ve 3D / kesit gövdesi eski yaklaşımda (yukarıda). Yay parametreleri
  komutla değişir; yay gövdesinin kompozit katman çokgenleri B4 sonrası.
- Eğik dörtlü düğümde gerçek katman çakışması oluşursa ayrıştırma küreseldir → o bölgedeki düzenlemeler tam hesaba düşer
  (doğru, ama yavaş). `GEO_STATS.fallback` nedenleri sayar; Model Sağlığı son yolu gösterir.
- Kesit penceresi açıkken yeniden çizim kesit başına tamdır (duvar geometrisi ve prizmalar önbellekten gelir).
- Komut önizlemesi (sürükleme) eski yoldur; komut bırakmada çalışır. İki parmak yakınlaştırmanın otomatik testi
  sentetik işaretçilerle yapılır (başsız Chromium CDP çoklu dokunuş üretemiyor — B2B tabanında da aynı).
