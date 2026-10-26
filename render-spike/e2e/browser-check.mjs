// 描画Spikeのブラウザ検証。ヘッドレス Chrome を CDP で操作し、実際のマウス入力（押す・動かす・離す）で確かめる。
// 前提：開発サーバーが起動済み（npm run dev）。使い方：node e2e/browser-check.mjs [URL]
// 結果は e2e/out/result.json とスクリーンショット（.gitignore 済み）。
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { provenance } from "./provenance.mjs";
const provStart = provenance();

const BASE = process.argv[2] || "http://127.0.0.1:4190/";
const CHROME = process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const OUT = new URL("./out/", import.meta.url).pathname;
const PORT = 9334;
mkdirSync(OUT, { recursive: true });
const profile = join(tmpdir(), `bt-render-spike-${process.pid}`);
const chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  "--window-size=1440,900", "--hide-scrollbars", "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let ws;
for (let i = 0; i < 60 && !ws; i++) {
  try { const t = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find((x) => x.type === "page"); if (t) ws = new WebSocket(t.webSocketDebuggerUrl); } catch { /* 起動待ち */ }
  await sleep(250);
}
if (ws.readyState !== WebSocket.OPEN) await new Promise((r) => ws.addEventListener("open", r));
// エラーは種類（実行時例外・console・ネットワーク）を分けて記録する。実行時例外はどの試験でも除外しない
let seq = 0; const pending = new Map(), errors = [], paused = [];
ws.addEventListener("message", (m) => {
  const d = JSON.parse(m.data);
  if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); }
  if (d.method === "Runtime.exceptionThrown") errors.push({ kind: "exception", text: d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text });
  if (d.method === "Runtime.consoleAPICalled" && ["error", "warning"].includes(d.params.type)) errors.push({ kind: `console.${d.params.type}`, text: d.params.args.map((a) => a.value ?? a.description).join(" ") });
  if (d.method === "Log.entryAdded" && d.params.entry.level === "error") errors.push({ kind: `log.${d.params.entry.source}`, text: d.params.entry.text, url: d.params.entry.url || "" });
  if (d.method === "Fetch.requestPaused") paused.push(d.params.requestId); // 素材の通信を保留中
});
// CDP の応答がエラーなら例外にする（解除などの操作が失敗したまま進まないように）
const send = (method, params = {}) => new Promise((r, reject) => { const i = ++seq; pending.set(i, (d) => d.error ? reject(new Error(`${method}: ${d.error.message}`)) : r(d)); ws.send(JSON.stringify({ id: i, method, params })); });
const js = async (expr) => { const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true }); if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || expr); return r.result.result.value; };
const snap = () => js("window.__spike.snapshot()");
const shot = async (name) => { const r = await send("Page.captureScreenshot", { format: "png" }); writeFileSync(join(OUT, `${name}.png`), Buffer.from(r.result.data, "base64")); };
const mouse = (type, x, y, extra = {}) => send("Input.dispatchMouseEvent", { type, x, y, button: "left", ...extra });

