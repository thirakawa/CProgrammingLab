"""code_analyzer の単体テスト（pytest 不要）。
実行: docker exec cprogramlab-backend python -m tests.test_code_analyzer  （/app で）
"""
from app.code_analyzer import analyze


def counts(code):
    a = analyze(code)
    return (a.var_count, a.array_count, a.pointer_count, a.loop_count, a.if_count)


def names(code):
    return [(d.name, tuple(d.kinds)) for d in analyze(code).declarations]


CASES = []


def case(name, code, expect):
    CASES.append((name, code, expect))


case("基本", """
#include <stdio.h>
int main(void) {
    int a, b = 3;
    double d;
    printf("%d\\n", a);
    return 0;
}""", (3, 0, 0, 0, 0))

case("forのループ変数を数える", """
int main(void) {
    int s = 0;
    for (int i = 0; i < 10; i++) { s += i; }
    return 0;
}""", (2, 0, 0, 1, 0))

case("for内の複数宣言", "int main(){ for (int i = 0, j = 5; i < j; i++, j--) {} }", (2, 0, 0, 1, 0))

case("関数の仮引数は数えない", """
int add(int a, int b) { return a + b; }
int main(void) { int x = add(1, 2); return x; }""", (1, 0, 0, 0, 0))

case("グローバル変数を数える", """
int g = 5;
static int h;
int main(void) { return g; }""", (2, 0, 0, 0, 0))

case("配列", "int main(){ int a[10]; int b[3][4]; char s[] = \"abc\"; }", (0, 3, 0, 0, 0))

case("ポインタ", "int main(){ int *p; int **q; char *s = \"x\"; }", (0, 0, 3, 0, 0))

case("ポインタ配列は配列とポインタの両方", "int main(){ char *names[3]; }", (0, 1, 1, 0, 0))

case("配列ポインタ(括弧つき)は対象外", "int main(){ int (*p)[3]; int (*f)(int); }", (0, 0, 0, 0, 0))

case("宣言子の混在", "int main(){ int a, *p, arr[3], x = 1; }", (2, 1, 1, 0, 0))

case("const/static/register", "int main(){ const int a = 1; static int b; register int c; }", (3, 0, 0, 0, 0))

case("& は宣言ではない", "int main(){ int x; scanf(\"%d\", &x); int *p = &x; }", (1, 0, 1, 0, 0))

case("構造体: 変数は数え、メンバは数えない", """
struct Point { int x; int y; };
int main(void) {
    struct Point p;
    struct Point q = {1, 2};
    struct Point *pp = &p;
    return 0;
}""", (2, 0, 1, 0, 0))

case("無名構造体と同時宣言", "struct { int a; int b; } s1, s2; int main(){}", (2, 0, 0, 0, 0))

case("typedef型の変数", """
typedef struct { int x; int y; } Point;
typedef int Int32;
int main(void) { Point p; Int32 n; Point *pp; return 0; }""", (2, 0, 1, 0, 0))

case("typedef宣言自体は数えない", "typedef int myint; typedef int (*fn)(int); int main(){}", (0, 0, 0, 0, 0))

case("標準の型名", "#include <stdio.h>\nint main(){ FILE *fp; size_t n; uint8_t b; bool f; }", (3, 0, 1, 0, 0))

case("関数プロトタイプは数えない", """
int f(int);
double g(double x, double y);
int *h(void);
int main(void) { int a; return 0; }""", (1, 0, 0, 0, 0))

case("関数内のローカルプロトタイプ", "int main(){ int f(int); int a; }", (1, 0, 0, 0, 0))

case("ポインタを返す関数定義は数えない", "int *f(void) { static int a; return &a; } int main(){}", (1, 0, 0, 0, 0))

case("extern は数えない", "extern int g; int main(){}", (0, 0, 0, 0, 0))

case("enum", "enum Color { RED, GREEN } c; int main(){ enum Color d = RED; }", (2, 0, 0, 0, 0))

case("ループとif", """
int main(void) {
    int i = 0;
    while (i < 3) { if (i == 1) {} else if (i == 2) {} i++; }
    do { i--; } while (i > 0);
    for (;;) break;
}""", (1, 0, 0, 3, 2))

case("コメントと文字列内は無視", """
int main(void) {
    // int hidden; for if while
    /* int hidden2[3]; */
    char *s = "int x; for (int i;;) if";
    return 0;
}""", (0, 0, 1, 0, 0))

case("プリプロセッサ行は無視", """
#define LOOP for (int i = 0; i < 3; i++)
#if 1
#define X int y;
#endif
int main(void) { int a; return 0; }""", (1, 0, 0, 0, 0))

case("初期化子の中のカンマと波括弧", "int main(){ int a[] = {1, 2, 3}, b = (1, 2), c; }", (2, 1, 0, 0, 0))

case("文字リテラル", "int main(){ char c = ';'; char d = '\"'; int e; }", (3, 0, 0, 0, 0))

case("乗算式は宣言ではない", "int main(){ int a, b, c; c = a * b; }", (3, 0, 0, 0, 0))

case("未知の型名(識別子 識別子)", "int main(){ Foo x; Foo *p; }", (1, 0, 1, 0, 0))

case("ポインタ修飾子", "int main(){ char *const p = 0; const char *q; }", (0, 0, 2, 0, 0))

case("long long / unsigned", "int main(){ unsigned long long a; long double b; unsigned c; }", (3, 0, 0, 0, 0))

case("引数なしmainと構造体配列", """
struct S { int a; };
int main() { struct S arr[3]; struct S *p = arr; }""", (0, 1, 1, 0, 0))

case("壊れたコードでも例外を出さない", "int main( { int a[ ; for ( if }}} {{{ \"unterminated", None)
case("空コード", "", (0, 0, 0, 0, 0))


def main():
    failed = 0
    for name, code, expect in CASES:
        got = counts(code)
        if expect is not None and got != expect:
            failed += 1
            print(f"NG  {name}: expected {expect}, got {got}")
            print("    ", names(code))
        else:
            print(f"OK  {name}: {got}")
    print(f"\n{len(CASES) - failed}/{len(CASES)} passed")
    raise SystemExit(1 if failed else 0)


if __name__ == "__main__":
    main()
