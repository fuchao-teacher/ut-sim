// M9.3 checks (docs/M9_SCOPE.md §6): rubric 1.1 case context — P-02 golden through caselib, random and defect-free plates,
// false calls, missed displays. run: node tools/m93_score.mjs  (M93_N seeds per template, default 30)
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createScoring } from '../src/scoring.js';

const here = dirname(fileURLToPath(import.meta.url));
const proj = join(here, '..', '..');
const readJson = (p) => JSON.parse(readFileSync(join(proj, p), 'utf8'));
const N = Number(process.env.M93_N || 30);

const rubric = readJson('contracts/rubric.json');
const cases = readJson('contracts/cases.json');
const wf = readJson('contracts/waveform_rules.json');
const std = readJson('contracts/standard_nbt47013_3.json');
const spec = readJson('contracts/specimens_manifest.json');
const model = readJson('contracts/model_manifest.json');
const scenes = readJson('knowledge/scenes.json');
const insp = readJson('knowledge/inspection.json');
const files = { waveform_rules: wf, standard: std, specimens_manifest: spec, model_manifest: model, practice_doc: readJson('knowledge/practice.json') };
const { createWaveform } = await import(new URL('../src/waveform.js', import.meta.url));
const CL = await import(new URL('../src/caselib.js', import.meta.url));
const makeWave = (specimens) => createWaveform({ rules: wf, manifest: model, dampingCycles: scenes.teaching_settings.lab.damping_cycles, scenarios: insp.scenarios, specimens });
const lib = CL.createCaselib({ cases, rules: wf, standard: std, specimens: spec, makeWave, scenario: insp.scenarios[0] });
const S = createScoring({ rubric, files });

const results = [];
const check = (id, desc, ok, detail = '') => results.push({ id, desc, status: ok ? 'PASS' : 'FAIL', detail });
const P = wf.practice;
const AV = P.acceptance_values;
const item = (r, id) => r.items.find((x) => x.id === id);
const decimals = (v) => (String(v).split('.')[1] || '').length;
const same = (got, want) => (got == null && want == null) || (typeof got === 'number' && typeof want === 'number' && Math.abs(got - want) <= 0.5 * 10 ** -decimals(want) + 1e-9);
const LEVEL = 'IV';

// Correct exam state for a case context: every display found, judged quantities at the reference, verdicts / grade / conclusion as expected.
function perfect(ctx) {
  const sid = ctx.specimen_id;
  const results = {};
  for (const [id, d] of Object.entries(ctx.displays)) results[id] = { length: d.reference_mm.length, area: d.reference_mm.area_mm2, eq: d.reference_eq_dB };
  const exp = ctx.expected[LEVEL];
  const prac = {
    done: { calibrate: true, dac: true, sensitivity: true, scan: true, quantify: true, evaluate: true },
    calib: { points: { ...P.calibration.targets_mm } },
    dac: { points: spec.specimens[P.dac.specimen].holes.map((h) => ({ id: h.id, S: h.S_mm, G: AV.dac_G_dB[String(h.S_mm)] })) },
    sens: { base: AV.G_base_dB, scan: AV.G_scan_dB },
    plates: { [sid]: { scan: { trail: [[0, 0], [0, 1]], found: ctx.defects.map((id) => ({ id, flags: [], confirmed: true })) }, quant: { results } } },
    eval: { level: LEVEL, verdicts: Object.fromEntries(ctx.defects.map((id) => [id, exp[id]])), plate: ctx.expected.plate_grade, conclusion: exp.pass ? 'accept' : 'reject' },
  };
  const events = ['assembly:done', 'practice:calib_done', 'practice:dac_done', 'practice:sensitivity'].map((name) => ({ name, payload: {} }))
    .concat([{ name: 'practice:evaluate', payload: { correct: true, self_consistent: true } }]);
  return { prac, events, coverage: { [sid]: { edge: 1, middle: 0.95 } } };
}
const run = (ctx, mod) => { const c = perfect(ctx); mod?.(c); return S.score({ ...c, case: ctx }); };
const full = (r) => r.total === 100 && r.max === 100 && r.items.every((x) => x.points === x.max && x.status === 'ok');
const refsOk = (r) => r.items.every((it) => it.parts.every((p) => p.evidence.every((e) => e.ref && !e.ref.includes('{') && e.ref !== 'null')));

