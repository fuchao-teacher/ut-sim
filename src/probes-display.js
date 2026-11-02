// Display probe models for the lab table: straight / angle (UT GLBs), PA + TOFD (teaching GLBs).
import * as THREE from 'three';

const MM = 0.001;

const SKIP_STRAIGHT = new Set(['probe__steel_block', 'probe__couplant']);
const SKIP_ANGLE = new Set(['angle__steel_block', 'angle__couplant', 'angle__beam']);
const HIDE_PA = new Set(['PA_Couplant']);
const HIDE_TF = new Set([]);

export function sitOnBench(group) {
  group.position.set(0, 0, 0);
  group.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(group);
  const sit = box.isEmpty() ? 0 : -box.min.y;
  group.userData.sitY = sit;
  group.position.y = sit;
  return group;
}

function cloneNamed(src, ids, skip = new Set()) {
  const group = new THREE.Group();
  src.updateMatrixWorld(true);
  for (const id of ids) {
    if (skip.has(id)) continue;
    const node = src.getObjectByName(id);
    if (!node) continue;
    const clone = node.clone(true);
    node.updateWorldMatrix?.(true, true);
    node.matrixWorld.decompose(clone.position, clone.quaternion, clone.scale);
    clone.traverse((o) => {
      if (!o.isMesh) return;
      o.material = Array.isArray(o.material) ? o.material.map((m) => m.clone()) : o.material.clone();
      o.castShadow = true;
      o.receiveShadow = true;
    });
    group.add(clone);
  }
  return sitOnBench(group);
}

function cloneRoot(src, rootName, hideNames = new Set()) {
  const root = src.getObjectByName(rootName) || src;
  const group = new THREE.Group();
  const clone = root.clone(true);
  clone.traverse((o) => {
    if (hideNames.has(o.name)) o.visible = false;
    if (!o.isMesh) return;
    o.material = Array.isArray(o.material) ? o.material.map((m) => m.clone()) : o.material.clone();
    o.castShadow = true;
    o.receiveShadow = true;
  });
  group.add(clone);
  return sitOnBench(group);
}

/** Exterior of the straight-beam GLB, wear face on Y=0. */
export function buildStraightDisplay(gltfScene) {
  const group = cloneNamed(gltfScene, [
    'probe__housing', 'probe__connector', 'probe__wear_face',
    'probe__inner_sleeve', 'probe__backing', 'probe__active_element',
    'probe__front_electrode', 'probe__rear_electrode', 'probe__matching_layer_optional',
    'probe__wiring',
  ], SKIP_STRAIGHT);
  group.name = 'eq__probe_straight_display';
  return group;
}

/** Exterior parts of the angle-beam GLB, wear face on Y=0. */
export function buildAngleDisplay(gltfScene) {
  const group = cloneNamed(gltfScene, [
    'angle__housing', 'angle__wedge', 'angle__connector',
    'angle__absorber', 'angle__backing', 'angle__active_element',
    'angle__front_electrode', 'angle__rear_electrode',
  ], SKIP_ANGLE);
  group.name = 'eq__probe_angle';
  return group;
}

/** Teaching phased-array probe + wedge (pa_probe_parts.glb). */
export function buildPautDisplay(gltfScene) {
  const group = cloneRoot(gltfScene, 'PA_Assembly', HIDE_PA);
  group.name = 'eq__probe_paut';
  return group;
}

/** Teaching TOFD probe + wedge (tofd_probe_parts.glb). */
export function buildTofdDisplay(gltfScene) {
  const group = cloneRoot(gltfScene, 'TF', HIDE_TF);
  group.name = 'eq__probe_tofd';
  return group;
}

/** Top-level nodes that belong to the PA/TOFD host in paut_tofd_teaching_v1/*.glb. */
const PA_INST_NODE = /^(Instrument_|Bumper_|Front_|Screen_|SoftKey|Keypad_|Knob_|Key|Power_|LED_|Handle_|PA_Connector|UT_Conn|Encoder_Port|IO_|Kick_|Brand_|Accent|Anchor_Inst)/;

/**
 * PA/TOFD host from paut_tofd_teaching_v1 teaching GLB (same unit as the TOFD page),
 * with optional live screen canvas mapped to Screen_LCD.
 */
export function buildPautInstrumentDisplay(gltfScene, { screenCanvas = null, scale = 0.72 } = {}) {
  const group = new THREE.Group();
  group.name = 'eq__instrument_paut';
  gltfScene.updateMatrixWorld(true);
  for (const child of gltfScene.children) {
    if (!PA_INST_NODE.test(child.name || '')) continue;
    const clone = child.clone(true);
    child.updateWorldMatrix?.(true, true);
    child.matrixWorld.decompose(clone.position, clone.quaternion, clone.scale);
    clone.traverse((o) => {
      if (!o.isMesh) return;
      o.material = Array.isArray(o.material) ? o.material.map((m) => m.clone()) : o.material.clone();
      o.castShadow = true;
      o.receiveShadow = true;
    });
    group.add(clone);
  }
  if (screenCanvas) {
    const tex = new THREE.CanvasTexture(screenCanvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.flipY = false;
    tex.anisotropy = 4;
    group.traverse((o) => {
      if (!o.isMesh) return;
      let n = o;
      let isLcd = false;
      while (n) {
        if (n.name === 'Screen_LCD') { isLcd = true; break; }
        n = n.parent;
      }
      if (!isLcd) return;
      o.material = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
      o.castShadow = false;
    });
  }
  group.scale.setScalar(scale);
  return sitOnBench(group);
}

export function placeOnBench(obj, bench, benchY) {
  const sit = obj.userData.sitY || 0;
  obj.position.x = (bench.x_mm || 0) * MM;
  obj.position.z = (bench.z_mm || 0) * MM;
  obj.position.y = (benchY || 0) + sit;
  obj.rotation.y = THREE.MathUtils.degToRad(bench.yaw_deg || 0);
  obj.updateMatrixWorld(true);
}
