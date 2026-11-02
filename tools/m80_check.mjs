// M8.0 checks (docs/M8_SCOPE.md): rubric structure, reference resolution, dependency chain, event contract, assessment labels.
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const proj = join(here, '..', '..');
const readJson = (p) => JSON.parse(readFileSync(join(proj, p), 'utf8'));

const rubric = readJson('contracts/rubric.json');
const files = {
  waveform_rules: readJson('contracts/waveform_rules.json'),
  standard: readJson('contracts/standard_nbt47013_3.json'),
  specimens_manifest: readJson('contracts/specimens_manifest.json'),
  model_manifest: readJson('contracts/model_manifest.json'),
  events_contract: readJson('contracts/events_contract.json'),
  practice_doc: readJson('knowledge/practice.json'),
};
const contract = files.events_contract;
const asmt = readJson('knowledge/assessment.json');
const main = readFileSync(join(proj, 'webapp', 'src', 'main.js'), 'utf8');

const results = [];
const check = (id, desc, ok, detail = '') => results.push({ id, desc, status: ok ? 'PASS' : 'FAIL', detail });

const PR = files.waveform_rules.practice;
const p02 = files.specimens_manifest.runtime_specimens.specimen__plate_p02;
const P02_IDS = p02.defects.map((d) => d.id);
const byId = Object.fromEntries(rubric.items.map((it) => [it.id, it]));
const { createScoring } = await import(new URL('../src/scoring.js', import.meta.url));
files.case = createScoring({ rubric, files }).fixedCase();

function resolve(path) {
  const [key, dot] = path.split(':');
  let v = files[key];
  if (v === undefined) return undefined;
  for (const seg of dot.split('.')) {
    if (v == null) return undefined;
    const m = /^(.+)\[\*\]$/.exec(seg);
    if (m) { v = v[m[1]]; if (!Array.isArray(v)) return undefined; continue; }
    v = Array.isArray(v) ? v.map((x) => x?.[seg]) : v[seg];
  }
  return v;
}

// R1 versions
check('R1', 'rubric.json：schema_version / rubric_version / milestone M8.0 起（M8.3 起由评分引擎使用；M9.3 起 1.1 案例上下文）', !!rubric.schema_version && !!rubric.rubric_version && /^M(8\.[0-3]|9\.[3-9])$/.test(rubric.milestone), `${rubric.rubric_version} ${rubric.milestone}`);

// R2 V1 points
const V1 = { assembly: 5, calibrate: 15, dac: 15, sensitivity: 10, scan: 15, detect: 15, quantify: 10, evaluate: 10, conduct: 5 };
const got = Object.fromEntries(rubric.items.map((it) => [it.id, it.points]));
const sum = rubric.items.reduce((a, it) => a + it.points, 0);
check('R2', '100 分制 V1：九项分值与审定一致，合计 100', sum === 100 && rubric.max_total === 100 && JSON.stringify(got) === JSON.stringify(V1), JSON.stringify(got));

// R3 part points add up to item points
const holes = files.specimens_manifest.specimens.specimen__cbii_2.holes;
const holeDepths = holes.map((h) => h.depth_mm ?? h.S_mm ?? h.depth);
const judgedP02 = Object.keys(PR.tolerance.judged).filter((id) => P02_IDS.includes(id));
const partSum = (it) => it.parts.reduce((a, p) => {
  if (p.per === 'S') return a + p.points * holeDepths.length;
  if (p.per === 'defect' && typeof p.points === 'string') return a + Number((/^equal share of (\d+)$/.exec(p.points) || [])[1]);
  if (p.per === 'defect') return a + p.points * (it.id === 'quantify' ? judgedP02.length : P02_IDS.length);
  return a + p.points;
}, 0);
const badParts = rubric.items.filter((it) => partSum(it) !== it.points).map((it) => `${it.id}:${partSum(it)}/${it.points}`);
const p02Share = { detect: 15 / P02_IDS.length, quantify: 10 / judgedP02.length, evaluate: 5 / P02_IDS.length };
const p02Same = p02Share.detect === 3 && p02Share.evaluate === 1;
check('R3', '各项分项分值之和等于该项分值（DAC 按孔数；检出 / 定量 / 评定逐显示「equal share of n」）；P-02 均分后仍为检出 3 / 评定 1', badParts.length === 0 && p02Same,
  badParts.join(', ') || `holes ${holeDepths.join('/')}, judged ${judgedP02.join('/')}, P-02 shares ${JSON.stringify(p02Share)}`);

