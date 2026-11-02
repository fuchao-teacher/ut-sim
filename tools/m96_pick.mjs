// M9.6 case library selection: greedy pick of seeds per template covering display types, counts, plate grades and the level III conclusion.
// usage: node tools/m96_pick.mjs  → prints the library cases list for contracts/cases.json
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const proj = join(here, '..', '..');
const readJson = (p) => JSON.parse(readFileSync(join(proj, p), 'utf8'));
const cases = readJson('contracts/cases.json');
const wf = readJson('contracts/waveform_rules.json');
const std = readJson('contracts/standard_nbt47013_3.json');
const spec = readJson('contracts/specimens_manifest.json');
const model = readJson('contracts/model_manifest.json');
const scenes = readJson('knowledge/scenes.json');
const insp = readJson('knowledge/inspection.json');
const { createWaveform } = await import(new URL('../src/waveform.js', import.meta.url));
const CL = await import(new URL('../src/caselib.js', import.meta.url));
const makeWave = (specimens) => createWaveform({ rules: wf, manifest: model, dampingCycles: scenes.teaching_settings.lab.damping_cycles, scenarios: insp.scenarios, specimens });
const lib = CL.createCaselib({ cases, rules: wf, standard: std, specimens: spec, makeWave, scenario: insp.scenarios[0] });

const QUOTA = { basic: 6, standard: 10, clean: 4 };
const POOL = Number(process.env.M96_POOL || 300);

function keysOf(cs) {
  const ref = cs.reference;
  const det = ref.items.filter((i) => i.determined).map((i) => cs.plate.defects.find((d) => d.id === i.id).type);
  const nd = ref.items.filter((i) => !i.determined).map((i) => cs.plate.defects.find((d) => d.id === i.id).type);
  const ks = [`grade:${ref.expected.plate_grade}`, `n:${ref.items.length}`, `det:${det.length}`, `III:${ref.expected.III.pass}`, `II:${ref.expected.II.pass}`];
  for (const t of det) ks.push(`dt:${t}`);
  for (const t of nd) ks.push(`nt:${t}`);
  ks.push(`mix:${[...det].sort().join('+')}`);
  return { ks, det, nd, grade: ref.expected.plate_grade };
}

const out = [];
for (const [tpl, q] of Object.entries(QUOTA)) {
  const cand = [];
  for (let s = 1; cand.length < POOL && s < POOL * 4; s++) {
    const seed = (s * 2654435761) % 2 ** cases.prng.seed_bits;
    const cs = lib.generate(tpl, seed);
    if (!cs || cs.failed || cs.template_id !== tpl) continue;
    cand.push({ seed, ...keysOf(cs) });
  }
  const seen = new Set();
  const picked = [];
  while (picked.length < q && cand.length) {
    let best = 0;
    let bestN = -1;
    cand.forEach((c, i) => { const n = c.ks.filter((k) => !seen.has(k)).length; if (n > bestN) { bestN = n; best = i; } });
    const c = cand.splice(best, 1)[0];
    c.ks.forEach((k) => seen.add(k));
    picked.push(c);
  }
  picked.sort((a, b) => a.grade.localeCompare(b.grade) || a.det.length - b.det.length || a.seed - b.seed);
  out.push(...picked.map((c) => ({ template: tpl, seed: c.seed, info: `${c.grade} det ${c.det.join('+') || '-'} nd ${c.nd.join('+') || '-'}` })));
}
out.forEach((c, i) => { c.id = String(i + 1).padStart(2, '0'); });
for (const c of out) console.log(`${c.id} ${c.template.padEnd(8)} ${String(c.seed).padStart(7)}  ${c.info}`);
console.log(JSON.stringify(out.map(({ id, template, seed }) => ({ id, template, seed }))));
