const BASE = '/api/v1'

// バックエンドはタイムゾーン情報なし UTC 文字列を返すため、'Z' を付与して UTC として解釈させる
const ISO_NO_TZ = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?$/
function attachUTC(v: unknown): unknown {
  if (typeof v === 'string' && ISO_NO_TZ.test(v)) return v + 'Z'
  if (Array.isArray(v)) return v.map(attachUTC)
  if (v !== null && typeof v === 'object')
    return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, val]) => [k, attachUTC(val)]))
  return v
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    ...init,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || 'エラーが発生しました')
  }
  if (res.status === 204) return undefined as T
  return attachUTC(await res.json()) as T
}

// --- 型定義 ---
export interface User {
  id: number
  username: string
  role: 'teacher' | 'student' | 'ta'
  is_superadmin?: boolean
}

export interface TestCase {
  id: number
  problem_id: number
  input: string
  expected_output: string
  order_index: number
}

export interface SampleCase {
  id: number
  problem_id: number
  input: string
  expected_output: string
  order_index: number
}

export interface Problem {
  id: number
  title: string
  description: string
  created_by: number
  created_at: string
  max_vars: number | null
  max_arrays: number | null
  max_pointers: number | null
  max_loops: number | null
  max_ifs: number | null
  test_cases: TestCase[]
  sample_cases: SampleCase[]
}

export interface Assignment {
  id: number
  title: string
  problem_id: number
  problem_title?: string | null
  class_id: number | null
  problem?: {
    id: number
    title: string
    description: string
    max_vars: number | null
    max_arrays: number | null
    max_pointers: number | null
    max_loops: number | null
    max_ifs: number | null
    sample_cases: SampleCase[]
  }
  open_at: string
  close_at: string
  /** この時刻までに開始しないとアクセス不可（null = 制限なし） */
  start_deadline?: string | null
  created_by: number
  /** 学生向けステータス: not_started / in_progress / submitted */
  my_status?: string | null
}

export interface SubmissionResult {
  id: number
  test_case_id: number
  status: string
  output: string
  time_ms: number
}

export interface Submission {
  id: number
  user_id: number
  username?: string
  problem_id: number
  assignment_id: number | null
  code: string
  status: string
  score: number
  submitted_at: string
  started_at?: string | null
  elapsed_seconds?: number | null
  compile_warnings?: string | null
  score_detail?: string | null
  results: SubmissionResult[]
}

export interface SampleCaseRunResult {
  order_index: number
  input: string
  expected_output: string
  actual_output: string
  status: string
  time_ms: number
}

export interface SampleRunResponse {
  compile_error: string
  compile_warnings: string
  constraint_warning: string
  results: SampleCaseRunResult[]
}

// --- Auth ---
export async function apiGetMe(): Promise<User> {
  return req<User>('/auth/me')
}

export async function apiLogin(username: string, password: string): Promise<User> {
  return req<User>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  })
}

export async function apiLogout(): Promise<void> {
  return req<void>('/auth/logout', { method: 'POST' })
}

export async function apiChangePassword(currentPassword: string, newPassword: string): Promise<void> {
  return req<void>('/auth/change_password', {
    method: 'POST',
    body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
  })
}

// --- Users ---
export async function apiGetUsers(): Promise<User[]> {
  return req<User[]>('/users')
}

export async function apiCreateUser(data: { username: string; password: string; role: string }): Promise<User> {
  return req<User>('/users', { method: 'POST', body: JSON.stringify(data) })
}

export async function apiUpdateUser(id: number, data: { password?: string; role?: string }): Promise<User> {
  return req<User>(`/users/${id}`, { method: 'PUT', body: JSON.stringify(data) })
}

export async function apiDeleteUser(id: number): Promise<void> {
  return req<void>(`/users/${id}`, { method: 'DELETE' })
}

/** 教員・TAが他ユーザー（TAは学生のみ）のパスワードをリセットする */
export async function apiResetPassword(userId: number, password: string): Promise<User> {
  return req<User>(`/users/${userId}/reset_password`, { method: 'PUT', body: JSON.stringify({ password }) })
}

// --- Problems ---
export async function apiGetProblems(): Promise<Problem[]> {
  return req<Problem[]>('/problems')
}

