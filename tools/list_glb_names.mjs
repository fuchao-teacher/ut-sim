import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const loader = new GLTFLoader();
const root = join(dirname(fileURLToPath(import.meta.url)), '../../../paut_tofd_teaching_v1/assets');
const files = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ['paut_teaching.glb', 'tofd_teaching.glb', 'pa_probe_parts.glb', 'tofd_probe_parts.glb'];

for (const f of files) {
  const buf = readFileSync(join(root, f));
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  await new Promise((res, rej) => {
    loader.parse(ab, '', (g) => {
      const names = [];
      g.scene.traverse((o) => { if (o.name) names.push(`${o.name}${o.isMesh ? ' [m]' : ''}`); });
      console.log(`\n=== ${f} (${names.length}) ===`);
      console.log(names.join('\n'));
      res();
    }, rej);
  });
}
