from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_current_user, require_teacher
from .. import models, schemas

router = APIRouter(prefix="/api/v1/assignments", tags=["assignments"])


def _validate_start_deadline(open_at: datetime, close_at: datetime, start_deadline: datetime | None) -> None:
    if start_deadline is None:
        return
    if not (open_at <= start_deadline <= close_at):
        raise HTTPException(
            status_code=400,
            detail="解答開始期限は課題の公開期間（公開開始〜締切）の範囲内に設定してください",
        )


@router.get("", response_model=list[schemas.AssignmentOut])
def list_assignments(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if current_user.role in ("teacher", "ta"):
        return db.query(models.Assignment).order_by(models.Assignment.created_at.desc()).all()

    # 学生: 自分が所属するクラスの公開中課題のみ
    member = db.query(models.ClassMember).filter(
        models.ClassMember.user_id == current_user.id
    ).first()
    if member is None:
        return []  # クラス未所属の学生には課題なし

    now = datetime.utcnow()
    assignments = (
        db.query(models.Assignment)
        .filter(
            models.Assignment.class_id == member.class_id,
            models.Assignment.open_at <= now,
            models.Assignment.close_at >= now,
        )
        .all()
    )

    if not assignments:
        return []

    # 開始済み・提出済みの課題IDを一括取得してステータスを付与
    assignment_ids = [a.id for a in assignments]
    started_ids = {
        r.assignment_id for r in
        db.query(models.AssignmentStart.assignment_id).filter(
            models.AssignmentStart.user_id == current_user.id,
            models.AssignmentStart.assignment_id.in_(assignment_ids),
        ).all()
    }
    submitted_ids = {
        r.assignment_id for r in
        db.query(models.Submission.assignment_id).filter(
            models.Submission.user_id == current_user.id,
            models.Submission.assignment_id.in_(assignment_ids),
        ).all()
    }

    result = []
    for a in assignments:
        if a.id in submitted_ids:
            my_status = "submitted"
        elif a.id in started_ids:
            my_status = "in_progress"
        else:
            my_status = "not_started"
        item = schemas.AssignmentOut.model_validate(a)
        item.my_status = my_status
        result.append(item)
    return result


@router.post("", response_model=schemas.AssignmentOut, status_code=status.HTTP_201_CREATED)
def create_assignment(
    body: schemas.AssignmentCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_teacher),
):
    if not db.get(models.Problem, body.problem_id):
        raise HTTPException(status_code=404, detail="問題が見つかりません")
    if not db.get(models.Class, body.class_id):
        raise HTTPException(status_code=404, detail="クラスが見つかりません")
    _validate_start_deadline(body.open_at, body.close_at, body.start_deadline)
    assignment = models.Assignment(
        title=body.title,
        problem_id=body.problem_id,
        class_id=body.class_id,
        open_at=body.open_at,
        close_at=body.close_at,
        start_deadline=body.start_deadline,
        created_by=current_user.id,
    )
    db.add(assignment)
    db.commit()
    db.refresh(assignment)
    return assignment


@router.get("/{assignment_id}", response_model=schemas.AssignmentWithProblem)
def get_assignment(
    assignment_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    assignment = db.get(models.Assignment, assignment_id)
    if not assignment:
        raise HTTPException(status_code=404, detail="課題が見つかりません")

    if current_user.role == "student":
        now = datetime.utcnow()
        # 開始前はアクセス拒否
        if now < assignment.open_at:
            raise HTTPException(status_code=403, detail="この課題はまだ開始されていません")
        # 自分のクラスの課題かチェック
        member = db.query(models.ClassMember).filter(
            models.ClassMember.user_id == current_user.id
        ).first()
        if not member or member.class_id != assignment.class_id:
            raise HTTPException(status_code=403, detail="この課題にアクセスする権限がありません")
        # 締切後はアクセス可能（提出結果確認のため）— 提出はsubmitエンドポイント側でブロック

    return assignment


@router.post("/{assignment_id}/start", response_model=schemas.AssignmentStartOut)
def start_assignment(
    assignment_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """学生が課題を開始する。既に開始済みの場合は既存の開始時刻を返す（べき等）"""
    assignment = db.get(models.Assignment, assignment_id)
    if not assignment:
        raise HTTPException(status_code=404, detail="課題が見つかりません")

    # 既存の開始記録があれば返す（ページ再読み込み・再訪問対応）
    existing = db.query(models.AssignmentStart).filter_by(
        assignment_id=assignment_id,
        user_id=current_user.id,
    ).first()
    if existing:
        return schemas.AssignmentStartOut(started_at=existing.started_at)

    now = datetime.utcnow()
    if now < assignment.open_at:
        raise HTTPException(status_code=403, detail="この課題はまだ開始されていません")
    if assignment.start_deadline is not None and now > assignment.start_deadline:
        raise HTTPException(status_code=403, detail="解答開始期限を過ぎているため、この課題を開始できません")
    if now > assignment.close_at:
        raise HTTPException(status_code=403, detail="この課題は締め切られました")

    start = models.AssignmentStart(
        assignment_id=assignment_id,
        user_id=current_user.id,
        started_at=now,
    )
    db.add(start)
    db.commit()
    return schemas.AssignmentStartOut(started_at=start.started_at)


@router.put("/{assignment_id}", response_model=schemas.AssignmentOut)
def update_assignment(
    assignment_id: int,
    body: schemas.AssignmentUpdate,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_teacher),
):
    assignment = db.get(models.Assignment, assignment_id)
    if not assignment:
        raise HTTPException(status_code=404, detail="課題が見つかりません")
    if body.title is not None:
        assignment.title = body.title
    if body.problem_id is not None:
        if not db.get(models.Problem, body.problem_id):
            raise HTTPException(status_code=404, detail="問題が見つかりません")
        assignment.problem_id = body.problem_id
    if body.class_id is not None:
        if not db.get(models.Class, body.class_id):
            raise HTTPException(status_code=404, detail="クラスが見つかりません")
        assignment.class_id = body.class_id
    if body.open_at is not None:
        assignment.open_at = body.open_at
    if body.close_at is not None:
        assignment.close_at = body.close_at

    # start_deadline は None を明示指定すると「制限なし」にリセットできる
    new_start_deadline = (
        body.start_deadline if "start_deadline" in body.model_fields_set else assignment.start_deadline
    )
    _validate_start_deadline(assignment.open_at, assignment.close_at, new_start_deadline)
    if "start_deadline" in body.model_fields_set:
        assignment.start_deadline = body.start_deadline

    db.commit()
    db.refresh(assignment)
    return assignment


@router.delete("/{assignment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_assignment(
    assignment_id: int,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_teacher),
):
    assignment = db.get(models.Assignment, assignment_id)
    if not assignment:
        raise HTTPException(status_code=404, detail="課題が見つかりません")
    db.delete(assignment)
    db.commit()
