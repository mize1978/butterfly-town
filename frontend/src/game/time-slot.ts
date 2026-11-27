// 街の画面から時間帯を進める（#8 の API を画面につなぐ）。呼び方・出来事の文・409 の案内と、連打の防止を持つ。
// 住民の名前はまだ決まっていない（residents.yml の key a・b・c が仮）ので、「住民a」のように書く。
// 伝えた事実の中身は、画面には出さない（誰が誰に伝えたかだけ）
import type { PlaythroughState } from "../api/playthrough";
import { confirmTimeSlot, type TimeSlotEvent, type TimeSlotResult } from "../api/time-slot";

const PARTS = ["朝", "昼", "夜"] as const;
const day = (i: number) => Math.floor(i / 3) + 1;
export const slotLabel = (i: number) => `${day(i)}日目の${PARTS[i % 3]}`;

// 街の情報欄（#31）：「時間帯 3/15・祭りの準備 2・介入 残り2」。値はどれも Rails が確定した状態のまま出す。
// 祭りの進み具合は目標値・割合を付けない（勝敗のしきい値は Rails が決める・#34）
export const statusLabel = (s: Pick<PlaythroughState, "timeIndex" | "timeSlots" | "festivalProgress" | "interventionsLeft">) =>
  `時間帯 ${s.timeIndex + 1}/${s.timeSlots}・祭りの準備 ${s.festivalProgress}・介入 残り${s.interventionsLeft}`;

// ボタンに添える「いま → 次」。日が変わるときは日付も書く
export function nextStepLabel(s: PlaythroughState): string {
  const i = s.timeIndex;
  if (i >= s.timeSlots - 1) return `${slotLabel(i)} → 終わり`;
  return `${slotLabel(i)} → ${day(i + 1) === day(i) ? PARTS[(i + 1) % 3] : slotLabel(i + 1)}`;
}

const who = (key: string | null) => `住民${key ?? "?"}`;
// 場所の呼び方（config/residents.yml の locations。名前は仮）
const PLACES: Record<string, string> = { plaza: "広場", shop: "店", home_a: "住民aの家", home_b: "住民bの家", home_c: "住民cの家" };
const place = (key: string | null | undefined) => (key ? PLACES[key] ?? key : "どこか");
export function describeEvent(e: TimeSlotEvent): string {
  switch (e.kind) {
    case "consulted": return `${who(e.actorKey)}が${who(e.targetKey)}に相談した`;
    case "told": return `${who(e.actorKey)}が${who(e.targetKey)}に、知っていることを伝えた`;
    case "invited": return `${who(e.actorKey)}が${who(e.targetKey)}を準備に誘った`;
    case "worked": return `${who(e.actorKey)}が祭りの準備をした`;
    // 移動は決めた時間帯の出来事で、実際に行き先にいるのは次の朝か昼から（#55）
    case "moved": return `${who(e.actorKey)}が${place(e.moveTo)}へ向かうことにした`;
    case "accepted": return `${who(e.actorKey)}が${who(e.targetKey)}の誘いを受けた`;
    case "declined": return `${who(e.actorKey)}が${who(e.targetKey)}の誘いを断った`;
    // 特殊介入（#33）。うわさの中身は出さない（相手がもう知っていたかどうかも、文では区別しない）
    case "rumored": return `${who(e.targetKey)}にうわさを流した`;
    case "gathering_announced": return `${place(e.place)}で${e.at !== undefined ? slotLabel(e.at) : "次の朝か昼"}に集まりがあると告知した`;
    case "gathering_held": return `${place(e.place)}で集まりが開かれた（${e.attendees?.length ? `来たのは${e.attendees.map(who).join("・")}` : "誰も来なかった"}）`;
    default: return `${who(e.actorKey)}の出来事（${e.kind}）`;
  }
}

// 409 の理由ごとの案内。adopt：Rails のいまの状態に画面を合わせる（ずれ・終わり）。
// そうでないもの（処理中・中断・前の試行の遅れ）は時間帯が進んでいないので、もう一度押してもらう
export function outcomeNote(error: string | null): { adopt: boolean; text: string } {
  switch (error) {
    case "time_index_mismatch": return { adopt: true, text: "ほかの画面で時間帯が進んでいました。いまの時間帯に合わせました。" };
    case "finished": return { adopt: true, text: "この街の時間帯は、もう終わっています。" };
    case "budget": return { adopt: true, text: "AI の予算が足りないため、この時間帯は止めています。" };
    case "unknown_result": return { adopt: true, text: "AI の応答を確かめられなかったため止めました。自動ではやり直しません。" };
    // 費用の話はしない：同じ時間帯で先に費用のかかった呼び出し（同じ試行の別の住民・前の試行）があり得る
    case "ai_unavailable": return { adopt: true, text: "AI に問い合わせられなかったため止めました。もう一度押すと、やり直します。" };
    case "running": return { adopt: false, text: "この時間帯はいま進めている途中です。少し待ってから、もう一度押してください。" };
    default: return { adopt: false, text: "途中で街の状態が変わったため、反映しませんでした。もう一度押してください。" };
  }
}

// 予算不足で止めたときの案内（中断画面 S22 の最小版）。README「10-4 予算不足時の方針」の
// 「AI を利用できない理由・確定済みの進行状態・保存可否・再開時期」を出す
export type BudgetStop = { reason: string; slot: string; progress: string; saved: string; resume: string };
const JST = new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" });
function jst(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const p = Object.fromEntries(JST.formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.year}年${p.month}月${p.day}日 ${p.hour}:${p.minute}`;
}
export function budgetStop(s: PlaythroughState, resumeAt: string | null | undefined): BudgetStop {
  const i = s.timeIndex;
  const at = resumeAt ? jst(resumeAt) : null;
  return {
    reason: "今月の AI 予算の上限に近づいたため、新しい AI の呼び出しを止めています。",
    slot: `${slotLabel(i)}は確定していません。ゲームが住民の代わりに判断を決めることはしません。`,
    progress: i === 0 ? "確定済みの時間帯はまだありません" : `確定済み：${slotLabel(i - 1)}まで（${s.timeSlots}のうち${i}つ）`,
    saved: "ここまでの街はサーバーに残っています。同じブラウザで続きから再開できます。",
    resume: at ? `AI の処理を再開できるのは ${at}（日本時間）以降です。` : "AI の処理を再開できる時期は、いまは分かりません。"
  };
}

// 重ねていた画面を閉じたあとに出す画面。送っている間にメニュー・会話などを開いていて予算不足が届いたら、
// その案内（と再開の時期）は保留しておき、閉じたときに出す。中断の案内そのものを閉じたら、もう出さない
export function afterClose(closing: string | null, budgetPending: boolean): "budget" | null {
  return budgetPending && closing !== "budget" ? "budget" : null;
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
