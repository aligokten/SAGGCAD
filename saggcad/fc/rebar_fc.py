"""Donatı — FreeCAD BIM / Arch nesneleri ile çekirdek (saggcad.core.rebar) arasındaki bağ.

Betonarme eleman tanıma
    Arch Structure: IfcType Column → kolon, Beam → kiriş, Slab → döşeme. Malzemesi yoksa ya da adı "beton" /
    "concrete" içeriyorsa betonarme sayılır; başka malzeme (çelik, ahşap…) atanmışsa sayılmaz.
    Arch Wall: yalnız malzeme adı "beton" / "concrete" içeriyorsa (perde / betonarme duvar).
    Donatı özellik grubu eklenmiş her nesne ayrıca dahil edilir.

Donatı tanımı nesnenin üzerinde, Özellikler panelinde "SAGGCAD Donatı" grubunda durur (FreeCAD dosyasıyla saklanır,
geri al / yinele FreeCAD işlemleriyle çalışır). Aralık ve boylar mm (FreeCAD birimi), çaplar mm.
Proje kuralları (beton / çelik sınıfı, paspayı, bindirme…) belge meta verisinde: doc.Meta["SAGGCAD_DonatiKurallari"] (JSON).
"""
import json

import FreeCAD as App

from ..core import rebar as core

GROUP = "SAGGCAD Donatı"
MODE_LABELS = ["Tanımsız", "Yönetmelik minimumu (yaklaşık)", "Statik projeden (elle)"]
MODE_KEYS = ["none", "min", "manual"]
RULES_KEY = "SAGGCAD_DonatiKurallari"

# çekirdek alanı → (özellik adı, tür, açıklama); "len" = uzunluk (mm ↔ cm)
PROPS = {
    "kolon": [("n", "BoyunaAdet", "int", "Boyuna çubuk adedi"), ("d", "BoyunaCap", "int", "Boyuna çubuk çapı (mm)"),
              ("sd", "EtriyeCap", "int", "Etriye çapı (mm)"), ("sc", "SarilmaAralik", "len", "Sarılma bölgesi etriye aralığı"),
              ("s", "OrtaAralik", "len", "Orta bölge etriye aralığı"), ("lc", "SarilmaBoyu", "len", "Sarılma bölgesi boyu (0: kendiliğinden)")],
    "kiris": [("nt", "UstAdet", "int", "Üst boyuna adet"), ("dt", "UstCap", "int", "Üst boyuna çap (mm)"),
              ("nb", "AltAdet", "int", "Alt boyuna adet"), ("db", "AltCap", "int", "Alt boyuna çap (mm)"),
              ("sd", "EtriyeCap", "int", "Etriye çapı (mm)"), ("sc", "SarilmaAralik", "len", "Sarılma bölgesi etriye aralığı"),
              ("s", "OrtaAralik", "len", "Orta bölge etriye aralığı"), ("lc", "SarilmaBoyu", "len", "Sarılma bölgesi boyu (0: kendiliğinden)")],
    "slab": [("dx", "XCap", "int", "X doğrultusu çap (mm)"), ("sx", "XAralik", "len", "X doğrultusu aralık"),
             ("dy", "YCap", "int", "Y doğrultusu çap (mm)"), ("sy", "YAralik", "len", "Y doğrultusu aralık"),
             ("top", "UstHasir", "bool", "Üst hasır da aynı (alt + üst)")],
    "wall": [("dv", "DuseyCap", "int", "Düşey çap (mm)"), ("sv", "DuseyAralik", "len", "Düşey aralık (her yüz)"),
             ("dh", "YatayCap", "int", "Yatay çap (mm)"), ("sh", "YatayAralik", "len", "Yatay aralık (her yüz)")],
}
_PTYPE = {"int": "App::PropertyInteger", "len": "App::PropertyLength", "bool": "App::PropertyBool"}


def _type(o):
    t = getattr(getattr(o, "Proxy", None), "Type", None)
    if t:
        return t
    try:
        import Draft
        return Draft.getType(o)
    except Exception:
        return ""


def _mat_name(o):
    m = getattr(o, "Material", None)
    if m is None:
        return ""
    return " ".join(str(x) for x in (getattr(m, "Label", ""), (getattr(m, "Material", None) or {}).get("Name", "")))


def _is_concrete_name(n):
    n = n.lower()
    return "beton" in n or "concrete" in n


