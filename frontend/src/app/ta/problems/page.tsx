'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { apiGetProblems, type Problem } from '@/lib/api'

export default function TaProblemsPage() {
  const [problems, setProblems] = useState<Problem[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    apiGetProblems()
      .then(setProblems)
      .catch(e => setError(e instanceof Error ? e.message : 'エラー'))
  }, [])

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">問題一覧（閲覧のみ）</h1>
      {error && <p className="text-red-500 mb-4 text-sm">{error}</p>}

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-4 py-3">ID</th>
              <th className="text-left px-4 py-3">タイトル</th>
              <th className="text-left px-4 py-3">テストケース数</th>
              <th className="text-left px-4 py-3">サンプルケース数</th>
              <th className="text-left px-4 py-3">作成日</th>
              <th className="text-left px-4 py-3">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {problems.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">問題がありません</td></tr>
            )}
            {problems.map((p) => (
              <tr key={p.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-gray-500">{p.id}</td>
                <td className="px-4 py-3 font-medium">{p.title}</td>
                <td className="px-4 py-3">{p.test_cases?.length ?? 0} 件</td>
                <td className="px-4 py-3">{p.sample_cases?.length ?? 0} 件</td>
                <td className="px-4 py-3 text-gray-500">{new Date(p.created_at).toLocaleDateString('ja-JP')}</td>
                <td className="px-4 py-3">
                  <Link href={`/ta/problems/${p.id}`} className="text-indigo-600 hover:underline text-xs">
                    詳細を見る
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
