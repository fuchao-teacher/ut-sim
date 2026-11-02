// M10.6 checks: 30 / 80 mm tasks, DAC on the card block, wrong-block range, scoring (block group only), 50 mm unchanged.
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createProcedure } from '../src/procedure.js';
import { createTaskcard } from '../src/taskcard.js';
import { createTaskScoring } from '../src/taskscore.js';

const here = dirname(fileURLToPath(import.meta.url));
const proj = join(here, '..', '..');
const read = (p) => readFileSync(join(proj, p), 'utf8');
const readJson = (p) => JSON.parse(read(p));

const tasks = readJson('contracts/tasks.json');
const thickDoc = readJson('contracts/thickness.json');
const cases = readJson('contracts/cases.json');
const wf = readJson('contracts/waveform_rules.json');
const std = readJson('contracts/standard_nbt47013_3.json');
const spec = readJson('contracts/specimens_manifest.json');
const model = readJson('contracts/model_manifest.json');
const rubric = readJson('contracts/rubric.json');
const scenes = readJson('knowledge/scenes.json');
const insp = readJson('knowledge/inspection.json');
const main = read('webapp/src/main.js');
const srcDir = join(proj, 'webapp', 'src');
const src = Object.fromEntries(readdirSync(srcDir).filter((f) => f.endsWith('.js')).map((f) => [f, readFileSync(join(srcDir, f), 'utf8')]));

const results = [];
const check = (id, desc, ok, detail = '') => results.push({ id, desc, status: ok ? 'PASS' : 'FAIL', detail });

const { createWaveform } = await import(new URL('../src/waveform.js', import.meta.url));
const CL = await import(new URL('../src/caselib.js', import.meta.url));
const { createThickness } = await import(new URL('../src/thickness.js', import.meta.url));
const makeWave = (specimens) => createWaveform({ rules: wf, manifest: model, dampingCycles: scenes.teaching_settings.lab.damping_cycles, scenarios: insp.scenarios, specimens });
const scenario = insp.scenarios[0];
const lib = CL.createCaselib({ cases, rules: wf, standard: std, specimens: spec, makeWave, scenario });
const th = createThickness({ doc: thickDoc, cases, rules: wf, standard: std, specimens: spec, makeWave, scenario, createCaselib: CL.createCaselib });
const taskcard = createTaskcard({ tasks, standard: std, rules: wf, manifest: model, specimens: spec, thickness: thickDoc });
const files = { waveform_rules: wf, standard: std, specimens_manifest: spec, model_manifest: model, practice_doc: readJson('knowledge/practice.json') };
const TS = createTaskScoring({ rubric, tasks, files, taskcard });
const P = wf.practice;
const AV = P.acceptance_values;
const CAL = P.calibration.calibrated_state;
const caseOf = (t) => (t.case ? lib.libraryCase(t.case) : th.libraryCase(t.thickness));

const L = tasks.tasks.list;
const n30 = L.filter((t) => t.thickness?.startsWith('30-')).length;
const n80 = L.filter((t) => t.thickness?.startsWith('80-')).length;
const n50 = L.filter((t) => t.case).length;
check('L1', `任务清单：T01 起连续 ${L.length} 项；50 mm ${n50}、30 mm ${n30}、80 mm ${n80}；thickness 库题全部可生成`,
  L.length === 18 && n50 === 10 && n30 === 4 && n80 === 4 && thickDoc.library.every((e) => th.libraryCase(e.id)),
  L.map((t) => t.id).join(' '));

