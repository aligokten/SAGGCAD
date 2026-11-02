# SAGGCAD tezgâhı — FreeCAD / UniCAD arayüz kaydı.
import os

import FreeCADGui as Gui


class SaggcadWorkbench(Gui.Workbench):
    MenuText = "SAGGCAD"
    ToolTip = "Mimari rölöve, tadilat ve betonarme metraj (aks sistemi, donatı hesabı ve metrajı)"

    def __init__(self):
        import saggcad
        self.__class__.Icon = os.path.join(os.path.dirname(saggcad.__file__), "resources", "icons", "saggcad.svg")

    def Initialize(self):
        from saggcad.gui import commands
        commands.register()
        self.appendToolbar("SAGGCAD Aks", ["SAGGCAD_AksSistemi"])
        self.appendToolbar("SAGGCAD Donatı", ["SAGGCAD_DonatiTanimla", "SAGGCAD_DonatiMinimum", "SAGGCAD_DonatiMetraji"])
        self.appendMenu("SAGGCAD", ["SAGGCAD_AksSistemi", "Separator", "SAGGCAD_DonatiTanimla", "SAGGCAD_DonatiMinimum",
                                    "SAGGCAD_DonatiMetraji", "SAGGCAD_DonatiKurallari"])
        # BIM tezgâhının modelleme komutları (duvar, yapı elemanı, aks, kat…) yüklüyse aynı tezgâhta
        # (komutlar BIM tezgâhı bu oturumda en az bir kez açıldıysa kayıtlıdır; yoksa yalnız SAGGCAD komutları)
        try:
            wanted = ["BIM_Wall", "BIM_Column", "BIM_Beam", "BIM_Slab", "BIM_Window", "BIM_Level",
                      "Arch_Wall", "Arch_Structure", "Arch_Window", "Arch_Floor", "Arch_Axis"]
            have = [c for c in wanted if c in Gui.listCommands()]
            if have:
                self.appendToolbar("SAGGCAD Modelleme", have)
        except Exception:  # BIM yoksa yalnız SAGGCAD komutları
            pass

    def Activated(self):
        pass

    def Deactivated(self):
        pass

    def GetClassName(self):
        return "Gui::PythonWorkbench"


Gui.addWorkbench(SaggcadWorkbench())
