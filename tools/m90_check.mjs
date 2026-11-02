// M9.0 checks (docs/M9_SCOPE.md): cases.json structure, reference resolution, generation limits and margins, P-02 against the margins, event contract, labels, staging.
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const proj = join(here, '..', '..');
const readJson = (p) => JSON.parse(readFileSync(join(proj, p), 'utf8'));

const cases = readJson('contracts/cases.json');
const files = {
  waveform_rules: readJson('contracts/waveform_rules.json'),
  standard: readJson('contracts/standard_nbt47013_3.json'),
  specimens_manifest: readJson('contracts/specimens_manifest.json'),
  model_manifest: readJson('contracts/model_manifest.json'),
};
const contract = readJson('contracts/events_contract.json');
const asmt = readJson('knowledge/assessment.json');
const srcDir = join(proj, 'webapp', 'src');
const src = Object.fromEntries(readdirSync(srcDir).filter((f) => f.endsWith('.js')).map((f) => [f, readFileSync(join(srcDir, f), 'utf8')]));
const main = src['main.js'];

const results = [];
const check = (id, desc, ok, detail = '') => results.push({ id, desc, status: ok ? 'PASS' : 'FAIL', detail });

const PR = files.waveform_rules.practice;
const AV = PR.acceptance_values;
const STD = files.standard.items;
const SM = files.specimens_manifest;
const p02 = SM.runtime_specimens.specimen__plate_p02;
const exemplars = Object.fromEntries(p02.defects.map((d) => [d.id, d]));
const T = cases.templates;
const tplById = Object.fromEntries(T.map((t) => [t.id, t]));
const typeKeys = Object.keys(cases.types).filter((k) => cases.types[k]?.exemplar_id);

function resolve(path) {
  const i = path.indexOf(':');
  let v = files[path.slice(0, i)];
  if (v === undefined) return undefined;
  for (const seg of path.slice(i + 1).split('.')) {
    if (v == null) return undefined;
    const m = /^(.+)\[\*\]$/.exec(seg);
    if (m) { v = v[m[1]]; if (!Array.isArray(v)) return undefined; continue; }
    v = Array.isArray(v) ? v.map((x) => x?.[seg]) : v[seg];
  }
  return v;
}
const getPath = (o, p) => p.split('.').reduce((v, k) => (v == null ? undefined : v[k]), o);

// C1 versions, staging fields, disturbances reserved
const distEmpty = T.every((t) => Array.isArray(t.disturbances) && t.disturbances.length === 0) && /reserved/.test(cases.disturbances?.status || '');
check('C1', 'cases.json：schema_version / cases_version / milestone M9.0 起；PRNG mulberry32；各模板 disturbances 为空、扰动字段预留', !!cases.schema_version && !!cases.cases_version && /^M9\.[0-6]$/.test(cases.milestone) && cases.prng?.name === 'mulberry32' && distEmpty,
  `${cases.cases_version}, templates ${T.map((t) => t.id).join('/')}`);

// C2 templates
const idsOk = JSON.stringify(T.map((t) => t.id)) === JSON.stringify(['fixed_p02', 'basic', 'standard', 'clean']) && T.every((t, i) => t.index === i);
const fx = tplById.fixed_p02;
const fixedOk = fx.fixed === true && fx.per_student === false && SM.runtime_specimens[fx.specimen_id] && fx.defect_set_id === p02.defect_set_id;
const sideOf = (k) => cases.types[k].criteria_side;
const tplBad = T.filter((t) => !t.fixed).filter((t) => {
  const [a, b] = t.displays;
  const [c, d] = t.determined;
  const [e, f] = t.not_determined || [];
  const canDet = t.pool.some((k) => ['determined', 'either'].includes(sideOf(k)));
  const canNot = t.pool.some((k) => ['not_determined', 'either'].includes(sideOf(k)));
  return !(a >= 1 && a <= b && c >= 0 && c <= d && e >= 0 && e <= f && a === c + e && b === d + f)
    || !t.pool.every((k) => typeKeys.includes(k))
    || (d > 0 && !canDet) || (f > 0 && !canNot)
    || !(t.clean_ratio >= 0 && t.clean_ratio < 1) || typeof t.per_student !== 'boolean';
}).map((t) => t.id);
const cl = tplById.clean;
const cleanOk = cl && cl.determined[0] === 0 && cl.determined[1] === 0 && cl.clean_ratio === 0 && cl.pool.every((k) => ['not_determined', 'either'].includes(sideOf(k)));
const mixOk = T.filter((t) => t.clean_ratio > 0).every((t) => t.per_student) && !!cl;
check('C2', '模板 fixed_p02 / basic / standard / clean：P-02 固定且缺陷集 P02-A；随机模板数量 / 判据确定数区间自洽、类型池可满足两侧；无缺陷模板不含只会判据确定的类型；混入比例只用于每生模板',
  idsOk && fixedOk && tplBad.length === 0 && cleanOk && mixOk, tplBad.join(', ') || `basic ${tplById.basic.displays}/${tplById.basic.determined}, standard ${tplById.standard.displays}/${tplById.standard.determined}, clean ratio ${tplById.standard.clean_ratio}`);

