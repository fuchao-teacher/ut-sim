// Beam & positioning page: skip distance demo, CSK-IIA-1 side-drilled-hole block with A-scan, positioning exercises.
import { C, el, tx, line, defs, seg, slider, button, loop, clear } from './diagrams.js';
import { createModel, sdhElements, U6 } from './model.js';
import { locate, scaleValue, makeProblem, gradeAnswer, makeKProblem, gradeK, K_OPTIONS } from './locate.js';
import { createCalibHelp } from './calibhelp.js';
import { learnScore } from '../learnlog.js';

const f1 = (v) => v.toFixed(1);
const f2 = (v) => v.toFixed(2);
const LEG_C = ['#dc2626', '#d97706', '#64748b'];
const CRT_INK = '#94a3b8';
const HOUSING = { back: 19, front: 14, height: 25 };
const AS = { w: 640, h: 230, x0: 44, x1: 624, y0: 14, y1: 196 };
const RANGE = { S: 200, l: 180, h: 90 };

const make = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

let modelCache = null;
export function beamModel(rules, T) {
  if (!modelCache || modelCache.t !== T) modelCache = createModel(rules, { t: T });
  return modelCache;
}

export function fold(w, T) {
  const r = ((Math.abs(w) % (2 * T)) + 2 * T) % (2 * T);
  return r > T ? 2 * T - r : r;
}

function headOf(host, title, goal) {
  const head = make('div', 'dg-head');
  const ctl = make('div', 'dg-controls');
  const left = make('div', 'ag-bm-head');
  left.appendChild(make('h3', '', title));
  if (goal) left.appendChild(make('p', 'ag-bm-goal', goal));
  head.append(left, ctl);
  host.appendChild(head);
  return ctl;
}

// Guided learning (teacher / self-study): what the learner did per topic, kept while the page lives.
const LEARN = {
  skip: { leg1: false, leg2: false, thick: false, flips: 0 },
  block: { goal: false, peak: false, modes: new Set(), zeroOff: false, zero: false, dir: false },
  exercise: { leg: false, fill: false, check: false, right: false, kval: false },
};

function teach(main, side, ctl, ctx, topic, checks, demo, onStep) {
  const H = ctx.text.help;
  if (!H?.[topic]) return { stop() {}, tick() {}, busy: () => false, cancel() {} };
  const dock = make('div', 'ag-guide-dock');
  side.prepend(dock);
  const mod = document.body.dataset.learningRoute || 'angle-principle';
  const help = createCalibHelp({
    ctl, stage: dock, text: { common: H.common }, topic, items: H[topic], module: mod,
    startOpen: document.body.dataset.learningRole === 'student', checks, demo, onStep,
    onTopicDone: () => ctx.onTopicDone?.(topic),
  });
  help.tick();
  return {
    ...help,
    stop() {
      help.stop();
      dock.remove();
    },
  };
}

const typeIn = async (d, inp, s) => {
  for (let i = 1; i <= s.length; i++) {
    inp.value = s.slice(0, i);
    await d.wait(110);
  }
};

function card(side, title) {
  const c = make('div', 'ag-card');
  c.appendChild(make('h3', '', title));
  side.appendChild(c);
  return c;
}

function readouts(host, keys, labels) {
  const dl = make('dl', 'ag-params ag-bm-read');
  const dd = {};
  for (const k of keys) {
    dd[k] = make('dd');
    dl.append(make('dt', '', labels[k]), dd[k]);
  }
  host.appendChild(dl);
  return dd;
}

function formulaCard(side, ctx) {
  const c = card(side, ctx.text.common.formulas);
  const items = [];
  for (const f of ctx.text.formulas) {
    const b = make('div', 'ag-bm-f');
    const m = make('div', 'ag-math');
    m.innerHTML = ctx.tex(f.latex);
    b.append(make('span', 'ag-tag', f.name), m);
    c.appendChild(b);
    items.push(b);
  }
  return (on) => items.forEach((b, i) => b.classList.toggle('on', on.includes(i)));
}

function svgPoint(svg, e) {
  const pt = svg.createSVGPoint();
  pt.x = e.clientX;
  pt.y = e.clientY;
  const m = svg.getScreenCTM();
  return m ? pt.matrixTransform(m.inverse()) : { x: 0, y: 0 };
}

// −6 dB beam band folded between the scanning surface and the bottom.
function beamBand(g, m, x0, dir, T, Smax, MX, MY, opts = {}) {
  const { sb, cb } = m.p;
  const k = opts.cs ?? 1;
  const step = 1;
  const d = ['', '', ''];
  let prev = null;
  for (let s = 0; s <= Smax + 1e-9; s += step) {
    const half = U6 * m.wv(Math.max(s, 0.001));
    const u = s * sb;
    const w = s * cb;
    const A = [u + half * cb, w - half * sb];
    const B = [u - half * cb, w + half * sb];
    const cur = [A, B].map(([uu, ww]) => [MX(x0 + dir * uu * k), MY(fold(ww, T))]);
    if (prev) {
      const q = [prev[0], cur[0], cur[1], prev[1]];
      const leg = Math.min(2, Math.floor(((s - step / 2) * cb) / T));
      d[leg] += `M ${q.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(' L ')} Z `;
    }
    prev = cur;
  }
  d.forEach((p, i) => { if (p) el('path', { d: p, fill: LEG_C[i], opacity: opts.opacity ?? 0.22, stroke: 'none', 'data-band': i + 1 }, g); });
}

function axisPath(g, x0, dir, T, K, Smax, MX, MY, width = 2.4, legs = 3, cs = 1) {
  const b = Math.atan(K);
  const legS = T / Math.cos(b);
  for (let n = 0; n < legs; n++) {
    const s0 = n * legS;
    if (s0 >= Smax) break;
    const s1 = Math.min(Smax, (n + 1) * legS);
    const p = (s) => [MX(x0 + dir * s * Math.sin(b) * cs), MY(fold(s * Math.cos(b), T))];
    const [a, c] = [p(s0), p(s1 - 1e-9)];
    line(g, a[0], a[1], c[0], c[1], LEG_C[Math.min(n, 2)], width);
  }
}

