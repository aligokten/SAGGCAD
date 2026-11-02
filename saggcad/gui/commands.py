"""SAGGCAD komutları (FreeCAD arayüzü). Her değişiklik bir FreeCAD işlemi (geri al / yinele) içinde yapılır."""
import os

import FreeCAD as App
import FreeCADGui as Gui

from ..core import grids as G
from ..core import rebar as core

try:   # FreeCAD'in PySide köprüsü (Qt5 / Qt6)
    from PySide import QtCore, QtGui
    try:
        from PySide import QtWidgets
    except ImportError:
        QtWidgets = QtGui
except ImportError:   # pragma: no cover
    QtCore = QtGui = QtWidgets = None

ICONS = os.path.join(os.path.dirname(os.path.dirname(__file__)), "resources", "icons")


def icon(name):
    return os.path.join(ICONS, name + ".svg")


def _doc():
    return App.ActiveDocument or App.newDocument("SAGGCAD")


def _msg(title, text, warn=False):
    box = QtWidgets.QMessageBox.warning if warn else QtWidgets.QMessageBox.information
    box(Gui.getMainWindow(), title, text)


class _Txn:
    """FreeCAD işlemi: hata olursa geri sarılır"""
    def __init__(self, doc, name):
        self.doc, self.name = doc, name

    def __enter__(self):
        self.doc.openTransaction(self.name)
        return self

    def __exit__(self, et, ev, tb):
        if et:
            self.doc.abortTransaction()
            return False
        self.doc.commitTransaction()
        self.doc.recompute()
        return False


# ── Aks sistemi ──
class AxisSystemDialog(QtWidgets.QDialog if QtWidgets else object):
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setWindowTitle("Aks sistemi")
        f = QtWidgets.QFormLayout(self)
        info = QtWidgets.QLabel("Aralıkları mm cinsinden boşlukla ayırın; tekrar için 3x4000 yazabilirsiniz.\n"
                                "Düşey akslar rakam (1, 2, 3…), yatay akslar harf (A, B, C…) alır; adlar mevcut akslardan devam eder.")
        info.setWordWrap(True)
        f.addRow(info)
        self.xs = QtWidgets.QLineEdit("4000 4000")
        self.ys = QtWidgets.QLineEdit("3500 3500")
        self.x0, self.y0, self.over = QtWidgets.QDoubleSpinBox(), QtWidgets.QDoubleSpinBox(), QtWidgets.QDoubleSpinBox()
        for sb, v in ((self.x0, 0), (self.y0, 0), (self.over, 1500)):
            sb.setRange(-1e7, 1e7)
            sb.setDecimals(0)
            sb.setSuffix(" mm")
            sb.setValue(v)
        f.addRow("Düşey akslar arası (soldan sağa)", self.xs)
        f.addRow("Yatay akslar arası (aşağıdan yukarı)", self.ys)
        f.addRow("İlk kesişim X", self.x0)
        f.addRow("İlk kesişim Y", self.y0)
        f.addRow("Taşma", self.over)
        bb = QtWidgets.QDialogButtonBox(QtWidgets.QDialogButtonBox.Ok | QtWidgets.QDialogButtonBox.Cancel)
        bb.accepted.connect(self._ok)
        bb.rejected.connect(self.reject)
        f.addRow(bb)
        self.result_ = None

    def _ok(self):
        xs, ys = G.parse_spacing(self.xs.text()), G.parse_spacing(self.ys.text())
        if xs is None or ys is None or (not xs and not ys):
            _msg("Aks sistemi", "Aralıkları sayı olarak girin (ör. 4000 5000 ya da 3x4000).", warn=True)
            return
        self.result_ = (xs, ys, self.x0.value(), self.y0.value(), self.over.value())
        self.accept()


