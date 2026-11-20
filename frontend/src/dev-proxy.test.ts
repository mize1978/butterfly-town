import { describe, expect, it } from "vitest";
import config from "../vite.config";

// 開発サーバーの /api の中継。Rails は登録・ログイン・ログアウトで、Sec-Fetch-Site の無い接続（LAN の http）では
// Origin と自分の URL を比べて他サイトからの要求を拒否する。中継が Host を書き換えると、同じ画面からの要求も別のサイトに見える
describe("開発サーバーの /api の中継", () => {
  it("Host を書き換えない（Rails が画面と同じ URL を自分の URL とみなす）", () => {
    const api = config.server?.proxy?.["/api"];
    expect(typeof api).toBe("object");
    expect((api as { changeOrigin?: boolean }).changeOrigin).toBe(false);
  });
});
