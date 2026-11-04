//! Aks adlandırma ve aralık ayrıştırma. Yatay akslar harf (A, B, … Z, AA, …), düşey akslar rakam (1, 2, 3, …).

/// 0 → A, 25 → Z, 26 → AA, 27 → AB …
pub fn letter_of(mut n: usize) -> String {
    let mut s = Vec::new();
    n += 1;
    while n > 0 {
        let m = (n - 1) % 26;
        s.push((b'A' + m as u8) as char);
        n = (n - 1) / 26;
    }
    s.iter().rev().collect()
}

fn letter_idx(s: &str) -> Option<usize> {
    if s.is_empty() || !s.bytes().all(|b| b.is_ascii_uppercase()) {
        return None;
    }
    let mut n = 0usize;
    for b in s.bytes() {
        n = n * 26 + (b - b'A' + 1) as usize;
    }
    Some(n - 1)
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum AxisKind {
    /// düşey aks (rakam)
    Number,
    /// yatay aks (harf)
    Letter,
}

/// mevcut adlardan sonraki ad
pub fn next_name<S: AsRef<str>>(names: &[S], kind: AxisKind) -> String {
    match kind {
        AxisKind::Letter => {
            let used = names.iter().filter_map(|n| letter_idx(n.as_ref())).max();
            letter_of(used.map_or(0, |u| u + 1))
        }
        AxisKind::Number => {
            let used = names.iter().filter_map(|n| n.as_ref().parse::<u64>().ok().filter(|_| n.as_ref().bytes().all(|b| b.is_ascii_digit()))).max();
            (used.unwrap_or(0) + 1).to_string()
        }
    }
}

/// "4000 5000 4000", "3x3500", "2×3000;4500,5" → aralıklar. Boş → boş liste; geçersiz → None.
pub fn parse_spacing(text: &str) -> Option<Vec<f64>> {
    let mut out = Vec::new();
    for tok in text.split(|c: char| c.is_whitespace() || c == ';').filter(|t| !t.is_empty()) {
        let tok = tok.replace(',', ".");
        let (n, v) = match tok.find(|c| c == 'x' || c == 'X' || c == '×' || c == '*') {
            Some(i) => {
                let (a, b) = tok.split_at(i);
                let b = &b[b.chars().next()?.len_utf8()..];
                (a.trim().parse::<usize>().ok()?, b.trim().parse::<f64>().ok()?)
            }
            None => (1, tok.parse::<f64>().ok()?),
        };
        if !(v > 0.0) || !v.is_finite() || n < 1 || n > 200 {
            return None;
        }
        out.extend(std::iter::repeat(v).take(n));
    }
    Some(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn adlar() {
        let v: Vec<String> = [0, 1, 25, 26, 27, 51, 52].iter().map(|&i| letter_of(i)).collect();
        assert_eq!(v, ["A", "B", "Z", "AA", "AB", "AZ", "BA"]);
        assert_eq!(next_name::<&str>(&[], AxisKind::Letter), "A");
        assert_eq!(next_name::<&str>(&[], AxisKind::Number), "1");
        assert_eq!(next_name(&["A", "C", "1", "X1"], AxisKind::Letter), "D");
        assert_eq!(next_name(&["A", "2", "7"], AxisKind::Number), "8");
        assert_eq!(next_name(&["Z"], AxisKind::Letter), "AA");
    }

    #[test]
    fn aralik() {
        assert_eq!(parse_spacing("400 500 400"), Some(vec![400.0, 500.0, 400.0]));
        assert_eq!(parse_spacing("3x350"), Some(vec![350.0; 3]));
        assert_eq!(parse_spacing("2×300;450,5"), Some(vec![300.0, 300.0, 450.5]));
        assert_eq!(parse_spacing(""), Some(vec![]));
        assert_eq!(parse_spacing("400 abc"), None);
        assert_eq!(parse_spacing("-200"), None);
        assert_eq!(parse_spacing("0"), None);
    }
}
