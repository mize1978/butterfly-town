// S09 バイク屋・依頼（Figma の画面名。街での呼び方は「スクーター修理」にそろえる）／S10 部品の発見／S11 修理パズル の試作。
// 「スクーター修理で依頼を受ける → 街で部品を4つ集める → 店の作業台で、合う場所にはめてスクーターを直す」までを作る。
// 返答は固定の文で、AIには接続していない。進み具合はこの街を開いている間だけ持ち、保存しない（DB は ER 図の承認後）。
// 修理の決まり（部品4つ・取り付ける順番・向き）は、着せ替え×スクーター統合モック
// （~/outputs/butterfly-wardrobe-scooter-mock-v1/mock/repair.js）と同じ。モックと違い、カバーも店でもらわず街で拾う。
// 部品の置き場所・文は仮。スクーターに乗る機能はまだ作らない（乗れる場所は別に決める）
import type { Point } from "../core/world";
import type { Rect, SampleLine } from "./sample-resident";

export type PartId = "wheel" | "belt" | "battery" | "cover";
export const PART_IDS: readonly PartId[] = ["wheel", "belt", "battery", "cover"];

// rotation：はめられる向き（度）。initial：拾ったときの向き。depends：先に付けておく部品。where：見つけた場所（文に使う）
type PartDef = { name: string; pos: Point; rotation: number; initial: number; depends: readonly PartId[]; hint: string; where: string };
export const PARTS: Record<PartId, PartDef> = {
  wheel: { name: "後輪", pos: { x: 1050, y: 870 }, rotation: 0, initial: 0, depends: [], hint: "まず足元を安定させよう。丸い車軸へ。", where: "階段の下" },
  belt: { name: "駆動ベルト", pos: { x: 760, y: 680 }, rotation: 90, initial: 0, depends: ["wheel"], hint: "後輪を付けてから。長い輪を横向きに。", where: "橋のたもと" },
  battery: { name: "バッテリー", pos: { x: 900, y: 470 }, rotation: 0, initial: 180, depends: ["belt"], hint: "駆動部分を組んでから。＋端子が上を向くように。", where: "店の並びの石畳" },
  cover: { name: "サイドカバー", pos: { x: 1290, y: 505 }, rotation: 0, initial: 0, depends: ["wheel", "belt", "battery"], hint: "中の部品をすべて付けたら、最後に閉じよう。", where: "右の階段のそば" }
};

// 街の中で近づいて使える場所。hit はタップで選ぶ範囲（pos からの相対・論理座標）。
// range は話せる（調べられる）距離で、省略すると住民と同じ TALK_RANGE
export type PartSpotId = `part-${PartId}`;
export type SpotId = "resident" | "shop" | PartSpotId;
export type Spot = { id: SpotId; name: string; pos: Point; hit: Rect; range?: number };
export const partSpotId = (id: PartId): PartSpotId => `part-${id}`;
export const partOfSpot = (id: SpotId): PartId | null => (id.startsWith("part-") ? (id.slice(5) as PartId) : null);

// スクーター修理（の店）：街の絵の左上にある作業場の前（店先に修理中のスクーターが描かれている）。pos は店先の地面（話せる距離はここから測る）、hit は店先の絵の範囲。
// 店先は横に広い（約220）ので、話せる距離は住民より少し広い 150（店先の右端の前に立っても話せる）
export const SHOP: Spot = { id: "shop", name: "スクーター修理", pos: { x: 600, y: 480 }, hit: { x: -110, y: -280, w: 220, h: 290 }, range: 150 };
// 部品は地面に置いた印（タップの範囲は印と少し上まで）
export const partSpot = (id: PartId): Spot => ({ id: partSpotId(id), name: PARTS[id].name, pos: PARTS[id].pos, hit: { x: -36, y: -50, w: 72, h: 70 } });

// 依頼と修理の進み具合。collected：拾った部品、placed：作業台で付けた部品（付けた順）、rotations：いまの向き
export type Repair = {
  accepted: boolean;
  collected: readonly PartId[];
  placed: readonly PartId[];
  rotations: Readonly<Record<PartId, number>>;
  done: boolean;
};
const initialRotations = () => Object.fromEntries(PART_IDS.map((id) => [id, PARTS[id].initial])) as Record<PartId, number>;
export const START: Repair = { accepted: false, collected: [], placed: [], rotations: initialRotations(), done: false };

// 部品は依頼を受けてから、拾うまでの間だけ街に置く（同じ部品を二度拾わない）
export const partsInTown = (r: Repair): PartId[] => (r.accepted ? PART_IDS.filter((id) => !r.collected.includes(id)) : []);
export const missingParts = (r: Repair): PartId[] => PART_IDS.filter((id) => !r.collected.includes(id));

// 操作の結果。ok でなければ状態は変えず、理由を出す（部品はなくならない）
export type Outcome = { ok: boolean; next: Repair; message: string };
const no = (r: Repair, message: string): Outcome => ({ ok: false, next: r, message });
const yes = (next: Repair, message: string): Outcome => ({ ok: true, next, message });

