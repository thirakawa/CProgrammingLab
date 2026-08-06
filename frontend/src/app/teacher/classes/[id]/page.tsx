'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  apiGetClass, apiUpdateClass, apiDeleteClass,
  apiCreateStudentInClass, apiImportStudentsInClass,
  apiDeleteStudentFromClass, apiDeleteStudentsBatch,
  apiGetAssignments, apiCreateAssignment, apiUpdateAssignment, apiDeleteAssignment,
  apiGetProblems, apiGetResultSummary, apiDownloadResultsCsv,
  apiGetSubmissionCode, apiDownloadCodeZip, apiUpdateUser,
  type ClassDetail, type CsvImportResult, type Assignment, type Problem,
  type ResultSummaryItem, type SubmissionCode,
} from '@/lib/api'

// UTC の Date を JST の datetime-local 値（"YYYY-MM-DDTHH:mm"）に変換
function toJSTDatetimeValue(date: Date): string {
  const jst = new Date(date.getTime() + 9 * 60 * 60 * 1000)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${jst.getUTCFullYear()}-${pad(jst.getUTCMonth() + 1)}-${pad(jst.getUTCDate())}T${pad(jst.getUTCHours())}:${pad(jst.getUTCMinutes())}`
}

// JST の datetime-local 値を UTC ISO 文字列に変換（ブラウザのタイムゾーン非依存）
function jstToUTC(jstLocal: string): string {
  return new Date(jstLocal + '+09:00').toISOString()
}

// 解答開始期限が公開開始〜締切の範囲内かをクライアント側でも検証する
function validateStartDeadline(openAt: string, closeAt: string, startDeadline: string): string | null {
  if (!startDeadline) return null
  const open = new Date(openAt + '+09:00')
  const close = new Date(closeAt + '+09:00')
  const deadline = new Date(startDeadline + '+09:00')
  if (deadline < open || deadline > close) {
    return '解答開始期限は公開開始日時〜締切日時の範囲内に設定してください'
  }
  return null
}

function formatJST(iso: string) {
  return new Date(iso).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    done: { label: '採点済', cls: 'bg-green-100 text-green-700' },
    CE: { label: 'CE', cls: 'bg-red-100 text-red-700' },
    constraint_error: { label: '制約エラー', cls: 'bg-purple-100 text-purple-700' },
    judging: { label: '採点中', cls: 'bg-yellow-100 text-yellow-700' },
    pending: { label: '待機中', cls: 'bg-gray-100 text-gray-600' },
  }
  const s = map[status] ?? { label: status, cls: 'bg-gray-100 text-gray-600' }
  return <span className={`px-2 py-0.5 rounded text-xs ${s.cls}`}>{s.label}</span>
}

export default function ClassDetailPage() {
  const { id } = useParams<{ id: string }>()
  const classId = Number(id)
  const router = useRouter()

  // クラス情報
  const [cls, setCls] = useState<ClassDetail | null>(null)
  const [error, setError] = useState('')
  const [msg, setMsg] = useState('')
  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState({ name: '', description: '' })
  const [loading, setLoading] = useState(false)

  // メインタブ
  const [mainTab, setMainTab] = useState<'students' | 'assignments' | 'results'>('students')

  // パスワード変更モーダル
  const [pwModal, setPwModal] = useState<{ user_id: number; username: string } | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const [pwLoading, setPwLoading] = useState(false)
  const [pwError, setPwError] = useState('')

  // 学生管理タブ
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [newStudent, setNewStudent] = useState({ username: '', password: '' })
  const csvRef = useRef<HTMLInputElement>(null)
  const [csvResult, setCsvResult] = useState<CsvImportResult | null>(null)
  const [addTab, setAddTab] = useState<'single' | 'csv'>('single')

  // 課題管理タブ
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [problems, setProblems] = useState<Problem[]>([])
  const [assLoaded, setAssLoaded] = useState(false)
  const initNow = new Date()
  const initLater = new Date(initNow.getTime() + 7 * 24 * 60 * 60 * 1000)
  const [assForm, setAssForm] = useState({
    title: '',
    problemId: '' as number | '',
    openAt: toJSTDatetimeValue(initNow),
    closeAt: toJSTDatetimeValue(initLater),
    startDeadline: '',
  })
  const [assSubmitting, setAssSubmitting] = useState(false)

  // 課題編集モーダル
  const [editAssModal, setEditAssModal] = useState<Assignment | null>(null)
  const [editAssForm, setEditAssForm] = useState({ title: '', openAt: '', closeAt: '', startDeadline: '' })
  const [editAssSubmitting, setEditAssSubmitting] = useState(false)

  // 採点結果タブ
  const [selectedAssId, setSelectedAssId] = useState<number | ''>('')
  const [summary, setSummary] = useState<ResultSummaryItem[]>([])
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [csvDownloading, setCsvDownloading] = useState(false)
  const [zipping, setZipping] = useState(false)
  const [codeModal, setCodeModal] = useState<SubmissionCode | null>(null)
  const [codeLoadingId, setCodeLoadingId] = useState<number | null>(null)

  const loadClass = async () => {
    try {
      const c = await apiGetClass(classId)
      setCls(c)
      setEditForm({ name: c.name, description: c.description })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'エラー')
    }
  }

  const loadAssignments = async () => {
    try {
      const [all, probs] = await Promise.all([apiGetAssignments(), apiGetProblems()])
      setAssignments(all.filter(a => a.class_id === classId))
      setProblems(probs)
      setAssLoaded(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'エラー')
    }
  }

  useEffect(() => { loadClass() }, [classId])

  useEffect(() => {
    if ((mainTab === 'assignments' || mainTab === 'results') && !assLoaded) {
      loadAssignments()
    }
  }, [mainTab, assLoaded])

  useEffect(() => {
    if (!selectedAssId) { setSummary([]); return }
    setSummaryLoading(true)
    apiGetResultSummary(Number(selectedAssId))
      .then(setSummary)
      .catch(e => setError(e instanceof Error ? e.message : 'エラー'))
      .finally(() => setSummaryLoading(false))
  }, [selectedAssId])

  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(''), 3000) }

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await apiUpdateClass(classId, editForm)
      setEditing(false)
      flash('クラス情報を更新しました')
      loadClass()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'エラー')
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteClass = async () => {
    if (!cls) return
    if (!confirm(`クラス「${cls.name}」を削除しますか？\nこのクラスの学生アカウントもすべて削除されます。`)) return
    try {
      await apiDeleteClass(classId)
      router.push('/teacher/classes')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'エラー')
    }
  }

  const handleDeleteStudent = async (userId: number, username: string) => {
    if (!confirm(`「${username}」を削除しますか？\nユーザーアカウントも削除されます。`)) return
    setError('')
    try {
      const updated = await apiDeleteStudentFromClass(classId, userId)
      setCls(updated)
      setSelected(prev => { const n = new Set(prev); n.delete(userId); return n })
      flash(`${username} を削除しました`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'エラー')
    }
  }

  const handleBatchDelete = async () => {
    if (selected.size === 0) return
    if (!confirm(`選択した ${selected.size} 人の学生を削除しますか？\nユーザーアカウントも削除されます。`)) return
    setError('')
    try {
      const updated = await apiDeleteStudentsBatch(classId, Array.from(selected))
      setCls(updated)
      setSelected(new Set())
      flash(`${selected.size} 人を削除しました`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'エラー')
    }
  }

  const handleAddStudent = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const updated = await apiCreateStudentInClass(classId, newStudent)
      setCls(updated)
      setNewStudent({ username: '', password: '' })
      flash(`${newStudent.username} を追加しました`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'エラー')
    } finally {
      setLoading(false)
    }
  }

  const handleCsvImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setError('')
    setCsvResult(null)
    try {
      const result = await apiImportStudentsInClass(classId, file)
      setCsvResult(result)
      loadClass()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'CSVインポートに失敗しました')
    } finally {
      if (csvRef.current) csvRef.current.value = ''
    }
  }

  const toggleSelect = (uid: number) => {
    const next = new Set(selected)
    next.has(uid) ? next.delete(uid) : next.add(uid)
    setSelected(next)
  }

  const toggleAll = () => {
    if (!cls) return
    if (selected.size === cls.members.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(cls.members.map(m => m.user_id)))
    }
  }

  const handleCreateAssignment = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!assForm.problemId) return setError('問題を選択してください')
    const deadlineError = validateStartDeadline(assForm.openAt, assForm.closeAt, assForm.startDeadline)
    if (deadlineError) return setError(deadlineError)
    setError('')
    setAssSubmitting(true)
    try {
      await apiCreateAssignment({
        title: assForm.title,
        problem_id: Number(assForm.problemId),
        class_id: classId,
        open_at: jstToUTC(assForm.openAt),
        close_at: jstToUTC(assForm.closeAt),
        start_deadline: assForm.startDeadline ? jstToUTC(assForm.startDeadline) : null,
      })
      const freshNow = new Date()
      const freshLater = new Date(freshNow.getTime() + 7 * 24 * 60 * 60 * 1000)
      setAssForm({ title: '', problemId: '', openAt: toJSTDatetimeValue(freshNow), closeAt: toJSTDatetimeValue(freshLater), startDeadline: '' })
      flash('課題を作成しました')
      loadAssignments()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'エラー')
    } finally {
      setAssSubmitting(false)
    }
  }

  const handleOpenEditAss = (a: Assignment) => {
    setEditAssModal(a)
    setEditAssForm({
      title: a.title,
      openAt: toJSTDatetimeValue(new Date(a.open_at)),
      closeAt: toJSTDatetimeValue(new Date(a.close_at)),
      startDeadline: a.start_deadline ? toJSTDatetimeValue(new Date(a.start_deadline)) : '',
    })
  }

  const handleUpdateAssignment = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editAssModal) return
    const deadlineError = validateStartDeadline(editAssForm.openAt, editAssForm.closeAt, editAssForm.startDeadline)
    if (deadlineError) return setError(deadlineError)
    setError('')
    setEditAssSubmitting(true)
    try {
      const updated = await apiUpdateAssignment(editAssModal.id, {
        title: editAssForm.title,
        open_at: jstToUTC(editAssForm.openAt),
        close_at: jstToUTC(editAssForm.closeAt),
        start_deadline: editAssForm.startDeadline ? jstToUTC(editAssForm.startDeadline) : null,
      })
      setAssignments(prev => prev.map(a => a.id === updated.id ? updated : a))
      setEditAssModal(null)
      flash('課題を更新しました')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'エラー')
    } finally {
      setEditAssSubmitting(false)
    }
  }

  const handleDeleteAssignment = async (assId: number, title: string) => {
    if (!confirm(`「${title}」を削除しますか？`)) return
    try {
      await apiDeleteAssignment(assId)
      flash('課題を削除しました')
      loadAssignments()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'エラー')
    }
  }

  const handleDownloadCsv = async () => {
    if (!selectedAssId) return
    setCsvDownloading(true)
    try {
      await apiDownloadResultsCsv(Number(selectedAssId))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'エラー')
    } finally {
      setCsvDownloading(false)
    }
  }

  const handleDownloadZip = async () => {
    if (!selectedAssId) return
    setZipping(true)
    try {
      await apiDownloadCodeZip(Number(selectedAssId))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'エラー')
    } finally {
      setZipping(false)
    }
  }

  const handleViewCode = async (item: ResultSummaryItem) => {
    if (!selectedAssId) return
    setCodeLoadingId(item.user_id)
    try {
      const result = await apiGetSubmissionCode(Number(selectedAssId), item.user_id)
      setCodeModal(result)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'コードの取得に失敗しました')
    } finally {
      setCodeLoadingId(null)
    }
  }

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!pwModal) return
    setPwError('')
    setPwLoading(true)
    try {
      await apiUpdateUser(pwModal.user_id, { password: newPassword })
      setPwModal(null)
      setNewPassword('')
      flash(`${pwModal.username} のパスワードを変更しました`)
    } catch (e) {
      setPwError(e instanceof Error ? e.message : 'パスワード変更に失敗しました')
    } finally {
      setPwLoading(false)
    }
  }

  const downloadCodeFile = (username: string, code: string) => {
    const blob = new Blob([code], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${username}.c`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (!cls) return <div className="text-gray-400 p-8">読み込み中...</div>

  const PwModal = pwModal && (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setPwModal(null)}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
        <h2 className="font-semibold text-base mb-1">パスワード変更</h2>
        <p className="text-sm text-gray-500 mb-4">{pwModal.username}</p>
        {pwError && <p className="text-red-500 text-sm mb-3">{pwError}</p>}
        <form onSubmit={handleChangePassword} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">新しいパスワード</label>
            <input
              type="password"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              className="w-full border rounded px-3 py-2 text-sm"
              required
              minLength={4}
              autoFocus
            />
          </div>
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => setPwModal(null)} className="border rounded px-4 py-2 text-sm hover:bg-gray-50">
              キャンセル
            </button>
            <button type="submit" disabled={pwLoading} className="bg-blue-600 text-white rounded px-4 py-2 text-sm hover:bg-blue-700 disabled:opacity-50">
              {pwLoading ? '変更中...' : '変更する'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )

  const EditAssModal = editAssModal && (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setEditAssModal(null)}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg p-6" onClick={e => e.stopPropagation()}>
        <h2 className="font-semibold text-base mb-1">課題を編集</h2>
        {editAssModal.problem_title && (
          <p className="text-sm text-gray-500 mb-4">問題: {editAssModal.problem_title}</p>
        )}
        <form onSubmit={handleUpdateAssignment} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">課題タイトル</label>
            <input
              type="text"
              value={editAssForm.title}
              onChange={e => setEditAssForm({ ...editAssForm, title: e.target.value })}
              className="w-full border rounded px-3 py-2 text-sm"
              required
              autoFocus
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">公開開始日時（日本時間）</label>
              <input
                type="datetime-local"
                value={editAssForm.openAt}
                onChange={e => setEditAssForm({ ...editAssForm, openAt: e.target.value })}
                className="w-full border rounded px-3 py-2 text-sm"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">締切日時（日本時間）</label>
              <input
                type="datetime-local"
                value={editAssForm.closeAt}
                onChange={e => setEditAssForm({ ...editAssForm, closeAt: e.target.value })}
                className="w-full border rounded px-3 py-2 text-sm"
                required
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">解答開始期限（任意・日本時間）</label>
            <input
              type="datetime-local"
              value={editAssForm.startDeadline}
              onChange={e => setEditAssForm({ ...editAssForm, startDeadline: e.target.value })}
              className="w-full border rounded px-3 py-2 text-sm max-w-xs"
            />
            <p className="text-xs text-gray-400 mt-1">
              設定すると、この時刻までに初回アクセス（解答開始）しなかった学生はこの課題に取り組めなくなります。未設定なら制限なし。
            </p>
          </div>
          <div className="flex gap-2 justify-end pt-2">
            <button type="button" onClick={() => setEditAssModal(null)} className="border rounded px-4 py-2 text-sm hover:bg-gray-50">
              キャンセル
            </button>
            <button type="submit" disabled={editAssSubmitting} className="bg-blue-600 text-white rounded px-4 py-2 text-sm hover:bg-blue-700 disabled:opacity-50">
              {editAssSubmitting ? '更新中...' : '更新する'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )

  const tabCls = (t: string) =>
    `px-5 py-3 text-sm font-medium border-b-2 -mb-px transition-colors ${mainTab === t ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`

  return (
    <div className="max-w-4xl">
      {PwModal}
      {EditAssModal}
      <button onClick={() => router.push('/teacher/classes')} className="text-blue-600 hover:underline text-sm mb-4 inline-block">
        ← クラス一覧へ
      </button>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded px-4 py-3 mb-4">{error}</div>}
      {msg && <div className="bg-green-50 border border-green-200 text-green-700 rounded px-4 py-3 mb-4">{msg}</div>}

      {/* クラス情報 */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        {editing ? (
          <form onSubmit={handleUpdate} className="space-y-3">
            <div>
              <label className="block text-sm font-medium mb-1">クラス名</label>
              <input
                type="text"
                value={editForm.name}
                onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                className="border rounded px-3 py-2 w-full max-w-sm"
                required
                autoFocus
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">説明</label>
              <input
                type="text"
                value={editForm.description}
                onChange={e => setEditForm({ ...editForm, description: e.target.value })}
                className="border rounded px-3 py-2 w-full max-w-sm"
              />
            </div>
            <div className="flex gap-2">
              <button type="submit" disabled={loading} className="bg-blue-600 text-white rounded px-4 py-2 text-sm hover:bg-blue-700 disabled:opacity-50">
                保存
              </button>
              <button type="button" onClick={() => setEditing(false)} className="border rounded px-4 py-2 text-sm hover:bg-gray-50">
                キャンセル
              </button>
            </div>
          </form>
        ) : (
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold">{cls.name}</h1>
              <p className="text-gray-500 mt-1">{cls.description || '説明なし'}</p>
              <p className="text-sm text-gray-400 mt-2">学生数: {cls.member_count}人</p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setEditing(true)} className="text-blue-600 hover:underline text-sm">編集</button>
              <button onClick={handleDeleteClass} className="text-red-500 hover:underline text-sm">クラス削除</button>
            </div>
          </div>
        )}
      </div>

      {/* メインタブ */}
      <div className="border-b mb-6 flex">
        <button onClick={() => setMainTab('students')} className={tabCls('students')}>学生管理</button>
        <button onClick={() => setMainTab('assignments')} className={tabCls('assignments')}>課題管理</button>
        <button onClick={() => setMainTab('results')} className={tabCls('results')}>採点結果</button>
      </div>

      {/* 学生管理タブ */}
      {mainTab === 'students' && (
        <>
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold">学生一覧 ({cls.members.length}人)</h2>
              {selected.size > 0 && (
                <button onClick={handleBatchDelete} className="bg-red-500 text-white rounded px-3 py-1.5 text-sm hover:bg-red-600">
                  選択した {selected.size} 人を削除
                </button>
              )}
            </div>
            {cls.members.length === 0 ? (
              <p className="text-gray-400 text-sm">学生がいません。下のフォームから追加してください。</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-3 py-2 w-10">
                      <input
                        type="checkbox"
                        checked={selected.size === cls.members.length && cls.members.length > 0}
                        onChange={toggleAll}
                      />
                    </th>
                    <th className="text-left px-3 py-2 w-12">ID</th>
                    <th className="text-left px-3 py-2">ユーザー名</th>
                    <th className="text-left px-3 py-2">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {cls.members.map(m => (
                    <tr key={m.user_id} className={`hover:bg-gray-50 ${selected.has(m.user_id) ? 'bg-red-50' : ''}`}>
                      <td className="px-3 py-2">
                        <input type="checkbox" checked={selected.has(m.user_id)} onChange={() => toggleSelect(m.user_id)} />
                      </td>
                      <td className="px-3 py-2 text-gray-400">{m.user_id}</td>
                      <td className="px-3 py-2 font-medium">{m.username}</td>
                      <td className="px-3 py-2 flex gap-3">
                        <button
                          onClick={() => { setPwModal({ user_id: m.user_id, username: m.username }); setNewPassword(''); setPwError('') }}
                          className="text-blue-500 hover:underline text-xs"
                        >
                          PW変更
                        </button>
                        <button onClick={() => handleDeleteStudent(m.user_id, m.username)} className="text-red-500 hover:underline text-xs">
                          削除
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-base font-semibold mb-4">学生を追加</h2>
            <div className="flex border-b mb-4">
              <button
                onClick={() => setAddTab('single')}
                className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${addTab === 'single' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
              >
                個別追加
              </button>
              <button
                onClick={() => setAddTab('csv')}
                className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${addTab === 'csv' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
              >
                CSV一括追加
              </button>
            </div>

            {addTab === 'single' && (
              <form onSubmit={handleAddStudent} className="flex gap-3 items-end flex-wrap">
                <div>
                  <label className="block text-sm font-medium mb-1">ユーザーID</label>
                  <input
                    type="text"
                    value={newStudent.username}
                    onChange={e => setNewStudent({ ...newStudent, username: e.target.value })}
                    className="border rounded px-3 py-2 w-40"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">パスワード</label>
                  <input
                    type="password"
                    value={newStudent.password}
                    onChange={e => setNewStudent({ ...newStudent, password: e.target.value })}
                    className="border rounded px-3 py-2 w-40"
                    required
                  />
                </div>
                <button type="submit" disabled={loading} className="bg-blue-600 text-white rounded px-4 py-2 hover:bg-blue-700 disabled:opacity-50">
                  追加
                </button>
              </form>
            )}

            {addTab === 'csv' && (
              <div>
                <p className="text-sm text-gray-500 mb-3">
                  CSV形式: <code className="bg-gray-100 px-1 rounded">username,password</code>（1行目はヘッダー行。パスワード省略時は <code className="bg-gray-100 px-1 rounded">changeme</code> を設定）
                </p>
                <button onClick={() => csvRef.current?.click()} className="bg-gray-100 border border-gray-300 rounded px-4 py-2 text-sm hover:bg-gray-200">
                  CSVファイルを選択
                </button>
                <input ref={csvRef} type="file" accept=".csv" className="hidden" onChange={handleCsvImport} />

                {csvResult && (
                  <div className="mt-4 border rounded px-4 py-3 text-sm space-y-2 bg-white">
                    <p className="font-medium">インポート結果</p>
                    <p className="text-green-700">✓ 追加: {csvResult.created}件</p>
                    {csvResult.skipped > 0 && (
                      <div className="text-yellow-700 bg-yellow-50 border border-yellow-200 rounded px-3 py-2">
                        <p className="font-medium">⚠ スキップ: {csvResult.skipped}件（既にIDが存在します）</p>
                        <ul className="mt-1 list-disc list-inside text-xs">
                          {csvResult.skipped_usernames.map((u, i) => <li key={i}>{u}</li>)}
                        </ul>
                      </div>
                    )}
                    {csvResult.errors.length > 0 && (
                      <div className="text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
                        <p className="font-medium">✗ エラー: {csvResult.errors.length}件</p>
                        <ul className="mt-1 list-disc list-inside text-xs">
                          {csvResult.errors.map((e, i) => <li key={i}>{e}</li>)}
                        </ul>
                      </div>
                    )}
                    <button onClick={() => setCsvResult(null)} className="text-blue-600 hover:underline text-xs">閉じる</button>
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}

      {/* 課題管理タブ */}
      {mainTab === 'assignments' && (
        <>
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-base font-semibold mb-4">課題一覧 ({assignments.length}件)</h2>
            {assignments.length === 0 ? (
              <p className="text-gray-400 text-sm">課題がありません。下のフォームから作成してください。</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="text-left px-3 py-2 w-12">ID</th>
                    <th className="text-left px-3 py-2">タイトル / 問題</th>
                    <th className="text-left px-3 py-2">公開開始</th>
                    <th className="text-left px-3 py-2">締切</th>
                    <th className="text-left px-3 py-2">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {assignments.map(a => {
                    const n = new Date()
                    const open = new Date(a.open_at)
                    const close = new Date(a.close_at)
                    const statusKey = n < open ? 'upcoming' : n > close ? 'closed' : 'open'
                    return (
                      <tr key={a.id} className="hover:bg-gray-50">
                        <td className="px-3 py-2 text-gray-400">{a.id}</td>
                        <td className="px-3 py-2">
                          <div className="font-medium flex items-center gap-2">
                            {a.title}
                            <span className={`px-1.5 py-0.5 rounded text-xs ${
                              statusKey === 'open' ? 'bg-green-100 text-green-700' :
                              statusKey === 'upcoming' ? 'bg-yellow-100 text-yellow-700' :
                              'bg-gray-100 text-gray-500'
                            }`}>
                              {statusKey === 'open' ? '公開中' : statusKey === 'upcoming' ? '予定' : '終了'}
                            </span>
                          </div>
                          {a.problem_title && (
                            <div className="text-xs text-gray-400 mt-0.5">問題: {a.problem_title}</div>
                          )}
                          {a.start_deadline && (
                            <div className="text-xs text-orange-500 mt-0.5">開始期限: {formatJST(a.start_deadline)}</div>
                          )}
                        </td>
                        <td className="px-3 py-2 text-gray-600">{formatJST(a.open_at)}</td>
                        <td className="px-3 py-2 text-gray-600">{formatJST(a.close_at)}</td>
                        <td className="px-3 py-2 flex gap-3">
                          <button onClick={() => handleOpenEditAss(a)} className="text-blue-600 hover:underline text-xs">
                            編集
                          </button>
                          <button onClick={() => handleDeleteAssignment(a.id, a.title)} className="text-red-500 hover:underline text-xs">
                            削除
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-base font-semibold mb-4">課題を作成</h2>
            <form onSubmit={handleCreateAssignment} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">課題タイトル</label>
                <input
                  type="text"
                  value={assForm.title}
                  onChange={e => setAssForm({ ...assForm, title: e.target.value })}
                  className="w-full border rounded px-3 py-2 max-w-md"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">問題</label>
                <select
                  value={assForm.problemId}
                  onChange={e => setAssForm({ ...assForm, problemId: e.target.value ? Number(e.target.value) : '' })}
                  className="w-full border rounded px-3 py-2 max-w-md"
                  required
                >
                  <option value="">-- 問題を選択 --</option>
                  {problems.map(p => (
                    <option key={p.id} value={p.id}>{p.title}</option>
                  ))}
                </select>
                {problems.length === 0 && (
                  <p className="text-xs text-gray-400 mt-1">問題がまだ作成されていません。先に問題管理から作成してください。</p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4 max-w-md">
                <div>
                  <label className="block text-sm font-medium mb-1">公開開始日時（日本時間）</label>
                  <input
                    type="datetime-local"
                    value={assForm.openAt}
                    onChange={e => setAssForm({ ...assForm, openAt: e.target.value })}
                    className="w-full border rounded px-3 py-2"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">締切日時（日本時間）</label>
                  <input
                    type="datetime-local"
                    value={assForm.closeAt}
                    onChange={e => setAssForm({ ...assForm, closeAt: e.target.value })}
                    className="w-full border rounded px-3 py-2"
                    required
                  />
                </div>
              </div>
              <div className="max-w-md">
                <label className="block text-sm font-medium mb-1">解答開始期限（任意・日本時間）</label>
                <input
                  type="datetime-local"
                  value={assForm.startDeadline}
                  onChange={e => setAssForm({ ...assForm, startDeadline: e.target.value })}
                  className="w-full border rounded px-3 py-2"
                />
                <p className="text-xs text-gray-400 mt-1">
                  設定すると、この時刻までに初回アクセス（解答開始）しなかった学生はこの課題に取り組めなくなります。未設定なら制限なし。
                </p>
              </div>
              <button
                type="submit"
                disabled={assSubmitting}
                className="bg-blue-600 text-white rounded px-5 py-2 hover:bg-blue-700 disabled:opacity-50"
              >
                {assSubmitting ? '作成中...' : '課題を作成'}
              </button>
            </form>
          </div>
        </>
      )}

      {/* 採点結果タブ */}
      {mainTab === 'results' && (
        <div>
          <div className="flex gap-3 items-end mb-6 flex-wrap">
            <div>
              <label className="block text-sm font-medium mb-1">課題を選択</label>
              <select
                value={selectedAssId}
                onChange={e => setSelectedAssId(e.target.value ? Number(e.target.value) : '')}
                className="border rounded px-3 py-2 w-72"
              >
                <option value="">-- 課題を選択 --</option>
                {assignments.map(a => (
                  <option key={a.id} value={a.id}>{a.title}</option>
                ))}
              </select>
            </div>
            {selectedAssId && (
              <>
                <button
                  onClick={handleDownloadCsv}
                  disabled={csvDownloading}
                  className="bg-green-600 text-white rounded px-4 py-2 hover:bg-green-700 disabled:opacity-50 text-sm"
                >
                  {csvDownloading ? 'ダウンロード中...' : '採点結果 CSV'}
                </button>
                <button
                  onClick={handleDownloadZip}
                  disabled={zipping || summary.length === 0}
                  className="bg-blue-600 text-white rounded px-4 py-2 hover:bg-blue-700 disabled:opacity-50 text-sm"
                >
                  {zipping ? '作成中...' : '提出コード 一括ZIP'}
                </button>
              </>
            )}
          </div>

          {selectedAssId && (
            <>
              {summaryLoading && <p className="text-gray-400 text-sm mb-4">読み込み中...</p>}

              {!summaryLoading && summary.length > 0 && (
                <div className="flex gap-4 mb-4 text-sm">
                  <span className="bg-gray-100 rounded px-3 py-1 text-gray-600">
                    提出者数：<strong>{summary.length}</strong>人
                  </span>
                  <span className="bg-green-50 rounded px-3 py-1 text-green-700">
                    満点（100点）：<strong>{summary.filter(u => u.score === 100).length}</strong>人
                  </span>
                </div>
              )}

              {!summaryLoading && (
                <div className="bg-white rounded-lg shadow overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        <th className="text-left px-4 py-3">ユーザー名</th>
                        <th className="text-left px-4 py-3">最新スコア</th>
                        <th className="text-left px-4 py-3">ステータス</th>
                        <th className="text-left px-4 py-3">提出回数</th>
                        <th className="text-left px-4 py-3">解答時間</th>
                        <th className="text-left px-4 py-3">最終提出日時</th>
                        <th className="text-left px-4 py-3">提出コード</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {summary.length === 0 && (
                        <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">提出がありません</td></tr>
                      )}
                      {summary.map(item => (
                        <tr key={item.user_id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 font-medium">{item.username}</td>
                          <td className="px-4 py-3">
                            <span className={`font-bold ${item.score === 100 ? 'text-green-600' : item.score > 0 ? 'text-yellow-600' : 'text-red-500'}`}>
                              {item.score}点
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <StatusBadge status={item.status} />
                          </td>
                          <td className="px-4 py-3 text-gray-500">{item.attempt_count}回</td>
                          <td className="px-4 py-3 text-gray-500">
                            {item.elapsed_seconds == null ? '-' : item.elapsed_seconds < 60 ? `${item.elapsed_seconds}秒` : `${Math.floor(item.elapsed_seconds / 60)}分${item.elapsed_seconds % 60}秒`}
                          </td>
                          <td className="px-4 py-3 text-gray-500">
                            {new Date(item.submitted_at).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}
                          </td>
                          <td className="px-4 py-3">
                            <button
                              onClick={() => handleViewCode(item)}
                              disabled={codeLoadingId === item.user_id}
                              className="text-blue-600 hover:text-blue-800 text-xs underline disabled:opacity-40"
                            >
                              {codeLoadingId === item.user_id ? '読込中...' : 'コード閲覧'}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {/* コード閲覧モーダル */}
          {codeModal && (
            <div
              className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
              onClick={() => setCodeModal(null)}
            >
              <div
                className="bg-white rounded-lg shadow-xl w-full max-w-3xl flex flex-col"
                style={{ maxHeight: '85vh' }}
                onClick={e => e.stopPropagation()}
              >
                <div className="flex items-start justify-between px-5 py-4 border-b shrink-0">
                  <div>
                    <h2 className="font-semibold text-base">{codeModal.username}.c</h2>
                    <p className="text-xs text-gray-400 mt-0.5">
                      最終提出：{new Date(codeModal.submitted_at).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 ml-4">
                    <button
                      onClick={() => downloadCodeFile(codeModal.username, codeModal.code)}
                      className="text-sm border rounded px-3 py-1.5 hover:bg-gray-50 text-gray-700"
                    >
                      ダウンロード (.c)
                    </button>
                    <button
                      onClick={() => setCodeModal(null)}
                      className="text-gray-400 hover:text-gray-700 text-2xl leading-none px-1"
                    >
                      ×
                    </button>
                  </div>
                </div>
                <div className="overflow-auto flex-1 p-4 bg-gray-950 rounded-b-lg">
                  <pre className="text-xs font-mono text-gray-100 whitespace-pre leading-relaxed">
                    {codeModal.code}
                  </pre>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
