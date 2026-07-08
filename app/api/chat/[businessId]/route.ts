import Anthropic from '@anthropic-ai/sdk'
import { createServiceClient } from '@/lib/supabase/server'
import { sendPushToBusiness } from '@/lib/push/web-push'
import {
  buildConsultSystemPrompt,
  sanitizeMessages,
  type ConsultService,
} from '@/lib/ai/consult-chat'

// 고객용 AI 상담 스트리밍 엔드포인트 — 로그인 불필요
// POST body: { messages: { role, content }[] }
// 응답: text/plain 스트림 (토큰이 도착하는 대로 흘려보냄)
// 고객이 연락처를 남기면 AI가 register_consultation_lead 도구를 호출 → 리드 등록 + 대표 알림

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// AI가 상담 요청 고객의 연락처를 확보했을 때 호출하는 도구
const CONSULT_TOOLS: Anthropic.Tool[] = [
  {
    name: 'register_consultation_lead',
    description:
      '고객이 직접 상담을 원해 휴대폰 번호를 남겼을 때만 호출한다. 호출하면 잠재고객(리드)으로 등록되고 사장님에게 알림이 간다. 연락처를 아직 받지 못했으면 절대 호출하지 말고 먼저 물어볼 것.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: '고객 성함 (모르면 빈 문자열)' },
        phone: { type: 'string', description: '고객 휴대폰 번호 (예: 010-1234-5678)' },
        reason: { type: 'string', description: '상담이 필요한 내용을 한 문장으로 요약' },
      },
      required: ['phone'],
    },
  },
]