function probeShape(g, px, dir, MX, MY, label, opts = {}) {
  const xb = MX(px - dir * HOUSING.back);
  const xf = MX(px + dir * HOUSING.front);
  const y0 = MY(0);
  const y1 = MY(-HOUSING.height);
  const xl = Math.min(xb, xf);
  const w = Math.abs(xf - xb);
  const h = y0 - y1;
  // Invisible pad so the whole housing is easy to grab (not only the index mark).
  if (opts.hit) {
    el('rect', {
      x: xl - 6, y: y1 - 8, width: w + 12, height: h + 14, rx: 4,
      fill: '#000', opacity: 0.001, class: 'ag-bm-probe-hit', style: 'cursor: grab',
    }, g);
  }
  el('rect', {
    x: xl, y: y1, width: w, height: h, rx: 3,
    fill: '#475569', stroke: '#cbd5e1', 'stroke-width': 1.5,
    class: 'ag-bm-probe-body', style: 'cursor: grab',
  }, g);
  const xi = MX(px);
  line(g, xi, y0 - 1, xi, y0 - h * 0.45, C.accent, 2);
  el('circle', { cx: xi, cy: y0, r: 3.5, fill: C.accent }, g);
  if (label) tx(g, (xb + xf) / 2, y1 + h * 0.62, label, { 'text-anchor': 'middle', fill: '#e2e8f0', 'font-size': 10, 'font-family': 'Arial, sans-serif' });
  return { xl: xl - 6, xr: xl + w + 6, yt: y1 - 8, yb: y0 + 6 };
}

function dim(g, x1, x2, y, text, col = C.muted) {
  line(g, x1, y, x2, y, col, 1, { 'marker-start': 'url(#ar-muted)', 'marker-end': 'url(#ar-muted)' });
  line(g, x1, y - 5, x1, y + 5, col, 1);
  line(g, x2, y - 5, x2, y + 5, col, 1);
  tx(g, (x1 + x2) / 2, y + 15, text, { fill: col, 'font-size': 12, 'text-anchor': 'middle' });
}

// ---------------------------------------------------------------- skip
function renderSkip(main, side, ctx) {
  const X = ctx.text;
  const Cm = X.common;
  const m = beamModel(ctx.rules, ctx.blocks.blocks['CSK-IIA-1'].T_mm);
  const K = m.p.K;
  const b = m.p.beta;
  const demo = ctx.blocks.skip_demo.T_mm;
  const st = { T: demo.default, S: 70, beam: true };
  const ctl = headOf(main, X.skip.title);
  const W = 640;
  const H = 300;
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, class: 'dg-svg ag-bm-skip', role: 'img' });
  defs(svg);
  main.appendChild(svg);
  const g = el('g', {}, svg);

  const L = LEARN.skip;
  let help = null;
  const slT = slider(ctl, X.skip.thickness, demo.min, demo.max, 1, st.T, (v) => { st.T = v; update(); });
  const smax = () => (3 * st.T) / Math.cos(b);
  const slS = slider(ctl, X.skip.path, 0, 400, 0.1, st.S, (v) => { st.S = v; update(); });
  const setBeam = (on) => { st.beam = on; beamBtn.classList.toggle('active', on); L.flips++; update(); };
  const beamBtn = button(ctl, X.skip.beam, () => { help?.cancel(); setBeam(!st.beam); });
  beamBtn.classList.add('active');
  const track = () => {
    const r = locate(st.S, st.T, K);
    if (r.leg === 1 && st.S > 0) L.leg1 = true;
    if (r.leg === 2) L.leg2 = true;
    help?.tick();
  };
  slT.input.addEventListener('input', () => { help?.cancel(); L.thick = true; track(); });
  slS.input.addEventListener('input', () => { help?.cancel(); track(); });

  const read = card(side, Cm.readout);
  const dd = readouts(read, ['T', 'K', 'beta', 'P', 'S', 'h', 'leg', 'l', 'd'], Cm);
  const hl = formulaCard(side, ctx);

  function update() {
    const T = st.T;
    const P = 2 * K * T;
    slS.input.max = smax().toFixed(1);
    if (st.S > smax()) { st.S = +smax().toFixed(1); slS.input.value = st.S; }
    slT.out.textContent = `${T} ${Cm.mm}`;
    slS.out.textContent = `${f1(st.S)} ${Cm.mm}`;
    const sc = Math.min(3.2, 500 / (P + 40));
    const x0 = 24 + HOUSING.back * sc + 14;
    const Y0 = 100;
    const MX = (v) => x0 + v * sc;
    const MY = (v) => Y0 + v * sc;
    clear(g);
    el('rect', { x: 10, y: Y0, width: W - 20, height: T * sc, fill: C.steel, opacity: 0.6, stroke: C.steelStroke }, g);
    const Smax = Math.min(smax(), (W - 10 - x0) / sc / Math.sin(b));
    if (st.beam) beamBand(g, m, 0, 1, T, Smax, MX, MY, { opacity: 0.18 });
    axisPath(g, 0, 1, T, K, Smax, MX, MY, 1.4);
    probeShape(g, 0, 1, MX, MY, ctx.marking);
    line(g, 18, Y0, 18, MY(T), C.muted, 1, { 'marker-start': 'url(#ar-muted)', 'marker-end': 'url(#ar-muted)' });
    tx(g, 14, MY(T / 2), `T ${T}`, { fill: C.muted, 'font-size': 11, 'text-anchor': 'middle', transform: `rotate(-90 14 ${MY(T / 2)})` });
    for (let n = 1; n <= 3; n++) {
      const x = MX(n * K * T);
      if (x > W - 12) break;
      line(g, x, Y0, x, MY(T), C.muted, 1, { 'stroke-dasharray': '3 4', opacity: 0.6 });
    }
    dim(g, MX(0), MX(K * T), MY(T) + 18, `${Cm.halfP} = KT = ${f1(K * T)}`);
    if (MX(P) < W - 10) dim(g, MX(0), MX(P), MY(T) + 52, `${Cm.P} = 2KT = ${f1(P)} ${Cm.mm}`);

    const r = locate(st.S, T, K);
    const legs = Math.min(3, r.leg);
    const legS = T / Math.cos(b);
    const pts = [[0, 0]];
    for (let n = 1; n < legs; n++) pts.push([n * legS * Math.sin(b), n % 2 ? T : 0]);
    pts.push([r.l, r.d]);
    for (let i = 1; i < pts.length; i++) line(g, MX(pts[i - 1][0]), MY(pts[i - 1][1]), MX(pts[i][0]), MY(pts[i][1]), LEG_C[Math.min(i - 1, 2)], 3.2);
    const [qx, qy] = [MX(r.l), MY(r.d)];
    line(g, qx, Y0, qx, qy, C.inc, 1.3, { 'stroke-dasharray': '4 3' });
    line(g, MX(0), Y0 - 6, qx, Y0 - 6, C.good, 1.5, { 'marker-start': 'url(#ar-good)', 'marker-end': 'url(#ar-good)' });
    tx(g, (MX(0) + qx) / 2 + 30, Y0 - 12, `l ${f1(r.l)}`, { fill: C.good, 'font-size': 12, 'text-anchor': 'middle' });
    el('circle', { cx: qx, cy: qy, r: 6, fill: C.inc, stroke: '#0f172a', 'stroke-width': 2 }, g);
    tx(g, qx + 10, qy + (r.d > T / 2 ? -10 : 18), `d ${f1(r.d)}`, { fill: C.inc, 'font-size': 12 });
    Cm.legs.forEach((s, i) => {
      line(g, W - 230 + i * 76, 20, W - 210 + i * 76, 20, LEG_C[i], 3);
      tx(g, W - 205 + i * 76, 24, s, { fill: LEG_C[i], 'font-size': 12 });
    });

    dd.T.textContent = `${T} ${Cm.mm}`;
    dd.K.textContent = `${K}`;
    dd.beta.textContent = `${f1((b * 180) / Math.PI)}°`;
    dd.P.textContent = `${f1(P)} ${Cm.mm}`;
    dd.S.textContent = `${f1(st.S)} ${Cm.mm}`;
    dd.h.textContent = `${f2(r.h)} ${Cm.mm}`;
    dd.leg.textContent = Cm.legs[Math.min(r.leg, 3) - 1];
    dd.leg.style.color = LEG_C[Math.min(r.leg, 3) - 1];
    dd.l.textContent = `${f2(r.l)} ${Cm.mm}`;
    dd.d.textContent = `${f2(r.d)} ${Cm.mm}`;
    hl([0, 1, r.leg === 1 ? 2 : r.leg === 2 ? 3 : -1]);
  }
  update();
  help = teach(main, side, ctl, ctx, 'skip',
    () => ({ leg1: L.leg1, leg2: L.leg2, thick: L.thick, beam: L.flips >= 2 }),
    async (d) => {
      const setT = (v) => { slT.set(Math.round(v)); L.thick = true; track(); };
      const setS = (v) => { slS.set(+v.toFixed(1)); track(); };
      if (!st.beam) setBeam(true);
      if (st.T !== demo.default) await d.lerp(st.T, demo.default, 600, setT);
      await d.lerp(st.S, 0, 600, setS);
      await d.wait(500);
      const legS = st.T / Math.cos(b);
      await d.lerp(0, legS * 0.9, 2600, setS);
      await d.wait(1500);
      await d.lerp(legS * 0.9, legS * 1.6, 2200, setS);
      await d.wait(1800);
      await d.lerp(st.T, demo.max, 1800, setT);
      await d.wait(1200);
      await d.lerp(st.T, demo.default, 1200, setT);
      await d.wait(600);
      setBeam(false);
      await d.wait(1300);
      setBeam(true);
      help.tick();
    });
  return {
    stop() { help.stop(); },
    set(v) { if (v.T != null) slT.set(v.T); if (v.S != null) slS.set(v.S); },
    state: () => ({ ...st, ...locate(st.S, st.T, K) }),
  };
}

