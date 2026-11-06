// 街の中の状態の正本（人物の移動・カメラ・近くにいる住民）。描画側（Phaser）は毎フレームここを進めて読むだけにする。
import { follow, viewTarget, type View } from "../core/camera";
import { WALK } from "../core/motion";
import { Sim } from "../core/sim";
import { walkerActors, type Actor } from "../core/walker";
import type { Point, Town } from "../core/world";
import { SAMPLE_RESIDENT, TALK_RANGE, type SampleResident } from "./sample-resident";

export class Session {
  readonly sim: Sim;
  view: View; // いま映している範囲（描画とポインターの座標変換が毎フレーム読む）
  private paused = false;
  private near = false;
  private listeners = new Set<() => void>();

  constructor(readonly town: Town, readonly resident: SampleResident = SAMPLE_RESIDENT) {
    this.sim = new Sim(town, WALK);
    this.view = viewTarget(town, this.sim.pos);
    this.near = this.measureNear();
  }

  // メニューや会話を開いている間は止める。人物はその場で止まり（位置はそのまま）、押しても歩かない。
  // 閉じたら同じ位置・同じカメラから続ける（作り直さない）
  pause() { this.paused = true; this.sim.halt(); }
  resume() { this.paused = false; }

  // 押している地点を伝える。止めている間は受け付けない
  press(p: Point) { if (!this.paused) this.sim.press(p); }
  release() { this.sim.release(); }

  // 住民に話しかけられる距離にいるか。変わったときだけ subscribe の相手に知らせる（React の useSyncExternalStore 用）
  get nearResident() { return this.near; }
  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
  private measureNear() {
    const p = this.sim.pos, r = this.resident.pos;
    return Math.hypot(p.x - r.x, p.y - r.y) <= TALK_RANGE;
  }

  tick(dt: number) {
    // 止めている間も時間は進める（入力が無いので動かず、待機姿勢へ移る）
    this.sim.step(dt);
    this.view = follow(this.town, this.view, this.sim.pos, dt);
    const near = this.measureNear();
    if (near !== this.near) { this.near = near; this.listeners.forEach((fn) => fn()); }
  }

  // 描くもの（奥から手前の順）
  actors(): Actor[] { return walkerActors(this.sim, this.sim.tuning); }
}
