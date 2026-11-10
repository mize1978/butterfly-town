import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import festival from "../../../backend/config/towns/festival-street.json";
import { parseTown } from "../api/town";
import { talkSpot } from "../game/approach";
import { Session } from "../game/session";
import { PhaserTown } from "../render/PhaserTown";
import { dialogKeys } from "./dialog";

// 既存の地図・移動・固定会話を使う、独立した操作見本。AI・記憶・関係値は実装していない。
// スクーター修理の店先は目立つので、押したら（近くても遠くても）本編で遊べることだけを短く返す
const SHOP_NOTE = "修理の遊びは本編で体験できます";
const TYPE_MS = 45; // 1文字を出す間隔
export function EncounterDemo() {
  const [session] = useState(() => new Session(parseTown(festival)));
  const host = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [talking, setTalking] = useState(false);
  const [line, setLine] = useState(0);
  const [info, setInfo] = useState(false);
  const [returned, setReturned] = useState(false);
  const [talkedOnce, setTalkedOnce] = useState(false); // 一度話したら「住民をタップして会話」の案内は出さない
  const [notice, setNotice] = useState(""); // 店先など、この見本では開かない場所を押したときの短い返事
  const near = useSyncExternalStore(session.subscribe, () => session.nearResident);
  const selected = useSyncExternalStore(session.subscribe, () => session.selectedSpot);
  const walked = useSyncExternalStore(session.subscribe, () => session.hasWalked);
  const lines = session.resident.lines;
  const last = line === lines.length - 1;
  const [shown, setShown] = useState(0); // いまの文で表示している文字数（1文字ずつ出す）
  const typing = talking && shown < lines[line].text.length;

  // 文を1文字ずつ出す。動きを減らす設定なら最初から全文
  useEffect(() => {
    if (!talking) return;
    const full = lines[line].text.length;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setShown(full); return; }
    setShown(0);
    const timer = setInterval(() => setShown((n) => { if (n + 1 >= full) clearInterval(timer); return Math.min(n + 1, full); }), TYPE_MS);
    return () => clearInterval(timer);
  }, [talking, line, lines]);

  // 表示中なら全文を出す。出し終えていれば次の文へ。最後の文では何もしない
  function advance() {
    if (typing) setShown(lines[line].text.length);
    else if (!last) setLine((n) => n + 1);
  }

  function openTalk() {
    returnFocus.current = document.activeElement instanceof HTMLButtonElement ? document.activeElement : host.current;
    session.pause();
    session.sim.faceToward(session.resident.pos); // 話し始めたら相手の方を向く
    setLine(0);
    setTalking(true);
    setTalkedOnce(true);
  }

  // 「探索に戻る」と「⋯」は同じ右上にあるので、閉じた直後の二度押しで説明が開かないよう少しだけ無視する
  const closedAt = useRef(0);
  // 話しかける：重なっていなければその場で向き直って話す。近すぎるときだけ、住民の横の少し離れた位置まで歩いてから話す
  const approach = useRef<{ x: number; y: number } | null>(null);
  function startTalk() {
    const spot = talkSpot(session.town, session.sim.pos, session.resident.pos);
    if (!spot) { approach.current = null; openTalk(); return; }
    approach.current = spot;
    session.goTo(spot);
    // 毎フレーム見て、着いた（または壁で止まった）ら話し始める。途中で別の場所を押したら取り消す（そちらを優先）
    const watch = () => {
      if (approach.current !== spot) return; // 別の操作で取り消された
      const { target, moving } = session.sim;
      if (target === null && !moving) { approach.current = null; openTalk(); return; }
      if (target !== null && target !== spot) { approach.current = null; return; }
      requestAnimationFrame(watch);
    };
    requestAnimationFrame(watch);
  }
  function closeTalk() {
    closedAt.current = performance.now();
    setTalking(false);
    setReturned(true);
    session.resume();
    requestAnimationFrame(() => returnFocus.current?.focus());
  }

  useEffect(() => {
    let alive = true;
    const renderer = new PhaserTown(true);
    renderer.mount(host.current!, session)
      .then(() => { if (alive) setReady(true); })
      .catch((e: Error) => { if (alive) setError(e.message); void renderer.destroy(); });
    return () => { alive = false; void renderer.destroy(); };
  }, [session]);

  useEffect(() => {
    session.onOpen = (id) => { if (id === "resident") startTalk(); else if (id === "shop") setNotice(SHOP_NOTE); };
    return () => { session.onOpen = null; };
  }, [session]);

  // キーボード：近くにいるとき Enter・Space で話す（ボタンなどを操作しているときは、そちらを優先）
  useEffect(() => {
    if (!near || talking || info || !ready) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.key !== "Enter" && e.key !== " ") || (e.target instanceof HTMLElement && e.target.closest("button, a, input, textarea"))) return;
      e.preventDefault();
      startTalk();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [near, talking, info, ready]);

  useEffect(() => {
    if (talking) dialog.current?.focus({ preventScroll: true }); // 会話全体にフォーカス（文の下に枠や下線を出さない）。Enter・Space で進む
  }, [talking]);

  // 遠くから店先を押したときも、同じ返事を出す（近づけば話せる、とは言わない）
  useEffect(() => { if (selected === "shop") { setNotice(SHOP_NOTE); session.clearSelection(); } }, [session, selected]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 2500);
    return () => clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (!selected) return;
    const timer = setTimeout(() => session.clearSelection(), 2500);
    return () => clearTimeout(timer);
  }, [session, selected]);

  useEffect(() => {
    if (!returned) return;
    const timer = setTimeout(() => setReturned(false), 2800);
    return () => clearTimeout(timer);
  }, [returned]);

  return (
    <main className="encounter">
      <div className="enc-world" ref={host} tabIndex={-1} inert={talking || info} aria-label="街。地面をタップするとその場所まで歩き、押し続けると指の方向へ歩き続けます。近くの住民をタップして話します。" />
      <header className="enc-hud">
        <div className="enc-location"><span> BUTTERFLY TOWN </span><strong>祭りの通り</strong></div>
        <button className="enc-menu" aria-label="見本の説明を開く" disabled={talking || info} onClick={() => { if (performance.now() - closedAt.current < 500) return; session.pause(); setInfo(true); }}>⋯</button>
      </header>
      <span className="enc-disclosure">固定演出の見本 · 保存なし</span>
      {!ready && <p className="enc-toast" role="status">{error || "街を準備しています…"}</p>}
      {ready && !talking && !info && (
        <div className="enc-guide" aria-live="polite">
          {notice ? notice : returned ? "会話を終えました。街をもう少し歩いてみよう。" : selected ? "近づいてから話しかけてみよう"
            : near && !talkedOnce ? "住民をタップして会話" : !walked ? "地面をタップして歩く · 右上の住民に近づいてみよう" : ""}
        </div>
      )}
      {/* 画面上の「住民と話す」ボタンは置かない（住民・名前・吹き出しアイコンを直接押す）。キーボードでは、近くにいるとき
          Tab で届くこのボタン（フォーカスしたときだけ見える）か、Enter・Space で話せる */}
      {ready && !talking && !info && near && (
        <button className="enc-kbd-talk" onClick={startTalk}>住民と話す（Enter）</button>
      )}
      {talking && (
        <div className="enc-shield enc-talk" ref={dialog} role="dialog" aria-modal="true" aria-labelledby="enc-speaker" tabIndex={-1}
          onPointerDown={(e) => e.stopPropagation()}
          onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); advance(); } else dialogKeys(dialog, closeTalk)(e); }}>
          {/* 会話は箱に入れず、画面下の薄いグラデーションの上に載せる。画面のどこを押しても「全文を出す → 次の文へ」。
              最後の文では押しても閉じない（連打で閉じないよう、閉じるのは右上の固定ボタンだけ） */}
          <button className="enc-line" onClick={advance}
            aria-label={typing ? "全文を表示" : last ? "会話はここまで" : "次の文へ"}>
            <span className="enc-speaker" id="enc-speaker">{lines[line].speaker === "note" ? "案内" : session.resident.name}<small>固定サンプル</small></span>
            <span className="enc-text" aria-hidden="true">{lines[line].text.slice(0, shown)}{!typing && !last && <i className="enc-more">▾</i>}</span>
          </button>
          <p className="enc-sr" aria-live="polite">{lines[line].text}</p>
          <button className="enc-leave" onClick={closeTalk}>探索に戻る</button>
        </div>
      )}
      {info && <Info onClose={() => { setInfo(false); session.resume(); }} />}
    </main>
  );
}

function Info({ onClose }: { onClose: () => void }) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => { root.current?.querySelector("button")?.focus(); }, []);
  return <div className="enc-shield"><div className="enc-info" ref={root} role="dialog" aria-modal="true" aria-labelledby="enc-info-title" onKeyDown={dialogKeys(root, onClose)}>
    <p className="enc-eyebrow">EXPERIENCE STUDY</p>
    <h1 id="enc-info-title">街から、会話へ。<br />また、街へ。</h1>
    <p>歩く → 住民が気づく → 話す → 探索へ戻る。そのつながりを試す見本です。</p>
    <p>地面をタップするとその場所まで歩き、押し続けると指の方向へ歩き続けます。近づくと住民があいさつします。近くにいるときは、住民・名前・その横の吹き出しのどれをタップ（クリック）しても話せます。キーボードでは Enter で話せます。</p>
    <p>あいさつと会話は固定の演出です。AI・記憶・関係値・進行の保存はありません。修理の依頼は、この見本では開きません。</p>
    <button className="enc-close" onClick={onClose}>街へ戻る ↗</button>
  </div></div>;
}
