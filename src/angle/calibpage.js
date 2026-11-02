// Calibration page: CSK-IA index point / time base / K value, CSK-IIA-1 DAC and scan sensitivity on the 3D bench
// (probe dragged on the block, all instrument settings on the flaw detector keys / quick panel).
// One sampled probe per session (contracts/angle_calibration.json probe_sample); records carry across topics.
import { seg, button } from './diagrams.js';
import { sdhElements } from './model.js';
import { locate } from './locate.js';
import { make, card, readouts, LEG_C } from './beam.js';
import { practiceStage } from './practice.js';
import { scopeDefaults } from './scope.js';
import { createCalibHelp, sweepMax, helpAllowed } from './calibhelp.js';
import AB from '../../../knowledge/angle_bench.json';
import angleRules from '../../../contracts/angle_waveform_rules.json';
import {
  sampleProbe, sampleModel, arcEchoes, holeEcho, tof, screenS, screenTrace, twoPoint,
  kFromMark, kFromPath, holePeak, dacRow, maxPath, curveDb, scanGain,
} from './calib.js';

const f1 = (v) => v.toFixed(1);
const f2 = (v) => v.toFixed(2);
const HOUSING = { len: 33, height: 25 };
const LINE_C = { DAC: '#e2e8f0', RL: '#f87171', SL: '#fbbf24', EL: '#34d399' };
const RANGES = { index: 250, time: 250, kval: 125, dac: 150 };
const GATES = { index: [30, 210], time: [30, 210], kval: [30, 80], dac: [10, 130] };

let S = null;

function build(ctx, s) {
  const blk = ctx.blocks.blocks['CSK-IIA-1'];
  const m = sampleModel(ctx.rules, s, { t: blk.T_mm });
  const I = ctx.cal.instrument;
  return {
    s, m,
    inst: scopeDefaults({ v: I.velocity_m_s.initial, t0: I.zero_us.initial, gain: 30, range: I.range_mm }),
    px: { index: 190, kval: 108, dac: 80 },
    dacDir: -1,
    rec: { front: null, time: null, K: null, Kpath: null, dac: [], scan: null },
  };
}

function session(ctx, sample) {
  if (S && !sample) return S;
  S = build(ctx, sample ?? sampleProbe(ctx.cal.probe_sample));
  return S;
}

export const calibState = () => S;

const frontUsed = (ss, ctx) => ss.rec.front ?? ctx.rules.probe.front_length_mm;
const kUsed = (ss, ctx) => ss.rec.K ?? ctx.rules.probe.K;

// ---------------------------------------------------------------- shared side cards
function summaryCard(side, ctx, ss, onNew) {
  const X = ctx.text;
  const Cm = X.common;
  const c = card(side, Cm.summary);
  c.classList.add('ag-cb-sum');
  const dl = make('dl', 'ag-params ag-bm-read');
  const dd = {};
  for (const k of ['front', 'v', 't0', 'K', 'dac', 'scan']) {
    dd[k] = make('dd');
    dd[k].dataset.rec = k;
    dl.append(make('dt', '', X.summary[k]), dd[k]);
  }
  c.appendChild(dl);
  const nb = make('button', 'ag-chip', Cm.new_probe);
  nb.type = 'button';
  nb.addEventListener('click', onNew);
  c.appendChild(nb);
  const tol = ctx.cal.tolerances;
  const put = (k, val, act, ok) => {
    const d = dd[k];
    d.innerHTML = '';
    d.classList.remove('ok', 'bad');
    if (val == null) { d.textContent = Cm.none; return; }
    d.appendChild(make('b', '', val));
    if (act != null) d.appendChild(make('span', 'ag-cb-act', `${Cm.actual} ${act}`));
    if (ok != null) d.classList.add(ok ? 'ok' : 'bad');
  };
  return function update() {
    const r = ss.rec;
    const p = ss.m.p;
    put('front', r.front == null ? null : `${f1(r.front)} ${Cm.mm}`, r.front == null ? null : f1(ss.s.front), r.front == null ? null : Math.abs(r.front - ss.s.front) <= tol.front_mm);
    put('v', r.time ? `${Math.round(r.time.v)} ${Cm.ms}` : null, r.time ? `${Math.round(p.cs)}` : null, r.time ? r.time.ok : null);
    put('t0', r.time ? `${f2(r.time.t0)} ${Cm.us}` : null, r.time ? f2(p.delayUs) : null, r.time ? r.time.ok : null);
    put('K', r.K == null ? null : f2(r.K), r.K == null ? null : f2(ss.s.K), r.K == null ? null : Math.abs(r.K - ss.s.K) <= tol.K);
    put('dac', r.dac.length ? `${r.dac.length}` : null, null, r.dac.length ? r.dac.length >= ctx.cal.dac.min_points : null);
    put('scan', r.scan ? `${f1(r.scan.gain)} ${Cm.dB}` : null, r.scan ? f1(r.scan.Gtrue) : null, r.scan ? r.scan.ok : null);
  };
}

function formulaCard(side, ctx, list) {
  const c = card(side, ctx.text.common.formulas);
  for (const f of list) {
    const b = make('div', 'ag-bm-f');
    const m = make('div', 'ag-math');
    m.innerHTML = ctx.tex(f.latex);
    b.append(make('span', 'ag-tag', f.name), m);
    c.appendChild(b);
  }
  return c;
}

