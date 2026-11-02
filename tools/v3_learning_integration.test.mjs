import fs from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';

// Source-function tests for presentation routing and data-preservation boundaries.
// No renderer, browser, server, or live session storage is started by this file.
const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const main = read('../src/main.js');
const theorySource = read('../src/theory-learning.js');
const theoryDoc = JSON.parse(read('../../knowledge/theory-learning.json'));
const WF = JSON.parse(read('../../knowledge/learning-workflow.json'));

function extract(name, source = main) {
  const start = source.search(new RegExp(`(?:export )?(?:async )?function ${name}\\(`));
  assert.ok(start >= 0, `Missing function ${name}`);
  const open = source.indexOf('{', source.indexOf(')', start));
  let depth = 0, quote = null, line = false, block = false;
  for (let i = open; i < source.length; i++) {
    const c = source[i], next = source[i + 1];
    if (line) { if (c === '\n') line = false; continue; }
    if (block) { if (c === '*' && next === '/') { block = false; i++; } continue; }
    if (quote) { if (c === '\\') i++; else if (c === quote) quote = null; continue; }
    if (c === '/' && next === '/') { line = true; i++; continue; }
    if (c === '/' && next === '*') { block = true; i++; continue; }
    if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
    if (c === '{') depth++;
    if (c === '}' && --depth === 0) return source.slice(start, i + 1).replace(/^export /, '');
  }
  throw new Error(`Unclosed function ${name}`);
}

function bind(names, env, source = main) {
  const entries = Object.entries(env);
  return new Function(...entries.map(([key]) => key), `${names.map((name) => extract(name, source)).join('\n')}\nreturn {${names.join(',')}};`)(...entries.map(([, value]) => value));
}

const indexSource = theorySource.match(/^const stepIndex = (.+);$/m)?.[1];
assert.ok(indexSource, 'Missing theory step-index helper');
const stepIndex = new Function(`return ${indexSource};`)();
const { theoryStateAtStep } = bind(['theoryStateAtStep'], { stepIndex }, theorySource);

function practiceFixture({ role = 'teacher', exam = false, taskOn = false, submitted = false, replay = false, confirm = true } = {}) {
  const calls = [];
  const records = { calib: { points: { B1: 25, B2: 50 } }, dac: { points: [{ id: 'H1', S: 15, G: 24 }] },
    scan: { found: [{ id: 'F1' }] }, quant: { results: { F1: { length: 30 } } }, eval: { result: { conclusion: 'accept' } } };
  const S = { mode: 'practice', study: role === 'teacher' ? 'classroom' : 'self', learning: { role }, exam, taskOn,
    prac: { step: 'quantify', specimen: 'plate', plateId: 'plate', probe: { plate: { x: 1, y: 2 } }, inst: {}, submitted, ...structuredClone(records) },
    insp: { gain_dB: 29, velocity_m_s: 5900, zero_us: 0 }, panel: { frozen: false }, inspCam: 'system' };
  const presets = Object.fromEntries(['calibrate', 'dac', 'sensitivity', 'scan', 'quantify', 'evaluate'].map((id) => [id,
    { specimen: ['calibrate', 'dac'].includes(id) ? id + '-block' : 'plate', calibrated: true, gain: 'default' }]));
  const env = {
    S, WF, STEP_PRESETS: presets, practice: {}, CASE_ID: 'case', CAL_STATE: { velocity_m_s: 5900, zero_us: 0 },
    waveRules: { controls: { gain_dB: { step: 1 } }, practice: { controls: { reject_percent: { default: 0 }, velocity_m_s_initial: 5000, zero_us: { default: 0 } } } },
    replayOn: () => replay, stepOpen: () => true, isPlate: (id) => ['plate', 'case'].includes(id), onCase: () => S.prac.specimen === 'case',
    detectionTraining: () => false, studyFullFlow: () => false,
    presetsOn: () => S.learning.role === 'teacher' && S.study === 'classroom' && !S.exam,
    setSpecimen: (id) => { calls.push(['setSpecimen', id]); S.prac.specimen = id; },
    fillSteps: (id) => calls.push(['fillSteps', id]), clearFrom: (id) => calls.push(['clearFrom', id]),
    presetGain: () => 24, probeStart: () => ({ x: 0, y: 0 }), specT: () => 50,
    showSpecimen: (id) => calls.push(['showSpecimen', id]), setFreeze: () => {}, setInspCamera: () => {},
    emit: (name) => calls.push(['emit', name]), updateCriteria: () => calls.push(['criteria']), renderPanel: () => calls.push(['render']),
    window: { confirm: () => { calls.push(['confirm']); return confirm; } }, inspKey: '',
  };
  return { S, calls, records, ...bind(['setPracticeStep', 'loadStepDemo'], env) };
}

