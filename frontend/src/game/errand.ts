// S09 バイク屋・依頼（Figma の画面名。街での呼び方は「スクーター修理」にそろえる）／S10 部品の発見 の試作。「スクーター修理で依頼を受ける → 街で部品を1つ拾う → スクーター修理へ戻る」だけを作る。
// 返答は固定の文で、AIには接続していない。進み具合はこの街を開いている間だけ持ち、保存しない（DB は ER 図の承認後）。
// 修理パズル・スクーターの獲得は次の区切りで作る。部品の名前・種類・個数・置き場所は仮
import type { Point } from "../core/world";
import type { Rect, SampleLine } from "./sample-resident";

// 依頼の状態：まだ受けていない → 受けた（部品を探す）→ 部品を持っている → スクーター修理に渡した
export type Errand = "offered" | "accepted" | "found" | "delivered";

// 街の中で近づいて使える場所。hit はタップで選ぶ範囲（pos からの相対・論理座標）。
// range は話せる（調べられる）距離で、省略すると住民と同じ TALK_RANGE
export type SpotId = "resident" | "shop" | "part";
export type Spot = { id: SpotId; name: string; pos: Point; hit: Rect; range?: number };

// スクーター修理（の店）：街の絵の左上にある作業場の前（店先に修理中のスクーターが描かれている）。pos は店先の地面（話せる距離はここから測る）、hit は店先の絵の範囲。
// 店先は横に広い（約220）ので、話せる距離は住民より少し広い 150（店先の右端の前に立っても話せる）
export const SHOP: Spot = { id: "shop", name: "スクーター修理", pos: { x: 600, y: 480 }, hit: { x: -110, y: -280, w: 220, h: 290 }, range: 150 };
// 部品（仮）：出現位置から右下の階段の方へ歩いた先の通り（右の花壇より左で、主人公が植栽に隠れない所）。依頼を受けている間だけ置く
export const PART: Spot = { id: "part", name: "部品（仮）", pos: { x: 1050, y: 870 }, hit: { x: -36, y: -50, w: 72, h: 70 } };

// 依頼を受けると部品が置かれ、拾うと消える（同じ部品を二度拾わない）
export const partPlaced = (e: Errand) => e === "accepted";

// 必要な部品の数と、持っている（渡した）数。表示用
export const PARTS_NEEDED = 1;
export const partsHeld = (e: Errand) => (e === "found" || e === "delivered" ? 1 : 0);

// 次へ進める操作。決まった順にしか進まない（それ以外は何もしない）
export type ErrandStep = "accept" | "take" | "deliver";
const NEXT: Record<ErrandStep, [from: Errand, to: Errand]> = {
  accept: ["offered", "accepted"],
  take: ["accepted", "found"],
  deliver: ["found", "delivered"]
};
export function advance(e: Errand, step: ErrandStep): Errand {
  const [from, to] = NEXT[step];
  return e === from ? to : e;
}

// スクーター修理の固定の返答。状態ごとに変わり、最後の文で使える操作（あれば）を1つ添える
export type Reply = { lines: readonly SampleLine[]; action?: { step: ErrandStep; label: string } };
export function shopReply(e: Errand): Reply {
  switch (e) {
    case "offered":
      return {
        lines: [
          { speaker: "resident", text: "古いスクーターを直してみない？" },
          { speaker: "resident", text: "部品が1つ足りなくてね。街のどこかで見かけたら、持ってきてほしいんだ。" }
        ],
        action: { step: "accept", label: "依頼を受ける" }
      };
    case "accepted":
      return { lines: [{ speaker: "resident", text: "部品は、通りの階段の方で見かけたって話だよ。見つけたら持ってきてね。" }] };
    case "found":
      return {
        lines: [{ speaker: "resident", text: "おっ、それだ！ 見つけてくれたんだね。" }],
        action: { step: "deliver", label: "部品を渡す" }
      };
    case "delivered":
      return {
        lines: [
          { speaker: "resident", text: "ありがとう。これで修理に取りかかれるよ。" },
          { speaker: "note", text: "修理パズルとスクーターは、まだこの版にはありません。" }
        ]
      };
  }
}

// 部品を調べたときの文（S10）。受け取ると依頼の状態が「部品を持っている」になる
export const PART_FIND: Reply = {
  lines: [{ speaker: "note", text: "部品（仮）を見つけた。スクーター修理に頼まれていた部品のようだ。" }],
  action: { step: "take", label: "部品を受け取る" }
};
