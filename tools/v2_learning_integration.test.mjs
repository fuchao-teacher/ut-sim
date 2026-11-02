import fs from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';

// Checks the current main.js functions without starting Three.js or a browser.
// The doubles exercise routing and persistence boundaries, not rendering.
const main = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const WF = JSON.parse(fs.readFileSync(new URL('../../knowledge/learning-workflow.json', import.meta.url), 'utf8'));

function extract(name) {
  const start = main.search(new RegExp(`(?:async )?function ${name}\\(`));
  assert.ok(start >= 0, `Missing function ${name}`);
  const open = main.indexOf('{', main.indexOf(')', start));
  let depth = 0, quote = null, line = false, block = false;
  for (let i = open; i < main.length; i++) {
    const c = main[i], next = main[i + 1];
    if (line) { if (c === '\n') line = false; continue; }
    if (block) { if (c === '*' && next === '/') { block = false; i++; } continue; }
    if (quote) { if (c === '\\') i++; else if (c === quote) quote = null; continue; }
    if (c === '/' && next === '/') { line = true; i++; continue; }
    if (c === '/' && next === '*') { block = true; i++; continue; }
    if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
    if (c === '{') depth++;
    if (c === '}' && --depth === 0) return main.slice(start, i + 1);
  }
  throw new Error(`Unclosed function ${name}`);
}

function bind(names, env) {
  const entries = Object.entries(env);
  return new Function(...entries.map(([key]) => key), `${names.map(extract).join('\n')}\nreturn {${names.join(',')}};`)(...entries.map(([, value]) => value));
}

function routingFixture({ role = 'student', route = null, taskMode = 'guided', task = null, train = null, confirm = true,
  flowRole = null, flowCaseId = null, flowAssemblyDone = false, teacherUnlocked = true } = {}) {
  const calls = [];
  let fresh = 0;
  const freshPrac = () => ({ marker: ++fresh, inst: {}, done: {}, step: 'calibrate' });
  const S = {
    learning: { role, route, taskMode, student: { name: '', student_no: '' } },
    study: role === 'teacher' ? 'classroom' : 'self', mode: 'equipment',
    prac: { ...freshPrac(), flowRole, flowCaseId, flowAssemblyDone },
    task: { cards: { old: { confirmed: true } }, context: { role, taskMode } }, teacher: {},
    taskOn: false, taskPrac: null, caseTask: null, taskRun: null, case: null,
  };
  const sessions = { task, train };
  for (const session of Object.values(sessions)) if (session && !session.header) session.header = { initial: { learning: { ...S.learning } } };
  const nodes = { legacyMore: { open: true } };
  const document = { body: { dataset: {} } };
  const env = {
    S, WF, document, practice: {}, assembly: {}, CASE_ID: 'case', CAL_STATE: { velocity_m_s: 5900, zero_us: 0 },
    casesDoc: { library: { cases: [{ id: 'first-case' }] } },
    store: { get: (mode) => sessions[mode], clear: (mode) => { calls.push(['clear', mode]); sessions[mode] = null; } },
    window: { confirm: (message) => { calls.push(['confirm', message]); return confirm; } },
    replayOn: () => false, exitReplay: () => calls.push(['exitReplay']),
    updateVisibility: () => calls.push(['updateVisibility']), refreshMaterials: () => calls.push(['refreshMaterials']),
    closeStdPage: () => {}, closeTaskPage: () => {}, closeReport: () => {},
    setStudy: (mode) => { calls.push(['setStudy', mode]); S.study = mode; },
    swapContext: (exam) => { calls.push(['swapContext', exam]); S.exam = exam; S.taskOn = false; },
    leaveTask: () => { calls.push(['leaveTask']); S.taskOn = false; },
    openTaskPage: () => calls.push(['openTaskPage']), openExam: () => calls.push(['openExam']),
    freshPrac, applyPractice: (value) => calls.push(['applyPractice', value]),
    dropCase: () => { calls.push(['dropCase']); S.case = null; },
    caseLib: () => ({ libraryCase: (id) => { calls.push(['libraryCase', id]); return { specimen_id: 'case' }; } }),
    applyCase: (cs) => { calls.push(['applyCase', cs]); S.case = cs; },
    freshCasePlate: () => calls.push(['freshCasePlate']),
    resetExamBench: () => calls.push(['resetExamBench']),
    fillSteps: (id) => { calls.push(['fillSteps', id]); S.prac.done = { calibrate: true, dac: true }; },
    specT: () => 50,
    renderPanel: () => calls.push(['renderPanel']), beginTrain: () => calls.push(['beginTrain']),
    setMode: async (mode, options) => { calls.push(['setMode', mode, options]); S.mode = mode; },
    learningShell: { teacherUnlocked: () => teacherUnlocked, update: (state) => calls.push(['shell', { ...state }]) },
    $: (id) => nodes[id],
  };
  return { S, calls, sessions, document, ...bind(['launchLearning'], env) };
}

