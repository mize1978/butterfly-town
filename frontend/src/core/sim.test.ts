import { describe, expect, it } from "vitest";
import { TOWN } from "../test/town";
import { WALK } from "./motion";
import { Sim } from "./sim";
import { allowed } from "./world";

const run = (s: Sim, sec: number, dt = 1 / 60) => { for (let t = 0; t < sec; t += dt) s.step(dt); };

describe("徒歩の移動", () => {
  it("出現位置から始まり、押している地点の方へ歩く", () => {
    const s = new Sim(TOWN);
    expect(s.pos).toEqual(TOWN.spawn);
    s.press({ x: TOWN.spawn.x + 200, y: TOWN.spawn.y });
    run(s, 0.5);
    expect(s.pos.x).toBeGreaterThan(TOWN.spawn.x + 40);
    expect(s.moving).toBe(true);
    expect(s.heading).toBe("e");
  });

  it(`${WALK.accel}秒で最高速度 ${WALK.walkSpeed} に達し、それより速くならない`, () => {
    const s = new Sim(TOWN);
    s.press({ x: TOWN.spawn.x + 300, y: TOWN.spawn.y });
    run(s, WALK.accel + 0.02);
    expect(s.speed).toBeCloseTo(WALK.walkSpeed, 5);
    run(s, 0.3);
    expect(s.speed).toBeLessThanOrEqual(WALK.walkSpeed);
  });

  it("離すと減速して止まり、止まると接地コマの距離にそろう", () => {
    const s = new Sim(TOWN);
    s.press({ x: TOWN.spawn.x + 300, y: TOWN.spawn.y });
    run(s, 0.5);
    s.release();
    const at = s.pos.x;
    run(s, WALK.decel + 0.05);
    expect(s.moving).toBe(false);
    expect(s.pos.x - at).toBeLessThan(10); // 離してからの滑りは小さい
    expect(s.gaitDistance % (WALK.frameDist * 2)).toBe(0);
  });

  it("押している地点で行き過ぎずに止まる", () => {
    const s = new Sim(TOWN), goal = { x: TOWN.spawn.x + 60, y: TOWN.spawn.y };
    s.press(goal);
    run(s, 2);
    expect(s.moving).toBe(false);
    expect(s.pos.x).toBeLessThanOrEqual(goal.x);
  });

  it("ランダムな押し離しを続けても、歩ける範囲から出ない", () => {
    const s = new Sim(TOWN);
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 5000; i++) {
      if (i % 20 === 0) rnd() < 0.8 ? s.press({ x: rnd() * TOWN.size.width, y: rnd() * TOWN.size.height }) : s.release();
      s.step(rnd() * 0.08);
      expect(allowed(TOWN, s.pos.x, s.pos.y)).toBe(true);
    }
  });

  it("時間が大きく飛んでも、1回の更新で進む距離は上限で抑える", () => {
    const s = new Sim(TOWN);
    s.press({ x: TOWN.spawn.x + 300, y: TOWN.spawn.y });
    run(s, 0.5);
    const at = s.pos.x;
    s.step(5);
    expect(s.pos.x - at).toBeLessThanOrEqual(WALK.walkSpeed * 0.05 + 1e-9);
  });
});
