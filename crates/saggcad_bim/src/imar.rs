//! İmar uygunluğu ön kontrolü — Planlı Alanlar İmar Yönetmeliği (PAİY, mevzuat.gov.tr 7.5.23722, RG 1/7/2026
//! değişikliği dâhil), Sığınak Yönetmeliği (7.5.4883, RG 7/11/2025 değişikliği dâhil) ve Otopark Yönetmeliği
//! (7.5.24408). Değerler bu resmî metinlerden alınmıştır; her kural kaynağını (madde / fıkra / bent) taşır.
//!
//! İlke: **ön kontrol, kesin hüküm değil.** Plan notu yönetmelikten farklı bir değer verebilir (girdi olarak alınır);
//! ölçü yaklaşık hesaplanıyorsa ya da hükmün koşulu çizimden anlaşılamıyorsa satır "doğrulayın" notu taşır.
//! Girdi eksikse hesap yapılmaz, "VERİ EKSİK" yazılır — hiçbir miktar varsayılarak üretilmez. Otopark Yönetmeliği
//! Ek-1 tablosu (kullanım başına otopark oranları) elimizdeki metinde yer almadığından oran kullanıcıdan alınır.
//!
//! Birimler: alanlar m², uzunluklar m, hacim m³, yağış mm (= L/m²). Çizimden gelen çokgenler mm'dir (`from_mm`).

use crate::room;
use std::collections::BTreeMap;

/// kural sabiti: değer + kaynak + (varsa) uygulama notu
#[derive(Clone, Debug, PartialEq)]
pub struct Kural {
    pub deger: f64,
    pub kaynak: &'static str,
    /// Some(not): hükmün koşulu / istisnası çizimden anlaşılamıyor — raporda "doğrulayın" olarak gösterilir
    pub dogrula: Option<&'static str>,
}

const fn k(deger: f64, kaynak: &'static str) -> Kural {
    Kural { deger, kaynak, dogrula: None }
}
const fn kd(deger: f64, kaynak: &'static str, not: &'static str) -> Kural {
    Kural { deger, kaynak, dogrula: Some(not) }
}

/// konut piyes asgari ölçüleri (PAİY md. 29/1): net alan m², dar kenar m
#[derive(Clone, Debug, PartialEq)]
pub struct Piyes {
    pub alan: Kural,
    pub dar_kenar: Kural,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Kurallar {
    pub oturma: Piyes,
    pub yatak: Piyes,
    pub mutfak: Piyes,
    pub banyo: Piyes,
    pub tuvalet: Piyes,
    /// hol ve koridor en az genişliği (m) — md. 29/3
    pub koridor: Kural,
    /// emsal harici alanların toplamı ≤ oran × parselin toplam emsale esas alanı — md. 5/8
    pub emsal_disi_oran: Kural,
    /// bahçe mesafeleri (plan notunda aksi yoksa) — md. 23/1-a, b, c
    pub on_bahce: Kural,
    pub yan_bahce: Kural,
    pub arka_bahce: Kural,
    /// yan / arka bahçe: 4 katın üzerindeki her kat için artış (m) — md. 23/1-ç
    pub bahce_artis: Kural,
    /// konut bölgesi en fazla kat yüksekliği (döşemeden döşemeye, m); bodrum hariç ≤ 3 katlı binada 4,00 — md. 28/1-c
    pub kat_yuk_konut: Kural,
    pub kat_yuk_konut_az_katli: Kural,
    /// sığınak: kişi başına en az net alan (m²) — Sığınak Yön. md. 8/a
    pub siginak_kisi_alan: Kural,
    /// konut dışı kullanımda kişi sayısı = emsale konu alan / bu sayı — md. 8/a
    pub siginak_diger_bolen: Kural,
    /// konut: 10'dan az bağımsız bölümde sığınak aranmaz — md. 7/a
    pub siginak_esik_bb: Kural,
    /// konut dışı: emsale konu alanı 1500 m²'den az olanlarda aranmaz — md. 7/b
    pub siginak_esik_diger: Kural,
    /// yağmur suyu: depo, yıllık toplanabilir suyun en az bu oranı — PAİY md. 57/7-a-1
    pub yagmur_oran: Kural,
    /// yağmur suyu zorunluluğu — md. 57/A-5-a
    pub yagmur_parsel_esik: Kural,
    pub yagmur_cati_esik: Kural,
    pub yagmur_hacim_esik: Kural,
    /// su deposu: 10 BB'ye kadar konut en az (m³) ve sonraki her BB için artış — md. 36/1-c, 36/2
    pub su_deposu_konut: Kural,
    pub su_deposu_artis: Kural,
    /// otopark: zorunlu adet bu sayı ve üzerindeyse en az %5 elektrikli araç şarjlı — Otopark Yön. md. 5/1-j
    pub otopark_sarj_esik: Kural,
    pub otopark_sarj_oran: Kural,
}

impl Default for Kurallar {
    fn default() -> Self {
        const P29: &str = "PAİY md. 29/1";
        const SY8: &str = "Sığınak Yön. md. 8/a";
        Kurallar {
            oturma: Piyes { alan: k(12.0, P29), dar_kenar: k(3.0, P29) },
            yatak: Piyes { alan: k(9.0, P29), dar_kenar: k(2.5, P29) },
            mutfak: Piyes { alan: k(3.3, P29), dar_kenar: k(1.5, P29) },
            banyo: Piyes { alan: k(3.0, P29), dar_kenar: k(1.5, P29) },
            tuvalet: Piyes { alan: k(1.2, P29), dar_kenar: k(1.0, P29) },
            koridor: k(1.2, "PAİY md. 29/3"),
            emsal_disi_oran: kd(
                0.30,
                "PAİY md. 5/8",
                "md. 5/8'de bu sınırın dışında tutulan alanlar (zorunlu yangın merdiveni ve korunumlu koridorun asgari alanı, ortak teras çatı, bahçede açık otopark, deprem yalıtım katı …) ayrıca değerlendirilmeli",
            ),
            on_bahce: k(5.0, "PAİY md. 23/1-a"),
            yan_bahce: k(3.0, "PAİY md. 23/1-b"),
            arka_bahce: k(3.0, "PAİY md. 23/1-c"),
            bahce_artis: k(0.5, "PAİY md. 23/1-ç"),
            kat_yuk_konut: k(3.6, "PAİY md. 28/1-c"),
            kat_yuk_konut_az_katli: k(4.0, "PAİY md. 28/1-c"),
            siginak_kisi_alan: k(1.0, SY8),
            siginak_diger_bolen: k(20.0, SY8),
            siginak_esik_bb: k(10.0, "Sığınak Yön. md. 7/a"),
            siginak_esik_diger: k(1500.0, "Sığınak Yön. md. 7/b"),
            yagmur_oran: k(0.06, "PAİY md. 57/7-a-1 (TS EN 16941-1 Ek A)"),
            yagmur_parsel_esik: k(2000.0, "PAİY md. 57/A-5-a"),
            yagmur_cati_esik: k(1000.0, "PAİY md. 57/A-5-a"),
            yagmur_hacim_esik: k(7.0, "PAİY md. 57/A-5-a"),
            su_deposu_konut: k(3.0, "PAİY md. 36/1-c"),
            su_deposu_artis: k(0.5, "PAİY md. 36/2"),
            otopark_sarj_esik: k(20.0, "Otopark Yön. md. 5/1-j"),
            otopark_sarj_oran: k(0.05, "Otopark Yön. md. 5/1-j"),
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum KatTip {
    Bodrum,
    Zemin,
    Normal,
    Cati,
}

impl KatTip {
    pub fn parse(s: &str) -> Option<KatTip> {
        match norm(s).as_str() {
            "B" | "BODRUM" => Some(KatTip::Bodrum),
            "Z" | "ZEMIN" => Some(KatTip::Zemin),
            "N" | "NORMAL" => Some(KatTip::Normal),
            "C" | "CATI" => Some(KatTip::Cati),
            _ => None,
        }
    }
    pub fn key(self) -> &'static str {
        match self {
            KatTip::Bodrum => "B",
            KatTip::Zemin => "Z",
            KatTip::Normal => "N",
            KatTip::Cati => "C",
        }
    }
    pub fn label(self) -> &'static str {
        match self {
            KatTip::Bodrum => "bodrum",
            KatTip::Zemin => "zemin",
            KatTip::Normal => "normal",
            KatTip::Cati => "çatı",
        }
    }
}

/// parsel kenarının türü (bahçe mesafesi için)
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Cephe {
    On,
    Yan,
    Arka,
}

impl Cephe {
    pub fn parse(s: &str) -> Option<Cephe> {
        match norm(s).as_str() {
            "O" | "ON" => Some(Cephe::On),
            "Y" | "YAN" => Some(Cephe::Yan),
            "A" | "ARKA" => Some(Cephe::Arka),
            _ => None,
        }
    }
    pub fn key(self) -> &'static str {
        match self {
            Cephe::On => "O",
            Cephe::Yan => "Y",
            Cephe::Arka => "A",
        }
    }
    pub fn label(self) -> &'static str {
        match self {
            Cephe::On => "ön",
            Cephe::Yan => "yan",
            Cephe::Arka => "arka",
        }
    }
}

