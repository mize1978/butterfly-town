// 人物の移動状態。入力（押している地点）と時間だけで進み、描画からは読み取るだけにする。
import { restDistance } from "./appearance";
import { classify, type Dir } from "./direction";
import { WALK, type Tuning } from "./motion";
import { DEAD_ZONE, MAX_DT, moveAlong, type Point, type Town } from "./world";

export class Sim {
  pos: Point;
  facing: 1 | -1 = 1;
  target: Point | null = null; // マウスを押している間だけ値を持つ
  moving = false;
  blocked = false;
  speed = 0;
  speedRatio = 0; // 最高速度に対する割合（体の上下動の強さに使う）
  gaitDistance = 0; // 歩行コマを決める累積距離
  stillFor = Infinity; // 止まってからの秒数（待機姿勢へのクロスフェードに使う）
  heading: Dir = "e"; // 進む方向（動いている間だけ更新し、止まると最後の方向を保つ）
  private dir: Point = { x: 0, y: 0 }; // 最後に進んだ方向（離した後の減速はこの向きに進む）

  constructor(readonly town: Town, readonly tuning: Tuning = WALK) {
    this.pos = { ...town.spawn };
  }

  press(p: Point) { this.target = p; }
  // 入力を離す。離した後も減速しながら少し進んでから止まる
  release() { this.target = null; }
  // 減速せずその場で止める（画面の切り替えなど）
  halt() { this.target = null; this.speed = 0; this.speedRatio = 0; }

  // 最高速度まで accel 秒で加速し、離すと decel 秒で減速して止まる。押している地点の近くでは行き過ぎないよう手前から減速する
  step(dt: number) {
    const t = this.tuning;
    dt = Math.min(Math.max(dt, 0), MAX_DT);
    const max = t.walkSpeed;
    let want = 0, room = Infinity;
    if (this.target) {
      const dx = this.target.x - this.pos.x, dy = this.target.y - this.pos.y, d = Math.hypot(dx, dy);
      if (Math.abs(dx) > 10) this.facing = dx < 0 ? -1 : 1;
      if (d < DEAD_ZONE) this.speed = 0;
      else {
        this.dir = { x: dx / d, y: dy / d };
        room = d - DEAD_ZONE;
        want = t.decel > 0 ? Math.min(max, Math.sqrt(2 * (max / t.decel) * room)) : max;
      }
    }
    if (want > this.speed) this.speed = t.accel > 0 ? Math.min(want, this.speed + (max / t.accel) * dt) : want;
    else this.speed = t.decel > 0 ? Math.max(want, this.speed - (max / t.decel) * dt) : want;
    const dist = Math.min(this.speed * dt, room);
    const next = dist > 0 ? moveAlong(this.town, this.pos, this.dir.x, this.dir.y, dist) : { ...this.pos, moved: 0, blocked: false };
    this.blocked = next.blocked;
    this.pos = { x: next.x, y: next.y };
    this.moving = next.moved > 0.01;
    this.stillFor = this.moving ? 0 : this.stillFor + dt;
    if (this.moving) this.heading = classify(this.dir.x, this.dir.y, this.heading);
    this.speedRatio = this.moving ? Math.min(1, this.speed / max) : 0;
    // 歩行コマは動いた分だけ進め、止まったら次の接地コマに合わせる（歩き出しはそのコマから続く）
    this.gaitDistance = this.moving ? this.gaitDistance + next.moved : restDistance(this.gaitDistance, t.frameDist);
  }
}
