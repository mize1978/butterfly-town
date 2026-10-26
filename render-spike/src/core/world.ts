// 街の論理座標と通行判定。Art Prototype 02（engine.mjs）の通行ポリゴンと移動規則を TypeScript へ移したもの。
// 描画エンジンに依存しないため、Phaser でも Canvas でも同じ判定を使い、node（vitest）で検証できる。
export const W = 1536;
export const H = 1024;

export type Point = { x: number; y: number };
export type Poly = ReadonlyArray<readonly [number, number]>;

// 歩ける石畳の範囲。建物・水路・柵はこの外側にあるため通れない。
export const WALK: Poly = [[470, 535], [1160, 390], [1350, 445], [1300, 555], [1095, 650], [1220, 900], [1085, 910], [800, 720], [660, 650]];
// 人物の手前に重なる植栽。背景のこの範囲を人物の上に描き直して前後関係をつくる（仮の切り抜き）。
export const FOREGROUND: Poly = [[1110, 650], [1250, 590], [1400, 510], [1536, 490], [1536, 1024], [1300, 1024], [1220, 850]];

export const SPAWN: Point = { x: 930, y: 625 };
export const WALK_SPEED = 112;
export const RIDE_SPEED = 250;
export const WALK_RADIUS = 12;
export const RIDE_RADIUS = 22;
const DEAD_ZONE = 9;
const MAX_DT = 0.05;
const SUB_STEP = 2;

export function inside(x: number, y: number, poly: Poly = WALK): boolean {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a[1] > y) !== (b[1] > y) && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]) c = !c;
  }
  return c;
}

// 足元の円（12方向の点）がすべて通行範囲に入っていれば立てる
export function allowed(x: number, y: number, r = WALK_RADIUS): boolean {
  if (!inside(x, y)) return false;
  for (let i = 0; i < 12; i++) {
    const a = (i * Math.PI) / 6;
    if (!inside(x + Math.cos(a) * r, y + Math.sin(a) * r)) return false;
  }
  return true;
}

export type Step = Point & { moved: number; blocked: boolean };

// 押している地点（target）へ向かって進む。2座標ずつ判定して、高速でも境界を飛び越えない。
export function advance(p: Point, target: Point, dt: number, riding: boolean): Step {
  const speed = riding ? RIDE_SPEED : WALK_SPEED, r = riding ? RIDE_RADIUS : WALK_RADIUS;
  const dx = target.x - p.x, dy = target.y - p.y, d = Math.hypot(dx, dy);
  if (d < DEAD_ZONE) return { x: p.x, y: p.y, moved: 0, blocked: false };
  const dist = Math.min(speed * Math.min(Math.max(dt, 0), MAX_DT), d - DEAD_ZONE);
  const ux = dx / d, uy = dy / d;
  let x = p.x, y = p.y, moved = 0, blocked = false;
  for (let left = dist; left > 0; left -= SUB_STEP) {
    const step = Math.min(SUB_STEP, left), nx = x + ux * step, ny = y + uy * step;
    if (!allowed(nx, ny, r)) { blocked = true; break; }
    x = nx; y = ny; moved += step;
  }
  return { x, y, moved, blocked };
}