const t15 = L.find((t) => t.id === 'T15');
const cs15 = caseOf(t15);
const T15 = cs15.plate.dims.thickness.value;
const deep = cs15.plate.defects.filter((d) => {
  const z = d.type === 'cluster' ? d.members.map((m) => m.depth_mm) : d.type === 'segregation' ? d.depth_range_mm : [d.depth_mm];
  return Math.max(...z) > 45 && cs15.reference.items.find((i) => i.id === d.id)?.determined;
});
const work = { ...spec, runtime_specimens: { ...spec.runtime_specimens, [cs15.specimen_id]: cs15.plate, ...th.blocks() } };
const wave = makeWave(work);
const pr = createProcedure({ rules: wf, wave, specimens: work, standard: std });
const st = (x, y, g) => ({
  ...Object.fromEntries(Object.entries(wf.controls).map(([k, v]) => [k, v.default])),
  scene: scenario.id, ...scenario.defaults, range_mm: 200, velocity_m_s: CAL.velocity_m_s, zero_us: CAL.zero_us,
  reject_percent: 0, thickness_mm: T15, defects: [], specimen_id: cs15.specimen_id, gain_dB: g, probe_x_mm: x, probe_y_mm: y,
});
const dac3 = th.dacOf('specimen__cbii_3');
const dac2 = spec.specimens[P.dac.specimen].holes.map((h) => ({ S: h.S_mm, G: AV.dac_G_dB[String(h.S_mm)] }));
const GB3 = dac3[dac3.length - 1].G;
const GB2 = dac2[dac2.length - 1].G;
const d0 = deep[0];
const [x, y] = d0.centre_mm;
const r3 = pr.criteria(st(x, y, GB3), dac3, GB3);
const r2 = pr.criteria(st(x, y, GB2), dac2, GB2);
check('L2', `卡驱动 DAC：T15 为 80 mm 板；正确试块 CBII-3 共 ${dac3.length} 点、基准 ${GB3} dB；CBII-2 共 ${dac2.length} 点、基准 ${GB2} dB；存在深度 > 45 mm 的确定显示`,
  T15 === 80 && dac3.length === 5 && dac2.length === 3 && GB3 === 48.32 && GB2 === 37.63 && deep.length > 0,
  `T ${T15}, deep ${deep.map((d) => d.id).join('/')}`);

check('L3', `选错试块：T15 深处确定显示在 CBII-3 上 F1 超 DAC，在 CBII-2 上无 DAC（无法按 F1 判定）`,
  r3.flags.includes('F1_over_dac') && r3.defect === d0.id && (r2.f1 == null || r2.f1.id !== d0.id),
  `${d0.id} @ ${d0.depth_mm} mm; CBII-3 ${JSON.stringify(r3.flags)} ${r3.f1?.dB}; CBII-2 ${JSON.stringify(r2.flags)} f1=${r2.f1?.id ?? '—'}`);

