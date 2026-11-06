// Phaser 4 で街と人物を描く。移動と衝突は Phaser の物理エンジンを使わず、共通の多角形判定（core/world.ts）で行う。
import Phaser from "phaser";
import { measuredRects, SPRITE_FILES } from "../core/appearance";
import type { Point } from "../core/world";
import type { Session } from "../game/session";

const ART_BASE = "art/";

type SceneData = { session: Session; onReady: () => void; onError: (e: Error) => void };

class TownScene extends Phaser.Scene {
  private session!: Session;
  private hooks!: SceneData;
  private failed = false;
  private sprites = new Map<string, { img: Phaser.GameObjects.Image; shadow: Phaser.GameObjects.Ellipse }>();
  private ring!: Phaser.GameObjects.Graphics;
  created = false;

  constructor() { super("town"); }
  init(data: SceneData) { this.hooks = data; this.session = data.session; }

  private files() { return [this.session.town.background, ...SPRITE_FILES]; }

  preload() {
    this.load.on("loaderror", (f: Phaser.Loader.File) => this.fail(`素材の読み込みに失敗：${f.key}.png`));
    for (const name of this.files()) this.load.image(name, `${ART_BASE}${name}.png`);
  }

  private fail(message: string) {
    if (this.failed) return;
    this.failed = true;
    this.hooks.onError(new Error(message));
  }

  create() {
    // 開発サーバーは存在しないファイルに index.html を返すため、loaderror にならず画像として読めないことがある
    const missing = this.files().filter((n) => !this.textures.exists(n));
    if (missing.length) this.fail(`素材の読み込みに失敗：${missing.map((n) => `${n}.png`).join("、")}`);
    if (this.failed) return;
    const { town } = this.session, { width: W, height: H } = town.size;
    // 歩行シートの各コマを m0, m1, … として登録する
    for (const key of SPRITE_FILES) {
      const tex = this.textures.get(key);
      measuredRects(key).forEach((r, i) => tex.add(`m${i}`, 0, r[0], r[1], r[2], r[3]));
    }
    this.add.image(0, 0, town.background).setOrigin(0, 0).setDisplaySize(W, H).setDepth(0);
    for (const key of ["settle", "player"]) {
      this.sprites.set(key, {
        shadow: this.add.ellipse(0, 0, 40, 14, 0x243e35, 0.27).setDepth(1).setVisible(false),
        img: this.add.image(0, 0, SPRITE_FILES[0]).setDepth(2).setVisible(false)
      });
    }
    this.textures.addCanvas("foreground", makeForeground(this.textures.get(town.background).getSourceImage() as HTMLImageElement, this.session));
    this.add.image(0, 0, "foreground").setOrigin(0, 0).setDepth(3);
    this.ring = this.add.graphics().setDepth(4);
    this.cameras.main.setBounds(0, 0, W, H);
    this.created = true;
    this.hooks.onReady();
  }

  update(_time: number, delta: number) {
    if (!this.created) return;
    const s = this.session, sim = s.sim;
    s.tick(delta / 1000);
    this.cameras.main.setScroll(s.view.x, s.view.y);
    this.sprites.forEach((o) => { o.img.setVisible(false); o.shadow.setVisible(false); });
    s.actors().forEach((a, i) => {
      const o = this.sprites.get(a.key)!, p = a.pose;
      o.img.setTexture(p.texture, `m${p.frame}`);
      // 反転は flipX ではなく負の倍率で行う（flipX はコマの中央を軸に反転するため、体の中心に合わせた点がずれる）
      const k = p.height / o.img.frame.height;
      o.img.setOrigin(p.originX, p.originY).setScale(p.flip ? -k : k, k).setPosition(p.x, p.y).setAlpha(a.alpha).setDepth(2 + i / 10).setVisible(true);
      if (a.shadow) o.shadow.setPosition(a.shadow.x, a.shadow.y - 3).setSize(a.shadow.rx * 2, a.shadow.ry * 2).setVisible(true);
    });
    this.ring.clear();
    if (sim.target) this.ring.lineStyle(3, sim.blocked ? 0xeab86b : 0xfff9d2, 1).strokeCircle(sim.target.x, sim.target.y, 13);
  }
}

