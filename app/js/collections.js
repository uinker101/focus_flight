// Collections are always derived from the journey history, never from
// separate counters, so refreshing or reprinting cannot add to them.

function bump(map, key, j, extra) {
  let e = map.get(key);
  if (!e) {
    e = { key, count: 0, first: j.ended_at, last: j.ended_at, journeys: [], ...extra };
    map.set(key, e);
  }
  e.count++;
  e.first = Math.min(e.first, j.ended_at);
  e.last = Math.max(e.last, j.ended_at);
  e.journeys.push(j.id);
}

export function computeCollections(state) {
  const success = state.journeys.filter((j) => j.status === 'success');
  const airlines = new Map();
  const types = new Map();
  const families = new Map();
  const airports = new Map();
  const routes = new Map();
  for (const j of success) {
    const f = j.flight;
    bump(airlines, f.airline.iata, j, { info: f.airline });
    const ac = f.aircraft;
    if (ac.status === 'exact' && ac.type) {
      bump(types, ac.type, j, { info: { type: ac.type, name: ac.name, manufacturer: ac.manufacturer, family: ac.family } });
    }
    if ((ac.status === 'exact' || ac.status === 'family') && ac.family) bump(families, ac.family, j, {});
    bump(airports, f.destination.iata, j, { info: f.destination });
    const key = [f.origin.iata, f.destination.iata].sort().join('–');
    bump(routes, key, j, { a: f.origin, b: f.destination });
  }
  return {
    success,
    airlines,
    types,
    families,
    airports,
    routes,
    focusMs: success.reduce((sum, j) => sum + (j.real_ms || 0), 0),
  };
}

/** What the current pack makes collectable, for "x / y in this pack" progress. */
export function packTotals(pack) {
  const types = new Set();
  const families = new Set();
  for (const s of pack.schedules) {
    if (s.aircraft.status === 'exact') types.add(s.aircraft.type);
    if (s.aircraft.family && (s.aircraft.status === 'exact' || s.aircraft.status === 'family')) families.add(s.aircraft.family);
  }
  return {
    airlines: Object.keys(pack.airlines),
    airports: Object.keys(pack.airports),
    types: [...types],
    families: [...families],
  };
}
