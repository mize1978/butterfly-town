import type { Session } from "../state/session";

// 描画側が直前のフレームで「実際に描いたもの」の記録。
// Phaser は表示オブジェクトの実値（テクスチャ・フレーム名・反転・位置）、Canvas は描画命令に渡した画像と切り出し範囲を読み戻す。
export type Rendered = {
  texture: string; // 実際に使った画像のキー
  frame: number; // 歩行シートのコマ番号（画像全体なら -1）
  flip: boolean;
  x: number; y: number; // 人物の足元の位置
  frames: number; // 描いたフレーム数
};

// spanMs：最初と最後の標本の間隔、lastAt：最後の標本の時刻（performance.now()）。計測区間を覆っているかの確認用
export type Metrics = { fps: number; frameMsAvg: number; frameMsP95: number; samples: number; backend: string; spanMs: number; lastAt: number };

export interface Renderer {
  readonly kind: "phaser" | "canvas";
  // 素材を読み込み、最初の1フレームを描き終えたら解決する
  mount(parent: HTMLElement, session: Session): Promise<void>;
  // 破棄が完了したら解決する（Phaser は次のフレームで破棄されるため、DESTROY イベントを待つ）
  destroy(): Promise<void>;
  rendered(): Rendered | null;
  metrics(): Metrics;
  resetMetrics(): void;
  canvas(): HTMLCanvasElement | null;
}
