// Angle-beam practice bench: flaw detector (instrument GLB, keys, encoder, live screen, cable), the angle probe
// (probe_angle_beam.glb), CSK blocks, and the same X80 weld plate mesh as the structure view (angle__steel_block).
// One WebGL view shared by the calibration and scanning pages.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createInstrument } from '../instrument.js';
import { U6, SPHERE } from './model.js';
import { keyLabels } from './scope.js';
import instGlbUrl from '../../../assets/instrument_generic.glb?url';
import eqGlbUrl from '../../../assets/equipment_generic.glb?url';
import straightGlbUrl from '../../../assets/probe_single_contact.glb?url';
import pautProbeGlbUrl from '../../../assets/pa_probe_parts.glb?url';
import tofdProbeGlbUrl from '../../../assets/tofd_probe_parts.glb?url';
import specimensGlbUrl from '../../../assets/specimens_generic.glb?url';
import cskIaGlbUrl from '../../../assets/csk_ia.glb?url';
import pautInstrumentGlbUrl from '@paut-assets/tofd_teaching.glb?url';
import instMan0 from '../../../contracts/instrument_manifest.json';
import eqMan from '../../../contracts/equipment_manifest.json';
import derived from '../../../contracts/angle_derived_layout.json';
import AB from '../../../knowledge/angle_bench.json';
import { savePng, shotName, grabGl, backdropOf } from '../snapshot.js';
import {
  buildStraightDisplay, buildAngleDisplay, buildPautDisplay, buildTofdDisplay,
  buildPautInstrumentDisplay, placeOnBench,
} from '../probes-display.js';
import { drawTofd, SW as PA_SW, SH as PA_SH } from '@paut/screens.js';

const MM = 0.001;
const EQ = eqMan.equipment || {};
const BENCH_Y = (instMan0.system_layout?.bench_top_y_mm ?? -50) * MM;
const STEEL = 'angle__steel_block';
const LEG_C = ['#f87171', '#fbbf24', '#94a3b8'];
const VIEW_KEYS = ['system', 'probe', 'screen', 'panel', 'cutaway'];
const instBench = EQ.eq__instrument?.bench || { x_mm: -260, z_mm: -170, yaw_deg: 35 };
const instMan = {
  ...instMan0,
  system_layout: {
    ...instMan0.system_layout,
    bench_top_y_mm: BENCH_Y / MM,
    instrument: {
      ...instMan0.system_layout.instrument,
      position_mm: [instBench.x_mm, BENCH_Y / MM, instBench.z_mm],
      yaw_deg: instBench.yaw_deg ?? 35,
    },
  },
};

function sitObject(obj, bench, benchY = BENCH_Y) {
  if (!obj || !bench) return;
  obj.position.set(0, 0, 0);
  obj.rotation.set(0, 0, 0);
  obj.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(obj);
  obj.userData.sitY = box.isEmpty() ? 0 : -box.min.y;
  placeOnBench(obj, bench, benchY);
}

const make = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

function fold(w, T) {
  if (!Number.isFinite(T)) return w;
  const r = ((Math.abs(w) % (2 * T)) + 2 * T) % (2 * T);
  return r > T ? 2 * T - r : r;
}

function steelMat() {
  return new THREE.MeshStandardMaterial({ color: 0xb4bcc6, metalness: 0.55, roughness: 0.38, envMapIntensity: 0.9 });
}

function circle(x, y, r) {
  const p = new THREE.Path();
  p.absarc(x, y, r, 0, Math.PI * 2, false);
  return p;
}

function decal(wMm, hMm, pxPerMm, draw) {
  const cv = document.createElement('canvas');
  cv.width = Math.round(wMm * pxPerMm);
  cv.height = Math.round(hMm * pxPerMm);
  const g = cv.getContext('2d');
  g.scale(pxPerMm, pxPerMm);
  draw(g);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(wMm, hMm),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, toneMapped: false }),
  );
  mesh.raycast = () => {};
  mesh.renderOrder = 2;
  return mesh;
}

const FONT = '"Microsoft YaHei", "PingFang SC", system-ui, sans-serif';

let cskIaCadRoot = null;

function addCskIaMarks(g, blk, zFace) {
  const L = blk.length_mm;
  const H = blk.height_mm;
  const xc = blk.arc_centre_x_mm;
  const front = decal(L, 34, 6, (c) => {
    c.strokeStyle = '#1f2937';
    c.fillStyle = '#1f2937';
    c.lineWidth = 0.35;
    const h = blk.hole50;
    for (let k = 1.5; k <= 3.0001; k += 0.1) {
      const x = h.x_mm + h.z_mm * k;
      const major = Object.values(blk.k_marks_top).some((v) => Math.abs(v - x) < 1e-6);
      c.beginPath();
      c.moveTo(x, 0);
      c.lineTo(x, major ? 7 : 3.5);
      c.stroke();
    }
    c.font = `600 4.2px ${FONT}`;
    c.textAlign = 'center';
    c.textBaseline = 'top';
    for (const [k, x] of Object.entries(blk.k_marks_top)) c.fillText(k, x, 8);
    c.lineWidth = 0.5;
    c.beginPath();
    c.moveTo(xc, 0);
    c.lineTo(xc, 8);
    c.stroke();
    c.fillText('O', xc, 9);
  });
  front.position.set(L / 2, -17, zFace);
  const name = decal(70, 12, 6, (c) => {
    c.fillStyle = '#334155';
    c.font = `700 8px ${FONT}`;
    c.textBaseline = 'middle';
    c.fillText('CSK-IA', 2, 6);
  });
  name.position.set(38 + 35, -(H - 14), zFace);
  g.add(front, name);
}

