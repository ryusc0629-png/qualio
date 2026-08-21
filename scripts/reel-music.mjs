// 홍보 영상 배경음악 만들기 (로컬 전용)
//
// 왜 만들어 두나: 배경음악은 영상마다 새로 만들 필요가 없다. 8초짜리 루프 몇 개면
// 고객사 50곳이 평생 돌려 쓴다. 그래서 '한 번 만들어 두는' 도구다.
// 구독 없이 쓴 만큼만 내는 fal.ai로 만든다(FAL_KEY는 이미 이미지 생성에 쓰고 있다).
//
// ⚠️ 저작권: 아무 노래나 넣으면 인스타·유튜브가 음원을 식별해 수익을 가져가거나
//    영상을 내린다. 여기서 만든 트랙은 우리가 소유하므로 그 위험이 없다.
//
// 사용법:
//   node scripts/reel-music.mjs                    후보 4개 생성 → ~/Downloads/퀄리오-릴스음악/
//   node scripts/reel-music.mjs --count 6          개수 지정
//   node scripts/reel-music.mjs --seconds 12       길이 지정 (기본 10초)
//   node scripts/reel-music.mjs --upload 트랙.mp3  고른 트랙을 스토리지에 올리고 주소를 출력
//
// 고른 뒤:
//   1) --upload 로 올리면 공개 주소가 나온다
//   2) 그 주소를 Vercel 환경변수 REEL_MUSIC_URL 에 넣는다
//   3) 다음 영상부터 배경음악이 깔린다 (볼륨 15%는 코드에 고정)

import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, basename } from 'node:path'
import nextEnv from '@next/env'
import { fal } from '@fal-ai/client'
import { createClient } from '@supabase/supabase-js'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'

const { loadEnvConfig } = nextEnv
loadEnvConfig(process.cwd())

// Stable Audio Open — 루프·효과음에 특화돼 있고 fal에서 가장 싸다.
// 출력물은 만든 사람 소유(Stability AI Community License, 연매출 100만 달러 미만).
const MODEL = 'fal-ai/stable-audio'

// 나레이션이 주인공이라 배경음악은 '맥박'이어야 한다.
// ⛔멜로디·보컬·훅이 있으면 8%로 줄여도 말과 부딪힌다. 드럼·베이스 중심으로만 뽑는다.
const CANDIDATES = [
  {
    name: '1-단단한비트',
    prompt:
      'minimal tech house drum loop, 124 BPM, tight kick and crisp closed hi-hat, subtle sub bass, ' +
      'no melody, no vocals, no risers, clean and dry, seamless loop',
  },
  {
    name: '2-빠른긴장감',
    prompt:
      'driving percussion loop, 132 BPM, punchy kick, shaker and rim clicks, muted pulsing bass note, ' +
      'urgent and focused, no melody, no vocals, seamless loop',
  },
  {
    name: '3-부드러운펄스',
    prompt:
      'soft lo-fi hip hop drum loop, 90 BPM, warm muted kick, brushed snare, gentle bass pulse, ' +
      'calm and clean, no melody, no vocals, seamless loop',
  },
  {
    name: '4-밝은리듬',
    prompt:
      'upbeat pop percussion loop, 118 BPM, claps and light toms, bright and energetic, ' +
      'no melody, no vocals, no build-up, seamless loop',
  },
  {
    name: '5-깊은저음',
    prompt:
      'deep house groove loop, 122 BPM, round kick, soft closed hats, warm analog bassline single note, ' +
      'steady and hypnotic, no vocals, no lead melody, seamless loop',
  },
  {
    name: '6-절제된타악',
    prompt:
      'sparse cinematic percussion loop, 110 BPM, low taiko-style hits and subtle ticks, ' +
      'tense and restrained, no melody, no vocals, seamless loop',
  },
]

