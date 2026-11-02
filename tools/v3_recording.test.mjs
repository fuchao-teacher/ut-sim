// Run: node --test tools/v3_recording.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { visibleIndication, visibleIndications } from '../src/learning-workflow.js';
import { createWaveform, gateReading } from '../src/waveform.js';
import { createProcedure } from '../src/procedure.js';

const gate = (start_mm, width_mm = 4, threshold_pct = 5) => ({ on: true, start_mm, width_mm, threshold_pct });
const echo = (id, S, pct, patch = {}) => ({ type: 'defect', id, k: 1, x_mm: S, t: S, len: 4, pct, ...patch });

// A controlled frame uses 2000 m/s, so 1 us equals 1 mm displayed depth. Signal columns and envelope
// peaks are deliberately separate from leading-edge S; the production gate reader selects the target.
function fixture(echoes = [echo('strong', 20, 80), echo('weak', 40, 25)], changes = {}) {
  const state = { range_mm: 100, velocity_m_s: 2000, gain_dB: 30, reject_percent: 0, ...changes };
  const columns = 100;
  const hi = new Float32Array(columns);
  const lo = new Float32Array(columns);
  const list = [{ type: 'main_bang', id: 'main', k: 0, t: 0, x_mm: 0, len: 2, pct: 10 }, ...echoes];
  for (const e of list) {
    const peak = state.velocity_m_s * (e.t + e.len / 2) / 2 * 1e-3;
    if (peak < 0 || peak > state.range_mm) continue;
    const col = Math.min(columns - 1, Math.floor(peak / state.range_mm * columns));
    hi[col] = Math.min(100, e.pct);
  }
  const frame = { echoes: list, state, columns, shown: columns, tWin: state.range_mm * 2000 / state.velocity_m_s, rect: true, hi, lo };
  const procedure = {
    f1MinusDac: (_points, _S, H, G) => 20 * Math.log10(H / (80 * 10 ** ((G - 30) / 20))),
    criteria: () => ({ defect: 'strong', flags: ['F1_over_dac'] }),
  };
  return { state, wave: { synth: () => frame }, procedure, points: [], baseGain: 30, minDb: -20, frame };
}

test('visible candidates explain component height, clipping and envelope peak without selecting a target', () => {
  const candidates = visibleIndications(fixture());
  assert.deepEqual(candidates.map((c) => c.id), ['strong', 'weak']);
  assert.deepEqual(candidates.map((c) => c.S), [20, 40]);
  assert.deepEqual(candidates.map((c) => c.peakS), [22, 42]);
  assert.deepEqual(candidates.map((c) => c.H), [80, 25]);
  assert.deepEqual(candidates.map((c) => c.rawH), [80, 25]);
  assert.deepEqual(candidates.map((c) => c.saturated), [false, false]);
  assert.deepEqual(candidates[1].flags, []);
});

test('omitting the gate preserves the legacy strongest-visible selection', () => {
  assert.equal(visibleIndication(fixture()).id, 'strong');
});

test('a narrow gate selects a weaker visible echo and reports the same S and H as the instrument gate', () => {
  const data = fixture();
  const chosenGate = gate(41, 2);
  const reading = gateReading(data.frame, chosenGate);
  const chosen = visibleIndication({ ...data, gate: chosenGate });
  assert.equal(chosen.id, 'weak');
  assert.equal(chosen.S, reading.s);
  assert.equal(chosen.H, reading.h);
  assert.ok(chosen.dB < 0);
});

test('a gate may include the envelope peak while excluding the leading-edge S', () => {
  const chosen = visibleIndication({ ...fixture(), gate: gate(41, 2) });
  assert.equal(chosen.S, 40);
  assert.equal(chosen.peakS, 42);
});

test('an echo starting inside the gate cannot be selected if its envelope peak is outside', () => {
  assert.equal(visibleIndication({ ...fixture(), gate: gate(39, 2) }), null);
});

test('a disabled or explicitly absent gate never falls back to the strongest echo', () => {
  const data = fixture();
  assert.equal(visibleIndication({ ...data, gate: { ...gate(19), on: false } }), null);
  assert.equal(visibleIndication({ ...data, gate: null }), null);
});

test('an empty gate and a frame without first defect echoes have no target', () => {
  assert.equal(visibleIndication({ ...fixture(), gate: gate(60) }), null);
  assert.deepEqual(visibleIndications(fixture([])), []);
  assert.equal(visibleIndication({ ...fixture([]), gate: gate(20) }), null);
});

test('a noise-only gate trigger is not a recordable indication', () => {
  const data = fixture([]);
  data.frame.hi[52] = 50;
  const chosenGate = gate(51);
  assert.ok(gateReading(data.frame, chosenGate).s != null);
  assert.equal(gateReading(data.frame, chosenGate).echo, null);
  assert.equal(visibleIndication({ ...data, gate: chosenGate }), null);
});