test('a new complete lesson starts with assembly and keeps the board for subsequent instrument work', async () => {
  const f = routingFixture();
  assert.equal(await f.launchLearning({ role: 'student', route: 'fullscan' }), true);
  assert.equal(f.S.mode, 'equipment');
  assert.equal(f.S.prac.step, 'calibrate');
  assert.equal(f.S.case.specimen_id, 'case');
  assert.equal(f.S.prac.cover, true);
  assert.deepEqual(f.S.prac.done, {});
  assert.equal(f.S.prac.flowAssemblyDone, false);
  assert.equal(f.S.prac.flowRole, 'student');
  assert.equal(f.S.prac.flowCaseId, 'first-case');
  assert.ok(f.calls.some(([action]) => action === 'resetExamBench'));
  assert.ok(f.calls.some(([action, value]) => action === 'libraryCase' && value === 'first-case'));
});

test('complete lesson preparation replaces transient practice and leaves previous-version session data untouched', async () => {
  const f = routingFixture({ route: 'principle', train: {} });
  const before = f.S.prac;
  await f.launchLearning({ role: 'student', route: 'fullscan' });
  assert.notEqual(f.S.prac, before);
  assert.equal(f.S.prac.step, 'calibrate');
  assert.deepEqual(f.calls.filter(([action]) => action === 'clear' || action === 'beginTrain'), []);
});

test('same-role topic resume retains the current practice data without replacing its session', async () => {
  const f = routingFixture({ role: 'student', route: 'fullscan', flowRole: 'student', flowCaseId: 'first-case', flowAssemblyDone: true });
  const before = f.S.prac;
  await f.launchLearning({ role: 'student', route: 'fullscan' });
  assert.equal(f.S.prac, before);
  assert.equal(f.S.mode, 'practice');
  assert.equal(f.calls.some(([action]) => action === 'clear' || action === 'confirm'), false);
});

test('returning from another topic resumes in-page complete-flow data without a persisted learning log', async () => {
  const f = routingFixture({ role: 'teacher', route: 'principle', flowRole: 'student', flowCaseId: 'first-case', flowAssemblyDone: true });
  const before = f.S.prac;
  await f.launchLearning({ role: 'student', route: 'fullscan' });
  assert.equal(f.S.prac, before);
  assert.equal(f.calls.some(([action]) => action === 'clear' || action === 'confirm'), false);
  assert.equal(f.S.study, 'self');
});

test('reference-card learning and independent design use separate card contexts', async () => {
  const f = routingFixture({ role: 'student', route: 'task', task: { header: { initial: { learning: { role: 'student', taskMode: 'guided' } } } } });
  await f.launchLearning({ role: 'exam', route: 'design' });
  assert.deepEqual(f.S.task.cards, {});
  assert.deepEqual(f.S.task.context, { role: 'exam', taskMode: 'independent' });
  assert.equal(f.S.learning.taskMode, 'independent');
  assert.ok(f.calls.some(([action]) => action === 'openTaskPage'));
  assert.equal(f.calls.some(([action]) => action === 'openExam'), false);
});

