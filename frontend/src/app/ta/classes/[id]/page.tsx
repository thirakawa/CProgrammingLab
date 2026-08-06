'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  apiGetClass, apiResetPassword,
  apiGetAssignments, apiGetResultSummary, apiDownloadResultsCsv, apiDownloadLatestResultsCsv,
  apiGetSubmissionCode, apiDownloadCodeZip,
  type ClassDetail, type Assignment,
  type ResultSummaryItem, type SubmissionCode,
} from '@/lib/api'

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    accepted: { label: '正解', cls: 'bg-green-100 text-green-700' },
    wrong_answer: { label: '不正解', cls: 'bg-red-100 text-red-700' },
    time_limit_exceeded: { label: 'TLE', cls: 'bg-orange-100 text-orange-700' },
    runtime_error: { label: 'RE', cls: 'bg-red-100 text-red-700' },
    CE: { label: 'CE', cls: 'bg-red-100 text-red-700' },
    judging: { label: '採点中', cls: 'bg-yellow-100 text-yellow-700' },
    pending: { label: '待機中', cls: 'bg-gray-100 text-gray-600' },
  }
  const s = map[status] ?? { label: status, cls: 'bg-gray-100 text-gray-600' }
  return <span className={`px-2 py-0.5 rounded text-xs ${s.cls}`}>{s.label}</span>
}

export default function TaClassDetailPage() {
  const { id } = useParams<{ id: string }>()
  const classId = Number(id)
  const router = useRouter()

  const [cls, setCls] = useState<ClassDetail | null>(null)
  const [error, setError] = useState('')
  const [msg, setMsg] = useState('')

  const [mainTab, setMainTab] = useState<'students' | 'results'>('students')

  // パスワードリセットモーダル
  const [pwModal, setPwModal] = useState<{ user_id: number; username: string } | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const [pwLoading, setPwLoading] = useState(false)
  const [pwError, setPwError] = useState('')

  // 採点結果タブ
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [assLoaded, setAssLoaded] = useState(false)
  const [selectedAssId, setSelectedAssId] = useState<number | ''>('')
  const [summary, setSummary] = useState<ResultSummaryItem[]>([])
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [csvDownloading, setCsvDownloading] = useState(false)
  const [latestCsvDownloading, setLatestCsvDownloading] = useState(false)
  const [zipping, setZipping] = useState(false)
  const [codeModal, setCodeModal] = useState<SubmissionCode | null>(null)
  const [codeLoadingId, setCodeLoadingId] = useState<number | null>(null)

  const loadClass = async () => {
    try {
      setCls(await apiGetClass(classId))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'エラー')
    }
  }

  const loadAssignments = async () => {
    try {
      const all = await apiGetAssignments()
      setAssignments(all.filter(a => a.class_id === classId))
      setAssLoaded(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'エラー')
    }
  }

  useEffect(() => { loadClass() }, [classId])

  useEffect(() => {
    if (mainTab === 'results' && !assLoaded) {
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

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!pwModal) return
    setPwError('')
    setPwLoading(true)
    try {
      await apiResetPassword(pwModal.user_id, newPassword)
      setPwModal(null)
      setNewPassword('')
      flash(`${pwModal.username} のパスワードを変更しました`)
    } catch (e) {
      setPwError(e instanceof Error ? e.message : 'パスワード変更に失敗しました')
    } finally {
      setPwLoading(false)
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

  const handleDownloadLatestCsv = async () => {
    if (!selectedAssId) return
    setLatestCsvDownloading(true)
    try {
      await apiDownloadLatestResultsCsv(Number(selectedAssId))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'エラー')
    } finally {
      setLatestCsvDownloading(false)
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
        <h2 className="font-semibold text-base mb-1">パスワードリセット</h2>
        <p className="text-sm text-gray-500 mb-4">{pwModal.username}</p>
        {pwError && <p className="text-red-500 text-sm mb-3">{pwError}</p>}
        <form onSubmit={handleResetPassword} className="space-y-4">
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
            <button type="submit" disabled={pwLoading} className="bg-indigo-600 text-white rounded px-4 py-2 text-sm hover:bg-indigo-700 disabled:opacity-50">
              {pwLoading ? '変更中...' : '変更する'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )

  const tabCls = (t: string) =>
    `px-5 py-3 text-sm font-medium border-b-2 -mb-px transition-colors ${mainTab === t ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`

  return (
    <div className="max-w-4xl">
      {PwModal}
      <button onClick={() => router.push('/ta')} className="text-indigo-600 hover:underline text-sm mb-4 inline-block">
        ← クラス一覧へ
      </button>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded px-4 py-3 mb-4">{error}</div>}
      {msg && <div className="bg-green-50 border border-green-200 text-green-700 rounded px-4 py-3 mb-4">{msg}</div>}

      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h1 className="text-2xl font-bold">{cls.name}</h1>
        <p className="text-gray-500 mt-1">{cls.description || '説明なし'}</p>
        <p className="text-sm text-gray-400 mt-2">学生数: {cls.member_count}人</p>
      </div>

      <div className="border-b mb-6 flex">
        <button onClick={() => setMainTab('students')} className={tabCls('students')}>学生一覧</button>
        <button onClick={() => setMainTab('results')} className={tabCls('results')}>採点結果</button>
      </div>

      {/* 学生一覧タブ（閲覧・パスワードリセットのみ） */}
      {mainTab === 'students' && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-base font-semibold mb-4">学生一覧 ({cls.members.length}人)</h2>
          {cls.members.length === 0 ? (
            <p className="text-gray-400 text-sm">学生がいません。</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-3 py-2 w-12">ID</th>
                  <th className="text-left px-3 py-2">ユーザー名</th>
                  <th className="text-left px-3 py-2">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {cls.members.map(m => (
                  <tr key={m.user_id} className="hover:bg-gray-50">
                    <td className="px-3 py-2 text-gray-400">{m.user_id}</td>
                    <td className="px-3 py-2 font-medium">{m.username}</td>
                    <td className="px-3 py-2">
                      <button
                        onClick={() => { setPwModal({ user_id: m.user_id, username: m.username }); setNewPassword(''); setPwError('') }}
                        className="text-indigo-500 hover:underline text-xs"
                      >
                        パスワードリセット
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
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
                  {csvDownloading ? 'ダウンロード中...' : '採点結果 CSV（全履歴）'}
                </button>
                <button
                  onClick={handleDownloadLatestCsv}
                  disabled={latestCsvDownloading}
                  className="bg-emerald-600 text-white rounded px-4 py-2 hover:bg-emerald-700 disabled:opacity-50 text-sm"
                >
                  {latestCsvDownloading ? 'ダウンロード中...' : '最新結果 CSV（全学生）'}
                </button>
                <button
                  onClick={handleDownloadZip}
                  disabled={zipping || summary.length === 0}
                  className="bg-indigo-600 text-white rounded px-4 py-2 hover:bg-indigo-700 disabled:opacity-50 text-sm"
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
                              className="text-indigo-600 hover:text-indigo-800 text-xs underline disabled:opacity-40"
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
