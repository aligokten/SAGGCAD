//! BIM verisinin DWG XDATA'sındaki biçimi: `SAGGCAD` uygulama adı altında "anahtar=değer" dizgileri
//! (XDATA grup kodu 1000). Uzunluklar mm (çizim birimi), çaplar mm, adetler tam sayı.
//!
//! ```text
//! v=1  tur=kolon  ad=S1  b=300  h=500  H=2800  mat=betonarme  rb=manual  rb.n=12  rb.d=16 …
//! v=1  tur=aks    ad=A   yon=letter
//! ```
//! Bilinmeyen anahtarlar korunur (ileri uyumluluk); `v` ileride biçim değişikliği için.

use crate::rebar::{Element, Geom, Kind, Mode, Spec};
use std::collections::BTreeMap;

pub fn encode<K: AsRef<str>>(pairs: &[(K, String)]) -> Vec<String> {
    let mut out = vec![format!("v={}", crate::SCHEMA)];
    out.extend(pairs.iter().filter(|(k, _)| k.as_ref() != "v").map(|(k, v)| format!("{}={v}", k.as_ref())));
    out
}

pub fn decode<S: AsRef<str>>(values: &[S]) -> BTreeMap<String, String> {
    values.iter().filter_map(|s| s.as_ref().split_once('=')).map(|(k, v)| (k.trim().to_string(), v.trim().to_string())).collect()
}

fn num(v: f64) -> String {
    let s = format!("{v:.3}");
    s.trim_end_matches('0').trim_end_matches('.').to_string()
}

/// donatı tanımını XDATA çiftlerine ekle (mm ↔ cm: aralık ve boylar mm saklanır)
pub fn spec_pairs(kind: Kind, spec: &Spec) -> Vec<(String, String)> {
    let mut out = vec![("rb".to_string(), spec.mode.key().to_string())];
    if spec.mode == Mode::Manual {
        for k in kind.fields() {
            if let Some(v) = spec.v.get(*k) {
                out.push((format!("rb.{k}"), num(if is_len(k) { v * 10.0 } else { *v })));
            }
        }
    }
    out
}
fn is_len(k: &str) -> bool {
    matches!(k, "sc" | "s" | "lc" | "sx" | "sy" | "sv" | "sh")
}

pub fn spec_from(map: &BTreeMap<String, String>, kind: Kind) -> Spec {
    let mode = Mode::parse(map.get("rb").map(String::as_str).unwrap_or("none"));
    let mut v = BTreeMap::new();
    if mode == Mode::Manual {
        for k in kind.fields() {
            if let Some(x) = map.get(&format!("rb.{k}")).and_then(|s| s.replace(',', ".").parse::<f64>().ok()) {
                v.insert(k.to_string(), if is_len(k) { x / 10.0 } else { x });
            }
        }
    }
    Spec { mode, v }
}

/// kolon XDATA (ölçüler mm)
pub fn kolon(name: &str, b: f64, h: f64, height: f64, spec: &Spec) -> Vec<String> {
    element(Kind::Kolon, &[("ad", name.to_string()), ("b", num(b)), ("h", num(h)), ("H", num(height)), ("mat", "betonarme".to_string())], spec)
}

/// kiriş XDATA (ölçüler mm): L boy, b genişlik, h yükseklik
pub fn kiris(name: &str, l: f64, b: f64, h: f64, spec: &Spec) -> Vec<String> {
    element(Kind::Kiris, &[("ad", name.to_string()), ("L", num(l)), ("b", num(b)), ("h", num(h)), ("mat", "betonarme".to_string())], spec)
}
/// perde XDATA (mm): L boy, t kalınlık, H yükseklik
pub fn perde(name: &str, l: f64, t: f64, height: f64, spec: &Spec) -> Vec<String> {
    element(Kind::Perde, &[("ad", name.to_string()), ("L", num(l)), ("t", num(t)), ("H", num(height)), ("mat", "betonarme".to_string())], spec)
}
/// döşeme XDATA (mm): t kalınlık — çokgen nesnenin kendisidir
pub fn doseme(name: &str, t: f64, spec: &Spec) -> Vec<String> {
    element(Kind::Doseme, &[("ad", name.to_string()), ("t", num(t)), ("mat", "betonarme".to_string())], spec)
}
fn element(kind: Kind, fields: &[(&str, String)], spec: &Spec) -> Vec<String> {
    let mut p: Vec<(String, String)> = vec![("tur".into(), kind.key().into())];
    p.extend(fields.iter().map(|(k, v)| (k.to_string(), v.clone())));
    p.extend(spec_pairs(kind, spec));
    encode(&p)
}

