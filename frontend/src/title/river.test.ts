import { describe, expect, it } from "vitest";
import { inside } from "../core/world";
import { ART_SIZE, FLOW_DIR, RIVER } from "./river";

// 絵を見て確かめた地点（town.png の座標）
const WATER_POINTS = [[100, 580], [350, 720], [450, 850], [560, 980]] as const;
const DRY_POINTS = {
  橋のアーチ: [330, 620], 橋の右の付け根: [480, 720], 右の石の岸: [620, 880], 左の花壇: [60, 700],
  左の石の柱: [130, 820], 手前の植え込み: [330, 960], 石畳: [700, 700]
} as const;

describe("タイトルの川の範囲", () => {
  it("絵の中に収まっている", () => {
    for (const [x, y] of RIVER) {
      expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThanOrEqual(ART_SIZE.width);
      expect(y).toBeGreaterThanOrEqual(0); expect(y).toBeLessThanOrEqual(ART_SIZE.height);
    }
  });

  it("水面の地点は含み、橋・岸・植え込み・石畳は含まない（動くのは川だけ）", () => {
    for (const [x, y] of WATER_POINTS) expect(inside(x, y, RIVER), `水面 ${x},${y}`).toBe(true);
    for (const [name, [x, y]] of Object.entries(DRY_POINTS)) expect(inside(x, y, RIVER), name).toBe(false);
  });

  it("流れの向きは長さ1で、橋の下から手前（下）へ向かう", () => {
    expect(Math.hypot(FLOW_DIR.x, FLOW_DIR.y)).toBeCloseTo(1, 6);
    expect(FLOW_DIR.y).toBeGreaterThan(0);
  });
});
