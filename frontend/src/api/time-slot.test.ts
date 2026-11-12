import { afterEach, describe, expect, it, vi } from "vitest";
import { PlaythroughError } from "./playthrough";
import { confirmTimeSlot } from "./time-slot";

// Rails（TimeSlotsController）が返す形
const STATE = {
  status: "in_progress", time_index: 2, time_slots: 15, festival_progress: 0, interventions_left: 3,
  residents: [{ key: "a", location_key: "plaza" }, { key: "b", location_key: "shop" }, { key: "c", location_key: "plaza" }]
};
const SLOT = {
  time_index: 1, status: "confirmed", attempt: 1, rejected: [],
  events: [
    { kind: "consulted", actor_key: "a", target_key: "c", fact_key: null, payload: { reason: "x" } },
    { kind: "told", actor_key: "c", target_key: "a", fact_key: "e2", payload: { reason: "x" } }
  ]
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe("時間帯を確定する（confirmTimeSlot）", () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it("POST /api/v1/playthrough/time_slots に time_index を Cookie つきで送り、次の状態とその時間帯の出来事を返す", async () => {
    const f = vi.fn(async () => json({ state: STATE, time_slot: SLOT }));
    vi.stubGlobal("fetch", f);
    const r = await confirmTimeSlot(1);
    expect(f).toHaveBeenCalledWith("/api/v1/playthrough/time_slots", expect.objectContaining({
      method: "POST", credentials: "same-origin", body: JSON.stringify({ time_index: 1 })
    }));
    expect(r.ok).toBe(true);
    expect(r.state.timeIndex).toBe(2);
    expect(r.timeSlot).toEqual({
      timeIndex: 1, status: "confirmed", attempt: 1,
      events: [{ kind: "consulted", actorKey: "a", targetKey: "c", factKey: null }, { kind: "told", actorKey: "c", targetKey: "a", factKey: "e2" }]
    });
  });

  it("409 は失敗として投げず、理由（error）と Rails のいまの状態を返す", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ state: { ...STATE, time_index: 5 }, error: "time_index_mismatch" }, 409)));
    const r = await confirmTimeSlot(2);
    expect(r).toMatchObject({ ok: false, error: "time_index_mismatch", timeSlot: null, state: { timeIndex: 5 } });
  });

  it("予算が足りずに止めたとき（409・budget）は、再開できる時期（resume_at）も返す", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ state: STATE, error: "budget", resume_at: "2026-12-01T00:00:00Z",
      time_slot: { ...SLOT, status: "suspended", events: [] } }, 409)));
    await expect(confirmTimeSlot(2)).resolves.toMatchObject({ ok: false, error: "budget", resumeAt: "2026-12-01T00:00:00Z" });
  });

  it("接続できないときは、接続の失敗として投げる", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    await expect(confirmTimeSlot(0)).rejects.toThrow("サーバーに接続できませんでした");
  });

  it("404（街が無い）・500 は状態コードつきの失敗にする", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ error: "not_started" }, 404)));
    await expect(confirmTimeSlot(0)).rejects.toThrow(PlaythroughError);
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 500 })));
    await expect(confirmTimeSlot(0)).rejects.toThrow("HTTP 500");
  });

  it("形が違う応答（出来事が配列でない）は失敗にする", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ state: STATE, time_slot: { ...SLOT, events: null } })));
    await expect(confirmTimeSlot(1)).rejects.toThrow(PlaythroughError);
  });
});
