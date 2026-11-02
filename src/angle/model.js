// Angle-beam echo model: port of tools/angle_ref.py (Probe, Model beam / sphere / SDH / facet / peak / ascan / DAC).
// Element: {x, y, z, kind, D, dl, did, refl}; facets add {A, nx, ny, nz, lobe, tip, edge, corner, ceff, coh}.
// Pose: {px, py, phi}; phi = 0 beams toward +x.

export const SPHERE = 0;
export const SDH = 1;
export const FACET = 2;

const sinc = (x) => (x === 0 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x));
const lobe = (u) => (Math.abs(u) < 1 ? sinc(u) : 0);

const SINC2_INT = (() => {
  const n = 4001;
  const h = 2 / (n - 1);
  let s = 0;
  for (let i = 0; i < n; i++) {
    const v = sinc(-1 + i * h) ** 2;
    s += i === 0 || i === n - 1 ? v / 2 : v;
  }
  return s * h;
})();

// -6 dB pulse-echo half width in units of the main-lobe half width: sinc(u)^2 = 1/2
export const U6 = (() => {
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 60; i++) {
    const m = (lo + hi) / 2;
    if (sinc(m) ** 2 > 0.5) lo = m;
    else hi = m;
  }
  return (lo + hi) / 2;
})();

export function makeProbe(rules) {
  const p = rules.probe;
  const f = p.f_MHz;
  const a = p.element_mm.incidence_plane;
  const b = p.element_mm.lateral;
  const K = p.K;
  const cw = p.c_wedge_m_s;
  const cs = p.c_steel_s_m_s;
  const L1 = p.wedge_path_mm;
  const beta = Math.atan(K);
  const alpha = Math.asin((cw / cs) * Math.sin(beta));
  const lam = cs / (f * 1000);
  const av = (a * Math.cos(beta)) / Math.cos(alpha);
  const thV = Math.asin(lam / av);
  const thH = Math.asin(lam / b);
  const thW = Math.asin(cw / (f * 1000) / a);
  const edges = [-1, 1].map((s) => (Math.asin(Math.min(1, (cs / cw) * Math.sin(alpha + s * thW))) * 180) / Math.PI);
  const N = (av * b) / (Math.PI * lam) - (L1 * Math.tan(alpha)) / Math.tan(beta);
  const fwhm = (p.pulse_cycles * lam) / 2;
  return {
    f, a, b, K, cw, cs, L1, beta, alpha, lam, av, thV, thH, edges, N,
    F: av * b,
    front: p.front_length_mm,
    delayUs: ((2 * L1) / cw) * 1000,
    sb: Math.sin(beta),
    cb: Math.cos(beta),
    sig: fwhm / (2 * Math.sqrt(Math.log(2))),
  };
}

export function probeDerived(p) {
  const deg = (r) => (r * 180) / Math.PI;
  return {
    beta_deg: deg(p.beta), alpha_deg: deg(p.alpha), lambda_s_mm: p.lam, aperture_eff_mm: p.av,
    theta0_v_deg: deg(p.thV), theta0_h_deg: deg(p.thH), edges_deg: p.edges,
    near_field_mm: p.N, wedge_delay_us: p.delayUs,
  };
}

export function sphereElements(x, y, z, D, did = 0) {
  return [{ x, y, z, kind: SPHERE, D, dl: 0, did, refl: 1 }];
}

export function sdhElements(x, y, z, D, y0, y1, did = 0, step = 0.5) {
  const n = Math.max(1, Math.round((y1 - y0) / step));
  const dl = (y1 - y0) / n;
  return Array.from({ length: n }, (_, i) => ({ x, y: y0 + (i + 0.5) * dl, z, kind: SDH, D, dl, did, refl: 1 }));
}

