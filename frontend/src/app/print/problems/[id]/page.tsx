'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { apiGetProblem, type Problem } from '@/lib/api'
import MarkdownRenderer from '@/components/MarkdownRenderer'
import RoleGuard from '@/components/RoleGuard'
import { constraintLines, hasMinConstraint } from '@/lib/constraints'

function ProblemPrintView({ problem }: { problem: Problem }) {
  const constraints = constraintLines(problem)

  const sampleCases = problem.sample_cases ?? []

  return (
    <div className="max-w-3xl mx-auto px-6 py-10 print:px-0 print:py-0">
      <button
        type="button"
        onClick={() => window.print()}
        className="print:hidden mb-6 bg-blue-600 text-white rounded px-5 py-2 text-sm font-medium hover:bg-blue-700"
      >
        印刷 / PDFとして保存
      </button>

      <h1 className="text-2xl font-bold mb-4">{problem.title}</h1>

      <section className="mb-6">
        <h2 className="text-lg font-semibold border-b pb-1 mb-3">問題文</h2>
        <MarkdownRenderer content={problem.description} />
      </section>

      {constraints.length > 0 && (
        <section className="mb-6">
          <h2 className="text-lg font-semibold border-b pb-1 mb-3">コード制約</h2>
          <ul className="list-disc pl-5 text-sm space-y-1">
            {constraints.map(c => (
              <li key={c.key}>
                {c.label}：{c.text}
                {c.key === 'ifs' && '（else if も1つとしてカウント）'}
              </li>
            ))}
          </ul>
          {hasMinConstraint(problem) && (
            <p className="text-xs text-gray-600 mt-2">
              {problem.constraint_mode === 'reject'
                ? '※ 下限に満たないコードは提出できません（上限を超えた場合は減点されます）。'
                : '※ 範囲を外れると減点されます。'}
            </p>
          )}
        </section>
      )}

      {sampleCases.length > 0 && (
        <section className="mb-6">
          <h2 className="text-lg font-semibold border-b pb-1 mb-3">入出力例</h2>
          <div className="space-y-4">
            {sampleCases.map((sc, i) => (
              <div key={sc.id} className="break-inside-avoid">
                <p className="text-sm font-medium mb-1">入出力例 {i + 1}</p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-gray-500 mb-1">入力</p>
                    <pre className="border rounded p-2 text-xs font-mono whitespace-pre-wrap">{sc.input || '（なし）'}</pre>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-1">出力</p>
                    <pre className="border rounded p-2 text-xs font-mono whitespace-pre-wrap">{sc.expected_output}</pre>
                  </div>
                </div>
                {sc.files.length > 0 && (
                  <div className="mt-2">
                    <p className="text-xs text-gray-500 mb-1">添付ファイル</p>
                    {sc.files.map(f => (
                      <div key={f.id} className="mb-1">
                        <p className="text-xs font-mono text-gray-600">{f.filename}</p>
                        <pre className="border rounded p-2 text-xs font-mono whitespace-pre-wrap">{f.content}</pre>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

export default function ProblemPrintPage() {
  const { id } = useParams<{ id: string }>()
  const [problem, setProblem] = useState<Problem | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    apiGetProblem(Number(id)).then(setProblem).catch(e => setError(e instanceof Error ? e.message : 'エラー'))
  }, [id])

  return (
    <RoleGuard allow={['teacher', 'ta']}>
      {error && <p className="text-red-500 p-6">{error}</p>}
      {!error && !problem && <p className="text-gray-400 p-6">読み込み中...</p>}
      {problem && <ProblemPrintView problem={problem} />}
    </RoleGuard>
  )
}
