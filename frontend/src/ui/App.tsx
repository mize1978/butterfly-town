import { useEffect, useMemo, useState } from "react";
import { fetchTown } from "../api/town";
import type { Town } from "../core/world";
import { Session } from "../game/session";
import { GameView } from "./GameView";

type Load = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; town: Town };

export function App() {
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

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

  return (
    <main className="town-screen">
      <header>
        <h1>Butterfly Town</h1>
        {town && <span className="town-name">{town.name}</span>}
      </header>
      {load.status === "loading" && <p className="status">街の地図を読み込んでいます…</p>}
      {load.status === "error" && (
        <div className="status error" role="alert">
          <p>{load.message}</p>
          <button onClick={() => setAttempt((n) => n + 1)}>もう一度読み込む</button>
        </div>
      )}
      {session && <GameView session={session} />}
      {session && <p className="hint">行きたい方向を長押しすると歩きます。離すと止まります。</p>}
    </main>
  );
}
