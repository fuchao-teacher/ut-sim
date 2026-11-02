import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createWeld, mulberry32, pyRound } from '../src/angle/weld.js';

const load = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const rules = load('../../contracts/angle_waveform_rules.json');
const cases = load('../../contracts/angle_cases.json');
const std = load('../../contracts/angle_standard_nbt47013_3_weld.json');
const ref = load('./angle_b4_ref.json');

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`);
const rel = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol * Math.max(1e-12, Math.abs(b)), `${msg}: ${a} vs ${b}`);
const W = createWeld(rules, cases, std);
const built = W.demo().map((d, i) => W.buildDefect(d, i));

test('specimen geometry, probe zone and lines equal the reference', () => {
  near(W.dMin, ref.d_min, 1e-12, 'd_min');
  near(W.dMax, ref.d_max, 1e-12, 'd_max');
  near(W.P, ref.P, 1e-12, 'P');
  assert.deepEqual(W.lines, ref.lines);
  assert.equal(W.transPlus, ref.trans_plus);
  for (const q of ref.fusion_hw) near(W.fusionHw(q.z), q.hw, 1e-12, `fusion ${q.z}`);
  for (const q of ref.groove_x) near(W.grooveX(q.z, q.face), q.x, 1e-12, `groove ${q.z}`);
  assert.equal(pyRound(2.5), 2);
  assert.equal(pyRound(3.5), 4);
  assert.equal(pyRound(12.5), 12);
  const r = mulberry32(1);
  assert.ok(Math.abs(r() - 0.6270739405881613) < 1e-15);
});

test('demo defects build the same element sets', () => {
  built.forEach(({ el, meta }, i) => {
    const r = ref.demo[i];
    const c = r.el;
    assert.equal(el.length, c.n, `${r.id} n`);
    assert.equal(el[0].kind, c.kind, `${r.id} kind`);
    const sum = (f) => el.reduce((a, e) => a + f(e), 0);
    ['x', 'y', 'z'].forEach((k, j) => near(sum((e) => e[k]), c.pos[j], 1e-8, `${r.id} pos ${k}`));
    if (c.kind === 2) {
      ['nx', 'ny', 'nz'].forEach((k, j) => near(sum((e) => e[k]), c.nrm[j], 1e-9, `${r.id} nrm ${k}`));
      near(sum((e) => e.A), c.A, 1e-9, `${r.id} A`);
      assert.equal(sum((e) => (e.edge ? 1 : 0)), c.edge, `${r.id} edges`);
      assert.equal(el[0].coh, c.coh);
      assert.equal(el[0].corner, c.corner);
      const f = el[0];
      const l = el[el.length - 1];
      [f.x, f.y, f.z].forEach((v, j) => near(v, c.first.pos[j], 1e-12, `${r.id} first pos`));
      [f.nx, f.ny, f.nz].forEach((v, j) => near(v, c.first.nrm[j], 1e-12, `${r.id} first nrm`));
      [l.x, l.y, l.z].forEach((v, j) => near(v, c.last.pos[j], 1e-12, `${r.id} last pos`));
      [l.nx, l.ny, l.nz].forEach((v, j) => near(v, c.last.nrm[j], 1e-12, `${r.id} last nrm`));
    }
    near(el[0].refl, c.refl, 1e-12, `${r.id} refl`);
    near(meta.y0, r.meta.y0, 1e-12, `${r.id} y0`);
    near(meta.y1, r.meta.y1, 1e-12, `${r.id} y1`);
    near(meta.len_true, r.meta.len_true, 1e-12, `${r.id} len`);
    assert.equal(meta.not_allowed, r.meta.not_allowed);
  });
});

test('facet, sphere and SDH peaks equal the reference (incl. corner rule, saturation, coherent cracks)', () => {
  const Pref = W.m.pRef();
  let n = 0;
  built.forEach(({ el }, i) => {
    for (const q of ref.demo[i].peaks) {
      const [px, py, phi] = q.pose;
      const r = W.m.peak(el, { px, py, phi });
      const tag = `${ref.demo[i].id} ${px} ${phi.toFixed(3)}`;
      rel(r.P / Pref, q.P, 1e-7, `${tag} P`);
      if (q.S !== null && q.P > 1e-6) {
        near(r.S, q.S, 1e-7, `${tag} S`);
        assert.equal(r.leg, q.leg, `${tag} leg`);
        near(W.hDb(r.P, r.S), q.h, 1e-6, `${tag} h`);
      }
      n++;
    }
  });
  assert.ok(n >= 100);
});

test('fore-aft scan of the lack of fusion and best positions from both sides', () => {
  const { el, meta } = built[1];
  const fa = W.foreAft(el, 1, (meta.y0 + meta.y1) / 2);
  assert.equal(fa.length, ref.fore_aft.d.length);
  fa.forEach((q, i) => {
    near(q.d, ref.fore_aft.d[i], 1e-9, `d ${i}`);
    near(q.h, ref.fore_aft.h[i], 1e-6, `h ${i}`);
  });
  for (const i of [0, 2, 3, 4]) {
    const { el: e, meta: mt } = built[i];
    const yc = (mt.y0 + mt.y1) / 2;
    for (const side of [1, -1]) {
      const b = ref.demo[i].fore_aft_best[String(side)];
      const best = W.foreAft(e, side, yc).reduce((a, q) => (q.h > a.h ? q : a));
      near(best.h, b.h, 1e-6, `${ref.demo[i].id} ${side} best h`);
      near(best.d, b.d, 1e-9, `${ref.demo[i].id} ${side} best d`);
    }
  }
});

test('A-scan traces of the whole demo plate equal the reference', () => {
  const all = built.flatMap((b) => b.el);
  const Pref = W.m.pRef();
  const axis = Array.from({ length: 801 }, (_, i) => i * ref.S_axis_step);
  for (const tr of ref.traces) {
    const [px, py, phi] = tr.pose;
    const a = W.m.ascan(all, { px, py, phi }, axis);
    const mx = Math.max(...tr.trace);
    tr.trace.forEach((v, j) => near(a[j * tr.step] / Pref, v, 1e-7 * Math.max(mx, 1e-6), `trace ${px} ${j}`));
  }
});

test('coverage of the detection zone equals the reference', () => {
  for (const [key, sides] of [['both', [1, -1]], ['right', [1]], ['left', [-1]]]) {
    const r = W.coverage(sides);
    const c = ref.coverage[key];
    assert.equal(r.inside, c.inside, `${key} inside`);
    assert.equal(r.covered, c.covered, `${key} covered`);
  }
  const g = W.coverageGrid();
  assert.equal(g.nx, ref.coverage.both.nx);
  assert.equal(g.nz, ref.coverage.both.nz);
  near(g.xs[0], ref.coverage.both.x0, 1e-12, 'x0');
});

test('random cases equal the reference generator for fixed seeds', () => {
  for (const c of ref.cases) {
    const j = W.generateCase(c.seed);
    assert.deepEqual(JSON.parse(JSON.stringify(j)), c, `seed ${c.seed}`);
    for (const [i, d] of j.defects.entries()) W.buildDefect(d, i);
  }
});

test('every defect type of the demo plate shows on screen at scan sensitivity; all but the small pore reach EL', () => {
  const sMax = 2 * W.t * Math.sqrt(1 + W.p.K ** 2);
  const gain = W.scanGain();
  near(W.m.percent(W.m.pRef() * 10 ** ((W.m.dacDb(sMax) + W.lines.EL) / 20), gain), 20, 1e-9, 'EL at Smax = 20 %');
  const seen = new Set();
  built.forEach(({ meta }, i) => {
    const r = ref.demo[i];
    const b = r.transverse_best
      ? { h: r.transverse_best.h, S: r.peaks[0].S }
      : [r.fore_aft_best['1'], r.fore_aft_best['-1']].reduce((a, q) => (q.h > a.h ? q : a));
    const g = gain + (meta.transverse ? W.transPlus : 0);
    const pct = W.m.percent(W.m.pRef() * 10 ** ((b.h + W.m.dacDb(b.S)) / 20), g);
    if (pct >= 10) seen.add(meta.type);
    const el = W.lines.EL - (meta.transverse ? W.transPlus : 0);
    if (meta.type === 'pore') assert.ok(b.h < el, 'demo pore below EL');
    else assert.ok(b.h >= el, `${meta.type} ≥ EL`);
  });
  for (const k of ['lop', 'lof', 'pore', 'slag', 'toe_crack', 'transverse_crack']) assert.ok(seen.has(k), k);
});