export async function apiGetProblem(id: number): Promise<Problem> {
  return req<Problem>(`/problems/${id}`)
}

export async function apiCreateProblem(data: {
  title: string
  description: string
  max_vars?: number | null
  max_arrays?: number | null
  max_pointers?: number | null
  max_loops?: number | null
  max_ifs?: number | null
}): Promise<Problem> {
  return req<Problem>('/problems', { method: 'POST', body: JSON.stringify(data) })
}

export async function apiUpdateProblem(id: number, data: {
  title?: string
  description?: string
  max_vars?: number | null
  max_arrays?: number | null
  max_pointers?: number | null
  max_loops?: number | null
  max_ifs?: number | null
}): Promise<Problem> {
  return req<Problem>(`/problems/${id}`, { method: 'PUT', body: JSON.stringify(data) })
}

export async function apiDeleteProblem(id: number): Promise<void> {
  return req<void>(`/problems/${id}`, { method: 'DELETE' })
}

export interface ProblemImportResult {
  title: string
}

export async function apiImportProblem(data: unknown): Promise<ProblemImportResult> {
  return req<ProblemImportResult>('/problems/import', { method: 'POST', body: JSON.stringify(data) })
}

export async function apiAddTestCase(problemId: number, data: { input: string; expected_output: string }): Promise<TestCase> {
  return req<TestCase>(`/problems/${problemId}/test_cases`, { method: 'POST', body: JSON.stringify(data) })
}

export async function apiDeleteTestCase(problemId: number, tcId: number): Promise<void> {
  return req<void>(`/problems/${problemId}/test_cases/${tcId}`, { method: 'DELETE' })
}

export async function apiAddSampleCase(problemId: number, data: { input: string; expected_output: string }): Promise<SampleCase> {
  return req<SampleCase>(`/problems/${problemId}/sample_cases`, { method: 'POST', body: JSON.stringify(data) })
}

export async function apiDeleteSampleCase(problemId: number, scId: number): Promise<void> {
  return req<void>(`/problems/${problemId}/sample_cases/${scId}`, { method: 'DELETE' })
}

// --- Assignments ---
export async function apiGetAssignments(): Promise<Assignment[]> {
  return req<Assignment[]>('/assignments')
}

export async function apiGetAssignment(id: number): Promise<Assignment> {
  return req<Assignment>(`/assignments/${id}`)
}

export async function apiCreateAssignment(data: {
  title: string
  problem_id: number
  class_id: number
  open_at: string
  close_at: string
  start_deadline?: string | null
}): Promise<Assignment> {
  return req<Assignment>('/assignments', { method: 'POST', body: JSON.stringify(data) })
}

export async function apiUpdateAssignment(id: number, data: {
  title?: string
  open_at?: string
  close_at?: string
  start_deadline?: string | null
}): Promise<Assignment> {
  return req<Assignment>(`/assignments/${id}`, { method: 'PUT', body: JSON.stringify(data) })
}

export async function apiDeleteAssignment(id: number): Promise<void> {
  return req<void>(`/assignments/${id}`, { method: 'DELETE' })
}

// --- Submissions ---
export async function apiSubmit(data: {
  problem_id: number
  assignment_id: number | null
  code: string
  started_at?: string | null
  elapsed_seconds?: number | null
}): Promise<Submission> {
  return req<Submission>('/submissions', { method: 'POST', body: JSON.stringify(data) })
}

export async function apiRunSample(data: {
  problem_id: number
  code: string
}): Promise<SampleRunResponse> {
  return req<SampleRunResponse>('/submissions/run', { method: 'POST', body: JSON.stringify(data) })
}

export async function apiStartAssignment(assignmentId: number): Promise<{ started_at: string }> {
  return req<{ started_at: string }>(`/assignments/${assignmentId}/start`, { method: 'POST' })
}

export async function apiGetMyLatestSubmission(assignmentId: number): Promise<Submission | null> {
  const res = await fetch(`/api/v1/submissions/my_latest?assignment_id=${assignmentId}`, {
    credentials: 'include',
  })
  if (res.status === 404) return null
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || 'エラーが発生しました')
  }
  return attachUTC(await res.json()) as Submission
}

export async function apiGetSubmissions(): Promise<Submission[]> {
  return req<Submission[]>('/submissions')
}

