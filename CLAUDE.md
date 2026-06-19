# C Programming Lab

## プロジェクト概要
C言語専用のプログラミング演習・自動採点プラットフォーム。
大学の授業（学生数十人規模）での使用を想定。
学内サーバーで動作し、学生は演習室のブラウザからアクセスする。

## 技術スタック
- フロントエンド：Next.js 15（App Router）+ Monaco Editor（C言語シンタックスハイライト）
- バックエンド：FastAPI（Python）
- ジャッジエンジン：gcc + Docker（C言語のみ）
- DB：SQLite（`/app/data/cprogramlab.db`）
- 認証：セッションベース（学生ID/パスワード）

## 開発環境
- Ubuntu Server 22.04上のDockerコンテナ内で開発
- コンテナイメージ：cprogramlab-dev:latest
- コンテナ名：cprogramlab-dev
- 起動：`docker compose up` （`dev` / `backend` / `frontend` の3サービス構成）

## ディレクトリ構成

```
CProgrammingLab/
├── frontend/                   # Next.js 15 (App Router)
│   ├── src/
│   │   ├── app/
│   │   │   ├── student/        # 学生画面
│   │   │   │   ├── page.tsx              # 課題一覧
│   │   │   │   ├── assignments/[id]/     # 課題詳細・コード提出
│   │   │   │   ├── history/              # 提出履歴
│   │   │   │   ├── account/              # パスワード変更
│   │   │   │   ├── rubric/               # 採点基準ページ
│   │   │   │   └── layout.tsx
│   │   │   └── teacher/        # 教員画面
│   │   │       ├── page.tsx              # ダッシュボード
│   │   │       ├── classes/[id]/         # クラス管理（課題・学生・採点結果）
│   │   │       ├── assignments/new/      # 課題新規作成
│   │   │       ├── problems/             # 問題管理一覧
│   │   │       ├── problems/[id]/        # 問題編集
│   │   │       ├── problems/new/         # 問題新規作成
│   │   │       ├── users/                # ユーザー管理
│   │   │       └── layout.tsx
│   │   └── lib/
│   │       └── api.ts          # API クライアント（全エンドポイント関数）
│   ├── next.config.ts
│   └── package.json
├── backend/                    # FastAPI (Python)
│   ├── app/
│   │   ├── main.py             # アプリ起動・DBマイグレーション・シード
│   │   ├── models.py           # SQLAlchemy ORM モデル
│   │   ├── schemas.py          # Pydantic v2 スキーマ
│   │   ├── database.py         # DB接続（SQLite）
│   │   ├── deps.py             # 認証依存性（get_current_user / require_teacher）
│   │   ├── judge.py            # ジャッジエンジン・採点ロジック
│   │   └── routers/
│   │       ├── auth.py         # ログイン・ログアウト・パスワード変更
│   │       ├── users.py        # ユーザー CRUD
│   │       ├── problems.py     # 問題 CRUD・テストケース・インポート
│   │       ├── assignments.py  # 課題 CRUD・開始記録
│   │       ├── submissions.py  # 提出・採点・サンプル実行
│   │       ├── results.py      # 採点結果一覧・CSV・コード閲覧・ZIP
│   │       └── classes.py      # クラス・学生管理
│   └── Dockerfile
├── judge/                      # ジャッジ用 Docker イメージ
│   └── Dockerfile
├── docker-compose.yml
├── .devcontainer/
│   └── Dockerfile
├── CLAUDE.md
└── RUBRIC.md                   # 採点基準の仕様書
```

## 開発ルール
- コメントは日本語でOK
- APIのエンドポイントは `/api/v1/` 以下に統一
- ジャッジ実行は必ずDockerコンテナ内で行う（セキュリティ必須）
- コミットメッセージは日本語でOK
- 日時はすべてUTCでDBに保存し、表示時にJSTへ変換する
  - フロントエンド：`datetime-local` 入力は `+09:00` を付与してUTC変換（`new Date(str + '+09:00').toISOString()`）
  - バックエンド：UTC naive datetimeをJSONに返すとブラウザがローカル時刻扱いするため、フロントの `api.ts` で末尾に `Z` を付与して補正

## 機能要件

### 教員側
- ユーザー（教員・学生）の作成とパスワード管理
- **クラス管理**：クラスの作成・編集・削除、学生の個別追加・CSVインポート・一括削除
- **問題管理**
  - 問題文・テストケース（非公開）・サンプルケース（公開）の作成・編集・削除
  - **コード制約**：変数・配列・ポインタ・ループ文・if文の最大数を問題ごとに指定可能（省略時は無制限）
  - **インポート・エクスポート**：問題データを JSON 形式（1問1ファイル）で入出力可能
