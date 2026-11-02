// M8.3 scoring engine scenarios (docs/M8_SCOPE.md §5, §10): perfect path, every chain break, typical mistakes.
// Expected totals are worked out by hand from contracts/rubric.json; run: node tools/m83_score.mjs
import { readFileSync } from 'node:fs';
import { createScoring } from '../src/scoring.js';

const jl = (p) => JSON.parse(readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8'));
const rubric = jl('contracts/rubric.json');
const rules = jl('contracts/waveform_rules.json');
const spec = jl('contracts/specimens_manifest.json');
const files = { waveform_rules: rules, standard: jl('contracts/standard_nbt47013_3.json'), specimens_manifest: spec, model_manifest: jl('contracts/model_manifest.json'), practice_doc: jl('knowledge/practice.json') };
const S = createScoring({ rubric, files });
const P = rules.practice;
const AV = P.acceptance_values;
const P02 = P.step_presets.evaluate.specimen;
const EXP = P.grading.expected;

const clone = (o) => JSON.parse(JSON.stringify(o));
function perfect() {
  const results = {};
  for (const it of P.grading.reference_items) {
    if (!it.determined) continue;
    const ref = AV[`${it.id}_reference_mm`];
    results[it.id] = { length: ref.length, area: ref.area_mm2, eq: AV[`${it.id}_equivalent_dB`] ?? null };
  }
  const prac = {
    done: { calibrate: true, dac: true, sensitivity: true, scan: true, quantify: true, evaluate: true },
    calib: { points: { ...P.calibration.targets_mm } },
    dac: { points: spec.specimens[P.dac.specimen].holes.map((h) => ({ id: h.id, S: h.S_mm, G: AV.dac_G_dB[String(h.S_mm)] })) },
    sens: { base: AV.G_base_dB, scan: AV.G_scan_dB },
    plates: { [P02]: { scan: { trail: [[0, 0], [0, 1]], found: P.grading.reference_items.map((r) => ({ id: r.id, flags: r.flags, confirmed: true })) }, quant: { results } } },
    eval: { level: 'IV', verdicts: Object.fromEntries(Object.entries(EXP.IV).filter(([k]) => k !== 'pass')), plate: EXP.plate_grade, conclusion: 'accept' },
  };
  const events = ['assembly:done', 'practice:calib_done', 'practice:dac_done', 'practice:sensitivity'].map((name) => ({ name, payload: {} }))
    .concat([{ name: 'practice:evaluate', payload: { correct: true, self_consistent: true } }]);
  return { prac, events, coverage: { [P02]: { edge: 1, middle: 0.95 } } };
}

const results = [];
const check = (id, desc, ok, detail = '') => results.push({ id, desc, ok: !!ok, detail });
const item = (r, id) => r.items.find((x) => x.id === id);
const run = (mod) => { const c = perfect(); mod?.(c); return S.score(c); };
const st = (r) => Object.fromEntries(r.items.map((x) => [x.id, `${x.points}/${x.status}`]));

const r0 = run();
const refsOk = r0.items.every((it) => it.parts.every((p) => p.evidence.every((e) => e.ref && !e.ref.includes('{') && e.ref !== 'null')));
check('S1', 'perfect path: 100 / 100, every item ok, every evidence ref resolved, self_consistent recorded', r0.total === 100 && r0.max === 100
  && r0.items.every((x) => x.status === 'ok' && x.points === x.max) && refsOk && r0.self_consistent === true, JSON.stringify(st(r0)));
check('S2', 'item maxima follow the rubric (5 / 15 / 15 / 10 / 15 / 15 / 10 / 10 / 5)', r0.items.map((x) => x.max).join(',') === '5,15,15,10,15,15,10,10,5');
check('S3', 'deterministic: same input, same result', JSON.stringify(run()) === JSON.stringify(r0));

const r1 = run((c) => { c.events.push({ name: 'assembly:error', payload: {} }, { name: 'assembly:error', payload: {} }); });
check('A1', 'assembly: 2 errors x per_error 1 -> 3, conduct unchanged (not counted twice)', item(r1, 'assembly').points === 3 && item(r1, 'conduct').points === 5 && r1.total === 98, `${r1.total}`);

const r2 = run((c) => { c.prac.calib.points = { B1: 25.3, B2: 50.3 }; });
check('C1', 'calibration within ui tolerance but not qa tolerance: done 12, precise 0, partial', item(r2, 'calibrate').points === 12 && item(r2, 'calibrate').status === 'partial' && r2.total === 97, `${r2.total}`);

const r3 = run((c) => {
  c.prac.done = {};
  c.prac.calib = { points: {} };
  c.prac.dac = { points: [] };
  c.prac.sens = null;
  c.prac.plates[P02] = { scan: { trail: [], found: [] }, quant: { results: {} } };
  c.prac.eval = {};
  c.events.splice(2, 0, { name: 'instrument:velocity', payload: { velocity_m_s: 5910 } }, { name: 'instrument:velocity', payload: { velocity_m_s: 5920 } });
  c.events = c.events.filter((e) => e.name !== 'practice:evaluate');
});
const chain3 = ['dac', 'sensitivity', 'scan', 'detect', 'quantify', 'evaluate'].every((id) => item(r3, id).status === 'basis_invalid' && item(r3, id).points === 0);
check('C2', 'calibration voided at the end: calibrate missing, DAC..evaluate basis_invalid (factor 0); voiding counted once in conduct -> 5 + 4 = 9',
  item(r3, 'calibrate').status === 'missing' && chain3 && item(r3, 'conduct').points === 4 && r3.total === 9, JSON.stringify(st(r3)));

const r4 = run((c) => { c.prac.dac.points[1].G += 1.5; });
check('D1', 'one DAC point 1.5 dB off (> peak_tolerance_dB): DAC 10, later items still valid', item(r4, 'dac').points === 10 && item(r4, 'sensitivity').status === 'ok' && r4.total === 95, `${r4.total}`);

const r5 = run((c) => { c.prac.sens.base -= 2; c.prac.sens.scan -= 2; });
check('G1', 'base sensitivity 2 dB off: base 0, scan offset ok 4 -> sensitivity 4', item(r5, 'sensitivity').points === 4 && r5.total === 94, `${r5.total}`);

const r6 = run((c) => { c.coverage[P02] = { edge: 0.8, middle: 0.6 }; });
check('V1', `coverage edge 80 % / middle 60 % with full_at ${rubric.teacher_config.coverage.full_at} / zero_at ${rubric.teacher_config.coverage.zero_at}: edge 8 x 0.5 = 4, middle 0`, item(r6, 'scan').points === 4 && r6.total === 89, `${r6.total}`);
const r6b = run((c) => { c.coverage[P02] = { edge: 0.9993, middle: 0.9 }; });
check('V2', 'edge 99.93 % (guide spacing, square loops) and middle 90 %: full 15', item(r6b, 'scan').points === 15, `${item(r6b, 'scan').points}`);
const r6c = run((c) => { c.prac.plates[P02].scan.trail = []; });
check('V3', 'no trail on the practice plate: scan missing, detect..evaluate basis_invalid', item(r6c, 'scan').status === 'missing' && item(r6c, 'detect').status === 'basis_invalid' && item(r6c, 'evaluate').status === 'basis_invalid', JSON.stringify(st(r6c)));

const r7 = run((c) => { c.prac.plates[P02].scan.found = c.prac.plates[P02].scan.found.filter((f) => f.id !== 'POR_01'); delete c.prac.eval.verdicts.POR_01; });
const v7 = item(r7, 'evaluate').parts.find((p) => p.id === 'verdict_POR_01');
check('F1', 'POR_01 (not determined) not found: detect 12, its verdict basis_invalid -> evaluate 9; partial submission allowed', item(r7, 'detect').points === 12 && v7.status === 'basis_invalid' && item(r7, 'evaluate').points === 9 && r7.total === 96, `${r7.total}`);

const r8 = run((c) => { c.prac.plates[P02].scan.found = c.prac.plates[P02].scan.found.filter((f) => f.id !== 'LAM_02'); });
const q8 = item(r8, 'quantify').parts.find((p) => p.id === 'size_LAM_02');
check('F2', 'LAM_02 (determined) not found: detect 12, size_LAM_02 basis_invalid -> quantify 6.7, verdict 0 -> evaluate 9; total 92.7', q8.status === 'basis_invalid' && item(r8, 'quantify').points === 6.7 && item(r8, 'evaluate').points === 9 && r8.total === 92.7, `${r8.total}`);

const r9 = run((c) => { c.prac.plates[P02].quant.results.INC_02.length += 12; });
check('Q1', 'INC_02 length 12 mm off (> indicated_length_mm): half of its share lost -> quantify 8.3', item(r9, 'quantify').points === 8.3 && r9.total === 98.3, `${r9.total}`);
const r9b = run((c) => { delete c.prac.plates[P02].quant.results.CLU_01; });
const v9b = item(r9b, 'evaluate').parts.find((p) => p.id === 'verdict_CLU_01');
check('Q2', 'CLU_01 found but not quantified: size missing, its verdict basis_invalid (determined needs size)', v9b.status === 'basis_invalid' && item(r9b, 'quantify').points === 6.7 && item(r9b, 'evaluate').points === 9, `${r9b.total}`);
const r9c = run((c) => { c.prac.plates[P02].quant.results.CLU_01.area *= 1.3; });
check('Q3', 'CLU_01 area 30 % off (> indicated_area_relative): area half lost', Math.abs(item(r9c, 'quantify').points - 8.3) < 1e-9, `${item(r9c, 'quantify').points}`);

const r10 = run((c) => { c.prac.eval.conclusion = 'reject'; });
check('E1', 'level IV with conclusion reject: conclusion 0 -> evaluate 8', item(r10, 'evaluate').points === 8 && r10.total === 98, `${r10.total}`);
const r10b = run((c) => { c.prac.eval = { level: 'III', verdicts: Object.fromEntries(Object.entries(EXP.III).filter(([k]) => k !== 'pass')), plate: 'IV', conclusion: 'reject' }; });
check('E2', 'level III with its expected verdicts, plate IV, reject: full 10 (reference answer follows the chosen level)', item(r10b, 'evaluate').points === 10, `${item(r10b, 'evaluate').points}`);
const r10c = run((c) => { c.prac.eval.verdicts.INC_02 = 'counted'; c.prac.eval.plate = 'III'; });
check('E3', 'one wrong verdict and wrong plate grade: evaluate 10 - 1 - 3 = 6', item(r10c, 'evaluate').points === 6, `${item(r10c, 'evaluate').points}`);
const r10d = run((c) => { c.events = c.events.filter((e) => e.name !== 'practice:evaluate'); });
check('E4', 'no practice:evaluate (not submitted): evaluate missing 0, self_consistent null', item(r10d, 'evaluate').status === 'missing' && r10d.total === 90 && r10d.self_consistent === null, `${r10d.total}`);

const r11 = run((c) => {
  for (const reason of ['reject_not_zero', 'reject_not_zero', 'saturated', 'no_echo', 'not_80']) c.events.push({ name: 'practice:record_blocked', payload: { step: 'dac', reason } });
});
check('K1', 'conduct: 2 reject + 1 saturated blocked records -> 5 - 3 = 2; other block reasons not counted', item(r11, 'conduct').points === 2 && r11.total === 97, `${r11.total}`);
const r11b = run((c) => { c.events.unshift({ name: 'instrument:velocity', payload: {} }); });
check('K2', 'velocity change before calibration is not a conduct error', item(r11b, 'conduct').points === 5);

const r12 = S.score({ prac: { done: {}, calib: { points: {} }, dac: { points: [] }, sens: null, plates: {}, eval: {} }, events: [{ name: 'assembly:done', payload: {} }], coverage: {} });
check('Z1', 'assembled only: 5 (assembly) + 5 (conduct) = 10; calibrate missing, rest basis_invalid', r12.total === 10 && item(r12, 'calibrate').status === 'missing', JSON.stringify(st(r12)));
const r13 = S.score({ prac: {}, events: [], coverage: {} });
check('Z2', 'empty session: only conduct 5', r13.total === 5 && item(r13, 'assembly').status === 'missing');

const half = createScoring({ rubric: { ...rubric, teacher_config: { ...rubric.teacher_config, basis_invalid_factor: 0.5 } }, files }).score((() => { const c = perfect(); c.prac.done.calibrate = false; return c; })());
check('T1', 'teacher_config.basis_invalid_factor 0.5: basis_invalid items keep half their points', item(half, 'dac').status === 'basis_invalid' && item(half, 'dac').points === 7.5, `${item(half, 'dac').points}`);

const fails = results.filter((r) => !r.ok);
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.id}  ${r.desc}${r.detail ? `  [${r.detail}]` : ''}`);
console.log(`m83_score: ${results.length - fails.length}/${results.length} ${fails.length ? 'FAIL' : 'PASS'}`);
process.exit(fails.length ? 1 : 0);
