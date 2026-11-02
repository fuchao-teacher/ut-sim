// M10.5 checks (docs/M10_SCOPE.md §9 / §18): contracts/thickness.json, runtime blocks CBII-1 / CBII-3 from the standard rows,
// DAC from the waveform engine, near field at the 10 mm hole, back-wall echo of the 30 / 80 mm plates, edge zone, case generation, 50 mm unchanged.
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const proj = join(here, '..', '..');
const readJson = (p) => JSON.parse(readFileSync(join(proj, p), 'utf8'));

const doc = readJson('contracts/thickness.json');
const files = {
  waveform_rules: readJson('contracts/waveform_rules.json'),
  standard: readJson('contracts/standard_nbt47013_3.json'),
  specimens_manifest: readJson('contracts/specimens_manifest.json'),
  model_manifest: readJson('contracts/model_manifest.json'),
  cases: readJson('contracts/cases.json'),
};
const tasks = readJson('contracts/tasks.json');
const prk = readJson('knowledge/practice.json');
const scenes = readJson('knowledge/scenes.json');
const insp = readJson('knowledge/inspection.json');
const srcDir = join(proj, 'webapp', 'src');
const src = Object.fromEntries(readdirSync(srcDir).filter((f) => f.endsWith('.js')).map((f) => [f, readFileSync(join(srcDir, f), 'utf8')]));

const results = [];
const check = (id, desc, ok, detail = '') => results.push({ id, desc, status: ok ? 'PASS' : 'FAIL', detail });

const RULES = files.waveform_rules;
const PR = RULES.practice;
const STD = files.standard.items;
const SPEC = files.specimens_manifest;
const AV = PR.acceptance_values.dac_G_dB;
const inRow = (t, r) => t >= r.t_mm[0] && (r.t_mm[1] == null || t < r.t_mm[1]);
const lg = (x) => 20 * Math.log10(x);

function resolve(path) {
  const i = path.indexOf(':');
  let v = files[path.slice(0, i)];
  if (v === undefined) return undefined;
  for (const seg of path.slice(i + 1).split('.')) {
    if (v == null) return undefined;
    const m = /^(.+)\[\*\]$/.exec(seg);
    if (m) { v = v[m[1]]; continue; }
    v = Array.isArray(v) ? v.map((x) => x?.[seg]) : v[seg];
  }
  return v;
}

const { createWaveform, inMainBang } = await import(new URL('../src/waveform.js', import.meta.url));
const { createCaselib } = await import(new URL('../src/caselib.js', import.meta.url));
const { createThickness } = await import(new URL('../src/thickness.js', import.meta.url));
const { coverageParams } = await import(new URL('../src/coverage.js', import.meta.url));
const makeWave = (specimens) => createWaveform({ rules: RULES, manifest: files.model_manifest, dampingCycles: scenes.teaching_settings.lab.damping_cycles, scenarios: insp.scenarios, specimens });
const scenario = insp.scenarios[0];
const th = createThickness({ doc, cases: files.cases, rules: RULES, standard: files.standard, specimens: SPEC, makeWave, scenario, createCaselib });
const wave = th.wave;

// H1 contract: versions, references, numbers only teaching geometry
const refs = [];
const walk = (o) => {
  if (Array.isArray(o)) return o.forEach(walk);
  if (o && typeof o === 'object') return Object.values(o).forEach(walk);
  if (typeof o !== 'string') return;
  for (const m of o.matchAll(/(?<![a-z_:])(waveform_rules|standard|specimens_manifest|cases):([A-Za-z0-9_.\[\]*]+)/g)) refs.push(m[0].replace(/\.+$/, ''));
};
walk(doc);
const unresolved = [...new Set(refs)].filter((r) => resolve(r) === undefined);
const numbers = [];
const numWalk = (o, path) => {
  if (Array.isArray(o)) return o.forEach((x, i) => numWalk(x, `${path}[${i}]`));
  if (o && typeof o === 'object') return Object.entries(o).forEach(([k, v]) => numWalk(v, path ? `${path}.${k}` : k));
  if (typeof o === 'number') numbers.push(path);
};
numWalk(doc, '');
const allowed = /^(thicknesses_mm\[\d\]|default\.thickness_mm|blocks\[\d\]\.(row_no|length_mm|hole_pitch_mm)|plates\[\d\]\.thickness_mm|library\[\d\]\.(seed|thickness_mm))$/;
const stray = numbers.filter((p) => !allowed.test(p));
check('H1', `thickness.json：版本 / milestone M10.5 起；引用全部可解析（${new Set(refs).size} 条）；数值只含教学几何（试块长度、孔距、板厚）与行号，不复制标准数据`,
  /^M10\.[5-9]$/.test(doc.milestone) && !!doc.thickness_version && refs.length > 0 && unresolved.length === 0 && stray.length === 0,
  [...unresolved, ...stray].join(', ') || `${doc.thickness_version}, ${numbers.length} numbers`);

