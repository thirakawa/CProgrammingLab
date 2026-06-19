'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import {
  apiGetAssignment, apiStartAssignment, apiGetMyLatestSubmission,
  apiSubmit, apiRunSample,
  type Assignment, type Submission, type SampleRunResponse,
} from '@/lib/api'
import dynamic from 'next/dynamic'
import MarkdownRenderer from '@/components/MarkdownRenderer'

const CodeEditor = dynamic(() => import('@/components/CodeEditor'), { ssr: false })

const DEFAULT_CODE = `#include <stdio.h>

int main() {
    // ここにコードを書いてください

    return 0;
}
`

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  accepted: { label: 'AC (正解)', cls: 'text-green-600' },
  wrong_answer: { label: 'WA (不正解)', cls: 'text-red-500' },
  time_limit_exceeded: { label: 'TLE (時間超過)', cls: 'text-orange-500' },
  runtime_error: { label: 'RE (実行エラー)', cls: 'text-red-600' },
  compile_error: { label: 'CE (コンパイルエラー)', cls: 'text-red-700' },
  CE: { label: 'CE (コンパイルエラー)', cls: 'text-red-700' },
  constraint_error: { label: '制約エラー', cls: 'text-purple-600' },
}

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return m > 0 ? `${m}分${s}秒` : `${s}秒`
}

type Mode = 'editing' | 'completed' | 'resubmitting'

interface ScoreDetail {
  score_base: number
  score_clear: number
  score_time: number
  deduct_warn: number
  deduct_var: number
  deduct_arr: number
  deduct_ptr: number
  deduct_loop: number
  deduct_if: number
  total: number
  passed: number
  total_cases: number
  constraint_message: string
}

