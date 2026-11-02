// M2 webapp contract checks: no teaching text in code, UI keys / events / part IDs resolve against the JSON sources.
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const app = join(here, '..');
const proj = join(app, '..');
const readJson = (p) => JSON.parse(readFileSync(join(proj, p), 'utf8'));
const UI = readJson('knowledge/ui_strings.json');
const parts = readJson('knowledge/probe_parts.json').parts;
const contract = readJson('contracts/events_contract.json');

const results = [];
const check = (id, desc, ok, detail = '') => results.push({ id, desc, status: ok ? 'PASS' : 'FAIL', detail });

const srcFiles = readdirSync(join(app, 'src')).filter((f) => /\.(js|css)$/.test(f)).map((f) => join(app, 'src', f));
const angleDir = join(app, 'src', 'angle');
if (existsSync(angleDir)) srcFiles.push(...readdirSync(angleDir).filter((f) => /\.(js|css)$/.test(f)).map((f) => join(angleDir, f)));
srcFiles.push(join(app, 'index.html'));
const han = /\p{Script=Han}/u;
const hanHits = [];
for (const f of srcFiles) {
  readFileSync(f, 'utf8').split(/\r?\n/).forEach((line, i) => {
    if (han.test(line)) hanHits.push(`${f.split(/[\\/]/).pop()}:${i + 1}`);
  });
}
check('W1', 'webapp 源码与 index.html 不含中文教学文字（全部来自 knowledge/*.json）', hanHits.length === 0, hanHits.join(', '));

