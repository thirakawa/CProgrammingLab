import re
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field, field_validator


# --- User ---
class UserCreate(BaseModel):
    username: str
    password: str
    role: str = "student"


class UserUpdate(BaseModel):
    password: Optional[str] = None
    role: Optional[str] = None


class UserOut(BaseModel):
    id: int
    username: str
    role: str
    is_superadmin: bool = False
    created_at: datetime

    model_config = {"from_attributes": True}


# --- Auth ---
class LoginRequest(BaseModel):
    username: str
    password: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


class PasswordResetRequest(BaseModel):
    """教員・TAが他ユーザーのパスワードをリセットする際に使用"""
    password: str


# --- テストケース／サンプルケースの添付ファイル ---
# ソース・実行ファイルと同じディレクトリに配置し、プログラムが fopen 等で読み込む用途（*.txt, *.csv のみ）
_FILENAME_RE = re.compile(r'^[A-Za-z0-9_][A-Za-z0-9_\-.]{0,63}\.(txt|csv)$')
MAX_FILE_CONTENT_LEN = 262144   # 1ファイルあたり最大256KB
MAX_FILES_PER_CASE = 5          # 1ケースあたり最大5ファイル


class CaseFileCreate(BaseModel):
    filename: str
    content: str = ""

    @field_validator("filename")
    @classmethod
    def _validate_filename(cls, v: str) -> str:
        if not _FILENAME_RE.match(v):
            raise ValueError(
                "ファイル名は半角英数字・._- のみで、拡張子は .txt または .csv にしてください（パス区切りは使用不可）"
            )
        return v

    @field_validator("content")
    @classmethod
    def _validate_content_length(cls, v: str) -> str:
        if len(v) > MAX_FILE_CONTENT_LEN:
            raise ValueError(f"ファイルの内容は{MAX_FILE_CONTENT_LEN}文字以内にしてください")
        return v


class CaseFileOut(BaseModel):
    id: int
    filename: str
    content: str

    model_config = {"from_attributes": True}


# --- TestCase ---
class TestCaseCreate(BaseModel):
    input: str = ""
    expected_output: str
    order_index: int = 0
    files: list[CaseFileCreate] = Field(default_factory=list, max_length=MAX_FILES_PER_CASE)


class TestCaseOut(BaseModel):
    id: int
    problem_id: int
    input: str
    expected_output: str
    order_index: int
    files: list[CaseFileOut] = []

    model_config = {"from_attributes": True}


# --- SampleCase ---
class SampleCaseCreate(BaseModel):
    input: str = ""
    expected_output: str
    order_index: int = 0
    files: list[CaseFileCreate] = Field(default_factory=list, max_length=MAX_FILES_PER_CASE)


class SampleCaseOut(BaseModel):
    id: int
    problem_id: int
    input: str
    expected_output: str
    order_index: int
    files: list[CaseFileOut] = []

    model_config = {"from_attributes": True}


# --- Problem ---
class ProblemCreate(BaseModel):
    title: str
    description: str
    max_vars: Optional[int] = None
    max_arrays: Optional[int] = None
    max_pointers: Optional[int] = None
    max_loops: Optional[int] = None
    max_ifs: Optional[int] = None


class ProblemUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    max_vars: Optional[int] = None
    max_arrays: Optional[int] = None
    max_pointers: Optional[int] = None
    max_loops: Optional[int] = None
    max_ifs: Optional[int] = None


class ProblemOut(BaseModel):
    id: int
    title: str
    description: str
    created_by: int
    created_at: datetime
    max_vars: Optional[int] = None
    max_arrays: Optional[int] = None
    max_pointers: Optional[int] = None
    max_loops: Optional[int] = None
    max_ifs: Optional[int] = None
    test_cases: list[TestCaseOut] = []
    sample_cases: list[SampleCaseOut] = []

    model_config = {"from_attributes": True}


# --- Problem Import/Export（1問1ファイル形式）---
class ProblemImportCase(BaseModel):
    input: str = ""
    expected_output: str = ""
    files: list[CaseFileCreate] = Field(default_factory=list, max_length=MAX_FILES_PER_CASE)


class ProblemImportRequest(BaseModel):
    """エクスポート JSON と同じフラット構造（1問1リクエスト）"""
    format: Optional[str] = None
    version: Optional[str] = None
    title: str
    description: str = ""
    constraints: Optional[dict] = None
    sample_cases: list[ProblemImportCase] = []
    test_cases: list[ProblemImportCase] = []


class ProblemImportResult(BaseModel):
    title: str


