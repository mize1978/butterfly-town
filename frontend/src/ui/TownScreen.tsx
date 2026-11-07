// S05 街・徒歩。街の地図を Rails API から受け取り、Phaser で描く。
// 街の上に重ねる画面はメニュー・住民との会話（S06・固定サンプル）・スクーター修理（S09・固定の返答）・部品の発見（S10）で、
// 同時には開かない（どちらか1つの状態として持つ）。スクーター修理の依頼の進み具合は Session が持ち、保存しない。
// 開いている間は街を止め（人物はその場で止まり、押しても歩かない）、閉じたら同じ位置・同じカメラから続ける。
// 描画（Phaser）と街の状態（Session）は、重ねる画面の開閉で作り直さない
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type RefObject } from "react";
import { fetchTown } from "../api/town";
import type { Town } from "../core/world";
import { Session } from "../game/session";
import { PART, PART_FIND, PARTS_NEEDED, partsHeld, SHOP, shopReply, type Errand, type SpotId } from "../game/errand";
import { ConversationView } from "./ConversationView";
import { Frame } from "./Frame";
import { GameView } from "./GameView";
import { TownMenu } from "./TownMenu";
import { PHONE_QUERY } from "../game/view-size";

type Load = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; town: Town };
type Overlay = null | "menu" | "talk" | "shop" | "part";
const OPENS: Record<SpotId, Overlay> = { resident: "talk", shop: "shop", part: "part" };
const FAR_NOTE_MS = 2500; // 遠くをタップしたときの案内を出しておく時間
const FRAME_LABEL: Record<Exclude<Overlay, null>, string> = { menu: "街・徒歩", talk: "住民との会話", shop: "スクーター修理・依頼", part: "部品の発見" };

// 依頼の進み具合の札（受ける前は出さない）
function errandBadge(e: Errand): string | null {
  if (e === "offered") return null;
  if (e === "delivered") return "依頼：部品を届けた";
  const held = `依頼：部品 ${partsHeld(e)}/${PARTS_NEEDED}`;
  return e === "found" ? `${held}・スクーター修理へ` : held;
}
const noop = () => () => {};

// スマホ表示か（街の映し方・CSS と同じ条件）。画面の回転などで切り替わったら描き直す
function usePhone(): boolean {
  return useSyncExternalStore(
    (fn) => { const m = window.matchMedia(PHONE_QUERY); m.addEventListener("change", fn); return () => m.removeEventListener("change", fn); },
    () => window.matchMedia(PHONE_QUERY).matches
  );
}

