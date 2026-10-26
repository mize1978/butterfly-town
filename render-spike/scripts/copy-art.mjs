// 試作素材を ~/outputs から public/art へ複製する（元の素材は読むだけで変更しない）。
// public/art は .gitignore 済み。素材の権利条件が未確認のため、リポジトリには入れない。
// 使い方：node scripts/copy-art.mjs   （複製元は ART_SRC で変更可）
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const SRC = process.env.ART_SRC || join(homedir(), "outputs/butterfly-art-prototype-02-walk-v2/assets");
const DEST = new URL("../public/art/", import.meta.url).pathname;
const FILES = ["town", ...["girl", "boy"].flatMap((c) => ["base", "alt"].flatMap((o) => [`${c}-${o}`, `${c}-walk-${o}`, `${c}-ride-${o}`]))];
const sha = (p) => createHash("sha256").update(readFileSync(p)).digest("hex");

mkdirSync(DEST, { recursive: true });
let bytes = 0;
for (const f of FILES) {
  const from = join(SRC, `${f}.png`), to = join(DEST, `${f}.png`);
  if (!existsSync(from)) { console.error(`見つかりません：${from}`); process.exit(1); }
  copyFileSync(from, to);
  if (sha(from) !== sha(to)) { console.error(`複製の検証に失敗：${f}`); process.exit(1); }
  bytes += readFileSync(to).length;
}
console.log(`${FILES.length}ファイルを複製し、SHA-256の一致を確認しました（合計 ${(bytes / 1048576).toFixed(1)}MB）：${DEST}`);