def kind_of(o):
    """kolon | kiris | slab | wall | None"""
    t = _type(o)
    has_rb = "DonatiKaynak" in getattr(o, "PropertiesList", [])
    if t == "Structure":
        ifc = str(getattr(o, "IfcType", "") or getattr(o, "Role", ""))
        k = {"Column": "kolon", "Beam": "kiris", "Slab": "slab"}.get(ifc)
        if not k:
            return None
        mat = _mat_name(o)
        return k if (has_rb or not mat.strip() or _is_concrete_name(mat)) else None
    if t == "Wall":
        return "wall" if (has_rb or _is_concrete_name(_mat_name(o))) else None
    return None


def _len_cm(q):
    return float(getattr(q, "Value", q) or 0) / 10.0


def _level_of(o):
    for p in getattr(o, "InList", []):
        if _type(p) in ("Floor", "BuildingPart"):
            return p.Label
    return ""


def _xy_polygon(shape):
    """düz bir şeklin (taban telinin) XY çokgeni, cm"""
    wires = shape.Wires
    if not wires:
        return []
    w = max(wires, key=lambda x: x.BoundBox.DiagonalLength)
    return [(v.Point.x / 10.0, v.Point.y / 10.0) for v in w.OrderedVertexes]


def geom_of(o, kind):
    """çekirdek geometrisi (cm). Parametrik ölçü yoksa şeklin sınır kutusundan."""
    bb = o.Shape.BoundBox if hasattr(o, "Shape") and not o.Shape.isNull() else None
    if kind == "kolon":
        base = getattr(o, "Base", None)
        if base is None and _len_cm(getattr(o, "Length", 0)) > 0:
            return {"b": _len_cm(o.Length), "h": _len_cm(o.Width), "H": _len_cm(o.Height), "round": False}
        rnd = False
        if base is not None and base.Shape.Edges and len(base.Shape.Edges) == 1 and type(base.Shape.Edges[0].Curve).__name__ == "Circle":
            rnd = True
        return {"b": bb.XLength / 10, "h": bb.YLength / 10, "H": bb.ZLength / 10, "round": rnd}
    if kind == "kiris":
        L = _len_cm(getattr(o, "Length", 0))
        base = getattr(o, "Base", None)
        if base is not None and hasattr(base, "Shape") and base.Shape.Edges:
            L = sum(e.Length for e in base.Shape.Edges) / 10
        if not L > 0 and bb:
            L = max(bb.XLength, bb.YLength) / 10
        return {"L": L, "b": _len_cm(o.Width), "h": _len_cm(o.Height)}
    if kind == "slab":
        base = getattr(o, "Base", None)
        pts = _xy_polygon(base.Shape) if base is not None and hasattr(base, "Shape") else []
        if len(pts) < 3 and bb:   # tabandan bulunamazsa alt yüz
            faces = [f for f in o.Shape.Faces if abs(f.CenterOfMass.z - bb.ZMin) < 1e-3]
            if faces:
                pts = _xy_polygon(max(faces, key=lambda f: f.Area))
        return {"pts": pts, "t": _len_cm(o.Height) or (bb.ZLength / 10 if bb else 0)}
    if kind == "wall":
        L = _len_cm(getattr(o, "Length", 0)) or (max(bb.XLength, bb.YLength) / 10 if bb else 0)
        ops = sum(1 for x in o.Document.Objects if o in (getattr(x, "Hosts", None) or []))
        return {"L": L, "t": _len_cm(o.Width), "H": _len_cm(o.Height), "openings": ops}
    return {}


def ensure_props(o, kind=None):
    """donatı özellik grubunu ekle (varsa dokunma). → eklenen alan sayısı"""
    kind = kind or kind_of(o)
    if not kind:
        return 0
    added = 0
    if "DonatiKaynak" not in o.PropertiesList:
        o.addProperty("App::PropertyEnumeration", "DonatiKaynak", GROUP, "Donatının kaynağı: tanımsız / yönetmelik minimumu (tahmini) / statik projeden (kesin)")
        o.DonatiKaynak = MODE_LABELS
        o.DonatiKaynak = MODE_LABELS[0]
        added += 1
    for _, name, t, tip in PROPS[kind]:
        if name not in o.PropertiesList:
            o.addProperty(_PTYPE[t], name, GROUP, tip)
            added += 1
    return added


def mode_of(o):
    v = getattr(o, "DonatiKaynak", None)
    return MODE_KEYS[MODE_LABELS.index(v)] if v in MODE_LABELS else "none"


def rb_of(o, kind):
    mode = mode_of(o)
    rb = {"mode": mode}
    if mode != "manual":
        return rb
    for key, name, t, _ in PROPS[kind]:
        v = getattr(o, name, None)
        if v is None:
            continue
        rb[key] = bool(v) if t == "bool" else (_len_cm(v) if t == "len" else int(v))
    return rb


