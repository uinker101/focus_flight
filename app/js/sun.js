// Offline sun position and the day/night theme blend.

const RAD = Math.PI / 180;

/** Solar elevation in degrees (NOAA low-precision formulas, ~0.5° accuracy). */
export function sunElevation(ms, lat, lon) {
  const n = (ms - 946728000000) / 86400000; // days since J2000.0
  const L = (280.46 + 0.9856474 * n) % 360;
  const g = ((357.528 + 0.9856003 * n) % 360) * RAD;
  const lambda = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * RAD;
  const eps = (23.439 - 0.0000004 * n) * RAD;
  const ra = Math.atan2(Math.cos(eps) * Math.sin(lambda), Math.cos(lambda));
  const dec = Math.asin(Math.sin(eps) * Math.sin(lambda));
  const gmst = (18.697374558 + 24.06570982441908 * n) % 24;
  const ha = (gmst * 15 + lon) * RAD - ra;
  const phi = lat * RAD;
  return Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(ha)) / RAD;
}

/** 0 = full day, 1 = full night; blends through twilight. */
export function nightAmount(ms, lat, lon) {
  const e = sunElevation(ms, lat, lon);
  return Math.min(1, Math.max(0, (4 - e) / 10));
}

const DAY = {
  '--bg': '#eef3f8', '--bg-2': '#e3ebf3', '--panel': '#ffffff', '--panel-2': '#f6f9fc',
  '--text': '#0f1d2b', '--text-dim': '#5b6b7c', '--line': '#d5dee8',
  '--accent': '#2563a8', '--accent-2': '#d97a14', '--good': '#2f8a5b', '--bad': '#b5473a',
  '--route-todo': '#7d90a6', '--locked': '#b8c3cf',
};
const NIGHT = {
  '--bg': '#07111d', '--bg-2': '#0b1726', '--panel': '#0f1d2d', '--panel-2': '#132538',
  '--text': '#e6eef7', '--text-dim': '#8fa3b8', '--line': '#1f3247',
  '--accent': '#5aa9ff', '--accent-2': '#ffb347', '--good': '#5cc28d', '--bad': '#e07a6c',
  '--route-todo': '#58708a', '--locked': '#334a62',
};

function mix(a, b, t) {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (shift) => Math.round(((pa >> shift) & 255) * (1 - t) + ((pb >> shift) & 255) * t);
  return '#' + ((1 << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).slice(1);
}

/** Apply the blended palette to :root. mode: 'auto' | 'day' | 'night' */
export function applyTheme(mode, home, now = Date.now()) {
  const t = mode === 'day' ? 0 : mode === 'night' ? 1 : nightAmount(now, home.lat, home.lon);
  const root = document.documentElement;
  for (const key of Object.keys(DAY)) root.style.setProperty(key, mix(DAY[key], NIGHT[key], t));
  root.style.colorScheme = t > 0.5 ? 'dark' : 'light';
  root.dataset.night = t > 0.5 ? '1' : '0';
  return t;
}
