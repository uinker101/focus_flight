// Acceptance check for the November 2026 top-20 expansion, using the real
// client schedule projection and journey snapshot functions.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
// The browser source tree deliberately has no Node package.json. Data URLs let
// Node load those exact ES modules without changing the application package.
const moduleURL = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const timeURL = moduleURL(await readFile(new URL('app/js/time.js', root), 'utf8'));
const scheduleSource = (await readFile(new URL('app/js/schedule.js', root), 'utf8')).replace("'./time.js'", JSON.stringify(timeURL));
const { loadPack, departuresOnDate, snapshotFlight } = await import(moduleURL(scheduleSource));
const readJSON = async (path) => JSON.parse(await readFile(new URL(path, root), 'utf8'));
globalThis.fetch = async (url) => ({ json: () => readJSON(`app${url}`) });
const pack = await loadPack();
const baseline = await readJSON('app/packs/global-202611.us5.json');
const hubs = 'ATL DXB HND DFW PVG ORD LHR IST CAN DEN DEL ICN LAX CDG PEK SIN AMS MAD SZX KUL'.split(' ');
// A project-level usable network target, not a percentage of real-world flights.
const anchors = {
  ATL: { DL: 150 }, DXB: { EK: 100, FZ: 20 }, HND: { NH: 60, JL: 25 },
  DFW: { AA: 80 }, PVG: { MU: 70, FM: 25, HO: 30 }, ORD: { UA: 100, AA: 40 },
  LHR: { BA: 75 }, IST: { TK: 90 }, CAN: { CZ: 80 }, DEN: { UA: 100, F9: 20, WN: 10 },
  DEL: { '6E': 40, AI: 15 }, ICN: { KE: 45, OZ: 15 }, LAX: { UA: 40, DL: 40, AA: 20 },
  CDG: { AF: 110 }, PEK: { CA: 90 }, SIN: { SQ: 50, TR: 20 },
  AMS: { KL: 90, HV: 25 }, MAD: { IB: 45, UX: 25 }, SZX: { ZH: 45, CZ: 45 },
  KUL: { MH: 60, AK: 45 },
};

function coverage(p, hub) {
  const rows = p.schedules.filter(s => s.origin === hub);
  const byAirline = {};
  for (const s of rows) (byAirline[s.airline] ??= new Set()).add(s.destination);
  return {
    destinations: new Set(rows.map(s => s.destination)).size,
    airlines: Object.keys(byAirline).length,
    templates: rows.length,
    airline_destinations: Object.fromEntries(Object.entries(byAirline).map(([a, d]) => [a, d.size])),
  };
}

const report = { pack: pack.dataset_version, coverage: pack.coverage, airports: [] };
let instances = 0;
for (const hub of hubs) {
  const before = coverage(baseline, hub), after = coverage(pack, hub);
  assert(after.destinations >= 75, `${hub}: destination coverage`);
  assert(after.airlines >= 8, `${hub}: airline coverage`);
  for (const [a, min] of Object.entries(anchors[hub]))
    assert(after.airline_destinations[a] >= min, `${hub}/${a}: anchor network coverage`);
  const daily = [];
  for (let d = 9; d <= 15; d++) {
    const flights = departuresOnDate(hub, { y: 2026, m: 11, d });
    const expected = pack.schedules.filter(s => s.origin === hub && s.days.includes(String(d - 8))).length;
    assert.equal(flights.length, expected, `${hub} Nov ${d}: projection count`);
    const keys = new Set();
    for (const f of flights) {
      assert(f.arr > f.dep && Number.isFinite(f.arr));
      const snap = snapshotFlight(f);
      assert.equal(snap.pack_version, pack.dataset_version);
      assert.equal(snap.destination.iata, f.s.destination);
      assert.equal(snap.sched_arr - snap.sched_dep, f.s.duration_min * 60000);
      assert(!keys.has(f.key), `${hub}: duplicate instance ${f.key}`);
      keys.add(f.key);
    }
    daily.push(flights.length);
    instances += flights.length;
  }
  report.airports.push({ airport: hub, before, after, daily });
}

const outgoing = new Map(), incoming = new Map();
const ids = new Set(), newDays = new Set();
for (const s of pack.schedules) {
  assert(!ids.has(s.id), `Duplicate schedule ID ${s.id}`);
  ids.add(s.id);
  assert(pack.airports[s.origin] && pack.airports[s.destination] && pack.airlines[s.airline]);
  assert(pack.sources.some(source => source.source_id === s.source));
  if (!outgoing.has(s.origin)) outgoing.set(s.origin, new Set());
  if (!incoming.has(s.destination)) incoming.set(s.destination, new Set());
  outgoing.get(s.origin).add(s.destination);
  incoming.get(s.destination).add(s.origin);
  if (s.source.includes('top20')) for (const day of s.days) {
    const key = `${s.flight}/${s.origin}/${s.destination}/${day}`;
    assert(!newDays.has(key), `Duplicate new flight/day ${key}`);
    newDays.add(key);
  }
}
function reachable(graph) {
  const seen = new Set(['HKG']), queue = ['HKG'];
  for (let i = 0; i < queue.length; i++) for (const next of graph.get(queue[i]) ?? [])
    if (!seen.has(next)) { seen.add(next); queue.push(next); }
  return seen;
}
const nodes = new Set(pack.schedules.flatMap(s => [s.origin, s.destination]));
const from = reachable(outgoing), back = reachable(incoming);
assert.equal(from.size, nodes.size, 'Every scheduled airport must be reachable from HKG');
assert.equal(back.size, nodes.size, 'Every scheduled airport must have a path back to HKG');
report.validation = { airports_passed: hubs.length, projected_instances: instances, reachable_airports: from.size, returnable_airports: back.size };
await writeFile(new URL('data/review/top20_coverage_202611.json', root), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report.validation));
for (const r of report.airports) console.log(`${r.airport}: ${r.before.destinations} → ${r.after.destinations} destinations; ${r.before.airlines} → ${r.after.airlines} airlines`);
