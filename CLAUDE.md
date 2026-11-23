# C Programming Lab

## プロジェクト概要
C言語専用のプログラミング演習・自動採点プラットフォーム。
大学の授業（学生数十人規模）での使用を想定。
学内サーバーで動作し、学生は演習室のブラウザからアクセスする。

## 技術スタック
- フロントエンド：Next.js 15（App Router）+ Monaco Editor（C言語シンタックスハイライト）+ react-markdown（remark-math / rehype-katex で数式表示）
- バックエンド：FastAPI（Python）
- ジャッジエンジン：gcc + Docker（C言語のみ）
- DB：SQLite（`/app/data/cprogramlab.db`）
- 認証：セッションベース（ユーザーID/パスワード、ロール：teacher / ta / student）

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
│   │   │   ├── teacher/        # 教員画面
│   │   │   │   ├── page.tsx              # ダッシュボード
│   │   │   │   ├── classes/[id]/         # クラス管理（課題・学生・採点結果）
│   │   │   │   ├── assignments/new/      # 課題新規作成
│   │   │   │   ├── problems/             # 問題管理一覧
│   │   │   │   ├── problems/[id]/        # 問題編集
│   │   │   │   ├── problems/new/         # 問題新規作成
│   │   │   │   ├── users/                # 教員・TAアカウント管理
│   │   │   │   └── layout.tsx
│   │   │   └── ta/             # TA画面（教員より権限の低い補助アカウント）
│   │   │       ├── page.tsx              # クラス一覧（閲覧のみ）
│   │   │       ├── classes/[id]/         # 学生一覧（PWリセット）・採点結果閲覧
│   │   │       ├── problems/             # 問題一覧・詳細（閲覧専用）
│   │   │       ├── account/              # パスワード変更
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
│   │   ├── deps.py             # 認証依存性（get_current_user / require_teacher / require_teacher_or_ta）
│   │   ├── judge.py            # ジャッジエンジン・採点ロジック・添付ファイル配置・制約チェック（ConstraintSpec）・関数定義型のハーネスのビルド（`_build` / `_compile_with_harness`）
│   │   ├── code_analyzer.py    # C言語ソースの簡易解析（トークナイザ＋宣言パーサ。変数/配列/ポインタ/ループ/ifの検出）
│   │   └── routers/
│   │       ├── auth.py         # ログイン・ログアウト・パスワード変更
│   │       ├── users.py        # ユーザー CRUD・パスワードリセット（権限チェック含む）
│   │       ├── problems.py     # 問題 CRUD・テストケース・インポート・関数定義型の動作確認（`/verify`）
│   │       ├── assignments.py  # 課題 CRUD・開始記録・解答開始期限チェック
│   │       ├── submissions.py  # 提出・採点・サンプル実行・満点後の再提出ブロック
│   │       ├── results.py      # 採点結果一覧・CSV（全履歴/最新のみ）・コード閲覧・ZIP
│   │       └── classes.py      # クラス・学生管理
│   ├── tests/                  # 単体テスト（pytest不要: `docker exec -w /app cprogramlab-backend python -m tests.test_code_analyzer` / `tests.test_harness`）
│   ├── scripts/                # 運用スクリプト（compare_constraint_counts.py: 旧/新カウント方式の比較。DBは読み取り専用）
│   └── Dockerfile
├── judge/                      # ジャッジ用 Docker イメージ
│   └── Dockerfile
├── samples/                    # サンプルデータ（problems/: 問題JSON、users/: 学生CSV）
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
- ジャッジ用一時ディレクトリ（`JUDGE_TMPDIR`、docker-composeでホストとbackendコンテナ間にバインドマウント）は**`/tmp` 以下に置かない**。Ubuntuの `systemd-tmpfiles-clean.timer` により10日間未アクセスのファイルが `/tmp` から自動削除され、ホスト側ディレクトリが消えるとバインドマウントが無効化されて採点が全滅する（過去に実際に発生した障害）。デフォルトは `/var/lib/cprogramlab/judge-tmp`
- セッションはメモリ上に保持（有効期限12時間）。ログアウト・パスワード変更/リセット・ロール変更・ユーザー削除でサーバー側のセッションも失効させる（`deps.py` の `delete_session` / `delete_user_sessions`）。バックエンド再起動で全員ログアウトされる
- 学生の提出は課題の所属クラス・公開開始・課題と問題の一致を検証し、解答開始時刻と経過時間は常にサーバー側（`AssignmentStart`）で決める（クライアント申告の `elapsed_seconds` は信用しない）。開始記録なしで提出された場合は開始APIと同条件（解答開始期限）で提出時点を開始時刻として記録する
- ジャッジのコンテナは `--network none --cap-drop ALL --no-new-privileges --pids-limit --memory-swap` で隔離し、標準出力は256KBまでしか保持しない（無限出力でバックエンドのメモリが枯渇しないため）。ソースコードは10万文字まで
- 関数定義型：ハーネスは学生に絶対に返さない・実行コンテナに置かない。ハーネスの不具合（コンパイル失敗）時は提出を記録せず HTTP 500 を返す（学生の責任にしない）。ハーネスとのシグネチャ不一致は共通ヘッダがないため未定義動作になり得る（問題文に関数の宣言を明記する）。ハーネスの定数はバイナリに残るため、期待値はテストケース側に置く
- **Claude Codeはgit操作（commit, push, branch作成・切替、mergeなど）を勝手に行わない**。ユーザーから明示的に依頼された場合のみ実行する。git操作はユーザー自身が行う運用のため、指示がない限り `git status` などの確認コマンド以外は実行しないこと