function wrapCskIaCad(src, blk) {
  const g = new THREE.Group();
  const c = src.clone(true);
  c.traverse((o) => {
    if (!o.isMesh) return;
    o.material = Array.isArray(o.material) ? o.material.map((m) => m.clone()) : o.material.clone();
    o.castShadow = true;
    o.receiveShadow = true;
  });
  g.add(c);
  g.updateMatrixWorld(true);
  let box = new THREE.Box3().setFromObject(g);
  if (box.max.x - box.min.x < 2) c.scale.setScalar(1000);
  g.updateMatrixWorld(true);
  box.setFromObject(g);
  const L = blk.length_mm;
  const H = blk.height_mm;
  const Wd = blk.width_mm;
  addCskIaMarks(g, blk, box.max.z + 0.02);
  return {
    group: g,
    mats: [],
    L,
    W: Wd,
    H,
    bottom: H,
    ox: (box.min.x + box.max.x) / 2,
    oy: (box.min.z + box.max.z) / 2,
    py0: Wd / 2,
  };
}

// ---------------------------------------------------------------- specimens (mm frame: X = x, Y = -z, Z = y)
function buildCskIa(blk) {
  if (cskIaCadRoot) return wrapCskIaCad(cskIaCadRoot, blk);
  const g = new THREE.Group();
  const L = blk.length_mm;
  const H = blk.height_mm;
  const Wd = blk.width_mm;
  const xc = blk.arc_centre_x_mm;
  const R = Math.max(...blk.arcs.map((a) => a.R_mm));
  const r = Math.min(...blk.arcs.map((a) => a.R_mm));
  const holes = [blk.hole50, blk.hole1_5];
  const mat = steelMat();
  const shapeR = new THREE.Shape();
  shapeR.moveTo(0, 0);
  shapeR.lineTo(xc + R, 0);
  shapeR.absarc(xc, 0, R, 0, -Math.PI / 2, true);
  shapeR.lineTo(0, -H);
  shapeR.lineTo(0, 0);
  const shapeS = new THREE.Shape();
  shapeS.moveTo(0, 0);
  shapeS.lineTo(xc + r, 0);
  shapeS.absarc(xc, 0, r, 0, -Math.PI / 2, true);
  shapeS.lineTo(xc, -H);
  shapeS.lineTo(0, -H);
  shapeS.lineTo(0, 0);
  for (const s of [shapeR, shapeS]) for (const h of holes) s.holes.push(circle(h.x_mm, -h.z_mm, h.phi_mm / 2));
  const half = Wd / 2;
  const a = new THREE.Mesh(new THREE.ExtrudeGeometry(shapeR, { depth: half, bevelEnabled: false, curveSegments: 72 }), mat);
  const b = new THREE.Mesh(new THREE.ExtrudeGeometry(shapeS, { depth: half, bevelEnabled: false, curveSegments: 72 }), mat);
  b.position.z = half;
  g.add(a, b);
  addCskIaMarks(g, blk, Wd + 0.02);
  return { group: g, mats: [mat], L, W: Wd, H, bottom: H, ox: L / 2, oy: Wd / 2, py0: Wd / 2 };
}

function buildCskIia1(blk) {
  const g = new THREE.Group();
  const L = blk.length_mm;
  const H = blk.T_mm;
  const Wd = blk.hole_length_mm;
  const mat = steelMat();
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.lineTo(L, 0);
  s.lineTo(L, -H);
  s.lineTo(0, -H);
  s.lineTo(0, 0);
  for (const h of blk.holes) s.holes.push(circle(h.x_mm, -h.z_mm, Math.max(blk.hole_phi_mm / 2, 1)));
  const m = new THREE.Mesh(new THREE.ExtrudeGeometry(s, { depth: Wd, bevelEnabled: false, curveSegments: 24 }), mat);
  m.position.z = -Wd / 2;
  g.add(m);
  const front = decal(L, H, 6, (c) => {
    c.fillStyle = '#334155';
    c.font = `600 3.6px ${FONT}`;
    c.textBaseline = 'middle';
    for (const h of blk.holes) {
      c.textAlign = h.x_mm < L / 2 ? 'left' : 'right';
      c.fillText(String(h.z_mm), h.x_mm + (h.x_mm < L / 2 ? 2.4 : -2.4), h.z_mm);
    }
    c.font = `700 6px ${FONT}`;
    c.textAlign = 'center';
    c.fillText('CSK-IIA-1', L / 2, H - 8);
  });
  front.position.set(L / 2, -H / 2, Wd / 2 + 0.02);
  g.add(front);
  return { group: g, mats: [mat], L, W: Wd, H, bottom: H, ox: L / 2, oy: 0, py0: 0 };
}

/** Prep-gate overview: structure-view GLB (angle__steel_block). Scan practice uses buildWeldScan. */
function buildWeldKit(spec, steelTemplate) {
  const g = new THREE.Group();
  const [x0, x1] = spec.x_mm;
  const [y0, y1] = spec.y_mm;
  const t = spec.t_mm;
  const ch = spec.cap.height_mm;
  const Wd = y1 - y0;
  const mats = [];
  const lay = derived.parts?.[STEEL];
  const xc = lay?.weld?.xc ?? 24;
  const yStruct0 = lay?.y0 ?? -215;
  const capZ1 = lay?.weld?.cap_z?.[1] ?? (t + ch);
  const hold = new THREE.Group();
  hold.scale.setScalar(1 / MM);
  const plate = steelTemplate.clone(true);
  plate.traverse((o) => {
    if (!o.isMesh) return;
    o.material = Array.isArray(o.material) ? o.material.map((m) => m.clone()) : o.material.clone();
    for (const m of (Array.isArray(o.material) ? o.material : [o.material])) mats.push(m);
  });
  plate.position.set(-xc * MM, 0, -yStruct0 * MM);
  hold.add(plate);
  g.add(hold);
  return { group: g, mats, L: x1 - x0, W: Wd, H: t, bottom: Math.max(capZ1, t + ch), ox: 0, oy: (y0 + y1) / 2, py0: (y0 + y1) / 2, overlay: null };
}

