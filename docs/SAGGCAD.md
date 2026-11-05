# SAGGCAD — mimari ve BIM yol haritası

## Katmanlar (OpenCAD Studio eklenti mimarisiyle aynı ayrım)
| Katman | SAGGCAD'de | Açıklama |
|---|---|---|
| A — Uygulama | OpenCAD Studio (iced arayüz, sahne, belge, geri al, komut satırı) | Yukarı akımdan; SAGGCAD yalnız BIM sekmesini ve komut dağıtımını ekler |
| B — Eklenti | yok | Eklentiler tarayıcıda çalışmadığı için BIM modülü uygulamaya derlenir |
| C — Alan motoru | `crates/saggcad_bim` | `std` dışında bağımlılık yok; masaüstü, WASM ve CLI'de aynı |

## XDATA biçimi (sürüm 1)
`SAGGCAD` uygulama adı altında, her biri `anahtar=değer` olan dizgiler (grup kodu 1000). Uzunluklar mm.
```
aks    v=1 tur=aks ad=A yon=letter
kolon  v=1 tur=kolon ad=S1 b=300 h=500 H=2800 mat=betonarme rb=none|min|manual [rb.n=12 rb.d=16 rb.sd=8 rb.sc=100 rb.s=150 rb.lc=500]
kiris  v=1 tur=kiris ad=K1 L=5000 b=250 h=500 mat=betonarme rb=… [rb.nt rb.dt rb.nb rb.db rb.sd rb.sc rb.s rb.lc]
perde  v=1 tur=perde ad=P1 L=4000 t=250 H=2800 mat=betonarme rb=… [rb.dv rb.sv rb.dh rb.sh]
doseme v=1 tur=doseme ad=D1 t=150 mat=betonarme rb=… [rb.dx rb.sx rb.dy rb.sy rb.top]
```
- `rb=none` donatı tanımsız (metraja girmez), `rb=min` yönetmelik minimumu (kesitten her seferinde yeniden hesaplanır),
  `rb=manual` statik projeden girilen değerler.
- Bilinmeyen anahtarlar korunur; `v` biçim sürümüdür.
- Düzlem ölçüleri nesnenin kendisinden (kapalı çoklu çizginin köşeleri) okunur; XDATA'daki `b/h/L/t` yalnız ilk
  değerdir. Yükseklik (`H`, kiriş `h`) XDATA'dadır.

## Donatı hesabı
`saggcad_bim::rebar` — önceki web sürümüyle (`arsiv/web: js/bim/rebar.js`) birebir aynı kurallar ve aynı test
değerleri: kolon 30×50 / H 280 → 10Ø14 + 23 etriye Ø8 = 54,397 kg;
kiriş 25×50×500 → üst 2Ø12, alt 3Ø12, 31 etriye; döşeme 500×400 / t 15 → Ø8/19, 21 + 27 çubuk; perde 400×25 / H 280 →
Ø10/25 iki yüz. "Minimum" her yerde tahmini olarak ayrı gösterilir.

## Yol haritası
1. **0.8 (tamamlandı)** — çatal, BIM sekmesi: aks sistemi, kolon (köşeden yerleştirme), donatı minimumu ve metrajı.
2. **0.9 (tamamlandı)** — kiriş, perde ve döşeme komutları (hiza: eksen / sol yüz / sağ yüz, zincirleme), elle donatı
   girişi (`SAGG_DONATIGIR`), tüm betonarme elemanlara minimum, CSV dışa aktarma, ölçülerin çizimden okunması.
3. **0.10 (tamamlandı)** — mimari elemanlar: `SAGG_DUVAR` (kalınlık, yükseklik, hiza, zincirleme), `SAGG_KAPI` /
   `SAGG_PENCERE` (duvarı seç → ölçüler → yer; kapıda kanadın açılacağı taraf; duvar boşluklar arasındaki dolu
   parçalara bölünür, tek geri al), `SAGG_MAHAL` (ad, numara, sınır → alan etiketi "A = 24,50 m²"). Başlangıç
   ekranındaki bağış / destekçi bölümleri ve bağış istemi kaldırıldı.
