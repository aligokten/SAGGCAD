// İmar girdileri:
//   SAGG_PARSEL   — imar durumu (TAKS, KAKS, kat adedi; Enter = yok) sonra parsel köşeleri → kapalı çoklu çizgi (A-PARSEL)
//   SAGG_KAT      — kat adı, tipi (B / Z / N / C), tekrar sayısı, sonra brüt kat dış hattı → çoklu çizgi (A-KAT)
//   SAGG_IMARVERI — sığınak ve yağmur suyu girdileri (konut BB adetleri, konut dışı alan, yıllık yağış, yüzey katsayısı)
//                   parselin XDATA'sına yazılır (tek geri al)
//   SAGG_CEPHE    — parsel kenarlarını ön / yan / arka olarak işaretle (bahçe mesafesi kontrolü için)
// Hesap ve rapor SAGG_IMAR'dadır (src/app/commands/bim.rs); kurallar `saggcad_bim::imar`.

use codec::entities::{LwPolyline, LwVertex, Text, TextHorizontalAlignment, TextVerticalAlignment};
use codec::types::{Vector2, Vector3};
use codec::{EntityType, Handle};
use glam::DVec3;
use std::collections::BTreeMap;

use crate::command::{CadCommand, CmdResult, InputKind};
use crate::scene::model::wire_model::WireModel;
use saggcad_bim::imar::{Cephe, KatTip};
use saggcad_bim::room;

#[derive(Clone, Copy, PartialEq, Debug)]
pub enum Kind {
    /// pozitif ondalık sayı
    Num,
    /// pozitif tam sayı (0 dahil)
    Int,
    /// kat tipi harfi
    Tip,
    /// serbest metin (boşluk içerebilir)
    Text,
}

#[derive(Clone, Debug)]
pub struct Field {
    pub key: &'static str,
    pub label: &'static str,
    pub kind: Kind,
    /// boş = girilmedi
    pub value: String,
    /// boş bırakılabilir mi ("-" ile silinir)
    pub optional: bool,
}

fn field(key: &'static str, label: &'static str, kind: Kind, value: &str, optional: bool) -> Field {
    Field { key, label, kind, value: value.to_string(), optional }
}

/// sırayla sorulan alanlar
#[derive(Clone, Debug)]
pub struct Fields {
    pub list: Vec<Field>,
    pub idx: usize,
}

impl Fields {
    pub fn done(&self) -> bool {
        self.idx >= self.list.len()
    }

    pub fn prompt(&self) -> Option<String> {
        let f = self.list.get(self.idx)?;
        let cur = if f.value.is_empty() { "yok".to_string() } else { f.value.clone() };
        let extra = if f.optional { " (- : boş bırak)" } else { "" };
        Some(format!("{}{extra} <{cur}>:", f.label))
    }

    pub fn input_kind(&self) -> InputKind {
        match self.list.get(self.idx).map(|f| f.kind) {
            Some(Kind::Text) => InputKind::FreeText,
            Some(_) => InputKind::SingleToken,
            None => InputKind::Point,
        }
    }

    /// yazılan değer: geçerliyse kaydedip ilerler (true), geçersizse false
    pub fn input(&mut self, text: &str) -> bool {
        let Some(f) = self.list.get_mut(self.idx) else { return false };
        let t = text.trim();
        if t.is_empty() {
            self.idx += 1;
            return true;
        }
        if t == "-" && f.optional {
            f.value.clear();
            self.idx += 1;
            return true;
        }
        let num = t.replace(',', ".");
        let ok = match f.kind {
            Kind::Num => num.parse::<f64>().ok().filter(|v| v.is_finite() && *v >= 0.0).map(|v| f.value = fmt(v)).is_some(),
            Kind::Int => num.parse::<u32>().ok().map(|v| f.value = v.to_string()).is_some(),
            Kind::Tip => KatTip::parse(t).map(|k| f.value = k.key().to_string()).is_some(),
            Kind::Text => {
                f.value = t.to_string();
                true
            }
        };
        if ok {
            self.idx += 1;
        }
        ok
    }

