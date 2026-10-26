import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./ui/App";
import { Session, type RendererKind } from "./state/session";
import { registry } from "./ui/registry";
import { mismatches } from "./state/consistency";
import { allowed } from "./core/world";
import "./styles.css";

// ?renderer=canvas で Canvas 版から開始できる（既定は Phaser 4）
const param = new URLSearchParams(location.search).get("renderer");
const session = new Session(param === "canvas" ? "canvas" : ("phaser" as RendererKind));

// 自動検証（e2e/browser-check.mjs）用の窓口。ゲームの状態は変えず、読み取りと操作の補助だけ
Object.assign(window, {
  __spike: {
    session, registry, allowed,
    // 新しいフレームが描かれるのを待ってから、状態と描画を同じ時点で照合する
    // （状態は入力や React の操作でフレームの途中に変わり、描画は次のフレームで追いつくため）。
    // 1秒以内に新しい描画を確認できない、または待っている間に描画方式が変わった場合は失敗を返す
    check: () => new Promise<string[]>((done) => {
      const r0 = registry.current(), start = r0?.rendered()?.frames ?? -1;
      if (!r0) { done(["描画がない"]); return; }
      let finished = false;
      const finish = (v: string[]) => { if (!finished) { finished = true; clearTimeout(timer); done(v); } };
      const timer = setTimeout(() => finish(["1秒以内に新しい描画を確認できない"]), 1000);
      const poll = () => {
        if (finished) return;
        if (registry.current() !== r0) { finish(["照合中に描画方式が変わった"]); return; }
        const r = r0.rendered();
        if (!r || r.frames <= start + 1) { requestAnimationFrame(poll); return; }
        finish(mismatches(session.getState(), session.sim, r));
      };
      requestAnimationFrame(poll);
    }),
    resetMetrics: () => registry.current()?.resetMetrics(),
    snapshot: () => ({ state: session.getState(), sim: { ...session.sim, pos: { ...session.sim.pos } },
      rendered: registry.current()?.rendered() ?? null, metrics: registry.current()?.metrics() ?? null,
      live: registry.live.size, mounts: registry.mounts, destroys: registry.destroys,
      canvases: document.querySelectorAll("canvas").length })
  }
});

createRoot(document.getElementById("root")!).render(<StrictMode><App session={session} /></StrictMode>);
