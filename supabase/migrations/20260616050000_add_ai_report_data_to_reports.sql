-- AI 보고서 구조화 데이터 저장 (재작성 방지, API 비용 절감)
alter table reports add column if not exists ai_report_data jsonb;
