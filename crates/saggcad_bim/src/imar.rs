//! İmar uygunluğu ön kontrolü — Planlı Alanlar İmar Yönetmeliği (PAİY), Sığınak Yönetmeliği ve PAİY 57/A yağmur suyu
//! hükümleri. Girdiler: parsel (imar durumu), katlar (brüt dış hat, tip, tekrar), mahaller (net alan çokgeni, ad).
//!
//! İlke: **ön kontrol, kesin hüküm değil.** Her sonuç dayandığı kuralı, kuralın kaynağını ve doğrulama durumunu taşır.
//! Kaynaklarda birbiriyle çelişen ya da yerel imar yönetmeliğiyle değişebilen değerler `dogrula` olarak işaretlenir ve
//! raporda ayrıca belirtilir. Girdi eksikse hesap yapılmaz, "veri eksik" yazılır — hiçbir miktar varsayılarak üretilmez.
//!
//! Birimler: alanlar m², uzunluklar m, hacim m³, yağış mm (= L/m²). Çizimden gelen çokgenler mm'dir (`from_mm`).

use crate::room;

/// kural sabiti: değer + kaynak + doğrulama notu
#[derive(Clone, Debug, PartialEq)]
pub struct Kural {
    pub deger: f64,
    pub kaynak: &'static str,
    /// Some(not): kaynaklar arasında tutarsızlık ya da yerel değişiklik olasılığı — raporda gösterilir
    pub dogrula: Option<&'static str>,
}

const fn k(deger: f64, kaynak: &'static str) -> Kural {
    Kural { deger, kaynak, dogrula: None }
}
const fn kd(deger: f64, kaynak: &'static str, not: &'static str) -> Kural {
    Kural { deger, kaynak, dogrula: Some(not) }
}

/// konut piyes asgari ölçüleri (PAİY md. 29): net alan m², dar kenar m
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
    /// hol ve koridor en az genişliği (m)
    pub koridor: Kural,
    /// emsal harici alanların toplamı / izin verilen emsal alanı üst sınırı (oran)
    pub emsal_disi_oran: Kural,
    /// sığınak: kişi başına alan (m²) ve en az sığınak alanı (m²)
    pub siginak_kisi_alan: Kural,
    pub siginak_en_az: Kural,
    /// konut dışı kullanımda kişi sayısı = emsale konu alan / bu sayı
    pub siginak_diger_bolen: Kural,
    /// konutlarda zorunluluk eşiği: toplam konut bağımsız bölüm sayısı
    pub siginak_esik_bb: Kural,
    /// yağmur suyu: depo, yıllık toplanabilir suyun en az bu oranı
    pub yagmur_oran: Kural,
    pub yagmur_parsel_esik: Kural,
    pub yagmur_cati_esik: Kural,
    pub yagmur_hacim_esik: Kural,
}

