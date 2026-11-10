// S11 修理パズル：触れる見本（改善案）。従来の作業台（RepairBench）と同じ決まり（game/errand.ts）で、触り心地だけを変えて比べる。
// URL に ?bench=new を付けたときだけ使う（付けなければ従来の作業台）。
// ・部品は指（マウス）についてくる。指で隠れないよう、タッチでは指の少し上に出す
// ・まだの取り付け位置は、部品の形の点線で見えている。部品を近づけると、いちばん近い位置が光る
// ・離すと、合えば吸い付くように収まって弾む。合わなければトレーへ戻り、理由を出す（部品はなくならない）
// ・タップでも置ける：部品をタップして選ぶ → 取り付け位置をタップ。回転は部品ごとの「↻」ボタンだけ（選ぶタップと分ける）
// 保存しないこと・乗れないことは、従来どおり画面に出す
import { useEffect, useRef, useState, useSyncExternalStore, type PointerEvent as ReactPointerEvent } from "react";
import { finish, PART_IDS, PARTS, place, restart, rotate, undo, type Outcome, type PartId, type Repair } from "../game/errand";
import type { Session } from "../game/session";
import { dialogKeys } from "./dialog";
import { PartArt, ScooterDrawing } from "./ScooterArt";

const W = 620, H = 340; // スクーターの絵の座標
// 取り付け位置：中心（吸い付く判定に使う）・点線の形・番号の札の位置（絵の座標）
const SLOT: Record<PartId, { cx: number; cy: number; badge: [number, number]; shape: React.ReactNode }> = {
  wheel: { cx: 160, cy: 260, badge: [104, 306], shape: <circle cx="160" cy="260" r="46" /> },
  belt: { cx: 242, cy: 240, badge: [336, 262], shape: <rect x="170" y="223" width="144" height="34" rx="17" /> },
  battery: { cx: 315, cy: 184, badge: [364, 168], shape: <rect x="292" y="157" width="47" height="55" rx="7" /> },
  cover: { cx: 190, cy: 208, badge: [124, 168], shape: <path d="M108 211 Q113 178 153 176 L259 176 Q277 180 272 216 L252 242 H115Z" /> }
};
const SNAP = 78; // この距離（絵の座標）より近い取り付け位置へ吸い付く
// 指についてくる部品の大きさ（絵の座標での見た目の幅）。取り付けたときとだいたい同じ大きさにする
const GHOST_SIZE: Record<PartId, number> = { wheel: 112, belt: 176, battery: 78, cover: 200 };
const TOUCH_LIFT = 56; // タッチでは部品を指の少し上に出す（px）
const DRAG_START = 6;
const BADGE = ["①", "②", "③", "④"]; // 付ける順の番号

type Ghost = { id: PartId; x: number; y: number; size: number; back: boolean };
type Press = { id: PartId; pointer: number; x0: number; y0: number; lift: number; moving: boolean };