/// mevcut XDATA'nın donatı tanımını değiştir (diğer anahtarlar korunur)
pub fn with_spec(map: &BTreeMap<String, String>, kind: Kind, spec: &Spec) -> Vec<String> {
    let mut p: Vec<(String, String)> = map.iter().filter(|(k, _)| k.as_str() != "v" && k.as_str() != "rb" && !k.starts_with("rb.")).map(|(k, v)| (k.clone(), v.clone())).collect();
    p.extend(spec_pairs(kind, spec));
    encode(&p)
}

/// elle donatı girişinin alanları: (anahtar, etiket, mm cinsinden mi)
pub fn field_labels(kind: Kind) -> &'static [(&'static str, &'static str, bool)] {
    match kind {
        Kind::Kolon => &[("n", "Boyuna çubuk adedi", false), ("d", "Boyuna çap Ø (mm)", false), ("sd", "Etriye çapı Ø (mm)", false), ("sc", "Sarılma bölgesi etriye aralığı (mm)", true), ("s", "Orta bölge etriye aralığı (mm)", true), ("lc", "Sarılma bölgesi boyu (mm, 0 = kendiliğinden)", true)],
        Kind::Kiris => &[("nt", "Üst boyuna adet", false), ("dt", "Üst boyuna Ø (mm)", false), ("nb", "Alt boyuna adet", false), ("db", "Alt boyuna Ø (mm)", false), ("sd", "Etriye çapı Ø (mm)", false), ("sc", "Sarılma bölgesi etriye aralığı (mm)", true), ("s", "Orta bölge etriye aralığı (mm)", true), ("lc", "Sarılma bölgesi boyu (mm, 0 = kendiliğinden)", true)],
        Kind::Doseme => &[("dx", "X doğrultusu Ø (mm)", false), ("sx", "X doğrultusu aralık (mm)", true), ("dy", "Y doğrultusu Ø (mm)", false), ("sy", "Y doğrultusu aralık (mm)", true), ("top", "Üst hasır da aynı (1 = evet, 0 = hayır)", false)],
        Kind::Perde => &[("dv", "Düşey Ø (mm)", false), ("sv", "Düşey aralık, her yüz (mm)", true), ("dh", "Yatay Ø (mm)", false), ("sh", "Yatay aralık, her yüz (mm)", true)],
    }
}

/// elle girişin başlangıç değerleri: kayıtlı elle tanım varsa o, yoksa o anki yönetmelik minimumu (açıkça kopyalanır)
pub fn manual_defaults(el: &Element, rules: &crate::rebar::Rules) -> Spec {
    if el.spec.mode == Mode::Manual {
        return el.spec.clone();
    }
    let mut s = crate::rebar::min_spec(&el.geom, rules);
    s.v.remove("rhoMin");
    s.mode = Mode::Manual;
    s
}

