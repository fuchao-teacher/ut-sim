import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Box3, Color, Texture, Vector2, Vector3 } from 'three';
import * as THREE from 'three';
import { loadProbeModel, readProjectJson } from './v5_1_probe_fixture.mjs';
import { applyProbeAppearance } from '../src/probe-appearance.js';

const manifest = readProjectJson('contracts/model_manifest.json');
const events = readProjectJson('contracts/events_contract.json');
const appearance = readProjectJson('knowledge/probe-appearance.json');
const mainSource = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const digest = (array) => createHash('sha256').update(new Uint8Array(array.buffer, array.byteOffset, array.byteLength)).digest('hex');
const pose = (object) => ({ position: object.position.toArray(), quaternion: object.quaternion.toArray(), scale: object.scale.toArray() });
const geometryState = (geometry) => ({
  attributes: Object.fromEntries(Object.entries(geometry.attributes).map(([name, attribute]) => [name,
    { itemSize: attribute.itemSize, normalized: attribute.normalized, bytes: digest(attribute.array) }])),
  index: geometry.index ? digest(geometry.index.array) : null,
  morphAttributes: Object.fromEntries(Object.entries(geometry.morphAttributes).map(([name, attributes]) => [name,
    attributes.map((attribute) => digest(attribute.array))])),
  groups: structuredClone(geometry.groups), morphTargetsRelative: geometry.morphTargetsRelative,
});

function mainFunction(name) {
  const start = mainSource.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `production function ${name} exists`);
  const bodyStart = mainSource.indexOf('{', start);
  let depth = 0;
  for (let index = bodyStart; index < mainSource.length; index++) {
    if (mainSource[index] === '{') depth++;
    if (mainSource[index] === '}' && --depth === 0) return mainSource.slice(start, index + 1);
  }
  throw new Error(`Unclosed function ${name}`);
}

async function dressedModel() {
  const { gltf, root } = await loadProbeModel();
  const labelTexture = new Texture({ src: 'assets/probe_nameplate.png' });
  const before = new Map();
  root.traverse((object) => before.set(object, {
    name: object.name, pose: pose(object), userData: structuredClone(object.userData),
    ...(object.isMesh ? { geometry: object.geometry, geometryState: geometryState(object.geometry),
      material: object.material, color: object.material.color?.clone() } : {}),
  }));
  const rootChildren = [...root.children];
  const result = applyProbeAppearance(gltf.scene, { appearance, manifest, labelTexture });
  gltf.scene.updateMatrixWorld(true);
  return { gltf, root, before, rootChildren, result, labelTexture };
}

test('dressing the real GLB preserves all 12 frozen part identities, extras, poses and every original acoustic geometry byte', async () => {
  const { root, before, rootChildren } = await dressedModel();
  assert.equal(rootChildren.length, 12);
  assert.deepEqual(root.children, rootChildren);
  assert.deepEqual([root.name, ...root.children.map((object) => object.name)].sort(), [...events.gltf_contract.required_node_names].sort());
  for (const [object, prior] of before) {
    assert.equal(object.name, prior.name);
    assert.deepEqual(pose(object), prior.pose, object.name);
    assert.deepEqual(object.userData, prior.userData, `${object.name} extras`);
    if (object.isMesh) {
      assert.equal(object.geometry, prior.geometry, `${object.name} original geometry identity`);
      assert.deepEqual(geometryState(object.geometry), prior.geometryState, `${object.name} acoustic data`);
    }
  }
});

test('the real housing has a dark independent finish while the test piece and internal acoustics keep their original materials', async () => {
  const { root, before } = await dressedModel();
  const housing = root.getObjectByName('probe__housing');
  const steel = root.getObjectByName('probe__steel_block');
  assert.notEqual(housing.material, before.get(housing).material);
  assert.equal(steel.material, before.get(steel).material);
  assert.deepEqual(steel.material.color.toArray(), before.get(steel).color.toArray());
  assert.ok(Math.hypot(...housing.material.color.toArray().map((value, index) => value - steel.material.color.toArray()[index])) > 0.15,
    'probe contrasts with steel');
  const hsl = housing.material.color.getHSL({});
  assert.ok(hsl.l < 0.2 && hsl.s > 0.2, `dark coloured exterior ${JSON.stringify(hsl)}`);
  for (const [object, prior] of before) {
    const parentPart = root.children.find((part) => part === object || part.getObjectById(object.id));
    if (object.isMesh && !['probe__housing', 'probe__connector', 'probe__wear_face'].includes(parentPart?.name)) {
      assert.equal(object.material, prior.material, `${object.name} independent internal/test-piece material`);
    }
  }
  housing.material.color.copy(new Color(0xff0000));
  assert.deepEqual(steel.material.color.toArray(), before.get(steel).color.toArray(), 'later highlight/recolour cannot tint steel');
});

