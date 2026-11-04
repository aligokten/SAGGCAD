//! SAGGCAD BIM komutları: SAGG_AKS, SAGG_KOLON, SAGG_DONATI (donatı metrajı raporu), SAGG_DONATIMIN (tanımsız
//! kolonlara yönetmelik minimumu). Geometri ve hesap `saggcad_bim` crate'inde; BIM verisi nesne XDATA'sında.

use super::{Message, OpenCADStudio};
use crate::command::CadCommand;
use crate::modules::bim::{bim_data, element_of, existing_names, set_bim_data};
use codec::Handle;
use iced::Task;
use saggcad_bim::rebar::{self, Rules};

/// belgedeki SAGGCAD BIM elemanları (donatı hesabının biçiminde)
pub(crate) fn bim_elements(doc: &codec::Document) -> Vec<rebar::Element> {
    doc.entities().filter_map(element_of).collect()
}

const BETONARME: [&str; 4] = ["kolon", "kiris", "perde", "doseme"];

impl OpenCADStudio {
    pub(super) fn dispatch_bim(&mut self, cmd: &str, i: usize) -> Option<Task<Message>> {
        match cmd.trim().to_ascii_uppercase().as_str() {
            "SAGG_AKS" => {
                use crate::modules::bim::aks::AksCommand;
                let cmd = AksCommand::new(existing_names(&self.tabs[i].scene.document, "aks"));
                self.command_line.push_info(&cmd.prompt());
                self.tabs[i].active_cmd = Some(Box::new(cmd));
            }
            "SAGG_KOLON" => {
                use crate::modules::bim::kolon::KolonCommand;
                let cmd = KolonCommand::new(existing_names(&self.tabs[i].scene.document, "kolon"));
                self.command_line.push_info(&cmd.prompt());
                self.tabs[i].active_cmd = Some(Box::new(cmd));
            }
            "SAGG_KIRIS" | "SAGG_PERDE" => {
                use crate::modules::bim::band::{BandCommand, BandKind};
                let (kind, tur) = if cmd.trim().eq_ignore_ascii_case("SAGG_KIRIS") { (BandKind::Kiris, "kiris") } else { (BandKind::Perde, "perde") };
                let cmd = BandCommand::new(kind, existing_names(&self.tabs[i].scene.document, tur));
                self.command_line.push_info(&cmd.prompt());
                self.tabs[i].active_cmd = Some(Box::new(cmd));
            }
            "SAGG_DOSEME" => {
                use crate::modules::bim::doseme::DosemeCommand;
                let cmd = DosemeCommand::new(existing_names(&self.tabs[i].scene.document, "doseme"));
                self.command_line.push_info(&cmd.prompt());
                self.tabs[i].active_cmd = Some(Box::new(cmd));
            }
            "SAGG_DONATIGIR" => {
                use crate::modules::bim::donatigir::DonatiGirCommand;
                let cmd = DonatiGirCommand::new();
                self.command_line.push_info(&cmd.prompt());
                self.tabs[i].active_cmd = Some(Box::new(cmd));
            }
            "SAGG_DONATICSV" => {
                let rep = rebar::report(&bim_elements(&self.tabs[i].scene.document), &Rules::default());
                if rep.rows.is_empty() {
                    self.command_line.push_output("SAGG_DONATICSV  Çizimde betonarme BIM elemanı yok.");
                    return Some(Task::none());
                }
                let csv = rebar::to_csv(&rep, "SAGGCAD — donatı metrajı");
                let name = "saggcad-donati-metraji.csv";
                #[cfg(target_arch = "wasm32")]
                {
                    crate::sys::download_bytes(name, csv.as_bytes());
                    self.command_line.push_output(&format!("SAGG_DONATICSV  {name} indirildi."));
                }
                #[cfg(not(target_arch = "wasm32"))]
                {
                    let path = crate::sys::documents_dir().unwrap_or_else(std::env::temp_dir).join(name);
                    match std::fs::write(&path, csv.as_bytes()) {
                        Ok(()) => self.command_line.push_output(&format!("SAGG_DONATICSV  Kaydedildi: {}", path.display())),
                        Err(e) => self.command_line.push_error(&format!("SAGG_DONATICSV  Yazılamadı ({}): {e}", path.display())),
                    }
                }
            }
            "SAGG_DONATI" => {
                let rep = rebar::report(&bim_elements(&self.tabs[i].scene.document), &Rules::default());
                for line in report_lines(&rep) {
                    self.command_line.push_output(&line);
                }
            }
            "SAGG_DONATIMIN" => {
                let handles: Vec<Handle> = self.tabs[i]
                    .scene
                    .document
                    .entities()
                    .filter(|e| bim_data(e).is_some_and(|m| m.get("tur").is_some_and(|t| BETONARME.contains(&t.as_str())) && m.get("rb").map_or(true, |r| r == "none")))
                    .map(|e| e.common().handle)
                    .collect();
                if handles.is_empty() {
                    self.command_line.push_output("SAGG_DONATIMIN  Donatısı tanımsız betonarme eleman yok.");
                    return Some(Task::none());
                }
                self.push_undo_snapshot(i, "SAGG_DONATIMIN");
                for h in &handles {
                    if let Some(e) = self.tabs[i].scene.document.get_entity_mut(*h) {
                        let Some(mut map) = bim_data(e) else { continue };
                        map.insert("rb".into(), "min".into());
                        let values: Vec<String> = std::iter::once(format!("v={}", saggcad_bim::SCHEMA))
                            .chain(map.iter().filter(|(k, _)| k.as_str() != "v").map(|(k, v)| format!("{k}={v}")))
                            .collect();
                        set_bim_data(e.common_mut(), values);
                    }
                }
                self.tabs[i].dirty = true;
                self.command_line.push_output(&format!(
                    "SAGG_DONATIMIN  {} elemana yönetmelik minimumu (TS 500 / TBDY 2018 — tahmini) atandı. Geri almak için U.",
                    handles.len()
                ));
            }
            _ => return None,
        }
        Some(Task::none())
    }
}