// R4 chain and requires
const CHAIN = ['assembly', 'calibrate', 'dac', 'sensitivity', 'scan', 'detect', 'quantify', 'evaluate'];
const chainOk = JSON.stringify(rubric.chain) === JSON.stringify(CHAIN);
const reqBad = CHAIN.map((id, i) => {
  const want = i === 0 ? [] : [CHAIN[i - 1]];
  return JSON.stringify(byId[id]?.requires) === JSON.stringify(want) ? null : `${id}->${JSON.stringify(byId[id]?.requires)}`;
}).filter(Boolean);
const conductFree = JSON.stringify(byId.conduct?.requires) === '[]';
check('R4', '工艺前置链 组装 → 校准 → DAC → 灵敏度 → 扫查 → 检出 → 定量 → 评定；每项 requires = 直接前一项；操作规范不在链上', chainOk && reqBad.length === 0 && conductFree, reqBad.join(', '));

// R5 acyclic + basis rule + per-defect deps
const seen = new Set();
const visit = (id, stack = new Set()) => {
  if (stack.has(id)) return false;
  if (seen.has(id)) return true;
  stack.add(id);
  const ok = (byId[id]?.requires || []).every((r) => byId[r] && visit(r, stack));
  stack.delete(id);
  seen.add(id);
  return ok;
};
const acyclic = rubric.items.every((it) => visit(it.id));
const validWhenOk = rubric.items.every((it) => typeof it.valid_when === 'string' && it.valid_when.length > 0);
const chainRefs = CHAIN.slice(2).every((id) => byId[id].valid_when.includes(`item:${byId[id].requires[0]}.valid`));
const perDef = byId.quantify.per_defect_requires?.includes('found_{id}') && byId.evaluate.per_defect_requires?.includes('found_{id}') && byId.evaluate.per_defect_requires.includes('size_{id}');
const statuses = JSON.stringify(rubric.basis_rule.statuses) === JSON.stringify(['ok', 'partial', 'basis_invalid', 'missing']);
check('R5', '依赖无环；每项有 valid_when；依据无效规则与状态；定量 / 评定逐缺陷依赖检出（评定确定显示另依赖定量）', acyclic && validWhenOk && chainRefs && perDef && statuses && typeof rubric.teacher_config.basis_invalid_factor === 'number');

// R6 every file reference resolves (with {id} expansion)
const refs = [];
const walk = (o, owner) => {
  if (Array.isArray(o)) return o.forEach((x) => walk(x, owner));
  if (o && typeof o === 'object') return Object.entries(o).forEach(([k, v]) => walk(v, k === 'items' ? owner : (o.id && byId[o.id] ? o.id : owner)));
  if (typeof o === 'string') for (const m of o.matchAll(/(?<![a-z_:])(waveform_rules|standard|specimens_manifest|model_manifest|events_contract|practice_doc|case):([A-Za-z0-9_.{}\[\]*]+)/g)) refs.push([m[0].replace(/\.$/, ''), owner]);
};
for (const it of rubric.items) walk(it, it.id);
walk(rubric.scope, 'scope');
const unresolved = [];
for (const [ref, owner] of refs) {
  const ids = ref.includes('{id}') ? (owner === 'quantify' || /reference_|_reference|equivalent/.test(ref) ? judgedP02 : P02_IDS) : [null];
  for (const id of ids) {
    const r = id ? ref.replaceAll('{id}', id) : ref;
    if (/(_equivalent_dB|reference_eq_dB)$/.test(r) && id && !PR.tolerance.judged[id]?.includes('equivalent')) continue;
    if (resolve(r) === undefined) unresolved.push(r);
  }
}
check('R6', `rubric 引用路径全部可解析（${refs.length} 条，含 {id} 展开）`, unresolved.length === 0, unresolved.join(', '));