// C3 every file reference resolves
const refs = [];
const walk = (o) => {
  if (Array.isArray(o)) return o.forEach(walk);
  if (o && typeof o === 'object') return Object.values(o).forEach(walk);
  if (typeof o === 'string') for (const m of o.matchAll(/(?<![a-z_:])(waveform_rules|standard|specimens_manifest|model_manifest):([A-Za-z0-9_.\[\]*]+)/g)) refs.push(m[0].replace(/\.+$/, ''));
};
walk(cases);
const unresolved = [...new Set(refs)].filter((r) => resolve(r) === undefined);
check('C3', `cases.json 引用路径全部可解析（${new Set(refs).size} 条）`, refs.length > 0 && unresolved.length === 0, unresolved.join(', '));

// C4 type pool: exemplar of the same type in P-02, inherited fields exist, vertical crack excluded
const typeBad = typeKeys.filter((k) => {
  const t = cases.types[k];
  const ex = exemplars[t.exemplar_id];
  return !ex || ex.type !== k || !t.inherits.every((p) => getPath(ex, p) !== undefined) || resolve(t.response) === undefined
    || !['determined', 'not_determined', 'either'].includes(t.criteria_side);
});
const exList = resolve(cases.types.exemplars_from) || [];
const vcrOut = !!cases.types.excluded?.vertical_crack && !T.some((t) => (t.pool || []).includes('vertical_crack'));
check('C4', '显示类型池：每类有 P-02 同类型样例、继承字段存在、响应模型可解析；垂直裂纹不入池', typeBad.length === 0 && typeKeys.every((k) => exList.includes(cases.types[k].exemplar_id)) && vcrOut,
  typeBad.join(', ') || typeKeys.map((k) => `${k}←${cases.types[k].exemplar_id}`).join(', '));

// C5 depth limits from the DAC holes; ranges well formed
const depths = resolve(cases.limits.depth_from).map(Number);
const [dMin, dMax] = [Math.min(...depths), Math.max(...depths)];
const dacKeys = Object.keys(AV.dac_G_dB).map(Number);
const rangeBad = [];
for (const k of typeKeys) for (const [f, v] of Object.entries(cases.types[k])) {
  if (!/_range$|^members$/.test(f)) continue;
  if (!(Array.isArray(v) && v.length === 2 && v.every(Number.isFinite) && v[0] < v[1])) rangeBad.push(`${k}.${f}`);
}
const seg = exemplars[cases.types.segregation.exemplar_id];
const segBand = seg.depth_range_mm[1] - seg.depth_range_mm[0];
const spread = cases.types.cluster.member_depth_spread_range[1];
check('C5', '深度限在 DAC 孔深范围内（与 dac_G_dB 键一致）；各生成区间格式正确、下限 < 上限；偏析带宽与密集区深度展布放得进深度范围',
  dMin < dMax && JSON.stringify([...dacKeys].sort((a, b) => a - b)) === JSON.stringify([...depths].sort((a, b) => a - b)) && rangeBad.length === 0 && segBand < dMax - dMin && spread < dMax - dMin,
  rangeBad.join(', ') || `depth ${dMin}–${dMax} mm, band ${segBand} mm, cluster spread ≤ ${spread} mm`);