test('design selection clears the reference answer without a detection-session confirmation gate', async () => {
  const f = routingFixture({ role: 'student', route: 'task', task: {}, confirm: false });
  const before = f.S.task.cards;
  assert.equal(await f.launchLearning({ role: 'exam', route: 'design' }), true);
  assert.notEqual(f.S.task.cards, before);
  assert.deepEqual(f.S.task.cards, {});
  assert.equal(f.S.learning.role, 'exam');
  assert.equal(f.calls.some(([action]) => action === 'confirm' || action === 'clear' || action === 'openExam'), false);
});

test('a dormant independent task is replaced when reopening it as guided practice', async () => {
  const f = routingFixture({ role: 'exam', route: 'assessment', taskMode: 'independent' });
  await f.launchLearning({ role: 'student', route: 'task', taskMode: 'guided' });
  assert.deepEqual(f.S.task.cards, {});
  assert.deepEqual(f.S.task.context, { role: 'student', taskMode: 'guided' });
  assert.equal(f.S.learning.route, 'task');
  assert.equal(f.calls.some(([action]) => action === 'openExam'), false);
});

test('reopening a dormant independent task preserves its cards despite visiting another topic', async () => {
  const f = routingFixture({ role: 'exam', route: 'assessment', taskMode: 'independent' });
  const before = f.S.task.cards;
  await f.launchLearning({ role: 'exam', route: 'design' });
  assert.equal(f.S.task.cards, before);
  assert.equal(f.calls.some(([action, value]) => action === 'clear' && value === 'task'), false);
  assert.equal(f.S.learning.taskMode, 'independent');
});

test('changing study presentation never loads presets into a submitted assessment', () => {
  const calls = [];
  const S = { study: 'self', step: 3, exam: true, taskOn: true, prac: { submitted: true, step: 'evaluate' } };
  const { setStudy } = bind(['setStudy'], {
    S, STEP_IDS: ['calibrate'], stepOpen: () => false,
    setPracticeStep: () => calls.push('preset'),
    document: { body: { classList: { toggle() {} } } },
    renderStudy() {}, renderModes() {}, renderPanel() {}, lastLabelKey: '', anchorsDirty: false,
  });
  setStudy('classroom');
  assert.deepEqual(calls, []);
});

