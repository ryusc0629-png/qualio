import { getBusinessesForCs } from '@/lib/admin/businesses-list'
import { BusinessesList } from './businesses-list'

// 항상 최신 회원 데이터를 보여준다(캐시 금지)
export const dynamic = 'force-dynamic'

export default async function AdminBusinessesPage() {
  const rows = await getBusinessesForCs()

  const paidCount = rows.filter((r) => r.isPaid).length

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-lg font-bold">회원(가입 업체) 목록</h1>
        <p className="text-xs text-muted-foreground">
          CS·연락용 명단. 총 {rows.length}곳 · 유료 {paidCount}곳
        </p>
      </div>

      <BusinessesList rows={rows} />
    </div>
  )
}