test('a stronger bottom echo in the gate requires narrowing the gate rather than silently selecting a defect', () => {
  const data = fixture([echo('strong', 20, 80), echo('B1', 50, 99, { type: 'back_wall' })]);
  const chosenGate = gate(19, 35);
  assert.equal(gateReading(data.frame, chosenGate).echo.id, 'B1');
  assert.equal(visibleIndication({ ...data, gate: chosenGate }), null);
});

test('a multiple echo cannot alias its recordable first echo by the shared indication id', () => {
  const data = fixture([echo('same', 20, 80), echo('same', 40, 60, { k: 2 })]);
  assert.equal(visibleIndication({ ...data, gate: gate(41) }), null);
});

test('several first echoes sharing an indication id retain the selected member depth', () => {
  const data = fixture([echo('cluster', 20, 80, { member: 0 }), echo('cluster', 40, 25, { member: 1 })]);
  const chosen = visibleIndication({ ...data, gate: gate(41) });
  assert.equal(chosen.id, 'cluster');
  assert.equal(chosen.S, 40);
  assert.equal(chosen.rawH, 25);
});

test('screen height, gate threshold, suppression and DAC recording floor remain independently binding', () => {
  const data = fixture([echo('weak', 40, 25)]);
  assert.equal(visibleIndication({ ...data, gate: gate(41), minPercent: 26 }), null);
  assert.equal(visibleIndication({ ...data, gate: gate(41, 4, 26) }), null);
  assert.equal(visibleIndication({ ...fixture([echo('weak', 40, 25)], { reject_percent: 26 }), gate: gate(41) }), null);
  assert.equal(visibleIndication({ ...data, gate: gate(41), minDb: -5 }), null);
});

test('a weaker gated echo above its own DAC retains its F1 criterion for quantification', () => {
  const data = fixture([echo('strong', 20, 240), echo('weak', 40, 120)]);
  data.procedure.criteria = () => ({ defect: 'strong', flags: ['F1_over_dac', 'B1_below_50'] });
  const chosen = visibleIndication({ ...data, baseGain: 24, gate: gate(41) });
  assert.equal(chosen.id, 'weak');
  assert.deepEqual(chosen.flags, ['F1_over_dac']);
  assert.ok(chosen.dB > 0);
  assert.ok(chosen.flags.length > 0);
  // The legacy global selection and candidate list still use the overall procedure ownership.
  assert.deepEqual(visibleIndications(data).find((candidate) => candidate.id === 'weak').flags, []);
  assert.deepEqual(visibleIndication(data).flags, ['F1_over_dac', 'B1_below_50']);
});

test('a weaker gated echo below DAC gains neither an F1 criterion nor another indication bottom-loss criterion', () => {
  const data = fixture([echo('strong', 20, 240), echo('weak', 40, 25)]);
  data.procedure.criteria = () => ({ defect: 'strong', flags: ['F1_over_dac', 'B1_below_50'] });
  const chosen = visibleIndication({ ...data, baseGain: 24, gate: gate(41) });
  assert.equal(chosen.id, 'weak');
  assert.deepEqual(chosen.flags, []);
});

test('a gated echo exactly on DAC is not marked as above DAC', () => {
  const data = fixture([echo('strong', 20, 240), echo('weak', 40, 80)]);
  assert.deepEqual(visibleIndication({ ...data, gate: gate(41) }).flags, []);
});

test('bottom-loss ownership survives only for the selected indication identified by procedure criteria', () => {
  const data = fixture([echo('strong', 20, 240), echo('weak', 40, 25)]);
  data.procedure.criteria = () => ({ defect: 'weak', flags: ['B1_below_50'] });
  assert.deepEqual(visibleIndication({ ...data, gate: gate(41) }).flags, ['B1_below_50']);
  assert.deepEqual(visibleIndication({ ...data, gate: gate(21) }).flags, ['F1_over_dac']);
});

test('a saturated candidate remains selectable with clipped screen H and explicit raw height', () => {
  const data = fixture([echo('strong', 20, 250)]);
  const chosen = visibleIndication({ ...data, gate: gate(21) });
  assert.equal(chosen.H, 100);
  assert.equal(chosen.rawH, 250);
  assert.equal(chosen.saturated, true);
});

test('a first echo masked by the main-bang ring-down cannot be recorded', () => {
  const data = fixture([echo('hidden', 1, 80)]);
  assert.deepEqual(visibleIndications(data), []);
  assert.equal(visibleIndication({ ...data, gate: gate(0, 5) }), null);
});

test('a leading edge at the current range boundary does not imply a visible envelope peak', () => {
  const data = fixture([echo('outside-peak', 99, 80)]);
  assert.deepEqual(visibleIndications(data), []);
  assert.equal(visibleIndication({ ...data, gate: gate(98, 2) }), null);
});

test('an envelope peak exactly at the visible range boundary follows the existing inclusive gate rule', () => {
  const data = fixture([echo('edge', 98, 80)]);
  const chosenGate = gate(97, 3);
  assert.equal(gateReading(data.frame, chosenGate).echo.id, 'edge');
  assert.equal(visibleIndication({ ...data, gate: chosenGate }).id, 'edge');
});