/// komut satırı raporu: kesin (statik projeden) ve tahmini (minimum) ayrı
pub(crate) fn report_lines(rep: &rebar::Report) -> Vec<String> {
    let t = &rep.totals;
    let mut out = vec![format!(
        "SAGG_DONATI  {} betonarme eleman · toplam {:.1} kg ({:.3} t) · statik projeden {:.1} kg · minimum tahmini {:.1} kg · beton {:.2} m³ · {:.0} kg/m³",
        t.count, t.total, t.total / 1000.0, t.manual, t.min, t.concrete_defined, t.ratio
    )];
    for x in &rep.by_diameter {
        out.push(format!("  Ø{:<2}  {:>9.1} m  {:>9.1} kg  (statik projeden {:.1} · minimum {:.1})", x.d, x.m, x.kg, x.kg_manual, x.kg_min));
    }
    if t.undefined > 0 {
        out.push(format!("  {} elemanın donatısı tanımsız — metraja girmedi.", t.undefined));
    }
    if t.invalid > 0 {
        out.push(format!("  {} elemanın elle girilen donatısı eksik — metraja girmedi.", t.invalid));
    }
    if t.min > 0.0 {
        out.push("  Minimum tahmini, yönetmelik en az koşullarından türetilen ön tahmindir; statik projenin yerini tutmaz.".into());
    }
    out
}

inventory::submit!(crate::command::CommandRegistration { names: &["SAGG_DONATI", "SAGG_DONATIMIN", "SAGG_DONATICSV"] });

#[cfg(test)]
mod tests {
    use super::*;

    fn bim_count(app: &OpenCADStudio, tur: &str) -> usize {
        let i = app.active_tab;
        app.tabs[i].scene.document.entities().filter_map(bim_data).filter(|m| m.get("tur").map(String::as_str) == Some(tur)).count()
    }

