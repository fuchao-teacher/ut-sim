// Practice-mode specimens (contracts/specimens_manifest.json): GLB placement on the bench,
// specimen-local <-> world conversion, probe limits and the section view through the probe centre.
import * as THREE from 'three';

const MM = 0.001;

export function createPractice({ scene, gltf, man, benchY }) {
  const lim = man.probe_limits;
  const rHousing = lim.housing_outer_diameter_mm / 2;
  const secPlane = new THREE.Plane(new THREE.Vector3(0, 0, -1), 10);
  const specimens = {};

  const dimsOf = (sp) => {
    const d = sp.dims;
    return {
      L: d.length.value,
      W: (d.width || d.width_b).value,
      T: (d.thickness || d.thickness_T).value,
    };
  };

  const sectionMat = new THREE.MeshBasicMaterial({
    color: 0x5d6671, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false,
  });
  const sectionLineMat = new THREE.LineBasicMaterial({ color: 0x2f3640 });

  // Runtime specimen (specimens_manifest.runtime_specimens): block + feature nodes in the GLB frame (x, -depth, -y).
  function buildRuntime(id, sp) {
    const { L, W, T } = dimsOf(sp);
    const g = new THREE.Group();
    g.name = id;
    let mat = null;
    (specimens[sp.material_from]?.obj || gltf.scene.getObjectByName(sp.material_from))?.traverse((m) => { if (!mat && m.isMesh && !m.parent?.userData?.feature_id && !m.userData.feature_id) mat = m.material; });
    const block = new THREE.Mesh(new THREE.BoxGeometry(L * MM, T * MM, W * MM), mat ? mat.clone() : new THREE.MeshStandardMaterial({ color: 0x8a939c, roughness: 0.5, metalness: 0.6 }));
    block.position.y = (-T / 2) * MM;
    g.add(block);
    const P3 = (x, depth, y) => new THREE.Vector3(x * MM, -depth * MM, -y * MM);
    for (const d of sp.defects || []) {
      const fm = new THREE.MeshStandardMaterial({ color: d.color, roughness: 0.6, metalness: 0 });
      const node = new THREE.Group();
      node.userData = { feature_id: d.id, type: d.type };
      const add = (geo, pos, m = fm) => { const mesh = new THREE.Mesh(geo, m); mesh.position.copy(pos); node.add(mesh); return mesh; };
      const [cx, cy] = d.centre_mm;
      if (d.type === 'lamination') {
        add(new THREE.BoxGeometry(d.size_mm.x * MM, d.visual_thickness_mm * MM, d.size_mm.y * MM), P3(cx, d.depth_mm, cy));
      } else if (d.type === 'inclusion') {
        add(new THREE.SphereGeometry(MM / 2, 20, 12), P3(cx, d.depth_mm, cy)).scale.set(d.size_mm.x, d.size_mm.z, d.size_mm.y);
      } else if (d.type === 'pore') {
        add(new THREE.SphereGeometry((d.size_mm.d / 2) * MM, 16, 10), P3(cx, d.depth_mm, cy));
      } else if (d.type === 'cluster') {
        for (const m of d.members) add(new THREE.SphereGeometry((d.member_size_mm / 2) * MM, 16, 10), P3(m.x_mm, m.depth_mm, m.y_mm));
      } else if (d.type === 'segregation') {
        const [x0, x1] = d.region_mm.x;
        const [y0, y1] = d.region_mm.y;
        const [z0, z1] = d.depth_range_mm;
        fm.transparent = true;
        fm.opacity = 0.35;
        fm.depthWrite = false;
        add(new THREE.BoxGeometry((x1 - x0) * MM, (z1 - z0) * MM, (y1 - y0) * MM), P3((x0 + x1) / 2, (z0 + z1) / 2, (y0 + y1) / 2));
      }
      g.add(node);
    }
    // Flat-bottom holes (thickness.js blocks): reflecting face at S, open at the bottom face; material of the GLB holes.
    let holeMat = null;
    specimens[sp.material_from]?.obj.traverse((m) => { if (!holeMat && m.isMesh && (m.userData.feature_id || m.parent?.userData?.feature_id)) holeMat = m.material; });
    for (const h of sp.holes || []) {
      const node = new THREE.Group();
      node.userData = { feature_id: h.id, type: h.type };
      const len = T - h.S_mm;
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry((h.diameter_mm / 2) * MM, (h.diameter_mm / 2) * MM, len * MM, 32),
        holeMat ? holeMat.clone() : new THREE.MeshStandardMaterial({ color: 0x2b6cb0, roughness: 0.6, metalness: 0 }));
      mesh.position.copy(P3(h.x_mm, h.S_mm + len / 2, h.y_mm));
      node.add(mesh);
      g.add(node);
    }
    return g;
  }

  for (const [id, sp] of Object.entries(man.specimens)) {
    const obj = gltf.scene.getObjectByName(id) || (man.runtime_specimens?.[id] ? buildRuntime(id, sp) : null);
    if (obj) register(id, sp, obj, man.system_placement[id]);
  }

  function register(id, sp, obj, place) {
    const { L, W, T } = dimsOf(sp);
    obj.removeFromParent();
    obj.position.set(place.x_mm * MM, benchY + T * MM, place.z_mm * MM);
    obj.visible = false;
    scene.add(obj);
    const features = [];
    const meshes = [];
    for (const child of obj.children) {
      if (child.userData.feature_id) {
        child.visible = false;
        child.traverse((m) => {
          if (!m.isMesh) return;
          m.material = m.material.clone();
          m.material.clippingPlanes = [secPlane];
          m.userData.baseColor = m.material.color.clone();
          m.castShadow = false;
        });
        features.push(child);
      }
    }
    // Test-surface projection of each feature (x-ray view), lifted 0.3 mm: hole disc + cross,
    // lamination outline, inclusion circle + cross, crack line (specimens_manifest geometry).
    const pins = new THREE.Group();
    pins.visible = false;
    const V = (x, y) => new THREE.Vector3(x * MM, 0, -y * MM);
    const lines = (segs, color) => new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(segs.flat()), new THREE.LineBasicMaterial({ color }));
    const ring = (r, n = 40, ox = 0, oy = 0) => Array.from({ length: n }, (_, i) => [V(ox + r * Math.cos((2 * Math.PI * i) / n), oy + r * Math.sin((2 * Math.PI * i) / n)), V(ox + r * Math.cos((2 * Math.PI * (i + 1)) / n), oy + r * Math.sin((2 * Math.PI * (i + 1)) / n))]);
    const box = (hx, hy, ox = 0, oy = 0) => [[V(ox - hx, oy - hy), V(ox + hx, oy - hy)], [V(ox + hx, oy - hy), V(ox + hx, oy + hy)], [V(ox + hx, oy + hy), V(ox - hx, oy + hy)], [V(ox - hx, oy + hy), V(ox - hx, oy - hy)]];
    const cross = (a) => [[V(-a, 0), V(a, 0)], [V(0, -a), V(0, a)]];
    const addPin = (fid, x, y, color, objs) => {
      const pin = new THREE.Group();
      pin.add(...objs);
      pin.position.set(x * MM, 0.3 * MM, -y * MM);
      pin.userData.feature_id = fid;
      pin.userData.baseColor = new THREE.Color(color);
      pin.traverse((o) => { o.raycast = () => {}; o.renderOrder = 7; });
      pins.add(pin);
    };
    const colorOf = (fid) => {
      const f = features.find((q) => q.userData.feature_id === fid);
      let c = 0x2b6cb0;
      f?.traverse((m) => { if (m.isMesh) c = m.material.color.getHex(); });
      return c;
    };
    for (const h of sp.holes || []) {
      const r = h.diameter_mm / 2;
      const col = colorOf(h.id);
      const disc = new THREE.Mesh(new THREE.CircleGeometry(r * MM, 32), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.9, depthWrite: false }));
      disc.rotation.x = -Math.PI / 2;
      addPin(h.id, h.x_mm, h.y_mm, col, [disc, lines(cross(r * 3), col)]);
    }
    for (const d of sp.defects || []) {
      const col = colorOf(d.id);
      const [cx, cy] = d.centre_mm;
      let segs;
      if (d.type === 'lamination') {
        const hx = d.size_mm.x / 2;
        const hy = d.size_mm.y / 2;
        segs = [[V(-hx, -hy), V(hx, -hy)], [V(hx, -hy), V(hx, hy)], [V(hx, hy), V(-hx, hy)], [V(-hx, hy), V(-hx, -hy)], ...cross(4)];
      } else if (d.type === 'inclusion') {
        const r = Math.max(d.size_mm.x, d.size_mm.y) / 2;
        segs = [...ring(r), ...cross(r * 2)];
      } else if (d.type === 'pore') {
        segs = [...ring(2), ...cross(4)];
      } else if (d.type === 'cluster') {
        segs = d.members.flatMap((m) => ring(d.member_size_mm, 24, m.x_mm - cx, m.y_mm - cy));
      } else if (d.type === 'segregation') {
        const [x0, x1] = d.region_mm.x;
        const [y0, y1] = d.region_mm.y;
        segs = box((x1 - x0) / 2, (y1 - y0) / 2, (x0 + x1) / 2 - cx, (y0 + y1) / 2 - cy);
      } else {
        const h = d.size_mm.length_x / 2;
        segs = [[V(-h, 0), V(h, 0)], [V(-h, -2), V(-h, 2)], [V(h, -2), V(h, 2)]];
      }
      addPin(d.id, cx, cy, col, [lines(segs, col)]);
    }
    obj.add(pins);
    obj.traverse((m) => {
      if (!m.isMesh || features.some((f) => f === m || f.children.includes(m))) return;
      m.material = Array.isArray(m.material) ? m.material.map((x) => x.clone()) : m.material.clone();
      for (const mat of [].concat(m.material)) {
        mat.clippingPlanes = [secPlane];
        mat.side = THREE.FrontSide;
        mat.polygonOffset = true;
        mat.polygonOffsetFactor = -1;
        mat.polygonOffsetUnits = -1;
      }
      m.castShadow = true;
      m.receiveShadow = true;
      m.userData.base = [].concat(m.material).map((x) => ({ transparent: x.transparent, opacity: x.opacity, depthWrite: x.depthWrite }));
      meshes.push(m);
    });
    const cap = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), sectionMat);
    cap.visible = false;
    cap.renderOrder = 6;
    cap.raycast = () => {};
    const edge = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-0.5, -0.5, 0), new THREE.Vector3(0.5, -0.5, 0), new THREE.Vector3(0.5, 0.5, 0), new THREE.Vector3(-0.5, 0.5, 0)]),
      sectionLineMat,
    );
    edge.raycast = () => {};
    cap.add(edge);
    scene.add(cap);
    specimens[id] = { id, obj, meshes, features, pins, cap, L, W, T, place, sp };
  }

  let current = null;
  let section = 'off';
  let xray = { id: null, opacity: 1 };

  // Test-surface marks: scan trail, flagged positions, boundary points and sizing rectangles.
  const MAX_TRAIL = 20000;
  const dot = document.createElement('canvas');
  dot.width = dot.height = 32;
  const dctx = dot.getContext('2d');
  dctx.fillStyle = '#fff';
  dctx.beginPath();
  dctx.arc(16, 16, 14, 0, Math.PI * 2);
  dctx.fill();
  const dotTex = new THREE.CanvasTexture(dot);
  const trailGeo = new THREE.BufferGeometry();
  trailGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX_TRAIL * 3), 3));
  trailGeo.setDrawRange(0, 0);
  const trail = new THREE.Line(trailGeo, new THREE.LineBasicMaterial({ color: 0x2563eb, transparent: true, opacity: 0.55 }));
  const pts = (color, size) => new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial({ color, size, sizeAttenuation: false, map: dotTex, alphaTest: 0.5, transparent: true }));
  const flags = pts(0xdc2626, 6);
  const bpts = pts(0xf97316, 11);
  const rects = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xea580c }));
  const marks = new THREE.Group();
  for (const o of [trail, flags, bpts, rects]) {
    o.raycast = () => {};
    o.frustumCulled = false;
    o.renderOrder = 7;
    marks.add(o);
  }
  marks.visible = false;
  scene.add(marks);

  // Scan path coverage overlay per plate: one texel per coverage cell, canvas row 0 = specimen +y.
  const covers = {};
  const plans = {};
  const syncCovers = () => {
    for (const [id, c] of Object.entries(covers)) c.group.visible = c.on && id === current;
    for (const [id, p] of Object.entries(plans)) p.group.visible = id === current;
  };

  // plan: {edge: [x, y] half sizes of the inner edge-zone loop or null, lines: [[x0, y0, x1, y1], ...]} in specimen mm (null removes);
  // style: {edge_line, plan_line}.
  function setPlan(id, plan, style) {
    const key = plan ? JSON.stringify(plan) : '';
    const old = plans[id];
    if ((old?.key ?? '') === key) return;
    if (old) {
      scene.remove(old.group);
      old.group.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); });
      delete plans[id];
    }
    if (!plan || !specimens[id]) { syncCovers(); return; }
    const group = new THREE.Group();
    const add = (o) => { o.raycast = () => {}; o.renderOrder = 7; o.frustumCulled = false; group.add(o); };
    if (plan.edge) {
      const [ex, ey] = plan.edge;
      add(new THREE.LineLoop(
        new THREE.BufferGeometry().setFromPoints([[-ex, -ey], [ex, -ey], [ex, ey], [-ex, ey]].map(([x, y]) => toWorld(id, x, y, -0.25))),
        new THREE.LineBasicMaterial({ color: style.edge_line }),
      ));
    }
    if (plan.lines.length) {
      const pts = plan.lines.flatMap(([x0, y0, x1, y1]) => [toWorld(id, x0, y0, -0.25), toWorld(id, x1, y1, -0.25)]);
      add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: style.plan_line, transparent: true, opacity: 0.8 })));
    }
    scene.add(group);
    plans[id] = { group, key };
    syncCovers();
  }

  // Zone hint: translucent disc of radius r at (x, y) in specimen mm on the top surface (null removes).
  let hint = null;
  function setHint(id, zone, color = 0xf97316) {
    if (hint) {
      scene.remove(hint);
      hint.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); });
      hint = null;
    }
    if (!zone || !specimens[id]) return;
    const n = 72;
    const ring = Array.from({ length: n }, (_, k) => {
      const a = (k / n) * Math.PI * 2;
      return toWorld(id, zone.x + zone.r * Math.cos(a), zone.y + zone.r * Math.sin(a), -0.3);
    });
    const c = toWorld(id, zone.x, zone.y, -0.3);
    const pos = [];
    ring.forEach((p, k) => { const q = ring[(k + 1) % n]; pos.push(c.x, c.y, c.z, p.x, p.y, p.z, q.x, q.y, q.z); });
    const disc = new THREE.BufferGeometry();
    disc.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    hint = new THREE.Group();
    const add = (o) => { o.raycast = () => {}; o.renderOrder = 8; o.frustumCulled = false; hint.add(o); };
    add(new THREE.Mesh(disc, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide })));
    add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(ring), new THREE.LineBasicMaterial({ color })));
    scene.add(hint);
  }

  function buildCover(id, cov, style) {
    const s = specimens[id];
    const canvas = document.createElement('canvas');
    canvas.width = cov.nx;
    canvas.height = cov.ny;
    const tex = new THREE.CanvasTexture(canvas);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(s.L * MM, s.W * MM), new THREE.MeshBasicMaterial({
      map: tex, transparent: true, opacity: style.alpha, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4,
    }));
    plane.rotation.x = -Math.PI / 2;
    plane.position.copy(toWorld(id, 0, 0, -0.15));
    const ex = s.L / 2 - cov.edge;
    const ey = s.W / 2 - cov.edge;
    const line = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints([[-ex, -ey], [ex, -ey], [ex, ey], [-ex, ey]].map(([x, y]) => toWorld(id, x, y, -0.2))),
      new THREE.LineBasicMaterial({ color: style.edge_line }),
    );
    const group = new THREE.Group();
    for (const o of [plane, line]) {
      o.raycast = () => {};
      o.renderOrder = 6;
      group.add(o);
    }
    scene.add(group);
    const ctx = canvas.getContext('2d');
    const rgb = (h) => new THREE.Color(h).toArray().map((v) => Math.round(v * 255));
    return { group, tex, ctx, img: ctx.createImageData(cov.nx, cov.ny), nx: cov.nx, ny: cov.ny, cols: [null, rgb(style.near), rgb(style.swept)], on: false };
  }

  // cov: createCoverage() grid of plate id (null hides); style: waveform_rules.practice.scan_path_coverage.overlay.
  function setCoverage(id, cov, style) {
    if (!specimens[id]) return;
    let c = covers[id];
    if (!cov) {
      if (c) c.on = false;
      syncCovers();
      return;
    }
    if (!c || c.nx !== cov.nx || c.ny !== cov.ny) {
      if (c) scene.remove(c.group);
      c = covers[id] = buildCover(id, cov, style);
    }
    const d = c.img.data;
    for (let j = 0; j < c.ny; j++) {
      for (let i = 0; i < c.nx; i++) {
        const col = c.cols[cov.state(j * c.nx + i)];
        const o = ((c.ny - 1 - j) * c.nx + i) * 4;
        if (col) { d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2]; d[o + 3] = 255; } else d[o + 3] = 0;
      }
    }
    c.ctx.putImageData(c.img, 0, 0);
    c.tex.needsUpdate = true;
    c.on = true;
    syncCovers();
  }

  function show(id) {
    current = specimens[id] ? id : null;
    for (const s of Object.values(specimens)) s.obj.visible = s.id === current;
    marks.visible = !!current && marks.userData.id === current;
    syncCovers();
    applySection();
  }

  function setBlockSides(side) {
    for (const s of Object.values(specimens)) {
      for (const m of s.meshes) {
        for (const mat of [].concat(m.material)) mat.side = side;
      }
    }
  }

  // Equipment bench: several specimens visible at once (marks / section off).
  function showMany(ids) {
    const set = new Set(ids || []);
    current = null;
    section = 'off';
    setBlockSides(THREE.FrontSide);
    for (const s of Object.values(specimens)) {
      s.obj.visible = set.has(s.id);
      for (const f of s.features) f.visible = false;
      s.pins.visible = false;
      s.cap.visible = false;
    }
    marks.visible = false;
    syncCovers();
    applySection();
  }

  const topY = (id) => benchY + specimens[id].T * MM;

  function toWorld(id, x, y, depth = 0) {
    const s = specimens[id];
    return new THREE.Vector3((s.place.x_mm + x) * MM, topY(id) - depth * MM, (s.place.z_mm - y) * MM);
  }

  function fromWorld(id, p) {
    const s = specimens[id];
    return { x: p.x / MM - s.place.x_mm, y: s.place.z_mm - p.z / MM };
  }

  function limits(id) {
    const s = specimens[id];
    return { x: s.L / 2 - rHousing, y: s.W / 2 - rHousing };
  }

  function clamp(id, x, y) {
    const l = limits(id);
    return { x: Math.min(l.x, Math.max(-l.x, x)), y: Math.min(l.y, Math.max(-l.y, y)) };
  }

  // Footprint test in world xz (metres) with a margin in mm.
  function inside(id, p, margin = 0) {
    const s = specimens[id];
    const q = fromWorld(id, p);
    return Math.abs(q.x) <= s.L / 2 + margin && Math.abs(q.y) <= s.W / 2 + margin;
  }

  let probe = { x: 0, y: 0 };

  // along: plane through the probe centre parallel to the rolling direction (keeps specimen Y >= probe Y);
  // across: plane through the probe centre normal to X (keeps specimen X <= probe X).
  function applySection() {
    for (const s of Object.values(specimens)) {
      const on = section !== 'off' && s.id === current;
      for (const f of s.features) f.visible = on || s.id === xray.id;
      s.cap.visible = on;
    }
    if (!current || section === 'off') {
      secPlane.normal.set(0, 0, -1);
      secPlane.constant = 10;
      setBlockSides(THREE.FrontSide);
      return;
    }
    setBlockSides(THREE.DoubleSide);
    const s = specimens[current];
    const c = toWorld(current, probe.x, probe.y, s.T / 2);
    if (section === 'along') {
      secPlane.normal.set(0, 0, -1);
      secPlane.constant = c.z;
      s.cap.position.set(s.place.x_mm * MM, c.y, c.z + 2e-5);
      s.cap.rotation.set(0, 0, 0);
      s.cap.scale.set(s.L * MM, s.T * MM, 1);
    } else {
      secPlane.normal.set(-1, 0, 0);
      secPlane.constant = c.x;
      s.cap.position.set(c.x - 2e-5, c.y, s.place.z_mm * MM);
      s.cap.rotation.set(0, Math.PI / 2, 0);
      s.cap.scale.set(s.W * MM, s.T * MM, 1);
    }
  }

  function setSection(mode, p = probe) {
    section = mode;
    probe = { ...p };
    applySection();
  }

  // X-ray view of specimen id (null: off): block semi-transparent, feature nodes and surface markers shown.
  function setXray(id, opacity) {
    xray = { id: specimens[id] ? id : null, opacity };
    for (const s of Object.values(specimens)) {
      const on = s.id === xray.id;
      for (const m of s.meshes) {
        [].concat(m.material).forEach((mat, i) => {
          const b = m.userData.base[i];
          mat.transparent = on || b.transparent;
          mat.opacity = on ? opacity : b.opacity;
          mat.depthWrite = on ? false : b.depthWrite;
          mat.needsUpdate = true;
        });
        m.castShadow = !on;
      }
      s.pins.visible = on;
    }
    applySection();
  }

  // Feature colours on specimen id: { feature_id: '#rrggbb' }, others back to the model colour.
  function setFeatureColors(id, colors) {
    const s = specimens[id];
    if (!s) return;
    for (const f of s.features) {
      const c = colors[f.userData.feature_id];
      f.traverse((m) => { if (m.isMesh) m.material.color.copy(c ? new THREE.Color(c) : m.userData.baseColor); });
    }
    for (const pin of s.pins.children) {
      const c = colors[pin.userData.feature_id] ? new THREE.Color(colors[pin.userData.feature_id]) : pin.userData.baseColor;
      pin.traverse((o) => { if (o.material) o.material.color.copy(c); });
    }
  }

  function setProbe(p) {
    probe = { ...p };
    if (section !== 'off') applySection();
  }

  // Runtime specimen (re)built from data after load; place = system placement {x_mm, z_mm}.
  function setRuntime(id, sp, place) {
    const old = specimens[id];
    if (old) {
      for (const o of [old.obj, old.cap]) {
        scene.remove(o);
        o.traverse((m) => {
          m.geometry?.dispose();
          for (const mat of [].concat(m.material || [])) if (mat !== sectionMat && mat !== sectionLineMat) mat.dispose();
        });
      }
    }
    register(id, sp, buildRuntime(id, sp), place);
    const s = specimens[id];
    s.obj.visible = current === id;
    if (xray.id === id) setXray(id, xray.opacity);
    else applySection();
  }

  // Marks on specimen id: trail [[x, y]], flags [[x, y]], points [[x, y]], rects [{x0, x1, y0, y1}] (specimen-local mm).
  function setMarks(id, { trail: tr = [], flags: fl = [], points: bp = [], rects: rc = [] } = {}) {
    const LIFT = -0.3;
    const put = (arr, i, x, y) => {
      const w = toWorld(id, x, y, LIFT);
      arr[i * 3] = w.x;
      arr[i * 3 + 1] = w.y;
      arr[i * 3 + 2] = w.z;
    };
    const pos = trailGeo.attributes.position;
    const nT = Math.min(tr.length, MAX_TRAIL);
    for (let i = 0; i < nT; i++) put(pos.array, i, tr[i][0], tr[i][1]);
    pos.needsUpdate = true;
    trailGeo.setDrawRange(0, nT);
    const fill = (obj, list) => {
      const a = new Float32Array(list.length * 3);
      list.forEach((p, i) => put(a, i, p[0], p[1]));
      obj.geometry.setAttribute('position', new THREE.BufferAttribute(a, 3));
      obj.geometry.computeBoundingSphere();
    };
    fill(flags, fl);
    fill(bpts, bp);
    const seg = [];
    for (const r of rc) {
      const c = [[r.x0, r.y0], [r.x1, r.y0], [r.x1, r.y1], [r.x0, r.y1]];
      for (let i = 0; i < 4; i++) seg.push(c[i], c[(i + 1) % 4]);
    }
    fill(rects, seg);
    marks.userData.id = id;
    marks.visible = current === id;
  }

  return {
    specimens, show, showMany, topY, toWorld, fromWorld, limits, clamp, inside, setSection, setProbe, setMarks, setCoverage, setPlan, setHint, planVisible: (id) => !!plans[id]?.group.visible, setXray, setFeatureColors, setRuntime,
    coverVisible: (id) => !!covers[id]?.group.visible,
    get current() { return current; },
    get section() { return section; },
    get xray() { return xray.id; },
    plane: secPlane,
  };
}
