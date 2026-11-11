import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchPlaythrough, parsePlaythrough, PlaythroughError, startPlaythrough } from "./playthrough";

// Rails（PlaythroughsController#state）が返す形
const STATE = {
  status: "in_progress", time_index: 0, time_slots: 15, festival_progress: 0, interventions_left: 3,
  residents: [{ key: "a", location_key: "plaza" }, { key: "b", location_key: "home" }, { key: "c", location_key: "shop" }]
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe("街の状態の検証（parsePlaythrough）", () => {
  it("Rails が返す状態を受け取れる", () => {
    expect(parsePlaythrough(STATE)).toEqual({
      status: "in_progress", timeIndex: 0, timeSlots: 15, festivalProgress: 0, interventionsLeft: 3,
      residents: [{ key: "a", locationKey: "plaza" }, { key: "b", locationKey: "home" }, { key: "c", locationKey: "shop" }]
    });
  });

  it.each([
    ["オブジェクトでない", () => [1]],
    ["時間帯が数値でない", () => ({ ...STATE, time_index: "0" })],
    ["時間帯が範囲の外", () => ({ ...STATE, time_index: 15 })],
    ["介入の残りがない", () => { const b: Record<string, unknown> = { ...STATE }; delete b.interventions_left; return b; }],
    ["住民が配列でない", () => ({ ...STATE, residents: null })],
    ["住民の場所が文字列でない", () => ({ ...STATE, residents: [{ key: "a", location_key: 1 }] })]
  ])("%s 状態は失敗にする", (_name, body) => {
    expect(() => parsePlaythrough(body())).toThrow(PlaythroughError);
  });
});

describe("街を始める（startPlaythrough）", () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it("POST /api/v1/playthrough を Cookie つきで呼ぶ。新しく作った（201）か、続き（200）かを返す", async () => {
    const f = vi.fn(async () => json(STATE, 201));
    vi.stubGlobal("fetch", f);
    await expect(startPlaythrough()).resolves.toMatchObject({ created: true, state: { timeIndex: 0 } });
    expect(f).toHaveBeenCalledWith("/api/v1/playthrough", expect.objectContaining({ method: "POST", credentials: "same-origin" }));

    vi.stubGlobal("fetch", vi.fn(async () => json({ ...STATE, time_index: 4 }, 200)));
    await expect(startPlaythrough()).resolves.toMatchObject({ created: false, state: { timeIndex: 4 } });
  });

  it("接続できないときは、接続の失敗として伝える", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    await expect(startPlaythrough()).rejects.toThrow("サーバーに接続できませんでした");
  });

  it("HTTP エラーは状態コードつきの失敗にする", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 500 })));
    await expect(startPlaythrough()).rejects.toThrow("HTTP 500");
  });
});

describe("進行中の街を取る（fetchPlaythrough）", () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it("GET /api/v1/playthrough で、進行中の街の状態を返す", async () => {
    const f = vi.fn(async () => json({ ...STATE, time_index: 2 }));
    vi.stubGlobal("fetch", f);
    await expect(fetchPlaythrough()).resolves.toMatchObject({ timeIndex: 2 });
    expect(f).toHaveBeenCalledWith("/api/v1/playthrough", expect.objectContaining({ credentials: "same-origin" }));
  });

  it("404（Cookie なし・期限切れ・知らない Cookie）は「進行中の街なし」として null を返す", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ error: "not_started" }, 404)));
    await expect(fetchPlaythrough()).resolves.toBeNull();
  });

  it("接続できないときは失敗にする（「街なし」と区別する）", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    await expect(fetchPlaythrough()).rejects.toThrow(PlaythroughError);
  });
});
