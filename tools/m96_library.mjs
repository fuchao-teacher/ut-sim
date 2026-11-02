// M9.6 checks (docs/M9_SCOPE.md §19): fixed case library plates, library case codes (bit mask of chosen cases), per-student assignment, random codes unchanged.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const proj = join(here, '..', '..');
const readJson = (p) => JSON.parse(readFileSync(join(proj, p), 'utf8'));
const cases = readJson('contracts/cases.json');
const wf = readJson('contracts/waveform_rules.json');
const std = readJson('contracts/standard_nbt47013_3.json');
const spec = readJson('contracts/specimens_manifest.json');
const model = readJson('contracts/model_manifest.json');
const scenes = readJson('knowledge/scenes.json');
const insp = readJson('knowledge/inspection.json');
const { createWaveform } = await import(new URL('../src/waveform.js', import.meta.url));
const CL = await import(new URL('../src/caselib.js', import.meta.url));
const makeWave = (specimens) => createWaveform({ rules: wf, manifest: model, dampingCycles: scenes.teaching_settings.lab.damping_cycles, scenarios: insp.scenarios, specimens });
const lib = CL.createCaselib({ cases, rules: wf, standard: std, specimens: spec, makeWave, scenario: insp.scenarios[0] });

const results = [];
const check = (id, desc, ok, detail = '') => results.push({ id, desc, status: ok ? 'PASS' : 'FAIL', detail });
const LB = cases.library;
const nos = (n, p = '2022') => Array.from({ length: n }, (_, i) => `${p}${String(i + 1).padStart(3, '0')}`);

// L1 every library case rebuilds as its template, tagged, and is found back from template + seed
const all = LB.cases.map((e) => ({ e, cs: lib.libraryCase(e.id) }));
const bad1 = all.filter(({ e, cs }) => !cs || cs.failed || cs.template_id !== e.template || cs.seed !== e.seed || cs.library_id !== e.id || lib.libraryOf(cs) !== e.id).map(({ e }) => e.id);
const again = LB.cases.every((e) => JSON.stringify(lib.libraryCase(e.id).plate) === JSON.stringify(all.find((a) => a.e.id === e.id).cs.plate));
check('L1', `案例库 ${LB.cases.length} 个案例全部按「模板 + 种子」生成为本模板的板（未被无缺陷混入改变），重复生成一致，可由板反查案例号`, bad1.length === 0 && again, bad1.join(', ') || LB.cases.map((e) => `${e.id} ${e.template}`).join(' '));

// L2 coverage: grades, types, conclusions
const grades = new Set(all.map(({ cs }) => cs.reference.expected.plate_grade));
const types = new Set(all.flatMap(({ cs }) => cs.plate.defects.map((d) => d.type)));
const passIII = new Set(all.map(({ cs }) => cs.reference.expected.III.pass));
check('L2', '案例覆盖：整板等级 Ⅰ–Ⅳ、五类显示类型、Ⅲ 级合格与不合格均有', ['I', 'II', 'III', 'IV'].every((g) => grades.has(g)) && [...new Set(cases.templates.flatMap((t) => t.pool || []))].every((t) => types.has(t)) && passIII.size === 2,
  `grades ${[...grades].sort().join('/')}, types ${[...types].join('/')}`);

// L3 library codes round trip; empty or out-of-range masks rejected
const sets = [['07'], ['01', '02'], ['03', '09', '17'], LB.cases.map((c) => c.id)];
const rt = sets.map((ids) => { const code = lib.encodeLibrary(ids); const d = lib.decode(code); return { ids, code, ok: d.ok && d.template_id === LB.id && JSON.stringify(lib.libraryIds(d.code_seed)) === JSON.stringify(ids) }; });
const rawCode = (seed) => CL.encodeCaseCode(cases, LB.id, seed);
const rejected = [0, 2 ** LB.cases.length].every((m) => !lib.decode(rawCode(m)).ok && !lib.fromCode(rawCode(m), '2022001').ok);
check('L3', '案例库案例码：所选案例集合编码 / 解码往返一致；空集合与超出案例数的掩码判为无效', rt.every((r) => r.ok) && rejected, rt.map((r) => `${r.ids.length}→${r.code}`).join(' '));

// L4 one chosen case: every student gets it
const one = lib.encodeLibrary(['12']);
const oneIds = nos(40).map((n) => lib.fromCode(one, n).library_id);
check('L4', '只选一个案例：全班（40 个学号）都得到该案例', oneIds.every((id) => id === '12'), [...new Set(oneIds)].join(','));

// L5 several chosen cases: each student gets one of them, all used, deterministic, plate = library plate
const three = lib.encodeLibrary(['03', '09', '17']);
const got = nos(60).map((n) => ({ n, cs: lib.fromCode(three, n) }));
const inSet = got.every(({ cs }) => ['03', '09', '17'].includes(cs.library_id));
const used = new Set(got.map(({ cs }) => cs.library_id));
const det = got.every(({ n, cs }) => lib.fromCode(three, n).library_id === cs.library_id);
const samePlate = got.every(({ cs }) => JSON.stringify(cs.plate) === JSON.stringify(all.find((a) => a.e.id === cs.library_id).cs.plate));
check('L5', '选多个案例：每个学号得到所选之一，三个都被分到，同学号重复一致，板即案例库之板', inSet && used.size === 3 && det && samePlate,
  ['03', '09', '17'].map((id) => `${id} ×${got.filter(({ cs }) => cs.library_id === id).length}`).join(', '));

// L6 random-template codes unchanged
const rnd = ['basic', 'standard', 'clean'].map((t) => { const code = lib.encode(t, 123456); const r = lib.fromCode(code, '2022007'); const g = lib.generate(t, CL.studentSeed(cases, 123456, '2022007'));
  return r.ok && lib.decode(code).template_id === t && r.seed === g.seed && r.template_id === g.template_id && !r.library_id; });
check('L6', '随机模板案例码不受影响：解码模板、每生种子、生成的板与 M9.4 相同', rnd.every(Boolean));

// L7 scoring context builds for every library case
const sc = all.map(({ cs }) => lib.scoringContext(cs));
check('L7', '每个案例都能构建评分上下文（显示、判据确定、期望判定、定量参考）', sc.every((c, i) => c.defects.length === all[i].cs.plate.defects.length && c.expected && c.reference_items.length === c.defects.length));

for (const r of results) console.log(`${r.status}  ${r.id}  ${r.desc}${r.detail ? `  [${r.detail}]` : ''}`);
const pass = results.filter((r) => r.status === 'PASS').length;
console.log(`\nm96_library: ${pass}/${results.length} ${pass === results.length ? 'PASS' : 'FAIL'}`);
process.exit(pass === results.length ? 0 : 1);