// G1 fixed_p02 context through caselib equals the engine default (frozen files)
const def = S.fixedCase();
const fx = lib.generate('fixed_p02');
const cx = lib.scoringContext(fx);
const keysEq = ['template_id', 'case_id', 'specimen_id', 'defects', 'reference_items', 'expected', 'judged', 'area_applies'].filter((k) => JSON.stringify(cx[k]) !== JSON.stringify(def[k]));
const numBad = Object.keys(def.displays).flatMap((id) => [
  [`${id} length`, cx.displays[id]?.reference_mm.length, def.displays[id].reference_mm.length],
  [`${id} area`, cx.displays[id]?.reference_mm.area_mm2, def.displays[id].reference_mm.area_mm2],
  [`${id} eq`, cx.displays[id]?.reference_eq_dB, def.displays[id].reference_eq_dB],
]).filter(([, g, w]) => !same(g, w)).map(([n, g, w]) => `${n} ${g} ≠ ${w}`);
check('G1', 'fixed_p02：caselib.scoringContext 与评分引擎默认上下文（冻结文件）一致：显示 / 确定 / 判定矩阵 / judged / 面积项 / 参考尺寸与当量', keysEq.length === 0 && numBad.length === 0
  && JSON.stringify(Object.keys(cx.displays)) === JSON.stringify(Object.keys(def.displays)), [...keysEq, ...numBad].join('; ') || `judged ${Object.keys(def.judged).join('/')}`);

// G2 P-02 perfect: no case vs caselib context vs default context, same items
const p0 = S.score(perfect(def));
const p1 = run(cx);
const p2 = run(def);
const sameItems = (a, b) => JSON.stringify(a.items.map((x) => [x.id, x.points, x.status])) === JSON.stringify(b.items.map((x) => [x.id, x.points, x.status]));
check('G2', 'P-02 满分路径：不传案例 / 传 caselib 上下文 / 传默认上下文，九项得分一致且为 100；输出带 case_id / template_id', full(p0) && sameItems(p0, p1) && sameItems(p0, p2)
  && p0.case_id === 'P02-A' && p0.template_id === 'fixed_p02', `${p0.total} ${p0.case_id} ${p0.template_id}`);

// R1–R2 random plates per template: perfect state scores 100, evidence refs resolved
const plates = { basic: [], standard: [], clean: [] };
const fails = [];
let s0 = 7;
for (const t of Object.keys(plates)) {
  for (let k = 0; plates[t].length < N && k < N * 3; k++) {
    const cs = lib.generate(t, (s0 = (s0 * 2654435761 + 12345) >>> 0) % 2 ** cases.prng.seed_bits);
    if (!cs || cs.failed) { fails.push(`${t}:${s0}`); continue; }
    plates[t].push(cs);
  }
}
const all = Object.values(plates).flat();
const bad1 = all.map((cs) => { const r = run(lib.scoringContext(cs)); return full(r) && refsOk(r) ? null : `${cs.template_id}/${cs.seed} ${r.total}`; }).filter(Boolean);
check('R1', `随机板满分路径：基础 / 标准 / 无缺陷各 ${N} 块（含混入的无缺陷板），全部 100 分、各项 ok、证据引用可解析`, bad1.length === 0 && all.length === 3 * N,
  bad1.slice(0, 5).join(', ') || `${all.length} plates, ${all.filter((c) => c.template_id === 'clean').length} clean, ${fails.length} failed seeds`);

const cleanOnes = all.filter((cs) => cs.template_id === 'clean');
const bad2 = cleanOnes.map((cs) => {
  const ctx = lib.scoringContext(cs);
  const r = run(ctx);
  const q = item(r, 'quantify');
  const d = item(r, 'detect');
  return Object.keys(ctx.judged).length === 0 && q.parts.length === 1 && q.parts[0].id === 'size_none' && q.points === 10
    && d.parts.filter((p) => p.id.startsWith('found_')).length === ctx.defects.length && ctx.reference_items.every((x) => !x.determined) ? null : `${cs.seed}`;
}).filter(Boolean);
check('R2', '无缺陷板：无判据确定显示，定量为 size_none 满分 10；检出按显示数均分 15；满分 100', cleanOnes.length > 0 && bad2.length === 0, bad2.join(', ') || `${cleanOnes.length} clean plates`);

// R3 no displays at all (synthetic context): found_none / size_none / verdict_none full
const empty = { ...def, defects: [], reference_items: [], judged: {}, area_applies: [], displays: {}, expected: Object.fromEntries(Object.entries(def.expected).map(([k, v]) => [k, typeof v === 'object' ? { pass: true } : 'I'])) };
const r3 = run(empty);
check('R3', '零显示上下文：检出 found_none、定量 size_none、评定 verdict_none 满分，合计 100', full(r3)
  && item(r3, 'detect').parts[0].id === 'found_none' && item(r3, 'evaluate').parts.some((p) => p.id === 'verdict_none'), `${r3.total}`);

