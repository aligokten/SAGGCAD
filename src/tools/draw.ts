import { newId, translate } from "../core/entities";
import { Vec2, add, dist, normalize, perp, polygonArea, polylineLength, scale, sub, angleDeg } from "../core/geometry";
import { Renderer } from "../view/renderer";
import { fmtArea, fmtLen } from "../view/format";
import { Tool, ToolContext } from "./tool";

/** İmleç doğrultusunda verilen uzunlukta nokta. */
function along(from: Vec2, cursor: Vec2, length: number): Vec2 {
  const d = normalize(sub(cursor, from));
  return add(from, scale(d.x === 0 && d.y === 0 ? { x: 1, y: 0 } : d, length));
}

export class LineTool implements Tool {
  readonly id = "line";
  readonly label = "Çizgi";
  private start?: Vec2;

  prompt() {
    return this.start ? "Sonraki nokta veya uzunluk [Enter: bitir]" : "İlk nokta";
  }
  basePoint() {
    return this.start;
  }
  click(p: Vec2, ctx: ToolContext) {
    if (this.start && dist(this.start, p) > 1e-9)
      ctx.doc.add({ id: newId(), layer: ctx.doc.currentLayer, type: "line", a: this.start, b: p });
    this.start = p;
  }
  length(v: number, cursor: Vec2, ctx: ToolContext) {
    if (this.start) this.click(along(this.start, cursor, v), ctx);
  }
  confirm(ctx: ToolContext) {
    ctx.finish();
  }
  preview(r: Renderer, cursor: Vec2) {
    if (this.start) r.drawRubber(this.start, cursor);
  }
  reset() {
    this.start = undefined;
  }
}

export class PolylineTool implements Tool {
  readonly id = "polyline";
  readonly label = "Çoklu çizgi";
  private points: Vec2[] = [];

  prompt() {
    return this.points.length ? "Sonraki nokta / uzunluk [Enter: bitir, K: kapat]" : "İlk nokta";
  }
  basePoint() {
    return this.points[this.points.length - 1];
  }
  click(p: Vec2) {
    const last = this.basePoint();
    if (!last || dist(last, p) > 1e-9) this.points.push(p);
  }
  length(v: number, cursor: Vec2) {
    const last = this.basePoint();
    if (last) this.click(along(last, cursor, v));
  }
  confirm(ctx: ToolContext) {
    this.commit(ctx, false);
  }
  close(ctx: ToolContext) {
    this.commit(ctx, true);
  }
  private commit(ctx: ToolContext, closed: boolean) {
    if (this.points.length >= 2) {
      ctx.doc.add({ id: newId(), layer: ctx.doc.currentLayer, type: "polyline", points: this.points, closed });
      const L = polylineLength(this.points, closed);
      ctx.log(`Uzunluk: ${fmtLen(L)} m` + (closed ? `, alan: ${fmtArea(polygonArea(this.points))}` : ""));
    }
    this.points = [];
    ctx.finish();
  }
  preview(r: Renderer, cursor: Vec2) {
    if (this.points.length === 0) return;
    r.drawPreview({ id: "", layer: "", type: "polyline", points: [...this.points, cursor], closed: false });
    r.drawRubber(this.points[this.points.length - 1], cursor);
  }
  reset() {
    this.points = [];
  }
}

export class RectTool implements Tool {
  readonly id = "rect";
  readonly label = "Dikdörtgen";
  private corner?: Vec2;

  prompt() {
    return this.corner ? "Karşı köşe (veya @genişlik,yükseklik)" : "İlk köşe";
  }
  basePoint() {
    return this.corner;
  }
  private pts(a: Vec2, b: Vec2): Vec2[] {
    return [a, { x: b.x, y: a.y }, b, { x: a.x, y: b.y }];
  }
  click(p: Vec2, ctx: ToolContext) {
    if (!this.corner) {
      this.corner = p;
      return;
    }
    const pts = this.pts(this.corner, p);
    ctx.doc.add({ id: newId(), layer: ctx.doc.currentLayer, type: "polyline", points: pts, closed: true });
    ctx.log(`Alan: ${fmtArea(polygonArea(pts))}`);
    ctx.finish();
  }
  preview(r: Renderer, cursor: Vec2) {
    if (!this.corner) return;
    r.drawPreview({ id: "", layer: "", type: "polyline", points: this.pts(this.corner, cursor), closed: true });
    r.label(r.view.toScreen(cursor), `${fmtLen(Math.abs(cursor.x - this.corner.x))} × ${fmtLen(Math.abs(cursor.y - this.corner.y))}`);
  }
  reset() {
    this.corner = undefined;
  }
}

export class CircleTool implements Tool {
  readonly id = "circle";
  readonly label = "Daire";
  private center?: Vec2;

