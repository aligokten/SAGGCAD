import { Drawing } from "../core/document";
import { dimensionLine, entityBox } from "../core/entities";
import { Vec2, dist, mid, angleDeg } from "../core/geometry";

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** Görünür katmanları beyaz zeminli, metre ölçekli SVG olarak dışa aktarır. */
export function exportSvg(doc: Drawing): string {
  const ents = doc.visibleEntities();
  const boxes = ents.map(entityBox).filter((b) => b !== null);
  const min = { x: Math.min(0, ...boxes.map((b) => b.min.x)), y: Math.min(0, ...boxes.map((b) => b.min.y)) };
  const max = { x: Math.max(1, ...boxes.map((b) => b.max.x)), y: Math.max(1, ...boxes.map((b) => b.max.y)) };
  const pad = Math.max(max.x - min.x, max.y - min.y) * 0.05;
  const W = max.x - min.x + 2 * pad;
  const H = max.y - min.y + 2 * pad;
  // SVG'de Y aşağı doğrudur; dünya koordinatlarını çevir.
  const P = (p: Vec2) => `${(p.x - min.x + pad).toFixed(4)},${(max.y - p.y + pad).toFixed(4)}`;
  const sw = (W / 1000).toFixed(4);
  const parts: string[] = [];
  for (const e of ents) {
    const color = darken(doc.layer(e.layer)?.color ?? "#000");
    const stroke = `stroke="${color}" stroke-width="${sw}" fill="none"`;
    switch (e.type) {
      case "line":
        parts.push(`<polyline points="${P(e.a)} ${P(e.b)}" ${stroke}/>`);
        break;
      case "polyline":
        parts.push(`<${e.closed ? "polygon" : "polyline"} points="${e.points.map(P).join(" ")}" ${stroke}/>`);
        break;
      case "circle": {
        const [cx, cy] = P(e.center).split(",");
        parts.push(`<circle cx="${cx}" cy="${cy}" r="${e.radius}" ${stroke}/>`);
        break;
      }
      case "text": {
        const [x, y] = P(e.position).split(",");
        parts.push(`<text x="${x}" y="${y}" font-size="${e.height}" font-family="sans-serif" fill="${color}">${esc(e.text)}</text>`);
        break;
      }
      case "dimension": {
        const [p1, p2] = dimensionLine(e);
        parts.push(`<polyline points="${P(e.a)} ${P(p1)} ${P(p2)} ${P(e.b)}" ${stroke}/>`);
        const [x, y] = P(mid(p1, p2)).split(",");
        let rot = -angleDeg(p1, p2);
        if (rot < -90 && rot >= -270) rot += 180;
        parts.push(
          `<text x="${x}" y="${y}" font-size="${(W / 80).toFixed(3)}" text-anchor="middle" fill="${color}" transform="rotate(${rot.toFixed(2)} ${x} ${y})" dy="-0.3em">${dist(e.a, e.b).toFixed(2)}</text>`,
        );
        break;
      }
    }
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W.toFixed(3)}m" height="${H.toFixed(3)}m" viewBox="0 0 ${W.toFixed(4)} ${H.toFixed(4)}">
<rect width="100%" height="100%" fill="#fff"/>
${parts.join("\n")}
</svg>
`;
}

/** Koyu ekran renklerini beyaz kağıtta okunur hale getirir. */
function darken(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return "#000";
  const n = parseInt(m[1], 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return 0.299 * r + 0.587 * g + 0.114 * b > 200 ? "#000" : hex;
}
