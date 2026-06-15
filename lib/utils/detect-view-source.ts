// GEO 포스트 조회 유입 소스 감지
// referrer URL + User-Agent로 AI 검색엔진 vs 일반 검색 vs 직접 방문 구분

export type ViewSource =
  | 'ai_perplexity'
  | 'ai_chatgpt'
  | 'ai_claude'
  | 'ai_you'
  | 'google'
  | 'naver'
  | 'daum'
  | 'direct'
  | 'other'

export function detectViewSource(referer: string, userAgent: string): ViewSource {
  const ua = userAgent.toLowerCase()

  // AI 크롤러 User-Agent 우선 감지 (JS 미실행 봇 포착)
  if (ua.includes('perplexitybot') || ua.includes('perplexity-user')) return 'ai_perplexity'
  if (ua.includes('gptbot') || ua.includes('chatgpt-user')) return 'ai_chatgpt'
  if (ua.includes('claudebot') || ua.includes('anthropic-ai')) return 'ai_claude'
  if (ua.includes('youbot')) return 'ai_you'

  // Referrer 기반 감지 (실사용자 클릭 유입)
  let hostname = ''
  try {
    hostname = new URL(referer).hostname.toLowerCase()
  } catch {
    // referer가 없거나 파싱 불가 → direct
    return 'direct'
  }

  if (!hostname) return 'direct'

  if (hostname.includes('perplexity.ai')) return 'ai_perplexity'
  if (hostname.includes('chatgpt.com') || hostname.includes('chat.openai.com')) return 'ai_chatgpt'
  if (hostname.includes('claude.ai')) return 'ai_claude'
  if (hostname.includes('you.com')) return 'ai_you'

  if (hostname.includes('google.')) return 'google'
  if (hostname.includes('naver.com')) return 'naver'
  if (hostname.includes('daum.net') || hostname.includes('kakao.com')) return 'daum'

  return 'other'
}

// 대시보드 표시용 소스 레이블
export const SOURCE_LABELS: Record<ViewSource, string> = {
  ai_perplexity: 'Perplexity AI',
  ai_chatgpt:    'ChatGPT',
  ai_claude:     'Claude AI',
  ai_you:        'You.com',
  google:        '구글 검색',
  naver:         '네이버 검색',
  daum:          '다음/카카오',
  direct:        '직접 방문',
  other:         '기타',
}

// AI 소스 여부 판별
export function isAiSource(source: string): boolean {
  return source.startsWith('ai_')
}
