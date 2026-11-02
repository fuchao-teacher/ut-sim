// Weld scanning page: 22 mm X80 butt weld, demo or seeded random plate; longitudinal sawtooth scan with
// fore-aft / lateral / swivel / orbital moves and section coverage; transverse oblique-parallel scan; scanning
// runs on the 3D bench (plate overlay, flaw detector, section inset); indication length, nature and table-35 grading with a check against the reference evaluation and a report.
import { C, el, tx, line, defs, button, clear } from './diagrams.js';
import { U6, makeProbe } from './model.js';
import { createWeld } from './weld.js';
import { sampleRules, screenS, screenToTrue, tof, curveDb, maxPath } from './calib.js';
import { calibState } from './calibpage.js';
import { locate, beamDrawS } from './locate.js';
import { make, card, readouts, beamBand, axisPath, LEG_C } from './beam.js';
import { practiceStage } from './practice.js';
import { scopeDefaults } from './scope.js';
import { createCalibHelp, helpAllowed } from './calibhelp.js';
import { NATURES, GRADES, checkMarks, natureOf, systemLength, matchDefect, carryMarks, examTargetSummary, hintZoneOf } from './evaluate.js';
import { drawSeed, scoreExam, prepOk } from './exam.js';
import { openReport } from '../report.js';
import { licenseMark, licensedStudent } from '../license.js';
import { hint, hideHint, showHint } from './hint.js';

const f1 = (v) => v.toFixed(1);
const clampV = (v, a, b) => Math.max(a, Math.min(b, v));
const rad = (d) => (d * Math.PI) / 180;
const HOUSING = { back: 19, half: 11 };
const LINE_C = { DAC: '#e2e8f0', RL: '#f87171', SL: '#fbbf24', EL: '#34d399' };
const RANGE = 125;
const SWIVEL_MAX = 20;
const SKEW_MAX = 10;
const TRANS_X_MAX = 35;
const COV_SWIVEL = 15;
const COV_SWEEP_MAX = 15;
const STEP = { move: 1, fast: 5, turn: 1, turn_fast: 5 };
const SEC = { x0: -40, x1: 40, s: 7, m: 18, top: 26 };
const FACET_NEAR = 2;
const CMP_AXIS = Float64Array.from({ length: 501 }, (_, i) => (RANGE * i) / 500);
const LEARN_MIN = { fa: 20, lat: 20, sw: 10, orb: 10 };
const DEMO_SWING = 12;
const TRANS_ALONG_MIN = 100;
const TRANS_SPAN = 130;
const GHOST_C = ['#22d3ee', '#c084fc'];
const SHOT_W = 480;
const HINT_RADIUS_MM = 40;
const HINT_MS = 8000;
const fillTip = (s, v) => s.replace(/\{(\w+)\}/g, (_, k) => (v[k] ?? `{${k}}`));

const WELDS = new Map();
const SS = { study: null, exam: null };
const EXAM_STORE = 'ut.angle.exam';
const EXAM_FIRST = 'long';
let examBenchPrep = null;
export function setExamBenchPrep(prep) {
  examBenchPrep = prep ? { ...prep } : null;
}

const probeKey = (s) => (s ? `${s.K}:${s.front}:${s.delayDev}` : '');

// Weld model for a probe sample (null: nameplate probe).
export function weldOf(ctx, s = null) {
  const key = probeKey(s);
  let w = WELDS.get(key);
  if (!w) {
    if (WELDS.size > 4) WELDS.clear();
    w = createWeld(s ? sampleRules(ctx.rules, s) : ctx.rules, ctx.cases, ctx.std);
    WELDS.set(key, w);
  }
  return w;
}

// Exam: instrument preset to the nameplate probe; study: carried from the calibration page.
const calOf = (ctx) => (ctx.exam ? null : calibState());
const weldFor = (ctx) => weldOf(ctx, calOf(ctx)?.s ?? null);

// Instrument settings carried from the calibration record; nameplate values where nothing is recorded.
function instOf(ctx) {
  const r = calOf(ctx)?.rec;
  const nom = makeProbe(ctx.rules);
  const minPts = ctx.cal?.dac?.min_points ?? 3;
  return {
    v: r?.time?.v ?? Math.round(nom.cs),
    t0: r?.time?.t0 ?? Math.round(nom.delayUs * 100) / 100,
    K: r?.K ?? nom.K,
    front: r?.front ?? nom.front,
    dac: r && r.dac.length >= minPts ? r.dac : null,
    gain: r?.scan?.gain ?? null,
  };
}

export function caseOf(w, kind, seed) {
  const defs0 = kind === 'demo' ? w.demo() : w.generateCase(seed).defects;
  const built = defs0.map((d, i) => w.buildDefect(d, i));
  return { kind, seed, defs: defs0, built, all: built.flatMap((b) => b.el) };
}

const newSeed = () => 1000 + Math.floor(Math.random() * 9000);

function freshSession(w, cs) {
  const g0 = Math.ceil(w.scanGain() * 10) / 10;
  return {
    wk: w,
    cs,
    long: { side: 1, d: 40, py: 125, sw: 0 },
    trans: { side: 1, x: 0, py: 60, dir: 1, sk: SKEW_MAX },
    gain: { long: g0, trans: Math.round((g0 + w.transPlus) * 10) / 10 },
    g0,
    show: false,
    beam: false,
    marks: [],
    seq: 0,
    sel: -1,
    plate: { level: '', verdict: '' },
    prep: { rough: '', couplant: '' },
    check: null,
    ref: null,
    trail: [],
    cov: null,
    travel: 0,
    sides: new Set(),
    hints: [],
    hintZone: null,
    exam: null,
  };
}

function session(ctx) {
  if (ctx.exam) return SS.exam;
  const w = weldFor(ctx);
  SS.study ??= freshSession(w, caseOf(w, 'demo', 0));
  const ss = SS.study;
  if (ss.wk !== w) {
    ss.wk = w;
    ss.g0 = Math.ceil(w.scanGain() * 10) / 10;
    ss.cov = null;
    ss.ref = null;
  }
  return ss;
}

// Recorded scan sensitivity becomes the working gain once per new record.
function syncGain(ss, w, cal) {
  if (cal.gain == null || ss.gainFrom === cal.gain) return;
  ss.gainFrom = cal.gain;
  ss.gain = { long: cal.gain, trans: Math.round((cal.gain + w.transPlus) * 10) / 10 };
}

// ---------------------------------------------------------------- exam session (seeded plate, log, storage)
function examLog(ss, act, detail = '') {
  if (!ss.exam) return;
  ss.exam.log.push({ at: new Date().toISOString(), act, detail: String(detail) });
  saveExam(ss);
}

function covRatio(ss) {
  const live = ss.cov ? ss.cov.total / (ss.cov.G.nIn * ss.cov.ny) : 0;
  return Math.max(live, ss.exam?.covBase ?? 0);
}

function saveExam(ss) {
  if (!ss.exam) return;
  const { student, t0, log, result, submittedAt } = ss.exam;
  const data = {
    student, seed: ss.cs.seed, t0, log, result, submittedAt, marks: ss.marks, seq: ss.seq, plate: ss.plate, prep: ss.prep,
    travel: ss.travel, sides: [...ss.sides], cov: covRatio(ss), gain: ss.gain, long: ss.long, trans: ss.trans,
    hints: ss.hints ?? [],
  };
  try { localStorage.setItem(EXAM_STORE, JSON.stringify(data)); } catch { /* kept in this page */ }
}

function loadExamData(student) {
  let d = null;
  try { d = JSON.parse(localStorage.getItem(EXAM_STORE) || 'null'); } catch { d = null; }
  if (!d?.seed || (student?.no && d.student?.no !== student.no)) return null;
  return d;
}

function startExam(ctx, student, data = null, gate = null) {
  const seed = data?.seed ?? drawSeed(ctx.tasks.exam.seed_space);
  const w = weldOf(ctx);
  const ss = freshSession(w, caseOf(w, 'random', seed));
  ss.exam = { student: { ...student }, t0: new Date().toISOString(), log: [], result: null, submittedAt: null, covBase: 0 };
  if (data) {
    Object.assign(ss, { marks: data.marks ?? [], seq: data.seq ?? 0, plate: data.plate ?? ss.plate, travel: data.travel ?? 0, sides: new Set(data.sides ?? []), hints: data.hints ?? [] });
    if (data.gain) ss.gain = data.gain;
    if (data.prep) ss.prep = { ...ss.prep, ...data.prep };
    if (data.long) ss.long = data.long;
    if (data.trans) ss.trans = data.trans;
    Object.assign(ss.exam, { t0: data.t0, log: data.log ?? [], result: data.result ?? null, submittedAt: data.submittedAt ?? null, covBase: data.cov ?? 0 });
    if (ss.exam.result) ss.check = ss.exam.result.check;
  } else if (gate?.prep) {
    ss.prep = { rough: gate.prep.rough || '', couplant: gate.prep.couplant || '' };
  }
  SS.exam = ss;
  if (!data) {
    examLog(ss, 'start', `${seed}`);
    if (ss.prep.rough || ss.prep.couplant) {
      const PP = ctx.text?.prep || {};
      const roughLab = PP.rough_opts?.[ss.prep.rough] ?? ss.prep.rough ?? '—';
      const coupLab = PP.couplant_opts?.[ss.prep.couplant] ?? ss.prep.couplant ?? '—';
      examLog(ss, 'prep', `${PP.rough || '粗糙度'} · ${roughLab}`);
      examLog(ss, 'prep', `${PP.couplant || '耦合剂'} · ${coupLab}`);
    }
  }
  return ss;
}

const locked = (ss) => !!ss.exam?.result;

function resetEval(ss) {
  ss.marks = [];
  ss.seq = 0;
  ss.sel = -1;
  ss.plate = { level: '', verdict: '' };
  ss.check = null;
  ss.ref = null;
}

function refEval(ss, w) {
  const key = `${ss.cs.kind}:${ss.cs.seed}`;
  if (!ss.ref || ss.ref.key !== key) ss.ref = { key, ev: w.evaluateCase(ss.cs.defs, ss.cs.built) };
  return ss.ref.ev;
}

const slText = (w, h, trans) => {
  const dv = h - (w.lines.SL - (trans ? w.transPlus : 0));
  return `SL${dv >= 0 ? '+' : '−'}${f1(Math.abs(dv))}`;
};

// Indications carried over from scanning: one per reference indication at or above EL, at its best probe position.
function autoMarks(ss, w) {
  ss.marks = carryMarks(ss.cs.built, refEval(ss, w)).map((m, i) => ({
    ...m, no: i + 1, hText: slText(w, m.h, m.mode === 'trans'), gain: ss.gain[m.mode],
    ends: [null, null], len: null, sys: null, nature: '', grade: '', shot: null,
  }));
  ss.seq = ss.marks.length;
  ss.sel = ss.marks.length ? 0 : -1;
  ss.check = null;
}

function resetCoverage(ss, w) {
  const G = w.coverageGrid();
  const ny = Math.round(w.spec.y_mm[1] - w.spec.y_mm[0]);
  ss.cov = { G, ny, bits: new Uint8Array(ny * G.nx * G.nz), count: new Int32Array(ny), total: 0, last: '', prev: null };
  ss.trail = [];
}

function markCoverage(ss, w, p) {
  const q = ss.cov.prev;
  if (Math.abs(p.sw) > COV_SWIVEL) {
    ss.cov.prev = null;
    return false;
  }
  ss.cov.prev = { side: p.side, d: p.d, py: p.py };
  const dd = q ? p.d - q.d : 0;
  const dy = q ? p.py - q.py : 0;
  if (!q || q.side !== p.side || Math.hypot(dd, dy) > COV_SWEEP_MAX) return markAt(ss, w, p.side, p.d, p.py);
  const n = Math.max(1, Math.ceil(Math.max(Math.abs(dd) / ss.cov.G.step, Math.abs(dy))));
  let changed = false;
  for (let i = 1; i <= n; i++) changed = markAt(ss, w, p.side, q.d + (dd * i) / n, q.py + (dy * i) / n) || changed;
  return changed;
}

function markAt(ss, w, side, d, py) {
  const p = { side, d, py };
  const { G, ny, bits, count } = ss.cov;
  const k = Math.round((p.d - w.dMin) / G.step);
  if (k < 0 || k >= G.ds.length) return false;
  const hw = U6 * w.m.wh(w.sMax / 2);
  const b0 = clampV(Math.floor(p.py - hw), 0, ny - 1);
  const b1 = clampV(Math.floor(p.py + hw), 0, ny - 1);
  const key = `${p.side}:${k}:${b0}:${b1}`;
  if (key === ss.cov.last) return false;
  ss.cov.last = key;
  const mk = G.masks[p.side][k];
  const n = G.nx * G.nz;
  let changed = false;
  for (let b = b0; b <= b1; b++) {
    const off = b * n;
    for (let c = 0; c < n; c++) {
      const v = mk[c];
      if (!v) continue;
      const old = bits[off + c];
      if ((old | v) !== old) {
        if (!old) { count[b]++; ss.cov.total++; }
        bits[off + c] = old | v;
        changed = true;
      }
    }
  }
  return changed;
}

function holdButton(host, label, tip, fn) {
  const b = make('button', 'ag-pad', label);
  b.type = 'button';
  if (tip) b.dataset.tip = tip;
  let timer = null;
  const stop = () => { clearInterval(timer); timer = null; };
  b.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    fn(e.shiftKey);
    stop();
    timer = setInterval(() => fn(e.shiftKey), 90);
  });
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(ev, stop);
  host.appendChild(b);
  return b;
}

function chip(host, label, onClick, cls = '', tip = '') {
  const b = make('button', `ag-chip ${cls}`.trim(), label);
  b.type = 'button';
  if (tip) b.dataset.tip = tip;
  b.addEventListener('click', onClick);
  host.appendChild(b);
  return b;
}