    /// Enter: mevcut değerle ilerle (zorunlu alan boşsa ilerlemez)
    pub fn enter(&mut self) -> bool {
        match self.list.get(self.idx) {
            Some(f) if f.value.is_empty() && !f.optional => false,
            Some(_) => {
                self.idx += 1;
                true
            }
            None => false,
        }
    }

    pub fn pairs(&self) -> Vec<(String, String)> {
        self.list.iter().filter(|f| !f.value.is_empty()).map(|f| (f.key.to_string(), f.value.clone())).collect()
    }
}

fn fmt(v: f64) -> String {
    let s = format!("{v:.4}");
    s.trim_end_matches('0').trim_end_matches('.').to_string()
}

#[derive(Clone, Copy, PartialEq, Debug)]
pub enum AlanTur {
    Parsel,
    Kat,
}

/// SAGG_PARSEL / SAGG_KAT: alanlar, sonra köşe noktaları (Enter ya da K ile en az 3 noktada kapanır)
pub struct AlanCommand {
    tur: AlanTur,
    fields: Fields,
    /// köşeler mm
    pts: Vec<[f64; 2]>,
    /// bir çizim biriminin mm karşılığı
    u: f64,
}

impl AlanCommand {
    /// `prev`: varsa önceki parselin / katın değerleri (öneri olarak)
    pub fn new(tur: AlanTur, prev: Option<BTreeMap<String, String>>) -> Self {
        let g = |k: &str| prev.as_ref().and_then(|m| m.get(k).cloned()).unwrap_or_default();
        let list = match tur {
            AlanTur::Parsel => vec![
                field("taks", "TAKS (taban alanı katsayısı, plan notundan)", Kind::Num, &g("taks"), true),
                field("kaks", "KAKS / emsal (plan notundan)", Kind::Num, &g("kaks"), true),
                field("kat", "İzin verilen kat adedi", Kind::Int, &g("kat"), true),
                field("hmax", "Bina yüksekliği Hmax, m (plan notu)", Kind::Num, &g("hmax"), true),
                field("on", "Ön bahçe mesafesi, m (plan notu; boş: PAİY md. 23 — 5,00)", Kind::Num, &g("on"), true),
                field("yan", "Yan bahçe mesafesi, m (plan notu; boş: PAİY md. 23 — 3,00 + kat artışı)", Kind::Num, &g("yan"), true),
                field("arka", "Arka bahçe mesafesi, m (plan notu; boş: PAİY md. 23 — 3,00 + kat artışı)", Kind::Num, &g("arka"), true),
            ],
            AlanTur::Kat => vec![
                field("ad", "Kat adı", Kind::Text, if g("ad").is_empty() { "ZEMİN KAT" } else { "NORMAL KAT" }, false),
                field("tip", "Kat tipi [B=bodrum / Z=zemin / N=normal / C=çatı]", Kind::Tip, if prev.is_some() { "N" } else { "Z" }, false),
                field("tekrar", "Bu kattan kaç adet (aynı plan)", Kind::Int, "1", false),
                field("h", "Kat yüksekliği, döşemeden döşemeye, m", Kind::Num, &g("h"), true),
            ],
        };
        Self { tur, fields: Fields { list, idx: 0 }, pts: Vec::new(), u: 1.0 }
    }

    pub fn with_units(mut self, u: f64) -> Self {
        self.u = u;
        self
    }

    fn finish(&mut self) -> CmdResult {
        if self.pts.len() < 3 || room::area(&self.pts) < 1.0 {
            return CmdResult::Cancel;
        }
        CmdResult::CommitEntitiesAndExit(make_alan(self.tur, &self.pts, &self.fields.pairs()).into_iter().map(|e| super::to_drawing(e, self.u)).collect())
    }
}

