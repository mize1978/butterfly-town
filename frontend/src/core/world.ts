// 街の地図と通行判定。地図（大きさ・歩ける範囲など）は Rails API（GET /api/v1/town）から受け取る。
// 描画エンジンに依存しないため、node（vitest）で検証できる。判定の規則は描画試作（render-spike）と同じ。
export type Point = { x: number; y: number };
export type Poly = ReadonlyArray<readonly [number, number]>;

export type Town = {
  id: string;
  name: string;
  size: { width: number; height: number };
  background: string; // 背景画像のキー（= public/art/<background>.png）
  walkable: Poly; // 歩ける範囲。建物・水路・柵はこの外側にある
  foreground: Poly; // 人物の手前に重なる植栽。背景のこの範囲を人物の上に描き直す
  spawn: Point; // 街に出たときの足元の位置
};

export const WALK_RADIUS = 12; // 足元の円の半径
export const DEAD_ZONE = 9; // 押している地点にこれより近ければ止まる
export const MAX_DT = 0.05; // 1回の更新で進める時間の上限（タブの切り替えなどで時間が飛んでも壁を越えない）
const SUB_STEP = 2;

export function inside(x: number, y: number, poly: Poly): boolean {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a[1] > y) !== (b[1] > y) && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]) c = !c;
  }
  return c;
}

// 足元の円（12方向の点）がすべて歩ける範囲に入っていれば立てる
export function allowed(town: Town, x: number, y: number, r = WALK_RADIUS): boolean {
  if (!inside(x, y, town.walkable)) return false;
  for (let i = 0; i < 12; i++) {
    const a = (i * Math.PI) / 6;
    if (!inside(x + Math.cos(a) * r, y + Math.sin(a) * r, town.walkable)) return false;
  }
  return true;
}

export type Step = Point & { moved: number; blocked: boolean };

// 単位方向（ux, uy）へ dist だけ進む。2座標ずつ判定し、通れない手前で止まる（高速でも境界を飛び越えない）
export function moveAlong(town: Town, p: Point, ux: number, uy: number, dist: number, r = WALK_RADIUS): Step {
  let x = p.x, y = p.y, moved = 0, blocked = false;
  for (let left = dist; left > 0; left -= SUB_STEP) {
    const step = Math.min(SUB_STEP, left), nx = x + ux * step, ny = y + uy * step;
    if (!allowed(town, nx, ny, r)) { blocked = true; break; }
    x = nx; y = ny; moved += step;
  }
  return { x, y, moved, blocked };
}
