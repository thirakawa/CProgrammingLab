import json
import os
import re
import shutil
import subprocess
import time
import uuid
from dataclasses import dataclass, field

JUDGE_IMAGE = "cprogramlab-judge:latest"

# ホストとバックエンドコンテナで同じパスを共有するディレクトリ
# docker-compose.yml で /tmp/cprogramlab:/tmp/cprogramlab としてマウントされている
JUDGE_TMPDIR = os.environ.get("JUDGE_TMPDIR", "/tmp/cprogramlab")
os.makedirs(JUDGE_TMPDIR, exist_ok=True)


@dataclass
class TestCaseResult:
    test_case_id: int
    status: str  # accepted / wrong_answer / compile_error / runtime_error / time_limit_exceeded
    output: str
    time_ms: int


@dataclass
class JudgeResult:
    status: str
    score: float
    compile_error: str
    compile_warnings: str
    constraint_error: str          # 後方互換のために保持（新採点では減点情報のみ）
    score_detail: str = ""         # JSON 形式の点数内訳
    test_results: list[TestCaseResult] = field(default_factory=list)


@dataclass
class SampleResult:
    order_index: int
    input: str
    expected_output: str
    actual_output: str
    status: str
    time_ms: int


@dataclass
class SampleRunResult:
    compile_error: str
    compile_warnings: str = ""
    constraint_warning: str = ""
    results: list[SampleResult] = field(default_factory=list)


# ---------------------------------------------------------------------------
# 採点定数
# ---------------------------------------------------------------------------
SCORE_BASE  = 50   # テストケース正解数に応じた点数（満点）
SCORE_CLEAR = 20   # 全テストケース合格ボーナス
SCORE_TIME  = 30   # 時間点（満点）。3分ごとに1点減点、90分で0点
# 減点値
DEDUCT_WARN = 20   # コンパイル警告
DEDUCT_VAR  = 20   # 変数数超過
DEDUCT_ARR  = 20   # 配列数超過
DEDUCT_PTY  = 20   # ポインタ数超過
DEDUCT_LOOP = 10   # ループ数超過
DEDUCT_IF   = 10   # if 文数超過


def _calc_time_score(elapsed_seconds: int | None) -> float:
    """経過時間から時間点を計算する（3分ごとに1点減点、90分で0点）"""
    if elapsed_seconds is None:
        return float(SCORE_TIME)   # 不明時は満点
    deduction = elapsed_seconds // 180   # 3分 = 180秒
    return float(max(0, SCORE_TIME - deduction))


@dataclass
class ConstraintViolations:
    """制約違反の詳細（フィールドが空文字 = 違反なし）"""
    var_violation: str = ""
    array_violation: str = ""
    pointer_violation: str = ""
    loop_violation: str = ""
    if_violation: str = ""

    @property
    def has_any(self) -> bool:
        return bool(
            self.var_violation or self.array_violation or self.pointer_violation
            or self.loop_violation or self.if_violation
        )

    @property
    def message(self) -> str:
        parts = [m for m in [
            self.var_violation, self.array_violation, self.pointer_violation,
            self.loop_violation, self.if_violation,
        ] if m]
        return "\n".join(parts)


# ---------------------------------------------------------------------------
# コード制約チェック
# ---------------------------------------------------------------------------

def _strip_comments(code: str) -> str:
    """コメントと文字列リテラルを除去する"""
    # 行コメント
    code = re.sub(r'//[^\n]*', '', code)
    # ブロックコメント
    code = re.sub(r'/\*.*?\*/', '', code, flags=re.DOTALL)
    # 文字列リテラル
    code = re.sub(r'"(?:[^"\\]|\\.)*"', '""', code)
    # 文字リテラル
    code = re.sub(r"'(?:[^'\\]|\\.)*'", "''", code)
    return code


