// Flight simulation: one profile gives position, speed, altitude and phase
// from elapsed time, scaled so the whole gate-to-gate block equals the
// scheduled duration and the ground track follows the reference flight plan.

const R_KM = 6371;
const RAD = Math.PI / 180;

export function distanceKm(a, b) {
  const p1 = a.lat * RAD, p2 = b.lat * RAD;
  const dp = p2 - p1, dl = (b.lon - a.lon) * RAD;
  const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * R_KM * Math.asin(Math.sqrt(h));
}

/** Point at fraction f along the great circle from a to b. */
export function interpolate(a, b, f) {
  const p1 = a.lat * RAD, l1 = a.lon * RAD, p2 = b.lat * RAD, l2 = b.lon * RAD;
  const d = distanceKm(a, b) / R_KM;
  if (d < 1e-9) return { lat: a.lat, lon: a.lon };
  const A = Math.sin((1 - f) * d) / Math.sin(d);
  const B = Math.sin(f * d) / Math.sin(d);
  const x = A * Math.cos(p1) * Math.cos(l1) + B * Math.cos(p2) * Math.cos(l2);
  const y = A * Math.cos(p1) * Math.sin(l1) + B * Math.cos(p2) * Math.sin(l2);
  const z = A * Math.sin(p1) + B * Math.sin(p2);
  return { lat: Math.atan2(z, Math.hypot(x, y)) / RAD, lon: Math.atan2(y, x) / RAD };
}

export function bearing(a, b) {
  const p1 = a.lat * RAD, p2 = b.lat * RAD, dl = (b.lon - a.lon) * RAD;
  const y = Math.sin(dl) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  return (Math.atan2(y, x) / RAD + 360) % 360;
}

export function greatCircle(a, b, n = 96) {
  return Array.from({ length: n + 1 }, (_, i) => interpolate(a, b, i / n));
}

/** Densify each navigation leg for the map, with cumulative distances in km. */
export function makeRoute(waypoints) {
  const points = [{ ...waypoints[0] }];
  const distances = [0];
  for (let i = 1; i < waypoints.length; i++) {
    const a = waypoints[i - 1], b = waypoints[i];
    const km = distanceKm(a, b);
    if (km < 1e-6) continue;
    const start = distances.at(-1);
    const count = Math.ceil(km / 30);
    for (let k = 1; k <= count; k++) {
      points.push(k === count ? { ...b } : interpolate(a, b, k / count));
      distances.push(start + km * k / count);
    }
  }
  return { points, distances, distanceKm: distances.at(-1) };
}

/** Locate by flown distance, not by vertex count (navigation legs vary in length). */
export function routePosition(route, fraction) {
  const km = Math.max(0, Math.min(1, fraction)) * route.distanceKm;
  let lo = 0, hi = route.points.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (route.distances[mid] <= km) lo = mid;
    else hi = mid;
  }
  const a = route.points[lo], b = route.points[hi];
  const f = (km - route.distances[lo]) / (route.distances[hi] - route.distances[lo]);
  const pos = interpolate(a, b, f);
  // At arrival keep the inbound heading, not the bearing from the origin.
  const heading = f < 1 - 1e-8 ? bearing(pos, b) : (bearing(b, a) + 180) % 360;
  return { pos, heading, index: lo };
}

export const PHASE_TEXT = {
  boarding: '登机',
  taxi_out: '滑行',
  takeoff: '起飞',
  climb: '爬升',
  cruise: '巡航',
  descent: '下降',
  approach: '进近',
  landing: '着陆',
  taxi_in: '滑行至停机位',
  arrived: '已抵达',
};

export function makeProfile(origin, destination, durationMin, route = null) {
  const dist = route ? route.distanceKm : distanceKm(origin, destination);
  const D = durationMin;
  const taxiOut = Math.min(12, 0.08 * D);
  const climb = Math.min(25, 0.22 * D);
  const descent = Math.min(30, 0.25 * D);
  const taxiIn = Math.min(6, 0.05 * D);
  const cruise = D - taxiOut - climb - descent - taxiIn;
  // Ground speed ramps 0.4→1 of cruise speed while climbing, 1→0.3 while descending.
  const vc = dist / (0.7 * climb + cruise + 0.65 * descent); // km per minute
  const cruiseAlt = dist < 700 ? 8500 : dist < 1500 ? 10100 : dist < 3000 ? 10700 : 11300;
  return {
    dist, D, vc, cruiseAlt,
    t1: taxiOut, t2: taxiOut + climb, t3: taxiOut + climb + cruise, t4: D - taxiIn,
    climb, cruise, descent,
  };
}

/** State of the flight after `min` minutes of the block. */
export function sample(p, min) {
  const t = Math.max(0, Math.min(p.D, min));
  let dist, speed, alt, phase;
  if (t < p.t1) {
    dist = 0;
    speed = 22 + 8 * Math.sin((t / p.t1) * Math.PI);
    alt = 0;
    phase = 'taxi_out';
  } else if (t < p.t2) {
    const d = t - p.t1;
    const u = d / p.climb;
    dist = p.vc * (0.4 * d + (0.3 * d * d) / p.climb);
    speed = p.vc * 60 * (0.4 + 0.6 * u);
    alt = p.cruiseAlt * (1 - (1 - u) ** 2);
    phase = d < 1.5 ? 'takeoff' : 'climb';
  } else if (t < p.t3) {
    dist = p.vc * (0.7 * p.climb + (t - p.t2));
    speed = p.vc * 60;
    alt = p.cruiseAlt;
    phase = 'cruise';
  } else if (t < p.t4) {
    const d = t - p.t3;
    const u = d / p.descent;
    dist = p.vc * (0.7 * p.climb + p.cruise + d - (0.35 * d * d) / p.descent);
    speed = p.vc * 60 * (1 - 0.7 * u);
    alt = p.cruiseAlt * (1 - u) ** 1.25;
    phase = u > 0.97 ? 'landing' : u > 0.8 ? 'approach' : 'descent';
  } else if (t < p.D) {
    dist = p.dist;
    speed = 20 + 6 * Math.sin(((t - p.t4) / (p.D - p.t4)) * Math.PI);
    alt = 0;
    phase = 'taxi_in';
  } else {
    dist = p.dist;
    speed = 0;
    alt = 0;
    phase = 'arrived';
  }
  dist = Math.min(p.dist, dist);
  const outsideC = alt > 0 ? Math.max(-56.5, 15 - 6.5 * (alt / 1000)) : null;
  return { phase, distKm: dist, remainKm: p.dist - dist, fraction: p.dist ? dist / p.dist : 1, speedKmh: speed, altM: alt, outsideC };
}
