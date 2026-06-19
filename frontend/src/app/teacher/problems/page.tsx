'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { apiGetProblems, apiDeleteProblem, apiImportProblem, type Problem } from '@/lib/api'

const FORMAT = 'cprogramlab-problem'
const VERSION = '1'

function buildExportPayload(p: Problem) {
  return {
    format: FORMAT,
    version: VERSION,
    title: p.title,
    description: p.description,
    constraints: {
      max_vars: p.max_vars ?? null,
      max_arrays: p.max_arrays ?? null,
      max_pointers: p.max_pointers ?? null,
      max_loops: p.max_loops ?? null,
      max_ifs: p.max_ifs ?? null,
    },
    sample_cases: (p.sample_cases ?? [])
      .sort((a, b) => a.order_index - b.order_index)
      .map(c => ({ input: c.input, expected_output: c.expected_output })),
    test_cases: (p.test_cases ?? [])
      .sort((a, b) => a.order_index - b.order_index)
      .map(c => ({ input: c.input, expected_output: c.expected_output })),
  }
}

function downloadJson(obj: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function safeFilename(title: string) {
  return title.replace(/[\\/:*?"<>|]/g, '_')
}

export default function ProblemsPage() {
  const [problems, setProblems] = useState<Problem[]>([])
  const [error, setError] = useState('')
  const [msg, setMsg] = useState('')
  const [importing, setImporting] = useState(false)
  const [exportingAll, setExportingAll] = useState(false)
  const importRef = useRef<HTMLInputElement>(null)

  const load = () => apiGetProblems().then(setProblems).catch((e) => setError(e.message))
  useEffect(() => { load() }, [])

  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(''), 4000) }

  const handleDelete = async (id: number, title: string) => {
    if (!confirm(`「${title}」を削除しますか？`)) return
    try {
      await apiDeleteProblem(id)
      load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'エラー')
    }
  }

  const handleExportOne = (p: Problem) => {
    downloadJson(buildExportPayload(p), `problem_${p.id}_${safeFilename(p.title)}.json`)
  }

  // 全問を問題ごとに個別ファイルとしてダウンロード（200ms 間隔）
  const handleExportAll = async () => {
    if (problems.length === 0) return
    setExportingAll(true)
    for (let i = 0; i < problems.length; i++) {
      if (i > 0) await new Promise(r => setTimeout(r, 200))
      downloadJson(
        buildExportPayload(problems[i]),
        `problem_${problems[i].id}_${safeFilename(problems[i].title)}.json`,
      )
    }
    setExportingAll(false)
    flash(`${problems.length} 件のファイルをエクスポートしました`)
  }

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setImporting(true)
    setError('')
    try {
      const json = JSON.parse(await file.text())
      if (!json.title) throw new Error('ファイル形式が不正です（"title" が見つかりません）')
      const result = await apiImportProblem(json)
      await load()
      flash(`「${result.title}」をインポートしました`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'インポートに失敗しました')
    } finally {
      setImporting(false)
    }
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">問題管理</h1>
        <div className="flex gap-2">
          <button
            onClick={handleExportAll}
            disabled={problems.length === 0 || exportingAll}
            className="border border-gray-300 text-gray-700 rounded px-4 py-2 text-sm hover:bg-gray-50 disabled:opacity-40"
          >
            {exportingAll ? 'エクスポート中...' : '全問エクスポート'}
          </button>
          <button
            onClick={() => importRef.current?.click()}
            disabled={importing}
            className="border border-gray-300 text-gray-700 rounded px-4 py-2 text-sm hover:bg-gray-50 disabled:opacity-40"
          >
            {importing ? 'インポート中...' : 'インポート'}
          </button>
          <input
            ref={importRef}
            type="file"
            accept=".json,application/json"
            onChange={handleImportFile}
            className="hidden"
          />
          <Link href="/teacher/problems/new" className="bg-blue-600 text-white rounded px-4 py-2 text-sm hover:bg-blue-700">
            + 新しい問題
          </Link>
        </div>
      </div>

      {error && <p className="text-red-500 mb-4 text-sm">{error}</p>}
      {msg && <p className="text-green-600 mb-4 text-sm">{msg}</p>}

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-4 py-3">ID</th>
              <th className="text-left px-4 py-3">タイトル</th>
              <th className="text-left px-4 py-3">テストケース数</th>
              <th className="text-left px-4 py-3">作成日</th>
              <th className="text-left px-4 py-3">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {problems.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">問題がありません</td></tr>
            )}
            {problems.map((p) => (
              <tr key={p.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-gray-500">{p.id}</td>
                <td className="px-4 py-3 font-medium">{p.title}</td>
                <td className="px-4 py-3">{p.test_cases?.length ?? 0} 件</td>
                <td className="px-4 py-3 text-gray-500">{new Date(p.created_at).toLocaleDateString('ja-JP')}</td>
                <td className="px-4 py-3 space-x-3">
                  <Link href={`/teacher/problems/${p.id}`} className="text-blue-600 hover:underline text-xs">編集</Link>
                  <button onClick={() => handleExportOne(p)} className="text-gray-500 hover:underline text-xs">
                    エクスポート
                  </button>
                  <button
                    onClick={() => handleDelete(p.id, p.title)}
                    className="text-red-500 hover:underline text-xs"
                  >
                    削除
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-xs text-gray-400">
        ファイル形式: JSON（cprogramlab-problem v{VERSION}、1問1ファイル）
      </p>
    </div>
  )
}
