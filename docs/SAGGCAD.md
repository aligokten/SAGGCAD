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
1. **0.8 (bu sürüm)** — çatal, BIM sekmesi: aks sistemi, kolon (köşeden yerleştirme), donatı minimumu ve metrajı.
2. **0.9 (tamamlandı)** — kiriş, perde ve döşeme komutları (hiza: eksen / sol yüz / sağ yüz, zincirleme), elle donatı
   girişi (`SAGG_DONATIGIR`), tüm betonarme elemanlara minimum, CSV dışa aktarma, ölçülerin çizimden okunması.
2b. **sonraki küçük adım** — proje kuralları (beton / çelik sınıfı, paspayı) belgede; donatı için özellik paneli.
3. **0.10** — duvar / kapı / pencere BIM elemanları, mahal (oda) alanları, imalat metrajı tabloları; web sürümündeki
   (arsiv/web) rölöve editörü ve revizyon karşılaştırması mantığının taşınması.
4. **BIM** — IFC / IFCX (OpenAEC `ifccad`; `opencaddocument` `ifcx` özelliği) dışa / içe aktarma, kat (level) yönetimi,
   3D BIM görünümü (OpenCAD Studio çekirdeğinin katı modellemesiyle ekstrüzyon), eleman türleri ve kompozit katmanlar.

## Yukarı akımla eşitleme
```
git fetch upstream
git merge upstream/main      # çakışma genelde yalnız README / iş akışlarında olur
cargo test -p saggcad_bim && cargo test -p OpenCADStudio --lib bim
```
