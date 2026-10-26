// 描画側（Phaser / Canvas）を React の中に置く部品。マウント時に生成し、アンマウント時に必ず破棄する。
// 生存数（registry.live）は破棄の完了まで減らさないため、StrictMode の二重実行や切り替えの後も実数を確かめられる。
import { useEffect, useRef, useState } from "react";
import { CanvasRenderer } from "../render/CanvasRenderer";
import { PhaserRenderer } from "../render/PhaserRenderer";
import type { Renderer } from "../render/types";
import type { RendererKind, Session } from "../state/session";
import { registry } from "./registry";

export function GameView({ session, kind }: { session: Session; kind: RendererKind }) {
  const host = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");

  useEffect(() => {
    const r: Renderer = kind === "phaser" ? new PhaserRenderer() : new CanvasRenderer();
    let alive = true;
    const dispose = () => { registry.release(r); r.destroy().then(() => registry.detach(r)); };
    registry.attach(r);
    setStatus("loading");
    r.mount(host.current!, session)
      .then(() => { if (alive) setStatus("ready"); })
      .catch((e: Error) => {
        dispose(); // 読み込みに失敗した描画は止めて破棄する
        if (alive) { setStatus("error"); setError(e.message); }
      });
    return () => { alive = false; dispose(); };
  }, [kind, session]);

  return (
    <div className="world-host" ref={host} data-status={status}>
      {status === "loading" && <p className="world-note">素材を読み込んでいます…</p>}
      {status === "error" && <p className="world-note error">{error}（`npm run art` で素材を複製してから再読み込みしてください）</p>}
    </div>
  );
}
