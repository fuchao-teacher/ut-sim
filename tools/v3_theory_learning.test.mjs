import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createWaveform, gateReading } from '../src/waveform.js';
import { theoryStateAtStep, compareTheoryReadings, theoryLearningModel, renderTheoryLearning } from '../src/theory-learning.js';

const json = (path) => JSON.parse(readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8'));
const text = json('knowledge/theory-learning.json');
const rules = json('contracts/waveform_rules.json');
const manifest = json('contracts/model_manifest.json');
const sceneDoc = json('knowledge/scenes.json');
const scenarios = json('knowledge/inspection.json').scenarios;
const wave = createWaveform({ rules, manifest, dampingCycles: sceneDoc.teaching_settings.lab.damping_cycles, scenarios });
const state = { ...Object.fromEntries(Object.entries(rules.controls).map(([key, value]) => [key, value.default])), scene: 'plate_clean' };
const experiment = (id) => text.experiments.find((item) => item.id === id);
const compare = (id) => compareTheoryReadings({ experiment: experiment(id), wave, state, baseline: text.baseline });
const close = (actual, expected, tolerance = 1e-6) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);

test('all six short tasks have a unique valid answer and two or three choices', () => {
  assert.equal(text.experiments.length, 6);
  assert.equal(new Set(text.experiments.map((item) => item.id)).size, 6);
  for (const item of text.experiments) {
    assert.ok(item.options.length >= 2 && item.options.length <= 3);
    assert.equal(item.options.filter((option) => option.id === item.correct_answer).length, 1);
    assert.ok(item.steps.length >= 2);
  }
});

test('one pulse adds a real back-wall echo with round-trip path and one-way displayed sound path', () => {
  const { before, after } = compare('exp__pulse_cycle');
  assert.equal(before.visible, false);
  assert.equal(before.metrics.roundtrip_us, null);
  assert.equal(after.visible, true);
  close(after.metrics.roundtrip_us, wave.tof(100));
  close(after.metrics.roundtrip_path_mm, 100);
  close(after.metrics.sound_path_mm, 50);
});

test('the linear gain experiment changes actual gate amplitude by 10^(6/20), not echo time', () => {
  const { before, after, linear } = compare('exp__gain');
  assert.equal(linear, true);
  assert.ok(before.metrics.height_percent > 30 && after.metrics.height_percent < 100);
  close(after.metrics.height_percent / before.metrics.height_percent, 10 ** (6 / 20), 1e-5);
  close(after.metrics.roundtrip_us, before.metrics.roundtrip_us);
  close(after.metrics.sound_path_mm, before.metrics.sound_path_mm);
});

test('changing set velocity preserves physical flight time but changes displayed sound path', () => {
  const { before, after } = compare('exp__velocity');
  close(before.metrics.sound_path_mm, 50);
  close(after.metrics.sound_path_mm, 50 * 3000 / 5900);
  close(after.metrics.roundtrip_us, before.metrics.roundtrip_us);
  close(after.metrics.thickness_mm, 50);
});

test('a clipped echo cannot be used to confirm a linear amplitude prediction', () => {
  const changedRules = structuredClone(rules);
  changedRules.amplitude.gain.fsh_at_ref_percent = 160;
  const clippedWave = createWaveform({ rules: changedRules, manifest,
    dampingCycles: sceneDoc.teaching_settings.lab.damping_cycles, scenarios });
  const options = { text, experimentId: 'exp__gain', wave: clippedWave, state, step: 1, prediction: 'height_only' };
  const model = theoryLearningModel(options);
  assert.equal(model.ready, true);
  assert.equal(model.comparison.linear, false);
  assert.equal(model.correct, null);
  const html = renderTheoryLearning(options);
  assert.ok(html.includes(text.labels.saturation_note));
  assert.ok(html.includes(text.labels.inapplicable));
  assert.equal(html.includes(text.labels.correct), false);
});

test('an air gap suppresses the echo despite a large receiver gain increase', () => {
  const { before, after, stages } = compare('exp__coupling');
  assert.equal(before.visible, true);
  assert.equal(stages[1].visible, false);
  assert.equal(after.visible, false);
  assert.equal(after.metrics.gain_dB, 60);
  assert.ok(after.metrics.height_percent < 0.001);
  assert.ok(after.metrics.height_percent < before.metrics.height_percent / 100000);
});

test('a smaller range removes B1 from the displayed window while its reference travel time is unchanged', () => {
  const { before, after } = compare('exp__range');
  assert.equal(before.visible, true);
  assert.equal(after.visible, false);
  assert.equal(after.frame.echoes.some((echo) => echo.id === 'B1'), false);
  close(after.metrics.range_mm, 25);
  close(after.metrics.roundtrip_us, before.metrics.roundtrip_us);
  close(after.metrics.sound_path_mm, 50);
});

