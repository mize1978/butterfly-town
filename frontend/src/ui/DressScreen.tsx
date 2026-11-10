// S04 着せ替え（街へ出る準備）。いま歩行素材があるのは女の子・アイボリー衣装だけなので、選べるのはその1つ。
// ほかの衣装は未決定・未制作のため、選べるように見せない
import { useState } from "react";
import { Frame } from "./Frame";

export function DressScreen({ onEnter, onBack }: { onEnter: () => void; onBack: () => void }) {
  const [missing, setMissing] = useState(false);
  return (
    <Frame label="着せ替え">
      <main className="page dress">
        <h1 className="lead">街へ出る準備</h1>
        <div className="dress-grid">
          <div className="avatar">
            {missing
              ? <p className="note">人物の画像を読み込めません（frontend で `npm run art` を実行してください）</p>
              : <img src="art/girl-idle-s-base.png" alt="アイボリーの衣装の女の子" onError={() => setMissing(true)} />}
          </div>
          <section aria-labelledby="outfit-h">
            <h2 id="outfit-h">衣装を選ぶ</h2>
            <div className="outfit selected" aria-current="true">
              <span className="outfit-name">基本衣装（アイボリー）</span>
              <span className="tag">選択済み</span>
            </div>
            <p className="note">ほかの衣装は準備中です。いまはこの衣装だけで街へ出られます。</p>
          </section>
        </div>
        <div className="actions">
          <button type="button" className="btn primary" onClick={onEnter} autoFocus>この姿で街へ →</button>
          <button type="button" className="btn" onClick={onBack}>戻る</button>
        </div>
      </main>
    </Frame>
  );
}
