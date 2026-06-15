-- biz_posts에 당근마켓·인스타그램 버전 컬럼 추가
alter table biz_posts
  add column if not exists daangn_content    text,
  add column if not exists instagram_content text,
  add column if not exists instagram_hashtags text[];
