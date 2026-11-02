// M10.3 checks (docs/M10_SCOPE.md §6, §16): task rubric — derived rubric, perfect runs on the ten task plates, card groups,
// card-driven sensitivity, evaluation at the task level, conduct with the preset calibration, report / replay / restore wiring.
// run: node tools/m103_score.mjs
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTaskcard } from '../src/taskcard.js';
import { createTaskScoring, deriveRubric } from '../src/taskscore.js';

const here = dirname(fileURLToPath(import.meta.url));
const proj = join(here, '..', '..');
const read = (p) => readFileSync(join(proj, p), 'utf8');
const readJson = (p) => JSON.parse(read(p));

const tasks = readJson('contracts/tasks.json');
const rubric = readJson('contracts/rubric.json');
const cases = readJson('contracts/cases.json');
const wf = readJson('contracts/waveform_rules.json');
const std = readJson('contracts/standard_nbt47013_3.json');
const spec = readJson('contracts/specimens_manifest.json');
const model = readJson('contracts/model_manifest.json');
const events = readJson('contracts/events_contract.json');
const scenes = readJson('knowledge/scenes.json');
const insp = readJson('knowledge/inspection.json');
const taskDoc = readJson('knowledge/task.json');
const main = read('webapp/src/main.js');
const reportSrc = read('webapp/src/report.js');
const replaySrc = read('webapp/src/replay.js');
const { createWaveform } = await import(new URL('../src/waveform.js', import.meta.url));
const CL = await import(new URL('../src/caselib.js', import.meta.url));
const makeWave = (specimens) => createWaveform({ rules: wf, manifest: model, dampingCycles: scenes.teaching_settings.lab.damping_cycles, scenarios: insp.scenarios, specimens });
const lib = CL.createCaselib({ cases, rules: wf, standard: std, specimens: spec, makeWave, scenario: insp.scenarios[0] });
const thickDoc = readJson('contracts/thickness.json');
const { createThickness } = await import(new URL('../src/thickness.js', import.meta.url));
const th = createThickness({ doc: thickDoc, cases, rules: wf, standard: std, specimens: spec, makeWave, scenario: insp.scenarios[0], createCaselib: CL.createCaselib });
const files = { waveform_rules: wf, standard: std, specimens_manifest: spec, model_manifest: model, practice_doc: readJson('knowledge/practice.json') };
const taskcard = createTaskcard({ tasks, standard: std, rules: wf, manifest: model, specimens: spec, thickness: thickDoc });
const TS = createTaskScoring({ rubric, tasks, files, taskcard });

const results = [];
const check = (id, desc, ok, detail = '') => results.push({ id, desc, status: ok ? 'PASS' : 'FAIL', detail });
const P = wf.practice;
const AV = P.acceptance_values;
const TOL = P.sensitivity_record.tolerance_dB;
const T = taskcard.plateThickness();
const item = (r, id) => r.items.find((x) => x.id === id);
const pts = (id) => tasks.rubric.items.find((x) => x.id === id).points;
const LEVELS = std.items.grading.levels;

// Card at the reference values for the task level.
function goodCard(level, t = T) {
  const R = taskcard.reference(t, level);
  return {
    probe_type: R.probe_type.includes('single') ? 'single' : R.probe_type[0], frequency_MHz: R.frequency[0], element_mm: R.element[0],
    reference_block: R.reference_block, edge_zone_mm: R.edge_zone, middle_pattern: 'lines', spacing_mm: R.scan_plan.lines,
    scan_plus_dB: R.scan_sensitivity, compensation_dB: R.compensation, level,
  };
}

function caseOf(t) {
  return t.case ? lib.libraryCase(t.case) : th.libraryCase(t.thickness);
}

function dacOfPlate(Tmm) {
  if (Tmm === 50) return spec.specimens[P.dac.specimen].holes.map((h) => ({ id: h.id, S: h.S_mm, G: AV.dac_G_dB[String(h.S_mm)] }));
  const id = th.profile(Tmm).block;
  return th.dacOf(id).map((p) => ({ id: th.block(id).holes.find((h) => h.S_mm === p.S).id, S: p.S, G: p.G }));
}

