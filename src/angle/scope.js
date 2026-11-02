// Angle-beam flaw detector: instrument state, 3D keys / encoder / soft keys, gate, auto gain, peak memory,
// freeze, reject, RF view; draws the shared drawScope screen on the 3D instrument and on the side panel,
// and the floating quick-control panel. Pages supply the signal (% FSH at the current gain, no noise).
import { drawScope } from '../waveform.js';
import inspDoc from '../../../knowledge/inspection.json';
import UI from '../../../knowledge/ui_strings.json';
import instMan from '../../../contracts/instrument_manifest.json';
import waveRules from '../../../contracts/waveform_rules.json';
import angleRules from '../../../contracts/angle_waveform_rules.json';
import AB from '../../../knowledge/angle_bench.json';

const PANEL = inspDoc.panel;
const L = UI.inspection;
const KEYS = instMan.keys;
const STEPS = waveRules.controls.gain_step_dB.options;
const AUTO = waveRules.auto_gain;
const GATE_SUBS = ['start', 'width', 'thr'];
const COLS = 640;
const REFRESH_MS = 110;
const SUB_MM = 0.08;
const OS_MAX = 8;
// Pulse envelope σ on the sound-path axis (angle_waveform_rules pulse rule: FWHM = cycles · λs / 2).
const PULSE_SIG_MM = (angleRules.probe.pulse_cycles * (angleRules.probe.c_steel_s_m_s / (angleRules.probe.f_MHz * 1000)) / 2) / (2 * Math.sqrt(Math.LN2));
const FLICKER = 0.35;
const CLUT = angleRules.display.wedge_clutter;

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
// Unit-RMS Gaussian-like noise smoothed twice by a box of k samples (≈ Gaussian low-pass).
function band(n, k, r) {
  let a = new Float32Array(n);
  for (let i = 0; i < n; i++) a[i] = r() + r() + r() - 1.5;
  for (let pass = 0; pass < 2 && k > 1; pass++) {
    const b = new Float32Array(n);
    let acc = 0;
    for (let i = 0; i < n + k; i++) {
      if (i < n) acc += a[i];
      if (i >= k) acc -= a[i - k];
      const j = i - (k >> 1);
      if (j >= 0 && j < n) b[j] = acc / k;
    }
    a = b;
  }
  let ss = 0;
  for (let i = 0; i < n; i++) ss += a[i] * a[i];
  const sc = 1 / Math.sqrt(ss / n || 1);
  for (let i = 0; i < n; i++) a[i] *= sc;
  return a;
}
const NOISE_REF = angleRules.display.noise_percent_at_ref_gain;
const CLIP = angleRules.display.clip_percent;
const VIDEO_TAU = waveRules.display.modes.rectified.video_tau_cycles;
const F_MHZ = angleRules.probe.f_MHz;
const G_REF = angleRules.display.ref.gain_dB;
export const RANGE_PRESETS = [100, 125, 150, 200, 250];
export const VELOCITY_PRESETS = [3230, 5920, 2730];

const f1 = (v) => v.toFixed(1);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const make = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

export function scopeDefaults(o = {}) {
  return {
    gain: 30, step: 1, range: 125, v: 3230, t0: 0, reject: 0, peak: false, display: 'rectified', curves: true,
    ...o,
    gate: { on: true, start: 10, width: 100, thr: 20, follow: true, ...(o.gate || {}) },
  };
}

export function keyLabels() {
  return Object.fromEntries(Object.entries(PANEL.keys).map(([k, v]) => [k, v.label]));
}

