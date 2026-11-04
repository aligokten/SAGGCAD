// SAGG_KAPI / SAGG_PENCERE — çizilmiş bir duvara kapı ya da pencere ekle.
//
// Akış: duvarı seç → genişlik → yükseklik → (pencere: parapet) → duvar üzerinde yer (orta nokta, duvar ucuna taşmaz)
// → (kapı: kanadın açılacağı tarafa tıkla; menteşe tıklanan noktaya yakın uçta). Duvar, boşluklar arasında kalan dolu
// parçalara bölünerek yeniden çizilir; sembol ve tüm parçalar tek geri al adımıdır. Boşluk duvara sığmazsa (uç dışı,
// başka boşlukla çakışma) neden yazılır ve yer yeniden sorulur.

use codec::{EntityType, Handle};
use glam::DVec3;

use crate::command::{CadCommand, CmdResult};
use crate::scene::model::wire_model::WireModel;
use saggcad_bim::wall::{next_name, OpKind, Opening, Wall};

#[derive(Clone, Copy, PartialEq, Debug)]
enum Step {
    Pick,
    Width,
    Height,
    Sill,
    Place,
    Side(f64),
}

pub struct BoslukCommand {
    kind: OpKind,
    step: Step,
    w: f64,
    h: f64,
    sill: f64,
    picked: Option<EntityType>,
    /// seçilen duvar (parçanın köşelerinden kurulmuş)
    wall: Option<(Handle, Wall)>,
    /// komut başında belgedeki duvar parçaları ve boşluk sembolleri (eski hâli silmek için)
    related: Vec<(Handle, EntityType)>,
    names: Vec<String>,
    note: String,
}

impl BoslukCommand {
    pub fn new(kind: OpKind, related: Vec<(Handle, EntityType)>) -> Self {
        let names = related
            .iter()
            .filter_map(|(_, e)| super::bim_data(e))
            .filter(|m| m.get("tur").map(String::as_str) == Some(kind.key()))
            .filter_map(|m| m.get("ad").cloned())
            .chain(related.iter().filter_map(|(_, e)| super::wall_of(e)).flat_map(|w| w.openings.into_iter().map(|o| o.name)))
            .collect();
        let (w, h, sill) = match kind {
            OpKind::Kapi => (900.0, 2100.0, 0.0),
            OpKind::Pencere => (1200.0, 1500.0, 900.0),
        };
        Self { kind, step: Step::Pick, w, h, sill, picked: None, wall: None, related, names, note: String::new() }
    }

    fn prefix(&self) -> &'static str {
        match self.kind {
            OpKind::Kapi => "KP",
            OpKind::Pencere => "PN",
        }
    }

    fn opening(&self, at: f64, side: i8, hinge_end: bool) -> Opening {
        Opening { kind: self.kind, name: next_name(self.prefix(), &self.names), at, w: self.w, h: self.h, sill: self.sill, side, hinge_end }
    }

    /// boşluğu ekle; sığarsa eski duvar parçaları ve sembolleri silinip yeni hâli çizilir
    fn commit(&mut self, op: Opening) -> CmdResult {
        let Some((handle, wall)) = self.wall.clone() else { return CmdResult::Cancel };
        let mut new_wall = wall.clone();
        if let Err(e) = new_wall.add(op.clone()) {
            self.note = format!("{} sığmadı: {e}. ", op.name);
            self.step = Step::Place;
            return CmdResult::NeedPoint;
        }
        let mut erase: Vec<Handle> = vec![handle];
        for (h, e) in &self.related {
            if *h == handle {
                continue;
            }
            let Some(map) = super::bim_data(e) else { continue };
            let same = match map.get("tur").map(String::as_str) {
                Some("duvar") => super::wall_of(e).is_some_and(|w| w.same_as(&wall)),
                Some("kapi" | "pencere") => map.get("duvar") == Some(&wall.name) && super::anchor_point(e).is_some_and(|p| wall.near(p)),
                _ => false,
            };
            if same {
                erase.push(*h);
            }
        }
        let mut pairs: Vec<(Handle, Vec<EntityType>)> = erase.into_iter().map(|h| (h, Vec::new())).collect();
        pairs[0].1 = super::wall_entities(&new_wall);
        CmdResult::ReplaceMany(pairs, Vec::new())
    }
}

