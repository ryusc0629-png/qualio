-- 공개(로그인 불필요) 엔드포인트 비용 남용 방지용 레이트리밋 저장소.
-- 예: 고객용 AI 상담(/api/chat)이 무제한 호출되면 Anthropic API 비용이 폭증할 수 있음.
-- 키 하나당 슬라이딩 대신 고정 윈도우 카운터를 원자적으로 증가시킨다.

create table if not exists rate_limits (
  key text primary key,
  count integer not null default 0,
  reset_at timestamptz not null
);

-- 만료된 카운터는 다음 요청 때 자동 리셋되므로 별도 청소가 필수는 아니지만,
-- 오래된 행 청소를 돕도록 reset_at 인덱스를 둔다(선택적 정리용).
create index if not exists rate_limits_reset_at_idx on rate_limits (reset_at);

-- p_key에 대해 카운터를 1 증가시키고, 윈도우(p_window_sec) 내 허용치(p_limit) 이하이면 true.
-- INSERT ... ON CONFLICT DO UPDATE로 단일 행 원자적 갱신 → 동시 요청에도 카운트가 어긋나지 않음.
create or replace function check_rate_limit(
  p_key text,
  p_limit integer,
  p_window_sec integer
)
returns boolean
language plpgsql
as $$
declare
  v_count integer;
begin
  insert into rate_limits (key, count, reset_at)
  values (p_key, 1, now() + make_interval(secs => p_window_sec))
  on conflict (key) do update
    set count = case
          when rate_limits.reset_at < now() then 1
          else rate_limits.count + 1
        end,
        reset_at = case
          when rate_limits.reset_at < now() then now() + make_interval(secs => p_window_sec)
          else rate_limits.reset_at
        end
  returning count into v_count;

  return v_count <= p_limit;
end;
$$;
