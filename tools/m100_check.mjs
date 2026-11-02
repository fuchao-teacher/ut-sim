// M10.0 checks (docs/M10_SCOPE.md): tasks.json structure, reference resolution, task list mix, card fields against the standard, kit validity, mark visibility threshold, rubric totals, events, labels, staging.
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const proj = join(here, '..', '..');
const readJson = (p) => JSON.parse(readFileSync(join(proj, p), 'utf8'));

const tasks = readJson('contracts/tasks.json');
const files = {
  waveform_rules: readJson('contracts/waveform_rules.json'),
  standard: readJson('contracts/standard_nbt47013_3.json'),
  specimens_manifest: readJson('contracts/specimens_manifest.json'),
  model_manifest: readJson('contracts/model_manifest.json'),
  cases: readJson('contracts/cases.json'),
  rubric: readJson('contracts/rubric.json'),
  thickness: readJson('contracts/thickness.json'),
};
const contract = readJson('contracts/events_contract.json');
const tk = readJson('knowledge/task.json');
const prk = readJson('knowledge/practice.json');
const srcDir = join(proj, 'webapp', 'src');
const src = Object.fromEntries(readdirSync(srcDir).filter((f) => f.endsWith('.js')).map((f) => [f, readFileSync(join(srcDir, f), 'utf8')]));
const main = src['main.js'];

const results = [];
const check = (id, desc, ok, detail = '') => results.push({ id, desc, status: ok ? 'PASS' : 'FAIL', detail });

const PR = files.waveform_rules.practice;
const STD = files.standard.items;
const CASES = files.cases;
const msNum = (ms) => Number(ms.slice(1));

function resolve(path) {
  const i = path.indexOf(':');
  let v = files[path.slice(0, i)];
  if (v === undefined) return undefined;
  for (const seg of path.slice(i + 1).split('.')) {
    if (v == null) return undefined;
    const m = /^(.+)\[\*\]$/.exec(seg);
    if (m) { v = v[m[1]]; if (!Array.isArray(v)) return undefined; continue; }
    if (Array.isArray(v)) {
      const byId = v.find((x) => x?.id === seg);
      v = byId ?? v.map((x) => x?.[seg]);
      if (!byId && v.every((x) => x === undefined)) return undefined;
    } else v = v[seg];
  }
  return v;
}

// T1 versions and staging fields
check('T1', 'tasks.json：schema_version / tasks_version / milestone M10.x；会话 mode task，日志头含 task_id 与卡', !!tasks.schema_version && !!tasks.tasks_version && /^M10\.\d$/.test(tasks.milestone)
  && tasks.session?.mode === 'task' && ['task_id', 'card', 'thickness_mm'].every((k) => tasks.session.header.includes(k)), `${tasks.tasks_version}, ${tasks.milestone}`);

// T2 file references resolve; task: / card: references name existing keys
const refs = [];
const local = [];
const walk = (o) => {
  if (Array.isArray(o)) return o.forEach(walk);
  if (o && typeof o === 'object') return Object.values(o).forEach(walk);
  if (typeof o !== 'string') return;
  for (const m of o.matchAll(/(?<![a-z_:])(waveform_rules|standard|specimens_manifest|model_manifest|cases|rubric|thickness):([A-Za-z0-9_.\[\]*]+)/g)) refs.push(m[0].replace(/\.+$/, ''));
  for (const m of o.matchAll(/(?<![a-z_])(task|card):([a-z_A-Z]+)/g)) local.push(m[0]);
};
walk(tasks);
const unresolved = [...new Set(refs)].filter((r) => resolve(r) === undefined);
const fieldIds = tasks.card.fields.map((f) => f.id);
const eventNames = contract.events.map((e) => e.name);
const badLocal = [...new Set(local)].filter((r) => !eventNames.includes(r)).filter((r) => (r.startsWith('card:') ? !fieldIds.includes(r.slice(5)) : !['task_id', 'case', 'level', 'thickness_mm', 'thickness'].includes(r.slice(5))));
check('T2', `tasks.json 引用全部可解析（文件引用 ${new Set(refs).size} 条，task: / card: ${new Set(local).size} 条）`, refs.length > 0 && unresolved.length === 0 && badLocal.length === 0, [...unresolved, ...badLocal].join(', '));