function restoreFixture({ trainLearning = { role: 'teacher', route: 'fullscan', taskMode: 'guided' }, examActive = false, taskActive = false, hasTask = true } = {}) {
  const calls = [];
  const S = { learning: { role: null, route: null, student: {} }, study: 'self', mode: 'equipment',
    prac: {}, task: { cards: {} }, taskRun: null, asmDone: false };
  const train = { state: { learning: trainLearning, prac: {}, unlocked: true }, header: { initial: { study: trainLearning.role === 'teacher' ? 'classroom' : 'self', learning: trainLearning } }, log: [] };
  const exam = examActive ? { state: { active: true, learning: { role: 'exam', route: 'assessment', taskMode: 'guided' },
    prac: { librarySelection: { id: 'saved-case', source: 'plate50' }, presetPlan: { source: 'system' }, presetCard: { level: 'II' } } }, header: {}, log: [] } : null;
  const task = hasTask ? { state: { active: taskActive, learning: { role: 'exam', route: 'task', taskMode: 'independent' }, prac: {} },
    header: { task_id: 'task-1', card: { reference_block: 'block' }, case: {}, student: { name: 'A', student_no: '1' } }, log: [] } : null;
  const sessions = { train, exam, task };
  const env = {
    S, practice: {}, assembly: {}, CASE_ID: 'case', specMan: { specimens: {} }, PR: { dac: { specimen: 'block' } }, STEP_IDS: ['calibrate'],
    store: { load: (mode) => { calls.push(['load', mode]); return sessions[mode]; }, resume: (mode, data) => { calls.push(['resume', mode]); return { session: data, gap_s: 1 }; },
      save: (mode) => calls.push(['save', mode]), clear: (mode) => calls.push(['clear', mode]), get: (mode) => sessions[mode] },
    rebuildCase() {}, caseAt: (header) => header.case || null,
    pracFromJSON: (value) => ({ ...value, inst: {}, done: {}, step: 'sensitivity' }), benchLoad() {},
    emit() {}, caseLib: () => ({ generate: () => null, libraryOf: () => 'first-case', libraryCase: (id) => ({ specimen_id: 'case', library_id: id, plate: { id: 'case' } }) }),
    replayCase: (cs) => cs, thickness: () => ({ libraryCase: (id) => ({ specimen_id: 'case', library_id: id }) }),
    makeCase: () => ({ specimen_id: 'case' }), taskcard: { task: () => ({ id: 'task-1' }) },
    taskCard: (id) => S.task.cards[id] ||= {}, blockIdOf: () => 'block', addBlock() {},
    pushAllMarks() {}, renderModes() {}, renderPanel: () => calls.push(['renderPanel']),
    startTask: () => calls.push(['startTask']), openExam: () => calls.push(['openExam']),
    setStudy: (mode) => { S.study = mode; calls.push(['setStudy', mode]); },
    setMode: (mode) => { S.mode = mode; calls.push(['setMode', mode]); },
    document: { body: { classList: { toggle() {} }, dataset: {} } },
  };
  return { S, calls, ...bind(['bootSessions', 'restoreTask'], env) };
}

test('startup does not restore a teacher identity or inspect old learning/task sessions', () => {
  const f = restoreFixture();
  f.bootSessions();
  assert.equal(f.S.learning.role, null);
  assert.equal(f.S.learning.route, null);
  assert.notEqual(f.S.learning.student?.name, 'A');
  assert.equal(f.calls.some(([action]) => action === 'startTask'), false);
  assert.deepEqual(f.calls.filter(([action]) => action === 'load'), [['load', 'exam']]);
});

test('startup preserves a detection case in the background and opens the three-mode chooser', () => {
  const exam = restoreFixture({ examActive: true, taskActive: false });
  exam.bootSessions();
  assert.equal(exam.S.learning.route, null);
  assert.equal(exam.S.caseExam.library_id, 'saved-case');
  assert.deepEqual(exam.S.examPrac.presetPlan, { source: 'system' });
  assert.equal(exam.calls.some(([action]) => action === 'openExam'), false);
  const task = restoreFixture({ examActive: true, taskActive: true });
  task.bootSessions();
  assert.equal(task.S.learning.role, null);
  assert.equal(task.S.learning.route, null);
  assert.notEqual(task.S.learning.student.name, 'A');
  assert.equal(task.S.caseExam.library_id, 'saved-case');
  assert.equal(task.calls.some(([action]) => action === 'startTask'), false);
  assert.deepEqual(task.calls.filter(([action]) => action === 'load'), [['load', 'exam']]);
});

test('a legacy teacher snapshot cannot reopen teacher teaching or classroom presentation', () => {
  const f = restoreFixture({ hasTask: false });
  f.bootSessions();
  assert.equal(f.S.mode, 'equipment');
  assert.equal(f.S.study, 'self');
  assert.equal(f.S.learning.role, null);
  assert.equal(f.calls.some(([action]) => action === 'setMode'), false);
});