## 機能要件

### 教員側
- **ユーザー管理**：教員・TAアカウントの作成・削除・パスワード管理
  - **プライマリ管理者（`is_superadmin`）のパスワードは本人のみ変更可能**。それ以外の教員からは変更・削除不可
  - **教員同士・TA同士は互いのパスワードを変更不可**（自分自身のパスワードは常に変更可能）。プライマリ管理者のみ全ユーザーのパスワード変更・他教員の削除が可能
  - TAアカウントの作成・削除は教員のみ可能
- **クラス管理**：クラスの作成・編集・削除、学生の個別追加・CSVインポート・一括削除
- **問題管理**
  - 問題文・テストケース（非公開）・サンプルケース（公開）の作成・編集・削除
  - 問題文はMarkdown形式（`remark-math` / `rehype-katex` によりLaTeX数式のインライン `$...$` ／ ブロック `$$...$$` 記法に対応）
  - **コード制約**：変数・配列・ポインタ・ループ文・if文の**上限（max_*）と下限（min_*）**を問題ごとに指定可能（空欄 = 制約なし。下限0は「下限なし」と同じで保存時にNULLへ正規化。下限＞上限は保存時エラー）
    - **下限不足時の挙動（`constraint_mode`）**：`deduct`（減点・既定）または `reject`（提出拒否）。`reject` は**下限不足にのみ**作用し、上限超過は常に減点
    - 数え方は `code_analyzer.py` に集約（トークン化→宣言パース）。for文内のループ変数・グローバル変数・struct/typedef型の変数・const/static/register付きを数える。関数の仮引数・構造体メンバ・関数プロトタイプ・typedef・extern・`&x`は数えない。`int *a[3]` は配列とポインタの両方、`int **p` はポインタ1個。`int (*p)[3]` や関数ポインタ（括弧つき宣言子）は対象外（一覧には「対象外」として表示）
  - **ファイル添付（ファイルI/O問題）**：テストケース・サンプルケースごとに `.txt` / `.csv` ファイルを複数添付可能（ファイル名は `^[A-Za-z0-9_][A-Za-z0-9_\-.]*\.(txt|csv)$` のみ許可、1ファイル最大256KB・1ケース最大5ファイル）。ジャッジ実行前にソース・実行ファイルと同じディレクトリに配置され、プログラムが `fopen` 等で読み込める。判定は標準出力の比較のみ（従来通り）。添付ファイルなしの問題は標準入出力のみで動作し完全後方互換
  - **問題の種類（`problem_type`）**：`program`（既定。学生が `main` を含むプログラム全体を書く）と `function`（**関数定義型**。学生は指定された関数だけを書き、教員が用意した非公開の `main`＝**ハーネス**が呼び出す）
    - `function` では教員が **ハーネス（`harness_code`、`main` 必須・非公開）** と **初期コード（`template_code`、関数の雛形。学生の初期表示になる）** を登録する。ハーネスは標準入力を読んで関数を呼び、結果を標準出力に出す。期待出力は従来どおりテストケース側（DB）に持つ（ハーネスに答えを書かない）
    - 学生に返す問題データには `harness_code` を含めない（`ProblemForStudent`）。教員・TAのみ閲覧可。`program` に切り替えてもハーネスは保持されるが採点には使われない（`Problem.active_harness`）
    - 教員は問題編集ページの「動作確認」（`POST /problems/{id}/verify`）で模範解答を全テストケースに通し、ハーネス・テストケースの整合を提出前に確認できる
  - **インポート・エクスポート**：問題データを JSON 形式（1問1ファイル、添付ファイルを含む）で入出力可能
