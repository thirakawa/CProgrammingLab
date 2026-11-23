"""旧方式（正規表現）と新方式（code_analyzer）の宣言数カウントを、過去の提出コードで比較する。

DB は読み取り専用で開く（何も書き換えない）。
実行（/app で）:
    python -m scripts.compare_constraint_counts            # 要約のみ
    python -m scripts.compare_constraint_counts --detail   # 差分のある提出を列挙
    python -m scripts.compare_constraint_counts --latest   # 学生×課題ごとの最新提出のみ
"""
import argparse
import re
import sqlite3
import sys
from collections import Counter

from app.code_analyzer import analyze

DB_PATH = "/app/data/cprogramlab.db"

# ---- 旧方式（judge.py から削除した実装のコピー。比較専用） ----
def _strip_comments(code):
    code = re.sub(r'//[^\n]*', '', code)
    code = re.sub(r'/\*.*?\*/', '', code, flags=re.DOTALL)
    code = re.sub(r'"(?:[^"\\]|\\.)*"', '""', code)
    code = re.sub(r"'(?:[^'\\]|\\.)*'", "''", code)
    return code

_C_TYPES = (
    r'(?:(?:unsigned|signed|long|short)\s+)*'
    r'(?:int|char|float|double|void|bool|_Bool|size_t|'
    r'uint8_t|uint16_t|uint32_t|uint64_t|'
    r'int8_t|int16_t|int32_t|int64_t)'
)
_DECL_PAT = re.compile(_C_TYPES + r'\s+([^;{}\n()]+);')


def old_counts(code):
    clean = _strip_comments(code)
    v = a = p = 0
    for m in _DECL_PAT.finditer(clean):
        for part in m.group(1).split(','):
            part = part.split('=')[0].strip()
            if not re.search(r'[a-zA-Z_]\w*', part):
                continue
            if '[' in part:
                a += 1
            elif '*' in part:
                p += 1
            else:
                v += 1
    loops = len(re.findall(r'\b(?:for|while)\b', clean))
    ifs = len(re.findall(r'\bif\b', clean))
    return {"vars": v, "arrays": a, "pointers": p, "loops": loops, "ifs": ifs}


ITEMS = ["vars", "arrays", "pointers", "loops", "ifs"]
LIMIT_COL = {"vars": "max_vars", "arrays": "max_arrays", "pointers": "max_pointers",
             "loops": "max_loops", "ifs": "max_ifs"}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--detail", action="store_true")
    ap.add_argument("--latest", action="store_true")
    ap.add_argument("--db", default=DB_PATH)
    args = ap.parse_args()

    conn = sqlite3.connect(f"file:{args.db}?mode=ro", uri=True)
    conn.row_factory = sqlite3.Row
    q = """SELECT s.id, s.user_id, s.assignment_id, s.problem_id, s.code,
                  p.max_vars, p.max_arrays, p.max_pointers, p.max_loops, p.max_ifs
           FROM submissions s JOIN problems p ON p.id = s.problem_id
           WHERE s.status != 'CE' ORDER BY s.id"""
    rows = conn.execute(q).fetchall()
    if args.latest:
        last = {}
        for r in rows:
            last[(r["user_id"], r["assignment_id"], r["problem_id"])] = r
        rows = list(last.values())

    total = len(rows)
    differ = Counter()
    flipped_to_violation = Counter()   # 旧では違反なし → 新では違反
    flipped_to_ok = Counter()          # 旧では違反 → 新では違反なし
    any_diff = 0
    any_flip = 0
    details = []
    for r in rows:
        old = old_counts(r["code"])
        new_a = analyze(r["code"])
        new = {"vars": new_a.var_count, "arrays": new_a.array_count, "pointers": new_a.pointer_count,
               "loops": new_a.loop_count, "ifs": new_a.if_count}
        d = [k for k in ITEMS if old[k] != new[k]]
        flips = []
        for k in ITEMS:
            lim = r[LIMIT_COL[k]]
            if lim is None:
                continue
            o_v, n_v = old[k] > lim, new[k] > lim
            if not o_v and n_v:
                flipped_to_violation[k] += 1
                flips.append(f"{k}:新たに違反")
            elif o_v and not n_v:
                flipped_to_ok[k] += 1
                flips.append(f"{k}:違反解消")
        for k in d:
            differ[k] += 1
        if d:
            any_diff += 1
        if flips:
            any_flip += 1
        if d and args.detail:
            details.append((r["id"], r["problem_id"], {k: (old[k], new[k]) for k in d}, flips))

    print(f"対象提出数（CE除く{'・最新のみ' if args.latest else ''}）: {total}")
    print(f"カウントに差がある提出: {any_diff} 件 ({any_diff / total * 100:.1f}%)" if total else "提出なし")
    print("項目別の差（旧≠新）:", {k: differ[k] for k in ITEMS})
    print(f"制約判定（上限超過）が変わる提出: {any_flip} 件")
    print("  旧:違反なし → 新:違反:", {k: flipped_to_violation[k] for k in ITEMS if flipped_to_violation[k]})
    print("  旧:違反 → 新:違反なし:", {k: flipped_to_ok[k] for k in ITEMS if flipped_to_ok[k]})
    if args.detail:
        print("\n提出ID  問題ID  差分(旧,新)  判定変化")
        for sid, pid, diff, flips in details:
            print(f"{sid:6d} {pid:6d}  {diff}  {', '.join(flips)}")


if __name__ == "__main__":
    sys.exit(main())
