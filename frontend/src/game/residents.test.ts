// #31 街に3人の住民を出す。住民の場所は Rails が決めた location_key をそのまま使い、
// 画面は「その場所のどこに立たせるか」と「街の絵にいない住民の書き方」だけを決める
import { describe, expect, it } from "vitest";
import type { ResidentState } from "../api/playthrough";
import { allowed, type Town } from "../core/world";
import { TOWN } from "../test/town";
import { SHOP } from "./errand";
import { RESIDENT_HIT } from "./sample-resident";
import { awayLine, placeResidents, talkTitle } from "./residents";

// 立ち位置を自由に決めた試験用の街（広場の座標は画面で候補を見て決めるので、ここでは実際の値に依らない）
const STANDS = { plaza: [{ x: 1000, y: 600 }, { x: 1100, y: 600 }, { x: 1200, y: 600 }], shop: [{ x: 500, y: 520 }, { x: 760, y: 520 }, { x: 820, y: 560 }] };
const TEST_TOWN = {
  ...TOWN,
  places: { plaza: { name: "広場", stands: STANDS.plaza }, shop: { name: "店", stands: STANDS.shop } },
  offstage: { home_a: "家", home_b: "家", home_c: "家" }
} as Town;
const at = (key: string, locationKey: string): ResidentState => ({ key, locationKey });

describe("住民を場所の立ち位置に置く（placeResidents）", () => {
  it("Rails が返した場所の立ち位置に置き、名前は「住民a」の形にする", () => {
    const r = placeResidents(TEST_TOWN, [at("a", "plaza"), at("b", "shop"), at("c", "home_c")]);
    expect(r.onMap).toEqual([
      { key: "a", name: "住民a", pos: STANDS.plaza[0] },
      { key: "b", name: "住民b", pos: STANDS.shop[0] }
    ]);
  });

  it("同じ場所の住民は、住民キーの順に立ち位置を割り当てる（API の並び順が変わっても入れ替わらない）", () => {
    const forward = placeResidents(TEST_TOWN, [at("a", "plaza"), at("b", "plaza"), at("c", "plaza")]);
    const reversed = placeResidents(TEST_TOWN, [at("c", "plaza"), at("b", "plaza"), at("a", "plaza")]);
    const expected = [
      { key: "a", name: "住民a", pos: STANDS.plaza[0] },
      { key: "b", name: "住民b", pos: STANDS.plaza[1] },
      { key: "c", name: "住民c", pos: STANDS.plaza[2] }
    ];
    expect(forward.onMap).toEqual(expected);
    expect(reversed.onMap).toEqual(expected);
  });

  it("2人だけ同じ場所にいるときも、キーの順に前から詰める（cが先に来ても b が1つ目）", () => {
    const r = placeResidents(TEST_TOWN, [at("c", "shop"), at("a", "home_a"), at("b", "shop")]);
    expect(r.onMap).toEqual([
      { key: "b", name: "住民b", pos: STANDS.shop[0] },
      { key: "c", name: "住民c", pos: STANDS.shop[1] }
    ]);
  });

  it("家にいる住民は街の絵から外し、「家」として返す", () => {
    const r = placeResidents(TEST_TOWN, [at("a", "home_a"), at("b", "shop"), at("c", "plaza")]);
    expect(r.onMap.map((x) => x.key)).toEqual(["b", "c"]);
    expect(r.away).toEqual([{ key: "a", name: "住民a", where: "家" }]);
  });

  it("地図に無い場所のキーは推測で描かず、「場所不明」として家と区別する", () => {
    const r = placeResidents(TEST_TOWN, [at("a", "harbor"), at("b", "home_b"), at("c", "plaza")]);
    expect(r.onMap.map((x) => x.key)).toEqual(["c"]);
    expect(r.away).toEqual([
      { key: "a", name: "住民a", where: "場所不明" },
      { key: "b", name: "住民b", where: "家" }
    ]);
  });

  it("街の絵にいない住民の書き方は「住民a：家」「住民a：場所不明」", () => {
    expect(awayLine({ key: "a", name: "住民a", where: "家" })).toBe("住民a：家");
    expect(awayLine({ key: "b", name: "住民b", where: "場所不明" })).toBe("住民b：場所不明");
  });
});

describe("住民との会話の見出し（#32 までの仮）", () => {
  it("選んだ住民の名前と、サンプル・AI 未接続であることを出す", () => {
    expect(talkTitle("住民a")).toBe("住民aとの会話（サンプル・AI未接続）");
    expect(talkTitle("住民c")).toBe("住民cとの会話（サンプル・AI未接続）");
  });
});

// ここから下は Rails が返す実際の地図（backend/config/towns/festival-street.json）の立ち位置を確かめる
type Box = { x0: number; x1: number; y0: number; y1: number };
const body = (p: { x: number; y: number }): Box => ({ x0: p.x - RESIDENT_HIT.halfW, x1: p.x + RESIDENT_HIT.halfW, y0: p.y - RESIDENT_HIT.top, y1: p.y + RESIDENT_HIT.bottom });
const shopBox: Box = { x0: SHOP.pos.x + SHOP.hit.x, x1: SHOP.pos.x + SHOP.hit.x + SHOP.hit.w, y0: SHOP.pos.y + SHOP.hit.y, y1: SHOP.pos.y + SHOP.hit.y + SHOP.hit.h };
const overlaps = (a: Box, b: Box) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

describe("実際の地図の立ち位置", () => {
  it.each(["plaza", "shop"])("%s には3人分の立ち位置があり、どれも歩ける範囲に立てる", (key) => {
    const stands = TOWN.places?.[key]?.stands ?? [];
    expect(stands).toHaveLength(3);
    for (const p of stands) expect(allowed(TOWN, p.x, p.y), `${key} (${p.x}, ${p.y})`).toBe(true);
  });

  it.each(["plaza", "shop"])("%s の3人は、タップの範囲（体）が互いに重ならない", (key) => {
    const stands = TOWN.places?.[key]?.stands ?? [];
    expect(stands).toHaveLength(3);
    for (let i = 0; i < stands.length; i++) {
      for (let j = i + 1; j < stands.length; j++) expect(overlaps(body(stands[i]), body(stands[j])), `${key} ${i}と${j}`).toBe(false);
    }
  });

  it("店先の3人は、スクーター修理のタップの範囲に重ならない（店と住民をそれぞれタップできる）", () => {
    const stands = TOWN.places?.shop?.stands ?? [];
    expect(stands).toHaveLength(3);
    for (const p of stands) expect(overlaps(body(p), shopBox), `(${p.x}, ${p.y})`).toBe(false);
  });

  it("家（home_a・home_b・home_c）は街の絵の外として持つ", () => {
    expect(TOWN.offstage).toEqual({ home_a: "家", home_b: "家", home_c: "家" });
  });
});
