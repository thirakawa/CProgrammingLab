import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.min.css'

export default function MarkdownRenderer({ content }: { content: string }) {
  return (
    <div className="prose prose-sm max-w-none
      [&_h1]:text-xl [&_h1]:font-bold [&_h1]:mt-4 [&_h1]:mb-2
      [&_h2]:text-lg [&_h2]:font-bold [&_h2]:mt-3 [&_h2]:mb-2
      [&_h3]:text-base [&_h3]:font-semibold [&_h3]:mt-2 [&_h3]:mb-1
      [&_p]:my-2 [&_p]:leading-relaxed
      [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-2
      [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:my-2
      [&_li]:my-0.5
      [&_code]:bg-gray-100 [&_code]:text-red-600 [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-xs [&_code]:font-mono
      [&_pre]:bg-gray-900 [&_pre]:text-gray-100 [&_pre]:rounded [&_pre]:p-3 [&_pre]:my-3 [&_pre]:overflow-x-auto
      [&_pre_code]:bg-transparent [&_pre_code]:text-gray-100 [&_pre_code]:p-0
      [&_blockquote]:border-l-4 [&_blockquote]:border-gray-300 [&_blockquote]:pl-3 [&_blockquote]:text-gray-600 [&_blockquote]:my-2
      [&_table]:border-collapse [&_table]:w-full [&_table]:my-3
      [&_th]:border [&_th]:border-gray-300 [&_th]:bg-gray-50 [&_th]:px-3 [&_th]:py-1.5 [&_th]:text-left [&_th]:text-sm
      [&_td]:border [&_td]:border-gray-300 [&_td]:px-3 [&_td]:py-1.5 [&_td]:text-sm
      [&_hr]:border-gray-200 [&_hr]:my-4
      [&_strong]:font-bold [&_em]:italic
      [&_a]:text-blue-600 [&_a]:underline">
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
        {content}
      </ReactMarkdown>
    </div>
  )
}