const main = readFileSync(join(app, 'src', 'main.js'), 'utf8');
const code = [main, ...readdirSync(join(app, 'src')).filter((f) => f.endsWith('.js') && f !== 'main.js').map((f) => readFileSync(join(app, 'src', f), 'utf8'))].join('\n');
const uiRefs = [...code.matchAll(/\bUI\.([a-z_]+)\.([a-z_]+)\b/g)].map((m) => [m[1], m[2]]);
const missing = uiRefs.filter(([a, b]) => !(UI[a] && b in UI[a])).map(([a, b]) => `${a}.${b}`);
const dynamic = [...code.matchAll(/\bUI\.([a-z_]+)\[/g)].map((m) => m[1]).filter((a) => !UI[a]);
check('W2', 'main.js 引用的 UI 键均存在于 ui_strings.json', missing.length === 0 && dynamic.length === 0, [...missing, ...dynamic].join(', '));

const LIVE = ['M2', 'M3', 'M3b', 'M4', 'M5.2', 'M5.3', 'M5.4', 'M5.5', 'M6.1', 'M6.2', 'M6.3', 'M6.4', 'M6.5', 'M7.1', 'M7.2', 'M7.4', 'M8.1', 'M8.2', 'M8.3', 'M8.5', 'M9.2', 'M9.3', 'M10.1', 'M11'];
const m2 = new Set(contract.events.filter((e) => LIVE.includes(e.milestone)).map((e) => e.name));
const emitted = [...new Set([...code.matchAll(/emit\('([a-z_:]+)'/g)].map((m) => m[1]))];
const notM2 = emitted.filter((e) => !m2.has(e));
const unused = [...m2].filter((e) => !emitted.includes(e));
// Require event names to remain contract-auditable string literals. Computed
// names must fail instead of silently escaping the registry-name check above.
const computedEmits = [];
for (const f of srcFiles.filter((path) => path.endsWith('.js'))) {
  const source = readFileSync(f, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ' '))
    .replace(/^[ \t]*\/\/.*$/gm, '');
  // physics.js locally calls a numeric pulse renderer `emit(t0, v, cyc, tau)`;
  // it is a different binding from the contract event dispatcher. Only its
  // numeric calls are classified separately; named/computed event calls fail.
  const localPulseEmitter = /const emit = \(t0, v, cyc, tau\) =>/.test(source);
  for (const match of source.matchAll(/\bemit\s*\(/g)) {
    if (/\bfunction\s+$/.test(source.slice(Math.max(0, match.index - 30), match.index))) continue;
    const argument = source.slice(match.index + match[0].length).trimStart();
    if (localPulseEmitter && /^(?:\d+(?:\.\d+)?|\.\d+)\s*,/.test(argument)) continue;
    if (!/^(['"])[a-z_:]+\1\s*[,)]/.test(argument)) {
      computedEmits.push(`${f.split(/[\\/]/).pop()}:${source.slice(0, match.index).split('\n').length}`);
    }
  }
}
check('W3', `emit 的事件全部属于 events_contract 中已上线阶段（${LIVE.join(' / ')}）；禁止未审计的计算式事件名`, notM2.length === 0 && computedEmits.length === 0,
  [...notM2, ...computedEmits.map((location) => `computed event: ${location}`)].join(', '));
check('W4', `events_contract 中已上线阶段（${LIVE.join(' / ')}）事件全部实现`, unused.length === 0, unused.join(', '));

const idsInCode = [...new Set([...code.matchAll(/'(probe__[a-z_]+)'/g)].map((m) => m[1]))];
const known = new Set(contract.gltf_contract.required_node_names);
const badIds = idsInCode.filter((i) => !known.has(i));
check('W5', 'main.js 中出现的部件 ID 均为冻结 ID', badIds.length === 0, badIds.join(', '));

const need = ['definition', 'design_driver', 'principles', 'performance_impacts', 'removal_effects', 'formulas', 'misconceptions'];
check('W6', '知识卡七个标签页与 ui_strings.card_tabs 一一对应', JSON.stringify(Object.keys(UI.card_tabs)) === JSON.stringify(need), Object.keys(UI.card_tabs).join(','));
const badParts = parts.filter((p) => need.some((k) => !(k in p))).map((p) => p.id);
check('W7', '12 个部件知识条目具备七个标签页全部字段', parts.length === 12 && badParts.length === 0, badParts.join(', '));

const cc = readJson('knowledge/classroom_cards.json').cards;
const ccIds = cc.map((c) => c.id).sort();
const ccOk = JSON.stringify(ccIds) === JSON.stringify(parts.map((p) => p.id).sort())
  && cc.every((c) => c.why_core && c.without_core)
  && JSON.stringify(Object.keys(UI.study_modes || {})) === JSON.stringify(['self', 'classroom']);
check('W10', '课堂卡片覆盖 12 个部件，自学 / 课堂切换文字来自 ui_strings', ccOk, ccIds.join(','));

const scenes = readJson('knowledge/scenes.json');
const frozen = new Set(contract.gltf_contract.required_node_names);
const chainIds = Object.values(UI.chains || {}).flatMap((c) => c.ids);
const navOk = [['equipment', 'principle', 'inspection', 'practice', 'assessment', 'standard'], ['equipment', 'principle', 'inspection', 'practice', 'assessment', 'task', 'standard']]
  .some((k) => JSON.stringify(Object.keys(UI.modes || {})) === JSON.stringify(k))
  && UI.modes.assessment === '实训考核' && (!UI.modes.task || UI.modes.task === '现场任务')
  && JSON.stringify(Object.keys(UI.equipment_views || {})) === JSON.stringify(['equipment', 'probe'])
  && JSON.stringify(Object.keys(UI.probe_views || {})) === JSON.stringify(['exterior', 'cutaway', 'exploded'])
  && JSON.stringify(Object.keys(UI.principle_views || {})) === JSON.stringify(['scenes', 'parts', 'lab'])
  && Object.values(UI.chains || {}).every((c) => /^#[0-9a-f]{6}$/i.test(c.color))
  && chainIds.every((i) => frozen.has(i)) && new Set(chainIds).size === chainIds.length
  && scenes.scenes.every((s) => frozen.has(s.part_id) && s.steps.every((st) => st.camera in scenes.cameras && (!st.chain_focus || st.chain_focus in UI.chains) && (st.labels || []).every((l) => frozen.has(l))))
  && UI.modes.principle === '原理' && UI.modes.practice === '实训工艺' && UI.equipment_views.probe === '直探头'
  && /PR_MODES/.test(main) && /topModeOf\(/.test(main) && /principle_views/.test(main) && /probe_views/.test(main)
  && ['prev', 'play', 'pause', 'next', 'replay', 'back', 'scenes'].every((k) => UI.player && k in UI.player);
check('W11', 'M7.5 导航：仪器设备（工作台 / 直探头：外观·剖切·爆炸）｜原理（换能原理 / 部件作用 / 参数设计）｜检测系统｜实训工艺｜实训考核（M8.1）｜现场任务（M10.1）｜标准；三链配色与场景文字来自 JSON', navOk);

const removal = scenes.scenes.filter((s) => s.kind === 'removal');
const m3bOk = ['matching_layer', 'magnify'].every((k) => UI.controls && k in UI.controls)
  && 'demo' in UI.player && 'remove' in (UI.why_buttons || {})
  && ['quarter_wave', 'reflect_1', 'reflect_2', 'sum', 'qw_delta'].every((k) => k in UI.scene_labels)
  && removal.length > 0 && removal.every((s) => s.steps.every((st) => frozen.has(st.remove) && st.anim === 'anim__removal_chain'))
  && scenes.scenes.some((s) => s.steps.some((st) => st.quarter_wave));
check('W12', 'M3b 匹配层 / 薄层放大控件、λ/4 演示、“如果去掉它”场景文字与部件均可解析', m3bOk, `removal scenes: ${removal.length}`);

const lab = scenes.teaching_settings.lab || {};
const labOk = ['title', 'frequency', 'diameter', 'damping', 'derived', 'lambda', 'near_field', 'half_angle', 'thickness', 'ascan', 'reset'].every((k) => k in UI.lab)
  && JSON.stringify(Object.keys(UI.lab.damping_levels || {})) === JSON.stringify(['low', 'medium', 'high'])
  && lab.f_min_MHz < lab.f_max_MHz && lab.D_min_mm < lab.D_max_mm
  && ['low', 'medium', 'high'].every((k) => typeof lab.damping_cycles?.[k] === 'number')
  && (lab.formulas || []).every((r) => /^probe__[a-z_]+\.formulas\[\d+\]$/.test(r))
  && /lab:frequency|lab:diameter|lab:damping/.test(code) && /setBeamParams/.test(code);
check('W13', 'M4 设计实验室：f / D / 阻尼控件文字、联动公式与声束参数接口齐全', labOk);

const inst = readJson('contracts/instrument_manifest.json');
const wf = readJson('contracts/waveform_rules.json');
const insp = readJson('knowledge/inspection.json');
const IN = UI.inspection || {};
const m5DataOk = ['mode', 'title', 'pulse', 'continuous', 'pause', 'reset', 'gain', 'range', 'velocity', 'display', 'coupling', 'damping', 'defect_depth', 'ascan', 'slow_motion', 'amplitude_model'].every((k) => k in IN)
  && JSON.stringify(Object.keys(IN.coupling_levels || {})) === JSON.stringify(wf.controls.coupling.options)
  && JSON.stringify(Object.keys(IN.display_modes || {})) === JSON.stringify(wf.controls.display.options)
  && JSON.stringify(Object.keys(insp.phases)) === JSON.stringify(wf.animation.phases.slice(1))
  && insp.scenarios.length === 4 && insp.experiments.length === 4
  && ['system', 'screen'].every((c) => c in scenes.cameras);
check('W14', 'M5 数据冻结：仪器清单 / 波形规则 / 检测知识可解析，ui_strings.inspection 键与选项齐全', m5DataOk);

const m5All = contract.events.filter((e) => /^M5\.[2345]$/.test(e.milestone));
const m5Early = contract.events.filter((e) => /^M5\./.test(e.milestone) && !LIVE.includes(e.milestone) && emitted.includes(e.name)).map((e) => e.name);
const m5Ok = m5All.length >= 18 && m5All.every((e) => /^(inspection|instrument):[a-z_]+$/.test(e.name))
  && contract.events.find((e) => e.name === 'quiz:answer')?.milestone === 'M8'
  && ['slow_motion', 'amplitude_model'].every((b) => contract.badge_rules.some((r) => r.badge === b))
  && m5Early.length === 0;
check('W15', 'M5 事件按 M5.2 / M5.3 / M5.4 / M5.5 分阶段登记；未上线阶段的事件不 emit；测验在 M8', m5Ok, m5Early.join(', '));

const spec = readJson('contracts/specimens_manifest.json');
const prk = readJson('knowledge/practice.json');
const std = readJson('contracts/standard_nbt47013_3.json');
const m6All = contract.events.filter((e) => /^M6\.[1-5]$/.test(e.milestone));
const m6Early = m6All.filter((e) => !LIVE.includes(e.milestone) && emitted.includes(e.name)).map((e) => e.name);
const specIds = Object.keys(spec.specimens);
const m6Ok = m6All.length === 20 && m6All.every((e) => /^(practice|instrument):[a-z_]+$/.test(e.name))
  && m6Early.length === 0
  && UI.modes.practice && wf.practice?.freeze_stage === 'M6.0'
  && specIds.length === 3 && specIds.every((id) => prk.specimens[id]?.header && spec.gltf_contract.required_node_names.includes(id))
  && Object.keys(spec.runtime_specimens || {}).every((id) => prk.specimens[id]?.header && !spec.gltf_contract.required_node_names.includes(id))
  && prk.steps.map((s) => s.id).join() === 'calibrate,dac,sensitivity,scan,quantify,evaluate'
  && JSON.stringify(inst.keys.active_in_practice) === JSON.stringify(inst.keys.inactive_in_v1);
check('W22', 'M6.0 数据冻结：试块清单 / 实训知识 / 波形规则 practice / M6 事件分阶段登记且未上线不 emit', m6Ok, m6Early.join(', '));

const pracSrc = readFileSync(join(app, 'src', 'practice.js'), 'utf8');
const mm = readJson('contracts/model_manifest.json');
const m61Ok = /specimens_generic\.glb\?url/.test(main) && /createPractice\(/.test(main)
  && ['practice:enter', 'practice:specimen', 'practice:probe_move'].every((n) => emitted.includes(n))
  && mm.states.practice && mm.states.practice.clip_plane === null && mm.states.practice.hidden_ids?.includes('probe__steel_block')
  && 'practice' in scenes.cameras && /probe_limits/.test(pracSrc) && /housing_outer_diameter_mm/.test(pracSrc)
  && /system_placement/.test(pracSrc) && /setProbeAnchor\(/.test(main) && /clipPlane\.normal\.dot\(probeOffset\)/.test(main)
  && ['section', 'section_along', 'section_across', 'section_off', 'probe', 'x', 'y'].every((k) => prk.labels[k]);
check('W23', 'M6.1 检测实训：试块 GLB 接入、模式状态（隐藏钢试件、探头不剖切）、探头拖动限位、电缆跟随、剖切与试块切换事件', m61Ok);

const cardIds = new Set(insp.cards.map((c) => c.id));
const instIds = inst.parts.map((p) => p.id);
const sysIds = inst.system_parts.map((p) => p.id);
const instOk = instIds.every((i) => i.startsWith('instrument__')) && sysIds.every((i) => i.startsWith('system__'))
  && [...inst.parts, ...inst.system_parts].every((p) => !p.card || cardIds.has(p.card))
  && JSON.stringify([...inst.gltf_contract.required_node_names].sort()) === JSON.stringify(['instrument_root', ...instIds].sort())
  && Object.values(insp.phases).every((p) => p.chain_focus in UI.chains && p.highlight.every((h) => frozen.has(h) || instIds.includes(h) || sysIds.includes(h)));
check('W16', '仪器 / 电缆部件 ID 规范，知识卡与阶段高亮均可解析', instOk);

const { createWaveform } = await import(new URL('../src/waveform.js', import.meta.url));
const wv = createWaveform({ rules: wf, manifest: readJson('contracts/model_manifest.json'), dampingCycles: scenes.teaching_settings.lab.damping_cycles, scenarios: insp.scenarios });
const AV = wf.acceptance_values;
const base = { scene: 'plate_clean', ...Object.fromEntries(Object.entries(wf.controls).map(([k, v]) => [k, v.default])) };
const b1 = (st) => wv.echoes(st).find((e) => e.id === 'B1');
const fbh = wv.echoes({ ...base, scene: 'flat_bottom_hole' }).find((e) => e.type === 'defect');
const fr = wv.synth(base, { noise: false });
const iB1 = Math.round((b1(base).t + wv.pulseUs(base.damping) / 2) / fr.tWin * fr.columns);
const peakB1 = Math.max(...fr.hi.slice(iB1 - 8, iB1 + 8));
const close = (a, b, tol) => Math.abs(a - b) <= tol;
const waveOk = close(b1(base).t, AV.t_B1_us, 0.002) && close(fbh.t, AV.t_F_default_us, 0.002)
  && close(b1(base).pct, AV.B1_percent_at_default, 0.05) && close(peakB1, AV.B1_percent_at_default, 0.8)
  && close(b1({ ...base, gain_dB: base.gain_dB + 6 }).pct / b1(base).pct, AV.gain_plus_6dB_ratio, 0.002)
  && close(b1({ ...base, velocity_m_s: 3000 }).x_mm, AV.velocity_3000_B1_display_mm, 0.01)
  && b1({ ...base, coupling: 'air_gap', gain_dB: 80 }).pct < AV.air_gap_B1_percent_at_80dB_max;
const wiringOk = /createInstrument\(/.test(main) && /drawScope\(pc,/.test(main) && /updateScreen\(/.test(main) && /inspection:\s*scenesDoc\.cameras\.system/.test(main);
check('W17', 'M5.1 波形引擎数值与验收值一致；检测系统模式接入仪器模型、电缆与屏幕联动绘制', waveOk && wiringOk,
  `B1 ${b1(base).pct.toFixed(2)}% / peak ${peakB1.toFixed(2)}%, tF ${fbh.t.toFixed(3)} us`);

const { createInspection } = await import(new URL('../src/inspection.js', import.meta.url));
const ic = createInspection({ rules: wf, wave: wv, scenarios: insp.scenarios });
const S0 = ic.start;
const at = (tc) => { ic.seek(tc); return ic.view(base); };
const tB1 = b1(base).t;
const vPre = at(S0.PIEZO_TX + 0.1);
const vHit = at(S0.REFLECTION + 0.01);
const vRet = at(S0.PIEZO_RX - 1e-4);
const vRx = at(S0.INSTRUMENT_RX + 0.2);
const vUp = at(S0.ASCAN_UPDATE + 1e-4);
const vEnd = at(ic.total);
const machineOk = JSON.stringify(ic.phases) === JSON.stringify(wf.animation.phases.slice(1))
  && vPre.sweepUs === null && vPre.revealUs < 0
  && close(vHit.tPhys, tB1 / 2, 1e-9) && vHit.front === 1
  && close(vRet.tPhys, tB1, 0.01) && vRet.back < 0.001
  && vRx.sweepUs === tB1 && vRx.revealUs < tB1
  && vUp.revealUs >= tB1 + wv.pulseUs(base.damping)
  && vEnd.revealUs >= vEnd.tWin - 0.01
  && /inspection\.js/.test(main) && /physics\.drive\(/.test(main) && /setSignal\(/.test(main);
check('W18', 'M5.2 发射—接收状态机：物理时钟、扫描线、B1 在接收处理后显示、波前到底面与 t_B1/2 同刻', machineOk,
  `hit t=${vHit.tPhys?.toFixed(3)} us, B1 held reveal ${vRx.revealUs.toFixed(2)} < ${tB1.toFixed(2)}`);

const lk = { ...base, range_mm: 200 };
const echo = (st, id) => wv.echoes(st).find((e) => e.id === id);
const peakAt = (st, id) => {
  const f = wv.synth(st, { noise: false });
  const e = f.echoes.find((x) => x.id === id);
  const c = Math.round(((e.t + e.len / 2) / f.tWin) * f.columns);
  return Math.max(...f.hi.slice(c - 8, c + 8));
};
const width = (st) => {
  const f = wv.synth({ ...st, range_mm: 50 }, { noise: false });
  let n = 0;
  while (n < f.columns && f.hi[n] > 5) n++;
  return (n / f.columns) * f.tWin;
};
const gainRatio = peakAt({ ...lk, gain_dB: 36 }, 'B2') / peakAt(lk, 'B2');
const rangeOk = wf.controls.range_mm.presets.every((r) => {
  const e = echo({ ...lk, range_mm: r }, 'B1');
  if (r < 50) return !e;
  return e ? close(e.t, tB1, 1e-9) && close(e.x_mm, 50, 1e-6) : r === 50;
}) && close(wv.windowUs({ ...lk, range_mm: 100 }) * 2, wv.windowUs(lk), 1e-9);
const velOk = close(echo({ ...lk, velocity_m_s: 3000 }, 'B1').t, tB1, 1e-9)
  && close(echo({ ...lk, velocity_m_s: 3000 }, 'B1').x_mm, (3000 / 5900) * 50, 1e-6);
const rfFr = wv.synth({ ...lk, display: 'rf' }, { noise: false });
const dispOk = !rfFr.rect && Math.min(...rfFr.lo) < -50 && fr.rect && Math.min(...fr.hi) >= 0;
const airPct = echo({ ...lk, coupling: 'air_gap' }, 'B1').pct;
const wRatio = width({ ...lk, damping: 'low' }) / width({ ...lk, damping: 'high' });
const coupOrder = ['good', 'medium', 'poor', 'air_gap'].map((c) => echo({ ...lk, coupling: c }, 'B1').pct);
const linkWiring = Object.values(contract.events.filter((e) => e.milestone === 'M5.3')).every((e) => main.includes(`'${e.name}'`))
  && /function setInsp\(/.test(main) && /applyInspCoupling\(/.test(main) && /inspControls\(\)/.test(main);
check('W19', 'M5.3 参数联动：增益 +6 dB 非饱和波高 ×2、范围只改刻度、声速只改深度、频率 / 晶片符合 κ²、阻尼改脉冲宽度',
  close(gainRatio, 2, 0.04) && rangeOk && velOk && dispOk && airPct < 2
  && coupOrder.every((p, i) => i === 0 || p < coupOrder[i - 1]) && wRatio > 4 && linkWiring,
  `+6 dB ×${gainRatio.toFixed(3)}, air ${airPct.toExponential(1)}%, main bang low/high ${wRatio.toFixed(2)}`);

const fbhSt = (d, extra = {}) => ({ ...base, scene: 'flat_bottom_hole', defect_depth_mm: d, ...extra });
const defOf = (st) => wv.echoes(st).find((e) => e.type === 'defect');
const depths = [5, 15, 25, 35, 45];
const fbhOk = depths.every((d) => close(defOf(fbhSt(d)).t, (2 * d / 5900) * 1e3, 1e-9) && close(defOf(fbhSt(d)).x_mm, d, 1e-6)
  && defOf(fbhSt(d)).t < tB1);
// Near-surface defect (poor_backing, d 8 mm): separable from the main bang only when the ring-down is short.
const nsSt = (damping) => ({ ...base, scene: 'poor_backing', range_mm: 25, damping, gain_dB: 30 });
const separated = (st) => {
  const f = wv.synth(st, { noise: false });
  const e = f.echoes.find((x) => x.type === 'defect');
  const cF = Math.round(((e.t + e.len / 2) / f.tWin) * f.columns);
  const c0 = Math.round((f.echoes[0].len * 0.5 / f.tWin) * f.columns);
  const w = Math.max(1, Math.floor((1 / wv.f / f.tWin) * f.columns / 2));
  const env = Array.from(f.hi, (_, i) => Math.max(...f.hi.slice(Math.max(0, i - w), i + w + 1)));
  const valley = Math.min(...env.slice(c0, cF + 1));
  return { valley, peak: env[cF], ok: valley < 0.5 * env[cF] };
};
const nsHigh = separated(nsSt('high'));
const nsLow = separated(nsSt('low'));
const { inMainBang } = await import(new URL('../src/waveform.js', import.meta.url));
const maskOk = ['high', 'medium', 'low'].map((lv) => {
  const f = wv.synth(nsSt(lv), { noise: false });
  return inMainBang(f.echoes.find((x) => x.type === 'defect'), f);
}).join() === 'false,false,true';
const vF = createInspection({ rules: wf, wave: wv, scenarios: insp.scenarios });
const fbhTiming = depths.every((d) => {
  const s = fbhSt(d);
  const v0 = vF.view(s);
  vF.seek(v0.tcF);
  const v = vF.view(s);
  return close(v.tPhys, v0.tF, 1e-6) && (v.phase === 'SOUND_FORWARD' || v.phase === 'REFLECTION' || v.phase === 'SOUND_RETURN');
});
const theoryLearning = readJson('knowledge/theory-learning.json');
const m54Wiring = /function setInspScene\(/.test(main) && /function runExperiment\(/.test(main) && /theoryDoc\.experiments/.test(main)
  && /fbhWall/.test(main) && /defect:\s*v\.tcF/.test(main) && /SCATTER_FRAG/.test(readFileSync(join(app, 'src', 'physics.js'), 'utf8'))
  && insp.experiments.every((e) => insp.scenarios.some((s) => s.id === e.scenario))
  && theoryLearning.experiments.length === 6 && theoryLearning.experiments.every((e) => insp.scenarios.some((s) => s.id === e.scenario))
  && insp.scenarios.every((s) => s.adjustable.every((k) => k in wf.controls) && s.concepts.every((c) => c in insp.concepts));
check('W20', 'M5.4 场景与实验：F 位于 2d/c 且早于 B1、随 d 线性移动、近表面缺陷高阻尼可分辨而低阻尼被始波掩盖；3D 缺陷回波到达时刻与 t_F 同刻；场景 / 实验接线',
  fbhOk && nsHigh.ok && !nsLow.ok && maskOk && fbhTiming && m54Wiring,
  `near-surface valley high ${nsHigh.valley.toFixed(0)}/${nsHigh.peak.toFixed(0)}, low ${nsLow.valley.toFixed(0)}/${nsLow.peak.toFixed(0)}`);

const { gateReading } = await import(new URL('../src/waveform.js', import.meta.url));
const scDef = (id) => ({ ...base, scene: id, ...insp.scenarios.find((s) => s.id === id).defaults });
const gOf = (st) => ({ on: st.gate_on, start_mm: st.gate_start_mm, width_mm: st.gate_width_mm, threshold_pct: st.gate_threshold_pct });
const gr = (st, noise = false) => { const f = wv.synth(st, { noise, seed: 7 }); return gateReading(f, gOf(st)); };
const gPlate = gr(scDef('plate_clean'));
const gFbh = gr(scDef('flat_bottom_hole'));
const gHigh = gr({ ...scDef('flat_bottom_hole'), gate_threshold_pct: 50 });
const gVel = gr({ ...scDef('plate_clean'), velocity_m_s: 3000, gate_start_mm: 20, gate_width_mm: 10 });
const gAir = gr({ ...scDef('plate_clean'), coupling: 'air_gap', gain_dB: 60 }, true);
const gOff = gr({ ...scDef('plate_clean'), gate_on: false });
const gNs = gr({ ...scDef('poor_backing'), damping: 'high' });
const gNsLow = gr(scDef('poor_backing'));
const autoG = +(Math.round((30 + 20 * Math.log10(wf.auto_gain.target_percent / gFbh.top.pct)) / wf.controls.gain_dB.step) * wf.controls.gain_dB.step).toFixed(1);
const autoPct = gr({ ...scDef('flat_bottom_hole'), gain_dB: autoG }).echo?.pct ?? 0;
const gateOk = close(gPlate.s, 50, 1e-6) && close(gPlate.h, 80, 1) && close(gFbh.s, 25, 1e-6) && gFbh.echo.type === 'defect'
  && gHigh.s == null && close(gVel.s, 50 * 3000 / 5900, 1e-6) && gVel.echo.id === 'B1' && gAir.echo == null && gAir.s != null && gOff == null
  && close(gNs.s, 8, 1e-6) && gNsLow.echo == null && close(autoPct, wf.auto_gain.target_percent, wf.auto_gain.tolerance_percent);
const K = inst.keys;
const keyIds = [...K.grid.flat(), ...Object.keys(K.dpad), ...K.soft];
const PK = insp.panel || {};
const keyText = JSON.stringify(Object.keys(PK.keys || {}).sort()) === JSON.stringify([...keyIds].sort())
  && keyIds.every((k) => PK.keys[k].name) && K.inactive_in_v1.every((k) => keyIds.includes(k))
  && ['start', 'width', 'threshold', 's', 'h', 'on', 'off', 'title'].every((k) => k in (PK.gate || {}))
  && ['no_echo', 'inactive', 'frozen'].every((k) => k in (PK.messages || {})) && PK.encoder && PK.auto_gain && PK.gain_step
  && 'panel' in (IN.cameras || {}) && 'instrument_panel' in scenes.cameras;
const handled = [...K.grid.flat(), ...Object.keys(K.dpad)].filter((k) => !K.inactive_in_v1.includes(k)).every((k) => main.includes(`'${k}'`));
const panelWiring = handled && /instrument\.labelKeys\(/.test(main) && /instrument\.pickControl\(/.test(main) && /instrument\.turnEncoder\(/.test(main)
  && /softKeys\(\)/.test(main) && /gateReading\(/.test(main) && /frozenFrame/.test(main) && /'wheel'/.test(main)
  && /function pressKey\(/.test(readFileSync(join(app, 'src', 'instrument.js'), 'utf8'))
  && ['gain_step_dB', 'gate_on', 'gate_start_mm', 'gate_width_mm', 'gate_threshold_pct'].every((k) => k in wf.controls)
  && wf.controls.gain_step_dB.options.includes(wf.controls.gain_step_dB.default) && wf.controls.gain_dB.step === 0.1;
check('W21', 'M5.5 仪器面板：闸门读数（峰值法、按显示深度、阈值 / 起点 / 宽度 / 始波掩盖）、自动增益到 80 %±1 %、按键文字与功能接线、旋钮与冻结',
  gateOk && keyText && panelWiring,
  `${gateOk ? '' : 'gate✗ '}${keyText ? '' : 'text✗ '}${panelWiring ? '' : 'wiring✗ '}plate S ${gPlate.s} H ${gPlate.h.toFixed(1)}, FBH S ${gFbh.s} H ${gFbh.h.toFixed(1)}, auto ${autoG} dB -> ${autoPct.toFixed(1)}%, near-surface S ${gNs.s}`);

// M6.2 practice engine vs tools/qa_m6_rules.py acceptance values.
const wp = createWaveform({ rules: wf, manifest: readJson('contracts/model_manifest.json'), dampingCycles: scenes.teaching_settings.lab.damping_cycles, scenarios: insp.scenarios, specimens: spec });
const PAV = wf.practice.acceptance_values;
const G_REF = wf.amplitude.gain.G_ref_dB;
const lg = (x) => 20 * Math.log10(x);
const m5Same = insp.scenarios.every((s) => {
  const st = { ...base, scene: s.id, ...s.defaults };
  return JSON.stringify(wv.echoes(st)) === JSON.stringify(wp.echoes(st));
});
const specOf = (id) => spec.specimens[id] || spec.runtime_specimens?.[id];
const pst = (id, x, y, extra = {}) => ({ ...base, range_mm: 100, velocity_m_s: 5900, zero_us: 0, thickness_mm: (specOf(id).dims.thickness || specOf(id).dims.thickness_T).value, defects: [], specimen_id: id, probe_x_mm: x, probe_y_mm: y, ...extra });
const ech = (st) => wp.echoes(st);
const byId = (st, id, k = null) => ech(st).find((e) => e.id === id && (k == null || e.k === k));
const cskU = pst('specimen__csk_ia', 0, 0, { velocity_m_s: wf.practice.controls.velocity_m_s_initial });
const cskC = pst('specimen__csk_ia', 0, 0, { zero_us: wf.practice.probe_delay.true_delay_us });
const calOk = Math.abs(byId(cskU, 'B1').x_mm - 26.62) < 0.01 && Math.abs(byId(cskU, 'B2').x_mm - 52.05) < 0.01
  && Math.abs(byId(cskC, 'B1').x_mm - 25) < 1e-6 && Math.abs(byId(cskC, 'B2').x_mm - 50) < 1e-6;
const holesCb = spec.specimens.specimen__cbii_2.holes;
const dacPts = holesCb.map((h) => [h.S_mm, G_REF - lg(byId(pst('specimen__cbii_2', h.x_mm, h.y_mm), h.id).raw)]);
const gDac = (s) => {
  for (let i = 0; i < dacPts.length - 1; i++) {
    const [s0, g0] = dacPts[i];
    const [s1, g1] = dacPts[i + 1];
    if (s >= s0 - 1e-9 && s <= s1 + 1e-9) return g0 + ((s - s0) / (s1 - s0)) * (g1 - g0);
  }
  return null;
};
const dacOk = dacPts.every(([s, g]) => Math.abs(g - PAV.dac_G_dB[String(s)]) < 0.01);
const cross = Math.max(...holesCb.map((h) => {
  const st = pst('specimen__cbii_2', h.x_mm, h.y_mm);
  const own = byId(st, h.id).raw;
  return Math.max(...holesCb.filter((o) => o.id !== h.id).map((o) => lg(byId(st, o.id).raw / own)));
}));
const G_BASE = dacPts[dacPts.length - 1][1];
const plateDefs = Object.fromEntries(spec.specimens.specimen__plate_50.defects.map((d) => [d.id, d]));
const plate = (x, y) => pst('specimen__plate_50', x, y, { gain_dB: G_BASE, range_mm: 100 });
const f1dac = (st) => {
  let v = null;
  for (const e of ech(st)) if (e.type === 'defect' && e.k === 1 && e.raw > 0) {
    const g = gDac(e.depth_mm);
    if (g != null) v = Math.max(v ?? -Infinity, lg(e.raw) + g - G_REF);
  }
  return v;
};
const trueB1 = (st) => byId(st, 'B1').pct;
const flagged = (x, y) => { const st = plate(x, y); const f = f1dac(st); return (f != null && f > 0) || trueB1(st) < 50; };
const [ix, iy] = plateDefs.INC_01.centre_mm;
const [lx, ly] = plateDefs.LAM_01.centre_mm;
const [vx, vy] = plateDefs.VCR_01.centre_mm;
const incEq = f1dac(plate(ix, iy));
const lamF = f1dac(plate(lx, ly));
const lamB1 = trueB1(plate(lx, ly));
const cleanB1 = trueB1(plate(-120, 80));
const vcrDb = lg(trueB1(plate(vx, vy)) / cleanB1);
const lamF2 = byId(plate(lx, ly), 'LAM_01', 2);
const edge = (cx, cy, ux, uy) => {
  let lo = 0;
  let hi = 40;
  while (hi - lo > 0.05) { const m = (lo + hi) / 2; if (flagged(cx + ux * m, cy + uy * m)) lo = m; else hi = m; }
  return (lo + hi) / 2;
};
const contour = (cx, cy) => ({ x: edge(cx, cy, 1, 0) + edge(cx, cy, -1, 0), y: edge(cx, cy, 0, 1) + edge(cx, cy, 0, -1) });
const cLam = contour(lx, ly);
const cInc = contour(ix, iy);
const engOk = m5Same && calOk && dacOk && cross < -40
  && Math.abs(incEq - PAV.INC_01_equivalent_dB) < 0.01 && Math.abs(lamF - PAV.LAM_01_F1_full_minus_dac_dB) < 0.01 && lamB1 < 50
  && Math.abs(cleanB1 - PAV.clean_B1_at_G_base_percent) < 0.1 && Math.abs(vcrDb) < PAV.VCR_01_B1_change_dB_max && !flagged(vx, vy)
  && !!lamF2 && Math.abs(lamF2.x_mm - byId(plate(lx, ly), 'B1').x_mm) < 1e-6
  && Math.abs(cLam.x - PAV.LAM_01_reference_mm.x) < 0.05 && Math.abs(cLam.y - PAV.LAM_01_reference_mm.y) < 0.05
  && Math.abs(cInc.x - PAV.INC_01_reference_mm.x) < 0.05 && Math.abs(cInc.y - PAV.INC_01_reference_mm.y) < 0.05
  && /specimens: specMan/.test(main) && /probe_x_mm = c\.x/.test(main);
check('W24', 'M6.2 实训引擎：M5 场景不变；探头延迟与未校准读数；平底孔 / 夹杂横向声束因子；分层覆盖、多次回波与底波遮挡；垂直裂纹无回波；与 qa_m6_rules 验收值一致', engOk,
  `M5 ${m5Same ? 'same' : 'DIFF'}; CSK B1 ${byId(cskU, 'B1').x_mm.toFixed(2)} / B2 ${byId(cskU, 'B2').x_mm.toFixed(2)}; DAC ${dacPts.map(([, g]) => g.toFixed(2)).join(' / ')} dB, cross ${cross.toFixed(1)} dB; `
  + `INC ${incEq.toFixed(2)} dB; LAM F1-DAC ${lamF.toFixed(2)} dB B1 ${lamB1.toFixed(1)}%; clean B1 ${cleanB1.toFixed(1)}%; VCR ${vcrDb.toFixed(2)} dB; `
  + `contour LAM ${cLam.x.toFixed(2)}x${cLam.y.toFixed(2)}, INC ${cInc.x.toFixed(2)}x${cInc.y.toFixed(2)}`);

const SP = wf.practice.step_presets;
const stepIds = prk.steps.map((s) => s.id);
const gainOf = (src) => (src === 'default' ? wf.controls.gain_dB.default : src.split('.').reduce((o, k) => o?.[k], PAV));
const presetOk = stepIds.every((id) => SP[id] && specOf(SP[id].specimen) && Number.isFinite(gainOf(SP[id].gain)))
  && SP.calibrate.calibrated === false && stepIds.slice(1).every((id) => SP[id].calibrated === true)
  && SP.dac.specimen === wf.practice.dac.specimen && SP.calibrate.specimen === wf.practice.calibration.specimen;
const cs = wf.practice.calibration.calibrated_state;
const csk = spec.specimens.specimen__csk_ia.calibration?.probe_start || { x_mm: 0, y_mm: 0 };
const calPre = pst('specimen__csk_ia', csk.x_mm, csk.y_mm, { velocity_m_s: cs.velocity_m_s, zero_us: cs.zero_us });
const calPreOk = Math.abs(byId(calPre, 'B1').x_mm - 25) < 0.01 && Math.abs(byId(calPre, 'B2').x_mm - 50) < 0.01;
const hitPct = (id, echo) => {
  const p = SP[id];
  const st = pst(p.specimen, p.probe_mm[0], p.probe_mm[1], { velocity_m_s: cs.velocity_m_s, zero_us: cs.zero_us, gain_dB: Math.round(gainOf(p.gain) * 10) / 10 });
  return byId(st, echo)?.pct ?? 0;
};
const hDac = hitPct('dac', 'H15');
const hSens = hitPct('sensitivity', 'H45');
const stepUiOk = /function setPracticeStep\(/.test(main) && /stepOpen\(/.test(main) && /emit\('practice:step'/.test(main)
  && /presetsOn = \(\) => teacherAccess\(\) && S\.study === 'classroom' && !S\.exam/.test(main)
  && /teacherAccess = \(\) => S\.learning\.role === 'teacher' && !!learningShell\?\.teacherUnlocked\(\)/.test(main)
  && /studyFullFlow\(\) \? STEP_IDS\.includes\(id\)/.test(main)
  && /detectionTraining\(\) \? !S\.prac\.submitted && \['scan', 'quantify', 'evaluate'\]\.includes\(id\)/.test(main)
  && /S\.learning\.route === 'fullscan' && S\.prac\.done\.sensitivity && \['scan', 'quantify', 'evaluate'\]\.includes\(id\)/.test(main)
  && /\|\| STEP_IDS\.indexOf\(id\) <= stepReach\(\)/.test(main) && /button\.disabled = !open/.test(main)
  && /button\.dataset\.step = 'assembly'/.test(main)
  && /const list = detectionTraining\(\) \? practiceDoc\.steps\.filter/.test(main)
  && contract.events.some((e) => e.name === 'practice:step' && e.milestone === 'M6.2') && prk.labels.locked;
// M6.3 - M6.5 procedure: a simulated student run through src/procedure.js on the practice engine.
const { createProcedure } = await import(new URL('../src/procedure.js', import.meta.url));
const { gateReading: gateRd } = await import(new URL('../src/waveform.js', import.meta.url));
const pr = createProcedure({ rules: wf, wave: wp, specimens: spec, standard: std });
const g01 = (g) => Math.round(g * 10) / 10;
const gateAt = (st, start, width) => gateRd(wp.synth(st, { columns: 480, noise: false }), { on: true, start_mm: start, width_mm: width, threshold_pct: 20 });
const autoGn = (st, start, width) => {
  const top = gateAt(st, start, width).top;
  return g01(st.gain_dB + lg(80 / top.pct));
};
const cal = { velocity_m_s: cs.velocity_m_s, zero_us: cs.zero_us, reject_percent: 0 };
const cskSt = pst('specimen__csk_ia', 0, 0, { ...cal, gain_dB: 24 });
const rB1 = pr.calibRecord(cskSt, gateAt(cskSt, 20, 10));
const rB2 = pr.calibRecord(cskSt, gateAt(cskSt, 45, 10));
const calPts = { B1: rB1.reading, B2: rB2.reading };
const unc = pst('specimen__csk_ia', 0, 0, { velocity_m_s: wf.practice.controls.velocity_m_s_initial, zero_us: 0, reject_percent: 0, gain_dB: 24 });
const calBlock = pr.calibRecord({ ...cskSt, reject_percent: 5 }, gateAt(cskSt, 20, 10)).msg === 'reject_not_zero'
  && pr.calibRecord({ ...cskSt, gain_dB: 40 }, gateAt({ ...cskSt, gain_dB: 40 }, 20, 10)).msg === 'saturated'
  && pr.calibRecord(pst('specimen__cbii_2', -45, 0, cal), gateAt(pst('specimen__cbii_2', -45, 0, cal), 10, 10)).msg === 'use_specimen'
  && !pr.calibDone({ B1: pr.calibRecord(unc, gateAt(unc, 20, 10)).reading, B2: pr.calibRecord(unc, gateAt(unc, 45, 12)).reading })
  && !pr.calibDone({ B1: 25.0, B2: 50.43 }) && pr.calibDone({ B1: 25.3, B2: 50.35 });
const calFlowOk = rB1.ok && rB2.ok && rB1.id === 'B1' && rB2.id === 'B2' && Math.abs(rB1.reading - 25) <= wf.practice.calibration.qa_tolerance_mm
  && Math.abs(rB2.reading - 50) <= wf.practice.calibration.qa_tolerance_mm && pr.calibDone(calPts) && calBlock;
const dacRec = holesCb.map((h) => {
  const st0 = pst('specimen__cbii_2', h.x_mm, h.y_mm, { ...cal, gain_dB: 30 });
  const st = { ...st0, gain_dB: autoGn(st0, h.S_mm - 5, 10) };
  return pr.dacRecord(st, gateAt(st, h.S_mm - 5, 10), true);
});
const dacRecPts = dacRec.map((r) => r.point);
const h30 = holesCb.find((h) => h.S_mm === 30);
const st30 = pst('specimen__cbii_2', h30.x_mm, 0, { ...cal, gain_dB: g01(PAV.dac_G_dB['30']) });
const dacTry = (st) => pr.dacRecord(st, gateAt(st, 25, 10), true).msg;
const off30 = { ...st30, probe_x_mm: h30.x_mm + 3 };
const dacMsgs = [pr.dacRecord(st30, gateAt(st30, 25, 10), false).msg,
  dacTry({ ...off30, gain_dB: autoGn(off30, 25, 10) }), dacTry({ ...st30, gain_dB: st30.gain_dB + 1.5 })];
const dacBlock = dacMsgs.join() === 'not_calibrated,not_peak,not_80';
const dacFlowOk = dacRec.every((r) => r.ok) && dacRecPts.every((p) => Math.abs(p.G - PAV.dac_G_dB[String(Math.round(p.S))]) <= 0.1 && Math.abs(p.S - Math.round(p.S)) < 0.05) && dacBlock;
const gb = pr.gBase(dacRecPts);
const sensOk = Math.abs(gb - PAV.G_base_dB) <= 0.1 && pr.sensRecord(dacRecPts, g01(gb + 6)).ok && pr.sensRecord(dacRecPts, g01(gb + 3)).msg === 'gain_not_set'
  && Math.abs(pr.hDac(dacRecPts, 45, gb) - 80) < 0.5 && pr.hDac(dacRecPts, 50, gb) === null && pr.curve(dacRecPts, gb).length > 10;
const pl = (x, y, g = g01(gb + 6)) => pst('specimen__plate_50', x, y, { ...cal, gain_dB: g });
const crit = (x, y) => pr.criteria(pl(x, y), dacRecPts, gb);
const cLamC = crit(lx, ly);
const cIncC = crit(ix, iy);
const critOk = cLamC.flags.includes('F1_over_dac') && cLamC.flags.includes('B1_below_50') && cLamC.defect === 'LAM_01'
  && cIncC.flags.join() === 'F1_over_dac' && cIncC.defect === 'INC_01' && !crit(-120, 80).flags.length && !crit(vx, vy).flags.length;
const bEdge = (cx, cy, ux, uy) => {
  let lo = 0;
  let hi = 40;
  while (hi - lo > 0.1) { const m = (lo + hi) / 2; if (crit(cx + ux * m, cy + uy * m).flags.length) lo = m; else hi = m; }
  const m = Math.round(((lo + hi) / 2) * 10) / 10;
  return [cx + ux * m, cy + uy * m];
};
const bpts = (cx, cy) => [bEdge(cx, cy, 1, 0), bEdge(cx, cy, -1, 0), bEdge(cx, cy, 0, 1), bEdge(cx, cy, 0, -1)];
const rLam = pr.rect(bpts(lx, ly));
const rInc = pr.rect(bpts(ix, iy));
const incSt = pl(ix, iy, g01(gb - 10));
const eqR = pr.eqRecord(incSt, gateAt(incSt, 30, 10), dacRecPts, 'INC_01');
const eqSat = pr.eqRecord(pl(ix, iy), gateAt(pl(ix, iy), 30, 10), dacRecPts, 'INC_01').msg === 'saturated';
const jLam = pr.judge('LAM_01', { length: rLam.length, area: rLam.area, eq: null });
const jInc = pr.judge('INC_01', { length: rInc.length, area: rInc.area, eq: eqR.dB });
const jBad = pr.judge('LAM_01', { length: rLam.length + 12, area: rLam.area * 1.4, eq: null });
const sizeOk = jLam.length && jLam.area && jInc.length && jInc.equivalent && !('area' in jInc) && !jBad.length && !jBad.area && eqR.ok && eqSat;
check('W26', 'M6.3–M6.5 流程规则（模拟学生操作）：CSK-IA 闸门读 B1 / B2 校准与拦截；CBII-2 三孔自动增益记 DAC 点与拦截；基准 / 扫查灵敏度；基准灵敏度下判据；边界点矩形与当量评定', calFlowOk && dacFlowOk && sensOk && critOk && sizeOk,
  `cal ${rB1.reading} / ${rB2.reading}${calBlock ? '' : ' block✗'}; DAC ${dacRecPts.map((p) => `${p.S}:${p.G}`).join(' ')}${dacBlock ? '' : ` block✗ ${dacMsgs.join()}`}; G_base ${gb}; `
  + `LAM ${rLam.x1 - rLam.x0 > 0 ? (rLam.x1 - rLam.x0).toFixed(1) : '?'}x${(rLam.y1 - rLam.y0).toFixed(1)} area ${rLam.area.toFixed(0)}; INC ${rInc.length.toFixed(1)} eq ${eqR.dB}${critOk ? '' : ' crit✗'}${sizeOk ? '' : ' size✗'}`);

const flowSrc = /id === 'key__enter' && prac\) practiceRecord\(\)/.test(main) && /PRAC_KEYS\.has\(id\)/.test(main)
  && /emit\('instrument:zero'/.test(main) && /emit\('instrument:reject'/.test(main) && /emit\('instrument:peak_memory'/.test(main)
  && /if \(P\.done\.calibrate\) \{\s*clearFrom\('calibrate'\)/.test(main) && /updateCriteria\(\{ track:/.test(main)
  && /opts\.peak = /.test(main) && /opts\.dac = /.test(main) && /practice\.setMarks\(/.test(main) && /function renderStepCard\(/.test(main)
  && /setMarks\(id, /.test(readFileSync(join(app, 'src', 'practice.js'), 'utf8')) && /peak = null, dac = null, dacLabel = null, gateExtra = null, alarm = null/.test(readFileSync(join(app, 'src', 'waveform.js'), 'utf8'))
  && ['saturated', 'echo_mismatch', 'not_80', 'not_peak', 'out_of_tol', 'points_void', 'calib_void', 'gain_not_set', 'use_specimen', 'no_target', 'boundary', 'record_eq'].every((k) => prk.labels[k])
  && prk.steps.every((s) => (s.cards || []).every((c) => prk.cards.some((k) => k.id === c)))
  && ['zero', 'reject'].every((k) => insp.panel.fn[k]) && inst.keys.active_in_practice.every((k) => inst.keys.inactive_in_v1.includes(k));
check('W27', 'M6.3–M6.5 接线：实训中零点 / 抑制 / 峰值键启用、确认键按步骤记录、声速 / 零点改动使校准失效、探头移动触发判据与扫查轨迹、A 扫峰值包络与 DAC 曲线、检测面标记、步骤卡片与短标签', flowSrc);

const gBody = main.slice(main.indexOf('function guideChecks('), main.indexOf('function setGuide('));
const gd = prk.guide;
const guideOk = !!gd && ['title', 'show', 'close', 'page', 'device'].every((k) => gd[k])
  && prk.steps.every((s) => (gd.steps[s.id] || []).length >= 3 && gd.steps[s.id].every((it) => it.id && it.do && it.page && new RegExp(`\\b${it.id}:`).test(gBody)))
  && (gd.dac_hole || []).length === 4 && gd.dac_hole.every((it) => it.do && it.page && gBody.includes(`c[\`${it.id}_\${h.id}\`]`))
  && wf.auto_gain.min_percent > 0 && /g\.top\.pct < A\.min_percent/.test(main)
  && prk.steps.every((s) => (s.cards || []).length && s.cards.every((id) => { const c = prk.cards.find((k) => k.id === id); return c && c.goal && c.reason?.length && c.done?.length; }))
  && ['why_goal', 'why_reason', 'why_done'].every((k) => prk.labels[k]) && Number.isFinite(wf.practice.scan.guide_trail_points)
  && /updateGuide\(now\)/.test(main) && /tools\.append\(stdBtn, guideBtn\)/.test(main) && /viewport\.append\(guideBox\)/.test(main) && /c\.goal/.test(main);
check('W28', '实训操作提示：五个步骤的分步提示（右侧栏 / 仪器面板两种操作）与自动勾选一一对应；弹出 / 关闭按钮；每步「做什么 / 为什么 / 怎样算做好」', guideOk);

const xr = wf.practice.dac.xray;
const fh = wf.practice.dac.find_hole;
const holeOk = !!xr && typeof xr.default === 'boolean' && xr.plate_default === false
  && /sp\.defects \|\| \[\]/.test(pracSrc) && /isPlate\(P\.specimen\) && P\.xrayPlate \? P\.specimen/.test(main)
  && (main.match(/\[PL\.xray, toggleXray/g) || []).length === 4 && /emit\('practice:xray'/.test(main)
  && contract.events.some((e) => e.name === 'practice:xray' && e.milestone === 'M6.5') && xr.block_opacity > 0 && xr.block_opacity < 1 && /^#[0-9a-f]{6}$/i.test(xr.colors?.target) && /^#[0-9a-f]{6}$/i.test(xr.colors?.done)
  && !!fh && fh.glide_ms > 0 && prk.labels.find_hole && prk.labels.xray
  && /function setXray\(/.test(pracSrc) && /function setFeatureColors\(/.test(pracSrc) && /f\.visible = on \|\| s\.id === xray\.id/.test(pracSrc)
  && /practice\.setXray\(onId, X\.block_opacity\)/.test(main) && /updateXray\(\);/.test(main)
  && /\[PL\.find_hole, findHole/.test(main) && /\[PL\.xray, toggleXray/.test(main) && /emit\('practice:find_hole'/.test(main)
  && contract.events.some((e) => e.name === 'practice:find_hole' && e.milestone === 'M6.5');
check('W29', '透视：CBII-2（默认开，孔柱与检测面十字，目标孔橙 / 已记录绿）与钢板（默认关，缺陷与检测面投影轮廓），开关发 practice:xray；「找孔」（探头滑到下一个未记录孔）', holeOk);

const al = wf.practice.scan.dac_alarm;
const wfSrc = readFileSync(join(app, 'src', 'waveform.js'), 'utf8');
const alarmOk = !!al && al.blink_ms > 0 && /^#[0-9a-f]{6}$/i.test(al.color) && prk.labels.dac_alarm && prk.labels.dac
  && /detectionDacAlarm\(\{ enabled: S\.insp\.dac_alarm_enabled !== false/.test(main) && /emit\('practice:dac_alarm'/.test(main)
  && /syncDacAlarm\(c\);/.test(main) && /syncDacAlarm\(null\)/.test(main)
  && /opts\.alarm = PL\.dac_alarm/.test(main) && /opts\.dacLabel = PL\.dac/.test(main) && /instrument\.led\.traverse/.test(main)
  && /if \(alarm\) box\(alarm,/.test(wfSrc) && !/fillText\('DAC'/.test(wfSrc)
  && contract.events.some((e) => e.name === 'practice:dac_alarm' && e.milestone === 'M6.5');
check('W30', 'DAC 报警：默认启用，当前闸门选中首缺陷波且 F1 超过 DAC 时 A 扫屏红色报警框闪烁、仪器状态灯红闪；关闭、闸门停用或移出缺陷时解除，并发 practice:dac_alarm', alarmOk);

// P-02 grading plate: criteria and sizing on the engine, cluster merge, grading matrix (waveform_rules.practice.grading).
const P02 = 'specimen__plate_p02';
const p02 = spec.runtime_specimens?.[P02];
const p2Defs = Object.fromEntries((p02?.defects || []).map((d) => [d.id, d]));
const p2 = (x, y, g = g01(gb + 6)) => pst(P02, x, y, { ...cal, gain_dB: g });
const crit2 = (x, y) => pr.criteria(p2(x, y), dacRecPts, gb);
const f1Of2 = (x, y, pred) => {
  let v = null;
  for (const e of wp.echoes(p2(x, y, gb))) if (e.type === 'defect' && e.k === 1 && pred(e)) {
    const d = pr.f1MinusDac(dacRecPts, e.x_mm, e.pct, gb);
    if (d != null) v = Math.max(v ?? -Infinity, d);
  }
  return v;
};
const edge2 = (cx, cy, ux, uy, on) => {
  let lo = 0;
  let hi = 60;
  while (hi - lo > 0.1) { const m = (lo + hi) / 2; if (on(cx + ux * m, cy + uy * m)) lo = m; else hi = m; }
  const m = Math.round(((lo + hi) / 2) * 10) / 10;
  return [cx + ux * m, cy + uy * m];
};
const rect2 = (cx, cy, on) => pr.rect([edge2(cx, cy, 1, 0, on), edge2(cx, cy, -1, 0, on), edge2(cx, cy, 0, 1, on), edge2(cx, cy, 0, -1, on)]);
const on2 = (x, y) => crit2(x, y).flags.length > 0;
let p2Ok = false;
let p2Detail = 'no P-02';
if (p02) {
  const G = wf.practice.grading;
  const [l2x, l2y] = p2Defs.LAM_02.centre_mm;
  const [i2x, i2y] = p2Defs.INC_02.centre_mm;
  const rL2 = rect2(l2x, l2y, on2);
  const rI2 = rect2(i2x, i2y, on2);
  const inc2St = p2(i2x, i2y, g01(gb - 18));
  const eq2 = pr.eqRecord(inc2St, gateAt(inc2St, 30, 10), dacRecPts, 'INC_02');
  const clu = p2Defs.CLU_01;
  const memR = clu.members.map((m, i) => rect2(m.x_mm, m.y_mm, (x, y) => (f1Of2(x, y, (e) => e.id === 'CLU_01' && e.member === i) ?? -99) > 0));
  const mg = pr.merge(memR);
  const cluEqs = clu.members.map((m) => {
    let st = p2(m.x_mm, m.y_mm, g01(gb - 30));
    for (let k = 0; k < 2; k++) st = p2(m.x_mm, m.y_mm, autoGn(st, 22, 12));
    const r = pr.eqRecord(st, gateAt(st, 22, 12), dacRecPts, 'CLU_01'); return r.dB ?? r.msg; });
  const cluEq = Math.max(...cluEqs.map((v) => (typeof v === 'number' ? v : -99)));
  const jL2 = pr.judge('LAM_02', { length: rL2.length, area: rL2.area, eq: null });
  const jI2 = pr.judge('INC_02', { length: rI2.length, area: rI2.area, eq: eq2.dB });
  const jC = pr.judge('CLU_01', { length: mg.length, area: mg.area, eq: cluEq });
  const [px2, py2] = p2Defs.POR_01.centre_mm;
  const por = f1Of2(px2, py2, (e) => e.id === 'POR_01');
  const segPts = [];
  for (let x = -160; x <= 160; x += 8) for (let y = -24; y <= 24; y += 6) segPts.push([x, y]);
  const segOff = segPts.every(([x, y]) => !on2(x, y));
  const segMax = Math.max(...segPts.map(([x, y]) => f1Of2(x, y, (e) => e.id === 'SEG_01') ?? -99));
  const stud = G.reference_items.map((it) => ({ ...it, S_mm2: it.id === 'LAM_02' ? rL2.area : it.id === 'INC_02' ? rI2.area : it.id === 'CLU_01' ? mg.area : null, D_dB: it.id === 'INC_02' ? eq2.dB : it.id === 'CLU_01' ? cluEq : null }));
  const GS = std.items.grading;
  const matrix = (items) => GS.levels.every((lv) => {
    const g = pr.grade(lv, items);
    return Object.entries(G.expected[lv]).every(([k, v]) => (k === 'pass' ? g.pass === v : g.verdicts[k] === v));
  });
  const markLbl = ['mark', 'next_block', 'block', 'indication', 'count_format', 'level', 'plate_grade', 'conclusion', 'accept', 'reject', 'submit', 'correct', 'wrong', 'expected', 'need_all', 'need_quant', 'need_choice', 'limit_max', 'limit_count', 'limit_n', 'counted_n', 'plate_area', 'must_handle', 'verdict'].every((k) => prk.labels[k]);
  p2Ok = crit2(l2x, l2y).flags.join() === 'F1_over_dac,B1_below_50' && crit2(i2x, i2y).flags.join() === 'F1_over_dac'
    && jL2.length && jL2.area && jI2.length && jI2.equivalent && jC.area && jC.equivalent && mg.merged && mg.blocks === 3
    && pr.needsD(G.reference_items.find((it) => it.id === 'CLU_01')) && !pr.needsD(G.reference_items.find((it) => it.id === 'LAM_02'))
    && por != null && Math.abs(por - PAV.POR_01_f1_minus_dac_dB) < 0.2 && !on2(px2, py2)
    && segOff && segMax < 0 && Math.abs(segMax - PAV.SEG_01_f1_minus_dac_max_dB) < 1.5 && !on2(0, -120)
    && matrix(G.reference_items) && matrix(stud) && pr.plateGrade(G.reference_items) === G.expected.plate_grade && pr.plateGrade(stud) === G.expected.plate_grade
    && Object.keys(p2Defs).every((id) => prk.indications?.[id] && G.reference_items.some((it) => it.id === id))
    && G.verdicts.every((v) => prk.verdicts?.[v]) && [...GS.levels, GS.fail_level].every((k) => prk.levels?.[k]) && markLbl
    && ['practice:mark', 'practice:evaluate'].every((n) => emitted.includes(n) && contract.events.some((e) => e.name === n && e.milestone === 'M6.5'))
    && /function buildRuntime\(/.test(pracSrc) && /runtime_specimens/.test(main) && /proc\.grade\(/.test(main) && /proc\.merge\(/.test(main);
  p2Detail = `LAM ${rL2.length.toFixed(1)} / ${rL2.area.toFixed(0)}; INC ${rI2.length.toFixed(1)} eq ${eq2.dB ?? eq2.msg}; CLU ${memR.map((r) => r.area.toFixed(0)).join('+')} = ${mg.area.toFixed(0)} ${mg.merged ? 'merged' : 'split'} eq ${cluEqs.join('/')}; POR ${por?.toFixed(2)}; SEG max ${segMax.toFixed(2)}; grade ${pr.plateGrade(stud)}`;
}
check('W31', '评定板 P-02：5 处显示（分层 / 夹杂 / 密集夹杂群 / 气孔 / 中心偏析带）判据与定量、夹杂群分块合并、按Ⅰ–Ⅳ 级逐处判定与整板等级；标记与提交评定事件', p2Ok, p2Detail);

// Standard pack: every clause value used by code and visible text comes from contracts/standard_nbt47013_3.json.
const stdItems = Object.entries(std.items || {});
const tokBlock = main.slice(main.indexOf('const STD_TOKENS'), main.indexOf('const fillStd'));
const tokKeys = new Set([...tokBlock.matchAll(/^ {4}([a-z_0-9]+):/gm)].map((m) => m[1]).concat(std.items.grading.levels.map((_, i) => `L${i + 1}`)));
const prkText = JSON.stringify(prk);
const usedTok = [...new Set([...prkText.matchAll(/\{std\.([A-Za-z_0-9]+)\}/g)].map((m) => m[1]))];
const badTok = usedTok.filter((k) => !tokKeys.has(k));
const procSrc = readFileSync(join(app, 'src', 'procedure.js'), 'utf8');
const hardText = ['NB/T 47013', 'B1 < 50', 'Φ5 ', 'TⅠ', '+ 6 dB', '高 6 dB'].filter((s) => prkText.includes(s));
const stdOk = /^NB\/T 47013\.3/.test(std.code) && std.edition && stdItems.length >= 15
  && stdItems.every(([, v]) => v.clause && v.status in std.status_legend)
  && std.items.grading.levels.every((k) => std.items.grading.table[k] && prk.levels[k]) && prk.levels[std.items.grading.fail_level]
  && spec.standard?.pack === 'contracts/standard_nbt47013_3.json' && !spec.standard.clauses
  && wf.practice.scan_sensitivity.plus_dB === undefined && !wf.practice.grading.table && !wf.practice.grading.levels
  && /import stdPack from '\.\.\/\.\.\/contracts\/standard_nbt47013_3\.json'/.test(main) && /standard: stdPack/.test(main) && /fillStd\(practiceDoc\)/.test(main)
  && /B1_LIMIT = STD\.defect_criteria\.b1_limit_percent/.test(procSrc) && /SCAN_PLUS = STD\.scan_sensitivity\.plus_dB/.test(procSrc) && /GS\.table\[level\]/.test(procSrc)
  && usedTok.length >= 10 && badTok.length === 0 && hardText.length === 0;
const sdk = readJson('knowledge/standard.json');
const { createStandardView } = await import(new URL('../src/standard.js', import.meta.url));
const sv = createStandardView({ pack: std, doc: sdk, levels: prk.levels, sep: prk.labels.list_join.sep, esc: (s) => s });
const packIds = Object.keys(std.items);
const chipIds = [...new Set([...prkText.matchAll(/\{clause:([a-z_0-9]+)\}/g)].map((m) => m[1]))];
const svHtml = packIds.map((id) => sv.clauseHtml(id, { t_mm: 50, level: 'III' })).join('');
const stdViewOk = UI.modes.standard && sdk.title && sdk.all && sdk.close
  && packIds.every((id) => sdk.items[id]?.title && sdk.items[id].text?.length) && Object.keys(sdk.items).every((id) => std.items[id])
  && JSON.stringify([...sv.allIds()].sort()) === JSON.stringify([...packIds].sort())
  && stepIds.every((s) => sv.stepIds(s).length && sv.stepIds(s).every((id) => std.items[id]))
  && sv.unresolved().length === 0 && !/\{[^}]*\}/.test(svHtml) && (svHtml.match(/<table/g) || []).length === Object.keys(sdk.tables).length
  && (svHtml.match(/class="on"/g) || []).length === 4
  && chipIds.length >= 8 && chipIds.every((id) => std.items[id]) && stepIds.every((s) => (prk.steps.find((x) => x.id === s).cards || []).some((c) => prk.cards.find((k) => k.id === c)?.reason.concat(prk.cards.find((k) => k.id === c).goal).some((t) => /\{clause:/.test(t))))
  && /createStandardView\(/.test(main) && /function openStdPage\(/.test(main) && /function updateStdBox\(/.test(main) && /withChips\(/.test(main) && /std-chip/.test(main);
check('W33', '标准模块：顶部「标准」整页（分组目录 + 全部条款与表 3 / 4 / 5 / 6）、实训视图「标准」浮层按步骤列条款、卡片条款号标签可点开；文字取自 knowledge/standard.json，数值取自标准包，占位全部解析', stdViewOk,
  `${packIds.length} clauses; chips ${chipIds.length}; unresolved ${sv.unresolved().join(',') || 0}`);

const eqm = readJson('contracts/equipment_manifest.json');
const eqk = readJson('knowledge/equipment.json');
const eqSrc = readFileSync(join(app, 'src', 'equipment.js'), 'utf8');
const eqOk = eqm.order?.length >= 10 && eqm.order.every((id) => eqm.equipment[id] && eqk.items[id]?.name)
  && eqm.equipment.eq__instrument_paut && eqk.items.eq__instrument_paut?.name
  && eqk.section_titles && ['structure', 'principle', 'material'].every((k) => eqk.section_titles[k])
  && mm.states.equipment && scenes.cameras.equipment
  && /createEquipment\(/.test(main) && /function selectEq\(/.test(main) && /function renderEquipmentPanel\(/.test(main)
  && /buildPautInstrumentDisplay/.test(eqSrc) && /showMany\(/.test(pracSrc)
  && emitted.includes('equipment:enter') && emitted.includes('equipment:select')
  && UI.equipment_views.equipment === '工作台';
check('W34', '仪器设备工作台：器材清单与讲解卡（含相控阵探伤仪）、点选 / 高亮、工作台子页签与 equipment 状态；事件 equipment:enter / select / learned', eqOk,
  `${eqm.order.length} items`);

// M7.3: couplant GLB wired; bench layout footprints (static estimate from manifest dims) do not overlap.
const specDims = (sid) => { const d = spec.specimens[sid].dims; return [d.length.value, (d.width || d.width_b).value]; };
const fpStatic = {};
for (const id of eqm.order) {
  const it = eqm.equipment[id], b = it.bench;
  let hx, hz;
  if (it.kind === 'specimen') { const [L, W] = specDims(it.node); hx = L / 2; hz = W / 2; }
  else if (it.footprint_aabb_mm) { fpStatic[id] = { ...it.footprint_aabb_mm }; continue; }
  else if (it.kind === 'instrument') { fpStatic[id] = { ...it.footprint_aabb_mm }; continue; }
  else if (id === 'eq__cable') { fpStatic[id] = { ...it.rest.footprint_aabb_mm }; continue; }
  else if (id === 'eq__couplant') { hx = hz = it.size_mm.diameter / 2; }
  else if (it.size_mm?.width && it.size_mm?.depth) { hx = it.size_mm.width / 2; hz = it.size_mm.depth / 2; }
  else { hx = hz = 20; }
  fpStatic[id] = { x0: b.x_mm - hx, x1: b.x_mm + hx, z0: b.z_mm - hz, z1: b.z_mm + hz };
}
let minGap = Infinity, minPair = '';
const fpIds = Object.keys(fpStatic);
for (let i = 0; i < fpIds.length; i++) for (let j = i + 1; j < fpIds.length; j++) {
  const a = fpStatic[fpIds[i]], c = fpStatic[fpIds[j]];
  const g = Math.max(Math.max(a.x0 - c.x1, c.x0 - a.x1), Math.max(a.z0 - c.z1, c.z0 - a.z1));
  if (g < minGap) { minGap = g; minPair = `${fpIds[i]}/${fpIds[j]}`; }
}
const eqGlbOk = existsSync(join(proj, eqm.gltf_contract.file)) && /equipment_generic\.glb\?url/.test(main)
  && /getObjectByName\('eq__couplant'\)/.test(eqSrc) && /function footprints\(/.test(eqSrc) && /function gaps\(/.test(eqSrc)
  && /specHome/.test(eqSrc) && eqm.layout?.min_gap_mm >= 20 && minGap >= eqm.layout.min_gap_mm;
check('W35', 'M7.3 耦合剂瓶 GLB 接入工作台；工作台摆放互不叠压（清单尺寸估算最小间隙 ≥ layout.min_gap_mm）；离开工作台试块复位', eqGlbOk,
  `min gap ${minGap.toFixed(0)} mm (${minPair})`);

// M7.4: drag-assembly with physical consequences; bench cable = live system cable; bottom pan slider.
const asmSrc = existsSync(join(app, 'src', 'assembly.js')) ? readFileSync(join(app, 'src', 'assembly.js'), 'utf8') : '';
const instSrc = readFileSync(join(app, 'src', 'instrument.js'), 'utf8');
const asm = eqm.assembly || {};
const asmEvents = ['assembly:enter', 'assembly:attach', 'assembly:error', 'assembly:done'];
const asmOk = asmEvents.every((n) => contract.events.find((e) => e.name === n)?.milestone === 'M7.4' && emitted.includes(n))
  && asm.snap_radius_mm > 0 && asm.couplant_patch?.radius_mm > 0 && asm.done_when?.length === 4 && asm.auto_step_ms > 0
  && eqm.equipment.eq__cable.rest?.plug_a && eqm.equipment.eq__cable.rest?.plug_b && !eqm.equipment.eq__cable.coil
  && !/TorusGeometry/.test(eqSrc) && /instrument\?\.cableGroup/.test(eqSrc)
  && /function setCableEnds\(/.test(instSrc) && /function portEnd\(/.test(instSrc) && /function solveLoop\(/.test(instSrc)
  && /pulse = true/.test(wfSrc)
  && /createAssembly\(/.test(main) && /function autoStep\(/.test(asmSrc) && /'port_r'/.test(asmSrc) && /air_gap/.test(asmSrc)
  && /controls\.enabled = false/.test(main) && /function renderAsm\(/.test(main) && /function redoAssembly\(/.test(main)
  && /S\.study === 'classroom'/.test(main) && /function setEqPan\(/.test(main) && scenes.cameras.equipment.pan_m > 0
  && ['auto_assemble', 'redo', 'done', 'hint', 'pan'].every((k) => eqk[k]) && ['port_wrong', 'no_couplant', 'no_echo'].every((k) => eqk.labels?.[k])
  && Object.keys(eqk.assembly_steps || {}).every((k) => asm.done_when.includes(k));
check('W36', 'M7.4 工作台自由拖拽组装：插头吸附探头 / 收发插座（R 插座为错），耦合剂涂到钢板，探头放到钢板；无信号 / 无底波 / B1 B2 物理后果；工作台线缆即检测系统同款线缆；重做 / 自动组装（课堂）；底部平移滑块；assembly:* 事件', asmOk,
  `${asmEvents.filter((n) => emitted.includes(n)).length}/4 events`);

// V4 modes: teacher entry is password-gated; assembly belongs to the complete
// learning flow, while independent design and prepared detection are separate.
const learningEntry = readJson('knowledge/learning.json');
const shellSrc = readFileSync(join(app, 'src', 'learning-shell.js'), 'utf8');
const unlockOk = UI.locked && /LOCKED_TOPS = new Set\(\['principle', 'inspection', 'practice', 'assessment'(, 'task')?\]\)/.test(main)
  && /topOpen = \(\) => true/.test(main) && /S\.asmDone = true/.test(main)
  && /async function launchLearning\(\{ role, route, taskMode = 'guided' \}\)/.test(main)
  && /setStudy\(role === 'teacher' \? 'classroom' : 'self'\)/.test(main)
  && /role === 'teacher' && !learningShell\?\.teacherUnlocked\(\)/.test(main)
  && /route === 'fullscan'/.test(main) && /flowAssemblyDone: false/.test(main)
  && /if \(!resume \|\| !S\.prac\.flowAssemblyDone\) await setMode\('equipment', \{ force: true \}\)/.test(main)
  && /S\.prac\.flowAssemblyDone = true; S\.prac\.step = 'calibrate'/.test(main)
  && /TEACHER_PASSWORD = '4404'/.test(shellSrc) && learningEntry.teacher_gate.placeholder === '教室门牌'
  && /type="password"/.test(shellSrc) && /value !== TEACHER_PASSWORD/.test(shellSrc)
  && /next\.role === 'teacher' && !unlocked/.test(shellSrc) && /onRoleChange\?\.\(null\)/.test(shellSrc)
  && /if \(role !== 'teacher'\) unlocked = false/.test(shellSrc)
  && (/onLaunch: launchLearning/.test(main) || /if \(isAngleRoute\(payload\.route\)\) return launchWeld\(payload\);\s*closeAngle\(\);\s*return launchLearning\(payload\);/.test(main))
  && ['teacher', 'student'].every((role) => ['fullscan', 'task'].every((route) => learningEntry.roles[role].items.some((it) => it.route === route)))
  && ['teacher', 'student'].every((role) => !learningEntry.roles[role].items.some((it) => ['assembly', 'calibration'].includes(it.route)))
  && JSON.stringify(learningEntry.roles.exam.items.filter((it) => it.track === 'plate').map((it) => it.route)) === JSON.stringify(['assessment'])
  && !learningEntry.roles.student.items.some((it) => it.route === 'design')
  && learningEntry.roles.student.items.some((it) => it.route === 'task' && it.track === 'plate')
  && /const nextMode = design \? 'independent' : 'guided'/.test(main)
  && /'learn', 'card', 'check', 'fill'/.test(main)
  && /const raw = guided \? makeReferenceCard\(/.test(main)
  && /if \(S\.learning\.route === 'design' \|\| referenceCardLearning\(\) \|\| selfStudy\(\)\) return false/.test(main)
  && /S\.exam \? S\.prac\.asmDone && !S\.prac\.submitted/.test(main)
  && /function principleOpen\(/.test(main) && /startScene\(sid, i, 'parts'\)/.test(main) && /UI\.principle_views\[S\.prView\]/.test(main)
  && !/UI\.structure_views/.test(main) && !UI.structure_views && prk.title === UI.modes.practice && UI.lab.title === UI.principle_views.lab;
const rigidOk = /function rotate\(/.test(asmSrc) && /function settleItem\(/.test(asmSrc) && /function setItemPose\(/.test(asmSrc)
  && !/RingGeometry/.test(asmSrc) && !/eq__rotate_ring/.test(asmSrc) && /kind: 'cable'/.test(asmSrc) && /worldIn\(plate\(\)/.test(asmSrc) && !/plateB/.test(asmSrc)
  && /function resetLayout\(/.test(eqSrc) && /function gapOf\(/.test(eqSrc) && /function setPose\(/.test(eqSrc)
  && /assembly\.rotate\(/.test(main) && /function benchGrab\(/.test(main) && !/assembly\.focus\(/.test(main);
check('W38', 'M7.6 工作台全部器材可拖动 / 旋转：探伤仪、试块、钢板、探头、耦合剂瓶、线缆本体；拖动中滚轮转 15°（无选中旋转环）；叠压退回；钢板带着探头与耦合剂；重做复位摆放', rigidOk);

const waveExportOk = prk.labels?.export_wave === '导出波形'
  && /function exportPracticeWave\(/.test(main) && /scope-export/.test(main) && /exportPracticeWave/.test(main)
  && /Ascan_/.test(main) && /\.download =/.test(main);
check('W39', '实训工艺右侧 A 扫：标题旁「导出波形」按钮，导出当前波形 PNG（文件名含试块 / 步骤 / 时间）', waveExportOk);

check('W37', 'V5三模式入口：教师密码4404与教室门牌提示；退出即锁定，恢复及外部更新不能授权；教师保留结构、原理、完整流程与课堂案例；自学组装/校准并入完整流程；工艺卡含独立设计；实训仅检测实例', unlockOk
  && ['equipment', 'principle', 'inspection'].every((route) => learningEntry.roles.teacher.items.some((it) => it.route === route))
  && learningEntry.roles.student.items.some((it) => it.route === 'equipment')
  && learningEntry.roles.teacher.items.some((it) => it.route === 'preparation'));

// M8.1: process log + local session store; exam context (docs/M8_SCOPE.md §1, §3, §11).
const sessSrc = existsSync(join(app, 'src', 'session.js')) ? readFileSync(join(app, 'src', 'session.js'), 'utf8') : '';
const viteSrc = readFileSync(join(app, 'vite.config.js'), 'utf8');
const ad = readJson('knowledge/assessment.json');
const adRefs = [...main.matchAll(/\bassessDoc\.([a-z_]+)\.([a-z_]+)\b/g)].map((m) => [m[1], m[2]]);
const adMissing = adRefs.filter(([a, b]) => !(ad[a] && b in ad[a])).map(([a, b]) => `${a}.${b}`);
const specAll = { ...spec.specimens, ...(spec.runtime_specimens || {}) };
const sessOk = /export function createSessionStore\(/.test(sessSrc) && /'ut-session\/1'/.test(sessSrc) && /'ut\.m11\.session\.'/.test(sessSrc)
  && ['session_id', 'started_at', 'submitted_at', 'active_ms', 'interruptions', 'specimens', 'probe', 'initial'].every((k) => new RegExp(`\\b${k}\\b`).test(sessSrc))
  && /random_seed: null/.test(sessSrc) && /kind: 'frame'/.test(sessSrc) && /kind: 'inst'/.test(sessSrc) && /kind: 'key'/.test(sessSrc)
  && /__BUILD_META__/.test(viteSrc) && ['build_id', 'knowledge_version', 'contracts_version'].every((k) => viteSrc.includes(k))
  && Object.values(specAll).every((s) => typeof s.defect_set_id === 'string')
  && /function bootSessions\(/.test(main) && /store\.resume\(/.test(main) && /'pagehide'/.test(main) && /UTlog_/.test(main)
  && /const sessMode = \(\) => \(S\.learning\.role === 'exam' && S\.exam && !S\.taskOn \? 'exam' : null\)/.test(main)
  && /function recordEvent\(name, payload\) \{\s*if \(S\.learning\.role !== 'exam'\) return/.test(main)
  && /function recTick\(now\) \{[\s\S]{0,170}S\.learning\.role !== 'exam'/.test(main)
  && /S\.learning\.role = null; S\.learning\.route = null/.test(main)
  && /if \(selfStudy\(\)\) return/.test(main)
  && ['session:start', 'session:restore', 'session:export'].every((n) => emitted.includes(n) && contract.events.find((e) => e.name === n)?.milestone === 'M8.1')
  && adMissing.length === 0;
check('W40', 'V5.1过程记录：自学和教学不保存日志；实训会话独立使用ut.m11.session，保持会话头、事件、探头帧、仪器增量、关键帧与导出；刷新恢复检测数据但先显示三模式入口，不恢复教师授权', sessOk,
  adMissing.length ? `missing ${adMissing.join(',')}` : `${Object.keys(specAll).length} specimens with defect_set_id`);

const { learningHelpAllowed } = await import(new URL('../src/learning-policy.js', import.meta.url));
const helpPolicyOk = learningHelpAllowed({ exam: true, taskOn: true, learning: { role: 'student', taskMode: 'guided' } })
  && !learningHelpAllowed({ exam: true, taskOn: true, learning: { role: 'exam', taskMode: 'independent' } })
  && !learningHelpAllowed({ exam: true, taskOn: false, learning: { role: 'teacher', taskMode: 'guided' } });
const examOk = helpPolicyOk && /guide: !exam/.test(main) && /xray: exam \? false/.test(main) && /if \(!learningHelpOn\(\) && \/xray\|find-hole\|cov\/\.test\(cls\)\) continue/.test(main)
  && /const res = S\.exam \? null : E\.result/.test(main)
  && /scan\.found\.filter\(\(f\) => S\.learning\.role === 'teacher' \|\| f\.confirmed === true\)/.test(main)
  && /window\.confirm\(assessDoc\.session\.submit_confirm\)/.test(main)
  && /function swapContext\(/.test(main) && /function benchSnap\(/.test(main) && /equipment\.loadLayout\(/.test(main) && /assembly\.load\(/.test(main)
  && /function startExam\(/.test(main) && /function submitExam\(/.test(main) && /emit\('practice:record_blocked'/.test(main)
  && /autoTimer \|\| S\.exam\) return/.test(main)
  && /guideBtn\.hidden = !on \|\| \(!learningHelpOn\(\) && !detectionTraining\(\)\)/.test(main)
  && ['practiceRecord', 'markIndication', 'redoStep', 'setEval', 'submitEval'].every((f) => new RegExp(`function ${f}\\([^)]*\\) \\{[\\s\\S]{0,160}examLocked\\(\\)`).test(main));
const trainingSrc = readFileSync(join(app, 'src', 'v4-training.js'), 'utf8');
const preparedExamOk = /const drawn = drawLibraryCase\(\{ caselib: caseLib\(\), thickness: thickness\(\) \}\)/.test(main)
  && /const prepared = presetDetectionPractice\(/.test(main) && /sessionInit\(student\)/.test(main)
  && /PRESET_LOCKS = new Set/.test(main) && /detectionTraining\(\) && PRESET_LOCKS\.has\(key\)/.test(main)
  && /step: 'scan'/.test(trainingSrc) && /asmDone: true/.test(trainingSrc)
  && /delete prepared\.card/.test(trainingSrc) && /presetPlan: \{[^\n]*source: 'system'/.test(trainingSrc);
const preparedLocks = main.match(/^const PRESET_LOCKS = new Set\(\[([^\]]+)\]\);/m)?.[1] || '';
const preparedCalibrationOk = !/'gain_dB'/.test(preparedLocks)
  && ['range_mm', 'velocity_m_s', 'zero_us', 'reject_percent', 'coupling', 'damping'].every((key) => preparedLocks.includes(`'${key}'`));
const sessionInitialSource = main.match(/^function sessionInit\([^\n]*\) \{[\s\S]*?^\}/m)?.[0];
let initialPresetOk = false;
if (sessionInitialSource) {
  const plan = { source: 'system', base: 37.63, scan: 43.63, reference_block: '2' };
  const card = { reference_block: '2', level: 'II' };
  const S = { learning: { role: 'exam', student: { name: '', student_no: '' } }, study: 'self',
    prac: { step: 'scan', specimen: 'case', probe: {}, inst: {}, presetPlan: plan, presetCard: card } };
  const sessionInit = new Function('S', 'headerCase', 'benchSnap', 'specMan', 'CASE_ID', 'manifest',
    `${sessionInitialSource}\nreturn sessionInit;`)(S, () => null, () => null, { specimens: {} }, 'case',
      { parameters: { active_element_diameter: { value: 14 } } });
  const initial = sessionInit(null).initial;
  initialPresetOk = initial.presetPlan?.source === 'system'
    && JSON.stringify(initial.presetPlan) === JSON.stringify(plan)
    && JSON.stringify(initial.presetCard) === JSON.stringify(card);
}
check('W41', 'V5检测实例：随机抽取已有案例，系统准备连接/校准/DAC/灵敏度，声速/零点等校准条件锁定而显示增益可调；会话初始状态标明系统准备，不发未登记事件；学生独立定位定量与评定；提交后锁定', examOk && preparedExamOk && preparedCalibrationOk && initialPresetOk);

// V5 convenience controls and visible task goals are wired to the actual detection instrument.
const v5Text = readJson('knowledge/v5.json');
const v5Refs = [...main.matchAll(/\bV5\.([a-z_]+)\b/g)].map((match) => match[1]);
const v5Missing = [...new Set(v5Refs.filter((key) => !(key in v5Text)))];
const criteriaSource = main.match(/^function updateCriteria\([^\n]*\) \{[\s\S]*?^\}/m)?.[0] || '';
const controlsSource = main.match(/^function inspControls\([^\n]*\) \{[\s\S]*?^\}/m)?.[0] || '';
const practicePanelSource = main.match(/^function renderPracticePanel\([^\n]*\) \{[\s\S]*?^\}/m)?.[0] || '';
const v5Import = main.match(/import \{([^}]+)\} from '\.\/v5-practice\.js'/)?.[1] || '';
const v5UiOk = v5Missing.length === 0
  && ['detectionDacAlarm', 'detectionCaseSummary'].every((name) => v5Import.includes(name))
  && /function syncDetectionTarget\(/.test(main) && /syncDetectionTarget\(\)/.test(practicePanelSource)
  && /detectionTarget/.test(practicePanelSource)
  && /detectionCaseSummary\(S\.case,/.test(main)
  && /function restoreDetectionGain\(/.test(main) && /restoreDetectionGain\(/.test(controlsSource)
  && /dac_alarm_enabled: true/.test(main)
  && /function setDacAlarmEnabled\(/.test(main) && /detectionDacAlarm\(/.test(main)
  && !/keepDetectionUnsaturated\(\)/.test(criteriaSource)
  && /GATE_SUBS\.forEach/.test(controlsSource) && /type = 'number'/.test(controlsSource)
  && practicePanelSource.indexOf('inspControls({ practice: true })') >= 0
  && practicePanelSource.indexOf('inspControls({ practice: true })') > practicePanelSource.indexOf("card.id = 'pracCard'");
check('W46', 'V5实训快捷操作：右侧增益和闸门直接可用，手动增益不被逐帧覆盖；独立恢复扫查/基准增益；明确本例缺陷总数与记录进度；DAC报警默认启用、按当前闸门首波判断并可关闭；界面文字取自知识文件', v5UiOk,
  v5Missing.length ? `missing V5 keys: ${v5Missing.join(',')}` : 'runtime wiring is separately executed by v5_integration.test.mjs');

// M8.2: scan path coverage (docs/M8_SCOPE.md §4).
const covSrc = existsSync(join(app, 'src', 'coverage.js')) ? readFileSync(join(app, 'src', 'coverage.js'), 'utf8') : '';
const spc = wf.practice.scan_path_coverage || {};
const scanCard = JSON.stringify(prk.cards?.find((c) => c.id === 'scan') || {}) + JSON.stringify(prk.guide?.steps?.scan || '');
const covOk = spc.milestone === 'M8.2' && spc.max_segment_mm > 0 && spc.direction_tolerance_deg > 0 && spc.overlay?.swept && spc.overlay?.near
  && /export function coverageParams\(/.test(covSrc) && /export function createCoverage\(/.test(covSrc)
  && ['scan.flag_cell_mm', 'housing_outer_diameter_mm', 'active_element_diameter', 'overlap_min_ratio', 'edge_zone', 'line_spacing_max_mm', 'max_segment_mm', 'direction_tolerance_deg']
    .every((k) => covSrc.includes(k.split('.').pop()))
  && !/声场|声束覆盖|sound.?field|beam/i.test(JSON.stringify(spc) + JSON.stringify(ad.coverage)) && !/声场|声束/.test(covSrc)
  && emitted.includes('coverage:view') && contract.events.find((e) => e.name === 'coverage:view')?.milestone === 'M8.2'
  && /export function setCoverage|function setCoverage\(/.test(pracSrc) && /setCoverage,/.test(pracSrc)
  && /if \(!learningHelpOn\(\) && \/xray\|find-hole\|cov\/\.test\(cls\)\) continue/.test(main) && /const covShown = \(\) => \(replayOn\(\) \? true : learningHelpOn\(\) \? !!S\.prac\.cover : examLocked\(\)\)/.test(main)
  && !/整块钢板/.test(scanCard) && scanCard.includes('{std.line_max}');
check('W42', 'M8.2 扫查轨迹覆盖率：网格 / 足迹 / 可达面 / 板边区 / 中部线距取自契约与标准包；轨迹的纯函数（跳点不计）；实训卡片开关与三项百分比、检测面叠加层；考核提交后才显示；命名不含「声场 / 声束覆盖」；扫查卡不再要求整块钢板 100%', covOk,
  `max_segment ${spc.max_segment_mm} mm; direction ±${spc.direction_tolerance_deg}°`);

// M8.3: scoring engine (docs/M8_SCOPE.md §5).
const scSrc = existsSync(join(app, 'src', 'scoring.js')) ? readFileSync(join(app, 'src', 'scoring.js'), 'utf8') : '';
const rub = readJson('contracts/rubric.json');
const scoreOk = /export function createScoring\(/.test(scSrc) && /basis_invalid_factor/.test(scSrc) && /function conductCounts\(/.test(scSrc)
  && rub.items.every((it) => new RegExp(`\\n    ${it.id}\\(`).test(scSrc))
  && !/\b(0\.5|0\.1|1\.0|25|50|37\.63|43\.63)\b/.test(scSrc.replace(/\/\/.*$/gm, ''))
  && emitted.includes('session:submit') && contract.events.find((e) => e.name === 'session:submit')?.milestone === 'M8.3'
  && /S\.prac\.score = examScore\(\);\s*emit\('session:submit'/.test(main) && /id="examScore"/.test(main)
  && rub.basis_rule.statuses.every((s) => ad.rubric.status[s]) && rub.items.every((it) => ad.rubric.items[it.id]);
const { deriveDetectionRubric } = await import(new URL('../src/v4-training.js', import.meta.url));
const detectionRubric = deriveDetectionRubric(rub);
const detectionScoreOk = /const scoring = createDetectionScoring/.test(main)
  && JSON.stringify(detectionRubric.items.map((item) => item.id)) === JSON.stringify(['scan', 'detect', 'quantify', 'evaluate', 'conduct'])
  && detectionRubric.items.reduce((sum, item) => sum + item.points, 0) === 100
  && detectionRubric.items.every((item) => (item.requires || []).every((id) => !['assembly', 'calibrate', 'dac', 'sensitivity'].includes(id)));
check('W43', 'V5评分：保留原rubric数值解析、前置链和逐缺陷依赖校验；检测评分仅扫查/检出/定量/评定/操作五项，满分100，系统准备不计分；工艺设计独立评价；提交一次并保存评分表', scoreOk && detectionScoreOk,
  `${rub.items.length} original items preserved; ${detectionRubric.items.length} detection items, max ${detectionRubric.max_total}`);

// M8.4: process report (docs/M8_SCOPE.md §6).
const rpSrc = existsSync(join(app, 'src', 'report.js')) ? readFileSync(join(app, 'src', 'report.js'), 'utf8') : '';
const css = readFileSync(join(app, 'src', 'style.css'), 'utf8');
const rpKeys = ['title', 'student', 'date', 'specimen', 'probe', 'readings', 'coverage', 'ascan', 'quantify', 'evaluate', 'score', 'print', 'close', 'yes', 'no'];
const reportOk = /export function reportHTML\(/.test(rpSrc) && /export function coverageImage\(/.test(rpSrc) && /export function openReport\(/.test(rpSrc)
  && !/[\u3400-\u9fff]/.test(rpSrc) && rpKeys.every((k) => ad.report[k]) && ['swept', 'near', 'edge_zone', 'trail', 'found'].every((k) => ad.report.legend?.[k])
  && ["takeShot('calibrate')", 'takeShot(`dac:${r.point.id}`)', "takeShot('scan')", 'takeShot(`quantify:${t}`)'].every((s) => main.includes(s))
  && /STEP_IDS\.indexOf\(k\.split\(':'\)\[0\]\) >= i\) delete P\.shots\[k\]/.test(main)
  && /onPrint: \(\) => emit\('session:export', \{ kind: 'report' \}\)/.test(main) && /rep\.dataset\.act = 'report'/.test(main)
  && /seed: 1 \}/.test(main) && spc.overlay?.report?.px_per_mm > 0 && /@media print/.test(css) && /body\.rp-open > \*:not\(#reportView\)/.test(css);
check('W44', 'M8.4 过程报告：提交页「导出报告」打开可打印页（标题、学生、试件 / 探头、关键读数、扫查轨迹覆盖率图、A 扫记录、缺陷定量、评定结论、评分）；A 扫在校准完成 / DAC 各点 / 首次检出 / 各定量处记录仪器状态并确定性重绘，重做时随步骤清除；打印只出报告，发 session:export {kind: report}；文字取自 assessment.json / practice.json', reportOk,
  `${rpKeys.length} report labels`);

// M8.5: operation replay from a UTlog JSON (docs/M8_SCOPE.md §7).
const rpSrc2 = existsSync(join(app, 'src', 'replay.js')) ? readFileSync(join(app, 'src', 'replay.js'), 'utf8') : '';
const rpLab = ad.replay || {};
const replayOk = /export function parseSession\(/.test(rpSrc2) && /export function createReplay\(/.test(rpSrc2)
  && /'ut-session\/1'/.test(rpSrc2) && /SPEEDS = \[1, 4, 16\]/.test(rpSrc2)
  && ['title', 'open', 'play', 'pause', 'speed', 'exit', 'version_mismatch', 'reference_only', 'bad_file'].every((k) => rpLab[k])
  && ['calib', 'dac', 'find', 'error', 'submit', 'restore'].every((k) => rpLab.markers?.[k])
  && emitted.includes('replay:load') && emitted.includes('replay:seek')
  && contract.events.find((e) => e.name === 'replay:load')?.milestone === 'M8.5'
  && contract.events.find((e) => e.name === 'replay:seek')?.milestone === 'M8.5'
  && /function openReplay\(/.test(main) && /function exitReplay\(/.test(main) && /function seekReplay\(/.test(main)
  && /if \(replayOn\(\)\) \{ tickReplay\(now\); return; \}/.test(main)
  && /if \(!replayOn\(\)\) recordEvent\(/.test(main)
  && /replay-home/.test(main) && /dataset\.act = 'replay-open'/.test(main) && /dataset\.act = 'replay-exit'/.test(main)
  && !/[\u3400-\u9fff]/.test(rpSrc2);
check('W45', 'M8.5 操作回放：载入 UTlog JSON，校验 schema_version；构建 / 知识 / 合同版本不符仍回放并标「记录版本不符」「仅供参考」；时间轴、播放 / 暂停、1× / 4× / 16×；探头按帧、A 扫按仪器状态合成，轨迹与覆盖累积；事件标记从关键帧前推；回放只读、不写入原会话，退出恢复', replayOk);

check('W32', '标准包：NB/T 47013.3 条款数值（判据、灵敏度、扫查、评级表）集中在 standard_nbt47013_3.json，代码与页面文字从标准包取值', stdOk,
  `${std.code}; ${stdItems.length} items; tokens ${usedTok.length}${badTok.length ? ` unresolved ${badTok.join(',')}` : ''}${hardText.length ? ` hardcoded ${hardText.join(',')}` : ''}`);

check('W25', 'V5步骤条：教师切换保留数据，显式加载本步演示才替换数据；完整流程自学可分步查看，系统提供参考准备；检测实训仅开放扫查/定量/评定；预设落点数值正确', presetOk && calPreOk && stepUiOk && /function loadStepDemo\(/.test(main)
  && Math.abs(hDac - 80) < 1 && Math.abs(hSens - 80) < 1, `calibrated CSK B1 ${byId(calPre, 'B1').x_mm.toFixed(2)} / B2 ${byId(calPre, 'B2').x_mm.toFixed(2)}; DAC preset H15 ${hDac.toFixed(1)}%; sensitivity preset H45 ${hSens.toFixed(1)}%`);

const dist = join(app, 'dist', 'index.html');
if (existsSync(dist)) {
  const html = readFileSync(dist, 'utf8');
  const external = [...html.matchAll(/(?:src|href)=["'](https?:)?\/\/[^"']+/g)].map((m) => m[0]);
  check('W8', 'dist/index.html 单文件、无外部网络依赖', external.length === 0, external.join(', '));
  const glbs = html.split('data:model/gltf-binary;base64,').length - 1;
  check('W9', 'dist/index.html 内嵌直探头、仪器、试块、器材与斜探头 GLB（data URI）', glbs === 5, `${glbs} GLB, ${(statSync(dist).size / 1048576).toFixed(2)} MB`);
}

// B1 weld track (probe_angle_beam_v1/docs/B_INTEGRATION_PLAN.md): angle-beam structure and principle views beside the plate track.
{
  const rd = (f) => (existsSync(join(angleDir, f)) ? readFileSync(join(angleDir, f), 'utf8') : '');
  const appSrc = rd('app.js');
  const css = rd('angle.css').replace(/\/\*[\s\S]*?\*\//g, '');
  const selectors = [...css.replace(/@media[^{]+\{/g, '').replace(/@keyframes[^{]+\{(?:[^{}]*\{[^}]*\})*\s*\}/g, '').matchAll(/([^{}]+)\{/g)]
    .flatMap((m) => m[1].split(',').map((s) => s.trim())).filter(Boolean);
  const unscoped = selectors.filter((s) => !/^(body\.classroom )?\.angle-root\b/.test(s));
  const sibling = join(proj, '..', 'probe_angle_beam_v1');
  const SYNC = [['assets/probe_angle_beam.glb', 'assets/probe_angle_beam.glb'], ['contracts/model_manifest.json', 'contracts/angle_model_manifest.json'],
    ['contracts/derived_layout.json', 'contracts/angle_derived_layout.json'], ['knowledge/parts.json', 'knowledge/angle_parts.json'],
    ['knowledge/ui_strings.json', 'knowledge/angle_ui.json'], ['knowledge/logo.json', 'knowledge/angle_logo.json']];
  const stale = existsSync(sibling) ? SYNC.filter(([a, b]) => !existsSync(join(proj, b)) || !readFileSync(join(sibling, a)).equals(readFileSync(join(proj, b)))).map(([, b]) => b)
    : SYNC.filter(([, b]) => !existsSync(join(proj, b))).map(([, b]) => b);
  const man = readJson('contracts/angle_model_manifest.json');
  const tracksOk = learningEntry.tracks?.map((t) => t.id).join() === 'plate,weld'
    && Object.values(learningEntry.roles).every((r) => r.items.every((it) => ['plate', 'weld'].includes(it.track)))
    && ['teacher', 'student'].every((role) => ['angle-structure', 'angle-principle'].every((route) => learningEntry.roles[role].items.some((it) => it.route === route && it.track === 'weld')))
    && learningEntry.roles.exam.items.filter((it) => it.track === 'weld').map((it) => it.route).join() === 'angle-exam'
    && /trackedEntries/.test(shellSrc) && /data-learning-track/.test(shellSrc);
  const hookOk = /async function launchWeld\(/.test(main) && /import\('\.\/angle\/app\.js'\)/.test(main)
    && /closeStdPage\(\); closeTaskPage\(\); closeReport\(\); closeAngle\(\);/.test(main)
    && /recTick\(now\);\s*if \(document\.body\.dataset\.track === 'weld'\) return;/.test(main)
    && /replayOn\(\) \|\| document\.body\.dataset\.track === 'weld'\) return;/.test(main);
  const viteSrc = readFileSync(join(app, 'vite.config.js'), 'utf8');
  const hashOk = (viteSrc.match(/!f\.startsWith\('angle_'\)/g) || []).length === 2;
  const appOk = /export function mountAngle\(/.test(appSrc) && /setActive\(false\)/.test(appSrc) && /renderRefraction\(/.test(appSrc)
    && !/className = '(tabs|lead|formula|mis|part-list|tab-body)'/.test(appSrc) && !/make\('[a-z]+', '(tabs|lead|formula|mis|part-list|tab-body)\b/.test(appSrc)
    && /setActive\(on\)/.test(rd('viewer.js')) && /energySplit\(/.test(rd('principle.js')) && /none: \{/.test(rd('diagrams.js'));
  const devOk = man.designation?.frequency_MHz === 5 && man.designation?.marking === '5P13\u00d713K2';
  check('W47', 'B1 焊缝检测 · 斜探头：入口按钢板 / 焊缝分轨；斜探头结构（三维展示 / 爆炸，零件原理由跳转进入）与原理（波型转换能量分配、楔内反射、背衬）独立挂载、切换即关闭并暂停直探头渲染；样式全部限定在 .angle-root；斜探头资产与源工程一致；版本哈希不含 angle_*',
    tracksOk && hookOk && hashOk && appOk && devOk && !unscoped.length && !stale.length,
    [!tracksOk && 'tracks', !hookOk && 'hooks', !hashOk && 'hash', !appOk && 'app', !devOk && '5P13x13K2', unscoped.length && `unscoped ${unscoped.slice(0, 3).join(' | ')}`, stale.length && `stale ${stale.join(',')}`].filter(Boolean).join('; ') || `${selectors.length} scoped selectors`);

  // B2 beam & positioning
  const bm = readJson('knowledge/angle_beam.json');
  const blocks = readJson('contracts/angle_blocks.json');
  const stdAngle = readJson('contracts/angle_standard_nbt47013_3_weld.json').items;
  const fixPath = join(app, 'tools', 'angle_b2_ref.json');
  const fix = existsSync(fixPath) ? JSON.parse(readFileSync(fixPath, 'utf8')) : null;
  const entryOk = ['teacher', 'student'].every((role) => learningEntry.roles[role].items.some((it) => it.route === 'angle-principle' && it.track === 'weld' && learningEntry.artworks[it.art]));
  const routeOk = /BEAM_TOPIC_IDS = \['skip', 'block', 'exercise'\]/.test(appSrc)
    && /'angle-principle': \['refraction', 'wedge_echo', 'damping', \.\.\.BEAM_TOPIC_IDS\]/.test(appSrc)
    && /'angle-beam': BEAM_TOPIC_IDS/.test(appSrc) && /renderBeamTopic\(/.test(appSrc)
    && ['skip', 'block', 'exercise'].every((k) => bm.topics?.[k]) && bm.formulas?.some((f) => f.latex === 'P = 2KT');
  const beamSrc = rd('beam.js');
  const modelOk = /export function createModel\(/.test(rd('model.js')) && /export function locate\(/.test(rd('locate.js'))
    && /m\.ascan\(/.test(beamSrc) && /m\.peak\(/.test(beamSrc) && /delayUs/.test(beamSrc) && /scaleValue\(/.test(beamSrc)
    && existsSync(join(proj, 'tools', 'angle_b2_ref.py')) && existsSync(join(app, 'tools', 'angle_model.test.mjs'));
  const B0_DAC = [5.03, 0, -5.70, -10.38, -17.67];
  const dacOk = !!fix && fix.dac.length === 5 && fix.dac.every((q, i) => Math.abs(q.dB - B0_DAC[i]) < 0.01);
  const csk = blocks.blocks?.['CSK-IIA-1'];
  const row = stdAngle.reference_block.rows.find((r) => r.id === 'CSK-IIA-1');
  const f14 = stdAngle.reference_block.figure_14a;
  const blockOk = !!csk && csk.T_mm === row.T_mm && csk.hole_phi_mm === stdAngle.reference_block.sdh_phi_mm
    && csk.holes.map((h) => h.z_mm).sort((a, b) => a - b).join() === row.holes_depth_mm.join()
    && csk.holes.filter((h) => f14.hole_depths_left_mm.includes(h.z_mm)).every((h) => h.x_mm === f14.hole_from_end_mm.left)
    && csk.holes.filter((h) => f14.hole_depths_right_mm.includes(h.z_mm)).every((h) => h.x_mm === csk.length_mm - f14.hole_from_end_mm.right);
  check('W48', 'B2 声束与定位并入原理：一次波 / 二次波与跨距 P = 2KT；CSK-IIA-1 横孔试块拖动探头、A 扫声程 / 水平 / 深度时基与零点；定位计算练习；JS 回波模型与 Python 参考逐点一致；试块孔位取自标准包',
    entryOk && routeOk && modelOk && dacOk && blockOk,
    [!entryOk && 'entry', !routeOk && 'route', !modelOk && 'model', !dacOk && 'dac', !blockOk && 'block'].filter(Boolean).join('; ') || `DAC ${fix.dac.map((q) => q.dB.toFixed(2)).join(' / ')} dB`);

  // B3 blocks & calibration
  const cb = readJson('knowledge/angle_calib.json');
  const calC = readJson('contracts/angle_calibration.json');
  const fix3Path = join(app, 'tools', 'angle_b3_ref.json');
  const fix3 = existsSync(fix3Path) ? JSON.parse(readFileSync(fix3Path, 'utf8')) : null;
  const cbEntryOk = ['teacher', 'student'].every((role) => learningEntry.roles[role].items.some((it) => it.route === 'angle-calib' && it.track === 'weld' && learningEntry.artworks[it.art]));
  const cbRouteOk = /'angle-calib': CALIB_TOPICS/.test(appSrc) && /renderCalibTopic\(/.test(appSrc)
    && /export const CALIB_TOPICS = \['index', 'time', 'kval', 'dac'\]/.test(rd('calibpage.js'))
    && ['index', 'time', 'kval', 'dac'].every((k) => cb.topics?.[k] && cb.formulas?.[k]);
  const sb = stdAngle.standard_block.features;
  const ia = calC.csk_ia;
  const iaOk = ia.length_mm === sb.length_mm && ia.height_mm === sb.height_mm
    && ia.arcs.map((a) => a.R_mm).join() === sb.R_mm.join() && ia.hole1_5.phi_mm === sb.hole_phi_mm
    && ia.hole1_5.x_mm === sb.hole_from_end_mm && ia.height_mm - ia.hole1_5.z_mm === sb.hole_from_bottom_mm
    && Object.entries(sb.k_marks_top).every(([k, x]) => ia.k_marks_top[k] === x && Math.abs(ia.hole50.x_mm + ia.hole50.z_mm * +k - x) < 1e-9);
  const ideal = fix3?.cases.find((c) => c.name === 'ideal');
  const r100 = ideal?.arcs.find((a) => a.xi === ia.arc_centre_x_mm)?.echoes.find((q) => q.id === 'R100');
  const row27 = stdAngle.dac_sensitivity.rows.find((r) => r.t_mm[0] <= calC.dac.plate_t_mm && calC.dac.plate_t_mm <= r.t_mm[1]);
  const calOk = !!ideal && Math.abs(ideal.tof.t0 - ideal.delay_us) < 1e-6 && Math.abs(ideal.tof.v - 3230) < 1e-6
    && !!r100 && Math.abs(20 * Math.log10(r100.P)) < 0.5
    && fix3.cases.every((c) => c.dac.every((q, i) => i !== 1 || q.dB === 0))
    && ideal.dac.every((q, i) => Math.abs(q.dB - B0_DAC[i]) < 0.01)
    && ideal.scan.lines.EL === row27.EL_dB && ideal.scan.lines.SL === row27.SL_dB && ideal.scan.lines.RL === row27.RL_dB
    && existsSync(join(proj, 'tools', 'angle_b3_ref.py')) && existsSync(join(app, 'tools', 'angle_calib.test.mjs'));
  check('W49', 'B3 试块与校准：随机偏差探头；CSK-IA R100 最高波测前沿、R50 / R100 两点调声速与零点、Φ50 测 K 值；CSK-IIA-1 逐孔记录 DAC，EL / SL / RL 取表 27，扫查灵敏度 EL ≥ 20 %；JS 与 Python 参考逐点一致；CSK-IA 尺寸与 K 标记取自标准包',
    cbEntryOk && cbRouteOk && iaOk && calOk,
    [!cbEntryOk && 'entry', !cbRouteOk && 'route', !iaOk && 'csk-ia', !calOk && 'calibration'].filter(Boolean).join('; ') || `v ${ideal.tof.v.toFixed(0)} m/s · t0 ${ideal.tof.t0.toFixed(3)} µs · scan ${ideal.scan.gain_dB.toFixed(1)} dB`);

  // B4 weld scanning
  const sc = readJson('knowledge/angle_scan.json');
  const casesC = readJson('contracts/angle_cases.json');
  const fix4Path = join(app, 'tools', 'angle_b4_ref.json');
  const fix4 = existsSync(fix4Path) ? JSON.parse(readFileSync(fix4Path, 'utf8')) : null;
  const { createWeld } = await import(new URL('../src/angle/weld.js', import.meta.url));
  const Wd = createWeld(readJson('contracts/angle_waveform_rules.json'), casesC, stdAngle);
  const scEntryOk = ['teacher', 'student'].every((role) => learningEntry.roles[role].items.some((it) => it.route === 'angle-scan' && it.track === 'weld' && learningEntry.artworks[it.art]));
  const scRouteOk = /'angle-scan': SCAN_TOPICS,/.test(appSrc) && /renderScanTopic\(/.test(appSrc)
    && /export const SCAN_TOPICS = \['long', 'trans'(, 'eval')?\]/.test(rd('scanpage.js'))
    && ['long', 'trans'].every((k) => sc.topics?.[k] && sc.formulas?.[k]);
  const cov = Wd.coverage([1, -1]);
  const covOk = !!fix4 && cov.covered === fix4.coverage.both.covered && cov.inside === fix4.coverage.both.inside && cov.frac === 1;
  const demoOk = !!fix4 && Wd.demo().length === 6 && Math.abs(Wd.dMin - fix4.d_min) < 1e-9 && Math.abs(Wd.dMax - fix4.d_max) < 1e-9
    && Wd.lines.EL === row27.EL_dB && Wd.lines.SL === row27.SL_dB && Wd.lines.RL === row27.RL_dB
    && fix4.cases.every((c) => JSON.stringify(Wd.generateCase(c.seed).defects) === JSON.stringify(c.defects))
    && existsSync(join(proj, 'tools', 'angle_b4_ref.py')) && existsSync(join(app, 'tools', 'angle_weld.test.mjs'));
  const gScan = Wd.scanGain();
  const scSrc = rd('scanpage.js');
  const pracBarOk = /ag-op-bar-m/.test(rd('practice.js')) && /PS\.barM\.appendChild\(pad\)/.test(scSrc)
    && /startOpen: studentOpen/.test(scSrc);
  check('W50', 'B4 焊缝扫查：22 mm X80 对接焊缝示例 / 随机试板；两侧锯齿扫查与横向扫查，转角 / 环绕；底栏视角 / 探头操控 / 参数调节 / 波形图，侧栏提示与记录；探头移动区 d_min–d_max、不压余高；截面覆盖（一次波下半、二次波上半）两侧 100 %；EL / SL / RL 取表 27，横向 +6 dB；JS 与 Python 参考一致',
    scEntryOk && scRouteOk && covOk && demoOk && gScan > 50 && gScan < 70 && pracBarOk,
    [!scEntryOk && 'entry', !scRouteOk && 'route', !covOk && 'coverage', !demoOk && 'demo', !(gScan > 50 && gScan < 70) && 'gain', !pracBarOk && 'bar'].filter(Boolean).join('; ') || `d ${Wd.dMin.toFixed(1)}–${Wd.dMax} mm · scan ${gScan.toFixed(2)} dB · cover ${cov.covered}/${cov.inside}`);

  // B5 indication length, grading and verdict
  const fix5Path = join(app, 'tools', 'angle_b5_ref.json');
  const fix5 = existsSync(fix5Path) ? JSON.parse(readFileSync(fix5Path, 'utf8')) : null;
  const evTabOk = /export const SCAN_TOPICS = \['long', 'trans', 'eval'\]/.test(scSrc) && /renderEval\(/.test(scSrc)
    && /checkMarks\(/.test(scSrc) && /systemLength\(/.test(scSrc) && /openReport\(/.test(scSrc) && /licenseMark\(\)/.test(scSrc)
    && sc.topics?.eval && sc.formulas?.eval?.length === 3 && sc.eval?.grades && sc.report?.title;
  const evDemo = Wd.evaluateCase(Wd.demo());
  const lim = Wd.gradeLimits();
  const gradeOk = lim.I.I === 40 && lim.II.I === 60 && lim.I.II === 8 && Math.abs(lim.II.II - 44 / 3) < 1e-9
    && casesC.specimen.acceptance_level === 'II' && (stdAngle.items ?? stdAngle).grading_pipeline.clause.includes('35');
  const evOk = !!fix5 && evDemo.level === fix5.demo.level && evDemo.verdict === fix5.demo.verdict && evDemo.level === 'III'
    && evDemo.indications.every((r, i) => r.grade === fix5.demo.indications[i].grade && r.zone === fix5.demo.indications[i].zone
      && (r.length === null ? fix5.demo.indications[i].length === null : Math.abs(r.length - fix5.demo.indications[i].length) < 1e-6))
    && existsSync(join(proj, 'tools', 'angle_b5_ref.py')) && existsSync(join(app, 'tools', 'angle_eval.test.mjs'));
  check('W51', 'B5 定量与评定：焊缝扫查第三页签；指示端点测长与系统测长（−6 dB / 端点 −6 dB / 评定线绝对灵敏度法）、性质与级别（表 35，T 22 mm：Ⅰ区 40 / 60，Ⅱ区 8 / 14.7，验收Ⅱ级，含不允许缺陷评Ⅲ级）；核对容差 max(3 mm, 20 %)；检测报告；JS 与 Python 参考一致',
    evTabOk && gradeOk && evOk,
    [!evTabOk && 'tab', !gradeOk && 'grading', !evOk && 'reference'].filter(Boolean).join('; ') || `demo ${evDemo.indications.map((r) => `${r.id}:${r.grade}`).join(' ')} · ${evDemo.level} ${evDemo.verdict}`);

  // B6 training: weld technique card, case library, weld detection exam
  const tasksC = readJson('contracts/angle_tasks.json');
  const cd = readJson('knowledge/angle_card.json');
  const fix6Path = join(app, 'tools', 'angle_b6_ref.json');
  const fix6 = existsSync(fix6Path) ? JSON.parse(readFileSync(fix6Path, 'utf8')) : null;
  const { createWeldCard } = await import(new URL('../src/angle/weldcard.js', import.meta.url));
  const WCd = createWeldCard(tasksC, stdAngle);
  const roleRoutes = (role) => learningEntry.roles[role].items.filter((it) => it.track === 'weld' && learningEntry.artworks[it.art]).map((it) => it.route);
  const b6EntryOk = ['angle-card', 'angle-cases'].every((r) => roleRoutes('teacher').includes(r))
    && roleRoutes('student').includes('angle-card') && !roleRoutes('student').includes('angle-design')
    && !roleRoutes('student').includes('angle-cases') && roleRoutes('exam').join() === 'angle-exam';
  const b6RouteOk = /\.\.\.CARD_TOPICS/.test(appSrc) && /'angle-cases': \['cases'\]/.test(appSrc) && /'angle-exam': SCAN_TOPICS,/.test(appSrc)
    && /get exam\(\) \{ return ui\.route === 'angle-exam'; \}/.test(appSrc)
    && /export const CARD_TOPICS = \{ 'angle-card': \['ref', 'try', 'design'\], 'angle-design': \['design'\] \}/.test(rd('cardpage.js'))
    && ['ref', 'try', 'design', 'cases'].every((k) => cd.topics?.[k]) && tasksC.card.fields.every((f) => cd.fields?.[f.id] && cd.basis?.[f.id === 'table' ? 'table_pipe' : f.id]);
  const thick = [...new Set(tasksC.tasks.map((t) => t.t_mm))].join();
  const pts = tasksC.card.fields.reduce((a, f) => a + f.points, 0);
  const rub = Object.values(tasksC.exam.rubric).reduce((a, r) => a + r.points, 0);
  const cardOk = !!fix6 && thick === '8,12,16,22,30,40' && pts === 100 && rub === 100
    && tasksC.tasks.every((t) => {
      const f = fix6.tasks[t.id];
      if (!f) return false;
      const r = WCd.reference(t);
      return JSON.stringify(r.card) === JSON.stringify(f.reference.card) && Math.abs(r.K[1] - f.reference.K[1]) < 1e-9
        && Object.entries(f.checks).every(([, c]) => { const k = WCd.check(c.card, t); return k.score === c.score && JSON.stringify(k.ok) === JSON.stringify(c.ok); });
    })
    && existsSync(join(proj, 'tools', 'angle_b6_ref.py')) && existsSync(join(app, 'tools', 'angle_card.test.mjs'));
  const exSrc = scSrc;
  const examOk = /scoreExam\(/.test(exSrc) && /drawSeed\(ctx\.tasks\.exam\.seed_space\)/.test(exSrc) && !/calibState\(true\)|examCalib/.test(exSrc) && !('calibration' in tasksC.exam.rubric) && /if \(!exam\) \{\s*const bCheck/.test(exSrc) && /\.\.\.\(exam \? \[\] : \[T\.sys\]\)/.test(exSrc)
    && /caseRow\.hidden = true;\s*codeRow\.hidden = true;\s*bShow\.hidden = true;\s*ss\.show = false;/.test(exSrc)
    && !JSON.stringify(learningEntry).includes('\u6848\u4f8b\u7801');
  check('W52', 'B6 焊缝实训：焊缝工艺卡（8 / 12 / 16 / 22 / 30 / 40 mm 共 12 题，K 值 / 频率按表 25 与底面法线 35°–70°，试块表 23，检测面表 N.1，探头移动区 1.25P，DAC 表 27，横向 +6 dB，评级表 33 / 35）讲解 / 自测 / 实训提交评分与记录；焊缝案例库；焊缝检测实例随机抽取试板、仪器预置，提交前不显示缺陷、无系统测长与核对，评分 100 分；JS 与 Python 参考一致',
    b6EntryOk && b6RouteOk && cardOk && examOk,
    [!b6EntryOk && 'entry', !b6RouteOk && 'route', !cardOk && 'card', !examOk && 'exam'].filter(Boolean).join('; ') || `${tasksC.tasks.length} tasks · card ${pts} · exam ${rub}`);
}

const fails = results.filter((r) => r.status !== 'PASS');
for (const r of results) console.log(`${r.status}  ${r.id}  ${r.desc}${r.detail ? `  [${r.detail}]` : ''}`);
console.log(fails.length ? `FAIL ${fails.length}` : `PASS ${results.length}/${results.length}`);
process.exit(fails.length ? 1 : 0);