// R7 no copied tolerances / reference values in the rubric
const numbers = [];
const numWalk = (o, path) => {
  if (Array.isArray(o)) return o.forEach((x, i) => numWalk(x, `${path}[${i}]`));
  if (o && typeof o === 'object') return Object.entries(o).forEach(([k, v]) => { if (path === 'teacher_config' || k === 'teacher_config') return; numWalk(v, path ? `${path}.${k}` : k); });
  if (typeof o === 'number' && !/(^|\.)(points|max_total)$/.test(path)) numbers.push(path);
};
numWalk(rubric, '');
check('R7', 'rubric 不复制容差 / 参考值：数值只出现在 points、max_total、teacher_config', numbers.length === 0, numbers.join(', '));

// R8 scoring data exist for P-02
const judgedOk = judgedP02.length === 3 && ['LAM_02', 'INC_02', 'CLU_01'].every((id) => judgedP02.includes(id));
const refMm = judgedP02.every((id) => PR.acceptance_values[`${id}_reference_mm`]);
const refEq = judgedP02.filter((id) => PR.tolerance.judged[id].includes('equivalent')).every((id) => typeof PR.acceptance_values[`${id}_equivalent_dB`] === 'number');
const areaOk = judgedP02.filter((id) => PR.tolerance.judged[id].includes('area')).every((id) => PR.tolerance.indicated_area_applies_to.includes(id));
const refItems = JSON.stringify(PR.grading.reference_items.map((r) => r.id).sort()) === JSON.stringify([...P02_IDS].sort());
const levels = files.standard.items.grading.levels;
const expOk = levels.every((L) => PR.grading.expected[L] && P02_IDS.every((id) => PR.grading.verdicts.includes(PR.grading.expected[L][id])) && typeof PR.grading.expected[L].pass === 'boolean') && !!PR.grading.expected.plate_grade;
const C = files.case;
const ctxOk = C.template_id === 'fixed_p02' && JSON.stringify(C.defects) === JSON.stringify(P02_IDS) && JSON.stringify(Object.keys(C.judged)) === JSON.stringify(judgedP02)
  && C.specimen_id === PR.step_presets.evaluate.specimen && JSON.stringify(C.expected) === JSON.stringify(PR.grading.expected)
  && judgedP02.every((id) => JSON.stringify(C.displays[id].reference_mm) === JSON.stringify(PR.acceptance_values[`${id}_reference_mm`]));
check('R8', 'P-02 评分数据齐全：judged = LAM_02 / INC_02 / CLU_01，参考尺寸与当量存在，面积项在 applies_to 内；grading.reference_items 与 expected 覆盖 5 处显示与各等级；case_default 上下文取自这些冻结数据', judgedOk && refMm && refEq && areaOk && refItems && expOk && ctxOk,
  `judged ${judgedP02.join('/')}, P-02 ${P02_IDS.join('/')}`);

// R9 DAC holes vs reference gains; calibration / sensitivity references
const dacKeys = Object.keys(PR.acceptance_values.dac_G_dB).map(Number).sort((a, b) => a - b);
const holesSorted = [...holeDepths].map(Number).sort((a, b) => a - b);
const calOk = PR.calibration.targets_mm.B1 && PR.calibration.targets_mm.B2 && PR.calibration.ui_tolerance_mm > PR.calibration.qa_tolerance_mm;
const sensOk = typeof PR.acceptance_values.G_base_dB === 'number' && typeof files.standard.items.scan_sensitivity.plus_dB === 'number'
  && Math.abs(PR.acceptance_values.G_scan_dB - PR.acceptance_values.G_base_dB - files.standard.items.scan_sensitivity.plus_dB) < 1e-6;
check('R9', 'DAC 孔深与参考增益键一致；校准目标 / 两级容差存在（ui > qa）；G_scan − G_base = plus_dB', JSON.stringify(dacKeys) === JSON.stringify(holesSorted) && calOk && sensOk,
  `holes ${holesSorted.join('/')}, dac_G_dB ${dacKeys.join('/')}`);

