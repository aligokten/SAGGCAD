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
```
- `rb=none` donatı tanımsız (metraja girmez), `rb=min` yönetmelik minimumu (kesitten her seferinde yeniden hesaplanır),
  `rb=manual` statik projeden girilen değerler.
- Bilinmeyen anahtarlar korunur; `v` biçim sürümüdür.
- Bilinen sınır (0.8): kolon ölçüleri XDATA'dan okunur; çoklu çizgi elle uzatılırsa metraj eski ölçüyle kalır
  (sonraki sürümde geometri ile eşitlenecek).

## Donatı hesabı
`saggcad_bim::rebar` — önceki web sürümüyle (`arsiv/web: js/bim/rebar.js`) birebir aynı kurallar ve aynı test
değerleri: kolon 30×50 / H 280 → 10Ø14 + 23 etriye Ø8 = 54,397 kg;
kiriş 25×50×500 → üst 2Ø12, alt 3Ø12, 31 etriye; döşeme 500×400 / t 15 → Ø8/19, 21 + 27 çubuk; perde 400×25 / H 280 →
Ø10/25 iki yüz. "Minimum" her yerde tahmini olarak ayrı gösterilir.

## Yol haritası
1. **0.8 (bu sürüm)** — çatal, BIM sekmesi: aks sistemi, kolon (köşeden yerleştirme), donatı minimumu ve metrajı.
2. **0.9** — kiriş (`SAGG_KIRIS`, aks / kolon yüzüne yaslı), perde ve döşeme komutları; elle donatı girişi için özellik
   paneli; metraj CSV dışa aktarma (web: indirme); geometri ↔ XDATA eşitleme.
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
