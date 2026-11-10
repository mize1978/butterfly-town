// 仮素材を作る（公開用）。本番の絵は権利条件が未確認のためリポジトリにもイメージにも入れない。
// その代わりに、このスクリプトが図形だけで街と人物の仮の絵を描き、PNG に書き出す。
// - 外部の素材・フォント・ライブラリを使わない（利用条件は、このリポジトリのコードと同じ）
// - 本番の絵と同じファイル名・大きさ・コマの位置（core/walk-anchors.json）で描くので、表示の仕組みはそのまま動く
// - 街は地図の定義（backend/config/towns/festival-street.json）の歩ける範囲・手前の植栽に合わせて塗る
// 使い方：node scripts/make-placeholder-art.mjs <書き出し先>   （例：public/art。既にある本番の絵は上書きしない）
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { deflateSync } from "node:zlib";

const here = new URL(".", import.meta.url).pathname;
const OUT = process.argv[2];
if (!OUT) { console.error("書き出し先を指定してください（例：public/art）"); process.exit(1); }
const FORCE = process.argv.includes("--force");
const anchors = JSON.parse(readFileSync(join(here, "../src/core/walk-anchors.json"), "utf8"));
const town = JSON.parse(readFileSync(join(here, "../../backend/config/towns/festival-street.json"), "utf8"));

// ── 画像（RGBA）と塗り方。端は 4 点で調べて半透明にし、ぎざぎざを和らげる
function image(w, h, bg = null) {
  const data = new Uint8ClampedArray(w * h * 4);
  if (bg) for (let i = 0; i < w * h; i++) data.set([...bg, 255], i * 4);
  return { w, h, data };
}
const hex = (s) => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16));
function blend(img, x, y, rgb, a) {
  if (x < 0 || y < 0 || x >= img.w || y >= img.h || a <= 0) return;
  const i = (y * img.w + x) * 4, d = img.data, da = d[i + 3] / 255, oa = a + da * (1 - a);
  for (let c = 0; c < 3; c++) d[i + c] = (rgb[c] * a + d[i + c] * da * (1 - a)) / (oa || 1);
  d[i + 3] = oa * 255;
}
const SUB = [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]];
function fill(img, test, box, color, alpha = 1) {
  const rgb = hex(color);
  const [x0, y0, x1, y1] = box.map(Math.round);
  for (let y = Math.max(0, y0); y <= Math.min(img.h - 1, y1); y++)
    for (let x = Math.max(0, x0); x <= Math.min(img.w - 1, x1); x++) {
      let n = 0; for (const [sx, sy] of SUB) if (test(x + sx, y + sy)) n++;
      if (n) blend(img, x, y, rgb, (n / 4) * alpha);
    }
}
function inPoly(pts, x, y) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
const bbox = (pts) => [Math.min(...pts.map((p) => p[0])), Math.min(...pts.map((p) => p[1])), Math.max(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[1]))];
const poly = (img, pts, color, a) => fill(img, (x, y) => inPoly(pts, x, y), bbox(pts), color, a);
const ellipse = (img, cx, cy, rx, ry, color, a) => fill(img, (x, y) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1, [cx - rx, cy - ry, cx + rx, cy + ry], color, a);
// 太さのある線（足・腕）：2点を結ぶ丸い端の棒
function limb(img, [ax, ay], [bx, by], r, color) {
  const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
  fill(img, (x, y) => {
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L2));
    return (x - ax - t * dx) ** 2 + (y - ay - t * dy) ** 2 <= r * r;
  }, [Math.min(ax, bx) - r, Math.min(ay, by) - r, Math.max(ax, bx) + r, Math.max(ay, by) + r], color);
}

