// SAGG_DOSEME — betonarme döşeme: kalınlık, sonra köşe noktaları; Enter ya da K (kapat) ile en az 3 noktada biter.
// Kapalı çoklu çizgi (S-DOSEME) + XDATA (tur=doseme, t). Donatı metrajı çokgenin kendisinden hesaplanır.

use codec::entities::{LwPolyline, LwVertex};
use codec::types::Vector2;
use codec::EntityType;
use glam::DVec3;

use crate::command::{CadCommand, CmdResult};
use crate::scene::model::wire_model::WireModel;
use saggcad_bim::rebar::Spec;

pub struct DosemeCommand {
    thickness: f64,
    asked: bool,
    /// köşeler mm
    pts: Vec<[f64; 2]>,
    name: String,
    /// bir çizim biriminin mm karşılığı
    u: f64,
}

impl DosemeCommand {
    pub fn new(names: Vec<String>) -> Self {
        let n = names.iter().filter_map(|s| s.strip_prefix('D').and_then(|x| x.parse::<u32>().ok())).max().unwrap_or(0);
        Self { thickness: 150.0, asked: false, pts: Vec::new(), name: format!("D{}", n + 1), u: 1.0 }
    }

    pub fn with_units(mut self, u: f64) -> Self {
        self.u = u;
        self
    }

    fn finish(&mut self) -> CmdResult {
        if self.pts.len() < 3 {
            return CmdResult::Cancel;
        }
        CmdResult::CommitAndExit(super::to_drawing(make_slab(&self.pts, self.thickness, &self.name), self.u))
    }
}

pub fn make_slab(pts: &[[f64; 2]], thickness: f64, name: &str) -> EntityType {
    let mut pl = LwPolyline::new();
    pl.is_closed = true;
    pl.vertices = pts.iter().map(|q| LwVertex::new(Vector2::new(q[0], q[1]))).collect();
    pl.common.layer = super::LAYER_DOSEME.to_string();
    super::set_bim_data(&mut pl.common, saggcad_bim::xdata::doseme(name, thickness, &Spec::none()));
    EntityType::LwPolyline(pl)
}

impl CadCommand for DosemeCommand {
    fn name(&self) -> &'static str {
        "SAGG_DOSEME"
    }

    fn prompt(&self) -> String {
        if !self.asked {
            return format!("SAGG_DOSEME  Kalınlık, mm <{}>:", self.thickness);
        }
        match self.pts.len() {
            0 => format!("SAGG_DOSEME  {} ilk köşe noktası:", self.name),
            1 | 2 => "SAGG_DOSEME  Sonraki köşe noktası:".into(),
            _ => "SAGG_DOSEME  Sonraki köşe noktası [K=kapat] (Enter: kapat ve bitir):".into(),
        }
    }

    fn preserve_commit_layer(&self) -> bool {
        true
    }

    fn wants_text_input(&self) -> bool {
        !self.asked   // köşe noktalarında yazılan koordinat nokta olarak, "K" seçenek olarak gelir
    }

    fn options(&self) -> Vec<crate::command::CmdOption> {
        if self.asked && self.pts.len() >= 3 {
            vec![crate::command::CmdOption::new("Kapat", "K")]
        } else {
            vec![]
        }
    }

    fn on_text_input(&mut self, text: &str) -> Option<CmdResult> {
        let t = text.trim();
        if !self.asked {
            self.thickness = t.replace(',', ".").parse::<f64>().ok().filter(|v| *v > 0.0 && v.is_finite())?;
            self.asked = true;
            return Some(CmdResult::NeedPoint);
        }
        if t.eq_ignore_ascii_case("K") || t.eq_ignore_ascii_case("C") {
            return Some(self.finish());
        }
        None
    }

    fn on_point(&mut self, pt: DVec3) -> CmdResult {
        self.asked = true;
        let p = [pt.x * self.u, pt.y * self.u];
        if self.pts.last().map_or(true, |q| (q[0] - p[0]).abs() + (q[1] - p[1]).abs() > 1e-6) {
            self.pts.push(p);
        }
        CmdResult::NeedPoint
    }

    fn on_enter(&mut self) -> CmdResult {
        if !self.asked {
            self.asked = true;
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

inventory::submit!(crate::command::CommandRegistration { names: &["SAGG_DOSEME"] }); // DosemeCommand
