// ゲストの街（#7）。Rails が Cookie（guest_token）でゲストを見分ける。
// 同じブラウザなら、進行中の街を作り直さずに続きを返す
export class PlaythroughError extends Error {}

export type ResidentState = { key: string; locationKey: string };
export type PlaythroughState = {
  status: string;
  timeIndex: number; // いまの時間帯 0〜14
  timeSlots: number; // 時間帯の数（15）
  festivalProgress: number;
  interventionsLeft: number;
  residents: ResidentState[];
};

const URL = "/api/v1/playthrough";
const isInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

export function parsePlaythrough(body: unknown): PlaythroughState {
  if (!isObj(body)) throw new PlaythroughError("街の状態が JSON のオブジェクトではありません");
  const { status, time_index, time_slots, festival_progress, interventions_left, residents } = body;
  if (typeof status !== "string") throw new PlaythroughError("街の状態の status が文字列ではありません");
  if (!isInt(time_slots) || time_slots <= 0) throw new PlaythroughError("街の状態の time_slots が正しくありません");
  if (!isInt(time_index) || time_index < 0 || time_index >= time_slots) throw new PlaythroughError("街の状態の time_index が正しくありません");
  if (!isInt(festival_progress) || !isInt(interventions_left) || interventions_left < 0) throw new PlaythroughError("街の状態の進み具合・介入の残りが正しくありません");
  if (!Array.isArray(residents) || !residents.every((r) => isObj(r) && typeof r.key === "string" && typeof r.location_key === "string")) {
    throw new PlaythroughError("街の状態の residents が正しくありません");
  }
  return {
    status, timeIndex: time_index, timeSlots: time_slots, festivalProgress: festival_progress, interventionsLeft: interventions_left,
    residents: residents.map((r) => ({ key: r.key as string, locationKey: r.location_key as string }))
  };
}

async function request(init: RequestInit): Promise<Response> {
  try {
    return await fetch(URL, { ...init, credentials: "same-origin", headers: { Accept: "application/json" } });
  } catch {
    throw new PlaythroughError("サーバーに接続できませんでした");
  }
}

async function readState(res: Response): Promise<PlaythroughState> {
  let body: unknown;
  try { body = await res.json(); } catch { throw new PlaythroughError("街の状態が JSON ではありません"); }
  return parsePlaythrough(body);
}

// 「ゲストで遊ぶ」：街を始める。同じ Cookie に進行中の街があれば、それが返る（created: false）
export async function startPlaythrough(): Promise<{ state: PlaythroughState; created: boolean }> {
  const res = await request({ method: "POST" });
  if (res.status !== 200 && res.status !== 201) throw new PlaythroughError(`街を始められませんでした（HTTP ${res.status}）`);
  return { state: await readState(res), created: res.status === 201 };
}

// 再読み込み：進行中の街の状態。無い（Cookie なし・期限切れ・知らない Cookie）ときは null。
// 接続できないときは失敗にする（「街が無い」と取り違えない）
export async function fetchPlaythrough(): Promise<PlaythroughState | null> {
  const res = await request({ method: "GET" });
  if (res.status === 404) return null;
  if (!res.ok) throw new PlaythroughError(`街の状態を取得できませんでした（HTTP ${res.status}）`);
  return readState(res);
}