class CmdAxisSystem:
    def GetResources(self):
        return {"Pixmap": icon("aks"), "MenuText": "Aks sistemi…", "ToolTip": "Aralıkları yazarak düşey (1, 2, 3…) ve yatay (A, B, C…) aks sistemi oluşturur (BIM Axis)"}

    def IsActive(self):
        return True

    def Activated(self):
        d = AxisSystemDialog(Gui.getMainWindow())
        if not d.exec_() or not d.result_:
            return
        from ..fc.axes import make_axis_system
        doc = _doc()
        xs, ys, x0, y0, over = d.result_
        with _Txn(doc, "Aks sistemi"):
            system, axes, grids = make_axis_system(doc, xs, ys, x0, y0, over)
        App.Console.PrintMessage(f"SAGGCAD: {len(grids)} aks oluşturuldu ({', '.join(g['name'] for g in grids)})\n")


# ── Donatı ──
class CmdRebarDefine:
    def GetResources(self):
        return {"Pixmap": icon("donati"), "MenuText": "Donatı tanımla…",
                "ToolTip": "Seçili betonarme kolon / kiriş / döşeme / perdeye donatı özellik grubunu ekler ve kaynağı seçtirir. Değerler Özellikler panelinde, 'SAGGCAD Donatı' grubunda düzenlenir."}

    def IsActive(self):
        return bool(Gui.Selection.getSelection())

    def Activated(self):
        from ..fc import rebar_fc as RF
        sel = [o for o in Gui.Selection.getSelection() if RF.kind_of(o)]
        if not sel:
            return _msg("Donatı tanımla", "Seçimde betonarme eleman yok.\nBIM yapı elemanı (Column / Beam / Slab, malzemesi yok ya da beton) ya da malzemesi beton olan duvar seçin.", warn=True)
        items = RF.MODE_LABELS
        choice, ok = QtWidgets.QInputDialog.getItem(Gui.getMainWindow(), "Donatı kaynağı", f"{len(sel)} eleman için donatı kaynağı:", items, 2, False)
        if not ok:
            return
        mode = RF.MODE_KEYS[items.index(choice)]
        doc = sel[0].Document
        with _Txn(doc, "Donatı tanımla"):
            for o in sel:
                RF.set_mode(o, mode)
        if mode == "manual":
            App.Console.PrintMessage("SAGGCAD: elle donatı — o anki yönetmelik minimumu başlangıç değeri olarak yazıldı; statik projedeki değerleri Özellikler > SAGGCAD Donatı'dan girin.\n")


class CmdRebarMin:
    def GetResources(self):
        return {"Pixmap": icon("donati-min"), "MenuText": "Tanımsızlara minimum donatı ata",
                "ToolTip": "Donatısı tanımsız tüm betonarme elemanlara yönetmelik minimumu (TS 500 / TBDY 2018 — tahmini) atar. Tek geri al adımı."}

    def IsActive(self):
        return App.ActiveDocument is not None

    def Activated(self):
        from ..fc import rebar_fc as RF
        doc = App.ActiveDocument
        sel = Gui.Selection.getSelection()
        with _Txn(doc, "Minimum donatı ata"):
            done = RF.assign_min_to_undefined(doc, sel or None)
        _msg("Minimum donatı", f"{len(done)} elemana yönetmelik minimumu atandı (tahmini).\nGeri almak için Ctrl+Z." if done else "Donatısı tanımsız betonarme eleman yok.")