// Peak memory for the tracked echo (raw amplitude, gain-independent).
function memory() {
  let P = 0;
  return {
    reset() { P = 0; },
    push(p) { P = Math.max(P, p); return P; },
    get: () => P,
  };
}

function keyMover(ctx, get, set) {
  const onKey = (e) => {
    if (!ctx.active() || /input|textarea|select/i.test(e.target.tagName)) return;
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    set(get() + (e.key === 'ArrowLeft' ? -1 : 1) * (e.shiftKey ? 5 : 0.5));
  };
  window.addEventListener('keydown', onKey);
  return () => window.removeEventListener('keydown', onKey);
}

function flash(host, text, cls) {
  host.textContent = text;
  host.classList.remove('ok', 'bad', 'show');
  void host.offsetWidth;
  host.classList.add(cls, 'show');
}

// Flaw-detector envelope on the screen axis: coherent-style echo sum + main-bang ring-down (% FSH).
function traceOf(ss, list) {
  const fUs = angleRules.probe.f_MHz;
  const cycles = angleRules.probe.pulse_cycles;
  return (axis, gain) => {
    const raw = screenTrace(ss.m, list(), axis, ss.inst.v, ss.inst.t0);
    const g10 = 10 ** ((gain - angleRules.display.ref.gain_dB) / 20);
    const Sb = screenS(0, ss.inst.v, ss.inst.t0);
    const mbLen = Math.max(2.5, (cycles * ss.inst.v) / (2000 * fUs) * 2.2);
    return Float64Array.from(raw, (r, i) => {
      const x = axis[i] - Sb;
      let v = ss.m.percent(r, gain);
      if (x > -mbLen && x < mbLen * 3) {
        const u = x / (mbLen / 2.2);
        const env = Math.exp(-(u * u));
        const ring = x > 0 ? Math.exp(-x / (mbLen * 0.85)) * Math.abs(Math.sin(2 * Math.PI * fUs * (2000 * x / ss.inst.v))) : 0;
        v += 125 * env + 18 * g10 * ring;
      }
      return v;
    });
  };
}

function gateCovers(sc, mm, pad = 8) {
  const g = sc.state()?.gate;
  if (!g?.on || !Number.isFinite(mm)) return false;
  return mm >= g.start - pad && mm <= g.start + g.width + pad;
}

function gateHeight(sc) {
  const r = sc.state()?.read;
  return r ? r.h : 0;
}

function enterTopic(ss, topic) {
  ss.inst.range = RANGES[topic];
  const [a, w] = GATES[topic];
  Object.assign(ss.inst.gate, { start: a, width: w });
}

function moveRow(set, get) {
  return [AB.quick.probe, (host, btn) => {
    for (const d of [-5, -0.5, 0.5, 5]) btn(host, d < 0 ? `◀ ${-d}` : `${d} ▶`, () => set(get() + d));
  }];
}

function scopeCfg(ctx, ss, topic, o) {
  const I = ctx.cal.instrument;
  const free = topic === 'time';
  const blk = ctx.blocks?.blocks?.['CSK-IIA-1'];
  const T = (topic === 'dac' || topic === 'kval') && blk ? blk.T_mm : null;
  const K = ss.m.p.K;
  return {
    inst: ss.inst,
    limits: { gain: [0, 80], v: [I.velocity_m_s.min, I.velocity_m_s.max], t0: [I.zero_us.min, I.zero_us.max] },
    lock: { v: !free, t0: !free },
    noise: (gain) => angleRules.display.noise_percent_at_ref_gain * 10 ** ((gain - angleRules.display.ref.gain_dB) / 20),
    ...(T != null ? { depthOf: (S) => locate(S, T, K).d } : {}),
    ...o,
  };
}