// R10 coverage inputs
const T = p02.dims.thickness.value;
const zone = files.standard.items.scan_pattern.edge_zone.find((z) => T >= z.t_mm[0] && (z.t_mm[1] == null || T < z.t_mm[1]));
const D = files.model_manifest.parameters.active_element_diameter.value;
check('R10', 'scan_path_coverage 输入可得：板厚查板边宽、晶片直径、方格边长', !!zone && D > 0 && PR.scan.flag_cell_mm > 0, `T ${T} mm → edge ${zone?.width_mm} mm, D ${D} mm, cell ${PR.scan.flag_cell_mm} mm`);

// E1 rubric evidence events exist in the contract
const evNames = new Set(contract.events.map((e) => e.name));
const evRefs = [...JSON.stringify(rubric).matchAll(/event:([a-z_]+:[a-z_]+)/g)].map((m) => m[1]);
const evMissing = [...new Set(evRefs)].filter((n) => !evNames.has(n));
check('E1', `rubric 证据事件全部在 events_contract 中（${new Set(evRefs).size} 种）`, evMissing.length === 0, evMissing.join(', '));

// E2 rubric evidence events are already live (M8 scoring uses existing events only)
const LIVE = (/const LIVE_EVENTS = new Set\(contract\.events\.filter\(\(e\) => \[([^\]]+)\]/.exec(main) || [])[1]?.match(/'([^']+)'/g)?.map((s) => s.slice(1, -1)) || [];
const liveNames = new Set(contract.events.filter((e) => LIVE.includes(e.milestone)).map((e) => e.name));
const msOf = (n) => contract.events.find((e) => e.name === n)?.milestone;
const evNotLive = [...new Set(evRefs)].filter((n) => !liveNames.has(n) && msOf(n) !== 'M8.1');
check('E2', 'rubric 证据事件均为已上线事件或 M8.1 登记事件（早于 M8.3 评分引擎）', LIVE.length > 0 && evNotLive.length === 0,
  evNotLive.join(', ') || [...new Set(evRefs)].filter((n) => !liveNames.has(n)).join(', '));

// E3 M8 events registered, dormant, no identity in payloads
const M8 = { 'practice:record_blocked': 'M8.1', 'session:start': 'M8.1', 'session:restore': 'M8.1', 'session:export': 'M8.1', 'coverage:view': 'M8.2', 'session:submit': 'M8.3', 'replay:load': 'M8.5', 'replay:seek': 'M8.5' };
const reg = Object.entries(M8).filter(([n, m]) => contract.events.find((e) => e.name === n)?.milestone !== m).map(([n]) => n);
const M8_LIVE = ['M8.1', 'M8.2', 'M8.3', 'M8.5'];
const staged = Object.entries(M8).every(([n, m]) => M8_LIVE.includes(m) === liveNames.has(n)) && !LIVE.some((m) => m.startsWith('M8') && !M8_LIVE.includes(m));
const ident = contract.events.filter((e) => /name|student|学号|姓名/i.test(Object.keys(e.payload || {}).join(','))).map((e) => e.name);
const quiz = contract.events.find((e) => e.name === 'quiz:answer')?.milestone === 'M8';
check('E3', 'M8 事件已登记（阶段 M8.1–M8.5）；M8.1–M8.3 / M8.5 进入 LIVE_EVENTS，M8.4 报告无独立事件；载荷不含姓名 / 学号；quiz:answer 仍为 M8', reg.length === 0 && staged && ident.length === 0 && quiz, [...reg, ...ident].join(', '));

// E4 restore event carries the fields the scope requires
const restore = contract.events.find((e) => e.name === 'session:restore');
check('E4', 'session:restore 载荷 {mode, session_id, gap_s}', restore && ['mode', 'session_id', 'gap_s'].every((k) => k in restore.payload));

