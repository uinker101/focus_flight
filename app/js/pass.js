// Commemorative boarding pass as standalone SVG (prints cleanly, converts to PNG).

import { fmtHM, fmtDate, fmtDuration } from './time.js';

const W = 960;
const H = 380;
const FONT = `'PingFang SC', 'Hiragino Sans GB', 'Helvetica Neue', Arial, sans-serif`;
const MONO = `'SF Mono', Menlo, Monaco, 'PingFang SC', monospace`;

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function truncate(s, n) {
  const arr = [...String(s || '')];
  return arr.length > n ? arr.slice(0, n - 1).join('') + '…' : arr.join('');
}

function barcode(seed, x, y, w, h) {
  let v = 0;
  for (const ch of seed) v = (v * 31 + ch.charCodeAt(0)) >>> 0;
  let out = '';
  let pos = x;
  while (pos < x + w) {
    v = (v * 1103515245 + 12345) >>> 0;
    const bar = 1 + (v >> 16) % 3;
    const gap = 1 + (v >> 20) % 3;
    if (pos + bar > x + w) break;
    out += `<rect x="${pos}" y="${y}" width="${bar}" height="${h}"/>`;
    pos += bar + gap;
  }
  return out;
}

function field(x, y, label, value, { size = 20, mono = true } = {}) {
  return `<text x="${x}" y="${y}" font-size="11" fill="#6b7a8a" letter-spacing="0.5">${esc(label)}</text>
  <text x="${x}" y="${y + size + 6}" font-size="${size}" font-weight="700" fill="#10202f" ${mono ? `font-family="${MONO}"` : ''}>${esc(value)}</text>`;
}

const BAND = '#1c3d66';

/** Card outline, paper and top band shared by both sides. */
function card(inner) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="${FONT}">
  <defs>
    <clipPath id="card"><rect x="0" y="0" width="${W}" height="${H}" rx="22"/></clipPath>
  </defs>
  <g clip-path="url(#card)">
    <rect width="${W}" height="${H}" fill="#fbfaf6"/>
    <rect width="${W}" height="66" fill="${BAND}"/>
    <text x="36" y="30" font-size="13" fill="#bcd0e6" letter-spacing="2">FOCUS FLIGHT · 专注航班</text>
    ${inner}
  </g>
