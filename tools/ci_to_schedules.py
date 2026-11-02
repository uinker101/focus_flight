"""Turn extracted China Airlines timetable rows into the standard schedule CSV.

Usage: python3 -I tools/ci_to_schedules.py <extracted.csv> <out.csv> --week 2026-11-09 [--airports HKG,TPE,...]

Only rows that operate during the reference week are kept, and their days of
week are narrowed to the days the period of service actually covers.
"""
import argparse
import csv
import datetime as dt
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCE_ID = "ci-2026w"
SEASON = (dt.date(2026, 10, 25), dt.date(2027, 3, 27))

SCHEDULE_FIELDS = [
    "schedule_id", "operating_airline", "operating_flight_number", "marketing_codeshares",
    "origin", "destination", "days_of_week", "departure_local", "arrival_local",
    "arrival_day_offset", "reference_week_start", "source_valid_from", "source_valid_to",
    "aircraft_raw", "aircraft_type", "aircraft_evidence_status", "passenger_status",
    "source_ref", "captured_at", "verification_status", "notes",
]


def parse_date(s):
    return dt.datetime.strptime(s, "%d%b%y").date()


def period_dates(raw):
    """Return a predicate telling whether a date is inside the period of service."""
    raw = raw.strip()
    if raw == "-":
        return lambda d: SEASON[0] <= d <= SEASON[1]
    m = re.fullmatch(r"(\S+)-(\S+)", raw)
    if m:
        a, b = parse_date(m[1]), parse_date(m[2])
        return lambda d: a <= d <= b
    days = {parse_date(x.strip()) for x in raw.split("/")}
    return lambda d: d in days


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("extracted")
    ap.add_argument("out")
    ap.add_argument("--week", required=True, help="Monday of the reference week, YYYY-MM-DD")
    ap.add_argument("--airports", help="comma-separated IATA codes to keep (default: all mapped)")
    ap.add_argument("--captured-at", default=dt.date.today().isoformat())
    ap.add_argument("--checked-pages", default="", help="PDF pages compared row by row against the rendered page")
    args = ap.parse_args()

    week = dt.date.fromisoformat(args.week)
    assert week.weekday() == 0, "reference week must start on a Monday"
    names = {r["name"]: r["iata"] for r in csv.DictReader(open(ROOT / "data/reference/ci_airport_names.csv", encoding="utf-8"))}
    keep = set(args.airports.split(",")) if args.airports else None
    checked_pages = set(args.checked_pages.split(",")) - {""}

    out, skipped = [], 0
    for r in csv.DictReader(open(args.extracted, encoding="utf-8")):
        o, d = names.get(r["origin_name"]), names.get(r["destination_name"])
        if not o or not d or (keep and (o not in keep or d not in keep)):
            continue
        in_period = period_dates(r["period_raw"])
        days = "".join(
            str(n) for n in range(1, 8)
            if str(n) in r["days_of_week"] and in_period(week + dt.timedelta(days=n - 1))
        )
        if not days:
            skipped += 1
            continue
        flight = r["operating_flight_number"]
        notes = [f"PDF p.{r['page']} 原文: {r['flight_raw']}"]
        if r["period_raw"] != "-":
            notes.append(f"适用期间 {r['period_raw']}")
        out.append({
            "schedule_id": f"{SOURCE_ID}-{flight}-{o}{d}-{days}",
            "operating_airline": r["operating_airline"],
            "operating_flight_number": flight,
            "marketing_codeshares": r["marketing_flight"],
            "origin": o,
            "destination": d,
            "days_of_week": days,
            "departure_local": r["departure_local"],
            "arrival_local": r["arrival_local"],
            "arrival_day_offset": r["arrival_day_offset"],
            "reference_week_start": week.isoformat(),
            "source_valid_from": SEASON[0].isoformat(),
            "source_valid_to": SEASON[1].isoformat(),
            "aircraft_raw": r["aircraft_raw"],
            "aircraft_type": "",
            "aircraft_evidence_status": "",
            "passenger_status": "passenger",
            "source_ref": SOURCE_ID,
            "captured_at": args.captured_at,
            "verification_status": "source_checked" if r["page"] in checked_pages else "source_parsed",
            "notes": "；".join(notes),
        })
    with open(args.out, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=SCHEDULE_FIELDS)
        w.writeheader()
        w.writerows(out)
    print(f"schedules={len(out)} not_in_reference_week={skipped}")


if __name__ == "__main__":
    main()