// T3 task list: consecutive ids, library cases, levels; mix of levels, conclusions, templates and clean plates
const { createWaveform } = await import(new URL('../src/waveform.js', import.meta.url));
const CL = await import(new URL('../src/caselib.js', import.meta.url));
const scenes = readJson('knowledge/scenes.json');
const insp = readJson('knowledge/inspection.json');
const makeWave = (specimens) => createWaveform({ rules: files.waveform_rules, manifest: files.model_manifest, dampingCycles: scenes.teaching_settings.lab.damping_cycles, scenarios: insp.scenarios, specimens });
const lib = CL.createCaselib({ cases: CASES, rules: files.waveform_rules, standard: files.standard, specimens: files.specimens_manifest, makeWave, scenario: insp.scenarios[0] });
const { createThickness } = await import(new URL('../src/thickness.js', import.meta.url));
const th = createThickness({ doc: files.thickness, cases: CASES, rules: files.waveform_rules, standard: files.standard, specimens: files.specimens_manifest, makeWave, scenario: insp.scenarios[0], createCaselib: CL.createCaselib });
const L = tasks.tasks.list;
const levels = resolve(tasks.tasks.levels_from);
const rows = L.map((t) => {
  const cs = t.case ? lib.libraryCase(t.case) : th.libraryCase(t.thickness);
  const thick = t.case ? 50 : th.entry(t.thickness)?.thickness_mm;
  return { ...t, cs, thick, pass: cs?.reference.expected[t.level]?.pass, tpl: cs?.template_id };
});
const listBad = rows.filter((r, i) => r.id !== `T${String(i + 1).padStart(2, '0')}` || !r.cs || !levels.includes(r.level) || typeof r.pass !== 'boolean' || !r.thick).map((r) => r.id);
const mix = levels.every((lv) => rows.some((r) => r.level === lv)) && rows.some((r) => r.pass) && rows.some((r) => !r.pass) && ['basic', 'standard', 'clean'].every((t) => rows.some((r) => r.tpl === t))
  && rows.some((r) => r.thick === 30) && rows.some((r) => r.thick === 80) && rows.filter((r) => r.thick === 50).length === 10;
check('T3', '任务清单：T01 起连续；50 mm 取自固定案例库，30 / 80 mm 取自 thickness 库；验收等级合法；覆盖四个验收等级、合格 / 不合格、基础 / 标准 / 无缺陷板、三种板厚',
  listBad.length === 0 && mix,
  listBad.join(', ') || rows.map((r) => `${r.id} ${r.thick}mm ${r.cs.library_id}/${r.level} ${r.pass ? '合格' : '不合格'}`).join(', '));

// T4 card reference engine against the standard for the plate thickness; the kit satisfies it at 30 / 50 / 80 mm
const rowOf = (list, t) => list.find((r) => t >= r.t_mm[0] && (r.t_mm[1] == null || t < r.t_mm[1]));
const tol = PR.sensitivity_record.tolerance_dB;
function cardRight(card, t, level) {
  const ps = rowOf(STD.probe_selection.rows, t);
  const rb = rowOf(STD.reference_block.rows, t);
  const ez = rowOf(STD.scan_pattern.edge_zone, t);
  const md = STD.scan_pattern.middle;
  const [e0, e1] = STD.probe_selection.element_mm.round_diameter;
  const max = card.middle_pattern === 'lines' ? md.line_spacing_max_mm : card.middle_pattern === 'grid' ? md.grid_mm : -1;
  return {
    probe_type: !!ps && (ps.probe === 'dual_or_single' ? ['dual', 'single'].includes(card.probe_type) : ps.probe === card.probe_type),
    frequency: !!ps && card.frequency_MHz >= ps.MHz[0] && card.frequency_MHz <= ps.MHz[1],
    element: card.element_mm >= e0 && card.element_mm <= e1,
    reference_block: !!rb && String(rb.no) === String(card.reference_block),
    edge_zone: !!ez && card.edge_zone_mm >= ez.width_mm,
    scan_plan: card.spacing_mm > 0 && card.spacing_mm <= max,
    scan_sensitivity: Math.abs(card.scan_plus_dB - STD.scan_sensitivity.plus_dB) <= tol,
    compensation: Math.abs(card.compensation_dB - STD.compensation.default_dB) <= tol,
    level: card.level === level,
  };
}
const T50 = resolve(tasks.plate.thickness_from);
const blockNo = (id) => STD.reference_block.rows.find((r) => id.endsWith(`_${r.no}`))?.no;
const K = tasks.card.kit;
const kitCard = (t) => ({ probe_type: K.probe_type, frequency_MHz: resolve(K.frequency_MHz), element_mm: resolve(K.element_mm), reference_block: rowOf(STD.reference_block.rows, t).no,
  edge_zone_mm: rowOf(STD.scan_pattern.edge_zone, t).width_mm, middle_pattern: 'lines', spacing_mm: STD.scan_pattern.middle.line_spacing_max_mm, scan_plus_dB: STD.scan_sensitivity.plus_dB, compensation_dB: STD.compensation.default_dB, level: 'II' });