// Task run as the app stores it: preset calibration / DAC, sensitivity per card, every display found and sized, verdicts at `evalLevel`.
function run(t, { card, evalLevel, mod } = {}) {
  const cs = caseOf(t);
  const Tmm = cs.plate.dims.thickness.value;
  const used = card || goodCard(t.level, Tmm);
  const gen = Tmm === 50 ? lib : th.caseGen(Tmm);
  const ctx = gen.scoringContext(cs);
  const sid = ctx.specimen_id;
  const dac = dacOfPlate(Tmm);
  const GB = dac[dac.length - 1].G;
  const results = {};
  for (const [id, d] of Object.entries(ctx.displays)) results[id] = { length: d.reference_mm.length, area: d.reference_mm.area_mm2, eq: d.reference_eq_dB };
  const exp = ctx.expected[evalLevel ?? used.level];
  const prac = {
    done: { calibrate: true, dac: true, sensitivity: true, scan: true, quantify: true, evaluate: true },
    calib: { points: { ...P.calibration.targets_mm } },
    dac: { points: dac },
    sens: { base: GB, scan: GB + used.scan_plus_dB + used.compensation_dB },
    plates: { [sid]: { scan: { trail: [[0, 0], [0, 1]], found: ctx.defects.map((id) => ({ id, flags: [], confirmed: true })) }, quant: { results } } },
    eval: { level: evalLevel ?? used.level, verdicts: Object.fromEntries(ctx.defects.map((id) => [id, exp[id]])), plate: ctx.expected.plate_grade, conclusion: exp.pass ? 'accept' : 'reject' },
    card: used,
  };
  const c = {
    prac,
    events: [{ name: 'task:card', payload: {} }, { name: 'practice:sensitivity', payload: {} }, { name: 'practice:evaluate', payload: { correct: true, self_consistent: true } }],
    coverage: { [sid]: { edge: 1, middle: 0.95 } },
    case: ctx, card: used, task: { id: t.id, level: t.level }, thickness_mm: Tmm,
  };
  mod?.(c, ctx);
  return { r: TS.score(c), ctx, Tmm };
}
const full = (r) => r.total === 100 && r.max === 100 && r.items.every((x) => x.points === x.max && x.status === 'ok');

// S1 derived rubric: task items from rubric.json with the task points, sensitivity 0-point link, preset steps out of the chain
const D = deriveRubric(rubric, tasks);
const ev = D.items.find((x) => x.id === 'evaluate');
const scale = pts('evaluate') / rubric.items.find((x) => x.id === 'evaluate').points;
const evParts = ev.parts.filter((p) => typeof p.points === 'number').map((p) => [p.id, p.points]);
const srcParts = rubric.items.find((x) => x.id === 'evaluate').parts.filter((p) => typeof p.points === 'number').map((p) => [p.id, p.points * scale]);
const sumTask = tasks.rubric.items.reduce((s, x) => s + x.points, 0);
check('S1', '任务细则派生：扫查 / 检出 / 定量 / 评定 / 操作沿用 rubric.json 规则并按任务分值等比缩放；灵敏度为 0 分链节点；校准 / DAC / 组装退出链；合计 100',
  JSON.stringify(D.items.map((x) => x.id)) === JSON.stringify(['sensitivity', 'scan', 'detect', 'quantify', 'evaluate', 'conduct'])
  && D.items[0].points === 0 && D.items[0].requires.length === 0 && JSON.stringify(D.chain) === JSON.stringify(['sensitivity', 'scan', 'detect', 'quantify', 'evaluate'])
  && ['scan', 'detect', 'quantify', 'evaluate', 'conduct'].every((id) => D.items.find((x) => x.id === id).points === pts(id))
  && JSON.stringify(evParts) === JSON.stringify(srcParts) && sumTask === 100 && tasks.rubric.max_total === 100 && D.max_total === 100,
  `${D.items.map((x) => `${x.id} ${x.points}`).join(' / ')}; evaluate parts ${evParts.map(([k, v]) => `${k} ${v}`).join(', ')}`);

// S2 perfect run on each task plate: 100, every item ok; output carries task / case ids
const p2 = tasks.tasks.list.map((t) => ({ t, ...run(t) }));
const bad2 = p2.filter(({ r }) => !full(r)).map(({ t, r }) => `${t.id} ${r.total} ${r.items.filter((x) => x.status !== 'ok').map((x) => x.id).join('/')}`);
check('S2', '全部任务按正确工艺卡、按任务等级评定：全部 100 分、七项 ok；输出含 task_id / level / case_id / template_id',
  bad2.length === 0 && p2.every(({ t, r, ctx }) => r.task_id === t.id && r.level === t.level && r.case_id === ctx.case_id && r.template_id === ctx.template_id && r.items.length === 7),
  bad2.join(', ') || p2.map(({ t, r }) => `${t.id}:${r.total}`).join(' '));

