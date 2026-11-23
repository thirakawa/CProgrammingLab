import json
import os
import re
import shutil
import subprocess
import threading
import time
import uuid
from dataclasses import dataclass, field

from .code_analyzer import CodeAnalysis, analyze

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
    rejected: bool = False         # 下限不足による提出拒否（DBには保存しない）
    reject_message: str = ""


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
    analysis: dict | None = None
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
class ConstraintSpec:
    """問題に設定されたコード制約（None = 制約なし）。mode は下限不足時の挙動のみに作用する"""
    max_vars: int | None = None
    max_arrays: int | None = None
    max_pointers: int | None = None
    max_loops: int | None = None
    max_ifs: int | None = None
    min_vars: int | None = None
    min_arrays: int | None = None
    min_pointers: int | None = None
    min_loops: int | None = None
    min_ifs: int | None = None
    mode: str = "deduct"   # deduct（減点）/ reject（下限不足は提出拒否）

    @classmethod
    def from_problem(cls, p) -> "ConstraintSpec":
        return cls(
            max_vars=p.max_vars, max_arrays=p.max_arrays, max_pointers=p.max_pointers,
            max_loops=p.max_loops, max_ifs=p.max_ifs,
            min_vars=p.min_vars or None, min_arrays=p.min_arrays or None,
            min_pointers=p.min_pointers or None, min_loops=p.min_loops or None,
            min_ifs=p.min_ifs or None,
            mode=p.constraint_mode or "deduct",
        )

    @property
    def has_any(self) -> bool:
        return any(v is not None for v in (
            self.max_vars, self.max_arrays, self.max_pointers, self.max_loops, self.max_ifs,
            self.min_vars, self.min_arrays, self.min_pointers, self.min_loops, self.min_ifs,
        ))


# (キー, 表示名, 単位, 検出数の取得, 上限属性, 下限属性)
_ITEMS = [
    ("var",  "変数の宣言数",       "個", lambda a: a.var_count,     "max_vars",     "min_vars"),
    ("arr",  "配列の宣言数",       "個", lambda a: a.array_count,   "max_arrays",   "min_arrays"),
    ("ptr",  "ポインタの宣言数",   "個", lambda a: a.pointer_count, "max_pointers", "min_pointers"),
    ("loop", "ループ（for/while）の使用数", "個", lambda a: a.loop_count, "max_loops", "min_loops"),
    ("if",   "条件分岐（if）の使用数",     "個", lambda a: a.if_count,   "max_ifs",   "min_ifs"),
]


@dataclass
class ConstraintViolations:
    """制約違反の詳細。messages / shortages のキーは var / arr / ptr / loop / if"""
    messages: dict = field(default_factory=dict)    # 上限超過・下限不足のメッセージ（減点対象）
    shortages: dict = field(default_factory=dict)   # 下限不足のみ（提出拒否の判定対象）
    analysis: CodeAnalysis | None = None

    def violated(self, key: str) -> bool:
        return key in self.messages

    @property
    def has_any(self) -> bool:
        return bool(self.messages)

    @property
    def message(self) -> str:
        return "\n".join(self.messages.values())

    @property
    def shortage_message(self) -> str:
        return "\n".join(self.shortages.values())


# ---------------------------------------------------------------------------
# コード制約チェック（宣言の検出は code_analyzer に委譲）
# ---------------------------------------------------------------------------

def check_constraints(code: str, spec: ConstraintSpec) -> ConstraintViolations:
    """コードを解析し、上限超過・下限不足を ConstraintViolations として返す"""
    analysis = analyze(code)
    v = ConstraintViolations(analysis=analysis)
    for key, label, unit, getter, max_attr, min_attr in _ITEMS:
        count = getter(analysis)
        upper = getattr(spec, max_attr)
        lower = getattr(spec, min_attr)
        if upper is not None and count > upper:
            v.messages[key] = (
                f"{label}が上限を超えています（検出: {count}{unit}、上限: {upper}{unit}、"
                f"{count - upper}{unit}超過）"
            )
        elif lower is not None and lower > 0 and count < lower:
            msg = (
                f"{label}が不足しています（検出: {count}{unit}、必要: {lower}{unit}以上、"
                f"あと{lower - count}{unit}）"
            )
            v.messages[key] = msg
            v.shortages[key] = msg
    return v


# ---------------------------------------------------------------------------
# 共通ヘルパー
# ---------------------------------------------------------------------------

