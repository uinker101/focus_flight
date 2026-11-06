"""Read public AeroLOPA route-table snapshots downloaded from its airline indexes.

Only regular patterns with one departure time and a complete date/day count are
eligible. Irregular aggregate rows cannot establish a reference-week schedule.
Raw schedule facts and the precise source page are retained for review.
"""
import datetime as dt
import json
import re
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
HUBS = set('ATL DXB HND DFW PVG ORD LHR IST CAN DEN DEL ICN LAX CDG PEK SIN AMS MAD SZX KUL'.split())
WEEK = dt.date(2026, 11, 9)


def route_tables(text):
    chunks = re.findall(r'self\.__next_f\.push\((\[1,.*?\])\)</script>', text)
    rendered = ''.join(json.loads(chunk)[1] for chunk in chunks)
    for line in rendered.splitlines():
        try:
            value = json.loads(line.split(':', 1)[1])
        except (ValueError, IndexError):
            continue
        if (isinstance(value, list) and len(value) > 3 and isinstance(value[3], dict)
                and 'routes' in value[3] and 'carrier' in value[3]):
            yield value[3]


def main():
    facts, held = [], []
    for path in sorted(Path(sys.argv[1]).glob('routes_*.html')):
        url = 'https://www.aerolopa.com/' + path.stem.replace('_', '/')
        for table in route_tables(path.read_text()):
            carrier = table['carrier']
            for route in table['routes']:
                origin, destination = route['origin'], route['destination']
                if not {origin, destination} & HUBS:
                    continue
                for flight in route['flights']:
                    raw = dict(origin=origin, destination=destination, carrier=carrier,
                               window=table['window'], flight=flight, url=url)
                    start, end = (dt.date.fromisoformat(flight[k]) for k in ['first_date', 'last_date'])
                    days = flight['days_of_op']
                    count = sum((start + dt.timedelta(days=n)).isoweekday() in days
                                for n in range((end - start).days + 1))
                    if (flight.get('ghost') or len(flight['dep_times']) != 1
                            or not flight.get('arr_time') or count != flight['departures']):
                        held.append(dict(raw=raw, reason='Irregular aggregate, multiple departure times, missing arrival or ghost row'))
                        continue
                    week_days = ''.join(str(n + 1) for n in range(7)
                                        if start <= WEEK + dt.timedelta(days=n) <= end and n + 1 in days)
                    if not week_days:
                        continue
                    departure, arrival = flight['dep_times'][0], flight['arr_time']
                    assert re.fullmatch(r'\d{4}', departure) and re.fullmatch(r'\d{4}', arrival)
                    # Do not choose an aircraft from historical sightings or a mixed-date fleet summary.
                    aircraft = ''
                    types = flight.get('scheduled_types', [])
                    if len(types) == 1 and types[0]['departures'] == count:
                        aircraft = types[0].get('type_name') or types[0]['type']
                    fact = dict(airline=carrier, flight=carrier + str(int(flight['flight_no'])),
                                origin=origin, destination=destination, days=week_days,
                                dep=departure[:2] + ':' + departure[2:], arr=arrival[:2] + ':' + arrival[2:],
                                aircraft=aircraft, valid_from=str(start), valid_to=str(end),
                                source=f'aerolopa-{carrier.lower()}-top20-202611', raw=raw,
                                notes=f'Public AeroLOPA/OAG schedule snapshot: {url}; single departure time and complete calendar weekday count ({count} departures). Published aggregate arrival clock; no live cancellation check. Aircraft omitted for mixed-type dates; observed layouts not treated as schedule evidence.')
                    if flight.get('arr_day') is not None:
                        fact['offset'] = flight['arr_day']
                    facts.append(fact)
    (ROOT / 'data/extracted/top20_aerolopa_202611.json').write_text(json.dumps(facts, ensure_ascii=False, indent=1) + '\n')
    (ROOT / 'data/review/top20_aerolopa_held.json').write_text(json.dumps(held, ensure_ascii=False, indent=1) + '\n')
    print('AeroLOPA eligible', len(facts), 'held', len(held), dict(Counter(f['airline'] for f in facts)))


if __name__ == '__main__':
    main()
