-- 완료 예약 → 고객 DB 일회성 동기화
-- 고객 자동 등록 코드 배포 이전에 이미 완료 처리된 예약을 customers 테이블에 반영

INSERT INTO customers (business_id, name, phone, address, type, created_at)
SELECT
  b.business_id,
  MAX(b.customer_name) AS name,
  b.customer_phone    AS phone,
  MAX(b.service_address) AS address,
  'one_time'          AS type,
  NOW()               AS created_at
FROM bookings b
WHERE b.status = 'completed'
  AND b.customer_phone IS NOT NULL
  AND b.customer_phone != ''
  AND b.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM customers c
    WHERE c.business_id = b.business_id
      AND c.phone = b.customer_phone
  )
GROUP BY b.business_id, b.customer_phone;
