from datetime import datetime
from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Float, Boolean, UniqueConstraint
from sqlalchemy.orm import relationship
from .database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    role = Column(String, nullable=False, default="student")  # teacher / student
    is_superadmin = Column(Boolean, nullable=False, default=False, server_default="0")
    created_at = Column(DateTime, default=datetime.utcnow)

    submissions = relationship("Submission", back_populates="user")
    problems = relationship("Problem", back_populates="creator")
    assignments = relationship("Assignment", back_populates="creator")


class Problem(Base):
    __tablename__ = "problems"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    description = Column(Text, nullable=False)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    # コード制約（None = 無制限）
    max_vars = Column(Integer, nullable=True)
    max_arrays = Column(Integer, nullable=True)
    max_pointers = Column(Integer, nullable=True)
    max_loops = Column(Integer, nullable=True)
    max_ifs = Column(Integer, nullable=True)

    creator = relationship("User", back_populates="problems")
    test_cases = relationship("TestCase", back_populates="problem", order_by="TestCase.order_index", cascade="all, delete-orphan")
    sample_cases = relationship("SampleCase", back_populates="problem", order_by="SampleCase.order_index", cascade="all, delete-orphan")
    assignments = relationship("Assignment", back_populates="problem")


class TestCase(Base):
    __tablename__ = "test_cases"

    id = Column(Integer, primary_key=True, index=True)
    problem_id = Column(Integer, ForeignKey("problems.id"), nullable=False)
    input = Column(Text, nullable=False, default="")
    expected_output = Column(Text, nullable=False)
    order_index = Column(Integer, nullable=False, default=0)

    problem = relationship("Problem", back_populates="test_cases")
    submission_results = relationship("SubmissionResult", back_populates="test_case", cascade="all, delete-orphan")


class SampleCase(Base):
    """学生に公開する入出力例（本番テストケースとは別）"""
    __tablename__ = "sample_cases"

    id = Column(Integer, primary_key=True, index=True)
    problem_id = Column(Integer, ForeignKey("problems.id"), nullable=False)
    input = Column(Text, nullable=False, default="")
    expected_output = Column(Text, nullable=False)
    order_index = Column(Integer, nullable=False, default=0)

    problem = relationship("Problem", back_populates="sample_cases")


class Assignment(Base):
    __tablename__ = "assignments"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    problem_id = Column(Integer, ForeignKey("problems.id"), nullable=False)
    class_id = Column(Integer, ForeignKey("classes.id"), nullable=True)
    open_at = Column(DateTime, nullable=False)
    close_at = Column(DateTime, nullable=False)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    problem = relationship("Problem", back_populates="assignments")
    class_ = relationship("Class", foreign_keys=[class_id])
    creator = relationship("User", back_populates="assignments")
    submissions = relationship("Submission", back_populates="assignment")

    @property
    def problem_title(self) -> str | None:
        return self.problem.title if self.problem else None


class Submission(Base):
    __tablename__ = "submissions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    problem_id = Column(Integer, ForeignKey("problems.id"), nullable=False)
    assignment_id = Column(Integer, ForeignKey("assignments.id"), nullable=True)
    code = Column(Text, nullable=False)
    status = Column(String, nullable=False, default="pending")
    score = Column(Float, nullable=False, default=0.0)
    submitted_at = Column(DateTime, default=datetime.utcnow)
    started_at = Column(DateTime, nullable=True)        # 解答開始時刻
    elapsed_seconds = Column(Integer, nullable=True)    # 解答所要秒数
    compile_warnings = Column(Text, nullable=True)      # コンパイル警告
    score_detail = Column(Text, nullable=True)          # JSON形式の点数内訳

    user = relationship("User", back_populates="submissions")
    problem = relationship("Problem")
    assignment = relationship("Assignment", back_populates="submissions")
    results = relationship("SubmissionResult", back_populates="submission", cascade="all, delete-orphan")

    @property
    def username(self) -> str | None:
        return self.user.username if self.user else None


class SubmissionResult(Base):
    __tablename__ = "submission_results"

    id = Column(Integer, primary_key=True, index=True)
    submission_id = Column(Integer, ForeignKey("submissions.id"), nullable=False)
    test_case_id = Column(Integer, ForeignKey("test_cases.id"), nullable=False)
    status = Column(String, nullable=False)
    output = Column(Text, nullable=False, default="")
    time_ms = Column(Integer, nullable=True)

    submission = relationship("Submission", back_populates="results")
    test_case = relationship("TestCase", back_populates="submission_results")


class Class(Base):
    __tablename__ = "classes"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False, unique=True)
    description = Column(Text, nullable=False, default="")
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    creator = relationship("User", foreign_keys=[created_by])
    members = relationship("ClassMember", back_populates="class_", cascade="all, delete-orphan")


class AssignmentStart(Base):
    """学生が課題ページを最初に開いた時刻を記録する"""
    __tablename__ = "assignment_starts"

    id = Column(Integer, primary_key=True, index=True)
    assignment_id = Column(Integer, ForeignKey("assignments.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    started_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    __table_args__ = (UniqueConstraint("assignment_id", "user_id"),)


class ClassMember(Base):
    __tablename__ = "class_members"

    class_id = Column(Integer, ForeignKey("classes.id"), primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), primary_key=True)

    class_ = relationship("Class", back_populates="members")
    student = relationship("User")
