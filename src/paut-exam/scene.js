import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createLabTable } from '../labtable.js';
import { buildPautDisplay, buildPautInstrumentDisplay, sitOnBench } from '../probes-display.js';
import { createGirthWeldPipe, pipeDims, posToTheta, thetaToPos, activeDefects } from './pipe.js';
import { drawPaut, SW, SH } from '@paut/screen_paut.js';
import * as P from '@paut/physics.js';
import pautProbeGlbUrl from '../../../assets/pa_probe_parts.glb?url';
import pautInstrumentGlbUrl from '@paut-assets/tofd_teaching.glb?url';

const MM = 0.001;
const PROBE_HEIGHT_M = 0.095;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function wearOnOrigin(obj) {
  obj.position.set(0, 0, 0);
  obj.rotation.set(0, 0, 0);
  obj.scale.set(1, 1, 1);
  obj.updateMatrixWorld(true);
  const box0 = new THREE.Box3().setFromObject(obj);
  const h = Math.max(1e-6, box0.max.y - box0.min.y);
  obj.scale.setScalar(PROBE_HEIGHT_M / h);
  obj.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(obj);
  obj.position.y = -box.min.y;
  obj.updateMatrixWorld(true);
  return obj;
}

function worldOf(obj, local = new THREE.Vector3()) {
  obj.updateMatrixWorld(true);
  return obj.localToWorld(local.clone());
}

function findName(root, re) {
  let hit = null;
  root.traverse((o) => {
    if (hit || !o.name) return;
    if (re.test(o.name)) hit = o;
  });
  return hit;
}

function cableMesh(a, b) {
  const mid = a.clone().lerp(b, 0.5);
  mid.y = Math.max(a.y, b.y) + 0.1;
  const c1 = a.clone(); c1.y += 0.04; c1.z += 0.025;
  const c2 = b.clone(); c2.y += 0.045;
  const curve = new THREE.CatmullRomCurve3([a, c1, mid, c2, b]);
  return new THREE.Mesh(
    new THREE.TubeGeometry(curve, 72, 0.0036, 8, false),
    new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.7, metalness: 0.15 }),
  );
}