// ---------------------------------------------------------------- index point / front length, time base
function renderArc(main, side, ctx, ss, topic, redo) {
  const X = ctx.text;
  const Cm = X.common;
  const T = X[topic];
  const blk = ctx.cal.csk_ia;
  const tolT = ctx.cal.instrument.tolerance_mm;
  const st = { beam: false };
  if (topic === 'time') ss.px.index = 200 - ss.s.front + frontUsed(ss, ctx);
  enterTopic(ss, topic);
  if (topic === 'index') {
    const s100 = screenS(tof(ss.m, 100), ss.inst.v, ss.inst.t0);
    Object.assign(ss.inst.gate, { start: Math.max(5, Math.round(s100 - 25)), width: 50 });
  }
  const P = practiceStage(main, side, ctx, T.title);
  const { ctl, B, sc, msg } = P;
  const mem = memory();
  const bBeam = button(ctl, Cm.beam, () => { st.beam = !st.beam; bBeam.classList.toggle('active', st.beam); update(); });
  button(ctl, Cm.clear_env, () => { sc.resetPeak(); mem.reset(); update(); });
  const bRec = document.createElement('button');
  bRec.className = 'ag-chip ag-op-rec';
  bRec.type = 'button';
  bRec.textContent = Cm.record;
  if (Cm.record_tip) bRec.dataset.tip = Cm.record_tip;
  bRec.addEventListener('click', () => record());
  P.barR.prepend(bRec);

  const sum = summaryCard(side, ctx, ss, () => { S = null; session(ctx); redo(); });
  const rd = card(side, Cm.readout);
  const keys = topic === 'index' ? ['amp', 'peak_mem', 'delta', 'L'] : ['r50', 'r100', 'amp'];
  const dd = readouts(rd, keys, { ...Cm, ...T });
  formulaCard(side, ctx, X.formulas[topic]);

  const front = ss.s.front;
  const clamp = (px) => Math.max(HOUSING.len - front, Math.min(blk.length_mm - front, px));
  const move = (v) => { ss.px.index = clamp(Math.round(v * 2) / 2); update(); };
  const stopKeys = keyMover(ctx, () => ss.px.index, move);
  let ec = [];
  let cur = null;
  let help = null;
  const sOf = (q) => screenS(tof(ss.m, q.S), ss.inst.v, ss.inst.t0);

  B.setSpecimen({ kind: 'csk_ia', blk });
  P.start(scopeCfg(ctx, ss, topic, {
    signal: traceOf(ss, () => ec),
    marks: (gain) => ec.filter((q) => q.P > 0).map((q) => ({ mm: sOf(q), pct: ss.m.percent(q.P, gain), label: q.id, color: q.id === 'R100' ? '#38bdf8' : '#fbbf24' })),
    onChange: () => update(),
    onRecord: () => record(),
    recordLabel: Cm.record,
    drag: (x) => move(x),
  }), [moveRow(move, () => ss.px.index)]);

  function update() {
    ss.px.index = clamp(ss.px.index);
    const px = ss.px.index;
    ec = arcEchoes(ss.m, px, blk);
    const r100 = ec.find((q) => q.id === 'R100');
    const r50 = ec.find((q) => q.id === 'R50');
    const xf = px + front;
    const L = xf - blk.arc_centre_x_mm;
    B.setPose({ px, py: blk.width_mm / 2, phi: 0, shift: front - ctx.rules.probe.front_length_mm });
    B.setMark(front - frontUsed(ss, ctx));
    B.setBeam(st.beam ? { m: ss.m, S: r100 ? r100.S : 100 } : null);
    const P0 = r100 ? r100.P : 0;
    const M = mem.push(P0);
    const pct = ss.m.percent(P0, ss.inst.gain);
    dd.amp.textContent = P0 > 0 ? `${f1(pct)} ${Cm.fsh}` : Cm.no_echo;
    if (topic === 'index') {
      dd.peak_mem.textContent = M > 0 ? `${f1(ss.m.percent(M, ss.inst.gain))} ${Cm.fsh}` : Cm.none;
      dd.delta.textContent = P0 > 0 && M > 0 ? `${f1(20 * Math.log10(P0 / M))} ${Cm.dB}` : Cm.none;
      dd.L.textContent = `${f1(L)} ${Cm.mm}`;
    } else {
      const s50 = r50 && r50.P > 0 ? sOf(r50) : NaN;
      const s100 = r100 && r100.P > 0 ? sOf(r100) : NaN;
      dd.r50.textContent = Number.isFinite(s50) ? `${f1(s50)} ${Cm.mm}` : Cm.none;
      dd.r100.textContent = Number.isFinite(s100) ? `${f1(s100)} ${Cm.mm}` : Cm.none;
      dd.r50.classList.toggle('ok', Math.abs(s50 - 50) <= tolT);
      dd.r100.classList.toggle('ok', Math.abs(s100 - 100) <= tolT);
      cur = { s50, s100 };
    }
    cur = { ...cur, L, pct };
    sc.refresh();
    sum();
    help?.tick();
  }
  function record() {
    if (topic === 'index') {
      ss.rec.front = Math.round(cur.L * 10) / 10;
      flash(msg, `${X.summary.front} ${f1(ss.rec.front)} ${Cm.mm}`, Math.abs(ss.rec.front - ss.s.front) <= ctx.cal.tolerances.front_mm ? 'ok' : 'bad');
    } else {
      const ok = Math.abs(cur.s50 - 50) <= tolT && Math.abs(cur.s100 - 100) <= tolT;
      ss.rec.time = { v: ss.inst.v, t0: ss.inst.t0, s50: cur.s50, s100: cur.s100, ok };
      flash(msg, `R50 ${f1(cur.s50)} · R100 ${f1(cur.s100)} ${Cm.mm}`, ok ? 'ok' : 'bad');
    }
    update();
  }
  const api = {
    set(v) {
      if (v.px != null) ss.px.index = v.px;
      if (v.gain != null) ss.inst.gain = v.gain;
      if (v.v != null) ss.inst.v = v.v;
      if (v.t0 != null) ss.inst.t0 = v.t0;
      update();
      sc.sync();
    },
    record,
    state: () => ({ ...cur, px: ss.px.index, rec: ss.rec, sample: ss.s, inst: ss.inst, scope: sc.state() }),
  };
  help = createCalibHelp({
    ctl, stage: P.tipHost, text: X, topic,
    items: X.guide[topic],
    onTopicDone: () => ctx.onTopicDone?.(topic),
    checks: () => {
      const st = api.state();
      if (topic === 'index') {
        const onPeak = Math.abs(st.px - blk.arc_centre_x_mm) <= 3 || (st.pct > 20 && Math.abs(st.L - ss.s.front) <= ctx.cal.tolerances.front_mm + 1);
        const s100 = screenS(tof(ss.m, 100), ss.inst.v, ss.inst.t0);
        return {
          pos: onPeak, gate: gateCovers(sc, s100),
          gain: gateHeight(sc) >= 60 || ss.rec.front != null,
          rec: ss.rec.front != null,
        };
      }
      const okV = Number.isFinite(st.s50) && Number.isFinite(st.s100) && Math.abs(st.s100 - st.s50 - 50) <= tolT + 0.2;
      const okT = Number.isFinite(st.s50) && Math.abs(st.s50 - 50) <= tolT + 0.2;
      return {
        pos: Number.isFinite(st.s50) && Number.isFinite(st.s100),
        v: okV || !!ss.rec.time,
        t0: (okV && okT) || !!ss.rec.time,
        rec: !!ss.rec.time,
      };
    },
    demo: async (d) => {
      B.view('probe');
      await d.wait(350);
      if (topic === 'index') {
        const c0 = blk.arc_centre_x_mm;
        await sweepMax(d, {
          from: c0 - 22, to: c0 + 22, step: 0.5, ms: 2600,
          set: (x) => api.set({ px: Math.round(x * 2) / 2 }),
          read: () => api.state().pct || 0,
        });
        B.view('screen');
        await d.wait(280);
        sc.press('key__auto_gain');
        await d.wait(500);
        B.view('system');
        await d.wait(250);
        api.record();
      } else {
        api.set({ px: 200 - ss.s.front + frontUsed(ss, ctx) });
        await d.wait(300);
        B.view('screen');
        await d.wait(250);
        const cal = twoPoint(tof(ss.m, 50), tof(ss.m, 100), 50, 100);
        const v0 = ss.inst.v;
        const t00 = ss.inst.t0;
        sc.press('key__velocity');
        await d.lerp(v0, cal.v, 1600, (v) => api.set({ v: Math.round(v) }));
        await d.wait(200);
        sc.press('key__zero');
        await d.lerp(t00, cal.t0, 1400, (t) => api.set({ t0: Math.round(t * 100) / 100 }));
        await d.wait(300);
        B.view('system');
        await d.wait(200);
        api.record();
      }
    },
  });
  update();
  return {
    stop: () => { help?.stop(); stopKeys(); P.stop(); },
    ...api,
  };
}