// スマホの「行きたい方向を長押しすると歩きます」は初回だけ出す。一度歩いたらこのブラウザでは次から出さない
// （遊びの進行ではなく画面の案内の記録。保存できない環境では毎回出るだけで、止まらない）
const WALK_HINT_KEY = "butterfly-town.walk-hint-seen";
function walkHintSeen(): boolean { try { return localStorage.getItem(WALK_HINT_KEY) === "1"; } catch { return false; } }
function saveWalkHintSeen() { try { localStorage.setItem(WALK_HINT_KEY, "1"); } catch { /* 保存できなくても続ける */ } }

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
  const near = useSyncExternalStore(session?.subscribe ?? noop, () => session?.nearSpot ?? null);
  const selected = useSyncExternalStore(session?.subscribe ?? noop, () => session?.selectedSpot ?? null);
  const errand = useSyncExternalStore(session?.subscribe ?? noop, () => session?.errand ?? "offered");
  const walked = useSyncExternalStore(session?.subscribe ?? noop, () => session?.hasWalked ?? false);
  const phone = usePhone();
  const [hintSeen] = useState(walkHintSeen);
  useEffect(() => { if (walked) saveWalkHintSeen(); }, [walked]);

  useEffect(() => {
    if (!session) return;
    if (overlay) session.pause(); else session.resume();
  }, [overlay, session]);

  // スマホ：近くの住民・スクーター修理・部品をタップすると、その会話・発見の画面をすぐ開く（確定の操作は開いた画面の中）
  useEffect(() => {
    if (!session) return;
    session.onOpen = (id) => setOverlay((o) => o ?? OPENS[id]);
    return () => { session.onOpen = null; };
  }, [session]);

  // 遠くをタップしたときの「近づくと話せます」は短く出して消す
  useEffect(() => {
    if (!session || !selected) return;
    const t = setTimeout(() => session.clearSelection(), FAR_NOTE_MS);
    return () => clearTimeout(t);
  }, [session, selected]);

  // 「M」キーでもメニューを開ける（何も重ねていないときだけ）
  useEffect(() => {
    if (!session || overlay) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "m" && !e.metaKey && !e.ctrlKey && !e.altKey) { e.preventDefault(); setOverlay("menu"); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [session, overlay]);

  // 近くの場所の名前と、できること（部品は「調べる」、住民とスクーター修理は「話す」）
  const nameOf = (id: SpotId) => (id === "resident" ? session?.resident.name : id === "shop" ? SHOP.name : PART.name) ?? "";
  const verb = (id: SpotId | null) => (id === "part" ? "調べる" : "話す");
  const canDo = (id: SpotId) => `${nameOf(id)}${id === "part" ? "を調べられます" : "と話せます"}`;
  const approach = (id: SpotId) => `${nameOf(id)}に近づくと${id === "part" ? "調べられます" : "話せます"}`;
  const tapToDo = (id: SpotId) => `${nameOf(id)}をタップすると${id === "part" ? "調べられます" : "話せます"}`;
  const open = () => near && setOverlay((o) => o ?? OPENS[near]);
  const badge = errandBadge(errand);
  const reply = shopReply(errand);

  // 会話は何も重ねていないときだけ開く（メニューから会話へ切り替わらない）。閉じたら、開いたボタンへフォーカスを戻す
  const close = (back: RefObject<HTMLButtonElement | null>) => {
    setOverlay(null);
    requestAnimationFrame(() => back.current?.focus());
  };

  const menuToggle = session && (
    <button type="button" ref={menuButton} className="btn menu-button" aria-haspopup="dialog" aria-expanded={overlay === "menu"}
      aria-controls="town-menu" disabled={overlay !== null && overlay !== "menu"}
      onClick={() => (overlay === "menu" ? close(menuButton) : setOverlay("menu"))}>
      メニュー
    </button>
  );

  return (
    <Frame label={overlay ? FRAME_LABEL[overlay] : "街・徒歩"} actions={menuToggle} className="town-frame">
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
                {badge && <span className="badge errand-badge" aria-live="polite">{badge}</span>}
              </div>
              <div className="world-wrap">
                <GameView session={session} />
              </div>
              {phone ? (
                // スマホ：住民・スクーター修理・部品は、近くでタップするとすぐ開く（距離は PC と同じ）。遠くでタップすると短く案内する。
                // 近くにいる間は「タップすると話せます」と添える。移動の説明は初回だけ
                <div className="town-actions">
                  <p className="hint" id="talk-hint" aria-live="polite">
                    {selected && near !== selected ? `${approach(selected)}。` : near ? `${tapToDo(near)}。` : !walked && !hintSeen ? "行きたい方向を長押しすると歩きます。" : ""}
                  </p>
                </div>
              ) : (
                <div className="town-actions">
                  <button type="button" ref={talkButton} className="btn primary" disabled={!near} aria-describedby="talk-hint" onClick={open}>
                    {verb(near)} →
                  </button>
                  <p className="hint" id="talk-hint">
                    {near ? `${canDo(near)}。` : `${session.resident.name}やスクーター修理に近づくと話せます。`}
                    行きたい方向を長押しすると歩きます。
                  </p>
                </div>
              )}
            </div>
            {overlay === "menu" && <TownMenu onClose={() => close(menuButton)} onExitToTitle={onExitToTitle} />}
            {overlay === "talk" && (
              <ConversationView title={`${session.resident.name}との会話`} speaker={session.resident.name} badge="サンプル会話・AI未接続"
                lines={session.resident.lines} onClose={() => close(talkButton)} />
            )}
            {overlay === "shop" && (
              // 返答は依頼の状態ごとに変わる。受ける・渡すと、同じウィンドウで次の状態の返答を最初から出す（key で作り直す）
              <ConversationView key={errand} title={`${SHOP.name}との会話`} speaker={SHOP.name} badge="固定の返答・AI未接続"
                lines={reply.lines} action={reply.action && { label: reply.action.label, run: () => session.step(reply.action!.step) }}
                onClose={() => close(talkButton)} />
            )}
            {overlay === "part" && (
              // 受け取ると部品は街から消えるので、ウィンドウも閉じる
              <ConversationView title="部品の発見" speaker={PART.name} badge="試作・保存なし" lines={PART_FIND.lines}
                action={{ label: PART_FIND.action!.label, run: () => { session.step("take"); close(talkButton); } }}
                onClose={() => close(talkButton)} />
            )}
          </>
        )}
      </main>
    </Frame>
  );
}
