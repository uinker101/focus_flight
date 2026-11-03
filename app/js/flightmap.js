// Flight map (PTV): one MapLibre map for the three views — the whole route,
// the globe, and following the aircraft — on the offline basemap with the
// day/night shade. Following works like an airline moving map: drag to turn
// 360° and tilt, wheel or pinch to zoom around the aircraft, compass for
// north-up, and the aircraft keeps one on-screen size whatever the zoom, as the
// 2D icon or a 3D model (aircraft3d.js, loaded the first time it is shown).

import { createMap, maplibregl, C, FIRST_LABEL } from './basemap.js';
import { greatCircle, interpolate } from './sim.js';

const RAD = Math.PI / 180;
const TILT = 58; // default view of the 3D model, from behind and above
const MAX_TILT = 72;
const FOLLOW_KM = 700; // map height shown when following starts
const PLANE = new Path2D('M0,-15 C1.6,-15 2.2,-13 2.2,-10 L2.2,-4 L14,3 L14,5.6 L2.2,2 L2.2,9 L5.6,12 L5.6,14 L0,12.6 L-5.6,14 L-5.6,12 L-2.2,9 L-2.2,2 L-14,5.6 L-14,3 L-2.2,-4 L-2.2,-10 C-2.2,-13 -1.6,-15 0,-15 Z');
const ICON_PX = 64; // CSS size of the plane image at icon-size 1

function planeImage() {
  const c = new OffscreenCanvas(128, 128).getContext('2d');
  c.translate(64, 64);
  c.scale(3.4, 3.4);
  c.shadowColor = 'rgba(0,0,0,0.35)';
  c.shadowBlur = 6;
  c.shadowOffsetY = 2;
  c.fillStyle = C.done;
  c.fill(PLANE);
  c.shadowColor = 'transparent';
  c.lineWidth = 0.8;
  c.strokeStyle = '#ffffff';
  c.stroke(PLANE);
  return c.getImageData(0, 0, 128, 128);
}

/** Longitudes made continuous so a line crossing ±180° doesn't jump across the map. */
function unwrap(points) {
  const out = [];
  for (const p of points) {
    let lon = p.lon;
    if (out.length) lon += Math.round((out[out.length - 1][0] - lon) / 360) * 360;
    out.push([lon, p.lat]);
  }
  return out;
}

const line = (coordinates) => ({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates } });
const point = (coordinates, properties = {}) => ({ type: 'Feature', properties, geometry: { type: 'Point', coordinates } });

export class FlightMap {
  /**
   * box: element to fill; origin/destination: airports; model: file name in
   * /assets/aircraft or null; style: '2d' | '3d'; onCompass(deg): where north
   * points on screen, clockwise from up.
   */
  constructor(box, { origin, destination, model, style, onCompass }) {
    this.box = box;
    this.o = origin;
    this.d = destination;
    this.modelFile = model;
    this.style = style;
    this.mode = 'route';
    this.pad = { top: 0, right: 0, bottom: 0, left: 0 };
    this.state = null;
    this.route = unwrap(greatCircle(origin, destination));
    this.mid = interpolate(origin, destination, 0.5);

    const map = this.map = createMap(box, {
      center: [origin.lon, origin.lat], zoom: 3, maxPitch: 0,
      attributionControl: false, canvasContextAttributes: { antialias: true },
      dragPan: false, dragRotate: false, keyboard: false, doubleClickZoom: false, boxZoom: false, touchPitch: false,
      scrollZoom: false, touchZoomRotate: false,
    });
    map.on('load', () => this.onLoad());
    map.on('rotate', () => onCompass?.(-map.getBearing()));
    map.on('resize', () => this.mode !== 'follow' && this.frame(false));
    map.on('moveend', () => this.recenter());
    this.bindDrag();
  }

