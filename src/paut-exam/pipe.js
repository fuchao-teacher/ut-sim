// Φ1219 × 18.4 mm girth-weld coupon: two 100 mm pipes, centre weld ring, buried defects.
import * as THREE from 'three';
import * as P from '@paut/physics.js';

export const PIPE = {
  odMm: 1219,
  wtMm: 18.4,
  segMm: 100,
  scale: 0.5,
};

const MM = 0.001;
const SEG = 96;
const ARC_VIS = (38 * Math.PI) / 180;

export function pipeDims() {
  const s = PIPE.scale;
  const roMm = PIPE.odMm / 2;
  const riMm = roMm - PIPE.wtMm;
  return {
    s,
    roMm,
    riMm,
    ro: roMm * s * MM,
    ri: riMm * s * MM,
    L: PIPE.segMm * s * MM,
    wt: PIPE.wtMm * s * MM,
    weldHalf: 11 * s * MM,
    capH: 2.6 * s * MM,
    rootH: 1.5 * s * MM,
  };
}

/** Encoder pos (mm) → visual angle around girth (rad, 0 at crown). */
export function posToTheta(pos) {
  const f = (pos - P.POS_MIN) / (P.POS_MAX - P.POS_MIN);
  return (f - 0.5) * 2 * ARC_VIS;
}

export function thetaToPos(theta) {
  const f = 0.5 + theta / (2 * ARC_VIS);
  return P.POS_MIN + Math.max(0, Math.min(1, f)) * (P.POS_MAX - P.POS_MIN);
}

export const DEFECTS = [
  {
    id: 'lof', name: '未熔合', kind: 'lof',
    pos0: P.DEF_P0, pos1: P.DEF_P1,
    depth0: P.DEF_D0, depth1: P.DEF_D1,
    color: 0xf87171,
  },
  {
    id: 'root', name: '根部裂纹', kind: 'root',
    pos0: 95, pos1: 108,
    depth0: 15.5, depth1: 18.2,
    color: 0xfbbf24,
  },
  {
    id: 'pore', name: '气孔群', kind: 'pore',
    pos0: 145, pos1: 158,
    depth0: 7, depth1: 11,
    color: 0xa78bfa,
  },
  {
    id: 'slag', name: '夹渣', kind: 'slag',
    pos0: 72, pos1: 86,
    depth0: 9, depth1: 13,
    color: 0x34d399,
  },
];

function steelMat(color, { metalness = 0.58, roughness = 0.36, side = THREE.FrontSide, opacity = 1 } = {}) {
  return new THREE.MeshStandardMaterial({
    color, metalness, roughness, envMapIntensity: 0.85, side,
    transparent: opacity < 1, opacity, depthWrite: opacity >= 1,
  });
}

function latheWall(ri, ro, y0, y1, mat) {
  const pts = [
    new THREE.Vector2(ri, y0),
    new THREE.Vector2(ro, y0),
    new THREE.Vector2(ro, y1),
    new THREE.Vector2(ri, y1),
  ];
  const mesh = new THREE.Mesh(new THREE.LatheGeometry(pts, SEG), mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function alongX(obj) {
  obj.rotation.z = -Math.PI / 2;
  return obj;
}

function vBlock(w, h, d, mat) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h * 0.55, d), mat);
  body.position.y = h * 0.55 / 2;
  body.castShadow = true;
  body.receiveShadow = true;
  g.add(body);
  const jaw = new THREE.Mesh(new THREE.BoxGeometry(w, h * 0.7, d * 0.22), mat);
  const z = d * 0.28;
  const left = jaw.clone();
  left.position.set(0, h * 0.42, -z);
  left.rotation.x = 0.72;
  const right = jaw.clone();
  right.position.set(0, h * 0.42, z);
  right.rotation.x = -0.72;
  for (const m of [left, right]) {
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
  }
  return g;
}

function placeOnWall(pipe, { ro, ri, s }, theta, depthMm, axialMm = 0) {
  const r = ri + (ro - ri) * (1 - depthMm / PIPE.wtMm);
  const y = pipe.position.y + r * Math.cos(theta);
  const z = r * Math.sin(theta);
  const x = axialMm * s * MM;
  return { x, y, z, r, theta };
}

