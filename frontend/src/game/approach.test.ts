import { describe, expect, it } from "vitest";
import { TOWN } from "../test/town";
import { allowed, DEAD_ZONE, moveAlong } from "../core/world";
import { overlaps, TALK_GAP, talkSpot } from "./approach";
import { SAMPLE_RESIDENT } from "./sample-resident";

const R = SAMPLE_RESIDENT.pos;
// 目的地へまっすぐ歩いて、止まる線（DEAD_ZONE）の手前まで届くか
const reaches = (from: { x: number; y: number }, to: { x: number; y: number }) => {
  const d = Math.hypot(to.x - from.x, to.y - from.y), end = moveAlong(TOWN, from, (to.x - from.x) / d, (to.y - from.y) / d, d);
  return Math.hypot(to.x - end.x, to.y - end.y) <= DEAD_ZONE;
};

describe("話しかけるときの立ち位置（talkSpot）", () => {
  it("重なっていなければ動かない（その場で向き直って話す）", () => {
    expect(talkSpot(TOWN, { x: R.x - 90, y: R.y + 10 }, R)).toBeNull();
    expect(talkSpot(TOWN, { x: R.x + 20, y: R.y + 70 }, R)).toBeNull(); // 手前に離れて立っている
  });

  it("近すぎるときは、歩ける・まっすぐ行ける位置を返し、着いた後は重ならない", () => {
    for (const me of [{ x: R.x + 10, y: R.y }, { x: R.x - 15, y: R.y + 8 }, { x: R.x, y: R.y - 5 }]) {
      expect(overlaps(me, R)).toBe(true);
      const spot = talkSpot(TOWN, me, R)!;
      expect(spot).not.toBeNull();
      expect(allowed(TOWN, spot.x, spot.y)).toBe(true);
      expect(reaches(me, spot)).toBe(true);
      // goTo は止まる線の手前で止まるので、その分だけ住民に近い所で止まっても重ならない
      const d = Math.hypot(spot.x - me.x, spot.y - me.y), stop = { x: spot.x - ((spot.x - me.x) / d) * DEAD_ZONE, y: spot.y - ((spot.y - me.y) / d) * DEAD_ZONE };
      expect(overlaps(stop, R)).toBe(false);
    }
  });

  it("両側とも歩けるなら、いま立っている側へ離れる（住民の反対側へ回り込まない）", () => {
    const right = { x: R.x + TALK_GAP, y: R.y }, left = { x: R.x - TALK_GAP, y: R.y };
    if (!allowed(TOWN, right.x, right.y) || !allowed(TOWN, left.x, left.y)) return; // 地図の都合で片側しか無いときは前のテストで足りる
    expect(talkSpot(TOWN, { x: R.x + 10, y: R.y }, R)!.x).toBeGreaterThan(R.x);
    expect(talkSpot(TOWN, { x: R.x - 10, y: R.y }, R)!.x).toBeLessThan(R.x);
  });
});