- **課題管理**
  - 課題の作成（問題・クラス・公開開始日時・締切日時・解答開始期限（任意）を設定）
  - **解答開始期限**：設定すると、この時刻までに初回アクセス（解答開始）しなかった学生はその課題に取り組めなくなる。公開期間（公開開始〜締切）の範囲外を指定した場合はエラー
  - 課題の編集（タイトル・公開開始日時・締切日時・解答開始期限の変更）
  - 課題一覧に問題名を表示
- **採点結果**
  - 学生ごとの最新スコア・ステータス・提出回数・解答時間・最終提出日時の一覧表示
  - CSV エクスポート：全提出履歴、および学生ごとの最新スコアのみ（未提出の学生も空欄行として出力）の2種類
  - 提出コードの閲覧・個別ダウンロード・一括ZIP ダウンロード

### TA側
教員より権限の低い補助アカウント。TAアカウントの作成・削除は教員のみ可能。
- 全クラスの学生一覧・提出状況・採点結果の閲覧（CSV / ZIP エクスポート含む）
- 問題内容の閲覧（テストケース・サンプルケースを含む全内容。`GET /problems`, `GET /problems/{id}` は教員・TAのみアクセス可、学生は403）
- 学生アカウントのパスワードリセット（対象は学生のみ。他のTA・教員のパスワードは変更不可）
- 問題・クラス・ユーザーの作成・編集・削除は不可

### 学生側
- ユーザーIDとパスワードでのログイン機能
- **課題一覧**：未開始・進行中・提出済みの状態に応じてボタン表示が変化
  - 未開始 → 「開始する」、進行中 → 「再開する」、提出済み → 「結果を見る」
- **課題ページ**（状態ごとのモード切替）
  - `editing`（編集中）：コードを編集して提出
  - `completed`（提出済み）：コード・採点結果を読み取り専用で表示。締切前かつ満点でなければ「再提出する」ボタン表示
  - `resubmitting`（再提出中）：コードを再編集して提出
- **解答開始期限**：課題に設定されている場合、期限を過ぎて未開始のままだとその課題にアクセスできず、ブロック画面が表示される（期限前に一度開始していれば締切まで継続可能）
- **再提出の制限**：全テストケース正解かつ減点項目なし（満点100点）を一度達成すると、それ以降はその課題を再提出できない。不正解や減点がある場合は締切まで何度でも再提出可能
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

「制約超過」は上限超過と下限不足の両方を指す（同一項目は最大1回の減点）。制約のない項目は減点対象外。制約違反があってもテストケースの実行は行われ、正解点は加算される。

**提出拒否（`constraint_mode = reject`）**：下限不足のコードは `POST /submissions` が**HTTP 422**で拒否し、提出記録（`submissions`）を作らない。判定はサーバー側のみで、コンパイル成功後に行う（コンパイルエラーは通常どおりCEとして記録）。エラー文には検出数と不足数を含む。提出回数・時間点・解答開始記録には影響しない（開始記録は拒否時も保持）。サンプル実行は拒否せず警告のみ。

**満点後の再提出ブロック**：全テストケース正解（`status == "accepted"`）かつ上記減点がすべて0（＝合計100点）の提出が既にある場合、`POST /submissions` はサーバー側で403を返し、それ以上の提出を拒否する（`submissions.py` の `_is_perfect()`）。

