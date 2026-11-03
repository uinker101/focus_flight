// Offline MapLibre basemap shared by the flight map and the collection globe:
// an Apple-Maps-like light style on the local Protomaps tiles, hillshade from
// Mapterhorn elevation, and a smooth day/night shade with NASA city lights.
// All tiles come from server.py (/tiles/...), downloaded once by tools/fetch_map.py.

import * as maplibregl from 'maplibre-gl';
import { sunElevation, nightAmount } from './sun.js';

const RAD = Math.PI / 180;
const NIGHT_REFRESH_MS = 120000;
const LIGHTS_ZOOM = 5; // tools/fetch_map.py LIGHTS_MAXZOOM
const TILE = 256;
const GRID = 16;
const SHADE = [10, 22, 48];
const SHADE_ALPHA = 0.62;
const CJK = '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", "WenQuanYi Zen Hei", sans-serif';

export const C = {
  water: '#a3d0f0', land: '#f3f0e8', label: '#3d4246', halo: '#ffffff',
  route: '#2563a8', done: '#d97a14', todo: '#6f8399', space: '#0b1726',
};
/** Layer id the app's own lines go under, so place names stay on top. */
export const FIRST_LABEL = 'water_label';

const NAME = ['coalesce', ['get', 'name:zh-Hans'], ['get', 'name:en']];
// City names without the administrative 市 ("广州市" → "广州"), as on Apple Maps.
const CITY = ['let', 'n', ['coalesce', NAME, ''], ['case',
  ['==', ['slice', ['var', 'n'], ['-', ['length', ['var', 'n']], 1]], '市'],
  ['slice', ['var', 'n'], 0, ['-', ['length', ['var', 'n']], 1]],
  ['var', 'n']]];
const zoomed = (...stops) => ['interpolate', ['linear'], ['zoom'], ...stops];

