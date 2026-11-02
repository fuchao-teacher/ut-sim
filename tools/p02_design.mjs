// P-02 design numbers: per indication criteria, reference boundary rectangles, equivalents and the grading matrix.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const proj = join(here, '..', '..');
const readJson = (p) => JSON.parse(readFileSync(join(proj, p), 'utf8'));
const wf = readJson('contracts/waveform_rules.json');
const spec = readJson('contracts/specimens_manifest.json');
const scenes = readJson('knowledge/scenes.json');
const insp = readJson('knowledge/inspection.json');
const { createWaveform } = await import(new URL('../src/waveform.js', import.meta.url));
const { createProcedure } = await import(new URL('../src/procedure.js', import.meta.url));
const wp = createWaveform({ rules: wf, manifest: readJson('contracts/model_manifest.json'), dampingCycles: scenes.teaching_settings.lab.damping_cycles, scenarios: insp.scenarios, specimens: spec });
const std = JSON.parse(readFileSync(new URL('../../contracts/standard_nbt47013_3.json', import.meta.url), 'utf8'));
const pr = createProcedure({ rules: wf, wave: wp, specimens: spec, standard: std });
const AV = wf.practice.acceptance_values;
const pts = [15, 30, 45].map((S) => ({ S, G: AV.dac_G_dB[String(S)] }));
const GB = AV.G_base_dB;
const ID = 'specimen__plate_p02';
const sp = spec.runtime_specimens[ID];
const base = {
  ...Object.fromEntries(Object.entries(wf.controls).map(([k, v]) => [k, v.default])),
  scene: insp.scenarios[0].id, ...insp.scenarios[0].defaults,
  range_mm: 100, velocity_m_s: 5900, zero_us: 0.4, reject_percent: 0, thickness_mm: 50, defects: [], specimen_id: ID,
};
const st = (x, y, g = GB + 6) => ({ ...base, gain_dB: g, probe_x_mm: x, probe_y_mm: y });
const crit = (x, y) => pr.criteria(st(x, y), pts, GB);
const lg = (v) => 20 * Math.log10(v);
const f1Of = (x, y, pred) => {
  let v = null;
  for (const e of wp.echoes(st(x, y, GB))) if (e.type === 'defect' && e.k === 1 && pred(e)) {
    const d = pr.f1MinusDac(pts, e.x_mm, e.pct, GB);
    if (d != null) v = Math.max(v ?? -Infinity, d);
  }
  return v;
};
const edge = (cx, cy, ux, uy, on) => {
  let lo = 0;
  let hi = 60;
  while (hi - lo > 0.05) { const m = (lo + hi) / 2; if (on(cx + ux * m, cy + uy * m)) lo = m; else hi = m; }
  return (lo + hi) / 2;
};
const rectAt = (cx, cy, on) => {
  const xp = edge(cx, cy, 1, 0, on); const xm = edge(cx, cy, -1, 0, on);
  const yp = edge(cx, cy, 0, 1, on); const ym = edge(cx, cy, 0, -1, on);
  return { x0: cx - xm, x1: cx + xp, y0: cy - ym, y1: cy + yp, lx: xp + xm, ly: yp + ym, area: (xp + xm) * (yp + ym) };
};
const r2 = (v) => Math.round(v * 100) / 100;
const D = Object.fromEntries(sp.defects.map((d) => [d.id, d]));
const out = {};

const flagged = (x, y) => crit(x, y).flags.length > 0;
const [lx, ly] = D.LAM_02.centre_mm;
const cl = crit(lx, ly);
const rl = rectAt(lx, ly, flagged);
out.LAM_02 = { flags: cl.flags, f1: r2(cl.f1?.dB ?? NaN), b1: r2(cl.b1), x: r2(rl.lx), y: r2(rl.ly), area: r2(rl.area) };

const [ix, iy] = D.INC_02.centre_mm;
const ci = crit(ix, iy);
const ri = rectAt(ix, iy, flagged);
out.INC_02 = { flags: ci.flags, f1: r2(ci.f1.dB), b1: r2(ci.b1), x: r2(ri.lx), y: r2(ri.ly), area: r2(ri.area) };

const mem = D.CLU_01.members.map((m, i) => {
  const on = (x, y) => (f1Of(x, y, (e) => e.id === 'CLU_01' && e.member === i) ?? -99) > 0;
  const r = rectAt(m.x_mm, m.y_mm, on);
  return { i, f1: r2(f1Of(m.x_mm, m.y_mm, (e) => e.id === 'CLU_01' && e.member === i)), x: r2(r.lx), y: r2(r.ly), area: r2(r.area), r };
});
const rectGap = (a, b) => Math.hypot(Math.max(0, b.x0 - a.x1, a.x0 - b.x1), Math.max(0, b.y0 - a.y1, a.y0 - b.y1));
const pairs = [[0, 1], [0, 2], [1, 2]];
const gaps = pairs.map(([i, j]) => r2(rectGap(mem[i].r, mem[j].r)));
const midOff = pairs.map(([i, j]) => {
  const a = D.CLU_01.members[i];
  const b = D.CLU_01.members[j];
  return crit((a.x_mm + b.x_mm) / 2, (a.y_mm + b.y_mm) / 2).flags.length === 0;
});
const minLen = Math.min(...mem.map((m) => Math.max(m.x, m.y)));
out.CLU_01 = { members: mem.map(({ r, ...m }) => m), gaps, midOff, merged: gaps.every((g) => g < minLen), area: r2(mem.reduce((s, m) => s + m.area, 0)), crit_centre: crit(...D.CLU_01.centre_mm).flags };

const [px, py] = D.POR_01.centre_mm;
out.POR_01 = { f1: r2(f1Of(px, py, (e) => e.id === 'POR_01')), flags: crit(px, py).flags, scan_pct: r2(wp.echoes(st(px, py)).find((e) => e.id === 'POR_01').pct) };

let segMax = -99;
let segFlags = 0;
let b1Min = 999;
let nEcho = 0;
let shownMax = -99;
const R = D.SEG_01.region_mm;
for (let x = R.x[0]; x <= R.x[1]; x += 2) {
  for (let y = R.y[0] - 6; y <= R.y[1] + 6; y += 2) {
    const f = f1Of(x, y, (e) => e.id === 'SEG_01');
    if (f != null) segMax = Math.max(segMax, f);
    const c = crit(x, y);
    if (c.flags.length) segFlags++;
    b1Min = Math.min(b1Min, c.b1);
    const es = wp.echoes(st(x, y)).filter((e) => e.id === 'SEG_01');
    nEcho = Math.max(nEcho, es.length);
  }
}
for (let x = -60; x <= 60; x += 3) {
  const fr = wp.synth(st(x, 0, GB), { columns: 480, noise: false });
  const mm = 100 / 480;
  for (let c = Math.floor(20 / mm); c < Math.floor(30 / mm); c++) {
    const h = pr.hDac(pts, (c + 0.5) * mm, GB);
    if (h) shownMax = Math.max(shownMax, lg(fr.hi[c] / h));
  }
}
out.SEG_01 = { f1_max: r2(segMax), flagged_cells: segFlags, b1_min_at_base: r2(b1Min), echoes_max: nEcho, screen_over_dac_max_dB: r2(shownMax) };
out.clean = { flags: crit(0, -120).flags, b1: r2(crit(0, -120).b1) };
out.mainLobe_25 = r2(wp.mainLobeR(25));

console.log(JSON.stringify(out, null, 2));