### 採点フロー
1. 学生のコードをファイルに書き出す
2. Dockerコンテナ（`cplab-{uuid}` で命名、タイムアウト後 `docker kill`）内で gcc コンパイル
   - **関数定義型**：学生の `main.c` を `gcc -Wall -std=c99 -c`（警告判定はこの工程のみ）、`harness.c` を `gcc -w -c` で別々にコンパイルし、`gcc -o main student.o harness.o -lm` でリンクする。`harness.c` / `*.o` は実行コンテナに渡る前に削除する（学生コードから `fopen` 等でハーネスを読めない）。ハーネスのコンパイル失敗は `HarnessError`
   - リンクエラーは `_explain_link_error()` で学生向けに翻訳（`main` 重複 → 「main関数を定義しないでください」、未定義参照 → 「次の関数が定義されていません: …」）。ld の生出力は見せない
3. 各テストケース（非公開）で実行・出力比較（タイムアウト：5秒/ケース）。テストケースに添付ファイルがある場合は実行直前にソース・実行ファイルと同じディレクトリへ配置し、前のケースの添付ファイルはクリアしてから書き込む（`judge.py` の `_prepare_case_files()`）
4. コード制約チェック：`code_analyzer.analyze()` でソースを解析し、変数・配列・ポインタ・ループ・if文数を上限/下限と照合（`reject` モードで下限不足なら、ここで提出を拒否して終了）
5. 点数計算（上記の計算式）・`score_detail`（JSON）に内訳を記録（`analysis` キーに検出した宣言一覧・各カウントも保存。旧提出には無い）
6. 結果をDBに保存してフロントに返す
7. サンプル実行はサンプルケースを使い、DBには保存しない（一時実行のみ。添付ファイルの配置は同様に行う）

## DBスキーマ（主要テーブル）

| テーブル | 主なカラム | 備考 |
|---|---|---|
| `users` | id, username, hashed_password, role, is_superadmin | role: teacher / ta / student |
| `problems` | id, title, description, max_vars, max_arrays, max_pointers, max_loops, max_ifs, min_vars, min_arrays, min_pointers, min_loops, min_ifs, constraint_mode, problem_type, template_code, harness_code | max_*/min_* は NULL = 制約なし。constraint_mode は `deduct`/`reject`（既定 deduct）。problem_type は `program`（既定）/`function`、template_code・harness_code は関数定義型用（NULL可）。カラムは起動時の `_migrate()` で自動追加 |
| `test_cases` | id, problem_id, input, expected_output, order_index | 非公開 |
| `test_case_files` | id, test_case_id, filename, content | テストケースの添付ファイル（.txt/.csv） |
| `sample_cases` | id, problem_id, input, expected_output, order_index | 学生に公開 |
| `sample_case_files` | id, sample_case_id, filename, content | サンプルケースの添付ファイル（.txt/.csv） |
| `classes` | id, name, description | クラス情報 |
| `class_members` | class_id, user_id | 複合主キー |
| `assignments` | id, title, problem_id, class_id, open_at, close_at, start_deadline | 日時はUTC。start_deadline は NULL = 制限なし。idは`sqlite_autoincrement`によりID再利用を禁止（削除済み課題のAssignmentStart/Submissionが別課題に紛れ込む事故を防止） |
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
  "problem_type": "program",
  "template_code": null,
  "harness_code": null,
  "constraints": {
    "max_vars": null,
    "max_arrays": null,
    "max_pointers": null,
    "max_loops": null,
    "max_ifs": null,
    "min_vars": null,
    "min_arrays": null,
    "min_pointers": null,
    "min_loops": null,
    "min_ifs": null,
    "constraint_mode": "deduct"
  },
  "sample_cases": [
    {
      "input": "入力例",
      "expected_output": "出力例",
      "files": [{ "filename": "data.csv", "content": "1,2,3\n" }]
    }
  ],
  "test_cases": [
    { "input": "テスト入力", "expected_output": "テスト出力", "files": [] }
  ]
}
```

`files` は省略可（省略時は添付ファイルなし＝標準入出力のみの問題）。`constraints` の `min_*` / `constraint_mode` も省略可（旧形式のファイル＝下限なし・減点モードとして取り込まれる）。`problem_type` / `template_code` / `harness_code` も省略可（省略時は `program`）。`problem_type` が `function` の場合は `harness_code`（`main` を含む）が必須。
