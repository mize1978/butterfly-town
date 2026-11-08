import { describe, expect, it } from "vitest";
import { TOWN } from "../test/town";
import { WALK } from "./motion";
import { Sim } from "./sim";
import { allowed, DEAD_ZONE } from "./world";

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

describe("目的地を決めて歩く（goTo：タップした場所まで歩く）", () => {
  it("離さなくても目的地まで歩き、着いたら止まって目的地を消す", () => {
    const s = new Sim(TOWN), to = { x: TOWN.spawn.x + 200, y: TOWN.spawn.y };
    s.goTo(to);
    run(s, 3);
    expect(Math.hypot(s.pos.x - to.x, s.pos.y - to.y)).toBeLessThan(DEAD_ZONE + 1);
    expect(s.target).toBeNull();
    expect(s.moving).toBe(false);
  });
  it("斜めの目的地でも、手前で止まったまま「向かっている」状態が残らない（実測：1080,510 へ向かうと 9.0000…で止まった）", () => {
    const s = new Sim(TOWN);
    s.pos = { x: 824.2776578946218, y: 552.6577987715784 }; // 見本で実際に歩き始めた位置
    s.goTo({ x: 1080, y: 510 });
    run(s, 4);
    expect(s.moving).toBe(false);
    expect(s.target).toBeNull();
  });
  it("歩ける範囲の外を目的地にしても、壁で止まって目的地を消す（押し続けない）", () => {
    const s = new Sim(TOWN);
    s.goTo({ x: TOWN.spawn.x, y: 0 });
    run(s, 8);
    expect(s.target).toBeNull();
    expect(s.moving).toBe(false);
  });
  it("途中で別の場所を押すと、そちらへ行き先が変わる", () => {
    const s = new Sim(TOWN), a = { x: TOWN.spawn.x + 200, y: TOWN.spawn.y }, b = { x: TOWN.spawn.x - 200, y: TOWN.spawn.y };
    s.goTo(a);
    run(s, 0.5);
    s.goTo(b);
    run(s, 4);
    expect(Math.hypot(s.pos.x - b.x, s.pos.y - b.y)).toBeLessThan(DEAD_ZONE + 1);
  });
  it("halt（会話を開くなど）で目的地も消え、再開しても勝手に歩き出さない", () => {
    const s = new Sim(TOWN);
    s.goTo({ x: TOWN.spawn.x + 200, y: TOWN.spawn.y });
    run(s, 0.3);
    s.halt();
    const at = { ...s.pos };
    run(s, 1);
    expect(s.target).toBeNull();
    expect(s.pos).toEqual(at);
  });
});

describe("相手の方を向く（faceToward：会話を始めたとき）", () => {
  it("止まったまま、相手のいる方向へ向きだけ変える", () => {
    const s = new Sim(TOWN);
    const at = { ...s.pos };
    s.faceToward({ x: at.x - 80, y: at.y }); // 左にいる相手
    expect(s.heading).toBe("w");
    expect(s.facing).toBe(-1);
    s.faceToward({ x: at.x + 60, y: at.y - 60 }); // 右上にいる相手
    expect(s.heading).toBe("ne");
    expect(s.facing).toBe(1);
    expect(s.pos).toEqual(at);
    expect(s.moving).toBe(false);
  });
});
