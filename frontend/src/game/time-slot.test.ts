import { describe, expect, it, vi } from "vitest";
import type { PlaythroughState } from "../api/playthrough";
import type { TimeSlotResult } from "../api/time-slot";
import { PlaythroughError } from "../api/playthrough";
import { afterClose, aheadNote, budgetStop, describeEvent, nextStepLabel, outcomeNote, slotLabel, SlotAdvancer, statusLabel } from "./time-slot";

const state = (timeIndex: number, status = "in_progress"): PlaythroughState => ({
  status, timeIndex, timeSlots: 15, festivalProgress: 0, interventionsLeft: 3, residents: []
});
const ok = (from: number): TimeSlotResult => ({
  ok: true, error: null, state: state(from + 1), timeSlot: { timeIndex: from, status: "confirmed", attempt: 1, events: [] }
});

describe("時間帯の呼び方", () => {
  it("1日は朝・昼・夜の3つ。時間帯4は2日目の昼", () => {
    expect([0, 1, 2, 3, 4, 14].map(slotLabel)).toEqual(["1日目の朝", "1日目の昼", "1日目の夜", "2日目の朝", "2日目の昼", "5日目の夜"]);
  });

  it("ボタンには、いまの時間帯から次の時間帯を添える。最後の時間帯は「終える」", () => {
    expect(nextStepLabel(state(0))).toBe("1日目の朝 → 昼");
    expect(nextStepLabel(state(2))).toBe("1日目の夜 → 2日目の朝");
    expect(nextStepLabel(state(14))).toBe("5日目の夜 → 終わり");
  });
});

describe("出来事の文", () => {
  it("相談・伝える・誘う・準備を、住民の名前（仮の key）で書く。事実の中身は出さない", () => {
    expect(describeEvent({ kind: "consulted", actorKey: "a", targetKey: "c", factKey: null })).toBe("住民aが住民cに相談した");
    expect(describeEvent({ kind: "told", actorKey: "c", targetKey: "a", factKey: "e2" })).toBe("住民cが住民aに、知っていることを伝えた");
    expect(describeEvent({ kind: "invited", actorKey: "a", targetKey: "b", factKey: null })).toBe("住民aが住民bを準備に誘った");
    expect(describeEvent({ kind: "worked", actorKey: "b", targetKey: null, factKey: null })).toBe("住民bが祭りの準備をした");
  });

  it("#33：うわさ（中身は出さない）・集まりの告知・開かれた集まり（来た住民／誰も来なかった）", () => {
    expect(describeEvent({ kind: "rumored", actorKey: "player", targetKey: "a", factKey: "e2" })).toBe("住民aにうわさを流した");
    expect(describeEvent({ kind: "gathering_announced", actorKey: "player", targetKey: null, factKey: null, place: "plaza", at: 3 }))
      .toBe("広場で2日目の朝に集まりがあると告知した");
    expect(describeEvent({ kind: "gathering_held", actorKey: "player", targetKey: null, factKey: null, place: "plaza", attendees: ["b"] }))
      .toBe("広場で集まりが開かれた（来たのは住民b）");
    expect(describeEvent({ kind: "gathering_held", actorKey: "player", targetKey: null, factKey: null, place: "shop", attendees: [] }))
      .toBe("店で集まりが開かれた（誰も来なかった）");
  });

  it("#55：移動は行き先へ向かうことにした、返事は受けた・断ったと書く", () => {
    expect(describeEvent({ kind: "moved", actorKey: "a", targetKey: null, factKey: null, moveTo: "shop" })).toBe("住民aが店へ向かうことにした");
    expect(describeEvent({ kind: "accepted", actorKey: "b", targetKey: "a", factKey: null })).toBe("住民bが住民aの誘いを受けた");
    expect(describeEvent({ kind: "declined", actorKey: "b", targetKey: "a", factKey: null })).toBe("住民bが住民aの誘いを断った");
  });
});

describe("409 の理由の案内", () => {
  it("時間帯のずれ・終わった街は Rails の状態に合わせ、処理中・中断はもう一度押せばよいと伝える", () => {
    expect(outcomeNote("time_index_mismatch")).toEqual({ adopt: true, text: "ほかの画面で時間帯が進んでいました。いまの時間帯に合わせました。" });
    expect(outcomeNote("finished")).toEqual({ adopt: true, text: "この街の時間帯は、もう終わっています。" });
    expect(outcomeNote("running")).toMatchObject({ adopt: false });
    expect(outcomeNote("version_mismatch")).toMatchObject({ adopt: false });
    expect(outcomeNote("budget")).toEqual({ adopt: true, text: "AI の予算が足りないため、この時間帯は止めています。" });
    expect(outcomeNote("unknown_result")).toEqual({ adopt: true, text: "AI の応答を確かめられなかったため止めました。自動ではやり直しません。" });
    // #30：AI を呼ぶ前に止まった・API が受け付けなかった。押し直してよいと伝える。
    // 同じ時間帯で先に費用のかかった呼び出し（同じ試行の別の住民・前の試行）があり得るので、費用の話はしない
    expect(outcomeNote("ai_unavailable")).toEqual({ adopt: true, text: "AI に問い合わせられなかったため止めました。もう一度押すと、やり直します。" });
    expect(outcomeNote("ai_unavailable").text).not.toContain("費用");
  });
});

