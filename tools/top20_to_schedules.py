"""Normalize captured timetable facts for the global top-20 airport expansion.

Run after updating data/extracted/top20_202611.json. Existing schedules win;
source conflicts are held for review. Does not download or activate a pack.
"""
import csv
import json
from collections import defaultdict
from pathlib import Path

from priority_to_schedules import FIELDS, inferred_offset, write_csv

ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / "data/schedules/top20_202611.csv"


def main():
    facts = [fact for path in sorted((ROOT / "data/extracted").glob("top20*_202611.json"))
             for fact in json.loads(path.read_text())]
    airports = {r["iata"]: r for r in csv.DictReader((ROOT / "data/reference/airports.csv").open())}
    occupied = defaultdict(set)
    for path in sorted((ROOT / "data/schedules").glob("*.csv")):
        if path == OUTPUT:
            continue
        with path.open() as f:
            for r in csv.DictReader(f):
                occupied[(r["operating_flight_number"], r["origin"], r["destination"])].update(r["days_of_week"])
    variants = defaultdict(set)
    for r in facts:
        for day in r["days"]:
            variants[(r["source"], r["flight"], r["origin"], r["destination"], day)].add((r["dep"], r["arr"], r["aircraft"]))
    accepted, held = [], []
    for fact in facts:
        row = dict.fromkeys(FIELDS, "")
        row.update(operating_airline=fact["airline"], operating_flight_number=fact["flight"],
                   origin=fact["origin"], destination=fact["destination"], days_of_week=fact["days"],
                   departure_local=fact["dep"], arrival_local=fact["arr"],
                   arrival_day_offset=str(fact.get("offset", "")),
                   reference_week_start="2026-11-09", source_valid_from=fact["valid_from"],
                   source_valid_to=fact["valid_to"], aircraft_raw=fact["aircraft"],
                   passenger_status="passenger", source_ref=fact["source"], captured_at=fact.get("captured_at", "2026-11-06"),
                   verification_status=fact.get("verification", "source_parsed"), notes=fact["notes"])
        key = (fact["flight"], fact["origin"], fact["destination"])
        conflicts = "".join(d for d in fact["days"] if len(variants[(fact["source"], *key, d)]) > 1)
        overlap = "".join(d for d in fact["days"] if d in occupied[key])
        for days, reason in [(conflicts, "Conflicting source time/aircraft on this day"), (overlap, "Existing or duplicate flight/day retained")]:
            if days:
                held.append({**row, "days_of_week": days, "reason": reason})
        row["days_of_week"] = "".join(d for d in fact["days"] if d not in conflicts + overlap)
        if not row["days_of_week"]:
            continue
        try:
            if not row["arrival_day_offset"]:
                row["arrival_day_offset"] = str(inferred_offset(row, airports))
        except (KeyError, ValueError) as e:
            held.append({**row, "reason": str(e)})
            continue
        row["schedule_id"] = f"{fact['source']}-{fact['flight']}-{fact['origin']}{fact['destination']}-{row['days_of_week']}"
        occupied[key].update(row["days_of_week"])
        accepted.append(row)
    write_csv(OUTPUT, accepted)
    write_csv(ROOT / "data/review/top20_202611_held.csv", held, FIELDS + ["reason"])
    print(f"Top 20: {len(accepted)} accepted; {len(held)} held/overlapping records")


if __name__ == "__main__":
    main()
