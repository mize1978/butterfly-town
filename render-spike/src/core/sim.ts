// 人物の移動状態。入力（押している地点）と時間だけで進み、描画からは読み取るだけにする。
import { advance, allowed, RIDE_RADIUS, SPAWN, type Point } from "./world";

export class Sim {
  pos: Point = { ...SPAWN };
  facing: 1 | -1 = 1;
  target: Point | null = null; // マウスを押している間だけ値を持つ
  moving = false;
  blocked = false;
  distance = 0;
  gaitDistance = 0;
  collisions = 0;

  press(p: Point) { this.target = p; }
  // 入力を離す。移動中・境界停止の表示は次のフレーム（step）で更新し、描画と同じ時点の状態を保つ
  release() { this.target = null; }

  step(dt: number, riding: boolean) {
    this.moving = false;
    if (!this.target) { this.blocked = false; return; }
    const dx = this.target.x - this.pos.x;
    if (Math.abs(dx) > 10) this.facing = dx < 0 ? -1 : 1;
    const next = advance(this.pos, this.target, dt, riding);
    if (next.blocked && !this.blocked) this.collisions++;
    this.blocked = next.blocked;
    this.pos = { x: next.x, y: next.y };
    this.distance += next.moved;
    this.moving = next.moved > 0.01;
    if (this.moving && !riding) this.gaitDistance += next.moved;
  }

  // 乗車は車体の分だけ広い足元が必要。狭い場所では乗れない
  canRide(): boolean { return allowed(this.pos.x, this.pos.y, RIDE_RADIUS); }
}
