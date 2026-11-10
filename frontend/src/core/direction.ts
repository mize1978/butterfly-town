// 進む方向（8方向）と、その方向で使う歩行シートの選び方。
// 操作は「行きたい方向へのマウス長押し」のまま変えない。ここは見た目（どのシートで描くか）だけを決める。
//
// 方向は画面座標（y は下向き）で判定する。e=右、se=右下（斜め前）、s=下（正面）、ne=右上（斜め後ろ）…。
// シートはすべて右向きに描き、左向き（w・sw・nw）は左右反転で描く（反転は facing が決める）。
// 方向ごとのシートが無いときは、近い向きのシートで代用し、代用したことを fallback で示す。
export const DIRS = ["e", "se", "s", "sw", "w", "nw", "n", "ne"] as const;
export type Dir = (typeof DIRS)[number];
export type SheetDir = "side" | "se" | "ne" | "s" | "n"; // side＝横向き（現在の歩行シート）

export const DIR_NAMES: Record<Dir, string> = {
  e: "右", se: "右下（斜め前）", s: "下（正面）", sw: "左下（斜め前）", w: "左", nw: "左上（斜め後ろ）", n: "上（背面）", ne: "右上（斜め後ろ）"
};
export const SHEET_NAMES: Record<SheetDir, string> = { side: "横向き", se: "斜め前", ne: "斜め後ろ", s: "正面", n: "背面" };

const HYSTERESIS = (8 * Math.PI) / 180; // 境界付近で向きが細かく切り替わらないよう、前の方向を8°分ひいきする

// 移動方向（dx, dy）から8方向を決める。prev を渡すと、境界付近では前の方向を保つ
export function classify(dx: number, dy: number, prev?: Dir): Dir {
  const a = Math.atan2(dy, dx), sector = Math.PI / 4;
  const idx = ((Math.round(a / sector) % 8) + 8) % 8;
  if (prev !== undefined) {
    const center = DIRS.indexOf(prev) * sector;
    let diff = Math.abs(a - center) % (2 * Math.PI);
    if (diff > Math.PI) diff = 2 * Math.PI - diff;
    if (diff <= sector / 2 + HYSTERESIS) return prev;
  }
  return DIRS[idx];
}

// その方向で使いたいシートの順番（先頭から、あるものを使う）
const PREFERENCE: Record<Dir, SheetDir[]> = {
  e: ["side"], w: ["side"],
  se: ["se", "side"], sw: ["se", "side"],
  ne: ["ne", "side"], nw: ["ne", "side"],
  s: ["s", "se", "side"], n: ["n", "ne", "side"]
};

export function sheetFor(dir: Dir, available: ReadonlySet<SheetDir>): { sheet: SheetDir; fallback: boolean } {
  const want = PREFERENCE[dir];
  const sheet = want.find((s) => available.has(s)) ?? "side";
  return { sheet, fallback: sheet !== want[0] };
}