def _make_tmpdir() -> str:
    tmpdir = os.path.join(JUDGE_TMPDIR, uuid.uuid4().hex)
    os.makedirs(tmpdir, exist_ok=True)
    os.chmod(tmpdir, 0o777)
    return tmpdir


MAX_OUTPUT_BYTES = 256 * 1024  # 実行結果として保持する標準出力・標準エラーの上限

# 学生コード実行用コンテナの共通の隔離オプション
_SANDBOX_OPTS = [
    "--network", "none",
    "--cap-drop", "ALL",
    "--security-opt", "no-new-privileges",
]


def _run_docker_capped(cmd: list[str], timeout: float, container_name: str) -> tuple[int, str, str]:
    """docker コマンドを実行し (returncode, stdout, stderr) を返す。

    出力は MAX_OUTPUT_BYTES までしかメモリに保持しない（超過分は読み捨てる）。
    学生コードが無限に出力してもバックエンドのメモリが枯渇しないようにするため。
    timeout 超過時は subprocess.TimeoutExpired を送出し、コンテナも強制停止する。
    """
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    bufs: dict[str, list[bytes]] = {"out": [], "err": []}

    def drain(stream, key: str) -> None:
        size = 0
        while True:
            chunk = stream.read(65536)
            if not chunk:
                break
            if size < MAX_OUTPUT_BYTES:
                bufs[key].append(chunk[: MAX_OUTPUT_BYTES - size])
            size += len(chunk)

    threads = [
        threading.Thread(target=drain, args=(proc.stdout, "out"), daemon=True),
        threading.Thread(target=drain, args=(proc.stderr, "err"), daemon=True),
    ]
    for t in threads:
        t.start()
    try:
        proc.wait(timeout=timeout)
    except subprocess.TimeoutExpired:
        proc.kill()
        subprocess.run(["docker", "kill", container_name], capture_output=True, timeout=10)
        for t in threads:
            t.join(timeout=5)
        raise
    for t in threads:
        t.join(timeout=5)
    # 従来の text=True と同じく改行コードを \n に正規化する
    decode = lambda b: b"".join(b).decode("utf-8", errors="replace").replace("\r\n", "\n").replace("\r", "\n")
    return proc.returncode, decode(bufs["out"]), decode(bufs["err"])


def _gcc(tmpdir: str, args: list[str], timeout: int = 30) -> tuple[int, str, str]:
    """ジャッジ用コンテナ内で gcc を実行する（tmpdir は /sandbox にマウント）。タイムアウト時は (-1, "", メッセージ)"""
    container_name = f"cplab-{uuid.uuid4().hex[:16]}"
    try:
        return _run_docker_capped(
            [
                "docker", "run", "--rm",
                "--name", container_name,
                "-v", f"{tmpdir}:/sandbox",
                *_SANDBOX_OPTS,
                "--memory", "128m",
                "--memory-swap", "128m",
                "--pids-limit", "128",
                "--cpus", "0.5",
                JUDGE_IMAGE,
                "gcc", *args,
            ],
            timeout=timeout,
            container_name=container_name,
        )
    except subprocess.TimeoutExpired:
        return -1, "", "コンパイルがタイムアウトしました"


def _compile(code: str, tmpdir: str) -> tuple[bool, str, str]:
    """コンパイルを実行。(success, error_message, warnings) を返す"""
    with open(os.path.join(tmpdir, "main.c"), "w", encoding="utf-8") as f:
        f.write(code)

    returncode, stdout, stderr = _gcc(
        tmpdir, ["-Wall", "-std=c99", "-o", "/sandbox/main", "/sandbox/main.c", "-lm"],
    )
    if returncode == -1:
        return False, stderr, ""
    if returncode != 0:
        return False, stderr or stdout, ""
    # returncode==0 でも stderr に警告が出る場合がある
    return True, "", stderr.strip()


class HarnessError(Exception):
    """採点用ハーネス自体のコンパイルに失敗した（学生のコードの問題ではない）。

    detail にコンパイラの生の出力を保持する。学生には見せず、教員の動作確認でのみ表示する。
    """

    def __init__(self, detail: str):
        super().__init__("採点用プログラムのコンパイルに失敗しました")
        self.detail = detail


