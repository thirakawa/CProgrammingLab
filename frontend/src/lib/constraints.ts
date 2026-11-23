import type { CodeAnalysisResult, ConstraintFields } from './api'

export const CONSTRAINT_ITEMS = [
  { key: 'vars', label: '変数', countKey: 'vars' },
  { key: 'arrays', label: '配列', countKey: 'arrays' },
  { key: 'pointers', label: 'ポインタ', countKey: 'pointers' },
  { key: 'loops', label: 'ループ（for/while）', countKey: 'loops' },
  { key: 'ifs', label: '条件分岐（if）', countKey: 'ifs' },
] as const

export type ConstraintKey = (typeof CONSTRAINT_ITEMS)[number]['key']

/** 下限の 0 は「下限なし」と同じ扱い */
export function effectiveMin(v: number | null | undefined): number | null {
  return v ? v : null
}

/** 範囲の表示文字列。制約なしなら null（例: "2個以上5個以下" / "3個以下" / "ちょうど3個"） */
export function formatRange(min: number | null | undefined, max: number | null | undefined): string | null {
  const lo = effectiveMin(min)
  const hi = max ?? null
  if (lo != null && hi != null) return lo === hi ? `ちょうど${lo}個` : `${lo}個以上${hi}個以下`
  if (lo != null) return `${lo}個以上`
  if (hi != null) return `${hi}個以下`
  return null
}

export function constraintLines(p: ConstraintFields): { key: ConstraintKey; label: string; text: string }[] {
  const out: { key: ConstraintKey; label: string; text: string }[] = []
  for (const it of CONSTRAINT_ITEMS) {
    const text = formatRange(p[`min_${it.key}`], p[`max_${it.key}`])
    if (text) out.push({ key: it.key, label: it.label, text })
  }
  return out
}

export function hasMinConstraint(p: ConstraintFields): boolean {
  return CONSTRAINT_ITEMS.some(it => effectiveMin(p[`min_${it.key}`]) != null)
}

/** 検出数 count が制約を満たしているか */
export function checkCount(count: number, min: number | null | undefined, max: number | null | undefined): 'ok' | 'over' | 'under' {
  const hi = max ?? null
  const lo = effectiveMin(min)
  if (hi != null && count > hi) return 'over'
  if (lo != null && count < lo) return 'under'
  return 'ok'
}

export function analysisCount(a: CodeAnalysisResult, key: ConstraintKey): number {
  return a.counts[key]
}

// ---- 教員用フォーム（入力は文字列で保持し、保存時に数値へ変換） ----

export type ConstraintForm = Record<`max_${ConstraintKey}` | `min_${ConstraintKey}`, string> & {
  constraint_mode: 'deduct' | 'reject'
}

export function emptyConstraintForm(): ConstraintForm {
  return {
    max_vars: '', max_arrays: '', max_pointers: '', max_loops: '', max_ifs: '',
    min_vars: '', min_arrays: '', min_pointers: '', min_loops: '', min_ifs: '',
    constraint_mode: 'deduct',
  }
}

export function constraintFormFromProblem(p: ConstraintFields): ConstraintForm {
  const f = emptyConstraintForm()
  for (const it of CONSTRAINT_ITEMS) {
    const mx = p[`max_${it.key}`]
    const mn = effectiveMin(p[`min_${it.key}`])
    f[`max_${it.key}`] = mx != null ? String(mx) : ''
    f[`min_${it.key}`] = mn != null ? String(mn) : ''
  }
  f.constraint_mode = p.constraint_mode === 'reject' ? 'reject' : 'deduct'
  return f
}

function parseField(s: string): number | null {
  return s.trim() === '' ? null : Number(s)
}

/** 入力内容の検証。問題なければ null、あればエラーメッセージ */
export function validateConstraintForm(f: ConstraintForm): string | null {
  for (const it of CONSTRAINT_ITEMS) {
    const lo = parseField(f[`min_${it.key}`])
    const hi = parseField(f[`max_${it.key}`])
    for (const [v, kind] of [[lo, '下限'], [hi, '上限']] as const) {
      if (v != null && (!Number.isInteger(v) || v < 0)) return `${it.label}の${kind}は0以上の整数で入力してください`
    }
    if (lo != null && hi != null && lo > hi) return `${it.label}の下限（${lo}）が上限（${hi}）を超えています`
  }
  return null
}

export function constraintFormToPayload(f: ConstraintForm): ConstraintFields {
  const out = { constraint_mode: f.constraint_mode } as ConstraintFields
  for (const it of CONSTRAINT_ITEMS) {
    out[`max_${it.key}`] = parseField(f[`max_${it.key}`])
    out[`min_${it.key}`] = effectiveMin(parseField(f[`min_${it.key}`]))
  }
  return out
}
