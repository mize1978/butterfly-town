// タイトルの川の演出に使う値。座標はすべて街の絵（town.png・1536×1024）の上の位置。
// 水面の範囲は絵を見て手でなぞったもの。橋・石の岸・手前の植え込みにかからないよう、水面の内側を通している
import type { Poly } from "../core/world";

export const ART_SIZE = { width: 1536, height: 1024 } as const;

// 橋の下から手前（下）へ流れる水路の水面。時計回り
export const RIVER: Poly = [
  [15, 548], [185, 548], [200, 605], [245, 655], [278, 686], [440, 686], [448, 705], [466, 763], [528, 827], [563, 880],
  [632, 968], [672, 1024], [421, 1024], [409, 944], [327, 898], [246, 874], [205, 878], [195, 840], [178, 760], [152, 690],
  [100, 642], [10, 632]
];

// 水が流れる向き（絵の上で、橋の下から右下の手前へ）。長さ1
const FLOW = { x: 0.33, y: 0.94 };
export const FLOW_DIR = { x: FLOW.x / Math.hypot(FLOW.x, FLOW.y), y: FLOW.y / Math.hypot(FLOW.x, FLOW.y) };

// 動きの強さ。full＝PC、lite＝スマホなど（解像度・揺れ・光を控えめにし、30コマ/秒に抑える）
export type WaterQuality = "full" | "lite";
export const WATER = {
  full: { scale: 1, ripple: 3, glint: 1, fps: 60 },
  lite: { scale: 0.5, ripple: 2.2, glint: 0.75, fps: 30 }
} as const satisfies Record<WaterQuality, { scale: number; ripple: number; glint: number; fps: number }>;
export const EDGE_FEATHER = 6; // 水面の縁をぼかす幅（絵の座標）。縁で揺れが急に途切れないようにする
