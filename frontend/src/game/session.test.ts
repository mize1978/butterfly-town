import { describe, expect, it } from "vitest";
import { TOWN } from "../test/town";
import { allowed } from "../core/world";
import { SAMPLE_RESIDENT, TALK_RANGE } from "./sample-resident";
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

describe("仮の住民に話しかけられる距離", () => {
  const r = SAMPLE_RESIDENT.pos;

  it("住民は歩ける範囲にいて、出現位置からは少し歩かないと届かない", () => {
    expect(allowed(TOWN, r.x, r.y)).toBe(true);
    expect(Math.hypot(r.x - TOWN.spawn.x, r.y - TOWN.spawn.y)).toBeGreaterThan(TALK_RANGE);
    expect(new Session(TOWN).nearResident).toBe(false);
  });

  it("住民の方へ歩くと近くにいる状態になり、知らせは変わったときに1回だけ届く", () => {
    const s = new Session(TOWN);
    let calls = 0;
    s.subscribe(() => calls++);
    s.press(r);
    run(s, 3);
    expect(s.nearResident).toBe(true);
    expect(calls).toBe(1);
  });

  it("会話中（止めている間）は住民の近くから動かず、閉じると同じ位置から続く", () => {
    const s = new Session(TOWN);
    s.press(r);
    run(s, 3);
    s.release();
    run(s, 0.5);
    const at = { ...s.sim.pos };
    s.pause();
    s.press(TOWN.spawn);
    run(s, 2);
    s.resume();
    expect(s.sim.pos).toEqual(at);
    expect(s.nearResident).toBe(true);
  });
});
