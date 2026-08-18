// 'server-only'을 붙이지 않는다 — 이 모듈은 서버 전용 API를 직접 쓰지 않고
// DB 클라이언트를 인자로 받기만 해서, 판정 로직을 그대로 테스트할 수 있어야 한다.
import type { createServiceClient } from '@/lib/supabase/server'

// AI 크롤러 방문 계측 — "AI가 우리 글을 읽어갔다"를 세는 곳.
//
// 왜 따로 세나: AI 검색 답변에 인용되려면 먼저 크롤러가 우리 글을 읽어가야 한다.
// 노출률(인용됐는가)은 몇 주씩 0에 머무를 수 있지만 크롤러 방문은 그전부터 쌓이므로,
// 사장님이 "되고 있다"를 눈으로 확인할 수 있는 유일한 선행 지표다.
//
// 그리고 지금까지 봇 방문이 사람 방문(page_views)에 섞여 들어가고 있었다.
// ai_claude 33건처럼 잡힌 숫자가 사람이 클로드에서 눌러 들어온 건지 ClaudeBot이
// 긁어간 건지 구분이 안 됐다. 이제 봇은 여기로, 사람만 page_views로 보낸다.

/** 봇 코드 — 화면 표시명은 CRAWLER_LABELS 참고 */
export type CrawlerBot = 'chatgpt' | 'perplexity' | 'claude' | 'google_ai' | 'bing_ai' | 'other_ai'

export const CRAWLER_LABELS: Record<CrawlerBot, string> = {
  chatgpt: 'ChatGPT',
  perplexity: 'Perplexity',
  claude: 'Claude',
  google_ai: 'Gemini',
  bing_ai: 'Copilot',
  other_ai: '기타 AI',
}

// User-Agent 조각 → 봇 코드. 긴 이름을 먼저 둬 부분 매칭 오류를 막는다.
const UA_RULES: { needle: string; bot: CrawlerBot }[] = [
  // OpenAI — GPTBot(학습·색인), OAI-SearchBot(검색 색인), ChatGPT-User(사용자가 물어서 즉시 방문)
  { needle: 'oai-searchbot', bot: 'chatgpt' },
  { needle: 'chatgpt-user', bot: 'chatgpt' },
  { needle: 'gptbot', bot: 'chatgpt' },
  // Perplexity
  { needle: 'perplexity-user', bot: 'perplexity' },
  { needle: 'perplexitybot', bot: 'perplexity' },
  // Anthropic
  { needle: 'claude-searchbot', bot: 'claude' },
  { needle: 'claude-user', bot: 'claude' },
  { needle: 'claudebot', bot: 'claude' },
  { needle: 'anthropic-ai', bot: 'claude' },
  // Google — Gemini 응답 근거 수집용
  { needle: 'google-extended', bot: 'google_ai' },
  { needle: 'google-cloudvertexbot', bot: 'google_ai' },
  // Microsoft Copilot
  { needle: 'bingbot', bot: 'bing_ai' },
  { needle: 'msnbot', bot: 'bing_ai' },
  // 그 밖의 AI 수집기
  { needle: 'youbot', bot: 'other_ai' },
  { needle: 'ccbot', bot: 'other_ai' },
  { needle: 'applebot-extended', bot: 'other_ai' },
  { needle: 'meta-externalagent', bot: 'other_ai' },
  { needle: 'bytespider', bot: 'other_ai' },
]

/** User-Agent가 AI 크롤러면 봇 코드를, 아니면 null을 돌려준다. */
export function detectAiCrawler(userAgent: string | null | undefined): CrawlerBot | null {
  const ua = (userAgent ?? '').toLowerCase()
  if (!ua) return null
  for (const rule of UA_RULES) {
    if (ua.includes(rule.needle)) return rule.bot
  }
  return null
}

/** KST 기준 오늘 날짜 'YYYY-MM-DD' — 서버가 UTC라 그냥 toISOString을 쓰면 하루가 밀린다. */
export function kstToday(): string {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

/**
 * AI 크롤러 방문 1회를 기록한다(업체·봇·날짜 단위 누적).
 * 기록 실패가 페이지 렌더를 막지 않도록 예외를 삼킨다.
 */
export async function recordAiCrawlerHit(
  db: ReturnType<typeof createServiceClient>,
  businessId: string,
  bot: CrawlerBot,
): Promise<void> {
  try {
    await db.rpc('record_ai_crawler_hit' as never, {
      p_business_id: businessId,
      p_bot: bot,
      p_date: kstToday(),
    } as never)
  } catch (error) {
    console.error('[AiCrawler] 기록 실패:', error)
  }
}
