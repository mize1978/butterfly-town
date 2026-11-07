import { describe, expect, it } from "vitest";
import { TOWN } from "../test/town";
import { allowed } from "../core/world";
import { advance, PART, PART_FIND, partPlaced, partsHeld, SHOP, shopReply, type Errand } from "./errand";
import { SAMPLE_RESIDENT, TALK_RANGE } from "./sample-resident";
import { Session } from "./session";

const run = (s: Session, sec: number, dt = 1 / 60) => { for (let t = 0; t < sec; t += dt) s.tick(dt); };
// 押し続けて歩き、離して止まる
const walkTo = (s: Session, p: { x: number; y: number }, sec = 5) => { s.press(p); run(s, sec); s.release(); run(s, 0.3); };
const atShop = { x: 620, y: 530 }; // スクーター修理の店先の前（歩ける所）
const atPart = { x: 1050, y: 845 }; // 部品のすぐ手前（歩ける所）
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

describe("スクーター修理と部品の置き場所", () => {
  it("店先の前と部品のそばは歩けて、話せる（調べられる）距離に入れる", () => {
    for (const [p, spot] of [[atShop, SHOP], [atPart, PART]] as const) {
      expect(allowed(TOWN, p.x, p.y)).toBe(true);
      expect(dist(p, spot.pos)).toBeLessThan(TALK_RANGE);
    }
  });

  it("出現位置からはどちらも届かず、住民・スクーター修理・部品の話せる範囲は重ならない", () => {
    const all = [{ pos: SAMPLE_RESIDENT.pos, range: TALK_RANGE }, { pos: SHOP.pos, range: SHOP.range! }, { pos: PART.pos, range: TALK_RANGE }];
    for (const a of all) expect(dist(a.pos, TOWN.spawn)).toBeGreaterThan(a.range);
    for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) expect(dist(all[i].pos, all[j].pos)).toBeGreaterThan(all[i].range + all[j].range);
  });

  it("スクーター修理は店先の右端の前に立っても話せる（店先が横に広いので、話せる距離は 150）", () => {
    const rightEnd = { x: 708, y: 562 }; // スマホで店先の右端の前に立った位置（実測）
    expect(allowed(TOWN, rightEnd.x, rightEnd.y)).toBe(true);
    expect(SHOP.range).toBe(150);
    expect(dist(rightEnd, SHOP.pos)).toBeLessThanOrEqual(SHOP.range!);
    expect(PART.range).toBeUndefined(); // 部品は住民と同じ 120
  });
});

describe("依頼の進み方", () => {
  it("受ける → 部品を受け取る → 渡す の順にだけ進み、順番が違う操作は何もしない", () => {
    let e: Errand = "offered";
    expect(advance(e, "take")).toBe("offered");
    expect(advance(e, "deliver")).toBe("offered");
    e = advance(e, "accept");
    expect(e).toBe("accepted");
    expect(advance(e, "deliver")).toBe("accepted");
    e = advance(e, "take");
    expect(e).toBe("found");
    expect(advance(e, "take")).toBe("found"); // 同じ部品を二度受け取らない
    e = advance(e, "deliver");
    expect(e).toBe("delivered");
    expect(advance(e, "accept")).toBe("delivered");
  });

  it("部品は依頼を受けている間だけ置かれ、持っている数は拾ってから 1", () => {
    expect((["offered", "accepted", "found", "delivered"] as const).map(partPlaced)).toEqual([false, true, false, false]);
    expect((["offered", "accepted", "found", "delivered"] as const).map(partsHeld)).toEqual([0, 0, 1, 1]);
  });

  it("スクーター修理の返答は状態ごとに変わり、操作は「依頼を受ける」「部品を渡す」の2つだけ", () => {
    expect(shopReply("offered").action?.step).toBe("accept");
    expect(shopReply("accepted").action).toBeUndefined();
    expect(shopReply("found").action?.step).toBe("deliver");
    expect(shopReply("delivered").action).toBeUndefined();
    const texts = (["offered", "accepted", "found", "delivered"] as const).map((e) => shopReply(e).lines.map((l) => l.text).join());
    expect(new Set(texts).size).toBe(4);
    expect(PART_FIND.action?.step).toBe("take");
  });
});

