'use client'

import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'

export default function LogoutButtonClient() {
  const { logout } = useAuth()
  const router = useRouter()

  const handleLogout = async () => {
    await logout()
    router.replace('/login')
  }

  return (
    <button
      onClick={handleLogout}
      className="w-full text-left px-3 py-2 rounded hover:bg-blue-700 text-sm text-blue-200"
    >
      ログアウト
    </button>
  )
}
