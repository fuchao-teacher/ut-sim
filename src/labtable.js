// Teaching lab table: desktop, apron, four legs. Top face sits at topY (metres).
import * as THREE from 'three';

const MM = 0.001;

/**
 * @param {{
 *   topY?: number,
 *   cx?: number, cz?: number,
 *   widthMm?: number, depthMm?: number, heightMm?: number, topThickMm?: number,
 *   topColor?: number|string, frameColor?: number|string, legColor?: number|string,
 * }} opts
 */
export function createLabTable({
  topY = 0,
  cx = -0.04,
  cz = -0.04,
  widthMm = 1100,
  depthMm = 720,
  heightMm = 780,
  topThickMm = 28,
  topColor = 0xc9ccd1,
  frameColor = 0x5a616c,
  legColor = 0x3a404a,
} = {}) {
  const group = new THREE.Group();
  group.name = 'system__lab_table';

  const W = widthMm * MM;
  const D = depthMm * MM;
  const H = heightMm * MM;
  const T = topThickMm * MM;
  const apronH = 48 * MM;
  const apronT = 16 * MM;
  const legW = 38 * MM;
  const inset = 42 * MM;

  const topMat = new THREE.MeshStandardMaterial({
    color: topColor, roughness: 0.88, metalness: 0.04, envMapIntensity: 0.55,
  });
  const frameMat = new THREE.MeshStandardMaterial({
    color: frameColor, roughness: 0.55, metalness: 0.35, envMapIntensity: 0.7,
  });
  const legMat = new THREE.MeshStandardMaterial({
    color: legColor, roughness: 0.45, metalness: 0.55, envMapIntensity: 0.8,
  });

  const top = new THREE.Mesh(new THREE.BoxGeometry(W, T, D), topMat);
  top.name = 'system__bench';
  top.position.set(cx, topY - T / 2, cz);
  top.castShadow = true;
  top.receiveShadow = true;
  group.add(top);

  // Edge band under the top (lab apron).
  const apronY = topY - T - apronH / 2;
  const apronFront = new THREE.Mesh(new THREE.BoxGeometry(W - 8 * MM, apronH, apronT), frameMat);
  apronFront.position.set(cx, apronY, cz + D / 2 - apronT / 2);
  const apronBack = apronFront.clone();
  apronBack.position.z = cz - D / 2 + apronT / 2;
  const apronSideGeo = new THREE.BoxGeometry(apronT, apronH, D - 2 * apronT);
  const apronLeft = new THREE.Mesh(apronSideGeo, frameMat);
  apronLeft.position.set(cx - W / 2 + apronT / 2, apronY, cz);
  const apronRight = apronLeft.clone();
  apronRight.position.x = cx + W / 2 - apronT / 2;
  for (const m of [apronFront, apronBack, apronLeft, apronRight]) {
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
  }

  const legLen = H - T;
  const legGeo = new THREE.BoxGeometry(legW, legLen, legW);
  const xs = [cx - W / 2 + inset, cx + W / 2 - inset];
  const zs = [cz - D / 2 + inset, cz + D / 2 - inset];
  for (const x of xs) {
    for (const z of zs) {
      const leg = new THREE.Mesh(legGeo, legMat);
      leg.position.set(x, topY - T - legLen / 2, z);
      leg.castShadow = true;
      leg.receiveShadow = true;
      group.add(leg);
    }
  }

  return { group, top, topY, widthMm, depthMm, heightMm };
}
