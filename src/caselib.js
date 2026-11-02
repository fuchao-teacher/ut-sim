// Case library (contracts/cases.json): seeded plates and their reference answers from the practice rules and procedure.js.
import { createProcedure } from './procedure.js';

// Boundary search reach of the reference contour used for the frozen P-02 values (webapp/tools/p02_design.mjs).
const REACH_MM = 60;
const STEP_MM = 0.05;

export function mulberry32(a) {
  let s = a >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function fnv1a32(text) {
  let h = 0x811c9dc5;
  for (const b of new TextEncoder().encode(String(text))) h = Math.imul(h ^ b, 0x01000193) >>> 0;
  return h >>> 0;
}

const seedSpace = (cases) => 2 ** cases.prng.seed_bits;

function toBase(alpha, n, len = 0) {
  let s = '';
  do { s = alpha[n % alpha.length] + s; n = Math.floor(n / alpha.length); } while (n > 0);
  return s.padStart(len, alpha[0]);
}

const checkChar = (alpha, payload) => alpha[[...payload].reduce((a, c, i) => a + (i + 1) * alpha.indexOf(c), 0) % alpha.length];

// Library code seed: bit k set = the k-th case of cases.library.cases (id order).
const libOk = (cases, mask) => mask > 0 && mask < 2 ** (cases.library?.cases.length || 0);

export function encodeCaseCode(cases, templateId, codeSeed) {
  const C = cases.case_code;
  const idx = templateId === cases.library?.id ? cases.library.index : cases.templates.find((x) => x.id === templateId).index;
  const payload = toBase(C.alphabet, idx * seedSpace(cases) + (codeSeed % seedSpace(cases)), C.payload_chars);
  return payload + checkChar(C.alphabet, payload);
}

export const libraryMask = (cases, ids) => cases.library.cases.reduce((m, c, k) => (ids.includes(c.id) ? m + 2 ** k : m), 0);
export const libraryIds = (cases, mask) => cases.library.cases.filter((c, k) => Math.floor(mask / 2 ** k) % 2 === 1).map((c) => c.id);

export function decodeCaseCode(cases, text) {
  const C = cases.case_code;
  const s = String(text || '').toUpperCase().replace(/[\s-]/g, '');
  if (s.length !== C.payload_chars + C.check_chars || [...s].some((c) => !C.alphabet.includes(c))) return { ok: false };
  const payload = s.slice(0, C.payload_chars);
  if (checkChar(C.alphabet, payload) !== s.slice(C.payload_chars)) return { ok: false };
  const n = [...payload].reduce((a, c) => a * C.alphabet.length + C.alphabet.indexOf(c), 0);
  const idx = Math.floor(n / seedSpace(cases));
  const seed = n % seedSpace(cases);
  if (cases.library && idx === cases.library.index) return libOk(cases, seed) ? { ok: true, template_id: cases.library.id, code_seed: seed, code: s } : { ok: false };
  const t = cases.templates.find((x) => x.index === idx);
  if (!t) return { ok: false };
  return { ok: true, template_id: t.id, code_seed: seed, code: s };
}

export const studentSeed = (cases, codeSeed, studentNo) => fnv1a32(`${codeSeed}:${String(studentNo ?? '').trim()}`) % seedSpace(cases);

const getPath = (o, p) => p.split('.').reduce((v, k) => (v == null ? undefined : v[k]), o);
function setPath(o, p, v) {
  const ks = p.split('.');
  let t = o;
  for (const k of ks.slice(0, -1)) t = t[k] ??= {};
  t[ks[ks.length - 1]] = v;
}
const clone = (v) => JSON.parse(JSON.stringify(v));
const r1 = (x) => Math.round(x * 10) / 10;
const r2 = (x) => Math.round(x * 100) / 100;
const lerp = (rnd, [a, b]) => a + (b - a) * rnd();
const pickInt = (rnd, [a, b]) => a + Math.min(b - a, Math.floor(rnd() * (b - a + 1)));
const snap = (v, q) => Math.round(v / q) * q;
const rectGap = (a, b) => Math.hypot(Math.max(0, b.x0 - a.x1, a.x0 - b.x1), Math.max(0, b.y0 - a.y1, a.y0 - b.y1));

function sampleIntervals(rnd, ivs) {
  const total = ivs.reduce((s, [a, b]) => s + (b - a), 0);
  if (!(total > 0)) return null;
  let u = rnd() * total;
  for (const [a, b] of ivs) { if (u <= b - a) return a + u; u -= b - a; }
  return ivs[ivs.length - 1][1];
}
function cutIntervals(ivs, lo, hi) {
  const out = [];
  for (const [a, b] of ivs) {
    if (hi <= a || lo >= b) { out.push([a, b]); continue; }
    if (lo > a) out.push([a, lo]);
    if (hi < b) out.push([hi, b]);
  }
  return out;
}

// profile (thickness.js, contracts/thickness.json): { thickness_mm, tag, dac [{S, G}], depth_mm [min, max] } for the
// non-50 mm plates; null = the sealed M9 case library.
export function createCaselib({ cases, rules, standard, specimens, makeWave, scenario, profile = null }) {
  const P = rules.practice;
  const AV = P.acceptance_values;
  const STD = standard.items;
  const GS = STD.grading;
  const M = cases.margins;
  const resolve = (path) => {
    let v = { waveform_rules: rules, standard, specimens_manifest: specimens }[path.slice(0, path.indexOf(':'))];
    for (const seg of path.slice(path.indexOf(':') + 1).split('.')) {
      if (v == null) return undefined;
      const m = /^(.+)\[\*\]$/.exec(seg);
      if (m) { v = v[m[1]]; continue; }
      v = Array.isArray(v) ? v.map((x) => x?.[seg]) : v[seg];
    }
    return v;
  };
  const CASE_ID = cases.plate.specimen_id;
  const basePlate = resolve(cases.plate.from);
  const exemplars = Object.fromEntries(basePlate.defects.map((d) => [d.id, d]));
  const tpls = Object.fromEntries(cases.templates.map((t) => [t.id, t]));
  const types = cases.types;
  const PREFIX = { lamination: 'LAM', inclusion: 'INC', pore: 'POR', cluster: 'CLU', segregation: 'SEG' };

  const work = { ...specimens, runtime_specimens: { ...specimens.runtime_specimens } };
  const wave = makeWave(work);
  const pr = createProcedure({ rules, wave, specimens: work, standard });
  const pts = profile ? profile.dac.map((p) => ({ S: p.S, G: p.G })) : Object.keys(AV.dac_G_dB).map(Number).sort((a, b) => a - b).map((S) => ({ S, G: AV.dac_G_dB[String(S)] }));
  const GB = pr.gBase(pts);
  const depths = profile ? profile.depth_mm : resolve(cases.limits.depth_from).map(Number);
  const D_MIN = Math.min(...depths);
  const D_MAX = Math.max(...depths);
  const HOUSING_R = specimens.probe_limits.housing_outer_diameter_mm / 2;
  const CM = M.criteria_dB;
  const FLOOR = resolve(M.mark_from);
  const EQ_TOL = resolve(M.grading_D_from);
  const S_REL = resolve(M.grading_S_from);
  const B1_LIMIT = STD.defect_criteria.b1_limit_percent;
  const LOBE = 2 * wave.mainLobeR(D_MAX);
  const dLevels = GS.levels.filter((lv) => GS.single_element_uses_D && GS.table[lv].max_D_dB != null);
  const CAL = P.calibration.calibrated_state;

  const limitsOf = (plate) => ({ x: plate.dims.length.value / 2 - HOUSING_R, y: plate.dims.width.value / 2 - HOUSING_R });

  function withPlate(sid, plate, fn) {
    const had = Object.prototype.hasOwnProperty.call(work.runtime_specimens, sid);
    const prev = work.runtime_specimens[sid];
    work.runtime_specimens[sid] = plate;
    try { return fn(); } finally { if (had) work.runtime_specimens[sid] = prev; else delete work.runtime_specimens[sid]; }
  }

  function probeOn(sid, plate) {
    const base = {
      ...Object.fromEntries(Object.entries(rules.controls).map(([k, v]) => [k, v.default])),
      scene: scenario.id, ...scenario.defaults,
      range_mm: 100, velocity_m_s: CAL.velocity_m_s, zero_us: CAL.zero_us, reject_percent: 0,
      thickness_mm: plate.dims.thickness.value, defects: [], specimen_id: sid,
    };
    const st = (x, y, g = GB) => ({ ...base, gain_dB: g, probe_x_mm: x, probe_y_mm: y });
    const crit = (x, y) => pr.criteria(st(x, y), pts, GB);
    const f1s = (x, y) => {
      const out = [];
      for (const e of wave.echoes(st(x, y))) {
        if (e.type !== 'defect' || e.k !== 1) continue;
        const d = pr.f1MinusDac(pts, e.x_mm, e.pct, GB);
        if (d != null) out.push({ id: e.id, member: e.member, dB: d });
      }
      return out;
    };
    const f1Of = (x, y, pred) => f1s(x, y).filter(pred).reduce((v, e) => Math.max(v ?? -Infinity, e.dB), null);
    const edge = (cx, cy, ux, uy, on) => {
      let lo = 0;
      let hi = REACH_MM;
      while (hi - lo > STEP_MM) { const m = (lo + hi) / 2; if (on(cx + ux * m, cy + uy * m)) lo = m; else hi = m; }
      return (lo + hi) / 2;
    };
    const rectAt = (cx, cy, on) => {
      const xp = edge(cx, cy, 1, 0, on);
      const xm = edge(cx, cy, -1, 0, on);
      const yp = edge(cx, cy, 0, 1, on);
      const ym = edge(cx, cy, 0, -1, on);
      const open = [xp, xm, yp, ym].some((v) => v > REACH_MM - 2 * STEP_MM);
      const r = { x0: cx - xm, x1: cx + xp, y0: cy - ym, y1: cy + yp, lx: xp + xm, ly: yp + ym };
      return { ...r, length: Math.max(r.lx, r.ly), area: r.lx * r.ly, open };
    };
    return { crit, f1s, f1Of, rectAt };
  }

  function judgedFor(d, plateIsFixed) {
    if (plateIsFixed) return P.tolerance.judged[d.id] || null;
    const src = types[d.type]?.judged_from;
    return src ? P.tolerance.judged[src] : null;
  }

  // Reference answer of a plate: criteria, reference rectangles, equivalents, verdict matrix.
  function referenceOn(sid, plate, plateIsFixed) {
    return withPlate(sid, plate, () => {
      const { crit, f1s, f1Of, rectAt } = probeOn(sid, plate);
      const items = [];
      const rects = {};
      const peaks = {};
      const equivalents = {};
      const judged = {};
      for (const d of plate.defects) {
        const own = (e) => e.id === d.id;
        if (d.type === 'segregation') {
          const R = d.region_mm;
          let f1 = -Infinity;
          let flagged = 0;
          let b1 = Infinity;
          for (let x = R.x[0]; x <= R.x[1]; x += 2) {
            for (let y = R.y[0] - 6; y <= R.y[1] + 6; y += 2) {
              const f = f1Of(x, y, own);
              if (f != null) f1 = Math.max(f1, f);
              const c = crit(x, y);
              if (c.flags.length && (c.defect === d.id || c.defect == null)) flagged++;
              b1 = Math.min(b1, c.b1);
            }
          }
          peaks[d.id] = { f1_dB: r2(f1), b1_pct: r2(b1), flagged_cells: flagged };
          items.push({ id: d.id, determined: flagged > 0, S_mm2: null, D_dB: null, flags: [] });
          continue;
        }
        if (d.type === 'cluster') {
          const mem = d.members.map((m, i) => {
            const on = (x, y) => (f1Of(x, y, (e) => own(e) && e.member === i) ?? -99) > 0;
            const r = rectAt(m.x_mm, m.y_mm, on);
            const c = crit(m.x_mm, m.y_mm);
            return { r, f1: f1Of(m.x_mm, m.y_mm, (e) => own(e) && e.member === i), c };
          });
          const flags = [...new Set(mem.flatMap((x) => x.c.flags))];
          const mg = pr.merge(mem.map((x) => x.r));
          const D = Math.max(...mem.map((x) => x.f1));
          const S = mem.reduce((s, x) => s + x.r.area, 0);
          const determined = flags.length > 0;
          rects[d.id] = {
            x0: Math.min(...mem.map((x) => x.r.x0)), x1: Math.max(...mem.map((x) => x.r.x1)),
            y0: Math.min(...mem.map((x) => x.r.y0)), y1: Math.max(...mem.map((x) => x.r.y1)),
            length: r1(mg.length), area_mm2: r1(S), member_area_mm2: mem.map((x) => r2(x.r.area)), merged: mg.merged,
            open: mem.some((x) => x.r.open),
          };
          peaks[d.id] = { f1_dB: r2(D), b1_pct: r2(Math.min(...mem.map((x) => x.c.b1))), own_peak: mem.every((x) => x.c.defect === d.id) };
          equivalents[d.id] = r2(D);
          const it = { id: d.id, determined, S_mm2: determined ? r1(S) : null, D_dB: null, flags };
          if (determined && pr.needsD(it)) it.D_dB = r2(D);
          items.push(it);
          if (determined) judged[d.id] = judgedFor(d, plateIsFixed);
          continue;
        }
        const [cx, cy] = d.centre_mm;
        const c = crit(cx, cy);
        const determined = c.flags.length > 0;
        const top = f1s(cx, cy).sort((a, b) => b.dB - a.dB)[0];
        const D = c.f1 && c.f1.id === d.id ? c.f1.dB : f1Of(cx, cy, own);
        peaks[d.id] = { f1_dB: r2(D), b1_pct: r2(c.b1), own_peak: determined ? c.defect === d.id : top?.id === d.id };
        const it = { id: d.id, determined, S_mm2: null, D_dB: null, flags: c.flags };
        if (determined) {
          const r = rectAt(cx, cy, (x, y) => { const k = crit(x, y); return k.flags.length > 0 && k.defect === d.id; });
          rects[d.id] = { x0: r.x0, x1: r.x1, y0: r.y0, y1: r.y1, x: r2(r.lx), y: r2(r.ly), length: r2(r.length), area_mm2: r1(r.area), open: r.open };
          it.S_mm2 = r1(r.area);
          if (pr.needsD(it)) it.D_dB = r2(D);
          if (d.type !== 'lamination') equivalents[d.id] = r2(D);
          judged[d.id] = judgedFor(d, plateIsFixed);
        }
        items.push(it);
      }
      const expected = Object.fromEntries(GS.levels.map((lv) => {
        const g = pr.grade(lv, items);
        return [lv, { ...g.verdicts, pass: g.pass }];
      }));
      expected.plate_grade = pr.plateGrade(items);
      return { items, rects, peaks, equivalents, judged, expected };
    });
  }

  function footprint(d, ref) {
    if (ref.rects[d.id]) return ref.rects[d.id];
    if (d.type === 'segregation') return { x0: d.region_mm.x[0], x1: d.region_mm.x[1], y0: d.region_mm.y[0], y1: d.region_mm.y[1] };
    const [cx, cy] = d.centre_mm;
    return { x0: cx - LOBE / 2, x1: cx + LOBE / 2, y0: cy - LOBE / 2, y1: cy + LOBE / 2 };
  }
  const lengthOf = (f) => Math.max(f.x1 - f.x0, f.y1 - f.y0);

  // Limits and margins of contracts/cases.json; returns the list of violations.
  function violations(plate, ref, want) {
    const out = [];
    const L = limitsOf(plate);
    const inside = (f) => f.x0 >= -L.x && f.x1 <= L.x && f.y0 >= -L.y && f.y1 <= L.y;
    const b1dB = (b) => 20 * Math.log10(b / B1_LIMIT);
    for (const d of plate.defects) {
      const it = ref.items.find((x) => x.id === d.id);
      const pk = ref.peaks[d.id];
      const w = want[d.id];
      if (w !== undefined && it.determined !== w) out.push(`${d.id} side`);
      if (it.determined) {
        if (!(Math.abs(pk.f1_dB) >= CM)) out.push(`${d.id} F1`);
        if (!(Math.abs(b1dB(pk.b1_pct)) >= CM)) out.push(`${d.id} B1`);
        if (!pk.own_peak) out.push(`${d.id} peak`);
        const r = ref.rects[d.id];
        if (!r) { out.push(`${d.id} rect`); continue; }
        if (r.open) out.push(`${d.id} open`);
        if (!inside(r)) out.push(`${d.id} limits`);
        if (d.type === 'cluster' && !r.merged) out.push(`${d.id} merge`);
        for (const lv of GS.levels) {
          const T = GS.table[lv];
          const useD = dLevels.includes(lv) && !(GS.b1_defects_use_S && it.flags.includes('B1_below_50'));
          const v = useD ? it.D_dB : it.S_mm2;
          for (const b of useD ? [T.count_D_dB[0], T.max_D_dB] : [T.count_S_mm2[0], T.max_S_mm2]) {
            if (useD ? Math.abs(v - b) < EQ_TOL : v > b / (1 + S_REL) && v < b / (1 - S_REL)) out.push(`${d.id} ${lv}`);
          }
        }
      } else {
        if (!(pk.f1_dB <= -CM && pk.f1_dB >= FLOOR + CM)) out.push(`${d.id} F1`);
        if (!(b1dB(pk.b1_pct) >= CM)) out.push(`${d.id} B1`);
        if (d.type !== 'segregation' && !pk.own_peak) out.push(`${d.id} peak`);
      }
      const [cx, cy] = d.centre_mm;
      if (Math.abs(cx) > L.x || Math.abs(cy) > L.y) out.push(`${d.id} centre`);
    }
    for (let i = 0; i < plate.defects.length; i++) {
      for (let j = i + 1; j < plate.defects.length; j++) {
        const a = footprint(plate.defects[i], ref);
        const b = footprint(plate.defects[j], ref);
        if (rectGap(a, b) < Math.max(Math.min(lengthOf(a), lengthOf(b)), LOBE)) out.push(`${plate.defects[i].id}~${plate.defects[j].id} gap`);
      }
    }
    return out;
  }

  const sideOf = (k) => types[k].criteria_side;
  const typesFor = (t, det) => t.pool.filter((k) => (det ? ['determined', 'either'] : ['not_determined', 'either']).includes(sideOf(k)));

  function fromExemplar(type) {
    const T = types[type];
    const ex = exemplars[T.exemplar_id];
    const d = { type };
    for (const p of T.inherits) setPath(d, p, clone(getPath(ex, p)));
    return d;
  }

  function dIntervals(det) {
    if (!det) return [[FLOOR + CM, -CM]];
    let ivs = [[CM, 1e3]];
    for (const lv of dLevels) for (const b of [GS.table[lv].count_D_dB[0], GS.table[lv].max_D_dB]) ivs = cutIntervals(ivs, b - EQ_TOL, b + EQ_TOL);
    return ivs;
  }

  // Equivalent of a point display at plus_dB = 0 at its own position; F1 - DAC is linear in plus_dB.
  function pointD0(plate, d) {
    const probe = { ...d, equivalent: { ...d.equivalent, plus_dB: 0 } };
    const p = { ...plate, defects: [probe] };
    return withPlate(CASE_ID, p, () => probeOn(CASE_ID, p).f1Of(d.centre_mm[0], d.centre_mm[1], (e) => e.id === d.id));
  }

  // Reference area of a lamination is close to (x - 1)(y - 1) mm (LAM_02: 50 x 30 -> 49.0 x 29.0); widened bands keep the area margin after snapping.
  function lamAreaIntervals(sy, [xa, xb]) {
    let ivs = [[(xa - 1) * (sy - 1), (xb - 1) * (sy - 1)]];
    for (const lv of GS.levels) {
      for (const b of [GS.table[lv].count_S_mm2[0], GS.table[lv].max_S_mm2]) ivs = cutIntervals(ivs, (b / (1 + S_REL)) * 0.95, (b / (1 - S_REL)) * 1.05);
    }
    return ivs;
  }

  const PLACE_TRIES = 25;

  function drawDisplay(rnd, type, det, id, plate, L, segSeed, placed) {
    const T = types[type];
    const d = { id, ...fromExemplar(type) };
    const clear = (box) => placed.every((b) => rectGap(box, b) >= Math.max(Math.min(lengthOf(box), lengthOf(b)), LOBE));
    const place = (mx, my, hx, hy) => {
      for (let i = 0; i < PLACE_TRIES; i++) {
        const c = [snap(lerp(rnd, [-L.x + mx, L.x - mx]), 1), snap(lerp(rnd, [-L.y + my, L.y - my]), 1)];
        const box = { x0: c[0] - hx, x1: c[0] + hx, y0: c[1] - hy, y1: c[1] + hy };
        if (clear(box)) { placed.push(box); return c; }
      }
      return null;
    };
    if (type === 'lamination') {
      const sy = snap(lerp(rnd, T.size_y_range), 1);
      const S = sampleIntervals(rnd, lamAreaIntervals(sy, T.size_x_range));
      if (S == null) return null;
      const sx = snap(S / (sy - 1) + 1, 1);
      d.centre_mm = place(sx / 2 + 10, sy / 2 + 10, sx / 2 + 1, sy / 2 + 1);
      if (!d.centre_mm) return null;
      d.depth_mm = snap(lerp(rnd, [D_MIN, D_MAX]), 0.5);
      d.size_mm = { x: sx, y: sy };
      return d;
    }
    if (type === 'inclusion' || type === 'pore') {
      const h = det ? Math.max(6, LOBE / 2) : LOBE / 2;
      d.centre_mm = place(15, 15, h, h);
      if (!d.centre_mm) return null;
      d.depth_mm = snap(lerp(rnd, [D_MIN, D_MAX]), 0.5);
      if (type === 'inclusion') d.size_mm = { ...d.size_mm, x: snap(lerp(rnd, T.size_x_range), 0.5), y: snap(lerp(rnd, T.size_y_range), 0.5) };
      d.equivalent = { ...d.equivalent, plus_dB: 0 };
      const d0 = pointD0(plate, d);
      if (d0 == null) return null;
      const [pa, pb] = T.plus_dB_range;
      const ivs = dIntervals(det).map(([a, b]) => [Math.max(a - d0, pa), Math.min(b - d0, pb)]).filter(([a, b]) => b > a);
      const plus = sampleIntervals(rnd, ivs);
      if (plus == null) return null;
      d.equivalent.plus_dB = snap(plus, 0.1);
      return d;
    }
    if (type === 'cluster') {
      const n = pickInt(rnd, T.members);
      const s = lerp(rnd, T.member_spacing_range);
      const R = s / (2 * Math.sin(Math.PI / n));
      const c = place(R + 15, R + 15, R + 5, R + 5);
      if (!c) return null;
      const th = rnd() * 2 * Math.PI;
      const spread = lerp(rnd, T.member_depth_spread_range);
      const z0 = lerp(rnd, [D_MIN, D_MAX - spread]);
      d.centre_mm = c;
      d.members = Array.from({ length: n }, (_, i) => ({
        x_mm: snap(c[0] + R * Math.cos(th + (2 * Math.PI * i) / n), 0.5),
        y_mm: snap(c[1] + R * Math.sin(th + (2 * Math.PI * i) / n), 0.5),
        depth_mm: snap(z0 + spread * rnd(), 0.5),
        plus_dB: snap(lerp(rnd, T.member_plus_dB_range), 0.1),
      }));
      return d;
    }
    const len = snap(lerp(rnd, T.length_x_range), 1);
    const hw = snap(lerp(rnd, T.half_width_y_range), 1);
    const c = place(len / 2, hw, len / 2, hw);
    if (!c) return null;
    const ex = exemplars[T.exemplar_id];
    const band = ex.depth_range_mm[1] - ex.depth_range_mm[0];
    const z0 = snap(lerp(rnd, [D_MIN, D_MAX - band]), 0.5);
    d.centre_mm = c;
    d.region_mm = { x: [c[0] - len / 2, c[0] + len / 2], y: [c[1] - hw, c[1] + hw] };
    d.depth_range_mm = [z0, z0 + band];
    d.seed = segSeed;
    return d;
  }

  const seed31 = (seed) => toBase(cases.case_code.alphabet, seed);

  function plateShell(defects, seed, templateId) {
    const p = {};
    for (const k of cases.plate.inherits) if (basePlate[k] !== undefined) p[k] = clone(basePlate[k]);
    if (profile) p.dims.thickness = { ...p.dims.thickness, value: profile.thickness_mm };
    const tag = profile ? profile.tag : 'R';
    p.code = `${tag}-${seed31(seed)}`;
    p.defect_set_id = `${tag}-${templateId}-${seed31(seed)}`;
    p.role = basePlate.role;
    p.indication_count_shown = cases.plate.indication_count_shown;
    p.defects = defects;
    return p;
  }

  function attempt(t, seed, k) {
    const rnd = mulberry32((seed * 64 + k) >>> 0);
    rnd();
    const nd = pickInt(rnd, t.determined);
    const nn = pickInt(rnd, t.not_determined);
    const plate = plateShell([], seed, t.id);
    const L = limitsOf(plate);
    const want = {};
    let n = 0;
    let seg = false;
    const placed = [];
    for (let i = 0; i < nd + nn; i++) {
      const det = i < nd;
      const pool = typesFor(t, det).filter((x) => !(x === 'segregation' && seg));
      if (!pool.length) return null;
      const type = pool[Math.min(pool.length - 1, Math.floor(rnd() * pool.length))];
      if (type === 'segregation') seg = true;
      const d = drawDisplay(rnd, type, det, `${PREFIX[type]}_R${++n}`, plate, L, 1 + Math.floor(rnd() * 1e6), placed);
      if (!d) return null;
      plate.defects.push(d);
      want[d.id] = det;
    }
    const ref = referenceOn(CASE_ID, plate, false);
    const bad = violations(plate, ref, want);
    return bad.length ? { bad } : { plate, ref };
  }

  function generate(templateId, seed) {
    const t0 = tpls[templateId];
    if (!t0 || (profile && t0.fixed)) return null;
    if (t0.fixed) return fixedCase(t0);
    const s = (seed >>> 0) % seedSpace(cases);
    const u = mulberry32((s * 64) >>> 0)();
    const t = t0.clean_ratio > 0 && u < t0.clean_ratio ? tpls.clean : t0;
    const rejects = [];
    for (let k = 0; k < cases.prng.max_attempts; k++) {
      const a = attempt(t, s, k);
      if (!a) { rejects.push('draw'); continue; }
      if (a.bad) { rejects.push(a.bad[0]); continue; }
      return {
        case_id: a.plate.defect_set_id, template_id: t.id, requested_template: t0.id, seed: s, attempt: k,
        specimen_id: CASE_ID, defect_set_id: a.plate.defect_set_id, plate: a.plate, reference: a.ref, disturbances: [],
      };
    }
    return { failed: true, template_id: t.id, seed: s, rejects };
  }

  function fixedCase(t) {
    const plate = resolve(t.defects_from) && specimens.runtime_specimens[t.specimen_id];
    return {
      case_id: t.defect_set_id, template_id: t.id, requested_template: t.id, seed: 0, attempt: 0,
      specimen_id: t.specimen_id, defect_set_id: t.defect_set_id, plate, reference: referenceOn(t.specimen_id, plate, true), disturbances: [],
    };
  }

  function fromCode(text, studentNo) {
    const c = decodeCaseCode(cases, text);
    if (!c.ok || profile) return { ok: false };
    if (c.template_id === cases.library?.id) {
      const ids = libraryIds(cases, c.code_seed);
      const id = ids.length === 1 ? ids[0] : ids[studentSeed(cases, c.code_seed, studentNo) % ids.length];
      return { ok: true, code: c.code, ...libraryCase(id) };
    }
    const t = tpls[c.template_id];
    const seed = t.per_student ? studentSeed(cases, c.code_seed, studentNo) : c.code_seed;
    return { ok: true, code: c.code, ...generate(t.id, seed) };
  }

  // Library case `id`: the plate of its template + seed, tagged with library_id.
  function libraryCase(id) {
    const e = !profile && cases.library?.cases.find((x) => x.id === id);
    const cs = e && generate(e.template, e.seed);
    return cs && !cs.failed ? { ...cs, library_id: id } : null;
  }
  const libraryOf = (cs) => cases.library?.cases.find((x) => x.template === cs?.template_id && x.seed === cs?.seed)?.id ?? null;

  // Scoring engine case context (contracts/rubric.json scope.case) from the reference answer of the plate.
  function scoringContext(cs) {
    const ref = cs.reference;
    const fixed = !!tpls[cs.template_id]?.fixed;
    const judged = Object.fromEntries(Object.entries(ref.judged).filter(([, v]) => v));
    const applies = P.tolerance.indicated_area_applies_to;
    const typeOf = (id) => cs.plate.defects.find((d) => d.id === id).type;
    return {
      template_id: cs.template_id, case_id: cs.case_id, specimen_id: cs.specimen_id,
      defects: cs.plate.defects.map((d) => d.id),
      reference_items: ref.items.map((r) => ({ id: r.id, determined: r.determined })),
      expected: ref.expected,
      judged,
      area_applies: Object.keys(judged).filter((id) => applies.includes(fixed ? id : types[typeOf(id)]?.judged_from)),
      displays: Object.fromEntries(Object.keys(judged).map((id) => [id, {
        reference_mm: { length: ref.rects[id].length, area_mm2: ref.rects[id].area_mm2 },
        reference_eq_dB: ref.equivalents[id] ?? null,
      }])),
    };
  }

  return {
    generate, fromCode, scoringContext, violations: (cs) => violations(cs.plate, cs.reference, {}),
    encode: (templateId, codeSeed) => encodeCaseCode(cases, templateId, codeSeed),
    decode: (text) => decodeCaseCode(cases, text),
    library: () => cases.library?.cases || [], libraryCase, libraryOf,
    encodeLibrary: (ids) => encodeCaseCode(cases, cases.library.id, libraryMask(cases, ids)),
    libraryIds: (mask) => libraryIds(cases, mask),
    reference: (cs) => referenceOn(cs.specimen_id, cs.plate, cs.template_id === 'fixed_p02'),
    limits: limitsOf(basePlate), lobe_mm: LOBE, depth_mm: [D_MIN, D_MAX], dac: pts, G_base_dB: GB,
    thickness_mm: profile ? profile.thickness_mm : basePlate.dims.thickness.value,
  };
}
