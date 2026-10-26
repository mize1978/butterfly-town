// 検証結果がどの版のコードで作られたかを記録する。
// git の HEAD と、未コミットを含むローカルファイル（ソース・e2e・設定・依存の固定・素材）の SHA-256。
// 試験の開始時と終了時に計算し、途中でファイルが変わっていないことを確かめる。配信元（開発サーバー）との照合はしていない。
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("../", import.meta.url).pathname;
function files(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? files(p) : [p]; });
}
export function provenance() {
  const list = [
    ...files(join(ROOT, "src")), ...files(join(ROOT, "e2e")).filter((p) => p.endsWith(".mjs")), ...files(join(ROOT, "public/art")),
    ...["package.json", "package-lock.json", "index.html", "vite.config.ts", "tsconfig.json"].map((f) => join(ROOT, f))
  ].sort();
  const h = createHash("sha256");
  for (const p of list) { h.update(relative(ROOT, p)); h.update(readFileSync(p)); }
  let head = "不明";
  try { head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT }).toString().trim(); } catch { /* git なし */ }
  return { gitHead: head, sha256: h.digest("hex"), files: list.length, scope: "src・e2e・public/art・設定と依存の固定（ローカルファイル）", at: new Date().toISOString() };
}
