"""Betonarme donatı hesabı ve metrajı — saf Python (FreeCAD gerektirmez).

Kaynaklar hiçbir zaman karıştırılmaz:
    manual  "Statik projeden" — kullanıcının girdiği donatı. Metraj kesindir (girdi kadar).
    min     "Yönetmelik minimumu (yaklaşık)" — TS 500 / TBDY 2018'in en az koşullarından türetilen ÖN TAHMİN.
            Statik hesabın yerini tutmaz; raporda ayrı sütunda, "tahmini" etiketiyle. Katsayılar kurallardan değişir.
    none    tanımsız: metraja girmez (varsayım üretilmez).

Birimler: geometri cm, çap mm, boy cm (çıktıda m), ağırlık kg. Çelik 7850 kg/m³.
Eleman: {'key', 'kind': 'kolon'|'kiris'|'slab'|'wall', 'name', 'level', 'geom': {...}, 'rb': {'mode': …, alanlar}}
    kolon geom {b, h, H, round}   kiris {L, b, h}   slab {pts: [(x, y)…], t}   wall {L, t, H, openings}
Web sürümündeki (js/bim/rebar.js, arsiv/web dalı) hesapla birebir aynıdır; testler aynı elle hesaplanmış değerleri kullanır.
"""
import copy
import math

DIAMETERS = [8, 10, 12, 14, 16, 18, 20, 22, 25, 28, 32]
STEEL_DENSITY = 7850.0
FCK = {"C20": 20, "C25": 25, "C30": 30, "C35": 35, "C40": 40, "C45": 45, "C50": 50}
FYK = {"B420C": 420, "B500C": 500}
MODES = {"none": "Tanımsız", "min": "Yönetmelik minimumu (yaklaşık)", "manual": "Statik projeden (elle)"}
KIND_T = {"kolon": "Kolon", "kiris": "Kiriş", "slab": "Döşeme", "wall": "Perde / betonarme duvar"}


def kg_per_m(d):
    """kg/m: ρ·π·Ø²/4 (Ø8 → 0,395; Ø10 → 0,617; Ø12 → 0,888; Ø16 → 1,578)"""
    return STEEL_DENSITY * math.pi * (d / 1000.0) ** 2 / 4


def bar_area(d):
    """cm²"""
    return math.pi * (d / 10.0) ** 2 / 4


DEFAULT_RULES = {
    "concrete": "C25", "steel": "B420C",
    "cover": {"col": 3.0, "beam": 3.0, "slab": 2.0, "wall": 2.5},   # paspayı, cm
    "lap": 40.0,        # bindirme ×Ø (kolonda üst kata filiz; ticari boyu aşan çubukta ek)
    "endHook": 12.0,    # boyuna uç bükümü ×Ø (her uç)
    "stirHook": 10.0,   # etriye 135° kanca ×Ø (her kanca)
    "stock": 1200.0,    # ticari çubuk boyu, cm
    "min": {
        "colRho": 0.01, "colRhoMax": 0.04, "colMinD": 14, "colMinN": 4, "colMinNRound": 6, "stirMinD": 8,
        "colConfMax": 15.0, "colMidMax": 20.0,
        "beamMinD": 12, "beamMinN": 2, "beamConfMax": 15.0,
        "slabRhoTotal": 0.0035, "slabMinD": 8, "slabSmax": 25.0,
        "wallRho": 0.0025, "wallMinD": 10, "wallSmax": 25.0,
    },
}

FIELDS = {
    "kolon": ["n", "d", "sd", "sc", "s", "lc"],
    "kiris": ["nt", "dt", "nb", "db", "sd", "sc", "s", "lc"],
    "slab": ["dx", "sx", "dy", "sy"],
    "wall": ["dv", "sv", "dh", "sh"],
}


def rules_of(over=None):
    """varsayılan kurallar + proje kuralları (iç içe 'cover' ve 'min' birleştirilir)"""
    r = copy.deepcopy(DEFAULT_RULES)
    over = over or {}
    for k, v in over.items():
        if k in ("cover", "min") and isinstance(v, dict):
            r[k].update(v)
        elif v is not None:
            r[k] = v
    return r


def _fl(v, step=1.0):
    return math.floor(v / step + 1e-9) * step


def _ceil(v):
    return math.ceil(v - 1e-9)


def poly_area(pts):
    s = 0.0
    for i, a in enumerate(pts):
        b = pts[(i + 1) % len(pts)]
        s += a[0] * b[1] - b[0] * a[1]
    return s / 2


