// Time-zone helpers built on Intl, so DST and date changes come from the
// browser's own tz database rather than fixed offsets.

const WEEKDAY = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
const WEEKDAY_ZH = ['', '周一', '周二', '周三', '周四', '周五', '周六', '周日'];
const formatters = new Map();

function formatter(tz) {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23', weekday: 'short',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    formatters.set(tz, f);
  }
  return f;
}

/** Wall-clock parts of an instant in a time zone. wd: 1=Mon … 7=Sun */
export function zonedParts(ms, tz) {
  const o = {};
  for (const p of formatter(tz).formatToParts(new Date(ms))) o[p.type] = p.value;
  return { y: +o.year, m: +o.month, d: +o.day, hh: +o.hour, mm: +o.minute, ss: +o.second, wd: WEEKDAY[o.weekday] };
}

function offsetMs(ms, tz) {
  const p = zonedParts(ms, tz);
  const whole = Math.floor(ms / 1000) * 1000;
  return Date.UTC(p.y, p.m - 1, p.d, p.hh, p.mm, p.ss) - whole;
}

/** Instant for a wall-clock time in a zone. */
export function zonedToUtc(y, m, d, hh, mm, tz) {
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const off = offsetMs(guess, tz);
  let t = guess - off;
  const off2 = offsetMs(t, tz);
  if (off2 !== off) t = guess - off2;
  return t;
}

/** Civil date arithmetic, independent of any zone. */
export function addDays({ y, m, d }, n) {
  const t = new Date(Date.UTC(y, m - 1, d + n));
  const wd = t.getUTCDay() || 7;
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate(), wd };
}

export function dayNumber({ y, m, d }) {
  return Math.round(Date.UTC(y, m - 1, d) / 86400000);
}

const pad = (n) => String(n).padStart(2, '0');

export function fmtHM(ms, tz) {
  const p = zonedParts(ms, tz);
  return `${pad(p.hh)}:${pad(p.mm)}`;
}

export function fmtHMS(ms, tz) {
  const p = zonedParts(ms, tz);
  return `${pad(p.hh)}:${pad(p.mm)}:${pad(p.ss)}`;
}

export function fmtDate(ms, tz, { weekday = true, year = false } = {}) {
  const p = zonedParts(ms, tz);
  return `${year ? p.y + '年' : ''}${p.m}月${p.d}日${weekday ? ' ' + WEEKDAY_ZH[p.wd] : ''}`;
}

export function fmtISODate(ms, tz) {
  const p = zonedParts(ms, tz);
  return `${p.y}-${pad(p.m)}-${pad(p.d)}`;
}

export function weekdayZh(wd) {
  return WEEKDAY_ZH[wd];
}

/** "1小时45分" */
export function fmtDuration(minutes) {
  const total = Math.max(0, Math.round(minutes));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (!h) return `${m}分钟`;
  return m ? `${h}小时${m}分` : `${h}小时`;
}

/** Countdown "01:05:09" from milliseconds. */
export function fmtClock(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`;
}

/** Day difference between the local dates of two instants, e.g. +1 for next-day arrival. */
export function localDayOffset(depMs, depTz, arrMs, arrTz) {
  return dayNumber(zonedParts(arrMs, arrTz)) - dayNumber(zonedParts(depMs, depTz));
}
