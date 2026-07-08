import Anthropic from '@anthropic-ai/sdk'
import { createServiceClient } from '@/lib/supabase/server'
import {
  buildConsultSystemPrompt,
  sanitizeMessages,
  type ConsultService,
} from '@/lib/ai/consult-chat'

// 고객용 AI 상담 스트리밍 엔드포인트 — 로그인 불필요
// POST body: { messages: { role, content }[] }
// 응답: text/plain 스트림 (토큰이 도착하는 대로 흘려보냄)

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

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

  const messages = sanitizeMessages((body as { messages?: unknown })?.messages)
  if (messages.length === 0) {
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

  // Claude 응답을 토큰 단위로 흘려보내는 스트림 구성
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const anthropicStream = client.messages.stream({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1024,
          system,
          messages,
        })

        anthropicStream.on('text', (delta) => {
          controller.enqueue(encoder.encode(delta))
        })

        await anthropicStream.finalMessage()
        controller.close()
      } catch (e) {
        console.error('[Consult] 스트리밍 오류:', e)
        // 이미 일부가 나갔을 수 있으므로 짧은 폴백 문구만 덧붙이고 종료
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
