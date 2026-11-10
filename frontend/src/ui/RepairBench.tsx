// S11 修理パズル（試作）。スクーター修理の店の作業台で、集めた部品をスクーターの合う場所にはめる。
// 操作は「部品をドラッグして取り付け位置へ」か「部品をタップ → 取り付け位置をタップ」。向きは回転ボタンで90°ずつ変える。
// 決まり（順番・向き）は game/errand.ts。合わないときは理由を出し、部品はなくならない。開いている間、背後の街は止まっている。
// 修理を終えてもスクーターには乗れない（乗れる場所は別に決める）ので、乗れるようには見せない
import { useEffect, useRef, useState, useSyncExternalStore, type PointerEvent as ReactPointerEvent } from "react";
import { finish, PART_IDS, PARTS, place, restart, rotate, undo, type Outcome, type PartId, type Repair } from "../game/errand";
import type { Session } from "../game/session";
import { dialogKeys } from "./dialog";
import { PartArt, ScooterDrawing } from "./ScooterArt";

// 取り付け位置（スクーターの絵の上の場所）。並びは付ける順
const SLOTS: Record<PartId, string> = { wheel: "① 車軸", belt: "② 横向きの駆動部", battery: "③ ＋端子が上", cover: "④ 最後に閉じる" };
const DRAG_START = 7; // これ以上動かしたらドラッグとみなす（px）

type Drag = { id: PartId; pointer: number; x0: number; y0: number; x: number; y: number; moving: boolean };

