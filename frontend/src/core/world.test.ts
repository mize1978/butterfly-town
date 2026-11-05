import { describe, expect, it } from "vitest";
import { TOWN } from "../test/town";
import { allowed, inside, moveAlong, WALK_RADIUS } from "./world";

describe("通行判定", () => {
  it("出現位置には立てる。歩ける範囲の外（建物・水路）には立てない", () => {
    expect(allowed(TOWN, TOWN.spawn.x, TOWN.spawn.y)).toBe(true);
    expect(allowed(TOWN, 100, 100)).toBe(false);
    expect(allowed(TOWN, 1500, 1000)).toBe(false);
  });

  it("中心が範囲内でも、足元の円がはみ出す位置には立てない", () => {
    const [x, y] = TOWN.walkable[0]; // 角の頂点のすぐ内側
    expect(inside(x + 3, y, TOWN.walkable) || inside(x + 3, y + 1, TOWN.walkable)).toBe(true);
    expect(allowed(TOWN, x + 3, y + 1, WALK_RADIUS)).toBe(false);
  });

  it("壁に向かって大きく進んでも、境界の手前で止まり、範囲を飛び越えない", () => {
    const r = moveAlong(TOWN, TOWN.spawn, 0, -1, 2000);
    expect(r.blocked).toBe(true);
    expect(allowed(TOWN, r.x, r.y)).toBe(true);
    expect(r.moved).toBeLessThan(2000);
  });
});