/// XDATA + (varsa) nesnenin dış hattı → eleman. Dış hat (mm) verilirse ölçüler ondan okunur — çizim elle
/// değiştirilse de metraj güncel kalır; yükseklik / kalınlık gibi düzlem dışı ölçüler XDATA'dan.
pub fn element_from_outline(key: &str, map: &BTreeMap<String, String>, outline: Option<&[[f64; 2]]>, level: &str) -> Option<Element> {
    let kind = Kind::parse(map.get("tur")?)?;
    let f = |k: &str| map.get(k).and_then(|s| s.replace(',', ".").parse::<f64>().ok());
    let mut el = match kind {
        Kind::Doseme => {
            let pts: Vec<[f64; 2]> = outline?.iter().map(|p| [p[0] / 10.0, p[1] / 10.0]).collect();
            if pts.len() < 3 {
                return None;
            }
            Element { key: key.to_string(), name: map.get("ad").cloned().unwrap_or_default(), level: level.to_string(), geom: Geom::Doseme { pts, t: f("t")? / 10.0 }, spec: spec_from(map, kind) }
        }
        _ => element_from(key, map, level)?,
    };
    if let Some(pts) = outline {
        if let Some((long, short)) = crate::band::rect_sides(pts) {
            match &mut el.geom {
                Geom::Kolon { b, h, round: false, .. } => {
                    let e0 = ((pts[1][0] - pts[0][0]).powi(2) + (pts[1][1] - pts[0][1]).powi(2)).sqrt();
                    let e1 = ((pts[2][0] - pts[1][0]).powi(2) + (pts[2][1] - pts[1][1]).powi(2)).sqrt();
                    *b = e0 / 10.0;
                    *h = e1 / 10.0;
                }
                Geom::Kiris { l, b, .. } => {
                    *l = long / 10.0;
                    *b = short / 10.0;
                }
                Geom::Perde { l, t, .. } => {
                    *l = long / 10.0;
                    *t = short / 10.0;
                }
                _ => {}
            }
        }
    }
    Some(el)
}

/// aks XDATA
pub fn aks(name: &str, letter: bool) -> Vec<String> {
    encode(&[("tur", "aks".to_string()), ("ad", name.to_string()), ("yon", if letter { "letter" } else { "number" }.to_string())])
}