class RebarReportDialog(QtWidgets.QDialog if QtWidgets else object):
    def __init__(self, doc, rep, parent=None):
        super().__init__(parent)
        self.doc, self.rep = doc, rep
        self.setWindowTitle("Donatı metrajı — betonarme elemanlar")
        self.resize(820, 560)
        v = QtWidgets.QVBoxLayout(self)
        T = rep["totals"]
        head = QtWidgets.QLabel(f"<b>Toplam {T['total']:.1f} kg</b> ({T['total'] / 1000:.3f} t) · statik projeden (kesin) {T['manual']:.1f} kg · "
                                f"minimum tahmini {T['min']:.1f} kg · beton (tanımlı) {T['concreteDefined']:.2f} m³ · {T['ratio']:.0f} kg/m³"
                                + (f"<br><span style='color:#B45309'>{T['undefined']} elemanın donatısı tanımsız — metraja girmedi.</span>" if T["undefined"] else "")
                                + ("<br><small>Minimum tahmini TS 500 / TBDY 2018 en az koşullarından türetilen ön tahmindir; statik projenin yerini tutmaz.</small>" if T["min"] else ""))
        head.setWordWrap(True)
        v.addWidget(head)
        t1 = QtWidgets.QTableWidget(len(rep["by_diameter"]), 6)
        t1.setHorizontalHeaderLabels(["Çap", "kg/m", "Toplam boy (m)", "Toplam (kg)", "Statik projeden", "Minimum tahmini"])
        for i, x in enumerate(rep["by_diameter"]):
            for j, val in enumerate([f"Ø{x['d']}", f"{x['kgPerM']:.3f}", f"{x['m']:.1f}", f"{x['kg']:.1f}", f"{x['kgManual']:.1f}", f"{x['kgMin']:.1f}"]):
                t1.setItem(i, j, QtWidgets.QTableWidgetItem(val))
        v.addWidget(t1)
        t2 = QtWidgets.QTableWidget(len(rep["rows"]), 6)
        t2.setHorizontalHeaderLabels(["Kat", "Eleman", "Tür", "Kaynak", "Donatı (kg)", "Uyarı"])
        for i, r in enumerate(rep["rows"]):
            for j, val in enumerate([r["level"], r["name"], core.KIND_T[r["kind"]], core.MODES[r["mode"]], f"{r['kg']:.1f}" if r["kg"] else "—", "; ".join(r["warnings"])]):
                t2.setItem(i, j, QtWidgets.QTableWidgetItem(val))
        t2.cellDoubleClicked.connect(self._select)
        v.addWidget(t2)
        bb = QtWidgets.QDialogButtonBox()
        b_csv = bb.addButton("CSV kaydet…", QtWidgets.QDialogButtonBox.ActionRole)
        b_sh = bb.addButton("Belgeye tablo (Spreadsheet)", QtWidgets.QDialogButtonBox.ActionRole)
        bb.addButton(QtWidgets.QDialogButtonBox.Close)
        b_csv.clicked.connect(self._csv)
        b_sh.clicked.connect(self._sheet)
        bb.rejected.connect(self.reject)
        v.addWidget(bb)

    def _select(self, row, _col):
        name = self.rep["rows"][row]["obj"]
        Gui.Selection.clearSelection()
        Gui.Selection.addSelection(self.doc.getObject(name))

    def _csv(self):
        path, _ = QtWidgets.QFileDialog.getSaveFileName(self, "Donatı metrajı CSV", "donati-metraji.csv", "CSV (*.csv)")
        if path:
            with open(path, "w", encoding="utf-8", newline="") as f:
                f.write(core.to_csv(self.rep, f"{self.doc.Label} — donatı metrajı"))

    def _sheet(self):
        from ..fc import rebar_fc as RF
        with _Txn(self.doc, "Donatı metrajı tablosu"):
            RF.write_spreadsheet(self.doc, self.rep)


class CmdRebarReport:
    def GetResources(self):
        return {"Pixmap": icon("metraj"), "MenuText": "Donatı metrajı…",
                "ToolTip": "Betonarme elemanların donatı metrajı: çap toplamları (m, kg, ton), beton m³, kg/m³; kesin ve tahmini ayrı"}

    def IsActive(self):
        return App.ActiveDocument is not None

    def Activated(self):
        from ..fc import rebar_fc as RF
        doc = App.ActiveDocument
        rep = RF.report(doc)
        if not rep["rows"]:
            return _msg("Donatı metrajı", "Belgede betonarme eleman yok.\nBIM yapı elemanları (Column / Beam / Slab) ve malzemesi beton olan duvarlar sayılır.", warn=True)
        RebarReportDialog(doc, rep, Gui.getMainWindow()).exec_()


