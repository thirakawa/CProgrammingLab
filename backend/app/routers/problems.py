import re
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import require_teacher, require_teacher_or_ta
from .. import models, schemas
from ..judge import ConstraintSpec, HarnessError, run_sample

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


_PROBLEM_TYPES = ("program", "function")
_TYPE_FIELDS = ["problem_type", "template_code", "harness_code"]


def _apply_problem_type(problem: models.Problem, values: dict) -> None:
    """問題タイプ（program / function）・初期コード・ハーネスを検証して反映する。
    values に含まれる項目のみ上書きする。ハーネスは function 以外では使われないが、
    タイプ切替で消えないよう値は保持する。"""
    ptype = (values["problem_type"] if "problem_type" in values else problem.problem_type) or "program"
    template = values["template_code"] if "template_code" in values else problem.template_code
    harness = values["harness_code"] if "harness_code" in values else problem.harness_code
    if ptype not in _PROBLEM_TYPES:
        raise HTTPException(status_code=400, detail="問題タイプは program か function を指定してください")
    template = template if template and template.strip() else None
    harness = harness if harness and harness.strip() else None
    if ptype == "function":
        if harness is None:
            raise HTTPException(status_code=400, detail="関数定義型の問題には採点用ハーネス（main関数を含むCコード）が必要です")
        if not re.search(r"\bmain\s*\(", harness):
            raise HTTPException(status_code=400, detail="採点用ハーネスに main 関数が見つかりません")
    problem.problem_type = ptype
    problem.template_code = template
    problem.harness_code = harness


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
    _apply_problem_type(problem, {f: getattr(body, f) for f in _TYPE_FIELDS})
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
    # 旧形式のファイル（problem_type なし）は通常のプログラム問題として取り込む
    _apply_problem_type(problem, {
        "problem_type": body.problem_type or "program",
        "template_code": body.template_code,
        "harness_code": body.harness_code,
    })
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
    _apply_problem_type(problem, {f: getattr(body, f) for f in _TYPE_FIELDS
                                  if f in body.model_fields_set and (f != "problem_type" or body.problem_type is not None)})
    problem.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(problem)
    return problem


@router.post("/{problem_id}/verify", response_model=schemas.SampleRunResponse)
def verify_problem(
    problem_id: int,
    body: schemas.ProblemVerifyRequest,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_teacher),
):
    """模範解答を全テストケース（非公開分）で実行して、ハーネス・テストケースの動作を確認する（DBには保存しない）。
    ハーネス自体のコンパイルエラーは詳細つきで返す（学生向けの採点では非表示）"""
    problem = db.get(models.Problem, problem_id)
    if not problem:
        raise HTTPException(status_code=404, detail="問題が見つかりません")
    try:
        result = run_sample(
            body.code, problem.test_cases,
            spec=ConstraintSpec.from_problem(problem), harness=problem.active_harness,
        )
    except HarnessError as e:
        return schemas.SampleRunResponse(compile_error="【採点用ハーネスのコンパイルエラー】\n" + e.detail, results=[])
    return schemas.SampleRunResponse(
        compile_error=result.compile_error,
        compile_warnings=result.compile_warnings,
        constraint_warning=result.constraint_warning,
        analysis=result.analysis,
        results=[
            schemas.SampleCaseRunResult(
                order_index=r.order_index, input=r.input, expected_output=r.expected_output,
                actual_output=r.actual_output, status=r.status, time_ms=r.time_ms,
            )
            for r in result.results
        ],
    )


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
