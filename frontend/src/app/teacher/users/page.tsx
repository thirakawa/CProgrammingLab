'use client'

import { useEffect, useState } from 'react'
import { apiGetUsers, apiCreateUser, apiUpdateUser, apiDeleteUser, type User } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'

export default function UsersPage() {
  const { user: me } = useAuth()
  const [users, setUsers] = useState<User[]>([])
  const [error, setError] = useState('')
  const [msg, setMsg] = useState('')
  const [newUser, setNewUser] = useState({ username: '', password: '', role: 'teacher' })
  const [pwChange, setPwChange] = useState<{ id: number; username: string; password: string } | null>(null)
  const [pwError, setPwError] = useState('')
  const [pwLoading, setPwLoading] = useState(false)

  const load = async () => {
    try {
      const all = await apiGetUsers()
      setUsers(all.filter(u => u.role === 'teacher' || u.role === 'ta'))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'エラー')
    }
  }

  useEffect(() => { load() }, [])

  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(''), 3000) }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    try {
      await apiCreateUser(newUser)
      setNewUser({ username: '', password: '', role: 'teacher' })
      flash(newUser.role === 'ta' ? 'TAアカウントを作成しました' : '教員アカウントを作成しました')
      load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'エラー')
    }
  }

  const handleDelete = async (id: number, username: string) => {
    if (!confirm(`「${username}」を削除しますか？`)) return
    setError('')
    try {
      await apiDeleteUser(id)
      flash(`${username} を削除しました`)
      load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'エラー')
    }
  }

  const handlePwChange = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!pwChange) return
    setPwError('')
    setPwLoading(true)
    try {
      await apiUpdateUser(pwChange.id, { password: pwChange.password })
      setPwChange(null)
      flash('パスワードを変更しました')
    } catch (e) {
      setPwError(e instanceof Error ? e.message : 'エラー')
    } finally {
      setPwLoading(false)
    }
  }

  // プライマリ管理者は全ユーザーを削除可能。それ以外は自分自身・プライマリ管理者・他の教員は削除不可（TAアカウントのみ削除可能）
  const canDelete = (u: User) => !u.is_superadmin && u.id !== me?.id && (me?.is_superadmin || u.role !== 'teacher')
  // プライマリ管理者は全ユーザーのパスワードを変更可能。それ以外は本人 or TAアカウントのみ変更可能
  const canChangePassword = (u: User) => me?.is_superadmin || u.id === me?.id || u.role === 'ta'

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">教員・TAアカウント管理</h1>
      <p className="text-sm text-gray-500 mb-6">
        学生アカウントはクラス管理から作成・削除してください。TAアカウントの作成・削除は教員のみ行えます。
      </p>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded px-4 py-3 mb-4">{error}</div>}
      {msg && <div className="bg-green-50 border border-green-200 text-green-700 rounded px-4 py-3 mb-4">{msg}</div>}

      {/* 新規アカウント作成 */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-base font-semibold mb-4">新規アカウント作成</h2>
        <form onSubmit={handleCreate} className="flex gap-3 items-end flex-wrap">
          <div>
            <label className="block text-sm font-medium mb-1">ユーザーID</label>
            <input
              type="text"
              value={newUser.username}
              onChange={e => setNewUser({ ...newUser, username: e.target.value })}
              className="border rounded px-3 py-2 w-40"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">パスワード</label>
            <input
              type="password"
              value={newUser.password}
              onChange={e => setNewUser({ ...newUser, password: e.target.value })}
              className="border rounded px-3 py-2 w-40"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">種別</label>
            <select
              value={newUser.role}
              onChange={e => setNewUser({ ...newUser, role: e.target.value })}
              className="border rounded px-3 py-2 w-32"
            >
              <option value="teacher">教員</option>
              <option value="ta">TA</option>
            </select>
          </div>
          <button type="submit" className="bg-blue-600 text-white rounded px-4 py-2 hover:bg-blue-700">
            作成
          </button>
        </form>
      </div>

      {/* アカウント一覧 */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-4 py-3 w-12">ID</th>
              <th className="text-left px-4 py-3">ユーザー名</th>
              <th className="text-left px-4 py-3">種別</th>
              <th className="text-left px-4 py-3">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {users.map(u => (
              <tr key={u.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-gray-400">{u.id}</td>
                <td className="px-4 py-3 font-medium">
                  {u.username}
                  {u.id === me?.id && <span className="ml-2 text-xs text-gray-400">（あなた）</span>}
                </td>
                <td className="px-4 py-3">
                  {u.is_superadmin ? (
                    <span className="px-2 py-0.5 rounded text-xs bg-yellow-100 text-yellow-700">プライマリ管理者</span>
                  ) : u.role === 'ta' ? (
                    <span className="px-2 py-0.5 rounded text-xs bg-indigo-100 text-indigo-700">TA</span>
                  ) : (
                    <span className="px-2 py-0.5 rounded text-xs bg-blue-100 text-blue-700">教員</span>
                  )}
                </td>
                <td className="px-4 py-3 space-x-3">
                  {canChangePassword(u) && (
                    <button
                      onClick={() => { setPwChange({ id: u.id, username: u.username, password: '' }); setPwError('') }}
                      className="text-blue-600 hover:underline text-xs"
                    >
                      PW変更
                    </button>
                  )}
                  {canDelete(u) && (
                    <button
                      onClick={() => handleDelete(u.id, u.username)}
                      className="text-red-500 hover:underline text-xs"
                    >
                      削除
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {users.length === 0 && (
          <p className="text-center text-gray-400 py-8">教員・TAアカウントがありません</p>
        )}
      </div>

      {/* パスワード変更モーダル */}
      {pwChange && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-80">
            <h3 className="font-semibold mb-1">パスワード変更</h3>
            <p className="text-sm text-gray-500 mb-4">{pwChange.username}</p>
            {pwError && <p className="text-red-500 text-sm mb-3">{pwError}</p>}
            <form onSubmit={handlePwChange} className="space-y-4">
              <input
                type="password"
                placeholder="新しいパスワード"
                value={pwChange.password}
                onChange={e => setPwChange({ ...pwChange, password: e.target.value })}
                className="w-full border rounded px-3 py-2"
                autoFocus
                required
              />
              <div className="flex gap-2 justify-end">
                <button type="button" onClick={() => setPwChange(null)} className="px-4 py-2 border rounded hover:bg-gray-50">
                  キャンセル
                </button>
                <button type="submit" disabled={pwLoading} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">
                  {pwLoading ? '変更中...' : '変更する'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
