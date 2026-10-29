# Parametrik BIM çekirdeği

Hedef: elemanların (duvar, döşeme, kolon, kiriş, açıklık, mahal, çatı, merdiven) geometrisini parametrelerinden ve
ilişkilerinden **türeten** bir çekirdek; bir parametre değiştiğinde bağlı elemanlar, metraj, kesit / görünüş ve 3D
kendiliğinden güncellenir. Referans: Archicad 30 (eleman → kompozit → kat), Revit (Family Type, tür / örnek parametreleri).

| Aşama | Kapsam | Durum |
|---|---|---|
| **B1** | Eleman şeması, tür sistemi, eski veri adaptörü, ilişki modeli, okuma API'si | **Tamamlandı** (sürüm 0.3.1) |
| **B2A** | Güvenli yazma motoru (komutlar), tür yöneticisi, düzenlenebilir parametreler, geçersiz kılma, geri al | **Tamamlandı** (sürüm 0.4.0-b2a) |
| B2B | Akıllı duvar birleşimleri (L / T / X), katman önceliği, kata bağlı geometri, açıklık ilişkileri | Planlandı (aşağıda) |
| B3 | Bağımlılık grafiği, artımlı türetme (plan / 3D / kesit / metraj), genel kısıt çözücü | Planlanacak |
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
- Kolon / kiriş yüksekliği kata bağlanamaz (3D ve kesit bu elemanlarda açık değer bekler) — B2B.
- Yay duvar parçaları ayrı elemandır; türü parça parça atanır.
- Türler çizim kökünde (`meta.bimTypes`) durur: aynı projedeki iki çizim (rölöve / proje) türleri paylaşmaz.
- Açık kesit / görünüş penceresi değişiklikte kendiliğinden yenilenmez.
- Çok büyük planlarda değişiklik başına tam yeniden türetme (3500 elemanda ≈ 60 ms) — B3 artımlı türetme.

---

## B2B — Akıllı duvar birleşimleri (teknik plan)

Hedef: duvar uçlarının birbirini tanıması, kompozit katmanların birleşimde doğru temizlenmesi ve duvar hareketinde
bağlı elemanların (açıklık, mahal, birleşen duvarlar) tutarlı kalması. Yazma yine yalnız `commands.js` üzerinden;
birleşim bilgisi kayıtlara yazılmaz, her türetmede geometriden hesaplanır (tek kaynak ilkesi).

### B2B.1 Birleşim grafiği (L / T / X)
- `js/bim/joins.js`: kat başına uç nokta ızgara dizini (hücre = 2 × en kalın duvar). Her uç için yakın uçlar ve eksen
  üzerindeki gövdeler aranır. Sınıflar: **L** (iki uç, açı ≠ 180°), **I** (doğrusal devam), **T** (uç bir gövdeye
  değiyor), **X** (iki gövde kesişiyor), **serbest uç**. Tolerans: `V.eq` ile aynı 0,5 cm + kalınlığın yarısı.
- Çıktı: `{ id, kind, walls: [{ id, end: 'a'|'b'|'body', t }], at, angle }` ve BIM ilişkisi `joinedAt` (relations.js'e
  yeni tür; doğrulama: kopuk L, üst üste binen duvar, sıfır açı).
- Test: her birleşim türü için sentetik planlar, eski `plan-geom.js wallExt` sonuçlarıyla karşılaştırma.

### B2B.2 Merkez ve referans çizgileri
- `refLine`: `axis` | `face+` | `face-` (bugünkü `face` alanı) BIM parametresi olur; değiştirmek geometriyi taşımaz,
  yalnız referansı çevirir (komut: `setWallReference`). Kalınlık değişiminde referans yüz sabit kalır (B2A'da yüzden
  çizilmiş duvarlar için uygulandı; merkez dışı referansların tümüne genellenir).
- Birleşim noktası referans çizgilerinin kesişimiyle hesaplanır; plan ve kesit aynı noktayı kullanır.

### B2B.3 Kompozit katman öncelikleri
- `materials.js` kompozitlerine katman başına isteğe bağlı `prio` (0–9; varsayılan: taşıyıcı çekirdek 9, yalıtım 5,
  sıva / kaplama 1). Eski kompozitlerde `core` dizininden türetilir (veri yazılmaz).
- Birleşimde her katman çifti için öncelik karşılaştırılır: yüksek öncelikli katman sürer, düşük olan onun yüzünde biter
  (Archicad "katman önceliği" mantığı).

### B2B.4 Taşıyıcı çekirdek birleşimleri
- Taşıyıcı katmanlar (`core`) birleşimde birbirine kadar uzanır ve kesişim çokgeni birleştirilir; perde ↔ tuğla gibi
  farklı malzemeli çekirdekler bitişik kalır, taramalar ayrılır. Kolon ile duvar çekirdeği: kolon kesiti duvarı kırpar.

### B2B.5 Kaplama katmanlarının temizlenmesi
- `wallLayersSvg` ve kesit prizmaları her katmanı birleşim grafiğinden gelen uç kesim çizgileriyle kırpar
  (bugünkü dikdörtgen şeritler yerine çokgen). L köşede dış sıva sürekli döner, iç sıva köşede biter; T birleşimde
  bağlanan duvarın kaplaması ana duvarın yüzünde biter. Sonuç kat başına önbelleğe alınır (B3'te artımlı).

### B2B.6 Duvar hareketinde kapı / pencere ilişkileri
- Komutlar: `moveWallEnd`, `offsetWall`, `setWallLength`. Barındırılan açıklıklar göreli konumlarını korur
  (`pos` başlangıç ucuna göre; uzunluk kısalırsa sığmayan açıklık reddedilir ya da kullanıcı onayıyla kaydırılır).
- Birleşen duvar uçları birlikte taşınır (bugünkü `endsAt` davranışı komut katmanına alınır); mahal `boundedBy`
  sınırları ve `pts` yeniden üretilir (kapalı döngü bulma), kopukluk raporlanır.

### B2B.7 Kat yüksekliğine bağlı duvar geometrisi
- `top: { level: 'self' | 'next', offset }` ve `base: { level, offset }` (isteğe bağlı alanlar); `h` = türetilmiş.
  Üst kat döşemesi kalınlığı ve kat yüksekliği değişince bağlı duvar / kolon / kiriş yükseklikleri komutla güncellenir.
  Kolon ve kiriş için kat bağı (B2A sınırı) burada eklenir.

### B2B.8 Kesit / 3D uyumluluğu
- `sections.js` ve `plan3d.js` birleşimden kırpılmış katman çokgenlerini kullanır; L / T / X köşelerinde kesit ve
  3D'de çakışan hacim kalmaz (hacim metrajı çift sayılmaz). Kesit / görünüş penceresi editör değişiklik olayına abone
  olup kendini yeniler.

### B2B.9 Testler ve kabul
- Birim: birleşim sınıflandırması, öncelik tablosu, katman kırpma çokgenleri (alan korunumu), referans çizgisi,
  açıklık göreli konumu, kata bağlı yükseklik, mahal döngüsü; tüm komutlar için geri al / yinele birebir JSON.
- Uyumluluk: `eski-proje-v1` ve B2A ile kaydedilmiş dosyalar açılıp kaydedildiğinde B1 / B2A sürümlerinde açılabilir.
- Uçtan uca: köşede katman temizliği (2D SVG ve kesit), duvar ucunu sürükleyince açıklık ve mahalin izlemesi, 3D.