// ── PNG に書き出す（無圧縮フィルタ＋deflate）
const CRC = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, body) {
  const len = Buffer.alloc(4); len.writeUInt32BE(body.length);
  const tb = Buffer.concat([Buffer.from(type), body]), c = Buffer.alloc(4); c.writeUInt32BE(crc(tb));
  return Buffer.concat([len, tb, c]);
}
function png(img) {
  const raw = Buffer.alloc((img.w * 4 + 1) * img.h);
  for (let y = 0; y < img.h; y++) Buffer.from(img.data.buffer, y * img.w * 4, img.w * 4).copy(raw, y * (img.w * 4 + 1) + 1);
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(img.w, 0); ihdr.writeUInt32BE(img.h, 4); ihdr.set([8, 6, 0, 0, 0], 8);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}

// ── 人物。足裏の中心 (ax, ay)、頭頂 top。view：side（横）・se（斜め前）・ne（斜め後ろ）・s（正面）・n（背面）。phase：歩きの位相（0〜1、null は立ち姿）
const GIRL = { skin: "#f2d2b6", hair: "#6b4a34", hat: "#e8cf8f", band: "#3d3f52", blouse: "#f4eee0", skirt: "#3b4a73", boots: "#6b4630", bag: "#9a6b3f" };
const MAN = { skin: "#eccbb0", hair: "#4a3a2c", hat: null, band: null, blouse: "#8aa2b8", skirt: null, trousers: "#7d725f", boots: "#4b3b2e", bag: null };
function person(img, ax, ay, top, view, phase, p = GIRL) {
  const H = ay - top, u = H / 100; // u：背丈の 1/100
  const face = view === "s" || view === "se", back = view === "n" || view === "ne";
  const dir = view === "s" || view === "n" ? 0 : 1; // 横・斜めは右向き（左は表示側で反転）
  const swing = phase === null ? 0 : Math.sin(phase * Math.PI * 2);
  const stride = (view === "side" ? 13 : view === "s" || view === "n" ? 3 : 8) * u;
  const hipY = top + 52 * u, hipX = ax;
  // 足（奥の足→手前の足）
  const legs = [-1, 1].map((s) => {
    const off = phase === null ? s * 3 * u : swing * s * stride;
    const lift = phase === null ? 0 : Math.max(0, -Math.cos(phase * Math.PI * 2 + (s > 0 ? 0 : Math.PI))) * 5 * u;
    return { s, foot: [ax + off + (dir ? 0 : s * 4 * u), ay - 2.5 * u - lift] };
  });
  for (const { s, foot } of legs.sort((a, b) => a.s - b.s)) {
    limb(img, [hipX + s * 2.5 * u * (dir ? 0.4 : 1), hipY], foot, 3.2 * u, p.trousers ?? p.skin);
    ellipse(img, foot[0] + dir * 2 * u, foot[1], 4.6 * u, 2.6 * u, p.boots);
  }
  // 胴・スカート（またはズボンの上の上着）
  if (p.skirt) poly(img, [[ax - 10 * u, top + 40 * u], [ax + 10 * u, top + 40 * u], [ax + 19 * u + swing * 2 * u, top + 80 * u], [ax - 19 * u + swing * 2 * u, top + 80 * u]], p.skirt);
  poly(img, [[ax - 11 * u, top + 22 * u], [ax + 11 * u, top + 22 * u], [ax + 10 * u, top + (p.skirt ? 42 : 55) * u], [ax - 10 * u, top + (p.skirt ? 42 : 55) * u]], p.blouse);
  // 腕（歩きに合わせて足と逆に振る）
  for (const s of [-1, 1]) {
    const sh = [ax + s * 10 * u * (dir ? 0.5 : 1), top + 25 * u];
    limb(img, sh, [sh[0] + (phase === null ? s * 2 * u : -swing * s * 7 * u * (dir ? 1 : 0.4)), top + 47 * u], 2.4 * u, p.blouse);
  }
  if (p.bag) ellipse(img, ax + (back ? -6 : 8) * u, top + 45 * u, 5 * u, 4 * u, p.bag);
  // 頭・髪・顔の向き
  const hx = ax + dir * 1.5 * u, hy = top + 12 * u;
  ellipse(img, hx, hy, 8.5 * u, 9.5 * u, back ? p.hair : p.skin);
  if (!back) ellipse(img, hx - dir * 3 * u, hy - 5 * u, 8.6 * u, 5 * u, p.hair);
  if (face) for (const s of view === "s" ? [-1, 1] : [1]) ellipse(img, hx + s * 3 * u + (view === "se" ? 1.5 * u : 0), hy + 1 * u, 0.9 * u, 1.2 * u, "#2e2a28");
  if (view === "side") ellipse(img, hx + 5.5 * u, hy + 1 * u, 0.9 * u, 1.2 * u, "#2e2a28");
  if (p.hat) { ellipse(img, hx, hy - 6 * u, 14 * u, 3.6 * u, p.hat); ellipse(img, hx, hy - 9 * u, 8 * u, 5 * u, p.hat); ellipse(img, hx, hy - 6.5 * u, 8.2 * u, 1.4 * u, p.band); }
}

