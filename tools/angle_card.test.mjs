import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createWeld } from '../src/angle/weld.js';
import { createWeldCard, rowOf } from '../src/angle/weldcard.js';
import { drawSeed, scoreExam, prepOk } from '../src/angle/exam.js';
import { natureOf } from '../src/angle/evaluate.js';

const load = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const rules = load('../../contracts/angle_waveform_rules.json');
const cases = load('../../contracts/angle_cases.json');
const std = load('../../contracts/angle_standard_nbt47013_3_weld.json');
const tasks = load('../../contracts/angle_tasks.json');
const ref = load('./angle_b6_ref.json');
const text = load('../../knowledge/angle_card.json');

const WC = createWeldCard(tasks, std);
const W = createWeld(rules, cases, std);

test('weld card reference and checks equal the Python reference for every task', () => {
  assert.equal(tasks.tasks.length, 12);
  for (const t of tasks.tasks) {
    const f = ref.tasks[t.id];
    const r = WC.reference(t);
    assert.deepEqual(r.card, f.reference.card, `${t.id} card`);
    assert.ok(Math.abs(r.K[0] - f.reference.K[0]) < 1e-12 && Math.abs(r.K[1] - f.reference.K[1]) < 1e-12, `${t.id} K`);
    assert.deepEqual(r.MHz, f.reference.MHz);
    assert.equal(r.block, f.reference.block);
    assert.deepEqual(r.sides, f.reference.sides);
    assert.equal(r.zone_coef, f.reference.zone_coef);
    for (const [name, c] of Object.entries(f.checks)) {
      const k = WC.check(c.card, t);
      assert.deepEqual(k.ok, c.ok, `${t.id} ${name} ok`);
      assert.equal(k.score, c.score, `${t.id} ${name} score`);
    }
    assert.equal(WC.check(r.card, t).score, 100);
  }
});

test('thickness rows: (lo, hi] with the first row closed; K limited by the 70 degree bottom-normal angle', () => {
  const ps = std.items.probe_selection.rows;
  assert.deepEqual(rowOf(ps, 6).K, [2.0, 3.0]);
  assert.deepEqual(rowOf(ps, 25).K, [2.0, 3.0]);
  assert.deepEqual(rowOf(ps, 25.1).K, [1.5, 2.5]);
  assert.deepEqual(rowOf(ps, 40).K, [1.5, 2.5]);
  assert.deepEqual(rowOf(ps, 41).K, [1.0, 2.0]);
  assert.equal(rowOf(std.items.reference_block.rows, 40).id, 'CSK-IIA-1');
  const t8 = WC.task('WT01');
  const r = WC.reference(t8);
  assert.ok(Math.abs(r.K[1] - Math.tan((70 * Math.PI) / 180)) < 1e-12);
  assert.equal(WC.check({ ...r.card, K: 2.8, zone: 1000 }, t8).ok.K, false);
  assert.equal(WC.check({ ...r.card, K: 2.7, zone: 2.5 * 8 * 2.7 }, t8).ok.zone, true);
  assert.equal(WC.check({ ...r.card, zone: 2.5 * 8 * 2 - 0.6 }, t8).ok.zone, false);
  assert.equal(WC.reference(WC.task('WT02')).table, '35');
  assert.equal(WC.reference(t8).table, '33');
});

test('parse turns input strings into card values and every field has text and basis', () => {
  const c = WC.parse({ K: '2.0', MHz: ' 5 ', block: 'CSK-IIA-1', zone: '', comp: 'x' });
  assert.equal(c.K, 2);
  assert.equal(c.MHz, 5);
  assert.equal(c.block, 'CSK-IIA-1');
  assert.equal(c.zone, null);
  assert.equal(c.comp, null);
  assert.equal(c.level, null);
  for (const f of WC.fields()) {
    assert.ok(text.fields[f.id], f.id);
    assert.ok(text.basis[f.id] || f.id === 'table', f.id);
    if (f.type === 'select') for (const o of f.options) assert.ok(o === 'CSK-IIA-1' || o === 'CSK-IIA-2' || o === 'CSK-IIA-3' || text.options[f.id]?.[o], `${f.id}.${o}`);
  }
  for (const g of WC.groups()) assert.ok(text.groups[g], g);
});

