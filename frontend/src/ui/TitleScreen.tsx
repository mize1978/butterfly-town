// S01 トップ。街の絵を大きく敷き、タイトルと「ゲストで遊ぶ」を中央にまとめる。
// 背景の川だけ、ゆったり流れて見せる（右下のボタンでオン・オフ。オフでは元の静止画）。
// 登録・ログイン（#16）はここから。ログイン中は、メールアドレスとログアウトを出す。
// 街の保存（つづきから）はまだ無いので押せない状態で並べ、理由は1行にまとめる。ログインしていても、街はゲストの街のまま遊ぶ
import { useCallback, useState } from "react";
import type { User } from "../api/auth";
import { initialWaterOn, saveWaterOn, TitleWater } from "../title/TitleWater";
import { Locked } from "./Frame";

export function TitleScreen({ onGuest, onHowTo, starting = false, notices = [], user = null, onRegister, onLogin, onLogout, leaving = false }: {
  onGuest: () => void; onHowTo: () => void;
  user?: User | null; // ログイン中のユーザー
  onRegister?: () => void; onLogin?: () => void; onLogout?: () => void;
  leaving?: boolean; // ログアウトの通信の途中
  starting?: boolean; // 街を始める通信の途中（二度押しさせない）
  notices?: string[]; // 通信の失敗などの案内（街の確認・ログインの確認ごとに1つ）
}) {
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
        {notices.map((n) => <p key={n} className="status error" role="alert">{n}</p>)}
        <button type="button" className="btn primary start" onClick={onGuest} disabled={starting} autoFocus>{starting ? "街を準備しています…" : "ゲストで遊ぶ →"}</button>
        <button type="button" className="btn ghost" onClick={onHowTo}>遊び方</button>
        <div className="title-account">
          {user ? (
            <>
              <p className="title-signed-in">ログイン中：<span className="email">{user.email}</span></p>
              <button type="button" className="btn small" onClick={onLogout} disabled={leaving}>{leaving ? "ログアウトしています…" : "ログアウト"}</button>
            </>
          ) : (
            <div className="locked">
              <button type="button" className="btn small" onClick={onRegister}>登録する</button>
              <button type="button" className="btn small" onClick={onLogin}>ログイン</button>
            </div>
          )}
          <Locked labels={["つづきから"]} note="試作版：街の保存はまだできません（ログインしても、街はゲストと同じく保存されません）" />
        </div>
      </main>
      {unavailable
        ? <button type="button" className="btn small water-toggle" disabled title="この環境では水の動きを表示できないため、静止画で表示しています">水の動き：利用できません</button>
        : <button type="button" className="btn small water-toggle" aria-pressed={water} onClick={toggle}>水の動き：{water ? "オン" : "オフ"}</button>}
    </div>
  );
}