impl CadCommand for BoslukCommand {
    fn name(&self) -> &'static str {
        match self.kind {
            OpKind::Kapi => "SAGG_KAPI",
            OpKind::Pencere => "SAGG_PENCERE",
        }
    }

    fn prompt(&self) -> String {
        let n = self.name();
        let label = self.kind.label();
        match self.step {
            Step::Pick => format!("{n}  {}{label} eklenecek duvarı seçin:", self.note),
            Step::Width => format!("{n}  {label} genişliği, mm <{}>:", self.w),
            Step::Height => format!("{n}  {label} yüksekliği, mm <{}>:", self.h),
            Step::Sill => format!("{n}  Parapet (denizlik) yüksekliği, mm <{}>:", self.sill),
            Step::Place => format!("{n}  {}{label} yeri (duvar üzerinde orta noktası):", self.note),
            Step::Side(_) => format!("{n}  Kanadın açılacağı tarafa tıklayın (menteşe tıkladığınız uca yakın olur):"),
        }
    }

    fn preserve_commit_layer(&self) -> bool {
        true
    }

    fn needs_entity_pick(&self) -> bool {
        self.step == Step::Pick
    }

    fn inject_before_entity_pick(&self) -> bool {
        true
    }

    fn inject_picked_entity(&mut self, entity: EntityType) {
        self.picked = Some(entity);
    }

    fn on_entity_pick(&mut self, handle: Handle, _pt: DVec3) -> CmdResult {
        if handle.is_null() {
            return CmdResult::NeedPoint;
        }
        let Some(entity) = self.picked.take() else { return CmdResult::NeedPoint };
        let Some(wall) = super::wall_of(&entity) else {
            self.note = "Seçilen nesne SAGGCAD duvarı değil. ".into();
            return CmdResult::NeedPoint;
        };
        self.wall = Some((handle, wall));
        self.note.clear();
        self.step = Step::Width;
        CmdResult::NeedPoint
    }

    fn wants_text_input(&self) -> bool {
        matches!(self.step, Step::Width | Step::Height | Step::Sill)
    }

    fn on_text_input(&mut self, text: &str) -> Option<CmdResult> {
        let v: f64 = text.trim().replace(',', ".").parse().ok().filter(|v: &f64| v.is_finite() && *v >= 0.0)?;
        match self.step {
            Step::Width if v > 0.0 => {
                self.w = v;
                self.step = Step::Height;
            }
            Step::Height if v > 0.0 => {
                self.h = v;
                self.step = if self.kind == OpKind::Pencere { Step::Sill } else { Step::Place };
            }
            Step::Sill => {
                self.sill = v;
                self.step = Step::Place;
            }
            _ => return None,
        }
        Some(CmdResult::NeedPoint)
    }

    fn on_point(&mut self, pt: DVec3) -> CmdResult {
        let p = [pt.x, pt.y];
        let Some((_, wall)) = self.wall.as_ref() else { return CmdResult::NeedPoint };
        match self.step {
            Step::Place => {
                let at = wall.place(p, self.w);
                self.note.clear();
                match self.kind {
                    OpKind::Pencere => self.commit(self.opening(at, 1, false)),
                    OpKind::Kapi => {
                        self.step = Step::Side(at);
                        CmdResult::NeedPoint
                    }
                }
            }
            Step::Side(at) => {
                let (s, k) = wall.project(p);
                let side = if k >= 0.0 { 1 } else { -1 };
                self.commit(self.opening(at, side, s > at))
            }
            _ => CmdResult::NeedPoint,
        }
    }

    fn on_enter(&mut self) -> CmdResult {
        self.step = match self.step {
            Step::Pick | Step::Place | Step::Side(_) => return CmdResult::Cancel,
            Step::Width => Step::Height,
            Step::Height if self.kind == OpKind::Pencere => Step::Sill,
            Step::Height | Step::Sill => Step::Place,
        };
        CmdResult::NeedPoint
    }

    fn on_mouse_move(&mut self, pt: DVec3) -> Option<WireModel> {
        let (_, wall) = self.wall.as_ref()?;
        let p = [pt.x, pt.y];
        let op = match self.step {
            Step::Place => self.opening(wall.place(p, self.w), 1, false),
            Step::Side(at) => {
                let (s, k) = wall.project(p);
                self.opening(at, if k >= 0.0 { 1 } else { -1 }, s > at)
            }
            _ => return None,
        };
        // önizleme: boşluk sınırı (duvar kalınlığınca) ve sembol çizgileri
        let mut pts: Vec<[f64; 3]> = Vec::new();
        for m in wall.marks(&op) {
            match m {
                saggcad_bim::wall::Mark::Line(a, b) => {
                    pts.push([a[0], a[1], 0.0]);
                    pts.push([b[0], b[1], 0.0]);
                }
                saggcad_bim::wall::Mark::Arc { center, r, start, end } => {
                    let sweep = (end - start).rem_euclid(360.0);
                    for i in 0..=12 {
                        let t = (start + sweep * i as f64 / 12.0).to_radians();
                        pts.push([center[0] + r * t.cos(), center[1] + r * t.sin(), 0.0]);
                    }
                }
            }
        }
        if pts.len() < 2 {
            return None;
        }
        Some(WireModel::solid_f64("rubber_band".into(), pts, WireModel::CYAN, false))
    }
}

