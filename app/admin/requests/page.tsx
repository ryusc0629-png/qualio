import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase/server'
import { formatDateTime } from '@/lib/format/datetime'
import { RequestRowActions } from './request-row'

// 항상 최신 요청함을 보여준다(캐시 금지)
export const dynamic = 'force-dynamic'

type BusinessRequest = {
  id: string
  kind: string
  status: string
  note: string | null
  admin_note: string | null
  created_at: string
  businesses: {
    name: string | null
    phone: string | null
    custom_domain: string | null
    custom_domain_status: string | null
  } | null
}

const KIND_LABEL: Record<string, string> = {
  domain_setup: '주소 만들기·연결',
  search_indexing: '검색 등록',
}

const STATUS_LABEL: Record<string, string> = {
  requested: '접수',
  in_progress: '처리 중',
  done: '완료',
}

const STATUS_STYLE: Record<string, string> = {
  requested: 'bg-amber-100 text-amber-800',
  in_progress: 'bg-blue-100 text-blue-800',
  done: 'bg-muted text-muted-foreground',
}

/** 요청 종류별로 본사가 실제로 해야 하는 일 — 매번 기억해내지 않게 화면에 적어둔다 */
const PLAYBOOK: Record<string, string[]> = {
  domain_setup: [
    '사장님께 전화해 원하는 주소 후보 확인 (업체명 영문 + .co.kr 권장)',
    '가비아에서 구입 → DNS에 A 레코드(@ → 76.76.21.21)와 www CNAME(cname.vercel-dns.com) 두 줄 등록',
    '사장님 대시보드 설정에서 주소 연결 → 상태가 연결됨으로 바뀌는지 확인',
  ],
  search_indexing: [
    '네이버 서치어드바이저에 https:// 주소로 등록 (HTML 태그 방식, 파일 업로드 아님)',
    '구글 서치콘솔에 URL 접두어 방식으로 등록',
    '받은 코드 두 개를 businesses의 naver/google_site_verification에 저장 → 소유확인',
    '양쪽에 sitemap.xml 제출 + 홈 주소 수집·색인 요청',
  ],
}

export default async function AdminRequestsPage() {
  // business_requests는 아직 database.ts 타입에 없어 loose 클라이언트로 접근
  const looseDb = createServiceClient() as unknown as SupabaseClient
  const { data } = (await looseDb
    .from('business_requests')
    .select('id, kind, status, note, admin_note, created_at, businesses!business_id(name, phone, custom_domain, custom_domain_status)')
    .order('created_at', { ascending: false })) as unknown as { data: BusinessRequest[] | null }

  const rows = data ?? []
  const open = rows.filter((r) => r.status !== 'done')

  return (
    <div>
      <div className="mb-6 flex items-baseline justify-between">
        <h1 className="text-lg font-bold">대행 요청</h1>
        <span className="text-xs text-muted-foreground">
          처리할 것 {open.length}건 / 전체 {rows.length}건
        </span>
      </div>

      {rows.length === 0 ? (
        <div className="text-center py-12 space-y-2">
          <p className="text-muted-foreground">아직 들어온 요청이 없어요</p>
          <p className="text-xs text-muted-foreground">
            사장님이 설정 화면에서 &lsquo;대신 해주세요&rsquo; 버튼을 누르면 여기에 쌓여요
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <div
              key={r.id}
              className={`rounded-lg border p-4 space-y-3 ${r.status === 'done' ? 'opacity-60' : ''}`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[r.status] ?? ''}`}>
                  {STATUS_LABEL[r.status] ?? r.status}
                </span>
                <span className="text-sm font-medium">{r.businesses?.name ?? '(이름 없음)'}</span>
                <span className="text-xs text-muted-foreground">{KIND_LABEL[r.kind] ?? r.kind}</span>
                <span className="ml-auto text-xs text-muted-foreground">
                  {formatDateTime(r.created_at)}
                </span>
              </div>

              <div className="text-xs text-muted-foreground space-y-1">
                {r.businesses?.phone && <p>연락처 {r.businesses.phone}</p>}
                <p>
                  주소{' '}
                  {r.businesses?.custom_domain
                    ? `${r.businesses.custom_domain} (${r.businesses.custom_domain_status})`
                    : '아직 없음'}
                </p>
                {r.note && <p className="text-foreground">사장님 메모: {r.note}</p>}
                {r.admin_note && <p>처리 메모: {r.admin_note}</p>}
              </div>

              {r.status !== 'done' && PLAYBOOK[r.kind] && (
                <ol className="rounded-md bg-muted/40 p-3 space-y-1 text-xs text-muted-foreground list-decimal list-inside">
                  {PLAYBOOK[r.kind].map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
              )}

              <RequestRowActions id={r.id} status={r.status} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
