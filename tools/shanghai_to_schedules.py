"""Import the captured Shanghai domestic timetable; existing sources take priority.

Usage: python3 tools/shanghai_to_schedules.py
Input facts are in data/extracted/shanghai_202611.json. No network access.
"""
import csv
import json
from collections import defaultdict
from pathlib import Path

from priority_to_schedules import FIELDS, write_csv

ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / "data/schedules/shanghai_202611.csv"


def key(row):
    return row["operating_flight_number"], row["origin"], row["destination"]


def main():
    facts = json.loads((ROOT / "data/extracted/shanghai_202611.json").read_text())
    airports = {r["iata"]: r for r in csv.DictReader((ROOT / "data/reference/airports.csv").open())}
    occupied = defaultdict(set)
    for path in sorted((ROOT / "data/schedules").glob("*.csv")):
        if path == OUTPUT:
            continue
        with path.open() as f:
            for row in csv.DictReader(f):
                occupied[key(row)].update(row["days_of_week"])

    candidates, held = [], []
    # Official Zhuhai records precede secondary Shanghai records.
    for fact in sorted(facts, key=lambda r: r["publisher_kind"] != "airport"):
        row = dict.fromkeys(FIELDS, "")
        row.update(operating_airline=fact["airline"], operating_flight_number=fact["flight"],
                   origin=fact["origin"], destination=fact["destination"],
                   days_of_week=fact["days"], departure_local=fact["times"][0],
                   arrival_local=fact["times"][1], aircraft_raw=fact.get("aircraft", ""),
                   reference_week_start="2026-11-09", source_valid_from="2026-11-09",
                   source_valid_to="2026-11-15", passenger_status="passenger",
                   source_ref=fact["source"], captured_at="2026-11-05",
                   verification_status="source_checked" if fact["publisher_kind"] == "airport" else "source_parsed",
                   notes=fact["notes"])
        reason = ""
        if fact["stops"] != "直飞":
            reason = "Through flight: intermediate segment times unavailable"
        elif any(code not in airports for code in (row["origin"], row["destination"])):
            reason = "Airport metadata missing"
        elif any(airports[code]["country"] != "CN" or airports[code]["tz"] != "Asia/Shanghai"
                 for code in (row["origin"], row["destination"])):
            reason = "Outside this mainland domestic import"
        if reason:
            held.append({**row, "reason": reason})
            continue
        row["arrival_day_offset"] = str(int(row["arrival_local"] < row["departure_local"]))
        candidates.append(row)

    # Hold conflicting times on the same day within a source, rather than choosing one.
    variants = defaultdict(set)
    for row in candidates:
        for day in row["days_of_week"]:
            variants[(row["source_ref"], key(row), day)].add((row["departure_local"], row["arrival_local"]))
    accepted = []
    for row in candidates:
        conflicts = "".join(d for d in row["days_of_week"] if len(variants[(row["source_ref"], key(row), d)]) > 1)
        overlap = "".join(d for d in row["days_of_week"] if d in occupied[key(row)])
        for days, reason in [(conflicts, "Source has conflicting times"), (overlap, "Existing or higher-priority source retained")]:
            if days:
                held.append({**row, "days_of_week": days, "reason": reason})
        row["days_of_week"] = "".join(d for d in row["days_of_week"] if d not in conflicts + overlap)
        if not row["days_of_week"]:
            continue
        row["schedule_id"] = f"{row['source_ref']}-{row['operating_flight_number']}-{row['origin']}{row['destination']}-{row['days_of_week']}"
        occupied[key(row)].update(row["days_of_week"])
        accepted.append(row)
    write_csv(OUTPUT, accepted)
    write_csv(ROOT / "data/review/shanghai_202611_held.csv", held, FIELDS + ["reason"])
    print(f"Shanghai: {len(accepted)} accepted; {len(held)} excluded/overlapping records")


if __name__ == "__main__":
    main()
