# Butterfly Town ER図

MVP（README「7-2. MVPの完成範囲」）で使うテーブルの設計です。全体図1枚と詳細図3枚に分けています。画像をクリックすると原寸で開きます。

| 図 | 内容 | 画像 |
| --- | --- | --- |
| 全体図 | 16テーブルと関連線（列は載せない） | [er-overview.png](er/er-overview.png) |
| 図A アカウントと引継ぎ | `users`・`sessions`・`guests`・`playthroughs`・`playthrough_claims` | [er-A.png](er/er-A.png) |
| 図B 街の中身 | `residents`・`memories`・`world_events`・`relationships`・`conversation_messages`・`repair_jobs`・`collected_parts`・`vehicles` | [er-B.png](er/er-B.png) |
| 図C 時間帯とAI予算 | `time_slot_runs`・`ai_calls`・`ai_budget_months` | [er-C.png](er/er-C.png) |

図の読み方：

- 各テーブルの列は、どれか1枚の詳細図にだけ載せています。ほかの図に出てくるときは「（再掲・列は図X）」と書き、`id` だけを載せています。
- 別の図にあるテーブルを指す外部キーは、列の注記に「→ テーブル名（列は図X）」と書いています。
- `UK` は一意制約です。複数列や条件つきの一意制約は、列の注記に書いています。
- `created_at`・`updated_at` はすべてのテーブルに持たせます。`saved_at`・`claimed_at` など用途のある日時は別の列です。

## 全体図

![全体図](er/er-overview.png)

## 図A アカウントと引継ぎ

![図A アカウントと引継ぎ](er/er-A.png)

## 図B 街の中身

![図B 街の中身](er/er-B.png)

## 図C 時間帯とAI予算

![図C 時間帯とAI予算](er/er-C.png)

## テーブルの役割

| テーブル | 役割 |
| --- | --- |
| `users` | 登録ユーザー。メールアドレスとパスワードでログインする |
| `sessions` | ログイン中の端末 |
| `guests` | 登録不要のゲスト。Cookie の値はハッシュだけを保存する |
| `playthroughs` | 1回のプレイ（街）。セーブの単位。ゲストの街も登録ユーザーの街もここに置く |
| `playthrough_claims` | ゲストの街を登録ユーザーへ引き継いだ記録。引継ぎ後も元のゲストを残す |
| `residents` | 街ごとのAI住民3人。いる場所・計画・目標の進捗 |
| `memories` | 住民ごとの知識・記憶。AIに渡すのは、その住民の行だけ |
| `world_events` | 実際に成立した出来事（誘う・伝える・断る・特殊介入など） |
| `relationships` | 住民どうし・住民とプレイヤーの関係。結果画面の振り返りに使う |
| `conversation_messages` | 通常会話の発言。発言そのものは出来事として扱わない |
| `time_slot_runs` | 時間帯ごとのAI処理。1つの街の1つの時間帯につき1行 |
| `repair_jobs` | バイク屋の修理依頼（1つの街に1件） |
| `collected_parts` | 取得した部品 |
| `vehicles` | 修理で手に入れたスクーター（1つの街に1台）。行があること＝解放済み。状態・位置・向き |
| `ai_calls` | AI呼び出し1回ごとの記録。呼ぶ前に最大額を予約し、応答後に精算する |
| `ai_budget_months` | 月ごとのAI予算 |

住民の人格・目標の定義・初期の記憶、衣装・部品の一覧、ミッションの条件、地図、AIの単価表は、テーブルではなく設定ファイル（`backend/config/`）に置きます。DBには設定ファイルのキーを文字列で保存します。住民・車両そのものの設定キーは `residents.key`・`vehicles.key`、別の対象を指すキーは `mission_key`・`part_key` のように対象名を付けます。

## 図だけでは伝わらない決まり

### 街の持ち主は、ユーザーかゲストのどちらか一方

- `playthroughs` の CHECK 制約：`(user_id IS NULL) <> (guest_id IS NULL)`。両方が空、両方が入っている、のどちらも DB が拒否します。
- `ai_calls` の `user_id`・`guest_id` には、呼び出した時点の持ち主を入れます。引継ぎの後も、引継ぎ前の呼び出しはゲストの利用として数えられます。

