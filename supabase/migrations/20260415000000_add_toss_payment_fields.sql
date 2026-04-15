-- ============================================================
-- Phase 9: 토스페이먼츠 결제 필드 추가
-- subscriptions 테이블에 scale 플랜 및 결제 컬럼 추가
-- ============================================================

-- plan enum에 'scale' 추가 (기존: beta/starter/pro)
alter table subscriptions
  drop constraint if exists subscriptions_plan_check;

alter table subscriptions
  add constraint subscriptions_plan_check
  check (plan in ('beta', 'starter', 'pro', 'scale'));

-- 결제 관련 컬럼 추가
alter table subscriptions
  add column if not exists toss_order_id    text,    -- 주문 ID (orderId, idempotency key)
  add column if not exists toss_payment_key text,    -- 결제 승인 후 토스가 발급하는 키
  add column if not exists billing_key      text;    -- 자동 정기 결제 빌링키 (추후 사용)
