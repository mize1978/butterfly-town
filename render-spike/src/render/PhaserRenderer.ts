// Phaser 4 で描く方式。素材・通行判定・入力・外見の解決は Canvas 版と共通にし、表示だけを Phaser に任せる。
// 移動と衝突は Phaser の物理エンジン（Arcade は矩形と円だけ）を使わず、共通の多角形判定（core/world.ts）で行う。
import Phaser from "phaser";
import { ART_FILES, CHARACTERS, DRAW_HEIGHT, OUTFITS, resolve, textureKey, walkRects } from "../core/appearance";
import { FOREGROUND, H, RIDE_RADIUS, WALK, WALK_RADIUS, W } from "../core/world";
import type { Session } from "../state/session";
import { ART_BASE, bindPointer, FrameMeter, makeForeground, STRESS, stressActor } from "./shared";
import type { Renderer, Rendered } from "./types";

type SceneData = { session: Session; onCreated: () => void; onError: (e: Error) => void };

class TownScene extends Phaser.Scene {
  private session!: Session;
  private data_!: SceneData;
  private failed = false;
  private player!: Phaser.GameObjects.Image;
  private shadow!: Phaser.GameObjects.Ellipse;
  private ring!: Phaser.GameObjects.Graphics;
  private debug!: Phaser.GameObjects.Graphics;
  private crowd: Phaser.GameObjects.Image[] = [];
  created = false;
  frameStart = 0;
  frames = 0;

  constructor() { super("town"); }
  init(data: SceneData) { this.data_ = data; this.session = data.session; }

  preload() {
    this.load.on("loaderror", (f: Phaser.Loader.File) => {
      if (this.failed) return;
      this.failed = true;
      this.data_.onError(new Error(`素材の読み込みに失敗：${f.key}.png`));
    });
    for (const name of ART_FILES) this.load.image(name, `${ART_BASE}${name}.png`);
  }

  create() {
    // 通信の失敗（loaderror）に加え、画像として読めなかったファイルも検出する。
    // 開発サーバーは存在しないファイルに index.html を返すため、Phaser では loaderror ではなく処理失敗になる
    const missing = ART_FILES.filter((n) => !this.textures.exists(n));
    if (!this.failed && missing.length) {
      this.failed = true;
      this.data_.onError(new Error(`素材の読み込みに失敗：${missing.map((n) => `${n}.png`).join("、")}`));
    }
    if (this.failed) return; // 読み込みに失敗したら初期化しない（呼び出し側が破棄する）
    // 歩行シート（1枚に4コマ）から、各コマを名前付きフレーム 0〜3 として登録する
    for (const c of CHARACTERS) for (const o of OUTFITS) {
      const key = textureKey(c, o, "walk"), tex = this.textures.get(key);
      walkRects(key).forEach((r, i) => tex.add(i, 0, r[0], r[1], r[2], r[3]));
    }
    this.add.image(0, 0, "town").setOrigin(0, 0).setDisplaySize(W, H).setDepth(0);
    for (let i = 0; i < STRESS; i++) {
      const a = stressActor(i, 0);
      this.crowd.push(this.add.image(a.x, a.y, a.texture, a.frame).setOrigin(0.5, 1).setDepth(0.5));
    }
    this.shadow = this.add.ellipse(0, 0, 40, 14, 0x243e35, 0.27).setDepth(1);
    this.player = this.add.image(0, 0, "girl-base").setOrigin(0.5, 1).setDepth(2);
    const town = this.textures.get("town").getSourceImage() as HTMLImageElement;
    this.textures.addCanvas("foreground", makeForeground(town));
    this.add.image(0, 0, "foreground").setOrigin(0, 0).setDepth(3);
    this.ring = this.add.graphics().setDepth(4);
    this.debug = this.add.graphics().setDepth(5);
    this.created = true;
    this.data_.onCreated();
  }

