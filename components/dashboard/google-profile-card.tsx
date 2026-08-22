import { createServiceClient } from '@/lib/supabase/server'
import { GOOGLE_REVIEW_TARGET, countGoogleClaims } from '@/lib/review/resolve-platform'
import { GbpCheckToggle } from './gbp-check-toggle'
import { GoogleHelpButton } from './google-help-button'

// "손님이 AI에 물어보면 우리가 나오게" 카드.
//
// 왜 구글인가: 챗지피티·제미나이는 "울산 사무실 청소 어디가 좋아?" 같은 짧은 질문에
// 블로그가 아니라 구글 지도에 올라 있는 가게 중에서 답을 고른다. 글을 아무리 써도
// 그 질문은 안 뚫린다. 지도에 올라가고 조건을 채우는 게 유일한 길이다.
//
// ── 화면을 이렇게 만든 이유 ──
// 처음엔 조건 다섯 개를 목록으로 늘어놨는데, 컴퓨터가 익숙하지 않은 사장님에겐
// "메인 카테고리", "평점 4.5 이상" 같은 말이 남의 말이고, 다섯 개가 한꺼번에 보이니
// 뭐부터 할지 몰라 아무것도 안 하게 된다.
// 그래서 (1) 말을 사장님 말로 바꾸고 (2) '지금 할 일' 하나만 크게 띄우고
// (3) 맡기는 길을 먼저 보여준다. 나머지는 접어 둔다.

interface ChecklistState {
  open?: boolean
  hours?: boolean
  category?: boolean
  rating?: boolean
}

interface Step {
  key: string
  done: boolean
  /** 우리가 자동으로 채워주는 항목인지 (사장님이 누를 필요 없음) */
  auto?: boolean
  /** 사장님이 눌러서 켜는 항목이 아닌 것 — 구글 주소를 넣으면 자동으로 채워진다 */
  byLink?: boolean
  title: string
  /** 왜 필요한지 — 사장님이 아는 것에 빗대서 */
  why: string
  /** 지금 상태 한 줄 */
  now?: string
}

