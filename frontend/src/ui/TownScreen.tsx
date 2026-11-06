// S05 街・徒歩。街の地図を Rails API から受け取り、Phaser で描く。
// 街の上に重ねる画面はメニューと会話（S06・固定サンプル）の2つで、同時には開かない（どちらか1つの状態として持つ）。
// 開いている間は街を止め（人物はその場で止まり、押しても歩かない）、閉じたら同じ位置・同じカメラから続ける。
// 描画（Phaser）と街の状態（Session）は、重ねる画面の開閉で作り直さない
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type RefObject } from "react";
import { fetchTown } from "../api/town";
import type { Town } from "../core/world";
import { Session } from "../game/session";
import { ConversationView } from "./ConversationView";
import { Frame } from "./Frame";
import { GameView } from "./GameView";
import { TownMenu } from "./TownMenu";

type Load = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; town: Town };
type Overlay = null | "menu" | "talk";
const noop = () => () => {};

export function TownScreen({ onExitToTitle }: { onExitToTitle: () => void }) {
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [overlay, setOverlay] = useState<Overlay>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const talkButton = useRef<HTMLButtonElement>(null);

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
  const near = useSyncExternalStore(session?.subscribe ?? noop, () => session?.nearResident ?? false);

  useEffect(() => {
    if (!session) return;
    if (overlay) session.pause(); else session.resume();
  }, [overlay, session]);

  // 「M」キーでもメニューを開ける（何も重ねていないときだけ）
  useEffect(() => {
    if (!session || overlay) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "m" && !e.metaKey && !e.ctrlKey && !e.altKey) { e.preventDefault(); setOverlay("menu"); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [session, overlay]);

  // 会話は何も重ねていないときだけ開く（メニューから会話へ切り替わらない）。閉じたら、開いたボタンへフォーカスを戻す
  const close = (back: RefObject<HTMLButtonElement | null>) => {
    setOverlay(null);
    requestAnimationFrame(() => back.current?.focus());
  };

  const menuToggle = session && (
    <button type="button" ref={menuButton} className="btn menu-button" aria-haspopup="dialog" aria-expanded={overlay === "menu"}
      aria-controls="town-menu" disabled={overlay === "talk"}
      onClick={() => (overlay === "menu" ? close(menuButton) : setOverlay("menu"))}>
      メニュー
    </button>
  );

  return (
    <Frame label={overlay === "talk" ? "住民との会話" : "街・徒歩"} actions={menuToggle} className="town-frame">
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
            {/* 街の絵・情報・操作をひとまとまりにして画面の中央に置く（絵の縦横比は 1100×660 のまま） */}
            <div className="town-stage" inert={overlay !== null}>
              <div className="town-info" aria-label="街の情報">
                <span className="town-name">{session.town.name}</span>
                <span className="badge">ゲスト・試作版のため保存なし</span>
              </div>
              <div className="world-wrap">
                <GameView session={session} />
              </div>
              <div className="town-actions">
                <button type="button" ref={talkButton} className="btn primary" disabled={!near} aria-describedby="talk-hint"
                  onClick={() => setOverlay((o) => o ?? "talk")}>
                  話す →
                </button>
                <p className="hint" id="talk-hint">
                  {near ? `${session.resident.name}と話せます。` : `${session.resident.name}に近づくと話せます。`}
                  行きたい方向を長押しすると歩きます。
                </p>
              </div>
            </div>
            {overlay === "menu" && <TownMenu onClose={() => close(menuButton)} onExitToTitle={onExitToTitle} />}
            {overlay === "talk" && <ConversationView resident={session.resident} onClose={() => close(talkButton)} />}
          </>
        )}
      </main>
    </Frame>
  );
}
