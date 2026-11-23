'use client'

import { HARNESS_EXAMPLE, type TypeForm } from '@/lib/problemType'

/** 問題タイプ（プログラム作成型／関数定義型）・エディタ初期コード・採点用ハーネスの入力欄 */
export default function ProblemTypeEditor({
  value,
  onChange,
}: {
  value: TypeForm
  onChange: (v: TypeForm) => void
}) {
  const isFunction = value.problem_type === 'function'
  const set = (patch: Partial<TypeForm>) => onChange({ ...value, ...patch })

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium">問題タイプ</p>
      <div className="flex flex-col gap-1.5 text-sm">
        <label className="flex items-start gap-2">
          <input
            type="radio"
            name="problem_type"
            checked={!isFunction}
            onChange={() => set({ problem_type: 'program' })}
            className="mt-1"
          />
          <span>
            プログラム作成型
            <span className="text-gray-500">（学生が main 関数を含む完全なプログラムを書く）</span>
          </span>
        </label>
        <label className="flex items-start gap-2">
          <input
            type="radio"
            name="problem_type"
            checked={isFunction}
            onChange={() => set({ problem_type: 'function' })}
            className="mt-1"
          />
          <span>
            関数定義型
            <span className="text-gray-500">
              （学生は指定された関数だけを書き、採点用ハーネスの main がその関数を呼び出す）
            </span>
          </span>
        </label>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">
          エディタの初期コード <span className="text-xs text-gray-400 font-normal">（任意・学生に公開）</span>
        </label>
        <textarea
          value={value.template_code}
          onChange={(e) => set({ template_code: e.target.value })}
          rows={6}
          spellCheck={false}
          className="w-full border rounded px-3 py-2 font-mono text-xs"
          placeholder={isFunction
            ? 'int max2(int a, int b) {\n    // ここに処理を書いてください\n}'
            : '空欄のときは標準の main 関数ひな形が表示されます'}
        />
      </div>

      {isFunction && (
        <div className="border border-amber-200 bg-amber-50 rounded p-3">
          <label className="block text-sm font-medium mb-1">
            採点用ハーネス <span className="text-xs text-red-500 font-normal">（学生には非公開・必須）</span>
          </label>
          <textarea
            value={value.harness_code}
            onChange={(e) => set({ harness_code: e.target.value })}
            rows={14}
            spellCheck={false}
            className="w-full border rounded px-3 py-2 font-mono text-xs bg-white"
            placeholder={HARNESS_EXAMPLE}
          />
          <ul className="text-xs text-gray-600 mt-2 list-disc pl-5 space-y-0.5">
            <li>学生のコードとは<strong>別ファイルとしてコンパイルしてリンク</strong>されます。学生に定義させる関数は、ここでプロトタイプ宣言してください。</li>
            <li>テストケースの「入力」は、ハーネスの標準入力に渡されます。結果は標準出力に表示し、期待される出力をテストケースに書いてください（期待値をハーネスに埋め込まないこと）。</li>
            <li>学生が <code>main</code> を定義するとリンクエラーになり、その旨が学生に表示されます。ハーネス自体にエラーがあるときは、学生には「採点用プログラムの不具合」とだけ表示され、提出は記録されません。</li>
            <li>構造体を使う問題は、同じ構造体定義を「初期コード」とハーネスの両方に書いてください。</li>
            <li>ソースは実行環境には配置されませんが、実行ファイルには含まれます。固有のデータは極力テストケース側に置いてください。</li>
          </ul>
        </div>
      )}
    </div>
  )
}
