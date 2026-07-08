import { redirect } from 'next/navigation'

// CRM/영업 관리는 고객 관리(단일 허브)로 통합됨
export default function CrmPage() {
  redirect('/dashboard/clients')
}