function layers() {
  const src = (layer) => ({ source: 'base', 'source-layer': layer });
  const label = (color = C.label) => ({ 'text-color': color, 'text-halo-color': C.halo, 'text-halo-width': 1.2, 'text-halo-blur': 0.4 });
  return [
    { id: 'background', type: 'background', paint: { 'background-color': C.water } },
    { id: 'earth', type: 'fill', ...src('earth'), paint: { 'fill-color': C.land } },
    { id: 'landcover', type: 'fill', ...src('landcover'), paint: {
      'fill-color': ['match', ['get', 'kind'],
        'forest', '#cde3c1', 'grassland', '#dcebcb', 'scrub', '#e2e8cf', 'farmland', '#e8edd8',
        'barren', '#efe6d2', 'glacier', '#fbfcfd', 'urban_area', '#e8e4dc', C.land],
    } },
    { id: 'landuse_green', type: 'fill', ...src('landuse'),
      filter: ['in', ['get', 'kind'], ['literal', ['wood', 'forest', 'nature_reserve', 'national_park', 'protected_area', 'park', 'scrub', 'grassland', 'grass', 'golf_course']]],
      paint: { 'fill-color': '#c7e0b9', 'fill-opacity': zoomed(6, 0.25, 9, 0.7) } },
    { id: 'landuse_other', type: 'fill', ...src('landuse'), minzoom: 8,
      filter: ['in', ['get', 'kind'], ['literal', ['glacier', 'sand', 'beach', 'aerodrome']]],
      paint: { 'fill-color': ['match', ['get', 'kind'], 'glacier', '#fbfcfd', 'aerodrome', '#e3e1ea', '#f1e9d6'] } },
    { id: 'hillshade', type: 'hillshade', source: 'terrain', paint: {
      'hillshade-method': 'igor', 'hillshade-exaggeration': zoomed(2, 0.45, 8, 0.6),
      'hillshade-shadow-color': '#56685c', 'hillshade-highlight-color': '#ffffff', 'hillshade-illumination-anchor': 'map',
    } },
    { id: 'water', type: 'fill', ...src('water'), filter: ['==', ['geometry-type'], 'Polygon'], paint: { 'fill-color': C.water } },
    { id: 'rivers', type: 'line', ...src('water'), minzoom: 6,
      filter: ['all', ['==', ['geometry-type'], 'LineString'], ['in', ['get', 'kind'], ['literal', ['river', 'canal']]]],
      paint: { 'line-color': C.water, 'line-width': zoomed(6, 0.6, 10, 1.6) } },
    { id: 'boundaries_region', type: 'line', ...src('boundaries'), minzoom: 4, filter: ['>', ['get', 'kind_detail'], 2],
      paint: { 'line-color': '#c9bfb0', 'line-width': zoomed(4, 0.4, 8, 0.9), 'line-dasharray': [3, 2] } },
    { id: 'boundaries_country', type: 'line', ...src('boundaries'), filter: ['<=', ['get', 'kind_detail'], 2],
      paint: { 'line-color': '#a69e93', 'line-width': zoomed(2, 0.6, 8, 1.4) } },
    { id: 'roads_major', type: 'line', ...src('roads'), minzoom: 7, filter: ['==', ['get', 'kind'], 'major_road'],
      paint: { 'line-color': '#ddd5c6', 'line-width': zoomed(7, 0.3, 10, 1.1) } },
    { id: 'roads_highway', type: 'line', ...src('roads'), minzoom: 5, filter: ['==', ['get', 'kind'], 'highway'],
      paint: { 'line-color': '#f3c47a', 'line-width': zoomed(5, 0.3, 8, 1, 11, 2.2) } },
    { id: 'night', type: 'raster', source: 'night', paint: { 'raster-fade-duration': 1500, 'raster-resampling': 'linear' } },
    { id: FIRST_LABEL, type: 'symbol', ...src('water'), filter: ['in', ['get', 'kind'], ['literal', ['ocean', 'sea', 'bay', 'strait']]],
      layout: { 'text-field': NAME, 'text-font': ['Noto Sans Regular'], 'text-size': zoomed(2, 11, 8, 13), 'text-letter-spacing': 0.15, 'text-max-width': 6 },
      paint: label('#5f8fb8') },
    { id: 'places_region', type: 'symbol', ...src('places'), minzoom: 5, filter: ['==', ['get', 'kind'], 'region'],
      layout: { 'text-field': NAME, 'text-font': ['Noto Sans Regular'], 'text-size': 11, 'text-max-width': 6, 'symbol-sort-key': ['get', 'sort_key'] },
      paint: label('#9b9387') },
    // Towns appear about a zoom level after the tiles first carry them, as on Apple Maps.
    { id: 'places_locality', type: 'symbol', ...src('places'), filter: ['all', ['==', ['get', 'kind'], 'locality'], ['<=', ['get', 'min_zoom'], ['-', ['zoom'], 0.5]]],
      layout: {
        'text-field': CITY,
        'text-font': ['case', ['>=', ['get', 'population_rank'], 12], ['literal', ['Noto Sans Medium']], ['literal', ['Noto Sans Regular']]],
        'text-size': zoomed(3, ['case', ['>=', ['get', 'population_rank'], 13], 12, 10], 7, ['case', ['>=', ['get', 'population_rank'], 12], 15, 12], 10, ['case', ['>=', ['get', 'population_rank'], 10], 16, 13]),
        'icon-image': 'dot',
        'text-variable-anchor': ['left', 'right', 'top', 'bottom'],
        'text-radial-offset': 0.5,
        'text-padding': 4,
        'symbol-sort-key': ['get', 'sort_key'],
      },
      paint: label() },
    { id: 'places_country', type: 'symbol', ...src('places'), maxzoom: 7, filter: ['==', ['get', 'kind'], 'country'],
      layout: { 'text-field': NAME, 'text-font': ['Noto Sans Medium'], 'text-size': zoomed(2, 11, 6, 15), 'text-max-width': 6, 'text-letter-spacing': 0.1, 'symbol-sort-key': ['get', 'sort_key'] },
      paint: label('#7d756b') },
  ];
}

