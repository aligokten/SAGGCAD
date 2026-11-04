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
    let mut p: Vec<(String, String)> = [("tur", "kolon".to_string()), ("ad", name.to_string()), ("b", num(b)), ("h", num(h)), ("H", num(height)), ("mat", "betonarme".to_string())]
        .into_iter()
        .map(|(k, v)| (k.to_string(), v))
        .collect();
    p.extend(spec_pairs(Kind::Kolon, spec));
    encode(&p)
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
}
