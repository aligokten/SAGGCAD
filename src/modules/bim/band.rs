// SAGG_KIRIS / SAGG_PERDE / SAGG_DUVAR — iki nokta + kesit + hiza (eksen / sol yüz / sağ yüz) → kapalı dış hat (çoklu çizgi)
// + XDATA. Zincirleme: bir sonraki eleman öncekinin bitişinden başlar; Enter bitirir.

use codec::entities::{LwPolyline, LwVertex};
use codec::types::Vector2;
use codec::EntityType;
use glam::DVec3;

use crate::command::{CadCommand, CmdResult};
use crate::scene::model::wire_model::WireModel;
use saggcad_bim::band::{outline, Align};
use saggcad_bim::rebar::Spec;

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum BandKind {
    Kiris,
    Perde,
    Duvar,
}

#[derive(Clone, Copy, PartialEq)]
enum Step {
    Size,
    Height,
    Align,
    Start,
    End([f64; 2]),
}

pub struct BandCommand {
    kind: BandKind,
    step: Step,
    /// kiriş: genişlik b; perde: kalınlık t (mm)
    width: f64,
    /// kiriş: kesit yüksekliği h; perde: yükseklik H (mm)
    height: f64,
    align: Align,
    names: Vec<String>,
}

impl BandCommand {
    pub fn new(kind: BandKind, names: Vec<String>) -> Self {
        let (width, height) = match kind {
            BandKind::Kiris => (250.0, 500.0),
            BandKind::Perde => (250.0, 2800.0),
            BandKind::Duvar => (200.0, 2800.0),
        };
        Self { kind, step: Step::Size, width, height, align: Align::Axis, names }
    }

    fn prefix(&self) -> &'static str {
        match self.kind {
            BandKind::Kiris => "K",
            BandKind::Perde => "P",
            BandKind::Duvar => "DV",
        }
    }

    fn next_name(&self) -> String {
        let p = self.prefix();
        let n = self.names.iter().filter_map(|s| s.strip_prefix(p).and_then(|x| x.parse::<u32>().ok())).max().unwrap_or(0);
        format!("{p}{}", n + 1)
    }

    /// iki nokta → eleman (None: çakışık noktalar)
    pub fn make(&mut self, a: [f64; 2], b: [f64; 2]) -> Option<EntityType> {
        let name = self.next_name();
        let e = make_band(self.kind, a, b, self.width, self.height, self.align, &name)?;
        self.names.push(name);
        Some(e)
    }
}

pub fn make_band(kind: BandKind, a: [f64; 2], b: [f64; 2], width: f64, height: f64, align: Align, name: &str) -> Option<EntityType> {
    let o = outline(a, b, width, align)?;
    if kind == BandKind::Duvar {
        // boşluksuz duvar: tek parça; kapı / pencere eklenince SAGG_KAPI / SAGG_PENCERE parçalara böler
        let wall = saggcad_bim::wall::Wall::new(name, a, b, width, height, align);
        return super::wall_entities(&wall).into_iter().next();
    }
    let len = ((b[0] - a[0]).powi(2) + (b[1] - a[1]).powi(2)).sqrt();
    let mut pl = LwPolyline::new();
    pl.is_closed = true;
    pl.vertices = o.iter().map(|q| LwVertex::new(Vector2::new(q[0], q[1]))).collect();
    let (layer, data) = match kind {
        BandKind::Kiris => (super::LAYER_KIRIS, saggcad_bim::xdata::kiris(name, len, width, height, &Spec::none())),
        BandKind::Perde => (super::LAYER_PERDE, saggcad_bim::xdata::perde(name, len, width, height, &Spec::none())),
        BandKind::Duvar => unreachable!(),
    };
    pl.common.layer = layer.to_string();
    super::set_bim_data(&mut pl.common, data);
    Some(EntityType::LwPolyline(pl))
}

