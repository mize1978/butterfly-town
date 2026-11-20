import { describe, expect, it } from "vitest";
import { AccountCheck } from "./account-check";

describe("開いたときのログイン確認（AccountCheck）", () => {
  it("確認の返事より先にログイン・登録・ログアウトしたら、遅れて返った確認の結果は使わない", () => {
    const check = new AccountCheck();
    const first = check.begin(); // 開いたときの確認を送る
    check.changed(); // 返事が来る前に、画面からログインした
    expect(check.isCurrent(first)).toBe(false);
  });

  it("その間に何も起きなければ、確認の結果を使う", () => {
    const check = new AccountCheck();
    expect(check.isCurrent(check.begin())).toBe(true);
  });
});