test('inactive training and task snapshots preserve their own learning entries and identities', () => {
  const training = { role: 'student', route: 'fullscan', taskMode: 'guided', student: { name: 'T', student_no: '2' } };
  const task = { role: 'exam', route: 'task', taskMode: 'independent', student: { name: 'K', student_no: '3' } };
  const sessions = {
    train: { header: { initial: { learning: training }, student: null } },
    task: { header: { initial: { learning: task }, student: task.student } },
  };
  const S = { learning: { role: 'teacher', route: 'principle', student: {} }, mode: 'physics', exam: false, taskOn: false,
    prac: { plates: {} }, taskPrac: { plates: {} }, pracTrain: { plates: {} } };
  const { stateOf } = bind(['learningStateOf', 'taskStateOf', 'stateOf'], { S, store: { get: (mode) => sessions[mode] },
    practice: {}, PLATE_IDS: [], CASE_ID: 'case', specMan: { specimens: {} },
    pracToJSON: (p) => ({ ...p }), coverageSummary: () => ({}), benchSnap: () => null,
  });
  assert.deepEqual(stateOf('train').learning, training);
  assert.deepEqual(stateOf('task').learning, task);
  S.taskOn = true; S.learning = task;
  assert.deepEqual(stateOf('train').learning, training);
});

test('teacher complete-flow demonstrations capture independent in-page instrument and DAC snapshots', () => {
  const S = { exam: false, learning: { route: 'fullscan' }, prac: { done: { calibrate: true } }, insp: { gain_dB: 31 } };
  const dac = [{ S: 50, G: 31 }];
  const { takeShot } = bind(['takeShot'], { S, selfStudy: () => false, examLocked: () => false, dacPts: () => dac });
  takeShot('scan');
  S.insp.gain_dB = 40; dac[0].G = 40;
  assert.equal(S.prac.shots.scan.inst.gain_dB, 31);
  assert.equal(S.prac.shots.scan.dac[0].G, 31);
});

test('detection assessment draws an existing case and starts with system preparation instead of assembly', () => {
  const calls = [];
  const S = { exam: true, taskOn: false, mode: 'equipment', learning: { student: {} }, case: null };
  const presetCalls = [];
  const { startExam } = bind(['startExam'], { S, CASE_ID: 'case', waveRules: {}, stdPack: {},
    specMan: { specimens: { block: {} } }, taskcard: {},
    store: { get: () => null, begin: (mode, initial) => { calls.push([mode, initial]); return { header: { session_id: 'session-1' } }; } },
    examCaseOf: () => { throw new Error('Unexpected case-code branch'); },
    drawLibraryCase: () => ({ case: { specimen_id: 'case', library_id: 'existing-case' }, selection: { id: 'existing-case', source: 'plate50' } }),
    thickness: () => ({}), caseLib: () => ({}), specT: () => 50,
    makeReferenceCard: () => ({ reference_block: '2', level: 'II' }), presetDac: () => [], blockIdOf: () => 'block',
    presetDetectionPractice: (options) => { presetCalls.push(options); return { prac: { ...options.prac, step: 'scan', asmDone: true,
      done: { calibrate: true, dac: true, sensitivity: true } }, presetEvent: { name: 'practice:system_preset', payload: { preset: true } } }; },
    freshPrac: (options) => ({ options, done: {}, inst: {}, eval: {} }), applyCase: (cs) => { S.case = cs; }, freshCasePlate() {},
    pushAllMarks() {}, sessionInit: (student, code) => ({ student, code }), emit() {}, renderPanel() {},
    setMode: (mode) => { S.mode = mode; }, clearGateOfMainBang() {}, syncEval() {},
  });
  assert.equal(startExam('A', '1'), true);
  assert.equal(S.case.library_id, 'existing-case');
  assert.equal(calls[0][1].code, undefined);
  assert.deepEqual(S.prac.options, { exam: true });
  assert.deepEqual(S.prac.done, { calibrate: true, dac: true, sensitivity: true });
  assert.equal(S.prac.step, 'scan');
  assert.equal(S.prac.asmDone, true);
  assert.equal(S.mode, 'practice');
  assert.deepEqual(S.prac.librarySelection, { id: 'existing-case', source: 'plate50' });
  assert.equal(presetCalls.length, 1);
  assert.deepEqual(presetCalls[0].task, { level: 'II' });
  assert.deepEqual(calls[0][1].student, { name: 'A', student_no: '1' });
});