// 상담 요청 고객을 잠재고객(리드)으로 등록하고 대표에게 푸시 알림
async function registerConsultationLead(
  db: ReturnType<typeof createServiceClient>,
  businessId: string,
  input: { name?: string; phone?: string; reason?: string },
): Promise<boolean> {
  // 하이픈·공백 제거해 숫자만 저장 → 표기가 달라도 중복 판별이 일관됨
  const phone = (input.phone ?? '').replace(/[^0-9]/g, '')
  if (phone.length < 9) return false // 유효한 번호가 아니면 등록하지 않음
  const name = (input.name ?? '').trim()
  const reason = (input.reason ?? '').trim()
  const notes = reason ? `[AI 상담] ${reason}` : '[AI 상담] 채팅에서 연락처를 남김'

  // 같은 전화번호 리드가 있으면 갱신, 없으면 신규 등록 (재상담이 사라지지 않게)
  const { data: existing } = await db
    .from('leads')
    .select('id')
    .eq('business_id', businessId)
    .eq('phone', phone)
    .maybeSingle()

  if (existing) {
    const patch: { notes: string; updated_at: string; contact_name?: string } = {
      notes,
      updated_at: new Date().toISOString(),
    }
    if (name) patch.contact_name = name
    await db.from('leads').update(patch).eq('id', existing.id)
  } else {
    await db.from('leads').insert({
      business_id: businessId,
      company_name: name || '상담 요청 고객',
      contact_name: name || null,
      phone,
      customer_type: 'individual',
      status: 'new',
      notes,
    })
  }

  // 대표 폰 알림 — 실패해도 상담 흐름은 끊기지 않게 격리
  try {
    await sendPushToBusiness(businessId, {
      title: '상담 요청이 들어왔어요! 📞',
      body: `${name || '고객'}님 · ${phone}${reason ? ` · ${reason}` : ''}`,
      url: '/dashboard/crm',
      tag: `consult-${phone}`,
    })
  } catch (e) {
    console.error('[Consult] 상담 알림 발송 실패:', e)
  }

  return true
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ businessId: string }> },
) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return new Response('[APP] 상담 기능을 잠시 사용할 수 없어요', { status: 503 })
  }

  const { businessId: raw } = await params
  const idOrSlug = raw.normalize('NFC')

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return new Response('[APP] 잘못된 요청이에요', { status: 400 })
  }

  const clientMessages = sanitizeMessages((body as { messages?: unknown })?.messages)
  if (clientMessages.length === 0) {
    return new Response('[APP] 질문을 입력해주세요', { status: 400 })
  }

  const db = createServiceClient()

  // 업체 + 노출 서비스 조회 (UUID면 id, 아니면 slug) — 견적 페이지와 동일 기준
  const { data: business } = await (UUID_RE.test(idOrSlug)
    ? db.from('businesses').select('id, name, description').eq('id', idOrSlug)
    : db.from('businesses').select('id, name, description').eq('slug', idOrSlug)
  ).maybeSingle()

  if (!business) {
    return new Response('[APP] 업체를 찾을 수 없어요', { status: 404 })
  }

  const { data: services } = await db
    .from('service_items')
    .select('name, base_price, unit, ac_type_prices, unit_prices')
    .eq('business_id', business.id)
    .eq('is_active', true)
    .is('deleted_at', null)
    .order('sort_order')
    .order('created_at')

  const typedServices: ConsultService[] = (services ?? []).map((s) => ({
    name: s.name,
    base_price: s.base_price,
    unit: s.unit,
    ac_type_prices:
      s.ac_type_prices && typeof s.ac_type_prices === 'object' && !Array.isArray(s.ac_type_prices)
        ? (s.ac_type_prices as Record<string, number>)
        : null,
    unit_prices: Array.isArray(s.unit_prices)
      ? (s.unit_prices as Array<{ name: string; price: number; variant?: string }>)
      : null,
  }))

  const system = buildConsultSystemPrompt({
    businessName: business.name,
    businessDescription: business.description,
    services: typedServices,
  })

  const client = new Anthropic({ apiKey })

  // Claude 응답을 토큰 단위로 흘려보내는 스트림 — 도구 호출이 나오면 실행 후 이어서 답변
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const convo: Anthropic.MessageParam[] = clientMessages.map((m) => ({
          role: m.role,
          content: m.content,
        }))
        let registered = false // 이번 요청에서 리드가 등록됐는지

        // 도구 호출 → 실행 → 이어서 답변 루프 (안전 상한 4회)
        for (let round = 0; round < 4; round++) {
          const anthropicStream = client.messages.stream({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 1024,
            system,
            messages: convo,
            tools: CONSULT_TOOLS,
          })

          anthropicStream.on('text', (delta) => {
            controller.enqueue(encoder.encode(delta))
          })

          const final = await anthropicStream.finalMessage()
          if (final.stop_reason !== 'tool_use') break

          // 어시스턴트 턴(도구 호출 포함)을 대화에 추가하고 도구 실행
          convo.push({ role: 'assistant', content: final.content })
          const toolResults: Anthropic.ToolResultBlockParam[] = []
          for (const block of final.content) {
            if (block.type === 'tool_use' && block.name === 'register_consultation_lead') {
              const ok = await registerConsultationLead(
                db,
                business.id,
                block.input as { name?: string; phone?: string; reason?: string },
              )
              if (ok) registered = true
              toolResults.push({
                type: 'tool_result',
                tool_use_id: block.id,
                content: ok ? '등록 완료. 사장님에게 알림을 보냈습니다.' : '연락처가 없어 등록하지 못했습니다.',
              })
            }
          }
          if (toolResults.length === 0) break
          convo.push({ role: 'user', content: toolResults })
        }

        // 안전망: AI가 도구를 안 불렀더라도 사용자 메시지에 휴대폰 번호가 있으면 서버가 직접 등록
        // (AI 도구 호출은 확률적이라 가끔 누락됨 — 리드를 절대 놓치지 않도록)
        if (!registered) {
          const lastUser =
            [...clientMessages].reverse().find((m) => m.role === 'user')?.content ?? ''
          const phoneMatch = lastUser.match(/01[016789][-\s.]?\d{3,4}[-\s.]?\d{4}/)
          if (phoneMatch) {
            const rest = lastUser.replace(phoneMatch[0], ' ')
            const nameMatch = rest.match(/[가-힣]{2,4}/) // 번호를 뺀 나머지에서 한글 이름 추정
            await registerConsultationLead(db, business.id, {
              name: nameMatch?.[0],
              phone: phoneMatch[0],
              reason: '채팅에서 연락처를 남김',
            })
          }
        }

        controller.close()
      } catch (e) {
        console.error('[Consult] 스트리밍 오류:', e)
        controller.enqueue(encoder.encode('\n\n잠시 문제가 있었어요. 다시 시도해주세요.'))
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  })
}