// ---------------------------------------------------------------- K value
function renderK(main, side, ctx, ss, redo) {
  const X = ctx.text;
  const Cm = X.common;
  const T = X.kval;
  const blk = ctx.cal.csk_ia;
  const st = { beam: false };
  enterTopic(ss, 'kval');
  const P = practiceStage(main, side, ctx, T.title);
  const { ctl, B, sc, msg } = P;
  const mem = memory();
  const bBeam = button(ctl, Cm.beam, () => { st.beam = !st.beam; bBeam.classList.toggle('active', st.beam); update(); });
  button(ctl, Cm.clear_env, () => { sc.resetPeak(); mem.reset(); update(); });
  const bRec = document.createElement('button');
  bRec.className = 'ag-chip ag-op-rec';
  bRec.type = 'button';
  bRec.textContent = Cm.record;
  if (Cm.record_tip) bRec.dataset.tip = Cm.record_tip;
  bRec.addEventListener('click', () => record());
  P.barR.prepend(bRec);
  const sum = summaryCard(side, ctx, ss, () => { S = null; session(ctx); redo(); });
  const rd = card(side, Cm.readout);
  const dd = readouts(rd, ['amp', 'peak_mem', 'delta', 'mark', 'S', 'Kpath'], { ...Cm, ...T });
  formulaCard(side, ctx, X.formulas.kval);

  const front = ss.s.front;
  const clamp = (px) => Math.max(front, Math.min(blk.length_mm - (HOUSING.len - front), px));
  const move = (v) => { ss.px.kval = clamp(Math.round(v * 2) / 2); update(); };
  const stopKeys = keyMover(ctx, () => ss.px.kval, move);
  let q = null;
  let cur = null;
  let help = null;

  B.setSpecimen({ kind: 'csk_ia', blk });
  P.start(scopeCfg(ctx, ss, 'kval', {
    signal: traceOf(ss, () => (q ? [q] : [])),
    marks: (gain) => (q && q.P > 0 ? [{ mm: cur?.Ss ?? 0, pct: ss.m.percent(q.P, gain), label: f1(cur?.Ss ?? 0), color: '#38bdf8' }] : []),
    onChange: () => update(),
    onRecord: () => record(),
    recordLabel: Cm.record,
    drag: (x) => move(x),
  }), [moveRow(move, () => ss.px.kval)]);

  function update() {
    ss.px.kval = clamp(ss.px.kval);
    const px = ss.px.kval;
    q = holeEcho(ss.m, px, blk);
    const mark = px - (front - frontUsed(ss, ctx));
    B.setPose({ px, py: blk.width_mm / 2, phi: Math.PI, shift: front - ctx.rules.probe.front_length_mm });
    B.setMark(front - frontUsed(ss, ctx));
    B.setBeam(st.beam ? { m: ss.m, S: q ? q.S + 2 : 60 } : null);
    const P0 = q ? q.P : 0;
    const Ss = q ? screenS(tof(ss.m, q.S), ss.inst.v, ss.inst.t0) : NaN;
    const pct = ss.m.percent(P0, ss.inst.gain);
    const M = mem.push(P0);
    const kM = kFromMark(mark, blk);
    const kP = kFromPath(Ss, blk);
    dd.amp.textContent = P0 > 0 ? `${f1(pct)} ${Cm.fsh}` : Cm.no_echo;
    dd.peak_mem.textContent = M > 0 ? `${f1(ss.m.percent(M, ss.inst.gain))} ${Cm.fsh}` : Cm.none;
    dd.delta.textContent = P0 > 0 && M > 0 ? `${f1(20 * Math.log10(P0 / M))} ${Cm.dB}` : Cm.none;
    dd.mark.textContent = f2(kM);
    dd.S.textContent = P0 > 0 ? `${f1(Ss)} ${Cm.mm}` : Cm.none;
    dd.Kpath.textContent = P0 > 0 && Number.isFinite(kP) ? f2(kP) : Cm.none;
    cur = { kM, kP, Ss, pct, mark };
    sc.refresh();
    sum();
    help?.tick();
  }
  function record() {
    ss.rec.K = Math.round(cur.kM * 100) / 100;
    ss.rec.Kpath = Number.isFinite(cur.kP) ? Math.round(cur.kP * 100) / 100 : null;
    flash(msg, `K ${f2(ss.rec.K)}${ss.rec.Kpath != null ? ` · ${T.Kpath} ${f2(ss.rec.Kpath)}` : ''}`, Math.abs(ss.rec.K - ss.s.K) <= ctx.cal.tolerances.K ? 'ok' : 'bad');
    update();
  }
  const api = {
    record,
    set(v) {
      if (v.px != null) ss.px.kval = v.px;
      if (v.gain != null) ss.inst.gain = v.gain;
      update();
      sc.sync();
    },
    state: () => ({ ...cur, px: ss.px.kval, rec: ss.rec, sample: ss.s, scope: sc.state() }),
  };
  help = createCalibHelp({
    ctl, stage: P.tipHost, text: X, topic: 'kval',
    items: X.guide.kval,
    onTopicDone: () => ctx.onTopicDone?.('kval'),
    checks: () => {
      const st = api.state();
      const target = blk.hole50.x_mm + blk.hole50.z_mm * ss.s.K;
      return {
        pos: Math.abs(st.px - target) <= 4 || (st.pct > 15),
        gate: gateCovers(sc, st.Ss),
        gain: gateHeight(sc) >= 60 || ss.rec.K != null,
        rec: ss.rec.K != null,
      };
    },
    demo: async (d) => {
      B.view('probe');
      await d.wait(300);
      const target = blk.hole50.x_mm + blk.hole50.z_mm * ss.s.K;
      await sweepMax(d, {
        from: target - 18, to: target + 18, step: 0.5, ms: 2400,
        set: (x) => api.set({ px: clamp(Math.round(x * 2) / 2) }),
        read: () => api.state().pct || 0,
      });
      B.view('screen');
      await d.wait(250);
      sc.press('key__auto_gain');
      await d.wait(450);
      B.view('system');
      await d.wait(200);
      api.record();
    },
  });
  update();
  return {
    stop: () => { help?.stop(); stopKeys(); P.stop(); },
    ...api,
  };
}

