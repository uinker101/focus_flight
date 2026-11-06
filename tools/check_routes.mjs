// node --test tools/check_routes.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { makeRoute, routePosition, distanceKm, makeProfile, sample } from '../app/js/sim.js';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root));
const json = (path) => JSON.parse(read(path));
const index = json('app/packs/index.json');
const pack = json(`app/packs/${index.packs.find((p) => p.version === index.active).file}`);
const data = json('app/assets/routes/reference.json');
const points = (o, d, r) => [pack.airports[o], ...r.nodes.map((i) => ({ lat: data.nodes[i][1], lon: data.nodes[i][2] })), pack.airports[d]];

test('every current schedule has a sourced, continuous reference route', () => {
  for (const s of pack.schedules) assert.ok(data.routes[`${s.origin}-${s.destination}`], s.id);
  for (const [key, r] of Object.entries(data.routes)) {
    assert.ok(r.nodes.length > 0, key);
    assert.equal(r.legs.length, r.nodes.length + 1, key);
    const [o, d] = key.split('-');
    const route = makeRoute(points(o, d, r));
    assert.ok(route.distanceKm >= distanceKm(pack.airports[o], pack.airports[d]) - 1e-6, key);
    assert.ok(distanceKm(routePosition(route, 0).pos, pack.airports[o]) < 1e-6, key);
    assert.ok(distanceKm(routePosition(route, 1).pos, pack.airports[d]) < 1e-6, key);
    for (let i = 1; i < route.distances.length; i++) assert.ok(route.distances[i] > route.distances[i - 1], key);
    for (const f of [0, .01, .25, .5, .75, .99, 1]) {
      const at = routePosition(route, f);
      assert.ok(Number.isFinite(at.heading), key);
      const travelled = route.distances[at.index] + distanceKm(route.points[at.index], at.pos);
      assert.ok(Math.abs(travelled - f * route.distanceKm) < 1e-5, key);
    }
  }
});

test('all shipped waypoints and named airway segments match the original data', () => {
  const original = new Set(), airways = new Set();
  const nodeKey = (n) => `${n[0]}:${Number(n[1]).toFixed(5)}:${Number(n[2]).toFixed(5)}`;
  const add = (n) => original.add(nodeKey(n));
  const rows = (name) => gunzipSync(read(`data/navigation/focus-flight-${name}.dat.gz`)).toString('latin1').split(/\r?\n/).map((l) => l.trim().split(/\s+/));
  for (const r of rows('awy')) if (r.length === 10) {
    const a = r.slice(0, 3), b = r.slice(3, 6);
    add(a); add(b);
    airways.add(`${nodeKey(a)}>${nodeKey(b)}:${r[9]}`);
    airways.add(`${nodeKey(b)}>${nodeKey(a)}:${r[9]}`);
  }
  for (const r of rows('fix')) if (r.length === 3) add([r[2], r[0], r[1]]);
  for (const r of rows('nav')) if (r.length >= 9 && ['2', '3'].includes(r[0])) add([r[7], r[1], r[2]]);
  const airfields = json('data/navigation/airfield_routes.json');
  const endpoints = new Set(airfields.evidence.flatMap((way) => way.nodes.map((n) => `${Number(n.lat).toFixed(5)}:${Number(n.lon).toFixed(5)}`)));
  for (const route of Object.values(airfields.routes)) for (const n of route.points) {
    assert.ok(endpoints.has(`${n[1].toFixed(5)}:${n[2].toFixed(5)}`));
    add(n);
  }
  for (const n of data.nodes) assert.ok(original.has(nodeKey(n)), JSON.stringify(n));
  for (const [key, r] of Object.entries(data.routes)) {
    for (let i = 1; i < r.nodes.length; i++) {
      const label = r.legs[i];
      if (label !== 'DCT') assert.ok(airways.has(`${nodeKey(data.nodes[r.nodes[i - 1]])}>${nodeKey(data.nodes[r.nodes[i]])}:${label}`), `${key}: ${label}`);
    }
  }
  for (const [file, hash] of Object.entries(data.source.sha256)) assert.equal(createHash('sha256').update(read(`data/navigation/${file}`)).digest('hex'), hash);
});

test('unequal leg lengths, turning and arrival use distance, including the dateline', () => {
  const vertices = [{ lat: 10, lon: 178 }, { lat: 10, lon: 179 }, { lat: 15, lon: -175 }];
  const route = makeRoute(vertices);
  const turn = distanceKm(vertices[0], vertices[1]) / route.distanceKm;
  assert.ok(distanceKm(routePosition(route, turn).pos, vertices[1]) < 1e-6);
  assert.ok(routePosition(route, .5).pos.lat > 10);
  const heading = routePosition(route, 1).heading;
  assert.ok(heading < 90 && heading > 0);
  const profile = makeProfile(vertices[0], vertices[2], 120, route);
  assert.equal(profile.dist, route.distanceKm);
  assert.equal(sample(profile, 120).remainKm, 0);
  assert.equal(sample(profile, 120).fraction, 1);
});

test('check-in snapshots retain route geometry after JSON save/reload', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => ({ ok: true, json: async () => json(`app${url}`) });
  try {
    const { loadPack, snapshotFlight } = await import('../app/js/schedule.js');
    await loadPack();
    const s = pack.schedules.find((s) => s.origin === 'HKG' && s.destination === 'TPE');
    const first = snapshotFlight({ s, dep: 0, arr: s.duration_min * 60000 });
    const restored = JSON.parse(JSON.stringify(first));
    first.route.points[1].lat += 1;
    const next = snapshotFlight({ s, dep: 1, arr: s.duration_min * 60000 + 1 });
    assert.deepEqual(restored.route, next.route);
    assert.deepEqual(routePosition(makeRoute(restored.route.points), .37), routePosition(makeRoute(next.route.points), .37));
  } finally {
    globalThis.fetch = originalFetch;
  }
});
