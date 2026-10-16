'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth, type User } from '@/contexts/AuthContext'

const HOME_PATH: Record<User['role'], string> = {
  teacher: '/teacher',
  ta: '/ta',
  student: '/student',
}

/**
 * ロール別セクション（/teacher, /ta, /student）の入口で使うガード。
 * URLを直接指定されても、ログインしていない・ロールが一致しない場合は
 * 正しいホーム（または /login）へリダイレクトし、該当ロール専用の画面を描画しない。
 * バックエンド側の権限チェック（各routerのDepends）が本来の防御線であり、
 * これはUXとして誤解を招く画面を出さないための補助。
 */
export default function RoleGuard({
  allow,
  children,
}: {
  allow: User['role'][]
  children: React.ReactNode
}) {
  const { user, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (loading) return
    if (!user) {
      router.replace('/login')
    } else if (!allow.includes(user.role)) {
      router.replace(HOME_PATH[user.role])
    }
  }, [user, loading, allow, router])

  if (loading || !user || !allow.includes(user.role)) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-gray-500">読み込み中...</p>
      </div>
    )
  }

  return <>{children}</>
}
