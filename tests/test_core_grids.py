"""Aks çekirdeği (adlandırma, aralık ayrıştırma, aks sistemi, kesişimler)."""
from saggcad.core import grids as G


def test_adlar():
    assert [G.letter_of(i) for i in (0, 1, 25, 26, 27, 51, 52)] == ["A", "B", "Z", "AA", "AB", "AZ", "BA"]
    assert G.axis_kind((0, 0), (1000, 30)) == "letter"
    assert G.axis_kind((0, 0), (20, 800)) == "number"
    assert G.next_name([], "letter") == "A" and G.next_name([], "number") == "1"
    assert G.next_name(["A", "C", "1", "X1"], "letter") == "D"
    assert G.next_name(["A", "2", "7"], "number") == "8"
    assert G.next_name(["Z"], "letter") == "AA"


def test_aralik_ayristirma():
    assert G.parse_spacing("400 500 400") == [400, 500, 400]
    assert G.parse_spacing("3x350") == [350, 350, 350]
    assert G.parse_spacing("2×300;450,5") == [300, 300, 450.5]
    assert G.parse_spacing("") == []
    assert G.parse_spacing("400 abc") is None
    assert G.parse_spacing("-200") is None
    assert G.parse_spacing("0") is None


def test_aks_sistemi_ve_kesisimler():
    g = G.grid_array([400, 500], [350], x0=100, y0=50, over=150)
    v = [x for x in g if x["kind"] == "number"]
    h = [x for x in g if x["kind"] == "letter"]
    assert [x["name"] for x in v] == ["1", "2", "3"] and [x["name"] for x in h] == ["A", "B"]
    assert [x["a"][0] for x in v] == [100, 500, 1000]
    assert [x["a"][1] for x in h] == [50, 400]
    assert (v[0]["a"][1], v[0]["b"][1]) == (-100, 550)
    assert (h[0]["a"][0], h[0]["b"][0]) == (-50, 1150)
    X = G.intersections(g)
    assert len(X) == 6 and any(p["p"] == (500, 400) and set(p["names"]) == {"2", "B"} for p in X)
    g2 = G.grid_array([300], [], existing=[x["name"] for x in g])
    assert [x["name"] for x in g2] == ["4", "5"]
