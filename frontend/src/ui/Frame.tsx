// 各画面に共通の枠（Figma の各画面と同じく、上に深緑の帯と「Butterfly Town」を置く）
import { useId, type ReactNode } from "react";

export function Frame({ label, actions, children, className = "" }: {
  label?: string; // 帯の右側に出す画面名
  actions?: ReactNode; // 帯の右端に置く操作（街のメニューボタンなど）
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`frame ${className}`}>
      <header className="bar">
        <span className="brand">Butterfly Town</span>
        {label && <span className="bar-label">{label}</span>}
        {actions}
      </header>
      {children}
    </div>
  );
}

// 押せない操作をまとめて並べ、理由は1行だけ添える（未実装なのに使えるように見せない）
export function Locked({ labels, note }: { labels: string[]; note: string }) {
  const id = useId();
  return (
    <div className="locked-block">
      <div className="locked">
        {labels.map((l) => <button key={l} type="button" className="btn small" disabled aria-describedby={id}>{l}</button>)}
      </div>
      <p className="locked-note" id={id}>{note}</p>
    </div>
  );
}
