// Pulse-echo cycle state machine (contracts/waveform_rules.json animation). Pure timing logic:
// maps animation time to the phase, the physics clock, the A-scan sweep and the reveal limit.

export function createInspection({ rules, wave, scenarios }) {
  const A = rules.animation;
  const PHASES = A.phases.slice(1);
  const DUR = A.duration_s;
  const START = {};
  let total = 0;
  for (const p of PHASES) {
    START[p] = total;
    total += DUR[p];
  }
  const SC = Object.fromEntries(scenarios.map((s) => [s.id, s]));
  const MB_FACTOR = rules.pulse.main_bang.length_factor;

  const st = { phase: 'IDLE', tc: 0, running: false, paused: false, continuous: false, done: false, seed: 1 };

  function phaseAt(tc) {
    for (let i = PHASES.length - 1; i >= 0; i--) if (tc >= START[PHASES[i]]) return PHASES[i];
    return PHASES[0];
  }

  function pulse() {
    Object.assign(st, { phase: PHASES[0], tc: 0, running: true, paused: false, continuous: false, done: false });
    st.seed += 1;
  }
  function reset() {
    Object.assign(st, { phase: 'IDLE', tc: 0, running: false, paused: false, continuous: false, done: false });
  }
  function setContinuous(on) {
    Object.assign(st, { phase: 'IDLE', tc: 0, running: false, paused: false, continuous: on, done: on });
  }
  function setPaused(on) {
    if (st.running) st.paused = on;
  }
  // Jump to cycle time tc (seconds) and hold there; used for acceptance checks and screenshots.
  function seek(tc) {
    Object.assign(st, { running: true, paused: true, continuous: false, done: false, tc: Math.min(tc, total - 1e-6) });
    st.phase = phaseAt(st.tc);
  }

  // Advances the cycle; returns the new phase name when it changes (IDLE at the end of a cycle).
  function tick(dt) {
    if (!st.running || st.paused) return null;
    st.tc += dt;
    const prev = st.phase;
    if (st.tc >= total) {
      Object.assign(st, { phase: 'IDLE', running: false, done: true, tc: total });
    } else {
      st.phase = phaseAt(st.tc);
    }
    return st.phase !== prev ? st.phase : null;
  }

  // Cycle time at which the physics clock reaches t (only defined inside the sound phases).
  function tcOf(t, half) {
    if (t <= half) return START.SOUND_FORWARD + (t / half) * DUR.SOUND_FORWARD;
    return START.SOUND_RETURN + (Math.min(t, 2 * half) / half - 1) * DUR.SOUND_RETURN;
  }

  // Everything the renderers need for the current instant, for a given inspection state.
  function view(s) {
    const H = s.thickness_mm ?? SC[s.scene].thickness_mm;
    const tB1 = wave.tof(2 * H);
    const half = tB1 / 2;
    const tWin = wave.windowUs(s);
    const L = wave.pulseUs(s.damping);
    const mainEnd = L * MB_FACTOR;
    const list = wave.echoes({ ...s, range_mm: 2 * H * s.velocity_m_s / wave.cTrue });
    const F = list.find((e) => e.type === 'defect');
    const B1 = list.find((e) => e.id === 'B1');
    const out = {
      phase: st.phase, running: st.running, paused: st.paused, continuous: st.continuous, done: st.done,
      tc: st.tc, u: 0, tPhys: null, sweepUs: null, revealUs: -1, front: null, back: null, seed: st.seed,
      tB1, tWin, total, start: START, dur: DUR, slowFactor: DUR.SOUND_FORWARD / (half * 1e-6),
      tF: F ? F.t : null, tcF: F ? tcOf(F.t, half) : null, depthF: F ? F.depth_mm : null,
      relF: F && B1 ? F.raw / B1.raw : 0,
    };
    if (st.continuous || (st.done && !st.running)) {
      out.revealUs = Infinity;
      return out;
    }
    if (!st.running) return out;
    const ph = st.phase;
    const u = Math.min(1, Math.max(0, (st.tc - START[ph]) / DUR[ph]));
    out.u = u;
    const i = PHASES.indexOf(ph);
    const iSF = PHASES.indexOf('SOUND_FORWARD');
    let t = null;
    if (ph === 'SOUND_FORWARD') t = u * half;
    else if (ph === 'REFLECTION') t = half;
    else if (ph === 'SOUND_RETURN') t = half + u * half;
    else if (ph === 'ASCAN_UPDATE') t = tB1 + u * Math.max(0, tWin - tB1);
    else if (i > iSF) t = tB1;
    if (t != null) {
      out.tPhys = t;
      out.sweepUs = Math.min(t, tWin);
      out.revealUs = ph === 'ASCAN_UPDATE'
        ? Math.max(out.sweepUs, tB1 + L)
        : Math.min(Math.max(out.sweepUs, mainEnd), tB1 - 0.45 * L);
    }
    if (ph === 'SOUND_FORWARD') out.front = u;
    else if (ph === 'REFLECTION') { out.front = 1; out.back = 1; }
    else if (ph === 'SOUND_RETURN') out.back = 1 - u;
    return out;
  }

  return { st, pulse, reset, setContinuous, setPaused, seek, tick, view, tcOf, phases: PHASES, start: START, total };
}
