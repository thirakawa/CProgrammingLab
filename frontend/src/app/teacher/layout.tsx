import Link from 'next/link'
import LogoutButtonClient from './LogoutButtonClient'

export default function TeacherLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <nav className="w-56 bg-blue-800 text-white flex flex-col shrink-0">
        <div className="p-4 font-bold text-lg border-b border-blue-700">CProgramLab</div>
        <div className="p-3 text-xs text-blue-300 uppercase tracking-wide">教員メニュー</div>
        <ul className="flex-1 space-y-1 px-2">
          <li>
            <Link href="/teacher" className="block px-3 py-2 rounded hover:bg-blue-700 text-sm">
              ダッシュボード
            </Link>
          </li>
          <li>
            <Link href="/teacher/users" className="block px-3 py-2 rounded hover:bg-blue-700 text-sm">
              ユーザー管理
            </Link>
          </li>
          <li>
            <Link href="/teacher/classes" className="block px-3 py-2 rounded hover:bg-blue-700 text-sm">
              クラス管理
            </Link>
          </li>
          <li>
            <Link href="/teacher/problems" className="block px-3 py-2 rounded hover:bg-blue-700 text-sm">
              問題管理
            </Link>
          </li>

        </ul>
        <div className="p-4 border-t border-blue-700">
          <LogoutButtonClient />
        </div>
      </nav>
      <main className="flex-1 p-8 overflow-auto">{children}</main>
    </div>
  )
}
