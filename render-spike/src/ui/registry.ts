// 検証用：描画インスタンスの生成と「破棄の完了」を数える。生存数は破棄が終わるまで減らさない。
import type { Renderer } from "../render/types";

export const registry = {
  live: new Set<Renderer>(),
  active: null as Renderer | null, // いま画面に出している描画（破棄待ちのものは含まない）
  mounts: 0,
  destroys: 0,
  attach(r: Renderer) { this.live.add(r); this.active = r; this.mounts++; },
  release(r: Renderer) { if (this.active === r) this.active = null; },
  detach(r: Renderer) { if (this.live.delete(r)) this.destroys++; },
  current(): Renderer | null { return this.active; }
};
