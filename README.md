# SAGGCAD

**Tarayıcıda ve masaüstünde çalışan açık kaynak CAD ve BIM uygulaması.**
SAGGCAD, [OpenCAD Studio](https://github.com/HakanSeven12/OpenCADStudio)'nun (Rust, GPL-3.0) çatalıdır: DWG / DXF
desteği, 2D çizim, 3D katı modelleme, GPU görüntüleme ve WebAssembly sürümü OpenCAD Studio'dan gelir; SAGGCAD bunun
üzerine **BIM modülünü** (aks sistemi, betonarme elemanlar, donatı hesabı ve metrajı) ekler ve uygulamayı adım adım bir
BIM uygulamasına doğru geliştirir.

- **Web uygulaması:** https://aligokten.github.io/SAGGCAD/app/
- **Tanıtım sayfası:** https://aligokten.github.io/SAGGCAD/
- OpenCAD Studio'nun kendi belgesi: [docs/readme/README.opencadstudio.md](docs/readme/README.opencadstudio.md)

## BIM sekmesi (0.8)
| Komut | Ne yapar |
|---|---|
| `SAGG_AKS` | Aralıkları yazarak (`4000;5000`, `3x4000`) düşey 1, 2, 3… ve yatay A, B, C… aks sistemi; uçlarda baloncuk ve ad (S-AKS katmanı). Adlar mevcut akslardan devam eder. |
| `SAGG_KOLON` | Betonarme kolon: kesit (`300x500`), yükseklik, yerleştirme noktası (`M` merkez, `SA` sol alt, `GA` sağ alt, `GU` sağ üst, `SU` sol üst) — kolonun köşesi doğrudan aks kesişimine / köşeye oturur. Art arda yerleştirilir (S-KOLON katmanı). |
| `SAGG_DONATIMIN` | Donatısı tanımsız kolonlara yönetmelik minimumu (TS 500 / TBDY 2018 en az koşullarından **tahmini**). Tek geri al. |
| `SAGG_DONATI` | Donatı metrajı: çap toplamları (m, kg, ton), beton m³, kg/m³; statik projeden girilen (kesin) ve minimum (tahmini) ayrı. |

BIM verisi nesnelerin **XDATA**'sında (`SAGGCAD` uygulama adı, "anahtar=değer") saklanır: DWG / DXF kaydedip açınca
korunur; başka CAD programları nesneleri sıradan çizgi / çoklu çizgi olarak görür. Biçim: [docs/SAGGCAD.md](docs/SAGGCAD.md).

## Yapı
```
crates/saggcad_bim/     BIM çekirdeği — saf Rust, bağımlılıksız (WASM'da da çalışır): aks, kolon yerleşimi,
                        donatı hesabı / metrajı, XDATA şeması; birim testleri elle hesaplanmış değerlerle
src/modules/bim/        BIM şerit sekmesi ve komutları (SAGG_AKS, SAGG_KOLON)
src/app/commands/bim.rs komut dağıtımı, donatı raporu, SAGG_DONATIMIN; uygulama içi otomasyon testleri
saggcad-site/           tanıtım sayfası (GitHub Pages kökü)
```
Geri kalan her şey OpenCAD Studio'nundur; yukarı akım güncellemeleri `upstream` uzak deposundan birleştirilir
(`git fetch upstream && git merge upstream/main`).

## Geliştirme
```
cargo test -p saggcad_bim                 # BIM çekirdeği (saniyeler)
cargo test -p OpenCADStudio --lib bim     # uygulama içindeki BIM komut testleri
cargo run --release                       # masaüstü uygulama
trunk serve                               # web sürümü (rustup target add wasm32-unknown-unknown)
```

## Önceki sürümler
- `arsiv/web` — tarayıcıda çalışan ilk SAGGCAD (JavaScript): rölöve editörü, BIM çekirdeği, revizyon karşılaştırması,
  tadilat metrajı, proje sürümleri, aks, donatı.
- `arsiv/freecad` — FreeCAD / UniCAD tezgâhı (Python): aks sistemi, donatı metrajı.

Bu sürümlerdeki hesap mantığı Rust BIM çekirdeğine taşınıyor; donatı hesabı üç sürümde de aynı test değerlerini verir.

## Lisans
GPL-3.0 (OpenCAD Studio ile aynı) — [LICENSE](LICENSE). OpenCAD Studio © katkıcıları; SAGGCAD BIM modülü © SAGGCAD katkıcıları.
