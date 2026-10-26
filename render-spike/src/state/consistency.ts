// React の状態（正本）と移動状態から「描かれるべきもの」を独立に求め、描画側が実際に描いた値と照合する。
// 不一致の内容を返す（空なら一致）。描画は tick の直後に行われるため、照合時点の移動状態は直前の描画と同じ。
import { resolve } from "../core/appearance";
import type { Sim } from "../core/sim";
import type { Rendered } from "../render/types";
import type { UiState } from "./session";

export function mismatches(st: UiState, sim: Pick<Sim, "pos" | "facing" | "moving" | "gaitDistance">, r: Rendered | null): string[] {
  if (!r) return ["まだ描画されていない"];
  const want = resolve(st.character, st.outfits[st.character], st.riding, sim.moving, sim.gaitDistance);
  const out: string[] = [];
  if (r.texture !== want.texture) out.push(`画像：期待=${want.texture} 描画=${r.texture}`);
  if (r.frame !== want.frame) out.push(`コマ：期待=${want.frame} 描画=${r.frame}`);
  if (r.flip !== sim.facing < 0) out.push(`向き：期待=${sim.facing < 0 ? "左" : "右"} 描画=${r.flip ? "左" : "右"}`);
  if (Math.abs(r.x - sim.pos.x) > 0.01 || Math.abs(r.y - sim.pos.y) > 0.01) out.push(`位置：期待=${sim.pos.x.toFixed(1)},${sim.pos.y.toFixed(1)} 描画=${r.x.toFixed(1)},${r.y.toFixed(1)}`);
  return out;
}
