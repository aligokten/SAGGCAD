"""Donatı çekirdeği — elle (analitik) hesaplanmış beklenen değerler (web sürümündeki tests/donati.test.mjs ile aynı)."""
import math

import pytest

from saggcad.core import rebar as R

RULES = R.DEFAULT_RULES


def bars(t):
    return [(b["d"], b["n"], b["len"]) for b in t["bars"]]


def test_birim_agirlik():
    assert R.kg_per_m(8) == pytest.approx(0.3946, abs=1e-4)
    assert R.kg_per_m(12) == pytest.approx(0.8878, abs=1e-4)
    assert R.kg_per_m(16) == pytest.approx(1.5783, abs=1e-4)
    assert R.bar_area(14) == pytest.approx(1.5394, abs=1e-4)


def test_kolon_minimum_30x50():
    g = {"b": 30, "h": 50, "H": 280}
    assert R.min_spec("kolon", g, RULES) == {"mode": "min", "n": 10, "d": 14, "sd": 8, "sc": 10, "s": 15, "lc": 50}
    t = R.takeoff({"kind": "kolon", "geom": g, "rb": {"mode": "min"}}, RULES)
    assert bars(t) == [(14, 10, 336.0), (8, 23, 152.0)]
    assert t["kg"] == pytest.approx(10 * 3.36 * R.kg_per_m(14) + 23 * 1.52 * R.kg_per_m(8))
    assert t["kg"] == pytest.approx(54.397, abs=1e-3)
    assert t["concrete"] == pytest.approx(0.42)
    assert t["warnings"] == []


def test_kiris_minimum_25x50x500():
    g = {"L": 500, "b": 25, "h": 50}
    s = R.min_spec("kiris", g, RULES)
    assert s["rhoMin"] == pytest.approx(0.8 * (0.35 * 5 / 1.5) / (420 / 1.15), abs=1e-5)
    assert (s["nt"], s["dt"], s["nb"], s["db"]) == (2, 12, 3, 12)
    assert bars(R.takeoff({"kind": "kiris", "geom": g, "rb": {"mode": "min"}}, RULES)) == [(12, 2, 528.8), (12, 3, 528.8), (8, 31, 142.0)]


def test_doseme_minimum_ve_tarama():
    g = {"pts": [(0, 0), (500, 0), (500, 400), (0, 400)], "t": 15}
    assert R.min_spec("slab", g, RULES)["sx"] == 19
    t = R.takeoff({"kind": "slab", "geom": g, "rb": {"mode": "min"}}, RULES)
    assert bars(t) == [(8, 21, 515.2), (8, 27, 415.2)]
    assert any("mesnet üst donatısı" in w for w in t["warnings"])
    L = [(0, 0), (600, 0), (600, 300), (300, 300), (300, 600), (0, 600)]
    segs = R.scan_bars(L, "x", 20, 2)
    assert sum(segs) == pytest.approx(596 * 15 + 296 * 15)


def test_perde_minimum_ve_aciklik_uyarisi():
    g = {"L": 400, "t": 25, "H": 280, "openings": 1}
    assert R.min_spec("wall", g, RULES) == {"mode": "min", "dv": 10, "sv": 25, "dh": 10, "sh": 25}
    t = R.takeoff({"kind": "wall", "geom": g, "rb": {"mode": "min"}}, RULES)
    assert bars(t) == [(10, 32, 320.0), (10, 24, 419.0)]
    assert any("açıklık düşülmedi" in w for w in t["warnings"])


def test_elle_kesin_uyarilar_eksik_alan():
    g = {"b": 40, "h": 40, "H": 300}
    ok = R.takeoff({"kind": "kolon", "geom": g, "rb": {"mode": "manual", "n": 8, "d": 16, "sd": 10, "sc": 10, "s": 20, "lc": 60}}, RULES)
    assert ok["warnings"] == [] and ok["bars"][0]["len"] == 364
    low = R.takeoff({"kind": "kolon", "geom": g, "rb": {"mode": "manual", "n": 4, "d": 12, "sd": 6, "sc": 20, "s": 30}}, RULES)
    for k in ("oranı", "Ø12", "Ø6", "sarılma", "orta"):
        assert any(k in w for w in low["warnings"]), (k, low["warnings"])
    bad = R.takeoff({"kind": "kolon", "geom": g, "rb": {"mode": "manual", "n": 8}}, RULES)
    assert bad["kg"] == 0 and bad["invalid"]
    none = R.takeoff({"kind": "kolon", "geom": g}, RULES)
    assert none["mode"] == "none" and none["kg"] == 0


def test_12m_ustu_ek():
    t = R.takeoff({"kind": "kiris", "geom": {"L": 1500, "b": 30, "h": 60},
                   "rb": {"mode": "manual", "nt": 2, "dt": 16, "nb": 2, "db": 16, "sd": 8, "sc": 10, "s": 20}}, RULES)
    assert t["bars"][0]["len"] == pytest.approx(1500 + 2 * 12 * 1.6 + 40 * 1.6)
    assert any("1 ek" in w for w in t["warnings"])


def test_rapor_kesin_tahmini_ayri_ve_kurallar():
    els = [
        {"key": "k1", "obj": "k1", "kind": "kolon", "name": "S1", "level": "Zemin", "geom": {"b": 30, "h": 50, "H": 280}, "rb": {"mode": "min"}},
        {"key": "k2", "obj": "k2", "kind": "kolon", "name": "S2", "level": "Zemin", "geom": {"b": 30, "h": 50, "H": 280},
         "rb": {"mode": "manual", "n": 8, "d": 16, "sd": 10, "sc": 10, "s": 15, "lc": 50}},
        {"key": "b1", "obj": "b1", "kind": "kiris", "name": "K1", "level": "Zemin", "geom": {"L": 500, "b": 25, "h": 50}, "rb": {"mode": "none"}},
    ]
    rep = R.report(els)
    T = rep["totals"]
    assert T["min"] == pytest.approx(10 * 3.36 * R.kg_per_m(14) + 23 * 1.52 * R.kg_per_m(8))
    assert T["manual"] > 0 and T["undefined"] == 1
    assert T["total"] == pytest.approx(sum(x["kg"] for x in rep["by_diameter"]))
    d14 = next(x for x in rep["by_diameter"] if x["d"] == 14)
    assert d14["kgManual"] == 0 and d14["kgMin"] == pytest.approx(10 * 3.36 * R.kg_per_m(14))
    rep2 = R.report(els, {"lap": 50, "cover": {"col": 4}})
    assert rep2["rules"]["cover"]["beam"] == 3.0
    assert rep2["rows"][0]["bars"][0]["len"] == 280 + 50 * 1.4
    csv = R.to_csv(rep, "deneme")
    assert csv.startswith("﻿") and "Yönetmelik minimumu (yaklaşık)" in csv and "Statik projeden (elle)" in csv and ";3,36;" in csv


def test_kurallar_varsayilan_degismez():
    R.rules_of({"cover": {"col": 9}})
    assert R.DEFAULT_RULES["cover"]["col"] == 3.0
