import { describe, expect, it } from "vitest";
import { TOWN } from "../test/town";
import { allowed } from "../core/world";
import {
  accept, collect, finish, missingParts, PART_IDS, PARTS, partSpot, partSpotId, partsInTown, place, restart, rotate, SHOP, shopReply, START, undo,
  type Outcome, type PartId, type Repair
} from "./errand";
import { SAMPLE_RESIDENT, TALK_RANGE } from "./sample-resident";
import { Session } from "./session";

const run = (s: Session, sec: number, dt = 1 / 60) => { for (let t = 0; t < sec; t += dt) s.tick(dt); };
// 押し続けて歩き、離して止まる
const walkTo = (s: Session, p: { x: number; y: number }, sec = 5) => { s.press(p); run(s, sec); s.release(); run(s, 0.3); };
const atShop = { x: 620, y: 530 }; // スクーター修理の店先の前（歩ける所）
// 部品のすぐそば（歩ける所）
const near: Record<PartId, { x: number; y: number }> = {
  wheel: { x: 1050, y: 845 }, belt: { x: 770, y: 665 }, battery: { x: 900, y: 490 }, cover: { x: 1280, y: 515 }
};
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

// 操作をつなげる（途中で失敗したらテストを止める）
const chain = (r: Repair, ...ops: ((r: Repair) => Outcome)[]) => ops.reduce((acc, op) => { const o = op(acc); expect(o.ok, o.message).toBe(true); return o.next; }, r);
const allCollected = () => chain(START, accept, ...PART_IDS.map((id) => (r: Repair) => collect(r, id)));
// 正しい手順：後輪 → ベルトを90°回して → バッテリーを2回回して → カバー
const solve = (r: Repair) => chain(r,
  (x) => place(x, "wheel", "wheel"),
  (x) => rotate(x, "belt"), (x) => place(x, "belt", "belt"),
  (x) => rotate(x, "battery"), (x) => rotate(x, "battery"), (x) => place(x, "battery", "battery"),
  (x) => place(x, "cover", "cover"));

describe("スクーター修理と部品の置き場所", () => {
  it("店先の前と4つの部品のそばは歩けて、話せる（調べられる）距離に入れる", () => {
    expect(allowed(TOWN, atShop.x, atShop.y)).toBe(true);
    expect(dist(atShop, SHOP.pos)).toBeLessThan(SHOP.range!);
    for (const id of PART_IDS) {
      expect(allowed(TOWN, near[id].x, near[id].y), id).toBe(true);
      expect(dist(near[id], PARTS[id].pos), id).toBeLessThan(TALK_RANGE);
    }
  });

  it("出現位置からはどれも届かず、部品どうし・住民・店とは離れている（取り違えない）", () => {
    const all = [SAMPLE_RESIDENT.pos, SHOP.pos, ...PART_IDS.map((id) => PARTS[id].pos)];
    for (const p of all) expect(dist(p, TOWN.spawn)).toBeGreaterThan(TALK_RANGE);
    for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) expect(dist(all[i], all[j])).toBeGreaterThan(150);
  });

  it("スクーター修理は店先の右端の前に立っても話せる（店先が横に広いので、話せる距離は 150）", () => {
    const rightEnd = { x: 708, y: 562 }; // スマホで店先の右端の前に立った位置（実測）
    expect(allowed(TOWN, rightEnd.x, rightEnd.y)).toBe(true);
    expect(dist(rightEnd, SHOP.pos)).toBeLessThanOrEqual(SHOP.range!);
    expect(partSpot("wheel").range).toBeUndefined(); // 部品は住民と同じ 120
  });
});

