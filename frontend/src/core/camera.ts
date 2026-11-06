// カメラ（画面に映す街の範囲）。人物を少し遅れて追い、街の外は映さない。
// 映す大きさは PC では 1100×660（徒歩・スクーター接続の試作で比較した「4195と同じ範囲」）。スマホは画面の形に合わせた大きさを渡す。
// 街がこれより小さければ街全体を映す
import type { Point, Town } from "./world";

export type View = { x: number; y: number; w: number; h: number };
export type ViewSize = { w: number; h: number };
export const VIEW_SIZE: ViewSize = { w: 1100, h: 660 };
const LOOK_UP = 90; // 足元より少し上（体の中ほど）を画面の中央に置く

export function viewTarget(town: Town, focus: Point, size: ViewSize = VIEW_SIZE): View {
  const w = Math.min(size.w, town.size.width), h = Math.min(size.h, town.size.height);
  return {
    x: Math.min(town.size.width - w, Math.max(0, focus.x - w / 2)),
    y: Math.min(town.size.height - h, Math.max(0, focus.y - LOOK_UP - h / 2)),
    w, h
  };
}

// 1フレーム分だけ近づける（急に跳ばないように少し遅れて追う）
export function follow(town: Town, v: View, focus: Point, dt: number, size: ViewSize = VIEW_SIZE): View {
  const t = viewTarget(town, focus, size), k = 1 - Math.exp(-8 * Math.max(0, dt));
  return { x: v.x + (t.x - v.x) * k, y: v.y + (t.y - v.y) * k, w: t.w, h: t.h };
}
