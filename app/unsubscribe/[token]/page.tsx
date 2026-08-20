import { createServiceClient } from '@/lib/supabase/server'
import { readOptOutToken } from '@/lib/reengagement/optout-token'
import { CheckCircle2, XCircle } from 'lucide-react'

// 광고 문자 하단의 '무료수신거부' 링크가 열리는 화면.
//
// 정보통신망법상 수신거부는 '무료로, 쉽게' 되어야 한다. 그래서 로그인도 확인 버튼도 없이
// 링크를 여는 즉시 처리하고 결과만 보여준다. 문자를 받은 사람이 우리 고객 목록에 없을 수도 있어
// 거부 기록은 전화번호 기준(marketing_optouts)으로 남긴다.

export const dynamic = 'force-dynamic'

export default async function UnsubscribePage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const parsed = readOptOutToken(token)

  let ok = false
  let businessName = ''

  if (parsed) {
    const db = createServiceClient()

    const { data: biz } = await db
      .from('businesses')
      .select('name')
      .eq('id', parsed.businessId)
      .maybeSingle()
    businessName = biz?.name ?? ''

    const { error } = await db
      .from('marketing_optouts' as never)
      .upsert(
        { business_id: parsed.businessId, phone: parsed.phone } as never,
        { onConflict: 'business_id,phone' } as never,
      )

    if (error) {
      console.error('[Unsubscribe] 수신거부 저장 실패:', error)
    } else {
      ok = true
      // 예약된 광고 문자도 함께 멈춘다 — 거부했는데 다음 주에 또 가면 안 된다
      await db
        .from('reengagement_dispatches' as never)
        .update({ status: 'skipped', fail_reason: '고객 수신거부' } as never)
        .eq('business_id' as never, parsed.businessId)
        .eq('customer_phone' as never, parsed.phone)
        .in('status' as never, ['pending', 'scheduled'])
    }
  }

  return (
    <main className="min-h-dvh flex items-center justify-center bg-muted/30 p-6">
      <div className="w-full max-w-sm rounded-2xl bg-white border p-6 text-center space-y-3">
        {ok ? (
          <>
            <CheckCircle2 className="h-10 w-10 text-emerald-600 mx-auto" />
            <h1 className="text-lg font-bold">수신거부가 처리됐어요</h1>
            <p className="text-sm text-muted-foreground">
              {businessName ? `${businessName}에서 ` : ''}보내는 광고 문자를 앞으로 받지 않습니다.
              <br />
              예약·작업 안내 같은 꼭 필요한 연락은 그대로 갑니다.
            </p>
          </>
        ) : (
          <>
            <XCircle className="h-10 w-10 text-muted-foreground mx-auto" />
            <h1 className="text-lg font-bold">처리하지 못했어요</h1>
            <p className="text-sm text-muted-foreground">
              주소가 잘못됐거나 오래된 링크예요. 받으신 문자의 링크를 다시 눌러주세요.
            </p>
          </>
        )}
      </div>
    </main>
  )
}