  prompt() {
    return this.center ? "Yarıçap noktası veya yarıçap" : "Merkez";
  }
  basePoint() {
    return this.center;
  }
  click(p: Vec2, ctx: ToolContext) {
    if (!this.center) {
      this.center = p;
      return;
    }
    this.make(dist(this.center, p), ctx);
  }
  length(v: number, _c: Vec2, ctx: ToolContext) {
    if (this.center) this.make(v, ctx);
  }
  private make(radius: number, ctx: ToolContext) {
    if (radius > 0)
      ctx.doc.add({ id: newId(), layer: ctx.doc.currentLayer, type: "circle", center: this.center!, radius });
    ctx.finish();
  }
  preview(r: Renderer, cursor: Vec2) {
    if (!this.center) return;
    r.drawPreview({ id: "", layer: "", type: "circle", center: this.center, radius: dist(this.center, cursor) });
    r.drawRubber(this.center, cursor);
  }
  reset() {
    this.center = undefined;
  }
}

export class TextTool implements Tool {
  readonly id = "text";
  readonly label = "Yazı";
  height = 0.25;

  prompt() {
    return "Yazı başlangıç noktası";
  }
  basePoint() {
    return undefined;
  }
  click(p: Vec2, ctx: ToolContext) {
    const text = ctx.ask("Yazı:");
    if (text) ctx.doc.add({ id: newId(), layer: ctx.doc.currentLayer, type: "text", position: p, text, height: this.height });
    ctx.finish();
  }
  preview() {}
  reset() {}
}

export class DimensionTool implements Tool {
  readonly id = "dimension";
  readonly label = "Ölçü";
  private a?: Vec2;
  private b?: Vec2;

  prompt() {
    if (!this.a) return "Birinci ölçü noktası";
    if (!this.b) return "İkinci ölçü noktası";
    return "Ölçü çizgisi konumu";
  }
  basePoint() {
    return this.b ?? this.a;
  }
  private offsetFor(p: Vec2): number {
    const n = normalize(perp(sub(this.b!, this.a!)));
    return (p.x - this.a!.x) * n.x + (p.y - this.a!.y) * n.y;
  }
  click(p: Vec2, ctx: ToolContext) {
    if (!this.a) this.a = p;
    else if (!this.b) {
      if (dist(this.a, p) > 1e-9) this.b = p;
    } else {
      ctx.doc.add({ id: newId(), layer: ctx.doc.currentLayer, type: "dimension", a: this.a, b: this.b, offset: this.offsetFor(p) });
      ctx.finish();
    }
  }
  preview(r: Renderer, cursor: Vec2) {
    if (!this.a) return;
    if (!this.b) return r.drawRubber(this.a, cursor);
    r.drawPreview({ id: "", layer: "", type: "dimension", a: this.a, b: this.b, offset: this.offsetFor(cursor) });
  }
  reset() {
    this.a = this.b = undefined;
  }
}

/** Mesafe ölçme (çizime bir şey eklemez). */
export class MeasureTool implements Tool {
  readonly id = "measure";
  readonly label = "Mesafe ölç";
  private a?: Vec2;

  prompt() {
    return this.a ? "İkinci nokta" : "Birinci nokta";
  }
  basePoint() {
    return this.a;
  }
  click(p: Vec2, ctx: ToolContext) {
    if (!this.a) {
      this.a = p;
      return;
    }
    const d = sub(p, this.a);
    ctx.log(`Mesafe: ${fmtLen(dist(this.a, p))} m, açı: ${angleDeg(this.a, p).toFixed(2)}°, ΔX: ${fmtLen(d.x)}, ΔY: ${fmtLen(d.y)}`);
    this.a = undefined;
  }
  preview(r: Renderer, cursor: Vec2) {
    if (this.a) r.drawRubber(this.a, cursor);
  }
  reset() {
    this.a = undefined;
  }
}

/** Seçili nesneleri taşır: taban nokta → hedef nokta. */
export class MoveTool implements Tool {
  readonly id = "move";
  readonly label = "Taşı";
  private base?: Vec2;

  prompt() {
    return this.base ? "Hedef nokta" : "Taban nokta";
  }
  basePoint() {
    return this.base;
  }
  click(p: Vec2, ctx: ToolContext) {
    if (ctx.doc.selection.size === 0) {
      ctx.log("Önce taşınacak nesneleri seçin.");
      return ctx.finish();
    }
    if (!this.base) {
      this.base = p;
      return;
    }
    const d = sub(p, this.base);
    ctx.doc.commit((doc) => {
      doc.entities = doc.entities.map((e) => (doc.selection.has(e.id) && doc.isEditable(e) ? translate(e, d) : e));
    });
    ctx.finish();
  }
  length(v: number, cursor: Vec2, ctx: ToolContext) {
    if (this.base) this.click(along(this.base, cursor, v), ctx);
  }
  preview(r: Renderer, cursor: Vec2, ctx: ToolContext) {
    if (!this.base) return;
    const d = sub(cursor, this.base);
    for (const e of ctx.doc.entities)
      if (ctx.doc.selection.has(e.id)) r.drawPreview(translate(e, d));
    r.drawRubber(this.base, cursor);
  }
  reset() {
    this.base = undefined;
  }
}
