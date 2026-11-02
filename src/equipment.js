// Equipment bench (M7): layout from equipment_manifest, select / highlight, couplant bottle GLB,
// live system cable (assembly.js drives its plugs). Footprints are checked for overlap.
// Lab table hosts instrument / specimens / probe types (straight live + angle / PA / TOFD display).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { buildAngleDisplay, buildPautDisplay, buildPautInstrumentDisplay, buildTofdDisplay, placeOnBench, sitOnBench } from './probes-display.js';
import { buildBrush, buildPolisher, buildRuler } from './weld-prep.js';
import { drawTofd, SW as PA_SW, SH as PA_SH } from '@paut/screens.js';

const MM = 0.001;
const FONT = '"Microsoft YaHei","PingFang SC",system-ui,sans-serif';

function addNamePlate(root, text, wMm, hMm, pos) {
  if (!root) return;
  const cv = document.createElement('canvas');
  const px = 8;
  cv.width = Math.round(wMm * px);
  cv.height = Math.round(hMm * px);
  const g = cv.getContext('2d');
  g.fillStyle = '#f8fafc';
  g.fillRect(0, 0, cv.width, cv.height);
  g.strokeStyle = '#334155';
  g.lineWidth = 4;
  g.strokeRect(2, 2, cv.width - 4, cv.height - 4);
  g.fillStyle = '#0f172a';
  g.font = `700 ${Math.round(hMm * px * 0.55)}px ${FONT}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, cv.width / 2, cv.height / 2 + 1);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(wMm * MM, hMm * MM),
    new THREE.MeshBasicMaterial({ map: tex, transparent: false, depthWrite: true, toneMapped: false }),
  );
  mesh.position.set(pos.x, pos.y, pos.z);
  mesh.raycast = () => {};
  root.add(mesh);
  return mesh;
}

function addEngravedMark(root, text, wMm, hMm, worldPos, rotY = 0) {
  if (!root || root.userData[`eqMark:${text}`]) return null;
  const cv = document.createElement('canvas');
  const px = 10;
  cv.width = Math.round(wMm * px);
  cv.height = Math.round(hMm * px);
  const g = cv.getContext('2d');
  g.clearRect(0, 0, cv.width, cv.height);
  g.fillStyle = '#1e293b';
  g.font = `700 ${Math.round(hMm * px * 0.62)}px ${FONT}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, cv.width / 2, cv.height / 2 + 1);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(wMm * MM, hMm * MM),
    new THREE.MeshBasicMaterial({
      map: tex, transparent: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide,
    }),
  );
  mesh.position.copy(root.worldToLocal(worldPos.clone()));
  mesh.rotation.y = rotY;
  mesh.raycast = () => {};
  root.add(mesh);
  root.userData[`eqMark:${text}`] = mesh;
  return mesh;
}

function markBlockFace(root, text, wMm, hMm) {
  if (!root) return null;
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const cx = (box.min.x + box.max.x) / 2;
  const cy = box.min.y + Math.min(0.016, size.y * 0.55);
  const useZ = size.z <= size.x + 0.01;
  const world = useZ
    ? new THREE.Vector3(cx, cy, box.max.z + 0.0005)
    : new THREE.Vector3(box.max.x + 0.0005, cy, (box.min.z + box.max.z) / 2);
  return addEngravedMark(root, text, wMm, hMm, world, useZ ? 0 : Math.PI / 2);
}

