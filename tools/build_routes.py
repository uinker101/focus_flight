"""Build offline reference flight plans from the bundled FlightGear navdata.

python3 tools/build_routes.py
No network or third-party dependencies. DCT edges are explicitly planned,
not represented as published airways. See docs/REFERENCE_ROUTES.md.
"""
import collections
import gzip
import hashlib
import heapq
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / 'data/navigation'
OUT = ROOT / 'app/assets/routes/reference.json'


def distance(a, b):
    p, q = math.radians(a[0]), math.radians(b[0])
    h = math.sin((q - p) / 2) ** 2 + math.cos(p) * math.cos(q) * math.sin(math.radians(b[1] - a[1]) / 2) ** 2
    return 12742 * math.asin(min(1, math.sqrt(h)))


def rows(name):
    return (line.split() for line in gzip.open(DATA / f'focus-flight-{name}.dat.gz', 'rt', encoding='latin1'))


def build():
    index = json.loads((ROOT / 'app/packs/index.json').read_text())
    entry = next(p for p in index['packs'] if p['version'] == index['active'])
    pack = json.loads((ROOT / 'app/packs' / entry['file']).read_text())
    airports = pack['airports']
    airfields = json.loads((DATA / 'airfield_routes.json').read_text())
    nodes, ids, graph = [], {}, collections.defaultdict(dict)

    def node(name, lat, lon):
        key = (name, round(float(lat), 5), round(float(lon), 5))
        if key not in ids:
            ids[key] = len(nodes)
            nodes.append(key)
        return ids[key]

    def edge(a, b, label, penalty=1):
        if a == b:
            return
        km = distance(nodes[a][1:], nodes[b][1:])
        value = (km * penalty, km, label)
        if value[0] < graph[a].get(b, (math.inf,))[0]:
            graph[a][b] = value
            graph[b][a] = value

    for r in rows('awy'):
        if len(r) == 10:
            edge(node(*r[:3]), node(*r[3:6]), r[9])
    airway_nodes = len(nodes)

    # Local radio aids let short island/regional flights use nearby navigation
    # instead of detouring to a remote enroute airway. Ignore ILS/localizers.
    aids = [(r[7], float(r[1]), float(r[2])) for r in rows('nav') if len(r) >= 9 and r[0] in ('2', '3')]
    for a in airports.values():
        nearby = heapq.nsmallest(3, ((distance((a['lat'], a['lon']), n[1:]), n) for n in aids))
        for km, n in nearby:
            if km < 80:
                node(*n)

    # The historic airway graph omits flexible oceanic tracks. Use source
    # coordinate fixes for a static DCT plan (not a daily oceanic track).
    ocean = set()
    for r in rows('fix'):
        if len(r) != 3:
            continue
        lat, lon = float(r[0]), float(r[1])
        ocean_region = (15 <= lat <= 60 and -60 <= lon <= -15) or (-20 <= lat <= 40 and (lon >= 150 or lon <= -120))
        equatorial_pacific = -5 <= lat <= 10 and (lon >= 170 or lon <= -150)
        if (ocean_region and lat % 5 == 0 and lon % 5 == 0) or equatorial_pacific:
            ocean.add(node(r[2], lat, lon))

    # Spatial buckets keep compilation small enough for the system Python.
    buckets = collections.defaultdict(list)
    for i, (_, lat, lon) in enumerate(nodes):
        buckets[(math.floor(lat / 3), math.floor((lon + 180) / 3) % 120)].append(i)

    def nearby(i):
        _, lat, lon = nodes[i]
        y, x = math.floor(lat / 3), math.floor((lon + 180) / 3)
        span = math.ceil(3 / max(0.1, math.cos(math.radians(lat))))
        for yy in range(y - 2, y + 3):
            for xx in range(x - span, x + span + 1):
                for j in buckets.get((yy, xx % 120), []):
                    if j != i:
                        yield j

    # Prefer published airway segments. Nearby DCT connections bridge gaps;
    # selecting by quadrant avoids connecting only to points behind a flight.
    for i, (_, lat, lon) in enumerate(nodes):
        quadrants = collections.defaultdict(list)
        for j in nearby(i):
            km = distance(nodes[i][1:], nodes[j][1:])
            if 0.05 < km <= 350:
                dl = (nodes[j][2] - lon + 180) % 360 - 180
                quadrants[(nodes[j][1] >= lat, dl >= 0)].append((km, j))
        for group in quadrants.values():
            for _, j in heapq.nsmallest(4, group):
                edge(i, j, 'DCT', 1.15)
    for i in ocean:
        for j in ocean:
            if i < j and distance(nodes[i][1:], nodes[j][1:]) <= 850:
                edge(i, j, 'DCT', 1.15)
        for km, j in heapq.nsmallest(6, ((distance(nodes[i][1:], n[1:]), j) for j, n in enumerate(nodes[:airway_nodes]))):
            if km <= 650:
                edge(i, j, 'DCT', 1.15)

    near = {}
    for code, a in airports.items():
        near[code] = heapq.nsmallest(12, ((distance((a['lat'], a['lon']), n[1:]), i) for i, n in enumerate(nodes)))
    pairs = collections.defaultdict(set)
    for s in pack['schedules']:
        pairs[s['origin']].add(s['destination'])
    routes, report = {}, []
    for oi, (o, destinations) in enumerate(sorted(pairs.items())):
        cost = {i: km * 1.15 for km, i in near[o]}
        previous = {i: None for _, i in near[o]}
        heap = [(v, k) for k, v in cost.items()]
        heapq.heapify(heap)
        targets = {i for d in destinations for _, i in near[d]}
        while heap and targets:
            c, a = heapq.heappop(heap)
            if c != cost[a]:
                continue
            targets.discard(a)
            for b, (weight, _, _) in graph[a].items():
                nc = c + weight
                if nc < cost.get(b, math.inf):
                    cost[b], previous[b] = nc, a
                    heapq.heappush(heap, (nc, b))
        for d in sorted(destinations):
            _, end = min((cost.get(i, math.inf) + km * 1.15, i) for km, i in near[d])
            if end not in previous:
                raise ValueError(f'No reference route: {o}-{d}')
            path = [end]
            while previous[path[-1]] is not None:
                path.append(previous[path[-1]])
            path.reverse()
            extra = airfields['routes'].get(f'{o}-{d}')
            if extra:
                path = [node(*p) for p in extra['points']]
                legs = ['DCT'] * (len(path) + 1)
            else:
                legs = ['DCT'] + [graph[a][b][2] for a, b in zip(path, path[1:])] + ['DCT']
            points = [(airports[o]['lat'], airports[o]['lon'])] + [nodes[i][1:] for i in path] + [(airports[d]['lat'], airports[d]['lon'])]
            lengths = [distance(a, b) for a, b in zip(points, points[1:])]
            km = sum(lengths)
            ratio = km / distance(points[0], points[-1])
            dct_km = sum(length for length, leg in zip(lengths, legs) if leg == 'DCT')
            routes[f'{o}-{d}'] = {'nodes': path, 'legs': legs}
            if extra:
                routes[f'{o}-{d}'].update(source='airfield', note=extra['note'])
            report.append({'route': f'{o}-{d}', 'waypoints': len(path), 'distance_km': round(km, 1), 'direct_ratio': round(ratio, 3), 'dct_km': round(dct_km, 1), 'departure_dct_km': round(lengths[0], 1), 'arrival_dct_km': round(lengths[-1], 1)})
        if oi % 100 == 0:
            print(f'{oi + 1}/{len(pairs)} origins; {len(routes)} routes', flush=True)

    # Only ship referenced points; preserve each segment label for inspection.
    used = sorted({i for route in routes.values() for i in route['nodes']})
    remap = {old: new for new, old in enumerate(used)}
    for route in routes.values():
        route['nodes'] = [remap[i] for i in route['nodes']]
    source = {'id': 'flightgear-2013.10', 'cycle': '2013.10', 'title': 'FlightGear / Robin A. Peel', 'url': 'https://gitlab.com/flightgear/fgdata/-/tree/next/Navaids', 'license': 'GPL-2.0-or-later', 'retrieved_at': '2026-11-07', 'sha256': {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(DATA.glob('*.gz'))}}
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({'version': 'reference-2013.10-v1', 'source': source, 'airfield_source': airfields['source'], 'nodes': [nodes[i] for i in used], 'routes': routes}, ensure_ascii=False, separators=(',', ':')) + '\n')
    summary = {'pack': pack['dataset_version'], 'schedules': len(pack['schedules']), 'routes': len(routes), 'airports': len(airports), 'missing': sum(f"{s['origin']}-{s['destination']}" not in routes for s in pack['schedules']), 'source': source, 'routes_detail': report}
    (ROOT / 'data/review/reference_routes.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({k: v for k, v in summary.items() if k not in ('source', 'routes_detail')}))
    print('Largest detours:', sorted(report, key=lambda r: r['direct_ratio'], reverse=True)[:12])


if __name__ == '__main__':
    build()
