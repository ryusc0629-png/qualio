// 마크다운 본문(서브셋) ↔ HTML 변환
// 지원 서식: ## 큰제목, ### 작은제목, **굵게**, - 목록, > 인용, 일반 문단
// 공개 페이지 렌더러(app/biz/[slug]/posts/[postSlug])와 동일한 서브셋만 다룬다.

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function inlineToHtml(text: string): string {
  return escapeHtml(text).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
}

// 마크다운 → HTML (에디터에 불러올 때)
export function markdownToHtml(md: string): string {
  const lines = md.replace(/\r\n/g, '\n').split('\n')
  const out: string[] = []
  let i = 0

  while (i < lines.length) {
    const trimmed = lines[i].trim()

    if (trimmed === '') { i++; continue }

    if (trimmed.startsWith('### ')) {
      out.push(`<h3>${inlineToHtml(trimmed.slice(4))}</h3>`)
      i++
      continue
    }
    if (trimmed.startsWith('## ')) {
      out.push(`<h2>${inlineToHtml(trimmed.slice(3))}</h2>`)
      i++
      continue
    }
    // 연속된 목록 항목
    if (trimmed.startsWith('- ')) {
      const items: string[] = []
      while (i < lines.length && lines[i].trim().startsWith('- ')) {
        items.push(`<li>${inlineToHtml(lines[i].trim().slice(2))}</li>`)
        i++
      }
      out.push(`<ul>${items.join('')}</ul>`)
      continue
    }
    // 연속된 인용 줄
    if (trimmed.startsWith('> ')) {
      const quotes: string[] = []
      while (i < lines.length && lines[i].trim().startsWith('> ')) {
        quotes.push(inlineToHtml(lines[i].trim().slice(2)))
        i++
      }
      out.push(`<blockquote><p>${quotes.join('<br>')}</p></blockquote>`)
      continue
    }
    // 일반 문단 — 빈 줄/특수 서식 전까지 합침
    const para: string[] = []
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !/^(#{2,3} |- |> )/.test(lines[i].trim())
    ) {
      para.push(inlineToHtml(lines[i].trim()))
      i++
    }
    out.push(`<p>${para.join('<br>')}</p>`)
  }

  return out.join('')
}

// 인라인 노드 → 마크다운 (굵게/줄바꿈)
function inlineToMarkdown(node: Node): string {
  let result = ''
  node.childNodes.forEach((child) => {
    if (child.nodeType === Node.TEXT_NODE) {
      result += child.textContent ?? ''
    } else if (child.nodeName === 'STRONG' || child.nodeName === 'B') {
      result += `**${inlineToMarkdown(child)}**`
    } else if (child.nodeName === 'BR') {
      result += '\n'
    } else {
      result += inlineToMarkdown(child)
    }
  })
  return result
}

// HTML(에디터 출력) → 마크다운 (저장할 때)
export function htmlToMarkdown(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const blocks: string[] = []

  doc.body.childNodes.forEach((node) => {
    const el = node as HTMLElement
    switch (node.nodeName) {
      case 'H2':
        blocks.push(`## ${inlineToMarkdown(el)}`)
        break
      case 'H3':
        blocks.push(`### ${inlineToMarkdown(el)}`)
        break
      case 'UL': {
        const items: string[] = []
        el.querySelectorAll(':scope > li').forEach((li) => {
          items.push(`- ${inlineToMarkdown(li)}`)
        })
        if (items.length) blocks.push(items.join('\n'))
        break
      }
      case 'OL': {
        const items: string[] = []
        el.querySelectorAll(':scope > li').forEach((li, idx) => {
          items.push(`${idx + 1}. ${inlineToMarkdown(li)}`)
        })
        if (items.length) blocks.push(items.join('\n'))
        break
      }
      case 'BLOCKQUOTE': {
        const quoted = inlineToMarkdown(el)
          .split('\n')
          .map((line) => `> ${line}`)
          .join('\n')
        blocks.push(quoted)
        break
      }
      case 'P': {
        const text = inlineToMarkdown(el)
        if (text.trim()) blocks.push(text)
        break
      }
      default: {
        const text = inlineToMarkdown(el)
        if (text.trim()) blocks.push(text)
      }
    }
  })

  return blocks.join('\n\n').trim()
}
