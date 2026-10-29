import { Vec2, add, boxOf, Box, distToSegment, dist, mid, normalize, perp, scale, sub } from "./geometry";

interface Base {
  id: string;
  layer: string;
}

export interface LineEntity extends Base {
  type: "line";
  a: Vec2;
  b: Vec2;
}

export interface PolylineEntity extends Base {
  type: "polyline";
  points: Vec2[];
  closed: boolean;
}

export interface CircleEntity extends Base {
  type: "circle";
  center: Vec2;
  radius: number;
}

export interface TextEntity extends Base {
  type: "text";
  position: Vec2;
  text: string;
  /** Yazı yüksekliği (metre). */
  height: number;
}

/** Hizalı ölçü: a ve b ölçülen noktalar, offset ölçü çizgisinin a→b'ye dik uzaklığı. */
export interface DimensionEntity extends Base {
  type: "dimension";
  a: Vec2;
  b: Vec2;
  offset: number;
}

export type Entity = LineEntity | PolylineEntity | CircleEntity | TextEntity | DimensionEntity;
export type EntityType = Entity["type"];

let counter = 0;
export function newId(): string {
  counter += 1;
  return `${Date.now().toString(36)}-${counter.toString(36)}`;
}

/** Ölçü çizgisinin iki ucu (uzatma çizgilerinin bittiği yer). */
export function dimensionLine(d: DimensionEntity): [Vec2, Vec2] {
  const n = scale(perp(normalize(sub(d.b, d.a))), d.offset);
  return [add(d.a, n), add(d.b, n)];
}

export function entityPoints(e: Entity): Vec2[] {
  switch (e.type) {
    case "line":
      return [e.a, e.b];
    case "polyline":
      return e.points;
    case "circle":
      return [
        { x: e.center.x - e.radius, y: e.center.y - e.radius },
        { x: e.center.x + e.radius, y: e.center.y + e.radius },
      ];
    case "text":
      return [e.position, { x: e.position.x + e.text.length * e.height * 0.6, y: e.position.y + e.height }];
    case "dimension":
      return [e.a, e.b, ...dimensionLine(e)];
  }
}

export const entityBox = (e: Entity): Box | null => boxOf(entityPoints(e));

/** Nesnenin p noktasına olan uzaklığı (seçim için). */
export function hitDistance(e: Entity, p: Vec2): number {
  switch (e.type) {
    case "line":
      return distToSegment(p, e.a, e.b);
    case "polyline": {
      let best = Infinity;
      const pts = e.points;
      for (let i = 1; i < pts.length; i++) best = Math.min(best, distToSegment(p, pts[i - 1], pts[i]));
      if (e.closed && pts.length > 2) best = Math.min(best, distToSegment(p, pts[pts.length - 1], pts[0]));
      return best;
    }
    case "circle":
      return Math.abs(dist(p, e.center) - e.radius);
    case "text": {
      const b = entityBox(e)!;
      const inside = p.x >= b.min.x && p.x <= b.max.x && p.y >= b.min.y && p.y <= b.max.y;
      return inside ? 0 : dist(p, e.position);
    }
    case "dimension": {
      const [p1, p2] = dimensionLine(e);
      return Math.min(distToSegment(p, p1, p2), distToSegment(p, e.a, p1), distToSegment(p, e.b, p2));
    }
  }
}

export type SnapKind = "end" | "mid" | "center" | "grid";
export interface SnapPoint {
  p: Vec2;
  kind: SnapKind;
}

/** Nesne kenetleme (OSNAP) adayları. */
export function snapPoints(e: Entity): SnapPoint[] {
  const out: SnapPoint[] = [];
  const segs = (pts: Vec2[], closed: boolean) => {
    pts.forEach((p) => out.push({ p, kind: "end" }));
    for (let i = 1; i < pts.length; i++) out.push({ p: mid(pts[i - 1], pts[i]), kind: "mid" });
    if (closed && pts.length > 2) out.push({ p: mid(pts[pts.length - 1], pts[0]), kind: "mid" });
  };
  switch (e.type) {
    case "line":
      segs([e.a, e.b], false);
      break;
    case "polyline":
      segs(e.points, e.closed);
      break;
    case "circle":
      out.push({ p: e.center, kind: "center" });
      for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]])
        out.push({ p: { x: e.center.x + dx * e.radius, y: e.center.y + dy * e.radius }, kind: "end" });
      break;
    case "text":
      out.push({ p: e.position, kind: "end" });
      break;
    case "dimension":
      out.push({ p: e.a, kind: "end" }, { p: e.b, kind: "end" });
      break;
  }
  return out;
}

export function translate(e: Entity, d: Vec2): Entity {
  switch (e.type) {
    case "line":
      return { ...e, a: add(e.a, d), b: add(e.b, d) };
    case "polyline":
      return { ...e, points: e.points.map((p) => add(p, d)) };
    case "circle":
      return { ...e, center: add(e.center, d) };
    case "text":
      return { ...e, position: add(e.position, d) };
    case "dimension":
      return { ...e, a: add(e.a, d), b: add(e.b, d) };
  }
}

export const ENTITY_LABELS: Record<EntityType, string> = {
  line: "Çizgi",
  polyline: "Çoklu çizgi",
  circle: "Daire",
  text: "Yazı",
  dimension: "Ölçü",
};