export function RepairBench({ session, onClose }: { session: Session; onClose: () => void }) {
  const repair = useSyncExternalStore(session.subscribe, () => session.repair);
  const [selected, setSelected] = useState<PartId | null>(null);
  const [note, setNote] = useState({ text: "後輪から始めよう。部品をドラッグ、または部品 → 取り付け位置の順にタップ。", error: false });
  const [drag, setDrag] = useState<Drag | null>(null);
  const [over, setOver] = useState<PartId | null>(null); // ドラッグ中に重なっている取り付け位置
  const root = useRef<HTMLDivElement>(null);
  const dragged = useRef(false); // ドラッグの直後に届くクリックで、選択が切り替わらないようにする

  // 開いたとき・修理が終わったときは、最初に押せるボタンへフォーカスを移す
  useEffect(() => { root.current?.querySelector<HTMLElement>(repair.done ? ".bench-done .btn" : ".bench-part:not([disabled])")?.focus(); }, [repair.done]);

  const run = (op: (r: Repair) => Outcome) => {
    const out = session.act(op);
    setNote({ text: out.message, error: !out.ok });
    return out.ok;
  };
  const tryPlace = (id: PartId | null, slot: PartId) => {
    if (!id) { setNote({ text: "先に部品を選ぼう。", error: true }); return; }
    if (run((r) => place(r, id, slot))) setSelected(null);
  };

  // ドラッグ：部品のボタンで押して動かし、取り付け位置の上で離すとはめる。少ししか動かさなければタップ（選ぶだけ）
  const slotAt = (x: number, y: number) => (document.elementFromPoint(x, y)?.closest<HTMLElement>(".bench-slot")?.dataset.slot as PartId | undefined) ?? null;
  // ドラッグの状態は ref を正本にする（動かしてすぐ離すと、描き直し前の古い状態を読んでしまうため）。描画用に state にも写す
  const dragRef = useRef<Drag | null>(null);
  const setDragBoth = (d: Drag | null) => { dragRef.current = d; setDrag(d); };
  const down = (id: PartId) => (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    dragged.current = false;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* 合成イベントではキャプチャできない */ }
    setDragBoth({ id, pointer: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, moving: false });
  };
  const move = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const d = dragRef.current;
    if (!d || e.pointerId !== d.pointer) return;
    const moving = d.moving || Math.hypot(e.clientX - d.x0, e.clientY - d.y0) > DRAG_START;
    setDragBoth({ ...d, x: e.clientX, y: e.clientY, moving });
    if (moving) setOver(slotAt(e.clientX, e.clientY));
  };
  const up = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const d = dragRef.current;
    if (!d || e.pointerId !== d.pointer) return;
    setDragBoth(null);
    setOver(null);
    const moving = d.moving || Math.hypot(e.clientX - d.x0, e.clientY - d.y0) > DRAG_START; // 動きの知らせが無いまま離した場合も
    if (!moving) return; // タップは onClick で選ぶ
    dragged.current = true;
    const slot = slotAt(e.clientX, e.clientY);
    if (slot) tryPlace(d.id, slot);
    else setNote({ text: "取り付け位置の上で離そう。部品はなくなりません。", error: false });
  };
  const cancel = () => { setDragBoth(null); setOver(null); };

  const owned = (id: PartId) => repair.collected.includes(id);
  const placed = (id: PartId) => repair.placed.includes(id);
  const all = repair.placed.length === PART_IDS.length;

  return (
    <div className="bench-layer">
      <div className="bench" role="dialog" aria-modal="true" aria-labelledby="bench-title" ref={root} onKeyDown={dialogKeys(root, onClose)}>
        <div className="bench-head">
          <h2 id="bench-title">スクーター修理の作業台</h2>
          <span className="talk-badge">試作・保存なし</span>
          <button type="button" className="btn bench-close" onClick={onClose}>閉じる</button>
        </div>

        {repair.done ? (
          <div className="bench-done">
            <ScooterDrawing placed={repair.placed} complete />
            <p className="bench-done-title">エンジンがかかった！ スクーターが直りました。</p>
            <p className="bench-done-note">スクーターに乗る機能は、まだこの版にはありません。</p>
            <button type="button" className="btn primary" onClick={onClose}>街へ戻る</button>
          </div>
        ) : (
          <div className="bench-body">
            <div className="bench-tray" aria-label="集めた部品">
              <p className="bench-count">部品 {repair.collected.length}/4 ・ 取り付け {repair.placed.length}/4</p>
              <div className="bench-parts">
                {PART_IDS.map((id) => (
                  <button key={id} type="button" data-part={id}
                    className={`bench-part${selected === id ? " selected" : ""}${placed(id) ? " installed" : ""}${drag?.id === id && drag.moving ? " dragging" : ""}`}
                    disabled={!owned(id) || placed(id)} aria-pressed={selected === id}
                    onClick={() => { if (dragged.current) { dragged.current = false; return; } setSelected((s) => (s === id ? null : id)); }}
                    onPointerDown={down(id)} onPointerMove={move} onPointerUp={up} onPointerCancel={cancel}>
                    <PartArt id={id} rotation={repair.rotations[id]} />
                    <span className="bench-part-name">{PARTS[id].name}</span>
                    <small>{placed(id) ? "取り付け済み" : owned(id) ? `${repair.rotations[id]}°` : "未入手"}</small>
                  </button>
                ))}
              </div>
              <div className="bench-tools">
                <button type="button" className="btn" disabled={!selected} onClick={() => selected && run((r) => rotate(r, selected))}>↻ 90°回す</button>
                <p className="bench-hint">{selected ? PARTS[selected].hint : "部品を選んで、向きと順番を確かめよう。"}</p>
              </div>
            </div>

            <div className="bench-stage">
              <ScooterDrawing placed={repair.placed} />
              {PART_IDS.map((id) => (
                <button key={id} type="button" data-slot={id} className={`bench-slot slot-${id}${placed(id) ? " filled" : ""}${over === id ? " over" : ""}`}
                  disabled={placed(id)} aria-label={`${PARTS[id].name}の取り付け位置`} onClick={() => tryPlace(selected, id)}>
                  {SLOTS[id]}
                </button>
              ))}
            </div>

            <p className={`bench-note${note.error ? " error" : ""}`} role="status">{note.text}</p>
            <div className="bench-actions">
              <button type="button" className="btn" disabled={!repair.placed.length} onClick={() => run(undo)}>ひとつ戻す</button>
              <button type="button" className="btn" disabled={!repair.placed.length} onClick={() => { setSelected(null); run(restart); }}>組み立て直す</button>
              <button type="button" className="btn primary" disabled={!all} onClick={() => run(finish)}>エンジンをかける</button>
            </div>
          </div>
        )}
      </div>
      {drag?.moving && (
        <div className="bench-ghost" style={{ left: drag.x, top: drag.y }} aria-hidden="true"><PartArt id={drag.id} rotation={repair.rotations[drag.id]} /></div>
      )}
    </div>
  );
}
