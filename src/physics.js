// Physics-mode overlays (all T3 teaching schematics). Drawn on the section plane x = 0 of the
// cutaway state; never used for time-of-flight (manifest.physics_geometry_policy).
import * as THREE from 'three';

const X_OFF = 0.00018;
const TAU = Math.PI * 2;

const bump = (t, t0, w) => {
  const u = (t - t0) / w;
  return u <= 0 || u >= 1 ? 0 : Math.sin(Math.PI * u);
};
const clamp01 = (x) => Math.min(1, Math.max(0, x));

const VERT = /* glsl */ `
  varying vec3 vW;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vW = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }`;

const PULSE_FN = /* glsl */ `
  float pulse(float u, float cyc) {
    if (u <= 0.0 || u >= cyc) return 0.0;
    return sin(6.28318 * u) * exp(-u / max(cyc * 0.35, 0.3)) * min(1.0, u * 3.0);
  }`;

// Forward path: wear face -> couplant -> steel. Depth d measured from the element front face.
const FRONT_FRAG = /* glsl */ `
  varying vec3 vW;
  uniform float uYef, uGapD, uGapT, uR, uN, uTan, uLam, uEnvA;
  uniform float uF1, uA1, uC1, uF2, uA2, uC2, uLim2, uTrans;
  uniform vec3 uColA, uColB;
  ${PULSE_FN}
  void main() {
    float d = uYef - vW.y;
    float z = abs(vW.z);
    float w = d < uN ? uR : uR + (d - uN) * uTan;
    float inBeam = 1.0 - smoothstep(w - 0.0005, w + 0.0005, z);
    if (inBeam <= 0.001) discard;
    float s = uN - uR / uTan;
    float q = d < uN ? d : uN + (length(vec2(d - s, z)) - (uN - s));
    float spread = d > uN ? uN / d : 1.0;
    float trans = d > uGapD + uGapT ? uTrans : 1.0;
    float p1 = pulse((uF1 - q) / uLam, uC1) * uA1 * trans * spread;
    float p2 = d < uLim2 ? pulse((q - uF2) / uLam, uC2) * uA2 * spread : 0.0;
    float p = p1 + p2;
    float a = inBeam * (uEnvA + 0.9 * min(1.0, abs(p)));
    gl_FragColor = vec4(p >= 0.0 ? uColA : uColB, a);
  }`;

// Echo scattered upward from a small reflector tip (flat-bottom hole) at (y = uYc, z = 0).
const SCATTER_FRAG = /* glsl */ `
  varying vec3 vW;
  uniform float uYc, uYtop, uRad, uA, uC, uLam, uR0;
  uniform vec3 uColA, uColB;
  ${PULSE_FN}
  void main() {
    if (vW.y < uYc || vW.y > uYtop) discard;
    vec2 v = vec2(vW.z, vW.y - uYc);
    float r = length(v);
    float p = pulse((uRad - r) / uLam, uC) * uA * sqrt(uR0 / max(r, uR0)) * (0.35 + 0.65 * v.y / max(r, 1e-5));
    float a = 0.9 * min(1.0, abs(p));
    if (a < 0.01) discard;
    gl_FragColor = vec4(p >= 0.0 ? uColA : uColB, a);
  }`;

// Backward wave into the backing, attenuated with distance.
const BACK_FRAG = /* glsl */ `
  varying vec3 vW;
  uniform float uY0, uF, uA, uC, uLam, uDecay, uR;
  uniform vec3 uColA, uColB;
  ${PULSE_FN}
  void main() {
    float d = vW.y - uY0;
    if (d < 0.0 || abs(vW.z) > uR) discard;
    float p = pulse((uF - d) / uLam, uC) * uA * exp(-d / uDecay);
    float a = 0.9 * min(1.0, abs(p));
    if (a < 0.01) discard;
    gl_FragColor = vec4(p >= 0.0 ? uColA : uColB, a);
  }`;

