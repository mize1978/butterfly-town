import { useEffect, useState, useSyncExternalStore } from "react";
import { CHARACTERS, CHARACTER_NAMES, OUTFITS, OUTFIT_NAMES, textureKey } from "../core/appearance";
import { mismatches } from "../state/consistency";
import type { Session } from "../state/session";
import { GameView } from "./GameView";
import { registry } from "./registry";

export function App({ session }: { session: Session }) {
  const st = useSyncExternalStore(session.subscribe, session.getState);
  return st.screen === "select" ? <Select session={session} /> : <Game session={session} />;
}

function Select({ session }: { session: Session }) {
  const st = useSyncExternalStore(session.subscribe, session.getState);
  return (
    <main className="select">
      <h1>Butterfly Town <small>描画Spike</small></h1>
      <p className="lead">遊ぶ人物を選んでください。</p>
      <div className="cards">
        {CHARACTERS.map((c) => (
          <button key={c} className={`card ${st.selected === c ? "selected" : ""}`} aria-pressed={st.selected === c}
            data-character={c} onClick={() => session.select(c)}>
            <img src={`art/${textureKey(c, st.outfits[c], "idle")}.png`} alt="" />
            <span>{CHARACTER_NAMES[c]}</span>
            <small>{OUTFIT_NAMES[st.outfits[c]]}</small>
          </button>
        ))}
      </div>
      <button className="primary" id="enter" onClick={() => session.enter()}>この姿で街へ</button>
      <p className="note">固定データの技術検証です。AI住民・Rails・修理パズルとは接続していません。人物・衣装は仮設定です。</p>
    </main>
  );
}

function Game({ session }: { session: Session }) {
  const st = useSyncExternalStore(session.subscribe, session.getState);
  const outfit = st.outfits[st.character];
  return (
    <main className="game">
      <header>
        <h1>Butterfly Town <small>描画Spike</small></h1>
        <div className="renderer-switch" role="group" aria-label="描画方式">
          {(["phaser", "canvas"] as const).map((k) => (
            <button key={k} data-renderer={k} aria-pressed={st.renderer === k} onClick={() => session.setRenderer(k)}>
              {k === "phaser" ? "Phaser 4" : "Canvas 2D"}
            </button>
          ))}
        </div>
      </header>
      <section className="stage">
        <GameView session={session} kind={st.renderer} key={st.renderer} />
        <p className="hint">行きたい方向でマウスの左ボタンを押し続けると進み、離すと止まります。</p>
      </section>
      <aside className="panel">
        <h2>{CHARACTER_NAMES[st.character]}・{OUTFIT_NAMES[outfit]}</h2>
        <p className="mode">{st.riding ? "スクーター（徒歩の約2.2倍）" : "徒歩"}</p>
        <h3>着せ替え</h3>
        <div className="outfits">
          {OUTFITS.map((o) => (
            <button key={o} data-outfit={o} aria-pressed={outfit === o} onClick={() => session.setOutfit(o)}>
              <img src={`art/${textureKey(st.character, o, "idle")}.png`} alt="" />{OUTFIT_NAMES[o]}
            </button>
          ))}
        </div>
        <button className="primary" id="ride" onClick={() => session.toggleRide()}>
          {st.riding ? "スクーターから降りる" : "スクーターに乗る"}
        </button>
        <p className="message" aria-live="polite">{st.message}</p>
        <button id="back" onClick={() => session.backToSelect()}>キャラクター選択へ</button>
        <label className="debug"><input type="checkbox" checked={st.debug} onChange={(e) => session.setDebug(e.target.checked)} /> 通行範囲を表示</label>
        <Telemetry session={session} />
      </aside>
    </main>
  );
}

// 検証用：状態（React）と描画（Phaser / Canvas）の照合、計測値
function Telemetry({ session }: { session: Session }) {
  const [, setTick] = useState(0);
  useEffect(() => { const t = setInterval(() => setTick((n) => n + 1), 250); return () => clearInterval(t); }, []);
  const st = session.getState(), r = registry.current(), info = r?.rendered() ?? null, m = r?.metrics();
  const bad = mismatches(st, session.sim, info);
  return (
    <details className="telemetry" open>
      <summary>技術検証の表示</summary>
      <dl>
        <dt>状態と描画</dt><dd data-testid="consistency">{bad.length ? `不一致：${bad.join("／")}` : "一致"}</dd>
        <dt>描画中の画像</dt><dd>{info ? `${info.texture}${info.frame >= 0 ? `#${info.frame}` : ""}${info.flip ? "（反転）" : ""}` : "—"}</dd>
        <dt>位置</dt><dd>{`x=${session.sim.pos.x.toFixed(1)} y=${session.sim.pos.y.toFixed(1)}`}{session.sim.blocked ? "（境界で停止）" : ""}</dd>
        <dt>計測</dt><dd>{m ? `${m.backend}／${m.fps.toFixed(0)}fps／1フレーム平均${m.frameMsAvg.toFixed(2)}ms・p95 ${m.frameMsP95.toFixed(2)}ms` : "—"}</dd>
        <dt>描画インスタンス</dt><dd>{`生存${registry.live.size}・生成${registry.mounts}・破棄${registry.destroys}`}</dd>
      </dl>
    </details>
  );
}