function style(projection) {
  const origin = location.origin;
  return {
    version: 8,
    projection: { type: projection },
    sky: sky(0),
    glyphs: `${origin}/assets/map/fonts/{fontstack}/{range}.pbf`,
    sources: {
      base: { type: 'vector', url: `${origin}/tiles/base.json` },
      terrain: { type: 'raster-dem', url: `${origin}/tiles/terrain.json`, encoding: 'terrarium', tileSize: 512 },
      night: { type: 'raster', tiles: [nightUrl()], tileSize: TILE, maxzoom: 8, attribution: 'NASA Black Marble' },
    },
    layers: layers(),
  };
}

function mix(a, b, t) {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (shift) => Math.round(((pa >> shift) & 255) * (1 - t) + ((pb >> shift) & 255) * t);
  return `rgb(${ch(16)}, ${ch(8)}, ${ch(0)})`;
}

/** Sky above the horizon when the map is tilted, darker the darker it is at the map centre (t = 0 day … 1 night). */
function sky(t) {
  return {
    'sky-color': mix('#9ccaee', '#0b1726', t), 'horizon-color': mix('#e3eff9', '#22344a', t), 'fog-color': mix('#e3eff9', '#22344a', t),
    'sky-horizon-blend': 0.6, 'horizon-fog-blend': 0.7, 'fog-ground-blend': 0.6,
    'atmosphere-blend': zoomed(0, 1, 5, 1, 7, 0),
  };
}

// --- day/night shade -----------------------------------------------------------------------------

function nightUrl() {
  return `night://{z}/{x}/{y}?t=${Math.floor(Date.now() / NIGHT_REFRESH_MS) * NIGHT_REFRESH_MS}`;
}

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const tileLat = (y, z) => Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / 2 ** z))) / RAD;
const tileLon = (x, z) => (x / 2 ** z) * 360 - 180;

const lightsCache = new Map();
let mosaic = null;
let scratch = null;

function lightsTile(z, x, y) {
  const key = `${z}/${x}/${y}`;
  if (!lightsCache.has(key)) {
    lightsCache.set(key, fetch(`/tiles/lights/${key}`)
      .then((r) => (r.status === 200 ? r.blob().then((b) => createImageBitmap(b)) : null))
      .catch(() => null));
    if (lightsCache.size > 96) lightsCache.delete(lightsCache.keys().next().value);
  }
  return lightsCache.get(key);
}

/**
 * RGBA of the city lights under tile z/x/y, enlarged from the most detailed
 * downloaded level. The neighbouring tiles are drawn around it first so the
 * enlarged lights blend across tile edges instead of being cut off there.
 */
async function lightsPixels(z, x, y) {
  const lz = Math.min(z, LIGHTS_ZOOM);
  const s = 2 ** (z - lz);
  const n = 2 ** lz;
  const px = Math.floor(x / s);
  const py = Math.floor(y / s);
  const around = [-1, 0, 1].flatMap((dy) => [-1, 0, 1].map((dx) => [dx, dy]));
  const imgs = await Promise.all(around.map(([dx, dy]) => (py + dy < 0 || py + dy >= n ? null : lightsTile(lz, (px + dx + n) % n, py + dy))));
  if (!imgs[4]) return null;
  mosaic ||= new OffscreenCanvas(3 * TILE, 3 * TILE).getContext('2d');
  scratch ||= new OffscreenCanvas(TILE, TILE).getContext('2d', { willReadFrequently: true });
  mosaic.clearRect(0, 0, 3 * TILE, 3 * TILE);
  around.forEach(([dx, dy], i) => imgs[i] && mosaic.drawImage(imgs[i], (dx + 1) * TILE, (dy + 1) * TILE, TILE, TILE));
  const part = TILE / s; // source pixels across this tile
  const k = TILE / part; // screen pixels per source pixel
  scratch.clearRect(0, 0, TILE, TILE);
  scratch.drawImage(mosaic.canvas, TILE + (x % s) * part - 1, TILE + (y % s) * part - 1, part + 2, part + 2, -k, -k, TILE + 2 * k, TILE + 2 * k);
  return scratch.getImageData(0, 0, TILE, TILE).data;
}

/**
 * One tile of the night layer for time t: darkens smoothly from the sun 3° above
 * the horizon to 8° below (about 1200 km on the ground), and lets the city
 * lights come through once it is properly dark.
 */
