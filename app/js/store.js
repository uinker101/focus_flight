// Save file kept by the local server (userdata/state.json). The browser only
// caches it in memory; every change is written back with a revision check.

export const HOME_PRESETS = [
  { id: 'hongkong', label: '香港', tz: 'Asia/Hong_Kong', lat: 22.30, lon: 114.17 },
  { id: 'taipei', label: '台北', tz: 'Asia/Taipei', lat: 25.03, lon: 121.56 },
  { id: 'shanghai', label: '上海', tz: 'Asia/Shanghai', lat: 31.23, lon: 121.47 },
  { id: 'beijing', label: '北京', tz: 'Asia/Shanghai', lat: 39.90, lon: 116.40 },
  { id: 'tokyo', label: '东京', tz: 'Asia/Tokyo', lat: 35.68, lon: 139.69 },
  { id: 'seoul', label: '首尔', tz: 'Asia/Seoul', lat: 37.57, lon: 126.98 },
  { id: 'singapore', label: '新加坡', tz: 'Asia/Singapore', lat: 1.29, lon: 103.85 },
  { id: 'london', label: '伦敦', tz: 'Europe/London', lat: 51.51, lon: -0.13 },
  { id: 'newyork', label: '纽约', tz: 'America/New_York', lat: 40.71, lon: -74.01 },
  { id: 'losangeles', label: '洛杉矶', tz: 'America/Los_Angeles', lat: 34.05, lon: -118.24 },
];

export function defaultState(startAirport) {
  return {
    v: 1,
    settings: { home: HOME_PRESETS[0], theme: 'auto', demo: false },
    current_airport: startAirport,
    active: null,
    journeys: [],
    pass_seq: 0,
  };
}

export const MAX_GOALS = 8;

/**
 * Saves before 2026-11-02 had one free-text `task`; journeys now carry a goal
 * checklist `todos: [{ text, done }]`. Convert in place, keeping the old text.
 */
function normalize(state) {
  if (!state) return state;
  const fix = (j, done) => {
    if (!j || Array.isArray(j.todos)) return;
    j.todos = j.task ? [{ text: j.task, done }] : [];
    delete j.task;
  };
  fix(state.active, false);
  for (const j of state.journeys) fix(j, j.status === 'success');
  return state;
}

let saved = { rev: 0, state: null };
let chain = Promise.resolve();
const listeners = new Set();

export function onExternalChange(fn) {
  listeners.add(fn);
}

let heartbeat = null;

export async function loadState(startAirport) {
  const res = await fetch('/api/state');
  const body = await res.json();
  heartbeat = body.heartbeat;
  saved = { rev: body.rev, state: normalize(body.state) || defaultState(startAirport) };
  return saved.state;
}

/** Last "page still open" signal from a running flight: { journey_id, at } or null. */
export function getHeartbeat() {
  return heartbeat;
}

export function sendHeartbeat(journeyId) {
  fetch('/api/heartbeat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ journey_id: journeyId, at: Date.now() }),
    keepalive: true,
  }).catch(() => {});
}

export function getState() {
  return saved.state;
}

/** Pick up writes made behind our back (a late pause beacon from the previous page). */
export async function refreshState() {
  await chain;
  const fresh = await (await fetch('/api/state')).json();
  if (fresh.rev !== saved.rev && fresh.state) {
    saved = { rev: fresh.rev, state: normalize(fresh.state) };
    listeners.forEach((fn) => fn(saved.state));
  }
}

/** Persist the in-memory state. Calls are serialized so revisions stay in order. */
export function save() {
  const snapshot = JSON.parse(JSON.stringify(saved.state));
  chain = chain.then(async () => {
    const res = await fetch('/api/state', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rev: saved.rev, state: snapshot }),
    });
    if (res.status === 409) {
      // Another tab or a pause beacon wrote first: take the server copy.
      const body = await res.json();
      saved = { rev: body.rev, state: normalize(body.state) };
      listeners.forEach((fn) => fn(saved.state));
      return;
    }
    if (!res.ok) throw new Error(`保存失败：${res.status}`);
    saved.rev = (await res.json()).rev;
  }).catch((err) => {
    console.error(err);
    document.dispatchEvent(new CustomEvent('ff-save-error', { detail: String(err) }));
  });
  return chain;
}

/** Called from pagehide: the server pauses the running flight even if this page is gone. */
export function sendPauseBeacon(journeyId) {
  const body = new Blob([JSON.stringify({ journey_id: journeyId, at: Date.now() })], { type: 'application/json' });
  navigator.sendBeacon('/api/pause', body);
}

export async function importState(state) {
  const res = await fetch('/api/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ state }),
  });
  if (!res.ok) throw new Error((await res.json()).error || '导入失败');
}
