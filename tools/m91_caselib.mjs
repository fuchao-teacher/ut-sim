// M9.1 checks (docs/M9_SCOPE.md): caselib golden against the frozen P-02 values, case codes, student seeds, determinism, and N seeds per template against the limits and margins.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const proj = join(here, '..', '..');
const readJson = (p) => JSON.parse(readFileSync(join(proj, p), 'utf8'));
const N = Number(process.env.M91_N || 1000);

const cases = readJson('contracts/cases.json');
const wf = readJson('contracts/waveform_rules.json');
const std = readJson('contracts/standard_nbt47013_3.json');
const spec = readJson('contracts/specimens_manifest.json');
const model = readJson('contracts/model_manifest.json');
const scenes = readJson('knowledge/scenes.json');
const insp = readJson('knowledge/inspection.json');
const { createWaveform } = await import(new URL('../src/waveform.js', import.meta.url));
const { createProcedure } = await import(new URL('../src/procedure.js', import.meta.url));
const CL = await import(new URL('../src/caselib.js', import.meta.url));
const makeWave = (specimens) => createWaveform({ rules: wf, manifest: model, dampingCycles: scenes.teaching_settings.lab.damping_cycles, scenarios: insp.scenarios, specimens });
const lib = CL.createCaselib({ cases, rules: wf, standard: std, specimens: spec, makeWave, scenario: insp.scenarios[0] });

const results = [];
const check = (id, desc, ok, detail = '') => results.push({ id, desc, status: ok ? 'PASS' : 'FAIL', detail });
const PR = wf.practice;
const AV = PR.acceptance_values;
const GS = std.items.grading;
const decimals = (v) => (String(v).split('.')[1] || '').length;
const same = (got, want) => typeof got === 'number' && Math.abs(got - want) <= 0.5 * 10 ** -decimals(want) + 1e-9;

// G1–G4 golden: fixed_p02 recomputed by caselib equals the frozen P-02 values
const t0 = Date.now();
const fx = lib.generate('fixed_p02');
const ref = fx.reference;
const msP02 = Date.now() - t0;
const g1 = PR.grading.reference_items.filter((w) => {
  const g = ref.items.find((x) => x.id === w.id);
  return !g || g.determined !== w.determined || JSON.stringify([...g.flags].sort()) !== JSON.stringify([...w.flags].sort())
    || (w.S_mm2 == null ? g.S_mm2 != null : !same(g.S_mm2, w.S_mm2)) || (w.D_dB == null ? g.D_dB != null : !same(g.D_dB, w.D_dB));
}).map((w) => w.id);
check('G1', 'fixed_p02：reference_items（判据确定、S、D、判据标志）与冻结值一致', g1.length === 0 && ref.items.length === PR.grading.reference_items.length,
  g1.join(', ') || ref.items.map((x) => `${x.id} ${x.determined ? `S ${x.S_mm2} D ${x.D_dB}` : '-'}`).join('; '));

const g2 = GS.levels.filter((lv) => JSON.stringify(ref.expected[lv]) !== JSON.stringify(PR.grading.expected[lv]));
check('G2', 'fixed_p02：各级别逐处判定与是否合格、整板等级与 grading.expected 一致', g2.length === 0 && ref.expected.plate_grade === PR.grading.expected.plate_grade, g2.join(', ') || `plate ${ref.expected.plate_grade}`);

