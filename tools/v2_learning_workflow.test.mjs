// Current-display recording and scan-quality feedback remain separate from path coverage.
// Run: node --test tools/v2_learning_workflow.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { visibleIndication, scanQuality } from '../src/learning-workflow.js';
import { createWaveform } from '../src/waveform.js';
import { createProcedure } from '../src/procedure.js';
import { coverageParams, createCoverage } from '../src/coverage.js';

const json = (p) => JSON.parse(readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8'));
const rules = json('contracts/waveform_rules.json');
const manifest = json('contracts/model_manifest.json');
const standard = json('contracts/standard_nbt47013_3.json');
const original = json('contracts/specimens_manifest.json');
const specimens = { ...original, specimens: { ...original.specimens, ...original.runtime_specimens } };
const scenes = json('knowledge/scenes.json');
const scenarios = json('knowledge/inspection.json').scenarios;
const P = rules.practice;
const AV = P.acceptance_values;
const plate = P.step_presets.evaluate.specimen;
const wave = createWaveform({ rules, manifest, dampingCycles: scenes.teaching_settings.lab.damping_cycles, scenarios, specimens });
const procedure = createProcedure({ rules, wave, specimens, standard });
const points = specimens.specimens[P.dac.specimen].holes.map((h) => ({ id: h.id, S: h.S_mm, G: AV.dac_G_dB[String(h.S_mm)] }));

function sample(id = 'LAM_02', changes = {}) {
  const d = specimens.specimens[plate].defects.find((it) => it.id === id);
  const state = { ...Object.fromEntries(Object.entries(rules.controls).map(([k, v]) => [k, v.default])),
    ...P.calibration.calibrated_state, scene: scenarios[0].id, specimen_id: plate,
    thickness_mm: specimens.specimens[plate].dims.thickness.value,
    probe_x_mm: d.centre_mm[0], probe_y_mm: d.centre_mm[1],
    gain_dB: AV.G_base_dB, range_mm: 110, reject_percent: 0, ...changes };
  return { state, wave, procedure, points, baseGain: AV.G_base_dB, minDb: P.mark.min_f1_minus_dac_dB };
}

test('a visible reference indication can be recorded from the actual display parameters', () => {
  const data = sample();
  const indication = visibleIndication(data);
  assert.ok(indication);
  assert.equal(indication.id, 'LAM_02');
  assert.ok(Math.abs(indication.S - 30) < 0.1);
  assert.ok(indication.H >= 5 && indication.H <= 100);
  assert.ok(indication.flags.includes('F1_over_dac'));
});

test('an indication outside the current displayed range is not recordable', () => {
  const data = sample('LAM_02', { range_mm: 20 });
  assert.ok(procedure.criteria(data.state, points, AV.G_base_dB).defect);
  assert.equal(visibleIndication(data), null);
});

test('low actual gain cannot be replaced by a larger hidden base gain when recording', () => {
  const data = sample('LAM_02', { gain_dB: 0 });
  assert.ok(procedure.criteria(data.state, points, AV.G_base_dB).defect);
  assert.equal(visibleIndication(data), null);
});

test('an air gap does not produce a recordable indication', () => {
  assert.equal(visibleIndication(sample('LAM_02', { coupling: 'air_gap' })), null);
});

test('a visible below-criterion indication remains recordable without being called a confirmed defect', () => {
  const indication = visibleIndication(sample('POR_01'));
  assert.ok(indication);
  assert.equal(indication.id, 'POR_01');
  assert.deepEqual(indication.flags, []);
  assert.ok(indication.dB < 0);
});

test('a custom minimum screen height remains binding at the current gain', () => {
  const data = sample('POR_01', { gain_dB: 25 });
  const indication = visibleIndication(data);
  assert.ok(indication);
  assert.ok(indication.H < 100);
  assert.equal(visibleIndication({ ...data, minPercent: indication.H + 1 }), null);
});

test('the main-bang ring-down cannot be recorded as a separate indication', () => {
  const data = sample();
  const hiddenWave = { synth: () => ({ echoes: [
    { type: 'main_bang', t: 0, len: 4 },
    { type: 'defect', id: 'hidden', k: 1, x_mm: 10, t: 2, pct: 30 },
  ] }) };
  assert.equal(visibleIndication({ ...data, wave: hiddenWave }), null);
});

test('a below-height indication removed by display suppression is not recordable', () => {
  const data = sample('POR_01', { gain_dB: 25 });
  const visible = visibleIndication(data);
  assert.ok(visible);
  assert.ok(visible.H < 100);
  data.state.reject_percent = Math.ceil(visible.H) + 1;
  assert.equal(visibleIndication(data), null);
});

const scanOptions = { edge: 50, limits: { x: [-200, 200], y: [-200, 200] }, maxSegment: 20 };
const vertical = [[0, -30], [0, -20], [0, -10], [0, 0], [0, 10], [0, 20], [0, 30]];
const horizontal = vertical.map(([x, y]) => [y, x]);
const speed = { len_mm: 60, over_mm: 0 };

test('speed feedback changes independently from direction and geometric coverage', () => {
  const slow = scanQuality({ ...scanOptions, trail: vertical, speed });
  const fast = scanQuality({ ...scanOptions, trail: vertical, speed: { len_mm: 60, over_mm: 45 } });
  assert.equal(slow.overspeed, 0);
  assert.equal(fast.overspeed, 0.75);
  assert.equal(slow.direction, 1);
  assert.equal(fast.direction, slow.direction);
});

test('parallel-line direction follows the rolling direction; grid accepts either axis', () => {
  assert.equal(scanQuality({ ...scanOptions, trail: vertical, speed }).direction, 1);
  assert.equal(scanQuality({ ...scanOptions, trail: horizontal, speed }).direction, 0);
  assert.equal(scanQuality({ ...scanOptions, trail: horizontal, speed, pattern: 'grid' }).direction, 1);
  assert.equal(scanQuality({ ...scanOptions, trail: [[-10, -10], [0, 0], [10, 10]], speed, pattern: 'grid' }).direction, 0);
  const toleranceDeg = rules.practice.scan_path_coverage.direction_tolerance_deg;
  const segment = (deg) => [[0, 0], [10 * Math.sin(deg * Math.PI / 180), 10 * Math.cos(deg * Math.PI / 180)]];
  assert.equal(scanQuality({ ...scanOptions, trail: segment(toleranceDeg - 1), speed, toleranceDeg }).direction, 1);
  assert.equal(scanQuality({ ...scanOptions, trail: segment(toleranceDeg + 1), speed, toleranceDeg }).direction, 0);
  const params = coverageParams({ rules, standard, specimens, manifest }, plate);
  const a = createCoverage(params).add(vertical).metrics();
  const b = createCoverage(params).add(horizontal).metrics();
  // Equal central geometric coverage must not hide a different sweep direction.
  for (const key of ['edge', 'middle', 'whole']) assert.equal(a[key], b[key]);
});

test('edge-only segments and jumps do not manufacture a middle-direction result', () => {
  assert.equal(scanQuality({ ...scanOptions, trail: [[170, -10], [170, 0], [170, 10]], speed }).direction, null);
  assert.equal(scanQuality({ ...scanOptions, trail: [[0, -100], [0, 100]], speed }).direction, null);
  assert.equal(scanQuality({ ...scanOptions, trail: [[0, 0], [0, 0]], speed: {} }).direction, null);
  assert.equal(scanQuality({ ...scanOptions, trail: vertical, speed: {} }).overspeed, null);
});

test('current plate area changes only the permitted count, not the per-indication verdict', () => {
  const gradeRules = standard.items.grading;
  const level = gradeRules.levels[0];
  const row = gradeRules.table[level];
  const areaForOne = gradeRules.count_area_m2 / row.max_count_per_m2;
  const items = [{ id: 'area-example', determined: true, flags: ['B1_below_50'],
    S_mm2: (row.count_S_mm2[0] + row.max_S_mm2) / 2 }];
  const standardBefore = JSON.stringify(standard);
  const small = procedure.grade(level, items, areaForOne / 2);
  const exact = procedure.grade(level, items, areaForOne);
  const large = procedure.grade(level, items, areaForOne * 2);
  assert.deepEqual(small.verdicts, { 'area-example': 'counted' });
  assert.deepEqual(exact.verdicts, small.verdicts);
  assert.deepEqual(large.verdicts, small.verdicts);
  assert.equal(small.counted, 1);
  assert.equal(small.maxCount, 0.5);
  assert.equal(exact.maxCount, 1);
  assert.equal(large.maxCount, 2);
  assert.equal(small.pass, false);
  assert.equal(exact.pass, true);
  assert.equal(large.pass, true);
  assert.equal(JSON.stringify(standard), standardBefore);
});

test('plate grade propagates the current area while preserving the legacy default', () => {
  const gradeRules = standard.items.grading;
  const level = gradeRules.levels[0];
  const row = gradeRules.table[level];
  const areaForOne = gradeRules.count_area_m2 / row.max_count_per_m2;
  const items = [{ id: 'area-example', determined: true, flags: ['B1_below_50'],
    S_mm2: (row.count_S_mm2[0] + row.max_S_mm2) / 2 }];
  assert.equal(procedure.plateGrade(items, areaForOne), level);
  assert.notEqual(procedure.plateGrade(items, areaForOne / 2), level);
  assert.deepEqual(procedure.grade(level, items), procedure.grade(level, items, P.grading.plate_area_m2));
  assert.equal(procedure.plateGrade(items), procedure.plateGrade(items, P.grading.plate_area_m2));
});

test('a larger area cannot rescue an indication over the individual size limit', () => {
  const gradeRules = standard.items.grading;
  const level = gradeRules.levels[0];
  const row = gradeRules.table[level];
  const items = [{ id: 'oversize-example', determined: true, flags: ['B1_below_50'], S_mm2: row.max_S_mm2 + 1 }];
  for (const area of [0.01, 1, 100]) {
    const result = procedure.grade(level, items, area);
    assert.equal(result.verdicts['oversize-example'], 'exceed');
    assert.equal(result.pass, false);
  }
});