  update(_time: number, delta: number) {
    if (!this.created) return;
    this.frameStart = performance.now();
    const s = this.session, st = s.getState(), sim = s.sim;
    s.tick(Math.min(delta / 1000, 0.05));
    const now = performance.now();
    this.crowd.forEach((img, i) => {
      const a = stressActor(i, now);
      img.setFrame(a.frame).setFlipX(a.flip);
      img.setDisplaySize((120 * img.frame.width) / img.frame.height, 120);
    });
    const r = resolve(st.character, st.outfits[st.character], st.riding, sim.moving, sim.gaitDistance);
    const h = DRAW_HEIGHT[r.mode];
    if (r.rect) this.player.setTexture(r.texture, r.frame);
    else this.player.setTexture(r.texture);
    const fw = this.player.frame.width, fh = this.player.frame.height;
    this.player.setDisplaySize((h * fw) / fh, h).setPosition(sim.pos.x, sim.pos.y).setFlipX(sim.facing < 0);
    this.shadow.setPosition(sim.pos.x, sim.pos.y - 3).setSize(st.riding ? 100 : 40, st.riding ? 24 : 14);
    this.ring.clear();
    if (sim.target) this.ring.lineStyle(3, sim.blocked ? 0xeab86b : 0xfff9d2, 1).strokeCircle(sim.target.x, sim.target.y, 13);
    this.debug.clear();
    if (st.debug) {
      const pts = (p: typeof WALK) => p.map(([x, y]) => new Phaser.Math.Vector2(x, y));
      this.debug.fillStyle(0x3fffc4, 0.13).lineStyle(3, 0x3fffc4, 1);
      this.debug.fillPoints(pts(WALK), true).strokePoints(pts(WALK), true);
      this.debug.lineStyle(3, 0xff70c9, 1).strokePoints(pts(FOREGROUND), true);
      this.debug.lineStyle(2, 0xffffff, 1).strokeCircle(sim.pos.x, sim.pos.y, st.riding ? RIDE_RADIUS : WALK_RADIUS);
    }
  }

  // 実際の表示オブジェクトから読み戻した値（描画後に呼ぶ）
  readBack(): Rendered | null {
    if (!this.created) return null;
    const name = this.player.frame.name;
    return { texture: this.player.texture.key, frame: typeof name === "number" ? name : /^\d+$/.test(String(name)) ? Number(name) : -1,
      flip: this.player.flipX, x: this.player.x, y: this.player.y, frames: this.frames };
  }
}

export class PhaserRenderer implements Renderer {
  readonly kind = "phaser" as const;
  private game: Phaser.Game | null = null;
  private scene: TownScene | null = null;
  private unbind: (() => void) | null = null;
  private meter = new FrameMeter();
  private dead = false;
  private destroyed: Promise<void> | null = null;
  private info: Rendered | null = null;

  mount(parent: HTMLElement, session: Session): Promise<void> {
    return new Promise((ready, reject) => {
      const scene = new TownScene();
      this.scene = scene;
      const game = new Phaser.Game({
        type: Phaser.AUTO, parent, width: W, height: H, backgroundColor: "#ece8dc",
        scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
        banner: false, audio: { noAudio: true }, scene: []
      });
      this.game = game;
      let firstFrame = false;
      game.events.once(Phaser.Core.Events.READY, () => {
        if (this.dead) return; // 起動中に破棄された
        game.canvas.dataset.renderer = "phaser";
        game.canvas.classList.add("world-canvas");
        game.scene.add("town", scene, true, {
          session,
          onCreated: () => { if (!this.dead) this.unbind = bindPointer(game.canvas, session); },
          onError: (e: Error) => { reject(e); }
        } satisfies SceneData);
      });
      game.events.on(Phaser.Core.Events.POST_RENDER, () => {
        if (this.dead || !scene.created) return;
        scene.frames++;
        this.info = scene.readBack();
        if (scene.frameStart) this.meter.record(performance.now() - scene.frameStart, scene.frameStart);
        if (!firstFrame) { firstFrame = true; ready(); }
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
  rendered() { return this.info; }
  metrics() {
    const backend = this.game?.renderer?.type === Phaser.WEBGL ? "phaser-webgl" : "phaser-canvas";
    return this.meter.read(backend);
  }
  resetMetrics() { this.meter.reset(); }
  canvas() { return this.game?.canvas ?? null; }
}
