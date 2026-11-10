// 試作素材を ~/outputs から public/art へ複製する（元の素材は読むだけで変更しない）。
// public/art は .gitignore 済み。素材の権利条件が未確認のため、リポジトリには入れない。
// 使うのは街の背景と、女の子・アイボリーの歩行シート（横・斜め前・斜め後ろ・正面）と待機姿勢（5方向）、
// 仮の住民（名前のない一般住民）の立ち絵1枚（出どころ・確認結果は RES_SRC の1つ上の REPORT.md）。
// 出典は描画試作（feature/walk-ride-spike の render-spike/scripts/copy-art.mjs）と同じで、複製先の名前も同じ。
// 使い方：npm run art   （複製元は ART_SRC・DIAG_SRC・FRONT_SRC・RES_SRC で変更可）
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const SRC = process.env.ART_SRC || join(homedir(), "outputs/butterfly-art-prototype-02-walk-v2/assets");
const DIAG_SRC = process.env.DIAG_SRC || join(homedir(), "outputs/butterfly-diagonal-walk-02/assets");
const FRONT_SRC = process.env.FRONT_SRC || join(homedir(), "outputs/butterfly-direction-study-01/assets");
const RES_SRC = process.env.RES_SRC || join(homedir(), "outputs/butterfly-resident-placeholder-01/assets");
const DEST = new URL("../public/art/", import.meta.url).pathname;
// [複製元のフォルダ, 元のファイル名, 複製先の名前]
const FILES = [
  [SRC, "town"], [SRC, "girl-walk-base"],
  [DIAG_SRC, "girl-walk-se-base"], [DIAG_SRC, "girl-walk-ne-base"],
  [FRONT_SRC, "girl-walk-s-ivory-6", "girl-walk-s-base"],
  ...["s", "se", "e", "ne", "n"].map((d) => [FRONT_SRC, `girl-idle-${d}-ivory`, `girl-idle-${d}-base`]),
  [RES_SRC, "resident-a-candidate-2", "resident-a"]
];
const sha = (p) => createHash("sha256").update(readFileSync(p)).digest("hex");

mkdirSync(DEST, { recursive: true });
let bytes = 0;
for (const [dir, f, name = f] of FILES) {
  const from = join(dir, `${f}.png`), to = join(DEST, `${name}.png`);
  if (!existsSync(from)) { console.error(`見つかりません：${from}`); process.exit(1); }
  copyFileSync(from, to);
  if (sha(from) !== sha(to)) { console.error(`複製の検証に失敗：${f}`); process.exit(1); }
  bytes += readFileSync(to).length;
}
console.log(`${FILES.length}ファイルを複製し、SHA-256の一致を確認しました（合計 ${(bytes / 1048576).toFixed(1)}MB）：${DEST}`);
