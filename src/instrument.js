// Inspection-system scene objects (contracts/instrument_manifest.json): instrument GLB placement,
// lab table, coaxial cable with plugs, and the linked screen texture.
import * as THREE from 'three';
import { createLabTable } from './labtable.js';

const MM = 0.001;

export function createInstrument({ scene, gltf, man, connectorTopY, signalColor }) {
  const P = Object.fromEntries(Object.entries(man.parameters).map(([k, v]) => [k, v.value]));
  const lay = man.system_layout;
  const benchY = lay.bench_top_y_mm * MM;

  // ---------------------------------------------------------------- placement
  const root = gltf.scene.getObjectByName('instrument_root');
  const place = new THREE.Group();
  const tilt = new THREE.Group();
  const pivotY = -P.bumper_protrusion * MM;
  const pivotZ = -(P.housing_depth / 2 + P.bumper_protrusion) * MM;
  tilt.position.set(0, pivotY, pivotZ);
  root.position.set(0, -pivotY, -pivotZ);
  tilt.rotation.x = -THREE.MathUtils.degToRad(P.stand_tilt_deg);
  tilt.add(root);
  place.add(tilt);
  place.rotation.y = THREE.MathUtils.degToRad(lay.instrument.yaw_deg);
  scene.add(place);
  place.updateMatrixWorld(true);
  const origin = root.localToWorld(new THREE.Vector3());
  const [px, , pz] = lay.instrument.position_mm.map((v) => v * MM);
  place.position.set(px - origin.x, 0, pz - origin.z);
  place.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  place.position.y = benchY - box.min.y;
  place.updateMatrixWorld(true);

  // ---------------------------------------------------------------- materials / parts
  const cardOf = Object.fromEntries([...man.parts, ...man.system_parts].map((p) => [p.id, p.card]));
  const groups = {};
  const screenCanvas = document.createElement('canvas');
  [screenCanvas.width, screenCanvas.height] = P.screen_texture_px;
  const screenTex = new THREE.CanvasTexture(screenCanvas);
  screenTex.colorSpace = THREE.SRGBColorSpace;
  screenTex.flipY = false;
  screenTex.anisotropy = 4;

  const addTo = (card, obj, mesh) => {
    const g = (groups[card] ||= { pid: card, obj, meshes: [], clip: false, ud: { truth_level: 'T1' }, system: true });
    if (mesh) g.meshes.push(mesh);
    return g;
  };

  for (const node of root.children) {
    const card = cardOf[node.name];
    node.traverse((m) => {
      if (!m.isMesh) return;
      if (node.name === 'instrument__screen') {
        m.material = new THREE.MeshBasicMaterial({ map: screenTex, toneMapped: false });
        m.castShadow = false;
      } else {
        let mat = m.material.clone();
        if (!mat.emissive) mat = new THREE.MeshStandardMaterial({ color: mat.color, roughness: 0.6, metalness: 0 });
        m.material = mat;
        m.castShadow = true;
      }
      m.receiveShadow = true;
      m.userData.base = m.material.emissive ? { emissive: m.material.emissive.clone(), emissiveIntensity: m.material.emissiveIntensity } : null;
      addTo(card, node, m);
    });
  }
  const led = root.getObjectByName('instrument__status_led');

  // ---------------------------------------------------------------- keys and encoder (M5.5)
  const K = man.keys;
  const keys = {};
  for (const id of [...K.grid.flat(), ...Object.keys(K.dpad), ...K.soft]) {
    const obj = root.getObjectByName(id);
    const mesh = obj && (obj.isMesh ? obj : obj.getObjectByProperty('isMesh', true));
    if (!mesh) continue;
    mesh.geometry.computeBoundingBox();
    keys[id] = { id, obj, mesh, z0: obj.position.z, t: -1, decal: null };
  }
  const keyMeshes = Object.values(keys).map((k) => k.mesh);
  const travel = K.press_travel_mm * MM;
  const encoder = root.getObjectByName('instrument__encoder');
  const encMeshes = [];
  encoder?.traverse((m) => { if (m.isMesh) encMeshes.push(m); });
  let encTarget = encoder ? encoder.rotation.z : 0;

  function drawKeyLabel(k, text, dim) {
    const bb = k.mesh.geometry.boundingBox;
    const w = bb.max.x - bb.min.x;
    const h = bb.max.y - bb.min.y;
    const px = 256;
    const cv = document.createElement('canvas');
    cv.width = Math.round(px * Math.min(1, w / h));
    cv.height = Math.round(px * Math.min(1, h / w));
    const ctx = cv.getContext('2d');
    const lines = String(text || '').split('\n').filter(Boolean);
    if (lines.length) {
      const family = 'system-ui, "Microsoft YaHei", "PingFang SC", sans-serif';
      let f = cv.height * 0.34;
      ctx.font = `600 ${f}px ${family}`;
      const widest = Math.max(...lines.map((l) => ctx.measureText(l).width));
      f = Math.min(f, (f * cv.width * 0.8) / widest, (cv.height * 0.78) / (lines.length * 1.12));
      ctx.font = `600 ${f}px ${family}`;
      ctx.fillStyle = dim ? '#aeb6be' : '#eef2f6';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const y0 = cv.height / 2 - ((lines.length - 1) * f * 1.12) / 2;
      lines.forEach((l, i) => ctx.fillText(l, cv.width / 2, y0 + i * f * 1.12));
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    if (k.decal) {
      k.decal.material.map.dispose();
      k.decal.material.map = tex;
      k.decal.material.needsUpdate = true;
      return;
    }
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(w * 0.94, h * 0.94),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    );
    plane.position.set((bb.min.x + bb.max.x) / 2, (bb.min.y + bb.max.y) / 2, bb.max.z + 0.00003);
    plane.renderOrder = 3;
    plane.raycast = () => {};
    k.mesh.add(plane);
    k.decal = plane;
  }

  // labels: { key_id: text }, dim: Set of key ids drawn in the inactive colour
  function labelKeys(labels, dim = new Set()) {
    for (const k of Object.values(keys)) drawKeyLabel(k, labels[k.id], dim.has(k.id));
  }

  function pressKey(id) {
    if (keys[id]) keys[id].t = 0;
  }

  function turnEncoder(detents) {
    encTarget -= THREE.MathUtils.degToRad(K.encoder.detent_deg) * detents;
  }

  function tickControls(dt) {
    for (const k of Object.values(keys)) {
      if (k.t < 0) continue;
      k.t += dt;
      const d = k.t < 0.07 ? k.t / 0.07 : Math.max(0, 1 - (k.t - 0.07) / 0.16);
      k.obj.position.z = k.z0 - travel * d;
      if (k.t > 0.23) { k.t = -1; k.obj.position.z = k.z0; }
    }
    if (encoder) encoder.rotation.z += (encTarget - encoder.rotation.z) * Math.min(1, dt * 18);
  }

  // Ray against keys and encoder: { id: key id | 'encoder', side: -1 | 1 (encoder half) } or null.
  function pickControl(ray) {
    const hit = ray.intersectObjects([...keyMeshes, ...encMeshes], false)[0];
    if (!hit) return null;
    const key = Object.values(keys).find((k) => k.mesh === hit.object);
    if (key) return { id: key.id, distance: hit.distance };
    return { id: 'encoder', side: encoder.worldToLocal(hit.point.clone()).x >= 0 ? 1 : -1, distance: hit.distance };
  }

  // ---------------------------------------------------------------- lab table (always visible; not tied to instrument.setVisible)
  const benchTop = man.materials?.mat_bench?.base_color || '#c9ccd1';
  const lab = createLabTable({
    topY: benchY,
    cx: -0.04,
    cz: -0.05,
    widthMm: 1280,
    depthMm: 780,
    heightMm: 780,
    topColor: benchTop,
  });
  scene.add(lab.group);
  const bench = lab.top;
  lab.group.visible = true;
  bench.visible = true;

  // ---------------------------------------------------------------- cable
  const C = man.cable;
  const plugLen = C.plug.length_mm * MM;
  const reliefLen = C.plug.strain_relief_length_mm * MM;
  const plugR = (C.plug.diameter_mm / 2) * MM;
  const cableR = (C.outer_diameter_mm / 2) * MM;
  const shellMat = new THREE.MeshStandardMaterial({ color: 0xa8acb0, metalness: 1, roughness: 0.25 });
  const jacketMat = new THREE.MeshStandardMaterial({ color: man.materials.mat_cable_jacket.base_color, roughness: man.materials.mat_cable_jacket.roughness, metalness: 0 });
  const cableGroup = new THREE.Group();
  scene.add(cableGroup);

  function makePlug(name, base, dir) {
    const g = new THREE.Group();
    g.name = name;
    const knurl = new THREE.Mesh(new THREE.CylinderGeometry(plugR, plugR, plugLen * 0.55, 24), shellMat);
    knurl.position.y = plugLen * 0.275;
    const body = new THREE.Mesh(new THREE.CylinderGeometry(plugR * 0.8, plugR * 0.9, plugLen * 0.45, 24), shellMat);
    body.position.y = plugLen * 0.775;
    const relief = new THREE.Mesh(new THREE.CylinderGeometry(cableR * 1.05, plugR * 0.75, reliefLen, 20), jacketMat);
    relief.position.y = plugLen + reliefLen / 2;
    g.add(knurl, body, relief);
    g.position.copy(base);
    g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    for (const m of [knurl, body, relief]) { m.castShadow = true; m.receiveShadow = true; }
    cableGroup.add(g);
    return g;
  }

  const portTr = root.getObjectByName('instrument__port_tr');
  const portTop = root.localToWorld(new THREE.Vector3(P.port_tr_x * MM, (P.housing_height + P.port_height) * MM, -P.port_y * MM));
  const dirA = new THREE.Vector3(0, 1, 0).applyQuaternion(root.getWorldQuaternion(new THREE.Quaternion())).normalize();
  const probeTop = new THREE.Vector3(0, connectorTopY, 0);
  const dirB = new THREE.Vector3(0, 1, 0);
  const plugA = makePlug('system__cable_plug_instrument', portTop, dirA);
  const plugB = makePlug('system__cable_plug_probe', probeTop, dirB);
  const UP = new THREE.Vector3(0, 1, 0);
  const BULGE = new THREE.Vector3(0, 0, 0.35);

  // Sag search between two plug ends { pos, dir } (pos = socket face, dir = cable exit):
  // curve length = max(visual length, stretch x chord); the sag point stays above floorY and moves along bulge.
  function solveEnds(a, b, floorY, stretch = 0, bulge = BULGE) {
    const A0 = a.pos.clone().addScaledVector(a.dir, plugLen + reliefLen);
    const A1 = A0.clone().addScaledVector(a.dir, 0.04);
    const B0 = b.pos.clone().addScaledVector(b.dir, plugLen + reliefLen);
    const B1 = B0.clone().addScaledVector(b.dir, 0.05);
    const target = Math.max(C.visual_length_mm * MM, stretch * A1.distanceTo(B1));
    const curveFor = (s) => {
      const mid = A1.clone().add(B1).multiplyScalar(0.5);
      mid.y = Math.max(floorY, mid.y - s);
      mid.addScaledVector(bulge, s);
      return new THREE.CatmullRomCurve3([A0, A1, mid, B1, B0], false, 'centripetal');
    };
    let lo = 0;
    let hi = 0.5;
    for (let i = 0; i < 40; i++) {
      const m = (lo + hi) / 2;
      if (curveFor(m).getLength() < target) lo = m;
      else hi = m;
    }
    return curveFor(lo);
  }

  // Both plugs lying on the bench: the slack forms a round loop beyond the exits (radius solved for the visual length).
  function solveLoop(a, b, floorY) {
    const A0 = a.pos.clone().addScaledVector(a.dir, plugLen + reliefLen);
    const A1 = A0.clone().addScaledVector(a.dir, 0.04);
    const B0 = b.pos.clone().addScaledVector(b.dir, plugLen + reliefLen);
    const B1 = B0.clone().addScaledVector(b.dir, 0.05);
    const f = a.dir.clone().add(b.dir).setY(0);
    const ab = B1.clone().sub(A1).setY(0);
    if (f.lengthSq() < 1e-6) f.set(-ab.z, 0, ab.x);
    f.normalize();
    const s = new THREE.Vector3(-f.z, 0, f.x);
    if (s.dot(ab) < 0) s.negate();
    const m = A1.clone().add(B1).multiplyScalar(0.5).setY(floorY);
    const target = C.visual_length_mm * MM;
    const SWEEP = Math.PI / 2 + 1.2;
    const curveFor = (R) => {
      const c = m.clone().addScaledVector(f, R);
      const pts = [A0, A1];
      for (let i = 0; i <= 10; i++) {
        const t = -SWEEP + (2 * SWEEP * i) / 10;
        pts.push(c.clone().addScaledVector(f, R * Math.cos(t)).addScaledVector(s, R * Math.sin(t)));
      }
      pts.push(B1, B0);
      return new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    };
    if (curveFor(0.005).getLength() >= target) return solveEnds(a, b, floorY, 1.05, s.clone().multiplyScalar(0.35));
    let lo = 0.005;
    let hi = 0.3;
    for (let i = 0; i < 30; i++) {
      const R = (lo + hi) / 2;
      if (curveFor(R).getLength() < target) lo = R;
      else hi = R;
    }
    return curveFor(lo);
  }

  const homeA = { pos: portTop.clone(), dir: dirA.clone() };
  const solveCurve = (top, floorY, stretch = 0) => solveEnds(homeA, { pos: top, dir: dirB }, floorY, stretch);
  let curve = solveCurve(probeTop, benchY + cableR + 0.004);
  const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 220, cableR, 14, false), jacketMat);
  tube.name = 'system__probe_cable';
  tube.castShadow = true;
  tube.receiveShadow = true;
  cableGroup.add(tube);
  const signal = new THREE.Mesh(
    new THREE.TubeGeometry(curve, 220, cableR * 1.35, 14, false),
    new THREE.ShaderMaterial({
      uniforms: { uFront: { value: -1 }, uBand: { value: 0.045 }, uAmp: { value: 0 }, uCol: { value: new THREE.Color(signalColor || '#f59e0b') } },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `varying vec2 vUv; uniform float uFront, uBand, uAmp; uniform vec3 uCol;
        void main() { float g = exp(-pow((vUv.x - uFront) / uBand, 2.0)) * uAmp; if (g < 0.02) discard; gl_FragColor = vec4(uCol * (0.7 + 0.8 * g), g); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }),
  );
  signal.renderOrder = 12;
  signal.raycast = () => {};
  cableGroup.add(signal);
  const cablePart = addTo('system__probe_cable', tube, null);
  cablePart.meshes.push(tube);
  for (const g of [plugA, plugB]) g.traverse((m) => { if (m.isMesh) cablePart.meshes.push(m); });
  for (const m of cablePart.meshes) {
    m.material = m.material.clone();
    m.userData.base = { emissive: m.material.emissive.clone(), emissiveIntensity: m.material.emissiveIntensity };
  }

  const parts = Object.values(groups);
  const pickMeshes = parts.flatMap((p) => p.meshes);
  for (const p of parts) {
    p.samples = [];
    for (const m of p.meshes.slice(0, 6)) {
      const pos = m.geometry.attributes.position;
      for (let i = 0; i < 4; i++) p.samples.push({ mesh: m, v: new THREE.Vector3().fromBufferAttribute(pos, Math.floor(((i + 0.5) / 4) * pos.count)) });
    }
    const b = new THREE.Box3().setFromObject(p.obj);
    const s = b.getSize(new THREE.Vector3());
    p.volume = s.x * s.y * s.z;
    p.thin = false;
  }

  /** @param on instrument + cable
   *  @param {{ bench?: boolean }} opts  bench defaults to `on`; pass `{ bench: true }` to keep the lab table while hiding the instrument. */
  function setVisible(on, opts = {}) {
    const showBench = opts.bench !== undefined ? !!opts.bench : !!on;
    place.visible = on;
    cableGroup.visible = on;
    lab.group.visible = showBench;
    bench.visible = showBench;
  }
  setVisible(false);

  function highlight(selected, hovered) {
    for (const p of parts) {
      for (const m of p.meshes) {
        const b = m.userData.base;
        if (!b || !m.material.emissive) continue;
        if (p.pid === selected) {
          m.material.emissive.setRGB(0.95, 0.55, 0.05);
          m.material.emissiveIntensity = 0.3;
        } else if (p.pid === hovered) {
          m.material.emissive.setRGB(0.1, 0.35, 0.95);
          m.material.emissiveIntensity = 0.25;
        } else {
          m.material.emissive.copy(b.emissive);
          m.material.emissiveIntensity = b.emissiveIntensity;
        }
      }
    }
  }

  // Signal pulse along the cable: pos 0 = instrument end, 1 = probe end; amp 0 hides it.
  function setSignal(pos, amp) {
    signal.material.uniforms.uFront.value = pos;
    signal.material.uniforms.uAmp.value = amp;
  }

  // Per-frame phase glow (k 0..1 per card id); selected / hovered parts keep their highlight.
  const glowCol = new THREE.Color();
  function applyGlow(glow, color, selected, hovered) {
    for (const p of parts) {
      if (p.pid === selected || p.pid === hovered) continue;
      const k = glow[p.pid] || 0;
      const isLed = p.pid === 'instrument__status_led';
      for (const m of p.meshes) {
        const b = m.userData.base;
        if (!b || !m.material.emissive) continue;
        if (isLed) {
          m.material.emissive.copy(b.emissive);
          m.material.emissiveIntensity = b.emissiveIntensity * (1 + 3 * k);
        } else if (k > 0.01) {
          m.material.emissive.copy(glowCol.set(color));
          m.material.emissiveIntensity = 0.9 * k;
        } else {
          m.material.emissive.copy(b.emissive);
          m.material.emissiveIntensity = b.emissiveIntensity;
        }
      }
    }
  }

  function updateScreen(draw) {
    draw(screenCanvas);
    screenTex.needsUpdate = true;
  }

  // Probe end follows the probe (mode practice): top = connector top in world metres, floorY = lowest sag height.
  function setTube(segments) {
    tube.geometry.dispose();
    tube.geometry = new THREE.TubeGeometry(curve, segments, cableR, 14, false);
    signal.geometry.dispose();
    signal.geometry = new THREE.TubeGeometry(curve, segments, cableR * 1.35, 14, false);
  }

  const putPlug = (g, end) => {
    g.position.copy(end.pos);
    g.quaternion.setFromUnitVectors(UP, end.dir);
  };

  function setProbeAnchor(top, { floorY = benchY + cableR + 0.004, segments = 220, stretch = 1.18 } = {}) {
    probeTop.copy(top);
    putPlug(plugA, homeA);
    putPlug(plugB, { pos: top, dir: dirB });
    curve = solveCurve(top, floorY, stretch);
    setTube(segments);
  }

  // Equipment bench: free plug ends { pos, dir } in world metres; loop = both plugs lying on the bench.
  function setCableEnds(a, b, { floorY = benchY + cableR + 0.004, segments = 160, stretch = 1.25, bulge, loop = false } = {}) {
    putPlug(plugA, a);
    putPlug(plugB, b);
    curve = loop ? solveLoop(a, b, benchY + cableR + 0.0015) : solveEnds(a, b, floorY, stretch, bulge);
    setTube(segments);
  }

  // Socket face (top of the port cylinder) and plug direction of a port on the instrument, live world pose.
  function portEnd(which) {
    root.updateMatrixWorld(true);
    return {
      pos: root.localToWorld(new THREE.Vector3(P[`port_${which}_x`] * MM, (P.housing_height + P.port_height) * MM, -P.port_y * MM)),
      dir: UP.clone().applyQuaternion(root.getWorldQuaternion(new THREE.Quaternion())).normalize(),
    };
  }

  const endpoints = () => ({
    a: curve.getPoint(0), b: curve.getPoint(1), portTop: portTop.clone(), probeTop: probeTop.clone(),
    length: curve.getLength(), minY: Math.min(...curve.getPoints(200).map((p) => p.y)),
  });
  const bounds = () => new THREE.Box3().setFromObject(place);

  function setCableVisible(on) {
    cableGroup.visible = on;
  }

  return {
    parts, pickMeshes, setVisible, setCableVisible, highlight, updateScreen, setSignal, applyGlow, screenCanvas, led, endpoints, bounds, place, bench, lab, portTr,
    keys, encoder, labelKeys, pressKey, turnEncoder, tickControls, pickControl, setProbeAnchor,
    setCableEnds, portEnd, cableGroup, plugA, plugB, plugR, cableR,
    get curve() { return curve; },
  };
}