- **課題管理**
  - 課題の作成（問題・クラス・公開開始日時・締切日時を設定）
  - 課題の編集（タイトル・公開開始日時・締切日時の変更）
  - 課題一覧に問題名を表示
- **採点結果**
  - 学生ごとの最新スコア・ステータス・提出回数・解答時間・最終提出日時の一覧表示
  - CSV エクスポート
  - 提出コードの閲覧・個別ダウンロード・一括ZIP ダウンロード

### 学生側
- ユーザーIDとパスワードでのログイン機能
- **課題一覧**：未開始・進行中・提出済みの状態に応じてボタン表示が変化
  - 未開始 → 「開始する」、進行中 → 「再開する」、提出済み → 「結果を見る」
- **課題ページ**（状態ごとのモード切替）
  - `editing`（編集中）：コードを編集して提出
  - `completed`（提出済み）：コード・採点結果を読み取り専用で表示。締切前なら「再提出する」ボタン表示
  - `resubmitting`（再提出中）：コードを再編集して提出
- **サンプル実行**：提出前にサンプルケースで動作確認できる（採点には影響しない）
- **解答時間の計測**：「開始する」ボタンを押した時刻（サーバー側で記録）から提出完了までの経過時間を表示・記録。ページをリロードしても時間はリセットされない
- 即時採点結果の確認（点数内訳の表示を含む）
- 提出履歴の閲覧
- **採点基準ページ**（`/student/rubric`）：採点方式・減点ルールを確認できる

## 採点の仕組み

### 点数計算（100点満点）

```
合計点 = SCORE_BASE + SCORE_CLEAR + SCORE_TIME - 減点合計
       （最低 0点、マイナスにはならない）

SCORE_BASE  = 50  # テストケース正解数に応じた点数（passed/total × 50）
SCORE_CLEAR = 20  # 全テストケース合格ボーナス
SCORE_TIME  = 30  # 時間点（開始から3分ごとに1点減点、90分で0点）
```

### 減点項目

| 条件 | 減点 |
|---|---|
| コンパイル警告あり | −20点 |
| 変数数が制約超過 | −20点 |
| 配列数が制約超過 | −20点 |
| ポインタ数が制約超過 | −20点 |
| ループ文（for・while）数が制約超過 | −10点 |
| if文数が制約超過 | −10点 |

制約のない項目は減点対象外。制約違反があってもテストケースの実行は行われ、正解点は加算される。

### 採点フロー
1. 学生のコードをファイルに書き出す
2. Dockerコンテナ（`cplab-{uuid}` で命名、タイムアウト後 `docker kill`）内で gcc コンパイル
3. 各テストケース（非公開）で実行・出力比較（タイムアウト：5秒/ケース）
4. コード制約チェック：ソースを静的解析し、変数・配列・ポインタ・ループ・if文数を検証
5. 点数計算（上記の計算式）・`score_detail`（JSON）に内訳を記録
6. 結果をDBに保存してフロントに返す
7. サンプル実行はサンプルケースを使い、DBには保存しない（一時実行のみ）

## DBスキーマ（主要テーブル）

| テーブル | 主なカラム | 備考 |
|---|---|---|
| `users` | id, username, hashed_password, role, is_superadmin | role: teacher / student |
| `problems` | id, title, description, max_vars, max_arrays, max_pointers, max_loops, max_ifs | 制約は NULL = 無制限 |
| `test_cases` | id, problem_id, input, expected_output, order_index | 非公開 |
| `sample_cases` | id, problem_id, input, expected_output, order_index | 学生に公開 |
| `classes` | id, name, description | クラス情報 |
| `class_members` | class_id, user_id | 複合主キー |
| `assignments` | id, title, problem_id, class_id, open_at, close_at | 日時はUTC |
| `assignment_starts` | id, assignment_id, user_id, started_at | 学生の開始時刻（サーバー側記録、UNIQUE制約） |
| `submissions` | id, user_id, problem_id, assignment_id, code, status, score, started_at, elapsed_seconds, compile_warnings, score_detail | score_detail は JSON 文字列 |
| `submission_results` | id, submission_id, test_case_id, status, output, time_ms | テストケースごとの結果 |

## 問題インポート・エクスポートのファイル形式

```json
{
  "format": "cprogramlab-problem",
  "version": "1",
  "title": "問題タイトル",
  "description": "問題文",
  "constraints": {
    "max_vars": null,
    "max_arrays": null,
    "max_pointers": null,
    "max_loops": null,
    "max_ifs": null
  },
  "sample_cases": [
    { "input": "入力例", "expected_output": "出力例" }
  ],
  "test_cases": [
    { "input": "テスト入力", "expected_output": "テスト出力" }
  ]
}
```