# ── yönetmelik minimumu (ön tahmin) ──
def min_spec(kind, g, rules=DEFAULT_RULES):
    M, cv = rules["min"], rules["cover"]
    if kind == "kolon":
        ac = math.pi * g["b"] ** 2 / 4 if g.get("round") else g["b"] * g["h"]
        As, n_min = M["colRho"] * ac, (M["colMinNRound"] if g.get("round") else M["colMinN"])
        d, n = M["colMinD"], n_min
        for dd in [x for x in DIAMETERS if x >= M["colMinD"]]:
            d = dd
            n = max(n_min, _ceil(As / bar_area(dd)))
            if not g.get("round") and n % 2:
                n += 1
            if n <= (16 if g.get("round") else 12):
                break
        bmin = min(g["b"], g["h"])
        sd = max(M["stirMinD"], next((x for x in DIAMETERS if x >= d / 3), 8))
        sc = max(5, _fl(min(bmin / 3, M["colConfMax"])))
        s = max(sc, _fl(min(bmin / 2, M["colMidMax"])))
        lc = math.ceil(max(g["b"], g["h"], (g.get("H") or 0) / 6, 50))
        return {"mode": "min", "n": n, "d": d, "sd": sd, "sc": sc, "s": s, "lc": lc}
    if kind == "kiris":
        fck, fyk = FCK.get(rules["concrete"], 25), FYK.get(rules["steel"], 420)
        fctd, fyd = 0.35 * math.sqrt(fck) / 1.5, fyk / 1.15
        rho = 0.8 * fctd / fyd
        deff = g["h"] - cv["beam"] - 1
        As, d = rho * g["b"] * deff, M["beamMinD"]
        nb = max(M["beamMinN"], _ceil(As / bar_area(d)))
        sc = max(5, _fl(min(g["h"] / 4, M["beamConfMax"])))
        s = max(sc, _fl(deff / 2))
        return {"mode": "min", "nt": M["beamMinN"], "dt": d, "nb": nb, "db": d, "sd": M["stirMinD"], "sc": sc, "s": s,
                "lc": math.ceil(2 * g["h"]), "rhoMin": round(rho, 5)}
    if kind == "slab":
        d, As = M["slabMinD"], M["slabRhoTotal"] / 2 * g["t"] * 100
        s = max(5, _fl(min(bar_area(d) * 100 / As, 1.5 * g["t"], M["slabSmax"]), 0.5))
        return {"mode": "min", "dx": d, "sx": s, "dy": d, "sy": s, "top": False}
    if kind == "wall":
        d, As = M["wallMinD"], M["wallRho"] * g["t"] * 100 / 2
        s = max(5, _fl(min(bar_area(d) * 100 / As, M["wallSmax"]), 0.5))
        return {"mode": "min", "dv": d, "sv": s, "dh": d, "sh": s}
    return None


def spec_of(el, rules):
    """none → None; min → min_spec; manual → kayıtlı değerler (eksik alan = hata, varsayım yok)"""
    rb = el.get("rb") or {}
    mode = rb.get("mode") or "none"
    if mode == "min":
        return min_spec(el["kind"], el["geom"], rules)
    if mode == "manual":
        missing = [k for k in FIELDS[el["kind"]] if k != "lc" and not (float(rb.get(k) or 0) > 0)]
        if missing:
            return {"mode": mode, "invalid": missing}
        out = dict(rb)
        out["mode"] = mode
        return out
    return None


def _with_laps(length, d, R):
    n = _ceil(length / R["stock"]) - 1 if length > R["stock"] else 0
    return length + n * R["lap"] * d / 10, n


def _stirrup_count(length, lc, sc, s):
    if not length > 0:
        return 0
    if 2 * lc >= length:
        return int(_fl(length / sc)) + 1
    nc = int(_fl(lc / sc)) + 1
    mid = length - 2 * lc
    return 2 * nc + max(0, _ceil(mid / s) - 1)


def scan_bars(pts, direction, s, cover):
    """Çokgeni yatay ('x') ya da düşey ('y') çizgilerle tara: her çubuğun kesişim parçalarının boyları (cm)."""
    P = list(pts) if direction == "x" else [(p[1], p[0]) for p in pts]
    ys = [p[1] for p in P]
    y0, y1 = min(ys) + cover, max(ys) - cover
    bars = []
    if y1 < y0:
        return bars
    n = int(_fl((y1 - y0) / s)) + 1
    step = (y1 - y0) / (n - 1) if n > 1 else 0
    for i in range(n):
        y = y0 + i * step if n > 1 else (y0 + y1) / 2
        xs = []
        for j in range(len(P)):
            a, b = P[j], P[(j + 1) % len(P)]
            if (a[1] <= y < b[1]) or (b[1] <= y < a[1]):
                xs.append(a[0] + (y - a[1]) / (b[1] - a[1]) * (b[0] - a[0]))
        xs.sort()
        for k in range(0, len(xs) - 1, 2):
            L = xs[k + 1] - xs[k] - 2 * cover
            if L > 0:
                bars.append(L)
    return bars


