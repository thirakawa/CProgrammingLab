'use client'

import { useEffect, useState } from 'react'
import { apiGetSubmissions, type Submission } from '@/lib/api'

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  done: { label: '採点済', cls: 'bg-green-100 text-green-700' },
  CE: { label: 'CE', cls: 'bg-red-100 text-red-700' },
  judging: { label: '採点中', cls: 'bg-yellow-100 text-yellow-700' },
  pending: { label: '待機中', cls: 'bg-gray-100 text-gray-600' },
}

export default function HistoryPage() {
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    apiGetSubmissions().then(setSubmissions).catch((e) => setError(e.message))
  }, [])

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">提出履歴</h1>
      {error && <p className="text-red-500 mb-4">{error}</p>}

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-4 py-3">提出ID</th>
              <th className="text-left px-4 py-3">問題ID</th>
              <th className="text-left px-4 py-3">スコア</th>
              <th className="text-left px-4 py-3">ステータス</th>
              <th className="text-left px-4 py-3">提出日時</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {submissions.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">提出履歴がありません</td></tr>
            )}
            {submissions.map((s) => {
              const st = STATUS_LABELS[s.status] ?? { label: s.status, cls: 'bg-gray-100 text-gray-600' }
              return (
                <tr key={s.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-500">{s.id}</td>
                  <td className="px-4 py-3">{s.problem_id}</td>
                  <td className="px-4 py-3">
                    <span className={`font-bold ${s.score === 100 ? 'text-green-600' : s.score > 0 ? 'text-yellow-600' : 'text-red-500'}`}>
                      {s.score}点
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded text-xs ${st.cls}`}>{st.label}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {new Date(s.submitted_at).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
