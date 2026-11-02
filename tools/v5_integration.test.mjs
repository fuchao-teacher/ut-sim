import { readFileSync, existsSync } from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { createTaskcard } from '../src/taskcard.js';
import { createWaveform, gateReading } from '../src/waveform.js';
import { createCaselib } from '../src/caselib.js';
import { createProcedure } from '../src/procedure.js';
import { makeReferenceCard, presetDetectionPractice } from '../src/v4-training.js';
import { visibleIndication } from '../src/learning-workflow.js';
import { detectionDacAlarm, detectionCaseSummary } from '../src/v5-practice.js';

// These tests execute actual application functions with real waveform / contract
// engines and object side-effects. They do not represent browser or render tests.
const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const json = (path) => JSON.parse(read(`../../${path}`));
const main = read('../src/main.js');
const rules = json('contracts/waveform_rules.json');
const standard = json('contracts/standard_nbt47013_3.json');
const specimens = json('contracts/specimens_manifest.json');
const manifest = json('contracts/model_manifest.json');
const cases = json('contracts/cases.json');
const scenes = json('knowledge/scenes.json');
const inspection = json('knowledge/inspection.json');
const practiceText = json('knowledge/practice.json');
const UI = json('knowledge/ui_strings.json');
const V4 = json('knowledge/v4.json');
const V5 = existsSync(new URL('../../knowledge/v5.json', import.meta.url)) ? json('knowledge/v5.json') : {};
const taskcard = createTaskcard({ tasks: json('contracts/tasks.json'), rules, standard, specimens, manifest,
  thickness: json('contracts/thickness.json') });
const makeWave = (specs) => createWaveform({ rules, manifest, dampingCycles: scenes.teaching_settings.lab.damping_cycles,
  scenarios: inspection.scenarios, specimens: specs });
const library = createCaselib({ cases, rules, standard, specimens, makeWave, scenario: inspection.scenarios[0] });

function extract(name) {
  const start = main.search(new RegExp(`(?:export )?(?:async )?function ${name}\\(`));
  assert.ok(start >= 0, `Missing application function ${name}`);
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
    if (c === '}' && --depth === 0) return main.slice(start, i + 1).replace(/^export /, '');
  }
  throw new Error(`Unclosed application function ${name}`);
}
function bind(names, env, extra = '') {
  const entries = Object.entries(env);
  return new Function(...entries.map(([key]) => key),
    `${extra}\n${names.map(extract).join('\n')}\nreturn {${names.join(',')}};`)(...entries.map(([, value]) => value));
}
const sourceValue = (name) => new Function('GATE_SUBS',
  `return ${main.match(new RegExp(`^const ${name} = (.+);$`, 'm'))?.[1]};`)(['gate_start_mm', 'gate_width_mm', 'gate_threshold_pct']);