def concrete_volume(kind, g):
    """m³"""
    if kind == "kolon":
        return (math.pi * g["b"] ** 2 / 4 if g.get("round") else g["b"] * g["h"]) * g["H"] / 1e6
    if kind == "kiris":
        return g["b"] * g["h"] * g["L"] / 1e6
    if kind == "slab":
        return abs(poly_area(g["pts"])) * g["t"] / 1e6
    if kind == "wall":
        return g["L"] * g["t"] * g["H"] / 1e6
    return 0.0


def takeoff(el, rules=DEFAULT_RULES):
    """tek eleman → {spec, mode, bars: [{role, d, n, len (cm, her biri), m, kg}], concrete, kg, ratio, warnings, invalid}"""
    R, g = rules, el["geom"]
    spec, warnings, bars = spec_of(el, R), [], []

    def add(role, d, n, ln):
        if n > 0 and ln > 0:
            bars.append({"role": role, "d": int(d), "n": int(n), "len": round(ln, 1), "m": n * ln / 100, "kg": n * ln / 100 * kg_per_m(d)})

    concrete = concrete_volume(el["kind"], g)
    if el["kind"] == "wall" and g.get("openings"):
        warnings.append(f"{g['openings']} açıklık düşülmedi (beton ve donatı brüt)")
    if not spec:
        return {"spec": None, "mode": "none", "bars": bars, "concrete": concrete, "kg": 0.0, "ratio": 0.0, "warnings": warnings, "invalid": False}
    if spec.get("invalid"):
        return {"spec": spec, "mode": spec["mode"], "bars": bars, "concrete": concrete, "kg": 0.0, "ratio": 0.0,
                "warnings": [f"eksik alan: {', '.join(spec['invalid'])} — metraja girmedi"], "invalid": True}
    M, kind = R["min"], el["kind"]
    sp = dict(spec)   # sayısal alanlar float (FreeCAD özellikleri int / float / Quantity gelebilir)
    for k in FIELDS[kind] + ["lc"]:
        if sp.get(k) is not None:
            sp[k] = float(sp[k])

    if kind == "kolon":
        c = R["cover"]["col"]
        ln, laps = _with_laps(g["H"] + R["lap"] * sp["d"] / 10, sp["d"], R)
        add("Boyuna (üst kata filiz dahil)", sp["d"], sp["n"], ln)
        per = math.pi * (g["b"] - 2 * c) if g.get("round") else 2 * (g["b"] - 2 * c) + 2 * (g["h"] - 2 * c)
        lc = sp.get("lc") if (sp.get("lc") or 0) > 0 else max(g["b"], g["h"], g["H"] / 6, 50)
        add("Fret / çember etriye" if g.get("round") else "Etriye", sp["sd"], _stirrup_count(g["H"], lc, sp["sc"], sp["s"]),
            per + 2 * R["stirHook"] * sp["sd"] / 10)
        ac = math.pi * g["b"] ** 2 / 4 if g.get("round") else g["b"] * g["h"]
        rho = sp["n"] * bar_area(sp["d"]) / ac
        if sp["mode"] == "manual":
            bmin = min(g["b"], g["h"])
            if rho < M["colRho"] - 1e-9:
                warnings.append(f"boyuna donatı oranı %{rho * 100:.2f} < %{M['colRho'] * 100:g} (minimum)")
            if rho > M["colRhoMax"]:
                warnings.append(f"boyuna donatı oranı %{rho * 100:.2f} > %{M['colRhoMax'] * 100:g} (maksimum)")
            if sp["d"] < M["colMinD"]:
                warnings.append(f"boyuna çap Ø{sp['d']:g} < Ø{M['colMinD']}")
            nmin = M["colMinNRound"] if g.get("round") else M["colMinN"]
            if sp["n"] < nmin:
                warnings.append(f"boyuna çubuk sayısı {sp['n']:g} < {nmin}")
            if sp["sd"] < M["stirMinD"]:
                warnings.append(f"etriye Ø{sp['sd']:g} < Ø{M['stirMinD']}")
            if sp["sc"] > min(bmin / 3, M["colConfMax"]) + 1e-9:
                warnings.append(f"sarılma bölgesi aralığı {sp['sc']:g} cm > {_fl(min(bmin / 3, M['colConfMax']), 0.1):g} cm")
            if sp["s"] > min(bmin / 2, M["colMidMax"]) + 1e-9:
                warnings.append(f"orta bölge aralığı {sp['s']:g} cm > {_fl(min(bmin / 2, M['colMidMax']), 0.1):g} cm")
        if laps:
            warnings.append(f"boyuna çubukta {laps} ek (> {R['stock'] / 100:g} m)")

    elif kind == "kiris":
        c = R["cover"]["beam"]
        for role, n, d in (("Üst boyuna", sp["nt"], sp["dt"]), ("Alt boyuna", sp["nb"], sp["db"])):
            ln, laps = _with_laps(g["L"] + 2 * R["endHook"] * d / 10, d, R)
            add(role, d, n, ln)
            if laps:
                warnings.append(f"{role.lower()} çubukta {laps} ek")
        lc = sp.get("lc") if (sp.get("lc") or 0) > 0 else 2 * g["h"]
        add("Etriye", sp["sd"], _stirrup_count(g["L"], lc, sp["sc"], sp["s"]),
            2 * (g["b"] - 2 * c) + 2 * (g["h"] - 2 * c) + 2 * R["stirHook"] * sp["sd"] / 10)
        if sp["mode"] == "manual":
            if sp["nb"] < M["beamMinN"] or sp["db"] < M["beamMinD"]:
                warnings.append(f"alt donatı {sp['nb']:g}Ø{sp['db']:g} < {M['beamMinN']}Ø{M['beamMinD']}")
            if sp["nt"] < M["beamMinN"] or sp["dt"] < M["beamMinD"]:
                warnings.append(f"üst donatı {sp['nt']:g}Ø{sp['dt']:g} < {M['beamMinN']}Ø{M['beamMinD']}")
            mn = min_spec("kiris", g, R)
            if sp["nb"] * bar_area(sp["db"]) < mn["nb"] * bar_area(mn["db"]) - 1e-9:
                warnings.append(f"alt donatı alanı minimum oranın (%{mn['rhoMin'] * 100:.3f}) altında")
            if sp["sd"] < M["stirMinD"]:
                warnings.append(f"etriye Ø{sp['sd']:g} < Ø{M['stirMinD']}")

    elif kind == "slab":
        c, layers = R["cover"]["slab"], (2 if sp.get("top") else 1)
        for direction, d, s in (("x", sp["dx"], sp["sx"]), ("y", sp["dy"], sp["sy"])):
            segs = scan_bars(g["pts"], direction, s, c)
            tot = sum(_with_laps(L + 2 * R["endHook"] * d / 10, d, R)[0] for L in segs)
            if segs:
                bars.append({"role": f"{direction.upper()} doğrultusu{' (alt + üst)' if layers > 1 else ' (alt)'}", "d": int(d),
                             "n": len(segs) * layers, "len": round(tot / len(segs), 1), "m": tot * layers / 100,
                             "kg": tot * layers / 100 * kg_per_m(d)})
        if sp["mode"] == "manual":
            smax = min(1.5 * g["t"], M["slabSmax"])
            rho = (bar_area(sp["dx"]) / sp["sx"] + bar_area(sp["dy"]) / sp["sy"]) / g["t"]
            if sp["sx"] > smax + 1e-9 or sp["sy"] > smax + 1e-9:
                warnings.append(f"aralık > {_fl(smax, 0.1):g} cm")
            if rho < M["slabRhoTotal"] - 1e-9:
                warnings.append(f"iki doğrultu toplam oran %{rho * 100:.3f} < %{M['slabRhoTotal'] * 100:.2f}")
        if sp["mode"] == "min":
            warnings.append("yalnız alt hasır (iki doğrultuda çalışan döşeme minimumu); mesnet üst donatısı statik hesaba bağlı")

    elif kind == "wall":
        c = R["cover"]["wall"]
        vlen, _ = _with_laps(g["H"] + R["lap"] * sp["dv"] / 10, sp["dv"], R)
        nv = int(_fl((g["L"] - 2 * c) / sp["sv"])) + 1
        nh = int(_fl((g["H"] - 2 * c) / sp["sh"])) + 1
        add("Düşey (iki yüz, filiz dahil)", sp["dv"], 2 * nv, vlen)
        hlen, _ = _with_laps(g["L"] - 2 * c + 2 * R["endHook"] * sp["dh"] / 10, sp["dh"], R)
        add("Yatay (iki yüz)", sp["dh"], 2 * nh, hlen)
        if sp["mode"] == "manual":
            rv = 2 * bar_area(sp["dv"]) / sp["sv"] / g["t"]
            rh = 2 * bar_area(sp["dh"]) / sp["sh"] / g["t"]
            if rv < M["wallRho"] - 1e-9 or rh < M["wallRho"] - 1e-9:
                warnings.append(f"gövde oranı (düşey %{rv * 100:.3f}, yatay %{rh * 100:.3f}) < %{M['wallRho'] * 100:.2f}")
            if sp["sv"] > M["wallSmax"] or sp["sh"] > M["wallSmax"]:
                warnings.append(f"aralık > {M['wallSmax']:g} cm")

    kg = sum(b["kg"] for b in bars)
    return {"spec": spec, "mode": spec["mode"], "bars": bars, "concrete": concrete, "kg": kg,
            "ratio": kg / concrete if concrete > 0 else 0.0, "warnings": warnings, "invalid": False}


