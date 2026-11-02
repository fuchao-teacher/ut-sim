import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createTaskcard } from '../src/taskcard.js';
import { createWaveform } from '../src/waveform.js';
import { createCaselib } from '../src/caselib.js';
import { createThickness } from '../src/thickness.js';
import { createProcedure } from '../src/procedure.js';
import { makeReferenceCard, presetDetectionPractice, deriveDetectionRubric, createDetectionScoring, drawLibraryCase, GUIDE_TIP_POINTS, REGION_HINT_POINTS } from '../src/v4-training.js';

const read = (path) => JSON.parse(readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8'));
const tasks = read('contracts/tasks.json');
const rules = read('contracts/waveform_rules.json');
const standard = read('contracts/standard_nbt47013_3.json');
const specimens = read('contracts/specimens_manifest.json');
const manifest = read('contracts/model_manifest.json');
const cases = read('contracts/cases.json');
const thicknessDoc = read('contracts/thickness.json');
const rubric = read('contracts/rubric.json');
const scenes = read('knowledge/scenes.json');
const inspection = read('knowledge/inspection.json');
const makeWave = (specs) => createWaveform({ rules, manifest, dampingCycles: scenes.teaching_settings.lab.damping_cycles,
  scenarios: inspection.scenarios, specimens: specs });
const scenario = inspection.scenarios[0];
const lib = createCaselib({ cases, rules, standard, specimens, makeWave, scenario });
const thick = createThickness({ doc: thicknessDoc, cases, rules, standard, specimens, makeWave, scenario, createCaselib });
const taskcard = createTaskcard({ tasks, rules, standard, specimens, manifest, thickness: thicknessDoc });
const scoring = createDetectionScoring({ rubric, files: { waveform_rules: rules, standard,
  specimens_manifest: specimens, model_manifest: manifest, practice_doc: read('knowledge/practice.json') } });

const caseForTask = (task) => task.case ? lib.libraryCase(task.case) : thick.libraryCase(task.thickness);
function prepare(task, extra = {}) {
  const cs = caseForTask(task);
  const t = cs.plate.dims.thickness.value;
  const card = makeReferenceCard(taskcard, task, t);
  const blockId = thicknessDoc.blocks.find((b) => String(b.row_no) === card.reference_block)?.specimen_id || rules.practice.dac.specimen;
  const block = specimens.specimens[blockId] || thick.block(blockId);
  const points = blockId === rules.practice.dac.specimen
    ? block.holes.map((h) => ({ id: h.id, S: h.S_mm, G: rules.practice.acceptance_values.dac_G_dB[String(h.S_mm)] }))
    : thick.dacOf(blockId);
  const input = { done: {}, inst: {}, plates: { [cs.specimen_id]: { scan: { trail: [], found: [], cells: new Set() }, quant: { results: {} } } },
    ...extra };
  const prepared = presetDetectionPractice({ prac: input, rules, standard, taskcard, task,
    thickness_mm: t, dacPoints: points, blockSpecimen: block, caseSpecimenId: cs.specimen_id });
  return { ...prepared, input, cs, t, blockId };
}

function scoringInput(cs, level = 'II') {
  const context = (cs.plate.dims.thickness.value === 50 ? lib : thick.caseGen(cs.plate.dims.thickness.value)).scoringContext(cs);
  const results = Object.fromEntries(Object.entries(context.displays).map(([id, display]) => [id,
    { length: display.reference_mm.length, area: display.reference_mm.area_mm2, eq: display.reference_eq_dB }]));
  const expected = context.expected[level];
  return {
    prac: { plates: { [context.specimen_id]: { scan: { trail: [[0, 0]],
      found: context.defects.map((id) => ({ id, confirmed: true, flags: [] })) }, quant: { results } } },
      eval: { level, verdicts: Object.fromEntries(context.defects.map((id) => [id, expected[id]])),
        plate: context.expected.plate_grade, conclusion: expected.pass ? 'accept' : 'reject' } },
    events: [{ name: 'practice:evaluate', payload: { self_consistent: true } }],
    coverage: { [context.specimen_id]: { edge: 1, middle: 1 } }, case: context,
  };
}

test('all 18 existing tasks receive a complete standard-valid reference card using the actual 2.5 MHz / 14 mm single probe', () => {
  for (const task of taskcard.list()) {
    const t = taskcard.plateThickness(task);
    const card = makeReferenceCard(taskcard, task);
    assert.equal(taskcard.parse(card).ok, true, task.id);
    assert.equal(taskcard.check(card, t, task.level).ok, true, task.id);
    assert.equal(card.probe_type, 'single'); assert.equal(card.frequency_MHz, 2.5); assert.equal(card.element_mm, 14);
    assert.equal(card.reference_block, t === 30 ? '1' : t === 80 ? '3' : '2');
    assert.equal(card.edge_zone_mm, t === 80 ? 75 : 50);
    assert.equal(card.spacing_mm, 50); assert.equal(card.scan_plus_dB, 6); assert.equal(card.compensation_dB, 0);
  }
});

test('all task preparations use complete correct-block DAC data and retain real numeric calibration and sensitivity', () => {
  for (const task of taskcard.list()) {
    const p = prepare(task);
    assert.deepEqual(p.prac.calib.points, { B1: 25, B2: 50 });
    assert.equal(p.instrument.velocity_m_s, 5900); assert.equal(p.instrument.zero_us, 0.4);
    assert.equal(p.prac.sens.scan - p.prac.sens.base, 6);
    assert.equal(p.instrument.gain_dB, p.prac.sens.scan);
    assert.equal(p.prac.sens.base, p.t === 30 ? 30.28 : p.t === 80 ? 48.32 : 37.63);
    assert.equal(p.prac.dac.points.length, p.t === 80 ? 5 : 3);
    assert.ok(p.prac.dac.points.every((q) => q.preset && q.automatic && Number.isFinite(q.x) && Number.isFinite(q.y)));
    assert.ok(p.instrument.range_mm >= 2 * p.t);
    assert.ok(p.instrument.gate_start_mm > 0 && p.instrument.gate_start_mm + p.instrument.gate_width_mm < p.t);
    assert.equal(p.instrument.reject_percent, 0); assert.equal(p.instrument.coupling, 'good');
    assert.equal(p.prac.step, 'scan'); assert.equal(p.prac.asmDone, true);
    assert.deepEqual(p.prac.done, { calibrate: true, dac: true, sensitivity: true });
    assert.deepEqual(p.prac.plates[p.cs.specimen_id].scan.found, []);
    assert.equal(p.presetEvent.name, 'practice:system_preset'); assert.equal(p.presetEvent.payload.source, 'system');
  }
});

test('incorrect design card never controls detection and preparation does not mutate caller data', () => {
  const task = taskcard.task('T15');
  const wrong = { reference_block: '2', scan_plus_dB: -50, compensation_dB: -10, level: 'IV' };
  const p = prepare(task, { card: wrong, inst: { gain_dB: 0, zero_us: 3, reject_percent: 50 } });
  assert.equal(p.input.card, wrong); assert.equal(p.input.inst.gain_dB, 0); assert.deepEqual(p.input.done, {});
  assert.equal(p.prac.card, undefined); assert.equal(p.prac.presetCard.reference_block, '3');
  assert.equal(p.prac.sens.base, 48.32); assert.equal(p.instrument.gain_dB, 54.32);
  assert.equal(p.prac.presetCard.level, 'II');
});

test('80 mm reference DAC detects a deep known defect that lies beyond a wrong CBII-2 DAC range', () => {
  const p = prepare(taskcard.task('T15'));
  const work = { ...specimens, runtime_specimens: { ...specimens.runtime_specimens, ...thick.blocks(), [p.cs.specimen_id]: p.cs.plate } };
  const wave = makeWave(work);
  const procedure = createProcedure({ rules, wave, specimens: work, standard });
  const deep = p.cs.plate.defects.find((d) => d.depth_mm > 45 && p.cs.reference.items.find((it) => it.id === d.id)?.determined);
  assert.ok(deep);
  const state = { ...Object.fromEntries(Object.entries(rules.controls).map(([key, control]) => [key, control.default])),
    scene: scenario.id, ...scenario.defaults, ...p.instrument,
    defects: [], probe_x_mm: deep.centre_mm[0], probe_y_mm: deep.centre_mm[1], gain_dB: p.prac.sens.base };
  const criterion = procedure.criteria(state, p.prac.dac.points, p.prac.sens.base);
  assert.equal(criterion.defect, deep.id); assert.ok(criterion.flags.includes('F1_over_dac'));
});

test('detection rubric is exactly 100, excludes all instrument preparation and retains student evidence dependencies', () => {
  const derived = deriveDetectionRubric(rubric);
  assert.deepEqual(derived.items.map((it) => [it.id, it.points]), [['scan', 28], ['detect', 27], ['quantify', 18], ['evaluate', 18], ['conduct', 9]]);
  assert.equal(derived.items.reduce((sum, it) => sum + it.points, 0), 100);
  assert.deepEqual(derived.items[0].requires, []);
  assert.deepEqual(derived.items.find((it) => it.id === 'detect').requires, ['scan']);
  assert.deepEqual(derived.items.find((it) => it.id === 'quantify').requires, ['detect']);
  assert.deepEqual(derived.items.find((it) => it.id === 'evaluate').requires, ['quantify']);
  assert.equal(rubric.items.length, 9); assert.equal(rubric.items[0].points, 5);
});

test('all existing 50 / 30 / 80 mm cases can reach 100 without any assembly/calibration/DAC/sensitivity student events', () => {
  const all = [...lib.library().map((e) => lib.libraryCase(e.id)), ...thick.library().map((e) => thick.libraryCase(e.id))];
  assert.equal(all.length, cases.library.cases.length + thicknessDoc.library.length);
  for (const cs of all) {
    const result = scoring.score(scoringInput(cs));
    assert.equal(result.total, 100, cs.library_id); assert.equal(result.max, 100);
    assert.deepEqual(result.items.map((it) => it.id), ['scan', 'detect', 'quantify', 'evaluate', 'conduct']);
    assert.ok(result.items.every((it) => it.valid));
  }
});

test('system preparation cannot create student detection or evaluation evidence', () => {
  const input = scoringInput(lib.libraryCase('01'));
  input.prac.plates[input.case.specimen_id].scan.trail = [];
  input.prac.plates[input.case.specimen_id].scan.found = [];
  input.prac.plates[input.case.specimen_id].quant.results = {};
  input.events = [{ name: 'practice:system_preset', payload: { preset: true } }];
  const result = scoring.score(input);
  assert.equal(result.total, 9);
  assert.equal(result.items.find((it) => it.id === 'scan').valid, false);
  assert.equal(result.items.find((it) => it.id === 'detect').status, 'basis_invalid');
});

test('automatic reference marks and unconfirmed entries cannot earn detection points', () => {
  const input = scoringInput(lib.libraryCase('01'));
  const found = input.prac.plates[input.case.specimen_id].scan.found;
  assert.ok(found.length > 0);
  found.forEach((f) => { f.confirmed = false; });
  const result = scoring.score(input);
  assert.equal(result.items.find((it) => it.id === 'detect').points, 0);
  assert.ok(result.items.find((it) => it.id === 'quantify').parts.every((p) => p.points === 0));
});

test('missed known indication and wrong measurements lose their corresponding detection and quantification points', () => {
  const input = scoringInput(lib.libraryCase('01'));
  const plate = input.prac.plates[input.case.specimen_id];
  const missed = plate.scan.found.pop().id;
  const remaining = Object.keys(plate.quant.results).find((id) => id !== missed);
  if (remaining) {
    Object.assign(plate.quant.results[remaining], { length: 10000, area: 1000000, eq: 1000 });
  }
  const result = scoring.score(input);
  assert.ok(result.items.find((it) => it.id === 'detect').points < 27);
  assert.ok(result.items.find((it) => it.id === 'quantify').points < 18);
  assert.equal(result.items.find((it) => it.id === 'evaluate').parts.find((p) => p.id === `verdict_${missed}`).status, 'basis_invalid');
});

test('a wrong student verdict, plate grade and conclusion reduce evaluation while saturation remains a conduct error', () => {
  const input = scoringInput(lib.libraryCase('01'));
  for (const id of input.case.defects) input.prac.eval.verdicts[id] = 'wrong';
  input.prac.eval.plate = 'wrong'; input.prac.eval.conclusion = 'wrong';
  input.events.push({ name: 'practice:record_blocked', payload: { reason: 'saturated' } });
  const result = scoring.score(input);
  assert.equal(result.items.find((it) => it.id === 'evaluate').points, 0);
  assert.equal(result.items.find((it) => it.id === 'conduct').points, 8);
});

test('system preset instrument events do not deduct student conduct points', () => {
  const input = scoringInput(lib.libraryCase('01'));
  input.events.unshift({ name: 'practice:calib_done', payload: { preset: true } },
    { name: 'instrument:velocity', payload: { preset: true } }, { name: 'instrument:zero', payload: { preset: true } },
    { name: 'assembly:error', payload: { preset: true } });
  assert.equal(scoring.score(input).total, 100);
});

test('each detection step with the operation guide shown takes GUIDE_TIP_POINTS off once', () => {
  const input = scoringInput(lib.libraryCase('01'));
  input.prac.tips = [{ step: 'scan' }, { step: 'quantify' }, { step: 'scan' }];
  const result = scoring.score(input);
  assert.equal(result.total, 100 - 2 * GUIDE_TIP_POINTS);
  assert.equal(result.tip_deduction, 2 * GUIDE_TIP_POINTS);
  assert.deepEqual(result.items.at(-1), { id: 'tips', points: -2 * GUIDE_TIP_POINTS, max: 0, status: 'deduct', valid: true, parts: [] });
  input.prac.tips = [];
  assert.equal(scoring.score(input).items.length, 5);
});

test('each region hint use takes REGION_HINT_POINTS off and stacks with guide tips', () => {
  const input = scoringInput(lib.libraryCase('01'));
  input.prac.hints = [{ id: 'A' }, { id: 'B' }];
  input.prac.tips = [{ step: 'scan' }];
  const result = scoring.score(input);
  assert.equal(result.hint_deduction, 2 * REGION_HINT_POINTS);
  assert.equal(result.tip_deduction, GUIDE_TIP_POINTS);
  assert.equal(result.total, 100 - GUIDE_TIP_POINTS - 2 * REGION_HINT_POINTS);
  assert.ok(result.items.some((it) => it.id === 'hints' && it.points === -2 * REGION_HINT_POINTS));
});

test('every existing library entry is selectable once with a controlled random draw', () => {
  const count = lib.library().length + thick.library().length;
  const selected = new Set();
  for (let index = 0; index < count; index++) {
    const result = drawLibraryCase({ caselib: lib, thickness: thick, rng: () => (index + 0.5) / count });
    assert.equal(result.reused, false); assert.ok(result.case.plate);
    assert.equal(result.case.library_id, result.selection.id);
    selected.add(`${result.selection.source}:${result.selection.id}`);
  }
  assert.equal(selected.size, count);
});

test('resuming preserves exact case and does not draw again; exclusions and invalid random values are explicit', () => {
  const cs = lib.libraryCase('01');
  const resumed = drawLibraryCase({ caselib: lib, thickness: thick, currentCase: cs, rng: () => { throw new Error('Must not draw on resume'); } });
  assert.equal(resumed.case, cs); assert.equal(resumed.reused, true);
  const drawn = drawLibraryCase({ caselib: lib, thickness: thick, excludeIds: ['01'], rng: () => 0 });
  assert.notEqual(drawn.selection.id, '01');
  assert.throws(() => drawLibraryCase({ caselib: lib, rng: () => 1 }), /Random value/);
});
