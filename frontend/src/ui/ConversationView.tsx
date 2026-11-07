// S06 住民との会話（試作）。街の上に重ねる「画面下の会話ウィンドウ」として出し、主人公と話し相手は見えたままにする。
// 固定のサンプル会話を「次へ」で1文ずつ出すだけで、AIには接続していない。
// Figma の S06 にある立ち絵・話しかける内容の入力欄・送信、時間の消費、特殊介入は今回は作らない。
// 同じウィンドウで、スクーター修理の固定の返答（S09）と部品を調べたときの文（S10）も出す。最後の文で操作を1つ添えられる。
// 開いている間、背後の街は止まっている（描画と街の状態はそのまま残し、閉じたら同じ位置・同じカメラから続ける）
import { useEffect, useRef, useState } from "react";
import type { SampleLine } from "../game/sample-resident";
import { dialogKeys } from "./dialog";

type Props = {
  title: string; // 見出し（読み上げ用。スマホでは見た目上は隠す）
  speaker: string; // 話し手の名札
  badge: string;
  lines: readonly SampleLine[];
  action?: { label: string; run: () => void }; // 最後の文で出す操作（依頼を受ける など）
  onClose: () => void;
};

export function ConversationView({ title, speaker, badge, lines, action, onClose }: Props) {
  const [at, setAt] = useState(0); // いま表示している文の番号
  const root = useRef<HTMLDivElement>(null);
  const line = lines[at];
  const last = at >= lines.length - 1;

  // 開いたときは「次へ」、最後の文では操作（なければ「閉じる」）にフォーカスを移す（「次へ」が消えてもフォーカスを失わない）
  useEffect(() => {
    root.current?.querySelector<HTMLElement>(!last ? ".talk-next" : action ? ".talk-action" : ".talk-close")?.focus();
  }, [last, action]);

  return (
    <div className="talk-window" role="dialog" aria-modal="true" aria-labelledby="talk-title" aria-describedby="talk-about"
      ref={root} onKeyDown={dialogKeys(root, onClose)}>
      <div className="talk-head">
        <h2 id="talk-title" className="talk-name">{title}</h2>
        <span className="talk-badge">{badge}</span>
        <span className="talk-count" aria-label={`${lines.length}文中${at + 1}文目`}>{at + 1} / {lines.length}</span>
      </div>
      {/* 名札：話し手の発言は話し手の名前、サンプルの区切りなどの案内は「案内」（住民が話したように見せない） */}
      <p className={line.speaker === "note" ? "talk-text talk-note" : "talk-text"} aria-live="polite">
        <span className="talk-speaker">{line.speaker === "note" ? "案内" : speaker}</span>
        <span className="talk-line">{line.text}</span>
      </p>
      <div className="talk-foot">
        <p className="talk-about" id="talk-about">固定の文を順に表示しています（AIの返答ではなく、記憶・保存にも残りません）</p>
        <div className="talk-buttons">
          {!last && <button type="button" className="btn primary talk-next" onClick={() => setAt((n) => n + 1)}>次へ →</button>}
          {last && action && <button type="button" className="btn primary talk-action" onClick={action.run}>{action.label} →</button>}
          <button type="button" className={`btn talk-close${last && !action ? " primary" : ""}`} onClick={onClose}>閉じる</button>
        </div>
      </div>
    </div>
  );
}
