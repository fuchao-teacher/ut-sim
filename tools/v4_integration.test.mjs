import fs from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { createTaskcard } from '../src/taskcard.js';
import { createWaveform } from '../src/waveform.js';
import { createCaselib } from '../src/caselib.js';
import { createThickness } from '../src/thickness.js';
import { makeReferenceCard, presetDetectionPractice } from '../src/v4-training.js';
import { detectionCaseSummary } from '../src/v5-practice.js';

// Execute the application wiring functions against small state / side-effect
// fixtures. These checks do not launch a renderer, browser, or local server.
const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const main = read('../src/main.js');
const json = (path) => JSON.parse(read(`../../${path}`));
const tasks = json('contracts/tasks.json');
const rules = json('contracts/waveform_rules.json');
const standard = json('contracts/standard_nbt47013_3.json');
const specimens = json('contracts/specimens_manifest.json');
const manifest = json('contracts/model_manifest.json');
const thickness = json('contracts/thickness.json');
const taskcard = createTaskcard({ tasks, rules, standard, specimens, manifest, thickness });
const taskText = json('knowledge/task.json');
const V4 = json('knowledge/v4.json');
const practiceText = json('knowledge/practice.json');
const workflowText = json('knowledge/learning-workflow.json');
const cases = json('contracts/cases.json');
const inspection = json('knowledge/inspection.json');
const CASE_ID = cases.plate.specimen_id;
const scenes = json('knowledge/scenes.json');
const makeWave = (specs) => createWaveform({ rules, manifest, dampingCycles: scenes.teaching_settings.lab.damping_cycles,
  scenarios: inspection.scenarios, specimens: specs });
const library = createCaselib({ cases, rules, standard, specimens, makeWave, scenario: inspection.scenarios[0] });
const thicknessLibrary = createThickness({ doc: thickness, cases, rules, standard, specimens, makeWave,
  scenario: inspection.scenarios[0], createCaselib });

function extract(name, source = main) {
  const start = source.search(new RegExp(`(?:export )?(?:async )?function ${name}\\(`));
  assert.ok(start >= 0, `Missing application function ${name}`);
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
  throw new Error(`Unclosed application function ${name}`);
}

