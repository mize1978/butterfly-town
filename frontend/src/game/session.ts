// 街の中の状態の正本（人物の移動・カメラ・近くにいる住民）。描画側（Phaser）は毎フレームここを進めて読むだけにする。
import { follow, VIEW_SIZE, viewTarget, type View, type ViewSize } from "../core/camera";
import { WALK } from "../core/motion";
import { Sim } from "../core/sim";
import { walkerActors, type Actor } from "../core/walker";
import type { Point, Town } from "../core/world";
import { hitsResident, SAMPLE_RESIDENT, TALK_RANGE, type Rect, type SampleResident } from "./sample-resident";

export class Session {
  readonly sim: Sim;
  view: View; // いま映している範囲（描画とポインターの座標変換が毎フレーム読む）
  private size: ViewSize = VIEW_SIZE; // 映す大きさ（PC は 1100×660 のまま。スマホは画面の形に合わせて変える）
  private paused = false;
  private near = false;
  private selected = false; // 住民をタップして選んでいるか（スマホで「話す」を出す条件）
  private walked = false; // 一度でも歩いたか（スマホの移動の説明を消す条件）
  private listeners = new Set<() => void>();

  constructor(readonly town: Town, readonly resident: SampleResident = SAMPLE_RESIDENT) {
    this.sim = new Sim(town, WALK);
    this.view = viewTarget(town, this.sim.pos);
    this.near = this.measureNear();
  }

  // 映す大きさを変える（スマホの縦横の切り替えなど）。人物を中心にすぐ映し直す（ゆっくり追わない）
  setViewSize(size: ViewSize) {
    if (size.w === this.size.w && size.h === this.size.h) return;
    this.size = size;
    this.view = viewTarget(this.town, this.sim.pos, size);
  }

  // メニューや会話を開いている間は止める。人物はその場で止まり（位置はそのまま）、押しても歩かない。
  // 閉じたら同じ位置・同じカメラから続ける（作り直さない）
  pause() { this.paused = true; this.sim.halt(); }
  resume() { this.paused = false; }

  // 押している地点を伝える。止めている間は受け付けない
  // 地面を押したら住民の選択は外す
  press(p: Point) {
    if (this.paused) return;
    this.sim.press(p);
    this.setSelected(false);
  }
  release() { this.sim.release(); }

  // 住民を選ぶタップ。体か名札（tag：描いている名札の範囲）に当たったら選ぶだけで、歩き出さない（true を返す）。
  // 外れたら何もしない（false）
  tapResident(p: Point, tag?: Rect): boolean {
    if (this.paused || !hitsResident(this.resident, p, tag)) return false;
    this.setSelected(true);
    return true;
  }
  get residentSelected() { return this.selected; }
  get hasWalked() { return this.walked; }
  private setSelected(v: boolean) { if (v !== this.selected) { this.selected = v; this.notify(); } }
  private notify() { this.listeners.forEach((fn) => fn()); }

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
    this.view = follow(this.town, this.view, this.sim.pos, dt, this.size);
    if (!this.walked && this.sim.moving) { this.walked = true; this.notify(); }
    const near = this.measureNear();
    if (near !== this.near) {
      this.near = near;
      if (!near) this.selected = false; // 話せる距離を離れたら選択も外す
      this.notify();
    }
  }

  // 描くもの（奥から手前の順）
  actors(): Actor[] { return walkerActors(this.sim, this.sim.tuning); }
}
