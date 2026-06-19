import bcrypt
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.orm import Session

from .database import engine, SessionLocal
from . import models
from .routers import auth, users, problems, assignments, submissions, results, classes


def _migrate():
    """既存DBへのカラム追加マイグレーション"""
    with engine.connect() as conn:
        for stmt in [
            "ALTER TABLE users ADD COLUMN is_superadmin BOOLEAN NOT NULL DEFAULT 0",
            "ALTER TABLE assignments ADD COLUMN class_id INTEGER REFERENCES classes(id)",
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
        conn.execute(text(
            "DELETE FROM class_members WHERE user_id NOT IN (SELECT id FROM users)"
        ))
        conn.commit()


_migrate()
models.Base.metadata.create_all(bind=engine)

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
