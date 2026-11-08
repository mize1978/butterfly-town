// Phaser 4 で街と人物を描く。移動と衝突は Phaser の物理エンジンを使わず、共通の多角形判定（core/world.ts）で行う。
import Phaser from "phaser";
import { measuredRects, SPRITE_FILES, WALK_HEIGHT } from "../core/appearance";
import type { Point } from "../core/world";
import type { Session, Tags } from "../game/session";
import { PART_IDS, PARTS, partSpotId, partsInTown, SHOP, type PartId, type Repair, type SpotId } from "../game/errand";
import { VIEW_SIZE, type ViewSize } from "../core/camera";
import { PHONE_QUERY, phoneViewSize } from "../game/view-size";

const ART_BASE = "art/";

// 仮の住民（名前のない一般住民）の立ち絵。出どころ・確認結果は ~/outputs/butterfly-resident-placeholder-01/REPORT.md（候補2）。
// 足元の中央と頭頂〜足裏の大きさは画像を測った値。主人公と同じ高さ（WALK_HEIGHT）で、足元を住民の位置に合わせて描く
const RESIDENT_ART = { key: "resident-a", footX: 560, footY: 1524, figureH: 1510 } as const;
const LABEL_GAP = 12; // 頭頂と名札の間（論理座標）
// 名札の下端の中央（論理座標）。スクーター修理は店の上に下がっている無地の木の看板に重ね、部品は印の少し上に出す
const SHOP_TAG = { x: 577, y: 190 } as const;
const PART_TAG_GAP = 40;
// 体験見本の頭上の表示。街の拡大率に関係なく、画面上でこの大きさ（CSS px）に保つ
const NAME_PX = 12;
const GREET_PX = 12;
const GREET_MS = 2200; // 近づいた瞬間から、あいさつを出しておく時間（最後の 300ms で消えていく）

type Tag = { box: Phaser.GameObjects.Container; label: Phaser.GameObjects.Text; plate: Phaser.GameObjects.Graphics };

type SceneData = { session: Session; encounter?: boolean; onReady: () => void; onError: (e: Error) => void };

class TownScene extends Phaser.Scene {
  private session!: Session;
  private hooks!: SceneData;
  private failed = false;
  private sprites = new Map<string, { img: Phaser.GameObjects.Image; shadow: Phaser.GameObjects.Ellipse }>();
  private ring!: Phaser.GameObjects.Graphics;
  private resident!: Phaser.GameObjects.Container;
  private tags = new Map<SpotId, Tag>(); // 名札（人物より手前の層に置き、主人公に隠れないようにする）
  private greet: Tag | null = null; // 体験見本：近づくと住民の名札の上に出す「あ、こんにちは！」（名前とは別に出す）
  private parts = new Map<PartId, Phaser.GameObjects.Container>(); // 部品の印。依頼を受けてから拾うまでの間だけ見せる
  private shownFor: Repair | null = null; // 部品の見せ方を合わせた時点の状態（変わったときだけ合わせ直す）
  private compact = false; // スマホ表示（名札を小さくし、拡大して描く）
  private zoom = 1; // 描く倍率。PC は 1。スマホは画面の細かさに合わせて上げ、文字や絵をぼやけさせない
  private overheadK = 0; // 体験見本：頭上の表示を整えたときの「画面上の px ÷ 論理座標」（変わったときだけ整え直す）
  private talkIcon: Phaser.GameObjects.Graphics | null = null; // 体験見本：近くにいるとき、住民の名前の横に出す「話せる」吹き出しアイコン
  private wasNear = false;
  private greetUntil = 0;
  created = false;

  constructor() { super("town"); }
  init(data: SceneData) { this.hooks = data; this.session = data.session; }