/// mahal sınıfı (addan çıkarılır; rapor çıkarımı açıkça gösterir)
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Sinif {
    Oturma,
    Yatak,
    Mutfak,
    Banyo,
    Tuvalet,
    Koridor,
    /// PAİY md. 20/8 ya da md. 22/1 kapsamında olabilecek bir kullanım — anahtar sözcükle
    EmsalDisi(&'static str),
    Diger,
}

/// Türkçe büyük harfe çevir, aksanları kaldır (İ/ı → I, Ş → S …)
pub fn norm(s: &str) -> String {
    s.trim()
        .chars()
        .map(|c| match c {
            'ı' | 'i' | 'İ' | 'î' => 'I',
            'ş' | 'Ş' => 'S',
            'ğ' | 'Ğ' => 'G',
            'ü' | 'Ü' | 'û' => 'U',
            'ö' | 'Ö' => 'O',
            'ç' | 'Ç' => 'C',
            'â' | 'Â' => 'A',
            c => c.to_ascii_uppercase(),
        })
        .collect()
}

/// Mahal adında aranan anahtar sözcük → (etiket, dayanak, koşul notu). Koşullu olanlar raporda "doğrulayın" taşır.
const EMSAL_DISI: &[(&str, &str, &str, Option<&str>)] = &[
    ("SIGINAK", "sığınak", "PAİY md. 22/1-g", Some("yalnız bina için gerekli asgari sığınak alanı emsal dışıdır; fazlası emsale eklenir")),
    ("OTOPARK", "otopark", "PAİY md. 22/1-h", None),
    ("MERDIVEN", "merdiven evi", "PAİY md. 22/1-l", Some("merdiven evi, açık çıkma şartlı balkonlarla birlikte bağımsız bölüm net alanının %20'sini geçmemek kaydıyla emsal dışıdır")),
    ("ASANSOR", "asansör boşluğu", "PAİY md. 20/8-e, 22/1-a", Some("yalnız asgari ölçülerdeki, temele kadar inen asansör boşluğu")),
    ("ISI MERKEZI", "ısı merkezi", "PAİY md. 22/1-i", None),
    ("KAZAN", "kazan dairesi", "PAİY md. 22/1-i", None),
    ("YAKIT", "yakıt deposu", "PAİY md. 22/1-i", None),
    ("SU DEPOSU", "su deposu", "PAİY md. 22/1-i", None),
    ("SARNIC", "su sarnıcı", "PAİY md. 22/1-i", None),
    ("JENERATOR", "jeneratör", "PAİY md. 22/1-i", None),
    ("TRAFO", "trafo", "PAİY md. 22/1-i", None),
    ("HIDROFOR", "hidrofor", "PAİY md. 22/1-i", None),
    ("KOMURLUK", "kömürlük", "PAİY md. 22/1-i", None),
    ("TEKNIK", "teknik hacim", "PAİY md. 22/1-i", Some("yalnız bina / tesise ait ısıtma, soğutma, tesisat, havalandırma, enerji alanları")),
    ("COCUK OYUN", "çocuk oyun alanı", "PAİY md. 22/1-ğ", Some("ticari amaç içermeyen, ortak alan niteliğinde olmalı")),
    ("MESCIT", "mescit", "PAİY md. 22/1-e", Some("ortak alan niteliğinde olmalı")),
];

fn emsal_disi_kaydi(ad: &str) -> Option<&'static (&'static str, &'static str, &'static str, Option<&'static str>)> {
    let n = norm(ad);
    EMSAL_DISI.iter().find(|(anahtar, ..)| n.contains(anahtar))
}

pub fn sinif(ad: &str) -> Sinif {
    if let Some((_, etiket, ..)) = emsal_disi_kaydi(ad) {
        return Sinif::EmsalDisi(etiket);
    }
    let n = norm(ad);
    let has = |w: &str| n.contains(w);
    if has("OTURMA") || has("SALON") {
        Sinif::Oturma
    } else if has("YATAK") {
        Sinif::Yatak
    } else if has("MUTFAK") {
        Sinif::Mutfak
    } else if has("BANYO") || has("DUS") || has("YIKANMA") {
        Sinif::Banyo
    } else if has("WC") || has("TUVALET") {
        Sinif::Tuvalet
    } else if has("KORIDOR") || has("HOL") {
        Sinif::Koridor
    } else {
        Sinif::Diger
    }
}