// S3 card groups: each wrong group costs its points only
const t0 = tasks.tasks.list[0];
const wrong = {
  probe_type: (c) => { c.probe_type = taskcard.options('probe_type').find((o) => !taskcard.reference(T, t0.level).probe_type.includes(o)) ?? c.probe_type; },
  frequency: (c) => { c.frequency_MHz = taskcard.reference(T, t0.level).frequency[1] + 5; },
  element: (c) => { c.element_mm = taskcard.reference(T, t0.level).element[1] + 10; },
  reference_block: (c) => { c.reference_block = taskcard.options('reference_block').find((o) => o !== taskcard.reference(T, t0.level).reference_block); },
  edge_zone: (c) => { c.edge_zone_mm = taskcard.reference(T, t0.level).edge_zone - 10; },
  scan_plan: (c) => { c.spacing_mm = taskcard.reference(T, t0.level).scan_plan.lines + 10; },
};
const cardPart = (g) => tasks.rubric.items.find((x) => x.id === 'card').parts.find((p) => p.group === g).points;
const bad3 = Object.entries(wrong).map(([g, f]) => {
  const card = goodCard(t0.level);
  f(card);
  const { r } = run(t0, { card });
  const ci = item(r, 'card');
  return Math.abs(r.total - (100 - cardPart(g))) < 1e-9 && ci.parts.find((p) => p.id === g).points === 0 && ci.status === 'partial' ? null : `${g} ${r.total}`;
}).filter(Boolean);
const probeSkip = taskcard.reference(T, t0.level).probe_type.length === 2;
check('S3', `工艺卡分组：错一组只扣该组分值（频率 / 晶片 / 试块 / 边缘区 / 扫查间距${probeSkip ? '；本厚度双晶单晶皆可，探头类型不扣' : ' / 探头类型'}），其余项不受影响`,
  bad3.length === (probeSkip ? 1 : 0) && (!probeSkip || bad3[0].startsWith('probe_type')), bad3.join(', ') || 'all groups');

// S4 card-driven sensitivity: executed per card scores the task sensitivity item; card value against the standard scores the card group
const plusCard = { ...goodCard(t0.level), scan_plus_dB: std.items.scan_sensitivity.plus_dB + 4 };
const s4a = run(t0, { card: plusCard }).r;
const s4b = run(t0, { card: plusCard, mod: (c) => { c.prac.sens.scan = AV.G_base_dB + std.items.scan_sensitivity.plus_dB; } }).r;
const s4c = run(t0, { mod: (c) => { c.events = c.events.filter((e) => e.name !== 'practice:sensitivity'); c.prac.done.sensitivity = false; c.prac.sens = null; } }).r;
const s4d = run(t0, { card: { ...goodCard(t0.level), compensation_dB: 3 } }).r;
check('S4', '扫查灵敏度按工艺卡：按卡执行得灵敏度分、卡值不符标准扣卡分；未按卡执行灵敏度 0 分；未记录灵敏度 → 扫查及其后各项依据无效',
  item(s4a, 'sensitivity').points === pts('sensitivity') && item(s4a, 'card').parts.find((p) => p.id === 'scan_sensitivity').points === 0
  && item(s4b, 'sensitivity').points === 0 && item(s4b, 'sensitivity').status === 'partial'
  && item(s4c, 'sensitivity').status === 'missing' && item(s4c, 'scan').status === 'basis_invalid' && item(s4c, 'detect').status === 'basis_invalid'
  && item(s4d, 'sensitivity').points === pts('sensitivity') && item(s4d, 'card').parts.find((p) => p.id === 'compensation').points === 0,
  `plus+4 ${s4a.total}; executed std ${s4b.total}; none ${s4c.total} (${item(s4c, 'scan').status}); comp 3 ${s4d.total}`);

function ctxOf(t) {
  const cs = caseOf(t);
  const Tmm = cs.plate.dims.thickness.value;
  return (Tmm === 50 ? lib : th.caseGen(Tmm)).scoringContext(cs);
}

