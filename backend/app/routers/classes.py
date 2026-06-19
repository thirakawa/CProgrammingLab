import bcrypt
import csv
import io
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_current_user, require_teacher
from .. import models, schemas

router = APIRouter(prefix="/api/v1/classes", tags=["classes"])


def _hash(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def _to_class_out(c: models.Class) -> schemas.ClassOut:
    return schemas.ClassOut(
        id=c.id, name=c.name, description=c.description,
        created_by=c.created_by, created_at=c.created_at,
        member_count=len(c.members),
    )


def _to_class_detail(c: models.Class) -> schemas.ClassDetail:
    valid_members = [m for m in c.members if m.student is not None]
    return schemas.ClassDetail(
        id=c.id, name=c.name, description=c.description,
        created_by=c.created_by, created_at=c.created_at,
        member_count=len(valid_members),
        members=[
            schemas.ClassMemberOut(user_id=m.user_id, username=m.student.username)
            for m in valid_members
        ],
    )


@router.get("", response_model=list[schemas.ClassOut])
def list_classes(db: Session = Depends(get_db), _: models.User = Depends(get_current_user)):
    return [_to_class_out(c) for c in db.query(models.Class).order_by(models.Class.name).all()]


@router.post("", response_model=schemas.ClassDetail, status_code=status.HTTP_201_CREATED)
def create_class(body: schemas.ClassCreate, db: Session = Depends(get_db), current_user: models.User = Depends(require_teacher)):
    if db.query(models.Class).filter(models.Class.name == body.name).first():
        raise HTTPException(status_code=400, detail="そのクラス名は既に使われています")
    c = models.Class(name=body.name, description=body.description, created_by=current_user.id)
    db.add(c)
    db.commit()
    db.refresh(c)
    return _to_class_detail(c)


@router.get("/{class_id}", response_model=schemas.ClassDetail)
def get_class(class_id: int, db: Session = Depends(get_db), _: models.User = Depends(get_current_user)):
    c = db.get(models.Class, class_id)
    if not c:
        raise HTTPException(status_code=404, detail="クラスが見つかりません")
    return _to_class_detail(c)


@router.put("/{class_id}", response_model=schemas.ClassDetail)
def update_class(class_id: int, body: schemas.ClassUpdate, db: Session = Depends(get_db), _: models.User = Depends(require_teacher)):
    c = db.get(models.Class, class_id)
    if not c:
        raise HTTPException(status_code=404, detail="クラスが見つかりません")
    if body.name is not None:
        existing = db.query(models.Class).filter(models.Class.name == body.name, models.Class.id != class_id).first()
        if existing:
            raise HTTPException(status_code=400, detail="そのクラス名は既に使われています")
        c.name = body.name
    if body.description is not None:
        c.description = body.description
    db.commit()
    db.refresh(c)
    return _to_class_detail(c)


@router.delete("/{class_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_class(class_id: int, db: Session = Depends(get_db), _: models.User = Depends(require_teacher)):
    c = db.get(models.Class, class_id)
    if not c:
        raise HTTPException(status_code=404, detail="クラスが見つかりません")

    # このクラスに紐づいた課題の class_id を NULL に（課題データは保持）
    db.query(models.Assignment).filter(
        models.Assignment.class_id == class_id
    ).update({"class_id": None})

    # クラスメンバー（学生）とその関連データを削除
    for member in list(c.members):
        user = db.get(models.User, member.user_id)
        if user and user.role == "student":
            # AssignmentStart 記録を削除
            db.query(models.AssignmentStart).filter_by(user_id=user.id).delete()
            # 提出データを削除（SubmissionResult は cascade で自動削除）
            for sub in list(user.submissions):
                db.delete(sub)
            db.flush()   # FK 制約違反を防ぐため user 削除前に反映
            db.delete(user)

    db.delete(c)
    db.commit()


@router.post("/{class_id}/students", response_model=schemas.ClassDetail, status_code=status.HTTP_201_CREATED)
def create_student_in_class(
    class_id: int, body: schemas.StudentInClassCreate,
    db: Session = Depends(get_db), _: models.User = Depends(require_teacher),
):
    """クラス内に学生アカウントを新規作成して追加する"""
    c = db.get(models.Class, class_id)
    if not c:
        raise HTTPException(status_code=404, detail="クラスが見つかりません")
    if db.query(models.User).filter(models.User.username == body.username).first():
        raise HTTPException(status_code=400, detail="そのユーザー名は既に使われています")
    user = models.User(username=body.username, hashed_password=_hash(body.password), role="student")
    db.add(user)
    db.flush()
    db.add(models.ClassMember(class_id=class_id, user_id=user.id))
    db.commit()
    db.refresh(c)
    return _to_class_detail(c)


@router.post("/{class_id}/students/csv", response_model=schemas.CsvImportResult)
def import_students_csv(
    class_id: int, file: UploadFile = File(...),
    db: Session = Depends(get_db), _: models.User = Depends(require_teacher),
):
    """CSVから学生を一括作成してクラスに追加する（形式: username,password）"""
    c = db.get(models.Class, class_id)
    if not c:
        raise HTTPException(status_code=404, detail="クラスが見つかりません")

    content = file.file.read().decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(content))

    created = 0
    skipped_usernames: list[str] = []
    errors: list[str] = []

    for i, row in enumerate(reader, start=2):
        username = (row.get("username") or "").strip()
        password = (row.get("password") or "").strip() or "changeme"

        if not username:
            errors.append(f"行{i}: ユーザー名が空です")
            continue

        if db.query(models.User).filter(models.User.username == username).first():
            skipped_usernames.append(username)
            continue

        user = models.User(username=username, hashed_password=_hash(password), role="student")
        db.add(user)
        db.flush()
        db.add(models.ClassMember(class_id=class_id, user_id=user.id))
        created += 1

    db.commit()
    return schemas.CsvImportResult(
        created=created,
        skipped=len(skipped_usernames),
        skipped_usernames=skipped_usernames,
        errors=errors,
    )


@router.delete("/{class_id}/students/batch", response_model=schemas.ClassDetail)
def batch_delete_students(
    class_id: int, body: schemas.BatchDeleteRequest,
    db: Session = Depends(get_db), _: models.User = Depends(require_teacher),
):
    """複数学生をクラスから除外してアカウントも削除する"""
    c = db.get(models.Class, class_id)
    if not c:
        raise HTTPException(status_code=404, detail="クラスが見つかりません")
    for uid in body.user_ids:
        member = db.get(models.ClassMember, (class_id, uid))
        if member:
            db.delete(member)
        user = db.get(models.User, uid)
        if user and user.role == "student":
            db.delete(user)
    db.commit()
    db.refresh(c)
    return _to_class_detail(c)


@router.delete("/{class_id}/students/{user_id}", response_model=schemas.ClassDetail)
def delete_student(
    class_id: int, user_id: int,
    db: Session = Depends(get_db), _: models.User = Depends(require_teacher),
):
    """クラスから学生を除外してアカウントも削除する"""
    c = db.get(models.Class, class_id)
    if not c:
        raise HTTPException(status_code=404, detail="クラスが見つかりません")
    member = db.get(models.ClassMember, (class_id, user_id))
    if member:
        db.delete(member)
    user = db.get(models.User, user_id)
    if user and user.role == "student":
        db.delete(user)
    db.commit()
    db.refresh(c)
    return _to_class_detail(c)