// 論理座標（1536×1024）→ 画面座標
async function screenOf(wx, wy) {
  const r = await js(`(()=>{const c=document.querySelector('canvas.world-canvas');const b=c.getBoundingClientRect();return {l:b.left,t:b.top,w:b.width,h:b.height};})()`);
  return { x: r.l + (wx / 1536) * r.w, y: r.t + (wy / 1024) * r.h };
}
// 押し続けて、一定間隔で状態を記録する（React と描画の照合も毎回行う）
async function hold(wx, wy, ms) {
  const p = await screenOf(wx, wy), samples = [];
  await mouse("mousePressed", p.x, p.y, { buttons: 1, clickCount: 1 });
  for (let t = 0; t < ms; t += 100) {
    await mouse("mouseMoved", p.x, p.y, { buttons: 1 });
    await sleep(100);
    samples.push(await js("(async()=>{const bad=await window.__spike.check();const s=window.__spike.snapshot();return {s, bad, inside:window.__spike.allowed(s.sim.pos.x,s.sim.pos.y,s.state.riding?22:12)};})()"));
  }
  await mouse("mouseReleased", p.x, p.y, { buttons: 0, clickCount: 1 });
  return samples;
}
const click = (sel) => js(`(()=>{const b=document.querySelector(${JSON.stringify(sel)});if(!b)throw new Error('no ${sel}');b.click();return true;})()`);
// ページ遷移後、選択画面のボタンが出るまで待つ（キャッシュ無効時は読み込みに時間がかかる）
// 遷移前の画面に目印を置き、目印が消えた（新しいドキュメントになった）うえで URL と選択画面を確かめる
const navigate = async (url) => {
  await js("window.__navMark = 1").catch(() => {});
  await send("Page.navigate", { url });
  for (let i = 0; i < 200; i++) {
    const ok = await js(`!window.__navMark && location.href === ${JSON.stringify(new globalThis.URL(url).href)} && !!(window.__spike && document.querySelector('#enter'))`).catch(() => false);
    if (ok) return;
    await sleep(50);
  }
  throw new Error(`画面が表示されない：${url}`);
};
const waitLive = async (n) => { for (let i = 0; i < 50; i++) { const x = await snap(); if (x.live === n && x.canvases === n) return x; await sleep(100); } return snap(); };
const waitStatus = async (want) => { for (let i = 0; i < 100; i++) { if (await js(`document.querySelector('.world-host')?.dataset.status`) === want) return true; await sleep(100); } return false; };
const waitReady = async () => { for (let i = 0; i < 100; i++) { if (await js(`document.querySelector('.world-host')?.dataset.status`) === "ready") { await sleep(300); return; } await sleep(100); } throw new Error("描画の準備が終わらない"); };

