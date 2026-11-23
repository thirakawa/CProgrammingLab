'use client'

import { CONSTRAINT_ITEMS, type ConstraintForm } from '@/lib/constraints'

/** コード制約（下限・上限・下限不足時の挙動）の入力欄。問題の作成・編集で共用 */
export default function ConstraintEditor({
  value,
  onChange,
}: {
  value: ConstraintForm
  onChange: (v: ConstraintForm) => void
}) {
  const set = (k: keyof ConstraintForm, v: string) => onChange({ ...value, [k]: v } as ConstraintForm)
  const hasMin = CONSTRAINT_ITEMS.some(it => value[`min_${it.key}`].trim() !== '' && Number(value[`min_${it.key}`]) > 0)

  return (
    <div>
      <p className="text-sm font-medium mb-2">コード制約（空欄 = 制約なし）</p>
      <table className="text-sm">
        <thead>
          <tr className="text-xs text-gray-500">
            <th className="text-left font-normal pr-4 pb-1">項目</th>
            <th className="text-left font-normal pr-3 pb-1">下限（個以上）</th>
            <th className="text-left font-normal pb-1">上限（個以下）</th>
          </tr>
        </thead>
        <tbody>
          {CONSTRAINT_ITEMS.map(it => (
            <tr key={it.key}>
              <td className="pr-4 py-1">{it.label}</td>
              {(['min', 'max'] as const).map(kind => (
                <td key={kind} className="pr-3 py-1">
                  <input
                    type="number" min={0} step={1}
                    value={value[`${kind}_${it.key}`]}
                    onChange={e => set(`${kind}_${it.key}`, e.target.value)}
                    placeholder={kind === 'min' ? 'なし' : '無制限'}
                    className="w-28 border rounded px-2 py-1.5 text-sm"
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-3">
        <p className="text-xs text-gray-600 mb-1">下限に満たなかった場合の挙動</p>
        <div className="flex gap-5 text-sm">
          <label className="flex items-center gap-1.5">
            <input
              type="radio" name="constraint_mode" checked={value.constraint_mode === 'deduct'}
              onChange={() => onChange({ ...value, constraint_mode: 'deduct' })}
            />
            減点する
          </label>
          <label className="flex items-center gap-1.5">
            <input
              type="radio" name="constraint_mode" checked={value.constraint_mode === 'reject'}
              onChange={() => onChange({ ...value, constraint_mode: 'reject' })}
            />
            提出を拒否する
          </label>
        </div>
        {value.constraint_mode === 'reject' && !hasMin && (
          <p className="text-xs text-gray-400 mt-1">下限が設定されていないため、この設定は使われません。</p>
        )}
      </div>

      <p className="text-xs text-gray-400 mt-2 leading-relaxed">
        上限を超えた場合は常に減点されます（変数・配列・ポインタ −20点、ループ・if −10点。各項目1回まで）。
        下限は 0 を「下限なし」と同じ扱いにします。提出拒否の場合は、コンパイルが通った後に判定し、提出記録・時間点には影響しません。
        ループは for/while を合計、if は else if も1回として数えます。
      </p>
    </div>
  )
}
