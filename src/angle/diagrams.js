// Interactive principle diagrams (SVG 640x360). All visible text comes from ui_strings.json.
import { logoGroup, LOGO_INK } from './logo.js';

const NS = 'http://www.w3.org/2000/svg';
const W = 640;
const H = 360;
const C = {
  text: '#1b2330', muted: '#64748b', wedge: 'rgba(2,132,199,0.14)', wedgeStroke: '#0284c7',
  steel: '#c5ccd6', steelStroke: '#64748b', inc: '#d97706', L: '#0284c7', S: '#dc2626', surf: '#7c3aed',
  element: '#f59e0b', electrode: '#94a3b8', backing: '#e2e8f0', absorber: '#cbd5e1', accent: '#0284c7', good: '#15803d',
  paper: '#f8fafc', track: '#e2e8f0', scope: '#0b1220',
};
const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;
const f1 = (v) => v.toFixed(1);

function el(tag, attrs = {}, parent = null) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (parent) parent.appendChild(e);
  return e;
}
function tx(parent, x, y, s, attrs = {}) {
  const t = el('text', { x, y, fill: C.text, 'font-size': 13, ...attrs }, parent);
  t.textContent = s;
  return t;
}
function line(parent, x1, y1, x2, y2, stroke, w = 2, extra = {}) {
  return el('line', { x1, y1, x2, y2, stroke, 'stroke-width': w, 'stroke-linecap': 'round', ...extra }, parent);
}
function clear(g) { while (g.firstChild) g.removeChild(g.firstChild); }