function buildDefects(pipe, dims) {
  const g = new THREE.Group();
  g.name = 'weld-defects';
  for (const d of DEFECTS) {
    const midPos = (d.pos0 + d.pos1) / 2;
    const midDepth = (d.depth0 + d.depth1) / 2;
    const theta = posToTheta(midPos);
    const span = Math.max(0.012, Math.abs(posToTheta(d.pos1) - posToTheta(d.pos0)) * dims.ro);
    const thick = Math.max(0.0025, (d.depth1 - d.depth0) * dims.s * MM);
    const p = placeOnWall(pipe, dims, theta, midDepth, 0);
    let mesh;
    if (d.kind === 'pore') {
      mesh = new THREE.Group();
      mesh.name = `defect-${d.id}`;
      for (let i = 0; i < 5; i++) {
        const ball = new THREE.Mesh(
          new THREE.SphereGeometry(0.0018 + (i % 2) * 0.0006, 12, 10),
          steelMat(d.color, { metalness: 0.2, roughness: 0.35, opacity: 0.92 }),
        );
        const a = theta + (i - 2) * 0.012;
        const q = placeOnWall(pipe, dims, a, midDepth + (i - 2) * 0.4, (i - 2) * 1.2);
        ball.position.set(q.x - pipe.position.x, q.y - pipe.position.y, q.z);
        ball.userData.defect = d;
        mesh.add(ball);
      }
    } else {
      const geo = d.kind === 'root'
        ? new THREE.BoxGeometry(0.004, thick, span)
        : new THREE.CapsuleGeometry(thick * 0.45, span * 0.7, 4, 8);
      mesh = new THREE.Mesh(geo, steelMat(d.color, { metalness: 0.25, roughness: 0.4, opacity: 0.9 }));
      mesh.name = `defect-${d.id}`;
      mesh.position.set(p.x - pipe.position.x, p.y - pipe.position.y, p.z);
      mesh.lookAt(0, pipe.position.y, 0);
      mesh.rotateZ(Math.PI / 2);
    }
    mesh.userData.defect = d;
    mesh.castShadow = true;
    g.add(mesh);
  }
  pipe.add(g);
  return g;
}

export function createGirthWeldPipe() {
  const dims = pipeDims();
  const { ro, ri, L, weldHalf, capH, rootH } = dims;
  const group = new THREE.Group();
  group.name = 'paut-exam-pipe';

  const steel = steelMat(0x9aa4ae);
  const inner = steelMat(0x5c6570, { metalness: 0.4, roughness: 0.5, side: THREE.BackSide });
  const haz = steelMat(0x7d868f, { roughness: 0.48 });
  const weld = steelMat(0xd2b48a, { metalness: 0.5, roughness: 0.4 });

  const left0 = -(L + weldHalf);
  const left1 = -weldHalf;
  const right0 = weldHalf;
  const right1 = L + weldHalf;

  const left = alongX(latheWall(ri, ro, left0, left1, steel));
  const right = alongX(latheWall(ri, ro, right0, right1, steel));
  left.name = 'pipe-left';
  right.name = 'pipe-right';
  const boreL = alongX(latheWall(ri * 0.995, ri, left0, left1, inner));
  const boreR = alongX(latheWall(ri * 0.995, ri, right0, right1, inner));
  boreL.raycast = boreR.raycast = () => {};
  group.add(left, right, boreL, boreR);

  const hazW = 18 * PIPE.scale * MM;
  const hazL = alongX(latheWall(ro - 0.0004, ro + 0.00035, left1 - hazW, left1, haz));
  const hazR = alongX(latheWall(ro - 0.0004, ro + 0.00035, right0, right0 + hazW, haz));
  hazL.name = hazR.name = 'pipe-haz';
  group.add(hazL, hazR);

  const weldPts = [
    new THREE.Vector2(ri - rootH, 0),
    new THREE.Vector2(ri, -weldHalf * 0.55),
    new THREE.Vector2(ri + (ro - ri) * 0.35, -weldHalf * 0.85),
    new THREE.Vector2(ro, -weldHalf),
    new THREE.Vector2(ro + capH, -weldHalf * 0.55),
    new THREE.Vector2(ro + capH * 1.12, 0),
    new THREE.Vector2(ro + capH, weldHalf * 0.55),
    new THREE.Vector2(ro, weldHalf),
    new THREE.Vector2(ri + (ro - ri) * 0.35, weldHalf * 0.85),
    new THREE.Vector2(ri, weldHalf * 0.55),
  ];
  const bead = alongX(new THREE.Mesh(new THREE.LatheGeometry(weldPts, SEG), weld));
  bead.name = 'girth-weld';
  bead.castShadow = true;
  bead.receiveShadow = true;
  group.add(bead);

  const mark = alongX(new THREE.Mesh(
    new THREE.TorusGeometry(ro + capH * 0.35, 0.00045, 8, SEG),
    new THREE.MeshBasicMaterial({ color: 0x334155 }),
  ));
  mark.rotation.y = Math.PI / 2;
  mark.name = 'weld-centerline';
  mark.raycast = () => {};
  group.add(mark);

  const blockMat = steelMat(0x4b5563, { metalness: 0.35, roughness: 0.55 });
  const bw = L * 0.55;
  const bh = 0.055;
  const bd = ro * 0.85;
  const vL = vBlock(bw, bh, bd, blockMat);
  const vR = vBlock(bw, bh, bd, blockMat);
  vL.position.x = (left0 + left1) / 2;
  vR.position.x = (right0 + right1) / 2;
  vL.name = 'vblock-left';
  vR.name = 'vblock-right';
  group.add(vL, vR);

  group.userData.centerY = ro + 0.008;
  group.userData.dims = dims;
  group.position.y = group.userData.centerY;
  vL.position.y = vR.position.y = -group.userData.centerY;

  const defects = buildDefects(group, dims);
  group.userData.defects = defects;
  return group;
}

export function activeDefects(pos) {
  return DEFECTS.filter((d) => pos >= d.pos0 - 2 && pos <= d.pos1 + 2);
}