function cardFixture({ role = 'student', route = 'task', taskMode = 'guided' } = {}) {
  const S = { learning: { role, route, taskMode }, task: { id: null, cards: {}, designs: {}, context: null, step: route === 'design' ? 'fill' : 'learn' }, taskOn: false, exam: false };
  const calls = [];
  const referenceCardLearning = new Function('S', `return (${arrow('referenceCardLearning')});`)(S);
  const bound = bind(['taskCard', 'taskDesign', 'taskFieldHtml', 'confirmTaskCard'], {
    S, taskcard, makeReferenceCard, referenceCardLearning, TK: taskText, V4,
    replayOn: () => false,
    esc: (value) => String(value).replace(/[&<>\"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])),
    levelText: (value) => value, PL: { no_value: '—' }, WF: { invalid_card: 'invalid' },
    renderTaskPage: () => calls.push('render'), persistDesignResult: () => calls.push('persist'), designLog: (id, act) => calls.push(`log:${act}`),
    emit: () => calls.push('emit'), window: { alert: () => calls.push('alert') },
    startTask: () => { throw new Error('A card submission must not launch detection'); },
  });
  return { S, calls, ...bound };
}

test('selecting each learning task immediately yields a fully filled read-only standard card', () => {
  const f = cardFixture();
  for (const task of taskcard.list()) {
    f.S.task.id = task.id;
    const st = f.taskCard(task.id);
    assert.equal(st.confirmed, true, task.id);
    assert.equal(taskcard.parse(st.raw).ok, true, task.id);
    assert.equal(taskcard.check(st.card, taskcard.plateThickness(task), task.level).ok, true, task.id);
    for (const field of taskcard.fields()) {
      assert.match(f.taskFieldHtml(field, st), / disabled/, `${task.id}:${field.id}`);
    }
  }
  assert.deepEqual(f.calls, []);
  assert.equal(f.S.taskOn, false);
  assert.equal(f.S.exam, false);
});

test('design task cards contain only the given acceptance level and editable assessed choices', () => {
  const f = cardFixture({ role: 'exam', route: 'design', taskMode: 'independent' });
  const task = taskcard.list()[0];
  f.S.task.id = task.id;
  const st = f.taskCard(task.id);
  assert.deepEqual(st.raw, { level: task.level });
  assert.equal(st.confirmed, false);
  for (const field of taskcard.fields()) {
    const html = f.taskFieldHtml(field, st);
    assert.equal(/ disabled/.test(html), field.id === 'level', field.id);
  }
});

test('design submissions score only the card, persist a result and keep detection inactive', () => {
  const f = cardFixture({ role: 'exam', route: 'design', taskMode: 'independent' });
  for (const task of taskcard.list()) {
    f.S.task.id = task.id;
    const st = f.taskCard(task.id);
    st.raw = makeReferenceCard(taskcard, task);
    assert.equal(f.confirmTaskCard(), true, task.id);
    assert.equal(st.score.total, 100, task.id);
    assert.equal(st.score.maxTotal, 100);
    assert.equal(st.confirmed, true);
  }
  assert.equal(f.calls.filter((name) => name === 'log:submit').length, taskcard.list().length);
  assert.equal(f.calls.includes('emit'), false);
  assert.equal(f.S.taskOn, false);
  assert.equal(f.S.exam, false);
});

test('incomplete designs remain editable and cannot produce a persisted score', () => {
  const f = cardFixture({ role: 'exam', route: 'design', taskMode: 'independent' });
  f.S.task.id = taskcard.list()[0].id;
  const st = f.taskCard(f.S.task.id);
  assert.equal(f.confirmTaskCard(), false);
  assert.equal(st.confirmed, false);
  assert.equal(st.score, null);
  assert.ok(st.miss.length > 0);
  assert.deepEqual(f.calls, ['log:missing', 'render']);
});

function bind(names, env, extra = '') {
  const entries = Object.entries(env);
  return new Function(...entries.map(([key]) => key),
    `${extra}\n${names.map((name) => extract(name)).join('\n')}\nreturn {${names.join(',')}};`)(...entries.map(([, value]) => value));
}

const arrow = (name) => {
  const source = main.match(new RegExp(`^const ${name} = (.+);$`, 'm'))?.[1];
  assert.ok(source, `Missing application predicate ${name}`);
  return source;
};

function modeFixture(role, { exam = false, route = 'fullscan', taskOn = false } = {}) {
  const S = { learning: { role, route }, exam, taskOn, mode: 'practice' };
  const predicates = ['selfStudy', 'detectionTraining', 'studyFullFlow', 'sessMode'];
  const helpers = new Function('S', `${predicates.map((name) => `const ${name} = ${arrow(name)};`).join('\n')}\nreturn {${predicates.join(',')}};`)(S);
  return { S, ...helpers };
}

test('only detection training owns a persistent exam session', () => {
  for (const role of [null, 'teacher', 'student']) {
    const f = modeFixture(role);
    assert.equal(f.sessMode(), null);
  }
  const f = modeFixture('exam', { exam: true, route: 'assessment' });
  assert.equal(f.sessMode(), 'exam');
  assert.equal(f.detectionTraining(), true);
  assert.equal(f.selfStudy(), false);
  assert.equal(f.studyFullFlow(), false);
});

test('a self study route uses transient practice state', () => {
  const f = modeFixture('student');
  assert.equal(f.selfStudy(), true);
  assert.equal(f.studyFullFlow(), true);
  assert.equal(f.detectionTraining(), false);
});

for (const role of [null, 'teacher', 'student']) {
  test(`${role || 'home'} navigation cannot create a training log`, () => {
    const calls = [];
    const f = modeFixture(role);
    const store = new Proxy({}, { get: (_, key) => () => { calls.push(key); return null; } });
    const { beginTrain, recordEvent, recTick } = bind(['beginTrain', 'recordEvent', 'recTick'], {
      ...f, store, recLast: 0, timerLast: 0, practice: {},
      replayOn: () => false, tickReplay: () => calls.push('replay'),
      emit: () => calls.push('emit'), sessionInit: () => ({}),
      keyState: () => ({}), $: () => null,
    });
    beginTrain();
    recordEvent('practice:step', { step_id: 'scan' });
    recordEvent('session:start', { mode: 'train' });
    recTick(500);
    assert.deepEqual(calls, []);
  });
}

test('detection training retains events and probe / instrument evidence', () => {
  const calls = [];
  const f = modeFixture('exam', { exam: true, route: 'assessment' });
  f.S.prac = { specimen: 'case', probe: { case: { x: 50, y: 60 } }, inst: { gain_dB: 30 } };
  const session = {
    locked: false,
    event: (name, payload) => { calls.push(['event', name, payload]); return true; },
    frame: (id, x, y) => { calls.push(['frame', id, x, y]); return true; },
    inst: (inst) => { calls.push(['inst', { ...inst }]); return true; },
    keyframe: () => { calls.push(['keyframe']); return true; },
    activeMs: () => 500,
  };
  const store = { get: (mode) => mode === 'exam' ? session : null, touch: (mode) => calls.push(['touch', mode]) };
  const { recordEvent, recTick } = bind(['recordEvent', 'recTick'], {
    ...f, store, recLast: 0, timerLast: 0, practice: {},
    replayOn: () => false, tickReplay: () => {}, beginTrain: () => { throw new Error('Training log not allowed'); },
    keyState: () => ({}), $: () => null, fmtDur: () => '',
  });
  recordEvent('practice:mark', { indication_id: 'F1' });
  recTick(500);
  assert.ok(calls.some(([kind, name]) => kind === 'event' && name === 'practice:mark'));
  assert.ok(calls.some(([kind, id, x, y]) => kind === 'frame' && id === 'case' && x === 50 && y === 60));
  assert.ok(calls.some(([kind]) => kind === 'inst'));
  assert.ok(calls.some(([kind]) => kind === 'keyframe'));
  assert.ok(calls.some(([kind, mode]) => kind === 'touch' && mode === 'exam'));
});

for (const learning of [
  { role: 'student', route: 'task', taskMode: 'guided' },
  { role: 'exam', route: 'design', taskMode: 'independent' },
]) {
  test(`${learning.route} cards cannot launch an old combined card / inspection run`, () => {
    const calls = [];
    const S = { learning, task: { id: 'T1' }, taskOn: false, exam: false };
    const { startTask } = bind(['startTask'], {
      S, taskCard: () => ({ confirmed: true }), practice: {}, proc: {}, replayOn: () => false,
      selfStudy: () => learning.role === 'student' && !S.exam,
      referenceCardLearning: () => learning.route === 'task' && learning.taskMode === 'guided',
      taskLive: () => { calls.push('taskLive'); return false; },
      taskCaseOf: () => { calls.push('taskCase'); return null; },
      store: { get: () => null }, window: { alert: () => calls.push('alert') },
    });
    assert.equal(startTask(), false);
    assert.deepEqual(calls, []);
    assert.equal(S.taskOn, false);
    assert.equal(S.exam, false);
  });
}

function practiceFixture({ role = 'exam', exam = true, route = 'assessment', live = true } = {}) {
  const calls = [];
  const specMan = { ...specimens, specimens: { ...specimens.specimens, ...specimens.runtime_specimens } };
  const S = { learning: { role, route, student: { name: '', student_no: '' }, taskMode: 'guided' },
    task: { id: null, cards: {}, context: null }, taskOn: false, exam, mode: live ? 'practice' : 'equipment',
    teacher: {}, panel: { frozen: false }, insp: {}, inspStash: null, prac: null, case: null, caseRef: false,
    inspCam: 'system', examExported: false };
  const predicates = ['selfStudy', 'detectionTraining', 'studyFullFlow', 'referenceCardLearning'];
  const modePredicates = new Function('S', `${predicates.map((name) => `const ${name} = ${arrow(name)};`).join('\n')}\nreturn {${predicates.join(',')}};`)(S);
  const fakeCase = (t = 50, id = 'CASE-TEST') => ({
    specimen_id: CASE_ID, library_id: id, case_id: id, template_id: 'template', seed: 15,
    plate: { ...structuredClone(specimens.runtime_specimens.specimen__plate_p02), dims: {
      length: { value: 1000 }, width: { value: 1000 }, thickness: { value: t } }, defects: [] },
    reference: { items: [], judged: {}, rects: {}, equivalents: {} },
  });
  let selectedCase = library.libraryCase(library.library()[0].id);
  let session = null;
  const store = {
    get: (mode) => mode === 'exam' ? session : null,
    begin: (mode, initial) => { calls.push(['begin', mode, initial]); session = { header: { session_id: 'test' }, log: [] }; return session; },
  };
  const env = {
    ...modePredicates, S, calls, specMan, V4, waveRules: rules, PR: rules.practice, STD: standard.items,
    CAL_RULES: rules.practice.calibration, CAL_STATE: rules.practice.calibration.calibrated_state,
    PRAC_SCENE: inspection.scenarios[0], SPEC_IDS: Object.keys(specMan.specimens),
    PLATE_IDS: rules.practice.plates.ids, EVAL_SPEC: rules.practice.step_presets.evaluate.specimen,
    STEP_IDS: ['calibrate', 'dac', 'sensitivity', 'scan', 'quantify', 'evaluate'],
    STEP_PRESETS: rules.practice.step_presets, CASE_ID, thicknessDoc: thickness,
    stdPack: standard, taskcard, makeReferenceCard, presetDetectionPractice,
    practice: {}, assembly: {}, proc: { gBase: (points) => points.at(-1).G },
    wave: { echoes: (st) => [{ type: 'defect', k: 1, id: 'F1', pct: 320 * 10 ** ((st.gain_dB - 30) / 20) }] },
    replayOn: () => false, examLocked: () => false, teacherAccess: () => role === 'teacher', presetsOn: () => role === 'teacher' && !exam,
    stepOpen: (id) => exam ? ['scan', 'quantify', 'evaluate'].includes(id) && !S.prac.submitted : true,
    isPlate: (id) => id === CASE_ID || rules.practice.plates.ids.includes(id), onCase: () => !!S.case,
    specT: (id) => { const d = specMan.specimens[id].dims; return (d.thickness || d.thickness_T).value; },
    probeStart: () => ({ x: 0, y: 0 }), inspKey: '',
    setSpecimen: (id) => { calls.push(['specimen', id]); S.prac.specimen = id; },
    emit: (name, payload) => calls.push(['emit', name, payload]),
    updateCriteria: () => calls.push(['criteria']), renderPanel: () => calls.push(['render']),
    showSpecimen: (id) => calls.push(['show', id]), setFreeze: () => {}, setInspCamera: () => {},
    fillSteps: () => { throw new Error('Reference answers must not be inserted into ordinary step changes'); },
    presetGain: () => 0,
    store, sessionInit: (student) => ({ student, initial: { step: S.prac.step, inst: { ...S.prac.inst } } }),
    drawLibraryCase: () => { calls.push(['draw']); return { case: selectedCase,
      selection: { source: selectedCase.thickness_mm && selectedCase.thickness_mm !== 50 ? 'thickness' : 'plate50', id: selectedCase.library_id } }; },
    caseLib: () => ({ libraryCase: (id) => { calls.push(['library', id]); return selectedCase; } }),
    thickness: () => ({ ...thicknessLibrary,
      libraryCase: (id) => { calls.push(['thicknessLibrary', id]); return selectedCase; } }),
    addBlock: (id) => { calls.push(['block', id]); specMan.specimens[id] = thicknessLibrary.block(id); return true; },
    applyCase: (cs) => { S.case = cs; specMan.specimens[CASE_ID] = cs.plate; },
    applyPractice: (on) => {
      calls.push(['practice', on]);
      if (on) { S.inspStash = S.insp; S.insp = S.prac.inst; }
      else { S.prac.inst = S.insp; if (S.inspStash) S.insp = S.inspStash; S.inspStash = null; }
    },
    setMode: async (mode) => {
      const prev = S.mode;
      S.mode = mode;
      if (prev !== mode && prev === 'practice') env.applyPractice(false);
      if (prev !== mode && mode === 'practice') env.applyPractice(true);
      calls.push(['mode', mode]);
    },
    pushAllMarks: () => calls.push(['marks']), resetExamBench: () => calls.push(['resetBench']),
    clearGateOfMainBang: () => {}, syncEval: () => {},
  };
  const functions = ['freshScan', 'freshQuant', 'freshEval', 'practiceInst', 'freshPrac', 'freshCasePlate',
    'pracToJSON', 'pracFromJSON', 'prepareLearningStep', 'plateRef', 'setDetectionGain', 'keepDetectionUnsaturated',
    'setPracticeStep', 'blockIdOf', 'presetDac', 'startExam'];
  const bound = bind(functions, env);
  S.prac = bound.freshPrac({ exam });
  if (live) { S.insp = S.prac.inst; S.inspStash = { marker: 'theory', gain_dB: 60, reject_percent: 15 }; }
  return { S, calls, env, bound, specMan, fakeCase,
    selectCase: (cs) => { selectedCase = cs; }, getSession: () => session, ...bound };
}

test('complete-flow preparation fills only prerequisites and retains existing detection evidence', () => {
  const f = practiceFixture({ role: 'student', exam: false, route: 'fullscan' });
  f.env.applyCase(f.fakeCase()); f.freshCasePlate();
  f.S.prac.plateId = CASE_ID; f.S.prac.specimen = CASE_ID;
  f.S.prac.scan.found.push({ id: 'F1', confirmed: true });
  f.S.prac.quant.results.F1 = { length: 40, area: 500 };
  const found = f.S.prac.scan.found, quantified = f.S.prac.quant.results;
  f.prepareLearningStep('scan');
  assert.deepEqual(f.S.prac.done, { calibrate: true, dac: true, sensitivity: true });
  assert.equal(f.S.insp.velocity_m_s, 5900);
  assert.equal(f.S.insp.zero_us, 0.4);
  assert.equal(f.S.insp.gain_dB, f.S.prac.sens.scan);
  f.prepareLearningStep('quantify');
  assert.equal(f.S.insp.gain_dB, f.S.prac.sens.base);
  assert.equal(f.S.prac.scan.found, found);
  assert.equal(f.S.prac.quant.results, quantified);
});

test('detection navigation switches sensitivity without replacing student measurements or resetting the probe', () => {
  const f = practiceFixture();
  // This case has an un-clipped echo at the base gain; stage initialisation
  // should therefore choose the stated base rather than an attenuation.
  f.env.wave.echoes = (st) => [{ type: 'defect', k: 1, id: 'F1', pct: 40 * 10 ** ((st.gain_dB - 30) / 20) }];
  f.env.applyCase(f.fakeCase()); f.freshCasePlate();
  Object.assign(f.S.prac, { plateId: CASE_ID, specimen: CASE_ID, sens: { base: 30, scan: 36 }, done: { sensitivity: true } });
  f.S.prac.scan.found.push({ id: 'F1', confirmed: true });
  f.S.prac.quant.results.F1 = { length: 40, area: 500 };
  f.S.prac.probe[CASE_ID] = { x: 50, y: 80 };
  const found = f.S.prac.scan.found, quantified = f.S.prac.quant.results;
  for (const [id, gain] of [['scan', 36], ['quantify', 30], ['evaluate', 30], ['scan', 36]]) {
    f.setPracticeStep(id);
    assert.equal(f.S.prac.step, id);
    assert.equal(f.S.insp.gain_dB, gain);
    assert.equal(f.S.prac.scan.found, found);
    assert.equal(f.S.prac.quant.results, quantified);
    assert.deepEqual(f.S.prac.probe[CASE_ID], { x: 50, y: 80 });
  }
  for (const id of ['calibrate', 'dac', 'sensitivity']) {
    f.setPracticeStep(id);
    assert.equal(f.S.prac.step, 'scan');
  }
  f.setPracticeStep('quantify', { force: true });
  assert.equal(f.S.prac.step, 'scan');
});

test('quantitative stage initialisation prevents clipping without changing the base sensitivity or running on every frame', () => {
  const f = practiceFixture();
  f.S.prac.step = 'quantify'; f.S.prac.sens = { base: 30, scan: 36 };
  f.S.prac.quant.target = 'F1'; f.S.insp.gain_dB = 30;
  f.setDetectionGain('quantify');
  assert.ok(Math.abs(f.S.insp.gain_dB - (30 - 20 * Math.log10(4))) < 1e-9);
  assert.deepEqual(f.S.prac.sens, { base: 30, scan: 36 });
  const displayed = f.env.wave.echoes(f.S.insp)[0].pct;
  assert.ok(Math.abs(displayed - 80) < 1e-9);
  f.S.prac.step = 'scan';
  f.setDetectionGain('scan');
  assert.equal(f.S.insp.gain_dB, 36);
  assert.doesNotMatch(extract('updateCriteria'), /\bkeepDetectionUnsaturated\s*\(/);
});

test('starting a detection case accepts optional identity and begins directly on the calibrated case plate', () => {
  const f = practiceFixture({ live: false });
  assert.equal(f.startExam(), true);
  assert.equal(f.S.mode, 'practice');
  assert.equal(f.S.prac.step, 'scan');
  assert.equal(f.S.prac.specimen, CASE_ID);
  assert.equal(f.S.prac.plateId, CASE_ID);
  assert.equal(f.S.insp, f.S.prac.inst);
  assert.equal(f.S.insp.gain_dB, f.S.prac.sens.scan);
  assert.equal(f.S.prac.eval.level, 'II');
  assert.deepEqual(f.S.learning.student, { name: '', student_no: '' });
  assert.equal(f.S.prac.scan.found.length, 0);
  assert.deepEqual(f.S.prac.quant.results, {});
  assert.equal(f.calls.some(([name]) => name === 'resetBench'), false);
  const events = f.calls.filter(([name]) => name === 'emit').map(([, name]) => name);
  assert.deepEqual(events, ['session:start', 'case:load']);
  assert.equal(events.some((name) => /assembly:|practice:(calib|dac|sensitivity|system_preset)/.test(name)), false);
  assert.equal(f.S.prac.presetPlan.source, 'system');
  assert.ok(f.S.prac.presetCard);
  const selected = f.S.case;
  assert.equal(f.startExam(), false);
  assert.equal(f.S.case, selected);
  assert.equal(f.calls.filter(([name]) => name === 'draw').length, 1);
});

test('replacing a live practice state keeps the new preset instrument object active', () => {
  const f = practiceFixture();
  const old = f.S.insp;
  assert.equal(f.startExam('A', '001'), true);
  assert.notEqual(f.S.insp, old);
  assert.equal(f.S.insp, f.S.prac.inst);
  assert.equal(f.S.insp.reject_percent, 0);
  assert.equal(f.S.insp.velocity_m_s, 5900);
  assert.equal(f.S.insp.gain_dB, f.S.prac.sens.scan);
});

test('a complete-flow restart leaves practice once and does not copy theory parameters into the new instrument', async () => {
  const f = practiceFixture({ role: 'student', exam: false, route: 'inspection' });
  f.S.selected = 'probe__active_element'; f.S.isolated = 'probe__active_element';
  const { launchLearning } = bind(['launchLearning'], {
    ...f.env, ...f.bound, casesDoc: cases,
    learningShell: { teacherUnlocked: () => false, update: () => {} },
    closeStdPage: () => {}, closeTaskPage: () => {}, closeReport: () => {},
    exitReplay: () => {}, leaveTask: () => {}, swapContext: () => {},
    updateVisibility: () => {}, refreshMaterials: () => {},
    setStudy: () => {}, $: () => ({ open: true }), document: { body: { dataset: {} } },
  });
  assert.equal(await launchLearning({ role: 'student', route: 'fullscan' }), true);
  assert.equal(f.S.mode, 'equipment');
  assert.equal(f.S.prac.inst.reject_percent, 0);
  assert.equal(f.S.prac.inst.marker, undefined);
  assert.equal(f.calls.filter(([name, on]) => name === 'practice' && !on).length, 1);
  assert.equal(f.S.selected, null);
  assert.equal(f.S.isolated, null);
});

test('restored detection preserves its case specimen and measurements while startup stays on the three-mode home', () => {
  const previous = practiceFixture({ live: false });
  assert.equal(previous.startExam('学生', '001'), true);
  previous.S.prac.scan.found.push({ id: 'F1', x: 10, y: 20, confirmed: true, flags: [] });
  previous.S.prac.quant.results.F1 = { length: 40, area: 500 };
  previous.S.prac.step = 'quantify';
  const saved = { state: { prac: previous.pracToJSON(previous.S.prac), learning: previous.S.learning },
    header: { session_id: 'restored', student: previous.S.learning.student }, log: [] };
  const f = practiceFixture({ role: null, exam: false, route: null, live: false });
  assert.equal(f.specMan.specimens[CASE_ID], undefined);
  const loadCalls = [];
  const store = { load: (mode) => { loadCalls.push(mode); return mode === 'exam' ? saved : null; },
    resume: () => ({ session: { header: saved.header, log: saved.log } }) };
  const document = { body: { dataset: {} } };
  const { bootSessions } = bind(['bootSessions'], {
    ...f.env, ...f.bound, store, document,
    renderModes: () => {}, setStudy: () => {},
    replayCase: () => { throw new Error('A named library selection must be used when present'); },
    caseAt: () => { throw new Error('A named library selection must be used when present'); },
  });
  bootSessions();
  assert.deepEqual(loadCalls, ['exam']);
  assert.equal(f.S.learning.role, null);
  assert.equal(f.S.learning.route, null);
  assert.equal(document.body.dataset.learningRole, 'home');
  assert.equal(f.S.examPrac.specimen, CASE_ID);
  assert.equal(f.S.examPrac.plateId, CASE_ID);
  assert.equal(f.S.examPrac.step, 'quantify');
  assert.equal(f.S.examPrac.librarySelection.id, saved.state.prac.librarySelection.id);
  assert.deepEqual(f.S.examPrac.scan.found, saved.state.prac.plates[CASE_ID].scan.found);
  assert.deepEqual(f.S.examPrac.quant.results, saved.state.prac.plates[CASE_ID].quant.results);
});

test('prepared calibration conditions are guarded at both direct and physical panel control setters', () => {
  const f = practiceFixture();
  const locks = new Function(`return ${main.match(/^const PRESET_LOCKS = (.+);$/m)[1]};`)();
  assert.equal(locks.has('gain_dB'), false);
  for (const key of ['range_mm', 'velocity_m_s', 'zero_us', 'reject_percent', 'coupling', 'damping']) assert.ok(locks.has(key), key);
  const before = structuredClone(f.S.insp);
  const { setInsp, setPracCtl } = bind(['setInsp', 'setPracCtl'], {
    ...f.env, PRESET_LOCKS: locks,
  });
  for (const key of ['range_mm', 'velocity_m_s', 'coupling', 'damping']) setInsp(key, 'wrong');
  for (const key of ['zero_us', 'reject_percent']) setPracCtl(key, 100);
  assert.deepEqual(f.S.insp, before);
});

test('30 and 80 mm detection cases use their proper blocks and restore the exact library selection and DAC data', () => {
  for (const t of [30, 80]) {
    const entry = thicknessLibrary.library().find((item) => item.thickness_mm === t);
    const cs = thicknessLibrary.libraryCase(entry.id);
    const previous = practiceFixture({ live: false });
    previous.selectCase(cs);
    assert.equal(previous.startExam(), true);
    assert.equal(previous.S.prac.inst.thickness_mm, t);
    assert.equal(previous.S.prac.presetCard.reference_block, t === 30 ? '1' : '3');
    assert.deepEqual(previous.S.prac.librarySelection, { source: 'thickness', id: entry.id });
    const saved = { header: { student: { name: '', student_no: '' } }, log: [],
      state: { prac: previous.pracToJSON(previous.S.prac) } };
    const f = practiceFixture({ role: null, exam: false, route: null, live: false });
    f.selectCase(cs);
    const store = { load: () => saved, resume: () => ({ session: { header: saved.header, log: [] } }) };
    const { bootSessions } = bind(['bootSessions'], { ...f.env, ...f.bound, store,
      document: { body: { dataset: {} } }, setStudy: () => {}, renderModes: () => {},
      replayCase: () => { throw new Error('Must use existing thickness library'); }, caseAt: () => null });
    bootSessions();
    assert.equal(f.S.caseExam, cs);
    assert.equal(f.S.examPrac.specimen, CASE_ID);
    assert.equal(f.S.examPrac.inst.thickness_mm, t);
    assert.deepEqual(f.S.examPrac.librarySelection, { source: 'thickness', id: entry.id });
    assert.deepEqual(f.S.examPrac.dac.points, saved.state.prac.dac.points);
    assert.deepEqual(f.S.examPrac.sens, saved.state.prac.sens);
    const block = thickness.blocks.find((item) => String(item.row_no) === (t === 30 ? '1' : '3')).specimen_id;
    assert.ok(f.specMan.specimens[block]);
    assert.ok(f.calls.some(([name, id]) => name === 'thicknessLibrary' && id === entry.id));
  }
});

test('self study instructions use demonstration actions and show equivalent measurement only when required', () => {
  const f = practiceFixture({ role: 'student', exam: false, route: 'fullscan' });
  let required = ['area'];
  const { guideItems } = bind(['guideItems'], { ...f.env,
    GUIDE: practiceText.guide, v4Format: new Function(`return (${arrow('v4Format')});`)(),
    STD_TOKENS: { spacing: 7 }, judgedOf: () => required });
  for (const step of ['calibrate', 'dac', 'sensitivity']) {
    const items = guideItems(step);
    assert.ok(items.length >= practiceText.guide.steps[step].length);
    assert.deepEqual(items.slice(0, practiceText.guide.steps[step].length), practiceText.guide.steps[step]);
    assert.ok(items.every((item) => item.why || item.id === 'next'), step);
  }
  f.S.prac.quant.target = 'F1';
  assert.equal(guideItems('quantify').some((item) => item.id === 'eq'), false);
  required = ['equivalent'];
  assert.equal(guideItems('quantify').some((item) => item.id === 'eq'), true);
});

test('detection instructions state case-specific scan limits and expose completion without checking answers', () => {
  const overlapSpacing = Math.floor(manifest.parameters.active_element_diameter.value
    * (1 - standard.items.scan_coverage.overlap_min_ratio));
  for (const t of [30, 80]) {
    const entry = thicknessLibrary.library().find((item) => item.thickness_mm === t);
    const f = practiceFixture({ live: false });
    f.selectCase(thicknessLibrary.libraryCase(entry.id));
    assert.equal(f.startExam(), true);
    const P = f.S.prac;
    const guideBox = { hidden: true, innerHTML: '', scrollTop: 0, clientHeight: 100,
      querySelector: (selector) => selector === '.gd-head' ? { offsetHeight: 0 } : null };
    const guideBtn = { hidden: true, classList: { toggle: () => {} } };
    let sys = false;
    const { guideItems, guideChecks, updateGuide } = bind(['guideItems', 'guideChecks', 'updateGuide'], {
      ...f.env, guideBox, guideBtn, stdBtn: { hidden: true }, stdBox: { hidden: true }, systemQuant: () => sys,
      $: () => null, updateQuantCap: () => {}, detectionCaseSummary,
      GUIDE: practiceText.guide, v4Format: new Function(`return (${arrow('v4Format')});`)(),
      STD_TOKENS: { spacing: overlapSpacing },
      judgedOf: () => ['equivalent'],
      learningHelpOn: () => false, examLocked: () => false,
      evalItems: () => [{ id: 'F1' }], updateStdBox: () => {},
      rubricDoc: json('contracts/rubric.json'), practiceDoc: practiceText, WF: workflowText, PL: practiceText.labels,
      guideLast: 0, guideKey: '', guideStep: 'quantify', guideCur: '',
      measuredBoundaryState: () => { throw new Error('Detection instructions cannot check the reference answer'); },
      esc: (value) => String(value),
    });
    const scan = guideItems('scan');
    const move = [].concat(scan.find((item) => item.id === 'move').page).join('\n');
    assert.ok(move.includes(`${t === 80 ? 75 : 50} mm`));
    assert.ok(move.includes(`${overlapSpacing} mm`));
    assert.ok(move.includes('50 mm'));
    assert.equal(/\{[a-z_]+\}/.test(move), false);
    assert.equal(scan.some((item) => item.device || /参考答案|缺陷位置|透视/.test(item.page)), false);
    P.step = 'quantify'; P.guide = true; P.quant.target = 'F1';
    P.quant.pts.F1 = [[0, 0], [1, 0], [1, 1], [0, 1]];
    P.quant.eq.F1 = { dB: -100, S: 1 };
    P.quant.results.F1 = { length: 1, area: 1, eq: -100 };
    Object.defineProperty(P.quant.results.F1, 'judge', { get: () => { throw new Error('Do not reveal measurement correctness'); } });
    assert.deepEqual(guideChecks('quantify'), { target: true, points: true, eq: true, result: true });
    updateGuide(500);
    assert.equal(guideBtn.hidden, false);
    assert.equal(guideBox.hidden, false);
    assert.equal(guideBox.innerHTML.includes(workflowText.boundary_verified), false);
    assert.equal(guideBox.innerHTML.includes(workflowText.boundary_recheck), false);
    assert.ok(guideBox.innerHTML.includes(V4.detection_guide.quantify.find((item) => item.id === 'result').do));
    sys = true;
    assert.deepEqual(guideItems('quantify').map((item) => item.do), V4.detection_guide_system.quantify.map((item) => item.do));
    assert.deepEqual(guideItems('scan').map((item) => item.id), scan.map((item) => item.id));
  }
});
