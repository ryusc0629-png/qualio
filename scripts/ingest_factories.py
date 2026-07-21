# -*- coding: utf-8 -*-
"""
전국등록공장현황(한국산업단지공단) → 영남권 공장만 지오코딩 + prospects_directory 적재(target='공장')
- 원본 CSV(CP949): 순번·회사명·단지명·생산품·공장주소 (좌표·지역구분 없음)
- 공장주소에서 시도/시군구 파싱(상가정보와 동일 규칙) + 카카오 주소검색으로 좌표 변환
- 좌표 결과를 로컬 캐시(영남_공장_좌표.csv)에 저장 → 중간에 끊겨도 재개
- 캐시를 prospects_directory에 REST upsert(재시도·연속실패 중단)

사용: python3 scripts/ingest_factories.py "~/Downloads/한국산업단지공단_전국등록공장현황_등록공장현황자료_20241231.csv"
"""
import csv, json, os, sys, ssl, time, urllib.parse, urllib.request, urllib.error
from concurrent.futures import ThreadPoolExecutor, as_completed

KEY = "e15dc8160183b89fd805b1b64b3be2ea"
CACHE = os.path.expanduser("~/Downloads/영남_공장_좌표.csv")
YEONGNAM = {"부산광역시", "대구광역시", "울산광역시", "경상북도", "경상남도"}

def load_env(path=".env.local"):
    env = {}
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    env[k.strip()] = v.strip().strip('"').strip("'")
    return env

ENV = load_env()
SUPABASE_URL = ENV.get("NEXT_PUBLIC_SUPABASE_URL")
SERVICE_KEY = ENV.get("SUPABASE_SERVICE_ROLE_KEY")
ENDPOINT = f"{SUPABASE_URL}/rest/v1/prospects_directory?on_conflict=store_id" if SUPABASE_URL else None

_CTX = ssl.create_default_context()
_CTX.check_hostname = False
_CTX.verify_mode = ssl.CERT_NONE

def parse_region(addr):
    """공장주소 → (시도, 시군구). 상가정보와 동일 표기 규칙."""
    t = addr.split()
    if not t:
        return None, None
    sido = t[0]
    if sido.endswith(("광역시", "특별시", "특별자치시")):
        return sido, (t[1] if len(t) > 1 else None)
    if sido.endswith(("도", "특별자치도")):
        if len(t) >= 3 and t[2].endswith("구"):
            return sido, f"{t[1]} {t[2]}"
        return sido, (t[1] if len(t) > 1 else None)
    return sido, (t[1] if len(t) > 1 else None)

def _get(url):
    req = urllib.request.Request(url, headers={"Authorization": f"KakaoAK {KEY}"})
    with urllib.request.urlopen(req, timeout=10, context=_CTX) as r:
        return json.loads(r.read().decode())

def geocode(addr, name):
    for _ in range(2):  # 일시 오류 1회 재시도
        try:
            q = urllib.parse.quote(addr)
            d = _get(f"https://dapi.kakao.com/v2/local/search/address.json?query={q}")
            docs = d.get("documents", [])
            if docs:
                return float(docs[0]["x"]), float(docs[0]["y"])
            q = urllib.parse.quote(f"{name} {addr}")
            d = _get(f"https://dapi.kakao.com/v2/local/search/keyword.json?query={q}")
            docs = d.get("documents", [])
            if docs:
                return float(docs[0]["x"]), float(docs[0]["y"])
            return None
        except Exception:
            time.sleep(0.3)
    return None

FIELDS = ["store_id", "name", "sido", "sigungu", "addr", "product", "lng", "lat"]

def read_targets(src):
    out = []
    with open(src, encoding="cp949", newline="") as f:
        for row in csv.DictReader(f):
            addr = (row.get("공장주소") or "").strip()
            name = (row.get("회사명") or "").strip()
            seq = (row.get("순번") or "").strip()
            if not addr or not name or not seq:
                continue
            sido, sigungu = parse_region(addr)
            if sido not in YEONGNAM:
                continue
            out.append({
                "store_id": f"FAC{seq}", "name": name, "sido": sido,
                "sigungu": sigungu or "", "addr": addr,
                "product": (row.get("생산품") or "").strip(),
            })
    return out