impl Default for Kurallar {
    fn default() -> Self {
        const P29: &str = "PAİY md. 29";
        Kurallar {
            oturma: Piyes { alan: k(12.0, P29), dar_kenar: k(3.0, P29) },
            yatak: Piyes { alan: k(9.0, P29), dar_kenar: k(2.5, P29) },
            mutfak: Piyes { alan: k(3.3, P29), dar_kenar: k(1.5, P29) },
            banyo: Piyes { alan: k(3.0, P29), dar_kenar: k(1.5, P29) },
            tuvalet: Piyes {
                alan: kd(1.2, P29, "tuvalet ölçüsü ikincil kaynaklarda farklı aktarılıyor; güncel resmî metinden doğrulayın"),
                dar_kenar: kd(1.0, P29, "tuvalet ölçüsü ikincil kaynaklarda farklı aktarılıyor; güncel resmî metinden doğrulayın"),
            },
            koridor: k(1.2, P29),
            emsal_disi_oran: kd(0.30, "PAİY md. 5 / md. 22", "üst sınırın hangi alana oranlandığı ve idarenin yerel yönetmeliği proje bazında doğrulanmalı"),
            siginak_kisi_alan: k(1.0, "Sığınak Yönetmeliği (RG 07.11.2025 / 33070)"),
            siginak_en_az: k(20.0, "Sığınak Yönetmeliği (RG 07.11.2025 / 33070)"),
            siginak_diger_bolen: k(20.0, "Sığınak Yönetmeliği (RG 07.11.2025 / 33070)"),
            siginak_esik_bb: kd(10.0, "Sığınak Yönetmeliği (RG 07.11.2025 / 33070)", "eşik kaynaklarda \"10 ve üzeri\" ve \"10'dan fazla\" olarak farklı aktarılıyor; tam 10 bağımsız bölümde resmî metne bakın"),
            yagmur_oran: k(0.06, "PAİY md. 57/A (TS EN 16941-1 Ek A)"),
            yagmur_parsel_esik: k(2000.0, "PAİY md. 57/A"),
            yagmur_cati_esik: k(1000.0, "PAİY md. 57/A"),
            yagmur_hacim_esik: k(7.0, "PAİY md. 57/A"),
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

/// mahal sınıfı (addan çıkarılır; rapor çıkarımı açıkça gösterir)
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Sinif {
    Oturma,
    Yatak,
    Mutfak,
    Banyo,
    Tuvalet,
    Koridor,
    /// PAİY md. 22 başlıklarından biri (ör. sığınak, otopark) — anahtar sözcükle
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

/// PAİY md. 22'de emsal dışı sayılan başlıklardan, mahal adında aranan anahtar sözcükler.
/// Kapsam ve koşullar (ortak alan olma, bağımsız bölüme ait olmama, yerel yönetmelik) proje bazında doğrulanmalıdır.
const EMSAL_DISI: &[(&str, &str)] = &[
    ("SIGINAK", "sığınak"),
    ("OTOPARK", "otopark"),
    ("MERDIVEN", "merdiven evi"),
    ("ASANSOR", "asansör"),
    ("ISI MERKEZI", "ısı merkezi"),
    ("KAZAN", "kazan dairesi"),
    ("YAKIT", "yakıt deposu"),
    ("SU DEPOSU", "su deposu"),
    ("JENERATOR", "jeneratör"),
    ("TRAFO", "trafo"),
    ("TEKNIK", "teknik hacim"),
    ("COCUK OYUN", "çocuk oyun alanı"),
    ("MESCIT", "mescit"),
];

pub fn sinif(ad: &str) -> Sinif {
    let n = norm(ad);
    for (anahtar, etiket) in EMSAL_DISI {
        if n.contains(anahtar) {
            return Sinif::EmsalDisi(etiket);
        }
    }
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
    /// sığınak girdileri: oda sayısına göre konut bağımsız bölüm adetleri (1, 2, 3+ odalı)
    pub bb: Option<[u32; 3]>,
    /// konut dışı kullanımların emsale konu alanı (m²)
    pub diger_alan: Option<f64>,
    /// yağmur suyu girdileri: il yıllık ortalama yağış (mm) ve çatı yüzey / toplam verim katsayısı
    pub yagis_mm: Option<f64>,
    pub yuzey_katsayi: Option<f64>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Kat {
    pub ad: String,
    pub tip: KatTip,
    /// aynı katın tekrar sayısı (ör. 4 normal kat)
    pub tekrar: u32,
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
    /// doğrulama notu (kural tutarsız ya da yerel olarak değişebilir; ya da ölçü yaklaşık)
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

/// mahalin bulunduğu kat: etiket noktası kat dış hattının içinde kalan ilk kat
fn kat_of<'a>(m: &Mahal, katlar: &'a [Kat]) -> Option<&'a Kat> {
    let p = room::label_point(&m.poly);
    katlar.iter().find(|k| room::contains(&k.poly, p))
}

pub fn hesapla(parsel: &Parsel, katlar: &[Kat], mahaller: &[Mahal], r: &Kurallar) -> Rapor {
    let mut rap = Rapor { parsel_alan: room::area(&parsel.poly), ..Default::default() };
    let pa = rap.parsel_alan;

    // ---- TAKS: zemin kat oturumu / parsel alanı
    let zemin: Vec<&Kat> = katlar.iter().filter(|k| k.tip == KatTip::Zemin).collect();
    rap.taban_alan = (!zemin.is_empty()).then(|| zemin.iter().map(|k| room::area(&k.poly)).fold(0.0, f64::max));
    match (rap.taban_alan, parsel.taks) {
        (Some(ta), Some(taks)) if pa > 0.0 => {
            let izin = pa * taks;
            let d = if ta <= izin + 1e-6 { Durum::Uygun } else { Durum::Aykiri };
            rap.satirlar.push(satir(
                "TAKS",
                d,
                format!("taban alanı {} m² / parsel {} m² = {:.3} (izin {:.2} → en çok {} m²)", m2(ta), m2(pa), ta / pa, taks, m2(izin)),
                Some(&k(taks, "imar durumu (plan notu)")),
            ));
        }
        (None, _) => rap.satirlar.push(satir("TAKS", Durum::VeriEksik, "zemin kat dış hattı (SAGG_KAT, tip Z) çizilmemiş", None)),
        (_, None) => rap.satirlar.push(satir("TAKS", Durum::VeriEksik, "imar durumunda TAKS girilmemiş (SAGG_PARSEL)", None)),
        _ => rap.satirlar.push(satir("TAKS", Durum::VeriEksik, "parsel alanı sıfır", None)),
    }

    // ---- emsal (KAKS): Σ brüt kat × tekrar − emsal dışı mahaller (üst sınırlı)
    rap.brut_toplam = katlar.iter().filter(|k| k.tip != KatTip::Cati).map(|k| room::area(&k.poly) * k.tekrar as f64).sum();
    let mut disi_kalemler: Vec<String> = Vec::new();
    for m in mahaller {
        if let Sinif::EmsalDisi(etiket) = sinif(&m.ad) {
            let tekrar = kat_of(m, katlar).map_or(1, |k| k.tekrar) as f64;
            let a = room::area(&m.poly) * tekrar;
            rap.emsal_disi += a;
            disi_kalemler.push(format!("{} {} ({etiket}) {} m²", m.no, m.ad, m2(a)));
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
            if rap.emsal_disi > sinir + 1e-6 {
                rap.satirlar.push(satir(
                    "Emsal dışı alan sınırı",
                    Durum::Aykiri,
                    format!("emsal dışı {} m² > %{:.0} × {} m² = {} m²; aşan {} m² emsale eklendi", m2(rap.emsal_disi), r.emsal_disi_oran.deger * 100.0, m2(izin), m2(sinir), m2(rap.emsal_disi - sinir)),
                    Some(&r.emsal_disi_oran),
                ));
            } else if rap.emsal_disi > 0.0 {
                rap.satirlar.push(satir(
                    "Emsal dışı alan sınırı",
                    Durum::Uygun,
                    format!("emsal dışı {} m² ≤ %{:.0} × {} m² = {} m² — {}", m2(rap.emsal_disi), r.emsal_disi_oran.deger * 100.0, m2(izin), m2(sinir), disi_kalemler.join("; ")),
                    Some(&r.emsal_disi_oran),
                ));
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
                Some(&k(kaks, "imar durumu (plan notu)")),
            ));
        }
    }

    // ---- kat adedi: zemin + normal katlar (tekrarlarıyla)
    let kat_say: u32 = katlar.iter().filter(|k| matches!(k.tip, KatTip::Zemin | KatTip::Normal)).map(|k| k.tekrar).sum();
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
                    row.dogrula = Some("dikdörtgen olmayan mahal: genişlik en küçük çevreleyen dikdörtgenden yaklaşık".into());
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
            let not = "dikdörtgen olmayan mahal: dar kenar en küçük çevreleyen dikdörtgenden yaklaşık";
            row.dogrula = Some(match row.dogrula {
                Some(d) => format!("{d}; {not}"),
                None => not.into(),
            });
        }
        rap.satirlar.push(row);
    }

    // ---- sığınak
    match (parsel.bb, parsel.diger_alan) {
        (None, None) => rap.satirlar.push(satir("Sığınak", Durum::VeriEksik, "konut bağımsız bölüm adetleri / konut dışı alan girilmemiş (SAGG_IMARVERI)", None)),
        (bb, diger) => {
            let bb = bb.unwrap_or([0, 0, 0]);
            let toplam_bb = bb[0] + bb[1] + bb[2];
            let kisi_konut = bb[0] * 2 + bb[1] * 3 + bb[2] * 4;
            let kisi_diger = diger.map_or(0.0, |a| (a / r.siginak_diger_bolen.deger).ceil());
            let kisi = kisi_konut as f64 + kisi_diger;
            let alan = (kisi * r.siginak_kisi_alan.deger).max(r.siginak_en_az.deger);
            let esik = r.siginak_esik_bb.deger as u32;
            let zorunlu = if toplam_bb > esik {
                "konut bağımsız bölüm sayısı eşiğin üstünde — sığınak gerekir".to_string()
            } else if toplam_bb == esik {
                format!("konut bağımsız bölüm sayısı tam {esik}: zorunluluk eşiğin yorumuna bağlı (aşağıdaki nota bakın)")
            } else if diger.is_some() {
                "konut bağımsız bölüm sayısı eşiğin altında; konut dışı kullanım için zorunluluğu resmî metinden kontrol edin".to_string()
            } else {
                "konut bağımsız bölüm sayısı eşiğin altında — konut için sığınak zorunlu görünmüyor".to_string()
            };
            let mevcut: f64 = mahaller.iter().filter(|m| sinif(&m.ad) == Sinif::EmsalDisi("sığınak")).map(|m| room::area(&m.poly)).sum();
            let mut row = satir(
                "Sığınak",
                Durum::Bilgi,
                format!(
                    "{toplam_bb} konut BB (1 oda {}×2 + 2 oda {}×3 + 3+ oda {}×4 = {kisi_konut} kişi){} → gerekli en az {} m² ({}); çizimdeki sığınak {} m²",
                    bb[0],
                    bb[1],
                    bb[2],
                    diger.map_or(String::new(), |a| format!(" + konut dışı {} m² / {} = {} kişi", m2(a), r.siginak_diger_bolen.deger, kisi_diger)),
                    m2(alan),
                    zorunlu,
                    m2(mevcut)
                ),
                Some(&r.siginak_esik_bb),
            );
            if toplam_bb >= esik && mevcut + 1e-6 < alan {
                row.durum = Durum::Aykiri;
            } else if toplam_bb > esik {
                row.durum = Durum::Uygun;
            }
            rap.satirlar.push(row);
        }
    }

    // ---- yağmur suyu deposu (PAİY 57/A)
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
                        format!("Zorunlu (parsel > {:.0} m² ya da çatı > {:.0} m², depo > {:.0} m³).", r.yagmur_parsel_esik.deger, r.yagmur_cati_esik.deger, r.yagmur_hacim_esik.deger)
                    } else if !alan_kosulu {
                        format!("Zorunlu değil: parsel ≤ {:.0} m² ve çatı ≤ {:.0} m².", r.yagmur_parsel_esik.deger, r.yagmur_cati_esik.deger)
                    } else {
                        format!("Zorunlu değil: depo ihtiyacı ≤ {:.0} m³.", r.yagmur_hacim_esik.deger)
                    }
                ),
                Some(&r.yagmur_oran),
            );
            if cati_yaklasik {
                row.dogrula = Some("çatı izdüşümü: çatı katı çizilmediği için en büyük kat dış hattı alındı (yaklaşık)".into());
            }
            rap.satirlar.push(row);
        }
    }
    rap
}

