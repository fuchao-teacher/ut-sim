// M8.5 replay engine: reconstruct pose / instrument from a UTlog; version mismatch still seeks.
import { parseSession, createReplay, SCHEMA, SPEEDS } from '../src/replay.js';

const results = [];
const check = (id, desc, ok, detail = '') => results.push({ id, desc, ok: !!ok, detail });

const specA = 'specimen__csk_ia';
const specB = 'specimen__plate_50';
const inst0 = { gain_dB: 40, range_mm: 100, velocity_m_s: 5920, zero_us: 0, reject_percent: 0, coupling: 'couplant' };
const doc = {
  schema_version: SCHEMA,
  session_id: 's-test',
  build_id: 'b1',
  knowledge_version: 'k1',
  contracts_version: 'c1',
  active_ms: 25000,
  initial: {
    specimen: specA,
    step: 'calibrate',
    probe: { [specA]: { x: 0, y: 0 }, [specB]: { x: 10, y: 20 } },
    inst: { ...inst0 },
  },
  log: [
    { t_ms: 0, kind: 'event', name: 'session:start', payload: { mode: 'train', session_id: 's-test' } },
    { t_ms: 200, kind: 'frame', specimen_id: specA, x_mm: 5, y_mm: 0 },
    { t_ms: 400, kind: 'frame', specimen_id: specA, x_mm: 12, y_mm: 1 },
    { t_ms: 500, kind: 'inst', delta: { gain_dB: 46 } },
    { t_ms: 800, kind: 'event', name: 'practice:calib_done', payload: { velocity_m_s: 5920, delay_us: 0.4 } },
    { t_ms: 10000, kind: 'key', state: { mode: 'practice', step: 'dac', specimen: specA, probe: { x: 12, y: 1 }, inst: { ...inst0, gain_dB: 46, zero_us: 0.4 } } },
    { t_ms: 11000, kind: 'inst', delta: { gain_dB: 50 } },
    { t_ms: 12000, kind: 'frame', specimen_id: specB, x_mm: -30, y_mm: 8 },
    { t_ms: 12100, kind: 'frame', specimen_id: specB, x_mm: -20, y_mm: 8 },
    { t_ms: 13000, kind: 'event', name: 'practice:flag', payload: { criterion: 'F1_over_dac', x_mm: -20, y_mm: 8 } },
    { t_ms: 14000, kind: 'event', name: 'practice:dac_point', payload: { id: 'H15' } },
    { t_ms: 20000, kind: 'event', name: 'session:submit', payload: { session_id: 's-test', total: 10, max: 100 } },
    { t_ms: 21000, kind: 'event', name: 'session:restore', payload: { mode: 'train', session_id: 's-test', gap_s: 3 } },
    { t_ms: 22000, kind: 'event', name: 'assembly:error', payload: { step: 'plug', reason: 'r' } },
  ],
};

const parsed = parseSession(JSON.stringify(doc), { build_id: 'b1', knowledge_version: 'k1', contracts_version: 'c1' });
check('R1', 'schema ut-session/1 且版本字段一致 → ok / version_match', parsed.ok && parsed.version_match);
const mismatch = parseSession(doc, { build_id: 'other', knowledge_version: 'k1', contracts_version: 'c1' });
check('R2', 'build_id 不同仍 ok，version_match false', mismatch.ok && mismatch.version_match === false);
check('R3', 'schema 不对 → bad_file', parseSession({ schema_version: 'nope', log: [] }).error === 'bad_file');
check('R4', '非 JSON → bad_file', parseSession('{').error === 'bad_file');
check('R5', 'SPEEDS 1 / 4 / 16', JSON.stringify(SPEEDS) === '[1,4,16]');

const rp = createReplay(doc);
const at400 = rp.seek(400);
check('R6', '帧时刻探头位置与记录一致', at400.x_mm === 12 && at400.y_mm === 1 && at400.specimen_id === specA);
const at499 = rp.seek(499);
check('R7', '增益增量在 500 ms 前未生效', at499.inst.gain_dB === 40);
const at500 = rp.seek(500);
check('R8', '增益增量在 500 ms 生效', at500.inst.gain_dB === 46);
const at11 = rp.seek(11000);
check('R9', '关键帧后仪器差量叠在关键帧状态上（gain 50、zero 0.4）', at11.inst.gain_dB === 50 && at11.inst.zero_us === 0.4 && at11.step === 'dac');
const at12 = rp.seek(12100);
check('R10', '换试块后探头走后一块的帧', at12.specimen_id === specB && at12.x_mm === -20 && at12.y_mm === 8);
const trails = at12.trails;
check('R11', '轨迹按试块累积（前一块 3 点含初始运动，后一块 2 点）',
  trails[specA]?.length === 2 && trails[specB]?.length === 2
  && trails[specA][1][0] === 12 && trails[specB][1][0] === -20);
check('R12', '事件标记：校准完成 / DAC / 检出 / 提交 / 恢复 / 错误',
  rp.markers.map((m) => m.mark).join(',') === 'calib,find,dac,submit,restore,error');
const end = rp.seek(99999);
check('R13', '超出时长钳到 active_ms / 末条', end.t_ms === 25000);
const marks = rp.markers.filter((m) => m.mark === 'calib');
const fromKey = rp.seek(marks[0].t_ms);
check('R14', '点校准完成标记：位置仍为当时帧，增益已到 46', fromKey.x_mm === 12 && fromKey.inst.gain_dB === 46);
check('R15', '时长与 session_id', rp.duration === 25000 && rp.session_id === 's-test');

for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.id}  ${r.desc}${r.detail ? `  [${r.detail}]` : ''}`);
const fail = results.filter((r) => !r.ok);
console.log(fail.length ? `FAIL ${fail.length}` : `PASS ${results.length}/${results.length}`);
process.exit(fail.length ? 1 : 0);
