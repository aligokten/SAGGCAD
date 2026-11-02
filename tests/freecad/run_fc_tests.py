"""SAGGCAD — FreeCAD bütünleşik testi (gerçek BIM / Arch nesneleri, arayüzsüz).

    freecadcmd tests/freecad/run_fc_tests.py      (çalışma dizini: depo kökü)

Sonuçlar SAGGCAD_FC_OUT (varsayılan: fc-results.json) dosyasına yazılır; CI bu dosyayı denetler. FreeCADCmd betik
hatasında çıkış kodunu her zaman iletmediği için başarı yalnız dosyadaki "ok": true ile kabul edilir.
"""
import json
import os
import sys
import traceback

sys.path.insert(0, os.getcwd())
OUT = os.environ.get("SAGGCAD_FC_OUT", "fc-results.json")
results, ok = [], True


def check(cond, msg, detail=None):
    global ok
    ok = ok and bool(cond)
    results.append({"ok": bool(cond), "msg": msg, "detail": detail})
    print(("✓ " if cond else "✗ ") + msg + (f" — {detail}" if detail is not None and not cond else ""))


def approx(a, b, tol=1e-6):
    return abs(a - b) <= tol


try:
    import FreeCAD as App
    import Arch
    import Draft

    from saggcad.core import rebar as core
    from saggcad.fc import rebar_fc as RF
    from saggcad.fc.axes import make_axis_system

    check(True, f"FreeCAD {'.'.join(App.Version()[:3])} + Arch / Draft yüklendi")
    doc = App.newDocument("SaggcadTest")
    beton = Arch.makeMaterial("Betonarme C25")
    celik = Arch.makeMaterial("Çelik S235")

    # ── kolon 300×500×2800 mm (= 30×50×280 cm) ──
    col = Arch.makeStructure(length=300, width=500, height=2800)
    col.IfcType = "Column"
    col.Material = beton
    beam = Arch.makeStructure(length=5000, width=250, height=500)
    beam.IfcType = "Beam"
    rect = Draft.makeRectangle(5000, 4000)
    slab = Arch.makeStructure(rect, height=150)
    slab.IfcType = "Slab"
    wall = Arch.makeWall(None, length=4000, width=250, height=2800)
    wall.Material = beton
    brick = Arch.makeWall(None, length=3000, width=200, height=2800)
    steel = Arch.makeStructure(length=200, width=200, height=2800)
    steel.IfcType = "Column"
    steel.Material = celik
    doc.recompute()

    check(RF.kind_of(col) == "kolon" and RF.kind_of(beam) == "kiris" and RF.kind_of(slab) == "slab" and RF.kind_of(wall) == "wall",
          "betonarme tanıma: Column / Beam / Slab ve beton malzemeli duvar",
          [RF.kind_of(x) for x in (col, beam, slab, wall)])
    check(RF.kind_of(brick) is None and RF.kind_of(steel) is None, "malzemesiz duvar ve çelik kolon betonarme sayılmadı",
          [RF.kind_of(brick), RF.kind_of(steel)])

    g = RF.geom_of(col, "kolon")
    check(approx(g["b"], 30) and approx(g["h"], 50) and approx(g["H"], 280), "kolon geometrisi mm → cm (30×50, H 280)", g)
    gb = RF.geom_of(beam, "kiris")
    check(approx(gb["L"], 500) and approx(gb["b"], 25) and approx(gb["h"], 50), "kiriş geometrisi (L 500, 25×50)", gb)
    gs = RF.geom_of(slab, "slab")
    xs = sorted({round(p[0], 3) for p in gs["pts"]})
    ys = sorted({round(p[1], 3) for p in gs["pts"]})
    check(len(gs["pts"]) == 4 and xs == [0, 500] and ys == [0, 400] and approx(gs["t"], 15), "döşeme çokgeni ve kalınlığı (500×400, t 15)", gs)
    gw = RF.geom_of(wall, "wall")
    check(approx(gw["L"], 400) and approx(gw["t"], 25) and approx(gw["H"], 280) and gw["openings"] == 0, "perde geometrisi (400×25, H 280)", gw)

    # ── tanımsız: metraja girmez, özellik yokken varsayım yok ──
    rep0 = RF.report(doc)
    check(rep0["totals"]["total"] == 0 and rep0["totals"]["undefined"] == 4, "başlangıçta 4 betonarme eleman tanımsız, metraj 0", rep0["totals"])

    # ── yönetmelik minimumu: çekirdekle (elle doğrulanmış değerler) aynı ──
    for o in (col, beam, slab, wall):
        RF.set_mode(o, "min")
    doc.recompute()
    check(col.DonatiKaynak == "Yönetmelik minimumu (yaklaşık)" and "BoyunaAdet" in col.PropertiesList, "özellik grubu 'SAGGCAD Donatı' eklendi, kaynak minimum")
    rep = RF.report(doc)
    rows = {r["obj"]: r for r in rep["rows"]}
    bars = lambda r: [(b["d"], b["n"], b["len"]) for b in r["bars"]]
    check(bars(rows[col.Name]) == [(14, 10, 336.0), (8, 23, 152.0)] and approx(rows[col.Name]["kg"], 54.397, 1e-3), "kolon minimumu: 10Ø14 + 23 etriye Ø8 = 54,397 kg", bars(rows[col.Name]))
    check(bars(rows[beam.Name]) == [(12, 2, 528.8), (12, 3, 528.8), (8, 31, 142.0)], "kiriş minimumu: üst 2Ø12, alt 3Ø12, 31 etriye", bars(rows[beam.Name]))
    check(bars(rows[slab.Name]) == [(8, 21, 515.2), (8, 27, 415.2)], "döşeme minimumu: Ø8/19, 21 + 27 çubuk", bars(rows[slab.Name]))
    check(bars(rows[wall.Name]) == [(10, 32, 320.0), (10, 24, 419.0)], "perde minimumu: Ø10/25 iki yüz", bars(rows[wall.Name]))
    T = rep["totals"]
    check(approx(T["total"], sum(x["kg"] for x in rep["by_diameter"])) and T["manual"] == 0 and approx(T["min"], T["total"]), "çap toplamları = genel toplam; tamamı 'minimum tahmini'", T)

    # ── statik projeden (elle): minimum değerler açıkça yazılır, sonra düzenlenir ──
    RF.set_mode(col, "manual")
    check(col.BoyunaAdet == 10 and col.BoyunaCap == 14 and approx(col.SarilmaAralik.Value, 100) and approx(col.OrtaAralik.Value, 150),
          "elle: minimum değerler özelliklere yazıldı (aralık mm)", [col.BoyunaAdet, col.BoyunaCap, col.SarilmaAralik.Value, col.OrtaAralik.Value])
    col.BoyunaAdet = 12
    col.BoyunaCap = 16
    doc.recompute()
    r = {x["obj"]: x for x in RF.report(doc)["rows"]}[col.Name]
    exp = 12 * 3.44 * core.kg_per_m(16) + 23 * 1.52 * core.kg_per_m(8)
    check(r["mode"] == "manual" and approx(r["kg"], exp, 1e-6), f"elle 12Ø16: {r['kg']:.2f} kg (12 × 3,44 m + etriyeler)", r["kg"])
    col.OrtaAralik = 300
    r = {x["obj"]: x for x in RF.report(doc)["rows"]}[col.Name]
    check(any("orta bölge aralığı 30 cm" in w for w in r["warnings"]) and approx(col.OrtaAralik.Value, 300), "sınırı aşan aralık uyarıldı, değer korundu", r["warnings"])

    # ── proje kuralları belge meta verisinde ──
    RF.set_rules(doc, {"lap": 50})
    r = {x["obj"]: x for x in RF.report(doc)["rows"]}[col.Name]
    check(approx(r["bars"][0]["len"], 280 + 50 * 1.6) and RF.rules_of(doc)["cover"]["beam"] == 3.0, "kural (bindirme 50Ø) belgeye yazıldı ve uygulandı", r["bars"][0])

    # ── toplu minimum: yalnız tanımsızlara ──
    col2 = Arch.makeStructure(length=400, width=400, height=3000)
    col2.IfcType = "Column"
    doc.recompute()
    done = RF.assign_min_to_undefined(doc)
    check([o.Name for o in done] == [col2.Name] and col.DonatiKaynak == "Statik projeden (elle)", "toplu minimum yalnız tanımsız elemana atandı; elle olana dokunulmadı", [o.Name for o in done])

    # ── tablo + CSV ──
    rep = RF.report(doc)
    sh = RF.write_spreadsheet(doc, rep)
    check(sh.TypeId == "Spreadsheet::Sheet" and str(sh.get("A1")) == "Kat", "Spreadsheet 'Donatı metrajı' yazıldı", str(sh.get("A1")))
    csv = RF.to_csv(rep, "test")
    check(csv.startswith("﻿") and "ÇAP TOPLAMI" in csv, "CSV (BOM, çap toplamı)")

    # ── kaydet / aç: özellikler ve kurallar dosyada ──
    path = os.path.join(os.getcwd(), "fc-test.FCStd")
    doc.saveAs(path)
    App.closeDocument(doc.Name)
    doc2 = App.openDocument(path)
    c2 = doc2.getObject(col.Name)
    check(c2.DonatiKaynak == "Statik projeden (elle)" and c2.BoyunaAdet == 12 and RF.rules_of(doc2)["lap"] == 50, "kaydet / aç: donatı özellikleri ve kurallar korundu")
    rep2 = RF.report(doc2)
    check(approx(rep2["totals"]["total"], rep["totals"]["total"], 1e-6), "yeniden açılan belgede metraj aynı", [rep2["totals"]["total"], rep["totals"]["total"]])
    App.closeDocument(doc2.Name)
    os.remove(path)

    # ── aks sistemi (BIM Axis) ──
    doc3 = App.newDocument("Aks")
    system, axes, grids = make_axis_system(doc3, [4000, 5000], [3500], over=1500)
    v, h = axes
    check([g["name"] for g in grids] == ["1", "2", "3", "A", "B"], "aks adları: 1 2 3 / A B", [g["name"] for g in grids])
    check(list(v.Distances) == [0, 4000, 5000] and list(h.Distances) == [0, 3500] and system is not None, "Arch Axis aralıkları ve AxisSystem", [list(v.Distances), list(h.Distances)])
    bv, bh = v.Shape.BoundBox, h.Shape.BoundBox
    check(approx(bv.XMin, 0, 1e-3) and approx(bv.XMax, 9000, 1e-3) and approx(bv.YMin, -1500, 1e-3) and approx(bv.YMax, 5000, 1e-3),
          "düşey akslar dünyada x = 0 / 4000 / 9000, y −1500…5000", [bv.XMin, bv.XMax, bv.YMin, bv.YMax])
    check(approx(bh.YMin, 0, 1e-3) and approx(bh.YMax, 3500, 1e-3) and approx(bh.XMin, -1500, 1e-3) and approx(bh.XMax, 10500, 1e-3),
          "yatay akslar dünyada y = 0 / 3500, x −1500…10500", [bh.XMin, bh.XMax, bh.YMin, bh.YMax])
    _, axes2, grids2 = make_axis_system(doc3, [3000], [], x0=9000, over=1500)
    check([g["name"] for g in grids2] == ["4", "5"], "ikinci aks sistemi adları mevcut akslardan devam (4, 5)", [g["name"] for g in grids2])
except Exception as e:   # beklenmeyen hata: test başarısız
    check(False, "beklenmeyen hata: " + repr(e), traceback.format_exc())

with open(OUT, "w", encoding="utf-8") as f:
    json.dump({"ok": ok, "results": results}, f, ensure_ascii=False, indent=1)
print("SAGGCAD FreeCAD testi:", "TÜMÜ GEÇTİ" if ok else "BAŞARISIZ")