### 一意制約

| 対象 | 制約 |
| --- | --- |
| `users.email` | 小文字に正規化して一意 |
| `guests.token_digest` | 一意 |
| `playthroughs(user_id, mission_key)` | `status = 'in_progress'` の行だけを対象にした部分一意インデックス。同じミッションの進行中の街は1ユーザーに1つ |
| `playthroughs(guest_id, mission_key)` | 同じく `status = 'in_progress'` の行だけを対象にした部分一意インデックス。ゲストも同じミッションの進行中の街は1つ（#7 で追加。開始が同時に届いても街を2つ作らない） |
| `playthrough_claims.playthrough_id` | 一意。1つの街は1回だけ引き継げる |
| `playthrough_claims.request_id` | 一意。同じ引継ぎの再送を見分ける |
| `time_slot_runs(playthrough_id, time_index)` | 一意。やり直しても行を増やさない |
| `time_slot_runs(playthrough_id)` | `status = 'running'` の行だけを対象にした部分一意インデックス。処理中の時間帯は街に1つだけ |
| `ai_calls(playthrough_id)` | `purpose = 'conversation'` かつ `applied = 'pending'` の行だけを対象にした部分一意インデックス。返答待ちの会話は街に1つだけ |
| `ai_calls.request_id` | 一意 |
| `ai_budget_months.month` | 一意（`YYYY-MM`） |
| `residents(playthrough_id, key)`、`memories(resident_id, fact_key)`、`world_events(playthrough_id, command_id)`、`relationships(playthrough_id, from_key, toward_key)`、`collected_parts(playthrough_id, part_key)` | 一意。同じ住民・同じ記憶・同じ出来事などを二重に作らない |
| `repair_jobs.playthrough_id`、`vehicles.playthrough_id` | 一意。1つの街に1件・1台 |

### ゲストから登録への引継ぎは、全部反映するか何も反映しないか

- 登録・ログインしたユーザーに進行中の街がなければ、ゲストの街の持ち主をユーザーに付け替えます。
- 進行中の街がある場合は、確認画面（S24）で本人が選ぶまで、どちらの街も変えません。ゲストの街を選んだときは、次の3つを**1つのトランザクション**で行います。途中で失敗したら、すべて取り消します。
  1. 既存の街を `shelved`（保管）にする。中身には触らない。
  2. ゲストの街の持ち主をユーザーに付け替える。
  3. `playthrough_claims` に記録する。
- 関係する街の行は、`id` の小さい順にロック（`SELECT … FOR UPDATE`）します。
- 同じ `request_id` の再送や二度押しには、何も変えずに「引継ぎ済み」を返します。
- 時間帯の処理中と、会話の返答待ちの間は、引継ぎを受け付けません。
- 既存の街は、確認なしに上書き・統合・削除しません。2つの街のデータを混ぜる処理も作りません。

### 時間帯の処理と会話の返答

- `playthroughs.time_index` は、いまプレイヤーの番になっている時間帯（0〜14）です。開始時は0で、確定するたびに1増えます。最後の時間帯を確定すると `finished` になります。
- 時間帯の処理をやり直すときは、同じ行の `attempt` を1増やします。AIの返答は、`attempt` がいまの値と同じで、返答待ち（`applied = pending`）のときだけ反映します。前の試行の遅れた返答では、いまの試行を止めません。
- `state_version` は、AIに渡す状態が変わったときだけ増やします。AIの案は、作ったときの版と反映するときの版が同じときだけ反映します。
- 会話の返答も、返答待ちのもので、会話を始めたときの時間帯・版と同じときだけ反映します。

### AIの予算

- 金額は「100万分の1円」の整数で、`bigint` で持ちます。
- 呼ぶ前に、その呼び出しで起こり得る最大額を `ai_budget_months` に予約します。上限を超える呼び出しはしません。
- 結果が分からない呼び出し（タイムアウトなど）は、予約額の全額を使ったものとして数え、自動では呼び直しません。
- 月の行は「使った額＋予約中の額＋今回の最大額」が `limit_micro_yen`（新しい呼び出しを止める額、月2,000円）を超えないときだけ予約します。月の区切りは日本時間（毎月1日 0:00）です。
- `ai_calls.user_id` の外部キーは、`users` を作るとき（#16）に足します。