// S5 evaluation at the task level: wrong card level evaluated as carded loses where the expectations differ; verdicts at the task level keep full points
const differs = (ctx, a, b) => ctx.expected[a].pass !== ctx.expected[b].pass || ctx.defects.some((d) => ctx.expected[a][d] !== ctx.expected[b][d]);
const bad5 = [];
let n5 = 0;
for (const t of tasks.tasks.list) {
  const Tmm = caseOf(t).plate.dims.thickness.value;
  const ctx = ctxOf(t);
  const other = LEVELS.find((lv) => lv !== t.level && differs(ctx, lv, t.level));
  if (!other) continue;
  n5++;
  const card = { ...goodCard(t.level, Tmm), level: other };
  const a = run(t, { card }).r;
  const b = run(t, { card, evalLevel: t.level }).r;
  if (!(item(a, 'evaluate').points < pts('evaluate') && item(a, 'card').points === 25 && item(b, 'evaluate').points === pts('evaluate'))) bad5.push(`${t.id} ${other} ${item(a, 'evaluate').points}/${item(b, 'evaluate').points}`);
}
check('S5', '评定按任务等级：工艺卡等级填错、按卡等级评定 → 评定在期望不同处失分（等级组 0 分值，卡分不变）；按任务等级评定仍满分',
  n5 > 0 && bad5.length === 0, bad5.join(', ') || `${n5} tasks with a differing level`);

// S6 detect / quantify scaled: a missed determined display costs detect 20 / n and its size / verdict
const t6 = tasks.tasks.list.map((t) => ({ t, ctx: ctxOf(t) })).find(({ ctx }) => Object.keys(ctx.judged).length >= 1 && ctx.defects.length >= 2);
const miss = Object.keys(t6.ctx.judged)[0];
const r6 = run(t6.t, { mod: (c, ctx) => { const pl = c.prac.plates[ctx.specimen_id]; pl.scan.found = pl.scan.found.filter((f) => f.id !== miss); } }).r;
const want6 = Math.round((pts('detect') - pts('detect') / t6.ctx.defects.length) * 10) / 10;
check('S6', `漏检一处确定显示：检出失 ${pts('detect')} / n，该显示定量与判定依据无效`,
  Math.abs(item(r6, 'detect').points - want6) < 0.051 && item(r6, 'quantify').parts.find((p) => p.id === `size_${miss}`).status === 'basis_invalid'
  && item(r6, 'evaluate').parts.find((p) => p.id === `verdict_${miss}`).status === 'basis_invalid', `${t6.t.id} ${miss}: detect ${item(r6, 'detect').points} (${want6})`);

// S7 conduct: preset calibration counts as calibrated; a velocity change voids it once
const per = rubric.teacher_config.conduct.per_event;
const r7 = run(t0, { mod: (c) => { c.events.push({ name: 'instrument:velocity', payload: {} }, { name: 'instrument:zero', payload: {} }); } }).r;
check('S7', `操作规范：预设校准视为已校准，改声速作废一次（扣 ${per}），作废后再改零点不重复扣`,
  item(r7, 'conduct').points === Math.max(0, pts('conduct') - per) && r7.total === 100 - Math.min(pts('conduct'), per), `${item(r7, 'conduct').points}`);

// S8 deterministic
const a8 = run(tasks.tasks.list[4]).r;
const b8 = run(tasks.tasks.list[4]).r;
check('S8', '同任务同状态评分逐字节一致', JSON.stringify(a8) === JSON.stringify(b8), `${a8.task_id} ${a8.total}`);

