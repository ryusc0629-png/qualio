// 다음(카카오) 우편번호 주소 검색 — 공용 유틸
//
// 왜 이렇게 쓰는가: Postcode.open() 팝업 방식은 주소를 고른 뒤에도 창이 닫히지 않고
// 화면에 남아 "주소가 입력됐는데 검색창이 그대로네?" 하고 헷갈리게 만든다.
// 그래서 .open() 대신, 우리가 직접 만든 레이어(오버레이)에 .embed()로 띄우고
// 선택(oncomplete)·닫기 버튼·배경 클릭 시 레이어를 직접 제거한다 → 항상 확실히 닫힘.
//
// 주소 검색이 필요한 모든 곳은 이 함수만 호출할 것. (개별 구현 금지 — 닫힘 버그 재발 방지)

interface PostcodeData {
  address: string // 사용자가 고른 기준(도로명/지번)의 전체 주소
  roadAddress: string
  jibunAddress: string
  buildingName: string
  zonecode: string
}

interface PostcodeInstance {
  open: () => void
  embed: (element: HTMLElement) => void
}

declare global {
  interface Window {
    daum?: {
      Postcode: new (options: {
        oncomplete: (data: PostcodeData) => void
        onclose?: (state: string) => void
        width?: string | number
        height?: string | number
      }) => PostcodeInstance
    }
  }
}

const SCRIPT_SRC = '//t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js'

// 우편번호 스크립트 1회 로드 (중복 삽입 방지)
function loadPostcodeScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.daum?.Postcode) {
      resolve()
      return
    }
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`)
    if (existing) {
      existing.addEventListener('load', () => resolve())
      existing.addEventListener('error', () => reject(new Error('주소 검색을 불러오지 못했어요')))
      return
    }
    const script = document.createElement('script')
    script.src = SCRIPT_SRC
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('주소 검색을 불러오지 못했어요'))
    document.head.appendChild(script)
  })
}

/**
 * 주소 검색 레이어를 띄우고, 고른 주소를 onSelect로 돌려준다.
 * 선택·닫기 시 레이어는 자동으로 사라진다.
 *
 * @param onSelect 선택된 주소(도로명/지번 + 건물명) 문자열
 */
export async function openAddressSearch(onSelect: (address: string) => void): Promise<void> {
  try {
    await loadPostcodeScript()
  } catch (e) {
    console.error('[Address] 우편번호 스크립트 로드 실패', e)
    return
  }
  if (!window.daum?.Postcode) return

  // 오버레이(배경) — 모달(z-50) 위에 오도록 매우 높은 z-index
  // pointer-events:auto — Radix Dialog가 열려 있으면 body에 pointer-events:none을 걸어
  // 바깥 요소(=이 오버레이) 클릭을 막는다. 명시적으로 auto를 줘 클릭이 먹도록 복구.
  const overlay = document.createElement('div')
  overlay.setAttribute('role', 'dialog')
  overlay.setAttribute('aria-label', '주소 검색')
  overlay.style.cssText =
    'position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(0,0,0,0.45);pointer-events:auto;'

  // 검색 패널
  const panel = document.createElement('div')
  panel.style.cssText =
    'position:relative;width:100%;max-width:480px;height:80vh;max-height:560px;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 12px 40px rgba(0,0,0,0.25);'

  // 닫기(✕) 버튼
  const closeBtn = document.createElement('button')
  closeBtn.type = 'button'
  closeBtn.setAttribute('aria-label', '주소 검색 닫기')
  closeBtn.textContent = '✕'
  closeBtn.style.cssText =
    'position:absolute;top:6px;right:6px;z-index:1;width:32px;height:32px;border:0;background:#fff;border-radius:8px;font-size:16px;line-height:1;cursor:pointer;color:#555;'

  // 임베드 영역 (닫기 버튼에 가리지 않게 위쪽 여백)
  const embedArea = document.createElement('div')
  embedArea.style.cssText = 'width:100%;height:100%;padding-top:40px;box-sizing:border-box;'

  panel.appendChild(closeBtn)
  panel.appendChild(embedArea)
  overlay.appendChild(panel)
  document.body.appendChild(overlay)

  // 배경 스크롤 잠금 (레이어 떠 있는 동안)
  const prevOverflow = document.body.style.overflow
  document.body.style.overflow = 'hidden'

  const cleanup = () => {
    document.body.style.overflow = prevOverflow
    overlay.remove()
    document.removeEventListener('keydown', onKeyDown, true)
  }

  // ESC로 이 레이어만 닫는다. Radix Dialog도 document에서 ESC를 듣고 부모 모달을 닫으므로,
  // 캡처 단계에서 전파를 끊어 부모 모달까지 함께 닫히는 것을 막는다.
  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.stopImmediatePropagation()
      cleanup()
    }
  }

  // Radix Dialog의 문서 레벨 리스너(포커스 트랩=FocusScope, 바깥 클릭 닫기=DismissableLayer)가
  // 이 레이어 상호작용에 반응하지 않도록 전파를 여기서 끊는다.
  // (안 끊으면: 포커스가 계속 부모 모달로 회수되어 입력 불가 + 클릭 시 부모 모달이 닫힘)
  const stopBubble = (e: Event) => e.stopPropagation()
  for (const type of ['pointerdown', 'mousedown', 'click', 'touchstart', 'focusin']) {
    overlay.addEventListener(type, stopBubble)
  }

  closeBtn.addEventListener('click', cleanup)
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) cleanup()
  })
  document.addEventListener('keydown', onKeyDown, true)

  new window.daum.Postcode({
    oncomplete: (data) => {
      const extra = data.buildingName ? ` (${data.buildingName})` : ''
      onSelect((data.address || data.roadAddress || data.jibunAddress) + extra)
      cleanup()
    },
    width: '100%',
    height: '100%',
  }).embed(embedArea)
}
