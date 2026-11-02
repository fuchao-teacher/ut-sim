// Process log and local session store (docs/M8_SCOPE.md §3): header, event log, probe / instrument frames,
// keyframes; one live session per mode (train | exam), saved to localStorage and restored after a reload.
const SCHEMA = 'ut-session/1';
// V5.1 never resumes or clears either earlier version's local records.
const KEY_PREFIX = 'ut.m11.session.';
const FRAME_MM = 1;
const FRAME_MS = 100;
const KEYFRAME_MS = 10000;
const SAVE_MS = 1000;

const newId = () => (globalThis.crypto?.randomUUID ? crypto.randomUUID()
  : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);

function safeStorage() {
  try {
    const s = globalThis.localStorage;
    const k = `${KEY_PREFIX}probe`;
    s.setItem(k, '1');
    s.removeItem(k);
    return s;
  } catch {
    return null;
  }
}

// Flat instrument values only (numbers / strings / booleans); arrays and objects are scene data, not settings.
function flatInst(st) {
  const out = {};
  for (const [k, v] of Object.entries(st || {})) if (v === null || ['number', 'string', 'boolean'].includes(typeof v)) out[k] = v;
  return out;
}

function createSession(mode, header, log = [], activeMs = 0, perf) {
  let t0 = perf();
  let base = activeMs;
  let lastFrame = null;
  let lastInst = null;
  let lastKey = -Infinity;
  const s = {
    mode,
    header,
    log,
    dirty: false,
    get locked() { return !!header.submitted_at; },
    activeMs: () => (s.locked ? header.active_ms : Math.round(base + (perf() - t0))),
    push(entry) {
      log.push({ t_ms: s.activeMs(), ...entry });
      s.dirty = true;
    },
    event(name, payload) {
      if (s.locked && name !== 'session:export') return false;
      s.push({ kind: 'event', name, payload: JSON.parse(JSON.stringify(payload ?? {})) });
      return true;
    },
    // Probe frame when the position changed and moved >= FRAME_MM or FRAME_MS passed since the last frame.
    frame(specimenId, x, y) {
      if (s.locked) return false;
      const t = s.activeMs();
      const f = lastFrame;
      if (f && f.specimen_id === specimenId) {
        const d = Math.hypot(x - f.x_mm, y - f.y_mm);
        if (d < 0.05 || (d < FRAME_MM && t - f.t < FRAME_MS)) return false;
      }
      lastFrame = { specimen_id: specimenId, x_mm: x, y_mm: y, t };
      s.push({ kind: 'frame', specimen_id: specimenId, x_mm: x, y_mm: y });
      return true;
    },
    inst(st) {
      if (s.locked) return false;
      const cur = flatInst(st);
      if (!lastInst) { lastInst = cur; return false; }
      const delta = {};
      for (const [k, v] of Object.entries(cur)) if (lastInst[k] !== v) delta[k] = v;
      lastInst = cur;
      if (!Object.keys(delta).length) return false;
      s.push({ kind: 'inst', delta });
      return true;
    },
    keyframe(stateFn) {
      if (s.locked) return false;
      const t = s.activeMs();
      if (t - lastKey < KEYFRAME_MS) return false;
      lastKey = t;
      const state = stateFn();
      lastInst = flatInst(state.inst);
      s.push({ kind: 'key', state });
      return true;
    },
    submit(at) {
      if (s.locked) return false;
      header.active_ms = s.activeMs();
      header.submitted_at = at;
      s.dirty = true;
      return true;
    },
    toJSON(snapshot) {
      return { ...header, active_ms: s.activeMs(), log, snapshot };
    },
  };
  return s;
}

export function createSessionStore({ meta, stateOf, clock = () => Date.now(), perf = () => performance.now() }) {
  const storage = safeStorage();
  const live = {};
  const timers = {};

  function save(mode) {
    clearTimeout(timers[mode]);
    timers[mode] = 0;
    const s = live[mode];
    if (!s || !storage) return false;
    try {
      storage.setItem(KEY_PREFIX + mode, JSON.stringify({ header: { ...s.header, active_ms: s.activeMs() }, log: s.log, state: stateOf(mode), saved_at: clock() }));
      s.dirty = false;
      return true;
    } catch {
      return false;
    }
  }

  return {
    get available() { return !!storage; },
    get(mode) { return live[mode] || null; },
    load(mode) {
      if (!storage) return null;
      try {
        const o = JSON.parse(storage.getItem(KEY_PREFIX + mode) || 'null');
        const versionsMatch = ['build_id', 'knowledge_version', 'contracts_version']
          .every((k) => !meta[k] || o?.header?.[k] === meta[k]);
        return o && o.header?.schema_version === SCHEMA && o.header.mode === mode && versionsMatch ? o : null;
      } catch {
        return null;
      }
    },
    // kase: {case_id, template_id, case_code, random_seed} of the session plate (random_seed only for a generated plate).
    begin(mode, { student = null, initial, specimens, probe, kase = null }) {
      const header = {
        schema_version: SCHEMA,
        session_id: newId(),
        mode,
        student,
        started_at: new Date(clock()).toISOString(),
        submitted_at: null,
        active_ms: 0,
        interruptions: 0,
        ...meta,
        specimens,
        probe,
        initial,
        random_seed: null,
        case_id: null,
        template_id: null,
        case_code: null,
        ...(kase || {}),
      };
      live[mode] = createSession(mode, header, [], 0, perf);
      save(mode);
      return live[mode];
    },
    // Restore after a reload: session_id / started_at unchanged, active time continues (the gap is not counted).
    resume(mode, saved) {
      const header = { ...saved.header, interruptions: (saved.header.interruptions || 0) + 1 };
      live[mode] = createSession(mode, header, saved.log || [], saved.header.active_ms || 0, perf);
      return { session: live[mode], gap_s: Math.max(0, Math.round((clock() - (saved.saved_at || clock())) / 1000)) };
    },
    touch(mode) {
      if (!live[mode] || timers[mode]) return;
      timers[mode] = setTimeout(() => save(mode), SAVE_MS);
    },
    save,
    flush() { for (const m of Object.keys(live)) if (live[m]) save(m); },
    clear(mode) {
      clearTimeout(timers[mode]);
      timers[mode] = 0;
      delete live[mode];
      try { storage?.removeItem(KEY_PREFIX + mode); } catch { /* storage unavailable */ }
    },
  };
}

