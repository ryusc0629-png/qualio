import { redirect } from 'next/navigation'

// 영업 관리는 고객 관리(단일 허브)로 통합됨 — 목록 진입은 고객 관리로 보냄
// (개별 리드 영업단계 관리는 /dashboard/pipeline/[leadId] 상세에서 계속 동작)
export default function PipelinePage() {
  redirect('/dashboard/clients')
}
