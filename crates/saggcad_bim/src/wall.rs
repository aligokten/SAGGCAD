//! Duvar ve duvar boşlukları (kapı, pencere). Çizim düzlemi y yukarı, birim mm.
//!
//! Bir duvar, eksen çizgisi (a → b), kalınlık, yükseklik ve hiza ile tanımlıdır. Boşluklar eksen boyunca konumlanır;
//! çizimde duvar, boşluklar arasında kalan **dolu parçalar** (her biri kapalı dikdörtgen) olarak gösterilir. Her parça
//! duvarın tüm tanımını XDATA'da taşır; böylece duvar taşınsa ya da döndürülse de tanım parçanın kendi köşelerinden
//! yeniden kurulur (`from_piece`).

use crate::band::{outline, Align};
use std::collections::BTreeMap;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum OpKind {
    Kapi,
    Pencere,
}

impl OpKind {
    pub fn key(self) -> &'static str {
        match self {
            OpKind::Kapi => "kapi",
            OpKind::Pencere => "pencere",
        }
    }
    fn code(self) -> &'static str {
        match self {
            OpKind::Kapi => "K",
            OpKind::Pencere => "P",
        }
    }
    pub fn label(self) -> &'static str {
        match self {
            OpKind::Kapi => "Kapı",
            OpKind::Pencere => "Pencere",
        }
    }
}

/// duvardaki boşluk: `at` eksen üzerinde orta noktanın a'dan uzaklığı
#[derive(Clone, Debug, PartialEq)]
pub struct Opening {
    pub kind: OpKind,
    pub name: String,
    pub at: f64,
    /// genişlik (mm)
    pub w: f64,
    /// yükseklik (mm)
    pub h: f64,
    /// parapet / denizlik yüksekliği (mm); kapıda 0
    pub sill: f64,
    /// kapı kanadının açıldığı yüz: +1 sol (eksen yönünün solu), -1 sağ
    pub side: i8,
    /// kapı menteşesi: false → boşluğun a tarafındaki ucu, true → b tarafındaki ucu
    pub hinge_end: bool,
}

impl Opening {
    pub fn start(&self) -> f64 {
        self.at - self.w / 2.0
    }
    pub fn end(&self) -> f64 {
        self.at + self.w / 2.0
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct Wall {
    pub name: String,
    pub a: [f64; 2],
    pub b: [f64; 2],
    /// kalınlık (mm)
    pub t: f64,
    /// yükseklik (mm)
    pub height: f64,
    pub align: Align,
    pub openings: Vec<Opening>,
}

/// çizim öğesi (uygulama bunları çizgi / yay nesnelerine çevirir)
#[derive(Clone, Debug, PartialEq)]
pub enum Mark {
    Line([f64; 2], [f64; 2]),
    /// merkez, yarıçap, başlangıç ve bitiş açısı (derece, saat yönü tersine)
    Arc { center: [f64; 2], r: f64, start: f64, end: f64 },
}

/// boşluğun duvara sığmama nedeni
#[derive(Clone, Debug, PartialEq)]
pub enum FitError {
    TooWide,
    OutOfWall,
    Overlaps(String),
}

impl std::fmt::Display for FitError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            FitError::TooWide => write!(f, "boşluk duvar boyundan geniş"),
            FitError::OutOfWall => write!(f, "boşluk duvarın dışına taşıyor"),
            FitError::Overlaps(n) => write!(f, "{n} ile çakışıyor"),
        }
    }
}

pub fn align_code(a: Align) -> &'static str {
    match a {
        Align::Axis => "E",
        Align::Left => "S",
        Align::Right => "G",
    }
}

/// hiza → eksenden sol ve sağ yüz uzaklıkları (sol normal yönünde işaretli)
pub fn face_offsets(t: f64, align: Align) -> (f64, f64) {
    match align {
        Align::Axis => (t / 2.0, -t / 2.0),
        Align::Left => (0.0, -t),
        Align::Right => (t, 0.0),
    }
}