inventory::submit!(crate::command::CommandRegistration { names: &["SAGG_KAPI", "SAGG_PENCERE"] }); // BoslukCommand

#[cfg(test)]
mod tests {
    use super::*;
    use saggcad_bim::band::Align;

    fn wall_piece() -> EntityType {
        let w = Wall::new("DV1", [0.0, 0.0], [5000.0, 0.0], 200.0, 2800.0, Align::Axis);
        super::super::wall_entities(&w).remove(0)
    }

    #[test]
    fn kapi_duvari_boler_ve_sembol_ekler() {
        let piece = wall_piece();
        let mut c = BoslukCommand::new(OpKind::Kapi, vec![(Handle::new(10), piece.clone())]);
        assert!(c.needs_entity_pick());
        c.inject_picked_entity(piece);
        assert!(matches!(c.on_entity_pick(Handle::new(10), DVec3::ZERO), CmdResult::NeedPoint));
        assert!(c.prompt().contains("genişliği, mm <900>"), "{}", c.prompt());
        assert!(matches!(c.on_enter(), CmdResult::NeedPoint));
        assert!(matches!(c.on_text_input("2100"), Some(CmdResult::NeedPoint)));
        assert!(c.prompt().contains("yeri"), "{}", c.prompt());
        assert!(matches!(c.on_point(DVec3::new(1000.0, 40.0, 0.0)), CmdResult::NeedPoint));
        assert!(c.prompt().contains("Kanadın"));
        let CmdResult::ReplaceMany(pairs, adds) = c.on_point(DVec3::new(600.0, 700.0, 0.0)) else { panic!("duvar yeniden çizilmeli") };
        assert!(adds.is_empty());
        assert_eq!(pairs.len(), 1);
        assert_eq!(pairs[0].0, Handle::new(10));
        let ents = &pairs[0].1;
        // 2 duvar parçası + kanat çizgisi + yay
        assert_eq!(ents.len(), 4, "{ents:?}");
        let walls: Vec<_> = ents.iter().filter_map(super::super::wall_of).collect();
        assert_eq!(walls.len(), 2);
        assert_eq!(walls[0].openings.len(), 1);
        assert_eq!(walls[0].openings[0].name, "KP1");
        assert_eq!(walls[0].openings[0].at, 1000.0);
        assert_eq!(walls[0].openings[0].side, 1);
        assert!(!walls[0].openings[0].hinge_end, "menteşe tıklanan uca (a tarafı) yakın");
        assert!(ents.iter().any(|e| matches!(e, EntityType::Arc(_)) && e.common().layer == super::super::LAYER_KAPI));
        let m = super::super::bim_data(&ents[2]).unwrap();
        assert_eq!(m.get("tur").map(String::as_str), Some("kapi"));
        assert_eq!(m.get("duvar").map(String::as_str), Some("DV1"));
    }

