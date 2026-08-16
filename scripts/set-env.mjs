#!/usr/bin/env node
/**
 * 환경변수 값 넣기 — 복사(⌘C)해 둔 값을 .env.local에 바로 꽂는다.
 *
 * 왜 필요한가: 키를 채팅이나 터미널 화면에 붙여넣으면 그 기록에 키가 남는다.
 * 이 스크립트는 클립보드에서 직접 읽어 파일에 쓰고, 화면에는 앞 몇 글자만 보여준다.
 * 키가 화면·대화 기록 어디에도 남지 않는다.
 *
 * 사용법:
 *   1) Supabase 등에서 키를 복사(⌘C)
 *   2) npm run env:set -- SUPABASE_SERVICE_ROLE_KEY
 *
 * 옛 값은 지우지 않고 주석(#)으로 남긴다 — 문제가 생기면 되돌리기 위함.
 */

import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const ROOT = path.resolve(import.meta.dirname, '..')
const ENV_PATH = path.join(ROOT, '.env.local')

// 자주 바꾸는 키 — 번호만 고르면 되게 한다(이름을 외울 필요 없음)
const PRESETS = [
  ['ANTHROPIC_API_KEY', '클로드(글 자동 작성)'],
  ['SUPABASE_SERVICE_ROLE_KEY', '수파베이스 서버 키'],
  ['NEXT_PUBLIC_SUPABASE_ANON_KEY', '수파베이스 브라우저 키'],
  ['SOLAPI_API_KEY', '알림톡 키'],
  ['SOLAPI_API_SECRET', '알림톡 시크릿'],
  ['PORTONE_V2_API_SECRET', '포트원 결제'],
  ['TOSSPAYMENTS_SECRET_KEY', '토스 결제'],
  ['KAKAO_REST_API_KEY', '카카오 주소 변환'],
  ['OPENAI_API_KEY', 'OpenAI'],
  ['GEMINI_API_KEY', '제미나이'],
  ['PERPLEXITY_API_KEY', '퍼플렉시티'],
  ['QUALIO_VERCEL_TOKEN', 'Vercel 토큰'],
  ['NOTION_TOKEN', '노션'],
  ['FAL_KEY', '이미지 생성(FAL)'],
  ['AYRSHARE_API_KEY', 'SNS 배포(Ayrshare)'],
  ['CREATOMATE_API_KEY', '영상 생성(Creatomate)'],
]

/** 화면에 보이게 한 줄 입력받기 */
function promptLine(question) {
  return new Promise((resolve) => {
    process.stdout.write(question)
    process.stdin.resume()
    process.stdin.setEncoding('utf8')
    process.stdin.once('data', (d) => {
      process.stdin.pause()
      resolve(String(d).trim())
    })
  })
}

let name = process.argv[2]

// 이름을 안 적었으면 목록에서 번호로 고르게 한다
if (!name) {
  if (!process.stdin.isTTY) {
    console.error('사용법: npm run env:set -- 환경변수이름')
    process.exit(1)
  }
  console.log('\n어떤 키를 바꾸시나요? 번호를 입력하세요.\n')
  PRESETS.forEach(([key, label], i) => {
    console.log(`  ${String(i + 1).padStart(2)}. ${label.padEnd(22, ' ')} ${key}`)
  })
  console.log('')
  const answer = await promptLine('번호: ')
  const picked = PRESETS[Number(answer) - 1]
  if (!picked) {
    console.error('❌ 목록에 없는 번호예요. 다시 실행해주세요')
    process.exit(1)
  }
  name = picked[0]
  console.log(`→ ${picked[1]} (${name})\n`)
}

if (!/^[A-Z0-9_]+$/.test(name)) {
  console.error('❌ 환경변수 이름이 올바르지 않아요')
  process.exit(1)
}

/** 키처럼 보이는 한 덩어리인지 (공백·줄바꿈 없이 10자 이상) */
function looksLikeKey(v) {
  return Boolean(v) && !/\s/.test(v) && v.length >= 10
}

/** 화면에 찍히지 않게 입력받기 — 붙여넣어도 터미널 기록에 남지 않는다 */
function promptHidden(question) {
  return new Promise((resolve, reject) => {
    if (!process.stdin.isTTY) {
      reject(new Error('터미널에서 직접 실행해주세요'))
      return
    }
    process.stdout.write(question)
    process.stdin.setRawMode(true)
    process.stdin.resume()
    process.stdin.setEncoding('utf8')

    let buf = ''
    const onData = (ch) => {
      // 엔터 = 입력 끝
      if (ch === '\r' || ch === '\n') {
        process.stdin.setRawMode(false)
        process.stdin.pause()
        process.stdin.removeListener('data', onData)
        process.stdout.write('\n')
        resolve(buf.trim())
        return
      }
      // Ctrl+C
      if (ch === '') {
        process.stdin.setRawMode(false)
        process.stdout.write('\n취소했어요\n')
        process.exit(1)
      }
      // 백스페이스
      if (ch === '') {
        buf = buf.slice(0, -1)
        return
      }
      buf += ch
    }
    process.stdin.on('data', onData)
  })
}

// 1) 클립보드에서 읽기 (맥 전용)
let value = ''
try {
  value = execFileSync('pbpaste', { encoding: 'utf8' }).trim()
} catch {
  value = ''
}

// 2) 클립보드가 키가 아니면(다른 걸 복사한 뒤였다면) 직접 붙여넣게 한다.
//    화면에 안 찍히므로 터미널 기록에 키가 남지 않는다.
if (!looksLikeKey(value)) {
  const reason = !value
    ? '클립보드가 비어 있어요'
    : /\s/.test(value)
      ? '클립보드에 있는 건 키가 아니라 다른 글(공백·줄바꿈 포함)이에요'
      : `클립보드 값이 너무 짧아요(${value.length}자)`
  console.log(`ℹ️  ${reason}`)
  value = await promptHidden(`${name} 값을 붙여넣고 엔터 (화면에 안 보입니다): `)
}

if (!looksLikeKey(value)) {
  console.error('❌ 값이 올바르지 않아요. 키만 정확히 복사했는지 확인해주세요')
  process.exit(1)
}

const original = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, 'utf8') : ''
const lines = original.split('\n')

const today = new Date().toISOString().slice(0, 10)
let replaced = false
const out = []

for (const line of lines) {
  if (line.startsWith(`${name}=`)) {
    // 옛 값은 주석으로 남긴다 (되돌릴 때 필요)
    out.push(`# ${today} 교체 전 값: ${line}`)
    out.push(`${name}=${value}`)
    replaced = true
  } else {
    out.push(line)
  }
}

if (!replaced) {
  if (out.length > 0 && out[out.length - 1].trim() !== '') out.push('')
  out.push(`${name}=${value}`)
}

// 원본 백업 — 한 번만(처음 실행 시)
const backup = `${ENV_PATH}.bak`
if (original && !fs.existsSync(backup)) fs.writeFileSync(backup, original, { mode: 0o600 })

fs.writeFileSync(ENV_PATH, out.join('\n'), { mode: 0o600 })

const masked = `${value.slice(0, 12)}${'•'.repeat(Math.min(12, Math.max(0, value.length - 12)))}`
console.log(`✅ ${name} 넣었어요 — ${masked} (${value.length}자)`)
console.log(replaced ? '   옛 값은 바로 윗줄에 주석으로 남겨뒀어요' : '   새 항목으로 추가했어요')
console.log('\n다음: npm run check:keys 로 실제로 통하는지 확인하세요')
