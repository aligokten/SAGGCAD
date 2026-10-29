import { describe, expect, it } from "vitest";
import { angleDeg, distToSegment, orthoSnap, polygonArea, polylineLength } from "../src/core/geometry";
import { parseCoord } from "../src/core/input";
import { Viewport } from "../src/view/viewport";

describe("geometri", () => {
  it("dikdörtgen alanı ve çevresi", () => {
    const sq = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }, { x: 0, y: 3 }];
    expect(polygonArea(sq)).toBe(12);
    expect(polylineLength(sq, true)).toBe(14);
    expect(polylineLength(sq, false)).toBe(11);
  });

  it("noktanın doğru parçasına uzaklığı", () => {
    expect(distToSegment({ x: 2, y: 3 }, { x: 0, y: 0 }, { x: 4, y: 0 })).toBe(3);
    expect(distToSegment({ x: 7, y: 4 }, { x: 0, y: 0 }, { x: 4, y: 0 })).toBe(5);
  });

  it("açı ve ORTO", () => {
    expect(angleDeg({ x: 0, y: 0 }, { x: 0, y: -1 })).toBe(270);
    expect(orthoSnap({ x: 0, y: 0 }, { x: 5, y: 1 })).toEqual({ x: 5, y: 0 });
    expect(orthoSnap({ x: 0, y: 0 }, { x: 1, y: 5 })).toEqual({ x: 0, y: 5 });
  });
});

describe("koordinat girişi", () => {
  const base = { x: 10, y: 5 };
  it("mutlak, göreli, kutupsal ve uzunluk", () => {
    expect(parseCoord("3,4", base)).toEqual({ kind: "point", p: { x: 3, y: 4 } });
    expect(parseCoord("@3,-1", base)).toEqual({ kind: "point", p: { x: 13, y: 4 } });
    const polar = parseCoord("@2<90", base);
    expect(polar?.kind).toBe("point");
    if (polar?.kind === "point") {
      expect(polar.p.x).toBeCloseTo(10);
      expect(polar.p.y).toBeCloseTo(7);
    }
    expect(parseCoord("2.75", base)).toEqual({ kind: "length", value: 2.75 });
    expect(parseCoord("abc", base)).toBeNull();
  });
});

describe("görünüm", () => {
  it("dünya ↔ ekran dönüşümü tutarlı", () => {
    const v = new Viewport();
    v.width = 800;
    v.height = 600;
    v.center = { x: 3, y: -2 };
    v.zoom = 37;
    const p = { x: 1.25, y: 4.5 };
    const back = v.toWorld(v.toScreen(p));
    expect(back.x).toBeCloseTo(p.x);
    expect(back.y).toBeCloseTo(p.y);
  });

  it("imleç altındaki nokta yakınlaştırmada sabit kalır", () => {
    const v = new Viewport();
    v.width = 800;
    v.height = 600;
    const s = { x: 100, y: 450 };
    const before = v.toWorld(s);
    v.zoomAt(s, 2.5);
    const after = v.toWorld(s);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });
});