// Thickness-direction electric field between the electrodes.
const FIELD_FRAG = /* glsl */ `
  varying vec3 vW;
  uniform float uY0, uY1, uField, uR;
  uniform vec3 uCol;
  void main() {
    if (abs(vW.z) > uR) discard;
    float yn = (vW.y - uY0) / (uY1 - uY0);
    if (uField < 0.0) yn = 1.0 - yn;
    float sp = 0.0016;
    float fz = fract((vW.z + 0.5 * sp) / sp) - 0.5;
    float shaft = (1.0 - smoothstep(0.035, 0.07, abs(fz))) * step(yn, 0.6);
    float head = step(0.6, yn) * step(abs(fz), (1.0 - yn) * 0.55);
    float a = abs(uField) * max(shaft, head);
    if (a < 0.02) discard;
    gl_FragColor = vec4(uCol, a);
  }`;

// Air micro-gap: rough boundaries with air between.
const GAP_FRAG = /* glsl */ `
  varying vec3 vW;
  uniform float uY0, uY1, uR, uOn;
  void main() {
    if (abs(vW.z) > uR || uOn < 0.01) discard;
    float yn = (vW.y - uY0) / (uY1 - uY0);
    float z = vW.z * 1000.0;
    float lo = 0.22 + 0.2 * sin(z * 3.1) * sin(z * 1.7 + 1.3);
    float hi = 0.78 + 0.2 * sin(z * 2.3 + 0.7) * sin(z * 1.1);
    vec3 col = (yn < lo || yn > hi) ? vec3(0.28, 0.32, 0.38) : vec3(0.88, 0.95, 1.0);
    gl_FragColor = vec4(col, 0.95 * uOn);
  }`;

// Travelling glow along the wiring (world-Y front).
const FLOW_VERT = VERT;
const FLOW_FRAG = /* glsl */ `
  varying vec3 vW;
  uniform float uFront, uBand, uAmp;
  uniform vec3 uCol;
  void main() {
    float g = exp(-pow((vW.y - uFront) / uBand, 2.0)) * uAmp;
    if (g < 0.02) discard;
    gl_FragColor = vec4(uCol * (0.6 + 0.8 * g), g);
  }`;

function shaderMat(frag, uniforms, extra = {}) {
  return new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: frag, uniforms,
    transparent: true, depthWrite: false, side: THREE.DoubleSide, ...extra,
  });
}

