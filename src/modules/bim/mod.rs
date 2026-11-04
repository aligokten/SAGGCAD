// SAGGCAD BIM modülü — "BIM" şerit sekmesi: aks sistemi, betonarme kolon, donatı metrajı.
//
// Hesap ve geometri `crates/saggcad_bim` (saf Rust, WASM'da da çalışır) içindedir; bu modül yalnız komutları ve
// DWG nesnelerine çeviriyi içerir. BIM verisi nesnelerin XDATA'sında, `SAGGCAD` uygulama adıyla saklanır — DWG / DXF
// kaydedip açınca korunur ve başka CAD programları bu nesneleri sıradan çizgi / çoklu çizgi olarak görür.

pub mod aks;
pub mod band;
pub mod doseme;
pub mod donatigir;
pub mod kolon;

use crate::modules::{CadModule, IconKind, ModuleEvent, RibbonGroup, RibbonItem, ToolDef};

pub struct BimModule;

/// XDATA uygulama adı
pub const APP: &str = saggcad_bim::APP;
pub const LAYER_AKS: &str = "S-AKS";
pub const LAYER_KOLON: &str = "S-KOLON";
pub const LAYER_KIRIS: &str = "S-KIRIS";
pub const LAYER_PERDE: &str = "S-PERDE";
pub const LAYER_DOSEME: &str = "S-DOSEME";

fn tool(id: &'static str, label: &'static str, icon: &'static [u8]) -> ToolDef {
    ToolDef { id, label, icon: IconKind::Svg(icon), event: ModuleEvent::Command(id.to_string()) }
}

impl CadModule for BimModule {
    fn id(&self) -> &'static str {
        "bim"
    }
    fn title(&self) -> &'static str {
        "BIM"
    }

    fn ribbon_groups(&self) -> &[RibbonGroup] {
        static GROUPS: std::sync::OnceLock<Vec<RibbonGroup>> = std::sync::OnceLock::new();
        GROUPS.get_or_init(|| {
            vec![
                RibbonGroup {
                    title: "Aks",
                    tools: vec![RibbonItem::LargeTool(tool("SAGG_AKS", "Aks\nsistemi", include_bytes!("../../../assets/icons/saggcad_aks.svg")))],
                },
                RibbonGroup {
                    title: "Yapı",
                    tools: vec![
                        RibbonItem::LargeTool(tool("SAGG_KOLON", "Kolon", include_bytes!("../../../assets/icons/saggcad_kolon.svg"))),
                        RibbonItem::LargeTool(tool("SAGG_KIRIS", "Kiriş", include_bytes!("../../../assets/icons/saggcad_kiris.svg"))),
                        RibbonItem::LargeTool(tool("SAGG_PERDE", "Perde", include_bytes!("../../../assets/icons/saggcad_perde.svg"))),
                        RibbonItem::LargeTool(tool("SAGG_DOSEME", "Döşeme", include_bytes!("../../../assets/icons/saggcad_doseme.svg"))),
                    ],
                },
                RibbonGroup {
                    title: "Donatı",
                    tools: vec![
                        RibbonItem::LargeTool(tool("SAGG_DONATI", "Donatı\nmetrajı", include_bytes!("../../../assets/icons/saggcad_donati.svg"))),
                        RibbonItem::Tool(tool("SAGG_DONATIGIR", "Elle gir", include_bytes!("../../../assets/icons/saggcad_donati.svg"))),
                        RibbonItem::Tool(tool("SAGG_DONATIMIN", "Minimum ata", include_bytes!("../../../assets/icons/saggcad_donati_min.svg"))),
                        RibbonItem::Tool(tool("SAGG_DONATICSV", "CSV", include_bytes!("../../../assets/icons/saggcad_csv.svg"))),
                    ],
                },
            ]
        })
    }
}

/// nesnenin SAGGCAD XDATA'sı (anahtar → değer); yoksa None
pub fn bim_data(entity: &codec::EntityType) -> Option<std::collections::BTreeMap<String, String>> {
    let record = entity.common().extended_data.get_record(APP)?;
    let values: Vec<String> = record
        .values
        .iter()
        .filter_map(|v| match v {
            codec::xdata::XDataValue::String(s) => Some(s.clone()),
            _ => None,
        })
        .collect();
    Some(saggcad_bim::xdata::decode(&values))
}

/// SAGGCAD XDATA kaydını nesneye yaz (varsa değiştir)
pub fn set_bim_data(common: &mut codec::entities::EntityCommon, values: Vec<String>) {
    let mut record = codec::xdata::ExtendedDataRecord::new(APP);
    for v in values {
        record.add_value(codec::xdata::XDataValue::String(v));
    }
    common.extended_data.upsert_record(record);
}

/// belgedeki SAGGCAD nesnelerinin belirli türdeki adları (ad devamı için)
pub fn existing_names(doc: &codec::Document, tur: &str) -> Vec<String> {
    doc.entities()
        .filter_map(bim_data)
        .filter(|m| m.get("tur").map(String::as_str) == Some(tur))
        .filter_map(|m| m.get("ad").cloned())
        .collect()
}

/// nesnenin dış hattı (mm): kapalı çoklu çizginin köşeleri
pub fn outline_of(entity: &codec::EntityType) -> Option<Vec<[f64; 2]>> {
    match entity {
        codec::EntityType::LwPolyline(pl) => Some(pl.vertices.iter().map(|v| [v.location.x, v.location.y]).collect()),
        _ => None,
    }
}

/// nesne → donatı hesabının elemanı. Düzlem ölçüleri (kolon kesiti, kiriş / perde boyu ve kalınlığı, döşeme çokgeni)
/// çizimdeki çoklu çizgiden okunur — çizim elle değiştirilse de metraj güncel kalır; yükseklikler XDATA'dan.
pub fn element_of(entity: &codec::EntityType) -> Option<saggcad_bim::rebar::Element> {
    let map = bim_data(entity)?;
    let outline = outline_of(entity);
    saggcad_bim::xdata::element_from_outline(&format!("{:X}", entity.common().handle.value()), &map, outline.as_deref(), "")
}