function fixture() {
  const cs = library.libraryCase(library.library()[0].id);
  const specMan = { ...specimens, specimens: { ...specimens.specimens, ...specimens.runtime_specimens,
    [cs.specimen_id]: cs.plate } };
  const block = specimens.specimens[rules.practice.dac.specimen];
  const points = block.holes.map((hole) => ({ id: hole.id, S: hole.S_mm,
    G: rules.practice.acceptance_values.dac_G_dB[String(hole.S_mm)] }));
  const { practiceInst } = bind(['practiceInst'], { waveRules: rules,
    PRAC_SCENE: inspection.scenarios[0], SPEC_IDS: Object.keys(specimens.specimens),
    specT: (id) => (specimens.specimens[id].dims.thickness || specimens.specimens[id].dims.thickness_T).value });
  const prepared = presetDetectionPractice({ prac: {}, instrument: practiceInst(), rules, standard, taskcard, task: { level: 'II' },
    thickness_mm: 50, dacPoints: points, blockSpecimen: block, caseSpecimenId: cs.specimen_id });
  const P = prepared.prac;
  P.scan = { found: [], trail: [], cells: new Set() };
  P.quant = { target: null, pts: {}, results: {} };
  P.eval = { level: 'II', verdicts: {} };
  P.probe = { [cs.specimen_id]: { x: 0, y: 0 } };
  P.crit = null;
  P.inst.scene = inspection.scenarios[0].id;
  P.inst.defects = cs.plate.defects;
  const S = { mode: 'practice', exam: true, taskOn: false, learning: { role: 'exam', route: 'assessment' },
    prac: P, case: cs, insp: P.inst, panel: { frozen: false }, study: 'self' };
  const wave = makeWave(specMan);
  const proc = createProcedure({ rules, wave, specimens: specMan, standard });
  const calls = [];
  let locked = false, replay = false;
  const env = {
    S, V4, V5, UI, wave, proc, waveRules: rules, PR: rules.practice, PRAC_CTL: rules.practice.controls,
    STD: standard.items, PL: practiceText.labels, practiceDoc: practiceText, inspDoc: inspection,
    WF: json('knowledge/learning-workflow.json'), INSP_SCENES: Object.fromEntries(inspection.scenarios.map((item) => [item.id, item])),
    CAL_RULES: rules.practice.calibration, GATE_SUBS: ['gate_start_mm', 'gate_width_mm', 'gate_threshold_pct'],
    PANEL: inspection.panel, PRESET_LOCKS: sourceValue('PRESET_LOCKS'), FROZEN_OK: sourceValue('FROZEN_OK'),
    detectionDacAlarm, detectionCaseSummary, visibleIndication, gateReading,
    detectionTraining: () => true, selfStudy: () => false,
    examLocked: () => locked, replayOn: () => replay, practice: {},
    setFreeze: (on) => { S.panel.frozen = on; calls.push(['freeze', on]); },
    clearPeak: () => calls.push(['clearPeak']),
    onPracSetting: (key) => calls.push(['setting', key]),
    onCalibChange: () => { throw new Error('Prepared calibration must not be invalidated by allowed student controls'); },
    applyInspCoupling: () => {}, updateSteelSection: () => {},
    INSP_EMIT: Object.fromEntries(Object.keys(rules.controls).map((key) => [key,
      (value) => calls.push(['control', key, value])])),
    syncInspCtrls: () => calls.push(['sync']), inspKey: '',
    gateOf: (st = S.insp) => ({ on: st.gate_on, start_mm: st.gate_start_mm,
      width_mm: st.gate_width_mm, threshold_pct: st.gate_threshold_pct }),
    dacPts: () => P.dac.points, critG: () => P.sens.base + (P.sens.comp || 0),
    isPlate: (id) => id === cs.specimen_id, syncCritChips: () => {},
    syncDacAlarm: () => {}, trailT: null, marksDirty: false,
    panelMsg: (message) => calls.push(['message', message]),
    frozenBlock: () => S.panel.frozen,
    emit: (name, payload) => calls.push(['emit', name, payload]),
    setDetectionGain: () => { throw new Error('Per-frame criteria cannot reset the manually selected gain'); },
    keepDetectionUnsaturated: () => { throw new Error('Per-frame criteria cannot reset the manually selected gain'); },
    syncDetectionTarget: () => {}, renderPanel: () => {},
  };
  return { ...env, env, S, P, cs, calls,
    lock: (on) => { locked = on; }, replay: (on) => { replay = on; } };
}

