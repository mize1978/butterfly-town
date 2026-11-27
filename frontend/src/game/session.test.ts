import { describe, expect, it } from "vitest";
import { TOWN } from "../test/town";
import { allowed } from "../core/world";
import { SAMPLE_RESIDENT, TALK_RANGE } from "./sample-resident";
import { RESUME_GUARD, Session } from "./session";
import { SHOP } from "./errand";

const run = (s: Session, sec: number, dt = 1 / 60) => { for (let t = 0; t < sec; t += dt) s.tick(dt); };
const east = { x: TOWN.spawn.x + 300, y: TOWN.spawn.y };
// 住民1人の街（距離・タップの決まりを確かめる。位置は以前の仮の住民と同じ）
const ONE = { key: "a", name: "住民a", pos: SAMPLE_RESIDENT.pos };
const one = () => new Session(TOWN, [ONE]);

describe("メニューを開いている間の街", () => {
  it("開くと歩いている途中でもその場で止まり、それ以上進まない", () => {
    const s = new Session(TOWN);
    s.press(east);
    run(s, 0.5);
    s.pause();
    const at = { ...s.sim.pos };
    run(s, 1);
    expect(s.sim.pos).toEqual(at);
    expect(s.sim.moving).toBe(false);
  });

  it("開いている間に押しても歩かない", () => {
    const s = new Session(TOWN);
    s.pause();
    s.press(east);
    run(s, 1);
    expect(s.sim.pos).toEqual(TOWN.spawn);
    expect(s.sim.target).toBeNull();
  });

  it("閉じると同じ位置・同じ向き・同じカメラから続き、また歩ける", () => {
    const s = new Session(TOWN);
    s.press(east);
    run(s, 0.6);
    s.release();
    run(s, 2); // カメラが追いつくまで待つ
    const pos = { ...s.sim.pos }, heading = s.sim.heading, view = { ...s.view };
    s.pause();
    run(s, 2);
    s.resume();
    expect(s.sim.pos).toEqual(pos);
    expect(s.sim.heading).toBe(heading);
    expect(s.view.x).toBeCloseTo(view.x, 3);
    expect(s.view.y).toBeCloseTo(view.y, 3);
    expect(s.sim.pos).not.toEqual(TOWN.spawn);
    run(s, RESUME_GUARD); // 閉じた直後の連打は受け流すので、少し待ってから押す
    s.press(east);
    run(s, 0.3);
    expect(s.sim.pos.x).toBeGreaterThan(pos.x);
  });
});

describe("仮の住民に話しかけられる距離", () => {
  const r = SAMPLE_RESIDENT.pos;

  it("住民は歩ける範囲にいて、出現位置からは少し歩かないと届かない", () => {
    expect(allowed(TOWN, r.x, r.y)).toBe(true);
    expect(Math.hypot(r.x - TOWN.spawn.x, r.y - TOWN.spawn.y)).toBeGreaterThan(TALK_RANGE);
    expect(one().nearResident).toBe(false);
  });

  it("住民の方へ歩くと近くにいる状態になり、知らせは変わったときに1回だけ届く", () => {
    const s = one();
    // 知らせは「歩いた」の合図でも届くので、近さが変わった回数だけを数える
    let changes = 0, last = s.nearResident;
    s.subscribe(() => { if (s.nearResident !== last) { changes++; last = s.nearResident; } });
    s.press(r);
    run(s, 3);
    expect(s.nearResident).toBe(true);
    expect(changes).toBe(1);
  });

  it("会話中（止めている間）は住民の近くから動かず、閉じると同じ位置から続く", () => {
    const s = one();
    s.press(r);
    run(s, 3);
    s.release();
    run(s, 0.5);
    const at = { ...s.sim.pos };
    s.pause();
    s.press(TOWN.spawn);
    run(s, 2);
    s.resume();
    expect(s.sim.pos).toEqual(at);
    expect(s.nearResident).toBe(true);
  });
});

