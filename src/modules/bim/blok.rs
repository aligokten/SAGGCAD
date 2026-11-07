// SAGGCAD dinamik blok altyapısı.
//
// Her SAGGCAD nesnesi bir blok tanımına (BLOCK) bağlı bir blok örneğidir (INSERT). Tanım, OpenCAD Studio'nun yerel
// dinamik blok nesneleriyle (BLOCKLINEARPARAMETER + BLOCKSTRETCHACTION, BLOCKFLIPPARAMETER + BLOCKFLIPACTION …) kurulur;
// DWG / DXF'e AutoCAD'in okuduğu biçimde yazılır ve kullanıcı kavramaları sürükleyerek örneği uzatabilir / çevirebilir.
//
//   tanimla()          tanımı (yoksa) kurar: nesneler + uzatma / çevirme parametreleri ve eylemleri
//   yerlestir()        örneği koyar; BIM verisi (XDATA) ve SAGGCAD katmanı örnektedir
//   blok_dis_hatti()   örneğin etkin (uzatılmış) geometrisinden dünya koordinatında dış hat — metraj ve imar hesapları
//                      çizimde görüneni okur
//
// Tanımlar ölçü ailesi başına bir tanedir (ör. SAGG_KOLON_300x500_mm): örnek, tanımın kendi ölçüsünde konur; kullanıcı
// uzatırsa OpenCAD Studio örneğe özel temsil bloğu (*U) üretir ve dış hat oradan okunur.
//
// Tanım içindeki nesneler 0 katmanındadır ve renkleri katmandan gelir; böylece örneğin katmanını (S-KOLON …) alırlar.

use codec::types::Vector3;
use codec::{Document, EntityType, Handle};
use glam::DVec3;

use crate::scene::block_actions::{self as actions, Kind as ActionKind};
use crate::scene::block_distance_parameter as distance;
use crate::scene::block_orientation_parameter as orientation;
use crate::scene::Scene;

/// doğrusal parametre + uzatma eylemi (blok yerel koordinatında, çizim biriminde)
#[derive(Clone, Debug)]
pub struct Uzatma {
    pub base: [f64; 2],
    pub end: [f64; 2],
    /// parametre etiketinin yeri (base–end doğrusu üzerinde olmamalı)
    pub etiket: [f64; 2],
    /// uzatma çerçevesi (iki köşe): içinde kalan köşeler parametreyle birlikte taşınır
    pub cerceve: [[f64; 2]; 2],
}

/// çevirme parametresi + çevirme eylemi (yansıma doğrusu base → end)
#[derive(Clone, Debug)]
pub struct Cevirme {
    pub base: [f64; 2],
    pub end: [f64; 2],
    pub referans: [f64; 2],
}

#[derive(Clone, Debug)]
pub struct BlokTanimi {
    pub ad: String,
    pub nesneler: Vec<EntityType>,
    pub uzatmalar: Vec<Uzatma>,
    pub cevirmeler: Vec<Cevirme>,
}

fn v3(p: [f64; 2]) -> Vector3 {
    Vector3::new(p[0], p[1], 0.0)
}

fn d3(p: [f64; 2]) -> DVec3 {
    DVec3::new(p[0], p[1], 0.0)
}

/// blok adındaki ölçü: 300 → "300", 312.5 → "312.5"
pub fn olcu(v: f64) -> String {
    let s = format!("{v:.1}");
    s.trim_end_matches('0').trim_end_matches('.').to_string()
}

/// blok adındaki birim eki (aynı ölçü farklı birimde farklı geometri demektir)
pub fn birim_eki(u: f64) -> &'static str {
    match u {
        x if (x - 1.0).abs() < 1e-9 => "mm",
        x if (x - 10.0).abs() < 1e-9 => "cm",
        x if (x - 1000.0).abs() < 1e-9 => "m",
        x if (x - 100.0).abs() < 1e-9 => "dm",
        x if (x - 25.4).abs() < 1e-9 => "in",
        x if (x - 304.8).abs() < 1e-9 => "ft",
        _ => "u",
    }
}

