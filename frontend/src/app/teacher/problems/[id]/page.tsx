'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  apiGetProblem, apiUpdateProblem,
  apiAddTestCase, apiDeleteTestCase,
  apiAddSampleCase, apiDeleteSampleCase,
  type Problem, type TestCase, type SampleCase, type CaseFile,
} from '@/lib/api'
import MarkdownRenderer from '@/components/MarkdownRenderer'
import CaseFileEditor from '@/components/CaseFileEditor'
import {
  constraintFormFromProblem, constraintFormToPayload, emptyConstraintForm, validateConstraintForm,
  type ConstraintForm,
} from '@/lib/constraints'
import ConstraintEditor from '@/components/ConstraintEditor'
import ProblemTypeEditor from '@/components/ProblemTypeEditor'
import ProblemVerifyPanel from '@/components/ProblemVerifyPanel'
import {
  emptyTypeForm, typeFormFromProblem, typeFormToPayload, validateTypeForm, type TypeForm,
} from '@/lib/problemType'

type CaseForm = { input: string; expected_output: string; files: { filename: string; content: string }[] }

function CaseList({
  title,
  badge,
  cases,
  onDelete,
  onAdd,
  form,
  setForm,
  error,
}: {
  title: string
  badge?: string
  cases: { id: number; input: string; expected_output: string; files: CaseFile[] }[]
  onDelete: (id: number) => Promise<void>
  onAdd: (e: React.FormEvent) => Promise<void>
  form: CaseForm
  setForm: (f: CaseForm) => void
  error?: string
}) {
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [localError, setLocalError] = useState('')

  const handleDelete = async (id: number) => {
    setLocalError('')
    setDeletingId(id)
    try {
      await onDelete(id)
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : '削除に失敗しました')
    } finally {
      setDeletingId(null)
    }
  }

  const [adding, setAdding] = useState(false)
  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    setLocalError('')
    setAdding(true)
    try {
      await onAdd(e)
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : '追加に失敗しました')
    } finally {
      setAdding(false)
    }
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center gap-2 mb-4">
        <h2 className="text-lg font-semibold">{title}</h2>
        {badge && <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded">{badge}</span>}
      </div>

      {(localError || error) && (
        <p className="text-red-500 text-sm mb-3">{localError || error}</p>
      )}

      <div className="space-y-3 mb-6">
        {cases.length === 0 && (
          <p className="text-gray-400 text-sm">まだありません</p>
        )}
        {cases.map((c, i) => (
          <div key={c.id} className="border rounded p-3 flex gap-4 items-start">
            <span className="text-xs text-gray-500 mt-1 shrink-0">#{i + 1}</span>
            <div className="flex-1 grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-gray-400 mb-1">入力</p>
                <pre className="text-sm bg-gray-50 rounded p-2 font-mono whitespace-pre-wrap">{c.input || '（なし）'}</pre>
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-1">期待出力</p>
                <pre className="text-sm bg-gray-50 rounded p-2 font-mono whitespace-pre-wrap">{c.expected_output}</pre>
              </div>
              {c.files.length > 0 && (
                <div className="col-span-2">
                  <p className="text-xs text-gray-400 mb-1">添付ファイル</p>
                  <div className="flex flex-wrap gap-1.5">
                    {c.files.map(f => (
                      <span key={f.id} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded font-mono">
                        {f.filename}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => handleDelete(c.id)}
              disabled={deletingId === c.id}
              className="text-red-400 hover:text-red-600 text-xs shrink-0 disabled:opacity-40"
            >
              {deletingId === c.id ? '削除中...' : '削除'}
            </button>
          </div>
        ))}
      </div>

      <h3 className="font-medium mb-3 text-sm text-gray-700">追加</h3>
      <form onSubmit={handleAdd} className="border rounded p-4">
        <div className="grid grid-cols-2 gap-4 mb-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">入力</label>
            <textarea
              value={form.input}
              onChange={e => setForm({ ...form, input: e.target.value })}
              rows={3}
              className="w-full border rounded px-2 py-1.5 text-sm font-mono"
              placeholder="（なし）"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">期待される出力</label>
            <textarea
              value={form.expected_output}
              onChange={e => setForm({ ...form, expected_output: e.target.value })}
              rows={3}
              className="w-full border rounded px-2 py-1.5 text-sm font-mono"
              required
            />
          </div>
        </div>
        <CaseFileEditor files={form.files} onChange={(files) => setForm({ ...form, files })} />
        <button
          type="submit"
          disabled={adding}
          className="bg-blue-600 text-white rounded px-4 py-2 text-sm hover:bg-blue-700 disabled:opacity-50"
        >
          {adding ? '追加中...' : '追加'}
        </button>
      </form>
    </div>
  )
}

export default function EditProblemPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [problem, setProblem] = useState<Problem | null>(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [descPreview, setDescPreview] = useState(false)
  const [constraints, setConstraints] = useState<ConstraintForm>(emptyConstraintForm())
  const [typeForm, setTypeForm] = useState<TypeForm>(emptyTypeForm())
  const [newTc, setNewTc] = useState<CaseForm>({ input: '', expected_output: '', files: [] })
  const [newSc, setNewSc] = useState<CaseForm>({ input: '', expected_output: '', files: [] })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    apiGetProblem(Number(id)).then(p => {
      setProblem(p)
      setTitle(p.title)
      setDescription(p.description)
      setConstraints(constraintFormFromProblem(p))
      setTypeForm(typeFormFromProblem(p))
    }).catch(e => setError(e.message))
  }, [id])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    const invalid = validateConstraintForm(constraints)
    if (invalid) { setError(invalid); return }
    const typeInvalid = validateTypeForm(typeForm)
    if (typeInvalid) { setError(typeInvalid); return }
    setSaving(true)
    try {
      await apiUpdateProblem(Number(id), {
        title,
        description,
        ...constraintFormToPayload(constraints),
        ...typeFormToPayload(typeForm),
      })
      router.push('/teacher/problems')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'エラー')
    } finally {
      setSaving(false)
    }
  }

  // テストケース削除：state を直接更新（再取得なし）
  const handleDeleteTc = async (tcId: number) => {
    await apiDeleteTestCase(Number(id), tcId)
    setProblem(prev => prev
      ? { ...prev, test_cases: prev.test_cases.filter((tc: TestCase) => tc.id !== tcId) }
      : prev
    )
  }

  // テストケース追加：state を直接更新（再取得なし）
  const handleAddTc = async (e: React.FormEvent) => {
    e.preventDefault()
    const added = await apiAddTestCase(Number(id), newTc)
    setProblem(prev => prev
      ? { ...prev, test_cases: [...prev.test_cases, added] }
      : prev
    )
    setNewTc({ input: '', expected_output: '', files: [] })
  }

  // サンプルケース削除：state を直接更新（再取得なし）
  const handleDeleteSc = async (scId: number) => {
    await apiDeleteSampleCase(Number(id), scId)
    setProblem(prev => prev
      ? { ...prev, sample_cases: prev.sample_cases.filter((sc: SampleCase) => sc.id !== scId) }
      : prev
    )
  }

  // サンプルケース追加：state を直接更新（再取得なし）
  const handleAddSc = async (e: React.FormEvent) => {
    e.preventDefault()
    const added = await apiAddSampleCase(Number(id), newSc)
    setProblem(prev => prev
      ? { ...prev, sample_cases: [...prev.sample_cases, added] }
      : prev
    )
    setNewSc({ input: '', expected_output: '', files: [] })
  }

  if (!problem) return <p className="text-gray-400">読み込み中...</p>

  return (
    <div className="max-w-3xl space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">問題編集</h1>
        <a
          href={`/print/problems/${id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="border border-gray-300 text-gray-700 rounded px-4 py-2 text-sm hover:bg-gray-50"
        >
          PDFエクスポート
        </a>
      </div>
      {error && <p className="text-red-500">{error}</p>}

      {/* 基本情報 + 制約 */}
      <form onSubmit={handleSave} className="bg-white rounded-lg shadow p-6 space-y-5">
        <div>
          <label className="block text-sm font-medium mb-1">タイトル</label>
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            className="w-full border rounded px-3 py-2"
            required
          />
        </div>
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-sm font-medium">問題文（Markdown）</label>
            <div className="flex border rounded overflow-hidden text-xs">
              <button
                type="button"
                onClick={() => setDescPreview(false)}
                className={`px-3 py-1 ${!descPreview ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
              >
                編集
              </button>
              <button
                type="button"
                onClick={() => setDescPreview(true)}
                className={`px-3 py-1 ${descPreview ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
              >
                プレビュー
              </button>
            </div>
          </div>
          {descPreview ? (
            <div className="w-full border rounded px-3 py-2 min-h-[12rem] bg-white">
              {description ? <MarkdownRenderer content={description} /> : <p className="text-gray-400 text-sm">（問題文を入力してください）</p>}
            </div>
          ) : (
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={8}
              className="w-full border rounded px-3 py-2 font-mono text-sm"
              required
            />
          )}
          <p className="text-xs text-gray-400 mt-1">
            数式はLaTeX記法で記述できます（例：インライン $x^2 + y^2 = z^2$ ／ ブロック $$\int_0^1 x\,dx$$）
          </p>
        </div>

        {/* 問題タイプ・初期コード・採点用ハーネス */}
        <ProblemTypeEditor value={typeForm} onChange={setTypeForm} />

        {/* コード制約 */}
        <ConstraintEditor value={constraints} onChange={setConstraints} />

        <div className="flex gap-3">
          <button type="submit" disabled={saving} className="bg-blue-600 text-white rounded px-4 py-2 hover:bg-blue-700 disabled:opacity-50">
            {saving ? '保存中...' : '保存'}
          </button>
          <button type="button" onClick={() => router.back()} className="border rounded px-4 py-2 hover:bg-gray-50">
            戻る
          </button>
        </div>
      </form>

      {/* サンプルケース */}
      <CaseList
        title="サンプルケース"
        badge="学生に公開される入出力例"
        cases={problem.sample_cases ?? []}
        onDelete={handleDeleteSc}
        onAdd={handleAddSc}
        form={newSc}
        setForm={setNewSc}
      />

      {/* テストケース */}
      <CaseList
        title="テストケース"
        badge="採点用（学生には非公開）"
        cases={problem.test_cases ?? []}
        onDelete={handleDeleteTc}
        onAdd={handleAddTc}
        form={newTc}
        setForm={setNewTc}
      />

      {/* 模範解答での動作確認（保存済みのハーネス・テストケースに対して実行） */}
      <ProblemVerifyPanel problemId={problem.id} testCaseCount={problem.test_cases?.length ?? 0} />
    </div>
  )
}
