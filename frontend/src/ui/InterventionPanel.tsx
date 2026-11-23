// 特殊介入（#33）のパネル。「時間帯を進める」の横の「介入」から開く。
// 残り回数を出し、0 回・終わった街では押せない（理由を添える）。断られたら回数は使っていないことを伝える。
// 時間帯を進めている間（slotSending）は「介入」「介入する」とも押せない。送っている間は onSendingChange で親に伝え、
// 親は「時間帯を進める」を押せなくする（2つの応答が前後して古い状態を画面に反映しないため）
import { useMemo, useState } from "react";
import type { PlaythroughState } from "../api/playthrough";
import { sendIntervention, type InterventionRequest } from "../api/interventions";
import { FACTS, GATHERING_PLACES, InterventionRequestId, interventionBlocked, interventionNote, RESIDENTS } from "../game/intervention";
import { describeEvent } from "../game/time-slot";

type Props = {
  playthrough: PlaythroughState; slotSending: boolean;
  onPlaythroughChange: (s: PlaythroughState) => void; onDone: (text: string) => void; onSendingChange: (sending: boolean) => void;
};

export function InterventionPanel({ playthrough, slotSending, onPlaythroughChange, onDone, onSendingChange }: Props) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<"rumor" | "gathering">("rumor");
  const [target, setTarget] = useState<string>("a");
  const [factKey, setFactKey] = useState<string>("e1");
  const [place, setPlace] = useState<string>("plaza");
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const ids = useMemo(() => new InterventionRequestId(), []);
  const blocked = interventionBlocked(playthrough, sending, slotSending);

  const submit = async () => {
    const content = kind === "rumor" ? `rumor:${target}:${factKey}` : `gathering:${place}`;
    const requestId = ids.for(content);
    const req: InterventionRequest = kind === "rumor" ? { kind, requestId, target, factKey } : { kind, requestId, place };
    if (blocked) return;
    setSending(true);
    onSendingChange(true);
    setMessage(null);
    try {
      const r = await sendIntervention(req);
      if (r.state) onPlaythroughChange(r.state);
      ids.reset();
      if (r.ok && r.event) { onDone(`介入：${describeEvent(r.event)}`); setOpen(false); } else setMessage(interventionNote(r.error));
    } catch (e) {
      setMessage(`${(e as Error).message}。もう一度押すと同じ介入を送り直します（二重には数えません）。`);
    } finally {
      setSending(false);
      onSendingChange(false);
    }
  };

  return (
    <div className="intervention">
      <button type="button" className="btn intervention-button" aria-expanded={open} aria-controls="intervention-panel"
        disabled={slotSending || (!open && blocked !== null && !sending)} onClick={() => setOpen((o) => !o)}>
        介入<small>残り{playthrough.interventionsLeft}回</small>
      </button>
      {blocked && !sending && !slotSending && !open && <span className="slot-note intervention-why">{blocked}</span>}
      {open && (
        <div id="intervention-panel" className="intervention-panel" role="group" aria-label="特殊介入">
          <fieldset>
            <legend>何をする？（どちらも1回ずつ数えます）</legend>
            <label><input type="radio" name="kind" checked={kind === "rumor"} onChange={() => setKind("rumor")} />うわさを流す</label>
            <label><input type="radio" name="kind" checked={kind === "gathering"} onChange={() => setKind("gathering")} />集まる場を作る</label>
          </fieldset>
          {kind === "rumor" ? (
            <p className="intervention-fields">
              <label>だれに <select value={target} onChange={(e) => setTarget(e.target.value)}>{RESIDENTS.map((k) => <option key={k} value={k}>住民{k}</option>)}</select></label>
              <label>なにを <select value={factKey} onChange={(e) => setFactKey(e.target.value)}>{FACTS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}</select></label>
            </p>
          ) : (
            <p className="intervention-fields">
              <label>どこで <select value={place} onChange={(e) => setPlace(e.target.value)}>{GATHERING_PLACES.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}</select></label>
              <small>次の朝か昼に開きます。行くかどうかは住民が決めます。</small>
            </p>
          )}
          <p className="intervention-actions">
            <button type="button" className="btn primary" disabled={blocked !== null} onClick={submit}>{sending ? "送っています…" : "介入する"}</button>
            <button type="button" className="btn" onClick={() => setOpen(false)}>やめる</button>
          </p>
          {message && <p className="slot-error" role="alert">{message}</p>}
        </div>
      )}
    </div>
  );
}
