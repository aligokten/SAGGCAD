//! Kolon yerleştirme: tıklanan nokta kolonun hangi noktası (merkez ya da köşe) — dikdörtgen kesit dış hattı.

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Anchor {
    Center,
    /// sol alt (DWG: y yukarı)
    BottomLeft,
    BottomRight,
    TopRight,
    TopLeft,
}

impl Anchor {
    pub fn parse(s: &str) -> Option<Anchor> {
        match s.trim().to_ascii_uppercase().as_str() {
            "M" | "MERKEZ" | "C" | "CENTER" => Some(Anchor::Center),
            "SA" | "SOLALT" | "BL" => Some(Anchor::BottomLeft),
            "GA" | "SAGALT" | "BR" => Some(Anchor::BottomRight),
            "GU" | "SAGUST" | "TR" => Some(Anchor::TopRight),
            "SU" | "SOLUST" | "TL" => Some(Anchor::TopLeft),
            _ => None,
        }
    }
    fn sign(self) -> (f64, f64) {
        match self {
            Anchor::Center => (0.0, 0.0),
            Anchor::BottomLeft => (-1.0, -1.0),
            Anchor::BottomRight => (1.0, -1.0),
            Anchor::TopRight => (1.0, 1.0),
            Anchor::TopLeft => (-1.0, 1.0),
        }
    }
}

fn rot(p: (f64, f64), deg: f64) -> (f64, f64) {
    let (s, c) = deg.to_radians().sin_cos();
    (p.0 * c - p.1 * s, p.0 * s + p.1 * c)
}

/// tıklanan nokta `p` = seçilen referans noktası → kolon merkezi (b: x yönü, h: y yönü, açı derece)
pub fn center_from_anchor(p: [f64; 2], b: f64, h: f64, rot_deg: f64, anchor: Anchor) -> [f64; 2] {
    let (sx, sy) = anchor.sign();
    let q = rot((sx * b / 2.0, sy * h / 2.0), rot_deg);
    [p[0] - q.0, p[1] - q.1]
}

/// dış hat köşeleri (sol alt, sağ alt, sağ üst, sol üst)
pub fn outline(center: [f64; 2], b: f64, h: f64, rot_deg: f64) -> [[f64; 2]; 4] {
    [(-1.0, -1.0), (1.0, -1.0), (1.0, 1.0), (-1.0, 1.0)].map(|(sx, sy)| {
        let q = rot((sx * b / 2.0, sy * h / 2.0), rot_deg);
        [center[0] + q.0, center[1] + q.1]
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn yerlestirme() {
        assert_eq!(center_from_anchor([1000.0, 0.0], 300.0, 500.0, 0.0, Anchor::BottomLeft), [1150.0, 250.0]);
        assert_eq!(center_from_anchor([1000.0, 0.0], 300.0, 500.0, 0.0, Anchor::Center), [1000.0, 0.0]);
        for (a, i) in [(Anchor::BottomLeft, 0), (Anchor::BottomRight, 1), (Anchor::TopRight, 2), (Anchor::TopLeft, 3)] {
            for deg in [0.0, 30.0, 90.0, 217.0] {
                let c = center_from_anchor([333.3, -120.7], 300.0, 500.0, deg, a);
                let o = outline(c, 300.0, 500.0, deg);
                assert!((o[i][0] - 333.3).abs() < 1e-9 && (o[i][1] + 120.7).abs() < 1e-9, "{a:?} {deg}");
            }
        }
        assert_eq!(Anchor::parse("sa"), Some(Anchor::BottomLeft));
        assert_eq!(Anchor::parse("?"), None);
    }
}