test('new bands, grips and nameplates belong to their physical housing or connector and remain clear of the contact plane', async () => {
  const { root, result } = await dressedModel();
  assert.ok(result.accessories.length >= 6, 'finished shell includes mechanical detail');
  for (const accessory of result.accessories) {
    assert.ok(accessory.isMesh, accessory.name);
    let parent = accessory.parent;
    while (parent && parent.parent !== root) parent = parent.parent;
    assert.ok(['probe__housing', 'probe__connector'].includes(parent?.name), `${accessory.name} physical part ancestry`);
    const box = new Box3().setFromObject(accessory);
    assert.ok(box.min.y >= -0.00004, `${accessory.name} must not enter the steel/contact face: ${box.min.y}`);
    assert.ok(box.max.y <= 0.0401, `${accessory.name} stays within the probe's connector envelope`);
    assert.ok(Math.max(Math.abs(box.min.x), Math.abs(box.max.x), Math.abs(box.min.z), Math.abs(box.max.z)) < 0.0126,
      `${accessory.name} retains the 22 mm-class body envelope`);
  }
  // Moving/hiding the housing in exploded/isolation views must carry its trim.
  const housing = root.getObjectByName('probe__housing');
  const housingTrim = result.accessories.find((accessory) => housing.getObjectById(accessory.id));
  const oldPosition = housingTrim.getWorldPosition(new Vector3());
  housing.position.y -= 0.050; root.updateMatrixWorld(true);
  assert.ok(Math.abs(housingTrim.getWorldPosition(new Vector3()).y - oldPosition.y - 0.050) < 1e-7);
  housing.visible = false;
  assert.equal(housingTrim.parent.parent?.visible === false || housingTrim.parent.visible === false, true);
});

test('actual curved label UVs put the readable text upright in world space and face outward', async () => {
  const { result, labelTexture } = await dressedModel();
  const labels = result.accessories.filter((mesh) => mesh.material.map?.source === labelTexture.source);
  assert.ok(labels.length >= 2, 'side and/or top nameplates use the real embedded texture');
  let sideLabels = 0;
  for (const mesh of labels) {
    const positions = mesh.geometry.attributes.position;
    assert.equal(mesh.material.map.colorSpace, THREE.SRGBColorSpace, `${mesh.name} proper nameplate colour space`);
    const uv = mesh.geometry.attributes.uv;
    assert.ok(uv, `${mesh.name} texture UVs`);
    const low = [], high = [];
    for (let index = 0; index < uv.count; index++) {
      const v = uv.getY(index);
      if (v < 0.001) low.push(new Vector3().fromBufferAttribute(positions, index).applyMatrix4(mesh.matrixWorld));
      if (v > 0.999) high.push(new Vector3().fromBufferAttribute(positions, index).applyMatrix4(mesh.matrixWorld));
    }
    assert.ok(low.length && high.length, `${mesh.name} full label texture coverage`);
    const average = (values) => values.reduce((sum, point) => sum.add(point), new Vector3()).multiplyScalar(1 / values.length);
    const up = average(high).sub(average(low)).normalize();
    const normals = mesh.geometry.attributes.normal;
    const indices = mesh.geometry.index.array;
    for (let index = 0; index < indices.length; index += 3) {
      const [a, b, c] = [0, 1, 2].map((offset) => new Vector3().fromBufferAttribute(positions, indices[index + offset]));
      const triangleNormal = b.clone().sub(a).cross(c.clone().sub(a)).normalize();
      const vertexNormal = new Vector3().fromBufferAttribute(normals, indices[index]);
      assert.ok(triangleNormal.dot(vertexNormal) > 0.95, `${mesh.name} triangles face the indicated outside normal`);
    }
    const normal = new Vector3();
    for (let index = 0; index < normals.count; index++) normal.add(new Vector3().fromBufferAttribute(normals, index).transformDirection(mesh.matrixWorld));
    normal.normalize();
    if (Math.abs(normal.y) < 0.5) {
      sideLabels++;
      assert.ok(up.y > 0.999, `${mesh.name} side text must face world +Y: ${up.toArray()}`);
      const centre = new Box3().setFromObject(mesh).getCenter(new Vector3());
      const radial = new Vector3(centre.x, 0, centre.z).normalize();
      assert.ok(normal.dot(radial) > 0.95, `${mesh.name} label faces away from the body`);
    } else {
      assert.ok(normal.y > 0.999, `${mesh.name} top label faces world +Y`);
    }
  }
  assert.ok(sideLabels >= 2, 'two upright exterior labels remain visible from different viewpoints');
});

