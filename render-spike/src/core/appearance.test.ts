import { describe, expect, it } from "vitest";
import { ART_FILES, CHARACTERS, OUTFITS, gaitFrame, resolve } from "./appearance";

describe("外見の解決", () => {
  it("全組み合わせ（人物×衣装×徒歩・歩行4コマ・乗車）で、同じ人物と衣装の画像を選ぶ", () => {
    for (const c of CHARACTERS) for (const o of OUTFITS) {
      const idle = resolve(c, o, false, false, 0);
      expect(idle.texture).toBe(`${c}-${o}`);
      for (let d = 0; d < 88; d += 22) {
        const w = resolve(c, o, false, true, d);
        expect(w.texture).toBe(`${c}-walk-${o}`);
        expect(w.rect).not.toBeNull();
      }
      const ride = resolve(c, o, true, true, 50);
      expect(ride.texture).toBe(`${c}-ride-${o}`);
      expect(ride.frame).toBe(-1); // 乗車中は歩行コマを混ぜない
      for (const r of [idle, ride]) { expect(r.character).toBe(c); expect(r.outfit).toBe(o); }
      for (const r of [idle, ride]) expect(ART_FILES).toContain(r.texture);
    }
  });

  it("22座標ごとに次のコマ、88で1周期。停止中は立ち姿", () => {
    expect([0, 22, 44, 66, 88].map((d) => gaitFrame(d, true, false))).toEqual([0, 1, 2, 3, 0]);
    expect(gaitFrame(30, false, false)).toBe(-1);
    expect(gaitFrame(30, true, true)).toBe(-1);
  });
});
