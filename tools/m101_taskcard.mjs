// M10.1 checks (docs/M10_SCOPE.md §4): procedure card engine taskcard.js — parsing, every rule at its bounds, other thicknesses, kit, card score.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const proj = join(here, '..', '..');
const readJson = (p) => JSON.parse(readFileSync(join(proj, p), 'utf8'));
const tasks = readJson('contracts/tasks.json');
const standard = readJson('contracts/standard_nbt47013_3.json');
const rules = readJson('contracts/waveform_rules.json');
const manifest = readJson('contracts/model_manifest.json');
const specimens = readJson('contracts/specimens_manifest.json');
const { createTaskcard } = await import(new URL('../src/taskcard.js', import.meta.url));
const TC = createTaskcard({ tasks, standard, rules, manifest, specimens });
const STD = standard.items;

const results = [];
const check = (id, desc, ok, detail = '') => results.push({ id, desc, status: ok ? 'PASS' : 'FAIL', detail });
const T = TC.plateThickness();
const tol = rules.practice.sensitivity_record.tolerance_dB;
const good = { probe_type: 'single', frequency_MHz: 2.5, element_mm: 14, reference_block: '2', edge_zone_mm: 50, middle_pattern: 'lines', spacing_mm: 50, scan_plus_dB: 6, compensation_dB: 0, level: 'II' };
const groupOf = (card, t = T, lv = 'II') => TC.check(card, t, lv).groups;
const only = (g, wrong) => Object.entries(g).filter(([, v]) => !v).map(([k]) => k).join() === wrong;

// P1 parsing: form strings → numbers, comma decimal, selects limited to their options, missing fields listed
const raw = { probe_type: 'single', frequency_MHz: '2,5', element_mm: ' 14 ', reference_block: '2', edge_zone_mm: '50', middle_pattern: 'lines', spacing_mm: '50', scan_plus_dB: '6', compensation_dB: '0', level: 'II' };
const p1 = TC.parse(raw);
const p2 = TC.parse({ ...raw, frequency_MHz: '', reference_block: '4', middle_pattern: 'zigzag', spacing_mm: 'abc' });
const p3 = TC.parse({});
check('P1', '填写解析：数值栏转数（含逗号小数、首尾空格），下拉只收选项内值；缺栏 / 非数 / 越界选项列为未填；全部填好才 ok',
  p1.ok && JSON.stringify(p1.card) === JSON.stringify(good) && !p2.ok && p2.missing.join() === 'frequency_MHz,reference_block,middle_pattern,spacing_mm' && p3.missing.length === TC.fields().length
    && JSON.stringify(TC.options('reference_block')) === JSON.stringify(STD.reference_block.rows.map((r) => String(r.no))) && JSON.stringify(TC.options('level')) === JSON.stringify(STD.grading.levels),
  `missing ${p2.missing.join('/')}; options block ${TC.options('reference_block')}, level ${TC.options('level')}`);

// P2 reference card at 50 mm all right; kit matches the probe and block rows
const kit = TC.kit();
check('P2', `${T} mm 参考卡全部符合；现有器材：单晶、${kit.frequency_MHz} MHz、Φ${kit.element_mm} mm、试块 ${kit.reference_block} 号（${kit.reference_block_id}）`,
  TC.check(good, T, 'II').ok && kit.probe_type === 'single' && kit.frequency_MHz === manifest.reference_physics.f0_MHz && kit.element_mm === manifest.parameters.active_element_diameter.value && kit.reference_block === '2');

// P3 numeric bounds: frequency, element, edge zone, spacing for lines / grid, scan sensitivity and compensation tolerance
const [f0, f1] = STD.probe_selection.rows.find((r) => r.probe === 'dual_or_single').MHz;
const [e0, e1] = STD.probe_selection.element_mm.round_diameter;
const ew = STD.scan_pattern.edge_zone[0].width_mm;
const { line_spacing_max_mm: lm, grid_mm: gm } = STD.scan_pattern.middle;
const plus = STD.scan_sensitivity.plus_dB;
const cases = [
  ['frequency', { frequency_MHz: f0 }, true], ['frequency', { frequency_MHz: f1 }, true], ['frequency', { frequency_MHz: f0 - 0.01 }, false], ['frequency', { frequency_MHz: f1 + 0.01 }, false],
  ['element', { element_mm: e0 }, true], ['element', { element_mm: e1 }, true], ['element', { element_mm: e0 - 0.1 }, false], ['element', { element_mm: e1 + 0.1 }, false],
  ['edge_zone', { edge_zone_mm: ew }, true], ['edge_zone', { edge_zone_mm: ew * 2 }, true], ['edge_zone', { edge_zone_mm: ew - 0.1 }, false],
  ['scan_plan', { spacing_mm: lm }, true], ['scan_plan', { spacing_mm: lm + 0.1 }, false], ['scan_plan', { spacing_mm: 0 }, false],
  ['scan_plan', { middle_pattern: 'grid', spacing_mm: gm }, true], ['scan_plan', { middle_pattern: 'grid', spacing_mm: gm + 0.1 }, false], ['scan_plan', { middle_pattern: 'grid', spacing_mm: lm + 1 }, true],
  ['scan_sensitivity', { scan_plus_dB: plus + tol }, true], ['scan_sensitivity', { scan_plus_dB: plus + 0.1 }, false], ['scan_sensitivity', { scan_plus_dB: plus - 0.1 }, false],
  ['compensation', { compensation_dB: tol }, true], ['compensation', { compensation_dB: 0.1 }, false], ['compensation', { compensation_dB: -2 }, false],
];
const bad3 = cases.filter(([g, patch, want]) => { const r = groupOf({ ...good, ...patch }); return r[g] !== want || !only(r, want ? '' : g); }).map(([g, p, w]) => `${g} ${JSON.stringify(p)} → ${!w}`);
check('P3', `数值边界：频率 ${f0}–${f1} MHz、晶片 ${e0}–${e1} mm（含端点）、边缘区 ≥ ${ew} mm、平行线间距 ≤ ${lm} / 格子线 ≤ ${gm} mm 且 > 0、扫查灵敏度 ${plus} dB 与补偿 0 dB 允差 ${tol} dB；每次只影响本组`,
  bad3.length === 0, bad3.join('; ') || `${cases.length} cases`);