describe("スマホで住民をタップしたとき", () => {
  const onResident = { x: SAMPLE_RESIDENT.pos.x, y: SAMPLE_RESIDENT.pos.y - 80 };

  it("住民に当たったら選ぶだけで、主人公は歩き出さない", () => {
    const s = one();
    expect(s.tapSpot(onResident)).toBe(true);
    run(s, 1);
    expect((s.selectedSpot === "resident-a")).toBe(true);
    expect(s.sim.pos).toEqual(TOWN.spawn);
    expect(s.sim.target).toBeNull();
  });

  // 名札の範囲（描画側が渡す）。スマホの名札は体より少し広い。名前が長いなどでさらに広い場合も確かめる。
  // どちらも左右の端は体の当たり範囲（±40）の外にある
  const R = SAMPLE_RESIDENT.pos;
  const tag = (halfW: number, h: number) => ({ x: R.x - halfW, y: R.y - 207 - h, w: halfW * 2, h });
  for (const [label, t] of [["スマホの名札", tag(53, 27)], ["さらに広い名札", tag(76, 38)]] as const) {
    it(`${label}：名札の中央・左端・右端のどこを押しても選べ、歩き出さない`, () => {
      const midY = t.y + t.h / 2;
      for (const x of [R.x, t.x + 1, t.x + t.w - 1]) {
        const s = one();
        expect(s.tapSpot({ x, y: midY }, { "resident-a": t })).toBe(true);
        run(s, 0.5);
        expect(s.sim.pos).toEqual(TOWN.spawn);
        expect(s.sim.target).toBeNull();
      }
    });

    it(`${label}：名札から少し外れた所は選ばない（地面への移動になる）`, () => {
      const s = one();
      expect(s.tapSpot({ x: t.x + t.w + 20, y: t.y + t.h / 2 }, { "resident-a": t })).toBe(false);
      expect(s.tapSpot({ x: R.x, y: t.y - 20 }, { "resident-a": t })).toBe(false);
    });
  }

  it("住民から外れたタップは選ばない（そのあと地面を押せば歩く）", () => {
    const s = one();
    expect(s.tapSpot(east)).toBe(false);
    expect((s.selectedSpot === "resident-a")).toBe(false);
  });

  it("地面を押すと選択が外れ、話せる距離を離れても外れる", () => {
    const s = one();
    s.tapSpot(onResident);
    s.press(east);
    expect((s.selectedSpot === "resident-a")).toBe(false);
  });

  it("止めている間（メニュー・会話中）は選ばない", () => {
    const s = one();
    s.pause();
    expect(s.tapSpot(onResident)).toBe(false);
  });

  it("話せる距離は今までどおり 120", () => {
    expect(TALK_RANGE).toBe(120);
  });

  it("一度歩くと「歩いた」になる（移動の説明を消す合図）", () => {
    const s = new Session(TOWN);
    expect(s.hasWalked).toBe(false);
    s.press(east);
    run(s, 0.3);
    expect(s.hasWalked).toBe(true);
  });
});

describe("会話やメニューを閉じた直後の入力（閉じるボタンの連打・ダブルタップ）", () => {
  const closeThenTap = (act: (s: Session) => void) => {
    const s = new Session(TOWN);
    s.pause();
    run(s, 1);
    s.resume();
    const at = { ...s.sim.pos };
    act(s); // 閉じた直後（同じ指の2回目のタップ）
    run(s, 1);
    return { s, at };
  };
  it("閉じた直後の地面へのタップでは歩き出さない", () => {
    const { s, at } = closeThenTap((s) => s.goTo(east));
    expect(s.sim.pos).toEqual(at);
  });
  it("閉じた直後に押し始めても歩き出さない", () => {
    const { s, at } = closeThenTap((s) => { s.press(east); });
    s.release();
    expect(s.sim.pos).toEqual(at);
  });
  it("少し待てば、また歩ける", () => {
    const s = new Session(TOWN);
    s.pause();
    s.resume();
    run(s, 0.5);
    const x = s.sim.pos.x;
    s.goTo(east);
    run(s, 0.5);
    expect(s.sim.pos.x).toBeGreaterThan(x);
  });
});

// #31：仮の住民1人を、Rails が返した3人に置き換える。場所が変わったら（時間帯を進めたら）置き直す
describe("街の3人の住民（setResidents）", () => {
  const near = { x: TOWN.spawn.x + 50, y: TOWN.spawn.y };
  const away = { x: TOWN.spawn.x + 400, y: TOWN.spawn.y };
  const resident = (key: string, pos: { x: number; y: number }) => ({ key, name: `住民${key}`, pos });
  const ids = (s: Session) => s.spots().map((x) => x.id).filter((id) => id.startsWith("resident"));

  it("受け取った住民だけが話せる場所になり、id は住民ごとに分かれる", () => {
    const s = new Session(TOWN);
    s.setResidents([resident("a", away), resident("b", near)]);
    expect(ids(s)).toEqual(["resident-a", "resident-b"]);
    s.setResidents([]);
    expect(ids(s)).toEqual([]);
  });

  it("近くの住民をタップすると、その住民の会話を開く", () => {
    const s = new Session(TOWN);
    s.setResidents([resident("a", away), resident("b", near)]);
    const opened: string[] = [];
    s.onOpen = (id) => opened.push(id);
    expect(s.nearSpot).toBe("resident-b");
    expect(s.tapSpot({ x: near.x, y: near.y - 100 })).toBe(true);
    expect(opened).toEqual(["resident-b"]);
  });

  it("近くにいた住民が別の場所へ移ったら、話せる相手と選択から外れる", () => {
    const s = new Session(TOWN);
    s.setResidents([resident("b", near)]);
    expect(s.nearSpot).toBe("resident-b");
    s.setResidents([resident("b", away)]);
    expect(s.nearSpot).toBeNull();
    expect(s.selectedSpot).toBeNull();
  });

  it("店先に3人いても、店の絵と住民をそれぞれタップで選べる", () => {
    const s = new Session(TOWN);
    const stands = TOWN.places?.shop?.stands ?? [];
    expect(stands).toHaveLength(3);
    s.setResidents(["a", "b", "c"].map((k, i) => resident(k, stands[i])));
    expect(s.tapSpot({ x: SHOP.pos.x, y: SHOP.pos.y - 140 })).toBe(true);
    expect(s.selectedSpot).toBe("shop");
    ["a", "b", "c"].forEach((k, i) => {
      expect(s.tapSpot({ x: stands[i].x, y: stands[i].y - 100 })).toBe(true);
      expect(s.selectedSpot).toBe(`resident-${k}`);
    });
  });
});
