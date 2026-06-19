import bcrypt
import csv
import io
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import require_teacher
from .. import models, schemas

router = APIRouter(prefix="/api/v1/users", tags=["users"])


def _hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


@router.get("", response_model=list[schemas.UserOut])
def list_users(
    db: Session = Depends(get_db),
    _: models.User = Depends(require_teacher),
):
    return db.query(models.User).all()


@router.post("", response_model=schemas.UserOut, status_code=status.HTTP_201_CREATED)
def create_user(
    body: schemas.UserCreate,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_teacher),
):
    if db.query(models.User).filter(models.User.username == body.username).first():
        raise HTTPException(status_code=400, detail="そのユーザー名は既に使われています")
    if body.role not in ("teacher", "student"):
        raise HTTPException(status_code=400, detail="role は teacher または student を指定してください")
    user = models.User(
        username=body.username,
        hashed_password=_hash_password(body.password),
        role=body.role,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.post("/csv", response_model=schemas.CsvImportResult)
def import_users_csv(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    _: models.User = Depends(require_teacher),
):
    """CSVファイルから学生アカウントを一括登録する（形式: username,password）"""
    content = file.file.read().decode("utf-8-sig")  # BOM付きUTF-8も対応
    reader = csv.DictReader(io.StringIO(content))

    created = 0
    skipped = 0
    errors: list[str] = []

    for i, row in enumerate(reader, start=2):  # 2行目から（1行目はヘッダー）
        username = (row.get("username") or "").strip()
        password = (row.get("password") or "").strip() or "changeme"

        if not username:
            errors.append(f"行{i}: ユーザー名が空です")
            continue

        if db.query(models.User).filter(models.User.username == username).first():
            skipped += 1
            continue

        db.add(models.User(
            username=username,
            hashed_password=_hash_password(password),
            role="student",
        ))
        created += 1

    db.commit()
    return schemas.CsvImportResult(created=created, skipped=skipped, errors=errors)


@router.delete("/batch", status_code=status.HTTP_200_OK)
def batch_delete_users(
    body: schemas.BatchDeleteRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_teacher),
):
    """複数ユーザーを一括削除する（superadminと自分自身はスキップ）"""
    deleted = 0
    for user_id in body.user_ids:
        if user_id == current_user.id:
            continue
        user = db.get(models.User, user_id)
        if not user or user.is_superadmin:
            continue
        db.delete(user)
        deleted += 1
    db.commit()
    return {"deleted": deleted}


@router.put("/{user_id}", response_model=schemas.UserOut)
def update_user(
    user_id: int,
    body: schemas.UserUpdate,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_teacher),
):
    user = db.get(models.User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="ユーザーが見つかりません")
    if body.password:
        user.hashed_password = _hash_password(body.password)
    if body.role:
        if body.role not in ("teacher", "student"):
            raise HTTPException(status_code=400, detail="role は teacher または student を指定してください")
        user.role = body.role
    db.commit()
    db.refresh(user)
    return user


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_teacher),
):
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="自分自身は削除できません")
    user = db.get(models.User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="ユーザーが見つかりません")
    if user.is_superadmin:
        raise HTTPException(status_code=403, detail="プライマリ管理者は削除できません")
    db.delete(user)
    db.commit()
