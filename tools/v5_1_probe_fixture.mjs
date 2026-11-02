import { readFileSync } from 'node:fs';
import { Texture } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export const readProjectJson = (path) => JSON.parse(readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8'));

// Load the real frozen GLB, retaining all geometry and transforms. The Node
// fixture replaces image decoding only; Three still resolves its material maps.
export async function loadProbeModel() {
  const bytes = readFileSync(new URL('../../assets/probe_single_contact.glb', import.meta.url));
  const loader = new GLTFLoader();
  loader.register(() => ({
    name: 'NODE_TEST_IMAGE_IO',
    loadTexture(index) {
      const texture = new Texture();
      texture.name = `node-fixture-image-${index}`;
      return Promise.resolve(texture);
    },
  }));
  const gltf = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  gltf.scene.updateMatrixWorld(true);
  return { gltf, root: gltf.scene.getObjectByName('probe_assembly_root') };
}