class RulesDialog(QtWidgets.QDialog if QtWidgets else object):
    def __init__(self, rules, parent=None):
        super().__init__(parent)
        self.setWindowTitle("Donatı hesap kuralları (bu belge)")
        f = QtWidgets.QFormLayout(self)
        self.c = QtWidgets.QComboBox()
        self.c.addItems(list(core.FCK))
        self.c.setCurrentText(rules["concrete"])
        self.s = QtWidgets.QComboBox()
        self.s.addItems(list(core.FYK))
        self.s.setCurrentText(rules["steel"])
        f.addRow("Beton sınıfı", self.c)
        f.addRow("Çelik sınıfı", self.s)
        self.sp = {}
        for key, label, suf, val in (("lap", "Bindirme", " ×Ø", rules["lap"]), ("endHook", "Boyuna uç bükümü", " ×Ø", rules["endHook"]),
                                     ("stirHook", "Etriye kancası", " ×Ø", rules["stirHook"]), ("stock", "Ticari çubuk boyu", " mm", rules["stock"] * 10),
                                     ("cover.col", "Paspayı kolon", " mm", rules["cover"]["col"] * 10), ("cover.beam", "Paspayı kiriş", " mm", rules["cover"]["beam"] * 10),
                                     ("cover.slab", "Paspayı döşeme", " mm", rules["cover"]["slab"] * 10), ("cover.wall", "Paspayı perde", " mm", rules["cover"]["wall"] * 10)):
            sb = QtWidgets.QDoubleSpinBox()
            sb.setRange(0.1, 100000)
            sb.setDecimals(1)
            sb.setSuffix(suf)
            sb.setValue(val)
            f.addRow(label, sb)
            self.sp[key] = sb
        bb = QtWidgets.QDialogButtonBox(QtWidgets.QDialogButtonBox.Ok | QtWidgets.QDialogButtonBox.Cancel | QtWidgets.QDialogButtonBox.RestoreDefaults)
        bb.accepted.connect(self.accept)
        bb.rejected.connect(self.reject)
        bb.button(QtWidgets.QDialogButtonBox.RestoreDefaults).clicked.connect(lambda: self.done(2))
        f.addRow(bb)

    def values(self):
        o = {"concrete": self.c.currentText(), "steel": self.s.currentText(), "cover": {}}
        for k, sb in self.sp.items():
            v = sb.value()
            if k.startswith("cover."):
                o["cover"][k[6:]] = v / 10
            else:
                o[k] = v / 10 if k == "stock" else v
        return o


class CmdRebarRules:
    def GetResources(self):
        return {"Pixmap": icon("ayar"), "MenuText": "Donatı hesap kuralları…", "ToolTip": "Beton / çelik sınıfı, paspayları, bindirme, büküm, kanca, ticari çubuk boyu (belgede saklanır)"}

    def IsActive(self):
        return App.ActiveDocument is not None

    def Activated(self):
        from ..fc import rebar_fc as RF
        doc = App.ActiveDocument
        d = RulesDialog(RF.rules_of(doc), Gui.getMainWindow())
        r = d.exec_()
        if r == 2:
            RF.set_rules(doc, {})
        elif r:
            RF.set_rules(doc, d.values())


COMMANDS = {
    "SAGGCAD_AksSistemi": CmdAxisSystem(),
    "SAGGCAD_DonatiTanimla": CmdRebarDefine(),
    "SAGGCAD_DonatiMinimum": CmdRebarMin(),
    "SAGGCAD_DonatiMetraji": CmdRebarReport(),
    "SAGGCAD_DonatiKurallari": CmdRebarRules(),
}


def register():
    for name, cmd in COMMANDS.items():
        if name not in Gui.listCommands():
            Gui.addCommand(name, cmd)
    return list(COMMANDS)