const golden = [
  ['LAM_02 x', ref.rects.LAM_02?.x, AV.LAM_02_reference_mm.x], ['LAM_02 y', ref.rects.LAM_02?.y, AV.LAM_02_reference_mm.y],
  ['LAM_02 length', ref.rects.LAM_02?.length, AV.LAM_02_reference_mm.length], ['LAM_02 area', ref.rects.LAM_02?.area_mm2, AV.LAM_02_reference_mm.area_mm2],
  ['INC_02 x', ref.rects.INC_02?.x, AV.INC_02_reference_mm.x], ['INC_02 y', ref.rects.INC_02?.y, AV.INC_02_reference_mm.y],
  ['INC_02 length', ref.rects.INC_02?.length, AV.INC_02_reference_mm.length], ['INC_02 area', ref.rects.INC_02?.area_mm2, AV.INC_02_reference_mm.area_mm2],
  ['CLU_01 length', ref.rects.CLU_01?.length, AV.CLU_01_reference_mm.length], ['CLU_01 area', ref.rects.CLU_01?.area_mm2, AV.CLU_01_reference_mm.area_mm2],
  ...AV.CLU_01_member_area_mm2.map((v, i) => [`CLU_01 member ${i}`, ref.rects.CLU_01?.member_area_mm2?.[i], v]),
  ['LAM_02 F1−DAC', ref.peaks.LAM_02.f1_dB, AV.LAM_02_F1_full_minus_dac_dB], ['INC_02 eq', ref.equivalents.INC_02, AV.INC_02_equivalent_dB],
  ['CLU_01 eq', ref.equivalents.CLU_01, AV.CLU_01_equivalent_dB], ['POR_01 F1−DAC', ref.peaks.POR_01.f1_dB, AV.POR_01_f1_minus_dac_dB],
  ['SEG_01 F1−DAC max', ref.peaks.SEG_01.f1_dB, AV.SEG_01_f1_minus_dac_max_dB], ['SEG_01 B1 min', ref.peaks.SEG_01.b1_pct, AV.SEG_01_B1_min_at_G_base_percent],
];
const g3 = golden.filter(([, g, w]) => !same(g, w)).map(([n, g, w]) => `${n} ${g} ≠ ${w}`);
check('G3', `fixed_p02：参考边界 / 指示长度 / 面积 / 密集区成员面积 / 当量 / 峰值 F1 − DAC / 偏析 B1 与 acceptance_values 一致（${golden.length} 项，按冻结值位数比较）`, g3.length === 0, g3.join('; ') || `${msP02} ms`);

const judgedP02 = Object.fromEntries(Object.entries(PR.tolerance.judged).filter(([id]) => ref.judged[id] !== undefined));
check('G4', 'fixed_p02：定量判定量 judged 与 tolerance.judged 一致；判据确定的显示均可走完参考边界（无开口）', JSON.stringify(ref.judged) === JSON.stringify(judgedP02) && Object.keys(ref.judged).length === 3 && Object.values(ref.rects).every((r) => !r.open),
  JSON.stringify(ref.judged));

// G5 case codes
const alpha = cases.case_code.alphabet;
let rt = 0;
let typo = 0;
let typoMissed = 0;
let swapMissed = 0;
const rnd = CL.mulberry32(20261003);
for (let i = 0; i < 2000; i++) {
  const t = cases.templates[i % cases.templates.length];
  const s = Math.floor(rnd() * 2 ** cases.prng.seed_bits);
  const code = CL.encodeCaseCode(cases, t.id, s);
  const d = CL.decodeCaseCode(cases, code.toLowerCase().replace(/^(...)/, '$1-'));
  if (d.ok && d.template_id === t.id && d.code_seed === s && code.length === 6) rt++;
  const p = Math.floor(rnd() * 6);
  const c = alpha[(alpha.indexOf(code[p]) + 1 + Math.floor(rnd() * 30)) % 31];
  typo++;
  if (CL.decodeCaseCode(cases, code.slice(0, p) + c + code.slice(p + 1)).ok) typoMissed++;
  const q = Math.floor(rnd() * 4);
  if (code[q] !== code[q + 1] && CL.decodeCaseCode(cases, code.slice(0, q) + code[q + 1] + code[q] + code.slice(q + 2)).ok) swapMissed++;
}
const badInputs = ['', 'ABC', 'ABCDEFG', 'AB0CDE', 'ABCDE1'].filter((x) => CL.decodeCaseCode(cases, x).ok);
check('G5', '案例码：2000 个随机码往返一致（小写、连字符可输入）；单字符错与相邻对调全部识别为无效；长度 / 非法字符无效', rt === 2000 && typoMissed === 0 && swapMissed === 0 && badInputs.length === 0,
  `round trip ${rt}/2000, single-char typos missed ${typoMissed}/${typo}, swaps missed ${swapMissed}; e.g. ${CL.encodeCaseCode(cases, 'standard', 123456)}`);

