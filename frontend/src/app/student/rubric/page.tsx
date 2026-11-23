export default function RubricPage() {
  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold mb-6">採点基準</h1>

      {/* 概要 */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-base font-semibold mb-3">概要</h2>
        <p className="text-sm text-gray-700 leading-relaxed">
          各課題は <span className="font-semibold">100点満点</span> で採点されます。
          点数は「正解点」「全問正解ボーナス」「時間点」の合計から、コード制約違反やコンパイル警告による減点を引いた値です。
          最低点は <span className="font-semibold">0点</span>（減点によってマイナスにはなりません）。
        </p>

        <div className="mt-4 grid grid-cols-3 gap-3 text-center text-sm">
          <div className="bg-blue-50 rounded-lg p-3">
            <div className="text-2xl font-bold text-blue-600">50点</div>
            <div className="text-gray-600 mt-1">正解点</div>
          </div>
          <div className="bg-green-50 rounded-lg p-3">
            <div className="text-2xl font-bold text-green-600">20点</div>
            <div className="text-gray-600 mt-1">全問正解ボーナス</div>
          </div>
          <div className="bg-purple-50 rounded-lg p-3">
            <div className="text-2xl font-bold text-purple-600">30点</div>
            <div className="text-gray-600 mt-1">時間点</div>
          </div>
        </div>
      </div>

      {/* 各項目の詳細 */}
      <div className="bg-white rounded-lg shadow p-6 mb-6 space-y-5">
        <h2 className="text-base font-semibold">各項目の詳細</h2>

        {/* 正解点 */}
        <div>
          <div className="flex items-baseline gap-2 mb-1">
            <span className="font-semibold text-sm">正解点</span>
            <span className="text-blue-600 font-bold text-sm">最大 50点</span>
          </div>
          <p className="text-sm text-gray-600 leading-relaxed">
            非公開テストケースに正解した数に応じて加算されます。
            テストケースが <em>N</em> 件ある場合、1件正解するごとに <em>50 ÷ N</em> 点が加算されます。
          </p>
          <div className="mt-2 bg-gray-50 rounded p-3 text-xs text-gray-500">
            例：テストケース 5件 → 1件あたり 10点。3件正解で 30点。
          </div>
        </div>

        <hr />

        {/* 全問正解ボーナス */}
        <div>
          <div className="flex items-baseline gap-2 mb-1">
            <span className="font-semibold text-sm">全問正解ボーナス</span>
            <span className="text-green-600 font-bold text-sm">20点</span>
          </div>
          <p className="text-sm text-gray-600 leading-relaxed">
            すべてのテストケースに合格した場合のみ加算されます。1件でも不正解があると加算されません。
          </p>
        </div>

        <hr />

        {/* 時間点 */}
        <div>
          <div className="flex items-baseline gap-2 mb-1">
            <span className="font-semibold text-sm">時間点</span>
            <span className="text-purple-600 font-bold text-sm">最大 30点</span>
          </div>
          <p className="text-sm text-gray-600 leading-relaxed">
            課題の「開始する」ボタンを押した時刻から、提出完了までの経過時間に応じて決まります。
            <span className="font-semibold">3分経過するごとに 1点減点</span>され、90分以上経過すると 0点になります。
          </p>
          <div className="mt-2 bg-gray-50 rounded p-3 text-xs text-gray-500 space-y-0.5">
            <div>開始直後〜3分未満：30点</div>
            <div>3分〜6分未満：29点</div>
            <div>6分〜9分未満：28点</div>
            <div className="text-gray-400">…（3分ごとに 1点減点）…</div>
            <div>87分〜90分未満：1点</div>
            <div>90分以上：0点</div>
          </div>
          <p className="text-xs text-gray-400 mt-2">
            ※ 時間は教員が設定した課題の公開時刻ではなく、あなたが「開始する」を押した時刻から計測されます。
          </p>
        </div>
      </div>

      {/* 減点項目 */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-base font-semibold mb-3">減点項目</h2>
        <p className="text-sm text-gray-600 mb-4">
          以下の条件に該当する場合、合計点から減点されます。複数該当する場合はすべて適用されます。
          ただし、最終的な点数は <span className="font-semibold">0点未満にはなりません</span>。
        </p>

        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-3 py-2">条件</th>
              <th className="text-right px-3 py-2 text-red-500">減点</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            <tr>
              <td className="px-3 py-2 text-gray-700">コンパイル時に警告が出た</td>
              <td className="px-3 py-2 text-right text-red-500 font-semibold">−20点</td>
            </tr>
            <tr>
              <td className="px-3 py-2 text-gray-700">
                使用した変数の数が指定の範囲から外れた（上限超過・下限不足）
                <span className="ml-1 text-xs text-gray-400">※問題に制約がある場合のみ</span>
              </td>
              <td className="px-3 py-2 text-right text-red-500 font-semibold">−20点</td>
            </tr>
            <tr>
              <td className="px-3 py-2 text-gray-700">
                使用した配列の数が指定の範囲から外れた（上限超過・下限不足）
                <span className="ml-1 text-xs text-gray-400">※問題に制約がある場合のみ</span>
              </td>
              <td className="px-3 py-2 text-right text-red-500 font-semibold">−20点</td>
            </tr>
            <tr>
              <td className="px-3 py-2 text-gray-700">
                使用したポインタの数が指定の範囲から外れた（上限超過・下限不足）
                <span className="ml-1 text-xs text-gray-400">※問題に制約がある場合のみ</span>
              </td>
              <td className="px-3 py-2 text-right text-red-500 font-semibold">−20点</td>
            </tr>
            <tr>
              <td className="px-3 py-2 text-gray-700">
                使用したループ文（for・while）の数が指定の範囲から外れた（上限超過・下限不足）
                <span className="ml-1 text-xs text-gray-400">※問題に制約がある場合のみ</span>
              </td>
              <td className="px-3 py-2 text-right text-red-500 font-semibold">−10点</td>
            </tr>
            <tr>
              <td className="px-3 py-2 text-gray-700">
                使用した if 文の数が指定の範囲から外れた（上限超過・下限不足）
                <span className="ml-1 text-xs text-gray-400">※問題に制約がある場合のみ</span>
              </td>
              <td className="px-3 py-2 text-right text-red-500 font-semibold">−10点</td>
            </tr>
          </tbody>
        </table>

        <div className="text-xs text-gray-500 mt-3 space-y-1">
          <p>
            コード制約（変数・配列・ポインタ・ループ・if 文の下限数・上限数）は問題ごとに異なります。
            制約がない項目については減点されません。制約の有無と範囲（例：「変数：2個以上5個以下」）は、各課題の問題文に記載されています。
          </p>
          <p>
            上限を超えた場合は、いずれの問題でも上記のとおり減点されます。
            下限に満たない場合は、問題の設定により「減点」または「提出を受け付けない」のどちらかになります。
            提出を受け付けない場合は、コンパイルが通った後に検出数と不足数が表示され、提出回数・時間点には影響しません（修正して再度提出してください）。
          </p>
          <p>
            数える対象は、変数・配列・ポインタの宣言（for 文の中の <code>int i</code> も含む）です。
            関数の仮引数・構造体のメンバ・関数プロトタイプは数えません。
            <code>int *a[3]</code> は配列とポインタの両方に数えます。
            採点結果・サンプル実行結果には、検出された宣言の一覧が表示されます。
          </p>
        </div>
      </div>

      {/* 計算例 */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-base font-semibold mb-3">計算例</h2>
        <div className="space-y-4 text-sm">

          <div className="border rounded-lg p-4">
            <div className="font-medium mb-2 text-green-700">例 1：全問正解・開始から 10 分で提出・制約違反なし</div>
            <div className="space-y-1 text-gray-600">
              <div className="flex justify-between"><span>正解点（5/5 正解）</span><span>+50点</span></div>
              <div className="flex justify-between"><span>全問正解ボーナス</span><span>+20点</span></div>
              <div className="flex justify-between"><span>時間点（10分 → 30 − 3 = 27点）</span><span>+27点</span></div>
              <div className="border-t mt-1 pt-1 flex justify-between font-semibold">
                <span>合計</span><span>97点</span>
              </div>
            </div>
          </div>

          <div className="border rounded-lg p-4">
            <div className="font-medium mb-2 text-yellow-700">例 2：3/5 正解・開始から 30 分で提出・コンパイル警告あり</div>
            <div className="space-y-1 text-gray-600">
              <div className="flex justify-between"><span>正解点（3/5 正解）</span><span>+30点</span></div>
              <div className="flex justify-between"><span>全問正解ボーナス（未達成）</span><span>+0点</span></div>
              <div className="flex justify-between"><span>時間点（30分 → 30 − 10 = 20点）</span><span>+20点</span></div>
              <div className="flex justify-between text-red-500"><span>コンパイル警告</span><span>−20点</span></div>
              <div className="border-t mt-1 pt-1 flex justify-between font-semibold">
                <span>合計</span><span>30点</span>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
