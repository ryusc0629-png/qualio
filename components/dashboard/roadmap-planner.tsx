'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { buildRoadmapAction } from '@/lib/actions/roadmap'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { MapPin, Phone, Navigation, Users, ClipboardList, Map, Upload } from 'lucide-react'

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
}

interface RoadmapPlannerProps {
  leads: LeadOption[]
  defaultStart: string
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

// 구글맵 경로 URL — 앱에서 열림. 구글은 URL당 약 10곳 제한이라 겹쳐서 분할.
function gmapsUrls(stops: GeoStop[]): string[] {
  const coords = stops.map((s) => `${s.lat.toFixed(6)},${s.lng.toFixed(6)}`)
  if (coords.length <= 1) return coords.length ? [`https://www.google.com/maps/search/${coords[0]}`] : []
  const urls: string[] = []
  const CHUNK = 10
  for (let i = 0; i < coords.length - 1; i += CHUNK - 1) {
    const seg = coords.slice(i, i + CHUNK)
    urls.push(`https://www.google.com/maps/dir/${seg.join('/')}`)
  }
  return urls
}

function kakaoNav(name: string, lat: number, lng: number): string {
  return `https://map.kakao.com/link/to/${encodeURIComponent(name)},${lat},${lng}`
}

export function RoadmapPlanner({ leads, defaultStart }: RoadmapPlannerProps) {
  const [mode, setMode] = useState<'leads' | 'paste'>(leads.length > 0 ? 'leads' : 'paste')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [paste, setPaste] = useState('')
  const [perDay, setPerDay] = useState(25)
  const [start, setStart] = useState(defaultStart)
  const [result, setResult] = useState<RoadmapResult | null>(null)
  const [isPending, startTransition] = useTransition()

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

  const handleBuild = () => {
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
        perDay,
        startAddress: start.trim() || undefined,
      })
      if (res?.serverError) {
        toast.error(res.serverError)
        return
      }
      if (res?.data) {
        setResult(res.data)
        toast.success(`${res.data.courses.length}개 코스로 짰어요!`)
      }
    })
  }

  return (
    <div className="space-y-5">
      {/* 입력 방식 선택 */}
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setMode('leads')}
          className={`h-12 rounded-lg border text-sm font-semibold flex items-center justify-center gap-2 ${
            mode === 'leads'
              ? 'border-primary bg-primary/10 text-primary'
              : 'border-border text-muted-foreground'
          }`}
        >
          <Users className="h-4 w-4" /> 내 리드에서
        </button>
        <button
          type="button"
          onClick={() => setMode('paste')}
          className={`h-12 rounded-lg border text-sm font-semibold flex items-center justify-center gap-2 ${
            mode === 'paste'
              ? 'border-primary bg-primary/10 text-primary'
              : 'border-border text-muted-foreground'
          }`}
        >
          <ClipboardList className="h-4 w-4" /> 명단 붙여넣기
        </button>
      </div>

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

      {/* 옵션 */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="perDay">하루 방문 개수</Label>
          <Input
            id="perDay"
            type="number"
            inputMode="numeric"
            min={1}
            max={100}
            value={perDay}
            onChange={(e) => setPerDay(Math.max(1, Math.min(100, Number(e.target.value) || 1)))}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="start">출발지 (선택)</Label>
          <Input
            id="start"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            placeholder="예) 울산 남구 삼산로 300"
          />
        </div>
      </div>

      <Button onClick={handleBuild} disabled={isPending} className="w-full h-12 text-base font-bold">
        {isPending ? '코스 짜는 중...' : '동선 코스 만들기'}
      </Button>

      {/* 결과 */}
      {result && (
        <div className="space-y-4 pt-2">
          <div className="text-sm text-muted-foreground">
            총 {result.geocodedCount}곳 · {result.courses.length}일 코스 · 이동 약{' '}
            {Math.round(result.totalKm)}km
            {result.failedCount > 0 && (
              <span className="block text-xs text-amber-600 mt-1">
                주소를 못 찾은 {result.failedCount}곳은 빠졌어요
                {result.failedNames.length > 0 && ` (${result.failedNames.slice(0, 5).join(', ')}${result.failedCount > 5 ? ' 외' : ''})`}
              </span>
            )}
          </div>

          {result.courses.map((course, ci) => {
            const urls = gmapsUrls(course.stops)
            return (
              <div key={ci} className="border rounded-xl p-4 space-y-3 bg-white shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="font-bold">코스 {ci + 1}일차</span>
                  <span className="text-xs text-muted-foreground">
                    {course.stops.length}곳 · 약 {Math.round(course.km)}km
                  </span>
                </div>

                {urls.map((url, ui) => (
                  <a
                    key={ui}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 h-11 rounded-lg bg-primary text-primary-foreground text-sm font-semibold"
                  >
                    <Map className="h-4 w-4" />
                    전체 경로 지도로 열기{urls.length > 1 ? ` (${ui + 1}/${urls.length})` : ''}
                  </a>
                ))}

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
                            href={kakaoNav(s.name, s.lat, s.lng)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-md bg-[#fee500] text-black font-medium"
                          >
                            <Navigation className="h-3 w-3" /> 내비
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