test('teacher ordinary step navigation preserves all recorded calibration and detection data', () => {
  const f = practiceFixture();
  for (const id of ['scan', 'quantify', 'evaluate']) {
    f.setPracticeStep(id);
    assert.equal(f.S.prac.step, id);
    for (const [key, value] of Object.entries(f.records)) assert.deepEqual(f.S.prac[key], value);
  }
  assert.equal(f.calls.some(([name]) => name === 'fillSteps' || name === 'clearFrom'), false);
});

test('ordinary specimen changes also avoid applying reference presets', () => {
  const f = practiceFixture();
  f.setPracticeStep('calibrate');
  f.setPracticeStep('dac');
  assert.deepEqual(f.calls.filter(([name]) => name === 'setSpecimen'), [['setSpecimen', 'calibrate-block'], ['setSpecimen', 'dac-block']]);
  assert.equal(f.calls.some(([name]) => name === 'fillSteps' || name === 'clearFrom'), false);
  assert.deepEqual(f.S.prac.dac, f.records.dac);
});

test('ordinary evaluation keeps a current case plate rather than changing to the preset plate', () => {
  const f = practiceFixture();
  f.S.prac.specimen = 'case';
  f.setPracticeStep('evaluate');
  assert.equal(f.S.prac.specimen, 'case');
  assert.equal(f.calls.some(([name]) => name === 'setSpecimen' || name === 'fillSteps'), false);
});

test('an explicit teacher demonstration load confirms and enters the forced preset branch', () => {
  const f = practiceFixture();
  assert.equal(f.loadStepDemo(), true);
  assert.deepEqual(f.calls.filter(([name]) => name === 'confirm' || name === 'fillSteps'), [['confirm'], ['fillSteps', 'quantify']]);
  assert.equal(f.S.insp.gain_dB, 24);
  assert.ok(f.calls.some(([name]) => name === 'showSpecimen'));
});

test('refusing the demonstration confirmation preserves the data and instrument settings', () => {
  const f = practiceFixture({ confirm: false });
  assert.equal(f.loadStepDemo(), false);
  assert.equal(f.S.insp.gain_dB, 29);
  assert.equal(f.calls.some(([name]) => name === 'fillSteps'), false);
  assert.deepEqual(f.S.prac.quant, f.records.quant);
});

for (const [name, options] of Object.entries({ assessment: { exam: true }, task: { taskOn: true }, submitted: { submitted: true }, replay: { replay: true }, student: { role: 'student' } })) {
  test(`explicit demonstration loading is refused in the ${name} context`, () => {
    const f = practiceFixture(options);
    assert.equal(f.loadStepDemo(), false);
    assert.equal(f.calls.some(([action]) => action === 'confirm' || action === 'fillSteps'), false);
  });
}

function experimentFixture({ role = 'student', scenario = 'plate_clean' } = {}) {
  const calls = [];
  const S = { learning: { role }, insp: { scene: scenario, specimen_id: 'practice-plate', defects: [{ id: 'practice-F' }] }, inspExp: null, inspPrediction: null };
  const defaults = () => ({ ...S.insp, gain_dB: 60, velocity_m_s: 5000, range_mm: 25, zero_us: 3, reject_percent: 15 });
  const env = {
    S, theoryDoc, theoryStateAtStep, inspDefaults: defaults,
    waveRules: { controls: Object.fromEntries(Object.keys(theoryDoc.baseline).map((key) => [key, {}])) },
    setInspScene: (id) => { calls.push(['scene', id]); S.insp.scene = id; S.inspPrediction = null; S.inspExp = null; },
    insp: { reset: () => calls.push(['reset']) }, resetPanel: () => calls.push(['resetPanel']),
    setInsp: (key, value) => { S.insp[key] = value; }, applyInspCoupling: () => {}, updateSteelSection: () => {}, inspKey: '',
    inspPulse: () => calls.push(['pulse']), inspContinuous: (on) => calls.push(['continuous', on]),
    onInspPhase: (phase) => calls.push(['phase', phase]), renderInspExp: () => calls.push(['render']),
  };
  return { S, calls, ...bind(['runExperiment'], env) };
}