// C6 reachable area from probe limits fits the generation sizes
const hous = files.model_manifest.parameters.housing_outer_diameter.value;
const limX = p02.dims.length.value / 2 - hous / 2;
const limY = p02.dims.width.value / 2 - hous / 2;
const tt = cases.types;
const fits = tt.lamination.size_x_range[1] < 2 * limX && tt.lamination.size_y_range[1] < 2 * limY
  && tt.segregation.length_x_range[1] <= 2 * limX && tt.segregation.half_width_y_range[1] < limY
  && tt.cluster.member_spacing_range[1] * 2 < 2 * limY;
check('C6', '探头可达范围（|X| ≤ L/2 − 外壳半径，|Y| ≤ W/2 − 外壳半径）容得下各类最大尺寸', /L\/2 - 11/.test(resolve(cases.limits.area_from)) && fits, `|X| ≤ ${limX}, |Y| ≤ ${limY} mm`);

// C7 margins: references resolve to numbers; mark window non-empty; estimated F1 - DAC ranges sit on the required side
const m = cases.margins;
const cm = m.criteria_dB;
const floor = resolve(m.mark_from);
const eqTol = resolve(m.grading_D_from);
const sRel = resolve(m.grading_S_from);
const offset = (ex, plus, dB) => dB - plus;
const est = {
  inclusion: tt.inclusion.plus_dB_range.map((p) => p + offset(exemplars.INC_02, exemplars.INC_02.equivalent.plus_dB, AV.INC_02_equivalent_dB)),
  pore: tt.pore.plus_dB_range.map((p) => p + offset(exemplars.POR_01, exemplars.POR_01.equivalent.plus_dB, AV.POR_01_f1_minus_dac_dB)),
  cluster: tt.cluster.member_plus_dB_range.map((p) => p + offset(exemplars.CLU_01, Math.max(...exemplars.CLU_01.members.map((x) => x.plus_dB)), AV.CLU_01_equivalent_dB)),
};
const r1 = (v) => Math.round(v * 10) / 10;
const sideOk = est.inclusion[0] >= cm && est.cluster[0] >= cm && est.pore[0] >= floor + cm && est.pore[0] <= -cm && est.pore[1] >= cm;
check('C7', '裕量：判据裕量 > 0；标记下限窗非空；D / S 裕量引用当量与面积容差；按 P-02 样例换算的 F1 − DAC 区间：夹杂 / 密集区全在判据确定侧，点状显示跨 DAC 两侧且不低于标记下限',
  cm > 0 && Number.isFinite(floor) && floor + cm < -cm && eqTol > 0 && sRel > 0 && sRel < 1 && sideOk,
  `criteria ${cm} dB, mark floor ${floor} dB, D ± ${eqTol} dB, S ± ${sRel}; est F1−DAC inclusion ${est.inclusion.map(r1)}, pore ${est.pore.map(r1)}, cluster ${est.cluster.map(r1)} (exact values from caselib in M9.1)`);

// C8 no copied standard data or tolerances: numbers only under generation / code / margin keys
const numbers = [];
const numWalk = (o, path) => {
  if (Array.isArray(o)) return o.forEach((x, i) => numWalk(x, `${path}[${i}]`));
  if (o && typeof o === 'object') return Object.entries(o).forEach(([k, v]) => numWalk(v, path ? `${path}.${k}` : k));
  if (typeof o === 'number') numbers.push(path);
};
numWalk(cases, '');
const allowed = /(_range\[\d\]|\.members\[\d\]|\.displays\[\d\]|\.determined\[\d\]|\.not_determined\[\d\]|\.index|\.clean_ratio|prng\.seed_bits|prng\.max_attempts|case_code\.(payload|check)_chars|margins\.criteria_dB|library\.cases\[\d+\]\.seed)$/;
const stray = numbers.filter((p) => !allowed.test(p));
check('C8', 'cases.json 不复制标准数据与容差：数值只出现在生成区间、数量、索引、混入比例、PRNG / 案例码参数、判据裕量', stray.length === 0, stray.join(', ') || `${numbers.length} numbers`);

