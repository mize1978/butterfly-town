// S01 トップ。街の絵を大きく敷き、タイトルと「ゲストで遊ぶ」を中央にまとめる。
// 背景の川だけ、ゆったり流れて見せる（右下のボタンでオン・オフ。オフでは元の静止画）。
// 試作版で遊べるのはゲストだけ。登録・ログイン・つづきからは押せない状態で並べ、理由は1行にまとめる
import { useCallback, useState } from "react";
import { initialWaterOn, saveWaterOn, TitleWater } from "../title/TitleWater";
import { Locked } from "./Frame";

export function TitleScreen({ onGuest, onHowTo }: { onGuest: () => void; onHowTo: () => void }) {
  const [water, setWater] = useState(initialWaterOn);
  const [unavailable, setUnavailable] = useState(false); // 描画できない環境では静止画で表示していることを示す
  const toggle = () => setWater((on) => { saveWaterOn(!on); return !on; });
  const onUnavailable = useCallback(() => setUnavailable(true), []);

  return (
    <div className="title-screen">
      <div className="title-visual" role="img" aria-label="街祭りの通りの風景">
        <TitleWater on={water && !unavailable} onUnavailable={onUnavailable} />
      </div>
      <main className="title-card">
        <p className="title-brand">Butterfly Town</p>
        <h1 className="title-lead">小さな一手が、<wbr />街の未来を変える。</h1>
        <p className="title-sub">記憶と意思を持つ住民たちと、5日間の街祭りへ。</p>
        <button type="button" className="btn primary start" onClick={onGuest} autoFocus>ゲストで遊ぶ →</button>
        <button type="button" className="btn ghost" onClick={onHowTo}>遊び方</button>
        <Locked labels={["登録する", "ログイン", "つづきから"]} note="試作版：ゲストプレイのみ利用できます" />
      </main>
      {unavailable
        ? <button type="button" className="btn small water-toggle" disabled title="この環境では水の動きを表示できないため、静止画で表示しています">水の動き：利用できません</button>
        : <button type="button" className="btn small water-toggle" aria-pressed={water} onClick={toggle}>水の動き：{water ? "オン" : "オフ"}</button>}
    </div>
  );
}