/// tanımı kur (aynı adla varsa dokunmaz) → tanımın handle'ı
pub fn tanimla(scene: &mut Scene, t: BlokTanimi) -> Result<Handle, String> {
    if let Some(b) = scene.document.block_records.get(&t.ad) {
        return Ok(b.handle);
    }
    let ad = t.ad.clone();
    scene.define_block_raw(&ad, Vector3::ZERO, t.nesneler);
    let (def, uyeler) = {
        let br = scene.document.block_records.get(&ad).ok_or("blok tanımı oluşturulamadı")?;
        (br.handle, br.entity_handles.clone())
    };
    let doc = &mut scene.document;
    for u in &t.uzatmalar {
        let p = distance::create(doc, def, distance::Kind::Linear, v3(u.base), v3(u.end), v3(u.etiket)).map_err(String::from)?;
        let cerceve = [d3(u.cerceve[0]), d3(u.cerceve[1])];
        actions::create_with_frame_points(doc, def, ActionKind::Stretch, p, None, &uyeler, d3(u.etiket), Some(cerceve.as_slice()), None)
            .map_err(String::from)?;
    }
    for c in &t.cevirmeler {
        let p = orientation::create(doc, def, orientation::Kind::Flip, v3(c.base), v3(c.end), v3(c.referans)).map_err(String::from)?;
        actions::create_with_frame_points(doc, def, ActionKind::Flip, p, None, &uyeler, d3(c.referans), None, None).map_err(String::from)?;
    }
    Ok(def)
}

/// örneği koy: konum ve dönüş çizim biriminde / radyan; XDATA ve katman örnekte
pub fn yerlestir(scene: &mut Scene, ad: &str, at: [f64; 2], donus: f64, katman: &str, xdata: Vec<String>) -> Handle {
    let mut ins = codec::entities::Insert::new(ad, v3(at)).with_rotation(donus);
    ins.common.layer = katman.to_string();
    super::set_bim_data(&mut ins.common, xdata);
    scene.add_entity(EntityType::Insert(ins))
}

/// blok örneğinin etkin geometrisindeki ilk kapalı çoklu çizginin dünya koordinatında köşeleri (çizim biriminde)
pub fn blok_dis_hatti(doc: &Document, e: &EntityType) -> Option<Vec<[f64; 2]>> {
    let EntityType::Insert(ins) = e else { return None };
    let br = doc.block_records.get(&ins.block_name)?;
    let tr = crate::scene::render_graph::insert_transform(doc, ins);
    br.entity_handles.iter().filter_map(|h| doc.get_entity(*h)).find_map(|m| match m {
        EntityType::LwPolyline(pl) if pl.is_closed => Some(
            pl.vertices
                .iter()
                .map(|v| {
                    let w = tr.apply(Vector3::new(v.location.x, v.location.y, 0.0));
                    [w.x, w.y]
                })
                .collect(),
        ),
        _ => None,
    })
}

/// dikdörtgen kesitli eleman bloğu: merkez orijinde, b (x) ve h (y) için iki uzatma (sağ kenar / üst kenar taşınır).
/// Ölçüler mm, u: bir çizim biriminin mm karşılığı.
pub fn dikdortgen(ad: String, b: f64, h: f64, u: f64) -> BlokTanimi {
    use codec::entities::{LwPolyline, LwVertex};
    use codec::types::Vector2;
    let (x, y) = (b / 2.0 / u, h / 2.0 / u);
    let mut pl = LwPolyline::new();
    pl.is_closed = true;
    pl.vertices = [[-x, -y], [x, -y], [x, y], [-x, y]].iter().map(|q| LwVertex::new(Vector2::new(q[0], q[1]))).collect();
    pl.common.layer = "0".to_string();
    pl.common.color = codec::types::Color::ByBlock;
    let e = (x.min(y)) * 0.1;
    let off = (x.min(y)) * 0.6;
    BlokTanimi {
        ad,
        nesneler: vec![EntityType::LwPolyline(pl)],
        uzatmalar: vec![
            Uzatma { base: [-x, -y], end: [x, -y], etiket: [0.0, -y - off], cerceve: [[0.0, -y - e], [x + e, y + e]] },
            Uzatma { base: [-x, -y], end: [-x, y], etiket: [-x - off, 0.0], cerceve: [[-x - e, 0.0], [x + e, y + e]] },
        ],
        cevirmeler: Vec::new(),
    }
}

