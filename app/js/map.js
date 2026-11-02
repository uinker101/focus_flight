// Offline 2D map (Web Mercator) drawn on a canvas. Land and borders are
// prebuilt Path2D objects in world units, so each frame is just a transform.

import { greatCircle } from './sim.js';

const R = 1000; // world units per radian of longitude
export const WORLD_W = 2 * Math.PI * R;
const MAX_LAT = 82;
const RAD = Math.PI / 180;

export function project(lon, lat) {
  const la = Math.max(-MAX_LAT, Math.min(MAX_LAT, lat)) * RAD;
  return [lon * RAD * R, -Math.log(Math.tan(Math.PI / 4 + la / 2)) * R];
}

let worldPromise = null;

export function loadWorld() {
  worldPromise ||= fetch('/assets/map/world.json').then((r) => r.json()).then((w) => {
    const toPath = (lines, close) => {
      const path = new Path2D();
      for (const ring of lines) {
        for (let i = 0; i < ring.length; i += 2) {
          const [x, y] = project(ring[i], ring[i + 1]);
          if (i) path.lineTo(x, y);
          else path.moveTo(x, y);
        }
        if (close) path.closePath();
      }
      return path;
    };
    const graticule = [];
    for (let lon = -180; lon <= 180; lon += 10) graticule.push([lon, -80, lon, 80]);
    for (let lat = -80; lat <= 80; lat += 10) graticule.push([-180, lat, -90, lat, 0, lat, 90, lat, 180, lat]);
    return {
      src: w,
      land: toPath(w.land, true),
      borders: toPath(w.borders, false),
      graticule: toPath(graticule, false),
      places: w.places.map(([zh, en, lon, lat, rank, pop]) => {
        const [x, y] = project(lon, lat);
        return { name: zh || en, x, y, rank, pop };
      }),
    };
  });
  return worldPromise;
}

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

const MAP_COLORS = ['--map-ocean', '--map-land', '--map-border', '--map-coast', '--map-label', '--route-todo', '--accent', '--accent-2', '--text', '--panel'];

/** Reads the map colours into `into`; returns true if any changed. */
export function readColors(into) {
  let changed = false;
  for (const key of MAP_COLORS) {
    const v = cssVar(key);
    if (into[key] !== v) changed = true;
    into[key] = v;
  }
  return changed;
}

/** Haloed text label that skips itself if it would overlap a box in `placed` or fall off the canvas. */
export function drawLabel(ctx, w, h, text, x, y, { size = 12, weight = 500, color, halo, align = 'left', placed, pad = 2 }) {
  ctx.font = `${weight} ${size}px -apple-system, "PingFang SC", "Helvetica Neue", sans-serif`;
  const tw = ctx.measureText(text).width;
  const x0 = align === 'center' ? x - tw / 2 : x;
  const box = [x0 - pad, y - size - pad, x0 + tw + pad, y + pad + 2];
  if (placed && placed.some((b) => !(box[2] < b[0] || box[0] > b[2] || box[3] < b[1] || box[1] > b[3]))) return false;
  if (box[2] < 0 || box[0] > w || box[3] < 0 || box[1] > h) return false;
  placed?.push(box);
  ctx.lineWidth = 3;
  ctx.strokeStyle = halo;
  ctx.lineJoin = 'round';
  ctx.strokeText(text, x0, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x0, y);
  return true;
}

export const PLANE = new Path2D('M0,-15 C1.6,-15 2.2,-13 2.2,-10 L2.2,-4 L14,3 L14,5.6 L2.2,2 L2.2,9 L5.6,12 L5.6,14 L0,12.6 L-5.6,14 L-5.6,12 L-2.2,9 L-2.2,2 L-14,5.6 L-14,3 L-2.2,-4 L-2.2,-10 C-2.2,-13 -1.6,-15 0,-15 Z');

