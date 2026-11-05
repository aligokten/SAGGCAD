// SAGG_BIRIM — çizim birimini (INSUNITS) seç: MM / CM / M. SAGGCAD ölçüleri (kalınlık, kesit, açıklık …) her zaman mm
// yazılır; çizime bu birime çevrilerek konur, alanlar bu birimden m²'ye çevrilerek hesaplanır. Birim değişince
// mahal, parsel ve kat etiketleri (alan yazısı, yazı yüksekliği, konum) yeniden hesaplanır — geometri ölçeklenmez.

use codec::EntityType;
use glam::DVec3;

use crate::command::{CadCommand, CmdResult};

pub struct BirimCommand {
    current: i16,
}

impl BirimCommand {
    pub fn new(current: i16) -> Self {
        Self { current }
    }
}

/// "MM" / "CM" / "M" (ve Türkçe yazımlar) → INSUNITS kodu
pub fn parse(text: &str) -> Option<i16> {
    match saggcad_bim::imar::norm(text).as_str() {
        "MM" | "MILIMETRE" => Some(4),
        "CM" | "SANTIMETRE" => Some(5),
        "M" | "METRE" => Some(6),
        _ => None,
    }
}

impl CadCommand for BirimCommand {
    fn name(&self) -> &'static str {
        "SAGG_BIRIM"
    }

    fn prompt(&self) -> String {
        format!(
            "SAGG_BIRIM  Çizim birimi (şu an: {}) — 1 çizim birimi [MM / CM / M] <M>:",
            super::insunits_name(self.current)
        )
    }

    fn wants_text_input(&self) -> bool {
        true
    }

    fn on_text_input(&mut self, text: &str) -> Option<CmdResult> {
        let code = parse(text)?;
        Some(CmdResult::Dispatch(format!("SAGG_BIRIM_AYARLA {code}")))
    }

    fn on_point(&mut self, _pt: DVec3) -> CmdResult {
        CmdResult::NeedPoint
    }

    fn on_enter(&mut self) -> CmdResult {
        CmdResult::Dispatch("SAGG_BIRIM_AYARLA 6".into())
    }
}

/// yeni birimde (u: bir çizim biriminin mm karşılığı) yeniden hesaplanmış SAGGCAD etiket yazıları (aynı handle'larla)
pub fn yenilenen_etiketler(doc: &codec::Document, u: f64) -> Vec<EntityType> {
    use super::imar::{make_alan, AlanTur};
    let mut mahaller: Vec<(String, String, Vec<[f64; 2]>)> = Vec::new();
    let mut parseller: Vec<(Vec<(String, String)>, Vec<[f64; 2]>)> = Vec::new();
    let mut katlar: Vec<(String, Vec<(String, String)>, Vec<[f64; 2]>)> = Vec::new();
    for e in doc.entities() {
        let (Some(map), Some(poly)) = (super::bim_data(e), super::outline_mm(e, u)) else { continue };
        let pairs: Vec<(String, String)> = map.iter().filter(|(k, _)| k.as_str() != "v" && k.as_str() != "tur").map(|(k, v)| (k.clone(), v.clone())).collect();
        match map.get("tur").map(String::as_str) {
            Some("mahal") => mahaller.push((map.get("ad").cloned().unwrap_or_default(), map.get("no").cloned().unwrap_or_default(), poly)),
            Some("parsel") => parseller.push((pairs, poly)),
            Some("kat") => katlar.push((map.get("ad").cloned().unwrap_or_default(), pairs, poly)),
            _ => {}
        }
    }
    let mut out = Vec::new();
    for e in doc.entities() {
        let EntityType::Text(t) = e else { continue };
        let Some(map) = super::bim_data(e) else { continue };
        let yeni: Option<EntityType> = match map.get("tur").map(String::as_str) {
            Some("mahal_etiket") => {
                let (ad, no) = (map.get("ad").cloned().unwrap_or_default(), map.get("no").cloned().unwrap_or_default());
                mahaller.iter().find(|(a, n, _)| *a == ad && *n == no).map(|(a, n, poly)| {
                    let ents = super::mahal::make_room(poly, a, n);
                    let idx = if t.value.starts_with("A = ") { 2 } else { 1 };
                    super::to_drawing(ents[idx].clone(), u)
                })
            }
            Some("parsel_etiket") => parseller.first().map(|(pairs, poly)| super::to_drawing(make_alan(AlanTur::Parsel, poly, pairs)[1].clone(), u)),
            Some("kat_etiket") => katlar
                .iter()
                .filter(|(ad, ..)| !ad.is_empty() && t.value.starts_with(ad.as_str()))
                .max_by_key(|(ad, ..)| ad.len())
                .map(|(_, pairs, poly)| super::to_drawing(make_alan(AlanTur::Kat, poly, pairs)[1].clone(), u)),
            _ => None,
        };
        let Some(EntityType::Text(n)) = yeni else { continue };
        let mut t2 = t.clone();
        t2.value = n.value;
        t2.insertion_point = n.insertion_point;
        t2.alignment_point = n.alignment_point;
        t2.height = n.height;
        t2.horizontal_alignment = n.horizontal_alignment;
        t2.vertical_alignment = n.vertical_alignment;
        out.push(EntityType::Text(t2));
    }
    out
}

inventory::submit!(crate::command::CommandRegistration { names: &["SAGG_BIRIM", "SAGG_BIRIM_AYARLA"] }); // BirimCommand

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn birim_secimi() {
        assert_eq!(parse("m"), Some(6));
        assert_eq!(parse("Cm"), Some(5));
        assert_eq!(parse("milimetre"), Some(4));
        assert_eq!(parse("km"), None);
        let mut c = BirimCommand::new(0);
        assert!(c.prompt().contains("birimsiz"));
        assert!(matches!(c.on_text_input("cm"), Some(CmdResult::Dispatch(s)) if s == "SAGG_BIRIM_AYARLA 5"));
        assert!(matches!(c.on_enter(), CmdResult::Dispatch(s) if s == "SAGG_BIRIM_AYARLA 6"));
    }

    #[test]
    fn metre_cizimde_etiket_yenilenir() {
        // metre biriminde 25 × 15 parsel ve 5 × 4 mahal; eski etiketler mm varsayımıyla (yanlış) yazılmış
        let mut doc = codec::Document::new();
        let parsel = super::super::imar::make_alan(super::super::imar::AlanTur::Parsel, &[[0.0, 0.0], [25.0, 0.0], [25.0, 15.0], [0.0, 15.0]], &[]);
        let oda = super::super::mahal::make_room(&[[1.0, 1.0], [6.0, 1.0], [6.0, 5.0], [1.0, 5.0]], "SALON", "01");
        for e in parsel.into_iter().chain(oda) {
            doc.add_entity(e).unwrap();
        }
        let yeni = yenilenen_etiketler(&doc, 1000.0);
        let vals: Vec<(String, f64)> = yeni.iter().filter_map(|e| if let EntityType::Text(t) = e { Some((t.value.clone(), t.height)) } else { None }).collect();
        assert!(vals.iter().any(|(v, h)| v == "PARSEL  375,00 m²" && (*h - 0.25).abs() < 1e-9), "{vals:?}");
        assert!(vals.iter().any(|(v, _)| v == "A = 20,00 m²"), "{vals:?}");
        assert!(vals.iter().any(|(v, _)| v == "01 SALON"), "{vals:?}");
        assert_eq!(vals.len(), 3);
    }
}