// ---------------------------------------------------------------- block + A-scan
function renderBlock(main, side, ctx) {
  const X = ctx.text;
  const Cm = X.common;
  const B = X.block;
  const blk = ctx.blocks.blocks['CSK-IIA-1'];
  const T = blk.T_mm;
  const Lb = blk.length_mm;
  const m = beamModel(ctx.rules, T);
  const K = m.p.K;
  const b = m.p.beta;
  const els = blk.holes.map((h, i) => sdhElements(h.x_mm, 0, h.z_mm, blk.hole_phi_mm, -blk.hole_length_mm / 2, blk.hole_length_mm / 2, i));
  const all = els.flat();
  const off = (m.p.cs * m.p.delayUs * 1e-3) / 2;
  const st = { px: 80, dir: -1, zero: true, gain: 40, mode: 'S', peak: null, moved: false };
  const L = LEARN.block;
  let help = null;
  const user = () => help?.cancel();

  const ctl = headOf(main, B.title);
  const sDir = seg(ctl, [['-1', B.dir_left], ['1', B.dir_right]], String(st.dir), (v) => { user(); st.dir = +v; st.px = st.dir < 0 ? 80 : 190; st.moved = false; update(); });
  const sMode = seg(ctl, [['S', B.scales.S], ['l', B.scales.l], ['h', B.scales.h]], st.mode, (v) => { user(); setMode(v); });
  const sZero = seg(ctl, [['on', B.zero_on], ['off', B.zero_off]], 'on', (v) => { user(); setZero(v === 'on'); });
  const slG = slider(ctl, B.gain, 20, 70, 1, st.gain, (v) => { st.gain = v; update(); });
  slG.input.addEventListener('input', user);
  function setMode(v) {
    st.mode = v;
    sMode.set(v);
    if (v !== 'S') L.modes.add(v);
    update();
  }
  function setZero(on) {
    st.zero = on;
    sZero.set(on ? 'on' : 'off');
    if (!on) L.zeroOff = true;
    else if (L.zeroOff) L.zero = true;
    update();
  }

  const W = 640;
  const sc = 2;
  const X0 = 20;
  const Y0 = 64;
  const MX = (v) => X0 + v * sc;
  const MY = (v) => Y0 + v * sc;
  const svg = el('svg', { viewBox: `0 0 ${W} 196`, class: 'dg-svg ag-bm-block', role: 'img', style: 'touch-action: none' });
  defs(svg);
  // Steel / holes / beam ignore pointer so grabs go to the probe housing.
  const gScene = el('g', { style: 'pointer-events: none' }, svg);
  el('rect', { x: MX(0), y: Y0, width: Lb * sc, height: T * sc, fill: C.steel, opacity: 0.6, stroke: C.steelStroke }, gScene);
  tx(gScene, MX(Lb) - 4, MY(T) - 6, `T ${T}`, { fill: C.muted, 'font-size': 11, 'text-anchor': 'end' });
  const gBeam = el('g', {}, gScene);
  for (const h of blk.holes) {
    el('circle', { cx: MX(h.x_mm), cy: MY(h.z_mm), r: 3, fill: '#1e293b', stroke: '#64748b', 'stroke-width': 1.2 }, gScene);
    tx(gScene, MX(h.x_mm) + (h.x_mm < Lb / 2 ? -7 : 7), MY(h.z_mm) + 4, `${h.z_mm}`, { fill: C.muted, 'font-size': 10, 'text-anchor': h.x_mm < Lb / 2 ? 'end' : 'start', 'font-family': 'Arial, sans-serif' });
  }
  const gTop = el('g', { style: 'pointer-events: all; cursor: grab' }, svg);
  const as = el('svg', { viewBox: `0 0 ${AS.w} ${AS.h}`, class: 'dg-svg ag-bm-ascan', role: 'img' });
  main.append(svg, as);
  el('rect', { x: AS.x0, y: AS.y0, width: AS.x1 - AS.x0, height: AS.y1 - AS.y0, fill: '#06110c', stroke: '#1f3a2c' }, as);
  for (let i = 1; i < 10; i++) {
    const x = AS.x0 + ((AS.x1 - AS.x0) * i) / 10;
    line(as, x, AS.y0, x, AS.y1, '#173024', 1);
  }
  for (let i = 1; i < 10; i++) {
    const y = AS.y1 - ((AS.y1 - AS.y0) * i) / 10;
    line(as, AS.x0, y, AS.x1, y, '#173024', 1);
  }
  for (const p of [0, 50, 100]) tx(as, AS.x0 - 6, AS.y1 - ((AS.y1 - AS.y0) * p) / 100 + 4, p === 100 ? `${p}${B.fsh}` : `${p}`, { fill: CRT_INK, 'font-size': 10, 'text-anchor': 'end', 'font-family': 'Arial, sans-serif' });
  const gAx = el('g', {}, as);
  const gTr = el('g', {}, as);

  const noise = Float64Array.from({ length: 2048 }, (_, i) => {
    const v = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
    return v - Math.floor(v);
  });

  const read = card(side, Cm.readout);
  const dd = readouts(read, ['probe_x', 'amp', 'reading', 'S', 'leg', 'l', 'd', 'hole_x', 'nearest'], { ...Cm, ...B, reading: '', S: Cm.S });
  const readLabel = dd.reading.previousElementSibling;
  const inst = card(side, B.ascan);
  const ddi = readouts(inst, ['delay', 'offset'], B);
  ddi.delay.textContent = `${f2(m.p.delayUs)} ${Cm.us}`;
  const hl = formulaCard(side, ctx);

  const clampPx = (px) => {
    const lo = st.dir < 0 ? HOUSING.front : HOUSING.back;
    const hi = Lb - (st.dir < 0 ? HOUSING.back : HOUSING.front);
    return Math.max(lo, Math.min(hi, px));
  };

  let drag = null; // { off } grab offset so dragging the housing does not jump to the index mark
  let probeHit = { xl: 0, xr: 0, yt: 0, yb: 0 };
  const onProbe = (p) => p.x >= probeHit.xl && p.x <= probeHit.xr && p.y >= probeHit.yt && p.y <= probeHit.yb;
  gTop.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const p = svgPoint(svg, e);
    if (!onProbe(p)) return;
    user();
    const xMm = (p.x - X0) / sc;
    drag = { off: st.px - xMm };
    svg.classList.add('dragging');
    gTop.setPointerCapture(e.pointerId);
    e.preventDefault();
    e.stopPropagation();
  });
  gTop.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const p = svgPoint(svg, e);
    st.px = Math.round(clampPx((p.x - X0) / sc + drag.off) * 2) / 2;
    st.moved = true;
    L.goal = true;
    update();
  });
  const endDrag = () => {
    drag = null;
    svg.classList.remove('dragging');
  };
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) gTop.addEventListener(ev, endDrag);
  function onKey(e) {
    if (!ctx.active() || /input|textarea|select/i.test(e.target.tagName)) return;
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    user();
    st.px = clampPx(st.px + (e.key === 'ArrowLeft' ? -1 : 1) * (e.shiftKey ? 5 : 0.5));
    st.moved = true;
    update();
  }
  const poseAt = (px) => ({ px, py: 0, phi: st.dir < 0 ? Math.PI : 0 });
  const ampAt = (px, i) => {
    const r = m.peak(els[i], poseAt(px));
    return r.P > 0 ? m.percent(r.P, st.gain) : 0;
  };
  const bestAt = (px) => Math.max(0, ...els.map((_, i) => ampAt(px, i)));
  window.addEventListener('keydown', onKey);

  const rangeS = () => RANGE[st.mode] / (st.mode === 'l' ? Math.sin(b) : st.mode === 'h' ? Math.cos(b) : 1);

  function update() {
    st.px = clampPx(st.px);
    const pose = { px: st.px, py: 0, phi: st.dir < 0 ? Math.PI : 0 };
    slG.out.textContent = `${st.gain} ${B.dB}`;
    const shift = st.zero ? 0 : off;
    const Rs = rangeS();

    clear(gBeam);
    const reach = st.dir < 0 ? st.px : Lb - st.px;
    beamBand(gBeam, m, st.px, st.dir, T, Math.min(Rs, reach / Math.sin(b)), MX, MY, { opacity: 0.2 });
    axisPath(gBeam, st.px, st.dir, T, K, Math.min(Rs, reach / Math.sin(b)), MX, MY, 1.2, 2);

    let best = null;
    els.forEach((e, i) => {
      const r = m.peak(e, pose);
      if (!(r.P > 0)) return;
      const pct = m.percent(r.P, st.gain);
      if (!best || pct > best.pct) best = { i, pct, S: r.S, leg: r.leg };
    });
    if (best && best.pct < 5) best = null;
    st.peak = null;
    clear(gTop);
    probeHit = probeShape(gTop, st.px, st.dir, MX, MY, '', { hit: true });
    if (best) {
      const Sr = best.S + shift;
      const loc = locate(Sr, T, K);
      const hx = st.px + st.dir * loc.l;
      const h = blk.holes[best.i];
      st.peak = { id: h.id, pct: best.pct, S: Sr, leg: loc.leg, l: loc.l, d: loc.d, x: hx, reading: scaleValue(st.mode, Sr, b) };
      const cx = MX(hx);
      const cy = MY(Math.max(0, Math.min(T, loc.d)));
      if (cx > 4 && cx < W - 4) {
        line(gTop, cx - 7, cy, cx + 7, cy, C.inc, 2);
        line(gTop, cx, cy - 7, cx, cy + 7, C.inc, 2);
      }
      if (st.moved && best.pct >= 20 && best.pct >= 0.98 * Math.max(ampAt(st.px - 0.5, best.i), ampAt(st.px + 0.5, best.i))) {
        L.peak = true;
        if (st.dir > 0) L.dir = true;
      }
    }
    help?.tick();

    clear(gAx);
    clear(gTr);
    const XS = (s) => AS.x0 + (s / Rs) * (AS.x1 - AS.x0);
    for (let i = 0; i <= 10; i += 2) {
      const v = (RANGE[st.mode] * i) / 10;
      tx(gAx, AS.x0 + ((AS.x1 - AS.x0) * i) / 10, AS.y1 + 16, `${v}`, { fill: CRT_INK, 'font-size': 11, 'text-anchor': 'middle', 'font-family': 'Arial, sans-serif' });
    }
    tx(gAx, AS.x1, AS.h - 2, `${B.scales[st.mode]} (${Cm.mm})`, { fill: CRT_INK, 'font-size': 11, 'text-anchor': 'end' });
    if (st.zero) {
      [1, 2].forEach((n) => {
        const s = (n * T) / Math.cos(b);
        if (s > Rs) return;
        line(gAx, XS(s), AS.y0, XS(s), AS.y1, '#64748b', 1, { 'stroke-dasharray': '4 4' });
      });
      [0, 1, 2].forEach((n) => {
        const s0 = (n * T) / Math.cos(b);
        const s1 = Math.min(Rs, ((n + 1) * T) / Math.cos(b));
        if (s0 >= Rs) return;
        tx(gAx, (XS(s0) + XS(s1)) / 2, AS.y0 + 14, Cm.legs[n], { fill: LEG_C[n], 'font-size': 11, 'text-anchor': 'middle', opacity: 0.85 });
      });
    }

    const n = 640;
    const ax = Array.from({ length: n + 1 }, (_, i) => (Rs * i) / n - shift);
    const tr = m.ascan(all, pose, ax);
    const g10 = 10 ** ((st.gain - 40) / 20);
    let d = '';
    for (let i = 0; i <= n; i++) {
      const Sscr = (Rs * i) / n;
      let v = m.percent(tr[i], st.gain) + 1.2 * g10 * noise[i % noise.length];
      if (!st.zero) v += 130 * Math.exp(-((Sscr / 2.2) ** 2)) + 18 * g10 * Math.exp(-Sscr / 6) * Math.abs(Math.sin(Sscr * 2.1));
      const y = AS.y1 - (Math.min(v, 104) / 100) * (AS.y1 - AS.y0);
      d += `${i ? 'L' : 'M'} ${XS(Sscr).toFixed(1)} ${y.toFixed(1)} `;
    }
    el('path', { d, fill: 'none', stroke: '#34d399', 'stroke-width': 1.6, 'stroke-linejoin': 'round' }, gTr);
    if (st.peak && st.peak.S <= Rs) {
      const x = XS(st.peak.S);
      const y = AS.y1 - (Math.min(st.peak.pct, 104) / 100) * (AS.y1 - AS.y0);
      el('path', { d: `M ${x} ${y - 4} l -5 -9 h 10 z`, fill: C.inc }, gTr);
      tx(gTr, x + 8, Math.max(AS.y0 + 28, y - 6), `${f1(st.peak.reading)}`, { fill: C.inc, 'font-size': 12, 'font-family': 'Arial, sans-serif' });
    }

    readLabel.textContent = `${B.scale} · ${B.scales[st.mode]}`;
    dd.probe_x.textContent = `${f1(st.px)} ${Cm.mm}`;
    ddi.offset.textContent = st.zero ? `0.0 ${Cm.mm}` : `${f1(off)} ${Cm.mm}`;
    const P = st.peak;
    const none = B.none;
    dd.amp.textContent = P ? `${f1(P.pct)} ${B.fsh}` : none;
    dd.reading.textContent = P ? `${f1(P.reading)} ${Cm.mm}` : '—';
    dd.S.textContent = P ? `${f1(P.S)} ${Cm.mm}` : '—';
    dd.leg.textContent = P ? Cm.legs[Math.min(P.leg, 3) - 1] : '—';
    dd.leg.style.color = P ? LEG_C[Math.min(P.leg, 3) - 1] : '';
    dd.l.textContent = P ? `${f1(P.l)} ${Cm.mm}` : '—';
    dd.d.textContent = P ? `${f1(P.d)} ${Cm.mm}` : '—';
    dd.hole_x.textContent = P ? `${f1(P.x)} ${Cm.mm}` : '—';
    const h = P && blk.holes.find((q) => q.id === P.id);
    dd.nearest.textContent = h ? `${h.x_mm} / ${h.z_mm} ${Cm.mm}` : '—';
    hl([1, P ? (P.leg === 1 ? 2 : 3) : -1, st.zero ? -1 : 4]);
  }
  update();
  const glide = async (d, from, to) => {
    let at = from;
    let top = -1;
    for (let x = Math.min(from, to); x <= Math.max(from, to); x += 0.5) {
      const a = bestAt(clampPx(x));
      if (a > top) { top = a; at = clampPx(x); }
    }
    const go = (x) => { st.px = Math.round(clampPx(x) * 2) / 2; st.moved = true; update(); };
    await d.lerp(st.px, from, 500, go);
    await d.lerp(from, to, 2600, go);
    await d.lerp(to, at, 1400, go);
    go(at);
  };
  help = teach(main, side, ctl, ctx, 'block',
    () => ({ goal: L.goal, peak: L.peak, scale: L.modes.has('l') && L.modes.has('h'), zero: L.zero, dir: L.dir }),
    async (d) => {
      L.goal = true;
      help?.tick();
      st.dir = -1;
      sDir.set('-1');
      setMode('S');
      setZero(true);
      await d.wait(500);
      await glide(d, 100, 60);
      await d.wait(900);
      if (st.peak) {
        const gain = Math.max(20, Math.min(70, Math.round(st.gain + 20 * Math.log10(80 / st.peak.pct))));
        await d.lerp(st.gain, gain, 900, (v) => { st.gain = Math.round(v); slG.input.value = st.gain; update(); });
      }
      await d.wait(1400);
      for (const v of ['l', 'h', 'S']) {
        setMode(v);
        await d.wait(1700);
      }
      setZero(false);
      await d.wait(2000);
      setZero(true);
      await d.wait(1200);
      st.dir = 1;
      sDir.set('1');
      st.px = 170;
      update();
      await d.wait(600);
      await glide(d, 170, 210);
    },
    (i) => {
      if (i > 0) { L.goal = true; help?.tick(); }
    });
  return {
    stop() { help.stop(); window.removeEventListener('keydown', onKey); },
    set(v) {
      if (v.dir != null) { st.dir = v.dir; sDir.set(String(v.dir)); }
      if (v.px != null) st.px = v.px;
      if (v.zero != null) { st.zero = v.zero; sZero.set(v.zero ? 'on' : 'off'); }
      if (v.mode) { st.mode = v.mode; sMode.set(v.mode); }
      if (v.gain != null) { st.gain = v.gain; slG.input.value = v.gain; }
      update();
    },
    state: () => ({ ...st, off }),
  };
}

