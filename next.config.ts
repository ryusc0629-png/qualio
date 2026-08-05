import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // 서비스 워커 — 항상 최신 버전 받도록 캐시 금지 + JS 타입 보장
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

// Sentry로 감싸 오류 수집을 활성화한다.
// org/project는 Sentry 프로젝트 식별자. 소스맵 업로드(SENTRY_AUTH_TOKEN)는 아직 미설정이라
// 빌드 시 조용히 건너뛴다(오류 수집 자체는 정상 동작).
export default withSentryConfig(nextConfig, {
  org: "qualio",
  project: "javascript-nextjs",
  silent: !process.env.CI,
});
