// 画面の状態の正本。React はこのストアを購読し、描画側（Phaser / Canvas）は毎フレームここから読むだけにする。
// 描画側は外見や乗車状態のコピーを持たないため、React と描画の状態が食い違わない。
import type { Character, Outfit } from "../core/appearance";
import { Sim } from "../core/sim";

export type RendererKind = "phaser" | "canvas";

export type UiState = {
  screen: "select" | "game";
  selected: Character; // 選択画面で選んでいる人物
  character: Character; // 街に出ている人物
  outfits: Record<Character, Outfit>; // 人物ごとの衣装（選び直しても保持）
  riding: boolean;
  renderer: RendererKind;
  debug: boolean;
  message: string;
};

type Listener = () => void;

export class Session {
  readonly sim = new Sim();
  private state: UiState;
  private listeners = new Set<Listener>();

  constructor(renderer: RendererKind = "phaser") {
    this.state = {
      screen: "select", selected: "girl", character: "girl", outfits: { girl: "base", boy: "base" },
      riding: false, renderer, debug: false, message: ""
    };
  }

  getState = (): UiState => this.state;
  subscribe = (fn: Listener) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
  private set(patch: Partial<UiState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((fn) => fn());
  }

  select(c: Character) { this.set({ selected: c }); }
  enter() { this.sim.release(); this.set({ screen: "game", character: this.state.selected, message: "" }); }
  backToSelect() { this.sim.release(); this.set({ screen: "select", selected: this.state.character }); }
  setOutfit(o: Outfit) {
    this.set({ outfits: { ...this.state.outfits, [this.state.character]: o }, message: "" });
  }
  toggleRide(): boolean {
    this.sim.release();
    if (!this.state.riding && !this.sim.canRide()) {
      this.set({ message: "ここは狭くて乗れません。石畳の中央へ移動してから乗ってください。" });
      return false;
    }
    const riding = !this.state.riding;
    this.set({ riding, message: riding ? "スクーターに乗りました。同じ長押しで運転できます。" : "降りました。服装はそのままです。" });
    return true;
  }
  setRenderer(r: RendererKind) { this.sim.release(); this.set({ renderer: r }); }
  setDebug(v: boolean) { this.set({ debug: v }); }

  // 毎フレーム描画側から呼ぶ。街の画面のときだけ動く
  tick(dt: number) {
    if (this.state.screen !== "game") { this.sim.release(); return; }
    this.sim.step(dt, this.state.riding);
  }
}