describe("依頼と部品集め", () => {
  it("依頼を受ける前は部品が街になく、拾えない", () => {
    expect(partsInTown(START)).toEqual([]);
    expect(collect(START, "wheel").ok).toBe(false);
  });

  it("受けると4つの部品が街に置かれ、拾った部品は街から消え、二度は拾えない", () => {
    let r = chain(START, accept);
    expect(partsInTown(r)).toEqual(PART_IDS);
    expect(accept(r).ok).toBe(false);
    r = chain(r, (x) => collect(x, "belt"));
    expect(partsInTown(r)).toEqual(["wheel", "battery", "cover"]);
    expect(collect(r, "belt").ok).toBe(false);
    expect(missingParts(r)).toEqual(["wheel", "battery", "cover"]);
  });

  it("スクーター修理の返答は、受ける前・集め途中・4つそろった・修理後で変わる", () => {
    expect(shopReply(START).action?.kind).toBe("accept");
    const part = chain(START, accept, (x) => collect(x, "wheel"));
    expect(shopReply(part).action?.kind).toBe("bench"); // 集めた分から組み立ててもよい
    expect(shopReply(part).lines.map((l) => l.text).join()).toContain("駆動ベルト・バッテリー・サイドカバー");
    expect(shopReply(allCollected()).lines[0].text).toContain("4つそろった");
    const done = chain(solve(allCollected()), finish);
    expect(shopReply(done).action).toBeUndefined();
    expect(shopReply(done).lines.map((l) => l.text).join()).toContain("乗る機能は、まだこの版にはありません");
  });
});

describe("作業台：部品を合う場所にはめる", () => {
  it("正しい場所・順番・向きでだけはまり、4つはめるとエンジンをかけて修理完了（一度だけ）", () => {
    const r = solve(allCollected());
    expect(r.placed).toEqual(["wheel", "belt", "battery", "cover"]);
    const done = chain(r, finish);
    expect(done.done).toBe(true);
    expect(finish(done).ok).toBe(false);
    expect(undo(done).ok).toBe(false); // 直したスクーターは分解できない
  });

  it("違う場所・順番・向きでは、はまらずに理由を返し、部品はなくならない", () => {
    const r = allCollected();
    expect(place(r, "wheel", "belt")).toMatchObject({ ok: false, message: "形が合わないみたい。別の場所を試そう。" });
    expect(place(r, "belt", "belt").message).toBe("後輪を先に取り付けよう。");
    expect(place(r, "cover", "cover").message).toBe("後輪・駆動ベルト・バッテリーを先に取り付けよう。");
    const w = chain(r, (x) => place(x, "wheel", "wheel"));
    expect(place(w, "belt", "belt").message).toBe("向きが合わない。回転してガイドに合わせよう。");
    const b = chain(w, (x) => rotate(x, "belt"), (x) => place(x, "belt", "belt"));
    expect(place(b, "battery", "battery").message).toBe("＋端子が逆向き。回転して上に合わせよう。"); // 拾ったときは 180°
    expect(b.collected).toEqual(PART_IDS);
  });

  it("まだ拾っていない部品ははめられず、エンジンもかからない", () => {
    const r = chain(START, accept, (x) => collect(x, "wheel"));
    expect(place(r, "belt", "belt").message).toBe("この部品はまだ見つかっていません。");
    expect(finish(chain(r, (x) => place(x, "wheel", "wheel"))).ok).toBe(false);
  });

  it("回転は90°ずつで一周し、付けた部品は回せない", () => {
    let r = allCollected();
    for (const deg of [90, 180, 270, 0]) { r = chain(r, (x) => rotate(x, "belt")); expect(r.rotations.belt).toBe(deg); }
    r = chain(r, (x) => place(x, "wheel", "wheel"));
    expect(rotate(r, "wheel").ok).toBe(false);
  });

  it("ひとつ戻す・組み立て直すをしても、拾った部品は持ったまま", () => {
    const r = chain(allCollected(), (x) => place(x, "wheel", "wheel"), (x) => rotate(x, "belt"), (x) => place(x, "belt", "belt"));
    const back = chain(r, undo);
    expect(back.placed).toEqual(["wheel"]);
    const again = chain(r, restart);
    expect(again.placed).toEqual([]);
    expect(again.rotations).toEqual(START.rotations);
    expect(again.collected).toEqual(PART_IDS);
    expect(undo(again).ok).toBe(false);
  });
});

