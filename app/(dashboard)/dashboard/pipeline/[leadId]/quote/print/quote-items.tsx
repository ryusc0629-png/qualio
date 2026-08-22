import type { QuoteItem } from './quote-doc-types'

// 항목 표 — 견적서와 청구서가 같은 표를 쓴다.
// (따로 그리면 한쪽만 고쳐져 같은 견적서인데 견적서와 청구서의 내역이 달라 보인다)

interface Props {
  items: QuoteItem[]
  /** 횟수 열 제목 — 정기는 '횟수', 일회성은 단위에 맞춰 '개월'·'수량' 등 */
  countLabel: string
  showCountCol: boolean
  showUnitPriceCol: boolean
  /** 한 줄 금액 — 정기는 월정액(단가), 일회성은 수량×단가 */
  lineTotal: (item: QuoteItem) => number
}

export function QuoteItemsTable({ items, countLabel, showCountCol, showUnitPriceCol, lineTotal }: Props) {
  return (
    <>
      {/* 모바일: 한 항목씩 쌓아 보여주는 목록
          좁은 화면에서 표를 쓰면 '서비스 내용' 칸이 한 글자 폭까지 눌려 글자가 세로로 쌓인다.
          그래서 폰에서는 표를 버리고 '이름 / 조건 / 금액' 세 줄 구조로 보여준다. */}
      <div className="mb-6 divide-y rounded-lg border sm:hidden print:hidden">
        {items.map((item, idx) => (
          <div key={idx} className="flex items-start justify-between gap-3 p-3">
            <div className="min-w-0 flex-1">
              {/* 표의 No. 열과 같은 번호 — 폰에서도 몇 번째 항목인지 웹과 똑같이 셀 수 있게 */}
              <p className="font-semibold break-keep">
                <span className="mr-1 font-normal text-gray-400">{idx + 1}.</span>
                {item.name}
              </p>
              {/* 표의 열 제목(단위·횟수·단가)이 없는 화면이라 값 앞에 이름을 붙인다.
                  그냥 '주'만 있으면 숫자가 빠진 것처럼 보임 */}
              <p className="mt-0.5 text-xs text-gray-500">
                {[
                  item.unit ? `단위 ${item.unit}` : null,
                  showCountCol ? `${countLabel} ${item.qty}` : null,
                  showUnitPriceCol ? `단가 ${item.unit_price.toLocaleString()}원` : null,
                ].filter(Boolean).join(' · ')}
              </p>
            </div>
            <p className="shrink-0 font-bold tabular-nums">{lineTotal(item).toLocaleString()}원</p>
          </div>
        ))}
      </div>

      {/* 데스크탑·인쇄(A4)에서만. 인쇄물은 기존 서식을 그대로 유지한다 */}
      <table className="hidden w-full border-collapse mb-6 text-sm sm:table print:table">
        <thead>
          <tr className="bg-gray-800 text-white">
            <th className="py-2.5 px-3 text-left font-medium w-8">No.</th>
            <th className="py-2.5 px-3 text-left font-medium">서비스 내용</th>
            <th className="py-2.5 px-3 text-center font-medium w-16">단위</th>
            {showCountCol && <th className="py-2.5 px-3 text-center font-medium w-16">{countLabel}</th>}
            {showUnitPriceCol && <th className="py-2.5 px-3 text-right font-medium w-28">단가</th>}
            <th className="py-2.5 px-3 text-right font-medium w-28">금액</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, idx) => (
            <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
              <td className="py-2.5 px-3 text-gray-500">{idx + 1}</td>
              <td className="py-2.5 px-3 font-medium">{item.name}</td>
              <td className="py-2.5 px-3 text-center text-gray-600">{item.unit}</td>
              {showCountCol && <td className="py-2.5 px-3 text-center">{item.qty}</td>}
              {showUnitPriceCol && <td className="py-2.5 px-3 text-right tabular-nums">{item.unit_price.toLocaleString()}</td>}
              <td className="py-2.5 px-3 text-right tabular-nums font-medium">{lineTotal(item).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}