fn num(v: f64) -> String {
    let s = format!("{v:.3}");
    s.trim_end_matches('0').trim_end_matches('.').to_string()
}

fn sub(p: [f64; 2], q: [f64; 2]) -> [f64; 2] {
    [p[0] - q[0], p[1] - q[1]]
}
fn len(v: [f64; 2]) -> f64 {
    (v[0] * v[0] + v[1] * v[1]).sqrt()
}

impl Wall {
    pub fn new(name: &str, a: [f64; 2], b: [f64; 2], t: f64, height: f64, align: Align) -> Wall {
        Wall { name: name.to_string(), a, b, t, height, align, openings: Vec::new() }
    }

    pub fn length(&self) -> f64 {
        len(sub(self.b, self.a))
    }

    /// birim yön ve sol normal
    fn frame(&self) -> Option<([f64; 2], [f64; 2])> {
        let l = self.length();
        if l < 1e-9 {
            return None;
        }
        let d = [(self.b[0] - self.a[0]) / l, (self.b[1] - self.a[1]) / l];
        Some((d, [-d[1], d[0]]))
    }

    /// eksen üzerinde s uzaklığındaki noktanın, eksenden k kadar sola kaydırılmışı
    fn at(&self, s: f64, k: f64) -> [f64; 2] {
        let (d, n) = self.frame().unwrap_or(([1.0, 0.0], [0.0, 1.0]));
        [self.a[0] + d[0] * s + n[0] * k, self.a[1] + d[1] * s + n[1] * k]
    }

    /// noktanın eksen üzerindeki izdüşümü (a'dan uzaklık, sınırlanmamış) ve eksenden işaretli uzaklığı (sol +)
    pub fn project(&self, p: [f64; 2]) -> (f64, f64) {
        let Some((d, n)) = self.frame() else { return (0.0, 0.0) };
        let v = sub(p, self.a);
        (v[0] * d[0] + v[1] * d[1], v[0] * n[0] + v[1] * n[1])
    }

    /// boşluk sığıyor mu (yan yana boşluklar ve duvar uçlarıyla en az `gap` mm pay; dokunma serbest)
    pub fn check(&self, op: &Opening) -> Result<(), FitError> {
        let l = self.length();
        if op.w >= l - 1e-6 {
            return Err(FitError::TooWide);
        }
        if op.start() < -1e-6 || op.end() > l + 1e-6 {
            return Err(FitError::OutOfWall);
        }
        for o in &self.openings {
            if op.start() < o.end() - 1e-6 && o.start() < op.end() - 1e-6 {
                return Err(FitError::Overlaps(o.name.clone()));
            }
        }
        Ok(())
    }

    /// tıklanan noktaya göre boşluğun orta noktası: duvar uçlarına taşmayacak şekilde kaydırılır
    pub fn place(&self, p: [f64; 2], w: f64) -> f64 {
        let (s, _) = self.project(p);
        let l = self.length();
        s.clamp(w / 2.0, (l - w / 2.0).max(w / 2.0))
    }

    /// boşluk ekle (sıralı tutulur)
    pub fn add(&mut self, op: Opening) -> Result<(), FitError> {
        self.check(&op)?;
        self.openings.push(op);
        self.openings.sort_by(|x, y| x.at.partial_cmp(&y.at).unwrap_or(std::cmp::Ordering::Equal));
        Ok(())
    }

    /// dolu parçalar: (başlangıç, bitiş) eksen uzaklıkları
    pub fn solid_spans(&self) -> Vec<(f64, f64)> {
        let mut out = Vec::new();
        let mut s = 0.0;
        for o in &self.openings {
            if o.start() - s > 1e-6 {
                out.push((s, o.start()));
            }
            s = s.max(o.end());
        }
        let l = self.length();
        if l - s > 1e-6 {
            out.push((s, l));
        }
        out
    }

