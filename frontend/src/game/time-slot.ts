// 街の画面から時間帯を進める（#8 の API を画面につなぐ）。呼び方・出来事の文・409 の案内と、連打の防止を持つ。
// 住民の名前はまだ決まっていない（residents.yml の key a・b・c が仮）ので、「住民a」のように書く。
// 伝えた事実の中身は、画面には出さない（誰が誰に伝えたかだけ）
import type { PlaythroughState } from "../api/playthrough";
import { confirmTimeSlot, type TimeSlotEvent, type TimeSlotResult } from "../api/time-slot";

const PARTS = ["朝", "昼", "夜"] as const;
const day = (i: number) => Math.floor(i / 3) + 1;
export const slotLabel = (i: number) => `${day(i)}日目の${PARTS[i % 3]}`;

// ボタンに添える「いま → 次」。日が変わるときは日付も書く
export function nextStepLabel(s: PlaythroughState): string {
  const i = s.timeIndex;
  if (i >= s.timeSlots - 1) return `${slotLabel(i)} → 終わり`;
  return `${slotLabel(i)} → ${day(i + 1) === day(i) ? PARTS[(i + 1) % 3] : slotLabel(i + 1)}`;
}

const who = (key: string | null) => `住民${key ?? "?"}`;
export function describeEvent(e: TimeSlotEvent): string {
  switch (e.kind) {
    case "consulted": return `${who(e.actorKey)}が${who(e.targetKey)}に相談した`;
    case "told": return `${who(e.actorKey)}が${who(e.targetKey)}に、知っていることを伝えた`;
    case "invited": return `${who(e.actorKey)}が${who(e.targetKey)}を準備に誘った`;
    case "worked": return `${who(e.actorKey)}が祭りの準備をした`;
    case "moved": return `${who(e.actorKey)}が移動した`;
    default: return `${who(e.actorKey)}の出来事（${e.kind}）`;
  }
}

// 409 の理由ごとの案内。adopt：Rails のいまの状態に画面を合わせる（ずれ・終わり）。
// そうでないもの（処理中・中断・前の試行の遅れ）は時間帯が進んでいないので、もう一度押してもらう
export function outcomeNote(error: string | null): { adopt: boolean; text: string } {
  switch (error) {
    case "time_index_mismatch": return { adopt: true, text: "ほかの画面で時間帯が進んでいました。いまの時間帯に合わせました。" };
    case "finished": return { adopt: true, text: "この街の時間帯は、もう終わっています。" };
    case "running": return { adopt: false, text: "この時間帯はいま進めている途中です。少し待ってから、もう一度押してください。" };
    default: return { adopt: false, text: "途中で街の状態が変わったため、反映しませんでした。もう一度押してください。" };
  }
}

// 確定済みの時間帯を送り直したとき、Rails がその次より先にいる（ほかの画面で進めていた）なら、合わせたことを伝える
export function aheadNote(sentIndex: number, r: TimeSlotResult): string | null {
  if (r.state.status !== "in_progress" || r.state.timeIndex <= sentIndex + 1) return null;
  return outcomeNote("time_index_mismatch").text;
}

// 連打の防止：送っている間にもう一度押されても、新しい要求は出さず、送っている要求の結果を返す。
// 画面の再描画（ボタンを押せなくする）より先に2回目の押下が届いても、ここで止まる。
// 失敗した後は、同じ時間帯をもう一度送れる（届いていた場合も Rails が確定済みとして同じ出来事を返す）
export class SlotAdvancer {
  private pending: Promise<TimeSlotResult> | null = null;

  constructor(private readonly send: (timeIndex: number) => Promise<TimeSlotResult> = confirmTimeSlot) {}

  get sending() { return this.pending !== null; }

  advance(timeIndex: number): Promise<TimeSlotResult> {
    if (this.pending) return this.pending;
    const p = this.send(timeIndex);
    this.pending = p;
    const clear = () => { if (this.pending === p) this.pending = null; };
    p.then(clear, clear);
    return p;
  }
}