const kitOk = [30, 50, 80].map((t) => [t, Object.entries(cardRight(kitCard(t), t, 'II')).filter(([, v]) => !v).map(([k]) => k)]);
const kitBlock = blockNo(resolve(K.reference_block));
const wrong50 = cardRight({ probe_type: 'dual', frequency_MHz: 1, element_mm: 35, reference_block: 1, edge_zone_mm: 40, middle_pattern: 'grid', spacing_mm: 120, scan_plus_dB: 2, compensation_dB: 4, level: 'I' }, T50, 'II');
const wrongOk = Object.entries(wrong50).filter(([k]) => k !== 'probe_type').every(([, v]) => !v) && wrong50.probe_type === true;
check('T4', `工艺卡核对：按板厚从标准表求参考（${T50} mm：双晶 / 单晶、频率 / 晶片区间、试块序号、边缘区下限、扫查间距上限、+${STD.scan_sensitivity.plus_dB} dB、补偿 ${STD.compensation.default_dB} dB）；现有器材在 30 / 50 / 80 mm 均符合；套错值逐栏判不符合（50 mm 双晶符合）`,
  T50 === 50 && kitOk.every(([, bad]) => bad.length === 0) && kitBlock === 2 && wrongOk, kitOk.map(([t, bad]) => `${t} mm ${bad.length ? bad.join('/') : 'ok'}`).join(', ') + `, kit block ${kitBlock}`);

// T5 card fields, select options, groups and the rubric agree
const groups = [...new Set(tasks.card.fields.map((f) => f.group))];
const cardItem = tasks.rubric.items.find((i) => i.id === 'card');
const partGroups = cardItem.parts.map((p) => p.group);
const sum = (a) => a.reduce((s, x) => s + x, 0);
const optsOk = tasks.card.fields.filter((f) => f.input === 'select').every((f) => {
  const opts = f.options || resolve(f.options_from);
  return Array.isArray(opts) && opts.length >= 2 && (f.id === 'level' || opts.every((o) => tk.options?.[f.id]?.[String(o)]));
}) && tasks.card.fields.every((f) => ['select', 'number'].includes(f.input));
const fromBad = tasks.rubric.items.filter((i) => i.from).filter((i) => resolve(i.from)?.id !== i.id).map((i) => i.id);
check('T5', '工艺卡栏：输入形式为下拉 / 数值，下拉选项来自标准或已列出且有短标签；评分组与量规一一对应；工艺卡 25、合计 100；沿用项指向 rubric.json 同名项',
  new Set(fieldIds).size === fieldIds.length && optsOk && JSON.stringify([...groups].sort()) === JSON.stringify([...partGroups].sort()) && cardItem.points === 25 && sum(cardItem.parts.map((p) => p.points)) === 25
    && sum(tasks.rubric.items.map((i) => i.points)) === tasks.rubric.max_total && tasks.rubric.max_total === 100 && fromBad.length === 0 && tasks.rubric.items.find((i) => i.id === 'evaluate').level === 'task:level',
  fromBad.join(', ') || tasks.rubric.items.map((i) => `${i.id} ${i.points}`).join(' / '));

// T6 no copied standard data or tolerances
const numbers = [];
const numWalk = (o, path) => {
  if (Array.isArray(o)) return o.forEach((x, i) => numWalk(x, `${path}[${i}]`));
  if (o && typeof o === 'object') return Object.entries(o).forEach(([k, v]) => numWalk(v, path ? `${path}.${k}` : k));
  if (typeof o === 'number') numbers.push(path);
};
numWalk(tasks, '');
const allowed = /(\.points|rubric\.max_total|drive\.mark_visible\.screen_percent|drive\.overlay\.max_lines)$/;
const stray = numbers.filter((p) => !allowed.test(p));
check('T6', 'tasks.json 不复制标准数据与容差：数值只出现在分值、「标记可见」屏高阈值与计划线绘制上限', stray.length === 0, stray.join(', ') || `${numbers.length} numbers`);