    #[test]
    fn pencere_eski_parcalari_ve_sembolleri_siler() {
        // önce kapılı duvar (2 parça + 2 sembol), sonra pencere
        let mut w = Wall::new("DV1", [0.0, 0.0], [5000.0, 0.0], 200.0, 2800.0, Align::Axis);
        w.add(Opening { kind: OpKind::Kapi, name: "KP1".into(), at: 1000.0, w: 900.0, h: 2100.0, sill: 0.0, side: 1, hinge_end: false }).unwrap();
        let ents = super::super::wall_entities(&w);
        // başka bir duvar (aynı ad, farklı yer — kopya) dokunulmamalı
        let other = super::super::wall_entities(&Wall::new("DV1", [0.0, 9000.0], [5000.0, 9000.0], 200.0, 2800.0, Align::Axis));
        let mut related: Vec<(Handle, EntityType)> = ents.iter().cloned().enumerate().map(|(i, e)| (Handle::new(20 + i as u64), e)).collect();
        related.push((Handle::new(99), other[0].clone()));
        let mut c = BoslukCommand::new(OpKind::Pencere, related);
        c.inject_picked_entity(ents[1].clone());
        let _ = c.on_entity_pick(Handle::new(21), DVec3::ZERO);
        let _ = c.on_enter(); // 1200
        let _ = c.on_enter(); // 1500
        assert!(c.prompt().contains("Parapet"));
        let _ = c.on_enter(); // 900
        // kapının üstüne denk gelen yer: sığmaz, yeniden sorulur
        assert!(matches!(c.on_point(DVec3::new(1100.0, 0.0, 0.0)), CmdResult::NeedPoint));
        assert!(c.prompt().contains("PN1 sığmadı: KP1 ile çakışıyor"), "{}", c.prompt());
        let CmdResult::ReplaceMany(pairs, _) = c.on_point(DVec3::new(3000.0, 0.0, 0.0)) else { panic!() };
        let erased: Vec<u64> = pairs.iter().map(|(h, _)| h.value()).collect();
        assert_eq!(pairs[0].0, Handle::new(21), "seçilen parça yeni hâli taşır");
        assert_eq!(erased.len(), 4, "2 parça + kanat + yay silinir: {erased:?}");
        assert!(!erased.contains(&99), "kopya duvar korunur");
        let new_walls: Vec<_> = pairs[0].1.iter().filter_map(super::super::wall_of).collect();
        assert_eq!(new_walls.len(), 3);
        assert_eq!(new_walls[0].openings.len(), 2);
        assert_eq!(pairs[0].1.iter().filter(|e| e.common().layer == super::super::LAYER_PENCERE).count(), 3);
    }

    #[test]
    fn duvar_olmayan_secilemez() {
        let mut c = BoslukCommand::new(OpKind::Kapi, Vec::new());
        c.inject_picked_entity(EntityType::Line(codec::entities::Line::new()));
        assert!(matches!(c.on_entity_pick(Handle::new(3), DVec3::ZERO), CmdResult::NeedPoint));
        assert!(c.needs_entity_pick());
        assert!(c.prompt().contains("duvarı değil"));
    }
}
