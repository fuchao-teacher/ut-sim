import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createWeld } from '../src/angle/weld.js';
import { checkMarks, natureOf, ownPlate, systemLength, carryMarks, examTargetSummary, hintZoneOf } from '../src/angle/evaluate.js';

const load = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const rules = load('../../contracts/angle_waveform_rules.json');
const cases = load('../../contracts/angle_cases.json');
const std = load('../../contracts/angle_standard_nbt47013_3_weld.json');
const ref = load('./angle_b5_ref.json');

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`);
const W = createWeld(rules, cases, std);

test('peak splitting, indicated length and ripple of synthetic profiles equal the reference', () => {
  assert.deepEqual(W.lines, ref.lines);
  for (const [k, q] of Object.entries(ref.profiles)) {
    const r = W.measureLength(ref.ys, q.h, q.transverse);
    assert.equal(r.method, q.method, `${k} method`);
    assert.deepEqual(r.peaks, q.peaks, `${k} peaks`);
    if (q.length === null) assert.equal(r.length, null, `${k} length`);
    else near(r.length, q.length, 1e-9, `${k} length`);
    assert.deepEqual(W.splitPeaks(q.h, ref.prominence_dB, W.lines.SL), q.split, `${k} split`);
    near(W.ripple(q.h), q.ripple, 1e-9, `${k} ripple`);
  }
});

test('table 35 grading for T = 22 mm equals the reference', () => {
  for (const g of ref.grades) assert.equal(W.grade(g.zone, g.length, g.not_allowed), g.grade, JSON.stringify(g));
  const L = W.gradeLimits();
  assert.equal(L.I.I, 40);
  assert.equal(L.II.I, 60);
  assert.equal(L.I.II, 8);
  near(L.II.II, (2 * 22) / 3, 1e-6, 'II/II');
});

test('transverse scan with the skewed housing kept clear of the cap', () => {
  const d6 = W.demo()[5];
  const { el, meta } = W.buildDefect(d6, 5);
  const yc = (meta.y0 + meta.y1) / 2;
  for (const [k, hull] of [['hull', true], ['free', false]]) {
    const r = W.transverseScan(el, yc, { hull });
    const q = ref.transverse_D6[k];
    near(r.h, q.h, 1e-6, `${k} h`);
    near(r.pose.px, q.pose[0], 1e-9, `${k} px`);
    near(r.pose.py, q.pose[1], 1e-9, `${k} py`);
    near(r.pose.phi, q.pose[2], 1e-12, `${k} phi`);
  }
});

function sameEval(js, py, tag) {
  assert.equal(js.indications.length, py.indications.length, `${tag} count`);
  js.indications.forEach((r, i) => {
    const q = py.indications[i];
    const t = `${tag} ${q.id}`;
    for (const k of ['id', 'type', 'side', 'leg', 'zone', 'method', 'grade', 'scan']) assert.equal(r[k], q[k], `${t} ${k}`);
    for (const k of ['d', 'h_long', 'h_other', 'h', 'S', 'depth_est', 'x_est']) near(r[k], q[k], 1e-6, `${t} ${k}`);
    if (q.length === null) assert.equal(r.length, null, `${t} length`);
    else near(r.length, q.length, 1e-6, `${t} length`);
    if (q.scan === 'longitudinal') {
      assert.equal(r.peaks, q.peaks, `${t} peaks`);
      for (const k of ['swivel_drop_dB', 'lat_ripple_dB', 'fa_ripple_dB']) near(r[k], q[k], 1e-6, `${t} ${k}`);
    } else {
      near(r.pose.px, q.pose[0], 1e-9, `${t} pose`);
      near(r.pose.py, q.pose[1], 1e-9, `${t} pose`);
    }
  });
  assert.equal(js.level, py.level, `${tag} level`);
  assert.equal(js.verdict, py.verdict, `${tag} verdict`);
  assert.equal(js.not_allowed, py.not_allowed, `${tag} not allowed`);
}

test('demo plate evaluation equals the reference: D1 / D2 / D5 / D6 not allowed, D3 below EL, plate III reject', () => {
  const e = W.evaluateCase(W.demo());
  sameEval(e, ref.demo, 'demo');
  assert.deepEqual(e.indications.map((r) => r.grade), ['reject', 'reject', 'I', 'I', 'reject', 'reject']);
  assert.equal(e.indications[2].zone, 'below');
  assert.equal(e.level, 'III');
  assert.equal(e.verdict, 'reject');
});

test('random plate evaluations equal the reference (accepted and rejected plates)', () => {
  const verdicts = new Set();
  for (const c of ref.cases) {
    const e = W.evaluateCase(W.generateCase(c.seed).defects);
    sameEval(e, c.eval, `seed ${c.seed}`);
    verdicts.add(e.verdict);
  }
  assert.deepEqual([...verdicts].sort(), ['accept', 'reject']);
});

test('checking student marks against the reference evaluation', () => {
  const defs = W.demo();
  const built = defs.map((d, i) => W.buildDefect(d, i));
  const ev = W.evaluateCase(defs, built);
  const R = Object.fromEntries(ev.indications.map((r) => [r.id, r]));
  const mk = (id, over = {}) => {
    const r = R[id];
    const b = built.find((q) => q.meta.id === id);
    const m = b.meta;
    const xs = b.el.map((e) => e.x);
    return {
      x: (Math.min(...xs) + Math.max(...xs)) / 2, y: r.scan === 'transverse' ? m.y0 : (m.y0 + m.y1) / 2, h: r.h, zone: r.zone, mode: r.scan === 'transverse' ? 'trans' : 'long',
      len: r.length, nature: natureOf(r.type), grade: r.grade, ...over,
    };
  };
  const marks = [
    mk('D1'),
    mk('D2', { len: R.D2.length * 1.5, nature: 'slag', grade: 'III' }),
    mk('D4', { len: R.D4.length + 2.5 }),
    mk('D5'),
    mk('D6'),
    { x: 40, y: 100, h: -5, zone: 'II', mode: 'long', len: 5, nature: 'slag', grade: 'I' },
  ];
  const res = checkMarks(W, built, ev, marks, { level: 'III', verdict: 'reject' });
  const [m1, m2, m4, m5, m6, extra] = res.rows;
  assert.equal(m1.defect, 'D1');
  assert.ok(m1.ok.zone && m1.ok.len && m1.ok.nature && m1.ok.grade);
  assert.equal(m2.defect, 'D2');
  assert.ok(!m2.ok.len && !m2.ok.nature && !m2.ok.grade);
  assert.ok(m4.ok.len, 'D4 within max(3 mm, 20 %)');
  assert.ok(m5.ok.nature && m6.ok.nature, 'cracks');
  assert.equal(extra.defect, null);
  assert.deepEqual(res.missed, []);
  assert.ok(res.plate.level && res.plate.verdict);
  const res2 = checkMarks(W, built, ev, [mk('D1')], { level: 'I', verdict: 'accept' });
  assert.deepEqual(res2.missed, ['D2', 'D4', 'D5', 'D6']);
  assert.ok(!res2.plate.level && !res2.plate.verdict);
  assert.deepEqual(ownPlate(W, ['I', 'II']), { level: 'II', verdict: 'accept', not_allowed: false });
  assert.deepEqual(ownPlate(W, ['I', 'reject']), { level: 'III', verdict: 'reject', not_allowed: true });
});

test('system length at the reference position equals the reference length; transverse cracks are geometric', () => {
  const defs = W.demo();
  const built = defs.map((d, i) => W.buildDefect(d, i));
  const ev = W.evaluateCase(defs, built);
  for (const r of ev.indications) {
    const b = built.find((q) => q.meta.id === r.id);
    const xs = b.el.map((e) => e.x);
    const mark = { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (b.meta.y0 + b.meta.y1) / 2, mode: r.scan === 'transverse' ? 'trans' : 'long', pose: { side: r.side, d: r.d } };
    const s = systemLength(W, built, ev, mark);
    assert.equal(s.method, r.method, r.id);
    if (r.length === null) assert.equal(s.length, null, r.id);
    else near(s.length, r.length, 1e-9, r.id);
  }
  assert.equal(systemLength(W, built, ev, { x: 60, y: 5, mode: 'long', pose: { side: 1, d: 60 } }), null);
});

test('oblique-parallel scan: probe at the weld edge skewed 10° finds the demo transverse crack, an unskewed beam does not', () => {
  const tc = W.demo().map((d, i) => W.buildDefect(d, i)).find((b) => b.meta.type === 'transverse_crack');
  const g = Math.ceil(W.scanGain() * 10) / 10 + W.transPlus;
  const rad = (d) => (d * Math.PI) / 180;
  const best = (sk) => {
    const x = W.spec.cap.half_width_mm + 11 * Math.cos(rad(sk)) + 14 * Math.sin(rad(sk));
    let top = 0;
    for (let py = 0; py <= 250; py += 2) {
      const pk = W.m.peak(tc.el, { px: x, py, phi: Math.atan2(Math.cos(rad(sk)), -Math.sin(rad(sk))) });
      top = Math.max(top, W.m.percent(pk.P, g));
    }
    return top;
  };
  assert.ok(best(10) >= 80, `skew 10: ${best(10)}`);
  assert.ok(best(0) < 5, `skew 0: ${best(0)}`);
});

test('carried-over indications match every recordable defect once, in the right zone, with no false calls', () => {
  for (const seed of [0, 11, 207, 4242, 9001]) {
    const defs = seed ? W.generateCase(seed).defects : W.demo();
    const built = defs.map((d, i) => W.buildDefect(d, i));
    const ev = W.evaluateCase(defs, built);
    const marks = carryMarks(built, ev);
    assert.equal(marks.length, ev.indications.filter((r) => r.zone !== 'below').length, `seed ${seed}`);
    const ck = checkMarks(W, built, ev, marks, { level: '', verdict: '' });
    assert.deepEqual(ck.missed, [], `seed ${seed} missed`);
    for (const [i, r] of ck.rows.entries()) {
      assert.ok(r.defect && !r.dup, `seed ${seed} mark ${i}`);
      assert.ok(r.ok.zone, `seed ${seed} mark ${i} zone`);
    }
  }
});

test('exam tip summary and zone hint cover every recordable defect without revealing its centre', () => {
  const defs = W.demo();
  const built = defs.map((d, i) => W.buildDefect(d, i));
  const ev = W.evaluateCase(defs, built);
  const empty = examTargetSummary(built, ev, []);
  assert.equal(empty.total, 5);
  assert.equal(empty.recorded, 0);
  assert.equal(empty.remaining.length, 5);
  assert.equal(empty.complete, false);
  const one = carryMarks(built, ev).slice(0, 1);
  const mid = examTargetSummary(built, ev, one);
  assert.equal(mid.recorded, 1);
  assert.equal(mid.remaining.length, 4);
  const all = examTargetSummary(built, ev, carryMarks(built, ev));
  assert.equal(all.complete, true);
  assert.equal(all.remaining.length, 0);
  const id = empty.remaining[0].id;
  const b = built.find((x) => x.meta.id === id);
  const xs = b.el.map((e) => e.x);
  const xc = (Math.min(...xs) + Math.max(...xs)) / 2;
  const yc = (b.meta.y0 + b.meta.y1) / 2;
  const z = hintZoneOf(built, id, 40, 'demo');
  assert.ok(z);
  assert.equal(z.r, 40);
  assert.ok(Math.hypot(z.x - xc, z.y - yc) > 5, 'offset from centre');
  assert.ok(Math.hypot(z.x - xc, z.y - yc) < 40, 'still covers the defect');
});