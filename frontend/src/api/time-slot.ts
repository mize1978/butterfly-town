// 時間帯を1つ確定する（#8 の POST /api/v1/playthrough/time_slots）。
// 同じ時間帯を2回送っても、Rails は確定済みとして同じ出来事を返す（出来事は増えない）。
// 409（時間帯のずれ・処理中・中断・終わった街）は失敗として投げず、理由と Rails のいまの状態を返す
import { parsePlaythrough, PlaythroughError, type PlaythroughState } from "./playthrough";

export type TimeSlotEvent = { kind: string; actorKey: string; targetKey: string | null; factKey: string | null };
export type TimeSlot = { timeIndex: number; status: string; attempt: number; events: TimeSlotEvent[] };
export type TimeSlotResult = { ok: boolean; error: string | null; state: PlaythroughState; timeSlot: TimeSlot | null };

const URL = "/api/v1/playthrough/time_slots";
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const strOrNull = (v: unknown) => v === null || v === undefined || typeof v === "string";

function parseEvent(e: unknown): TimeSlotEvent {
  if (!isObj(e) || typeof e.kind !== "string" || typeof e.actor_key !== "string" || !strOrNull(e.target_key) || !strOrNull(e.fact_key)) {
    throw new PlaythroughError("時間帯の出来事の形が正しくありません");
  }
  return { kind: e.kind, actorKey: e.actor_key, targetKey: (e.target_key as string | null) ?? null, factKey: (e.fact_key as string | null) ?? null };
}

function parseTimeSlot(v: unknown): TimeSlot | null {
  if (v === undefined || v === null) return null;
  if (!isObj(v) || !Number.isInteger(v.time_index) || typeof v.status !== "string" || !Number.isInteger(v.attempt) || !Array.isArray(v.events)) {
    throw new PlaythroughError("時間帯の結果の形が正しくありません");
  }
  return { timeIndex: v.time_index as number, status: v.status, attempt: v.attempt as number, events: v.events.map(parseEvent) };
}

export async function confirmTimeSlot(timeIndex: number): Promise<TimeSlotResult> {
  let res: Response;
  try {
    res = await fetch(URL, {
      method: "POST", credentials: "same-origin",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ time_index: timeIndex })
    });
  } catch {
    throw new PlaythroughError("サーバーに接続できませんでした");
  }
  if (res.status !== 200 && res.status !== 409) throw new PlaythroughError(`時間帯を進められませんでした（HTTP ${res.status}）`);
  let body: unknown;
  try { body = await res.json(); } catch { throw new PlaythroughError("時間帯の結果が JSON ではありません"); }
  if (!isObj(body)) throw new PlaythroughError("時間帯の結果が JSON のオブジェクトではありません");
  return {
    ok: res.status === 200,
    error: typeof body.error === "string" ? body.error : null,
    state: parsePlaythrough(body.state),
    timeSlot: parseTimeSlot(body.time_slot)
  };
}
