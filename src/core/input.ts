import { Vec2 } from "./geometry";

export type CoordInput = { kind: "point"; p: Vec2 } | { kind: "length"; value: number };

const num = (s: string) => Number(s.trim().replace(/\s/g, ""));

/**
 * AutoCAD tarzı koordinat girişi:
 *   `x,y`     mutlak nokta
 *   `@dx,dy`  son noktaya göre göreli
 *   `@L<A`    göreli kutupsal (uzunluk < açı°)
 *   `L`       imleç yönünde uzunluk
 * Ondalık ayırıcı olarak nokta kullanılır (virgül koordinat ayırır).
 */
export function parseCoord(text: string, base?: Vec2): CoordInput | null {
  const s = text.trim();
  if (!s) return null;
  const rel = s.startsWith("@");
  const body = rel ? s.slice(1) : s;
  const origin = rel ? base ?? { x: 0, y: 0 } : { x: 0, y: 0 };

  const polar = body.split("<");
  if (polar.length === 2) {
    const L = num(polar[0]);
    const A = (num(polar[1]) * Math.PI) / 180;
    if (!Number.isFinite(L) || !Number.isFinite(A)) return null;
    return { kind: "point", p: { x: origin.x + L * Math.cos(A), y: origin.y + L * Math.sin(A) } };
  }

  const xy = body.split(",");
  if (xy.length === 2) {
    const x = num(xy[0]);
    const y = num(xy[1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return { kind: "point", p: { x: origin.x + x, y: origin.y + y } };
  }

  if (!rel && xy.length === 1) {
    const v = num(body);
    if (Number.isFinite(v)) return { kind: "length", value: v };
  }
  return null;
}
