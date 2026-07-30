-- 수동/견적서 기반 예약의 서비스명을 저장할 컬럼.
--
-- 배경: 지금까지 수동 예약(AddBookingButton)에서 입력한 서비스명(cleaning_type)이
-- 저장 시 버려져, 고객 상세 '서비스 이력'에 "직접 예약"으로만 표시됐음
-- (bookings에는 서비스명 전용 컬럼이 없었고, 서비스명은 연결된 quotes.cleaning_type
--  에서만 왔기 때문). service_label에 입력값을 담아 이력에 그대로 보이게 함.
-- 견적서→원터치 예약 기능도 견적서 제목을 이 컬럼에 넣는다.
alter table bookings add column if not exists service_label text;
