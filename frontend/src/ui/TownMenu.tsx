// 街のメニュー（S05 の「記録・着せ替え・保存・中断」などの入口をまとめたもの）。開いている間、街は止まっている。
// いまゲストで使えるのは「街へ戻る」「遊び方」「トップへ戻る」だけ。記録・着せ替え・保存は未実装なので、押せない理由を示す。
// アカウント設定（S33）はログイン中だけの項目なので、ゲストには出さない
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Locked } from "./Frame";
import { HowToBody } from "./HowToScreen";

type View = "main" | "howto" | "save" | "leave";

export function TownMenu({ onClose, onExitToTitle }: { onClose: () => void; onExitToTitle: () => void }) {
  const [view, setView] = useState<View>("main");
  const panel = useRef<HTMLDivElement>(null);

  // 開いたとき・中身が変わったときは、最初の操作にフォーカスを移す
  useEffect(() => { panel.current?.querySelector<HTMLElement>("button:not([disabled])")?.focus(); }, [view]);

  // Esc で閉じる。Tab はメニューの中だけを巡る
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") { e.preventDefault(); if (view === "main") onClose(); else setView("main"); return; }
    if (e.key !== "Tab" || !panel.current) return;
    const items = [...panel.current.querySelectorAll<HTMLElement>("button:not([disabled])")];
    if (!items.length) return;
    const first = items[0], last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };

  const back = <button type="button" className="btn" onClick={() => setView("main")}>メニューへ戻る</button>;
  const title = { main: "メニュー", howto: "遊び方", save: "保存・中断", leave: "トップへ戻る" }[view];

  return (
    <div className="menu-layer" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="menu-panel" id="town-menu" role="dialog" aria-modal="true" aria-labelledby="menu-title" ref={panel} onKeyDown={onKeyDown}>
        <div className="menu-head">
          <h2 id="menu-title">{title}</h2>
          <span className="paused">一時停止中</span>
        </div>

        {view === "main" && (
          <>
            <button type="button" className="btn primary wide" onClick={onClose}>街へ戻る</button>
            <button type="button" className="btn wide" onClick={() => setView("howto")}>遊び方</button>
            <button type="button" className="btn wide" onClick={() => setView("save")}>保存・中断</button>
            <Locked labels={["記録", "着せ替え"]} note="試作版：記録・着せ替えは準備中です" />
            <button type="button" className="btn wide" onClick={() => setView("leave")}>トップへ戻る</button>
          </>
        )}

        {view === "howto" && (<><HowToBody />{back}</>)}

        {view === "save" && (
          <>
            <p className="lead-s">この試作版では、まだ保存されません</p>
            <p>ページを閉じたり再読み込みしたりすると、最初からになります。</p>
            <Locked labels={["登録して保存へ", "ログインして保存へ"]} note="試作版：登録・ログインは準備中です" />
            <button type="button" className="btn primary wide" onClick={onClose}>今は登録せず、街へ戻る</button>
            {back}
          </>
        )}

        {view === "leave" && (
          <>
            <p className="lead-s">トップへ戻りますか？</p>
            <p>試作版のため、この街は保存されていません。次に街へ入ると最初の位置からになります。</p>
            <button type="button" className="btn primary wide" onClick={onExitToTitle}>保存せずにトップへ戻る</button>
            <button type="button" className="btn wide" onClick={() => setView("main")}>キャンセル</button>
          </>
        )}
      </div>
    </div>
  );
}
