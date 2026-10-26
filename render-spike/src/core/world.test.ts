// Art Prototype 02 の engine.test.mjs と同じ検査を、移植した TypeScript 版に対して行う
import { describe, expect, it } from "vitest";
import { advance, allowed, RIDE_SPEED, SPAWN, WALK_SPEED } from "./world";

describe("通行判定と移動（AP02 から移植）", () => {
  it("開始位置は歩ける。水路・建物は歩けない", () => {
    expect(allowed(SPAWN.x, SPAWN.y)).toBe(true);
    expect(allowed(200, 850)).toBe(false); // 水路
    expect(allowed(500, 300)).toBe(false); // 建物
  });

  it("全方向へ押し続けても、通行範囲から出ない（徒歩・乗車）", () => {
    let checks = 0;
    for (const ride of [false, true]) {
      for (let a = 0; a < Math.PI * 2; a += 0.07) {
        let p = { ...SPAWN };
        for (let i = 0; i < 100; i++) {
          p = advance(p, { x: SPAWN.x + Math.cos(a) * 2000, y: SPAWN.y + Math.sin(a) * 2000 }, 0.05, ride);
          expect(allowed(p.x, p.y, ride ? 22 : 12)).toBe(true);
          checks++;
        }
      }
    }
    expect(checks).toBeGreaterThan(17000);
  });

  it("実際に動き、長いフレーム時間は制限され、乗車は設定比だけ速い", () => {
    const w = advance(SPAWN, { x: 1250, y: 500 }, 0.05, false), r = advance(SPAWN, { x: 1250, y: 500 }, 0.05, true);
    expect(w.moved).toBeGreaterThan(0);
    expect(advance(SPAWN, { x: 1250, y: 500 }, 10, true).moved).toBeLessThan(13);
    expect(r.moved / w.moved).toBeCloseTo(RIDE_SPEED / WALK_SPEED, 9);
    expect(advance(SPAWN, { x: SPAWN.x + 1, y: SPAWN.y }, 0.05, false).moved).toBe(0); // 不感帯
  });

  it("ランダムな目標10,000回でも範囲内に留まる", () => {
    let seed = 42, p = { ...SPAWN };
    const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
    for (let i = 0; i < 10000; i++) {
      p = advance(p, { x: rnd() * 1536, y: rnd() * 1024 }, 0.03, i % 2 === 0);
      expect(allowed(p.x, p.y, 12)).toBe(true);
    }
  });
});