/// kapı bloğu (yerel, çizim biriminde): yüz çizgisi y = 0, duvar −y tarafında (kalınlık t), menteşe (−w/2, 0), kanat +y'ye
/// 90° açık, açılma yayı. Çevirmeler: menteşe ucu (x = 0 doğrusu) ve açılış tarafı (duvar ekseni y = −t/2).
pub fn kapi_blogu(ad: String, w: f64, t: f64, u: f64) -> BlokTanimi {
    use codec::entities::{Arc, Line};
    let (w, t) = (w / u, t / u);
    let x0 = -w / 2.0;
    let mut kanat = Line::from_points(Vector3::new(x0, 0.0, 0.0), Vector3::new(x0, w, 0.0));
    let mut yay = Arc::from_center_radius_angles(Vector3::new(x0, 0.0, 0.0), w, 0.0, std::f64::consts::FRAC_PI_2);
    for c in [&mut kanat.common, &mut yay.common] {
        c.layer = "0".to_string();
        c.color = codec::types::Color::ByBlock;
    }
    BlokTanimi {
        ad,
        nesneler: vec![EntityType::Line(kanat), EntityType::Arc(yay)],
        uzatmalar: Vec::new(),
        cevirmeler: vec![
            Cevirme { base: [0.0, -t / 2.0], end: [0.0, w], referans: [w * 0.15, w * 0.5] },
            Cevirme { base: [-w / 2.0, -t / 2.0], end: [w / 2.0, -t / 2.0], referans: [0.0, -t / 2.0 - w * 0.15] },
        ],
    }
}

/// pencere bloğu (yerel, çizim biriminde): orijin iki yüzün ortasında, yüzler y = ±t/2, cam çizgisi y = 0;
/// genişlik için uzatma (sağ uç taşınır).
pub fn pencere_blogu(ad: String, w: f64, t: f64, u: f64) -> BlokTanimi {
    use codec::entities::Line;
    let (x, y) = (w / 2.0 / u, t / 2.0 / u);
    let nesneler = [y, 0.0, -y]
        .iter()
        .map(|k| {
            let mut l = Line::from_points(Vector3::new(-x, *k, 0.0), Vector3::new(x, *k, 0.0));
            l.common.layer = "0".to_string();
            l.common.color = codec::types::Color::ByBlock;
            EntityType::Line(l)
        })
        .collect();
    let e = y.max(x * 0.05);
    BlokTanimi {
        ad,
        nesneler,
        uzatmalar: vec![Uzatma { base: [-x, -y], end: [x, -y], etiket: [0.0, -y - 3.0 * e], cerceve: [[0.0, -y - e], [x + e, y + e]] }],
        cevirmeler: Vec::new(),
    }
}