  onLoad() {
    const map = this.map;
    map.addImage('plane', planeImage(), { pixelRatio: 2 });
    map.addSource('todo', { type: 'geojson', data: line(this.route) });
    map.addSource('done', { type: 'geojson', data: line([]) });
    map.addSource('plane', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addSource('airports', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [this.o, this.d].map((a) => point([a.lon, a.lat], { label: `${a.city} ${a.iata}` })) },
    });
    map.addLayer({ id: 'todo', type: 'line', source: 'todo', layout: { 'line-cap': 'round' }, paint: { 'line-color': C.todo, 'line-width': 2.2, 'line-dasharray': [3, 3] } }, FIRST_LABEL);
    map.addLayer({ id: 'done', type: 'line', source: 'done', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': C.done, 'line-width': 3.5 } }, FIRST_LABEL);
    map.addLayer({ id: 'airports', type: 'circle', source: 'airports', paint: { 'circle-radius': 5.5, 'circle-color': C.route, 'circle-stroke-width': 2, 'circle-stroke-color': '#ffffff' } });
    // The plane icon also keeps place names off the aircraft (it is only made invisible under the 3D model).
    map.addLayer({
      id: 'plane', type: 'symbol', source: 'plane',
      layout: { 'icon-image': 'plane', 'icon-rotate': ['get', 'heading'], 'icon-rotation-alignment': 'map', 'icon-pitch-alignment': 'map', 'icon-allow-overlap': true },
    });
    // Topmost symbols are placed first, so the airport names win over the aircraft and place names.
    map.addLayer({
      id: 'airport-labels', type: 'symbol', source: 'airports',
      layout: { 'text-field': ['get', 'label'], 'text-font': ['Noto Sans Medium'], 'text-size': 14, 'text-variable-anchor': ['left', 'right', 'top', 'bottom'], 'text-radial-offset': 0.8 },
      paint: { 'text-color': '#0f1d2b', 'text-halo-color': '#ffffff', 'text-halo-width': 1.6 },
    });
    this.loaded = true;
    this.update();
    this.frame(false);
    this.applyStyle();
  }

  setPadding(p) {
    Object.assign(this.pad, p);
    this.map.setPadding(this.pad);
    if (this.loaded) this.frame(false);
  }

  setPlane(pos, heading, sm) {
    this.state = { lon: pos.lon, lat: pos.lat, heading, fraction: sm.fraction, alt: Math.min(1, sm.altM / 11000), phase: sm.phase };
    this.update();
  }

  update() {
    if (!this.loaded || !this.state) return;
    const s = this.state;
    const pts = this.route;
    const n = pts.length - 1;
    const cut = Math.max(0, Math.min(n, Math.floor(s.fraction * n)));
    // The flown line ends at the aircraft and the rest starts there.
    const here = pts[cut];
    const at = [s.lon + Math.round((here[0] - s.lon) / 360) * 360, s.lat];
    this.map.getSource('done').setData(line([...pts.slice(0, cut + 1), at]));
    this.map.getSource('todo').setData(line([at, ...pts.slice(cut + 1)]));
    this.map.getSource('plane').setData(point(at, { heading: s.heading }));
    this.at = at;
    this.recenter();
    this.aircraft?.set(s, this.planePx());
    this.map.triggerRepaint();
  }

  /** Keeps the aircraft in the middle while following, except during a camera animation (it catches up at the end). */
  recenter() {
    if (this.mode !== 'follow' || !this.at || this.map.isMoving()) return;
    const c = this.map.getCenter();
    const dLon = ((((c.lng - this.at[0]) % 360) + 540) % 360) - 180;
    if (Math.abs(dLon) > 1e-7 || Math.abs(c.lat - this.at[1]) > 1e-7) this.map.setCenter(this.at);
  }

  /** Aircraft size on screen in the follow view, as in airline moving maps. */
  planePx() {
    return Math.max(100, Math.min(190, (this.map.getContainer().clientHeight - this.pad.top - this.pad.bottom) * 0.24));
  }

  /** Zoom at which `km` of map fills the height of the screen at the aircraft. */
  zoomFor(km) {
    const lat = this.state ? this.state.lat : this.o.lat;
    return Math.log2((40075016.686 * Math.cos(lat * RAD) * this.map.getContainer().clientHeight) / (512 * km * 1000));
  }

  tiltable() {
    return this.style === '3d' && !!this.modelFile;
  }

  setMode(mode) {
    this.mode = mode;
    if (this.loaded) {
      this.frame(true);
      this.applyStyle();
    }
  }

  /** Put the camera where the current view wants it. */
  frame(animate) {
    const map = this.map;
    const duration = animate ? 900 : 0;
    const follow = this.mode === 'follow';
    map.scrollZoom[follow ? 'enable' : 'disable']({ around: 'center' });
    map.touchZoomRotate[follow ? 'enable' : 'disable']({ around: 'center' });
    map.getCanvas().style.cursor = follow ? 'grab' : '';
    map.setMinZoom(follow ? this.zoomFor(7000) : null);
    map.setMaxZoom(follow ? this.zoomFor(40) : null);
    map.setMaxPitch(follow && this.tiltable() ? MAX_TILT : 0);
    map.setProjection({ type: this.mode === 'world' ? 'globe' : 'mercator' });
    if (this.mode === 'route') {
      const b = new maplibregl.LngLatBounds();
      for (const p of this.route) b.extend(p);
      map.fitBounds(b, { padding: 40, bearing: 0, pitch: 0, maxZoom: 7, duration });
    } else if (this.mode === 'world') {
      const h = map.getContainer().clientHeight - this.pad.top - this.pad.bottom;
      // Globe about 85% of the free height.
      map.easeTo({ center: [this.mid.lon, this.mid.lat], zoom: Math.log2((0.85 * Math.max(200, h) * Math.PI) / 512), bearing: 0, pitch: 0, duration });
    } else {
      const s = this.state || { lon: this.o.lon, lat: this.o.lat, heading: 0 };
      map.easeTo({ center: [s.lon, s.lat], zoom: this.zoomFor(FOLLOW_KM), bearing: s.heading, pitch: this.tiltable() ? TILT : 0, duration });
    }
  }

  setStyle(style) {
    this.style = style;
    if (!this.loaded) return;
    if (this.mode === 'follow') {
      this.map.setMaxPitch(this.tiltable() ? MAX_TILT : 0);
      this.map.easeTo({ pitch: this.tiltable() ? TILT : 0, duration: 400 });
    }
    this.applyStyle();
  }

  applyStyle() {
    const three = this.mode === 'follow' && this.tiltable();
    if (three && !this.aircraftReady) {
      this.aircraftReady = import('./aircraft3d.js').then(({ AircraftLayer }) => {
        this.aircraft = new AircraftLayer(this.modelFile, () => this.applyStyle());
        this.aircraft.set(this.state, this.planePx());
        this.map.addLayer(this.aircraft);
      });
    }
    const shown = three && !!this.aircraft?.ready;
    this.aircraft?.show(shown);
    const iconPx = this.mode === 'follow' ? this.planePx() * 0.7 : ICON_PX * 0.75;
    this.map.setLayoutProperty('plane', 'icon-size', iconPx / ICON_PX);
    this.map.setPaintProperty('plane', 'icon-opacity', shown ? 0 : 1);
    this.map.triggerRepaint();
  }

  northUp() {
    this.map.easeTo({ bearing: 0, duration: 500 });
  }

  /** In the follow view a drag turns the map round the aircraft (sideways) and tilts it (up and down). */
  bindDrag() {
    const el = this.map.getCanvasContainer();
    let drag = null;
    el.addEventListener('pointerdown', (e) => {
      if (this.mode !== 'follow' || e.button !== 0 || !e.isPrimary) return;
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY, bearing: this.map.getBearing(), pitch: this.map.getPitch() };
      el.setPointerCapture(e.pointerId);
      this.map.getCanvas().style.cursor = 'grabbing';
    });
    el.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      this.map.jumpTo({ bearing: drag.bearing - (e.clientX - drag.x) * 0.4, pitch: Math.max(0, drag.pitch - (e.clientY - drag.y) * 0.3) });
    });
    const end = (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      drag = null;
      this.map.getCanvas().style.cursor = this.mode === 'follow' ? 'grab' : '';
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }

  destroy() {
    this.map.remove();
  }
}
