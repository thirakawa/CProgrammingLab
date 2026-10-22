import os
import time
from fastapi import Cookie, Depends, HTTPException, status
from sqlalchemy.orm import Session
from itsdangerous import URLSafeSerializer, BadSignature
from .database import get_db
from . import models

SECRET_KEY = os.environ.get("SECRET_KEY", "cprogramlab-secret-key-change-in-production")
serializer = URLSafeSerializer(SECRET_KEY)

SESSION_TTL_SECONDS = 12 * 60 * 60

# セッションストア: 署名済みセッションID -> (user_id, 有効期限のUNIX時刻)
sessions: dict[str, tuple[int, float]] = {}


def create_session(user_id: int) -> str:
    import uuid
    raw_id = str(uuid.uuid4())
    signed = serializer.dumps(raw_id)
    now = time.time()
    # 期限切れセッションが溜まり続けないよう、作成時に掃除する
    for sid in [k for k, (_, exp) in sessions.items() if exp <= now]:
        del sessions[sid]
    sessions[signed] = (user_id, now + SESSION_TTL_SECONDS)
    return signed


def delete_session(session_id: str | None) -> None:
    if session_id:
        sessions.pop(session_id, None)


def delete_user_sessions(user_id: int, except_session: str | None = None) -> None:
    """指定ユーザーの全セッションを失効させる（パスワード変更・リセット・ロール変更時に使用）"""
    for sid in [k for k, (uid, _) in sessions.items() if uid == user_id and k != except_session]:
        del sessions[sid]


def get_current_user(
    session_id: str = Cookie(default=None),
    db: Session = Depends(get_db),
) -> models.User:
    if not session_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="ログインしてください")
    try:
        serializer.loads(session_id)
    except BadSignature:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="無効なセッションです")

    entry = sessions.get(session_id)
    if entry is None or entry[1] <= time.time():
        sessions.pop(session_id, None)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="セッションが期限切れです")
    user_id = entry[0]

    user = db.get(models.User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="ユーザーが見つかりません")
    return user


def require_teacher(current_user: models.User = Depends(get_current_user)) -> models.User:
    if current_user.role != "teacher":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="教員権限が必要です")
    return current_user


def require_teacher_or_ta(current_user: models.User = Depends(get_current_user)) -> models.User:
    if current_user.role not in ("teacher", "ta"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="教員またはTA権限が必要です")
    return current_user
