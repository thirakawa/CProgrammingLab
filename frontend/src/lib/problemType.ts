import type { Problem, ProblemType } from '@/lib/api'

/** 問題タイプ・初期コード・採点用ハーネスの入力フォーム（問題の作成・編集で共用） */
export interface TypeForm {
  problem_type: ProblemType
  template_code: string
  harness_code: string
}

export const emptyTypeForm = (): TypeForm => ({ problem_type: 'program', template_code: '', harness_code: '' })

export const typeFormFromProblem = (p: Problem): TypeForm => ({
  problem_type: p.problem_type ?? 'program',
  template_code: p.template_code ?? '',
  harness_code: p.harness_code ?? '',
})

export function validateTypeForm(f: TypeForm): string | null {
  if (f.problem_type === 'function') {
    if (!f.harness_code.trim()) return '関数定義型の問題には採点用ハーネス（main関数を含むCコード）が必要です'
    if (!/\bmain\s*\(/.test(f.harness_code)) return '採点用ハーネスに main 関数が見つかりません'
  }
  return null
}

export const typeFormToPayload = (f: TypeForm) => ({
  problem_type: f.problem_type,
  template_code: f.template_code.trim() ? f.template_code : null,
  harness_code: f.harness_code.trim() ? f.harness_code : null,
})

export const PROBLEM_TYPE_LABEL: Record<ProblemType, string> = {
  program: 'プログラム作成型',
  function: '関数定義型',
}

export const HARNESS_EXAMPLE = `#include <stdio.h>

int max2(int a, int b);   // 学生に定義させる関数のプロトタイプ

int main(void) {
    int a, b;
    scanf("%d %d", &a, &b);
    printf("%d\\n", max2(a, b));   // 結果を表示（期待出力はテストケースに書く）
    return 0;
}
`
