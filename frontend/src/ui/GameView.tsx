// Phaser の描画を React の中に置く部品。マウント時に生成し、アンマウント時に必ず破棄する（StrictMode の二重実行にも対応）
import { useEffect, useRef, useState } from "react";
import type { Session } from "../game/session";
import { PhaserTown } from "../render/PhaserTown";

export function GameView({ session }: { session: Session }) {
  const host = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");

  useEffect(() => {
    const r = new PhaserTown();
    let alive = true;
    setStatus("loading");
    r.mount(host.current!, session)
      .then(() => { if (alive) setStatus("ready"); })
      .catch((e: Error) => {
        void r.destroy(); // 読み込みに失敗した描画は止めて破棄する
        if (alive) { setStatus("error"); setError(e.message); }
      });
    return () => { alive = false; void r.destroy(); };
  }, [session]);

  return (
    <div className="world-host" ref={host} data-status={status}>
      {status === "loading" && <p className="world-note">素材を読み込んでいます…</p>}
      {status === "error" && <p className="world-note error" role="alert">{error}（frontend で `npm run art` を実行して素材を複製してから、再読み込みしてください）</p>}
    </div>
  );
}
