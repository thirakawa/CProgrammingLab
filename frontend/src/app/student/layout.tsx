import Link from 'next/link'
import StudentLogoutButton from './StudentLogoutButton'

export default function StudentLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <nav className="w-52 bg-green-800 text-white flex flex-col shrink-0">
        <div className="p-4 font-bold text-lg border-b border-green-700">CProgramLab</div>
        <div className="p-3 text-xs text-green-300 uppercase tracking-wide">学生メニュー</div>
        <ul className="flex-1 space-y-1 px-2">
          <li>
            <Link href="/student" className="block px-3 py-2 rounded hover:bg-green-700 text-sm">
              課題一覧
            </Link>
          </li>
          <li>
            <Link href="/student/history" className="block px-3 py-2 rounded hover:bg-green-700 text-sm">
              提出履歴
            </Link>
          </li>
          <li>
            <Link href="/student/rubric" className="block px-3 py-2 rounded hover:bg-green-700 text-sm">
              採点基準
            </Link>
          </li>
          <li>
            <Link href="/student/account" className="block px-3 py-2 rounded hover:bg-green-700 text-sm">
              パスワード変更
            </Link>
          </li>
        </ul>
        <div className="p-4 border-t border-green-700">
          <StudentLogoutButton />
        </div>
      </nav>
      <main className="flex-1 p-8 overflow-auto">{children}</main>
    </div>
  )
}
