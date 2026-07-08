-- 재방문 유도 '검토 후 발송' 대기열 (개인화 재구매 캠페인)
--
-- 배경: 기존 재방문 알림은 90일 고정·제네릭 알림톡 자동발송이었다(개인화 X).
--   여기서는 지난 서비스·경과기간·현장 메모를 반영한 AI 개인화 문구를 미리 만들어
--   대표가 검토 후 카톡으로 직접 보내는 대기열로 '교체'한다(월간 리포트와 동일 패턴).
--
-- 미래 대비(스왑 가능한 발송): 발송 채널을 channel 컬럼으로 분리해 두었다.
--   지금은 'manual'(대표가 카톡 직접). 문자(SMS) 자동발송이나 개인화 알림톡 승인 시
--   같은 레코드에 발송 단계만 붙여 'sms'/'alimtalk'로 승격하면 된다(스키마 불변).
--
-- 접근: 서비스 전용(service_role). RLS 잠금.

create table if not exists reengagement_dispatches (
  id               uuid        primary key default gen_random_uuid(),
  business_id      uuid        not null references businesses(id) on delete cascade,
  customer_id      uuid        references customers(id) on delete set null,
  customer_phone   text        not null,
  customer_name    text,
  last_booking_id  uuid        references bookings(id) on delete set null,
  last_service     text,                                   -- 지난 서비스명(있으면)
  last_serviced_at timestamptz,                            -- 지난 서비스 일자
  months_since     integer,                                -- 경과 개월(표시·문구용)
  message          text        not null,                   -- AI가 생성한 개인화 문구(채널 중립)
  status           text        not null default 'pending'  -- pending / sent / skipped
                     check (status in ('pending', 'sent', 'skipped')),
  channel          text        not null default 'manual',  -- manual / sms / alimtalk (미래 승격용)
  sent_at          timestamptz,
  created_at       timestamptz not null default now(),
  -- 한 고객당 1건만(중복 재유도 방지). 발송/건너뜀 후에도 재생성 안 됨.
  unique (business_id, customer_phone)
);

create index if not exists idx_red_business_status on reengagement_dispatches(business_id, status);

alter table reengagement_dispatches enable row level security;
