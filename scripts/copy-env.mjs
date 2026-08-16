#!/usr/bin/env node
/**
 * 환경변수 값 복사 — .env.local에 있는 값을 클립보드로 옮긴다(화면에는 안 보여준다).
 *
 * 왜 필요한가: Vercel에 붙여넣어야 하는데 발급처에서 값을 다시 안 보여주는 경우가 많다.
 * 파일에는 남아 있으므로 여기서 클립보드로만 옮겨준다. 터미널 기록에 값이 남지 않는다.
 *
 * 사용법: npm run key:copy        (목록에서 번호 선택)
 *        npm run key:copy -- ANTHROPIC_API_KEY
 */

import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const ROOT = path.resolve(import.meta.dirname, '..')
const ENV_PATH = path.join(ROOT, '.env.local')

if (!fs.existsSync(ENV_PATH)) {
  console.error('❌ .env.local 파일이 없어요')
  process.exit(1)
}

const raw = fs.readFileSync(ENV_PATH, 'utf8')

// 파일에 실제로 값이 들어 있는 항목만 목록에 올린다([SENSITIVE] 같은 껍데기는 제외)
const entries = []
for (const line of raw.split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (!m) continue
  const value = m[2].trim().replace(/^["']|["']$/g, '')
  if (!value || value === '[SENSITIVE]' || value.length < 8) continue
  entries.push({ name: m[1], value })
}

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

if (!name) {
  if (!process.stdin.isTTY) {
    console.error('사용법: npm run key:copy -- 환경변수이름')
    process.exit(1)
  }
  console.log('\n어떤 값을 복사할까요? 번호를 입력하세요.\n')
  entries.forEach((e, i) => {
    console.log(`  ${String(i + 1).padStart(2)}. ${e.name}`)
  })
  console.log('')
  const answer = await promptLine('번호: ')
  const picked = entries[Number(answer) - 1]
  if (!picked) {
    console.error('❌ 목록에 없는 번호예요')
    process.exit(1)
  }
  name = picked.name
}

const found = entries.find((e) => e.name === name)
if (!found) {
  console.error(`❌ ${name} 값을 파일에서 찾지 못했어요`)
  process.exit(1)
}

execFileSync('pbcopy', { input: found.value })

const masked = `${found.value.slice(0, 12)}${'•'.repeat(Math.min(12, Math.max(0, found.value.length - 12)))}`
console.log(`\n✅ ${name} 복사했어요 — ${masked} (${found.value.length}자)`)
console.log('   이제 Vercel 입력창에 ⌘V로 붙여넣으세요')
console.log('   ⚠️ 다른 걸 복사하면 지워지니 바로 붙여넣으세요\n')
