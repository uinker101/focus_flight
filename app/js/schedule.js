// Project weekly schedule templates onto the real calendar.

import { zonedParts, zonedToUtc, addDays } from './time.js';
import { loadRoutes, referenceRoute } from './navigation.js';

let pack = null;
let packIndex = null;

export async function loadPack() {
  packIndex = await (await fetch('/packs/index.json')).json();
  const entry = packIndex.packs.find((p) => p.version === packIndex.active);
  [pack] = await Promise.all([fetch(`/packs/${entry.file}`).then((r) => r.json()), loadRoutes()]);
  return pack;
}

export function getPack() {
  return pack;
}

export function getPackIndex() {
  return packIndex;
}

async function postJSON(url, body) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || res.status);
  return data;
}

export const activatePack = (version) => postJSON('/api/packs/active', { version });
export const installPack = (newPack) => postJSON('/api/packs/import', { pack: newPack });

/** Human-readable summary of what a new pack changes compared with the current one. */
export function diffPacks(oldPack, newPack) {
  const ids = (p) => new Set(p.schedules.map((s) => s.id));
  const oldIds = ids(oldPack);
  const newIds = ids(newPack);
  const keys = (o) => new Set(Object.keys(o));
  const added = (a, b) => [...b].filter((x) => !a.has(x));
  const evidence = {};
  for (const s of newPack.schedules) evidence[s.aircraft.status] = (evidence[s.aircraft.status] || 0) + 1;
  return {
    schedules: newPack.schedules.length,
    addedSchedules: added(oldIds, newIds).length,
    removedSchedules: added(newIds, oldIds).length,
    airports: Object.keys(newPack.airports),
    addedAirports: added(keys(oldPack.airports), keys(newPack.airports)),
    removedAirports: added(keys(newPack.airports), keys(oldPack.airports)),
    airlines: Object.keys(newPack.airlines),
    types: [...new Set(newPack.schedules.map((s) => s.aircraft.type).filter(Boolean))],
    evidence,
  };
}

/**
 * Departures from `origin` whose scheduled departure falls in [fromMs, toMs).
 * The template's local departure time is taken in the origin's zone; arrival is
 * departure + verified duration, so date changes and DST never give a negative leg.
 */
export function departuresBetween(origin, fromMs, toMs) {
  const tz = pack.airports[origin]?.tz;
  if (!tz) return [];
  const first = zonedParts(fromMs - 86400000, tz);
  const spanDays = Math.ceil((toMs - fromMs) / 86400000) + 2;
  const out = [];
  for (const s of pack.schedules) {
    if (s.origin !== origin) continue;
    const [hh, mm] = s.dep.split(':').map(Number);
    for (let i = 0; i <= spanDays; i++) {
      const day = addDays(first, i);
      if (!s.days.includes(String(day.wd))) continue;
      const dep = zonedToUtc(day.y, day.m, day.d, hh, mm, tz);
      if (dep >= fromMs && dep < toMs) out.push(instance(s, dep));
    }
  }
  return out.sort((a, b) => a.dep - b.dep || a.s.flight.localeCompare(b.s.flight));
}

/** All departures on one local calendar date at the origin. */
export function departuresOnDate(origin, date) {
  const tz = pack.airports[origin].tz;
  const start = zonedToUtc(date.y, date.m, date.d, 0, 0, tz);
  const next = addDays(date, 1);
  const end = zonedToUtc(next.y, next.m, next.d, 0, 0, tz);
  return departuresBetween(origin, start, end);
}

function instance(s, dep) {
  return { key: `${s.id}@${dep}`, s, dep, arr: dep + s.duration_min * 60000 };
}

/** Everything a journey needs, copied so later pack updates never rewrite history. */
export function snapshotFlight(inst) {
  const s = inst.s;
  const type = s.aircraft.type ? pack.aircraft_types[s.aircraft.type] : null;
  return {
    schedule_id: s.id,
    airline: { ...pack.airlines[s.airline] },
    flight: s.flight,
    codeshares: [...s.codeshares],
    origin: { ...pack.airports[s.origin] },
    destination: { ...pack.airports[s.destination] },
    route: referenceRoute(pack.airports[s.origin], pack.airports[s.destination]),
    dep_local: s.dep,
    arr_local: s.arr,
    arr_offset: s.arr_offset,
    days: s.days,
    duration_min: s.duration_min,
    aircraft: { ...s.aircraft, name: type ? type.name : null, manufacturer: type ? type.manufacturer : null },
    source: s.source,
    verification: s.verification,
    pack_version: pack.dataset_version,
    sched_dep: inst.dep,
    sched_arr: inst.arr,
  };
}

// 3D models in app/assets/aircraft (see the README there): file → the ICAO types
// shown with it. Variants without a model of their own (neo, MAX, 777-300ER,
// 787-10, E175, ATR 72 …) use the closest airframe; the text still names the real type.
const MODEL_TYPES = {
  a318: 'A318', a319: 'A319 A19N', a320: 'A320 A20N', a321: 'A321 A21N',
  a332: 'A332 A338', a333: 'A333 A339', a343: 'A342 A343', a346: 'A345 A346',
  a359: 'A359 A35K', a380: 'A388', cs100: 'BCS1', cs300: 'BCS3',
  b736: 'B736', b737: 'B737 B37M', b738: 'B738 B38M', b739: 'B739 B39M B3XM',
  b744: 'B744', b748: 'B748', b752: 'B752', b753: 'B753', b762: 'B762', b763: 'B763', b764: 'B764',
  b772: 'B772 B77L', b773: 'B773 B77W', b788: 'B788', b789: 'B789 B78X',
  atr42: 'AT43 AT45 AT46 AT72 AT75 AT76', q400: 'DH8D', bae146: 'B461 B462 B463 RJ85 RJ1H',
  crj700: 'CRJ7', crj900: 'CRJ9 CRJX', e170: 'E170 E75S E75L', e190: 'E190 E195 E290 E295',
};
const TYPE_MODELS = Object.fromEntries(Object.entries(MODEL_TYPES).flatMap(([file, types]) => types.split(' ').map((t) => [t, file])));
// When the source only narrows it down to a family, show the family's usual model.
const FAMILY_MODELS = { 'A320 系列': 'a320', A330: 'a333', A350: 'a359', '737 NG': 'b738', 747: 'b748', 767: 'b763', 777: 'b773', 787: 'b788' };

/** Model file for the flight's aircraft, or null when the aircraft is unknown or has no model. */
export function aircraftModel(ac) {
  return TYPE_MODELS[ac.type] || FAMILY_MODELS[ac.family] || null;
}

export function aircraftLabel(ac) {
  if (ac.type && pack?.aircraft_types[ac.type]) {
    const t = pack.aircraft_types[ac.type];
    return `${t.manufacturer} ${t.name}`;
  }
  if (ac.name) return `${ac.manufacturer} ${ac.name}`;
  if (ac.status === 'family') return `${ac.family}（具体型号未定）`;
  return '未确定';
}

export const EVIDENCE_TEXT = {
  exact: '来源列明具体机型',
  family: '来源只确定到系列，只计入系列收藏',
  multiple: '来源列出多个可能机型，不计入机型收藏',
  varies: '来源标注 EQV（机型不固定），不计入机型收藏',
  unmapped: '来源机型代码尚未核对，不计入机型收藏',
  missing: '来源没有机型，不计入机型收藏',
};
