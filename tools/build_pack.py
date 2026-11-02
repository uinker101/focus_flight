"""Validate schedule CSVs and compile them into a versioned JSON data pack.

Usage: python3 -I tools/build_pack.py --version <dataset_version> [--start HKG] [--title "..."]

Reads data/reference/*.csv, data/sources.csv and data/schedules/*.csv.
Writes app/packs/<version>.json, updates app/packs/index.json and writes a
review list of rejected rows to data/review/<version>.txt.
"""
import argparse
import csv
import datetime as dt
import json
import re
from collections import defaultdict
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parent.parent
SCHEMA_VERSION = 1
TIME_RE = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")
DAYS_RE = re.compile(r"^1?2?3?4?5?6?7?$")
FLIGHT_RE = re.compile(r"^[A-Z0-9]{2}\d{1,4}[A-Z]?$")
VERIFICATION = {"source_parsed", "source_checked", "cross_checked", "manual"}
PASSENGER = {"passenger", "cargo", "unknown"}
EVIDENCE = {"exact", "family", "multiple", "varies", "unmapped", "missing"}


def read_csv(path):
    with open(path, encoding="utf-8") as f:
        return list(csv.DictReader(f))


def classify_aircraft(raw, codes, types):
    """Map a raw aircraft string to (type, family, evidence_status)."""
    raw = raw.strip()
    if not raw:
        return None, None, "missing"
    if raw == "EQV":
        return None, None, "varies"
    parts = raw.split("/")
    mapped = [codes.get(p) for p in parts]
    if any(m is None for m in mapped):
        return None, None, "unmapped"
    distinct = sorted(set(mapped))
    if len(distinct) == 1:
        return distinct[0], types[distinct[0]]["family"], "exact"
    families = {types[t]["family"] for t in distinct}
    if len(families) == 1:
        return None, families.pop(), "family"
    return None, None, "multiple"


def local_dt(date, hhmm, tz):
    h, m = map(int, hhmm.split(":"))
    return dt.datetime(date.year, date.month, date.day, h, m, tzinfo=ZoneInfo(tz))


