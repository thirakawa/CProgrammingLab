"""C言語ソースの簡易静的解析（宣言・ループ・if の検出）。

外部ライブラリを使わず、トークン化 → 宣言の簡易パースで数える。
コンパイルが通ったコードを対象とする前提で、解釈できない箇所は黙って読み飛ばす
（例外を投げず、必ず前進する）。

数え方のルール:
  - 変数 : 修飾子(const/static/register 等)・struct・typedef 型を含む通常の変数。
           for(int i…) のループ変数、グローバル変数も数える。構造体のメンバ・関数の仮引数・
           typedef 宣言・extern 宣言・関数プロトタイプは数えない。
  - 配列 : 添字 [] を持つ宣言（多次元でも1個）。
  - ポインタ : * を持つ宣言（** でも1個）。`int *a[3]` は配列とポインタの両方に数える。
  - 対象外 : `int (*p)[3]` や関数ポインタ `int (*f)(int)` のような括弧つき宣言子（一覧には出す）。
  - ループ : for / while の出現数（do-while の while も1回）。
  - if : if の出現数（else if の if も1回）。
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field

_TYPE_KEYWORDS = {
    "void", "char", "short", "int", "long", "float", "double",
    "signed", "unsigned", "_Bool", "_Complex",
}
_QUALIFIERS = {"const", "volatile", "restrict", "_Atomic"}
_STORAGE = {"static", "extern", "register", "auto", "typedef", "inline", "_Thread_local"}
_KNOWN_TYPEDEFS = {
    "size_t", "ssize_t", "ptrdiff_t", "FILE", "bool", "time_t", "clock_t", "wchar_t",
    "va_list", "div_t", "ldiv_t", "off_t", "fpos_t",
    "int8_t", "int16_t", "int32_t", "int64_t",
    "uint8_t", "uint16_t", "uint32_t", "uint64_t",
    "intptr_t", "uintptr_t", "intmax_t", "uintmax_t",
}
_C_KEYWORDS = _TYPE_KEYWORDS | _QUALIFIERS | _STORAGE | {
    "if", "else", "for", "while", "do", "switch", "case", "default", "break",
    "continue", "return", "goto", "sizeof", "struct", "union", "enum",
}
_OPENERS = {"(": ")", "[": "]", "{": "}"}
_CLOSERS = {")", "]", "}"}


@dataclass
class Token:
    kind: str   # id / num / str / chr / op
    text: str
    line: int


@dataclass
class Declaration:
    line: int
    scope: str            # global / local / for
    type_text: str
    name: str
    kinds: list[str]      # var / array / pointer（空 = 数え対象外）
    note: str = ""

    def to_dict(self) -> dict:
        return {
            "line": self.line,
            "scope": self.scope,
            "type": self.type_text,
            "name": self.name,
            "kinds": self.kinds,
            "note": self.note,
        }


@dataclass
class CodeAnalysis:
    declarations: list[Declaration] = field(default_factory=list)
    loop_lines: list[int] = field(default_factory=list)
    if_lines: list[int] = field(default_factory=list)

    @property
    def var_count(self) -> int:
        return sum(1 for d in self.declarations if "var" in d.kinds)

    @property
    def array_count(self) -> int:
        return sum(1 for d in self.declarations if "array" in d.kinds)

    @property
    def pointer_count(self) -> int:
        return sum(1 for d in self.declarations if "pointer" in d.kinds)

    @property
    def loop_count(self) -> int:
        return len(self.loop_lines)

    @property
    def if_count(self) -> int:
        return len(self.if_lines)

    def to_dict(self) -> dict:
        return {
            "counts": {
                "vars": self.var_count,
                "arrays": self.array_count,
                "pointers": self.pointer_count,
                "loops": self.loop_count,
                "ifs": self.if_count,
            },
            "declarations": [d.to_dict() for d in self.declarations],
            "loop_lines": self.loop_lines,
            "if_lines": self.if_lines,
        }


# ---------------------------------------------------------------------------
# トークナイザ
# ---------------------------------------------------------------------------

_ID_RE = re.compile(r"[A-Za-z_]\w*")
_NUM_RE = re.compile(r"\d[\w.]*")


def tokenize(code: str) -> list[Token]:
    """コメント・プリプロセッサ行を除去し、識別子/数値/文字列/記号（1文字）に分割する"""
    tokens: list[Token] = []
    n = len(code)
    i = 0
    line = 1
    line_start = True   # 行頭（空白のみ）か
    while i < n:
        c = code[i]
        if c == "\n":
            line += 1
            i += 1
            line_start = True
            continue
        if c in " \t\r\f\v":
            i += 1
            continue
        if c == "/" and code.startswith("//", i):
            j = code.find("\n", i)
            i = n if j < 0 else j
            continue
        if c == "/" and code.startswith("/*", i):
            j = code.find("*/", i + 2)
            end = n if j < 0 else j + 2
            line += code.count("\n", i, end)
            i = end
            continue
        if c == "#" and line_start:
            # プリプロセッサ行（行継続 \ とコメントを考慮して行末まで読み飛ばす）
            while i < n and code[i] != "\n":
                if code[i] == "\\" and i + 1 < n and code[i + 1] == "\n":
                    line += 1
                    i += 2
                    continue
                if code.startswith("/*", i):
                    j = code.find("*/", i + 2)
                    end = n if j < 0 else j + 2
                    line += code.count("\n", i, end)
                    i = end
                    continue
                i += 1
            continue
        line_start = False
        if c == '"' or c == "'":
            quote = c
            j = i + 1
            while j < n and code[j] != quote and code[j] != "\n":
                j += 2 if code[j] == "\\" else 1
            end = min(j + 1, n) if (j < n and code[j] == quote) else min(j, n)
            tokens.append(Token("str" if quote == '"' else "chr", code[i:end], line))
            i = max(end, i + 1)
            continue
        m = _ID_RE.match(code, i)
        if m:
            tokens.append(Token("id", m.group(), line))
            i = m.end()
            continue
        m = _NUM_RE.match(code, i)
        if m:
            tokens.append(Token("num", m.group(), line))
            i = m.end()
            continue
        tokens.append(Token("op", c, line))
        i += 1
    return tokens


# ---------------------------------------------------------------------------
# 宣言パーサ
# ---------------------------------------------------------------------------

class _Parser:
    def __init__(self, tokens: list[Token]) -> None:
        self.t = tokens
        self.n = len(tokens)
        self.typedefs: set[str] = set(_KNOWN_TYPEDEFS)
        self.result = CodeAnalysis()

    # --- 補助 ---
    def _is(self, i: int, text: str) -> bool:
        return i < self.n and self.t[i].kind == "op" and self.t[i].text == text

    def _is_id(self, i: int) -> bool:
        return i < self.n and self.t[i].kind == "id"

    def _skip_balanced(self, i: int) -> int | None:
        """t[i] が開き括弧のとき、対応する閉じ括弧の次の位置を返す（不整合は None）"""
        stack: list[str] = []
        j = i
        while j < self.n:
            tk = self.t[j]
            if tk.kind == "op":
                if tk.text in _OPENERS:
                    stack.append(_OPENERS[tk.text])
                elif tk.text in _CLOSERS:
                    if not stack or stack.pop() != tk.text:
                        return None
                    if not stack:
                        return j + 1
            j += 1
        return None

    def _skip_initializer(self, i: int) -> int | None:
        """'=' の次から、トップレベルの ',' または ';' の手前まで読み飛ばす"""
        j = i
        while j < self.n:
            tk = self.t[j]
            if tk.kind == "op":
                if tk.text in _OPENERS:
                    j2 = self._skip_balanced(j)
                    if j2 is None:
                        return None
                    j = j2
                    continue
                if tk.text in (",", ";"):
                    return j
                if tk.text in _CLOSERS:
                    return None
            j += 1
        return None

    # --- 宣言指定子 ---
    def _starts_decl(self, i: int) -> bool:
        if not self._is_id(i):
            return False
        w = self.t[i].text
        if w in _TYPE_KEYWORDS or w in _QUALIFIERS or w in _STORAGE:
            return True
        if w in ("struct", "union", "enum"):
            return True
        if w in _C_KEYWORDS:
            return False
        if w in self.typedefs:
            return True
        # 未知の型名: 「識別子 識別子」「識別子 * 識別子」は式として成立しないため宣言とみなす
        j = i + 1
        while self._is(j, "*"):
            j += 1
        return self._is_id(j) and self.t[j].text not in _C_KEYWORDS

    def _parse_specifiers(self, i: int):
        """(次位置, 型テキスト, is_typedef, is_extern) または None"""
        words: list[str] = []
        have_type = False
        is_typedef = False
        is_extern = False
        j = i
        while self._is_id(j):
            w = self.t[j].text
            if w in _STORAGE:
                if w == "typedef":
                    is_typedef = True
                elif w == "extern":
                    is_extern = True
                words.append(w)
                j += 1
            elif w in _QUALIFIERS:
                words.append(w)
                j += 1
            elif w in _TYPE_KEYWORDS:
                have_type = True
                words.append(w)
                j += 1
            elif w in ("struct", "union", "enum"):
                if have_type:
                    break
                have_type = True
                words.append(w)
                j += 1
                if self._is_id(j) and self.t[j].text not in _C_KEYWORDS:
                    words.append(self.t[j].text)
                    j += 1
                if self._is(j, "{"):
                    j2 = self._skip_balanced(j)
                    if j2 is None:
                        return None
                    words.append("{...}")
                    j = j2
            elif not have_type and w not in _C_KEYWORDS:
                # typedef 名または未知の型名
                if w in self.typedefs or self._unknown_type_ok(j):
                    have_type = True
                    words.append(w)
                    j += 1
                else:
                    break
            else:
                break
        if not have_type:
            return None
        text = " ".join(x for x in words if x not in _STORAGE or x in ("static", "register"))
        return j, text, is_typedef, is_extern

    def _unknown_type_ok(self, j: int) -> bool:
        k = j + 1
        while self._is(k, "*"):
            k += 1
        return self._is_id(k) and self.t[k].text not in _C_KEYWORDS

    # --- 宣言子 ---
    def _parse_declarator(self, i: int):
        """(次位置, name, stars, dims, is_func, paren_form, line) または None"""
        stars = 0
        j = i
        while True:
            if self._is(j, "*"):
                stars += 1
                j += 1
                while self._is_id(j) and self.t[j].text in _QUALIFIERS:
                    j += 1
            else:
                break
        line = self.t[j].line if j < self.n else self.t[i].line
        dims = 0
        is_func = False
        paren_form = False
        if self._is(j, "("):
            # (*p)[3] / (*f)(int) 形式
            end = self._skip_balanced(j)
            if end is None:
                return None
            name = ""
            for k in range(j + 1, end - 1):
                if self.t[k].kind == "id" and self.t[k].text not in _C_KEYWORDS:
                    name = self.t[k].text
                    break
            if not name:
                return None
            paren_form = True
            j = end
            while self._is(j, "[") or self._is(j, "("):
                j2 = self._skip_balanced(j)
                if j2 is None:
                    return None
                j = j2
            line = self.t[i].line
        elif self._is_id(j) and self.t[j].text not in _C_KEYWORDS:
            name = self.t[j].text
            line = self.t[j].line
            j += 1
            while True:
                if self._is(j, "["):
                    j2 = self._skip_balanced(j)
                    if j2 is None:
                        return None
                    dims += 1
                    j = j2
                elif self._is(j, "(") and not is_func and dims == 0:
                    j2 = self._skip_balanced(j)
                    if j2 is None:
                        return None
                    is_func = True
                    j = j2
                else:
                    break
        else:
            return None
        if self._is(j, ":"):   # ビットフィールド幅
            j += 1
            while j < self.n and not (self._is(j, ",") or self._is(j, ";")):
                j += 1
        if self._is(j, "="):
            j2 = self._skip_initializer(j + 1)
            if j2 is None:
                return None
            j = j2
        return j, name, stars, dims, is_func, paren_form, line

    def _parse_declaration(self, i: int, scope: str):
        """宣言文を解析する。成功時は次の走査位置、失敗時は None。結果は self.result に追加"""
        spec = self._parse_specifiers(i)
        if spec is None:
            return None
        j, base, is_typedef, is_extern = spec
        found: list[tuple] = []
        func_def = False
        if self._is(j, ";"):
            return j + 1   # 型だけの宣言（struct S; など）
        while True:
            d = self._parse_declarator(j)
            if d is None:
                return None
            j, name, stars, dims, is_func, paren_form, line = d
            found.append((name, stars, dims, is_func, paren_form, line))
            if self._is(j, ","):
                j += 1
                continue
            if self._is(j, ";"):
                j += 1
                break
            if self._is(j, "{") and is_func and len(found) == 1:
                func_def = True
                break
            return None

        if is_typedef:
            for name, *_ in found:
                self.typedefs.add(name)
            return j
        if func_def or is_extern:
            return j
        for name, stars, dims, is_func, paren_form, line in found:
            if is_func:
                continue   # 関数プロトタイプ
            type_text = base + (" " + "*" * stars if stars else "") + "[]" * dims
            if paren_form:
                self.result.declarations.append(Declaration(
                    line, scope, base, name, [],
                    "括弧つき宣言子（関数ポインタ・配列へのポインタ）は数えません",
                ))
                continue
            kinds: list[str] = []
            if dims:
                kinds.append("array")
            if stars:
                kinds.append("pointer")
            if not kinds:
                kinds.append("var")
            self.result.declarations.append(Declaration(line, scope, type_text, name, kinds))
        return j

    # --- 本体 ---
    def run(self) -> CodeAnalysis:
        i = 0
        depth = 0
        stmt_start = True
        for_decl_at = -1
        while i < self.n:
            tk = self.t[i]
            if tk.kind == "id":
                if tk.text == "for":
                    self.result.loop_lines.append(tk.line)
                    if self._is(i + 1, "("):
                        for_decl_at = i + 2
                elif tk.text == "while":
                    self.result.loop_lines.append(tk.line)
                elif tk.text == "if":
                    self.result.if_lines.append(tk.line)
                if (stmt_start or i == for_decl_at) and self._starts_decl(i):
                    scope = "for" if i == for_decl_at else ("global" if depth == 0 else "local")
                    nxt = self._parse_declaration(i, scope)
                    if nxt is not None and nxt > i:
                        # 宣言内にある for/while/if は無い（初期化子の式は除く）ため単純に進める
                        i = nxt
                        stmt_start = True
                        continue
            if tk.kind == "op":
                if tk.text == "{":
                    depth += 1
                    stmt_start = True
                elif tk.text == "}":
                    depth = max(0, depth - 1)
                    stmt_start = True
                elif tk.text == ";":
                    stmt_start = True
                else:
                    stmt_start = False
            else:
                stmt_start = False
            i += 1
        return self.result


def analyze(code: str) -> CodeAnalysis:
    """ソースコードを解析して宣言・ループ・if を返す"""
    try:
        return _Parser(tokenize(code)).run()
    except RecursionError:
        return CodeAnalysis()
