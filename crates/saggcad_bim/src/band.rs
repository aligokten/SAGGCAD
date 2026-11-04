//! Kiriş ve perde: iki nokta + genişlik (kalınlık) + hiza → dış hat (dikdörtgen). Çizim düzlemi y yukarı.

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Align {
    /// çizgi eksende
    Axis,
    /// çizgi sol yüzde (gövde çizgi yönünün sağında)
    Left,
    /// çizgi sağ yüzde (gövde solda)
    Right,
}

impl Align {
    pub fn parse(s: &str) -> Option<Align> {
        match s.trim().to_ascii_uppercase().as_str() {
            "E" | "EKSEN" | "C" | "CENTER" => Some(Align::Axis),
            "S" | "SOL" | "L" | "LEFT" => Some(Align::Left),
            "G" | "SAG" | "SAĞ" | "R" | "RIGHT" => Some(Align::Right),
            _ => None,
        }
    }
}

/// dış hat: [a_sağ, b_sağ, b_sol, a_sol] — ilk kenar çizgi boyunca; None: iki nokta çakışık ya da genişlik ≤ 0
pub fn outline(a: [f64; 2], b: [f64; 2], width: f64, align: Align) -> Option<[[f64; 2]; 4]> {
    let (dx, dy) = (b[0] - a[0], b[1] - a[1]);
    let len = (dx * dx + dy * dy).sqrt();
    if len < 1e-9 || !(width > 0.0) {
        return None;
    }
    let n = [-dy / len, dx / len]; // sol normal
    let (l, r) = match align {
        Align::Axis => (width / 2.0, -width / 2.0),
        Align::Left => (0.0, -width),
        Align::Right => (width, 0.0),
    };
    let off = |p: [f64; 2], k: f64| [p[0] + n[0] * k, p[1] + n[1] * k];
    Some([off(a, r), off(b, r), off(b, l), off(a, l)])
}

/// dörtgen dış hattın kenarları: (uzun kenar, kısa kenar)
pub fn rect_sides(pts: &[[f64; 2]]) -> Option<(f64, f64)> {
    if pts.len() != 4 {
        return None;
    }
    let d = |i: usize, j: usize| ((pts[j][0] - pts[i][0]).powi(2) + (pts[j][1] - pts[i][1]).powi(2)).sqrt();
    let (e0, e1) = (d(0, 1), d(1, 2));
    Some((e0.max(e1), e0.min(e1)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hiza_ve_kenarlar() {
        let o = outline([0.0, 0.0], [5000.0, 0.0], 250.0, Align::Axis).unwrap();
        assert_eq!(o, [[0.0, -125.0], [5000.0, -125.0], [5000.0, 125.0], [0.0, 125.0]]);
        let l = outline([0.0, 0.0], [5000.0, 0.0], 250.0, Align::Left).unwrap();
        assert_eq!(l[3], [0.0, 0.0]);
        assert_eq!(l[0], [0.0, -250.0], "sol yüz: gövde çizgi yönünün sağında (aşağıda)");
        let r = outline([0.0, 0.0], [5000.0, 0.0], 250.0, Align::Right).unwrap();
        assert_eq!(r[0], [0.0, 0.0]);
        assert_eq!(r[3], [0.0, 250.0]);
        let v = outline([0.0, 0.0], [0.0, 4000.0], 300.0, Align::Axis).unwrap();
        assert!((v[0][0] - 150.0).abs() < 1e-9 && (v[2][0] + 150.0).abs() < 1e-9);
        assert_eq!(rect_sides(&o), Some((5000.0, 250.0)));
        assert!(outline([1.0, 1.0], [1.0, 1.0], 250.0, Align::Axis).is_none());
        assert_eq!(Align::parse("g"), Some(Align::Right));
    }
}