// G6 student seeds
const code = CL.encodeCaseCode(cases, 'standard', 4242);
const dc = CL.decodeCaseCode(cases, code);
const stu = Array.from({ length: 1000 }, (_, i) => `2022${String(i + 1).padStart(4, '0')}`);
const seeds = stu.map((n) => CL.studentSeed(cases, dc.code_seed, n));
const repeat = stu.every((n, i) => CL.studentSeed(cases, dc.code_seed, ` ${n} `) === seeds[i]);
const distinct = new Set(seeds).size;
const cleanShare = seeds.filter((s) => CL.mulberry32((s * 64) >>> 0)() < cases.templates.find((t) => t.id === 'standard').clean_ratio).length / seeds.length;
const otherCode = CL.studentSeed(cases, dc.code_seed + 1, stu[0]) !== seeds[0];
check('G6', '每生种子：同码同学号复现（首尾空格忽略）；1000 名学生种子基本不重复；换码则换板；无缺陷混入比例接近 clean_ratio', repeat && distinct >= 995 && otherCode && Math.abs(cleanShare - 0.2) < 0.05,
  `distinct ${distinct}/1000, clean share ${cleanShare.toFixed(3)}`);

// G7 determinism
const a1 = JSON.stringify(lib.generate('standard', 777));
const a2 = JSON.stringify(CL.createCaselib({ cases, rules: wf, standard: std, specimens: spec, makeWave, scenario: insp.scenarios[0] }).generate('standard', 777));
const fc1 = lib.fromCode(code, stu[5]);
const fc2 = lib.fromCode(code, stu[5]);
check('G7', '确定性：同模板同种子（含新建实例）生成完全相同的案例与参考答案；fromCode 同码同学号结果相同', a1 === a2 && JSON.stringify(fc1) === JSON.stringify(fc2) && fc1.ok,
  `${JSON.parse(a1).defect_set_id}, ${fc1.defect_set_id}`);