test('the pulse-cycle experiment starts before firing and does not emit a pulse', () => {
  const f = experimentFixture();
  f.runExperiment('exp__pulse_cycle', 0);
  assert.deepEqual(f.S.inspExp, { id: 'exp__pulse_cycle', step: 0 });
  assert.equal(f.calls.some(([name]) => name === 'pulse' || name === 'continuous'), false);
  assert.ok(f.calls.some(([name, phase]) => name === 'phase' && phase === 'IDLE'));
});

test('students cannot advance to a comparison without making a prediction', () => {
  const f = experimentFixture();
  f.runExperiment('exp__pulse_cycle', 0);
  const count = f.calls.length;
  f.runExperiment('exp__pulse_cycle', 1);
  assert.equal(f.S.inspExp.step, 0);
  assert.equal(f.calls.length, count);
});

test('a valid prediction allows the firing comparison and is retained on the same experiment', () => {
  const f = experimentFixture();
  f.runExperiment('exp__pulse_cycle', 0);
  f.S.inspPrediction = 'acoustic_roundtrip';
  f.runExperiment('exp__pulse_cycle', 1);
  assert.equal(f.S.inspPrediction, 'acoustic_roundtrip');
  assert.equal(f.S.inspExp.step, 1);
  assert.equal(f.calls.filter(([name]) => name === 'pulse').length, 1);
  f.runExperiment('exp__pulse_cycle', 0);
  assert.equal(f.S.inspPrediction, 'acoustic_roundtrip');
});

test('changing experiments clears a previous prediction even when both share one scenario', () => {
  const f = experimentFixture();
  f.runExperiment('exp__pulse_cycle', 0);
  f.S.inspPrediction = 'acoustic_roundtrip';
  f.runExperiment('exp__gain', 0);
  assert.equal(f.S.inspPrediction, null);
  assert.equal(f.S.inspExp.id, 'exp__gain');
  f.runExperiment('exp__gain', 1);
  assert.equal(f.S.inspExp.step, 0);
});

test('a previous prediction cannot authorize direct entry into another experiment comparison', () => {
  const f = experimentFixture();
  f.runExperiment('exp__pulse_cycle', 0);
  f.S.inspPrediction = 'acoustic_roundtrip';
  f.runExperiment('exp__gain', 1);
  assert.equal(f.S.inspPrediction, null);
  assert.equal(f.S.inspExp.id, 'exp__pulse_cycle');
  assert.equal(f.S.inspExp.step, 0);
});

test('teachers can run a comparison directly without a student prediction', () => {
  const f = experimentFixture({ role: 'teacher' });
  f.runExperiment('exp__pulse_cycle', 1);
  assert.equal(f.S.inspExp.step, 1);
  assert.equal(f.calls.filter(([name]) => name === 'pulse').length, 1);
});

test('experiment step input is clamped and unknown experiments leave the current view intact', () => {
  const f = experimentFixture({ role: 'teacher' });
  f.runExperiment('exp__pulse_cycle', 99);
  assert.equal(f.S.inspExp.step, 1);
  f.runExperiment('exp__pulse_cycle', -2);
  assert.equal(f.S.inspExp.step, 0);
  const before = structuredClone(f.S);
  f.runExperiment('unknown', 0);
  assert.deepEqual(f.S, before);
});

test('the theory state clears practice specimen overrides and restores the stated comparison baseline', () => {
  const experiment = theoryDoc.experiments.find((item) => item.id === 'exp__velocity');
  const old = { specimen_id: 'practice-plate', defects: [{ id: 'practice-F' }], thickness_mm: 80, zero_us: 3, reject_percent: 15, gain_dB: 60 };
  const result = theoryStateAtStep(experiment, old, 1, theoryDoc.baseline);
  assert.equal(result.specimen_id, null);
  assert.equal(result.defects, null);
  assert.equal(result.scene, experiment.scenario);
  assert.equal(result.thickness_mm, 50);
  assert.equal(result.zero_us, 0);
  assert.equal(result.reject_percent, 0);
  assert.equal(result.gain_dB, theoryDoc.baseline.gain_dB);
  assert.equal(result.velocity_m_s, 3000);
  assert.equal(old.specimen_id, 'practice-plate');
});

test('the live experiment applies the same theory cleanup before running comparison pulses', () => {
  const f = experimentFixture({ role: 'teacher' });
  f.runExperiment('exp__gain', 1);
  assert.equal(f.S.insp.specimen_id, null);
  assert.equal(f.S.insp.defects, null);
  assert.equal(f.S.insp.zero_us, 0);
  assert.equal(f.S.insp.gain_dB, 30);
});

