"""Extract reference-week mainline passenger legs from AF/KL's public SSIM.

Usage: python3 tools/extract_top20_afkl.py downloaded.ssim
UTC dates and weekday masks are converted to LOCAL departure days before import.
Codeshares/wet leases are excluded because this feed omits their operator detail.
"""
import datetime as dt
import json
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
HUBS = set('ATL DXB HND DFW PVG ORD LHR IST CAN DEN DEL ICN LAX CDG PEK SIN AMS MAD SZX KUL'.split())
WEEK = dt.date(2026, 11, 9)


def date(value):
    return dt.datetime.strptime(value, '%d%b%y').date()


def offset(value):
    minutes = int(value[1:3]) * 60 + int(value[3:5])
    return dt.timedelta(minutes=minutes * (-1 if value[0] == '-' else 1))


def main():
    facts, excluded = [], Counter()
    lines = Path(sys.argv[1]).read_text().splitlines()
    hub_flights = {line[2:9] for line in lines if line.startswith('3')
                   and {line[36:39], line[54:57]} & HUBS}
    for number, line in enumerate(lines, 1):
        if line.startswith('2'):
            assert line[1] == 'U', 'This extractor expects the published UTC feed'
        if not line.startswith('3') or line[2:9] not in hub_flights:
            continue
        start, end = date(line[14:21]), date(line[21:28])
        if end < WEEK - dt.timedelta(days=2) or start > WEEK + dt.timedelta(days=7):
            continue
        carrier = line[2:5].strip()
        if line[13] != 'J' or line[1].strip() or line[148].strip() or any(
            line[a:b].strip() != carrier for a, b in [(128, 131), (131, 134), (134, 137)]
        ):
            excluded['Cargo, suffix, codeshare, wet lease or different owner/crew'] += 1
            continue
        # Date variations give each leg's UTC date relative to itinerary origin.
        assert line[192] in '012' and line[193] in '012'
        days = []
        for delta in range(-3, 8):
            day = WEEK + dt.timedelta(days=delta)
            if not start <= day <= end or str(day.isoweekday()) not in line[28:35]:
                continue
            departure = dt.datetime.combine(day + dt.timedelta(days=int(line[192])),
                                            dt.datetime.strptime(line[39:43], '%H%M').time())
            arrival = dt.datetime.combine(day + dt.timedelta(days=int(line[193])),
                                          dt.datetime.strptime(line[61:65], '%H%M').time())
            duration = int((arrival - departure).total_seconds() / 60)
            assert 0 < duration <= 1200, (number, duration)
            local_dep = departure + offset(line[47:52])
            local_arr = arrival + offset(line[65:70])
            if WEEK <= local_dep.date() <= WEEK + dt.timedelta(days=6):
                days.append(str(local_dep.isoweekday()))
                dep, arr = local_dep.strftime('%H:%M'), local_arr.strftime('%H:%M')
                day_offset = (local_arr.date() - local_dep.date()).days
        if not days:
            continue
        facts.append(dict(airline=carrier, flight=carrier + str(int(line[5:9])),
                          origin=line[36:39], destination=line[54:57], days=''.join(sorted(set(days))),
                          dep=dep, arr=arr, offset=day_offset, aircraft=line[72:75],
                          valid_from=str(WEEK), valid_to=str(WEEK + dt.timedelta(days=6)),
                          source='afkl-top20-202611', raw=line,
                          notes=f'AFKL public W26/S27 SSIM, created 03NOV26, line {number}; UTC dates converted to local departure days using itinerary date variations; scheduled passenger service J; same carrier/owner/crew and no codeshare flag. Source UTC validity {start}–{end}.'))
    (ROOT / 'data/extracted/top20_afkl_202611.json').write_text(json.dumps(facts, ensure_ascii=False, indent=1) + '\n')
    print('AFKL facts', len(facts), 'excluded', dict(excluded))


if __name__ == '__main__':
    main()
