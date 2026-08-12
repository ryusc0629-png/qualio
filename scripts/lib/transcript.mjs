// ─────────────────────────────────────────────────────────────
// 자막(SRT) 파싱 + 음성인식 오인식 정정 — distribute.mjs / articles.mjs 공용
//
// 왜 공용 모듈인가: 정정 사전이 스크립트마다 복사돼 있으면 한쪽만 고쳐져
// 쇼츠 자막엔 '퀄리오'로 나오는데 블로그 글엔 '컬리오'로 남는 사고가 난다.
// ─────────────────────────────────────────────────────────────
import { readFileSync } from 'node:fs'

// 음성인식(whisper)이 청소업 용어·고유명사를 자주 틀린다. 틀린 채로 재가공하면
// 게시글·쇼츠 자막에 "컬리오", "전기 청소" 같은 말이 그대로 박히므로 파싱 단계에서 정정한다.
// ★ 문맥 판단이 필요한 애매한 오인식은 여기 넣지 말 것(잘못 고치면 더 나쁨) — 프롬프트 규칙으로 처리.
export const TRANSCRIPT_FIXES = [
  [/컬리오|콜리아|퀼리오|콜리오|컬리아/g, '퀄리오'],
  [/어피에스/g, 'OPS'],
  [/전기 청소/g, '정기 청소'],
  [/정기청소/g, '정기 청소'],
  [/(^|[\s,.!?])전기(는|를|가|도|의|에|와|랑|부터|만)/g, '$1정기$2'],
  [/전기 (안|한|하고|하는|하시|해)/g, '정기 $1'],
  [/선소/g, '청소'],
  [/집간지성/g, '집단지성'],
  [/자극복/g, '작업복'],
  [/아우반들|아웃반들/g, '아웃바운드'],
  [/카레터의 법칙|카레토의 법칙/g, '파레토의 법칙'],
  [/기회복음/g, '기회비용'],
  [/순찬|승선 씨|순천 씨/g, '승찬'],
  [/도법사|도구텔|도급 복사|도급복사/g, '도급사'],
  [/도그 업체|도구 업체/g, '도급 업체'],
  [/줄누나|줄누만/g, '줄눈'],
  [/방람회|방담회|입주방담/g, '박람회'],
  [/광축망/g, '방충망'],
]

export function fixTranscript(s) {
  let out = s
  for (const [re, to] of TRANSCRIPT_FIXES) out = out.replace(re, to)
  return out
}

// SRT → { stamped: "[HH:MM:SS] 텍스트" 줄들, plain: 텍스트만 }
export function parseSrt(srtPath) {
  const raw = fixTranscript(readFileSync(srtPath, 'utf8'))
  const blocks = raw.split(/\n\s*\n/).map(b => b.trim()).filter(Boolean)
  const lines = []
  let plain = ''
  for (const b of blocks) {
    const l = b.split('\n')
    const time = l.find(x => x.includes('-->'))
    if (!time) continue
    const start = time.split('-->')[0].trim().slice(0, 8) // HH:MM:SS
    const text = l.slice(l.indexOf(time) + 1).join(' ').trim()
    if (!text) continue
    lines.push(`[${start}] ${text}`)
    plain += text + '\n'
  }
  return { stamped: lines.join('\n'), plain }
}
