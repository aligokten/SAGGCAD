import { Drawing } from "../core/document";
import { Entity, dimensionLine } from "../core/entities";
import { Vec2, angleDeg, dist, mid } from "../core/geometry";

/** Hex rengi en yakın AutoCAD Renk Dizini (ACI) temel rengine eşler. */
function aci(hex: string): number {
  const palette: [number, number, number, number][] = [
    [1, 255, 0, 0], [2, 255, 255, 0], [3, 0, 255, 0], [4, 0, 255, 255],
    [5, 0, 0, 255], [6, 255, 0, 255], [7, 255, 255, 255], [8, 128, 128, 128], [30, 255, 127, 0],
  ];
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return 7;
  const [r, g, b] = [1, 2, 3].map((i) => parseInt(m[i], 16));
  let best = 7, bestD = Infinity;
  for (const [n, pr, pg, pb] of palette) {
    const d = (r - pr) ** 2 + (g - pg) ** 2 + (b - pb) ** 2;
    if (d < bestD) [best, bestD] = [n, d];
  }
  return best;
}

/** DXF katman adlarında izin verilmeyen karakterleri temizler. */
const layerName = (s: string) => s.replace(/[<>/\\":;?*|=`]/g, "_");

class DxfWriter {
  private out: string[] = [];
  pair(code: number, value: string | number) {
    this.out.push(String(code), typeof value === "number" ? String(+value.toFixed(6)) : value);
  }
  point(p: Vec2, base = 10) {
    this.pair(base, p.x);
    this.pair(base + 10, p.y);
    this.pair(base + 20, 0);
  }
  line(layer: string, a: Vec2, b: Vec2) {
    this.pair(0, "LINE");
    this.pair(8, layer);
    this.point(a, 10);
    this.point(b, 11);
  }
  text(layer: string, p: Vec2, h: number, s: string, rot = 0, centered = false) {
    this.pair(0, "TEXT");
    this.pair(8, layer);
    this.point(p, 10);
    this.pair(40, h);
    this.pair(1, s);
    if (rot) this.pair(50, rot);
    if (centered) {
      this.pair(72, 1);
      this.point(p, 11);
    }
  }
  toString() {
    return this.out.join("\r\n") + "\r\n";
  }
}

/**
 * AutoCAD R12 ASCII DXF çıktısı. R12 neredeyse tüm CAD programlarında
 * (AutoCAD, BricsCAD, LibreCAD, ArchiCAD, NetCAD…) sorunsuz açılır.
 * Ölçüler, ilişkisiz (patlatılmış) çizgi + yazı olarak yazılır.
 */
export function exportDxf(doc: Drawing): string {
  const w = new DxfWriter();
  w.pair(0, "SECTION");
  w.pair(2, "HEADER");
  w.pair(9, "$ACADVER");
  w.pair(1, "AC1009");
  w.pair(9, "$INSUNITS");
  w.pair(70, 6); // metre
  w.pair(0, "ENDSEC");

  w.pair(0, "SECTION");
  w.pair(2, "TABLES");
  w.pair(0, "TABLE");
  w.pair(2, "LAYER");
  w.pair(70, doc.layers.length);
  for (const l of doc.layers) {
    w.pair(0, "LAYER");
    w.pair(2, layerName(l.name));
    w.pair(70, l.locked ? 4 : 0);
    w.pair(62, l.visible ? aci(l.color) : -aci(l.color));
    w.pair(6, "CONTINUOUS");
  }
  w.pair(0, "ENDTAB");
  w.pair(0, "ENDSEC");

  w.pair(0, "SECTION");
  w.pair(2, "ENTITIES");
  for (const e of doc.entities) writeEntity(w, e);
  w.pair(0, "ENDSEC");
  w.pair(0, "EOF");
  return w.toString();
}

function writeEntity(w: DxfWriter, e: Entity) {
  const layer = layerName(e.layer);
  switch (e.type) {
    case "line":
      w.line(layer, e.a, e.b);
      break;
    case "polyline":
      w.pair(0, "POLYLINE");
      w.pair(8, layer);
      w.pair(66, 1);
      w.point({ x: 0, y: 0 });
      w.pair(70, e.closed ? 1 : 0);
      for (const p of e.points) {
        w.pair(0, "VERTEX");
        w.pair(8, layer);
        w.point(p);
      }
      w.pair(0, "SEQEND");
      w.pair(8, layer);
      break;
    case "circle":
      w.pair(0, "CIRCLE");
      w.pair(8, layer);
      w.point(e.center);
      w.pair(40, e.radius);
      break;
    case "text":
      w.text(layer, e.position, e.height, e.text);
      break;
    case "dimension": {
      const [p1, p2] = dimensionLine(e);
      w.line(layer, e.a, p1);
      w.line(layer, e.b, p2);
      w.line(layer, p1, p2);
      let rot = angleDeg(p1, p2);
      if (rot > 90 && rot <= 270) rot -= 180;
      w.text(layer, mid(p1, p2), 0.15, dist(e.a, e.b).toFixed(2), rot, true);
      break;
    }
  }
}