def set_mode(o, mode, rules=None):
    """mode: none | min | manual. 'manual' seçilince ve alanlar boşsa o anki minimum değerler AÇIKÇA yazılır."""
    kind = kind_of(o)
    if not kind:
        raise ValueError(f"{o.Label}: betonarme kolon / kiriş / döşeme / perde değil")
    ensure_props(o, kind)
    o.DonatiKaynak = MODE_LABELS[MODE_KEYS.index(mode)]
    if mode == "manual" and not any(getattr(o, n, 0) for _, n, t, _ in PROPS[kind] if t != "bool"):
        spec = core.min_spec(kind, geom_of(o, kind), rules or rules_of(o.Document))
        for key, name, t, _ in PROPS[kind]:
            if key in spec:
                setattr(o, name, bool(spec[key]) if t == "bool" else (float(spec[key]) * 10 if t == "len" else int(spec[key])))


def rules_of(doc):
    try:
        over = json.loads(doc.Meta.get(RULES_KEY, "") or "{}")
    except (ValueError, AttributeError):
        over = {}
    return core.rules_of(over)


def set_rules(doc, over):
    meta = dict(doc.Meta)
    meta[RULES_KEY] = json.dumps(over or {}, ensure_ascii=False)
    doc.Meta = meta


def elements(doc):
    out, counters = [], {}
    for o in doc.Objects:
        kind = kind_of(o)
        if not kind:
            continue
        counters[kind] = counters.get(kind, 0) + 1
        out.append({"key": o.Name, "obj": o.Name, "kind": kind, "name": o.Label, "level": _level_of(o),
                    "geom": geom_of(o, kind), "rb": rb_of(o, kind)})
    return out


def report(doc):
    try:
        over = json.loads(doc.Meta.get(RULES_KEY, "") or "{}")
    except (ValueError, AttributeError):
        over = {}
    return core.report(elements(doc), over)


def assign_min_to_undefined(doc, objs=None):
    """tanımsız betonarme elemanlara yönetmelik minimumu (tahmini). → atanan nesneler"""
    done = []
    for o in (objs if objs is not None else doc.Objects):
        if kind_of(o) and mode_of(o) == "none":
            set_mode(o, "min")
            done.append(o)
    return done


def write_spreadsheet(doc, rep, name="DonatiMetraji"):
    """raporu belgede bir Spreadsheet'e yaz (varsa üzerine)"""
    sh = doc.getObject(name)
    if sh is None:
        sh = doc.addObject("Spreadsheet::Sheet", name)
        sh.Label = "Donatı metrajı"
    else:
        sh.clearAll()
    rows = [["Kat", "Eleman", "Tür", "Kaynak", "Rol", "Çap (mm)", "Adet", "Boy (m)", "Toplam (m)", "kg", "Beton (m³)", "Not"]]
    for r in rep["rows"]:
        if not r["bars"]:
            rows.append([r["level"], r["name"], core.KIND_T[r["kind"]], core.MODES[r["mode"]], "", "", "", "", "", "", round(r["concrete"], 3), "; ".join(r["warnings"])])
        for i, b in enumerate(r["bars"]):
            rows.append([r["level"], r["name"], core.KIND_T[r["kind"]], core.MODES[r["mode"]], b["role"], b["d"], b["n"], round(b["len"] / 100, 2),
                         round(b["m"], 2), round(b["kg"], 2), "" if i else round(r["concrete"], 3), "" if i else "; ".join(r["warnings"])])
    rows += [[], ["Çap (mm)", "kg/m", "Toplam (m)", "Toplam (kg)", "Statik projeden (kg)", "Minimum tahmini (kg)"]]
    for x in rep["by_diameter"]:
        rows.append([x["d"], round(x["kgPerM"], 3), round(x["m"], 2), round(x["kg"], 2), round(x["kgManual"], 2), round(x["kgMin"], 2)])
    T = rep["totals"]
    rows += [[], ["Genel toplam (kg)", round(T["total"], 2), "Statik projeden", round(T["manual"], 2), "Minimum tahmini", round(T["min"], 2), "Tanımsız", T["undefined"]]]
    cols = "ABCDEFGHIJKL"
    for i, row in enumerate(rows, start=1):
        for j, v in enumerate(row):
            if v == "" or v is None:
                continue
            sh.set(f"{cols[j]}{i}", (f"'{v}" if isinstance(v, str) else str(v)))
    doc.recompute()
    return sh


def to_csv(rep, title=""):
    return core.to_csv(rep, title)


__all__ = ["kind_of", "geom_of", "ensure_props", "set_mode", "mode_of", "rules_of", "set_rules", "elements", "report",
           "assign_min_to_undefined", "write_spreadsheet", "to_csv", "App"]
