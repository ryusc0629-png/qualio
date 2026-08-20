// mp3가 실제로 몇 초짜리인지 잰다 (프레임 헤더를 세는 방식).
//
// 왜 필요한가: 자막·화면 길이를 '글자 수 ÷ 읽기 속도'로 추정했더니 음성과 어긋났다.
// 레퍼런스 영상 실측은 8.6자/초인데 문장마다 7.2~10.3자/초로 편차가 커서,
// 추정으로 맞추면 뒤로 갈수록 자막이 목소리보다 밀린다.
// 서버리스에는 ffmpeg이 없으므로 mp3 자체를 읽어 길이를 구한다.

/** MPEG 버전·레이어별 비트레이트 표(kbps). 인덱스 0과 15는 무효 */
const BITRATES: Record<string, number[]> = {
  // MPEG1 Layer3
  '1-3': [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0],
  // MPEG2/2.5 Layer3
  '2-3': [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0],
}

/** MPEG 버전별 샘플레이트(Hz) */
const SAMPLE_RATES: Record<number, number[]> = {
  3: [44100, 48000, 32000, 0], // MPEG1
  2: [22050, 24000, 16000, 0], // MPEG2
  0: [11025, 12000, 8000, 0],  // MPEG2.5
}

/** Layer3 한 프레임에 담기는 샘플 수 */
const SAMPLES_PER_FRAME: Record<number, number> = { 3: 1152, 2: 576, 0: 576 }

/** 파일 앞에 붙은 ID3v2 태그를 건너뛴 위치를 돌려준다 */
function skipId3(buf: Buffer): number {
  if (buf.length < 10) return 0
  if (buf[0] !== 0x49 || buf[1] !== 0x44 || buf[2] !== 0x33) return 0 // 'ID3'
  // 크기는 7비트씩 4바이트(syncsafe)로 적힌다
  const size = (buf[6] << 21) | (buf[7] << 14) | (buf[8] << 7) | buf[9]
  return 10 + size
}

/**
 * mp3 재생 길이(초). 못 읽으면 null.
 *
 * CBR·VBR 모두 프레임을 하나씩 세므로 정확하다.
 */
export function mp3DurationSeconds(buf: Buffer): number | null {
  let pos = skipId3(buf)
  let seconds = 0
  let frames = 0

  while (pos + 4 <= buf.length) {
    // 프레임 동기 워드: 11비트가 모두 1
    if (buf[pos] !== 0xff || (buf[pos + 1] & 0xe0) !== 0xe0) {
      pos++
      continue
    }

    const versionBits = (buf[pos + 1] >> 3) & 0x03 // 3=MPEG1, 2=MPEG2, 0=MPEG2.5
    const layerBits = (buf[pos + 1] >> 1) & 0x03   // 1=Layer3
    if (versionBits === 1 || layerBits === 0) { pos++; continue }

    const bitrateTable = BITRATES[versionBits === 3 ? '1-3' : '2-3']
    const bitrate = bitrateTable[(buf[pos + 2] >> 4) & 0x0f] * 1000
    const sampleRate = SAMPLE_RATES[versionBits]?.[(buf[pos + 2] >> 2) & 0x03] ?? 0
    if (!bitrate || !sampleRate) { pos++; continue }

    const padding = (buf[pos + 2] >> 1) & 0x01
    const samples = SAMPLES_PER_FRAME[versionBits] ?? 1152
    const frameSize = Math.floor((samples / 8) * bitrate / sampleRate) + padding
    if (frameSize <= 4) { pos++; continue }

    seconds += samples / sampleRate
    frames++
    pos += frameSize
  }

  // 프레임을 몇 개 못 찾았으면 mp3가 아니거나 깨진 것 — 추정으로 넘기지 말고 실패로 알린다
  if (frames < 10) return null
  return Math.round(seconds * 100) / 100
}