def _explain_link_error(stderr: str) -> str:
    """リンクエラーを学生向けの説明に変換する（ハーネスの内部情報を含む生の出力は見せない）"""
    quote = r"[`'\u2018]([A-Za-z_][A-Za-z0-9_]*)['\u2019]"
    multiple = list(dict.fromkeys(re.findall(r"multiple definition of " + quote, stderr)))
    undefined = list(dict.fromkeys(re.findall(r"undefined reference to " + quote, stderr)))
    lines = []
    if "main" in multiple:
        lines.append("この問題では main 関数を定義しないでください（採点用の main が別に用意されています）。")
    others = [n for n in multiple if n != "main"]
    if others:
        lines.append("次の名前は採点用プログラムと重複しています。別の名前に変更してください: " + ", ".join(others))
    if undefined:
        lines.append(
            "次の関数が定義されていません: " + ", ".join(undefined)
            + "\n問題文で指定された関数名・引数・戻り値の型で定義されているか確認してください。"
        )
    if not lines:
        lines.append("リンクに失敗しました。問題文で指定された関数を過不足なく定義しているか確認してください。")
    return "\n".join(lines)


# ハーネス方式の中間ファイル（実行コンテナにはソースを渡さないため、リンク後に削除する）
_HARNESS_TEMP_FILES = ("harness.c", "harness.o", "student.o")


def _compile_with_harness(code: str, harness: str, tmpdir: str) -> tuple[bool, str, str]:
    """学生コードとハーネスを別々にコンパイルしてリンクする。(success, error_message, warnings)

    ハーネスのソース・オブジェクトはリンク後に削除し、実行時の /sandbox には実行ファイルしか残さない。
    ハーネス側のエラーは学生の責任ではないので HarnessError で通知する。
    """
    with open(os.path.join(tmpdir, "main.c"), "w", encoding="utf-8") as f:
        f.write(code)
    with open(os.path.join(tmpdir, "harness.c"), "w", encoding="utf-8") as f:
        f.write(harness)
    try:
        # 1) 学生コード（main を持たないので -c でオブジェクトまで）
        rc, out, err = _gcc(tmpdir, ["-Wall", "-std=c99", "-c", "-o", "/sandbox/student.o", "/sandbox/main.c"])
        if rc != 0:
            return False, err or out, ""
        warnings = err.strip()

        # 2) ハーネス（警告は無視。失敗は教員向けエラー）
        rc, out, err = _gcc(tmpdir, ["-std=c99", "-w", "-c", "-o", "/sandbox/harness.o", "/sandbox/harness.c"])
        if rc != 0:
            raise HarnessError(err or out)

        # 3) リンク
        rc, out, err = _gcc(
            tmpdir, ["-o", "/sandbox/main", "/sandbox/student.o", "/sandbox/harness.o", "-lm"],
        )
        if rc != 0:
            return False, _explain_link_error(err or out), ""
        return True, "", warnings
    finally:
        for name in _HARNESS_TEMP_FILES:
            try:
                os.remove(os.path.join(tmpdir, name))
            except OSError:
                pass


def _build(code: str, harness: str | None, tmpdir: str) -> tuple[bool, str, str]:
    """問題タイプに応じてコンパイルする（harness があればハーネス方式）"""
    if harness:
        return _compile_with_harness(code, harness, tmpdir)
    return _compile(code, tmpdir)


TLE_SECONDS = 5  # タイムアウト秒数

# コンパイル成果物として tmpdir に残しておくファイル（添付ファイルの入れ替え時に消さない）
_KEEP_FILES = {"main.c", "main"}


def _prepare_case_files(tmpdir: str, files) -> None:
    """テストケース実行前に、前のケースで配置した添付ファイルを消してから今回のケースの分を書き込む

    ソースコード・コンパイル済み実行ファイルと同じディレクトリ（/sandbox にマウントされる tmpdir）に
    テストケースごとの *.txt / *.csv を配置することで、プログラムが fopen 等でファイルを開けるようにする。
    """
    for name in os.listdir(tmpdir):
        if name in _KEEP_FILES:
            continue
        path = os.path.join(tmpdir, name)
        if os.path.isfile(path):
            try:
                os.remove(path)
            except OSError:
                pass
    for f in files or []:
        with open(os.path.join(tmpdir, f.filename), "w", encoding="utf-8") as fh:
            fh.write(f.content)


