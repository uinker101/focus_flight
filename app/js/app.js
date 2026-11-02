import { loadState, getState, save, sendPauseBeacon, sendHeartbeat, getHeartbeat, onExternalChange, refreshState, importState, HOME_PRESETS, defaultState } from './store.js';
import { loadPack, getPack, getPackIndex, activatePack, installPack, diffPacks, departuresBetween, departuresOnDate, snapshotFlight, aircraftLabel, EVIDENCE_TEXT } from './schedule.js';
import { zonedParts, addDays, fmtHM, fmtDate, fmtDuration, fmtClock, localDayOffset, weekdayZh } from './time.js';
import { applyTheme } from './sun.js';
import { makeProfile, sample, interpolate, bearing, PHASE_TEXT } from './sim.js';
import { MapView } from './map.js';
import { computeCollections, packTotals } from './collections.js';
import { passSVG, svgToPngBlob } from './pass.js';

const $app = document.getElementById('app');
const sessionStart = Date.now();
const RESUME_WINDOW_MS = 15000; // a close + reopen this quick is treated as a refresh
const HEARTBEAT_MS = 20000; // a running flight tells the server the page is still open
const SILENT_CLOSE_MS = 45000; // no heartbeat for this long = page was closed without pagehide
let current = null; // { destroy?, tick? } of the view on screen
const S = () => getState();
const P = () => getPack();

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const homeTz = () => S().settings.home.tz;

function toast(text) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = text;
  document.body.appendChild(el);
  setTimeout(() => el.classList.add('out'), 2600);
  setTimeout(() => el.remove(), 3200);
}

// --- journey state machine ----------------------------------------------------