## 未決定のこと

図は次の置き方で描いています。値や方式が決まったら、図とこの文書を直します。

| 項目 | 図での置き方 |
| --- | --- |
| ゲストの保持期間 | `guests.expires_at` を持つ。期間の値は未決定 |
| ゲストのAI利用制限 | `ai_calls.guest_id` で回数・金額を数えられる形にした。制限の値は未決定 |
| 保存枠の数 | 同じミッションの進行中の街は1ユーザーに1つ。保管した街の数は制限しない |
| 保管した街の再開・削除 | `status = shelved` で残す。再開の画面と削除は未決定 |
| 衣装の解放 | 解放の表は作らず、着用中の衣装（`outfit_key`）だけを保存する。解放の方式は未決定 |
| 関係性の持ち方 | 値（`affinity`）とひとこと（`note`）。振り返り画面の内容が決まったら見直す |
| メールアドレス変更の確認 | `unconfirmed_email` に入れ、確認後に `email` へ移す |
| AI呼び出しの自動再試行の上限 | 未決定 |
| 予約額に使う為替の値 | 暫定値の1ドル150円で計算する（2026-11-13）。見直す時期・条件は未決定 |
| 請求の月とのずれ | こちらの月は日本時間、Anthropic の請求の月は UTC で、9時間ずれる。月をまたぐ9時間に使った分は、台帳と請求で別の月に入る。約1,000円の予備で吸収できるかは未確認 |

## 編集用Mermaid

画像は下の Mermaid から作っています（mermaid-cli、2倍の解像度）。図を直すときは、ここを直してから画像を作り直します。

### 全体図（テーブルと関連線）

```mermaid
erDiagram
  direction LR
  users ||--o{ sessions : "ログイン中の端末"
  users |o--o{ playthroughs : "登録ユーザーの街"
  guests |o--o{ playthroughs : "ゲストの街"
  playthroughs ||--o| playthrough_claims : "引き継いだゲストの街"
  playthroughs |o--o{ playthrough_claims : "保管した既存の街"
  guests ||--o{ playthrough_claims : "引継ぎ元"
  users ||--o{ playthrough_claims : "引継ぎ先"
  playthroughs ||--|{ residents : "AI住民3人"
  residents ||--o{ memories : "本人が知っていること"
  playthroughs ||--o{ world_events : "成立した出来事"
  world_events |o--o{ world_events : "きっかけ"
  world_events |o--o{ memories : "記憶の出どころ"
  playthroughs ||--o{ relationships : "関係性"
  playthroughs ||--o{ conversation_messages : "会話の発言"
  playthroughs ||--o{ time_slot_runs : "時間帯ごとの処理"
  playthroughs ||--o| repair_jobs : "修理依頼"
  playthroughs ||--o{ collected_parts : "取得した部品"
  playthroughs ||--o| vehicles : "スクーター"
  playthroughs |o--o{ ai_calls : "AI呼び出し"
  time_slot_runs |o--o{ ai_calls : "時間帯の処理での呼び出し"
  ai_calls |o--o{ conversation_messages : "発言を生成した呼び出し"
  guests |o--o{ ai_calls : "呼び出した時点の持ち主"
  users |o--o{ ai_calls : "呼び出した時点の持ち主"
  ai_budget_months ||--o{ ai_calls : "月の予算"
```

### 図A アカウントと引継ぎ