    /// dolu parçaların dış hatları ([a_sağ, b_sağ, b_sol, a_sol]) ve eksen uzaklıkları
    pub fn pieces(&self) -> Vec<([[f64; 2]; 4], f64, f64)> {
        self.solid_spans()
            .into_iter()
            .filter_map(|(s, e)| outline(self.at(s, 0.0), self.at(e, 0.0), self.t, self.align).map(|o| (o, s, e)))
            .collect()
    }

    /// boşluğun plan sembolü. Kapı: 90° açık kanat + açılma yayı. Pencere: iki yüz çizgisi + cam çizgisi.
    pub fn marks(&self, op: &Opening) -> Vec<Mark> {
        let (l, r) = face_offsets(self.t, self.align);
        match op.kind {
            OpKind::Pencere => {
                let mid = (l + r) / 2.0;
                [l, mid, r].iter().map(|k| Mark::Line(self.at(op.start(), *k), self.at(op.end(), *k))).collect()
            }
            OpKind::Kapi => {
                let Some((d, n)) = self.frame() else { return Vec::new() };
                let face = if op.side >= 0 { l } else { r };
                let sign = if op.side >= 0 { 1.0 } else { -1.0 };
                let (hinge_s, free_s) = if op.hinge_end { (op.end(), op.start()) } else { (op.start(), op.end()) };
                let hinge = self.at(hinge_s, face);
                let out = [n[0] * sign, n[1] * sign];
                let leaf = [hinge[0] + out[0] * op.w, hinge[1] + out[1] * op.w];
                let closed = self.at(free_s, face);
                let deg = |v: [f64; 2]| v[1].atan2(v[0]).to_degrees().rem_euclid(360.0);
                let to_closed = deg(sub(closed, hinge));
                let to_leaf = deg(out);
                // yay her zaman saat yönü tersine çizilir: kapalı → açık ya da açık → kapalı
                let ccw = |from: f64, to: f64| (to - from).rem_euclid(360.0);
                let (start, end) = if (ccw(to_closed, to_leaf) - 90.0).abs() < 1.0 { (to_closed, to_leaf) } else { (to_leaf, to_closed) };
                let _ = d;
                vec![Mark::Line(hinge, leaf), Mark::Arc { center: hinge, r: op.w, start, end }]
            }
        }
    }

    /// brüt ve net duvar alanı (m², tek yüz) — net: boşluklar düşülmüş
    pub fn areas(&self) -> (f64, f64) {
        let gross = self.length() * self.height / 1e6;
        let holes: f64 = self.openings.iter().map(|o| o.w * o.h.min(self.height)).sum::<f64>() / 1e6;
        (gross, (gross - holes).max(0.0))
    }

    /// parça XDATA'sı (tüm duvar tanımı + parçanın eksen aralığı)
    pub fn piece_xdata(&self, s: f64, e: f64) -> Vec<String> {
        let mut p: Vec<(String, String)> = vec![
            ("tur".into(), "duvar".into()),
            ("ad".into(), self.name.clone()),
            ("L".into(), num(self.length())),
            ("t".into(), num(self.t)),
            ("H".into(), num(self.height)),
            ("hiza".into(), align_code(self.align).into()),
            ("s".into(), num(s)),
            ("e".into(), num(e)),
        ];
        for (i, o) in self.openings.iter().enumerate() {
            p.push((
                format!("ac{}", i + 1),
                [o.kind.code().to_string(), o.name.clone(), num(o.at), num(o.w), num(o.h), num(o.sill), o.side.to_string(), (o.hinge_end as u8).to_string()].join("|"),
            ));
        }
        crate::xdata::encode(&p)
    }

    /// boşluk sembolünün XDATA'sı
    pub fn opening_xdata(&self, op: &Opening) -> Vec<String> {
        crate::xdata::encode(&[
            ("tur", op.kind.key().to_string()),
            ("ad", op.name.clone()),
            ("duvar", self.name.clone()),
            ("w", num(op.w)),
            ("h", num(op.h)),
            ("parapet", num(op.sill)),
        ])
    }

