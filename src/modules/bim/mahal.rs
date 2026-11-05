// SAGG_MAHAL — mahal etiketi: ad (boşluk içerebilir), numara, sonra mahal sınırının köşe noktaları (Enter ya da K ile
// en az 3 noktada kapanır). Kapalı çoklu çizgi (A-MAHAL, XDATA: tur=mahal, ad, no, alan, cevre) ve ortasına iki satır
// etiket: "NO AD" ve "A = 24,50 m²". Alan çokgenden hesaplanır; imar hesapları (emsal, minimum alanlar) bir sonraki
// aşamada bu kayıtları kullanacak.

use codec::entities::{LwPolyline, LwVertex, Text, TextHorizontalAlignment, TextVerticalAlignment};
use codec::types::{Vector2, Vector3};
use codec::EntityType;
use glam::DVec3;

use crate::command::{CadCommand, CmdResult, InputKind};
use crate::scene::model::wire_model::WireModel;
use saggcad_bim::room;

/// etiket yazı yüksekliği (mm) — 1/50 paftada 5 mm
pub const TEXT_H: f64 = 250.0;

#[derive(Clone, Copy, PartialEq, Debug)]
enum Step {
    Name,
    No,
    Points,
}

pub struct MahalCommand {
    step: Step,
    name: String,
    no: String,
    /// köşeler mm
    pts: Vec<[f64; 2]>,
    /// bir çizim biriminin mm karşılığı
    u: f64,
}

impl MahalCommand {
    /// `existing_nos`: belgedeki mahal numaraları (sıradaki önerilir)
    pub fn new(existing_nos: Vec<String>) -> Self {
        let n = existing_nos.iter().filter_map(|s| s.trim().parse::<u32>().ok()).max().unwrap_or(0);
        Self { step: Step::Name, name: "ODA".into(), no: format!("{:02}", n + 1), pts: Vec::new(), u: 1.0 }
    }

    pub fn with_units(mut self, u: f64) -> Self {
        self.u = u;
        self
    }

    fn finish(&mut self) -> CmdResult {
        if self.pts.len() < 3 || room::area(&self.pts) < 1.0 {
            return CmdResult::Cancel;
        }
        CmdResult::CommitEntitiesAndExit(make_room(&self.pts, &self.name, &self.no).into_iter().map(|e| super::to_drawing(e, self.u)).collect())
    }
}

/// mahal → sınır çoklu çizgisi + iki satır etiket
pub fn make_room(pts: &[[f64; 2]], name: &str, no: &str) -> Vec<EntityType> {
    let mut pl = LwPolyline::new();
    pl.is_closed = true;
    pl.vertices = pts.iter().map(|q| LwVertex::new(Vector2::new(q[0], q[1]))).collect();
    pl.common.layer = super::LAYER_MAHAL.to_string();
    super::set_bim_data(&mut pl.common, room::xdata(name, no, pts));
    let c = room::label_point(pts);
    let title = if no.is_empty() { name.to_string() } else { format!("{no} {name}") };
    let label = |value: String, y: f64, h: f64| {
        let pos = Vector3::new(c[0], y, 0.0);
        let mut t = Text::with_value(value, pos).with_height(h);
        t.horizontal_alignment = TextHorizontalAlignment::Center;
        t.vertical_alignment = TextVerticalAlignment::Baseline;
        t.alignment_point = Some(pos);
        t.common.layer = super::LAYER_MAHAL.to_string();
        super::set_bim_data(&mut t.common, saggcad_bim::xdata::encode(&[("tur", "mahal_etiket".to_string()), ("ad", name.to_string()), ("no", no.to_string())]));
        EntityType::Text(t)
    };
    vec![
        EntityType::LwPolyline(pl),
        label(title, c[1] + TEXT_H * 0.3, TEXT_H),
        label(format!("A = {}", room::area_text(room::area(pts))), c[1] - TEXT_H * 1.2, TEXT_H * 0.8),
    ]
}

