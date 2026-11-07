// SAGGCAD BIM modülü — "BIM" şerit sekmesi: aks sistemi, betonarme elemanlar, duvar / kapı / pencere, mahal, donatı metrajı.
//
// Hesap ve geometri `crates/saggcad_bim` (saf Rust, WASM'da da çalışır) içindedir; bu modül yalnız komutları ve
// DWG nesnelerine çeviriyi içerir. BIM verisi nesnelerin XDATA'sında, `SAGGCAD` uygulama adıyla saklanır — DWG / DXF
// kaydedip açınca korunur ve başka CAD programları bu nesneleri sıradan çizgi / çoklu çizgi olarak görür.

pub mod aks;
pub mod band;
pub mod birim;
pub mod blok;
pub mod bosluk;
pub mod doseme;
pub mod imar;
pub mod donatigir;
pub mod kolon;
pub mod mahal;

use crate::modules::{CadModule, IconKind, ModuleEvent, RibbonGroup, RibbonItem, ToolDef};

pub struct BimModule;

/// XDATA uygulama adı
pub const APP: &str = saggcad_bim::APP;
pub const LAYER_AKS: &str = "S-AKS";
pub const LAYER_KOLON: &str = "S-KOLON";
pub const LAYER_KIRIS: &str = "S-KIRIS";
pub const LAYER_PERDE: &str = "S-PERDE";
pub const LAYER_DOSEME: &str = "S-DOSEME";
pub const LAYER_DUVAR: &str = "A-DUVAR";
pub const LAYER_KAPI: &str = "A-KAPI";
pub const LAYER_PENCERE: &str = "A-PENCERE";
pub const LAYER_MAHAL: &str = "A-MAHAL";
pub const LAYER_PARSEL: &str = "A-PARSEL";
pub const LAYER_KAT: &str = "A-KAT";

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
                    tools: vec![
                        RibbonItem::LargeTool(tool("SAGG_AKS", "Aks\nsistemi", include_bytes!("../../../assets/icons/saggcad_aks.svg"))),
                        RibbonItem::Tool(tool("SAGG_BIRIM", "Birim (mm/cm/m)", include_bytes!("../../../assets/icons/saggcad_kat.svg"))),
                    ],
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
                    title: "Mimari",
                    tools: vec![
                        RibbonItem::LargeTool(tool("SAGG_DUVAR", "Duvar", include_bytes!("../../../assets/icons/saggcad_duvar.svg"))),
                        RibbonItem::LargeTool(tool("SAGG_KAPI", "Kapı", include_bytes!("../../../assets/icons/saggcad_kapi.svg"))),
                        RibbonItem::LargeTool(tool("SAGG_PENCERE", "Pencere", include_bytes!("../../../assets/icons/saggcad_pencere.svg"))),
                        RibbonItem::LargeTool(tool("SAGG_MAHAL", "Mahal\netiketi", include_bytes!("../../../assets/icons/saggcad_mahal.svg"))),
                    ],
                },
                RibbonGroup {
                    title: "İmar",
                    tools: vec![
                        RibbonItem::LargeTool(tool("SAGG_PARSEL", "Parsel", include_bytes!("../../../assets/icons/saggcad_parsel.svg"))),
                        RibbonItem::LargeTool(tool("SAGG_KAT", "Kat\nalanı", include_bytes!("../../../assets/icons/saggcad_kat.svg"))),
                        RibbonItem::Tool(tool("SAGG_CEPHE", "Cephe (ön/yan/arka)", include_bytes!("../../../assets/icons/saggcad_parsel.svg"))),
                        RibbonItem::Tool(tool("SAGG_IMARVERI", "Sığınak / su / otopark", include_bytes!("../../../assets/icons/saggcad_imar.svg"))),
                        RibbonItem::Tool(tool("SAGG_IMARCSV", "İmar CSV", include_bytes!("../../../assets/icons/saggcad_csv.svg"))),
                        RibbonItem::LargeTool(tool("SAGG_IMAR", "İmar\nkontrolü", include_bytes!("../../../assets/icons/saggcad_imar.svg"))),
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

/// nesnenin dış hattı (çizim biriminde): çoklu çizgi ya da dinamik blok örneğinin etkin geometrisi
pub fn outline_in(doc: &codec::Document, entity: &codec::EntityType) -> Option<Vec<[f64; 2]>> {
    match entity {
        codec::EntityType::Insert(_) => blok::blok_dis_hatti(doc, entity),
        _ => outline_of(entity),
    }
}

/// [`outline_in`] mm cinsinden
pub fn outline_mm_in(doc: &codec::Document, entity: &codec::EntityType, u: f64) -> Option<Vec<[f64; 2]>> {
    outline_in(doc, entity).map(|v| v.into_iter().map(|p| [p[0] * u, p[1] * u]).collect())
}

/// belge bağlamında eleman: dinamik blok örneğinin ölçüleri etkin (uzatılmış) geometriden okunur
pub fn element_in(doc: &codec::Document, entity: &codec::EntityType, u: f64) -> Option<saggcad_bim::rebar::Element> {
    let map = bim_data(entity)?;
    let outline = outline_mm_in(doc, entity, u);
    saggcad_bim::xdata::element_from_outline(&format!("{:X}", entity.common().handle.value()), &map, outline.as_deref(), "")
}

/// nesnenin dış hattı mm cinsinden (u: bir çizim biriminin mm karşılığı)
pub fn outline_mm(entity: &codec::EntityType, u: f64) -> Option<Vec<[f64; 2]>> {
    outline_of(entity).map(|v| v.into_iter().map(|p| [p[0] * u, p[1] * u]).collect())
}

// ---- çizim birimi
//
// BIM modeli (XDATA, hesaplar, yazılan ölçüler) her zaman mm'dir. Çizim ise INSUNITS'te tanımlı birimdedir (mm, cm, m …).
// Komutlar tıklanan noktayı `u` ile çarparak mm'ye çevirir, ürettikleri nesneleri `to_drawing` ile çizim birimine indirir.

/// bir çizim biriminin mm karşılığı (INSUNITS); birimsiz ya da desteklenmeyen birimde None
pub fn mm_per_unit(doc: &codec::Document) -> Option<f64> {
    insunits_mm(doc.header.insertion_units)
}

pub fn insunits_mm(code: i16) -> Option<f64> {
    match code {
        1 => Some(25.4),
        2 => Some(304.8),
        4 => Some(1.0),
        5 => Some(10.0),
        6 => Some(1000.0),
        10 => Some(914.4),
        14 => Some(100.0),
        _ => None,
    }
}

pub fn insunits_name(code: i16) -> &'static str {
    match code {
        1 => "inç",
        2 => "fit",
        4 => "mm",
        5 => "cm",
        6 => "m",
        10 => "yarda",
        14 => "dm",
        0 => "birimsiz",
        _ => "desteklenmeyen birim",
    }
}

fn sc(v: codec::types::Vector3, k: f64) -> codec::types::Vector3 {
    codec::types::Vector3::new(v.x * k, v.y * k, v.z * k)
}

/// mm cinsinden üretilmiş nesneyi çizim birimine çevir (u: bir çizim biriminin mm karşılığı)
pub fn to_drawing(mut e: codec::EntityType, u: f64) -> codec::EntityType {
    if (u - 1.0).abs() < 1e-12 || !(u > 0.0) {
        return e;
    }
    let k = 1.0 / u;
    match &mut e {
        codec::EntityType::LwPolyline(pl) => {
            for v in &mut pl.vertices {
                v.location.x *= k;
                v.location.y *= k;
            }
        }
        codec::EntityType::Line(l) => {
            l.start = sc(l.start, k);
            l.end = sc(l.end, k);
        }
        codec::EntityType::Arc(a) => {
            a.center = sc(a.center, k);
            a.radius *= k;
        }
        codec::EntityType::Circle(c) => {
            c.center = sc(c.center, k);
            c.radius *= k;
        }
        codec::EntityType::Text(t) => {
            t.insertion_point = sc(t.insertion_point, k);
            t.alignment_point = t.alignment_point.map(|p| sc(p, k));
            t.height *= k;
        }
        _ => {}
    }
    e
}

/// mm önizleme noktalarını çizim birimine çevir
pub fn preview_to_drawing(pts: Vec<[f64; 3]>, u: f64) -> Vec<[f64; 3]> {
    pts.into_iter().map(|p| [p[0] / u, p[1] / u, p[2] / u]).collect()
}

/// nesne → donatı hesabının elemanı. Düzlem ölçüleri (kolon kesiti, kiriş / perde boyu ve kalınlığı, döşeme çokgeni)
/// çizimdeki çoklu çizgiden okunur — çizim elle değiştirilse de metraj güncel kalır; yükseklikler XDATA'dan.
pub fn element_of(entity: &codec::EntityType, u: f64) -> Option<saggcad_bim::rebar::Element> {
    let map = bim_data(entity)?;
    let outline = outline_mm(entity, u);
    saggcad_bim::xdata::element_from_outline(&format!("{:X}", entity.common().handle.value()), &map, outline.as_deref(), "")
}

/// duvar → DWG nesneleri: dolu parçalar (kapalı çoklu çizgi, A-DUVAR, tüm duvar tanımı XDATA'da) ve boşluk sembolleri
/// (kapı: kanat çizgisi + açılma yayı, A-KAPI; pencere: üç çizgi, A-PENCERE; XDATA: tur=kapi|pencere, duvar=ad)
pub fn wall_entities(wall: &saggcad_bim::wall::Wall) -> Vec<codec::EntityType> {
    use codec::entities::{Arc, Line, LwPolyline, LwVertex};
    use codec::types::{Vector2, Vector3};
    use saggcad_bim::wall::{Mark, OpKind};
    let mut out = Vec::new();
    for (o, s, e) in wall.pieces() {
        let mut pl = LwPolyline::new();
        pl.is_closed = true;
        pl.vertices = o.iter().map(|q| LwVertex::new(Vector2::new(q[0], q[1]))).collect();
        pl.common.layer = LAYER_DUVAR.to_string();
        set_bim_data(&mut pl.common, wall.piece_xdata(s, e));
        out.push(codec::EntityType::LwPolyline(pl));
    }
    for op in &wall.openings {
        let layer = match op.kind {
            OpKind::Kapi => LAYER_KAPI,
            OpKind::Pencere => LAYER_PENCERE,
        };
        let data = wall.opening_xdata(op);
        for m in wall.marks(op) {
            let mut e = match m {
                Mark::Line(p, q) => codec::EntityType::Line(Line::from_points(Vector3::new(p[0], p[1], 0.0), Vector3::new(q[0], q[1], 0.0))),
                Mark::Arc { center, r, start, end } => codec::EntityType::Arc(Arc::from_center_radius_angles(Vector3::new(center[0], center[1], 0.0), r, start.to_radians(), end.to_radians())),
            };
            e.common_mut().layer = layer.to_string();
            set_bim_data(e.common_mut(), data.clone());
            out.push(e);
        }
    }
    out
}

/// nesnenin temsilî noktası (boşluk sembolünün hangi duvara ait olduğunu bulmak için)
pub fn anchor_point(entity: &codec::EntityType) -> Option<[f64; 2]> {
    match entity {
        codec::EntityType::Line(l) => Some([l.start.x, l.start.y]),
        codec::EntityType::Arc(a) => Some([a.center.x, a.center.y]),
        codec::EntityType::LwPolyline(pl) => pl.vertices.first().map(|v| [v.location.x, v.location.y]),
        _ => None,
    }
}

/// duvar parçası nesnesi → duvar tanımı (parçanın gerçek köşelerinden)
pub fn wall_of(entity: &codec::EntityType, u: f64) -> Option<saggcad_bim::wall::Wall> {
    let map = bim_data(entity)?;
    saggcad_bim::wall::Wall::from_piece(&map, &outline_mm(entity, u)?)
}
