import { Drawing } from "../core/document";
import { Entity, SnapPoint, dimensionLine } from "../core/entities";
import { Vec2, dist, mid, normalize, perp, scale, sub, add, angleDeg } from "../core/geometry";
import { Viewport } from "./viewport";
import { fmtLen } from "./format";

const SELECT_COLOR = "#60a5fa";
const PREVIEW_COLOR = "#fbbf24";

export class Renderer {
  readonly ctx: CanvasRenderingContext2D;

  constructor(
    readonly canvas: HTMLCanvasElement,
    readonly view: Viewport,
  ) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D desteklenmiyor");
    this.ctx = ctx;
  }

  resize(): void {
    const dpr = window.devicePixelRatio || 1;
    const r = this.canvas.getBoundingClientRect();
    this.canvas.width = Math.round(r.width * dpr);
    this.canvas.height = Math.round(r.height * dpr);
    this.view.width = r.width;
    this.view.height = r.height;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  clear(showGrid: boolean): void {
    const { ctx, view } = this;
    ctx.fillStyle = "#111827";
    ctx.fillRect(0, 0, view.width, view.height);
    if (showGrid) this.drawGrid();
    this.drawAxes();
  }

  private drawGrid(): void {
    const { ctx, view } = this;
    const step = view.gridStep();
    const tl = view.toWorld({ x: 0, y: 0 });
    const br = view.toWorld({ x: view.width, y: view.height });
    ctx.lineWidth = 1;
    for (const major of [false, true]) {
      const s = major ? step * 5 : step;
      ctx.strokeStyle = major ? "#273244" : "#1b2433";
      ctx.beginPath();
      for (let x = Math.floor(tl.x / s) * s; x <= br.x; x += s) {
        const sx = Math.round(view.toScreen({ x, y: 0 }).x) + 0.5;
        ctx.moveTo(sx, 0);
        ctx.lineTo(sx, view.height);
      }
      for (let y = Math.floor(br.y / s) * s; y <= tl.y; y += s) {
        const sy = Math.round(view.toScreen({ x: 0, y }).y) + 0.5;
        ctx.moveTo(0, sy);
        ctx.lineTo(view.width, sy);
      }
      ctx.stroke();
    }
  }

  private drawAxes(): void {
    const { ctx, view } = this;
    const o = view.toScreen({ x: 0, y: 0 });
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#ef4444";
    ctx.beginPath();
    ctx.moveTo(o.x, o.y);
    ctx.lineTo(o.x + 40, o.y);
    ctx.stroke();
    ctx.strokeStyle = "#22c55e";
    ctx.beginPath();
    ctx.moveTo(o.x, o.y);
    ctx.lineTo(o.x, o.y - 40);
    ctx.stroke();
  }

  drawDocument(doc: Drawing): void {
    for (const e of doc.visibleEntities()) {
      const selected = doc.selection.has(e.id);
      const color = selected ? SELECT_COLOR : doc.layer(e.layer)?.color ?? "#e5e7eb";
      this.drawEntity(e, color, selected);
    }
  }

  drawEntity(e: Entity, color: string, dashed = false): void {
    const { ctx, view } = this;
    const S = (p: Vec2) => view.toScreen(p);
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 1.5;
    ctx.setLineDash(dashed ? [6, 4] : []);
    switch (e.type) {
      case "line": {
        const a = S(e.a), b = S(e.b);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        break;
      }
      case "polyline": {
        if (e.points.length === 0) break;
        ctx.beginPath();
        e.points.forEach((p, i) => {
          const s = S(p);
          if (i === 0) ctx.moveTo(s.x, s.y);
          else ctx.lineTo(s.x, s.y);
        });
        if (e.closed) ctx.closePath();
        ctx.stroke();
        break;
      }
      case "circle": {
        const c = S(e.center);
        ctx.beginPath();
        ctx.arc(c.x, c.y, e.radius * view.zoom, 0, Math.PI * 2);
        ctx.stroke();
        break;
      }
      case "text": {
        const p = S(e.position);
        const px = e.height * view.zoom;
        if (px < 2) break;
        ctx.font = `${px}px "Segoe UI", system-ui, sans-serif`;
        ctx.textBaseline = "alphabetic";
        ctx.fillText(e.text, p.x, p.y);
        break;
      }
      case "dimension":
        this.drawDimension(e.a, e.b, e.offset, color);
        break;
    }
    ctx.setLineDash([]);
  }

  private drawDimension(a: Vec2, b: Vec2, offset: number, color: string): void {
    const { ctx, view } = this;
    const [p1, p2] = dimensionLine({ id: "", layer: "", type: "dimension", a, b, offset });
    const n = normalize(perp(sub(b, a)));
    const overshoot = scale(n, Math.sign(offset || 1) * (4 / view.zoom));
    const S = (p: Vec2) => view.toScreen(p);
    ctx.strokeStyle = color;
    ctx.beginPath();
    for (const [from, to] of [[a, add(p1, overshoot)], [b, add(p2, overshoot)], [p1, p2]] as [Vec2, Vec2][]) {
      const f = S(from), t = S(to);
      ctx.moveTo(f.x, f.y);
      ctx.lineTo(t.x, t.y);
    }
    ctx.stroke();
    // Ölçü uçlarında 45° eğik işaret (mimari çizim alışkanlığı).
    const tick = 5;
    for (const p of [p1, p2]) {
      const s = S(p);
      ctx.beginPath();
      ctx.moveTo(s.x - tick, s.y + tick);
      ctx.lineTo(s.x + tick, s.y - tick);
      ctx.stroke();
    }
    const m = S(mid(p1, p2));
    let ang = -angleDeg(p1, p2) * (Math.PI / 180);
    if (ang < -Math.PI / 2 || ang > Math.PI / 2) ang += Math.PI;
    if (ang < -Math.PI / 2) ang += 2 * Math.PI;
    ctx.save();
    ctx.translate(m.x, m.y);
    ctx.rotate(ang);
    ctx.font = `12px "Segoe UI", system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillStyle = color;
    ctx.fillText(fmtLen(dist(a, b)), 0, -3);
    ctx.restore();
  }

  drawPreview(e: Entity): void {
    this.drawEntity(e, PREVIEW_COLOR, true);
  }

  /** Lastik çizgi + uzunluk/açı etiketi. */
  drawRubber(a: Vec2, b: Vec2): void {
    const { ctx, view } = this;
    const sa = view.toScreen(a), sb = view.toScreen(b);
    ctx.strokeStyle = PREVIEW_COLOR;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(sa.x, sa.y);
    ctx.lineTo(sb.x, sb.y);
    ctx.stroke();
    ctx.setLineDash([]);
    this.label(sb, `${fmtLen(dist(a, b))}  ${angleDeg(a, b).toFixed(1)}°`);
  }

  label(at: Vec2, text: string): void {
    const { ctx } = this;
    ctx.font = `12px "Segoe UI", system-ui, sans-serif`;
    const w = ctx.measureText(text).width + 8;
    ctx.fillStyle = "rgba(15,23,42,0.85)";
    ctx.fillRect(at.x + 12, at.y + 10, w, 18);
    ctx.fillStyle = "#fde68a";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(text, at.x + 16, at.y + 19);
  }

  drawSelectionBox(a: Vec2, b: Vec2, crossing: boolean): void {
    const { ctx } = this;
    ctx.strokeStyle = crossing ? "#4ade80" : SELECT_COLOR;
    ctx.fillStyle = crossing ? "rgba(74,222,128,0.08)" : "rgba(96,165,250,0.08)";
    ctx.setLineDash(crossing ? [5, 3] : []);
    ctx.lineWidth = 1;
    ctx.fillRect(a.x, a.y, b.x - a.x, b.y - a.y);
    ctx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
    ctx.setLineDash([]);
  }

  drawCursor(s: Vec2, snap?: SnapPoint): void {
    const { ctx } = this;
    ctx.strokeStyle = "#e5e7eb";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(s.x - 15, s.y + 0.5);
    ctx.lineTo(s.x + 15, s.y + 0.5);
    ctx.moveTo(s.x + 0.5, s.y - 15);
    ctx.lineTo(s.x + 0.5, s.y + 15);
    ctx.stroke();
    if (!snap || snap.kind === "grid") return;
    const p = this.view.toScreen(snap.p);
    ctx.strokeStyle = "#22d3ee";
    ctx.lineWidth = 2;
    ctx.beginPath();
    if (snap.kind === "end") ctx.rect(p.x - 5, p.y - 5, 10, 10);
    else if (snap.kind === "mid") {
      ctx.moveTo(p.x, p.y - 6);
      ctx.lineTo(p.x + 6, p.y + 5);
      ctx.lineTo(p.x - 6, p.y + 5);
      ctx.closePath();
    } else ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
    ctx.stroke();
  }
}