def report(elements, rules_over=None):
    """eleman listesi → {rules, rows, by_diameter, totals}; kesin (manual) ve tahmini (min) ayrı toplanır"""
    rules = rules_of(rules_over)
    rows = []
    for el in elements:
        r = dict(el)
        r.update(takeoff(el, rules))
        rows.append(r)
    by_d = {}
    T = {"manual": 0.0, "min": 0.0, "concrete": 0.0, "concreteDefined": 0.0, "undefined": 0, "invalid": 0, "count": len(rows)}
    for r in rows:
        T["concrete"] += r["concrete"]
        if r["mode"] == "none":
            T["undefined"] += 1
            continue
        if r["invalid"]:
            T["invalid"] += 1
            continue
        T["concreteDefined"] += r["concrete"]
        T[r["mode"]] += r["kg"]
        for b in r["bars"]:
            x = by_d.setdefault(b["d"], {"d": b["d"], "kgPerM": kg_per_m(b["d"]), "m": 0.0, "kg": 0.0, "mManual": 0.0, "kgManual": 0.0, "mMin": 0.0, "kgMin": 0.0})
            x["m"] += b["m"]
            x["kg"] += b["kg"]
            if r["mode"] == "manual":
                x["mManual"] += b["m"]
                x["kgManual"] += b["kg"]
            else:
                x["mMin"] += b["m"]
                x["kgMin"] += b["kg"]
    T["total"] = T["manual"] + T["min"]
    T["ratio"] = T["total"] / T["concreteDefined"] if T["concreteDefined"] > 0 else 0.0
    return {"rules": rules, "rows": rows, "by_diameter": [by_d[k] for k in sorted(by_d)], "totals": T}