/** Scan / exam practice plate: procedural model (probe + A-scan work against this geometry). */
function buildWeldScan(spec) {
  const g = new THREE.Group();
  const [x0, x1] = spec.x_mm;
  const [y0, y1] = spec.y_mm;
  const t = spec.t_mm;
  const hw = spec.cap.half_width_mm;
  const ch = spec.cap.height_mm;
  const Wd = y1 - y0;
  const mat = steelMat();
  const wmat = new THREE.MeshStandardMaterial({ color: 0x8f8170, metalness: 0.45, roughness: 0.55, envMapIntensity: 0.8 });
  for (const sd of [-1, 1]) {
    const w = (sd < 0 ? -x0 : x1) - hw;
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, t, Wd), mat);
    b.position.set(sd * (hw + w / 2), -t / 2, y0 + Wd / 2);
    g.add(b);
  }
  const s = new THREE.Shape();
  s.moveTo(-hw, 0);
  s.quadraticCurveTo(0, 2 * ch, hw, 0);
  s.lineTo(hw, -t);
  s.quadraticCurveTo(0, -t - 2 * ch, -hw, -t);
  s.lineTo(-hw, 0);
  const wm = new THREE.Mesh(new THREE.ExtrudeGeometry(s, { depth: Wd, bevelEnabled: false, curveSegments: 24 }), wmat);
  wm.position.z = y0;
  g.add(wm);
  const ppm = 2;
  const cv = document.createElement('canvas');
  cv.width = Math.round((x1 - x0) * ppm);
  cv.height = Math.round(Wd * ppm);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const ov = new THREE.Mesh(
    new THREE.PlaneGeometry(x1 - x0, Wd).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, toneMapped: false }),
  );
  ov.position.set((x0 + x1) / 2, 0.05, y0 + Wd / 2);
  ov.renderOrder = 2;
  ov.raycast = () => {};
  g.add(ov);
  const overlay = { cv, tex, X: (x) => (x - x0) * ppm, Y: (y) => (y - y0) * ppm, s: ppm };
  return { group: g, mats: [mat, wmat], L: x1 - x0, W: Wd, H: t, bottom: t + ch, ox: 0, oy: (y0 + y1) / 2, py0: (y0 + y1) / 2, overlay };
}

