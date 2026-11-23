import MarkdownRenderer from '@/components/MarkdownRenderer'
import HashScroller from '@/components/HashScroller'

const INTRO = `
# 標準ライブラリ

C言語には、よく使う処理をまとめた**標準ライブラリ**が用意されています。使う関数に応じて、プログラムの先頭で対応するヘッダファイルを \`#include\` します。

\`\`\`c
#include <stdio.h>    // 入出力
#include <stdlib.h>   // 数値変換・乱数・メモリ確保など
#include <math.h>     // 数学関数
#include <ctype.h>    // 文字の判定・変換
\`\`\`

**注意**：\`#include\` を忘れたまま関数を使うと「暗黙の関数宣言（implicit declaration）」の**警告**が出て減点される（場合によってはコンパイルエラーや誤った結果になる）。使う関数のヘッダは必ず書くこと。
`

// ライブラリごとの詳細（id はページ内リンク用のアンカー）
const SECTIONS: { id: string; name: string; title: string; content: string }[] = [
  {
    id: 'stdio',
    name: 'stdio.h',
    title: 'stdio.h（標準入出力）',
    content: `
| 関数 | 働き | 例 |
|---|---|---|
| \`printf(書式, ...)\` | 書式に従って画面に出力 | \`printf("%d\\n", x);\` |
| \`scanf(書式, ...)\` | 書式に従って標準入力から読み込む | \`scanf("%d", &x);\` |
| \`putchar(c)\` | 1文字出力 | \`putchar('A');\` |
| \`getchar()\` | 1文字読み込む（終わりなら \`EOF\`） | \`int c = getchar();\` |
| \`puts(s)\` | 文字列を出力し、**最後に改行も出力**する | \`puts("Hello");\` |
| \`fgets(s, n, fp)\` | 1行（最大 \`n-1\` 文字）を読み込む | \`fgets(buf, sizeof(buf), stdin);\` |
| \`sprintf(s, 書式, ...)\` | 画面ではなく文字列 \`s\` に書き込む | \`sprintf(buf, "%d", x);\` |
| \`sscanf(s, 書式, ...)\` | 文字列 \`s\` から読み込む | \`sscanf("12 34", "%d %d", &a, &b);\` |
| \`fopen\` / \`fclose\` | ファイルを開く／閉じる | [C言語リファレンス](/student/reference)の「13. ファイル入出力」を参照 |
| \`fprintf\` / \`fscanf\` | ファイルへの出力／ファイルからの読み込み | \`fscanf(fp, "%d", &x);\` |

- \`scanf\` の戻り値は「読み込めた項目の数」。入力の終わり（EOF）では \`EOF\`（-1）を返すので、個数が決まっていない入力は次のように読める

\`\`\`c
int x, sum = 0;
while (scanf("%d", &x) == 1) {   // 読めなくなるまで繰り返す
    sum += x;
}
printf("%d\\n", sum);
\`\`\`

- \`getchar()\` の戻り値は \`char\` ではなく **\`int\`** で受け取る（\`EOF\` と通常の文字を区別するため）
- \`gets\` は危険なため規格から削除された関数。代わりに \`fgets\` を使う
- \`stdin\` は標準入力、\`stdout\` は標準出力を表す \`FILE *\`。\`fgets(buf, sizeof(buf), stdin)\` のようにファイル用の関数で使える
`,
  },
  {
    id: 'stdlib',
    name: 'stdlib.h',
    title: 'stdlib.h（汎用ユーティリティ）',
    content: `
| 関数 | 働き | 例 |
|---|---|---|
| \`abs(n)\` | \`int\` の絶対値 | \`abs(-5)\` → \`5\` |
| \`labs(n)\` / \`llabs(n)\` | \`long\` / \`long long\` の絶対値 | \`labs(-5L)\` → \`5\` |
| \`atoi(s)\` | 文字列を \`int\` に変換 | \`atoi("123")\` → \`123\` |
| \`atof(s)\` | 文字列を \`double\` に変換 | \`atof("3.14")\` → \`3.14\` |
| \`strtol(s, &end, 基数)\` | 文字列を \`long\` に変換（基数指定可） | \`strtol("ff", NULL, 16)\` → \`255\` |
| \`rand()\` | 0 〜 \`RAND_MAX\` の疑似乱数 | \`rand() % 6 + 1\`（1〜6） |
| \`srand(seed)\` | 乱数の種（シード）を設定 | \`srand(1);\` |
| \`malloc(バイト数)\` | メモリを動的に確保 | 下の例を参照 |
| \`calloc(個数, サイズ)\` | 0で初期化してメモリを確保 | \`calloc(n, sizeof(int))\` |
| \`free(p)\` | 確保したメモリを解放 | \`free(p);\` |
| \`exit(状態)\` | プログラムをその場で終了 | \`exit(1);\` |
| \`qsort(配列, 個数, サイズ, 比較関数)\` | 配列を並べ替える | 下の例を参照 |

- **実数の絶対値は \`abs\` ではなく \`math.h\` の \`fabs\`** を使う（\`abs(-2.5)\` は整数に変換されて \`2\` になってしまう）
- \`rand()\` は同じシードなら毎回同じ並びの数を返す。\`srand(time(NULL));\`（\`#include <time.h>\` が必要）で実行ごとに変わるが、自動採点の問題では出力が毎回変わると正解判定できないので、問題文の指示に従うこと

**malloc の例**（実行時に個数が決まる配列）：

\`\`\`c
int n;
scanf("%d", &n);
int *a = malloc(sizeof(int) * n);   // int を n 個分確保
if (a == NULL) {
    return 1;                        // 確保失敗
}
for (int i = 0; i < n; i++) {
    scanf("%d", &a[i]);              // 通常の配列と同じように使える
}
free(a);                             // 使い終わったら解放する
\`\`\`

**qsort の例**（整数配列を昇順に並べ替え）：

\`\`\`c
int cmp(const void *x, const void *y) {
    int a = *(const int *)x;
    int b = *(const int *)y;
    return (a > b) - (a < b);   // a<b なら負、a==b なら0、a>b なら正
}

int main(void) {
    int a[5] = {3, 1, 4, 1, 5};
    qsort(a, 5, sizeof(int), cmp);   // a は {1, 1, 3, 4, 5} になる
    return 0;
}
\`\`\`
`,
  },
  {
    id: 'math',
    name: 'math.h',
    title: 'math.h（数学関数）',
    content: `
引数・戻り値はいずれも \`double\`。

| 関数 | 働き | 例 |
|---|---|---|
| \`sqrt(x)\` | 平方根 $\\sqrt{x}$ | \`sqrt(2.0)\` → \`1.414214\` |
| \`pow(x, y)\` | べき乗 $x^y$ | \`pow(2.0, 10.0)\` → \`1024.0\` |
| \`fabs(x)\` | 実数の絶対値 | \`fabs(-2.5)\` → \`2.5\` |
| \`floor(x)\` | 切り捨て（x以下の最大の整数） | \`floor(2.7)\` → \`2.0\`、\`floor(-2.7)\` → \`-3.0\` |
| \`ceil(x)\` | 切り上げ（x以上の最小の整数） | \`ceil(2.1)\` → \`3.0\` |
| \`round(x)\` | 四捨五入 | \`round(2.5)\` → \`3.0\` |
| \`fmod(x, y)\` | 実数の余り（\`%\` は整数専用） | \`fmod(7.5, 2.0)\` → \`1.5\` |
| \`exp(x)\` | 指数関数 $e^x$ | \`exp(1.0)\` → \`2.718282\` |
| \`log(x)\` | 自然対数 $\\log_e x$ | \`log(exp(1.0))\` → \`1.0\` |
| \`log10(x)\` | 常用対数 $\\log_{10} x$ | \`log10(1000.0)\` → \`3.0\` |
| \`sin(x)\` / \`cos(x)\` / \`tan(x)\` | 三角関数（**x はラジアン**） | \`sin(0.0)\` → \`0.0\` |
| \`asin\` / \`acos\` / \`atan\` | 逆三角関数（戻り値はラジアン） | \`acos(-1.0)\` → $\\pi$ |
| \`atan2(y, x)\` | 点 (x, y) の偏角（ラジアン） | \`atan2(1.0, 1.0)\` → $\\pi/4$ |
| \`hypot(x, y)\` | $\\sqrt{x^2 + y^2}$ | \`hypot(3.0, 4.0)\` → \`5.0\` |

\`\`\`c
#include <stdio.h>
#include <math.h>

int main(void) {
    double pi = acos(-1.0);           // 円周率 π
    double deg = 30.0;
    double rad = deg * pi / 180.0;    // 度 → ラジアンに変換
    printf("%.3f\\n", sin(rad));       // 0.500
    printf("%.3f\\n", sqrt(2.0));      // 1.414
    return 0;
}
\`\`\`

- 三角関数の引数は「度」ではなく**ラジアン**。度で与えられた角度は \`× π / 180\` で変換する
- 円周率の定数 \`M_PI\` は規格外のため、このプラットフォームのコンパイル設定（\`-std=c99\`）では**使えない**（コンパイルエラーになる）。\`acos(-1.0)\` で求めるか、\`#define PI 3.14159265358979\` のように自分で定義する
- 結果を整数で使いたいときはキャストする：\`int r = (int)sqrt(n);\`。ただし \`sqrt(25.0)\` が \`4.999999...\` のような誤差を含む可能性に注意（\`(int)(sqrt(n) + 0.5)\` などで対策）
- \`pow\` で整数のべき乗を求めると誤差が出ることがあるので、整数の2乗・3乗などは \`x * x\` のように掛け算で書くほうが確実
- 戻り値は \`double\` なので、\`printf\` では \`%f\`（または \`%.2f\` など）で出力する。\`%d\` を使うと警告になり正しく表示されない
`,
  },
  {
    id: 'ctype',
    name: 'ctype.h',
    title: 'ctype.h（文字の判定・変換）',
    content: `
1文字（\`char\`）が数字か英字か、などを判定したり、大文字・小文字を変換したりする関数。引数・戻り値はいずれも \`int\` で、判定関数は**条件に当てはまれば 0 以外（真）、当てはまらなければ 0（偽）**を返す（真のときの値が 1 とは限らないので、\`== 1\` で比較しないこと）。

| 関数 | 真になる文字 | 例 |
|---|---|---|
| \`isdigit(c)\` | 数字 \`'0'〜'9'\` | \`isdigit('7')\` → 真 |
| \`isalpha(c)\` | 英字 \`'A'〜'Z'\`, \`'a'〜'z'\` | \`isalpha('x')\` → 真 |
| \`isalnum(c)\` | 英字または数字 | \`isalnum('_')\` → 偽 |
| \`isupper(c)\` | 英大文字 \`'A'〜'Z'\` | \`isupper('Q')\` → 真 |
| \`islower(c)\` | 英小文字 \`'a'〜'z'\` | \`islower('Q')\` → 偽 |
| \`isspace(c)\` | 空白文字（\`' '\`, \`'\\t'\`, \`'\\n'\`, \`'\\r'\`, \`'\\v'\`, \`'\\f'\`） | \`isspace('\\n')\` → 真 |
| \`ispunct(c)\` | 記号（空白・英数字以外の表示可能な文字） | \`ispunct('!')\` → 真 |
| \`isxdigit(c)\` | 16進数の数字 \`'0'〜'9'\`, \`'A'〜'F'\`, \`'a'〜'f'\` | \`isxdigit('b')\` → 真 |
| \`isprint(c)\` | 表示可能な文字（空白を含む） | \`isprint('\\n')\` → 偽 |
| \`iscntrl(c)\` | 制御文字（改行・タブなど） | \`iscntrl('\\n')\` → 真 |

| 関数 | 働き | 例 |
|---|---|---|
| \`toupper(c)\` | 英小文字なら大文字にした値を返す（それ以外はそのまま） | \`toupper('a')\` → \`'A'\`、\`toupper('1')\` → \`'1'\` |
| \`tolower(c)\` | 英大文字なら小文字にした値を返す（それ以外はそのまま） | \`tolower('A')\` → \`'a'\` |

**例**：入力された文字列の英字・数字の個数を数え、すべて大文字にして出力する

\`\`\`c
#include <stdio.h>
#include <ctype.h>

int main(void) {
    char s[100];
    int alpha = 0, digit = 0;
    scanf("%99s", s);
    for (int i = 0; s[i] != '\\0'; i++) {
        if (isalpha((unsigned char)s[i])) alpha++;
        if (isdigit((unsigned char)s[i])) digit++;
        s[i] = toupper((unsigned char)s[i]);
    }
    printf("英字:%d 数字:%d\\n", alpha, digit);
    printf("%s\\n", s);   // 例：入力 abc123 → ABC123
    return 0;
}
\`\`\`

- \`toupper\` / \`tolower\` は**変換した値を返すだけ**で、引数の変数そのものは変わらない。\`toupper(c);\` だけでは何も起きないので、\`c = toupper(c);\` のように代入する
- 文字列全体を変換する関数はないため、上の例のようにループで1文字ずつ変換する
- 引数に負の値（日本語などのASCII外の文字を \`char\` に入れた場合に起こりうる）を渡すと正しく動かないことがある。\`(unsigned char)\` にキャストして渡すと安全
- 同じ判定は \`c >= '0' && c <= '9'\` のように文字コードの範囲でも書ける（[ASCIIコード表](/student/ascii)を参照）。\`ctype.h\` の関数を使うと意図がわかりやすく、書き間違いも減る
`,
  },]

export default function LibraryPage() {
  return (
    <div className="max-w-3xl">
      <div className="bg-white rounded-lg shadow p-8">
        <MarkdownRenderer content={INTRO} />

        {/* 目次 */}
        <nav className="my-4 flex flex-wrap gap-2">
          {SECTIONS.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className="px-3 py-1 rounded border border-green-700 text-green-800 text-sm font-mono hover:bg-green-50"
            >
              {s.name}
            </a>
          ))}
        </nav>

        {SECTIONS.map((s) => (
          <section key={s.id} id={s.id} className="scroll-mt-4 border-t border-gray-200 pt-4 mt-6">
            <h2 className="text-lg font-bold mb-2">{s.title}</h2>
            <MarkdownRenderer content={s.content} />
            <p className="text-right mt-2">
              <a href="#" className="text-xs text-blue-600 underline">ページの先頭へ</a>
            </p>
          </section>
        ))}
      </div>
      <HashScroller />
    </div>
  )
}
