// S05 街・徒歩。街の地図を Rails API から受け取り、Phaser で描く。
// 街の上に重ねる画面はメニュー・住民との会話（S06・固定サンプル）・スクーター修理（S09・固定の返答）・部品の発見（S10）・
// 作業台（S11 修理パズル）で、同時には開かない（どれか1つの状態として持つ）。依頼と修理の進み具合は Session が持ち、保存しない。
// 開いている間は街を止め（人物はその場で止まり、押しても歩かない）、閉じたら同じ位置・同じカメラから続ける。
// 描画（Phaser）と街の状態（Session）は、重ねる画面の開閉で作り直さない
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type RefObject } from "react";
import type { PlaythroughState } from "../api/playthrough";
import { fetchTown } from "../api/town";
import type { Town } from "../core/world";
import { Session } from "../game/session";
import { accept, collect, PART_IDS, START, partFind, partOfSpot, PARTS, SHOP, shopReply, type PartSpotId, type Repair, type SpotId } from "../game/errand";
import { RepairBench } from "./RepairBench";
import { RepairBenchTouch } from "./RepairBenchTouch";

// 作業台の比べ方：URL に ?bench=new を付けると「触れる見本」、付けなければ従来の作業台（同じ端末で切り替えて比べる）
const BENCH_NEW = new URLSearchParams(window.location.search).get("bench") === "new";
import { ConversationView } from "./ConversationView";
import { Frame } from "./Frame";
import { GameView } from "./GameView";
import { TownMenu } from "./TownMenu";
import { PHONE_QUERY } from "../game/view-size";

type Load = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; town: Town };
type Overlay = null | "menu" | "talk" | "shop" | "bench" | PartSpotId;
const opens = (id: SpotId): Overlay => (id === "resident" ? "talk" : id);
const FAR_NOTE_MS = 2500; // 遠くをタップしたときの案内を出しておく時間
const FRAME_LABEL: Record<"menu" | "talk" | "shop" | "bench", string> = { menu: "街・徒歩", talk: "住民との会話", shop: "スクーター修理・依頼", bench: "作業台・修理" };
const frameLabel = (o: Exclude<Overlay, null>) => (partOfSpot(o as SpotId) ? "部品の発見" : FRAME_LABEL[o as keyof typeof FRAME_LABEL]);

// 依頼の進み具合の札（受ける前は出さない）
function errandBadge(r: Repair): string | null {
  if (!r.accepted) return null;
  if (r.done) return "依頼：スクーター修理完了";
  const held = `依頼：部品 ${r.collected.length}/${PART_IDS.length}`;
  return r.collected.length === PART_IDS.length ? `${held}・作業台へ` : held;
}
// スクーター修理の返答を作り直す目印（状態が変わったら会話を最初から出す）
const replyKey = (r: Repair) => (!r.accepted ? "offered" : r.done ? "done" : `collecting-${r.collected.length}`);
const noop = () => () => {};

// スマホ表示か（街の映し方・CSS と同じ条件）。画面の回転などで切り替わったら描き直す
function usePhone(): boolean {
  return useSyncExternalStore(
    (fn) => { const m = window.matchMedia(PHONE_QUERY); m.addEventListener("change", fn); return () => m.removeEventListener("change", fn); },
    () => window.matchMedia(PHONE_QUERY).matches
  );
}

// スマホの「行きたい場所をタップすると歩きます」は初回だけ出す。一度歩いたらこのブラウザでは次から出さない
// （遊びの進行ではなく画面の案内の記録。保存できない環境では毎回出るだけで、止まらない）
const WALK_HINT_KEY = "butterfly-town.walk-hint-seen";
function walkHintSeen(): boolean { try { return localStorage.getItem(WALK_HINT_KEY) === "1"; } catch { return false; } }
function saveWalkHintSeen() { try { localStorage.setItem(WALK_HINT_KEY, "1"); } catch { /* 保存できなくても続ける */ } }

