from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_current_user, require_teacher
from .. import models, schemas
from ..judge import run_judge, run_sample

router = APIRouter(prefix="/api/v1/submissions", tags=["submissions"])


@router.post("/run", response_model=schemas.SampleRunResponse)
def run_sample_cases(
    body: schemas.SampleRunRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """サンプルケースで試し実行する（DBに保存しない）"""
    problem = db.get(models.Problem, body.problem_id)
    if not problem:
        raise HTTPException(status_code=404, detail="問題が見つかりません")

    if not problem.sample_cases:
        return schemas.SampleRunResponse(compile_error="", results=[])

    result = run_sample(
        body.code,
        problem.sample_cases,
        max_vars=problem.max_vars,
        max_arrays=problem.max_arrays,
        max_pointers=problem.max_pointers,
        max_loops=problem.max_loops,
        max_ifs=problem.max_ifs,
    )
    return schemas.SampleRunResponse(
        compile_error=result.compile_error,
        compile_warnings=result.compile_warnings,
        constraint_warning=result.constraint_warning,
        results=[
            schemas.SampleCaseRunResult(
                order_index=r.order_index,
                input=r.input,
                expected_output=r.expected_output,
                actual_output=r.actual_output,
                status=r.status,
                time_ms=r.time_ms,
            )
            for r in result.results
        ],
    )


@router.post("", response_model=schemas.SubmissionOut, status_code=status.HTTP_201_CREATED)
def submit(
    body: schemas.SubmissionCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    problem = db.get(models.Problem, body.problem_id)
    if not problem:
        raise HTTPException(status_code=404, detail="問題が見つかりません")

    actual_started_at = body.started_at
    actual_elapsed = body.elapsed_seconds

    if body.assignment_id:
        assignment = db.get(models.Assignment, body.assignment_id)
        if not assignment:
            raise HTTPException(status_code=404, detail="課題が見つかりません")
        if current_user.role == "student":
            now = datetime.utcnow()
            if now > assignment.close_at:
                raise HTTPException(status_code=403, detail="提出期限が過ぎています")
        # AssignmentStart から開始時刻を取得してサーバー側で elapsed_seconds を計算
        start_record = db.query(models.AssignmentStart).filter_by(
            assignment_id=body.assignment_id,
            user_id=current_user.id,
        ).first()
        if start_record:
            actual_started_at = start_record.started_at
            actual_elapsed = int((datetime.utcnow() - start_record.started_at).total_seconds())

    submission = models.Submission(
        user_id=current_user.id,
        problem_id=body.problem_id,
        assignment_id=body.assignment_id,
        code=body.code,
        status="judging",
        score=0.0,
        started_at=actual_started_at,
        elapsed_seconds=actual_elapsed,
    )
    db.add(submission)
    db.commit()
    db.refresh(submission)

    # 採点実行（経過時間・制約値を渡す）
    judge_result = run_judge(
        body.code,
        problem.test_cases,
        max_vars=problem.max_vars,
        max_arrays=problem.max_arrays,
        max_pointers=problem.max_pointers,
        max_loops=problem.max_loops,
        max_ifs=problem.max_ifs,
        elapsed_seconds=actual_elapsed,
    )

    submission.compile_warnings = judge_result.compile_warnings or None
    submission.score_detail = judge_result.score_detail or None

    if judge_result.compile_error:
        submission.status = "CE"
        submission.score = 0.0
        for tc in problem.test_cases:
            db.add(models.SubmissionResult(
                submission_id=submission.id,
                test_case_id=tc.id,
                status="CE",
                output=judge_result.compile_error,
                time_ms=None,
            ))
    else:
        # 制約違反は減点済みスコアに反映済み（score_detail に内訳あり）
        submission.status = judge_result.status
        submission.score = judge_result.score
        for tr in judge_result.test_results:
            db.add(models.SubmissionResult(
                submission_id=submission.id,
                test_case_id=tr.test_case_id,
                status=tr.status,
                output=tr.output,
                time_ms=tr.time_ms,
            ))

    db.commit()
    db.refresh(submission)
    return submission


@router.get("/my_latest", response_model=schemas.SubmissionOut)
def get_my_latest(
    assignment_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """現在のユーザーの指定課題の最新提出を返す"""
    sub = (
        db.query(models.Submission)
        .filter(
            models.Submission.user_id == current_user.id,
            models.Submission.assignment_id == assignment_id,
        )
        .order_by(models.Submission.submitted_at.desc())
        .first()
    )
    if not sub:
        raise HTTPException(status_code=404, detail="提出がありません")
    return sub


@router.get("", response_model=list[schemas.SubmissionSummary])
def list_submissions(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if current_user.role == "teacher":
        return db.query(models.Submission).order_by(models.Submission.submitted_at.desc()).all()
    return (
        db.query(models.Submission)
        .filter(models.Submission.user_id == current_user.id)
        .order_by(models.Submission.submitted_at.desc())
        .all()
    )


@router.get("/{submission_id}", response_model=schemas.SubmissionOut)
def get_submission(
    submission_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    submission = db.get(models.Submission, submission_id)
    if not submission:
        raise HTTPException(status_code=404, detail="提出が見つかりません")
    if current_user.role == "student" and submission.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="他の学生の提出は閲覧できません")
    return submission