test('the actual gate algorithm selects B1 then B2 without changing the physical thickness', () => {
  const { before, after } = compare('exp__gate');
  assert.equal(before.metrics.gate_echo, 'B1');
  assert.equal(after.metrics.gate_echo, 'B2');
  close(before.metrics.gate_sound_path_mm, 50);
  close(after.metrics.gate_sound_path_mm, 100);
  close(after.metrics.thickness_mm, before.metrics.thickness_mm);
  const read = gateReading(after.frame, { on: true, start_mm: 90, width_mm: 20, threshold_pct: 5 });
  close(after.metrics.height_percent, read.h);
  close(after.metrics.gate_sound_path_mm, read.s);
});

test('experiment presets isolate old practice data and never mutate the supplied state', () => {
  const original = { ...state, specimen_id: 'old-plate', thickness_mm: 80, zero_us: 9,
    reject_percent: 50, defects: [{ id: 'old' }], coupling: 'air_gap', gain_dB: 80 };
  const snapshot = JSON.stringify(original);
  const prepared = theoryStateAtStep(experiment('exp__gain'), original, 0, text.baseline);
  assert.equal(JSON.stringify(original), snapshot);
  assert.equal(prepared.specimen_id, null);
  assert.equal(prepared.defects, null);
  assert.equal(prepared.thickness_mm, 50);
  assert.equal(prepared.zero_us, 0);
  assert.equal(prepared.reject_percent, 0);
  assert.equal(prepared.gain_dB, 24);
  assert.equal(prepared.coupling, 'good');
});

test('students must predict before comparison and reach the final condition before explanation', () => {
  const base = { text, experimentId: 'exp__gain', wave, state };
  const unanswered = theoryLearningModel({ ...base, step: 1 });
  assert.equal(unanswered.mayCompare, false);
  assert.equal(unanswered.ready, false);
  const first = theoryLearningModel({ ...base, step: 0, prediction: 'height_only' });
  assert.equal(first.mayCompare, true);
  assert.equal(first.ready, false);
  const last = theoryLearningModel({ ...base, step: 1, prediction: 'height_only' });
  assert.equal(last.ready, true);
  assert.equal(last.correct, true);
  assert.equal(theoryLearningModel({ ...base, step: 1, prediction: 'sound_pressure' }).correct, false);
  assert.equal(theoryLearningModel({ ...base, step: 1, prediction: 'invalid' }).mayCompare, false);
});

test('teachers can compare and explain immediately without selecting an answer', () => {
  const options = { text, experimentId: 'exp__gate', wave, state, step: 0, teacher: true };
  const model = theoryLearningModel(options);
  assert.equal(model.mayCompare, true);
  assert.equal(model.ready, true);
  assert.equal(model.correct, null);
  const html = renderTheoryLearning(options);
  assert.ok(html.includes('theory-comparison'));
  assert.ok(html.includes('theory-explanation'));
  assert.equal(html.includes('data-theory-option='), false);
});

test('HTML rendering gates answer content and escapes knowledge text', () => {
  const options = { text, experimentId: 'exp__range', wave, state, step: 1 };
  const unanswered = renderTheoryLearning(options);
  assert.equal(unanswered.includes('theory-comparison'), false);
  assert.equal(unanswered.includes('theory-explanation'), false);
  assert.equal(unanswered.includes(experiment('exp__range').explanation), false);
  const answered = renderTheoryLearning({ ...options, prediction: 'window_only' });
  assert.ok(answered.includes('theory-comparison'));
  assert.ok(answered.includes('theory-explanation'));
  assert.ok(answered.includes('50.0 mm'));
  const hostile = JSON.parse(JSON.stringify(text));
  hostile.experiments[0].question = '<script>alert(1)</script>';
  const escaped = renderTheoryLearning({ ...options, text: hostile, experimentId: 'exp__pulse_cycle' });
  assert.equal(escaped.includes('<script>'), false);
  assert.ok(escaped.includes('&lt;script&gt;'));
});

test('calibration prose separates an extra 50 mm round trip from a 25 mm displayed sound-path interval', () => {
  const practice = json('knowledge/practice.json');
  const reason = practice.cards.find((item) => item.id === 'calibrate').reason[2];
  assert.ok(reason.includes('50 mm'));
  assert.ok(reason.includes('25 mm'));
  assert.equal(reason.includes('多走一个板厚'), false);
});
