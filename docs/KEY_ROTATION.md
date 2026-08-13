# API 키 교체 체크리스트 (베타 공개 전 1회)

지금까지 키를 한 번도 바꾼 적이 없습니다. 개발 중에 여러 화면·기록에 노출됐다고 보고 **전부 새로 발급**한 뒤 고객사를 받습니다.
100곳 데이터가 들어온 다음에 바꾸면 사고 시 피해 범위가 훨씬 커집니다.

작업은 사장님이 각 서비스 콘솔에서 직접 하셔야 합니다(콘솔 로그인이 필요해 제가 대신 못 합니다).
저는 새 값을 넣을 자리와 순서, 확인 방법을 정리해 뒀습니다.

---

## 교체 순서 (위험도 순 — 위부터)

### 1순위 — 유출되면 바로 피해가 나는 키

| 키 | 어디서 발급/교체 | 바꾸면 영향받는 것 | 확인 방법 |
|---|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase 대시보드 → Project Settings → API Keys → service_role 재발급 | 서버의 모든 DB 읽기·쓰기(사실상 전체 기능) | 대시보드 로그인 후 예약 목록이 뜨는지 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 같은 화면에서 anon 재발급 | 브라우저의 Storage 업로드(사진) | 작업 사진 업로드 |
| `ANTHROPIC_API_KEY` | console.anthropic.com → API Keys | 시방서·홍보 글·보고서 등 글 자동 작성 전부 | 시방서 초안 만들기 |
| `PORTONE_V2_API_SECRET` | 포트원 콘솔 → 결제 연동 → V2 API Secret | 결제 승인 검증(결제 전체) | 결제창 → 승인 직전 취소 |
| `TOSSPAYMENTS_SECRET_KEY` | 토스페이먼츠 개발자센터 | 토스 경로 결제 | `?pg=toss`로 결제창 열기 |
| `KCP_PRIVATE_KEY_BASE64`, `KCP_CERT_PEM_BASE64` | KCP 상점관리자 | 정기결제(빌키) 청구 | 결제 테스트 |
| `SUPABASE` DB 비밀번호 | Supabase → Database → Password | 마이그레이션 push | `supabase db push --linked` |

### 2순위 — 남에게 넘어가면 요금이 나가는 키

| 키 | 발급처 | 영향 |
|---|---|---|
| `SOLAPI_API_KEY`, `SOLAPI_API_SECRET` | 솔라피 콘솔 | 알림톡 발송(문자 요금) |
| `OPENAI_API_KEY` | platform.openai.com | 일부 생성 기능 |
| `GEMINI_API_KEY` | Google AI Studio | 보조 생성 |
| `FAL_KEY` | fal.ai | 이미지 생성(로컬 스크립트) |
| `AYRSHARE_API_KEY` | Ayrshare | SNS 자동 배포 |
| `CREATOMATE_API_KEY` | Creatomate | 영상 자동 생성 |
| `PERPLEXITY_API_KEY` | Perplexity | 검색 노출 측정 |
| `NAVER_SEARCHAD_API_KEY`, `NAVER_SEARCHAD_SECRET_KEY` | 네이버 검색광고 | 검색량 조회 |
| `KAKAO_REST_API_KEY` | 카카오 개발자 | 주소→좌표 변환 |
| `NOTION_TOKEN` | Notion 통합 | 운영 문서 자동화(로컬) |
| `QUALIO_VERCEL_TOKEN` | Vercel → Account Settings → Tokens | 고객사 도메인 연결 |

### 3순위 — 내부 값(유출 시 피해는 작지만 함께 갱신)

- `CRON_SECRET` — 자동 발행 크론 호출 암호. 바꾸면 **Supabase pg_cron의 Vault 비밀도 같이 바꿔야** 자동 발행이 멈추지 않습니다.
- `VAPID_PRIVATE_KEY` / `NEXT_PUBLIC_VAPID_PUBLIC_KEY` — 웹푸시 키쌍. ⚠️ **바꾸면 지금까지 알림을 켠 폰이 전부 해제**되어 다시 켜야 합니다. 베타 시작 전인 지금이 바꾸기 가장 좋은 시점입니다.
- `ADMIN_EMAILS`, `PAYMENT_REVIEW_EMAILS` — 키가 아니라 접근 명단. 값이 맞는지만 확인.

---

## 교체 절차 (키 하나당)

1. 해당 서비스 콘솔에서 **새 키를 먼저 발급** (옛 키는 아직 살려둠)
2. Vercel → 프로젝트 → Settings → Environment Variables 에서 값 교체 (Production / Preview 둘 다)
3. `.env.local`도 같은 값으로 교체 (로컬 개발용)
4. **재배포** — `NEXT_PUBLIC_`로 시작하는 값은 빌드에 박히므로 재배포해야 반영됩니다
5. 위 표의 확인 방법으로 동작 확인
6. 확인이 끝나면 **콘솔에서 옛 키 폐기**

⚠️ 4번을 건너뛰면 화면은 옛 키를 계속 쓰고, 6번을 먼저 하면 서비스가 멈춥니다. 순서를 지켜주세요.

---

## 교체 후 점검 — 먼저 자동 확인

```bash
npm run check:keys
```

각 서비스에 읽기 전용 호출을 넣어 키가 살아있는지 알려줍니다(발송·결제·과금되는 호출은 하지 않습니다).
운영(Vercel) 값으로 확인하려면 `vercel env pull .env.local`로 내려받은 뒤 실행하세요.

- ✅ 정상 / ❌ 키가 거부됨(401·403 — 값 확인 필요) / 🟡 서비스 쪽 응답 이상(키 문제 아님, 잠시 후 재시도) / ⚠️ 값 없음

2026-08-13 기준 교체 전 상태: 모두 정상(알림톡 잔액 18,000원, Vercel 토큰은 로컬에 없음).

## 교체 후 점검 (손으로 확인)

- [ ] 로그인 → 대시보드 숫자가 보인다 (Supabase 키)
- [ ] 사진 업로드가 된다 (anon 키)
- [ ] 시방서 초안 만들기가 된다 (Anthropic)
- [ ] 예약 확정 시 알림톡이 온다 (Solapi)
- [ ] 결제창이 열린다 (포트원 — 승인 직전까지만)
- [ ] 폰 알림 테스트가 온다 (VAPID — 키를 바꿨다면 폰에서 알림 다시 켜기)
- [ ] 다음 날 아침 자동 발행이 돌았다 (CRON_SECRET + Vault)

---

## 참고

- Vercel의 `SOLAPI` 항목이 한동안 "Needs Attention" 상태였습니다. 교체하면서 함께 정리하세요.
- `VERCEL_`로 시작하는 이름은 Vercel 예약어라 쓸 수 없어 `QUALIO_VERCEL_*`로 두고 있습니다. 이름을 바꾸지 마세요.
- 키를 바꾼 날짜를 이 문서 아래에 적어두면 다음 교체 주기를 잡기 쉽습니다.

교체 기록:

- (미교체) 2026-08-13 기준 최초 발급 키 그대로 사용 중