export function createModel(rules, { t } = {}) {
  const p = makeProbe(rules);
  const nf = rules.beam.near_field_blend * p.N;
  const att = rules.beam.attenuation_dB_per_mm;
  const T0 = t ?? rules.dac.block_thickness_mm;
  const wv = (s) => Math.sqrt((p.av / 2) ** 2 + (s * Math.tan(p.thV)) ** 2);
  const wh = (s) => Math.sqrt((p.b / 2) ** 2 + (s * Math.tan(p.thH)) ** 2);
  const sEff = (s) => Math.sqrt(s * s + nf * nf);
  const atten = (s) => 10 ** ((-att * 2 * s) / 20);

  function geom(e, pose, leg, t) {
    const u0 = Math.cos(pose.phi);
    const u1 = Math.sin(pose.phi);
    const hx = e.x - pose.px;
    const hy = e.y - (pose.py ?? 0);
    const hu = hx * u0 + hy * u1;
    const hp = -hx * u1 + hy * u0;
    const zu = leg === 1 ? e.z : 2 * t - e.z;
    const L = Math.max(Math.sqrt(hu * hu + hp * hp + zu * zu), 1e-9);
    return {
      s: hu * p.sb + zu * p.cb,
      rv: hu * p.cb - zu * p.sb,
      rh: hp,
      L,
      dx: hx / L,
      dy: hy / L,
      dz: leg === 1 ? zu / L : -zu / L,
    };
  }

  function facetR(e, g, leg) {
    const c = Math.min(1, Math.abs(e.nx * g.dx + e.ny * g.dy + e.nz * g.dz));
    let R = Math.exp(-((Math.acos(c) / e.lobe) ** 2));
    if (e.edge) R = Math.max(R, e.tip);
    if ((e.corner === 2 && leg === 1 && g.dz > 0) || (e.corner === 1 && leg === 2 && g.dz < 0)) {
      const nn = Math.max(Math.hypot(e.nx, e.ny), 1e-9);
      const dn = Math.max(Math.hypot(g.dx, g.dy), 1e-9);
      const ch = Math.min(1, Math.abs((e.nx / nn) * (g.dx / dn) + (e.ny / nn) * (g.dy / dn)));
      R = Math.max(R, e.ceff * Math.exp(-((Math.acos(ch) / e.lobe) ** 2)));
    }
    return R;
  }

  function echoes(els, pose, t = T0, legs = [1, 2]) {
    const out = [];
    for (const leg of legs) {
      let facets = null;
      for (const e of els) {
        const g = geom(e, pose, leg, t);
        let P = 0;
        const sp = g.s > 1e-3 ? g.s : 1;
        if (g.s > 1e-3) {
          const s = g.s;
          const Se = sEff(s);
          const B = lobe(g.rv / wv(s)) ** 2 * lobe(g.rh / wh(s)) ** 2 * atten(s);
          if (B > 0) {
            if (e.kind === SPHERE) P = (p.F * e.D) / (4 * p.lam * Se * Se);
            else if (e.kind === SDH) P = ((p.F / (2 * p.lam)) * Math.sqrt(e.D / 2)) / Se ** 1.5 * e.dl / (SINC2_INT * wh(s));
            else P = ((p.F * e.A) / (p.lam ** 2 * Se * Se)) * facetR(e, g, leg);
            P *= B * e.refl;
          }
        }
        if (e.kind === FACET) {
          facets ??= new Map();
          let f = facets.get(e.did);
          if (!f) facets.set(e.did, (f = { tot: 0, ps: 0, idx: [] }));
          f.tot += P;
          f.ps += P * sp;
          f.idx.push(out.length);
        }
        out.push({ S: g.L, P, leg, did: e.did, coh: !!e.coh });
      }
      if (facets) {
        for (const f of facets.values()) {
          if (f.tot <= 0) continue;
          const sm = f.ps / f.tot;
          const pbw = (p.F / (2 * p.lam * sEff(sm))) * atten(sm);
          const k = Math.sqrt(1 + (f.tot / pbw) ** 2);
          for (const i of f.idx) out[i].P /= k;
        }
      }
    }
    return out;
  }

  const WIN = 6.5 * p.sig;
  const PH = (4 * Math.PI) / p.lam;
  // Echoes above `rel`·max, sorted by S, as phasors (rough facets carry the phase 4πS/λ).
  function phasors(ec, rel) {
    let max = 0;
    for (const q of ec) if (q.P > max) max = q.P;
    const k = ec.filter((q) => q.P > rel * Math.max(max, 1e-30)).sort((a, b) => a.S - b.S);
    const n = k.length;
    const S = new Float64Array(n);
    const re = new Float64Array(n);
    const im = new Float64Array(n);
    k.forEach((q, i) => {
      S[i] = q.S;
      re[i] = q.coh ? q.P * Math.cos(PH * q.S) : q.P;
      im[i] = q.coh ? q.P * Math.sin(PH * q.S) : 0;
    });
    return { k, S, re, im, max };
  }

  function lowerBound(S, v) {
    let lo = 0;
    let hi = S.length;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      if (S[m] < v) lo = m + 1;
      else hi = m;
    }
    return lo;
  }

  function envAt(ph, at) {
    let r = 0;
    let i = 0;
    for (let j = lowerBound(ph.S, at - WIN); j < ph.S.length && ph.S[j] <= at + WIN; j++) {
      const w = Math.exp(-(((at - ph.S[j]) / p.sig) ** 2));
      r += ph.re[j] * w;
      i += ph.im[j] * w;
    }
    return Math.hypot(r, i);
  }

  function peak(els, pose, t = T0, legs = [1, 2]) {
    const ec = echoes(els, pose, t, legs);
    let max = 0;
    for (const q of ec) max = Math.max(max, q.P);
    if (!(max > 0)) return { P: 0, S: NaN, leg: 0 };
    const ph = phasors(ec, 1e-3);
    let best = { P: -1, S: NaN, leg: 0 };
    ph.k.forEach((q, i) => {
      const env = envAt(ph, ph.S[i]);
      if (env > best.P) best = { P: env, S: q.S, leg: q.leg };
    });
    return best;
  }

  function ascan(els, pose, Saxis, t = T0, legs = [1, 2]) {
    const ph = phasors(echoes(els, pose, t, legs), 1e-4);
    const out = new Float64Array(Saxis.length);
    for (let i = 0; i < Saxis.length; i++) out[i] = envAt(ph, Saxis[i]);
    return out;
  }

  let dac = null;
  let Pref = null;
  function dacPoints() {
    if (dac) return dac;
    const cfg = rules.dac;
    const T = cfg.block_thickness_mm;
    const Lh = cfg.hole_length_mm;
    const pts = cfg.points.map((spec) => {
      const el = sdhElements(0, 0, spec.hole_depth_mm, 2, -Lh / 2, Lh / 2);
      let best = { P: 0, S: 0, d: 0 };
      for (let i = 0; i * 0.25 < 260; i++) {
        const d = i * 0.25;
        const r = peak(el, { px: d, py: 0, phi: Math.PI }, T, [spec.leg]);
        if (r.P > best.P) best = { P: r.P, S: r.S, d };
      }
      return { hole_depth_mm: spec.hole_depth_mm, leg: spec.leg, ...best };
    });
    const ref = rules.display.ref;
    Pref = pts.find((q) => q.hole_depth_mm === ref.hole_depth_mm && q.leg === ref.leg).P;
    for (const q of pts) q.dB = 20 * Math.log10(q.P / Pref);
    pts.sort((a, b) => a.S - b.S);
    dac = pts;
    return pts;
  }

  function dacDb(S) {
    const pts = dacPoints();
    const n = pts.length;
    if (S <= pts[0].S) return pts[0].dB;
    if (S >= pts[n - 1].S) return pts[n - 1].dB + ((S - pts[n - 1].S) * (pts[n - 1].dB - pts[n - 2].dB)) / (pts[n - 1].S - pts[n - 2].S);
    for (let i = 1; i < n; i++) {
      if (S <= pts[i].S) return pts[i - 1].dB + ((S - pts[i - 1].S) * (pts[i].dB - pts[i - 1].dB)) / (pts[i].S - pts[i - 1].S);
    }
    return pts[n - 1].dB;
  }

  function pRef() {
    dacPoints();
    return Pref;
  }

  function percent(P, gainDb) {
    const ref = rules.display.ref;
    return (P / pRef()) * ref.percent_fsh * 10 ** ((gainDb - ref.gain_dB) / 20);
  }

  return { p, t: T0, nf, wv, wh, sEff, atten, geom, echoes, peak, ascan, dacPoints, dacDb, pRef, percent };
}
