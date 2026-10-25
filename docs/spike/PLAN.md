# 3人のAI住民・技術試作準備

状態（2026-10-25更新）：Spike 01（固定応答による3人の検証）を実装し、PostgreSQL上の自動テストで検証済み。
実LLM判断、React/Phaser、状態版による古い判断の検出は未実施。結果は末尾「Spike 01 実施結果」を参照。
READMEレビューによって変更する。README PRはLGTMまでマージしない。

## 作業場所と境界

- ブランチ：feature/three-resident-spike（main起点）。
- 作業場所：このリポジトリの git worktree。本文中のパスはリポジトリ直下からの相対表記（例：`backend/`、`docs/spike/`）。
- README側：同じリポジトリの別 worktree、feature/readme。変更しない。
- この試作の成果は本番機能の完成を意味しない。Push、PR、デプロイは未実施。

## 確認したローカル環境（2026-10-25）

- シェルからのruby：2.6.10。
- rbenv管理のRuby（ホスト）：3.4.10。
- node：26.5.0、psqlクライアント：16.15。
- DBサーバー稼働、Rails/gem互換性、Nodeの採用版、各依存の保守期限は未確認。
- グローバル設定は変更していない。着手時にプロジェクト単位でRubyを選択し、対応版を確認して固定する。
- 追記（Spike 01）：Rails/PostgreSQLはDocker Compose内で実行し、ホストのRuby・PostgreSQLは変更していない。
  採用版と理由は「Spike 01 実施結果」に記録。Nodeの採用版は未確認のまま。

## 開発環境の構成案

backend/ にRails、frontend/ にReact + TypeScript + Viteを置くモノレポを候補とする。
TypeScriptはイベント契約を明示するための試作候補であり、正式採用は未決定。
開発時はViteから/apiをRailsへプロキシし、ブラウザから同一オリジンに見せる。
本番配信と認証は別途決定する。AI APIキーはRails側のみ。ブラウザへ渡さない。

- Rails：世界の正本、観測制御、行動候補、検証、確定イベント、時間、進捗。
- React：選択住民、会話、介入、ステップ処理中表示。
- Phaser：確定済み位置の描画と移動演出。移動アニメ完了で世界の時間を進めない。
- LLM：本人が知る情報から実行可能な行動を提案。DBへ直接書き込まない。

最初は固定応答で1ステップの状態遷移を確認し、その後実LLMを差し込む。
Active Jobを呼び出し境界に使う案。Solid Queueなどの実行基盤と版は未決定。
初期画面更新は状態取得でよく、WebSocketは必要性が分かってから判断する。
依存導入前に対応バージョンを確認し、Gemfile.lockとpackage-lock.jsonで固定する。

## データ構造案

JSONは保存方式の確定ではなく、検証用の共通入力。
（Spike 01で、試作用に simulation_runs / confirmed_events / memories のマイグレーションを作成した。
下表のうち実装したのは Memory と、Event・ResidentState の一部のみ。表全体は引き続き設計案。）

| 概念 | 主要情報 | 意味 |
| --- | --- | --- |
| ResidentDefinition | id, personality, goals, routine | 初期定義。住民ごとに判断理由を変える |
| ResidentState | run_id, resident_id, location, current_goal | 各プレイ固有の状態 |
| Event | id, step, participants, observers, type, payload | 成立した世界の出来事 |
| Memory | owner, source_event_id, acquired_step, source, interpretation | 誰がどう知ったかと主観。世界の真実と分離 |
| Relationship | run_id, from, to, trust, affinity | A→BとB→Aを分離。数値は後日調整 |
| SimulationStep | run_id, step, state_version, status | 二重実行・古い結果の反映を防ぐ |
| DecisionAttempt | input_memory_ids, action, response, model, usage, latency | 調査・比較・再生用。内的思考全文は要求しない |

入力には当人の記憶と観測できた出来事だけを含める。fixtures全体をLLMへ渡さない。
伝聞は元イベント、伝えた人物、聞いた人物、伝わった時点をひもづける。
未確定の発話を事実にしない。情報伝達が成立した場合に受け手の記憶を作る。

## 3人の仮シナリオ

fixtures/spike/three_residents.json を使用。人物・事情は試作専用の架空設定。
A：祭りの準備担当。Bが昨年欠席した記憶を持ち、約束を重視。
B：店番と協力を両立したい。昨年の欠席事情をAに説明できていない。
C：事情を知る共通知人。協力を望むが、他人の秘密も守りたい。

想定する一例：CがAへ事情の一部を伝える→AがBへ相談する→Bが店番に合う協力案を出す。
この経路へ誘導して成功させるテストにはしない。秘密を明かさず仲介する選択も許容する。

## 1ステップの責務

1. 開始時点の状態版を取得し、実行権を短いトランザクションで確保。
2. 観測・記憶を住民ごとに抽出し、実行可能な行動候補を作る。
3. LLMへ問い合わせる。API待機中にDBロックを保持しない。
4. ID、行動種別、場所、時点、情報の保有範囲を検証。
5. 誘いに対する相手の判断を解決。誘っただけで参加扱いにしない。
6. 状態版の一致を確認して、成立イベント・記憶・進捗を原子的に反映。
7. 確定結果をReact/Phaserへ返す。

