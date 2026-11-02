// M10.2 checks (docs/M10_SCOPE.md §5, §7): card drive on the procedure engine (compensation, sensitivity target, mark visibility)
// over the task plates, and the task context wiring in main.js. run: node tools/m102_drive.mjs
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createProcedure } from '../src/procedure.js';

const here = dirname(fileURLToPath(import.meta.url));
const proj = join(here, '..', '..');
const read = (p) => readFileSync(join(proj, p), 'utf8');
const readJson = (p) => JSON.parse(read(p));

const tasks = readJson('contracts/tasks.json');
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
const practiceSrc = read('webapp/src/practice.js');
const procSrc = read('webapp/src/procedure.js');
const sessionSrc = read('webapp/src/session.js');
const recordSrc = read('webapp/src/learning-workflow.js');
const { createWaveform } = await import(new URL('../src/waveform.js', import.meta.url));
const CL = await import(new URL('../src/caselib.js', import.meta.url));
const { createThickness } = await import(new URL('../src/thickness.js', import.meta.url));
const makeWave = (specimens) => createWaveform({ rules: wf, manifest: model, dampingCycles: scenes.teaching_settings.lab.damping_cycles, scenarios: insp.scenarios, specimens });
const lib = CL.createCaselib({ cases, rules: wf, standard: std, specimens: spec, makeWave, scenario: insp.scenarios[0] });
const thickDoc = readJson('contracts/thickness.json');
const th = createThickness({ doc: thickDoc, cases, rules: wf, standard: std, specimens: spec, makeWave, scenario: insp.scenarios[0], createCaselib: CL.createCaselib });

const results = [];
const check = (id, desc, ok, detail = '') => results.push({ id, desc, status: ok ? 'PASS' : 'FAIL', detail });
const P = wf.practice;
const AV = P.acceptance_values;
const TOL = P.sensitivity_record.tolerance_dB;
const PLUS = std.items.scan_sensitivity.plus_dB;
const pts = spec.specimens[P.dac.specimen].holes.map((h) => ({ id: h.id, S: h.S_mm, G: AV.dac_G_dB[String(h.S_mm)] }));
const comp = (c) => pts.map((p) => ({ ...p, G: p.G + c }));
const near = (a, b, e = 1e-6) => Math.abs(a - b) <= e;

// Task plates with their procedure engines.
const plates = tasks.tasks.list.map((t) => {
  const cs = t.case ? lib.libraryCase(t.case) : th.libraryCase(t.thickness);
  const Tmm = cs.plate.dims.thickness.value;
  const dPts = Tmm === 50 ? pts : th.dacOf(th.profile(Tmm).block);
  const work = { ...spec, runtime_specimens: { ...spec.runtime_specimens, [cs.specimen_id]: cs.plate, ...th.blocks() } };
  const wave = makeWave(work);
  return { t, cs, Tmm, dPts, wave, pr: createProcedure({ rules: wf, wave, specimens: work, standard: std }) };
});
const pr0 = plates[0].pr;
const GB = pr0.gBase(pts);
const CAL = P.calibration.calibrated_state;
const stOf = ({ cs }, x, y, g) => ({
  ...Object.fromEntries(Object.entries(wf.controls).map(([k, v]) => [k, v.default])),
  scene: insp.scenarios[0].id, ...insp.scenarios[0].defaults,
  range_mm: 100, velocity_m_s: CAL.velocity_m_s, zero_us: CAL.zero_us, reject_percent: 0,
  thickness_mm: cs.plate.dims.thickness.value, defects: [], specimen_id: cs.specimen_id, gain_dB: g, probe_x_mm: x, probe_y_mm: y,
});

// D1 sensitivity target = G_base + card plus + card compensation; default plus = standard
const s1 = pr0.sensRecord(pts, GB + PLUS);
const s2 = pr0.sensRecord(pts, GB + PLUS - 1);
const s3 = pr0.sensRecord(pts, GB + 3, 3);
const s4 = pr0.sensRecord(comp(4), GB + 4 + PLUS, PLUS);
const s5 = pr0.sensRecord(comp(4), GB + PLUS, PLUS);
const s6 = pr0.sensRecord(comp(-2), GB - 2 + 3 + TOL, 3);
check('D1', '灵敏度记录：目标 = G_base + 工艺卡扫查灵敏度 + 工艺卡补偿（容差同 sensitivity_record）；不传参数时仍为标准 +6 dB（实训 / 考核不变）',
  s1.ok && !s2.ok && s3.ok && s4.ok && near(s4.base, GB + 4) && !s5.ok && s6.ok,
  `G_base ${GB}; std ${s1.ok}/${s2.ok}; plus 3 ${s3.ok}; comp +4 ${s4.ok} base ${s4.base}; comp -2 plus 3 @tol ${s6.ok}`);