/// parsel / kat → çoklu çizgi + etiket yazısı
pub fn make_alan(tur: AlanTur, pts: &[[f64; 2]], pairs: &[(String, String)]) -> Vec<EntityType> {
    let (key, layer) = match tur {
        AlanTur::Parsel => ("parsel", super::LAYER_PARSEL),
        AlanTur::Kat => ("kat", super::LAYER_KAT),
    };
    let mut data: Vec<(String, String)> = vec![("tur".into(), key.into())];
    data.extend(pairs.iter().cloned());
    let mut pl = LwPolyline::new();
    pl.is_closed = true;
    pl.vertices = pts.iter().map(|q| LwVertex::new(Vector2::new(q[0], q[1]))).collect();
    pl.common.layer = layer.to_string();
    super::set_bim_data(&mut pl.common, saggcad_bim::xdata::encode(&data));
    let get = |k: &str| pairs.iter().find(|(a, _)| a == k).map(|(_, v)| v.clone()).unwrap_or_default();
    let alan = room::area_text(room::area(pts));
    let label = match tur {
        AlanTur::Parsel => format!("PARSEL  {alan}"),
        AlanTur::Kat => {
            let n = get("tekrar").parse::<u32>().unwrap_or(1);
            if n > 1 {
                format!("{} ×{n}  brüt {alan}", get("ad"))
            } else {
                format!("{}  brüt {alan}", get("ad"))
            }
        }
    };
    // kat etiketi dış hattın sol üst köşesine yakın (mahal etiketleriyle çakışmasın), parsel etiketi ortada
    let pos = match tur {
        AlanTur::Parsel => room::label_point(pts),
        AlanTur::Kat => {
            let (x0, y1) = pts.iter().fold((f64::MAX, f64::MIN), |(x, y), p| (x.min(p[0]), y.max(p[1])));
            [x0, y1 + 150.0]
        }
    };
    let p = Vector3::new(pos[0], pos[1], 0.0);
    let mut t = Text::with_value(label, p).with_height(super::mahal::TEXT_H);
    if tur == AlanTur::Parsel {
        t.horizontal_alignment = TextHorizontalAlignment::Center;
        t.vertical_alignment = TextVerticalAlignment::Baseline;
        t.alignment_point = Some(p);
    }
    t.common.layer = layer.to_string();
    super::set_bim_data(&mut t.common, saggcad_bim::xdata::encode(&[("tur", format!("{key}_etiket"))]));
    vec![EntityType::LwPolyline(pl), EntityType::Text(t)]
}

