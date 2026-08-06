import QRCode from 'qrcode'

// 소개서 표지/CTA에 넣을 QR(무료 견적 문의 폼 = 공개 홈 /biz/{slug}?ch=proposal) 이미지 생성.
// 서버(Node)에서 data URL로 만들어 인쇄 페이지에 인라인으로 넘긴다.
export async function generateProposalQr(url: string, dark = '#1f2a24'): Promise<string | null> {
  try {
    return await QRCode.toDataURL(url, {
      margin: 1,
      width: 240,
      color: { dark, light: '#ffffff' },
    })
  } catch {
    return null
  }
}
