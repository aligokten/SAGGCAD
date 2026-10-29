import { describe, expect, it } from "vitest";
import { Drawing } from "../src/core/document";
import { newId } from "../src/core/entities";
import { exportDxf } from "../src/io/dxf";
import { exportSvg } from "../src/io/svg";

const line = (layer = "0") => ({ id: newId(), layer, type: "line" as const, a: { x: 0, y: 0 }, b: { x: 3, y: 4 } });

describe("çizim belgesi", () => {
  it("geri al / yinele", () => {
    const d = new Drawing();
    d.add(line());
    d.add(line());
    expect(d.entities).toHaveLength(2);
    d.undo();
    expect(d.entities).toHaveLength(1);
    d.redo();
    expect(d.entities).toHaveLength(2);
    d.undo();
    d.add(line());
    expect(d.canRedo).toBe(false);
  });

  it("kilitli katmandaki nesne silinmez", () => {
    const d = new Drawing();
    const a = line("0");
    const b = line("DUVAR");
    d.add(a, b);
    d.layer("DUVAR")!.locked = true;
    d.selection = new Set([a.id, b.id]);
    d.deleteSelection();
    expect(d.entities.map((e) => e.id)).toEqual([b.id]);
  });

  it("kaydet → yükle aynı veriyi verir", () => {
    const d = new Drawing();
    d.add(line(), { id: newId(), layer: "YAZI", type: "text", position: { x: 1, y: 1 }, text: "Salon", height: 0.3 });
    d.currentLayer = "YAZI";
    const data = JSON.parse(JSON.stringify(d.toData()));
    const d2 = new Drawing();
    d2.load(data);
    expect(d2.toData()).toEqual(d.toData());
    expect(d2.canUndo).toBe(false);
  });
});

describe("dışa aktarma", () => {
  const d = new Drawing();
  d.add(
    line("DUVAR"),
    { id: newId(), layer: "DUVAR", type: "polyline", points: [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 4 }], closed: true },
    { id: newId(), layer: "0", type: "circle", center: { x: 1, y: 1 }, radius: 0.5 },
    { id: newId(), layer: "OLCU", type: "dimension", a: { x: 0, y: 0 }, b: { x: 5, y: 0 }, offset: -0.5 },
    { id: newId(), layer: "YAZI", type: "text", position: { x: 1, y: 2 }, text: "A & <B>", height: 0.2 },
  );

  it("DXF R12 yapısı", () => {
    const dxf = exportDxf(d).split("\r\n");
    expect(dxf[dxf.length - 2]).toBe("EOF");
    expect(dxf).toContain("AC1009");
    for (const kw of ["LINE", "POLYLINE", "VERTEX", "SEQEND", "CIRCLE", "TEXT", "DUVAR"]) expect(dxf).toContain(kw);
    expect(dxf).toContain("5.00"); // ölçü metni
    // Grup kodu / değer çiftleri: toplam satır sayısı çift olmalı (son boş satır hariç).
    expect((dxf.length - 1) % 2).toBe(0);
  });

  it("SVG geçerli ve kaçışlı", () => {
    const svg = exportSvg(d);
    expect(svg).toContain("<svg");
    expect(svg).toContain("A &amp; &lt;B&gt;");
    expect(svg).toContain("<circle");
  });
});