export function RepairBenchTouch({ session, onClose }: { session: Session; onClose: () => void }) {
  const repair = useSyncExternalStore(session.subscribe, () => session.repair);
  const [selected, setSelected] = useState<PartId | null>(null);
  const [note, setNote] = useState({ text: "部品を指でスクーターへ運ぼう。タップで選んでから、置く場所をタップしてもいいよ。", error: false });
  const [ghost, setGhost] = useState<Ghost | null>(null);
  const [hot, setHot] = useState<PartId | null>(null); // いま部品が近づいている取り付け位置
  const [pulse, setPulse] = useState<PartId | null>(null); // はまった瞬間の部品
  const [nope, setNope] = useState<PartId | null>(null); // 合わなくて戻った部品（トレーで小さく揺らす）
  const [spin, setSpin] = useState<Record<PartId, number>>(() => ({ ...repair.rotations })); // 表示用の回転（270→0 で逆回りしないよう足し続ける）
  const root = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const press = useRef<Press | null>(null);
  const dragged = useRef(false);
  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const later = (ms: number, fn: () => void) => { timers.current.push(window.setTimeout(fn, ms)); };

  useEffect(() => { root.current?.querySelector<HTMLElement>(repair.done ? ".tb-done .btn" : ".tb-part:not([disabled])")?.focus(); }, [repair.done]);

  const owned = (id: PartId) => repair.collected.includes(id);
  const placed = (id: PartId) => repair.placed.includes(id);
  const open = PART_IDS.filter((id) => !placed(id)); // まだの取り付け位置
  const all = repair.placed.length === PART_IDS.length;

  const run = (op: (r: Repair) => Outcome) => { const out = session.act(op); setNote({ text: out.message, error: !out.ok }); return out; };

  // 画面の点 → 絵の座標。いちばん近い、まだの取り付け位置（SNAP より近いもの）
  const toArt = (x: number, y: number) => {
    const r = stage.current!.getBoundingClientRect();
    return { x: ((x - r.left) / r.width) * W, y: ((y - r.top) / r.height) * H, scale: r.width / W };
  };
  const nearestSlot = (x: number, y: number): PartId | null => {
    const p = toArt(x, y);
    let best: PartId | null = null, bestD = SNAP;
    for (const id of open) { const d = Math.hypot(p.x - SLOT[id].cx, p.y - SLOT[id].cy); if (d < bestD) { best = id; bestD = d; } }
    return best;
  };
  const tileCenter = (id: PartId) => {
    const r = root.current?.querySelector<HTMLElement>(`.tb-part[data-part="${id}"] .tb-art`)?.getBoundingClientRect();
    return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null;
  };

  // はめる。合えば弾ませ、合わなければ部品をトレーへ戻して揺らす
  const tryPlace = (id: PartId, slot: PartId, from?: { x: number; y: number; size: number }) => {
    const out = run((r) => place(r, id, slot));
    if (out.ok) {
      setSelected(null);
      setGhost(null);
      setPulse(id);
      later(450, () => setPulse((p) => (p === id ? null : p)));
      navigator.vibrate?.(12); // 対応する端末だけ（iPhone の Safari は振動しない）
      return;
    }
    const home = tileCenter(id);
    if (from && home) {
      setGhost({ id, ...from, back: false });
      requestAnimationFrame(() => setGhost({ id, x: home.x, y: home.y, size: from.size, back: true }));
      later(220, () => setGhost((g) => (g?.back ? null : g)));
    } else setGhost(null);
    setNope(id);
    later(400, () => setNope((n) => (n === id ? null : n)));
  };

  // ドラッグ：押した部品が指についてくる。タッチでは指の少し上。少ししか動かさなければタップ（選ぶ）
  const down = (id: PartId) => (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    dragged.current = false;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* 合成イベントではキャプチャできない */ }
    press.current = { id, pointer: e.pointerId, x0: e.clientX, y0: e.clientY, lift: e.pointerType === "mouse" ? 0 : TOUCH_LIFT, moving: false };
  };
  const ghostAt = (p: Press, x: number, y: number): Ghost => ({ id: p.id, x, y: y - p.lift, size: GHOST_SIZE[p.id] * toArt(0, 0).scale, back: false });
  const move = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const p = press.current;
    if (!p || e.pointerId !== p.pointer) return;
    if (!p.moving && Math.hypot(e.clientX - p.x0, e.clientY - p.y0) <= DRAG_START) return;
    p.moving = true;
    const g = ghostAt(p, e.clientX, e.clientY);
    setGhost(g);
    setHot(nearestSlot(g.x, g.y));
  };
  const up = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const p = press.current;
    if (!p || e.pointerId !== p.pointer) return;
    press.current = null;
    setHot(null);
    if (!p.moving && Math.hypot(e.clientX - p.x0, e.clientY - p.y0) <= DRAG_START) return; // タップは onClick で選ぶ
    dragged.current = true;
    const g = ghostAt(p, e.clientX, e.clientY), slot = nearestSlot(g.x, g.y);
    if (slot) tryPlace(p.id, slot, g);
    else {
      setNote({ text: "点線の場所の近くで離そう。部品はなくなりません。", error: false });
      const home = tileCenter(p.id);
      if (home) { setGhost(g); requestAnimationFrame(() => setGhost({ ...g, x: home.x, y: home.y, back: true })); later(220, () => setGhost((x) => (x?.back ? null : x))); }
      else setGhost(null);
    }
  };
  const cancel = () => { press.current = null; setGhost(null); setHot(null); };

  // タップで置く：選んだ部品を、タップした所にいちばん近い取り付け位置へ
  const tapStage = (e: React.MouseEvent) => {
    if (!selected) { if (open.length) setNote({ text: "先に下の部品をタップして選ぼう（指で運んでもいいよ）。", error: false }); return; }
    const slot = nearestSlot(e.clientX, e.clientY);
    if (slot) tryPlace(selected, slot);
    else setNote({ text: "点線の場所をタップしよう。", error: false });
  };
  const turn = (id: PartId) => { if (run((r) => rotate(r, id)).ok) setSpin((s) => ({ ...s, [id]: s[id] + 90 })); };
  const again = () => { setSelected(null); if (run(restart).ok) setSpin({ ...session.repair.rotations }); };

  return (
    <div className="bench-layer">
      <div className="tbench" role="dialog" aria-modal="true" aria-labelledby="tbench-title" ref={root} onKeyDown={dialogKeys(root, onClose)}>
        <div className="bench-head">
          <h2 id="tbench-title">スクーター修理の作業台</h2>
          <span className="talk-badge">試作・保存なし</span>
          <button type="button" className="btn bench-close" onClick={onClose}>閉じる</button>
        </div>

        {repair.done ? (
          <div className="tb-done">
            <div className="tb-done-art"><ScooterDrawing placed={repair.placed} complete /></div>
            <p className="bench-done-title">エンジンがかかった！ スクーターが直りました。</p>
            <p className="bench-done-note">スクーターに乗る機能は、まだこの版にはありません。</p>
            <button type="button" className="btn primary" onClick={onClose}>街へ戻る</button>
          </div>
        ) : (
          <>
            <div className={`tb-stage${selected ? " choosing" : ""}`} ref={stage} onClick={tapStage}>
              <ScooterDrawing placed={repair.placed} pulse={pulse} ghosts={false} />
              <svg viewBox={`0 0 ${W} ${H}`} className="tb-slots" aria-hidden="true">
                {open.map((id) => <g key={id} className={`tb-slot${hot === id ? " hot" : ""}`}>{SLOT[id].shape}</g>)}
                {pulse && <circle key={`ring-${pulse}`} className="tb-ring" cx={SLOT[pulse].cx} cy={SLOT[pulse].cy} r="40" />}
              </svg>
              {/* 番号の札：見た目の目印で、キーボードではここから置ける（タップは絵全体で、いちばん近い位置へ） */}
              {open.map((id, i) => (
                <button key={id} type="button" className={`tb-badge${hot === id ? " hot" : ""}`} tabIndex={selected ? 0 : -1}
                  style={{ left: `${(SLOT[id].badge[0] / W) * 100}%`, top: `${(SLOT[id].badge[1] / H) * 100}%` }}
                  aria-label={`${PARTS[id].name}の取り付け位置`} onClick={(e) => { e.stopPropagation(); if (selected) tryPlace(selected, id); }}>
                  {BADGE[PART_IDS.indexOf(id)] ?? i + 1}
                </button>
              ))}
            </div>

            <p className={`bench-note${note.error ? " error" : ""}`} role="status">{note.text}</p>

            <div className="tb-tray" aria-label="集めた部品">
              {PART_IDS.map((id) => (
                <div key={id} className={`tb-tile${selected === id ? " selected" : ""}${placed(id) ? " installed" : ""}${!owned(id) ? " missing" : ""}${nope === id ? " nope" : ""}${ghost?.id === id && !ghost.back ? " lifted" : ""}`}>
                  <button type="button" className="tb-part" data-part={id} disabled={!owned(id) || placed(id)} aria-pressed={selected === id}
                    onClick={() => {
                      if (dragged.current) { dragged.current = false; return; }
                      setSelected((s) => (s === id ? null : id));
                      setNote({ text: selected === id ? "選ぶのをやめました。" : PARTS[id].hint, error: false });
                    }}
                    onPointerDown={down(id)} onPointerMove={move} onPointerUp={up} onPointerCancel={cancel}>
                    <span className="tb-art" style={{ transform: `rotate(${spin[id]}deg)` }}><PartArt id={id} rotation={0} /></span>
                    <span className="tb-name">{PARTS[id].name}</span>
                    <small>{placed(id) ? "取り付け済み" : owned(id) ? "" : "未入手"}</small>
                  </button>
                  <button type="button" className="tb-rotate" disabled={!owned(id) || placed(id)} aria-label={`${PARTS[id].name}を90°回す`} onClick={() => turn(id)}>↻</button>
                </div>
              ))}
            </div>

            <div className="bench-actions tb-actions">
              <button type="button" className="btn" disabled={!repair.placed.length} onClick={() => run(undo)}>ひとつ戻す</button>
              <button type="button" className="btn" disabled={!repair.placed.length} onClick={again}>やり直す</button>
              <button type="button" className={`btn primary${all ? " ready" : ""}`} disabled={!all} onClick={() => run(finish)}>エンジンをかける</button>
            </div>
          </>
        )}
      </div>
      {ghost && (
        <div className={`tb-ghost${ghost.back ? " back" : ""}`} style={{ left: ghost.x, top: ghost.y, width: ghost.size, height: ghost.size }} aria-hidden="true">
          <span className="tb-art" style={{ transform: `rotate(${spin[ghost.id]}deg)` }}><PartArt id={ghost.id} rotation={0} /></span>
        </div>
      )}
    </div>
  );
}
