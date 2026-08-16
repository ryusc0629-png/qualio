'use client'

import { useState } from 'react'
import { AddServiceForm } from './add-service-form'
import { Check, ChevronDown, ChevronUp, Sparkles, Pencil } from 'lucide-react'

interface Props {
  serviceCount: number
  hasBundles: boolean   // 서비스 중 하나라도 플랜 항목이 구성됐는지
}

// 비테크 사장님용 단계별 안내 카드 — '이렇게 하면 끝나요' + 클릭 유도.
// 두 단계가 모두 끝나면 기본 접힘(완료 표시), 아니면 펼침.
// ⚠️ 여기에 '저장하기' 같은 단계를 다시 만들지 말 것.
//    이 화면엔 따로 저장 버튼이 없고, 서비스를 추가·수정하면 그 자리에서 저장된다.
//    예전에 '3. 저장하면 끝!'이 있었는데 완료될 수가 없어 영원히 미완으로 남았다.
export function ServicesGuideCard({ serviceCount, hasBundles }: Props) {
  const step1Done = serviceCount > 0
  const step2Done = hasBundles
  const allDone = step1Done && step2Done
  const [open, setOpen] = useState(!allDone)

  return (
    <div className="bg-primary/5 border border-primary/20 rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2 px-5 py-3.5 text-left"
      >
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <span className="font-semibold text-sm">
            {allDone ? '서비스 설정을 마쳤어요 🎉' : '서비스 설정, 2단계면 끝나요'}
          </span>
        </div>
        {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>

      {open && (
        <div className="px-5 pb-5 space-y-4">
          {/* 1단계 */}
          <div className="flex gap-3">
            <StepBadge n={1} done={step1Done} />
            <div className="flex-1 space-y-2">
              <div>
                <p className="text-sm font-medium">청소 종류와 가격 추가하기</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  제공하는 서비스(예: 입주청소)와 가격을 등록하면 고객 견적 폼에 자동으로 보여요.
                </p>
              </div>
              <AddServiceForm />
            </div>
          </div>

          {/* 2단계 */}
          <div className="flex gap-3">
            <StepBadge n={2} done={step2Done} />
            <div className="flex-1">
              <p className="text-sm font-medium">각 서비스의 플랜 구성하기</p>
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                아래 서비스의 <Pencil className="inline h-3 w-3 mb-0.5" /> 수정 아이콘을 누른 뒤,
                <span className="font-medium text-foreground"> &lsquo;많이 쓰는 구성 불러오기&rsquo;</span>를 누르면
                다른 업체들이 많이 쓰는 기본·추천·프리미엄 구성을 골라 채울 수 있어요. 마음에 안 들면 그 자리에서 고치면 돼요.
              </p>
            </div>
          </div>

          {/* 따로 저장할 게 없다는 안내 — 단계가 아니라 마무리 한 줄 */}
          <p className="text-xs text-muted-foreground bg-white/60 rounded-lg px-3 py-2 leading-relaxed">
            따로 저장 버튼은 없어요. 여기서 추가·수정하면 바로 저장되고,
            고객 견적 폼과 홈페이지에 자동으로 반영돼요.
          </p>
        </div>
      )}
    </div>
  )
}

function StepBadge({ n, done }: { n: number; done: boolean }) {
  return (
    <div
      className={`shrink-0 h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold ${
        done ? 'bg-primary text-primary-foreground' : 'bg-white border-2 border-primary/30 text-primary'
      }`}
    >
      {done ? <Check className="h-4 w-4" /> : n}
    </div>
  )
}
