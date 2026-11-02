import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { grabGl } from '../snapshot.js';
import { createLabTable } from '../labtable.js';

const MM = 0.001;
// Model-local frame (mm; +Z into the steel, +X probe front) -> three.js world (m, +Y up).
export const L2W = (x, y, z) => new THREE.Vector3(x * MM, -z * MM, y * MM);
const SVGNS = 'http://www.w3.org/2000/svg';

const XRAY_OPACITY = { angle__housing: 0.1, angle__absorber: 0.16, angle__connector: 0.25, angle__backing: 0.6, angle__steel_block: 0.22, angle__couplant: 0.35, angle__wedge: 0.38 };
const GHOST_OPACITY = 0.07;
const CAP_COLOR = {
  angle__housing: [0xcfd4da], angle__connector: [0xaeb6c0, 0xe8edf2, 0xd4a72c], angle__absorber: [0x2a2f38],
  angle__backing: [0x4b5563], angle__wedge: [0x9fd3ea], angle__active_element: [0xd08a2a],
  angle__front_electrode: [0xd8dde3], angle__rear_electrode: [0xd8dde3], angle__couplant: [0xe6d38f], angle__steel_block: [0x353b42, 0x8a7350, 0x6b7078, 0xdc2626, 0x5a5f67],
};
const HIGHLIGHT = new THREE.Color(0x3b82f6);
const ASSEMBLY = 'assembly';
const STEEL = 'angle__steel_block';
const WELD_SLOT = { base: 0, haz: 1, weld: 2 };
const weldSlot = (q) => (q.mat === 'weld' && q.run === 'inner' ? 4 : WELD_SLOT[q.mat]);
const SOLO_STEEL_OPACITY = 0.22;

function clipHalf(poly, k, keep) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const P = poly[i];
    const Q = poly[(i + 1) % poly.length];
    const pin = keep(P[0]);
    if (pin) out.push(P);
    if (pin !== keep(Q[0])) {
      const t = (k - P[0]) / (Q[0] - P[0]);
      out.push([k, P[1] + t * (Q[1] - P[1])]);
    }
  }
  return out;
}

function clipS(poly, [a, b]) {
  let p = poly;
  if (a > -Infinity) p = clipHalf(p, a, (v) => v >= a);
  if (b < Infinity && p.length) p = clipHalf(p, b, (v) => v <= b);
  return p;
}

// Section of the weld plate by the vertical incidence plane through the index point (x, y) at swivel psi,
// in plane coordinates (s along the probe axis, z).
function plateSection(sp, pose) {
  const c = Math.cos(pose.psi);
  const s = Math.sin(pose.psi);
  if (Math.abs(c) < 0.1) return [];
  const map = (poly) => poly.map(([x, z]) => [(x - pose.x) / c, z]);
  const range = (ya, yb) => {
    if (Math.abs(s) < 1e-9) return pose.y >= ya && pose.y <= yb ? [-Infinity, Infinity] : null;
    const a = (ya - pose.y) / s;
    const b = (yb - pose.y) / s;
    return [Math.min(a, b), Math.max(a, b)];
  };
  const plate = range(sp.y0, sp.y1);
  const out = [];
  if (!plate) return out;
  for (const q of sp.weld.pieces) {
    const p = clipS(map(q.poly), plate);
    if (p.length >= 3) out.push({ poly: p, slot: weldSlot(q) });
  }
  for (const d of defectSections(sp, pose)) out.push({ poly: d.poly, slot: 3, layer: 2 });
  return out;
}

function defectSections(sp, pose) {
  const c = Math.cos(pose.psi);
  const s = Math.sin(pose.psi);
  if (Math.abs(c) < 0.1) return [];
  const range = (ya, yb) => {
    if (Math.abs(s) < 1e-9) return pose.y >= ya && pose.y <= yb ? [-Infinity, Infinity] : null;
    const a = (ya - pose.y) / s;
    const b = (yb - pose.y) / s;
    return [Math.min(a, b), Math.max(a, b)];
  };
  const out = [];
  for (const d of sp.defects) {
    if (d.shape === 'sphere') {
      const [cx, cy, cz] = d.centre;
      const dist = -(cx - pose.x) * s + (cy - pose.y) * c;
      if (Math.abs(dist) >= d.r) continue;
      out.push({ id: d.id, poly: circlePoly((cx - pose.x) * c + (cy - pose.y) * s, cz, Math.sqrt(d.r ** 2 - dist ** 2)) });
    } else {
      const r = range(d.y0, d.y1);
      if (!r) continue;
      const p = clipS(d.profile.map(([x, z]) => [(x - pose.x) / c, z]), r);
      if (p.length >= 3) out.push({ id: d.id, poly: p });
    }
  }
  return out;
}

function segCross(a, b, c, d) {
  const o = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0;
}

function polysTouch(A, B) {
  if (A.some(([x, z]) => pointInPoly(x, z, B)) || B.some(([x, z]) => pointInPoly(x, z, A))) return true;
  for (let i = 0; i < A.length; i++) {
    for (let j = 0; j < B.length; j++) {
      if (segCross(A[i], A[(i + 1) % A.length], B[j], B[(j + 1) % B.length])) return true;
    }
  }
  return false;
}

function circlePoly(cx, cz, r, n = 24) {
  const pts = [];
  for (let i = 0; i < n; i++) pts.push([cx + r * Math.cos((2 * Math.PI * i) / n), cz + r * Math.sin((2 * Math.PI * i) / n)]);
  return pts;
}

