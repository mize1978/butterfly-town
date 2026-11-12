import { describe, expect, it, vi } from "vitest";
import type { PlaythroughState } from "../api/playthrough";
import type { TimeSlotResult } from "../api/time-slot";
import { PlaythroughError } from "../api/playthrough";
import { aheadNote, budgetStop, describeEvent, nextStepLabel, outcomeNote, slotLabel, SlotAdvancer } from "./time-slot";

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
});

describe("409 の理由の案内", () => {
  it("時間帯のずれ・終わった街は Rails の状態に合わせ、処理中・中断はもう一度押せばよいと伝える", () => {
    expect(outcomeNote("time_index_mismatch")).toEqual({ adopt: true, text: "ほかの画面で時間帯が進んでいました。いまの時間帯に合わせました。" });
    expect(outcomeNote("finished")).toEqual({ adopt: true, text: "この街の時間帯は、もう終わっています。" });
    expect(outcomeNote("running")).toMatchObject({ adopt: false });
    expect(outcomeNote("version_mismatch")).toMatchObject({ adopt: false });
    expect(outcomeNote("budget")).toEqual({ adopt: true, text: "AI の予算が足りないため、この時間帯は止めています。" });
    expect(outcomeNote("unknown_result")).toEqual({ adopt: true, text: "AI の応答を確かめられなかったため止めました。自動ではやり直しません。" });
  });
});

describe("予算不足の中断（S22 の最小版）", () => {
  it("理由・確定していない時間帯・確定済みの進み具合・保存・再開の時期（日本時間）を出す", () => {
    expect(budgetStop(state(4), "2026-12-01T00:00:00Z")).toEqual({
      reason: "今月の AI 予算の上限に近づいたため、新しい AI の呼び出しを止めています。",
      slot: "2日目の昼は確定していません。ゲームが住民の代わりに判断を決めることはしません。",
      progress: "確定済み：2日目の朝まで（15のうち4つ）",
      saved: "ここまでの街はサーバーに残っています。同じブラウザで続きから再開できます。",
      resume: "AI の処理を再開できるのは 2026年12月1日 9:00（日本時間）以降です。"
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