function parseArgs(argv) {
  const out = { count: 4, seconds: 10, upload: null }
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--count') out.count = Math.min(CANDIDATES.length, Math.max(1, parseInt(argv[++i], 10) || 4))
    else if (a === '--seconds') out.seconds = Math.min(30, Math.max(4, parseInt(argv[++i], 10) || 10))
    else if (a === '--upload') out.upload = argv[++i]
  }
  return out
}


/**
 * 트랙 끝의 무음을 잘라낸다.
 *
 * ⚠️왜 필요한가: 생성된 트랙은 끝에 1초 안팎의 무음이 붙어 나온다("seamless loop"라고
 *   써넣어도 그렇다). 그대로 반복시키면 한 바퀴마다 소리가 뚝 끊겨 고장 난 것처럼 들린다.
 *   실제로 첫 업로드에서 12초 트랙 끝에 1.09초 무음이 있었다.
 *
 * ffmpeg이 없으면 원본을 그대로 쓰고 경고만 남긴다 — 못 올리는 것보단 낫다.
 */
function trimTrailingSilence(filePath) {
  try {
    execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' })
  } catch {
    console.warn('⚠️  ffmpeg이 없어 끝 무음을 못 잘랐습니다. 반복 재생 시 소리가 끊길 수 있어요.')
    return filePath
  }

  // ⚠️ffmpeg은 분석 결과를 stdout이 아니라 stderr로 내보내고, 성공해도 종료코드가 0이다.
  //   예전엔 try/catch로 잡으려다 정상 종료하면 파싱을 아예 안 타서 무음이 그대로 남았다.
  let log = ''
  try {
    // stderr를 stdout으로 합쳐 받는다 — 종료코드와 무관하게 항상 로그를 손에 쥔다
    log = execFileSync(
      'sh',
      ['-c', `ffmpeg -hide_banner -i "$1" -af silencedetect=n=-45dB:d=0.05 -f null - 2>&1`, 'sh', filePath],
      { encoding: 'utf8' },
    )
  } catch (e) {
    log = String(e.stdout ?? '') + String(e.stderr ?? '')
  }

  const dm = log.match(/Duration: (\d+):(\d+):([\d.]+)/)
  const dur = dm ? Number(dm[1]) * 3600 + Number(dm[2]) * 60 + Number(dm[3]) : 0
  if (!dur) return filePath

  const starts = [...log.matchAll(/silence_start: ([\d.]+)/g)].map((m) => parseFloat(m[1]))
  const lastStart = starts.at(-1)
  if (lastStart === undefined) return filePath

  // 마지막 무음이 파일 끝까지 이어질 때만 자른다(중간 무음은 리듬의 일부일 수 있다)
  const ends = [...log.matchAll(/silence_end: ([\d.]+)/g)].map((m) => parseFloat(m[1]))
  const lastEnd = ends.at(-1)
  if (lastEnd !== undefined && lastEnd > lastStart && lastEnd < dur - 0.05) return filePath

  const keep = Math.max(1, lastStart - 0.02)
  if (keep >= dur - 0.05) return filePath

  const trimmed = join(tmpdir(), `reel-music-trimmed-${Date.now()}.mp3`)
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', filePath, '-t', String(keep), '-c:a', 'libmp3lame', '-b:a', '192k', trimmed])
  console.log(`   끝 무음 ${(dur - keep).toFixed(2)}초를 잘랐습니다 (${dur.toFixed(1)}초 → ${keep.toFixed(1)}초)`)
  return trimmed
}

