import MarkdownRenderer from '@/components/MarkdownRenderer'

// 制御文字（0〜31, 127）の略号・C言語のエスケープシーケンス・意味
const CONTROL_CHARS: { code: number; abbr: string; escape?: string; desc: string }[] = [
  { code: 0, abbr: 'NUL', escape: '\\0', desc: 'ヌル文字（文字列の終端）' },
  { code: 1, abbr: 'SOH', desc: 'ヘッディング開始' },
  { code: 2, abbr: 'STX', desc: 'テキスト開始' },
  { code: 3, abbr: 'ETX', desc: 'テキスト終了' },
  { code: 4, abbr: 'EOT', desc: '伝送終了' },
  { code: 5, abbr: 'ENQ', desc: '問い合わせ' },
  { code: 6, abbr: 'ACK', desc: '肯定応答' },
  { code: 7, abbr: 'BEL', escape: '\\a', desc: 'ベル（警告音）' },
  { code: 8, abbr: 'BS', escape: '\\b', desc: 'バックスペース' },
  { code: 9, abbr: 'HT', escape: '\\t', desc: '水平タブ' },
  { code: 10, abbr: 'LF', escape: '\\n', desc: '改行（ラインフィード）' },
  { code: 11, abbr: 'VT', escape: '\\v', desc: '垂直タブ' },
  { code: 12, abbr: 'FF', escape: '\\f', desc: '改ページ' },
  { code: 13, abbr: 'CR', escape: '\\r', desc: '復帰（キャリッジリターン）' },
  { code: 14, abbr: 'SO', desc: 'シフトアウト' },
  { code: 15, abbr: 'SI', desc: 'シフトイン' },
  { code: 16, abbr: 'DLE', desc: '伝送制御拡張' },
  { code: 17, abbr: 'DC1', desc: '装置制御1' },
  { code: 18, abbr: 'DC2', desc: '装置制御2' },
  { code: 19, abbr: 'DC3', desc: '装置制御3' },
  { code: 20, abbr: 'DC4', desc: '装置制御4' },
  { code: 21, abbr: 'NAK', desc: '否定応答' },
  { code: 22, abbr: 'SYN', desc: '同期信号' },
  { code: 23, abbr: 'ETB', desc: '伝送ブロック終了' },
  { code: 24, abbr: 'CAN', desc: '取り消し' },
  { code: 25, abbr: 'EM', desc: '媒体終端' },
  { code: 26, abbr: 'SUB', desc: '置換' },
  { code: 27, abbr: 'ESC', desc: 'エスケープ' },
  { code: 28, abbr: 'FS', desc: 'ファイル区切り' },
  { code: 29, abbr: 'GS', desc: 'グループ区切り' },
  { code: 30, abbr: 'RS', desc: 'レコード区切り' },
  { code: 31, abbr: 'US', desc: 'ユニット区切り' },
  { code: 127, abbr: 'DEL', desc: '削除' },
]

const PRINTABLE = Array.from({ length: 95 }, (_, i) => i + 32) // 32〜126

function hex(n: number) {
  return n.toString(16).toUpperCase().padStart(2, '0')
}

function displayChar(code: number) {
  return code === 32 ? '(空白)' : String.fromCharCode(code)
}

// 文字の種類ごとの色分け
function charClass(code: number) {
  if (code >= 48 && code <= 57) return 'bg-blue-50'      // 数字
  if (code >= 65 && code <= 90) return 'bg-green-50'     // 英大文字
  if (code >= 97 && code <= 122) return 'bg-yellow-50'   // 英小文字
  return ''
}

const INTRO = `
# ASCIIコード表

コンピュータの内部では、文字はすべて**数値（文字コード）**として扱われます。**ASCII（アスキー）**は、英数字・記号・制御文字の 0〜127 の128文字に番号を割り当てた、最も基本的な文字コードです。

C言語の \`char\` 型は、実際にはこの文字コード（小さな整数）を格納しています。そのため \`'A'\` と \`65\` は同じ値で、文字に対して足し算や比較ができます。

\`\`\`c
char c = 'A';
printf("%c %d\\n", c, c);   // A 65（%c は文字として、%d は数値として表示）
printf("%c\\n", 66);        // B
\`\`\`
`

