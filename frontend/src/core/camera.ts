// カメラ（画面に映す街の範囲）。人物を少し遅れて追い、街の外は映さない。
// 映す大きさは 1100×660（徒歩・スクーター接続の試作で比較した「4195と同じ範囲」）。街がこれより小さければ街全体を映す
import type { Point, Town } from "./world";

export type View = { x: number; y: number; w: number; h: number };
export const VIEW_SIZE = { w: 1100, h: 660 } as const;
const LOOK_UP = 90; // 足元より少し上（体の中ほど）を画面の中央に置く

export function viewTarget(town: Town, focus: Point): View {
  const w = Math.min(VIEW_SIZE.w, town.size.width), h = Math.min(VIEW_SIZE.h, town.size.height);
  return {
    x: Math.min(town.size.width - w, Math.max(0, focus.x - w / 2)),
    y: Math.min(town.size.height - h, Math.max(0, focus.y - LOOK_UP - h / 2)),
    w, h
  };
}

// 1フレーム分だけ近づける（急に跳ばないように少し遅れて追う）
export function follow(town: Town, v: View, focus: Point, dt: number): View {
  const t = viewTarget(town, focus), k = 1 - Math.exp(-8 * Math.max(0, dt));
  return { x: v.x + (t.x - v.x) * k, y: v.y + (t.y - v.y) * k, w: t.w, h: t.h };
}