// H2 runtime blocks from the standard rows
const blockBad = [];
const blockInfo = [];
for (const b of doc.blocks) {
  const sp = th.block(b.specimen_id);
  const row = STD.reference_block.rows.find((r) => r.no === b.row_no);
  const S = sp.holes.map((h) => h.S_mm);
  const T = sp.dims.thickness_T.value;
  const L = sp.dims.length.value;
  const R = SPEC.probe_limits.housing_outer_diameter_mm / 2;
  const lobe = 2 * wave.mainLobeR(Math.max(...S));
  const xs = sp.holes.map((h) => h.x_mm);
  const pitchOk = xs.every((x, i) => i === 0 || x - xs[i - 1] >= lobe);
  if (JSON.stringify(S) !== JSON.stringify(row.S_mm) || T !== row.T_mm || sp.dims.width_b.value !== row.b_mm) blockBad.push(`${b.code} row`);
  if (sp.holes.some((h) => h.diameter_mm !== STD.reference_block.phi_mm || h.type !== 'flat_bottom_hole' || !(h.S_mm < T))) blockBad.push(`${b.code} hole`);
  if (sp.holes.length < STD.reference_block.min_holes) blockBad.push(`${b.code} count`);
  if (xs.some((x) => Math.abs(x) > L / 2 - R) || sp.dims.width_b.value / 2 < R) blockBad.push(`${b.code} reach`);
  if (!pitchOk) blockBad.push(`${b.code} pitch`);
  if (sp.code !== b.code || SPEC.specimens[b.specimen_id] || SPEC.runtime_specimens[b.specimen_id]) blockBad.push(`${b.code} id`);
  blockInfo.push(`${b.code} T ${T} b ${sp.dims.width_b.value} L ${L} S ${S.join('/')} x ${xs.join('/')}`);
}
check('H2', '运行时试块 CBII-1 / CBII-3：孔深 S、厚 T、宽 b、Φ 取自标准表行；孔数 ≥ 标准下限；孔心在探头可达范围内，孔距 ≥ 最深孔主瓣直径；不进 GLB / 不改 specimens_manifest',
  blockBad.length === 0, blockBad.join(', ') || blockInfo.join('; '));

// H3 DAC from the engine: CBII-2 equals the sealed acceptance values; equal S gives equal G; rising with depth; G_base = deepest
const d2 = th.dacOf('specimen__cbii_2');
const d1 = th.dacOf('specimen__cbii_1');
const d3 = th.dacOf('specimen__cbii_3');
const same2 = d2.every((p) => Math.abs(p.G - AV[String(p.S)]) < 1e-9) && d2.length === Object.keys(AV).length;
const byS = Object.fromEntries(d2.map((p) => [p.S, p.G]));
const ident = [...d1, ...d3].filter((p) => byS[p.S] != null).every((p) => Math.abs(p.G - byS[p.S]) < 1e-9);
const rising = [d1, d2, d3].every((d) => d.every((p, i) => i === 0 || p.G > d[i - 1].G));
const p30 = th.profile(30);
const p80 = th.profile(80);
check('H3', 'DAC 由波形引擎在试块上求得：CBII-2 复算等于封存的 acceptance_values（50 mm 不变）；同一 S 在 CBII-1 / -2 / -3 上增益相同；DAC 随深度单调升高；基准为最深孔点',
  same2 && ident && rising && p30.G_base_dB === d1[d1.length - 1].G && p80.G_base_dB === d3[d3.length - 1].G,
  `CBII-1 ${d1.map((p) => `${p.S}:${p.G}`).join(' ')} | CBII-2 ${d2.map((p) => `${p.S}:${p.G}`).join(' ')} | CBII-3 ${d3.map((p) => `${p.S}:${p.G}`).join(' ')}`);

// H4 near field at the 10 mm hole of CBII-1
const NF = wave.nearField;
const g10 = d1.find((p) => p.S === 10).G;
const g20 = d1.find((p) => p.S === 20).G;
const farPred = 40 * Math.log10(20 / 10);
const CAL = PR.calibration.calibrated_state;
const st0 = { ...Object.fromEntries(Object.entries(RULES.controls).map(([k, v]) => [k, v.default])), scene: scenario.id, ...scenario.defaults,
  velocity_m_s: CAL.velocity_m_s, zero_us: CAL.zero_us, reject_percent: 0, defects: [] };