impl CadCommand for AlanCommand {
    fn name(&self) -> &'static str {
        match self.tur {
            AlanTur::Parsel => "SAGG_PARSEL",
            AlanTur::Kat => "SAGG_KAT",
        }
    }

    fn prompt(&self) -> String {
        let n = self.name();
        if let Some(p) = self.fields.prompt() {
            return format!("{n}  {p}");
        }
        let what = match self.tur {
            AlanTur::Parsel => "Parsel sınırının",
            AlanTur::Kat => "Brüt kat dış hattının (dış duvar yüzleri)",
        };
        match self.pts.len() {
            0 => format!("{n}  {what} ilk köşe noktası:"),
            1 | 2 => format!("{n}  Sonraki köşe noktası:"),
            _ => format!("{n}  Sonraki köşe noktası [K=kapat] (Enter: kapat ve bitir) — şu an {}:", room::area_text(room::area(&self.pts))),
        }
    }

    fn preserve_commit_layer(&self) -> bool {
        true
    }

    fn wants_text_input(&self) -> bool {
        !self.fields.done()
    }

    fn input_kind(&self) -> InputKind {
        self.fields.input_kind()
    }

    fn options(&self) -> Vec<crate::command::CmdOption> {
        if self.fields.done() && self.pts.len() >= 3 {
            vec![crate::command::CmdOption::new("Kapat", "K")]
        } else {
            vec![]
        }
    }

    fn on_text_input(&mut self, text: &str) -> Option<CmdResult> {
        if !self.fields.done() {
            return self.fields.input(text).then_some(CmdResult::NeedPoint);
        }
        let t = text.trim();
        if t.eq_ignore_ascii_case("K") || t.eq_ignore_ascii_case("C") {
            return Some(self.finish());
        }
        None
    }

    fn on_point(&mut self, pt: DVec3) -> CmdResult {
        if !self.fields.done() {
            // nokta tıklanırsa kalan alanlar mevcut değerleriyle geçilir (zorunlu boş alan yoksa)
            while !self.fields.done() {
                if !self.fields.enter() {
                    return CmdResult::NeedPoint;
                }
            }
        }
        let p = [pt.x * self.u, pt.y * self.u];
        if self.pts.last().map_or(true, |q| (q[0] - p[0]).abs() + (q[1] - p[1]).abs() > 1e-6) {
            self.pts.push(p);
        }
        CmdResult::NeedPoint
    }

    fn on_enter(&mut self) -> CmdResult {
        if !self.fields.done() {
            self.fields.enter();
            return CmdResult::NeedPoint;
        }
        self.finish()
    }

    fn on_mouse_move(&mut self, pt: DVec3) -> Option<WireModel> {
        if self.pts.is_empty() {
            return None;
        }
        let mut pts: Vec<[f64; 3]> = self.pts.iter().map(|q| [q[0], q[1], 0.0]).collect();
        pts.push([pt.x * self.u, pt.y * self.u, 0.0]);
        pts.push([self.pts[0][0], self.pts[0][1], 0.0]);
        Some(WireModel::solid_f64("rubber_band".into(), super::preview_to_drawing(pts, self.u), WireModel::CYAN, false))
    }
}

/// SAGG_IMARVERI: parselin sığınak ve yağmur suyu girdileri
pub struct ImarVeriCommand {
    handle: Handle,
    entity: EntityType,
    fields: Fields,
}

impl ImarVeriCommand {
    pub fn new(handle: Handle, entity: EntityType) -> Self {
        let map = super::bim_data(&entity).unwrap_or_default();
        let g = |k: &str| map.get(k).cloned().unwrap_or_default();
        let list = vec![
            field("bb1", "Sığınak: 1 odalı konut bağımsız bölüm sayısı", Kind::Int, &g("bb1"), true),
            field("bb2", "Sığınak: 2 odalı konut bağımsız bölüm sayısı", Kind::Int, &g("bb2"), true),
            field("bb3", "Sığınak: 3 ve daha fazla odalı konut bağımsız bölüm sayısı", Kind::Int, &g("bb3"), true),
            field("diger", "Sığınak: konut dışı kullanımların emsale konu alanı, m²", Kind::Num, &g("diger"), true),
            field("yagis", "Yağmur suyu: ilin yıllık ortalama yağışı, mm (= L/m²)", Kind::Num, &g("yagis"), true),
            field("katsayi", "Yağmur suyu: çatı yüzey / toplam verim katsayısı (TS EN 16941-1 Ek A)", Kind::Num, &g("katsayi"), true),
            field("otopark_alan", "Otopark: Ek-1'e göre esas alan, m² (konutta BB brüt alanları toplamı)", Kind::Num, &g("otopark_alan"), true),
            field("otopark_oran", "Otopark: Ek-1 oranı — 1 araç / … m²", Kind::Num, &g("otopark_oran"), true),
        ];
        Self { handle, entity, fields: Fields { list, idx: 0 } }
    }

    fn save(&mut self) -> CmdResult {
        let mut map = super::bim_data(&self.entity).unwrap_or_default();
        for f in &self.fields.list {
            if f.value.is_empty() {
                map.remove(f.key);
            } else {
                map.insert(f.key.to_string(), f.value.clone());
            }
        }
        let pairs: Vec<(String, String)> = map.into_iter().filter(|(k, _)| k != "v").collect();
        let mut entity = self.entity.clone();
        super::set_bim_data(entity.common_mut(), saggcad_bim::xdata::encode(&pairs));
        CmdResult::UpdateEntityAndReport { handle: self.handle, entity, message: "SAGG_IMARVERI  İmar girdileri parsele kaydedildi. Rapor için SAGG_IMAR.".into() }
    }

