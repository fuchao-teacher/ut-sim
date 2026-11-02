// Run: node --test tools/v3_learning_policy.test.mjs. Storage is replaced in memory only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { learningHelpAllowed, validationCaseIds, measuredBoundaryState } from '../src/learning-policy.js';
import { createWaveform } from '../src/waveform.js';
import { createCaselib } from '../src/caselib.js';
import { createScoring } from '../src/scoring.js';
import { createSessionStore } from '../src/session.js';

const json = (path) => JSON.parse(readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8'));
const cases = json('contracts/cases.json');
const rules = json('contracts/waveform_rules.json');
const standard = json('contracts/standard_nbt47013_3.json');
const specimens = json('contracts/specimens_manifest.json');
const manifest = json('contracts/model_manifest.json');
const scenes = json('knowledge/scenes.json');
const scenario = json('knowledge/inspection.json').scenarios[0];
const rubric = json('contracts/rubric.json');
const makeWave = (sp) => createWaveform({
  rules, manifest, scenarios: [scenario], specimens: sp,
  dampingCycles: scenes.teaching_settings.lab.damping_cycles,
});
const library = createCaselib({ cases, rules, standard, specimens, makeWave, scenario });
const scoring = createScoring({ rubric, files: {
  waveform_rules: rules, standard, specimens_manifest: specimens,
  model_manifest: manifest, practice_doc: json('knowledge/practice.json'),
} });
const P = rules.practice;
const AV = P.acceptance_values;

test('teacher and student guided tasks retain help within the scoring context', () => {
  for (const role of ['teacher', 'student']) {
    assert.equal(learningHelpAllowed({ exam: true, taskOn: true,
      learning: { role, route: 'task', taskMode: 'guided' } }), true, role);
  }
  assert.equal(learningHelpAllowed({ exam: false, taskOn: false,
    learning: { role: 'student', route: 'inspection' } }), true);
});

test('independent tasks and stand-alone assessment hide learning help', () => {
  // main.js enters every task with both taskOn=true and exam=true.
  for (const role of ['teacher', 'student', 'exam']) {
    assert.equal(learningHelpAllowed({ exam: true, taskOn: true,
      learning: { role, route: 'task', taskMode: 'independent' } }), false, role);
    assert.equal(learningHelpAllowed({ exam: true, taskOn: false,
      learning: { role, route: 'assessment', taskMode: 'guided' } }), false, role);
  }
  assert.equal(learningHelpAllowed({ exam: true, taskOn: true,
    learning: { role: 'exam', taskMode: 'guided' } }), false);
  assert.equal(learningHelpAllowed({ exam: true, taskOn: true, learning: {} }), false);
});

test('default independent validation selects basic cases 02 through 06 and excludes demo 01', () => {
  const before = JSON.stringify(cases);
  assert.deepEqual(validationCaseIds(cases), ['02', '03', '04', '05', '06']);
  assert.ok(validationCaseIds(cases).every((id) =>
    cases.library.cases.find((entry) => entry.id === id)?.template === 'basic'));
  assert.equal(JSON.stringify(cases), before);
});

test('validation selection handles an absent library and a library without basic cases', () => {
  assert.deepEqual(validationCaseIds(), []);
  assert.deepEqual(validationCaseIds({}), []);
  assert.deepEqual(validationCaseIds({ library: { cases: [
    { id: 'demo', template: 'standard' }, { id: 'other', template: 'standard' },
  ] } }), ['other']);
});

test('actual case codes allocate eligible cases deterministically by student number', () => {
  const ids = validationCaseIds(cases);
  const code = library.encodeLibrary(ids);
  const decoded = library.decode(code);
  assert.equal(decoded.ok, true);
  assert.equal(decoded.template_id, cases.library.id);
  assert.deepEqual(library.libraryIds(decoded.code_seed), ids);
  const assigned = new Set();
  for (const studentNo of ['20220001', '20220002', '20220003', '20220004', '20220005', '20220006']) {
    const first = library.fromCode(code, studentNo);
    const repeated = library.fromCode(code, studentNo);
    assert.equal(first.ok, true, studentNo);
    assert.equal(first.failed, undefined, studentNo);
    assert.ok(ids.includes(first.library_id), studentNo);
    assert.notEqual(first.library_id, '01');
    assert.deepEqual(repeated, first, studentNo);
    assigned.add(first.library_id);
  }
  // Hash allocation may collide; it must not collapse all students to the demonstration.
  assert.ok(assigned.size > 1);
});

function completeCase(cs, context) {
  const expected = context.expected.IV;
  return {
    case: context,
    prac: {
      done: { calibrate: true, dac: true, sensitivity: true, scan: true, quantify: true, evaluate: true },
      calib: { points: { ...P.calibration.targets_mm } },
      dac: { points: specimens.specimens[P.dac.specimen].holes.map((hole) => ({
        id: hole.id, S: hole.S_mm, G: AV.dac_G_dB[String(hole.S_mm)],
      })) },
      sens: { base: AV.G_base_dB, scan: AV.G_scan_dB },
      plates: { [context.specimen_id]: {
        scan: { trail: [[0, 0], [0, 1]], found: cs.reference.items.map((entry) => ({
          id: entry.id, flags: entry.flags || [], confirmed: true,
        })) },
        quant: { results: Object.fromEntries(Object.entries(context.displays).map(([id, display]) => [id, {
          length: display.reference_mm.length, area: display.reference_mm.area_mm2, eq: display.reference_eq_dB,
        }])) },
      } },
      eval: {
        level: 'IV', verdicts: Object.fromEntries(context.defects.map((id) => [id, expected[id]])),
        plate: context.expected.plate_grade, conclusion: expected.pass ? 'accept' : 'reject',
      },
    },
    events: ['assembly:done', 'practice:calib_done', 'practice:dac_done', 'practice:sensitivity']
      .map((name) => ({ name, payload: {} }))
      .concat([{ name: 'practice:evaluate', payload: { correct: true, self_consistent: true } }]),
    coverage: { [context.specimen_id]: { edge: 1, middle: 0.95 } },
  };
}

test('every default validation case supplies a usable actual scoring context', () => {
  for (const id of validationCaseIds(cases)) {
    const cs = library.libraryCase(id);
    assert.ok(cs && !cs.failed, id);
    const context = library.scoringContext(cs);
    assert.equal(context.case_id, cs.case_id, id);
    assert.equal(context.specimen_id, cs.specimen_id, id);
    assert.deepEqual(context.defects, cs.plate.defects.map((defect) => defect.id), id);
    assert.ok(Object.keys(context.displays).length > 0, id);
    const data = completeCase(cs, context);
    const before = JSON.stringify(data);
    const result = scoring.score(data);
    assert.equal(result.total, 100, id);
    assert.equal(result.self_consistent, true, id);
    assert.ok(result.items.every((item) => item.points === item.max && item.status === 'ok'), id);
    assert.equal(JSON.stringify(data), before, id);
  }
});

test('boundary status distinguishes unfinished, recorded and successfully verified measurements', () => {
  const passed = { judge: { length: true, area: true, equivalent: true } };
  assert.equal(measuredBoundaryState(null, 4), 'open');
  assert.equal(measuredBoundaryState(undefined, 0), 'open');
  assert.equal(measuredBoundaryState(passed, 3), 'open');
  assert.equal(measuredBoundaryState({ judge: { length: true, area: false } }, 4), 'recorded');
  assert.equal(measuredBoundaryState({ judge: {} }, 4), 'recorded');
  assert.equal(measuredBoundaryState({}, 4), 'recorded');
  assert.equal(measuredBoundaryState({ judge: { length: 'true' } }, 4), 'recorded');
  assert.equal(measuredBoundaryState(passed, 4), 'verified');
  assert.equal(measuredBoundaryState(passed, 8), 'verified');
  assert.equal(measuredBoundaryState(passed, 4, 5), 'open');
});

test('actual V5.1 session store never reads, overwrites, resumes or clears V1/V2/V3/V4/V5 keys', () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const meta = { build_id: 'v5-policy-test', knowledge_version: 'k5', contracts_version: 'c5' };
  const memory = new Map();
  const touched = [];
  const oldKeys = new Map();
  for (const prefix of ['ut.session.', 'ut.v2.session.', 'ut.v3.session.', 'ut.v4.session.', 'ut.v5.session.']) {
    for (const mode of ['train', 'exam', 'task']) {
      const value = JSON.stringify({
        header: { schema_version: 'ut-session/1', mode, ...meta, session_id: prefix + mode },
        log: [], state: { legacy: prefix }, saved_at: 1,
      });
      oldKeys.set(prefix + mode, value);
      memory.set(prefix + mode, value);
    }
    oldKeys.set(prefix + 'probe', 'existing probe value');
    memory.set(prefix + 'probe', 'existing probe value');
  }
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem(key) { touched.push(['get', key]); return memory.get(key) ?? null; },
    setItem(key, value) { touched.push(['set', key]); memory.set(key, String(value)); },
    removeItem(key) { touched.push(['remove', key]); memory.delete(key); },
  } });
  try {
    const time = { perf: 0, wall: Date.UTC(2026, 9, 6) };
    const options = { meta, stateOf: (mode) => ({ mode, progress: 'saved' }),
      clock: () => time.wall, perf: () => time.perf };
    const store = createSessionStore(options);
    assert.equal(store.available, true);
    for (const mode of ['train', 'exam', 'task']) {
      assert.equal(store.load(mode), null);
      const live = store.begin(mode, {
        student: { student_no: '20220001' }, initial: { inst: {}, probe: {} },
        specimens: [], probe: {}, kase: { case_id: 'validation-case', template_id: 'basic' },
      });
      time.perf += 1000;
      assert.equal(store.save(mode), true);
      const saved = store.load(mode);
      assert.equal(saved.header.session_id, live.header.session_id);
      assert.equal(saved.header.case_id, 'validation-case');
      assert.deepEqual(saved.state, { mode, progress: 'saved' });
      assert.ok(memory.has(`ut.m11.session.${mode}`));
    }
    const saved = store.load('task');
    time.wall += 60000;
    const reloaded = createSessionStore(options);
    const { session, gap_s } = reloaded.resume('task', reloaded.load('task'));
    assert.equal(session.header.session_id, saved.header.session_id);
    assert.equal(session.header.interruptions, 1);
    assert.equal(gap_s, 60);
    reloaded.save('task');
    store.clear('exam');
    assert.equal(memory.has('ut.m11.session.exam'), false);
    assert.ok(store.load('train'));
    assert.ok(reloaded.load('task'));
    store.clear('train');
    reloaded.clear('task');
    assert.ok([...memory.keys()].every((key) => !key.startsWith('ut.m11.session.')));
    assert.deepEqual([...memory.entries()], [...oldKeys.entries()]);
    assert.ok(touched.length > 0);
    assert.ok(touched.every(([, key]) => key.startsWith('ut.m11.session.')));
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor);
    else delete globalThis.localStorage;
  }
});