// C9 case code capacity and alphabet
const cc = cases.case_code;
const alpha = cc.alphabet;
const base = alpha.length;
const cap = base ** cc.payload_chars;
const need = (Math.max(...T.map((t) => t.index), cases.library?.index ?? 0) + 1) * 2 ** cases.prng.seed_bits;
check('C9', '案例码：31 个不重复字符、排除 0 / O / 1 / I / L；5 位载荷容纳 模板数 × 2^seed_bits；1 位校验',
  new Set(alpha).size === base && base === 31 && !/[01OIL]/.test(alpha) && cap >= need && cc.check_chars === 1 && /no_code|fixed_p02/.test(cc.no_code),
  `31^${cc.payload_chars} = ${cap} ≥ ${T.length} × 2^${cases.prng.seed_bits} = ${need}; max templates ${Math.floor(cap / 2 ** cases.prng.seed_bits)}`);

// C10 the approved P-02 passes the margins and its expected matrix follows from procedure.grade
const { createProcedure } = await import(new URL('../src/procedure.js', import.meta.url));
const pr = createProcedure({ rules: files.waveform_rules, wave: null, specimens: SM, standard: files.standard });
const items = PR.grading.reference_items;
const GS = STD.grading;
const f1Of = { LAM_02: AV.LAM_02_F1_full_minus_dac_dB, INC_02: AV.INC_02_equivalent_dB, CLU_01: AV.CLU_01_equivalent_dB, POR_01: AV.POR_01_f1_minus_dac_dB, SEG_01: AV.SEG_01_f1_minus_dac_max_dB };
const fail = [];
for (const it of items) {
  const f = f1Of[it.id];
  if (it.determined ? !(f >= cm) : !(f <= -cm && f >= floor + cm)) fail.push(`${it.id} F1−DAC ${f}`);
  if (!it.determined) continue;
  for (const lv of GS.levels) {
    const L = GS.table[lv];
    const useD = GS.single_element_uses_D && L.max_D_dB != null && !(GS.b1_defects_use_S && it.flags.includes('B1_below_50'));
    const v = useD ? it.D_dB : it.S_mm2;
    const bounds = useD ? [L.count_D_dB[0], L.max_D_dB] : [L.count_S_mm2[0], L.max_S_mm2];
    for (const b of bounds) {
      const bad = useD ? Math.abs(v - b) < eqTol : v > b / (1 + sRel) && v < b / (1 - sRel);
      if (bad) fail.push(`${it.id} ${lv} ${useD ? 'D' : 'S'} ${v} near ${b}`);
    }
  }
}
const b1Seg = 20 * Math.log10(AV.SEG_01_B1_min_at_G_base_percent / STD.defect_criteria.b1_limit_percent);
if (!(b1Seg >= cm)) fail.push(`SEG_01 B1 ${r1(b1Seg)} dB`);
const gradeOk = GS.levels.every((lv) => {
  const g = pr.grade(lv, items);
  return items.every((it) => g.verdicts[it.id] === PR.grading.expected[lv][it.id]) && g.pass === PR.grading.expected[lv].pass;
}) && pr.plateGrade(items) === PR.grading.expected.plate_grade;
check('C10', '已审定的 P-02 满足本稿裕量（判据、标记下限、各级别 D / S 边界、偏析 B1）；grading.expected 与 procedure.grade / plateGrade 对 reference_items 的结果一致（M9.1 金样的判定部分）',
  fail.length === 0 && gradeOk, fail.join(', ') || `plate grade ${pr.plateGrade(items)}`);

// E1 M9 events registered, dormant, no identity
const LIVE = (/const LIVE_EVENTS = new Set\(contract\.events\.filter\(\(e\) => \[([^\]]+)\]/.exec(main) || [])[1]?.match(/'([^']+)'/g)?.map((s) => s.slice(1, -1)) || [];
const M9 = { 'case:load': 'M9.2', 'practice:false_call': 'M9.3' };
const reg = Object.entries(M9).filter(([n, ms]) => contract.events.find((e) => e.name === n)?.milestone !== ms).map(([n]) => n);
const msNum = (ms) => Number(ms.slice(1));
const staged = LIVE.length > 0 && LIVE.filter((x) => x.startsWith('M9')).every((x) => msNum(x) <= msNum(cases.milestone))
  && Object.values(M9).every((ms) => LIVE.includes(ms) === (msNum(ms) <= msNum(cases.milestone)));
