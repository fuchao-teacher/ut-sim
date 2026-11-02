import * as THREE from 'three';
import copy from '../../knowledge/lab-room.json';

const FONT = '"Microsoft YaHei","PingFang SC","Noto Sans SC",sans-serif';

function canvasTex(w, h, draw) {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  draw(cv.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function stdMat(color, extra = {}) {
  return new THREE.MeshStandardMaterial({
    color, roughness: 0.62, metalness: 0.04, ...extra,
  });
}

function box(w, h, d, mat) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function makeWallText() {
  const tex = canvasTex(2048, 360, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = '#1a365d';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `600 78px ${FONT}`;
    g.fillText(copy.title, w / 2, h * 0.36);
    g.font = `500 44px ${FONT}`;
    g.fillStyle = '#234e70';
    g.fillText(copy.org, w / 2, h * 0.74);
  });
  tex.premultiplyAlpha = false;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(5.8, 1.02),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false }),
  );
  mesh.raycast = () => {};
  return mesh;
}

function makePoster(title, lines) {
  const tex = canvasTex(768, 1100, (g, w, h) => {
    g.fillStyle = '#f7f4ec';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = '#8a93a0';
    g.lineWidth = 10;
    g.strokeRect(18, 18, w - 36, h - 36);
    g.fillStyle = '#1a365d';
    g.font = `700 54px ${FONT}`;
    g.textAlign = 'center';
    g.fillText(title, w / 2, 110);
    g.fillStyle = '#1b2330';
    g.font = `500 36px ${FONT}`;
    g.textAlign = 'left';
    lines.forEach((line, i) => {
      const y = 210 + i * 150;
      g.fillText(`${i + 1}.`, 70, y);
      const words = line;
      g.fillText(words, 130, y);
    });
  });
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(0.92, 1.32),
    new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }),
  );
  mesh.castShadow = true;
  return mesh;
}

function drawIdleScreen(g, cw, ch) {
  const grd = g.createLinearGradient(0, 0, cw, ch);
  grd.addColorStop(0, '#3a4554');
  grd.addColorStop(1, '#2c3440');
  g.fillStyle = grd;
  g.fillRect(0, 0, cw, ch);
  g.strokeStyle = 'rgba(210,220,230,0.12)';
  g.lineWidth = 2;
  for (let i = 1; i < 6; i++) {
    const y = (ch / 6) * i;
    g.beginPath();
    g.moveTo(40, y);
    g.lineTo(cw - 40, y);
    g.stroke();
  }
}

function paintGuideFill(g) {
  g.fillStyle = '#e8c09a';
  g.strokeStyle = '#8a5a3c';
  g.lineJoin = 'round';
  g.lineCap = 'round';
  g.fill();
  g.stroke();
}

