//! Betonarme donatı hesabı ve metrajı.
//!
//! Kaynaklar hiçbir zaman karıştırılmaz:
//! * `Manual` — "Statik projeden": kullanıcının girdiği donatı; metraj kesindir (girdi kadar).
//! * `Min` — "Yönetmelik minimumu (yaklaşık)": TS 500 / TBDY 2018 en az koşullarından türetilen ÖN TAHMİN; statik
//!   hesabın yerini tutmaz, raporda ayrı sütunda ve "tahmini" etiketiyle.
//! * `None` — tanımsız: metraja girmez (varsayım üretilmez).
//!
//! İç birimler: geometri cm, çap mm, boy cm (çıktıda m), ağırlık kg. Çelik 7850 kg/m³. Hesap, SAGGCAD'in önceki
//! sürümlerindeki (web: `js/bim/rebar.js`, FreeCAD: `saggcad/core/rebar.py`) hesapla birebir aynıdır ve aynı elle
//! hesaplanmış test değerlerini kullanır.

use std::collections::BTreeMap;

pub const DIAMETERS: [u32; 11] = [8, 10, 12, 14, 16, 18, 20, 22, 25, 28, 32];
pub const STEEL_DENSITY: f64 = 7850.0;

/// kg/m: ρ·π·Ø²/4 (Ø8 → 0,395; Ø10 → 0,617; Ø12 → 0,888; Ø16 → 1,578)
pub fn kg_per_m(d: f64) -> f64 {
    STEEL_DENSITY * std::f64::consts::PI * (d / 1000.0).powi(2) / 4.0
}
/// cm²
pub fn bar_area(d: f64) -> f64 {
    std::f64::consts::PI * (d / 10.0).powi(2) / 4.0
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub enum Kind {
    Kolon,
    Kiris,
    Doseme,
    Perde,
}
impl Kind {
    pub fn key(self) -> &'static str {
        match self {
            Kind::Kolon => "kolon",
            Kind::Kiris => "kiris",
            Kind::Doseme => "doseme",
            Kind::Perde => "perde",
        }
    }
    pub fn title(self) -> &'static str {
        match self {
            Kind::Kolon => "Kolon",
            Kind::Kiris => "Kiriş",
            Kind::Doseme => "Döşeme",
            Kind::Perde => "Perde / betonarme duvar",
        }
    }
    pub fn parse(s: &str) -> Option<Kind> {
        match s {
            "kolon" => Some(Kind::Kolon),
            "kiris" => Some(Kind::Kiris),
            "doseme" => Some(Kind::Doseme),
            "perde" => Some(Kind::Perde),
            _ => None,
        }
    }
    /// elle girilen donatı alanları (lc / top isteğe bağlı)
    pub fn fields(self) -> &'static [&'static str] {
        match self {
            Kind::Kolon => &["n", "d", "sd", "sc", "s", "lc"],
            Kind::Kiris => &["nt", "dt", "nb", "db", "sd", "sc", "s", "lc"],
            Kind::Doseme => &["dx", "sx", "dy", "sy", "top"],
            Kind::Perde => &["dv", "sv", "dh", "sh"],
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub enum Mode {
    None,
    Min,
    Manual,
}
impl Mode {
    pub fn key(self) -> &'static str {
        match self {
            Mode::None => "none",
            Mode::Min => "min",
            Mode::Manual => "manual",
        }
    }
    pub fn title(self) -> &'static str {
        match self {
            Mode::None => "Tanımsız",
            Mode::Min => "Yönetmelik minimumu (yaklaşık)",
            Mode::Manual => "Statik projeden (elle)",
        }
    }
    pub fn parse(s: &str) -> Mode {
        match s {
            "min" => Mode::Min,
            "manual" => Mode::Manual,
            _ => Mode::None,
        }
    }
}

/// eleman geometrisi (cm)
#[derive(Clone, Debug, PartialEq)]
pub enum Geom {
    Kolon { b: f64, h: f64, height: f64, round: bool },
    Kiris { l: f64, b: f64, h: f64 },
    Doseme { pts: Vec<[f64; 2]>, t: f64 },
    Perde { l: f64, t: f64, height: f64, openings: u32 },
}
impl Geom {
    pub fn kind(&self) -> Kind {
        match self {
            Geom::Kolon { .. } => Kind::Kolon,
            Geom::Kiris { .. } => Kind::Kiris,
            Geom::Doseme { .. } => Kind::Doseme,
            Geom::Perde { .. } => Kind::Perde,
        }
    }
}