const json = (p) => JSON.parse(readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8'));
const rules = json('contracts/waveform_rules.json');
const manifest = json('contracts/model_manifest.json');
const standard = json('contracts/standard_nbt47013_3.json');
const original = json('contracts/specimens_manifest.json');
const specimens = { ...original, specimens: { ...original.specimens, ...original.runtime_specimens } };
const scenarios = json('knowledge/inspection.json').scenarios;
const wave = createWaveform({ rules, manifest, dampingCycles: json('knowledge/scenes.json').teaching_settings.lab.damping_cycles, scenarios, specimens });
const procedure = createProcedure({ rules, wave, specimens, standard });
const P = rules.practice;
const plate = P.step_presets.evaluate.specimen;
const target = specimens.specimens[plate].defects.find((d) => d.id === 'LAM_02');
const points = specimens.specimens[P.dac.specimen].holes.map((h) => ({ id: h.id, S: h.S_mm, G: P.acceptance_values.dac_G_dB[String(h.S_mm)] }));
const state = { ...Object.fromEntries(Object.entries(rules.controls).map(([k, v]) => [k, v.default])),
  ...P.calibration.calibrated_state, scene: scenarios[0].id, specimen_id: plate,
  thickness_mm: specimens.specimens[plate].dims.thickness.value,
  probe_x_mm: target.centre_mm[0], probe_y_mm: target.centre_mm[1],
  gain_dB: P.acceptance_values.G_base_dB, range_mm: 110, reject_percent: 0 };
const realOptions = { state, wave, procedure, points, baseGain: P.acceptance_values.G_base_dB, minDb: P.mark.min_f1_minus_dac_dB };

test('a real plate gate selects the same first echo and current-screen readout as the production instrument', () => {
  const candidate = visibleIndications(realOptions).find((c) => c.id === 'LAM_02');
  assert.ok(candidate);
  const chosenGate = gate(candidate.peakS - 1, 2);
  const reading = gateReading(wave.synth(state, { columns: 480, noise: false }), chosenGate);
  const chosen = visibleIndication({ ...realOptions, gate: chosenGate });
  assert.equal(chosen.id, 'LAM_02');
  assert.equal(chosen.S, reading.s);
  assert.equal(chosen.H, reading.h);
  assert.ok(chosen.flags.includes('F1_over_dac'));
});

test('real low gain, air gap and an off-screen envelope peak remain unrecordable', () => {
  for (const changes of [{ gain_dB: 0 }, { coupling: 'air_gap' }, { range_mm: target.depth_mm }]) {
    assert.equal(visibleIndication({ ...realOptions, state: { ...state, ...changes }, gate: gate(target.depth_mm - 1) }), null);
  }
});

test('a supplied noisy display frame reports precisely the current instrument gate S and H without resynthesis', () => {
  const displayState = { ...state, gain_dB: 25 };
  const frame = wave.synth(displayState, { columns: 480, noise: true, seed: 20261006 });
  const noResynthesis = { synth: () => { throw new Error('The supplied display frame must be reused'); } };
  const options = { ...realOptions, state: displayState, frame, wave: noResynthesis };
  const candidate = visibleIndications(options).find((c) => c.id === 'LAM_02');
  assert.ok(candidate);
  const chosenGate = gate(candidate.peakS - 1, 2);
  const reading = gateReading(frame, chosenGate);
  const cleanReading = gateReading(wave.synth(displayState, { columns: 480, noise: false }), chosenGate);
  assert.ok(reading.h > 5 && reading.h < 100);
  assert.notEqual(reading.h, cleanReading.h);
  const chosen = visibleIndication({ ...options, gate: chosenGate });
  assert.equal(chosen.id, reading.echo.id);
  assert.equal(chosen.S, reading.s);
  assert.equal(chosen.H, reading.h);
});

test('a supplied pulse-off display frame cannot borrow echoes from a fallback synthesis', () => {
  const frame = wave.synth(state, { columns: 480, noise: true, seed: 20261006, pulse: false });
  assert.ok(visibleIndication(realOptions));
  assert.deepEqual(visibleIndications({ ...realOptions, frame }), []);
  assert.equal(visibleIndication({ ...realOptions, frame, gate: gate(target.depth_mm - 1) }), null);
});

test('a supplied partially revealed frame cannot record an envelope peak before it reaches the screen', () => {
  const full = wave.synth(state, { columns: 480, noise: true, seed: 20261006 });
  const echo = full.echoes.find((e) => e.id === 'LAM_02' && e.k === 1);
  const peakT = echo.t + echo.len / 2;
  const frame = wave.synth(state, { columns: 480, noise: true, seed: 20261006, revealUs: peakT - 0.2 });
  assert.ok(frame.shown < frame.columns);
  assert.deepEqual(visibleIndications({ ...realOptions, frame }), []);
  const peakS = state.velocity_m_s * peakT / 2 * 1e-3;
  const chosenGate = gate(peakS - 1, 2);
  assert.equal(gateReading(frame, chosenGate).echo, null);
  assert.equal(visibleIndication({ ...realOptions, frame, gate: chosenGate }), null);
});
