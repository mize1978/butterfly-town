import { describe, expect, it } from "vitest";
import { AVAILABLE, pose, SPRITE_FILES, WALK_HEIGHT } from "./appearance";
import type { Dir } from "./direction";
import { WALK } from "./motion";
import { walkerActors, SETTLE } from "./walker";

const m = (heading: Dir, moving = true, extra = {}) => ({ pos: { x: 100, y: 200 }, facing: 1, moving, gaitDistance: 40, speedRatio: 1, heading, ...extra });

describe("外見の解決（女の子・アイボリー）", () => {
  it("横・斜め前・斜め後ろ・正面の歩行シートと、5方向の待機姿勢を読み込む", () => {
    expect([...AVAILABLE].sort()).toEqual(["ne", "s", "se", "side"]);
    expect(SPRITE_FILES).toHaveLength(9);
  });

  it.each<[Dir, string, boolean]>([
    ["e", "girl-walk-base", false], ["w", "girl-walk-base", true],
    ["se", "girl-walk-se-base", false], ["sw", "girl-walk-se-base", true],
    ["ne", "girl-walk-ne-base", false], ["nw", "girl-walk-ne-base", true],
    ["s", "girl-walk-s-base", false]
  ])("進む方向 %s では %s を使い、反転は %s", (dir, texture, flip) => {
    const p = pose(m(dir), WALK);
    expect(p.texture).toBe(texture);
    expect(p.flip).toBe(flip);
    expect(p.fallback).toBe(false);
  });

  it("背面の歩行素材は無いので、真上へは斜め後ろのシートで代用し、代用と示す", () => {
    const p = pose(m("n"), WALK);
    expect(p.texture).toBe("girl-walk-ne-base");
    expect(p.fallback).toBe(true);
  });

  it("止まると、向きに合った待機姿勢で立つ（左向きは右向きの絵の反転）", () => {
    expect(pose(m("w", false), WALK)).toMatchObject({ texture: "girl-idle-e-base", flip: true, y: 200 });
    expect(pose(m("s", false), WALK)).toMatchObject({ texture: "girl-idle-s-base", flip: false });
  });

  it("どのコマも頭頂〜足裏が同じ高さになる倍率で描く", () => {
    for (let d = 0; d < 128; d += 8) {
      const p = pose(m("e", true, { gaitDistance: d }), WALK);
      const shown = (p.height * p.originY); // 切り出し範囲の上端〜足裏の表示上の高さ
      expect(shown).toBeCloseTo(WALK_HEIGHT, 5);
    }
  });

  it(`止まった直後の ${SETTLE} 秒は歩行の接地コマから待機姿勢へ重ねて替え、その後は待機姿勢だけ`, () => {
    const at = (stillFor: number) => walkerActors({ ...m("e", false), stillFor }, WALK);
    const mid = at(SETTLE / 2);
    expect(mid.map((a) => a.key)).toEqual(["settle", "player"]);
    expect(mid[0].pose.texture).toBe("girl-walk-base");
    expect(mid[0].alpha + mid[1].alpha).toBeCloseTo(1, 5);
    expect(at(SETTLE + 0.01).map((a) => a.key)).toEqual(["player"]);
  });
});
