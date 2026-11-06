"""Convert the November 2026 Cathay/United XLSX and STARLUX JSON timetables.

Uses only the standard library. Does not download files or activate a pack.
Usage: python3 tools/priority_to_schedules.py cx|ua|jx input --captured 2026-11-04
Writes source cells to data/extracted and normalized rows to data/schedules.
"""
import argparse
import csv
import datetime as dt
import json
import re
import xml.etree.ElementTree as ET
import zipfile
from collections import defaultdict
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parent.parent
WEEK = dt.date(2026, 11, 9)
NS = {"s": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
FIELDS = [
    "schedule_id", "operating_airline", "operating_flight_number", "marketing_codeshares",
    "origin", "destination", "days_of_week", "departure_local", "arrival_local",
    "arrival_day_offset", "reference_week_start", "source_valid_from", "source_valid_to",
    "aircraft_raw", "aircraft_type", "aircraft_evidence_status", "passenger_status",
    "source_ref", "captured_at", "verification_status", "notes",
]


def xlsx_rows(path, sheet):
    with zipfile.ZipFile(path) as z:
        strings = []
        if "xl/sharedStrings.xml" in z.namelist():
            strings = ["".join(e.itertext()) for e in ET.fromstring(z.read("xl/sharedStrings.xml")).findall("s:si", NS)]
        xml = ET.fromstring(z.read(f"xl/worksheets/sheet{sheet}.xml"))
        for row in xml.findall("s:sheetData/s:row", NS):
            cells = {}
            for cell in row:
                value = cell.find("s:v", NS)
                value = value.text if value is not None else ""
                if cell.get("t") == "s":
                    value = strings[int(value)]
                elif cell.get("t") == "inlineStr":
                    value = "".join(cell.find("s:is", NS).itertext())
                cells[re.sub(r"\d", "", cell.get("r"))] = value
            yield int(row.get("r")), cells


def excel_date(value):
    return dt.date(1899, 12, 30) + dt.timedelta(days=int(float(value)))


def active_days(days, start, end):
    return "".join(str(d) for d in range(1, 8) if str(d) in days and start <= WEEK + dt.timedelta(days=d - 1) <= end)


def clock(value):
    match = re.fullmatch(r"(\d{2}):?(\d{2})([+-]\d)?", value.strip())
    if not match:
        raise ValueError(f"Unknown time: {value!r}")
    return f"{match[1]}:{match[2]}", int(match[3] or 0)


def inferred_offset(row, airports):
    """UA omits date suffixes. Select the unique positive duration <= 20h.

    This is calendar arithmetic from local times and airport timezones, not an
    estimated flying time. Ambiguous/missing data must be reviewed separately.
    """
    candidates = []
    for offset in (-1, 0, 1, 2):
        durations = set()
        for day in row["days_of_week"]:
            date = WEEK + dt.timedelta(days=int(day) - 1)
            dep = dt.datetime.combine(date, dt.time.fromisoformat(row["departure_local"]), ZoneInfo(airports[row["origin"]]["tz"]))
            arr = dt.datetime.combine(date + dt.timedelta(days=offset), dt.time.fromisoformat(row["arrival_local"]), ZoneInfo(airports[row["destination"]]["tz"]))
            durations.add(int((arr.astimezone(dt.timezone.utc) - dep.astimezone(dt.timezone.utc)).total_seconds() / 60))
        if len(durations) == 1 and 0 < next(iter(durations)) <= 1200:
            candidates.append(offset)
    if len(candidates) != 1:
        raise ValueError(f"No unique arrival date: {candidates}")
    return candidates[0]


def extract(carrier, path, captured):
    source = f"{carrier}-202611-official"
    raw, normalized = [], []
    for sheet in ([1] if carrier == "cx" else [1, 2]):
        for number, cells in xlsx_rows(path, sheet):
            if carrier == "cx":
                if cells.get("A") != "CX" or cells.get("T") not in ("Wide-Body", "Narrow-Body") or float(cells["H"]) != 0:
                    continue
                start, end = excel_date(cells["I"]), excel_date(cells["J"])
                days = "".join(str(day) for day, col in enumerate("LMNOPQK", 1) if cells.get(col) == "✓")
                origin, dest, flight, dep, arr, aircraft = (cells[k] for k in ("C", "D", "B", "R", "S", "U"))
            elif sheet == 1:
                if not re.fullmatch(r"UA\s+\d+", cells.get("D", "")):
                    continue
                start, end = excel_date(cells["E"]), excel_date(cells["F"])
                origin, dest, flight, dep, arr, aircraft, days = (cells[k] for k in ("B", "C", "D", "G", "H", "I", "J"))
            else:
                if not re.fullmatch(r"\d+", cells.get("C", "")):
                    continue
                start, end = dt.date(2026, 11, 1), dt.date(2026, 11, 30)
                origin, dest, flight, dep, arr, aircraft, days = (cells[k] for k in ("A", "B", "C", "D", "E", "F", "G"))
            days = active_days(days, start, end)
            if not days:
                continue
            raw.append({"sheet": sheet, "row": number, "cells": cells, "reference_days": days})
            flight = carrier.upper() + str(int(re.sub(r"\D", "", flight)))
            row = dict.fromkeys(FIELDS, "")
            row.update(operating_airline=carrier.upper(), operating_flight_number=flight,
                       origin=origin, destination=dest, days_of_week=days,
                       departure_local=clock(dep)[0], arrival_local=clock(arr)[0],
                       arrival_day_offset=str(clock(arr)[1]) if carrier == "cx" else "",
                       reference_week_start=WEEK.isoformat(), source_valid_from=start.isoformat(),
                       source_valid_to=end.isoformat(), aircraft_raw=aircraft, passenger_status="passenger",
                       source_ref=source, captured_at=captured, verification_status="source_parsed",
                       notes=f"Official XLSX sheet {sheet} row {number}; source aircraft {aircraft}.")
            normalized.append(row)
    return raw, normalized


def extract_jx(path, captured):
    payload = json.loads(path.read_text())
    assert payload["success"]
    raw, rows = [], []
    for region in payload["data"]["regions"]:
        for route in region["routes"]:
            for flight in route["flights"]:
                start, end = (dt.date.fromisoformat(flight[k]) for k in ("startDate", "endDate"))
                days = active_days(flight["daysOfWeek"], start, end)
                if not days:
                    continue
                raw.append({"region": region["regionCode"], "route": route["route"], "updated": region["lastUpdateTime"], **flight})
                # Only the four passenger aircraft explicitly shown in this month.
                assert flight["aircraft"] in {"32Q", "339", "359", "351"}
                assert not flight["suffix"]
                row = dict.fromkeys(FIELDS, "")
                row.update(operating_airline="JX", operating_flight_number="JX" + str(int(flight["flightNo"][2:])),
                           origin=flight["departure"], destination=flight["arrival"], days_of_week=days,
                           departure_local=flight["STD"], arrival_local=flight["STA"],
                           arrival_day_offset=str(flight["nextDayArrival"]), reference_week_start=WEEK.isoformat(),
                           source_valid_from=start.isoformat(), source_valid_to=end.isoformat(),
                           aircraft_raw=flight["aircraft"], passenger_status="passenger", source_ref="jx-202611-official",
                           captured_at=captured, verification_status="source_parsed",
                           notes=f"STARLUX public monthly timetable; route {route['route']}; updated {region['lastUpdateTime']}; excludes road feeder services.")
                rows.append(row)
    return raw, rows


def write_csv(path, rows, fields=FIELDS):
    with path.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("carrier", choices=["cx", "ua", "jx"])
    parser.add_argument("input", type=Path)
    parser.add_argument("--captured", required=True)
    args = parser.parse_args()
    raw, rows = extract_jx(args.input, args.captured) if args.carrier == "jx" else extract(args.carrier, args.input, args.captured)
    (ROOT / f"data/extracted/{args.carrier}_202611_official.json").write_text(json.dumps(raw, ensure_ascii=False, indent=1) + "\n")
    with (ROOT / "data/reference/airports.csv").open() as f:
        airports = {r["iata"]: r for r in csv.DictReader(f)}
    accepted, held = [], []
    by_day = defaultdict(set)
    for row in rows:
        for day in row["days_of_week"]:
            key = (row["operating_flight_number"], row["origin"], row["destination"], day)
            by_day[key].add((row["departure_local"], row["arrival_local"], row["aircraft_raw"]))
    conflicts = {key for key, values in by_day.items() if len(values) > 1}
    for row in rows:
        conflicting_days = "".join(d for d in row["days_of_week"] if (row["operating_flight_number"], row["origin"], row["destination"], d) in conflicts)
        if conflicting_days:
            held.append({**row, "days_of_week": conflicting_days, "reason": "Official widebody/narrowbody sheets disagree on this flight/day"})
            row["days_of_week"] = "".join(d for d in row["days_of_week"] if d not in conflicting_days)
        if not row["days_of_week"]:
            continue
        try:
            missing = {row["origin"], row["destination"]} - airports.keys()
            if missing:
                raise ValueError(f"Missing airports: {sorted(missing)}")
            if args.carrier == "ua":
                row["arrival_day_offset"] = str(inferred_offset(row, airports))
                row["notes"] += " Arrival date derived from local clocks/timezones (unique positive duration <=20h)."
            accepted.append(row)
        except ValueError as error:
            held.append({**row, "reason": str(error)})
    # Merge repeated validity periods only after applying the exact reference days.
    groups = {}
    keys = ["operating_flight_number", "origin", "destination", "departure_local", "arrival_local", "arrival_day_offset", "aircraft_raw"]
    for row in accepted:
        key = tuple(row[k] for k in keys)
        if key not in groups:
            groups[key] = row
        else:
            target = groups[key]
            target["days_of_week"] = "".join(sorted(set(target["days_of_week"] + row["days_of_week"])))
            target["source_valid_from"] = min(target["source_valid_from"], row["source_valid_from"])
            target["source_valid_to"] = max(target["source_valid_to"], row["source_valid_to"])
            target["notes"] += " " + row["notes"]
    output = sorted(groups.values(), key=lambda r: tuple(r[k] for k in keys))
    seen = defaultdict(set)
    for row in output:
        key = (row["operating_flight_number"], row["origin"], row["destination"])
        overlap = seen[key] & set(row["days_of_week"])
        if overlap:
            raise ValueError(f"Conflicting official rows for {key}, days {overlap}")
        seen[key].update(row["days_of_week"])
        row["schedule_id"] = "-".join([row["source_ref"], row["operating_flight_number"], row["origin"] + row["destination"], row["days_of_week"]])
    write_csv(ROOT / f"data/schedules/{args.carrier}_202611_official.csv", output)
    write_csv(ROOT / f"data/review/{args.carrier}_202611_official_held.csv", held, FIELDS + ["reason"])
    print(f"{args.carrier}: {len(raw)} source rows, {len(output)} normalized rows, {len(held)} held")
    print("Missing airports:", sorted({a for r in rows for a in (r["origin"], r["destination"]) if a not in airports}))


if __name__ == "__main__":
    main()