  private files() { return [this.session.town.background, ...SPRITE_FILES, RESIDENT_ART.key]; }

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
    this.resident = makeResident(this, this.session);
    for (const id of PART_IDS) this.parts.set(id, makePart(this, id));
    const r = this.session.resident;
    this.tags.set("resident", makeTag(this, { x: r.pos.x, y: r.pos.y - WALK_HEIGHT - LABEL_GAP }, r.name));
    if (this.hooks.encounter) {
      this.greet = makeTag(this, { x: r.pos.x, y: r.pos.y - WALK_HEIGHT - LABEL_GAP }, "あ、こんにちは！");
      this.talkIcon = this.add.graphics().setDepth(3.5).setVisible(false);
    }
    this.tags.set("shop", makeTag(this, SHOP_TAG, SHOP.name));
    // 部品の名札は地面に置いた物の札なので、人物より奥の層に描く（そばに立つと主人公が札の手前に来る）
    for (const id of PART_IDS) {
      const { pos, name } = PARTS[id];
      this.tags.set(partSpotId(id), makeTag(this, { x: pos.x, y: pos.y - PART_TAG_GAP }, name));
      this.tags.get(partSpotId(id))!.box.setDepth(1.3);
    }
    this.showParts();
    this.applyLook();
    this.textures.addCanvas("foreground", makeForeground(this.textures.get(town.background).getSourceImage() as HTMLImageElement, this.session));
    this.add.image(0, 0, "foreground").setOrigin(0, 0).setDepth(3);
    this.ring = this.add.graphics().setDepth(4);
    this.cameras.main.setBounds(0, 0, W, H);
    this.created = true;
    this.hooks.onReady();
  }

  // 名札がいま描かれている範囲（論理座標）。住民・スクーター修理・部品を選ぶタップの当たり判定に使う（見えている名札だけ）
  tagBounds(): Tags {
    const out: Tags = {};
    this.tags.forEach((t, id) => {
      if (!t.box.visible) return;
      const b = t.label.getBounds();
      out[id] = { x: b.x, y: b.y, w: b.width, h: b.height };
    });
    // あいさつの吹き出しと「話せる」アイコンも住民の一部として押せる（名札とまとめた範囲）
    const extra: Phaser.Geom.Rectangle[] = [];
    if (this.greet?.box.visible) extra.push(this.greet.label.getBounds());
    if (this.talkIcon?.visible) extra.push(this.talkIconBounds());
    for (const b of extra) {
      const r = out.resident;
      if (!r) break;
      const x = Math.min(r.x, b.x), y = Math.min(r.y, b.y);
      out.resident = { x, y, w: Math.max(r.x + r.w, b.x + b.width) - x, h: Math.max(r.y + r.h, b.y + b.height) - y };
    }
    return out;
  }

  // 部品は依頼を受けてから、拾うまでの間だけ置く（拾ったら消す）
  private showParts() {
    const r = this.session.repair, inTown = partsInTown(r);
    this.shownFor = r;
    for (const id of PART_IDS) {
      const on = inTown.includes(id);
      this.parts.get(id)!.setVisible(on);
      this.tags.get(partSpotId(id))!.box.setVisible(on);
    }
  }

  // スマホとPCで見た目を切り替える（倍率が変わったときも呼ぶ）。描き始める前に呼んでもよい
  setLook(compact: boolean, zoom: number) {
    this.compact = compact;
    this.zoom = zoom;
    if (this.created) this.applyLook();
  }

  // スマホ：小さめの文字を角丸の札に載せる（街の看板になじむ色）。PC：これまでの名札
  private applyLook() {
    this.overheadK = 0;
    const all: [SpotId | "greet", Tag][] = [...this.tags.entries(), ...(this.greet ? [["greet", this.greet] as [ "greet", Tag ]] : [])];
    all.forEach(([id, tag]) => {
      const t = tag.label;
      t.setResolution(this.zoom);
      if (this.compact) {
        t.setFontSize(15).setBackgroundColor("rgba(0,0,0,0)").setPadding(8, 2, 8, 2);
        tag.plate.setVisible(true);
        this.drawPlate(tag, this.session.nearSpot === id);
      } else {
        t.setFontSize(22).setPadding(10, 4, 10, 4);
        tag.plate.clear().setVisible(false);
      }
    });
  }

  private drawPlate(tag: Tag, near: boolean) {
    const t = tag.label, w = t.width, h = t.height, g = tag.plate;
    g.clear().fillStyle(near ? 0xf3d88f : 0xfbf7ec, near ? 0.95 : 0.82).fillRoundedRect(-w / 2, t.y - h, w, h, h / 2)
      .lineStyle(1.5, 0x254b43, 0.55).strokeRoundedRect(-w / 2, t.y - h, w, h, h / 2);
  }

  // 「話せる」アイコンの押せる範囲（論理座標）。絵は約18×14pxと小さいまま、指で押しやすいよう画面上で 44×44px を取る（絵の中心に合わせる）
  private talkIconBounds() {
    const k = this.overheadK || 1, i = this.talkIcon!, half = 22 / k;
    return new Phaser.Geom.Rectangle(i.x + 9 / k - half, i.y - 8 / k - half, half * 2, half * 2);
  }

  // 体験見本の頭上の表示。住民の名前だけを、札にせず小さな白文字＋控えめな影で出す（店・部品の札は出さない）。
  // あいさつは近づいた瞬間だけ短く出して消す。会話中（止めている間）は名前もあいさつも隠し、人物を見やすくする
  private overhead(now: number) {
    const s = this.session, cam = this.cameras.main;
    const k = cam.zoom * (this.scale.displaySize.width / this.scale.gameSize.width); // 画面上の px ÷ 論理座標
    const name = this.tags.get("resident")!, g = this.greet!;
    if (k > 0 && Math.abs(k - this.overheadK) > 0.001) {
      this.overheadK = k;
      name.plate.clear().setVisible(false);
      name.label.setFontSize(NAME_PX / k).setColor("#fffaf0").setBackgroundColor("rgba(0,0,0,0)")
        .setPadding(8 / k, 6 / k, 8 / k, 6 / k) // 文字は小さくても、押せる範囲は少し広めに
        .setShadow(0, 1 / k, "#0b221d", 4 / k, false, true);
      g.label.setFontSize(GREET_PX / k).setColor("#254b43").setBackgroundColor("rgba(0,0,0,0)").setPadding(10 / k, 4 / k, 10 / k, 4 / k).setShadow(0, 0, "#000", 0);
      const w = g.label.width, h = g.label.height;
      g.plate.clear().setVisible(true).fillStyle(0xfffaf0, 0.92).fillRoundedRect(-w / 2, -h, w, h, h / 2);
      // 吹き出しアイコン（約 18×14 px）：白い角丸に小さなしっぽと3つの点。原点は左下
      const u = 1 / k, ic = this.talkIcon!;
      ic.clear().fillStyle(0xfffaf0, 0.95).fillRoundedRect(0, -14 * u, 18 * u, 12 * u, 5 * u)
        .fillTriangle(4 * u, -3 * u, 9 * u, -3 * u, 3 * u, 1 * u)
        .fillStyle(0x254b43, 1).fillCircle(5 * u, -8 * u, 1.3 * u).fillCircle(9 * u, -8 * u, 1.3 * u).fillCircle(13 * u, -8 * u, 1.3 * u);
    }
    this.tags.forEach((tag, id) => tag.box.setVisible(id === "resident" && !s.isPaused));
    const near = s.nearSpot === "resident";
    if (near && !this.wasNear) this.greetUntil = now + GREET_MS;
    this.wasNear = near;
    const left = this.greetUntil - now;
    const show = near && !s.isPaused && left > 0;
    if (s.isPaused) this.greetUntil = 0; // 会話が始まったら消す（閉じた後に出し直さない）
    const nb = name.label.getBounds();
    // 近くにいる間は、名前の右に「話せる」アイコン（会話中は隠す）
    this.talkIcon!.setVisible(near && !s.isPaused).setPosition(nb.right - 4 / k, nb.bottom - 6 / k);
    g.box.setVisible(show).setAlpha(Math.min(1, left / 300)).setPosition(s.resident.pos.x, nb.y + 2 / k);
  }

  update(_time: number, delta: number) {
    if (!this.created) return;
    const s = this.session, sim = s.sim;
    s.tick(delta / 1000);
    const cam = this.cameras.main;
    if (this.zoom === 1) cam.setScroll(s.view.x, s.view.y);
    else { cam.setZoom(this.zoom); cam.centerOn(s.view.x + s.view.w / 2, s.view.y + s.view.h / 2); }
    this.sprites.forEach((o) => { o.img.setVisible(false); o.shadow.setVisible(false); });
    s.actors().forEach((a, i) => {
      const o = this.sprites.get(a.key)!, p = a.pose;
      o.img.setTexture(p.texture, `m${p.frame}`);
      // 反転は flipX ではなく負の倍率で行う（flipX はコマの中央を軸に反転するため、体の中心に合わせた点がずれる）
      const k = p.height / o.img.frame.height;
      o.img.setOrigin(p.originX, p.originY).setScale(p.flip ? -k : k, k).setPosition(p.x, p.y).setAlpha(a.alpha).setDepth(2 + i / 10).setVisible(true);
      if (a.shadow) o.shadow.setPosition(a.shadow.x, a.shadow.y - 3).setSize(a.shadow.rx * 2, a.shadow.ry * 2).setVisible(true);
    });
    // 仮の住民は足元の y で前後を決める（人物より奥なら人物の後ろに描く）。話せる距離では名札を強調する
    this.resident.setDepth(s.resident.pos.y < sim.pos.y ? 1.5 : 2.9);
    if (this.shownFor !== s.repair) this.showParts();
    if (this.hooks.encounter) this.overhead(_time);
    else this.tags.forEach((tag, id) => {
      const near = s.nearSpot === id;
      if (this.compact) this.drawPlate(tag, near);
      else tag.label.setBackgroundColor(near ? "#f3d88f" : "#fbf7ec");
    });
    this.ring.clear();
    if (sim.target) this.ring.lineStyle(3, sim.blocked ? 0xeab86b : 0xfff9d2, 1).strokeCircle(sim.target.x, sim.target.y, 13);
  }
}

