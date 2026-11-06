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
    // 知らせは「歩いた」の合図でも届くので、近さが変わった回数だけを数える
    let changes = 0, last = s.nearResident;
    s.subscribe(() => { if (s.nearResident !== last) { changes++; last = s.nearResident; } });
    s.press(r);
    run(s, 3);
    expect(s.nearResident).toBe(true);
    expect(changes).toBe(1);
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

describe("スマホで住民をタップしたとき", () => {
  const onResident = { x: SAMPLE_RESIDENT.pos.x, y: SAMPLE_RESIDENT.pos.y - 80 };

  it("住民に当たったら選ぶだけで、主人公は歩き出さない", () => {
    const s = new Session(TOWN);
    expect(s.tapResident(onResident)).toBe(true);
    run(s, 1);
    expect(s.residentSelected).toBe(true);
    expect(s.sim.pos).toEqual(TOWN.spawn);
    expect(s.sim.target).toBeNull();
  });

  it("頭の上の名札をタップしても選べる", () => {
    const s = new Session(TOWN);
    expect(s.tapResident({ x: SAMPLE_RESIDENT.pos.x, y: SAMPLE_RESIDENT.pos.y - 225 })).toBe(true);
    expect(s.sim.target).toBeNull();
  });

  it("住民から外れたタップは選ばない（そのあと地面を押せば歩く）", () => {
    const s = new Session(TOWN);
    expect(s.tapResident(east)).toBe(false);
    expect(s.residentSelected).toBe(false);
  });

  it("地面を押すと選択が外れ、話せる距離を離れても外れる", () => {
    const s = new Session(TOWN);
    s.tapResident(onResident);
    s.press(east);
    expect(s.residentSelected).toBe(false);
  });

  it("止めている間（メニュー・会話中）は選ばない", () => {
    const s = new Session(TOWN);
    s.pause();
    expect(s.tapResident(onResident)).toBe(false);
  });

  it("話せる距離は今までどおり 120", () => {
    expect(TALK_RANGE).toBe(120);
  });

  it("一度歩くと「歩いた」になる（移動の説明を消す合図）", () => {
    const s = new Session(TOWN);
    expect(s.hasWalked).toBe(false);
    s.press(east);
    run(s, 0.3);
    expect(s.hasWalked).toBe(true);
  });
});