/// komut satırı / CSV için düz metin satırları
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

/// XDATA eşlemesinden sayı
fn f(map: &std::collections::BTreeMap<String, String>, key: &str) -> Option<f64> {
    map.get(key).and_then(|s| s.replace(',', ".").parse::<f64>().ok()).filter(|v| v.is_finite())
}

/// parsel XDATA'sı (tur=parsel) + çokgen (m) → parsel
pub fn parsel_from(map: &std::collections::BTreeMap<String, String>, poly_m: Vec<[f64; 2]>) -> Parsel {
    let u = |k: &str| f(map, k).map(|v| v.max(0.0).round() as u32);
    let bb = match (u("bb1"), u("bb2"), u("bb3")) {
        (None, None, None) => None,
        (a, b, c) => Some([a.unwrap_or(0), b.unwrap_or(0), c.unwrap_or(0)]),
    };
    Parsel {
        poly: poly_m,
        taks: f(map, "taks"),
        kaks: f(map, "kaks"),
        kat_adedi: u("kat"),
        bb,
        diger_alan: f(map, "diger"),
        yagis_mm: f(map, "yagis"),
        yuzey_katsayi: f(map, "katsayi"),
    }
}

/// kat XDATA'sı (tur=kat: ad, tip, tekrar) + çokgen (m) → kat
pub fn kat_from(map: &std::collections::BTreeMap<String, String>, poly_m: Vec<[f64; 2]>) -> Option<Kat> {
    Some(Kat {
        ad: map.get("ad").cloned().unwrap_or_default(),
        tip: KatTip::parse(map.get("tip")?)?,
        tekrar: f(map, "tekrar").map_or(1, |v| v.max(1.0).round() as u32),
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

    #[test]
    fn taks_kaks_ve_emsal_disi() {
        // parsel 20×25 = 500 m², TAKS 0,40 → 200 m², KAKS 1,20 → 600 m²
        let parsel = Parsel { poly: rect(0.0, 0.0, 20.0, 25.0), taks: Some(0.40), kaks: Some(1.20), kat_adedi: Some(4), ..Default::default() };
        let katlar = vec![
            Kat { ad: "Bodrum".into(), tip: KatTip::Bodrum, tekrar: 1, poly: rect(3.0, 5.0, 12.0, 15.0) },  // 180
            Kat { ad: "Zemin".into(), tip: KatTip::Zemin, tekrar: 1, poly: rect(3.0, 5.0, 12.0, 15.0) },    // 180
            Kat { ad: "Normal".into(), tip: KatTip::Normal, tekrar: 2, poly: rect(3.0, 5.0, 12.0, 15.0) },  // 360
        ];
        // bodrumda 30 m² sığınak + 60 m² otopark → 90 m² emsal dışı
        let mahaller = vec![
            Mahal { ad: "SIĞINAK".into(), no: "B01".into(), poly: rect(4.0, 6.0, 5.0, 6.0) },
            Mahal { ad: "Otopark".into(), no: "B02".into(), poly: rect(9.0, 6.0, 5.0, 12.0) },
        ];
        let rap = hesapla(&parsel, &katlar, &mahaller, &Kurallar::default());
        assert_eq!(rap.parsel_alan, 500.0);
        assert_eq!(rap.taban_alan, Some(180.0));
        assert_eq!(by(&rap, "TAKS").durum, Durum::Uygun);
        assert_eq!(rap.brut_toplam, 720.0);
        assert_eq!(rap.emsal_disi, 90.0);
        assert_eq!(rap.emsal_alan, 630.0);
        // 630 > 600 → aykırı
        let e = by(&rap, "Emsal (KAKS)");
        assert_eq!(e.durum, Durum::Aykiri, "{}", e.aciklama);
        assert!(e.aciklama.contains("630,00") && e.aciklama.contains("600,00"), "{}", e.aciklama);
        // emsal dışı 90 ≤ %30 × 600 = 180 → uygun, doğrulama notu taşır
        let s = by(&rap, "Emsal dışı alan sınırı");
        assert_eq!(s.durum, Durum::Uygun);
        assert!(s.dogrula.is_some());
        assert_eq!(by(&rap, "Kat adedi").durum, Durum::Uygun, "zemin + 2 normal = 3 ≤ 4");
    }

    #[test]
    fn emsal_disi_sinir_asilinca_fazlasi_emsale_eklenir() {
        let parsel = Parsel { poly: rect(0.0, 0.0, 10.0, 10.0), taks: Some(0.5), kaks: Some(1.0), ..Default::default() };
        let katlar = vec![Kat { ad: "Z".into(), tip: KatTip::Zemin, tekrar: 1, poly: rect(0.0, 0.0, 10.0, 10.0) }];
        let mahaller = vec![Mahal { ad: "OTOPARK".into(), no: "1".into(), poly: rect(0.0, 0.0, 10.0, 5.0) }]; // 50 > 30
        let rap = hesapla(&parsel, &katlar, &mahaller, &Kurallar::default());
        assert_eq!(by(&rap, "Emsal dışı alan sınırı").durum, Durum::Aykiri);
        assert!((rap.emsal_alan - 70.0).abs() < 1e-9, "yalnız 30 m² düşülür: {}", rap.emsal_alan);
        assert_eq!(by(&rap, "TAKS").durum, Durum::Aykiri, "100 > 50");
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
            Mahal { ad: "SALON".into(), no: "01".into(), poly: rect(0.0, 0.0, 4.0, 3.5) },     // 14 m², 3,5 → uygun
            Mahal { ad: "YATAK".into(), no: "02".into(), poly: rect(0.0, 0.0, 3.8, 2.4) },     // 9,12 m² ama 2,40 < 2,50
            Mahal { ad: "MUTFAK".into(), no: "03".into(), poly: rect(0.0, 0.0, 2.0, 1.6) },    // 3,20 < 3,30
            Mahal { ad: "WC".into(), no: "04".into(), poly: rect(0.0, 0.0, 1.0, 1.2) },        // tam sınırda
            Mahal { ad: "KORİDOR".into(), no: "05".into(), poly: rect(0.0, 0.0, 6.0, 1.1) },   // 1,10 < 1,20
        ];
        let rap = hesapla(&parsel, &[], &mahaller, &Kurallar::default());
        assert_eq!(by(&rap, "01 SALON").durum, Durum::Uygun);
        assert_eq!(by(&rap, "02 YATAK").durum, Durum::Aykiri);
        assert_eq!(by(&rap, "03 MUTFAK").durum, Durum::Aykiri);
        let wc = by(&rap, "04 WC");
        assert_eq!(wc.durum, Durum::Uygun);
        assert!(wc.dogrula.is_some(), "tuvalet ölçüsü doğrulama notu taşır");
        assert_eq!(by(&rap, "05 KORİDOR").durum, Durum::Aykiri);
        // girdi yoksa hesap yok
        assert_eq!(by(&rap, "TAKS").durum, Durum::VeriEksik);
        assert_eq!(by(&rap, "Sığınak").durum, Durum::VeriEksik);
        assert_eq!(by(&rap, "Yağmur").durum, Durum::VeriEksik);
    }

    #[test]
    fn dar_kenar_dondurulmus_ve_l() {
        let r = [[0.0, 0.0], [3.0, 3.0], [1.0, 5.0], [-2.0, 2.0]]; // 45° döndürülmüş 4,24 × 2,83
        let (w, rect) = dar_kenar(&r);
        assert!((w - 8f64.sqrt()).abs() < 1e-9 && rect, "{w}");
        let l = [[0.0, 0.0], [6.0, 0.0], [6.0, 2.0], [2.0, 2.0], [2.0, 6.0], [0.0, 6.0]];
        let (w, rect) = dar_kenar(&l);
        assert!(!rect && (w - 6.0).abs() < 1e-9, "L: çevreleyen dikdörtgen 6×6 (yaklaşık) {w}");
    }

    #[test]
    fn siginak_kisi_hesabi_ve_esik() {
        let mut parsel = Parsel { poly: rect(0.0, 0.0, 20.0, 20.0), bb: Some([2, 4, 6]), ..Default::default() };
        // 12 BB: 2×2 + 4×3 + 6×4 = 40 kişi → 40 m²; sığınak çizilmemiş → aykırı
        let rap = hesapla(&parsel, &[], &[], &Kurallar::default());
        let s = by(&rap, "Sığınak");
        assert_eq!(s.durum, Durum::Aykiri, "{}", s.aciklama);
        assert!(s.aciklama.contains("40 kişi") && s.aciklama.contains("40,00 m²"), "{}", s.aciklama);
        // 6 BB × 2 oda = 18 kişi → en az 20 m² kuralı; eşik altı → bilgi
        parsel.bb = Some([0, 6, 0]);
        let rap = hesapla(&parsel, &[], &[], &Kurallar::default());
        let s = by(&rap, "Sığınak");
        assert_eq!(s.durum, Durum::Bilgi);
        assert!(s.aciklama.contains("20,00 m²") && s.aciklama.contains("zorunlu görünmüyor"), "{}", s.aciklama);
        // tam 10 BB: eşik yorumu notu
        parsel.bb = Some([0, 0, 10]);
        let s = by(&hesapla(&parsel, &[], &[], &Kurallar::default()), "Sığınak");
        assert!(s.aciklama.contains("tam 10") && s.dogrula.is_some(), "{}", s.aciklama);
    }

    #[test]
    fn yagmur_suyu_deposu() {
        // parsel 2500 m² (> 2000), çatı 1500 m², yağış 600 mm, katsayı 0,80 → yıllık 720 m³, depo %6 = 43,2 m³ > 7
        let parsel = Parsel { poly: rect(0.0, 0.0, 50.0, 50.0), yagis_mm: Some(600.0), yuzey_katsayi: Some(0.8), ..Default::default() };
        let katlar = vec![Kat { ad: "Çatı".into(), tip: KatTip::Cati, tekrar: 1, poly: rect(0.0, 0.0, 30.0, 50.0) }];
        let s = by(&hesapla(&parsel, &katlar, &[], &Kurallar::default()), "Yağmur");
        assert!(s.aciklama.contains("yıllık 720,00 m³"), "{}", s.aciklama);
        assert!(s.aciklama.contains("43,20 m³") && s.aciklama.contains("Zorunlu ("), "{}", s.aciklama);
        assert!(s.dogrula.is_none(), "çatı katı çizildi: yaklaşık değil");
        // küçük parsel ve çatı: zorunlu değil
        let parsel = Parsel { poly: rect(0.0, 0.0, 20.0, 20.0), yagis_mm: Some(600.0), yuzey_katsayi: Some(0.8), ..Default::default() };
        let katlar = vec![Kat { ad: "Z".into(), tip: KatTip::Zemin, tekrar: 1, poly: rect(0.0, 0.0, 10.0, 10.0) }];
        let s = by(&hesapla(&parsel, &katlar, &[], &Kurallar::default()), "Yağmur");
        assert!(s.aciklama.contains("Zorunlu değil: parsel"), "{}", s.aciklama);
        assert!(s.dogrula.is_some(), "çatı yerine kat dış hattı: yaklaşık");
    }

    #[test]
    fn xdata_okuma() {
        let m = crate::xdata::decode(&["tur=parsel", "taks=0,35", "kaks=1.5", "kat=5", "bb3=12", "yagis=650"]);
        let p = parsel_from(&m, rect(0.0, 0.0, 1.0, 1.0));
        assert_eq!((p.taks, p.kaks, p.kat_adedi), (Some(0.35), Some(1.5), Some(5)));
        assert_eq!(p.bb, Some([0, 0, 12]));
        assert_eq!((p.yagis_mm, p.yuzey_katsayi, p.diger_alan), (Some(650.0), None, None));
        let k = kat_from(&crate::xdata::decode(&["tur=kat", "ad=Normal Kat", "tip=N", "tekrar=3"]), rect(0.0, 0.0, 1.0, 1.0)).unwrap();
        assert_eq!((k.tip, k.tekrar, k.ad.as_str()), (KatTip::Normal, 3, "Normal Kat"));
        assert!(kat_from(&crate::xdata::decode(&["tur=kat", "tip=X"]), vec![]).is_none());
    }

    #[test]
    fn rapor_metni() {
        let rap = hesapla(&Parsel { poly: rect(0.0, 0.0, 10.0, 10.0), ..Default::default() }, &[], &[], &Kurallar::default());
        let l = rapor_satirlari(&rap);
        assert!(l[0].contains("parsel 100,00 m²"));
        assert!(l.last().unwrap().contains("ön kontrol"));
    }
}
