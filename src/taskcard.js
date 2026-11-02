// Procedure card engine (contracts/tasks.json card, docs/M10_SCOPE.md §4): field parsing, check against the standard
// for the plate thickness, reference values, kit, card score. Standard values are read from the standard pack only.

const rowOf = (rows, t) => rows.find((r) => t >= r.t_mm[0] && (r.t_mm[1] == null || t < r.t_mm[1])) || null;

export function createTaskcard({ tasks, standard, rules, manifest, specimens, thickness = null }) {
  const STD = standard.items;
  const files = { standard, waveform_rules: rules, model_manifest: manifest, specimens_manifest: specimens };
  // <file key>:<dot path>; "name[*]" maps the rest of the path over an array.
  const resolve = (path) => {
    const i = path.indexOf(':');
    let v = files[path.slice(0, i)];
    for (const seg of path.slice(i + 1).split('.')) {
      if (v == null) return undefined;
      const m = /^(.+)\[\*\]$/.exec(seg);
      if (m) v = v[m[1]];
      else v = Array.isArray(v) ? v.map((x) => x?.[seg]) : v[seg];
    }
    return v;
  };
  const FIELDS = tasks.card.fields;
  const tol = rules.practice.sensitivity_record.tolerance_dB;
  const OPTIONS = Object.fromEntries(FIELDS.filter((f) => f.input === 'select').map((f) => [f.id, (f.options || resolve(f.options_from) || []).map(String)]));

  const plateThickness = (row) => {
    const t = typeof row === 'string' ? task(row) : row;
    const e = t?.thickness && thickness?.library?.find((x) => x.id === t.thickness);
    return e ? e.thickness_mm : resolve(tasks.plate.thickness_from);
  };
  const list = () => tasks.tasks.list;
  const task = (id) => tasks.tasks.list.find((t) => t.id === id) || null;

  // Raw form values → card; numbers parsed, selects limited to their options. ok only when every field is set.
  function parse(raw) {
    const card = {};
    const missing = [];
    for (const f of FIELDS) {
      const v = raw?.[f.id];
      if (f.input === 'select') {
        const s = v == null ? '' : String(v);
        if (OPTIONS[f.id].includes(s)) card[f.id] = s;
        else missing.push(f.id);
      } else {
        const s = typeof v === 'number' ? v : String(v ?? '').trim().replace(',', '.');
        const n = s === '' ? NaN : Number(s);
        if (Number.isFinite(n)) card[f.id] = n;
        else missing.push(f.id);
      }
    }
    return { ok: missing.length === 0, card, missing };
  }

  // Reference values of every group for thickness t and the task level.
  function reference(t, level) {
    const ps = rowOf(STD.probe_selection.rows, t);
    const rb = rowOf(STD.reference_block.rows, t);
    const ez = rowOf(STD.scan_pattern.edge_zone, t);
    const md = STD.scan_pattern.middle;
    return {
      probe_type: ps ? (ps.probe === 'dual_or_single' ? ['dual', 'single'] : [ps.probe]) : [],
      frequency: ps ? ps.MHz : null,
      element: STD.probe_selection.element_mm.round_diameter,
      reference_block: rb ? String(rb.no) : null,
      edge_zone: ez ? ez.width_mm : null,
      scan_plan: { lines: md.line_spacing_max_mm, grid: md.grid_mm },
      scan_sensitivity: STD.scan_sensitivity.plus_dB,
      compensation: STD.compensation.default_dB,
      level,
    };
  }

  // Per group: right / wrong for thickness t and the task level.
  function check(card, t, level) {
    const R = reference(t, level);
    const c = card || {};
    const inRange = (v, r) => !!r && Number.isFinite(v) && v >= r[0] && v <= r[1];
    const near = (v, x) => Number.isFinite(v) && Math.abs(v - x) <= tol + 1e-9;
    const max = R.scan_plan[c.middle_pattern];
    const groups = {
      probe_type: R.probe_type.includes(c.probe_type),
      frequency: inRange(c.frequency_MHz, R.frequency),
      element: inRange(c.element_mm, R.element),
      reference_block: R.reference_block != null && String(c.reference_block) === R.reference_block,
      edge_zone: R.edge_zone != null && Number.isFinite(c.edge_zone_mm) && c.edge_zone_mm >= R.edge_zone,
      scan_plan: max != null && Number.isFinite(c.spacing_mm) && c.spacing_mm > 0 && c.spacing_mm <= max,
      scan_sensitivity: near(c.scan_plus_dB, R.scan_sensitivity),
      compensation: near(c.compensation_dB, R.compensation),
      level: c.level === level,
    };
    const fields = Object.fromEntries(FIELDS.map((f) => [f.id, groups[f.group]]));
    return { groups, fields, ok: Object.values(groups).every(Boolean), reference: R };
  }

  const kit = () => {
    const K = tasks.card.kit;
    const block = resolve(K.reference_block);
    return {
      probe_type: K.probe_type,
      frequency_MHz: resolve(K.frequency_MHz),
      element_mm: resolve(K.element_mm),
      reference_block: String(STD.reference_block.rows.find((r) => String(block).endsWith(`_${r.no}`))?.no ?? ''),
      reference_block_id: block,
    };
  };

  // Card part of the task rubric: a group scores its points when right.
  function score(card, t, level) {
    const r = check(card, t, level);
    const item = tasks.rubric.items.find((i) => i.id === 'card');
    const parts = item.parts.map((p) => ({ group: p.group, max: p.points, ok: r.groups[p.group], points: r.groups[p.group] ? p.points : 0 }));
    return { points: parts.reduce((s, p) => s + p.points, 0), max: item.points, parts };
  }

  return { fields: () => FIELDS, options: (id) => OPTIONS[id] || null, plateThickness, list, task, parse, reference, check, kit, score };
}