// ---------------------------------------------------------------- bench
export function createBench({ probeGlbUrl, manifest }) {
  const el = make('div', 'ag-bench');
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.9;
  renderer.localClippingEnabled = true;
  el.appendChild(renderer.domElement);
  const loading = make('div', 'ag-bench-load', AB.loading);
  el.appendChild(loading);
  const views = make('div', 'ag-bench-views');
  const viewBtns = {};
  for (const k of VIEW_KEYS) {
    const b = make('button', 'ag-chip', AB.views[k]);
    b.type = 'button';
    b.addEventListener('click', () => view(k));
    views.appendChild(b);
    viewBtns[k] = b;
  }
  const shot = make('button', 'ag-chip ag-bench-shot', AB.export_image);
  shot.type = 'button';
  shot.addEventListener('click', () => savePng(snapshot(), shotName(AB.shot_3d)));
  views.appendChild(shot);
  el.appendChild(views);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 0.55));
  const sun = new THREE.DirectionalLight(0xffffff, 1.5);
  sun.position.set(0.4, 0.9, 0.6);
  scene.add(sun);
  const camera = new THREE.PerspectiveCamera(34, 1, 0.005, 20);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.12;
  controls.minDistance = 0.08;
  controls.maxDistance = 3.2;
  controls.maxPolarAngle = Math.PI * 0.49;
  controls.enableZoom = true;
  controls.enablePan = true;
  controls.enableRotate = true;
  controls.zoomToCursor = true;
  controls.zoomSpeed = 1.35;
  controls.screenSpacePanning = true;
  controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE;
  controls.mouseButtons.MIDDLE = THREE.MOUSE.DOLLY;
  controls.mouseButtons.RIGHT = THREE.MOUSE.PAN;
  renderer.domElement.addEventListener('wheel', (e) => {
    e.preventDefault();
    e.stopPropagation();
  }, { passive: false });
  renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());

  const stage = new THREE.Group();
  scene.add(stage);
  const rig = new THREE.Group();
  stage.add(rig);
  const markGroup = new THREE.Group();
  rig.add(markGroup);
  let instrument = null;
  let screenNode = null;
  let connectorTop = null;
  let probeMeshes = [];
  let couplantBottle = null;
  let steelTemplate = null;
  /** Display gear aligned with plate equipment_manifest (kit gate + recognition). */
  const probeShelf = {
    straight: null, angle: null, paut: null, tofd: null, pautInst: null, cbii: null,
  };
  /** Free-standing CSK / weld on the table during kit gate (not the scan stage). */
  const kitFree = { block: null, weld: null };
  const specs = {};
  let spec = null;
  let specKey = '';
  let beamObj = null;
  let defObj = null;
  let kitDescs = { block: null, weld: null };
  const pose = { px: 0, py: 0, phi: 0, shift: 0 };
  const st = { beam: false, xray: false, view: 'system', follow: false };
  const cutPlane = new THREE.Plane();
  const cutCv = document.createElement('canvas');
  cutCv.width = 640;
  cutCv.height = 320;
  const cutTex = new THREE.CanvasTexture(cutCv);
  cutTex.colorSpace = THREE.SRGBColorSpace;
  cutTex.anisotropy = 4;
  const cutCap = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({
      map: cutTex, transparent: true, opacity: 0.96, side: THREE.DoubleSide,
      depthWrite: false, toneMapped: false,
    }),
  );
  cutCap.visible = false;
  cutCap.renderOrder = 3;
  stage.add(cutCap);
  let cutPaint = null;
  let H = {};
  let host = null;
  let active = false;
  let raf = 0;
  let last = performance.now();
  let cableDirty = true;
  let cableMoving = 0;
  let tween = null;

  const ready = (async () => {
    const loader = new GLTFLoader();
    const [ig, pg, eg, sg, pag, tfg, spg, paInstG, cskg] = await Promise.all([
      loader.loadAsync(instGlbUrl),
      loader.loadAsync(probeGlbUrl),
      loader.loadAsync(eqGlbUrl),
      loader.loadAsync(straightGlbUrl),
      loader.loadAsync(pautProbeGlbUrl),
      loader.loadAsync(tofdProbeGlbUrl),
      loader.loadAsync(specimensGlbUrl),
      loader.loadAsync(pautInstrumentGlbUrl),
      loader.loadAsync(cskIaGlbUrl),
    ]);
    cskIaCadRoot = cskg.scene;
    delete specs.csk_ia;
    instrument = createInstrument({ scene, gltf: ig, man: instMan, connectorTopY: 0.05, signalColor: '#f59e0b' });
    instrument.setVisible(true);
    instrument.labelKeys(keyLabels());
    screenNode = instrument.place.getObjectByName('instrument__screen');
    pg.scene.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(pg.scene.getObjectByName('angle__connector'));
    const c = box.getCenter(new THREE.Vector3());
    connectorTop = new THREE.Vector3(c.x, box.max.y, c.z);
    for (const p of manifest.parts) {
      if (p.id === STEEL) continue;
      const node = pg.scene.getObjectByName(p.id);
      if (!node) continue;
      node.matrixWorld.decompose(node.position, node.quaternion, node.scale);
      rig.add(node);
      node.traverse((o) => {
        if (!o.isMesh) return;
        o.material = o.material.clone();
        probeMeshes.push(o);
      });
    }
    // Same X80 plate mesh as the structure view (angle__steel_block).
    const steelNode = pg.scene.getObjectByName(STEEL);
    if (steelNode) {
      pg.scene.updateMatrixWorld(true);
      const tpl = steelNode.clone(true);
      steelNode.matrixWorld.decompose(tpl.position, tpl.quaternion, tpl.scale);
      steelTemplate = tpl;
      for (const k of Object.keys(specs)) {
        if (k === 'weld' || k.startsWith('weld') || k.includes('weld')) delete specs[k];
      }
    }
    const bottle = eg.scene.getObjectByName('eq__couplant');
    if (bottle) {
      bottle.removeFromParent();
      bottle.traverse((m) => {
        if (!m.isMesh) return;
        m.material = m.material.clone();
        if (m.material.opacity < 1) { m.material.transparent = true; m.material.depthWrite = false; }
        m.castShadow = true;
      });
      bottle.visible = false;
      scene.add(bottle);
      couplantBottle = bottle;
      sitObject(bottle, EQ.eq__couplant?.bench || { x_mm: 480, z_mm: 120, yaw_deg: 0 });
    }
    const mountShelf = (key, obj, bench) => {
      if (!obj || !bench) return;
      sitObject(obj, bench);
      obj.visible = false;
      scene.add(obj);
      probeShelf[key] = obj;
    };
    try { mountShelf('straight', buildStraightDisplay(sg.scene), EQ.eq__probe_straight?.bench); } catch (_) { /* optional */ }
    try { mountShelf('angle', buildAngleDisplay(pg.scene), EQ.eq__probe_angle?.bench); } catch (_) { /* optional */ }
    try { mountShelf('paut', buildPautDisplay(pag.scene), EQ.eq__probe_paut?.bench); } catch (_) { /* optional */ }
    try { mountShelf('tofd', buildTofdDisplay(tfg.scene), EQ.eq__probe_tofd?.bench); } catch (_) { /* optional */ }
    try {
      const cnv = document.createElement('canvas');
      cnv.width = PA_SW;
      cnv.height = PA_SH;
      drawTofd(cnv.getContext('2d'), { pos: 124, focus: 'image' });
      const host = buildPautInstrumentDisplay(paInstG.scene, {
        screenCanvas: cnv,
        scale: EQ.eq__instrument_paut?.display_scale ?? 0.72,
      });
      mountShelf('pautInst', host, EQ.eq__instrument_paut?.bench);
    } catch (_) { /* optional */ }
    try {
      const node = spg.scene.getObjectByName('specimen__cbii_2');
      if (node) {
        const g = new THREE.Group();
        g.name = 'eq__cbii_2';
        const clone = node.clone(true);
        clone.position.set(0, 0, 0);
        clone.rotation.set(0, 0, 0);
        clone.traverse((o) => {
          if (!o.isMesh) return;
          o.material = Array.isArray(o.material) ? o.material.map((m) => m.clone()) : o.material.clone();
          o.castShadow = true;
          o.receiveShadow = true;
        });
        g.add(clone);
        mountShelf('cbii', g, EQ.eq__cbii_2?.bench);
      }
    } catch (_) { /* optional */ }
    instrument.lab.group.visible = true;
    instrument.bench.visible = true;
    loading.remove();
    applyPose();
    view(st.view, 0);
  })();

  // ---------------------------------------------------------------- specimen
  let displayExtra = null;

  function specKeyOf(desc) {
    if (desc.kind === 'weld' && desc.kit) return 'weld:kit';
    return desc.kind;
  }

  function buildSpec(desc) {
    if (desc.kind === 'csk_ia') return buildCskIa(desc.blk);
    if (desc.kind === 'csk_iia1') return buildCskIia1(desc.blk);
    // Structure GLB only on the prep / kit gate; scanning always uses the procedural plate.
    if (desc.kit && steelTemplate) return buildWeldKit(desc.spec, steelTemplate);
    return buildWeldScan(desc.spec);
  }

  function clearDisplayExtra() {
    if (!displayExtra) return;
    stage.remove(displayExtra.group);
    displayExtra = null;
  }

  function clearSpecimen() {
    clearDisplayExtra();
    if (spec) stage.remove(spec.group);
    spec = null;
    specKey = '';
    setBeam(null);
    setDefects(null);
    stage.position.y = BENCH_Y;
    cableDirty = true;
  }

  /** Place a second specimen beside the active one (exam kit overview: CSK + X80 plate). */
  function setDisplayExtra(desc) {
    clearDisplayExtra();
    if (!desc || !spec) return null;
    const key = `extra:${specKeyOf(desc)}`;
    specs[key] ??= buildSpec(desc);
    const ex = specs[key];
    const gap = 50;
    const shiftX = (spec.L || 200) / 2 + (ex.L || 200) / 2 + gap;
    ex.group.scale.setScalar(MM);
    ex.group.position.set((-ex.ox + shiftX) * MM, 0, -ex.oy * MM);
    stage.add(ex.group);
    stage.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(ex.group);
    if (!box.isEmpty()) ex.group.position.y += (BENCH_Y - box.min.y) - stage.position.y;
    displayExtra = ex;
    view(st.view, 0);
    return ex;
  }

  function setSpecimen(desc) {
    const key = specKeyOf(desc);
    if (key === specKey) return spec;
    clearDisplayExtra();
    if (spec) stage.remove(spec.group);
    specs[key] ??= buildSpec(desc);
    spec = specs[key];
    specKey = key;
    stage.position.y = 0;
    spec.group.scale.setScalar(MM);
    spec.group.position.set(-spec.ox * MM, 0, -spec.oy * MM);
    stage.add(spec.group);
    stage.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(spec.group);
    stage.position.y = BENCH_Y - (box.isEmpty() ? 0 : box.min.y);
    setBeam(null);
    setDefects(null);
    applyXray();
    cableDirty = true;
    view(st.view, 0);
    return spec;
  }

  function setProbeShelf(on) {
    for (const o of Object.values(probeShelf)) {
      if (o) o.visible = !!on;
    }
  }

  function clearKitFree() {
    for (const k of Object.keys(kitFree)) {
      if (!kitFree[k]) continue;
      scene.remove(kitFree[k].group);
      kitFree[k] = null;
    }
  }

  function placeKitFree(kind, desc, bench) {
    if (!desc || !bench) return;
    const built = buildSpec(desc);
    built.group.scale.setScalar(MM);
    scene.add(built.group);
    sitObject(built.group, bench);
    kitFree[kind] = built;
  }

  /** Exam-gate kit: same inventory / poses as the plate equipment workstation. */
  function setKit(flags = {}, descs = {}) {
    if (descs.block) kitDescs.block = descs.block;
    if (descs.weld) kitDescs.weld = descs.weld;
    const on = {
      instrument: !!flags.instrument,
      probe: !!flags.probe,
      block: !!flags.block,
      weld: !!flags.weld,
      couplant: !!flags.couplant,
    };
    const apply = () => {
      const any = on.instrument || on.probe || on.block || on.weld || on.couplant;
      instrument?.setVisible(true, { bench: true });
      // Kit gate uses display models (incl. angle) so layout matches the entry bench.
      setProbeShelf(any);
      rig.visible = false;
      if (couplantBottle) couplantBottle.visible = any;
      clearKitFree();
      clearSpecimen();
      if (any && on.block && kitDescs.block) {
        placeKitFree('block', kitDescs.block, EQ.eq__csk_ia?.bench || { x_mm: -360, z_mm: 120 });
      }
      if (any && on.weld && kitDescs.weld) {
        placeKitFree('weld', kitDescs.weld, EQ.eq__plate?.bench || { x_mm: 40, z_mm: -200 });
      }
      view(st.view, 0);
    };
    if (instrument) apply();
    else ready.then(apply);
  }

  function resetKit() {
    clearKitFree();
    if (couplantBottle) couplantBottle.visible = false;
    setProbeShelf(false);
    instrument?.setVisible(true, { bench: true });
    rig.visible = true;
  }

  const specW = (x, y, z = 0) => new THREE.Vector3((x - (spec?.ox ?? 0)) * MM, -z * MM, (y - (spec?.oy ?? 0)) * MM);

  function applyXray() {
    if (!spec) return;
    // Weld / block stay solid; cutaway uses clipping, beam and defects draw with depthTest off.
    for (const m of spec.mats) {
      m.transparent = false;
      m.opacity = 1;
      m.depthWrite = true;
      m.needsUpdate = true;
    }
  }

  function updateCutaway() {
    if (!spec || st.view !== 'cutaway') {
      renderer.clippingPlanes = [];
      cutCap.visible = false;
      return;
    }
    stage.updateMatrixWorld(true);
    const y = pose.py;
    const Hmm = spec.H || 22;
    const pt = stage.localToWorld(specW(0, y, Hmm / 2));
    // Keep the plate on the −y side of the cut; look from +y so the cut face faces the camera.
    const along = new THREE.Vector3(0, 0, 1).transformDirection(stage.matrixWorld).normalize();
    cutPlane.setFromNormalAndCoplanarPoint(along, pt);
    renderer.clippingPlanes = [cutPlane];
    const Lw = Math.max(spec.L || 80, 60) * MM;
    const Hw = Math.max(Hmm + 6, 18) * MM;
    cutCap.position.copy(pt);
    cutCap.scale.set(Lw, Hw, 1);
    // Face the camera (+along): plane local +Z → world +along.
    cutCap.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), along);
    if (cutPaint) {
      const c = cutCv.getContext('2d');
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.clearRect(0, 0, cutCv.width, cutCv.height);
      cutPaint(c, cutCv.width, cutCv.height, y);
      cutTex.needsUpdate = true;
    } else {
      const c = cutCv.getContext('2d');
      c.fillStyle = '#9aa3ad';
      c.fillRect(0, 0, cutCv.width, cutCv.height);
      cutTex.needsUpdate = true;
    }
    cutCap.visible = true;
  }

  // ---------------------------------------------------------------- probe
  function applyPose() {
    const c = Math.cos(pose.phi);
    const s = Math.sin(pose.phi);
    rig.position.copy(specW(pose.px + c * pose.shift, pose.py + s * pose.shift, 0));
    rig.rotation.set(0, -pose.phi, 0);
    cableDirty = true;
    cableMoving = performance.now();
  }

  function setPose(p) {
    const old = rig.position.clone();
    Object.assign(pose, p);
    applyPose();
    if (st.view === 'cutaway') {
      updateCutaway();
      if (!tween && !drag) {
        const vp = viewPose('cutaway');
        camera.position.copy(vp.pos);
        controls.target.copy(vp.target);
      }
    } else if (st.follow && !tween && !drag) {
      const d = rig.position.clone().sub(old);
      camera.position.add(d);
      controls.target.add(d);
    }
  }

  function setMark(m) {
    markGroup.clear();
    if (m == null) return;
    const x = (m - pose.shift) * MM;
    const geo = new THREE.BoxGeometry(0.7 * MM, 7 * MM, 0.5 * MM);
    const mat = new THREE.MeshBasicMaterial({ color: 0xfacc15, toneMapped: false });
    for (const sd of [-1, 1]) {
      const b = new THREE.Mesh(geo, mat);
      b.position.set(x, 5.5 * MM, sd * 11.3 * MM);
      markGroup.add(b);
    }
  }

  // ---------------------------------------------------------------- beam
  function setBeam(b) {
    if (beamObj) {
      beamObj.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); });
      spec?.group.remove(beamObj);
      beamObj = null;
    }
    st.beam = !!b;
    applyXray();
    if (!b || !spec) return;
    const { m, T = Infinity, S } = b;
    const { sb, cb } = m.p;
    const c = Math.cos(pose.phi);
    const s = Math.sin(pose.phi);
    const at = (u, w) => [pose.px + c * u, -fold(w, T), pose.py + s * u];
    const pos = [];
    const col = [];
    const tmp = new THREE.Color();
    let prev = null;
    const step = 1;
    for (let q = 0; q <= S + 1e-9; q += step) {
      const half = U6 * m.wv(Math.max(q, 0.001));
      const u = q * sb;
      const w = q * cb;
      const A = at(u + half * cb, w - half * sb);
      const B = at(u - half * cb, w + half * sb);
      if (prev) {
        const leg = Math.min(2, Math.floor(((q - step / 2) * cb) / (Number.isFinite(T) ? T : 1e9)));
        tmp.set(LEG_C[leg]);
        for (const v of [prev[0], A, B, prev[0], B, prev[1]]) {
          pos.push(...v);
          col.push(tmp.r, tmp.g, tmp.b);
        }
      }
      prev = [A, B];
    }
    const g = new THREE.Group();
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    const band = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false, toneMapped: false }));
    band.renderOrder = 10;
    const ap = [];
    const ac = [];
    for (let q = 0; q <= S + 1e-9; q += 0.5) {
      const leg = Math.min(2, Math.floor((q * cb) / (Number.isFinite(T) ? T : 1e9)));
      tmp.set(LEG_C[leg]);
      ap.push(...at(q * sb, q * cb));
      ac.push(tmp.r, tmp.g, tmp.b);
    }
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(ap, 3));
    lg.setAttribute('color', new THREE.Float32BufferAttribute(ac, 3));
    const axis = new THREE.Line(lg, new THREE.LineBasicMaterial({ vertexColors: true, toneMapped: false, depthTest: false }));
    axis.renderOrder = 11;
    g.add(band, axis);
    g.traverse((o) => { o.raycast = () => {}; });
    beamObj = g;
    spec.group.add(g);
  }

  // ---------------------------------------------------------------- defects
  function setDefects(list) {
    if (defObj) {
      defObj.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); });
      spec?.group.remove(defObj);
      defObj = null;
    }
    st.xray = !!list;
    applyXray();
    if (!list || !spec) return;
    const g = new THREE.Group();
    const sph = new THREE.SphereGeometry(1, 12, 8);
    const mtx = new THREE.Matrix4();
    for (const { el: els, meta } of list) {
      const mat = new THREE.MeshBasicMaterial({ color: meta.not_allowed ? 0xef4444 : 0xf59e0b, toneMapped: false, depthTest: false, transparent: true, opacity: 0.9 });
      const im = new THREE.InstancedMesh(sph, mat, els.length);
      els.forEach((e, i) => {
        const r = e.kind === SPHERE ? Math.max(0.5, e.D / 2) : 0.55;
        mtx.makeScale(r, r, r).setPosition(e.x, -e.z, e.y);
        im.setMatrixAt(i, mtx);
      });
      im.renderOrder = 12;
      im.raycast = () => {};
      g.add(im);
    }
    defObj = g;
    spec.group.add(g);
  }

  function drawOverlay(fn) {
    const o = spec?.overlay;
    if (!o) return;
    const c = o.cv.getContext('2d');
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, o.cv.width, o.cv.height);
    fn(c, o);
    o.tex.needsUpdate = true;
  }

  // ---------------------------------------------------------------- camera
  function fitDist(radius) {
    const fov = THREE.MathUtils.degToRad(camera.fov);
    const a = Math.min(1, camera.aspect || 1);
    return radius / Math.sin(fov / 2) / Math.max(0.55, a) * 0.9;
  }
  function frontNormal() {
    const kp = instrument?.keys.key__gain?.obj.parent;
    if (!kp) return new THREE.Vector3(0, 0.4, 1).normalize();
    return new THREE.Vector3(0, 0, 1).applyQuaternion(kp.getWorldQuaternion(new THREE.Quaternion())).normalize();
  }
  function viewPose(k) {
    stage.updateMatrixWorld(true);
    if (k === 'probe') {
      const t = rig.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.012, 0));
      return { target: t, pos: t.clone().add(new THREE.Vector3(-0.6, 0.66, 1).normalize().multiplyScalar(0.26)) };
    }
    if (k === 'cutaway' && spec) {
      const t = stage.localToWorld(specW(0, pose.py, (spec.H || 22) / 2));
      const along = new THREE.Vector3(0, 0, 1).transformDirection(stage.matrixWorld).normalize();
      const up = new THREE.Vector3(0, 1, 0);
      // Stand on the clipped-away side looking back at the cut face (section drawing on cutCap).
      return {
        target: t,
        pos: t.clone().add(along.multiplyScalar(0.18)).add(up.multiplyScalar(0.02)),
      };
    }
    if ((k === 'screen' || k === 'panel') && instrument) {
      const node = k === 'screen' ? screenNode : instrument.keys.key__gain?.obj.parent;
      const box = new THREE.Box3().setFromObject(node);
      const t = box.getCenter(new THREE.Vector3());
      const n = frontNormal();
      const size = box.getSize(new THREE.Vector3()).length();
      return { target: t, pos: t.clone().add(n.multiplyScalar(Math.max(0.16, fitDist(size * 0.5) * (k === 'screen' ? 1.1 : 1.25)))) };
    }
    const box = new THREE.Box3();
    if (spec) box.expandByObject(spec.group);
    if (displayExtra) box.expandByObject(displayExtra.group);
    if (instrument?.place?.visible) box.expandByObject(instrument.place);
    if (couplantBottle?.visible) box.expandByObject(couplantBottle);
    for (const o of Object.values(probeShelf)) {
      if (o?.visible) box.expandByObject(o);
    }
    if (kitFree.block?.group?.visible) box.expandByObject(kitFree.block.group);
    if (kitFree.weld?.group?.visible) box.expandByObject(kitFree.weld.group);
    if (rig.visible) box.expandByObject(rig);
    if (box.isEmpty()) box.set(new THREE.Vector3(-0.18, -0.02, -0.12), new THREE.Vector3(0.18, 0.08, 0.12));
    const t = box.getCenter(new THREE.Vector3());
    t.y = Math.min(t.y, stage.position.y);
    const r = box.getSize(new THREE.Vector3()).length() / 2;
    return { target: t, pos: t.clone().add(new THREE.Vector3(0.22, 0.42, 1).normalize().multiplyScalar(fitDist(r) * 0.5)) };
  }
  function view(k, ms = 700) {
    st.view = k;
    st.follow = k === 'probe';
    for (const [id, b] of Object.entries(viewBtns)) b.classList.toggle('active', id === k);
    applyXray();
    updateCutaway();
    H.view?.(k);
    const p = viewPose(k);
    if (!ms) {
      camera.position.copy(p.pos);
      controls.target.copy(p.target);
      tween = null;
      return;
    }
    tween = { t0: performance.now(), ms, p0: camera.position.clone(), q0: controls.target.clone(), p };
  }

  // ---------------------------------------------------------------- pointer
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  let drag = null;
  function setRay(e) {
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
  }
  function surfacePoint() {
    plane.constant = -stage.position.y;
    const p = ray.ray.intersectPlane(plane, new THREE.Vector3());
    if (!p) return null;
    return [p.x / MM + (spec?.ox ?? 0), p.z / MM + (spec?.oy ?? 0)];
  }
  /** Ray-pick kit item: required ids + distractors aligned with the plate bench. */
  function pickKit() {
    const hits = [];
    const push = (id, objs) => {
      for (const o of objs || []) {
        if (!o?.visible) continue;
        o.updateMatrixWorld?.(true);
        const list = [];
        o.traverse((m) => { if (m.isMesh && m.visible) list.push(m); });
        const h = ray.intersectObjects(list, false)[0];
        if (h) hits.push({ id, distance: h.distance });
      }
    };
    if (instrument?.place?.visible) push('instrument', [instrument.place]);
    if (probeShelf.angle?.visible) push('probe', [probeShelf.angle]);
    else if (rig.visible) push('probe', [rig]);
    if (couplantBottle?.visible) push('couplant', [couplantBottle]);
    if (probeShelf.straight?.visible) push('straight', [probeShelf.straight]);
    if (probeShelf.paut?.visible) push('paut', [probeShelf.paut]);
    if (probeShelf.tofd?.visible) push('tofd', [probeShelf.tofd]);
    if (probeShelf.pautInst?.visible) push('paut_inst', [probeShelf.pautInst]);
    if (probeShelf.cbii?.visible) push('cbii', [probeShelf.cbii]);
    if (kitFree.block?.group?.visible) push('block', [kitFree.block.group]);
    if (kitFree.weld?.group?.visible) push('weld', [kitFree.weld.group]);
    if (spec?.group?.visible) {
      const kind = specKey.startsWith('weld') ? 'weld' : 'block';
      push(kind, [spec.group]);
    }
    if (displayExtra?.group?.visible && kitDescs.block && kitDescs.weld) {
      if (specKey === specKeyOf(kitDescs.block)) push('weld', [displayExtra.group]);
      else if (specKey === specKeyOf(kitDescs.weld)) push('block', [displayExtra.group]);
    }
    hits.sort((a, b) => a.distance - b.distance);
    return hits[0]?.id || null;
  }

  function onDown(e) {
    if (e.button !== 0) return;
    setRay(e);
    // Exam kit gate: click to identify equipment (no probe drag / key press).
    if (H.kitPick) {
      const id = pickKit();
      if (id) {
        e.preventDefault();
        e.stopImmediatePropagation();
        H.kitPick(id);
        return;
      }
    }
    if (instrument) {
      const hit = instrument.pickControl(ray);
      const probeHit = ray.intersectObjects(probeMeshes, false)[0];
      if (hit && (!probeHit || hit.distance < probeHit.distance)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        H.control?.(hit);
        return;
      }
      if (probeHit && H.drag) {
        const q = surfacePoint();
        if (!q) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        controls.enabled = false;
        drag = { id: e.pointerId, dx: pose.px - q[0], dy: pose.py - q[1], rig0: rig.position.clone() };
        renderer.domElement.setPointerCapture(e.pointerId);
        renderer.domElement.style.cursor = 'grabbing';
        H.drag(pose.px, pose.py, 'start');
        return;
      }
    }
    tween = null;
    if (st.view !== 'probe') st.follow = false;
  }
  function onMove(e) {
    setRay(e);
    if (drag) {
      const q = surfacePoint();
      if (q) H.drag?.(q[0] + drag.dx, q[1] + drag.dy, 'move');
      return;
    }
    if (H.kitPick) {
      renderer.domElement.style.cursor = pickKit() ? 'pointer' : '';
      return;
    }
    if (!instrument) return;
    const over = instrument.pickControl(ray) ? 'pointer' : H.drag && ray.intersectObjects(probeMeshes, false)[0] ? 'grab' : '';
    renderer.domElement.style.cursor = over;
  }
  function onUp(e) {
    if (!drag || e.pointerId !== drag.id) return;
    const d = rig.position.clone().sub(drag.rig0);
    drag = null;
    if (st.follow && d.lengthSq() > 1e-10) {
      tween = { t0: performance.now(), ms: 450, p0: camera.position.clone(), q0: controls.target.clone(),
        p: { pos: camera.position.clone().add(d), target: controls.target.clone().add(d) } };
    }
    controls.enabled = true;
    renderer.domElement.style.cursor = '';
    cableMoving = 0;
    cableDirty = true;
    H.drag?.(pose.px, pose.py, 'end');
  }
  renderer.domElement.addEventListener('pointerdown', onDown, { capture: true });
  renderer.domElement.addEventListener('pointermove', onMove);
  renderer.domElement.addEventListener('pointerup', onUp);
  renderer.domElement.addEventListener('pointercancel', onUp);
  controls.addEventListener('start', () => { tween = null; if (st.view !== 'probe') st.follow = false; });

  // ---------------------------------------------------------------- loop
  function resize() {
    const w = el.clientWidth;
    const h = el.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(() => resize());
  ro.observe(el);

  function updateCable(now) {
    if (!instrument || !connectorTop || !cableDirty) return;
    const moving = drag || now - cableMoving < 180;
    rig.updateMatrixWorld(true);
    const top = rig.localToWorld(connectorTop.clone());
    instrument.setProbeAnchor(top, { floorY: stage.position.y + 0.004, segments: moving ? 90 : 220, stretch: 1.12 });
    if (!moving) cableDirty = false;
  }

  function frame(now) {
    raf = active ? requestAnimationFrame(frame) : 0;
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (tween) {
      const k = Math.min(1, (now - tween.t0) / tween.ms);
      const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
      camera.position.lerpVectors(tween.p0, tween.p.pos, e);
      controls.target.lerpVectors(tween.q0, tween.p.target, e);
      if (k >= 1) tween = null;
    }
    controls.update();
    instrument?.tickControls(dt);
    updateCable(now);
    H.tick?.(now);
    renderer.render(scene, camera);
  }

  const snapshot = () => grabGl(renderer, scene, camera, backdropOf(el));

  function setActive(on) {
    if (on === active) return;
    active = on;
    if (on) {
      resize();
      last = performance.now();
      raf = requestAnimationFrame(frame);
    } else if (raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
  }

  return {
    el,
    ready,
    get instrument() { return instrument; },
    attach(target, handlers = {}) {
      host = target;
      H = handlers;
      target.appendChild(el);
      resize();
      setActive(true);
    },
    release() {
      H = {};
      drag = null;
      controls.enabled = true;
      setActive(false);
      el.remove();
      host = null;
    },
    setActive(on) { if (host) setActive(on); },
    setSpecimen,
    setDisplayExtra,
    clearDisplayExtra,
    clearSpecimen,
    setKit,
    resetKit,
    setPose,
    setMark,
    setBeam,
    setDefects,
    drawOverlay,
    setCutSection(fn) {
      cutPaint = typeof fn === 'function' ? fn : null;
      if (st.view === 'cutaway') updateCutaway();
    },
    snapshot,
    view,
    get viewKey() { return st.view; },
    specW,
    pose: () => ({ ...pose }),
    screenOf(id) {
      const o = id === 'probe' ? rig : id === 'encoder' ? instrument?.encoder : instrument?.keys[id]?.obj;
      if (!o) return null;
      const p = o.getWorldPosition(new THREE.Vector3());
      if (id === 'probe') p.y += 0.01;
      p.project(camera);
      const r = renderer.domElement.getBoundingClientRect();
      return { x: r.left + (p.x + 1) / 2 * r.width, y: r.top + (1 - p.y) / 2 * r.height };
    },
    resize,
  };
}
