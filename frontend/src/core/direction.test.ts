import { describe, expect, it } from "vitest";
import { classify, sheetFor, type SheetDir } from "./direction";

describe("進む方向（8方向）", () => {
  it("画面の向き（y は下向き）から8方向を決める。街の斜めの道（横3:縦2）は斜めになる", () => {
    expect([classify(1, 0), classify(-1, 0), classify(0, 1), classify(0, -1)]).toEqual(["e", "w", "s", "n"]);
    expect([classify(3, 2), classify(-3, 2), classify(3, -2), classify(-3, -2)]).toEqual(["se", "sw", "ne", "nw"]);
  });

  it("境界付近では前の方向を保ち、細かく切り替わらない", () => {
    const at = (deg: number) => [Math.cos((deg * Math.PI) / 180), Math.sin((deg * Math.PI) / 180)] as const;
    expect(classify(...at(24))).toBe("se");
    expect(classify(...at(24), "e")).toBe("e");
    expect(classify(...at(30), "e")).toBe("e"); // 境界 22.5° に 8° ひいきした 30.5° までは前の方向
    expect(classify(...at(31), "e")).toBe("se");
    expect(classify(...at(40), "e")).toBe("se");
  });

  it("方向に合うシートが無ければ近い向きで代用する", () => {
    const side: ReadonlySet<SheetDir> = new Set(["side"]);
    expect(sheetFor("se", side)).toEqual({ sheet: "side", fallback: true });
    expect(sheetFor("e", side)).toEqual({ sheet: "side", fallback: false });
  });
});
