import { describe, expect, it } from "vitest";
import { InterventionRequestId, interventionBlocked, interventionNote, slotAdvanceBlocked } from "./intervention";
import type { PlaythroughState } from "../api/playthrough";

const state = (over: Partial<PlaythroughState> = {}): PlaythroughState =>
  ({ status: "in_progress", timeIndex: 0, timeSlots: 15, festivalProgress: 0, interventionsLeft: 3, residents: [], ...over });

describe("特殊介入（#33）の画面の決まり", () => {
  it("残り0回・終わった街では押せず、理由を添える。残っていれば押せる", () => {
    expect(interventionBlocked(state(), false)).toBeNull();
    expect(interventionBlocked(state({ interventionsLeft: 0 }), false)).toBe("介入はもう使えません（1プレイ3回まで）。");
    expect(interventionBlocked(state({ status: "finished" }), false)).toBe("15の時間帯が終わったので、介入はできません。");
  });

  it("同時操作：時間帯を進めている間は「介入する」を押せず、介入を送っている間は「時間帯を進める」を押せない", () => {
    expect(interventionBlocked(state(), false, true)).toBe("時間帯を進めている途中です。");
    expect(interventionBlocked(state(), true, false)).toBe("送っています…");
    expect(slotAdvanceBlocked({ finished: false, slotSending: false, intervening: true })).toBe(true);
    expect(slotAdvanceBlocked({ finished: false, slotSending: true, intervening: false })).toBe(true);
    expect(slotAdvanceBlocked({ finished: true, slotSending: false, intervening: false })).toBe(true);
    expect(slotAdvanceBlocked({ finished: false, slotSending: false, intervening: false })).toBe(false);
  });

  it("断られた理由ごとの案内。4回目・処理中・間に合わない告知は、回数を使っていないと伝える", () => {
    expect(interventionNote("no_interventions_left")).toBe("介入はもう使えません（1プレイ3回まで）。");
    expect(interventionNote("running")).toContain("回数は使っていません");
    expect(interventionNote("too_late")).toBe("集まりを開ける朝か昼が、もう残っていません（回数は使っていません）。");
  });

  it("送信番号：同じ内容の送り直しは同じ番号、内容を変えたら・終わったら新しい番号", () => {
    let n = 0;
    const ids = new InterventionRequestId(() => `id-${++n}`);
    expect(ids.for("rumor:a:e2")).toBe("id-1");
    expect(ids.for("rumor:a:e2")).toBe("id-1");
    expect(ids.for("gathering:plaza")).toBe("id-2");
    ids.reset();
    expect(ids.for("gathering:plaza")).toBe("id-3");
  });
});