// K1 assessment labels cover rubric items, statuses, chain steps
const itemLabels = rubric.items.every((it) => asmt.rubric.items[it.id]);
const statusLabels = rubric.basis_rule.statuses.every((s) => asmt.rubric.status[s]);
const stepLabels = ['assembly', ...files.practice_doc.steps.map((s) => s.id)].every((s) => asmt.steps[s]);
check('K1', 'assessment.json：评分项 / 状态 / 步骤短标签齐全（含「依据无效」「扫查轨迹覆盖率」）', itemLabels && statusLabels && stepLabels && asmt.rubric.status.basis_invalid === '依据无效' && asmt.coverage.title === '扫查轨迹覆盖率');

// K2 visible labels carry no explanatory phrases (qa_m6 T5 / T6 list) and no sound-field wording
const banned = ['建议', '本地', '面向', '教学说明', '模型说明', '注：', '说明：', '为了', '我们', '声场', '声束覆盖', '形成性', '阶段性'];
const vis = JSON.stringify(asmt);
check('K2', 'assessment.json 可见文字无说明性短语、无「声场 / 声束覆盖」「形成性 / 阶段性」', !banned.some((b) => vis.includes(b)), banned.filter((b) => vis.includes(b)).join(', '));

// K3 naming: scan_path_coverage only
const scopeDoc = readFileSync(join(proj, 'docs', 'M8_SCOPE.md'), 'utf8');
const naming = JSON.stringify(rubric).includes('metric:scan_path_coverage') && !/"metric:coverage/.test(JSON.stringify(rubric)) && scopeDoc.includes('scan_path_coverage');
check('K3', '覆盖率指标命名为 scan_path_coverage / 扫查轨迹覆盖率', naming);

// K4 V4 routes the frozen rubric through the detection adapter; scoring.js remains the numeric engine.
const scoringPath = join(proj, 'webapp', 'src', 'scoring.js');
const scoringSrc = existsSync(scoringPath) ? readFileSync(scoringPath, 'utf8') : '';
const detectionSrc = readFileSync(join(proj, 'webapp', 'src', 'v4-training.js'), 'utf8');
const { createDetectionScoring } = await import(new URL('../src/v4-training.js', import.meta.url));
const rubricBefore = JSON.stringify(rubric);
const detectionRubric = createDetectionScoring({ rubric, files }).rubric();
const detectionIds = ['scan', 'detect', 'quantify', 'evaluate', 'conduct'];
const detectionOnly = detectionRubric.max_total === 100
  && detectionRubric.items.reduce((n, it) => n + it.points, 0) === 100
  && JSON.stringify(detectionRubric.items.map((it) => it.id)) === JSON.stringify(detectionIds)
  && detectionRubric.items.every((it) => (it.requires || []).every((id) => detectionIds.includes(id)))
  && JSON.stringify(rubric) === rubricBefore;
const staged4 = /assessment\.json/.test(main) && !/rubricDoc\.(items|chain|basis_rule|scope)/.test(main)
  && [...main.matchAll(/rubricDoc\.([a-z_]+)/g)].every((m) => m[1] === 'teacher_config' || m[1] === 'rubric_version')
  && /createDetectionScoring\(\{\s*rubric: rubricDoc/.test(main)
  && /createScoring\(\{\s*rubric: derived, files\s*\}\)/.test(detectionSrc)
  && /rubric\.items/.test(scoringSrc) && /rubric\.chain/.test(scoringSrc) && /teacher_config/.test(scoringSrc)
  && detectionOnly;
check('K4', 'V4 检测评分经适配器交给原 scoring.js 数值引擎；main 不读取评分项 / 前置链；仅保留扫查、检出、定量、评价、规范五项共 100 分且不改封存量规', staged4);

for (const r of results) console.log(`${r.status}  ${r.id}  ${r.desc}${r.detail ? `  [${r.detail}]` : ''}`);
const pass = results.filter((r) => r.status === 'PASS').length;
console.log(`\nm80_check: ${pass}/${results.length} ${pass === results.length ? 'PASS' : 'FAIL'}`);
process.exit(pass === results.length ? 0 : 1);
