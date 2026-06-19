'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { apiGetClasses, apiCreateClass, apiDeleteClass, type Class } from '@/lib/api'

export default function ClassesPage() {
  const [classes, setClasses] = useState<Class[]>([])
  const [error, setError] = useState('')
  const [msg, setMsg] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', description: '' })
  const [loading, setLoading] = useState(false)

  const load = async () => {
    try {
      setClasses(await apiGetClasses())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'エラー')
    }
  }

  useEffect(() => { load() }, [])

  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(''), 3000) }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await apiCreateClass(form)
      setForm({ name: '', description: '' })
      setShowForm(false)
      flash('クラスを作成しました')
      load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'エラー')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (id: number, name: string) => {
    if (!confirm(`「${name}」を削除しますか？メンバー情報も削除されます。`)) return
    setError('')
    try {
      await apiDeleteClass(id)
      flash(`${name} を削除しました`)
      load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'エラー')
    }
  }

  const fmt = (s: string) => new Date(s).toLocaleDateString('ja-JP')

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">クラス管理</h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className="bg-blue-600 text-white rounded px-4 py-2 text-sm hover:bg-blue-700"
        >
          + 新規クラス作成
        </button>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded px-4 py-3 mb-4">{error}</div>}
      {msg && <div className="bg-green-50 border border-green-200 text-green-700 rounded px-4 py-3 mb-4">{msg}</div>}

      {showForm && (
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-base font-semibold mb-4">新規クラス作成</h2>
          <form onSubmit={handleCreate} className="space-y-3 max-w-md">
            <div>
              <label className="block text-sm font-medium mb-1">クラス名 <span className="text-red-500">*</span></label>
              <input
                type="text"
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                className="border rounded px-3 py-2 w-full"
                placeholder="例: Class A"
                required
                autoFocus
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">説明</label>
              <input
                type="text"
                value={form.description}
                onChange={e => setForm({ ...form, description: e.target.value })}
                className="border rounded px-3 py-2 w-full"
                placeholder="任意"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={loading}
                className="bg-blue-600 text-white rounded px-4 py-2 text-sm hover:bg-blue-700 disabled:opacity-50"
              >
                作成
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="border rounded px-4 py-2 text-sm hover:bg-gray-50"
              >
                キャンセル
              </button>
            </div>
          </form>
        </div>
      )}

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
                <td className="px-4 py-3 space-x-3">
                  <Link href={`/teacher/classes/${c.id}`} className="text-blue-600 hover:underline text-xs">
                    詳細・メンバー管理
                  </Link>
                  <button
                    onClick={() => handleDelete(c.id, c.name)}
                    className="text-red-500 hover:underline text-xs"
                  >
                    削除
                  </button>
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