async function nightTile({ url }) {
  const [z, x, y, t] = url.match(/^night:\/\/(\d+)\/(\d+)\/(\d+)\?t=(\d+)$/).slice(1).map(Number);
  // The sun's elevation changes slowly across a tile, so a coarse grid is interpolated.
  const W = GRID + 1;
  const g = new Float32Array(W * W);
  for (let j = 0; j <= GRID; j++) {
    for (let i = 0; i <= GRID; i++) g[j * W + i] = sunElevation(t, tileLat(y + j / GRID, z), tileLon(x + i / GRID, z));
  }
  if (Math.min(...g) > 3) return { data: null }; // all daylight
  const lights = await lightsPixels(z, x, y);
  const out = new ImageData(TILE, TILE);
  const d = out.data;
  for (let py = 0; py < TILE; py++) {
    const gy = (py / TILE) * GRID;
    const j = Math.floor(gy);
    const fy = gy - j;
    for (let px = 0; px < TILE; px++) {
      const gx = (px / TILE) * GRID;
      const i = Math.floor(gx);
      const fx = gx - i;
      const k0 = j * W + i;
      const e = (g[k0] * (1 - fx) + g[k0 + 1] * fx) * (1 - fy) + (g[k0 + W] * (1 - fx) + g[k0 + W + 1] * fx) * fy;
      const shade = smooth(3, -8, e) * SHADE_ALPHA;
      if (shade <= 0) continue;
      const k = (py * TILE + px) * 4;
      const lum = lights ? Math.max(lights[k], lights[k + 1], lights[k + 2]) / 255 : 0;
      const glow = smooth(-2, -9, e) * smooth(0.12, 0.65, lum);
      const a = glow + shade * (1 - glow);
      for (let c = 0; c < 3; c++) {
        const light = lights ? Math.min(255, lights[k + c] * 1.35 + 20) : 0;
        d[k + c] = (light * glow + SHADE[c] * shade * (1 - glow)) / a;
      }
      d[k + 3] = a * 255;
    }
  }
  return { data: await createImageBitmap(out) };
}

let protocolAdded = false;

function dotImage() {
  const size = 14;
  const c = new OffscreenCanvas(size, size).getContext('2d');
  c.beginPath();
  c.arc(size / 2, size / 2, 3.6, 0, Math.PI * 2);
  c.fillStyle = '#5b6470';
  c.fill();
  c.lineWidth = 2;
  c.strokeStyle = '#ffffff';
  c.stroke();
  return c.getImageData(0, 0, size, size);
}

/**
 * A MapLibre map on the offline basemap. projection: 'mercator' | 'globe'.
 * The night shade refreshes every two minutes while the map exists.
 */
export function createMap(container, { projection = 'mercator', ...options } = {}) {
  if (!protocolAdded) {
    maplibregl.addProtocol('night', nightTile);
    protocolAdded = true;
  }
  const map = new maplibregl.Map({
    container,
    style: style(projection),
    attributionControl: { compact: true },
    localIdeographFontFamily: CJK,
    fadeDuration: 150,
    ...options,
  });
  map.setMissingStyleImageResolver((id) => {
    if (id === 'dot' && !map.hasImage('dot')) map.addImage('dot', dotImage(), { pixelRatio: 2 });
  });
  const refresh = () => {
    const c = map.getCenter();
    map.setSky(sky(nightAmount(Date.now(), c.lat, c.lng)));
  };
  map.once('load', () => {
    refresh();
    map.on('moveend', refresh);
  });
  const timer = setInterval(() => {
    map.getSource('night')?.setTiles([nightUrl()]);
    refresh();
  }, NIGHT_REFRESH_MS);
  map.on('remove', () => clearInterval(timer));
  fetch('/tiles/base.json').then((r) => {
    if (!r.ok) container.insertAdjacentHTML('beforeend', '<div class="map-missing">地图数据还没下载。在终端运行 <code>python3 tools/fetch_map.py</code>，或重新双击 Focus Flight.command。</div>');
  });
  return map;
}

export { maplibregl };