function defs(svg) {
  const d = el('defs', {}, svg);
  for (const [k, c] of Object.entries({ inc: C.inc, L: C.L, S: C.S, surf: C.surf, accent: C.accent, muted: C.muted, text: C.text, good: C.good })) {
    const m = el('marker', { id: `ar-${k}`, viewBox: '0 0 10 10', refX: 8, refY: 5, markerWidth: 13, markerHeight: 13, markerUnits: 'userSpaceOnUse', orient: 'auto-start-reverse' }, d);
    el('path', { d: 'M0,0 L10,5 L0,10 z', fill: c }, m);
  }
  const p = el('pattern', { id: 'hatch-abs', width: 6, height: 6, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' }, d);
  el('rect', { width: 6, height: 6, fill: C.absorber }, p);
  line(p, 0, 0, 0, 6, '#94a3b8', 2);
  const q = el('pattern', { id: 'dots-back', width: 5, height: 5, patternUnits: 'userSpaceOnUse' }, d);
  el('rect', { width: 5, height: 5, fill: C.backing }, q);
  el('circle', { cx: 2.5, cy: 2.5, r: 0.9, fill: '#64748b' }, q);
}
function arrow(parent, x1, y1, x2, y2, key, w = 2.5, extra = {}) {
  return line(parent, x1, y1, x2, y2, C[key] || key, w, { 'marker-end': `url(#ar-${key})`, ...extra });
}

function seg(ctl, items, active, onChange) {
  const box = document.createElement('div');
  box.className = 'seg';
  const btns = items.map(([id, label]) => {
    const b = document.createElement('button');
    b.textContent = label;
    b.dataset.id = id;
    b.className = id === active ? 'active' : '';
    b.addEventListener('click', () => { btns.forEach((x) => x.classList.toggle('active', x === b)); onChange(id); });
    box.appendChild(b);
    return b;
  });
  ctl.appendChild(box);
  return { set(id) { btns.forEach((x) => x.classList.toggle('active', x.dataset.id === id)); } };
}
function slider(ctl, label, min, max, step, value, onInput) {
  const wrap = document.createElement('label');
  wrap.className = 'dg-slider';
  const span = document.createElement('span');
  span.textContent = label;
  const inp = document.createElement('input');
  Object.assign(inp, { type: 'range', min, max, step, value });
  const out = document.createElement('output');
  wrap.append(span, inp, out);
  inp.addEventListener('input', () => onInput(+inp.value));
  ctl.appendChild(wrap);
  return { input: inp, out, set(v) { inp.value = v; onInput(+v); } };
}
function button(ctl, label, onClick) {
  const b = document.createElement('button');
  b.className = 'chip';
  b.textContent = label;
  b.addEventListener('click', onClick);
  ctl.appendChild(b);
  return b;
}
function loop(fn) {
  let id = 0;
  const t0 = performance.now();
  const step = (t) => { fn((t - t0) / 1000); id = requestAnimationFrame(step); };
  id = requestAnimationFrame(step);
  return () => cancelAnimationFrame(id);
}
function polyLen(pts) {
  const acc = [0];
  for (let i = 1; i < pts.length; i++) acc.push(acc[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return acc;
}
function along(pts, acc, s) {
  const L = acc[acc.length - 1];
  s = Math.max(0, Math.min(L, s));
  let i = 1;
  while (i < acc.length - 1 && acc[i] < s) i++;
  const k = (s - acc[i - 1]) / (acc[i] - acc[i - 1] || 1);
  return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * k, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * k];
}

// ---------------------------------------------------------------- snell
function snell(svg, ctl, S, ctx) {
  const ph = ctx.derived.physics;
  const ref = ctx.manifest.reference_physics;
  const c1 = ref.wedge_cL_m_s;
  const cL2 = ref.steel_cL_m_s;
  const cS2 = ref.steel_cS_m_s;
  const O = [320, 185];
  el('rect', { x: 0, y: 0, width: W, height: O[1], fill: C.wedge }, svg);
  el('rect', { x: 0, y: O[1], width: W, height: H - O[1], fill: C.steel, opacity: 0.55 }, svg);
  line(svg, 0, O[1], W, O[1], C.steelStroke, 1.5);
  tx(svg, 14, 26, S.wedge, { fill: C.wedgeStroke });
  tx(svg, 14, H - 14, S.steel, { fill: C.steelStroke });
  const g = el('g', {}, svg);
  const R = 165;
  let alpha = ph.alpha_deg;
  const sl = slider(ctl, S.slider, 0, 80, 0.1, alpha, (v) => { alpha = v; draw(); });
  button(ctl, `${S.crit1} ${f1(ph.first_critical_deg)}°`, () => sl.set(ph.first_critical_deg));
  button(ctl, `${S.crit2} ${f1(ph.second_critical_deg)}°`, () => sl.set(ph.second_critical_deg));
  button(ctl, `${S.nominal} ${f1(ph.alpha_deg)}°`, () => sl.set(ph.alpha_deg));
  function draw() {
    clear(g);
    sl.out.textContent = `${f1(alpha)}°`;
    const a = rad(alpha);
    const s = [O[0] - R * Math.sin(a), O[1] - R * Math.cos(a)];
    arrow(g, s[0], s[1], O[0] - 4 * Math.sin(a), O[1] - 4 * Math.cos(a), 'inc', 3);
    tx(g, Math.max(8, s[0] - 10), Math.max(16, s[1] - 8), S.incident, { fill: C.inc });
    el('path', { d: `M ${O[0]} ${O[1] - 48} A 48 48 0 0 0 ${O[0] - 48 * Math.sin(a)} ${O[1] - 48 * Math.cos(a)}`, fill: 'none', stroke: C.inc, 'stroke-width': 1.5 }, g);
    tx(g, O[0] - 52 * Math.sin(a / 2) - 34, O[1] - 60 * Math.cos(a / 2) - 4, `α ${f1(alpha)}°`, { fill: C.inc, 'font-size': 12 });
    const sL = (Math.sin(a) * cL2) / c1;
    const sS = (Math.sin(a) * cS2) / c1;
    const rows = [];
    if (sL < 1) {
      const b = Math.asin(sL);
      const e = [O[0] + R * Math.sin(b), O[1] + R * Math.cos(b)];
      arrow(g, O[0], O[1], e[0], e[1], 'L', 2.5);
      tx(g, e[0] + 6, Math.min(H - 8, e[1]), `${S.refr_L} ${f1(deg(b))}°`, { fill: C.L, 'text-anchor': e[0] > 520 ? 'end' : 'start' });
    }
    if (sS < 1) {
      const b = Math.asin(sS);
      const e = [O[0] + R * Math.sin(b), O[1] + R * Math.cos(b)];
      arrow(g, O[0], O[1], e[0], e[1], 'S', 3);
      el('path', { d: `M ${O[0]} ${O[1] + 60} A 60 60 0 0 0 ${O[0] + 60 * Math.sin(b)} ${O[1] + 60 * Math.cos(b)}`, fill: 'none', stroke: C.S, 'stroke-width': 1.5 }, g);
      tx(g, O[0] + 66 * Math.sin(b / 2) + 4, O[1] + 70 * Math.cos(b / 2) + 10, `β ${f1(deg(b))}°`, { fill: C.S, 'font-size': 12 });
      tx(g, Math.min(e[0] + 6, W - 120), Math.min(H - 26, e[1] + 4), S.refr_S, { fill: C.S });
      rows.push(`K = tanβ = ${Math.tan(b).toFixed(2)}`);
    } else {
      let d = `M ${O[0]} ${O[1] + 4}`;
      for (let x = O[0]; x <= W - 30; x += 4) d += ` L ${x} ${O[1] + 4 + 3 * Math.sin((x - O[0]) / 5)}`;
      el('path', { d, fill: 'none', stroke: C.surf, 'stroke-width': 2.5 }, g);
      arrow(g, W - 34, O[1] + 4, W - 12, O[1] + 4, 'surf', 2.5);
      tx(g, W - 20, O[1] + 26, S.surface, { fill: C.surf, 'text-anchor': 'end' });
    }
    const state = sL < 1 ? S.state_both : sS < 1 ? S.state_shear : S.state_none;
    const col = sL < 1 ? C.L : sS < 1 ? C.S : C.surf;
    el('rect', { x: W - 186, y: 14, width: 172, height: rows.length ? 54 : 32, rx: 6, fill: C.paper, stroke: col }, g);
    tx(g, W - 100, 35, state, { fill: col, 'text-anchor': 'middle', 'font-weight': 600 });
    if (rows.length) tx(g, W - 100, 58, rows[0], { fill: C.text, 'text-anchor': 'middle', 'font-size': 12 });
  }
  draw();
}

// ---------------------------------------------------------------- piezo
function piezo(svg, ctl, S) {
  let mode = 'send';
  seg(ctl, [['send', S.send], ['receive', S.receive]], mode, (m) => { mode = m; });
  const X0 = 170;
  const X1 = 450;
  const YC = 166;
  el('rect', { x: X0 - 20, y: 196, width: X1 - X0 + 40, height: 150, fill: C.wedge, stroke: C.wedgeStroke }, svg);
  tx(svg, X1 + 10, 336, S.wedge, { fill: C.wedgeStroke, 'text-anchor': 'end' });
  const g = el('g', {}, svg);
  const scope = { x: 490, y: 120, w: 140, h: 110 };
  return loop((t) => {
    clear(g);
    const P = 2.6;
    const p = t % P;
    const ta = mode === 'send' ? 0.05 : 0.7;
    const env = p > ta ? Math.exp(-(p - ta) * 5) : 0;
    const vib = env * Math.sin((p - ta) * 2 * Math.PI * 6);
    const th = 40 + 9 * vib;
    const top = YC - th / 2;
    const bot = YC + th / 2;
    el('rect', { x: X0, y: top - 6, width: X1 - X0, height: 6, fill: C.electrode }, g);
    el('rect', { x: X0, y: bot, width: X1 - X0, height: 6, fill: C.electrode }, g);
    el('rect', { x: X0, y: top, width: X1 - X0, height: th, fill: C.element, opacity: 0.9 }, g);
    tx(g, (X0 + X1) / 2, YC + 5, S.element, { 'text-anchor': 'middle', fill: '#1f2937', 'font-weight': 600 });
    const wire = mode === 'send' && p < 0.25 ? C.inc : C.muted;
    el('polyline', { points: `${X0},${top - 3} 90,${top - 3} 90,110`, fill: 'none', stroke: wire, 'stroke-width': 2 }, g);
    el('polyline', { points: `${X0},${bot + 3} 70,${bot + 3} 70,110`, fill: 'none', stroke: C.muted, 'stroke-width': 2 }, g);
    tx(g, X0 - 8, top - 12, S.rear, { 'text-anchor': 'end', 'font-size': 12, fill: C.muted });
    tx(g, X0 - 8, bot + 22, S.front, { 'text-anchor': 'end', 'font-size': 12, fill: C.muted });
    tx(g, 80, 100, mode === 'send' ? S.pulse : S.echo, { 'text-anchor': 'middle', fill: mode === 'send' ? C.inc : C.good });
    for (let k = 0; k < 4; k++) {
      const pk = mode === 'send' ? 0.08 + 0.1 * k : 0.05 + 0.1 * k;
      const dt = p - pk;
      if (dt < 0) continue;
      const y = mode === 'send' ? 202 + dt * 230 : 340 - dt * 230;
      if (y < 202 || y > 342) continue;
      line(g, X0 + 10, y, X1 - 10, y, mode === 'send' ? C.L : C.good, 2.5, { opacity: 1 - k * 0.2 });
    }
    tx(g, (X0 + X1) / 2, 290, mode === 'send' ? S.wave : S.echo, { 'text-anchor': 'middle', fill: mode === 'send' ? C.L : C.good });
    if (mode === 'receive' && env > 0.05) {
      const sgn = vib >= 0 ? 1 : -1;
      for (let i = 0; i < 6; i++) {
        const x = X0 + 25 + i * 46;
        tx(g, x, top - 12, sgn > 0 ? '+' : '−', { fill: C.good, 'font-size': 16, opacity: env, 'text-anchor': 'middle' });
        tx(g, x, bot + 22, sgn > 0 ? '−' : '+', { fill: C.good, 'font-size': 16, opacity: env, 'text-anchor': 'middle' });
      }
      tx(g, X1 + 8, YC + 4, S.charge, { fill: C.good, 'font-size': 12, opacity: env });
    }
    el('rect', { x: scope.x, y: scope.y, width: scope.w, height: scope.h, rx: 6, fill: C.scope, stroke: '#334155' }, g);
    const pts = [];
    for (let i = 0; i <= 120; i++) {
      const tau = (i / 120) * 1.6;
      if (tau > p) break;
      let v;
      if (mode === 'send') v = tau < 0.06 ? -1 : 0.25 * Math.exp(-(tau - 0.06) * 5) * Math.sin((tau - 0.06) * 2 * Math.PI * 6);
      else v = tau > ta ? 0.8 * Math.exp(-(tau - ta) * 5) * Math.sin((tau - ta) * 2 * Math.PI * 6) : 0;
      pts.push(`${scope.x + 6 + (i / 120) * (scope.w - 12)},${scope.y + scope.h / 2 - v * 44}`);
    }
    if (pts.length > 1) el('polyline', { points: pts.join(' '), fill: 'none', stroke: mode === 'send' ? C.inc : C.good, 'stroke-width': 1.8 }, g);
  });
}

// ---------------------------------------------------------------- electrodes
function electrodes(svg, ctl, S, ctx) {
  const hiFront = ctx.partId === 'angle__front_electrode';
  const X0 = 200;
  const X1 = 480;
  el('rect', { x: X0, y: 52, width: X1 - X0, height: 80, fill: 'url(#dots-back)' }, svg);
  tx(svg, (X0 + X1) / 2, 98, S.backing, { 'text-anchor': 'middle', fill: C.text });
  el('rect', { x: X0 - 20, y: 214, width: X1 - X0 + 40, height: 130, fill: C.wedge, stroke: C.wedgeStroke }, svg);
  tx(svg, (X0 + X1) / 2, 300, S.wedge, { 'text-anchor': 'middle', fill: C.wedgeStroke });
  const rearC = hiFront ? C.electrode : C.accent;
  const frontC = hiFront ? C.accent : C.electrode;
  tx(svg, 120, 50, S.signal, { 'text-anchor': 'middle', fill: C.inc });
  tx(svg, 90, 36, S.ground, { 'text-anchor': 'middle', fill: C.muted });
  tx(svg, X1 + 14, 138, S.rear, { fill: rearC, 'font-weight': hiFront ? 400 : 700 });
  tx(svg, X1 + 14, 218, S.front, { fill: frontC, 'font-weight': hiFront ? 700 : 400 });
  const g = el('g', {}, svg);
  return loop((t) => {
    clear(g);
    const v = Math.sin(t * 2 * Math.PI * 0.6);
    const th = 66 + 8 * v;
    const top = 173 - th / 2;
    const bot = top + th;
    el('rect', { x: X0, y: top, width: X1 - X0, height: th, fill: C.element, opacity: 0.85 }, g);
    el('rect', { x: X0, y: top - 8, width: X1 - X0, height: 8, fill: rearC }, g);
    el('rect', { x: X0, y: bot, width: X1 - X0, height: 8, fill: frontC }, g);
    el('polyline', { points: `${X0},${top - 4} 120,${top - 4} 120,60`, fill: 'none', stroke: C.inc, 'stroke-width': 2.5 }, g);
    el('polyline', { points: `${X0},${bot + 4} 90,${bot + 4} 90,60`, fill: 'none', stroke: C.muted, 'stroke-width': 2.5 }, g);
    tx(g, X0 + 12, 178, S.element, { fill: '#1f2937', 'font-weight': 600 });
    const down = v >= 0;
    for (let i = 0; i < 5; i++) {
      const x = X0 + 76 + i * 30;
      const [y1, y2] = down ? [top + 6, bot - 6] : [bot - 6, top + 6];
      arrow(g, x, y1, x, y2, 'accent', 1.8, { opacity: 0.4 + 0.6 * Math.abs(v) });
    }
    tx(g, X1 - 10, 178, `${S.field} ${down ? '↓' : '↑'}`, { 'text-anchor': 'end', fill: C.accent, 'font-size': 12 });
    tx(g, X1 + 14, top + 22, down ? '+' : '−', { fill: C.inc, 'font-size': 16 });
    tx(g, X1 + 14, bot - 10, down ? '−' : '+', { fill: C.muted, 'font-size': 16 });
  });
}

// ---------------------------------------------------------------- damping
function damping(svg, ctl, S, ctx) {
  const L = { none: { n: 24, a: 1, sens: 1, res: 0.08 }, low: { n: 10, a: 1, sens: 0.9, res: 0.28 }, mid: { n: 4, a: 0.78, sens: 0.66, res: 0.64 }, high: { n: 2, a: 0.52, sens: 0.42, res: 0.94 } };
  let lvl = 'mid';
  const lab = document.createElement('span');
  lab.className = 'dg-label';
  lab.textContent = S.level_label;
  ctl.appendChild(lab);
  const sg = seg(ctl, Object.keys(L).filter((k) => S.levels[k]).map((k) => [k, S.levels[k]]), lvl, (k) => { lvl = k; draw(); ctx.onInput?.(k); });
  const P = { x0: 30, x1: 440, yc: 180, A: 105 };
  line(svg, P.x0, P.yc, P.x1, P.yc, C.track, 1);
  arrow(svg, P.x0, P.yc + 120, P.x1, P.yc + 120, 'muted', 1.2);
  tx(svg, P.x1, P.yc + 140, S.time, { 'text-anchor': 'end', fill: C.muted, 'font-size': 12 });
  tx(svg, P.x0, 36, S.pulse, { fill: C.text });
  const g = el('g', {}, svg);
  const T0 = [6, 9.5];
  const span = 20;
  const X = (t) => P.x0 + (t / span) * (P.x1 - P.x0);
  function draw() {
    clear(g);
    const c = L[lvl];
    const w = c.n / 2.6;
    const pts = [];
    for (let i = 0; i <= 800; i++) {
      const t = (i / 800) * span;
      let v = 0;
      for (const t0 of T0) {
        const d = t - t0;
        const env = d < -w * 0.35 ? 0 : d < 0 ? 1 - (d / (-w * 0.35)) ** 2 : Math.exp(-((d / w) ** 2) * 1.6);
        v += env * Math.sin(2 * Math.PI * d);
      }
      pts.push(`${X(t)},${P.yc - c.a * v * P.A * 0.55}`);
    }
    el('polyline', { points: pts.join(' '), fill: 'none', stroke: C.inc, 'stroke-width': 1.8 }, g);
    for (const t0 of T0) el('path', { d: `M ${X(t0)} ${P.yc + 112} l -6 -10 h 12 z`, fill: C.accent }, g);
    const bars = [[S.sensitivity, c.sens, C.good], [S.resolution, c.res, C.accent]];
    bars.forEach(([name, v, col], i) => {
      const x = 490 + i * 72;
      el('rect', { x, y: 70, width: 40, height: 220, rx: 4, fill: C.track }, g);
      el('rect', { x, y: 70 + 220 * (1 - v), width: 40, height: 220 * v, rx: 4, fill: col }, g);
      tx(g, x + 20, 312, name, { 'text-anchor': 'middle', 'font-size': 12 });
    });
  }
  draw();
  return { stop() {}, set(k) { if (!L[k]) return; lvl = k; sg.set(k); draw(); }, state: () => ({ mode: lvl }) };
}

// ---------------------------------------------------------------- wedge_echo
function wedgeEcho(svg, ctl, S, ctx) {
  const d = ctx.derived;
  const wedge = d.parts.angle__wedge.profile;
  const absorber = d.parts.angle__absorber.profile;
  const E = d.element_centre_xz;
  const dir0 = d.beam_dir_wedge_xz;
  const half = ctx.manifest.parameters.element_length.value / 2;
  const sc = 10.5;
  const M = ([x, z]) => [20 + (x + 19) * sc, 30 + (z + 25) * sc];
  const pstr = (poly) => poly.map((p) => M(p).join(',')).join(' ');
  let withAbs = true;
  let mark = false;
  const sg = seg(ctl, [['with', S.with], ['without', S.without]], 'with', (k) => { withAbs = k === 'with'; draw(); ctx.onInput?.(k); });
  const [sx0, sy0] = M([-19, 0]);
  el('rect', { x: sx0, y: sy0, width: 33 * sc, height: 2.6 * sc, fill: C.steel, stroke: C.steelStroke }, svg);
  tx(svg, sx0 + 33 * sc - 6, sy0 + 2.6 * sc + 16, S.steel, { 'text-anchor': 'end', fill: C.steelStroke, 'font-size': 12 });
  el('polygon', { points: pstr(d.parts.angle__backing.profile), fill: 'url(#dots-back)', stroke: '#64748b' }, svg);
  const absG = el('g', {}, svg);
  el('polygon', { points: pstr(wedge), fill: C.wedge, stroke: C.wedgeStroke, 'stroke-width': 1.5 }, svg);
  const t = [dir0[1], -dir0[0]];
  const tv = [-t[0], -t[1]];
  const a0 = [E[0] + tv[0] * half, E[1] + tv[1] * half];
  const a1 = [E[0] - tv[0] * half, E[1] - tv[1] * half];
  const n = [-dir0[0] * 0.8, -dir0[1] * 0.8];
  el('polygon', { points: pstr([a0, a1, [a1[0] + n[0], a1[1] + n[1]], [a0[0] + n[0], a0[1] + n[1]]]), fill: C.element }, svg);
  const lbl = (p, s, attrs) => { const [x, y] = M(p); tx(svg, x, y, s, attrs); };
  lbl([E[0] - 6, E[1] - 3], S.element, { 'text-anchor': 'end', fill: C.element, 'font-size': 12 });
  lbl([2, -4], S.wedge, { fill: C.wedgeStroke, 'font-size': 12 });
  const [ix, iy] = M([0, 0]);
  el('circle', { cx: ix, cy: iy, r: 4, fill: C.accent }, svg);
  tx(svg, ix, iy + 18, S.index, { 'text-anchor': 'middle', fill: C.accent, 'font-size': 12 });
  const g = el('g', {}, svg);
  const scope = { x: 418, y: 86, w: 208, h: 190 };

  function trace(abs = withAbs) {
    const edges = wedge.map((p, i) => [p, wedge[(i + 1) % wedge.length]]);
    const slopeIdx = 0;
    const frontIdx = edges.findIndex(([a, b]) => Math.abs(a[0] - b[0]) < 1e-6 && a[0] > 0);
    const topIdx = edges.findIndex(([a, b]) => Math.abs(a[1] - b[1]) < 1e-6 && a[1] < -1);
    const bottomIdx = edges.findIndex(([a, b]) => Math.abs(a[1]) < 1e-6 && Math.abs(b[1]) < 1e-6);
    let p = [...E];
    let v = [...dir0];
    let last = -1;
    let len = 0;
    let amp = 1;
    const path = [p];
    const echoes = [];
    for (let k = 0; k < 14; k++) {
      let best = null;
      edges.forEach(([a, b], i) => {
        if (i === last) return;
        const ex = b[0] - a[0];
        const ez = b[1] - a[1];
        const den = v[0] * ez - v[1] * ex;
        if (Math.abs(den) < 1e-12) return;
        const s = ((a[0] - p[0]) * ez - (a[1] - p[1]) * ex) / den;
        const u = ((a[0] - p[0]) * v[1] - (a[1] - p[1]) * v[0]) / den;
        if (s > 1e-6 && u >= -1e-6 && u <= 1 + 1e-6 && (!best || s < best.s)) best = { s, i, ex, ez };
      });
      if (!best) break;
      p = [p[0] + v[0] * best.s, p[1] + v[1] * best.s];
      len += best.s;
      path.push(p);
      if (best.i === slopeIdx) {
        const du = (p[0] - E[0]) * tv[0] + (p[1] - E[1]) * tv[1];
        if (Math.abs(du) <= half && k > 0) echoes.push({ len, amp });
      }
      if (abs && (best.i === frontIdx || best.i === topIdx)) break;
      const L = Math.hypot(best.ex, best.ez);
      const nx = -best.ez / L;
      const nz = best.ex / L;
      const dot = v[0] * nx + v[1] * nz;
      v = [v[0] - 2 * dot * nx, v[1] - 2 * dot * nz];
      amp *= best.i === bottomIdx ? 0.45 : 0.8;
      last = best.i;
    }
    return { path, echoes };
  }

  function draw() {
    clear(absG);
    clear(g);
    if (withAbs) {
      el('polygon', { points: pstr(absorber), fill: 'url(#hatch-abs)', stroke: '#475569' }, absG);
      const [ax, ay] = M([11.2, -19.5]);
      tx(absG, ax, ay, S.absorber, { 'text-anchor': 'middle', fill: C.text, 'font-size': 12 });
    }
    const { path, echoes } = trace();
    for (let i = 1; i < path.length; i++) {
      const [x1, y1] = M(path[i - 1]);
      const [x2, y2] = M(path[i]);
      const key = i === 1 ? 'inc' : 'S';
      const op = i === 1 ? 1 : Math.max(0.25, 1 - (i - 2) * 0.12);
      if (i === path.length - 1 || i === 1) arrow(g, x1, y1, x2, y2, key, i === 1 ? 2.6 : 1.8, { opacity: op });
      else line(g, x1, y1, x2, y2, C.S, 1.8, { opacity: op });
    }
    if (path.length > 2) {
      const [x, y] = M(path[2]);
      tx(g, x + 6, y + 14, S.reflect, { fill: C.S, 'font-size': 12 });
    }
    el('rect', { x: scope.x, y: scope.y, width: scope.w, height: scope.h, rx: 6, fill: C.scope, stroke: '#334155' }, g);
    tx(g, scope.x + 8, scope.y - 8, S.ascan, { fill: C.text, 'font-size': 12 });
    const base = scope.y + scope.h - 18;
    const all = trace(false).echoes;
    const Lmax = all.length ? Math.max(...all.map((e) => e.len)) * 1.15 : 130;
    const X = (l) => scope.x + 10 + (l / Lmax) * (scope.w - 20);
    let dpath = `M ${scope.x + 10} ${base}`;
    for (let i = 0; i <= 260; i++) {
      const l = (i / 260) * Lmax;
      let v = 0.92 * Math.exp(-((l / 4) ** 2));
      for (const e of echoes) v += (0.55 * e.amp) / echoes[0].amp * Math.exp(-(((l - e.len) / (Lmax / 70)) ** 2));
      v += 0.015 * Math.sin(i * 1.7) * Math.sin(i * 0.37);
      dpath += ` L ${X(l)} ${base - Math.min(1, Math.abs(v)) * (scope.h - 40)}`;
    }
    el('path', { d: dpath, fill: 'none', stroke: C.good, 'stroke-width': 1.5 }, g);
    tx(g, X(0) + 12, scope.y + 20, S.main_bang, { fill: '#94a3b8', 'font-size': 11 });
    if (echoes.length) tx(g, X(echoes[0].len), scope.y + 36, S.noise, { fill: C.S, 'font-size': 11, 'text-anchor': 'end' });
    if (mark) {
      if (all.length) {
        const x0 = Math.max(scope.x + 4, X(all[0].len) - 10);
        const x1 = Math.min(scope.x + scope.w - 4, X(all[all.length - 1].len) + 10);
        el('rect', { x: x0, y: scope.y + 42, width: x1 - x0, height: scope.h - 56, rx: 4, fill: 'none', stroke: C.inc, 'stroke-width': 2, 'stroke-dasharray': '5 4' }, g);
      }
      if (withAbs) el('polygon', { points: pstr(absorber), fill: 'none', stroke: C.inc, 'stroke-width': 2.5 }, g);
    }
  }
  draw();
  return {
    stop() {},
    set(k) { withAbs = k === 'with'; sg.set(k); draw(); },
    mark(on) { mark = on; draw(); },
    state: () => ({ mode: withAbs ? 'with' : 'without' }),
  };
}

// ---------------------------------------------------------------- coupling
function coupling(svg, ctl, S) {
  let mode = 'gel';
  const V = { gel: { t: 0.78, r: 0.22 }, air: { t: 0.02, r: 0.98 } };
  seg(ctl, [['gel', S.gel], ['air', S.air]], mode, (k) => { mode = k; });
  const Y = 170;
  el('rect', { x: 20, y: 20, width: 420, height: Y - 20, fill: C.wedge, stroke: C.wedgeStroke }, svg);
  tx(svg, 32, 42, S.wedge, { fill: C.wedgeStroke });
  const layer = el('rect', { x: 20, y: Y, width: 420, height: 10 }, svg);
  el('rect', { x: 20, y: Y + 10, width: 420, height: 160, fill: C.steel, opacity: 0.6, stroke: C.steelStroke }, svg);
  tx(svg, 32, 330, S.steel, { fill: C.steelStroke });
  const layerLabel = tx(svg, 430, Y - 8, '', { 'font-size': 12, 'text-anchor': 'end' });
  const g = el('g', {}, svg);
  const O = [230, Y + 5];
  const a = rad(40);
  const inc = [[O[0] - 140 * Math.sin(a), O[1] - 140 * Math.cos(a)], O];
  const ref = [O, [O[0] + 140 * Math.sin(a), O[1] - 140 * Math.cos(a)]];
  const b = rad(55);
  const tra = [O, [O[0] + 150 * Math.sin(b), O[1] + 150 * Math.cos(b)]];
  return loop((t) => {
    clear(g);
    const v = V[mode];
    layer.setAttribute('fill', mode === 'gel' ? 'rgba(56,189,248,0.55)' : 'rgba(241,245,249,0.9)');
    layerLabel.textContent = `${S.layer}: ${mode === 'gel' ? S.gel : S.air}`;
    arrow(g, ...inc[0], ...inc[1], 'inc', 4);
    if (v.r > 0.05) arrow(g, ...ref[0], ...ref[1], 'muted', 1 + 6 * v.r, { opacity: 0.4 + 0.6 * v.r });
    if (v.t > 0.05) arrow(g, ...tra[0], ...tra[1], 'S', 1 + 6 * v.t);
    const p = (t % 1.6) / 1.6;
    const dot = (seg2, k, col, r) => {
      const [[x1, y1], [x2, y2]] = seg2;
      el('circle', { cx: x1 + (x2 - x1) * k, cy: y1 + (y2 - y1) * k, r, fill: col }, g);
    };
    if (p < 0.5) dot(inc, p * 2, C.inc, 6);
    else {
      if (v.r > 0.05) dot(ref, (p - 0.5) * 2, C.text, 2 + 5 * v.r);
      if (v.t > 0.05) dot(tra, (p - 0.5) * 2, C.S, 2 + 5 * v.t);
    }
    [[S.transmit, v.t, C.S], [S.reflect, v.r, C.muted]].forEach(([name, val, col], i) => {
      const x = 490 + i * 72;
      el('rect', { x, y: 60, width: 40, height: 230, rx: 4, fill: C.track }, g);
      el('rect', { x, y: 60 + 230 * (1 - val), width: 40, height: 230 * val, rx: 4, fill: col }, g);
      tx(g, x + 20, 312, name, { 'text-anchor': 'middle', 'font-size': 12 });
    });
  });
}

// ---------------------------------------------------------------- marking
function marking(svg, ctl, S, ctx) {
  const des = ctx.manifest.designation;
  const ph = ctx.derived.physics;
  const h = ctx.derived.parts.angle__housing;
  const chunks = [
    [String(des.frequency_MHz), S.freq],
    [des.element_material_code, S.material],
    [`${des.element_mm[0]}×${des.element_mm[1]}`, S.size],
    [`K${des.K}`, S.k],
  ];
  const fs = 40;
  const cw = fs * 0.56;
  const total = chunks.reduce((s, [c]) => s + c.length * cw, 0) + (chunks.length - 1) * 16;
  let x = (W - total) / 2;
  chunks.forEach(([c, name], i) => {
    const w = c.length * cw;
    tx(svg, x + w / 2, 62, c, { 'text-anchor': 'middle', 'font-size': fs, 'font-family': 'Arial, sans-serif', 'font-weight': 700, fill: i % 2 ? C.accent : C.inc });
    el('path', { d: `M ${x} 74 v 8 h ${w} v -8`, fill: 'none', stroke: C.muted, 'stroke-width': 1.5 }, svg);
    tx(svg, x + w / 2, 102, name, { 'text-anchor': 'middle', 'font-size': 12, fill: C.muted });
    x += w + 16;
  });
  const sc = 5.4;
  const X0 = 280;
  const Y0 = 300;
  const MX = (v) => X0 + v * sc;
  const MZ = (v) => Y0 + v * sc;
  const box = (b, attrs) => el('rect', { x: MX(b.x0), y: MZ(b.z0), width: (b.x1 - b.x0) * sc, height: (b.z1 - b.z0) * sc, ...attrs }, svg);
  const gd = el('defs', {}, svg);
  const metal = (id, a, b) => {
    const g = el('linearGradient', { id, x1: 0, y1: 0, x2: 0, y2: 1 }, gd);
    el('stop', { offset: 0, 'stop-color': a }, g);
    el('stop', { offset: 1, 'stop-color': b }, g);
    return `url(#${id})`;
  };
  const o = h.outer;
  const c = ctx.derived.parts.angle__connector;
  el('rect', { x: MX(c.x - c.r), y: MZ(c.z0), width: 2 * c.r * sc, height: (c.z1 - c.z0) * sc, rx: 2, fill: metal('mk-conn', '#9aa3ad', '#5f6873'), stroke: '#cbd5e1', 'stroke-width': 1 }, svg);
  box(o, { rx: 5, fill: metal('mk-alu', '#eef1f4', '#b4bcc5'), stroke: '#f8fafc', 'stroke-width': 1 });
  const lp = h.label_plate;
  box(lp, { rx: lp.corner * sc, fill: LOGO_INK });
  const lg = h.logo;
  logoGroup(svg, { x: MX(lg.x), y: MZ(lg.z), radius: lg.disc_r * sc });
  const mk = h.marking;
  tx(svg, MX(mk.x), MZ(mk.z), des.marking, { 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-size': mk.height * sc, 'font-family': 'Arial, sans-serif', fill: '#f8fafc' });
  const sca = h.scale;
  box(sca.band, { fill: '#f1f1ec' });
  for (const t of sca.ticks) box(t, { fill: '#111827' });
  for (const n of sca.numbers) {
    tx(svg, MX(n.x), MZ(n.z), n.text, { 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-size': Math.max(9, n.height * sc), 'font-family': 'Arial, sans-serif', fill: '#111827' });
  }
  tx(svg, MX(o.x0) - 8, MZ((sca.band.z0 + sca.band.z1) / 2), S.scale, { 'text-anchor': 'end', 'dominant-baseline': 'central', fill: C.muted, 'font-size': 12 });
  const im = h.index_mark;
  box({ x0: im.x - im.half_w, x1: im.x + im.half_w, z0: im.z0, z1: im.z1 }, { fill: '#111827' });
  el('rect', { x: 20, y: Y0, width: W - 40, height: H - Y0 - 6, fill: C.steel, opacity: 0.55 }, svg);
  const b = rad(ph.beta_deg);
  const L = (H - 14 - Y0) / Math.cos(b);
  arrow(svg, X0, Y0, X0 + L * Math.sin(b), H - 14, 'S', 2.5);
  el('circle', { cx: X0, cy: Y0, r: 4, fill: C.accent }, svg);
  tx(svg, X0 - 8, Y0 + 20, S.index, { 'text-anchor': 'end', fill: C.accent, 'font-size': 12 });
  const fl = ctx.derived.front_length_mm;
  const ya = MZ(o.z0) - 12;
  line(svg, X0, MZ(o.z0) - 2, X0, ya - 4, C.accent, 1, { 'stroke-dasharray': '3 3' });
  line(svg, MX(fl), MZ(o.z0) - 2, MX(fl), ya - 4, C.accent, 1, { 'stroke-dasharray': '3 3' });
  arrow(svg, X0 + 4, ya, MX(fl) - 2, ya, 'accent', 1.5, { 'marker-start': 'url(#ar-accent)' });
  tx(svg, MX(fl) + 10, ya + 4, `${S.front_length} ${fl.toFixed(0)} mm`, { fill: C.accent, 'font-size': 12 });
  tx(svg, MX(o.x1) + 8, MZ(-3), S.front, { fill: C.muted, 'font-size': 12 });
  arrow(svg, MX(o.x1) + 40, MZ(-7), MX(o.x1) + 70, MZ(-7), 'muted', 1.5);
}

// ---------------------------------------------------------------- signal_chain
function signalChain(svg, ctl, S, ctx) {
  const nodes = S.nodes;
  const hi = ctx.partId === 'angle__wiring' ? 3 : 2;
  const n = nodes.length;
  const xs = nodes.map((_, i) => 60 + (i * (W - 120)) / (n - 1));
  const Y = 170;
  for (let i = 0; i < n - 1; i++) line(svg, xs[i] + 40, Y, xs[i + 1] - 40, Y, '#cbd5e1', 3);
  nodes.forEach((name, i) => {
    el('rect', { x: xs[i] - 44, y: Y - 24, width: 88, height: 48, rx: 8, fill: i === hi ? 'rgba(2,132,199,0.12)' : C.paper, stroke: i === hi ? C.accent : '#cbd5e1', 'stroke-width': i === hi ? 2.5 : 1.5 }, svg);
    tx(svg, xs[i], Y + 5, name, { 'text-anchor': 'middle', 'font-size': 13, fill: i === hi ? C.accent : C.text });
  });
  const g = el('g', {}, svg);
  return loop((t) => {
    clear(g);
    const P = 3.6;
    const p = (t % P) / P;
    const send = p < 0.5;
    const k = send ? p * 2 : (p - 0.5) * 2;
    const x = send ? xs[0] + (xs[n - 1] - xs[0]) * k : xs[n - 1] - (xs[n - 1] - xs[0]) * k;
    const col = send ? C.inc : C.good;
    el('circle', { cx: x, cy: Y, r: 8, fill: col }, g);
    el('circle', { cx: x, cy: Y, r: 14, fill: 'none', stroke: col, opacity: 0.4 }, g);
    const yA = send ? Y - 60 : Y + 70;
    arrow(g, send ? xs[0] : xs[n - 1], yA, send ? xs[n - 1] : xs[0], yA, send ? 'inc' : 'good', 2);
    tx(g, W / 2, yA + (send ? -12 : 24), send ? S.send : S.receive, { 'text-anchor': 'middle', fill: col });
  });
}

// ---------------------------------------------------------------- circuit
function circuit(svg, ctl, S) {
  el('rect', { x: 30, y: 40, width: 590, height: 300, rx: 14, fill: 'none', stroke: '#64748b', 'stroke-width': 1.5, 'stroke-dasharray': '8 6' }, svg);
  tx(svg, 44, 62, S.housing, { fill: C.muted, 'font-size': 12 });
  const cx = 120;
  const cy = 170;
  el('circle', { cx, cy, r: 38, fill: C.paper, stroke: '#cbd5e1', 'stroke-width': 4 }, svg);
  el('circle', { cx, cy, r: 24, fill: '#f8fafc', opacity: 0.85 }, svg);
  el('circle', { cx, cy, r: 7, fill: '#eab308' }, svg);
  tx(svg, cx, cy - 50, S.shell, { 'text-anchor': 'middle', fill: C.text, 'font-size': 12 });
  const X0 = 430;
  const X1 = 580;
  el('rect', { x: X0, y: 140, width: X1 - X0, height: 8, fill: C.electrode }, svg);
  el('rect', { x: X0, y: 148, width: X1 - X0, height: 44, fill: C.element, opacity: 0.9 }, svg);
  el('rect', { x: X0, y: 192, width: X1 - X0, height: 8, fill: C.electrode }, svg);
  tx(svg, (X0 + X1) / 2, 175, S.element, { 'text-anchor': 'middle', fill: '#1f2937', 'font-weight': 600 });
  tx(svg, X1 + 6, 132, S.rear, { 'text-anchor': 'end', fill: C.text, 'font-size': 12 });
  tx(svg, X1 + 6, 220, S.front, { 'text-anchor': 'end', fill: C.text, 'font-size': 12 });
  const sig = [[cx + 7, cy], [300, cy], [300, 144], [X0, 144]];
  const gnd = [[X0, 196], [360, 196], [360, 290], [cx, 290], [cx, cy + 38]];
  const tie = [[cx - 38, cy], [30, cy]];
  el('polyline', { points: sig.map((p) => p.join(',')).join(' '), fill: 'none', stroke: C.inc, 'stroke-width': 3 }, svg);
  el('polyline', { points: gnd.map((p) => p.join(',')).join(' '), fill: 'none', stroke: C.muted, 'stroke-width': 3 }, svg);
  el('polyline', { points: tie.map((p) => p.join(',')).join(' '), fill: 'none', stroke: C.muted, 'stroke-width': 3 }, svg);
  tx(svg, 300, cy + 22, S.signal, { 'text-anchor': 'middle', fill: C.inc, 'font-size': 12 });
  tx(svg, 240, 310, S.ground, { 'text-anchor': 'middle', fill: C.muted, 'font-size': 12 });
  tx(svg, cx + 16, cy + 26, S.pin, { fill: '#eab308', 'font-size': 11 });
  const loopPts = [...sig, [X0, 144], [X0, 196], ...gnd];
  const acc = polyLen(loopPts);
  const g = el('g', {}, svg);
  return loop((t) => {
    clear(g);
    const L = acc[acc.length - 1];
    for (let k = 0; k < 8; k++) {
      const s = ((t * 120 + (k * L) / 8) % L);
      const [x, y] = along(loopPts, acc, s);
      el('circle', { cx: x, cy: y, r: 4, fill: C.accent }, g);
    }
  });
}

// ---------------------------------------------------------------- positioning
function positioning(svg, ctl, S, ctx) {
  const ph = ctx.derived.physics;
  const T = ctx.derived.parts.angle__steel_block.z1 - ctx.derived.parts.angle__steel_block.z0;
  const b = rad(ph.beta_deg);
  const K = Math.tan(b);
  const Smax = (2 * T) / Math.cos(b);
  const sc = 4.6;
  const X0 = 50;
  const Y0 = 110;
  const P = 2 * K * T;
  const MX = (v) => X0 + v * sc;
  const MY = (v) => Y0 + v * sc;
  el('rect', { x: 20, y: Y0, width: W - 40, height: T * sc, fill: C.steel, opacity: 0.6, stroke: C.steelStroke }, svg);
  el('path', { d: `M ${X0 - 30} ${Y0} l 8 -36 h 46 l 6 36 z`, fill: '#64748b', stroke: '#cbd5e1' }, svg);
  el('circle', { cx: X0, cy: Y0, r: 4, fill: C.accent }, svg);
  tx(svg, X0, Y0 - 44, S.index, { 'text-anchor': 'middle', fill: C.accent, 'font-size': 12 });
  el('polyline', { points: `${MX(0)},${MY(0)} ${MX(K * T)},${MY(T)} ${MX(P)},${MY(0)}`, fill: 'none', stroke: C.S, 'stroke-width': 1.5, opacity: 0.5 }, svg);
  tx(svg, MX(K * T * 0.45) - 6, MY(T * 0.45) + 20, S.first, { fill: C.S, 'font-size': 12, 'text-anchor': 'end' });
  tx(svg, MX(K * T * 1.55) + 8, MY(T * 0.45) + 20, S.second, { fill: C.S, 'font-size': 12 });
  line(svg, 34, Y0, 34, MY(T), C.muted, 1, { 'marker-start': 'url(#ar-muted)', 'marker-end': 'url(#ar-muted)' });
  tx(svg, 30, MY(T / 2) + 4, `${S.thickness} ${T.toFixed(0)}`, { fill: C.muted, 'font-size': 11, 'text-anchor': 'end', transform: `rotate(-90 26 ${MY(T / 2)})` });
  const yP = MY(T) + 22;
  line(svg, MX(0), yP, MX(P), yP, C.muted, 1, { 'marker-start': 'url(#ar-muted)', 'marker-end': 'url(#ar-muted)' });
  tx(svg, MX(P / 2), yP + 18, `${S.skip} P = 2KT = ${P.toFixed(0)} mm`, { 'text-anchor': 'middle', fill: C.muted, 'font-size': 12 });
  const g = el('g', {}, svg);
  let Sv = 70;
  const sl = slider(ctl, S.slider, 0, +Smax.toFixed(1), 0.1, Sv, (v) => { Sv = v; draw(); });
  function draw() {
    clear(g);
    sl.out.textContent = `${f1(Sv)} mm`;
    const first = Sv <= T / Math.cos(b);
    const l = Sv * Math.sin(b);
    const dd = first ? Sv * Math.cos(b) : 2 * T - Sv * Math.cos(b);
    const pts = first ? [[0, 0], [l, dd]] : [[0, 0], [K * T, T], [l, dd]];
    el('polyline', { points: pts.map(([x, y]) => `${MX(x)},${MY(y)}`).join(' '), fill: 'none', stroke: C.S, 'stroke-width': 3 }, g);
    const [px, py] = [MX(l), MY(dd)];
    line(g, px, Y0, px, py, C.inc, 1.5, { 'stroke-dasharray': '4 3' });
    line(g, X0, Y0 - 8, px, Y0 - 8, C.good, 1.5, { 'marker-start': 'url(#ar-good)', 'marker-end': 'url(#ar-good)' });
    el('circle', { cx: px, cy: py, r: 6, fill: C.inc, stroke: '#0f172a', 'stroke-width': 2 }, g);
    const rows = [
      [first ? S.first : S.second, C.S],
      [`${S.depth} = ${first ? 'S·cosβ' : '2T − S·cosβ'} = ${f1(dd)} mm`, C.inc],
      [`${S.horizontal} = S·sinβ = ${f1(l)} mm`, C.good],
    ];
    const bx = 330;
    el('rect', { x: bx, y: 14, width: 296, height: 76, rx: 6, fill: C.paper, stroke: '#cbd5e1' }, g);
    rows.forEach(([s, col], i) => tx(g, bx + 12, 36 + i * 21, s, { fill: col, 'font-size': 13 }));
  }
  draw();
}

// ---------------------------------------------------------------- weld_defects
function weldDefects(svg, ctl, S, ctx) {
  const ph = ctx.derived.physics;
  const sp = ctx.derived.parts.angle__steel_block;
  const items = Object.fromEntries(ctx.manifest.weld_defects.items.map((d) => [d.id, d]));
  const xc = sp.weld.xc;
  const z0 = sp.z0;
  const T = sp.z1 - sp.z0;
  const b = rad(ph.beta_deg);
  const K = Math.tan(b);
  const hs = ctx.derived.parts.angle__housing.outer;
  const sc = 2.9;
  const X0 = 320;
  const Y0 = 170;
  const MX = (v) => X0 + v * sc;
  const MY = (v) => Y0 + v * sc;
  const pts = (poly) => poly.map(([x, z]) => `${MX(x - xc)},${MY(z - z0)}`).join(' ');
  const fill = { base: C.steel, haz: '#8a7350', weld: '#6b7280' };

  el('rect', { x: 10, y: Y0, width: W - 20, height: T * sc, fill: C.steel, opacity: 0.6 }, svg);
  for (const q of sp.weld.pieces) {
    if (q.mat === 'base') continue;
    el('polygon', { points: pts(q.poly), fill: q.run === 'inner' ? '#5b616b' : fill[q.mat], stroke: fill[q.mat], 'stroke-width': 0.6 }, svg);
  }
  el('polyline', { points: pts(sp.weld.pass_boundary), fill: 'none', stroke: '#cbd5e1', 'stroke-width': 0.8, 'stroke-dasharray': '3 2', opacity: 0.7 }, svg);
  line(svg, 10, Y0, W - 10, Y0, C.steelStroke, 1);
  line(svg, 10, MY(T), W - 10, MY(T), C.steelStroke, 1);
  const bw = sp.weld.bead_half_width[0];
  tx(svg, MX(0), MY(T) + 22, S.weld, { 'text-anchor': 'middle', fill: '#cbd5e1', 'font-size': 11 });
  tx(svg, MX(bw + 3), MY(T) + 14, S.haz, { fill: '#c8a96a', 'font-size': 11 });
  tx(svg, 18, MY(T) - 6, S.base, { fill: C.steelStroke, 'font-size': 11 });

  const g = el('g', {}, svg);
  const ids = Object.keys(items);
  let cur = ids[0];
  seg(ctl, ids.map((id) => [id, `${id} ${S.defects[id]}`]), cur, (id) => { cur = id; draw(); });

  function target(d) {
    if (d.shape === 'sphere') return [d.centre[0], d.centre[2]];
    if (d.kind === 'toe_crack') {
      const zs = Math.max(...d.profile.map((q) => q[1]));
      const base = d.profile.filter((q) => Math.abs(q[1] - zs) < 1e-6);
      return [base.reduce((s, q) => s + q[0], 0) / base.length, zs];
    }
    const n = d.profile.length;
    return [d.profile.reduce((s, q) => s + q[0], 0) / n, d.profile.reduce((s, q) => s + q[1], 0) / n];
  }

  function inset(side, d) {
    const iw = 200;
    const ih = 128;
    const s2 = 4.6;
    const ox = side < 0 ? W - iw - 12 : 12;
    const oy = 12;
    const IX = (x) => ox + iw / 2 + (x - xc) * s2;
    const IY = (z) => oy + ih / 2 + (z - z0 - T / 2) * s2;
    const ipts = (poly) => poly.map(([x, z]) => `${IX(x)},${IY(z)}`).join(' ');
    const cp = el('clipPath', { id: 'wd-inset' }, g);
    el('rect', { x: ox, y: oy, width: iw, height: ih, rx: 6 }, cp);
    const ig = el('g', { 'clip-path': 'url(#wd-inset)' }, g);
    el('rect', { x: ox, y: oy, width: iw, height: ih, fill: '#eef0f3' }, ig);
    for (const q of sp.weld.pieces) {
      const f = q.mat === 'base' ? C.steel : q.run === 'inner' ? '#5b616b' : fill[q.mat];
      el('polygon', { points: ipts(q.poly), fill: f, stroke: f, 'stroke-width': 0.6 }, ig);
    }
    el('polyline', { points: ipts(sp.weld.pass_boundary), fill: 'none', stroke: '#cbd5e1', 'stroke-width': 1, 'stroke-dasharray': '4 3', opacity: 0.8 }, ig);
    if (d.shape === 'sphere') el('circle', { cx: IX(d.centre[0]), cy: IY(d.centre[2]), r: d.r * s2, fill: '#ef4444' }, ig);
    else el('polygon', { points: ipts(d.profile), fill: '#ef4444', stroke: '#ef4444', 'stroke-width': 1, 'stroke-linejoin': 'round' }, ig);
    el('rect', { x: ox, y: oy, width: iw, height: ih, rx: 6, fill: 'none', stroke: '#334155' }, g);
  }

  function draw() {
    clear(g);
    const it = items[cur];
    const d = sp.defects.find((q) => q.id === cur);
    inset(it.side ?? -1, d);
    if (d.shape === 'sphere') el('circle', { cx: MX(d.centre[0] - xc), cy: MY(d.centre[2] - z0), r: Math.max(d.r * sc, 2.5), fill: '#ef4444' }, g);
    else el('polygon', { points: pts(d.profile), fill: '#ef4444', stroke: '#ef4444', 'stroke-width': 1.5, 'stroke-linejoin': 'round' }, g);
    const [tx_, tz] = target(d);
    const dep = tz - z0;
    const side = it.side ?? -1;
    const first = dep >= T / 2;
    const l = first ? K * dep : K * (2 * T - dep);
    const Sp = (first ? dep : 2 * T - dep) / Math.cos(b);
    const xi = tx_ - xc + side * l;
    const path = first ? [[xi, 0], [tx_ - xc, dep]] : [[xi, 0], [xi - side * K * T, T], [tx_ - xc, dep]];
    el('polyline', { points: path.map(([x, z]) => `${MX(x)},${MY(z)}`).join(' '), fill: 'none', stroke: C.S, 'stroke-width': 2.5 }, g);
    el('circle', { cx: MX(tx_ - xc), cy: MY(dep), r: 9, fill: 'none', stroke: C.inc, 'stroke-width': 1.5 }, g);

    const hx0 = side < 0 ? xi + hs.x0 : xi - hs.x1;
    const hx1 = side < 0 ? xi + hs.x1 : xi - hs.x0;
    el('rect', { x: MX(hx0), y: MY(hs.z0), width: (hx1 - hx0) * sc, height: -hs.z0 * sc, rx: 2, fill: '#cfd4da', stroke: '#f8fafc', 'stroke-width': 0.8 }, g);
    el('circle', { cx: MX(xi), cy: Y0, r: 3.5, fill: C.accent }, g);
    tx(g, MX(xi), MY(hs.z0) - 6, S.index, { 'text-anchor': 'middle', fill: C.accent, 'font-size': 11 });
    const yd = MY(hs.z0) - 24;
    line(g, MX(xi), yd, MX(0), yd, C.good, 1.2, { 'marker-start': 'url(#ar-good)', 'marker-end': 'url(#ar-good)' });
    tx(g, (MX(xi) + MX(0)) / 2, yd - 5, `${f1(Math.abs(xi))}`, { 'text-anchor': 'middle', fill: C.good, 'font-size': 11 });
    line(g, MX(0), yd - 4, MX(0), MY(T) + 6, '#94a3b8', 0.8, { 'stroke-dasharray': '3 3' });
    line(g, MX(xi), yd - 4, MX(xi), MY(hs.z0) - 18, C.good, 0.8, { 'stroke-dasharray': '3 3' });

    const rows = [
      [`${first ? S.first : S.second}\u3000${side < 0 ? S.left : S.right}`, C.S],
      [`${S.path} = ${f1(Sp)} mm`, C.text],
      [`${S.depth} = ${first ? 'S·cosβ' : '2T − S·cosβ'} = ${f1(dep)} mm`, C.inc],
      [`${S.horizontal} = ${f1(l)} mm\u3000${S.to_weld} = ${f1(Math.abs(xi))} mm`, C.good],
    ];
    const bx = 16;
    const by = MY(T) + 52;
    rows.forEach(([s, col], i) => tx(g, bx + (i % 2) * 300, by + Math.floor(i / 2) * 22, s, { fill: col, 'font-size': 13 }));
  }
  draw();
}

export { C, W, H, el, tx, line, arrow, defs, seg, slider, button, loop, clear };

const REG = { snell, piezo, electrodes, damping, wedge_echo: wedgeEcho, coupling, marking, signal_chain: signalChain, circuit, positioning, weld_defects: weldDefects };
export const DIAGRAM_TYPES = Object.keys(REG);

export function renderDiagram(host, type, ctx) {
  host.innerHTML = '';
  const S = ctx.strings.diagrams[type];
  const head = document.createElement('div');
  head.className = 'dg-head';
  const title = document.createElement('h3');
  title.textContent = S.title;
  const ctl = document.createElement('div');
  ctl.className = 'dg-controls';
  head.append(title, ctl);
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, class: 'dg-svg', role: 'img' });
  defs(svg);
  host.append(head, svg);
  const r = REG[type](svg, ctl, S, ctx);
  const stop = typeof r === 'function' ? r : r?.stop ?? (() => {});
  return Object.assign(() => stop(), typeof r === 'object' ? r : {}, { ctl });
}