function makeFingerGuide() {
  return canvasTex(640, 560, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.save();
    g.translate(w * 0.5, 58);
    g.rotate(-0.1);

    g.strokeStyle = '#1a365d';
    g.lineWidth = 2.2;
    g.beginPath();
    g.arc(0, 10, 16, 0, Math.PI * 2);
    g.stroke();
    g.setLineDash([6, 5]);
    g.lineWidth = 1.8;
    g.beginPath();
    g.arc(0, 10, 30, 0, Math.PI * 2);
    g.stroke();
    g.setLineDash([]);

    g.lineWidth = 3.2;
    g.beginPath();
    g.moveTo(-16, 42);
    g.quadraticCurveTo(-18, 18, -8, 6);
    g.quadraticCurveTo(0, -4, 8, 6);
    g.quadraticCurveTo(18, 18, 16, 42);
    g.lineTo(18, 126);
    g.quadraticCurveTo(0, 136, -18, 126);
    g.closePath();
    paintGuideFill(g);

    const knuckle = (x, y, rot, len, thick) => {
      g.save();
      g.translate(x, y);
      g.rotate(rot);
      g.lineWidth = 3.2;
      g.beginPath();
      g.moveTo(-thick, 6);
      g.quadraticCurveTo(-thick - 1, len * 0.4, -thick + 2, len);
      g.quadraticCurveTo(0, len + 8, thick - 2, len);
      g.quadraticCurveTo(thick + 1, len * 0.4, thick, 6);
      g.closePath();
      paintGuideFill(g);
      g.restore();
    };
    knuckle(26, 122, 0.2, 48, 13);
    knuckle(48, 128, 0.34, 42, 12);
    knuckle(68, 136, 0.48, 34, 11);

    g.lineWidth = 3.2;
    g.beginPath();
    g.moveTo(-22, 118);
    g.quadraticCurveTo(-46, 148, -36, 210);
    g.quadraticCurveTo(-6, 252, 58, 244);
    g.quadraticCurveTo(108, 232, 90, 168);
    g.quadraticCurveTo(80, 128, 66, 120);
    g.quadraticCurveTo(16, 146, -22, 118);
    g.closePath();
    paintGuideFill(g);

    g.save();
    g.translate(-26, 162);
    g.rotate(-0.78);
    g.lineWidth = 3.2;
    g.beginPath();
    g.moveTo(-12, 4);
    g.quadraticCurveTo(-15, 36, -6, 64);
    g.quadraticCurveTo(8, 74, 16, 62);
    g.quadraticCurveTo(20, 32, 13, 6);
    g.closePath();
    paintGuideFill(g);
    g.restore();

    g.lineWidth = 3.2;
    g.beginPath();
    g.moveTo(-16, 226);
    g.quadraticCurveTo(-18, 262, -6, 286);
    g.lineTo(72, 286);
    g.quadraticCurveTo(88, 262, 80, 226);
    g.closePath();
    paintGuideFill(g);
    g.beginPath();
    g.moveTo(-2, 244);
    g.lineTo(68, 244);
    g.moveTo(0, 260);
    g.lineTo(66, 260);
    g.strokeStyle = '#8a5a3c';
    g.lineWidth = 2;
    g.stroke();

    g.strokeStyle = 'rgba(138,90,60,0.35)';
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(-5, 52);
    g.quadraticCurveTo(0, 86, -3, 118);
    g.moveTo(32, 142);
    g.quadraticCurveTo(36, 164, 34, 184);
    g.stroke();
    g.restore();
  });
}

function makeCalloutRing() {
  return canvasTex(256, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    const c = w / 2;
    g.strokeStyle = '#1a365d';
    g.lineWidth = 5;
    g.beginPath();
    g.arc(c, c, 38, 0, Math.PI * 2);
    g.stroke();
    g.setLineDash([8, 7]);
    g.lineWidth = 3;
    g.beginPath();
    g.arc(c, c, 78, 0, Math.PI * 2);
    g.stroke();
    g.setLineDash([]);
    g.beginPath();
    g.arc(c, c, 7, 0, Math.PI * 2);
    g.fillStyle = '#1a365d';
    g.fill();
  });
}

function makeScreen(w, h, tw = 1024, th = 512) {
  const cv = document.createElement('canvas');
  cv.width = tw;
  cv.height = th;
  const ctx = cv.getContext('2d');
  drawIdleScreen(ctx, tw, th);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshStandardMaterial({
      map: tex, emissive: 0x6a7a8c, emissiveMap: tex, emissiveIntensity: 0.22,
      roughness: 0.35, metalness: 0.05, toneMapped: false,
    }),
  );
  mesh.raycast = () => {};
  return { mesh, cv, ctx, tex, tw, th };
}

function makePlate(text) {
  const tex = canvasTex(768, 168, (g, w, h) => {
    g.fillStyle = '#f4efe4';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = '#1a365d';
    g.lineWidth = 10;
    g.strokeRect(8, 8, w - 16, h - 16);
    g.fillStyle = '#1a365d';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `700 ${text.length > 8 ? 40 : 52}px ${FONT}`;
    g.fillText(text, w / 2, h / 2 + 2);
  });
  return new THREE.Mesh(
    new THREE.PlaneGeometry(0.38, 0.082),
    new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }),
  );
}

