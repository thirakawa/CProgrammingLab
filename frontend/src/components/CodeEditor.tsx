'use client'

import dynamic from 'next/dynamic'

const MonacoEditor = dynamic(() => import('@monaco-editor/react'), { ssr: false })

interface CodeEditorProps {
  value: string
  onChange: (value: string) => void
  height?: string
  readOnly?: boolean
}

export default function CodeEditor({ value, onChange, height = '400px', readOnly = false }: CodeEditorProps) {
  return (
    <div className="border border-gray-700 rounded overflow-hidden">
      <MonacoEditor
        height={height}
        language="c"
        theme="vs-dark"
        value={value}
        onChange={(v) => onChange(v ?? '')}
        options={{
          fontSize: 14,
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          readOnly,
          tabSize: 4,
        }}
      />
    </div>
  )
}
