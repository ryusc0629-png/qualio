// WAV 다루기 — 나레이션 앞뒤 무음을 정확히 잘라낸다.
//
// 왜 mp3가 아니라 wav인가: mp3는 압축돼 있어서 어디가 무음인지 알려면 디코딩을 해야 한다.
// 서버리스에는 ffmpeg이 없다. wav는 샘플이 그대로 들어 있어 훑기만 하면 된다.
//
// 왜 잘라야 하나: 문장을 하나씩 합성해 이어 붙이는데, 파일마다 앞뒤에 짧은 무음이 붙는다.
// 그게 쌓여서 문장 사이가 뜨고, 사장님 귀에는 "숨 쉬는 시간"으로 들린다.
// 예전엔 0.12초를 감으로 잘랐는데, 실제 무음 길이는 파일마다 달라서 어떤 건 남고 어떤 건 말끝이 잘렸다.

/** 이 값보다 작은 샘플은 무음으로 본다 (16비트 최대 32768 기준 약 -46dB) */
const SILENCE_THRESHOLD = 160
/** 말이 시작되기 직전/끝난 직후에 남겨두는 여유(초) — 딱 붙여 자르면 말끝이 씹힌다 */
const PAD_SECONDS = 0.04

export interface WavInfo {
  /** 오디오 데이터가 시작되는 바이트 위치 */
  dataOffset: number
  dataLength: number
  sampleRate: number
  channels: number
  bitsPerSample: number
}

/** WAV 헤더를 읽는다. WAV가 아니면 null */
export function readWavInfo(buf: Buffer): WavInfo | null {
  if (buf.length < 44) return null
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') return null

  let pos = 12
  let sampleRate = 0
  let channels = 0
  let bitsPerSample = 0

  // 청크를 순서대로 훑는다 — fmt와 data 사이에 다른 청크가 낄 수 있다
  while (pos + 8 <= buf.length) {
    const id = buf.toString('ascii', pos, pos + 4)
    const size = buf.readUInt32LE(pos + 4)
    const body = pos + 8

    if (id === 'fmt ' && body + 16 <= buf.length) {
      channels = buf.readUInt16LE(body + 2)
      sampleRate = buf.readUInt32LE(body + 4)
      bitsPerSample = buf.readUInt16LE(body + 14)
    } else if (id === 'data') {
      if (!sampleRate || !channels || bitsPerSample !== 16) return null
      return {
        dataOffset: body,
        dataLength: Math.min(size, buf.length - body),
        sampleRate,
        channels,
        bitsPerSample,
      }
    }
    // 청크 크기는 짝수로 정렬된다
    pos = body + size + (size % 2)
  }
  return null
}

/** 44바이트 WAV 헤더를 새로 만든다 */
function wavHeader(dataLength: number, sampleRate: number, channels: number): Buffer {
  const h = Buffer.alloc(44)
  const byteRate = sampleRate * channels * 2
  h.write('RIFF', 0, 'ascii')
  h.writeUInt32LE(36 + dataLength, 4)
  h.write('WAVE', 8, 'ascii')
  h.write('fmt ', 12, 'ascii')
  h.writeUInt32LE(16, 16)
  h.writeUInt16LE(1, 20) // PCM
  h.writeUInt16LE(channels, 22)
  h.writeUInt32LE(sampleRate, 24)
  h.writeUInt32LE(byteRate, 28)
  h.writeUInt16LE(channels * 2, 32)
  h.writeUInt16LE(16, 34)
  h.write('data', 36, 'ascii')
  h.writeUInt32LE(dataLength, 40)
  return h
}

export interface TrimmedWav {
  wav: Buffer
  /** 잘라낸 뒤의 재생 길이(초) */
  seconds: number
  /** 앞에서 잘라낸 무음(초) — 로그용 */
  trimmedHead: number
  /** 뒤에서 잘라낸 무음(초) — 로그용 */
  trimmedTail: number
}

/**
 * 앞뒤 무음을 잘라낸 WAV를 돌려준다. WAV가 아니거나 전부 무음이면 null.
 *
 * 말과 말 사이의 무음은 건드리지 않는다 — 그건 문장 안의 자연스러운 끊김이다.
 * 잘라내는 건 파일 맨 앞과 맨 뒤뿐이다.
 */
export function trimWavSilence(buf: Buffer): TrimmedWav | null {
  const info = readWavInfo(buf)
  if (!info) return null

  const { dataOffset, dataLength, sampleRate, channels } = info
  const bytesPerFrame = channels * 2
  const frames = Math.floor(dataLength / bytesPerFrame)
  if (frames === 0) return null

  // 한 프레임(모든 채널)에서 가장 큰 진폭
  const peakAt = (frame: number): number => {
    let peak = 0
    const base = dataOffset + frame * bytesPerFrame
    for (let c = 0; c < channels; c++) {
      const v = Math.abs(buf.readInt16LE(base + c * 2))
      if (v > peak) peak = v
    }
    return peak
  }

  let first = 0
  while (first < frames && peakAt(first) < SILENCE_THRESHOLD) first++
  if (first >= frames) return null // 통째로 무음

  let last = frames - 1
  while (last > first && peakAt(last) < SILENCE_THRESHOLD) last--

  const pad = Math.round(PAD_SECONDS * sampleRate)
  const start = Math.max(0, first - pad)
  const end = Math.min(frames - 1, last + pad)

  const keepBytes = (end - start + 1) * bytesPerFrame
  const body = buf.subarray(dataOffset + start * bytesPerFrame, dataOffset + start * bytesPerFrame + keepBytes)

  return {
    wav: Buffer.concat([wavHeader(keepBytes, sampleRate, channels), body]),
    seconds: Math.round(((end - start + 1) / sampleRate) * 1000) / 1000,
    trimmedHead: Math.round((start / sampleRate) * 1000) / 1000,
    trimmedTail: Math.round(((frames - 1 - end) / sampleRate) * 1000) / 1000,
  }
}