def to_csv(rep, title=""):
    """Excel TR: UTF-8 BOM, ';', ondalık virgül"""
    def n(v, k=2):
        return f"{float(v):.{k}f}".replace(".", ",")

    def q(s):
        s = "" if s is None else str(s)
        return '"' + s.replace('"', '""') + '"' if any(ch in s for ch in ';"\n') else s

    out = [[title], ["Kat", "Eleman", "Tür", "Kaynak", "Rol", "Çap (mm)", "Adet", "Boy (m, her biri)", "Toplam boy (m)", "Ağırlık (kg)", "Beton (m³)", "Not"]]
    for r in rep["rows"]:
        if not r["bars"]:
            out.append([r.get("level", ""), r["name"], KIND_T[r["kind"]], MODES[r["mode"]], "", "", "", "", "", "", n(r["concrete"], 3), "; ".join(r["warnings"])])
            continue
        for i, b in enumerate(r["bars"]):
            out.append([r.get("level", ""), r["name"], KIND_T[r["kind"]], MODES[r["mode"]], b["role"], b["d"], b["n"], n(b["len"] / 100), n(b["m"]), n(b["kg"]),
                        "" if i else n(r["concrete"], 3), "" if i else "; ".join(r["warnings"])])
    out.append([])
    out.append(["ÇAP TOPLAMI", "Çap (mm)", "kg/m", "Toplam boy (m)", "Toplam (kg)", "Statik projeden (kg)", "Minimum tahmini (kg)"])
    for x in rep["by_diameter"]:
        out.append(["", x["d"], n(x["kgPerM"], 3), n(x["m"]), n(x["kg"]), n(x["kgManual"]), n(x["kgMin"])])
    T = rep["totals"]
    out.append([])
    out.append(["GENEL TOPLAM (kg)", n(T["total"]), "Statik projeden", n(T["manual"]), "Minimum tahmini", n(T["min"]), "Tanımsız eleman", T["undefined"]])
    return "﻿" + "\r\n".join(";".join(q(c) for c in row) for row in out)
