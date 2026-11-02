// Self-study「清理打磨焊缝」: X80 plate from the angle-probe structure GLB, plus brush / polisher / ruler.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { placeOnBench, sitOnBench } from './probes-display.js';
import derived from '../../contracts/angle_derived_layout.json';
import angleGlbUrl from '../../assets/probe_angle_beam.glb?url';

const MM = 0.001;
const STEEL = 'angle__steel_block';
const WELD_BENCH = { x_mm: 55, z_mm: -310, yaw_deg: 0 };
const INST_RIGHT = -0.118;
const CABLE_LEFT = 0.256;
const PROBE_Z = 0.12;
const CLEAR_BRUSH = 0.004;
const CLEAR_DISC = 0.003;

const easeOut = (t) => 1 - (1 - t) ** 3;
const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2);
const clamp01 = (t) => Math.min(1, Math.max(0, t));
const mix = (a, b, t) => a + (b - a) * t;

function cloneMats(root) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.material = Array.isArray(o.material) ? o.material.map((m) => m.clone()) : o.material.clone();
    o.castShadow = true;
    o.receiveShadow = true;
  });
}

function mat(color, extra = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.18, ...extra });
}

function add(g, geo, material, x, y, z, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x * MM, y * MM, z * MM);
  m.rotation.set(rx, ry, rz);
  m.castShadow = true;
  m.receiveShadow = true;
  g.add(m);
  return m;
}

function worldBox(obj) {
  obj.updateMatrixWorld(true);
  const box = new THREE.Box3();
  const dummy = new THREE.Matrix4();
  const gb = new THREE.Box3();
  obj.traverse((m) => {
    if (!m.visible) return;
    if (m.isInstancedMesh) {
      if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
      for (let i = 0; i < m.count; i++) {
        m.getMatrixAt(i, dummy);
        dummy.premultiply(m.matrixWorld);
        gb.copy(m.geometry.boundingBox).applyMatrix4(dummy);
        box.union(gb);
      }
      return;
    }
    if (m.isMesh) {
      gb.setFromObject(m);
      if (!gb.isEmpty()) box.union(gb);
    }
  });
  return box;
}

function keepAbove(obj, yMin) {
  const box = worldBox(obj);
  if (!box.isEmpty() && box.min.y < yMin) obj.position.y += yMin - box.min.y;
}

export function buildBrush() {
  const g = new THREE.Group();
  g.name = 'prep__brush';
  const wood = mat(0x6b3d1f, { roughness: 0.86, metalness: 0.02 });
  const wood2 = mat(0x8b5a2b, { roughness: 0.8, metalness: 0.02 });
  const ferrule = mat(0xd0d5dc, { roughness: 0.22, metalness: 0.78 });
  const wire = mat(0x9aa3ad, { roughness: 0.38, metalness: 0.62 });

  add(g, new THREE.CylinderGeometry(8.2 * MM, 10.8 * MM, 122 * MM, 16), wood, 0, 69, 0);
  add(g, new THREE.CylinderGeometry(8.6 * MM, 8.2 * MM, 18 * MM, 14), wood2, 0, 22, 0);
  add(g, new THREE.SphereGeometry(8.2 * MM, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), wood, 0, 8, 0, Math.PI, 0, 0);
  add(g, new THREE.TorusGeometry(4.4 * MM, 1.15 * MM, 8, 14), wood2, 0, 12, 0, Math.PI / 2, 0, 0);
  add(g, new THREE.CylinderGeometry(12 * MM, 12 * MM, 16 * MM, 20), ferrule, 0, 132, 0);
  add(g, new THREE.TorusGeometry(12 * MM, 0.7 * MM, 6, 20), mat(0x8a9199, { metalness: 0.82, roughness: 0.28 }), 0, 126, 0, Math.PI / 2, 0, 0);
  add(g, new THREE.TorusGeometry(12 * MM, 0.7 * MM, 6, 20), mat(0x8a9199, { metalness: 0.82, roughness: 0.28 }), 0, 138, 0, Math.PI / 2, 0, 0);
  add(g, new THREE.BoxGeometry(26 * MM, 9 * MM, 18 * MM, 1, 1, 1), ferrule, 0, 142, 0);

  const geos = [];
  const wireGeo = new THREE.CylinderGeometry(0.32 * MM, 0.2 * MM, 11 * MM, 4);
  const cols = 9;
  const rows = 11;
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const x = (i - (cols - 1) / 2) * 2.35 * MM;
      const z = (j - (rows - 1) / 2) * 1.35 * MM;
      const geo = wireGeo.clone();
      const dummy = new THREE.Object3D();
      dummy.position.set(x, 148.2 * MM, z);
      dummy.rotation.set((j - 5) * 0.018, 0, (i - 4) * 0.02);
      dummy.updateMatrix();
      geo.applyMatrix4(dummy.matrix);
      geos.push(geo);
    }
  }
  const wires = new THREE.Mesh(mergeGeometries(geos, false), wire);
  wires.castShadow = true;
  wires.name = 'prep__bristles';
  g.add(wires);
  g.rotation.z = Math.PI / 2;
  sitOnBench(g);
  g.userData.tip = new THREE.Vector3(0, 0.1537, 0);
  return g;
}

