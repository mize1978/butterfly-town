// 街の中の状態の正本（人物の移動・カメラ・近くにいる住民やスクーター修理・依頼の進み具合）。描画側（Phaser）は毎フレームここを進めて読むだけにする。
import { follow, VIEW_SIZE, viewTarget, type View, type ViewSize } from "../core/camera";
import { WALK } from "../core/motion";
import { Sim } from "../core/sim";
import { walkerActors, type Actor } from "../core/walker";
import type { Point, Town } from "../core/world";
import { partSpot, partsInTown, SHOP, START, type Outcome, type Repair, type Spot, type SpotId } from "./errand";
import { hitsResident, hitsTag, SAMPLE_RESIDENT, TALK_RANGE, type Rect, type SampleResident } from "./sample-resident";

// 描いている名札の範囲（論理座標）。タップで選ぶ当たり判定に足す
export type Tags = Partial<Record<SpotId, Rect>>;

export class Session {
  readonly sim: Sim;
  view: View; // いま映している範囲（描画とポインターの座標変換が毎フレーム読む）
  private size: ViewSize = VIEW_SIZE; // 映す大きさ（PC は 1100×660 のまま。スマホは画面の形に合わせて変える）
  private paused = false;
  private near: SpotId | null = null; // 話せる（調べられる）距離にいる場所。複数なら一番近いところ
  private selected: SpotId | null = null; // タップして選んでいる場所（スマホで「話す」「調べる」を出す条件）
  private repairState: Repair = START; // スクーター修理の依頼と修理の進み具合（保存しない）
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
    this.setSelected(null);
  }
  release() { this.sim.release(); }

  // 近くでタップした場所の会話・発見の画面を開く窓口（画面側が設定する）
  onOpen: ((id: SpotId) => void) | null = null;

  // 住民・スクーター修理・部品へのタップ（スマホ）。体（絵）か名札（tags：描いている名札の範囲）に当たったら、歩き出さずに true を返す。
  // 話せる（調べられる）距離にいれば、その場で会話・発見の画面を開く（onOpen）。遠ければ選ぶだけ（「近づくと話せます」の案内に使う）。
  // 外れたら何もしない（false：地面への移動になる）。部品は置かれている間だけ当たる
  tapSpot(p: Point, tags: Tags = {}): boolean {
    if (this.paused) return false;
    const hit = this.spots().find((s) => (s.id === "resident" ? hitsResident(this.resident, p, tags.resident) : hitsSpot(s, p, tags[s.id])));
    if (!hit) return false;
    if (hit.id === this.near) { this.setSelected(null); this.onOpen?.(hit.id); }
    else this.setSelected(hit.id);
    return true;
  }
  clearSelection() { this.setSelected(null); }
  tapResident(p: Point, tag?: Rect): boolean { return this.tapSpot(p, { resident: tag }); }
  get selectedSpot() { return this.selected; }
  get residentSelected() { return this.selected === "resident"; }
  get hasWalked() { return this.walked; }
  private setSelected(v: SpotId | null) { if (v !== this.selected) { this.selected = v; this.notify(); } }
  private notify() { this.listeners.forEach((fn) => fn()); }

  // 近づいて使える場所（いま街にあるもの）。住民とスクーター修理はいつも、部品は依頼を受けて拾うまでの間だけ
  spots(): Spot[] {
    const r: Spot = { id: "resident", name: this.resident.name, pos: this.resident.pos, hit: { x: 0, y: 0, w: 0, h: 0 } };
    return [r, SHOP, ...partsInTown(this.repairState).map(partSpot)];
  }

  // 話せる（調べられる）距離にいる場所。変わったときだけ subscribe の相手に知らせる（React の useSyncExternalStore 用）
  get nearSpot() { return this.near; }
  get nearResident() { return this.near === "resident"; }
  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
  private measureNear(): SpotId | null {
    const p = this.sim.pos;
    let best: SpotId | null = null, bestD = Infinity;
    for (const s of this.spots()) {
      const d = Math.hypot(p.x - s.pos.x, p.y - s.pos.y);
      if (d <= (s.range ?? TALK_RANGE) && d < bestD) { best = s.id; bestD = d; }
    }
    return best;
  }
  private updateNear() {
    const near = this.measureNear();
    if (near === this.near) return;
    if (this.selected && this.selected !== near) this.selected = null; // 選んだ場所の話せる距離を離れたら（なくなったら）選択も外す
    this.near = near;
    this.notify();
  }

  // スクーター修理の依頼と修理。errand.ts の操作（accept・collect・place など）を渡して進める。
  // 合わない操作は状態を変えず、理由の文を返す。保存はしない
  get repair() { return this.repairState; }
  act(op: (r: Repair) => Outcome): Outcome {
    const out = op(this.repairState);
    if (!out.ok) return out;
    this.repairState = out.next;
    if (this.selected && !this.spots().some((s) => s.id === this.selected)) this.selected = null; // 拾って街から消えた部品の選択は外す
    this.notify();
    this.updateNear(); // 部品が置かれた・なくなったので、近くにいる場所を測り直す
    return out;
  }

  tick(dt: number) {
    // 止めている間も時間は進める（入力が無いので動かず、待機姿勢へ移る）
    this.sim.step(dt);
    this.view = follow(this.town, this.view, this.sim.pos, dt, this.size);
    if (!this.walked && this.sim.moving) { this.walked = true; this.notify(); }
    this.updateNear();
  }

  // 描くもの（奥から手前の順）
  actors(): Actor[] { return walkerActors(this.sim, this.sim.tuning); }
}

function hitsSpot(s: Spot, p: Point, tag?: Rect): boolean {
  const h = s.hit, x = p.x - s.pos.x, y = p.y - s.pos.y;
  return (x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h) || hitsTag(p, tag);
}
