import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createModel } from '../src/angle/model.js';
import {
  sampleProbe, sampleRules, arcEchoes, holeEcho, tof, screenS, screenToTrue, twoPoint,
  kFromMark, kFromPath, dacRow, holePeak, maxPath, curveDb, scanGain, screenTrace,
} from '../src/angle/calib.js';

const load = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const rules = load('../../contracts/angle_waveform_rules.json');
const cal = load('../../contracts/angle_calibration.json');
const std = load('../../contracts/angle_standard_nbt47013_3_weld.json');
const ref = load('./angle_b3_ref.json');
const blk = cal.csk_ia;

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`);
const caseRules = (c) => (c.name === 'ideal' ? rules : sampleRules(rules, { K: 2.04, front: 13.4, delayDev: 0.2 }));

test('sampled rules reproduce the Python probe', () => {
  for (const c of ref.cases) {
    const r = caseRules(c);
    for (const k of ['K', 'front_length_mm', 'wedge_path_mm']) near(r.probe[k], c.probe[k], 1e-12, `${c.name} ${k}`);
    const m = createModel(r);
    near((m.p.beta * 180) / Math.PI, c.beta_deg, 1e-9, 'beta');
    near(m.p.delayUs, c.delay_us, 1e-9, 'delay');
    near(m.p.N, c.N, 1e-9, 'N');
  }
  assert.equal(rules.probe.K, 2, 'source rules untouched');
});

test('CSK-IA arc and Φ50 echoes equal the Python reference', () => {
  for (const c of ref.cases) {
    const m = createModel(caseRules(c));
    const Pref = m.pRef();
    for (const a of c.arcs) {
      const js = arcEchoes(m, a.xi, blk);
      assert.equal(js.length, a.echoes.length);
      a.echoes.forEach((q, i) => {
        assert.equal(js[i].id, q.id);
        near(js[i].S, q.S, 1e-9, `${c.name} arc S ${a.xi}`);
        near(js[i].P / Pref, q.P, 1e-9, `${c.name} arc P ${a.xi}`);
      });
    }
    for (const h of c.holes) {
      const q = holeEcho(m, h.xi, blk);
      near(q.S, h.S, 1e-9, `${c.name} hole S ${h.xi}`);
      near(q.P / Pref, h.P, 1e-9, `${c.name} hole P ${h.xi}`);
    }
    const best = c.holes.reduce((a, b) => (b.P > a.P ? b : a));
    near(best.xi, c.hole_peak_x, 1e-9, 'Φ50 peak at 35 + 30K');
    const atC = c.arcs.find((a) => a.xi === blk.arc_centre_x_mm).echoes.find((q) => q.id === 'R100');
    for (const a of c.arcs) for (const q of a.echoes) if (q.id === 'R100') assert.ok(q.P <= atC.P + 1e-6, 'R100 max at the centre mark');
  }
});

test('maximum echoes fall on the geometric alignment for every sampled probe', () => {
  for (const K of [1.95, 2.0, 2.06]) {
    const m = createModel(sampleRules(rules, { K, front: 14, delayDev: 0 }));
    let h = { P: 0 };
    for (let x = 85; x <= 110; x += 0.05) {
      const q = holeEcho(m, x, blk);
      if (q && q.P > h.P) h = { ...q, x };
    }
    near(h.x, blk.hole50.x_mm + blk.hole50.z_mm * K, 0.03, `Φ50 peak K ${K}`);
    near(kFromMark(h.x, blk), K, 0.002, `K mark ${K}`);
    near(kFromPath(h.S, blk), K, 0.002, `K path ${K}`);
    let a = { P: 0 };
    for (let x = 190; x <= 210; x += 0.05) {
      const q = arcEchoes(m, x, blk).find((e) => e.id === 'R100');
      if (q.P > a.P) a = { ...q, x };
    }
    near(a.x, blk.arc_centre_x_mm, 0.03, `R100 peak K ${K}`);
    near(a.S, 100, 0.03, 'R100 path');
  }
});

test('time base: two-point calibration recovers shear velocity and wedge delay', () => {
  for (const c of ref.cases) {
    const m = createModel(caseRules(c));
    near(tof(m, 50), c.tof.t50, 1e-9, 't50');
    near(tof(m, 100), c.tof.t100, 1e-9, 't100');
    const tp = twoPoint(tof(m, 50), tof(m, 100), 50, 100);
    near(tp.v, c.tof.v, 1e-6, 'v');
    near(tp.t0, c.tof.t0, 1e-9, 't0');
    near(screenS(tof(m, 77.7), tp.v, tp.t0), 77.7, 1e-9, 'screen after calibration');
    near(screenToTrue(m, screenS(tof(m, 33), 5920, 0), 5920, 0), 33, 1e-9, 'inverse');
  }
  const m = createModel(rules);
  const i = cal.instrument;
  assert.ok(screenS(tof(m, 100), i.velocity_m_s.initial, i.zero_us.initial) < i.range_mm, 'R100 on screen before calibration');
});

test('K from the marks and from the Φ50 sound path', () => {
  for (const e of ref.k_from_mark) near(kFromMark(e.x, blk), e.K, 1e-12, `mark ${e.x}`);
  for (const e of ref.k_from_path) near(kFromPath(e.S, blk), e.K, 1e-12, `path ${e.S}`);
  for (const [k, x] of Object.entries(blk.k_marks_top)) near(kFromMark(x, blk), +k, 1e-12, `mark K${k}`);
});

test('DAC on CSK-IIA-1, lines from table 27 and scan sensitivity', () => {
  const rows = std.items.dac_sensitivity.rows;
  for (const c of ref.cases) {
    const m = createModel(caseRules(c));
    const pts = m.dacPoints();
    pts.forEach((q, i) => near(q.dB, c.dac[i].dB, 1e-6, `${c.name} dac ${i}`));
    const row = dacRow(rows, cal.dac.plate_t_mm);
    assert.deepEqual({ EL: row.EL_dB, SL: row.SL_dB, RL: row.RL_dB }, c.scan.lines);
    const Smax = maxPath(cal.dac.plate_t_mm, cal.dac.legs, m.p.K);
    near(Smax, c.scan.Smax, 1e-9, 'Smax');
    near(m.dacDb(Smax) + row.EL_dB, c.scan.EL_at_Smax_dB, 1e-6, 'EL at Smax');
    const g = scanGain(m.dacDb(Smax), row, rules.display.ref, cal.dac.el_min_percent);
    near(g, c.scan.gain_dB, 1e-6, 'gain');
    near(m.percent(m.pRef() * 10 ** ((m.dacDb(Smax) + row.EL_dB) / 20), g), cal.dac.el_min_percent, 1e-6, 'EL height');
    const hp = holePeak(m, pts[1].hole_depth_mm, pts[1].leg, rules.dac.block_thickness_mm, rules.dac.hole_length_mm);
    near(20 * Math.log10(hp.P / m.pRef()), pts[1].dB, 1e-9, 'holePeak = DAC point');
    near(hp.S, pts[1].S, 1e-9, 'holePeak S');
    const rec = pts.map((q) => ({ S: q.S, A: q.dB }));
    near(curveDb(rec, Smax), m.dacDb(Smax), 1e-9, 'curve = model DAC');
  }
});

test('probe samples stay in range; screen trace peaks at the echo', () => {
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 200; i++) {
    const s = sampleProbe(cal.probe_sample, rnd);
    assert.ok(s.K >= 1.95 && s.K <= 2.06);
    assert.ok(s.front >= 13 && s.front <= 15);
    assert.ok(Math.abs(s.delayDev) <= 0.3);
  }
  const m = createModel(rules);
  const axis = Array.from({ length: 501 }, (_, i) => i * 0.5);
  const tp = twoPoint(tof(m, 50), tof(m, 100), 50, 100);
  const tr = screenTrace(m, [{ S: 100, P: 1 }], axis, tp.v, tp.t0);
  near(axis[tr.indexOf(Math.max(...tr))], 100, 1e-9, 'peak at 100');
});
