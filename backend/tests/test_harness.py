"""ハーネス方式のリンクエラー変換の単体テスト（Docker不要）。
実行: docker exec -w /app cprogramlab-backend python -m tests.test_harness"""
from app.judge import _explain_link_error

CASES = [
    ("main重複",
     "/usr/bin/ld: /sandbox/harness.o: in function `main':\n"
     "harness.c:(.text+0x0): multiple definition of `main'; /sandbox/student.o:main.c:(.text+0x0): first defined here",
     ["main 関数を定義しない"], ["harness"]),
    ("未定義関数",
     "/usr/bin/ld: /sandbox/harness.o: in function `main':\nharness.c:(.text+0x2d): undefined reference to `max2'\n"
     "collect2: error: ld returned 1 exit status",
     ["max2", "定義されていません"], ["harness", "collect2"]),
    ("複数の未定義", "undefined reference to `f'\nundefined reference to `g'\nundefined reference to `f'",
     ["f, g"], []),
    ("ハーネス内ヘルパーとの衝突",
     "multiple definition of `helper'; first defined here", ["helper", "重複"], []),
    ("その他", "ld: something odd", ["リンクに失敗しました"], ["something odd"]),
]


def run() -> int:
    failed = 0
    for name, stderr, must, must_not in CASES:
        out = _explain_link_error(stderr)
        ok = all(m in out for m in must) and not any(m in out for m in must_not)
        print(("OK  " if ok else "FAIL"), name)
        if not ok:
            failed += 1
            print("    ", out)
    print("failed:", failed)
    return failed


if __name__ == "__main__":
    raise SystemExit(1 if run() else 0)