test('detection gain and all gate controls alter the actual waveform instrument while calibration stays fixed', () => {
  const f = fixture();
  const { setInsp, setPracCtl } = bind(['setInsp', 'setPracCtl', 'onPracSetting'], f.env);
  const before = structuredClone(f.P.calib);
  setInsp('gain_dB', 25.4);
  assert.equal(f.S.insp.gain_dB, 25.4);
  assert.equal(f.P.inst.gain_dB, 25.4);
  setInsp('gate_start_mm', 10);
  setInsp('gate_width_mm', 5);
  setInsp('gate_threshold_pct', 30);
  setInsp('gate_on', false);
  assert.deepEqual(f.env.gateOf(), { on: false, start_mm: 10, width_mm: 5, threshold_pct: 30 });
  setPracCtl('peak_memory', true);
  assert.equal(f.S.insp.peak_memory, true);
  assert.deepEqual(f.P.calib, before);
  assert.equal(f.P.done.calibrate, true);
  assert.equal(f.P.done.dac, true);
  assert.equal(f.P.done.sensitivity, true);
  assert.ok(f.calls.some(([kind, key, value]) => kind === 'control' && key === 'gain_dB' && value === 25.4));
  for (const [key, value] of [['gain_dB', -1000], ['gain_dB', 1000], ['gate_start_mm', -1000], ['gate_width_mm', 1000]]) {
    setInsp(key, value);
    assert.ok(f.S.insp[key] >= rules.controls[key].min && f.S.insp[key] <= rules.controls[key].max, key);
  }
});

test('automatic gain executes against the selected real echo during detection and preserves sensitivity definitions', () => {
  const f = fixture();
  const defect = f.cs.plate.defects.find((item) => item.depth_mm != null);
  assert.ok(defect);
  const [x, y] = defect.centre_mm;
  Object.assign(f.S.insp, { probe_x_mm: x, probe_y_mm: y, gain_dB: 20,
    gate_on: true, gate_start_mm: Math.max(0, defect.depth_mm - 3), gate_width_mm: 7, gate_threshold_pct: 0 });
  const sensitivity = structuredClone(f.P.sens);
  const { autoGain } = bind(['setInsp', 'autoGain'], f.env);
  autoGain();
  assert.notEqual(f.S.insp.gain_dB, 20);
  assert.deepEqual(f.P.sens, sensitivity);
  const record = f.calls.filter(([kind, name]) => kind === 'emit' && name === 'instrument:auto_gain');
  assert.equal(record.length, 1);
  assert.equal(record[0][2].ok, true);
  const reading = gateReading(f.wave.synth(f.S.insp, { columns: 480, noise: false }), f.env.gateOf());
  assert.ok(Math.abs(reading.h - rules.auto_gain.target_percent) <= rules.auto_gain.tolerance_percent);
});

test('per-frame criteria, target selection state and probe movement preserve a manually chosen detection gain', () => {
  const f = fixture();
  const { updateCriteria } = bind(['updateCriteria'], f.env);
  f.P.step = 'quantify'; f.S.insp.gain_dB = 23.7;
  for (const [x, y, target] of [[0, 0, null], [120, 50, 'F1'], [-250, -180, 'F2']]) {
    f.P.probe[f.P.specimen] = { x, y };
    Object.assign(f.S.insp, { probe_x_mm: x, probe_y_mm: y });
    f.P.quant.target = target;
    updateCriteria();
    assert.equal(f.S.insp.gain_dB, 23.7);
    assert.equal(f.P.inst.gain_dB, 23.7);
  }
});

test('submitted and replayed detection controls cannot mutate gain, gates, peak memory or invoke automatic gain', () => {
  for (const condition of ['submitted', 'replay']) {
    const f = fixture();
    if (condition === 'submitted') f.lock(true); else f.replay(true);
    const before = structuredClone(f.S.insp);
    const { setInsp, setPracCtl, autoGain } = bind(['setInsp', 'setPracCtl', 'autoGain'], f.env);
    setInsp('gain_dB', 50); setInsp('gate_start_mm', 12); setPracCtl('peak_memory', true); autoGain();
    assert.deepEqual(f.S.insp, before, condition);
    assert.deepEqual(f.calls, [], condition);
  }
});

test('each new detection instrument enables visible DAC and automatic DAC alarms before any student action', () => {
  const f = fixture();
  assert.equal(f.P.inst.dac_show, true);
  assert.equal(f.P.inst.dac_alarm_enabled, true);
  assert.deepEqual(f.P.scan.found, []);
  assert.deepEqual(f.P.quant.results, {});
});

