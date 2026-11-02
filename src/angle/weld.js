// Weld specimen, defects, scans, coverage and random cases: port of tools/angle_ref.py (B0 reference).
// Frame: x across the weld (centre 0), y along the weld, z depth (down).
import { createModel, SPHERE, SDH, FACET, sphereElements, sdhElements } from './model.js';

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1) >>> 0;
    t = (t ^ ((t + Math.imul(t ^ (t >>> 7), t | 61)) >>> 0)) >>> 0;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function gauss(rnd) {
  const u1 = Math.max(rnd(), 1e-12);
  const u2 = rnd();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

// Python round(): half to even on exact ties.
export function pyRound(x, nd = 0) {
  if (nd === 0) {
    const f = Math.floor(x);
    const r = x - f;
    if (r === 0.5) return f % 2 === 0 ? f : f + 1;
    return Math.round(x);
  }
  return Number(x.toFixed(nd));
}

const arange = (a, b, step) => {
  const n = Math.max(0, Math.ceil((b - a) / step));
  return Array.from({ length: n }, (_, i) => a + i * step);
};
const norm3 = (v) => Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
const unit = (v) => {
  const n = norm3(v);
  return [v[0] / n, v[1] / n, v[2] / n];
};
const rad = (d) => (d * Math.PI) / 180;

export function facetSheet(o, uDir, vDir, uLen, vLen, du, dv, normal, lobeDeg, tip, opt = {}) {
  const { roughDeg = 0, rnd = null, corner = 0, ceff = 0, did = 0, jitter = 0 } = opt;
  const nu = Math.max(1, pyRound(uLen / du));
  const nv = Math.max(1, pyRound(vLen / dv));
  const u = unit(uDir);
  const v = unit(vDir);
  const nb = unit(normal);
  const jit = rnd && roughDeg > 0 ? jitter : 0;
  const sig = rad(roughDeg);
  const A = (uLen / nu) * (vLen / nv);
  const out = [];
  for (let i = 0; i < nu; i++) {
    for (let j = 0; j < nv; j++) {
      const a = ((i + 0.5) * uLen) / nu;
      const b = ((j + 0.5) * vLen) / nv;
      let q = [0, 1, 2].map((k) => o[k] + a * u[k] + b * v[k]);
      let n = nb;
      if (rnd && sig > 0) {
        const ta = Math.tan(gauss(rnd) * sig);
        const tb = Math.tan(gauss(rnd) * sig);
        n = unit([0, 1, 2].map((k) => nb[k] + ta * u[k] + tb * v[k]));
      }
      if (jit) {
        const s = gauss(rnd) * jit;
        q = [0, 1, 2].map((k) => q[k] + s * nb[k]);
      }
      out.push({
        x: q[0], y: q[1], z: q[2], kind: FACET, D: 0, dl: 0, A,
        nx: n[0], ny: n[1], nz: n[2], lobe: rad(lobeDeg), tip,
        edge: i === 0 || i === nu - 1 || j === 0 || j === nv - 1,
        corner, ceff, did, refl: 1, coh: roughDeg > 0,
      });
    }
  }
  return out;
}

export function createWeld(rules, cases, stdPack) {
  const std = stdPack.items ?? stdPack;
  const spec = cases.specimen;
  const t = spec.t_mm;
  const m = createModel(rules, { t });
  const p = m.p;
  const dMin = spec.cap.half_width_mm + p.front;
  const P = 2 * p.K * t;
  const dMax = std.probe_zone.once_reflected_P * P;
  const row = std.dac_sensitivity.rows.find((r) => r.t_mm[0] <= t && t <= r.t_mm[1]);
  const lines = { EL: row.EL_dB, SL: row.SL_dB, RL: row.RL_dB };
  const transPlus = std.transverse_plus.plus_dB;
  const T = rules.defect_types;
  const G = rules.facet_grid_mm;
  const jitter = rules.rough_jitter_mm;

  const fusionHw = (z) => {
    const f = spec.fusion;
    const mid = f.waist_depth_mm;
    return f.waist_half_width_mm + ((f.toe_half_width_mm - f.waist_half_width_mm) * Math.abs(z - mid)) / mid;
  };
  const grooveX = (z, face) => {
    const mw = spec.mouth_half_width_mm;
    const gd = spec.groove_depth_mm;
    return face === 'upper' ? mw * (1 - z / gd) : mw * (1 - (t - z) / gd);
  };

  function hDb(Pv, S) {
    if (!(Pv > 0) || !Number.isFinite(S)) return -99;
    return 20 * Math.log10(Pv / m.pRef()) - m.dacDb(S);
  }
  function zone(h, transverse = false) {
    const sh = transverse ? transPlus : 0;
    if (h < lines.EL - sh) return 'below';
    if (h < lines.SL - sh) return 'I';
    if (h < lines.RL - sh) return 'II';
    return 'III';
  }

  function buildDefect(d, did = 0) {
    const typ = d.type;
    const cfg = T[typ];
    const meta = { id: d.id ?? `#${did}`, type: typ, not_allowed: cfg.not_allowed, pattern: cfg.pattern };
    let el;
    if (typ === 'pore') {
      el = sphereElements(d.x, d.y, d.z, d.d, did);
      Object.assign(meta, { y0: d.y - d.d / 2, y1: d.y + d.d / 2, z: [d.z - d.d / 2, d.z + d.d / 2] });
    } else if (typ === 'cluster') {
      el = d.spheres.flatMap(([x, y, z, D]) => sphereElements(x, y, z, D, did));
      const ys = d.spheres.map((s) => s[1]);
      const zs = d.spheres.map((s) => s[2]);
      Object.assign(meta, { y0: Math.min(...ys), y1: Math.max(...ys), z: [Math.min(...zs), Math.max(...zs)] });
    } else if (typ === 'slag') {
      const y0 = d.y - d.len / 2;
      const y1 = d.y + d.len / 2;
      el = sdhElements(d.x, d.y, d.z, d.d, y0, y1, did);
      Object.assign(meta, { y0, y1, z: [d.z - d.d / 2, d.z + d.d / 2] });
    } else if (typ === 'lop') {
      const y0 = d.y - d.len / 2;
      const y1 = d.y + d.len / 2;
      const [z0, z1] = d.z;
      const gap = d.gap ?? 0.7;
      el = [-1, 1].flatMap((s) => facetSheet([(s * gap) / 2, y0, z0], [0, 0, 1], [0, 1, 0], z1 - z0, y1 - y0,
        G.smooth[0], G.smooth[1], [1, 0, 0], cfg.lobe_deg, cfg.tip_floor, { did }));
      Object.assign(meta, { y0, y1, z: [z0, z1] });
    } else if (typ === 'lof') {
      const y0 = d.y - d.len / 2;
      const y1 = d.y + d.len / 2;
      const [z0, z1] = d.z;
      const s = d.side;
      const xa = s * grooveX(z0, d.face);
      const xb = s * grooveX(z1, d.face);
      const u = [xb - xa, 0, z1 - z0];
      const ul = norm3(u);
      const nrm = [u[2] / ul, 0, -u[0] / ul];
      el = facetSheet([xa, y0, z0], u, [0, 1, 0], ul, y1 - y0, G.smooth[0], G.smooth[1], nrm, cfg.lobe_deg, cfg.tip_floor, { did });
      Object.assign(meta, { y0, y1, z: [z0, z1] });
    } else if (typ === 'toe_crack') {
      const y0 = d.y - d.len / 2;
      const y1 = d.y + d.len / 2;
      const s = d.side;
      const top = d.face === 'upper';
      const x0 = s * spec.cap.half_width_mm;
      const zs = top ? 0 : t;
      const tl = rad(cfg.tilt_deg);
      const u = [-s * Math.sin(tl), 0, top ? Math.cos(tl) : -Math.cos(tl)];
      const nrm = [u[2], 0, -u[0]];
      el = facetSheet([x0, y0, zs], u, [0, 1, 0], d.h, y1 - y0, G.rough[0], G.rough[1], nrm, cfg.lobe_deg, cfg.tip_floor, {
        roughDeg: cfg.rough_deg, rnd: mulberry32(d.seed ?? 1), corner: top ? 1 : 2, ceff: cfg.corner_eff, did, jitter,
      });
      const zz = top ? [zs, zs + d.h * Math.cos(tl)] : [zs - d.h * Math.cos(tl), zs];
      Object.assign(meta, { y0, y1, z: zz, x: [x0, x0 + d.h * u[0]] });
    } else if (typ === 'transverse_crack') {
      const [xa, xb] = d.x;
      const [z0, z1] = d.z;
      el = facetSheet([xa, d.y, z0], [1, 0, 0], [0, 0, 1], xb - xa, z1 - z0, G.rough[1], G.rough[0], [0, 1, 0],
        cfg.lobe_deg, cfg.tip_floor, { roughDeg: cfg.rough_deg, rnd: mulberry32(d.seed ?? 1), did, jitter });
      Object.assign(meta, { y0: d.y, y1: d.y, z: [z0, z1], x: [xa, xb], transverse: true });
    } else {
      throw new Error(typ);
    }
    if (cfg.reflectivity !== undefined) for (const e of el) e.refl = cfg.reflectivity;
    meta.len_true = typ !== 'transverse_crack' ? meta.y1 - meta.y0 : d.x[1] - d.x[0];
    return { el, meta };
  }

  const sMax = 2 * t * Math.sqrt(1 + p.K ** 2);
  // Gain at which the EL curve at the second-leg end path stands at elPct of the screen.
  function scanGain(elPct = 20) {
    const ref = rules.display.ref;
    return ref.gain_dB + 20 * Math.log10(elPct / ref.percent_fsh) - m.dacDb(sMax) - lines.EL;
  }

  const sidePose = (side, dist, py, swivelDeg = 0) => ({
    px: side * dist,
    py,
    phi: (side > 0 ? Math.PI : 0) + rad(swivelDeg) * (side > 0 ? 1 : -1),
  });
  const dSteps = (step = 0.5) => arange(dMin, dMax + 1e-9, step);

  function scanRow(el, pose) {
    const r = m.peak(el, pose);
    return { P: r.P, S: r.S, leg: r.leg, h: hDb(r.P, r.S) };
  }
  const foreAft = (el, side, py, ds = dSteps()) => ds.map((d) => ({ d, ...scanRow(el, sidePose(side, d, py)) }));
  const lateral = (el, side, dist, ys, sw = 0) => ys.map((y) => ({ y, ...scanRow(el, sidePose(side, dist, y, sw)) }));
  const swivelScan = (el, side, dist, py, angles = arange(-15, 15.01, 1)) =>
    angles.map((g) => ({ g, ...scanRow(el, sidePose(side, dist, py, g)) }));

  // Cross-section grid of the detection zone and, per side and index distance, the cells inside the -6 dB beam
  // (bit 1: leg 1, bit 2: leg 2).
  let grid = null;
  function coverageGrid(step = 0.5) {
    if (grid && grid.step === step) return grid;
    const g = rules.coverage.grid_mm;
    const side = std.detection_zone.beside_fusion_line_mm;
    const xmax = fusionHw(0) + side;
    const xs = arange(-xmax + g / 2, xmax, g);
    const zs = arange(g / 2, t, g);
    const nx = xs.length;
    const nz = zs.length;
    const inside = new Uint8Array(nx * nz);
    let nIn = 0;
    for (let iz = 0; iz < nz; iz++) {
      for (let ix = 0; ix < nx; ix++) {
        if (Math.abs(xs[ix]) <= fusionHw(zs[iz]) + side) {
          inside[iz * nx + ix] = 1;
          nIn++;
        }
      }
    }
    const ds = dSteps(step);
    const masks = {};
    for (const sd of [1, -1]) {
      masks[sd] = ds.map((d) => {
        const mk = new Uint8Array(nx * nz);
        const pose = sidePose(sd, d, 0);
        for (let iz = 0; iz < nz; iz++) {
          for (let ix = 0; ix < nx; ix++) {
            const c = iz * nx + ix;
            if (!inside[c]) continue;
            const e = { x: xs[ix], y: 0, z: zs[iz] };
            for (const leg of [1, 2]) {
              const q = m.geom(e, pose, leg, t);
              if (q.s > 1e-3) {
                const u = q.rv / m.wv(q.s);
                const l = Math.abs(u) < 1 ? (u === 0 ? 1 : Math.sin(Math.PI * u) / (Math.PI * u)) : 0;
                if (l * l >= 0.5) mk[c] |= leg;
              }
            }
          }
        }
        return mk;
      });
    }
    grid = { step, xs, zs, nx, nz, inside, nIn, ds, masks, cell: g };
    return grid;
  }
  function coverage(sides = [1, -1]) {
    const G0 = coverageGrid();
    const cov = new Uint8Array(G0.nx * G0.nz);
    for (const sd of sides) for (const mk of G0.masks[sd]) for (let c = 0; c < mk.length; c++) if (mk[c]) cov[c] = 1;
    let n = 0;
    for (let c = 0; c < cov.length; c++) n += cov[c] && G0.inside[c] ? 1 : 0;
    return { frac: n / G0.nIn, covered: n, inside: G0.nIn };
  }

  function generateCase(seed) {
    const cfg = cases.random;
    const rnd = mulberry32(seed);
    const uni = (a, b) => a + (b - a) * rnd();
    const TT = cfg.types;
    const keys = Object.keys(TT);
    const allowed = keys.filter((k) => !T[k].not_allowed);
    const banned = keys.filter((k) => T[k].not_allowed);
    const pick = (ks) => {
      const w = ks.map((k) => TT[k].weight);
      let r = rnd() * w.reduce((a, b) => a + b, 0);
      for (let i = 0; i < ks.length; i++) {
        r -= w[i];
        if (r < 0) return ks[i];
      }
      return ks[ks.length - 1];
    };
    const n = cfg.count[0] + Math.floor(rnd() * (cfg.count[1] - cfg.count[0] + 1));
    const withBanned = rnd() < cfg.p_not_allowed;
    const pool = withBanned ? keys : allowed;
    const types = [pick(allowed), withBanned ? pick(banned) : pick(allowed)];
    while (types.length < n) {
      const k = pick(pool);
      if (k === 'transverse_crack' && types.includes('transverse_crack')) continue;
      types.push(k);
    }
    for (let i = types.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [types[i], types[j]] = [types[j], types[i]];
    }
    const r2 = (v) => pyRound(v, 2);
    const r1 = (v) => pyRound(v, 1);
    const defs = types.map((typ, i) => {
      const c = TT[typ];
      const d = { id: `F${i + 1}`, type: typ };
      if (typ === 'pore' || typ === 'cluster' || typ === 'slag') {
        const z = uni(...c.z);
        const dia = uni(...c.d);
        const hw = fusionHw(z) - dia / 2 - 0.5;
        Object.assign(d, { z: r2(z), x: r2(uni(-hw, hw)), d: r2(dia) });
        if (typ === 'slag') d.len = r1(uni(...c.len));
        if (typ === 'cluster') {
          const k = c.n[0] + Math.floor(rnd() * (c.n[1] - c.n[0] + 1));
          const [bx, bz, by] = c.box;
          d.spheres = Array.from({ length: k }, () => {
            const sx = r2(d.x + uni(-bx / 2, bx / 2) * 0.6);
            const sy = uni(-by / 2, by / 2);
            const sz = r2(z + uni(-bz / 2, bz / 2));
            return [sx, sy, sz, r2(uni(...c.d))];
          });
          d.len = by;
        }
      } else if (typ === 'lop') {
        const h = uni(...c.h);
        Object.assign(d, { z: [r2(t / 2 - h / 2), r2(t / 2 + h / 2)], len: r1(uni(...c.len)), gap: c.gap });
      } else if (typ === 'lof') {
        const h = uni(...c.h);
        const face = c.faces[Math.floor(rnd() * 2)];
        const side = rnd() < 0.5 ? 1 : -1;
        const gd = spec.groove_depth_mm;
        const z0 = face === 'upper' ? uni(0.5, gd - h) : uni(t - gd, t - 0.5 - h);
        Object.assign(d, { side, face, z: [r2(z0), r2(z0 + h)], len: r1(uni(...c.len)) });
      } else if (typ === 'toe_crack') {
        const side = rnd() < 0.5 ? 1 : -1;
        const face = c.faces[Math.floor(rnd() * 2)];
        Object.assign(d, { side, face, h: r2(uni(...c.h)), len: r1(uni(...c.len)), seed: seed * 31 + i + 1 });
      } else if (typ === 'transverse_crack') {
        const h = uni(...c.h);
        const w = uni(...c.w);
        const z0 = uni(c.z[0], c.z[1] - h);
        const xc = (rnd() < 0.5 ? 1 : -1) * uni(...c.xc);
        Object.assign(d, { x: [r2(xc - w / 2), r2(xc + w / 2)], z: [r2(z0), r2(z0 + h)], seed: seed * 31 + i + 1, len: 2.0 });
      }
      return d;
    });
    const span = spec.y_mm;
    const lenOf = (dd) => dd.len ?? dd.d ?? 2.0;
    let lens = defs.map(lenOf);
    const sum = (a) => a.reduce((x, y) => x + y, 0);
    const room = span[1] - span[0] - 2 * cfg.y_margin_mm;
    let slack = room - sum(lens) - (defs.length - 1) * cfg.min_gap_mm;
    if (slack < 0) {
      const k = (sum(lens) + slack) / sum(lens);
      for (const dd of defs) if ('len' in dd && dd.type !== 'transverse_crack') dd.len = r1(dd.len * k);
      lens = defs.map(lenOf);
      slack = Math.max(0, room - sum(lens) - (defs.length - 1) * cfg.min_gap_mm);
    }
    const w = Array.from({ length: defs.length + 1 }, () => rnd());
    const tot = sum(w);
    let y = span[0] + cfg.y_margin_mm;
    defs.forEach((dd, i) => {
      y += (slack * w[i]) / tot + (i ? cfg.min_gap_mm : 0);
      const yc = y + lens[i] / 2;
      if (dd.type === 'cluster') dd.spheres = dd.spheres.map((s) => [s[0], r2(yc + s[1]), s[2], s[3]]);
      dd.y = r2(yc);
      y += lens[i];
    });
    return { seed, defects: defs };
  }

  const demo = () => cases.demo.defects.map((d) => structuredClone(d));

  // ---------------------------------------------------------------- evaluation (tools/angle_ref.py)
  const housing = rules.probe.housing_half_width_mm;
  const capHw = spec.cap.half_width_mm;
  const transXMin = (skDeg, hull) => {
    const a = rad(skDeg);
    return hull ? capHw + p.front * Math.sin(a) + housing * Math.cos(a) : capHw + housing;
  };
  const transPose = (side, dist, py, dir, skDeg) => {
    const a = rad(skDeg);
    return { px: side * dist, py, phi: Math.atan2(dir * Math.cos(a), -side * Math.sin(a)) };
  };
  function transverseScan(el, yc, { skews = [0, 5, 10], span = dMax, hull = false } = {}) {
    const [yLo, yHi] = spec.y_mm;
    let best = { h: -99, pose: null, S: NaN, leg: 0 };
    for (const side of [1, -1]) {
      for (const dir of [1, -1]) {
        for (const sk of skews) {
          for (const d of arange(transXMin(sk, hull), 60.01, 2)) {
            for (const py of arange(yc - dir * span, yc + 1e-9 * dir, dir)) {
              if (py < yLo || py > yHi) continue;
              const pose = transPose(side, d, py, dir, sk);
              const r = scanRow(el, pose);
              if (r.h > best.h) best = { h: r.h, pose, S: r.S, leg: r.leg };
            }
          }
        }
      }
    }
    return best;
  }

  const prominence = rules.scan.multi_peak_prominence_dB;
  const localMax = (h) => {
    const out = [];
    for (let i = 0; i < h.length; i++) if ((i === 0 || h[i] >= h[i - 1]) && (i === h.length - 1 || h[i] >= h[i + 1])) out.push(i);
    return out;
  };
  const argmax = (h) => h.reduce((b, v, i) => (v > h[b] ? i : b), 0);
  const minOf = (h, a, b) => {
    let m0 = Infinity;
    for (let i = a; i <= b; i++) m0 = Math.min(m0, h[i]);
    return m0;
  };
  // Local maxima >= floor; neighbours merge unless the dip between them is >= prom below the lower one.
  function splitPeaks(h, prom = prominence, floor = -Infinity) {
    const out = [];
    for (const c of localMax(h)) {
      if (h[c] < floor) continue;
      const q = out[out.length - 1];
      if (out.length && minOf(h, q, c) > Math.min(h[q], h[c]) - prom) {
        if (h[c] > h[q]) out[out.length - 1] = c;
      } else out.push(c);
    }
    return out;
  }
  function run(h, i, level) {
    let a = i;
    let b = i;
    while (a > 0 && h[a - 1] >= level) a--;
    while (b < h.length - 1 && h[b + 1] >= level) b++;
    return [a, b];
  }
  function cross(ys, h, i, level, step) {
    let j = i;
    while (j + step >= 0 && j + step < h.length && h[j + step] >= level) j += step;
    const k = j + step;
    if (k >= 0 && k < h.length) {
      const f = (h[j] - level) / Math.max(h[j] - h[k], 1e-9);
      return ys[j] + f * (ys[k] - ys[j]);
    }
    return ys[j];
  }
  // Indicated length from a lateral profile (6.3.13.4): EL absolute below SL, -6 dB single peak, end -6 dB multiple peaks.
  function measureLength(ys, h, transverse = false) {
    const sh = transverse ? transPlus : 0;
    const EL = lines.EL - sh;
    const SL = lines.SL - sh;
    const i = argmax(h);
    const hmax = h[i];
    if (hmax < EL) return { length: null, method: 'none', peaks: [] };
    if (hmax < SL) return { length: cross(ys, h, i, EL, 1) - cross(ys, h, i, EL, -1), method: 'EL', peaks: [i] };
    const [a, b] = run(h, i, SL);
    const pk = splitPeaks(h.slice(a, b + 1), prominence, SL).map((q) => a + q);
    if (pk.length <= 1) return { length: cross(ys, h, i, hmax - 6, 1) - cross(ys, h, i, hmax - 6, -1), method: '-6dB', peaks: [i] };
    const pa = pk[0];
    const pb = pk[pk.length - 1];
    return { length: cross(ys, h, pb, h[pb] - 6, 1) - cross(ys, h, pa, h[pa] - 6, -1), method: 'end-6dB', peaks: pk };
  }
  function ripple(h, windowDb = 10) {
    const i = argmax(h);
    const [a, b] = run(h, i, h[i] - windowDb);
    const seg = h.slice(a, b + 1);
    const mx = localMax(seg);
    let r = 0;
    for (let k = 1; k < mx.length; k++) r = Math.max(r, Math.min(seg[mx[k - 1]], seg[mx[k]]) - minOf(seg, mx[k - 1], mx[k]));
    return r;
  }

  const gp = std.grading_pipeline;
  const limOf = (row) => (row.max_len_mm !== undefined ? row.max_len_mm : Math.max(row.max_len.min_mm, Math.min(row.max_len.max_mm, row.max_len.t_frac * t)));
  const gradeLimits = () => Object.fromEntries(['I', 'II'].map((lv) => [lv, Object.fromEntries(['I', 'II'].map((z) => [z, limOf(gp.rows.find((r) => r.level === lv && r.zone === z))]))]));
  function grade(zn, length, notAllowed) {
    if (notAllowed) return 'reject';
    if (zn === 'below' || length == null) return 'I';
    if (zn === 'III') return 'III';
    for (const lv of ['I', 'II']) if (length <= limOf(gp.rows.find((r) => r.level === lv && r.zone === zn)) + 1e-9) return lv;
    return 'III';
  }
  const interp = (x, xs, ys) => {
    if (x <= xs[0]) return ys[0];
    for (let i = 1; i < xs.length; i++) if (x <= xs[i]) return ys[i - 1] + ((x - xs[i - 1]) / (xs[i] - xs[i - 1])) * (ys[i] - ys[i - 1]);
    return ys[ys.length - 1];
  };
  const lateralYs = (meta) => arange(meta.y0 - 30, meta.y1 + 30.001, rules.scan.lateral_step_mm);

  // Reference evaluation of one defect: best side, maximum amplitude, zone, indicated length and grade.
  function evaluateDefect(el, meta) {
    const yc = (meta.y0 + meta.y1) / 2;
    const res = { id: meta.id, type: meta.type };
    const sides = {};
    for (const sd of [1, -1]) {
      const fa = foreAft(el, sd, yc);
      const q = fa[argmax(fa.map((r) => r.h))];
      sides[sd] = { d: q.d, h: q.h, S: q.S, leg: q.leg, fa };
    }
    const sd = sides[-1].h > sides[1].h ? -1 : 1;
    const best = sides[sd];
    Object.assign(res, { side: sd, d: best.d, h_long: best.h, S: best.S, leg: best.leg, h_other: sides[-sd].h, h_right: sides[1].h, h_left: sides[-1].h });
    if (meta.transverse) {
      const tb = transverseScan(el, yc, { hull: true });
      Object.assign(res, { h: tb.h, pose: tb.pose, S: tb.S, leg: tb.leg, zone: zone(tb.h, true), method: 'geometric', length: meta.len_true, scan: 'transverse' });
    } else {
      const sw = swivelScan(el, sd, best.d, yc);
      const ys = lateralYs(meta);
      const lat = lateral(el, sd, best.d, ys);
      const lh = lat.map((r) => r.h);
      const hmax = Math.max(best.h, Math.max(...lh));
      const ml = measureLength(ys, lh);
      const swh = sw.map((r) => r.h);
      const sg = sw.map((r) => r.g);
      const h10 = Math.max(interp(-10, sg, swh), interp(10, sg, swh));
      Object.assign(res, {
        h: hmax, zone: zone(hmax), length: ml.length, method: ml.method, peaks: ml.peaks.length, scan: 'longitudinal',
        swivel_drop_dB: Math.min(40, Math.max(...swh) - h10), lat_ripple_dB: ripple(lh), fa_ripple_dB: ripple(best.fa.map((r) => r.h)),
        lat: { ys, h: lh },
      });
    }
    res.depth_est = best.leg === 1 ? best.S * p.cb : 2 * t - best.S * p.cb;
    res.x_est = sd * (best.d - best.S * p.sb);
    res.grade = grade(res.zone, res.length, meta.not_allowed);
    return res;
  }

  const ORDER = { I: 1, II: 2, III: 3, reject: 3 };
  function plateVerdict(grades) {
    const worst = Math.max(1, ...grades.map((g) => ORDER[g]));
    const notAllowed = grades.includes('reject');
    return {
      level: ['I', 'II', 'III'][worst - 1],
      verdict: notAllowed || worst > ORDER[spec.acceptance_level] ? 'reject' : 'accept',
      not_allowed: notAllowed,
    };
  }
  function evaluateCase(defects, built = defects.map((d, i) => buildDefect(d, i))) {
    const out = built.map(({ el, meta }) => evaluateDefect(el, meta));
    return { indications: out, ...plateVerdict(out.map((r) => r.grade)) };
  }

  return {
    m, p, t, spec, dMin, dMax, P, sMax, lines, transPlus, fusionHw, grooveX, hDb, zone, scanGain,
    buildDefect, sidePose, dSteps, foreAft, lateral, swivelScan, coverageGrid, coverage, generateCase, demo,
    transPose, transXMin, transverseScan, splitPeaks, measureLength, ripple, grade, gradeLimits, lateralYs,
    evaluateDefect, plateVerdict, evaluateCase,
    kinds: { SPHERE, SDH, FACET },
  };
}
