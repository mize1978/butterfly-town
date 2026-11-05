// 外見の解決：（進む方向・歩行コマ・止まっているか）から、表示する画像と切り出し範囲を決める。
// 描画側（Phaser）はこの結果だけで人物を描く。値と規則は描画試作（render-spike）の修正後と同じ。
// 今回は女の子・アイボリー衣装だけ（方向ごとの歩行素材と待機姿勢があるのはこの組み合わせだけ）。着せ替えは後の区切りで扱う。
import walkAnchors from "./walk-anchors.json";
import { sheetFor, type Dir, type SheetDir } from "./direction";
import type { Tuning } from "./motion";

export const LOOK = { character: "girl", outfit: "base" } as const;

export type Rect = readonly [number, number, number, number];
// 素材から測った登録情報（描画試作の scripts/measure-walk.mjs で測定）。
// sourceRect＝切り出し範囲、groundAnchor＝足元に合わせる点 [体の中心 x, 足裏 y]（どちらもシート上の座標）
type Registration = { image: string; canvasSize: number[]; frames: { index: number; sourceRect: number[]; groundAnchor: number[] }[] };
const MEASURED = walkAnchors as Record<string, Registration>;

// 頭頂〜足裏の表示の高さ（論理座標）。徒歩・スクーター接続の試作でみぜが了承した 195
export const WALK_HEIGHT = 195;

export type Pose = {
  texture: string; // 画像のキー（= public/art/<texture>.png）
  frame: number; // シート内のコマ番号
  rect: Rect; // 切り出し範囲
  moving: boolean;
  heading: Dir;
  sheet: SheetDir;
  fallback: boolean; // 方向に合うシートが無く、別の向きのシートで代用している
  x: number; y: number; // 足元を置く位置（上下動を含む）
  flip: boolean;
  height: number; // 切り出し範囲を表示する高さ（論理座標）
  originX: number; // 切り出し範囲の幅に対する、足元に合わせる点の位置（0〜1）
  originY: number; // 同じく高さに対する位置
};

// 方向ごとの歩行シートのファイル名。横向きは <人物>-walk-<衣装>、それ以外は <人物>-walk-<向き>-<衣装>
export function walkKey(sheet: SheetDir): string {
  return sheet === "side" ? `${LOOK.character}-walk-${LOOK.outfit}` : `${LOOK.character}-walk-${sheet}-${LOOK.outfit}`;
}
// 待機姿勢（足を寄せた立ち姿）。右向きの5枚を描き、左向きは反転で描く
const IDLE_FOR: Record<Dir, { dir: "s" | "se" | "e" | "ne" | "n"; sheet: SheetDir }> = {
  s: { dir: "s", sheet: "s" }, n: { dir: "n", sheet: "n" },
  se: { dir: "se", sheet: "se" }, sw: { dir: "se", sheet: "se" }, ne: { dir: "ne", sheet: "ne" }, nw: { dir: "ne", sheet: "ne" },
  e: { dir: "e", sheet: "side" }, w: { dir: "e", sheet: "side" }
};
export function idleKey(heading: Dir): string { return `${LOOK.character}-idle-${IDLE_FOR[heading].dir}-${LOOK.outfit}`; }

const SHEET_DIRS: SheetDir[] = ["side", "se", "ne", "s", "n"];
// 登録情報がある向きだけを使う。新しい向きの素材は、複製と測定をすれば自動で使われる
export const AVAILABLE: ReadonlySet<SheetDir> = new Set(SHEET_DIRS.filter((s) => MEASURED[walkKey(s)]));

// 歩行の1周期は frameDist×4。シートのコマ数（横向き4・斜め8・正面6）によらず周期は同じにし、
// 歩きながらシートが替わっても足の運びの位置が続くようにする
export function gaitFrame(distance: number, frameDist: number, count: number): number {
  return Math.floor((Math.max(0, distance) * count) / (4 * frameDist)) % count;
}
// 止まったときに立つ位置：周期の半分ごと（横向きシートのコマ0・2＝両足が地面に着いたコマ）
export function restDistance(distance: number, frameDist: number): number {
  const f = Math.floor(Math.max(0, distance) / frameDist);
  return (f % 2 === 0 ? f : f + 1) * frameDist;
}
// 上下動の形：接地コマの中央で 0、足を上げたコマの中央で -1（最も高い）。歩行2コマで1往復
export function bobOffset(distance: number, frameDist: number): number {
  const s = (((distance / frameDist) % 2) + 2) % 2 / 2;
  return -(1 - Math.cos(2 * Math.PI * (s - 0.25))) / 2;
}

const LEFTWARD: ReadonlySet<Dir> = new Set<Dir>(["w", "sw", "nw"]), RIGHTWARD: ReadonlySet<Dir> = new Set<Dir>(["e", "se", "ne"]);

type Motion = { pos: { x: number; y: number }; facing: number; moving: boolean; gaitDistance: number; speedRatio: number; heading: Dir };

// 実際に描く姿勢。useIdle=false なら、止まっていても歩行シートの接地コマで描く（待機姿勢へのクロスフェードの下絵）
export function pose(m: Motion, t: Tuning, useIdle = true): Pose {
  const { sheet, fallback } = sheetFor(m.heading, AVAILABLE);
  const idle = idleKey(m.heading);
  let texture: string, frame: number;
  if (!m.moving && useIdle && MEASURED[idle]) {
    texture = idle; frame = 0;
  } else {
    texture = walkKey(sheet);
    frame = gaitFrame(m.moving ? m.gaitDistance : restDistance(m.gaitDistance, t.frameDist), t.frameDist, MEASURED[texture].frames.length);
  }
  const f = MEASURED[texture].frames[frame], [rx, ry, rw, rh] = f.sourceRect, [ax, ay] = f.groundAnchor;
  const usedSheet = texture === idle ? IDLE_FOR[m.heading].sheet : sheet;
  // 左右の向き：左・左上・左下は反転。真上・真下は押している地点の左右（facing）。正面・背面の専用シートは反転しない
  const flip = usedSheet === "s" || usedSheet === "n" ? false
    : LEFTWARD.has(m.heading) || RIGHTWARD.has(m.heading) ? LEFTWARD.has(m.heading) : m.facing < 0;
  const y = m.moving ? m.pos.y + bobOffset(m.gaitDistance, t.frameDist) * t.bob * m.speedRatio : m.pos.y;
  return {
    texture, frame, rect: f.sourceRect as unknown as Rect, moving: m.moving, heading: m.heading, sheet: usedSheet,
    fallback: texture !== idle && fallback, x: m.pos.x, y, flip,
    height: (rh * WALK_HEIGHT) / (ay - ry), // 頭頂〜足裏をそろえる（コマごとの描き大きさのばらつきを打ち消す）
    originX: (ax - rx) / rw, originY: (ay - ry) / rh
  };
}

// 読み込む画像の一覧（背景は街の定義から別に読む）と、シートごとの切り出し範囲
export const SPRITE_FILES: string[] = Object.keys(MEASURED);
export function measuredRects(texture: string): Rect[] {
  return (MEASURED[texture]?.frames ?? []).map((f) => f.sourceRect as unknown as Rect);
}