// ---------------------------------------------------------------- DAC on CSK-IIA-1, scan sensitivity
function renderDac(main, side, ctx, ss, redo) {
  const X = ctx.text;
  const Cm = X.common;
  const D = X.dac;
  const blk = ctx.blocks.blocks['CSK-IIA-1'];
  const Tb = blk.T_mm;
  const Lb = blk.length_mm;
  const m = ss.m;
  const cfg = ctx.cal.dac;
  const row = dacRow(ctx.std.items.dac_sensitivity.rows, cfg.plate_t_mm);
  const ref = ctx.rules.display.ref;
  const els = blk.holes.map((h, i) => sdhElements(h.x_mm, 0, h.z_mm, blk.hole_phi_mm, -blk.hole_length_mm / 2, blk.hole_length_mm / 2, i));
  const all = els.flat();
  const front = ss.s.front;
  enterTopic(ss, 'dac');

  const P = practiceStage(main, side, ctx, D.title);
  const { ctl, B, sc, msg } = P;
  const mem = memory();
  const dirSeg = seg(ctl, [['-1', D.dir_left], ['1', D.dir_right]], String(ss.dacDir), (v) => { ss.dacDir = +v; ss.px.dac = ss.dacDir < 0 ? 80 : 190; sc.resetPeak(); mem.reset(); update(); });
  button(ctl, Cm.clear_env, () => { sc.resetPeak(); mem.reset(); update(); });
  const bAdd = button(ctl, D.add, () => addPoint());
  bAdd.classList.add('ag-cb-rec');
  button(ctl, D.clear, () => { ss.rec.dac = []; ss.rec.scan = null; update(); });
  const bScan = button(ctl, D.scan, () => recordScan());
  bScan.classList.add('ag-cb-rec');

  const sum = summaryCard(side, ctx, ss, () => { S = null; session(ctx); redo(); });
  const rd = card(side, Cm.readout);
  const dd = readouts(rd, ['amp', 'peak_mem', 'delta', 'S', 'depth', 'leg'], { ...Cm, ...D });
  const pc = card(side, D.points);
  const table = make('table', 'ag-media ag-cb-pts');
  pc.appendChild(table);
  const sens = card(side, X.summary.scan);
  const dds = readouts(sens, ['plate', 'smax', 'el_at', 'transverse'], D);
  const lines = { EL: row.EL_dB, SL: row.SL_dB, RL: row.RL_dB };
  formulaCard(side, ctx, [
    ...X.formulas.dac,
    ...['RL', 'SL', 'EL'].map((k) => ({ name: X.formulas.dac_lines[k], latex: `\\mathrm{${k}} = \\mathrm{DAC} ${row[`${k}_dB`] < 0 ? '-' : '+'} ${Math.abs(row[`${k}_dB`])}\\,\\mathrm{dB}` })),
  ]);

  const clamp = (px) => {
    const back = HOUSING.len - front;
    const lo = ss.dacDir < 0 ? front : back;
    const hi = Lb - (ss.dacDir < 0 ? back : front);
    return Math.max(lo, Math.min(hi, px));
  };
  const move = (v) => { ss.px.dac = clamp(Math.round(v * 2) / 2); update(); };
  const stopKeys = keyMover(ctx, () => ss.px.dac, move);

  const sOf = (Strue) => screenS(tof(m, Strue), ss.inst.v, ss.inst.t0);
  const Kst = () => kUsed(ss, ctx);
  const SmaxSt = () => maxPath(cfg.plate_t_mm, cfg.legs, Kst());
  const pctOf = (A, gain = ss.inst.gain) => ref.percent_fsh * 10 ** ((A + gain - ref.gain_dB) / 20);
  let kept = [];
  let cur = null;
  let help = null;

  function curves(gain) {
    const out = [];
    const Smax = SmaxSt();
    const R = ss.inst.range;
    if (Smax <= R) out.push({ pts: [[Smax, 0], [Smax, 100]], color: '#64748b', dash: [4, 4], width: 1, label: 'Smax' });
    const pts = ss.rec.dac;
    if (pts.length < 2) {
      if (pts.length) out.push({ pts: [[0, -1], [0, -1]], color: LINE_C.DAC, dots: pts.map((p) => [p.S, pctOf(p.A, gain)]) });
      return out;
    }
    for (const [k, off] of [['RL', lines.RL], ['SL', lines.SL], ['EL', lines.EL]]) {
      const c = [];
      for (let i = 0; i <= 100; i++) {
        const s = (R * i) / 100;
        c.push([s, pctOf(curveDb(pts, s) + off, gain)]);
      }
      out.push({ pts: c, color: LINE_C[k], width: 1.3, label: k });
    }
    return out;
  }

  B.setSpecimen({ kind: 'csk_iia1', blk });
  P.start(scopeCfg(ctx, ss, 'dac', {
    signal: traceOf(ss, () => kept),
    curves,
    marks: (gain) => (cur?.best ? [{ mm: cur.best.Ss, pct: m.percent(cur.best.P, gain), label: f1(cur.best.Ss), color: '#38bdf8' }] : []),
    onChange: () => update(),
    onRecord: () => addPoint(),
    recordLabel: D.add,
    drag: (x) => move(x),
  }), [moveRow(move, () => ss.px.dac)]);

  function renderTable() {
    table.innerHTML = '';
    const tr = (cells, th) => {
      const r = make('tr');
      cells.forEach((c) => {
        const td = make(th ? 'th' : 'td', '', typeof c === 'object' ? c.t : c);
        if (typeof c === 'object' && c.cls) td.className = c.cls;
        r.appendChild(td);
      });
      table.appendChild(r);
    };
    tr([D.depth, D.leg, D.S, D.A, Cm.actual], true);
    for (const p of [...ss.rec.dac].sort((a, b) => a.S - b.S)) {
      tr([`${p.depth}`, D.legs[p.leg - 1], f1(p.S), f1(p.A), { t: f1(p.trueA), cls: Math.abs(p.A - p.trueA) <= 1 ? 'ok' : 'bad' }]);
    }
  }

  function update() {
    ss.px.dac = clamp(ss.px.dac);
    const dir = ss.dacDir;
    const px = ss.px.dac;
    const pose = { px, py: 0, phi: dir < 0 ? Math.PI : 0 };
    const reach = dir < 0 ? px : Lb - px;
    B.setPose({ ...pose, shift: front - ctx.rules.probe.front_length_mm });
    B.setMark(front - frontUsed(ss, ctx));
    B.setBeam({ m, T: Tb, S: Math.min(ss.inst.range, reach / m.p.sb) });

    let best = null;
    els.forEach((e, i) => {
      const r = m.peak(e, pose);
      if (!(r.P > 0)) return;
      if (!best || r.P > best.P) best = { i, P: r.P, S: r.S, leg: r.leg };
    });
    if (best && m.percent(best.P, ss.inst.gain) < 2) best = null;
    const list = m.echoes(all, pose);
    let mx = 0;
    for (const q of list) mx = Math.max(mx, q.P);
    kept = list.filter((q) => q.P > 1e-4 * mx);
    const pct = best ? m.percent(best.P, ss.inst.gain) : 0;
    const Ss = best ? sOf(best.S) : NaN;
    const M = best ? mem.push(best.P) : mem.get();
    const loc = best ? locate(Ss, Tb, Kst()) : null;
    dd.amp.textContent = best ? `${f1(pct)} ${Cm.fsh}` : Cm.no_echo;
    dd.peak_mem.textContent = M > 0 ? `${f1(m.percent(M, ss.inst.gain))} ${Cm.fsh}` : Cm.none;
    dd.delta.textContent = best && M > 0 ? `${f1(20 * Math.log10(best.P / M))} ${Cm.dB}` : Cm.none;
    dd.S.textContent = best ? `${f1(Ss)} ${Cm.mm}` : Cm.none;
    dd.depth.textContent = loc ? `${f1(loc.d)} ${Cm.mm}` : Cm.none;
    dd.leg.textContent = loc ? D.legs[Math.min(loc.leg, 3) - 1] : Cm.none;
    dd.leg.style.color = loc ? LEG_C[Math.min(loc.leg, 3) - 1] : '';

    const pts = ss.rec.dac;
    const Smax = SmaxSt();
    dds.plate.textContent = `${cfg.plate_t_mm} ${Cm.mm}`;
    dds.smax.textContent = `${f1(Smax)} ${Cm.mm}`;
    const enough = pts.length >= cfg.min_points;
    const covered = enough && Math.max(...pts.map((p) => p.S)) >= Smax;
    const elPct = covered ? pctOf(curveDb(pts, Smax) + lines.EL) : NaN;
    dds.el_at.textContent = Number.isFinite(elPct) ? `${f1(elPct)} ${Cm.fsh}` : enough ? D.no_cover : D.min_points;
    dds.el_at.classList.toggle('ok', elPct >= cfg.el_min_percent);
    dds.el_at.classList.toggle('bad', elPct < cfg.el_min_percent);
    dds.transverse.textContent = `${f1(ss.inst.gain + ctx.std.items.transverse_plus.plus_dB)} ${Cm.dB}`;
    cur = { best: best && { ...best, hole: blk.holes[best.i], Ss, pct }, elPct, Smax, enough, covered };
    renderTable();
    sc.refresh();
    sum();
    help?.tick();
  }

  function addPoint() {
    const b = cur.best;
    if (!b) { flash(msg, Cm.no_echo, 'bad'); return; }
    if (b.pct > 100) { flash(msg, Cm.saturated, 'bad'); return; }
    const A = 20 * Math.log10(b.pct / ref.percent_fsh) - (ss.inst.gain - ref.gain_dB);
    const tp = holePeak(m, b.hole.z_mm, b.leg, Tb, blk.hole_length_mm, blk.hole_phi_mm);
    const key = `${b.i}-${b.leg}`;
    ss.rec.dac = ss.rec.dac.filter((p) => p.key !== key);
    ss.rec.dac.push({ key, depth: b.hole.z_mm, leg: b.leg, S: b.Ss, A, trueA: 20 * Math.log10(tp.P / m.pRef()) });
    ss.rec.scan = null;
    flash(msg, `${D.depth} ${b.hole.z_mm} · ${D.legs[b.leg - 1]} · ${f1(A)} ${Cm.dB}`, Math.abs(A - 20 * Math.log10(tp.P / m.pRef())) <= 1 ? 'ok' : 'bad');
    update();
  }

  function recordScan() {
    if (!cur.enough) { flash(msg, D.min_points, 'bad'); return; }
    if (!cur.covered) { flash(msg, D.no_cover, 'bad'); return; }
    const SmaxTrue = maxPath(cfg.plate_t_mm, cfg.legs, m.p.K);
    const Gtrue = scanGain(m.dacDb(SmaxTrue), row, ref, cfg.el_min_percent);
    const ok = ss.inst.gain >= Gtrue - 0.5;
    ss.rec.scan = { gain: ss.inst.gain, Gtrue, ok };
    flash(msg, `${X.summary.scan} ${f1(ss.inst.gain)} ${Cm.dB}`, ok ? 'ok' : 'bad');
    update();
  }

  const api = {
    add: addPoint,
    scan: recordScan,
    set(v) {
      if (v.dir != null) { ss.dacDir = v.dir; dirSeg.set(String(v.dir)); }
      if (v.px != null) ss.px.dac = v.px;
      if (v.gain != null) ss.inst.gain = v.gain;
      update();
      sc.sync();
    },
    state: () => ({ ...cur, px: ss.px.dac, dir: ss.dacDir, rec: ss.rec, sample: ss.s, scope: sc.state() }),
  };

  help = createCalibHelp({
    ctl, stage: P.tipHost, text: X, topic: 'dac',
    items: X.guide.dac,
    onTopicDone: () => ctx.onTopicDone?.('dac'),
    checks: () => ({
      dir: true,
      peak: !!ss.inst.peak || ss.rec.dac.length > 0,
      holes: ss.rec.dac.length >= cfg.min_points && (!!cur?.covered || ss.rec.scan != null),
      scan: !!ss.rec.scan,
    }),
    demo: async (d) => {
      carryCalib(ss, 'dac');
      B.view('probe');
      await d.wait(300);
      if (!ss.inst.peak) {
        sc.press('key__peak');
        await d.wait(250);
      }
      ss.rec.dac = [];
      ss.rec.scan = null;
      // Holes near the left end are reached facing left, the others facing right.
      const dirOf = (h) => (h.x_mm < Lb / 2 ? -1 : 1);
      const specs = angleRules.dac.points
        .map((spec) => ({ spec, hole: blk.holes.find((h) => h.z_mm === spec.hole_depth_mm) }))
        .filter((o) => o.hole)
        .sort((a, b) => dirOf(a.hole) - dirOf(b.hole) || a.spec.hole_depth_mm - b.spec.hole_depth_mm || a.spec.leg - b.spec.leg);
      for (const { spec, hole: hi } of specs) {
        if (!d.token()) throw new Error('cancel');
        const i = blk.holes.indexOf(hi);
        if (ss.dacDir !== dirOf(hi)) {
          api.set({ dir: dirOf(hi) });
          sc.resetPeak();
          mem.reset();
          await d.wait(250);
        }
        const phi = ss.dacDir < 0 ? Math.PI : 0;
        let best = { P: 0, px: ss.px.dac };
        const lo = clamp(10);
        const hiPx = clamp(Lb - 10);
        for (let px = lo; px <= hiPx; px += 1) {
          const r = m.peak(els[i], { px, py: 0, phi }, Tb, [spec.leg]);
          if (r.P > best.P) best = { P: r.P, px, ...r };
        }
        const from = Math.max(lo, best.px - 12);
        await d.lerp(ss.px.dac, from, 600, (x) => api.set({ px: clamp(Math.round(x * 2) / 2) }));
        await sweepMax(d, {
          from, to: Math.min(hiPx, best.px + 12), step: 0.5, ms: 1300,
          set: (x) => api.set({ px: clamp(Math.round(x * 2) / 2) }),
          read: () => {
            const st = api.state();
            return st.best && st.best.i === i && st.best.leg === spec.leg ? st.best.pct : (st.best?.pct || 0) * 0.01;
          },
        });
        // Fine settle on the precomputed peak.
        api.set({ px: clamp(best.px) });
        await d.wait(180);
        B.view('screen');
        await d.wait(180);
        sc.press('key__auto_gain');
        await d.wait(350);
        // Keep amplitude under 100% for recording.
        while (api.state().best?.pct > 98 && d.token()) {
          api.set({ gain: ss.inst.gain - 1 });
          await d.wait(40);
        }
        api.add();
        await d.wait(280);
        B.view('probe');
        await d.wait(120);
      }
      const SmaxTrue = maxPath(cfg.plate_t_mm, cfg.legs, m.p.K);
      const Gtrue = scanGain(m.dacDb(SmaxTrue), row, ref, cfg.el_min_percent);
      // EL at Smax on the recorded curve must reach el_min_percent.
      const Gcurve = ref.gain_dB + 20 * Math.log10(cfg.el_min_percent / ref.percent_fsh) - (curveDb(ss.rec.dac, SmaxSt()) + lines.EL);
      const Gset = Math.ceil(Math.max(Gtrue, Gcurve) * 10) / 10;
      await d.lerp(ss.inst.gain, Gset, 700, (g) => api.set({ gain: Math.round(g * 10) / 10 }));
      api.set({ gain: Gset });
      await d.wait(250);
      B.view('system');
      await d.wait(200);
      api.scan();
    },
  });
  update();
  return {
    stop: () => { help?.stop(); stopKeys(); P.stop(); },
    ...api,
  };
}

