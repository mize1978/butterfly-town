import { describe, expect, it } from "vitest";
import { Sim } from "./sim";
import { allowed } from "./world";

describe("長押しの移動", () => {
  it("押している間だけ進み、離すと止まる", () => {
    const s = new Sim(), start = { ...s.pos };
    s.step(0.05, false);
    expect(s.pos).toEqual(start); // 押していない
    s.press({ x: 1250, y: 500 });
    for (let i = 0; i < 10; i++) s.step(0.05, false);
    expect(s.moving).toBe(true);
    const moved = { ...s.pos };
    expect(Math.hypot(moved.x - start.x, moved.y - start.y)).toBeGreaterThan(40);
    s.release();
    for (let i = 0; i < 10; i++) s.step(0.05, false);
    expect(s.pos).toEqual(moved);
    expect(s.moving).toBe(false);
  });

  it("左へ押すと左向き（反転）、境界では止まり衝突を数える", () => {
    const s = new Sim();
    s.press({ x: 200, y: 850 }); // 水路の方向
    for (let i = 0; i < 400; i++) s.step(0.05, false);
    expect(s.facing).toBe(-1);
    expect(s.blocked).toBe(true);
    expect(s.collisions).toBeGreaterThan(0);
    expect(allowed(s.pos.x, s.pos.y)).toBe(true);
  });

  it("歩行コマは徒歩で移動したときだけ進む", () => {
    const s = new Sim();
    s.press({ x: 1250, y: 500 });
    for (let i = 0; i < 5; i++) s.step(0.05, true);
    expect(s.gaitDistance).toBe(0);
    for (let i = 0; i < 5; i++) s.step(0.05, false);
    expect(s.gaitDistance).toBeGreaterThan(0);
  });
});
