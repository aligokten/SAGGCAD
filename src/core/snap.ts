import { Drawing } from "./document";
import { SnapPoint, snapPoints } from "./entities";
import { Vec2, dist, orthoSnap } from "./geometry";

export interface SnapSettings {
  osnap: boolean;
  grid: boolean;
  ortho: boolean;
  gridStep: number;
}

/**
 * İmleç konumunu kenetleme kurallarına göre düzeltir.
 * Öncelik: nesne kenetleme > grid; ORTO yalnızca bir taban nokta varken uygulanır.
 */
export function resolveSnap(
  doc: Drawing,
  raw: Vec2,
  tolWorld: number,
  s: SnapSettings,
  base?: Vec2,
): { p: Vec2; snap?: SnapPoint } {
  if (s.osnap) {
    let best: SnapPoint | undefined;
    let bestD = tolWorld;
    for (const e of doc.visibleEntities()) {
      for (const sp of snapPoints(e)) {
        const d = dist(sp.p, raw);
        if (d < bestD) {
          bestD = d;
          best = sp;
        }
      }
    }
    if (best) return { p: best.p, snap: best };
  }
  let p = raw;
  if (s.ortho && base) p = orthoSnap(base, p);
  if (s.grid && s.gridStep > 0) {
    const g = s.gridStep;
    const snapped = { x: Math.round(p.x / g) * g, y: Math.round(p.y / g) * g };
    if (s.ortho && base) {
      // ORTO doğrultusunu bozmamak için yalnızca serbest ekseni yuvarla.
      if (p.y === base.y) snapped.y = base.y;
      else snapped.x = base.x;
    }
    return { p: snapped, snap: { p: snapped, kind: "grid" } };
  }
  return { p };
}