// F1–F3 false calls
const withNd = all.filter((cs) => cs.reference.items.some((x) => !x.determined));
const fcBad = [];
for (const cs of withNd) {
  const ctx = lib.scoringContext(cs);
  const nd = ctx.reference_items.filter((x) => !x.determined).map((x) => x.id);
  const share = 5 / ctx.defects.length;
  const r = run(ctx, (c) => { c.prac.eval.verdicts[nd[0]] = 'counted'; });
  const d = item(r, 'detect');
  const fc = d.parts.find((p) => p.id === 'false_call');
  const want = Math.round((100 - 1 - share) * 10) / 10;
  if (!(d.points === 14 && fc.points === -1 && fc.evidence[0].value.join() === nd[0] && Math.abs(r.total - want) < 0.051)) fcBad.push(`${cs.template_id}/${cs.seed} ${d.points} ${r.total}≠${want}`);
}
check('F1', `虚判：未确定显示判为「计数」→ 检出扣 per_item ${rubric.teacher_config.false_call.per_item}（14 / 15），该显示判定分另失；${withNd.length} 块含未确定显示的板`, withNd.length > 0 && fcBad.length === 0, fcBad.slice(0, 4).join(', '));

const r4 = run(def, (c) => { c.prac.eval.verdicts.POR_01 = 'exceed'; c.prac.eval.verdicts.SEG_01 = 'counted'; });
const d4 = item(r4, 'detect');
check('F2', 'P-02：POR_01「超标」+ SEG_01「计数」两处虚判 → 检出 13；判定为确定显示的「计数」不算虚判', d4.points === 13 && d4.status === 'partial'
  && item(run(def, (c) => { c.prac.eval.verdicts.INC_02 = 'counted'; }), 'detect').points === 15, `${d4.points}`);

const harsh = createScoring({ rubric: { ...rubric, teacher_config: { ...rubric.teacher_config, false_call: { per_item: 20 } } }, files });
const r5 = harsh.score({ ...perfect(def), case: def });
const c5 = perfect(def);
c5.prac.eval.verdicts.POR_01 = 'counted';
const r5b = harsh.score({ ...c5, case: def });
check('F3', 'teacher_config.false_call.per_item 可调；检出项扣至 0 为止（不出现负分），其余项不受影响', full(r5) && item(r5b, 'detect').points === 0
  && item(r5b, 'detect').parts.find((p) => p.id === 'false_call').points === -15 && item(r5b, 'quantify').points === 10, `${item(r5b, 'detect').points}`);

// M1 missed determined display on a random plate: detect share lost, its size / verdict basis_invalid
const withDet = all.filter((cs) => cs.reference.items.filter((x) => x.determined).length >= 2);
const mBad = [];
for (const cs of withDet.slice(0, 20)) {
  const ctx = lib.scoringContext(cs);
  const id = Object.keys(ctx.judged)[0];
  const r = run(ctx, (c) => { const pl = c.prac.plates[ctx.specimen_id]; pl.scan.found = pl.scan.found.filter((f) => f.id !== id); });
  const n = ctx.defects.length;
  const q = item(r, 'quantify').parts.find((p) => p.id === `size_${id}`);
  const v = item(r, 'evaluate').parts.find((p) => p.id === `verdict_${id}`);
  const wantDet = Math.round((15 - 15 / n) * 10) / 10;
  if (!(Math.abs(item(r, 'detect').points - wantDet) < 0.051 && q.status === 'basis_invalid' && v.status === 'basis_invalid')) mBad.push(`${cs.template_id}/${cs.seed} ${item(r, 'detect').points}≠${wantDet}`);
}
check('M1', '随机板漏检一处确定显示：检出失 15 / n，该显示定量与判定依据无效（0 分）', withDet.length > 0 && mBad.length === 0, mBad.join(', ') || `${Math.min(20, withDet.length)} plates`);

// D1 deterministic and reproducible from (template, seed)
const pick = plates.standard[0];
const again = lib.generate(pick.template_id, pick.seed);
const ra = run(lib.scoringContext(pick), (c) => { c.prac.eval.plate = 'I'; });
const rb = run(lib.scoringContext(again), (c) => { c.prac.eval.plate = 'I'; });
check('D1', '同模板同种子重建同一块板，评分结果逐字节一致', JSON.stringify(ra) === JSON.stringify(rb) && JSON.stringify(pick.plate) === JSON.stringify(again.plate), `${pick.template_id}/${pick.seed} ${ra.total}`);

for (const r of results) console.log(`${r.status}  ${r.id}  ${r.desc}${r.detail ? `  [${r.detail}]` : ''}`);
const pass = results.filter((r) => r.status === 'PASS').length;
console.log(`\nm93_score: ${pass}/${results.length} ${pass === results.length ? 'PASS' : 'FAIL'}`);
process.exit(pass === results.length ? 0 : 1);
