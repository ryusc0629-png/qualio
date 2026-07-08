'use client'

import { useEffect, useRef, useState } from 'react'
import { MessageCircle, X, Send, ArrowRight } from 'lucide-react'
import { ScrollLock } from '@/lib/hooks/use-scroll-lock'

interface Props {
  businessId: string
  businessName: string
}

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

// AI가 실수로 넣은 마크다운 기호 제거 (일반 텍스트로 렌더링하므로 별표가 그대로 보임 방지)
function stripMarkdown(t: string): string {
  return t
    .replace(/\*\*(.+?)\*\*/g, '$1') // **굵게** → 굵게
    .replace(/\*\*/g, '') // 짝 안 맞는 남은 별표
    .replace(/__(.+?)__/g, '$1') // __굵게__ → 굵게
    .replace(/^\s*[-*]\s+/gm, '') // 줄머리 목록 기호
    .replace(/^#{1,6}\s+/gm, '') // 헤딩 기호
}

// 처음 열었을 때 보여줄 추천 질문 — 하나는 일부러 '가격' 질문(견적 폼 유도 시연)
const SUGGESTIONS = [
  '입주청소는 뭐가 포함되나요?',
  '우리 집은 얼마 정도 나올까요?',
  '곰팡이도 제거되나요?',
  '언제 예약 가능해요?',
]

// 고객용 AI 상담 위젯 — 견적 페이지 우하단에 떠 있는 채팅
export function QuoteChatWidget({ businessId, businessName }: Props) {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)

  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // 새 메시지/토큰마다 맨 아래로 스크롤
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, streaming])

  // 열리면 입력창에 포커스
  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  async function send(text: string) {
    const trimmed = text.trim()
    if (!trimmed || streaming) return

    const nextMessages: ChatMessage[] = [...messages, { role: 'user', content: trimmed }]
    setMessages(nextMessages)
    setInput('')
    setStreaming(true)

    try {
      const res = await fetch(`/api/chat/${businessId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: nextMessages }),
      })

      if (!res.ok || !res.body) {
        throw new Error('response not ok')
      }

      // 빈 어시스턴트 말풍선을 먼저 넣고, 토큰이 올 때마다 채운다
      setMessages((prev) => [...prev, { role: 'assistant', content: '' }])

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let acc = ''

      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        acc += decoder.decode(value, { stream: true })
        setMessages((prev) => {
          const copy = [...prev]
          copy[copy.length - 1] = { role: 'assistant', content: acc }
          return copy
        })
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: '앗, 연결이 잠깐 끊겼어요. 다시 한 번 물어봐 주세요.' },
      ])
    } finally {
      setStreaming(false)
      inputRef.current?.focus()
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Enter 전송, Shift+Enter 줄바꿈
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      send(input)
    }
  }

  // 간편 견적으로 이동 — 상담창 닫고 페이지 맨 위(견적 폼)로 스크롤
  function goToQuoteForm() {
    setOpen(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const isEmpty = messages.length === 0

  return (
    <>
      {/* 닫혀 있을 때: 플로팅 런처 버튼 */}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed bottom-4 right-4 z-40 flex h-14 items-center gap-2 rounded-full bg-emerald-600 pl-4 pr-5 text-white shadow-lg shadow-emerald-600/30 transition hover:bg-emerald-700 active:scale-95"
          aria-label="상담 시작하기"
        >
          <MessageCircle className="h-6 w-6" />
          <span className="text-sm font-semibold">무엇이든 물어보세요</span>
        </button>
      )}

      {/* 열려 있을 때: 채팅 패널 (모바일 전체화면 / 데스크탑 우하단 카드) */}
      {open && (
        <div className="fixed inset-0 z-50 sm:inset-auto sm:bottom-4 sm:right-4">
          <ScrollLock />
          {/* 포커스는 아래 useEffect에서 입력창(textarea)에 준다.
              컨테이너에 인라인 ref로 focus를 걸면 리렌더마다 포커스를 뺏어가
              한글 입력이 중단되므로 여기서는 focus를 걸지 않는다. */}
          <div className="flex h-full w-full flex-col bg-white sm:h-[600px] sm:max-h-[80vh] sm:w-[380px] sm:rounded-2xl sm:border sm:shadow-2xl">
            {/* 헤더 */}
            <div className="flex items-center justify-between border-b bg-emerald-600 px-4 py-3 text-white sm:rounded-t-2xl">
              <div className="min-w-0">
                <p className="truncate text-sm font-bold">{businessName}</p>
                <p className="flex items-center gap-1.5 text-xs text-emerald-100">
                  <span className="inline-block h-2 w-2 rounded-full bg-emerald-300" />
                  실시간 상담
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-full p-1.5 transition hover:bg-white/20"
                aria-label="상담창 닫기"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* 메시지 영역 */}
            <div
              ref={scrollRef}
              className="flex-1 space-y-3 overflow-y-auto overscroll-contain bg-gray-50 p-4"
            >
              {isEmpty ? (
                <div className="space-y-4">
                  <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-white px-4 py-3 text-sm text-gray-700 shadow-sm">
                    안녕하세요! 궁금한 점을 편하게 물어봐 주세요. 서비스·가격·예약 무엇이든 도와드릴게요 😊
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {SUGGESTIONS.map((q) => (
                      <button
                        key={q}
                        type="button"
                        onClick={() => send(q)}
                        className="rounded-full border border-emerald-200 bg-white px-3 py-2 text-xs font-medium text-emerald-700 transition hover:bg-emerald-50 active:scale-95"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                messages.map((m, i) => {
                  // 마지막 어시스턴트 말풍선이 스트리밍 중이면 커서를 붙인다
                  const streamingThis =
                    streaming && m.role === 'assistant' && i === messages.length - 1
                  return (
                    <div
                      key={i}
                      // 말풍선 등장 모션 — 아래에서 부드럽게 떠오르며 페이드인
                      className={`animate-in fade-in slide-in-from-bottom-2 duration-300 ${
                        m.role === 'user' ? 'flex justify-end' : 'flex justify-start'
                      }`}
                    >
                      <div
                        className={
                          m.role === 'user'
                            ? 'max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-tr-sm bg-emerald-600 px-4 py-2.5 text-sm text-white'
                            : 'max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-tl-sm bg-white px-4 py-2.5 text-sm text-gray-700 shadow-sm'
                        }
                      >
                        {m.content ? (
                          <>
                            {m.content}
                            {streamingThis && (
                              // 작성 중 — 깜빡이는 커서
                              <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-gray-400 align-text-bottom" />
                            )}
                          </>
                        ) : (
                          // 아직 첫 토큰 전 — 타이핑 점 애니메이션
                          <span className="inline-flex gap-1 py-1">
                            <span className="h-2 w-2 animate-bounce rounded-full bg-gray-300 [animation-delay:-0.3s]" />
                            <span className="h-2 w-2 animate-bounce rounded-full bg-gray-300 [animation-delay:-0.15s]" />
                            <span className="h-2 w-2 animate-bounce rounded-full bg-gray-300" />
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })
              )}
            </div>

            {/* 하단: 간편 견적 유도 + 입력창 */}
            <div className="border-t bg-white p-3 sm:rounded-b-2xl">
              <button
                type="button"
                onClick={goToQuoteForm}
                className="mb-2 flex w-full items-center justify-center gap-1 rounded-lg bg-emerald-50 py-2.5 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100"
              >
                간편 견적 받기 <ArrowRight className="h-4 w-4" />
              </button>
              <div className="flex items-end gap-2">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  rows={1}
                  placeholder="메시지를 입력하세요"
                  className="max-h-24 flex-1 resize-none rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-400"
                />
                <button
                  type="button"
                  onClick={() => send(input)}
                  disabled={!input.trim() || streaming}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white transition hover:bg-emerald-700 active:scale-95 disabled:opacity-40"
                  aria-label="보내기"
                >
                  <Send className="h-5 w-5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