```mermaid
erDiagram
  direction TB
  users ||--o{ sessions : "ログイン中の端末"
  users |o--o{ playthroughs : "登録ユーザーの街（user_id）。ゲストとどちらか一方"
  guests |o--o{ playthroughs : "ゲストの街（guest_id）。ユーザーとどちらか一方"
  playthroughs ||--o| playthrough_claims : "引き継いだゲストの街（playthrough_id・最大1回）"
  playthroughs |o--o{ playthrough_claims : "保管した既存の街（shelved_playthrough_id）"
  guests ||--o{ playthrough_claims : "引継ぎ元（guest_id）"
  users ||--o{ playthrough_claims : "引継ぎ先（user_id）"

  users {
    bigint id PK
    string email UK "小文字に正規化して一意"
    string password_digest
    string unconfirmed_email "変更確認中の新しいアドレス"
    datetime created_at
    datetime updated_at
  }
  sessions {
    bigint id PK
    bigint user_id FK
    string ip_address
    string user_agent
    datetime created_at
    datetime updated_at
  }
  guests {
    bigint id PK
    string token_digest UK "Cookieの値のハッシュ"
    datetime expires_at "保持期間（値は未決定）"
    datetime last_seen_at
    datetime created_at
    datetime updated_at
  }
  playthroughs {
    bigint id PK
    bigint user_id FK "どちらか一方だけ（CHECK）"
    bigint guest_id FK "どちらか一方だけ（CHECK）"
    string mission_key "festival（MVPは1本）"
    string status "in_progress/shelved/finished/abandoned。進行中はUK(user_id, mission_key)の部分一意"
    integer time_index "いまプレイヤーの番の時間帯 0〜14（開始時は0）"
    integer interventions_used "0〜3（CHECK）"
    integer state_version "AIに渡す状態が変わったときだけ+1"
    integer festival_progress
    string result "success/failure（終了時）"
    string character_key
    string outfit_key "着用中の衣装"
    float player_x
    float player_y
    datetime position_saved_at
    datetime saved_at "最後に保存を確かめた日時"
    datetime finished_at
    datetime created_at
    datetime updated_at
  }
  playthrough_claims {
    bigint id PK
    bigint playthrough_id FK,UK "1つの街は1回だけ引き継げる"
    bigint guest_id FK "引継ぎ元（引継ぎ後も残る）"
    bigint user_id FK
    bigint shelved_playthrough_id FK "保管した既存の街（あれば）"
    string request_id UK
    datetime claimed_at
    datetime created_at
    datetime updated_at
  }
```

### 図B 街の中身

```mermaid
erDiagram
  direction LR
  playthroughs ||--|{ residents : "AI住民3人"
  residents ||--o{ memories : "本人が知っていること"
  playthroughs ||--o{ world_events : "成立した出来事"
  world_events |o--o{ world_events : "きっかけ（cause_id）"
  world_events |o--o{ memories : "記憶の出どころ（source_event_id）"
  playthroughs ||--o{ relationships : "関係性"
  playthroughs ||--o{ conversation_messages : "会話の発言"
  playthroughs ||--o| repair_jobs : "修理依頼（1件）"
  playthroughs ||--o{ collected_parts : "取得した部品"
  playthroughs ||--o| vehicles : "スクーター（1台）"
  ai_calls |o--o{ conversation_messages : "発言を生成した呼び出し（ai_call_id）"

  residents {
    bigint id PK
    bigint playthrough_id FK
    string key "UK(playthrough_id, key)"
    string location_key
    jsonb current_plan "次の時間帯以降も続ける計画"
    integer plan_time_index
    jsonb goal_progress "目標の進捗（目標の定義は設定ファイル）"
    datetime created_at
    datetime updated_at
  }
  memories {
    bigint id PK
    bigint resident_id FK
    string fact_key "UK(resident_id, fact_key)"
    text content
    text interpretation
    string source "witnessed/told/initial"
    integer acquired_time_index
    bigint source_event_id FK
    datetime created_at
    datetime updated_at
  }
  world_events {
    bigint id PK
    bigint playthrough_id FK
    string command_id "UK(playthrough_id, command_id)"
    string kind "invite/tell/refuse/intervention…"
    string actor_key "住民キー または player"
    string target_key
    integer time_index
    bigint cause_id FK
    string fact_key
    jsonb payload
    datetime created_at
    datetime updated_at
  }
  relationships {
    bigint id PK
    bigint playthrough_id FK
    string from_key "UK(playthrough_id, from_key, toward_key)"
    string toward_key "ER図の初版では to_key（Active Record のメソッド名とぶつかるため変更）"
    integer affinity
    string note
    datetime created_at
    datetime updated_at
  }
  conversation_messages {
    bigint id PK
    bigint playthrough_id FK
    integer time_index
    string speaker_key
    string listener_key
    text body
    bigint ai_call_id FK "→ ai_calls（列は図C）"
    datetime created_at
    datetime updated_at
  }
  repair_jobs {
    bigint id PK
    bigint playthrough_id FK,UK
    string status "offered/accepted/parts_ready/repaired"
    integer puzzle_attempts
    datetime repaired_at
    datetime created_at
    datetime updated_at
  }
  collected_parts {
    bigint id PK
    bigint playthrough_id FK
    string part_key "UK(playthrough_id, part_key)"
    integer collected_time_index
    datetime created_at
    datetime updated_at
  }
  vehicles {
    bigint id PK
    bigint playthrough_id FK,UK
    string key "scooter"
    string state "parked/riding"
    float x
    float y
    float heading
    datetime created_at
    datetime updated_at
  }
  playthroughs["playthroughs（再掲・列は図A）"] {
    bigint id PK
  }
  ai_calls["ai_calls（再掲・列は図C）"] {
    bigint id PK
  }
```

