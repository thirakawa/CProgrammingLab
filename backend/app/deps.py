import os
from fastapi import Cookie, Depends, HTTPException, status
from sqlalchemy.orm import Session
from itsdangerous import URLSafeSerializer, BadSignature
from .database import get_db
from . import models

SECRET_KEY = os.environ.get("SECRET_KEY", "cprogramlab-secret-key-change-in-production")
serializer = URLSafeSerializer(SECRET_KEY)

# セッションストア: 署名済みセッションID -> user_id
sessions: dict[str, int] = {}


def create_session(user_id: int) -> str:
    import uuid
    raw_id = str(uuid.uuid4())
    signed = serializer.dumps(raw_id)
    sessions[signed] = user_id
    return signed


def delete_session(session_id: str) -> None:
    sessions.pop(session_id, None)


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

    user_id = sessions.get(session_id)
    if user_id is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="セッションが期限切れです")

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
