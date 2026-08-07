import { forwardRef } from 'react'
import { Label } from '@/components/ui/label'
import { MANUAL_SOURCE_OPTIONS } from '@/lib/utils/marketing-channels'

// '어떻게 알고 오셨어요?' 유입경로 선택 — 전화·소개처럼 링크로 못 잡는 손님을 채널에 편입.
// 비테크 사장님도 바로 이해하도록 쉬운 말 드롭다운 하나(선택), 모르면 그냥 비워두면 됨.
// react-hook-form의 register(...)를 그대로 펼쳐 쓸 수 있게 forwardRef + 네이티브 select.

type SourceChannelSelectProps = React.SelectHTMLAttributes<HTMLSelectElement> & {
  id?: string
}

export const SourceChannelSelect = forwardRef<HTMLSelectElement, SourceChannelSelectProps>(
  function SourceChannelSelect({ id = 'source-channel', className = '', ...selectProps }, ref) {
    return (
      <div className="space-y-1">
        <Label htmlFor={id}>어떻게 알고 오셨어요? (선택)</Label>
        <select
          id={id}
          ref={ref}
          defaultValue=""
          className={`w-full h-11 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary ${className}`}
          {...selectProps}
        >
          <option value="">모르거나 해당 없음</option>
          {MANUAL_SOURCE_OPTIONS.map((c) => (
            <option key={c.key} value={c.key}>
              {c.emoji} {c.label}
            </option>
          ))}
        </select>
        <p className="text-[11px] text-muted-foreground">
          골라두면 마케팅 화면 &lsquo;채널별 성과&rsquo;에 어디서 온 손님인지 쌓여요
        </p>
      </div>
    )
  },
)
