-- 정산(입금) 계좌 — 계약서 '을' 정보/세금계산서 입금처에 자동 표기 (자유 텍스트: 은행·번호·예금주)
ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS payment_account text;
