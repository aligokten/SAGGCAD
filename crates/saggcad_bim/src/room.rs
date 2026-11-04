//! Mahal (oda / hacim): kapalı çokgen sınır + ad, numara. Alan ve çevre çokgenden hesaplanır (mm → m², m).
//!
//! İmar hesapları (emsal, minimum alanlar) bir sonraki aşamada bu mahal kayıtlarını kullanacak; bu yüzden alan çizimdeki
//! çokgenin kendisinden okunur — XDATA'daki alan yalnız bilgi amaçlıdır, çizim elle değiştirilirse yeniden hesaplanır.

/// çokgen alanı (mm²; köşe sırasından bağımsız, mutlak değer)
pub fn area(pts: &[[f64; 2]]) -> f64 {
    signed_area(pts).abs()
}

fn signed_area(pts: &[[f64; 2]]) -> f64 {
    if pts.len() < 3 {
        return 0.0;
    }
    let mut s = 0.0;
    for i in 0..pts.len() {
        let (p, q) = (pts[i], pts[(i + 1) % pts.len()]);
        s += p[0] * q[1] - q[0] * p[1];
    }
    s / 2.0
}

/// çevre (mm)
pub fn perimeter(pts: &[[f64; 2]]) -> f64 {
    if pts.len() < 2 {
        return 0.0;
    }
    (0..pts.len())
        .map(|i| {
            let (p, q) = (pts[i], pts[(i + 1) % pts.len()]);
            ((q[0] - p[0]).powi(2) + (q[1] - p[1]).powi(2)).sqrt()
        })
        .sum()
}

/// etiketin konacağı nokta: alan ağırlık merkezi; içbükey çokgende merkez dışarıda kalırsa, merkezden (ya da çokgen
/// kutusunun ortasından) geçen yatay çizginin çokgen içindeki en geniş aralığının ortası
pub fn label_point(pts: &[[f64; 2]]) -> [f64; 2] {
    let a = signed_area(pts);
    let c = if a.abs() > 1e-9 {
        let (mut cx, mut cy) = (0.0, 0.0);
        for i in 0..pts.len() {
            let (p, q) = (pts[i], pts[(i + 1) % pts.len()]);
            let k = p[0] * q[1] - q[0] * p[1];
            cx += (p[0] + q[0]) * k;
            cy += (p[1] + q[1]) * k;
        }
        [cx / (6.0 * a), cy / (6.0 * a)]
    } else {
        mean(pts)
    };
    if contains(pts, c) {
        return c;
    }
    let (lo, hi) = pts.iter().fold((f64::MAX, f64::MIN), |(lo, hi), p| (lo.min(p[1]), hi.max(p[1])));
    for y in [c[1], (lo + hi) / 2.0, lo + (hi - lo) * 0.25, lo + (hi - lo) * 0.75] {
        if let Some(x) = widest_span_mid(pts, y) {
            return [x, y];
        }
    }
    mean(pts)
}

/// y yüksekliğindeki yatay çizginin çokgen içindeki en geniş aralığının orta x'i
fn widest_span_mid(pts: &[[f64; 2]], y: f64) -> Option<f64> {
    let n = pts.len();
    let mut xs: Vec<f64> = (0..n)
        .filter_map(|i| {
            let (a, b) = (pts[i], pts[(i + 1) % n]);
            ((a[1] > y) != (b[1] > y)).then(|| a[0] + (y - a[1]) * (b[0] - a[0]) / (b[1] - a[1]))
        })
        .collect();
    xs.sort_by(|p, q| p.partial_cmp(q).unwrap_or(std::cmp::Ordering::Equal));
    xs.chunks_exact(2).filter(|c| c[1] - c[0] > 1e-6).max_by(|p, q| (p[1] - p[0]).partial_cmp(&(q[1] - q[0])).unwrap_or(std::cmp::Ordering::Equal)).map(|c| (c[0] + c[1]) / 2.0)
}

fn mean(pts: &[[f64; 2]]) -> [f64; 2] {
    let n = pts.len().max(1) as f64;
    [pts.iter().map(|p| p[0]).sum::<f64>() / n, pts.iter().map(|p| p[1]).sum::<f64>() / n]
}

/// nokta çokgenin içinde mi (ışın atma)
pub fn contains(pts: &[[f64; 2]], p: [f64; 2]) -> bool {
    let mut inside = false;
    let n = pts.len();
    for i in 0..n {
        let (a, b) = (pts[i], pts[(i + n - 1) % n]);
        if (a[1] > p[1]) != (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0] {
            inside = !inside;
        }
    }
    inside
}

/// alan yazısı: "24,50 m²" (Türkçe ondalık virgül, 2 hane)
pub fn area_text(mm2: f64) -> String {
    format!("{:.2} m²", mm2 / 1e6).replace('.', ",")
}

/// mahal XDATA'sı
pub fn xdata(name: &str, no: &str, pts: &[[f64; 2]]) -> Vec<String> {
    let a = area(pts) / 1e6;
    let c = perimeter(pts) / 1000.0;
    crate::xdata::encode(&[
        ("tur", "mahal".to_string()),
        ("ad", name.to_string()),
        ("no", no.to_string()),
        ("alan", format!("{a:.2}")),
        ("cevre", format!("{c:.2}")),
    ])
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dikdortgen_oda() {
        let p = [[0.0, 0.0], [5000.0, 0.0], [5000.0, 4000.0], [0.0, 4000.0]];
        assert_eq!(area(&p), 20_000_000.0);
        assert_eq!(perimeter(&p), 18_000.0);
        assert_eq!(label_point(&p), [2500.0, 2000.0]);
        assert_eq!(area_text(area(&p)), "20,00 m²");
        let rev: Vec<_> = p.iter().rev().copied().collect();
        assert_eq!(area(&rev), 20_000_000.0, "köşe sırası alanı değiştirmez");
        let m = crate::xdata::decode(&xdata("SALON", "Z01", &p));
        assert_eq!(m.get("alan").map(String::as_str), Some("20.00"));
        assert_eq!(m.get("cevre").map(String::as_str), Some("18.00"));
        assert_eq!(m.get("tur").map(String::as_str), Some("mahal"));
    }

    #[test]
    fn l_bicimli_oda_etiketi_icerde() {
        // L biçimi: 6×6 m kare, sağ üst 4×4 m çıkarılmış → alan 36 − 16 = 20 m²
        let p = [[0.0, 0.0], [6000.0, 0.0], [6000.0, 2000.0], [2000.0, 2000.0], [2000.0, 6000.0], [0.0, 6000.0]];
        assert_eq!(area(&p), 20_000_000.0);
        let c = label_point(&p);
        assert!(contains(&p, c), "{c:?}");
        // ince U: ağırlık merkezi boşlukta kalır, yine içeride bir nokta bulunur
        let u = [[0.0, 0.0], [5000.0, 0.0], [5000.0, 5000.0], [4500.0, 5000.0], [4500.0, 500.0], [500.0, 500.0], [500.0, 5000.0], [0.0, 5000.0]];
        assert!(contains(&u, label_point(&u)), "{:?}", label_point(&u));
    }
}
