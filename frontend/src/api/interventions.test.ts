import { afterEach, describe, expect, it, vi } from "vitest";
import { sendIntervention } from "./interventions";

const STATE = { status: "in_progress", time_index: 2, time_slots: 15, festival_progress: 0, interventions_left: 2,
  residents: [{ key: "a", location_key: "home_a" }] };
const json = (body: unknown, status: number) => new Response(JSON.stringify(body), { status });

describe("特殊介入を送る（sendIntervention）", () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it("集まりの告知を Cookie つきで送り、減った残り回数と告知の出来事（場所・開く時間帯）を返す", async () => {
    const f = vi.fn(async () => json({ state: STATE, event: { kind: "gathering_announced", actor_key: "player", target_key: null,
      fact_key: null, time_index: 2, payload: { place: "plaza", at: 3, request: {} } } }, 201));
    vi.stubGlobal("fetch", f);
    const r = await sendIntervention({ kind: "gathering", requestId: "g-1", place: "plaza" });
    expect(f).toHaveBeenCalledWith("/api/v1/playthrough/interventions", expect.objectContaining({
      method: "POST", credentials: "same-origin", body: JSON.stringify({ kind: "gathering", request_id: "g-1", place: "plaza" })
    }));
    expect(r.ok).toBe(true);
    expect(r.state?.interventionsLeft).toBe(2);
    expect(r.event).toEqual({ kind: "gathering_announced", actorKey: "player", targetKey: null, factKey: null, place: "plaza", at: 3 });
  });

  it("4回目（409）は失敗として投げず、理由と残り0の状態を返す", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ state: { ...STATE, interventions_left: 0 }, error: "no_interventions_left" }, 409)));
    const r = await sendIntervention({ kind: "rumor", requestId: "r-4", target: "a", factKey: "e1" });
    expect(r).toMatchObject({ ok: false, error: "no_interventions_left", event: null, state: { interventionsLeft: 0 } });
  });
});
