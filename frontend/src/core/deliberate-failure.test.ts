import { expect, it } from "vitest";

// Issue #21 の確認用。CI が失敗した PR をマージできないことを確かめるため、わざと落とす。この PR はマージしない
it("わざと失敗させる（#21 の確認用）", () => {
  expect(1).toBe(2);
});