function cardFixture({ parsed = { ok: true, card: {} }, checked = { ok: false, fields: { range_mm: false, level: true } }, mode = 'guided' } = {}) {
  const state = { raw: { range_mm: '10' }, confirmed: false, miss: [] };
  const alerts = [], calls = [];
  const S = { learning: { taskMode: mode }, task: { id: 'task-1' } };
  const { checkTaskCard } = bind(['checkTaskCard'], { S, WF, TK: { card_fields: { range_mm: 'Range' } },
    taskCard: () => state, taskcard: { parse: () => parsed, task: () => ({ level: 1 }), plateThickness: () => 50,
      check: () => { calls.push('check'); return checked; } },
    renderTaskPage: () => calls.push('render'), window: { alert: (value) => alerts.push(value) },
  });
  return { state, alerts, calls, checkTaskCard };
}

test('guided card feedback highlights incorrect values without confirming the card', () => {
  const f = cardFixture();
  f.checkTaskCard();
  assert.deepEqual(f.state.miss, ['range_mm']);
  assert.equal(f.state.confirmed, false);
  assert.match(f.alerts[0], /Range/);
  assert.deepEqual(f.calls, ['check', 'render']);
});

test('incomplete card feedback names missing fields and independent cards receive no answer check', () => {
  const incomplete = cardFixture({ parsed: { ok: false, missing: ['range_mm'] } });
  incomplete.checkTaskCard();
  assert.deepEqual(incomplete.state.miss, ['range_mm']);
  assert.equal(incomplete.alerts.length, 0);
  const independent = cardFixture({ mode: 'independent' });
  independent.checkTaskCard();
  assert.deepEqual(independent.calls, []);
});

class Element {
  constructor(tag = 'div', cls = '', key = null) { this.tag = tag; this.cls = cls; this.dataset = { k: key }; this.children = []; this.parent = null; }
  appendChild(child) { if (child.parent) child.remove(); child.parent = this; this.children.push(child); return child; }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter((x) => x !== this); this.parent = null; }
  querySelectorAll(selector) { return this.children.flatMap((child) => [...(selector === '.ic-row' && child.cls === 'ic-row' ? [child] : []), ...child.querySelectorAll(selector)]); }
  querySelector(selector) { return this.children.find((child) => selector === 'details.workflow-advanced' && child.tag === 'details' && child.cls === 'workflow-advanced') || null; }
}

test('instrument controls fold extras by step and retain every control on repeated compaction', () => {
  const box = new Element();
  const keys = ['gain_dB', 'range_mm', 'velocity_m_s', 'zero_us', 'gate_on', 'peak_memory', 'reject_percent'];
  keys.forEach((key) => box.appendChild(new Element('div', 'ic-row', key)));
  const S = { prac: { step: 'calibrate' } };
  const { compactPracticeControls } = bind(['compactPracticeControls'], { S, WF, detectionTraining: () => false,
    esc: (x) => x, el: (tag, cls) => new Element(tag, cls) });
  compactPracticeControls(box);
  assert.deepEqual(box.children.filter((x) => x.cls === 'ic-row').map((x) => x.dataset.k), [...keys.slice(0, 5), 'reject_percent']);
  S.prac.step = 'dac'; compactPracticeControls(box);
  assert.equal(box.querySelectorAll('.ic-row').length, keys.length);
  assert.deepEqual(box.children.filter((x) => x.cls === 'ic-row').map((x) => x.dataset.k), ['gain_dB', 'range_mm', 'gate_on', 'reject_percent', 'peak_memory']);
  assert.equal(box.children.filter((x) => x.tag === 'details').length, 1);
});
