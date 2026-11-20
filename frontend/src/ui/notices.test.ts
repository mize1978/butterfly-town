import { describe, expect, it } from "vitest";
import { noticeList, setNotice } from "./notices";

describe("トップの案内（setNotice・noticeList）", () => {
  it("街の確認とログイン状態の確認が両方失敗しても、両方の案内を残す（後から返った方で上書きしない）", () => {
    let n = setNotice({}, "town", "サーバーに接続できませんでした。「ゲストで遊ぶ」を押すと、もう一度つなぎます。");
    n = setNotice(n, "account", "サーバーに接続できませんでした。ログインの状態を確かめられませんでした。");
    expect(noticeList(n)).toHaveLength(2);
    // 逆の順に返っても同じ
    let m = setNotice({}, "account", "a");
    m = setNotice(m, "town", "t");
    expect(noticeList(m)).toEqual(["t", "a"]);
  });

  it("片方を消しても、もう片方は残る", () => {
    const n = setNotice(setNotice({}, "town", "t"), "account", "a");
    expect(noticeList(setNotice(n, "account", null))).toEqual(["t"]);
  });
});
