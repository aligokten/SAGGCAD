import { Box, Vec2 } from "../core/geometry";

/** Dünya (metre, Y yukarı) ile ekran (piksel, Y aşağı) arasındaki dönüşüm. */
export class Viewport {
  /** Metre başına piksel. */
  zoom = 50;
  /** Ekran merkezine düşen dünya noktası. */
  center: Vec2 = { x: 0, y: 0 };
  width = 1;
  height = 1;

  toScreen(p: Vec2): Vec2 {
    return {
      x: (p.x - this.center.x) * this.zoom + this.width / 2,
      y: this.height / 2 - (p.y - this.center.y) * this.zoom,
    };
  }

  toWorld(s: Vec2): Vec2 {
    return {
      x: (s.x - this.width / 2) / this.zoom + this.center.x,
      y: (this.height / 2 - s.y) / this.zoom + this.center.y,
    };
  }

  /** İmlecin altındaki noktayı sabit tutarak yakınlaştırır. */
  zoomAt(screen: Vec2, factor: number): void {
    const before = this.toWorld(screen);
    this.zoom = Math.min(1e5, Math.max(1e-3, this.zoom * factor));
    const after = this.toWorld(screen);
    this.center = { x: this.center.x + before.x - after.x, y: this.center.y + before.y - after.y };
  }

  panBy(dxScreen: number, dyScreen: number): void {
    this.center = { x: this.center.x - dxScreen / this.zoom, y: this.center.y + dyScreen / this.zoom };
  }

  fit(box: Box | null, margin = 0.1): void {
    if (!box) {
      this.center = { x: 0, y: 0 };
      this.zoom = 50;
      return;
    }
    const w = Math.max(box.max.x - box.min.x, 1e-3);
    const h = Math.max(box.max.y - box.min.y, 1e-3);
    this.center = { x: (box.min.x + box.max.x) / 2, y: (box.min.y + box.max.y) / 2 };
    this.zoom = Math.min(this.width / w, this.height / h) * (1 - 2 * margin);
  }

  /** Ekranda okunabilir aralıkta kalan grid adımı (1-2-5 dizisi). */
  gridStep(minPx = 12): number {
    const raw = minPx / this.zoom;
    const p = Math.pow(10, Math.floor(Math.log10(raw)));
    for (const m of [1, 2, 5, 10]) if (p * m >= raw) return p * m;
    return p * 10;
  }
}