export async function apiGetSubmission(id: number): Promise<Submission> {
  return req<Submission>(`/submissions/${id}`)
}

// --- Classes ---
export interface ClassMember {
  user_id: number
  username: string
}

export interface Class {
  id: number
  name: string
  description: string
  created_by: number
  created_at: string
  member_count: number
}

export interface ClassDetail extends Class {
  members: ClassMember[]
}

export interface CsvImportResult {
  created: number
  skipped: number
  skipped_usernames: string[]
  errors: string[]
}

export async function apiGetClasses(): Promise<Class[]> {
  return req<Class[]>('/classes')
}

export async function apiGetClass(id: number): Promise<ClassDetail> {
  return req<ClassDetail>(`/classes/${id}`)
}

export async function apiCreateClass(data: { name: string; description: string }): Promise<Class> {
  return req<Class>('/classes', { method: 'POST', body: JSON.stringify(data) })
}

export async function apiUpdateClass(id: number, data: { name?: string; description?: string }): Promise<Class> {
  return req<Class>(`/classes/${id}`, { method: 'PUT', body: JSON.stringify(data) })
}

export async function apiDeleteClass(id: number): Promise<void> {
  return req<void>(`/classes/${id}`, { method: 'DELETE' })
}

// --- クラス内学生管理 ---
export async function apiCreateStudentInClass(
  classId: number,
  data: { username: string; password: string }
): Promise<ClassDetail> {
  return req<ClassDetail>(`/classes/${classId}/students`, {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function apiImportStudentsInClass(classId: number, file: File): Promise<CsvImportResult> {
  const formData = new FormData()
  formData.append('file', file)
  const res = await fetch(`/api/v1/classes/${classId}/students/csv`, {
    method: 'POST',
    credentials: 'include',
    body: formData,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || 'CSVインポートに失敗しました')
  }
  return res.json()
}

export async function apiDeleteStudentFromClass(classId: number, userId: number): Promise<ClassDetail> {
  return req<ClassDetail>(`/classes/${classId}/students/${userId}`, { method: 'DELETE' })
}

export async function apiDeleteStudentsBatch(classId: number, userIds: number[]): Promise<ClassDetail> {
  return req<ClassDetail>(`/classes/${classId}/students/batch`, {
    method: 'DELETE',
    body: JSON.stringify({ user_ids: userIds }),
  })
}

// --- Results ---
export interface ResultSummaryItem {
  user_id: number
  username: string
  score: number
  status: string
  submitted_at: string
  elapsed_seconds: number | null
  attempt_count: number
}

export async function apiGetResultSummary(assignmentId: number): Promise<ResultSummaryItem[]> {
  return req<ResultSummaryItem[]>(`/results/summary?assignment_id=${assignmentId}`)
}

export interface SubmissionCode {
  code: string
  username: string
  submitted_at: string
}

export async function apiGetSubmissionCode(assignmentId: number, userId: number): Promise<SubmissionCode> {
  return req<SubmissionCode>(`/results/code?assignment_id=${assignmentId}&user_id=${userId}`)
}

export async function apiDownloadCodeZip(assignmentId: number): Promise<void> {
  const res = await fetch(`${BASE}/results/code/zip?assignment_id=${assignmentId}`, {
    credentials: 'include',
  })
  if (!res.ok) throw new Error('ZIPのダウンロードに失敗しました')
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `submissions_assignment_${assignmentId}.zip`
  a.click()
  URL.revokeObjectURL(url)
}

export async function apiDownloadResultsCsv(assignmentId: number): Promise<void> {
  const res = await fetch(`${BASE}/results/csv?assignment_id=${assignmentId}`, {
    credentials: 'include',
  })
  if (!res.ok) throw new Error('CSVの取得に失敗しました')
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `results_assignment_${assignmentId}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

/** クラス全学生の最新スコアのみをCSVでダウンロードする（未提出者も空欄行として含む） */
export async function apiDownloadLatestResultsCsv(assignmentId: number): Promise<void> {
  const res = await fetch(`${BASE}/results/csv/latest?assignment_id=${assignmentId}`, {
    credentials: 'include',
  })
  if (!res.ok) throw new Error('CSVの取得に失敗しました')
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `results_assignment_${assignmentId}_latest.csv`
  a.click()
  URL.revokeObjectURL(url)
}
