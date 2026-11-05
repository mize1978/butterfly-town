// 歩き方の調整値。値と決めた理由は描画試作の RESULTS.md「歩行の調整」（みぜの試遊で合格）と同じ
export type Tuning = {
  walkSpeed: number; // 最高速度（論理座標/秒）
  frameDist: number; // 歩行コマを1枚進める移動距離（横向き4コマで1周期。8コマのシートも同じ周期）
  accel: number; // 最高速度に達するまでの秒数
  decel: number; // 離してから止まるまでの秒数
  bob: number; // 体の上下動の幅（足を上げたコマで最も高くなる）
};

export const WALK: Tuning = { walkSpeed: 140, frameDist: 32, accel: 0.12, decel: 0.1, bob: 2 };