impl CadCommand for BandCommand {
    fn name(&self) -> &'static str {
        match self.kind {
            BandKind::Kiris => "SAGG_KIRIS",
            BandKind::Perde => "SAGG_PERDE",
            BandKind::Duvar => "SAGG_DUVAR",
        }
    }

    fn prompt(&self) -> String {
        let n = self.name();
        match (self.kind, self.step) {
            (BandKind::Kiris, Step::Size) => format!("{n}  Kesit b x h, mm <{}x{}>:", self.width, self.height),
            (BandKind::Perde | BandKind::Duvar, Step::Size) => format!("{n}  Kalınlık, mm <{}>:", self.width),
            (_, Step::Height) => format!("{n}  Yükseklik, mm <{}>:", self.height),
            (_, Step::Align) => format!("{n}  Çizgi nerede [E=eksen / S=sol yüz / G=sağ yüz] <E>:"),
            (_, Step::Start) => format!("{n}  {} başlangıç noktası:", self.next_name()),
            (_, Step::End(_)) => format!("{n}  {} bitiş noktası (Enter: bitir):", self.next_name()),
        }
    }

    fn preserve_commit_layer(&self) -> bool {
        true
    }

    fn wants_text_input(&self) -> bool {
        matches!(self.step, Step::Size | Step::Height | Step::Align)
    }

    fn on_text_input(&mut self, text: &str) -> Option<CmdResult> {
        let num = |t: &str| t.trim().replace(',', ".").parse::<f64>().ok().filter(|v| *v > 0.0 && v.is_finite());
        match self.step {
            Step::Size => match self.kind {
                BandKind::Kiris => {
                    let t = text.trim().to_ascii_lowercase().replace('×', "x");
                    let (a, b) = t.split_once(['x', '*'])?;
                    self.width = num(a)?;
                    self.height = num(b)?;
                    self.step = Step::Align;
                }
                BandKind::Perde | BandKind::Duvar => {
                    self.width = num(text)?;
                    self.step = Step::Height;
                }
            },
            Step::Height => {
                self.height = num(text)?;
                self.step = Step::Align;
            }
            Step::Align => {
                self.align = Align::parse(text)?;
                self.step = Step::Start;
            }
            _ => return None,
        }
        Some(CmdResult::NeedPoint)
    }

    fn on_point(&mut self, pt: DVec3) -> CmdResult {
        let p = [pt.x, pt.y];
        match self.step {
            Step::Start => {
                self.step = Step::End(p);
                CmdResult::NeedPoint
            }
            Step::End(a) => match self.make(a, p) {
                Some(e) => {
                    self.step = Step::End(p); // zincirleme
                    CmdResult::CommitEntity(e)
                }
                None => CmdResult::NeedPoint,
            },
            _ => {
                self.step = Step::Start;
                CmdResult::NeedPoint
            }
        }
    }

    fn on_enter(&mut self) -> CmdResult {
        self.step = match self.step {
            Step::Size if self.kind != BandKind::Kiris => Step::Height,
            Step::Size | Step::Height => Step::Align,
            Step::Align => Step::Start,
            Step::Start | Step::End(_) => return CmdResult::Cancel,
        };
        CmdResult::NeedPoint
    }

    fn on_mouse_move(&mut self, pt: DVec3) -> Option<WireModel> {
        let Step::End(a) = self.step else { return None };
        let o = outline(a, [pt.x, pt.y], self.width, self.align)?;
        let mut pts: Vec<[f64; 3]> = o.iter().map(|q| [q[0], q[1], 0.0]).collect();
        pts.push([o[0][0], o[0][1], 0.0]);
        Some(WireModel::solid_f64("rubber_band".into(), pts, WireModel::CYAN, false))
    }
}

inventory::submit!(crate::command::CommandRegistration { names: &["SAGG_KIRIS", "SAGG_PERDE", "SAGG_DUVAR"] }); // BandCommand