const ident = contract.events.filter((e) => /name|student|学号|姓名/i.test(Object.keys(e.payload || {}).join(','))).map((e) => e.name);
const tplEnum = contract.events.find((e) => e.name === 'case:load')?.payload?.template_id === T.map((t) => t.id).join('|');
check('E1', 'M9 事件已登记（case:load M9.2、practice:false_call M9.3），按 cases.json milestone 分阶段进入 LIVE_EVENTS；载荷不含姓名 / 学号；template_id 枚举与模板一致', reg.length === 0 && staged && ident.length === 0 && tplEnum, [...reg, ...ident].join(', ') || `LIVE ${LIVE.join('/')}`);

// E2 session reserves random_seed
check('E2', '会话已预留 random_seed（M8 为 null，M9 写入种子）', /random_seed:\s*null/.test(src['session.js'] || ''));

// K1 labels
const banned = ['建议', '本地', '面向', '教学说明', '模型说明', '注：', '说明：', '为了', '我们', '形成性', '阶段性', '非缺陷', '不是缺陷', '不判'];
const vis = JSON.stringify(asmt.case || {});
const labOk = asmt.case && T.every((t) => asmt.case.templates?.[t.id]) && typeKeys.every((k) => asmt.case.types?.[k]) && ['code', 'code_invalid', 'random_plate', 'reference', 'false_call'].every((k) => asmt.case[k]);
check('K1', 'assessment.json case：模板 / 类型 / 案例码等短标签齐全；无说明性短语，类型名不含判定结论', labOk && !banned.some((b) => vis.includes(b)), banned.filter((b) => vis.includes(b)).join(', '));

