// Session replay (docs/M8_SCOPE.md §7): reconstruct probe pose and instrument state at t_ms
// from initial + keyframes + inst deltas + frames. Trails are the frames up to t (coverage is their function).
export const SCHEMA = 'ut-session/1';
export const SPEEDS = [1, 4, 16];

const MARK = {
  'practice:calib_done': 'calib',
  'practice:dac_point': 'dac',
  'practice:flag': 'find',
  'practice:mark': 'find',
  'assembly:error': 'error',
  'practice:record_blocked': 'error',
  'session:submit': 'submit',
  'session:restore': 'restore',
};

const clone = (o) => JSON.parse(JSON.stringify(o || {}));
const xy = (p) => (p ? { x: p.x ?? p.x_mm ?? 0, y: p.y ?? p.y_mm ?? 0 } : { x: 0, y: 0 });

export function parseSession(input, meta = {}) {
  let doc;
  try { doc = typeof input === 'string' ? JSON.parse(input) : input; } catch { return { ok: false, error: 'bad_file' }; }
  if (!doc || typeof doc !== 'object' || doc.schema_version !== SCHEMA || !Array.isArray(doc.log)) {
    return { ok: false, error: 'bad_file' };
  }
  const version_match = ['build_id', 'knowledge_version', 'contracts_version']
    .every((k) => !meta[k] || doc[k] === meta[k]);
  return { ok: true, doc, version_match };
}

// Case plate at t: the last case:load up to t, else the header case of a random plate (random_seed set); null = fixed plates only
// (logs without case fields included).
export function caseAt(header, log, tMs = Infinity) {
  let c = header?.template_id && header.random_seed != null
    ? { case_id: header.case_id ?? null, template_id: header.template_id, seed: header.random_seed } : null;
  for (const e of log || []) {
    if (e.t_ms > tMs) break;
    if (e.kind === 'event' && e.name === 'case:load' && e.payload) c = { case_id: e.payload.case_id, template_id: e.payload.template_id, seed: e.payload.seed };
  }
  return c;
}

// caseSpecimen: specimen id of the case plate; its trail restarts at every case:load.
export function createReplay(doc, { caseSpecimen = null } = {}) {
  const log = doc.log || [];
  const initial = doc.initial || {};
  const duration = Math.max(0, doc.active_ms || 0, log.length ? log[log.length - 1].t_ms || 0 : 0);
  const markers = [];
  for (const e of log) {
    if (e.kind !== 'event') continue;
    const mark = MARK[e.name];
    if (mark) markers.push({ t_ms: e.t_ms, mark, name: e.name });
  }

  function seek(tMs) {
    const t = Math.max(0, Math.min(duration, tMs));
    let inst = clone(initial.inst);
    const probes = clone(initial.probe || {});
    let specimen = initial.specimen || null;
    let step = initial.step || null;
    let mode = initial.mode || 'practice';
    let lastKey = -1;
    for (let i = 0; i < log.length; i++) {
      const e = log[i];
      if (e.t_ms > t) break;
      if (e.kind === 'key') lastKey = i;
    }
    if (lastKey >= 0) {
      const st = log[lastKey].state || {};
      if (st.inst) inst = { ...inst, ...clone(st.inst) };
      if (st.specimen) specimen = st.specimen;
      if (st.probe && specimen) probes[specimen] = xy(st.probe);
      if (st.step) step = st.step;
      if (st.mode) mode = st.mode;
    }
    const trails = {};
    const start = lastKey + 1;
    for (let i = 0; i < log.length; i++) {
      const e = log[i];
      if (e.t_ms > t) break;
      if (e.kind === 'frame') {
        (trails[e.specimen_id] ||= []).push([e.x_mm, e.y_mm]);
        if (i < start) probes[e.specimen_id] = { x: e.x_mm, y: e.y_mm };
      } else if (caseSpecimen && e.kind === 'event' && e.name === 'case:load') delete trails[caseSpecimen];
    }
    for (let i = start; i < log.length; i++) {
      const e = log[i];
      if (e.t_ms > t) break;
      if (e.kind === 'inst' && e.delta) Object.assign(inst, e.delta);
      if (e.kind === 'frame') {
        specimen = e.specimen_id;
        probes[specimen] = { x: e.x_mm, y: e.y_mm };
      }
    }
    const p = specimen ? (probes[specimen] || xy(null)) : xy(null);
    inst.probe_x_mm = p.x;
    inst.probe_y_mm = p.y;
    if (specimen) inst.specimen_id = specimen;
    return { t_ms: t, specimen_id: specimen, x_mm: p.x, y_mm: p.y, inst, step, mode, trails, probes, case: caseAt(doc, log, t) };
  }

  return { duration, markers, seek, session_id: doc.session_id || null };
}
