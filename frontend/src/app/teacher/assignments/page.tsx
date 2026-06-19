'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { apiGetAssignments, apiDeleteAssignment, apiGetClasses, type Assignment, type Class } from '@/lib/api'

function formatJST(iso: string) {
  return new Date(iso).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })
}

export default function AssignmentsPage() {
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [classes, setClasses] = useState<Class[]>([])
  const [filterClassId, setFilterClassId] = useState<number | ''>('')
  const [error, setError] = useState('')

  const load = () =>
    Promise.all([apiGetAssignments(), apiGetClasses()])
      .then(([a, c]) => { setAssignments(a); setClasses(c) })
      .catch((e) => setError(e.message))

  useEffect(() => { load() }, [])

  const classMap = Object.fromEntries(classes.map(c => [c.id, c.name]))

  const filtered = filterClassId
    ? assignments.filter(a => a.class_id === filterClassId)
    : assignments

  const handleDelete = async (id: number, title: string) => {
    if (!confirm(`「${title}」を削除しますか？`)) return
    try {
      await apiDeleteAssignment(id)
      load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'エラー')
    }
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">課題管理</h1>
        <Link href="/teacher/assignments/new" className="bg-blue-600 text-white rounded px-4 py-2 hover:bg-blue-700">
          + 新しい課題
        </Link>
      </div>
      {error && <p className="text-red-500 mb-4">{error}</p>}

      {/* クラスフィルター */}
      <div className="mb-4 flex items-center gap-3">
        <label className="text-sm text-gray-600">クラスで絞り込み:</label>
        <select
          value={filterClassId}
          onChange={e => setFilterClassId(e.target.value ? Number(e.target.value) : '')}
          className="border rounded px-3 py-1.5 text-sm"
        >
          <option value="">すべて</option>
          {classes.map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-4 py-3">ID</th>
              <th className="text-left px-4 py-3">タイトル</th>
              <th className="text-left px-4 py-3">対象クラス</th>
              <th className="text-left px-4 py-3">公開開始</th>
              <th className="text-left px-4 py-3">締切</th>
              <th className="text-left px-4 py-3">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filtered.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">課題がありません</td></tr>
            )}
            {filtered.map((a) => {
              const now = new Date()
              const open = new Date(a.open_at)
              const close = new Date(a.close_at)
              const statusKey = now < open ? 'upcoming' : now > close ? 'closed' : 'open'
              return (
                <tr key={a.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-500">{a.id}</td>
                  <td className="px-4 py-3 font-medium">
                    {a.title}
                    <span className={`ml-2 px-1.5 py-0.5 rounded text-xs ${
                      statusKey === 'open' ? 'bg-green-100 text-green-700' :
                      statusKey === 'upcoming' ? 'bg-yellow-100 text-yellow-700' :
                      'bg-gray-100 text-gray-500'
                    }`}>
                      {statusKey === 'open' ? '公開中' : statusKey === 'upcoming' ? '予定' : '終了'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded text-xs">
                      {a.class_id ? (classMap[a.class_id] ?? `Class #${a.class_id}`) : '未設定'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{formatJST(a.open_at)}</td>
                  <td className="px-4 py-3 text-gray-600">{formatJST(a.close_at)}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleDelete(a.id, a.title)}
                      className="text-red-500 hover:underline text-xs"
                    >
                      削除
                    </button>
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