export function TownScreen({ playthrough, onExitToTitle }: { playthrough: PlaythroughState | null; onExitToTitle: () => void }) {
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
  const repair = useSyncExternalStore(session?.subscribe ?? noop, () => session?.repair ?? START);
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
    session.onOpen = (id) => setOverlay((o) => o ?? opens(id));
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
  const nameOf = (id: SpotId) => { const p = partOfSpot(id); return p ? PARTS[p].name : id === "shop" ? SHOP.name : session?.resident.name ?? ""; };
  const isPart = (id: SpotId | null) => !!id && !!partOfSpot(id);
  const verb = (id: SpotId | null) => (isPart(id) ? "調べる" : "話す");
  const canDo = (id: SpotId) => `${nameOf(id)}${isPart(id) ? "を調べられます" : "と話せます"}`;
  const approach = (id: SpotId) => `${nameOf(id)}に近づくと${isPart(id) ? "調べられます" : "話せます"}`;
  const tapToDo = (id: SpotId) => `${nameOf(id)}をタップすると${isPart(id) ? "調べられます" : "話せます"}`;
  const open = () => near && setOverlay((o) => o ?? opens(near));
  const badge = errandBadge(repair);
  const reply = shopReply(repair);
  const partOpen = overlay ? partOfSpot(overlay as SpotId) : null;

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
    <Frame label={overlay ? frameLabel(overlay) : "街・徒歩"} actions={menuToggle} className="town-frame">
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
                {playthrough && (
                  <span className="badge" aria-label={`時間帯 ${playthrough.timeIndex + 1}／${playthrough.timeSlots}、特殊介入の残り ${playthrough.interventionsLeft}回`}>
                    時間帯 {playthrough.timeIndex + 1}/{playthrough.timeSlots}・介入 残り{playthrough.interventionsLeft}
                  </span>
                )}
                <span className="badge">ゲスト・位置と修理は保存なし</span>
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
                    {selected && near !== selected ? `${approach(selected)}。` : near ? `${tapToDo(near)}。` : !walked && !hintSeen ? "行きたい場所をタップすると歩きます。長押しで歩き続けます。" : ""}
                  </p>
                </div>
              ) : (
                <div className="town-actions">
                  <button type="button" ref={talkButton} className="btn primary" disabled={!near} aria-describedby="talk-hint" onClick={open}>
                    {verb(near)} →
                  </button>
                  <p className="hint" id="talk-hint">
                    {selected && near !== selected ? `${approach(selected)}。` : near ? `${canDo(near)}。` : `${session.resident.name}やスクーター修理に近づくと話せます。`}
                    行きたい場所をクリックすると歩きます（長押しで歩き続けます）。
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
              // 返答は依頼の状態ごとに変わる。受けると、同じウィンドウで次の状態の返答を最初から出す（key で作り直す）。
              // 「作業台を開く」で作業台へ切り替える
              <ConversationView key={replyKey(repair)} title={`${SHOP.name}との会話`} speaker={SHOP.name} badge="固定の返答・AI未接続"
                lines={reply.lines}
                action={reply.action && {
                  label: reply.action.label,
                  run: reply.action.kind === "accept" ? () => { session.act(accept); } : () => setOverlay("bench")
                }}
                onClose={() => close(talkButton)} />
            )}
            {partOpen && (
              // 受け取ると部品は街から消えるので、ウィンドウも閉じる
              <ConversationView title="部品の発見" speaker={PARTS[partOpen].name} badge="試作・保存なし" lines={partFind(partOpen)}
                action={{ label: "部品を受け取る", run: () => { session.act((r) => collect(r, partOpen)); close(talkButton); } }}
                onClose={() => close(talkButton)} />
            )}
            {overlay === "bench" && (BENCH_NEW
              ? <RepairBenchTouch session={session} onClose={() => close(talkButton)} />
              : <RepairBench session={session} onClose={() => close(talkButton)} />)}
          </>
        )}
      </main>
    </Frame>
  );
}
