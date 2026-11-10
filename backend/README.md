# backend（Rails API）

Butterfly Town の API。開発・テストは Docker Compose で動かす（リポジトリ直下で実行）。

```sh
docker compose up -d web      # http://127.0.0.1:3100
docker compose run --rm web bin/rails db:prepare   # 初回のみ
docker compose run --rm -e RAILS_ENV=test web bin/rails test
```

## API

| メソッド | パス | 内容 |
| --- | --- | --- |
| GET | `/up` | 起動確認 |
| GET | `/api/v1/town` | 街の地図の定義（大きさ・背景・歩ける範囲・手前の植栽・出現位置）。DBには保存しない固定データ（`app/models/town_map.rb`） |

DBに保存する機能（進行・衣装・セーブなど）は、ER図で設計してから実装する。