// G8 N seeds per template, rechecked independently of the generator
const pr = createProcedure({ rules: wf, wave: makeWave(spec), specimens: spec, standard: std });
const [dMin, dMax] = [15, 45].map((v, i) => (i ? Math.max : Math.min)(...spec.specimens.specimen__cbii_2.holes.map((h) => h.S_mm)));
const LX = spec.runtime_specimens.specimen__plate_p02.dims.length.value / 2 - spec.probe_limits.housing_outer_diameter_mm / 2;
const LY = spec.runtime_specimens.specimen__plate_p02.dims.width.value / 2 - spec.probe_limits.housing_outer_diameter_mm / 2;
const tplStats = {};
const t1 = Date.now();
for (const tid of ['basic', 'standard', 'clean']) {
  const st = { ok: 0, failed: [], bad: [], attempts: 0, maxAttempt: 0, grades: {}, types: {}, mixedClean: 0 };
  for (let s = 0; s < N; s++) {
    const c = lib.generate(tid, s);
    if (!c || c.failed) { st.failed.push(s); continue; }
    st.attempts += c.attempt + 1;
    st.maxAttempt = Math.max(st.maxAttempt, c.attempt);
    const T = cases.templates.find((x) => x.id === c.template_id);
    if (c.template_id !== tid) st.mixedClean++;
    const r = c.reference;
    const det = r.items.filter((x) => x.determined).length;
    const nd = r.items.length - det;
    const errs = [];
    if (det < T.determined[0] || det > T.determined[1] || nd < T.not_determined[0] || nd > T.not_determined[1]) errs.push('counts');
    for (const d of c.plate.defects) {
      const zs = d.type === 'cluster' ? d.members.map((m) => m.depth_mm) : d.type === 'segregation' ? d.depth_range_mm : [d.depth_mm];
      if (zs.some((z) => z < dMin - 1e-9 || z > dMax + 1e-9)) errs.push(`${d.id} depth`);
      if (Math.abs(d.centre_mm[0]) > LX || Math.abs(d.centre_mm[1]) > LY) errs.push(`${d.id} centre`);
      if (d.type === 'pore' || d.type === 'inclusion') {
        const [a, b] = cases.types[d.type].plus_dB_range;
        if (d.equivalent.plus_dB < a - 0.05 || d.equivalent.plus_dB > b + 0.05) errs.push(`${d.id} plus`);
      }
      st.types[d.type] = (st.types[d.type] || 0) + 1;
    }
    for (const [id, rr] of Object.entries(r.rects)) if (rr.x0 < -LX || rr.x1 > LX || rr.y0 < -LY || rr.y1 > LY || rr.open) errs.push(`${id} rect`);
    const regrade = GS.levels.every((lv) => {
      const g = pr.grade(lv, r.items);
      return JSON.stringify({ ...g.verdicts, pass: g.pass }) === JSON.stringify(r.expected[lv]);
    }) && pr.plateGrade(r.items) === r.expected.plate_grade;
    if (!regrade) errs.push('expected');
    if (c.template_id === 'clean' && (det > 0 || r.expected.plate_grade !== GS.levels[0])) errs.push('clean');
    errs.push(...lib.violations(c));
    if (errs.length) st.bad.push(`${s}:${errs[0]}`);
    else st.ok++;
    st.grades[r.expected.plate_grade] = (st.grades[r.expected.plate_grade] || 0) + 1;
  }
  tplStats[tid] = st;
}
const secs = ((Date.now() - t1) / 1000).toFixed(1);
for (const [tid, st] of Object.entries(tplStats)) {
  const pool = cases.templates.find((x) => x.id === tid).pool;
  const used = tid === 'clean' ? true : pool.every((k) => st.types[k] > 0);
  check(`G8-${tid}`, `${tid}：${N} 个种子全部生成且满足 §2 限制与裕量（数量、深度、中心与参考矩形在探头可达范围、无开口、判据 / 标记 / 评级裕量、峰值归属、间距；判定矩阵复算一致）；类型池全部用到`,
    st.failed.length === 0 && st.bad.length === 0 && st.ok === N && used,
    `${st.failed.length ? `failed ${st.failed.slice(0, 5).join(',')} ` : ''}${st.bad.length ? `bad ${st.bad.slice(0, 5).join(', ')} ` : ''}mean attempts ${(st.attempts / Math.max(1, st.ok)).toFixed(2)}, max ${st.maxAttempt + 1}; grades ${JSON.stringify(st.grades)}; types ${JSON.stringify(st.types)}${st.mixedClean ? `; mixed clean ${st.mixedClean}` : ''}`);
}

// G9 source hygiene
const srcText = readFileSync(join(here, '..', 'src', 'caselib.js'), 'utf8');
check('G9', 'caselib.js：不用 Math.random、无中文、无 DOM；只依赖 procedure.js 与调用方给的波形工厂', !/Math\.random/.test(srcText) && !/[\u4e00-\u9fff]/.test(srcText) && !/\b(document|window)\b/.test(srcText) && [...srcText.matchAll(/^import .* from '([^']+)'/gm)].map((m) => m[1]).join() === './procedure.js',
  `${N * 3} cases in ${secs} s`);

for (const r of results) console.log(`${r.status}  ${r.id}  ${r.desc}${r.detail ? `  [${r.detail}]` : ''}`);
const pass = results.filter((r) => r.status === 'PASS').length;
console.log(`\nm91_caselib: ${pass}/${results.length} ${pass === results.length ? 'PASS' : 'FAIL'}`);
process.exit(pass === results.length ? 0 : 1);