export async function GoogleProfileCard({ businessId }: { businessId: string }) {
  const db = createServiceClient()

  const { data: biz } = (await db
    .from('businesses')
    .select('google_place_url, gbp_checklist' as never)
    .eq('id', businessId)
    .maybeSingle()) as unknown as {
    data: { google_place_url: string | null; gbp_checklist: ChecklistState | null } | null
  }

  // 맡겨둔 요청이 있으면 버튼 대신 진행 상황을 보여준다
  const { data: req } = (await db
    .from('business_requests' as never)
    .select('status' as never)
    .eq('business_id' as never, businessId)
    .eq('kind' as never, 'google_maps_setup')
    .neq('status' as never, 'done')
    .maybeSingle()) as unknown as { data: { status: string } | null }

  const googleReviews = await countGoogleClaims(db, businessId)
  const checks = biz?.gbp_checklist ?? {}
  const onMap = !!biz?.google_place_url

  const steps: Step[] = [
    {
      key: 'onmap',
      done: onMap,
      byLink: true,
      title: '구글 지도에 우리 가게 올리기',
      why: '네이버에 스마트플레이스가 있는 것처럼, 구글에도 우리 가게를 올려두는 곳이 있어요. 챗지피티는 여기 올라온 가게 중에서 답을 골라요.',
    },
    {
      key: 'category',
      done: !!checks.category,
      title: '업종을 ‘청소전문업체’로 바꾸기',
      why: '지금 위에 뜨는 업체들은 전부 이 업종으로 돼 있어요. 다르게 돼 있으면 같은 검색에서 뒤로 밀립니다.',
    },
    {
      key: 'reviews',
      done: googleReviews >= GOOGLE_REVIEW_TARGET,
      auto: true,
      title: '손님 후기 5개 받기',
      why: '후기가 5개는 있어야 AI가 우리를 후보로 봐요. 작업이 끝난 손님에게 후기 부탁 문자가 자동으로 나가고 있어요.',
      // ⚠️ 이건 '구글에 올라간 후기 수'가 아니라 '후기 부탁을 받고 구글로 넘어간 손님 수'다.
      //    구글에 실제로 글을 썼는지는 우리가 알 수 없다(구글 계정 연동이 없다).
      //    "지금 0개"라고만 쓰면 구글 후기를 세고 있는 것처럼 읽혀서 문구를 정확히 바꿨다.
      //    → Places API로 실제 후기 수(user_ratings_total)를 읽어오면 그때 진짜 개수로 바꿀 것.
      now:
        googleReviews >= GOOGLE_REVIEW_TARGET
          ? `구글로 보낸 손님 ${googleReviews}명 — 다 채웠어요`
          : `구글로 보낸 손님 ${googleReviews}명 · ${GOOGLE_REVIEW_TARGET - googleReviews}명 남았어요`,
    },
    {
      key: 'rating',
      done: !!checks.rating,
      title: '별점 4.5점 넘기기',
      why: '별점이 낮으면 후기가 많아도 후보에서 빠져요. 후기가 쌓이면 대개 같이 올라갑니다.',
    },
    {
      key: 'hours',
      done: !!checks.hours,
      title: '영업 시간 넣기',
      why: 'AI가 답할 때 “영업 중 · 오후 10시 종료”처럼 같이 보여줘요. 안 넣으면 후보에서 빠집니다.',
    },
    {
      key: 'open',
      done: !!checks.open,
      title: '‘영업 중’으로 되어 있기',
      why: '예전에 등록해둔 게 폐업·휴업으로 남아 있으면 아무리 잘해도 후보에서 빠져요.',
    },
  ]

  const doneCount = steps.filter((s) => s.done).length
  const current = steps.find((s) => !s.done) ?? null
  const rest = steps.filter((s) => s !== current)

  return (
    <div className="rounded-xl border bg-white p-6 space-y-5">
      <div>
        <p className="font-semibold text-sm">📍 손님이 AI에 물어보면 우리가 나오게</p>
        <p className="text-xs text-muted-foreground mt-1">
          챗지피티·제미나이에 “우리 동네 청소 어디가 좋아?”라고 물었을 때 우리 가게가 나오려면
          {' '}<b className="text-foreground">{steps.length}가지</b>가 맞춰져 있어야 해요
        </p>
      </div>

      {/* 진행 막대 — 칸이 하나씩 켜지는 게 보여야 계속하게 된다.
          ⚠️ '맞춰졌어요'가 아니라 '해두셨어요'다. 이 목록은 구글을 들여다보고 판정하는 게 아니라
             사장님이 직접 하고 표시하는 것이다. 우리가 확인한 것처럼 말하지 말 것.
          ⛔구글 Places API로 실제 값을 읽어오지 말 것 — 2026-08-22 대표 판단.
            "아무리 소액이라도 굳이 매일 측정해줄 필요 없다. 그럴 거면 네이버 스마트플레이스도
             매일 체크해줘야 한다. 그냥 하도록 시키기만 하면 된다." */}
      <div>
        <div className="flex gap-1.5">
          {steps.map((s) => (
            <div key={s.key} className={`h-2 flex-1 rounded-full ${s.done ? 'bg-emerald-500' : 'bg-slate-200'}`} />
          ))}
        </div>
        <p className="text-xs text-muted-foreground mt-1.5">
          {doneCount === steps.length ? '다 해두셨어요! 🎉' : `${steps.length}가지 중 ${doneCount}가지 해두셨어요`}
        </p>
      </div>

      {/* 지금 할 일 — 한 번에 하나만. 여러 개를 한꺼번에 보여주면 아무것도 안 하게 된다 */}
      {current && (
        <div className="rounded-xl border-2 border-emerald-200 bg-emerald-50/60 p-4 space-y-3">
          <div>
            <p className="text-[11px] font-semibold text-emerald-700">지금 할 일</p>
            <p className="text-base font-bold text-foreground mt-1">{current.title}</p>
            <p className="text-sm text-emerald-900/80 mt-1.5 leading-relaxed">{current.why}</p>
            {current.now && <p className="text-sm font-semibold text-emerald-700 mt-2">{current.now}</p>}
          </div>

          {current.auto ? (
            // 우리가 알아서 채우는 항목 — 사장님이 할 게 없다는 걸 분명히 한다
            <p className="text-sm text-emerald-900 bg-white/70 rounded-lg px-3 py-2.5">
              이건 저희가 알아서 모으고 있어요. <b>따로 하실 일 없습니다.</b>
            </p>
          ) : (
            <div className="space-y-2">
              <GoogleHelpButton requestStatus={req?.status ?? null} />
              {!req && (
                <details className="text-sm">
                  <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                    직접 해볼게요
                  </summary>
                  <div className="mt-2 rounded-lg bg-white border p-3 space-y-2">
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      구글에 로그인한 뒤 <b>비즈니스 프로필</b>에서 우리 가게를 찾아 고치면 돼요.
                      가게가 없으면 새로 만들 수 있어요. 중간에 막히시면 위 버튼을 눌러주세요.
                    </p>
                    <a
                      href="https://business.google.com/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex h-10 items-center rounded-lg border px-3 text-sm font-medium hover:bg-slate-50"
                    >
                      구글에서 열기 →
                    </a>
                    {current.byLink ? (
                      <p className="text-xs text-muted-foreground pt-1">
                        다 만드셨으면 <b>설정 → 후기 채널</b>에 구글 주소를 넣어주세요. 그러면 이 줄이 저절로 채워져요.{' '}
                        <a href="/dashboard/settings" className="text-emerald-700 underline">설정 열기</a>
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground pt-1">
                        다 하셨으면 아래 목록에서 그 줄의 동그라미를 눌러 표시해 주세요.
                      </p>
                    )}
                  </div>
                </details>
              )}
            </div>
          )}
        </div>
      )}

      {/* 나머지 — 지금 할 일이 아니라 작게. 이미 끝난 건 취소선 */}
      <div className="border-t pt-3">
        <p className="text-xs text-muted-foreground mb-2">{current ? '다음에 할 일' : '맞춰둔 것'}</p>
        <ul className="space-y-2">
          {rest.map((s) => (
            <li key={s.key} className="flex items-center gap-2.5">
              {s.auto || s.byLink ? (
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                    s.done ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-400'
                  }`}
                >
                  {s.done ? '✓' : ''}
                </span>
              ) : (
                <GbpCheckToggle itemKey={s.key} done={s.done} label={s.title} />
              )}
              <span className={`text-sm ${s.done ? 'text-muted-foreground line-through' : 'text-foreground/80'}`}>
                {s.title}
              </span>
              {s.now && !s.done && <span className="text-xs text-emerald-700">{s.now}</span>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