export class MapView {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.view = null;
    this.mode = 'route';
    this.padding = { top: 40, right: 40, bottom: 40, left: 40 };
    this.route = null;
    this.progress = 0;
    this.plane = null;
    this.routes = [];
    this.airports = [];
    this.dirty = true;
    this.colors = {};
    this.colorsAt = 0;
    this.running = false;
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(canvas);
  }

  async init() {
    this.world = await loadWorld();
    this.resize();
    this.running = true;
    const loop = (t) => {
      if (!this.running) return;
      this.frame(t);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    return this;
  }

  destroy() {
    this.running = false;
    this.ro.disconnect();
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.w = rect.width;
    this.h = rect.height;
    this.canvas.width = Math.max(1, Math.round(rect.width * dpr));
    this.canvas.height = Math.max(1, Math.round(rect.height * dpr));
    this.dpr = dpr;
    this.snap = true;
    this.dirty = true;
  }

  setPadding(p) {
    Object.assign(this.padding, p);
    this.dirty = true;
  }

  /** Current flight: origin/destination airports ({lat, lon, iata, city}). */
  setFlight(a, b) {
    const pts = greatCircle(a, b).map((p) => project(p.lon, p.lat));
    this.route = { a, b, pts };
    this.snap = true;
    this.dirty = true;
  }

  setPlane(pos, heading, fraction) {
    this.plane = { xy: project(pos.lon, pos.lat), heading };
    this.progress = fraction;
    this.dirty = true;
  }

  /** Completed routes for the collection map: [{a, b, count, key}] */
  setRoutes(routes, highlight = null) {
    this.routes = routes.map((r) => ({ ...r, pts: greatCircle(r.a, r.b, 48).map((p) => project(p.lon, p.lat)) }));
    this.highlight = highlight;
    this.dirty = true;
  }

  setHighlight(key) {
    this.highlight = key;
    this.dirty = true;
  }

  /** Airport markers: [{iata, city, lat, lon, kind: 'origin'|'dest'|'visited'|'other'}] */
  setAirports(list) {
    this.airports = list.map((a) => ({ ...a, xy: project(a.lon, a.lat) }));
    this.dirty = true;
  }

  setMode(mode) {
    this.mode = mode;
    this.dirty = true;
  }

  // --- view fitting ---------------------------------------------------------

  available() {
    const p = this.padding;
    return {
      w: Math.max(50, this.w - p.left - p.right),
      h: Math.max(50, this.h - p.top - p.bottom),
      ox: p.left + (this.w - p.left - p.right) / 2,
      oy: p.top + (this.h - p.top - p.bottom) / 2,
    };
  }

  fit(minx, miny, maxx, maxy, maxScale = 3) {
    const av = this.available();
    const s = Math.min(av.w / Math.max(1, maxx - minx), av.h / Math.max(1, maxy - miny), maxScale);
    return { cx: (minx + maxx) / 2, cy: (miny + maxy) / 2, s };
  }

  target() {
    const pts = this.route ? this.route.pts : this.routes.flatMap((r) => r.pts);
    if (this.mode === 'world' || !pts.length) {
      const midLon = pts.length ? pts[Math.floor(pts.length / 2)][0] : project(110, 0)[0];
      const [, top] = project(0, 72);
      const [, bottom] = project(0, -50);
      const t = this.fit(midLon - WORLD_W / 2, top, midLon + WORLD_W / 2, bottom);
      return t;
    }
    let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
    for (const [x, y] of pts.concat(this.airports.filter((a) => a.kind !== 'other').map((a) => a.xy))) {
      minx = Math.min(minx, x); maxx = Math.max(maxx, x);
      miny = Math.min(miny, y); maxy = Math.max(maxy, y);
    }
    const padX = (maxx - minx) * 0.18 + 40;
    const padY = (maxy - miny) * 0.18 + 40;
    return this.fit(minx - padX, miny - padY, maxx + padX, maxy + padY);
  }

  // --- drawing ----------------------------------------------------------------

  frame(now) {
    if (!this.world || !this.w) return;
    const goal = this.target();
    if (!this.view || this.snap) {
      this.view = { ...goal };
      this.snap = false;
      this.dirty = true;
    } else {
      const k = 0.12;
      const ds = Math.abs(Math.log(goal.s / this.view.s));
      const dx = Math.abs(goal.cx - this.view.cx) * this.view.s;
      const dy = Math.abs(goal.cy - this.view.cy) * this.view.s;
      if (ds > 0.002 || dx > 0.3 || dy > 0.3) {
        this.view.s = Math.exp(Math.log(this.view.s) + (Math.log(goal.s) - Math.log(this.view.s)) * k);
        this.view.cx += (goal.cx - this.view.cx) * k;
        this.view.cy += (goal.cy - this.view.cy) * k;
        this.dirty = true;
      }
    }
    if (now - this.colorsAt > 1000) {
      if (readColors(this.colors)) this.dirty = true;
      this.colorsAt = now;
    }
    if (!this.dirty) return;
    this.dirty = false;
    this.draw();
  }

  toScreen([x, y], shift = 0) {
    const av = this.available();
    return [(x + shift - this.view.cx) * this.view.s + av.ox, (y - this.view.cy) * this.view.s + av.oy];
  }

  draw() {
    const { ctx, view, colors: c } = this;
    const av = this.available();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = c['--map-ocean'];
    ctx.fillRect(0, 0, this.w, this.h);

    // Repeat the world horizontally when the view is wide enough to wrap.
    const shifts = [0];
    const halfW = this.w / 2 / view.s;
    if (view.cx - halfW < -WORLD_W / 2) shifts.push(-WORLD_W);
    if (view.cx + halfW > WORLD_W / 2) shifts.push(WORLD_W);

    for (const shift of shifts) {
      ctx.setTransform(this.dpr * view.s, 0, 0, this.dpr * view.s, this.dpr * ((shift - view.cx) * view.s + av.ox), this.dpr * (-view.cy * view.s + av.oy));
      ctx.lineJoin = 'round';
      ctx.strokeStyle = c['--map-coast'];
      ctx.globalAlpha = 0.35;
      ctx.lineWidth = 0.6 / view.s;
      ctx.stroke(this.world.graticule);
      ctx.globalAlpha = 1;
      ctx.fillStyle = c['--map-land'];
      ctx.fill(this.world.land);
      ctx.lineWidth = 0.8 / view.s;
      ctx.stroke(this.world.land);
      ctx.strokeStyle = c['--map-border'];
      ctx.lineWidth = 0.7 / view.s;
      ctx.setLineDash([3 / view.s, 2 / view.s]);
      ctx.stroke(this.world.borders);
      ctx.setLineDash([]);
    }
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    const placed = [];
    this.drawAirports(placed);
    this.drawPlaces(placed, shifts);
    this.drawRoutes();
    this.drawRoute();
    this.drawPlane();
  }

  label(text, x, y, opts) {
    return drawLabel(this.ctx, this.w, this.h, text, x, y, opts);
  }

  drawAirports(placed) {
    const { ctx, colors: c } = this;
    for (const a of this.airports) {
      const [x, y] = this.toScreen(a.xy);
      const major = a.kind === 'origin' || a.kind === 'dest';
      ctx.beginPath();
      ctx.arc(x, y, major ? 5 : 3.5, 0, Math.PI * 2);
      ctx.fillStyle = major ? c['--accent'] : a.kind === 'visited' ? c['--accent-2'] : c['--map-label'];
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = c['--map-land'];
      ctx.stroke();
      this.label(major ? `${a.city} ${a.iata}` : a.iata, x + 8, y + 4, {
        size: major ? 14 : 11, weight: major ? 700 : 600,
        color: c['--text'], halo: c['--map-land'], placed,
      });
    }
  }

  drawPlaces(placed, shifts) {
    const { ctx, colors: c, view } = this;
    const spanDeg = this.w / view.s / R / RAD;
    const maxRank = spanDeg < 25 ? 6 : spanDeg < 60 ? 4 : spanDeg < 150 ? 2 : 1;
    ctx.fillStyle = c['--map-label'];
    let count = 0;
    for (const p of this.world.places) {
      if (p.rank > maxRank) break;
      for (const shift of shifts) {
        const [x, y] = this.toScreen([p.x, p.y], shift);
        if (x < -20 || x > this.w + 20 || y < -10 || y > this.h + 10) continue;
        if (this.label(p.name, x + 5, y + 4, { size: 11, weight: 400, color: c['--map-label'], halo: c['--map-land'], placed })) {
          ctx.beginPath();
          ctx.arc(x, y, 1.8, 0, Math.PI * 2);
          ctx.fillStyle = c['--map-label'];
          ctx.fill();
          count++;
        }
      }
      if (count > 60) break;
    }
  }

  polyline(pts, from = 0, to = pts.length - 1) {
    const ctx = this.ctx;
    ctx.beginPath();
    for (let i = from; i <= to; i++) {
      const [x, y] = this.toScreen(pts[i]);
      if (i === from) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
  }

  drawRoutes() {
    const { ctx, colors: c } = this;
    for (const r of this.routes) {
      const hot = this.highlight === r.key;
      this.polyline(r.pts);
      ctx.strokeStyle = hot ? c['--accent-2'] : c['--accent'];
      ctx.globalAlpha = hot || !this.highlight ? 0.9 : 0.35;
      ctx.lineWidth = Math.min(6, 1.6 + r.count * 0.6) + (hot ? 1.5 : 0);
      ctx.lineCap = 'round';
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  drawRoute() {
    if (!this.route) return;
    const { ctx, colors: c } = this;
    const pts = this.route.pts;
    const n = pts.length - 1;
    const cut = Math.max(0, Math.min(n, Math.floor(this.progress * n)));
    ctx.lineCap = 'round';
    if (this.plane) {
      // Start the remaining line at the plane, not at the previous vertex.
      ctx.beginPath();
      ctx.moveTo(...this.toScreen(this.plane.xy));
      for (let i = cut + 1; i <= n; i++) ctx.lineTo(...this.toScreen(pts[i]));
    } else {
      this.polyline(pts, cut, n);
    }
    ctx.setLineDash([7, 7]);
    ctx.strokeStyle = c['--route-todo'];
    ctx.lineWidth = 2.2;
    ctx.stroke();
    ctx.setLineDash([]);
    if (this.plane && this.progress > 0) {
      this.polyline(pts, 0, cut);
      ctx.lineTo(...this.toScreen(this.plane.xy));
      ctx.strokeStyle = c['--accent-2'];
      ctx.lineWidth = 3.5;
      ctx.stroke();
    }
  }

  drawPlane() {
    if (!this.plane) return;
    const { ctx, colors: c } = this;
    const [x, y] = this.toScreen(this.plane.xy);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(this.plane.heading * RAD);
    ctx.scale(1.7, 1.7);
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = 6;
    ctx.shadowOffsetY = 2;
    ctx.fillStyle = c['--accent-2'];
    ctx.fill(PLANE);
    ctx.shadowColor = 'transparent';
    ctx.lineWidth = 0.8;
    ctx.strokeStyle = c['--panel'];
    ctx.stroke(PLANE);
    ctx.restore();
  }
}
