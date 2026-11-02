// "Follow the aircraft" view in 3D, modelled on airline moving-map systems: the
// same flat Mercator map as map.js, an orbit camera around the aircraft (drag to
// turn 360° and tilt, wheel or pinch to zoom, compass for north-up) and the
// aircraft kept at one on-screen size whatever the zoom, as a 3D model or the
// 2D icon. Draws only when something changed, so a long flight leaves the GPU idle.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { project, loadWorld, readColors, drawLabel, PLANE, WORLD_W } from './map.js';
import { greatCircle } from './sim.js';

const RAD = Math.PI / 180;
const R = WORLD_W / (2 * Math.PI); // map units per radian of longitude
const KM_PER_UNIT = 6371 / R; // at the equator; Mercator shrinks it by cos(latitude)
const FOV = 40;
const TAN = Math.tan((FOV / 2) * RAD);
const PITCH = { takeoff: 8, climb: 5, descent: -2, approach: -1, landing: 3 };
const TILT = 58 * RAD; // default view of the 3D model, from behind and above
const MAX_TILT = 72 * RAD;
const TOP_DOWN = 1e-6; // straight down, but keeps the compass direction

let groundPromise = null;

/** Land, lakes, coastlines, borders and graticule geometry, built once per page. */
function loadGround() {
  groundPromise ||= loadWorld().then((world) => {
    const land = [];
    const lakes = [];
    for (const ring of world.src.land) {
      const pts = [];
      for (let i = 0; i < ring.length; i += 2) pts.push(new THREE.Vector2(...project(ring[i], ring[i + 1])));
      // Holes (the Caspian) are wound the other way round; they are painted in ocean colour on top.
      (THREE.ShapeUtils.isClockWise(pts) ? lakes : land).push(new THREE.Shape(pts));
    }
    const graticule = [];
    for (let lon = -180; lon <= 180; lon += 10) graticule.push([lon, -80, lon, 80]);
    for (let lat = -80; lat <= 80; lat += 10) graticule.push([-180, lat, -90, lat, 0, lat, 90, lat, 180, lat]);
    // Map (x, y) lies on the ground as (x, 0, y): east is +x, north is −z.
    const flat = (shapes) => new THREE.ShapeGeometry(shapes).rotateX(Math.PI / 2);
    return {
      world,
      land: flat(land),
      lakes: flat(lakes),
      coast: segments(world.src.land),
      borders: segments(world.src.borders),
      graticule: segments(graticule),
    };
  });
  return groundPromise;
}

