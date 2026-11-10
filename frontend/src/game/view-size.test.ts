import { describe, expect, it } from "vitest";
import { TOWN } from "../test/town";
import { follow, VIEW_SIZE, viewTarget } from "../core/camera";
import { PHONE_MIN_VIEW, phoneViewSize } from "./view-size";
import { Session } from "./session";

const ratio = (w: number, h: number) => w / h;

describe("スマホで映す範囲", () => {
  it("縦画面では枠と同じ縦長の形で、横は最低範囲を映す", () => {
    const v = phoneViewSize(390, 620, TOWN);
    expect(v.w).toBe(PHONE_MIN_VIEW.w);
    expect(ratio(v.w, v.h)).toBeCloseTo(ratio(390, 620), 2);
    expect(v.h).toBeGreaterThan(v.w);
  });

  it("横画面では枠と同じ横長の形で、縦は最低範囲を映す", () => {
    const v = phoneViewSize(800, 260, TOWN);
    expect(v.h).toBe(PHONE_MIN_VIEW.h);
    expect(ratio(v.w, v.h)).toBeCloseTo(ratio(800, 260), 2);
  });

  it("街より大きくなる形では、形を保ったまま街に収める", () => {
    const v = phoneViewSize(1000, 120, TOWN);
    expect(v.w).toBeLessThanOrEqual(TOWN.size.width);
    expect(ratio(v.w, v.h)).toBeCloseTo(ratio(1000, 120), 1);
  });
});

describe("映す大きさを変えたとき", () => {
  it("PC の大きさは何も渡さなければ今までどおり 1100×660", () => {
    const s = new Session(TOWN);
    expect(s.view).toEqual(viewTarget(TOWN, TOWN.spawn));
    expect([s.view.w, s.view.h]).toEqual([Math.min(VIEW_SIZE.w, TOWN.size.width), Math.min(VIEW_SIZE.h, TOWN.size.height)]);
    expect(follow(TOWN, s.view, TOWN.spawn, 1 / 60)).toEqual(follow(TOWN, s.view, TOWN.spawn, 1 / 60, VIEW_SIZE));
  });

  it("画面の向きを変えると、人物を中心にすぐ映し直し、その後も同じ大きさで追う", () => {
    const s = new Session(TOWN), size = phoneViewSize(390, 620, TOWN);
    s.setViewSize(size);
    expect([s.view.w, s.view.h]).toEqual([size.w, size.h]);
    expect(s.view).toEqual(viewTarget(TOWN, s.sim.pos, size));
    for (let i = 0; i < 60; i++) s.tick(1 / 60);
    expect([s.view.w, s.view.h]).toEqual([size.w, size.h]);
  });
});
