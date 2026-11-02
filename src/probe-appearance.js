import * as THREE from 'three';

const installed = new WeakMap();
const MM = 0.001;

function material(spec, overrides = {}) {
  return new THREE.MeshStandardMaterial({ ...spec, ...overrides });
}

function annularBand(inner, outer, height, segments = 96) {
  const points = [
    new THREE.Vector2(inner, -height / 2),
    new THREE.Vector2(outer, -height / 2),
    new THREE.Vector2(outer, height / 2),
    new THREE.Vector2(inner, height / 2),
    new THREE.Vector2(inner, -height / 2),
  ];
  return new THREE.LatheGeometry(points, segments);
}

function joinedGeometry(geometries) {
  const positions = [], normals = [], uv = [], indices = [];
  let offset = 0;
  for (const g of geometries) {
    const pos = g.getAttribute('position');
    positions.push(...pos.array);
    normals.push(...g.getAttribute('normal').array);
    uv.push(...g.getAttribute('uv').array);
    if (g.index) for (const i of g.index.array) indices.push(offset + i);
    else for (let i = 0; i < pos.count; i++) indices.push(offset + i);
    offset += pos.count;
    g.dispose();
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  return geometry;
}

function gripBand(radius, width, depth, height, count) {
  const pieces = [];
  for (let i = 0; i < count; i++) {
    const angle = 2 * Math.PI * i / count;
    const geometry = new THREE.BoxGeometry(width, height, depth);
    const matrix = new THREE.Matrix4().makeRotationY(angle);
    matrix.setPosition(radius * Math.sin(angle), 0, radius * Math.cos(angle));
    pieces.push(geometry.applyMatrix4(matrix));
  }
  return joinedGeometry(pieces);
}

function topPlate(inner, outer, segments = 96) {
  const positions = [], normals = [], uv = [], indices = [];
  for (let i = 0; i <= segments; i++) {
    const angle = 2 * Math.PI * i / segments;
    for (const radius of [inner, outer]) {
      const x = radius * Math.cos(angle), z = radius * Math.sin(angle);
      positions.push(x, 0, z);
      normals.push(0, -1, 0);
      // +X cross +Z faces -Y; keep the atlas unmirrored on this top face.
      uv.push(0.5 + x / (2 * outer), 0.5 + z / (2 * outer));
    }
    if (i < segments) {
      const a = 2 * i;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  return geometry;
}

function sidePlate(radius, height, angle, arc, segments = 24) {
  const positions = [], normals = [], uv = [], indices = [];
  for (let i = 0; i <= segments; i++) {
    const u = i / segments;
    const theta = angle + arc * (0.5 - u);
    const x = Math.sin(theta), z = Math.cos(theta);
    for (const v of [0, 1]) {
      positions.push(radius * x, height * (0.5 - v), radius * z);
      normals.push(x, 0, z);
      uv.push(u, v);
    }
    if (i < segments) {
      const a = 2 * i;
      indices.push(a, a + 2, a + 1, a + 2, a + 3, a + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  return geometry;
}

function atlasTexture(texture, region) {
  if (!texture) return null;
  const map = texture.clone();
  map.offset.fromArray(region.offset);
  map.repeat.fromArray(region.repeat);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.ClampToEdgeWrapping;
  map.needsUpdate = true;
  return map;
}

function serialMaterial(mat) {
  const map = mat.map;
  return {
    name: mat.name,
    type: mat.type,
    color: mat.color.toArray(),
    color_srgb: `#${mat.color.getHexString()}`,
    metalness: mat.metalness,
    roughness: mat.roughness,
    opacity: mat.opacity,
    transparent: mat.transparent,
    alphaTest: mat.alphaTest,
    side: mat.side,
    map: map ? {
      offset: map.offset.toArray(), repeat: map.repeat.toArray(),
      rotation: map.rotation, center: map.center.toArray(), flipY: map.flipY,
      colorSpace: map.colorSpace,
    } : null,
  };
}

export function applyProbeAppearance(scene, { appearance, manifest, labelTexture = null } = {}) {
  const housing = scene.getObjectByName('probe__housing');
  const connector = scene.getObjectByName('probe__connector');
  const wearFace = scene.getObjectByName('probe__wear_face');
  if (!housing || !connector || !wearFace) throw new Error('The original probe parts are required.');
  if (installed.has(housing)) return installed.get(housing);
  if (!appearance?.materials || !manifest?.parameters) throw new Error('Appearance and manifest are required.');

  const parameter = (key) => manifest.parameters[key].value * MM;
  const d = appearance.details_mm;
  const radius = parameter('housing_outer_diameter') / 2;
  const halfHeight = parameter('housing_body_height') / 2;
  const connectorRadius = parameter('connector_diameter') / 2;
  const connectorHalfHeight = parameter('connector_height') / 2;
  const materials = Object.fromEntries(Object.entries(appearance.materials).map(([key, spec]) => [key, material(spec)]));
  const replacements = [];
  const replace = (obj, replacement, predicate = () => true) => {
    obj.traverse((mesh) => {
      if (!mesh.isMesh || !predicate(mesh.material)) return;
      const previous = mesh.material;
      mesh.material = replacement.clone();
      replacements.push({ mesh, previousName: previous.name });
    });
  };
  replace(housing, materials.housing);
  replace(connector, materials.silver, (mat) => mat.name === 'mat_connector_shell');
  replace(wearFace, materials.wear);

  const accessories = [];
  const add = (parent, name, geometry, mat, y = 0) => {
    const mesh = new THREE.Mesh(geometry, mat);
    mesh.name = `appearance__${name}`;
    mesh.position.y = y;
    mesh.userData.appearanceRole = 'non_acoustic_teaching_appearance';
    parent.add(mesh);
    accessories.push(mesh);
    return mesh;
  };
  const collarHeight = [d.top_collar_height * MM, d.bottom_collar_height * MM];
  const collarRadius = radius + d.collar_radial_addition * MM;
  const collarInner = radius - 0.055 * MM;
  add(housing, 'top_silver_collar', annularBand(collarInner, collarRadius, collarHeight[0]), materials.silver,
    -halfHeight + collarHeight[0] / 2 + d.collar_inset * MM);
  add(housing, 'bottom_silver_collar', annularBand(collarInner, collarRadius, collarHeight[1]), materials.silver,
    halfHeight - collarHeight[1] / 2 - d.collar_inset * MM);

  const ribDepth = d.grip_radial_addition * MM;
  const ribGeometry = () => gripBand(radius + ribDepth / 2, d.grip_rib_width * MM, ribDepth,
    d.grip_band_height * MM, d.grip_rib_count);
  add(housing, 'upper_grip_ribs', ribGeometry(), materials.grip, -d.grip_band_center_offset * MM);
  add(housing, 'lower_grip_ribs', ribGeometry(), materials.grip, d.grip_band_center_offset * MM);

  const threadHeight = d.connector_thread_height * MM;
  for (const [i, center] of d.connector_thread_centers.entries()) {
    add(connector, `connector_thread_${i + 1}`,
      annularBand(connectorRadius - 0.04 * MM, connectorRadius + d.connector_thread_radial_addition * MM, threadHeight),
      materials.thread, center * MM);
  }
  const baseHeight = d.connector_base_collar_height * MM;
  add(connector, 'connector_base_collar',
    annularBand(connectorRadius - 0.04 * MM, connectorRadius + d.connector_base_collar_radial_addition * MM, baseHeight),
    materials.silver, connectorHalfHeight - baseHeight / 2);

  const labelMaterial = (region) => material(appearance.materials.label, {
    name: `${appearance.materials.label.name}_${region}`,
    map: atlasTexture(labelTexture, appearance.atlas[region]),
    transparent: true, alphaTest: 0.15, depthWrite: true, side: THREE.FrontSide,
  });
  materials.topLabel = labelMaterial('top');
  materials.sideLabel = labelMaterial('side');
  add(housing, 'top_nameplate',
    topPlate(connectorRadius + d.top_plate_inner_clearance * MM, radius - d.top_plate_radius_inset * MM),
    materials.topLabel, -halfHeight - d.top_plate_height_offset * MM);
  const sideRadius = radius + d.side_plate_radial_addition * MM;
  const sideArc = d.side_plate_arc_degrees * Math.PI / 180;
  for (const [name, angle] of [['side_nameplate_x', Math.PI / 2], ['side_nameplate_z', Math.PI]]) {
    add(housing, name, sidePlate(sideRadius, d.side_plate_height * MM, angle, sideArc),
      materials.sideLabel, d.side_plate_y * MM);
  }

  const result = {
    housing, connector, wearFace, accessories, materials,
    exportDescriptor() {
      scene.updateMatrixWorld(true);
      return {
        appearanceId: appearance.appearance_id,
        units: 'm',
        atlasAsset: appearance.atlas.asset,
        replacements: replacements.map(({ mesh, previousName }) => ({
          name: mesh.name, parentName: mesh.parent?.name, originalMesh: true,
          previousMaterialName: previousName, material: serialMaterial(mesh.material),
        })),
        accessories: accessories.map((mesh) => ({
          name: mesh.name,
          parentName: mesh.parent.name,
          originalMesh: false,
          matrixLocal: mesh.matrix.toArray(),
          matrixWorld: mesh.matrixWorld.toArray(),
          position: Array.from(mesh.geometry.getAttribute('position').array),
          normal: Array.from(mesh.geometry.getAttribute('normal').array),
          uv: Array.from(mesh.geometry.getAttribute('uv').array),
          index: Array.from(mesh.geometry.index.array),
          material: serialMaterial(mesh.material),
        })),
      };
    },
  };
  installed.set(housing, result);
  return result;
}
