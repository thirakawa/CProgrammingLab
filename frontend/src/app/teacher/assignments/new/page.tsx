'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { apiGetProblems, apiGetClasses, apiCreateAssignment, type Problem, type Class } from '@/lib/api'

function toJSTDatetimeValue(date: Date): string {
  const jst = new Date(date.getTime() + 9 * 60 * 60 * 1000)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${jst.getUTCFullYear()}-${pad(jst.getUTCMonth() + 1)}-${pad(jst.getUTCDate())}T${pad(jst.getUTCHours())}:${pad(jst.getUTCMinutes())}`
}

function jstToUTC(jstLocal: string): string {
  return new Date(jstLocal + '+09:00').toISOString()
}

export default function NewAssignmentPage() {
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [problemId, setProblemId] = useState<number | ''>('')
  const [classId, setClassId] = useState<number | ''>('')
  const now = new Date()
  const later = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
  const [openAt, setOpenAt] = useState(toJSTDatetimeValue(now))
  const [closeAt, setCloseAt] = useState(toJSTDatetimeValue(later))
  const [problems, setProblems] = useState<Problem[]>([])
  const [classes, setClasses] = useState<Class[]>([])
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    Promise.all([apiGetProblems(), apiGetClasses()])
      .then(([p, c]) => { setProblems(p); setClasses(c) })
      .catch((e) => setError(e.message))
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!problemId) return setError('問題を選択してください')
    if (!classId) return setError('クラスを選択してください')
    setError('')
    setSubmitting(true)
    try {
      await apiCreateAssignment({
        title,
        problem_id: Number(problemId),
        class_id: Number(classId),
        open_at: jstToUTC(openAt),
        close_at: jstToUTC(closeAt),
      })
      router.push('/teacher/assignments')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'エラー')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">課題作成</h1>
      {error && <p className="text-red-500 mb-4">{error}</p>}

      <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow p-6 space-y-5">
        <div>
          <label className="block text-sm font-medium mb-1">課題タイトル</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full border rounded px-3 py-2"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">対象クラス</label>
          <select
            value={classId}
            onChange={(e) => setClassId(Number(e.target.value))}
            className="w-full border rounded px-3 py-2"
            required
          >
            <option value="">-- クラスを選択 --</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          {classes.length === 0 && (
            <p className="text-xs text-gray-400 mt-1">クラスがまだ作成されていません。先にクラスを作成してください。</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">問題</label>
          <select
            value={problemId}
            onChange={(e) => setProblemId(Number(e.target.value))}
            className="w-full border rounded px-3 py-2"
            required
          >
            <option value="">-- 問題を選択 --</option>
            {problems.map((p) => (
              <option key={p.id} value={p.id}>{p.title}</option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">公開開始日時（日本時間）</label>
            <input
              type="datetime-local"
              value={openAt}
              onChange={(e) => setOpenAt(e.target.value)}
              className="w-full border rounded px-3 py-2"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">締切日時（日本時間）</label>
            <input
              type="datetime-local"
              value={closeAt}
              onChange={(e) => setCloseAt(e.target.value)}
              className="w-full border rounded px-3 py-2"
              required
            />
          </div>
        </div>

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={submitting}
            className="bg-blue-600 text-white rounded px-6 py-2 hover:bg-blue-700 disabled:opacity-50"
          >
            {submitting ? '作成中...' : '課題を作成'}
          </button>
          <button type="button" onClick={() => router.back()} className="border rounded px-6 py-2 hover:bg-gray-50">
            キャンセル
          </button>
        </div>
      </form>
    </div>
  )
}
