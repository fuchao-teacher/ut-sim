// Equipment bench drag-assembly (M7.4, contracts/equipment_manifest.json assembly): cable plugs, couplant
// bottle and probe are dragged on the bench; snap targets and the physical state drive the bench A-scan.
// M7.6: every bench item moves and turns about Y (instrument, test blocks, plate, probe, bottle; the cable
// body carries its free plugs); mouse wheel while dragging turns the held item; the plate carries what lies on it.
// Bench coordinates are mm (x right, z toward the overview camera); world = mm * 0.001.
import * as THREE from 'three';

const MM = 0.001;
const UP = new THREE.Vector3(0, 1, 0);

// three.js rotation.y: local (x, z) -> world (x c + z s, -x s + z c).
const rot = (x, z, yaw) => {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  return { x: x * c + z * s, z: -x * s + z * c };
};

export function createAssembly({ scene, man, equipment, instrument, practice, probeRoot, benchY, connectorTop, placeProbe }) {
  const A = man.assembly;
  const items = man.equipment;
  const SNAP = A.snap_radius_mm;
  const PATCH_R = A.couplant_patch.radius_mm;
  const BENCH = A.bench_limits_mm;
  const TARGET_ID = { probe: 'probe__connector', port_tr: items.eq__instrument.ports.tr, port_r: items.eq__instrument.ports.r };

  const plateId = items.eq__plate.node;
  const sp = practice.specimens[plateId];
  const probeYaw0 = probeRoot.rotation.y;
  const nodeId = new Map(equipment.rigidIds().map((id) => [equipment.nodeOf(id), id]));
  const plateTop = benchY + sp.T * MM;
  const rProbe = sp.L / 2 - practice.limits(plateId).x;
  const rBottle = items.eq__couplant.size_mm.diameter / 2;
  const probeHome = items.eq__probe_straight.bench;
  const bottleHome = items.eq__couplant.bench;
  const rest = items.eq__cable.rest;
  const plugR = instrument.plugR / MM;
  const cableR = instrument.cableR;

  const patchGroup = new THREE.Group();
  patchGroup.name = 'eq__couplant_patches';
  scene.add(patchGroup);
  const patchMat = new THREE.MeshStandardMaterial({
    color: A.couplant_patch.color, transparent: true, opacity: A.couplant_patch.opacity, roughness: 0.1, metalness: 0,
    depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  const patchGeo = new THREE.CircleGeometry(PATCH_R * MM, 40);
  patchGeo.rotateX(-Math.PI / 2);

  const S = {};
  let drag = null;

  // ------------------------------------------------------------ geometry helpers
  // Plate local frame = practice frame: x along L, y = -(local z); live pose of the plate on the bench.
  const plate = () => equipment.poseOf('eq__plate');
  const localIn = (P, x, z) => {
    const q = rot(x - P.x, z - P.z, -P.yaw);
    return { x: q.x, y: -q.z };
  };
  const worldIn = (P, lx, ly) => {
    const w = rot(lx, -ly, P.yaw);
    return { x: P.x + w.x, z: P.z + w.z };
  };
  const local = (x, z) => localIn(plate(), x, z);
  const onPlateAt = (x, z, margin = 0) => {
    const q = local(x, z);
    return Math.abs(q.x) <= sp.L / 2 + margin && Math.abs(q.y) <= sp.W / 2 + margin;
  };
  const clampPlate = (x, z, r) => {
    const q = local(x, z);
    const lx = sp.L / 2 - r, ly = sp.W / 2 - r;
    return worldIn(plate(), Math.min(lx, Math.max(-lx, q.x)), Math.min(ly, Math.max(-ly, q.y)));
  };
  const clampBench = (x, z) => ({
    x: Math.min(BENCH.x1, Math.max(BENCH.x0, x)),
    z: Math.min(BENCH.z1, Math.max(BENCH.z0, z)),
  });
  const planeHit = (ray, y) => {
    if (Math.abs(ray.direction.y) < 1e-9) return null;
    const t = (y - ray.origin.y) / ray.direction.y;
    return t > 0 ? ray.at(t, new THREE.Vector3()) : null;
  };

  // ------------------------------------------------------------ state
  function freshState() {
    return {
      plugs: {
        a: { at: null, snap: null, x: rest.plug_a.x_mm, z: rest.plug_a.z_mm, moved: false },
        b: { at: null, snap: null, x: rest.plug_b.x_mm, z: rest.plug_b.z_mm, moved: false },
      },
      probe: { x: probeHome.x_mm, z: probeHome.z_mm, on: 'bench', yaw: 0 },
      bottle: { x: bottleHome.x_mm, z: bottleHome.z_mm, on: 'bench', yaw: 0 },
      patches: [],
      errors: 0,
      t0: null,
      done: false,
    };
  }

  let probeTarget = 'eq__probe_straight';
  function setProbeTarget(id) {
    probeTarget = id || 'eq__probe_straight';
    TARGET_ID.probe = probeTarget === 'eq__probe_angle' ? 'angle__connector' : 'probe__connector';
    updateCable(80);
  }
  const probeY = () => (S.probe.on === 'plate' ? plateTop : benchY);
  const connectorEnd = () => {
    if (probeTarget === 'eq__probe_angle') return equipment.connectorWorld?.('eq__probe_angle') || null;
    return { pos: new THREE.Vector3(S.probe.x * MM, probeY() + connectorTop, S.probe.z * MM), dir: UP.clone() };
  };
  const targetEnd = (t) => (t === 'probe' ? connectorEnd() : instrument.portEnd(t === 'port_tr' ? 'tr' : 'r'));
  const otherOf = (k) => S.plugs[k === 'a' ? 'b' : 'a'];
  const restDir = (k) => new THREE.Vector3(rest[`plug_${k}`].dir[0], 0, rest[`plug_${k}`].dir[1]).normalize();

  function endOf(k) {
    const p = S.plugs[k];
    const t = p.at || p.snap;
    const snapped = t && targetEnd(t);
    if (snapped) return snapped;
    const pos = new THREE.Vector3(p.x * MM, benchY + plugR * MM, p.z * MM);
    const o = otherOf(k);
    let dir = restDir(k);
    if (p.moved && (o.at || o.snap)) {
      const oe = targetEnd(o.at || o.snap);
      const to = oe?.pos.clone().sub(pos).setY(0);
      if (to && to.lengthSq() > 1e-6) dir = to.normalize();
    }
    return { pos, dir };
  }

  function updateCable(segments = 160) {
    const a = endOf('a');
    const b = endOf('b');
    const loop = !(S.plugs.a.at || S.plugs.a.snap) && !(S.plugs.b.at || S.plugs.b.snap);
    const mid = a.pos.clone().add(b.pos).multiplyScalar(0.5);
    const floorY = (onPlateAt(mid.x / MM, mid.z / MM, 10) ? plateTop : benchY) + cableR + 0.004;
    const chord = b.pos.clone().sub(a.pos).setY(0);
    const bulge = new THREE.Vector3(-chord.z, 0, chord.x);
    if (bulge.lengthSq() < 1e-9) bulge.set(0, 0, 1);
    if (bulge.z < 0) bulge.negate();
    bulge.normalize().multiplyScalar(0.35);
    instrument.setCableEnds(a, b, { floorY, segments, loop, bulge, stretch: A.cable_stretch });
  }

  function putProbe() {
    probeRoot.rotation.y = probeYaw0 + S.probe.yaw;
    placeProbe(new THREE.Vector3(S.probe.x * MM, probeY(), S.probe.z * MM));
  }

  function putBottle() {
    const b = equipment.bottle;
    b.position.set(S.bottle.x * MM, S.bottle.on === 'plate' ? plateTop : benchY, S.bottle.z * MM);
    b.rotation.y = S.bottle.yaw;
    b.updateMatrixWorld(true);
  }

  function patchMesh(c) {
    const m = new THREE.Mesh(patchGeo, patchMat);
    m.position.set(c.x * MM, plateTop + 0.0003, c.z * MM);
    m.renderOrder = 1;
    m.raycast = () => {};
    patchGroup.add(m);
  }
  function syncPatches() {
    patchGroup.clear();
    for (const c of S.patches) patchMesh(c);
  }

  function addPatch(x, z) {
    const c = clampPlate(x, z, PATCH_R);
    S.patches.push(c);
    patchMesh(c);
    return c;
  }

  // Re-apply the stored state to the scene (entering the bench keeps the student's assembly).
  function apply() {
    putProbe();
    putBottle();
    syncPatches();
    updateCable(160);
  }

  function reset() {
    drag = null;
    equipment.resetLayout();
    Object.assign(S, freshState());
    patchGroup.clear();
    apply();
  }

  // Replaces the assembly state (exam / training swap, session restore); `place` re-applies it to the bench scene.
  function load(state, { place = false } = {}) {
    drag = null;
    Object.assign(S, freshState(), state ? JSON.parse(JSON.stringify(state)) : {});
    if (place) apply();
  }

  function setVisible(on) {
    patchGroup.visible = on;
    if (!on) {
      drag = null;
      probeRoot.rotation.y = probeYaw0;
    }
  }

  // ------------------------------------------------------------ rigid poses (mm, rad)
  const isRigid = (h) => h && (h.kind === 'item' || h.kind === 'probe' || h.kind === 'bottle');
  const idOf = (h) => (h.kind === 'item' ? h.id : h.kind === 'probe' ? 'eq__probe_straight' : 'eq__couplant');
  function poseOf(h) {
    if (h.kind === 'item') return equipment.poseOf(h.id);
    const it = h.kind === 'probe' ? S.probe : S.bottle;
    return { x: it.x, z: it.z, yaw: it.yaw };
  }

  // Item pose; the plate carries the probe and couplant patches lying on it.
  function setItemPose(id, p) {
    if (id === 'eq__plate') {
      const P0 = plate();
      const carry = (o) => { const q = localIn(P0, o.x, o.z); Object.assign(o, worldIn(p, q.x, q.y)); };
      if (S.probe.on === 'plate') {
        carry(S.probe);
        S.probe.yaw += p.yaw - P0.yaw;
      }
      S.patches.forEach(carry);
      equipment.setPose(id, p);
      syncPatches();
      putProbe();
    } else {
      equipment.setPose(id, p);
    }
    updateCable(80);
  }

  // Pivot = hull centre; local offset of the pivot from the node origin stays fixed while turning.
  function pivotOf(h) {
    const p = poseOf(h);
    if (h.kind !== 'item') return { x: p.x, z: p.z, o: { x: 0, z: 0 } };
    const c = equipment.hullCircle(h.id);
    if (!c) return { x: p.x, z: p.z, o: { x: 0, z: 0 } };
    return { x: c.x, z: c.z, o: rot(c.x - p.x, c.z - p.z, -p.yaw) };
  }
  function poseAt(h, pv, yaw) {
    const w = rot(pv.o.x, pv.o.z, yaw);
    return { x: pv.x - w.x, z: pv.z - w.z, yaw };
  }
  function setRigid(h, pv, yaw) {
    const p = poseAt(h, pv, yaw);
    if (h.kind === 'item') return setItemPose(h.id, p);
    const it = h.kind === 'probe' ? S.probe : S.bottle;
    Object.assign(it, { x: p.x, z: p.z, yaw });
    if (h.kind === 'probe') {
      putProbe();
      if (S.plugs.a.at === 'probe' || S.plugs.b.at === 'probe') updateCable(80);
    } else putBottle();
  }

  // ------------------------------------------------------------ status
  function status() {
    const P = S.plugs;
    const has = (t) => P.a.at === t || P.b.at === t;
    const probeLinked = has('probe');
    const portOk = has('port_tr');
    const portWrong = has('port_r');
    const onPlate = S.probe.on === 'plate';
    const coupled = onPlate && S.patches.some((p) => Math.hypot(p.x - S.probe.x, p.z - S.probe.z) <= PATCH_R + rProbe * A.couplant_patch.face_overlap);
    const connected = probeLinked && portOk;
    const steps = { cable_probe: probeLinked, cable_port: portOk, couplant: S.patches.length > 0, probe_plate: onPlate };
    return {
      steps, probeLinked, portOk, portWrong, onPlate, coupled, connected,
      done: A.done_when.every((k) => steps[k]) && connected && coupled,
      errors: S.errors,
    };
  }

  // Bench A-scan state: pulse = the transmitter socket drives the cable; echoes need probe + couplant on the plate.
  function scanState(base) {
    const s = status();
    const q = local(S.probe.x, S.probe.z);
    return {
      st: {
        ...base,
        specimen_id: plateId,
        thickness_mm: sp.T,
        probe_x_mm: Math.round(q.x * 10) / 10,
        probe_y_mm: Math.round(q.y * 10) / 10,
        coupling: s.connected && s.coupled ? 'good' : 'air_gap',
      },
      pulse: s.portOk,
    };
  }

  // ------------------------------------------------------------ drag
  function handleOf(obj) {
    if (obj?.name === 'system__probe_cable') return { kind: 'cable' };
    for (let o = obj; o; o = o.parent) {
      if (o === instrument.plugA) return { kind: 'plug', end: 'a' };
      if (o === instrument.plugB) return { kind: 'plug', end: 'b' };
      if (o === equipment.bottle) return { kind: 'bottle' };
      if (o === probeRoot) return { kind: 'probe' };
      if (nodeId.has(o)) return { kind: 'item', id: nodeId.get(o) };
      const disp = equipment.displayIdOf?.(o);
      if (disp) return { kind: 'item', id: disp };
    }
    return null;
  }

  const snapshot = () => JSON.parse(JSON.stringify({ probe: S.probe, bottle: S.bottle, plugs: S.plugs, patches: S.patches }));
  const freePlugs = () => ['a', 'b'].filter((k) => !S.plugs[k].at);

  // grab = world point under the pointer on the item: that point stays under the pointer (also when the item steps onto the plate).
  function begin(handle, ray, grab) {
    if (S.t0 == null) S.t0 = performance.now();
    drag = { ...handle, start: snapshot(), dx: 0, dz: 0, lift: 0 };
    if (handle.kind === 'item') {
      const p = poseOf(handle);
      const pv = pivotOf(handle);
      const hit = grab ? grab.clone() : planeHit(ray, benchY);
      drag.pose0 = p;
      drag.pv = pv;
      if (hit) {
        drag.lift = Math.max(0, hit.y - benchY);
        drag.dx = pv.x - hit.x / MM;
        drag.dz = pv.z - hit.z / MM;
      }
    } else if (handle.kind === 'cable') {
      const hit = grab ? grab.clone() : planeHit(ray, benchY);
      drag.lift = hit ? Math.max(0, hit.y - benchY) : 0;
      const h0 = planeHit(ray, benchY + drag.lift);
      drag.h0 = h0 ? { x: h0.x / MM, z: h0.z / MM } : null;
      drag.p0 = Object.fromEntries(freePlugs().map((k) => [k, { x: S.plugs[k].x, z: S.plugs[k].z }]));
      for (const k of freePlugs()) { S.plugs[k].moved = true; S.plugs[k].snap = null; }
    } else if (handle.kind === 'plug') {
      const p = S.plugs[handle.end];
      p.at = null;
      p.snap = null;
      p.moved = true;
    } else {
      const it = handle.kind === 'probe' ? S.probe : S.bottle;
      const base = it.on === 'plate' ? plateTop : benchY;
      const hit = grab ? grab.clone() : planeHit(ray, base);
      if (hit) {
        drag.lift = Math.max(0, hit.y - base);
        drag.dx = it.x - hit.x / MM;
        drag.dz = it.z - hit.z / MM;
      }
    }
    move(ray);
  }

  function nearestTarget(ray, k) {
    const taken = otherOf(k).at;
    let best = null;
    for (const t of ['probe', 'port_tr', 'port_r']) {
      if (t === taken) continue;
      const e = targetEnd(t);
      if (!e?.pos) continue;
      const hit = planeHit(ray, e.pos.y);
      if (!hit) continue;
      const d = Math.hypot(hit.x - e.pos.x, hit.z - e.pos.z) / MM;
      const r = t === 'probe' && probeTarget === 'eq__probe_angle' ? Math.max(SNAP, 42) : SNAP;
      if (d <= r && (!best || d < best.d)) best = { t, d };
    }
    return best?.t || null;
  }

  function moveFree(it, ray, r) {
    const hp = planeHit(ray, plateTop + drag.lift);
    if (hp) {
      const x = hp.x / MM + drag.dx, z = hp.z / MM + drag.dz;
      if (onPlateAt(x, z)) {
        const c = clampPlate(x, z, r);
        Object.assign(it, c, { on: 'plate' });
        return;
      }
    }
    const hb = planeHit(ray, benchY + drag.lift);
    if (!hb) return;
    Object.assign(it, clampBench(hb.x / MM + drag.dx, hb.z / MM + drag.dz), { on: 'bench' });
  }

  function move(ray) {
    if (!drag) return;
    if (drag.kind === 'item') {
      const hb = planeHit(ray, benchY + drag.lift);
      if (!hb) return;
      const c = clampBench(hb.x / MM + drag.dx, hb.z / MM + drag.dz);
      drag.pv = { ...drag.pv, x: c.x, z: c.z };
      setRigid(drag, drag.pv, poseOf(drag).yaw);
    } else if (drag.kind === 'cable') {
      const hb = planeHit(ray, benchY + drag.lift);
      if (!hb || !drag.h0) return;
      const dx = hb.x / MM - drag.h0.x, dz = hb.z / MM - drag.h0.z;
      for (const [k, p0] of Object.entries(drag.p0)) Object.assign(S.plugs[k], clampBench(p0.x + dx, p0.z + dz));
      updateCable(80);
    } else if (drag.kind === 'plug') {
      const p = S.plugs[drag.end];
      p.snap = nearestTarget(ray, drag.end);
      if (!p.snap) {
        const h = planeHit(ray, benchY + plugR * MM);
        if (h) Object.assign(p, clampBench(h.x / MM, h.z / MM));
      }
      updateCable(80);
    } else if (drag.kind === 'probe') {
      moveFree(S.probe, ray, rProbe);
      putProbe();
      if (S.plugs.a.at === 'probe' || S.plugs.b.at === 'probe') updateCable(80);
    } else {
      moveFree(S.bottle, ray, rBottle);
      putBottle();
    }
  }

  // Mouse wheel while dragging: turn the held item about its centre.
  function rotate(dyaw) {
    if (!isRigid(drag)) return false;
    const pv = drag.kind === 'item' ? drag.pv : pivotOf(drag);
    setRigid(drag, pv, poseOf(drag).yaw + dyaw);
    return true;
  }

  function overlapping(h) {
    if (h.kind === 'item') {
      const ignore = ['eq__cable'];
      if (h.id === 'eq__plate' && S.probe.on === 'plate') ignore.push('eq__probe_straight');
      return equipment.gapOf(h.id, ignore) < 0;
    }
    const it = h.kind === 'probe' ? S.probe : S.bottle;
    if (it.on === 'plate') return false;
    return equipment.clearance(it.x, it.z, h.kind === 'probe' ? rProbe : rBottle, [idOf(h), 'eq__cable']) < 0;
  }

  // Rigid item dropped / turned onto another item: back to where it was picked up.
  function settleItem(d) {
    if (d.kind !== 'item' || !overlapping(d)) return false;
    setItemPose(d.id, d.pose0);
    return true;
  }

  // Returns [{ name, payload }] for the caller to emit (assembly:attach / error / done).
  function end() {
    if (!drag) return [];
    const d = drag;
    drag = null;
    const out = [];
    if (d.kind === 'item') {
      settleItem(d);
    } else if (d.kind === 'plug') {
      const p = S.plugs[d.end];
      if (p.snap) {
        p.at = p.snap;
        p.snap = null;
        out.push(...attachPlug(p.at));
      }
    } else if (d.kind === 'bottle') {
      if (S.bottle.on === 'plate') {
        addPatch(S.bottle.x, S.bottle.z);
        Object.assign(S.bottle, d.start.bottle, { yaw: S.bottle.yaw });
        out.push({ name: 'assembly:attach', payload: { item: 'eq__couplant', target: plateId, ok: true } });
      } else if (equipment.clearance(S.bottle.x, S.bottle.z, rBottle, ['eq__couplant', 'eq__cable']) < 0) {
        Object.assign(S.bottle, d.start.bottle);
      }
      putBottle();
    } else if (d.kind === 'probe') {
      if (S.probe.on === 'plate') {
        out.push(...dropProbeOnPlate());
      } else if (equipment.clearance(S.probe.x, S.probe.z, rProbe, ['eq__probe_straight', 'eq__cable']) < 0) {
        Object.assign(S.probe, d.start.probe);
        putProbe();
      }
    }
    updateCable(160);
    out.push(...checkDone());
    return out;
  }

  function attachPlug(t) {
    const ok = t !== 'port_r';
    const out = [{ name: 'assembly:attach', payload: { item: 'eq__cable', target: TARGET_ID[t], ok } }];
    if (!ok) {
      S.errors += 1;
      out.push({ name: 'assembly:error', payload: { step: 'cable_port', reason: 'port_wrong' } });
    }
    return out;
  }

  function dropProbeOnPlate() {
    const s = status();
    const out = [{ name: 'assembly:attach', payload: { item: 'eq__probe_straight', target: plateId, ok: s.coupled } }];
    if (!s.coupled) {
      S.errors += 1;
      out.push({ name: 'assembly:error', payload: { step: 'couplant', reason: 'no_couplant' } });
    }
    return out;
  }

  // A probe dragged into an existing patch is already done before end() runs, so only S.done guards repeats.
  function checkDone() {
    const s = status();
    if (!s.done || S.done) return [];
    S.done = true;
    const t = S.t0 == null ? 0 : (performance.now() - S.t0) / 1000;
    return [{ name: 'assembly:done', payload: { duration_s: Math.round(t * 10) / 10, errors: S.errors } }];
  }

  // Classroom auto-assembly, one step per call (0..3): probe plug, transmitter socket, couplant, probe on the plate.
  function autoStep(i) {
    if (S.t0 == null) S.t0 = performance.now();
    const was = status();
    const out = [];
    const P = S.plugs;
    const s0 = worldIn(plate(), A.auto_spot_mm.x, A.auto_spot_mm.y);
    const spot = clampPlate(s0.x, s0.z, PATCH_R);
    if (i === 0 && !was.probeLinked) {
      if (P.b.at) { P.b.at = null; P.b.moved = false; Object.assign(P.b, { x: rest.plug_b.x_mm, z: rest.plug_b.z_mm }); }
      P.b.at = 'probe';
      out.push(...attachPlug('probe'));
    } else if (i === 1 && !was.portOk) {
      const k = P.a.at === 'probe' ? 'b' : 'a';
      S.plugs[k].at = 'port_tr';
      out.push(...attachPlug('port_tr'));
    } else if (i === 2 && !S.patches.some((p) => Math.hypot(p.x - spot.x, p.z - spot.z) <= PATCH_R / 2)) {
      addPatch(spot.x, spot.z);
      out.push({ name: 'assembly:attach', payload: { item: 'eq__couplant', target: plateId, ok: true } });
    } else if (i === 3 && !(was.onPlate && was.coupled)) {
      Object.assign(S.probe, spot, { on: 'plate' });
      putProbe();
      out.push(...dropProbeOnPlate());
    }
    updateCable(160);
    out.push(...checkDone());
    return out;
  }

  Object.assign(S, freshState());
  patchGroup.visible = false;

  return {
    apply, reset, load, status, scanState, handleOf, begin, move, end, autoStep, updateCable, setVisible,
    rotate, poseOf, local, setProbeTarget,
    get dragging() { return !!drag; },
    get state() { return JSON.parse(JSON.stringify(S)); },
    plateTop, rProbe,
  };
}