export function createPautExamScene(host, { onChange } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xeef0f3);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.add(new THREE.HemisphereLight(0xffffff, 0xb8c0cc, 0.85));
  const key = new THREE.DirectionalLight(0xfff7e8, 1.35);
  key.position.set(0.7, 1.5, 1.0);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.near = 0.2;
  key.shadow.camera.far = 4;
  key.shadow.camera.left = -1.4;
  key.shadow.camera.right = 1.4;
  key.shadow.camera.top = 1.2;
  key.shadow.camera.bottom = -1.2;
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xdbeafe, 0.45);
  fill.position.set(-1.0, 0.8, -0.6);
  scene.add(fill);

  const camera = new THREE.PerspectiveCamera(36, 1, 0.02, 12);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 0.18;
  controls.maxDistance = 3.4;
  controls.maxPolarAngle = Math.PI * 0.49;

  const table = createLabTable({
    topY: 0, cx: 0, cz: 0,
    widthMm: 1400, depthMm: 900, heightMm: 780,
    topColor: 0xc9ccd1,
  });
  scene.add(table.group);

  const pipe = createGirthWeldPipe();
  scene.add(pipe);
  const dims = pipe.userData.dims || pipeDims();

  const screenCanvas = document.createElement('canvas');
  screenCanvas.width = SW;
  screenCanvas.height = SH;
  const sctx = screenCanvas.getContext('2d');

  const state = {
    pos: P.POS_MODEL_ZERO,
    axialMm: 28,
    skewDeg: 0,
    angle: 55,
    showBeam: true,
    showDefects: true,
    fanPlay: false,
    fanT: 0,
  };

  const probes = { rig: null, probe: null, inst: null, cable: null, tex: null, fan: null };
  const instPose = { x: -0.48, z: 0.28, yaw: 28 };
  let raf = 0;
  let alive = true;
  let dirty = true;
  const presets = {};
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let drag = null;

  function emit() {
    onChange?.(getState());
  }

  function getState() {
    const hits = activeDefects(state.pos).map((d) => d.name);
    const rd = P.pautReadout(state.angle, state.pos);
    return { ...state, hits, readout: rd };
  }

  function paintScreen() {
    drawPaut(sctx, { angle: state.angle, pos: state.pos, focus: '' });
    if (probes.tex) probes.tex.needsUpdate = true;
    dirty = false;
  }

  function setDefectVisible(on) {
    state.showDefects = on;
    const g = pipe.userData.defects;
    if (g) g.visible = on;
    highlightDefects();
  }

  function highlightDefects() {
    const g = pipe.userData.defects;
    if (!g) return;
    const hot = new Set(activeDefects(state.pos).map((d) => d.id));
    g.traverse((o) => {
      const d = o.userData?.defect || o.parent?.userData?.defect;
      if (!o.isMesh || !d) return;
      const m = o.material;
      if (!m?.emissive) return;
      if (hot.has(d.id)) {
        m.emissive.setHex(0xfff1c1);
        m.emissiveIntensity = 0.55;
      } else {
        m.emissive.setHex(0x000000);
        m.emissiveIntensity = 0;
      }
    });
  }

  function rebuildFan() {
    if (probes.fan) {
      probes.rig?.remove(probes.fan);
      probes.fan.traverse((o) => {
        o.geometry?.dispose();
        o.material?.dispose?.();
      });
      probes.fan = null;
    }
    if (!probes.rig || !state.showBeam) return;
    const fan = new THREE.Group();
    fan.name = 'paut-beam-fan';
    const a0 = P.PA_A0;
    const a1 = P.PA_A1;
    const n = 9;
    for (let i = 0; i < n; i++) {
      const a = a0 + ((a1 - a0) * i) / (n - 1);
      const hot = Math.abs(a - state.angle) < 2.2;
      const mat = new THREE.MeshBasicMaterial({
        color: hot ? 0xfbbf24 : 0x38bdf8,
        transparent: true,
        opacity: hot ? 0.45 : 0.16,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const len = dims.wt * 3.2;
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.0009, 0.0032, len, 6, 1, true), mat);
      const tilt = THREE.MathUtils.degToRad(a - 55) * 0.9;
      m.position.set(-len * 0.18, -len * 0.38, 0);
      m.rotation.z = Math.PI / 2 + 0.52 + tilt;
      fan.add(m);
    }
    // live centre ray from physics
    const ray = P.pautRay(state.angle, state.pos);
    if (ray.pts.length >= 2) {
      const pts = ray.pts.map(([xMm, zMm]) => {
        const scale = dims.s * MM;
        return new THREE.Vector3(-xMm * scale * 0.35, -zMm * scale, 0);
      });
      const curve = new THREE.CatmullRomCurve3(pts);
      const tube = new THREE.Mesh(
        new THREE.TubeGeometry(curve, 24, 0.0014, 6, false),
        new THREE.MeshBasicMaterial({ color: ray.kind ? 0xf87171 : 0x7dd3fc, transparent: true, opacity: 0.75 }),
      );
      fan.add(tube);
    }
    fan.position.set(0.008, 0.002, 0);
    probes.rig.add(fan);
    probes.fan = fan;
  }

  function applyProbePose() {
    if (!probes.rig) return;
    const theta = posToTheta(state.pos);
    const axial = state.axialMm * dims.s * MM;
    const cy = pipe.position.y;
    const ro = dims.ro + 0.0015;
    probes.rig.position.set(axial, cy + ro * Math.cos(theta), ro * Math.sin(theta));
    const n = new THREE.Vector3(0, Math.cos(theta), Math.sin(theta));
    const along = new THREE.Vector3(-1, 0, 0);
    const tang = new THREE.Vector3().crossVectors(n, along).normalize();
    probes.rig.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(along, n, tang));
    probes.rig.rotateY(THREE.MathUtils.degToRad(state.skewDeg));
    rebuildFan();
    hookCable();
    highlightDefects();
    dirty = true;
    emit();
  }

  function placeInst() {
    if (!probes.inst) return;
    sitOnBench(probes.inst);
    probes.inst.position.set(instPose.x, probes.inst.userData.sitY || 0, instPose.z);
    probes.inst.rotation.y = THREE.MathUtils.degToRad(instPose.yaw);
    hookCable();
  }

  function hookCable() {
    if (!probes.probe || !probes.inst) return;
    if (probes.cable) {
      scene.remove(probes.cable);
      probes.cable.geometry?.dispose();
      probes.cable = null;
    }
    const gland = findName(probes.probe, /Gland|Connector|PA_Connector|Anchor_Gland/) || probes.probe;
    const jack = findName(probes.inst, /Anchor_InstPA|PA_Connector|UT_Conn/) || probes.inst;
    const a = worldOf(gland, new THREE.Vector3(0, 0.02, 0));
    const b = worldOf(jack, new THREE.Vector3(0, 0.03, 0));
    probes.cable = cableMesh(a, b);
    probes.cable.name = 'paut-exam-cable';
    probes.cable.castShadow = true;
    scene.add(probes.cable);
  }

  function computePresets() {
    const box = new THREE.Box3().setFromObject(pipe);
    if (probes.inst) box.expandByObject(probes.inst);
    const c = box.getCenter(new THREE.Vector3());
    const r = box.getSize(new THREE.Vector3()).length() * 0.55;
    presets.bench = {
      target: c.clone().setY(dims.ro * 0.55),
      pos: c.clone().add(new THREE.Vector3(0.55, 0.42, 0.95)).setLength(Math.max(0.9, r * 1.15)),
    };
    const t = new THREE.Vector3(0, pipe.position.y + dims.ro * 0.85, 0);
    presets.weld = { target: t.clone(), pos: t.clone().add(new THREE.Vector3(0.1, 0.14, 0.26)) };
    if (probes.rig) {
      const p = worldOf(probes.rig);
      presets.probe = { target: p.clone().add(new THREE.Vector3(0, 0.02, 0)), pos: p.clone().add(new THREE.Vector3(0.12, 0.14, 0.22)) };
    }
    if (probes.inst) {
      const lcd = findName(probes.inst, /Screen_LCD/);
      const q = lcd ? worldOf(lcd) : worldOf(probes.inst);
      presets.inst = { target: q.clone(), pos: q.clone().add(new THREE.Vector3(-0.02, 0.06, 0.28)) };
    }
  }

  const loader = new GLTFLoader();
  const jobs = [
    loader.loadAsync(pautProbeGlbUrl).then((g) => {
      const probe = buildPautDisplay(g.scene);
      wearOnOrigin(probe);
      const rig = new THREE.Group();
      rig.name = 'paut-exam-probe-rig';
      rig.add(probe);
      scene.add(rig);
      probes.rig = rig;
      probes.probe = probe;
    }).catch((e) => { console.warn('paut probe', e); }),
    loader.loadAsync(pautInstrumentGlbUrl).then((g) => {
      const inst = buildPautInstrumentDisplay(g.scene, { screenCanvas, scale: 0.72 });
      scene.add(inst);
      probes.inst = inst;
      probes.tex = null;
      inst.traverse((o) => {
        if (o.isMesh && o.material?.map) probes.tex = o.material.map;
      });
    }).catch(() => {}),
  ];

  Promise.all(jobs).then(() => {
    if (!alive) return;
    placeInst();
    applyProbePose();
    setDefectVisible(true);
    paintScreen();
    computePresets();
    const p = presets.probe || presets.weld || presets.bench;
    if (p) {
      camera.position.copy(p.pos);
      controls.target.copy(p.target);
      controls.update();
    }
  });

  function setRay(e) {
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
  }

  function hitPipePoint() {
    const meshes = [];
    pipe.traverse((o) => { if (o.isMesh && o.visible && o.name !== 'weld-centerline') meshes.push(o); });
    const hit = raycaster.intersectObjects(meshes, false)[0];
    return hit || null;
  }

  function onDown(e) {
    if (e.button !== 0) return;
    setRay(e);
    if (probes.probe) {
      const list = [];
      probes.probe.traverse((m) => { if (m.isMesh && m.visible) list.push(m); });
      const ph = raycaster.intersectObjects(list, false)[0];
      if (ph) {
        e.preventDefault();
        controls.enabled = false;
        drag = { kind: 'probe', id: e.pointerId };
        renderer.domElement.setPointerCapture(e.pointerId);
        return;
      }
    }
    if (probes.inst) {
      const list = [];
      probes.inst.traverse((m) => { if (m.isMesh && m.visible) list.push(m); });
      const ih = raycaster.intersectObjects(list, false)[0];
      if (ih) {
        e.preventDefault();
        controls.enabled = false;
        drag = { kind: 'inst', id: e.pointerId, ox: instPose.x, oz: instPose.z, px: e.clientX, pz: e.clientY };
        renderer.domElement.setPointerCapture(e.pointerId);
      }
    }
  }

  function onMove(e) {
    if (!drag || drag.id !== e.pointerId) return;
    setRay(e);
    if (drag.kind === 'probe') {
      const hit = hitPipePoint();
      if (!hit) return;
      const p = hit.point;
      const cy = pipe.position.y;
      const dx = p.x;
      const dy = p.y - cy;
      const dz = p.z;
      const theta = Math.atan2(dz, dy);
      state.pos = thetaToPos(theta);
      state.axialMm = clamp(dx / (dims.s * MM), 8, 55);
      applyProbePose();
    } else if (drag.kind === 'inst') {
      const k = 0.0011;
      instPose.x = clamp(drag.ox + (e.clientX - drag.px) * k, -0.7, -0.15);
      instPose.z = clamp(drag.oz + (e.clientY - drag.pz) * k, -0.15, 0.45);
      placeInst();
      emit();
    }
  }

  function onUp(e) {
    if (!drag || drag.id !== e.pointerId) return;
    drag = null;
    controls.enabled = true;
    try { renderer.domElement.releasePointerCapture(e.pointerId); } catch (_) { /* ok */ }
  }

  function onKey(e) {
    if (host.closest('.paut-exam-root')?.hidden) return;
    const step = e.shiftKey ? 5 : 1.5;
    let moved = false;
    if (e.key === 'ArrowLeft') { state.pos = clamp(state.pos - step, P.POS_MIN, P.POS_MAX); moved = true; }
    else if (e.key === 'ArrowRight') { state.pos = clamp(state.pos + step, P.POS_MIN, P.POS_MAX); moved = true; }
    else if (e.key === 'ArrowUp') { state.axialMm = clamp(state.axialMm - step * 0.6, 8, 55); moved = true; }
    else if (e.key === 'ArrowDown') { state.axialMm = clamp(state.axialMm + step * 0.6, 8, 55); moved = true; }
    else if (e.key === 'q' || e.key === 'Q') { state.skewDeg = clamp(state.skewDeg - step, -25, 25); moved = true; }
    else if (e.key === 'e' || e.key === 'E') { state.skewDeg = clamp(state.skewDeg + step, -25, 25); moved = true; }
    else if (e.key === '[' || e.key === '{') { state.angle = clamp(state.angle - 1, P.PA_A0, P.PA_A1); moved = true; }
    else if (e.key === ']' || e.key === '}') { state.angle = clamp(state.angle + 1, P.PA_A0, P.PA_A1); moved = true; }
    else return;
    e.preventDefault();
    applyProbePose();
  }

  renderer.domElement.addEventListener('pointerdown', onDown);
  renderer.domElement.addEventListener('pointermove', onMove);
  renderer.domElement.addEventListener('pointerup', onUp);
  renderer.domElement.addEventListener('pointercancel', onUp);
  window.addEventListener('keydown', onKey);

  function resize() {
    const w = host.clientWidth || 1;
    const h = host.clientHeight || 1;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
  }

  let last = performance.now();
  function tick(now) {
    if (!alive) return;
    raf = requestAnimationFrame(tick);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (state.fanPlay) {
      state.fanT += dt;
      const cycle = (Math.sin(state.fanT * 1.6) + 1) / 2;
      state.angle = P.PA_A0 + cycle * (P.PA_A1 - P.PA_A0);
      rebuildFan();
      dirty = true;
      emit();
    }
    if (dirty) paintScreen();
    controls.update();
    renderer.render(scene, camera);
  }

  const ro = new ResizeObserver(resize);
  ro.observe(host);
  resize();
  tick(performance.now());

  return {
    canvas: screenCanvas,
    getState,
    set(partial) {
      Object.assign(state, partial);
      if ('showDefects' in partial) setDefectVisible(state.showDefects);
      if ('showBeam' in partial) rebuildFan();
      applyProbePose();
      dirty = true;
    },
    nudge(kind, dir) {
      const s = dir < 0 ? -1 : 1;
      if (kind === 'circ') state.pos = clamp(state.pos + s * 2, P.POS_MIN, P.POS_MAX);
      if (kind === 'axial') state.axialMm = clamp(state.axialMm + s * 1.5, 8, 55);
      if (kind === 'skew') state.skewDeg = clamp(state.skewDeg + s * 2, -25, 25);
      if (kind === 'angle') state.angle = clamp(state.angle + s * 1, P.PA_A0, P.PA_A1);
      applyProbePose();
      dirty = true;
    },
    setView(name) {
      computePresets();
      const p = presets[name] || presets.bench;
      if (!p) return;
      camera.position.copy(p.pos);
      controls.target.copy(p.target);
    },
    snapshot() {
      renderer.render(scene, camera);
      return renderer.domElement;
    },
    dispose() {
      alive = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener('keydown', onKey);
      renderer.domElement.removeEventListener('pointerdown', onDown);
      renderer.domElement.removeEventListener('pointermove', onMove);
      renderer.domElement.removeEventListener('pointerup', onUp);
      renderer.domElement.removeEventListener('pointercancel', onUp);
      controls.dispose();
      renderer.dispose();
      pmrem.dispose();
      renderer.domElement.remove();
    },
  };
}