/// blok örneğindeki menteşe çevirme parametresi (düşey yansıma doğrusu x = 0)
pub fn mentese_parametresi(doc: &Document, insert: Handle) -> Option<Handle> {
    let def = actions::instance::definition(doc, insert)?;
    actions::all_parameters(doc, def).into_iter().find(|p| p.flip && (p.end - p.base).x.abs() < 1e-9).map(|p| p.handle)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dinamik_dikdortgen_tanimi_ve_ornegi() {
        let mut scene = Scene::new();
        let def = tanimla(&mut scene, dikdortgen("SAGG_KOLON_300x500_mm".into(), 300.0, 500.0, 1.0)).expect("tanım");
        assert_eq!(tanimla(&mut scene, dikdortgen("SAGG_KOLON_300x500_mm".into(), 300.0, 500.0, 1.0)).unwrap(), def, "aynı ad yeniden kurulmaz");
        let params = actions::all_parameters(&scene.document, def);
        assert_eq!(params.iter().filter(|p| p.linear).count(), 2, "b ve h doğrusal parametreleri");
        for p in &params {
            assert!(actions::has_action(&scene.document, def, p.handle), "her parametrenin uzatma eylemi var");
        }
        let h = yerlestir(&mut scene, "SAGG_KOLON_300x500_mm", [1000.0, 2000.0], 0.0, "S-KOLON", saggcad_bim::xdata::kolon("S1", 300.0, 500.0, 2800.0, &saggcad_bim::rebar::Spec::none()));
        let e = scene.document.get_entity(h).unwrap().clone();
        assert_eq!(e.common().layer, "S-KOLON");
        assert_eq!(super::super::bim_data(&e).unwrap().get("ad").map(String::as_str), Some("S1"));
        let o = blok_dis_hatti(&scene.document, &e).expect("dış hat");
        assert_eq!(o, vec![[850.0, 1750.0], [1150.0, 1750.0], [1150.0, 2250.0], [850.0, 2250.0]]);
        // örnek uzatılınca (b: 300 → 400) dış hat etkin geometriden okunur
        let b = params.iter().find(|p| (p.end - p.base).x.abs() > 1.0).unwrap();
        let staged = actions::instance::evaluate_value(&scene.document, h, b.handle, actions::Value::Point(DVec3::new(250.0, -250.0, 0.0)))
            .expect("değerlendirme")
            .expect("değişiklik");
        let e2 = staged.get_entity(h).unwrap().clone();
        let o2 = blok_dis_hatti(&staged, &e2).expect("uzatılmış dış hat");
        let w = o2.iter().map(|p| p[0]).fold(f64::MIN, f64::max) - o2.iter().map(|p| p[0]).fold(f64::MAX, f64::min);
        assert!((w - 400.0).abs() < 1e-6, "{o2:?}");
    }

    #[test]
    fn ad_ekleri() {
        assert_eq!(olcu(300.0), "300");
        assert_eq!(olcu(312.5), "312.5");
        assert_eq!(birim_eki(1000.0), "m");
        assert_eq!(birim_eki(1.0), "mm");
    }

    #[test]
    fn kapi_ve_pencere_bloklari() {
        let mut scene = Scene::new();
        let kapi = tanimla(&mut scene, kapi_blogu("SAGG_KAPI_900x200_mm".into(), 900.0, 200.0, 1.0)).expect("kapı tanımı");
        let ps = actions::all_parameters(&scene.document, kapi);
        assert_eq!(ps.iter().filter(|p| p.flip).count(), 2, "menteşe ve açılış tarafı çevirmeleri");
        let h = yerlestir(&mut scene, "SAGG_KAPI_900x200_mm", [1000.0, 100.0], 0.0, "A-KAPI", Vec::new());
        let p = mentese_parametresi(&scene.document, h).expect("menteşe parametresi");
        let staged = actions::instance::evaluate_value(&scene.document, h, p, actions::Value::Flip(true)).expect("çevirme").expect("değişiklik");
        assert!(staged.get_entity(h).is_some());
        let pencere = tanimla(&mut scene, pencere_blogu("SAGG_PENCERE_1200x200_mm".into(), 1200.0, 200.0, 1.0)).expect("pencere tanımı");
        let ps = actions::all_parameters(&scene.document, pencere);
        assert_eq!(ps.iter().filter(|p| p.linear).count(), 1, "genişlik");
        assert!(ps.iter().all(|p| actions::has_action(&scene.document, pencere, p.handle)));
    }
}
