// Calibration model: port of tools/angle_b3_ref.py (probe sample, CSK-IA arc / Φ50 echoes, time base, K value, DAC lines).
import { createModel, sdhElements } from './model.js';

const sinc = (x) => (x === 0 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x));
const lobe = (u) => (Math.abs(u) < 1 ? sinc(u) : 0);
const uni = (rnd, [a, b]) => a + (b - a) * rnd();

export function sampleProbe(cfg, rnd = Math.random) {
  return {
    K: Math.round(uni(rnd, cfg.K) * 1000) / 1000,
    front: Math.round(uni(rnd, cfg.front_length_mm) * 10) / 10,
    delayDev: Math.round(uni(rnd, [-cfg.wedge_delay_dev_us, cfg.wedge_delay_dev_us]) * 100) / 100,
  };
}

export function sampleRules(rules, s) {
  const r = structuredClone(rules);
  const p = r.probe;
  p.K = s.K;
  p.front_length_mm = s.front;
  p.wedge_path_mm += (s.delayDev * p.c_wedge_m_s) / 2000;
  return r;
}

export function sampleModel(rules, s, opts) {
  return createModel(sampleRules(rules, s), opts);
}

// Probe facing +x with the index point at xi; arcs centred on the top surface at blk.arc_centre_x_mm; amplitude terms at the arc radius.
export function arcEchoes(m, xi, blk) {
  const p = m.p;
  const e = xi - blk.arc_centre_x_mm;
  const out = [];
  for (const a of blk.arcs) {
    const R = a.R_mm;
    const pp = Math.abs(e) * p.cb;
    if (pp >= R) continue;
    const s = -e * p.sb + Math.sqrt(R * R - pp * pp);
    if (s <= 1e-3) continue;
    const P = (p.F / (2 * p.lam * m.sEff(R))) * m.atten(R) * lobe(pp / m.wv(R)) ** 2 * a.fraction;
    out.push({ id: a.id, S: s, P });
  }
  return out;
}

// Probe facing −x with the index point at xi toward the Φ50 hole; amplitude terms at the aligned path (axis through the centre).
export function holeEcho(m, xi, blk) {
  const p = m.p;
  const h = blk.hole50;
  const r = h.phi_mm / 2;
  const hu = xi - h.x_mm;
  const zu = h.z_mm;
  const s = hu * p.sb + zu * p.cb;
  const rv = hu * p.cb - zu * p.sb;
  if (s - r <= 1e-3) return null;
  const s0 = zu / p.cb;
  const ss0 = s0 - r;
  const P = ((p.F / (2 * p.lam)) * Math.sqrt(r)) / m.sEff(ss0) ** 1.5 * m.atten(ss0) * lobe(rv / m.wv(s0)) ** 2;
  return { id: 'H50', S: Math.hypot(hu, zu) - r, P };
}

export const tof = (m, S) => m.p.delayUs + (2000 * S) / m.p.cs;
export const screenS = (t, v, t0) => ((t - t0) * v) / 2000;
export const screenToTrue = (m, Sscr, v, t0) => ((t0 + (2000 * Sscr) / v - m.p.delayUs) * m.p.cs) / 2000;

export function twoPoint(t1, t2, s1, s2) {
  const v = (2000 * (s2 - s1)) / (t2 - t1);
  return { v, t0: t1 - (2000 * s1) / v };
}

export const kFromMark = (x, blk) => (x - blk.hole50.x_mm) / blk.hole50.z_mm;

export function kFromPath(S, blk) {
  const h = blk.hole50;
  const L = S + h.phi_mm / 2;
  if (!(L > h.z_mm)) return NaN;
  return Math.tan(Math.acos(h.z_mm / L));
}

// Highest echo of one Φ2 side-drilled hole over probe positions, as in Model.dacPoints.
export function holePeak(m, depth, leg, T, Lh, D = 2) {
  const el = sdhElements(0, 0, depth, D, -Lh / 2, Lh / 2);
  let best = { P: 0, S: 0, d: 0 };
  for (let i = 0; i * 0.25 < 260; i++) {
    const d = i * 0.25;
    const r = m.peak(el, { px: d, py: 0, phi: Math.PI }, T, [leg]);
    if (r.P > best.P) best = { P: r.P, S: r.S, d };
  }
  return best;
}

export const dacRow = (rows, T) => rows.find((r) => r.t_mm[0] <= T && T <= r.t_mm[1]);

export const maxPath = (T, legs, K) => legs * T * Math.sqrt(1 + K * K);

// dB curve through recorded points {S, A}: flat before the first point, linear between points,
// extrapolated from the last segment.
export function curveDb(pts, S) {
  const q = [...pts].sort((a, b) => a.S - b.S);
  const n = q.length;
  if (n === 0) return NaN;
  if (n === 1) return q[0].A;
  const seg = (a, b) => a.A + ((S - a.S) * (b.A - a.A)) / (b.S - a.S);
  if (S <= q[0].S) return q[0].A;
  for (let i = 1; i < n; i++) if (S <= q[i].S) return seg(q[i - 1], q[i]);
  return seg(q[n - 2], q[n - 1]);
}

// Lowest gain putting the EL line at el_min_percent at the maximum path.
export function scanGain(dacDbAtSmax, row, ref, elMinPercent) {
  const el = dacDbAtSmax + row.EL_dB;
  return ref.gain_dB + 20 * Math.log10(elMinPercent / ref.percent_fsh) - el;
}

// A-scan envelope on the instrument screen: echoes {S (true path), P}, screen axis in mm.
export function screenTrace(m, list, axis, v, t0) {
  const sig = m.p.sig;
  const out = new Float64Array(axis.length);
  const q = list.filter((e) => e.P > 0).sort((a, b) => a.S - b.S);
  const W = 4 * sig;
  let j0 = 0;
  for (let i = 0; i < axis.length; i++) {
    const S = screenToTrue(m, axis[i], v, t0);
    while (j0 < q.length && q[j0].S < S - W) j0++;
    let a = 0;
    for (let j = j0; j < q.length && q[j].S <= S + W; j++) a += q[j].P * Math.exp(-(((S - q[j].S) / sig) ** 2));
    out[i] = a;
  }
  return out;
}
