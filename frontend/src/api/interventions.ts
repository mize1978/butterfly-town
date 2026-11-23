// 特殊介入（#33）の API。POST /api/v1/playthrough/interventions
// 成立 201・同じ送信の再送 200（state と出来事）、断った 409（error と state）、入力の誤り 422
import { parsePlaythrough, PlaythroughError, type PlaythroughState } from "./playthrough";
import { parseEvent, type TimeSlotEvent } from "./time-slot";

export type InterventionRequest =
  | { kind: "rumor"; requestId: string; target: string; factKey: string }
  | { kind: "gathering"; requestId: string; place: string };
export type InterventionResult = { ok: boolean; error: string | null; state: PlaythroughState | null; event: TimeSlotEvent | null };

const URL = "/api/v1/playthrough/interventions";
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

export function requestBody(r: InterventionRequest): Record<string, string> {
  return r.kind === "rumor"
    ? { kind: r.kind, request_id: r.requestId, target: r.target, fact_key: r.factKey }
    : { kind: r.kind, request_id: r.requestId, place: r.place };
}

export async function sendIntervention(r: InterventionRequest): Promise<InterventionResult> {
  let res: Response;
  try {
    res = await fetch(URL, {
      method: "POST", credentials: "same-origin",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(requestBody(r))
    });
  } catch {
    throw new PlaythroughError("サーバーに接続できませんでした");
  }
  if (![200, 201, 409, 422].includes(res.status)) throw new PlaythroughError(`介入を送れませんでした（HTTP ${res.status}）`);
  let body: unknown;
  try { body = await res.json(); } catch { throw new PlaythroughError("介入の結果が JSON ではありません"); }
  if (!isObj(body)) throw new PlaythroughError("介入の結果が JSON のオブジェクトではありません");
  return {
    ok: res.status === 200 || res.status === 201,
    error: typeof body.error === "string" ? body.error : null,
    state: body.state === undefined ? null : parsePlaythrough(body.state),
    event: body.event === undefined ? null : parseEvent(body.event)
  };
}
