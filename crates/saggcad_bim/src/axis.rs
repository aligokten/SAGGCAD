//! Aks sistemi geometrisi — çizim nesnesinden bağımsız ilkel listesi (çizgi, baloncuk dairesi, ad yazısı).
//! Uygulama bunları DWG Line / Circle / Text nesnelerine çevirir.

use crate::grids::{next_name, AxisKind};

#[derive(Clone, Debug, PartialEq)]
pub struct Axis {
    pub name: String,
    pub kind: AxisKind,
    pub a: [f64; 2],
    pub b: [f64; 2],
}

#[derive(Clone, Debug, PartialEq)]
pub struct Bubble {
    pub axis: String,
    pub center: [f64; 2],
    pub radius: f64,
}

#[derive(Clone, Debug, PartialEq)]
pub struct AxisSystem {
    pub axes: Vec<Axis>,
    pub bubbles: Vec<Bubble>,
}

/// xs: düşey aksların ardışık aralıkları (soldan sağa), ys: yatay aksların aralıkları (aşağıdan yukarı; DWG'de y yukarı).
/// `origin` ilk kesişim; akslar en dış akslardan `over` kadar taşar; her iki uçta `bubble_r` yarıçaplı baloncuk.
/// Adlar `existing` üzerinden devam eder.
pub fn build<S: AsRef<str>>(xs: &[f64], ys: &[f64], origin: [f64; 2], over: f64, bubble_r: f64, existing: &[S]) -> AxisSystem {
    let mut xp = vec![origin[0]];
    for d in xs {
        xp.push(xp.last().unwrap() + d);
    }
    let mut yp = vec![origin[1]];
    for d in ys {
        yp.push(yp.last().unwrap() + d);
    }
    let (xmin, xmax) = (xp[0] - over, xp.last().unwrap() + over);
    let (ymin, ymax) = (yp[0] - over, yp.last().unwrap() + over);
    let mut names: Vec<String> = existing.iter().map(|s| s.as_ref().to_string()).collect();
    let mut axes = Vec::new();
    if !xs.is_empty() || ys.is_empty() {
        for &x in &xp {
            let name = next_name(&names, AxisKind::Number);
            names.push(name.clone());
            axes.push(Axis { name, kind: AxisKind::Number, a: [x, ymin], b: [x, ymax] });
        }
    }
    if !ys.is_empty() || xs.is_empty() {
        for &y in &yp {
            let name = next_name(&names, AxisKind::Letter);
            names.push(name.clone());
            axes.push(Axis { name, kind: AxisKind::Letter, a: [xmin, y], b: [xmax, y] });
        }
    }
    let mut bubbles = Vec::new();
    for ax in &axes {
        let (dx, dy) = (ax.b[0] - ax.a[0], ax.b[1] - ax.a[1]);
        let len = (dx * dx + dy * dy).sqrt().max(1e-9);
        let (ux, uy) = (dx / len, dy / len);
        bubbles.push(Bubble { axis: ax.name.clone(), center: [ax.a[0] - ux * bubble_r, ax.a[1] - uy * bubble_r], radius: bubble_r });
        bubbles.push(Bubble { axis: ax.name.clone(), center: [ax.b[0] + ux * bubble_r, ax.b[1] + uy * bubble_r], radius: bubble_r });
    }
    AxisSystem { axes, bubbles }
}

/// iki aks doğru parçasının kesişimi
pub fn intersect(a: &Axis, b: &Axis) -> Option<[f64; 2]> {
    let r = [a.b[0] - a.a[0], a.b[1] - a.a[1]];
    let s = [b.b[0] - b.a[0], b.b[1] - b.a[1]];
    let den = r[0] * s[1] - r[1] * s[0];
    if den.abs() < 1e-9 {
        return None;
    }
    let q = [b.a[0] - a.a[0], b.a[1] - a.a[1]];
    let t = (q[0] * s[1] - q[1] * s[0]) / den;
    let u = (q[0] * r[1] - q[1] * r[0]) / den;
    if !(-1e-9..=1.0 + 1e-9).contains(&t) || !(-1e-9..=1.0 + 1e-9).contains(&u) {
        return None;
    }
    Some([a.a[0] + r[0] * t, a.a[1] + r[1] * t])
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn aks_sistemi() {
        let s = build::<&str>(&[4000.0, 5000.0], &[3500.0], [0.0, 0.0], 1500.0, 300.0, &[]);
        let names: Vec<&str> = s.axes.iter().map(|a| a.name.as_str()).collect();
        assert_eq!(names, ["1", "2", "3", "A", "B"]);
        assert_eq!(s.axes[1].a, [4000.0, -1500.0]);
        assert_eq!(s.axes[2].b, [9000.0, 5000.0]);
        assert_eq!(s.axes[3].a, [-1500.0, 0.0]);
        assert_eq!(s.axes[4].b, [10500.0, 3500.0]);
        assert_eq!(s.bubbles.len(), 10);
        assert_eq!(s.bubbles[0].center, [0.0, -1800.0]);
        assert_eq!(s.bubbles[1].center, [0.0, 5300.0]);
        let x = intersect(&s.axes[1], &s.axes[4]).unwrap();
        assert!((x[0] - 4000.0).abs() < 1e-9 && (x[1] - 3500.0).abs() < 1e-9);
        let n = s.axes.iter().flat_map(|a| s.axes.iter().map(move |b| (a, b))).filter(|(a, b)| a.name < b.name && intersect(a, b).is_some()).count();
        assert_eq!(n, 6);
        // ad devamı
        let prev: Vec<String> = s.axes.iter().map(|a| a.name.clone()).collect();
        let s2 = build(&[3000.0], &[], [9000.0, 0.0], 1500.0, 300.0, &prev);
        assert_eq!(s2.axes.iter().map(|a| a.name.as_str()).collect::<Vec<_>>(), ["4", "5"]);
    }
}
