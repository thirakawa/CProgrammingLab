'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/contexts/AuthContext'
import { apiGetAssignments, type Assignment } from '@/lib/api'

function formatJST(iso: string) {
  return new Date(iso).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })
}

type ButtonConfig = {
  label: string
  cls: string
}

function getButtonConfig(myStatus: string | null | undefined): ButtonConfig {
  switch (myStatus) {
    case 'not_started':
      return { label: '開始する', cls: 'bg-green-600 text-white hover:bg-green-700' }
    case 'in_progress':
      return { label: '再開する', cls: 'bg-blue-600 text-white hover:bg-blue-700' }
    case 'submitted':
      return { label: '結果を見る', cls: 'bg-gray-500 text-white hover:bg-gray-600' }
    default:
      return { label: '回答する', cls: 'bg-green-600 text-white hover:bg-green-700' }
  }
}

function StatusBadge({ status }: { status: string | null | undefined }) {
  switch (status) {
    case 'in_progress':
      return <span className="text-xs bg-blue-50 text-blue-600 border border-blue-200 rounded-full px-2 py-0.5">途中</span>
    case 'submitted':
      return <span className="text-xs bg-green-50 text-green-700 border border-green-200 rounded-full px-2 py-0.5">提出済</span>
    default:
      return null
  }
}

export default function StudentDashboard() {
  const { user } = useAuth()
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    apiGetAssignments().then(setAssignments).catch((e) => setError(e.message))
  }, [])

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">課題一覧</h1>
      <p className="text-gray-500 mb-8">ようこそ、{user?.username} さん</p>
      {error && <p className="text-red-500 mb-4">{error}</p>}

      <div className="space-y-4">
        {assignments.length === 0 && (
          <p className="text-gray-400">公開中の課題はありません</p>
        )}
        {assignments.map((a) => {
          const btn = getButtonConfig(a.my_status)
          return (
            <div key={a.id} className="bg-white rounded-lg shadow p-5 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="font-semibold text-lg">{a.title}</h2>
                  <StatusBadge status={a.my_status} />
                </div>
                <p className="text-sm text-gray-500 mt-1">
                  締切：{formatJST(a.close_at)}
                </p>
                {a.start_deadline && a.my_status === 'not_started' && (
                  <p className="text-xs text-orange-500 mt-0.5">
                    解答開始期限：{formatJST(a.start_deadline)}
                  </p>
                )}
              </div>
              <Link
                href={`/student/assignments/${a.id}`}
                className={`rounded px-4 py-2 text-sm font-medium ${btn.cls}`}
              >
                {btn.label}
              </Link>
            </div>
          )
        })}
      </div>
    </div>
  )
}
