'use client'

import type { CaseFileDraft } from '@/lib/api'

/**
 * テストケース／サンプルケースに添付する *.txt, *.csv ファイルの編集UI。
 * プログラムはソース・実行ファイルと同じディレクトリからこれらのファイルを fopen 等で開ける。
 */
export default function CaseFileEditor({
  files,
  onChange,
}: {
  files: CaseFileDraft[]
  onChange: (files: CaseFileDraft[]) => void
}) {
  const addFile = () => onChange([...files, { filename: '', content: '' }])
  const removeFile = (i: number) => onChange(files.filter((_, idx) => idx !== i))
  const updateFile = (i: number, field: keyof CaseFileDraft, value: string) => {
    onChange(files.map((f, idx) => (idx === i ? { ...f, [field]: value } : f)))
  }

  return (
    <div className="mt-3 border-t pt-3">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-gray-500">
          添付ファイル（任意・.txt / .csv）
          <span className="text-gray-400"> — プログラムと同じディレクトリに配置されます</span>
        </p>
        <button type="button" onClick={addFile} className="text-blue-600 hover:underline text-xs">
          + ファイル追加
        </button>
      </div>
      {files.length === 0 && (
        <p className="text-gray-400 text-xs">添付ファイルなし（標準入出力のみ）</p>
      )}
      <div className="space-y-2">
        {files.map((f, i) => (
          <div key={i} className="border rounded p-2 bg-gray-50">
            <div className="flex items-center gap-2 mb-1.5">
              <input
                type="text"
                value={f.filename}
                onChange={(e) => updateFile(i, 'filename', e.target.value)}
                placeholder="ファイル名（例: data.csv）"
                className="flex-1 border rounded px-2 py-1 text-xs font-mono"
              />
              <button
                type="button"
                onClick={() => removeFile(i)}
                className="text-red-400 hover:text-red-600 text-xs shrink-0"
              >
                削除
              </button>
            </div>
            <textarea
              value={f.content}
              onChange={(e) => updateFile(i, 'content', e.target.value)}
              rows={3}
              placeholder="ファイルの中身"
              className="w-full border rounded px-2 py-1 text-xs font-mono"
            />
          </div>
        ))}
      </div>
    </div>
  )
}