# 学生向け：問題文・サンプルケース・制約のみ（テストケースは非公開）
class ProblemForStudent(BaseModel):
    id: int
    title: str
    description: str
    max_vars: Optional[int] = None
    max_arrays: Optional[int] = None
    max_pointers: Optional[int] = None
    max_loops: Optional[int] = None
    max_ifs: Optional[int] = None
    sample_cases: list[SampleCaseOut] = []

    model_config = {"from_attributes": True}


class ProblemSummary(BaseModel):
    id: int
    title: str
    created_by: int
    created_at: datetime

    model_config = {"from_attributes": True}


# --- Assignment ---
class AssignmentCreate(BaseModel):
    title: str
    problem_id: int
    class_id: int
    open_at: datetime
    close_at: datetime
    start_deadline: Optional[datetime] = None


class AssignmentUpdate(BaseModel):
    title: Optional[str] = None
    problem_id: Optional[int] = None
    class_id: Optional[int] = None
    open_at: Optional[datetime] = None
    close_at: Optional[datetime] = None
    start_deadline: Optional[datetime] = None


class AssignmentOut(BaseModel):
    id: int
    title: str
    problem_id: int
    problem_title: Optional[str] = None
    class_id: Optional[int]
    open_at: datetime
    close_at: datetime
    start_deadline: Optional[datetime] = None
    created_by: int
    created_at: datetime
    # 学生向け：not_started / in_progress / submitted（教員には None）
    my_status: Optional[str] = None

    model_config = {"from_attributes": True}


class AssignmentWithProblem(AssignmentOut):
    problem: ProblemForStudent

    model_config = {"from_attributes": True}


# --- Submission ---
class SubmissionCreate(BaseModel):
    problem_id: int
    assignment_id: Optional[int] = None
    code: str
    started_at: Optional[datetime] = None    # クライアントが記録した解答開始時刻
    elapsed_seconds: Optional[int] = None    # 解答所要秒数


class SubmissionResultOut(BaseModel):
    id: int
    test_case_id: int
    status: str
    output: str
    time_ms: Optional[int]

    model_config = {"from_attributes": True}


class SubmissionOut(BaseModel):
    id: int
    user_id: int
    problem_id: int
    assignment_id: Optional[int]
    code: str
    status: str
    score: float
    submitted_at: datetime
    started_at: Optional[datetime] = None
    elapsed_seconds: Optional[int] = None
    compile_warnings: Optional[str] = None
    score_detail: Optional[str] = None   # JSON形式の点数内訳
    results: list[SubmissionResultOut] = []

    model_config = {"from_attributes": True}


class SubmissionSummary(BaseModel):
    id: int
    user_id: int
    username: Optional[str] = None
    problem_id: int
    assignment_id: Optional[int]
    status: str
    score: float
    submitted_at: datetime
    elapsed_seconds: Optional[int] = None

    model_config = {"from_attributes": True}


# --- サンプル実行 ---
class SampleRunRequest(BaseModel):
    problem_id: int
    code: str


class SampleCaseRunResult(BaseModel):
    order_index: int
    input: str
    expected_output: str
    actual_output: str
    status: str   # accepted / wrong_answer / compile_error / runtime_error / time_limit_exceeded
    time_ms: int


class SampleRunResponse(BaseModel):
    compile_error: str = ""
    compile_warnings: str = ""
    constraint_warning: str = ""
    results: list[SampleCaseRunResult] = []


# --- AssignmentStart ---
class AssignmentStartOut(BaseModel):
    started_at: datetime


# --- Class ---
class ClassCreate(BaseModel):
    name: str
    description: str = ""


class ClassUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None


class ClassMemberOut(BaseModel):
    user_id: int
    username: str

    model_config = {"from_attributes": True}


class ClassOut(BaseModel):
    id: int
    name: str
    description: str
    created_by: int
    created_at: datetime
    member_count: int = 0

    model_config = {"from_attributes": True}


class ClassDetail(ClassOut):
    members: list[ClassMemberOut] = []

    model_config = {"from_attributes": True}


# --- Batch operations ---
class BatchDeleteRequest(BaseModel):
    user_ids: list[int]


class ClassMemberAdd(BaseModel):
    user_ids: list[int]


class CsvImportResult(BaseModel):
    created: int
    skipped: int
    skipped_usernames: list[str] = []
    errors: list[str]


# --- クラス内学生作成 ---
class StudentInClassCreate(BaseModel):
    username: str
    password: str


# --- 採点結果サマリー（ユーザーごとの最新提出） ---
class ResultSummaryItem(BaseModel):
    user_id: int
    username: str
    score: float
    status: str
    submitted_at: datetime
    elapsed_seconds: Optional[int] = None
    attempt_count: int