// 仮の住民。立ち絵1枚と足元の影。前後関係は足元の y で主人公と比べて決める（update）
function makeResident(scene: Phaser.Scene, s: Session): Phaser.GameObjects.Container {
  const { pos } = s.resident, a = RESIDENT_ART;
  const shadow = scene.add.ellipse(0, -3, 40, 14, 0x243e35, 0.27);
  const img = scene.add.image(0, 0, a.key);
  img.setOrigin(a.footX / img.width, a.footY / img.height).setScale(WALK_HEIGHT / a.figureH);
  return scene.add.container(pos.x, pos.y, [shadow, img]).setDepth(1.5);
}

// 部品の印。本番の絵ができるまでの仮で、地面に置いた真鍮色の歯車と、ゆっくり明滅する輪を描く（人物より奥の層）。
// 4つとも同じ印で、名札（後輪・駆動ベルトなど）で見分ける
function makePart(scene: Phaser.Scene, id: PartId): Phaser.GameObjects.Container {
  const g = scene.add.graphics();
  const teeth: Phaser.Math.Vector2[] = [];
  for (let i = 0; i < 16; i++) {
    const a = (i * Math.PI) / 8, r = i % 2 ? 15 : 21;
    teeth.push(new Phaser.Math.Vector2(Math.cos(a) * r, Math.sin(a) * r * 0.6 - 10));
  }
  g.fillStyle(0x243e35, 0.27).fillEllipse(0, 0, 50, 16)
    .fillStyle(0xc0903a, 1).fillPoints(teeth, true).lineStyle(2, 0x5a3d16, 0.95).strokePoints(teeth, true)
    .fillStyle(0x5a3d16, 1).fillEllipse(0, -10, 12, 7);
  const glow = scene.add.graphics().lineStyle(2, 0xfff3c4, 1).strokeEllipse(0, -6, 66, 34);
  scene.tweens.add({ targets: glow, alpha: { from: 0.9, to: 0.15 }, duration: 900, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
  const { pos } = PARTS[id];
  return scene.add.container(pos.x, pos.y, [glow, g]).setDepth(1.2);
}

// 名札。人物・手前の植栽より上の層（深さ 3.5）に描くので、主人公が手前に来ても隠れない（目標の輪は 4 で、さらに上）。
// at は名札の下端の中央
function makeTag(scene: Phaser.Scene, at: { x: number; y: number }, name: string): Tag {
  const label = scene.add.text(0, 0, name, {
    fontFamily: '"Noto Sans JP", "Hiragino Sans", sans-serif', fontSize: "22px", color: "#254b43", backgroundColor: "#fbf7ec",
    padding: { x: 10, y: 4 }
  }).setOrigin(0.5, 1);
  const plate = scene.add.graphics().setVisible(false); // スマホの角丸の名札（文字の後ろ）
  return { box: scene.add.container(at.x, at.y, [plate, label]).setDepth(3.5), label, plate };
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

// 歩く操作（本編・体験見本で共通）：短く押して離す（タップ・クリック）と、その場所まで歩いて止まる。
// 押し続けている間は、毎フレーム「いま指の下にある地点」を目標にし直す（カメラが動いても指の方向へ歩き続ける）。離すと減速して止まる。
// 途中で別の場所を押せば、行き先が変わる。取り消し・フォーカス喪失では止まる。
// 住民・スクーター修理・部品（絵と名札）を押したときは、歩く入力にせず「選ぶ・開く」だけにする（PC・スマホ共通）
const TAP_MS = 250; // これより短く押して離したらタップ
const TAP_MOVE = 12; // 押してから離すまでにこれより動かなければタップ（px）

function bindPointer(el: HTMLCanvasElement, s: Session, tagBounds: () => Tags): () => void {
  let id: number | null = null;
  let start = { t: 0, x: 0, y: 0 }, last = { x: 0, y: 0 }, raf = 0;
  const toWorld = (p: { clientX: number; clientY: number }): Point => {
    const r = el.getBoundingClientRect(), v = s.view;
    return { x: v.x + ((p.clientX - r.left) / r.width) * v.w, y: v.y + ((p.clientY - r.top) / r.height) * v.h };
  };
  // 押し続けている間、指の下の地点を毎フレーム目標にし直す
  const follow = () => {
    if (id === null) return;
    s.press(toWorld({ clientX: last.x, clientY: last.y }));
    raf = requestAnimationFrame(follow);
  };
  const down = (e: PointerEvent) => {
    if (id !== null || e.button !== 0) return;
    e.preventDefault();
    // 住民・スクーター修理・部品を押したら、近ければ開き、遠ければ選ぶだけ。歩き出さない
    if (s.tapSpot(toWorld(e), tagBounds())) return;
    id = e.pointerId;
    try { el.setPointerCapture(e.pointerId); } catch { /* 合成イベントではキャプチャできない場合がある */ }
    s.press(toWorld(e));
    start = { t: performance.now(), x: e.clientX, y: e.clientY };
    last = { x: e.clientX, y: e.clientY };
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(follow);
  };
  const move = (e: PointerEvent) => {
    if (id !== e.pointerId) return;
    last = { x: e.clientX, y: e.clientY };
  };
  const up = (e: PointerEvent) => {
    if (id !== e.pointerId) return;
    id = null;
    cancelAnimationFrame(raf);
    const tap = e.type === "pointerup"
      && performance.now() - start.t < TAP_MS && Math.hypot(e.clientX - start.x, e.clientY - start.y) < TAP_MOVE;
    if (tap) s.goTo(toWorld(e)); // タップ：離しても、その場所まで歩く
    else s.release();
  };
  const cancelAll = () => { id = null; cancelAnimationFrame(raf); s.release(); };
  const onVis = () => { if (document.hidden) cancelAll(); };
  el.addEventListener("pointerdown", down);
  el.addEventListener("pointermove", move);
  for (const t of ["pointerup", "pointercancel", "lostpointercapture"] as const) el.addEventListener(t, up);
  window.addEventListener("blur", cancelAll);
  document.addEventListener("visibilitychange", onVis);
  return () => {
    cancelAnimationFrame(raf);
    el.removeEventListener("pointerdown", down);
    el.removeEventListener("pointermove", move);
    for (const t of ["pointerup", "pointercancel", "lostpointercapture"] as const) el.removeEventListener(t, up);
    window.removeEventListener("blur", cancelAll);
    document.removeEventListener("visibilitychange", onVis);
  };
}

// 枠の大きさから、映す大きさ（街の座標）と描く倍率を決める。PC は 1100×660・倍率1のまま。
// スマホは枠と同じ形で映し、画面の点の細かさ（最大2倍）まで拡大して描く（キャンバスが粗く、小さい文字がぼやけるのを防ぐ）
function layoutFor(host: HTMLElement, s: Session): { view: ViewSize; zoom: number; phone: boolean } {
  if (!window.matchMedia(PHONE_QUERY).matches) return { view: VIEW_SIZE, zoom: 1, phone: false };
  const r = host.getBoundingClientRect(), view = phoneViewSize(r.width, r.height, s.town);
  const zoom = Math.max(1, (r.width / view.w) * Math.min(window.devicePixelRatio || 1, 2));
  return { view, zoom, phone: true };
}

// React から生成・破棄する窓口。mount は最初のフレームを描き終えたら解決し、destroy は破棄の完了で解決する
export class PhaserTown {
  constructor(private encounter = false) {}
  private game: Phaser.Game | null = null;
  private unbind: (() => void) | null = null;
  private observer: ResizeObserver | null = null;
  private dead = false;
  private destroyed: Promise<void> | null = null;

  mount(parent: HTMLElement, session: Session): Promise<void> {
    return new Promise((ready, reject) => {
      const scene = new TownScene();
      let layout = layoutFor(parent, session);
      session.setViewSize(layout.view);
      scene.setLook(layout.phone, layout.zoom);
      const game = new Phaser.Game({
        type: Phaser.AUTO, parent, width: Math.round(session.view.w * layout.zoom), height: Math.round(session.view.h * layout.zoom), backgroundColor: "#ece8dc",
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
          encounter: this.encounter,
          onReady: () => {
            if (this.dead) return;
            this.unbind = bindPointer(game.canvas, session, () => scene.tagBounds());
            // 画面の回転・大きさの変更に合わせて、映す大きさと描く大きさを揃え直す（人物の位置と街の状態はそのまま）
            this.observer = new ResizeObserver(() => {
              const next = layoutFor(parent, session);
              if (next.view.w === layout.view.w && next.view.h === layout.view.h && next.zoom === layout.zoom && next.phone === layout.phone) return;
              layout = next;
              const w = Math.round(next.view.w * next.zoom), h = Math.round(next.view.h * next.zoom);
              session.setViewSize(next.view);
              scene.setLook(next.phone, next.zoom);
              game.scale.setGameSize(w, h);
              const cam = scene.cameras.main.setSize(w, h);
              if (next.zoom === 1) cam.setZoom(1);
            });
            this.observer.observe(parent);
          },
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
    this.observer?.disconnect();
    const game = this.game;
    this.destroyed = new Promise((done) => {
      if (!game) { done(); return; }
      game.events.once(Phaser.Core.Events.DESTROY, () => done());
      game.destroy(true); // 次のフレームで破棄され、DESTROY が発火する
    });
    return this.destroyed;
  }
}