def load_cache_done():
    done = set()
    if os.path.exists(CACHE):
        with open(CACHE, encoding="utf-8-sig") as f:
            for r in csv.DictReader(f):
                done.add(r["store_id"])
    return done

def geocode_phase(targets):
    done = load_cache_done()
    todo = [t for t in targets if t["store_id"] not in done]
    print(f"[지오코딩] 대상 {len(targets)} / 완료 {len(done)} / 남음 {len(todo)}")
    if not todo:
        return
    new = not os.path.exists(CACHE)
    fout = open(CACHE, "a", encoding="utf-8-sig", newline="")
    w = csv.DictWriter(fout, fieldnames=FIELDS)
    if new:
        w.writeheader()
    ok = fail = 0
    def work(t):
        res = geocode(t["addr"], t["name"])
        return t, res
    with ThreadPoolExecutor(max_workers=8) as ex:
        futs = [ex.submit(work, t) for t in todo]
        for i, fut in enumerate(as_completed(futs), 1):
            t, res = fut.result()
            rec = {k: t.get(k, "") for k in ("store_id", "name", "sido", "sigungu", "addr", "product")}
            if res:
                rec["lng"], rec["lat"] = res; ok += 1
            else:
                rec["lng"] = rec["lat"] = ""; fail += 1
            w.writerow(rec)
            if i % 2000 == 0:
                fout.flush(); print(f"  {i}/{len(todo)} (성공 {ok} 실패 {fail})")
    fout.close()
    print(f"[지오코딩] 완료: 성공 {ok} 실패 {fail}")

def _post(batch, retries=5):
    body = json.dumps(batch, ensure_ascii=False).encode("utf-8")
    code, msg = 0, ""
    for attempt in range(retries):
        req = urllib.request.Request(ENDPOINT, data=body, method="POST", headers={
            "apikey": SERVICE_KEY, "Authorization": f"Bearer {SERVICE_KEY}",
            "Content-Type": "application/json",
            "Prefer": "resolution=merge-duplicates,return=minimal",
        })
        try:
            with urllib.request.urlopen(req, timeout=60, context=_CTX) as r:
                return r.status, ""
        except urllib.error.HTTPError as e:
            code, msg = e.code, e.read().decode("utf-8", "replace")[:200]
            if 400 <= code < 500:
                return code, msg
        except Exception as e:
            code, msg = 0, repr(e)[:200]
        time.sleep(2 ** (attempt + 1))
    return code, msg

def insert_phase():
    print("[적재] 캐시 → prospects_directory (target=공장)")
    rows = []
    with open(CACHE, encoding="utf-8-sig") as f:
        for r in csv.DictReader(f):
            if not r.get("lat") or not r.get("lng"):
                continue
            rows.append({
                "store_id": r["store_id"], "name": r["name"], "target": "공장",
                "sido": r["sido"] or None, "sigungu": r["sigungu"] or None,
                "addr_road": r["addr"] or None, "cat_sub": r.get("product") or None,
                "lat": float(r["lat"]), "lng": float(r["lng"]),
            })
    print(f"  좌표 있는 공장 {len(rows):,}건 적재 시작")
    sent = fail = consec = 0
    for i in range(0, len(rows), 500):
        batch = rows[i:i + 500]
        code, msg = _post(batch)
        if code in (200, 201, 204):
            sent += len(batch); consec = 0
        else:
            fail += len(batch); consec += 1
            print(f"  ⚠ {code} {msg}")
            if consec >= 3:
                print("  🛑 연속 실패 — 중단"); break
        if sent % 10000 == 0 and sent:
            print(f"  {sent:,}건 적재")
        time.sleep(0.03)
    print(f"[적재] 완료: {sent:,}건 / 실패 {fail:,}")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit("사용법: python3 scripts/ingest_factories.py <전국등록공장현황.csv>")
    if not (SUPABASE_URL and SERVICE_KEY):
        sys.exit("환경변수 없음(.env.local 확인)")
    src = os.path.expanduser(sys.argv[1])
    targets = read_targets(src)
    print(f"영남권 공장 {len(targets):,}개")
    geocode_phase(targets)
    insert_phase()
    print("전체 완료.")