function routeFixture({ teacherUnlocked = true } = {}) {
  const calls = [];
  const S = { learning: { role: null, route: null, taskMode: 'guided', student: {} }, study: 'self', mode: 'equipment', exam: false, taskOn: false, task: { cards: {} } };
  const env = {
    S, WF, practice: {}, assembly: {}, document: { body: { dataset: {} } },
    store: { get: () => null, clear: (mode) => calls.push(['clear', mode]) },
    replayOn: () => false, exitReplay() {}, closeStdPage() {}, closeTaskPage() {}, closeReport() {},
    updateVisibility() {}, refreshMaterials() {},
    setStudy: (mode) => { S.study = mode; }, swapContext: (exam) => { S.exam = exam; S.taskOn = false; calls.push(['context', exam]); },
    setMode: async (mode, options) => { S.mode = mode; calls.push(['mode', mode, options]); },
    MAIN_SCENES: [{ id: 'scene__backing', part_id: 'probe__backing' }, { id: 'scene__piezo', part_id: 'probe__active_element' }],
    startScene: (id) => calls.push(['scene', id]), theoryDoc, runExperiment: (id) => calls.push(['experiment', id]),
    learningShell: { teacherUnlocked: () => teacherUnlocked, update: (state) => calls.push(['shell', state.route]) }, $: () => ({ open: true }),
  };
  return { S, calls, ...bind(['launchLearning'], env) };
}

test('teacher and student principle entry opens the active-element scene immediately', async () => {
  for (const role of ['teacher', 'student']) {
    const f = routeFixture();
    assert.equal(await f.launchLearning({ role, route: 'principle' }), true);
    assert.equal(f.S.mode, 'physics');
    assert.deepEqual(f.calls.filter(([name]) => name === 'scene'), [['scene', 'scene__piezo']]);
    assert.equal(f.S.study, role === 'teacher' ? 'classroom' : 'self');
  }
});

test('parameter-verification entry opens the first short experiment', async () => {
  const f = routeFixture();
  assert.equal(await f.launchLearning({ role: 'student', route: 'inspection' }), true);
  assert.equal(f.S.mode, 'inspection');
  assert.deepEqual(f.calls.filter(([name]) => name === 'experiment'), [['experiment', theoryDoc.experiments[0].id]]);
});

test('teacher preparation enters the working bench outside assessment and task contexts', async () => {
  const f = routeFixture();
  assert.equal(await f.launchLearning({ role: 'teacher', route: 'preparation' }), true);
  assert.equal(f.S.mode, 'equipment');
  assert.equal(f.S.exam, false);
  assert.equal(f.S.taskOn, false);
  assert.deepEqual(f.calls.filter(([name]) => name === 'mode'), [['mode', 'equipment', { force: true }]]);
});

test('the preparation route is refused for a student role', async () => {
  const f = routeFixture();
  assert.equal(await f.launchLearning({ role: 'student', route: 'preparation' }), false);
  assert.equal(f.calls.some(([name]) => name === 'mode'), false);
});

test('all teacher topic routes are refused until this shell has accepted the teacher password', async () => {
  for (const route of ['equipment', 'principle', 'inspection', 'fullscan', 'task', 'preparation']) {
    const f = routeFixture({ teacherUnlocked: false });
    assert.equal(await f.launchLearning({ role: 'teacher', route }), false, route);
    assert.deepEqual(f.calls, [], route);
    assert.equal(f.S.learning.role, null);
    assert.equal(f.S.learning.route, null);
  }
});

test('preparation rendering is selected only for the teacher preparation bench', () => {
  for (const options of [{ role: 'teacher', route: 'preparation', exam: false, taskOn: false, expected: 'preparation' },
    { role: 'student', route: 'preparation', exam: false, taskOn: false, expected: 'equipment' },
    { role: 'teacher', route: 'preparation', exam: true, taskOn: false, expected: 'exam' },
    { role: 'teacher', route: 'equipment', exam: false, taskOn: false, expected: 'equipment' }]) {
    const calls = [];
    const S = { mode: 'equipment', selected: null, learning: options, exam: options.exam, taskOn: options.taskOn };
    const { renderPanel } = bind(['renderPanel'], { S, $: () => null, panel: { innerHTML: '', scrollTop: 2 },
      renderTeachingPreparation: () => calls.push('preparation'), renderEquipmentPanel: () => calls.push('equipment'), renderExamBench: () => calls.push('exam') });
    renderPanel();
    assert.deepEqual(calls, [options.expected]);
  }
});
