// Weld technique card (contracts/angle_tasks.json): reference values from the weld standard pack, field checks and score.
// Thickness rows use (lo, hi] with the first row closed at lo; parity with tools/angle_b6_ref.py.
const PROBE = { K: 2.0, MHz: 5.0 };

export function rowOf(rows, t) {
  return rows.find((r, i) => {
    const [lo, hi] = r.t_mm;
    return (t > lo || (i === 0 && t >= lo)) && (hi == null || t <= hi);
  }) ?? null;
}

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const tanD = (d) => Math.tan((d * Math.PI) / 180);

export function createWeldCard(spec, stdPack) {
  const S = stdPack.items ?? stdPack;
  const fields = spec.card.fields;
  const byId = Object.fromEntries(fields.map((f) => [f.id, f]));
  const tol = spec.card.tolerance;

  const task = (id) => spec.tasks.find((t) => t.id === id) ?? null;

  function reference(tk) {
    const t = tk.t_mm;
    const ps = rowOf(S.probe_selection.rows, t);
    const bn = S.bottom_normal_angle.deg;
    const kLo = Math.max(ps.K[0], tanD(bn[0]));
    const kHi = Math.min(ps.K[1], tanD(bn[1]));
    const blk = rowOf(S.reference_block.rows, t);
    const lv = S.technique_levels.default;
    const nrow = rowOf(S.plate_butt_levels.rows.filter((r) => r.level === lv), t);
    const dac = rowOf(S.dac_sensitivity.rows, t);
    const work = spec.works[tk.work];
    const coef = 2 * S.probe_zone.once_reflected_P;
    const beside = S.detection_zone.beside_fusion_line_mm;
    const elPct = S.scan_sensitivity.el_min_percent_fsh;
    const trans = S.transverse_plus.plus_dB;
    return {
      K: [kLo, kHi], MHz: ps.MHz, beta: ps.beta_deg, Ktable: ps.K, bottom: bn, block: blk.id, block_t: blk.t_mm, level: lv, sides: nrow.sides,
      zone_coef: coef * t, P_coef: coef, beside, EL: dac.EL_dB, SL: dac.SL_dB, RL: dac.RL_dB, dac_ref: dac.ref,
      el_pct: elPct, trans, comp: tk.loss_dB, table: work.table, grading: work.grading, acceptance: tk.acceptance,
      card: {
        K: PROBE.K, MHz: PROBE.MHz, block: blk.id, level: lv, sides: nrow.sides[0], zone: Math.ceil(coef * t * PROBE.K),
        beside, EL: dac.EL_dB, SL: dac.SL_dB, RL: dac.RL_dB, el_pct: elPct, trans, comp: tk.loss_dB, table: work.table, acceptance: tk.acceptance,
      },
    };
  }

  function check(card, tk) {
    const r = reference(tk);
    const k = card.K;
    const ok = {
      K: isNum(k) && k >= r.K[0] - 1e-9 && k <= r.K[1] + 1e-9,
      MHz: isNum(card.MHz) && card.MHz >= r.MHz[0] && card.MHz <= r.MHz[1],
      block: card.block === r.block,
      level: card.level === r.level,
      sides: r.sides.includes(card.sides),
      zone: isNum(card.zone) && isNum(k) && k > 0 && card.zone >= r.zone_coef * k - tol.zone_mm,
      beside: isNum(card.beside) && card.beside >= r.beside,
      EL: card.EL === r.EL,
      SL: card.SL === r.SL,
      RL: card.RL === r.RL,
      el_pct: isNum(card.el_pct) && card.el_pct >= r.el_pct && card.el_pct <= 100,
      trans: card.trans === r.trans,
      comp: isNum(card.comp) && Math.abs(card.comp - r.comp) <= tol.comp_dB,
      table: card.table === r.table,
      acceptance: card.acceptance === r.acceptance,
    };
    const score = fields.reduce((a, f) => a + (ok[f.id] ? f.points : 0), 0);
    const groups = spec.card.groups.map((g) => {
      const fs = fields.filter((f) => f.group === g);
      return { group: g, points: fs.reduce((a, f) => a + (ok[f.id] ? f.points : 0), 0), max: fs.reduce((a, f) => a + f.points, 0), ok: fs.every((f) => ok[f.id]) };
    });
    return { ok, score, max: fields.reduce((a, f) => a + f.points, 0), groups };
  }

  // Raw input strings -> card values (numbers for number fields, '' kept as null).
  function parse(raw) {
    const out = {};
    for (const f of fields) {
      const v = raw[f.id];
      if (f.type === 'number') {
        const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').trim());
        out[f.id] = Number.isFinite(n) ? n : null;
      } else out[f.id] = v || null;
    }
    return out;
  }

  return { tasks: () => spec.tasks, task, fields: () => fields, field: (id) => byId[id], groups: () => spec.card.groups, reference, check, parse, works: spec.works, tolerance: tol };
}