function makeToolbox() {
  const g = new THREE.Group();
  const body = box(0.42, 0.14, 0.28, stdMat(0x1a1c1f, { roughness: 0.38, metalness: 0.22 }));
  body.position.y = 0.07;
  const lid = box(0.424, 0.03, 0.284, stdMat(0x2b3038, { roughness: 0.4, metalness: 0.2 }));
  lid.position.y = 0.155;
  const stripe = box(0.43, 0.012, 0.02, stdMat(0xc45c26, { roughness: 0.45, metalness: 0.15 }));
  stripe.position.set(0, 0.155, 0.14);
  const latch = box(0.036, 0.028, 0.028, stdMat(0xd4b45a, { metalness: 0.75, roughness: 0.25 }));
  latch.position.set(-0.1, 0.1, 0.148);
  const latch2 = latch.clone();
  latch2.position.x = 0.1;
  const handle = new THREE.Mesh(
    new THREE.TorusGeometry(0.055, 0.008, 8, 18, Math.PI),
    stdMat(0xcfd6de, { metalness: 0.65, roughness: 0.28 }),
  );
  handle.rotation.x = Math.PI / 2;
  handle.position.set(0, 0.175, 0);
  handle.castShadow = true;
  g.add(body, lid, stripe, latch, latch2, handle);
  return g;
}

function makeChair() {
  const g = new THREE.Group();
  const fabric = stdMat(0x4a5563, { roughness: 0.78 });
  const chrome = stdMat(0xc5ccd4, { metalness: 0.7, roughness: 0.22 });
  const seat = new THREE.Mesh(new THREE.CylinderGeometry(0.185, 0.2, 0.026, 28), fabric);
  seat.position.y = 0.46;
  seat.castShadow = true;
  seat.receiveShadow = true;
  const col = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.02, 0.34, 12), chrome);
  col.position.y = 0.28;
  col.castShadow = true;
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.048, 0.022, 16), chrome);
  hub.position.y = 0.04;
  hub.receiveShadow = true;
  g.add(seat, col, hub);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const arm = box(0.2, 0.014, 0.024, chrome);
    arm.position.set(Math.cos(a) * 0.1, 0.04, Math.sin(a) * 0.1);
    arm.rotation.y = -a;
    g.add(arm);
  }
  const postL = box(0.01, 0.2, 0.01, chrome);
  postL.position.set(-0.065, 0.57, -0.168);
  const postR = postL.clone();
  postR.position.x = 0.065;
  const rest = box(0.3, 0.24, 0.02, fabric);
  rest.position.set(0, 0.71, -0.182);
  rest.rotation.x = -0.14;
  rest.castShadow = true;
  const lumbar = box(0.22, 0.035, 0.024, fabric);
  lumbar.position.set(0, 0.575, -0.17);
  g.add(postL, postR, rest, lumbar);
  return g;
}

function makeTable() {
  const g = new THREE.Group();
  const white = stdMat(0xe8edf3, { roughness: 0.55 });
  const top = box(1.52, 0.036, 0.76, stdMat(0xdce3ea, { roughness: 0.48, metalness: 0.04 }));
  top.position.y = 0.8;
  const edge = box(1.54, 0.018, 0.78, stdMat(0x8b949e, { roughness: 0.42, metalness: 0.08 }));
  edge.position.y = 0.78;
  const body = box(1.46, 0.76, 0.72, white);
  body.position.y = 0.4;
  const split = box(0.02, 0.7, 0.72, stdMat(0xd5dbe3));
  split.position.y = 0.4;
  const kick = box(1.46, 0.06, 0.7, stdMat(0xd7dde6));
  kick.position.y = 0.03;
  g.add(top, edge, body, split, kick);
  return g;
}