test('application alarm enable switch, status badge and contract events follow the same real selected echo', () => {
  const f = fixture();
  const item = f.cs.reference.items.find((ref) => ref.determined);
  const defect = f.cs.plate.defects.find((entry) => entry.id === item.id);
  const [x, y] = defect.centre_mm;
  Object.assign(f.S.insp, { probe_x_mm: x, probe_y_mm: y,
    gate_on: true, gate_start_mm: defect.depth_mm - 3, gate_width_mm: 7, gate_threshold_pct: 5 });
  f.P.crit = f.proc.criteria(f.S.insp, f.P.dac.points, f.P.sens.base);
  const badge = { textContent: '', dataset: {}, attrs: {}, setAttribute(key, value) { this.attrs[key] = value; } };
  const { syncDacAlarm, setDacAlarmEnabled } = bind(['syncDacAlarm', 'setDacAlarmEnabled'], {
    ...f.env, dacAlarmOn: false, $: (id) => id === 'dacAlarmStatus' ? badge : null,
  });
  syncDacAlarm(f.P.crit);
  assert.equal(badge.dataset.active, 'true');
  assert.equal(badge.textContent, V5.alarm_triggered);
  assert.equal(badge.attrs.role, 'status');
  syncDacAlarm(f.P.crit);
  assert.equal(f.calls.filter(([kind, name]) => kind === 'emit' && name === 'practice:dac_alarm').length, 1);
  setDacAlarmEnabled(false);
  assert.equal(f.S.insp.dac_alarm_enabled, false);
  assert.equal(badge.dataset.active, 'false');
  assert.equal(badge.textContent, V5.alarm_off);
  setDacAlarmEnabled(true);
  assert.equal(badge.dataset.active, 'true');
  f.S.insp.gate_on = false;
  syncDacAlarm(f.P.crit);
  assert.equal(badge.dataset.active, 'false');
  assert.equal(badge.textContent, V5.alarm_ready);
  const events = f.calls.filter(([kind, name]) => kind === 'emit' && name === 'practice:dac_alarm').map(([, , payload]) => payload);
  assert.deepEqual(events.map((payload) => payload.enabled), [true, false, true, false]);
  assert.equal(events[0].defect_id, defect.id);
  assert.ok(Number.isFinite(events[0].f1_dac_dB));
  assert.equal(events[1].defect_id, null);
  assert.equal(events[1].f1_dac_dB, null);
  f.lock(true); setDacAlarmEnabled(false);
  assert.equal(f.S.insp.dac_alarm_enabled, true);
});

class Element {
  constructor(tag, cls = '', html = '') {
    this.tag = tag; this.cls = cls; this.innerHTML = html; this.children = [];
    this.dataset = {}; this.parent = null; this.attrs = {};
    this.classList = { add: (value) => { this.cls += ` ${value}`; }, toggle: () => {} };
  }
  get lastChild() { return this.children.at(-1); }
  append(...children) { children.forEach((child) => this.appendChild(child)); }
  appendChild(child) { child.remove(); child.parent = this; this.children.push(child); return child; }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter((child) => child !== this); this.parent = null; }
  setAttribute(key, value) { this.attrs[key] = value; }
  all() { return this.children.flatMap((child) => [child, ...child.all()]); }
  querySelectorAll(selector) {
    return this.all().filter((child) => selector === '.ic-row' && child.cls.split(' ').includes('ic-row'));
  }
  querySelector(selector) {
    return this.all().find((child) => selector === 'details.workflow-advanced'
      && child.tag === 'details' && child.cls === 'workflow-advanced') || null;
  }
}