// K1 V5.1 design has its own storage; boot restores only the separate detection context. Legacy reports stay readable.
const normalizedMain = main.replace(/\r\n/g, '\n');
const fnBody = (name) => { const i = normalizedMain.indexOf(`function ${name}(`); return i < 0 ? '' : normalizedMain.slice(i, normalizedMain.indexOf('\n}\n', i) + 3); };
const bootSrc = fnBody('bootSessions'), persistDesignSrc = fnBody('persistDesignResult');
const wiring = {
  designSubmit: /if \(design\)[\s\S]{0,450}taskcard\.score\(st\.card, taskcard\.plateThickness\(task\), task\.level\)[\s\S]{0,250}persistDesignResult\(\)/.test(fnBody('confirmTaskCard')),
  submit: /S\.prac\.score = examScore\(\);\s*emit\('session:submit'/.test(fnBody('submitExam')),
  scoreTable: main.includes('id="taskScore"') && main.includes('function designResult()'),
  report: main.includes('function taskReportModel()') && main.includes("head: ['', TK.columns.card, TK.columns.standard, TK.columns.actual, '']") && main.includes('taskConsistency()'),
  overlay: reportSrc.includes('plan = null') && main.includes('plan: plan ? { ...plan, edge_line: D.edge_line, plan_line: D.plan_line } : null'),
  replay: main.includes("const card = doc.mode === 'task' && doc.card ? { ...doc.card } : null;") && replaySrc.includes('header.random_seed != null'),
  designRestore: persistDesignSrc.includes("localStorage.setItem('ut.m11.design'")
    && /localStorage\.getItem\('ut\.m11\.design'\)/.test(fnBody('launchLearning'))
    && /S\.task\.designs/.test(fnBody('launchLearning')),
  restore: bootSrc.includes("store.load('exam')") && bootSrc.includes("store.resume('exam', saved)")
    && bootSrc.includes('S.examPrac = pracFromJSON(saved.state?.prac, { exam: true')
    && bootSrc.includes('S.examPrac.presetPlan = saved.state.prac.presetPlan;')
    && bootSrc.includes('S.examPrac.presetCard = saved.state.prac.presetCard;')
    && !/restoreTask\(|store\.(load|resume)\('(task|train)'/.test(bootSrc)
    && bootSrc.includes('S.learning.role = null; S.learning.route = null;'),
  contract: events.events.find((e) => e.name === 'session:restore').payload.mode.split('|').includes('task'),
};
check('K1', 'V5 工艺设计独立评分 / 存储 / 按需恢复；检测提交记 session:submit，刷新仅恢复检测实例与系统预置、入口回到模式选择；旧工艺卡报告 / 计划线 / 回放及恢复契约保持兼容',
  Object.values(wiring).every(Boolean), Object.entries(wiring).filter(([, v]) => !v).map(([k]) => k).join(', ') || Object.keys(wiring).join(' / '));

// K2 sealed paths and staging
const sealed = {
  cases: cases.milestone === 'M9.6',
  m90: main.includes("import { createCaselib } from './caselib.js'") && main.includes("import casesDoc from '../../contracts/cases.json'"),
  guard: main.includes('if (examLocked()) return;') && main.includes('items.some((it) => it.determined && (it.S_mm2 == null')
    && main.includes('!E.level || !E.plate || !E.conclusion || items.some((it) => !E.verdicts[it.id])')
    && main.includes('self_consistent && !missed.length') && !main.includes('!S.exam && items.length <'),
  examScore: /return scoring\.score\(\{/.test(fnBody('examScore'))
    && /createDetectionScoring\(\{\s*rubric: rubricDoc, files: SCORE_FILES\s*\}\)/.test(main)
    && /createScoring\(\{\s*rubric: derived, files\s*\}\)/.test(read('webapp/src/v4-training.js')),
  staged: /^M10\.[3-9]$/.test(tasks.milestone) && /^M10\.[3-9]$/.test(taskDoc.milestone) && ['report', 'scan_gain'].every((k) => typeof taskDoc[k] === 'string')
    && ['card', 'sensitivity'].every((k) => typeof taskDoc.rubric?.[k] === 'string'),
};
check('K2', '封存：cases.json M9.6、m90 导入行与原评分数值引擎保持，检测评分经 V4 适配器；提交核对已记录显示的测量与判定，允许部分检出并单独反馈漏检；tasks.json / task.json M10.3 起与新短标签',
  Object.values(sealed).every(Boolean), Object.entries(sealed).filter(([, v]) => !v).map(([k]) => k).join(', ') || `${tasks.tasks_version}`);

let fail = 0;
for (const r of results) {
  if (r.status !== 'PASS') fail++;
  console.log(`${r.status}  ${r.id}  ${r.desc}${r.detail ? `  [${r.detail}]` : ''}`);
}
console.log(`\nm103_score: ${results.length - fail}/${results.length} ${fail ? 'FAIL' : 'PASS'}`);
process.exit(fail ? 1 : 0);