function makeDeskNo(n) {
  const tex = canvasTex(256, 256, (g, w, h) => {
    g.beginPath();
    g.arc(w / 2, h / 2, w / 2 - 10, 0, Math.PI * 2);
    g.fillStyle = '#dc2626';
    g.fill();
    g.lineWidth = 16;
    g.strokeStyle = '#fff7f7';
    g.stroke();
    g.fillStyle = '#ffffff';
    g.font = `800 148px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.translate(w / 2, h / 2);
    g.rotate(Math.PI);
    g.fillText(String(n), 0, 8);
  });
  const mesh = new THREE.Mesh(
    new THREE.CircleGeometry(0.058, 36),
    new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, side: THREE.DoubleSide }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.raycast = () => {};
  return mesh;
}

function makeStation(index, spec) {
  const g = new THREE.Group();
  g.name = `lab_station_${index + 1}`;
  const table = makeTable();
  const boxCase = makeToolbox();
  boxCase.position.set(0.18, 0.82, 0.02);
  boxCase.rotation.y = -0.18;
  const plate = makePlate(spec?.kit_label || copy.locked);
  plate.position.set(0.18, 1.01, 0.08);
  plate.rotation.y = -0.18;
  const deskNo = makeDeskNo(index + 1);
  deskNo.position.set(0.64, 0.822, 0.28);
  const chair = makeChair();
  chair.position.set(0, 0, -0.72);
  g.add(table, boxCase, plate, deskNo, chair);
  if (!spec?.open) {
    table.traverse((o) => {
      if (o.isMesh && o.material?.color) o.material = o.material.clone();
    });
  }
  g.traverse((o) => {
    if (o.isMesh) o.userData.station = index;
  });
  return g;
}

export function createLabRoom(scene, hooks = {}) {
  const root = new THREE.Group();
  root.name = 'lab_room';
  root.visible = false;
  scene.add(root);

  const W = 9.2;
  const D = 8.4;
  const H = 3.25;
  const wallMat = stdMat(0xf3f5f8, { roughness: 0.86 });
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(W, D),
    stdMat(0x3a6ea8, { roughness: 0.48, metalness: 0.06 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(W, D), stdMat(0xe9edf2, { roughness: 0.9 }));
  ceil.rotation.x = Math.PI / 2;
  ceil.position.y = H;

  const back = box(W, H, 0.12, wallMat);
  back.position.set(0, H / 2, D / 2);
  const front = box(W, H, 0.12, wallMat);
  front.position.set(0, H / 2, -D / 2);
  const left = box(0.12, H, D, wallMat);
  left.position.set(-W / 2, H / 2, 0);
  const right = box(0.12, H, D, wallMat);
  right.position.set(W / 2, H / 2, 0);

  const win = new THREE.Mesh(
    new THREE.PlaneGeometry(1.8, 1.7),
    new THREE.MeshStandardMaterial({
      color: 0x9ec5e0, roughness: 0.08, metalness: 0.05,
      transparent: true, opacity: 0.45, emissive: 0x8bb4d4, emissiveIntensity: 0.12,
    }),
  );
  win.position.set(-W / 2 + 0.07, 1.55, -1.1);
  win.rotation.y = Math.PI / 2;
  const frame = box(0.06, 1.82, 1.92, stdMat(0xd8dee6));
  frame.position.set(-W / 2 + 0.04, 1.55, -1.1);

  const door = box(1.05, 2.15, 0.05, stdMat(0x6d5340, { roughness: 0.55 }));
  door.position.set(2.85, 1.08, -D / 2 + 0.09);
  const handle = box(0.03, 0.12, 0.04, stdMat(0xc9a227, { metalness: 0.65, roughness: 0.3 }));
  handle.position.set(2.4, 1.05, -D / 2 + 0.13);

  const title = makeWallText();
  title.position.set(0, 2.78, D / 2 - 0.08);
  title.rotation.y = Math.PI;

  const screenY = 1.58;
  const screenZ = D / 2 - 0.12;
  const midScr = makeScreen(2.48, 1.18, 1920, 900);
  const sideLScr = makeScreen(1.22, 1.18, 1280, 720);
  const sideRScr = makeScreen(1.22, 1.18, 1280, 720);
  const mid = midScr.mesh;
  const sideL = sideLScr.mesh;
  const sideR = sideRScr.mesh;
  mid.position.set(0, screenY, screenZ);
  mid.rotation.y = Math.PI;
  sideL.position.set(-1.94, screenY, screenZ);
  sideL.rotation.y = Math.PI;
  sideR.position.set(1.94, screenY, screenZ);
  sideR.rotation.y = Math.PI;
  const frameMat = stdMat(0x3a424c, { roughness: 0.42 });
  const bezelM = box(2.58, 1.28, 0.05, frameMat);
  bezelM.position.set(0, screenY, screenZ + 0.03);
  const bezelL = box(1.32, 1.28, 0.05, frameMat);
  bezelL.position.set(-1.94, screenY, screenZ + 0.03);
  const bezelR = box(1.32, 1.28, 0.05, frameMat);
  bezelR.position.set(1.94, screenY, screenZ + 0.03);

  const switchGroup = new THREE.Group();
  switchGroup.name = 'lab_intro_switch';
  const plate = box(0.28, 0.09, 0.04, stdMat(0x2a3038, { roughness: 0.4 }));
  const rocker = box(0.05, 0.04, 0.03, stdMat(0xdce3ea, { roughness: 0.32, metalness: 0.15 }));
  rocker.position.set(-0.05, 0.01, 0.03);
  const led = new THREE.Mesh(
    new THREE.CylinderGeometry(0.01, 0.01, 0.012, 12),
    new THREE.MeshStandardMaterial({ color: 0x6b7280, emissive: 0x111111, emissiveIntensity: 0.4, roughness: 0.35 }),
  );
  led.rotation.x = Math.PI / 2;
  led.position.set(0.06, 0.01, 0.028);
  const swLabel = canvasTex(384, 96, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = '#e8eef6';
    g.font = `700 42px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(copy.intro_switch, w / 2, h / 2);
  });
  const swCap = new THREE.Mesh(
    new THREE.PlaneGeometry(0.2, 0.05),
    new THREE.MeshBasicMaterial({ map: swLabel, transparent: true, depthWrite: false, toneMapped: false }),
  );
  swCap.position.set(0.02, -0.03, 0.028);
  switchGroup.add(plate, rocker, led, swCap);
  switchGroup.position.set(1.08, screenY - 0.58, screenZ - 0.02);
  switchGroup.rotation.y = Math.PI;
  switchGroup.traverse((o) => {
    if (o.isMesh) o.userData.introSwitch = true;
  });

  const finger = new THREE.Sprite(new THREE.SpriteMaterial({
    map: makeFingerGuide(),
    transparent: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  }));
  finger.center.set(0.5, 0.93);
  finger.scale.set(0.42, 0.3675, 1);
  finger.renderOrder = 24;
  finger.frustumCulled = false;
  finger.raycast = () => {};
  const fingerBase = new THREE.Vector3(1.08, screenY - 0.58, screenZ - 0.32);
  finger.position.copy(fingerBase);

  const callout = new THREE.Sprite(new THREE.SpriteMaterial({
    map: makeCalloutRing(),
    transparent: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  }));
  callout.center.set(0.5, 0.5);
  callout.scale.set(0.22, 0.22, 1);
  callout.renderOrder = 23;
  callout.frustumCulled = false;
  callout.raycast = () => {};
  const calloutBase = new THREE.Vector3(1.08, screenY - 0.58, screenZ - 0.18);
  callout.position.copy(calloutBase);

  const safety = makePoster(copy.safety_title, copy.safety);
  safety.position.set(-W / 2 + 0.08, 1.55, 1.85);
  safety.rotation.y = Math.PI / 2;
  const flow = makePoster(copy.flow_title, copy.flow);
  flow.position.set(W / 2 - 0.08, 1.55, 1.85);
  flow.rotation.y = -Math.PI / 2;

  const xs = [-2.45, 0, 2.45];
  const zs = [1.35, -1.05];
  const stationSpecs = copy.stations || [];
  const stations = [];
  let n = 0;
  for (const z of zs) {
    for (const x of xs) {
      const st = makeStation(n, stationSpecs[n]);
      st.position.set(x, 0, z);
      stations.push(st);
      root.add(st);
      n += 1;
    }
  }

  const lights = new THREE.Group();
  lights.name = 'lab_lights';
  const hemi = new THREE.HemisphereLight(0xe8eef6, 0x3a4a3a, 0.7);
  const sun = new THREE.DirectionalLight(0xfff4e6, 1.05);
  sun.position.set(-2.2, 5.4, -1.8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 0.5, far: 16 });
  sun.shadow.bias = -0.0003;
  const fill = new THREE.DirectionalLight(0xdde7f4, 0.35);
  fill.position.set(3.2, 3.2, 2.4);
  lights.add(hemi, sun, sun.target, fill);
  for (const x of [-2.2, 0, 2.2]) {
    const panel = box(1.6, 0.04, 0.55, new THREE.MeshStandardMaterial({
      color: 0xf4f7fb, emissive: 0xf2f5fa, emissiveIntensity: 0.55, roughness: 0.4,
    }));
    panel.position.set(x, H - 0.04, 0.2);
    panel.raycast = () => {};
    lights.add(panel);
  }

  const fillFront = new THREE.DirectionalLight(0xf2f5fa, 0.42);
  fillFront.position.set(0.2, 2.6, 3.6);
  lights.add(fillFront);
  root.add(floor, ceil, back, front, left, right, win, frame, door, handle, title, bezelM, bezelL, bezelR, mid, sideL, sideR, switchGroup, finger, callout, safety, flow, lights);

  const shell = [back, front, left, right, ceil, door, handle, frame];
  for (const m of shell) {
    m.material = m.material.clone();
    m.userData.shellSolid = {
      transparent: !!m.material.transparent,
      opacity: m.material.opacity,
      depthWrite: m.material.depthWrite !== false,
      side: m.material.side,
    };
  }
  let ghost = false;
  const inset = 0.38;
  const hx = W / 2 - inset;
  const hz = D / 2 - inset;

  function applyGhost(on) {
    if (ghost === on) return;
    ghost = on;
    for (const m of shell) {
      const mat = m.material;
      const solid = m.userData.shellSolid;
      if (on) {
        mat.transparent = true;
        mat.opacity = 0.18;
        mat.depthWrite = false;
        mat.side = THREE.DoubleSide;
      } else {
        mat.transparent = solid.transparent;
        mat.opacity = solid.opacity;
        mat.depthWrite = solid.depthWrite;
        mat.side = solid.side;
      }
      mat.needsUpdate = true;
    }
  }

  const pickables = [];
  for (const st of stations) st.traverse((o) => { if (o.isMesh) pickables.push(o); });
  const switchPick = [];
  switchGroup.traverse((o) => { if (o.isMesh) switchPick.push(o); });

  const hint = document.createElement('div');
  hint.id = 'labRoomHint';
  hint.hidden = true;
  let introOpened = false;
  function renderHint() {
    if (!introOpened) {
      hint.classList.add('is-guide');
      hint.textContent = copy.intro_hint;
      return;
    }
    hint.classList.remove('is-guide');
    hint.textContent = introOn ? copy.intro_playing : (copy.hint || copy.sit_cap);
  }

  let introOn = false;
  let briefDone = false;
  let speakIndex = 0;
  let captionIndex = -1;
  let visIndex = 0;
  let voiceGen = 0;
  let capTimer = 0;
  const introLines = copy.intro || [];
  const screens = [midScr, sideLScr, sideRScr];

  let cachedVoice = null;
  function pickVoice() {
    const list = window.speechSynthesis?.getVoices?.() || [];
    cachedVoice = list.find((v) => /zh(-CN|_CN)?/i.test(v.lang) && /Huihui|Xiaoxiao|Xiaoyi|Yaoyao|Kangkang|Yunyang|Yunxia/i.test(v.name))
      || list.find((v) => /^zh/i.test(v.lang))
      || cachedVoice
      || null;
    return cachedVoice;
  }
  try {
    pickVoice();
    window.speechSynthesis?.addEventListener?.('voiceschanged', pickVoice);
  } catch { /* ignore */ }

  function stopVoice() {
    voiceGen += 1;
    window.clearTimeout(capTimer);
    try { window.speechSynthesis?.cancel(); } catch { /* ignore */ }
  }

  function wrapLine(ctx, text, maxW, font) {
    ctx.font = font;
    if (ctx.measureText(text).width <= maxW) return [text];
    const out = [];
    let cur = '';
    for (const ch of text) {
      const next = cur + ch;
      if (cur && ctx.measureText(next).width > maxW) {
        out.push(cur);
        cur = ch;
      } else cur = next;
    }
    if (cur) out.push(cur);
    return out;
  }

  function visualLines(ctx, tw) {
    const maxW = tw - 80;
    const rows = [];
    introLines.forEach((line, i) => {
      const title = i === 0;
      const hl = line === copy.intro_hl;
      const font = title || hl ? `700 72px ${FONT}` : `600 48px ${FONT}`;
      wrapLine(ctx, line, maxW, font).forEach((text) => {
        rows.push({ text, title, hl, speakI: i });
      });
    });
    return rows;
  }

  function startVoice() {
    const rec = window.speechSynthesis;
    const first = introLines.length > 1 ? 1 : 0;
    speakIndex = first;
    captionIndex = first;
    visIndex = first;
    paintIntro();
    if (!rec) return;
    window.clearTimeout(capTimer);
    voiceGen += 1;
    const gen = voiceGen;
    try { rec.resume(); } catch { /* ignore */ }
    const speakLine = () => {
      if (gen !== voiceGen || !introOn) return;
      if (speakIndex >= introLines.length) {
        window.setTimeout(() => {
          if (gen === voiceGen && introOn) setIntro(false);
        }, 900);
        return;
      }
      const i = speakIndex;
      captionIndex = i;
      const u = new SpeechSynthesisUtterance(introLines[i]);
      u.lang = 'zh-CN';
      u.rate = 1;
      const voice = pickVoice();
      if (voice && i !== first) u.voice = voice;
      let started = false;
      u.onstart = () => { started = true; };
      u.onend = () => {
        if (gen !== voiceGen) return;
        speakIndex += 1;
        window.setTimeout(speakLine, 40);
      };
      rec.speak(u);
      try { rec.resume(); } catch { /* ignore */ }
      window.clearTimeout(capTimer);
      capTimer = window.setTimeout(() => {
        if (gen !== voiceGen || started) return;
        try { rec.resume(); } catch { /* ignore */ }
        if (!rec.speaking && !rec.pending) rec.speak(u);
      }, 160);
    };
    if (rec.speaking || rec.pending) {
      try { rec.cancel(); } catch { /* ignore */ }
      try { rec.resume(); } catch { /* ignore */ }
      capTimer = window.setTimeout(speakLine, 0);
    } else {
      speakLine();
    }
  }

  function paintHlBand(ctx, text, x, y, maxW, size) {
    let s = size;
    while (s >= 28) {
      ctx.font = `700 ${s}px ${FONT}`;
      if (ctx.measureText(text).width <= maxW) break;
      s -= 2;
    }
    const twm = ctx.measureText(text).width;
    const padX = Math.round(s * 0.55);
    const padY = Math.round(s * 0.42);
    const bw = twm + padX * 2;
    const bh = s + padY * 2;
    const bx = x - bw / 2;
    const by = y - bh / 2;
    ctx.fillStyle = 'rgba(180, 110, 18, 0.55)';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(bx, by, bw, bh, Math.round(s * 0.28));
    else ctx.rect(bx, by, bw, bh);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 214, 102, 0.95)';
    ctx.lineWidth = 4;
    ctx.stroke();
  }

  function paintLine(ctx, text, x, y, maxW, weight, size, color) {
    let s = size;
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    while (s >= 28) {
      ctx.font = `${weight} ${s}px ${FONT}`;
      if (ctx.measureText(text).width <= maxW) break;
      s -= 2;
    }
    ctx.fillText(text, x, y);
  }

  function paintIntro() {
    const cap = captionIndex < 0 ? 0 : captionIndex;
    visIndex += (cap - visIndex) * 0.12;
    for (const sc of screens) {
      const { ctx, tw, th, tex, mesh } = sc;
      ctx.fillStyle = '#121820';
      ctx.fillRect(0, 0, tw, th);
      const rows = visualLines(ctx, tw);
      const maxW = tw - 80;
      const lineH = Math.round(th * 0.16);
      const curVis = rows.findIndex((row) => row.speakI === cap);
      const center = curVis < 0 ? visIndex : visIndex + (curVis - visIndex);
      rows.forEach((row, i) => {
        const y = th * 0.46 + (i - center) * lineH;
        if (y < -lineH || y > th + lineH) return;
        const current = captionIndex >= 0 && row.speakI === captionIndex;
        const title = row.title;
        const hl = row.hl;
        const size = title || hl ? Math.round(tw * 0.042) : Math.round(tw * 0.032);
        const color = hl ? (current ? '#fff4c4' : '#f5d76e') : (current || title ? '#f3f7fc' : '#9aabbc');
        if (hl) paintHlBand(ctx, row.text, tw / 2, y, maxW, Math.max(size, 56));
        paintLine(ctx, row.text, tw / 2, y, maxW, title || hl || current ? 700 : 600, Math.max(size, title || hl ? 56 : 40), color);
      });
      tex.needsUpdate = true;
      mesh.material.emissiveIntensity = 0.7;
    }
  }

  function paintIdle() {
    for (const sc of screens) {
      drawIdleScreen(sc.ctx, sc.tw, sc.th);
      sc.tex.needsUpdate = true;
      sc.mesh.material.emissiveIntensity = 0.22;
    }
  }

  function setIntro(on) {
    introOn = !!on;
    rocker.rotation.x = introOn ? -0.35 : 0.35;
    led.material.emissive.setHex(introOn ? 0x34d399 : 0x111111);
    led.material.color.setHex(introOn ? 0x34d399 : 0x6b7280);
    led.material.emissiveIntensity = introOn ? 1.2 : 0.4;
    if (introOn) {
      introOpened = true;
      const first = introLines.length > 1 ? 1 : 0;
      speakIndex = first;
      captionIndex = first;
      visIndex = first;
      paintIntro();
      startVoice();
    } else {
      stopVoice();
      paintIdle();
      if (introOpened && !briefDone) {
        briefDone = true;
        hooks.onBriefDone?.();
      }
    }
    renderHint();
  }

  function hitKind(obj) {
    if (!obj) return null;
    if (obj.userData.introSwitch) return { kind: 'intro' };
    if (obj.userData.station != null) return { kind: 'station', index: obj.userData.station };
    return null;
  }

  renderHint();
  setIntro(false);

  return {
    root,
    lights,
    pickables,
    switchPick,
    hint,
    copy,
    bounds: { W, D, H },
    stationName(i) {
      const st = stationSpecs[i];
      if (!st?.open) return copy.locked || '未开放';
      return st.title || `${copy.station} ${i + 1}`;
    },
    stationOpen(i) { return !!stationSpecs[i]?.open; },
    introName() { return introOn ? copy.intro_off : copy.intro_switch; },
    introOn() { return introOn; },
    canSit() { return introOpened || !!hooks.freeSit?.(); },
    nudgeGuide() {
      hint.classList.remove('is-pulse');
      void hint.offsetWidth;
      hint.classList.add('is-pulse');
    },
    hitKind,
    toggleIntro() { setIntro(!introOn); },
    stopIntro() { setIntro(false); },
    updateShell(cam) {
      if (!root.visible) return;
      const outside = Math.abs(cam.x) > hx || Math.abs(cam.z) > hz || cam.y > H - inset || cam.y < 0.12;
      applyGhost(outside);
    },
    tick(now) {
      if (!root.visible) return;
      if (introOn) paintIntro(now);
      const show = !introOn && !introOpened && !document.body.classList.contains('lic-open');
      finger.visible = show;
      callout.visible = show;
      if (!show) return;
      const t = now * 0.0032;
      const bob = Math.sin(t) * 0.018;
      finger.position.set(fingerBase.x, fingerBase.y + bob, fingerBase.z);
      callout.position.copy(calloutBase);
      const pulse = 0.5 + 0.5 * Math.sin(t * 2.1);
      const rs = 0.16 + pulse * 0.05;
      callout.scale.set(rs, rs, 1);
      callout.material.opacity = 0.35 + pulse * 0.5;
    },
    setActive(on) {
      root.visible = !!on;
      lights.visible = !!on;
      hint.hidden = !on;
      if (!on) {
        applyGhost(false);
        setIntro(false);
      }
    },
    mountHint(host) {
      if (hint.parentNode !== host) host.appendChild(hint);
    },
  };
}