test('the actual right-side controls expose gain and gate input / nudges in all detection stages without an advanced fold', () => {
  const f = fixture();
  const { inspControls } = bind(['inspControls', 'compactPracticeControls', 'setInsp', 'setPracCtl', 'onPracSetting',
    'restoreDetectionGain', 'setDacShow'], {
    ...f.env, el: (tag, cls, html) => new Element(tag, cls, html), esc: (value) => String(value),
    setDacAlarmEnabled: () => {}, autoGain: () => {},
    floatControls: () => true, holdRepeat: () => {}, nudgeProbe: () => {}, probeStep: () => 0.5, PROBE_FINE_MM: 0.5, quickFloat: { step: null },
    PLIM: { keyboard_step_mm: 1 },
  });
  for (const stage of ['scan', 'quantify', 'evaluate']) {
    f.P.step = stage;
    const box = inspControls({ practice: true });
    const rows = box.children.filter((child) => child.cls.split(' ').includes('ic-row'));
    assert.deepEqual(rows.map((row) => row.dataset.k), ['gain_dB', 'peak_memory', 'dac_alarm_enabled', 'gate_on', 'probe_move']);
    assert.equal(box.querySelector('details.workflow-advanced'), null);
    const gain = rows.find((row) => row.dataset.k === 'gain_dB');
    const oneUp = gain.all().find((element) => element.tag === 'button' && element.innerHTML === '+1');
    assert.ok(oneUp); f.S.insp.gain_dB = 25; oneUp.onclick(); assert.equal(f.S.insp.gain_dB, 26);
    for (const [kind, value] of [['scan', f.P.sens.scan], ['base', f.P.sens.base]]) {
      gain.all().find((element) => element.dataset.restore === kind).onclick();
      assert.equal(f.S.insp.gain_dB, Math.round(value * 10) / 10);
    }
    const gate = rows.find((row) => row.dataset.k === 'gate_on');
    for (const key of f.env.GATE_SUBS) {
      const number = gate.all().find((element) => element.tag === 'input' && element.type === 'number' && element.dataset.k === key);
      assert.ok(number, `${stage}:${key}`);
      assert.ok(number.attrs['aria-label']);
      number.value = '13'; number.onchange(); assert.equal(f.S.insp[key], 13);
      const before = f.S.insp[key]; number.value = ''; number.onchange(); assert.equal(f.S.insp[key], before);
      const buttons = number.parent.all().filter((element) => element.tag === 'button');
      assert.equal(buttons.length, key === 'gate_threshold_pct' ? 2 : 4);
      buttons.at(-1).onclick(); assert.equal(f.S.insp[key], 18);
    }
  }
});

test('visible task target updates the unique confirmed record count and contains counts without reference geometry or verdicts', () => {
  const f = fixture();
  const box = { innerHTML: '', querySelector: () => null };
  const format = (text, values) => text.replace(/\{([a-z_]+)\}/g, (_, key) => values[key] ?? `{${key}}`);
  const { syncDetectionTarget } = bind(['syncDetectionTarget'], {
    ...f.env, $: (id) => id === 'detectionTarget' ? box : null, esc: (value) => String(value), v4Format: format,
    REGION_HINT_POINTS: 2,
  });
  syncDetectionTarget();
  const first = detectionCaseSummary(f.cs, []);
  assert.ok(box.innerHTML.includes(format(V5.target_number, first)));
  const prog = (sum) => format(V5.target_progress, { ...sum, recorded_determined: sum.recordedDetermined });
  assert.ok(first.determined === 0
    ? box.innerHTML.includes(V5.target_none)
    : box.innerHTML.includes(prog(first)));
  assert.ok(box.innerHTML.includes(format(V5.hint_cost, { n: 2 })) || first.complete);
  const det = f.cs.reference.items.find((item) => item.determined)?.id || f.cs.plate.defects[0].id;
  f.P.scan.found.push({ id: det, confirmed: true });
  f.P.scan.found.push({ id: det, confirmed: true });
  syncDetectionTarget();
  const later = detectionCaseSummary(f.cs, f.P.scan.found);
  assert.equal(later.recorded, 1);
  assert.ok(later.determined === 0
    ? box.innerHTML.includes(V5.target_none)
    : box.innerHTML.includes(prog(later)));
  for (const id of f.cs.plate.defects.map((defect) => defect.id)) assert.equal(box.innerHTML.includes(id), false);
  assert.equal(/centre_mm|reference_mm|reference_eq|depth_mm|verdict|defect_type/.test(box.innerHTML), false);
});