def _run_one(tmpdir: str, input_data: str, files=None) -> tuple[str, str, int]:
    """1ケース実行。(status, output, time_ms) を返す。5秒超過で TLE"""
    _prepare_case_files(tmpdir, files)
    # コンテナに名前を付けてタイムアウト時に強制停止できるようにする
    container_name = f"cplab-{uuid.uuid4().hex[:16]}"
    start = time.monotonic()
    try:
        returncode, stdout, stderr = _run_docker_capped(
            [
                "docker", "run", "--rm",
                "--name", container_name,
                "-v", f"{tmpdir}:/sandbox",
                *_SANDBOX_OPTS,
                "--memory", "64m",
                "--memory-swap", "64m",
                "--pids-limit", "64",
                "--cpus", "1",
                JUDGE_IMAGE,
                # コンテナ内の timeout コマンドで TLE_SECONDS 後に強制終了
                "sh", "-c",
                f"echo {_shell_quote(input_data)} | timeout {TLE_SECONDS} /sandbox/main",
            ],
            timeout=TLE_SECONDS + 5,  # Dockerオーバーヘッド分の余裕
            container_name=container_name,
        )
        elapsed_ms = int((time.monotonic() - start) * 1000)

        if returncode == 124:   # timeout コマンドの終了コード
            return "time_limit_exceeded", "", elapsed_ms
        if returncode != 0:
            return "runtime_error", stderr or stdout, elapsed_ms
        return "ok", stdout, elapsed_ms

    except subprocess.TimeoutExpired:
        elapsed_ms = int((time.monotonic() - start) * 1000)
        return "time_limit_exceeded", "", elapsed_ms


# ---------------------------------------------------------------------------
# メイン採点
# ---------------------------------------------------------------------------

def run_judge(
    code: str,
    test_cases: list,
    spec: ConstraintSpec | None = None,
    elapsed_seconds: int | None = None,
    harness: str | None = None,
) -> JudgeResult:
    """学生のCコードをDockerコンテナ内でコンパイル・実行して採点する。

    harness を渡すと関数定義型（ハーネス方式）: 学生コードと harness を結合して実行する。
    ハーネス自体のコンパイル失敗は HarnessError として送出する。
    """
    tmpdir = _make_tmpdir()
    try:
        # コンパイル（失敗は即終了）
        ok, err, warnings = _build(code, harness, tmpdir)
        if not ok:
            return JudgeResult(
                status="CE",
                score=0.0,
                compile_error=err,
                compile_warnings="",
                constraint_error="",
            )

        # 制約チェック（上限超過・下限不足は減点。reject モードの下限不足のみ提出拒否）
        spec = spec or ConstraintSpec()
        violations = check_constraints(code, spec)
        if spec.mode == "reject" and violations.shortages:
            return JudgeResult(
                status="REJECTED",
                score=0.0,
                compile_error="",
                compile_warnings=warnings,
                constraint_error=violations.shortage_message,
                rejected=True,
                reject_message=violations.shortage_message,
            )

        # 各テストケースを実行
        test_results: list[TestCaseResult] = []
        passed = 0

        for tc in test_cases:
            status_raw, output, elapsed_ms = _run_one(tmpdir, tc.input, tc.files)
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
        deduct_var  = float(DEDUCT_VAR)  if violations.violated("var")  else 0.0
        deduct_arr  = float(DEDUCT_ARR)  if violations.violated("arr")  else 0.0
        deduct_ptr  = float(DEDUCT_PTY)  if violations.violated("ptr")  else 0.0
        deduct_loop = float(DEDUCT_LOOP) if violations.violated("loop") else 0.0
        deduct_if   = float(DEDUCT_IF)   if violations.violated("if")   else 0.0

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
            "analysis":     violations.analysis.to_dict() if violations.analysis else None,
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
    spec: ConstraintSpec | None = None,
    harness: str | None = None,
) -> SampleRunResult:
    """サンプルケースに対して実行する（採点には影響しない）。制約違反は警告として返す"""
    tmpdir = _make_tmpdir()
    try:
        ok, err, compile_warnings = _build(code, harness, tmpdir)
        if not ok:
            return SampleRunResult(compile_error=err)

        # 制約チェック（違反しても実行は続行し、警告として返す）
        violations = check_constraints(code, spec or ConstraintSpec())
        constraint_warning = violations.message

        results: list[SampleResult] = []
        for sc in sample_cases:
            status_raw, output, elapsed_ms = _run_one(tmpdir, sc.input, sc.files)
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
            analysis=violations.analysis.to_dict() if violations.analysis else None,
            results=results,
        )

    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)


def _shell_quote(s: str) -> str:
    """シェルインジェクション防止のため文字列をシングルクォートで囲む"""
    return "'" + s.replace("'", "'\\''") + "'"
