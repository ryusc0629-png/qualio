'use client'

import { useState, useEffect, useTransition } from 'react'
import { toast } from 'sonner'
import {
  buildRoadmapAction,
  buildDirectoryRoadmapAction,
  listSigunguAction,
} from '@/lib/actions/roadmap'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { MapPin, Phone, Navigation, Users, ClipboardList, Map, Upload, Sparkles } from 'lucide-react'

export interface LeadOption {
  id: string
  name: string
  address: string
  phone: string
}

interface GeoStop {
  name: string
  address: string
  phone?: string
  lat: number
  lng: number
}

interface Course {
  stops: GeoStop[]
  km: number
}

interface RoadmapResult {
  courses: Course[]
  geocodedCount: number
  failedCount: number
  failedNames: string[]
  totalKm: number
  capped?: boolean
}

interface RoadmapPlannerProps {
  leads: LeadOption[]
  defaultStart: string
  sidoOptions: string[]
}

// 붙여넣은 텍스트를 한 줄씩 (상호 / 주소 / 전화)로 파싱. 탭·쉼표 구분 모두 허용.
function parsePaste(text: string): { name: string; address: string; phone?: string }[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const cols = line.split(/\t|,/).map((c) => c.trim())
      return { name: cols[0] ?? '', address: cols[1] ?? '', phone: cols[2] || undefined }
    })
    .filter((r) => r.name && r.address)
}

// CSV 한 줄을 컬럼으로 분리 (따옴표 감싼 필드 안의 쉼표 보호)
function splitCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (ch === ',' && !inQuotes) {
      out.push(cur)
      cur = ''
    } else {
      cur += ch
    }
  }
  out.push(cur)
  return out.map((c) => c.trim())
}

// 업로드한 CSV → "상호, 주소, 전화" 정규화 텍스트. 헤더에서 컬럼 위치를 찾고, 없으면 앞 3칸 사용.
function csvToPasteText(raw: string): { text: string; count: number } {
  const clean = raw.replace(/^﻿/, '')
  const lines = clean.split(/\r?\n/).filter((l) => l.trim())
  if (lines.length === 0) return { text: '', count: 0 }

  const header = splitCsvLine(lines[0])
  const findIdx = (keys: string[]) =>
    header.findIndex((h) => keys.some((k) => h.includes(k)))
  const nameIdx = findIdx(['상호', '업체', '이름', 'company', 'name'])
  const addrIdx = findIdx(['주소', 'address'])
  const phoneIdx = findIdx(['전화', '연락처', 'phone', 'tel'])
  const hasHeader = nameIdx !== -1 && addrIdx !== -1

  const ni = hasHeader ? nameIdx : 0
  const ai = hasHeader ? addrIdx : 1
  const pi = hasHeader ? phoneIdx : 2
  const body = hasHeader ? lines.slice(1) : lines

  const rows = body
    .map((line) => {
      const cols = splitCsvLine(line)
      const name = (cols[ni] ?? '').trim()
      const address = (cols[ai] ?? '').trim()
      const phone = pi >= 0 ? (cols[pi] ?? '').trim() : ''
      return { name, address, phone }
    })
    .filter((r) => r.name && r.address)

  const text = rows
    .map((r) => [r.name, r.address, r.phone].filter(Boolean).join(', '))
    .join('\n')
  return { text, count: rows.length }
}

// 카카오맵 구간 길안내 URL — 실제 한국 도로 내비 됨(구글은 한국 자동차 길안내 불가).
// 카카오는 경유지(vp~vp5) 최대 5개 → 한 링크에 출발+경유5+도착 = 최대 7곳. 초과분은 겹쳐서 분할.
// 각 구간이 몇 번째~몇 번째 방문지인지(from~to)도 함께 반환해 버튼에 표시.
function kakaoRouteUrls(stops: GeoStop[]): { url: string; from: number; to: number }[] {
  if (stops.length === 0) return []
  if (stops.length === 1) {
    const s = stops[0]
    return [{ url: `https://map.kakao.com/link/to/${encodeURIComponent(s.name)},${s.lat},${s.lng}`, from: 1, to: 1 }]
  }
  const out: { url: string; from: number; to: number }[] = []
  const CHUNK = 7 // 출발 + 경유 최대5 + 도착
  for (let i = 0; i < stops.length - 1; i += CHUNK - 1) {
    const seg = stops.slice(i, i + CHUNK)
    const sp = seg[0]
    const ep = seg[seg.length - 1]
    const mids = seg.slice(1, -1) // 경유지 (최대 5)
    const params = [`sp=${sp.lat},${sp.lng}`, `ep=${ep.lat},${ep.lng}`]
    mids.forEach((m, idx) => {
      params.push(`${idx === 0 ? 'vp' : `vp${idx + 1}`}=${m.lat},${m.lng}`)
    })
    params.push('by=CAR')
    out.push({ url: `kakaomap://route?${params.join('&')}`, from: i + 1, to: i + seg.length })
  }
  return out
}

