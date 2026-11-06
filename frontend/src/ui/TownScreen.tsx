// S05 街・徒歩。街の地図を Rails API から受け取り、Phaser で描く。
// メニューを開いている間は街を止め（人物はその場で止まり、押しても歩かない）、閉じたら同じ位置・同じカメラから続ける。
// 描画（Phaser）と街の状態（Session）はメニューの開閉で作り直さない
import { useEffect, useMemo, useRef, useState } from "react";
import { fetchTown } from "../api/town";
import type { Town } from "../core/world";
import { Session } from "../game/session";
import { Frame } from "./Frame";
import { GameView } from "./GameView";
import { TownMenu } from "./TownMenu";

type Load = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; town: Town };

export function TownScreen({ onExitToTitle }: { onExitToTitle: () => void }) {
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const ac = new AbortController();
    setLoad({ status: "loading" });
    fetchTown(ac.signal)
      .then((town) => setLoad({ status: "ready", town }))
      .catch((e: Error) => { if (!ac.signal.aborted) setLoad({ status: "error", message: e.message }); });
    return () => ac.abort();
  }, [attempt]);

  const town = load.status === "ready" ? load.town : null;
  const session = useMemo(() => (town ? new Session(town) : null), [town]);

  useEffect(() => {
    if (!session) return;
    if (menuOpen) session.pause(); else session.resume();
  }, [menuOpen, session]);

  // 「M」キーでも開閉できる（入力欄はまだ無いので、街の画面ではどこで押してもよい）
  useEffect(() => {
    if (!session) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "m" && !e.metaKey && !e.ctrlKey && !e.altKey && !menuOpen) { e.preventDefault(); setMenuOpen(true); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [session, menuOpen]);

  const closeMenu = () => { setMenuOpen(false); requestAnimationFrame(() => menuButton.current?.focus()); };

  const menuToggle = session && (
    <button type="button" ref={menuButton} className="btn menu-button" aria-haspopup="dialog" aria-expanded={menuOpen}
      aria-controls="town-menu" onClick={() => (menuOpen ? closeMenu() : setMenuOpen(true))}>
      メニュー
    </button>
  );

  return (
    <Frame label="街・徒歩" actions={menuToggle} className="town-frame">
      <main className="town-main">
        {load.status === "loading" && <p className="status">街の地図を読み込んでいます…</p>}
        {load.status === "error" && (
          <div className="status error" role="alert">
            <p>{load.message}</p>
            <button type="button" className="btn" onClick={() => setAttempt((n) => n + 1)}>もう一度読み込む</button>
            <button type="button" className="btn" onClick={onExitToTitle}>トップへ戻る</button>
          </div>
        )}
        {session && (
          <>
            {/* 街の絵・情報・操作の説明をひとまとまりにして画面の中央に置く（絵の縦横比は 1100×660 のまま） */}
            <div className="town-stage">
              <div className="town-info" aria-label="街の情報">
                <span className="town-name">{session.town.name}</span>
                <span className="badge">ゲスト・試作版のため保存なし</span>
              </div>
              <div className="world-wrap" inert={menuOpen}>
                <GameView session={session} />
              </div>
              <p className="hint">行きたい方向を長押しすると歩きます。離すと止まります。</p>
            </div>
            {menuOpen && <TownMenu onClose={closeMenu} onExitToTitle={onExitToTitle} />}
          </>
        )}
      </main>
    </Frame>
  );
}