    fn after(&mut self) -> CmdResult {
        if self.fields.done() {
            self.save()
        } else {
            CmdResult::NeedPoint
        }
    }
}

impl CadCommand for ImarVeriCommand {
    fn name(&self) -> &'static str {
        "SAGG_IMARVERI"
    }

    fn prompt(&self) -> String {
        format!("SAGG_IMARVERI  {}", self.fields.prompt().unwrap_or_default())
    }

    fn wants_text_input(&self) -> bool {
        true
    }

    fn input_kind(&self) -> InputKind {
        InputKind::SingleToken
    }

    fn on_text_input(&mut self, text: &str) -> Option<CmdResult> {
        if !self.fields.input(text) {
            return None;
        }
        Some(self.after())
    }

    fn on_point(&mut self, _pt: DVec3) -> CmdResult {
        CmdResult::NeedPoint
    }

    fn on_enter(&mut self) -> CmdResult {
        self.fields.enter();
        self.after()
    }
}

/// SAGG_CEPHE: önce tür (O / Y / A), sonra parsel kenarlarına tıkla; tür istendiği an değiştirilebilir; Enter kaydeder
pub struct CepheCommand {
    handle: Handle,
    entity: EntityType,
    /// parsel köşeleri (mm)
    poly: Vec<[f64; 2]>,
    cephe: Cephe,
    atanan: BTreeMap<usize, Cephe>,
    son: String,
}

impl CepheCommand {
    pub fn new(handle: Handle, entity: EntityType) -> Self {
        let poly = super::outline_of(&entity).unwrap_or_default();
        let map = super::bim_data(&entity).unwrap_or_default();
        let atanan = (0..poly.len()).filter_map(|i| map.get(&format!("kenar{}", i + 1)).and_then(|v| Cephe::parse(v)).map(|c| (i, c))).collect();
        Self { handle, entity, poly, cephe: Cephe::On, atanan, son: String::new() }
    }

    fn save(&mut self) -> CmdResult {
        let mut map = super::bim_data(&self.entity).unwrap_or_default();
        map.retain(|k, _| !k.starts_with("kenar"));
        for (i, c) in &self.atanan {
            map.insert(format!("kenar{}", i + 1), c.key().to_string());
        }
        let pairs: Vec<(String, String)> = map.into_iter().filter(|(k, _)| k != "v").collect();
        let mut entity = self.entity.clone();
        super::set_bim_data(entity.common_mut(), saggcad_bim::xdata::encode(&pairs));
        let ozet: Vec<String> = self.atanan.iter().map(|(i, c)| format!("{} {}", i + 1, c.label())).collect();
        CmdResult::UpdateEntityAndReport { handle: self.handle, entity, message: format!("SAGG_CEPHE  Parsel kenarları kaydedildi: {}.", ozet.join(", ")) }
    }
}