test('V5.1 card design persistence cannot overwrite V4/V5 or persist a self-study card', () => {
  const memory = new Map([['ut.v4.design', 'V4-preserved'], ['ut.v5.design', 'V5-preserved']]);
  const S = { learning: { role: 'student', route: 'task', student: {} }, task: { cards: {}, id: null } };
  const { persistDesignResult } = bind(['persistDesignResult'], { S, localStorage: {
    setItem: (key, value) => memory.set(key, value) } });
  persistDesignResult();
  assert.equal(memory.size, 2);
  Object.assign(S.learning, { role: 'exam', route: 'design' });
  S.task.cards.T1 = { confirmed: true, score: { total: 100 } }; S.task.id = 'T1';
  persistDesignResult();
  assert.equal(memory.get('ut.v4.design'), 'V4-preserved');
  assert.equal(memory.get('ut.v5.design'), 'V5-preserved');
  assert.equal(JSON.parse(memory.get('ut.m11.design')).id, 'T1');
});

test('system quantify stops where the criterion lamp goes off, matching the case reference boundary', () => {
  const f = fixture();
  const ref = f.cs.reference;
  const it = ref.items.find((x) => x.determined && f.cs.plate.defects.find((d) => d.id === x.id).type !== 'cluster');
  assert.ok(it, 'library case 01 has a determined single indication');
  const d = f.cs.plate.defects.find((x) => x.id === it.id);
  f.P.scan.found = [{ id: d.id, x: d.centre_mm[0], y: d.centre_mm[1], flags: ['F1_over_dac'] }];
  const { quantPlan } = bind(['quantPlan', 'f1At'], { ...f.env, practice: { clamp: (id, x, y) => ({ x, y }) },
    QUANT_REACH_MM: sourceValue('QUANT_REACH_MM'), QUANT_STEP_MM: sourceValue('QUANT_STEP_MM') });
  const [block] = quantPlan(d.id);
  const R = ref.rects[d.id];
  const near = (a, b) => assert.ok(Math.abs(a - b) <= 0.2, `${a} vs ${b}`);
  near(block.pts[0][0], R.x0); near(block.pts[1][0], R.x1); near(block.pts[2][1], R.y1); near(block.pts[3][1], R.y0);
  assert.ok(Math.abs(f.proc.rect(block.pts).area - R.area_mm2) / R.area_mm2 <= rules.practice.tolerance.indicated_area_relative);
  for (const [x, y] of block.pts) assert.equal(block.on(x, y), false);
  assert.equal(block.on(...block.c), true);
});

test('verdict bands name the quantity that applies at the level and the band of the measured value', () => {
  const f = fixture();
  const { verdictBands } = bind(['verdictBands'], { ...f.env, PRD: { unit_dB: 'dB' },
    fmtDb: (v) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(1)} dB` });
  const item = { id: 'X', determined: true, flags: ['F1_over_dac'], S_mm2: 34, D_dB: 11.8 };
  const II = verdictBands('II', item);
  assert.equal(II.q, 'D');
  assert.equal(II.at, 1);
  assert.ok(II.text.includes('Φ5 +8 dB') && II.text.includes('Φ5 +14 dB'));
  const III = verdictBands('III', item);
  assert.equal(III.q, 'S');
  assert.equal(III.at, 0);
  assert.equal(verdictBands('II', { ...item, flags: ['B1_below_50'] }).q, 'S');
  assert.equal(verdictBands('II', { ...item, determined: false }), null);
});
