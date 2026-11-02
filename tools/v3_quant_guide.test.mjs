// Run: node --test tools/v3_quant_guide.test.mjs
// Execute the current main functions with plain objects; no DOM, rendering, service or browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const json = (p) => JSON.parse(readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8'));
const waveRules = json('contracts/waveform_rules.json');
const PR = waveRules.practice;
const GUIDE = json('knowledge/practice.json').guide;
const TASK_DRIVE = json('contracts/tasks.json').drive;
const V4 = json('knowledge/v4.json');

function extract(name) {
  const start = main.search(new RegExp(`^function ${name}\\(`, 'm'));
  assert.ok(start >= 0, `Missing function ${name}`);
  // These main functions use an unindented closing brace; internal blocks remain indented.
  const end = main.indexOf('\n}\n', start);
  assert.ok(end > start, `Missing function terminator for ${name}`);
  return main.slice(start, end + 2);
}

function bind(names, env) {
  const entries = Object.entries(env);
  return new Function(...entries.map(([key]) => key), `${names.map(extract).join('\n')}\nreturn {${names.join(',')}};`)(...entries.map(([, value]) => value));
}

const fourPoints = [[0, 0], [0, 10], [10, 0], [10, 10]];
function guideFixture({ required = ['length', 'area'], judge = { length: true, area: true },
  points = fourPoints, subs = [], kind = 'lamination', target = 'target' } = {}) {
  const S = {
    insp: { reject_percent: 0 },
    prac: { done: { quantify: true }, quant: {
      target, pts: { target: points }, subs: { target: subs }, eq: { target: { dB: 12, S: 30 } },
      results: { target: { length: 10, area: 100, eq: 12, judge } },
    } },
  };
  return { S, ...bind(['guideChecks', 'guideItems'], {
    S, PR, GUIDE, V4, detectionTraining: () => false, selfStudy: () => false,
    lastGate: null, judgedOf: (id) => id === 'target' ? required : [], typeOf: () => kind,
  }) };
}

test('four recorded points and a stored result do not turn a failed dimensional judgement into completion', () => {
  const f = guideFixture({ judge: { length: false, area: true } });
  const checks = f.guideChecks('quantify');
  assert.equal(checks.points, true);
  assert.equal(checks.result, false);
  assert.equal(f.S.prac.done.quantify, true);
});

test('all required length and area judgements allow completion without an inapplicable equivalent', () => {
  const checks = guideFixture().guideChecks('quantify');
  assert.equal(checks.result, true);
  assert.equal(checks.eq, null);
});

test('a recorded equivalent value fails when its required judgement is false', () => {
  const f = guideFixture({ required: ['length', 'area', 'equivalent'], judge: { length: true, area: true, equivalent: false } });
  assert.ok(f.S.prac.quant.eq.target);
  const checks = f.guideChecks('quantify');
  assert.equal(checks.eq, false);
  assert.equal(checks.result, false);
});

test('a required equivalent completes only when its judgement and the other required judgements pass', () => {
  const checks = guideFixture({ required: ['length', 'area', 'equivalent'], judge: { length: true, area: true, equivalent: true } }).guideChecks('quantify');
  assert.equal(checks.eq, true);
  assert.equal(checks.result, true);
});

test('an absent required dimensional judgement does not pass by truthiness or a completed-state flag', () => {
  assert.equal(guideFixture({ judge: { length: true } }).guideChecks('quantify').result, false);
  assert.equal(guideFixture({ judge: { length: true, area: 1 } }).guideChecks('quantify').result, false);
});

test('an empty requirement list or absent target cannot manufacture a successful result', () => {
  assert.equal(guideFixture({ required: [] }).guideChecks('quantify').result, false);
  assert.equal(guideFixture({ target: null }).guideChecks('quantify').result, false);
});

test('the quantity guide removes the equivalent instruction when the selected indication does not require it', () => {
  const f = guideFixture();
  const items = f.guideItems('quantify');
  assert.equal(items.some((item) => item.id === 'eq'), false);
  assert.ok(items.some((item) => item.id === 'points'));
  assert.ok(items.some((item) => item.id === 'result'));
  assert.ok(GUIDE.steps.quantify.some((item) => item.id === 'eq'));
});

test('the quantity guide retains equivalent instructions when the selected indication requires them', () => {
  const items = guideFixture({ required: ['length', 'area', 'equivalent'] }).guideItems('quantify');
  assert.ok(items.some((item) => item.id === 'eq'));
});

test('an unfinished current cluster block prevents an earlier successful result from appearing complete', () => {
  const f = guideFixture({ kind: 'cluster', points: fourPoints.slice(0, 2), subs: [fourPoints] });
  const checks = f.guideChecks('quantify');
  assert.equal(checks.points, true);
  assert.equal(checks.result, false);
});

test('finished cluster blocks with an empty current block can complete when all required judgements pass', () => {
  const checks = guideFixture({ kind: 'cluster', points: [], subs: [fourPoints, fourPoints] }).guideChecks('quantify');
  assert.equal(checks.points, true);
  assert.equal(checks.result, true);
});

function candidateFixture(taskOn) {
  const S = { taskOn, insp: { gain_dB: 30, range_mm: 100, gate_on: true } };
  const lastFrame = { marker: 'current-noisy-screen', state: S.insp, hi: new Float32Array([21, 34]) };
  const selectedGate = { on: true, start_mm: 20, width_mm: 10, threshold_pct: 5 };
  const points = [{ S: 15, G: 20 }, { S: 45, G: 35 }];
  const wave = { marker: 'wave' }, proc = { marker: 'procedure' };
  const expected = { id: 'chosen', S: 24, H: 34 };
  let captured;
  const methods = bind(['currentRecordCandidate'], {
    S, lastFrame, wave, proc, PR, TASK_DRIVE, waveRules,
    dacPts: () => points, critG: () => 35, gateOf: () => selectedGate,
    visibleIndication: (options) => { captured = options; return expected; },
  });
  return { ...methods, S, lastFrame, selectedGate, points, wave, proc, expected, captured: () => captured };
}

test('the training record candidate delegates the actual last display frame and selected instrument gate', () => {
  const f = candidateFixture(false);
  assert.equal(f.currentRecordCandidate(), f.expected);
  const options = f.captured();
  assert.equal(options.frame, f.lastFrame);
  assert.equal(options.gate, f.selectedGate);
  assert.equal(options.state, f.S.insp);
  assert.equal(options.wave, f.wave);
  assert.equal(options.procedure, f.proc);
  assert.equal(options.points, f.points);
  assert.equal(options.baseGain, 35);
  assert.equal(options.minDb, PR.mark.min_f1_minus_dac_dB);
  assert.equal(options.minPercent, waveRules.display.echo_label_min_percent);
});

test('the task record candidate retains its task visibility floor while using the same displayed frame and gate', () => {
  const f = candidateFixture(true);
  assert.equal(f.currentRecordCandidate(), f.expected);
  const options = f.captured();
  assert.equal(options.frame, f.lastFrame);
  assert.equal(options.gate, f.selectedGate);
  assert.equal(options.minPercent, TASK_DRIVE.mark_visible.screen_percent);
});