describe("予算不足の中断（S22 の最小版）", () => {
  // 送っている間にメニューや会話を開いていると、予算不足の案内は重ねずに保留する（#30 のコメント2つ目）
  it("保留していた予算不足の案内は、メニュー・会話などを閉じたあとに出す", () => {
    for (const closing of ["menu", "talk", "shop", "bench", "part-1"]) expect(afterClose(closing, true)).toBe("budget");
    expect(afterClose("menu", false)).toBeNull();
  });
  it("中断の案内そのものを閉じたら、もう出さない", () => {
    expect(afterClose("budget", true)).toBeNull();
  });

  it("理由・確定していない時間帯・確定済みの進み具合・保存・再開の時期（日本時間）を出す", () => {
    expect(budgetStop(state(4), "2026-12-01T00:00:00+09:00")).toEqual({
      reason: "今月の AI 予算の上限に近づいたため、新しい AI の呼び出しを止めています。",
      slot: "2日目の昼は確定していません。ゲームが住民の代わりに判断を決めることはしません。",
      progress: "確定済み：2日目の朝まで（15のうち4つ）",
      saved: "ここまでの街はサーバーに残っています。同じブラウザで続きから再開できます。",
      resume: "AI の処理を再開できるのは 2026年12月1日 0:00（日本時間）以降です。"
    });
  });

  it("最初の時間帯で止まったときは、確定済みの時間帯は無い。再開の時期が分からないときはそう書く", () => {
    const s = budgetStop(state(0), null);
    expect(s.progress).toBe("確定済みの時間帯はまだありません");
    expect(s.resume).toBe("AI の処理を再開できる時期は、いまは分かりません。");
  });
});

describe("ほかの画面で先に進んでいたとき", () => {
  it("送った時間帯の次より Rails が先にいれば、合わせたことを伝える。ふつうに1つ進んだとき・終わったときは何も添えない", () => {
    expect(aheadNote(5, { ...ok(5), state: state(8) })).toBe("ほかの画面で時間帯が進んでいました。いまの時間帯に合わせました。");
    expect(aheadNote(5, ok(5))).toBeNull();
    expect(aheadNote(14, { ...ok(14), state: state(14, "finished") })).toBeNull();
  });
});

describe("時間帯を進める（SlotAdvancer）", () => {
  it("連打：送っている間にもう一度押しても、要求は1回だけで、同じ結果を返す", async () => {
    let finish!: (r: TimeSlotResult) => void;
    const send = vi.fn(() => new Promise<TimeSlotResult>((res) => { finish = res; }));
    const adv = new SlotAdvancer(send);
    const first = adv.advance(0);
    const second = adv.advance(0);
    expect(adv.sending).toBe(true);
    finish(ok(0));
    expect(await first).toEqual(await second);
    expect(send).toHaveBeenCalledTimes(1);
    expect(adv.sending).toBe(false);
  });

  it("通信失敗の後は、同じ時間帯をもう一度送れる（届いていれば Rails は確定済みとして同じ出来事を返す）", async () => {
    const send = vi.fn<(i: number) => Promise<TimeSlotResult>>()
      .mockRejectedValueOnce(new PlaythroughError("サーバーに接続できませんでした"))
      .mockResolvedValueOnce({ ...ok(1), timeSlot: { timeIndex: 1, status: "confirmed", attempt: 1, events: [] } });
    const adv = new SlotAdvancer(send);
    await expect(adv.advance(1)).rejects.toThrow("サーバーに接続できませんでした");
    expect(adv.sending).toBe(false);
    await expect(adv.advance(1)).resolves.toMatchObject({ ok: true, state: { timeIndex: 2 } });
    expect(send.mock.calls).toEqual([[1], [1]]);
  });
});

// #31：情報欄の「時間帯・祭りの進み具合・介入の残り」。進み具合は Rails の値をそのまま出す（目標値・割合は画面で作らない）
describe("街の情報欄（statusLabel）", () => {
  const state = (o: Partial<PlaythroughState>): PlaythroughState =>
    ({ status: "in_progress", timeIndex: 0, timeSlots: 15, festivalProgress: 0, interventionsLeft: 3, residents: [], ...o });

  it("時間帯は1から数え、祭りの準備は Rails の festival_progress をそのまま出す", () => {
    expect(statusLabel(state({ timeIndex: 2, festivalProgress: 2, interventionsLeft: 2 }))).toBe("時間帯 3/15・祭りの準備 2・介入 残り2");
  });

  it("始めたばかり（進み具合0）も0と出す", () => {
    expect(statusLabel(state({}))).toBe("時間帯 1/15・祭りの準備 0・介入 残り3");
  });

  it("進み具合が大きくても、割合や上限を付けない", () => {
    expect(statusLabel(state({ timeIndex: 14, festivalProgress: 23, interventionsLeft: 0 }))).toBe("時間帯 15/15・祭りの準備 23・介入 残り0");
  });
});