// K2 V4 allows only main.js and its existing-library adapter to consume the case library.
const wired = Object.entries(src).filter(([f, s]) => f !== 'caselib.js' && /cases\.json|caselib|specimen__plate_case/.test(s)).map(([f]) => f);
const detectionSrc = src['v4-training.js'] || '';
const existingOnly = /caselib\.library\(\)/.test(detectionSrc)
  && /caselib\.libraryCase\(selection\.id\)/.test(detectionSrc)
  && !/\.generate\(|\.fromCode\(|createCaselib\(|import[^\n]*caselib/.test(detectionSrc);
const wiredOk = msNum(cases.milestone) < 9.2 ? wired.length === 0
  : wired.slice().sort().join() === 'main.js,v4-training.js' && /import casesDoc from '\.\.\/\.\.\/contracts\/cases\.json'/.test(main) && /import \{ createCaselib \} from '\.\/caselib\.js'/.test(main)
    && !/specimen__plate_case/.test(main) && existingOnly;
check('K2', 'V4 案例接入仅 main 与既有库抽取适配器：板 ID 取自 cases.json，无试块 ID 冲突；适配器只读取 library / libraryCase，不重新生成或解码', wiredOk && !SM.specimens[cases.plate.specimen_id] && !SM.runtime_specimens[cases.plate.specimen_id], wired.join(', ') || cases.milestone);

// K3 wording: no "pore is not a defect" in contracts, knowledge or the M9 scope
const texts = {
  'contracts/specimens_manifest.json': JSON.stringify(SM),
  'contracts/cases.json': JSON.stringify(cases),
  'knowledge/practice.json': readFileSync(join(proj, 'knowledge', 'practice.json'), 'utf8'),
  'knowledge/assessment.json': JSON.stringify(asmt),
};
const scope9 = readFileSync(join(proj, 'docs', 'M9_SCOPE.md'), 'utf8').split('\n').filter((l) => !/不得在|不得表述|红线|显示类型名不隐含/.test(l) && !/^\| F\d/.test(l)).join('\n');
const wrong = /not a defect|气孔不是缺陷|气孔不判|不判为缺陷|非缺陷/;
const hits = [...Object.entries(texts).filter(([, s]) => wrong.test(s)).map(([f]) => f), ...(wrong.test(scope9) ? ['docs/M9_SCOPE.md'] : [])];
check('K3', '表述：契约、知识库与 M9 规划不把点状显示写成「不是缺陷 / 不判」（判据确定与否只来自计算）', hits.length === 0, hits.join(', '));

// K4 retain the historical code contract while the V4 start page draws an existing case without a code input.
const normalizedMain = main.replace(/\r\n/g, '\n');
const fnBody = (name) => { const i = normalizedMain.indexOf(`function ${name}(`); return i < 0 ? '' : normalizedMain.slice(i, normalizedMain.indexOf('\n}\n', i) + 3); };
const startExamSrc = fnBody('startExam'), examPageSrc = fnBody('renderExamBench'), teacherSrc = fnBody('teacherZone');
const examInputs = [...examPageSrc.matchAll(/<input\b[^>]*\bname="([^"]+)"/g)].map((m) => m[1]);
const examKeys = ['start', 'plate', 'event', 'header', 'report', 'contexts', 'teacher'];
const examOk = msNum(cases.milestone) < 9.4 ? !cases.exam
  : examKeys.every((k) => typeof cases.exam?.[k] === 'string') && ['exam_plate', 'teacher', 'generate', 'preview', 'student_no', 'code_invalid'].every((k) => asmt.case?.[k])
    && /function startExam\(name = '', no = ''\)/.test(startExamSrc)
    && /drawLibraryCase\(\{ caselib: caseLib\(\), thickness: thickness\(\) \}\)/.test(startExamSrc)
    && /store\.begin\('exam', sessionInit\(student\)\)/.test(startExamSrc) && /source: 'exam'/.test(startExamSrc)
    && !/fromCode|examCaseOf|\.generate\(/.test(startExamSrc)
    && examInputs.length === 0 && /startExam\(st\.name, st\.student_no\)/.test(examPageSrc)
    && /teacherAccess\(\)/.test(teacherSrc) && /libraryCase\(S\.teacher\.selectedId\)/.test(teacherSrc)
    && /route: 'fullscan'/.test(teacherSrc) && !/\.generate\(|\.fromCode\(|\.encode\(/.test(teacherSrc)
    && /encode: \(templateId, codeSeed\)/.test(src['caselib.js']);
check('K4', 'V4 检测开考只接收可选姓名 / 学号并随机抽取已有案例，无案例码；教师通过已授权入口选已有案例讲解完整流程；原 exam 与编码契约继续封存', examOk, cases.milestone);

// K5 fixed case library: from M9.6 numbered cases of random templates, unique template + seed, mask fits the seed bits, own code index, labels and page wiring
const LB = cases.library;
const randomIds = T.filter((t) => !t.fixed).map((t) => t.id);
const libOk = msNum(cases.milestone) < 9.6 ? !LB
  : !!LB && LB.id && !T.some((t) => t.index === LB.index || t.id === LB.id) && LB.cases.length > 0 && LB.cases.length <= cases.prng.seed_bits
    && LB.cases.every((c, i) => c.id === String(i + 1).padStart(2, '0') && randomIds.includes(c.template) && Number.isInteger(c.seed) && c.seed >= 0 && c.seed < 2 ** cases.prng.seed_bits)
    && new Set(LB.cases.map((c) => `${c.template}:${c.seed}`)).size === LB.cases.length
    && ['library', 'case_no', 'displays', 'select_all', 'clear', 'make_code', 'selected'].every((k) => asmt.case?.[k])
    && /function openLibrary\(\)/.test(main) && /encodeLibrary/.test(src['caselib.js']);
check('K5', '固定案例库：M9.6 起编号案例（01 起连续）取自随机模板、模板 + 种子唯一、案例数不超过种子位数（掩码可编码）、独立模板序号；案例库短标签与页面接线齐备', libOk,
  LB ? `${LB.cases.length} cases, index ${LB.index}, ${randomIds.map((t) => `${t} ${LB.cases.filter((c) => c.template === t).length}`).join(' / ')}` : cases.milestone);

for (const r of results) console.log(`${r.status}  ${r.id}  ${r.desc}${r.detail ? `  [${r.detail}]` : ''}`);
const pass = results.filter((r) => r.status === 'PASS').length;
console.log(`\nm90_check: ${pass}/${results.length} ${pass === results.length ? 'PASS' : 'FAIL'}`);
process.exit(pass === results.length ? 0 : 1);