function perfectRun(seed) {
  const cs = W.generateCase(seed);
  const built = cs.defects.map((d, i) => W.buildDefect(d, i));
  const ev = W.evaluateCase(cs.defects, built);
  const g0 = Math.ceil(W.scanGain() * 10) / 10;
  const meta = Object.fromEntries(built.map((b) => [b.meta.id, b]));
  const marks = ev.indications.filter((r) => r.zone !== 'below').map((r, i) => {
    const b = meta[r.id];
    const xs = b.el.map((e) => e.x);
    const tr = r.scan === 'transverse';
    return {
      no: i + 1, y: (b.meta.y0 + b.meta.y1) / 2, x: (Math.min(...xs) + Math.max(...xs)) / 2, depth: (b.meta.z[0] + b.meta.z[1]) / 2,
      zone: r.zone, len: r.length, nature: natureOf(r.type), grade: r.grade, mode: tr ? 'trans' : 'long', gain: g0 + (tr ? W.transPlus : 0),
    };
  });
  return { built, ev, g0, marks, plate: { level: ev.level, verdict: ev.verdict } };
}

test('exam score: perfect run 100, empty run only coverage and side marks, false marks and wrong grades cost points', () => {
  const R = tasks.exam.rubric;
  assert.deepEqual(Object.keys(R), ['coverage', 'detection', 'location', 'quantification', 'evaluation', 'conduct']);
  for (const seed of [1, 9, 42, 3301]) {
    const p = perfectRun(seed);
    const run = { marks: p.marks, plate: p.plate, cov: 0.95, transTravel: 200, sides: new Set([1, -1]), g0: p.g0, prepOk: true };
    const full = scoreExam(W, p.built, p.ev, run, R);
    assert.equal(full.max, 100);
    assert.equal(full.total, 100, `seed ${seed}: ${JSON.stringify(full.parts.map((q) => [q.id, q.points]))}`);
    const empty = scoreExam(W, p.built, p.ev, { marks: [], plate: { level: '', verdict: '' }, cov: 0.45, transTravel: 0, sides: new Set([1]), g0: p.g0 }, R);
    const halfCov = R.coverage.long_points * 0.5;
    assert.equal(empty.parts.find((q) => q.id === 'coverage').points, halfCov);
    assert.equal(empty.total, halfCov);
    const fake = { ...p.marks[0], no: 99, y: 3, x: -40, depth: 2 };
    const noisy = scoreExam(W, p.built, p.ev, { ...run, marks: [...p.marks, fake] }, R);
    assert.equal(noisy.parts.find((q) => q.id === 'detection').points, R.detection.points - R.detection.false_penalty);
    const wrongPlate = scoreExam(W, p.built, p.ev, { ...run, plate: { level: p.plate.level === 'I' ? 'III' : 'I', verdict: p.plate.verdict === 'accept' ? 'reject' : 'accept' } }, R);
    assert.equal(wrongPlate.total, 100 - R.evaluation.plate_level - R.evaluation.verdict);
    const lowGain = scoreExam(W, p.built, p.ev, { ...run, marks: p.marks.map((m) => ({ ...m, gain: m.gain - 3 })) }, R);
    assert.equal(lowGain.total, 100 - R.conduct.gain);
    const noPrep = scoreExam(W, p.built, p.ev, { ...run, prepOk: false }, R);
    assert.equal(noPrep.total, 100 - R.conduct.prep);
  }
});

test('specimen preparation key: roughness for direct contact and a couplant', () => {
  const key = tasks.exam.prep;
  assert.ok(prepOk({ rough: '3.2', couplant: 'oil' }, key));
  assert.equal(prepOk({ rough: '6.3', couplant: 'oil' }, key), false);
  assert.equal(prepOk({ rough: '3.2', couplant: '' }, key), false);
  assert.equal(prepOk(null, key), false);
  const P = load('../../knowledge/angle_scan.json').prep;
  for (const k of key.rough) assert.ok(P.rough_opts[k]);
  for (const k of key.couplant) assert.ok(P.couplant_opts[k]);
});

test('exam plate draw stays within the seed space; library holds accepted and rejected plates', () => {
  const space = tasks.exam.seed_space;
  assert.equal(drawSeed(space, () => 0), 1);
  assert.equal(drawSeed(space, () => 0.999999999), space);
  for (let i = 0; i < 200; i++) {
    const v = drawSeed(space);
    assert.ok(Number.isInteger(v) && v >= 1 && v <= space);
  }
  const kinds = new Set(tasks.exam.library.map((sd) => W.evaluateCase(W.generateCase(sd).defects).verdict));
  assert.deepEqual([...kinds].sort(), ['accept', 'reject']);
});
