import type { SupabaseClient } from '@supabase/supabase-js'

// 광고 문자 수신 동의·거부는 전화번호 하나로 판단한다.
//
// 왜 한 곳에 모으나: 견적 폼에서 동의를 받고, 문자 하단 링크로 거부를 받고,
// 발송 직전에 둘 다 확인한다. 세 지점이 각자 판단하면 언젠가 하나가 어긋나
// "거부했는데 또 왔다"가 된다. 판단은 이 파일에서만 한다.

const digits = (phone: string) => phone.replace(/[^0-9]/g, '')

/** 견적 폼 등에서 손님이 '받아볼게요'를 고른 경우에만 부른다 */
export async function recordMarketingConsent(
  db: SupabaseClient,
  businessId: string,
  phone: string,
  source = 'quote_form',
): Promise<void> {
  const p = digits(phone)
  if (!p) return

  const { error } = await db
    .from('marketing_consents')
    .upsert({ business_id: businessId, phone: p, source }, { onConflict: 'business_id,phone' })

  // 동의 기록 실패가 견적 접수를 막으면 안 된다 — 견적이 훨씬 중요하다.
  // 기록이 없으면 안내 문자를 안 보낼 뿐이라 손해가 한쪽으로만 난다(안전한 실패).
  if (error) console.error('[Marketing] 수신 동의 기록 실패:', error)
}

/** 이 번호로 광고 문자를 보내도 되는지. 거부가 있으면 동의가 있어도 안 된다. */
export async function canSendMarketingSms(
  db: SupabaseClient,
  businessId: string,
  phone: string,
): Promise<boolean> {
  const p = digits(phone)
  if (!p) return false

  const [{ data: optout }, { data: consent }] = await Promise.all([
    db.from('marketing_optouts').select('id').eq('business_id', businessId).eq('phone', p).maybeSingle(),
    db.from('marketing_consents').select('id').eq('business_id', businessId).eq('phone', p).maybeSingle(),
  ])

  if (optout) return false
  return !!consent
}
