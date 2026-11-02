// Practice procedure (waveform_rules.practice): calibration / DAC / sensitivity record checks, DAC interpolation,
// F1 - DAC, criteria at base sensitivity and rectangle sizing. Pure functions of the practice state and the waveform
// engine; tools/check_webapp.mjs W26 checks them against waveform_rules.practice.acceptance_values.

export function createProcedure({ rules, wave, specimens, standard }) {
  const P = rules.practice;
  const STD = standard.items;
  const H80 = rules.auto_gain.target_percent;
  const CLIP = rules.display.clip_percent;
  const B1_LIMIT = STD.defect_criteria.b1_limit_percent;
  const SCAN_PLUS = STD.scan_sensitivity.plus_dB;
  const lg = (x) => 20 * Math.log10(x);
  const r1 = (x) => Math.round(x * 10) / 10;
  const r2 = (x) => Math.round(x * 100) / 100;
  const sorted = (pts) => [...pts].sort((a, b) => a.S - b.S);

  // dB-domain piecewise linear G_DAC(S); null outside [S_min, S_max] (no extrapolation).
  function gDac(pts, S) {
    const p = sorted(pts);
    if (p.length < 2 || S < p[0].S - 1e-9 || S > p[p.length - 1].S + 1e-9) return null;
    for (let i = 0; i < p.length - 1; i++) {
      const a = p[i];
      const b = p[i + 1];
      if (S <= b.S + 1e-9) return a.G + ((b.G - a.G) * (S - a.S)) / (b.S - a.S);
    }
    return null;
  }

  const hDac = (pts, S, G) => {
    const g = gDac(pts, S);
    return g == null ? null : H80 * 10 ** ((G - g) / 20);
  };

  const f1MinusDac = (pts, S, pct, G) => {
    const h = hDac(pts, S, G);
    return h == null || !(pct > 0) ? null : lg(pct / h);
  };

  // base_sensitivity.gain_convention = deepest_point_80
  const gBase = (pts) => (pts.length ? sorted(pts)[pts.length - 1].G : null);

  function curve(pts, G, step = P.dac.record.curve_step_mm) {
    const p = sorted(pts);
    if (p.length < 2) return null;
    const out = [];
    const S1 = p[p.length - 1].S;
    for (let S = p[0].S; S < S1; S += step) out.push([S, hDac(pts, S, G)]);
    out.push([S1, hDac(pts, S1, G)]);
    return out;
  }

  // Criteria at G_base on the true echo components (independent of the display gain and range).
  function criteria(st, pts, G) {
    const list = wave.echoes({ ...st, gain_dB: G, range_mm: Math.max(st.range_mm, 2 * (st.thickness_mm || 0) + 10) });
    const b1 = list.find((e) => e.type === 'back_wall' && e.k === 1);
    const f1s = list.filter((e) => e.type === 'defect' && e.k === 1 && e.pct > 0);
    let f1 = null;
    for (const e of f1s) {
      const d = f1MinusDac(pts, e.x_mm, e.pct, G);
      if (d != null && (!f1 || d > f1.dB)) f1 = { id: e.id, S: e.x_mm, dB: d };
    }
    const b1Pct = b1 ? b1.pct : null;
    const flags = [];
    if (f1 && f1.dB > 0) flags.push('F1_over_dac');
    if (b1Pct != null && b1Pct < B1_LIMIT) flags.push('B1_below_50');
    const shadow = f1s.filter((e) => e.coverage > 0).sort((a, b) => b.coverage - a.coverage)[0];
    const defect = flags.includes('F1_over_dac') ? f1.id : flags.includes('B1_below_50') && shadow ? shadow.id : null;
    return { f1, b1: b1Pct, flags, defect };
  }

  function calibRecord(st, gr) {
    const C = P.calibration;
    if (st.specimen_id !== C.specimen) return { msg: 'use_specimen' };
    if ((st.reject_percent || 0) > 0) return { msg: 'reject_not_zero' };
    const e = gr && gr.echo;
    if (!e) return { msg: 'no_echo' };
    if (e.pct > CLIP) return { msg: 'saturated' };
    if (!(e.id in C.targets_mm)) return { msg: 'echo_mismatch' };
    return { ok: true, id: e.id, reading: r2(e.x_mm) };
  }

  const calibPointsOk = (points) => Object.entries(P.calibration.targets_mm)
    .every(([k, v]) => points[k] != null && Math.abs(points[k] - v) <= P.calibration.ui_tolerance_mm + 1e-9);
  const calibIntervalOk = (points) => {
    const T = P.calibration.targets_mm;
    return points.B1 != null && points.B2 != null
      && Math.abs(points.B2 - points.B1 - (T.B2 - T.B1)) <= P.calibration.interval_tolerance_mm + 1e-9;
  };
  const calibDone = (points) => calibPointsOk(points) && calibIntervalOk(points);

  function dacRecord(st, gr, calibrated) {
    const D = P.dac;
    const R = D.record;
    if (!calibrated) return { msg: 'not_calibrated' };
    if (st.specimen_id !== D.specimen) return { msg: 'use_specimen' };
    if ((st.reject_percent || 0) > 0) return { msg: 'reject_not_zero' };
    const e = gr && gr.echo;
    if (!e) return { msg: 'no_echo' };
    const hole = (specimens.specimens[st.specimen_id].holes || []).find((h) => h.id === e.id);
    if (!hole) return { msg: 'echo_mismatch' };
    if (e.pct > CLIP) return { msg: 'saturated' };
    if (e.pct < R.height_window_percent[0] || e.pct > R.height_window_percent[1]) return { msg: 'not_80' };
    const r = Math.hypot((st.probe_x_mm ?? 0) - hole.x_mm, (st.probe_y_mm ?? 0) - hole.y_mm);
    if (-lg(wave.gLat(r, hole.S_mm) ** 2) > R.peak_tolerance_dB) return { msg: 'not_peak' };
    return { ok: true, point: { id: hole.id, S: r1(e.x_mm), G: r2(st.gain_dB + lg(H80 / e.pct)) } };
  }

  function sensRecord(pts, G, plus = SCAN_PLUS) {
    const base = gBase(pts);
    if (base == null) return { msg: 'locked' };
    if (Math.abs(G - (base + plus)) > P.sensitivity_record.tolerance_dB + 1e-9) return { msg: 'gain_not_set' };
    return { ok: true, base, scan: G };
  }

  function eqRecord(st, gr, pts, target) {
    const e = gr && gr.echo;
    if (!e) return { msg: 'no_echo' };
    if (e.type !== 'defect' || e.k !== 1 || (target && e.id !== target)) return { msg: 'echo_mismatch' };
    if (e.pct > CLIP) return { msg: 'saturated' };
    const d = f1MinusDac(pts, e.x_mm, e.pct, st.gain_dB);
    if (d == null) return { msg: 'echo_mismatch' };
    return { ok: true, dB: r2(d), S: r1(e.x_mm) };
  }

  function rect(pts) {
    if (pts.length < 2) return null;
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    const x0 = Math.min(...xs);
    const x1 = Math.max(...xs);
    const y0 = Math.min(...ys);
    const y1 = Math.max(...ys);
    return { x0, x1, y0, y1, length: Math.max(x1 - x0, y1 - y0), area: (x1 - x0) * (y1 - y0) };
  }

  function judge(id, res) {
    const T = P.tolerance;
    const AV = P.acceptance_values;
    const ref = AV[`${id}_reference_mm`];
    const out = {};
    for (const k of T.judged[id] || []) {
      if (k === 'length') out.length = Math.abs(res.length - ref.length) <= T.indicated_length_mm;
      if (k === 'area') out.area = Math.abs(res.area - ref.area_mm2) / ref.area_mm2 <= T.indicated_area_relative;
      if (k === 'equivalent') out.equivalent = res.eq != null && Math.abs(res.eq - AV[`${id}_equivalent_dB`]) <= T.equivalent_dB;
    }
    return out;
  }

  // Gap between two rectangles {x0, x1, y0, y1} (0 when they touch or overlap).
  const rectGap = (a, b) => Math.hypot(Math.max(0, b.x0 - a.x1, a.x0 - b.x1), Math.max(0, b.y0 - a.y1, a.y0 - b.y1));

  // Merge rule on member rectangles: merged when every rectangle lies within the smaller indicated length of a neighbour.
  function merge(rects) {
    if (!rects.length) return null;
    const merged = rects.length < 2 || rects.every((a, i) => rects.some((b, j) => j !== i && rectGap(a, b) < Math.min(a.length, b.length)));
    const all = { x0: Math.min(...rects.map((r) => r.x0)), x1: Math.max(...rects.map((r) => r.x1)), y0: Math.min(...rects.map((r) => r.y0)), y1: Math.max(...rects.map((r) => r.y1)) };
    return { merged, blocks: rects.length, area: rects.reduce((s, r) => s + r.area, 0), length: Math.max(all.x1 - all.x0, all.y1 - all.y0) };
  }

  // standard items.grading + waveform_rules.practice.grading: items [{ id, determined, flags, S_mm2, D_dB }] at one level.
  const GS = STD.grading;
  const useD = (L, it) => GS.single_element_uses_D && L.max_D_dB != null && !(GS.b1_defects_use_S && (it.flags || []).includes('B1_below_50'));
  function grade(level, items, areaM2 = P.grading.plate_area_m2) {
    const L = GS.table[level];
    const verdict = (it) => {
      if (!it.determined) return 'none';
      const d = useD(L, it);
      const v = d ? it.D_dB : it.S_mm2;
      if (v == null) return null;
      const lo = d ? L.count_D_dB[0] : L.count_S_mm2[0];
      const hi = d ? L.max_D_dB : L.max_S_mm2;
      return v > hi + 1e-9 ? 'exceed' : v > lo + 1e-9 ? 'counted' : 'not_counted';
    };
    const verdicts = Object.fromEntries(items.map((it) => [it.id, verdict(it)]));
    const vs = Object.values(verdicts);
    const counted = vs.filter((v) => v === 'counted').length;
    const maxCount = (L.max_count_per_m2 * areaM2) / GS.count_area_m2;
    return { verdicts, counted, maxCount, pass: !vs.includes('exceed') && !vs.includes(null) && counted <= maxCount + 1e-9 };
  }
  const plateGrade = (items, areaM2 = P.grading.plate_area_m2) => GS.levels.find((lv) => grade(lv, items, areaM2).pass) || GS.fail_level;
  const needsD = (it) => GS.levels.some((lv) => useD(GS.table[lv], it));
  const usesD = (level, it) => !!GS.table[level] && useD(GS.table[level], it);

  return { gDac, hDac, f1MinusDac, gBase, curve, criteria, calibRecord, calibDone, calibIntervalOk, dacRecord, sensRecord, eqRecord, rect, judge, merge, grade, plateGrade, needsD, usesD };
}
