// 街の中の状態の正本（人物の移動・カメラ）。描画側（Phaser）は毎フレームここを進めて読むだけにする。
import { follow, viewTarget, type View } from "../core/camera";
import { WALK } from "../core/motion";
import { Sim } from "../core/sim";
import { walkerActors, type Actor } from "../core/walker";
import type { Town } from "../core/world";

export class Session {
  readonly sim: Sim;
  view: View; // いま映している範囲（描画とポインターの座標変換が毎フレーム読む）

  constructor(readonly town: Town) {
    this.sim = new Sim(town, WALK);
    this.view = viewTarget(town, this.sim.pos);
  }

  tick(dt: number) {
    this.sim.step(dt);
    this.view = follow(this.town, this.view, this.sim.pos, dt);
  }

  // 描くもの（奥から手前の順）
  actors(): Actor[] { return walkerActors(this.sim, this.sim.tuning); }
}
