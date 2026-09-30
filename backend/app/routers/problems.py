from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import require_teacher, require_teacher_or_ta
from .. import models, schemas

router = APIRouter(prefix="/api/v1/problems", tags=["problems"])


@router.get("", response_model=list[schemas.ProblemOut])
def list_problems(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_teacher_or_ta),
):
    """問題一覧（テストケース・サンプルケースを含む全内容）。教員・TAのみ閲覧可能。
    学生は非公開のテストケースを含むこの一覧にはアクセスできない（課題経由でのみ問題を閲覧する）"""
    return db.query(models.Problem).all()


@router.post("", response_model=schemas.ProblemOut, status_code=status.HTTP_201_CREATED)
def create_problem(
    body: schemas.ProblemCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_teacher),
):
    problem = models.Problem(
        title=body.title,
        description=body.description,
        created_by=current_user.id,
        max_vars=body.max_vars,
        max_arrays=body.max_arrays,
        max_pointers=body.max_pointers,
        max_loops=body.max_loops,
        max_ifs=body.max_ifs,
    )
    db.add(problem)
    db.commit()
    db.refresh(problem)
    return problem


@router.post("/import", response_model=schemas.ProblemImportResult, status_code=status.HTTP_201_CREATED)
def import_problem(
    body: schemas.ProblemImportRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_teacher),
):
    """1問分の JSON ファイルからインポートする"""
    constraints = body.constraints or {}
    problem = models.Problem(
        title=body.title,
        description=body.description,
        created_by=current_user.id,
        max_vars=constraints.get("max_vars"),
        max_arrays=constraints.get("max_arrays"),
        max_pointers=constraints.get("max_pointers"),
        max_loops=constraints.get("max_loops"),
        max_ifs=constraints.get("max_ifs"),
    )
    db.add(problem)
    db.flush()
    for i, sc in enumerate(body.sample_cases):
        sample_case = models.SampleCase(
            problem_id=problem.id,
            input=sc.input,
            expected_output=sc.expected_output,
            order_index=i,
        )
        db.add(sample_case)
        db.flush()
        for f in sc.files:
            db.add(models.SampleCaseFile(sample_case_id=sample_case.id, filename=f.filename, content=f.content))
    for i, tc in enumerate(body.test_cases):
        test_case = models.TestCase(
            problem_id=problem.id,
            input=tc.input,
            expected_output=tc.expected_output,
            order_index=i,
        )
        db.add(test_case)
        db.flush()
        for f in tc.files:
            db.add(models.TestCaseFile(test_case_id=test_case.id, filename=f.filename, content=f.content))
    db.commit()
    return schemas.ProblemImportResult(title=body.title)


@router.get("/{problem_id}", response_model=schemas.ProblemOut)
def get_problem(
    problem_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_teacher_or_ta),
):
    """問題の全内容（テストケース含む）。教員・TAのみ閲覧可能（学生は課題経由でのみ閲覧）"""
    problem = db.get(models.Problem, problem_id)
    if not problem:
        raise HTTPException(status_code=404, detail="問題が見つかりません")
    return problem


@router.put("/{problem_id}", response_model=schemas.ProblemOut)
def update_problem(
    problem_id: int,
    body: schemas.ProblemUpdate,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_teacher),
):
    problem = db.get(models.Problem, problem_id)
    if not problem:
        raise HTTPException(status_code=404, detail="問題が見つかりません")
    if body.title is not None:
        problem.title = body.title
    if body.description is not None:
        problem.description = body.description
    # 制約値は明示的に None を渡すと「制限なし」にリセットできる
    # ProblemUpdate のフィールドはすべて Optional なので model_fields_set で判定
    if "max_vars" in body.model_fields_set:
        problem.max_vars = body.max_vars
    if "max_arrays" in body.model_fields_set:
        problem.max_arrays = body.max_arrays
    if "max_pointers" in body.model_fields_set:
        problem.max_pointers = body.max_pointers
    if "max_loops" in body.model_fields_set:
        problem.max_loops = body.max_loops
    if "max_ifs" in body.model_fields_set:
        problem.max_ifs = body.max_ifs
    problem.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(problem)
    return problem


@router.delete("/{problem_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_problem(
    problem_id: int,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_teacher),
):
    problem = db.get(models.Problem, problem_id)
    if not problem:
        raise HTTPException(status_code=404, detail="問題が見つかりません")
    db.delete(problem)
    db.commit()


# ---------------------------------------------------------------------------
# テストケース
# ---------------------------------------------------------------------------

@router.post("/{problem_id}/test_cases", response_model=schemas.TestCaseOut, status_code=status.HTTP_201_CREATED)
def add_test_case(
    problem_id: int,
    body: schemas.TestCaseCreate,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_teacher),
):
    if not db.get(models.Problem, problem_id):
        raise HTTPException(status_code=404, detail="問題が見つかりません")
    tc = models.TestCase(
        problem_id=problem_id,
        input=body.input,
        expected_output=body.expected_output,
        order_index=body.order_index,
    )
    db.add(tc)
    db.flush()
    for f in body.files:
        db.add(models.TestCaseFile(test_case_id=tc.id, filename=f.filename, content=f.content))
    db.commit()
    db.refresh(tc)
    return tc


@router.delete("/{problem_id}/test_cases/{tc_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_test_case(
    problem_id: int,
    tc_id: int,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_teacher),
):
    tc = db.query(models.TestCase).filter(
        models.TestCase.id == tc_id,
        models.TestCase.problem_id == problem_id,
    ).first()
    if not tc:
        raise HTTPException(status_code=404, detail="テストケースが見つかりません")
    db.delete(tc)
    db.commit()


# ---------------------------------------------------------------------------
# サンプルケース
# ---------------------------------------------------------------------------

@router.post("/{problem_id}/sample_cases", response_model=schemas.SampleCaseOut, status_code=status.HTTP_201_CREATED)
def add_sample_case(
    problem_id: int,
    body: schemas.SampleCaseCreate,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_teacher),
):
    if not db.get(models.Problem, problem_id):
        raise HTTPException(status_code=404, detail="問題が見つかりません")
    sc = models.SampleCase(
        problem_id=problem_id,
        input=body.input,
        expected_output=body.expected_output,
        order_index=body.order_index,
    )
    db.add(sc)
    db.flush()
    for f in body.files:
        db.add(models.SampleCaseFile(sample_case_id=sc.id, filename=f.filename, content=f.content))
    db.commit()
    db.refresh(sc)
    return sc


@router.delete("/{problem_id}/sample_cases/{sc_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_sample_case(
    problem_id: int,
    sc_id: int,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_teacher),
):
    sc = db.query(models.SampleCase).filter(
        models.SampleCase.id == sc_id,
        models.SampleCase.problem_id == problem_id,
    ).first()
    if not sc:
        raise HTTPException(status_code=404, detail="サンプルケースが見つかりません")
    db.delete(sc)
    db.commit()
