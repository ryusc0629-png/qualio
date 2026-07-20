// 마크다운(AI가 생성한 채널 원고) → 네이버 블로그 에디터 붙여넣기용 변환기
//
// 왜 필요한가: 모델은 '## 소제목', '**굵게**', '> 인용' 같은 마크다운을 쓰는데
// 네이버 블로그 에디터는 마크다운을 못 읽어 '##'가 글자 그대로 붙어 지저분해진다.
// 그래서 복사 시 클립보드에 서식 있는 HTML(text/html)과 깔끔한 순수텍스트(text/plain)를
// 함께 실어, 네이버가 HTML을 읽으면 소제목·인용구가 자동 적용되고, 못 읽으면 '##'가
// 제거된 순수텍스트로 폴백되게 한다.

// HTML 특수문자 이스케이프 (본문에 <, & 등이 있어도 깨지지 않게)
function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// 인라인 마크다운 → HTML (**굵게**, `코드`)
function inlineToHtml(s: string): string {
  return esc(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`(.+?)`/g, '$1')
}

// 인라인 마크다운 제거 → 순수 텍스트
function inlineToText(s: string): string {
  return s
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/`(.+?)`/g, '$1')
    .trim()
}

/**
 * 마크다운 본문을 { html, text } 두 형식으로 변환.
 * - html: 네이버 에디터가 읽으면 소제목(h3/h4)·인용구(blockquote)·굵게·목록이 실제 서식으로 적용됨
 * - text: 마크다운 기호가 제거된 깔끔한 순수 텍스트 (당근·인스타 및 폴백용)
 */
export function markdownToRich(md: string, title?: string): { html: string; text: string } {
  const lines = (md ?? '').replace(/\r\n/g, '\n').split('\n')

  const htmlBlocks: string[] = []
  const textBlocks: string[] = []

  // 연속된 목록/인용/문단 줄을 모았다가 한 번에 내보내기 위한 버퍼
  let ul: string[] = []          // 순서 없는 목록
  let quote: string[] = []       // 인용구
  let para: string[] = []        // 일반 문단

  const flushUl = () => {
    if (ul.length === 0) return
    htmlBlocks.push(`<ul>${ul.map((t) => `<li>${inlineToHtml(t)}</li>`).join('')}</ul>`)
    textBlocks.push(ul.map((t) => `· ${inlineToText(t)}`).join('\n'))
    ul = []
  }
  const flushQuote = () => {
    if (quote.length === 0) return
    htmlBlocks.push(`<blockquote>${quote.map((t) => inlineToHtml(t)).join('<br>')}</blockquote>`)
    textBlocks.push(quote.map((t) => `❝ ${inlineToText(t)}`).join('\n'))
    quote = []
  }
  const flushPara = () => {
    if (para.length === 0) return
    htmlBlocks.push(`<p>${para.map((t) => inlineToHtml(t)).join('<br>')}</p>`)
    textBlocks.push(para.map((t) => inlineToText(t)).join('\n'))
    para = []
  }
  const flushAll = () => { flushUl(); flushQuote(); flushPara() }

  for (const rawLine of lines) {
    const line = rawLine.trimEnd()
    const trimmed = line.trim()

    // 빈 줄 → 지금까지 모은 블록 마무리 (문단 구분)
    if (trimmed === '') { flushAll(); continue }

    // 소제목 (### / ## / #)
    const h = trimmed.match(/^(#{1,4})\s+(.*)$/)
    if (h) {
      flushAll()
      const level = h[1].length
      const tag = level <= 2 ? 'h3' : 'h4'   // 네이버는 h3/h4가 소제목으로 자연스럽게 매핑됨
      const inner = inlineToText(h[2])
      htmlBlocks.push(`<${tag}>${inlineToHtml(h[2])}</${tag}>`)
      textBlocks.push(inner)   // 순수텍스트에선 기호 없이 한 줄로 (앞뒤 빈 줄로 구분)
      continue
    }

    // 인용구 (> )
    const q = trimmed.match(/^>\s?(.*)$/)
    if (q) { flushUl(); flushPara(); quote.push(q[1]); continue }

    // 목록 (- / * / •)
    const li = trimmed.match(/^[-*•]\s+(.*)$/)
    if (li) { flushQuote(); flushPara(); ul.push(li[1]); continue }

    // 일반 문단 줄
    flushUl(); flushQuote(); para.push(trimmed)
  }
  flushAll()

  let html = htmlBlocks.join('')
  let text = textBlocks.join('\n\n')

  // 제목이 있으면 맨 위에 큰 제목으로 얹기 (본문에도 노출되던 기존 동작 유지)
  if (title && title.trim()) {
    html = `<h2>${inlineToHtml(title.trim())}</h2>${html}`
    text = `${inlineToText(title.trim())}\n\n${text}`
  }

  return { html, text }
}

/**
 * 마크다운을 순수 텍스트로만 정리 (당근·인스타처럼 서식이 필요 없는 채널용).
 * '##', '**', '- ' 등이 글자로 남지 않게 제거.
 */
export function markdownToPlain(md: string): string {
  return markdownToRich(md).text
}

/**
 * 클립보드에 서식 HTML + 순수 텍스트를 함께 복사.
 * 네이버 에디터는 HTML을 읽어 서식 적용, 못 읽는 곳은 순수 텍스트로 폴백.
 * ClipboardItem 미지원 환경에선 순수 텍스트만 복사.
 */
export async function copyRichText(md: string, title?: string): Promise<void> {
  const { html, text } = markdownToRich(md, title)
  try {
    if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([text], { type: 'text/plain' }),
        }),
      ])
      return
    }
  } catch {
    // 서식 복사 실패 시 순수 텍스트로 폴백
  }
  await navigator.clipboard.writeText(text)
}
