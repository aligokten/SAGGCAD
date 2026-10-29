// Temel 2B geometri yardımcıları. Dünya koordinatları metre cinsindendir, Y yukarı doğru artar.

export interface Vec2 {
  x: number;
  y: number;
}

export const vec = (x: number, y: number): Vec2 => ({ x, y });
export const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });
export const scale = (a: Vec2, s: number): Vec2 => ({ x: a.x * s, y: a.y * s });
export const dist = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y);
export const mid = (a: Vec2, b: Vec2): Vec2 => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
export const len = (a: Vec2): number => Math.hypot(a.x, a.y);

export function normalize(a: Vec2): Vec2 {
  const l = len(a);
  return l === 0 ? { x: 0, y: 0 } : { x: a.x / l, y: a.y / l };
}

/** Saat yönünün tersine 90° döndürülmüş vektör. */
export const perp = (a: Vec2): Vec2 => ({ x: -a.y, y: a.x });

/** a→b doğrultusunda açı (derece, 0° = +X, saat yönünün tersi pozitif). */
export function angleDeg(a: Vec2, b: Vec2): number {
  const d = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
  return d < 0 ? d + 360 : d;
}

/** p noktasının [a,b] doğru parçasına olan en kısa uzaklığı. */
export function distToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const ab = sub(b, a);
  const l2 = ab.x * ab.x + ab.y * ab.y;
  if (l2 === 0) return dist(p, a);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * ab.x + (p.y - a.y) * ab.y) / l2));
  return dist(p, { x: a.x + ab.x * t, y: a.y + ab.y * t });
}

/** Çokgen alanı (shoelace). Saat yönünün tersi sıralamada pozitiftir. */
export function polygonArea(points: Vec2[]): number {
  let s = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    s += a.x * b.y - b.x * a.y;
  }
  return s / 2;
}

export function polylineLength(points: Vec2[], closed: boolean): number {
  let s = 0;
  for (let i = 1; i < points.length; i++) s += dist(points[i - 1], points[i]);
  if (closed && points.length > 2) s += dist(points[points.length - 1], points[0]);
  return s;
}

/** b noktasını a'ya göre en yakın yatay ya da düşey doğrultuya hizalar (ORTO). */
export function orthoSnap(a: Vec2, b: Vec2): Vec2 {
  return Math.abs(b.x - a.x) >= Math.abs(b.y - a.y) ? { x: b.x, y: a.y } : { x: a.x, y: b.y };
}

export interface Box {
  min: Vec2;
  max: Vec2;
}

export function boxOf(points: Vec2[]): Box | null {
  if (points.length === 0) return null;
  const min = { x: Infinity, y: Infinity };
  const max = { x: -Infinity, y: -Infinity };
  for (const p of points) {
    min.x = Math.min(min.x, p.x);
    min.y = Math.min(min.y, p.y);
    max.x = Math.max(max.x, p.x);
    max.y = Math.max(max.y, p.y);
  }
  return { min, max };
}

export const boxContains = (b: Box, p: Vec2): boolean =>
  p.x >= b.min.x && p.x <= b.max.x && p.y >= b.min.y && p.y <= b.max.y;