    #[test]
    fn aks_sistemi_komutu_dwg_nesneleri_ve_xdata() {
        let mut app = OpenCADStudio::new_for_test();
        app.automation_op(r#"{"op":"new"}"#);
        app.automation_op(r#"{"op":"run","cmd":"SAGG_AKS 4000;5000 3500 0,0 "}"#);
        let i = app.active_tab;
        let doc = &app.tabs[i].scene.document;
        let lines: Vec<&codec::EntityType> = doc.entities().filter(|e| matches!(e, codec::EntityType::Line(_))).collect();
        assert_eq!(lines.len(), 5, "3 düşey + 2 yatay aks");
        assert_eq!(doc.entities().filter(|e| matches!(e, codec::EntityType::Circle(_))).count(), 10, "her aksın iki ucunda baloncuk");
        let names: Vec<String> = existing_names(doc, "aks");
        assert_eq!(names, ["1", "2", "3", "A", "B"]);
        assert!(lines.iter().all(|e| e.common().layer == "S-AKS"));
        assert!(doc.app_ids.contains("SAGGCAD"), "XDATA uygulama adı kayıtlı");
        // ad devamı: ikinci aks sistemi (düşey 3000, yatay 1000) mevcut adlardan devam eder
        // (otomasyon girdileri boşlukla ayrılır; ardışık boşluk tek ayırıcıdır)
        app.automation_op(r#"{"op":"run","cmd":"SAGG_AKS 3000 1000 9000,0 "}"#);
        let i = app.active_tab;
        let names = existing_names(&app.tabs[i].scene.document, "aks");
        for n in ["4", "5", "C", "D"] {
            assert!(names.contains(&n.to_string()), "{n} yok: {names:?}");
        }
        assert_eq!(names.len(), 9);
    }

    #[test]
    fn kolon_ve_donati_minimum_metraj_geri_al() {
        let mut app = OpenCADStudio::new_for_test();
        app.automation_op(r#"{"op":"new"}"#);
        app.automation_op(r#"{"op":"run","cmd":"SAGG_KOLON 300x500 2800 SA 1000,0 5000,0 "}"#);
        assert_eq!(bim_count(&app, "kolon"), 2);
        let i = app.active_tab;
        let els = bim_elements(&app.tabs[i].scene.document);
        assert_eq!(els.len(), 2);
        assert_eq!(rebar::report(&els, &Rules::default()).totals.undefined, 2, "yerleştirilen kolonun donatısı tanımsız");
        app.automation_op(r#"{"op":"run","cmd":"SAGG_DONATIMIN"}"#);
        let i = app.active_tab;
        let rep = rebar::report(&bim_elements(&app.tabs[i].scene.document), &Rules::default());
        assert_eq!(rep.totals.undefined, 0);
        assert!((rep.totals.min - 2.0 * 54.397).abs() < 2e-3, "{}", rep.totals.min);
        assert_eq!(rep.totals.manual, 0.0);
        let lines = report_lines(&rep);
        assert!(lines[0].contains("minimum tahmini") && lines.iter().any(|l| l.contains("Ø14")));
        app.automation_op(r#"{"op":"undo"}"#);
        let i = app.active_tab;
        assert_eq!(rebar::report(&bim_elements(&app.tabs[i].scene.document), &Rules::default()).totals.undefined, 2, "minimum atama tek geri al");
    }

    #[test]
    fn kiris_perde_doseme_minimum_metraj_ve_cizimden_olcu() {
        use saggcad_bim::rebar::{Element, Geom, Spec};
        let mut app = OpenCADStudio::new_for_test();
        app.automation_op(r#"{"op":"new"}"#);
        app.automation_op(r#"{"op":"run","cmd":"SAGG_KIRIS 250x500 E 0,0 5000,0 "}"#);
        app.automation_op(r#"{"op":"run","cmd":"SAGG_PERDE 250 2800 S 0,0 0,4000 "}"#);
        app.automation_op(r#"{"op":"run","cmd":"SAGG_DOSEME 150 0,0 5000,0 5000,4000 0,4000 "}"#);
        assert_eq!((bim_count(&app, "kiris"), bim_count(&app, "perde"), bim_count(&app, "doseme")), (1, 1, 1));
        let i = app.active_tab;
        let els = bim_elements(&app.tabs[i].scene.document);
        let geo: Vec<Geom> = els.iter().map(|e| e.geom.clone()).collect();
        assert!(geo.contains(&Geom::Kiris { l: 500.0, b: 25.0, h: 50.0 }), "{geo:?}");
        assert!(geo.contains(&Geom::Perde { l: 400.0, t: 25.0, height: 280.0, openings: 0 }), "{geo:?}");
        assert!(geo.iter().any(|g| matches!(g, Geom::Doseme { pts, t } if pts.len() == 4 && *t == 15.0)), "{geo:?}");
        app.automation_op(r#"{"op":"run","cmd":"SAGG_DONATIMIN"}"#);
        let i = app.active_tab;
        let rep = rebar::report(&bim_elements(&app.tabs[i].scene.document), &Rules::default());
        assert_eq!(rep.totals.undefined, 0);
        // beklenen: çekirdekteki elle doğrulanmış değerler (kiriş 2Ø12+3Ø12+31 etriye; perde Ø10/25; döşeme Ø8/19)
        let exp: f64 = [
            Geom::Kiris { l: 500.0, b: 25.0, h: 50.0 },
            Geom::Perde { l: 400.0, t: 25.0, height: 280.0, openings: 0 },
            Geom::Doseme { pts: vec![[0.0, 0.0], [500.0, 0.0], [500.0, 400.0], [0.0, 400.0]], t: 15.0 },
        ]
        .into_iter()
        .map(|geom| rebar::takeoff(&Element { key: String::new(), name: String::new(), level: String::new(), geom, spec: Spec::min() }, &Rules::default()).kg)
        .sum();
        assert!((rep.totals.min - exp).abs() < 1e-6, "{} ≠ {exp}", rep.totals.min);
        // çizim elle uzatılırsa metraj güncel ölçüden: kiriş çoklu çizgisini 6000 mm'ye uzat
        let i = app.active_tab;
        let h = app.tabs[i].scene.document.entities().find(|e| bim_data(e).is_some_and(|m| m.get("tur").map(String::as_str) == Some("kiris"))).unwrap().common().handle;
        if let Some(codec::EntityType::LwPolyline(pl)) = app.tabs[i].scene.document.get_entity_mut(h) {
            pl.vertices[1].location.x = 6000.0;
            pl.vertices[2].location.x = 6000.0;
        }
        let els = bim_elements(&app.tabs[i].scene.document);
        assert!(els.iter().any(|e| e.geom == Geom::Kiris { l: 600.0, b: 25.0, h: 50.0 }));
    }
}