function segments(lines) {
  const pos = [];
  for (const line of lines) {
    for (let i = 2; i < line.length; i += 2) {
      const [x0, y0] = project(line[i - 2], line[i - 1]);
      const [x1, y1] = project(line[i], line[i + 1]);
      pos.push(x0, 0, y0, x1, 0, y1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return g;
}

function canvasTexture(size, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  draw(canvas.getContext('2d'));
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class FollowView {
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
    this.onCompass = onCompass;
    this.pad = { top: 0, right: 0, bottom: 0, left: 0 };
    this.colors = {};
    this.state = null;
    this.visible = false;
    this.raf = 0;
    this.w = 0;
    this.h = 0;
    this.v = new THREE.Vector3();

    this.renderer = new THREE.WebGLRenderer({ antialias: true, stencil: true });
    this.renderer.autoClear = false;
    this.renderer.setPixelRatio(window.devicePixelRatio || 1);
    this.overlay = document.createElement('canvas');
    this.octx = this.overlay.getContext('2d');
    box.append(this.renderer.domElement, this.overlay);

    this.camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 1000);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    Object.assign(this.controls, {
      enablePan: false,
      enableDamping: true,
      dampingFactor: 0.12,
      rotateSpeed: 0.6,
      minPolarAngle: 0,
      maxPolarAngle: this.tiltable() ? MAX_TILT : 0,
    });
    this.controls.addEventListener('change', () => this.requestRender());
    this.controls.addEventListener('start', () => { this.turningNorth = false; });

    // Flat map layers, drawn strictly in renderOrder without depth testing.
    this.ground = new THREE.Scene();
    this.ground.fog = new THREE.Fog(0, 1, 2);
    // The aircraft model, drawn afterwards with its own depth buffer.
    this.air = new THREE.Scene();
    this.air.add(new THREE.HemisphereLight(0xffffff, 0x8899aa, 2.2));
    const sun = new THREE.DirectionalLight(0xffffff, 2.2);
    sun.position.set(0.5, 1, 0.35);
    this.air.add(sun);

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(box);
  }

  async init() {
    const g = await loadGround();
    this.world = g.world;
    const m = this.mats = {
      graticule: new THREE.LineBasicMaterial({ opacity: 0.35 }),
      land: new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
      lakes: new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
      coast: new THREE.LineBasicMaterial(),
      borders: new THREE.LineBasicMaterial({ opacity: 0.8 }),
      dot: new THREE.SpriteMaterial({ sizeAttenuation: false }),
      todo: new LineMaterial({ linewidth: 2.2, dashed: true, dashSize: 7, gapSize: 7 }),
      done: new LineMaterial({ linewidth: 3.5 }),
      shadow: new THREE.MeshBasicMaterial({
        color: 0x000000, opacity: 0.16,
        // Each pixel once, so overlapping parts of the flattened model don't darken.
        stencilWrite: true, stencilRef: 1, stencilFunc: THREE.NotEqualStencilFunc, stencilZPass: THREE.ReplaceStencilOp,
      }),
      icon: new THREE.SpriteMaterial({ sizeAttenuation: false }),
    };
    for (const mat of Object.values(m)) Object.assign(mat, { transparent: true, depthTest: false, depthWrite: false, fog: true });

    const map = new THREE.Group();
    const layer = (obj, order) => { obj.renderOrder = order; map.add(obj); };
    layer(new THREE.LineSegments(g.graticule, m.graticule), 1);
    layer(new THREE.Mesh(g.land, m.land), 2);
    layer(new THREE.Mesh(g.lakes, m.lakes), 3);
    layer(new THREE.LineSegments(g.coast, m.coast), 4);
    layer(new THREE.LineSegments(g.borders, m.borders), 5);
    for (const shift of [-WORLD_W, 0, WORLD_W]) {
      const copy = shift ? map.clone() : map;
      copy.position.x = shift;
      this.ground.add(copy);
    }

    this.dots = [this.o, this.d].map((a) => {
      const s = new THREE.Sprite(m.dot);
      const [x, y] = project(a.lon, a.lat);
      s.position.set(x, 0, y);
      s.renderOrder = 6;
      this.ground.add(s);
      return s;
    });
    this.route = greatCircle(this.o, this.d).map((p) => project(p.lon, p.lat));
    this.todo = new Line2(new LineGeometry(), m.todo);
    this.done = new Line2(new LineGeometry(), m.done);
    this.todo.renderOrder = 7;
    this.done.renderOrder = 8;
    // The 2D icon faces the screen and is turned to point along the route as it appears on screen.
    this.icon = new THREE.Sprite(m.icon);
    this.icon.renderOrder = 10;
    this.ground.add(this.todo, this.done, this.icon);

    this.applyColors();
    this.resize();
    this.update();
    this.applyStyle();
    if (this.modelFile) this.loadModel();
  }

  async loadModel() {
    const gltf = await new GLTFLoader().loadAsync(`/assets/aircraft/${this.modelFile}.glb`);
    const body = gltf.scene;
    const box = new THREE.Box3().setFromObject(body);
    const size = box.getSize(new THREE.Vector3());
    const c = box.getCenter(new THREE.Vector3());
    body.position.set(-c.x, -box.min.y, -c.z); // centred, wheels at y = 0; the models' noses point to −z
    const unit = new THREE.Group();
    unit.add(body);
    unit.scale.setScalar(1 / Math.max(size.x, size.z)); // longest side = 1, scaled per frame
    this.model = new THREE.Group();
    this.model.rotation.order = 'YXZ';
    this.model.add(unit);
    this.air.add(this.model);
    const ghost = unit.clone();
    ghost.traverse((o) => { if (o.isMesh) o.material = this.mats.shadow; });
    this.shadow = new THREE.Group();
    this.shadow.renderOrder = 9; // a group's renderOrder sorts all its meshes together
    this.shadow.add(ghost);
    this.ground.add(this.shadow);
    this.applyStyle();
    this.requestRender();
  }

  /** Only the 3D model can be seen at an angle; the 2D icon view stays top-down like a paper map. */
  tiltable() {
    return this.style === '3d' && !!this.modelFile;
  }

  setStyle(style) {
    this.style = style;
    this.applyStyle();
    this.controls.maxPolarAngle = this.tiltable() ? MAX_TILT : 0;
    if (this.placed) {
      const t = this.controls.target;
      const offset = this.camera.position.clone().sub(t);
      const sph = new THREE.Spherical().setFromVector3(offset);
      sph.phi = this.tiltable() ? TILT : TOP_DOWN;
      this.camera.position.copy(t).add(offset.setFromSpherical(sph));
      this.controls.update();
    }
    this.requestRender();
  }

  applyStyle() {
    const three = this.style === '3d' && !!this.model;
    if (this.model) this.model.visible = this.shadow.visible = three;
    if (this.icon) this.icon.visible = !three;
  }

  applyColors() {
    if (!readColors(this.colors)) return false;
    const c = this.colors;
    const m = this.mats;
    this.renderer.setClearColor(c['--map-ocean']);
    this.ground.fog.color.set(c['--map-ocean']);
    m.graticule.color.set(c['--map-coast']);
    m.land.color.set(c['--map-land']);
    m.lakes.color.set(c['--map-ocean']);
    m.coast.color.set(c['--map-coast']);
    m.borders.color.set(c['--map-border']);
    m.todo.color.set(c['--route-todo']);
    m.done.color.set(c['--accent-2']);
    m.dot.map?.dispose();
    m.dot.map = canvasTexture(32, (x) => {
      x.beginPath();
      x.arc(16, 16, 11, 0, Math.PI * 2);
      x.fillStyle = c['--accent'];
      x.fill();
      x.lineWidth = 4;
      x.strokeStyle = c['--map-land'];
      x.stroke();
    });
    m.icon.map?.dispose();
    m.icon.map = canvasTexture(128, (x) => {
      x.translate(64, 64);
      x.scale(3.4, 3.4);
      x.shadowColor = 'rgba(0,0,0,0.35)';
      x.shadowBlur = 6;
      x.shadowOffsetY = 2;
      x.fillStyle = c['--accent-2'];
      x.fill(PLANE);
      x.shadowColor = 'transparent';
      x.lineWidth = 0.8;
      x.strokeStyle = c['--panel'];
      x.stroke(PLANE);
    });
    m.dot.needsUpdate = m.icon.needsUpdate = true;
    return true;
  }

  resize() {
    const r = this.box.getBoundingClientRect();
    this.w = r.width;
    this.h = r.height;
    if (!this.w || !this.h) return;
    this.dpr = window.devicePixelRatio || 1;
    this.renderer.setSize(this.w, this.h, false);
    this.overlay.width = Math.round(this.w * this.dpr);
    this.overlay.height = Math.round(this.h * this.dpr);
    this.camera.aspect = this.w / this.h;
    this.applyPadding();
    this.mats?.todo.resolution.set(this.w, this.h);
    this.mats?.done.resolution.set(this.w, this.h);
    this.requestRender();
  }

  /** Screen space kept clear by the panels; the aircraft sits in the middle of the rest. */
  setPadding(p) {
    Object.assign(this.pad, p);
    this.applyPadding();
    this.requestRender();
  }

  applyPadding() {
    if (!this.w) return;
    const p = this.pad;
    this.camera.setViewOffset(this.w, this.h, (p.right - p.left) / 2, (p.bottom - p.top) / 2, this.w, this.h);
  }

  setPlane(pos, heading, sm) {
    const [x, z] = project(pos.lon, pos.lat);
    this.state = { x, z, heading, lat: pos.lat, fraction: sm.fraction, alt: Math.min(1, sm.altM / 11000), pitch: PITCH[sm.phase] || 0 };
    this.update();
  }

  update() {
    if (!this.mats || !this.state) return;
    const { x, z, fraction } = this.state;
    // Flown part ends at the aircraft, the rest starts there.
    const pts = this.route;
    const n = pts.length - 1;
    const cut = Math.max(0, Math.min(n, Math.floor(fraction * n)));
    const done = [];
    for (let i = 0; i <= cut; i++) done.push(pts[i][0], 0, pts[i][1]);
    done.push(x, 0, z);
    const todo = [x, 0, z];
    for (let i = Math.min(cut + 1, n); i <= n; i++) todo.push(pts[i][0], 0, pts[i][1]);
    this.setLine(this.done, done);
    this.setLine(this.todo, todo);

    const t = this.controls.target;
    if (!this.placed) {
      this.placed = true;
      this.defaultCamera();
    } else {
      this.camera.position.x += x - t.x;
      this.camera.position.z += z - t.z;
      t.set(x, 0, z);
    }
    this.applyColors();
    this.requestRender();
  }

  setLine(line, positions) {
    const g = new LineGeometry();
    g.setPositions(positions);
    line.geometry.dispose();
    line.geometry = g;
    line.computeLineDistances();
  }

  /** Behind the aircraft (above it for the 2D icon), about 700 km of map across the middle of the screen. */
  defaultCamera() {
    const s = this.state;
    const kmPerUnit = KM_PER_UNIT * Math.cos(s.lat * RAD);
    const distance = (km) => km / kmPerUnit / (2 * TAN);
    this.controls.minDistance = distance(40);
    this.controls.maxDistance = distance(7000);
    this.controls.target.set(s.x, 0, s.z);
    this.camera.position.setFromSphericalCoords(distance(700), this.tiltable() ? TILT : TOP_DOWN, -s.heading * RAD).add(this.controls.target);
    this.controls.update();
  }

  northUp() {
    const offset = this.camera.position.clone().sub(this.controls.target);
    this.turningNorth = { from: new THREE.Spherical().setFromVector3(offset).theta, start: performance.now() };
    this.requestRender();
  }

  show(on) {
    this.visible = on;
    this.box.hidden = !on;
    if (on) this.resize();
  }

  requestRender() {
    if (!this.raf && this.visible) this.raf = requestAnimationFrame(() => this.frame());
  }

  frame() {
    this.raf = 0;
    if (!this.visible) return;
    if (this.turningNorth) {
      const k = Math.min(1, (performance.now() - this.turningNorth.start) / 500);
      const t = this.controls.target;
      const offset = this.camera.position.clone().sub(t);
      const sph = new THREE.Spherical().setFromVector3(offset);
      sph.theta = this.turningNorth.from * (1 - k) ** 3;
      this.camera.position.copy(t).add(offset.setFromSpherical(sph));
      if (k === 1) this.turningNorth = false;
    }
    const moving = this.controls.update();
    this.render();
    if (moving || this.turningNorth) this.requestRender();
  }

  render() {
    if (!this.w || !this.h || !this.mats || !this.state) return;
    const cam = this.camera;
    const s = this.state;
    const dist = cam.position.distanceTo(this.controls.target);
    cam.near = dist * 0.02;
    cam.far = dist * 10;
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
    this.ground.fog.near = dist * 1.8;
    this.ground.fog.far = dist * 5;

    // Like an IFE map the aircraft keeps its size on screen and only the map zooms.
    const upp = (2 * dist * TAN) / this.h; // map units per CSS pixel at the aircraft
    const planePx = Math.max(100, Math.min(190, (this.h - this.pad.top - this.pad.bottom) * 0.24));
    const len = planePx * upp;
    const lift = (0.03 + 0.25 * s.alt) * len; // a little higher at cruise, with its shadow on the map
    if (this.model) {
      this.model.position.set(s.x, lift, s.z);
      this.model.rotation.set(s.pitch * RAD, -s.heading * RAD, 0);
      this.model.scale.setScalar(len);
      this.shadow.position.set(s.x + lift * 0.3, 0, s.z + lift * 0.45);
      this.shadow.rotation.y = -s.heading * RAD;
      this.shadow.scale.set(len, len * 1e-4, len);
    }
    const px = (n) => (n / this.h) * 2 * TAN; // sprite scale for n CSS pixels
    this.icon.position.set(s.x, 0, s.z);
    this.icon.scale.set(px(planePx * 0.7), px(planePx * 0.7), 1);
    const here = this.toScreen(s.x, 0, s.z);
    const ahead = this.toScreen(s.x + Math.sin(s.heading * RAD), 0, s.z - Math.cos(s.heading * RAD));
    if (here && ahead) this.mats.icon.rotation = -Math.atan2(ahead[0] - here[0], here[1] - ahead[1]);
    const dot = px(16);
    for (const d of this.dots) d.scale.set(dot, dot, 1);
    this.mats.todo.dashScale = 1 / upp;

    const r = this.renderer;
    r.clear();
    r.render(this.ground, cam);
    r.clearDepth();
    r.render(this.air, cam);
    this.drawLabels(upp, planePx, lift);
    const t = this.controls.target;
    const a = this.toScreen(t.x, 0, t.z);
    const b = this.toScreen(t.x, 0, t.z - 1);
    if (a && b) this.onCompass?.(Math.atan2(b[0] - a[0], a[1] - b[1]) / RAD);
  }

  toScreen(x, y, z) {
    const v = this.v.set(x, y, z).project(this.camera);
    if (v.z < -1 || v.z > 1) return null;
    return [((v.x + 1) / 2) * this.w, ((1 - v.y) / 2) * this.h];
  }

  /** City and airport names stay upright whichever way the map is turned. */
  drawLabels(upp, planePx, lift) {
    const ctx = this.octx;
    const c = this.colors;
    const s = this.state;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.w, this.h);
    const placed = [];
    for (const a of [this.o, this.d]) {
      const [x, y] = project(a.lon, a.lat);
      const q = this.toScreen(x, 0, y);
      if (q) drawLabel(ctx, this.w, this.h, `${a.city} ${a.iata}`, q[0] + 9, q[1] + 4, { size: 14, weight: 700, color: c['--text'], halo: c['--map-land'], placed });
    }
    const three = this.style === '3d' && this.model;
    const p = this.toScreen(s.x, three ? lift : 0, s.z);
    if (p) {
      const r = (three ? planePx : planePx * 0.55) / 2;
      placed.push([p[0] - r, p[1] - r, p[0] + r, p[1] + r]); // keep place names off the aircraft
    }
    const spanDeg = (this.w * upp) / R / RAD;
    const maxRank = spanDeg < 25 ? 6 : spanDeg < 60 ? 4 : spanDeg < 150 ? 2 : 1;
    const haze = this.ground.fog.near;
    let count = 0;
    for (const pl of this.world.places) {
      if (pl.rank > maxRank || count > 60) break;
      if (this.camera.position.distanceTo(this.v.set(pl.x, 0, pl.y)) > haze) continue;
      const q = this.toScreen(pl.x, 0, pl.y);
      if (!q) continue;
      if (drawLabel(ctx, this.w, this.h, pl.name, q[0] + 5, q[1] + 4, { size: 11, weight: 400, color: c['--map-label'], halo: c['--map-land'], placed })) {
        ctx.beginPath();
        ctx.arc(q[0], q[1], 1.8, 0, Math.PI * 2);
        ctx.fillStyle = c['--map-label'];
        ctx.fill();
        count++;
      }
    }
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.visible = false;
    this.ro.disconnect();
    this.controls.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}
