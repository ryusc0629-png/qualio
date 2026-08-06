-- 현장 문단속(출근 오픈 + 마감 잠금) 사진 인증 기능
-- 정기계약(현장)마다 "문단속 필요" 여부와 "예상 소요 시간"을 두고,
-- 도착(오픈)+마감(잠금) 사진을 직원이 올린다. 오픈 시각 + 예상 소요 시간이 지나도
-- 마감 사진이 없으면 직원+대표에게 알림을 보낸다(별도 크론).

-- 계약: 현장별 문단속 설정
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS requires_lockup BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS expected_duration_minutes INTEGER;

COMMENT ON COLUMN public.contracts.requires_lockup IS '이 정기 현장은 마감 문단속(오픈/잠금 사진) 인증 필요';
COMMENT ON COLUMN public.contracts.expected_duration_minutes IS '예상 작업 소요 시간(분). 오픈 후 이 시간+여유가 지나도 마감 사진 없으면 알림';

-- 예약(방문): 오픈/마감 인증 기록
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS checkin_at TIMESTAMPTZ;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS checkout_at TIMESTAMPTZ;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS open_photo_urls TEXT[];
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS lockup_photo_urls TEXT[];
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS lockup_alert_sent_at TIMESTAMPTZ;

COMMENT ON COLUMN public.bookings.checkin_at IS '현장 도착(문 오픈) 사진 올린 시각 = 출근 기준점';
COMMENT ON COLUMN public.bookings.checkout_at IS '마감(문 잠금) 사진 올린 시각 = 문단속 완료';
COMMENT ON COLUMN public.bookings.lockup_alert_sent_at IS '문단속 미완료 알림 발송 시각(중복 발송 방지)';
