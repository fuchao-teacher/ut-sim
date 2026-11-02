// Wedge/steel interface energy split for an incident longitudinal wave (mirror of tools/angle_interface_ref.py).

const C = (re, im = 0) => ({ re, im });
const add = (a, b) => C(a.re + b.re, a.im + b.im);
const sub = (a, b) => C(a.re - b.re, a.im - b.im);
const mul = (a, b) => C(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re);
const sc = (a, k) => C(a.re * k, a.im * k);
const div = (a, b) => {
  const d = b.re * b.re + b.im * b.im;
  return C((a.re * b.re + a.im * b.im) / d, (a.im * b.re - a.re * b.im) / d);
};
const abs2 = (a) => a.re * a.re + a.im * a.im;
const cosOf = (v, p) => {
  const s = v * v * p * p;
  return s <= 1 ? C(Math.sqrt(1 - s)) : C(0, Math.sqrt(s - 1));
};

export function criticalAngles(m1, m2) {
  return [Math.asin(m1.cL / m2.cL) * 180 / Math.PI, Math.asin(m1.cL / m2.cS) * 180 / Math.PI];
}

// Energy fractions { RL, RS, TL, TS } at incidence alpha (deg); sum = 1.
export function energySplit(alphaDeg, m1, m2) {
  const a1 = m1.cL, b1 = m1.cS, r1 = m1.rho;
  const a2 = m2.cL, b2 = m2.cS, r2 = m2.rho;
  const p = Math.sin(alphaDeg * Math.PI / 180) / a1;
  const pp = p * p;
  const i1 = sc(cosOf(a1, p), 1 / a1), j1 = sc(cosOf(b1, p), 1 / b1);
  const i2 = sc(cosOf(a2, p), 1 / a2), j2 = sc(cosOf(b2, p), 1 / b2);
  const a = r2 * (1 - 2 * b2 * b2 * pp) - r1 * (1 - 2 * b1 * b1 * pp);
  const b = r2 * (1 - 2 * b2 * b2 * pp) + 2 * r1 * b1 * b1 * pp;
  const c = r1 * (1 - 2 * b1 * b1 * pp) + 2 * r2 * b2 * b2 * pp;
  const d = 2 * (r2 * b2 * b2 - r1 * b1 * b1);
  const E = add(sc(i1, b), sc(i2, c));
  const F = add(sc(j1, b), sc(j2, c));
  const G = sub(C(a), sc(mul(i1, j2), d));
  const H = sub(C(a), sc(mul(i2, j1), d));
  const D = add(mul(E, F), sc(mul(G, H), pp));
  const Rpp = div(sub(mul(sub(sc(i1, b), sc(i2, c)), F), sc(mul(add(C(a), sc(mul(i1, j2), d)), H), pp)), D);
  const Rps = div(sc(mul(i1, add(C(a * b), sc(mul(i2, j2), c * d))), -2 * p * a1 / b1), D);
  const Tpp = div(sc(mul(i1, F), 2 * r1 * a1 / a2), D);
  const Tps = div(sc(mul(i1, H), 2 * r1 * p * a1 / b2), D);
  const den = r1 * a1 * cosOf(a1, p).re;
  return {
    RL: abs2(Rpp),
    RS: r1 * b1 * cosOf(b1, p).re / den * abs2(Rps),
    TL: r2 * a2 * cosOf(a2, p).re / den * abs2(Tpp),
    TS: r2 * b2 * cosOf(b2, p).re / den * abs2(Tps),
  };
}

// Snell angles (deg, null when evanescent) for incidence alpha.
export function snellAngles(alphaDeg, m1, m2) {
  const s = Math.sin(alphaDeg * Math.PI / 180) / m1.cL;
  const ang = (v) => (s * v <= 1 ? Math.asin(s * v) * 180 / Math.PI : null);
  return { L: ang(m2.cL), S: ang(m2.cS), rS: ang(m1.cS) };
}
