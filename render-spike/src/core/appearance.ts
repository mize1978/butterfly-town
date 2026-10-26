// 外見の解決：（人物・衣装・場面・歩行コマ）から、表示する画像と切り出し範囲を決める。
// Phaser と Canvas の両方がこの結果だけを使うため、描画方式によって別の服が出ることはない。
import walkFrames from "./walk-frames.json";

export const CHARACTERS = ["girl", "boy"] as const;
export const OUTFITS = ["base", "alt"] as const;
export type Character = (typeof CHARACTERS)[number];
export type Outfit = (typeof OUTFITS)[number];
export type Mode = "idle" | "walk" | "ride";

export const CHARACTER_NAMES: Record<Character, string> = { girl: "女の子", boy: "男の子" };
export const OUTFIT_NAMES: Record<Outfit, string> = { base: "アイボリー", alt: "セージグリーン" };

export type Rect = readonly [number, number, number, number];
type SheetMeta = { size: number[]; rects: number[][] };
const SHEETS = walkFrames as Record<string, SheetMeta>;

// 画面に描く高さ（論理座標）。AP02 と同じ値
export const DRAW_HEIGHT: Record<Mode, number> = { idle: 177, walk: 177, ride: 184 };

export type Resolved = {
  texture: string; // 画像のキー（= public/art/<texture>.png）
  frame: number; // 歩行コマ（-1 は画像全体）
  rect: Rect | null; // 歩行シート内の切り出し範囲
  mode: Mode;
  character: Character;
  outfit: Outfit;
};

export function textureKey(c: Character, o: Outfit, mode: Mode): string {
  return mode === "ride" ? `${c}-ride-${o}` : mode === "walk" ? `${c}-walk-${o}` : `${c}-${o}`;
}

// 移動距離22ごとに次のコマ、88で1周期。止まっている・乗車中は立ち姿（または乗車姿）
export function gaitFrame(distance: number, moving: boolean, riding: boolean): number {
  return moving && !riding ? Math.floor(Math.max(0, distance) / 22) % 4 : -1;
}

export function resolve(c: Character, o: Outfit, riding: boolean, moving: boolean, gaitDistance: number): Resolved {
  const frame = gaitFrame(gaitDistance, moving, riding);
  const mode: Mode = riding ? "ride" : frame >= 0 ? "walk" : "idle";
  const texture = textureKey(c, o, mode);
  const rect = mode === "walk" ? (SHEETS[texture].rects[frame] as unknown as Rect) : null;
  return { texture, frame, rect, mode, character: c, outfit: o };
}

export function walkRects(texture: string): Rect[] {
  return SHEETS[texture].rects as unknown as Rect[];
}

// 読み込む画像の一覧（背景・単体スクーターを含む）
export const ART_FILES: string[] = [
  "town",
  ...CHARACTERS.flatMap((c) => OUTFITS.flatMap((o) => (["idle", "walk", "ride"] as Mode[]).map((m) => textureKey(c, o, m))))
];
