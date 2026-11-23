'use client'

import type { CodeAnalysisResult, ConstraintFields } from '@/lib/api'
import { CONSTRAINT_ITEMS, checkCount, formatRange } from '@/lib/constraints'

const KIND_LABELS: Record<string, string> = { var: '変数', array: '配列', pointer: 'ポインタ' }
const SCOPE_LABELS: Record<string, string> = { global: 'グローバル', local: '関数内', for: 'for文内' }

const STATUS_VIEW = {
  ok: { text: 'OK', cls: 'text-green-600' },
  over: { text: '上限超過', cls: 'text-red-600 font-medium' },
  under: { text: '下限不足', cls: 'text-red-600 font-medium' },
} as const

/** コード解析で検出した宣言・ループ・if の一覧（採点結果・サンプル実行結果で共用） */
export default function DetectedDeclarations({
  analysis,
  constraints,
}: {
  analysis: CodeAnalysisResult | null | undefined
  constraints?: ConstraintFields | null
}) {
  if (!analysis) return null
  const { counts, declarations } = analysis
  const lineList = (lines: number[]) => (lines.length ? `（${lines.join(', ')}行目）` : '')

  return (
    <details className="bg-gray-50 border border-gray-200 rounded p-4 mt-4 text-sm" open>
      <summary className="font-medium text-gray-700 cursor-pointer">検出されたコードの構成</summary>
      <table className="w-full text-xs mt-3">
        <thead>
          <tr className="text-gray-500 border-b border-gray-200">
            <th className="text-left font-normal py-1">項目</th>
            <th className="text-right font-normal py-1 w-16">検出数</th>
            {constraints && <th className="text-left font-normal py-1 pl-4">制約</th>}
            {constraints && <th className="text-left font-normal py-1 w-20">判定</th>}
          </tr>
        </thead>
        <tbody>
          {CONSTRAINT_ITEMS.map(it => {
            const count = counts[it.countKey]
            const min = constraints?.[`min_${it.key}`]
            const max = constraints?.[`max_${it.key}`]
            const range = constraints ? formatRange(min, max) : null
            const st = constraints && range ? checkCount(count, min, max) : null
            return (
              <tr key={it.key} className="border-b border-gray-100">
                <td className="py-1 text-gray-700">{it.label}</td>
                <td className="py-1 text-right font-mono">{count}個</td>
                {constraints && <td className="py-1 pl-4 text-gray-500">{range ?? '制約なし'}</td>}
                {constraints && (
                  <td className={`py-1 ${st ? STATUS_VIEW[st].cls : 'text-gray-400'}`}>
                    {st ? STATUS_VIEW[st].text : '-'}
                  </td>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>

      <p className="text-xs text-gray-500 mt-3 mb-1">宣言の一覧</p>
      {declarations.length === 0 ? (
        <p className="text-xs text-gray-400">変数・配列・ポインタの宣言は検出されませんでした</p>
      ) : (
        <table className="w-full text-xs">
          <thead>
            <tr className="text-gray-500 border-b border-gray-200">
              <th className="text-left font-normal py-1 w-14">行</th>
              <th className="text-left font-normal py-1">型</th>
              <th className="text-left font-normal py-1">名前</th>
              <th className="text-left font-normal py-1">分類</th>
              <th className="text-left font-normal py-1">場所</th>
            </tr>
          </thead>
          <tbody>
            {declarations.map((d, i) => (
              <tr key={i} className="border-b border-gray-100">
                <td className="py-1 font-mono text-gray-500">{d.line}</td>
                <td className="py-1 font-mono">{d.type}</td>
                <td className="py-1 font-mono">{d.name}</td>
                <td className="py-1" title={d.note || undefined}>
                  {d.kinds.length > 0
                    ? d.kinds.map(k => KIND_LABELS[k]).join('・')
                    : <span className="text-gray-400">対象外</span>}
                </td>
                <td className="py-1 text-gray-500">{SCOPE_LABELS[d.scope] ?? d.scope}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="text-xs text-gray-500 mt-2">
        ループ（for/while）：{counts.loops}個{lineList(analysis.loop_lines)}　
        if：{counts.ifs}個{lineList(analysis.if_lines)}
      </p>
      <p className="text-xs text-gray-400 mt-1">
        ※ 関数の仮引数・構造体のメンバ・関数プロトタイプは数えません。<code>int *a[3]</code> は配列とポインタの両方に数えます。
      </p>
    </details>
  )
}
