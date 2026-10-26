// 描画方式ごとの性能計測。ヘッドレス Chrome で、追加人物数（?stress=N）を変えて3回ずつ測り、生データを保存する。
// 前提：開発サーバーが起動済み。使い方：node e2e/perf.mjs [URL]  → e2e/out/perf.json
// 準備時間＝「街へ」を押してから、素材の読み込みと最初の1フレームの描画が終わるまで（両方式で同じ基準）。
// フレーム時間＝1秒のウォームアップ後に計測区間をリセットし、続く3秒間の「更新＋描画命令」の CPU 時間（GPU の実行時間は含まない）。
import { spawn } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { provenance } from "./provenance.mjs";
const provStart = provenance();

const BASE = process.argv[2] || "http://127.0.0.1:4190/";
const OUT = new URL("./out/", import.meta.url).pathname;
const PORT = 9336, REPEAT = 3, STRESS = [0, 100, 500, 1000];
mkdirSync(OUT, { recursive: true });
const profile = join(tmpdir(), `bt-render-perf-${process.pid}`);
const chrome = spawn(process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ["--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, "--window-size=1440,900", "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws;
for (let i = 0; i < 60 && !ws; i++) { try { const t = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find((x) => x.type === "page"); if (t) ws = new WebSocket(t.webSocketDebuggerUrl); } catch { /* 起動待ち */ } await sleep(250); }
if (ws.readyState !== WebSocket.OPEN) await new Promise((r) => ws.addEventListener("open", r));
let seq = 0; const pend = new Map();
ws.addEventListener("message", (m) => { const d = JSON.parse(m.data); if (pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } });
const send = (method, params = {}) => new Promise((r) => { const i = ++seq; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const js = async (e) => (await send("Runtime.evaluate", { expression: e, returnByValue: true, awaitPromise: true })).result.result.value;

await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await send("Network.enable");
await send("Network.setCacheDisabled", { cacheDisabled: true }); // 毎回、素材を読み込み直す
const runs = [];
const failures = [];
for (const stress of STRESS) for (let rep = 1; rep <= REPEAT; rep++) for (const renderer of ["phaser", "canvas"]) {
  for (let attempt = 1; attempt <= 3; attempt++) { if (await measure(stress, rep, renderer, attempt)) break; }
}
async function measure(stress, rep, renderer, attempt) {
  // 遷移前の画面に目印を置き、新しいドキュメント・URL・選択画面を確かめる
  const url = `${BASE}?renderer=${renderer}&stress=${stress}`;
  await js("window.__navMark = 1").catch(() => {});
  await send("Page.navigate", { url });
  let arrived = false;
  for (let i = 0; i < 200 && !arrived; i++) {
    arrived = await js(`!window.__navMark && location.href === ${JSON.stringify(new globalThis.URL(url).href)} && !!(window.__spike && document.querySelector('#enter'))`).catch(() => false);
    if (!arrived) await sleep(50);
  }
  if (!arrived) { failures.push({ renderer, stress, rep, attempt, reason: "遷移を確認できない" }); return false; }
  await sleep(300);
  const readyMs = await js(`new Promise((done)=>{const t0=performance.now();document.querySelector('#enter').click();
    const poll=()=>{const s=document.querySelector('.world-host')?.dataset.status;if(s==='ready')done(performance.now()-t0);else if(performance.now()-t0>15000)done(-1);else setTimeout(poll,5);};poll();})`);
  await sleep(1000);
  await js("window.__spike.resetMetrics()");
  await sleep(3000);
  const m = await js("(()=>{const m=window.__spike.snapshot().metrics;return m&&{...m,ageMs:performance.now()-m.lastAt};})()");
  const expected = renderer === "phaser" ? "phaser-webgl" : "canvas2d";
  // 有効条件：想定の描画方式、標本100以上、有限値、計測区間（3秒）の大半を覆い、取得直前まで描画が続いている
  const valid = m && readyMs >= 0 && m.backend === expected && m.samples >= 100 &&
    [m.fps, m.frameMsAvg, m.frameMsP95].every((v) => Number.isFinite(v)) && m.fps > 0 && m.spanMs >= 2700 && m.ageMs < 200;
  if (!valid) {
    const status = await js("document.querySelector('.world-host')?.dataset.status ?? '画面なし'");
    failures.push({ renderer, stress, rep, attempt, readyMs, status, backend: m?.backend, samples: m?.samples, spanMs: m?.spanMs, ageMs: m?.ageMs });
    console.log("再試行", JSON.stringify(failures.at(-1)));
    return false;
  }
  const heapMB = await js("performance.memory ? performance.memory.usedJSHeapSize/1048576 : null");
  runs.push({ renderer: m.backend, stress, rep, readyMs: +readyMs.toFixed(1), fps: +m.fps.toFixed(1), frameMsAvg: +m.frameMsAvg.toFixed(3), frameMsP95: +m.frameMsP95.toFixed(3), samples: m.samples, spanMs: +m.spanMs.toFixed(0), ageMs: +m.ageMs.toFixed(1), heapMB: heapMB && +heapMB.toFixed(1) });
  console.log(JSON.stringify(runs.at(-1)));
  return true;
}
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const summary = [];
for (const stress of STRESS) for (const backend of ["phaser-webgl", "canvas2d"]) {
  const r = runs.filter((x) => x.stress === stress && x.renderer === backend);
  if (!r.length) continue;
  summary.push({ backend, stress, n: r.length, readyMs: median(r.map((x) => x.readyMs)), fps: median(r.map((x) => x.fps)),
    frameMsAvg: median(r.map((x) => x.frameMsAvg)), frameMsP95: median(r.map((x) => x.frameMsP95)), heapMB: median(r.map((x) => x.heapMB)) });
}
const gl = await js(`(()=>{const c=document.createElement('canvas').getContext('webgl2');const e=c&&c.getExtension('WEBGL_debug_renderer_info');return e?c.getParameter(e.UNMASKED_RENDERER_WEBGL):'不明';})()`);
// 全条件で3回ずつ有効な計測がそろわなければ失敗として終了する
const provEnd = provenance();
const complete = summary.length === STRESS.length * 2 && summary.every((x) => x.n === REPEAT) && provStart.sha256 === provEnd.sha256;
writeFileSync(join(OUT, "perf.json"), JSON.stringify({ provenance: { start: provStart, end: provEnd, sameDuringRun: provStart.sha256 === provEnd.sha256 }, complete, base: BASE, webgl: gl, ua: await js("navigator.userAgent"), note: "中央値（3回）", summary, runs, failures }, null, 1));
console.table(summary);
ws.close(); chrome.kill(); await sleep(300); rmSync(profile, { recursive: true, force: true });
if (!complete) console.error("計測が不完全です（各条件3回の有効な計測がそろっていません）");
process.exit(complete ? 0 : 1);