// T7 mark visibility threshold equals the existing mark floor at the deepest DAC point with the standard scan sensitivity; DAC gain rises with depth
const H = sum(PR.dac.record.height_window_percent) / 2;
const derived = H * 10 ** ((PR.mark.min_f1_minus_dac_dB + STD.scan_sensitivity.plus_dB) / 20);
const dac = Object.entries(PR.acceptance_values.dac_G_dB).map(([s, g]) => [Number(s), g]).sort((a, b) => a[0] - b[0]);
const rising = dac.every((p, i) => i === 0 || p[1] > dac[i - 1][1]);
check('T7', '「标记可见」阈值：按标准扫查灵敏度在 DAC 最深点与现行标记下限等效；DAC 增益随深度单调增加，故较浅处仍以现行下限为准（按正确工艺卡时标记行为与考核一致）',
  Math.abs(derived - tasks.drive.mark_visible.screen_percent) < 0.5 && rising && PR.base_sensitivity.gain_convention === 'deepest_point_80',
  `${H} % × 10^((${PR.mark.min_f1_minus_dac_dB} + ${STD.scan_sensitivity.plus_dB}) / 20) = ${derived.toFixed(2)} % → ${tasks.drive.mark_visible.screen_percent} %; DAC ${dac.map((p) => `${p[0]}:${p[1]}`).join(' ')}`);

// E1 events registered for M10.1, staged, no identity
const LIVE = (/const LIVE_EVENTS = new Set\(contract\.events\.filter\(\(e\) => \[([^\]]+)\]/.exec(main) || [])[1]?.match(/'([^']+)'/g)?.map((s) => s.slice(1, -1)) || [];
const M10 = { 'task:open': 'M10.1', 'task:card': 'M10.1' };
const reg = Object.entries(M10).filter(([n, ms]) => contract.events.find((e) => e.name === n)?.milestone !== ms).map(([n]) => n);
const staged = Object.values(M10).every((ms) => LIVE.includes(ms) === (msNum(ms) <= msNum(tasks.milestone)));
const ident = Object.keys(M10).filter((n) => /name|student|学号|姓名/i.test(Object.keys(contract.events.find((e) => e.name === n)?.payload || {}).join(',')));
check('E1', 'M10 事件已登记（task:open、task:card M10.1），按 tasks.json milestone 分阶段进入 LIVE_EVENTS；载荷不含姓名 / 学号', reg.length === 0 && staged && ident.length === 0, [...reg, ...ident].join(', ') || `LIVE has M10: ${LIVE.filter((x) => x.startsWith('M10')).join('/') || 'none'}`);

// K1 short labels stay concise; the explicit execution-model note is separate.
const banned = ['建议', '本地', '面向', '说明', '注：', '为了', '我们', '形成性', '阶段性', '非缺陷', '不是缺陷', '不判', '后果', '用于'];
const vis = JSON.stringify({ ...tk, execution_note: undefined });
const labOk = !!tk.tab && !!tk.brief && !!tk.card && tasks.brief.fields.every((f) => tk.brief_fields?.[f.id]) && fieldIds.every((id) => tk.card_fields?.[id])
  && ['work_piece', 'material'].every((k) => tk.values?.[k]) && levels.every((lv) => prk.levels?.[lv] || JSON.stringify(prk.levels || {}).includes(lv));
check('K1', 'knowledge/task.json：页签、工艺卡栏名、下拉选项及取值短标签齐全；执行模型边界说明单独保留', labOk && !!tk.execution_note && !banned.some((b) => vis.includes(b)), banned.filter((b) => vis.includes(b)).join(', '));

// K2 staging: before M10.1 the app does not read tasks.json / task.json; M9 contracts stay sealed at M9.6
const wired = Object.entries(src).filter(([, s]) => /tasks\.json|knowledge\/task\.json|S\.task\b/.test(s)).map(([f]) => f);
const wiredOk = msNum(tasks.milestone) < 10.1 ? wired.length === 0 : wired.includes('main.js');
check('K2', '分阶段接入：M10.1 前应用不引用 tasks.json / task.json；cases.json 保持 M9.6（封存）', wiredOk && CASES.milestone === 'M9.6', wired.join(', ') || `${tasks.milestone}, cases ${CASES.milestone}`);

for (const r of results) console.log(`${r.status}  ${r.id}  ${r.desc}${r.detail ? `  [${r.detail}]` : ''}`);
const pass = results.filter((r) => r.status === 'PASS').length;
console.log(`\nm100_check: ${pass}/${results.length} ${pass === results.length ? 'PASS' : 'FAIL'}`);
process.exit(pass === results.length ? 0 : 1);