/// XDATA → donatı hesabının elemanı (cm); BIM elemanı değilse None
pub fn element_from(key: &str, map: &BTreeMap<String, String>, level: &str) -> Option<Element> {
    let f = |k: &str| map.get(k).and_then(|s| s.replace(',', ".").parse::<f64>().ok());
    let kind = Kind::parse(map.get("tur")?)?;
    let geom = match kind {
        Kind::Kolon => Geom::Kolon { b: f("b")? / 10.0, h: f("h")? / 10.0, height: f("H")? / 10.0, round: map.get("kesit").map(String::as_str) == Some("daire") },
        Kind::Kiris => Geom::Kiris { l: f("L")? / 10.0, b: f("b")? / 10.0, h: f("h")? / 10.0 },
        Kind::Perde => Geom::Perde { l: f("L")? / 10.0, t: f("t")? / 10.0, height: f("H")? / 10.0, openings: f("acik").unwrap_or(0.0) as u32 },
        Kind::Doseme => return None,   // döşeme çokgeni nesnenin kendisinden gelir (uygulama katmanı)
    };
    Some(Element { key: key.to_string(), name: map.get("ad").cloned().unwrap_or_default(), level: level.to_string(), geom, spec: spec_from(map, kind) })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::rebar::{report, Rules};

    #[test]
    fn gidis_donus() {
        let spec = Spec::manual(&[("n", 12.0), ("d", 16.0), ("sd", 8.0), ("sc", 10.0), ("s", 15.0), ("lc", 50.0)]);
        let x = kolon("S1", 300.0, 500.0, 2800.0, &spec);
        assert_eq!(&x[..7], ["v=1", "tur=kolon", "ad=S1", "b=300", "h=500", "H=2800", "mat=betonarme"]);
        assert!(x.contains(&"rb=manual".to_string()) && x.contains(&"rb.sc=100".to_string()) && x.contains(&"rb.n=12".to_string()));
        let map = decode(&x);
        let el = element_from("h1", &map, "Zemin").unwrap();
        assert_eq!(el.geom, Geom::Kolon { b: 30.0, h: 50.0, height: 280.0, round: false });
        assert_eq!(el.spec, spec);
        let min = element_from("h2", &decode(&kolon("S2", 300.0, 500.0, 2800.0, &Spec::min())), "").unwrap();
        let rep = report(&[el, min], &Rules::default());
        assert!((rep.totals.min - 54.397).abs() < 1e-3);
        assert!(rep.totals.manual > 0.0);
        assert!(element_from("a", &decode(&aks("A", true)), "").is_none());
        assert_eq!(decode(&aks("A", true)).get("yon").map(String::as_str), Some("letter"));
    }

    #[test]
    fn kiris_perde_doseme_ve_dis_hattan_olcu() {
        use crate::band::{outline, Align};
        let r = Rules::default();
        // kiriş: XDATA 5000 ama dış hat 6000 × 250 → metraj dış hattan (çizim uzatılmış)
        let k = decode(&kiris("K1", 5000.0, 250.0, 500.0, &Spec::min()));
        let o = outline([0.0, 0.0], [6000.0, 0.0], 250.0, Align::Axis).unwrap();
        let el = element_from_outline("k", &k, Some(&o), "").unwrap();
        assert_eq!(el.geom, Geom::Kiris { l: 600.0, b: 25.0, h: 50.0 });
        // perde
        let p = decode(&perde("P1", 4000.0, 250.0, 2800.0, &Spec::min()));
        let o = outline([0.0, 0.0], [0.0, 4000.0], 250.0, Align::Left).unwrap();
        let el = element_from_outline("p", &p, Some(&o), "").unwrap();
        assert_eq!(el.geom, Geom::Perde { l: 400.0, t: 25.0, height: 280.0, openings: 0 });
        let t = crate::rebar::takeoff(&el, &r);
        assert_eq!(t.bars.iter().map(|b| (b.d, b.n, b.len)).collect::<Vec<_>>(), vec![(10, 32, 320.0), (10, 24, 419.0)]);
        // döşeme: çokgen nesneden (mm → cm), kalınlık XDATA'dan
        let d = decode(&doseme("D1", 150.0, &Spec::min()));
        let poly = [[0.0, 0.0], [5000.0, 0.0], [5000.0, 4000.0], [0.0, 4000.0]];
        let el = element_from_outline("d", &d, Some(&poly), "").unwrap();
        let t = crate::rebar::takeoff(&el, &r);
        assert_eq!(t.bars.iter().map(|b| (b.d, b.n, b.len)).collect::<Vec<_>>(), vec![(8, 21, 515.2), (8, 27, 415.2)]);
        assert!(element_from_outline("d", &d, None, "").is_none(), "döşeme çokgensiz olmaz");
        // kolon: dış hat 400 × 600 → b=40, h=60
        let c = decode(&kolon("S1", 300.0, 500.0, 2800.0, &Spec::none()));
        let el = element_from_outline("c", &c, Some(&[[0.0, 0.0], [400.0, 0.0], [400.0, 600.0], [0.0, 600.0]]), "").unwrap();
        assert_eq!(el.geom, Geom::Kolon { b: 40.0, h: 60.0, height: 280.0, round: false });
    }

    #[test]
    fn elle_giris_varsayilan_ve_xdata_guncelleme() {
        let r = Rules::default();
        let c = decode(&kolon("S1", 300.0, 500.0, 2800.0, &Spec::none()));
        let el = element_from("c", &c, "").unwrap();
        let d = manual_defaults(&el, &r);
        assert_eq!(d.mode, Mode::Manual);
        assert_eq!((d.v["n"], d.v["d"], d.v["sc"], d.v["s"]), (10.0, 14.0, 10.0, 15.0));
        assert!(!d.v.contains_key("rhoMin"));
        let mut s = d.clone();
        s.v.insert("n".into(), 12.0);
        s.v.insert("d".into(), 16.0);
        let x = with_spec(&c, Kind::Kolon, &s);
        assert_eq!(x[0], "v=1");
        let m = decode(&x);
        assert_eq!(m.get("ad").map(String::as_str), Some("S1"));
        assert_eq!(m.get("rb").map(String::as_str), Some("manual"));
        assert_eq!(m.get("rb.sc").map(String::as_str), Some("100"), "aralık mm saklanır");
        let el2 = element_from("c", &m, "").unwrap();
        assert_eq!(el2.spec, s);
        assert!((crate::rebar::takeoff(&el2, &r).kg - (12.0 * 3.44 * crate::rebar::kg_per_m(16.0) + 23.0 * 1.52 * crate::rebar::kg_per_m(8.0))).abs() < 1e-9);
        // elle tanım varsa o korunur
        assert_eq!(manual_defaults(&el2, &r), s);
        assert_eq!(field_labels(Kind::Kiris).len(), Kind::Kiris.fields().len());
        assert_eq!(field_labels(Kind::Doseme).iter().map(|f| f.0).collect::<Vec<_>>(), Kind::Doseme.fields());
    }
}