const b1 = th.block('specimen__cbii_1');
const h10 = b1.holes.find((h) => h.S_mm === 10);
const f10 = wave.synth({ ...st0, specimen_id: 'specimen__cbii_1', thickness_mm: 40, range_mm: 50, gain_dB: g10, probe_x_mm: h10.x_mm, probe_y_mm: 0 }, { noise: false });
const e10 = f10.echoes.find((e) => e.id === 'H10');
const mb = f10.echoes.find((e) => e.type === 'main_bang');
check('H4', `近场：N = ${NF.toFixed(1)} mm，CBII-1 的 10 / 20 mm 孔在近场内、30 mm 孔在远场；10 / 20 mm 两点增益差 ${(g20 - g10).toFixed(2)} dB（远场 1/d² 外推应为 ${farPred.toFixed(1)} dB），10 mm 点略低（声程衰减较小）；10 mm 回波在始波余振之外，按 G_DAC(10) 峰值 80 %、深度读数 10.0 mm`,
  10 < NF && 20 < NF && NF < 30 && g10 < g20 && g20 - g10 < 1 && !inMainBang(e10, f10) && Math.abs(e10.pct - RULES.auto_gain.target_percent) < 0.2 && Math.abs(e10.x_mm - 10) < 0.05,
  `G10 ${g10}, G20 ${g20}, H10 ${e10.pct.toFixed(1)} % @ ${e10.x_mm.toFixed(2)} mm, main bang ends ${((mb.t + mb.len) * CAL.velocity_m_s / 2e3).toFixed(2)} mm`);

// H5 back wall of the 30 / 80 mm plates at G_base; deepest reflector echo ends before B1
const B1_LIMIT = STD.defect_criteria.b1_limit_percent;
const bw = [];
const bwBad = [];
for (const pf of [p30, { thickness_mm: 50, G_base_dB: d2[d2.length - 1].G, depth_mm: [15, 45] }, p80]) {
  const T = pf.thickness_mm;
  const plate = { ...SPEC.runtime_specimens.specimen__plate_p02, dims: { ...SPEC.runtime_specimens.specimen__plate_p02.dims, thickness: { value: T } }, defects: [] };
  const work = { ...SPEC, runtime_specimens: { ...SPEC.runtime_specimens, pX: plate } };
  const w = makeWave(work);
  const st = { ...st0, specimen_id: 'pX', thickness_mm: T, range_mm: 2 * T + 10, gain_dB: pf.G_base_dB, probe_x_mm: 0, probe_y_mm: 0 };
  const f = w.synth(st, { noise: false });
  const B1 = f.echoes.find((e) => e.id === 'B1');
  const B2 = f.echoes.find((e) => e.id === 'B2');
  const H = PR.back_wall_thickness.H_ref_mm;
  const alpha = RULES.amplitude.attenuation.alpha_dB_per_mm;
  const ratio = lg(B1.raw / B2.raw);
  const ratioPred = lg(2) + alpha * 2 * T;
  const dMax = pf.depth_mm[1];
  const deep = w.tof(2 * dMax) + w.pulseUs(st.damping);
  if (Math.abs(B1.x_mm - T) > 0.05) bwBad.push(`${T} pos`);
  if (!(lg(B1.pct / B1_LIMIT) >= files.cases.margins.criteria_dB)) bwBad.push(`${T} level`);
  if (Math.abs(ratio - ratioPred) > 0.01) bwBad.push(`${T} B1/B2`);
  if (!(deep <= w.tof(2 * T) + 1e-9)) bwBad.push(`${T} gap`);
  bw.push(`${T} mm: B1 ${B1.pct.toFixed(0)} % @ ${B1.x_mm.toFixed(1)} mm (G ${pf.G_base_dB}), B1/B2 ${ratio.toFixed(2)} dB, d_max ${dMax}`);
  void H;
}
check('H5', `背面回波：30 / 50 / 80 mm 板在各自 G_base 下 B1 位于板厚处、高于 ${B1_LIMIT} % 判据并留 ${files.cases.margins.criteria_dB} dB 余量；B1/B2 = 6.02 dB + 2αT；最深反射体回波在 B1 之前结束（背面间隙 ${p30.back_wall_gap_mm} mm = 脉冲长度）`,
  bwBad.length === 0, bwBad.join(', ') || bw.join('; '));