// ---------------------------------------------------------------- page
function renderScan(topic, main, side, ctx) {
  const X = ctx.text;
  const Cm = X.common;
  const w = weldFor(ctx);
  const ss = session(ctx);
  if (!ss.cov) resetCoverage(ss, w);
  const isLong = topic === 'long';
  const t = w.t;
  const capHw = w.spec.cap.half_width_mm;
  const front = w.p.front;
  const ref = ctx.rules.display.ref;
  const [Y0, Y1] = w.spec.y_mm;
  const [XP0, XP1] = w.spec.x_mm;
  const cal = instOf(ctx);
  syncGain(ss, w, cal);
  const gScan = cal.gain ?? ss.g0;
  ss.inst ??= {};
  ss.inst[topic] ??= scopeDefaults({ range: RANGE, v: cal.v, t0: cal.t0, gate: { start: 10, width: RANGE - 15, thr: 20 } });
  const inst = ss.inst[topic];
  inst.v = cal.v;
  inst.t0 = cal.t0;
  // Screen path (instrument v / t0) and true path in the steel.
  const toScreen = (S) => screenS(tof(w.m, S), inst.v, inst.t0);
  const toTrue = (s) => screenToTrue(w.m, s, inst.v, inst.t0);
  const ascanOn = (axis, pose) => w.m.ascan(ss.cs.all, pose, Float64Array.from(axis, toTrue));
  const dacAt = (s) => (cal.dac ? curveDb(cal.dac, s) : w.m.dacDb(toTrue(s)));
  const hOf = (P, s) => (P > 0 && Number.isFinite(s) ? 20 * Math.log10(P / w.m.pRef()) - dacAt(s) : -99);
  const sMaxUsed = maxPath(t, 2, cal.K);
  const frontOff = front - cal.front;

  // ---- head controls, 3D bench, flaw detector
  const PS = practiceStage(main, side, ctx, X.topics[topic]);
  const { ctl, B, sc } = PS;
  let help = null;
  const setGain = (v) => { ss.gain[topic] = Math.round(clampV(v, 0, 90) * 10) / 10; sc.sync(); schedule(); };
  ss.secOn ??= false;
  ss.beam = !!ss.beam;
  const Tips = Cm.tips || {};

  // ---- section at the probe y (inset over the bench)
  const inset = make('div', 'ag-sc-inset');
  inset.hidden = !ss.secOn;
  PS.stage.appendChild(inset);

  // Record / section / beam on the bottom bar
  const bRec = make('button', 'ag-chip ag-op-rec', Cm.record);
  bRec.type = 'button';
  bRec.disabled = locked(ss);
  if (Tips.record) bRec.dataset.tip = Tips.record;
  bRec.addEventListener('click', () => record());
  const btnSecText = () => (ss.secOn ? (Cm.section_off || Cm.section) : Cm.section);
  const btnBeamText = () => (ss.beam ? (Cm.beam_off || Cm.beam) : Cm.beam);
  const btnSecTip = () => (ss.secOn ? (Tips.section_off || Tips.section) : Tips.section);
  const btnBeamTip = () => (ss.beam ? (Tips.beam_off || Tips.beam) : Tips.beam);
  const bSec = make('button', 'ag-chip ag-op-sec', btnSecText());
  bSec.type = 'button';
  if (btnSecTip()) bSec.dataset.tip = btnSecTip();
  bSec.classList.toggle('active', ss.secOn);
  bSec.addEventListener('click', () => {
    ss.secOn = !ss.secOn;
    bSec.textContent = btnSecText();
    if (btnSecTip()) bSec.dataset.tip = btnSecTip();
    bSec.classList.toggle('active', ss.secOn);
    inset.hidden = !ss.secOn;
    schedule();
  });
  const bBeam = make('button', 'ag-chip ag-op-beam', btnBeamText());
  bBeam.type = 'button';
  if (btnBeamTip()) bBeam.dataset.tip = btnBeamTip();
  bBeam.classList.toggle('active', ss.beam);
  bBeam.addEventListener('click', () => {
    ss.beam = !ss.beam;
    bBeam.textContent = btnBeamText();
    if (btnBeamTip()) bBeam.dataset.tip = btnBeamTip();
    bBeam.classList.toggle('active', ss.beam);
    schedule();
  });
  // Same region as plate ops (right): record / section / beam before scope + export.
  PS.ctl.prepend(bSec, bBeam);
  if (ss.exam && !locked(ss)) {
    const bEval = make('button', 'ag-chip ag-op-eval', ctx.cardText.exam.go_eval || X.topics.eval);
    bEval.type = 'button';
    if (Tips.go_eval) bEval.dataset.tip = Tips.go_eval;
    bEval.addEventListener('click', () => ctx.rerender?.('eval'));
    PS.ctl.appendChild(bEval);
  }
  PS.barR.prepend(bRec);
  const SW = (SEC.x1 - SEC.x0) * SEC.s + 2 * SEC.m;
  const SH = SEC.top + (t + 2) * SEC.s + 22;
  const SX = (x) => SEC.m + (x - SEC.x0) * SEC.s;
  const SZ = (z) => SEC.top + z * SEC.s;
  const sec = el('svg', { viewBox: `0 0 ${SW} ${SH}`, class: 'dg-svg ag-sc-sec', role: 'img' });
  defs(sec);
  inset.appendChild(sec);
  const clipId = `sc-clip-${topic}`;
  const cp = el('clipPath', { id: clipId }, sec.querySelector('defs'));
  el('rect', { x: SX(SEC.x0), y: SZ(0), width: (SEC.x1 - SEC.x0) * SEC.s, height: t * SEC.s }, cp);
  el('rect', { x: SX(SEC.x0), y: SZ(0), width: (SEC.x1 - SEC.x0) * SEC.s, height: t * SEC.s, fill: C.steel, opacity: 0.92, stroke: C.steelStroke }, sec);
  const f = w.spec.fusion;
  const wp = [[-f.toe_half_width_mm, 0], [-f.waist_half_width_mm, f.waist_depth_mm], [-f.toe_half_width_mm, t], [f.toe_half_width_mm, t], [f.waist_half_width_mm, f.waist_depth_mm], [f.toe_half_width_mm, 0]];
  el('path', { d: `M ${wp.map(([x, z]) => `${SX(x).toFixed(1)} ${SZ(z).toFixed(1)}`).join(' L ')} Z`, fill: '#8a7350', opacity: 0.88, stroke: '#d8b98a', 'stroke-width': 1.2 }, sec);
  const ch = w.spec.cap.height_mm;
  for (const [z0, dz] of [[0, -ch], [t, ch]]) {
    el('path', { d: `M ${SX(-capHw)} ${SZ(z0)} Q ${SX(0)} ${SZ(z0 + 2 * dz)} ${SX(capHw)} ${SZ(z0)} Z`, fill: '#8a7350', opacity: 0.9, stroke: '#d8b98a', 'stroke-width': 1.2 }, sec);
  }
  const side10 = ctx.std.items.detection_zone.beside_fusion_line_mm;
  for (const sg of [-1, 1]) {
    const pts = [0, f.waist_depth_mm, t].map((z) => `${SX(sg * (w.fusionHw(z) + side10)).toFixed(1)} ${SZ(z).toFixed(1)}`);
    el('path', { d: `M ${pts.join(' L ')}`, fill: 'none', stroke: C.good, 'stroke-dasharray': '3 3', 'stroke-width': 1, opacity: 0.7 }, sec);
  }
  const gSecBeam = el('g', { 'clip-path': `url(#${clipId})` }, sec);
  const gSecDef = el('g', {}, sec);
  const gSecTop = el('g', {}, sec);
  const secLabel = tx(sec, SX(SEC.x0), 14, '', { fill: '#e2e8f0', 'font-size': 12, 'font-family': 'Arial, sans-serif' });
  for (const x of [-30, -20, -10, 0, 10, 20, 30]) {
    line(sec, SX(x), SZ(t + ch) + 2, SX(x), SZ(t + ch) + 6, '#94a3b8', 1);
    tx(sec, SX(x), SZ(t + ch) + 16, `${x}`, { fill: '#94a3b8', 'font-size': 9, 'text-anchor': 'middle', 'font-family': 'Arial, sans-serif' });
  }

  // ---- bottom-bar probe pad (views / move / tune / scope); side keeps tips · readouts · records
  const P = X.pad;
  const pad = make('div', 'ag-sc-pad ag-op-pad');
  PS.barM.appendChild(pad);
  const moveBox = make('div', 'ag-sc-padgrp');
  moveBox.appendChild(make('span', 'ag-sc-padlab', P.move));
  const mv = make('div', 'ag-sc-arrows');
  moveBox.appendChild(mv);
  pad.appendChild(moveBox);
  const moveTip = Tips.move || P.keys.move;
  mv.appendChild(make('span'));
  holdButton(mv, P.up, moveTip, (fast) => nudge(0, 1, fast));
  mv.appendChild(make('span'));
  holdButton(mv, P.left, moveTip, (fast) => nudge(-1, 0, fast));
  holdButton(mv, P.down, moveTip, (fast) => nudge(0, -1, fast));
  holdButton(mv, P.right, moveTip, (fast) => nudge(1, 0, fast));
  const rotGroups = isLong ? [['swivel', (s, fast) => turn(s, fast)], ['orbit', (s, fast) => orbit(s, fast)]] : [['skew', (s, fast) => turn(s, fast)]];
  for (const [k, fn] of rotGroups) {
    const g = make('div', 'ag-sc-padgrp');
    g.appendChild(make('span', 'ag-sc-padlab', P[k]));
    const row = make('div', 'ag-sc-rot');
    const tip = Tips[k] || P.keys[k];
    holdButton(row, P[`${k}_ccw`] || P.ccw, tip, (fast) => fn(-1, fast));
    holdButton(row, P[`${k}_cw`] || P.cw, tip, (fast) => fn(1, fast));
    g.appendChild(row);
    pad.appendChild(g);
  }
  const actsBar = make('div', 'ag-sc-padgrp ag-op-acts');
  actsBar.appendChild(make('span', 'ag-sc-padlab', Cm.probe));
  const acts = make('div', 'ag-sc-rot ag-op-acts-row');
  actsBar.appendChild(acts);
  pad.appendChild(actsBar);
  chip(acts, Cm.switch_side, () => switchSide(), '', Tips.switch_side);
  if (!isLong) chip(acts, Cm.switch_dir, () => { help?.cancel(); ss.trans.dir *= -1; clampPose(); schedule(); }, '', Tips.switch_dir);

  // ---- side cards: tip dock → readout / records → pose → plate
  const R = X.read;
  const rd = card(side, Cm.readout);
  const dd = readouts(rd, ['amp', 'S', 'leg', 'l', 'depth', 'x', 'yr', 'weld_side', 'h', 'zone'], R);

  const mc = card(side, Cm.indications);
  const mRow = make('div', 'ag-sc-row');
  chip(mRow, Cm.undo, () => {
    if (locked(ss) || !ss.marks.length) return;
    examLog(ss, 'undo', ss.marks[ss.marks.length - 1].no);
    ss.marks.pop();
    ss.sel = ss.marks.length - 1;
    syncTip();
    ss.check = null;
    renderMarks();
    schedule();
  }, '', Tips.undo);
  Cm.ends.forEach((lab, k) => chip(mRow, lab, () => endpoint(k), '', Tips[`end${k}`]));
  mc.appendChild(mRow);
  if (Cm.ends_hint) mc.appendChild(make('p', 'ag-ev-note', Cm.ends_hint));
  const mTable = make('table', 'ag-media ag-cb-pts');
  mc.appendChild(mTable);

  // ---- exam tip (defect count, steps, zone hint)
  let tipBox = null;
  let tipProg = null;
  let tipBtn = null;
  let tipUsed = null;
  let hintTimer = 0;
  const tipText = X.tip;
  if (ss.exam && tipText) {
    tipBox = make('div', 'ag-tip');
    tipBox.appendChild(make('div', 'ag-tip-head', tipText.title));
    tipBox.appendChild(make('strong', 'ag-tip-count', ''));
    const ol = make('ol', 'ag-tip-steps');
    for (const s of tipText.steps) ol.appendChild(make('li', '', s));
    tipBox.appendChild(ol);
    const row = make('div', 'ag-tip-progress');
    tipProg = make('span', '', '');
    tipUsed = make('span', 'ag-tip-used', '');
    tipBtn = make('button', 'ag-chip ag-tip-hint', tipText.hint);
    tipBtn.type = 'button';
    tipBtn.addEventListener('click', () => showExamHint());
    row.append(tipProg, tipUsed, tipBtn);
    tipBox.appendChild(row);
    side.insertBefore(tipBox, rd);
  }

  ss.prep ??= { rough: '', couplant: '' };

  const probeCard = card(side, Cm.probe);
  const ddP = readouts(probeCard, isLong ? ['side', 'dist', 'y', 'swivel'] : ['side', 'dist', 'y', 'dir', 'skew'], R);

  const plateCard = card(side, Cm.plate);
  const caseRow = make('div', 'ag-sc-row');
  plateCard.appendChild(caseRow);
  const bDemo = chip(caseRow, Cm.demo, () => loadCase('demo'));
  const bRand = chip(caseRow, Cm.random, () => loadCase('random', newSeed()));
  const codeRow = make('label', 'ag-sc-row ag-cb-num');
  const codeIn = Object.assign(document.createElement('input'), { type: 'number', min: 1, max: 99999, step: 1, inputMode: 'numeric' });
  codeRow.append(make('span', '', Cm.code), codeIn);
  chip(codeRow, Cm.load, () => { const v = parseInt(codeIn.value, 10); if (v > 0) loadCase('random', v); });
  plateCard.appendChild(codeRow);
  const bShow = chip(plateCard, Cm.show_defects, () => { ss.show = !ss.show; syncCase(); schedule(); });
  const defTable = make('table', 'ag-media ag-cb-pts ag-sc-def');
  plateCard.appendChild(defTable);
  if (ss.exam) {
    const XE = ctx.cardText.exam;
    caseRow.hidden = true;
    codeRow.hidden = true;
    bShow.hidden = true;
    ss.show = false;
    const dl = make('dl', 'ag-params ag-bm-read');
    for (const [k, v] of [[ctx.cardText.student.name, ss.exam.student.name || Cm.none], [ctx.cardText.student.no, ss.exam.student.no || Cm.none], [ctx.cardText.cases.seed, `${ss.cs.seed}`]]) dl.append(make('dt', '', k), make('dd', '', v));
    plateCard.append(make('p', 'ag-ev-note', XE.plate), dl);
  }

  // ---- leg-1 / leg-2 comparison (teacher / self-study)
  const H = X.help;
  const guided = !ss.exam && helpAllowed();
  const teach = isLong && guided;
  ss.learn ??= { fa: 0, lat: 0, sw: 0, orb: 0 };
  ss.tlearn ??= { dir: {}, side: {} };
  ss.cmp ??= { target: '', rows: {} };
  let cmpSel = null;
  let cmpTable = null;
  let cmpGain = null;
  if (teach) {
    const cc = card(side, H.compare);
    const row = make('label', 'ag-sc-row ag-cb-num');
    cmpSel = selectOf([], '', (v) => { ss.cmp.target = v; });
    row.append(make('span', '', H.target), cmpSel);
    cc.appendChild(row);
    const acts2 = make('div', 'ag-sc-row');
    chip(acts2, H.capture, () => capture());
    chip(acts2, H.clear, () => { ss.cmp.rows = {}; renderCmp(); schedule(); });
    cc.appendChild(acts2);
    cmpTable = make('table', 'ag-media ag-cb-pts');
    cc.appendChild(cmpTable);
  }

  let ddC = null;
  if (isLong) {
    const cc = card(side, Cm.coverage);
    ddC = readouts(cc, ['cov_all', 'cov_here'], R);
    const lg = make('div', 'ag-sc-legend');
    for (const [i, k] of [[0, 0], [1, 1]]) {
      const s = make('span', 'ag-sc-key');
      s.style.setProperty('--c', LEG_C[k]);
      s.textContent = Cm.legs[i];
      lg.appendChild(s);
    }
    cc.appendChild(lg);
    chip(cc, Cm.clear_cov, () => { resetCoverage(ss, w); schedule(); });
  }

  const fc = card(side, Cm.formulas);
  for (const fm of X.formulas[topic]) {
    const b = make('div', 'ag-bm-f');
    const m = make('div', 'ag-math');
    m.innerHTML = ctx.tex(fm.latex);
    b.append(make('span', 'ag-tag', fm.name), m);
    fc.appendChild(b);
  }

  // ---- pose
  function poseOf() {
    if (isLong) {
      const p = ss.long;
      return w.sidePose(p.side, p.d, p.py, p.sw);
    }
    return transPose(ss.trans);
  }
  function transPose(p) {
    const sk = rad(p.sk);
    return { px: p.side * p.x, py: p.py, phi: Math.atan2(p.dir * Math.cos(sk), -p.side * Math.sin(sk)) };
  }
  const transXMin = (sk) => capHw + front * Math.sin(rad(sk)) + HOUSING.half * Math.cos(rad(sk));
  function clampPose() {
    if (isLong) {
      const p = ss.long;
      p.sw = clampV(p.sw, -SWIVEL_MAX, SWIVEL_MAX);
      const a = rad(p.sw);
      const dmin = capHw + front * Math.cos(a) + HOUSING.half * Math.abs(Math.sin(a));
      p.d = clampV(p.d, dmin, w.dMax);
      p.py = clampV(p.py, Y0, Y1);
    } else {
      const p = ss.trans;
      p.sk = clampV(p.sk, 0, SKEW_MAX);
      p.x = clampV(p.x, transXMin(p.sk), TRANS_X_MAX);
      p.py = clampV(p.py, Y0, Y1);
    }
  }
  function setXY(x, y) {
    const p = isLong ? ss.long : ss.trans;
    if (Math.abs(x) > 1e-6) p.side = x > 0 ? 1 : -1;
    if (isLong) p.d = Math.abs(x);
    else p.x = Math.abs(x);
    p.py = y;
    clampPose();
  }
  function nudge(dx, dy, fast) {
    help?.cancel();
    const st = fast ? STEP.fast : STEP.move;
    const pose = poseOf();
    setXY(pose.px + dx * st, pose.py + dy * st);
    ss.learn.fa += Math.abs(dx) * st;
    ss.learn.lat += Math.abs(dy) * st;
    schedule();
  }
  function turn(s, fast) {
    help?.cancel();
    const st = fast ? STEP.turn_fast : STEP.turn;
    if (isLong) ss.long.sw += s * st;
    else ss.trans.sk += s * st;
    ss.learn.sw += st;
    clampPose();
    schedule();
  }
  function orbit(s, fast) {
    help?.cancel();
    ss.learn.orb += fast ? STEP.turn_fast : STEP.turn;
    const p = ss.long;
    const pose = poseOf();
    const L = cur.echo ? cur.echo.l : p.d;
    const cx = pose.px + Math.cos(pose.phi) * L;
    const cy = pose.py + Math.sin(pose.phi) * L;
    const sw = clampV(p.sw + s * (fast ? STEP.turn_fast : STEP.turn), -SWIVEL_MAX, SWIVEL_MAX);
    const np = w.sidePose(p.side, p.d, p.py, sw);
    const nx = cx - Math.cos(np.phi) * L;
    const ny = cy - Math.sin(np.phi) * L;
    if (Math.sign(nx) !== p.side) return;
    p.sw = sw;
    p.d = Math.abs(nx);
    p.py = ny;
    clampPose();
    schedule();
  }
  function switchSide() {
    help?.cancel();
    const p = isLong ? ss.long : ss.trans;
    p.side *= -1;
    clampPose();
    schedule();
  }

  const KEYS = { ArrowUp: [0, 1], ArrowDown: [0, -1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
  const onKey = (e) => {
    if (!ctx.active() || e.ctrlKey || e.metaKey || e.altKey || /input|textarea|select/i.test(e.target.tagName)) return;
    if (KEYS[e.key]) {
      e.preventDefault();
      nudge(...KEYS[e.key], e.shiftKey);
      return;
    }
    const k = e.key.toLowerCase();
    if (k === 'q' || k === 'e') turn(k === 'q' ? -1 : 1, e.shiftKey);
    else if (isLong && (k === 'z' || k === 'c')) orbit(k === 'z' ? -1 : 1, e.shiftKey);
  };
  window.addEventListener('keydown', onKey);

  // ---- case
  function loadCase(kind, seed = 0) {
    help?.cancel();
    ss.cs = caseOf(w, kind, seed);
    ss.cmp = { target: '', rows: {} };
    resetEval(ss);
    resetCoverage(ss, w);
    syncCase();
    renderMarks();
    schedule();
  }
  function syncCase() {
    bDemo.classList.toggle('active', ss.cs.kind === 'demo');
    bRand.classList.toggle('active', ss.cs.kind === 'random');
    codeIn.value = ss.cs.kind === 'random' ? String(ss.cs.seed) : '';
    bShow.classList.toggle('active', ss.show);
    defTable.hidden = !ss.show;
    defTable.innerHTML = '';
    B.setDefects(ss.show ? ss.cs.built : null);
    fillTargets();
    renderCmp();
    if (!ss.show) return;
    const T = X.table;
    const tr = (cells, th) => {
      const r = make('tr');
      cells.forEach((c) => r.appendChild(make(th ? 'th' : 'td', '', c)));
      defTable.appendChild(r);
    };
    tr([T.id, T.type, T.y, T.depth], true);
    for (const { meta } of ss.cs.built) {
      const yr = meta.transverse ? f1(meta.y0) : `${f1(meta.y0)}–${f1(meta.y1)}`;
      tr([meta.id, X.types[meta.type], yr, `${f1(meta.z[0])}–${f1(meta.z[1])}`]);
    }
  }

  function tipSummary() {
    return examTargetSummary(ss.cs.built, refEval(ss, w), ss.marks);
  }
  function syncTip() {
    if (!tipBox) return;
    const sum = tipSummary();
    const n = sum.total;
    tipBox.querySelector('.ag-tip-count').textContent = fillTip(tipText.count, { n });
    tipProg.textContent = fillTip(tipText.progress, { recorded: sum.recorded, n });
    const used = ss.hints?.length || 0;
    tipUsed.textContent = used ? fillTip(tipText.hint_used, { n: used }) : '';
    tipBtn.hidden = sum.complete || locked(ss);
    tipBtn.disabled = locked(ss);
  }
  function showExamHint() {
    if (!ss.exam || locked(ss)) return null;
    const sum = tipSummary();
    if (sum.complete) {
      tipProg.textContent = tipText.hint_none;
      tipBtn.hidden = true;
      return null;
    }
    const next = sum.remaining[0];
    const raw = hintZoneOf(ss.cs.built, next.id, HINT_RADIUS_MM, String(ss.cs.seed));
    if (!raw) return null;
    const zone = {
      x: clampV(raw.x, XP0 + HINT_RADIUS_MM * 0.2, XP1 - HINT_RADIUS_MM * 0.2),
      y: clampV(raw.y, Y0 + HINT_RADIUS_MM * 0.2, Y1 - HINT_RADIUS_MM * 0.2),
      r: HINT_RADIUS_MM,
      id: raw.id,
      until: performance.now() + HINT_MS,
    };
    ss.hintZone = zone;
    (ss.hints ||= []).push({ id: next.id, at: new Date().toISOString() });
    examLog(ss, 'hint', `${ss.hints.length}`);
    clearTimeout(hintTimer);
    hintTimer = setTimeout(() => {
      if (ss.hintZone === zone) ss.hintZone = null;
      schedule();
    }, HINT_MS);
    syncTip();
    schedule();
    return zone;
  }

  // ---- indications
  function renderMarks() {
    mTable.innerHTML = '';
    if (!ss.marks.length) return;
    const T = X.table;
    const tr = (cells, th) => {
      const r = make('tr');
      cells.forEach((c) => r.appendChild(make(th ? 'th' : 'td', '', c)));
      mTable.appendChild(r);
    };
    tr([T.no, T.y, T.x, T.depth, T.h, T.zone, T.len], true);
    ss.marks.forEach((k, i) => {
      const r = make('tr', i === ss.sel ? 'sel' : '');
      for (const c of [`${k.no}`, f1(k.y), f1(k.x), f1(k.depth), k.hText, Cm.zones[k.zone], k.len == null ? Cm.none : f1(k.len)]) r.appendChild(make('td', '', c));
      r.addEventListener('click', () => { ss.sel = i; renderMarks(); schedule(); });
      mTable.appendChild(r);
    });
  }
  function record() {
    if (!cur.echo || locked(ss)) return;
    const e = cur.echo;
    const p = isLong ? ss.long : ss.trans;
    ss.marks.push({
      no: ++ss.seq, y: e.yr, x: e.xr, depth: e.depth, S: e.S, leg: e.leg, h: e.h, hText: e.hText, zone: e.zone, mode: topic, gain: ss.gain[topic],
      pose: isLong ? { side: p.side, d: p.d, py: p.py, sw: p.sw } : { side: p.side, x: p.x, py: p.py, dir: p.dir, sk: p.sk },
      ends: [null, null], len: null, sys: null, nature: '', grade: '', shot: sc.exportCanvas(SHOT_W)?.toDataURL('image/jpeg', 0.8) ?? null,
    });
    ss.sel = ss.marks.length - 1;
    ss.check = null;
    examLog(ss, 'record', `${ss.seq} y ${f1(e.yr)} · ${e.hText}`);
    renderMarks();
    syncTip();
    schedule();
  }
  // Indicated-length end points of the selected mark: echo position along the weld (longitudinal) or across it (transverse).
  function endpoint(k) {
    const mk = ss.marks[ss.sel];
    if (!mk || !cur.echo || locked(ss)) return;
    mk.ends[k] = mk.mode === 'trans' ? cur.echo.xr : cur.echo.yr;
    if (mk.ends[0] != null && mk.ends[1] != null) mk.len = Math.round(Math.abs(mk.ends[1] - mk.ends[0]) * 10) / 10;
    ss.check = null;
    examLog(ss, 'end', `${mk.no} · ${k + 1} · ${f1(mk.ends[k])}`);
    renderMarks();
    schedule();
  }

  // ---- leg comparison
  const cmpDefs = () => ss.cs.built.filter((b) => !b.meta.transverse);
  function fillTargets() {
    if (!cmpSel) return;
    const list = cmpDefs();
    if (!list.some((b) => b.meta.id === ss.cmp.target)) ss.cmp.target = '';
    cmpSel.innerHTML = '';
    for (const { meta } of list) {
      const o = document.createElement('option');
      o.value = meta.id;
      o.textContent = `${meta.id} · ${X.types[meta.type]}`;
      cmpSel.appendChild(o);
    }
    const tg = targetDef();
    if (tg) cmpSel.value = tg.meta.id;
  }
  function targetDef() {
    const list = cmpDefs();
    const hit = list.find((b) => b.meta.id === ss.cmp.target);
    if (hit) return hit;
    const yc = (b) => (b.meta.y0 + b.meta.y1) / 2;
    return list.reduce((a, b) => (!a || Math.abs(yc(b) - ss.long.py) < Math.abs(yc(a) - ss.long.py) ? b : a), null);
  }
  const hTextOf = (h) => slText(w, h, !isLong);
  function storeLeg(leg, St, P) {
    const S = toScreen(St);
    const lc = locate(S, t, cal.K);
    const h = hOf(P, S);
    ss.cmp.rows[leg] = { d: ss.long.d, S, depth: lc.d, P, h, hText: hTextOf(h), trace: ascanOn(CMP_AXIS, poseOf()) };
    renderCmp();
    schedule();
  }
  function capture() {
    help?.cancel();
    const e = cur.echo;
    if (!e || e.leg < 1 || e.leg > 2) return;
    storeLeg(e.leg, e.St, e.P);
  }
  function renderCmp() {
    if (!cmpTable) return;
    cmpGain = ss.gain[topic];
    cmpTable.innerHTML = '';
    const rows = ss.cmp.rows;
    if (!rows[1] && !rows[2]) return;
    const tr = (cells, th, color) => {
      const r = make('tr');
      cells.forEach((c, i) => {
        const td = make(th ? 'th' : 'td', '', c);
        if (i === 0 && color) td.style.color = color;
        r.appendChild(td);
      });
      cmpTable.appendChild(r);
    };
    tr(H.head, true);
    for (const leg of [1, 2]) {
      const r = rows[leg];
      if (!r) continue;
      const pct = w.m.percent(r.P, cmpGain);
      tr([Cm.legs[leg - 1], f1(r.d), f1(r.S), f1(r.depth), pct > 100 ? Cm.over : f1(pct), r.hText], false, GHOST_C[leg - 1]);
    }
    if (rows[1] && rows[2]) {
      const sg = (v) => `${v >= 0 ? '+' : '−'}${f1(Math.abs(v))}`;
      const a = rows[1];
      const b = rows[2];
      tr([H.delta, sg(b.d - a.d), sg(b.S - a.S), sg(b.depth - a.depth), `${sg(20 * Math.log10(b.P / a.P))} ${Cm.dB}`, sg(b.h - a.h)]);
    }
  }

  // ---- flaw detector
  const linesOff = () => (isLong ? 0 : w.transPlus);
  function curves(gain) {
    const g = gain - linesOff();
    const pRef = w.m.pRef();
    const Rg = inst.range;
    const out = [];
    if (sMaxUsed <= Rg) out.push({ pts: [[sMaxUsed, 0], [sMaxUsed, 100]], color: '#64748b', dash: [4, 4], width: 1 });
    for (const [k, off] of [['RL', w.lines.RL], ['SL', w.lines.SL], ['EL', w.lines.EL]]) {
      const pts = [];
      for (let i = 0; i <= 100; i++) {
        const s = (Rg * i) / 100;
        pts.push([s, w.m.percent(pRef * 10 ** ((dacAt(s) + off) / 20), g)]);
      }
      out.push({ pts, color: LINE_C[k], width: 1.3, label: k });
    }
    if (teach) {
      for (const leg of [1, 2]) {
        const r = ss.cmp.rows[leg];
        if (!r) continue;
        const pts = Array.from(CMP_AXIS, (s, i) => [s, w.m.percent(r.trace[i], gain)]);
        out.push({ pts, color: GHOST_C[leg - 1], dash: [5, 3], width: 1.2 });
      }
    }
    return out;
  }
  B.view('system');
  PS.start({
    inst,
    gain: { get: () => ss.gain[topic], set: (v) => { ss.gain[topic] = v; } },
    limits: { gain: [0, 90] },
    lock: { v: true, t0: true },
    signal: (axis, gain) => Float64Array.from(ascanOn(axis, poseOf()), (r) => w.m.percent(r, gain)),
    noise: (gain) => ctx.rules.display.noise_percent_at_ref_gain * 10 ** ((gain - ref.gain_dB) / 20),
    curves,
    evalLine: (s, gain) => w.m.percent(w.m.pRef() * 10 ** ((dacAt(s) + w.lines.EL) / 20), gain - linesOff()),
    evalSpan: sMaxUsed,
    depthOf: (S) => locate(S, t, cal.K).d,
    marks: (gain) => (cur.echo ? [{ mm: cur.echo.S, pct: w.m.percent(cur.echo.P, gain), label: f1(cur.echo.S), color: '#38bdf8' }] : []),
    onChange: (kind) => { if (kind === 'gain') schedule(); },
    onRecord: locked(ss) ? null : () => record(),
    recordLabel: Cm.record,
    onView: (k) => {
      if (k !== 'cutaway') return;
      // Cutaway looks at the probe-y face: turn on the section inset and reveal defects (study).
      if (!ss.secOn) {
        ss.secOn = true;
        bSec.classList.toggle('active', true);
        inset.hidden = false;
      }
      if (!ss.exam && !ss.show) {
        ss.show = true;
        syncCase();
      }
      schedule();
    },
    drag: (x, y, phase) => {
      help?.cancel();
      if (phase === 'start') ss.cov.prev = null;
      const p0 = poseOf();
      setXY(x, y);
      const p1 = poseOf();
      if (isLong) {
        ss.learn.fa += Math.abs(Math.abs(p1.px) - Math.abs(p0.px));
        ss.learn.lat += Math.abs(p1.py - p0.py);
      }
      schedule();
    },
  });

  // ---- drawing on the plate surface
  function drawPlate(pose) {
    B.drawOverlay((c, o) => {
      const X0 = o.X;
      const Yp = o.Y;
      const s = o.s;
      c.lineWidth = s * 0.6;
      c.fillStyle = 'rgba(30, 41, 59, 0.85)';
      c.font = `600 ${5 * s}px Arial, sans-serif`;
      c.textBaseline = 'middle';
      for (let y = Y0; y <= Y1; y += 50) {
        c.fillRect(X0(XP0), Yp(y) - 0.3 * s, 4 * s, 0.6 * s);
        c.fillText(`${y}`, X0(XP0) + 5 * s, Yp(y) + (y === Y0 ? 3 * s : y === Y1 ? -3 * s : 0));
      }
      if (isLong && ss.trail.length > 1) {
        c.strokeStyle = 'rgba(255, 255, 255, 0.75)';
        c.lineWidth = 0.5 * s;
        c.beginPath();
        ss.trail.forEach(([x, y], i) => (i ? c.lineTo(X0(x), Yp(y)) : c.moveTo(X0(x), Yp(y))));
        c.stroke();
      }
      c.strokeStyle = 'rgba(250, 204, 21, 0.8)';
      c.lineWidth = 0.4 * s;
      c.setLineDash([2 * s, 2 * s]);
      c.beginPath();
      c.moveTo(X0(XP0), Yp(pose.py));
      c.lineTo(X0(XP1), Yp(pose.py));
      c.stroke();
      c.setLineDash([]);
      if (ss.show) {
        for (const { el: els, meta } of ss.cs.built) {
          const xs = els.map((e) => e.x);
          const xa = Math.min(...xs);
          const xb = Math.max(...xs);
          c.fillStyle = meta.not_allowed ? 'rgba(239, 68, 68, 0.75)' : 'rgba(245, 158, 11, 0.75)';
          c.fillRect(X0(xa) - 1.5, Yp(meta.y0) - 1.5, Math.max(3, (xb - xa) * s + 3), Math.max(3, (meta.y1 - meta.y0) * s + 3));
          c.font = `700 ${5 * s}px Arial, sans-serif`;
          c.fillText(meta.id, X0(xb) + 4 * s, Yp((meta.y0 + meta.y1) / 2));
        }
      }
      ss.marks.forEach((k, i) => {
        const x = X0(k.x);
        const y = Yp(k.y);
        const col = i === ss.sel ? '#facc15' : '#e879f9';
        c.strokeStyle = col;
        c.fillStyle = col;
        c.lineWidth = 0.8 * s;
        c.beginPath();
        c.moveTo(x - 3 * s, y - 3 * s);
        c.lineTo(x + 3 * s, y + 3 * s);
        c.moveTo(x - 3 * s, y + 3 * s);
        c.lineTo(x + 3 * s, y - 3 * s);
        c.stroke();
        c.font = `700 ${5 * s}px Arial, sans-serif`;
        c.fillText(`${k.no}`, x + 4 * s, y - 4 * s);
        if (i !== ss.sel) return;
        c.lineWidth = 0.9 * s;
        for (const v of k.ends) {
          if (v == null) continue;
          c.beginPath();
          if (k.mode === 'trans') { c.moveTo(X0(v), y - 5 * s); c.lineTo(X0(v), y + 5 * s); } else { c.moveTo(x - 5 * s, Yp(v)); c.lineTo(x + 5 * s, Yp(v)); }
          c.stroke();
        }
      });
      const hz = ss.hintZone;
      if (hz && performance.now() < hz.until) {
        c.fillStyle = 'rgba(249, 115, 22, 0.3)';
        c.strokeStyle = 'rgba(249, 115, 22, 0.95)';
        c.lineWidth = 1.2 * s;
        c.beginPath();
        c.ellipse(X0(hz.x), Yp(hz.y), hz.r * s, hz.r * s, 0, 0, Math.PI * 2);
        c.fill();
        c.stroke();
      }
    });
  }

  function coverageAt(py) {
    const { G: g, ny, bits } = ss.cov;
    const n = g.nx * g.nz;
    const b = clampV(Math.floor(py), 0, ny - 1);
    let here = 0;
    for (let c = 0; c < n; c++) {
      if (!g.inside[c]) continue;
      if (bits[b * n + c]) here++;
    }
    return { here: here / g.nIn, all: ss.cov.total / (g.nIn * ny) };
  }

  function drawSection(pose, echo) {
    clear(gSecBeam);
    clear(gSecDef);
    clear(gSecTop);
    const cp = Math.cos(pose.phi);
    const sp = Math.sin(pose.phi);
    const cs = isLong ? Math.abs(cp) : 1;
    const skew = isLong && Math.abs(sp) > 1e-3;
    const yMid = skew ? pose.py - (sp * pose.px) / cp : pose.py;
    secLabel.textContent = skew
      ? `${Cm.section} y = ${f1(pose.py)} → ${f1(yMid)} ${Cm.mm}`
      : `${Cm.section} y = ${f1(pose.py)} ${Cm.mm}`;
    const labelRight = pose.px < 0;
    secLabel.setAttribute('x', SX(labelRight ? SEC.x1 : SEC.x0));
    secLabel.setAttribute('text-anchor', labelRight ? 'end' : 'start');
    const MX = SX;
    const MY = SZ;
    const pSide = isLong ? ss.long.side : ss.trans.side;
    if (isLong && ss.beam) {
      const Sd = beamDrawS({ T: t, K: w.p.K, px: pose.px, range: toTrue(inst.range), echoS: echo?.St });
      const legs = Sd > t * Math.sqrt(1 + w.p.K ** 2) + 1e-6 ? 2 : 1;
      beamBand(gSecBeam, w.m, pose.px, -pSide, t, Sd, MX, MY, { opacity: 0.18, cs });
      axisPath(gSecBeam, pose.px, -pSide, t, w.p.K, Sd, MX, MY, 1.4, legs, cs);
    }
    const off = isLong
      ? (e) => Math.abs((e.y - pose.py) * cp - (e.x - pose.px) * sp)
      : (e) => Math.abs(e.y - pose.py);
    const xEdge = clampV(pose.px, SEC.x0 + 2, SEC.x1 - 2);
    const xi = SX(xEdge);
    const out = Math.abs(pose.px) > SEC.x1;
    el('path', { d: `M ${xi} ${SZ(0) - 3} l -5 -8 h 10 z`, fill: C.accent }, gSecTop);
    tx(gSecTop, xi + (pose.px > 0 ? -8 : 8), SZ(0) - 6, `${out ? (pose.px > 0 ? '→ ' : '← ') : ''}${f1(Math.abs(pose.px))}`, { fill: C.accent, 'font-size': 10, 'text-anchor': pose.px > 0 ? 'end' : 'start', 'font-family': 'Arial, sans-serif' });
    // Study: show defect cross-section at probe y whenever the section inset is on.
    // Exam: only after「显示缺陷」or cutaway reveal.
    const showSecDefs = ss.show || (!ss.exam && ss.secOn);
    if (showSecDefs) {
      for (const { el: els, meta } of ss.cs.built) {
        const col = meta.not_allowed ? '#f87171' : '#fbbf24';
        if (els[0].kind !== w.kinds.FACET) {
          const seen = new Set();
          for (const e of els) {
            if (off(e) > (e.dl ? e.dl / 2 : e.D / 2) + 1) continue;
            const k = `${e.x.toFixed(2)}:${e.z.toFixed(2)}`;
            if (seen.has(k)) continue;
            seen.add(k);
            el('circle', { cx: SX(e.x), cy: SZ(e.z), r: Math.max(2.5, (e.D / 2) * SEC.s), fill: col, 'fill-opacity': 0.75, stroke: '#fff7ed', 'stroke-width': 1.8 }, gSecDef);
          }
          continue;
        }
        const groups = meta.type === 'lop' ? [els.filter((e) => e.x < 0), els.filter((e) => e.x >= 0)] : [els];
        for (const g of groups) {
          if (!g.length) continue;
          const vmin = Math.min(...g.map(off));
          if (vmin > FACET_NEAR) continue;
          const row = g.filter((e) => off(e) <= vmin + 0.3);
          if (meta.transverse) {
            const [xa, xb] = meta.x;
            const [za, zb] = meta.z;
            if (!skew) {
              el('rect', { x: SX(xa), y: SZ(za), width: (xb - xa) * SEC.s, height: (zb - za) * SEC.s, fill: col, 'fill-opacity': 0.75, stroke: '#fff7ed', 'stroke-width': 1.8 }, gSecDef);
            } else {
              const xc = pose.px + (cp * (meta.y0 - pose.py)) / sp;
              if (xc >= xa && xc <= xb) line(gSecDef, SX(xc), SZ(za), SX(xc), SZ(zb), col, 2.6);
            }
            continue;
          }
          row.sort((a, b) => a.z - b.z);
          const a = row[0];
          const b = row[row.length - 1];
          const L = Math.hypot(b.x - a.x, b.z - a.z);
          const ext = meta.type === 'toe_crack' ? 0.5 : 0.25;
          const ux = L > 1e-6 ? (b.x - a.x) / L : 0;
          const uz = L > 1e-6 ? (b.z - a.z) / L : 1;
          const pts = [[a.x - ux * ext, a.z - uz * ext], ...row.map((e) => [e.x, e.z]), [b.x + ux * ext, b.z + uz * ext]];
          el('path', {
            d: `M ${pts.map(([x, z]) => `${SX(x).toFixed(1)} ${SZ(z).toFixed(1)}`).join(' L ')}`,
            fill: 'none', stroke: col, 'stroke-width': 2.6, 'stroke-linecap': 'round', 'stroke-linejoin': 'round',
          }, gSecDef);
        }
      }
    }
    for (const k of ss.marks) {
      if (off({ x: k.x, y: k.y }) > 2) continue;
      const x = SX(k.x);
      const y = SZ(k.depth);
      line(gSecTop, x - 4, y - 4, x + 4, y + 4, C.inc, 1.8);
      line(gSecTop, x - 4, y + 4, x + 4, y - 4, C.inc, 1.8);
    }
    if (echo && echo.xr >= SEC.x0 && echo.xr <= SEC.x1 && (isLong || Math.abs(echo.yr - pose.py) < 3)) {
      el('circle', { cx: SX(echo.xr), cy: SZ(echo.depth), r: 4, fill: 'none', stroke: C.accent, 'stroke-width': 2 }, gSecTop);
    }
    if (B.viewKey === 'cutaway') B.setCutSection(paintCutFace);
  }

  // 3D cutaway face: opaque plate + weld + defect 2D shapes at probe y (same geometry as the inset).
  function paintCutFace(c, W, H, py) {
    const x0 = SEC.x0;
    const x1 = SEC.x1;
    const pad = 18;
    const mx = (x) => pad + ((x - x0) / (x1 - x0)) * (W - 2 * pad);
    const mz = (z) => pad + (z / t) * (H - 2 * pad);
    c.fillStyle = '#0f172a';
    c.fillRect(0, 0, W, H);
    c.fillStyle = '#b4bcc6';
    c.fillRect(mx(x0), mz(0), mx(x1) - mx(x0), mz(t) - mz(0));
    c.strokeStyle = '#64748b';
    c.lineWidth = 2;
    c.strokeRect(mx(x0), mz(0), mx(x1) - mx(x0), mz(t) - mz(0));
    c.beginPath();
    wp.forEach(([x, z], i) => (i ? c.lineTo(mx(x), mz(z)) : c.moveTo(mx(x), mz(z))));
    c.closePath();
    c.fillStyle = '#8a7350';
    c.fill();
    c.strokeStyle = '#d8b98a';
    c.stroke();
    for (const [z0, dz] of [[0, -ch], [t, ch]]) {
      c.beginPath();
      c.moveTo(mx(-capHw), mz(z0));
      c.quadraticCurveTo(mx(0), mz(z0 + 2 * dz), mx(capHw), mz(z0));
      c.closePath();
      c.fillStyle = '#8a7350';
      c.fill();
      c.stroke();
    }
    const show = ss.show || (!ss.exam && ss.secOn);
    if (!show) return;
    for (const { el: els, meta } of ss.cs.built) {
      const col = meta.not_allowed ? '#ef4444' : '#f59e0b';
      const near = (e) => Math.abs(e.y - py) <= (e.dl ? e.dl / 2 : e.D / 2) + 1.2;
      if (els[0].kind !== w.kinds.FACET) {
        const seen = new Set();
        for (const e of els) {
          if (!near(e)) continue;
          const k = `${e.x.toFixed(1)}:${e.z.toFixed(1)}`;
          if (seen.has(k)) continue;
          seen.add(k);
          const r = Math.max(4, (e.D / 2) * ((W - 2 * pad) / (x1 - x0)));
          c.beginPath();
          c.arc(mx(e.x), mz(e.z), r, 0, Math.PI * 2);
          c.fillStyle = col;
          c.globalAlpha = 0.85;
          c.fill();
          c.globalAlpha = 1;
          c.strokeStyle = '#fff7ed';
          c.lineWidth = 2;
          c.stroke();
        }
        continue;
      }
      if (meta.transverse) {
        if (py < meta.y0 - 1 || py > meta.y1 + 1) continue;
        const [xa, xb] = meta.x;
        const [za, zb] = meta.z;
        c.fillStyle = col;
        c.globalAlpha = 0.8;
        c.fillRect(mx(xa), mz(za), mx(xb) - mx(xa), mz(zb) - mz(za));
        c.globalAlpha = 1;
        c.strokeStyle = '#fff7ed';
        c.lineWidth = 2;
        c.strokeRect(mx(xa), mz(za), mx(xb) - mx(xa), mz(zb) - mz(za));
        continue;
      }
      const hit = els.filter((e) => Math.abs(e.y - py) <= FACET_NEAR + 0.5);
      if (hit.length < 2) continue;
      hit.sort((a, b) => a.z - b.z);
      c.beginPath();
      hit.forEach((e, i) => (i ? c.lineTo(mx(e.x), mz(e.z)) : c.moveTo(mx(e.x), mz(e.z))));
      c.strokeStyle = col;
      c.lineWidth = 4;
      c.lineCap = 'round';
      c.stroke();
    }
    c.fillStyle = '#e2e8f0';
    c.font = '600 16px Arial, sans-serif';
    c.fillText(`y = ${f1(py)} mm`, pad, H - 8);
  }
  B.setCutSection(paintCutFace);

  // ---- update
  let cur = { echo: null };
  let raf = 0;
  let prevTY = null;
  function schedule() {
    if (raf) return;
    raf = requestAnimationFrame(() => { raf = 0; update(); });
  }

  function update() {
    clampPose();
    const pose = poseOf();
    const gain = ss.gain[topic];
    B.setPose({ ...pose, shift: front - ctx.rules.probe.front_length_mm });

    const pk = w.m.peak(ss.cs.all, pose);
    const pct = w.m.percent(pk.P, gain);
    const Ss = pk.P > 0 ? toScreen(pk.S) : NaN;
    const bx = pose.px + Math.cos(pose.phi) * frontOff;
    const by = pose.py + Math.sin(pose.phi) * frontOff;
    let echo = null;
    if (pk.P > 0 && pct >= 5 && Ss <= inst.range) {
      const lc = locate(Ss, t, cal.K);
      const xr = bx + Math.cos(pose.phi) * lc.l;
      const yr = by + Math.sin(pose.phi) * lc.l;
      const h = hOf(pk.P, Ss);
      echo = {
        S: Ss, St: pk.S, P: pk.P, pct, l: lc.l, depth: lc.d, leg: lc.leg, xr, yr, h,
        hText: hTextOf(h), zone: w.zone(h, !isLong),
      };
    }
    cur = { echo, pose };
    const Sd = beamDrawS({ T: t, K: w.p.K, px: pose.px, range: toTrue(inst.range), echoS: echo?.St });
    B.setBeam(ss.beam ? { m: w.m, T: t, S: Sd } : null);

    if (isLong) {
      const p = ss.long;
      const last = ss.trail[ss.trail.length - 1];
      if (!last || Math.hypot(last[0] - pose.px, last[1] - pose.py) >= 0.5) {
        ss.trail.push([pose.px, pose.py]);
        if (ss.trail.length > 3000) ss.trail.shift();
      }
      if (markCoverage(ss, w, p)) ss.sides.add(p.side);
    } else {
      if (prevTY != null) ss.travel += Math.min(Math.abs(pose.py - prevTY), COV_SWEEP_MAX);
      prevTY = pose.py;
      if (ss.trans.sk > 0) {
        ss.tlearn.dir[ss.trans.dir] = true;
        ss.tlearn.side[ss.trans.side] = true;
      }
    }
    drawPlate(pose);
    drawSection(pose, echo);
    let cov = null;
    if (isLong) cov = coverageAt(pose.py);
    sc.refresh();

    const pSide = isLong ? ss.long.side : ss.trans.side;
    ddP.side.textContent = pSide > 0 ? Cm.right : Cm.left;
    ddP.dist.textContent = `${f1(Math.abs(bx))} ${Cm.mm}`;
    ddP.y.textContent = `${f1(by)} ${Cm.mm}`;
    if (isLong) ddP.swivel.textContent = `${ss.long.sw.toFixed(0)}${Cm.deg}`;
    else {
      ddP.dir.textContent = ss.trans.dir > 0 ? Cm.toward_plus : Cm.toward_minus;
      ddP.skew.textContent = `${ss.trans.sk.toFixed(0)}${Cm.deg}`;
    }
    const e = echo;
    dd.amp.textContent = e ? `${e.pct > 100 ? Cm.over : f1(e.pct)} ${Cm.fsh}` : Cm.no_echo;
    dd.S.textContent = e ? `${f1(e.S)} ${Cm.mm}` : Cm.none;
    dd.leg.textContent = e ? Cm.legs[Math.min(e.leg, 3) - 1] : Cm.none;
    dd.leg.style.color = e ? LEG_C[Math.min(e.leg, 3) - 1] : '';
    dd.l.textContent = e ? `${f1(e.l)} ${Cm.mm}` : Cm.none;
    dd.depth.textContent = e ? `${f1(e.depth)} ${Cm.mm}` : Cm.none;
    dd.x.textContent = e ? `${f1(e.xr)} ${Cm.mm}` : Cm.none;
    dd.yr.textContent = e ? `${f1(e.yr)} ${Cm.mm}` : Cm.none;
    dd.weld_side.textContent = e ? (Math.abs(e.xr) < 0.5 ? Cm.centre : e.xr > 0 ? Cm.right : Cm.left) : Cm.none;
    dd.h.textContent = e ? `${e.hText} ${Cm.dB}` : Cm.none;
    dd.zone.textContent = e ? Cm.zones[e.zone] : Cm.none;
    dd.zone.className = e ? `ag-sc-z${e.zone}` : '';
    if (ddC && cov) {
      ddC.cov_all.textContent = `${f1(cov.all * 100)} ${Cm.fsh}`;
      ddC.cov_here.textContent = `${f1(cov.here * 100)} ${Cm.fsh}`;
    }
    if (cmpTable && cmpGain !== gain) renderCmp();
    help?.tick();
  }

  // ---- one-click scan demo
  function say(text) {
    const m = PS.msg;
    m.textContent = text;
    m.classList.remove('ok', 'bad', 'show');
    void m.offsetWidth;
    m.classList.add('show');
  }
  const setLong = (v) => {
    for (const [k, x] of Object.entries(v)) if (Number.isFinite(x)) ss.long[k] = x;
    clampPose();
    schedule();
  };
  const stepName = (id) => H.items.find((it) => it.id === id)?.do ?? '';

  // Leg-restricted peak search along the fore-aft line through the defect centre, both sides.
  function planFor(tg) {
    const yc = (tg.meta.y0 + tg.meta.y1) / 2;
    const ds = w.dSteps(1);
    const best = (side, leg) => {
      const at = (d) => {
        const r = w.m.peak(tg.el, w.sidePose(side, d, yc), t, [leg]);
        return { d, S: r.S, P: r.P, h: w.hDb(r.P, r.S) };
      };
      let b = ds.reduce((a, d) => { const r = at(d); return r.h > a.h ? r : a; }, { h: -99, d: ds[0], S: NaN, P: 0 });
      for (let d = b.d - 1; d <= b.d + 1 + 1e-9; d += 0.25) {
        if (d < w.dMin || d > w.dMax) continue;
        const r = at(d);
        if (r.h > b.h) b = r;
      }
      return { ...b, ok: b.h > -99 && Number.isFinite(b.S) };
    };
    let plan = null;
    for (const side of [1, -1]) {
      const l1 = best(side, 1);
      const l2 = best(side, 2);
      const score = Math.min(l1.h, l2.h);
      if (!plan || score > plan.score) plan = { side, yc, l1, l2, score };
    }
    plan.both = plan.l1.ok && plan.l2.ok && plan.score >= w.lines.EL;
    plan.main = plan.l1.ok || !plan.l2.ok ? plan.l1 : plan.l2;
    return plan;
  }

  // Selected defect, else the nearest one reachable by both legs.
  function demoTarget() {
    const list = cmpDefs();
    const set = list.find((b) => b.meta.id === ss.cmp.target);
    if (set) return { tg: set, pl: planFor(set) };
    const yc = (b) => (b.meta.y0 + b.meta.y1) / 2;
    const near = list.slice().sort((a, b) => Math.abs(yc(a) - ss.long.py) - Math.abs(yc(b) - ss.long.py));
    let first = null;
    for (const tg of near) {
      const pl = planFor(tg);
      first ??= { tg, pl };
      if (pl.both) return { tg, pl };
    }
    return first;
  }

  function showDefects() {
    if (ss.show) return;
    ss.show = true;
    syncCase();
  }

  async function legsPart(d, tg, pl) {
    ss.cmp.rows = {};
    renderCmp();
    setLong({ sw: 0, py: pl.yc });
    update();
    B.view('system');
    for (const [leg, b] of [[1, pl.l1], [2, pl.l2]]) {
      if (!b.ok) continue;
      say(`${Cm.legs[leg - 1]} · ${tg.meta.id}`);
      await d.lerp(ss.long.d, b.d, leg === 1 ? 1000 : 2200, (v) => setLong({ d: v }));
      await d.wait(500);
      storeLeg(leg, b.S, b.P);
      await d.wait(1400);
    }
  }

  async function scanDemo(d) {
    const pick = demoTarget();
    if (!pick) return;
    const { tg, pl } = pick;
    ss.cmp.target = tg.meta.id;
    showDefects();
    fillTargets();
    B.view('system');
    setLong({ side: pl.side, py: pl.yc, sw: 0, d: w.dMin });
    await d.wait(600);

    say(stepName('fore_aft'));
    const far = Math.max(pl.l1.ok ? pl.l1.d : 0, pl.l2.ok ? pl.l2.d : 0);
    await d.lerp(w.dMin, Math.min(w.dMax, far + 10), 3200, (v) => setLong({ d: v }));
    await d.lerp(ss.long.d, pl.main.d, 1600, (v) => setLong({ d: v }));
    ss.learn.fa = Math.max(ss.learn.fa, LEARN_MIN.fa);
    await d.wait(400);

    say(stepName('lateral'));
    const ya = clampV(tg.meta.y0 - 12, Y0, Y1);
    const yb = clampV(tg.meta.y1 + 12, Y0, Y1);
    await d.lerp(pl.yc, yb, 1300, (v) => setLong({ py: v }));
    await d.lerp(yb, ya, 2400, (v) => setLong({ py: v }));
    await d.lerp(ya, pl.yc, 1300, (v) => setLong({ py: v }));
    ss.learn.lat = Math.max(ss.learn.lat, LEARN_MIN.lat);
    await d.wait(400);

    say(stepName('swivel'));
    await d.lerp(0, DEMO_SWING, 900, (v) => setLong({ sw: v }));
    await d.lerp(DEMO_SWING, -DEMO_SWING, 1700, (v) => setLong({ sw: v }));
    await d.lerp(-DEMO_SWING, 0, 900, (v) => setLong({ sw: v }));
    ss.learn.sw = Math.max(ss.learn.sw, LEARN_MIN.sw);
    await d.wait(400);

    say(stepName('orbit'));
    setLong({ d: pl.main.d, py: pl.yc, sw: 0 });
    const p0 = poseOf();
    const L = pl.main.ok ? locate(pl.main.S, t, w.p.K).l : pl.main.d;
    const cx = p0.px + Math.cos(p0.phi) * L;
    const cy = p0.py + Math.sin(p0.phi) * L;
    const orbitTo = (a) => {
      const np = w.sidePose(pl.side, 1, 0, a);
      setLong({ sw: a, d: Math.abs(cx - Math.cos(np.phi) * L), py: cy - Math.sin(np.phi) * L });
    };
    await d.lerp(0, DEMO_SWING, 1000, orbitTo);
    await d.lerp(DEMO_SWING, -DEMO_SWING, 1900, orbitTo);
    await d.lerp(-DEMO_SWING, 0, 1000, orbitTo);
    ss.learn.orb = Math.max(ss.learn.orb, LEARN_MIN.orb);
    await d.wait(400);

    await legsPart(d, tg, pl);
  }

  async function legsDemo(d) {
    const pick = demoTarget();
    if (!pick) return;
    const { tg, pl } = pick;
    ss.cmp.target = tg.meta.id;
    showDefects();
    fillTargets();
    setLong({ side: pl.side, py: pl.yc, sw: 0 });
    await d.wait(300);
    await legsPart(d, tg, pl);
  }

  // ---- one-click oblique-parallel scan demo
  const setTrans = (v) => {
    for (const [k, x] of Object.entries(v)) if (Number.isFinite(x)) ss.trans[k] = x;
    clampPose();
    schedule();
  };
  const transStep = (id) => H.trans_items.find((it) => it.id === id)?.do ?? '';
  function transAmp(p) {
    const pk = w.m.peak(ss.cs.all, transPose(p));
    if (!(pk.P > 0) || toScreen(pk.S) > inst.range) return 0;
    return w.m.percent(pk.P, ss.gain[topic]);
  }
  // Probe-y sweep at the weld edge for one side and beam direction, up to just past the target; peak on the way.
  function transRun(side, dir, ty) {
    const from = clampV(ty - dir * TRANS_SPAN, Y0, Y1);
    const to = clampV(ty + dir * 10, Y0, Y1);
    const x = transXMin(SKEW_MAX);
    let best = { py: from, a: 0 };
    for (let py = from; dir * (to - py) >= 0; py += dir) {
      const a = transAmp({ side, x, py, dir, sk: SKEW_MAX });
      if (a > best.a) best = { py, a };
    }
    return { side, dir, from, to, ...best };
  }
  async function sweepRun(d, r, ms) {
    setTrans({ side: r.side, dir: r.dir, py: r.from });
    await d.wait(400);
    await d.lerp(r.from, r.to, ms, (v) => setTrans({ py: v }));
    if (r.a >= 5) await d.lerp(r.to, r.py, 900, (v) => setTrans({ py: v }));
    await d.wait(700);
  }
  async function transDemo(d) {
    const yc = (b) => (b.meta.y0 + b.meta.y1) / 2;
    const tg = ss.cs.built.filter((b) => b.meta.transverse)
      .sort((a, b) => Math.abs(yc(a) - ss.trans.py) - Math.abs(yc(b) - ss.trans.py))[0];
    const ty = tg ? yc(tg) : (Y0 + Y1) / 2;
    showDefects();
    B.view('system');
    setGain(Math.round((gScan + w.transPlus) * 10) / 10);
    const runs = [1, -1].flatMap((side) => [1, -1].map((dir) => transRun(side, dir, ty)));
    const main = runs.reduce((a, b) => (b.a > a.a ? b : a));
    const runOf = (side, dir) => runs.find((r) => r.side === side && r.dir === dir);

    say(transStep('skew'));
    setTrans({ side: main.side, dir: main.dir, py: main.from, sk: 0, x: TRANS_X_MAX });
    await d.wait(600);
    const x1 = transXMin(SKEW_MAX);
    await d.lerp(0, 1, 1800, (k) => setTrans({ sk: SKEW_MAX * k, x: TRANS_X_MAX + (x1 - TRANS_X_MAX) * k }));
    await d.wait(500);

    say(transStep('along'));
    await sweepRun(d, main, 3600);

    if (tg && main.a >= 5) {
      say(transStep('record'));
      update();
      const e = cur.echo;
      if (e && !ss.marks.some((m) => m.mode === 'trans' && Math.abs(m.y - e.yr) < 5)) record();
      await d.wait(1400);
    }

    say(transStep('dir'));
    await sweepRun(d, runOf(main.side, -main.dir), 2800);

    say(transStep('side'));
    await sweepRun(d, runOf(-main.side, main.dir), 2800);

    if (main.a >= 5) {
      setTrans({ side: main.side, dir: main.dir, py: main.py });
      await d.wait(300);
    }
  }

  const studentOpen = document.body.dataset.learningRole === 'student';
  if (teach) {
    help = createCalibHelp({
      ctl, stage: PS.tipHost, text: { common: H }, topic, items: H.items, startOpen: studentOpen,
      onTopicDone: () => ctx.onTopicDone?.(topic),
      checks: () => ({
        fore_aft: ss.learn.fa >= LEARN_MIN.fa,
        lateral: ss.learn.lat >= LEARN_MIN.lat,
        swivel: ss.learn.sw >= LEARN_MIN.sw,
        orbit: ss.learn.orb >= LEARN_MIN.orb,
        leg1: !!ss.cmp.rows[1],
        leg2: !!ss.cmp.rows[2],
      }),
      demo: scanDemo,
      extra: [{ label: H.legs_demo, run: legsDemo }],
    });
  } else if (guided) {
    const hitTransDefect = () => ss.marks.some((m) => {
      if (m.mode !== 'trans' || m.zone === 'below') return false;
      const id = matchDefect(ss.cs.built, m);
      if (!id) return false;
      return !!ss.cs.built.find((b) => b.meta.id === id)?.meta.transverse;
    });
    help = createCalibHelp({
      ctl, stage: PS.tipHost, text: { common: H }, topic, items: H.trans_items, startOpen: studentOpen,
      onTopicDone: () => ctx.onTopicDone?.(topic),
      checks: () => ({
        skew: ss.trans.sk >= 5 && ss.trans.x <= transXMin(ss.trans.sk) + 3,
        along: ss.travel >= TRANS_ALONG_MIN,
        record: hitTransDefect(),
        dir: !!(ss.tlearn.dir[1] && ss.tlearn.dir[-1]),
        side: !!(ss.tlearn.side[1] && ss.tlearn.side[-1]),
      }),
      demo: transDemo,
    });
  }

  B.setSpecimen({ kind: 'weld', spec: w.spec });
  syncCase();
  renderMarks();
  syncTip();
  update();
  return {
    stop: () => {
      help?.stop();
      clearTimeout(hintTimer);
      window.removeEventListener('keydown', onKey);
      cancelAnimationFrame(raf);
      saveExam(ss);
      B.setCutSection(null);
      PS.stop();
    },
    record,
    endpoint,
    select(i) { ss.sel = i; renderMarks(); schedule(); },
    set(v) {
      const p = isLong ? ss.long : ss.trans;
      Object.assign(p, v.pose ?? {});
      if (v.gain != null) ss.gain[topic] = v.gain;
      clampPose();
      update();
      sc.sync();
    },
    load: loadCase,
    show(on) { ss.show = on; syncCase(); update(); },
    state: () => ({
      echo: cur.echo, pose: cur.pose, probe: { ...(isLong ? ss.long : ss.trans) }, gain: ss.gain[topic],
      case: { kind: ss.cs.kind, seed: ss.cs.seed, defects: ss.cs.defs.map((d) => ({ id: d.id, type: d.type })) },
      marks: ss.marks.slice(), coverage: ss.cov ? ss.cov.total / (ss.cov.G.nIn * ss.cov.ny) : 0, scope: sc.state(),
    }),
  };
}

// ---------------------------------------------------------------- evaluation
function selectOf(opts, value, onChange) {
  const s = document.createElement('select');
  for (const [v, lab] of opts) {
    const o = document.createElement('option');
    o.value = v;
    o.textContent = lab;
    s.appendChild(o);
  }
  s.value = value;
  s.addEventListener('change', () => onChange(s.value));
  return s;
}

const pad2 = (n) => String(n).padStart(2, '0');
const PLAN_C = { plate: '#eef2f7', weld: '#d9c7a3', long: '#2563eb', trans: '#9333ea', defect: '#dc2626', axis: '#475569' };
const PLAN_X = 50;

// Plate top view for the report (weld band ±PLAN_X): weld along y, recorded indications, defect extents once checked.
function planImage(w, marks, built) {
  const [Y0, Y1] = w.spec.y_mm;
  const XA = Math.max(w.spec.x_mm[0], -PLAN_X);
  const XB = Math.min(w.spec.x_mm[1], PLAN_X);
  const px = 2.6;
  const pad = { l: 34, r: 12, t: 12, b: 26 };
  const cv = document.createElement('canvas');
  cv.width = Math.round((Y1 - Y0) * px) + pad.l + pad.r;
  cv.height = Math.round((XB - XA) * px) + pad.t + pad.b;
  const g = cv.getContext('2d');
  const PX = (y) => pad.l + (y - Y0) * px;
  const PY = (x) => pad.t + (XB - x) * px;
  g.fillStyle = '#fff';
  g.fillRect(0, 0, cv.width, cv.height);
  g.fillStyle = PLAN_C.plate;
  g.fillRect(PX(Y0), PY(XB), (Y1 - Y0) * px, (XB - XA) * px);
  const hw = w.spec.cap.half_width_mm;
  g.fillStyle = PLAN_C.weld;
  g.fillRect(PX(Y0), PY(hw), (Y1 - Y0) * px, 2 * hw * px);
  g.strokeStyle = PLAN_C.axis;
  g.lineWidth = 1;
  g.strokeRect(PX(Y0), PY(XB), (Y1 - Y0) * px, (XB - XA) * px);
  g.fillStyle = PLAN_C.axis;
  g.font = '11px Arial, sans-serif';
  g.textAlign = 'center';
  for (let y = Math.ceil(Y0 / 50) * 50; y <= Y1; y += 50) g.fillText(`${y}`, PX(y), cv.height - 8);
  g.textAlign = 'right';
  for (const x of [XA, 0, XB]) g.fillText(`${x}`, pad.l - 4, PY(x) + 4);
  g.lineWidth = 4;
  g.strokeStyle = PLAN_C.defect;
  for (const { meta } of built ?? []) {
    g.beginPath();
    g.moveTo(PX(meta.y0), PY(0));
    g.lineTo(PX(Math.max(meta.y1, meta.y0 + 1)), PY(0));
    g.stroke();
  }
  g.font = 'bold 11px Arial, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  for (const mk of marks) {
    g.fillStyle = PLAN_C[mk.mode] ?? PLAN_C.long;
    g.beginPath();
    g.arc(PX(mk.y), PY(clampV(mk.x, XA, XB)), 8, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#fff';
    g.fillText(`${mk.no}`, PX(mk.y), PY(clampV(mk.x, XA, XB)) + 0.5);
  }
  return cv.toDataURL('image/png');
}

function renderEval(main, side, ctx) {
  const X = ctx.text;
  const Cm = X.common;
  const E = X.eval;
  const T = X.table;
  const w = weldFor(ctx);
  const ss = session(ctx);
  const cal = instOf(ctx);
  if (!ss.cov) resetCoverage(ss, w);
  const exam = !!ss.exam;
  const XC = ctx.cardText;
  const NCOL = exam ? 10 : 11;
  const lock = locked(ss);
  const guided = !exam && helpAllowed();
  if (guided && !ss.marks.length) autoMarks(ss, w);

  const head = make('div', 'dg-head');
  const ctl = make('div', 'dg-controls');
  head.append(make('h3', '', X.topics.eval), ctl);
  main.appendChild(head);
  if (guided) button(ctl, E.carry, () => { autoMarks(ss, w); render(); });
  if (!exam) {
    const bCheck = button(ctl, E.check, () => runCheck());
    bCheck.classList.add('ag-cb-rec');
  } else if (!lock) {
    const bSubmit = button(ctl, XC.exam.submit, () => { if (window.confirm(XC.exam.confirm)) submitExam(); });
    bSubmit.classList.add('ag-cb-rec');
  }
  button(ctl, E.report, () => openWeldReport());
  if (exam && lock) button(ctl, XC.exam.again, () => { resetExam(); ctx.rerender?.(EXAM_FIRST); });

  const wrap = make('div', 'ag-ev-wrap');
  const table = make('table', 'ag-media ag-ev-table');
  wrap.appendChild(table);
  main.appendChild(wrap);
  const plateBox = make('div', 'ag-bm-form ag-ev-plate');
  main.appendChild(plateBox);

  if (exam && X.tip) {
    const tip = X.tip;
    const sum = examTargetSummary(ss.cs.built, refEval(ss, w), ss.marks);
    const box = make('div', 'ag-tip');
    box.appendChild(make('div', 'ag-tip-head', tip.title));
    box.appendChild(make('strong', 'ag-tip-count', fillTip(tip.count, { n: sum.total })));
    const ol = make('ol', 'ag-tip-steps');
    for (const s of tip.steps) ol.appendChild(make('li', '', s));
    box.appendChild(ol);
    const row = make('div', 'ag-tip-progress');
    row.appendChild(make('span', '', fillTip(tip.progress, { recorded: sum.recorded, n: sum.total })));
    const used = ss.hints?.length || 0;
    if (used) row.appendChild(make('span', 'ag-tip-used', fillTip(tip.hint_used, { n: used })));
    box.appendChild(row);
    side.appendChild(box);
  }
  const pc = card(side, E.plate_card);
  const ddPl = readouts(pc, ['plate', 'material', 't', 'acceptance'], E.read);
  const lc = card(side, E.limits);
  const lt = make('table', 'ag-media ag-cb-pts ag-ev-lim');
  lc.append(lt, make('p', 'ag-ev-note', E.below_el), make('p', 'ag-ev-note', E.not_allowed));
  const resCard = card(side, E.result);
  const ddRes = readouts(resCard, Object.keys(E.sum), E.sum);
  if (exam && ss.exam.result) side.insertBefore(examScoreCard(ss.exam.result, XC, Cm), side.firstChild);
  const fc = card(side, Cm.formulas);
  for (const fm of X.formulas.eval) {
    const b = make('div', 'ag-bm-f');
    const m = make('div', 'ag-math');
    m.innerHTML = ctx.tex(fm.latex);
    b.append(make('span', 'ag-tag', fm.name), m);
    fc.appendChild(b);
  }

  const L = w.gradeLimits();
  const lim = (v) => `≤ ${Number.isInteger(v) ? v : f1(v)}`;
  for (const [cells, th] of [
    [E.limit_head, true],
    [[E.grades.I, lim(L.I.I), lim(L.I.II), Cm.none]],
    [[E.grades.II, lim(L.II.I), lim(L.II.II), Cm.none]],
    [[E.grades.III, E.beyond_II, E.beyond_II, E.all]],
  ]) {
    const r = make('tr');
    cells.forEach((c) => r.appendChild(make(th ? 'th' : 'td', '', c)));
    lt.appendChild(r);
  }

  const gradeTip = (zn) => {
    if (zn === 'below') return E.below_el;
    const head = zn === 'III' ? `${Cm.zones.III}: ${E.all} ${E.grades.III}`
      : `${Cm.zones[zn]}: ${E.grades.I} ${lim(L.I[zn])} ${Cm.mm} · ${E.grades.II} ${lim(L.II[zn])} ${Cm.mm} · ${E.grades.III} ${E.beyond_II}`;
    return `${head}\n${E.not_allowed}`;
  };
  const plateName = () => (exam ? XC.exam.plate : ss.cs.kind === 'demo' ? Cm.demo : `${Cm.random} ${ss.cs.seed}`);
  const lenText = (len, method) => (len == null ? E.methods[method] ?? Cm.none : `${f1(len)} ${Cm.mm} (${E.methods[method]})`);
  const refLine = (r) => [r.id, X.types[r.type], Cm.zones[r.zone], lenText(r.length, r.method), E.grades[r.grade]].join(' · ');
  const ev = () => refEval(ss, w);

  // ---- field hints (teacher / self-study)
  const TP = E.tips;
  const fillT = (s, v) => s.replace(/\{(\w+)\}/g, (_, k) => v[k] ?? '');
  const refOf = (mk) => {
    const id = matchDefect(ss.cs.built, mk);
    return id ? ev().indications.find((q) => q.id === id) : null;
  };
  const markLine = (mk) => fillT(TP.mark, { zone: Cm.zones[mk.zone], h: mk.hText, depth: f1(mk.depth), x: f1(mk.x) });
  function regionOf(mk) {
    if (mk.mode === 'trans') return 'trans';
    const fu = w.spec.fusion;
    const fw = w.fusionHw(clampV(mk.depth, 0, w.t));
    const ax = Math.abs(mk.x);
    const nearFusion = Math.abs(ax - fw) <= 3.5;
    if (Math.abs(mk.depth - fu.waist_depth_mm) <= 3 && ax <= fu.waist_half_width_mm + 2) return 'root';
    if ((mk.depth <= 4 || mk.depth >= w.t - 4) && nearFusion) return 'toe';
    if (nearFusion) return 'fusion';
    return 'inner';
  }
  const lenTip = (mk) => {
    const r = refOf(mk);
    const method = mk.mode === 'trans' ? 'geometric' : r?.method && r.method !== 'none' ? r.method : mk.h < w.lines.SL ? 'EL' : '-6dB';
    return { title: TP.len.title, rows: [[TP.this, markLine(mk)], [TP.how, TP.len[method]], [TP.why, TP.len.why, 'why']] };
  };
  const natureTip = (mk) => {
    const r = refOf(mk);
    const rows = [[TP.this, fillT(TP.nature.pos, { depth: f1(mk.depth), t: w.t, region: TP.nature.regions[regionOf(mk)] })]];
    if (r && mk.mode === 'long') {
      const sh = (h) => (h > -60 ? slText(w, h, false) : Cm.none);
      const both = r.h_left > -60 && r.h_right > -60;
      rows.push(['', fillT(TP.nature.sides, { l: sh(r.h_left), r: sh(r.h_right), d: both ? f1(Math.abs(r.h_left - r.h_right)) : Cm.none })]);
    }
    rows.push([TP.how, TP.nature.how]);
    for (const n of NATURES) rows.push(['', fillT(TP.nature.item, { name: E.natures[n], feat: TP.nature.feat[n] }), 'feat']);
    rows.push([TP.why, TP.nature.why, 'why']);
    return { title: TP.nature.title, rows };
  };
  const gradeHint = (mk) => {
    const zn = mk.zone;
    const lim1 = zn === 'I' || zn === 'II' ? fillT(TP.grade.zone, { zone: Cm.zones[zn], a: f1(L.I[zn]), b: f1(L.II[zn]) }) : zn === 'III' ? TP.grade.zone3 : TP.grade.below;
    return {
      title: TP.grade.title,
      rows: [
        [TP.this, markLine(mk)],
        ['', mk.len == null ? '' : fillT(TP.grade.len, { len: f1(mk.len) })],
        [TP.how, lim1], ['', TP.grade.na],
        [TP.why, TP.grade.why, 'why'],
      ],
    };
  };
  const plateTip = (key) => () => ({
    title: TP[key].title,
    rows: [[TP.how, fillT(TP[key].how, { acc: E.grades[w.spec.acceptance_level] })], [TP.why, TP[key].why, 'why']],
  });

  function stale() {
    help?.cancel();
    help?.tick();
    if (!ss.check) return;
    ss.check = null;
    render();
  }

  function render() {
    hideHint();
    table.innerHTML = '';
    const hr = make('tr');
    for (const c of [T.no, T.mode, T.y, T.x, T.depth, T.h, T.zone, `${T.len} (${Cm.mm})`, ...(exam ? [] : [T.sys]), T.nature, T.grade]) hr.appendChild(make('th', '', c));
    table.appendChild(hr);
    const ck = ss.check;
    const full = (cls, text) => {
      const r = make('tr', cls);
      const c = make('td', '', text);
      c.colSpan = NCOL;
      r.appendChild(c);
      table.appendChild(r);
    };
    if (!ss.marks.length) full('ag-ev-empty', E.empty);
    ss.marks.forEach((mk, i) => {
      const row = ck?.rows[i];
      const r = make('tr');
      const cls = (k) => (row ? (row.ok[k] ? 'ok' : 'bad') : '');
      const td = (text, c = '') => {
        const e = make('td', c, text);
        r.appendChild(e);
        return e;
      };
      for (const c of [`${mk.no}`, E.modes[mk.mode], f1(mk.y), f1(mk.x), f1(mk.depth), mk.hText]) td(c);
      td(Cm.zones[mk.zone], cls('zone'));
      const inp = Object.assign(document.createElement('input'), { type: 'number', min: 0, max: 300, step: 0.1, inputMode: 'decimal' });
      inp.value = mk.len == null ? '' : String(mk.len);
      inp.disabled = lock;
      inp.addEventListener('change', () => {
        const v = parseFloat(inp.value);
        mk.len = Number.isFinite(v) && v >= 0 ? Math.round(v * 10) / 10 : null;
        examLog(ss, 'length', `${mk.no} · ${mk.len ?? Cm.none}`);
        stale();
      });
      const tLen = td('', `ag-ev-in ${cls('len')}`);
      tLen.appendChild(inp);
      if (guided) hint(tLen, () => lenTip(mk));
      if (!exam) {
        const ts = td('', 'ag-ev-sys');
        if (mk.sys) ts.textContent = lenText(mk.sys.length, mk.sys.method);
        else {
          const b = make('button', 'ag-chip', E.measure);
          b.type = 'button';
          b.addEventListener('click', () => {
            mk.sys = systemLength(w, ss.cs.built, ev(), mk) ?? { length: null, method: 'none' };
            render();
          });
          ts.appendChild(b);
        }
      }
      const sn = selectOf([['', E.pick], ...NATURES.map((n) => [n, E.natures[n]])], mk.nature, (v) => { mk.nature = v; examLog(ss, 'nature', `${mk.no} · ${E.natures[v] ?? Cm.none}`); stale(); });
      sn.disabled = lock;
      const tNat = td('', `ag-ev-in ${cls('nature')}`);
      tNat.appendChild(sn);
      const sg = selectOf([['', E.pick], ...GRADES.map((g) => [g, E.grades[g]])], mk.grade, (v) => { mk.grade = v; examLog(ss, 'grade', `${mk.no} · ${E.grades[v] ?? Cm.none}`); stale(); });
      sg.disabled = lock;
      const tGr = td('', `ag-ev-in ${cls('grade')}`);
      tGr.appendChild(sg);
      if (guided) {
        hint(tNat, () => natureTip(mk));
        hint(tGr, () => gradeHint(mk));
      } else sg.title = gradeTip(mk.zone);
      table.appendChild(r);
      if (row) {
        const q = row.defect ? ev().indications.find((x) => x.id === row.defect) : null;
        full(`ag-ev-ref${row.defect && !row.dup ? '' : ' bad'}`, q ? `${row.dup ? `${E.dup} · ` : ''}${E.ref} ${refLine(q)}` : E.false);
      }
    });
    if (ck) for (const id of ck.missed) full('ag-ev-ref bad', `${E.missed} ${refLine(ev().indications.find((x) => x.id === id))}`);
    renderPlate();
    renderSummary();
    help?.tick();
  }

  function renderPlate() {
    plateBox.innerHTML = '';
    const ck = ss.check;
    const field = (label, opts, key) => {
      const l = make('label', 'ag-bm-in');
      const s = selectOf([['', E.pick], ...opts], ss.plate[key], (v) => { ss.plate[key] = v; examLog(ss, 'plate', `${label} · ${opts.find((o) => o[0] === v)?.[1] ?? Cm.none}`); stale(); });
      s.disabled = lock;
      if (ck) s.classList.add(ck.plate[key] ? 'ok' : 'bad');
      l.append(make('span', '', label), s);
      plateBox.appendChild(l);
      if (guided) hint(l, plateTip(key === 'level' ? 'plate_level' : 'verdict'));
    };
    field(E.plate_level, ['I', 'II', 'III'].map((g) => [g, E.grades[g]]), 'level');
    field(E.verdict, ['accept', 'reject'].map((v) => [v, E.verdicts[v]]), 'verdict');
    if (ck) plateBox.appendChild(make('span', 'ag-ev-plref', `${E.ref} ${E.grades[ck.plate.ref.level]} · ${E.verdicts[ck.plate.ref.verdict]}`));
  }

  function renderSummary() {
    ddPl.plate.textContent = plateName();
    ddPl.material.textContent = E.material;
    ddPl.t.textContent = `${w.t} ${Cm.mm}`;
    ddPl.acceptance.textContent = E.grades[w.spec.acceptance_level];
    const ck = ss.check;
    resCard.hidden = !ck;
    if (!ck) return;
    const hit = ck.rows.filter((r) => r.defect && !r.dup);
    const n = hit.length;
    const cnt = (k) => `${hit.filter((r) => r.ok[k]).length} / ${n}`;
    const set = (k, text, ok) => {
      ddRes[k].textContent = text;
      ddRes[k].className = ok === undefined ? '' : ok ? 'ok' : 'bad';
    };
    set('marks', `${ss.marks.length}`);
    set('matched', `${n}`);
    set('missed', `${ck.missed.length}`, ck.missed.length === 0);
    set('false', `${ck.rows.filter((r) => !r.defect).length}`, ck.rows.every((r) => r.defect));
    for (const k of ['zone', 'len', 'nature', 'grade']) set(k, cnt(k), hit.every((r) => r.ok[k]));
    set('plate_level', ck.plate.level ? E.right : E.wrong, ck.plate.level);
    set('verdict', ck.plate.verdict ? E.right : E.wrong, ck.plate.verdict);
  }

  function runCheck() {
    ss.check = checkMarks(w, ss.cs.built, ev(), ss.marks, ss.plate);
    render();
  }

  function submitExam() {
    if (!exam || lock) return null;
    const res = scoreExam(w, ss.cs.built, ev(), {
      marks: ss.marks, plate: ss.plate, cov: covRatio(ss), transTravel: ss.travel, sides: ss.sides, g0: ss.g0, prepOk: prepOk(ss.prep, ctx.tasks.exam.prep),
    }, ctx.tasks.exam.rubric);
    ss.exam.result = res;
    ss.exam.submittedAt = new Date().toISOString();
    ss.check = res.check;
    examLog(ss, 'submit', `${res.total}`);
    ctx.rerender?.('eval');
    return res;
  }

  function openWeldReport() {
    const R = X.report;
    const ck = ss.check;
    const now = new Date();
    const date = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
    const cov = ss.cov ? ss.cov.total / (ss.cov.G.nIn * ss.cov.ny) : 0;
    const pick = (map, k) => (k ? map[k] : Cm.none);
    const mark = (ok) => ({ text: ok ? E.right : E.wrong, cls: ok ? 'ok' : 'ng' });
    const nDac = cal.dac?.length ?? 0;
    const shots = ss.marks.filter((mk) => mk.shot);
    const fillT = (s, v) => s.replace(/\{(\w+)\}/g, (_, k) => v[k] ?? '');
    const sections = [
      { title: R.sections.calib, parts: [{ kv: [
        [R.calib.front, `${f1(cal.front)} ${Cm.mm}`], [R.calib.v, `${Math.round(cal.v)} ${Cm.ms}`], [R.calib.t0, `${cal.t0.toFixed(2)} ${Cm.us}`],
        [R.calib.K, cal.K.toFixed(2)], ...(nDac ? [[R.calib.dac, `${nDac}`]] : []), [R.calib.scan, `${f1(cal.gain ?? ss.g0)} ${Cm.dB}`],
      ] }] },
      { title: R.sections.scan, parts: [{ kv: [
        [X.prep.rough, X.prep.rough_opts[ss.prep?.rough] ?? Cm.none], [X.prep.couplant, X.prep.couplant_opts[ss.prep?.couplant] ?? Cm.none],
        [R.scan.sides, R.scan.sides_v], [R.scan.cov, `${f1((exam ? covRatio(ss) : cov) * 100)} %`],
      ] }] },
      { title: R.sections.plan, parts: [{ figure: {
        img: planImage(w, ss.marks, ck ? ss.cs.built : null),
        legend: [
          { color: PLAN_C.long, label: R.plan.long }, { color: PLAN_C.trans, label: R.plan.trans },
          { color: PLAN_C.weld, label: R.plan.weld }, ...(ck ? [{ color: PLAN_C.defect, label: R.plan.defect, line: true }] : []),
        ],
      } }] },
      {
        title: R.sections.marks,
        parts: [{ table: {
          head: [T.no, T.mode, T.y, T.x, T.depth, T.h, T.zone, `${T.len} (${Cm.mm})`, T.nature, T.grade],
          rows: ss.marks.length
            ? ss.marks.map((mk) => [`${mk.no}`, E.modes[mk.mode], f1(mk.y), f1(mk.x), f1(mk.depth), mk.hText, Cm.zones[mk.zone], mk.len == null ? Cm.none : f1(mk.len), pick(E.natures, mk.nature), pick(E.grades, mk.grade)])
            : [[Cm.none, '', '', '', '', '', '', '', '', '']],
        } }],
      },
      ...(shots.length ? [{ title: R.sections.ascan, parts: [{ images: shots.map((mk) => ({
        img: mk.shot, caption: fillT(R.shot, { no: mk.no, y: f1(mk.y), depth: f1(mk.depth), h: mk.hText }),
      })) }] }] : []),
      { title: R.sections.eval, parts: [{ kv: [[E.plate_level, pick(E.grades, ss.plate.level)], [E.verdict, pick(E.verdicts, ss.plate.verdict)]] }] },
    ];
    if (ck) {
      const e = ev();
      const rows = ss.marks.map((mk, i) => {
        const r = ck.rows[i];
        if (!r.defect) return [`${mk.no}`, { text: E.false, cls: 'ng' }, '', '', '', ''];
        return [`${mk.no}`, `${r.defect}${r.dup ? ` · ${E.dup}` : ''}`, mark(r.ok.zone), mark(r.ok.len), mark(r.ok.nature), mark(r.ok.grade)];
      });
      for (const id of ck.missed) {
        const q = e.indications.find((x) => x.id === id);
        rows.push([{ text: E.missed, cls: 'ng' }, `${q.id} · ${X.types[q.type]}`, Cm.zones[q.zone], lenText(q.length, q.method), E.natures[natureOf(q.type)], E.grades[q.grade]]);
      }
      sections.push({
        title: R.sections.check,
        parts: [
          { table: { head: R.check_head, rows } },
          { kv: [[E.plate_level, `${pick(E.grades, ss.plate.level)} / ${E.grades[ck.plate.ref.level]}`], [E.verdict, `${pick(E.verdicts, ss.plate.verdict)} / ${E.verdicts[ck.plate.ref.verdict]}`]] },
        ],
      });
    }
    const XE = XC.exam;
    const res = exam ? ss.exam.result : null;
    if (res) {
      sections.push({ title: XE.score, parts: [{ table: {
        head: [...XC.report.score_head, ''],
        rows: res.parts.map((p) => [XE.parts[p.id], { text: f1(p.points), cls: p.points >= p.max - 1e-9 ? 'ok' : 'ng' }, String(p.max), { text: partDetail(p, XC, Cm), cls: 'l' }]),
        foot: [XE.total, f1(res.total), String(res.max), ''],
      } }] });
      sections.push({ title: XC.report.sections.log, parts: [{ table: { head: XC.report.log_head,
        rows: ss.exam.log.map((e) => [new Date(e.at).toLocaleTimeString('zh-CN', { hour12: false }), XC.log[e.act] ?? e.act, { text: e.detail, cls: 'l' }]) } }] });
    }
    sections.push({ title: R.sections.sign, cls: 'rp-sign', parts: [{ kv: [
      [R.meta.inspector, exam ? ss.exam.student.name : licensedStudent()?.name ?? ''], [R.meta.qualification, ''],
      [R.meta.reviewer, ''], [R.meta.date, date],
    ] }] });
    const who = exam ? [[XC.student.name, ss.exam.student.name || Cm.none], [XC.student.no, ss.exam.student.no || Cm.none], [XC.cases.seed, `${ss.cs.seed}`]] : [];
    const model = {
      title: exam ? XE.report_title : R.title,
      meta: [
        ...who,
        [R.meta.plate, plateName()], [R.meta.material, `${E.material} · ${w.t} ${Cm.mm}`], [R.meta.probe, ctx.marking],
        [R.meta.block, R.block], [R.meta.level, R.level],
        [R.meta.gain, `${f1(cal.gain ?? ss.g0)} ${Cm.dB} (${R.trans_plus} +${w.transPlus} ${Cm.dB})`],
        [R.meta.acceptance, E.grades[w.spec.acceptance_level]], [R.meta.date, date],
        ...(res ? [[XE.total, `${f1(res.total)} / ${res.max}`]] : []),
        ...(exam ? [[X.tip.hint_count, String(ss.hints?.length || 0)]] : []),
      ],
      sections,
    };
    const view = openReport(model, { printLabel: R.print, closeLabel: R.close });
    const lic = licenseMark();
    if (lic) view.appendChild(make('p', 'rp-lic', lic));
    const tag = exam ? `${XE.file}_${String(ss.exam.student.no || ss.exam.student.name || '').replace(/[\\/:*?"<>|\s]/g, '_')}` : R.file;
    view.dataset.pdf = `${tag}_${date.replace(/-/g, '')}-${pad2(now.getHours())}${pad2(now.getMinutes())}`;
    if (exam) examLog(ss, 'export');
    return view;
  }

  // ---- one-click evaluation demo and step guide (teacher / self-study)
  const cellsOf = (i) => table.rows[i + 1]?.querySelectorAll('td.ag-ev-in') ?? [];
  async function evalDemo(d) {
    if (!ss.marks.length) autoMarks(ss, w);
    for (const mk of ss.marks) Object.assign(mk, { len: null, nature: '', grade: '', sys: null });
    ss.plate = { level: '', verdict: '' };
    ss.check = null;
    render();
    await d.wait(600);
    const e = ev();
    const step = async (i, k, tip, apply) => {
      apply();
      render();
      const c = cellsOf(i)[k];
      if (c) showHint(c, tip());
      await d.wait(1500);
    };
    for (const [i, mk] of ss.marks.entries()) {
      const r = refOf(mk);
      mk.sys = systemLength(w, ss.cs.built, e, mk) ?? { length: null, method: 'none' };
      await step(i, 0, () => lenTip(mk), () => { mk.len = mk.sys.length == null ? null : Math.round(mk.sys.length * 10) / 10; });
      if (!r) continue;
      await step(i, 1, () => natureTip(mk), () => { mk.nature = natureOf(r.type); });
      await step(i, 2, () => gradeHint(mk), () => { mk.grade = r.grade; });
    }
    hideHint();
    const pl = plateBox.querySelectorAll('label');
    ss.plate.level = e.level;
    render();
    if (pl[0]) showHint(pl[0], plateTip('plate_level')());
    await d.wait(1500);
    ss.plate.verdict = e.verdict;
    render();
    const pl2 = plateBox.querySelectorAll('label');
    if (pl2[1]) showHint(pl2[1], plateTip('verdict')());
    await d.wait(1500);
    hideHint();
    runCheck();
  }
  let help = null;
  if (guided) {
    const H = X.help;
    const allSet = (k) => ss.marks.length > 0 && ss.marks.every((mk) => mk[k] != null && mk[k] !== '');
    const tipHost = make('div', 'ag-guide-dock');
    side.prepend(tipHost);
    help = createCalibHelp({
      ctl, stage: tipHost, text: { common: { ...H, demo: H.eval_demo, guide: H.eval_guide } }, topic: 'eval', module: 'angle-scan',
      items: H.eval_items, startOpen: document.body.dataset.learningRole === 'student',
      onTopicDone: () => ctx.onTopicDone?.('eval'),
      checks: () => ({
        marks: ss.marks.length > 0,
        len: allSet('len'),
        nature: allSet('nature'),
        grade: allSet('grade'),
        plate: !!ss.plate.level && !!ss.plate.verdict,
        check: !!ss.check,
      }),
      demo: evalDemo,
    });
  }

  render();
  return {
    stop: () => { help?.stop(); hideHint(); saveExam(ss); },
    check: runCheck,
    submit: submitExam,
    report: openWeldReport,
    state: () => ({ marks: ss.marks.slice(), plate: { ...ss.plate }, check: ss.check, case: { kind: ss.cs.kind, seed: ss.cs.seed }, result: ss.exam?.result ?? null }),
  };
}

function partDetail(p, XC, Cm) {
  const d = p.detail;
  const yn = (v) => (v ? XC.ok : XC.ng);
  const v = {
    ...d, cov: f1((d.cov ?? 0) * 100), travel: f1(d.transTravel ?? 0), false: d.false,
    level: d.level === undefined ? '' : yn(d.level), verdict: d.verdict === undefined ? '' : yn(d.verdict),
    gain: d.gain === undefined ? '' : yn(d.gain), sides: d.sides === undefined ? '' : yn(d.sides),
  };
  if (typeof d.prep === 'boolean') v.prep = yn(d.prep);
  return XC.exam.detail[p.id].replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? Cm.none));
}

