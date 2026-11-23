from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import require_teacher, require_teacher_or_ta
from .. import models, schemas

router = APIRouter(prefix="/api/v1/problems", tags=["problems"])

_CONSTRAINT_ITEMS = [("vars", "変数"), ("arrays", "配列"), ("pointers", "ポインタ"), ("loops", "ループ"), ("ifs", "if文")]
_CONSTRAINT_MODES = ("deduct", "reject")


def _apply_constraints(problem: models.Problem, values: dict) -> None:
    """制約値（max_* / min_* / constraint_mode）を検証して problem に反映する。
    values に含まれる項目のみ上書きし、含まれない項目は problem の現在値を保つ。
    下限の 0 は「下限なし」と同じなので None に正規化する。"""
    merged = {}
    for key, _ in _CONSTRAINT_ITEMS:
        for prefix in ("max_", "min_"):
            attr = prefix + key
            merged[attr] = values[attr] if attr in values else getattr(problem, attr)
    mode = values["constraint_mode"] if "constraint_mode" in values else problem.constraint_mode
    mode = mode or "deduct"
    if mode not in _CONSTRAINT_MODES:
        raise HTTPException(status_code=400, detail="下限不足時の挙動は deduct か reject を指定してください")

    for key, label in _CONSTRAINT_ITEMS:
        for prefix, kind in (("max_", "上限"), ("min_", "下限")):
            v = merged[prefix + key]
            if v is None:
                continue
            if isinstance(v, bool) or not isinstance(v, int) or v < 0 or v > 1000:
                raise HTTPException(status_code=400, detail=f"{label}の{kind}は0以上1000以下の整数で指定してください")
        if merged["min_" + key] == 0:
            merged["min_" + key] = None
        lo, hi = merged["min_" + key], merged["max_" + key]
        if lo is not None and hi is not None and lo > hi:
            raise HTTPException(status_code=400, detail=f"{label}の下限（{lo}）が上限（{hi}）を超えています")

    for attr, v in merged.items():
        setattr(problem, attr, v)
    problem.constraint_mode = mode


_CONSTRAINT_FIELDS = [p + k for k, _ in _CONSTRAINT_ITEMS for p in ("max_", "min_")] + ["constraint_mode"]


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
    )
    _apply_constraints(problem, {f: getattr(body, f) for f in _CONSTRAINT_FIELDS})
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
    )
    # 旧形式のファイル（min_* / constraint_mode なし）は下限なし・減点モードとして扱う
    _apply_constraints(problem, {f: constraints[f] for f in _CONSTRAINT_FIELDS if constraints.get(f) is not None})
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
    changes = {f: getattr(body, f) for f in _CONSTRAINT_FIELDS if f in body.model_fields_set}
    if changes.get("constraint_mode", "") is None:
        del changes["constraint_mode"]
    _apply_constraints(problem, changes)
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
