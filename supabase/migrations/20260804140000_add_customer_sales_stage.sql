-- 거래처(고객)의 '영업 상태' — 자동 파생되는 일회성/정기계약중 배지와 별개로,
-- 전환 후 진행 중인(정기계약 업셀 등) 영업 단계를 손으로 지정하기 위한 컬럼.
--   NULL = 영업 없음(기본). 값 = 파이프라인 단계와 동일 어휘:
--   'contacted'(연락함) / 'follow_up'(현장 방문) / 'quoted'(견적 보냄) / 'negotiating'(금액 협의)
-- 기존 거래처는 전부 NULL로 시작하므로, 과거 전환 건이 갑자기 '영업 중'으로 뜨지 않는다.
alter table public.customers add column if not exists sales_stage text;