function makeKitCase() {
  const g = new THREE.Group();
  g.name = 'eq__kitcase';
  const W = 0.42;
  const H = 0.14;
  const D = 0.28;
  const T = 0.01;
  const outer = new THREE.MeshStandardMaterial({ color: 0x1a1c1f, roughness: 0.38, metalness: 0.22 });
  const inner = new THREE.MeshStandardMaterial({ color: 0x4a5563, roughness: 0.55, metalness: 0.08, side: THREE.DoubleSide });
  const add = (w, h, d, mat, x, y, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
    return m;
  };
  add(W, T, D, outer, 0, T / 2, 0);
  add(W - T * 2, T, D - T * 2, inner, 0, T + 0.001, 0);
  add(W, H, T, outer, 0, H / 2, D / 2 - T / 2);
  add(W, H, T, outer, 0, H / 2, -(D / 2 - T / 2));
  add(T, H, D - T * 2, outer, W / 2 - T / 2, H / 2, 0);
  add(T, H, D - T * 2, outer, -(W / 2 - T / 2), H / 2, 0);
  add(W - T * 2, H - T, T * 0.4, inner, 0, H / 2, D / 2 - T - 0.002);
  add(W - T * 2, H - T, T * 0.4, inner, 0, H / 2, -(D / 2 - T - 0.002));
  add(T * 0.4, H - T, D - T * 2, inner, W / 2 - T - 0.002, H / 2, 0);
  add(T * 0.4, H - T, D - T * 2, inner, -(W / 2 - T - 0.002), H / 2, 0);
  const lidPivot = new THREE.Group();
  lidPivot.position.set(0, H, -D / 2);
  const lid = new THREE.Mesh(
    new THREE.BoxGeometry(W + 0.004, 0.028, D + 0.004),
    new THREE.MeshStandardMaterial({ color: 0x2b3038, roughness: 0.4, metalness: 0.2 }),
  );
  lid.position.set(0, 0.014, D / 2);
  lid.castShadow = true;
  const lining = new THREE.Mesh(
    new THREE.BoxGeometry(W - T * 2, 0.004, D - T * 2),
    inner,
  );
  lining.position.set(0, -0.001, D / 2);
  const stripe = new THREE.Mesh(
    new THREE.BoxGeometry(W + 0.01, 0.012, 0.02),
    new THREE.MeshStandardMaterial({ color: 0xc45c26, roughness: 0.45, metalness: 0.15 }),
  );
  stripe.position.set(0, 0.028, D);
  const handle = new THREE.Mesh(
    new THREE.TorusGeometry(0.055, 0.008, 8, 18, Math.PI),
    new THREE.MeshStandardMaterial({ color: 0xcfd6de, metalness: 0.65, roughness: 0.28 }),
  );
  handle.rotation.x = Math.PI / 2;
  handle.position.set(0, 0.038, D / 2);
  handle.castShadow = true;
  lidPivot.add(lid, lining, stripe, handle);
  g.add(lidPivot);
  g.userData.lid = lidPivot;
  sitOnBench(g);
  return g;
}

function orientCskIa(root) {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const s = box.getSize(new THREE.Vector3());
  if (s.y < 0.05 && s.z > 0.06) root.rotateX(-Math.PI / 2);
  else if (s.y < 0.05 && s.x > 0.06 && s.x < 0.14) root.rotateZ(Math.PI / 2);
  sitOnBench(root);
  markBlockFace(root, 'CSK-IA', 72, 16);
  return root;
}

