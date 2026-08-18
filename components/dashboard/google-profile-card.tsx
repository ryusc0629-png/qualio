import { createServiceClient } from '@/lib/supabase/server'
import { GOOGLE_REVIEW_TARGET, countGoogleClaims } from '@/lib/review/resolve-platform'
import { GbpCheckToggle } from './gbp-check-toggle'

// 구글 비즈니스 프로필 점검 카드.
//
// 왜 구글인가: ChatGPT·Gemini는 "울산 사무실 청소 추천" 같은 짧은 질문에 블로그가 아니라
// 구글 지도 데이터로 답한다. 우리가 아무리 글을 써도 그 질문은 안 뚫린다.
// 후보에 들어가는 최소 조건이 아래 다섯 가지이고, 하나라도 빠지면 자동으로 제외된다.
//
// 리뷰 수만 우리가 직접 셀 수 있다(우리가 보낸 후기 요청 중 실제로 남긴 건수).
// 나머지 네 가지는 구글 쪽 데이터라 사장님이 한 번 확인해 주셔야 한다 —
// Places 키가 들어오면 자동 조회로 바꿀 수 있게 화면 구조는 그대로 두었다.

interface ChecklistState {
  open?: boolean       // 영업 중(폐업·휴업 아님)
  hours?: boolean      // 요일별 영업시간 입력
  category?: boolean   // 메인 카테고리 = 청소전문업체
  rating?: boolean     // 평점 4.5 이상
}

export async function GoogleProfileCard({ businessId }: { businessId: string }) {
  const db = createServiceClient()

  const { data: biz } = (await db
    .from('businesses')
    .select('google_place_url, gbp_checklist, review_google_first' as never)
    .eq('id', businessId)
    .maybeSingle()) as unknown as {
    data: { google_place_url: string | null; gbp_checklist: ChecklistState | null; review_google_first: boolean | null } | null
  }

  const googleReviews = await countGoogleClaims(db, businessId)
  const checks = biz?.gbp_checklist ?? {}

  // 구글 리뷰 링크조차 없는 단계 — 여기부터 시작해야 한다
  if (!biz?.google_place_url) {
    return (
      <div className="rounded-xl border bg-white p-6">
        <p className="font-semibold text-sm">📍 구글 지도에 우리 업체 올리기</p>
        <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
          손님이 <b>ChatGPT·제미나이에 “우리 동네 청소 추천”</b>이라고 물으면, AI는 블로그가 아니라
          <b> 구글 지도</b>를 보고 답합니다. 지도에 없으면 아무리 글을 써도 그 답에는 못 들어가요.
        </p>
        <a
          href="/dashboard/settings"
          className="inline-block mt-4 text-sm font-medium text-emerald-700 hover:underline"
        >
          설정에서 구글 리뷰 주소 넣기 →
        </a>
      </div>
    )
  }

  const items = [
    {
      key: 'reviews',
      done: googleReviews >= GOOGLE_REVIEW_TARGET,
      auto: true,
      title: `리뷰 ${GOOGLE_REVIEW_TARGET}개 이상`,
      now: `지금 ${googleReviews}개`,
      hint:
        googleReviews >= GOOGLE_REVIEW_TARGET
          ? '조건을 넘었어요. 후기 요청은 원래 채널로 돌아갑니다'
          : `${GOOGLE_REVIEW_TARGET - googleReviews}개만 더 받으면 AI 후보에 들어가요. 작업이 끝난 손님에게 후기 요청이 자동으로 나가고 있어요`,
    },
    { key: 'category', done: !!checks.category, title: '메인 카테고리 = 청소전문업체', hint: '상위에 뜨는 업체는 전부 이 카테고리예요. 다르면 같은 검색어에서 밀립니다' },
    { key: 'rating', done: !!checks.rating, title: '평점 4.5 이상', hint: '평점이 낮으면 리뷰가 많아도 후보에서 빠져요' },
    { key: 'hours', done: !!checks.hours, title: '영업시간 입력', hint: 'AI 답변에 “영업 중 · 오후 10시 종료”로 함께 나갑니다' },
    { key: 'open', done: !!checks.open, title: '영업 중 상태', hint: '폐업·임시휴업으로 표시돼 있으면 후보에서 자동 제외돼요' },
  ]

  const doneCount = items.filter((i) => i.done).length

  return (
    <div className="rounded-xl border bg-white p-6 space-y-4">
      <div>
        <p className="font-semibold text-sm">📍 AI가 추천하는 업체가 되려면</p>
        <p className="text-xs text-muted-foreground mt-1">
          구글 지도 조건 {items.length}개 중 <b className="text-foreground">{doneCount}개</b> 채웠어요
        </p>
      </div>

      {/* 진행 막대 — 칸이 하나씩 켜지는 게 보여야 계속하게 된다 */}
      <div className="flex gap-1.5">
        {items.map((i) => (
          <div key={i.key} className={`h-2 flex-1 rounded-full ${i.done ? 'bg-emerald-500' : 'bg-slate-200'}`} />
        ))}
      </div>

      <ul className="space-y-3">
        {items.map((i) => (
          <li key={i.key} className="flex gap-3">
            {/* 리뷰 수는 우리가 세므로 표시만, 나머지 넷은 사장님이 확인하고 켜는 칸 */}
            {i.auto ? (
              <span
                className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                  i.done ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-400'
                }`}
              >
                {i.done ? '✓' : ''}
              </span>
            ) : (
              <GbpCheckToggle itemKey={i.key} done={i.done} label={i.title} />
            )}
            <div className="min-w-0">
              <p className={`text-sm ${i.done ? 'text-muted-foreground line-through' : 'font-medium text-foreground'}`}>
                {i.title}
                {i.now && <span className="ml-2 text-xs font-normal text-emerald-700 no-underline">{i.now}</span>}
              </p>
              {!i.done && <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{i.hint}</p>}
              {i.done && i.auto && <p className="text-xs text-emerald-700 mt-0.5">{i.hint}</p>}
            </div>
          </li>
        ))}
      </ul>

      <div className="border-t pt-3 space-y-2">
        <p className="text-xs text-muted-foreground leading-relaxed">
          리뷰 수는 저희가 자동으로 세고 있어요. 나머지 네 가지는 <b>구글 비즈니스 프로필</b>에서
          한 번만 맞춰두면 계속 유지됩니다.
        </p>
        <div className="flex flex-wrap gap-2">
          <a
            href="https://business.google.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-10 items-center rounded-lg border px-3 text-sm font-medium hover:bg-slate-50"
          >
            구글 비즈니스 프로필 열기 →
          </a>
          <span className="inline-flex h-10 items-center text-xs text-muted-foreground">
            확인한 항목은 왼쪽 동그라미를 눌러 켜주세요
          </span>
        </div>
      </div>
    </div>
  )
}
