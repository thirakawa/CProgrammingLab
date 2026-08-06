'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { apiCreateProblem, apiAddTestCase } from '@/lib/api'

interface TcDraft {
  input: string
  expected_output: string
}

export default function NewProblemPage() {
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [testCases, setTestCases] = useState<TcDraft[]>([{ input: '', expected_output: '' }])
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const addTc = () => setTestCases([...testCases, { input: '', expected_output: '' }])
  const removeTc = (i: number) => setTestCases(testCases.filter((_, idx) => idx !== i))
  const updateTc = (i: number, field: keyof TcDraft, value: string) => {
    setTestCases(testCases.map((tc, idx) => idx === i ? { ...tc, [field]: value } : tc))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      const problem = await apiCreateProblem({ title, description })
      for (const tc of testCases) {
        if (tc.input !== '' || tc.expected_output !== '') {
          await apiAddTestCase(problem.id, tc)
        }
      }
      router.push('/teacher/problems')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'エラー')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">問題作成</h1>
      {error && <p className="text-red-500 mb-4">{error}</p>}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="bg-white rounded-lg shadow p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">タイトル</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full border rounded px-3 py-2"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">問題文</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={8}
              className="w-full border rounded px-3 py-2 font-mono text-sm"
              placeholder="問題文をMarkdown形式で記述できます"
              required
            />
            <p className="text-xs text-gray-400 mt-1">
              数式はLaTeX記法で記述できます（例：インライン $x^2 + y^2 = z^2$ ／ ブロック $$\int_0^1 x\,dx$$）
            </p>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold">テストケース</h2>
            <button type="button" onClick={addTc} className="text-blue-600 hover:underline text-sm">
              + 追加
            </button>
          </div>
          <div className="space-y-4">
            {testCases.map((tc, i) => (
              <div key={i} className="border rounded p-4">
                <div className="flex justify-between items-center mb-3">
                  <span className="text-sm font-medium text-gray-600">テストケース {i + 1}</span>
                  {testCases.length > 1 && (
                    <button type="button" onClick={() => removeTc(i)} className="text-red-400 hover:text-red-600 text-xs">削除</button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">入力</label>
                    <textarea
                      value={tc.input}
                      onChange={(e) => updateTc(i, 'input', e.target.value)}
                      rows={3}
                      className="w-full border rounded px-2 py-1.5 text-sm font-mono"
                      placeholder="（なし）"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">期待される出力</label>
                    <textarea
                      value={tc.expected_output}
                      onChange={(e) => updateTc(i, 'expected_output', e.target.value)}
                      rows={3}
                      className="w-full border rounded px-2 py-1.5 text-sm font-mono"
                      required
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={submitting}
            className="bg-blue-600 text-white rounded px-6 py-2 hover:bg-blue-700 disabled:opacity-50"
          >
            {submitting ? '作成中...' : '問題を作成'}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="border rounded px-6 py-2 hover:bg-gray-50"
          >
            キャンセル
          </button>
        </div>
      </form>
    </div>
  )
}