impl CadCommand for CepheCommand {
    fn name(&self) -> &'static str {
        "SAGG_CEPHE"
    }

    fn prompt(&self) -> String {
        format!(
            "SAGG_CEPHE  {}{} kenarına tıklayın [O=ön / Y=yan / A=arka] (Enter: kaydet ve bitir):",
            self.son,
            match self.cephe {
                Cephe::On => "Ön",
                Cephe::Yan => "Yan",
                Cephe::Arka => "Arka",
            }
        )
    }

    fn options(&self) -> Vec<crate::command::CmdOption> {
        vec![crate::command::CmdOption::new("Ön", "O"), crate::command::CmdOption::new("Yan", "Y"), crate::command::CmdOption::new("Arka", "A")]
    }

    fn on_text_input(&mut self, text: &str) -> Option<CmdResult> {
        self.cephe = Cephe::parse(text)?;
        Some(CmdResult::NeedPoint)
    }

    fn on_point(&mut self, pt: DVec3) -> CmdResult {
        if let Some(i) = saggcad_bim::imar::en_yakin_kenar(&self.poly, [pt.x, pt.y]) {
            self.atanan.insert(i, self.cephe);
            self.son = format!("kenar {} → {}. ", i + 1, self.cephe.label());
        }
        CmdResult::NeedPoint
    }

    fn on_enter(&mut self) -> CmdResult {
        self.save()
    }

    fn on_mouse_move(&mut self, pt: DVec3) -> Option<WireModel> {
        let i = saggcad_bim::imar::en_yakin_kenar(&self.poly, [pt.x, pt.y])?;
        let (a, b) = (self.poly[i], self.poly[(i + 1) % self.poly.len()]);
        Some(WireModel::solid_f64("rubber_band".into(), vec![[a[0], a[1], 0.0], [b[0], b[1], 0.0]], WireModel::CYAN, false))
    }
}

