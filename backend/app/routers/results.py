import csv
import io
import zipfile
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import require_teacher_or_ta
from .. import models, schemas

router = APIRouter(prefix="/api/v1/results", tags=["results"])


def _latest_submissions(db: Session, assignment_id: int) -> list[models.Submission]:
    """課題に対する各ユーザーの最新提出一覧を返す"""
    subq = (
        db.query(
            models.Submission.user_id,
            func.max(models.Submission.submitted_at).label("max_at"),
        )
        .filter(models.Submission.assignment_id == assignment_id)
        .group_by(models.Submission.user_id)
        .subquery()
    )
    return (
        db.query(models.Submission)
        .join(
            subq,
            (models.Submission.user_id == subq.c.user_id)
            & (models.Submission.submitted_at == subq.c.max_at),
        )
        .filter(models.Submission.assignment_id == assignment_id)
        .order_by(models.Submission.user_id)
        .all()
    )


@router.get("/summary", response_model=list[schemas.ResultSummaryItem])
def get_summary(
    assignment_id: int = Query(..., description="課題ID"),
    db: Session = Depends(get_db),
    _: models.User = Depends(require_teacher_or_ta),
):
    """課題に対する各ユーザーの最新提出サマリーを返す（ユーザー1人につき1件）"""
    assignment = db.get(models.Assignment, assignment_id)
    if not assignment:
        raise HTTPException(status_code=404, detail="課題が見つかりません")

    # 提出回数をユーザーごとに集計
    counts = (
        db.query(models.Submission.user_id, func.count(models.Submission.id).label("cnt"))
        .filter(models.Submission.assignment_id == assignment_id)
        .group_by(models.Submission.user_id)
        .all()
    )
    count_map = {r.user_id: r.cnt for r in counts}

    # 各ユーザーの最新提出を取得
    latest_subs = _latest_submissions(db, assignment_id)

    result = []
    for sub in latest_subs:
        username = sub.user.username if sub.user else str(sub.user_id)
        result.append(schemas.ResultSummaryItem(
            user_id=sub.user_id,
            username=username,
            score=sub.score,
            status=sub.status,
            submitted_at=sub.submitted_at,
            elapsed_seconds=sub.elapsed_seconds,
            attempt_count=count_map.get(sub.user_id, 1),
        ))

    return sorted(result, key=lambda x: x.username)


@router.get("/code/zip")
def download_code_zip(
    assignment_id: int = Query(..., description="課題ID"),
    db: Session = Depends(get_db),
    _: models.User = Depends(require_teacher_or_ta),
):
    """各学生の最新提出コードを一括でZIPダウンロード"""
    assignment = db.get(models.Assignment, assignment_id)
    if not assignment:
        raise HTTPException(status_code=404, detail="課題が見つかりません")

    subs = _latest_submissions(db, assignment_id)

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for sub in subs:
            username = sub.user.username if sub.user else str(sub.user_id)
            zf.writestr(f"{username}.c", sub.code)
    buf.seek(0)

    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="application/zip",
        headers={
            "Content-Disposition": f"attachment; filename=assignment_{assignment_id}_codes.zip"
        },
    )


@router.get("/code")
def get_code(
    assignment_id: int = Query(..., description="課題ID"),
    user_id: int = Query(..., description="ユーザーID"),
    db: Session = Depends(get_db),
    _: models.User = Depends(require_teacher_or_ta),
):
    """指定ユーザーの最新提出コードを返す"""
    sub = (
        db.query(models.Submission)
        .filter(
            models.Submission.assignment_id == assignment_id,
            models.Submission.user_id == user_id,
        )
        .order_by(models.Submission.submitted_at.desc())
        .first()
    )
    if not sub:
        raise HTTPException(status_code=404, detail="提出が見つかりません")

    return {
        "code": sub.code,
        "username": sub.user.username if sub.user else str(sub.user_id),
        "submitted_at": sub.submitted_at.isoformat(),
    }


@router.get("/csv")
def export_csv(
    assignment_id: int = Query(..., description="課題ID"),
    db: Session = Depends(get_db),
    _: models.User = Depends(require_teacher_or_ta),
):
    assignment = db.get(models.Assignment, assignment_id)
    if not assignment:
        raise HTTPException(status_code=404, detail="課題が見つかりません")

    submissions = (
        db.query(models.Submission)
        .filter(models.Submission.assignment_id == assignment_id)
        .order_by(models.Submission.user_id, models.Submission.submitted_at)
        .all()
    )

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "提出ID", "ユーザーID", "ユーザー名", "問題ID",
        "ステータス", "スコア", "提出日時", "解答開始時刻", "解答時間(秒)",
    ])

    for sub in submissions:
        writer.writerow([
            sub.id,
            sub.user_id,
            sub.user.username,
            sub.problem_id,
            sub.status,
            sub.score,
            sub.submitted_at.isoformat(),
            sub.started_at.isoformat() if sub.started_at else "",
            sub.elapsed_seconds if sub.elapsed_seconds is not None else "",
        ])

    output.seek(0)
    filename = f"assignment_{assignment_id}_results.csv"
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )
