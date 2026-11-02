"""Aks sistemi — BIM / Arch Axis nesneleriyle.

Düşey akslar (rakam) bir Arch Axis nesnesinde, yatay akslar (harf) Z ekseni etrafında 90° döndürülmüş ikinci bir Axis
nesnesinde; ikisi bir Arch AxisSystem içinde toplanır. Aralıklar mm. Adlar belgede zaten var olan SAGGCAD akslarından
devam eder (her Axis nesnesinde `SaggcadAdlar` özelliği).
"""
import FreeCAD as App

from ..core.grids import grid_array

GROUP = "SAGGCAD"


def existing_names(doc):
    names = []
    for o in doc.Objects:
        names.extend(list(getattr(o, "SaggcadAdlar", []) or []))
    return names


def _tag(ax, names, kind):
    if "SaggcadAdlar" not in ax.PropertiesList:
        ax.addProperty("App::PropertyStringList", "SaggcadAdlar", GROUP, "Aks adları (SAGGCAD)")
        ax.addProperty("App::PropertyString", "SaggcadTur", GROUP, "number: düşey (rakam), letter: yatay (harf)")
    ax.SaggcadAdlar = list(names)
    ax.SaggcadTur = kind
    if "Labels" in ax.PropertiesList:   # BIM Axis: her aksın etiketi
        ax.Labels = list(names)
    vo = getattr(ax, "ViewObject", None)
    if vo is not None:   # baloncuk numaralandırması (yalnız arayüzde)
        if "NumberingStyle" in vo.PropertiesList:
            vo.NumberingStyle = "1,2,3" if kind == "number" else "A,B,C"
        if "StartNumber" in vo.PropertiesList:
            first = names[0]
            vo.StartNumber = int(first) if kind == "number" else _letter_no(first)
        if "ShowLabel" in vo.PropertiesList:
            vo.ShowLabel = False


def _letter_no(s):
    n = 0
    for ch in s:
        n = n * 26 + (ord(ch) - 64)
    return n


def make_axis_system(doc, xs, ys, x0=0.0, y0=0.0, over=1500.0, name="Aks sistemi"):
    """xs: düşey aksların aralıkları (mm, soldan sağa), ys: yatay aksların aralıkları (mm). → (system, [axis…], grids)"""
    import Arch

    grids = grid_array(list(xs), list(ys), x0, y0, over, existing=existing_names(doc))
    vert = [g for g in grids if g["kind"] == "number"]
    hor = [g for g in grids if g["kind"] == "letter"]
    axes = []
    if vert:
        ax = Arch.makeAxis(len(vert), 1000.0, "AksDusey")
        ax.Distances = [0.0] + [float(d) for d in xs]
        ax.Angles = [0.0] * len(vert)
        ax.Length = vert[0]["b"][1] - vert[0]["a"][1]
        ax.Placement = App.Placement(App.Vector(vert[0]["a"][0], vert[0]["a"][1], 0), App.Rotation())
        _tag(ax, [g["name"] for g in vert], "number")
        axes.append(ax)
    if hor:
        ax = Arch.makeAxis(len(hor), 1000.0, "AksYatay")
        ax.Distances = [0.0] + [float(d) for d in ys]
        ax.Angles = [0.0] * len(hor)
        ax.Length = hor[0]["b"][0] - hor[0]["a"][0]
        # yerel (d, t) → dünya (xmax − t, y0 + d): akslar y = sabit, xmin..xmax
        ax.Placement = App.Placement(App.Vector(hor[0]["b"][0], hor[0]["a"][1], 0), App.Rotation(App.Vector(0, 0, 1), 90))
        _tag(ax, [g["name"] for g in hor], "letter")
        axes.append(ax)
    system = Arch.makeAxisSystem(axes, name=name) if axes else None
    doc.recompute()
    return system, axes, grids
