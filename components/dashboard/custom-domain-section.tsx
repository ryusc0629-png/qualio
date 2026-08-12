'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAction } from 'next-safe-action/hooks'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  connectCustomDomainAction,
  checkCustomDomainAction,
  disconnectCustomDomainAction,
} from '@/lib/actions/custom-domain'
import { Globe, Loader2, CheckCircle2, Copy, ExternalLink, AlertCircle } from 'lucide-react'

interface Props {
  /** 지금 연결된 주소 (없으면 null) */
  domain: string | null
  /** 'none' | 'pending' | 'active' */
  status: string | null
}

interface DnsGuide {
  recordType: string
  recordName: string
  recordValue: string
}

export function CustomDomainSection({ domain, status }: Props) {
  const router = useRouter()
  const [input, setInput] = useState('')
  const [dns, setDns] = useState<DnsGuide | null>(null)

  const isLive = status === 'active' && !!domain
  const isPending = status === 'pending' && !!domain

  const connect = useAction(connectCustomDomainAction, {
    onSuccess: ({ data }) => {
      if (data?.live) {
        toast.success('연결됐어요! 이제 내 주소로 홈페이지가 열려요')
      } else {
        toast.success('주소를 등록했어요. 아래 안내대로 설정하면 완료돼요')
        if (data) setDns({ recordType: data.recordType, recordName: data.recordName, recordValue: data.recordValue })
      }
      router.refresh()
    },
    onError: ({ error }) => {
      toast.error(error.serverError ?? '연결하지 못했어요. 주소를 확인하고 다시 눌러주세요')
    },
  })

  const check = useAction(checkCustomDomainAction, {
    onSuccess: ({ data }) => {
      if (data?.live) {
        toast.success('연결됐어요! 이제 내 주소로 홈페이지가 열려요')
      } else {
        toast.error('아직 설정이 반영되지 않았어요. 보통 10분~1시간 걸려요')
        if (data) setDns({ recordType: data.recordType, recordName: data.recordName, recordValue: data.recordValue })
      }
      router.refresh()
    },
    onError: ({ error }) => {
      toast.error(error.serverError ?? '확인하지 못했어요. 잠시 후 다시 눌러주세요')
    },
  })

  const disconnect = useAction(disconnectCustomDomainAction, {
    onSuccess: () => {
      toast.success('연결을 끊었어요. 홈페이지는 퀄리오 주소로 열려요')
      setDns(null)
      router.refresh()
    },
    onError: ({ error }) => {
      toast.error(error.serverError ?? '연결을 끊지 못했어요. 잠시 후 다시 눌러주세요')
    },
  })

  function copy(text: string) {
    navigator.clipboard.writeText(text)
    toast.success('복사했어요')
  }

  // ── 연결 완료 ──
  if (isLive) {
    return (
      <div className="space-y-4">
        <div className="flex items-start gap-3 rounded-lg border border-primary/30 bg-primary/5 p-4">
          <CheckCircle2 className="h-5 w-5 text-primary shrink-0 mt-0.5" />
          <div className="min-w-0 space-y-1">
            <p className="font-medium text-sm">내 주소로 홈페이지가 열리고 있어요</p>
            <a
              href={`https://${domain}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm text-primary hover:underline break-all"
            >
              {domain}
              <ExternalLink className="h-3.5 w-3.5 shrink-0" />
            </a>
          </div>
        </div>

        <p className="text-xs text-muted-foreground leading-relaxed">
          검색에 잡히기까지는 보통 2~4주 걸려요. 그동안 퀄리오 주소로 들어온 손님도 자동으로 이 주소로 옮겨져요.
        </p>

        <Button
          type="button"
          variant="outline"
          className="h-12 w-full"
          disabled={disconnect.isPending}
          onClick={() => {
            if (confirm(`${domain} 연결을 끊을까요?\n홈페이지는 퀄리오 주소로 돌아가고, 검색 순위가 처음부터 다시 쌓여요.`)) {
              disconnect.execute({})
            }
          }}
        >
          {disconnect.isPending ? '끊는 중...' : '연결 끊기'}
        </Button>
      </div>
    )
  }

  // ── 등록은 됐고 DNS 설정 대기 ──
  if (isPending) {
    const guide = dns ?? { recordType: 'A', recordName: '@', recordValue: '76.76.21.21' }
    return (
      <div className="space-y-4">
        <div className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4">
          <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="min-w-0 space-y-1">
            <p className="font-medium text-sm">한 단계만 더 남았어요</p>
            <p className="text-sm text-muted-foreground break-all">{domain}</p>
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">주소를 구입한 곳에서 아래 값을 넣어주세요</p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            가비아·후이즈·카페24 같은 곳에 로그인해서 &lsquo;DNS 설정&rsquo; 또는 &lsquo;레코드 관리&rsquo; 화면을 열고,
            아래 세 가지를 그대로 넣으면 돼요.
          </p>
        </div>

        <div className="space-y-2">
          {[
            { label: '종류', value: guide.recordType },
            { label: '이름(호스트)', value: guide.recordName },
            { label: '값', value: guide.recordValue },
          ].map((row) => (
            <div key={row.label} className="flex items-center gap-2 rounded-md border bg-muted/30 p-3">
              <span className="text-xs text-muted-foreground w-24 shrink-0">{row.label}</span>
              <code className="text-sm font-mono flex-1 min-w-0 break-all">{row.value}</code>
              <Button type="button" variant="ghost" size="sm" className="shrink-0" onClick={() => copy(row.value)}>
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>

        <p className="text-xs text-muted-foreground leading-relaxed">
          넣고 나서 보통 10분~1시간이면 반영돼요. 반영되면 아래 버튼을 눌러 확인해주세요.
          어려우면 고객센터로 연락 주시면 대신 도와드려요.
        </p>

        <Button
          type="button"
          className="h-12 w-full"
          disabled={check.isPending}
          onClick={() => check.execute({})}
        >
          {check.isPending ? (
            <><Loader2 className="h-4 w-4 mr-2 animate-spin" />확인 중...</>
          ) : (
            '연결 확인하기'
          )}
        </Button>

        <Button
          type="button"
          variant="ghost"
          className="h-10 w-full text-muted-foreground"
          disabled={disconnect.isPending}
          onClick={() => {
            if (confirm(`${domain} 연결을 취소할까요?`)) disconnect.execute({})
          }}
        >
          {disconnect.isPending ? '취소하는 중...' : '연결 취소'}
        </Button>
      </div>
    )
  }

  // ── 아직 연결 안 함 ──
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <Globe className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
        <p className="text-sm text-muted-foreground leading-relaxed">
          이미 가지고 계신 인터넷 주소가 있으면 연결할 수 있어요.
          연결하면 홈페이지가 <strong className="text-foreground">내 주소</strong>로 열리고,
          검색에서도 우리 업체 이름으로 쌓여요. 주소가 없으면 지금은 그냥 두셔도 돼요.
        </p>
      </div>

      <div className="space-y-2">
        <label htmlFor="custom-domain" className="text-sm font-medium">
          내 인터넷 주소 (필수 아님)
        </label>
        <Input
          id="custom-domain"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="mycleaning.co.kr"
          inputMode="url"
          autoCapitalize="none"
          autoCorrect="off"
          className="h-12"
        />
        <p className="text-xs text-muted-foreground">
          앞에 www 없이 주소만 넣어주세요. 예: mycleaning.co.kr
        </p>
      </div>

      <Button
        type="button"
        className="h-12 w-full"
        disabled={connect.isPending || input.trim().length < 4}
        onClick={() => connect.execute({ domain: input })}
      >
        {connect.isPending ? (
          <><Loader2 className="h-4 w-4 mr-2 animate-spin" />연결하는 중...</>
        ) : (
          '내 주소 연결하기'
        )}
      </Button>
    </div>
  )
}