function examScoreCard(res, XC, Cm) {
  const c = make('div', 'ag-card ag-ex-score');
  c.appendChild(make('h3', '', `${XC.exam.score} · ${f1(res.total)} / ${res.max}`));
  const t = make('table', 'ag-media ag-cb-pts');
  const hr = make('tr');
  for (const h of XC.report.score_head) hr.appendChild(make('th', '', h));
  t.appendChild(hr);
  for (const p of res.parts) {
    const r = make('tr');
    r.title = partDetail(p, XC, Cm);
    r.append(make('td', '', XC.exam.parts[p.id]), make('td', p.points >= p.max - 1e-9 ? 'ok' : 'bad', f1(p.points)), make('td', '', String(p.max)));
    t.appendChild(r);
    const dr = make('tr', 'ag-ex-detail');
    const dc = make('td', '', partDetail(p, XC, Cm));
    dc.colSpan = 3;
    dr.appendChild(dc);
    t.appendChild(dr);
  }
  c.appendChild(t);
  return c;
}

// ---------------------------------------------------------------- exam start (click kit on bench + prep + draw CTA)
function renderStart(main, side, ctx) {
  const XC = ctx.cardText;
  const XE = XC.exam;
  const PP = ctx.text.prep;
  const lic = licensedStudent();
  const saved = loadExamData(lic ? { no: lic.student_no } : null);
  const student = { name: lic?.name ?? '', no: lic?.student_no ?? '' };
  const gatePrep = { rough: '', couplant: '' };

  const PS = practiceStage(main, side, ctx, XE.title);
  const cskIa = ctx.cal?.csk_ia;
  const cskIia = ctx.blocks?.blocks?.['CSK-IIA-1'];
  const blockDesc = cskIa ? { kind: 'csk_ia', blk: cskIa }
    : cskIia ? { kind: 'csk_iia1', blk: cskIia } : null;
  // Specimen plate is shown for context but not required to click.
  const weldDesc = { kind: 'weld', kit: true, spec: weldOf(ctx).spec };
  const kitItems = (XE.kit_items || [
    { id: 'instrument', label: '数字探伤仪' },
    { id: 'probe', label: '斜探头' },
    { id: 'couplant', label: '耦合剂' },
    { id: 'block', label: 'CSK 标准试块' },
  ]).filter((it) => it.id !== 'weld');
  const kitOn = Object.fromEntries(kitItems.map((it) => [it.id, false]));
  const kitOrder = [];

  PS.B.clearSpecimen?.();
  PS.B.view('system');
  const I = ctx.cal?.instrument;
  const inst = scopeDefaults({
    range: RANGE,
    v: I?.velocity_m_s?.initial ?? 3240,
    t0: I?.zero_us?.initial ?? 0,
    gain: 30,
  });

  const tipHost = PS.tipHost;
  tipHost.classList.add('ag-ex-gate');
  const target = make('div', 'ag-tip ag-ex-target');
  target.appendChild(make('div', 'ag-tip-head', XE.target_title || XE.title));
  target.appendChild(make('strong', 'ag-tip-count', XE.target_pending || '待抽取'));
  if (XE.draw_hint) target.appendChild(make('p', '', XE.draw_hint));
  tipHost.appendChild(target);

  const kitCap = make('div', 'ag-ex-kit-cap');
  const paintKitCap = () => {};

  let wrongTip = null;
  let wrongTimer = 0;
  const showWrong = (text) => {
    if (!wrongTip) {
      wrongTip = make('div', 'ag-ex-kit-toast');
      PS.stage.appendChild(wrongTip);
    }
    wrongTip.textContent = text;
    wrongTip.classList.add('show');
    clearTimeout(wrongTimer);
    wrongTimer = setTimeout(() => wrongTip.classList.remove('show'), 1800);
  };

  const markKit = (id) => {
    if (!id) return;
    if (!(id in kitOn)) {
      showWrong(XE.kit_wrong || '该器材不适用于本次检测');
      return;
    }
    if (kitOn[id]) return;
    kitOn[id] = true;
    kitOrder.push(id);
    paintKitCap();
    syncStart();
  };

  PS.start({
    inst,
    signal: (axis) => new Float64Array(axis.length),
    noise: () => 0.4,
    onChange: () => {},
    kitPick: (id) => markKit(id),
  }, []);

  const prepCard = card(side, PP.title);
  const prepBody = make('div', 'ag-card-body ag-ex-prep');
  const prepKey = ctx.tasks.exam.prep;
  const prepNote = make('p', 'ag-ev-note', PP.basis);
  const prepFields = [['rough', PP.rough, PP.rough_opts], ['couplant', PP.couplant, PP.couplant_opts]].map(([k, label, opts]) => {
    const l = make('label', 'ag-bm-in ag-sc-prep');
    const s = selectOf([['', PP.pick], ...Object.entries(opts)], gatePrep[k], (v) => {
      gatePrep[k] = v;
      markPrep();
      syncStart();
    });
    s.dataset.prep = k;
    l.append(make('span', '', label), s);
    prepBody.appendChild(l);
    return [k, s];
  });
  prepBody.appendChild(prepNote);
  prepCard.appendChild(prepBody);
  const markPrep = () => {
    for (const [k, s] of prepFields) {
      const v = gatePrep[k];
      s.classList.toggle('ok', !!v && prepKey[k].includes(v));
      s.classList.toggle('bad', !!v && !prepKey[k].includes(v));
    }
    prepNote.hidden = !gatePrep.rough;
  };
  markPrep();

  const form = make('div', 'ag-bm-form ag-ex-start');
  if (lic) {
    const dl = make('dl', 'ag-params ag-bm-read');
    for (const [k, v] of [[XC.student.name, student.name], [XC.student.no, student.no]]) {
      dl.append(make('dt', '', k), make('dd', '', v));
    }
    form.appendChild(dl);
  }
  const acts = make('div', 'ag-sc-row ag-ex-acts');
  const bStart = make('button', 'ag-chip active ag-ex-start-btn', XE.draw || XE.start);
  bStart.type = 'button';
  bStart.dataset.examStart = '1';
  const kitReady = () => true;
  const prepReady = () => !!gatePrep.rough && !!gatePrep.couplant;
  const syncStart = () => {
    const ok = kitReady() && prepReady();
    bStart.disabled = !ok;
    bStart.classList.toggle('ag-ex-start-wait', !ok);
  };
  bStart.addEventListener('click', () => {
    if (!kitReady() || !prepReady()) return;
    PS.B.resetKit();
    startExam(ctx, student, null, { prep: { ...gatePrep } });
    ctx.rerender?.(EXAM_FIRST);
  });
  acts.appendChild(bStart);
  if (saved) {
    const b = make('button', 'ag-chip ag-ex-resume-btn', `${XE.resume} · ${XC.cases.seed} ${saved.seed}${saved.result ? ` · ${XE.submitted}` : ''}`);
    b.type = 'button';
    b.dataset.examResume = '1';
    b.addEventListener('click', () => {
      PS.B.resetKit();
      startExam(ctx, saved.student, saved);
      ctx.rerender?.(saved.result ? 'eval' : EXAM_FIRST);
    });
    acts.appendChild(b);
  }
  form.appendChild(acts);
  const startCard = card(side, XE.title);
  startCard.appendChild(form);
  startCard.appendChild(make('p', 'ag-ev-note', XE.plate));
  syncStart();

  return {
    stop: () => { PS.B.resetKit(); PS.stop(); },
    start: () => bStart.click(),
  };
}

export const SCAN_TOPICS = ['long', 'trans', 'eval'];

export function renderScanTopic(topic, main, side, ctx) {
  main.innerHTML = '';
  side.innerHTML = '';
  if (ctx.exam && !examReady(ctx)) {
    if (examBenchPrep) {
      const prep = examBenchPrep;
      examBenchPrep = null;
      const lic = licensedStudent();
      startExam(ctx, { name: lic?.name ?? '', no: lic?.student_no ?? '' }, null, { prep });
    } else {
      return renderStart(main, side, ctx);
    }
  }
  return topic === 'eval' ? renderEval(main, side, ctx) : renderScan(topic === 'trans' ? 'trans' : 'long', main, side, ctx);
}

export function resetScan() {
  SS.study = null;
}

export function resetExam() {
  SS.exam = null;
  try { localStorage.removeItem(EXAM_STORE); } catch { /* none */ }
}

// Exam session present, or resumed from storage for the licensed student.
export function examReady(ctx) {
  if (SS.exam) return true;
  const lic = licensedStudent();
  const saved = lic ? loadExamData({ no: lic.student_no }) : null;
  if (!saved) return false;
  startExam(ctx, saved.student, saved);
  return true;
}

export const examSession = () => SS.exam;