inventory::submit!(crate::command::CommandRegistration { names: &["SAGG_PARSEL", "SAGG_KAT", "SAGG_IMARVERI", "SAGG_CEPHE"] }); // AlanCommand, ImarVeriCommand, CepheCommand

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parsel_alanlari_ve_cizim() {
        let mut c = AlanCommand::new(AlanTur::Parsel, None);
        assert!(c.prompt().contains("TAKS") && c.prompt().contains("<yok>"), "{}", c.prompt());
        assert!(matches!(c.on_text_input("0,40"), Some(CmdResult::NeedPoint)));
        assert!(c.on_text_input("abc").is_none(), "geçersiz sayı ilerlemez");
        assert!(matches!(c.on_text_input("1.2"), Some(CmdResult::NeedPoint)));
        assert!(matches!(c.on_enter(), CmdResult::NeedPoint)); // kat adedi yok
        assert!(c.prompt().contains("Hmax"), "{}", c.prompt());
        assert!(matches!(c.on_text_input("15.5"), Some(CmdResult::NeedPoint)));
        // ön / yan / arka bahçe: nokta tıklanınca kalan isteğe bağlı alanlar geçilir
        for (x, y) in [(0.0, 0.0), (20000.0, 0.0), (20000.0, 25000.0), (0.0, 25000.0)] {
            let _ = c.on_point(DVec3::new(x, y, 0.0));
        }
        assert!(c.prompt().contains("500,00 m²"), "{}", c.prompt());
        let CmdResult::CommitEntitiesAndExit(ents) = c.on_enter() else { panic!() };
        let m = super::super::bim_data(&ents[0]).unwrap();
        assert_eq!(m.get("tur").map(String::as_str), Some("parsel"));
        assert_eq!(m.get("taks").map(String::as_str), Some("0.4"));
        assert_eq!(m.get("kaks").map(String::as_str), Some("1.2"));
        assert!(!m.contains_key("kat") && !m.contains_key("on"));
        assert_eq!(m.get("hmax").map(String::as_str), Some("15.5"));
        assert_eq!(ents[0].common().layer, super::super::LAYER_PARSEL);
    }

    #[test]
    fn kat_tipi_ve_tekrar() {
        let mut c = AlanCommand::new(AlanTur::Kat, None);
        assert_eq!(c.input_kind(), InputKind::FreeText, "kat adı boşluk içerebilir");
        let _ = c.on_text_input("NORMAL KAT");
        assert!(c.on_text_input("X").is_none(), "geçersiz tip");
        let _ = c.on_text_input("n");
        let _ = c.on_text_input("3");
        let _ = c.on_text_input("3,2");
        for (x, y) in [(0.0, 0.0), (12000.0, 0.0), (12000.0, 15000.0), (0.0, 15000.0)] {
            let _ = c.on_point(DVec3::new(x, y, 0.0));
        }
        let CmdResult::CommitEntitiesAndExit(ents) = c.on_text_input("K").unwrap() else { panic!() };
        let m = super::super::bim_data(&ents[0]).unwrap();
        assert_eq!((m.get("tip").map(String::as_str), m.get("tekrar").map(String::as_str), m.get("h").map(String::as_str)), (Some("N"), Some("3"), Some("3.2")));
        let EntityType::Text(t) = &ents[1] else { panic!() };
        assert_eq!(t.value, "NORMAL KAT ×3  brüt 180,00 m²");
    }

    #[test]
    fn imar_verisi_parsele_yazilir_ve_silinir() {
        let mut ents = make_alan(AlanTur::Parsel, &[[0.0, 0.0], [1000.0, 0.0], [1000.0, 1000.0]], &[("taks".into(), "0.4".into()), ("yagis".into(), "500".into())]);
        let mut c = ImarVeriCommand::new(Handle::new(5), ents.remove(0));
        assert!(c.prompt().contains("1 odalı") && c.prompt().contains("<yok>"));
        let _ = c.on_text_input("2");
        let _ = c.on_enter(); // bb2 yok
        let _ = c.on_text_input("10");
        let _ = c.on_enter(); // diğer yok
        assert!(c.prompt().contains("<500>"), "kayıtlı değer önerilir: {}", c.prompt());
        let _ = c.on_text_input("-"); // yağış silinir
        assert!(matches!(c.on_text_input("0,8"), Some(CmdResult::NeedPoint)));
        let _ = c.on_text_input("2400");
        let Some(CmdResult::UpdateEntityAndReport { handle, entity, .. }) = c.on_text_input("110") else { panic!() };
        assert_eq!(handle, Handle::new(5));
        let m = super::super::bim_data(&entity).unwrap();
        assert_eq!(m.get("bb1").map(String::as_str), Some("2"));
        assert_eq!(m.get("bb3").map(String::as_str), Some("10"));
        assert_eq!(m.get("katsayi").map(String::as_str), Some("0.8"));
        assert_eq!(m.get("taks").map(String::as_str), Some("0.4"), "imar durumu korunur");
        assert!(!m.contains_key("yagis") && !m.contains_key("bb2"));
        assert_eq!((m.get("otopark_alan").map(String::as_str), m.get("otopark_oran").map(String::as_str)), (Some("2400"), Some("110")));
    }

    #[test]
    fn cephe_kenarlari_isaretlenir() {
        let mut ents = make_alan(AlanTur::Parsel, &[[0.0, 0.0], [20000.0, 0.0], [20000.0, 30000.0], [0.0, 30000.0]], &[("taks".into(), "0.4".into())]);
        let mut c = CepheCommand::new(Handle::new(9), ents.remove(0));
        assert!(c.prompt().contains("Ön kenarına"));
        let _ = c.on_point(DVec3::new(10000.0, 100.0, 0.0)); // kenar 1 ön
        assert!(matches!(c.on_text_input("y"), Some(CmdResult::NeedPoint)));
        let _ = c.on_point(DVec3::new(19900.0, 15000.0, 0.0)); // kenar 2 yan
        let _ = c.on_point(DVec3::new(50.0, 12000.0, 0.0)); // kenar 4 yan
        let _ = c.on_text_input("A");
        let _ = c.on_point(DVec3::new(10000.0, 29000.0, 0.0)); // kenar 3 arka
        assert!(c.prompt().contains("kenar 3 → arka"), "{}", c.prompt());
        let CmdResult::UpdateEntityAndReport { handle, entity, message } = c.on_enter() else { panic!() };
        assert_eq!(handle, Handle::new(9));
        let m = super::super::bim_data(&entity).unwrap();
        let k: Vec<_> = (1..=4).map(|i| m.get(&format!("kenar{i}")).cloned().unwrap_or_default()).collect();
        assert_eq!(k, ["O", "Y", "A", "Y"]);
        assert_eq!(m.get("taks").map(String::as_str), Some("0.4"), "imar durumu korunur");
        assert!(message.contains("1 ön"), "{message}");
    }
}
