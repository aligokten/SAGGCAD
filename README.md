# SAGGCAD — FreeCAD / UniCAD tezgâhı

SAGGCAD, [FreeCAD](https://www.freecad.org) ve onun çatalı [UniCAD](https://github.com/UNITRONIX/UniCAD) üzerinde çalışan
bir **tezgâhtır (workbench)**: mimari rölöve, tadilat ve betonarme metraj işleri için FreeCAD'in BIM / Arch, Draft,
TechDraw ve Spreadsheet altyapısını kullanır. Geometri, 3D, IFC, paftalama ve dosya biçimi FreeCAD'indir; SAGGCAD
bunların üzerine meslek iş akışlarını ekler.

> **Önceki web uygulaması** (tarayıcıda çalışan SAGGCAD, 0.3 → 0.6.x: rölöve editörü, BIM çekirdeği, revizyon
> karşılaştırması, metraj, proje sürümleri, aks, donatı) `arsiv/web` dalında olduğu gibi saklanıyor. Oradaki hesap
> mantığı bu tezgâha adım adım taşınıyor — bkz. [docs/ROADMAP.md](docs/ROADMAP.md).

## Özellikler (0.7.0)
- **Aks sistemi…** — aralıkları yazarak (`4000 5000 4000`, `3x3500`) düşey (1, 2, 3…) ve yatay (A, B, C…) akslar;
  BIM *Axis* + *Axis System* nesneleri olarak oluşur, adlar belgedeki mevcut SAGGCAD akslarından devam eder.
- **Donatı tanımla…** — seçili betonarme kolon / kiriş / döşeme (BIM *Structure*: Column, Beam, Slab) ve beton
  malzemeli duvarlara (perde) Özellikler panelinde **SAGGCAD Donatı** grubu ekler. Kaynak:
  - **Statik projeden (elle)** — boyuna adet / çap, etriye çapı, sarılma ve orta aralık (kolon / kiriş); X / Y çap ve
    aralık, üst hasır (döşeme); düşey / yatay çap ve aralık (perde, iki yüz). Metraj kesindir. Yönetmelik sınırları
    dışındaki değerler uyarılır, değiştirilmez.
  - **Yönetmelik minimumu (yaklaşık)** — TS 500 / TBDY 2018 en az koşullarından ön tahmin (kolon %1 ve en az 4Ø14,
    kiriş 0,8·fctd/fyd ve 2Ø12, döşeme iki doğrultu toplam %0,35, perde gövdesi %0,25, sarılma bölgesi / aralık
    sınırları). Statik hesabın yerini tutmaz; her yerde "tahmini" olarak ayrı gösterilir.
  - **Tanımsız** — metraja girmez; program varsayım üretmez.
- **Tanımsızlara minimum donatı ata** — tek geri al adımı.
- **Donatı metrajı…** — eleman listesi, çap toplamları (m, kg, ton), beton m³ ve kg/m³; kesin ve tahmini ayrı
  sütunlarda; CSV (Excel TR) ve belgeye *Spreadsheet* tablosu; satıra çift tıkla → eleman seçilir.
- **Donatı hesap kuralları…** — beton / çelik sınıfı, paspayları, bindirme, büküm ve kanca boyları, ticari çubuk boyu
  (FreeCAD belgesinde saklanır).
- Çubuk boyları: kolon boyuna = kat yüksekliği + bindirme (üst kata filiz); kiriş boyuna = boy + iki uç bükümü;
  etriye = çekirdek çevresi + iki 135° kanca, adet sarılma bölgeleri + orta bölgeden; döşeme çubukları çokgen içinde
  paspayı kadar içeriden taranır; ticari boyu aşan çubukta her ek için bindirme. Kesme boyu ve fire eklenmez.

## Kurulum
FreeCAD 1.0 ya da UniCAD gerekir (BIM tezgâhı ile).

1. Bu depoyu FreeCAD'in kullanıcı `Mod` klasörüne kopyalayın ya da klonlayın:
   - Linux: `~/.local/share/FreeCAD/Mod/SAGGCAD`
   - Windows: `%APPDATA%\FreeCAD\Mod\SAGGCAD`
   - macOS: `~/Library/Application Support/FreeCAD/Mod/SAGGCAD`

   ```
   git clone https://github.com/aligokten/SAGGCAD ~/.local/share/FreeCAD/Mod/SAGGCAD
   ```
   (Klasörün tam yerini FreeCAD Python konsolunda `App.getUserAppDataDir()` gösterir.)
2. FreeCAD'i yeniden başlatın; tezgâh listesinden **SAGGCAD**'i seçin.
3. Modellemeyi BIM tezgâhında yapın (duvar, kolon, kiriş, döşeme, malzeme); aks ve donatı için SAGGCAD'e geçin.
   BIM komutları bu oturumda yüklendiyse SAGGCAD'in "Modelleme" araç çubuğunda da görünür.

## Yapı
```
InitGui.py, Init.py        FreeCAD tezgâh kaydı
package.xml                Addon Manager meta verisi
saggcad/core/              saf Python — FreeCAD gerektirmez (aks adlandırma / aks sistemi, donatı hesabı ve metrajı)
saggcad/fc/                FreeCAD bağlayıcıları (BIM nesnelerinden eleman okuma, donatı özellikleri, aks sistemi, tablo)
saggcad/gui/               komutlar ve iletişim pencereleri (PySide)
saggcad/resources/icons/   simgeler
tests/test_core_*.py       pytest — çekirdek (elle hesaplanmış beklenen değerler)
tests/freecad/             FreeCAD bütünleşik testi (freecadcmd ile, gerçek BIM nesneleri)
```

## Test
```
python -m pytest tests                               # çekirdek, FreeCAD'siz
freecadcmd tests/freecad/run_fc_tests.py             # FreeCAD içinde (depo kökünden); sonuç fc-results.json
python tests/freecad/check_results.py fc-results.json
```
CI her iki aşamayı da çalıştırır (FreeCAD conda-forge'dan kurulur).

## Lisans
Henüz belirlenmedi. FreeCAD eklentileri için yaygın ve FreeCAD ile uyumlu seçim LGPL-2.1-or-later'dır.