function ScoreBreakdown({ detail }: { detail: ScoreDetail }) {
  const subtotal = detail.score_base + detail.score_clear + detail.score_time
  const totalDeduct = detail.deduct_warn + detail.deduct_var + detail.deduct_arr
    + detail.deduct_ptr + detail.deduct_loop + detail.deduct_if
  const deductions: { label: string; value: number }[] = [
    { label: 'コンパイル警告',          value: detail.deduct_warn },
    { label: '変数数超過（制約違反）',   value: detail.deduct_var },
    { label: '配列数超過（制約違反）',   value: detail.deduct_arr },
    { label: 'ポインタ数超過（制約違反）', value: detail.deduct_ptr },
    { label: 'ループ数超過（制約違反）', value: detail.deduct_loop },
    { label: 'if文数超過（制約違反）',   value: detail.deduct_if },
  ].filter(d => d.value > 0)

  return (
    <div className="bg-gray-50 border border-gray-200 rounded p-4 mt-4 text-sm">
      <p className="font-medium text-gray-700 mb-2">点数内訳</p>
      <table className="w-full text-xs">
        <tbody>
          <tr>
            <td className="text-gray-600 py-0.5">正解数</td>
            <td className="text-gray-500 text-right">{detail.passed} / {detail.total_cases} ケース</td>
            <td className="text-right font-mono w-20 pl-4">{detail.score_base.toFixed(1)} / 50</td>
          </tr>
          <tr>
            <td className="text-gray-600 py-0.5">全問正解ボーナス</td>
            <td />
            <td className="text-right font-mono w-20 pl-4">{detail.score_clear.toFixed(1)} / 20</td>
          </tr>
          <tr>
            <td className="text-gray-600 py-0.5">時間点</td>
            <td className="text-gray-500 text-right text-xs">3分ごとに -1点（最大30点）</td>
            <td className="text-right font-mono w-20 pl-4">{detail.score_time.toFixed(1)} / 30</td>
          </tr>
          <tr className="border-t border-gray-200">
            <td className="text-gray-700 font-medium py-0.5">小計</td>
            <td />
            <td className="text-right font-mono w-20 pl-4 font-medium">{subtotal.toFixed(1)}</td>
          </tr>
          {deductions.map(d => (
            <tr key={d.label} className="text-red-600">
              <td className="py-0.5" colSpan={2}>{d.label}</td>
              <td className="text-right font-mono w-20 pl-4">-{d.value.toFixed(1)}</td>
            </tr>
          ))}
          {totalDeduct > 0 && (
            <tr className="border-t border-gray-200 font-bold">
              <td className="text-gray-800 py-0.5" colSpan={2}>合計</td>
              <td className="text-right font-mono w-20 pl-4 text-gray-900">{detail.total.toFixed(1)}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

export default function AssignmentPage() {
  const { id } = useParams<{ id: string }>()
  const [assignment, setAssignment] = useState<Assignment | null>(null)
  const [code, setCode] = useState(DEFAULT_CODE)
  const [startedAt, setStartedAt] = useState<Date | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [mode, setMode] = useState<Mode>('editing')
  const [currentResult, setCurrentResult] = useState<Submission | null>(null)
  const [sampleResult, setSampleResult] = useState<SampleRunResponse | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState('')
  const [isBeforeOpen, setIsBeforeOpen] = useState(false)

  useEffect(() => {
    const load = async () => {
      try {
        const [asgn, latest] = await Promise.all([
          apiGetAssignment(Number(id)),
          apiGetMyLatestSubmission(Number(id)),
        ])
        setAssignment(asgn)

        const now = new Date()
        const openAt = new Date(asgn.open_at)
        if (now < openAt) {
          setIsBeforeOpen(true)
          return
        }

        // 最新提出があればそのコードを読み込み、完了モードへ
        if (latest) {
          setCode(latest.code)
          setCurrentResult(latest)
          setMode('completed')
        }

        // サーバー側の開始時刻を取得（初回はここで記録される）
        try {
          const { started_at } = await apiStartAssignment(Number(id))
          setStartedAt(new Date(started_at))
        } catch {
          // 締切後で開始記録がない場合はフォールバック
          if (latest?.started_at) {
            setStartedAt(new Date(latest.started_at))
          }
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : '読み込みエラー')
      }
    }
    load()
  }, [id])

  // 1秒ごとに経過時間を更新
  useEffect(() => {
    const timer = setInterval(() => {
      if (startedAt) {
        setElapsed(Math.floor((Date.now() - startedAt.getTime()) / 1000))
      }
    }, 1000)
    return () => clearInterval(timer)
  }, [startedAt])

  const handleRunSample = async () => {
    if (!assignment) return
    setError('')
    setRunning(true)
    setSampleResult(null)
    try {
      const result = await apiRunSample({ problem_id: assignment.problem_id, code })
      setSampleResult(result)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'エラー')
    } finally {
      setRunning(false)
    }
  }

  const handleSubmit = async () => {
    if (!assignment) return
    setError('')
    setSubmitting(true)
    try {
      const result = await apiSubmit({
        problem_id: assignment.problem_id,
        assignment_id: assignment.id,
        code,
        // 開始時刻はサーバー側で AssignmentStart から取得するが、念のため送信
        started_at: startedAt?.toISOString() ?? null,
        elapsed_seconds: startedAt
          ? Math.floor((Date.now() - startedAt.getTime()) / 1000)
          : null,
      })
      setCurrentResult(result)
      setMode('completed')
      setSampleResult(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'エラー')
    } finally {
      setSubmitting(false)
    }
  }

  const handleStartResubmit = () => {
    setMode('resubmitting')
    setSampleResult(null)
  }

  const handleCancelResubmit = () => {
    if (currentResult) setCode(currentResult.code)
    setMode('completed')
    setSampleResult(null)
  }

  if (error && !assignment) return <p className="text-red-500">{error}</p>
  if (!assignment) return <p className="text-gray-400">読み込み中...</p>

  if (isBeforeOpen) {
    const openAt = new Date(assignment.open_at)
    return (
      <div>
        <h1 className="text-2xl font-bold mb-4">{assignment.title}</h1>
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center">
          <p className="text-yellow-700 font-medium">この課題はまだ開始されていません</p>
          <p className="text-sm text-yellow-600 mt-1">
            開始日時：{openAt.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}
          </p>
        </div>
      </div>
    )
  }

  const closeAt = new Date(assignment.close_at)
  const isExpired = closeAt < new Date()
  const problem = assignment.problem
  const sampleCases = problem?.sample_cases ?? []
  const hasSamples = sampleCases.length > 0
  const editorReadOnly = isExpired || mode === 'completed'
  const canEdit = !isExpired && mode !== 'completed'

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">{assignment.title}</h1>
      <div className="flex items-center gap-4 mb-6 flex-wrap">
        <p className="text-sm text-gray-500">
          締切：{closeAt.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}
          {isExpired && <span className="ml-2 text-red-400">（締切済）</span>}
        </p>
        {startedAt && (
          <span className="text-sm bg-blue-50 text-blue-700 px-3 py-1 rounded-full font-mono">
            経過時間：{formatElapsed(elapsed)}
          </span>
        )}
        {mode === 'completed' && (
          <span className="text-sm bg-green-50 text-green-700 border border-green-200 px-3 py-1 rounded-full font-medium">
            提出済
          </span>
        )}
        {mode === 'resubmitting' && (
          <span className="text-sm bg-orange-50 text-orange-700 border border-orange-200 px-3 py-1 rounded-full font-medium">
            再提出モード
          </span>
        )}
      </div>
      {error && <p className="text-red-500 mb-4">{error}</p>}

      {/* 問題文 */}
      {problem && (
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="font-semibold text-lg mb-3">{problem.title}</h2>
          <div className="mb-4">
            <MarkdownRenderer content={problem.description} />
          </div>

          {/* コード制約 */}
          {(problem.max_vars != null || problem.max_arrays != null || problem.max_pointers != null ||
            problem.max_loops != null || problem.max_ifs != null) && (
            <div className="border border-yellow-200 bg-yellow-50 rounded p-3 text-sm">
              <p className="font-medium text-yellow-800 mb-1">コード制約</p>
              <ul className="text-yellow-700 space-y-0.5 text-xs">
                {problem.max_vars != null && <li>変数の最大宣言数：{problem.max_vars}</li>}
                {problem.max_arrays != null && <li>配列の最大宣言数：{problem.max_arrays}</li>}
                {problem.max_pointers != null && <li>ポインタの最大宣言数：{problem.max_pointers}</li>}
                {problem.max_loops != null && <li>ループ（for/while）の最大使用数：{problem.max_loops}</li>}
                {problem.max_ifs != null && <li>条件分岐（if）の最大使用数：{problem.max_ifs}（else if も1つとしてカウント）</li>}
              </ul>
            </div>
          )}

          {/* サンプルケース */}
          {hasSamples && (
            <div className="mt-4">
              <p className="font-medium text-sm mb-2">入出力例</p>
              <div className="space-y-3">
                {sampleCases.map((sc, i) => (
                  <div key={sc.id} className="border rounded p-3 grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-xs text-gray-400 mb-1">入力例 {i + 1}</p>
                      <pre className="bg-gray-50 rounded p-2 font-mono text-xs whitespace-pre-wrap">{sc.input || '（なし）'}</pre>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400 mb-1">出力例 {i + 1}</p>
                      <pre className="bg-gray-50 rounded p-2 font-mono text-xs whitespace-pre-wrap">{sc.expected_output}</pre>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* コードエディタ */}
      <div className="mb-4">
        <h2 className="font-semibold mb-2">
          {mode === 'completed' ? '提出したコード' : 'コードを記述してください（C言語）'}
        </h2>
        <CodeEditor value={code} onChange={setCode} height="420px" readOnly={editorReadOnly} />
      </div>

      {/* ボタン：編集モード / 再提出モード */}
      {canEdit && (
        <div className="flex gap-3 mb-8">
          {hasSamples && (
            <button
              onClick={handleRunSample}
              disabled={running || submitting}
              className="bg-gray-700 text-white rounded px-5 py-2 font-medium hover:bg-gray-800 disabled:opacity-50"
            >
              {running ? '実行中...' : 'サンプル実行'}
            </button>
          )}
          <button
            onClick={handleSubmit}
            disabled={submitting || running}
            className="bg-green-600 text-white rounded px-6 py-2 font-medium hover:bg-green-700 disabled:opacity-50"
          >
            {submitting ? '採点中...' : mode === 'resubmitting' ? '再提出する' : '提出する'}
          </button>
          {mode === 'resubmitting' && (
            <button
              onClick={handleCancelResubmit}
              className="border border-gray-300 text-gray-600 rounded px-4 py-2 font-medium hover:bg-gray-50"
            >
              キャンセル
            </button>
          )}
        </div>
      )}

      {/* 完了状態の再提出ボタン */}
      {mode === 'completed' && !isExpired && (
        <div className="mb-8">
          <button
            onClick={handleStartResubmit}
            className="border border-blue-400 text-blue-600 rounded px-5 py-2 font-medium hover:bg-blue-50"
          >
            再提出する
          </button>
        </div>
      )}

      {/* サンプル実行結果 */}
      {sampleResult && (
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="font-semibold text-lg mb-4">サンプル実行結果</h2>
          {sampleResult.compile_error ? (
            <div className="bg-red-50 rounded p-3">
              <p className="text-sm font-medium text-red-700 mb-1">コンパイルエラー</p>
              <pre className="text-xs text-red-600 whitespace-pre-wrap font-mono">{sampleResult.compile_error}</pre>
            </div>
          ) : (
            <>
              {sampleResult.compile_warnings && (
                <div className="bg-yellow-50 border border-yellow-200 rounded p-3 mb-4">
                  <p className="text-sm font-medium text-yellow-800 mb-1">コンパイル警告</p>
                  <pre className="text-xs text-yellow-700 whitespace-pre-wrap font-mono">{sampleResult.compile_warnings}</pre>
                </div>
              )}
              {sampleResult.constraint_warning && (
                <div className="bg-orange-50 border border-orange-300 rounded p-3 mb-4">
                  <p className="text-sm font-medium text-orange-800 mb-1">⚠ コード制約違反（本番提出では不正解または減点対象になります）</p>
                  <pre className="text-xs text-orange-700 whitespace-pre-wrap">{sampleResult.constraint_warning}</pre>
                </div>
              )}
              <div className="space-y-3">
                {sampleResult.results.map((r, i) => {
                  const s = STATUS_LABELS[r.status] ?? { label: r.status, cls: 'text-gray-600' }
                  const isAC = r.status === 'accepted'
                  return (
                    <div key={i} className={`border rounded p-3 ${isAC ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-sm font-medium">サンプル {i + 1}</span>
                        <span className={`text-sm font-bold ${s.cls}`}>{s.label}</span>
                      </div>
                      <div className="grid grid-cols-3 gap-3 text-xs font-mono">
                        <div>
                          <p className="text-gray-400 mb-1">入力</p>
                          <pre className="bg-white rounded p-2 whitespace-pre-wrap">{r.input || '（なし）'}</pre>
                        </div>
                        <div>
                          <p className="text-gray-400 mb-1">期待出力</p>
                          <pre className="bg-white rounded p-2 whitespace-pre-wrap">{r.expected_output}</pre>
                        </div>
                        <div>
                          <p className="text-gray-400 mb-1">実際の出力</p>
                          <pre className="bg-white rounded p-2 whitespace-pre-wrap">
                            {r.status === 'time_limit_exceeded' ? '（タイムアウト: 5秒超過）' : r.actual_output || '（なし）'}
                          </pre>
                        </div>
                      </div>
                      <p className="text-xs text-gray-400 mt-1">実行時間: {r.time_ms}ms</p>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* 採点結果（提出済みモードのみ表示） */}
      {mode === 'completed' && currentResult && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="font-semibold text-lg mb-4">採点結果</h2>
          <div className="flex items-center gap-6 mb-4 flex-wrap">
            <div>
              <p className="text-sm text-gray-500">スコア</p>
              <p className={`text-3xl font-bold ${currentResult.score === 100 ? 'text-green-600' : currentResult.score > 0 ? 'text-yellow-600' : 'text-red-500'}`}>
                {currentResult.score}点
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500">ステータス</p>
              <p className={`font-medium ${STATUS_LABELS[currentResult.status]?.cls ?? 'text-gray-700'}`}>
                {STATUS_LABELS[currentResult.status]?.label ?? currentResult.status}
              </p>
            </div>
            {currentResult.elapsed_seconds != null && (
              <div>
                <p className="text-sm text-gray-500">解答時間</p>
                <p className="font-medium text-blue-700">{formatElapsed(currentResult.elapsed_seconds)}</p>
              </div>
            )}
          </div>

          {/* 点数内訳 */}
          {currentResult.score_detail && (() => {
            try {
              const d: ScoreDetail = JSON.parse(currentResult.score_detail!)
              return <ScoreBreakdown detail={d} />
            } catch { return null }
          })()}

          {currentResult.compile_warnings && (
            <div className="bg-yellow-50 border border-yellow-200 rounded p-3 mt-4 mb-4">
              <p className="text-sm font-medium text-yellow-800 mb-1">コンパイル警告</p>
              <pre className="text-xs text-yellow-700 whitespace-pre-wrap font-mono">{currentResult.compile_warnings}</pre>
            </div>
          )}

          {currentResult.status === 'CE' && (
            <div className="bg-red-50 rounded p-3 mb-4">
              <p className="text-sm font-medium text-red-700 mb-1">コンパイルエラー</p>
              <pre className="text-xs text-red-600 whitespace-pre-wrap font-mono">
                {currentResult.results?.[0]?.output}
              </pre>
            </div>
          )}

          {currentResult.status === 'constraint_error' && (
            <div className="bg-purple-50 border border-purple-200 rounded p-3 mb-4">
              <p className="text-sm font-medium text-purple-700 mb-1">コード制約エラー</p>
              <pre className="text-xs text-purple-600 whitespace-pre-wrap">
                {currentResult.results?.[0]?.output}
              </pre>
            </div>
          )}

          {currentResult.results && currentResult.results.length > 0 &&
            currentResult.status !== 'CE' && currentResult.status !== 'constraint_error' && (
            <div>
              <h3 className="font-medium mb-2 text-sm text-gray-700">テストケース別結果</h3>
              <div className="space-y-2">
                {currentResult.results.map((r, i) => {
                  const s = STATUS_LABELS[r.status] ?? { label: r.status, cls: 'text-gray-600' }
                  return (
                    <div key={r.id} className="border rounded p-3">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-sm font-medium">テストケース {i + 1}</span>
                        <span className={`text-sm font-bold ${s.cls}`}>{s.label}</span>
                      </div>
                      {r.status === 'time_limit_exceeded' && (
                        <p className="text-xs text-orange-500 mt-1">実行時間が5秒を超えたため強制停止しました（無限ループの可能性があります）</p>
                      )}
                      {r.status !== 'accepted' && r.status !== 'time_limit_exceeded' && r.output && (
                        <div className="mt-2">
                          <p className="text-xs text-gray-500 mb-1">出力：</p>
                          <pre className="text-xs font-mono bg-gray-50 rounded p-2 whitespace-pre-wrap">{r.output}</pre>
                        </div>
                      )}
                      <p className="text-xs text-gray-400 mt-1">実行時間: {r.time_ms}ms</p>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