run_id+stepの一意制約と適用済み識別子を検討。外部API呼び出しの重複費用までは
DB制約で防げないため、採用済み応答の保存、呼び出し上限、再試行上限も別に必要。
再現は乱数シードだけに依存せず、確定イベントと採用応答を保存する。

## 検証表（実LLMでの検証はすべて未実施。固定応答での結果は末尾「Spike 01 実施結果」）

| 検証 | 比較と判定 | 保存する証拠 |
| --- | --- | --- |
| 記憶 | 同じ状態で関連記憶だけを変え、各条件を複数回実行。行動分布と根拠参照の傾向を比較 | 条件、選択、参照ID、モデル・プロンプト版 |
| 人格・目標 | 日課と選択肢を揃えて人格/目標を一つずつ変更。断り・代案も記録 | 変更点と全試行結果 |
| 知識境界 | 伝聞前に秘密が入力へ混入しない。伝聞成立後のみ受け手の記憶が増える | 住民別入力と記憶差分 |
| 情報伝播 | 会話前後を比較し、受け手の次の判断で伝聞記憶が利用されるか | 元イベント→会話→受け手記憶→判断の参照 |
| 行動成立 | 存在しない相手、場所違い、拒否された誘い、秘密の無権限参照を拒否 | 検証エラーと状態不変の確認 |
| 復帰 | 同一適用の再実行・タイムアウト・古い版の結果で二重進捗が発生しない | 適用回数、状態版、再開結果 |
| 費用・時間 | 固定した入力長・出力上限・反復回数で実測 | 呼び出し数、tokens、料金表日付、p50/p95、失敗率 |

実LLMの初期比較は例として各条件10回から始め、実行前に上限と料金を決める。
少数試行で一般的な有効性は断定しない。後付けの理由文だけを因果の証拠にしない。
偽LLMはルール検証に使い、自律判断の品質が確認できたとは扱わない。

## ReactとPhaserの連携調査

公式React/TypeScriptテンプレートにはPhaserGameコンポーネントとEventBusがある。
2026-10-25参照時、READMEの版一覧はPhaser 4、説明の一部はPhaser 3と表記が異なる。
採用前にpackage.jsonとAPIの互換性を確認し、mainを無指定で取り込まない。
テンプレートのlog.jsは利用情報送信を含むため、採用時はnologスクリプトか除去を選ぶ。

候補の境界：
- resident-selected：Phaser→React。画面上の住民選択だけ。
- world-snapshot：React→Phaser。Railsから受け取った確定状態とstate_version。
- action-request：React→Rails。PhaserからDB更新を決めない。

小マップ検証：Reactマウント時のGame生成、アンマウント時の破棄と購読解除、
StrictMode/HMRでCanvasやイベント購読が二重にならないことを実ブラウザで確認。
3人の仮図形のクリック、移動、会話パネル表示を検証し、古いスナップショットを適用しない。
ReactとPhaserの両方に独立した世界状態を持たせない。

## みぜが説明するための設計判断記録

各判断を「問題／候補／選んだ理由／負担／検証結果／再検討条件」で残す。
初期案：世界の正本をRailsへ集約する。理由は表示・生成と勝敗の整合性を分離するため。
負担は通信と状態同期。検証は古い応答・再送の再現。方式は試作結果で見直す。
説明確認：なぜAIにDB更新を任せないか、なぜ住民ごとの知識が必要か、
なぜReactとPhaserに世界の正本を二重に持たせないかを、自分の言葉で説明する。

## 次の着手順

1. Ruby/Rails/Node/Phaserの採用候補版と保守状況を確認し、環境を固定。（Ruby/Rails/PostgreSQLは実施済み。Node/Phaserは未実施）
2. 固定応答で観測抽出・行動検証・状態反映を実装し異常系を確認。（Spike 01で実施済み。未解決事項あり）
3. API提供元と試行予算を決め、実LLMの条件比較を実行。
4. 小マップでReact/Phaser連携を実ブラウザ検証。
5. 結果をREADMEレビュー内容と合わせ、MVPの範囲とIssueを見積もる。

## 一次資料

- https://github.com/phaserjs/template-react-ts （連携の設計参考。版・実装の互換性は未検証）
- https://guides.rubyonrails.org/active_job_basics.html （ジョブ境界の参考）
- https://vite.dev/guide/ （React用開発・ビルド環境の候補）
- https://endoflife.date/rails 、https://endoflife.date/ruby 、https://endoflife.date/postgresql （2026-10-25参照。サポート期限の確認）

## Spike 01 実施結果（2026-10-25）

固定応答（偽LLM）での検証。実LLMの自律判断の品質は確認していない。

### 環境

