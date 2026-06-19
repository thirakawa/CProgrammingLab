'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/contexts/AuthContext'
import { apiGetProblems, apiGetAssignments, apiGetUsers, apiGetClasses } from '@/lib/api'

export default function TeacherDashboard() {
  const { user } = useAuth()
  const [stats, setStats] = useState({ teachers: 0, students: 0, classes: 0, problems: 0, assignments: 0 })

  useEffect(() => {
    Promise.all([apiGetUsers(), apiGetProblems(), apiGetAssignments(), apiGetClasses()]).then(
      ([users, problems, assignments, classes]) => {
        setStats({
          teachers: users.filter(u => u.role === 'teacher').length,
          students: users.filter(u => u.role === 'student').length,
          classes: classes.length,
          problems: problems.length,
          assignments: assignments.length,
        })
      }
    )
  }, [])

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">教員ダッシュボード</h1>
      <p className="text-gray-500 mb-8">ようこそ、{user?.username} さん</p>

      <div className="grid grid-cols-5 gap-4 mb-8">
        <StatCard label="教員数" value={stats.teachers} href="/teacher/users" />
        <StatCard label="学生数" value={stats.students} href="/teacher/classes" />
        <StatCard label="クラス数" value={stats.classes} href="/teacher/classes" />
        <StatCard label="問題数" value={stats.problems} href="/teacher/problems" />
        <StatCard label="課題数" value={stats.assignments} href="/teacher/assignments" />
      </div>

      <div className="grid grid-cols-2 gap-6">
        <QuickLink href="/teacher/problems/new" title="新しい問題を作成" />
        <QuickLink href="/teacher/assignments/new" title="新しい課題を配布" />
        <QuickLink href="/teacher/users" title="ユーザーを管理" />
        <QuickLink href="/teacher/classes" title="クラスを管理" />
      </div>
    </div>
  )
}

function StatCard({ label, value, href }: { label: string; value: number; href: string }) {
  return (
    <Link href={href} className="bg-white rounded-lg shadow p-6 hover:shadow-md transition-shadow">
      <p className="text-3xl font-bold text-blue-600">{value}</p>
      <p className="text-gray-600 mt-1">{label}</p>
    </Link>
  )
}

function QuickLink({ href, title }: { href: string; title: string }) {
  return (
    <Link
      href={href}
      className="bg-white rounded-lg shadow p-4 hover:shadow-md hover:bg-blue-50 transition-all border border-gray-200"
    >
      <p className="font-medium text-blue-700">→ {title}</p>
    </Link>
  )
}