// H6 rows, depth windows and edge zones by thickness
const ez = (t) => {
  const plate = { ...SPEC.runtime_specimens.specimen__plate_p02, dims: { ...SPEC.runtime_specimens.specimen__plate_p02.dims, thickness: { value: t } } };
  return coverageParams({ rules: RULES, standard: files.standard, specimens: { ...SPEC, runtime_specimens: { pX: plate } }, manifest: files.model_manifest }, 'pX').edge;
};
const rowNo = (t) => STD.reference_block.rows.find((r) => inRow(t, r))?.no;
const zoneOf = (t) => STD.scan_pattern.edge_zone.find((z) => inRow(t, z)).width_mm;
check('H6', '板厚与标准表：30 → CBII-1、80 → CBII-3（试块行与探头行均覆盖板厚）；深度窗口 = [最浅孔, min(最深孔, 板厚 − 背面间隙)]；边缘区按板厚取标准宽度（80 mm 板 75 mm，30 mm 板 50 mm）',
  p30.row_ok && p80.row_ok && rowNo(30) === p30.block_no && rowNo(80) === p80.block_no && rowNo(50) === 2
    && JSON.stringify(p30.depth_mm) === JSON.stringify([10, 30 - p30.back_wall_gap_mm]) && JSON.stringify(p80.depth_mm) === JSON.stringify([15, 80 - p80.back_wall_gap_mm])
    && ez(80) === zoneOf(80) && ez(80) === 75 && ez(30) === zoneOf(30) && ez(50) === zoneOf(50) && th.profile(50) === null,
  `30: CBII-${p30.block_no} [${p30.depth_mm}] edge ${ez(30)}; 80: CBII-${p80.block_no} [${p80.depth_mm}] edge ${ez(80)}; 50: edge ${ez(50)}`);

// H7 case generation per thickness: every template generates, depths inside the window, limits and margins hold, deterministic
const SEEDS = Array.from({ length: 10 }, (_, i) => 1009 + i * 7919);
const genBad = [];
const genInfo = [];
for (const pf of [p30, p80]) {
  const lib = th.caseGen(pf.thickness_mm);
  for (const tpl of doc.templates.ids) {
    const pass = new Set();
    let n = 0;
    for (const s of SEEDS) {
      const cs = lib.generate(tpl, s);
      if (!cs || cs.failed) { genBad.push(`${pf.thickness_mm}/${tpl}/${s} failed`); continue; }
      n++;
      pass.add(cs.reference.expected.II.pass);
      const zs = cs.plate.defects.flatMap((d) => (d.type === 'cluster' ? d.members.map((m) => m.depth_mm) : d.type === 'segregation' ? d.depth_range_mm : [d.depth_mm]));
      if (zs.some((z) => z < pf.depth_mm[0] - 1e-9 || z > pf.depth_mm[1] + 1e-9)) genBad.push(`${cs.case_id} depth`);
      if (cs.plate.dims.thickness.value !== pf.thickness_mm || !cs.case_id.startsWith(`${pf.tag}-${cs.template_id}-`) || !cs.plate.code.startsWith(`${pf.tag}-`)) genBad.push(`${cs.case_id} plate`);
      if (lib.violations(cs).length) genBad.push(`${cs.case_id} ${lib.violations(cs)[0]}`);
      if (s === SEEDS[0] && JSON.stringify(lib.generate(tpl, s).plate) !== JSON.stringify(cs.plate)) genBad.push(`${cs.case_id} repeat`);
    }
    if (tpl !== 'clean' && pass.size < 2) genBad.push(`${pf.thickness_mm}/${tpl} conclusions`);
    genInfo.push(`${pf.thickness_mm}/${tpl} ${n}/${SEEDS.length}${tpl !== 'clean' ? ` II ${[...pass].map((p) => (p ? '合格' : '不合格')).join('+')}` : ''}`);
  }
}
check('H7', `按板厚的案例模板（basic / standard / clean × ${SEEDS.length} 种子）：全部生成；反射体深度均在 DAC 孔深窗口内；限位与余量全部满足；板厚 / 编号前缀正确；同种子重复生成一致；基础 / 标准模板合格与不合格兼有`,
  genBad.length === 0, genBad.slice(0, 6).join(', ') || genInfo.join('; '));