# C言語の基本型パターン（複合型も含む）
_C_TYPES = (
    r'(?:(?:unsigned|signed|long|short)\s+)*'
    r'(?:int|char|float|double|void|bool|_Bool|size_t|'
    r'uint8_t|uint16_t|uint32_t|uint64_t|'
    r'int8_t|int16_t|int32_t|int64_t)'
)

# 変数宣言文のパターン: 型 宣言子リスト ;
# 関数定義・プロトタイプ（後ろに{や(が来る）は除外
_DECL_PAT = re.compile(
    _C_TYPES + r'\s+([^;{}\n()]+);'
)


def _count_declarations(code: str) -> tuple[int, int, int]:
    """変数・配列・ポインタの宣言数をカウントして返す (vars, arrays, pointers)"""
    clean = _strip_comments(code)
    var_count = arr_count = ptr_count = 0

    for m in _DECL_PAT.finditer(clean):
        decl_list = m.group(1)
        for part in decl_list.split(','):
            part = part.split('=')[0].strip()    # 初期化子を除去
            if not re.search(r'[a-zA-Z_]\w*', part):
                continue
            if '[' in part:
                arr_count += 1
            elif '*' in part:
                ptr_count += 1
            else:
                var_count += 1

    return var_count, arr_count, ptr_count


def _count_control_flow(code: str) -> tuple[int, int]:
    """ループ数・if数をカウントして返す (loops, ifs)

    ループ: for / while キーワードの出現回数（do-while の while も1回）
    if: if キーワードの出現回数（else if の if も1回としてカウント）
    """
    clean = _strip_comments(code)
    loops = len(re.findall(r'\b(?:for|while)\b', clean))
    ifs = len(re.findall(r'\bif\b', clean))
    return loops, ifs


def check_constraints(
    code: str,
    max_vars: int | None,
    max_arrays: int | None,
    max_pointers: int | None,
    max_loops: int | None,
    max_ifs: int | None,
) -> ConstraintViolations:
    """制約チェックを実行して ConstraintViolations を返す"""
    v = ConstraintViolations()
    if all(x is None for x in (max_vars, max_arrays, max_pointers, max_loops, max_ifs)):
        return v

    var_count, arr_count, ptr_count = _count_declarations(code)
    loop_count, if_count = _count_control_flow(code)

    if max_vars is not None and var_count > max_vars:
        v.var_violation = f"変数の宣言数が制限を超えています（宣言数: {var_count}, 上限: {max_vars}）"
    if max_arrays is not None and arr_count > max_arrays:
        v.array_violation = f"配列の宣言数が制限を超えています（宣言数: {arr_count}, 上限: {max_arrays}）"
    if max_pointers is not None and ptr_count > max_pointers:
        v.pointer_violation = f"ポインタの宣言数が制限を超えています（宣言数: {ptr_count}, 上限: {max_pointers}）"
    if max_loops is not None and loop_count > max_loops:
        v.loop_violation = f"ループ（for/while）の使用数が制限を超えています（使用数: {loop_count}, 上限: {max_loops}）"
    if max_ifs is not None and if_count > max_ifs:
        v.if_violation = f"条件分岐（if）の使用数が制限を超えています（使用数: {if_count}, 上限: {max_ifs}）"
    return v


# ---------------------------------------------------------------------------
# 共通ヘルパー
# ---------------------------------------------------------------------------

def _make_tmpdir() -> str:
    tmpdir = os.path.join(JUDGE_TMPDIR, uuid.uuid4().hex)
    os.makedirs(tmpdir, exist_ok=True)
    os.chmod(tmpdir, 0o777)
    return tmpdir