function newId() {
  return 'J' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function simElapsed(j, now = Date.now()) {
  const run = j.resumed_at != null ? now - j.resumed_at : 0;
  return Math.min(j.duration_ms, j.accumulated_ms + run * (j.speed || 1));
}

function realElapsed(j, now = Date.now()) {
  return j.real_ms + (j.resumed_at != null ? now - j.resumed_at : 0);
}

/** Fold the running segment into the totals so speed or pause changes start clean. */
function fold(j, now = Date.now()) {
  if (j.resumed_at == null) return;
  j.accumulated_ms = simElapsed(j, now);
  j.real_ms = realElapsed(j, now);
  j.resumed_at = now;
}

function startFlight(j, at) {
  Object.assign(j, {
    stage: 'flying',
    started_at: at,
    duration_ms: j.flight.duration_min * 60000,
    accumulated_ms: 0,
    real_ms: 0,
    resumed_at: at,
    paused_at: null,
    speed: 1,
  });
}

/**
 * The page can vanish without pagehide (browser crash, force quit, some embedded
 * browsers). On a fresh load, if the running flight's heartbeat stopped long ago,
 * pause it at the last heartbeat. Sleep never gets here: the page stays loaded.
 * A tab the browser discarded and reloaded on its own counts as still open.
 */
function pauseIfClosedSilently() {
  const j = S().active;
  const hb = getHeartbeat();
  if (j?.stage !== 'flying' || j.resumed_at == null || document.wasDiscarded) return;
  if (!hb || hb.journey_id !== j.id || hb.at <= j.resumed_at || Date.now() - hb.at < SILENT_CLOSE_MS) return;
  fold(j, hb.at);
  j.resumed_at = null;
  j.paused_at = hb.at;
  save();
}

function resumeAfterReload() {
  const j = S().active;
  if (j?.stage === 'flying' && j.resumed_at == null && j.paused_at && Date.now() - j.paused_at < RESUME_WINDOW_MS) {
    j.resumed_at = j.paused_at; // a refresh: the flight never really stopped
    j.paused_at = null;
    save();
  }
}

/** Advance boarding → flying → landed from wall-clock time. Runs every second on every page. */
function advanceJourney() {
  const j = S().active;
  if (!j) return;
  const now = Date.now();
  if (j.stage === 'boarding' && now >= j.flight.sched_dep) {
    // Page open since before departure (sleep included): depart on schedule. Otherwise depart now.
    startFlight(j, sessionStart <= j.flight.sched_dep ? j.flight.sched_dep : now);
    save();
    go('flight');
    return;
  }
  if (j.stage === 'flying' && j.resumed_at != null && simElapsed(j, now) >= j.duration_ms) {
    const landedAt = j.resumed_at + (j.duration_ms - j.accumulated_ms) / (j.speed || 1);
    j.real_ms += landedAt - j.resumed_at;
    j.accumulated_ms = j.duration_ms;
    j.resumed_at = null;
    j.stage = 'landed';
    j.landed_at = landedAt;
    save();
    go('arrival');
  }
}

function finishJourney(status) {
  const st = S();
  const j = st.active;
  const record = {
    id: j.id,
    status,
    flight: j.flight,
    task: j.task,
    created_at: j.created_at,
    started_at: j.started_at ?? null,
    ended_at: status === 'aborted' ? Date.now() : j.landed_at,
    real_ms: j.real_ms ?? 0,
    demo: !!j.demo,
  };
  if (status === 'success') {
    st.pass_seq += 1;
    record.pass_no = 'FF' + String(st.pass_seq).padStart(6, '0');
  }
  if (status !== 'aborted') st.current_airport = j.flight.destination.iata;
  st.journeys.push(record);
  st.active = null;
  save();
  return record;
}

// --- routing ---------------------------------------------------------------------

function go(path) {
  const target = '#/' + path;
  if (location.hash === target) route();
  else location.hash = target;
}

const VIEWS = {
  '': viewHome,
  board: viewBoard,
  gate: viewGate,
  flight: viewFlight,
  arrival: viewArrival,
  pass: viewPass,
  collection: viewCollection,
  settings: viewSettings,
};

function route() {
  const [name = '', ...args] = location.hash.replace(/^#\/?/, '').split('/');
  const j = S().active;
  // Keep the journey's own screen in front while it needs the user.
  if (j?.stage === 'landed' && name !== 'arrival') return go('arrival');
  if (name === 'gate' && j?.stage !== 'boarding') return go(j?.stage === 'flying' ? 'flight' : '');
  if (name === 'flight' && j?.stage !== 'flying') return go(j?.stage === 'boarding' ? 'gate' : '');
  if (name === 'arrival' && j?.stage !== 'landed') return go('');
  current?.destroy?.();
  current = null;
  document.body.dataset.view = name || 'home';
  current = (VIEWS[name] || viewHome)(...args.map(decodeURIComponent)) || {};
}

function shell(active, inner) {
  const st = S();
  const pack = P();
  const ap = pack.airports[st.current_airport];
  const nav = [['', '我的旅行'], ['board', '出发大厅'], ['collection', '收藏'], ['settings', '设置']];
  $app.innerHTML = `
    <header class="topbar">
      <a class="brand" href="#/"><span class="brand-mark">✈</span> Focus Flight</a>
      <nav>${nav.map(([h, t]) => `<a href="#/${h}" class="${active === h ? 'on' : ''}">${t}</a>`).join('')}</nav>
      <div class="topbar-right">
        <span class="chip"><b>${esc(st.current_airport)}</b> ${esc(ap?.city || '')}</span>
        <span class="clock" data-clock>${esc(st.settings.home.label)} ${fmtHM(Date.now(), homeTz())}</span>
      </div>
    </header>
    <main class="page">${inner}</main>`;
}

function tickClock() {
  const el = document.querySelector('[data-clock]');
  if (el) el.textContent = `${S().settings.home.label} ${fmtHM(Date.now(), homeTz())}`;
}

// --- home ------------------------------------------------------------------------

function activeCard(j) {
  const f = j.flight;
  const status = j.stage === 'boarding' ? `候机中 · ${fmtClock(f.sched_dep - Date.now())} 后出发`
    : j.stage === 'flying' ? (j.resumed_at == null ? '航程已暂停' : '飞行中')
    : '已落地，等待自评';
  const target = j.stage === 'boarding' ? 'gate' : j.stage === 'flying' ? 'flight' : 'arrival';
  return `<div class="card active-card">
    <div class="eyebrow">进行中的行程</div>
    <div class="active-route"><b>${esc(f.flight)}</b> ${esc(f.origin.city)} ${esc(f.origin.iata)} → ${esc(f.destination.city)} ${esc(f.destination.iata)}</div>
    <div class="dim" data-active-status>${status}</div>
    <a class="btn primary" href="#/${target}">${j.stage === 'flying' && j.resumed_at == null ? '继续飞行' : '回到行程'}</a>
  </div>`;
}

function viewHome() {
  const st = S();
  const pack = P();
  const ap = pack.airports[st.current_airport];
  const col = computeCollections(st);
  const totals = packTotals(pack);
  const isBase = !col.airports.has(st.current_airport);
  const tile = (href, label, value, sub) => `<a class="stat" href="${href}"><div class="stat-value">${value}</div><div class="stat-label">${label}</div>${sub ? `<div class="stat-sub">${sub}</div>` : ''}</a>`;
  const recentPasses = col.success.slice(-3).reverse();
  const history = st.journeys.slice(-8).reverse();
  const statusText = { success: '专注成功', failed: '未专注好', aborted: '提前结束' };
  shell('', `
    <section class="hero">
      <div class="hero-main">
        <div class="eyebrow">当前所在</div>
        <div class="hero-code">${esc(st.current_airport)}</div>
        <div class="hero-name">${esc(ap?.name || '')} · ${esc(ap?.city || '')}</div>
        <div class="hero-meta" data-airport-time>当地时间 ${ap ? fmtHM(Date.now(), ap.tz) + ' · ' + fmtDate(Date.now(), ap.tz) : ''}</div>
        ${isBase ? '<span class="tag">出发基地</span>' : ''}
      </div>
      <div class="hero-side">
        ${st.active ? activeCard(st.active) : `<div class="card"><div class="eyebrow">下一程</div><p class="dim">从 ${esc(ap?.city || st.current_airport)} 出发的参考班表航班，选一班开始专注。</p><a class="btn primary big" href="#/board">选择下一班</a></div>`}
      </div>
    </section>
    <section class="stats">
      ${tile('#/collection/passes', '成功旅程', col.success.length)}
      ${tile('#/collection/passes', '累计专注', fmtDuration(col.focusMs / 60000))}
      ${tile('#/collection/airlines', '航空公司', col.airlines.size, `本数据包 ${totals.airlines.length} 家`)}
      ${tile('#/collection/aircraft', '机型', col.types.size, `本数据包可确定 ${totals.types.length} 种`)}
      ${tile('#/collection/airports', '抵达机场', col.airports.size, `本数据包 ${totals.airports.length} 个`)}
    </section>
    <section class="split">
      <div>
        <div class="section-head"><h2>最近的登机牌</h2><a href="#/collection/passes">全部</a></div>
        ${recentPasses.length ? `<div class="pass-row">${recentPasses.map((j) => `<a class="pass-thumb" href="#/pass/${j.id}">${passSVG(j, homeTz())}</a>`).join('')}</div>` : '<div class="empty">完成第一段专注航程后，登机牌会出现在这里。</div>'}
      </div>
      <div>
        <div class="section-head"><h2>旅程记录</h2></div>
        ${history.length ? `<ul class="history">${history.map((j) => `<li>
          <span class="h-route"><b>${esc(j.flight.flight)}</b> ${esc(j.flight.origin.iata)} → ${esc(j.flight.destination.iata)}</span>
          <span class="h-date dim">${fmtDate(j.ended_at, homeTz())}</span>
          <span class="badge ${j.status}">${statusText[j.status]}</span></li>`).join('')}</ul>` : '<div class="empty">还没有旅程记录。</div>'}
      </div>
    </section>`);
  return {
    tick() {
      const el = document.querySelector('[data-airport-time]');
      if (el && ap) el.textContent = `当地时间 ${fmtHM(Date.now(), ap.tz)} · ${fmtDate(Date.now(), ap.tz)}`;
      const s = document.querySelector('[data-active-status]');
      const j = S().active;
      if (s && j?.stage === 'boarding') s.textContent = `候机中 · ${fmtClock(j.flight.sched_dep - Date.now())} 后出发`;
    },
  };
}

// --- departures board --------------------------------------------------------------

const boardFilters = { day: 'next', dest: '', airline: '', duration: '', knownAircraft: false };

function viewBoard() {
  const st = S();
  const pack = P();
  const origin = st.current_airport;
  const ap = pack.airports[origin];
  if (!ap) {
    shell('board', `<div class="empty">当前机场 ${esc(origin)} 不在数据包 ${esc(pack.dataset_version)} 里。可以在设置里换回包含它的数据包版本，或者回到这个数据包的出发基地。
      <div style="margin-top:12px"><button class="btn" data-to-base>回到出发基地 ${esc(pack.start_airport)}</button></div></div>`);
    $app.querySelector('[data-to-base]').addEventListener('click', () => {
      st.current_airport = pack.start_airport;
      save();
      route();
    });
    return {};
  }
  const render = () => {
    const now = Date.now();
    const today = zonedParts(now, ap.tz);
    const days = Array.from({ length: 7 }, (_, i) => addDays(today, i));
    let list;
    if (boardFilters.day === 'next') list = departuresBetween(origin, now - 30 * 60000, now + 24 * 3600000);
    else {
      const d = days[+boardFilters.day];
      list = departuresOnDate(origin, d);
    }
    const all = list;
    list = list.filter((x) =>
      (!boardFilters.dest || x.s.destination === boardFilters.dest) &&
      (!boardFilters.airline || x.s.airline === boardFilters.airline) &&
      (!boardFilters.knownAircraft || x.s.aircraft.status === 'exact') &&
      (!boardFilters.duration || (boardFilters.duration === 's' ? x.s.duration_min < 150 : boardFilters.duration === 'm' ? x.s.duration_min >= 150 && x.s.duration_min < 240 : x.s.duration_min >= 240)));
    const dests = [...new Set(pack.schedules.filter((s) => s.origin === origin).map((s) => s.destination))].sort();
    const airlines = [...new Set(pack.schedules.filter((s) => s.origin === origin).map((s) => s.airline))].sort();
    const sel = (name, options, value) => `<select data-filter="${name}">${options.map(([v, t]) => `<option value="${v}" ${v === value ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>`;
    const rows = list.map((x) => {
      const s = x.s;
      const dst = pack.airports[s.destination];
      const gone = x.dep <= now;
      const off = localDayOffset(x.dep, ap.tz, x.arr, dst.tz);
      return `<tr class="${gone ? 'gone' : ''}" data-key="${esc(x.key)}">
        <td class="t-time">${fmtHM(x.dep, ap.tz)}${boardFilters.day === 'next' && zonedParts(x.dep, ap.tz).d !== today.d ? '<small> 明天</small>' : ''}</td>
        <td><b class="mono">${esc(s.flight)}</b><div class="small dim">${esc(pack.airlines[s.airline].name)}${s.codeshares.length ? ' · 代码共享 ' + esc(s.codeshares.join(' ')) : ''}</div></td>
        <td><b>${esc(dst.city)}</b> <span class="mono dim">${esc(dst.iata)}</span></td>
        <td class="t-time">${fmtHM(x.arr, dst.tz)}${off ? `<sup>+${off}</sup>` : ''}</td>
        <td>${fmtDuration(s.duration_min)}</td>
        <td class="${s.aircraft.status === 'exact' ? '' : 'dim'}">${esc(aircraftLabel(s.aircraft))}</td>
        <td>${gone ? '<span class="dim small">已出发</span>' : `<button class="btn small" data-pick="${esc(x.key)}" ${st.active ? 'disabled' : ''}>选择</button>`}</td>
      </tr>`;
    }).join('');
    shell('board', `
      <div class="board-head">
        <div>
          <div class="eyebrow">出发大厅 · 当地时间 ${fmtHM(now, ap.tz)}</div>
          <h1>${esc(ap.name)} <span class="mono dim">${esc(origin)}</span></h1>
          <div class="ref-note"><span class="tag">参考班表 · 每周循环</span> ${esc(pack.title)} · 参考周 ${esc(pack.reference_weeks.join('、'))} 起 · 计划时刻，不显示实时延误或取消</div>
        </div>
      </div>
      ${st.active ? `<div class="banner">你还有一段进行中的行程（${esc(st.active.flight.flight)}），完成或结束后才能选下一班。 <a href="#/${st.active.stage === 'boarding' ? 'gate' : 'flight'}">回到行程</a></div>` : ''}
      <div class="day-tabs">
        <button data-day="next" class="${boardFilters.day === 'next' ? 'on' : ''}">接下来 24 小时</button>
        ${days.map((d, i) => `<button data-day="${i}" class="${boardFilters.day === String(i) ? 'on' : ''}">${i === 0 ? '今天' : i === 1 ? '明天' : weekdayZh(d.wd)} <small>${d.m}/${d.d}</small></button>`).join('')}
      </div>
      <div class="filters">
        ${sel('dest', [['', '全部目的地'], ...dests.map((c) => [c, `${pack.airports[c].city} ${c}`])], boardFilters.dest)}
        ${sel('airline', [['', '全部航空公司'], ...airlines.map((c) => [c, pack.airlines[c].name])], boardFilters.airline)}
        ${sel('duration', [['', '任意航程'], ['s', '2.5 小时以内'], ['m', '2.5–4 小时'], ['l', '4 小时以上']], boardFilters.duration)}
        <label class="check"><input type="checkbox" data-filter="knownAircraft" ${boardFilters.knownAircraft ? 'checked' : ''}> 只看机型已确定</label>
        <span class="dim small">${list.length} / ${all.length} 班</span>
      </div>
      ${list.length ? `<table class="board">
        <thead><tr><th>出发</th><th>航班（执飞）</th><th>目的地</th><th>抵达（当地）</th><th>航程</th><th>机型</th><th></th></tr></thead>
        <tbody>${rows}</tbody></table>` : `<div class="empty">这个时段在参考班表里没有符合条件的航班。</div>`}
      <dialog class="flight-dialog"></dialog>`);

    $app.querySelectorAll('[data-day]').forEach((b) => b.addEventListener('click', () => { boardFilters.day = b.dataset.day; render(); }));
    $app.querySelectorAll('[data-filter]').forEach((el) => el.addEventListener('change', () => {
      boardFilters[el.dataset.filter] = el.type === 'checkbox' ? el.checked : el.value;
      render();
    }));
    $app.querySelectorAll('[data-pick]').forEach((b) => b.addEventListener('click', () => openFlight(list.find((x) => x.key === b.dataset.pick))));
  };

  const VERIFY_TEXT = { source_checked: '已逐行对照来源原页', source_parsed: '脚本从来源提取，未逐行人工核对', cross_checked: '已用第二来源核对', manual: '人工录入' };

  function openFlight(x) {
    const s = x.s;
    const dst = pack.airports[s.destination];
    const source = pack.sources.find((src) => src.source_id === s.source);
    const off = localDayOffset(x.dep, ap.tz, x.arr, dst.tz);
    const dlg = $app.querySelector('.flight-dialog');
    dlg.innerHTML = `
      <form method="dialog" class="dlg">
        <div class="dlg-head">
          <div><div class="eyebrow">${esc(pack.airlines[s.airline].name)} ${esc(pack.airlines[s.airline].name_en)}</div><h2 class="mono">${esc(s.flight)}</h2></div>
          <button class="icon-btn" value="cancel" aria-label="关闭">✕</button>
        </div>
        ${s.codeshares.length ? `<div class="small dim">营销代码共享：${esc(s.codeshares.join('、'))}（按执飞公司 ${esc(pack.airlines[s.airline].name)} 计入收藏）</div>` : ''}
        <div class="dlg-route">
          <div><div class="big mono">${esc(ap.iata)}</div><div>${esc(ap.city)}</div><div class="t-time">${fmtHM(x.dep, ap.tz)}</div><div class="small dim">${fmtDate(x.dep, ap.tz)} 当地</div></div>
          <div class="dlg-mid"><div class="small dim">计划航程</div><div><b>${fmtDuration(s.duration_min)}</b></div><div class="line"></div></div>
          <div><div class="big mono">${esc(dst.iata)}</div><div>${esc(dst.city)}</div><div class="t-time">${fmtHM(x.arr, dst.tz)}${off ? `<sup>+${off}</sup>` : ''}</div><div class="small dim">${fmtDate(x.arr, dst.tz)} 当地</div></div>
        </div>
        <dl class="facts">
          <dt>机型</dt><dd>${esc(aircraftLabel(s.aircraft))} <span class="dim small">原文 ${esc(s.aircraft.raw || '—')} · ${esc(EVIDENCE_TEXT[s.aircraft.status])}</span></dd>
          <dt>来源</dt><dd>${esc(source?.title || s.source)} <span class="dim small">· ${esc(VERIFY_TEXT[s.verification] || s.verification)}</span></dd>
          <dt>候机</dt><dd>${x.dep > Date.now() ? `距计划出发 ${fmtDuration((x.dep - Date.now()) / 60000)}，候机时间不计入专注` : '已过计划出发时间'}</dd>
        </dl>
        <label class="task-label">这段航程要专注做什么？<textarea name="task" rows="2" maxlength="80" placeholder="例如：读完第 3 章并做笔记（可留空）"></textarea></label>
        <div class="dlg-actions">
          <button class="btn" value="cancel">再看看</button>
          <button class="btn primary" value="go" data-go>值机，前往登机口</button>
        </div>
      </form>`;
    dlg.querySelector('[data-go]').addEventListener('click', (e) => {
      e.preventDefault();
      if (S().active) return toast('已有进行中的行程');
      if (x.dep <= Date.now()) return toast('这班已经出发了');
      S().active = {
        id: newId(),
        stage: 'boarding',
        flight: snapshotFlight(x),
        task: dlg.querySelector('textarea').value.trim(),
        created_at: Date.now(),
        demo: false,
      };
      save();
      dlg.close();
      go('gate');
    });
    dlg.showModal();
  }

  render();
  let lastMinute = new Date().getMinutes();
  return {
    tick() {
      const m = new Date().getMinutes();
      if (m !== lastMinute && !$app.querySelector('.flight-dialog[open]')) {
        lastMinute = m;
        render();
      }
    },
  };
}

// --- gate --------------------------------------------------------------------------

function viewGate() {
  const st = S();
  const j = st.active;
  const f = j.flight;
  const o = f.origin;
  const d = f.destination;
  shell('', `
    <section class="gate">
      <div class="gate-board">
        <div class="eyebrow">登机口 · ${esc(o.name)}</div>
        <div class="gate-flight"><span class="mono">${esc(f.flight)}</span> <span>前往 ${esc(d.city)} ${esc(d.iata)}</span></div>
        <div class="gate-status" data-status></div>
        <div class="gate-countdown mono" data-countdown></div>
        <div class="gate-sub">计划出发 <b class="mono">${fmtHM(f.sched_dep, o.tz)}</b>（${esc(o.city)}当地 · ${fmtDate(f.sched_dep, o.tz)}）· 计划抵达 <b class="mono">${fmtHM(f.sched_arr, d.tz)}</b>（${esc(d.city)}当地）</div>
        <div class="gate-sub dim">候机时间不计入专注时长。到计划出发时间自动起飞，这一程专注 ${fmtDuration(f.duration_min)}。</div>
      </div>
      <div class="card gate-side">
        <div class="eyebrow">本班资料</div>
        <dl class="facts">
          <dt>执飞</dt><dd>${esc(f.airline.name)} ${esc(f.flight)}${f.codeshares.length ? ` <span class="dim small">代码共享 ${esc(f.codeshares.join(' '))}</span>` : ''}</dd>
          <dt>机型</dt><dd>${esc(aircraftLabel(f.aircraft))}</dd>
          <dt>数据</dt><dd class="small">${esc(f.pack_version)}</dd>
        </dl>
        <label class="task-label">学习任务<textarea rows="3" maxlength="80" data-task placeholder="这段航程要专注做什么？">${esc(j.task)}</textarea></label>
        <div class="gate-actions">
          <button class="btn" data-cancel>取消行程</button>
          ${st.settings.demo ? '<button class="btn warn" data-now>立即出发（演示）</button>' : ''}
        </div>
      </div>
    </section>`);
  $app.querySelector('[data-task]').addEventListener('change', (e) => { j.task = e.target.value.trim(); save(); });
  $app.querySelector('[data-cancel]').addEventListener('click', () => {
    if (!confirm('取消这段行程？不会留下记录，位置仍在 ' + o.city + '。')) return;
    st.active = null;
    save();
    go('board');
  });
  $app.querySelector('[data-now]')?.addEventListener('click', () => {
    j.demo = true;
    startFlight(j, Date.now());
    save();
    go('flight');
  });
  const tick = () => {
    const left = f.sched_dep - Date.now();
    const status = left > 30 * 60000 ? '候机中' : left > 10 * 60000 ? '正在登机' : '登机口即将关闭';
    $app.querySelector('[data-status]').textContent = status;
    $app.querySelector('[data-countdown]').textContent = fmtClock(left);
  };
  tick();
  return { tick };
}

// --- flight (PTV) ------------------------------------------------------------------------

function viewFlight() {
  const st = S();
  const j = st.active;
  const f = j.flight;
  const o = f.origin;
  const d = f.destination;
  const profile = makeProfile(o, d, f.duration_min);
  document.body.dataset.view = 'flight';
  $app.innerHTML = `
    <div class="ptv" data-ptv>
      <canvas class="ptv-map"></canvas>
      <div class="ptv-top">
        <div class="ptv-title"><span class="mono">${esc(f.flight)}</span> ${esc(f.airline.name)} · ${esc(o.city)} → ${esc(d.city)}</div>
        ${j.task ? `<div class="ptv-task">专注：${esc(j.task)}</div>` : ''}
      </div>
      <div class="ptv-controls">
        <div class="seg" data-modes>
          <button data-mode="follow">跟随飞机</button><button data-mode="route" class="on">整段航线</button><button data-mode="world">全球</button>
        </div>
        <button class="icon-btn" data-fs title="全屏">⛶</button>
        <a class="icon-btn" href="#/" title="回首页（航程继续）">⌂</a>
      </div>
      <div class="ptv-panel">
        <div class="ptv-progress">
          <div class="ptv-end"><b class="mono">${esc(o.iata)}</b><span>${esc(o.city)}</span></div>
          <div class="ptv-bar"><div class="ptv-fill" data-fill></div><div class="ptv-plane" data-pplane>✈</div></div>
          <div class="ptv-end right"><b class="mono">${esc(d.iata)}</b><span>${esc(d.city)}</span></div>
        </div>
        <div class="ptv-stats">
          <div><label>剩余时间</label><b data-v="remain"></b></div>
          <div><label>已专注</label><b data-v="focus"></b></div>
          <div><label>阶段</label><b data-v="phase"></b></div>
          <div><label>地速</label><b data-v="speed"></b></div>
          <div><label>高度</label><b data-v="alt"></b></div>
          <div><label>外界温度</label><b data-v="temp"></b></div>
          <div><label>剩余距离</label><b data-v="dist"></b></div>
          <div><label>${esc(o.city)}时间</label><b data-v="otime"></b></div>
          <div><label>${esc(d.city)}时间</label><b data-v="dtime"></b></div>
        </div>
        <div class="ptv-foot">
          <span class="dim small">参考班表模拟飞行 · 计划航程 ${fmtDuration(f.duration_min)} · 非实时航班动态</span>
          ${st.settings.demo ? `<span class="seg small" data-speeds><button data-speed="1">×1</button><button data-speed="30">×30</button><button data-speed="120">×120</button></span>` : ''}
          <button class="btn small ghost" data-abort>提前结束</button>
        </div>
      </div>
      <div class="ptv-paused" data-paused hidden>
        <div class="card">
          <h2>航程已暂停</h2>
          <p class="dim">页面关闭期间暂停了个人进度，不判误机。继续后从暂停处接着飞。</p>
          <button class="btn primary big" data-resume>继续飞行</button>
        </div>
      </div>
    </div>`;

  const map = new MapView($app.querySelector('canvas'));
  map.setFlight(o, d);
  map.setAirports([{ ...o, kind: 'origin' }, { ...d, kind: 'dest' }]);
  const panel = $app.querySelector('.ptv-panel');
  const fitPadding = () => map.setPadding({ top: 90, bottom: panel.offsetHeight + 40, left: 40, right: 40 });
  fitPadding();
  window.addEventListener('resize', fitPadding);
  map.init();

  $app.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => {
    $app.querySelectorAll('[data-mode]').forEach((x) => x.classList.toggle('on', x === b));
    map.setMode(b.dataset.mode);
  }));
  $app.querySelector('[data-fs]').addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else $app.querySelector('[data-ptv]').requestFullscreen?.();
  });
  $app.querySelector('[data-resume]').addEventListener('click', () => {
    j.resumed_at = Date.now();
    j.paused_at = null;
    save();
    tick();
  });
  $app.querySelector('[data-abort]').addEventListener('click', () => {
    if (!confirm(`提前结束这段航程？\n位置会留在 ${o.city}，这次不会获得登机牌和收藏。`)) return;
    fold(j);
    finishJourney('aborted');
    toast('已提前结束，仍在 ' + o.city);
    go('');
  });
  $app.querySelectorAll('[data-speed]').forEach((b) => b.addEventListener('click', () => {
    fold(j);
    j.speed = +b.dataset.speed;
    if (j.speed !== 1) j.demo = true;
    save();
    tick();
  }));

  const V = (k, v) => { const el = $app.querySelector(`[data-v="${k}"]`); if (el) el.textContent = v; };
  function tick() {
    if (S().active !== j || j.stage !== 'flying') return;
    const now = Date.now();
    const min = simElapsed(j, now) / 60000;
    const sm = sample(profile, min);
    const pos = interpolate(o, d, sm.fraction);
    const ahead = interpolate(o, d, Math.min(1, sm.fraction + 0.002));
    const heading = sm.fraction < 0.998 ? bearing(pos, ahead) : bearing(o, d);
    map.setPlane(pos, heading, sm.fraction);
    const tFrac = min / f.duration_min;
    $app.querySelector('[data-fill]').style.width = `${(tFrac * 100).toFixed(2)}%`;
    $app.querySelector('[data-pplane]').style.left = `${(tFrac * 100).toFixed(2)}%`;
    V('remain', fmtClock((f.duration_min - min) * 60000));
    V('focus', fmtDuration(realElapsed(j, now) / 60000));
    V('phase', PHASE_TEXT[sm.phase]);
    V('speed', `${Math.round(sm.speedKmh)} 公里/时`);
    V('alt', `${Math.round(sm.altM / 10) * 10} 米`);
    V('temp', sm.outsideC == null ? '—' : `${Math.round(sm.outsideC)}°C`);
    V('dist', `${Math.round(sm.remainKm)} 公里`);
    V('otime', fmtHM(now, o.tz));
    V('dtime', fmtHM(now, d.tz));
    $app.querySelector('[data-paused]').hidden = j.resumed_at != null;
    $app.querySelectorAll('[data-speed]').forEach((b) => b.classList.toggle('on', +b.dataset.speed === (j.speed || 1)));
  }
  tick();
  return {
    tick,
    destroy() {
      map.destroy();
      window.removeEventListener('resize', fitPadding);
      if (document.fullscreenElement) document.exitFullscreen();
    },
  };
}

// --- arrival -------------------------------------------------------------------------------

function viewArrival() {
  const j = S().active;
  const f = j.flight;
  const d = f.destination;
  shell('', `
    <section class="arrival">
      <div class="eyebrow">${esc(f.flight)} 已抵达</div>
      <h1>欢迎来到 ${esc(d.city)}</h1>
      <div class="arrival-sub">${esc(d.name)} <span class="mono">${esc(d.iata)}</span> · 当地时间 ${fmtHM(j.landed_at, d.tz)}</div>
      <div class="arrival-facts">
        <div><label>本次专注</label><b>${fmtDuration(j.real_ms / 60000)}</b></div>
        <div><label>航线</label><b>${esc(f.origin.iata)} → ${esc(d.iata)}</b></div>
        <div><label>学习任务</label><b>${esc(j.task || '（未填写）')}</b></div>
      </div>
      <h2>这段时间专注成功吗？</h2>
      <p class="dim">由你自己判断。成功会出票并计入航空公司、机型、机场收藏；没专注好也会落地在 ${esc(d.city)}，只是不发登机牌。</p>
      <div class="arrival-actions">
        <button class="btn primary big" data-ok>专注成功，出票</button>
        <button class="btn big" data-fail>这次没有专注好</button>
      </div>
    </section>`);
  $app.querySelector('[data-ok]').addEventListener('click', () => {
    const rec = finishJourney('success');
    go(`pass/${rec.id}/new`);
  });
  $app.querySelector('[data-fail]').addEventListener('click', () => {
    finishJourney('failed');
    toast(`已记录，现在位于 ${d.city}`);
    go('');
  });
  return {};
}

// --- boarding pass -----------------------------------------------------------------------------

function viewPass(id, fresh) {
  const st = S();
  const j = st.journeys.find((x) => x.id === id && x.status === 'success');
  if (!j) {
    shell('collection', '<div class="empty">找不到这张登机牌。</div>');
    return {};
  }
  const svg = passSVG(j, homeTz());
  const isNew = fresh === 'new';
  const col = computeCollections(st);
  const firsts = [];
  if (isNew) {
    if (col.airlines.get(j.flight.airline.iata)?.count === 1) firsts.push(`新航空公司：${j.flight.airline.name}`);
    if (j.flight.aircraft.status === 'exact' && col.types.get(j.flight.aircraft.type)?.count === 1) firsts.push(`新机型：${j.flight.aircraft.manufacturer} ${j.flight.aircraft.name}`);
    if (col.airports.get(j.flight.destination.iata)?.count === 1) firsts.push(`新抵达机场：${j.flight.destination.name}`);
  }
  shell('collection', `
    <section class="pass-view ${isNew ? 'fresh' : ''}">
      ${isNew ? `<div class="eyebrow">已加入收藏</div><h1>登机牌已出票</h1>${firsts.length ? `<div class="unlocks">${firsts.map((t) => `<span class="unlock">★ ${esc(t)}</span>`).join('')}</div>` : ''}` : `<div class="eyebrow">登机牌 ${esc(j.pass_no)}</div><h1>${esc(j.flight.origin.city)} → ${esc(j.flight.destination.city)}</h1>`}
      <div class="printer"><div class="pass-big print-target">${svg}</div></div>
      <div class="pass-actions">
        <button class="btn primary" data-png>下载图片</button>
        <button class="btn" data-print>打印 / 存为 PDF</button>
        <a class="btn ghost" href="#/collection/passes">登机牌墙</a>
        <a class="btn ghost" href="#/">回首页</a>
      </div>
      <p class="dim small">“存为 PDF”在打印窗口左下角选择。图片和打印内容相同，重复下载不影响收藏次数。</p>
    </section>`);
  $app.querySelector('[data-print]').addEventListener('click', () => window.print());
  $app.querySelector('[data-png]').addEventListener('click', async () => {
    const blob = await svgToPngBlob(svg);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `focus-flight-${j.pass_no}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  return {};
}

// --- collections ---------------------------------------------------------------------------------

function viewCollection(tab = 'passes') {
  const st = S();
  const pack = P();
  const col = computeCollections(st);
  const totals = packTotals(pack);
  const tabs = [['passes', '登机牌'], ['airlines', '航空公司'], ['aircraft', '机型'], ['airports', '机场'], ['routes', '航线图']];
  const dateRange = (e) => `首次 ${fmtDate(e.first, homeTz(), { weekday: false })}${e.count > 1 ? ` · 最近 ${fmtDate(e.last, homeTz(), { weekday: false })}` : ''}`;
  let body = '';
  let map = null;

  if (tab === 'passes') {
    const list = col.success.slice().reverse();
    body = list.length ? `<div class="pass-wall">${list.map((j) => `<a class="pass-thumb" href="#/pass/${j.id}">${passSVG(j, homeTz())}</a>`).join('')}</div>`
      : '<div class="empty">还没有登机牌。完整飞完一段并确认专注成功后出票。</div>';
  } else if (tab === 'airlines') {
    const codes = [...new Set([...totals.airlines, ...col.airlines.keys()])];
    codes.sort((a, b) => (col.airlines.has(b) - col.airlines.has(a)) || a.localeCompare(b));
    body = `<p class="dim small">按实际执飞公司统计；代码共享航班只算执飞公司一次。本数据包可收集 ${totals.airlines.length} 家，已解锁 ${col.airlines.size} 家。</p>
      <div class="cards">${codes.map((c) => {
        const e = col.airlines.get(c);
        const info = e?.info || pack.airlines[c];
        return `<div class="ccard ${e ? '' : 'locked'}"><div class="ccard-code mono">${esc(c)}</div><div class="ccard-name">${esc(info.name)}</div><div class="small dim">${esc(info.name_en)}</div>
          ${e ? `<div class="ccard-count">${e.count} 次</div><div class="small dim">${dateRange(e)}</div>` : '<div class="small dim">未解锁</div>'}</div>`;
      }).join('')}</div>`;
  } else if (tab === 'aircraft') {
    const typeCodes = [...new Set([...totals.types, ...col.types.keys()])];
    const families = [...new Set([...totals.families, ...col.families.keys(), ...typeCodes.map((t) => pack.aircraft_types[t]?.family || col.types.get(t)?.info.family)])];
    families.sort((a, b) => (col.families.has(b) - col.families.has(a)) || a.localeCompare(b));
    body = `<p class="dim small">只有来源列明具体机型的航班计入型号；来源只确定到系列时只计入系列；EQV（机型不固定）或多个候选机型不计入。机型别名（如 738 / 73H）合并为同一型号。</p>
      <div class="families">${families.map((fam) => {
        const fe = col.families.get(fam);
        const types = typeCodes.filter((t) => (pack.aircraft_types[t]?.family || col.types.get(t)?.info.family) === fam);
        return `<div class="family ${fe ? '' : 'locked'}">
          <div class="family-head"><b>${esc(fam)}</b>${fe ? `<span>${fe.count} 次 · ${dateRange(fe)}</span>` : '<span class="dim">未解锁</span>'}</div>
          <div class="type-chips">${types.map((t) => {
            const te = col.types.get(t);
            const info = te?.info || pack.aircraft_types[t];
            return `<span class="type-chip ${te ? '' : 'locked'}">${esc(info.manufacturer)} ${esc(info.name)}${te ? ` <b>×${te.count}</b>` : ''}</span>`;
          }).join('') || '<span class="dim small">本数据包没有可确定到具体型号的航班</span>'}</div>
        </div>`;
      }).join('')}</div>`;
  } else if (tab === 'airports') {
    const codes = [...new Set([...totals.airports, ...col.airports.keys()])];
    codes.sort((a, b) => (col.airports.has(b) - col.airports.has(a)) || a.localeCompare(b));
    body = `<p class="dim small">按机场身份统计成功抵达次数；同城不同机场分别计算。出发基地 ${esc(pack.start_airport)} 要成功飞回来才算抵达。</p>
      <div class="cards">${codes.map((c) => {
        const e = col.airports.get(c);
        const info = e?.info || pack.airports[c];
        return `<div class="ccard ${e ? '' : 'locked'}"><div class="ccard-code mono">${esc(c)}</div><div class="ccard-name">${esc(info.city)}</div><div class="small dim">${esc(info.name)}</div>
          ${e ? `<div class="ccard-count">抵达 ${e.count} 次</div><div class="small dim">${dateRange(e)}</div>` : `<div class="small dim">${c === pack.start_airport ? '出发基地 · 尚未抵达' : '未抵达'}</div>`}</div>`;
      }).join('')}</div>`;
  } else if (tab === 'routes') {
    const routes = [...col.routes.values()].sort((a, b) => b.count - a.count);
    body = `<div class="routes-layout">
      <div class="routes-map"><canvas></canvas></div>
      <ul class="route-list">${routes.map((r) => `<li data-route="${esc(r.key)}"><b class="mono">${esc(r.key)}</b> <span>${esc(r.a.city)} – ${esc(r.b.city)}</span> <span class="dim">${r.count} 次</span>
        <div class="small dim">${r.journeys.map((id) => st.journeys.find((x) => x.id === id)).map((x) => `<a href="#/pass/${x.id}">${esc(x.flight.flight)} ${fmtDate(x.ended_at, homeTz(), { weekday: false })}</a>`).join(' · ')}</div></li>`).join('') || '<li class="dim">成功完成航程后，航线会画在地图上。</li>'}</ul>
    </div>`;
  }

  shell('collection', `
    <div class="section-head"><h1>收藏</h1><span class="dim small">只统计完整飞完并确认专注成功的旅程</span></div>
    <div class="tabs">${tabs.map(([k, t]) => `<a href="#/collection/${k}" class="${k === tab ? 'on' : ''}">${t}</a>`).join('')}</div>
    ${body}`);

  if (tab === 'routes') {
    map = new MapView($app.querySelector('.routes-map canvas'));
    const routes = [...col.routes.values()];
    map.setRoutes(routes.map((r) => ({ a: r.a, b: r.b, count: r.count, key: r.key })));
    const visited = new Set(routes.flatMap((r) => [r.a.iata, r.b.iata]));
    map.setAirports(Object.values(pack.airports).map((a) => ({ ...a, kind: visited.has(a.iata) ? 'visited' : 'other' })));
    map.init();
    $app.querySelectorAll('[data-route]').forEach((li) => {
      li.addEventListener('mouseenter', () => map.setHighlight(li.dataset.route));
      li.addEventListener('mouseleave', () => map.setHighlight(null));
    });
  }
  return { destroy: () => map?.destroy() };
}

// --- settings --------------------------------------------------------------------------------------

function viewSettings() {
  const st = S();
  const pack = P();
  shell('settings', `
    <h1>设置</h1>
    <section class="card settings">
      <h2>现实所在地</h2>
      <p class="dim small">决定顶部时钟和日夜主题（按当地日出日落离线计算），和虚拟飞机的位置无关。</p>
      <select data-home>${HOME_PRESETS.map((h) => `<option value="${h.id}" ${h.id === st.settings.home.id ? 'selected' : ''}>${esc(h.label)}（${esc(h.tz)}）</option>`).join('')}</select>
      <h2>日夜主题</h2>
      <div class="seg" data-theme>${[['auto', '跟随所在地日出日落'], ['day', '始终白天'], ['night', '始终夜晚']].map(([v, t]) => `<button data-v="${v}" class="${st.settings.theme === v ? 'on' : ''}">${t}</button>`).join('')}</div>
    </section>
    <section class="card settings">
      <h2>数据包</h2>
      <dl class="facts">
        <dt>当前版本</dt><dd class="mono">${esc(pack.dataset_version)}</dd>
        <dt>名称</dt><dd>${esc(pack.title)}</dd>
        <dt>参考周</dt><dd>${esc(pack.reference_weeks.join('、'))} 起，按星期循环</dd>
        <dt>覆盖</dt><dd>${pack.coverage.airports} 个机场 · ${pack.coverage.airlines} 家执飞公司 · ${pack.coverage.schedules} 条班表 · ${esc(pack.coverage.note)}</dd>
        <dt>来源</dt><dd>${pack.sources.map((s) => `${esc(s.title)}（${esc(s.valid_from)} 至 ${esc(s.valid_to)}）<div class="small dim">${esc(s.usage_note)}</div>`).join('')}</dd>
      </dl>
      <h2>已安装版本</h2>
      <p class="dim small">切换版本即可回退。进行中的航班和已完成旅程都保存了当时的航班快照，换数据包不会改动它们。</p>
      <ul class="pack-list">${getPackIndex().packs.slice().reverse().map((p) => `<li>
        <span><b class="mono">${esc(p.version)}</b> <span class="dim small">${esc(p.title)}</span></span>
        ${p.version === pack.dataset_version ? '<span class="badge success">使用中</span>' : `<button class="btn small" data-use-pack="${esc(p.version)}">使用此版本</button>`}
      </li>`).join('')}</ul>
      <label class="btn">导入数据包（.json）<input type="file" accept="application/json" data-pack-file hidden></label>
      <div data-pack-preview></div>
    </section>
    <section class="card settings">
      <h2>存档</h2>
      <p class="dim small">存档保存在项目的 userdata/state.json，每次写入都留备份（userdata/backups）。清浏览器缓存不影响。</p>
      <div class="row">
        <a class="btn" href="/api/export">导出存档</a>
        <label class="btn">导入存档<input type="file" accept="application/json" data-import hidden></label>
        <button class="btn warn" data-reset>重置存档</button>
      </div>
      <h2>演示模式</h2>
      <label class="check"><input type="checkbox" data-demo ${st.settings.demo ? 'checked' : ''}> 允许“立即出发”和加速飞行（用于测试；用过的旅程登机牌会盖“演示加速”章）</label>
    </section>`);
  $app.querySelector('[data-home]').addEventListener('change', (e) => {
    st.settings.home = HOME_PRESETS.find((h) => h.id === e.target.value);
    save();
    themeNow();
    tickClock();
  });
  $app.querySelectorAll('[data-theme] button').forEach((b) => b.addEventListener('click', () => {
    st.settings.theme = b.dataset.v;
    save();
    themeNow();
    route();
  }));
  $app.querySelector('[data-demo]').addEventListener('change', (e) => { st.settings.demo = e.target.checked; save(); });
  $app.querySelectorAll('[data-use-pack]').forEach((b) => b.addEventListener('click', async () => {
    try {
      await activatePack(b.dataset.usePack);
      location.reload();
    } catch (err) {
      toast('切换失败：' + err.message);
    }
  }));
  $app.querySelector('[data-pack-file]').addEventListener('change', async (e) => {
    const box = $app.querySelector('[data-pack-preview]');
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    let incoming;
    try {
      incoming = JSON.parse(await file.text());
      if (incoming.schema_version !== 1 || !Array.isArray(incoming.schedules)) throw new Error('不是 Focus Flight 数据包');
    } catch (err) {
      box.innerHTML = `<div class="banner">无法读取：${esc(err.message)}</div>`;
      return;
    }
    const d = diffPacks(pack, incoming);
    const ev = Object.entries(d.evidence).map(([k, v]) => `${k} ${v}`).join(' · ');
    box.innerHTML = `<div class="card pack-preview">
      <div class="eyebrow">导入前确认</div>
      <h2 class="mono">${esc(incoming.dataset_version)}</h2>
      <div>${esc(incoming.title || '')}</div>
      <dl class="facts">
        <dt>班表</dt><dd>${d.schedules} 条（相对当前新增 ${d.addedSchedules}，移除 ${d.removedSchedules}）</dd>
        <dt>机场</dt><dd>${d.airports.length} 个${d.addedAirports.length ? ` · 新增 ${esc(d.addedAirports.join(' '))}` : ''}${d.removedAirports.length ? ` · 移除 ${esc(d.removedAirports.join(' '))}` : ''}</dd>
        <dt>航司</dt><dd>${esc(d.airlines.join(' '))}</dd>
        <dt>机型</dt><dd>可确定 ${d.types.length} 种 · 依据分布：${esc(ev)}</dd>
        <dt>来源</dt><dd>${(incoming.sources || []).map((s) => esc(s.title)).join('；') || '<span class="dim">未注明</span>'}</dd>
      </dl>
      ${d.removedAirports.includes(st.current_airport) ? `<div class="banner">新数据包里没有你当前所在的 ${esc(st.current_airport)}，切换后出发大厅会是空的。</div>` : ''}
      <div class="row"><button class="btn primary" data-install>安装并使用</button><button class="btn" data-install-only>只安装</button></div>
    </div>`;
    const install = async (use) => {
      try {
        await installPack(incoming);
        if (use) await activatePack(incoming.dataset_version);
        location.reload();
      } catch (err) {
        toast('导入失败：' + err.message);
      }
    };
    box.querySelector('[data-install]').addEventListener('click', () => install(true));
    box.querySelector('[data-install-only]').addEventListener('click', () => install(false));
  });
  $app.querySelector('[data-reset]').addEventListener('click', () => {
    if (!confirm('重置后回到出发基地，清空所有旅程、登机牌和收藏。确定？')) return;
    if (!confirm('再确认一次：重置存档（服务器仍保留备份文件）。')) return;
    const fresh = defaultState(pack.start_airport);
    fresh.settings = st.settings;
    Object.keys(st).forEach((k) => delete st[k]);
    Object.assign(st, fresh);
    save();
    toast('存档已重置');
    go('');
  });
  $app.querySelector('[data-import]').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      await importState(data.state || data);
      location.reload();
    } catch (err) {
      toast('导入失败：' + err.message);
    }
  });
  return {};
}

// --- boot ------------------------------------------------------------------------------------------

function themeNow() {
  const st = S();
  applyTheme(st.settings.theme, st.settings.home);
}

async function boot() {
  await loadPack();
  await loadState(P().start_airport);
  themeNow();
  pauseIfClosedSilently();
  resumeAfterReload();
  onExternalChange(() => {
    resumeAfterReload();
    route();
  });
  window.addEventListener('hashchange', route);
  window.addEventListener('pagehide', () => {
    const j = S().active;
    if (j?.stage === 'flying' && j.resumed_at != null) sendPauseBeacon(j.id);
  });
  window.addEventListener('pageshow', (e) => { if (e.persisted) location.reload(); });
  document.addEventListener('ff-save-error', (e) => toast(`存档没有写入：${e.detail}。请确认本地服务还在运行。`));
  let lastBeat = 0;
  setInterval(() => {
    advanceJourney();
    tickClock();
    current?.tick?.();
    const j = S().active;
    if (j?.stage === 'flying' && j.resumed_at != null && Date.now() - lastBeat >= HEARTBEAT_MS) {
      lastBeat = Date.now();
      sendHeartbeat(j.id);
    }
  }, 1000);
  setInterval(themeNow, 60000);
  setTimeout(refreshState, 1500);
  route();
  advanceJourney();
}

boot().catch((err) => {
  console.error(err);
  $app.innerHTML = `<div class="fatal"><h1>启动失败</h1><p>${esc(err.message)}</p><p class="dim">请用“Focus Flight.command”启动，并确认数据包 app/packs/index.json 存在。</p></div>`;
});
