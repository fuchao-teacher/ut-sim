// scan_path_coverage (docs/M8_SCOPE.md §4): 2D probe-path coverage of a plate test surface, from the scan trail.
// Not a sound-field measure. Comparisons use squared distances only, so tools/qa_m8_rules.py reproduces every cell.

// Parameters of plate `id` from the contracts (waveform_rules, standard pack, specimens manifest, model manifest).
export function coverageParams({ rules, standard, specimens, manifest }, id) {
  const cfg = rules.practice.scan_path_coverage;
  const std = standard.items;
  const sp = specimens.specimens[id] || specimens.runtime_specimens?.[id];
  const d = sp.dims;
  const T = (d.thickness || d.thickness_T).value;
  const zone = std.scan_pattern.edge_zone.find((z) => T >= z.t_mm[0] && (z.t_mm[1] == null || T < z.t_mm[1]));
  return {
    L: d.length.value,
    W: (d.width || d.width_b).value,
    cell: rules.practice.scan.flag_cell_mm,
    rHousing: specimens.probe_limits.housing_outer_diameter_mm / 2,
    rFoot: manifest.parameters.active_element_diameter.value * (1 - std.scan_coverage.overlap_min_ratio) / 2,
    edge: zone.width_mm,
    middleR: std.scan_pattern.middle.line_spacing_max_mm / 2,
    maxSeg: cfg.max_segment_mm,
    dirSin: Math.sin(cfg.direction_tolerance_deg * Math.PI / 180),
  };
}

// Zones: 0 outside the reachable surface, 1 edge zone, 2 middle zone.
export function createCoverage(p) {
  const { L, W, cell, rHousing, rFoot, edge, middleR, maxSeg, dirSin } = p;
  const nx = Math.round(L / cell);
  const ny = Math.round(W / cell);
  const lx = L / 2 - rHousing;
  const ly = W / 2 - rHousing;
  const cx = (i) => -L / 2 + (i + 0.5) * cell;
  const cy = (j) => -W / 2 + (j + 0.5) * cell;
  const inMiddle = (x, y) => Math.abs(x) <= L / 2 - edge && Math.abs(y) <= W / 2 - edge;
  const zone = new Uint8Array(nx * ny);
  const tot = { edge: 0, middle: 0 };
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const x = cx(i);
      const y = cy(j);
      const dx = Math.max(Math.abs(x) - lx, 0);
      const dy = Math.max(Math.abs(y) - ly, 0);
      if (dx * dx + dy * dy > rFoot * rFoot) continue;
      const z = inMiddle(x, y) ? 2 : 1;
      zone[j * nx + i] = z;
      if (z === 1) tot.edge += 1;
      else tot.middle += 1;
    }
  }
  const swept = new Uint8Array(nx * ny);
  const near = new Uint8Array(nx * ny);
  let hit = { edge: 0, middle: 0, swept: 0 };
  let dir = { len: 0, perp: 0 };
  let src = null;
  let n = 0;

  function reset() {
    swept.fill(0);
    near.fill(0);
    hit = { edge: 0, middle: 0, swept: 0 };
    dir = { len: 0, perp: 0 };
    src = null;
    n = 0;
  }

  // Cells whose centre lies within r of segment (ax, ay)-(bx, by); mark(k) for each.
  function fill(ax, ay, bx, by, r, mark) {
    const vx = bx - ax;
    const vy = by - ay;
    const vv = vx * vx + vy * vy;
    const i0 = Math.max(0, Math.floor((Math.min(ax, bx) - r + L / 2) / cell));
    const i1 = Math.min(nx - 1, Math.floor((Math.max(ax, bx) + r + L / 2) / cell));
    const j0 = Math.max(0, Math.floor((Math.min(ay, by) - r + W / 2) / cell));
    const j1 = Math.min(ny - 1, Math.floor((Math.max(ay, by) + r + W / 2) / cell));
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const k = j * nx + i;
        if (!zone[k]) continue;
        const px = cx(i) - ax;
        const py = cy(j) - ay;
        let t = vv > 0 ? (px * vx + py * vy) / vv : 0;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const ex = px - t * vx;
        const ey = py - t * vy;
        if (ex * ex + ey * ey <= r * r) mark(k);
      }
    }
  }

  const markSwept = (k) => {
    if (swept[k]) return;
    swept[k] = 1;
    hit.swept += 1;
    if (zone[k] === 1) hit.edge += 1;
  };
  const markNear = (k) => {
    if (zone[k] !== 2 || near[k]) return;
    near[k] = 1;
    hit.middle += 1;
  };

  function segment(ax, ay, bx, by) {
    fill(ax, ay, bx, by, rFoot, markSwept);
    fill(ax, ay, bx, by, middleR, markNear);
  }

  // Processes new trail points; a different trail array or a shorter one (cleared) is recomputed from the start.
  // Segments longer than maxSeg are jumps: only their end point is filled.
  function add(trail) {
    if (trail !== src || trail.length < n) {
      reset();
      src = trail;
    }
    for (; n < trail.length; n++) {
      const [bx, by] = trail[n];
      if (n === 0) { segment(bx, by, bx, by); continue; }
      const [ax, ay] = trail[n - 1];
      const vx = bx - ax;
      const vy = by - ay;
      const vv = vx * vx + vy * vy;
      if (vv > maxSeg * maxSeg) { segment(bx, by, bx, by); continue; }
      segment(ax, ay, bx, by);
      if (vv > 0 && inMiddle((ax + bx) / 2, (ay + by) / 2)) {
        const len = Math.sqrt(vv);
        dir.len += len;
        if (Math.abs(vx) <= dirSin * len) dir.perp += len;
      }
    }
    return api;
  }

  function metrics() {
    const all = tot.edge + tot.middle;
    return {
      edge: tot.edge ? hit.edge / tot.edge : 0,
      middle: tot.middle ? hit.middle / tot.middle : 0,
      whole: all ? hit.swept / all : 0,
      cells: { edge: [hit.edge, tot.edge], middle: [hit.middle, tot.middle], whole: [hit.swept, all] },
      direction_ratio: dir.len > 0 ? dir.perp / dir.len : null,
      r_f_mm: rFoot,
      middle_r_mm: middleR,
      cell_mm: cell,
      edge_mm: edge,
    };
  }

  // Cell state for display: 0 none, 1 middle cell within the line spacing, 2 swept.
  const state = (k) => (swept[k] ? 2 : near[k] ? 1 : 0);

  const api = { nx, ny, cell, L, W, edge, zone, swept, near, add, reset, metrics, state };
  return api;
}