def _compile(code: str, tmpdir: str) -> tuple[bool, str, str]:
    """コンパイルを実行。(success, error_message, warnings) を返す"""
    src_path = os.path.join(tmpdir, "main.c")
    with open(src_path, "w", encoding="utf-8") as f:
        f.write(code)

    result = subprocess.run(
        [
            "docker", "run", "--rm",
            "-v", f"{tmpdir}:/sandbox",
            "--network", "none",
            "--memory", "128m",
            "--cpus", "0.5",
            JUDGE_IMAGE,
            "gcc", "-Wall", "-std=c99", "-o", "/sandbox/main", "/sandbox/main.c", "-lm",
        ],
        capture_output=True,
        text=True,
        timeout=30,
    )
    if result.returncode != 0:
        return False, result.stderr or result.stdout, ""
    # returncode==0 でも stderr に警告が出る場合がある
    warnings = result.stderr.strip()
    return True, "", warnings


TLE_SECONDS = 5  # タイムアウト秒数


def _run_one(tmpdir: str, input_data: str) -> tuple[str, str, int]:
    """1ケース実行。(status, output, time_ms) を返す。5秒超過で TLE"""
    # コンテナに名前を付けてタイムアウト時に強制停止できるようにする
    container_name = f"cplab-{uuid.uuid4().hex[:16]}"
    start = time.monotonic()
    try:
        result = subprocess.run(
            [
                "docker", "run", "--rm",
                "--name", container_name,
                "-v", f"{tmpdir}:/sandbox",
                "--network", "none",
                "--memory", "64m",
                JUDGE_IMAGE,
                # コンテナ内の timeout コマンドで TLE_SECONDS 後に強制終了
                "sh", "-c",
                f"echo {_shell_quote(input_data)} | timeout {TLE_SECONDS} /sandbox/main",
            ],
            capture_output=True,
            text=True,
            timeout=TLE_SECONDS + 5,  # Dockerオーバーヘッド分の余裕
        )
        elapsed_ms = int((time.monotonic() - start) * 1000)

        if result.returncode == 124:   # timeout コマンドの終了コード
            return "time_limit_exceeded", "", elapsed_ms
        if result.returncode != 0:
            return "runtime_error", result.stderr or result.stdout, elapsed_ms
        return "ok", result.stdout, elapsed_ms

    except subprocess.TimeoutExpired:
        elapsed_ms = int((time.monotonic() - start) * 1000)
        # コンテナが残っている場合は強制停止
        subprocess.run(["docker", "kill", container_name], capture_output=True, timeout=5)
        return "time_limit_exceeded", "", elapsed_ms


# ---------------------------------------------------------------------------
# メイン採点
# ---------------------------------------------------------------------------