export function createPhysics(ctx) {
  const { scene, parts, physicsRef, chainColors } = ctx;
  const root = new THREE.Group();
  root.visible = false;
  scene.add(root);

  const lam0 = physicsRef.lambda_steel_mm / 1000;
  const N0 = physicsRef.near_field_mm / 1000;
  const tan0 = Math.tan((physicsRef.half_angle_deg * Math.PI) / 180);
  let lam = lam0;
  let N = N0;
  let tanT = tan0;
  let beamR = null; // null = use mesh radius from active element

  const colA = new THREE.Color(chainColors.propagation).lerp(new THREE.Color('#ffffff'), 0.25);
  const colB = new THREE.Color(chainColors.propagation).multiplyScalar(0.55);
  const colAcA = new THREE.Color(chainColors.acoustic).lerp(new THREE.Color('#ffffff'), 0.3);
  const colAcB = new THREE.Color(chainColors.acoustic).multiplyScalar(0.6);
  const colEl = new THREE.Color(chainColors.electrical);

  const unitPlane = new THREE.PlaneGeometry(1, 1);
  const plane = (mat) => {
    const m = new THREE.Mesh(unitPlane, mat);
    m.rotation.y = Math.PI / 2;
    m.renderOrder = 10;
    root.add(m);
    return m;
  };
  const fit = (m, width, y0, y1) => {
    m.scale.set(width, y1 - y0, 1);
    m.position.set(X_OFF, (y0 + y1) / 2, 0);
  };

  const U = (v) => ({ value: v });
  const front = plane(shaderMat(FRONT_FRAG, {
    uYef: U(0), uGapD: U(0), uGapT: U(0), uR: U(0), uN: U(N), uTan: U(tanT), uLam: U(lam), uEnvA: U(0),
    uF1: U(-1), uA1: U(0), uC1: U(2), uF2: U(-1), uA2: U(0), uC2: U(2), uLim2: U(0), uTrans: U(1),
    uColA: U(colA), uColB: U(colB),
  }));
  const backing = plane(shaderMat(BACK_FRAG, {
    uY0: U(0), uF: U(-1), uA: U(0), uC: U(2), uLam: U(0.0016), uDecay: U(0.003), uR: U(0),
    uColA: U(colAcA), uColB: U(colAcB),
  }));
  const scatter = plane(shaderMat(SCATTER_FRAG, {
    uYc: U(0), uYtop: U(0), uRad: U(-1), uA: U(0), uC: U(2), uLam: U(lam), uR0: U(0.003),
    uColA: U(colA), uColB: U(colB),
  }));
  scatter.renderOrder = 11;
  scatter.visible = false;
  const field = plane(shaderMat(FIELD_FRAG, { uY0: U(0), uY1: U(0), uField: U(0), uR: U(0), uCol: U(colEl) }));
  const gap = plane(shaderMat(GAP_FRAG, { uY0: U(0), uY1: U(0), uR: U(0), uOn: U(0) }));
  gap.renderOrder = 9;

  // Beam envelope edges (schematic) and near-field marker.
  const edgeMat = new THREE.LineDashedMaterial({ color: new THREE.Color(chainColors.propagation), dashSize: 0.0012, gapSize: 0.0008, transparent: true, opacity: 0.9 });
  const edges = new THREE.LineSegments(new THREE.BufferGeometry(), edgeMat);
  edges.renderOrder = 11;
  root.add(edges);

  // Wiring flow overlays share the wiring geometry.
  const flows = [];
  for (const m of parts['probe__wiring'].meshes) {
    const o = new THREE.Mesh(m.geometry, new THREE.ShaderMaterial({
      vertexShader: FLOW_VERT, fragmentShader: FLOW_FRAG,
      uniforms: { uFront: U(0), uBand: U(0.0022), uAmp: U(0), uCol: U(colEl) },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    o.renderOrder = 12;
    o.visible = false;
    m.add(o);
    flows.push(o);
  }

  const markers = [
    { key: 'N', pos: new THREE.Vector3(), text: '' },
    { key: 'theta', pos: new THREE.Vector3(), text: '' },
    { key: 'air', pos: new THREE.Vector3(), text: ctx.airLabel },
  ];
  function refreshMarkerText() {
    markers[0].text = `N ≈ ${(N * 1000).toFixed(1)} mm`;
    markers[1].text = `θ ≈ ${(Math.atan(tanT) * 180 / Math.PI).toFixed(1)}°`;
  }
  refreshMarkerText();

  const box = new THREE.Box3();
  const span = (pid) => {
    box.setFromObject(parts[pid].obj);
    return { y0: box.min.y, y1: box.max.y, r: (box.max.z - box.min.z) / 2 };
  };
  let G = null;

  // Re-fit every overlay to the current stack (matching-layer variant, thin-layer magnify).
  function layout() {
    const el = span('probe__active_element');
    const rear = span('probe__rear_electrode');
    const back = span('probe__backing');
    const coup = span('probe__couplant');
    const steel = span('probe__steel_block');
    const conn = span('probe__connector');
    G = { el, rear, back, coup, steel, conn, dBottom: el.y0 - steel.y0, gapD: el.y0 - coup.y1, gapT: coup.y1 - coup.y0 };

    fit(front, steel.r * 2, steel.y0, el.y0);
    fit(scatter, steel.r * 2, steel.y0, steel.y1);
    scatter.material.uniforms.uYtop.value = steel.y1;
    scatter.material.uniforms.uLam.value = lam;
    const fu = front.material.uniforms;
    const rBeam = beamR != null ? beamR : el.r;
    fu.uYef.value = el.y0; fu.uGapD.value = G.gapD; fu.uGapT.value = G.gapT; fu.uR.value = rBeam;
    fu.uN.value = N; fu.uTan.value = tanT; fu.uLam.value = lam;
    fit(backing, back.r * 2, back.y0, back.y1);
    backing.material.uniforms.uY0.value = back.y0;
    backing.material.uniforms.uR.value = back.r;
    fit(field, el.r * 2, el.y0, el.y1);
    field.material.uniforms.uY0.value = el.y0;
    field.material.uniforms.uY1.value = el.y1;
    field.material.uniforms.uR.value = el.r;
    fit(gap, coup.r * 2, coup.y0, coup.y1);
    gap.material.uniforms.uY0.value = coup.y0;
    gap.material.uniforms.uY1.value = coup.y1;
    gap.material.uniforms.uR.value = coup.r;

    const yN = el.y0 - N;
    const yB = steel.y0;
    const wB = rBeam + (el.y0 - yB - N) * tanT;
    const pts = [];
    for (const s of [-1, 1]) {
      pts.push(new THREE.Vector3(X_OFF, steel.y1, s * rBeam), new THREE.Vector3(X_OFF, yN, s * rBeam));
      pts.push(new THREE.Vector3(X_OFF, yN, s * rBeam), new THREE.Vector3(X_OFF, yB, s * wB));
    }
    pts.push(new THREE.Vector3(X_OFF, yN, -rBeam * 1.9), new THREE.Vector3(X_OFF, yN, rBeam * 1.9));
    edges.geometry.dispose();
    edges.geometry = new THREE.BufferGeometry().setFromPoints(pts);
    edges.computeLineDistances();

    markers[0].pos.set(X_OFF, yN, rBeam * 1.9);
    markers[1].pos.set(X_OFF, (yN + yB) / 2, (rBeam + wB) / 2 + 0.002);
    markers[2].pos.set(X_OFF, (coup.y0 + coup.y1) / 2, coup.r + 0.001);
    refreshMarkerText();
  }
  layout();

  const st = {
    active: false, anim: 'idle', reverse: false, beam: true, backing: true, medium: 'couplant', stopAfter: 6,
    t0: performance.now(), period: 3.2,
  };

  const PERIOD = {
    idle: 3.2, anim__signal_path: 3.2, anim__electric_field: 2.6, anim__piezo_thickness_mode: 3.2,
    anim__beam_in_steel: 3.6, anim__backing_damping: 4.5, anim__couplant_air_gap: 3.6,
    anim__quarter_wave_demo: 3.6, anim__removal_chain: 7.0,
  };

  function configure(cfg) {
    Object.assign(st, cfg);
    st.period = st.reverse ? 4.6 : PERIOD[st.anim] || 3.2;
    st.t0 = performance.now();
    gap.material.uniforms.uOn.value = st.medium === 'air' ? 1 : 0;
    backing.visible = st.backing;
  }

  function setActive(on) {
    st.active = on;
    root.visible = on;
    flows.forEach((f) => { f.visible = on; });
  }

  function ring(t, t0, tau) {
    if (t < t0) return 0;
    const u = t - t0;
    return Math.exp(-u / tau) * Math.sin(TAU * 2.2 * u);
  }

  // Returns per-part glow (0..1), element strain (fraction of thickness) and loop phase.
  function update(now) {
    if (!st.active) return { glow: {}, strain: 0 };
    const { el, conn, dBottom, gapD, gapT } = G;
    const t = ((now - st.t0) / 1000) % st.period;
    const fu = front.material.uniforms;
    const bu = backing.material.uniforms;
    const glow = {};
    let strain = 0;
    let fieldV = 0;
    let flowFront = 0;
    let flowAmp = 0;

    fu.uEnvA.value = st.beam ? 0.16 : 0;
    edges.visible = st.beam;
    fu.uA1.value = 0; fu.uA2.value = 0; fu.uTrans.value = 1; fu.uC1.value = 2; fu.uC2.value = 2;
    bu.uA.value = 0;
    scatter.visible = false;

    const emit = (t0, v, cyc, tau) => {
      fieldV = Math.max(fieldV, bump(t, t0 - 0.12, 0.24));
      strain += 0.22 * ring(t, t0, tau);
      fu.uF1.value = Math.max(0, (t - t0) * v);
      fu.uA1.value = 1;
      fu.uC1.value = cyc;
      if (st.backing) {
        bu.uF.value = Math.max(0, (t - t0) * v * 0.6);
        bu.uA.value = 1;
        bu.uC.value = cyc;
      }
    };
    const flowDown = (t0, dur) => {
      flowFront = conn.y0 - (conn.y0 - el.y1) * clamp01((t - t0) / dur);
      flowAmp = t > t0 - 0.05 && t < t0 + dur + 0.15 ? 1 : 0;
    };
    const flowUp = (t0, dur) => {
      flowFront = el.y1 + (conn.y0 - el.y1) * clamp01((t - t0) / dur);
      flowAmp = t > t0 - 0.05 && t < t0 + dur + 0.1 ? 1 : 0;
    };
    const electrodes = (k) => {
      glow['probe__rear_electrode'] = k;
      glow['probe__front_electrode'] = k;
    };

    switch (st.anim) {
      case 'anim__signal_path': {
        if (!st.reverse) {
          glow['probe__connector'] = bump(t, 0, 0.5);
          flowDown(0.3, 1.2);
          electrodes(bump(t, 1.35, 0.6));
        } else {
          const v = dBottom / 1.6;
          fu.uF2.value = dBottom - t * v;
          fu.uA2.value = t < 1.75 ? 0.8 : 0;
          fu.uLim2.value = dBottom + 0.01;
          strain = t > 1.6 ? 0.12 * ring(t, 1.6, 0.35) : 0;
          electrodes(bump(t, 1.6, 0.5));
          flowUp(2.0, 1.2);
          glow['probe__connector'] = bump(t, 3.1, 0.6);
        }
        break;
      }
      case 'anim__electric_field': {
        fieldV = bump(t, 0.4, 0.5);
        electrodes(fieldV);
        break;
      }
      case 'anim__piezo_thickness_mode': {
        fieldV = bump(t, 0.2, 0.3);
        electrodes(fieldV);
        strain = 0.22 * ring(t, 0.42, 0.55);
        break;
      }
      case 'anim__beam_in_steel': {
        emit(0.3, dBottom / 1.9, 2, 0.5);
        break;
      }
      case 'anim__backing_damping': {
        const cyc = st.backing ? 2 : 10;
        emit(0.3, 0.007, cyc, st.backing ? 0.45 : 2.3);
        break;
      }
      case 'anim__couplant_air_gap': {
        const v = 0.009;
        emit(0.3, v, 2, 0.5);
        if (st.medium === 'air') {
          fu.uTrans.value = 0.03;
          const tHit = 0.3 + (gapD + gapT) / v;
          fu.uF2.value = gapD + gapT - Math.max(0, t - tHit) * v;
          fu.uA2.value = t > tHit ? 0.9 : 0;
          fu.uLim2.value = gapD + gapT;
        }
        break;
      }
      case 'anim__quarter_wave_demo': {
        emit(0.3, dBottom / 1.9, 2, 0.5);
        glow['probe__matching_layer_optional'] = 0.35 + 0.65 * bump(t, 0.25, 0.6);
        break;
      }
      case 'anim__removal_chain': {
        // Forward chain, then echo; everything after stage `stopAfter` never happens.
        const s = st.stopAfter;
        const v = dBottom / 1.6;
        const tE = 3.3;
        if (s >= 0) glow['probe__connector'] = bump(t, 0, 0.5);
        if (s >= 1) flowDown(0.3, 1.2);
        if (s >= 2) electrodes(bump(t, 1.35, 0.6));
        if (s >= 3) fieldV = bump(t, 1.4, 0.45);
        if (s >= 4) strain = 0.22 * ring(t, 1.62, 0.45);
        if (s >= 5) {
          fu.uF1.value = Math.max(0, (t - 1.65) * v);
          fu.uA1.value = t > 1.65 ? 1 : 0;
          if (st.backing) { bu.uF.value = Math.max(0, (t - 1.65) * 0.0042); bu.uA.value = 1; }
        }
        if (s >= 6) {
          fu.uF2.value = dBottom - (t - tE) * v;
          fu.uA2.value = t > tE && t < tE + 1.75 ? 0.8 : 0;
          fu.uLim2.value = dBottom + 0.01;
          if (t > tE + 1.6) strain += 0.12 * ring(t, tE + 1.6, 0.35);
          if (t > tE + 1.5) {
            electrodes(bump(t, tE + 1.6, 0.5));
            flowUp(tE + 2.0, 1.2);
            glow['probe__connector'] = bump(t, tE + 3.1, 0.6);
          }
        }
        break;
      }
      case 'external': {
        // Driven by the inspection state machine: times in seconds of the cycle, fronts as 0..1 of dBottom.
        const e = st.ext;
        if (!e) break;
        const T = e.start;
        const tc = e.tc;
        const sound = e.front != null || e.back != null;
        fu.uEnvA.value = (e.steady ? 0.16 : sound ? 0.07 : 0) * e.trans;
        edges.visible = !!e.steady;
        if (e.phase === 'IDLE') break;
        const tTx = T.PIEZO_TX;
        const rx = e.trans * e.trans;
        glow['probe__connector'] = Math.max(bump(tc, tTx - 0.1, 0.35), rx * bump(tc, T.CABLE_RX + 0.35, 0.4));
        if (tc >= tTx && tc < T.SOUND_FORWARD) {
          flowFront = conn.y0 - (conn.y0 - el.y1) * clamp01((tc - tTx - 0.05) / 0.4);
          flowAmp = 1;
        }
        const fx = e.defect ? rx * Math.min(1, Math.sqrt(e.defect.rel)) : 0;
        const tF = e.defect ? e.defect.tc : Infinity;
        electrodes(Math.max(bump(tc, tTx + 0.4, 0.4), rx * bump(tc, T.PIEZO_RX, 0.45), fx * bump(tc, tF, 0.35)));
        fieldV = bump(tc, tTx + 0.42, 0.32);
        if (tc > tTx + 0.55) strain += 0.22 * ring(tc, tTx + 0.55, e.tau);
        if (tc > T.PIEZO_RX) strain += 0.12 * rx * ring(tc, T.PIEZO_RX + 0.05, e.tau * 0.7);
        if (tc > tF) strain += 0.1 * fx * ring(tc, tF + 0.03, e.tau * 0.7);
        glow['probe__connector'] = Math.max(glow['probe__connector'], fx * bump(tc, tF + 0.15, 0.3));
        if (tc >= tF && tc < tF + 0.4) {
          flowFront = el.y1 + (conn.y0 - el.y1) * clamp01((tc - tF) / 0.3);
          flowAmp = fx;
        }
        if (e.defect && e.fv != null) {
          const su = scatter.material.uniforms;
          const yc = e.defect.y;
          const rad = e.fv * dBottom - (el.y0 - yc);
          if (rad > 0 && rad < G.steel.y1 - yc + lam * e.cycles) {
            scatter.visible = true;
            su.uYc.value = yc;
            su.uRad.value = rad;
            su.uA.value = 1.6 * e.trans * Math.min(1, Math.sqrt(e.defect.rel));
            su.uC.value = e.cycles;
          }
        }
        if (e.front != null) {
          fu.uF1.value = e.front * dBottom;
          fu.uA1.value = 1.8;
          fu.uC1.value = e.cycles;
          fu.uTrans.value = e.trans;
          if (st.backing) {
            bu.uF.value = e.front * dBottom * 0.35;
            bu.uA.value = 1;
            bu.uC.value = e.cycles;
          }
        }
        if (e.back != null) {
          fu.uF2.value = e.back * dBottom;
          fu.uA2.value = 1.5 * rx;
          fu.uC2.value = e.cycles;
          fu.uLim2.value = dBottom + 0.01;
        }
        if (tc >= T.CABLE_RX && tc < T.INSTRUMENT_RX) {
          flowFront = el.y1 + (conn.y0 - el.y1) * clamp01((tc - T.CABLE_RX) / 0.4);
          flowAmp = tc < T.CABLE_RX + 0.5 ? rx : 0;
        }
        break;
      }
      default: {
        emit(0.2, dBottom / 1.8, 2, 0.5);
        strain *= 0.5;
        fieldV = 0;
      }
    }

    field.material.uniforms.uField.value = fieldV;
    flows.forEach((f) => {
      f.material.uniforms.uFront.value = flowFront;
      f.material.uniforms.uAmp.value = flowAmp;
    });
    return { glow, strain, phase: t / st.period, t };
  }

  function visibleMarkers() {
    if (!st.active || st.anim === 'external') return [];
    const out = [];
    if (st.beam) out.push(markers[0], markers[1]);
    if (st.medium === 'air') out.push(markers[2]);
    return out;
  }

  function setBeamParams({ lambda_mm, near_field_mm, half_angle_deg, radius_mm } = {}) {
    if (lambda_mm != null) lam = lambda_mm / 1000;
    if (near_field_mm != null) N = near_field_mm / 1000;
    if (half_angle_deg != null) tanT = Math.tan((half_angle_deg * Math.PI) / 180);
    if (radius_mm === null) beamR = null;
    else if (radius_mm != null) beamR = radius_mm / 1000;
    if (G) layout();
  }

  function drive(ext) {
    st.ext = ext;
  }

  return { configure, setActive, update, visibleMarkers, layout, setBeamParams, drive, state: st };
}