4. **0.11 (tamamlandı) — imar ön kontrolü** — `SAGG_PARSEL` (imar durumu: TAKS, KAKS, kat adedi + parsel sınırı),
   `SAGG_KAT` (brüt kat dış hattı, tip B/Z/N/C, tekrar), `SAGG_IMARVERI` (sığınak: oda sayısına göre konut BB adetleri,
   konut dışı alan; yağmur suyu: il yıllık yağışı, yüzey katsayısı), `SAGG_IMAR` (rapor). Hesaplar `saggcad_bim::imar`:
   - TAKS = zemin kat oturumu / parsel; emsal = Σ brüt kat × tekrar − emsal dışı mahaller (PAİY md. 22 başlıkları, mahal
     adından: sığınak, otopark, merdiven, asansör, teknik hacimler…), emsal dışı toplamı izin verilen emsalin %30'uyla sınırlı;
   - konut piyes asgari ölçüleri (PAİY md. 29): oturma 12 m² / 3,00 m, yatak 9 m² / 2,50 m, mutfak 3,30 m² / 1,50 m,
     banyo 3,00 m² / 1,50 m, tuvalet 1,20 m² / 1,00 m, hol / koridor 1,20 m; dar kenar en küçük çevreleyen dikdörtgenden
     (dikdörtgen olmayan mahalde yaklaşık olarak işaretlenir);
   - sığınak (Sığınak Yönetmeliği, RG 07.11.2025): kişi = 1 oda 2, 2 oda 3, 3+ oda 4; konut dışı alan / 20; kişi başına
     1 m², en az 20 m²; zorunluluk eşiği 10 konut BB;
   - yağmur suyu deposu (PAİY 57/A): çatı izdüşümü × yıllık yağış × katsayı; depo ≥ %6; zorunlu: (parsel > 2.000 m² ya
     da çatı > 1.000 m²) ve depo > 7 m³.
   Kaynaklarda birbirini tutmayan değerler (tuvalet ölçüsü, sığınak eşiğinin "10 ve üzeri" / "10'dan fazla" yorumu,
   %30 sınırının dayanağı) raporda "doğrulayın" notuyla gösterilir; girdi yoksa hesap yapılmaz ("VERİ EKSİK").
   Rapor bir ön kontroldür: plan notlarının, idarenin yerel imar yönetmeliğinin ve ruhsat incelemesinin yerini tutmaz.
5. **0.12 (tamamlandı) — imar kontrolü resmî metinlerden doğrulandı ve genişletildi.** Kaynak: mevzuat.gov.tr
   PAİY (7.5.23722, RG 1/7/2026 değişikliği dâhil), Sığınak Yönetmeliği (7.5.4883, RG 7/11/2025 dâhil), Otopark
   Yönetmeliği (7.5.24408). Her rapor satırı madde / fıkra / bent dayanağını taşır.
   - Düzeltmeler: tuvalet 1,00 m / 1,20 m² ve %30 sınırının dayanağı (md. 5/8, "parselin toplam emsale esas alanı")
     doğrulandı; sığınak eşiği 10 BB ve üzeri (md. 7/a), konut dışında 1500 m² (md. 7/b), karma kullanımda md. 7/c;
     "en az 20 m²" yalnız sanayi tesisleri içindir, konuttan kaldırıldı; emsal dışına yalnız gerekli asgari sığınak
     alanı sayılır (PAİY md. 22/1-g); merdiven evi, asansör boşluğu, teknik hacimler koşullarıyla (md. 20/8, 22/1).
   - Yeni: bahçe mesafeleri (md. 23: ön 5,00, yan / arka 3,00 + 4 katın üzerindeki her kat için 0,50; kat adedi
     toplam yükseklik / 3, 2,50 m'yi aşan artık 1 kat; plan notu değerleri girilebilir) — `SAGG_CEPHE` ile parsel
     kenarları ön / yan / arka işaretlenir; bina yüksekliği (Hmax) ve konut bölgesi kat yükseklikleri (md. 28);
     su deposu (md. 36); otopark (Otopark Yön. md. 8/3-4, 5/1-j; Ek-1 oranı kullanıcı girdisi — Ek-1 tablosu elimizdeki
     metinde yok); `SAGG_IMARCSV` ile rapor CSV olarak.
6. **BIM** — IFC / IFCX (OpenAEC `ifccad`; `opencaddocument` `ifcx` özelliği) dışa / içe aktarma, kat (level) yönetimi,
   3D BIM görünümü (OpenCAD Studio çekirdeğinin katı modellemesiyle ekstrüzyon), eleman türleri ve kompozit katmanlar.

## Yukarı akımla eşitleme
```
git fetch upstream
git merge upstream/main      # çakışma genelde yalnız README / iş akışlarında olur
cargo test -p saggcad_bim && cargo test -p OpenCADStudio --lib bim
```
