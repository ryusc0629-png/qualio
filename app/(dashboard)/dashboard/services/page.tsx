import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { AddServiceForm } from '@/components/dashboard/add-service-form'
import { DeleteServiceButton } from '@/components/dashboard/delete-service-button'
import { ShowInQuoteToggle } from '@/components/dashboard/show-in-quote-toggle'
import { EditServiceButton } from '@/components/dashboard/edit-service-button'

// 서비스 항목 관리 페이지
export default async function ServicesPage() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) redirect('/login')

  const db = createServiceClient()

  // 업체 ID 조회
  const { data: profile } = await db
    .from('profiles')
    .select('business_id')
    .eq('id', user.id)
    .maybeSingle()

  if (!profile?.business_id) redirect('/onboarding')

  // 서비스 목록 조회 (삭제되지 않은 항목만)
  const { data: services } = await db
    .from('service_items')
    .select('id, name, category, base_price, unit, is_active, show_in_quote, photos')
    .eq('business_id', profile.business_id)
    .is('deleted_at', null)
    .order('sort_order')
    .order('created_at')

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">서비스 항목</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            고객 견적 폼에 표시될 서비스를 등록하세요
          </p>
        </div>
        <AddServiceForm />
      </div>

      {/* 서비스 목록 */}
      {!services || services.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center">
          <p className="text-muted-foreground text-sm">등록된 서비스가 없습니다</p>
          <p className="text-muted-foreground text-xs mt-1">위의 "서비스 추가" 버튼을 눌러 추가하세요</p>
        </div>
      ) : (
        <div className="rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left px-4 py-3 font-medium">서비스명</th>
                <th className="text-left px-4 py-3 font-medium">카테고리</th>
                <th className="text-right px-4 py-3 font-medium">기본가</th>
                <th className="text-center px-4 py-3 font-medium">단위</th>
                <th className="text-center px-4 py-3 font-medium">견적폼</th>
                <th className="text-center px-4 py-3 font-medium">사진</th>
                <th className="w-20 px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {services.map((service) => (
                <tr key={service.id} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium">{service.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{service.category ?? '—'}</td>
                  <td className="px-4 py-3 text-right">
                    {service.base_price.toLocaleString()}원
                  </td>
                  <td className="px-4 py-3 text-center text-muted-foreground">{service.unit}</td>
                  <td className="px-4 py-3 text-center">
                    <ShowInQuoteToggle id={service.id} showInQuote={service.show_in_quote} />
                  </td>
                  <td className="px-4 py-3 text-center text-muted-foreground text-xs">
                    {(service.photos?.length ?? 0) > 0
                      ? <span className="text-primary font-medium">{service.photos!.length}장</span>
                      : <span className="text-zinc-400">없음</span>
                    }
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <EditServiceButton service={service} />
                      <DeleteServiceButton id={service.id} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
