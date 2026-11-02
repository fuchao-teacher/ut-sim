// Plate thicknesses (contracts/thickness.json): runtime reference blocks CBII-1 / CBII-3, their DAC from the waveform
// engine, the plate profiles of the 30 / 80 mm case plates and their case generators (createCaselib with a profile).
// createCaselib is passed in by main.js, the only module wired to the case library (m90 K2).
export function createThickness({ doc, cases, rules, standard, specimens, makeWave, scenario, createCaselib }) {
  const STD = standard.items;
  const files = { waveform_rules: rules, standard, specimens_manifest: specimens, cases };
  const resolve = (path) => {
    let v = files[path.slice(0, path.indexOf(':'))];
    for (const seg of path.slice(path.indexOf(':') + 1).split('.')) {
      if (v == null) return undefined;
      v = v[seg];
    }
    return v;
  };
  const clone = (v) => JSON.parse(JSON.stringify(v));
  const r2 = (x) => Math.round(x * 100) / 100;
  const BR = doc.block_rule;
  const base = resolve(BR.inherits_from);
  const rowOf = (no) => STD.reference_block.rows.find((r) => String(r.no) === String(no));
  const inRow = (t, r) => t >= r.t_mm[0] && (r.t_mm[1] == null || t < r.t_mm[1]);

  function buildBlock(b) {
    const row = rowOf(b.row_no);
    const n = row.S_mm.length;
    const sp = {};
    for (const k of BR.inherits) if (base[k] !== undefined) sp[k] = clone(base[k]);
    sp.code = b.code;
    sp.material_from = BR.material_from;
    sp.dims = { thickness_T: { value: row.T_mm }, width_b: { value: row.b_mm }, length: { value: b.length_mm } };
    sp.holes = row.S_mm.map((S, i) => ({
      id: `H${S}`, type: 'flat_bottom_hole', diameter_mm: STD.reference_block.phi_mm, S_mm: S,
      x_mm: (i - (n - 1) / 2) * b.hole_pitch_mm, y_mm: 0, drilled_from: 'bottom',
    }));
    sp.probe_start = { x_mm: sp.holes[0].x_mm, y_mm: 0 };
    return sp;
  }

  const blocks = Object.fromEntries(doc.blocks.map((b) => [b.specimen_id, buildBlock(b)]));
  const work = { ...specimens, runtime_specimens: { ...specimens.runtime_specimens, ...blocks } };
  const wave = makeWave(work);
  const CAL = rules.practice.calibration.calibrated_state;
  const H80 = rules.auto_gain.target_percent;
  const G0 = rules.amplitude.gain.G_ref_dB;
  const state = {
    ...Object.fromEntries(Object.entries(rules.controls).map(([k, v]) => [k, v.default])),
    scene: scenario.id, ...scenario.defaults,
    velocity_m_s: CAL.velocity_m_s, zero_us: CAL.zero_us, reject_percent: 0, defects: [], gain_dB: G0,
  };

  // dac_rule.points: probe centred on each hole, gain for the hole echo at the auto-gain target.
  function dacOf(id) {
    const sp = blocks[id] || specimens.specimens[id];
    const T = (sp.dims.thickness_T || sp.dims.thickness).value;
    return sp.holes.map((h) => {
      const e = wave.echoes({ ...state, specimen_id: id, thickness_mm: T, range_mm: 2 * T + 10, probe_x_mm: h.x_mm, probe_y_mm: h.y_mm })
        .find((x) => x.type === 'defect' && x.id === h.id);
      return { S: h.S_mm, G: r2(G0 + 20 * Math.log10(H80 / e.pct)) };
    }).sort((a, b) => a.S - b.S);
  }

  const gapMm = Math.ceil((CAL.velocity_m_s * wave.pulseUs(state.damping)) / 2 / 1000);

  const plateOf = (t) => doc.plates.find((p) => p.thickness_mm === t) || null;
  function profile(t) {
    const p = plateOf(t);
    if (!p) return null;
    const dac = dacOf(p.block);
    const S = dac.map((x) => x.S);
    const no = doc.blocks.find((b) => b.specimen_id === p.block).row_no;
    return {
      thickness_mm: t, tag: p.tag, block: p.block, block_no: no, dac, G_base_dB: dac[dac.length - 1].G,
      depth_mm: [Math.min(...S), Math.min(Math.max(...S), t - gapMm)], back_wall_gap_mm: gapMm,
      row_ok: inRow(t, rowOf(no)) && STD.probe_selection.rows.some((r) => inRow(t, r)),
    };
  }

  const libs = {};
  const caseGen = (t) => {
    const pf = profile(t);
    return pf ? (libs[t] ||= createCaselib({ cases, rules, standard, specimens, makeWave, scenario, profile: pf })) : null;
  };

  function libraryCase(id) {
    const e = doc.library?.find((x) => x.id === id);
    const cs = e && caseGen(e.thickness_mm)?.generate(e.template, e.seed);
    return cs && !cs.failed ? { ...cs, library_id: id, thickness_mm: e.thickness_mm } : null;
  }

  return {
    blocks: () => blocks, block: (id) => blocks[id] || null, dacOf, profile, caseGen,
    library: () => doc.library || [], libraryCase, entry: (id) => doc.library?.find((x) => x.id === id) || null,
    thicknesses: () => [...doc.thicknesses_mm], placement: resolve(BR.placement_from), wave,
  };
}