export function createScope({ getInstrument }) {
  let cfg = null;
  let fn = 'gain';
  let gateSub = 0;
  let frozen = false;
  let frozenFrame = null;
  let msg = null;
  let msgUntil = 0;
  let sig = null;
  let sigKey = '';
  let ver = 0;
  let env = null;
  let lastDraw = 0;
  let lastFrame = null;
  let lastGate = null;
  let screenCv = null;
  let panel = null;
  let fold = false;
  let noise = null;
  let clutter = null;

  const I = () => cfg?.inst;
  const gainGet = () => (cfg.gain ? cfg.gain.get() : I().gain);
  const lim = (k) => cfg.limits?.[k] ?? { gain: [0, 90], v: [2000, 7000], t0: [0, 20] }[k];
  const locked = (k) => !!cfg.lock?.[k];

  function say(text) {
    msg = text;
    msgUntil = performance.now() + 1600;
  }

  function changed(kind) {
    sigKey = '';
    if (kind !== 'view') cfg?.onChange?.(kind);
    draw(true);
    syncPanel();
  }

  function setGain(v) {
    const [a, b] = lim('gain');
    const g = Math.round(clamp(v, a, b) * 10) / 10;
    if (cfg.gain) cfg.gain.set(g);
    else I().gain = g;
    changed('gain');
  }
  function setRange(v) {
    I().range = v;
    env = null;
    changed('range');
  }
  function setV(v) {
    if (locked('v')) { say(PANEL.messages.inactive); return; }
    const [a, b] = lim('v');
    I().v = Math.round(clamp(v, a, b));
    env = null;
    changed('v');
  }
  function setT0(v) {
    if (locked('t0')) { say(PANEL.messages.inactive); return; }
    const [a, b] = lim('t0');
    I().t0 = Math.round(clamp(v, a, b) * 100) / 100;
    env = null;
    changed('t0');
  }
  function setGate(k, v) {
    const g = I().gate;
    const R = I().range;
    if (k === 'on') g.on = v;
    else if (k === 'start') g.start = Math.round(clamp(v, 0, R - 1) * 2) / 2;
    else if (k === 'width') g.width = Math.round(clamp(v, 1, R) * 2) / 2;
    else if (k === 'thr') { g.thr = Math.round(clamp(v, 5, 95)); g.follow = false; }
    else if (k === 'follow') g.follow = v;
    changed('gate');
  }
  // EL-linked threshold: the EL falls with sound path, so its height at the far end of the gate
  // (capped at the maximum sound path of the range) is the lowest EL level inside the gate.
  function followThr() {
    const g = I().gate;
    if (!g.follow || !cfg.evalLine) return;
    const sEnd = Math.max(g.start, Math.min(g.start + g.width, cfg.evalSpan ?? Infinity));
    const v = cfg.evalLine(sEnd, gainGet());
    if (Number.isFinite(v)) g.thr = Math.round(clamp(v, 5, 95));
  }
  function setReject(v) {
    I().reject = Math.round(clamp(v, 0, 40));
    changed('reject');
  }
  function setPeak(on) {
    I().peak = on;
    env = null;
    changed('peak');
  }
  function setFreeze(on) {
    frozen = on;
    frozenFrame = on ? lastFrame : null;
    changed('view');
  }
  function setDisplay(v) {
    I().display = v;
    changed('view');
  }
  function frozenBlock() {
    if (!frozen) return false;
    say(PANEL.messages.frozen);
    return true;
  }

  // ---------------------------------------------------------------- signal / frame
  // Sub-column sampling: narrow echoes (FWHM ≈ λ) are not missed between columns; each column shows
  // the maximum of its samples, as in the straight-probe synth.
  const osOf = (range) => clamp(Math.ceil(range / COLS / SUB_MM), 1, OS_MAX);
  function axis(range) {
    const n = COLS * osOf(range);
    return Array.from({ length: n }, (_, i) => ((i + 0.5) / n) * range);
  }
  function signal() {
    const st = I();
    const g = gainGet();
    const key = `${ver}|${g}|${st.range}|${st.v}|${st.t0}`;
    if (key !== sigKey || !sig) {
      sig = cfg.signal(axis(st.range), g);
      sigKey = key;
    }
    return sig;
  }

  function autoGain() {
    if (frozenBlock()) return;
    const st = I();
    const g = st.gate;
    const peakIn = (gain) => {
      const ax = axis(st.range);
      const s = cfg.signal(ax, gain);
      let h = 0;
      for (let i = 0; i < ax.length; i++) if (ax[i] >= g.start && ax[i] <= g.start + g.width) h = Math.max(h, s[i]);
      return h;
    };
    const g0 = gainGet();
    const h0 = peakIn(g0);
    if (!g.on || h0 < AUTO.min_percent) { say(PANEL.messages.no_echo); draw(true); return; }
    let gn = g0 + 20 * Math.log10(AUTO.target_percent / h0);
    const h1 = peakIn(clamp(gn, ...lim('gain')));
    if (h1 > 0) gn += 20 * Math.log10(AUTO.target_percent / h1);
    setGain(gn);
  }

  function gateRead(fr) {
    const st = I();
    const g = st.gate;
    if (!g.on) return null;
    const mm = st.range / COLS;
    const c0 = Math.max(0, Math.floor(g.start / mm));
    const c1 = Math.min(COLS, Math.ceil((g.start + g.width) / mm));
    let h = 0;
    let hc = -1;
    for (let c = c0; c < c1; c++) {
      const v = fr.rect ? fr.hi[c] : Math.max(fr.hi[c], -fr.lo[c]);
      if (v > h) { h = v; hc = c; }
    }
    const s = h >= g.thr && hc >= 0 ? (hc + 0.5) * mm : null;
    const d = s != null && cfg?.depthOf ? cfg.depthOf(s) : null;
    return { h: Math.min(h, 100), s, d, echo: h > 100 ? { pct: h } : null };
  }

  function frame(seed) {
    const st = I();
    const s = signal();
    const g = gainGet();
    const amp = cfg.noise ? cfg.noise(g) : NOISE_REF * 10 ** ((g - G_REF) / 20);
    const os = Math.max(1, Math.round(s.length / COLS));
    const n = COLS * os;
    // Grass: band-limited complex noise (pulse-length correlation) → Rayleigh-like speckle on the video
    // display. Part follows the probe position (grain scatter, renewed with the signal), part flickers.
    // amp = grass peak level: Rayleigh σ = amp / 4 (peaks above amp are rare).
    const k = Math.max(1, Math.round(PULSE_SIG_MM / (st.range / n)));
    const nKey = `${ver}|${st.range}|${st.v}|${st.t0}`;
    if (!noise || noise.n !== n || noise.key !== nKey) {
      const r = rng(hashStr(nKey));
      noise = { n, key: nKey, i: band(n, k, r), q: band(n, k, r) };
    }
    const fi = band(n, k, rng(seed * 2654435761));
    const fq = band(n, k, rng(seed * 2246822519 + 7));
    const sn = (amp / 4) * Math.sqrt(1 - FLICKER);
    const fl = (amp / 4) * Math.sqrt(FLICKER);
    // Main-bang tail / wedge reverberation from screen 0: fixed speckle (same probe), decaying envelope.
    if (!clutter || clutter.n !== n || clutter.k !== k) {
      const r = rng(0x5eed);
      clutter = { n, k, i: band(n, k, r), q: band(n, k, r) };
    }
    const c0 = (CLUT.percent_at_ref_gain * 10 ** ((g - G_REF) / 20)) / 2.2;
    const iSpan = Math.min(n, Math.ceil((CLUT.span_mm / st.range) * n));
    const cEnv = (i) => {
      const x = ((i + 0.5) / n) * st.range;
      return c0 * Math.exp(-x / CLUT.decay_mm) * Math.min(1, 4 * (1 - x / CLUT.span_mm));
    };
    // Envelope samples → RF (carrier + broadband noise) → full-wave rectified video peak-hold, column = max
    // of its samples; RF view keeps max / min per column (same chain as the straight-probe synth).
    const dt = (2000 * st.range / st.v) / n;
    const fUs = F_MHZ;
    const rect = st.display !== 'rf';
    const hi = new Float32Array(COLS);
    const lo = new Float32Array(COLS);
    const decay = Math.exp(-dt / (VIDEO_TAU / fUs));
    let y = 0;
    for (let c = 0; c < COLS; c++) {
      let mx = -Infinity;
      let mn = Infinity;
      for (let j = 0; j < os; j++) {
        const i = c * os + j;
        const a = Math.max(0, s[i] || 0);
        const t = (i + 0.5) * dt;
        let ni = sn * noise.i[i] + fl * fi[i];
        let nq = sn * noise.q[i] + fl * fq[i];
        if (i < iSpan) {
          const ce = cEnv(i);
          ni += ce * clutter.i[i];
          nq += ce * clutter.q[i];
        }
        if (rect) {
          // Video detector on the envelope (carrier phase does not bias the echo height).
          y = Math.max(Math.hypot(a + ni, nq), y * decay);
          if (y > mx) mx = y;
        } else {
          const w = 2 * Math.PI * fUs * t;
          const v = (a + ni) * Math.cos(w) - nq * Math.sin(w);
          if (v > mx) mx = v;
          if (v < mn) mn = v;
        }
      }
      if (rect) {
        const v = mx < st.reject ? 0 : mx;
        hi[c] = Math.min(CLIP, v);
        lo[c] = 0;
      } else {
        hi[c] = Math.abs(mx) < st.reject ? 0 : Math.min(CLIP, Math.max(-CLIP, mx));
        lo[c] = Math.abs(mn) < st.reject ? 0 : Math.min(CLIP, Math.max(-CLIP, mn));
      }
    }
    if (st.peak && rect) {
      if (!env || env.length !== COLS) env = new Float32Array(COLS);
      for (let i = 0; i < COLS; i++) env[i] = Math.max(env[i], hi[i]);
    }
    return { hi, lo, rect, columns: COLS, shown: COLS, tWin: dt * n / 1e6, echoes: [], state: { range_mm: st.range, velocity_m_s: st.v } };
  }

  function softKeys() {
    const st = I();
    const G = PANEL.gate;
    let items = [];
    if (fn === 'gain') items = STEPS.map((v) => ({ label: `${v} ${L.unit_dB}`, sub: PANEL.gain_step, on: st.step === v, act: () => { st.step = v; changed('view'); } }));
    else if (fn === 'range') items = RANGE_PRESETS.map((v) => ({ label: `${v} ${L.unit_mm}`, on: st.range === v, act: () => setRange(v) }));
    else if (fn === 'velocity') items = VELOCITY_PRESETS.map((v) => ({ label: String(v), sub: AB.velocity_presets[v], on: st.v === v, act: () => setV(v) }));
    else if (fn === 'zero') items = [{ label: PANEL.fn.zero, sub: `${st.t0.toFixed(2)} ${L.unit_us}`, on: true, act: () => {} }, { label: '0', act: () => setT0(0) }];
    else if (fn === 'reject') items = [{ label: PANEL.fn.reject, sub: `${st.reject}%`, on: true, act: () => {} }, { label: '0%', act: () => setReject(0) }];
    else if (fn === 'display') items = ['rectified', 'rf'].map((v) => ({ label: L.display_modes[v], on: st.display === v, act: () => setDisplay(v) }));
    else if (fn === 'gate') {
      items = [
        { label: G.title, sub: st.gate.on ? G.on : G.off, on: st.gate.on, act: () => setGate('on', !st.gate.on) },
        ...GATE_SUBS.map((k, i) => ({ label: G[['start', 'width', 'threshold'][i]], sub: gateVal(k), on: gateSub === i, act: () => { gateSub = i; changed('view'); } })),
      ];
      if (cfg.curves) items.push({ label: AB.quick.curves, sub: st.curves ? G.on : G.off, on: st.curves, act: () => { st.curves = !st.curves; changed('view'); } });
    }
    return KEYS.soft.map((_, i) => items[i] || null);
  }
  const gateVal = (k) => {
    const g = I().gate;
    return k === 'thr' ? `${g.thr}%${following() ? ` ${AB.quick.el}` : ''}` : `${f1(g[k])} ${L.unit_mm}`;
  };
  const following = () => !!(cfg?.evalLine && I().gate.follow);

  function opts(fr) {
    followThr();
    const st = I();
    const G = PANEL.gate;
    const read = gateRead(fr);
    lastGate = read;
    const tag = [];
    if (frozen) tag.push(PANEL.messages.frozen);
    if (st.peak) tag.push(AB.quick.peak);
    if (st.reject > 0) tag.push(`${PANEL.fn.reject} ${st.reject}%`);
    const header = [
      [L.gain, `${f1(gainGet())} ${L.unit_dB}`, fn === 'gain'],
      [L.range, `${st.range} ${L.unit_mm}`, fn === 'range'],
      [L.velocity, `${st.v} ${L.unit_m_s}`, fn === 'velocity'],
      [PANEL.fn.zero, `${st.t0.toFixed(2)} ${L.unit_us}`, fn === 'zero'],
    ];
    return {
      header,
      labels: { x: AB.axis_x, y: L.fsh },
      gate: { on: st.gate.on, start_mm: st.gate.start, width_mm: st.gate.width, threshold_pct: st.gate.thr },
      gateRead: read,
      gateText: { s: G.s, h: G.h, mm: L.unit_mm, ...(cfg.depthOf ? { d: G.d || AB.depth } : {}) },
      peak: st.peak && fr.rect ? env : null,
      curves: st.curves && cfg.curves ? cfg.curves(gainGet()) : null,
      marks: cfg.marks ? cfg.marks(gainGet()) : null,
      tag: tag.length ? tag.join(' · ') : null,
      message: msg,
    };
  }

  function draw(force = false) {
    if (!cfg) return;
    const now = performance.now();
    if (msg && now > msgUntil) { msg = null; force = true; }
    if (!force && now - lastDraw < REFRESH_MS) return;
    lastDraw = now;
    const fr = frozen && frozenFrame ? frozenFrame : frame(Math.floor(now / REFRESH_MS) % 9973);
    lastFrame = fr;
    if (frozen && !frozenFrame) frozenFrame = fr;
    const o = opts(fr);
    const inst = getInstrument();
    if (inst) inst.updateScreen((c) => drawScope(c, fr, { ...o, menu: softKeys(), width: c.width, height: c.height, dpr: 1, scale: c.width / 320 }));
    if (screenCv && screenCv.isConnected) {
      const w = screenCv.clientWidth || 320;
      drawScope(screenCv, fr, { ...o, width: w, height: Math.round(w * 0.62), dpr: Math.min(window.devicePixelRatio || 1, 2), scale: Math.max(1, w / 360) });
    }
  }

  // ---------------------------------------------------------------- keys
  function adjust(d) {
    const st = I();
    if (fn !== 'gate' && frozenBlock()) return;
    if (fn === 'gain') setGain(gainGet() + d * st.step);
    else if (fn === 'range') stepRange(d);
    else if (fn === 'velocity') setV(st.v + d * 1);
    else if (fn === 'zero') setT0(st.t0 + d * 0.01);
    else if (fn === 'reject') setReject(st.reject + d);
    else if (fn === 'display') setDisplay(st.display === 'rf' ? 'rectified' : 'rf');
    else if (fn === 'gate') {
      const k = GATE_SUBS[gateSub];
      setGate(k, st.gate[k] + d * (k === 'thr' ? 1 : Math.max(0.5, Math.round(st.range / 100 / 0.5) * 0.5)));
    }
  }
  function sideStep(d) {
    const st = I();
    if (fn !== 'gate' && fn !== 'gain' && frozenBlock()) return;
    if (fn === 'gain') {
      const i = Math.max(0, STEPS.indexOf(st.step));
      st.step = STEPS[clamp(i + d, 0, STEPS.length - 1)];
      changed('view');
    } else if (fn === 'range') stepRange(d);
    else if (fn === 'velocity') setV(st.v + d * 10);
    else if (fn === 'zero') setT0(st.t0 + d * 0.1);
    else if (fn === 'reject') setReject(st.reject + d * 5);
    else if (fn === 'display') setDisplay(st.display === 'rf' ? 'rectified' : 'rf');
    else if (fn === 'gate') { gateSub = (gateSub + d + GATE_SUBS.length) % GATE_SUBS.length; changed('view'); }
  }
  function stepRange(d) {
    const st = I();
    const i = RANGE_PRESETS.findIndex((v) => v >= st.range);
    setRange(RANGE_PRESETS[clamp((i < 0 ? RANGE_PRESETS.length - 1 : i) + d, 0, RANGE_PRESETS.length - 1)]);
  }
  function setFn(f) {
    fn = f;
    changed('view');
  }

  function press(id) {
    if (!cfg) return;
    getInstrument()?.pressKey(id);
    if (id === 'key__enter') { cfg.onRecord?.(); draw(true); return; }
    if (id === 'key__gain') setFn('gain');
    else if (id === 'key__db_step') { fn = 'gain'; sideStep(1); }
    else if (id === 'key__auto_gain') autoGain();
    else if (id === 'key__range') { if (!frozenBlock()) setFn('range'); }
    else if (id === 'key__velocity') { if (locked('v')) say(PANEL.messages.inactive); else if (!frozenBlock()) setFn('velocity'); }
    else if (id === 'key__zero') { if (locked('t0')) say(PANEL.messages.inactive); else if (!frozenBlock()) setFn('zero'); }
    else if (id === 'key__gate') setFn('gate');
    else if (id === 'key__display') { if (!frozenBlock()) { fn = 'display'; setDisplay(I().display === 'rf' ? 'rectified' : 'rf'); } }
    else if (id === 'key__reject') { if (!frozenBlock()) setFn('reject'); }
    else if (id === 'key__peak') setPeak(!I().peak);
    else if (id === 'key__freeze') setFreeze(!frozen);
    else if (id === 'key__up') adjust(1);
    else if (id === 'key__down') adjust(-1);
    else if (id === 'key__left') sideStep(-1);
    else if (id === 'key__right') sideStep(1);
    else {
      const sk = softKeys()[KEYS.soft.indexOf(id)];
      if (sk && !(fn !== 'gate' && fn !== 'gain' && frozenBlock())) sk.act();
    }
    draw(true);
    syncPanel();
  }
  function turn(detents) {
    if (!cfg || !detents) return;
    getInstrument()?.turnEncoder(detents);
    for (let i = 0; i < Math.abs(detents); i++) adjust(Math.sign(detents));
  }

  // ---------------------------------------------------------------- quick panel
  const Q = AB.quick;
  function btn(host, label, onClick, cls = '') {
    const b = make('button', `ag-qp-b ${cls}`.trim(), label);
    b.type = 'button';
    b.addEventListener('click', onClick);
    host.appendChild(b);
    return b;
  }
  function numBox(host, step, onSet) {
    const inp = Object.assign(document.createElement('input'), { type: 'number', step, inputMode: 'decimal' });
    inp.className = 'ag-qp-num';
    inp.addEventListener('change', () => { const v = parseFloat(inp.value); if (Number.isFinite(v)) onSet(v); });
    host.appendChild(inp);
    return inp;
  }
  function slider(host, label, onSet) {
    const l = make('label', 'ag-qp-sl');
    const inp = Object.assign(document.createElement('input'), { type: 'range' });
    const out = make('output');
    l.append(make('span', '', label), inp, out);
    inp.addEventListener('input', () => onSet(parseFloat(inp.value)));
    host.appendChild(l);
    return { inp, out };
  }

  function mountPanel(host, extra) {
    panel?.el.remove();
    const el = make('div', `ag-qp${fold ? ' fold' : ''}`);
    const head = make('div', 'ag-qp-head');
    head.appendChild(make('b', '', Q.title));
    const bFold = btn(head, fold ? Q.unfold : Q.fold, () => {
      fold = !fold;
      el.classList.toggle('fold', fold);
      bFold.textContent = fold ? Q.unfold : Q.fold;
    }, 'ag-qp-fold');
    el.appendChild(head);
    const body = make('div', 'ag-qp-body');
    el.appendChild(body);
    const row = (label) => {
      const r = make('div', 'ag-qp-row');
      r.appendChild(make('span', 'ag-qp-lab', label));
      const c = make('div', 'ag-qp-ctl');
      r.appendChild(c);
      body.appendChild(r);
      return c;
    };
    const P = {};
    const rg = row(Q.gain);
    for (const d of [-6, -1]) btn(rg, `${d}`, () => { if (!frozenBlock()) setGain(gainGet() + d); else draw(true); });
    P.gain = make('b', 'ag-qp-val');
    rg.appendChild(P.gain);
    for (const d of [1, 6]) btn(rg, `+${d}`, () => { if (!frozenBlock()) setGain(gainGet() + d); else draw(true); });
    btn(rg, Q.auto, () => { autoGain(); syncPanel(); }, 'ag-qp-auto');
    const rr = row(Q.range);
    P.range = RANGE_PRESETS.map((v) => {
      const b = btn(rr, `${v}`, () => { if (!frozenBlock()) setRange(v); else draw(true); });
      b.dataset.v = v;
      return b;
    });
    if (!locked('v') || !locked('t0')) {
      const rv = row(Q.velocity);
      btn(rv, '−', () => setV(I().v - 10));
      P.v = numBox(rv, 1, setV);
      btn(rv, '+', () => setV(I().v + 10));
      rv.appendChild(make('span', 'ag-qp-unit', L.unit_m_s));
      const rz = row(Q.zero);
      btn(rz, '−', () => setT0(I().t0 - 0.05));
      P.t0 = numBox(rz, 0.01, setT0);
      btn(rz, '+', () => setT0(I().t0 + 0.05));
      rz.appendChild(make('span', 'ag-qp-unit', L.unit_us));
    }
    const rgt = row(Q.gate);
    P.gateOn = btn(rgt, '', () => setGate('on', !I().gate.on), 'ag-qp-tog');
    const gs = make('div', 'ag-qp-gate');
    rgt.appendChild(gs);
    P.gs = slider(gs, Q.start, (v) => setGate('start', v));
    P.gw = slider(gs, Q.width, (v) => setGate('width', v));
    P.gt = slider(gs, Q.threshold, (v) => setGate('thr', v));
    if (cfg.evalLine) P.follow = btn(rgt, Q.follow_el, () => setGate('follow', !I().gate.follow), 'ag-qp-tog');
    const ra = row('');
    P.peak = btn(ra, Q.peak, () => setPeak(!I().peak), 'ag-qp-tog');
    P.freeze = btn(ra, Q.freeze, () => setFreeze(!frozen), 'ag-qp-tog');
    P.disp = btn(ra, '', () => setDisplay(I().display === 'rf' ? 'rectified' : 'rf'), 'ag-qp-tog');
    if (cfg.curves) P.curves = btn(ra, Q.curves, () => { I().curves = !I().curves; changed('view'); }, 'ag-qp-tog');
    // Record stays on the bottom bar only — avoid a second identical control inside 调参.
    if (extra) for (const [label, build] of extra) build(row(label), btn);
    head.addEventListener('pointerdown', (ev) => {
      if (ev.button !== 0 || ev.target.closest('button')) return;
      const r0 = el.getBoundingClientRect();
      const hr = host.getBoundingClientRect();
      const dx = ev.clientX - r0.left;
      const dy = ev.clientY - r0.top;
      head.setPointerCapture(ev.pointerId);
      const move = (e) => {
        const x = clamp(e.clientX - hr.left - dx, 0, hr.width - el.offsetWidth);
        const y = clamp(e.clientY - hr.top - dy, 0, hr.height - el.offsetHeight);
        Object.assign(el.style, { left: `${x}px`, top: `${y}px`, bottom: 'auto' });
      };
      const up = () => { head.removeEventListener('pointermove', move); head.removeEventListener('pointerup', up); };
      head.addEventListener('pointermove', move);
      head.addEventListener('pointerup', up);
      ev.preventDefault();
    });
    host.appendChild(el);
    panel = { el, P };
    syncPanel();
    return el;
  }

  function syncPanel() {
    if (!panel || !cfg || !panel.el.isConnected) return;
    const { P } = panel;
    followThr();
    const st = I();
    P.gain.textContent = `${f1(gainGet())} ${L.unit_dB}`;
    P.range.forEach((b) => b.classList.toggle('on', +b.dataset.v === st.range));
    if (P.v && document.activeElement !== P.v) P.v.value = String(st.v);
    if (P.t0 && document.activeElement !== P.t0) P.t0.value = st.t0.toFixed(2);
    P.gateOn.textContent = st.gate.on ? Q.on : Q.off;
    P.gateOn.classList.toggle('on', st.gate.on);
    const R = st.range;
    for (const [s, k, a, b, step] of [[P.gs, 'start', 0, R - 1, 0.5], [P.gw, 'width', 1, R, 0.5], [P.gt, 'thr', 5, 95, 1]]) {
      Object.assign(s.inp, { min: a, max: b, step });
      s.inp.value = String(st.gate[k]);
      s.out.textContent = gateVal(k);
    }
    P.follow?.classList.toggle('on', following());
    P.peak.classList.toggle('on', st.peak);
    P.freeze.classList.toggle('on', frozen);
    P.disp.textContent = L.display_modes[st.display];
    P.curves?.classList.toggle('on', st.curves);
  }

  return {
    // cfg: { inst, signal(axis, gain), noise?(gain), curves?(gain), marks?(gain), gain?: {get, set}, lock?, limits?,
    //        onChange?(kind), onRecord?(), recordLabel?, evalLine?(S, gain) (EL %FSH), evalSpan? (max sound path) }
    attach(c) {
      cfg = c;
      fn = 'gain';
      gateSub = 0;
      frozen = false;
      frozenFrame = null;
      msg = null;
      env = null;
      sigKey = '';
      ver++;
    },
    detach() {
      cfg = null;
      panel?.el.remove();
      panel = null;
      screenCv = null;
    },
    mountScreen(host) {
      screenCv = make('canvas', 'ag-scope-cv');
      host.appendChild(screenCv);
      return screenCv;
    },
    mountPanel,
    refresh() {
      ver++;
      sigKey = '';
      draw(true);
      syncPanel();
    },
    sync: syncPanel,
    resetPeak() { env = null; draw(true); },
    tick() { draw(false); },
    press,
    turn,
    autoGain,
    say(text) { say(text); draw(true); },
    // Current screen redrawn off-screen at export resolution (same frame and overlays as the live view).
    exportCanvas(w = 1280) {
      if (!cfg) return null;
      const fr = (frozen && frozenFrame) || lastFrame || frame(1);
      const off = make('canvas');
      drawScope(off, fr, { ...opts(fr), width: w, height: Math.round(w * 0.62), dpr: 1, scale: w / 360 });
      return off;
    },
    get frozen() { return frozen; },
    get fn() { return fn; },
    gate: () => lastGate,
    state: () => (cfg ? { ...I(), gain: gainGet(), fn, frozen, gate: { ...I().gate }, read: lastGate } : null),
  };
}
