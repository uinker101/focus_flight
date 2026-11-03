// Collection route map: a globe you can drag and zoom, with one arc per
// successful journey. Journeys between the same two airports fan out side by
// side (meeting again at the airports) instead of being drawn on top of each other.

import { createMap, C, FIRST_LABEL } from './basemap.js';

const RAD = Math.PI / 180;

const vec = (p) => [Math.cos(p.lat * RAD) * Math.cos(p.lon * RAD), Math.cos(p.lat * RAD) * Math.sin(p.lon * RAD), Math.sin(p.lat * RAD)];
const norm = (v) => { const l = Math.hypot(...v); return v.map((x) => x / l); };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/** Great circle from a to b pushed sideways by `off` radians, most at the middle and none at the ends. */
function arc(a, b, off, n = 64) {
  const A = vec(a);
  const B = vec(b);
  const d = Math.acos(Math.max(-1, Math.min(1, A[0] * B[0] + A[1] * B[1] + A[2] * B[2])));
  const side = norm(cross(A, B));
  const out = [];
  for (let k = 0; k <= n; k++) {
    const t = k / n;
    const s1 = Math.sin((1 - t) * d) / Math.sin(d);
    const s2 = Math.sin(t * d) / Math.sin(d);
    const push = off * Math.sin(Math.PI * t);
    const p = norm([0, 1, 2].map((i) => s1 * A[i] + s2 * B[i] + side[i] * push));
    let lon = Math.atan2(p[1], p[0]) / RAD;
    if (out.length) lon += Math.round((out[out.length - 1][0] - lon) / 360) * 360; // no jump at ±180°
    out.push([lon, Math.atan2(p[2], Math.hypot(p[0], p[1])) / RAD]);
  }
  return { coords: out, length: d };
}

/**
 * box: element to fill; routes: [{key, a, b, journeys: [id]}] with journeys oldest first;
 * airports: [{iata, city, lat, lon, visited}]; onHover(journeyId | null); onClick(journeyId).
 */
export class RouteMap {
  constructor(box, { routes, airports, onHover, onClick }) {
    this.ids = [];
    const features = [];
    for (const r of routes) {
      const [a, b] = r.a.iata < r.b.iata ? [r.a, r.b] : [r.b, r.a]; // same side whichever way it was flown
      const n = r.journeys.length;
      const { length } = arc(a, b, 0, 1);
      const gap = Math.min(0.022, 0.26 / Math.max(1, n - 1)) * length;
      r.journeys.forEach((jid, i) => {
        features.push({ type: 'Feature', id: this.ids.length, properties: { route: r.key }, geometry: { type: 'LineString', coordinates: arc(a, b, (i - (n - 1) / 2) * gap).coords } });
        this.ids.push(jid);
      });
    }
    this.byRoute = (key) => features.filter((f) => f.properties.route === key).map((f) => f.id);
    this.hot = [];

    // Opens on the whole globe, turned towards the airports flown to.
    const visited = airports.filter((a) => a.visited);
    const focus = visited.length ? visited : airports.slice(0, 1);
    const center = focus.length ? [focus.reduce((s, a) => s + a.lon, 0) / focus.length, focus.reduce((s, a) => s + a.lat, 0) / focus.length] : [114, 22];
    const zoom = Math.log2((0.8 * Math.max(240, box.clientHeight) * Math.PI) / 512);
    const map = this.map = createMap(box, { projection: 'globe', center, zoom, maxPitch: 0 });
    map.dragRotate.disable();
    map.touchZoomRotate.disableRotation();
    map.on('load', () => {
      map.addSource('journeys', { type: 'geojson', data: { type: 'FeatureCollection', features } });
      map.addLayer({
        id: 'journeys', type: 'line', source: 'journeys',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': ['case', ['boolean', ['feature-state', 'hot'], false], C.done, C.route],
          'line-width': ['interpolate', ['linear'], ['zoom'], 1, ['case', ['boolean', ['feature-state', 'hot'], false], 2.6, 1.4], 6, ['case', ['boolean', ['feature-state', 'hot'], false], 4, 2.2]],
          'line-opacity': 0.9,
        },
      }, FIRST_LABEL);
      // A wide invisible copy makes thin lines easy to point at.
      map.addLayer({ id: 'journeys-hit', type: 'line', source: 'journeys', paint: { 'line-width': 12, 'line-opacity': 0 } });
      map.addSource('airports', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: airports.map((a) => ({ type: 'Feature', properties: { visited: !!a.visited, label: a.visited ? `${a.city} ${a.iata}` : a.iata }, geometry: { type: 'Point', coordinates: [a.lon, a.lat] } })) },
      });
      map.addLayer({
        id: 'airports', type: 'circle', source: 'airports',
        paint: { 'circle-radius': ['case', ['get', 'visited'], 5, 3.5], 'circle-color': ['case', ['get', 'visited'], C.done, '#7c8794'], 'circle-stroke-width': 2, 'circle-stroke-color': '#ffffff' },
      });
      map.addLayer({
        id: 'airport-labels', type: 'symbol', source: 'airports',
        layout: {
          'text-field': ['get', 'label'], 'text-font': ['Noto Sans Medium'], 'text-size': ['case', ['get', 'visited'], 13, 11],
          'text-variable-anchor': ['left', 'right', 'top', 'bottom'], 'text-radial-offset': 0.7, 'symbol-sort-key': ['case', ['get', 'visited'], 0, 1],
        },
        paint: { 'text-color': '#1d2a38', 'text-halo-color': '#ffffff', 'text-halo-width': 1.4 },
      });
    });
    map.on('mousemove', 'journeys-hit', (e) => {
      map.getCanvas().style.cursor = 'pointer';
      const jid = this.ids[e.features[0].id];
      this.highlight([e.features[0].id]);
      onHover?.(jid);
    });
    map.on('mouseleave', 'journeys-hit', () => {
      map.getCanvas().style.cursor = '';
      this.highlight([]);
      onHover?.(null);
    });
    map.on('click', 'journeys-hit', (e) => onClick?.(this.ids[e.features[0].id]));
  }

  highlight(featureIds) {
    if (!this.map.getSource('journeys')) return;
    for (const id of this.hot) this.map.setFeatureState({ source: 'journeys', id }, { hot: false });
    for (const id of featureIds) this.map.setFeatureState({ source: 'journeys', id }, { hot: true });
    this.hot = featureIds;
    this.map.setPaintProperty('journeys', 'line-opacity', featureIds.length ? ['case', ['boolean', ['feature-state', 'hot'], false], 1, 0.3] : 0.9);
  }

  /** Highlight every journey on a route (key) or a single journey (id). */
  highlightRoute(key) { this.highlight(key ? this.byRoute(key) : []); }
  highlightJourney(jid) { this.highlight(jid ? [this.ids.indexOf(jid)] : []); }

  destroy() {
    this.map.remove();
  }
}