### 図C 時間帯とAI予算

```mermaid
erDiagram
  direction TB
  playthroughs ||--o{ time_slot_runs : "時間帯ごとの処理"
  playthroughs |o--o{ ai_calls : "AI呼び出し（開発検証は街なし）"
  time_slot_runs |o--o{ ai_calls : "時間帯の処理での呼び出し"
  ai_calls |o--o{ conversation_messages : "発言を生成した呼び出し（ai_call_id）"
  guests |o--o{ ai_calls : "呼び出した時点の持ち主（guest_id）"
  users |o--o{ ai_calls : "呼び出した時点の持ち主（user_id）"
  ai_budget_months ||--o{ ai_calls : "月の予算（ai_budget_month_id）"

  time_slot_runs {
    bigint id PK
    bigint playthrough_id FK "処理中は街に1つだけ（部分一意）"
    integer time_index "UK(playthrough_id, time_index)。やり直しも同じ行"
    string status "running/confirmed/suspended/failed"
    integer attempt "いまの試行番号（1から。試行を始めるたびに+1）"
    integer base_state_version "いまの試行を始めたときの版"
    string suspend_reason "budget/network/unknown_result/version_mismatch"
    datetime created_at
    datetime updated_at
  }
  ai_calls {
    bigint id PK
    bigint playthrough_id FK "開発検証などは空"
    bigint time_slot_run_id FK "時間帯の処理での呼び出し（会話は空）"
    integer attempt "呼び出した時点の試行番号"
    integer base_state_version "呼び出した時点の版"
    integer base_time_index "呼び出した時点の時間帯"
    string applied "pending/applied/discarded（返答を反映したか）"
    bigint guest_id FK "呼び出した時点の持ち主（ゲスト）"
    bigint user_id FK "呼び出した時点の持ち主（登録ユーザー）"
    bigint ai_budget_month_id FK "→ ai_budget_months.id"
    string request_id UK
    string purpose "decision/conversation/summary/dev"
    string status "reserved/succeeded/failed/unknown"
    string price_version "使った単価表の版"
    integer input_tokens_counted "呼ぶ前に数えた入力"
    integer max_output_tokens "APIに渡す出力の上限"
    bigint reserved_cost_micro_yen "最大額"
    bigint actual_cost_micro_yen
    integer input_tokens
    integer output_tokens
    datetime created_at
    datetime updated_at
  }
  ai_budget_months {
    bigint id PK
    string month UK "YYYY-MM"
    bigint limit_micro_yen "新しい呼び出しを止める額"
    bigint reserved_micro_yen
    bigint spent_micro_yen
    datetime created_at
    datetime updated_at
  }
  users["users（再掲・列は図A）"] {
    bigint id PK
  }
  guests["guests（再掲・列は図A）"] {
    bigint id PK
  }
  playthroughs["playthroughs（再掲・列は図A）"] {
    bigint id PK
  }
  conversation_messages["conversation_messages（再掲・列は図B）"] {
    bigint id PK
  }
```
