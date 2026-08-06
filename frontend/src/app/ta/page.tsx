'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/contexts/AuthContext'
import { apiGetClasses, type Class } from '@/lib/api'

export default function TaDashboard() {
  const { user } = useAuth()
  const [classes, setClasses] = useState<Class[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    apiGetClasses()
      .then(setClasses)
      .catch(e => setError(e instanceof Error ? e.message : 'エラー'))
  }, [])

  const fmt = (s: string) => new Date(s).toLocaleDateString('ja-JP')

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">クラス一覧</h1>
      <p className="text-gray-500 mb-8">ようこそ、{user?.username} さん</p>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded px-4 py-3 mb-4">{error}</div>}

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-4 py-3">クラス名</th>
              <th className="text-left px-4 py-3">説明</th>
              <th className="text-left px-4 py-3">人数</th>
              <th className="text-left px-4 py-3">作成日</th>
              <th className="text-left px-4 py-3">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {classes.map(c => (
              <tr key={c.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium">{c.name}</td>
                <td className="px-4 py-3 text-gray-500">{c.description || '—'}</td>
                <td className="px-4 py-3">{c.member_count}人</td>
                <td className="px-4 py-3 text-gray-500">{fmt(c.created_at)}</td>
                <td className="px-4 py-3">
                  <Link href={`/ta/classes/${c.id}`} className="text-indigo-600 hover:underline text-xs">
                    詳細を見る
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {classes.length === 0 && (
          <p className="text-center text-gray-400 py-10">クラスがありません</p>
        )}
      </div>
    </div>
  )
}
