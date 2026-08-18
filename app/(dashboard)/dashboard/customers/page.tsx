import { redirect } from 'next/navigation'

// 옛 주소(/dashboard/customers) → 고객·거래처 허브로 보낸다.
// 예전엔 ?tab=active를 붙였는데 허브는 tab이 아니라 type(all·individual·company)만 읽어
// 아무 효과 없는 파라미터가 주소창에 남기만 했다. 붙이지 않는 게 곧 '전체' 탭이다.
export default function CustomersPage() {
  redirect('/dashboard/clients')
}