function defectCentre(d) {
  if (d.shape === 'sphere') return d.centre;
  const n = d.profile.length;
  return [d.profile.reduce((s, q) => s + q[0], 0) / n, d.y, d.profile.reduce((s, q) => s + q[1], 0) / n];
}

function pointInPoly(x, z, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i];
    const [xj, zj] = poly[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

function segDist(px, pz, [ax, az], [bx, bz]) {
  const dx = bx - ax;
  const dz = bz - az;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(px - ax - t * dx, pz - az - t * dz);
}

// Interior point farthest from the boundary (grid search); robust for non-convex profiles.
export function interiorPoint(poly) {
  const xs = poly.map((p) => p[0]);
  const zs = poly.map((p) => p[1]);
  const [x0, x1, z0, z1] = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
  let best = [(x0 + x1) / 2, (z0 + z1) / 2];
  let bestD = -1;
  const n = 48;
  for (let i = 1; i < n; i++) {
    for (let j = 1; j < n; j++) {
      const x = x0 + ((x1 - x0) * i) / n;
      const z = z0 + ((z1 - z0) * j) / n;
      if (!pointInPoly(x, z, poly)) continue;
      let d = Infinity;
      for (let k = 0; k < poly.length; k++) d = Math.min(d, segDist(x, z, poly[k], poly[(k + 1) % poly.length]));
      if (d > bestD) { bestD = d; best = [x, z]; }
    }
  }
  return best;
}

function rect(x0, x1, z0, z1) {
  return [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
}

// Section caps on the incidence plane y = 0, per part: [{poly, color?}]
function capPolygons(parts) {
  const caps = {};
  for (const [pid, g] of Object.entries(parts)) {
    if (g.primitive === 'extruded_profile') caps[pid] = [{ poly: g.profile }];
    else if (g.primitive === 'box') caps[pid] = [{ poly: rect(g.x0, g.x1, g.z0, g.z1) }];
  }
  const h = parts.angle__housing;
  const { outer: o, inner: i, feedthrough: f } = h;
  caps.angle__housing = [
    { poly: [[o.x0, 0], [i.x0, 0], [i.x0, i.z0], [f.x - f.r, i.z0], [f.x - f.r, o.z0], [o.x0, o.z0]] },
    { poly: [[f.x + f.r, o.z0], [f.x + f.r, i.z0], [i.x1, i.z0], [i.x1, 0], [o.x1, 0], [o.x1, o.z0]] },
  ];
  const c = parts.angle__connector;
  const ins0 = c.z0 + c.socket_depth;
  caps.angle__connector = [
    { poly: rect(c.x - c.r, c.x - c.bore_r, c.z0, c.z1), slot: 0 },
    { poly: rect(c.x + c.bore_r, c.x + c.r, c.z0, c.z1), slot: 0 },
    { poly: rect(c.x - c.bore_r, c.x - c.pin_r, ins0, c.z1), slot: 1 },
    { poly: rect(c.x + c.pin_r, c.x + c.bore_r, ins0, c.z1), slot: 1 },
    { poly: rect(c.x - c.pin_r, c.x + c.pin_r, c.pin_z0, c.pin_z1), slot: 2 },
  ];
  return caps;
}

function anchors(parts) {
  const a = {};
  for (const [pid, g] of Object.entries(parts)) {
    if (g.primitive === 'extruded_profile') {
      const [x, z] = interiorPoint(g.profile);
      a[pid] = { front: [x, g.y1, z], section: [x, 0, z] };
    }
  }
  const h = parts.angle__housing;
  a.angle__housing = { front: [h.outer.x0 + 6, h.outer.y1, h.outer.z0 + 3.5], section: [h.outer.x0 + 3, 0, (h.outer.z0 + h.inner.z0) / 2] };
  const c = parts.angle__connector;
  a.angle__connector = { front: [c.x, c.r, (c.z0 + c.z1) / 2], section: [c.x - (c.r + c.bore_r) / 2, 0, (c.z0 + c.z1) / 2] };
  const cp = parts.angle__couplant;
  a.angle__couplant = { front: [cp.x1 - 1, cp.y1, cp.z1 / 2], section: [cp.x1 - 1, 0, cp.z1 / 2] };
  const s = parts.angle__steel_block;
  const sx = Math.min(s.x1 - 10, 60);
  a.angle__steel_block = { front: [sx, s.y1, (s.z0 + s.z1) / 2], section: [sx, 0, (s.z0 + s.z1) / 2] };
  const w = parts.angle__wiring;
  const sig = w.paths.signal;
  const m = sig[Math.floor(sig.length / 2)];
  a.angle__wiring = { front: m, section: m };
  return a;
}

export function createViewer({ glbUrl, derived, manifest, names, assemblyName, defectNames, onPick, onPose }) {
  const el = document.createElement('div');
  el.className = 'viewer';
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.localClippingEnabled = true;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.85;
  el.appendChild(renderer.domElement);

  const layer = document.createElement('div');
  layer.className = 'label-layer';
  const svg = document.createElementNS(SVGNS, 'svg');
  svg.setAttribute('class', 'label-lines');
  layer.appendChild(svg);
  el.appendChild(layer);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 0.6));
  const sun = new THREE.DirectionalLight(0xffffff, 1.4);
  sun.position.set(0.3, 0.5, 0.4);
  scene.add(sun);

  const camera = new THREE.PerspectiveCamera(32, 1, 0.002, 20);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.12;
  controls.minDistance = 0.02;
  controls.maxDistance = 3.5;

  const clipPlane = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0);
  const partMeta = Object.fromEntries(manifest.parts.map((p) => [p.id, p]));
  const ids = manifest.parts.map((p) => p.id);
  const parts = {};
  const meshes = {};
  const caps = {};
  const base = {};
  const offW = {};
  const anchorLocal = anchors(derived.parts);
  const state = { mode: 'exterior', explode: 0, solo: null, selected: null, labels: false, beam: false, labelIds: null, labelFace: null, defects: false, scan: false };
  const extraLabels = [];
  let beamGroup = null;
  let axisMark = null;
  let tween = null;
  const glow = {};
  let track = { axis: null, hits: [] };

  // Scanning: every part except the plate rides on a rig; pose = index point (x, y) on the plate, swivel psi.
  const rig = new THREE.Group();
  scene.add(rig);
  const steelCapGroup = new THREE.Group();
  rig.add(steelCapGroup);
  const pose = { x: 0, y: 0, psi: 0 };
  let steelCapsDirty = true;
  const onRig = (pid) => pid !== STEEL;

  function capMesh(pid, c) {
    const shape = new THREE.Shape(c.poly.map(([x, z]) => new THREE.Vector2(x, -z)));
    const geo = new THREE.ShapeGeometry(shape);
    geo.scale(MM, MM, 1);
    geo.translate(0, 0, -0.01 * MM);
    const cols = CAP_COLOR[pid] || [0x888888];
    const mat = new THREE.MeshStandardMaterial({
      color: cols[Math.min(c.slot ?? 0, cols.length - 1)],
      roughness: 0.75,
      metalness: 0.05,
      side: THREE.DoubleSide,
      transparent: pid === 'angle__wedge',
      opacity: pid === 'angle__wedge' ? 0.78 : 1,
      polygonOffset: true,
      polygonOffsetFactor: -1 - (c.layer || 0),
      polygonOffsetUnits: -(c.layer || 0),
    });
    const cap = new THREE.Mesh(geo, mat);
    cap.renderOrder = c.layer || 0;
    cap.userData.partId = pid;
    cap.userData.cap = true;
    cap.visible = false;
    return cap;
  }

  function buildCaps() {
    const polys = capPolygons(derived.parts);
    for (const pid of ids) {
      caps[pid] = [];
      for (const c of polys[pid] || []) {
        const cap = capMesh(pid, c);
        scene.add(cap);
        scene.updateMatrixWorld(true);
        parts[pid].attach(cap);
        caps[pid].push(cap);
      }
    }
  }

  function buildSteelCaps() {
    for (const cap of caps[STEEL] || []) {
      cap.geometry.dispose();
      cap.material.dispose();
      steelCapGroup.remove(cap);
    }
    caps[STEEL] = [];
    const sp = derived.parts[STEEL];
    if (sp.weld) {
      for (const c of plateSection(sp, pose)) {
        const cap = capMesh(STEEL, c);
        steelCapGroup.add(cap);
        caps[STEEL].push(cap);
      }
    }
    steelCapsDirty = false;
  }

  // ------------------------------------------------------------- scanning
  const cpl = derived.parts.angle__couplant;
  function poseValid(x, y, psi) {
    const sp = derived.parts[STEEL];
    const c = Math.cos(psi);
    const s = Math.sin(psi);
    const xs = [];
    for (const [u, v] of [[cpl.x0, cpl.y0], [cpl.x1, cpl.y0], [cpl.x1, cpl.y1], [cpl.x0, cpl.y1]]) {
      const X = x + u * c - v * s;
      const Y = y + u * s + v * c;
      if (X < sp.x0 || X > sp.x1 || Y < sp.y0 || Y > sp.y1) return false;
      xs.push(X);
    }
    if (!sp.weld) return true;
    const a = sp.weld.bead_half_width[0];
    return xs.every((X) => X < sp.weld.xc - a) || xs.every((X) => X > sp.weld.xc + a);
  }

  function applyPose(follow = false) {
    const before = rig.position.clone();
    rig.position.copy(L2W(pose.x, pose.y, 0));
    rig.rotation.set(0, -pose.psi, 0);
    rig.updateMatrixWorld(true);
    updateClip();
    if (follow) {
      const d = rig.position.clone().sub(before);
      camera.position.add(d);
      controls.target.add(d);
    }
    steelCapsDirty = true;
    updateTrack();
    apply();
    onPose?.({ ...pose }, track);
  }

  // The incidence plane cuts away the half facing the camera; beam drawings sit on the camera side of it.
  function updateClip() {
    const n = new THREE.Vector3(0, 0, -1).applyQuaternion(rig.quaternion);
    const flip = n.dot(new THREE.Vector3().subVectors(camera.position, rig.position)) > 0;
    if (flip) n.negate();
    clipPlane.normal.copy(n);
    clipPlane.constant = -n.dot(rig.position);
    if (beamGroup) beamGroup.scale.z = flip ? -1 : 1;
  }

  function setPose(x, y, psi, follow = false) {
    const cand = [[x, y], [x, pose.y], [pose.x, y]];
    for (const [cx, cy] of cand) {
      if (poseValid(cx, cy, psi)) {
        Object.assign(pose, { x: cx, y: cy, psi });
        applyPose(follow);
        return true;
      }
    }
    return false;
  }

  // Beam tracking: where the axis crosses the weld centre plane, and which defects lie in the beam
  // (fan between the edge rays in the incidence plane, element width laterally; secondary leg by unfolding).
  function updateTrack() {
    const sp = derived.parts[STEEL];
    const ph = derived.physics;
    track = { axis: null, hits: [] };
    if (!sp.weld) return;
    const c = Math.cos(pose.psi);
    const sn = Math.sin(pose.psi);
    const K = Math.tan((ph.beta_deg * Math.PI) / 180);
    const z1 = sp.z1;
    const zt = 2 * z1 - sp.z0;
    if (Math.abs(c) > 0.1) {
      const sc = (sp.weld.xc - pose.x) / c;
      const u = sc / K;
      if (sc > 0 && u <= zt) {
        const leg = u <= z1 ? 1 : 2;
        const z = leg === 1 ? u : 2 * z1 - u;
        track.axis = { leg, depth: z - sp.z0, s: sc, z };
      }
    }
    const tl = Math.tan((ph.beta_lower_edge_deg * Math.PI) / 180);
    const tu = Math.tan((ph.beta_upper_edge_deg * Math.PI) / 180);
    const tri = [[0, 0], [zt * tl, zt], [zt * tu, zt]];
    const hw = manifest.parameters.element_width.value / 2;
    const best = {};
    for (const o of [-hw, -hw / 2, 0, hw / 2, hw]) {
      for (const d of defectSections(sp, { x: pose.x - o * sn, y: pose.y + o * c, psi: pose.psi })) {
        const leg = polysTouch(d.poly, tri) ? 1 : polysTouch(d.poly.map(([s, z]) => [s, 2 * z1 - z]), tri) ? 2 : 0;
        if (leg && !(best[d.id] <= leg)) best[d.id] = leg;
      }
    }
    track.hits = Object.entries(best).map(([id, leg]) => ({ id, leg })).sort((a, b) => a.id.localeCompare(b.id));
    if (axisMark && track.axis) axisMark.position.copy(L2W(track.axis.s, 0.3, track.axis.z));
  }

  function buildGlow() {
    const sp = derived.parts[STEEL];
    for (const d of sp.defects || []) {
      let geo;
      if (d.shape === 'sphere') {
        geo = new THREE.SphereGeometry(d.r * MM, 20, 14);
        geo.translate(...L2W(...d.centre).toArray());
      } else {
        geo = new THREE.ExtrudeGeometry(new THREE.Shape(d.profile.map(([x, z]) => new THREE.Vector2(x, -z))), { depth: d.y1 - d.y0, bevelEnabled: false });
        geo.translate(0, 0, d.y0);
        geo.scale(MM, MM, MM);
      }
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xfde047, transparent: true, opacity: 0.9, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
      m.renderOrder = 22;
      m.visible = false;
      m.userData.partId = STEEL;
      scene.add(m);
      scene.updateMatrixWorld(true);
      parts[STEEL].attach(m);
      glow[d.id] = m;
    }
  }

  function nudge(right, away, step) {
    const f = new THREE.Vector3();
    camera.getWorldDirection(f);
    f.y = 0;
    if (f.lengthSq() < 1e-10) f.set(0, 0, -1);
    f.normalize();
    const r = new THREE.Vector3(-f.z, 0, f.x);
    const w = r.multiplyScalar(right).addScaledVector(f, away);
    const [dx, dy] = Math.abs(w.x) >= Math.abs(w.z) ? [Math.sign(w.x), 0] : [0, Math.sign(w.z)];
    setPose(pose.x + dx * step, pose.y + dy * step, pose.psi, true);
  }

  function tube(a, b, color, r = 0.25, depthTest = false) {
    const d = new THREE.Vector3().subVectors(b, a);
    const geo = new THREE.CylinderGeometry(r * MM, r * MM, d.length(), 12);
    const mat = new THREE.MeshBasicMaterial({ color, depthTest, transparent: true, opacity: 0.95 });
    const m = new THREE.Mesh(geo, mat);
    m.position.copy(a).addScaledVector(d, 0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    m.renderOrder = 20;
    return m;
  }

  function buildBeam(beamText) {
    const ph = derived.physics;
    const E = derived.element_centre_xz;
    const s = derived.parts.angle__steel_block;
    const K = Math.tan((ph.beta_deg * Math.PI) / 180);
    const yb = 0.6;
    const T = s.z1 - s.z0;
    const pE = L2W(E[0], yb, E[1]);
    const pI = L2W(0, yb, 0);
    const pB = L2W(s.z1 * K, yb, s.z1);
    const pC = L2W(s.z1 * K + T * K, yb, s.z0);
    const pF = L2W(derived.front_length_mm, yb, -0.2);
    const g = new THREE.Group();
    g.add(tube(pE, pI, 0xffb020));
    g.add(tube(pI, pB, 0xff4d2e, 0.25, true));
    g.add(tube(pB, pC, 0xff8a70, 0.18, true));
    g.add(tube(L2W(0, yb, -0.2), pF, 0x22d3ee, 0.15));
    const tl = Math.tan((ph.beta_lower_edge_deg * Math.PI) / 180);
    const tu = Math.tan((ph.beta_upper_edge_deg * Math.PI) / 180);
    const z1 = s.z1;
    const fanMat = new THREE.MeshBasicMaterial({ color: 0xff4d2e, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide });
    for (const [poly, k] of [[[[0, 0], [z1 * tl, z1], [z1 * tu, z1]], 1], [[[z1 * tl, z1], [(2 * z1 - s.z0) * tl, s.z0], [(2 * z1 - s.z0) * tu, s.z0], [z1 * tu, z1]], 0.6]]) {
      const geo = new THREE.ShapeGeometry(new THREE.Shape(poly.map(([x, z]) => new THREE.Vector2(x, -z))));
      geo.scale(MM, MM, 1);
      geo.translate(0, 0, 0.3 * MM);
      const m = fanMat.clone();
      m.opacity *= k;
      const fan = new THREE.Mesh(geo, m);
      fan.renderOrder = 19;
      g.add(fan);
    }
    axisMark = new THREE.Mesh(new THREE.SphereGeometry(0.8 * MM, 16, 12), new THREE.MeshBasicMaterial({ color: 0xfde047 }));
    axisMark.renderOrder = 21;
    axisMark.visible = false;
    g.add(axisMark);
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.9 * MM, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0x22d3ee, depthTest: false }));
    dot.position.copy(pI);
    dot.renderOrder = 21;
    g.add(dot);
    g.visible = false;
    rig.add(g);
    beamGroup = g;
    const mid = (a, b) => a.clone().lerp(b, 0.5);
    extraLabels.push(
      { id: 'beam:index', text: beamText.index_point, world: pI.clone(), beam: true },
      { id: 'beam:wedge', text: beamText.wedge_axis, world: mid(pE, pI), beam: true },
      { id: 'beam:shear', text: beamText.shear_axis, world: mid(pI, pB), beam: true },
      { id: 'beam:front', text: `${beamText.front_length} ${derived.front_length_mm.toFixed(0)} mm`, world: mid(L2W(0, yb, -0.2), pF), beam: true },
    );
  }

  async function load(beamText) {
    const gltf = await new GLTFLoader().loadAsync(glbUrl);
    scene.add(gltf.scene);
    for (const pid of ids) {
      const node = gltf.scene.getObjectByName(pid);
      parts[pid] = node;
      meshes[pid] = [];
      node.traverse((o) => {
        if (!o.isMesh) return;
        o.material = o.material.clone();
        const m = o.material;
        o.userData.partId = pid;
        o.userData.defect = m.name === 'mat_defect';
        o.userData.orig = { color: m.color.clone(), opacity: m.opacity, transparent: m.transparent, depthWrite: m.depthWrite, metalness: m.metalness ?? 0 };
        meshes[pid].push(o);
      });
    }
    scene.updateMatrixWorld(true);
    for (const pid of ids) if (onRig(pid)) rig.attach(parts[pid]);
    for (const pid of ids) {
      base[pid] = parts[pid].position.clone();
      const o = derived.explode_offsets_mm[pid] || [0, 0, 0];
      const w = L2W(o[0], o[1], o[2]);
      const parent = parts[pid].parent;
      const p0 = parent.worldToLocal(parts[pid].getWorldPosition(new THREE.Vector3()));
      const p1 = parent.worldToLocal(parts[pid].getWorldPosition(new THREE.Vector3()).add(w));
      offW[pid] = p1.sub(p0);
    }
    buildCaps();
    buildSteelCaps();
    buildBeam(beamText);
    buildGlow();
    // Lab table under the plate / probe contact plane.
    {
      const steelBox = new THREE.Box3().setFromObject(parts[STEEL]);
      const c = steelBox.getCenter(new THREE.Vector3());
      const lab = createLabTable({
        topY: steelBox.min.y,
        cx: c.x,
        cz: c.z,
        widthMm: 920,
        depthMm: 620,
        heightMm: 720,
      });
      lab.group.traverse((o) => { if (o.isMesh) o.raycast = () => {}; });
      scene.add(lab.group);
    }
    updateTrack();
    apply();
    resetView();
  }

  function effectiveOpacity(pid, mesh) {
    const o = mesh.userData.orig;
    if (state.solo && state.solo !== pid) return pid === STEEL ? 0.04 : GHOST_OPACITY;
    if (mesh.userData.defect) return 1;
    if (state.solo === STEEL || (pid === STEEL && !state.solo && state.defects)) return SOLO_STEEL_OPACITY;
    if (state.mode === 'xray' && !state.solo && XRAY_OPACITY[pid] !== undefined) return XRAY_OPACITY[pid];
    return o.opacity;
  }

  function apply() {
    if (state.mode === 'section' && steelCapsDirty && caps[STEEL]) buildSteelCaps();
    for (const pid of ids) {
      const hiddenWire = pid === 'angle__wiring' && state.explode > 0.001;
      parts[pid].visible = !hiddenWire;
      for (const mesh of meshes[pid]) {
        const m = mesh.material;
        const o = mesh.userData.orig;
        const op = effectiveOpacity(pid, mesh);
        const tr = op < 0.999 || o.transparent;
        if (m.transparent !== tr) m.needsUpdate = true;
        m.transparent = tr;
        m.opacity = op;
        m.depthWrite = op >= 0.5 ? o.depthWrite : false;
        const sel = (state.selected === pid || state.solo === pid) && !mesh.userData.defect;
        if (mesh.userData.defect) {
          m.emissive.copy(o.color);
          m.emissiveIntensity = state.solo === pid || ((state.mode === 'xray' || state.defects) && !state.solo) ? 0.9 : 0;
        } else {
          m.emissive.copy(sel ? HIGHLIGHT : new THREE.Color(0));
          m.emissiveIntensity = sel ? (state.solo ? 0.18 : 0.45) : 0;
        }
        const clip = state.mode === 'section' && partMeta[pid].cutaway === 'clip';
        const want = clip ? [clipPlane] : null;
        if ((m.clippingPlanes?.length || 0) !== (want?.length || 0)) m.needsUpdate = true;
        m.clippingPlanes = want;
        mesh.renderOrder = op < 0.5 ? 5 : pid === 'angle__wedge' ? 3 : 0;
      }
      for (const cap of caps[pid] || []) {
        cap.visible = state.mode === 'section' && !hiddenWire && (!state.solo || state.solo === pid);
        cap.material.emissive.copy(state.selected === pid ? HIGHLIGHT : new THREE.Color(0));
        cap.material.emissiveIntensity = state.selected === pid ? 0.4 : 0;
      }
      parts[pid].position.copy(base[pid]).addScaledVector(offW[pid], state.explode);
    }
    steelCapGroup.visible = state.explode < 0.001;
    if (beamGroup) beamGroup.visible = beamOn();
    if (axisMark) axisMark.visible = !!track.axis;
    const hit = new Set(track.hits.map((h) => h.id));
    for (const [id, m] of Object.entries(glow)) {
      m.visible = beamOn() && hit.has(id);
      const want = state.mode === 'section' ? [clipPlane] : null;
      if ((m.material.clippingPlanes?.length || 0) !== (want?.length || 0)) m.material.needsUpdate = true;
      m.material.clippingPlanes = want;
    }
  }

  function beamOn() {
    return state.beam && state.mode === 'section' && state.explode < 0.001 && !state.solo;
  }

  // ------------------------------------------------------------- camera
  function boxOf(pidList, explode = state.explode) {
    const keep = state.explode;
    state.explode = explode;
    for (const pid of ids) parts[pid].position.copy(base[pid]).addScaledVector(offW[pid], explode);
    scene.updateMatrixWorld(true);
    const box = new THREE.Box3();
    for (const pid of pidList) for (const m of meshes[pid]) box.expandByObject(m);
    state.explode = keep;
    apply();
    return box;
  }

  function frame(box, dir = null, pad = 1.15, minR = 0.012) {
    const c = box.getCenter(new THREE.Vector3());
    const r = Math.max(box.getSize(new THREE.Vector3()).length() / 2, minR);
    const d = dir ? dir.clone().normalize() : camera.position.clone().sub(controls.target).normalize();
    const fov = (camera.fov * Math.PI) / 180;
    const fit = Math.min(fov, 2 * Math.atan(Math.tan(fov / 2) * camera.aspect));
    const dist = (r * pad) / Math.sin(fit / 2);
    controls.target.copy(c);
    camera.position.copy(c).addScaledVector(d, dist);
    camera.near = dist / 200;
    camera.far = dist * 20;
    camera.updateProjectionMatrix();
    controls.update();
  }

  const DEFAULT_DIR = new THREE.Vector3(0.55, 0.42, 1.0);
  const SECTION_DIR = new THREE.Vector3(0.18, 0.16, 1.0);
  const PROBE = ['angle__housing', 'angle__connector', 'angle__couplant'];
  function resetView() {
    if (state.solo) return frameSolo();
    if (state.explode > 0.001) return frame(boxOf(ids.filter((p) => p !== 'angle__steel_block').concat([]), 1), DEFAULT_DIR, 1.05);
    const box = boxOf(PROBE);
    const s = derived.parts[STEEL];
    if (s.weld) {
      const a = s.weld.bead_half_width[0] + 4;
      box.expandByPoint(L2W(s.weld.xc - a, pose.y, s.z1)).expandByPoint(L2W(s.weld.xc + a, pose.y, s.z1));
    } else box.expandByPoint(L2W(derived.front_length_mm + 22, 0, 10));
    frame(box, state.mode === 'exterior' ? DEFAULT_DIR : SECTION_DIR, 0.92);
  }

  function frameSolo() {
    const pid = state.solo;
    const box = boxOf([pid], 0);
    if (pid === STEEL) {
      const s = derived.parts[STEEL];
      if (!s.weld) return frame(box, DEFAULT_DIR, 0.75);
      const wb = new THREE.Box3().setFromPoints([L2W(s.weld.xc - 45, s.y0, s.weld.cap_z[0]), L2W(s.weld.xc + 45, s.y1, s.weld.cap_z[1])]);
      return frame(wb, DEFAULT_DIR, 0.8);
    }
    const probe = boxOf(PROBE, 0);
    const c = box.getCenter(new THREE.Vector3());
    const r = Math.max(box.getSize(new THREE.Vector3()).length() / 2, 0.014);
    const b = new THREE.Box3().setFromCenterAndSize(c, new THREE.Vector3(r * 2, r * 2, r * 2));
    b.intersect(probe.expandByScalar(0.004)).isEmpty() ? frame(box, DEFAULT_DIR) : frame(b, DEFAULT_DIR, 1.1);
  }

  // ------------------------------------------------------------- labels
  function labelIds() {
    if (state.labelIds) return state.labelIds;
    if (state.solo) return [state.solo];
    if (state.explode > 0.001) return ids.filter((p) => p !== 'angle__wiring');
    if (state.mode === 'exterior') return [ASSEMBLY, 'angle__couplant', 'angle__steel_block'];
    if (state.mode === 'section') return ids.filter((p) => p !== 'angle__wiring');
    return ids;
  }

  function anchorWorld(pid) {
    const face = state.labelFace || (state.mode === 'exterior' || state.explode > 0.001 || state.solo ? 'front' : 'section');
    const a = anchorLocal[pid][face];
    if (pid === STEEL && face === 'section') {
      return L2W(pose.x + a[0] * Math.cos(pose.psi), pose.y + a[0] * Math.sin(pose.psi), a[2]);
    }
    const w = L2W(a[0], a[1], a[2]);
    const o = derived.explode_offsets_mm[pid] || [0, 0, 0];
    w.add(L2W(o[0], o[1], o[2]).multiplyScalar(state.explode));
    return onRig(pid) ? rig.localToWorld(w) : w;
  }

  const labelEls = new Map();
  function labelEl(id, text, clickable, plain) {
    let e = labelEls.get(id);
    if (!e) {
      e = document.createElement('div');
      e.className = 'callout' + (clickable ? ' clickable' : plain ? '' : ' beam');
      e.textContent = text;
      if (clickable) e.addEventListener('click', (ev) => { ev.stopPropagation(); select(id, true); });
      layer.appendChild(e);
      labelEls.set(id, e);
    }
    return e;
  }

  function updateLabels() {
    const w = el.clientWidth;
    const h = el.clientHeight;
    const items = [];
    if (state.labels) {
      for (const pid of labelIds()) {
        if (pid === ASSEMBLY) {
          items.push({ id: pid, text: assemblyName, world: anchorWorld('angle__housing'), clickable: false, plain: true });
          continue;
        }
        if (!parts[pid]?.visible) continue;
        items.push({ id: pid, text: names[pid], world: anchorWorld(pid), clickable: true });
      }
    }
    const allDefects = state.solo === STEEL || (state.defects && !state.solo && state.explode < 0.001);
    if (state.labels && (allDefects || beamOn())) {
      const o = derived.explode_offsets_mm[STEEL] || [0, 0, 0];
      const off = L2W(o[0], o[1], o[2]).multiplyScalar(state.explode);
      const hit = new Set(track.hits.map((h) => h.id));
      for (const d of derived.parts[STEEL].defects || []) {
        if (!allDefects && !hit.has(d.id)) continue;
        const [x, y, z] = defectCentre(d);
        items.push({ id: `defect:${d.id}`, text: `${d.id} ${defectNames?.[d.id] ?? ''}`, world: L2W(x, y, z).add(off), clickable: false });
      }
    }
    if (beamGroup?.visible) for (const l of extraLabels) items.push({ ...l, world: rig.localToWorld(l.world.clone()), clickable: false });
    const live = new Set(items.map((i) => i.id));
    for (const [id, e] of labelEls) e.style.display = live.has(id) ? '' : 'none';
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    if (!items.length) return;
    for (const it of items) {
      const p = it.world.clone().project(camera);
      it.sx = (p.x * 0.5 + 0.5) * w;
      it.sy = (-p.y * 0.5 + 0.5) * h;
      it.behind = p.z > 1;
    }
    const vis = items.filter((i) => !i.behind);
    const cx = vis.reduce((s, i) => s + i.sx, 0) / Math.max(vis.length, 1);
    const minX = Math.min(...vis.map((i) => i.sx));
    const maxX = Math.max(...vis.map((i) => i.sx));
    const cols = { L: vis.filter((i) => i.sx < cx), R: vis.filter((i) => i.sx >= cx) };
    const gap = 30;
    for (const [side, list] of Object.entries(cols)) {
      list.sort((a, b) => a.sy - b.sy);
      let y = -Infinity;
      for (const it of list) { it.ly = Math.max(it.sy, y + gap); y = it.ly; }
      const over = y - (h - 16);
      if (over > 0) {
        let lim = h - 16;
        for (let k = list.length - 1; k >= 0; k--) { list[k].ly = Math.min(list[k].ly, lim); lim = list[k].ly - gap; }
      }
      const colX = side === 'L' ? Math.max(12, minX - 70) : Math.min(w - 12, maxX + 70);
      for (const it of list) {
        const e = labelEl(it.id, it.text, it.clickable, it.plain);
        e.classList.toggle('selected', state.selected === it.id || state.solo === it.id);
        e.classList.toggle('left', side === 'L');
        const ew = e.offsetWidth;
        const lx = side === 'L' ? Math.max(4, colX - ew) : Math.min(w - ew - 4, colX);
        e.style.transform = `translate(${lx}px, ${it.ly - 13}px)`;
        const ex = side === 'L' ? lx + ew : lx;
        const line = document.createElementNS(SVGNS, 'polyline');
        const knee = side === 'L' ? ex + 14 : ex - 14;
        line.setAttribute('points', `${it.sx},${it.sy} ${knee},${it.ly} ${ex},${it.ly}`);
        line.setAttribute('class', it.clickable ? 'ag-lead' : 'ag-lead beam');
        svg.appendChild(line);
        const dot = document.createElementNS(SVGNS, 'circle');
        dot.setAttribute('cx', it.sx);
        dot.setAttribute('cy', it.sy);
        dot.setAttribute('r', 3);
        dot.setAttribute('class', it.clickable ? 'ag-dot' : 'ag-dot beam');
        svg.appendChild(dot);
      }
    }
    for (const it of items.filter((i) => i.behind)) labelEl(it.id, it.text, it.clickable).style.display = 'none';
  }

  // ------------------------------------------------------------- picking
  const ray = new THREE.Raycaster();
  let down = null;
  let drag = null;
  const surface = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  function castAt(e) {
    const r = renderer.domElement.getBoundingClientRect();
    ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
    const objs = [];
    for (const pid of ids) {
      if (!parts[pid].visible) continue;
      for (const m of meshes[pid]) objs.push(m);
      for (const c of caps[pid] || []) if (c.visible) objs.push(c);
    }
    const hits = ray.intersectObjects(objs, false).filter((h) => {
      const pid = h.object.userData.partId;
      return !(state.mode === 'section' && !h.object.userData.cap && partMeta[pid].cutaway === 'clip' && clipPlane.distanceToPoint(h.point) < -1e-6);
    });
    return hits.find((h) => h.object.userData.cap || h.object.material.opacity >= 0.5) || hits[0];
  }

  function surfacePoint() {
    const p = new THREE.Vector3();
    return ray.ray.intersectPlane(surface, p) ? p : null;
  }

  renderer.domElement.addEventListener('pointerdown', (e) => {
    down = [e.clientX, e.clientY];
    if (!state.scan || state.explode > 0.001 || state.solo || e.button !== 0) return;
    const hit = castAt(e);
    const p = hit && onRig(hit.object.userData.partId) ? surfacePoint() : null;
    if (!p) return;
    drag = { dx: pose.x - p.x / MM, dy: pose.y - p.z / MM };
    controls.enabled = false;
    renderer.domElement.setPointerCapture(e.pointerId);
    el.classList.add('dragging');
  });
  renderer.domElement.addEventListener('pointermove', (e) => {
    if (!drag) return;
    castAt(e);
    const p = surfacePoint();
    if (p) setPose(p.x / MM + drag.dx, p.z / MM + drag.dy, pose.psi);
  });
  renderer.domElement.addEventListener('pointerup', (e) => {
    if (drag) {
      drag = null;
      controls.enabled = true;
      el.classList.remove('dragging');
    }
    if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) return;
    const hit = castAt(e);
    select(hit ? hit.object.userData.partId : null, true);
  });

  function select(pid, fromUser = false) {
    state.selected = pid;
    apply();
    if (fromUser && onPick) onPick(pid);
  }

  // ------------------------------------------------------------- loop
  function resize() {
    const w = el.clientWidth || 1;
    const h = el.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(el);

  let active = true;
  let raf = 0;
  function tick(t) {
    raf = 0;
    if (!active) return;
    if (tween) {
      const k = Math.min(1, (t - tween.t0) / tween.ms);
      const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
      state.explode = tween.from + (tween.to - tween.from) * e;
      apply();
      tween.onStep?.(state.explode);
      if (k >= 1) tween = null;
    }
    for (const m of Object.values(glow)) if (m.visible) m.material.opacity = 0.55 + 0.4 * Math.sin(t * 0.008);
    controls.update();
    updateClip();
    renderer.render(scene, camera);
    updateLabels();
    raf = requestAnimationFrame(tick);
  }
  raf = requestAnimationFrame(tick);

  return {
    el,
    state,
    load,
    attach(slot) { slot.appendChild(el); resize(); },
    snapshot: (bg) => grabGl(renderer, scene, camera, bg),
    setActive(on) {
      active = !!on;
      if (active && !raf) { resize(); raf = requestAnimationFrame(tick); }
    },
    setMode(m) { state.mode = m; apply(); },
    setExplode(f) { tween = null; state.explode = f; apply(); },
    animateExplode(to, ms = 1400, onStep) { tween = { from: state.explode, to, t0: performance.now(), ms, onStep }; },
    setLabels(on, idsOverride = null, face = null) { state.labels = on; state.labelIds = idsOverride; state.labelFace = face; },
    setBeam(on) { state.beam = on; apply(); },
    setDefects(on) { state.defects = on; apply(); },
    setScan(on) { state.scan = on; },
    pose: () => ({ ...pose }),
    track: () => track,
    nudge,
    swivel(deg) {
      const psi = pose.psi + (deg * Math.PI) / 180;
      const sp = derived.parts[STEEL];
      const away = sp.weld && pose.x > sp.weld.xc ? 1 : -1;
      for (let k = 0; k <= 40; k++) if (setPose(pose.x + away * k * 0.5, pose.y, psi, true)) return true;
      return false;
    },
    switchSide() {
      const sp = derived.parts[STEEL];
      if (!sp.weld) return false;
      return setPose(2 * sp.weld.xc - pose.x, pose.y, Math.PI - pose.psi, true);
    },
    home() { Object.assign(pose, { x: 0, y: 0, psi: 0 }); applyPose(); resetView(); },
    moveTo: (x, y, psi = pose.psi) => setPose(x, y, psi),
    orbit(deg) {
      const off = camera.position.clone().sub(controls.target).applyAxisAngle(new THREE.Vector3(0, 1, 0), (deg * Math.PI) / 180);
      camera.position.copy(controls.target).add(off);
      controls.update();
    },
    zoom(f) {
      camera.position.copy(controls.target).add(camera.position.clone().sub(controls.target).multiplyScalar(f));
      controls.update();
    },
    onOrbit(fn) { controls.addEventListener('start', fn); },
    setSolo(pid) { state.solo = pid; state.selected = null; apply(); if (pid) frameSolo(); },
    select,
    resetView,
    frameAll(explode) {
      const box = boxOf(ids.filter((p) => p !== 'angle__steel_block'), explode);
      box.min.y -= 0.022;
      frame(box, DEFAULT_DIR, 0.98);
    },
    debug: { scene, camera, controls, parts, caps, renderer },
  };
}
