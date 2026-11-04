// The 3D aircraft model for the follow view, drawn by Three.js as a MapLibre
// custom layer on top of the map. Its size on screen comes from the map every
// frame (larger when zoomed in, smaller when zoomed out); it flies a little higher
// at cruise with its shadow on the map below, and pitches up or down with the
// flight phase.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MercatorCoordinate } from 'maplibre-gl';

const RAD = Math.PI / 180;
const PITCH = { takeoff: 8, climb: 5, descent: -2, approach: -1, landing: 3 };

export class AircraftLayer {
  /** file: model name in /assets/aircraft; sizePx(): its length on screen now; onReady() once the model has loaded. */
  constructor(file, sizePx, onReady) {
    this.id = 'aircraft3d';
    this.type = 'custom';
    this.renderingMode = '3d';
    this.file = file;
    this.sizePx = sizePx;
    this.onReady = onReady;
    this.ready = false;
    this.visible = false;
    this.state = null;
  }

  set(state) {
    this.state = state;
  }

  show(on) {
    this.visible = on;
    this.map?.triggerRepaint();
  }

  onAdd(map, gl) {
    this.map = map;
    this.camera = new THREE.Camera();
    this.renderer = new THREE.WebGLRenderer({ canvas: map.getCanvas(), context: gl });
    this.renderer.autoClear = false;
    // Scene axes: x east, y up, z south.
    this.air = new THREE.Scene();
    this.air.add(new THREE.HemisphereLight(0xffffff, 0x8899aa, 2.2));
    const sun = new THREE.DirectionalLight(0xffffff, 2.2);
    sun.position.set(0.5, 1, 0.35);
    this.air.add(sun);
    this.ground = new THREE.Scene();
    this.load();
  }

  async load() {
    const gltf = await new GLTFLoader().loadAsync(`/assets/aircraft/${this.file}.glb`);
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
    // The shadow is the model flattened onto the map, each pixel darkened once (stencil).
    const shadowMat = new THREE.MeshBasicMaterial({
      color: 0x000000, opacity: 0.16, transparent: true, depthTest: false, depthWrite: false,
      stencilWrite: true, stencilRef: 1, stencilFunc: THREE.NotEqualStencilFunc, stencilZPass: THREE.ReplaceStencilOp,
    });
    const ghost = unit.clone();
    ghost.traverse((o) => { if (o.isMesh) o.material = shadowMat; });
    this.shadow = new THREE.Group();
    this.shadow.add(ghost);
    this.ground.add(this.shadow);
    this.ready = true;
    this.onReady?.();
  }

  render(gl, args) {
    if (!this.visible || !this.ready || !this.state) return;
    const s = this.state;
    const len = this.sizePx() / (512 * 2 ** this.map.getZoom()); // map units for that many pixels on screen
    const lift = (0.03 + 0.25 * s.alt) * len;
    this.model.position.set(0, lift, 0);
    this.model.rotation.set((PITCH[s.phase] || 0) * RAD, -s.heading * RAD, 0);
    this.model.scale.setScalar(len);
    this.shadow.position.set(lift * 0.3, 0, lift * 0.45);
    this.shadow.rotation.y = -s.heading * RAD;
    this.shadow.scale.set(len, len * 1e-4, len);

    // Map units: x east, y south, z up; the scene's y-up/z-south axes are turned onto them.
    const at = MercatorCoordinate.fromLngLat([s.lon, s.lat]);
    const place = new THREE.Matrix4().makeTranslation(at.x, at.y, 0)
      .multiply(new THREE.Matrix4().makeScale(1, -1, 1))
      .multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2));
    this.camera.projectionMatrix.fromArray(args.defaultProjectionData.mainMatrix).multiply(place);

    const r = this.renderer;
    r.resetState();
    r.setViewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    r.clearStencil();
    r.render(this.ground, this.camera);
    r.clearDepth();
    r.render(this.air, this.camera);
  }
}
