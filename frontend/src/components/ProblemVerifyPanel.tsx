'use client'

import { useState } from 'react'
import { apiVerifyProblem, type SampleRunResponse } from '@/lib/api'

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  accepted: { label: 'AC', cls: 'text-green-600' },
  wrong_answer: { label: 'WA', cls: 'text-red-500' },
  time_limit_exceeded: { label: 'TLE', cls: 'text-orange-500' },
  runtime_error: { label: 'RE', cls: 'text-red-600' },
}

/** 模範解答を全テストケース（非公開分）で実行して、ハーネス・テストケースを動作確認する */
export default function ProblemVerifyPanel({ problemId, testCaseCount }: { problemId: number; testCaseCount: number }) {
  const [code, setCode] = useState('')
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<SampleRunResponse | null>(null)
  const [error, setError] = useState('')

  const run = async () => {
    setRunning(true)
    setError('')
    setResult(null)
    try {
      setResult(await apiVerifyProblem(problemId, code))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'エラー')
    } finally {
      setRunning(false)
    }
  }

  const passed = result?.results.filter(r => r.status === 'accepted').length ?? 0

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center gap-2 mb-1">
        <h2 className="text-lg font-semibold">動作確認</h2>
        <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded">模範解答で全テストケースを実行（保存されません）</span>
      </div>
      <p className="text-xs text-gray-500 mb-3">
        ハーネスのコンパイルエラーや、テストケースの期待出力の誤りを確認できます。
        関数定義型の問題では、関数だけを書いたコードを入力してください。
      </p>
      <textarea
        value={code}
        onChange={(e) => setCode(e.target.value)}
        rows={10}
        spellCheck={false}
        className="w-full border rounded px-3 py-2 font-mono text-xs"
        placeholder="模範解答のコード"
      />
      <button
        type="button"
        onClick={run}
        disabled={running || !code.trim() || testCaseCount === 0}
        className="mt-2 bg-gray-800 text-white rounded px-4 py-2 text-sm hover:bg-gray-900 disabled:opacity-40"
      >
        {running ? '実行中...' : `全${testCaseCount}件のテストケースで実行`}
      </button>
      {testCaseCount === 0 && <span className="ml-3 text-xs text-gray-400">テストケースがありません</span>}
      {error && <p className="text-red-500 text-sm mt-3">{error}</p>}

      {result && (
        <div className="mt-4 text-sm">
          {result.compile_error ? (
            <pre className="bg-red-50 text-red-700 rounded p-3 text-xs whitespace-pre-wrap">{result.compile_error}</pre>
          ) : (
            <>
              <p className="font-medium mb-2">
                {passed} / {result.results.length} 件が一致
                {passed === result.results.length && <span className="ml-2 text-green-600">すべて正解</span>}
              </p>
              {result.compile_warnings && (
                <pre className="bg-yellow-50 text-yellow-800 rounded p-3 text-xs whitespace-pre-wrap mb-2">{result.compile_warnings}</pre>
              )}
              <div className="space-y-2">
                {result.results.map((r, i) => {
                  const st = STATUS_LABEL[r.status] ?? { label: r.status, cls: 'text-gray-600' }
                  return (
                    <div key={i} className="border rounded p-2">
                      <p className="text-xs mb-1">
                        <span className="text-gray-500">#{i + 1}</span>{' '}
                        <span className={`font-semibold ${st.cls}`}>{st.label}</span>
                        <span className="text-gray-400 ml-2">{r.time_ms} ms</span>
                      </p>
                      {r.status !== 'accepted' && (
                        <div className="grid grid-cols-3 gap-2">
                          <div><p className="text-xs text-gray-400">入力</p><pre className="text-xs bg-gray-50 rounded p-1.5 font-mono whitespace-pre-wrap">{r.input || '（なし）'}</pre></div>
                          <div><p className="text-xs text-gray-400">期待出力</p><pre className="text-xs bg-gray-50 rounded p-1.5 font-mono whitespace-pre-wrap">{r.expected_output}</pre></div>
                          <div><p className="text-xs text-gray-400">実際の出力</p><pre className="text-xs bg-gray-50 rounded p-1.5 font-mono whitespace-pre-wrap">{r.actual_output}</pre></div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
