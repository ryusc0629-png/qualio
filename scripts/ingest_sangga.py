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
import csv, json, os, sys, ssl, urllib.request, urllib.error

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
    out = {}
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

def send(batch):
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
        return e.code, e.read().decode("utf-8", "replace")[:300]

def ingest(path):
    print(f"\n▶ {path}")
    f = open_csv(path)
    reader = csv.DictReader(f)
    batch, sent, skipped, errors = [], 0, 0, 0
    for rec in reader:
        row = to_row(rec)
        if row is None:
            skipped += 1
            continue
        batch.append(row)
        if len(batch) >= 500:
            code, msg = send(batch)
            if code not in (200, 201, 204):
                errors += 1
                print(f"  ⚠ {code} {msg}")
            sent += len(batch)
            batch = []
            if sent % 10000 == 0:
                print(f"  {sent:,}건 전송")
    if batch:
        code, msg = send(batch)
        if code not in (200, 201, 204):
            errors += 1
            print(f"  ⚠ {code} {msg}")
        sent += len(batch)
    f.close()
    print(f"  완료: 전송 {sent:,} / 스킵(좌표·번호 없음) {skipped:,} / 배치오류 {errors}")

if __name__ == "__main__":
    files = [os.path.expanduser(p) for p in sys.argv[1:]]
    if not files:
        sys.exit("사용법: python3 scripts/ingest_sangga.py <상가정보CSV> [<CSV2> ...]")
    for p in files:
        if not os.path.exists(p):
            print(f"파일 없음: {p}")
            continue
        ingest(p)
    print("\n전체 적재 완료.")