const USAGE = `
## C言語での活用例

### 数字の文字を数値に変換する

数字 \`'0'〜'9'\` は 48〜57 に連続して並んでいるので、\`'0'\` を引くと数値になる。

\`\`\`c
char c = '7';
int n = c - '0';   // 55 - 48 = 7
\`\`\`

### 大文字と小文字を変換する

\`'A'〜'Z'\`（65〜90）と \`'a'〜'z'\`（97〜122）はそれぞれ連続しており、差はちょうど **32**。

\`\`\`c
char c = 'b';
char upper = c - 'a' + 'A';   // 'B'（c - 32 と同じ）
char lower = 'Q' - 'A' + 'a'; // 'q'
\`\`\`

### 文字の種類を判定する

\`\`\`c
if (c >= '0' && c <= '9') { /* 数字 */ }
if (c >= 'A' && c <= 'Z') { /* 英大文字 */ }
if (c >= 'a' && c <= 'z') { /* 英小文字 */ }
\`\`\`

\`65\` のような数値を直接書くより、\`'A'\` のように文字で書いたほうが読みやすく間違いも少ない。

\`#include <ctype.h>\` を書くと、判定・変換用の関数も使える。

| 関数 | 働き |
|---|---|
| \`isdigit(c)\` | 数字（\`'0'〜'9'\`）なら真 |
| \`isalpha(c)\` | 英字なら真 |
| \`isupper(c)\` / \`islower(c)\` | 英大文字 / 英小文字なら真 |
| \`isalnum(c)\` | 英字または数字なら真 |
| \`isspace(c)\` | 空白文字（空白・\`\\t\`・\`\\n\` など）なら真 |
| \`toupper(c)\` / \`tolower(c)\` | 大文字 / 小文字に変換した値を返す |

詳しくは[標準ライブラリのページの ctype.h の項](/student/library#ctype)を参照。

### 覚えておくと便利な値

| 文字 | 10進 | 16進 |
|---|---|---|
| \`'\\0'\`（ヌル文字） | 0 | 0x00 |
| \`'\\n'\`（改行） | 10 | 0x0A |
| \`' '\`（空白） | 32 | 0x20 |
| \`'0'\` | 48 | 0x30 |
| \`'A'\` | 65 | 0x41 |
| \`'a'\` | 97 | 0x61 |

**注意**：日本語（ひらがな・漢字など）はASCIIに含まれず、1文字が複数バイトで表される（UTF-8では多くの場合3バイト）。\`char\` 1つには入らない。
`