export function accept(r: Repair): Outcome {
  if (r.accepted) return no(r, "依頼はもう受けています。");
  return yes({ ...r, accepted: true }, "依頼を受けました。街で部品を4つ探そう。");
}

export function collect(r: Repair, id: PartId): Outcome {
  if (!r.accepted) return no(r, "先にスクーター修理で依頼を受けよう。");
  if (r.collected.includes(id)) return no(r, `${PARTS[id].name}はもう持っています。`);
  return yes({ ...r, collected: [...r.collected, id] }, `${PARTS[id].name}を受け取りました。`);
}

export function rotate(r: Repair, id: PartId): Outcome {
  if (r.done) return no(r, "修理は終わっています。");
  if (!r.collected.includes(id) || r.placed.includes(id)) return no(r, "回せる部品がありません。");
  return yes({ ...r, rotations: { ...r.rotations, [id]: (r.rotations[id] + 90) % 360 } }, `${PARTS[id].name}の向きを90°変えました。`);
}

// 部品 id を取り付け位置 slot にはめる。場所・順番・向きのどれかが合わなければ、はめずに理由を返す
export function place(r: Repair, id: PartId, slot: PartId): Outcome {
  if (r.done) return no(r, "修理は終わっています。");
  if (!r.collected.includes(id)) return no(r, "この部品はまだ見つかっていません。");
  if (r.placed.includes(id)) return no(r, "この部品は取り付け済みです。");
  if (id !== slot) return no(r, "形が合わないみたい。別の場所を試そう。");
  const missing = PARTS[id].depends.filter((p) => !r.placed.includes(p));
  if (missing.length) return no(r, `${missing.map((p) => PARTS[p].name).join("・")}を先に取り付けよう。`);
  if (r.rotations[id] !== PARTS[id].rotation) {
    return no(r, id === "battery" ? "＋端子が逆向き。回転して上に合わせよう。" : "向きが合わない。回転してガイドに合わせよう。");
  }
  return yes({ ...r, placed: [...r.placed, id] }, `カチッ！ ${PARTS[id].name}がぴったり収まりました。`);
}

// ひとつ戻す（最後に付けた部品を外す）／組み立て直す（全部外して向きも最初に戻す）。拾った部品はなくならない
export function undo(r: Repair): Outcome {
  if (r.done) return no(r, "直したスクーターは分解できません。");
  const last = r.placed[r.placed.length - 1];
  if (!last) return no(r, "外せる部品がありません。");
  return yes({ ...r, placed: r.placed.slice(0, -1) }, `${PARTS[last].name}を外しました。`);
}
export function restart(r: Repair): Outcome {
  if (r.done) return no(r, "修理は終わっています。");
  return yes({ ...r, placed: [], rotations: initialRotations() }, "部品はそのまま。もう一度組み立ててみよう。");
}

// 4つ全部はめたら、エンジンをかけて修理完了（一度だけ）
export function finish(r: Repair): Outcome {
  if (r.done) return no(r, "修理は終わっています。");
  if (r.placed.length !== PART_IDS.length) return no(r, "まだ取り付けていない部品があります。");
  return yes({ ...r, done: true }, "エンジンがかかった！ スクーターが直りました。");
}

// スクーター修理の固定の返答。状態ごとに変わり、最後の文で使える操作（あれば）を1つ添える
export type ShopAction = "accept" | "bench";
export type Reply = { lines: readonly SampleLine[]; action?: { kind: ShopAction; label: string } };
export function shopReply(r: Repair): Reply {
  if (!r.accepted) {
    return {
      lines: [
        { speaker: "resident", text: "古いスクーターを直してみない？" },
        { speaker: "resident", text: "後輪・駆動ベルト・バッテリー・サイドカバーの4つが足りなくてね。街で見かけたら集めてきてほしいんだ。" },
        { speaker: "note", text: "集めた部品は、この店の作業台で組み立てます。" }
      ],
      action: { kind: "accept", label: "依頼を受ける" }
    };
  }
  if (r.done) {
    return {
      lines: [
        { speaker: "resident", text: "いい音になったね！ 君が直したスクーターだよ。" },
        { speaker: "note", text: "スクーターに乗る機能は、まだこの版にはありません。" }
      ]
    };
  }
  const missing = missingParts(r);
  if (missing.length) {
    return {
      lines: [
        { speaker: "resident", text: `まだ足りないのは、${missing.map((id) => PARTS[id].name).join("・")}。` },
        { speaker: "resident", text: `${missing.map((id) => PARTS[id].where).join("、")}のあたりで見かけたって話だよ。集めた分から組み立ててもいいよ。` }
      ],
      action: { kind: "bench", label: "作業台を開く" }
    };
  }
  return { lines: [{ speaker: "resident", text: "4つそろったね！ 作業台で、合う場所にはめてみよう。" }], action: { kind: "bench", label: "作業台を開く" } };
}

// 部品を調べたときの文（S10）。受け取ると持ち物に入り、街から消える
export const partFind = (id: PartId): readonly SampleLine[] => [
  { speaker: "note", text: `${PARTS[id].name}を見つけた。スクーター修理に頼まれていた部品のようだ。` }
];