/// parsel ve imar durumu (izinler `None` ise o kontrol "veri eksik")
#[derive(Clone, Debug, PartialEq, Default)]
pub struct Parsel {
    pub poly: Vec<[f64; 2]>,
    pub taks: Option<f64>,
    pub kaks: Option<f64>,
    pub kat_adedi: Option<u32>,
    /// plan notundaki bina yüksekliği (Hmax, m)
    pub hmax: Option<f64>,
    /// plan notunda yönetmelikten farklı bahçe mesafesi verilmişse (m)
    pub on: Option<f64>,
    pub yan: Option<f64>,
    pub arka: Option<f64>,
    /// parsel kenarlarının türü (kenar i: poly[i] → poly[i+1]); None: işaretlenmemiş
    pub kenarlar: Vec<Option<Cephe>>,
    /// sığınak girdileri: oda sayısına göre konut bağımsız bölüm adetleri (1, 2, 3+ odalı)
    pub bb: Option<[u32; 3]>,
    /// konut dışı kullanımların emsale konu alanı (m²)
    pub diger_alan: Option<f64>,
    /// yağmur suyu girdileri: il yıllık ortalama yağış (mm) ve çatı yüzey / toplam verim katsayısı
    pub yagis_mm: Option<f64>,
    pub yuzey_katsayi: Option<f64>,
    /// otopark: Ek-1'e göre esas alan (konutta BB brüt alanı, diğerlerinde emsal alanı, m²) ve "1 araç / … m²" oranı
    pub otopark_alan: Option<f64>,
    pub otopark_oran: Option<f64>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Kat {
    pub ad: String,
    pub tip: KatTip,
    /// aynı katın tekrar sayısı (ör. 4 normal kat)
    pub tekrar: u32,
    /// kat yüksekliği, döşemeden döşemeye (m); girilmemişse None
    pub yukseklik: Option<f64>,
    /// brüt kat dış hattı (m)
    pub poly: Vec<[f64; 2]>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Mahal {
    pub ad: String,
    pub no: String,
    /// net mahal çokgeni (m)
    pub poly: Vec<[f64; 2]>,
}

/// mm çokgen → m
pub fn from_mm(pts: &[[f64; 2]]) -> Vec<[f64; 2]> {
    pts.iter().map(|p| [p[0] / 1000.0, p[1] / 1000.0]).collect()
}

/// dar kenar: en küçük alanlı çevreleyen dikdörtgenin kısa kenarı. İkinci değer: çokgen dikdörtgen mi (değilse
/// dar kenar yaklaşıktır ve raporda öyle belirtilir).
pub fn dar_kenar(poly: &[[f64; 2]]) -> (f64, bool) {
    let n = poly.len();
    if n < 3 {
        return (0.0, false);
    }
    let mut best: Option<(f64, f64)> = None; // (alan, kısa kenar)
    for i in 0..n {
        let (a, b) = (poly[i], poly[(i + 1) % n]);
        let (dx, dy) = (b[0] - a[0], b[1] - a[1]);
        let l = (dx * dx + dy * dy).sqrt();
        if l < 1e-9 {
            continue;
        }
        let (ux, uy) = (dx / l, dy / l);
        let (mut u0, mut u1, mut v0, mut v1) = (f64::MAX, f64::MIN, f64::MAX, f64::MIN);
        for p in poly {
            let u = p[0] * ux + p[1] * uy;
            let v = -p[0] * uy + p[1] * ux;
            u0 = u0.min(u);
            u1 = u1.max(u);
            v0 = v0.min(v);
            v1 = v1.max(v);
        }
        let (w, h) = (u1 - u0, v1 - v0);
        let area = w * h;
        if best.map_or(true, |(ba, _)| area < ba - 1e-12) {
            best = Some((area, w.min(h)));
        }
    }
    let (rect_area, short) = best.unwrap_or((0.0, 0.0));
    let is_rect = n == 4 && (room::area(poly) - rect_area).abs() <= 1e-6 * rect_area.max(1.0);
    (short, is_rect)
}

/// noktanın doğru parçasına uzaklığı
fn nokta_parca(p: [f64; 2], a: [f64; 2], b: [f64; 2]) -> f64 {
    let (dx, dy) = (b[0] - a[0], b[1] - a[1]);
    let l2 = dx * dx + dy * dy;
    let t = if l2 < 1e-18 { 0.0 } else { (((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2).clamp(0.0, 1.0) };
    ((p[0] - a[0] - t * dx).powi(2) + (p[1] - a[1] - t * dy).powi(2)).sqrt()
}

fn kesisir(a: [f64; 2], b: [f64; 2], c: [f64; 2], d: [f64; 2]) -> bool {
    let cr = |o: [f64; 2], p: [f64; 2], q: [f64; 2]| (p[0] - o[0]) * (q[1] - o[1]) - (p[1] - o[1]) * (q[0] - o[0]);
    let (d1, d2, d3, d4) = (cr(c, d, a), cr(c, d, b), cr(a, b, c), cr(a, b, d));
    ((d1 > 0.0) != (d2 > 0.0)) && ((d3 > 0.0) != (d4 > 0.0))
}

/// doğru parçası ile çokgen arasındaki en kısa uzaklık (kesişiyorsa 0)
pub fn parca_cokgen(a: [f64; 2], b: [f64; 2], poly: &[[f64; 2]]) -> f64 {
    let n = poly.len();
    let mut d = f64::MAX;
    for i in 0..n {
        let (p, q) = (poly[i], poly[(i + 1) % n]);
        if kesisir(a, b, p, q) {
            return 0.0;
        }
        d = d.min(nokta_parca(p, a, b)).min(nokta_parca(a, p, q)).min(nokta_parca(b, p, q));
    }
    d
}

/// noktaya en yakın parsel kenarının indisi (kenar i: poly[i] → poly[i+1])
pub fn en_yakin_kenar(poly: &[[f64; 2]], p: [f64; 2]) -> Option<usize> {
    let n = poly.len();
    (0..n)
        .map(|i| (i, nokta_parca(p, poly[i], poly[(i + 1) % n])))
        .min_by(|x, y| x.1.partial_cmp(&y.1).unwrap_or(std::cmp::Ordering::Equal))
        .map(|(i, _)| i)
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Durum {
    Uygun,
    Aykiri,
    /// hesap için gerekli girdi yok
    VeriEksik,
    /// zorunluluk / bilgi satırı (uygunluk değil)
    Bilgi,
}

impl Durum {
    pub fn label(self) -> &'static str {
        match self {
            Durum::Uygun => "UYGUN",
            Durum::Aykiri => "AYKIRI",
            Durum::VeriEksik => "VERİ EKSİK",
            Durum::Bilgi => "BİLGİ",
        }
    }
}

/// rapor satırı
#[derive(Clone, Debug, PartialEq)]
pub struct Satir {
    pub baslik: String,
    pub durum: Durum,
    pub aciklama: String,
    pub kaynak: String,
    /// doğrulama notu (hükmün koşulu çizimden anlaşılamıyor; ya da ölçü yaklaşık)
    pub dogrula: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Default)]
pub struct Rapor {
    pub parsel_alan: f64,
    pub taban_alan: Option<f64>,
    pub brut_toplam: f64,
    pub emsal_disi: f64,
    pub emsal_alan: f64,
    pub satirlar: Vec<Satir>,
}

fn m2(v: f64) -> String {
    format!("{v:.2}").replace('.', ",")
}

fn satir(baslik: impl Into<String>, durum: Durum, aciklama: impl Into<String>, kural: Option<&Kural>) -> Satir {
    Satir {
        baslik: baslik.into(),
        durum,
        aciklama: aciklama.into(),
        kaynak: kural.map(|k| k.kaynak.to_string()).unwrap_or_default(),
        dogrula: kural.and_then(|k| k.dogrula.map(str::to_string)),
    }
}

fn not_ekle(row: &mut Satir, not: &str) {
    row.dogrula = Some(match row.dogrula.take() {
        Some(d) => format!("{d}; {not}"),
        None => not.to_string(),
    });
}

/// mahalin bulunduğu kat: etiket noktası kat dış hattının içinde kalan ilk kat
fn kat_of<'a>(m: &Mahal, katlar: &'a [Kat]) -> Option<&'a Kat> {
    let p = room::label_point(&m.poly);
    katlar.iter().find(|k| room::contains(&k.poly, p))
}

/// sığınak hesabı (Sığınak Yön. md. 7, 8): (gerekli mi, kişi, gerekli alan, açıklama)
struct Siginak {
    gerekli: Option<bool>,
    kisi: f64,
    alan: f64,
    aciklama: String,
}

fn siginak(parsel: &Parsel, emsal_alan: Option<f64>, r: &Kurallar) -> Option<Siginak> {
    if parsel.bb.is_none() && parsel.diger_alan.is_none() {
        return None;
    }
    let bb = parsel.bb.unwrap_or([0, 0, 0]);
    let toplam_bb = bb[0] + bb[1] + bb[2];
    let kisi_konut = (bb[0] * 2 + bb[1] * 3 + bb[2] * 4) as f64;
    let diger = parsel.diger_alan.filter(|a| *a > 0.0);
    let kisi_diger = diger.map_or(0.0, |a| a / r.siginak_diger_bolen.deger);
    let kisi = kisi_konut + kisi_diger;
    let esik_bb = r.siginak_esik_bb.deger as u32;
    let esik_d = r.siginak_esik_diger.deger;
    let (gerekli, neden) = match (toplam_bb, diger) {
        (n, None) => {
            if n >= esik_bb {
                (Some(true), format!("yalnız konut, {n} bağımsız bölüm ≥ {esik_bb} → sığınak gerekir (md. 7/a)"))
            } else {
                (Some(false), format!("yalnız konut, {n} bağımsız bölüm < {esik_bb} → sığınak aranmaz (md. 7/a)"))
            }
        }
        (0, Some(a)) => {
            if a >= esik_d {
                (Some(true), format!("konut dışı, emsale konu alan {} m² ≥ {} → sığınak gerekir (md. 7/b; resmi binalarda sınır 1000 m²)", m2(a), m2(esik_d)))
            } else {
                (Some(false), format!("konut dışı, emsale konu alan {} m² < {} → sığınak aranmaz (md. 7/b; resmi binalarda sınır 1000 m²)", m2(a), m2(esik_d)))
            }
        }
        (n, Some(_)) => match emsal_alan {
            Some(e) if n < esik_bb && e < esik_d => (Some(false), format!("karma: konut {n} BB < {esik_bb} ve binanın emsal alanı {} m² < {} → sığınak aranmaz (md. 7/c)", m2(e), m2(esik_d))),
            Some(e) => (Some(true), format!("karma: konut {n} BB, binanın emsal alanı {} m² → sığınak gerekir (md. 7/c)", m2(e))),
            None if n >= esik_bb => (Some(true), format!("karma: konut {n} BB ≥ {esik_bb} → sığınak gerekir (md. 7/c)")),
            None => (None, "karma kullanım: muafiyet için binanın emsal alanı gerekir (kat dış hatları çizilmemiş)".to_string()),
        },
    };
    let alan = kisi * r.siginak_kisi_alan.deger;
    let mut aciklama = format!("{neden}. Kişi: 1 oda {}×2 + 2 oda {}×3 + 3+ oda {}×4 = {}", bb[0], bb[1], bb[2], kisi_konut);
    if let Some(a) = diger {
        aciklama.push_str(&format!(" + konut dışı {} m² / {} = {}", m2(a), r.siginak_diger_bolen.deger, m2(kisi_diger)));
    }
    aciklama.push_str(&format!(" → en az net {} m² (tuvalet, duş, mutfak nişi hariç)", m2(alan)));
    Some(Siginak { gerekli, kisi, alan, aciklama })
}

pub fn hesapla(parsel: &Parsel, katlar: &[Kat], mahaller: &[Mahal], r: &Kurallar) -> Rapor {
    let mut rap = Rapor { parsel_alan: room::area(&parsel.poly), ..Default::default() };
    let pa = rap.parsel_alan;
    let ust_katlar: Vec<&Kat> = katlar.iter().filter(|k| matches!(k.tip, KatTip::Zemin | KatTip::Normal)).collect();

    // ---- TAKS: zemin kat oturumu / parsel alanı (md. 5/5: net imar parseli üzerinden)
    let zemin: Vec<&Kat> = katlar.iter().filter(|k| k.tip == KatTip::Zemin).collect();
    rap.taban_alan = (!zemin.is_empty()).then(|| zemin.iter().map(|k| room::area(&k.poly)).fold(0.0, f64::max));
    match (rap.taban_alan, parsel.taks) {
        (Some(ta), Some(taks)) if pa > 0.0 => {
            let izin = pa * taks;
            let d = if ta <= izin + 1e-6 { Durum::Uygun } else { Durum::Aykiri };
            let mut row = satir(
                "TAKS",
                d,
                format!("taban alanı {} m² / parsel {} m² = {:.3} (izin {:.2} → en çok {} m²)", m2(ta), m2(pa), ta / pa, taks, m2(izin)),
                Some(&k(taks, "imar durumu (plan notu); PAİY md. 5/5")),
            );
            not_ekle(&mut row, "taban alanına dâhil edilmeyen kullanımlar (md. 20/8: asgari asansör boşluğu, ışıklık, şaft …) zemin kat dış hattından düşülmedi");
            rap.satirlar.push(row);
        }
        (None, _) => rap.satirlar.push(satir("TAKS", Durum::VeriEksik, "zemin kat dış hattı (SAGG_KAT, tip Z) çizilmemiş", None)),
        (_, None) => rap.satirlar.push(satir(
            "TAKS",
            Durum::VeriEksik,
            "imar durumunda TAKS girilmemiş (SAGG_PARSEL). Plan TAKS vermiyorsa ayrık / blok nizamda md. 5/6'ya göre en çok %40",
            None,
        )),
        _ => rap.satirlar.push(satir("TAKS", Durum::VeriEksik, "parsel alanı sıfır", None)),
    }

    // ---- sığınak ihtiyacı (emsal dışı sığınak payı için önce)
    let sig_on = siginak(parsel, None, r);

    // ---- emsal (KAKS): Σ brüt kat × tekrar − emsal dışı mahaller (üst sınırlı)
    rap.brut_toplam = katlar.iter().filter(|k| k.tip != KatTip::Cati).map(|k| room::area(&k.poly) * k.tekrar as f64).sum();
    let mut disi_kalemler: Vec<String> = Vec::new();
    let mut kosullu: Vec<String> = Vec::new();
    let mut siginak_cizilen = 0.0;
    for m in mahaller {
        if let Some((_, etiket, kaynak, kosul)) = emsal_disi_kaydi(&m.ad) {
            let tekrar = kat_of(m, katlar).map_or(1, |k| k.tekrar) as f64;
            let a = room::area(&m.poly) * tekrar;
            if *etiket == "sığınak" {
                siginak_cizilen += a;
                continue;
            }
            rap.emsal_disi += a;
            disi_kalemler.push(format!("{} {} ({etiket}, {kaynak}) {} m²", m.no, m.ad, m2(a)));
            if let Some(c) = kosul {
                kosullu.push(format!("{etiket}: {c}"));
            }
        }
    }
    if siginak_cizilen > 0.0 {
        // md. 22/1-g: yalnız bina için gerekli asgari sığınak alanı emsal dışı
        let sayilan = match &sig_on {
            Some(s) if s.gerekli == Some(true) => siginak_cizilen.min(s.alan),
            Some(s) if s.gerekli == Some(false) => 0.0,
            _ => siginak_cizilen,
        };
        rap.emsal_disi += sayilan;
        disi_kalemler.push(format!("sığınak {} m² çizili, emsal dışı sayılan {} m² (PAİY md. 22/1-g)", m2(siginak_cizilen), m2(sayilan)));
        if sig_on.as_ref().map_or(true, |s| s.gerekli.is_none()) {
            kosullu.push("sığınak: gerekli asgari alan bilinmiyor (SAGG_IMARVERI); çizilenin tamamı emsal dışı sayıldı".into());
        }
    }
    match (katlar.is_empty(), parsel.kaks) {
        (true, _) => rap.satirlar.push(satir("Emsal (KAKS)", Durum::VeriEksik, "kat dış hatları (SAGG_KAT) çizilmemiş", None)),
        (false, None) => {
            rap.emsal_alan = rap.brut_toplam - rap.emsal_disi;
            rap.satirlar.push(satir("Emsal (KAKS)", Durum::VeriEksik, format!("imar durumunda KAKS girilmemiş; hesaplanan emsal alanı {} m²", m2(rap.emsal_alan)), None));
        }
        (false, Some(kaks)) => {
            let izin = pa * kaks;
            let sinir = izin * r.emsal_disi_oran.deger;
            let sayilan = rap.emsal_disi.min(sinir);
            rap.emsal_alan = rap.brut_toplam - sayilan;
            if rap.emsal_disi > 0.0 {
                let asti = rap.emsal_disi > sinir + 1e-6;
                let mut row = satir(
                    "Emsal dışı alan sınırı",
                    if asti { Durum::Aykiri } else { Durum::Uygun },
                    if asti {
                        format!("emsal dışı {} m² > %{:.0} × {} m² = {} m²; aşan {} m² emsale eklendi — {}", m2(rap.emsal_disi), r.emsal_disi_oran.deger * 100.0, m2(izin), m2(sinir), m2(rap.emsal_disi - sinir), disi_kalemler.join("; "))
                    } else {
                        format!("emsal dışı {} m² ≤ %{:.0} × {} m² = {} m² — {}", m2(rap.emsal_disi), r.emsal_disi_oran.deger * 100.0, m2(izin), m2(sinir), disi_kalemler.join("; "))
                    },
                    Some(&r.emsal_disi_oran),
                );
                for c in &kosullu {
                    not_ekle(&mut row, c);
                }
                rap.satirlar.push(row);
            }
            let d = if rap.emsal_alan <= izin + 1e-6 { Durum::Uygun } else { Durum::Aykiri };
            rap.satirlar.push(satir(
                "Emsal (KAKS)",
                d,
                format!(
                    "emsal alanı {} m² (brüt {} − emsal dışı {}) / parsel {} m² = {:.3} (izin {:.2} → en çok {} m²)",
                    m2(rap.emsal_alan),
                    m2(rap.brut_toplam),
                    m2(sayilan),
                    m2(pa),
                    if pa > 0.0 { rap.emsal_alan / pa } else { 0.0 },
                    kaks,
                    m2(izin)
                ),
                Some(&k(kaks, "imar durumu (plan notu); PAİY md. 21")),
            ));
        }
    }

    // ---- kat adedi: zemin + normal katlar (tekrarlarıyla)
    let kat_say: u32 = ust_katlar.iter().map(|k| k.tekrar).sum();
    match parsel.kat_adedi {
        Some(izin) if !katlar.is_empty() => rap.satirlar.push(satir(
            "Kat adedi",
            if kat_say <= izin { Durum::Uygun } else { Durum::Aykiri },
            format!("zemin + normal {kat_say} kat (izin {izin})"),
            Some(&k(izin as f64, "imar durumu (plan notu)")),
        )),
        Some(_) => rap.satirlar.push(satir("Kat adedi", Durum::VeriEksik, "kat dış hatları çizilmemiş", None)),
        None => {}
    }

    // ---- bina yüksekliği ve kat yükseklikleri (md. 4/n, md. 28)
    let yuk_bilinen = !ust_katlar.is_empty() && ust_katlar.iter().all(|k| k.yukseklik.is_some());
    let bina_h = yuk_bilinen.then(|| ust_katlar.iter().map(|k| k.yukseklik.unwrap_or(0.0) * k.tekrar as f64).sum::<f64>());
    match (bina_h, parsel.hmax) {
        (Some(h), Some(hmax)) => {
            let mut row = satir(
                "Bina yüksekliği",
                if h <= hmax + 1e-6 { Durum::Uygun } else { Durum::Aykiri },
                format!("zemin + normal kat yükseklikleri toplamı {} m (Hmax {} m)", m2(h), m2(hmax)),
                Some(&k(hmax, "imar durumu (plan notu); PAİY md. 4/n")),
            );
            not_ekle(&mut row, "yaklaşık: bina yüksekliği kot alınan noktadan saçak seviyesine ölçülür; burada kat yükseklikleri toplandı");
            rap.satirlar.push(row);
        }
        (None, Some(_)) if !ust_katlar.is_empty() => {
            rap.satirlar.push(satir("Bina yüksekliği", Durum::VeriEksik, "zemin / normal katların kat yüksekliği girilmemiş (SAGG_KAT)", None));
        }
        _ => {}
    }
    if yuk_bilinen {
        // bodrum hariç 3 katı geçmeyen binalarda 4,00 m, diğerlerinde 3,60 m (konut bölgesi)
        let sinir = if kat_say <= 3 { &r.kat_yuk_konut_az_katli } else { &r.kat_yuk_konut };
        let asan: Vec<String> = ust_katlar
            .iter()
            .filter(|k| k.yukseklik.unwrap_or(0.0) > sinir.deger + 1e-6)
            .map(|k| format!("{} {} m", k.ad, m2(k.yukseklik.unwrap_or(0.0))))
            .collect();
        let mut row = satir(
            "Kat yükseklikleri",
            Durum::Bilgi,
            if asan.is_empty() {
                format!("tüm zemin / normal katlar ≤ {} m (konut bölgesi sınırı)", m2(sinir.deger))
            } else {
                format!("konut bölgesi sınırı {} m'yi aşan katlar: {}", m2(sinir.deger), asan.join(", "))
            },
            Some(sinir),
        );
        not_ekle(&mut row, "bu sınır konut bölgesi içindir; ticaret / karma bölgelerde md. 28/1-a, b, ç farklı değerler verir; plan notu daha fazlasını belirleyebilir");
        rap.satirlar.push(row);
    }

    // ---- bahçe (çekme) mesafeleri (md. 23)
    let bina_dis: Vec<&Kat> = katlar.iter().filter(|k| k.tip != KatTip::Bodrum).collect();
    let isaretli = parsel.kenarlar.iter().any(Option::is_some);
    if !isaretli {
        rap.satirlar.push(satir("Bahçe mesafeleri", Durum::VeriEksik, "parsel kenarları ön / yan / arka olarak işaretlenmemiş (SAGG_CEPHE)", None));
    } else if bina_dis.is_empty() {
        rap.satirlar.push(satir("Bahçe mesafeleri", Durum::VeriEksik, "zemin üstü kat dış hatları (SAGG_KAT) çizilmemiş", None));
    } else {
        // md. 23/1-d: yan / arka için kat adedi = toplam yükseklik / 3, 2,50 m'yi aşan artık 1 kat; yükseklik yoksa kat sayısı
        let (n_kat, n_not) = match bina_h {
            Some(h) => {
                let tam = (h / 3.0).floor();
                let artik = h - tam * 3.0;
                ((tam as u32) + u32::from(artik > 2.5 + 1e-9), format!("kat adedi {} m / 3 ile", m2(h)))
            }
            None => (kat_say, "kat yüksekliği girilmediği için kat adedi zemin + normal kat sayısından (yaklaşık)".to_string()),
        };
        let artis = r.bahce_artis.deger * n_kat.saturating_sub(4) as f64;
        let n = parsel.poly.len();
        for (i, c) in parsel.kenarlar.iter().enumerate() {
            let Some(c) = c else { continue };
            if i >= n {
                continue;
            }
            let (a, b) = (parsel.poly[i], parsel.poly[(i + 1) % n]);
            let mesafe = bina_dis.iter().map(|k| parca_cokgen(a, b, &k.poly)).fold(f64::MAX, f64::min);
            let (plan, kural) = match c {
                Cephe::On => (parsel.on, &r.on_bahce),
                Cephe::Yan => (parsel.yan, &r.yan_bahce),
                Cephe::Arka => (parsel.arka, &r.arka_bahce),
            };
            let (gerek, kaynak_metin, kural_ref): (f64, String, Kural) = match plan {
                Some(v) => (v, "plan notu".into(), k(v, "imar durumu (plan notu)")),
                None if *c == Cephe::On => (kural.deger, kural.kaynak.into(), kural.clone()),
                None => (kural.deger + artis, format!("{} + {} ({n_not}: {n_kat} kat)", kural.kaynak, r.bahce_artis.kaynak), kural.clone()),
            };
            let mut row = satir(
                format!("Bahçe mesafesi — kenar {} ({})", i + 1, c.label()),
                if mesafe + 1e-6 >= gerek { Durum::Uygun } else { Durum::Aykiri },
                format!("binanın kenara en yakın uzaklığı {} m (en az {} m; {kaynak_metin})", m2(mesafe), m2(gerek)),
                Some(&kural_ref),
            );
            if bina_h.map_or(kat_say > 18, |h| h >= 60.5) {
                not_ekle(&mut row, "yükseklik 60,50 m ve üzerinde olabilir: md. 23/1-g'ye göre en az 15,00 m (bu sürüm hesaplamaz)");
            }
            rap.satirlar.push(row);
        }
    }

    // ---- mahal asgari ölçüleri (konut, PAİY md. 29)
    for m in mahaller {
        let s = sinif(&m.ad);
        let p = match s {
            Sinif::Oturma => &r.oturma,
            Sinif::Yatak => &r.yatak,
            Sinif::Mutfak => &r.mutfak,
            Sinif::Banyo => &r.banyo,
            Sinif::Tuvalet => &r.tuvalet,
            Sinif::Koridor => {
                let (w, rect) = dar_kenar(&m.poly);
                let ok = w + 1e-6 >= r.koridor.deger;
                let mut row = satir(
                    format!("{} {} (hol / koridor)", m.no, m.ad),
                    if ok { Durum::Uygun } else { Durum::Aykiri },
                    format!("genişlik {:.2} m (en az {:.2} m)", w, r.koridor.deger),
                    Some(&r.koridor),
                );
                if !rect {
                    not_ekle(&mut row, "dikdörtgen olmayan mahal: genişlik en küçük çevreleyen dikdörtgenden yaklaşık");
                }
                rap.satirlar.push(row);
                continue;
            }
            _ => continue,
        };
        let a = room::area(&m.poly);
        let (w, rect) = dar_kenar(&m.poly);
        let ok = a + 1e-6 >= p.alan.deger && w + 1e-6 >= p.dar_kenar.deger;
        let tur = match s {
            Sinif::Oturma => "oturma odası",
            Sinif::Yatak => "yatak odası",
            Sinif::Mutfak => "mutfak",
            Sinif::Banyo => "banyo / yıkanma yeri",
            _ => "tuvalet",
        };
        let mut row = satir(
            format!("{} {} ({tur})", m.no, m.ad),
            if ok { Durum::Uygun } else { Durum::Aykiri },
            format!("net {} m² (en az {}), dar kenar {:.2} m (en az {:.2})", m2(a), m2(p.alan.deger), w, p.dar_kenar.deger),
            Some(&p.alan),
        );
        if !rect {
            not_ekle(&mut row, "dikdörtgen olmayan mahal: dar kenar en küçük çevreleyen dikdörtgenden yaklaşık");
        }
        rap.satirlar.push(row);
    }

    // ---- sığınak (karma kullanımda emsal alanı da gerekir)
    let emsal_bilinen = (!katlar.is_empty()).then_some(rap.emsal_alan);
    match siginak(parsel, emsal_bilinen, r) {
        None => rap.satirlar.push(satir("Sığınak", Durum::VeriEksik, "konut bağımsız bölüm adetleri / konut dışı alan girilmemiş (SAGG_IMARVERI)", None)),
        Some(s) => {
            let (durum, ek) = match s.gerekli {
                Some(true) if siginak_cizilen + 1e-6 < s.alan => (Durum::Aykiri, format!("; çizimdeki sığınak {} m² yetersiz", m2(siginak_cizilen))),
                Some(true) => (Durum::Uygun, format!("; çizimdeki sığınak {} m²", m2(siginak_cizilen))),
                Some(false) => (Durum::Bilgi, String::new()),
                None => (Durum::VeriEksik, String::new()),
            };
            let _ = s.kisi;
            rap.satirlar.push(satir("Sığınak", durum, format!("{}{ek}", s.aciklama), Some(&r.siginak_kisi_alan)));
        }
    }

    // ---- su deposu (md. 36) — konut
    if let Some(bb) = parsel.bb {
        let n = bb[0] + bb[1] + bb[2];
        if n > 0 {
            let v = r.su_deposu_konut.deger + r.su_deposu_artis.deger * n.saturating_sub(10) as f64;
            let mut row = satir(
                "Su deposu",
                Durum::Bilgi,
                format!("{n} bağımsız bölümlü konut: en az {} m³ (10 BB'ye kadar {} m³, sonraki her BB için +{} m³)", m2(v), m2(r.su_deposu_konut.deger), m2(r.su_deposu_artis.deger)),
                Some(&r.su_deposu_konut),
            );
            not_ekle(&mut row, "yüksek katlı yapılarda en az 15 m³, çok yüksek yapılarda 30 m³ (md. 36/1-a, b); hacim günlük su ihtiyacı ve yangın söndürme sistemine göre belirlenir");
            rap.satirlar.push(row);
        }
    }

    // ---- yağmur suyu deposu (PAİY 57/A-5, 57/7-a-1)
    let cati = katlar
        .iter()
        .filter(|k| k.tip == KatTip::Cati)
        .map(|k| room::area(&k.poly))
        .fold(None, |acc: Option<f64>, a| Some(acc.map_or(a, |x| x.max(a))));
    let (cati_alan, cati_yaklasik) = match cati {
        Some(a) => (Some(a), false),
        None => (katlar.iter().map(|k| room::area(&k.poly)).fold(None, |acc: Option<f64>, a| Some(acc.map_or(a, |x| x.max(a)))), true),
    };
    match (cati_alan, parsel.yagis_mm, parsel.yuzey_katsayi) {
        (None, _, _) => rap.satirlar.push(satir("Yağmur suyu deposu", Durum::VeriEksik, "çatı izdüşümü için kat dış hattı (SAGG_KAT) yok", None)),
        (_, None, _) | (_, _, None) => rap.satirlar.push(satir("Yağmur suyu deposu", Durum::VeriEksik, "il yıllık ortalama yağışı ve çatı yüzey katsayısı girilmemiş (SAGG_IMARVERI)", None)),
        (Some(ca), Some(h), Some(e)) => {
            let yillik = ca * h * e / 1000.0; // m² × mm × katsayı → m³
            let depo = yillik * r.yagmur_oran.deger;
            let alan_kosulu = pa > r.yagmur_parsel_esik.deger || ca > r.yagmur_cati_esik.deger;
            let zorunlu = alan_kosulu && depo > r.yagmur_hacim_esik.deger;
            let mut row = satir(
                "Yağmur suyu deposu",
                Durum::Bilgi,
                format!(
                    "çatı izdüşümü {} m² × yağış {:.0} mm × katsayı {} = yıllık {} m³; depo en az %{:.0} → {} m³. {}",
                    m2(ca),
                    h,
                    format!("{e:.2}").replace('.', ","),
                    m2(yillik),
                    r.yagmur_oran.deger * 100.0,
                    m2(depo),
                    if zorunlu {
                        format!("Zorunlu (parsel > {:.0} m² ya da çatı > {:.0} m², depo > {:.0} m³; {}).", r.yagmur_parsel_esik.deger, r.yagmur_cati_esik.deger, r.yagmur_hacim_esik.deger, r.yagmur_parsel_esik.kaynak)
                    } else if !alan_kosulu {
                        format!("Zorunlu değil: parsel ≤ {:.0} m² ve çatı ≤ {:.0} m² ({}; kamu yapılarında yalnız depo > {:.0} m³ koşulu).", r.yagmur_parsel_esik.deger, r.yagmur_cati_esik.deger, r.yagmur_parsel_esik.kaynak, r.yagmur_hacim_esik.deger)
                    } else {
                        format!("Zorunlu değil: depo ihtiyacı ≤ {:.0} m³ ({}).", r.yagmur_hacim_esik.deger, r.yagmur_parsel_esik.kaynak)
                    }
                ),
                Some(&r.yagmur_oran),
            );
            if cati_yaklasik {
                not_ekle(&mut row, "çatı izdüşümü: çatı katı çizilmediği için en büyük kat dış hattı alındı (yaklaşık)");
            }
            rap.satirlar.push(row);
        }
    }

    // ---- otopark (Otopark Yön. md. 8/3-4, 5/1-j; oran Ek-1'den kullanıcı girdisi)
    match (parsel.otopark_alan, parsel.otopark_oran) {
        (Some(a), Some(o)) if o > 0.0 => {
            let adet = (a / o - 1e-9).ceil().max(0.0) as u32;
            let mut ac = format!("esas alan {} m² / {} m² = {} araç (kesir bir üst sayıya, md. 8/4)", m2(a), m2(o), adet);
            if adet as f64 >= r.otopark_sarj_esik.deger {
                let sarj = ((adet as f64 * r.otopark_sarj_oran.deger) - 1e-9).ceil().max(1.0) as u32;
                ac.push_str(&format!("; {adet} ≥ {:.0} → en az {sarj} adet elektrikli araç şarjlı (md. 5/1-j)", r.otopark_sarj_esik.deger));
            }
            ac.push_str("; binek oto yeri en az 2,40 × 4,90 m, engelli 3,50 m genişlik (md. 5/1-h-8, 9)");
            let mut row = satir("Otopark", Durum::Bilgi, ac, Some(&k(o, "Otopark Yön. md. 8/3-4; oran Ek-1 (girdi)")));
            not_ekle(&mut row, "oran Ek-1'den girildi; konutta esas alan bağımsız bölüm brüt alanıdır (md. 8/3); idare oranları artırabilir (md. 8/2)");
            rap.satirlar.push(row);
        }
        _ => rap.satirlar.push(satir(
            "Otopark",
            Durum::VeriEksik,
            "Ek-1'e göre esas alan ve oran (1 araç / … m²) girilmemiş (SAGG_IMARVERI)",
            None,
        )),
    }
    rap
}

/// komut satırı için düz metin satırları
pub fn rapor_satirlari(rap: &Rapor) -> Vec<String> {
    let mut out = vec![format!(
        "İMAR ÖN KONTROLÜ  parsel {} m² · brüt inşaat {} m² · emsal dışı {} m² · emsal alanı {} m²",
        m2(rap.parsel_alan),
        m2(rap.brut_toplam),
        m2(rap.emsal_disi),
        m2(rap.emsal_alan)
    )];
    for s in &rap.satirlar {
        let mut l = format!("  [{}] {}: {}", s.durum.label(), s.baslik, s.aciklama);
        if !s.kaynak.is_empty() {
            l.push_str(&format!("  ({})", s.kaynak));
        }
        out.push(l);
        if let Some(d) = &s.dogrula {
            out.push(format!("      ! doğrulayın: {d}"));
        }
    }
    out.push("  Bu bir ön kontroldür: ruhsat incelemesinin, plan notlarının ve idarenin yerel imar yönetmeliğinin yerini tutmaz.".into());
    out
}

/// CSV (Excel için noktalı virgül ayraçlı, UTF-8 BOM'lu)
pub fn rapor_csv(rap: &Rapor) -> String {
    let q = |s: &str| format!("\"{}\"", s.replace('"', "\"\""));
    let mut out = String::from("\u{feff}Durum;Kontrol;Açıklama;Dayanak;Doğrulama notu\r\n");
    out.push_str(&format!(
        "{};{};{};{};{}\r\n",
        q("ÖZET"),
        q("Alanlar"),
        q(&format!("parsel {} m²; brüt inşaat {} m²; emsal dışı {} m²; emsal alanı {} m²", m2(rap.parsel_alan), m2(rap.brut_toplam), m2(rap.emsal_disi), m2(rap.emsal_alan))),
        q(""),
        q("")
    ));
    for s in &rap.satirlar {
        out.push_str(&format!("{};{};{};{};{}\r\n", q(s.durum.label()), q(&s.baslik), q(&s.aciklama), q(&s.kaynak), q(s.dogrula.as_deref().unwrap_or(""))));
    }
    out
}

/// XDATA eşlemesinden sayı
fn f(map: &BTreeMap<String, String>, key: &str) -> Option<f64> {
    map.get(key).and_then(|s| s.replace(',', ".").parse::<f64>().ok()).filter(|v| v.is_finite())
}

/// parsel XDATA'sı (tur=parsel) + çokgen (m) → parsel
pub fn parsel_from(map: &BTreeMap<String, String>, poly_m: Vec<[f64; 2]>) -> Parsel {
    let u = |k: &str| f(map, k).map(|v| v.max(0.0).round() as u32);
    let bb = match (u("bb1"), u("bb2"), u("bb3")) {
        (None, None, None) => None,
        (a, b, c) => Some([a.unwrap_or(0), b.unwrap_or(0), c.unwrap_or(0)]),
    };
    let kenarlar = (0..poly_m.len()).map(|i| map.get(&format!("kenar{}", i + 1)).and_then(|s| Cephe::parse(s))).collect();
    Parsel {
        poly: poly_m,
        taks: f(map, "taks"),
        kaks: f(map, "kaks"),
        kat_adedi: u("kat"),
        hmax: f(map, "hmax"),
        on: f(map, "on"),
        yan: f(map, "yan"),
        arka: f(map, "arka"),
        kenarlar,
        bb,
        diger_alan: f(map, "diger"),
        yagis_mm: f(map, "yagis"),
        yuzey_katsayi: f(map, "katsayi"),
        otopark_alan: f(map, "otopark_alan"),
        otopark_oran: f(map, "otopark_oran"),
    }
}

/// kat XDATA'sı (tur=kat: ad, tip, tekrar, h) + çokgen (m) → kat
pub fn kat_from(map: &BTreeMap<String, String>, poly_m: Vec<[f64; 2]>) -> Option<Kat> {
    Some(Kat {
        ad: map.get("ad").cloned().unwrap_or_default(),
        tip: KatTip::parse(map.get("tip")?)?,
        tekrar: f(map, "tekrar").map_or(1, |v| v.max(1.0).round() as u32),
        yukseklik: f(map, "h").filter(|v| *v > 0.0),
        poly: poly_m,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn rect(x0: f64, y0: f64, w: f64, h: f64) -> Vec<[f64; 2]> {
        vec![[x0, y0], [x0 + w, y0], [x0 + w, y0 + h], [x0, y0 + h]]
    }

    fn by(rap: &Rapor, b: &str) -> Satir {
        rap.satirlar.iter().find(|s| s.baslik.contains(b)).cloned().unwrap_or_else(|| panic!("{b} yok: {:?}", rap.satirlar))
    }

    fn kat(tip: KatTip, tekrar: u32, h: Option<f64>, poly: Vec<[f64; 2]>) -> Kat {
        Kat { ad: tip.label().to_uppercase(), tip, tekrar, yukseklik: h, poly }
    }

    #[test]
    fn taks_kaks_ve_emsal_disi() {
        // parsel 20×25 = 500 m², TAKS 0,40 → 200 m², KAKS 1,20 → 600 m²
        let parsel = Parsel { poly: rect(0.0, 0.0, 20.0, 25.0), taks: Some(0.40), kaks: Some(1.20), kat_adedi: Some(4), ..Default::default() };
        let katlar = vec![
            kat(KatTip::Bodrum, 1, None, rect(3.0, 5.0, 12.0, 15.0)), // 180
            kat(KatTip::Zemin, 1, None, rect(3.0, 5.0, 12.0, 15.0)),  // 180
            kat(KatTip::Normal, 2, None, rect(3.0, 5.0, 12.0, 15.0)), // 360
        ];
        // bodrumda 60 m² otopark + 20 m² kazan dairesi → 80 m² emsal dışı
        let mahaller = vec![
            Mahal { ad: "Otopark".into(), no: "B01".into(), poly: rect(4.0, 6.0, 5.0, 12.0) },
            Mahal { ad: "KAZAN DAİRESİ".into(), no: "B02".into(), poly: rect(10.0, 6.0, 4.0, 5.0) },
        ];
        let rap = hesapla(&parsel, &katlar, &mahaller, &Kurallar::default());
        assert_eq!(rap.parsel_alan, 500.0);
        assert_eq!(rap.taban_alan, Some(180.0));
        assert_eq!(by(&rap, "TAKS").durum, Durum::Uygun);
        assert_eq!(rap.brut_toplam, 720.0);
        assert_eq!(rap.emsal_disi, 80.0);
        assert_eq!(rap.emsal_alan, 640.0);
        let e = by(&rap, "Emsal (KAKS)");
        assert_eq!(e.durum, Durum::Aykiri, "{}", e.aciklama);
        assert!(e.aciklama.contains("640,00") && e.aciklama.contains("600,00"), "{}", e.aciklama);
        let s = by(&rap, "Emsal dışı alan sınırı");
        assert_eq!(s.durum, Durum::Uygun);
        assert!(s.aciklama.contains("PAİY md. 22/1-h") && s.aciklama.contains("22/1-i"), "{}", s.aciklama);
        assert_eq!(by(&rap, "Kat adedi").durum, Durum::Uygun, "zemin + 2 normal = 3 ≤ 4");
    }

    #[test]
    fn emsal_disi_sinir_asilinca_fazlasi_emsale_eklenir() {
        let parsel = Parsel { poly: rect(0.0, 0.0, 10.0, 10.0), taks: Some(0.5), kaks: Some(1.0), ..Default::default() };
        let katlar = vec![kat(KatTip::Zemin, 1, None, rect(0.0, 0.0, 10.0, 10.0))];
        let mahaller = vec![Mahal { ad: "OTOPARK".into(), no: "1".into(), poly: rect(0.0, 0.0, 10.0, 5.0) }]; // 50 > 30
        let rap = hesapla(&parsel, &katlar, &mahaller, &Kurallar::default());
        assert_eq!(by(&rap, "Emsal dışı alan sınırı").durum, Durum::Aykiri);
        assert!((rap.emsal_alan - 70.0).abs() < 1e-9, "yalnız 30 m² düşülür: {}", rap.emsal_alan);
        assert_eq!(by(&rap, "TAKS").durum, Durum::Aykiri, "100 > 50");
    }

    #[test]
    fn siginak_yalniz_gerekli_alan_kadar_emsal_disi() {
        // 12 BB × 3+ oda = 48 kişi → 48 m² gerekli; 60 m² çizilmiş → yalnız 48 m² emsal dışı
        let parsel = Parsel { poly: rect(0.0, 0.0, 30.0, 30.0), kaks: Some(2.0), bb: Some([0, 0, 12]), ..Default::default() };
        let katlar = vec![kat(KatTip::Bodrum, 1, None, rect(0.0, 0.0, 20.0, 20.0)), kat(KatTip::Zemin, 1, None, rect(0.0, 0.0, 20.0, 20.0))];
        let mahaller = vec![Mahal { ad: "SIĞINAK".into(), no: "B1".into(), poly: rect(1.0, 1.0, 6.0, 10.0) }];
        let rap = hesapla(&parsel, &katlar, &mahaller, &Kurallar::default());
        assert_eq!(rap.emsal_disi, 48.0);
        assert_eq!(rap.emsal_alan, 800.0 - 48.0);
        let s = by(&rap, "Sığınak");
        assert_eq!(s.durum, Durum::Uygun, "{}", s.aciklama);
        assert!(s.aciklama.contains("12 bağımsız bölüm ≥ 10") && s.aciklama.contains("48,00 m²"), "{}", s.aciklama);
    }

    #[test]
    fn siginak_esikleri_resmi_metinden() {
        let mut parsel = Parsel { poly: rect(0.0, 0.0, 20.0, 20.0), bb: Some([0, 0, 10]), ..Default::default() };
        // tam 10 BB: md. 7/a "10'dan az" muaf → 10 BB'de gerekir
        let s = by(&hesapla(&parsel, &[], &[], &Kurallar::default()), "Sığınak");
        assert_eq!(s.durum, Durum::Aykiri, "çizimde sığınak yok: {}", s.aciklama);
        assert!(s.aciklama.contains("40,00 m²"));
        // 6 BB × 2 oda = 18 kişi; muaf; 20 m² alt sınırı konutta yok
        parsel.bb = Some([0, 6, 0]);
        let s = by(&hesapla(&parsel, &[], &[], &Kurallar::default()), "Sığınak");
        assert_eq!(s.durum, Durum::Bilgi);
        assert!(s.aciklama.contains("aranmaz") && s.aciklama.contains("18,00 m²"), "{}", s.aciklama);
        // konut dışı 1200 m² < 1500: muaf; 1600 m²: 80 kişi → 80 m²
        parsel.bb = None;
        parsel.diger_alan = Some(1200.0);
        assert_eq!(by(&hesapla(&parsel, &[], &[], &Kurallar::default()), "Sığınak").durum, Durum::Bilgi);
        parsel.diger_alan = Some(1600.0);
        let s = by(&hesapla(&parsel, &[], &[], &Kurallar::default()), "Sığınak");
        assert_eq!(s.durum, Durum::Aykiri);
        assert!(s.aciklama.contains("80,00 m²"), "{}", s.aciklama);
        // karma, kat yok: emsal alanı bilinmeden muafiyet belirlenemez
        parsel.bb = Some([2, 0, 0]);
        assert_eq!(by(&hesapla(&parsel, &[], &[], &Kurallar::default()), "Sığınak").durum, Durum::VeriEksik);
    }

    #[test]
    fn mahal_asgari_olculeri_ve_siniflama() {
        assert_eq!(sinif("Yatak Odası 2"), Sinif::Yatak);
        assert_eq!(sinif("SALON"), Sinif::Oturma);
        assert_eq!(sinif("wc"), Sinif::Tuvalet);
        assert_eq!(sinif("Duş"), Sinif::Banyo);
        assert_eq!(sinif("Sığınak"), Sinif::EmsalDisi("sığınak"));
        assert_eq!(sinif("Depo"), Sinif::Diger);
        let parsel = Parsel { poly: rect(0.0, 0.0, 30.0, 30.0), ..Default::default() };
        let mahaller = vec![
            Mahal { ad: "SALON".into(), no: "01".into(), poly: rect(0.0, 0.0, 4.0, 3.5) },
            Mahal { ad: "YATAK".into(), no: "02".into(), poly: rect(0.0, 0.0, 3.8, 2.4) },
            Mahal { ad: "MUTFAK".into(), no: "03".into(), poly: rect(0.0, 0.0, 2.0, 1.6) },
            Mahal { ad: "WC".into(), no: "04".into(), poly: rect(0.0, 0.0, 1.0, 1.2) },
            Mahal { ad: "KORİDOR".into(), no: "05".into(), poly: rect(0.0, 0.0, 6.0, 1.1) },
        ];
        let rap = hesapla(&parsel, &[], &mahaller, &Kurallar::default());
        assert_eq!(by(&rap, "01 SALON").durum, Durum::Uygun);
        assert_eq!(by(&rap, "02 YATAK").durum, Durum::Aykiri);
        assert_eq!(by(&rap, "03 MUTFAK").durum, Durum::Aykiri);
        let wc = by(&rap, "04 WC");
        assert_eq!(wc.durum, Durum::Uygun);
        assert!(wc.dogrula.is_none(), "tuvalet ölçüsü resmî metinden doğrulandı");
        assert_eq!(by(&rap, "05 KORİDOR").durum, Durum::Aykiri);
        assert_eq!(by(&rap, "TAKS").durum, Durum::VeriEksik);
        assert_eq!(by(&rap, "Sığınak").durum, Durum::VeriEksik);
        assert_eq!(by(&rap, "Yağmur").durum, Durum::VeriEksik);
        assert_eq!(by(&rap, "Otopark").durum, Durum::VeriEksik);
        assert_eq!(by(&rap, "Bahçe mesafeleri").durum, Durum::VeriEksik);
    }

    #[test]
    fn bahce_mesafeleri_ve_kat_artisi() {
        // parsel 20×30; kenar 1 (y=0) ön, kenar 2 (x=20) yan, kenar 3 (y=30) arka, kenar 4 (x=0) yan
        let mut parsel = Parsel {
            poly: rect(0.0, 0.0, 20.0, 30.0),
            kenarlar: vec![Some(Cephe::On), Some(Cephe::Yan), Some(Cephe::Arka), Some(Cephe::Yan)],
            ..Default::default()
        };
        // bina 5 m önden, 3 m yanlardan, 4 m arkadan: x 3..17, y 5..26
        let bina = rect(3.0, 5.0, 14.0, 21.0);
        let katlar = vec![kat(KatTip::Zemin, 1, Some(3.0), bina.clone()), kat(KatTip::Normal, 5, Some(3.0), bina.clone())];
        let rap = hesapla(&parsel, &katlar, &[], &Kurallar::default());
        // 6 kat × 3 m = 18 m → 6 kat; yan / arka 3 + 0,5 × 2 = 4,00 m
        assert_eq!(by(&rap, "kenar 1 (ön)").durum, Durum::Uygun);
        let yan = by(&rap, "kenar 2 (yan)");
        assert_eq!(yan.durum, Durum::Aykiri, "{}", yan.aciklama);
        assert!(yan.aciklama.contains("3,00 m") && yan.aciklama.contains("en az 4,00 m"), "{}", yan.aciklama);
        assert_eq!(by(&rap, "kenar 3 (arka)").durum, Durum::Uygun, "4 m ≥ 4 m");
        // plan notu yan bahçeyi 3 m verirse uygun
        parsel.yan = Some(3.0);
        assert_eq!(by(&hesapla(&parsel, &katlar, &[], &Kurallar::default()), "kenar 2 (yan)").durum, Durum::Uygun);
        // 23/1-d: 14 m / 3 = 4 kat + 2 m artık (≤ 2,50) → 4 kat, artış yok; 14,6 m → 5 kat
        let az = vec![kat(KatTip::Zemin, 1, Some(3.5), bina.clone()), kat(KatTip::Normal, 3, Some(3.5), bina.clone())];
        parsel.yan = None;
        assert!(by(&hesapla(&parsel, &az, &[], &Kurallar::default()), "kenar 2 (yan)").aciklama.contains("en az 3,00 m"));
        let cok = vec![kat(KatTip::Zemin, 1, Some(3.65), bina.clone()), kat(KatTip::Normal, 3, Some(3.65), bina)];
        assert!(by(&hesapla(&parsel, &cok, &[], &Kurallar::default()), "kenar 2 (yan)").aciklama.contains("en az 3,50 m"));
    }

    #[test]
    fn bina_ve_kat_yuksekligi() {
        let parsel = Parsel { poly: rect(0.0, 0.0, 20.0, 20.0), hmax: Some(12.5), ..Default::default() };
        let b = rect(3.0, 5.0, 10.0, 10.0);
        let katlar = vec![kat(KatTip::Bodrum, 1, Some(3.0), b.clone()), kat(KatTip::Zemin, 1, Some(4.0), b.clone()), kat(KatTip::Normal, 3, Some(3.0), b.clone())];
        let rap = hesapla(&parsel, &katlar, &[], &Kurallar::default());
        let h = by(&rap, "Bina yüksekliği");
        assert_eq!(h.durum, Durum::Aykiri, "4 + 9 = 13 > 12,5: {}", h.aciklama);
        assert!(h.dogrula.is_some(), "yaklaşık ölçüm notu");
        let k = by(&rap, "Kat yükseklikleri");
        assert!(k.aciklama.contains("ZEMIN 4,00"), "4 katlı binada 3,60 sınırı: {}", k.aciklama);
        let eksik = vec![kat(KatTip::Zemin, 1, None, b)];
        assert_eq!(by(&hesapla(&parsel, &eksik, &[], &Kurallar::default()), "Bina yüksekliği").durum, Durum::VeriEksik);
    }

    #[test]
    fn su_deposu_otopark_ve_yagmur() {
        let mut parsel = Parsel {
            poly: rect(0.0, 0.0, 50.0, 50.0),
            bb: Some([0, 4, 10]),
            otopark_alan: Some(2400.0),
            otopark_oran: Some(110.0),
            yagis_mm: Some(600.0),
            yuzey_katsayi: Some(0.8),
            ..Default::default()
        };
        let katlar = vec![kat(KatTip::Cati, 1, None, rect(0.0, 0.0, 30.0, 50.0))];
        let rap = hesapla(&parsel, &katlar, &[], &Kurallar::default());
        assert!(by(&rap, "Su deposu").aciklama.contains("en az 5,00 m³"), "14 BB: 3 + 4 × 0,5");
        let o = by(&rap, "Otopark");
        assert!(o.aciklama.contains("= 22 araç") && o.aciklama.contains("en az 2 adet elektrikli"), "{}", o.aciklama);
        let y = by(&rap, "Yağmur");
        assert!(y.aciklama.contains("yıllık 720,00 m³") && y.aciklama.contains("43,20 m³") && y.aciklama.contains("Zorunlu ("), "{}", y.aciklama);
        parsel.poly = rect(0.0, 0.0, 20.0, 20.0);
        let katlar = vec![kat(KatTip::Zemin, 1, None, rect(0.0, 0.0, 10.0, 10.0))];
        let y = by(&hesapla(&parsel, &katlar, &[], &Kurallar::default()), "Yağmur");
        assert!(y.aciklama.contains("Zorunlu değil: parsel") && y.dogrula.is_some(), "{}", y.aciklama);
    }

    #[test]
    fn geometri_yardimcilari() {
        let r = [[0.0, 0.0], [3.0, 3.0], [1.0, 5.0], [-2.0, 2.0]];
        let (w, rect_) = dar_kenar(&r);
        assert!((w - 8f64.sqrt()).abs() < 1e-9 && rect_, "{w}");
        let l = [[0.0, 0.0], [6.0, 0.0], [6.0, 2.0], [2.0, 2.0], [2.0, 6.0], [0.0, 6.0]];
        assert!(!dar_kenar(&l).1);
        let b = rect(2.0, 3.0, 4.0, 4.0);
        assert!((parca_cokgen([0.0, 0.0], [10.0, 0.0], &b) - 3.0).abs() < 1e-12);
        assert_eq!(parca_cokgen([0.0, 5.0], [10.0, 5.0], &b), 0.0, "kesişen");
        assert_eq!(en_yakin_kenar(&rect(0.0, 0.0, 20.0, 30.0), [19.0, 15.0]), Some(1));
    }

    #[test]
    fn xdata_okuma() {
        let m = crate::xdata::decode(&["tur=parsel", "taks=0,35", "kaks=1.5", "kat=5", "bb3=12", "yagis=650", "kenar2=Y", "kenar4=o", "hmax=15.5"]);
        let p = parsel_from(&m, rect(0.0, 0.0, 1.0, 1.0));
        assert_eq!((p.taks, p.kaks, p.kat_adedi, p.hmax), (Some(0.35), Some(1.5), Some(5), Some(15.5)));
        assert_eq!(p.bb, Some([0, 0, 12]));
        assert_eq!(p.kenarlar, vec![None, Some(Cephe::Yan), None, Some(Cephe::On)]);
        let k = kat_from(&crate::xdata::decode(&["tur=kat", "ad=Normal Kat", "tip=N", "tekrar=3", "h=3,2"]), rect(0.0, 0.0, 1.0, 1.0)).unwrap();
        assert_eq!((k.tip, k.tekrar, k.ad.as_str(), k.yukseklik), (KatTip::Normal, 3, "Normal Kat", Some(3.2)));
        assert!(kat_from(&crate::xdata::decode(&["tur=kat", "tip=X"]), vec![]).is_none());
    }

    #[test]
    fn rapor_metni_ve_csv() {
        let rap = hesapla(&Parsel { poly: rect(0.0, 0.0, 10.0, 10.0), ..Default::default() }, &[], &[], &Kurallar::default());
        let l = rapor_satirlari(&rap);
        assert!(l[0].contains("parsel 100,00 m²"));
        assert!(l.last().unwrap().contains("ön kontrol"));
        let csv = rapor_csv(&rap);
        assert!(csv.starts_with('\u{feff}') && csv.contains("\"VERİ EKSİK\";\"TAKS\""), "{csv}");
    }
}
