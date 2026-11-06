// S01 トップ。街の絵を大きく敷き、タイトルと「ゲストで遊ぶ」を中央にまとめる。
// 試作版で遊べるのはゲストだけ。登録・ログイン・つづきからは押せない状態で並べ、理由は1行にまとめる
import { Locked } from "./Frame";

export function TitleScreen({ onGuest, onHowTo }: { onGuest: () => void; onHowTo: () => void }) {
  return (
    <div className="title-screen">
      <div className="title-visual" role="img" aria-label="街祭りの通りの風景" />
      <main className="title-card">
        <p className="title-brand">Butterfly Town</p>
        <h1 className="title-lead">小さな一手が、<wbr />街の未来を変える。</h1>
        <p className="title-sub">記憶と意思を持つ住民たちと、5日間の街祭りへ。</p>
        <button type="button" className="btn primary start" onClick={onGuest} autoFocus>ゲストで遊ぶ →</button>
        <button type="button" className="btn ghost" onClick={onHowTo}>遊び方</button>
        <Locked labels={["登録する", "ログイン", "つづきから"]} note="試作版：ゲストプレイのみ利用できます" />
      </main>
    </div>
  );
}