// H8 50 mm unchanged: default caselib values, profile caselib refuses codes / library / fixed template
const base = createCaselib({ cases: files.cases, rules: RULES, standard: files.standard, specimens: SPEC, makeWave, scenario });
const lib30 = th.caseGen(30);
const code = base.encode('basic', 1234);
const refuse = lib30.fromCode(code, '01').ok === false && lib30.libraryCase(files.cases.library.cases[0].id) === null && lib30.generate('fixed_p02', 0) === null;
const baseOk = JSON.stringify(base.depth_mm) === '[15,45]' && base.thickness_mm === 50 && base.dac.every((p) => AV[String(p.S)] === p.G) && base.G_base_dB === AV['45']
  && /^R-(basic|clean)-/.test(base.generate('basic', 1234).case_id) && base.fromCode(code, '01').ok && base.libraryCase(files.cases.library.cases[0].id) !== null;
check('H8', '旧 50 mm 编码协议封存：默认 caselib 深度 15–45 mm、DAC 封存值、R- 编号、编码与固定库不变；厚度 caseGen 接口拒绝旧码 / 50 mm 库 / 固定模板，厚档已有条目通过独立 thickness.libraryCase 读取（V4 检测的 30 / 80 mm 接线另测）',
  baseOk && refuse, `base depth ${base.depth_mm}, G_base ${base.G_base_dB}; 30 mm refuses code / library / fixed: ${refuse}`);

// K1 red lines: sealed contracts, labels, no CJK in src, app wiring lazy
const cjk = Object.entries(src).filter(([, s]) => /[\u4e00-\u9fff]/.test(s)).map(([f]) => f);
const main = src['main.js'].replace(/\r\n/g, '\n');
const fnBody = (name) => { const i = main.indexOf(`function ${name}(`); return i < 0 ? '' : main.slice(i, main.indexOf('\n}\n', i) + 3); };
const rest = ['addBlock', 'showThicknessCase', 'presetDac', 'makeCase', 'taskCaseOf', 'taskScore', 'startExam', 'bootSessions'].map(fnBody).reduce((s, b) => s.replace(b, ''), main);
const lazy = /const thickness = \(\) => \(thick \|\|= createThickness\(/.test(main) && (main.match(/createThickness\(/g) || []).length === 1 && !rest.includes('thickness()');
const { drawLibraryCase } = await import(new URL('../src/v4-training.js', import.meta.url));
const pool = [...base.library().map((entry) => ({ ...entry, source: 'plate50' })), ...th.library().map((entry) => ({ ...entry, source: 'thickness' }))];
const poolDraws = pool.map((entry, index) => ({ entry, drawn: drawLibraryCase({ caselib: base, thickness: th, rng: () => (index + 0.5) / pool.length }) }));
const v4Thickness = fnBody('startExam').includes('drawLibraryCase({ caselib: caseLib(), thickness: thickness() })')
  && fnBody('bootSessions').includes("selection?.source === 'thickness' ? thickness().libraryCase(selection.id)")
  && [30, 50, 80].every((t) => poolDraws.some(({ drawn }) => (drawn.case.thickness_mm || drawn.case.plate.dims.thickness.value) === t))
  && poolDraws.every(({ entry, drawn }) => drawn.selection.id === entry.id && drawn.selection.source === entry.source
    && drawn.case.specimen_id === files.cases.plate.specimen_id && !drawn.case.failed);
const labels = doc.blocks.every((b) => prk.specimens?.[b.specimen_id]?.name === b.code && prk.specimens[b.specimen_id].header.startsWith(b.code));
check('K1', '红线：cases.json 保持 M9.6、specimens_manifest 不增试块；试块短标签在 knowledge/practice.json；webapp/src 无中文；板厚模块唯一且按需创建，V4 检测覆盖已有 30 / 50 / 80 mm 库并按原选择恢复',
  files.cases.milestone === 'M9.6' && /^M10\.[3-9]$/.test(tasks.milestone) && cjk.length === 0 && lazy && v4Thickness && labels && !/caselib/.test(src['thickness.js'].split('\n').filter((l) => l.startsWith('import')).join('\n')) && /createThickness\(\{[\s\S]{0,300}createCaselib,/.test(main),
  cjk.join(', ') || `cases ${files.cases.milestone}, tasks ${tasks.milestone}, lazy ${lazy}, V4 thickness ${v4Thickness}, labels ${labels}, draws ${poolDraws.length}`);

for (const r of results) console.log(`${r.status}  ${r.id}  ${r.desc}${r.detail ? `  [${r.detail}]` : ''}`);
const pass = results.filter((r) => r.status === 'PASS').length;
console.log(`\nm105_thickness: ${pass}/${results.length} ${pass === results.length ? 'PASS' : 'FAIL'}`);
process.exit(pass === results.length ? 0 : 1);
