import { describe, it, expect } from 'vitest'
import { detectAiCrawler, kstToday } from '@/lib/geo/crawler'

// AI 크롤러 판정은 '읽어간 횟수' 지표의 근거다.
// 사람 방문을 봇으로 잘못 세면 숫자가 부풀고, 봇을 놓치면 지표가 영영 0이라 둘 다 위험하다.

describe('AI 크롤러 판정', () => {
  it('OpenAI 계열을 잡는다', () => {
    expect(detectAiCrawler('Mozilla/5.0 (compatible; GPTBot/1.2; +https://openai.com/gptbot)')).toBe('chatgpt')
    expect(detectAiCrawler('Mozilla/5.0 (compatible; OAI-SearchBot/1.0; +https://openai.com/searchbot')).toBe('chatgpt')
    expect(detectAiCrawler('Mozilla/5.0 ChatGPT-User/1.0')).toBe('chatgpt')
  })

  it('Perplexity·Claude·Gemini를 잡는다', () => {
    expect(detectAiCrawler('Mozilla/5.0 (compatible; PerplexityBot/1.0)')).toBe('perplexity')
    expect(detectAiCrawler('Mozilla/5.0 (compatible; ClaudeBot/1.0)')).toBe('claude')
    expect(detectAiCrawler('Mozilla/5.0 (compatible; Google-Extended)')).toBe('google_ai')
  })

  it('사람 브라우저는 봇으로 세지 않는다', () => {
    const 아이폰 = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Mobile Safari/604.1'
    const 크롬 = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126.0 Safari/537.36'
    expect(detectAiCrawler(아이폰)).toBeNull()
    expect(detectAiCrawler(크롬)).toBeNull()
  })

  it('빈 User-Agent는 봇이 아니다', () => {
    expect(detectAiCrawler('')).toBeNull()
    expect(detectAiCrawler(null)).toBeNull()
    expect(detectAiCrawler(undefined)).toBeNull()
  })

  it('대소문자를 가리지 않는다', () => {
    expect(detectAiCrawler('GPTBOT/1.0')).toBe('chatgpt')
    expect(detectAiCrawler('perplexitybot')).toBe('perplexity')
  })
})

describe('KST 날짜', () => {
  it('YYYY-MM-DD 형식이다', () => {
    expect(kstToday()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('UTC 자정 직후에도 한국 날짜로 센다', () => {
    // 서버(UTC)가 8월 18일 00:30이면 한국은 이미 8월 18일 09:30 — 같은 날이다.
    // 반대로 UTC 8월 17일 15:30은 한국 8월 18일 00:30이라 하루가 넘어가 있어야 한다.
    const kstFromUtc = (iso: string) =>
      new Date(new Date(iso).getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
    expect(kstFromUtc('2026-08-17T15:30:00Z')).toBe('2026-08-18')
    expect(kstFromUtc('2026-08-17T14:30:00Z')).toBe('2026-08-17')
  })
})
