import json
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_current_user
from .assignments import ensure_student_can_access
from .. import models, schemas
from ..judge import ConstraintSpec, HarnessError, run_judge, run_sample

router = APIRouter(prefix="/api/v1/submissions", tags=["submissions"])


_DEDUCTION_KEYS = ("deduct_warn", "deduct_var", "deduct_arr", "deduct_ptr", "deduct_loop", "deduct_if")


def _is_perfect(submission: models.Submission) -> bool:
    """全テストケースAC・減点なし（満点）の提出かどうかを判定する"""
    if submission.status != "accepted" or not submission.score_detail:
        return False
    try:
        detail = json.loads(submission.score_detail)
    except (TypeError, ValueError):
        return False
    return all(detail.get(k, 0) == 0 for k in _DEDUCTION_KEYS)


_HARNESS_ERROR_MESSAGE = "採点用プログラムに問題があるため実行できませんでした。提出は記録されていません。教員に連絡してください。"


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

    if current_user.role == "student":
        # 自分のクラスに公開済みの課題として出題されている問題のみ（未公開問題のサンプル閲覧を防ぐ）
        member = db.query(models.ClassMember).filter(models.ClassMember.user_id == current_user.id).first()
        assigned = member is not None and db.query(models.Assignment).filter(
            models.Assignment.class_id == member.class_id,
            models.Assignment.problem_id == problem.id,
            models.Assignment.open_at <= datetime.utcnow(),
        ).first() is not None
        if not assigned:
            raise HTTPException(status_code=403, detail="この問題を実行する権限がありません")

    if not problem.sample_cases:
        return schemas.SampleRunResponse(compile_error="", results=[])

    try:
        result = run_sample(
            body.code,
            problem.sample_cases,
            spec=ConstraintSpec.from_problem(problem),
            harness=problem.active_harness,
        )
    except HarnessError:
        raise HTTPException(status_code=500, detail=_HARNESS_ERROR_MESSAGE)
    return schemas.SampleRunResponse(
        compile_error=result.compile_error,
        compile_warnings=result.compile_warnings,
        constraint_warning=result.constraint_warning,
        analysis=result.analysis,
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
            ensure_student_can_access(db, current_user, assignment)
            if assignment.problem_id != body.problem_id:
                raise HTTPException(status_code=400, detail="課題と問題が一致しません")
            now = datetime.utcnow()
            if now > assignment.close_at:
                raise HTTPException(status_code=403, detail="提出期限が過ぎています")
            latest = (
                db.query(models.Submission)
                .filter(
                    models.Submission.user_id == current_user.id,
                    models.Submission.assignment_id == body.assignment_id,
                )
                .order_by(models.Submission.submitted_at.desc())
                .first()
            )
            if latest and _is_perfect(latest):
                raise HTTPException(status_code=403, detail="既に満点で提出済みのため、再提出できません")
            # 開始記録がないまま提出された場合も、開始APIと同じ条件で今この時点を開始時刻として記録する
            # （クライアント申告の elapsed_seconds で時間点を改ざんしたり、解答開始期限を回避できないように）
            if not db.query(models.AssignmentStart).filter_by(
                assignment_id=body.assignment_id, user_id=current_user.id
            ).first():
                if assignment.start_deadline is not None and now > assignment.start_deadline:
                    raise HTTPException(status_code=403, detail="解答開始期限を過ぎているため、この課題に提出できません")
                db.add(models.AssignmentStart(
                    assignment_id=body.assignment_id, user_id=current_user.id, started_at=now,
                ))
                # 提出拒否（422）でもロールバックされないよう、開始記録はここで確定させる
                db.commit()
        # AssignmentStart から開始時刻を取得してサーバー側で elapsed_seconds を計算
        start_record = db.query(models.AssignmentStart).filter_by(
            assignment_id=body.assignment_id,
            user_id=current_user.id,
        ).first()
        if start_record:
            actual_started_at = start_record.started_at
            actual_elapsed = int((datetime.utcnow() - start_record.started_at).total_seconds())

    # 採点実行（経過時間・制約値を渡す）
    try:
        judge_result = run_judge(
            body.code,
            problem.test_cases,
            spec=ConstraintSpec.from_problem(problem),
            elapsed_seconds=actual_elapsed,
            harness=problem.active_harness,
        )
    except HarnessError:
        # 採点用プログラム側の不具合は学生の責任ではないので、提出記録を作らずに中断する
        raise HTTPException(status_code=500, detail=_HARNESS_ERROR_MESSAGE)

    # 下限不足（提出拒否モード）: 提出記録を作らずに拒否する
    if judge_result.rejected:
        raise HTTPException(
            status_code=422,
            detail="提出できません。コードが問題の指定する下限を満たしていません。\n"
                   + judge_result.reject_message,
        )

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
    db.flush()

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