describe("街の中で依頼を進める", () => {
  it("店で受け、4つの部品まで歩いて拾い、店へ戻って作業台で直せる", () => {
    const s = new Session(TOWN);
    expect(s.nearSpot).toBeNull();
    expect(s.spots().map((p) => p.id)).toEqual(["resident", "shop"]);

    walkTo(s, atShop);
    expect(s.nearSpot).toBe("shop");
    expect(s.act(accept).ok).toBe(true);
    expect(s.spots()).toHaveLength(6);

    for (const id of PART_IDS) {
      walkTo(s, TOWN.spawn);
      walkTo(s, near[id]);
      expect(s.nearSpot, id).toBe(partSpotId(id));
      expect(s.act((r) => collect(r, id)).ok).toBe(true);
      expect(s.nearSpot).toBeNull(); // 拾った部品は街から消える
    }
    expect(s.spots().map((p) => p.id)).toEqual(["resident", "shop"]);

    walkTo(s, TOWN.spawn);
    walkTo(s, atShop);
    expect(s.nearSpot).toBe("shop");
    expect(s.act((r) => ({ ok: true, next: solve(r), message: "" })).ok).toBe(true);
    expect(s.act(finish).ok).toBe(true);
    expect(s.repair.done).toBe(true);
  });

  it("合わない操作は状態を変えず、知らせもしない", () => {
    const s = new Session(TOWN);
    let calls = 0;
    s.subscribe(() => calls++);
    expect(s.act((r) => collect(r, "wheel")).ok).toBe(false);
    expect(calls).toBe(0);
    expect(s.repair).toBe(START);
    s.act(accept);
    expect(calls).toBeGreaterThan(0);
  });

  it("住民のそばでは今までどおり住民と話せる（店や部品と取り違えない）", () => {
    const s = new Session(TOWN);
    s.act(accept);
    walkTo(s, SAMPLE_RESIDENT.pos, 4);
    expect(s.nearSpot).toBe("resident");
  });
});

describe("スマホ：近くでタップするとすぐ開き、遠くでは案内だけ", () => {
  const onShop = { x: SHOP.pos.x, y: SHOP.pos.y - 150 };
  const onPart = (id: PartId) => ({ x: PARTS[id].pos.x, y: PARTS[id].pos.y - 10 });
  const opened = (s: Session) => { const ids: string[] = []; s.onOpen = (id) => ids.push(id); return ids; };

  it("近くの店（店先・看板の名札）・部品・住民をタップすると、その画面を開き、歩き出さない", () => {
    const s = new Session(TOWN);
    walkTo(s, atShop);
    const ids = opened(s), at = { ...s.sim.pos };
    const tag = { x: 520, y: 160, w: 120, h: 27 };
    expect(s.tapSpot({ x: tag.x + 2, y: tag.y + 10 }, { shop: tag })).toBe(true);
    expect(s.tapSpot(onShop)).toBe(true);
    run(s, 0.5);
    expect(ids).toEqual(["shop", "shop"]);
    expect(s.sim.pos).toEqual(at);
    expect(s.sim.target).toBeNull();
    expect(s.selectedSpot).toBeNull();

    s.act(accept);
    walkTo(s, TOWN.spawn);
    walkTo(s, near.wheel);
    expect(s.tapSpot(onPart("wheel"))).toBe(true);
    expect(ids).toEqual(["shop", "shop", "part-wheel"]);

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

  it("部品は依頼を受ける前は当たらず、拾うと当たらなくなり、選択も外れる", () => {
    const s = new Session(TOWN);
    expect(s.tapSpot(onPart("cover"))).toBe(false);
    s.act(accept);
    expect(s.tapSpot(onPart("cover"))).toBe(true);
    expect(s.selectedSpot).toBe("part-cover");
    s.act((r) => collect(r, "cover"));
    expect(s.selectedSpot).toBeNull();
    expect(s.tapSpot(onPart("cover"))).toBe(false);
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
