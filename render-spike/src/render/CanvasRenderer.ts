// Canvas 2D で描く方式（Art Prototype 02 と同じ考え方）。比較のため、Phaser 版と同じ素材・判定・入力を使う。
import { ART_FILES, DRAW_HEIGHT, resolve, walkRects, type Rect } from "../core/appearance";
import { FOREGROUND, H, RIDE_RADIUS, W, WALK, WALK_RADIUS, type Poly } from "../core/world";
import type { Session } from "../state/session";
import { bindPointer, FrameMeter, loadImage, makeForeground, STRESS, stressActor } from "./shared";
import type { Renderer, Rendered } from "./types";

export class CanvasRenderer implements Renderer {
  readonly kind = "canvas" as const;
  private el: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private images: Record<string, HTMLImageElement> = {};
  private names = new Map<HTMLImageElement, string>(); // 画像オブジェクト → キー（描いた画像を読み戻すため）
  private fg: HTMLCanvasElement | null = null;
  private raf = 0;
  private last = 0;
  private unbind: (() => void) | null = null;
  private session: Session | null = null;
  private meter = new FrameMeter();
  private info: Rendered | null = null;
  private frames = 0;
  private dead = false;
  private firstFrame: (() => void) | null = null;

  async mount(parent: HTMLElement, session: Session) {
    this.session = session;
    const el = document.createElement("canvas");
    el.width = W; el.height = H;
    el.className = "world-canvas";
    el.dataset.renderer = "canvas";
    parent.appendChild(el);
    this.el = el;
    this.ctx = el.getContext("2d");
    const imgs = await Promise.all(ART_FILES.map(loadImage));
    if (this.dead) return; // 読み込み中に破棄された（React StrictMode の二重実行など）
    ART_FILES.forEach((n, i) => { this.images[n] = imgs[i]; this.names.set(imgs[i], n); });
    this.fg = makeForeground(this.images.town);
    this.unbind = bindPointer(el, session);
    await new Promise<void>((done) => { this.firstFrame = done; this.raf = requestAnimationFrame(this.loop); });
  }

  private loop = (t: number) => {
    if (this.dead) return;
    const t0 = performance.now();
    const dt = this.last ? Math.min((t - this.last) / 1000, 0.05) : 0;
    this.last = t;
    this.session!.tick(dt);
    this.draw();
    this.meter.record(performance.now() - t0, t0);
    if (this.firstFrame) { this.firstFrame(); this.firstFrame = null; }
    this.raf = requestAnimationFrame(this.loop);
  };

  private draw() {
    const g = this.ctx!, s = this.session!, st = s.getState(), sim = s.sim;
    const r = resolve(st.character, st.outfits[st.character], st.riding, sim.moving, sim.gaitDistance);
    const img = this.images[r.texture];
    const h = DRAW_HEIGHT[r.mode];
    const w = h * (r.rect ? r.rect[2] / r.rect[3] : img.width / img.height);
    g.drawImage(this.images.town, 0, 0, W, H);
    for (let i = 0; i < STRESS; i++) {
      const a = stressActor(i, performance.now()), rc = walkRects(a.texture)[a.frame], sh = 120, sw = (sh * rc[2]) / rc[3];
      g.save(); g.translate(a.x, a.y); g.scale(a.flip ? -1 : 1, 1);
      g.drawImage(this.images[a.texture], rc[0], rc[1], rc[2], rc[3], -sw / 2, -sh, sw, sh);
      g.restore();
    }
    g.save();
    g.translate(sim.pos.x, sim.pos.y);
    g.fillStyle = "rgba(36,62,53,.27)";
    g.beginPath();
    g.ellipse(0, -3, st.riding ? 50 : 20, st.riding ? 12 : 7, 0, 0, Math.PI * 2);
    g.fill();
    g.scale(sim.facing, 1);
    const drawn = this.blit(img, r.rect, w, h);
    g.restore();
    g.drawImage(this.fg!, 0, 0);
    if (sim.target) {
      g.strokeStyle = sim.blocked ? "#eab86b" : "#fff9d2";
      g.lineWidth = 3;
      g.beginPath(); g.arc(sim.target.x, sim.target.y, 13, 0, Math.PI * 2); g.stroke();
    }
    if (st.debug) this.drawDebug(st.riding);
    this.frames++;
    this.info = { ...drawn, frames: this.frames };
  }

  // 人物を描き、実際に渡した画像・切り出し範囲・変換（位置と反転）を記録して返す
  private blit(img: HTMLImageElement, rect: Rect | null, w: number, h: number) {
    const g = this.ctx!, m = g.getTransform();
    if (rect) g.drawImage(img, rect[0], rect[1], rect[2], rect[3], -w / 2, -h, w, h);
    else g.drawImage(img, -w / 2, -h, w, h);
    const texture = this.names.get(img) ?? "?";
    const frame = rect ? walkRects(texture).findIndex((x) => x.every((v, i) => v === rect[i])) : -1;
    return { texture, frame, flip: m.a < 0, x: m.e, y: m.f };
  }

  private drawDebug(riding: boolean) {
    const g = this.ctx!, sim = this.session!.sim;
    const path = (p: Poly) => { g.beginPath(); p.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); };
    g.save();
    path(WALK); g.fillStyle = "#3fffc422"; g.strokeStyle = "#3fffc4"; g.lineWidth = 3; g.fill(); g.stroke();
    path(FOREGROUND); g.strokeStyle = "#ff70c9"; g.stroke();
    g.strokeStyle = "#fff"; g.beginPath(); g.arc(sim.pos.x, sim.pos.y, riding ? RIDE_RADIUS : WALK_RADIUS, 0, Math.PI * 2); g.stroke();
    g.restore();
  }

  destroy() {
    this.dead = true;
    cancelAnimationFrame(this.raf);
    this.unbind?.();
    this.el?.remove();
    this.el = null;
    return Promise.resolve();
  }
  rendered() { return this.info; }
  metrics() { return this.meter.read("canvas2d"); }
  resetMetrics() { this.meter.reset(); }
  canvas() { return this.el; }
}
