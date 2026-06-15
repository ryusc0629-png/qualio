// 네이버 블로그 MetaWeblog XML-RPC 클라이언트
// 엔드포인트: https://api.blog.naver.com/xmlrpc
// 인증: 네이버 아이디(blogId) + 블로그 API 키

export interface NaverBlogCredentials {
  blogId: string
  apiKey: string
}

export interface NaverBlogPost {
  title: string
  content: string   // HTML 또는 텍스트
  tags?: string[]
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function buildXmlRpc(method: string, ...params: string[]): string {
  const paramBlocks = params.map((p) => `<param>${p}</param>`).join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<methodCall>\n  <methodName>${method}</methodName>\n  <params>\n${paramBlocks}\n  </params>\n</methodCall>`
}

function str(value: string): string {
  return `<value><string>${escapeXml(value)}</string></value>`
}

async function callXmlRpc(body: string): Promise<string> {
  const res = await fetch('https://api.blog.naver.com/xmlrpc', {
    method: 'POST',
    headers: { 'Content-Type': 'text/xml; charset=utf-8' },
    body,
  })
  return res.text()
}

function checkFault(xml: string): string | null {
  if (!xml.includes('<fault>')) return null
  const match = xml.match(/<name>faultString<\/name>\s*<value><string>([\s\S]*?)<\/string>/)
  return match?.[1] ?? '알 수 없는 오류'
}

// 마크다운 → HTML 변환 (네이버 블로그용 간단 변환)
export function markdownToNaverHtml(markdown: string): string {
  // JSON 메타 블록 제거
  const clean = markdown.replace(/```json[\s\S]*?```\n?/, '').trim()

  return clean
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>[\s\S]*?<\/li>)/g, '<ul>$1</ul>')
    .replace(/<\/ul>\s*<ul>/g, '')
    .replace(/\n\n/g, '<br><br>')
    .replace(/([^>])\n([^<])/g, '$1<br>$2')
}

// 네이버 블로그 초안 생성
// publish=false → 임시저장 상태로 저장 (사장님이 직접 발행)
export async function createNaverBlogDraft(
  credentials: NaverBlogCredentials,
  post: NaverBlogPost,
): Promise<{ success: boolean; postId?: string; error?: string }> {
  const { blogId, apiKey } = credentials
  const tagsStr = post.tags?.join(',') ?? ''

  const struct = `<value><struct>
    <member><name>title</name>${str(post.title)}</member>
    <member><name>description</name>${str(post.content)}</member>
    <member><name>mt_keywords</name>${str(tagsStr)}</member>
  </struct></value>`

  const xml = buildXmlRpc(
    'metaWeblog.newPost',
    str(blogId),
    str(blogId),
    str(apiKey),
    struct,
    '<value><boolean>0</boolean></value>',  // publish=false → 초안
  )

  try {
    const response = await callXmlRpc(xml)
    const fault = checkFault(response)
    if (fault) return { success: false, error: fault }

    // 성공: 반환된 postId 추출
    const match = response.match(/<value><string>(.*?)<\/string><\/value>/)
    return { success: true, postId: match?.[1] }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : '네트워크 오류' }
  }
}

// 연동 테스트 — 카테고리 목록 조회로 인증 확인
export async function testNaverBlogConnection(
  credentials: NaverBlogCredentials,
): Promise<{ success: boolean; error?: string }> {
  const { blogId, apiKey } = credentials

  const xml = buildXmlRpc(
    'metaWeblog.getCategories',
    str(blogId),
    str(blogId),
    str(apiKey),
  )

  try {
    const response = await callXmlRpc(xml)
    const fault = checkFault(response)
    if (fault) return { success: false, error: fault }
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : '연결 실패' }
  }
}
