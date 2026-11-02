"""Akslar (yapı aks sistemi) — saf geometri.

Adlandırma: yatay akslar harf (A, B, … Z, AA, …), düşey akslar rakam (1, 2, 3, …). Aralık listeleri metinden okunur:
"400 500 400", "3x350", "2×300;450,5". Birim çağırana bağlıdır (FreeCAD katmanı mm kullanır).
"""
import math
import re


def letter_of(n):
    """0 → A, 25 → Z, 26 → AA, 27 → AB …"""
    s, n = "", n + 1
    while n > 0:
        m = (n - 1) % 26
        s = chr(65 + m) + s
        n = (n - 1) // 26
    return s


def _letter_idx(s):
    n = 0
    for ch in s:
        n = n * 26 + (ord(ch) - 64)
    return n - 1


def axis_kind(a, b):
    """yatay ağırlıklı aks → 'letter', düşey ağırlıklı → 'number'"""
    return "letter" if abs(b[0] - a[0]) >= abs(b[1] - a[1]) else "number"


def next_name(names, kind):
    names = [str(n or "") for n in names]
    if kind == "letter":
        used = [_letter_idx(n) for n in names if re.fullmatch(r"[A-Z]+", n)]
        return letter_of(max(used) + 1 if used else 0)
    used = [int(n) for n in names if re.fullmatch(r"\d+", n)]
    return str(max(used) + 1 if used else 1)


_TOK = re.compile(r"^(?:(\d+)\s*[x×*]\s*)?(\d+(?:\.\d+)?)$", re.I)


def parse_spacing(text):
    """Aralık listesi → [float]; boş → []; geçersiz → None."""
    out = []
    for tok in [t for t in re.split(r"[\s;]+", str(text or "").strip()) if t]:
        m = _TOK.match(tok.replace(",", "."))
        if not m:
            return None
        n, v = int(m.group(1) or 1), float(m.group(2))
        if not v > 0 or n < 1 or n > 200:
            return None
        out.extend([v] * n)
    return out


def grid_array(xs, ys, x0=0.0, y0=0.0, over=150.0, existing=()):
    """Aralık listelerinden akslar: [{'a': (x, y), 'b': (x, y), 'name': str, 'kind': 'number'|'letter'}].

    xs: düşey aksların ardışık aralıkları (soldan sağa), ys: yatay aksların aralıkları. (x0, y0) ilk kesişim.
    Akslar en dış akslardan `over` kadar taşar. Adlar `existing` (mevcut ad listesi) üzerinden devam eder.
    """
    X, Y = [x0], [y0]
    for d in xs:
        X.append(X[-1] + d)
    for d in ys:
        Y.append(Y[-1] + d)
    xmin, xmax, ymin, ymax = min(X) - over, max(X) + over, min(Y) - over, max(Y) + over
    names, out = list(existing), []

    def add(a, b, kind):
        g = {"a": a, "b": b, "name": next_name(names, kind), "kind": kind}
        names.append(g["name"])
        out.append(g)

    if xs or not ys:
        for x in X:
            add((round(x, 2), round(ymin, 2)), (round(x, 2), round(ymax, 2)), "number")
    if ys or not xs:
        for y in Y:
            add((round(xmin, 2), round(y, 2)), (round(xmax, 2), round(y, 2)), "letter")
    return out


def seg_x(a, b, c, d):
    r = (b[0] - a[0], b[1] - a[1])
    s = (d[0] - c[0], d[1] - c[1])
    den = r[0] * s[1] - r[1] * s[0]
    if abs(den) < 1e-9:
        return None
    qp = (c[0] - a[0], c[1] - a[1])
    t = (qp[0] * s[1] - qp[1] * s[0]) / den
    u = (qp[0] * r[1] - qp[1] * r[0]) / den
    if t < -1e-6 or t > 1 + 1e-6 or u < -1e-6 or u > 1 + 1e-6:
        return None
    return (round(a[0] + r[0] * t, 2), round(a[1] + r[1] * t, 2))


def intersections(grids):
    out = []
    for i in range(len(grids)):
        for j in range(i + 1, len(grids)):
            p = seg_x(grids[i]["a"], grids[i]["b"], grids[j]["a"], grids[j]["b"])
            if p:
                out.append({"p": p, "names": (grids[i]["name"], grids[j]["name"])})
    return out


def length(g):
    return math.hypot(g["b"][0] - g["a"][0], g["b"][1] - g["a"][1])