export function createEquipment({
  scene, man, gltf, practice, instrument, root, rootBase, parts, benchY,
  angleGlbUrl, pautGlbUrl, tofdGlbUrl, pautInstrumentGlbUrl, cskIaGlbUrl,
}) {
  const items = man.equipment;
  const order = man.order;
  const group = new THREE.Group();
  group.name = 'equipment_bench';
  scene.add(group);
  const displays = new Map(); // id -> THREE.Object3D
  const drops = [];
  let cskStyle = 'plate'; // plate = compare block; angle = CSK-IA GLB; both = study bench

  // Couplant bottle from assets/equipment_generic.glb (origin = bottom centre).
  const bottle = gltf.scene.getObjectByName('eq__couplant');
  bottle.removeFromParent();
  bottle.traverse((m) => {
    if (!m.isMesh) return;
    m.material = m.material.clone();
    if (m.material.opacity < 1) { m.material.transparent = true; m.material.depthWrite = false; }
    m.castShadow = true;
  });
  const gel = bottle.getObjectByName('eq__couplant__gel');
  if (gel) gel.renderOrder = 1;
  const shell = bottle.getObjectByName('eq__couplant__bottle');
  if (shell) shell.renderOrder = 2;
  bottle.visible = false;
  addNamePlate(bottle, '耦合剂', 36, 14, { x: 0, y: 0.055, z: 0.026 });
  group.add(bottle);
  markBlockFace(practice?.specimens?.[items.eq__compare?.node]?.obj, '对比试块', 92, 16);
  markBlockFace(practice?.specimens?.[items.eq__cbii_2?.node]?.obj, 'CBII-2', 64, 14);
  const kitCase = makeKitCase();
  kitCase.visible = false;
  group.add(kitCase);

  // Cable: the live system cable (instrument.cableGroup, same plugs and jacket as the inspection system).
  const cable = instrument?.cableGroup || null;

  const meshEq = new Map(); // mesh -> equipment id
  const tag = (obj, id) => { obj.traverse((m) => { if (m.isMesh) meshEq.set(m, id); }); };

  let selected = null;
  let active = false;
  const probeHome = new THREE.Vector3();
  let probeStashed = false;
  const specHome = new Map(); // specimen id -> { pos, rotY }
  const instHome = new THREE.Vector3();
  let instYaw0 = 0;
  let instStashed = false;
  const instOff = items.eq__instrument?.bench_offset_mm || { dx: 0, dz: 0 };
  const layout = new Map(); // instrument / specimen id -> { x, z, yaw } (mm, rad) moved on the bench; kept until resetLayout()

  const placeAt = (obj, bench, liftY = 0) => {
    obj.position.set(bench.x_mm * MM, (benchY || 0) + liftY, bench.z_mm * MM);
    obj.rotation.y = ((bench.yaw_deg || 0) * Math.PI) / 180;
  };

  function displayKind(kind) {
    return kind === 'probe_display' || kind === 'instrument_display' || kind === 'block_display' || kind === 'accessory';
  }
  function cskCad() { return displays.get('eq__csk_ia') || null; }
  function applyCskVisual() {
    const cad = cskCad();
    if (cad) cad.visible = active && isShown('eq__csk_ia');
  }
  function setCskIaStyle(style) {
    cskStyle = style === 'angle' ? 'angle' : style === 'both' ? 'both' : 'plate';
    applyCskVisual();
    if (active) {
      bindPick();
      applyHighlight();
    }
  }
  function nodeOf(id) {
    if (id === 'eq__kitcase') return kitCase;
    const it = items[id];
    if (!it) return null;
    if (it.kind === 'instrument') return instrument?.place || null;
    if (it.kind === 'specimen') return practice?.specimens[it.node]?.obj || null;
    if (displayKind(it.kind)) return displays.get(id) || null;
    if (it.kind === 'probe') return root || null;
    if (id === 'eq__cable') return cable;
    if (id === 'eq__couplant') return bottle;
    return null;
  }
  const poseOf = (id) => {
    const o = nodeOf(id);
    return o ? { x: o.position.x / MM, z: o.position.z / MM, yaw: o.rotation.y } : null;
  };
  function setPose(id, p) {
    const o = nodeOf(id);
    if (!o) return;
    o.position.x = p.x * MM;
    o.position.z = p.z * MM;
    if (id === 'eq__kitcase' || displayKind(items[id]?.kind)) {
      o.position.y = (benchY || 0) + (o.userData.sitY || 0);
    }
    o.rotation.y = p.yaw;
    o.updateMatrixWorld(true);
    layout.set(id, { x: p.x, z: p.z, yaw: p.yaw });
  }
  const rigidIds = () => order.filter((id) => nodeOf(id));
  function displayIdOf(obj) {
    for (let o = obj; o; o = o.parent) {
      if (o === kitCase || o.name === 'eq__kitcase') return 'eq__kitcase';
      if (o.name && displays.has(o.name)) return o.name;
    }
    return null;
  }

  function placeInstrument() {
    if (layout.has('eq__instrument')) return setPose('eq__instrument', layout.get('eq__instrument'));
    instrument.place.position.set(instHome.x + instOff.dx * MM, instHome.y, instHome.z + instOff.dz * MM);
    instrument.place.rotation.y = instYaw0;
    instrument.place.updateMatrixWorld(true);
  }
  function placeSpecimen(id) {
    const s = practice.specimens[items[id].node];
    if (layout.has(id)) return setPose(id, layout.get(id));
    placeAt(s.obj, items[id].bench, s.T * MM);
    s.obj.updateMatrixWorld(true);
  }

  const layoutState = () => [...layout].map(([id, p]) => [id, { ...p }]);
  // Replaces the stored bench layout (exam / training swap, session restore); places the items when the bench is active.
  function loadLayout(list = []) {
    layout.clear();
    for (const [id, p] of list) if (items[id] || id === 'eq__kitcase') layout.set(id, { x: p.x, z: p.z, yaw: p.yaw });
    if (!active) return;
    if (instStashed) placeInstrument();
    for (const id of order) if (items[id].kind === 'specimen' && practice?.specimens[items[id].node]) placeSpecimen(id);
  }

  function resetLayout() {
    layout.clear();
    if (kitCase) delete kitCase.userData.laidOpen;
    if (!active) return;
    if (instStashed) placeInstrument();
    for (const id of order) if (items[id].kind === 'specimen' && practice?.specimens[items[id].node]) placeSpecimen(id);
    for (const [id, o] of displays) placeOnBench(o, items[id]?.bench || { x_mm: 0, z_mm: 0 }, benchY || 0);
  }

  const probeParts = () => (parts ? Object.values(parts).filter((p) => p.pid !== 'probe__steel_block' && p.pid !== 'probe__couplant') : []);

  function objectsOf(id) {
    if (id === 'eq__kitcase') return kitCase?.visible ? [kitCase] : [];
    const it = items[id];
    if (!it) return [];
    // Instrument body only (cable / plugs are runtime system__* parts and follow the probe).
    if (it.kind === 'instrument') return instrument ? instrument.parts.filter((p) => p.pid.startsWith('instrument__')).map((p) => p.obj) : [];
    if (it.kind === 'specimen') { const s = practice?.specimens[it.node]; return s ? [s.obj] : []; }
    if (it.kind === 'probe') return probeParts().filter((p) => p.obj.visible).map((p) => p.obj);
    if (displayKind(it.kind)) {
      const o = displays.get(id);
      return o && o.visible ? [o] : [];
    }
    if (id === 'eq__cable') return cable ? [cable] : [];
    if (id === 'eq__couplant') return [bottle];
    return [];
  }

  function mountDisplay(id, obj) {
    if (!obj) return;
    const prev = displays.get(id);
    if (prev) {
      prev.removeFromParent();
      displays.delete(id);
    }
    obj.visible = false;
    placeOnBench(obj, items[id]?.bench || { x_mm: 0, z_mm: 0 }, benchY || 0);
    group.add(obj);
    displays.set(id, obj);
    tag(obj, id);
  }

  // Angle / PA / TOFD teaching GLBs; PA host from paut_tofd_teaching_v1 (same as TOFD page).
  async function loadDisplays() {
    const loader = new GLTFLoader();
    const jobs = [];
    const hostUrl = pautInstrumentGlbUrl || tofdGlbUrl;
    if (hostUrl && items.eq__instrument_paut && !displays.has('eq__instrument_paut')) {
      jobs.push(loader.loadAsync(hostUrl).then((g) => {
        const c = document.createElement('canvas');
        c.width = PA_SW;
        c.height = PA_SH;
        drawTofd(c.getContext('2d'), { pos: 124, focus: 'image' });
        const scale = items.eq__instrument_paut.display_scale ?? 0.72;
        mountDisplay('eq__instrument_paut', buildPautInstrumentDisplay(g.scene, { screenCanvas: c, scale }));
      }).catch((err) => { console.warn('[equipment] PA instrument GLB failed', err); }));
    }
    if (angleGlbUrl && items.eq__probe_angle && !displays.has('eq__probe_angle')) {
      jobs.push(loader.loadAsync(angleGlbUrl).then((g) => mountDisplay('eq__probe_angle', buildAngleDisplay(g.scene))).catch(() => {}));
    }
    if (pautGlbUrl && items.eq__probe_paut && !displays.has('eq__probe_paut')) {
      jobs.push(loader.loadAsync(pautGlbUrl).then((g) => mountDisplay('eq__probe_paut', buildPautDisplay(g.scene))).catch(() => {}));
    }
    if (tofdGlbUrl && items.eq__probe_tofd && !displays.has('eq__probe_tofd')) {
      jobs.push(loader.loadAsync(tofdGlbUrl).then((g) => mountDisplay('eq__probe_tofd', buildTofdDisplay(g.scene))).catch(() => {}));
    }
    if (cskIaGlbUrl && items.eq__csk_ia && !displays.has('eq__csk_ia')) {
      jobs.push(loader.loadAsync(cskIaGlbUrl).then((g) => {
        const root = g.scene;
        root.name = 'eq__csk_ia';
        root.traverse((o) => {
          if (!o.isMesh) return;
          o.material = Array.isArray(o.material) ? o.material.map((m) => m.clone()) : o.material.clone();
          o.castShadow = true;
          o.receiveShadow = true;
        });
        mountDisplay('eq__csk_ia', orientCskIa(root));
      }).catch((err) => { console.warn('[equipment] CSK-IA GLB failed', err); }));
    }
    if (items.eq__brush && !displays.has('eq__brush')) mountDisplay('eq__brush', buildBrush());
    if (items.eq__grinder && !displays.has('eq__grinder')) mountDisplay('eq__grinder', buildPolisher());
    if (items.eq__ruler && !displays.has('eq__ruler')) mountDisplay('eq__ruler', buildRuler());
    await Promise.all(jobs);
    if (active) applyMethodFilter();
  }
  const displaysReady = loadDisplays();

  // An instrument part groups several model nodes (housing + bumpers + stand) but keeps only one as `obj`: tag its meshes.
  function bindPick() {
    meshEq.clear();
    if (kitCase) tag(kitCase, 'eq__kitcase');
    for (const id of order) {
      const objs = items[id]?.kind === 'instrument' && instrument
        ? instrument.parts.filter((p) => p.pid.startsWith('instrument__')).flatMap((p) => p.meshes)
        : objectsOf(id);
      for (const o of objs) tag(o, id);
    }
  }

  function applyHighlight() {
    const dim = (obj) => {
      if (!obj) return;
      obj.traverse((m) => {
        if (!m.isMesh || !m.material || !m.material.emissive) return;
        if (!m.userData._eqBase) {
          m.userData._eqBase = {
            e: m.material.emissive.clone(),
            ei: m.material.emissiveIntensity ?? 0,
            op: m.material.opacity,
            tr: m.material.transparent,
          };
        }
        const b = m.userData._eqBase;
        if (!selected) {
          m.material.emissive.copy(b.e);
          m.material.emissiveIntensity = b.ei;
          m.material.opacity = b.op;
          m.material.transparent = b.tr;
        } else if (meshEq.get(m) === selected) {
          m.material.emissive.setRGB(0.12, 0.55, 0.48);
          m.material.emissiveIntensity = 0.45;
          m.material.opacity = b.op;
          m.material.transparent = b.tr;
        } else {
          m.material.emissive.copy(b.e);
          m.material.emissiveIntensity = b.ei;
          m.material.transparent = true;
          m.material.opacity = Math.min(b.op, 0.28);
        }
      });
    };
    dim(kitCase);
    dim(bottle);
    dim(cable);
    if (instrument) for (const p of instrument.parts) dim(p.obj);
    if (practice) for (const s of Object.values(practice.specimens)) dim(s.obj);
    if (root) dim(root);
    for (const o of displays.values()) dim(o);
  }

  function clearHighlight() {
    selected = null;
    const restore = (obj) => {
      if (!obj) return;
      obj.traverse((m) => {
        if (!m.isMesh || !m.userData._eqBase) return;
        const b = m.userData._eqBase;
        m.material.emissive.copy(b.e);
        m.material.emissiveIntensity = b.ei;
        m.material.opacity = b.op;
        m.material.transparent = b.tr;
      });
    };
    restore(kitCase);
    restore(bottle);
    restore(cable);
    if (instrument) for (const p of instrument.parts) restore(p.obj);
    if (practice) for (const s of Object.values(practice.specimens)) restore(s.obj);
    if (root) restore(root);
    for (const o of displays.values()) restore(o);
  }

  const tmpBox = new THREE.Box3();
  function boxOf(id) {
    const box = new THREE.Box3();
    for (const o of objectsOf(id)) {
      o.updateMatrixWorld(true);
      tmpBox.setFromObject(o, true);
      if (!tmpBox.isEmpty()) box.union(tmpBox);
    }
    return box;
  }

  // World AABB per item in the bench plane, mm (x0, x1, z0, z1).
  function footprints() {
    const out = {};
    for (const id of order) {
      const b = boxOf(id);
      if (b.isEmpty()) continue;
      out[id] = { x0: b.min.x / MM, x1: b.max.x / MM, z0: b.min.z / MM, z1: b.max.z / MM, y0: b.min.y / MM, y1: b.max.y / MM };
    }
    return out;
  }

  // Convex hull of the item's vertices projected on the bench plane (XZ, mm).
  const tv = new THREE.Vector3();
  function hullOf(id) {
    const pts = [];
    for (const o of objectsOf(id)) {
      o.updateMatrixWorld(true);
      o.traverse((m) => {
        if (!m.isMesh || !m.geometry?.attributes?.position) return;
        const pos = m.geometry.attributes.position;
        const step = Math.max(1, Math.floor(pos.count / 400));
        for (let k = 0; k < pos.count; k += step) {
          tv.fromBufferAttribute(pos, k).applyMatrix4(m.matrixWorld);
          pts.push([tv.x / MM, tv.z / MM]);
        }
      });
    }
    if (pts.length < 3) return pts;
    pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lo = [], hi = [];
    for (const p of pts) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
    for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (hi.length >= 2 && cross(hi[hi.length - 2], hi[hi.length - 1], p) <= 0) hi.pop(); hi.push(p); }
    return lo.slice(0, -1).concat(hi.slice(0, -1));
  }

  // Separating-axis gap between two convex polygons (negative = overlap), mm.
  function hullGap(A, B) {
    let best = -Infinity;
    for (const P of [A, B]) {
      for (let i = 0; i < P.length; i++) {
        const p = P[i], q = P[(i + 1) % P.length];
        const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
        if (len < 1e-6) continue;
        const nx = -(q[1] - p[1]) / len, nz = (q[0] - p[0]) / len;
        let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
        for (const v of A) { const d = v[0] * nx + v[1] * nz; a0 = Math.min(a0, d); a1 = Math.max(a1, d); }
        for (const v of B) { const d = v[0] * nx + v[1] * nz; b0 = Math.min(b0, d); b1 = Math.max(b1, d); }
        best = Math.max(best, b0 - a1, a0 - b1);
      }
    }
    return best;
  }

  // Smallest separation between any two bench items (convex footprints), mm, ascending.
  function gaps() {
    const ids = order.filter((id) => objectsOf(id).length);
    const H = Object.fromEntries(ids.map((id) => [id, hullOf(id)]));
    const pairs = [];
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) pairs.push({ a: ids[i], b: ids[j], gap: hullGap(H[ids[i]], H[ids[j]]) });
    }
    pairs.sort((p, q) => p.gap - q.gap);
    return pairs;
  }

  // Gap (mm, negative = overlap) between a disc (cx, cz, r) on the bench and every other item's hull.
  function clearance(cx, cz, r, ignore = []) {
    let best = Infinity;
    for (const id of order) {
      if (ignore.includes(id) || !objectsOf(id).length) continue;
      const H = hullOf(id);
      if (H.length < 3) continue;
      let inside = true;
      let dmin = Infinity;
      for (let i = 0; i < H.length; i++) {
        const p = H[i], q = H[(i + 1) % H.length];
        const ex = q[0] - p[0], ez = q[1] - p[1];
        if (ex * (cz - p[1]) - ez * (cx - p[0]) < 0) inside = false;
        const L2 = ex * ex + ez * ez || 1e-9;
        const t = Math.max(0, Math.min(1, ((cx - p[0]) * ex + (cz - p[1]) * ez) / L2));
        dmin = Math.min(dmin, Math.hypot(cx - p[0] - t * ex, cz - p[1] - t * ez));
      }
      best = Math.min(best, (inside ? -dmin : dmin) - r);
    }
    return best;
  }

  function focusPose(id) {
    const b = boxOf(id);
    if (b.isEmpty()) return null;
    const c = b.getCenter(new THREE.Vector3());
    const s = b.getSize(new THREE.Vector3());
    const dist = Math.max(0.32, Math.max(s.x, s.y, s.z) * 2.4);
    return { target: [c.x, c.y, c.z], dir: [0.45, 0.6, 1], dist };
  }

  function setSelected(id) {
    selected = items[id] ? id : null;
    applyHighlight();
    return selected;
  }

  function pickFromHits(hits) {
    for (const h of hits) {
      const id = meshEq.get(h.object);
      if (id) return id;
    }
    return null;
  }

  /** Restrict which bench items are shown (self-study method filter). null = all. */
  let methodFilter = null;
  function setMethodFilter(ids) {
    methodFilter = ids ? new Set(ids) : null;
    if (active) applyMethodFilter();
  }
  function allowed(id) {
    return !methodFilter || methodFilter.has(id);
  }
  function isShown(id) {
    if (items[id]?.kind === 'accessory') return !!methodFilter && allowed(id);
    return allowed(id);
  }
  function applyMethodFilter() {
    if (!active) return;
    if (instrument) instrument.setVisible(isShown('eq__instrument'), { bench: true });
    if (bottle) bottle.visible = isShown('eq__couplant');
    if (root) root.visible = isShown('eq__probe_straight');
    if (cable) cable.visible = isShown('eq__cable');
    for (const [id, o] of displays) o.visible = isShown(id);
    if (practice) {
      const specs = [];
      for (const id of order) {
        const eq = items[id];
        if (eq.kind !== 'specimen' || !isShown(id)) continue;
        const s = practice.specimens[eq.node];
        if (s) specs.push(eq.node);
      }
      practice.showMany(specs);
    }
    applyCskVisual();
    bindPick();
    applyHighlight();
  }

  function setActive(on) {
    active = on;
    if (!on) {
      bottle.visible = false;
      if (kitCase) kitCase.visible = false;
      for (const o of displays.values()) o.visible = false;
      clearHighlight();
      for (const [sid, h] of specHome) {
        const s = practice?.specimens[sid];
        if (!s) continue;
        s.obj.position.copy(h.pos);
        s.obj.rotation.y = h.rotY;
        s.obj.updateMatrixWorld(true);
      }
      if (probeStashed && root) {
        root.position.copy(probeHome);
        probeStashed = false;
      }
      if (instStashed && instrument?.place) {
        instrument.place.position.copy(instHome);
        instrument.place.rotation.y = instYaw0;
        instrument.place.updateMatrixWorld(true);
        instStashed = false;
      }
      if (practice) practice.show(null);
      return;
    }
    if (instrument?.place && !instStashed) {
      instHome.copy(instrument.place.position);
      instYaw0 = instrument.place.rotation.y;
      instStashed = true;
      placeInstrument();
    }
    if (practice) {
      const specs = [];
      for (const id of order) {
        const eq = items[id];
        if (eq.kind !== 'specimen') continue;
        const s = practice.specimens[eq.node];
        if (!s) continue;
        if (!specHome.has(eq.node)) specHome.set(eq.node, { pos: s.obj.position.clone(), rotY: s.obj.rotation.y });
        placeSpecimen(id);
        if (isShown(id)) specs.push(eq.node);
      }
      practice.showMany(specs);
    }
    if (instrument) instrument.setVisible(true);
    if (parts) {
      if (parts.probe__steel_block) parts.probe__steel_block.obj.visible = false;
      if (parts.probe__couplant) parts.probe__couplant.obj.visible = false;
    }
    if (root) {
      if (!probeStashed) {
        probeHome.copy(root.position);
        probeStashed = true;
      }
      // Wear face (probe frame y = 0) rests on the bench top.
      const pb = items.eq__probe_straight.bench;
      root.position.copy(rootBase || new THREE.Vector3()).add(new THREE.Vector3(pb.x_mm * MM, benchY || 0, pb.z_mm * MM));
      root.updateMatrixWorld(true);
    }
    placeAt(bottle, items.eq__couplant.bench, 0);
    bottle.visible = isShown('eq__couplant');
    for (const [id, o] of displays) {
      if (layout.has(id)) setPose(id, layout.get(id));
      else placeOnBench(o, items[id]?.bench || { x_mm: 0, z_mm: 0 }, benchY || 0);
      o.visible = isShown(id);
    }
    displaysReady.then(() => {
      if (!active) return;
      for (const [id, o] of displays) {
        if (layout.has(id)) setPose(id, layout.get(id));
        else placeOnBench(o, items[id]?.bench || { x_mm: 0, z_mm: 0 }, benchY || 0);
        o.visible = isShown(id);
      }
      applyMethodFilter();
    });
    applyMethodFilter();
    applyCskVisual();
  }

  function pickMeshes() {
    const out = [];
    if (kitCase?.visible) kitCase.traverse((m) => { if (m.isMesh) out.push(m); });
    if (bottle.visible) bottle.traverse((m) => { if (m.isMesh) out.push(m); });
    for (const id of order) {
      if (items[id].kind !== 'specimen' || !isShown(id)) continue;
      nodeOf(id)?.traverse((m) => { if (m.isMesh) out.push(m); });
    }
    for (const [id, o] of displays) {
      if (!isShown(id) || !o.visible) continue;
      o.traverse((m) => { if (m.isMesh) out.push(m); });
    }
    return out;
  }

  // Smallest hull gap (mm, negative = overlap) between item id and every other item not in ignore.
  function gapOf(id, ignore = []) {
    const A = hullOf(id);
    let best = Infinity;
    for (const o of order) {
      if (o === id || ignore.includes(o) || !objectsOf(o).length) continue;
      const B = hullOf(o);
      if (A.length >= 3 && B.length >= 3) best = Math.min(best, hullGap(A, B));
    }
    return best;
  }

  // Centre (mm) and circumradius about it of the item's bench-plane hull.
  function hullCircle(id) {
    const H = hullOf(id);
    if (!H.length) return null;
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const [x, z] of H) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    return { x: cx, z: cz, r: Math.max(...H.map(([x, z]) => Math.hypot(x - cx, z - cz))) };
  }

  function connectorWorld(id) {
    const o = displays.get(id);
    if (!o || !o.visible) return null;
    const node = o.getObjectByName(id === 'eq__probe_angle' ? 'angle__connector' : 'probe__connector');
    if (!node) return null;
    node.updateWorldMatrix?.(true, false);
    const box = new THREE.Box3().setFromObject(node);
    if (box.isEmpty()) return null;
    return {
      pos: new THREE.Vector3((box.min.x + box.max.x) / 2, box.max.y, (box.min.z + box.max.z) / 2),
      dir: new THREE.Vector3(0, 1, 0),
    };
  }

  function setKitCase({ show = false, open = false } = {}) {
    if (!kitCase) return;
    kitCase.visible = !!show && active;
    const lid = kitCase.userData.lid;
    if (lid) lid.rotation.x = open ? -1.45 : 0;
    const sit = kitCase.userData.sitY || 0;
    if (show) {
      if (layout.has('eq__kitcase') && kitCase.userData.laidOpen === !!open) {
        setPose('eq__kitcase', layout.get('eq__kitcase'));
      } else {
        const bench = open
          ? { x_mm: -480, z_mm: -60, yaw_deg: 18 }
          : { x_mm: 220, z_mm: -80, yaw_deg: -12 };
        placeAt(kitCase, bench, sit);
        layout.set('eq__kitcase', { x: bench.x_mm, z: bench.z_mm, yaw: (bench.yaw_deg * Math.PI) / 180 });
        kitCase.userData.laidOpen = !!open;
      }
      if (open && instrument?.place && instStashed && !layout.has('eq__instrument')) {
        setPose('eq__instrument', { x: 50, z: -70, yaw: instYaw0 });
      }
    }
    if (active) bindPick();
  }

  function dropIn(id, delay = 0, ms = 560) {
    const obj = nodeOf(id);
    if (!obj) return;
    obj.visible = true;
    const y1 = obj.position.y;
    obj.position.y = y1 + 0.16;
    drops.push({ obj, y0: obj.position.y, y1, t0: performance.now() + delay, ms });
  }
  function tick(now) {
    for (let i = drops.length - 1; i >= 0; i--) {
      const d = drops[i];
      if (now < d.t0) continue;
      const u = Math.min(1, Math.max(0, (now - d.t0) / d.ms));
      const k = 1 - (1 - u) ** 3;
      d.obj.position.y = d.y0 + (d.y1 - d.y0) * k + Math.sin(k * Math.PI) * 0.012 * (1 - k);
      if (u >= 1) drops.splice(i, 1);
    }
  }

  return {
    setActive, setSelected, setMethodFilter, setCskIaStyle, setKitCase, pickFromHits, pickMeshes, focusPose, footprints, gaps, hullOf, clearance, order, items, bottle,
    nodeOf, poseOf, setPose, rigidIds, resetLayout, layoutState, loadLayout, gapOf, hullCircle, loadDisplays, displaysReady,
    displayIdOf, connectorWorld, dropIn, tick,
    get selected() { return selected; },
    get active() { return active; },
    get cskStyle() { return cskStyle; },
  };
}
