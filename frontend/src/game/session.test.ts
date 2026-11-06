import { describe, expect, it } from "vitest";
import { TOWN } from "../test/town";
import { Session } from "./session";

const run = (s: Session, sec: number, dt = 1 / 60) => { for (let t = 0; t < sec; t += dt) s.tick(dt); };
const east = { x: TOWN.spawn.x + 300, y: TOWN.spawn.y };

describe("メニューを開いている間の街", () => {
  it("開くと歩いている途中でもその場で止まり、それ以上進まない", () => {
    const s = new Session(TOWN);
    s.press(east);
    run(s, 0.5);
    s.pause();
    const at = { ...s.sim.pos };
    run(s, 1);
    expect(s.sim.pos).toEqual(at);
    expect(s.sim.moving).toBe(false);
  });

  it("開いている間に押しても歩かない", () => {
    const s = new Session(TOWN);
    s.pause();
    s.press(east);
    run(s, 1);
    expect(s.sim.pos).toEqual(TOWN.spawn);
    expect(s.sim.target).toBeNull();
  });

  it("閉じると同じ位置・同じ向き・同じカメラから続き、また歩ける", () => {
    const s = new Session(TOWN);
    s.press(east);
    run(s, 0.6);
    s.release();
    run(s, 2); // カメラが追いつくまで待つ
    const pos = { ...s.sim.pos }, heading = s.sim.heading, view = { ...s.view };
    s.pause();
    run(s, 2);
    s.resume();
    expect(s.sim.pos).toEqual(pos);
    expect(s.sim.heading).toBe(heading);
    expect(s.view.x).toBeCloseTo(view.x, 3);
    expect(s.view.y).toBeCloseTo(view.y, 3);
    expect(s.sim.pos).not.toEqual(TOWN.spawn);
    s.press(east);
    run(s, 0.3);
    expect(s.sim.pos.x).toBeGreaterThan(pos.x);
  });
});
