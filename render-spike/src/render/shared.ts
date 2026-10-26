// 両方の描画方式で共通に使う処理：素材の読み込み、手前の植栽の切り抜き、入力の座標変換、計測。
import { FOREGROUND, H, W, type Point } from "../core/world";
import type { Session } from "../state/session";

// 素材の場所。?art=<フォルダ>/ は読み込み失敗時の動作を確かめる検証専用の指定
export const ART_BASE = new URLSearchParams(location.search).get("art") ?? "art/";

export function loadImage(name: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`素材の読み込みに失敗：${name}.png`));
    img.src = `${ART_BASE}${name}.png`;
  });
}

// 背景から手前の植栽だけを切り抜いた透過画像。人物の上に重ねて「植栽の奥にいる」ように見せる
export function makeForeground(town: CanvasImageSource): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const g = c.getContext("2d")!;
  g.beginPath();
  FOREGROUND.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  g.closePath();
  g.clip();
  g.drawImage(town, 0, 0, W, H);
  return c;
}

// マウス（ポインター）を押している間だけ、押している地点を目標にする。離す・取り消し・フォーカス喪失で止まる
export function bindPointer(el: HTMLCanvasElement, session: Session): () => void {
  let id: number | null = null;
  const toWorld = (e: PointerEvent): Point => {
    const r = el.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  };
  const down = (e: PointerEvent) => {
    if (id !== null || e.button !== 0 || session.getState().screen !== "game") return;
    e.preventDefault();
    id = e.pointerId;
    try { el.setPointerCapture(e.pointerId); } catch { /* 合成イベントではキャプチャできない場合がある */ }
    session.sim.press(toWorld(e));
  };
  const move = (e: PointerEvent) => { if (id === e.pointerId) session.sim.press(toWorld(e)); };
  const up = (e: PointerEvent) => { if (id === e.pointerId) { id = null; session.sim.release(); } };
  const cancelAll = () => { id = null; session.sim.release(); };
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

// 1フレームあたりの処理時間（更新＋描画命令の発行。GPU の実行時間は含まない）と、実際のフレームレート
export class FrameMeter {
  private times: number[] = [];
  private stamps: number[] = [];
  reset() { this.times = []; this.stamps = []; }
  record(ms: number, now: number) {
    this.times.push(ms); this.stamps.push(now);
    if (this.times.length > 600) { this.times.shift(); this.stamps.shift(); }
  }
  read(backend: string) {
    const n = this.times.length;
    if (n < 2) return { fps: 0, frameMsAvg: 0, frameMsP95: 0, samples: n, backend, spanMs: 0, lastAt: this.stamps[n - 1] ?? 0 };
    const sorted = [...this.times].sort((a, b) => a - b);
    const span = (this.stamps[n - 1] - this.stamps[0]) / 1000;
    return {
      fps: span > 0 ? (n - 1) / span : 0,
      frameMsAvg: this.times.reduce((a, b) => a + b, 0) / n,
      frameMsP95: sorted[Math.min(n - 1, Math.floor(n * 0.95))],
      samples: n, backend, spanMs: span * 1000, lastAt: this.stamps[n - 1]
    };
  }
}

// 負荷試験（?stress=N）：歩行コマを再生する人物を N 体、決まった位置に追加で描く。描画性能の比較専用
export const STRESS = Math.max(0, Math.min(2000, Number(new URLSearchParams(location.search).get("stress")) || 0));
export function stressActor(i: number, t: number) {
  const x = 80 + ((i * 137) % 1380), y = 200 + ((i * 89) % 780);
  const keys = ["girl-walk-base", "girl-walk-alt", "boy-walk-base", "boy-walk-alt"];
  return { x, y, texture: keys[i % 4], frame: Math.floor(t / 180 + i) % 4, flip: i % 2 === 1 };
}
