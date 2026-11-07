import { Frame } from "./Frame";

// S25 遊び方。内容は Figma の S25 のうち確定している部分と、いま実際にできる操作だけ
export function HowToBody() {
  return (
    <>
      <dl className="howto">
        <dt>目標</dt>
        <dd>5日間×朝昼夜＝15時間帯で、街祭りを成功へ導きます。</dd>
        <dt>住民の意思</dt>
        <dd>住民は人格・記憶・目標に基づいて自分で判断します。特殊介入（蝶を放つ）は1プレイ3回までです。</dd>
        <dt>いまできること</dt>
        <dd>行きたい方向を長押しすると歩きます。離すと止まります。右上の「メニュー」で一時停止できます。</dd>
      </dl>
      <p className="note">この試作版では、街の探索・サンプル会話・スクーター修理の部品探しを体験できます。進行は保存されません。</p>
    </>
  );
}

export function HowToScreen({ onStart, onBack }: { onStart: () => void; onBack: () => void }) {
  return (
    <Frame label="遊び方">
      <main className="page">
        <h1 className="lead">小さな一手で、街に変化を</h1>
        <HowToBody />
        <div className="actions">
          <button type="button" className="btn primary" onClick={onStart} autoFocus>ゲストで始める →</button>
          <button type="button" className="btn" onClick={onBack}>トップへ戻る</button>
        </div>
      </main>
    </Frame>
  );
}
