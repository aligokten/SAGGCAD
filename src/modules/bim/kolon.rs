// SAGG_KOLON — betonarme kolon: kesit (b×h), yükseklik ve yerleştirme noktası (merkez ya da bir köşe).
// Her kolon kapalı bir çoklu çizgi (S-KOLON katmanı) + XDATA (tur=kolon, ölçüler, donatı kaynağı). Art arda yerleştirilir.

use codec::entities::{LwPolyline, LwVertex};
use codec::types::Vector2;
use codec::EntityType;
use glam::DVec3;

use crate::command::{CadCommand, CmdResult};
use crate::scene::model::wire_model::WireModel;
use saggcad_bim::column::{self, Anchor};
use saggcad_bim::rebar::Spec;

#[derive(Clone, Copy, PartialEq)]
enum Step {
    Size,
    Height,
    Anchor,
    Place,
}

pub struct KolonCommand {
    step: Step,
    b: f64,
    h: f64,
    height: f64,
    anchor: Anchor,
    names: Vec<String>,
    /// bir çizim biriminin mm karşılığı
    u: f64,
}

impl KolonCommand {
    pub fn new(names: Vec<String>) -> Self {
        Self { step: Step::Size, b: 300.0, h: 500.0, height: 2800.0, anchor: Anchor::Center, names, u: 1.0 }
    }

    fn next_name(&self) -> String {
        let n = self.names.iter().filter_map(|s| s.strip_prefix('S').and_then(|x| x.parse::<u32>().ok())).max().unwrap_or(0);
        format!("S{}", n + 1)
    }

    pub fn with_units(mut self, u: f64) -> Self {
        self.u = u;
        self
    }

    /// yerleştirmeden sonra aynı ölçülerle sürdür (nokta adımından)
    pub fn resume(mut self, b: f64, h: f64, height: f64, anchor: Anchor) -> Self {
        self.b = b;
        self.h = h;
        self.height = height;
        self.anchor = anchor;
        self.step = Step::Place;
        self
    }

    /// tıklanan nokta (çizim biriminde) → dinamik blok yerleştirme isteği (mm). Uygulama SAGG_KOLON_KOY ile tanımı
    /// kurar, örneği koyar ve komutu sürdürür.
    pub fn place_request(&mut self, p: [f64; 2]) -> String {
        let name = self.next_name();
        self.names.push(name.clone());
        let p = [p[0] * self.u, p[1] * self.u];
        let c = column::center_from_anchor(p, self.b, self.h, 0.0, self.anchor);
        format!("SAGG_KOLON_KOY {} {} {} {} {} {} {}", self.b, self.h, self.height, anchor_key(self.anchor), c[0], c[1], name)
    }

    /// tıklanan nokta (çizim biriminde) → kolon nesnesi
    pub fn make(&mut self, p: [f64; 2]) -> EntityType {
        let name = self.next_name();
        self.names.push(name.clone());
        let p = [p[0] * self.u, p[1] * self.u];
        super::to_drawing(make_column(p, self.b, self.h, self.height, self.anchor, &name), self.u)
    }

    /// önizleme dış hattı (çizim biriminde)
    fn outline_at(&self, p: [f64; 2]) -> [[f64; 2]; 4] {
        let p = [p[0] * self.u, p[1] * self.u];
        let c = column::center_from_anchor(p, self.b, self.h, 0.0, self.anchor);
        column::outline(c, self.b, self.h, 0.0).map(|q| [q[0] / self.u, q[1] / self.u])
    }
}

pub fn make_column(p: [f64; 2], b: f64, h: f64, height: f64, anchor: Anchor, name: &str) -> EntityType {
    let c = column::center_from_anchor(p, b, h, 0.0, anchor);
    let mut pl = LwPolyline::new();
    pl.is_closed = true;
    pl.vertices = column::outline(c, b, h, 0.0).iter().map(|q| LwVertex::new(Vector2::new(q[0], q[1]))).collect();
    pl.common.layer = super::LAYER_KOLON.to_string();
    super::set_bim_data(&mut pl.common, saggcad_bim::xdata::kolon(name, b, h, height, &Spec::none()));
    EntityType::LwPolyline(pl)
}

fn anchor_key(a: Anchor) -> &'static str {
    match a {
        Anchor::Center => "M",
        Anchor::BottomLeft => "SA",
        Anchor::BottomRight => "GA",
        Anchor::TopRight => "GU",
        Anchor::TopLeft => "SU",
    }
}

fn parse_size(text: &str) -> Option<(f64, f64)> {
    let t = text.trim().to_ascii_lowercase().replace('×', "x").replace(',', ".");
    let (a, b) = t.split_once(['x', '*', ' '])?;
    let (a, b) = (a.trim().parse::<f64>().ok()?, b.trim().parse::<f64>().ok()?);
    (a > 0.0 && b > 0.0 && a.is_finite() && b.is_finite()).then_some((a, b))
}

