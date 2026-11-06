// タイトルの背景の上に重ねる「川だけ動く」キャンバス。on が false のときは何も描かず、静止画のまま。
// 素材が読めない・WebGL が使えないときも静止画のまま（エラーは出さない）
import { useEffect, useRef, useState } from "react";
import { RiverWater } from "./RiverWater";
import type { WaterQuality } from "./river";

const ART = "/art/town.png";

// スマホ・狭い画面・タッチ操作では軽い設定にする
function quality(): WaterQuality {
  return window.matchMedia("(max-width: 640px), (pointer: coarse)").matches ? "lite" : "full";
}

// onUnavailable：始められなかった・途中で描画が失われたときに1回呼ぶ（ボタンを「利用できません」にするため）
export function TitleWater({ on, onUnavailable }: { on: boolean; onUnavailable: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const water = useRef<RiverWater | null>(null);
  const [failed, setFailed] = useState(false); // 始められなかった・途中で描画が失われた（GPUのリセットなど）ときは静止画に戻す

  useEffect(() => {
    if (!on || failed) return;
    let alive = true;
    const lost = () => setFailed(true);
    canvas.current?.addEventListener("webglcontextlost", lost);
    const img = new Image();
    img.src = ART;
    img.decode()
      .then(() => {
        if (!alive || !canvas.current) return;
        water.current = new RiverWater(canvas.current, img, quality());
        water.current.play();
      })
      .catch(() => { if (alive) setFailed(true); });
    const el = canvas.current;
    return () => {
      alive = false;
      el?.removeEventListener("webglcontextlost", lost); // 自分で手放すときの contextlost は失敗として扱わない
      water.current?.destroy(); water.current = null;
    };
  }, [on, failed]);

  useEffect(() => { if (failed) onUnavailable(); }, [failed, onUnavailable]);

  // オフにすると描画の状態（WebGL）を手放すので、オンに戻すたびに新しいキャンバスを作る（同じキャンバスは使い回せない）
  return on && !failed ? <canvas ref={canvas} className="title-water" aria-hidden="true" /> : null;
}

// 動きの初期値：保存した選択があればそれ、なければ「視差効果を減らす」設定のときはオフ
const KEY = "butterfly-town.title-water";
export function initialWaterOn(): boolean {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === "on" || saved === "off") return saved === "on";
  } catch { /* 保存できない環境では毎回初期値 */ }
  return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
export function saveWaterOn(on: boolean) {
  try { localStorage.setItem(KEY, on ? "on" : "off"); } catch { /* 保存できなくても動作は変わらない */ }
}
