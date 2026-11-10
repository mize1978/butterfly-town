// 描く人物の一覧。止まって待機姿勢（立ち姿の画像）に替わるとき、歩行の接地コマから SETTLE 秒でクロスフェードする
// （足を寄せる中間コマの代わりの仮表現。描画試作と同じ）
import { pose, type Pose } from "./appearance";
import type { Tuning } from "./motion";
import type { Sim } from "./sim";

export const SETTLE = 0.18;
export type Shadow = { x: number; y: number; rx: number; ry: number };
export type Actor = { key: "player" | "settle"; pose: Pose; alpha: number; shadow?: Shadow };

type Walker = Parameters<typeof pose>[0] & Pick<Sim, "stillFor">;

export function walkerActors(sim: Walker, t: Tuning): Actor[] {
  const shadow = { x: sim.pos.x, y: sim.pos.y, rx: 20, ry: 7 };
  const p = pose(sim, t), k = sim.stillFor / SETTLE;
  if (!/-idle-/.test(p.texture) || k >= 1) return [{ key: "player", pose: p, alpha: 1, shadow }];
  // 影は地面に残すので、クロスフェード中も濃さを変えない
  return [{ key: "settle", pose: pose(sim, t, false), alpha: 1 - k }, { key: "player", pose: p, alpha: k, shadow }];
}
