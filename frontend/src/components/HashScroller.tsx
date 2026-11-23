'use client'

import { useEffect } from 'react'

/**
 * URL の #アンカー の位置へスクロールする。
 * 学生ページは RoleGuard によりログイン確認後に描画されるため、
 * ブラウザ標準のアンカースクロールの時点では要素がまだ存在しない。
 * このコンポーネントをページ内に置くと、描画（マウント）後にスクロールし直す。
 */
export default function HashScroller() {
  useEffect(() => {
    const id = decodeURIComponent(window.location.hash.slice(1))
    if (id) document.getElementById(id)?.scrollIntoView()
  }, [])
  return null
}
