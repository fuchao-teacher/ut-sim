import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createWaveform, gateReading } from '../src/waveform.js';
import { createProcedure } from '../src/procedure.js';
import { createCaselib } from '../src/caselib.js';
import { createThickness } from '../src/thickness.js';
import { visibleIndication } from '../src/learning-workflow.js';
import { detectionCaseSummary, detectionDacAlarm } from '../src/v5-practice.js';

const read = (path) => JSON.parse(readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8'));
const rules = read('contracts/waveform_rules.json');
const standard = read('contracts/standard_nbt47013_3.json');
const original = read('contracts/specimens_manifest.json');
const manifest = read('contracts/model_manifest.json');
const cases = read('contracts/cases.json');
const thicknessDoc = read('contracts/thickness.json');
const scenes = read('knowledge/scenes.json');
const inspection = read('knowledge/inspection.json');
const scenario = inspection.scenarios[0];
const makeWave = (specimens) => createWaveform({ rules, manifest,
  dampingCycles: scenes.teaching_settings.lab.damping_cycles, scenarios: inspection.scenarios, specimens });
const lib = createCaselib({ cases, rules, standard, specimens: original, makeWave, scenario });
const thick = createThickness({ doc: thicknessDoc, cases, rules, standard, specimens: original,
  makeWave, scenario, createCaselib });
const library = [...lib.library().map((entry) => lib.libraryCase(entry.id)),
  ...thick.library().map((entry) => thick.libraryCase(entry.id))];

function bench(cs) {
  const work = { ...original, runtime_specimens: { ...original.runtime_specimens, ...thick.blocks(),
    [cs.specimen_id]: cs.plate } };
  const wave = makeWave(work);
  const procedure = createProcedure({ rules, wave, specimens: work, standard });
  const T = cs.plate.dims.thickness.value;
  const points = T === 50 ? Object.entries(rules.practice.acceptance_values.dac_G_dB)
    .map(([S, G]) => ({ S: +S, G })) : thick.profile(T).dac;
  const base = procedure.gBase(points);
  const state = { ...Object.fromEntries(Object.entries(rules.controls).map(([key, control]) => [key, control.default])),
    ...scenario.defaults, ...rules.practice.calibration.calibrated_state, scene: scenario.id,
    specimen_id: cs.specimen_id, thickness_mm: T, range_mm: 2 * T + 10, defects: [], gain_dB: base,
    coupling: 'good', reject_percent: 0, probe_x_mm: 0, probe_y_mm: 0 };
  return { wave, procedure, points, base, state, gate: { on: true, start_mm: 1,
    width_mm: T - 1.5, threshold_pct: rules.controls.gate_threshold_pct.min } };
}

function atDefect(b, defect, gain = b.base) {
  const centre = defect.type === 'cluster' ? [defect.members[0].x_mm, defect.members[0].y_mm]
    : defect.centre_mm || [defect.region_mm.x.reduce((a, v) => a + v) / 2,
      defect.region_mm.y.reduce((a, v) => a + v) / 2];
  const state = { ...b.state, gain_dB: gain, probe_x_mm: centre[0], probe_y_mm: centre[1] };
  const frame = b.wave.synth(state, { columns: 480, noise: false });
  const own = frame.echoes.filter((echo) => echo.id === defect.id && echo.type === 'defect' && echo.k === 1)
    .sort((a, c) => c.pct - a.pct)[0];
  const peak = own && state.velocity_m_s * (own.t + own.len / 2) / 2 * 1e-3;
  const gate = peak == null ? b.gate : { on: true, start_mm: peak - 0.5, width_mm: 1, threshold_pct: 5 };
  return { ...b, state, frame, gate, own };
}

test('all 28 designed cases report real physical indication counts and criterion counts without answers', () => {
  assert.equal(library.length, 28);
  for (const cs of library) {
    assert.ok(cs && !cs.failed);
    const summary = detectionCaseSummary(cs);
    assert.equal(summary.total, cs.plate.defects.length);
    assert.equal(summary.determined, cs.reference.items.filter((item) => item.determined).length);
    assert.equal(summary.recorded, 0);
    assert.equal(summary.remaining, summary.determined);
    assert.equal(summary.complete, summary.determined === 0);
    assert.deepEqual(Object.keys(summary), ['total', 'determined', 'recorded', 'recordedDetermined', 'remaining', 'complete']);
  }
});

test('clusters count as one physical indication and progress counts only unique confirmed known records', () => {
  const cs = library.find((entry) => entry.plate.defects.some((defect) => defect.type === 'cluster'));
  assert.ok(cs);
  const cluster = cs.plate.defects.find((defect) => defect.type === 'cluster');
  assert.ok(cluster.members.length > 1);
  assert.equal(detectionCaseSummary(cs, [{ id: cluster.id }]).recorded, 0);
  const summary = detectionCaseSummary(cs, [{ id: cluster.id, confirmed: false }, { id: cluster.id, confirmed: true },
    cluster.id, 'unknown', { id: 'unknown', confirmed: true }]);
  assert.equal(summary.recorded, 1);
  const det = cs.reference.items.filter((item) => item.determined).map((item) => item.id);
  const recordedDet = det.includes(cluster.id) ? 1 : 0;
  assert.equal(summary.remaining, det.length - recordedDet);
  const all = detectionCaseSummary(cs, det);
  assert.equal(all.complete, true);
  assert.equal(all.recordedDetermined, all.determined);
});

test('clean and minor cases expose zero criterion defects while retaining any real weak control indications', () => {
  const controls = library.filter((cs) => cs.reference.items.every((item) => !item.determined));
  assert.ok(controls.length > 0);
  for (const cs of controls) {
    const summary = detectionCaseSummary(cs);
    assert.equal(summary.determined, 0);
    assert.equal(summary.total, cs.plate.defects.length);
    assert.equal(summary.complete, true);
    assert.equal(summary.remaining, 0);
    const b = bench(cs);
    for (const defect of cs.plate.defects) assert.equal(detectionDacAlarm(atDefect(b, defect, b.base + 12)).on, false);
  }
});

test('real strong first echoes across 30, 50 and 80 mm cases retain DAC difference at several manual gains', () => {
  let samples = 0;
  const thicknesses = new Set();
  for (const cs of library) {
    const b = bench(cs);
    for (const defect of cs.plate.defects) {
      const ref = cs.reference.items.find((item) => item.id === defect.id);
      if (!ref.flags.includes('F1_over_dac') || defect.type === 'segregation') continue;
      const alarms = [-12, 0, 12].map((delta) => detectionDacAlarm(atDefect(b, defect, b.base + delta)));
      for (const alarm of alarms) {
        assert.equal(alarm.on, true, `${cs.library_id} ${defect.id}: ${alarm.reason}`);
        assert.equal(alarm.defectId, defect.id);
      }
      assert.ok(Math.abs(alarms[0].delta_dB - alarms[1].delta_dB) < 1e-8);
      assert.ok(Math.abs(alarms[1].delta_dB - alarms[2].delta_dB) < 1e-8);
      samples++;
      thicknesses.add(cs.plate.dims.thickness.value);
    }
  }
  assert.ok(samples > 20);
  assert.deepEqual([...thicknesses].sort((a, b) => a - b), [30, 50, 80]);
});

test('screen clipping keeps the true same-gain DAC comparison instead of comparing clipped 100 percent', () => {
  const cs = library.find((entry) => entry.reference.items.some((item) => item.flags.includes('F1_over_dac')));
  const defect = cs.plate.defects.find((entry) => cs.reference.items.find((item) => item.id === entry.id).flags.includes('F1_over_dac'));
  const b = bench(cs);
  const data = atDefect(b, defect, b.base + 24);
  const alarm = detectionDacAlarm(data);
  assert.equal(alarm.on, true);
  assert.equal(alarm.saturated, true);
  assert.equal(alarm.H, 100);
  assert.ok(data.own.pct > 100);
  assert.ok(Math.abs(alarm.delta_dB - data.procedure.f1MinusDac(data.points, data.own.x_mm, data.own.pct, data.state.gain_dB)) < 1e-9);
});

test('disabled alarm, gate off and gate placed away from a defect cannot borrow a global F1 alarm', () => {
  const cs = library.find((entry) => entry.reference.items.some((item) => item.flags.includes('F1_over_dac')));
  const defect = cs.plate.defects.find((entry) => cs.reference.items.find((item) => item.id === entry.id).flags.includes('F1_over_dac'));
  const data = atDefect(bench(cs), defect);
  assert.ok(data.procedure.criteria(data.state, data.points, data.base).flags.includes('F1_over_dac'));
  assert.equal(detectionDacAlarm({ ...data, enabled: false }).reason, 'disabled');
  assert.equal(detectionDacAlarm({ ...data, gate: { ...data.gate, on: false } }).reason, 'gate_off');
  assert.equal(detectionDacAlarm({ ...data, gate: { ...data.gate, start_mm: 2, width_mm: 1 } }).on, false);
});

test('real bottom echoes and repeated defect echoes never trigger the first-defect DAC alarm', () => {
  const cs = library.find((entry) => entry.plate.defects.some((defect) => defect.type === 'lamination'));
  const defect = cs.plate.defects.find((entry) => entry.type === 'lamination');
  const data = atDefect(bench(cs), defect, 65);
  const peaks = data.frame.echoes.filter((echo) => echo.type === 'defect' && echo.k > 1 && echo.pct > 5);
  assert.ok(peaks.some((echo) => echo.type === 'defect' && echo.k > 1));
  let checked = 0;
  for (const echo of peaks) {
    const peak = data.state.velocity_m_s * (echo.t + echo.len / 2) / 2 * 1e-3;
    const gate = { on: true, start_mm: peak - 0.25, width_mm: 0.5, threshold_pct: 5 };
    const reading = gateReading(data.frame, gate);
    if (reading?.echo !== echo) continue;
    assert.equal(detectionDacAlarm({ ...data, gate }).on, false);
    checked++;
  }
  assert.ok(checked >= 1);
  const state = { ...data.state, probe_x_mm: -cs.plate.dims.length.value / 2 + 20,
    probe_y_mm: -cs.plate.dims.width.value / 2 + 20 };
  const frame = data.wave.synth(state, { columns: 480, noise: false });
  const bottom = frame.echoes.find((echo) => echo.type === 'back_wall' && echo.k === 1);
  assert.ok(bottom.pct > 5);
  const peak = state.velocity_m_s * (bottom.t + bottom.len / 2) / 2 * 1e-3;
  const gate = { on: true, start_mm: peak - 0.5, width_mm: 1, threshold_pct: 5 };
  assert.equal(gateReading(frame, gate).echo.type, 'back_wall');
  assert.equal(detectionDacAlarm({ ...data, state, frame, gate }).on, false);
});

test('a first defect echo outside the valid DAC interval and a hidden low-gain echo do not alarm', () => {
  const cs = library.find((entry) => entry.reference.items.some((item) => item.flags.includes('F1_over_dac')));
  const defect = cs.plate.defects.find((entry) => cs.reference.items.find((item) => item.id === entry.id).flags.includes('F1_over_dac'));
  const b = bench(cs);
  const data = atDefect(b, defect);
  const points = data.points.map((point) => ({ ...point, S: point.S + 200 }));
  assert.equal(detectionDacAlarm({ ...data, points }).reason, 'outside_dac');
  const low = library.flatMap((entry) => entry.plate.defects.filter((it) => entry.reference.items
    .find((ref) => ref.id === it.id).flags.includes('F1_over_dac')).map((it) => atDefect(bench(entry), it, 0)))
    .find((entry) => entry.own?.pct < rules.display.echo_label_min_percent);
  assert.ok(low);
  assert.ok(low.procedure.criteria(low.state, low.points, low.base).flags.includes('F1_over_dac'));
  assert.equal(visibleIndication({ ...low, baseGain: low.base, minDb: rules.practice.mark.min_f1_minus_dac_dB }), null);
  assert.equal(detectionDacAlarm(low).on, false);
});

test('auto alarm uses current state when a stale old display frame is not explicitly passed', () => {
  const cs = library.find((entry) => entry.reference.items.some((item) => item.flags.includes('F1_over_dac')));
  const defect = cs.plate.defects.find((entry) => cs.reference.items.find((item) => item.id === entry.id).flags.includes('F1_over_dac'));
  const data = atDefect(bench(cs), defect);
  assert.equal(detectionDacAlarm({ ...data, frame: null }).on, true);
  assert.equal(detectionDacAlarm({ ...data, frame: null, state: { ...data.state, coupling: 'air_gap' } }).on, false);
});
