// V2 regression tests: student confirmation, scoring evidence and stable submitted records.
// Run: node --test tools/v2_assessment.test.mjs (all session storage stays in memory).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSessionStore } from '../src/session.js';
import { createScoring } from '../src/scoring.js';
import { createTaskScoring } from '../src/taskscore.js';
import { createTaskcard } from '../src/taskcard.js';
import { createWaveform } from '../src/waveform.js';
import { createCaselib } from '../src/caselib.js';
import { createThickness } from '../src/thickness.js';
import { parseSession } from '../src/replay.js';

const json = (p) => JSON.parse(readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8'));
const rubric = json('contracts/rubric.json');
const rules = json('contracts/waveform_rules.json');
const specimens = json('contracts/specimens_manifest.json');
const standard = json('contracts/standard_nbt47013_3.json');
const manifest = json('contracts/model_manifest.json');
const tasks = json('contracts/tasks.json');
const files = { waveform_rules: rules, standard, specimens_manifest: specimens,
  model_manifest: manifest, practice_doc: json('knowledge/practice.json') };
const engine = createScoring({ rubric, files });
const P = rules.practice;
const AV = P.acceptance_values;
const plate = P.step_presets.evaluate.specimen;
const item = (r, id) => r.items.find((it) => it.id === id);
const part = (r, id, p) => item(r, id).parts.find((it) => it.id === p);

function memoryStore(meta = { build_id: 'v2-test', knowledge_version: 'k2', contracts_version: 'c2' }) {
  const memory = new Map();
  globalThis.localStorage = {
    getItem: (key) => memory.get(key) ?? null,
    setItem: (key, value) => memory.set(key, String(value)),
    removeItem: (key) => memory.delete(key),
  };
  const time = { perf: 0, wall: Date.UTC(2026, 9, 5) };
  const options = { meta, stateOf: () => ({ progress: 'saved' }), clock: () => time.wall, perf: () => time.perf };
  return { memory, time, options, store: createSessionStore(options) };
}
const initial = () => ({ initial: { inst: {}, probe: {} }, specimens: [], probe: {} });

function perfectExam() {
  const ctx = engine.fixedCase();
  const results = Object.fromEntries(Object.entries(ctx.displays).map(([id, d]) => [id,
    { length: d.reference_mm.length, area: d.reference_mm.area_mm2, eq: d.reference_eq_dB }]));
  const exp = ctx.expected.IV;
  return {
    prac: {
      done: { calibrate: true, dac: true, sensitivity: true, scan: true, quantify: true, evaluate: true },
      calib: { points: { ...P.calibration.targets_mm } },
      dac: { points: specimens.specimens[P.dac.specimen].holes.map((h) => ({ id: h.id, S: h.S_mm, G: AV.dac_G_dB[String(h.S_mm)] })) },
      sens: { base: AV.G_base_dB, scan: AV.G_scan_dB },
      plates: { [plate]: { scan: { trail: [[0, 0], [0, 1]], found: P.grading.reference_items.map((r) => ({ id: r.id, flags: r.flags, confirmed: true })) }, quant: { results } } },
      eval: { level: 'IV', verdicts: Object.fromEntries(ctx.defects.map((id) => [id, exp[id]])), plate: ctx.expected.plate_grade, conclusion: exp.pass ? 'accept' : 'reject' },
    },
    events: ['assembly:done', 'practice:calib_done', 'practice:dac_done', 'practice:sensitivity']
      .map((name) => ({ name, payload: {} }))
      .concat([{ name: 'practice:evaluate', payload: { correct: true, self_consistent: true } }]),
    coverage: { [plate]: { edge: 1, middle: 0.95 } },
  };
}

test('submitted time is frozen across waiting, repeated submission, export and save', () => {
  const { store, time } = memoryStore();
  const s = store.begin('exam', initial());
  time.perf = 10000;
  assert.equal(s.activeMs(), 10000);
  assert.equal(s.submit('2026-10-05T00:00:10.000Z'), true);
  time.perf = 70000;
  assert.equal(s.activeMs(), 10000);
  assert.equal(s.submit('2026-10-05T00:01:10.000Z'), false);
  assert.equal(s.header.submitted_at, '2026-10-05T00:00:10.000Z');
  assert.equal(s.event('practice:mark', {}), false);
  assert.equal(s.frame(plate, 10, 20), false);
  assert.equal(s.event('session:export', { kind: 'log' }), true);
  assert.equal(s.log.at(-1).t_ms, 10000);
  assert.equal(s.toJSON({}).active_ms, 10000);
  store.save('exam');
  assert.equal(store.load('exam').header.active_ms, 10000);
});

test('submitted time remains frozen after reload and another export', () => {
  const { store, time, options } = memoryStore();
  const s = store.begin('task', initial());
  time.perf = 12000;
  s.submit('2026-10-05T00:00:12.000Z');
  store.save('task');
  const saved = store.load('task');
  time.perf = 80000;
  time.wall += 60000;
  const reloaded = createSessionStore(options);
  const { session } = reloaded.resume('task', saved);
  time.perf = 150000;
  assert.equal(session.activeMs(), 12000);
  assert.equal(session.toJSON({}).active_ms, 12000);
  reloaded.save('task');
  assert.equal(reloaded.load('task').header.active_ms, 12000);
});

test('an unfinished session resumes with its saved active time and excludes the reload gap', () => {
  const { store, time, options } = memoryStore();
  const s = store.begin('exam', initial());
  time.perf = 8000;
  store.save('exam');
  const saved = store.load('exam');
  time.perf = 90000;
  time.wall += 60000;
  const { session, gap_s } = createSessionStore(options).resume('exam', saved);
  time.perf += 3000;
  assert.equal(session.activeMs(), 11000);
  assert.equal(session.header.session_id, s.header.session_id);
  assert.equal(session.header.interruptions, 1);
  assert.equal(gap_s, 60);
});

test('V5.1 creates and clears only its own storage namespace while V1/V2/V3/V4/V5 remain intact', () => {
  const { store, memory } = memoryStore();
  memory.set('ut.session.exam', 'original version record');
  memory.set('ut.v2.session.exam', 'V2 version record');
  memory.set('ut.v3.session.exam', 'V3 version record');
  memory.set('ut.v4.session.exam', 'V4 version record');
  memory.set('ut.v5.session.exam', 'V5 version record');
  assert.equal(store.load('exam'), null);
  for (const mode of ['train', 'exam', 'task']) {
    store.begin(mode, initial());
    assert.ok(memory.has(`ut.m11.session.${mode}`));
    assert.equal(store.load(mode).header.mode, mode);
  }
  store.clear('exam');
  assert.equal(memory.has('ut.m11.session.exam'), false);
  assert.equal(memory.get('ut.session.exam'), 'original version record');
  assert.equal(memory.get('ut.v2.session.exam'), 'V2 version record');
  assert.equal(memory.get('ut.v3.session.exam'), 'V3 version record');
  assert.equal(memory.get('ut.v4.session.exam'), 'V4 version record');
  assert.equal(memory.get('ut.v5.session.exam'), 'V5 version record');
  assert.ok(store.load('train'));
  assert.ok(store.load('task'));
});

test('metadata mismatch refuses resume without deleting the saved record; replay marks it as reference', () => {
  const { store, memory, options } = memoryStore();
  const s = store.begin('exam', initial());
  const source = memory.get('ut.m11.session.exam');
  assert.equal(typeof source, 'string');
  for (const key of ['build_id', 'knowledge_version', 'contracts_version']) {
    const meta = { ...options.meta, [key]: 'different version' };
    assert.equal(createSessionStore({ ...options, meta }).load('exam'), null);
    assert.equal(memory.get('ut.m11.session.exam'), source);
    const replay = parseSession(s.toJSON({}), meta);
    assert.equal(replay.ok, true);
    assert.equal(replay.version_match, false);
  }
});

test('all deliberately confirmed reference indications can still earn 100 points', () => {
  const data = perfectExam();
  const before = JSON.stringify(data);
  const result = engine.score(data);
  assert.equal(result.total, 100);
  assert.equal(result.self_consistent, true);
  assert.ok(result.items.every((it) => it.status === 'ok' && it.points === it.max));
  assert.equal(JSON.stringify(data), before);
  assert.deepEqual(engine.score(data), result);
});

test('automatic demonstration entries earn no student detection or downstream evidence', () => {
  const data = perfectExam();
  data.prac.plates[plate].scan.found.forEach((f) => { f.confirmed = false; });
  const result = engine.score(data);
  assert.equal(item(result, 'detect').points, 0);
  for (const id of Object.keys(engine.fixedCase().judged)) {
    assert.equal(part(result, 'quantify', `size_${id}`).status, 'basis_invalid');
    assert.equal(part(result, 'evaluate', `verdict_${id}`).status, 'basis_invalid');
  }
});

test('old records and truthy non-boolean flags are not treated as student confirmations', () => {
  for (const flag of [undefined, 'true', 1]) {
    const data = perfectExam();
    for (const found of data.prac.plates[plate].scan.found) {
      if (flag === undefined) delete found.confirmed;
      else found.confirmed = flag;
    }
    assert.equal(item(engine.score(data), 'detect').points, 0);
  }
});

test('an automatic entry and a deliberate confirmation of the same indication score only once', () => {
  const data = perfectExam();
  const found = data.prac.plates[plate].scan.found;
  found.unshift({ ...found[0], confirmed: false });
  found.push({ ...found[1] });
  assert.equal(item(engine.score(data), 'detect').points, 15);
});

test('a missing student confirmation loses its detection share even if quantification exists', () => {
  const data = perfectExam();
  const ctx = engine.fixedCase();
  const id = Object.keys(ctx.judged)[0];
  data.prac.plates[plate].scan.found.find((f) => f.id === id).confirmed = false;
  const result = engine.score(data);
  assert.equal(item(result, 'detect').points, Math.round((15 - 15 / ctx.defects.length) * 10) / 10);
  assert.equal(part(result, 'quantify', `size_${id}`).status, 'basis_invalid');
  assert.equal(part(result, 'evaluate', `verdict_${id}`).status, 'basis_invalid');
});

test('false-call deductions apply only to the student-confirmed below-criterion indication', () => {
  const id = engine.fixedCase().reference_items.find((r) => r.determined === false).id;
  const confirmed = perfectExam();
  confirmed.prac.eval.verdicts[id] = 'counted';
  const result = engine.score(confirmed);
  assert.equal(part(result, 'detect', 'false_call').points, -rubric.teacher_config.false_call.per_item);
  const automatic = perfectExam();
  automatic.prac.eval.verdicts[id] = 'counted';
  automatic.prac.plates[plate].scan.found.find((f) => f.id === id).confirmed = false;
  assert.equal(part(engine.score(automatic), 'detect', 'false_call').points, 0);
});

test('consistency is independent of missed indications and total correctness', () => {
  const data = perfectExam();
  const id = Object.keys(engine.fixedCase().judged)[0];
  data.prac.plates[plate].scan.found = data.prac.plates[plate].scan.found.filter((f) => f.id !== id);
  data.events.at(-1).payload = { correct: false, self_consistent: true };
  const result = engine.score(data);
  assert.ok(result.total < 100);
  assert.equal(result.self_consistent, true);
  data.events.at(-1).payload = { correct: true, self_consistent: false };
  assert.equal(engine.score(data).self_consistent, false);
});

test('old correctness-only events do not invent a consistency result', () => {
  const data = perfectExam();
  data.events.at(-1).payload = { correct: true };
  assert.equal(engine.score(data).self_consistent, null);
  data.events.at(-1).payload = { correct: true, self_consistent: 'true' };
  assert.equal(engine.score(data).self_consistent, null);
  data.events = data.events.filter((e) => e.name !== 'practice:evaluate');
  assert.equal(engine.score(data).self_consistent, null);
});

const cases = json('contracts/cases.json');
const thickDoc = json('contracts/thickness.json');
const scenes = json('knowledge/scenes.json');
const scenario = json('knowledge/inspection.json').scenarios[0];
const makeWave = (sp) => createWaveform({ rules, manifest, dampingCycles: scenes.teaching_settings.lab.damping_cycles,
  scenarios: [scenario], specimens: sp });
const library = createCaselib({ cases, rules, standard, specimens, makeWave, scenario });
const thickness = createThickness({ doc: thickDoc, cases, rules, standard, specimens, makeWave, scenario, createCaselib });
const taskcard = createTaskcard({ tasks, standard, rules, manifest, specimens, thickness: thickDoc });
const taskEngine = createTaskScoring({ rubric, tasks, files, taskcard });

function perfectTask(t) {
  const cs = t.case ? library.libraryCase(t.case) : thickness.libraryCase(t.thickness);
  const T = cs.plate.dims.thickness.value;
  const ctx = (t.case ? library : thickness.caseGen(T)).scoringContext(cs);
  const ref = taskcard.reference(T, t.level);
  const card = { probe_type: ref.probe_type.includes('single') ? 'single' : ref.probe_type[0],
    frequency_MHz: ref.frequency[0], element_mm: ref.element[0], reference_block: ref.reference_block,
    edge_zone_mm: ref.edge_zone, middle_pattern: 'lines', spacing_mm: ref.scan_plan.lines,
    scan_plus_dB: ref.scan_sensitivity, compensation_dB: ref.compensation, level: t.level };
  const blockId = T === 50 ? P.dac.specimen : thickness.profile(T).block;
  const dac = T === 50 ? specimens.specimens[blockId].holes.map((h) => ({ id: h.id, S: h.S_mm, G: AV.dac_G_dB[String(h.S_mm)] }))
    : thickness.dacOf(blockId).map((p) => ({ id: thickness.block(blockId).holes.find((h) => h.S_mm === p.S).id, S: p.S, G: p.G }));
  const base = dac.at(-1).G;
  const exp = ctx.expected[t.level];
  const data = perfectExam();
  Object.assign(data.prac, { dac: { points: dac }, sens: { base, scan: base + card.scan_plus_dB + card.compensation_dB },
    plates: { [ctx.specimen_id]: { scan: { trail: [[0, 0], [0, 1]], found: ctx.defects.map((id) => ({ id, flags: [], confirmed: true })) },
      quant: { results: Object.fromEntries(Object.entries(ctx.displays).map(([id, d]) => [id,
        { length: d.reference_mm.length, area: d.reference_mm.area_mm2, eq: d.reference_eq_dB }])) } } },
    eval: { level: t.level, verdicts: Object.fromEntries(ctx.defects.map((id) => [id, exp[id]])), plate: ctx.expected.plate_grade, conclusion: exp.pass ? 'accept' : 'reject' }, card });
  Object.assign(data, { case: ctx, card, task: { id: t.id, level: t.level }, thickness_mm: T,
    coverage: { [ctx.specimen_id]: { edge: 1, middle: 0.95 } } });
  return data;
}

test('all 30 / 50 / 80 mm field tasks retain full credit for correct deliberate records', () => {
  for (const t of tasks.tasks.list) {
    const result = taskEngine.score(perfectTask(t));
    assert.equal(result.total, 100, t.id);
    assert.equal(result.self_consistent, true, t.id);
  }
});

test('task scoring inherits the student-confirmation and separate consistency rules', () => {
  const t = tasks.tasks.list.find((x) => x.case);
  const data = perfectTask(t);
  const sid = data.case.specimen_id;
  data.prac.plates[sid].scan.found.forEach((f) => { f.confirmed = false; });
  data.events.at(-1).payload = { correct: false, self_consistent: true };
  const result = taskEngine.score(data);
  assert.equal(item(result, 'detect').points, 0);
  assert.equal(item(result, 'quantify').points, 0);
  assert.equal(result.self_consistent, true);
});
