// SAGG_AKS — aks sistemi: aralıkları yazarak düşey (1, 2, 3…) ve yatay (A, B, C…) akslar.
// Her aks bir çizgi (XDATA: tur=aks), uçlarında baloncuk dairesi ve ad yazısı; hepsi S-AKS katmanında, tek geri al.

use codec::entities::{Circle, Line, Text};
use codec::types::Vector3;
use codec::EntityType;
use glam::DVec3;

use crate::command::{CadCommand, CmdResult};
use saggcad_bim::{axis, grids};

#[derive(Clone, Copy, PartialEq)]
enum Step {
    Xs,
    Ys,
    Origin,
}

pub struct AksCommand {
    step: Step,
    xs: Vec<f64>,
    ys: Vec<f64>,
    existing: Vec<String>,
    /// taşma ve baloncuk yarıçapı (mm)
    over: f64,
    bubble: f64,
    /// bir çizim biriminin mm karşılığı
    u: f64,
}

impl AksCommand {
    pub fn new(existing: Vec<String>) -> Self {
        Self { step: Step::Xs, xs: vec![4000.0, 4000.0], ys: vec![3500.0, 3500.0], existing, over: 1500.0, bubble: 300.0, u: 1.0 }
    }

    fn list(v: &[f64]) -> String {
        v.iter().map(|x| format!("{x}")).collect::<Vec<_>>().join(" ")
    }

    pub fn with_units(mut self, u: f64) -> Self {
        self.u = u;
        self
    }

    /// aks sistemi → DWG nesneleri (origin çizim biriminde; ölçüler mm)
    pub fn entities(&self, origin: [f64; 2]) -> Vec<EntityType> {
        let o = [origin[0] * self.u, origin[1] * self.u];
        build_entities(&self.xs, &self.ys, o, self.over, self.bubble, &self.existing).into_iter().map(|e| super::to_drawing(e, self.u)).collect()
    }
}

pub fn build_entities(xs: &[f64], ys: &[f64], origin: [f64; 2], over: f64, bubble: f64, existing: &[String]) -> Vec<EntityType> {
    let sys = axis::build(xs, ys, origin, over, bubble, existing);
    let mut out = Vec::new();
    for ax in &sys.axes {
        let mut line = Line::from_points(Vector3::new(ax.a[0], ax.a[1], 0.0), Vector3::new(ax.b[0], ax.b[1], 0.0));
        line.common.layer = super::LAYER_AKS.to_string();
        line.common.color = codec::types::Color::Index(1);
        super::set_bim_data(&mut line.common, saggcad_bim::xdata::aks(&ax.name, ax.kind == grids::AxisKind::Letter));
        out.push(EntityType::Line(line));
    }
    for b in &sys.bubbles {
        let mut c = Circle::from_center_radius(Vector3::new(b.center[0], b.center[1], 0.0), b.radius);
        c.common.layer = super::LAYER_AKS.to_string();
        out.push(EntityType::Circle(c));
        let h = b.radius * 0.9;
        let w = h * 0.6 * b.axis.chars().count() as f64;   // yaklaşık ortalama (sol hizalı yazı)
        let mut t = Text::with_value(b.axis.clone(), Vector3::new(b.center[0] - w / 2.0, b.center[1] - h / 2.0, 0.0)).with_height(h);
        t.common.layer = super::LAYER_AKS.to_string();
        out.push(EntityType::Text(t));
    }
    out
}

impl CadCommand for AksCommand {
    fn name(&self) -> &'static str {
        "SAGG_AKS"
    }

    fn prompt(&self) -> String {
        match self.step {
            Step::Xs => format!("SAGG_AKS  Düşey akslar arası, mm (ör. 4000 5000 ya da 3x4000) <{}>:", Self::list(&self.xs)),
            Step::Ys => format!("SAGG_AKS  Yatay akslar arası, mm <{}>:", Self::list(&self.ys)),
            Step::Origin => "SAGG_AKS  İlk aks kesişim noktasını belirtin:".into(),
        }
    }

    fn preserve_commit_layer(&self) -> bool {
        true
    }

    fn wants_text_input(&self) -> bool {
        matches!(self.step, Step::Xs | Step::Ys)
    }

    fn on_text_input(&mut self, text: &str) -> Option<CmdResult> {
        let v = grids::parse_spacing(text)?;
        match self.step {
            Step::Xs => {
                self.xs = v;
                self.step = Step::Ys;
            }
            Step::Ys => {
                if v.is_empty() && self.xs.is_empty() {
                    return None;
                }
                self.ys = v;
                self.step = Step::Origin;
            }
            Step::Origin => return None,
        }
        Some(CmdResult::NeedPoint)
    }

    fn on_point(&mut self, pt: DVec3) -> CmdResult {
        match self.step {
            Step::Origin => CmdResult::CommitEntitiesAndExit(self.entities([pt.x, pt.y])),
            // aralık sorulurken tıklama: varsayılanla devam
            Step::Xs => {
                self.step = Step::Ys;
                CmdResult::NeedPoint
            }
            Step::Ys => {
                self.step = Step::Origin;
                CmdResult::NeedPoint
            }
        }
    }

    fn on_enter(&mut self) -> CmdResult {
        match self.step {
            Step::Xs => {
                self.step = Step::Ys;
                CmdResult::NeedPoint
            }
            Step::Ys => {
                self.step = Step::Origin;
                CmdResult::NeedPoint
            }
            Step::Origin => CmdResult::Cancel,
        }
    }
}

inventory::submit!(crate::command::CommandRegistration { names: &["SAGG_AKS"] }); // AksCommand
