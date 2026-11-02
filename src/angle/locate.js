// Angle-beam positioning: sound path S along a zig-zag beam in a plate of thickness T.
// h = S cos(beta) is the unfolded depth, l = S sin(beta) = K h the horizontal distance from the index point.

export function locate(S, T, K) {
  const beta = Math.atan(K);
  const h = S * Math.cos(beta);
  const l = S * Math.sin(beta);
  const leg = Math.max(1, Math.floor(h / T) + 1);
  const r = h - (leg - 1) * T;
  const d = leg % 2 === 1 ? r : T - r;
  return { S, T, K, beta, h, l, d, leg, P: 2 * T * K };
}

export function pathFromL(l, T, K) {
  return locate(l / Math.sin(Math.atan(K)), T, K);
}

// Points of the zig-zag beam axis from the index point (x0) up to sound path Smax; dir = +1 / -1.
export function zigzag(x0, dir, T, K, Smax) {
  const beta = Math.atan(K);
  const pts = [{ x: x0, z: 0, S: 0 }];
  const legS = T / Math.cos(beta);
  let S = 0;
  let z = 0;
  let down = true;
  while (S < Smax - 1e-9) {
    const step = Math.min(legS, Smax - S);
    S += step;
    const dz = step * Math.cos(beta);
    z = down ? z + dz : z - dz;
    pts.push({ x: x0 + dir * S * Math.sin(beta), z, S });
    if (step === legS) down = !down;
  }
  return pts;
}

const EX_T = [8, 10, 12, 14, 16, 18, 20, 22, 25, 28, 30, 32, 36, 40];
const EX_K = [1.5, 2, 2.5];

// Positioning exercise: type 'S' gives the sound path, type 'l' the horizontal distance; answers keep one decimal.
export function makeProblem(rnd = Math.random, kind) {
  const T = EX_T[Math.floor(rnd() * EX_T.length)];
  const K = EX_K[Math.floor(rnd() * EX_K.length)];
  const b = Math.atan(K);
  let h;
  do h = T * (0.12 + rnd() * 1.76); while (Math.abs(h - T) < 0.06 * T);
  const type = kind || (rnd() < 0.5 ? 'S' : 'l');
  const S = Math.round((h / Math.cos(b)) * 10) / 10;
  const l = Math.round(S * Math.sin(b) * 10) / 10;
  const ans = type === 'S' ? locate(S, T, K) : locate(l / Math.sin(b), T, K);
  return { type, T, K, S: type === 'S' ? S : null, l: type === 'l' ? l : ans.l, ans };
}

// K selection: the first-leg beam from a probe with its front at the cap edge reaches the far root edge,
// K >= (a + b + l0) / T (a, b: weld half widths at the scanning face / root, l0: front length);
// a usable K also lies in the thickness row of the probe table (rows: [{ t_mm: [lo, hi], K: [k0, k1] }]).
export const K_OPTIONS = [1.0, 1.5, 2.0, 2.5, 3.0];
const EX_KW = { a: [6, 7, 8, 9, 10, 12], b: [2, 3, 4, 5], l0: [10, 12, 13, 14, 15] };

export function makeKProblem(rnd = Math.random, rows) {
  const pick = (xs) => xs[Math.floor(rnd() * xs.length)];
  for (;;) {
    const T = pick(EX_T);
    const a = pick(EX_KW.a);
    const b = pick(EX_KW.b);
    const l0 = pick(EX_KW.l0);
    const kmin = Math.round(((a + b + l0) / T) * 100) / 100;
    const row = rows.find((r, i) => (T > r.t_mm[0] || (i === 0 && T >= r.t_mm[0])) && (r.t_mm[1] == null || T <= r.t_mm[1]));
    if (!row) continue;
    const ok = K_OPTIONS.filter((k) => k >= kmin - 1e-9 && k >= row.K[0] - 1e-9 && k <= row.K[1] + 1e-9);
    if (ok.length && ok.length < K_OPTIONS.length) return { type: 'K', T, a, b, l0, kmin, range: row.K, ok };
  }
}

export function gradeK(pb, a, tol = 0.02) {
  const kOk = Math.abs(a.kmin - pb.kmin) <= tol;
  const pickOk = pb.ok.includes(a.K);
  return { kOk, pickOk, ok: kOk && pickOk };
}

export function gradeAnswer(pb, a, tol = 0.2) {
  const legOk = a.leg === pb.ans.leg;
  const dOk = Math.abs(a.d - pb.ans.d) <= tol;
  const lOk = pb.type !== 'S' || Math.abs(a.l - pb.ans.l) <= tol;
  return { legOk, dOk, lOk, ok: legOk && dOk && lOk };
}

// Axis value of an echo at sound path S under the three time-base scales.
export function scaleValue(mode, S, beta) {
  if (mode === 'l') return S * Math.sin(beta);
  if (mode === 'h') return S * Math.cos(beta);
  return S;
}

export function scaleToS(mode, v, beta) {
  if (mode === 'l') return v / Math.sin(beta);
  if (mode === 'h') return v / Math.cos(beta);
  return v;
}

// Drawn sound-path length for angle-beam diagrams (section / 3D).
// Near the weld (|px| ≤ KT) the first leg already crosses the weld before the bottom —
// draw only to the bottom bounce. Farther out, draw through the skip (second leg).
// With a gate echo, draw just past that echo so the path stops at the reflector.
export function beamDrawS({ T, K, px, range, echoS = null }) {
  const legS = T * Math.sqrt(1 + K * K);
  const near = Math.abs(px) <= K * T + 1e-6;
  if (echoS != null && echoS > 0) return Math.min(range, echoS + 2);
  return Math.min(range, near ? legS : 2 * legS);
}