def check_row(row, airports, airlines, codes, types, sources):
    """Return (compiled_schedule, errors)."""
    errors = []
    for key in ("origin", "destination"):
        if row[key] not in airports:
            errors.append(f"{key} {row[key]!r} 不在机场参考表")
    if row["operating_airline"] not in airlines:
        errors.append(f"执飞公司 {row['operating_airline']!r} 不在航司参考表")
    if not FLIGHT_RE.match(row["operating_flight_number"]) or not row["operating_flight_number"].startswith(row["operating_airline"]):
        errors.append(f"执飞航班号 {row['operating_flight_number']!r} 格式不对或与执飞公司不符")
    if row["origin"] == row["destination"]:
        errors.append("出发与抵达机场相同")
    if not row["days_of_week"] or not DAYS_RE.match(row["days_of_week"]):
        errors.append(f"运行星期 {row['days_of_week']!r} 应为升序的 1-7 数字")
    for key in ("departure_local", "arrival_local"):
        if not TIME_RE.match(row[key]):
            errors.append(f"{key} {row[key]!r} 不是 HH:MM")
    if row["arrival_day_offset"] not in ("0", "1", "2"):
        errors.append(f"抵达跨日 {row['arrival_day_offset']!r} 应为 0/1/2")
    if row["source_ref"] not in sources:
        errors.append(f"来源 {row['source_ref']!r} 不在 sources.csv")
    if row["verification_status"] not in VERIFICATION:
        errors.append(f"核验状态 {row['verification_status']!r} 不在 {sorted(VERIFICATION)}")
    if row["passenger_status"] != "passenger":
        errors.append(f"客货属性为 {row['passenger_status']!r}，只收客运航段")
    try:
        week = dt.date.fromisoformat(row["reference_week_start"])
        if week.weekday() != 0:
            errors.append("参考周开始日不是星期一")
    except ValueError:
        errors.append(f"参考周 {row['reference_week_start']!r} 不是日期")
    if errors:
        return None, errors

    o, d = airports[row["origin"]], airports[row["destination"]]
    offset = int(row["arrival_day_offset"])
    durations = set()
    for ch in row["days_of_week"]:
        day = week + dt.timedelta(days=int(ch) - 1)
        dep = local_dt(day, row["departure_local"], o["tz"])
        arr = local_dt(day + dt.timedelta(days=offset), row["arrival_local"], d["tz"])
        durations.add(int((arr - dep).total_seconds() // 60))
    if len(durations) != 1:
        return None, [f"参考周内各天航程不一致 {sorted(durations)}，需要拆成不同模板"]
    duration = durations.pop()
    if duration <= 0 or duration > 20 * 60:
        return None, [f"计算航程 {duration} 分钟不合理（检查时区或跨日）"]

    ac_type, ac_family, status = classify_aircraft(row["aircraft_raw"], codes, types)
    if row.get("aircraft_type"):  # explicit override from a better source
        ac_type = row["aircraft_type"]
        if ac_type not in types:
            return None, [f"机型覆盖值 {ac_type!r} 不在机型参考表"]
        ac_family = types[ac_type]["family"]
        status = row.get("aircraft_evidence_status") or "exact"
    if status not in EVIDENCE:
        return None, [f"机型依据 {status!r} 不在 {sorted(EVIDENCE)}"]

    return {
        "id": row["schedule_id"],
        "airline": row["operating_airline"],
        "flight": row["operating_flight_number"],
        "codeshares": [c for c in row["marketing_codeshares"].split(";") if c],
        "origin": row["origin"],
        "destination": row["destination"],
        "days": row["days_of_week"],
        "dep": row["departure_local"],
        "arr": row["arrival_local"],
        "arr_offset": offset,
        "duration_min": duration,
        "aircraft": {"raw": row["aircraft_raw"], "type": ac_type, "family": ac_family, "status": status},
        "source": row["source_ref"],
        "verification": row["verification_status"],
        "notes": row["notes"],
    }, []


def find_duplicates(schedules):
    """Same operating flight on overlapping days, or same slot under two numbers."""
    problems = []
    by_flight = defaultdict(list)
    by_slot = defaultdict(list)
    for s in schedules:
        by_flight[(s["flight"], s["origin"], s["destination"])].append(s)
        by_slot[(s["origin"], s["destination"], s["dep"], s["airline"])].append(s)
    for key, group in by_flight.items():
        for i, a in enumerate(group):
            for b in group[i + 1 :]:
                if set(a["days"]) & set(b["days"]):
                    problems.append(f"重复：{a['id']} 与 {b['id']} 运行星期重叠")
    for key, group in by_slot.items():
        flights = {s["flight"] for s in group}
        if len(flights) > 1:
            problems.append(f"疑似代码共享重复：{key} 有 {sorted(flights)}")
    return problems


def connectivity(schedules, start):
    out = defaultdict(set)
    for s in schedules:
        out[s["origin"]].add(s["destination"])
    seen, stack = {start}, [start]
    while stack:
        for nxt in out[stack.pop()]:
            if nxt not in seen:
                seen.add(nxt)
                stack.append(nxt)
    dead_ends = sorted(a for a in seen if not out[a])
    unreachable = sorted({s["origin"] for s in schedules} - seen)
    return sorted(seen), dead_ends, unreachable


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--version", required=True)
    ap.add_argument("--title", default="")
    ap.add_argument("--start", default="HKG")
    args = ap.parse_args()

    airports = {r["iata"]: r for r in read_csv(ROOT / "data/reference/airports.csv")}
    airlines = {r["iata"]: r for r in read_csv(ROOT / "data/reference/airlines.csv")}
    types = {r["type"]: r for r in read_csv(ROOT / "data/reference/aircraft_types.csv")}
    codes = {r["code"]: r["type"] for r in read_csv(ROOT / "data/reference/aircraft_codes.csv")}
    sources = {r["source_id"]: r for r in read_csv(ROOT / "data/sources.csv")}
    for code, t in codes.items():
        assert t in types, f"aircraft_codes.csv: {code} -> {t} 不在 aircraft_types.csv"
    for a in airports.values():
        ZoneInfo(a["tz"])  # raises on unknown zone

    schedules, review, seen_ids = [], [], set()
    for path in sorted((ROOT / "data/schedules").glob("*.csv")):
        for n, row in enumerate(read_csv(path), start=2):
            where = f"{path.name}:{n} {row.get('schedule_id', '')}"
            if row["schedule_id"] in seen_ids:
                review.append(f"{where}\n  - schedule_id 重复")
                continue
            seen_ids.add(row["schedule_id"])
            compiled, errors = check_row(row, airports, airlines, codes, types, sources)
            if errors:
                review.append(where + "".join(f"\n  - {e}" for e in errors))
            else:
                schedules.append(compiled)

    dup_problems = find_duplicates(schedules)
    reachable, dead_ends, unreachable = connectivity(schedules, args.start)

    used_airports = sorted({s["origin"] for s in schedules} | {s["destination"] for s in schedules})
    used_airlines = sorted({s["airline"] for s in schedules})
    used_types = sorted({s["aircraft"]["type"] for s in schedules if s["aircraft"]["type"]})
    used_sources = sorted({s["source"] for s in schedules})
    status_counts = defaultdict(int)
    for s in schedules:
        status_counts[s["aircraft"]["status"]] += 1

    def num(v):
        return float(v)

    pack = {
        "schema_version": SCHEMA_VERSION,
        "dataset_version": args.version,
        "title": args.title or args.version,
        "generated_at": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "start_airport": args.start,
        "reference_weeks": [],
        "coverage": {
            "airports": len(used_airports),
            "airlines": len(used_airlines),
            "aircraft_types": len(used_types),
            "schedules": len(schedules),
            "aircraft_evidence": dict(status_counts),
            "note": "精选参考班表，不代表这些机场的全部真实航班。",
        },
        "sources": [sources[s] for s in used_sources],
        "airports": {
            k: {
                "iata": k, "icao": airports[k]["icao"], "name": airports[k]["name_zh"], "name_en": airports[k]["name_en"],
                "city": airports[k]["city_zh"], "city_en": airports[k]["city_en"], "country": airports[k]["country"],
                "lat": num(airports[k]["lat"]), "lon": num(airports[k]["lon"]), "tz": airports[k]["tz"],
            }
            for k in used_airports
        },
        "airlines": {k: {"iata": k, "icao": airlines[k]["icao"], "name": airlines[k]["name_zh"], "name_en": airlines[k]["name_en"]} for k in used_airlines},
        "aircraft_types": {k: {"type": k, "name": types[k]["name"], "manufacturer": types[k]["manufacturer"], "family": types[k]["family"]} for k in sorted(types)},
        "schedules": schedules,
    }
    weeks = set()
    for path in sorted((ROOT / "data/schedules").glob("*.csv")):
        weeks |= {r["reference_week_start"] for r in read_csv(path) if r["schedule_id"] in {s["id"] for s in schedules}}
    pack["reference_weeks"] = sorted(weeks)

    packs_dir = ROOT / "app/packs"
    packs_dir.mkdir(parents=True, exist_ok=True)
    (packs_dir / f"{args.version}.json").write_text(json.dumps(pack, ensure_ascii=False, indent=1), encoding="utf-8")
    index_path = packs_dir / "index.json"
    index = json.loads(index_path.read_text(encoding="utf-8")) if index_path.exists() else {"active": None, "packs": []}
    index["packs"] = [p for p in index["packs"] if p["version"] != args.version]
    index["packs"].append({"version": args.version, "title": pack["title"], "file": f"{args.version}.json", "generated_at": pack["generated_at"]})
    index["active"] = args.version
    index_path.write_text(json.dumps(index, ensure_ascii=False, indent=1), encoding="utf-8")

    review_dir = ROOT / "data/review"
    review_dir.mkdir(parents=True, exist_ok=True)
    review_lines = review + dup_problems
    if dead_ends:
        review_lines.append(f"死端机场（可抵达但没有出发班次）：{dead_ends}")
    if unreachable:
        review_lines.append(f"从 {args.start} 无法到达的出发机场：{unreachable}")
    (review_dir / f"{args.version}.txt").write_text("\n".join(review_lines) + "\n", encoding="utf-8")

    print(f"pack {args.version}: {len(schedules)} schedules, {len(review)} rejected rows")
    print(f"  airports ({len(used_airports)}): {' '.join(used_airports)}")
    print(f"  airlines ({len(used_airlines)}): {' '.join(used_airlines)}")
    print(f"  aircraft types ({len(used_types)}): {' '.join(used_types)}")
    print(f"  aircraft evidence: {dict(status_counts)}")
    print(f"  reachable from {args.start}: {' '.join(reachable)}")
    print(f"  dead ends: {dead_ends or 'none'}; unreachable origins: {unreachable or 'none'}")
    print(f"  duplicate warnings: {len(dup_problems)}")
    for p in review_lines[:20]:
        print("  !", p)


if __name__ == "__main__":
    main()
