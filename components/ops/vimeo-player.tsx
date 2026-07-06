// Vimeo 영상 플레이어 — 16:9 반응형 래퍼
// 페이지단에서 이미 시청 권한(무료 or 로그인)을 확인한 뒤에만 렌더한다.
export function VimeoPlayer({ vimeoId, title }: { vimeoId: string; title: string }) {
  return (
    <div className="relative w-full overflow-hidden rounded-xl bg-black" style={{ paddingTop: '56.25%' }}>
      <iframe
        src={`https://player.vimeo.com/video/${vimeoId}?title=0&byline=0&portrait=0`}
        title={title}
        className="absolute inset-0 h-full w-full"
        allow="autoplay; fullscreen; picture-in-picture"
        allowFullScreen
      />
    </div>
  )
}