// P4 selects and other thicknesses: probe type, block, edge zone by the table rows; level must equal the task level
const rb = (t) => String(STD.reference_block.rows.find((r) => t >= r.t_mm[0] && (r.t_mm[1] == null || t < r.t_mm[1])).no);
const ez = (t) => STD.scan_pattern.edge_zone.find((r) => t >= r.t_mm[0] && (r.t_mm[1] == null || t < r.t_mm[1])).width_mm;
const sel = [
  [groupOf({ ...good, probe_type: 'dual' }).probe_type, true, '50 dual'],
  [groupOf({ ...good, probe_type: 'dual' }, 15).probe_type, true, '15 dual'],
  [groupOf({ ...good }, 15).reference_block, false, '15 no block row'],
  [groupOf({ ...good }, 15).probe_type, false, '15 single'],
  [groupOf({ ...good, reference_block: rb(80), edge_zone_mm: ez(80) }, 80).probe_type, true, '80 single'],
  [groupOf({ ...good, probe_type: 'dual' }, 80).probe_type, false, '80 dual'],
  [groupOf({ ...good, reference_block: '1' }).reference_block, false, '50 block 1'],
  [groupOf({ ...good, reference_block: '1' }, 30).reference_block, true, '30 block 1'],
  [groupOf({ ...good, reference_block: '3', edge_zone_mm: ez(80) }, 80).reference_block, true, '80 block 3'],
  [groupOf({ ...good }, 80).edge_zone, false, `80 edge ${ew}`],
  [groupOf({ ...good, edge_zone_mm: ez(80) }, 80).edge_zone, true, `80 edge ${ez(80)}`],
  [groupOf({ ...good }, 60).probe_type && groupOf({ ...good }, 60).edge_zone === false, true, '60 → next row'],
  [groupOf({ ...good, level: 'III' }).level, false, 'level'],
];
const bad4 = sel.filter(([v, w]) => v !== w).map(([, , n]) => n);
check('P4', '下拉与其他板厚：50 mm 双晶 / 单晶均符合，15 mm 只双晶，80 mm 只单晶；试块 30 / 50 / 80 mm 为 1 / 2 / 3 号；80 mm 边缘区取下一行；分界板厚归下一行；验收等级须与任务一致', bad4.length === 0,
  bad4.join(', ') || `blocks ${rb(30)}/${rb(50)}/${rb(80)}, edge ${ez(50)}/${ez(80)}`);

// P5 card score: full 25; each wrong group costs exactly its points; a wrong level costs nothing
const full = TC.score(good, T, 'II');
const item = tasks.rubric.items.find((i) => i.id === 'card');
const wrongs = { probe_type: { probe_type: 'dual' }, frequency: { frequency_MHz: 1 }, element: { element_mm: 40 }, reference_block: { reference_block: '3' }, edge_zone: { edge_zone_mm: 30 },
  scan_plan: { spacing_mm: 80 }, scan_sensitivity: { scan_plus_dB: 2 }, compensation: { compensation_dB: 4 }, level: { level: 'I' } };
const bad5 = Object.entries(wrongs).filter(([g, patch]) => {
  const s = TC.score({ ...good, ...patch }, g === 'probe_type' ? 80 : T, 'II');
  const base = g === 'probe_type' ? TC.score({ ...good, reference_block: rb(80), edge_zone_mm: ez(80) }, 80, 'II').points : full.points;
  const lost = (g === 'probe_type' ? base - TC.score({ ...good, ...patch, reference_block: rb(80), edge_zone_mm: ez(80) }, 80, 'II').points : full.points - s.points);
  return lost !== item.parts.find((p) => p.group === g).points;
}).map(([g]) => g);
const empty = TC.score({}, T, 'II');
check('P5', `工艺卡得分：全对 ${item.points}；任一组错只扣该组分值（探头 / 频率 / 晶片 / 边缘区 / 扫查方式 / 灵敏度 / 补偿 3、试块 4）；验收等级错不扣卡分；空卡 0`,
  full.points === item.points && full.max === item.points && bad5.length === 0 && empty.points === 0, bad5.join(', ') || full.parts.map((p) => `${p.group} ${p.points}`).join(' / '));

// P6 task list helpers
check('P6', '任务清单：list / task 与 tasks.json 一致，未知编号为 null', TC.list().length === tasks.tasks.list.length && TC.task('T05')?.case === tasks.tasks.list[4].case && TC.task('T99') === null);

for (const r of results) console.log(`${r.status}  ${r.id}  ${r.desc}${r.detail ? `  [${r.detail}]` : ''}`);
const pass = results.filter((r) => r.status === 'PASS').length;
console.log(`\nm101_taskcard: ${pass}/${results.length} ${pass === results.length ? 'PASS' : 'FAIL'}`);
process.exit(pass === results.length ? 0 : 1);