// ── 書き出す一覧
const outputs = [];
const VIEW = { "girl-walk-base": "side", "girl-walk-se-base": "se", "girl-walk-ne-base": "ne", "girl-walk-s-base": "s",
  "girl-idle-s-base": "s", "girl-idle-se-base": "se", "girl-idle-e-base": "side", "girl-idle-ne-base": "ne", "girl-idle-n-base": "n" };
for (const [key, reg] of Object.entries(anchors)) {
  const [W, H] = reg.canvasSize, img = image(W, H), n = reg.frames.length, idle = key.includes("-idle-");
  for (const f of reg.frames) {
    const [, ry] = f.sourceRect, [ax, ay] = f.groundAnchor;
    person(img, ax, ay, Math.min(ay - 1, ry + 4), VIEW[key], idle ? null : f.index / n);
  }
  outputs.push([key, img]);
}
// 仮の住民（PhaserTown の RESIDENT_ART：足元 560,1524・背丈 1510）
{ const img = image(1024, 1536); person(img, 560, 1524, 14, "s", null, MAN); outputs.push(["resident-a", img]); }
// 街：歩ける石畳・手前の植栽・建物・修理屋（看板は SHOP_TAG のあたり）
{
  const { width: W, height: H } = town.size, img = image(W, H, hex("#9fbf7c"));
  poly(img, [[0, 0], [W, 0], [W, 300], [0, 380]], "#c9b79a"); // 奥の建物の並び
  for (let x = 0; x < W; x += 170) poly(img, [[x + 10, 40], [x + 150, 30], [x + 150, 300 - x * 0.05], [x + 10, 310 - x * 0.05]], x % 340 ? "#e6d6bd" : "#d9c3a3");
  poly(img, [[470, 190], [700, 190], [700, 480], [470, 480]], "#b98f63"); // 修理屋
  poly(img, [[500, 150], [655, 150], [655, 205], [500, 205]], "#8a6845"); // 無地の看板
  poly(img, town.walkable, "#d8c7a8");
  // 石畳の目地（歩ける範囲だけ）
  const grout = hex("#b9a688");
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if ((x % 46 < 2 || (y + (Math.floor(x / 46) % 2) * 15) % 30 < 2) && inPoly(town.walkable, x + 0.5, y + 0.5)) blend(img, x, y, grout, 0.8);
  poly(img, [[0, 700], [430, 760], [520, 1024], [0, 1024]], "#7fb0c6"); // 水路
  poly(img, town.foreground, "#5f8f4e"); // 手前の植栽（人物の上に描き直される範囲）
  for (let i = 0; i < 60; i++) { const [x, y] = [(i * 263) % W, 560 + ((i * 131) % 460)]; if (inPoly(town.foreground, x, y)) ellipse(img, x, y, 14, 10, i % 3 ? "#f2c14e" : "#e98b8b"); }
  outputs.push([town.background, img]);
}

mkdirSync(OUT, { recursive: true });
for (const [key, img] of outputs) {
  const file = join(OUT, `${key}.png`);
  if (existsSync(file) && !FORCE) { console.log(`そのまま：${file}（既にある絵は上書きしない）`); continue; }
  writeFileSync(file, png(img));
  console.log(`書き出し：${file}`);
}
