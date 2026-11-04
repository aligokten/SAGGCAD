// SAGG_DONATIGIR — statik projedeki donatıyı elle gir: betonarme elemanı seç, alanları sırayla yaz (Enter: önerilen
// değer). Önerilen değerler: kayıtlı elle tanım varsa o, yoksa o anki yönetmelik minimumu (açıkça kopyalanır).
// Sonunda nesnenin XDATA'sı "rb=manual" ile güncellenir (tek geri al).

use codec::{EntityType, Handle};
use glam::DVec3;

use crate::command::{CadCommand, CmdResult};
use saggcad_bim::rebar::{self, Kind, Rules, Spec};
use saggcad_bim::xdata;

pub struct DonatiGirCommand {
    picked: Option<EntityType>,
    target: Option<(Handle, EntityType, Kind, Spec)>,
    field: usize,
}

impl Default for DonatiGirCommand {
    fn default() -> Self {
        Self::new()
    }
}

impl DonatiGirCommand {
    pub fn new() -> Self {
        Self { picked: None, target: None, field: 0 }
    }

    fn labels(&self) -> &'static [(&'static str, &'static str, bool)] {
        match &self.target {
            Some(t) => xdata::field_labels(t.2),
            None => &[],
        }
    }

    fn current(&self) -> Option<(&'static str, &'static str, bool, f64)> {
        let (_, _, _, spec) = self.target.as_ref()?;
        let (k, label, mm) = *self.labels().get(self.field)?;
        let v = spec.v.get(k).copied().unwrap_or(0.0);
        Some((k, label, mm, if mm { v * 10.0 } else { v }))
    }

    fn advance(&mut self) -> CmdResult {
        self.field += 1;
        if self.field < self.labels().len() {
            return CmdResult::NeedPoint;
        }
        let Some((handle, mut entity, kind, spec)) = self.target.take() else { return CmdResult::Cancel };
        let Some(map) = super::bim_data(&entity) else { return CmdResult::Cancel };
        super::set_bim_data(entity.common_mut(), xdata::with_spec(&map, kind, &spec));
        let kg = super::element_of(&entity).map(|el| rebar::takeoff(&el, &Rules::default())).map(|t| (t.kg, t.warnings));
        let message = match kg {
            Some((kg, w)) if w.is_empty() => format!("SAGG_DONATIGIR  {} donatısı kaydedildi (statik projeden): {kg:.1} kg", map.get("ad").cloned().unwrap_or_default()),
            Some((kg, w)) => format!("SAGG_DONATIGIR  {} donatısı kaydedildi: {kg:.1} kg — uyarı: {}", map.get("ad").cloned().unwrap_or_default(), w.join("; ")),
            None => "SAGG_DONATIGIR  Donatı kaydedildi.".into(),
        };
        CmdResult::UpdateEntityAndReport { handle, entity, message }
    }
}

impl CadCommand for DonatiGirCommand {
    fn name(&self) -> &'static str {
        "SAGG_DONATIGIR"
    }

    fn prompt(&self) -> String {
        match self.current() {
            None => "SAGG_DONATIGIR  Donatısını gireceğiniz betonarme elemanı (kolon / kiriş / döşeme / perde) seçin:".into(),
            Some((_, label, _, v)) => format!("SAGG_DONATIGIR  {label} <{}>:", fmt(v)),
        }
    }

    fn needs_entity_pick(&self) -> bool {
        self.target.is_none()
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
        let Some(el) = super::element_of(&entity) else { return CmdResult::NeedPoint };
        let kind = el.geom.kind();
        let spec = xdata::manual_defaults(&el, &Rules::default());
        self.target = Some((handle, entity, kind, spec));
        self.field = 0;
        CmdResult::NeedPoint
    }

    fn wants_text_input(&self) -> bool {
        self.target.is_some()
    }

    fn on_text_input(&mut self, text: &str) -> Option<CmdResult> {
        let (k, _, mm, _) = self.current()?;
        let v: f64 = text.trim().replace(',', ".").parse().ok().filter(|v: &f64| *v >= 0.0 && v.is_finite())?;
        if let Some((_, _, _, spec)) = self.target.as_mut() {
            spec.v.insert(k.to_string(), if mm { v / 10.0 } else { v });
        }
        Some(self.advance())
    }

    fn on_point(&mut self, _pt: DVec3) -> CmdResult {
        CmdResult::NeedPoint
    }

    fn on_enter(&mut self) -> CmdResult {
        if self.target.is_none() {
            return CmdResult::Cancel;
        }
        self.advance()
    }
}

fn fmt(v: f64) -> String {
    let s = format!("{v:.1}");
    s.trim_end_matches('0').trim_end_matches('.').to_string()
}

inventory::submit!(crate::command::CommandRegistration { names: &["SAGG_DONATIGIR"] }); // DonatiGirCommand

#[cfg(test)]
mod tests {
    use super::*;
    use saggcad_bim::column::Anchor;

    #[test]
    fn elle_donati_girisi_kolon() {
        let e = super::super::kolon::make_column([0.0, 0.0], 300.0, 500.0, 2800.0, Anchor::BottomLeft, "S1");
        let mut c = DonatiGirCommand::new();
        assert!(c.needs_entity_pick());
        c.inject_picked_entity(e);
        assert!(matches!(c.on_entity_pick(Handle::new(7), DVec3::ZERO), CmdResult::NeedPoint));
        assert!(c.prompt().contains("Boyuna çubuk adedi <10>"), "{}", c.prompt());
        assert!(matches!(c.on_text_input("12"), Some(CmdResult::NeedPoint)));
        assert!(matches!(c.on_text_input("16"), Some(CmdResult::NeedPoint)));
        assert!(c.prompt().contains("Etriye çapı Ø (mm) <8>"));
        assert!(matches!(c.on_enter(), CmdResult::NeedPoint)); // etriye Ø8
        assert!(c.prompt().contains("<100>"), "aralık mm gösterilir: {}", c.prompt());
        assert!(matches!(c.on_enter(), CmdResult::NeedPoint)); // sarılma 100 mm
        assert!(matches!(c.on_enter(), CmdResult::NeedPoint)); // orta 150 mm
        let CmdResult::UpdateEntityAndReport { handle, entity, message } = c.on_enter() else { panic!("son alan kaydetmeli") };
        assert_eq!(handle, Handle::new(7));
        let m = super::super::bim_data(&entity).unwrap();
        assert_eq!(m.get("rb").map(String::as_str), Some("manual"));
        assert_eq!(m.get("rb.n").map(String::as_str), Some("12"));
        assert_eq!(m.get("rb.d").map(String::as_str), Some("16"));
        assert_eq!(m.get("rb.sc").map(String::as_str), Some("100"));
        assert_eq!(m.get("ad").map(String::as_str), Some("S1"));
        let exp = 12.0 * 3.44 * rebar::kg_per_m(16.0) + 23.0 * 1.52 * rebar::kg_per_m(8.0);
        assert!(message.contains(&format!("{exp:.1} kg")), "{message}");
    }

    #[test]
    fn bim_olmayan_nesne_secilemez() {
        let mut c = DonatiGirCommand::new();
        c.inject_picked_entity(EntityType::Line(codec::entities::Line::new()));
        assert!(matches!(c.on_entity_pick(Handle::new(3), DVec3::ZERO), CmdResult::NeedPoint));
        assert!(c.needs_entity_pick(), "seçim sürmeli");
    }
}
