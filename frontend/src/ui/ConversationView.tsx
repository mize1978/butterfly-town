// S06 住民との会話（試作）。固定のサンプル会話を「次へ」で1文ずつ出すだけで、AIには接続していない。
// Figma の S06 にある話しかける内容の入力欄・送信、時間の消費、特殊介入は今回は作らない。
// 開いている間、背後の街は止まっている（描画と街の状態はそのまま残し、閉じたら同じ位置から続ける）
import { useEffect, useRef, useState } from "react";
import type { SampleResident } from "../game/sample-resident";
import { dialogKeys } from "./dialog";

export function ConversationView({ resident, onClose }: { resident: SampleResident; onClose: () => void }) {
  const [shown, setShown] = useState(1);
  const root = useRef<HTMLDivElement>(null);
  const log = useRef<HTMLOListElement>(null);
  const done = shown >= resident.lines.length;

  // 開いたときは「次へ」、最後まで読んだら「街へ戻る」にフォーカスを移す（「次へ」が消えてもフォーカスを失わない）
  useEffect(() => { root.current?.querySelector<HTMLElement>(done ? ".talk-close" : ".talk-next")?.focus(); }, [done]);
  useEffect(() => { log.current?.lastElementChild?.scrollIntoView({ block: "nearest" }); }, [shown]);

  return (
    <div className="talk-layer" role="dialog" aria-modal="true" aria-labelledby="talk-title" ref={root} onKeyDown={dialogKeys(root, onClose)}>
      <div className="talk-grid">
        <div className="talk-portrait" aria-hidden="true">
          <span>立ち絵（未制作）</span>
        </div>
        <section className="talk-main">
          <div className="talk-head">
            <h2 id="talk-title">{resident.name}</h2>
            <span className="badge">サンプル会話・AI未接続</span>
          </div>
          <ol className="talk-log" ref={log} aria-live="polite">
            {resident.lines.slice(0, shown).map((l, i) => (
              <li key={i} className={l.speaker === "note" ? "talk-note" : "talk-line"}>
                {l.speaker === "resident" && <span className="talk-speaker">{resident.name}</span>}
                <p>{l.text}</p>
              </li>
            ))}
          </ol>
          <p className="note">固定の文を順に表示しています。住民の返答はAIで作られておらず、この会話は記憶にも保存にも残りません。</p>
        </section>
      </div>
      <div className="talk-actions">
        {!done && <button type="button" className="btn primary talk-next" onClick={() => setShown((n) => n + 1)}>次へ →</button>}
        <button type="button" className={`btn talk-close${done ? " primary" : ""}`} onClick={onClose}>街へ戻る</button>
      </div>
    </div>
  );
}
