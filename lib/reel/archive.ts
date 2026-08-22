import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'

// 완성된 홍보 영상을 우리 스토리지로 옮겨 담는다.
//
// ★왜 반드시 옮겨야 하는가: Creatomate는 렌더 결과물을 **30일만** 보관하고 영구 삭제한다
//   (공식 문서: "The file is hosted for up to 30 days, then permanently deleted —
//   transfer it to your own storage if you need it longer"). 우리는 웹훅으로 받은
//   Creatomate 주소를 그대로 reel_url에 넣어 왔기 때문에, 한 달이 지나면 마케팅 화면
//   목록에 릴스는 그대로 보이는데 '공유하기'·'내려받기'가 둘 다 죽는다
//   (두 버튼 다 그 주소를 fetch 해서 파일을 받아온다).
//
// ⛔"30일 뒤 삭제되니 미리 받아두세요" 안내로 때우지 말 것. 실측 편당 7.8MB라
//   보관비가 베타 100팀 규모에서 1년에 3천원대다. 그 돈을 아끼자고 40~60대 사장님에게
//   파일 관리라는 숙제를 넘기게 된다. 게다가 안내를 넣어도 '만료된 릴스를 목록에서
//   어떻게 보일지'는 어차피 만들어야 해서 코드가 줄지도 않는다.

/** 우리 스토리지로 이미 옮긴 주소인가 (Creatomate/백블레이즈 주소가 아닌가) */
export function isArchivedUrl(url: string | null | undefined): boolean {
  if (!url) return false
  return !/backblazeb2\.com|creatomate/i.test(url)
}

/**
 * 영상을 받아 우리 스토리지에 올리고, 우리 쪽 공개 주소를 돌려준다.
 * 실패하면 null — 호출부는 원래 주소를 그대로 쓰면 된다(영상이 사라지는 것보단 낫다).
 */
export async function archiveReelToStorage(
  db: SupabaseClient,
  params: { businessId: string; bookingId: string; renderId: string; sourceUrl: string },
): Promise<string | null> {
  const { businessId, bookingId, renderId, sourceUrl } = params

  // 이미 우리 주소면 아무것도 안 한다 (크론 안전망이 같은 건을 또 집어도 안전하게)
  if (isArchivedUrl(sourceUrl)) return sourceUrl

  try {
    const res = await fetch(sourceUrl)
    if (!res.ok) {
      // 30일이 이미 지나 사라진 경우가 여기다 — 되살릴 방법은 없고, 기록만 남긴다
      console.error(`[Reel] 영상 내려받기 실패(${res.status}) — 이미 만료됐을 수 있어요:`, sourceUrl)
      return null
    }

    const buffer = Buffer.from(await res.arrayBuffer())
    const path = `${businessId}/${bookingId}/reel/${renderId}.mp4`

    const { error } = await db.storage.from('report-photos').upload(path, buffer, {
      contentType: 'video/mp4',
      // 같은 렌더를 다시 옮기는 경우(크론 재시도) 덮어쓴다
      upsert: true,
    })
    if (error) {
      console.error('[Reel] 영상 보관 실패:', error.message)
      return null
    }

    return db.storage.from('report-photos').getPublicUrl(path).data.publicUrl
  } catch (err) {
    console.error('[Reel] 영상 보관 중 오류:', err)
    return null
  }
}