| 項目 | 採用版 | 理由 |
| --- | --- | --- |
| Ruby | 3.4.10（Docker: ruby:3.4.10-slim） | 既存の.ruby-versionどおり。3.4系のEOLは2028-03-31。最新パッチは3.4.12（未更新） |
| Rails | 8.1.4 | 既存の8.1.3.1は、ロック済みのjson 3.1.0と組み合わせるとActiveSupport::JSON.decodeが失敗し、PostgreSQLのjson列のスキーマ出力が壊れた。8.1.4で修正済みのため同じ8.1系のパッチ版へ更新。8.1系のセキュリティ修正は2027-10-10まで |
| PostgreSQL | 17.11（postgres:17.11-bookworm） | 17系のEOLは2029-11-08 |
| pg gem | 1.7.0 | SQLite3 gemから置き換え |
| crass（Railsの間接依存） | 1.0.8 | bundler-audit 0.9.2 で 1.0.7 に GHSA-pq4g-8rxf-4g29 を検出したため、Gemfile.lock でこのgemだけ更新。更新後の bundler-audit は「No vulnerabilities found」（ruby-advisory-db 2026-10-23版） |

- 実行：`docker compose run --rm web bin/rails test`（リポジトリ直下）。
- ホストの5432（PostgreSQL）と3000（別プロジェクト）が使用中のため、DBはホストへ公開せず、Railsは127.0.0.1:3100のみ公開。

### 構成（AIの判断とRailsの成立判定の分離）

- `ResidentContext`：本人の記憶のうち、現在のstepまでに得たものだけを入力にする。世界全体・他人の記憶は含めない。
- `FixedResponder`：実LLMの代わり。入力のHashだけを読み、`fixtures/spike/fixed_responses.json` のルールで行動案（actor / action_type / target / params）を返す。DBに触れない。
- `FixedActionProcessor`：Rails側の成立判定。行動案をコマンドに変換し、住民・step・場所・因果・記憶の保有を検証してから、確定イベント・記憶・進捗を1つのロック／トランザクション内で反映する。
- `SpikeScenario`：`three_residents.json` から試行と初期記憶を作る。

### 検証状況

| 検証 | 状態 | 内容 |
| --- | --- | --- |
| ① 記憶による行動分岐 | 検証済み（固定応答） | 同じ場面で、Aの記憶なし→continue_routine、e1のみ→consult、e1+e2→invite |
| ② 情報伝播 | 検証済み | 伝達前のAの入力に秘密が無い。Aは知らない事実を伝えられない。C→Aの伝達成立時のみAの記憶が作られる（source=told。source_eventは今回成立したtoldイベントを参照し、元の事情とはfact_key=e2で対応する）。場所違い・未知の相手・未取得の記憶は拒否 |
| ③ 行動成立 | 検証済み | 誘い・承諾・作業は別イベント。作業でのみ進捗+1。同じコマンドの再送、別IDでの再作業、同時実行（別DB接続4本）でも一度だけ反映 |
| 不成立時の状態不変 | 検証済み | 拒否時にイベント数・記憶・進捗が変わらないことを確認 |
| 状態版による古い判断の検出 | 未実施 | stepの一致のみ確認。同じstep内で状態が変わった後の古い行動案は検出できない |
| B の固定応答 | 未実施 | Bの承諾・作業はテストでコマンドを直接作成。入力に「自分宛ての誘い」を含める設計が必要。このため「3人が固定応答だけで一連の行動を完結した」とは言えない |
| consult / continue_routine の成立判定 | 未実施 | 固定応答としては返すが、Rails側は未対応として拒否する |
| move | 未実施 | 固定応答・成立判定とも未実装 |
| 実LLM・費用・応答時間 | 未実施 | |
| React / Phaser 連携 | 未実施 | frontend/package.json は未変更・未インストール |

### テスト結果（実測）

- `bin/rails test`：26 runs, 100 assertions, 0 failures, 0 errors, 0 skips（PostgreSQL 17.11）。
- 同時実行テストは5回連続で成功。実行後、テストDBに残ったデータは0件。
- 接続プールを2に絞った異常条件では、同時実行テストは停止せず「準備できないスレッドがある」として失敗し、データも残らないことを確認。
- 処理が待機期限（親10秒＋終了待ち10秒）を超える異常条件（一時的に処理開始を30秒遅らせ、kill前後にログを出す変更）では、
  kill → スレッド側のensure完了 → join後に終了済み（alive=false）→ teardown時の接続プール使用中0、の順を確認し、データも残らなかった。
  （15秒遅延での初回確認はkill経路を通っていなかったため、監査の指摘を受けて30秒でやり直した。）
- 主要な検証を外す変更（知らない事実の伝達チェック削除、受け手既知チェック削除、承諾で進捗加算、ロック削除、取得時点の無視）を一時的に加え、該当テストが失敗することを確認後、元に戻した。
- 上記の実行結果：`docs/spike/spike01-test-evidence.log`

### 既知の制約

- 試作ルールとして、plazaでのsetup作業は1単位のみ（進捗が1になったら以降の作業は拒否）。
- 確定イベントは cause_id で互いに参照するため、SimulationRun の削除時は新しいイベントから消す必要がある（`dependent: :destroy` だけでは外部キー違反になり得る）。
