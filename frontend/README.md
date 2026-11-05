# frontend（React + Phaser 4）

街の地図を Rails API（`GET /api/v1/town`）から受け取り、Phaser で街を描いて、長押しで歩けるようにしたもの。

## 起動

```sh
# 1. Rails（リポジトリ直下で）
docker compose up -d web                          # http://127.0.0.1:3100
docker compose run --rm web bin/rails db:prepare   # 初回のみ

# 2. フロントエンド
cd frontend
npm ci
npm run art   # 初回のみ。試作素材を ~/outputs から public/art へ複製（権利未確認のためリポジトリに入れない）
npm run dev   # http://127.0.0.1:4200 （/api は 127.0.0.1:3100 へ中継。API_ORIGIN で変更可）
```

検証：`npm run typecheck`、`npm test`。

## 構成

| 場所 | 役割 |
| --- | --- |
| `src/api/town.ts` | 街の地図の取得と形の検証。形が違えば描画を始めずにエラーを表示する |
| `src/core/` | 描画エンジンに依存しない処理（通行判定・移動・8方向・外見の解決・カメラ）。node で単体テストする |
| `src/game/session.ts` | 街の中の状態の正本（人物の移動・カメラ）。Phaser は毎フレームここを読むだけ |
| `src/render/PhaserTown.ts` | Phaser 4 での描画と入力。React から生成・破棄する |
| `src/ui/` | 画面（読み込み中・エラーと再読み込み・街） |

## 描画試作（feature/walk-ride-spike の render-spike）から持ってきたもの

- 通行判定・移動（加速 0.12 秒・減速 0.1 秒・最高速 140・1コマ 32）・8方向の判定・歩行シートの選び方と代用・待機姿勢へのクロスフェード・上下動・反転の規則。値は試作の修正後（みぜの試遊で合格）と同じ。
- 歩行コマの登録情報（`src/core/walk-anchors.json`）。女の子・アイボリーの分だけ。
- カメラは試作の比較案（1100×660 で人物を追う）、頭頂〜足裏の高さは 195。

持ってきていないもの：Canvas 版との比較、修正前の動き、調整スライダー、スクーター、着せ替え、検証用の窓口（`window.__spike`）。

## まだ扱わないこと

DBに保存する機能（ER図で設計してから）、AI住民、スクーター、認証、着せ替え。人物は女の子・アイボリー衣装だけ。