// 背景から手前の植栽だけを切り抜いた透過画像。人物の上に重ねて「植栽の奥にいる」ように見せる
function makeForeground(bg: CanvasImageSource, s: Session): HTMLCanvasElement {
  const { width: W, height: H } = s.town.size, c = document.createElement("canvas");
  c.width = W; c.height = H;
  const g = c.getContext("2d")!;
  g.beginPath();
  s.town.foreground.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  g.closePath();
  g.clip();
  g.drawImage(bg, 0, 0, W, H);
  return c;
}

// マウス（ポインター）を押している間だけ、押している地点を目標にする。離す・取り消し・フォーカス喪失で止まる
function bindPointer(el: HTMLCanvasElement, s: Session): () => void {
  let id: number | null = null;
  const toWorld = (e: PointerEvent): Point => {
    const r = el.getBoundingClientRect(), v = s.view;
    return { x: v.x + ((e.clientX - r.left) / r.width) * v.w, y: v.y + ((e.clientY - r.top) / r.height) * v.h };
  };
  const down = (e: PointerEvent) => {
    if (id !== null || e.button !== 0) return;
    e.preventDefault();
    id = e.pointerId;
    try { el.setPointerCapture(e.pointerId); } catch { /* 合成イベントではキャプチャできない場合がある */ }
    s.press(toWorld(e));
  };
  const move = (e: PointerEvent) => { if (id === e.pointerId) s.press(toWorld(e)); };
  const up = (e: PointerEvent) => { if (id === e.pointerId) { id = null; s.release(); } };
  const cancelAll = () => { id = null; s.release(); };
  const onVis = () => { if (document.hidden) cancelAll(); };
  el.addEventListener("pointerdown", down);
  el.addEventListener("pointermove", move);
  for (const t of ["pointerup", "pointercancel", "lostpointercapture"] as const) el.addEventListener(t, up);
  window.addEventListener("blur", cancelAll);
  document.addEventListener("visibilitychange", onVis);
  return () => {
    el.removeEventListener("pointerdown", down);
    el.removeEventListener("pointermove", move);
    for (const t of ["pointerup", "pointercancel", "lostpointercapture"] as const) el.removeEventListener(t, up);
    window.removeEventListener("blur", cancelAll);
    document.removeEventListener("visibilitychange", onVis);
  };
}

// React から生成・破棄する窓口。mount は最初のフレームを描き終えたら解決し、destroy は破棄の完了で解決する
export class PhaserTown {
  private game: Phaser.Game | null = null;
  private unbind: (() => void) | null = null;
  private dead = false;
  private destroyed: Promise<void> | null = null;

  mount(parent: HTMLElement, session: Session): Promise<void> {
    return new Promise((ready, reject) => {
      const scene = new TownScene();
      const game = new Phaser.Game({
        type: Phaser.AUTO, parent, width: session.view.w, height: session.view.h, backgroundColor: "#ece8dc",
        // 中央寄せは外側の CSS（.world-host の flex）で行う。Phaser の autoCenter も使うと余白が二重につき、左にずれる
        scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.NO_CENTER },
        banner: false, audio: { noAudio: true }, scene: []
      });
      this.game = game;
      let first = false;
      game.events.once(Phaser.Core.Events.READY, () => {
        if (this.dead) return; // 起動中に破棄された
        game.canvas.classList.add("world-canvas");
        game.scene.add("town", scene, true, {
          session,
          onReady: () => { if (!this.dead) this.unbind = bindPointer(game.canvas, session); },
          onError: (e: Error) => reject(e)
        } satisfies SceneData);
      });
      game.events.on(Phaser.Core.Events.POST_RENDER, () => {
        if (!first && !this.dead && scene.created) { first = true; ready(); }
      });
    });
  }

  destroy(): Promise<void> {
    if (this.destroyed) return this.destroyed;
    this.dead = true;
    this.unbind?.();
    const game = this.game;
    this.destroyed = new Promise((done) => {
      if (!game) { done(); return; }
      game.events.once(Phaser.Core.Events.DESTROY, () => done());
      game.destroy(true); // 次のフレームで破棄され、DESTROY が発火する
    });
    return this.destroyed;
  }
}
