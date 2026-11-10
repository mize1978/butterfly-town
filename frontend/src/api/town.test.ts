import { afterEach, describe, expect, it, vi } from "vitest";
import festival from "../../../backend/config/towns/festival-street.json";
import { fetchTown, parseTown, TownLoadError } from "./town";

const clone = () => structuredClone(festival) as Record<string, unknown>;

describe("街の地図の検証（parseTown）", () => {
  it("Rails が返す地図（backend/config/towns）をそのまま受け取れる", () => {
    const t = parseTown(festival);
    expect(t.id).toBe("festival-street");
    expect(t.size).toEqual({ width: 1536, height: 1024 });
    expect(t.spawn).toEqual({ x: 930, y: 625 });
    expect(t.walkable.length).toBeGreaterThanOrEqual(3);
  });

  it.each([
    ["オブジェクトでない", () => [1, 2]],
    ["歩ける範囲が2点しかない", () => ({ ...clone(), walkable: [[0, 0], [1, 1]] })],
    ["座標が数値でない", () => ({ ...clone(), foreground: [[0, 0], ["a", 1], [2, 2]] })],
    ["大きさが0", () => ({ ...clone(), size: { width: 0, height: 1024 } })],
    ["出現位置が無い", () => { const b = clone(); delete b.spawn; return b; }],
    ["出現位置が歩ける範囲の外", () => ({ ...clone(), spawn: { x: 10, y: 10 } })]
  ])("%s 地図は描画の前に失敗にする", (_name, body) => {
    expect(() => parseTown(body())).toThrow(TownLoadError);
  });
});

describe("街の地図の取得（fetchTown）", () => {
  afterEach(() => { vi.unstubAllGlobals(); });
  const stub = (impl: () => Promise<Response>) => vi.stubGlobal("fetch", vi.fn(impl));

  it("GET /api/v1/town を呼び、検証した地図を返す", async () => {
    const f = vi.fn(async () => new Response(JSON.stringify(festival), { status: 200 }));
    vi.stubGlobal("fetch", f);
    await expect(fetchTown()).resolves.toMatchObject({ id: "festival-street" });
    expect(f).toHaveBeenCalledWith("/api/v1/town", expect.objectContaining({ headers: { Accept: "application/json" } }));
  });

  it("HTTP エラーは状態コードつきの失敗にする", async () => {
    stub(async () => new Response("", { status: 500 }));
    await expect(fetchTown()).rejects.toThrow("HTTP 500");
  });

  it("接続できないときは、接続の失敗として伝える", async () => {
    stub(async () => { throw new TypeError("Failed to fetch"); });
    await expect(fetchTown()).rejects.toThrow("サーバーに接続できませんでした");
  });

  it("JSON でない応答は失敗にする", async () => {
    stub(async () => new Response("<html>", { status: 200 }));
    await expect(fetchTown()).rejects.toThrow("JSON ではありません");
  });
});
