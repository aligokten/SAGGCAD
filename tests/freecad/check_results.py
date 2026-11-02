"""CI: FreeCAD testinin sonuç dosyasını denetle (dosya yoksa ya da ok değilse başarısız)."""
import json
import sys

path = sys.argv[1] if len(sys.argv) > 1 else "fc-results.json"
try:
    data = json.load(open(path, encoding="utf-8"))
except (OSError, ValueError) as e:
    print(f"Sonuç dosyası okunamadı ({path}): {e} — FreeCAD testi çalışmadı sayılır")
    sys.exit(1)
for r in data["results"]:
    print(("✓ " if r["ok"] else "✗ ") + r["msg"] + ("" if r["ok"] else f"\n    {r.get('detail')}"))
n_ok = sum(r["ok"] for r in data["results"])
print(f"{n_ok}/{len(data['results'])} denetim geçti")
sys.exit(0 if data["ok"] and n_ok == len(data["results"]) else 1)