def run_judge(
    code: str,
    test_cases: list,
    max_vars: int | None = None,
    max_arrays: int | None = None,
    max_pointers: int | None = None,
    max_loops: int | None = None,
    max_ifs: int | None = None,
    elapsed_seconds: int | None = None,
) -> JudgeResult:
    """学生のCコードをDockerコンテナ内でコンパイル・実行して採点する"""
    tmpdir = _make_tmpdir()
    try:
        # コンパイル（失敗は即終了）
        ok, err, warnings = _compile(code, tmpdir)
        if not ok:
            return JudgeResult(
                status="CE",
                score=0.0,
                compile_error=err,
                compile_warnings="",
                constraint_error="",
            )

        # 制約チェック（違反しても実行継続、減点で対応）
        violations = check_constraints(code, max_vars, max_arrays, max_pointers, max_loops, max_ifs)

        # 各テストケースを実行
        test_results: list[TestCaseResult] = []
        passed = 0

        for tc in test_cases:
            status_raw, output, elapsed_ms = _run_one(tmpdir, tc.input)
            if status_raw == "ok":
                if output.strip() == tc.expected_output.strip():
                    status = "accepted"
                    passed += 1
                else:
                    status = "wrong_answer"
            else:
                status = status_raw

            test_results.append(TestCaseResult(
                test_case_id=tc.id,
                status=status,
                output=output,
                time_ms=elapsed_ms,
            ))

        total = len(test_cases)

        # ---- 新採点ロジック ----
        score_base  = round((passed / total * SCORE_BASE) if total > 0 else 0.0, 2)
        score_clear = float(SCORE_CLEAR) if (passed == total and total > 0) else 0.0
        score_time  = _calc_time_score(elapsed_seconds)

        deduct_warn = float(DEDUCT_WARN) if warnings else 0.0
        deduct_var  = float(DEDUCT_VAR)  if violations.var_violation     else 0.0
        deduct_arr  = float(DEDUCT_ARR)  if violations.array_violation   else 0.0
        deduct_ptr  = float(DEDUCT_PTY)  if violations.pointer_violation else 0.0
        deduct_loop = float(DEDUCT_LOOP) if violations.loop_violation    else 0.0
        deduct_if   = float(DEDUCT_IF)   if violations.if_violation      else 0.0

        total_deduct = deduct_warn + deduct_var + deduct_arr + deduct_ptr + deduct_loop + deduct_if
        final_score = max(0.0, score_base + score_clear + score_time - total_deduct)
        final_score = round(final_score, 2)

        score_detail = json.dumps({
            "score_base":   score_base,
            "score_clear":  score_clear,
            "score_time":   score_time,
            "deduct_warn":  deduct_warn,
            "deduct_var":   deduct_var,
            "deduct_arr":   deduct_arr,
            "deduct_ptr":   deduct_ptr,
            "deduct_loop":  deduct_loop,
            "deduct_if":    deduct_if,
            "total":        final_score,
            "passed":       passed,
            "total_cases":  total,
            "constraint_message": violations.message,
        }, ensure_ascii=False)

        # 全体ステータスはテストケース結果のみで決定
        if passed == total and total > 0:
            overall = "accepted"
        else:
            non_ac = {tr.status for tr in test_results if tr.status != "accepted"}
            if "time_limit_exceeded" in non_ac:
                overall = "time_limit_exceeded"
            elif "runtime_error" in non_ac:
                overall = "runtime_error"
            else:
                overall = "wrong_answer"

        return JudgeResult(
            status=overall,
            score=final_score,
            compile_error="",
            compile_warnings=warnings,
            constraint_error=violations.message,   # 後方互換用
            score_detail=score_detail,
            test_results=test_results,
        )

    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)


# ---------------------------------------------------------------------------
# サンプル実行（DBに保存しない）
# ---------------------------------------------------------------------------

def run_sample(
    code: str,
    sample_cases: list,
    max_vars: int | None = None,
    max_arrays: int | None = None,
    max_pointers: int | None = None,
    max_loops: int | None = None,
    max_ifs: int | None = None,
) -> SampleRunResult:
    """サンプルケースに対して実行する（採点には影響しない）。制約違反は警告として返す"""
    tmpdir = _make_tmpdir()
    try:
        ok, err, compile_warnings = _compile(code, tmpdir)
        if not ok:
            return SampleRunResult(compile_error=err)

        # 制約チェック（違反しても実行は続行し、警告として返す）
        violations = check_constraints(
            code, max_vars, max_arrays, max_pointers, max_loops, max_ifs
        )
        constraint_warning = violations.message

        results: list[SampleResult] = []
        for sc in sample_cases:
            status_raw, output, elapsed_ms = _run_one(tmpdir, sc.input)
            if status_raw == "ok":
                status = "accepted" if output.strip() == sc.expected_output.strip() else "wrong_answer"
            else:
                status = status_raw

            results.append(SampleResult(
                order_index=sc.order_index,
                input=sc.input,
                expected_output=sc.expected_output,
                actual_output=output,
                status=status,
                time_ms=elapsed_ms,
            ))

        return SampleRunResult(
            compile_error="",
            compile_warnings=compile_warnings,
            constraint_warning=constraint_warning,
            results=results,
        )

    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)


def _shell_quote(s: str) -> str:
    """シェルインジェクション防止のため文字列をシングルクォートで囲む"""
    return "'" + s.replace("'", "'\\''") + "'"