export const CALIB_TOPICS = ['index', 'time', 'kval', 'dac'];

// Teacher / self-study: steps before `topic` that were not recorded take the probe's measured values.
function carryCalib(ss, topic) {
  const k = CALIB_TOPICS.indexOf(topic);
  const r = ss.rec;
  if (k > 0 && r.front == null) r.front = Math.round(ss.s.front * 10) / 10;
  if (k > 1 && !r.time) {
    const cal = twoPoint(tof(ss.m, 50), tof(ss.m, 100), 50, 100);
    ss.inst.v = Math.round(cal.v);
    ss.inst.t0 = Math.round(cal.t0 * 100) / 100;
    r.time = { v: ss.inst.v, t0: ss.inst.t0, s50: 50, s100: 100, ok: true };
  }
  if (k > 2 && r.K == null) r.K = Math.round(ss.s.K * 100) / 100;
}

export function renderCalibTopic(topic, main, side, ctx) {
  main.innerHTML = '';
  side.innerHTML = '';
  const ss = session(ctx);
  if (helpAllowed()) carryCalib(ss, topic);
  const redo = () => ctx.rerender(topic);
  let h;
  if (topic === 'index' || topic === 'time') h = renderArc(main, side, ctx, ss, topic, redo);
  else if (topic === 'kval') h = renderK(main, side, ctx, ss, redo);
  else h = renderDac(main, side, ctx, ss, redo);
  return { ...h, session: () => ss };
}

export function resetCalib(ctx, sample) {
  S = null;
  return session(ctx, sample);
}