</svg>`;
}

/** Journey (completed, success) → SVG string of the front. */
export function passSVG(j, homeTz) {
  const f = j.flight;
  const o = f.origin;
  const d = f.destination;
  const date = fmtDate(j.started_at, homeTz, { weekday: false, year: true });
  const aircraft = f.aircraft.name ? `${f.aircraft.manufacturer} ${f.aircraft.name}` : f.aircraft.status === 'family' ? `${f.aircraft.family} 系列` : '未确定';
  const plus = f.arr_offset ? ` +${f.arr_offset}` : '';
  const finished = `${fmtDate(j.ended_at, homeTz, { weekday: false })} ${fmtHM(j.ended_at, homeTz)}`;
  return card(`
    <text x="36" y="53" font-size="19" font-weight="700" fill="#ffffff">${esc(f.airline.name)} ${esc(f.airline.name_en || '')}</text>
    <text x="700" y="30" font-size="13" fill="#bcd0e6" text-anchor="end" letter-spacing="2">BOARDING PASS</text>
    <text x="700" y="53" font-size="19" font-weight="700" fill="#ffffff" text-anchor="end">登机牌</text>
    <text x="${W - 30}" y="42" font-size="15" font-weight="700" fill="#ffffff" text-anchor="end" font-family="${MONO}">${esc(j.pass_no)}</text>

    <text x="36" y="160" font-size="66" font-weight="800" fill="#10202f" font-family="${MONO}">${esc(o.iata)}</text>
    <text x="38" y="188" font-size="16" fill="#33475b">${esc(o.city)} · ${esc(o.name)}</text>
    <g transform="translate(330 128) rotate(90)" fill="#d97a14">
      <path d="M0,-15 C1.6,-15 2.2,-13 2.2,-10 L2.2,-4 L14,3 L14,5.6 L2.2,2 L2.2,9 L5.6,12 L5.6,14 L0,12.6 L-5.6,14 L-5.6,12 L-2.2,9 L-2.2,2 L-14,5.6 L-14,3 L-2.2,-4 L-2.2,-10 C-2.2,-13 -1.6,-15 0,-15 Z" transform="scale(1.6)"/>
    </g>
    <line x1="270" y1="128" x2="305" y2="128" stroke="#c7cfd8" stroke-width="2" stroke-dasharray="4 4"/>
    <line x1="356" y1="128" x2="391" y2="128" stroke="#c7cfd8" stroke-width="2" stroke-dasharray="4 4"/>
    <text x="410" y="160" font-size="66" font-weight="800" fill="#10202f" font-family="${MONO}">${esc(d.iata)}</text>
    <text x="412" y="188" font-size="16" fill="#33475b">${esc(d.city)} · ${esc(d.name)}</text>

    ${field(36, 230, '航班 FLIGHT', f.flight)}
    ${field(170, 230, '日期 DATE', date, { size: 18, mono: false })}
    ${field(340, 230, '计划出发 DEP', f.dep_local)}
    ${field(470, 230, '计划抵达 ARR', f.arr_local + plus)}
    ${field(600, 230, '飞行时长 TIME', fmtDuration(j.real_ms / 60000), { size: 18, mono: false })}
    ${field(36, 284, '机型 AIRCRAFT', aircraft, { size: 16, mono: false })}

    <line x1="720" y1="66" x2="720" y2="${H}" stroke="#c7cfd8" stroke-width="2" stroke-dasharray="6 6"/>
    <circle cx="720" cy="66" r="12" fill="#e9eef3"/>
    <circle cx="720" cy="${H}" r="12" fill="#e9eef3"/>
    ${field(748, 100, '航班 FLIGHT', f.flight, { size: 18 })}
    ${field(748, 160, '航线 ROUTE', `${o.iata} → ${d.iata}`, { size: 18 })}
    ${field(748, 220, '完成 COMPLETED', finished, { size: 15, mono: false })}
    <g fill="#10202f">${barcode(j.pass_no + j.id, 748, 282, 180, 44)}</g>
    <text x="838" y="344" font-size="11" fill="#6b7a8a" text-anchor="middle" font-family="${MONO}">${esc(j.pass_no)}</text>

    <text x="36" y="${H - 18}" font-size="11" fill="#8a97a5">模拟飞行纪念 · 参考班表 ${esc(f.pack_version)} · 计划时刻为出发／抵达机场当地时间</text>
    ${j.demo ? `<g transform="translate(640 142) rotate(-12)"><rect x="-70" y="-24" width="140" height="44" rx="8" fill="none" stroke="#c0392b" stroke-width="3" opacity="0.75"/><text x="0" y="7" font-size="20" font-weight="800" fill="#c0392b" text-anchor="middle" opacity="0.75">演示加速</text></g>` : ''}`);
}

/** The back: every goal of the trip, ticked. The stub's notches sit mirrored on the left. */
export function passBackSVG(j, homeTz) {
  const f = j.flight;
  const todos = j.todos || [];
  const date = fmtDate(j.started_at, homeTz, { weekday: false, year: true });
  const big = todos.length <= 4;
  const size = big ? 20 : 16;
  const step = big ? 42 : 27;
  const top = big ? 162 : 152;
  const rows = todos.length
    ? todos.map((t, i) => `<text x="40" y="${top + i * step}" font-size="${size}" font-weight="600" fill="#10202f"><tspan fill="#2f8a5b" font-weight="800">✓</tspan><tspan dx="12">${esc(truncate(t.text, big ? 42 : 52))}</tspan></text>`).join('')
    : `<text x="40" y="${top}" font-size="16" fill="#6b7a8a">（这一程没有设定目标）</text>`;
  return card(`
    <text x="36" y="53" font-size="19" font-weight="700" fill="#ffffff">这一程完成的目标</text>
    <text x="${W - 30}" y="42" font-size="15" font-weight="700" fill="#ffffff" text-anchor="end" font-family="${MONO}">${esc(j.pass_no)}</text>
    <circle cx="${W - 720}" cy="66" r="12" fill="#e9eef3"/>
    <circle cx="${W - 720}" cy="${H}" r="12" fill="#e9eef3"/>

    <text x="36" y="104" font-size="15" fill="#33475b"><tspan font-weight="700" fill="#10202f" font-family="${MONO}">${esc(f.flight)}</tspan><tspan dx="10">${esc(f.origin.city)} ${esc(f.origin.iata)} → ${esc(f.destination.city)} ${esc(f.destination.iata)} · ${esc(date)}</tspan></text>
    ${todos.length ? `<text x="${W - 36}" y="104" font-size="15" font-weight="700" fill="#2f8a5b" text-anchor="end">${todos.filter((t) => t.done).length}/${todos.length} 完成</text>` : ''}
    <line x1="36" y1="120" x2="${W - 36}" y2="120" stroke="#dde3ea" stroke-width="1.5"/>
    ${rows}`);
}

export async function svgToPngBlob(svg, scale = 2) {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = W * scale;
    canvas.height = H * scale;
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    return await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  } finally {
    URL.revokeObjectURL(url);
  }
}