    /// parçanın XDATA'sı ve gerçek köşeleri → duvar. Eksen köşelerden yeniden kurulur (taşıma / döndürme korunur).
    pub fn from_piece(map: &BTreeMap<String, String>, verts: &[[f64; 2]]) -> Option<Wall> {
        if map.get("tur").map(String::as_str) != Some("duvar") || verts.len() != 4 {
            return None;
        }
        let f = |k: &str| map.get(k).and_then(|s| s.replace(',', ".").parse::<f64>().ok());
        let (l_total, t, height, s) = (f("L")?, f("t")?, f("H")?, f("s")?);
        let align = Align::parse(map.get("hiza").map(String::as_str).unwrap_or("E"))?;
        let edge = sub(verts[1], verts[0]);
        let el = len(edge);
        if el < 1e-9 {
            return None;
        }
        let d = [edge[0] / el, edge[1] / el];
        let n = [-d[1], d[0]];
        let (_, r) = face_offsets(t, align);
        // verts[0] = eksen(s) + n·r
        let ps = [verts[0][0] - n[0] * r, verts[0][1] - n[1] * r];
        let a = [ps[0] - d[0] * s, ps[1] - d[1] * s];
        let b = [a[0] + d[0] * l_total, a[1] + d[1] * l_total];
        let mut w = Wall::new(map.get("ad").map(String::as_str).unwrap_or(""), a, b, t, height, align);
        let mut i = 1;
        while let Some(v) = map.get(&format!("ac{i}")) {
            let q: Vec<&str> = v.split('|').collect();
            if q.len() == 8 {
                let g = |k: usize| q[k].parse::<f64>().ok();
                let kind = if q[0] == "K" { OpKind::Kapi } else { OpKind::Pencere };
                if let (Some(at), Some(ow), Some(oh), Some(sill)) = (g(2), g(3), g(4), g(5)) {
                    w.openings.push(Opening { kind, name: q[1].to_string(), at, w: ow, h: oh, sill, side: q[6].parse().unwrap_or(1), hinge_end: q[7] == "1" });
                }
            }
            i += 1;
        }
        Some(w)
    }

    /// iki duvar aynı mı (aynı ad, eksenleri 1 mm içinde çakışık)
    pub fn same_as(&self, other: &Wall) -> bool {
        let close = |p: [f64; 2], q: [f64; 2]| len(sub(p, q)) < 1.0;
        self.name == other.name && close(self.a, other.a) && close(self.b, other.b)
    }

    /// nokta, duvarın (boşluk sembolleri dahil) etki alanında mı: eksen parçasına uzaklık ≤ t + en geniş boşluk
    pub fn near(&self, p: [f64; 2]) -> bool {
        let (s, k) = self.project(p);
        let reach = self.t + self.openings.iter().map(|o| o.w).fold(0.0, f64::max) + 1.0;
        s > -reach && s < self.length() + reach && k.abs() <= reach
    }
}

