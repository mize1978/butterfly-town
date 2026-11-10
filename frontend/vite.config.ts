import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

declare const process: { env: Record<string, string | undefined> }; // @types/node を入れずに環境変数だけ読む

// 開発サーバー：http://127.0.0.1:4200 。/api は Rails（Docker Compose の web、127.0.0.1:3100）へ中継する。
// 中継先は API_ORIGIN で変えられる
export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 4200,
    strictPort: true,
    proxy: { "/api": process.env.API_ORIGIN ?? "http://127.0.0.1:3100" }
  },
  test: {
    include: ["src/**/*.test.ts"], environment: "node",
    // カバレッジ（npm run coverage）。描画（Phaser）と画面（React）は単体テストの対象外なので、判断の部分（core・game・api）だけを数える
    coverage: { provider: "v8", include: ["src/core/**", "src/game/**", "src/api/**"], exclude: ["**/*.test.ts"], reporter: ["text-summary", "html"] }
  }
});