impl CadCommand for KolonCommand {
    fn name(&self) -> &'static str {
        "SAGG_KOLON"
    }

    fn prompt(&self) -> String {
        match self.step {
            Step::Size => format!("SAGG_KOLON  Kesit b x h, mm <{}x{}>:", self.b, self.h),
            Step::Height => format!("SAGG_KOLON  Yükseklik, mm <{}>:", self.height),
            Step::Anchor => "SAGG_KOLON  Yerleştirme noktası [M=merkez / SA=sol alt / GA=sağ alt / GU=sağ üst / SU=sol üst] <M>:".into(),
            Step::Place => format!("SAGG_KOLON  {} için noktayı belirtin (aks kesişimine / köşeye yaslanır; Enter: bitir):", self.next_name()),
        }
    }

    fn preserve_commit_layer(&self) -> bool {
        true
    }

    fn wants_text_input(&self) -> bool {
        !matches!(self.step, Step::Place)
    }

    fn on_text_input(&mut self, text: &str) -> Option<CmdResult> {
        match self.step {
            Step::Size => {
                let (b, h) = parse_size(text)?;
                self.b = b;
                self.h = h;
                self.step = Step::Height;
            }
            Step::Height => {
                let v: f64 = text.trim().replace(',', ".").parse().ok().filter(|v: &f64| *v > 0.0 && v.is_finite())?;
                self.height = v;
                self.step = Step::Anchor;
            }
            Step::Anchor => {
                self.anchor = Anchor::parse(text)?;
                self.step = Step::Place;
            }
            Step::Place => return None,
        }
        Some(CmdResult::NeedPoint)
    }

    fn on_point(&mut self, pt: DVec3) -> CmdResult {
        match self.step {
            Step::Place => CmdResult::Dispatch(self.place_request([pt.x, pt.y])),
            _ => {
                self.step = Step::Place;
                CmdResult::NeedPoint
            }
        }
    }

    fn on_enter(&mut self) -> CmdResult {
        match self.step {
            Step::Size => self.step = Step::Height,
            Step::Height => self.step = Step::Anchor,
            Step::Anchor => self.step = Step::Place,
            Step::Place => return CmdResult::Cancel,
        }
        CmdResult::NeedPoint
    }

    fn on_mouse_move(&mut self, pt: DVec3) -> Option<WireModel> {
        if self.step != Step::Place {
            return None;
        }
        let o = self.outline_at([pt.x, pt.y]);
        let mut pts: Vec<[f64; 3]> = o.iter().map(|q| [q[0], q[1], 0.0]).collect();
        pts.push([o[0][0], o[0][1], 0.0]);
        Some(WireModel::solid_f64("rubber_band".into(), pts, WireModel::CYAN, false))
    }
}

inventory::submit!(crate::command::CommandRegistration { names: &["SAGG_KOLON", "SAGG_KOLON_KOY"] }); // KolonCommand

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn kolon_komutu_kose_yerlestirme_ve_xdata() {
        // çoklu çizgi biçimi (eski çizimler ve donatı testleri için korunur)
        let e = make_column([1000.0, 0.0], 300.0, 500.0, 2800.0, Anchor::BottomLeft, "S2");
        let EntityType::LwPolyline(pl) = &e else { panic!() };
        assert!(pl.is_closed);
        assert_eq!(pl.vertices[0].location, Vector2::new(1000.0, 0.0));
        assert_eq!(pl.vertices[2].location, Vector2::new(1300.0, 500.0));
        assert_eq!(pl.common.layer, "S-KOLON");
        let m = super::super::bim_data(&e).unwrap();
        assert_eq!(m.get("tur").map(String::as_str), Some("kolon"));
        assert_eq!(m.get("b").map(String::as_str), Some("300"));
        assert_eq!(m.get("rb").map(String::as_str), Some("none"));
        // komut: sol alt köşeden yerleştirme → merkez (1150, 250) için dinamik blok isteği
        let mut c = KolonCommand::new(vec!["S1".into()]);
        assert!(matches!(c.on_text_input("300x500"), Some(CmdResult::NeedPoint)));
        assert!(matches!(c.on_text_input("2800"), Some(CmdResult::NeedPoint)));
        assert!(matches!(c.on_text_input("SA"), Some(CmdResult::NeedPoint)));
        let CmdResult::Dispatch(line) = c.on_point(DVec3::new(1000.0, 0.0, 0.0)) else { panic!("yerleştirme isteği beklenir") };
        assert_eq!(line, "SAGG_KOLON_KOY 300 500 2800 SA 1150 250 S2");
        assert!(c.on_text_input("bozuk").is_none());
        // metre çiziminde nokta mm'ye çevrilir
        let mut c = KolonCommand::new(Vec::new()).with_units(1000.0).resume(300.0, 500.0, 2800.0, Anchor::Center);
        let CmdResult::Dispatch(line) = c.on_point(DVec3::new(2.0, 3.0, 0.0)) else { panic!() };
        assert_eq!(line, "SAGG_KOLON_KOY 300 500 2800 M 2000 3000 S1");
    }
}
