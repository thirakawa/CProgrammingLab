'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { apiGetProblem, type Problem, type CaseFile } from '@/lib/api'
import MarkdownRenderer from '@/components/MarkdownRenderer'

function CaseListReadOnly({
  title,
  badge,
  cases,
}: {
  title: string
  badge?: string
  cases: { id: number; input: string; expected_output: string; files: CaseFile[] }[]
}) {
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center gap-2 mb-4">
        <h2 className="text-lg font-semibold">{title}</h2>
        {badge && <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded">{badge}</span>}
      </div>
      <div className="space-y-3">
        {cases.length === 0 && (
          <p className="text-gray-400 text-sm">まだありません</p>
        )}
        {cases.map((c, i) => (
          <div key={c.id} className="border rounded p-3">
            <span className="text-xs text-gray-500">#{i + 1}</span>
            <div className="grid grid-cols-2 gap-4 mt-1">
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
                  <div className="space-y-2">
                    {c.files.map(f => (
                      <div key={f.id}>
                        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded font-mono">
                          {f.filename}
                        </span>
                        <pre className="text-xs bg-gray-50 rounded p-2 font-mono whitespace-pre-wrap mt-1">{f.content}</pre>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function TaProblemDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [problem, setProblem] = useState<Problem | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    apiGetProblem(Number(id)).then(setProblem).catch(e => setError(e instanceof Error ? e.message : 'エラー'))
  }, [id])

  if (error) return <p className="text-red-500">{error}</p>
  if (!problem) return <p className="text-gray-400">読み込み中...</p>

  const constraints = [
    { label: '変数の最大数', value: problem.max_vars },
    { label: '配列の最大数', value: problem.max_arrays },
    { label: 'ポインタの最大数', value: problem.max_pointers },
    { label: 'ループの最大数', value: problem.max_loops },
    { label: 'if の最大数', value: problem.max_ifs },
  ]

  return (
    <div className="max-w-3xl space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{problem.title}</h1>
        <button type="button" onClick={() => router.back()} className="border rounded px-4 py-2 text-sm hover:bg-gray-50">
          戻る
        </button>
      </div>

      <div className="bg-white rounded-lg shadow p-6 space-y-5">
        <div>
          <p className="text-sm font-medium mb-1">問題文</p>
          <div className="border rounded px-3 py-2 bg-gray-50">
            <MarkdownRenderer content={problem.description} />
          </div>
        </div>

        <div>
          <p className="text-sm font-medium mb-2">コード制約</p>
          <div className="grid grid-cols-5 gap-3">
            {constraints.map(c => (
              <div key={c.label}>
                <p className="text-xs text-gray-500 mb-1">{c.label}</p>
                <p className="text-sm">{c.value ?? '無制限'}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <CaseListReadOnly
        title="サンプルケース"
        badge="学生に公開される入出力例"
        cases={problem.sample_cases ?? []}
      />

      <CaseListReadOnly
        title="テストケース"
        badge="採点用（学生には非公開）"
        cases={problem.test_cases ?? []}
      />
    </div>
  )
}