function discTex() {
  const cv = document.createElement('canvas');
  cv.width = 512;
  cv.height = 512;
  const c = cv.getContext('2d');
  const g = c.createRadialGradient(256, 256, 28, 256, 256, 250);
  g.addColorStop(0, '#d6d3d1');
  g.addColorStop(0.12, '#57534e');
  g.addColorStop(0.16, '#a16207');
  g.addColorStop(0.55, '#92400e');
  g.addColorStop(1, '#7c2d12');
  c.fillStyle = g;
  c.beginPath();
  c.arc(256, 256, 252, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = 'rgba(0,0,0,.08)';
  for (let i = 0; i < 900; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = 70 + Math.random() * 175;
    c.fillRect(256 + Math.cos(a) * r, 256 + Math.sin(a) * r, 1.6, 1.6);
  }
  c.strokeStyle = 'rgba(0,0,0,.32)';
  c.lineWidth = 3;
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    c.beginPath();
    c.moveTo(256 + Math.cos(a) * 78, 256 + Math.sin(a) * 78);
    c.lineTo(256 + Math.cos(a) * 246, 256 + Math.sin(a) * 246);
    c.stroke();
  }
  c.strokeStyle = 'rgba(255,255,255,.12)';
  c.lineWidth = 4;
  c.beginPath();
  c.arc(256, 256, 168, 0, Math.PI * 2);
  c.stroke();
  c.fillStyle = '#1c1917';
  c.beginPath();
  c.arc(256, 256, 36, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = '#a8a29e';
  c.beginPath();
  c.arc(256, 256, 18, 0, Math.PI * 2);
  c.fill();
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

export function buildPolisher() {
  const g = new THREE.Group();
  g.name = 'prep__polisher';
  const body = mat(0x1c1917, { roughness: 0.48, metalness: 0.28 });
  const orange = mat(0xea580c, { roughness: 0.38, metalness: 0.1 });
  const rubber = mat(0x0c0a09, { roughness: 0.9, metalness: 0.04 });
  const silver = mat(0xc5c9ce, { roughness: 0.24, metalness: 0.82 });
  const dark = mat(0x292524, { roughness: 0.36, metalness: 0.42 });
  const guardM = mat(0x3f3f46, { roughness: 0.32, metalness: 0.55, side: THREE.DoubleSide });
  const discM = mat(0x9a3412, { roughness: 0.78, metalness: 0.06, map: discTex() });

  const disc = add(g, new THREE.CylinderGeometry(50 * MM, 50 * MM, 6 * MM, 48), discM, 0, 3, 0);
  disc.name = 'prep__disc';
  add(g, new THREE.CylinderGeometry(14 * MM, 14 * MM, 4 * MM, 20), silver, 0, 8, 0);
  add(g, new THREE.CylinderGeometry(7 * MM, 8.5 * MM, 6 * MM, 6), silver, 0, 12, 0);

  const guard = new THREE.Mesh(
    new THREE.CylinderGeometry(54 * MM, 54 * MM, 16 * MM, 36, 1, true, Math.PI * 0.42, Math.PI * 1.22),
    guardM,
  );
  guard.position.set(0, 10 * MM, 0);
  guard.castShadow = true;
  g.add(guard);
  const hood = new THREE.Mesh(
    new THREE.RingGeometry(18 * MM, 54 * MM, 36, 1, Math.PI * 0.42, Math.PI * 1.22),
    guardM,
  );
  hood.rotation.x = -Math.PI / 2;
  hood.position.set(0, 18 * MM, 0);
  hood.castShadow = true;
  g.add(hood);
  add(g, new THREE.BoxGeometry(16 * MM, 10 * MM, 22 * MM), dark, -38, 16, 0);

  add(g, new THREE.BoxGeometry(56 * MM, 38 * MM, 48 * MM), dark, -8, 32, 0);
  add(g, new THREE.CylinderGeometry(22 * MM, 22 * MM, 48 * MM, 18), dark, -8, 32, 0, Math.PI / 2, 0, 0);
  add(g, new THREE.CylinderGeometry(6 * MM, 6 * MM, 8 * MM, 12), silver, -8, 32, 26);
  add(g, new THREE.CylinderGeometry(8 * MM, 8 * MM, 10 * MM, 12), rubber, -8, 52, 0);
  for (const sx of [-18, 2, 18]) {
    for (const sz of [-14, 14]) add(g, new THREE.CylinderGeometry(1.6 * MM, 1.6 * MM, 2.2 * MM, 8), silver, sx, 51, sz);
  }

  add(g, new THREE.CylinderGeometry(27 * MM, 28 * MM, 118 * MM, 24), body, -86, 38, 0, 0, 0, Math.PI / 2);
  add(g, new THREE.CylinderGeometry(24 * MM, 27 * MM, 22 * MM, 18), dark, -26, 38, 0, 0, 0, Math.PI / 2);
  for (let i = 0; i < 6; i++) {
    add(g, new THREE.BoxGeometry(42 * MM, 2.4 * MM, 4 * MM), mat(0x0a0a0a), -78, 58, (i - 2.5) * 7.2);
    add(g, new THREE.BoxGeometry(42 * MM, 2.4 * MM, 4 * MM), mat(0x0a0a0a), -78, 18, (i - 2.5) * 7.2);
  }
  add(g, new THREE.CylinderGeometry(7 * MM, 7 * MM, 8 * MM, 12), silver, -70, 38, 28, Math.PI / 2, 0, 0);
  add(g, new THREE.CylinderGeometry(7 * MM, 7 * MM, 8 * MM, 12), silver, -70, 38, -28, Math.PI / 2, 0, 0);

  add(g, new THREE.BoxGeometry(54 * MM, 10 * MM, 16 * MM), orange, -74, 58, 0);
  add(g, new THREE.BoxGeometry(28 * MM, 6 * MM, 10 * MM), silver, -68, 64, 0);
  add(g, new THREE.BoxGeometry(16 * MM, 4 * MM, 7 * MM), mat(0xb91c1c), -62, 67, 0);

  add(g, new THREE.CylinderGeometry(22 * MM, 24 * MM, 36 * MM, 18), orange, -148, 38, 0, 0, 0, Math.PI / 2);
  add(g, new THREE.CylinderGeometry(18 * MM, 20 * MM, 28 * MM, 14), rubber, -176, 38, 0, 0, 0, Math.PI / 2);
  add(g, new THREE.TorusGeometry(8 * MM, 3.4 * MM, 8, 16), rubber, -192, 38, 0, 0, 0, Math.PI / 2);
  add(g, new THREE.CylinderGeometry(4.2 * MM, 4.2 * MM, 42 * MM, 8), dark, -214, 34, 6, 0.35, 0, Math.PI / 2);
  add(g, new THREE.CylinderGeometry(5.2 * MM, 4.2 * MM, 8 * MM, 8), rubber, -194, 38, 0, 0, 0, Math.PI / 2);

  const grip = new THREE.Group();
  grip.position.set(-8 * MM, 50 * MM, 0);
  grip.rotation.z = -0.72;
  g.add(grip);
  add(grip, new THREE.CylinderGeometry(8 * MM, 8 * MM, 12 * MM, 12), silver, 0, 6, 0);
  add(grip, new THREE.CylinderGeometry(9.5 * MM, 10 * MM, 86 * MM, 14), rubber, 0, 52, 0);
  for (let i = 0; i < 7; i++) {
    add(grip, new THREE.TorusGeometry(10.1 * MM, 0.7 * MM, 6, 14), mat(0x171717, { roughness: 0.7 }), 0, 22 + i * 10, 0, Math.PI / 2, 0, 0);
  }
  add(grip, new THREE.SphereGeometry(10.2 * MM, 12, 10), rubber, 0, 96, 0);

  sitOnBench(g);
  g.userData.tip = new THREE.Vector3(0, 0, 0);
  return g;
}

function rulerTex() {
  const w = 2048;
  const h = 160;
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const c = cv.getContext('2d');
  c.fillStyle = '#d8dee6';
  c.fillRect(0, 0, w, h);
  const pad = 48;
  const x0 = pad;
  const x1 = w - pad;
  const span = x1 - x0;
  c.strokeStyle = '#111827';
  c.fillStyle = '#111827';
  c.lineWidth = 2;
  c.beginPath();
  c.moveTo(x0, 18);
  c.lineTo(x1, 18);
  c.stroke();
  c.font = '700 28px "Segoe UI","Microsoft YaHei",sans-serif';
  c.textAlign = 'center';
  c.textBaseline = 'top';
  for (let mm = 0; mm <= 200; mm++) {
    const x = x0 + (span * mm) / 200;
    const cm = mm % 10 === 0;
    const half = mm % 5 === 0;
    const len = cm ? 46 : half ? 30 : 16;
    c.beginPath();
    c.moveTo(x, 18);
    c.lineTo(x, 18 + len);
    c.stroke();
    if (cm) c.fillText(String(mm / 10), x, 70);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

export function buildRuler() {
  const g = new THREE.Group();
  g.name = 'prep__ruler';
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(200 * MM, 1.4 * MM, 24 * MM),
    mat(0xc9d0d8, { roughness: 0.28, metalness: 0.72 }),
  );
  body.castShadow = true;
  body.receiveShadow = true;
  g.add(body);
  const face = new THREE.Mesh(
    new THREE.PlaneGeometry(200 * MM, 24 * MM),
    new THREE.MeshBasicMaterial({ map: rulerTex(), toneMapped: false }),
  );
  face.rotation.x = -Math.PI / 2;
  face.position.y = 0.72 * MM + 0.00012;
  face.raycast = () => {};
  g.add(face);
  sitOnBench(g);
  return g;
}

function buildSparks() {
  const n = 70;
  const pos = new Float32Array(n * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({
    color: 0xfb923c, size: 0.004, transparent: true, opacity: 0.9,
    depthWrite: false, sizeAttenuation: true,
  }));
  pts.visible = false;
  pts.raycast = () => {};
  pts.userData = { n, vel: Array.from({ length: n }, () => new THREE.Vector3()) };
  return pts;
}

function buildBurrs(bead) {
  const g = new THREE.Group();
  g.name = 'prep__burrs';
  const material = mat(0x6b5a48, { roughness: 0.92, metalness: 0.12 });
  const geo = new THREE.IcosahedronGeometry(2.4 * MM, 0);
  for (const side of [-1, 1]) {
    for (let i = 0; i < 8; i++) {
      const m = new THREE.Mesh(geo, material);
      const t = (i + 0.45) / 8;
      m.position.copy(bead.point(t, side, 0.0018));
      m.scale.setScalar(0.75 + (i % 3) * 0.18);
      m.castShadow = true;
      g.add(m);
    }
  }
  return g;
}

function beadOf(weld) {
  weld.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(weld);
  const c = box.getCenter(new THREE.Vector3());
  const s = box.getSize(new THREE.Vector3());
  const alongZ = s.z >= s.x * 0.72;
  const cap = (derived.parts?.[STEEL]?.weld?.half_width_surface ?? 5.6) * MM;
  const half = cap + 0.016;
  const inset = 0.028;
  const z0 = alongZ ? box.min.z + inset : c.z;
  const z1 = alongZ ? box.max.z - inset : c.z;
  const x0 = alongZ ? c.x : box.min.x + inset;
  const x1 = alongZ ? c.x : box.max.x - inset;
  return {
    c,
    yTop: box.max.y,
    alongZ,
    half,
    point(along, side, lift) {
      const t = clamp01(along);
      if (alongZ) return new THREE.Vector3(c.x + side * half, box.max.y + lift, mix(z0, z1, t));
      return new THREE.Vector3(mix(x0, x1, t), box.max.y + lift, c.z + side * half);
    },
  };
}

function settleWeld(weld, benchY) {
  placeOnBench(weld, WELD_BENCH, benchY);
  weld.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(weld);
  weld.position.z += -0.078 - box.max.z;
  weld.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(weld);
  if (b.min.x < INST_RIGHT + 0.04) weld.position.x += INST_RIGHT + 0.04 - b.min.x;
  weld.updateMatrixWorld(true);
  const b2 = new THREE.Box3().setFromObject(weld);
  if (b2.max.x > CABLE_LEFT - 0.02) weld.position.x -= b2.max.x - (CABLE_LEFT - 0.02);
}

function settleTools(weld, brush, polisher, ruler, benchY) {
  weld.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(weld);
  const zFront = Math.min(0.038, Math.max(b.max.z + 0.048, -0.02));
  const xBrush = Math.min(b.min.x - 0.028, -0.09);
  const xPolish = Math.min(Math.max(b.max.x + 0.1, 0.3), 0.36);
  const xRuler = (b.min.x + b.max.x) * 0.5;
  placeOnBench(brush, { x_mm: xBrush / MM, z_mm: zFront / MM, yaw_deg: 14 }, benchY);
  placeOnBench(polisher, { x_mm: xPolish / MM, z_mm: (zFront - 0.008) / MM, yaw_deg: 158 }, benchY);
  const zRuler = Math.min(zFront + 0.034, PROBE_Z - 0.04);
  placeOnBench(ruler, { x_mm: xRuler / MM, z_mm: zRuler / MM, yaw_deg: 8 }, benchY);
}

export function createWeldPrep({ scene, benchY }) {
  const root = new THREE.Group();
  root.name = 'weld_prep';
  root.visible = false;
  scene.add(root);

  const st = { weld: false, tools: false, grind: false, play: null };
  const drops = [];
  let weld = null;
  let brush = null;
  let polisher = null;
  let ruler = null;
  let sparks = null;
  let burrs = null;
  let bead = null;
  let brushHome = null;
  let polishHome = null;
  const ready = new GLTFLoader().loadAsync(angleGlbUrl).then((g) => {
    g.scene.updateMatrixWorld(true);
    const node = g.scene.getObjectByName(STEEL);
    if (!node) return;
    const lay = derived.parts?.[STEEL] || {};
    const hold = new THREE.Group();
    hold.scale.setScalar(1 / MM);
    const plate = node.clone(true);
    cloneMats(plate);
    plate.position.set(-(lay.weld?.xc ?? 24) * MM, 0, -(lay.y0 ?? -215) * MM);
    hold.add(plate);
    weld = new THREE.Group();
    weld.name = 'prep__weld';
    weld.add(hold);
    weld.scale.setScalar(MM);
    sitOnBench(weld);
    weld.visible = false;
    root.add(weld);
    settleWeld(weld, benchY);
    bead = beadOf(weld);
    burrs = buildBurrs(bead);
    burrs.visible = false;
    root.add(burrs);
    brush = buildBrush();
    polisher = buildPolisher();
    ruler = buildRuler();
    sparks = buildSparks();
    for (const o of [brush, polisher, ruler]) {
      o.visible = false;
      root.add(o);
    }
    root.add(sparks);
    settleTools(weld, brush, polisher, ruler, benchY);
    brushHome = { p: brush.position.clone(), r: brush.rotation.clone() };
    polishHome = { p: polisher.position.clone(), r: polisher.rotation.clone() };
  });

  function dropIn(obj, delay = 0, ms = 520) {
    if (!obj) return;
    obj.visible = true;
    const y1 = obj.position.y;
    obj.position.y = y1 + 0.14;
    drops.push({ obj, y0: obj.position.y, y1, t0: performance.now() + delay, ms });
  }

  function placeTip(obj, world, tiltX, yaw) {
    const home = obj === brush ? brushHome : polishHome;
    obj.rotation.set(tiltX, yaw ?? home.r.y, 0);
    obj.position.copy(world);
    obj.updateMatrixWorld(true);
    const tip = obj.userData.tip;
    if (tip) {
      const now = obj.localToWorld(tip.clone());
      obj.position.add(world).sub(now);
    }
    keepAbove(obj, bead.yTop + (obj === brush ? CLEAR_BRUSH : CLEAR_DISC));
  }

  function emitSparks(origin, dt) {
    if (!sparks) return;
    sparks.visible = true;
    sparks.position.copy(origin);
    const { n, vel } = sparks.userData;
    const arr = sparks.geometry.attributes.position.array;
    for (let i = 0; i < n; i++) {
      arr[i * 3] += vel[i].x * dt;
      arr[i * 3 + 1] += vel[i].y * dt;
      arr[i * 3 + 2] += vel[i].z * dt;
      vel[i].y -= 2.8 * dt;
      if (arr[i * 3 + 1] < -0.01 || Math.hypot(arr[i * 3], arr[i * 3 + 1], arr[i * 3 + 2]) > 0.05) {
        arr[i * 3] = (Math.random() - 0.5) * 0.004;
        arr[i * 3 + 1] = 0;
        arr[i * 3 + 2] = (Math.random() - 0.5) * 0.004;
        vel[i].set((Math.random() - 0.5) * 0.18, 0.08 + Math.random() * 0.16, (Math.random() - 0.5) * 0.18);
      }
    }
    sparks.geometry.attributes.position.needsUpdate = true;
  }

  function setBurrs(k) {
    if (!burrs) return;
    burrs.visible = k > 0.02;
    burrs.traverse((o) => {
      if (!o.isMesh) return;
      o.material.transparent = k < 1;
      o.material.opacity = k;
      o.scale.setScalar(0.55 + 0.7 * k);
    });
  }

  function startGrind(onDone) {
    if (!brush || !polisher || !bead || st.play?.kind === 'grind') return;
    st.play = { kind: 'grind', t0: performance.now(), onDone, done: false };
    if (burrs) burrs.visible = true;
    setBurrs(1);
  }

  function tickGrind(now) {
    const P = st.play;
    if (!P || P.kind !== 'grind') return;
    const t = (now - P.t0) / 1000;
    const disc = polisher.getObjectByName('prep__disc');
    const lean = -0.2;
    if (t < 0.4) {
      const u = easeOut(t / 0.4);
      placeTip(brush, brushHome.p.clone().lerp(bead.point(0.1, -1, 0.006), u), mix(0, lean, u));
    } else if (t < 2.3) {
      const u = easeInOut((t - 0.4) / 1.9);
      placeTip(brush, bead.point(u, -1, 0.005), lean);
      setBurrs(1 - u * 0.45);
    } else if (t < 4.2) {
      const u = easeInOut((t - 2.3) / 1.9);
      placeTip(brush, bead.point(1 - u, 1, 0.005), lean);
      setBurrs(0.55 * (1 - u));
    } else if (t < 4.6) {
      const u = easeOut((t - 4.2) / 0.4);
      if (u < 0.88) placeTip(brush, bead.point(0.12, 1, 0.006).lerp(brushHome.p, u), mix(lean, 0, u));
      else {
        brush.position.copy(brushHome.p);
        brush.rotation.copy(brushHome.r);
      }
      setBurrs(0);
    } else if (t < 5.05) {
      const u = easeOut((t - 4.6) / 0.45);
      placeTip(polisher, polishHome.p.clone().lerp(bead.point(0.42, 0.55, 0.005), u), mix(0, -0.1, u));
    } else if (t < 7.6) {
      const u = (t - 5.05) / 2.55;
      const p = bead.point(0.42 + Math.sin(u * Math.PI * 2) * 0.03, 0.55, 0.004);
      p.x += Math.sin(u * Math.PI * 7) * 0.004;
      placeTip(polisher, p, -0.08);
      if (disc) disc.rotation.y += 0.62;
      emitSparks(p, 0.016);
    } else if (t < 8.1) {
      const u = easeOut((t - 7.6) / 0.5);
      placeTip(polisher, bead.point(0.42, 0.55, 0.005).lerp(polishHome.p, u), mix(-0.08, 0, u));
      if (u > 0.92) {
        polisher.position.copy(polishHome.p);
        polisher.rotation.copy(polishHome.r);
      }
      if (sparks) sparks.visible = false;
    } else if (!P.done) {
      P.done = true;
      st.grind = true;
      st.play = null;
      brush.position.copy(brushHome.p);
      brush.rotation.copy(brushHome.r);
      polisher.position.copy(polishHome.p);
      polisher.rotation.copy(polishHome.r);
      if (sparks) sparks.visible = false;
      P.onDone?.();
    }
  }

  function tickDrops(now) {
    for (let i = drops.length - 1; i >= 0; i--) {
      const d = drops[i];
      if (now < d.t0) continue;
      const u = clamp01((now - d.t0) / d.ms);
      const k = easeOut(u);
      d.obj.position.y = mix(d.y0, d.y1, k) + Math.sin(k * Math.PI) * 0.01 * (1 - k);
      if (u >= 1) drops.splice(i, 1);
    }
  }

  function tick(now) {
    if (!root.visible) return;
    tickDrops(now);
    if (st.play?.kind === 'grind') tickGrind(now);
  }

  function pickMeshes() {
    if (!root.visible) return [];
    const out = [];
    root.traverse((m) => { if (m.isMesh && m.visible) out.push(m); });
    return out;
  }

  function owns(obj) {
    for (let o = obj; o; o = o.parent) if (o === root) return true;
    return false;
  }

  function focusTarget() {
    const obj = st.play?.kind === 'grind' ? weld : (weld?.visible ? weld : root);
    if (!obj) return null;
    const box = new THREE.Box3().setFromObject(obj);
    if (box.isEmpty()) return null;
    const c = box.getCenter(new THREE.Vector3());
    const r = Math.max(box.getSize(new THREE.Vector3()).length() / 2, 0.14);
    return { target: c, pos: c.clone().addScaledVector(new THREE.Vector3(0.38, 0.62, 0.68).normalize(), r * 2.7) };
  }

  return {
    ready,
    setActive(on) {
      root.visible = !!on;
      if (!on && st.play?.kind === 'grind') {
        st.play = null;
        if (sparks) sparks.visible = false;
        if (brushHome && brush) { brush.position.copy(brushHome.p); brush.rotation.copy(brushHome.r); }
        if (polishHome && polisher) { polisher.position.copy(polishHome.p); polisher.rotation.copy(polishHome.r); }
      }
    },
    async showWeld() {
      await ready;
      if (!weld || st.weld) return st;
      st.weld = true;
      dropIn(weld);
      return st;
    },
    async showTools() {
      await ready;
      if (!brush || st.tools) return st;
      st.tools = true;
      if (burrs) burrs.visible = true;
      dropIn(brush, 0, 480);
      dropIn(polisher, 90, 480);
      dropIn(ruler, 160, 420);
      return st;
    },
    async playGrind(onDone) {
      await ready;
      if (!st.tools) return st;
      startGrind(onDone);
      return st;
    },
    tick,
    pickMeshes,
    owns,
    focusTarget,
    status: () => st,
    sig: () => `${st.weld | 0}${st.tools | 0}${st.grind | 0}${st.play ? 1 : 0}`,
    get playing() { return !!st.play || drops.length > 0; },
  };
}