// ---------------------------------------------------------------- exercise
function renderExercise(main, side, ctx) {
  const X = ctx.text;
  const Cm = X.common;
  const E = X.exercise;
  const kRows = ctx.std?.items?.probe_selection?.rows;
  const KF = X.formulas.findIndex((f) => f.id === 'kmin');
  const newProblem = () => (kRows && Math.random() < 1 / 3 ? makeKProblem(Math.random, kRows) : makeProblem());
  const st = { pb: newProblem(), done: 0, right: 0, checked: false, leg: 0, K: null, demoPb: null };
  const L = LEARN.exercise;
  let help = null;
  let cur = {};
  const ctl = headOf(main, E.title, E.goal);
  const nextB = button(ctl, E.next, () => next());
  nextB.addEventListener('pointerdown', () => help?.cancel());
  const svg = el('svg', { viewBox: '0 0 640 230', class: 'dg-svg ag-bm-ex', role: 'img' });
  defs(svg);
  const g = el('g', {}, svg);
  const qbox = make('div', 'ag-bm-q');
  qbox.addEventListener('pointerdown', () => help?.cancel());
  qbox.addEventListener('input', () => {
    help?.cancel();
    const ins = [...qbox.querySelectorAll('input')];
    if (ins.length && ins.every((x) => x.value.trim() !== '')) L.fill = true;
    help?.tick();
  });
  main.append(svg, qbox);
  // First judgement of a question counts toward the tally and the learning record; a demonstrated question does not.
  const judged = (ok, kind) => {
    if (st.checked) return;
    st.checked = true;
    L.check = true;
    if (st.demoPb === st.pb) return;
    st.done++;
    if (ok) {
      st.right++;
      L[kind] = true;
    }
    learnScore(document.body.dataset.learningRoute || 'angle-principle', 'exercise', ok ? 1 : 0, 1);
  };
  const hl = formulaCard(side, ctx);
  const tally = card(side, E.score);
  const tallyText = make('p', 'ag-bm-tally');
  tally.appendChild(tallyText);

  // Weld section: cap half width a at the scanning face, root half width b; probe front on the cap edge, beam toward the weld.
  function sketchK(show) {
    clear(g);
    const { T, a, b, l0, kmin } = st.pb;
    const xi = a + l0;
    const reach = xi + HOUSING.back;
    const left = -Math.max(a, b) - 12;
    const sc = Math.min(4, 560 / (reach - left), 120 / T);
    const xc = 320 - ((reach + left) / 2) * sc;
    const Y0 = 72;
    const MX = (v) => xc + v * sc;
    const MY = (v) => Y0 + v * sc;
    el('rect', { x: 10, y: Y0, width: 620, height: T * sc, fill: C.steel, opacity: 0.6, stroke: C.steelStroke }, g);
    el('path', { d: `M ${MX(-a)} ${MY(0)} L ${MX(a)} ${MY(0)} L ${MX(b)} ${MY(T)} L ${MX(-b)} ${MY(T)} Z`, fill: '#8a7350', opacity: 0.55, stroke: '#d8b98a', 'stroke-width': 1 }, g);
    const yTop = MY(-Math.min(HOUSING.height, 40 / sc));
    el('rect', { x: MX(a), y: yTop, width: (l0 + HOUSING.back) * sc, height: MY(0) - yTop, rx: 3, fill: '#475569', stroke: '#cbd5e1', 'stroke-width': 1 }, g);
    el('circle', { cx: MX(xi), cy: MY(0), r: 3.5, fill: C.accent }, g);
    tx(g, 14, MY(T / 2), `T ${T}`, { fill: C.muted, 'font-size': 11, 'text-anchor': 'middle', transform: `rotate(-90 14 ${MY(T / 2)})` });
    dim(g, MX(0), MX(a), yTop - 22, `a ${a}`);
    dim(g, MX(a), MX(xi), yTop - 22, `l₀ ${l0}`);
    dim(g, MX(0), MX(b), MY(T) + 14, `b ${b}`);
    line(g, MX(0), yTop - 26, MX(0), MY(T) + 8, C.muted, 1, { 'stroke-dasharray': '3 3' });
    if (show) {
      line(g, MX(xi), MY(0), MX(xi - kmin * T), MY(T), LEG_C[0], 2.2);
      tx(g, MX(xi - kmin * T) - 6, MY(T) - 6, `K ${f2(kmin)}`, { fill: LEG_C[0], 'font-size': 12, 'text-anchor': 'end' });
    }
  }

  function sketch(show) {
    if (st.pb.type === 'K') { sketchK(show); return; }
    clear(g);
    const { T, K } = st.pb;
    const P = 2 * K * T;
    const sc = Math.min(3, 520 / (P * 1.05 + 30));
    const x0 = 30 + HOUSING.back * sc;
    const Y0 = 90;
    const MX = (v) => x0 + v * sc;
    const MY = (v) => Y0 + v * sc;
    el('rect', { x: 10, y: Y0, width: 620, height: T * sc, fill: C.steel, opacity: 0.6, stroke: C.steelStroke }, g);
    probeShape(g, 0, 1, MX, MY, `K${K}`);
    tx(g, 14, MY(T / 2), `T ${T}`, { fill: C.muted, 'font-size': 11, 'text-anchor': 'middle', transform: `rotate(-90 14 ${MY(T / 2)})` });
    const Smax = Math.min((2.2 * T) / Math.cos(Math.atan(K)), (610 - x0) / sc / Math.sin(Math.atan(K)));
    axisPath(g, 0, 1, T, K, Smax, MX, MY, 1.2, 3);
    if (show) {
      const r = st.pb.ans;
      el('circle', { cx: MX(r.l), cy: MY(r.d), r: 6, fill: C.inc, stroke: '#0f172a', 'stroke-width': 2 }, g);
      line(g, MX(r.l), Y0, MX(r.l), MY(r.d), C.inc, 1.2, { 'stroke-dasharray': '4 3' });
      line(g, MX(r.l), MY(T), MX(r.l), MY(T) + 24, C.good, 1, { 'stroke-dasharray': '3 3' });
      dim(g, MX(0), MX(r.l), MY(T) + 18, `l ${f2(r.l)}`, C.good);
      tx(g, MX(r.l) + 10, MY(r.d) + 4, `d ${f2(r.d)}`, { fill: C.inc, 'font-size': 12 });
    }
  }

  function input(label, key) {
    const wrap = make('label', 'ag-bm-in');
    wrap.appendChild(make('span', '', label));
    const inp = Object.assign(document.createElement('input'), { type: 'number', step: '0.1', inputMode: 'decimal' });
    inp.dataset.key = key;
    wrap.append(inp, make('span', 'unit', Cm.mm));
    return { wrap, inp };
  }

  function renderK() {
    const pb = st.pb;
    st.checked = false;
    st.K = null;
    qbox.innerHTML = '';
    const given = make('div', 'ag-bm-given');
    given.appendChild(make('span', 'ag-tag', `${E.given} · ${E.type_K}`));
    for (const [k, v] of [[Cm.T, `${pb.T} ${Cm.mm}`], [E.a, `${pb.a} ${Cm.mm}`], [E.b, `${pb.b} ${Cm.mm}`], [E.l0, `${pb.l0} ${Cm.mm}`]]) {
      const s = make('span', 'ag-bm-gv');
      s.append(make('em', '', k), make('b', '', v));
      given.appendChild(s);
    }
    const form = make('div', 'ag-bm-form');
    form.appendChild(make('span', 'ag-tag', E.answer));
    const kWrap = make('label', 'ag-bm-in');
    const kIn = Object.assign(document.createElement('input'), { type: 'number', step: '0.01', inputMode: 'decimal' });
    kIn.dataset.key = 'kmin';
    kWrap.append(make('span', '', E.kmin), kIn);
    form.appendChild(kWrap);
    const kBox = make('div', 'seg');
    for (const k of K_OPTIONS) {
      const bt = make('button', '', k.toFixed(1));
      bt.type = 'button';
      bt.dataset.k = String(k);
      bt.addEventListener('click', () => { st.K = k; kBox.querySelectorAll('button').forEach((x) => x.classList.toggle('active', x === bt)); });
      kBox.appendChild(bt);
    }
    const pickWrap = make('label', 'ag-bm-in');
    pickWrap.append(make('span', '', E.pick_K), kBox);
    form.appendChild(pickWrap);
    const chk = make('button', 'ag-btn', E.check);
    chk.type = 'button';
    const showB = make('button', 'ag-chip', E.show);
    showB.type = 'button';
    form.append(chk, showB);
    const res = make('div', 'ag-bm-res');
    qbox.append(given, form, res);

    const solution = () => {
      const box = make('div', 'ag-bm-sol');
      box.appendChild(make('p', '', `K ≥ (a + b + l₀) / T = (${pb.a} + ${pb.b} + ${pb.l0}) / ${pb.T} = ${f2(pb.kmin)}`));
      const v = { T: pb.T, k0: pb.range[0].toFixed(1), k1: pb.range[1].toFixed(1), ok: pb.ok.map((k) => k.toFixed(1)).join(' / ') };
      box.appendChild(make('p', '', E.table_K.replace(/\{(\w+)\}/g, (_, k) => String(v[k]))));
      return box;
    };
    const showAll = () => {
      sketch(true);
      hl(KF >= 0 ? [KF] : []);
    };
    chk.addEventListener('click', () => {
      const gr = gradeK(pb, { kmin: parseFloat(kIn.value), K: st.K });
      judged(gr.ok, 'kval');
      help?.tick();
      res.innerHTML = '';
      res.append(make('p', gr.ok ? 'ok' : 'bad', `${gr.ok ? E.right : E.wrong} (${E.tol_K})`), solution());
      kIn.classList.toggle('bad', !gr.kOk);
      kBox.classList.toggle('bad', !gr.pickOk);
      showAll();
      tallyText.textContent = `${st.right} / ${st.done}`;
    });
    showB.addEventListener('click', () => {
      res.innerHTML = '';
      res.appendChild(solution());
      showAll();
    });
    cur = { kIn, kBox, chk, showB, res };
    sketch(false);
    hl([]);
    tallyText.textContent = `${st.right} / ${st.done}`;
  }

  function render() {
    const pb = st.pb;
    if (pb.type === 'K') { renderK(); return; }
    st.checked = false;
    st.leg = 0;
    qbox.innerHTML = '';
    const given = make('div', 'ag-bm-given');
    given.appendChild(make('span', 'ag-tag', `${E.given} · ${pb.type === 'S' ? E.type_S : E.type_l}`));
    const items = [[Cm.T, `${pb.T} ${Cm.mm}`], [Cm.K, `${pb.K}`], pb.type === 'S' ? [Cm.S, `${f1(pb.S)} ${Cm.mm}`] : [Cm.l, `${f1(pb.l)} ${Cm.mm}`]];
    for (const [k, v] of items) {
      const s = make('span', 'ag-bm-gv');
      s.append(make('em', '', k), make('b', '', v));
      given.appendChild(s);
    }
    const form = make('div', 'ag-bm-form');
    form.appendChild(make('span', 'ag-tag', E.answer));
    const legBox = make('div', 'seg');
    Cm.legs.slice(0, 2).forEach((s, i) => {
      const bt = make('button', '', s);
      bt.type = 'button';
      bt.dataset.leg = String(i + 1);
      bt.addEventListener('click', () => {
        st.leg = i + 1;
        legBox.querySelectorAll('button').forEach((x) => x.classList.toggle('active', x === bt));
        L.leg = true;
        help?.tick();
      });
      legBox.appendChild(bt);
    });
    const legWrap = make('label', 'ag-bm-in');
    legWrap.append(make('span', '', Cm.leg), legBox);
    form.appendChild(legWrap);
    const lIn = pb.type === 'S' ? input(Cm.l, 'l') : null;
    const dIn = input(Cm.d, 'd');
    if (lIn) form.appendChild(lIn.wrap);
    form.appendChild(dIn.wrap);
    const chk = make('button', 'ag-btn', E.check);
    chk.type = 'button';
    const showB = make('button', 'ag-chip', E.show);
    showB.type = 'button';
    form.append(chk, showB);
    const res = make('div', 'ag-bm-res');
    qbox.append(given, form, res);

    const solution = () => {
      const r = pb.ans;
      const cb = Math.cos(Math.atan(pb.K));
      const sb = Math.sin(Math.atan(pb.K));
      const lines = [];
      if (pb.type === 'l') lines.push(`S = l / sinβ = ${f1(pb.l)} / ${sb.toFixed(4)} = ${f2(r.S)} ${Cm.mm}`);
      lines.push(`S·cosβ = ${f2(r.S)} × ${cb.toFixed(4)} = ${f2(r.h)} ${Cm.mm} ${r.h <= pb.T ? '≤' : '>'} T = ${pb.T} → ${Cm.legs[r.leg - 1]}`);
      if (pb.type === 'S') lines.push(`l = S·sinβ = ${f2(r.l)} ${Cm.mm}`);
      lines.push(r.leg === 1 ? `d = S·cosβ = ${f2(r.d)} ${Cm.mm}` : `d = 2T − S·cosβ = ${2 * pb.T} − ${f2(r.h)} = ${f2(r.d)} ${Cm.mm}`);
      const box = make('div', 'ag-bm-sol');
      for (const s of lines) box.appendChild(make('p', '', s));
      return box;
    };
    chk.addEventListener('click', () => {
      const a = { leg: st.leg, d: parseFloat(dIn.inp.value), l: lIn ? parseFloat(lIn.inp.value) : NaN };
      const gr = gradeAnswer(pb, a);
      judged(gr.ok, 'right');
      help?.tick();
      res.innerHTML = '';
      const v = make('p', gr.ok ? 'ok' : 'bad', `${gr.ok ? E.right : E.wrong} (${E.tol})`);
      res.append(v, solution());
      [[lIn, gr.lOk], [dIn, gr.dOk]].forEach(([x, ok]) => x?.inp.classList.toggle('bad', !ok));
      legBox.classList.toggle('bad', !gr.legOk);
      sketch(true);
      hl([1, pb.ans.leg === 1 ? 2 : 3]);
      tallyText.textContent = `${st.right} / ${st.done}`;
    });
    showB.addEventListener('click', () => {
      res.innerHTML = '';
      res.appendChild(solution());
      sketch(true);
      hl([1, pb.ans.leg === 1 ? 2 : 3]);
    });
    cur = { legBox, lIn, dIn, chk, showB, res };
    sketch(false);
    hl([]);
    tallyText.textContent = `${st.right} / ${st.done}`;
  }
  function next() {
    st.pb = newProblem();
    render();
  }
  render();
  help = teach(main, side, ctl, ctx, 'exercise',
    () => ({ leg: L.leg, fill: L.fill, check: L.check, right: L.right, kval: L.kval }),
    async (d) => {
      next();
      st.demoPb = st.pb;
      const pb = st.pb;
      await d.wait(1200);
      cur.showB.click();
      const lines = [...cur.res.querySelectorAll('.ag-bm-sol p')];
      lines.forEach((p) => { p.hidden = true; });
      for (const p of lines) {
        await d.wait(900);
        p.hidden = false;
      }
      await d.wait(1200);
      if (pb.type === 'K') {
        await typeIn(d, cur.kIn, pb.kmin.toFixed(2));
        await d.wait(500);
        cur.kBox.querySelector(`button[data-k="${pb.ok[0]}"]`)?.click();
      } else {
        cur.legBox.querySelector(`button[data-leg="${pb.ans.leg}"]`)?.click();
        await d.wait(700);
        if (cur.lIn) await typeIn(d, cur.lIn.inp, pb.ans.l.toFixed(1));
        await d.wait(300);
        await typeIn(d, cur.dIn.inp, pb.ans.d.toFixed(1));
      }
      L.fill = true;
      help.tick();
      await d.wait(700);
      cur.chk.click();
    });
  return {
    stop() { help.stop(); },
    set(v) { if (v.problem) { st.pb = v.problem; render(); } },
    state: () => ({ ...st }),
  };
}

export { make, headOf, card, readouts, svgPoint, beamBand, axisPath, dim, LEG_C, AS };

const RENDER = { skip: renderSkip, block: renderBlock, exercise: renderExercise };
export const BEAM_TOPICS = Object.keys(RENDER);

export function renderBeamTopic(topic, main, side, ctx) {
  main.innerHTML = '';
  side.innerHTML = '';
  return RENDER[topic](main, side, ctx);
}
