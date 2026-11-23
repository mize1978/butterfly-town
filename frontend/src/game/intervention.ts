// 特殊介入（#33）の画面の決まり。A（うわさを流す）と B（集まる場を作る）を合わせて1プレイ3回まで。
// 事実・場所の名前は config/residents.yml に合わせた仮の文（住民の名前と同じく、正式名は未定）
import type { PlaythroughState } from "../api/playthrough";

export const FACTS = [
  { key: "e1", label: "Bは昨年の準備に参加しなかった" },
  { key: "e2", label: "Bは急な家族の用事で準備に参加できなかった" }
] as const;
export const RESIDENTS = ["a", "b", "c"] as const;
export const GATHERING_PLACES = [{ key: "plaza", label: "広場" }, { key: "shop", label: "店" }] as const;

// 介入できない理由（押せないときに添える文）。できるなら null
export function interventionBlocked(s: PlaythroughState, sending: boolean): string | null {
  if (s.status === "finished") return "15の時間帯が終わったので、介入はできません。";
  if (s.interventionsLeft <= 0) return "介入はもう使えません（1プレイ3回まで）。";
  if (sending) return "送っています…";
  return null;
}

// 断られたときの案内。adopt：Rails の状態（残り回数など）に画面を合わせる。どれも回数は使っていない
export function interventionNote(error: string | null): string {
  switch (error) {
    case "no_interventions_left": return "介入はもう使えません（1プレイ3回まで）。";
    case "running": return "時間帯を進めている途中です。進め終わってから、もう一度送ってください（回数は使っていません）。";
    case "too_late": return "集まりを開ける朝か昼が、もう残っていません（回数は使っていません）。";
    case "finished": return "この街の時間帯は、もう終わっています。";
    case "request_conflict": return "同じ送信の番号で、違う内容が届きました。もう一度選び直してください（回数は使っていません）。";
    default: return "介入を受け付けられませんでした（回数は使っていません）。";
  }
}

// 1回の介入の送信番号。通信に失敗して送り直すときは同じ番号を使う（Rails が二重に数えない）。
// 成立・断られた・内容を変えたときに新しくする
export class InterventionRequestId {
  private current: { id: string; content: string } | null = null;
  constructor(private readonly make: () => string = () => crypto.randomUUID()) {}
  for(content: string): string {
    if (this.current?.content !== content) this.current = { id: this.make(), content };
    return this.current.id;
  }
  reset(): void { this.current = null; }
}
