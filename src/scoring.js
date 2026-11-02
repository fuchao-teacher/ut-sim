// Scoring engine (docs/M8_SCOPE.md §5): contracts/rubric.json applied to the final practice state and the event log of one
// exam session. Pure: same state, log and coverage give the same result (Node: webapp/tools/m83_score.mjs).
// Numbers come from the rubric refs; nothing here restates a tolerance or reference value.

const SEP = /:(.*)/s;

export function createScoring({ rubric, files }) {
  const TC = rubric.teacher_config;
  let CTX = null;
  const resolve = (ref, id) => {
    const [file, path] = ref.replace(/\{id\}/g, id ?? '').split(SEP);
    if (file === 'teacher_config') return path.split('.').reduce((o, k) => o?.[k], TC);
    if (file === 'case') return path.split('.').reduce((o, k) => o?.[k], CTX);
    return path.split('.').reduce((o, k) => o?.[k], files[file]);
  };
  const policy = (p) => p.split('.').slice(1).reduce((o, k) => o?.[k], TC);
  // Ref of a part whose last path segment is `key` (after {id} expansion).
  const pick = (part, key, id) => {
    const ref = (part.refs || []).find((r) => r.replace(/\{id\}/g, id ?? '').split(/[.:]/).pop() === key);
    return ref ? { ref: ref.replace(/\{id\}/g, id ?? ''), value: resolve(ref, id) } : { ref: null, value: undefined };
  };
  const scoped = (ref) => {
    const m = /^(.*)\[\*\]\.(\w+)$/.exec(ref);
    return m ? (resolve(m[1]) || []).map((o) => o[m[2]]) : resolve(ref);
  };
  const near = (a, b, tol) => a != null && b != null && Math.abs(a - b) <= tol + 1e-9;
  const curve = (v, c) => (v >= c.full_at - 1e-12 ? 1 : v <= c.zero_at ? 0 : (v - c.zero_at) / (c.full_at - c.zero_at));
  const itemDef = (id) => rubric.items.find((it) => it.id === id);
  const partDef = (item, id) => item.parts.find((p) => p.id === id);
  const part = (id, max, points, status, evidence = []) => ({ id, points, max, status: status ?? (points >= max - 1e-9 ? 'ok' : 'partial'), evidence });
  const missing = (id, max, evidence = []) => part(id, max, 0, 'missing', evidence);

  // Case context of the frozen P-02 (rubric scope.case_default); used when score() gets no case.
  function fixedCase() {
    const C = rubric.scope.case_default;
    const defects = scoped(C.defects);
    const judged = Object.fromEntries(Object.entries(resolve(C.judged)).filter(([d]) => defects.includes(d)));
    return {
      template_id: C.template_id, case_id: resolve(C.case_id), specimen_id: resolve(C.specimen_id), defects,
      reference_items: resolve(C.reference_items).map((r) => ({ id: r.id, determined: r.determined })), expected: resolve(C.expected), judged,
      area_applies: resolve(C.area_applies).filter((d) => defects.includes(d)),
      displays: Object.fromEntries(Object.keys(judged).map((d) => [d, { reference_mm: resolve(C.reference_mm, d), reference_eq_dB: resolve(C.reference_eq_dB, d) ?? null }])),
    };
  }
  const FIXED = fixedCase();
  let SPEC = {};
  let DEFECTS = [];
  // Per-display share: item points left after the fixed parts, split over n displays.
  const shareOf = (it, n) => (it.points - it.parts.reduce((s, p) => s + (typeof p.points === 'number' ? p.points : 0), 0)) / n;
  const tplId = (p, d) => p.id.replace('{id}', d);
  const determinedMap = () => Object.fromEntries((resolve('case:reference_items') || []).map((r) => [r.id, r.determined]));

  // Each rule returns { valid, parts } for its item; validity of the item itself, the chain is applied by score().
  const rules = {
    assembly(it, { count }) {
      const p = it.parts[0];
      const n = count('assembly:error');
      return { valid: count('assembly:done') > 0, parts: [part(p.id, p.points, Math.max(0, p.points - policy(p.policy) * n), null, [{ ref: 'event:assembly:error', value: n }])] };
    },
    calibrate(it, { prac, count }) {
      const pts = prac.calib?.points || {};
      const done = partDef(it, 'done');
      const prec = partDef(it, 'precise');
      const T = pick(done, 'targets_mm');
      const ui = pick(done, 'ui_tolerance_mm').value;
      const iv = pick(done, 'interval_tolerance_mm').value;
      const qa = pick(prec, 'qa_tolerance_mm').value;
      const keys = Object.keys(T.value);
      const have = keys.every((k) => pts[k] != null);
      const okUi = have && keys.every((k) => near(pts[k], T.value[k], ui));
      const [a, b] = keys;
      const okIv = have && near(pts[b] - pts[a], T.value[b] - T.value[a], iv);
      const okQa = have && keys.every((k) => near(pts[k], T.value[k], qa));
      const ev = { ref: T.ref, value: have ? { ...pts } : null, reference: T.value };
      return {
        valid: !!prac.done?.calibrate && count('practice:calib_done') > 0,
        parts: have
          ? [part(done.id, done.points, okUi && okIv ? done.points : 0, null, [{ ...ev, tolerance: ui }]), part(prec.id, prec.points, okUi && okIv && okQa ? prec.points : 0, null, [{ ...ev, tolerance: qa }])]
          : [missing(done.id, done.points), missing(prec.id, prec.points)],
      };
    },
    dac(it, { prac, count }) {
      const p = it.parts[0];
      const holes = pick(p, 'holes').value;
      const ref = pick(p, 'dac_G_dB');
      const tol = pick(p, 'peak_tolerance_dB').value;
      const pts = prac.dac?.points || [];
      return {
        valid: !!prac.done?.dac && count('practice:dac_done') > 0,
        parts: holes.map((h) => {
          const id = p.id.replace('{S}', String(h.S_mm));
          const g = ref.value[String(h.S_mm)];
          const r = pts.find((q) => q.id === h.id);
          if (!r) return missing(id, p.points);
          return part(id, p.points, near(r.G, g, tol) ? p.points : 0, null, [{ ref: ref.ref, value: r.G, reference: g, tolerance: tol }]);
        }),
      };
    },
    sensitivity(it, { prac }) {
      const bp = partDef(it, 'base');
      const sp = partDef(it, 'scan');
      const s = prac.sens;
      if (!s) return { valid: false, parts: [missing(bp.id, bp.points), missing(sp.id, sp.points)] };
      const G = pick(bp, 'G_base_dB');
      const tol = pick(bp, 'peak_tolerance_dB').value;
      const plus = pick(sp, 'plus_dB');
      const stol = pick(sp, 'tolerance_dB').value;
      return {
        valid: !!prac.done?.sensitivity,
        parts: [
          part(bp.id, bp.points, near(s.base, G.value, tol) ? bp.points : 0, null, [{ ref: G.ref, value: s.base, reference: G.value, tolerance: tol }]),
          part(sp.id, sp.points, near(s.scan - s.base, plus.value, stol) ? sp.points : 0, null, [{ ref: plus.ref, value: s.scan - s.base, reference: plus.value, tolerance: stol }]),
        ],
      };
    },
    scan(it, { prac, coverage }) {
      const id = SPEC.scan;
      const m = coverage?.[id];
      const trail = prac.plates?.[id]?.scan?.trail || [];
      return {
        valid: trail.length > 0 && !!m,
        parts: it.parts.map((p) => {
          if (!m) return missing(p.id, p.points);
          const v = m[p.id];
          const c = policy(p.policy);
          return part(p.id, p.points, p.points * curve(v, c), null, [{ ref: `metric:scan_path_coverage.${p.id}`, value: v, reference: { full_at: c.full_at, zero_at: c.zero_at } }]);
        }),
      };
    },
    detect(it, { prac }) {
      const p = partDef(it, 'found_{id}');
      const fp = partDef(it, 'false_call');
      // Only a student's deliberate record is evidence of detection. Automatic demonstration
      // entries and old records without this flag must not be inferred to be student confirmations.
      const found = (prac.plates?.[SPEC.scan]?.scan?.found || []).filter((f) => f.confirmed === true);
      const parts = DEFECTS.length
        ? DEFECTS.map((d) => {
          const f = found.find((x) => x.id === d);
          const share = shareOf(it, DEFECTS.length);
          return part(tplId(p, d), share, f ? share : 0, null, [{ ref: `state:prac.plates.${SPEC.scan}.scan.found`, value: f ? { confirmed: true, flags: f.flags || [] } : null }]);
        })
        : [part(tplId(p, 'none'), it.points, it.points, null, [{ ref: 'case:defects', value: [] }])];
      const det = determinedMap();
      const V = prac.eval?.verdicts || {};
      const calls = DEFECTS.filter((d) => found.some((f) => f.id === d) && det[d] === false && fp.calls.includes(V[d]));
      const got = parts.reduce((s, x) => s + x.points, 0);
      const deduction = Math.min(got, policy(fp.policy) * calls.length);
      parts.push(part(fp.id, 0, deduction > 0 ? -deduction : 0, null, [{ ref: 'state:prac.eval.verdicts', value: calls, reference: fp.calls }]));
      return { valid: true, parts };
    },
    quantify(it, { prac, res }) {
      const p = it.parts[0];
      const J = pick(p, 'judged');
      const ids = Object.keys(J.value || {}).filter((d) => DEFECTS.includes(d));
      if (!ids.length) return { valid: true, parts: [part(tplId(p, 'none'), it.points, it.points, null, [{ ref: J.ref, value: [] }])] };
      const judged = J.value;
      const share = shareOf(it, ids.length);
      const results = prac.plates?.[SPEC.scan]?.quant?.results || {};
      return {
        valid: true,
        parts: ids.map((d) => {
          const id = tplId(p, d);
          if (!res.found(d)) return part(id, share, 0, 'basis_invalid');
          const r = results[d];
          if (!r) return missing(id, share);
          const ref = pick(p, 'reference_mm', d);
          const eq = pick(p, 'reference_eq_dB', d);
          const ev = [];
          let pass = 0;
          for (const k of judged[d]) {
            let ok = false;
            if (k === 'length') {
              const tol = pick(p, 'indicated_length_mm').value;
              ok = near(r.length, ref.value.length, tol);
              ev.push({ ref: `${ref.ref}.length`, value: r.length, reference: ref.value.length, tolerance: tol });
            } else if (k === 'area') {
              const rel = pick(p, 'indicated_area_relative').value;
              const applies = pick(p, 'area_applies').value.includes(d);
              ok = applies && Math.abs(r.area - ref.value.area_mm2) / ref.value.area_mm2 <= rel + 1e-9;
              ev.push({ ref: `${ref.ref}.area_mm2`, value: r.area, reference: ref.value.area_mm2, tolerance: rel });
            } else if (k === 'equivalent') {
              const tol = pick(p, 'equivalent_dB').value;
              ok = near(r.eq, eq.value, tol);
              ev.push({ ref: eq.ref, value: r.eq, reference: eq.value, tolerance: tol });
            }
            if (ok) pass += 1;
          }
          return part(id, share, (share * pass) / judged[d].length, null, ev);
        }),
      };
    },
    evaluate(it, { prac, count, res }) {
      const E = prac.eval || {};
      const vp = partDef(it, 'verdict_{id}');
      const gp = partDef(it, 'plate_grade');
      const cp = partDef(it, 'conclusion');
      const X = pick(vp, 'expected');
      const det = determinedMap();
      const judged = resolve('case:judged') || {};
      const exp = E.level ? X.value[E.level] : null;
      const parts = DEFECTS.map((d) => {
        const id = tplId(vp, d);
        const share = shareOf(it, DEFECTS.length);
        if (!res.found(d) || (det[d] && judged[d] && !res.sized(d))) return part(id, share, 0, 'basis_invalid');
        if (!exp || !E.verdicts?.[d]) return missing(id, share);
        return part(id, share, E.verdicts[d] === exp[d] ? share : 0, null, [{ ref: `${X.ref}.${E.level}.${d}`, value: E.verdicts[d], reference: exp[d] }]);
      });
      if (!DEFECTS.length) {
        const share = shareOf(it, 1);
        parts.push(exp ? part(tplId(vp, 'none'), share, share, null, [{ ref: 'case:defects', value: [] }]) : missing(tplId(vp, 'none'), share));
      }
      parts.push(E.plate
        ? part(gp.id, gp.points, E.plate === X.value.plate_grade ? gp.points : 0, null, [{ ref: `${X.ref}.plate_grade`, value: E.plate, reference: X.value.plate_grade }])
        : missing(gp.id, gp.points));
      const concl = exp ? (exp.pass ? 'accept' : 'reject') : null;
      parts.push(E.conclusion && exp
        ? part(cp.id, cp.points, E.conclusion === concl ? cp.points : 0, null, [{ ref: `${X.ref}.${E.level}.pass`, value: E.conclusion, reference: concl }])
        : missing(cp.id, cp.points));
      return { valid: count('practice:evaluate') > 0 && !!E.level, parts };
    },
    conduct(it, { events }) {
      const p = it.parts[0];
      const n = conductCounts(events);
      const total = Object.values(n).reduce((s, v) => s + v, 0);
      return { valid: true, parts: [part(p.id, p.points, Math.max(0, p.points - policy(p.policy) * total), null, Object.entries(n).map(([k, v]) => ({ ref: `conduct:${k}`, value: v })))] };
    },
  };

  // rubric conduct_events: calibration voided (velocity / zero change while calibrated), records blocked by reject or saturation.
  function conductCounts(events) {
    const n = { calibration_voided: 0, record_blocked_reject: 0, record_blocked_saturated: 0 };
    let calibrated = false;
    for (const e of events) {
      if (e.name === 'practice:calib_done') calibrated = true;
      else if ((e.name === 'instrument:velocity' || e.name === 'instrument:zero') && calibrated) { n.calibration_voided += 1; calibrated = false; }
      else if (e.name === 'practice:record_blocked' && e.payload?.reason === 'reject_not_zero') n.record_blocked_reject += 1;
      else if (e.name === 'practice:record_blocked' && e.payload?.reason === 'saturated') n.record_blocked_saturated += 1;
    }
    return n;
  }

  const r1 = (x) => Math.round(x * 10) / 10;

  // prac: serialised S.prac of the exam; events: [{name, payload}] of the session log; coverage: {specimen_id: scan_path_coverage metrics};
  // case: case context (keys of rubric scope.case_default, values of the plate), none = fixed P-02.
  function score({ prac, events, coverage, case: kase }) {
    CTX = kase || FIXED;
    SPEC = Object.fromEntries(Object.entries(rubric.scope.specimens).map(([k, r]) => [k, resolve(r)]));
    DEFECTS = scoped(rubric.scope.defects) || [];
    const count = (name) => events.filter((e) => e.name === name).length;
    const out = {};
    const fid = (d) => tplId(partDef(itemDef('detect'), 'found_{id}'), d);
    const sid = (d) => tplId(itemDef('quantify').parts[0], d);
    const res = {
      found: (d) => out.detect?.parts.find((p) => p.id === fid(d))?.points > 0 && out.detect.valid,
      sized: (d) => { const q = out.quantify?.parts.find((p) => p.id === sid(d)); return !!q && q.status !== 'missing' && q.status !== 'basis_invalid'; },
    };
    const factor = TC.basis_invalid_factor;
    for (const id of rubric.chain.concat(rubric.items.map((it) => it.id).filter((x) => !rubric.chain.includes(x)))) {
      const it = itemDef(id);
      const r = rules[id](it, { prac, events, coverage, count, res });
      const reqOk = (it.requires || []).every((q) => out[q]?.valid);
      const raw = r.parts.reduce((s, p) => s + p.points, 0);
      let status;
      let points;
      if (!reqOk) { status = 'basis_invalid'; points = raw * factor; }
      else if (!r.valid) { status = 'missing'; points = 0; }
      else { points = raw; status = raw >= it.points - 1e-9 ? 'ok' : 'partial'; }
      out[id] = { id, points: r1(points), max: it.points, status, valid: reqOk && r.valid, parts: r.parts.map((p) => ({ ...p, points: Math.round(p.points * 100) / 100, max: Math.round(p.max * 100) / 100 })) };
    }
    const items = rubric.items.map((it) => out[it.id]);
    const ev = events.filter((e) => e.name === 'practice:evaluate').pop();
    return {
      rubric_version: rubric.rubric_version,
      case_id: CTX.case_id,
      template_id: CTX.template_id,
      total: r1(items.reduce((s, it) => s + it.points, 0)),
      max: rubric.max_total,
      items,
      // Overall correctness also includes missed indications; it is not the same as
      // applying the rules consistently to the quantities the student actually recorded.
      self_consistent: typeof ev?.payload?.self_consistent === 'boolean' ? ev.payload.self_consistent : null,
    };
  }

  return { score, conductCounts, fixedCase: () => JSON.parse(JSON.stringify(FIXED)) };
}