const results = [], excluded = []; // excluded：想定どおりとして除外したログ（証拠として保存）
const check = (name, ok, detail = "") => { results.push({ name, ok: !!ok, detail }); console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? " — " + detail : ""}`); };

await send("Runtime.enable"); await send("Log.enable"); await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
const metrics = {};

for (const renderer of ["phaser", "canvas"]) {
  await navigate(`${BASE}?renderer=${renderer}`);
  for (const character of ["girl", "boy"]) {
    const tag = `${renderer}/${character}`;
    await click(`button[data-character="${character}"]`);
    await click("#enter");
    await waitReady();
    let s = await waitLive(1);
    check(`${tag} 描画インスタンスは1つ（StrictMode でも二重にならない。破棄の完了まで数える）`, s.live === 1 && s.canvases === 1, `live=${s.live} canvases=${s.canvases} mounts=${s.mounts} destroys=${s.destroys}`);
    check(`${tag} 選んだ人物が表示される`, s.rendered?.texture === `${character}-${s.state.outfits[character]}` && s.rendered?.frame === -1, s.rendered?.texture);
    await shot(`${renderer}-${character}-idle`);

    // 1) 長押しで移動、離すと停止。歩行4コマを再生
    const start = s.sim.pos;
    const walk = await hold(1250, 500, 2500);
    const moved = walk.at(-1).s.sim.pos;
    const frames = new Set(walk.map((x) => x.s.rendered?.frame).filter((f) => f >= 0));
    check(`${tag} 長押しで移動する`, Math.hypot(moved.x - start.x, moved.y - start.y) > 100, `${start.x.toFixed(0)},${start.y.toFixed(0)} → ${moved.x.toFixed(0)},${moved.y.toFixed(0)}`);
    check(`${tag} 歩行アニメ4コマを再生`, frames.size === 4, `描画したコマ=${[...frames].sort()}`);
    check(`${tag} 移動中も React と描画が一致`, walk.every((x) => x.bad.length === 0), walk.find((x) => x.bad.length)?.bad.join("/") || "");
    await sleep(600);
    const after = (await snap()).sim.pos; await sleep(500);
    const later = await snap();
    check(`${tag} 離すと止まり、立ち姿に戻る`, Math.hypot(later.sim.pos.x - after.x, later.sim.pos.y - after.y) < 0.01 && later.rendered.texture === `${character}-base` && later.rendered.frame === -1, `${later.rendered.texture}`);

    // 2) 水路・建物へ押し続けても通り抜けない
    for (const [wx, wy, label] of [[200, 850, "水路"], [500, 300, "建物"]]) {
      await hold(930, 625, 4000); // 中央から始める
      const hit = await hold(wx, wy, 6000);
      const last = hit.at(-1).s;
      check(`${tag} ${label}の方向へ押し続けても通り抜けない`, last.sim.blocked && hit.every((x) => x.inside),
        `pos=${last.sim.pos.x.toFixed(0)},${last.sim.pos.y.toFixed(0)} blocked=${last.sim.blocked} 全${hit.length}標本で通行範囲内=${hit.every((x) => x.inside)}`);
      if (label === "水路") await shot(`${renderer}-${character}-blocked`);
    }
    await hold(930, 625, 4000); // 中央へ戻る

    // 3) 衣装を変える（人物・位置は変わらない）
    const beforeOutfit = await snap();
    await click('button[data-outfit="alt"]'); await sleep(300);
    s = await snap();
    check(`${tag} 衣装差分に切り替わる`, s.rendered.texture === `${character}-alt`, s.rendered.texture);
    check(`${tag} 衣装変更後も同じ人物・同じ位置`, s.rendered.texture.startsWith(`${character}-`) && Math.hypot(s.rendered.x - beforeOutfit.rendered.x, s.rendered.y - beforeOutfit.rendered.y) < 0.01);
    await shot(`${renderer}-${character}-alt`);

    // 4) 狭い場所では乗れない（徒歩なら立てる位置）
    await js("(()=>{window.__spike.session.sim.pos={x:676,y:640};return 1;})()");
    await click("#ride"); await sleep(200);
    s = await snap();
    check(`${tag} 狭い場所では乗車を断り、徒歩のまま`, !s.state.riding && s.rendered.texture === `${character}-alt` && /狭/.test(s.state.message), s.state.message);
    await hold(930, 625, 3000);

    // 5) 乗車して運転し、降車。衣装は維持
    await click("#ride"); await sleep(300);
    s = await snap();
    check(`${tag} 乗車すると乗車姿（同じ衣装）`, s.state.riding && s.rendered.texture === `${character}-ride-alt`, s.rendered.texture);
    const rideFrom = s.sim;
    const ride = await hold(1250, 480, 1500);
    const rideTo = ride.at(-1).s.sim;
    check(`${tag} 乗車中も長押しで運転できる（乗車中の移動量を確認）`, rideTo.distance - rideFrom.distance > 100 && Math.hypot(rideTo.pos.x - rideFrom.pos.x, rideTo.pos.y - rideFrom.pos.y) > 100, `乗車中の移動 ${(rideTo.distance - rideFrom.distance).toFixed(0)}`);
    check(`${tag} 乗車中は歩行コマを混ぜない`, ride.every((x) => x.s.rendered.frame === -1 && x.s.rendered.texture === `${character}-ride-alt`));
    check(`${tag} 乗車中も React と描画が一致`, ride.every((x) => x.bad.length === 0));
    check(`${tag} 乗車中も通行範囲内（車体の幅で判定）`, ride.every((x) => x.inside));
    await shot(`${renderer}-${character}-ride`);
    await click("#ride"); await sleep(300);
    s = await snap();
    check(`${tag} 降車後も衣装を維持`, !s.state.riding && s.rendered.texture === `${character}-alt` && s.state.outfits[character] === "alt", s.rendered.texture);
    // 男の子は基本衣装へ戻し、男女で別の衣装にした状態で保持を確かめる
    if (character === "boy") { await click('button[data-outfit="base"]'); await sleep(200); }

    // 計測（徒歩で3秒動かしている間だけ。計測区間をリセットしてから）
    await js("window.__spike.resetMetrics()");
    const m = await hold(700, 640, 3000);
    metrics[tag] = m.at(-1).s.metrics;
    check(`${tag} 照合の最終確認`, (await js("window.__spike.check()")).length === 0);
    await click("#back"); await sleep(400);
  }
  const s = await waitLive(0);
  check(`${renderer} 選択画面に戻ると描画を破棄する（破棄の完了を確認）`, s.live === 0 && s.canvases === 0 && s.mounts === s.destroys, `mounts=${s.mounts} destroys=${s.destroys}`);
  check(`${renderer} 人物ごとの衣装を保持（女の子=alt、男の子=base）`, s.state.outfits.girl === "alt" && s.state.outfits.boy === "base", JSON.stringify(s.state.outfits));
  for (const [c, o] of [["girl", "alt"], ["boy", "base"]]) {
    await click(`button[data-character="${c}"]`); await click("#enter"); await waitReady();
    const x = await snap();
    check(`${renderer} 選び直した${c}は保持した衣装で表示`, x.rendered?.texture === `${c}-${o}`, x.rendered?.texture);
    await click("#back"); await waitLive(0);
  }
}

// 描画方式の切り替えでも描画インスタンスは1つ
await click(`button[data-character="girl"]`); await click("#enter"); await waitReady();
await click('button[data-renderer="phaser"]'); await waitReady();
await click('button[data-renderer="canvas"]'); await waitReady();
await click('button[data-renderer="phaser"]'); await waitReady();
let sw = await waitLive(1);
check("描画方式を3回切り替えても、生きている描画は1つ（破棄の完了を確認）", sw.live === 1 && sw.canvases === 1, `mounts=${sw.mounts} destroys=${sw.destroys}`);

// 30ms間隔の連続切り替えと入退場（読み込み中だったかは問わない。読み込み中の確定は次の試験で行う）
for (let i = 0; i < 6; i++) { await click(`button[data-renderer="${i % 2 ? "phaser" : "canvas"}"]`); await sleep(30); }
await click("#back"); await sleep(30); await click("#enter"); await sleep(30); await click("#back");
sw = await waitLive(0);
check("30ms間隔で方式の切り替え6回と入退場を繰り返しても、すべて破棄が完了する", sw.live === 0 && sw.canvases === 0 && sw.mounts === sw.destroys, `mounts=${sw.mounts} destroys=${sw.destroys}`);
await click("#enter"); await waitReady();
sw = await waitLive(1);
check("その後の再入場で描画は1つ、照合も一致", sw.live === 1 && sw.canvases === 1 && (await js("window.__spike.check()")).length === 0, `mounts=${sw.mounts} destroys=${sw.destroys}`);

// 読み込み中の破棄：素材の通信を保留して「読み込み中」を確定させてから、退場・方式切り替えを行う。
// 保留を解除した後も、破棄した描画が再び初期化されないことを確かめる
await send("Network.enable");
await send("Network.setCacheDisabled", { cacheDisabled: true });
for (const renderer of ["phaser", "canvas"]) for (const action of ["退場", "方式の切り替え"]) {
  const before = errors.length;
  await navigate(`${BASE}?renderer=${renderer}`);
  paused.length = 0;
  await send("Fetch.enable", { patterns: [{ urlPattern: "*/art/*.png", requestStage: "Request" }] });
  await click("#enter");
  for (let i = 0; i < 50 && !paused.length; i++) await sleep(50);
  const st = await js(`document.querySelector('.world-host')?.dataset.status`);
  const heldCount = paused.length;
  const other = renderer === "phaser" ? "canvas" : "phaser";
  if (action === "退場") await click("#back"); else await click(`button[data-renderer="${other}"]`);
  await sleep(100);
  // 保留を解除してから（応答エラーは例外）、以降の素材要求はそのまま通す
  for (const id of paused.splice(0)) await send("Fetch.continueRequest", { requestId: id });
  await send("Fetch.disable");
  if (action === "退場") {
    const f = await waitLive(0); await sleep(1500);
    const g = await snap();
    const bad = errors.slice(before);
    check(`${renderer} 読み込み中（素材${heldCount}件を保留中・status=${st}）に退場すると破棄が完了し、保留解除後も再初期化しない`,
      heldCount > 0 && st === "loading" && f.live === 0 && g.live === 0 && g.canvases === 0 && g.mounts === g.destroys && bad.length === 0,
      `live=${g.live} canvases=${g.canvases} mounts=${g.mounts} destroys=${g.destroys} エラー=${bad.length}`);
  } else {
    await waitReady();
    const g = await waitLive(1); await sleep(1000);
    const h = await snap(), bad = errors.slice(before), ok = (await js("window.__spike.check()")).length === 0;
    check(`${renderer} 読み込み中（素材${heldCount}件を保留中・status=${st}）に${other}へ切り替えると、生存は新しい描画1つだけ`,
      heldCount > 0 && st === "loading" && g.live === 1 && h.live === 1 && h.canvases === 1 && h.rendered && h.metrics.backend.startsWith(other === "phaser" ? "phaser" : "canvas") && ok && bad.length === 0,
      `live=${h.live} canvases=${h.canvases} backend=${h.metrics?.backend} 照合=${ok} エラー=${bad.length}`);
  }
}
await send("Network.setCacheDisabled", { cacheDisabled: false });

// 素材の読み込み失敗：エラーを表示し、描画は止めて破棄する（この区間の 404 は想定どおりなので除外）
for (const renderer of ["phaser", "canvas"]) {
  const before = errors.length;
  await navigate(`${BASE}?renderer=${renderer}&art=missing-art/`);
  await click("#enter");
  const shown = await waitStatus("error");
  const f = await waitLive(0);
  // 想定どおりのものだけ除外：存在しない素材への通信エラーと、Phaser が素材ごとに出す既知の通知（"Failed to process file" + 素材名）
  const ART = /\/missing-art\/(town|(girl|boy)(-(walk|ride))?-(base|alt))\.png$/;
  const known = (e) => (e.kind === "log.network" && ART.test(e.url)) ||
    (e.kind === "console.error" && /^Failed to process file: %s "%s" image (town|(girl|boy)(-(walk|ride))?-(base|alt))$/.test(e.text));
  const section = errors.splice(before);
  const unexpected = section.filter((e) => !known(e));
  excluded.push(...section.filter(known).map((e) => ({ renderer, ...e })));
  check(`${renderer} 素材が無いときはエラーを表示し、描画を破棄する`, shown && f.live === 0 && f.canvases === 0 && unexpected.length === 0, `live=${f.live} canvases=${f.canvases} 想定外のエラー=${unexpected.length}`);
  errors.push(...unexpected);
}
const gl = await js(`(()=>{const c=document.createElement('canvas').getContext('webgl2')||document.createElement('canvas').getContext('webgl');if(!c)return 'WebGLなし';const e=c.getExtension('WEBGL_debug_renderer_info');return e?c.getParameter(e.UNMASKED_RENDERER_WEBGL):c.getParameter(c.RENDERER);})()`);
const ua = await js("navigator.userAgent");

const provEnd = provenance();
check("試験の開始時と終了時で、対象ファイルのハッシュが一致（途中で変更なし）", provStart.sha256 === provEnd.sha256, provEnd.sha256.slice(0, 12));
const passed = results.filter((r) => r.ok).length;
writeFileSync(join(OUT, "result.json"), JSON.stringify({ provenance: { start: provStart, end: provEnd, sameDuringRun: provStart.sha256 === provEnd.sha256 }, excluded, url: BASE, ua, webgl: gl, passed, total: results.length, results, metrics, errors }, null, 1));
console.log(`\n${passed}/${results.length} checks passed`);
console.log("WebGL:", gl);
console.log("metrics:", JSON.stringify(metrics, null, 1));
console.log("console errors/warnings:", errors.length ? errors : "なし");
ws.close(); chrome.kill(); await sleep(300); rmSync(profile, { recursive: true, force: true });
process.exit(passed === results.length && errors.length === 0 ? 0 : 1);
