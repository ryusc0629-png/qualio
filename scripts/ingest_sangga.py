# -*- coding: utf-8 -*-
"""
소상공인 상가(상권)정보 CSV → Supabase prospects_directory 적재
- 컬럼은 '헤더명'으로 매핑(파일 버전 바뀌어도 견딤)
- store_id(상가업소번호) 기준 upsert(merge-duplicates) → 분기 갱신 시 재실행 안전
- 배치 500행씩 REST 전송, 진행상황 출력

사용:
  python3 scripts/ingest_sangga.py "~/Downloads/상가정보/소상공인시장진흥공단_상가정보_경남.csv"
  python3 scripts/ingest_sangga.py <파일1> <파일2> ...   # 시도별 여러 파일 한 번에

환경변수: .env.local 의 NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 사용
"""
import csv, json, os, sys, ssl, time, urllib.request, urllib.error

# .env.local 로드 (간단 파서)
def load_env(path=".env.local"):
    env = {}
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip().strip('"').strip("'")
    return env

ENV = load_env()
SUPABASE_URL = ENV.get("NEXT_PUBLIC_SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
SERVICE_KEY = ENV.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
if not SUPABASE_URL or not SERVICE_KEY:
    sys.exit("환경변수 없음: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (.env.local 확인)")

ENDPOINT = f"{SUPABASE_URL}/rest/v1/prospects_directory?on_conflict=store_id"
_CTX = ssl.create_default_context()
_CTX.check_hostname = False
_CTX.verify_mode = ssl.CERT_NONE

# CSV 헤더명 → 우리 컬럼
COLMAP = {
    "상가업소번호": "store_id",
    "상호명": "name",
    "지점명": "branch",
    "상권업종대분류명": "cat_major",
    "상권업종중분류명": "cat_mid",
    "상권업종소분류명": "cat_sub",
    "시도명": "sido",
    "시군구명": "sigungu",
    "행정동명": "dong",
    "지번주소": "addr_jibun",
    "도로명주소": "addr_road",
    "건물명": "building",
    "경도": "lng",
    "위도": "lat",
}

# 타겟 업종만 적재(전체 저장 안 함 → DB 대폭 축소). (target, 매칭 키워드들)
# 상호명·업종 대/중/소분류 중 하나라도 키워드를 포함하면 그 타겟으로 태깅.
# ⚠️공장 제외: 상가정보엔 산업단지 공장이 없고, "공장" 키워드가 "공공장소 청소업"·
#   "빵공장" 같은 가게이름을 오탐함. 진짜 공장은 전국 공장등록현황(별도 데이터) 필요.
TARGETS = [
    ("인테리어", ["인테리어", "실내건축", "리모델링"]),
    ("병의원", ["병원", "의원", "치과", "한의원", "내과", "외과", "피부과", "안과",
              "이비인후과", "산부인과", "소아", "정형외과", "신경과", "비뇨", "클리닉"]),
    ("학원", ["학원", "교습소"]),
]

def classify_target(rec):
    hay = " ".join([
        (rec.get("상호명") or ""),
        (rec.get("상권업종대분류명") or ""),
        (rec.get("상권업종중분류명") or ""),
        (rec.get("상권업종소분류명") or ""),
    ])
    for target, kws in TARGETS:
        if any(kw in hay for kw in kws):
            return target
    return None

def open_csv(path):
    # 상가정보 최신본은 UTF-8. 혹시 모를 CP949 폴백.
    for enc in ("utf-8-sig", "cp949"):
        try:
            f = open(path, encoding=enc, newline="")
            f.readline()
            f.seek(0)
            return f
        except UnicodeDecodeError:
            continue
    return open(path, encoding="utf-8", errors="replace", newline="")

def to_row(rec):
    target = classify_target(rec)
    if target is None:  # 타겟 업종 아니면 저장 안 함
        return None
    out = {"target": target}
    for src, dst in COLMAP.items():
        val = (rec.get(src) or "").strip()
        out[dst] = val or None
    if not out.get("store_id") or not out.get("name"):
        return None
    for k in ("lat", "lng"):
        try:
            out[k] = float(out[k]) if out[k] else None
        except ValueError:
            out[k] = None
    if out["lat"] is None or out["lng"] is None:
        return None
    return out

def _post_once(batch):
    body = json.dumps(batch, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(ENDPOINT, data=body, method="POST", headers={
        "apikey": SERVICE_KEY,
        "Authorization": f"Bearer {SERVICE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates,return=minimal",
    })
    try:
        with urllib.request.urlopen(req, timeout=60, context=_CTX) as r:
            return r.status, ""
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")[:200]
    except Exception as e:  # 연결 실패(DB 다운 등)
        return 0, repr(e)[:200]

def send(batch, retries=5):
    """5xx/연결오류는 백오프 재시도. 끝까지 실패하면 (code,msg) 반환(데이터 유실 방지)."""
    code, msg = 0, ""
    for attempt in range(retries):
        code, msg = _post_once(batch)
        if code in (200, 201, 204):
            return code, ""
        # 4xx(요청 오류)는 재시도해도 소용없음 → 즉시 반환
        if 400 <= code < 500:
            return code, msg
        # 5xx / 0(연결불가) → DB 과부하·다운. 백오프 후 재시도(2,4,8,16,32초)
        time.sleep(2 ** (attempt + 1))
    return code, msg

class DbOverloaded(Exception):
    pass

def _flush(batch, stats):
    code, msg = send(batch)
    if code in (200, 201, 204):
        stats["ok"] += len(batch)
        stats["consec"] = 0
    else:
        stats["failed"] += len(batch)
        stats["consec"] += 1
        print(f"  ⚠ {code} {msg}")
        # DB가 계속 실패 응답 → 과부하/다운. 더 밀어넣지 말고 즉시 중단(악화 방지)
        if stats["consec"] >= 3:
            raise DbOverloaded(
                f"연속 {stats['consec']}배치 실패(마지막 {code}). DB 과부하/디스크 의심 — 중단."
            )
    time.sleep(0.03)  # 살짝 텀

def ingest(path, stats):
    print(f"\n▶ {path}")
    f = open_csv(path)
    reader = csv.DictReader(f)
    batch, skipped, start_ok = [], 0, stats["ok"]
    for rec in reader:
        row = to_row(rec)
        if row is None:
            skipped += 1
            continue
        batch.append(row)
        if len(batch) >= 500:
            _flush(batch, stats)
            batch = []
            if (stats["ok"] - start_ok) % 20000 < 500:
                print(f"  {stats['ok'] - start_ok:,}건 적재")
    if batch:
        _flush(batch, stats)
    f.close()
    print(f"  완료: 적재 {stats['ok'] - start_ok:,} / 스킵 {skipped:,}")

if __name__ == "__main__":
    files = [os.path.expanduser(p) for p in sys.argv[1:]]
    if not files:
        sys.exit("사용법: python3 scripts/ingest_sangga.py <상가정보CSV> [<CSV2> ...]")
    stats = {"ok": 0, "failed": 0, "consec": 0}
    try:
        for p in files:
            if not os.path.exists(p):
                print(f"파일 없음: {p}")
                continue
            ingest(p, stats)
    except DbOverloaded as e:
        print(f"\n🛑 중단: {e}")
        print(f"   지금까지 적재 {stats['ok']:,} / 실패 {stats['failed']:,}")
        sys.exit(1)
    print(f"\n전체 적재 완료. 적재 {stats['ok']:,} / 실패 {stats['failed']:,}")
