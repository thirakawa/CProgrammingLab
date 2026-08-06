import Link from 'next/link'
import TaLogoutButton from './TaLogoutButton'

export default function TaLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <nav className="w-56 bg-indigo-800 text-white flex flex-col shrink-0">
        <div className="p-4 font-bold text-lg border-b border-indigo-700">CProgramLab</div>
        <div className="p-3 text-xs text-indigo-300 uppercase tracking-wide">TAメニュー</div>
        <ul className="flex-1 space-y-1 px-2">
          <li>
            <Link href="/ta" className="block px-3 py-2 rounded hover:bg-indigo-700 text-sm">
              クラス一覧
            </Link>
          </li>
          <li>
            <Link href="/ta/account" className="block px-3 py-2 rounded hover:bg-indigo-700 text-sm">
              パスワード変更
            </Link>
          </li>
        </ul>
        <div className="p-4 border-t border-indigo-700">
          <TaLogoutButton />
        </div>
      </nav>
      <main className="flex-1 p-8 overflow-auto">{children}</main>
    </div>
  )
}