/// donatı tanımı: kaynak + alanlar (elle modunda)
#[derive(Clone, Debug, PartialEq)]
pub struct Spec {
    pub mode: Mode,
    pub v: BTreeMap<String, f64>,
}
impl Spec {
    pub fn none() -> Spec {
        Spec { mode: Mode::None, v: BTreeMap::new() }
    }
    pub fn min() -> Spec {
        Spec { mode: Mode::Min, v: BTreeMap::new() }
    }
    pub fn manual(pairs: &[(&str, f64)]) -> Spec {
        Spec { mode: Mode::Manual, v: pairs.iter().map(|(k, v)| (k.to_string(), *v)).collect() }
    }
    fn g(&self, k: &str) -> f64 {
        self.v.get(k).copied().unwrap_or(0.0)
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct Element {
    pub key: String,
    pub name: String,
    pub level: String,
    pub geom: Geom,
    pub spec: Spec,
}

#[derive(Clone, Debug, PartialEq)]
pub struct MinRules {
    pub col_rho: f64,
    pub col_rho_max: f64,
    pub col_min_d: u32,
    pub col_min_n: u32,
    pub col_min_n_round: u32,
    pub stir_min_d: u32,
    pub col_conf_max: f64,
    pub col_mid_max: f64,
    pub beam_min_d: u32,
    pub beam_min_n: u32,
    pub beam_conf_max: f64,
    pub slab_rho_total: f64,
    pub slab_min_d: u32,
    pub slab_smax: f64,
    pub wall_rho: f64,
    pub wall_min_d: u32,
    pub wall_smax: f64,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Rules {
    pub concrete: String,
    pub steel: String,
    /// paspayı (cm): kolon, kiriş, döşeme, perde
    pub cover_col: f64,
    pub cover_beam: f64,
    pub cover_slab: f64,
    pub cover_wall: f64,
    /// ×Ø
    pub lap: f64,
    pub end_hook: f64,
    pub stir_hook: f64,
    /// ticari çubuk boyu, cm
    pub stock: f64,
    pub min: MinRules,
}
impl Default for Rules {
    fn default() -> Rules {
        Rules {
            concrete: "C25".into(),
            steel: "B420C".into(),
            cover_col: 3.0,
            cover_beam: 3.0,
            cover_slab: 2.0,
            cover_wall: 2.5,
            lap: 40.0,
            end_hook: 12.0,
            stir_hook: 10.0,
            stock: 1200.0,
            min: MinRules {
                col_rho: 0.01,
                col_rho_max: 0.04,
                col_min_d: 14,
                col_min_n: 4,
                col_min_n_round: 6,
                stir_min_d: 8,
                col_conf_max: 15.0,
                col_mid_max: 20.0,
                beam_min_d: 12,
                beam_min_n: 2,
                beam_conf_max: 15.0,
                slab_rho_total: 0.0035,
                slab_min_d: 8,
                slab_smax: 25.0,
                wall_rho: 0.0025,
                wall_min_d: 10,
                wall_smax: 25.0,
            },
        }
    }
}
fn fck(c: &str) -> f64 {
    match c {
        "C20" => 20.0,
        "C30" => 30.0,
        "C35" => 35.0,
        "C40" => 40.0,
        "C45" => 45.0,
        "C50" => 50.0,
        _ => 25.0,
    }
}
fn fyk(s: &str) -> f64 {
    if s == "B500C" {
        500.0
    } else {
        420.0
    }
}

fn fl(v: f64, step: f64) -> f64 {
    ((v / step) + 1e-9).floor() * step
}
fn ceil(v: f64) -> f64 {
    (v - 1e-9).ceil()
}

pub fn poly_area(pts: &[[f64; 2]]) -> f64 {
    let n = pts.len();
    (0..n).map(|i| pts[i][0] * pts[(i + 1) % n][1] - pts[(i + 1) % n][0] * pts[i][1]).sum::<f64>() / 2.0
}

/// yönetmelik minimumu (ön tahmin) — alanlar `Spec.v` içinde
pub fn min_spec(g: &Geom, r: &Rules) -> Spec {
    let m = &r.min;
    let mut v = BTreeMap::new();
    let mut put = |k: &str, x: f64| {
        v.insert(k.to_string(), x);
    };
    match *g {
        Geom::Kolon { b, h, height, round } => {
            let ac = if round { std::f64::consts::PI * b * b / 4.0 } else { b * h };
            let a_s = m.col_rho * ac;
            let n_min = if round { m.col_min_n_round } else { m.col_min_n } as f64;
            let (mut d, mut n) = (m.col_min_d as f64, n_min);
            for &dd in DIAMETERS.iter().filter(|&&x| x >= m.col_min_d) {
                d = dd as f64;
                n = n_min.max(ceil(a_s / bar_area(d)));
                if !round && n % 2.0 != 0.0 {
                    n += 1.0;
                }
                if n <= if round { 16.0 } else { 12.0 } {
                    break;
                }
            }
            let bmin = b.min(h);
            let sd = (m.stir_min_d as f64).max(DIAMETERS.iter().map(|&x| x as f64).find(|&x| x >= d / 3.0).unwrap_or(8.0));
            let sc = 5f64.max(fl((bmin / 3.0).min(m.col_conf_max), 1.0));
            let s = sc.max(fl((bmin / 2.0).min(m.col_mid_max), 1.0));
            let lc = b.max(h).max(height / 6.0).max(50.0).ceil();
            for (k, x) in [("n", n), ("d", d), ("sd", sd), ("sc", sc), ("s", s), ("lc", lc)] {
                put(k, x);
            }
        }
        Geom::Kiris { b, h, .. } => {
            let fctd = 0.35 * fck(&r.concrete).sqrt() / 1.5;
            let fyd = fyk(&r.steel) / 1.15;
            let rho = 0.8 * fctd / fyd;
            let deff = h - r.cover_beam - 1.0;
            let a_s = rho * b * deff;
            let d = m.beam_min_d as f64;
            let nb = (m.beam_min_n as f64).max(ceil(a_s / bar_area(d)));
            let sc = 5f64.max(fl((h / 4.0).min(m.beam_conf_max), 1.0));
            let s = sc.max(fl(deff / 2.0, 1.0));
            for (k, x) in [("nt", m.beam_min_n as f64), ("dt", d), ("nb", nb), ("db", d), ("sd", m.stir_min_d as f64), ("sc", sc), ("s", s), ("lc", (2.0 * h).ceil()), ("rhoMin", (rho * 1e5).round() / 1e5)] {
                put(k, x);
            }
        }
        Geom::Doseme { t, .. } => {
            let d = m.slab_min_d as f64;
            let a_s = m.slab_rho_total / 2.0 * t * 100.0;
            let s = 5f64.max(fl((bar_area(d) * 100.0 / a_s).min(1.5 * t).min(m.slab_smax), 0.5));
            for (k, x) in [("dx", d), ("sx", s), ("dy", d), ("sy", s), ("top", 0.0)] {
                put(k, x);
            }
        }
        Geom::Perde { t, .. } => {
            let d = m.wall_min_d as f64;
            let a_s = m.wall_rho * t * 100.0 / 2.0;
            let s = 5f64.max(fl((bar_area(d) * 100.0 / a_s).min(m.wall_smax), 0.5));
            for (k, x) in [("dv", d), ("sv", s), ("dh", d), ("sh", s)] {
                put(k, x);
            }
        }
    }
    Spec { mode: Mode::Min, v }
}

/// etkin tanım: None → yok; Min → min_spec; Manual → kayıtlı değerler; eksik zorunlu alan → Err(eksikler)
pub fn effective(el: &Element, r: &Rules) -> Option<Result<Spec, Vec<String>>> {
    match el.spec.mode {
        Mode::None => None,
        Mode::Min => Some(Ok(min_spec(&el.geom, r))),
        Mode::Manual => {
            let missing: Vec<String> = el.geom.kind().fields().iter().filter(|k| **k != "lc" && **k != "top" && !(el.spec.g(k) > 0.0)).map(|k| k.to_string()).collect();
            Some(if missing.is_empty() { Ok(el.spec.clone()) } else { Err(missing) })
        }
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct Bar {
    pub role: String,
    pub d: u32,
    pub n: u32,
    /// her birinin boyu, cm
    pub len: f64,
    /// toplam m
    pub m: f64,
    pub kg: f64,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Takeoff {
    pub mode: Mode,
    pub spec: Option<Spec>,
    pub bars: Vec<Bar>,
    /// m³
    pub concrete: f64,
    pub kg: f64,
    pub ratio: f64,
    pub warnings: Vec<String>,
    pub invalid: bool,
}

fn with_laps(len: f64, d: f64, r: &Rules) -> (f64, u32) {
    let n = if len > r.stock { ceil(len / r.stock) - 1.0 } else { 0.0 };
    (len + n * r.lap * d / 10.0, n as u32)
}
fn stirrup_count(len: f64, lc: f64, sc: f64, s: f64) -> u32 {
    if !(len > 0.0) {
        return 0;
    }
    if 2.0 * lc >= len {
        return fl(len / sc, 1.0) as u32 + 1;
    }
    let nc = fl(lc / sc, 1.0) as u32 + 1;
    let mid = len - 2.0 * lc;
    2 * nc + (ceil(mid / s) - 1.0).max(0.0) as u32
}

/// çokgeni yatay (`x`) ya da düşey (`y`) çizgilerle tara: her çubuk parçasının boyu (cm)
pub fn scan_bars(pts: &[[f64; 2]], along_x: bool, s: f64, cover: f64) -> Vec<f64> {
    let p: Vec<[f64; 2]> = if along_x { pts.to_vec() } else { pts.iter().map(|q| [q[1], q[0]]).collect() };
    let ys: Vec<f64> = p.iter().map(|q| q[1]).collect();
    let y0 = ys.iter().cloned().fold(f64::INFINITY, f64::min) + cover;
    let y1 = ys.iter().cloned().fold(f64::NEG_INFINITY, f64::max) - cover;
    let mut bars = Vec::new();
    if y1 < y0 {
        return bars;
    }
    let n = fl((y1 - y0) / s, 1.0) as usize + 1;
    let step = if n > 1 { (y1 - y0) / (n - 1) as f64 } else { 0.0 };
    for i in 0..n {
        let y = if n > 1 { y0 + i as f64 * step } else { (y0 + y1) / 2.0 };
        let mut xs = Vec::new();
        for j in 0..p.len() {
            let (a, b) = (p[j], p[(j + 1) % p.len()]);
            if (a[1] <= y && y < b[1]) || (b[1] <= y && y < a[1]) {
                xs.push(a[0] + (y - a[1]) / (b[1] - a[1]) * (b[0] - a[0]));
            }
        }
        xs.sort_by(|a, b| a.partial_cmp(b).unwrap());
        for k in (0..xs.len().saturating_sub(1)).step_by(2) {
            let l = xs[k + 1] - xs[k] - 2.0 * cover;
            if l > 0.0 {
                bars.push(l);
            }
        }
    }
    bars
}

pub fn concrete_volume(g: &Geom) -> f64 {
    match g {
        Geom::Kolon { b, h, height, round } => (if *round { std::f64::consts::PI * b * b / 4.0 } else { b * h }) * height / 1e6,
        Geom::Kiris { l, b, h } => b * h * l / 1e6,
        Geom::Doseme { pts, t } => poly_area(pts).abs() * t / 1e6,
        Geom::Perde { l, t, height, .. } => l * t * height / 1e6,
    }
}

fn r1(v: f64) -> f64 {
    (v * 10.0).round() / 10.0
}
fn g1(v: f64) -> String {
    let s = format!("{v:.1}");
    s.trim_end_matches('0').trim_end_matches('.').to_string()
}

pub fn takeoff(el: &Element, r: &Rules) -> Takeoff {
    let concrete = concrete_volume(&el.geom);
    let mut warnings = Vec::new();
    if let Geom::Perde { openings, .. } = el.geom {
        if openings > 0 {
            warnings.push(format!("{openings} açıklık düşülmedi (beton ve donatı brüt)"));
        }
    }
    let spec = match effective(el, r) {
        None => return Takeoff { mode: Mode::None, spec: None, bars: vec![], concrete, kg: 0.0, ratio: 0.0, warnings, invalid: false },
        Some(Err(missing)) => {
            return Takeoff { mode: el.spec.mode, spec: None, bars: vec![], concrete, kg: 0.0, ratio: 0.0, warnings: vec![format!("eksik alan: {} — metraja girmedi", missing.join(", "))], invalid: true }
        }
        Some(Ok(s)) => s,
    };
    let mut bars: Vec<Bar> = Vec::new();
    let mut add = |role: &str, d: f64, n: f64, len: f64| {
        if n > 0.0 && len > 0.0 {
            bars.push(Bar { role: role.into(), d: d as u32, n: n as u32, len: r1(len), m: n * len / 100.0, kg: n * len / 100.0 * kg_per_m(d) });
        }
    };
    let m = &r.min;
    let manual = el.spec.mode == Mode::Manual;
    let sp = |k: &str| spec.g(k);
    match el.geom {
        Geom::Kolon { b, h, height, round } => {
            let c = r.cover_col;
            let (len, laps) = with_laps(height + r.lap * sp("d") / 10.0, sp("d"), r);
            add("Boyuna (üst kata filiz dahil)", sp("d"), sp("n"), len);
            let per = if round { std::f64::consts::PI * (b - 2.0 * c) } else { 2.0 * (b - 2.0 * c) + 2.0 * (h - 2.0 * c) };
            let lc = if sp("lc") > 0.0 { sp("lc") } else { b.max(h).max(height / 6.0).max(50.0) };
            add(if round { "Fret / çember etriye" } else { "Etriye" }, sp("sd"), stirrup_count(height, lc, sp("sc"), sp("s")) as f64, per + 2.0 * r.stir_hook * sp("sd") / 10.0);
            let ac = if round { std::f64::consts::PI * b * b / 4.0 } else { b * h };
            let rho = sp("n") * bar_area(sp("d")) / ac;
            if manual {
                let bmin = b.min(h);
                if rho < m.col_rho - 1e-9 {
                    warnings.push(format!("boyuna donatı oranı %{:.2} < %{} (minimum)", rho * 100.0, g1(m.col_rho * 100.0)));
                }
                if rho > m.col_rho_max {
                    warnings.push(format!("boyuna donatı oranı %{:.2} > %{} (maksimum)", rho * 100.0, g1(m.col_rho_max * 100.0)));
                }
                if sp("d") < m.col_min_d as f64 {
                    warnings.push(format!("boyuna çap Ø{} < Ø{}", g1(sp("d")), m.col_min_d));
                }
                let nmin = if round { m.col_min_n_round } else { m.col_min_n };
                if sp("n") < nmin as f64 {
                    warnings.push(format!("boyuna çubuk sayısı {} < {nmin}", g1(sp("n"))));
                }
                if sp("sd") < m.stir_min_d as f64 {
                    warnings.push(format!("etriye Ø{} < Ø{}", g1(sp("sd")), m.stir_min_d));
                }
                if sp("sc") > (bmin / 3.0).min(m.col_conf_max) + 1e-9 {
                    warnings.push(format!("sarılma bölgesi aralığı {} cm > {} cm", g1(sp("sc")), g1(fl((bmin / 3.0).min(m.col_conf_max), 0.1))));
                }
                if sp("s") > (bmin / 2.0).min(m.col_mid_max) + 1e-9 {
                    warnings.push(format!("orta bölge aralığı {} cm > {} cm", g1(sp("s")), g1(fl((bmin / 2.0).min(m.col_mid_max), 0.1))));
                }
            }
            if laps > 0 {
                warnings.push(format!("boyuna çubukta {laps} ek (> {} m)", g1(r.stock / 100.0)));
            }
        }
        Geom::Kiris { l, b, h } => {
            let c = r.cover_beam;
            for (role, n, d) in [("Üst boyuna", sp("nt"), sp("dt")), ("Alt boyuna", sp("nb"), sp("db"))] {
                let (len, laps) = with_laps(l + 2.0 * r.end_hook * d / 10.0, d, r);
                add(role, d, n, len);
                if laps > 0 {
                    warnings.push(format!("{} çubukta {laps} ek", role.to_lowercase()));
                }
            }
            let lc = if sp("lc") > 0.0 { sp("lc") } else { 2.0 * h };
            add("Etriye", sp("sd"), stirrup_count(l, lc, sp("sc"), sp("s")) as f64, 2.0 * (b - 2.0 * c) + 2.0 * (h - 2.0 * c) + 2.0 * r.stir_hook * sp("sd") / 10.0);
            if manual {
                if sp("nb") < m.beam_min_n as f64 || sp("db") < m.beam_min_d as f64 {
                    warnings.push(format!("alt donatı {}Ø{} < {}Ø{}", g1(sp("nb")), g1(sp("db")), m.beam_min_n, m.beam_min_d));
                }
                if sp("nt") < m.beam_min_n as f64 || sp("dt") < m.beam_min_d as f64 {
                    warnings.push(format!("üst donatı {}Ø{} < {}Ø{}", g1(sp("nt")), g1(sp("dt")), m.beam_min_n, m.beam_min_d));
                }
                let mn = min_spec(&el.geom, r);
                if sp("nb") * bar_area(sp("db")) < mn.g("nb") * bar_area(mn.g("db")) - 1e-9 {
                    warnings.push(format!("alt donatı alanı minimum oranın (%{:.3}) altında", mn.g("rhoMin") * 100.0));
                }
                if sp("sd") < m.stir_min_d as f64 {
                    warnings.push(format!("etriye Ø{} < Ø{}", g1(sp("sd")), m.stir_min_d));
                }
            }
        }
        Geom::Doseme { ref pts, t } => {
            let c = r.cover_slab;
            let layers = if sp("top") > 0.0 { 2.0 } else { 1.0 };
            for (along_x, d, s) in [(true, sp("dx"), sp("sx")), (false, sp("dy"), sp("sy"))] {
                let segs = scan_bars(pts, along_x, s, c);
                let tot: f64 = segs.iter().map(|&len| with_laps(len + 2.0 * r.end_hook * d / 10.0, d, r).0).sum();
                if !segs.is_empty() {
                    let dir = if along_x { "X" } else { "Y" };
                    let lay = if layers > 1.0 { " (alt + üst)" } else { " (alt)" };
                    bars.push(Bar { role: format!("{dir} doğrultusu{lay}"), d: d as u32, n: segs.len() as u32 * layers as u32, len: r1(tot / segs.len() as f64), m: tot * layers / 100.0, kg: tot * layers / 100.0 * kg_per_m(d) });
                }
            }
            if manual {
                let smax = (1.5 * t).min(m.slab_smax);
                let rho = (bar_area(sp("dx")) / sp("sx") + bar_area(sp("dy")) / sp("sy")) / t;
                if sp("sx") > smax + 1e-9 || sp("sy") > smax + 1e-9 {
                    warnings.push(format!("aralık > {} cm", g1(fl(smax, 0.1))));
                }
                if rho < m.slab_rho_total - 1e-9 {
                    warnings.push(format!("iki doğrultu toplam oran %{:.3} < %{:.2}", rho * 100.0, m.slab_rho_total * 100.0));
                }
            } else {
                warnings.push("yalnız alt hasır (iki doğrultuda çalışan döşeme minimumu); mesnet üst donatısı statik hesaba bağlı".into());
            }
        }
        Geom::Perde { l, t, height, .. } => {
            let c = r.cover_wall;
            let (vlen, _) = with_laps(height + r.lap * sp("dv") / 10.0, sp("dv"), r);
            let nv = fl((l - 2.0 * c) / sp("sv"), 1.0) + 1.0;
            let nh = fl((height - 2.0 * c) / sp("sh"), 1.0) + 1.0;
            add("Düşey (iki yüz, filiz dahil)", sp("dv"), 2.0 * nv, vlen);
            let (hlen, _) = with_laps(l - 2.0 * c + 2.0 * r.end_hook * sp("dh") / 10.0, sp("dh"), r);
            add("Yatay (iki yüz)", sp("dh"), 2.0 * nh, hlen);
            if manual {
                let rv = 2.0 * bar_area(sp("dv")) / sp("sv") / t;
                let rh = 2.0 * bar_area(sp("dh")) / sp("sh") / t;
                if rv < m.wall_rho - 1e-9 || rh < m.wall_rho - 1e-9 {
                    warnings.push(format!("gövde oranı (düşey %{:.3}, yatay %{:.3}) < %{:.2}", rv * 100.0, rh * 100.0, m.wall_rho * 100.0));
                }
                if sp("sv") > m.wall_smax || sp("sh") > m.wall_smax {
                    warnings.push(format!("aralık > {} cm", g1(m.wall_smax)));
                }
            }
        }
    }
    let kg: f64 = bars.iter().map(|b| b.kg).sum();
    Takeoff { mode: el.spec.mode, spec: Some(spec), bars, concrete, kg, ratio: if concrete > 0.0 { kg / concrete } else { 0.0 }, warnings, invalid: false }
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct DiameterTotal {
    pub d: u32,
    pub kg_per_m: f64,
    pub m: f64,
    pub kg: f64,
    pub kg_manual: f64,
    pub kg_min: f64,
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct Totals {
    pub manual: f64,
    pub min: f64,
    pub total: f64,
    pub concrete: f64,
    pub concrete_defined: f64,
    pub undefined: usize,
    pub invalid: usize,
    pub count: usize,
    pub ratio: f64,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Report {
    pub rows: Vec<(Element, Takeoff)>,
    pub by_diameter: Vec<DiameterTotal>,
    pub totals: Totals,
}

/// proje raporu: kesin (elle) ve tahmini (minimum) ayrı toplanır
pub fn report(elements: &[Element], r: &Rules) -> Report {
    let rows: Vec<(Element, Takeoff)> = elements.iter().map(|e| (e.clone(), takeoff(e, r))).collect();
    let mut by: BTreeMap<u32, DiameterTotal> = BTreeMap::new();
    let mut t = Totals { count: rows.len(), ..Default::default() };
    for (_, to) in &rows {
        t.concrete += to.concrete;
        if to.mode == Mode::None {
            t.undefined += 1;
            continue;
        }
        if to.invalid {
            t.invalid += 1;
            continue;
        }
        t.concrete_defined += to.concrete;
        if to.mode == Mode::Manual {
            t.manual += to.kg;
        } else {
            t.min += to.kg;
        }
        for b in &to.bars {
            let x = by.entry(b.d).or_insert_with(|| DiameterTotal { d: b.d, kg_per_m: kg_per_m(b.d as f64), ..Default::default() });
            x.m += b.m;
            x.kg += b.kg;
            if to.mode == Mode::Manual {
                x.kg_manual += b.kg;
            } else {
                x.kg_min += b.kg;
            }
        }
    }
    t.total = t.manual + t.min;
    t.ratio = if t.concrete_defined > 0.0 { t.total / t.concrete_defined } else { 0.0 };
    Report { rows, by_diameter: by.into_values().collect(), totals: t }
}

/// CSV (Excel TR: UTF-8 BOM, ';', ondalık virgül)
pub fn to_csv(rep: &Report, title: &str) -> String {
    let n = |v: f64, k: usize| format!("{v:.k$}").replace('.', ",");
    let q = |s: &str| if s.contains([';', '"', '\n']) { format!("\"{}\"", s.replace('"', "\"\"")) } else { s.to_string() };
    let mut out: Vec<Vec<String>> = vec![vec![title.into()], ["Kat", "Eleman", "Tür", "Kaynak", "Rol", "Çap (mm)", "Adet", "Boy (m, her biri)", "Toplam boy (m)", "Ağırlık (kg)", "Beton (m³)", "Not"].iter().map(|s| s.to_string()).collect()];
    for (e, t) in &rep.rows {
        let w = t.warnings.join("; ");
        if t.bars.is_empty() {
            out.push(vec![e.level.clone(), e.name.clone(), e.geom.kind().title().into(), t.mode.title().into(), "".into(), "".into(), "".into(), "".into(), "".into(), "".into(), n(t.concrete, 3), w]);
            continue;
        }
        for (i, b) in t.bars.iter().enumerate() {
            out.push(vec![e.level.clone(), e.name.clone(), e.geom.kind().title().into(), t.mode.title().into(), b.role.clone(), b.d.to_string(), b.n.to_string(), n(b.len / 100.0, 2), n(b.m, 2), n(b.kg, 2), if i == 0 { n(t.concrete, 3) } else { String::new() }, if i == 0 { w.clone() } else { String::new() }]);
        }
    }
    out.push(vec![]);
    out.push(["ÇAP TOPLAMI", "Çap (mm)", "kg/m", "Toplam boy (m)", "Toplam (kg)", "Statik projeden (kg)", "Minimum tahmini (kg)"].iter().map(|s| s.to_string()).collect());
    for x in &rep.by_diameter {
        out.push(vec![String::new(), x.d.to_string(), n(x.kg_per_m, 3), n(x.m, 2), n(x.kg, 2), n(x.kg_manual, 2), n(x.kg_min, 2)]);
    }
    let t = &rep.totals;
    out.push(vec![]);
    out.push(vec!["GENEL TOPLAM (kg)".into(), n(t.total, 2), "Statik projeden".into(), n(t.manual, 2), "Minimum tahmini".into(), n(t.min, 2), "Tanımsız eleman".into(), t.undefined.to_string()]);
    let body: Vec<String> = out.iter().map(|row| row.iter().map(|c| q(c)).collect::<Vec<_>>().join(";")).collect();
    format!("\u{feff}{}", body.join("\r\n"))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn el(geom: Geom, spec: Spec) -> Element {
        Element { key: "k".into(), name: "E".into(), level: "Zemin".into(), geom, spec }
    }
    fn bars(t: &Takeoff) -> Vec<(u32, u32, f64)> {
        t.bars.iter().map(|b| (b.d, b.n, b.len)).collect()
    }
    fn near(a: f64, b: f64, e: f64) -> bool {
        (a - b).abs() <= e
    }

    #[test]
    fn birim_agirlik() {
        assert!(near(kg_per_m(8.0), 0.3946, 1e-4));
        assert!(near(kg_per_m(12.0), 0.8878, 1e-4));
        assert!(near(kg_per_m(16.0), 1.5783, 1e-4));
        assert!(near(bar_area(14.0), 1.5394, 1e-4));
    }

    #[test]
    fn kolon_minimum_30x50() {
        let r = Rules::default();
        let g = Geom::Kolon { b: 30.0, h: 50.0, height: 280.0, round: false };
        let s = min_spec(&g, &r);
        let want: Vec<(&str, f64)> = vec![("d", 14.0), ("lc", 50.0), ("n", 10.0), ("s", 15.0), ("sc", 10.0), ("sd", 8.0)];
        assert_eq!(s.v.iter().map(|(k, v)| (k.as_str(), *v)).collect::<Vec<_>>(), want);
        let t = takeoff(&el(g, Spec::min()), &r);
        assert_eq!(bars(&t), vec![(14, 10, 336.0), (8, 23, 152.0)]);
        assert!(near(t.kg, 10.0 * 3.36 * kg_per_m(14.0) + 23.0 * 1.52 * kg_per_m(8.0), 1e-9));
        assert!(near(t.kg, 54.397, 1e-3));
        assert!(near(t.concrete, 0.42, 1e-12));
        assert!(t.warnings.is_empty());
    }

    #[test]
    fn kiris_minimum_25x50x500() {
        let r = Rules::default();
        let g = Geom::Kiris { l: 500.0, b: 25.0, h: 50.0 };
        let s = min_spec(&g, &r);
        assert!(near(s.g("rhoMin"), 0.8 * (0.35 * 5.0 / 1.5) / (420.0 / 1.15), 1e-5));
        assert_eq!((s.g("nt"), s.g("dt"), s.g("nb"), s.g("db")), (2.0, 12.0, 3.0, 12.0));
        assert_eq!(bars(&takeoff(&el(g, Spec::min()), &r)), vec![(12, 2, 528.8), (12, 3, 528.8), (8, 31, 142.0)]);
    }

    #[test]
    fn doseme_minimum_ve_tarama() {
        let r = Rules::default();
        let g = Geom::Doseme { pts: vec![[0.0, 0.0], [500.0, 0.0], [500.0, 400.0], [0.0, 400.0]], t: 15.0 };
        assert_eq!(min_spec(&g, &r).g("sx"), 19.0);
        let t = takeoff(&el(g, Spec::min()), &r);
        assert_eq!(bars(&t), vec![(8, 21, 515.2), (8, 27, 415.2)]);
        assert!(t.warnings.iter().any(|w| w.contains("mesnet üst donatısı")));
        let l = [[0.0, 0.0], [600.0, 0.0], [600.0, 300.0], [300.0, 300.0], [300.0, 600.0], [0.0, 600.0]];
        let segs = scan_bars(&l, true, 20.0, 2.0);
        assert!(near(segs.iter().sum::<f64>(), 596.0 * 15.0 + 296.0 * 15.0, 1e-6));
    }

    #[test]
    fn perde_minimum_ve_aciklik() {
        let r = Rules::default();
        let g = Geom::Perde { l: 400.0, t: 25.0, height: 280.0, openings: 1 };
        let s = min_spec(&g, &r);
        assert_eq!((s.g("dv"), s.g("sv"), s.g("dh"), s.g("sh")), (10.0, 25.0, 10.0, 25.0));
        let t = takeoff(&el(g, Spec::min()), &r);
        assert_eq!(bars(&t), vec![(10, 32, 320.0), (10, 24, 419.0)]);
        assert!(t.warnings.iter().any(|w| w.contains("açıklık düşülmedi")));
    }

    #[test]
    fn elle_kesin_uyarilar_eksik() {
        let r = Rules::default();
        let g = Geom::Kolon { b: 40.0, h: 40.0, height: 300.0, round: false };
        let ok = takeoff(&el(g.clone(), Spec::manual(&[("n", 8.0), ("d", 16.0), ("sd", 10.0), ("sc", 10.0), ("s", 20.0), ("lc", 60.0)])), &r);
        assert!(ok.warnings.is_empty(), "{:?}", ok.warnings);
        assert_eq!(ok.bars[0].len, 364.0);
        let low = takeoff(&el(g.clone(), Spec::manual(&[("n", 4.0), ("d", 12.0), ("sd", 6.0), ("sc", 20.0), ("s", 30.0)])), &r);
        for k in ["oranı", "Ø12", "Ø6", "sarılma", "orta"] {
            assert!(low.warnings.iter().any(|w| w.contains(k)), "{k}: {:?}", low.warnings);
        }
        let bad = takeoff(&el(g.clone(), Spec::manual(&[("n", 8.0)])), &r);
        assert!(bad.invalid && bad.kg == 0.0);
        let none = takeoff(&el(g, Spec::none()), &r);
        assert_eq!(none.mode, Mode::None);
        assert_eq!(none.kg, 0.0);
    }

    #[test]
    fn on_iki_metre_ustu_ek() {
        let r = Rules::default();
        let t = takeoff(&el(Geom::Kiris { l: 1500.0, b: 30.0, h: 60.0 }, Spec::manual(&[("nt", 2.0), ("dt", 16.0), ("nb", 2.0), ("db", 16.0), ("sd", 8.0), ("sc", 10.0), ("s", 20.0)])), &r);
        assert!(near(t.bars[0].len, 1500.0 + 2.0 * 12.0 * 1.6 + 40.0 * 1.6, 0.051));
        assert!(t.warnings.iter().any(|w| w.contains("1 ek")));
    }

    #[test]
    fn rapor_kesin_tahmini_ayri() {
        let mut r = Rules::default();
        let col = Geom::Kolon { b: 30.0, h: 50.0, height: 280.0, round: false };
        let els = vec![
            el(col.clone(), Spec::min()),
            el(col, Spec::manual(&[("n", 8.0), ("d", 16.0), ("sd", 10.0), ("sc", 10.0), ("s", 15.0), ("lc", 50.0)])),
            el(Geom::Kiris { l: 500.0, b: 25.0, h: 50.0 }, Spec::none()),
        ];
        let rep = report(&els, &r);
        let t = &rep.totals;
        assert!(near(t.min, 10.0 * 3.36 * kg_per_m(14.0) + 23.0 * 1.52 * kg_per_m(8.0), 1e-9));
        assert!(t.manual > 0.0 && t.undefined == 1);
        assert!(near(t.total, rep.by_diameter.iter().map(|x| x.kg).sum(), 1e-9));
        let d14 = rep.by_diameter.iter().find(|x| x.d == 14).unwrap();
        assert_eq!(d14.kg_manual, 0.0);
        assert!(near(d14.kg_min, 10.0 * 3.36 * kg_per_m(14.0), 1e-9));
        r.lap = 50.0;
        assert_eq!(report(&els, &r).rows[0].1.bars[0].len, 280.0 + 50.0 * 1.4);
        let csv = to_csv(&rep, "deneme");
        assert!(csv.starts_with('\u{feff}') && csv.contains("Yönetmelik minimumu (yaklaşık)") && csv.contains("Statik projeden (elle)") && csv.contains(";3,36;"));
    }
}
