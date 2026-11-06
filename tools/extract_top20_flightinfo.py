"""Extract dated passenger schedules from saved Flight.info web text.

Discovery pages only identify flight numbers; dates/times come from individual
flight pages. Partial/truncated blocks and ambiguous operators are not imported.
"""
import csv
import datetime as dt
import json
import re
import sys
from collections import Counter
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parent.parent
WEEK = dt.date(2026, 11, 9)
HUBS = set('ATL DXB HND DFW PVG ORD LHR IST CAN DEN DEL ICN LAX CDG PEK SIN AMS MAD SZX KUL'.split())
DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']


def parse(path):
    text = re.sub(r'^L\d+: ?', '', path.read_text(), flags=re.M)
    text = '\n'.join(line.strip() for line in text.splitlines() if line.strip())
    # Boundaries require both endpoint clocks, airport codes and a dated schedule.
    pattern = r'(?m)^(\d\d:\d\d)\n([^\n]+\(([A-Z]{3})\)[^\n]*)\n(\d\d:\d\d)(?:[^\n]*)\n([^\n]+\(([A-Z]{3})\)[^\n]*)\n([^\n]+)\n(Begins|Operates only)\n'
    matches = list(re.finditer(pattern, text))
    facts, held = [], []
    flight = path.stem
    for i, m in enumerate(matches):
        body = text[m.end():matches[i + 1].start() if i + 1 < len(matches) else len(text)]
        dates = re.match(r'(Now|\d{4}-\d\d-\d\d)\n(?:-\n)?Valid to\n(\d{4}-\d\d-\d\d)', body) if m[8] == 'Begins' else re.match(r'(\d{4}-\d\d-\d\d)', body)
        availability = re.search(r'(?m)^((?:Every |Daily|Mondays|Tuesdays|Wednesdays|Thursdays|Fridays|Saturdays|Sundays)[^\n]*)$', body)
        duration = re.search(r'Duration\n(?:(\d+)h\s*)?(\d+)m', body)
        if not (dates and availability and duration):
            held.append(dict(flight=flight, reason='Incomplete dated schedule block', raw=m.group()+body[:500]))
            continue
        start, end = dates.groups() if m[8] == 'Begins' else (dates[1], dates[1])
        if start == 'Now':
            start = '2026-11-06'
        start, end = dt.date.fromisoformat(start), dt.date.fromisoformat(end)
        label = availability[1]
        days = {i + 1 for i, day in enumerate(DAYS) if day in label}
        if 'except' in label:
            days = set(range(1, 8)) - days
        # This publisher uses "Every weekday" for all seven days, confirmed
        # against its dated Saturday/Sunday AK101 departures on Nov 14/15.
        elif label in ('Daily', 'Every day', 'Every day of the week', 'Every weekday'):
            days = set(range(1, 8))
        selected = ''.join(str(n+1) for n in range(7) if n+1 in days and start <= WEEK+dt.timedelta(days=n) <= end)
        if not selected:
            continue
        dep, _, origin, arr, _, dest, aircraft, _ = m.groups()
        # These triangle-service continuations connect the new African stops.
        if not {origin, dest} & HUBS and flight not in ('TK571', 'TK553'):
            continue
        airline = flight[:2]
        # IB regional/Express flights are marketed under IB; this source does
        # not establish an operating flight number for those affiliates.
        if (airline == 'IB' and (int(flight[2:]) >= 1000 or 'CRJ' in aircraft or 'ATR' in aircraft)) or 'Operated by' in body:
            held.append(dict(flight=flight, reason='Operating carrier/flight not established', raw=m.group()+body[:500]))
            continue
        minutes = int(duration[1] or 0)*60 + int(duration[2])
        facts.append(dict(airline=airline, flight=flight, origin=origin, destination=dest,
                          dep=dep, arr=arr, days=selected, aircraft=aircraft,
                          valid_from=str(start), valid_to=str(end), source=f'flightinfo-{airline.lower()}-top20-202611',
                          notes=f'Dated Flight.info secondary timetable, https://www.flight.info/{flight}; published duration {minutes} minutes; reference-week intersection. Not live status.',
                          raw=dict(url=f'https://www.flight.info/{flight}', start=str(start), end=str(end), availability=label, duration_min=minutes)))
    return facts, held


def main():
    facts, held = [], []
    airports = {r['iata']: r for r in csv.DictReader((ROOT/'data/reference/airports.csv').open())}
    for path in sorted(Path(sys.argv[1]).glob('*.txt')):
        f, h = parse(path)
        for row in f:
            if not {row['origin'], row['destination']} <= airports.keys():
                facts.append(row)
                continue
            offsets = set()
            for day in row['days']:
                date = WEEK + dt.timedelta(days=int(day)-1)
                dep = dt.datetime.fromisoformat(f"{date}T{row['dep']}").replace(tzinfo=ZoneInfo(airports[row['origin']]['tz']))
                arr = (dep.astimezone(dt.timezone.utc) + dt.timedelta(minutes=row['raw']['duration_min'])).astimezone(ZoneInfo(airports[row['destination']]['tz']))
                if arr.strftime('%H:%M') != row['arr']:
                    break
                offsets.add((arr.date()-date).days)
            else:
                if len(offsets) == 1:
                    row['offset'] = offsets.pop()
                    facts.append(row)
                    continue
            held.append(dict(flight=row['flight'], reason='Published duration/clock conflicts with reference-week time zones', raw=row))
        held.extend(h)
    (ROOT/'data/extracted/top20_flightinfo_202611.json').write_text(json.dumps(facts, ensure_ascii=False, indent=1)+'\n')
    (ROOT/'data/review/top20_flightinfo_held.json').write_text(json.dumps(held, ensure_ascii=False, indent=1)+'\n')
    print('Flight.info facts', len(facts), 'held', len(held), dict(Counter(f['airline'] for f in facts)))


if __name__ == '__main__':
    main()