/// sonraki ad: önek + (mevcutların en büyüğü + 1)
pub fn next_name(prefix: &str, names: &[String]) -> String {
    let n = names.iter().filter_map(|s| s.strip_prefix(prefix).and_then(|x| x.parse::<u32>().ok())).max().unwrap_or(0);
    format!("{prefix}{}", n + 1)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn wall() -> Wall {
        Wall::new("DV1", [0.0, 0.0], [5000.0, 0.0], 200.0, 2800.0, Align::Axis)
    }

    fn door(at: f64) -> Opening {
        Opening { kind: OpKind::Kapi, name: "KP1".into(), at, w: 900.0, h: 2100.0, sill: 0.0, side: 1, hinge_end: false }
    }

    #[test]
    fn bosluksuz_duvar_tek_parca() {
        let w = wall();
        let p = w.pieces();
        assert_eq!(p.len(), 1);
        assert_eq!(p[0].0, [[0.0, -100.0], [5000.0, -100.0], [5000.0, 100.0], [0.0, 100.0]]);
        assert_eq!(w.areas(), (14.0, 14.0));
    }

    #[test]
    fn kapi_duvari_ikiye_boler() {
        let mut w = wall();
        w.add(door(1000.0)).unwrap();
        assert_eq!(w.solid_spans(), vec![(0.0, 550.0), (1450.0, 5000.0)]);
        let (g, n) = w.areas();
        assert!((g - 14.0).abs() < 1e-9 && (n - (14.0 - 0.9 * 2.1)).abs() < 1e-9);
        let m = w.marks(&w.openings[0]);
        assert_eq!(m[0], Mark::Line([550.0, 100.0], [550.0, 1000.0]), "kanat sol yüzden dik açılır");
        assert_eq!(m[1], Mark::Arc { center: [550.0, 100.0], r: 900.0, start: 0.0, end: 90.0 });
    }

    #[test]
    fn kapi_sag_yuz_ve_b_menteşe() {
        let mut w = wall();
        w.add(Opening { side: -1, hinge_end: true, ..door(1000.0) }).unwrap();
        let m = w.marks(&w.openings[0]);
        assert_eq!(m[0], Mark::Line([1450.0, -100.0], [1450.0, -1000.0]));
        // menteşeden kapalı konum 180°, açık konum 270° → saat yönü tersine 180 → 270
        assert_eq!(m[1], Mark::Arc { center: [1450.0, -100.0], r: 900.0, start: 180.0, end: 270.0 });
    }

    #[test]
    fn pencere_uc_cizgi_ve_sigma() {
        let mut w = wall();
        w.add(door(1000.0)).unwrap();
        let p = Opening { kind: OpKind::Pencere, name: "PN1".into(), at: 3000.0, w: 1200.0, h: 1500.0, sill: 900.0, side: 1, hinge_end: false };
        assert_eq!(w.marks(&p).len(), 3);
        assert_eq!(w.marks(&p)[1], Mark::Line([2400.0, 0.0], [3600.0, 0.0]));
        w.add(p).unwrap();
        assert_eq!(w.pieces().len(), 3);
        assert_eq!(w.check(&door(3200.0)), Err(FitError::Overlaps("PN1".into())));
        assert_eq!(w.check(&door(4800.0)), Err(FitError::OutOfWall));
        assert_eq!(w.place([4990.0, 50.0], 900.0), 4550.0, "uca taşmadan yerleşir");
        assert_eq!(w.check(&Opening { w: 6000.0, ..door(2500.0) }), Err(FitError::TooWide));
    }

    #[test]
    fn parcadan_yeniden_kurulur_tasima_ve_dondurme() {
        let mut w = Wall::new("DV3", [1000.0, 2000.0], [1000.0, 6000.0], 250.0, 3000.0, Align::Left);
        w.add(door(1500.0)).unwrap();
        for (o, s, e) in w.pieces() {
            let map = crate::xdata::decode(&w.piece_xdata(s, e));
            let back = Wall::from_piece(&map, &o).unwrap();
            assert!(back.same_as(&w), "{back:?}");
            assert_eq!(back.openings, w.openings);
            assert_eq!(back.align, Align::Left);
        }
        // parçayı 500 mm sağa taşı → eksen de taşınır
        let (o, s, e) = w.pieces()[1];
        let moved: Vec<[f64; 2]> = o.iter().map(|p| [p[0] + 500.0, p[1]]).collect();
        let back = Wall::from_piece(&crate::xdata::decode(&w.piece_xdata(s, e)), &moved).unwrap();
        assert!((back.a[0] - 1500.0).abs() < 1e-6 && (back.a[1] - 2000.0).abs() < 1e-6, "{:?}", back.a);
        assert!(w.near([1100.0, 3500.0]) && !w.near([5000.0, 3500.0]));
    }

    #[test]
    fn ad_devami() {
        assert_eq!(next_name("DV", &["DV1".into(), "DV4".into(), "D9".into()]), "DV5");
        assert_eq!(next_name("KP", &[]), "KP1");
    }
}