// 티맵 한 목적지 안내 (goalname/goalx/goaly 형식은 iOS·Android 모두 동작)
function tmapUrl(name: string, lat: number, lng: number): string {
  return `tmap://route?goalname=${encodeURIComponent(name)}&goalx=${lng}&goaly=${lat}`
}

function kakaoNav(name: string, lat: number, lng: number): string {
  return `https://map.kakao.com/link/to/${encodeURIComponent(name)},${lat},${lng}`
}

// 퀄리오가 알아서 하루치로 나누는 기준(방문영업 현실 감안 하루 약 25곳)
const DEFAULT_PER_DAY = 25

// 시군구 원본 목록 → 드롭다운 옵션(전체 / 시 전체 / 개별 구·군)
function buildSigunguOptions(list: string[]): { label: string; value: string }[] {
  const opts: { label: string; value: string }[] = [{ label: '이 지역 전체', value: '' }]
  // 여러 구로 나뉜 시(예: 창원시 의창구/성산구…)는 '창원시 전체'를 추가
  const multiGuCities = new Set<string>()
  const seen = new Set<string>()
  for (const s of list) {
    const sp = s.indexOf(' ')
    if (sp > 0) {
      const city = s.slice(0, sp)
      if (seen.has(city)) multiGuCities.add(city)
      seen.add(city)
    }
  }
  const cityAdded = new Set<string>()
  for (const s of list) {
    const sp = s.indexOf(' ')
    const city = sp > 0 ? s.slice(0, sp) : ''
    if (city && multiGuCities.has(city) && !cityAdded.has(city)) {
      opts.push({ label: `${city} 전체`, value: city })
      cityAdded.add(city)
    }
    opts.push({ label: `  ${s}`, value: s })
  }
  return opts
}

// 타겟 업종 — 고정 선택(자유입력 없음). DB엔 이 업종들만 저장돼 있음.
// 공장은 상가정보에 실제 데이터가 없어(산업단지 미포함) 제외. 필요시 공장등록현황 별도 연동.
const TARGET_CATEGORIES = ['인테리어', '병의원', '학원']

type Mode = 'directory' | 'leads' | 'paste'

// 짜둔 코스를 브라우저에 저장 → 페이지를 떠났다 와도, 새로고침해도 그대로 유지
const STORAGE_KEY = 'qualio_roadmap_v1'

interface SavedRoadmap {
  savedAt: number
  summary: string
  result: RoadmapResult
}

function loadSavedRoadmap(): SavedRoadmap | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as SavedRoadmap) : null
  } catch {
    return null
  }
}

function persistRoadmap(v: SavedRoadmap) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(v))
  } catch {
    // 용량 초과 등은 조용히 무시 (저장 실패해도 기능은 정상)
  }
}

function removeSavedRoadmap() {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // noop
  }
}

