// Principle page: animated mode conversion at the wedge/steel interface with the energy split and the transmission curve.
import { C, W, H, el, tx, line, arrow, defs, slider, button, clear } from './diagrams.js';
import { energySplit, criticalAngles, snellAngles } from './interface.js';

const rad = (d) => (d * Math.PI) / 180;
const f1 = (v) => v.toFixed(1);
const pct = (v) => `${(v * 100).toFixed(v < 0.1 && v > 0 ? 1 : 0)}%`;

const O = [236, 170];
const R = 160;
const CURVE = { w: 640, h: 190, x0: 52, x1: 620, y0: 22, y1: 156, amax: 80, emax: 0.3 };

export function renderRefraction(host, ctx) {
  const S = ctx.text.refraction;
  const { wedge, steel } = ctx.media;
  const [crit1, crit2] = criticalAngles(wedge, steel);
  const nominal = ctx.derived.physics.alpha_deg;
  host.innerHTML = '';
  const head = document.createElement('div');
  head.className = 'dg-head';
  const title = document.createElement('h3');
  title.textContent = S.title;
  const ctl = document.createElement('div');
  ctl.className = 'dg-controls';
  head.append(title, ctl);
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, class: 'dg-svg ag-refr-main', role: 'img' });
  defs(svg);
  const curve = el('svg', { viewBox: `0 0 ${CURVE.w} ${CURVE.h}`, class: 'dg-svg ag-refr-curve', role: 'img' });
  host.append(head, svg, curve);

  let alpha = nominal;
  let split = energySplit(alpha, wedge, steel);
  let ang = snellAngles(alpha, wedge, steel);
  const user = (src) => ctx.onInput?.(src);
  const sl = slider(ctl, S.slider, 0, 80, 0.1, alpha, (v) => { alpha = v; update(); });
  sl.input.addEventListener('input', () => user('slider'));
  const presets = [[crit1, S.crit1, 'crit1'], [crit2, S.crit2, 'crit2'], [nominal, S.nominal, 'nominal']]
    .map(([v, label, src]) => ({ v, b: button(ctl, `${label} ${f1(v)}°`, () => { sl.set(v); user(src); }) }));

  // static scene
  el('rect', { x: 0, y: 0, width: W, height: O[1], fill: C.wedge }, svg);
  el('rect', { x: 0, y: O[1], width: W, height: H - O[1], fill: C.steel, opacity: 0.55 }, svg);
  line(svg, 0, O[1], 456, O[1], C.steelStroke, 1.5);
  tx(svg, 12, 24, S.wedge, { fill: C.wedgeStroke });
  tx(svg, 12, H - 12, S.steel, { fill: C.steelStroke });
  el('rect', { x: 456, y: 0, width: W - 456, height: H, fill: C.paper }, svg);
  const gRays = el('g', {}, svg);
  const gPanel = el('g', {}, svg);

  const rays = () => {
    const out = [];
    const a = rad(alpha);
    out.push({ key: 'inc', dir: [Math.sin(a), Math.cos(a)], c: wedge.cL, E: 1, incoming: true, label: S.incident });
    out.push({ key: 'L', dir: [Math.sin(a), -Math.cos(a)], c: wedge.cL, E: split.RL, label: S.refl_L, refl: true });
    if (ang.rS != null) out.push({ key: 'S', dir: [Math.sin(rad(ang.rS)), -Math.cos(rad(ang.rS))], c: wedge.cS, E: split.RS, label: S.refl_S, refl: true, deg: ang.rS });
    if (ang.L != null) out.push({ key: 'L', dir: [Math.sin(rad(ang.L)), Math.cos(rad(ang.L))], c: steel.cL, E: split.TL, label: S.refr_L, deg: ang.L });
    if (ang.S != null) out.push({ key: 'S', dir: [Math.sin(rad(ang.S)), Math.cos(rad(ang.S))], c: steel.cS, E: split.TS, label: S.refr_S, deg: ang.S, main: true });
    return out;
  };

  function drawRays() {
    clear(gRays);
    const a = rad(alpha);
    for (const r of rays()) {
      if (r.E < 0.002) continue;
      const op = 0.3 + 0.7 * Math.sqrt(r.E);
      if (r.incoming) {
        arrow(gRays, O[0] - R * r.dir[0], O[1] - R * r.dir[1], O[0] - 3 * r.dir[0], O[1] - 3 * r.dir[1], 'inc', 2.4);
        const lx = O[0] - R * r.dir[0];
        tx(gRays, Math.max(8, lx - 8), Math.max(16, O[1] - R * r.dir[1] - 8), r.label, { fill: C.inc });
        continue;
      }
      const e = [O[0] + R * r.dir[0], O[1] + R * r.dir[1]];
      arrow(gRays, O[0], O[1], e[0], e[1], r.key, 1.6 + 1.6 * Math.sqrt(r.E), { opacity: op, 'stroke-dasharray': r.refl ? '6 4' : 'none' });
      const right = e[0] > 360;
      const txt = r.deg != null ? `${r.label} ${f1(r.deg)}°` : r.label;
      tx(gRays, right ? Math.min(e[0], 450) : e[0] + 6, r.refl ? Math.max(14, e[1] - 6) : Math.min(H - 8, e[1] + 14), txt,
        { fill: C[r.key], 'font-size': 12, opacity: Math.max(0.6, op), 'text-anchor': right ? 'end' : 'start' });
    }
    el('path', { d: `M ${O[0]} ${O[1] - 44} A 44 44 0 0 0 ${O[0] - 44 * Math.sin(a)} ${O[1] - 44 * Math.cos(a)}`, fill: 'none', stroke: C.inc, 'stroke-width': 1.5 }, gRays);
    tx(gRays, O[0] - 50 * Math.sin(a / 2) - 40, O[1] - 56 * Math.cos(a / 2), `α ${f1(alpha)}°`, { fill: C.inc, 'font-size': 12 });
    if (ang.S == null) {
      let d = `M ${O[0]} ${O[1] + 4}`;
      for (let x = O[0]; x <= 430; x += 4) d += ` L ${x} ${O[1] + 4 + 3 * Math.sin((x - O[0]) / 5)}`;
      el('path', { d, fill: 'none', stroke: C.surf, 'stroke-width': 2.5 }, gRays);
      arrow(gRays, 430, O[1] + 4, 452, O[1] + 4, 'surf', 2.5);
      tx(gRays, 450, O[1] + 26, S.surface, { fill: C.surf, 'text-anchor': 'end' });
    } else {
      const b = rad(ang.S);
      el('path', { d: `M ${O[0]} ${O[1] + 56} A 56 56 0 0 0 ${O[0] + 56 * Math.sin(b)} ${O[1] + 56 * Math.cos(b)}`, fill: 'none', stroke: C.S, 'stroke-width': 1.5 }, gRays);
      tx(gRays, O[0] + 8, O[1] + 76, `β ${f1(ang.S)}°`, { fill: C.S, 'font-size': 12 });
    }
  }

  function drawPanel() {
    clear(gPanel);
    const x0 = 472;
    tx(gPanel, x0, 30, S.energy, { fill: C.text, 'font-weight': 600 });
    const rows = [[S.refl_L, split.RL, C.L], [S.refl_S, split.RS, C.S], [S.refr_L, split.TL, C.L], [S.refr_S, split.TS, C.S]];
    rows.forEach(([name, v, col], i) => {
      const y = 58 + i * 52;
      tx(gPanel, x0, y, name, { fill: C.muted, 'font-size': 12 });
      el('rect', { x: x0, y: y + 8, width: 150, height: 14, rx: 3, fill: C.track }, gPanel);
      el('rect', { x: x0, y: y + 8, width: Math.max(0, 150 * v), height: 14, rx: 3, fill: col, opacity: i < 2 ? 0.55 : 1 }, gPanel);
      tx(gPanel, x0 + 150, y, pct(v), { fill: C.text, 'font-size': 12, 'text-anchor': 'end', 'font-family': 'Arial, sans-serif' });
    });
    const state = ang.L != null ? S.state_both : ang.S != null ? S.state_shear : S.state_none;
    const col = ang.L != null ? C.L : ang.S != null ? C.S : C.surf;
    el('rect', { x: x0, y: 276, width: 152, height: ang.S != null ? 58 : 34, rx: 6, fill: '#fff', stroke: col }, gPanel);
    tx(gPanel, x0 + 76, 298, state, { fill: col, 'text-anchor': 'middle', 'font-weight': 600 });
    if (ang.S != null) tx(gPanel, x0 + 76, 322, `K = tanβ = ${Math.tan(rad(ang.S)).toFixed(2)}`, { fill: C.text, 'text-anchor': 'middle', 'font-size': 12 });
  }

  // transmission curve
  const X = (a) => CURVE.x0 + (a / CURVE.amax) * (CURVE.x1 - CURVE.x0);
  const Y = (e) => CURVE.y1 - (Math.min(e, CURVE.emax) / CURVE.emax) * (CURVE.y1 - CURVE.y0);
  tx(curve, CURVE.x0, 14, S.curve, { fill: C.text, 'font-size': 12, 'font-weight': 600 });
  for (let k = 0; k <= 3; k++) {
    const e = k * 0.1;
    line(curve, CURVE.x0, Y(e), CURVE.x1, Y(e), C.track, 1);
    tx(curve, CURVE.x0 - 6, Y(e) + 4, `${k * 10}%`, { fill: C.muted, 'font-size': 11, 'text-anchor': 'end', 'font-family': 'Arial, sans-serif' });
  }
  for (let a = 0; a <= 80; a += 10) tx(curve, X(a), CURVE.y1 + 16, `${a}°`, { fill: C.muted, 'font-size': 11, 'text-anchor': 'middle', 'font-family': 'Arial, sans-serif' });
  for (const [c, lab] of [[crit1, S.crit1], [crit2, S.crit2]]) {
    line(curve, X(c), CURVE.y0, X(c), CURVE.y1, C.surf, 1, { 'stroke-dasharray': '4 4' });
    tx(curve, X(c) + 4, CURVE.y0 + 10, lab, { fill: C.surf, 'font-size': 11 });
  }
  const pathOf = (key) => {
    let d = '';
    for (let i = 0; i <= 800; i++) {
      const a = (i / 800) * CURVE.amax;
      d += `${i ? ' L' : 'M'} ${X(a).toFixed(1)} ${Y(energySplit(a, wedge, steel)[key]).toFixed(1)}`;
    }
    return d;
  };
  el('path', { d: pathOf('TL'), fill: 'none', stroke: C.L, 'stroke-width': 2 }, curve);
  el('path', { d: pathOf('TS'), fill: 'none', stroke: C.S, 'stroke-width': 2 }, curve);
  tx(curve, X(4), Y(0.26), S.refr_L, { fill: C.L, 'font-size': 12 });
  tx(curve, X(36), Y(0.27), S.refr_S, { fill: C.S, 'font-size': 12 });
  const gMark = el('g', {}, curve);
  function drawMark() {
    clear(gMark);
    line(gMark, X(alpha), CURVE.y0, X(alpha), CURVE.y1, C.inc, 1.5);
    el('circle', { cx: X(alpha), cy: Y(split.TL), r: 4, fill: C.L }, gMark);
    el('circle', { cx: X(alpha), cy: Y(split.TS), r: 4, fill: C.S }, gMark);
  }
  const hit = el('rect', { x: CURVE.x0, y: CURVE.y0, width: CURVE.x1 - CURVE.x0, height: CURVE.y1 - CURVE.y0, fill: 'transparent', style: 'cursor: ew-resize; touch-action: none' }, curve);
  const pick = (e) => {
    const r = curve.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * CURVE.w;
    sl.set(Math.max(0, Math.min(80, Math.round(((x - CURVE.x0) / (CURVE.x1 - CURVE.x0)) * CURVE.amax * 10) / 10)));
  };
  hit.addEventListener('pointerdown', (e) => { hit.setPointerCapture(e.pointerId); pick(e); user('curve'); });
  hit.addEventListener('pointermove', (e) => { if (e.buttons) { pick(e); user('curve'); } });

  function update() {
    split = energySplit(alpha, wedge, steel);
    ang = snellAngles(alpha, wedge, steel);
    sl.out.textContent = `${f1(alpha)}°`;
    for (const p of presets) p.b.classList.toggle('active', Math.abs(alpha - p.v) < 0.05);
    drawRays();
    drawPanel();
    drawMark();
  }
  update();
  return { stop: () => {}, ctl, crit: [crit1, crit2], nominal, set: (a) => sl.set(a), state: () => ({ alpha, ...split, ...ang }) };
}