export default function AsciiPage() {
  return (
    <div className="max-w-4xl">
      <div className="bg-white rounded-lg shadow p-8 space-y-6">
        <MarkdownRenderer content={INTRO} />

        {/* 印字可能文字の一覧表（行 = 下位4ビット、列 = 上位3ビット） */}
        <section>
          <h2 className="text-lg font-bold mb-2">印字可能文字（32〜126）の早見表</h2>
          <p className="text-sm text-gray-600 mb-3">
            各セルは「文字」と「10進数の値」です。文字コードの16進数は「列の見出し + 行の見出し」で読みます（例：
            <code className="bg-gray-100 text-red-600 px-1 rounded text-xs font-mono">A</code> は列 4・行 1 なので 0x41 = 65）。
          </p>
          <div className="overflow-x-auto">
            <table className="border-collapse text-sm font-mono">
              <thead>
                <tr>
                  <th className="border border-gray-300 bg-gray-100 px-2 py-1">下位＼上位</th>
                  {[2, 3, 4, 5, 6, 7].map((hi) => (
                    <th key={hi} className="border border-gray-300 bg-gray-100 px-3 py-1">{hi}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: 16 }, (_, lo) => (
                  <tr key={lo}>
                    <th className="border border-gray-300 bg-gray-100 px-2 py-1">{lo.toString(16).toUpperCase()}</th>
                    {[2, 3, 4, 5, 6, 7].map((hi) => {
                      const code = hi * 16 + lo
                      if (code === 127) {
                        return (
                          <td key={hi} className="border border-gray-300 px-3 py-1 text-center text-gray-400">
                            DEL<span className="block text-xs">127</span>
                          </td>
                        )
                      }
                      return (
                        <td key={hi} className={`border border-gray-300 px-3 py-1 text-center ${charClass(code)}`}>
                          <span className="font-bold">{code === 32 ? '␣' : String.fromCharCode(code)}</span>
                          <span className="block text-xs text-gray-500">{code}</span>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-gray-500 mt-2">
            <span className="inline-block w-3 h-3 bg-blue-50 border border-gray-300 align-middle mr-1" />数字
            <span className="inline-block w-3 h-3 bg-green-50 border border-gray-300 align-middle ml-3 mr-1" />英大文字
            <span className="inline-block w-3 h-3 bg-yellow-50 border border-gray-300 align-middle ml-3 mr-1" />英小文字
            <span className="ml-3">␣ は空白（スペース、32）</span>
          </p>
        </section>

        {/* 印字可能文字の詳細一覧（10進・16進・8進） */}
        <section>
          <h2 className="text-lg font-bold mb-2">印字可能文字の一覧（10進・16進・8進）</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[0, 1, 2].map((col) => {
              const size = Math.ceil(PRINTABLE.length / 3)
              const codes = PRINTABLE.slice(col * size, (col + 1) * size)
              return (
                <table key={col} className="border-collapse text-sm font-mono w-full">
                  <thead>
                    <tr className="bg-gray-100">
                      <th className="border border-gray-300 px-2 py-1">文字</th>
                      <th className="border border-gray-300 px-2 py-1">10進</th>
                      <th className="border border-gray-300 px-2 py-1">16進</th>
                      <th className="border border-gray-300 px-2 py-1">8進</th>
                    </tr>
                  </thead>
                  <tbody>
                    {codes.map((code) => (
                      <tr key={code} className={charClass(code)}>
                        <td className="border border-gray-300 px-2 py-0.5 text-center font-bold">{displayChar(code)}</td>
                        <td className="border border-gray-300 px-2 py-0.5 text-right">{code}</td>
                        <td className="border border-gray-300 px-2 py-0.5 text-right">0x{hex(code)}</td>
                        <td className="border border-gray-300 px-2 py-0.5 text-right">{code.toString(8).padStart(3, '0')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            })}
          </div>
        </section>

        {/* 制御文字 */}
        <section>
          <h2 className="text-lg font-bold mb-2">制御文字（0〜31, 127）</h2>
          <p className="text-sm text-gray-600 mb-3">
            画面に表示されず、改行やタブなどの「動作」を表す文字です。C言語ではエスケープシーケンス（
            <code className="bg-gray-100 text-red-600 px-1 rounded text-xs font-mono">\n</code> など）で書けるものがあります。
            よく使うのは <strong>\0</strong>（文字列の終端）・<strong>\t</strong>（タブ）・<strong>\n</strong>（改行）です。
          </p>
          <div className="overflow-x-auto">
            <table className="border-collapse text-sm w-full">
              <thead>
                <tr className="bg-gray-100">
                  <th className="border border-gray-300 px-2 py-1">10進</th>
                  <th className="border border-gray-300 px-2 py-1">16進</th>
                  <th className="border border-gray-300 px-2 py-1">略号</th>
                  <th className="border border-gray-300 px-2 py-1">C言語での表記</th>
                  <th className="border border-gray-300 px-2 py-1 text-left">意味</th>
                </tr>
              </thead>
              <tbody>
                {CONTROL_CHARS.map((c) => (
                  <tr key={c.code} className={c.escape ? 'bg-orange-50' : ''}>
                    <td className="border border-gray-300 px-2 py-0.5 text-right font-mono">{c.code}</td>
                    <td className="border border-gray-300 px-2 py-0.5 text-right font-mono">0x{hex(c.code)}</td>
                    <td className="border border-gray-300 px-2 py-0.5 text-center font-mono">{c.abbr}</td>
                    <td className="border border-gray-300 px-2 py-0.5 text-center font-mono font-bold">
                      {c.escape ? `'${c.escape}'` : ''}
                    </td>
                    <td className="border border-gray-300 px-2 py-0.5">{c.desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <MarkdownRenderer content={USAGE} />
      </div>
    </div>
  )
}