function scoreOf(t, thickForCard, patch = {}) {
  const cs = caseOf(t);
  const Tmm = cs.plate.dims.thickness.value;
  const gen = Tmm === 50 ? lib : th.caseGen(Tmm);
  const ctx = gen.scoringContext(cs);
  const R = taskcard.reference(thickForCard, t.level);
  const card = {
    probe_type: 'single', frequency_MHz: 2.5, element_mm: 14, reference_block: R.reference_block,
    edge_zone_mm: taskcard.reference(Tmm, t.level).edge_zone, middle_pattern: 'lines', spacing_mm: R.scan_plan.lines,
    scan_plus_dB: R.scan_sensitivity, compensation_dB: R.compensation, level: t.level, ...patch,
  };
  const dac = Tmm === 50
    ? spec.specimens[P.dac.specimen].holes.map((h) => ({ id: h.id, S: h.S_mm, G: AV.dac_G_dB[String(h.S_mm)] }))
    : th.dacOf(th.profile(Tmm).block);
  const GB = dac[dac.length - 1].G;
  const results = {};
  for (const [id, d] of Object.entries(ctx.displays)) results[id] = { length: d.reference_mm.length, area: d.reference_mm.area_mm2, eq: d.reference_eq_dB };
  const exp = ctx.expected[t.level];
  return TS.score({
    prac: {
      done: { calibrate: true, dac: true, sensitivity: true, scan: true, quantify: true, evaluate: true },
      calib: { points: { ...P.calibration.targets_mm } }, dac: { points: dac },
      sens: { base: GB, scan: GB + card.scan_plus_dB + card.compensation_dB },
      plates: { [ctx.specimen_id]: { scan: { trail: [[0, 0]], found: ctx.defects.map((id) => ({ id, flags: [], confirmed: true })) }, quant: { results } } },
      eval: { level: t.level, verdicts: Object.fromEntries(ctx.defects.map((id) => [id, exp[id]])), plate: ctx.expected.plate_grade, conclusion: exp.pass ? 'accept' : 'reject' },
      card,
    },
    events: [{ name: 'practice:sensitivity', payload: {} }, { name: 'practice:evaluate', payload: { correct: true, self_consistent: true } }],
    coverage: { [ctx.specimen_id]: { edge: 1, middle: 0.95 } },
    case: ctx, card, task: { id: t.id, level: t.level }, thickness_mm: Tmm,
  });
}
const ok15 = scoreOf(t15, 80);
const wrong15 = scoreOf(t15, 80, { reference_block: '2' });
const cardLost = tasks.rubric.items.find((i) => i.id === 'card').parts.find((p) => p.group === 'reference_block').points;
const det15 = ok15.items.find((i) => i.id === 'detect');
const detW = wrong15.items.find((i) => i.id === 'detect');
check('L4', `评分：T15 正确卡 100；选 CBII-2 只扣试块组 ${cardLost} 分（检出仍按参考答案，不另扣「依据无效」）`,
  ok15.total === 100 && wrong15.items.find((i) => i.id === 'card').points === 25 - cardLost
    && detW.points === det15.points && wrong15.total === 100 - cardLost,
  `ok ${ok15.total}; wrong card ${wrong15.items.find((i) => i.id === 'card').points} detect ${detW.points} total ${wrong15.total}`);

const t01 = L.find((t) => t.id === 'T01');
const ok01 = scoreOf(t01, 50);
check('L5', '50 mm T01 正确卡仍 100；案例库与 cases.json M9.6 不变',
  ok01.total === 100 && cases.milestone === 'M9.6' && t01.case === '01', `${ok01.total}, cases ${cases.milestone}`);

const wiring = {
  preset: main.includes('function presetDac(card)') && main.includes('P.dac.points = presetDac(P.card)'),
  start: main.includes('taskCaseOf(taskcard.task(id))') && /fillSteps\(STEP_IDS\[TASK_FIRST_STEP\]\)/.test(main),
  head: /thickness_mm: cs\.thickness_mm/.test(main),
  replay: /P\.dac\.points = presetDac\(card\)/.test(main) && /thickness_mm: card \? doc\.thickness_mm/.test(main),
  restore: /makeCase\(c\.template_id, c\.seed, h\.thickness_mm/.test(main),
  xray: main.includes('const id = dacSpecimen()'),
  cjk: Object.entries(src).every(([, s]) => !/[\u4e00-\u9fff]/.test(s)),
};
check('K1', '接入：预置 DAC 取卡上试块、任务板按 50 mm 库 / 板厚库、表头 thickness_mm、回放 / 恢复按板厚重建、透视跟卡上试块；源码无中文',
  Object.values(wiring).every(Boolean) && tasks.milestone === 'M10.6' && thickDoc.milestone === 'M10.6',
  Object.entries(wiring).filter(([, v]) => !v).map(([k]) => k).join(', ') || `${tasks.milestone} / ${thickDoc.milestone}`);

for (const r of results) console.log(`${r.status}  ${r.id}  ${r.desc}${r.detail ? `  [${r.detail}]` : ''}`);
const pass = results.filter((r) => r.status === 'PASS').length;
console.log(`\nm106_task: ${pass}/${results.length} ${pass === results.length ? 'PASS' : 'FAIL'}`);
process.exit(pass === results.length ? 0 : 1);
