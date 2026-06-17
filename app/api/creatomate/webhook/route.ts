import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

interface CreatomateWebhookPayload {
  id: string
  status: 'succeeded' | 'failed'
  url?: string
}

export async function POST(req: NextRequest) {
  const payload = await req.json() as CreatomateWebhookPayload

  if (!payload.id) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
  }

  const db = createServiceClient()

  if (payload.status === 'succeeded' && payload.url) {
    await db
      .from('reports')
      .update({ reel_status: 'done', reel_url: payload.url } as never)
      .eq('reel_render_id' as never, payload.id)
  } else if (payload.status === 'failed') {
    await db
      .from('reports')
      .update({ reel_status: 'failed' } as never)
      .eq('reel_render_id' as never, payload.id)
  }

  return NextResponse.json({ ok: true })
}