/** 고른 트랙을 스토리지에 올리고 공개 주소를 돌려준다 */
async function upload(filePath) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key || key === '[SENSITIVE]') {
    console.error(
      '❌ 스토리지 키가 없습니다.\n' +
        '   .env.local 의 SUPABASE_SERVICE_ROLE_KEY 가 비어 있거나 가려져 있어요.\n' +
        '   (vercel env pull 은 민감값을 가립니다 — Supabase 대시보드에서 복사해 넣어주세요)\n',
    )
    process.exit(1)
  }
  if (!existsSync(filePath)) {
    console.error(`❌ 파일이 없습니다: ${filePath}`)
    process.exit(1)
  }

  // 반복 재생될 트랙이라 끝 무음을 먼저 잘라낸다
  const source = trimTrailingSilence(filePath)

  const db = createClient(url, key)
  const bytes = readFileSync(source)
  // ⚠️스토리지 키에는 한글·공백을 못 쓴다(Invalid key). 파일명은 한글로 두되 키만 영문으로 바꾼다.
  const safe = basename(filePath)
    .replace(/\.[^.]+$/, '')
    .replace(/[^\w-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || 'track'
  // 업체별 폴더가 아니라 공용 자리에 둔다 — 모든 고객사가 같은 트랙을 쓴다
  const path = `_shared/reel-music/${safe}-${Date.now()}.mp3`

  const { error } = await db.storage
    .from('report-photos')
    .upload(path, bytes, { contentType: 'audio/mpeg', upsert: true })

  if (error) {
    console.error('❌ 업로드 실패:', error.message)
    process.exit(1)
  }

  const publicUrl = db.storage.from('report-photos').getPublicUrl(path).data.publicUrl
  console.log('\n✅ 올렸습니다.\n')
  console.log(`   ${publicUrl}\n`)
  console.log('   이제 Vercel 환경변수에 아래 한 줄을 넣으면 배경음악이 켜집니다:')
  console.log(`     REEL_MUSIC_URL=${publicUrl}\n`)
}

async function main() {
  const args = parseArgs(process.argv)

  if (args.upload) return upload(args.upload)

  if (!process.env.FAL_KEY || process.env.FAL_KEY === '[SENSITIVE]') {
    console.error(
      '❌ .env.local 에 FAL_KEY 가 없습니다(또는 가려져 있습니다).\n' +
        '   fal.ai 대시보드에서 값을 복사해 .env.local 에 넣어주세요:\n' +
        '     FAL_KEY=여기에_붙여넣기\n',
    )
    process.exit(1)
  }
  fal.config({ credentials: process.env.FAL_KEY })

  const outDir = join(homedir(), 'Downloads', '퀄리오-릴스음악')
  mkdirSync(outDir, { recursive: true })

  const picks = CANDIDATES.slice(0, args.count)
  console.log(`\n🎵 배경음악 후보 ${picks.length}개를 ${args.seconds}초짜리로 만듭니다...`)
  console.log(`   저장 위치: ${outDir}\n`)

  const saved = []
  for (const [i, c] of picks.entries()) {
    process.stdout.write(`  [${i + 1}/${picks.length}] ${c.name} ... `)
    try {
      const res = await fal.subscribe(MODEL, {
        input: { prompt: c.prompt, seconds_total: args.seconds, steps: 100 },
      })
      const audioUrl = res?.data?.audio_file?.url ?? res?.data?.audio?.url
      if (!audioUrl) {
        console.log('실패 (응답에 파일이 없음)')
        continue
      }
      const bytes = Buffer.from(await (await fetch(audioUrl)).arrayBuffer())
      const file = join(outDir, `${c.name}.mp3`)
      writeFileSync(file, bytes)
      saved.push(file)
      console.log(`완료 (${(bytes.length / 1024).toFixed(0)}KB)`)
    } catch (err) {
      console.log(`실패 — ${err?.message ?? err}`)
    }
  }

  if (saved.length === 0) {
    console.error('\n❌ 하나도 못 만들었어요. FAL_KEY와 잔액을 확인해주세요.\n')
    process.exit(1)
  }

  console.log(`\n✅ ${saved.length}개 만들었습니다. 폴더를 열어 들어보세요:\n   ${outDir}\n`)
  console.log('   마음에 드는 걸 고른 뒤:')
  console.log(`     node scripts/reel-music.mjs --upload "${saved[0]}"\n`)
}

main().catch((err) => {
  console.error('\n❌ 오류:', err?.message ?? err, '\n')
  process.exit(1)
})
