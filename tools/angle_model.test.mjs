import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createModel, makeProbe, probeDerived, sdhElements, U6 } from '../src/angle/model.js';
import { locate, zigzag, scaleValue, scaleToS, pathFromL, makeProblem, gradeAnswer, makeKProblem, gradeK, K_OPTIONS } from '../src/angle/locate.js';

const load = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const rules = load('../../contracts/angle_waveform_rules.json');
const blocks = load('../../contracts/angle_blocks.json');
const ref = load('./angle_b2_ref.json');

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`);

test('probe derived values match the Python reference', () => {
  const d = probeDerived(makeProbe(rules));
  for (const k of ['beta_deg', 'alpha_deg', 'lambda_s_mm', 'aperture_eff_mm', 'theta0_v_deg', 'theta0_h_deg', 'near_field_mm', 'wedge_delay_us']) {
    near(d[k], ref.derived[k], 1e-9, k);
  }
  near(d.edges_deg[0], ref.derived.edges_deg[0], 1e-9, 'edge0');
  near(d.edges_deg[1], ref.derived.edges_deg[1], 1e-9, 'edge1');
  near(makeProbe(rules).sig, ref.sig_mm, 1e-12, 'sigma');
  near(U6, 0.4429, 1e-3, 'U6');
});

test('beam width, near-field blend and attenuation', () => {
  const m = createModel(rules);
  near(m.nf, ref.nf_mm, 1e-9, 'nf');
  for (const b of ref.beam) {
    near(m.wv(b.s), b.wv, 1e-9, `wv ${b.s}`);
    near(m.wh(b.s), b.wh, 1e-9, `wh ${b.s}`);
    near(m.sEff(b.s), b.s_eff, 1e-9, `seff ${b.s}`);
    near(m.atten(b.s), b.atten, 1e-12, `att ${b.s}`);
  }
});

test('CSK-IIA-1 DAC points equal the Python reference', () => {
  const m = createModel(rules);
  const pts = m.dacPoints();
  assert.equal(pts.length, ref.dac.length);
  pts.forEach((q, i) => {
    const r = ref.dac[i];
    assert.equal(q.hole_depth_mm, r.hole_depth_mm);
    assert.equal(q.leg, r.leg);
    near(q.S, r.S, 1e-6, `S ${i}`);
    near(q.d, r.d, 1e-9, `d ${i}`);
    near(q.dB, r.dB, 1e-6, `dB ${i}`);
  });
  near(m.percent(m.pRef(), rules.display.ref.gain_dB), ref.percent_ref, 1e-9, 'percent');
  near(m.dacDb(33.17), 0, 0.01, 'dac at ref');
});

test('block hole peaks and A-scan traces equal the Python reference', () => {
  const blk = blocks.blocks[ref.block];
  const m = createModel(rules, { t: blk.T_mm });
  const els = blk.holes.map((h, i) => sdhElements(h.x_mm, 0, h.z_mm, blk.hole_phi_mm, -blk.hole_length_mm / 2, blk.hole_length_mm / 2, i));
  const all = els.flat();
  const Pref = m.pRef();
  const axis = Array.from({ length: 401 }, (_, i) => i * ref.S_axis_step);
  let nonzero = 0;
  for (const sc of ref.scans) {
    const pose = { px: sc.px, py: 0, phi: sc.phi };
    sc.holes.forEach((h, i) => {
      const r = m.peak(els[i], pose);
      near(r.P / Pref, h.P, 1e-9, `peak ${sc.px} ${h.id}`);
      if (h.S !== null) {
        near(r.S, h.S, 1e-9, `S ${sc.px} ${h.id}`);
        assert.equal(r.leg, h.leg);
      }
      if (h.P > 0.01) nonzero++;
    });
    const tr = m.ascan(all, pose, axis);
    sc.trace.forEach((v, j) => near(tr[j * sc.trace_step] / Pref, v, 1e-9, `trace ${sc.px} ${j}`));
  }
  assert.ok(nonzero >= 6);
});

test('positioning: legs, skip distance and textbook examples', () => {
  for (const e of ref.locate) {
    const r = locate(e.S, e.T, e.K);
    near(r.l, e.l, 1e-9, 'l');
    near(r.h, e.h, 1e-9, 'h');
    near(r.d, e.d, 1e-9, 'd');
    assert.equal(r.leg, e.leg);
    assert.equal(r.P, e.P);
  }
  const a = locate(70, 22, 2);
  near(a.d, 2 * 22 - 70 * Math.cos(Math.atan(2)), 1e-12, 'second leg d = 2T - S cos');
  near(pathFromL(a.l, 22, 2).S, 70, 1e-9, 'inverse');
  const z = zigzag(100, 1, 22, 2, 150);
  near(z[2].x - z[0].x, 88, 1e-9, 'full skip = P');
  near(z[1].z, 22, 1e-12, 'bottom');
  near(z[2].z, 0, 1e-12, 'top');
  const b = Math.atan(2);
  for (const mode of ['S', 'l', 'h']) near(scaleToS(mode, scaleValue(mode, 55, b), b), 55, 1e-12, mode);
});

test('positioning exercises stay in legs 1-2 away from the bottom and grade within 0.2 mm', () => {
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const legs = new Set();
  for (let i = 0; i < 400; i++) {
    const pb = makeProblem(rnd, i % 2 ? 'S' : 'l');
    assert.ok(pb.ans.leg === 1 || pb.ans.leg === 2);
    assert.ok(Math.abs(pb.ans.h - pb.T) > 0.05 * pb.T);
    legs.add(pb.ans.leg);
    const given = pb.type === 'S' ? pb.S : pb.l;
    assert.equal(Math.round(given * 10) / 10, given);
    const r1 = (v) => Math.round(v * 10) / 10;
    assert.ok(gradeAnswer(pb, { leg: pb.ans.leg, d: r1(pb.ans.d), l: r1(pb.ans.l) }).ok);
    assert.equal(gradeAnswer(pb, { leg: 3 - pb.ans.leg, d: pb.ans.d, l: pb.ans.l }).ok, false);
    assert.equal(gradeAnswer(pb, { leg: pb.ans.leg, d: pb.ans.d + 0.5, l: pb.ans.l }).dOk, false);
  }
  assert.equal(legs.size, 2);
});

test('K selection exercises: K_min = (a + b + l0) / T, usable K within the table-25 row and above K_min', () => {
  const rows = JSON.parse(readFileSync(new URL('../../contracts/angle_standard_nbt47013_3_weld.json', import.meta.url), 'utf8')).items.probe_selection.rows;
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 300; i++) {
    const pb = makeKProblem(rnd, rows);
    assert.ok(Math.abs(pb.kmin - (pb.a + pb.b + pb.l0) / pb.T) <= 0.005 + 1e-9);
    assert.ok(pb.ok.length > 0);
    for (const k of K_OPTIONS) {
      const usable = k >= pb.kmin - 1e-9 && k >= pb.range[0] - 1e-9 && k <= pb.range[1] + 1e-9;
      assert.equal(pb.ok.includes(k), usable);
    }
    assert.ok(gradeK(pb, { kmin: pb.kmin + 0.01, K: pb.ok[0] }).ok);
    assert.equal(gradeK(pb, { kmin: pb.kmin + 0.05, K: pb.ok[0] }).kOk, false);
    const bad = K_OPTIONS.find((k) => !pb.ok.includes(k));
    assert.equal(gradeK(pb, { kmin: pb.kmin, K: bad }).pickOk, false);
  }
});
