//! SAGGCAD BIM komutları: SAGG_AKS, SAGG_KOLON, SAGG_KIRIS / SAGG_PERDE / SAGG_DUVAR, SAGG_KAPI / SAGG_PENCERE, SAGG_MAHAL, SAGG_DONATI (donatı metrajı raporu), SAGG_DONATIMIN (tanımsız
//! kolonlara yönetmelik minimumu). Geometri ve hesap `saggcad_bim` crate'inde; BIM verisi nesne XDATA'sında.

use super::{Message, OpenCADStudio};
use crate::command::CadCommand;
use crate::modules::bim::{bim_data, element_of, existing_names, set_bim_data};
use codec::Handle;
use iced::Task;
use saggcad_bim::rebar::{self, Rules};

/// belgedeki SAGGCAD BIM elemanları (donatı hesabının biçiminde)
pub(crate) fn bim_elements(doc: &codec::Document) -> Vec<rebar::Element> {
    let u = crate::modules::bim::mm_per_unit(doc).unwrap_or(1.0);
    doc.entities().filter_map(|e| element_of(e, u)).collect()
}

const BETONARME: [&str; 4] = ["kolon", "kiris", "perde", "doseme"];

impl OpenCADStudio {
    pub(super) fn dispatch_bim(&mut self, cmd: &str, i: usize) -> Option<Task<Message>> {
        let up = cmd.trim().to_ascii_uppercase();
        if !up.starts_with("SAGG_") {
            return None;
        }
        // çizim birimi: SAGG_BIRIM ayarlar; tanımsızsa önce birim sorulur (ölçüler mm yazılır, çizime bu birimle konur)
        if let Some(arg) = up.strip_prefix("SAGG_BIRIM_AYARLA") {
            let Some(code) = arg.trim().parse::<i16>().ok().filter(|c| crate::modules::bim::insunits_mm(*c).is_some()) else {
                self.command_line.push_error("SAGG_BIRIM  Geçersiz birim.");
                return Some(Task::none());
            };
            self.push_undo_snapshot(i, "SAGG_BIRIM");
            self.tabs[i].scene.document.header.insertion_units = code;
            let u = crate::modules::bim::insunits_mm(code).unwrap_or(1.0);
            let etiketler = crate::modules::bim::birim::yenilenen_etiketler(&self.tabs[i].scene.document, u);
            let n = etiketler.len();
            for e in etiketler {
                let _ = self.tabs[i].scene.update_entity(e);
            }
            self.tabs[i].dirty = true;
            self.command_line.push_output(&format!(
                "SAGG_BIRIM  Çizim birimi: {} (ölçüleri yine mm yazın; çizime bu birimle konur).{}",
                crate::modules::bim::insunits_name(code),
                if n > 0 { format!(" {n} etiket yeniden hesaplandı.") } else { String::new() }
            ));
            return Some(Task::none());
        }
        let current = self.tabs[i].scene.document.header.insertion_units;
        let known = crate::modules::bim::mm_per_unit(&self.tabs[i].scene.document);
        if up == "SAGG_BIRIM" || (known.is_none() && up != "SAGG_DONATI") {
            use crate::modules::bim::birim::BirimCommand;
            if up != "SAGG_BIRIM" {
                self.command_line.push_output(&format!(
                    "{up}  Çizim birimi tanımsız ({}). Önce birimi seçin, sonra komutu yeniden çalıştırın.",
                    crate::modules::bim::insunits_name(current)
                ));
            }
            let cmd = BirimCommand::new(current);
            self.command_line.push_info(&cmd.prompt());
            self.tabs[i].active_cmd = Some(Box::new(cmd));
            return Some(Task::none());
        }
        let u = known.unwrap_or(1.0);
        match up.as_str() {
            "SAGG_AKS" => {
                use crate::modules::bim::aks::AksCommand;
                let cmd = AksCommand::new(existing_names(&self.tabs[i].scene.document, "aks")).with_units(u);
                self.command_line.push_info(&cmd.prompt());
                self.tabs[i].active_cmd = Some(Box::new(cmd));
            }
            "SAGG_KOLON" => {
                use crate::modules::bim::kolon::KolonCommand;
                let cmd = KolonCommand::new(existing_names(&self.tabs[i].scene.document, "kolon")).with_units(u);
                self.command_line.push_info(&cmd.prompt());
                self.tabs[i].active_cmd = Some(Box::new(cmd));
            }
            "SAGG_KIRIS" | "SAGG_PERDE" | "SAGG_DUVAR" => {
                use crate::modules::bim::band::{BandCommand, BandKind};
                let (kind, tur) = match cmd.trim().to_ascii_uppercase().as_str() {
                    "SAGG_KIRIS" => (BandKind::Kiris, "kiris"),
                    "SAGG_PERDE" => (BandKind::Perde, "perde"),
                    _ => (BandKind::Duvar, "duvar"),
                };
                let cmd = BandCommand::new(kind, existing_names(&self.tabs[i].scene.document, tur)).with_units(u);
                self.command_line.push_info(&cmd.prompt());
                self.tabs[i].active_cmd = Some(Box::new(cmd));
            }
            "SAGG_DOSEME" => {
                use crate::modules::bim::doseme::DosemeCommand;
                let cmd = DosemeCommand::new(existing_names(&self.tabs[i].scene.document, "doseme")).with_units(u);
                self.command_line.push_info(&cmd.prompt());
                self.tabs[i].active_cmd = Some(Box::new(cmd));
            }
            "SAGG_KAPI" | "SAGG_PENCERE" => {
                use crate::modules::bim::bosluk::BoslukCommand;
                use saggcad_bim::wall::OpKind;
                let kind = if cmd.trim().eq_ignore_ascii_case("SAGG_KAPI") { OpKind::Kapi } else { OpKind::Pencere };
                // duvar parçaları ve boşluk sembolleri: eski hâli silmek ve ad devamı için
                let related: Vec<(Handle, codec::EntityType)> = self.tabs[i]
                    .scene
                    .document
                    .entities()
                    .filter(|e| bim_data(e).is_some_and(|m| matches!(m.get("tur").map(String::as_str), Some("duvar" | "kapi" | "pencere"))))
                    .map(|e| (e.common().handle, e.clone()))
                    .collect();
                if !related.iter().any(|(_, e)| bim_data(e).is_some_and(|m| m.get("tur").map(String::as_str) == Some("duvar"))) {
                    self.command_line.push_output(&format!("{}  Çizimde SAGGCAD duvarı yok — önce SAGG_DUVAR ile duvar çizin.", cmd.trim().to_ascii_uppercase()));
                    return Some(Task::none());
                }
                let cmd = BoslukCommand::new(kind, related).with_units(u);
                self.command_line.push_info(&cmd.prompt());
                self.tabs[i].active_cmd = Some(Box::new(cmd));
            }
            "SAGG_MAHAL" => {
                use crate::modules::bim::mahal::MahalCommand;
                let nos: Vec<String> = self.tabs[i]
                    .scene
                    .document
                    .entities()
                    .filter_map(bim_data)
                    .filter(|m| m.get("tur").map(String::as_str) == Some("mahal"))
                    .filter_map(|m| m.get("no").cloned())
                    .collect();
                let cmd = MahalCommand::new(nos).with_units(u);
                self.command_line.push_info(&cmd.prompt());
                self.tabs[i].active_cmd = Some(Box::new(cmd));
            }
            "SAGG_PARSEL" | "SAGG_KAT" => {
                use crate::modules::bim::imar::{AlanCommand, AlanTur};
                let (tur, key) = if cmd.trim().eq_ignore_ascii_case("SAGG_PARSEL") { (AlanTur::Parsel, "parsel") } else { (AlanTur::Kat, "kat") };
                // önceki parselin imar durumu / önceki kat öneri olarak gelir
                let prev = self.tabs[i].scene.document.entities().filter_map(bim_data).filter(|m| m.get("tur").map(String::as_str) == Some(key)).last();
                let cmd = AlanCommand::new(tur, prev).with_units(u);
                self.command_line.push_info(&cmd.prompt());
                self.tabs[i].active_cmd = Some(Box::new(cmd));
            }
            "SAGG_IMARVERI" => {
                use crate::modules::bim::imar::ImarVeriCommand;
                let parsels: Vec<(Handle, codec::EntityType)> = self.tabs[i]
                    .scene
                    .document
                    .entities()
                    .filter(|e| bim_data(e).is_some_and(|m| m.get("tur").map(String::as_str) == Some("parsel")))
                    .map(|e| (e.common().handle, e.clone()))
                    .collect();
                let Some((h, e)) = parsels.first().cloned() else {
                    self.command_line.push_output("SAGG_IMARVERI  Çizimde parsel yok — önce SAGG_PARSEL ile parseli çizin.");
                    return Some(Task::none());
                };
                if parsels.len() > 1 {
                    self.command_line.push_output("SAGG_IMARVERI  Çizimde birden çok parsel var; ilk çizilen kullanılıyor.");
                }
                let cmd = ImarVeriCommand::new(h, e);
                self.command_line.push_info(&cmd.prompt());
                self.tabs[i].active_cmd = Some(Box::new(cmd));
            }
            "SAGG_CEPHE" => {
                use crate::modules::bim::imar::CepheCommand;
                let Some((h, e)) = self.tabs[i]
                    .scene
                    .document
                    .entities()
                    .find(|e| bim_data(e).is_some_and(|m| m.get("tur").map(String::as_str) == Some("parsel")))
                    .map(|e| (e.common().handle, e.clone()))
                else {
                    self.command_line.push_output("SAGG_CEPHE  Çizimde parsel yok — önce SAGG_PARSEL ile parseli çizin.");
                    return Some(Task::none());
                };
                let cmd = CepheCommand::new(h, e);
                self.command_line.push_info(&cmd.prompt());
                self.tabs[i].active_cmd = Some(Box::new(cmd));
            }
            "SAGG_IMARCSV" => {
                let rap = match imar_rapor(&self.tabs[i].scene.document) {
                    Ok((rap, _)) => rap,
                    Err(e) => {
                        self.command_line.push_output(&format!("SAGG_IMARCSV  {e}"));
                        return Some(Task::none());
                    }
                };
                let csv = saggcad_bim::imar::rapor_csv(&rap);
                let name = "saggcad-imar-kontrolu.csv";
                #[cfg(target_arch = "wasm32")]
                {
                    crate::sys::download_bytes(name, csv.as_bytes());
                    self.command_line.push_output(&format!("SAGG_IMARCSV  {name} indirildi."));
                }
                #[cfg(not(target_arch = "wasm32"))]
                {
                    let path = crate::sys::documents_dir().unwrap_or_else(std::env::temp_dir).join(name);
                    match std::fs::write(&path, csv.as_bytes()) {
                        Ok(()) => self.command_line.push_output(&format!("SAGG_IMARCSV  Kaydedildi: {}", path.display())),
                        Err(e) => self.command_line.push_error(&format!("SAGG_IMARCSV  Yazılamadı ({}): {e}", path.display())),
                    }
                }
            }
            "SAGG_IMAR" => {
                for line in imar_lines(&self.tabs[i].scene.document) {
                    self.command_line.push_output(&line);
                }
            }
            "SAGG_DONATIGIR" => {
                use crate::modules::bim::donatigir::DonatiGirCommand;
                let cmd = DonatiGirCommand::new().with_units(u);
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

/// belgedeki parsel, kat dış hatları ve mahallerden imar ön kontrolü; Err: parsel yok. İkinci değer: parsel sayısı.
pub(crate) fn imar_rapor(doc: &codec::Document) -> Result<(saggcad_bim::imar::Rapor, usize), String> {
    use crate::modules::bim::outline_mm;
    use saggcad_bim::imar::{self, from_mm};
    let u = crate::modules::bim::mm_per_unit(doc).unwrap_or(1.0);
    let mut parsel: Option<imar::Parsel> = None;
    let mut parsel_say = 0;
    let mut katlar = Vec::new();
    let mut mahaller = Vec::new();
    for e in doc.entities() {
        let (Some(map), Some(poly)) = (bim_data(e), outline_mm(e, u)) else { continue };
        let poly = from_mm(&poly);
        match map.get("tur").map(String::as_str) {
            Some("parsel") => {
                parsel_say += 1;
                if parsel.is_none() {
                    parsel = Some(imar::parsel_from(&map, poly));
                }
            }
            Some("kat") => katlar.extend(imar::kat_from(&map, poly)),
            Some("mahal") => mahaller.push(imar::Mahal { ad: map.get("ad").cloned().unwrap_or_default(), no: map.get("no").cloned().unwrap_or_default(), poly }),
            _ => {}
        }
    }
    let parsel = parsel.ok_or_else(|| "Çizimde parsel yok — önce SAGG_PARSEL ile parseli ve imar durumunu girin.".to_string())?;
    Ok((imar::hesapla(&parsel, &katlar, &mahaller, &imar::Kurallar::default()), parsel_say))
}

/// SAGG_IMAR raporu (komut satırı)
pub(crate) fn imar_lines(doc: &codec::Document) -> Vec<String> {
    match imar_rapor(doc) {
        Err(e) => vec![format!("SAGG_IMAR  {e}")],
        Ok((rap, n)) => {
            let mut out = saggcad_bim::imar::rapor_satirlari(&rap);
            if n > 1 {
                out.insert(1, "  Çizimde birden çok parsel var; ilk çizilen kullanıldı.".into());
            }
            out
        }
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

inventory::submit!(crate::command::CommandRegistration { names: &["SAGG_DONATI", "SAGG_DONATIMIN", "SAGG_DONATICSV", "SAGG_IMAR", "SAGG_IMARCSV"] });

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
        app.automation_op(r#"{"op":"run","cmd":"SAGG_BIRIM MM"}"#);
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
        app.automation_op(r#"{"op":"run","cmd":"SAGG_BIRIM MM"}"#);
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
        app.automation_op(r#"{"op":"run","cmd":"SAGG_BIRIM MM"}"#);
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

    #[test]
    fn duvar_kapi_mahal_ve_geri_al() {
        use glam::DVec3;
        let mut app = OpenCADStudio::new_for_test();
        app.automation_op(r#"{"op":"new"}"#);
        app.automation_op(r#"{"op":"run","cmd":"SAGG_BIRIM MM"}"#);
        app.automation_op(r#"{"op":"run","cmd":"SAGG_DUVAR 200 2800 E 0,0 5000,0 5000,4000 "}"#);
        assert_eq!(bim_count(&app, "duvar"), 2, "zincirleme iki duvar");
        let i = app.active_tab;
        assert_eq!(existing_names(&app.tabs[i].scene.document, "duvar"), ["DV1", "DV2"]);
        assert!(app.tabs[i].scene.document.entities().filter(|e| bim_data(e).is_some()).all(|e| e.common().layer == "A-DUVAR"));

        // kapı: otomasyonda nesne seçimi olmadığından seçilen duvar komuta doğrudan verilir
        app.automation_op(r#"{"op":"run","cmd":"SAGG_KAPI"}"#);
        let i = app.active_tab;
        let (h, e) = app.tabs[i]
            .scene
            .document
            .entities()
            .find(|e| bim_data(e).is_some_and(|m| m.get("ad").map(String::as_str) == Some("DV1")))
            .map(|e| (e.common().handle, e.clone()))
            .unwrap();
        let result = {
            let cmd = app.tabs[i].active_cmd.as_mut().expect("SAGG_KAPI etkin");
            cmd.inject_picked_entity(e);
            let _ = cmd.on_entity_pick(h, DVec3::ZERO);
            let _ = cmd.on_enter(); // 900
            let _ = cmd.on_enter(); // 2100
            let _ = cmd.on_point(DVec3::new(1000.0, 0.0, 0.0));
            cmd.on_point(DVec3::new(600.0, 700.0, 0.0))
        };
        let _ = app.apply_cmd_result(result);
        let i = app.active_tab;
        assert!(app.tabs[i].active_cmd.is_none());
        assert_eq!(bim_count(&app, "duvar"), 3, "DV1 kapıyla iki parçaya bölündü");
        assert_eq!(bim_count(&app, "kapi"), 2, "kanat + yay");
        let walls: Vec<_> = app.tabs[i].scene.document.entities().filter_map(|e| crate::modules::bim::wall_of(e, 1.0)).collect();
        let (gross, net): (f64, f64) = walls.iter().filter(|w| w.name == "DV1").take(1).map(|w| w.areas()).next().unwrap();
        assert!((gross - 14.0).abs() < 1e-9 && (net - (14.0 - 0.9 * 2.1)).abs() < 1e-9);
        app.automation_op(r#"{"op":"undo"}"#);
        assert_eq!((bim_count(&app, "duvar"), bim_count(&app, "kapi")), (2, 0), "kapı tek geri al");

        // mahal etiketi (ad boşluk içerebilir; komuta doğrudan yazılır)
        app.automation_op(r#"{"op":"run","cmd":"SAGG_MAHAL"}"#);
        let i = app.active_tab;
        let result = {
            let cmd = app.tabs[i].active_cmd.as_mut().expect("SAGG_MAHAL etkin");
            let _ = cmd.on_text_input("YATAK ODASI");
            let _ = cmd.on_enter(); // no 01
            for (x, y) in [(0.0, 0.0), (5000.0, 0.0), (5000.0, 4000.0), (0.0, 4000.0)] {
                let _ = cmd.on_point(DVec3::new(x, y, 0.0));
            }
            cmd.on_enter()
        };
        let _ = app.apply_cmd_result(result);
        assert_eq!(bim_count(&app, "mahal"), 1);
        assert_eq!(bim_count(&app, "mahal_etiket"), 2);
        let i = app.active_tab;
        let texts: Vec<String> = app.tabs[i].scene.document.entities().filter_map(|e| if let codec::EntityType::Text(t) = e { Some(t.value.clone()) } else { None }).collect();
        assert!(texts.contains(&"01 YATAK ODASI".to_string()) && texts.contains(&"A = 20,00 m²".to_string()), "{texts:?}");
    }

    #[test]
    fn imar_kontrolu_parsel_kat_mahal() {
        use glam::DVec3;
        let mut app = OpenCADStudio::new_for_test();
        app.automation_op(r#"{"op":"new"}"#);
        app.automation_op(r#"{"op":"run","cmd":"SAGG_BIRIM MM"}"#);
        // girdiler yokken
        app.automation_op(r#"{"op":"run","cmd":"SAGG_IMAR"}"#);
        let i = app.active_tab;
        assert!(imar_lines(&app.tabs[i].scene.document)[0].contains("parsel yok"));
        // parsel 20×25 m, TAKS 0,40, KAKS 1,20, kat adedi 4
        app.automation_op(r#"{"op":"run","cmd":"SAGG_PARSEL 0.40 1.20 4 15.5 5 3 3 0,0 20000,0 20000,25000 0,25000 "}"#);
        assert_eq!(bim_count(&app, "parsel"), 1);
        // zemin kat 12×15 m (tip/ad komuta doğrudan; ad boşluk içerebilir)
        for (tip, tekrar) in [("Z", "1"), ("N", "2")] {
            app.automation_op(r#"{"op":"run","cmd":"SAGG_KAT"}"#);
            let i = app.active_tab;
            let result = {
                let cmd = app.tabs[i].active_cmd.as_mut().expect("SAGG_KAT etkin");
                let _ = cmd.on_text_input(if tip == "Z" { "ZEMİN KAT" } else { "NORMAL KAT" });
                let _ = cmd.on_text_input(tip);
                let _ = cmd.on_text_input(tekrar);
                for (x, y) in [(3000.0, 5000.0), (15000.0, 5000.0), (15000.0, 20000.0), (3000.0, 20000.0)] {
                    let _ = cmd.on_point(DVec3::new(x, y, 0.0));
                }
                cmd.on_enter()
            };
            let _ = app.apply_cmd_result(result);
        }
        assert_eq!(bim_count(&app, "kat"), 2);
        let i = app.active_tab;
        let lines = imar_lines(&app.tabs[i].scene.document);
        let all = lines.join("\n");
        assert!(lines[0].contains("parsel 500,00 m²") && lines[0].contains("brüt inşaat 540,00 m²"), "{all}");
        assert!(all.contains("[UYGUN] TAKS") && all.contains("[UYGUN] Emsal (KAKS)") && all.contains("[UYGUN] Kat adedi"), "{all}");
        assert!(all.contains("[VERİ EKSİK] Sığınak") && all.contains("[VERİ EKSİK] Yağmur"), "{all}");
        // sığınak / yağmur girdileri: 12 adet 3+ odalı konut, yağış 600 mm, katsayı 0,8
        app.automation_op(r#"{"op":"run","cmd":"SAGG_IMARVERI 0 0 12 0 600 0.8 2400 110"}"#);
        let i = app.active_tab;
        let all = imar_lines(&app.tabs[i].scene.document).join("\n");
        assert!(all.contains("[AYKIRI] Sığınak") && all.contains("48,00 m²"), "çizimde sığınak yok: {all}");
        assert!(all.contains("[BİLGİ] Otopark") && all.contains("= 22 araç") && all.contains("[BİLGİ] Su deposu"), "{all}");
        assert!(all.contains("[VERİ EKSİK] Bahçe mesafeleri") && all.contains("[VERİ EKSİK] Bina yüksekliği"), "{all}");
        let i = app.active_tab;
        let csv = saggcad_bim::imar::rapor_csv(&imar_rapor(&app.tabs[i].scene.document).unwrap().0);
        assert!(csv.contains("\"AYKIRI\";\"Sığınak\""), "{csv}");
        assert!(all.contains("Yağmur suyu deposu") && all.contains("Zorunlu değil"), "{all}");
        app.automation_op(r#"{"op":"undo"}"#);
        let i = app.active_tab;
        assert!(imar_lines(&app.tabs[i].scene.document).join("\n").contains("[VERİ EKSİK] Sığınak"), "imar verisi tek geri al");
    }

    #[test]
    fn metre_biriminde_cizim_ve_birim_sorusu() {
        let mut app = OpenCADStudio::new_for_test();
        app.automation_op(r#"{"op":"new"}"#);
        let i = app.active_tab;
        app.tabs[i].scene.document.header.insertion_units = 0;
        // birimsiz çizimde komut önce birimi sorar
        app.automation_op(r#"{"op":"run","cmd":"SAGG_MAHAL"}"#);
        let i = app.active_tab;
        assert_eq!(app.tabs[i].active_cmd.as_ref().map(|c| c.name()), Some("SAGG_BIRIM"));
        let result = app.tabs[i].active_cmd.as_mut().unwrap().on_text_input("M").expect("birim kabul edilmeli");
        let task = app.apply_cmd_result(result);
        app.drive_headless_task(task).unwrap();
        let i = app.active_tab;
        assert_eq!(app.tabs[i].scene.document.header.insertion_units, 6);
        assert!(app.tabs[i].active_cmd.is_none());
        // metre çiziminde 25 × 15 parsel: 375 m², etiket 0,25 birim (= 250 mm) yüksekliğinde
        app.automation_op(r#"{"op":"run","cmd":"SAGG_PARSEL 0.40 1.20 4 15.5 5 3 3 0,0 25,0 25,15 0,15 "}"#);
        let i = app.active_tab;
        let doc = &app.tabs[i].scene.document;
        let t = doc.entities().find_map(|e| if let codec::EntityType::Text(t) = e { Some(t.clone()) } else { None }).expect("parsel etiketi");
        assert_eq!(t.value, "PARSEL  375,00 m²");
        assert!((t.height - 0.25).abs() < 1e-9, "{}", t.height);
        assert!(imar_lines(doc)[0].contains("parsel 375,00 m²"), "{:?}", imar_lines(doc));
        // duvar kalınlığı mm yazılır (200) → metre çizimde 0,2 birim
        app.automation_op(r#"{"op":"run","cmd":"SAGG_DUVAR 200 2800 E 0,0 5,0 "}"#);
        let i = app.active_tab;
        let duvar = app.tabs[i].scene.document.entities().find(|e| bim_data(e).is_some_and(|m| m.get("tur").map(String::as_str) == Some("duvar"))).unwrap().clone();
        let o = crate::modules::bim::outline_of(&duvar).unwrap();
        assert!((o[0][1] + 0.1).abs() < 1e-9 && (o[2][1] - 0.1).abs() < 1e-9, "{o:?}");
        let w = crate::modules::bim::wall_of(&duvar, 1000.0).unwrap();
        assert!((w.length() - 5000.0).abs() < 1e-6 && (w.t - 200.0).abs() < 1e-9);
    }
}