impl CadCommand for MahalCommand {
    fn name(&self) -> &'static str {
        "SAGG_MAHAL"
    }

    fn prompt(&self) -> String {
        match self.step {
            Step::Name => format!("SAGG_MAHAL  Mahal adı <{}>:", self.name),
            Step::No => format!("SAGG_MAHAL  Mahal numarası (boş bırakmak için -) <{}>:", self.no),
            Step::Points => match self.pts.len() {
                0 => format!("SAGG_MAHAL  {} {} sınırının ilk köşe noktası:", self.no, self.name),
                1 | 2 => "SAGG_MAHAL  Sonraki köşe noktası:".into(),
                _ => format!("SAGG_MAHAL  Sonraki köşe noktası [K=kapat] (Enter: kapat ve bitir) — şu an {}:", room::area_text(room::area(&self.pts))),
            },
        }
    }

    fn preserve_commit_layer(&self) -> bool {
        true
    }

    fn wants_text_input(&self) -> bool {
        matches!(self.step, Step::Name | Step::No)
    }

    fn input_kind(&self) -> InputKind {
        match self.step {
            // mahal adında boşluk olabilir ("YATAK ODASI"), yazım korunur
            Step::Name => InputKind::FreeText,
            Step::No => InputKind::SingleToken,
            Step::Points => InputKind::Point,
        }
    }

    fn options(&self) -> Vec<crate::command::CmdOption> {
        if self.step == Step::Points && self.pts.len() >= 3 {
            vec![crate::command::CmdOption::new("Kapat", "K")]
        } else {
            vec![]
        }
    }

    fn on_text_input(&mut self, text: &str) -> Option<CmdResult> {
        let t = text.trim();
        match self.step {
            Step::Name => {
                if !t.is_empty() {
                    self.name = t.to_string();
                }
                self.step = Step::No;
            }
            Step::No => {
                if t == "-" {
                    self.no.clear();
                } else if !t.is_empty() {
                    self.no = t.to_string();
                }
                self.step = Step::Points;
            }
            Step::Points => {
                if t.eq_ignore_ascii_case("K") || t.eq_ignore_ascii_case("C") {
                    return Some(self.finish());
                }
                return None;
            }
        }
        Some(CmdResult::NeedPoint)
    }

    fn on_point(&mut self, pt: DVec3) -> CmdResult {
        self.step = Step::Points;
        let p = [pt.x * self.u, pt.y * self.u];
        if self.pts.last().map_or(true, |q| (q[0] - p[0]).abs() + (q[1] - p[1]).abs() > 1e-6) {
            self.pts.push(p);
        }
        CmdResult::NeedPoint
    }

    fn on_enter(&mut self) -> CmdResult {
        match self.step {
            Step::Name => self.step = Step::No,
            Step::No => self.step = Step::Points,
            Step::Points => return self.finish(),
        }
        CmdResult::NeedPoint
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

inventory::submit!(crate::command::CommandRegistration { names: &["SAGG_MAHAL"] }); // MahalCommand

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mahal_etiketi_alan_ve_xdata() {
        let mut c = MahalCommand::new(vec!["01".into(), "03".into()]);
        assert!(c.prompt().contains("<ODA>"));
        assert_eq!(c.input_kind(), InputKind::FreeText);
        assert!(matches!(c.on_text_input("YATAK ODASI"), Some(CmdResult::NeedPoint)));
        assert!(c.prompt().contains("<04>"), "{}", c.prompt());
        assert!(matches!(c.on_enter(), CmdResult::NeedPoint));
        for (x, y) in [(0.0, 0.0), (4000.0, 0.0), (4000.0, 3500.0), (0.0, 3500.0)] {
            assert!(matches!(c.on_point(DVec3::new(x, y, 0.0)), CmdResult::NeedPoint));
        }
        assert!(c.prompt().contains("14,00 m²"), "{}", c.prompt());
        let CmdResult::CommitEntitiesAndExit(ents) = c.on_enter() else { panic!("Enter kapatmalı") };
        assert_eq!(ents.len(), 3);
        let m = super::super::bim_data(&ents[0]).unwrap();
        assert_eq!(m.get("tur").map(String::as_str), Some("mahal"));
        assert_eq!(m.get("ad").map(String::as_str), Some("YATAK ODASI"));
        assert_eq!(m.get("no").map(String::as_str), Some("04"));
        assert_eq!(m.get("alan").map(String::as_str), Some("14.00"));
        let texts: Vec<String> = ents.iter().filter_map(|e| if let EntityType::Text(t) = e { Some(t.value.clone()) } else { None }).collect();
        assert_eq!(texts, vec!["04 YATAK ODASI".to_string(), "A = 14,00 m²".to_string()]);
        assert!(ents.iter().all(|e| e.common().layer == super::super::LAYER_MAHAL));
    }

    #[test]
    fn iki_noktada_kapanmaz() {
        let mut c = MahalCommand::new(Vec::new());
        assert!(c.prompt().contains("<ODA>"));
        let _ = c.on_point(DVec3::ZERO);
        let _ = c.on_point(DVec3::new(1000.0, 0.0, 0.0));
        assert!(matches!(c.on_enter(), CmdResult::Cancel));
    }
}