// D2 compensation: criteria at G_base + comp against the DAC at G_base: F1 - DAC + comp, B1 x 10^(comp / 20), on every task plate
let n2 = 0;
let bad2 = [];
for (const pl of plates) {
  for (const d of pl.cs.plate.defects) {
    const [x, y] = d.centre_mm;
    const r0 = pl.pr.criteria(stOf(pl, x, y, pl.pr.gBase(pl.dPts)), pl.dPts, pl.pr.gBase(pl.dPts));
    for (const c of [-3, 0, 4]) {
      const rc = pl.pr.criteria(stOf(pl, x, y, pl.pr.gBase(pl.dPts) + c), pl.dPts.map((p) => ({ ...p, G: p.G + c })), pl.pr.gBase(pl.dPts) + c);
      n2++;
      const f1ok = (r0.f1 == null && rc.f1 == null) || (r0.f1 && rc.f1 && rc.f1.id === r0.f1.id && near(rc.f1.dB, r0.f1.dB + c, 1e-6));
      const b1ok = (r0.b1 == null && rc.b1 == null) || near(rc.b1, r0.b1 * 10 ** (c / 20), 1e-6 * Math.max(1, r0.b1));
      const same0 = c !== 0 || JSON.stringify(rc) === JSON.stringify(r0);
      if (!f1ok || !b1ok || !same0) bad2.push(`${pl.t.id}/${d.id} c${c}`);
    }
  }
}
check('D2', '补偿驱动：DAC 点增益 + 补偿后在 G_base + 补偿处评判，F1−DAC 恰增加补偿值、B1 按 10^(补偿/20) 放大；补偿 0 与原判据逐项一致（全部任务板）',
  n2 > 0 && bad2.length === 0, bad2.slice(0, 6).join(', ') || `${n2} cases`);

// D3 equivalent and live readout shift by the compensation, independent of the display gain
const S45 = 45;
const eq0 = pr0.f1MinusDac(pts, S45, 40, GB + 6);
const eqc = pr0.f1MinusDac(comp(4), S45, 40, GB + 6);
const eqg = pr0.f1MinusDac(comp(4), S45, 40 * 10 ** (6 / 20), GB + 12);
check('D3', '当量：用补偿后 DAC 测得的 F1−DAC 比基准大补偿值，与显示增益无关', near(eqc - eq0, 4, 1e-9) && near(eqg, eqc, 1e-9), `${eq0.toFixed(2)} → ${eqc.toFixed(2)} (${eqg.toFixed(2)})`);

