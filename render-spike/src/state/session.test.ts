import { describe, expect, it } from "vitest";
import { resolve } from "../core/appearance";
import { mismatches } from "./consistency";
import { Session } from "./session";
import type { Rendered } from "../render/types";

// 状態から正しく描いた場合の記録（照合の基準）
const drawn = (s: Session): Rendered => {
  const st = s.getState(), r = resolve(st.character, st.outfits[st.character], st.riding, s.sim.moving, s.sim.gaitDistance);
  return { texture: r.texture, frame: r.frame, flip: s.sim.facing < 0, x: s.sim.pos.x, y: s.sim.pos.y, frames: 1 };
};

describe("画面状態（React 側の正本）", () => {
  it("衣装は人物ごとに保持され、乗車・降車・人物の選び直しでも変わらない（男女で別の衣装）", () => {
    const s = new Session();
    s.select("girl"); s.enter(); s.setOutfit("alt");
    expect(s.toggleRide()).toBe(true);
    expect(s.getState().outfits.girl).toBe("alt");
    expect(s.toggleRide()).toBe(true);
    expect(s.getState().outfits.girl).toBe("alt");
    s.backToSelect(); s.select("boy"); s.enter();
    expect(s.getState().outfits).toEqual({ girl: "alt", boy: "base" });
    s.backToSelect(); s.select("girl"); s.enter();
    expect(s.getState().outfits).toEqual({ girl: "alt", boy: "base" });
  });

  it("狭い場所では乗れず、状態は変わらない", () => {
    const s = new Session(); s.enter();
    s.sim.pos = { x: 676, y: 640 }; // 通行範囲の端（徒歩は立てるが乗車の幅はない）
    expect(s.sim.canRide()).toBe(false);
    expect(s.toggleRide()).toBe(false);
    expect(s.getState().riding).toBe(false);
  });

  const transitions: [string, (s: Session) => void][] = [
    ["乗車", (s) => s.toggleRide()],
    ["降車", (s) => { s.toggleRide(); s.sim.press({ x: 1200, y: 500 }); s.toggleRide(); }],
    ["選択画面への移動", (s) => s.backToSelect()],
    ["描画方式の切り替え", (s) => s.setRenderer("canvas")]
  ];
  for (const [name, act] of transitions) {
    it(`${name}で、押していた入力は解除される`, () => {
      const s = new Session(); s.enter();
      s.sim.press({ x: 1200, y: 500 });
      act(s);
      expect(s.sim.target).toBeNull();
    });
  }

  it("状態と描画の照合：正しく描けば一致、画像・コマ・向き・位置のどれがずれても検出する", () => {
    const s = new Session(); s.enter(); s.setOutfit("alt");
    s.sim.press({ x: 1250, y: 500 });
    for (let i = 0; i < 8; i++) s.sim.step(0.05, false); // 歩行中（コマ>=0）
    expect(drawn(s).frame).toBeGreaterThanOrEqual(0);
    expect(mismatches(s.getState(), s.sim, drawn(s))).toEqual([]);
    const ok = drawn(s);
    expect(mismatches(s.getState(), s.sim, { ...ok, texture: "girl-walk-base" })).toHaveLength(1);
    expect(mismatches(s.getState(), s.sim, { ...ok, frame: (ok.frame + 1) % 4 })).toHaveLength(1);
    expect(mismatches(s.getState(), s.sim, { ...ok, flip: !ok.flip })).toHaveLength(1);
    expect(mismatches(s.getState(), s.sim, { ...ok, x: ok.x + 5 })).toHaveLength(1);
    expect(mismatches(s.getState(), s.sim, null)).toHaveLength(1);
    expect(s.toggleRide()).toBe(true);
    expect(mismatches(s.getState(), s.sim, ok).length).toBeGreaterThan(0); // 乗車したのに徒歩の絵
  });
});
