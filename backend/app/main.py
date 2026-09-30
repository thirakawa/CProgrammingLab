import bcrypt
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.orm import Session

from .database import engine, SessionLocal
from . import models
from .routers import auth, users, problems, assignments, submissions, results, classes


def _migrate_assignments_autoincrement(conn):
    """assignments テーブルに AUTOINCREMENT を付与し、削除後のID再利用を防ぐ

    SQLiteのINTEGER PRIMARY KEYは、テーブルの全行が削除されると次のIDが1から
    振り直される。これにより、削除した課題と同じIDを新しい課題が引き継いでしまい、
    削除済み課題に紐づく古いAssignmentStart/Submissionレコード（開始時刻・提出履歴）が
    新しい課題のものと誤認識される不具合が発生していたため、AUTOINCREMENTでID再利用を禁止する。
    SQLiteはALTER TABLEでのPRIMARY KEY変更をサポートしないため、テーブルを作り直す。
    """
    row = conn.execute(text(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='assignments'"
    )).fetchone()
    if row is None or row[0] is None or "AUTOINCREMENT" in row[0].upper():
        return  # テーブル未作成、または対応済み
    conn.execute(text("ALTER TABLE assignments RENAME TO assignments_old_migrate"))
    conn.execute(text("""
        CREATE TABLE assignments (
            id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
            title VARCHAR NOT NULL,
            problem_id INTEGER NOT NULL,
            class_id INTEGER,
            open_at DATETIME NOT NULL,
            close_at DATETIME NOT NULL,
            start_deadline DATETIME,
            created_by INTEGER NOT NULL,
            created_at DATETIME,
            FOREIGN KEY(problem_id) REFERENCES problems (id),
            FOREIGN KEY(class_id) REFERENCES classes (id),
            FOREIGN KEY(created_by) REFERENCES users (id)
        )
    """))
    conn.execute(text("""
        INSERT INTO assignments
            (id, title, problem_id, class_id, open_at, close_at, start_deadline, created_by, created_at)
        SELECT id, title, problem_id, class_id, open_at, close_at, start_deadline, created_by, created_at
        FROM assignments_old_migrate
    """))
    conn.execute(text("DROP TABLE assignments_old_migrate"))


def _cleanup_orphaned_assignment_data(conn):
    """課題削除→ID再利用によって過去に紛れ込んだ孤立データを除去する

    AssignmentStart/Submission は、その課題(assignments.created_at)より前の
    タイムスタンプを持つことは本来あり得ない（課題が存在する前に開始・提出はできないため）。
    そのようなレコードは、削除済み課題と同じIDを再利用した別の課題に誤って
    結びついた過去データなので削除する。
    """
    conn.execute(text("""
        DELETE FROM submission_results WHERE submission_id IN (
            SELECT s.id FROM submissions s
            JOIN assignments a ON a.id = s.assignment_id
            WHERE s.assignment_id IS NOT NULL AND s.submitted_at < a.created_at
        )
    """))
    conn.execute(text("""
        DELETE FROM submissions WHERE id IN (
            SELECT s.id FROM submissions s
            JOIN assignments a ON a.id = s.assignment_id
            WHERE s.assignment_id IS NOT NULL AND s.submitted_at < a.created_at
        )
    """))
    conn.execute(text("""
        DELETE FROM assignment_starts WHERE id IN (
            SELECT st.id FROM assignment_starts st
            JOIN assignments a ON a.id = st.assignment_id
            WHERE st.started_at < a.created_at
        )
    """))
    # 参照先の課題自体が既に存在しない（IDが再利用されずそのまま残った）純粋な孤立データも削除
    conn.execute(text("""
        DELETE FROM submission_results WHERE submission_id IN (
            SELECT id FROM submissions
            WHERE assignment_id IS NOT NULL AND assignment_id NOT IN (SELECT id FROM assignments)
        )
    """))
    conn.execute(text("""
        DELETE FROM submissions
        WHERE assignment_id IS NOT NULL AND assignment_id NOT IN (SELECT id FROM assignments)
    """))
    conn.execute(text("""
        DELETE FROM assignment_starts WHERE assignment_id NOT IN (SELECT id FROM assignments)
    """))


def _migrate():
    """既存DBへのカラム追加マイグレーション"""
    with engine.connect() as conn:
        try:
            _migrate_assignments_autoincrement(conn)
            conn.commit()
        except Exception:
            conn.rollback()
        try:
            _cleanup_orphaned_assignment_data(conn)
            conn.commit()
        except Exception:
            conn.rollback()
        for stmt in [
            "ALTER TABLE users ADD COLUMN is_superadmin BOOLEAN NOT NULL DEFAULT 0",
            "ALTER TABLE assignments ADD COLUMN class_id INTEGER REFERENCES classes(id)",
            "ALTER TABLE assignments ADD COLUMN start_deadline DATETIME",
            # コード制約
            "ALTER TABLE problems ADD COLUMN max_vars INTEGER",
            "ALTER TABLE problems ADD COLUMN max_arrays INTEGER",
            "ALTER TABLE problems ADD COLUMN max_pointers INTEGER",
            "ALTER TABLE problems ADD COLUMN max_loops INTEGER",
            "ALTER TABLE problems ADD COLUMN max_ifs INTEGER",
            # 解答時間
            "ALTER TABLE submissions ADD COLUMN started_at DATETIME",
            "ALTER TABLE submissions ADD COLUMN elapsed_seconds INTEGER",
            # コンパイル警告
            "ALTER TABLE submissions ADD COLUMN compile_warnings TEXT",
            # 点数内訳
            "ALTER TABLE submissions ADD COLUMN score_detail TEXT",
        ]:
            try:
                conn.execute(text(stmt))
                conn.commit()
            except Exception:
                pass
        # 孤立した class_members レコード（ユーザーが削除済み）を削除
        try:
            conn.execute(text(
                "DELETE FROM class_members WHERE user_id NOT IN (SELECT id FROM users)"
            ))
            conn.commit()
        except Exception:
            pass


# 先にテーブルを作成してから既存DBへのカラム追加マイグレーションを行う。
# 初回起動時（テーブルが1つも存在しない状態）に _migrate() を先に実行すると
# ALTER TABLE / DELETE の対象テーブルが存在せず失敗するため、この順序が必須。
models.Base.metadata.create_all(bind=engine)
_migrate()

app = FastAPI(title="CProgramLab API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(users.router)
app.include_router(problems.router)
app.include_router(assignments.router)
app.include_router(submissions.router)
app.include_router(results.router)
app.include_router(classes.router)


def _hash(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def _seed():
    """初回起動時にデフォルトアカウントを作成・修正する"""
    db: Session = SessionLocal()
    try:
        admin = db.query(models.User).filter(models.User.username == "admin").first()
        if admin:
            admin.role = "teacher"
            admin.is_superadmin = True
            db.commit()
        else:
            db.add(models.User(
                username="admin",
                hashed_password=_hash("admin"),
                role="teacher",
                is_superadmin=True,
            ))
            db.commit()

        db.commit()
    finally:
        db.close()


_seed()


@app.get("/")
def root():
    return {"message": "CProgramLab API", "docs": "/docs"}
