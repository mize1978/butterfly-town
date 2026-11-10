import { describe, expect, it } from "vitest";
import { TOWN } from "../test/town";
import { follow, VIEW_SIZE, viewTarget } from "./camera";

describe("カメラ", () => {
  it("人物を中央付近に映し、街の外は映さない", () => {
    const v = viewTarget(TOWN, TOWN.spawn);
    expect(v.w).toBe(VIEW_SIZE.w);
    expect(v.x).toBeGreaterThanOrEqual(0);
    expect(v.x + v.w).toBeLessThanOrEqual(TOWN.size.width);
    const corner = viewTarget(TOWN, { x: TOWN.size.width, y: TOWN.size.height });
    expect(corner.x + corner.w).toBe(TOWN.size.width);
    expect(corner.y + corner.h).toBe(TOWN.size.height);
  });

  it("街が映す範囲より小さければ、街全体を映す", () => {
    const small = { ...TOWN, size: { width: 800, height: 500 } };
    expect(viewTarget(small, { x: 400, y: 250 })).toEqual({ x: 0, y: 0, w: 800, h: 500 });
  });

  it("少し遅れて追い、時間が経てば追いつく", () => {
    const from = viewTarget(TOWN, TOWN.spawn), to = { x: TOWN.spawn.x + 300, y: TOWN.spawn.y };
    const step = follow(TOWN, from, to, 1 / 60);
    expect(step.x).toBeGreaterThan(from.x);
    expect(step.x).toBeLessThan(viewTarget(TOWN, to).x);
    let v = from;
    for (let i = 0; i < 120; i++) v = follow(TOWN, v, to, 1 / 60);
    expect(v.x).toBeCloseTo(viewTarget(TOWN, to).x, 1);
  });
});