// D4 mark visibility: with the standard scan sensitivity every echo above the mark floor (rounded) is visible; with plus 0 the weak deep echoes are not
const SP = tasks.drive.mark_visible.screen_percent;
const FLOOR = P.mark.min_f1_minus_dac_dB;
const shown = (S, d, plus) => pr0.hDac(pts, S, GB) * 10 ** (d / 20) * 10 ** (plus / 20);
const depths = [];
for (let S = pts[0].S; S <= pts[pts.length - 1].S + 1e-9; S += 2.5) depths.push(S);
const okStd = depths.every((S) => shown(S, FLOOR + 0.1, PLUS) >= SP && shown(S, 0, PLUS) >= SP);
const lost0 = depths.filter((S) => shown(S, FLOOR + 0.1, 0) < SP).length;
check('D4', `标记可见：按标准扫查灵敏度（+${PLUS} dB），DAC 范围内高于标记下限的回波屏高均 ≥ ${SP} %；工艺卡写 0 dB 时较深处弱回波不可标记`,
  okStd && lost0 > 0 && /minPercent: S\.taskOn \? TASK_DRIVE\.mark_visible\.screen_percent/.test(main)
    && /function currentRecordCandidate\(/.test(main) && main.includes('gate: gateOf(), frame: lastFrame')
    && recordSrc.includes('echo.pct < minPercent') && recordSrc.includes('reading.h < (options.minPercent ?? 5)'),
  `std all ${okStd}; plus 0 lost at ${lost0}/${depths.length} depths`);

// K1 V4 separates independent card design from system-prepared detection; legacy drive contracts remain readable.
const sessionStart = events.events.find((e) => e.name === 'session:start').payload.mode.split('|');
const sessionRestore = events.events.find((e) => e.name === 'session:restore').payload.mode.split('|');
const detectionSrc = read('webapp/src/v4-training.js');
const wiring = {
  design: main.includes("const design = route === 'design';") && main.includes("const nextMode = design ? 'independent' : 'guided';")
    && main.includes("if (S.learning.route === 'design' || referenceCardLearning() || selfStudy()) return false;")
    && main.includes('taskcard.score(st.card, taskcard.plateThickness(task), task.level)') && main.includes('persistDesignResult();'),
  sessMode: /const sessMode = \(\) => \(S\.learning\.role === 'exam' && S\.exam && !S\.taskOn \? 'exam' : null\)/.test(main),
  record: /function recordEvent\(name, payload\) \{\s*if \(S\.learning\.role !== 'exam'\) return;/.test(main)
    && main.includes("if (!store || (name.startsWith('task:') && !S.taskOn)) return;"),
  begin: main.includes("store.begin('exam', sessionInit(student))") && main.includes("emit('session:start', { mode: 'exam'"),
  swap: /function swapContext\(exam\) \{\s*if \(S\.taskOn\) leaveTask\(\);/.test(main),
  preset: main.includes('const reference = makeReferenceCard(taskcard, task, t);')
    && main.includes('const prepared = presetDetectionPractice({') && main.includes('dacPoints: presetDac(reference)')
    && detectionSrc.includes('delete prepared.card;') && detectionSrc.includes("step: 'scan'")
    && detectionSrc.includes('asmDone: true') && detectionSrc.includes('calibrate: true, dac: true, sensitivity: true')
    && detectionSrc.includes("source: 'system'"),
  dac: (main.match(/dacPts\(\)/g) || []).length >= 8 && main.includes('proc.criteria(S.insp, dacPts(), critG())'),
  level: main.includes("((S.taskOn || detectionTraining()) && key === 'level')"),
  plan: main.includes('practice.setPlan(id, taskPlan(), TASK_DRIVE.overlay)') && /function setPlan\(id, plan, style\)/.test(practiceSrc),
  contract: ['task', 'exam'].every((mode) => sessionStart.includes(mode) && sessionRestore.includes(mode)),
};
check('K1', 'V4 工艺设计独立评分且不启动旧任务检测；仅检测实例记录 exam 会话，系统按参考卡完成器材 / 校准 / DAC / 灵敏度后进入扫查、锁定等级；保留旧计划线与事件契约',
  Object.values(wiring).every(Boolean), Object.entries(wiring).filter(([, v]) => !v).map(([k]) => k).join(', ') || Object.keys(wiring).join(' / '));

// K2 sealed paths unchanged
const sealed = {
  sensDefault: procSrc.includes('function sensRecord(pts, G, plus = SCAN_PLUS)'),
  cases: cases.milestone === 'M9.6',
  m90: main.includes("import { createCaselib } from './caselib.js'") && main.includes("import casesDoc from '../../contracts/cases.json'"),
  seed: sessionSrc.includes('random_seed: null'),
  guard: main.includes('if (examLocked()) return;') && main.includes('items.some((it) => it.determined && (it.S_mm2 == null')
    && main.includes('!E.level || !E.plate || !E.conclusion || items.some((it) => !E.verdicts[it.id])')
    && main.includes('self_consistent && !missed.length') && !main.includes('!S.exam && items.length <'),
  examSwap: main.includes('S.prac = S.examPrac || freshPrac({ exam: true });'),
  taskOnly: main.includes('const liveCard = () => (S.taskOn ? S.prac.card : S.replay?.card) || null;')
    && main.includes('const taskComp = () => (liveCard() ? liveCard().compensation_dB : 0);')
    && main.includes('const scanPlus = () => (S.taskOn && S.prac.card ? S.prac.card.scan_plus_dB : STD.scan_sensitivity.plus_dB);'),
};
check('K2', '封存：sensRecord 默认参数、cases.json M9.6、m90 导入行、random_seed: null、submitEval 守卫、考核上下文切换保持；工艺卡驱动仅在任务上下文（及任务记录回放）生效',
  Object.values(sealed).every(Boolean), Object.entries(sealed).filter(([, v]) => !v).map(([k]) => k).join(', ') || 'ok');

// K3 contract / knowledge staged for M10.2
const O = tasks.drive.overlay;
check('K3', 'tasks.json M10.2（drive.overlay 颜色与上限）；knowledge/task.json 含「继续检测」短标签',
  /^M10\.[2-9]$/.test(tasks.milestone) && /^#[0-9a-f]{6}$/i.test(O.edge_line) && /^#[0-9a-f]{6}$/i.test(O.plan_line) && O.max_lines > 0 && typeof taskDoc.resume === 'string' && /^M10\.[2-9]$/.test(taskDoc.milestone),
  `${tasks.milestone} · ${O.edge_line} ${O.plan_line} ${O.max_lines} · ${taskDoc.resume}`);

let fail = 0;
for (const r of results) {
  if (r.status !== 'PASS') fail++;
  console.log(`${r.status}  ${r.id}  ${r.desc}${r.detail ? `  [${r.detail}]` : ''}`);
}
console.log(`\nm102_drive: ${results.length - fail}/${results.length} ${fail ? 'FAIL' : 'PASS'}`);
process.exit(fail ? 1 : 0);