describe("街の中で依頼を進める", () => {
  it("スクーター修理で受け、部品まで歩いて受け取り、スクーター修理へ戻って渡せる", () => {
    const s = new Session(TOWN);
    expect(s.nearSpot).toBeNull();
    expect(s.spots().map((p) => p.id)).toEqual(["resident", "shop"]); // 受ける前は部品がない

    walkTo(s, atShop);
    expect(s.nearSpot).toBe("shop");
    s.step("accept");
    expect(s.errand).toBe("accepted");
    expect(s.spots().map((p) => p.id)).toContain("part");

    walkTo(s, TOWN.spawn);
    walkTo(s, atPart);
    expect(s.nearSpot).toBe("part");
    s.step("take");
    expect(s.errand).toBe("found");
    expect(s.nearSpot).toBeNull(); // 拾った部品は街から消える
    expect(s.spots().map((p) => p.id)).not.toContain("part");

    walkTo(s, TOWN.spawn);
    walkTo(s, atShop);
    expect(s.nearSpot).toBe("shop");
    s.step("deliver");
    expect(s.errand).toBe("delivered");
  });

  it("住民のそばでは今までどおり住民と話せる（スクーター修理と取り違えない）", () => {
    const s = new Session(TOWN);
    walkTo(s, SAMPLE_RESIDENT.pos, 4);
    expect(s.nearSpot).toBe("resident");
    expect(s.nearResident).toBe(true);
  });

  it("依頼の状態が変わると subscribe の相手に知らせる", () => {
    const s = new Session(TOWN);
    let calls = 0;
    s.subscribe(() => calls++);
    s.step("accept");
    expect(calls).toBeGreaterThan(0);
    const before = calls;
    s.step("accept"); // 変わらない操作では知らせない
    expect(calls).toBe(before);
  });
});

describe("スマホでスクーター修理・部品をタップしたとき", () => {
  const onShop = { x: SHOP.pos.x, y: SHOP.pos.y - 150 };
  const onPart = { x: PART.pos.x, y: PART.pos.y - 10 };

  it("スクーター修理の店先に当たったら選ぶだけで、主人公は歩き出さない", () => {
    const s = new Session(TOWN);
    expect(s.tapSpot(onShop)).toBe(true);
    run(s, 1);
    expect(s.selectedSpot).toBe("shop");
    expect(s.sim.pos).toEqual(TOWN.spawn);
    expect(s.sim.target).toBeNull();
  });

  it("名札の範囲を押しても選べる", () => {
    const s = new Session(TOWN);
    const tag = { x: 540, y: 160, w: 90, h: 27 };
    expect(s.tapSpot({ x: tag.x + 1, y: tag.y + 13 }, { shop: tag })).toBe(true);
    expect(s.selectedSpot).toBe("shop");
  });

  it("部品は置かれる前は選べず、置かれたら選べ、受け取ると選択が外れる", () => {
    const s = new Session(TOWN);
    expect(s.tapSpot(onPart)).toBe(false);
    s.step("accept");
    expect(s.tapSpot(onPart)).toBe(true);
    expect(s.selectedSpot).toBe("part");
    s.step("take");
    expect(s.selectedSpot).toBeNull();
    expect(s.tapSpot(onPart)).toBe(false);
  });

  it("止めている間（メニュー・会話中）は選ばない", () => {
    const s = new Session(TOWN);
    s.pause();
    expect(s.tapSpot(onShop)).toBe(false);
  });
});

describe("スマホ：近くでタップするとすぐ開き、遠くでは案内だけ", () => {
  const onShop = { x: SHOP.pos.x, y: SHOP.pos.y - 150 };
  const opened = (s: Session) => { const ids: string[] = []; s.onOpen = (id) => ids.push(id); return ids; };

  it("近くの住民・名札・スクーター修理・部品をタップすると、その画面を開き、歩き出さない", () => {
    const s = new Session(TOWN);
    walkTo(s, atShop);
    const ids = opened(s), at = { ...s.sim.pos };
    const tag = { x: 520, y: 160, w: 120, h: 27 };
    expect(s.tapSpot({ x: tag.x + 2, y: tag.y + 10 }, { shop: tag })).toBe(true); // 看板の名札の端
    expect(s.tapSpot(onShop)).toBe(true);
    run(s, 0.5);
    expect(ids).toEqual(["shop", "shop"]);
    expect(s.sim.pos).toEqual(at);
    expect(s.sim.target).toBeNull();
    expect(s.selectedSpot).toBeNull(); // 開いたときは「近づくと」の案内を出さない

    s.step("accept");
    walkTo(s, TOWN.spawn);
    walkTo(s, atPart);
    expect(s.tapSpot({ x: PART.pos.x, y: PART.pos.y - 10 })).toBe(true);
    expect(ids).toEqual(["shop", "shop", "part"]);

    const r = new Session(TOWN), rIds = opened(r);
    walkTo(r, SAMPLE_RESIDENT.pos, 4);
    expect(r.tapResident({ x: SAMPLE_RESIDENT.pos.x, y: SAMPLE_RESIDENT.pos.y - 80 })).toBe(true);
    expect(rIds).toEqual(["resident"]);
  });

  it("遠くでタップすると開かずに選ぶだけ（案内用）で、案内は消せる", () => {
    const s = new Session(TOWN), ids = opened(s);
    expect(s.tapSpot(onShop)).toBe(true);
    expect(ids).toEqual([]);
    expect(s.selectedSpot).toBe("shop");
    s.clearSelection();
    expect(s.selectedSpot).toBeNull();
    expect(s.sim.target).toBeNull();
  });

  it("会話中（止めている間）はタップしても開かない", () => {
    const s = new Session(TOWN);
    walkTo(s, atShop);
    const ids = opened(s);
    s.pause();
    expect(s.tapSpot(onShop)).toBe(false);
    expect(ids).toEqual([]);
  });
});