export function RoadmapPlanner({ leads, defaultStart, sidoOptions }: RoadmapPlannerProps) {
  const [mode, setMode] = useState<Mode>(sidoOptions.length > 0 ? 'directory' : leads.length > 0 ? 'leads' : 'paste')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [paste, setPaste] = useState('')
  const [start, setStart] = useState(defaultStart)
  const [result, setResult] = useState<RoadmapResult | null>(null)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [summary, setSummary] = useState('')
  const [isPending, startTransition] = useTransition()

  // 저장해둔 코스가 있으면 복원 (페이지 재진입·새로고침해도 유지)
  useEffect(() => {
    const saved = loadSavedRoadmap()
    if (saved) {
      setResult(saved.result)
      setSavedAt(saved.savedAt)
      setSummary(saved.summary)
    }
  }, [])

  // 지역+업종 자동 모드 상태
  const [dirSido, setDirSido] = useState('')
  const [dirSigungu, setDirSigungu] = useState('')
  const [dirTarget, setDirTarget] = useState('')
  const [sigunguList, setSigunguList] = useState<string[]>([])
  const [loadingSigungu, setLoadingSigungu] = useState(false)

  const handleSidoChange = (sido: string) => {
    setDirSido(sido)
    setDirSigungu('')
    setSigunguList([])
    if (!sido) return
    setLoadingSigungu(true)
    startTransition(async () => {
      const res = await listSigunguAction({ sido })
      setLoadingSigungu(false)
      if (res?.data?.sigungu) setSigunguList(res.data.sigungu)
      else if (res?.serverError) toast.error(res.serverError)
    })
  }

  const toggleLead = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const allSelected = leads.length > 0 && selected.size === leads.length
  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(leads.map((l) => l.id)))
  }

  // CSV 파일 업로드 → 붙여넣기 칸에 자동 정리
  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = '' // 같은 파일 재선택 허용
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const { text, count } = csvToPasteText(String(reader.result ?? ''))
      if (count === 0) {
        toast.error('파일에서 상호·주소를 못 찾았어요. 컬럼을 확인해주세요')
        return
      }
      setMode('paste')
      setPaste(text)
      if (count > 400) {
        toast.warning(`${count}곳을 불러왔어요. 한 번에 400곳까지만 되니 시·군·구별로 나눠서 짜주세요`)
      } else {
        toast.success(`${count}곳을 불러왔어요`)
      }
    }
    reader.onerror = () => toast.error('파일을 못 읽었어요')
    reader.readAsText(file, 'utf-8')
  }

  const applyResult = (data: RoadmapResult, label: string) => {
    const now = Date.now()
    setResult(data)
    setSummary(label)
    setSavedAt(now)
    persistRoadmap({ savedAt: now, summary: label, result: data })
    toast.success(`${data.courses.length}개 코스로 짰어요!`)
  }

  // 저장된 코스 지우기 (다시 짜기 전까지는 유지되므로, 지울 때만 사라짐)
  const clearSavedRoadmap = () => {
    setResult(null)
    setSavedAt(null)
    setSummary('')
    removeSavedRoadmap()
  }

  const handleBuild = () => {
    // 지역+업종 자동 모드
    if (mode === 'directory') {
      if (!dirSido) {
        toast.error('지역을 골라주세요')
        return
      }
      if (!dirTarget) {
        toast.error('어떤 업종을 돌지 골라주세요')
        return
      }
      startTransition(async () => {
        const res = await buildDirectoryRoadmapAction({
          sido: dirSido,
          sigungu: dirSigungu,
          target: dirTarget,
          perDay: DEFAULT_PER_DAY,
          startAddress: start.trim() || undefined,
        })
        if (res?.serverError) {
          toast.error(res.serverError)
          return
        }
        if (res?.data) applyResult(res.data, `${dirSido} ${dirSigungu || '전체'} · ${dirTarget}`)
      })
      return
    }

    // 리드 선택 / 명단 붙여넣기 모드
    const stops =
      mode === 'leads'
        ? leads
            .filter((l) => selected.has(l.id))
            .map((l) => ({ name: l.name, address: l.address, phone: l.phone || undefined }))
        : parsePaste(paste)

    if (stops.length === 0) {
      toast.error(mode === 'leads' ? '방문할 곳을 골라주세요' : '명단을 붙여넣어주세요')
      return
    }

    startTransition(async () => {
      const res = await buildRoadmapAction({
        stops,
        perDay: DEFAULT_PER_DAY,
        startAddress: start.trim() || undefined,
      })
      if (res?.serverError) {
        toast.error(res.serverError)
        return
      }
      if (res?.data)
        applyResult(
          res.data,
          mode === 'leads' ? `내 리드 ${stops.length}곳` : `붙여넣은 명단 ${stops.length}곳`,
        )
    })
  }

  // 데이터 있는 지역이 없으면 지역+업종 모드는 숨김
  const modeTabs: { key: Mode; label: string; icon: typeof Sparkles }[] = [
    ...(sidoOptions.length > 0
      ? [{ key: 'directory' as Mode, label: '지역+업종 자동', icon: Sparkles }]
      : []),
    { key: 'leads', label: '내 리드에서', icon: Users },
    { key: 'paste', label: '명단 붙여넣기', icon: ClipboardList },
  ]

  return (
    <div className="space-y-5">
      {/* 방법 전환 — 작은 탭(큰 버튼 아님) */}
      {modeTabs.length > 1 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm border-b pb-3">
          {modeTabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setMode(t.key)}
              className={`inline-flex items-center gap-1.5 ${
                mode === t.key
                  ? 'font-bold text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <t.icon className="h-4 w-4" />
              {t.label}
            </button>
          ))}
        </div>
      )}

      {/* 지역+업종 자동 (기본·메인) */}
      {mode === 'directory' && (
        <div className="space-y-3 rounded-lg border p-4">
          <p className="text-xs text-muted-foreground">
            우리 지역과 찾는 업종만 고르면, 그 지역 전체를 하루씩 돌기 좋게 며칠 코스로 나눠 짜드려요.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="dirSido">지역(시·도)</Label>
              <select
                id="dirSido"
                value={dirSido}
                onChange={(e) => handleSidoChange(e.target.value)}
                className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">고르기</option>
                {sidoOptions.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dirSigungu">범위</Label>
              <select
                id="dirSigungu"
                value={dirSigungu}
                onChange={(e) => setDirSigungu(e.target.value)}
                disabled={!dirSido || loadingSigungu}
                className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm disabled:opacity-50"
              >
                {loadingSigungu ? (
                  <option value="">불러오는 중...</option>
                ) : (
                  buildSigunguOptions(sigunguList).map((o) => (
                    <option key={o.value || '__all'} value={o.value}>
                      {o.label}
                    </option>
                  ))
                )}
              </select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>어떤 업종을 도시겠어요? (필수)</Label>
            <div className="grid grid-cols-2 gap-2">
              {TARGET_CATEGORIES.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setDirTarget(c)}
                  className={`h-11 rounded-lg border text-sm font-semibold ${
                    dirTarget === c
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border text-muted-foreground hover:bg-muted'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              상가정보엔 전화번호가 없어 내비만 제공돼요.
            </p>
          </div>
        </div>
      )}

      {/* 리드 선택 */}
      {mode === 'leads' &&
        (leads.length === 0 ? (
          <div className="text-center py-10 space-y-2 border border-dashed rounded-lg">
            <p className="text-muted-foreground text-sm">주소가 등록된 리드가 아직 없어요</p>
            <p className="text-xs text-muted-foreground">
              &lsquo;명단 붙여넣기&rsquo;로 바로 코스를 짤 수 있어요
            </p>
          </div>
        ) : (
          <div className="border rounded-lg divide-y max-h-72 overflow-y-auto">
            <button
              type="button"
              onClick={toggleAll}
              className="w-full px-3 py-2.5 text-left text-sm font-semibold text-primary flex items-center justify-between sticky top-0 bg-white"
            >
              <span>전체 {allSelected ? '해제' : '선택'}</span>
              <span className="text-xs text-muted-foreground">{selected.size}곳 선택됨</span>
            </button>
            {leads.map((l) => (
              <label key={l.id} className="flex items-start gap-3 px-3 py-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selected.has(l.id)}
                  onChange={() => toggleLead(l.id)}
                  className="mt-1 h-4 w-4 accent-primary shrink-0"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-medium truncate">{l.name}</span>
                  <span className="block text-xs text-muted-foreground truncate">{l.address}</span>
                </span>
              </label>
            ))}
          </div>
        ))}

      {/* 명단 붙여넣기 */}
      {mode === 'paste' && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="paste">방문할 곳 명단</Label>
            <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary cursor-pointer">
              <Upload className="h-3.5 w-3.5" /> CSV 파일 올리기
              <input type="file" accept=".csv,text/csv" onChange={handleFile} className="hidden" />
            </label>
          </div>
          <Textarea
            id="paste"
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            rows={7}
            placeholder={'한 줄에 한 곳씩 (상호, 주소, 전화)\n예) 길인테리어, 경남 거제시 거제중앙로3길 14, 055-636-8950'}
            className="text-sm"
          />
          <p className="text-xs text-muted-foreground">
            엑셀에서 복사해 붙여넣어도 돼요. 전화번호는 없어도 됩니다.
          </p>
        </div>
      )}

      {/* 출발지 — 설정의 업체 주소가 자동으로 채워짐 */}
      <div className="space-y-1.5">
        <Label htmlFor="start">출발지</Label>
        <Input
          id="start"
          value={start}
          onChange={(e) => setStart(e.target.value)}
          placeholder="예) 울산 남구 삼산로 300"
        />
        <p className="text-xs text-muted-foreground">
          설정에 저장된 업체 주소가 자동으로 들어가요. 그날 다른 곳에서 출발하면 여기만 바꾸세요.
        </p>
      </div>

      <Button onClick={handleBuild} disabled={isPending} className="w-full h-12 text-base font-bold">
        {isPending ? '코스 짜는 중...' : '동선 코스 만들기'}
      </Button>

      {/* 결과 */}
      {result && (
        <div className="space-y-4 pt-2">
          {/* 저장된 코스 안내 — 다시 짜기 전까지 유지됨 */}
          {savedAt && (
            <div className="flex items-center justify-between gap-2 rounded-lg bg-muted/60 px-3 py-2">
              <span className="text-xs text-muted-foreground min-w-0 truncate">
                {summary ? `${summary} · ` : ''}
                {new Date(savedAt).toLocaleString('ko-KR', {
                  month: 'long',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                  timeZone: 'Asia/Seoul',
                })}
                에 짠 코스예요
              </span>
              <button
                type="button"
                onClick={clearSavedRoadmap}
                className="text-xs text-muted-foreground underline shrink-0"
              >
                지우기
              </button>
            </div>
          )}
          <div className="text-sm text-muted-foreground">
            총 {result.geocodedCount}곳 · {result.courses.length}일 코스 · 이동 약{' '}
            {Math.round(result.totalKm)}km
            {result.capped && (
              <span className="block text-xs text-amber-600 mt-1">
                너무 많아 1,500곳까지만 담았어요. 범위를 좁히거나(구 단위) 업종을 더 구체적으로 골라보세요.
              </span>
            )}
            {result.failedCount > 0 && (
              <span className="block text-xs text-amber-600 mt-1">
                주소를 못 찾은 {result.failedCount}곳은 빠졌어요
                {result.failedNames.length > 0 && ` (${result.failedNames.slice(0, 5).join(', ')}${result.failedCount > 5 ? ' 외' : ''})`}
              </span>
            )}
          </div>

          {result.courses.map((course, ci) => {
            const urls = kakaoRouteUrls(course.stops)
            return (
              <div key={ci} className="border rounded-xl p-4 space-y-3 bg-white shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="font-bold">코스 {ci + 1}일차</span>
                  <span className="text-xs text-muted-foreground">
                    {course.stops.length}곳 · 약 {Math.round(course.km)}km
                  </span>
                </div>

                {urls.map((u, ui) => (
                  <a
                    key={ui}
                    href={u.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 h-11 rounded-lg bg-primary text-primary-foreground text-sm font-semibold"
                  >
                    <Map className="h-4 w-4" />
                    {urls.length > 1
                      ? `카카오맵 길안내 (${u.from}~${u.to}번째)`
                      : '카카오맵으로 전체 길안내'}
                  </a>
                ))}
                {urls.length > 1 && (
                  <p className="text-xs text-muted-foreground text-center -mt-1">
                    카카오맵은 한 번에 7곳까지 안내돼서, 하루 코스를 구간별로 나눠 열어드려요.
                  </p>
                )}

                <div className="divide-y">
                  {course.stops.map((s, si) => (
                    <div key={si} className="flex gap-3 py-2.5">
                      <span className="flex-none w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center">
                        {si + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{s.name}</p>
                        <p className="text-xs text-muted-foreground flex items-start gap-1">
                          <MapPin className="h-3 w-3 mt-0.5 shrink-0" />
                          {s.address}
                        </p>
                        <div className="flex gap-2 mt-1.5">
                          <a
                            href={tmapUrl(s.name, s.lat, s.lng)}
                            className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-md bg-[#1a4ff5] text-white font-medium"
                          >
                            <Navigation className="h-3 w-3" /> 티맵
                          </a>
                          <a
                            href={kakaoNav(s.name, s.lat, s.lng)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-md bg-[#fee500] text-black font-medium"
                          >
                            <Navigation className="h-3 w-3" /> 카카오맵
                          </a>
                          {s.phone && (
                            <a
                              href={`tel:${s.phone}`}
                              className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-md border border-border"
                            >
                              <Phone className="h-3 w-3" /> 전화
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
