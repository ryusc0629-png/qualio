// 영상 한 편을 네 채널에 올리기 위한 문구 — 한 소재로 최대한의 결과를 뽑는다.
//
// ★새로 만들지 않는다. 이미 시공 사례에 저장된 문구(네이버 제목·태그, 인스타 본문·해시태그)를
//   채널 성격에 맞게 나눠 쓴다. 채널마다 따로 만들면 같은 내용에 돈이 네 번 나가고,
//   말이 채널마다 미묘하게 달라져 나중에 어느 게 진짜인지 모르게 된다.
//
// 채널별 성격:
//   인스타·틱톡 — 보는 사람이 스크롤하다 멈춘다. 짧은 본문 + 해시태그.
//   유튜브 쇼츠·네이버 클립 — **검색으로 찾는다**. 제목이 곧 검색어라 네이버용 제목·태그가 맞는다.
//     (네이버 클립은 스마트블록이 문서 단위로 품질을 보므로 제목·태그가 특히 중요하다)

export type ReelChannelKey = 'instagram' | 'tiktok' | 'shorts' | 'naver_clip'

export interface ReelChannelCaption {
  key: ReelChannelKey
  label: string
  /** 그 채널에 그대로 붙여넣을 전체 문구 */
  text: string
  /** 붙여넣은 뒤 갈 곳 */
  openUrl: string
  /** 어디에 붙이는지 한 줄 */
  hint: string
  /**
   * 폰에서 앱으로 넘어가야 하는 채널인가.
   * ⚠️새 탭(window.open)으로 열면 iOS·안드로이드가 앱으로 넘겨주지 않는다(App Links가 안 걸림).
   *   같은 탭으로 이동해야 앱이 깔려 있을 때 앱이 열린다.
   * ⛔`naverblog://` 같은 커스텀 스킴을 추측해서 쓰지 말 것 — 공식 문서를 찾지 못했고,
   *   등록 안 된 스킴이면 폰에 "페이지를 열 수 없음" 오류창이 떠서 비테크 사장님이 막힌다.
   */
  preferApp?: boolean
}

interface Source {
  /** 검색용 제목 — 네이버 블로그 제목을 그대로 쓴다(검색어 중심) */
  searchTitle: string | null
  /** 검색용 태그 */
  searchTags: string[] | null
  /** 짧은 본문 */
  body: string | null
  /** 짧은 해시태그 */
  bodyTags: string[] | null
}

const hash = (tags: string[] | null | undefined, max: number): string =>
  (tags ?? [])
    .slice(0, max)
    .map((t) => (t.startsWith('#') ? t : `#${t}`))
    .join(' ')

/**
 * 네 채널 문구를 만든다. 재료가 없으면 그 채널은 아예 안 만든다 —
 * 빈 문구를 복사하게 하면 사장님이 빈 칸을 채우는 일이 생긴다.
 */
export function buildReelCaptions(src: Source): ReelChannelCaption[] {
  const out: ReelChannelCaption[] = []

  const body = (src.body ?? '').trim()
  const title = (src.searchTitle ?? '').trim()

  // ── 스크롤하다 멈추는 곳 ──
  if (body) {
    const tags = hash(src.bodyTags, 5)
    const text = tags ? `${body}\n\n${tags}` : body

    out.push({
      key: 'instagram',
      label: '인스타',
      text,
      openUrl: 'https://www.instagram.com/',
      hint: '릴스로 올리고 문구 붙여넣기 (링크는 프로필에)',
    })

    out.push({
      key: 'tiktok',
      label: '틱톡',
      text: tags ? `${body}\n\n${tags}` : body,
      openUrl: 'https://www.tiktok.com/upload',
      hint: '영상 올리고 문구 붙여넣기 (링크는 프로필에)',
    })
  }

  // ── 검색으로 찾는 곳 — 제목이 곧 검색어다 ──
  if (title) {
    // 유튜브는 설명란이 넉넉해 태그를 많이 넣어도 되지만,
    // ⚠️네이버 클립은 해시태그가 **최대 5개**다(2026-08-22 대표 확인). 넘기면 등록이 안 된다.
    const searchTags = hash(src.searchTags, 10)
    const clipTags = hash(src.searchTags, 5)

    // 유튜브는 제목/설명이 따로라 한 덩이로 주되 어디에 넣는지 표시해준다.
    // #Shorts는 세로 영상을 쇼츠로 확실히 태우기 위해 우리가 붙인다.
    const shortsDesc = [body, searchTags, '#Shorts'].filter(Boolean).join('\n\n')
    out.push({
      key: 'shorts',
      label: '유튜브 쇼츠',
      text: `[제목]\n${title}\n\n[설명]\n${shortsDesc}`,
      openUrl: 'https://studio.youtube.com/',
      hint: '만들기 → 동영상 업로드',
    })

    // ★네이버 클립은 발행할 때 '링크'를 태그로 걸 수 있다 — 숏폼 중 유일하게 영상에서 바로 눌린다.
    //   그래서 우리 채널 목록에도 naver_clip 추적 링크를 따로 뒀다(?ch=naver_clip).
    // ⚠️올리는 곳은 **네이버 블로그 앱(모바일)**이다: 글쓰기(+) → [클립] → 영상 → 제목·해시태그 → 발행.
    //   PC로 올리려면 네이버TV 크리에이터 스튜디오를 따로 개설해야 해서 초기 세팅이 번거롭다.
    //   ⛔PC 업로드 경로를 기본으로 안내하지 말 것.
    out.push({
      key: 'naver_clip',
      label: '네이버 클립',
      text: clipTags ? `${title}\n\n${clipTags}` : title,
      openUrl: 'https://m.blog.naver.com/',
      hint: '블로그 앱 → 글쓰기(+) → 클립 → 발행할 때 링크 태그 걸기',
      // 폰에 블로그 앱이 깔려 있으면 앱으로 넘어간다(같은 탭 이동이라야 걸린다)
      preferApp: true,
    })
  }

  return out
}
