-- quotes.status CHECK 제약에 'archived' 추가
ALTER TABLE quotes DROP CONSTRAINT IF EXISTS quotes_status_check;
ALTER TABLE quotes ADD CONSTRAINT quotes_status_check
  CHECK (status IN ('pending', 'booked', 'expired', 'cancelled', 'archived'));
