// S06 住民との会話（試作）。街の上に重ねる「画面下の会話ウィンドウ」として出し、主人公と話し相手は見えたままにする。
// 固定のサンプル会話を「次へ」で1文ずつ出すだけで、AIには接続していない。
// Figma の S06 にある立ち絵・話しかける内容の入力欄・送信、時間の消費、特殊介入は今回は作らない。
// 開いている間、背後の街は止まっている（描画と街の状態はそのまま残し、閉じたら同じ位置・同じカメラから続ける）
import { useEffect, useRef, useState } from "react";
import type { SampleResident } from "../game/sample-resident";
import { dialogKeys } from "./dialog";

export function ConversationView({ resident, onClose }: { resident: SampleResident; onClose: () => void }) {
  const [at, setAt] = useState(0); // いま表示している文の番号
  const root = useRef<HTMLDivElement>(null);
  const line = resident.lines[at];
  const last = at >= resident.lines.length - 1;

  // 開いたときは「次へ」、最後の文では「閉じる」にフォーカスを移す（「次へ」が消えてもフォーカスを失わない）
  useEffect(() => { root.current?.querySelector<HTMLElement>(last ? ".talk-close" : ".talk-next")?.focus(); }, [last]);

  return (
    <div className="talk-window" role="dialog" aria-modal="true" aria-labelledby="talk-title" aria-describedby="talk-about"
      ref={root} onKeyDown={dialogKeys(root, onClose)}>
      <div className="talk-head">
        <h2 id="talk-title" className="talk-name">{resident.name}との会話</h2>
        <span className="talk-badge">サンプル会話・AI未接続</span>
        <span className="talk-count" aria-label={`${resident.lines.length}文中${at + 1}文目`}>{at + 1} / {resident.lines.length}</span>
      </div>
      {/* 名札：住民の発言は住民の名前、サンプルの区切りなどの案内は「案内」（住民が話したように見せない） */}
      <p className={line.speaker === "note" ? "talk-text talk-note" : "talk-text"} aria-live="polite">
        <span className="talk-speaker">{line.speaker === "note" ? "案内" : resident.name}</span>
        <span className="talk-line">{line.text}</span>
      </p>
      <div className="talk-foot">
        <p className="talk-about" id="talk-about">固定の文を順に表示しています（AIの返答ではなく、記憶・保存にも残りません）</p>
        <div className="talk-buttons">
          {!last && <button type="button" className="btn primary talk-next" onClick={() => setAt((n) => n + 1)}>次へ →</button>}
          <button type="button" className={`btn talk-close${last ? " primary" : ""}`} onClick={onClose}>閉じる</button>
        </div>
      </div>
    </div>
  );
}