test('viewing each nameplate from outside preserves texture handedness rather than reflecting the lettering', async () => {
  const { result, labelTexture } = await dressedModel();
  const labels = result.accessories.filter((mesh) => mesh.material.map?.source === labelTexture.source);
  assert.equal(labels.length, 3, 'test both curved sides and the top annulus');
  for (const mesh of labels) {
    const geometry = mesh.geometry;
    const positions = geometry.attributes.position;
    const normals = geometry.attributes.normal;
    const uv = geometry.attributes.uv;
    const indices = geometry.index.array;
    mesh.material.map.updateMatrix();
    for (let index = 0; index < indices.length; index += 3) {
      const triangle = Array.from(indices.slice(index, index + 3));
      const [p0, p1, p2] = triangle.map((vertex) => new Vector3().fromBufferAttribute(positions, vertex).applyMatrix4(mesh.matrixWorld));
      const [t0, t1, t2] = triangle.map((vertex) => new Vector2().fromBufferAttribute(uv, vertex).applyMatrix3(mesh.material.map.matrix));
      const edge1 = p1.sub(p0), edge2 = p2.sub(p0);
      const delta1 = t1.sub(t0), delta2 = t2.sub(t0);
      const determinant = delta1.x * delta2.y - delta1.y * delta2.x;
      assert.ok(Math.abs(determinant) > 1e-10, `${mesh.name} texture triangle has a usable area`);
      // Reconstruct the actual surface directions corresponding to increasing
      // image U and V. Their cross product must point toward the viewer on the
      // exterior side; the opposite sign would mirror even an upright label.
      const imageRight = edge1.clone().multiplyScalar(delta2.y).addScaledVector(edge2, -delta1.y).multiplyScalar(1 / determinant);
      const imageUp = edge2.clone().multiplyScalar(delta1.x).addScaledVector(edge1, -delta2.x).multiplyScalar(1 / determinant);
      const outward = new Vector3().fromBufferAttribute(normals, triangle[0]).transformDirection(mesh.matrixWorld);
      assert.ok(imageRight.cross(imageUp).normalize().dot(outward) > 0.95,
        `${mesh.name} texture handedness must match its outward face at triangle ${index / 3}`);
    }
  }
});

test('reapplying appearance is idempotent and does not create additional parts or duplicate trim', async () => {
  const { gltf, root, result, labelTexture } = await dressedModel();
  const count = () => { let size = 0; root.traverse(() => size++); return size; };
  const firstCount = count();
  const second = applyProbeAppearance(gltf.scene, { appearance, manifest, labelTexture });
  assert.equal(count(), firstCount);
  assert.deepEqual(second.accessories, result.accessories);
  assert.equal(root.children.length, 12);
});

test('the real application part registration includes every accessory in its existing picking, clipping and material bookkeeping', async () => {
  const { gltf, result } = await dressedModel();
  const run = new Function('THREE', 'gltf', 'KB', 'STATES', `
    const parts = {}, meshToPart = new Map(), pickMeshes = [];
    const scene = new THREE.Scene(), tmpBox = new THREE.Box3();
    const clipPlane = new THREE.Plane(new THREE.Vector3(-1, 0, 0), 1);
    const PREFIX = 'probe__'; let root = null, CLIP_OFF = 0;
    function setClip(value) { clipPlane.constant = value; }
    ${mainFunction('sectionColor')}
    ${mainFunction('sampleVertices')}
    ${mainFunction('initParts')}
    initParts(gltf);
    return { parts, meshToPart, pickMeshes, clipPlane };
  `);
  const kb = Object.fromEntries(readProjectJson('knowledge/probe_parts.json').parts.map((part) => [part.id, part]));
  const registered = run(THREE, gltf, kb, manifest.states);
  assert.equal(Object.keys(registered.parts).length, 12);
  for (const accessory of result.accessories) {
    const part = registered.meshToPart.get(accessory);
    assert.ok(part, `${accessory.name} registered for interaction`);
    assert.ok(['probe__housing', 'probe__connector'].includes(part.pid));
    assert.ok(registered.pickMeshes.includes(accessory));
    assert.ok(part.meshes.includes(accessory));
    assert.ok(accessory.material.clippingPlanes.includes(registered.clipPlane));
    assert.ok(accessory.userData.base, `${accessory.name} standard highlight/ghost bookkeeping`);
  }
});

test('the delivered nameplate asset is a real PNG and its 2.5P14 designation matches the frozen 2.5 MHz / 14 mm probe', () => {
  const png = readFileSync(new URL('../../assets/probe_nameplate.png', import.meta.url));
  assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.ok(png.readUInt32BE(16) >= 512 && png.readUInt32BE(20) >= 128, 'texture resolution supports readable lettering');
  assert.equal(manifest.reference_physics.f0_MHz, 2.5);
  assert.equal(manifest.parameters.active_element_diameter.value, 14);
  assert.equal(appearance.model_marking.model, `${manifest.reference_physics.f0_MHz}P${manifest.parameters.active_element_diameter.value}`);
  assert.equal(appearance.model_marking.frequency, `${manifest.reference_physics.f0_MHz} MHz`);
  assert.equal(Number(appearance.model_marking.element.match(/\u03a6([\d.]+)\s*mm/)?.[1]), manifest.parameters.active_element_diameter.value,
    'label explicitly denotes the active-element diameter rather than the housing diameter');
  assert.notEqual(manifest.parameters.active_element_diameter.value, manifest.parameters.housing_outer_diameter.value);
});
