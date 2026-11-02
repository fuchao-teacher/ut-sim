import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import './ui/tokens.css';
import './theme.css';
import './style.css';
import './learning-workflow.css';
import WF from '../../knowledge/learning-workflow.json';
import V4 from '../../knowledge/v4.json';
import V5 from '../../knowledge/v5.json';
import { detectionCaseSummary, detectionDacAlarm } from './v5-practice.js';
import './v5-practice.css';
import { createLearningShell } from './learning-shell.js';
import { initLicense, showLicenseGate, licensedStudent, licenseHolder, isReviewSession, licenseMark, showLicenseNotice } from './license.js';
import { openManual, setManualNavigator } from './manual.js';
import { framed, savePng, shotName, grabGl, backdropOf } from './snapshot.js';
import { visibleIndication, scanQuality } from './learning-workflow.js';
import { learningHelpAllowed, validationCaseIds, measuredBoundaryState } from './learning-policy.js';
import { learnVisit, learnDemo, learnTotal, learnDone, learnScore, learnRecord } from './learnlog.js';
import { stepScore } from './studyscore.js';
import studyDoc from '../../knowledge/study_report.json';
import learningDoc from '../../knowledge/learning.json';
import theoryDoc from '../../knowledge/theory-learning.json';
import { theoryStateAtStep, renderTheoryLearning } from './theory-learning.js';
import './theory-learning.css';

import glbUrl from '../../assets/probe_single_contact.glb?url';
import nameplateUrl from '../../assets/probe_nameplate.png?url';
import probeAppearance from '../../knowledge/probe-appearance.json';
import { applyProbeAppearance } from './probe-appearance.js';
import partsDoc from '../../knowledge/probe_parts.json';
import classroomDoc from '../../knowledge/classroom_cards.json';
import UI from '../../knowledge/ui_strings.json';
import scenesDoc from '../../knowledge/scenes.json';
import quizDoc from '../../knowledge/misconceptions.json';
import manifest from '../../contracts/model_manifest.json';
import contract from '../../contracts/events_contract.json';
import derived from '../../contracts/derived_layout.json';
import instGlbUrl from '../../assets/instrument_generic.glb?url';
import inspDoc from '../../knowledge/inspection.json';
import instMan from '../../contracts/instrument_manifest.json';
import waveRules from '../../contracts/waveform_rules.json';
import { createPhysics } from './physics.js';
import { drawAscan, drawQuarterWave } from './ascan.js';
import { createInstrument } from './instrument.js';
import { createWaveform, drawScope, inMainBang, gateReading } from './waveform.js';
import { createInspection } from './inspection.js';
import specGlbUrl from '../../assets/specimens_generic.glb?url';
import specManGlb from '../../contracts/specimens_manifest.json';
import stdPack from '../../contracts/standard_nbt47013_3.json';
import practiceDoc from '../../knowledge/practice.json';
import stdDoc from '../../knowledge/standard.json';
import { createPractice } from './practice.js';
import { createProcedure } from './procedure.js';
import { createStandardView } from './standard.js';
import { createEquipment } from './equipment.js';
import { createLabRoom } from './lab-room.js';
import labRoomCopy from '../../knowledge/lab-room.json';
import { createAssembly } from './assembly.js';
import { createWeldPrep } from './weld-prep.js';
import eqGlbUrl from '../../assets/equipment_generic.glb?url';
import angleGlbUrl from '../../assets/probe_angle_beam.glb?url';
import pautProbeGlbUrl from '../../assets/pa_probe_parts.glb?url';
import tofdProbeGlbUrl from '../../assets/tofd_probe_parts.glb?url';
import pautInstrumentGlbUrl from '@paut-assets/tofd_teaching.glb?url';
import cbii2DrawingUrl from '../../assets/cbii_2_drawing.png?url';
import cskIaDrawingUrl from '../../assets/csk_ia_drawing.png?url';
import cskIaGlbUrl from '../../assets/csk_ia.glb?url';
import eqMan from '../../contracts/equipment_manifest.json';
import eqDoc from '../../knowledge/equipment.json';
import assessDoc from '../../knowledge/assessment.json';
import rubricDoc from '../../contracts/rubric.json';
import { createSessionStore } from './session.js';
import { coverageParams, createCoverage } from './coverage.js';
import { createScoring } from './scoring.js';
import { coverageImage, openReport, closeReport, reportHTML } from './report.js';
import { openStudy, closeStudy, STUDY_ROUTES } from './studyreport.js';
import { openPaut, closePaut, hidePaut } from './paut-bridge.js';
import { mountPautExam } from './paut-exam/page.js';
import { mountTutor } from './tutor/tutor.js';
import { parseSession, createReplay, caseAt, SPEEDS as REPLAY_SPEEDS } from './replay.js';
import casesDoc from '../../contracts/cases.json';
import { createCaselib } from './caselib.js';
import tasksDoc from '../../contracts/tasks.json';
import taskDoc from '../../knowledge/task.json';
import { createTaskcard } from './taskcard.js';
import { createTaskScoring } from './taskscore.js';
import thicknessDoc from '../../contracts/thickness.json';
import { createThickness } from './thickness.js';
import { makeReferenceCard, presetDetectionPractice, createDetectionScoring, drawLibraryCase, GUIDE_TIP_POINTS, REGION_HINT_POINTS } from './v4-training.js';
import './v4-workflow.css';
import './mobile-compact.css';
import './selfstudy.css';
const v4Format = (text, values = {}) => text.replace(/\{([a-z_]+)\}/g, (match, key) => key in values ? String(values[key]) : match);

// ------------------------------------------------------------------ contract
const specMan = { ...specManGlb, specimens: { ...specManGlb.specimens, ...specManGlb.runtime_specimens } };

// Standard pack (contracts/standard_nbt47013_3.json): values for code and {std.*} tokens in knowledge/practice.json.
const STD = stdPack.items;
const STD_TOKENS = (() => {
  const G = STD.grading;
  const lv = (k) => practiceDoc.levels[k];
  const plateT = specManGlb.specimens.specimen__plate_50.dims.thickness.value;
  const edge = STD.scan_pattern.edge_zone.find((z) => plateT >= z.t_mm[0] && (z.t_mm[1] == null || plateT < z.t_mm[1]));
  const dLevels = G.levels.filter((k) => G.table[k].max_D_dB != null);
  const { sep, or } = practiceDoc.labels.list_join;
  const join = (ks, last) => (ks.length < 2 ? ks.map(lv).join('') : `${ks.slice(0, -1).map(lv).join(sep)}${last}${lv(ks[ks.length - 1])}`);
  const t = {
    code: stdPack.code,
    b1: STD.defect_criteria.b1_limit_percent,
    scan_plus: STD.scan_sensitivity.plus_dB,
    phi: STD.reference_block.phi_mm,
    line_max: STD.scan_pattern.middle.line_spacing_max_mm,
    grid: STD.scan_pattern.middle.grid_mm,
    edge: edge.width_mm,
    overlap: Math.round(STD.scan_coverage.overlap_min_ratio * 100),
    spacing: Math.floor(manifest.parameters.active_element_diameter.value * (1 - STD.scan_coverage.overlap_min_ratio)),
    levels: join(G.levels, or),
    levels_d: join(dLevels, sep),
    levels_s: join(G.levels.filter((k) => !dLevels.includes(k)), sep),
    fail: lv(G.fail_level),
    harmful: lv(G.harmful_level),
    count_area: G.count_area_m2,
    plate_area: waveRules.practice.grading.plate_area_m2,
  };
  G.levels.forEach((k, i) => { t[`L${i + 1}`] = lv(k); });
  return t;
})();
const fillStd = (o) => {
  for (const [k, v] of Object.entries(o)) {
    if (typeof v === 'string') o[k] = v.replace(/\{std\.([a-z_0-9A-Z]+)\}/g, (m, key) => (key in STD_TOKENS ? String(STD_TOKENS[key]) : m));
    else if (v && typeof v === 'object') fillStd(v);
  }
};
fillStd(practiceDoc);
const PREFIX = contract.id_rules.prefix;
const KB = Object.fromEntries(partsDoc.parts.map((p) => [p.id, p]));
for (const c of inspDoc.cards) KB[c.id] = { ...c, formulas: c.formulas.map((f) => inspDoc.formulas[f]) };
const INSP_SCENES = Object.fromEntries(inspDoc.scenarios.map((s) => [s.id, s]));
const CC = Object.fromEntries(classroomDoc.cards.map((c) => [c.id, c]));
const QUIZ = Object.fromEntries(quizDoc.questions.map((q) => [q.id, q]));
const SCENES = Object.fromEntries(scenesDoc.scenes.map((s) => [s.id, s]));
const MAIN_SCENES = scenesDoc.scenes.filter((s) => s.kind !== 'removal');
const REMOVAL_SCENES = scenesDoc.scenes.filter((s) => s.kind === 'removal');
const SCENE_BY_PART = Object.fromEntries(MAIN_SCENES.map((s) => [s.part_id, s.id]));
// Part -> [scene, step] that plays its "if removed" consequence.
const REMOVAL_BY_PART = Object.fromEntries(REMOVAL_SCENES.map((s) => [s.part_id, [s.id, 0]]));
for (const s of MAIN_SCENES) {
  s.steps.forEach((st, i) => {
    if (st.backing === false && !REMOVAL_BY_PART.probe__backing) REMOVAL_BY_PART.probe__backing = [s.id, i];
    if (st.medium === 'air' && !REMOVAL_BY_PART.probe__couplant) REMOVAL_BY_PART.probe__couplant = [s.id, i];
    if (st.ml === false && s.part_id === 'probe__matching_layer_optional') REMOVAL_BY_PART[s.part_id] = [s.id, i];
  });
}
const LIVE_EVENTS = new Set(contract.events.filter((e) => ['M2', 'M3', 'M3b', 'M4', 'M5.2', 'M5.3', 'M5.4', 'M5.5', 'M6.1', 'M6.2', 'M6.3', 'M6.4', 'M6.5', 'M7.1', 'M7.2', 'M7.4', 'M8.1', 'M8.2', 'M8.3', 'M8.5', 'M9.2', 'M9.3', 'M10.1', 'M11'].includes(e.milestone)).map((e) => e.name));
const STATES = manifest.states;
const TAB_KEYS = Object.keys(UI.card_tabs);
const TAB_NUM = ['①', '②', '③', '④', '⑤', '⑥', '⑦'];
const CHAIN_OF = {};
for (const [key, ch] of Object.entries(UI.chains)) for (const id of ch.ids) CHAIN_OF[id] = key;

const REF_RE = /^(probe__[a-z_]+)\.([a-z_]+)\[(\d+)\]$/;
function resolveRef(ref) {
  const m = REF_RE.exec(ref);
  return m ? KB[m[1]][m[2]][Number(m[3])] : '';
}
function resolveChain(ref) {
  const m = /^quiz:(Q\d+)\.knowledge_chain$/.exec(ref || '');
  return m ? QUIZ[m[1]].knowledge_chain : [];
}

const listeners = {};
function on(name, fn) { (listeners[name] ||= []).push(fn); }
function emit(name, payload = {}) {
  if (!LIVE_EVENTS.has(name)) throw new Error(`event not in contract: ${name}`);
  (listeners[name] || []).forEach((fn) => fn(payload));
  window.dispatchEvent(new CustomEvent(`probe:${name}`, { detail: payload }));
  if (!replayOn()) recordEvent(name, payload);
}

// ------------------------------------------------------------------ dom
const $ = (id) => document.getElementById(id);
const el = (tag, cls, html) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html !== undefined) n.innerHTML = html;
  return n;
};
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const richText = (s) => esc(s).replace(/UNKNOWN \/ VENDOR-DEPENDENT|VENDOR-DEPENDENT/g, (m) => `<span class="vendor">${m}</span>`);
const stdView = createStandardView({ pack: stdPack, doc: stdDoc, levels: practiceDoc.levels, sep: practiceDoc.labels.list_join.sep, esc });
// {clause:item_id} in practice texts: clause chip (opens the standard overlay at that clause).
const stdChip = (id) => (STD[id] ? `<button class="std-chip" data-std="${id}">${esc(stdView.clauseNo(id))}</button>` : '');
const withChips = (html) => html.replace(/\s*\{clause:([a-z_0-9]+)\}/g, (m, id) => stdChip(id));

const viewport = $('viewport');
const canvas = $('gl');
const panel = $('panel');
const labelsBox = $('labels');
const leaders = $('leaders');
const badgesBox = $('badges');
const tooltip = $('tooltip');

document.title = UI.title;
$('title').textContent = UI.title;

// ------------------------------------------------------------------ state
const S = {
  mode: 'equipment',
  eqMode: 'equipment',
  eqId: null,
  ssEq: 'devices',
  ssDev: null,
  eqLearned: {},
  eqKit: {},
  eqKitOrder: [],
  eqExamCouplant: '',
  eqKitDrawn: null,
  studyKit: {},
  studyKitPhase: 'picking',
  labStation: null,
  stationProg: {},
  stationPanel: 'phases',
  weldExamKit: {},
  weldExamKitOrder: [],
  weldExamCouplant: '',
  weldExamPrep: null,
  weldExamKitDone: false,
  eqHint: false,
  eqPan: 0,
  asmEntered: false,
  asmDone: false,
  prMode: 'physics',
  prView: 'scenes',
  explode: 0,
  clip: 1,
  selected: null,
  hovered: null,
  isolated: null,
  xray: false,
  labels: true,
  tab: TAB_KEYS[0],
  study: 'self',
  step: 0,
  sview: 'cutaway',
  scene: null,
  sceneStep: 0,
  playing: false,
  beam: true,
  ghost: new Set(),
  hidden: new Set(),
  ml: false,
  mlK: 0,
  mlBefore: false,
  mag: 1,
  strain: 0,
  wobble: 0,
  warn: [],
  labF: scenesDoc.teaching_settings.lab.f_default_MHz,
  labD: scenesDoc.teaching_settings.lab.D_default_mm,
  labDamp: scenesDoc.teaching_settings.lab.damping_default,
  inspCam: 'system',
  inspExp: null,
  inspPrediction: null,
  panel: { fn: 'gain', gateSub: 0, frozen: false, msg: null, msgUntil: 0 },
  insp: {
    scene: inspDoc.scenarios[0].id,
    ...Object.fromEntries(Object.entries(waveRules.controls).map(([k, v]) => [k, v.default])),
    ...inspDoc.scenarios[0].defaults,
  },
  prac: null,
  inspStash: null,
  // Assessment tab: its own practice state and bench, swapped into S.prac / the bench while the tab is open.
  exam: false,
  pracTrain: null,
  examPrac: null,
  benchTrain: null,
  benchExam: null,
  examExported: false,
  replay: null,
  replayHold: null,
  case: null,
  caseTrain: null,
  caseExam: null,
  caseTpl: casesDoc.templates.find((t) => !t.fixed).id,
  caseRef: false,
  teacher: { open: false, tpl: casesDoc.templates.find((t) => !t.fixed).id, code: '', no: '', level: null, cs: null, bad: false },
  // Field task tab (docs/M10_SCOPE.md): page with task list, brief and procedure card; cards kept per task.
  taskPage: false,
  task: { id: null, cards: {}, designs: {}, context: null, step: 'learn', tests: {}, learn: {}, seen: new Set() },
  learning: { role: null, route: null, taskMode: 'guided', student: { name: '', student_no: '' } },
  // Task execution (M10.2): exam-like context (S.exam stays true) on the task plate; taskRun = task of the live or stashed run.
  taskOn: false,
  taskRun: null,
  taskPrac: null,
  caseTask: null,
};
let probeWorld = null;
let labRoom = null;
let worldReady = false;
let pendingLabRoom = false;
initLicense({
  onGrant: () => {
    const st = licensedStudent();
    if (st) S.learning.student = { ...st };
    if (worldReady) openLabRoom();
    else pendingLabRoom = true;
  },
});
try { window.__tutor = mountTutor(document.body); } catch (e) { console.warn('tutor mount failed', e); }
document.addEventListener('click', (ev) => { if (ev.target instanceof Element && ev.target.closest('[data-lic-notice]')) showLicenseNotice(); });
document.addEventListener('click', (ev) => { if (ev.target instanceof Element && ev.target.closest('[data-manual-open]')) openManual(); });
$('btn-manual').addEventListener('click', (ev) => {
  ev.currentTarget.blur();
  openManual(S.learning?.route || null);
});
setManualNavigator((role, route) => learningShell?.openRoute(role, route));
const EQ_MODES = new Set(['equipment', 'exterior', 'structure']);
const PR_MODES = new Set(['physics', 'lab']);
const topModeOf = (m) => (S.taskOn && (m === 'equipment' || m === 'practice') ? 'task'
  : S.exam && (m === 'equipment' || m === 'practice') ? 'assessment'
  : EQ_MODES.has(m) ? 'equipment' : PR_MODES.has(m) ? 'principle' : m);
const LOCKED_TOPS = new Set(['principle', 'inspection', 'practice', 'assessment', 'task']);
let store = null;
const examLocked = () => S.exam && !!S.prac?.submitted;
const replayOn = () => !!S.replay;
const selfStudy = () => S.learning.role === 'student' && !S.exam;
const studyFullFlow = () => !S.exam && S.learning.route === 'fullscan';
const detectionTraining = () => S.learning.role === 'exam' && S.exam && !S.taskOn;
const floatControls = () => detectionTraining() || studyFullFlow();
const MOBILE_TAB_KEY = 'ut.m11.mobile_tab';
const MOBILE_TABS = ['scene', 'wave', 'ops'];
const mobileTabOf = () => {
  try {
    const t = localStorage.getItem(MOBILE_TAB_KEY);
    if (MOBILE_TABS.includes(t)) return t;
  } catch { /* default */ }
  return 'wave';
};
const compactPracticeFlow = () => S.mode === 'practice' && (detectionTraining() || studyFullFlow() || S.taskOn || (S.exam && !S.taskOn));
const referenceCardLearning = () => S.learning.route === 'task' && S.learning.taskMode === 'guided';
const teacherAccess = () => S.learning.role === 'teacher' && !!learningShell?.teacherUnlocked();
const PRESET_LOCKS = new Set(['range_mm', 'velocity_m_s', 'zero_us', 'reject_percent', 'coupling', 'damping']);
const topOpen = () => true;
const stateKey = () => (S.mode === 'structure' ? S.sview : S.mode);
const sysMode = (m = S.mode) => m === 'inspection' || m === 'practice' || m === 'equipment';

// Practice instrument state: the M5.5 panel works on S.insp, which holds this object while mode practice is active.
const SPEC_IDS = Object.keys(specMan.specimens);
const PLATE_IDS = waveRules.practice.plates.ids;
const EVAL_SPEC = waveRules.practice.step_presets.evaluate.specimen;
// Training random plate (contracts/cases.json, docs/M9_SCOPE.md §5): a runtime specimen, present once generated.
const CASE_ID = casesDoc.plate.specimen_id;
const FIXED_TPL = casesDoc.templates.find((t) => t.fixed);
const FALSE_CALL = contract.events.find((e) => e.name === 'practice:false_call').payload.verdict.split('|');
const isPlate = (id) => PLATE_IDS.includes(id) || (id === CASE_ID && !!specMan.specimens[CASE_ID]);
const PRAC_SCENE = inspDoc.scenarios[0];
const specT = (id) => {
  const d = specMan.specimens[id].dims;
  return (d.thickness || d.thickness_T).value;
};
function practiceInst() {
  return {
    ...Object.fromEntries(Object.entries(waveRules.controls).map(([k, v]) => [k, v.default])),
    scene: PRAC_SCENE.id,
    ...PRAC_SCENE.defaults,
    range_mm: waveRules.controls.range_mm.default,
    velocity_m_s: waveRules.practice.controls.velocity_m_s_initial,
    zero_us: waveRules.practice.controls.zero_us.default,
    reject_percent: waveRules.practice.controls.reject_percent.default,
    peak_memory: waveRules.practice.controls.peak_memory.default,
    dac_show: true,
    dac_alarm_enabled: true,
    thickness_mm: specT(SPEC_IDS[0]),
    defects: [],
    specimen_id: SPEC_IDS[0],
    probe_x_mm: 0,
    probe_y_mm: 0,
  };
}
// exam: no x-ray, no guide; asmDone / submitted are exam-only (bench assembled once, evaluation submitted); task: also holds the confirmed card.
function freshPrac({ exam = false, task = false } = {}) {
  const P = {
    specimen: SPEC_IDS[0],
    probe: Object.fromEntries(SPEC_IDS.map((id) => {
      const sp = specMan.specimens[id];
      const st = sp.probe_start || sp.calibration?.probe_start || { x_mm: 0, y_mm: 0 };
      return [id, { x: st.x_mm, y: st.y_mm }];
    })),
    section: 'off',
    inst: practiceInst(),
    step: 'calibrate',
    done: {},
    calib: { points: {} },
    dac: { points: [] },
    sens: null,
    plateId: PLATE_IDS[0],
    plates: Object.fromEntries(PLATE_IDS.map((id) => [id, { scan: freshScan(), quant: freshQuant() }])),
    eval: freshEval(),
    crit: null,
    guide: !exam,
    guideItem: null,
    std: false,
    stdFocus: null,
    xray: exam ? false : waveRules.practice.dac.xray.default,
    xrayPlate: exam ? false : waveRules.practice.dac.xray.plate_default,
    cover: false,
    asmDone: false,
    submitted: false,
    score: null,
    shots: {},
    hints: [],
    tips: [],
  };
  if (task) P.card = null;
  for (const k of ['scan', 'quant']) {
    Object.defineProperty(P, k, {
      enumerable: true,
      get() { return this.plates[this.plateId][k]; },
      set(v) { this.plates[this.plateId][k] = v; },
    });
  }
  return P;
}
S.prac = freshPrac();
function freshScan() { return { trail: [], flags: [], cells: new Set(), found: [], speed: { len_mm: 0, over_mm: 0 } }; }
function freshQuant() { return { target: null, pts: {}, eq: {}, results: {}, subs: {} }; }
function freshEval() { return { level: null, verdicts: {}, plate: null, conclusion: null, result: null }; }

// ------------------------------------------------------------------ three
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.localClippingEnabled = true;
renderer.toneMapping = THREE.AgXToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.85;

const camera = new THREE.PerspectiveCamera(24, 1, 0.002, 12);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 0.03;
controls.maxDistance = 0.9;
controls.enablePan = true;
controls.enableRotate = true;
controls.screenSpacePanning = true;
controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE;
controls.mouseButtons.MIDDLE = THREE.MOUSE.DOLLY;
controls.mouseButtons.RIGHT = THREE.MOUSE.PAN;
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

const key = new THREE.DirectionalLight(0xffffff, 1.5);
key.position.set(0.16, 0.38, 0.24);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
Object.assign(key.shadow.camera, { left: -0.16, right: 0.16, top: 0.16, bottom: -0.16, near: 0.05, far: 1.2 });
key.shadow.bias = -0.0002;
key.shadow.normalBias = 0.0004;
key.shadow.radius = 4;
scene.add(key, key.target);
const rim = new THREE.DirectionalLight(0xdfe8ff, 0.6);
rim.position.set(-0.3, 0.2, -0.25);
scene.add(rim);

const ground = new THREE.Mesh(new THREE.PlaneGeometry(3, 3), new THREE.ShadowMaterial({ opacity: 0.16 }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const clipPlane = new THREE.Plane(new THREE.Vector3(-1, 0, 0), 1);
let CLIP_OFF = 0.05;

// Camera framing per mode (glTF world, metres): target, view direction, distance.
const VIEWS = {
  exterior: { target: [0, 0.016, 0], dir: [1, 0.3, 1.25], dist: 0.18 },
  cutaway: { target: [0, 0.014, 0], dir: [1, 0.3, 0.5], dist: 0.16 },
  exploded: { target: [0, -0.040, 0], dir: [1, 0.3, 1.0], dist: 0.46 },
  physics: scenesDoc.cameras.overview,
  lab: scenesDoc.cameras.beam,
  inspection: scenesDoc.cameras.system,
  practice: scenesDoc.cameras.practice,
  equipment: scenesDoc.cameras.equipment,
  labroom: scenesDoc.cameras.labroom,
};
const INSP_CAMS = { system: 'system', probe: 'system_probe', screen: 'screen', panel: 'instrument_panel' };
const SHADOW_EXTENT = { normal: 0.16, inspection: 0.46 };
const MAX_DIST = { normal: 0.9, inspection: 1.6, equipment: 2.8, labroom: 16 };
const CAM_FOV = 24;

// ------------------------------------------------------------------ tweens
const tweens = new Map();
const ease = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
function tween(key, from, to, ms, update) {
  const prev = tweens.get(key);
  if (prev) prev.resolve(false);
  return new Promise((resolve) => {
    tweens.set(key, { t0: performance.now(), from, to, ms, update, resolve });
  });
}
function stepTweens(now) {
  for (const [key, t] of tweens) {
    const k = Math.min(1, (now - t.t0) / t.ms);
    t.update(t.from + (t.to - t.from) * ease(k));
    if (k >= 1) {
      tweens.delete(key);
      t.resolve(true);
    }
  }
}

// ------------------------------------------------------------------ parts
const parts = {};
const meshToPart = new Map();
const pickMeshes = [];
let root = null;

const tmpBox = new THREE.Box3();
const tmpV = new THREE.Vector3();

function sectionColor(mat) {
  if (mat.map) return new THREE.Color(0.035, 0.035, 0.035);
  const c = mat.color.clone();
  const m = mat.metalness ?? 0;
  return c.multiplyScalar(m > 0.5 ? 0.42 : 0.7);
}

function initParts(gltf) {
  probeWorld = gltf.scene;
  root = gltf.scene.getObjectByName('probe_assembly_root');
  scene.add(gltf.scene);
  for (const obj of root.children) {
    if (!obj.name.startsWith(PREFIX)) continue;
    const pid = obj.name;
    const ud = obj.userData;
    const p = { pid, obj, ud, kb: KB[pid], clip: ud.cutaway === 'clip', meshes: [], anchors: [], anchorOk: false };
    const found = [];
    obj.traverse((m) => { if (m.isMesh) found.push(m); });
    found.forEach((m) => {
      let mat = m.material.clone();
      if (!mat.emissive) {
        p.convertedFrom = mat.type;
        mat = new THREE.MeshStandardMaterial({
          name: mat.name, color: mat.color, map: mat.map || null,
          transparent: mat.transparent, opacity: mat.opacity, roughness: 0.6, metalness: 0,
        });
      }
      if (p.clip && !mat.transparent) mat.side = THREE.FrontSide;
      mat.clippingPlanes = p.clip ? [clipPlane] : null;
      mat.clipShadows = true;
      m.material = mat;
      m.userData.base = {
        emissive: mat.emissive.clone(),
        emissiveIntensity: mat.emissiveIntensity,
        opacity: mat.opacity,
        transparent: mat.transparent,
        depthWrite: mat.depthWrite,
      };
      m.castShadow = !mat.transparent;
      m.receiveShadow = true;
      if (p.clip && !mat.transparent) {
        const cap = new THREE.Mesh(m.geometry, new THREE.MeshBasicMaterial({
          color: sectionColor(mat), side: THREE.BackSide, clippingPlanes: [clipPlane],
        }));
        cap.raycast = () => {};
        cap.userData.baseColor = cap.material.color.clone();
        m.add(cap);
        m.userData.cap = cap;
      }
      p.meshes.push(m);
      meshToPart.set(m, p);
      pickMeshes.push(m);
    });
    tmpBox.setFromObject(obj);
    const size = tmpBox.getSize(new THREE.Vector3());
    p.volume = size.x * size.y * size.z;
    p.thin = size.y < 0.0015;
    p.samples = sampleVertices(p);
    parts[pid] = p;
  }
  const q = root.getWorldQuaternion(new THREE.Quaternion());
  const cut = STATES.cutaway.clip_plane;
  clipPlane.normal.fromArray(cut.normal_local).applyQuaternion(q).normalize();
  tmpBox.setFromObject(root);
  CLIP_OFF = Math.max(Math.abs(tmpBox.min.x), Math.abs(tmpBox.max.x)) + 0.002;
  setClip(CLIP_OFF);
}

function sampleVertices(p) {
  const out = [];
  for (const m of p.meshes) {
    const pos = m.geometry.attributes.position;
    const n = 6;
    for (let i = 0; i < n; i++) {
      const idx = Math.floor(((i + 0.5) / n) * pos.count);
      out.push({ mesh: m, v: new THREE.Vector3().fromBufferAttribute(pos, idx) });
    }
  }
  return out;
}

// ------------------------------------------------------------------ stack layout
// Local-z shifts (mm) of the acoustic stack for the matching-layer variant and thin-layer magnify,
// following manifest.variants.matching_layer_on and events_contract view:thin_layer_magnify.
const ML_ID = 'probe__matching_layer_optional';
const P_ = manifest.parameters;
const E_T = P_.electrode_visual_thickness.value;
const ML_T = P_.matching_layer_teaching_thickness.value;
const EL_T = P_.active_element_thickness.value;
const BASE_D = P_.active_element_diameter.value;
const LAB = scenesDoc.teaching_settings.lab;
const REF = manifest.reference_physics;
const MORPH = manifest.variants.matching_layer_on.morph_target_name;
const SCALED = ['probe__rear_electrode', 'probe__front_electrode', 'probe__active_element'];
const RADIAL = ['probe__active_element', 'probe__front_electrode', 'probe__rear_electrode'];
const WOBBLE_IDS = ['probe__backing', 'probe__rear_electrode', 'probe__active_element', 'probe__front_electrode', ML_ID, 'probe__wear_face'];
let wires = [];
let stackKey = '';

function initStack() {
  scene.updateMatrixWorld(true);
  for (const p of Object.values(parts)) p.baseZ = p.obj.position.z;
  for (const pid of SCALED) {
    const p = parts[pid];
    tmpBox.setFromObject(p.obj);
    p.cy = p.obj.worldToLocal(tmpBox.getCenter(new THREE.Vector3())).y;
  }
  // Wiring: bake the endpoint-driven morph per wire so signal / ground ends can follow different electrodes.
  const found = [];
  for (const m of parts['probe__wiring'].meshes) {
    const g = m.geometry;
    const d = g.morphAttributes.position?.[0];
    if (!d) continue;
    if (m.morphTargetInfluences) m.morphTargetInfluences.fill(0);
    const base = Float32Array.from(g.attributes.position.array);
    const world = [];
    const v = new THREE.Vector3();
    for (let i = 0; i < g.attributes.position.count; i++) {
      v.fromBufferAttribute(g.attributes.position, i);
      m.localToWorld(v);
      world.push([v.y, v.z, Math.hypot(d.getX(i), d.getY(i), d.getZ(i))]);
    }
    found.push({ m, g, base, delta: d, world, rel: g.morphTargetsRelative });
  }
  // Ground wire ends at the front electrode, i.e. the moving vertex closest to the face.
  let best = null;
  for (const w of found) for (const [y, z, dm] of w.world) if (dm > 1e-7 && (!best || y < best[0])) best = [y, z];
  const groundSign = Math.sign(best ? best[1] : -1);
  wires = found.map((w) => ({ ...w, side: w.world.map(([, z]) => (Math.sign(z) === groundSign ? 'g' : 's')) }));
}

function stackShift() {
  const t = ML_T * S.mlK;
  const g = E_T * (S.mag - 1);
  return {
    probe__front_electrode: -t - g / 2,
    probe__active_element: -t - g,
    probe__rear_electrode: -t - 1.5 * g,
    probe__backing: -t - 2 * g,
  };
}

function deformWires(sh) {
  const ks = -sh.probe__rear_electrode / ML_T;
  const kg = -sh.probe__front_electrode / ML_T;
  for (const w of wires) {
    const pos = w.g.attributes.position;
    const a = pos.array;
    for (let i = 0; i < pos.count; i++) {
      const k = w.side[i] === 's' ? ks : kg;
      a[i * 3] = w.base[i * 3] + w.delta.getX(i) * k;
      a[i * 3 + 1] = w.base[i * 3 + 1] + w.delta.getY(i) * k;
      a[i * 3 + 2] = w.base[i * 3 + 2] + w.delta.getZ(i) * k;
    }
    pos.needsUpdate = true;
    w.g.computeBoundingSphere();
    w.g.computeBoundingBox();
  }
  const sleeve = parts['probe__inner_sleeve'];
  for (const m of sleeve.meshes) {
    const idx = m.morphTargetDictionary?.[MORPH];
    if (idx !== undefined) m.morphTargetInfluences[idx] = -sh.probe__backing / ML_T;
  }
}

function applyLayout() {
  if (!root) return;
  const sh = stackShift();
  for (const p of Object.values(parts)) {
    const off = p.ud.explode_offset_z_mm + (p.ud.explode_offset_z_ml_mm - p.ud.explode_offset_z_mm) * S.mlK;
    p.obj.position.y = (p.ud.assembled_z_mm + (sh[p.pid] || 0) + S.explode * off) / 1000;
    if (WOBBLE_IDS.includes(p.pid)) p.obj.position.z = p.baseZ + S.wobble;
  }
  const scaleAbout = (pid, s, extraMm = 0) => {
    const p = parts[pid];
    p.obj.scale.y = s;
    p.obj.position.y += p.cy * (1 - s) + extraMm / 1000;
  };
  const dh = (EL_T * S.strain) / 2;
  scaleAbout('probe__active_element', 1 + S.strain);
  scaleAbout('probe__rear_electrode', S.mag, -dh);
  scaleAbout('probe__front_electrode', S.mag, dh);
  const dS = S.mode === 'lab' ? S.labD / BASE_D : 1;
  for (const pid of RADIAL) {
    parts[pid].obj.scale.x = dS;
    parts[pid].obj.scale.z = dS;
  }
  const ml = parts[ML_ID];
  if (ml) ml.obj.visible = isShown(ml);
  const key = `${S.mlK.toFixed(4)}|${S.mag}|${dS.toFixed(4)}`;
  if (key !== stackKey) {
    stackKey = key;
    deformWires(sh);
    root.updateMatrixWorld(true);
    physics?.layout();
    anchorsDirty = true;
  }
}

function labDerived() {
  const lambda_mm = (REF.steel_cL_m_s / 1000) / S.labF;
  const N_mm = (S.labD * S.labD) / (4 * lambda_mm);
  const sinT = Math.min(0.999, (1.22 * lambda_mm) / S.labD);
  const half_angle_deg = (Math.asin(sinT) * 180) / Math.PI;
  const t_mm = (REF.piezo_cp_m_s_assumed / 1000) / (2 * S.labF);
  return { lambda_mm, N_mm, half_angle_deg, t_mm, cycles: LAB.damping_cycles[S.labDamp] };
}

function applyLabOptics() {
  if (!physics) return;
  if (S.mode === 'lab') {
    const d = labDerived();
    physics.setBeamParams({
      lambda_mm: d.lambda_mm,
      near_field_mm: d.N_mm,
      half_angle_deg: d.half_angle_deg,
      radius_mm: S.labD / 2,
    });
  } else {
    physics.setBeamParams({
      lambda_mm: derived.physics.lambda_steel_mm,
      near_field_mm: derived.physics.near_field_mm,
      half_angle_deg: derived.physics.half_angle_deg,
      radius_mm: null,
    });
  }
  applyLayout();
}

function setLabFrequency(f) {
  S.labF = Math.max(LAB.f_min_MHz, Math.min(LAB.f_max_MHz, f));
  applyLabOptics();
  updateLabLive();
  emit('lab:frequency', { f_MHz: S.labF });
}

function setLabDiameter(D) {
  S.labD = Math.max(LAB.D_min_mm, Math.min(LAB.D_max_mm, D));
  applyLabOptics();
  updateLabLive();
  emit('lab:diameter', { D_mm: S.labD });
}

function setLabDamping(level) {
  if (!(level in LAB.damping_cycles)) return;
  S.labDamp = level;
  for (const b of panel.querySelectorAll('.lab-damp button')) {
    b.classList.toggle('on', b.dataset.level === level);
  }
  updateLabLive();
  emit('lab:damping', { level });
}

function resetLab() {
  S.labF = LAB.f_default_MHz;
  S.labD = LAB.D_default_mm;
  S.labDamp = LAB.damping_default;
  applyLabOptics();
  if (S.mode === 'lab') renderPanel();
  emit('lab:frequency', { f_MHz: S.labF });
  emit('lab:diameter', { D_mm: S.labD });
  emit('lab:damping', { level: S.labDamp });
}

function updateLabLive() {
  if (S.mode !== 'lab') return;
  const d = labDerived();
  const L = UI.lab;
  const fmt = (x, n = 2) => (Math.abs(x) >= 100 ? x.toFixed(1) : x.toFixed(n));
  const vals = [
    `${fmt(d.lambda_mm)} ${L.unit_mm}`,
    `${fmt(d.N_mm, 1)} ${L.unit_mm}`,
    `${fmt(d.half_angle_deg, 1)}${L.unit_deg}`,
    `${fmt(d.t_mm)} ${L.unit_mm}`,
  ];
  panel.querySelectorAll('.lab-kv b').forEach((n, i) => { if (vals[i]) n.textContent = vals[i]; });
  const fIn = panel.querySelector('input[data-lab="f"]');
  const dIn = panel.querySelector('input[data-lab="D"]');
  if (fIn) {
    fIn.value = String(S.labF);
    const out = fIn.parentElement.querySelector('.lab-val');
    if (out) out.textContent = `${S.labF % 1 ? S.labF.toFixed(1) : S.labF} ${L.unit_MHz}`;
  }
  if (dIn) {
    dIn.value = String(S.labD);
    const out = dIn.parentElement.querySelector('.lab-val');
    if (out) out.textContent = `${S.labD % 1 ? S.labD.toFixed(1) : S.labD} ${L.unit_mm}`;
  }
  drawLabAscan();
  updateBadges();
}

function drawLabAscan() {
  const cnv = panel.querySelector('.lab-ascan canvas');
  if (!cnv || S.mode !== 'lab') return;
  const d = labDerived();
  const L = UI.lab;
  const as = scenesDoc.teaching_settings.ascan;
  drawAscan(cnv, {
    traces: [{ label: L.damping_levels[S.labDamp], cycles: d.cycles, color: UI.chains.acoustic.color }],
    f0: S.labF,
    c: REF.steel_cL_m_s / 1000,
    depths: as.reflector_depths_mm,
    window: as.window_us,
    marks: true,
    text: { main_bang: UI.scene_labels.main_bang },
    laneH: S.study === 'classroom' ? 100 : 88,
  });
}

function isShown(p) {
  if (!p.ud.default_visible && !(p.pid === ML_ID && S.mlK > 0.001)) return false;
  if (p.ud.exploded_behavior === 'hidden' && S.explode > 0.001) return false;
  if (S.isolated && S.isolated !== p.pid) return false;
  if (S.hidden.has(p.pid)) return false;
  if (S.mode === 'practice' && STATES.practice.hidden_ids.includes(p.pid)) return false;
  if (S.mode === 'equipment' && STATES.equipment.hidden_ids.includes(p.pid)) return false;
  return true;
}

function updateVisibility() {
  for (const p of Object.values(parts)) p.obj.visible = isShown(p);
  updateSteelSection();
  updateBadges();
  anchorsDirty = true;
}

function applyExplode(f) {
  S.explode = f;
  applyLayout();
  const steel = parts['probe__steel_block'];
  if (steel) ground.position.y = tmpBox.setFromObject(steel.obj).min.y;
  updateVisibility();
  syncControls();
}

// Probe assembly translation away from the M5 origin (mode practice); the probe clip plane moves with it.
const probeOffset = new THREE.Vector3();
function setClip(c) {
  S.clip = c;
  clipPlane.constant = c - clipPlane.normal.dot(probeOffset);
  anchorsDirty = true;
  updateSteelSection();
}
const clipActive = () => S.clip < CLIP_OFF - 1e-4;

// Opaque section face for the steel block (a box): the back-face cap alone reads as hollow from oblique views.
const steelSection = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
steelSection.visible = false;
steelSection.raycast = () => {};
scene.add(steelSection);
// Flat-bottom hole (runtime object, inspection scenes): drilled from the bottom face on the beam axis.
const fbhWall = new THREE.Mesh(
  new THREE.CylinderGeometry(1, 1, 1, 40, 1, false),
  new THREE.MeshStandardMaterial({ color: 0x3b4148, metalness: 0.5, roughness: 0.5, side: THREE.BackSide, clippingPlanes: [clipPlane] }),
);
fbhWall.visible = false;
fbhWall.raycast = () => {};
scene.add(fbhWall);
let steelKey = '';

function inspDefect() {
  if (S.mode !== 'inspection') return null;
  const d = INSP_SCENES[S.insp.scene].defects[0];
  if (!d) return null;
  return { depth: d.near_surface ? d.depth_mm : S.insp.defect_depth_mm, phi: d.diameter_mm };
}

function updateSteelSection() {
  const p = parts['probe__steel_block'];
  if (!p || !p.clip) return;
  const cap = p.meshes[0]?.userData.cap;
  const show = clipActive() && p.obj.visible && (!cap || cap.visible);
  const def = show ? inspDefect() : null;
  steelSection.visible = show;
  fbhWall.visible = !!def;
  if (!show) return;
  if (cap) steelSection.material.color.copy(cap.material.color);
  tmpBox.setFromObject(p.obj);
  const { min, max } = tmpBox;
  const nx = clipPlane.normal.x;
  const r = def ? def.phi / 2000 : 0;
  const yTop = def ? max.y - def.depth / 1000 : 0;
  const key = [min.y, max.y, min.z, max.z, r, yTop].join('|');
  if (key !== steelKey) {
    steelKey = key;
    // Outline in (u = -z, v = y): rotation.y = +90° lays it on the section plane.
    const s = new THREE.Shape();
    s.moveTo(-max.z, min.y);
    if (def) {
      s.lineTo(-r, min.y);
      s.lineTo(-r, yTop);
      s.lineTo(r, yTop);
      s.lineTo(r, min.y);
    }
    s.lineTo(-min.z, min.y);
    s.lineTo(-min.z, max.y);
    s.lineTo(-max.z, max.y);
    s.closePath();
    steelSection.geometry.dispose();
    steelSection.geometry = new THREE.ShapeGeometry(s);
  }
  steelSection.position.set(-clipPlane.constant / nx + nx * 2e-5, 0, 0);
  steelSection.rotation.set(0, Math.PI / 2, 0);
  if (def) {
    fbhWall.scale.set(r, yTop - min.y, r);
    fbhWall.position.set(0, (yTop + min.y) / 2, 0);
  }
}

const SEL_CAP = new THREE.Color(0.95, 0.5, 0.04);
const HOVER_CAP = new THREE.Color(0.1, 0.35, 0.95);

function refreshMaterials(full) {
  for (const p of Object.values(parts)) {
    const ghost = (S.xray && p.pid !== S.selected) || S.ghost.has(p.pid);
    for (const m of p.meshes) {
      const b = m.userData.base;
      const mat = m.material;
      if (p.pid === S.selected) {
        mat.emissive.setRGB(0.95, 0.55, 0.05);
        mat.emissiveIntensity = p.thin ? 0.7 : 0.35;
      } else if (p.pid === S.hovered) {
        mat.emissive.setRGB(0.1, 0.35, 0.95);
        mat.emissiveIntensity = 0.3;
      } else {
        mat.emissive.copy(b.emissive);
        mat.emissiveIntensity = b.emissiveIntensity;
      }
      const cap = m.userData.cap;
      if (cap) {
        cap.material.color.copy(cap.userData.baseColor);
        if (p.pid === S.selected) cap.material.color.lerp(SEL_CAP, 0.45);
        else if (p.pid === S.hovered) cap.material.color.lerp(HOVER_CAP, 0.35);
      }
      if (full) {
        mat.transparent = ghost || b.transparent;
        mat.opacity = ghost ? Math.min(b.opacity, 0.14) : b.opacity;
        mat.depthWrite = ghost ? false : b.depthWrite;
        mat.needsUpdate = true;
        m.castShadow = !ghost && !b.transparent;
        if (m.userData.cap) m.userData.cap.visible = !ghost;
      }
    }
  }
  if (instrument) instrument.highlight(S.selected, S.hovered);
  updateSteelSection();
}

// ------------------------------------------------------------------ inspection system
let instrument = null;
let wave = null;
let practice = null;
let equipment = null;
let assembly = null;
let weldPrep = null;
const inspOn = () => (S.mode === 'inspection' || S.mode === 'practice') && !!instrument;
const eqOn = () => S.mode === 'equipment' && !!equipment;
const allParts = () => (inspOn() || eqOn() ? [...Object.values(parts), ...(instrument?.parts || [])] : Object.values(parts));
const activePick = () => {
  if (eqOn()) {
    const extra = weldPrepOn() ? weldPrep.pickMeshes() : [];
    return pickMeshes.concat(instrument?.pickMeshes || [], equipment.pickMeshes(), extra);
  }
  if (inspOn()) return pickMeshes.concat(instrument.pickMeshes);
  return pickMeshes;
};
const isSystemPart = (pid) => !!pid && !parts[pid];

// ------------------------------------------------------------------ picking
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();

function validHits(hits) {
  return hits.filter((h) => {
    const p = meshToPart.get(h.object);
    if (!p || !p.obj.visible) return false;
    if (p.clip && clipActive() && clipPlane.distanceToPoint(h.point) < -1e-6) return false;
    return true;
  });
}

function castRay(origin, dir, far = Infinity) {
  raycaster.set(origin, dir);
  raycaster.far = far;
  const meshes = activePick();
  const sides = meshes.map((m) => m.material.side);
  meshes.forEach((m) => { m.material.side = THREE.DoubleSide; });
  const hits = raycaster.intersectObjects(meshes, false);
  meshes.forEach((m, i) => { m.material.side = sides[i]; });
  raycaster.far = Infinity;
  return validHits(hits);
}

function pickAt(clientX, clientY) {
  const r = canvas.getBoundingClientRect();
  ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const hits = castRay(raycaster.ray.origin.clone(), raycaster.ray.direction.clone());
  if (!hits.length) return null;
  if (S.xray) {
    let best = null;
    for (const h of hits) {
      const p = meshToPart.get(h.object);
      if (!best || p.volume < best.volume) best = p;
    }
    return best.pid;
  }
  return meshToPart.get(hits[0].object).pid;
}

// Instrument key / encoder under the pointer (inspection mode), unless something else is in front.
function pickControlAt(clientX, clientY) {
  if (!inspOn()) return null;
  const r = canvas.getBoundingClientRect();
  ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const ctl = instrument.pickControl(raycaster);
  if (!ctl) return null;
  const first = castRay(raycaster.ray.origin.clone(), raycaster.ray.direction.clone())[0];
  return first && first.distance < ctl.distance - 1e-4 ? null : ctl;
}

function controlName(ctl) {
  return ctl.id === 'encoder' ? PANEL.encoder : PANEL.keys[ctl.id].name;
}

// ------------------------------------------------------------------ selection
function select(pid) {
  if (pid && S.mode !== 'physics' && ssEquip()) return;
  if (pid && S.mode === 'physics' && SCENE_BY_PART[pid] && S.scene !== SCENE_BY_PART[pid]) {
    startScene(SCENE_BY_PART[pid]);
    return;
  }
  if (pid === S.selected) {
    if (pid && S.study === 'classroom' && S.step < 2) setStep(S.step + 1);
    return;
  }
  S.selected = pid;
  S.tab = TAB_KEYS[0];
  S.step = 0;
  if (S.isolated && S.isolated !== pid) {
    S.isolated = null;
    updateVisibility();
  }
  refreshMaterials(true);
  renderPanel();
  syncControls();
  anchorsDirty = true;
  emit('part:select', { part_id: pid });
  if (pid && S.study === 'classroom') emit('why:open', { part_id: pid });
}

function setStep(n) {
  S.step = n;
  renderPanel();
}

function setStudy(mode) {
  if (mode === S.study) return;
  S.study = mode;
  S.step = 0;
  document.body.classList.toggle('classroom', mode === 'classroom');
  renderStudy();
  renderModes();
  renderPanel();
  lastLabelKey = '';
  anchorsDirty = true;
}

function renderStudy() {
  const nav = $('study');
  nav.innerHTML = '';
  for (const [mode, label] of Object.entries(UI.study_modes)) {
    const b = el('button', mode === S.study ? 'active' : '', esc(label));
    b.setAttribute('role', 'tab');
    b.onclick = () => setStudy(mode);
    nav.appendChild(b);
  }
}

function setHover(pid, clientX, clientY) {
  if (pid !== S.hovered) {
    S.hovered = pid;
    refreshMaterials(false);
    emit('part:hover', { part_id: pid });
  }
  if (pid) {
    const r = viewport.getBoundingClientRect();
    tooltip.hidden = false;
    tooltip.textContent = KB[pid].name_zh;
    tooltip.style.left = `${clientX - r.left}px`;
    tooltip.style.top = `${clientY - r.top}px`;
    canvas.style.cursor = 'pointer';
  } else {
    tooltip.hidden = true;
    canvas.style.cursor = '';
  }
}

// Equipment bench: raw hits on bench items (the couplant bottle is not a probe / instrument part).
const visibleChain = (o) => { for (; o; o = o.parent) if (!o.visible) return false; return true; };
function rayAt(clientX, clientY) {
  const r = canvas.getBoundingClientRect();
  ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  return raycaster.ray.clone();
}
function benchHits(clientX, clientY) {
  rayAt(clientX, clientY);
  return raycaster.intersectObjects(activePick(), false).filter((h) => visibleChain(h.object));
}

// Bench drag (M7.4 / M7.6): any bench item under the pointer moves; mouse wheel while dragging turns it;
// a press without movement selects the item.
let benchDrag = null;
const ROT_STEP = THREE.MathUtils.degToRad(15);
const SMALL = new Set(['plug', 'probe', 'bottle']);
function benchGrab(hits) {
  const first = hits[0];
  if (first?.object.name !== 'system__probe_cable') return first;
  // The thin cable body does not block a plug / probe / bottle right behind it.
  return hits.slice(1).find((x) => SMALL.has(assembly.handleOf(x.object)?.kind)) || first;
}
function endBenchDrag() {
  if (!benchDrag) return;
  const d = benchDrag;
  benchDrag = null;
  controls.enabled = true;
  canvas.releasePointerCapture?.(d.id);
  canvas.style.cursor = '';
  if (!d.started) { selectEq(d.eq); return; }
  emitAsm(assembly.end());
}
canvas.addEventListener('wheel', (e) => {
  if (!benchDrag?.started || !assembly) return;
  e.preventDefault();
  e.stopImmediatePropagation();
  if (assembly.rotate(Math.sign(e.deltaY) * ROT_STEP)) anchorsDirty = true;
}, { capture: true, passive: false });
let benchHoverQueued = null;
canvas.addEventListener('pointermove', (e) => {
  if (S.mode === 'labroom' && labRoom && !document.body.classList.contains('lab-catalog')) {
    const hit = labRoomHit(e.clientX, e.clientY);
    if (hit) {
      tooltip.hidden = false;
      tooltip.textContent = hit.kind === 'intro'
        ? labRoom.introName()
        : (labRoom.canSit() ? labRoom.stationName(hit.index) : labRoomCopy.need_brief);
      const r = viewport.getBoundingClientRect();
      tooltip.style.left = `${e.clientX - r.left}px`;
      tooltip.style.top = `${e.clientY - r.top}px`;
      canvas.style.cursor = 'pointer';
    } else {
      tooltip.hidden = true;
      canvas.style.cursor = '';
    }
    return;
  }
  if (benchDrag || !eqOn() || !assembly) return;
  if (!benchHoverQueued) {
    requestAnimationFrame(() => {
      const q = benchHoverQueued;
      benchHoverQueued = null;
      if (!q || benchDrag || !eqOn()) return;
      const hit = benchGrab(benchHits(q.x, q.y));
      const h = hit && assembly.handleOf(hit.object);
      canvas.style.cursor = h ? 'grab' : '';
    });
  }
  benchHoverQueued = { x: e.clientX, y: e.clientY };
});
canvas.addEventListener('pointerdown', (e) => {
  if (e.button === 0 && S.mode === 'labroom' && labRoom && !document.body.classList.contains('lab-catalog')) {
    const hit = labRoomHit(e.clientX, e.clientY);
    if (!hit) return;
    e.stopImmediatePropagation();
    if (hit.kind === 'intro') labRoom.toggleIntro();
    else if (!labRoom.canSit()) labRoom.nudgeGuide();
    else if (!labRoom.stationOpen(hit.index)) return;
    else if (!stationSitReady(hit.index)) { showLabSitCap(); return; }
    else sitLabStation(hit.index);
    return;
  }
  if (e.button !== 0 || !eqOn() || !assembly) return;
  if (replayOn() || (S.exam && examLocked())) { e.stopImmediatePropagation(); return; }
  // Before exam session starts: click identifies kit on the bench; do not begin assembly drag.
  if (S.exam && !store?.get(S.taskOn ? 'task' : 'exam')) return;
  // Self-study workbench: allow free drag; short clicks still mark kit via pointerup → selectEq.
  const hits = benchHits(e.clientX, e.clientY);
  const hit = benchGrab(hits);
  const picked = equipment?.pickFromHits(hits);
  if (picked === 'eq__kitcase' && studyBenchPicking() && !stationKitOpened() && !stationProgOf().kit) {
    e.stopImmediatePropagation();
    playStationKit();
    return;
  }
  const h = hit && assembly.handleOf(hit.object);
  if (!h) {
    if (weldPrepOn() && hit && weldPrep.owns(hit.object)) e.stopImmediatePropagation();
    return;
  }
  if (stationBlockFixed(picked || h.id)) {
    e.stopImmediatePropagation();
    selectEq(picked || h.id);
    return;
  }
  e.stopImmediatePropagation();
  benchDrag = { h, eq: picked, grab: hit.point.clone(), x0: e.clientX, y0: e.clientY, id: e.pointerId, started: false };
  controls.enabled = false;
  canvas.setPointerCapture?.(e.pointerId);
  canvas.style.cursor = 'grabbing';
}, { capture: true });
canvas.addEventListener('pointermove', (e) => {
  if (!benchDrag) return;
  e.stopImmediatePropagation();
  if (!benchDrag.started) {
    if (Math.hypot(e.clientX - benchDrag.x0, e.clientY - benchDrag.y0) < 5) return;
    benchDrag.started = true;
    if (!S.asmEntered) { S.asmEntered = true; emit('assembly:enter'); }
    assembly.begin(benchDrag.h, rayAt(e.clientX, e.clientY), benchDrag.grab);
  } else {
    assembly.move(rayAt(e.clientX, e.clientY));
  }
  anchorsDirty = true;
}, { capture: true });
canvas.addEventListener('pointerup', (e) => {
  if (!benchDrag) return;
  e.stopImmediatePropagation();
  endBenchDrag();
}, { capture: true });

let down = null;
let hoverQueued = null;
canvas.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY }; });
canvas.addEventListener('pointerup', (e) => {
  if (!down || !root) return;
  const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
  down = null;
  if (moved > 5) return;
  if (eqOn()) {
    selectEq(equipment.pickFromHits(benchHits(e.clientX, e.clientY)));
    return;
  }
  const ctl = pickControlAt(e.clientX, e.clientY);
  if (ctl && ctl.id !== 'encoder') { pressPanelKey(ctl.id); return; }
  select(pickAt(e.clientX, e.clientY));
});

// Encoder: click on the left / right half = one detent down / up; horizontal drag; mouse wheel.
let encDrag = null;
let wheelAcc = 0;
const ENC_DRAG_PX = 14;
canvas.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  const ctl = pickControlAt(e.clientX, e.clientY);
  if (!ctl || ctl.id !== 'encoder') return;
  e.stopImmediatePropagation();
  encDrag = { x0: e.clientX, y0: e.clientY, last: e.clientX, acc: 0, moved: 0, side: ctl.side, id: e.pointerId };
  canvas.setPointerCapture?.(e.pointerId);
}, { capture: true });
canvas.addEventListener('pointermove', (e) => {
  if (!encDrag) return;
  e.stopImmediatePropagation();
  encDrag.acc += e.clientX - encDrag.last;
  encDrag.last = e.clientX;
  encDrag.moved = Math.max(encDrag.moved, Math.hypot(e.clientX - encDrag.x0, e.clientY - encDrag.y0));
  const n = Math.trunc(encDrag.acc / ENC_DRAG_PX);
  if (n) {
    encDrag.acc -= n * ENC_DRAG_PX;
    turnPanelEncoder(n);
  }
}, { capture: true });
canvas.addEventListener('pointerup', (e) => {
  if (!encDrag) return;
  e.stopImmediatePropagation();
  if (encDrag.moved < 5) turnPanelEncoder(encDrag.side);
  canvas.releasePointerCapture?.(encDrag.id);
  encDrag = null;
}, { capture: true });
canvas.addEventListener('wheel', (e) => {
  const ctl = pickControlAt(e.clientX, e.clientY);
  if (!ctl || ctl.id !== 'encoder') return;
  e.preventDefault();
  e.stopImmediatePropagation();
  wheelAcc += e.deltaY;
  const n = Math.trunc(wheelAcc / 100);
  if (n) {
    wheelAcc -= n * 100;
    turnPanelEncoder(-n);
  }
}, { capture: true, passive: false });
canvas.addEventListener('pointermove', (e) => {
  if (e.buttons) { setHover(null); return; }
  hoverQueued = { x: e.clientX, y: e.clientY };
});
canvas.addEventListener('pointerleave', () => { hoverQueued = null; setHover(null); });
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && labRoom?.introOn?.()) {
    labRoom.stopIntro();
    return;
  }
  if (e.key === 'Escape' && document.body.classList.contains('lab-catalog')) {
    document.body.classList.remove('lab-catalog');
    syncLabRoomBack();
    return;
  }
  if (e.key === 'Escape') select(null);
});
window.addEventListener('keydown', (e) => {
  const key = (labRoomCopy.hotkey || 'L');
  if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key !== key && e.key !== key.toLowerCase()) return;
  if (typingField()) return;
  if (!labRoom || !worldReady) return;
  e.preventDefault();
  goLabRoom();
}, true);

// ------------------------------------------------------------------ camera
function viewPose(v) {
  const aspect = camera.aspect || 1.45;
  const dist = v.dist * Math.max(1, 1.45 / aspect);
  const target = new THREE.Vector3().fromArray(v.target);
  const pos = new THREE.Vector3().fromArray(v.dir).normalize().multiplyScalar(dist).add(target);
  return { target, pos };
}

function flyTo(pose, ms = 900) {
  const p0 = camera.position.clone();
  const t0 = controls.target.clone();
  return tween('camera', 0, 1, ms, (k) => {
    camera.position.lerpVectors(p0, pose.pos, k);
    controls.target.lerpVectors(t0, pose.target, k);
    anchorsDirty = true;
  });
}

function focusPart(pid) {
  tmpBox.setFromObject((parts[pid] || instrument.parts.find((p) => p.pid === pid)).obj);
  const c = tmpBox.getCenter(new THREE.Vector3());
  const size = tmpBox.getSize(new THREE.Vector3()).length();
  const dir = camera.position.clone().sub(controls.target).normalize();
  return flyTo({ target: c, pos: c.clone().add(dir.multiplyScalar(Math.max(0.06, size * 2.6))) });
}

// ------------------------------------------------------------------ modes
let modeToken = 0;
async function setMode(mode, { view = null, force = false, keepCamera = false } = {}) {
  const sview = mode === 'structure' ? (view || S.sview) : S.sview;
  const key = mode === 'structure' ? sview : mode;
  if (!STATES[key]) return;
  if (mode === S.mode && sview === S.sview && !force) return;
  const token = ++modeToken;
  const modeChanged = mode !== S.mode;
  const prev = S.mode;
  if (modeChanged && prev === 'physics') stopScene();
  S.mode = mode;
  S.sview = sview;
  if (EQ_MODES.has(mode)) S.eqMode = mode;
  if (PR_MODES.has(mode)) S.prMode = mode;
  if (mode !== 'physics' && mode !== 'lab' && physics) {
    physics.setActive(false);
    refreshMaterials(false);
  }
  renderModes();
  if ($('legacyMore')) $('legacyMore').open = false;
  renderLegend();
  renderStage();
  syncControls();
  updateBadges();
  if (modeChanged) emit('mode:change', { mode });
  if (mode === 'structure') emit('structure:view', { view: sview });
  dimEnvironment(mode === 'exterior');
  if (mode === 'physics' && !S.scene) {
    physics.configure({ anim: 'idle', reverse: false, beam: S.beam, backing: true, medium: 'couplant' });
    physics.setActive(true);
    renderPanel();
  }
  if (mode === 'lab') {
    if (S.selected) { S.selected = null; S.isolated = null; updateVisibility(); refreshMaterials(true); }
    S.beam = true;
    physics.configure({ anim: 'anim__beam_in_steel', reverse: false, beam: true, backing: true, medium: 'couplant' });
    physics.setActive(true);
    applyLabOptics();
    renderPanel();
  } else if (prev === 'lab') {
    applyLabOptics();
  }
  if (modeChanged && sysMode(mode)) S.inspCam = 'system';
  if (modeChanged && sysMode(prev)) applySystemScene(false, prev);
  // force: boot creates equipment after S.mode is already 'equipment' — still apply bench.
  if ((modeChanged || force) && sysMode(mode)) applySystemScene(true, mode);
  if (mode === 'labroom' || prev === 'labroom') applyLabRoomScene(mode === 'labroom');
  if ((modeChanged || force) && (mode === 'physics' || mode === 'lab' || mode === 'labroom' || sysMode(mode) || sysMode(prev) || S.selected === null)) renderPanel();
  lastLabelKey = '';
  anchorsDirty = true;
  const st = STATES[key];
  eqPanBox.hidden = mode !== 'equipment';
  if (!keepCamera) {
    setEqPan(0, { move: false });
    flyTo(viewPose(VIEWS[key]), 1100);
  }
  if (!st.clip_plane && clipActive()) {
    await tween('clip', S.clip, CLIP_OFF, 500, setClip);
    if (token !== modeToken) return;
  }
  if (Math.abs(S.explode - st.explode_factor) > 1e-3) {
    emit('view:explode', { factor: st.explode_factor, animate: true });
    await tween('explode', S.explode, st.explode_factor, 1200, applyExplode);
    if (token !== modeToken) return;
  }
  if (st.clip_plane && Math.abs(S.clip - st.clip_plane.constant) > 1e-6) {
    await tween('clip', S.clip, st.clip_plane.constant, 900, setClip);
  }
}

function applySystemScene(on, kind = 'inspection') {
  if (!instrument) return;
  if (kind === 'practice') {
    if (!practice) return;
    applyPractice(on);
  } else if (kind === 'equipment') {
    applyEquipmentBench(on);
  }
  instrument.setVisible(on);
  ground.visible = !on;
  const e = on ? SHADOW_EXTENT.inspection : SHADOW_EXTENT.normal;
  Object.assign(key.shadow.camera, { left: -e, right: e, top: e, bottom: -e, far: on ? 2.4 : 1.2 });
  key.position.set(...(on ? [0.1, 0.62, 0.42] : [0.16, 0.38, 0.24]));
  key.target.position.set(on ? -0.12 : 0, 0, on ? 0.04 : 0);
  key.shadow.camera.updateProjectionMatrix();
  controls.maxDistance = !on ? MAX_DIST.normal
    : kind === 'equipment' ? MAX_DIST.equipment
      : MAX_DIST.inspection;
  if (!on && isSystemPart(S.selected)) S.selected = null;
  if (!on && isSystemPart(S.hovered)) setHover(null);
  if (kind !== 'equipment') {
    insp.reset();
    inspKey = '';
    instrument.setSignal(-1, 0);
    physics.drive(null);
  }
  if (on) {
    if (S.isolated) { S.isolated = null; updateVisibility(); }
    if (kind === 'practice') {
      applyInspCoupling();
      insp.setContinuous(true);
      emit('practice:enter');
    } else if (kind === 'equipment') {
      emit('equipment:enter');
    } else {
      applyInspCoupling();
      physics.configure({ anim: 'external', reverse: false, beam: false, backing: true, medium: 'couplant' });
      physics.setActive(true);
      emit('inspection:enter');
    }
  } else {
    applyInspCoupling(false);
    if (S.panel.frozen) setFreeze(false);
    S.strain = 0;
    applyLayout();
    if (equipment) equipment.setActive(false);
  }
  refreshMaterials(true);
}

function applyEquipmentBench(on) {
  if (!equipment) return;
  if (on) {
    if (S.selected) { S.selected = null; S.isolated = null; }
    physics.setActive(false);
    updateVisibility();
    equipment.setActive(true);
    // Probe sits on the bench: move the probe clip plane with it (same as practice).
    probeOffset.copy(root.position).sub(ROOT_BASE);
    setClip(S.clip);
    if (assembly) {
      assembly.setVisible(true);
      assembly.apply();
    }
    if (S.eqId) equipment.setSelected(S.eqId);
    benchKey = '';
    applyStudyMethodFilter();
    syncWeldPrep();
  } else {
    endBenchDrag();
    stopAutoAssemble();
    weldPrep?.setActive(false);
    if (assembly) assembly.setVisible(false);
    equipment.setActive(false);
    probeOffset.set(0, 0, 0);
    if (root) {
      root.position.copy(ROOT_BASE);
      root.updateMatrixWorld(true);
    }
    setClip(S.clip);
    if (instrument && CONNECTOR_TOP) instrument.setProbeAnchor(new THREE.Vector3(0, CONNECTOR_TOP, 0), { stretch: 0 });
    updateVisibility();
  }
}

function labStationAt(clientX, clientY) {
  const hit = labRoomHit(clientX, clientY);
  return hit?.kind === 'station' ? hit.index : null;
}

function labRoomHit(clientX, clientY) {
  if (!labRoom || S.mode !== 'labroom') return null;
  rayAt(clientX, clientY);
  const objs = [...(labRoom.switchPick || []), ...labRoom.pickables];
  const hit = raycaster.intersectObjects(objs, false).find((h) => visibleChain(h.object));
  return labRoom.hitKind(hit?.object) || null;
}

function applyLabRoomScene(on) {
  if (on) document.body.dataset.labRoom = '1';
  else {
    delete document.body.dataset.labRoom;
    document.body.classList.remove('lab-catalog');
  }
  void document.body.offsetWidth;
  labRoom?.setActive(!!on);
  if (probeWorld) probeWorld.visible = !on;
  key.visible = !on;
  rim.visible = !on;
  scene.background = on ? new THREE.Color(0x8fb4cc) : null;
  if (on) {
    ground.visible = false;
    applyEquipmentBench(false);
    instrument?.setVisible(false, { bench: false });
    physics?.setActive(false);
    renderer.setClearColor(0x8fb4cc, 1);
    camera.fov = 58;
    controls.minDistance = 2.2;
    controls.maxDistance = MAX_DIST.labroom;
    controls.maxPolarAngle = Math.PI * 0.49;
    controls.minPolarAngle = 0.18;
    controls.enablePan = true;
    controls.enableRotate = true;
  } else {
    renderer.setClearColor(0x000000, 0);
    camera.fov = CAM_FOV;
    controls.minDistance = 0.03;
    controls.maxPolarAngle = Math.PI;
    controls.minPolarAngle = 0;
    controls.enablePan = true;
    controls.enableRotate = true;
    tooltip.hidden = true;
    canvas.style.cursor = '';
  }
  resize();
  syncLabRoomBack();
}

async function openLabRoom() {
  if (!labRoom) return false;
  closeStdPage();
  closeTaskPage();
  closeReport();
  await closePaut();
  closePautExamPage();
  closeAngle();
  closeStudy();
  if (S.taskOn) leaveTask();
  hideStudyStageCap();
  $('studyBenchBanner')?.remove();
  $('stationEqDlg')?.remove();
  document.body.classList.remove('lab-catalog');
  delete document.body.dataset.station;
  S.stationPanel = 'phases';
  await setMode('labroom', { force: true });
  return true;
}

function sitLabStation(index = 0) {
  S.labStation = index;
  S.stationPanel = 'phases';
  const st = (learningDoc.stations || [])[index];
  if (st?.id) document.body.dataset.station = st.id;
  return openStationBench();
}

function typingField() {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName || '';
  return /^(INPUT|TEXTAREA|SELECT)$/.test(tag) || !!el.isContentEditable;
}

function labHallOn() {
  return S.mode === 'labroom' && !document.body.classList.contains('lab-catalog');
}

function syncLabRoomBack() {
  let b = $('labRoomBack');
  if (!b) {
    b = el('button', 'top-btn');
    b.id = 'labRoomBack';
    b.type = 'button';
    ($('topbarActs') || $('topbar') || document.body).insertBefore(b, $('btn-manual'));
  }
  b.onclick = () => goLabRoom();
  const key = labRoomCopy.hotkey || 'L';
  b.textContent = `${labRoomCopy.back}　${key}`;
  b.title = `${labRoomCopy.back}（${key}）`;
  b.hidden = !labRoom || !worldReady || labHallOn();
  syncStationBenchBack();
}

function stationTreeChild() {
  return S.labStation != null && !studyBenchGate()
    && (S.stationPanel === 'principle' || S.stationPanel === 'flow');
}
function openStationParent() {
  if (S.stationPanel === 'principle') return openStationBench({ panel: 'principle' });
  if (S.stationPanel === 'flow') return openStationBench({ panel: 'flow' });
  return openStationBench();
}
function syncStationBenchBack() {
  let b = $('stationBenchBack');
  if (!b) {
    b = el('button', 'top-btn');
    b.id = 'stationBenchBack';
    b.type = 'button';
    const lab = $('labRoomBack');
    ($('topbarActs') || $('topbar') || document.body).insertBefore(b, lab?.nextSibling || $('btn-manual'));
  }
  const parent = stationTreeChild();
  b.onclick = () => (parent ? openStationParent() : openStationBench());
  b.textContent = parent
    ? (learningDoc.to_parent || '返回上一级')
    : (learningDoc.to_bench || '返回工作台');
  const shellBtn = document.querySelector('.ut-learning-bench-button');
  if (shellBtn) shellBtn.textContent = b.textContent;
  const show = labRoom && worldReady && S.labStation != null && !labHallOn() && !studyBenchGate()
    && !document.body.classList.contains('lab-catalog');
  b.hidden = !show;
}

function goLabRoom() {
  if (!labRoom || !worldReady) return false;
  if (labHallOn()) return true;
  return openLabRoom();
}

function openLabCatalog() {
  if (S.mode !== 'labroom') return;
  document.body.classList.add('lab-catalog');
  labRoom?.setActive(true);
  learningShell?.showHome();
  syncLabRoomBack();
}

// Probe wear face at world point v on the bench (assembly.js); clip plane follows as in practice.
function benchProbe(v) {
  probeOffset.copy(v);
  root.position.copy(ROOT_BASE).add(v);
  root.updateMatrixWorld(true);
  setClip(S.clip);
  anchorsDirty = true;
}

function emitAsm(list) {
  for (const { name, payload } of list) {
    if (name === 'assembly:attach') emit('assembly:attach', payload);
    else if (name === 'assembly:error') emit('assembly:error', payload);
    else if (name === 'assembly:done') {
      emit('assembly:done', payload);
      if (!S.asmDone) { S.asmDone = true; renderModes(); }
      if (studyFullFlow()) { S.prac.flowAssemblyDone = true; renderPanel(); }
      if (S.exam && !S.prac.asmDone) { S.prac.asmDone = true; renderPanel(); examAdvance(); }
    }
  }
  benchKey = '';
  renderAsm();
}

// Exam: after the bench is assembled, open step 1 once the "done" state has been visible for a moment.
const EXAM_ADVANCE_MS = 1200;
function examAdvance() {
  setTimeout(() => {
    if (!S.exam || S.mode !== 'equipment' || !S.prac.asmDone || examLocked()) return;
    const id = STEP_IDS[0];
    S.prac.step = id;
    setMode('practice');
    setPracticeStep(id);
  }, EXAM_ADVANCE_MS);
}

let autoTimer = 0;
function stopAutoAssemble() {
  clearTimeout(autoTimer);
  autoTimer = 0;
}
function autoAssemble() {
  if (!eqOn() || !assembly || autoTimer || S.exam) return;
  if (!S.asmEntered) { S.asmEntered = true; emit('assembly:enter'); }
  let i = 0;
  const step = () => {
    autoTimer = 0;
    if (!eqOn()) return;
    emitAsm(assembly.autoStep(i));
    i += 1;
    if (i < 4) autoTimer = setTimeout(step, eqMan.assembly.auto_step_ms);
    else renderAsm();
  };
  step();
  renderAsm();
}

function redoAssembly() {
  stopAutoAssemble();
  endBenchDrag();
  if (!assembly) return;
  assembly.reset();
  S.asmEntered = false;
  benchKey = '';
  renderAsm();
}

// Bench A-scan: calibrated plate setup (B1 at the plate start point = 80 %FSH); the assembly decides pulse / coupling.
let benchKey = '';
let benchFrame = null;
let benchOpts = null;
let benchPulse = false;
function benchInst() {
  if (S.eqInst) return S.eqInst;
  const sc = eqMan.assembly.scan;
  const s = {
    ...practiceInst(), range_mm: sc.range_mm, velocity_m_s: CAL_STATE.velocity_m_s, zero_us: CAL_STATE.zero_us,
    reject_percent: 0, peak_memory: false,
  };
  const ps = probeStart(sc.specimen);
  const b1 = wave.echoes({ ...s, specimen_id: sc.specimen, thickness_mm: specT(sc.specimen), probe_x_mm: ps.x, probe_y_mm: ps.y, coupling: 'good' })
    .find((e) => e.type === 'back_wall' && e.k === 1);
  const G = waveRules.controls.gain_dB;
  if (b1?.pct > 0) s.gain_dB = Math.min(G.max, Math.max(G.min, Math.round((s.gain_dB + 20 * Math.log10(80 / b1.pct)) * 10) / 10));
  S.eqInst = s;
  return s;
}

function tickBench(now) {
  if (!eqOn() || !assembly || !wave) return;
  const k = String(Math.floor(now / 100));
  if (k === benchKey) return;
  benchKey = k;
  const { st, pulse } = assembly.scanState(benchInst());
  const fr = wave.synth(st, { columns: 480, noise: true, seed: Math.floor(now), pulse });
  benchFrame = fr;
  benchPulse = pulse;
  const L = UI.inspection;
  const opts = {
    header: [[L.gain, `${st.gain_dB.toFixed(1)} ${L.unit_dB}`], [L.range, `${st.range_mm} ${L.unit_mm}`], [L.velocity, `${st.velocity_m_s} ${L.unit_m_s}`]],
    labels: scopeLabels(),
  };
  benchOpts = opts;
  instrument.updateScreen((c) => drawScope(c, fr, { ...opts, width: c.width, height: c.height, dpr: 1, scale: c.width / 320 }));
  const pc = $('eqScope');
  if (pc) {
    const w = pc.clientWidth || 300;
    drawScope(pc, fr, { ...opts, width: w, height: Math.round(w * 0.5), dpr: Math.min(window.devicePixelRatio || 1, 2) });
  }
}

// Bottom slider: pans the bench view sideways (camera and target along the screen-right axis).
const eqPanBox = el('div', 'eq-pan', '<i>&lsaquo;</i><input type="range" min="-1" max="1" step="0.01" value="0"><i>&rsaquo;</i>');
eqPanBox.hidden = true;
const eqPanIn = eqPanBox.querySelector('input');
eqPanIn.setAttribute('aria-label', eqDoc.pan);
eqPanBox.title = eqDoc.pan;
viewport.appendChild(eqPanBox);
eqPanIn.addEventListener('input', () => setEqPan(Number(eqPanIn.value)));
function setEqPan(v, { move = true } = {}) {
  const d = (v - S.eqPan) * (scenesDoc.cameras.equipment.pan_m || 0);
  S.eqPan = v;
  eqPanIn.value = String(v);
  if (!move || !d) return;
  const t = tweens.get('camera');
  if (t) { tweens.delete('camera'); t.resolve(false); }
  camera.updateMatrixWorld();
  const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0).setY(0).normalize();
  camera.position.addScaledVector(right, d);
  controls.target.addScaledVector(right, d);
  anchorsDirty = true;
}

// ------------------------------------------------------------------ practice (M6)
const PL = practiceDoc.labels;
const PLIM = specMan.probe_limits;
const ROOT_BASE = new THREE.Vector3();
const SECTION_MODES = ['off', 'along', 'across'];
const SECTION_LABEL = { off: PL.section_off, along: PL.section_along, across: PL.section_across };
let CONNECTOR_TOP = 0;
let cableDirty = 0;
let probeDrag = null;

const probeStart = (id) => {
  const sp = specMan.specimens[id];
  const st = sp.probe_start || sp.calibration?.probe_start || { x_mm: 0, y_mm: 0 };
  return { x: st.x_mm, y: st.y_mm };
};

function applyPractice(on) {
  if (on) {
    S.inspStash = S.insp;
    S.insp = S.prac.inst;
    resetPanel();
    updateVisibility();
    showSpecimen(S.prac.specimen);
  } else {
    S.prac.inst = S.insp;
    if (S.inspStash) S.insp = S.inspStash;
    S.inspStash = null;
    resetPanel();
    endProbeDrag();
    practice.setSection('off');
    practice.show(null);
    probeOffset.set(0, 0, 0);
    root.position.copy(ROOT_BASE);
    root.updateMatrixWorld(true);
    setClip(S.clip);
    instrument.setProbeAnchor(new THREE.Vector3(0, CONNECTOR_TOP, 0), { stretch: 0 });
    cableDirty = 0;
    updateVisibility();
  }
  inspKey = '';
}

function showSpecimen(id) {
  S.prac.specimen = id;
  if (isPlate(id)) { S.prac.plateId = id; marksDirty = true; syncEval(); }
  practice.show(id);
  S.insp.thickness_mm = specT(id);
  S.insp.specimen_id = id;
  clearPeak();
  const p = S.prac.probe[id];
  practice.setSection(S.prac.section, p);
  placeProbe(p.x, p.y, { final: true });
}

function setSpecimen(id) {
  if (detectionTraining() && id !== CASE_ID) return;
  if (examCase() && id === EVAL_SPEC) id = CASE_ID;
  if (!specMan.specimens[id] || S.mode !== 'practice' || !practice || replayOn()) return;
  const P = S.prac;
  const next = id === PR.dac.specimen && P.step === 'calibrate' && P.done.calibrate ? 'dac'
    : isPlate(id) && (P.step === 'dac' || P.step === 'sensitivity') && P.done.sensitivity ? 'scan' : null;
  if (next) P.step = next;
  P.probe[id] = probeStart(id);
  showSpecimen(id);
  inspKey = '';
  emit('practice:specimen', { specimen_id: id });
  if (next) emit('practice:step', { step_id: next });
  updateCriteria();
  renderPanel();
  if (S.inspCam === 'probe' || S.inspCam === 'section') setInspCamera(S.inspCam);
}

function placeProbe(x, y, { final = false, track = true } = {}) {
  if (replayOn() && track) return S.prac.probe[S.prac.specimen];
  const id = S.prac.specimen;
  const c = practice.clamp(id, x, y);
  c.x = Math.round(c.x * 10) / 10;
  c.y = Math.round(c.y * 10) / 10;
  S.prac.probe[id] = c;
  S.insp.probe_x_mm = c.x;
  S.insp.probe_y_mm = c.y;
  inspKey = '';
  probeOffset.copy(practice.toWorld(id, c.x, c.y));
  root.position.copy(ROOT_BASE).add(probeOffset);
  root.updateMatrixWorld(true);
  setClip(S.clip);
  practice.setProbe(c);
  cableDirty = final ? 2 : Math.max(cableDirty, 1);
  anchorsDirty = true;
  syncPracticeReadout();
  updateCriteria({ track: track && !replayOn() });
  return c;
}

const STEP_IDS = practiceDoc.steps.map((s) => s.id);
const STEP_PRESETS = waveRules.practice.step_presets;
const CAL_STATE = waveRules.practice.calibration.calibrated_state;

function stepReach() {
  const i = STEP_IDS.findIndex((id) => !S.prac.done[id]);
  return i < 0 ? STEP_IDS.length - 1 : i;
}
// Classroom presets never apply in the exam; exam steps open in order after the exam bench is assembled.
const presetsOn = () => teacherAccess() && S.study === 'classroom' && !S.exam;
const learningHelpOn = () => learningHelpAllowed(S);
const stepOpen = (id) => (detectionTraining() ? !S.prac.submitted && ['scan', 'quantify', 'evaluate'].includes(id)
  : studyFullFlow() ? STEP_IDS.includes(id)
  : S.taskOn ? !S.prac.submitted && STEP_IDS.indexOf(id) >= TASK_FIRST_STEP && (STEP_IDS.indexOf(id) <= stepReach() || S.prac.done.sensitivity)
  : S.exam ? S.prac.asmDone && !S.prac.submitted && (STEP_IDS.indexOf(id) <= stepReach() || (S.prac.done.sensitivity && ['scan', 'quantify', 'evaluate'].includes(id)))
  : presetsOn() || (S.learning.route === 'fullscan' && S.prac.done.sensitivity && ['scan', 'quantify', 'evaluate'].includes(id)) || STEP_IDS.indexOf(id) <= stepReach());
// Task: calibration and DAC come preset (contracts/tasks.json drive.preset); the student starts at the sensitivity step.
const TASK_FIRST_STEP = STEP_IDS.indexOf('sensitivity');

function presetGain(src) {
  if (src === 'default') return waveRules.controls.gain_dB.default;
  return src.split('.').reduce((o, k) => o[k], waveRules.practice.acceptance_values);
}

// Self study: open the step with the student's own data and instrument state (switch to the step specimen only).
// Only an explicit demonstration load replaces earlier values and clears later work.
function setPracticeStep(id, { force = false, render = true } = {}) {
  if (replayOn()) return;
  if (detectionTraining() && (!stepOpen(id) || force)) return;
  const pre = STEP_PRESETS[id];
  if (!pre || (!force && !stepOpen(id))) return;
  const live = S.mode === 'practice' && practice;
  if (!force) {
    if (studyFullFlow()) prepareLearningStep(id);
    S.prac.step = id;
    if (detectionTraining()) setDetectionGain(id);
    if (!live) return;
    emit('practice:step', { step_id: id });
    const keep = id === 'sensitivity' || ((id === 'scan' || id === 'quantify') && isPlate(S.prac.specimen));
    const target = ['scan', 'quantify', 'evaluate'].includes(id) && onCase() ? CASE_ID : pre.specimen;
    if (!keep && S.prac.specimen !== target) { setSpecimen(target); return; }
    updateCriteria();
    if (render) renderPanel();
    return;
  }
  const inst = live ? S.insp : S.prac.inst;
  const C = waveRules.practice.controls;
  const caseKeep = live && onCase() && ['scan', 'quantify', 'evaluate'].includes(id);
  const sid = caseKeep ? CASE_ID : pre.specimen;
  fillSteps(id);
  S.prac.step = id;
  inst.reject_percent = C.reject_percent.default;
  inst.velocity_m_s = pre.calibrated ? CAL_STATE.velocity_m_s : C.velocity_m_s_initial;
  inst.zero_us = pre.calibrated ? CAL_STATE.zero_us : C.zero_us.default;
  const gs = waveRules.controls.gain_dB.step;
  inst.gain_dB = Number((Math.round(presetGain(pre.gain) / gs) * gs).toFixed(1));
  S.prac.specimen = sid;
  if (isPlate(sid)) S.prac.plateId = sid;
  S.prac.probe[sid] = pre.probe_mm && !caseKeep ? { x: pre.probe_mm[0], y: pre.probe_mm[1] } : probeStart(sid);
  if (!live) {
    inst.thickness_mm = specT(sid);
    inst.specimen_id = sid;
    return;
  }
  if (S.panel.frozen) setFreeze(false);
  showSpecimen(sid);
  inspKey = '';
  emit('practice:step', { step_id: id });
  updateCriteria();
  if (!render) return;
  renderPanel();
  if (S.inspCam === 'probe' || S.inspCam === 'section') setInspCamera(S.inspCam);
}

function loadStepDemo() {
  if (!presetsOn() || S.taskOn || S.prac.submitted || replayOn()) return false;
  if (!window.confirm(WF.load_demo_confirm)) return false;
  setPracticeStep(S.prac.step, { force: true });
  return true;
}

// ------------------------------------------------------------------ practice procedure (M6.3 - M6.5)
const PR = waveRules.practice;
const PRD = practiceDoc.readout;
const PRAC_CTL = PR.controls;
const CAL_RULES = PR.calibration;
const CLIP_PCT = waveRules.display.clip_percent;
let proc = null;
let peakEnv = null;
let lastGate = null;
let marksDirty = true;

// Task card drive (contracts/tasks.json drive): the DAC in use carries card:compensation_dB, so criteria, equivalents, the
// displayed curve and the sensitivity target move with it; the scan sensitivity target is card:scan_plus_dB.
const TASK_DRIVE = tasksDoc.drive;
// Card in force: the task run's, or the logged card while a task session is replayed.
const liveCard = () => (S.taskOn ? S.prac.card : S.replay?.card) || null;
const taskComp = () => (liveCard() ? liveCard().compensation_dB : 0);
const dacPts = () => {
  const c = taskComp();
  return c ? S.prac.dac.points.map((p) => ({ ...p, G: p.G + c })) : S.prac.dac.points;
};
const scanPlus = () => (S.taskOn && S.prac.card ? S.prac.card.scan_plus_dB : STD.scan_sensitivity.plus_dB);
const critG = () => S.prac.sens.base + taskComp();

function blockIdOf(no) {
  const b = thicknessDoc.blocks.find((x) => String(x.row_no) === String(no));
  return b ? b.specimen_id : PR.dac.specimen;
}

function dacSpecimen() {
  const c = S.prac.presetCard || S.prac.card || liveCard();
  return c ? blockIdOf(c.reference_block) : PR.dac.specimen;
}

function presetDac(card) {
  const id = blockIdOf(card?.reference_block);
  if (id !== PR.dac.specimen) addBlock(id);
  const holes = specMan.specimens[id].holes;
  if (id === PR.dac.specimen) return holes.map((h) => ({ id: h.id, S: h.S_mm, G: PR.acceptance_values.dac_G_dB[String(h.S_mm)] }));
  return thickness().dacOf(id).map((p) => ({ id: holes.find((h) => h.S_mm === p.S).id, S: p.S, G: p.G }));
}

function fillSteps(id) {
  const i = STEP_IDS.indexOf(id);
  const P = S.prac;
  const AV = PR.acceptance_values;
  clearFrom(id);
  if (i > 0) { P.calib.points = { ...CAL_RULES.targets_mm }; P.done.calibrate = true; }
  if (i > 1) {
    P.dac.points = presetDac(P.card);
    P.done.dac = true;
  }
  if (i > 2) {
    const base = P.dac.points.length ? P.dac.points[P.dac.points.length - 1].G : AV.G_base_dB;
    const plus = P.card ? P.card.scan_plus_dB + P.card.compensation_dB : AV.G_scan_dB - AV.G_base_dB;
    P.sens = { base, scan: base + plus };
    P.done.sensitivity = true;
  }
  if (i > 3) P.done.scan = true;
  const es = evalSpec();
  const pl = P.plates[es];
  const defs = specMan.specimens[es].defects;
  const ready = pl.scan.found.length >= defs.length && pl.scan.found.every((f) => !f.flags.length || pl.quant.results[f.id]);
  if (i > 4 && ready) P.done.quantify = true;
  else if (i > 4 && es === CASE_ID) {
    pl.scan = freshScan();
    pl.quant = freshQuant();
    const ref = S.case.reference;
    for (const it of ref.items) {
      const d = defs.find((x) => x.id === it.id);
      pl.scan.found.push({ id: it.id, x: d.centre_mm[0], y: d.centre_mm[1], flags: [...it.flags], confirmed: false });
      if (!it.determined) continue;
      const r = ref.rects[it.id];
      pl.quant.results[it.id] = { length: r.length, area: r.area_mm2, eq: ref.equivalents[it.id] ?? it.D_dB ?? null, S: null, judge: {}, ...(d.type === 'cluster' ? { merged: r.merged, blocks: d.members.length } : {}) };
    }
    pl.quant.target = pl.scan.found.find((f) => f.flags.length)?.id ?? null;
    P.done.quantify = true;
  } else if (i > 4) {
    pl.scan = freshScan();
    pl.quant = freshQuant();
    for (const it of PR.grading.reference_items) {
      const d = defs.find((x) => x.id === it.id);
      pl.scan.found.push({ id: it.id, x: d.centre_mm[0], y: d.centre_mm[1], flags: [...it.flags], confirmed: false });
      if (!it.determined) continue;
      const ref = AV[`${it.id}_reference_mm`];
      const eq = AV[`${it.id}_equivalent_dB`];
      pl.quant.results[it.id] = { length: ref.length, area: ref.area_mm2, eq: eq ?? null, S: null, judge: {}, ...(d.type === 'cluster' ? { merged: true, blocks: AV.CLU_01_member_area_mm2.length } : {}) };
    }
    pl.quant.target = pl.scan.found.find((f) => f.flags.length)?.id ?? null;
    P.done.quantify = true;
  }
}

const typeOf = (id) => specMan.specimens[S.prac.plateId].defects.find((d) => d.id === id)?.type ?? null;

// ------------------------------------------------------------------ case library (M9.2): training random plate
const CASE_TEXT = assessDoc.case;
const CASE_TPLS = casesDoc.templates.filter((t) => !t.fixed).map((t) => t.id);
const CASE_PLACE = specManGlb.system_placement[casesDoc.plate.from.split('.').pop()];
let caselib = null;
const caseLib = () => (caselib ||= createCaselib({
  cases: casesDoc, rules: waveRules, standard: stdPack, specimens: specManGlb, scenario: inspDoc.scenarios[0],
  makeWave: (specimens) => createWaveform({ rules: waveRules, manifest, dampingCycles: scenesDoc.teaching_settings.lab.damping_cycles, scenarios: inspDoc.scenarios, specimens }),
}));
// Exam with a case code: the case plate replaces P-02 for scan, quantify and evaluate.
const examCase = () => S.exam && !!S.case;
const onCase = () => !!S.case && (S.exam || S.prac.plateId === CASE_ID);
// Evaluate works on P-02, on the random plate while it is the training plate, or on the exam case plate.
const evalSpec = () => (onCase() ? CASE_ID : EVAL_SPEC);
const examPlates = () => (detectionTraining() && S.case ? [CASE_ID] : S.case ? [...PLATE_IDS.filter((id) => id !== EVAL_SPEC), CASE_ID] : PLATE_IDS);
const randomSeed = () => crypto.getRandomValues(new Uint32Array(1))[0] % 2 ** casesDoc.prng.seed_bits;

const caseName = () => (liveCard() ? taskDoc.values.work_piece : S.exam ? CASE_TEXT.exam_plate : CASE_TEXT.random_plate);
const specName = (id) => (id === CASE_ID ? caseName() : practiceDoc.specimens[id]?.name || id);
function specHeader(id) {
  if (id !== CASE_ID) return practiceDoc.specimens[id]?.header || '';
  const sp = specMan.specimens[id];
  const d = sp.dims;
  return CASE_TEXT.header.replace('{name}', caseName()).replace('{code}', detectionTraining() ? '' : sp.code)
    .replace('{L}', d.length.value).replace('{W}', d.width.value).replace('{T}', d.thickness.value);
}
const indName = (id) => (S.prac.plateId === CASE_ID ? CASE_TEXT.types[typeOf(id)] : practiceDoc.indications[id]) || '';
const judgedOf = (id) => (S.prac.plateId === CASE_ID ? S.case.reference.judged[id] : PR.tolerance.judged[id]) || [];

// Quantify judgement against the case reference (same tolerances as procedure.judge on P-02).
function caseJudge(id, res) {
  const ref = S.case.reference;
  const T = PR.tolerance;
  const r = ref.rects[id];
  const out = {};
  for (const k of ref.judged[id] || []) {
    if (k === 'length') out.length = Math.abs(res.length - r.length) <= T.indicated_length_mm;
    if (k === 'area') out.area = Math.abs(res.area - r.area_mm2) / r.area_mm2 <= T.indicated_area_relative;
    if (k === 'equivalent') out.equivalent = res.eq != null && Math.abs(res.eq - ref.equivalents[id]) <= T.equivalent_dB;
  }
  return out;
}

// Reference answer of plate `sid`: the random plate from its case, P-02 from the frozen grading data.
function refOf(sid) {
  if (sid === CASE_ID && S.case) return { defects: S.case.plate.defects, ref: S.case.reference };
  const AV = PR.acceptance_values;
  const rects = Object.fromEntries(Object.keys(PR.tolerance.judged).filter((id) => AV[`${id}_reference_mm`]).map((id) => [id, AV[`${id}_reference_mm`]]));
  return { defects: specMan.specimens[sid].defects, ref: { items: PR.grading.reference_items, rects, expected: PR.grading.expected } };
}

// Reference table of plate `sid` at `level` (null: no verdicts): rows {hit, cells}, plate grade, conclusion.
// `src` {defects, ref} with found = null: rows numbered in plate order, none marked as missed.
function refTable(sid, level, found, src = refOf(sid)) {
  const { defects, ref } = src;
  const exp = ref.expected;
  const R = practiceDoc.results;
  const VD = practiceDoc.verdicts;
  const NA = PL.no_value;
  const mm = UI.inspection.unit_mm;
  const f1 = (v) => v.toFixed(1);
  const depth = (d) => (d.type === 'cluster' ? (() => { const z = d.members.map((m) => m.depth_mm); return `${f1(Math.min(...z))}–${f1(Math.max(...z))}`; })()
    : d.type === 'segregation' ? `${f1(d.depth_range_mm[0])}–${f1(d.depth_range_mm[1])}` : f1(d.depth_mm));
  const rows = defects.map((d, i) => {
    const it = ref.items.find((x) => x.id === d.id);
    const r = ref.rects[d.id];
    const hit = !found || found.some((f) => f.id === d.id);
    const name = !found ? `${i + 1} · ${CASE_TEXT.types[d.type]}` : `${hit ? `${defName(d.id, sid)} · ` : ''}${CASE_TEXT.types[d.type]}`;
    return {
      hit,
      cells: [name, d.centre_mm[0].toFixed(0), d.centre_mm[1].toFixed(0), depth(d), it.determined && r ? f1(r.length) : NA, it.S_mm2 == null ? NA : it.S_mm2.toFixed(0),
        it.D_dB == null ? NA : `${it.D_dB >= 0 ? '+' : '−'}${Math.abs(it.D_dB).toFixed(1)}`, level ? VD[exp[level][d.id]] || NA : NA],
    };
  });
  const head = ['', `${PL.x} / ${mm}`, `${PL.y} / ${mm}`, `${PRD.depth} / ${mm}`, `${R.length} / ${R.unit_mm}`, `S / ${R.unit_mm2}`, `D / ${PRD.unit_dB}`, PL.verdict];
  return { head, rows, plate: exp.plate_grade, pass: level ? exp[level].pass : null };
}

// Reference answer of the random plate at `level` (training, after the evaluation is submitted).
function caseRefHtml(level) {
  const LV = practiceDoc.levels;
  const t = refTable(CASE_ID, level, S.prac.plates[CASE_ID].scan.found);
  const rows = t.rows.map((r) => `<tr>${r.cells.map((c, i) => (i ? `<td>${esc(c)}</td>` : `<td class="${r.hit ? '' : 'ng'}"><b>${esc(c)}</b></td>`)).join('')}</tr>`).join('');
  const table = rows ? `<table class="pc-table pc-ref"><thead><tr>${t.head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table>` : '';
  const kv = [[PL.plate_grade, LV[t.plate]], [PL.conclusion, t.pass ? PL.accept : PL.reject]]
    .map(([k, v]) => `<span>${esc(k)}</span><b>${esc(v)}</b>`).join('');
  return `<div class="pc-sub">${esc(CASE_TEXT.reference)} · ${esc(specMan.specimens[CASE_ID].code)}</div>${table}<div class="pc-kv">${kv}</div>`;
}

// One evaluation per evaluated plate; P.eval holds the one of evalSpec().
function syncEval() {
  const P = S.prac;
  const sid = evalSpec();
  const cur = P.evalOf || EVAL_SPEC;
  if (cur !== sid) {
    (P.evals ||= {})[cur] = P.eval;
    P.eval = P.evals[sid] || freshEval();
    P.evalOf = sid;
  }
  presetLevel(P);
}

// A system-prepared detection case fixes the acceptance level on its reference card; every fresh
// evaluation of that plate (new plate, redo, restore) starts from it.
function presetLevel(P = S.prac) {
  if (P.eval && !P.eval.level && P.presetCard?.level) P.eval.level = P.presetCard.level;
}

// Case plate `cs` becomes the random plate (specimen data and geometry); no event, no plate data change.
function applyCase(cs) {
  S.case = cs;
  S.caseRef = false;
  specMan.specimens[CASE_ID] = cs.plate;
  practice.setRuntime(CASE_ID, cs.plate, CASE_PLACE);
  delete covParams[CASE_ID];
  xrayKey = '';
}

function dropCase() {
  S.case = null;
  S.caseRef = false;
  delete specMan.specimens[CASE_ID];
  xrayKey = '';
}

function freshCasePlate() {
  const P = S.prac;
  P.plates[CASE_ID] = { scan: freshScan(), quant: freshQuant() };
  P.probe[CASE_ID] = probeStart(CASE_ID);
  if (P.evals) delete P.evals[CASE_ID];
  if (P.evalOf === CASE_ID) P.eval = freshEval();
}

const sameCase = (cs, c) => !!cs && !!c && cs.template_id === c.template_id && cs.seed === c.seed
  && (cs.thickness_mm || 50) === (c.thickness_mm || 50);

function makeCase(templateId, seed, t = 50) {
  const n = t || 50;
  const cs = n === 50 ? caseLib().generate(templateId, seed) : thickness().caseGen(n)?.generate(templateId, seed);
  return cs && !cs.failed ? { ...cs, thickness_mm: n } : null;
}

function taskCaseOf(t) {
  if (t?.case) {
    const cs = caseLib().libraryCase(t.case);
    return cs ? { ...cs, thickness_mm: 50 } : null;
  }
  return t?.thickness ? thickness().libraryCase(t.thickness) : null;
}

// Rebuilds the plate of a logged case reference {template_id, seed, thickness_mm} unless it is the current one; false if it cannot be rebuilt.
function rebuildCase(c) {
  if (!c || !practice) return false;
  const t = c.thickness_mm ?? S.replay?.thickness_mm ?? 50;
  if (sameCase(S.case, { ...c, thickness_mm: t })) return true;
  const cs = makeCase(c.template_id, c.seed, t);
  if (!cs || cs.specimen_id !== CASE_ID) return false;
  applyCase(cs);
  return true;
}

// New random plate of template `tpl` (seed: reproduce; none: drawn): rebuilt specimen, fresh plate data, case:load.
function loadCase(tpl = S.caseTpl, seed = null) {
  if (S.exam || !practice || replayOn() || S.mode !== 'practice' || !CASE_TPLS.includes(tpl)) return null;
  const lib = caseLib();
  let cs = lib.generate(tpl, seed ?? randomSeed());
  for (let i = 0; cs?.failed && seed == null && i < 8; i++) cs = lib.generate(tpl, randomSeed());
  if (!cs || cs.failed) return null;
  S.caseTpl = tpl;
  applyCase(cs);
  freshCasePlate();
  emit('case:load', { case_id: cs.case_id, template_id: cs.template_id, seed: cs.seed, defect_set_id: cs.defect_set_id, source: 'practice' });
  const P = S.prac;
  if (P.specimen === CASE_ID) {
    showSpecimen(CASE_ID);
    inspKey = '';
    updateCriteria();
    renderPanel();
  } else setSpecimen(CASE_ID);
  return cs;
}

// ------------------------------------------------------------------ plate thicknesses (M10.5): runtime blocks, 30 / 80 mm plates
let thick = null;
const thickness = () => (thick ||= createThickness({
  doc: thicknessDoc, cases: casesDoc, rules: waveRules, standard: stdPack, specimens: specManGlb, scenario: inspDoc.scenarios[0], createCaselib,
  makeWave: (specimens) => createWaveform({ rules: waveRules, manifest, dampingCycles: scenesDoc.teaching_settings.lab.damping_cycles, scenarios: inspDoc.scenarios, specimens }),
}));

// Runtime block `id` into the specimen table and the scene; plate lists and buttons unchanged.
function addBlock(id) {
  const sp = thickness().block(id);
  if (!sp || !practice) return false;
  if (specMan.specimens[id] !== sp) {
    specMan.specimens[id] = sp;
    practice.setRuntime(id, sp, thickness().placement);
    S.prac.probe[id] ||= probeStart(id);
  }
  return true;
}

// Thickness plate (template + seed) as the case plate, no case:load (session wiring in M10.6).
function showThicknessCase(t, tpl, seed) {
  if (S.exam || S.taskOn || !practice || replayOn() || S.mode !== 'practice') return null;
  const cs = thickness().caseGen(t)?.generate(tpl, seed);
  if (!cs || cs.failed) return null;
  applyCase(cs);
  freshCasePlate();
  if (S.prac.specimen === CASE_ID) showSpecimen(CASE_ID);
  else setSpecimen(CASE_ID);
  inspKey = '';
  return cs;
}

// Plate button: back to the current random plate (plate data recreated if this practice state has none), else a new one.
function openCase() {
  const P = S.prac;
  if (!S.case) return loadCase();
  if (!P.plates[CASE_ID]) {
    P.plates[CASE_ID] = { scan: freshScan(), quant: freshQuant() };
    P.probe[CASE_ID] = probeStart(CASE_ID);
  }
  setSpecimen(CASE_ID);
  return S.case;
}

function toggleCaseRef() {
  S.caseRef = !S.caseRef;
  renderStepCard();
}

// Clears the data of `step` and every later step.
function clearFrom(step) {
  const i = STEP_IDS.indexOf(step);
  const P = S.prac;
  if (i <= 0) P.calib = { points: {} };
  if (i <= 1) P.dac = { points: [] };
  if (i <= 2) P.sens = null;
  for (const pl of Object.values(P.plates)) {
    if (i <= 3) pl.scan = freshScan();
    if (i <= 4) { pl.quant = freshQuant(); pl.quant.target = pl.scan.found.find((f) => f.flags.length)?.id ?? null; }
  }
  if (i <= 5) P.eval = freshEval();
  for (const id of STEP_IDS.slice(i)) delete P.done[id];
  for (const k of Object.keys(P.shots || {})) if (STEP_IDS.indexOf(k.split(':')[0]) >= i) delete P.shots[k];
  P.crit = null;
  marksDirty = true;
}

// Exam A-scan records keyed `<step>` / `<step>:<id>`: instrument state at the moment, re-synthesised in the report.
function takeShot(key) {
  if (selfStudy()) return;
  if ((!S.exam && S.learning.route !== 'fullscan') || examLocked()) return;
  const P = S.prac;
  (P.shots ||= {})[key] = { inst: JSON.parse(JSON.stringify(S.insp)), dac: P.done.calibrate ? dacPts().map((p) => ({ ...p })) : [] };
}

function clearPeak() {
  peakEnv = null;
  inspKey = '';
}

function onPracSetting(key) {
  if (key === 'velocity_m_s') onCalibChange();
  if (key === 'gain_dB' || key === 'range_mm' || key === 'velocity_m_s') clearPeak();
}

// waveform_rules.practice.calibration.invalidation
function onCalibChange() {
  const P = S.prac;
  clearPeak();
  if (P.done.calibrate) {
    clearFrom('calibrate');
    panelMsg(PL.calib_void);
    if (!stepOpen(P.step)) P.step = STEP_IDS[0];
    renderPracState();
  } else if (Object.keys(P.calib.points).length) {
    P.calib.points = {};
    panelMsg(PL.points_void);
    renderPracState();
  }
}

function setPracCtl(key, value, { silent = false } = {}) {
  if (S.mode !== 'practice' || replayOn() || examLocked()) return;
  if (detectionTraining() && PRESET_LOCKS.has(key)) return;
  const c = PRAC_CTL[key];
  if (c.min != null) {
    const dec = (String(c.step).split('.')[1] || '').length;
    value = Math.min(c.max, Math.max(c.min, Number((Math.round(value / c.step) * c.step).toFixed(dec))));
  }
  const changed = S.insp[key] !== value;
  S.insp[key] = value;
  if (changed) {
    if (S.panel.frozen && key !== 'peak_memory') setFreeze(false);
    if (key === 'zero_us') onCalibChange();
    if (key === 'peak_memory') clearPeak();
  }
  if (!silent) {
    if (key === 'zero_us') emit('instrument:zero', { delay_us: value });
    else if (key === 'reject_percent') emit('instrument:reject', { percent: value });
    else if (key === 'peak_memory') emit('instrument:peak_memory', { on: value });
  }
  inspKey = '';
  syncInspCtrls();
}

function setDacShow(on) {
  if (replayOn() || examLocked()) return;
  S.insp.dac_show = on;
  inspKey = '';
  syncInspCtrls();
}

function applyReject(fr, r = S.insp.reject_percent) {
  if (!(r > 0)) return;
  for (let c = 0; c < fr.columns; c++) {
    if (Math.abs(fr.hi[c]) < r) fr.hi[c] = 0;
    if (!fr.rect && Math.abs(fr.lo[c]) < r) fr.lo[c] = 0;
  }
}

function gateDac(gr) {
  const e = gr && gr.echo;
  if (!e || !S.prac.done.calibrate || S.prac.dac.points.length < 2) return null;
  return proc.f1MinusDac(dacPts(), e.x_mm, e.pct, S.insp.gain_dB);
}
const fmtDb = (d) => `${d >= 0 ? '+' : '−'}${Math.abs(d).toFixed(1)} ${PRD.unit_dB}`;
const plateTag = (pid = S.prac.plateId) => (pid === CASE_ID || specMan.specimens[pid].indication_count_shown ? PL.indication : PL.defect);
const defName = (id, pid = S.prac.plateId) => `${plateTag(pid)} ${S.prac.plates[pid].scan.found.findIndex((f) => f.id === id) + 1}`;

// ------------------------------------------------------------------ evaluate (waveform_rules.practice.grading)
function evalItems() {
  const { scan, quant } = S.prac.plates[evalSpec()];
  return scan.found.filter((f) => S.learning.role === 'teacher' || f.confirmed === true).map((f) => {
    const r = quant.results[f.id];
    return { id: f.id, determined: f.flags.length > 0, flags: f.flags, S_mm2: r ? r.area : null, D_dB: r ? r.eq : null, length: r ? r.length : null };
  });
}

// Verdict bands of one indication at `level`: the quantity used (D or S), its value and the band it falls in.
function verdictBands(level, it) {
  const L = STD.grading.table[level];
  if (!L || !it.determined) return null;
  const d = proc.usesD(level, it);
  const phi = `Φ${STD.reference_block.phi_mm}`;
  const lo = d ? L.count_D_dB[0] : L.count_S_mm2[0];
  const hi = d ? L.max_D_dB : L.max_S_mm2;
  const lim = (n) => (d ? (n ? `${phi} +${n} ${PRD.unit_dB}` : phi) : `${n} mm²`);
  const q = d ? 'D' : 'S';
  const VD = practiceDoc.verdicts;
  const bands = [[`${q} ≤ ${lim(lo)}`, VD.not_counted], [`${lim(lo)} < ${q} ≤ ${lim(hi)}`, VD.counted], [`${q} > ${lim(hi)}`, VD.exceed]];
  const v = d ? it.D_dB : it.S_mm2;
  const at = v == null ? null : v > hi + 1e-9 ? 2 : v > lo + 1e-9 ? 1 : 0;
  const value = v == null ? null : d ? `${phi} ${fmtDb(v)}` : `${v.toFixed(0)} mm²`;
  return { d, q, bands, at, value, text: `${q} ≤ ${lim(lo)} ${VD.not_counted} · ≤ ${lim(hi)} ${VD.counted} · > ${lim(hi)} ${VD.exceed}` };
}

function evalTipModel(key) {
  const E = S.prac.eval;
  const T = V5.eval_tip;
  const GS = STD.grading;
  const LV = practiceDoc.levels;
  if (S.mode !== 'practice' || S.prac.step !== 'evaluate' || !E.level || !GS.table[E.level]) return null;
  const values = { level: LV[E.level], b_pct: STD.defect_criteria.b1_limit_percent };
  if (key.startsWith('vd:')) {
    const it = evalItems().find((x) => x.id === key.slice(3));
    if (!it) return null;
    const vb = verdictBands(E.level, { ...it, determined: true });
    values.qty = v4Format(GS.table[E.level].max_D_dB != null ? T.qty_d : T.qty_s, values);
    return { title: v4Format(T.vd_title, values), steps: T.vd_steps.map((s) => v4Format(s, values)),
      bands: vb ? vb.bands.map(([range, verdict]) => v4Format(T.band, { range, verdict })) : [] };
  }
  const first = LV[GS.levels[0]];
  if (key === 'pg') {
    const v = { first, last: LV[GS.levels[GS.levels.length - 1]], fail: LV[GS.fail_level], area: plateArea(evalSpec()) };
    return { title: T.pg_title, steps: T.pg_steps.map((s) => v4Format(s, v)), bands: [] };
  }
  if (key === 'cc') {
    const i = GS.levels.indexOf(E.level);
    const pass = i > 0 ? `${first}–${LV[E.level]}` : first;
    return { title: T.cc_title, steps: T.cc_steps.map((s) => v4Format(s, { ...values, pass })), bands: [] };
  }
  return null;
}

let evalTipEl = null;
let evalTipFor = null;
function hideEvalTip() {
  if (evalTipEl) evalTipEl.hidden = true;
  evalTipFor = null;
}
function showEvalTip(target) {
  const key = target.dataset.tip;
  const m = evalTipModel(key);
  if (!m) { hideEvalTip(); return; }
  if (!evalTipEl) {
    evalTipEl = el('div', 'ev-tip');
    evalTipEl.hidden = true;
    document.body.appendChild(evalTipEl);
  }
  if (evalTipFor !== target) {
    const sub = (i) => esc((GUIDE.sub_step || '{n}').replace('{n}', i + 1));
    evalTipEl.innerHTML = `<b>${esc(m.title)}</b><ol>${m.steps.map((s, i) => `<li><em>${sub(i)}</em>${esc(s)}`
      + (i === m.steps.length - 1 && m.bands.length ? `<ul>${m.bands.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>` : '') + '</li>').join('')}</ol>`;
    evalTipFor = target;
  }
  evalTipEl.hidden = false;
  const r = target.getBoundingClientRect();
  const w = evalTipEl.offsetWidth;
  const h = evalTipEl.offsetHeight;
  const gap = 10;
  const host = target.closest('#panel');
  let left = (host ? host.getBoundingClientRect().left : r.left) - w - gap;
  let top = Math.min(Math.max(8, r.top - 8), window.innerHeight - h - 8);
  if (left < 8) {
    left = Math.min(Math.max(8, r.left), window.innerWidth - w - 8);
    top = r.bottom + gap + h <= window.innerHeight ? r.bottom + gap : Math.max(8, r.top - h - gap);
  }
  evalTipEl.style.left = `${Math.round(left)}px`;
  evalTipEl.style.top = `${Math.round(top)}px`;
}
const evalTipTarget = (ev) => (ev.target instanceof Element ? ev.target.closest('[data-tip]') : null);
document.addEventListener('mouseover', (ev) => {
  const t = evalTipTarget(ev);
  if (t) showEvalTip(t);
  else if (evalTipFor && !(ev.target instanceof Element && ev.target.closest('.ev-tip'))) hideEvalTip();
});
document.addEventListener('focusin', (ev) => { const t = evalTipTarget(ev); if (t) showEvalTip(t); });
document.addEventListener('pointerdown', (ev) => { if (evalTipFor && !evalTipTarget(ev)) hideEvalTip(); });
window.addEventListener('scroll', () => { if (evalTipFor) hideEvalTip(); }, true);

function setEval(key, value) {
  if (examLocked() || ((S.taskOn || detectionTraining()) && key === 'level')) return;
  const E = S.prac.eval;
  if (key === 'verdict') E.verdicts[value[0]] = value[1] || undefined;
  else E[key] = value;
  E.result = null;
  renderPracState();
}

// Exam (docs/M8_SCOPE.md §11.1): one confirmed submission, allowed with fewer found indications; no right / wrong shown.
function submitEval({ confirmed = false } = {}) {
  if (examLocked()) return;
  const P = S.prac;
  const E = P.eval;
  if (S.taskOn) E.level = P.card.level;
  presetLevel(P);
  const items = evalItems();
  const onC = evalSpec() === CASE_ID;
  if (items.some((it) => it.determined && (it.S_mm2 == null || (it.D_dB == null && proc.needsD(it))))) return panelMsg(PL.need_quant);
  if (!E.level || !E.plate || !E.conclusion || items.some((it) => !E.verdicts[it.id])) return panelMsg(PL.need_choice);
  const truth = proc.grade(E.level, items, plateArea(evalSpec()));
  if (Object.values(truth.verdicts).includes(null)) return panelMsg(PL.need_quant);
  if (S.exam && !confirmed && !window.confirm(assessDoc.session.submit_confirm)) return;
  const grade = proc.plateGrade(items, plateArea(evalSpec()));
  const concl = truth.pass ? 'accept' : 'reject';
  const ok = Object.fromEntries(items.map((it) => [it.id, E.verdicts[it.id] === truth.verdicts[it.id]]));
  const missed = onC ? S.case.reference.items.filter((r) => !items.some((it) => it.id === r.id)).map((r) => r.id) : [];
  const refItems = onC ? S.case.reference.items : PR.grading.reference_items;
  const falseCalls = items.filter((it) => refItems.find((r) => r.id === it.id)?.determined === false && FALSE_CALL.includes(E.verdicts[it.id])).map((it) => it.id);
  const self_consistent = Object.values(ok).every(Boolean) && E.plate === grade && E.conclusion === concl;
  const correct = self_consistent && !missed.length;
  P.score = null;
  E.result = { ok, truth, grade, concl, plate: E.plate === grade, conclusion: E.conclusion === concl, correct, self_consistent, false_calls: falseCalls, ...(onC ? { missed } : {}) };
  if (correct || S.exam) P.done.evaluate = true;
  for (const id of falseCalls) emit('practice:false_call', { indication_id: id, verdict: E.verdicts[id], step: 'evaluate' });
  emit('practice:evaluate', { level: E.level, plate_grade: E.plate, conclusion: E.conclusion, correct, self_consistent });
  if (S.taskOn) {
    submitTask();
    return;
  }
  if (S.exam) {
    submitExam();
    return;
  }
  panelMsg(correct ? PL.correct : PL.wrong);
  renderPracState();
}

function pracGate() {
  const fr = S.panel.frozen && frozenFrame ? frozenFrame : wave.synth(S.insp, { columns: 480, noise: false });
  return gateReading(fr, gateOf());
}

function pracFail(msg) {
  emit('practice:record_blocked', { step: S.prac.step, reason: msg });
  if (msg === 'use_specimen') panelMsg(`${PL.use_specimen} ${practiceDoc.specimens[STEP_PRESETS[S.prac.step].specimen].name}`);
  else panelMsg(PL[msg] || PANEL.messages[msg] || msg);
}

// Key enter / record button: records for the current step.
function practiceRecord() {
  if (S.mode !== 'practice' || !practice || examLocked() || replayOn()) return;
  const step = S.prac.step;
  if (step === 'calibrate') recordCalib();
  else if (step === 'dac') recordDac();
  else if (step === 'sensitivity') recordSens();
  else if (step === 'quantify' && systemQuant()) { autoQuantify(); return; }
  else if (step === 'quantify') recordBoundary();
  renderPracState();
}

function recordCalib() {
  const P = S.prac;
  const r = proc.calibRecord(S.insp, pracGate());
  if (!r.ok) return pracFail(r.msg);
  P.calib.points[r.id] = r.reading;
  emit('practice:calib_point', { echo: r.id, reading_mm: r.reading });
  const all = Object.keys(CAL_RULES.targets_mm).every((k) => P.calib.points[k] != null);
  if (!all) { panelMsg(`${r.id} ${r.reading.toFixed(2)} ${UI.inspection.unit_mm}`); return; }
  if (!proc.calibDone(P.calib.points)) { panelMsg(proc.calibIntervalOk(P.calib.points) ? PL.out_of_tol : `${PL.interval} ${PL.out_of_tol}`); return; }
  P.done.calibrate = true;
  emit('practice:calib_done', { velocity_m_s: S.insp.velocity_m_s, delay_us: S.insp.zero_us });
  takeShot('calibrate');
  panelMsg(PL.done);
}

function recordDac() {
  const P = S.prac;
  const r = proc.dacRecord(S.insp, pracGate(), !!P.done.calibrate);
  if (!r.ok) return pracFail(r.msg);
  if (P.done.dac) clearFrom('sensitivity');
  P.dac.points = [...P.dac.points.filter((p) => p.id !== r.point.id), r.point].sort((a, b) => a.S - b.S);
  emit('practice:dac_point', { S_mm: r.point.S, gain_dB: r.point.G });
  takeShot(`dac:${r.point.id}`);
  if (P.dac.points.length < specMan.specimens[PR.dac.specimen].holes.length) {
    panelMsg(`S ${r.point.S.toFixed(1)} ${UI.inspection.unit_mm} · ${r.point.G.toFixed(1)} ${PRD.unit_dB}`);
    return;
  }
  P.done.dac = true;
  emit('practice:dac_done', { points: P.dac.points.map((p) => ({ S_mm: p.S, gain_dB: p.G })) });
  P.step = 'sensitivity';
  emit('practice:step', { step_id: 'sensitivity' });
  panelMsg(PL.done);
}

function recordSens() {
  const P = S.prac;
  if (!P.done.dac) return pracFail('locked');
  const r = proc.sensRecord(dacPts(), S.insp.gain_dB, scanPlus());
  if (!r.ok) return pracFail(r.msg);
  if (P.done.sensitivity) clearFrom('scan');
  P.sens = { base: r.base - taskComp(), scan: r.scan };
  P.done.sensitivity = true;
  emit('practice:sensitivity', { base_dB: P.sens.base, scan_dB: r.scan });
  panelMsg(PL.done);
}

function recordBoundary() {
  const P = S.prac;
  if (!isPlate(P.specimen)) return pracFail('use_specimen');
  const t = P.quant.target;
  if (!t) return pracFail('no_target');
  const p = P.probe[P.specimen];
  (P.quant.pts[t] ||= []).push([p.x, p.y]);
  emit('practice:boundary_point', { x_mm: p.x, y_mm: p.y });
  updateResult(t);
  marksDirty = true;
}

function recordEq() {
  const P = S.prac;
  const t = P.quant.target;
  if (!t) return pracFail('no_target');
  const r = proc.eqRecord(S.insp, pracGate(), dacPts(), t);
  if (!r.ok) return pracFail(r.msg);
  P.quant.eq[t] = { dB: r.dB, S: r.S };
  if (P.specimen === evalSpec()) takeShot(`quantify:${t}:eq`);
  panelMsg(`${PRD.f1_dac} ${fmtDb(r.dB)}`);
  updateResult(t);
  renderPracState();
}

function undoBoundary() {
  const P = S.prac;
  const t = P.quant.target;
  if (t && !P.quant.pts[t]?.length && P.quant.subs[t]?.length) P.quant.pts[t] = P.quant.subs[t].pop();
  if (!t || !P.quant.pts[t]?.length) return;
  P.quant.pts[t].pop();
  updateResult(t);
  marksDirty = true;
  renderPracState();
}

// Cluster: finished blocks (quant.subs) + the current block.
const blockRects = (t) => [...(S.prac.quant.subs[t] || []), S.prac.quant.pts[t] || []]
  .filter((p) => p.length >= PR.quantify.min_points).map((p) => proc.rect(p));

function updateResult(t) {
  const P = S.prac;
  const cluster = typeOf(t) === 'cluster';
  const rects = cluster ? blockRects(t) : [];
  const pts = P.quant.pts[t] || [];
  if (cluster ? !rects.length : pts.length < PR.quantify.min_points) { delete P.quant.results[t]; delete P.shots[`quantify:${t}`]; return; }
  const m = cluster ? proc.merge(rects) : null;
  const r = cluster ? m : proc.rect(pts);
  const eq = P.quant.eq[t];
  const res = { length: r.length, area: r.area, eq: eq ? eq.dB : null, S: eq ? eq.S : null };
  if (cluster) Object.assign(res, { merged: m.merged, blocks: m.blocks });
  res.judge = P.plateId === CASE_ID && S.case ? caseJudge(t, res) : proc.judge(t, res);
  P.quant.results[t] = res;
  P.done.quantify = true;
  emit('practice:quantified', { defect_id: t, length_mm: Math.round(r.length * 10) / 10, area_mm2: Math.round(r.area * 10) / 10, equivalent_dB: res.eq });
  if (P.specimen === evalSpec()) takeShot(`quantify:${t}`);
}

function nextBlock() {
  const P = S.prac;
  const t = P.quant.target;
  if (!t || typeOf(t) !== 'cluster') return;
  const pts = P.quant.pts[t] || [];
  if (pts.length < PR.quantify.min_points) return panelMsg(`${PL.boundary} ${pts.length} / ${PR.quantify.min_points}`);
  (P.quant.subs[t] ||= []).push(pts);
  P.quant.pts[t] = [];
  updateResult(t);
  marksDirty = true;
  panelMsg(`${P.quant.subs[t].length} ${PL.block}`);
  renderPracState();
}

// waveform_rules.practice.mark
function markIndication() {
  if (examLocked()) return;
  if (S.panel.frozen) return panelMsg(WF.unfreeze);
  const P = S.prac;
  if (!P.sens) return pracFail('locked');
  if (!isPlate(P.specimen)) return pracFail('use_specimen');
  drawInspection();
  const best = currentRecordCandidate();
  if (!best) return panelMsg(S.insp.gate_on ? WF.no_visible : WF.gate_required);
  const p = P.probe[P.specimen];
  const existing = P.scan.found.find((f) => f.id === best.id);
  if (existing?.confirmed) return panelMsg(`${PL.already_found} · ${defName(best.id)}`);
  const entry = { id: best.id, x: p.x, y: p.y, flags: [...best.flags], confirmed: true, S: best.S, H: best.H, saturated: best.saturated };
  if (existing) Object.assign(existing, entry);
  else P.scan.found.push(entry);
  if (!P.quant.target) P.quant.target = best.id;
  P.done.scan = true;
  emit('practice:mark', { indication_id: best.id });
  if (P.specimen === evalSpec() && P.scan.found.length === 1) takeShot('scan');
  if (P.specimen === evalSpec()) takeShot(`scan:${best.id}`);
  panelMsg(`${PL.marked} · ${defName(best.id)}`);
  marksDirty = true;
  renderPracState();
}

function currentRecordCandidate() {
  return visibleIndication({ state: S.insp, wave, procedure: proc, points: dacPts(), baseGain: critG(), gate: gateOf(), frame: lastFrame,
    minDb: PR.mark.min_f1_minus_dac_dB,
    minPercent: S.taskOn ? TASK_DRIVE.mark_visible.screen_percent : waveRules.display.echo_label_min_percent });
}

function setQuantTarget(id) {
  if (quantRun) return;
  S.prac.quant.target = id;
  updateCriteria();
  renderPracState();
}

// Detection training quantify mode, set on the teacher page of this browser.
const QUANT_MODE_KEY = 'ut.m11.quant_mode';
function quantMode() {
  try { return localStorage.getItem(QUANT_MODE_KEY) === 'manual' ? 'manual' : 'system'; } catch { return 'system'; }
}
function setQuantMode(mode) {
  try { localStorage.setItem(QUANT_MODE_KEY, mode); } catch { /* default mode stays */ }
}
const systemQuant = () => detectionTraining() && quantMode() === 'system';

// Highest F1 − DAC of the echoes accepted by `own` at probe (x, y), at the base sensitivity.
function f1At(x, y, own) {
  const G = critG();
  const pts = dacPts();
  const st = { ...S.insp, gain_dB: G, probe_x_mm: x, probe_y_mm: y, range_mm: Math.max(S.insp.range_mm, 2 * (S.insp.thickness_mm || 0) + 10) };
  let best = null;
  for (const e of wave.echoes(st)) {
    if (e.type !== 'defect' || e.k !== 1 || !(e.pct > 0) || !own(e)) continue;
    const d = proc.f1MinusDac(pts, e.x_mm, e.pct, G);
    if (d != null && (!best || d > best.dB)) best = { dB: d, S: e.x_mm };
  }
  return best;
}

// Lamp-off points left, right, front, back of each block (cluster: one block per member), as in the case reference.
const QUANT_REACH_MM = 150;
const QUANT_STEP_MM = 0.05;
function quantPlan(t) {
  const P = S.prac;
  const d = (S.case && P.specimen === S.case.specimen_id ? S.case.plate : specMan.specimens[P.specimen])?.defects?.find((x) => x.id === t);
  const f = P.scan.found.find((x) => x.id === t);
  const G = critG();
  const pts = dacPts();
  const lit = (x, y) => { const c = proc.criteria({ ...S.insp, probe_x_mm: x, probe_y_mm: y }, pts, G); return c.flags.length > 0 && c.defect === t; };
  const edge = (cx, cy, ux, uy, on) => {
    let lo = 0;
    let hi = QUANT_REACH_MM;
    while (hi - lo > QUANT_STEP_MM) { const m = (lo + hi) / 2; if (on(cx + ux * m, cy + uy * m)) lo = m; else hi = m; }
    const c = practice.clamp(P.specimen, cx + ux * (hi + QUANT_STEP_MM), cy + uy * (hi + QUANT_STEP_MM));
    return [c.x, c.y];
  };
  const blocks = d?.type === 'cluster'
    ? d.members.map((m, i) => ({ c: [m.x_mm, m.y_mm], on: (x, y) => (f1At(x, y, (e) => e.id === t && e.member === i)?.dB ?? -99) > 0, own: (e) => e.id === t && e.member === i }))
    : [{ c: d?.centre_mm && lit(...d.centre_mm) ? d.centre_mm : [f.x, f.y], on: lit, own: (e) => e.id === t }];
  return blocks.map((b) => ({ ...b, pts: [[-1, 0], [1, 0], [0, 1], [0, -1]].map(([ux, uy]) => edge(b.c[0], b.c[1], ux, uy, b.on)) }));
}

const QUANT_GLIDE_MM_S = 40;
const QUANT_GLIDE_MIN_MS = 600;
const QUANT_PAUSE_MS = 500;
let quantRun = null;

async function autoQuantify() {
  const P = S.prac;
  const t = P.quant.target;
  if (quantRun || S.mode !== 'practice' || !practice || examLocked() || replayOn()) return;
  if (!isPlate(P.specimen)) return pracFail('use_specimen');
  if (!t) return pracFail('no_target');
  const id = P.specimen;
  const blocks = quantPlan(t);
  quantRun = t;
  endProbeDrag();
  P.quant.pts[t] = [];
  P.quant.subs[t] = [];
  delete P.quant.eq[t];
  updateResult(t);
  marksDirty = true;
  renderPracState();
  const live = () => quantRun === t && P.specimen === id && P.step === 'quantify' && !examLocked();
  const pause = (ms) => new Promise((r) => setTimeout(r, ms));
  const glide = async (x, y) => {
    const p0 = { ...P.probe[id] };
    const ms = Math.max(QUANT_GLIDE_MIN_MS, (Math.hypot(x - p0.x, y - p0.y) / QUANT_GLIDE_MM_S) * 1000);
    const ok = await tween('probe', 0, 1, ms, (k) => { if (live()) placeProbe(p0.x + (x - p0.x) * k, p0.y + (y - p0.y) * k, { track: false }); });
    if (!ok || !live()) return false;
    placeProbe(x, y, { final: true, track: false });
    emitProbeMove();
    return true;
  };
  try {
    for (const [i, b] of blocks.entries()) {
      if (i) nextBlock();
      for (const [k, [x, y]] of b.pts.entries()) {
        quantPhase = { b: i, nb: blocks.length, k };
        if (!(await glide(b.c[0], b.c[1])) || !(await glide(x, y))) return;
        recordBoundary();
        renderPracState();
        await pause(QUANT_PAUSE_MS);
        if (!live()) return;
      }
    }
    const it = evalItems().find((x) => x.id === t);
    if (!it || !proc.needsD(it)) return;
    const peak = blocks.map((b) => ({ c: b.c, f: f1At(b.c[0], b.c[1], b.own) })).filter((b) => b.f).sort((a, b) => b.f.dB - a.f.dB)[0];
    quantPhase = { eq: true };
    if (!peak || !(await glide(peak.c[0], peak.c[1]))) return;
    autoGain();
    P.quant.eq[t] = { dB: Math.round(peak.f.dB * 100) / 100, S: Math.round(peak.f.S * 10) / 10 };
    if (P.specimen === evalSpec()) takeShot(`quantify:${t}:eq`);
    panelMsg(`${PRD.f1_dac} ${fmtDb(peak.f.dB)}`);
    updateResult(t);
  } finally {
    if (quantRun === t) { quantRun = null; quantPhase = null; }
    marksDirty = true;
    renderPracState();
  }
}

function clearTrail() {
  const sc = S.prac.scan;
  sc.trail = [];
  sc.flags = [];
  sc.cells = new Set();
  sc.speed = { len_mm: 0, over_mm: 0 };
  trailT = null;
  marksDirty = true;
}

function redoStep() {
  if (examLocked()) return;
  const level = S.prac.eval.level;
  clearFrom(S.prac.step);
  if (detectionTraining()) { S.prac.eval.level = level; setDetectionGain(S.prac.step); }
  updateCriteria();
  renderPracState();
}

// waveform_rules.practice.scan: trail, criteria at G_base, flags and found defects.
function updateCriteria({ track = false } = {}) {
  const P = S.prac;
  const on = S.mode === 'practice' && practice && proc && !examLocked() && !replayOn() && P.done.sensitivity && P.sens
    && (P.step === 'scan' || P.step === 'quantify' || P.step === 'evaluate') && isPlate(P.specimen);
  if (!on) { P.crit = null; syncDacAlarm(null); return; }
  const p = P.probe[P.specimen];
  const sc = P.scan;
  if (track) {
    const last = sc.trail[sc.trail.length - 1];
    const d = last ? Math.hypot(p.x - last[0], p.y - last[1]) : 0;
    if (!last || d >= PR.scan.trail_step_mm) {
      const now = performance.now();
      if (last && trailT != null && d <= COV.max_segment_mm) {
        sc.speed ||= { len_mm: 0, over_mm: 0 };
        sc.speed.len_mm += d;
        if ((d * 1000) / Math.max(now - trailT, 1) > STD.scan_speed.max_mm_s) sc.speed.over_mm += d;
      }
      trailT = now;
      sc.trail.push([p.x, p.y]);
      marksDirty = true;
    }
  }
  const c = proc.criteria(S.insp, dacPts(), critG());
  if (S.learning.role !== 'teacher') {
    const seen = visibleIndication({ state: S.insp, wave, procedure: proc, points: dacPts(), baseGain: critG(), minDb: PR.mark.min_f1_minus_dac_dB, minPercent: waveRules.display.echo_label_min_percent });
    c.flags = seen ? seen.flags : [];
  }
  P.crit = c;
  syncCritChips();
  syncDacAlarm(c);
  if (S.learning.role !== 'teacher' || !c.flags.length) return;
  const cell = PR.scan.flag_cell_mm;
  const key = `${Math.round(p.x / cell)},${Math.round(p.y / cell)}`;
  if (!sc.cells.has(key)) {
    sc.cells.add(key);
    sc.flags.push([p.x, p.y]);
    marksDirty = true;
    for (const f of c.flags) emit('practice:flag', { criterion: f, x_mm: p.x, y_mm: p.y });
  }
  const known = c.defect && sc.found.find((f) => f.id === c.defect);
  if (known && !known.flags.length) {
    known.flags = [...c.flags];
    if (!P.quant.target) P.quant.target = c.defect;
    renderPracState();
  } else if (c.defect && !known) {
    sc.found.push({ id: c.defect, x: p.x, y: p.y, flags: [...c.flags], confirmed: false });
    if (!P.quant.target) P.quant.target = c.defect;
    P.done.scan = true;
    if (P.specimen === evalSpec() && sc.found.length === 1) takeShot('scan');
    renderPracState();
  }
}

// waveform_rules.practice.scan.dac_alarm
const DAC_ALARM = PR.scan.dac_alarm;
let dacAlarmOn = false;
function setDacAlarmEnabled(on) {
  if (S.mode !== 'practice' || replayOn() || examLocked()) return;
  S.insp.dac_alarm_enabled = !!on;
  syncDacAlarm(S.prac.crit);
  syncInspCtrls();
}
function syncDacAlarm(c) {
  const alarm = c ? detectionDacAlarm({ enabled: S.insp.dac_alarm_enabled !== false,
    state: S.insp, wave, procedure: proc, points: dacPts(), gate: gateOf() }) : { on: false };
  const on = alarm.on;
  const badge = $('dacAlarmStatus');
  if (badge) {
    badge.textContent = S.insp.dac_alarm_enabled === false ? V5.alarm_off : on ? V5.alarm_triggered : V5.alarm_ready;
    badge.dataset.active = String(on);
    badge.setAttribute('role', 'status');
  }
  if (on === dacAlarmOn) return;
  dacAlarmOn = on;
  inspKey = '';
  emit('practice:dac_alarm', { enabled: on, defect_id: on ? alarm.defectId : null,
    f1_dac_dB: on ? Math.round(alarm.delta_dB * 10) / 10 : null });
}
const alarmBlink = (now) => Math.floor(now / DAC_ALARM.blink_ms) % 2 === 0;

function updateMarks() {
  if (!marksDirty || !practice || !proc) return;
  marksDirty = false;
  pushMarks(S.prac.plateId);
  const box = $('pcCov');
  if (box) { const html = covKv(S.prac.plateId); if (box.innerHTML !== html) box.innerHTML = html; }
}

function pushMarks(id) {
  const { scan, quant: q } = S.prac.plates[id];
  const lists = [...Object.values(q.pts), ...Object.values(q.subs).flat()];
  practice.setMarks(id, {
    trail: scan.trail,
    flags: scan.flags,
    points: lists.flat(),
    rects: lists.map((p) => proc.rect(p)).filter(Boolean),
  });
  practice.setCoverage(id, covShown() ? coverageOf(id) : null, COV.overlay);
  if (id === CASE_ID) practice.setPlan(id, taskPlan(), TASK_DRIVE.overlay);
}

// contracts/tasks.json drive.overlay: card edge zone and planned lines on the task plate; lines run perpendicular to the rolling direction.
function taskPlan() {
  const c = liveCard();
  const sp = specMan.specimens[CASE_ID];
  if (!c || !sp) return null;
  const ex = sp.dims.length.value / 2 - c.edge_zone_mm;
  const ey = sp.dims.width.value / 2 - c.edge_zone_mm;
  if (!(ex > 0 && ey > 0)) return { edge: null, lines: [] };
  const O = TASK_DRIVE.overlay;
  const at = (h) => {
    const n = Math.floor((2 * h) / c.spacing_mm + 1e-9) + 1;
    return n > O.max_lines ? [] : Array.from({ length: n }, (_, i) => Math.round((-h + i * c.spacing_mm) * 10) / 10);
  };
  const rollX = /X$/.test(sp.rolling_direction || TASK_PLATE.rolling_direction);
  const across = rollX ? at(ex).map((x) => [x, -ey, x, ey]) : at(ey).map((y) => [-ex, y, ex, y]);
  const along = c.middle_pattern !== 'grid' ? [] : rollX ? at(ey).map((y) => [-ex, y, ex, y]) : at(ex).map((x) => [x, -ey, x, ey]);
  return { edge: [ex, ey], lines: [...across, ...along] };
}

// waveform_rules.practice.scan_path_coverage: recomputed from the trail; one grid per trail array.
const COV = PR.scan_path_coverage;
const covParams = {};
const covGrids = new WeakMap();
let trailT = null;
function coverageOf(id, P = S.prac) {
  const tr = P.plates[id].scan.trail;
  let g = covGrids.get(tr);
  if (!g) {
    covParams[id] ||= coverageParams({ rules: waveRules, standard: stdPack, specimens: specMan, manifest }, id);
    g = createCoverage(covParams[id]);
    covGrids.set(tr, g);
  }
  return g.add(tr);
}
const covShown = () => (replayOn() ? true : learningHelpOn() ? !!S.prac.cover : examLocked());
const pct = (v) => `${(Math.floor(v * 1000) / 10).toFixed(1)}%`;

function coverageSummary(id, P = S.prac) {
  const m = coverageOf(id, P).metrics();
  const sp = P.plates[id].scan.speed || { len_mm: 0, over_mm: 0 };
  const r3 = (v) => (v == null ? null : Math.round(v * 1000) / 1000);
  return {
    edge: r3(m.edge), middle: r3(m.middle), whole: r3(m.whole), cells: m.cells, direction_ratio: r3(m.direction_ratio),
    overspeed_ratio: sp.len_mm > 0 ? r3(sp.over_mm / sp.len_mm) : null, scan_len_mm: Math.round(sp.len_mm),
  };
}

function covKv(id) {
  const A = assessDoc.coverage;
  const m = coverageOf(id).metrics();
  const q = scanQualityOf(id);
  return [[A.edge, m.edge], [A.middle, m.middle], [A.whole, m.whole], [WF.overspeed, q.overspeed], [WF.direction, q.direction]].map(([k, v]) => `<span>${esc(k)}</span><b>${v == null ? esc(WF.quality_empty) : pct(v)}</b>`).join('');
}

function toggleCoverage() {
  if (!learningHelpOn()) return;
  S.prac.cover = !S.prac.cover;
  emit('coverage:view', { enabled: S.prac.cover });
  pushMarks(S.prac.plateId);
  renderPracState();
}

// X-ray view (waveform_rules.practice.dac.xray): reference block with target / recorded hole colours; scan plate with its defects.
let xrayKey = '';
function updateXray() {
  if (!practice) return;
  const P = S.prac;
  const X = PR.dac.xray;
  const id = dacSpecimen();
  const live = S.mode === 'practice';
  const onId = live && P.specimen === id && P.xray ? id : live && isPlate(P.specimen) && P.xrayPlate ? P.specimen : null;
  const holes = specMan.specimens[id]?.holes || [];
  const done = new Set(P.dac.points.map((p) => p.id));
  const target = P.step === 'dac' ? holes.find((h) => !done.has(h.id))?.id : null;
  const key = `${onId}|${[...done].join()}|${target}`;
  if (key === xrayKey) return;
  xrayKey = key;
  practice.setXray(onId, X.block_opacity);
  const colors = {};
  for (const h of holes) {
    if (h.id === target) colors[h.id] = X.colors.target;
    else if (done.has(h.id)) colors[h.id] = X.colors.done;
  }
  practice.setFeatureColors(id, colors);
}

function toggleXray() {
  if (!learningHelpOn()) return;
  const P = S.prac;
  const plate = isPlate(P.specimen);
  if (plate) P.xrayPlate = !P.xrayPlate;
  else P.xray = !P.xray;
      emit('practice:xray', { specimen_id: plate ? P.specimen : dacSpecimen(), enabled: plate ? P.xrayPlate : P.xray });
  renderStepCard();
}

function stopProbeGlide() {
  const t = tweens.get('probe');
  if (!t) return;
  tweens.delete('probe');
  t.resolve(false);
}

// waveform_rules.practice.dac.find_hole: glide to the first unrecorded hole (all recorded: the hole after the nearest).
function findHole() {
  if (S.mode !== 'practice' || !practice || !learningHelpOn()) return;
  const P = S.prac;
  const id = dacSpecimen();
  if (P.specimen !== id) setSpecimen(id);
  const holes = specMan.specimens[id].holes;
  const p0 = { ...P.probe[id] };
  const dist = (h) => Math.hypot(h.x_mm - p0.x, h.y_mm - p0.y);
  let h = holes.find((x) => !P.dac.points.some((q) => q.id === x.id));
  if (!h) {
    const near = holes.reduce((a, b) => (dist(b) < dist(a) ? b : a));
    h = holes[(holes.indexOf(near) + 1) % holes.length];
  }
  endProbeDrag();
  emit('practice:find_hole', { hole_id: h.id });
  tween('probe', 0, 1, PR.dac.find_hole.glide_ms, (k) => {
    if (S.prac.specimen === id) placeProbe(p0.x + (h.x_mm - p0.x) * k, p0.y + (h.y_mm - p0.y) * k);
  }).then((ok) => {
    if (!ok || S.prac.specimen !== id) return;
    placeProbe(h.x_mm, h.y_mm, { final: true });
    emitProbeMove();
  });
}

function emitProbeMove() {
  const p = S.prac.probe[S.prac.specimen];
  emit('practice:probe_move', { x_mm: p.x, y_mm: p.y });
}

// Cable end follows the connector; the sag rests on the specimen when its midpoint is over the footprint.
function updateCable() {
  if (!cableDirty || S.mode !== 'practice' || !instrument) return;
  const top = probeOffset.clone();
  top.y += CONNECTOR_TOP;
  const id = S.prac.specimen;
  const mid = instrument.endpoints().portTop.add(top).multiplyScalar(0.5);
  const cableR = instMan.cable.outer_diameter_mm / 2000;
  const floorY = practice.inside(id, mid, 10) ? practice.topY(id) + cableR + 0.004 : undefined;
  instrument.setProbeAnchor(top, { floorY, segments: cableDirty === 2 ? 220 : 96 });
  cableDirty = 0;
}

function setPracticeSection(mode) {
  if (!SECTION_MODES.includes(mode) || !practice) return;
  S.prac.section = mode;
  practice.setSection(mode, S.prac.probe[S.prac.specimen]);
  panel.querySelectorAll('.prac-sec button').forEach((b) => b.classList.toggle('on', b.dataset.sec === mode));
  if (mode !== 'off') setInspCamera('section');
  else if (S.inspCam === 'section') setInspCamera('system');
}

function practiceView(k) {
  const id = S.prac.specimen;
  const p = S.prac.probe[id];
  if (k === 'probe') {
    const w = practice.toWorld(id, p.x, p.y);
    return { target: [w.x, w.y + 0.012, w.z], dir: [0.9, 0.6, 1], dist: 0.32 };
  }
  if (k === 'section') {
    const s = practice.specimens[id];
    const across = S.prac.section === 'across';
    const c = practice.toWorld(id, across ? p.x : 0, across ? 0 : p.y, s.T / 2);
    const span = Math.max(across ? s.W : s.L, s.T * 2) * 0.001;
    return { target: [c.x, c.y, c.z], dir: across ? [1, 0.28, 0.18] : [0.18, 0.28, 1], dist: span * 1.9 };
  }
  if (k === 'screen' || k === 'panel') return scenesDoc.cameras[INSP_CAMS[k]];
  return scenesDoc.cameras.practice;
}

function syncPracticeReadout() {
  const box = $('pracPos');
  if (!box) return;
  const p = S.prac.probe[S.prac.specimen];
  const mm = UI.inspection.unit_mm;
  box.innerHTML = `<span>${esc(PL.probe)}</span><span>${esc(PL.x)}</span><b>${p.x.toFixed(1)}</b><span>${esc(PL.y)}</span><b>${p.y.toFixed(1)}</b><span>${esc(mm)}</span>`;
}

// Probe drag on the test surface (pointer on a probe part); orbit resumes on release.
const dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
function rayToTop(clientX, clientY) {
  const r = canvas.getBoundingClientRect();
  ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  dragPlane.constant = -practice.topY(S.prac.specimen);
  const hit = new THREE.Vector3();
  return raycaster.ray.intersectPlane(dragPlane, hit) ? hit : null;
}

function endProbeDrag() {
  if (!probeDrag) return;
  const d = probeDrag;
  probeDrag = null;
  controls.enabled = true;
  canvas.releasePointerCapture?.(d.id);
  canvas.style.cursor = '';
  if (d.moved < 5) { select(d.pid); return; }
  cableDirty = 2;
  emitProbeMove();
}

canvas.addEventListener('pointerdown', (e) => {
  if (e.button !== 0 || S.mode !== 'practice' || !practice || !root || replayOn()) return;
  const pid = pickAt(e.clientX, e.clientY);
  if (!pid || !parts[pid]) return;
  const hit = rayToTop(e.clientX, e.clientY);
  if (!hit) return;
  e.stopImmediatePropagation();
  stopProbeGlide();
  const id = S.prac.specimen;
  const p = S.prac.probe[id];
  const q = practice.fromWorld(id, hit);
  probeDrag = { pid, dx: p.x - q.x, dy: p.y - q.y, x0: e.clientX, y0: e.clientY, moved: 0, id: e.pointerId };
  controls.enabled = false;
  canvas.setPointerCapture?.(e.pointerId);
  canvas.style.cursor = 'grabbing';
}, { capture: true });
canvas.addEventListener('pointermove', (e) => {
  if (!probeDrag) return;
  e.stopImmediatePropagation();
  probeDrag.moved = Math.max(probeDrag.moved, Math.hypot(e.clientX - probeDrag.x0, e.clientY - probeDrag.y0));
  if (probeDrag.moved < 5) return;
  const hit = rayToTop(e.clientX, e.clientY);
  if (!hit) return;
  const q = practice.fromWorld(S.prac.specimen, hit);
  placeProbe(q.x + probeDrag.dx, q.y + probeDrag.dy);
}, { capture: true });
canvas.addEventListener('pointerup', (e) => {
  if (!probeDrag) return;
  e.stopImmediatePropagation();
  endProbeDrag();
}, { capture: true });

const PROBE_KEYS = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };
const PROBE_FINE_MM = 0.5;
const probeStep = () => quickFloat.step ?? (S.prac.step === 'quantify' ? PROBE_FINE_MM : PLIM.keyboard_step_mm);
function nudgeProbe(dx, dy, st = probeStep()) {
  if (S.mode !== 'practice' || !practice || probeDrag || replayOn()) return;
  stopProbeGlide();
  const p = S.prac.probe[S.prac.specimen];
  placeProbe(p.x + dx * st, p.y + dy * st, { final: true });
  emitProbeMove();
}
window.addEventListener('keydown', (e) => {
  const d = PROBE_KEYS[e.key];
  if (!d || S.mode !== 'practice' || !practice || probeDrag || replayOn() || document.body.dataset.track === 'weld') return;
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '')) return;
  e.preventDefault();
  nudgeProbe(d[0], d[1], e.shiftKey ? PLIM.keyboard_step_shift_mm : probeStep());
});

// ------------------------------------------------------------------ inspection cycle
let insp = null;
let inspKey = '';
let inspLast = 0;
let inspView = null;
let inspGlow = {};
const INSP_TAU = { high: 0.3, medium: 0.5, low: 1.6 };
const INSP_GLOW_IDS = [...new Set([...UI.chains.electrical.ids, ...Object.values(inspDoc.phases).flatMap((p) => p.highlight).filter((h) => h.startsWith(PREFIX))])];

function inspDefaults() {
  const sc = INSP_SCENES[S.insp.scene];
  return {
    scene: sc.id,
    ...Object.fromEntries(Object.entries(waveRules.controls).map(([k, v]) => [k, v.default])),
    ...sc.defaults,
  };
}

function onInspPhase(phase) {
  emit('inspection:phase', { phase });
  updateBadges();
  renderInspPhase();
  syncInspOps();
}

function inspPulse() {
  insp.pulse();
  ssMark('pulse', 'wave');
  inspKey = '';
  emit('inspection:pulse');
  onInspPhase(insp.st.phase);
}

function inspContinuous(on = !insp.st.continuous) {
  insp.setContinuous(on);
  inspKey = '';
  emit('inspection:continuous', { on });
  onInspPhase('IDLE');
}

function inspPause() {
  insp.setPaused(!insp.st.paused);
  syncInspOps();
}

function inspReset() {
  insp.reset();
  S.insp = inspDefaults();
  S.inspExp = null;
  S.inspPrediction = null;
  resetPanel();
  applyInspCoupling();
  updateSteelSection();
  inspKey = '';
  emit('inspection:reset');
  onInspPhase('IDLE');
  renderPanel();
}

function syncInspOps() {
  const st = insp.st;
  const set = (id, on, dis = false) => {
    const b = $(id);
    if (!b) return;
    b.classList.toggle('on', on);
    b.disabled = dis;
  };
  set('inspPulse', st.running && !st.paused);
  set('inspCont', st.continuous);
  set('inspPause', st.paused, !st.running);
}

function renderInspPhase() {
  const box = $('inspPhase');
  if (!box) return;
  const st = insp.st;
  const cur = st.running ? st.phase : null;
  const iCur = cur ? insp.phases.indexOf(cur) : st.done ? insp.phases.length : -1;
  const strip = insp.phases.map((p, i) => {
    const color = UI.chains[inspDoc.phases[p].chain_focus].color;
    return `<i class="${i < iCur ? 'past' : i === iCur ? 'cur' : ''}" style="--chain:${color}" title="${esc(inspDoc.phases[p].title)}"></i>`;
  }).join('');
  const ph = cur ? inspDoc.phases[cur] : null;
  box.style.setProperty('--chain', ph ? UI.chains[ph.chain_focus].color : '#94a3b8');
  box.classList.toggle('idle', !ph);
  box.innerHTML = `<div class="ip-strip">${strip}</div>` + (ph
    ? `<div class="ip-head"><span>${esc(UI.inspection.phase)}</span><b>${esc(ph.title)}</b></div>
    <div class="ip-cap">${esc(ph.caption)}</div>`
    : '');
}

function revealedEchoes(fr) {
  const revealT = (fr.shown / fr.columns) * fr.tWin;
  return fr.echoes.filter((e) => e.type !== 'main_bang' && !e.minor && e.t + e.len / 2 <= Math.min(fr.tWin, revealT)
    && e.pct >= waveRules.display.echo_label_min_percent && !inMainBang(e, fr));
}

function renderInspReadout(fr, v) {
  const L = UI.inspection;
  const tb = $('inspRead');
  if (tb) {
    const tag = (e) => (e.type === 'defect' ? `${L.echo_labels.defect}${e.k || ''}` : `${L.echo_labels.back_wall}${e.k}`);
    const html = revealedEchoes(fr)
      .map((e) => `<tr><td><b>${esc(tag(e))}</b></td><td>${e.t.toFixed(2)}</td><td>${e.x_mm.toFixed(1)}</td><td>${Math.min(100, e.pct).toFixed(e.pct < 10 ? 1 : 0)}${e.pct > 100 ? '+' : ''}</td></tr>`)
      .join('');
    if (tb.innerHTML !== html) tb.innerHTML = html;
  }
  const live = $('inspLive');
  if (live) {
    const t = v.sweepUs;
    live.innerHTML = t == null ? '' : `<span>${esc(L.time)} t</span><b>${t.toFixed(2)} ${esc(L.unit_us)}</b><span>${esc(L.depth)}</span><b>${wave.depth(t, S.insp.velocity_m_s).toFixed(1)} ${esc(L.unit_mm)}</b>`;
  }
}

function inspSysGlow(v) {
  const glow = {};
  if (!v.running) {
    if (v.continuous) glow.instrument__status_led = 0.6;
    return glow;
  }
  const T = v.start;
  const tc = v.tc;
  const soft = 0.35 + 0.25 * Math.sin(tc * 9);
  if (v.phase === 'PULSER_FIRE') {
    glow.instrument__status_led = 1;
    glow.instrument__port_tr = soft;
  }
  if (v.phase === 'CABLE_TX' && v.u < 0.15) glow.instrument__port_tr = soft;
  if (v.phase === 'CABLE_RX' && tc > T.INSTRUMENT_RX - 0.15) glow.instrument__port_tr = soft;
  if (v.phase === 'INSTRUMENT_RX') glow.instrument__housing = 0.25;
  if (v.tcF != null && tc > v.tcF + 0.3 + FLASH_S - 0.15 && tc < v.tcF + 0.3 + FLASH_S + 0.25) glow.instrument__port_tr = soft * inspKappa() ** 2;
  return glow;
}

const FLASH_S = 0.6;

function inspCableSignal(v) {
  if (!v.running) return [-1, 0];
  const T = v.start;
  if (v.phase === 'CABLE_TX') return [v.u, 1];
  const f0 = v.tcF != null ? v.tcF + 0.3 : Infinity;
  if (v.tc >= f0 && v.tc < f0 + FLASH_S) return [1 - (v.tc - f0) / FLASH_S, 0.8 * inspKappa() ** 2 * Math.min(1, Math.sqrt(v.relF))];
  const t0 = T.CABLE_RX + 0.4;
  if (v.phase === 'CABLE_RX' && v.tc >= t0) return [1 - (v.tc - t0) / (T.INSTRUMENT_RX - t0), 0.8 * inspKappa() ** 2];
  return [-1, 0];
}

const inspKappa = () => waveRules.amplitude.coupling.pass_factor[S.insp.coupling];

function applyInspCoupling(active = true) {
  const air = active && S.insp.coupling === 'air_gap';
  physics.configure({ medium: air ? 'air' : 'couplant' });
  if (S.hidden.has(COUPLANT_ID) !== air) {
    if (air) S.hidden.add(COUPLANT_ID);
    else S.hidden.delete(COUPLANT_ID);
    updateVisibility();
  }
}

const INSP_EMIT = {
  gain_dB: (v) => emit('instrument:gain', { gain_dB: v }),
  range_mm: (v) => emit('instrument:range', { range_mm: v }),
  velocity_m_s: (v) => emit('instrument:velocity', { velocity_m_s: v }),
  display: (v) => emit('instrument:display', { mode: v }),
  coupling: (v) => emit('inspection:coupling', { level: v }),
  damping: (v) => emit('inspection:damping', { level: v }),
  defect_depth_mm: (v) => emit('inspection:defect_depth', { depth_mm: v }),
  gain_step_dB: (v) => emit('instrument:gain_step', { step_dB: v }),
  gate_on: () => emitGate(),
  gate_start_mm: () => emitGate(),
  gate_width_mm: () => emitGate(),
  gate_threshold_pct: () => emitGate(),
};

const gateOf = (st = S.insp) => ({ on: st.gate_on, start_mm: st.gate_start_mm, width_mm: st.gate_width_mm, threshold_pct: st.gate_threshold_pct });
const emitGate = () => emit('instrument:gate', { enabled: S.insp.gate_on, start_mm: S.insp.gate_start_mm, width_mm: S.insp.gate_width_mm, threshold_percent: S.insp.gate_threshold_pct });

function setInspScene(id) {
  if (!INSP_SCENES[id]) return;
  S.insp.scene = id;
  S.inspExp = null;
  S.inspPrediction = null;
  insp.reset();
  S.insp = inspDefaults();
  resetPanel();
  applyInspCoupling();
  updateSteelSection();
  inspKey = '';
  emit('inspection:scene', { scene_id: id });
  onInspPhase('IDLE');
  renderPanel();
}

const INSP_KEY_NAME = { gain_dB: 'gain', range_mm: 'range', velocity_m_s: 'velocity', display: 'display', coupling: 'coupling', damping: 'damping', defect_depth_mm: 'defect_depth' };

function inspValueText(key, v) {
  const L = UI.inspection;
  if (key === 'gain_dB') return `${Number(v).toFixed(1)} ${L.unit_dB}`;
  if (key === 'range_mm' || key === 'defect_depth_mm') return `${v} ${L.unit_mm}`;
  if (key === 'velocity_m_s') return `${v} ${L.unit_m_s}`;
  if (key === 'display') return L.display_modes[v];
  if (key === 'coupling') return L.coupling_levels[v];
  if (key === 'damping') return UI.lab.damping_levels[v];
  if (key === 'gate_start_mm' || key === 'gate_width_mm') return `${Number(v).toFixed(1)} ${L.unit_mm}`;
  if (key === 'gate_threshold_pct') return `${v}%`;
  if (key === 'gain_step_dB') return `${v} ${L.unit_dB}`;
  if (key === 'gate_on') return v ? PANEL.gate.on : PANEL.gate.off;
  return String(v);
}

function expStepLabel(step) {
  if (step.label) return step.label;
  const L = UI.inspection;
  if (step.action === 'pulse') return L.pulse;
  return Object.entries(step.set).map(([k, v]) => `${L[INSP_KEY_NAME[k]]} ${inspValueText(k, v)}`).join(' · ');
}

function runExperiment(id, step = 0) {
  const exp = theoryDoc.experiments.find((e) => e.id === id);
  if (!exp) return;
  step = Math.min(exp.steps.length - 1, Math.max(0, Math.floor(Number(step) || 0)));
  const same = S.inspExp?.id === id;
  if (!same) S.inspPrediction = null;
  if (step > 0 && S.learning.role !== 'teacher' && !S.inspPrediction) return;
  if (S.insp.scene !== exp.scenario) setInspScene(exp.scenario);
  S.inspExp = { id, step };
  const want = theoryStateAtStep(exp, inspDefaults(), step, theoryDoc.baseline);
  insp.reset();
  resetPanel();
  for (const [key, value] of Object.entries(want)) {
    if (waveRules.controls[key]) setInsp(key, value);
    else S.insp[key] = value;
  }
  applyInspCoupling();
  updateSteelSection();
  inspKey = '';
  if (exp.steps[step].action === 'pulse') {
    inspPulse();
  } else if (exp.steps[step].pulse === false) {
    onInspPhase('IDLE');
  } else {
    inspContinuous(true);
  }
  renderInspExp();
}

function renderInspExp() {
  const box = $('inspExp');
  if (!box) return;
  const L = UI.inspection;
  const cur = S.inspExp;
  const teacher = S.learning.role === 'teacher';
  const list = cur && studyCardOn() ? theoryDoc.experiments.filter((e) => e.id === cur.id) : theoryDoc.experiments;
  box.innerHTML = `<div class="cc-title">${esc(L.experiments)}</div>` + list.map((e, i) => {
    const on = cur && cur.id === e.id;
    const steps = on && e.steps.length > 1
      ? `<div class="ie-steps">${e.steps.map((s, j) => `<button data-exp="${e.id}" data-step="${j}" class="${j === cur.step ? 'on' : ''}" ${j > 0 && !teacher && !S.inspPrediction ? 'disabled' : ''}>${esc(expStepLabel(s))}</button>`).join('')}</div>`
      : '';
    const q = on ? renderTheoryLearning({ text: theoryDoc, experimentId: e.id, step: cur.step, wave, state: S.insp, prediction: S.inspPrediction, teacher }) : '';
    return `<div class="ie ${on ? 'on' : ''}"><button class="ie-title" data-exp="${e.id}" data-step="0"><i>${i + 1}</i>${esc(e.title)}</button>${steps}${q}</div>`;
  }).join('');
  box.querySelectorAll('button[data-exp]').forEach((b) => { b.onclick = () => runExperiment(b.dataset.exp, Number(b.dataset.step)); });
  box.querySelectorAll('button[data-theory-option]').forEach((b) => { b.onclick = () => {
    if (b.dataset.theoryExperiment !== S.inspExp?.id || help.run) return;
    if (!S.inspPrediction) { inspTry.n += 1; inspTry.by = 'learner'; }
    S.inspPrediction = b.dataset.theoryOption;
    renderInspExp();
  }; });
}

function setInsp(key, value, { silent = false } = {}) {
  if (replayOn() || examLocked()) return;
  if (detectionTraining() && S.mode === 'practice' && PRESET_LOCKS.has(key)) return;
  const c = waveRules.controls[key];
  if (c.min != null) {
    const dec = (String(c.step).split('.')[1] || '').length;
    value = Math.min(c.max, Math.max(c.min, Number((Math.round(value / c.step) * c.step).toFixed(dec))));
  }
  const changed = S.insp[key] !== value;
  S.insp[key] = value;
  if (changed && S.panel.frozen && !FROZEN_OK.has(key)) setFreeze(false);
  if (changed && key === 'coupling') applyInspCoupling();
  if (changed && key === 'defect_depth_mm') updateSteelSection();
  if (changed && S.mode === 'practice') onPracSetting(key);
  if (changed && S.mode === 'inspection') ssMark(`set:${key === 'gate_on' || GATE_SUBS.includes(key) ? 'gate' : key}`, 'wave');
  if (changed && S.mode === 'equipment' && S.eqInst && key in S.eqInst) { S.eqInst[key] = value; benchKey = ''; }
  if (!silent) INSP_EMIT[key](value);
  syncInspCtrls();
}

function syncInspCtrls() {
  const box = $('inspCtrls');
  if (!box) return;
  const L = UI.inspection;
  box.querySelectorAll('button[data-k]').forEach((b) => b.classList.toggle('on', String(S.insp[b.dataset.k]) === b.dataset.v));
  box.querySelectorAll('input[data-k]').forEach((i) => { if (document.activeElement !== i) i.value = String(S.insp[i.dataset.k]); });
  const g = $('inspGainVal');
  if (g) g.textContent = `${S.insp.gain_dB.toFixed(1)} ${L.unit_dB}`;
  const vv = $('inspVelVal');
  if (vv) vv.textContent = `${S.insp.velocity_m_s} ${L.unit_m_s}`;
  const dv = $('inspDepthVal');
  if (dv) dv.textContent = `${S.insp.defect_depth_mm} ${L.unit_mm}`;
  const zv = $('inspZeroVal');
  if (zv) zv.textContent = `${S.insp.zero_us.toFixed(2)} ${practiceDoc.readout.unit_us}`;
  const rv = $('inspRejVal');
  if (rv) rv.textContent = `${S.insp.reject_percent}%`;
  for (const k of GATE_SUBS) {
    const s = $(`inspVal_${k}`);
    if (s) s.textContent = inspValueText(k, S.insp[k]);
  }
  const fnKey = PANEL_FN_KEY[S.panel.fn];
  box.querySelectorAll('.ic-row').forEach((r) => r.classList.toggle('fn', r.dataset.k === fnKey));
}

// ------------------------------------------------------------------ instrument panel keys (M5.5)
const PANEL = inspDoc.panel;
const KEYS = instMan.keys;
const PANEL_INACTIVE = new Set(KEYS.inactive_in_v1);
const GATE_SUBS = ['gate_start_mm', 'gate_width_mm', 'gate_threshold_pct'];
const PANEL_FN_KEY = { gain: 'gain_dB', range: 'range_mm', velocity: 'velocity_m_s', gate: 'gate_on', display: 'display', zero: 'zero_us', reject: 'reject_percent' };
const PRAC_KEYS = new Set(KEYS.active_in_practice);
const FROZEN_OK = new Set(['gate_on', 'gain_step_dB', ...GATE_SUBS]);
let lastFrame = null;
let frozenFrame = null;

function panelMsg(text) {
  S.panel.msg = text;
  S.panel.msgUntil = performance.now() + 1600;
  inspKey = '';
}

function setPanelFn(fn) {
  S.panel.fn = fn;
  inspKey = '';
  syncInspCtrls();
}

function frozenBlock() {
  if (!S.panel.frozen) return false;
  panelMsg(PANEL.messages.frozen);
  return true;
}

function stepOption(key, list, d, wrap = false) {
  const i = Math.max(0, list.indexOf(S.insp[key]));
  const j = wrap ? (i + d + list.length) % list.length : Math.min(list.length - 1, Math.max(0, i + d));
  if (list[j] !== S.insp[key]) setInsp(key, list[j]);
}

function gateStep(key) {
  const c = waveRules.controls[key];
  if (key === 'gate_threshold_pct') return c.step;
  return Math.max(c.step, Math.round(S.insp.range_mm / 100 / c.step) * c.step);
}

// One encoder detent or one arrow press (▲ +1 / ▼ −1) on the selected function.
function panelAdjust(d) {
  const C = waveRules.controls;
  const fn = S.panel.fn;
  if (fn !== 'gate' && frozenBlock()) return;
  if (fn === 'gain') setInsp('gain_dB', S.insp.gain_dB + d * S.insp.gain_step_dB);
  else if (fn === 'range') stepOption('range_mm', C.range_mm.presets, d);
  else if (fn === 'velocity') setInsp('velocity_m_s', S.insp.velocity_m_s + d * CAL_RULES.velocity_adjust.encoder_m_s);
  else if (fn === 'gate') {
    const k = GATE_SUBS[S.panel.gateSub];
    setInsp(k, S.insp[k] + d * gateStep(k));
  } else if (fn === 'display') stepOption('display', C.display.options, d, true);
  else if (fn === 'zero') setPracCtl('zero_us', S.insp.zero_us + d * CAL_RULES.zero_adjust.encoder_us);
  else if (fn === 'reject') setPracCtl('reject_percent', S.insp.reject_percent + d * PRAC_CTL.reject_percent.step);
}

// ◀ / ▶: sub-item or coarse step of the selected function.
function panelSide(d) {
  const C = waveRules.controls;
  const fn = S.panel.fn;
  if (fn !== 'gate' && fn !== 'gain' && frozenBlock()) return;
  if (fn === 'gain') stepOption('gain_step_dB', C.gain_step_dB.options, d);
  else if (fn === 'range') stepOption('range_mm', C.range_mm.presets, d);
  else if (fn === 'velocity') setInsp('velocity_m_s', S.insp.velocity_m_s + d * CAL_RULES.velocity_adjust.side_m_s);
  else if (fn === 'gate') { S.panel.gateSub = (S.panel.gateSub + d + GATE_SUBS.length) % GATE_SUBS.length; inspKey = ''; }
  else if (fn === 'display') stepOption('display', C.display.options, d, true);
  else if (fn === 'zero') setPracCtl('zero_us', S.insp.zero_us + d * CAL_RULES.zero_adjust.side_us);
  else if (fn === 'reject') setPracCtl('reject_percent', S.insp.reject_percent + d * PRAC_CTL.reject_percent.step * 5);
}

function softKeys() {
  const C = waveRules.controls;
  const L = UI.inspection;
  const fn = S.panel.fn;
  const pick = (k, v) => { if (S.insp[k] !== v) setInsp(k, v); };
  let items = [];
  if (fn === 'zero') items = [{ label: PANEL.fn.zero, sub: `${S.insp.zero_us.toFixed(2)} ${PRD.unit_us}`, on: true, act: () => {} }];
  else if (fn === 'reject') items = [{ label: PANEL.fn.reject, sub: `${S.insp.reject_percent}%`, on: true, act: () => {} }, { label: '0%', act: () => setPracCtl('reject_percent', 0) }];
  else if (fn === 'gain') items = C.gain_step_dB.options.map((v) => ({ label: `${v} ${L.unit_dB}`, sub: PANEL.gain_step, on: S.insp.gain_step_dB === v, act: () => pick('gain_step_dB', v) }));
  else if (fn === 'range') items = C.range_mm.presets.map((v) => ({ label: `${v} ${L.unit_mm}`, on: S.insp.range_mm === v, act: () => pick('range_mm', v) }));
  else if (fn === 'velocity') items = C.velocity_m_s.presets.map((v) => ({ label: String(v), sub: inspDoc.velocity_presets[v] || L.unit_m_s, on: S.insp.velocity_m_s === v, act: () => pick('velocity_m_s', v) }));
  else if (fn === 'gate') {
    const G = PANEL.gate;
    items = [
      { label: G.title, sub: S.insp.gate_on ? G.on : G.off, on: S.insp.gate_on, act: () => pick('gate_on', !S.insp.gate_on) },
      ...GATE_SUBS.map((k, i) => ({ label: G[['start', 'width', 'threshold'][i]], sub: inspValueText(k, S.insp[k]), on: S.panel.gateSub === i, act: () => { S.panel.gateSub = i; inspKey = ''; } })),
    ];
    if (S.mode === 'practice') items.push({ label: PL.dac, sub: S.insp.dac_show ? PL.on : PL.off, on: S.insp.dac_show, act: () => setDacShow(!S.insp.dac_show) });
  } else if (fn === 'display') items = C.display.options.map((v) => ({ label: L.display_modes[v], on: S.insp.display === v, act: () => pick('display', v) }));
  return KEYS.soft.map((_, i) => items[i] || null);
}

function setFreeze(on) {
  S.panel.frozen = on;
  frozenFrame = on ? lastFrame : null;
  inspKey = '';
  emit('instrument:freeze', { on });
}

function autoGain() {
  if (replayOn() || examLocked()) return;
  if (frozenBlock()) return;
  const A = waveRules.auto_gain;
  const gate = gateOf();
  const read = (gdB) => gateReading(wave.synth({ ...S.insp, gain_dB: gdB }, { columns: 480, noise: false }), gate);
  const g = read(S.insp.gain_dB);
  if (!g || !g.top || g.top.pct < A.min_percent) {
    panelMsg(PANEL.messages.no_echo);
    emit('instrument:auto_gain', { gain_dB: S.insp.gain_dB, ok: false });
    return;
  }
  let gdB = S.insp.gain_dB + 20 * Math.log10(A.target_percent / g.top.pct);
  const g2 = read(gdB);
  if (g2 && g2.h > 0 && g2.h < waveRules.display.clip_percent) gdB += 20 * Math.log10(A.target_percent / g2.h);
  setInsp('gain_dB', gdB);
  const g3 = read(S.insp.gain_dB);
  emit('instrument:auto_gain', { gain_dB: S.insp.gain_dB, ok: !!g3 && Math.abs(g3.h - A.target_percent) <= A.tolerance_percent });
}

function pressPanelKey(id) {
  if (!instrument || !instrument.keys[id] || replayOn()) return;
  instrument.pressKey(id);
  emit('instrument:key', { key_id: id });
  if (S.mode === 'inspection') ssMark(`key:${id}`, 'wave');
  const prac = S.mode === 'practice';
  if (PANEL_INACTIVE.has(id) && !(prac && PRAC_KEYS.has(id))) { panelMsg(PANEL.messages.inactive); return; }
  const C = waveRules.controls;
  if (id === 'key__enter' && prac) practiceRecord();
  else if (id === 'key__zero') { if (!frozenBlock()) setPanelFn('zero'); }
  else if (id === 'key__reject') { if (!frozenBlock()) setPanelFn('reject'); }
  else if (id === 'key__peak') setPracCtl('peak_memory', !S.insp.peak_memory);
  else if (id === 'key__gain' || id === 'key__enter') setPanelFn('gain');
  else if (id === 'key__db_step') { setPanelFn('gain'); stepOption('gain_step_dB', C.gain_step_dB.options, 1, true); }
  else if (id === 'key__display' && frozenBlock()) setPanelFn('display');
  else if (id === 'key__auto_gain') autoGain();
  else if (id === 'key__range') setPanelFn('range');
  else if (id === 'key__velocity') setPanelFn('velocity');
  else if (id === 'key__gate') setPanelFn('gate');
  else if (id === 'key__display') { setPanelFn('display'); stepOption('display', C.display.options, 1, true); }
  else if (id === 'key__freeze') setFreeze(!S.panel.frozen);
  else if (id === 'key__up') panelAdjust(1);
  else if (id === 'key__down') panelAdjust(-1);
  else if (id === 'key__left') panelSide(-1);
  else if (id === 'key__right') panelSide(1);
  else {
    const sk = softKeys()[KEYS.soft.indexOf(id)];
    if (sk && !(S.panel.fn !== 'gate' && S.panel.fn !== 'gain' && frozenBlock())) sk.act();
  }
  inspKey = '';
  syncInspCtrls();
}

function turnPanelEncoder(detents) {
  if (!instrument || !detents || replayOn()) return;
  instrument.turnEncoder(detents);
  if (S.mode === 'inspection') ssMark('key:encoder', 'wave');
  const n = Math.abs(detents);
  for (let i = 0; i < n; i++) panelAdjust(Math.sign(detents));
}

function resetPanel() {
  S.panel.fn = 'gain';
  S.panel.gateSub = 0;
  S.panel.msg = null;
  if (S.panel.frozen) setFreeze(false);
}

function tickInspection(now) {
  const dt = Math.min(0.25, Math.max(0, (now - inspLast) / 1000));
  inspLast = now;
  if (!inspOn() || !insp) return;
  const ch = insp.tick(dt);
  if (ch) onInspPhase(ch);
  const v = insp.view(S.insp);
  inspView = v;
  const prac = S.mode === 'practice';
  if (!prac) {
    physics.drive({
      phase: v.phase, tc: v.tc, start: v.start, front: v.front, back: v.back,
      cycles: scenesDoc.teaching_settings.lab.damping_cycles[S.insp.damping], tau: INSP_TAU[S.insp.damping],
      trans: waveRules.amplitude.coupling.pass_factor[S.insp.coupling], steady: v.continuous,
      fv: v.tPhys == null ? null : v.tPhys / (v.tB1 / 2),
      defect: v.tcF == null ? null : { y: -v.depthF / 1000, rel: v.relF, tc: v.tcF },
    });
  }
  instrument.setSignal(...inspCableSignal(v));
  inspGlow = {};
  if (v.running && !prac) {
    const k = 0.22 + 0.12 * Math.sin(v.tc * 8);
    for (const h of inspDoc.phases[v.phase].highlight) if (parts[h]) inspGlow[h] = h === 'probe__steel_block' ? k * 0.35 : k;
  }
  instrument.applyGlow(inspSysGlow(v), UI.chains.electrical.color, S.selected, S.hovered);
  const alarm = prac && dacAlarmOn;
  if (alarm && instrument.led) {
    const k = alarmBlink(now) ? 2.5 : 0.3;
    instrument.led.traverse((m) => {
      if (!m.isMesh || !m.material.emissive) return;
      m.material.emissive.set(DAC_ALARM.color);
      m.material.emissiveIntensity = k;
    });
  }
  instrument.tickControls(dt);
  if (S.panel.msg && now > S.panel.msgUntil) S.panel.msg = null;
  const key = (v.continuous && !S.panel.frozen
    ? `c${Math.floor(now / (1000 / waveRules.animation.continuous.refresh_hz))}`
    : `${v.phase}|${v.revealUs}|${v.sweepUs}|${v.seed}|${JSON.stringify(S.insp)}`) + `|${JSON.stringify(S.panel)}`
    + `|${alarm ? alarmBlink(now) : '-'}`;
  if (key !== inspKey) {
    inspKey = key;
    const fr = drawInspection(v, v.continuous ? Math.floor(now) : v.seed);
    renderInspReadout(fr, v);
    if (prac) renderPracRead();
  }
}

function scopeHeader(st = S.insp, fn = S.panel.fn, prac = S.mode === 'practice') {
  const L = UI.inspection;
  const items = [
    [L.gain, `${st.gain_dB.toFixed(1)} ${L.unit_dB}`, fn === 'gain'],
    [L.range, `${st.range_mm} ${L.unit_mm}`, fn === 'range'],
    [L.velocity, `${st.velocity_m_s} ${L.unit_m_s}`, fn === 'velocity'],
  ];
  if (prac) items.push([PANEL.fn.zero, `${st.zero_us.toFixed(2)} ${PRD.unit_us}`, fn === 'zero']);
  return items;
}

function scopeTag(st = S.insp, frozen = S.panel.frozen, prac = S.mode === 'practice') {
  const t = [];
  if (replayOn() && S.replay && !S.replay.version_match) t.push(assessDoc.replay.reference_only);
  if (frozen) t.push(PANEL.messages.frozen);
  if (prac) {
    if (st.peak_memory) t.push(PL.peak);
    if (st.reject_percent > 0) t.push(`${PANEL.fn.reject} ${st.reject_percent}%`);
  }
  return t.length ? t.join(' · ') : null;
}

function scopeLabels() {
  const L = UI.inspection;
  return {
    x: `${L.depth} / ${L.unit_mm}`,
    y: `${L.fsh}`,
    echo: { main_bang: L.echo_labels.main_bang, defect: L.echo_labels.defect, back_wall: L.echo_labels.back_wall },
  };
}

function drawInspection(v = insp.view(S.insp), seed = v.seed) {
  if (!instrument || !wave) return null;
  const fresh = !(S.panel.frozen && frozenFrame);
  const fr = fresh ? wave.synth(S.insp, { columns: 480, noise: true, seed, revealUs: v.revealUs }) : frozenFrame;
  const prac = S.mode === 'practice';
  if (prac && fresh) applyReject(fr);
  lastFrame = fr;
  if (S.panel.frozen && !frozenFrame) frozenFrame = fr;
  if (prac && fresh && S.insp.peak_memory && fr.rect) {
    if (!peakEnv || peakEnv.length !== fr.columns) peakEnv = new Float32Array(fr.columns);
    for (let c = 0; c < fr.shown; c++) peakEnv[c] = Math.max(peakEnv[c], fr.hi[c]);
  }
  const opts = buildScopeOpts(fr, v);
  const menu = softKeys();
  instrument.updateScreen((c) => drawScope(c, fr, { ...opts, menu, width: c.width, height: c.height, dpr: 1, scale: c.width / 320 }));
  const pc = $('inspScope');
  if (pc) {
    const w = pc.clientWidth || 320;
    drawScope(pc, fr, { ...opts, width: w, height: Math.round(w * 0.75), dpr: Math.min(window.devicePixelRatio || 1, 2) });
  }
  return fr;
}

function buildScopeOpts(fr, v = insp.view(S.insp)) {
  const G = PANEL.gate;
  const gate = gateOf();
  const gateRead = gateReading(fr, gate);
  lastGate = gateRead;
  const opts = {
    header: scopeHeader(), labels: scopeLabels(), sweepUs: S.panel.frozen ? null : v.sweepUs,
    gate, gateRead, gateText: { s: G.s, h: G.h, mm: UI.inspection.unit_mm },
    tag: scopeTag(), message: S.panel.msg,
  };
  if (S.mode === 'practice') {
    opts.peak = S.insp.peak_memory ? peakEnv : null;
    opts.dac = S.insp.dac_show && S.prac.done.calibrate ? proc.curve(dacPts(), S.insp.gain_dB) : null;
    opts.dacLabel = PL.dac;
    const d = gateDac(gateRead);
    opts.gateExtra = d == null ? null : `${PRD.f1_dac} ${fmtDb(d)}`;
    if (dacAlarmOn) {
      opts.alarm = PL.dac_alarm;
      opts.colors = { alarm: alarmBlink(performance.now()) ? DAC_ALARM.color : '#7f1d1d' };
    }
  }
  return opts;
}

// Live A-scan of the current page: assembly bench check screen, parameter verification or practice.
function waveSource() {
  if (eqOn() && benchFrame && benchOpts && $('eqScope')) return { fr: benchFrame, opts: benchOpts, ratio: 0.5, tag: eqDoc.assemble };
  if ((S.mode !== 'practice' && S.mode !== 'inspection') || !wave) return null;
  const fr = lastFrame || drawInspection();
  if (!fr) return null;
  if (S.mode === 'inspection') return { fr, opts: buildScopeOpts(fr), ratio: 0.75, tag: INSP_SCENES[S.insp.scene]?.title || UI.inspection.title };
  const step = practiceDoc.steps.find((s) => s.id === S.prac.step)?.name || S.prac.step;
  return { fr, opts: buildScopeOpts(fr), ratio: 0.75, tag: `${specName(S.prac.specimen)}_${step}` };
}

function exportPracticeWave() {
  const src = waveSource();
  if (!src) return null;
  const w = 960;
  const off = document.createElement('canvas');
  drawScope(off, src.fr, { ...src.opts, width: w, height: Math.round(w * src.ratio), dpr: 2, scale: w / 320 });
  const name = `Ascan_${shotName(src.tag)}`;
  const cv = framed(off);
  const a = document.createElement('a');
  a.href = cv.toDataURL('image/png');
  a.download = name;
  a.click();
  return { name, width: cv.width, height: cv.height };
}

function export3d() {
  const name = shotName(UI.controls.shot_3d);
  return savePng(grabGl(renderer, scene, camera, backdropOf(canvas)), name);
}

// Screen / panel poses are authored for the instrument at its system-scene place; on the bench they follow the moved instrument.
const INST_HOME_INV = new THREE.Matrix4();
function equipView(k) {
  if (k === 'probe') return equipment?.focusPose('eq__probe_straight') || scenesDoc.cameras.equipment;
  const v = scenesDoc.cameras[INSP_CAMS[k]];
  if (!v || k === 'system' || !instrument) return scenesDoc.cameras.equipment;
  const m = instrument.place.matrixWorld.clone().multiply(INST_HOME_INV);
  return { target: new THREE.Vector3(...v.target).applyMatrix4(m).toArray(), dir: new THREE.Vector3(...v.dir).transformDirection(m).toArray(), dist: v.dist };
}

function setInspCamera(k) {
  S.inspCam = k;
  if (S.mode === 'inspection') ssMark(`cam:${k}`, 'wave');
  setEqPan(0, { move: false });
  flyTo(viewPose(S.mode === 'practice' ? practiceView(k) : S.mode === 'equipment' ? equipView(k) : scenesDoc.cameras[INSP_CAMS[k]]), 900);
  document.querySelectorAll('.insp-cams button').forEach((b) => b.classList.toggle('active', b.dataset.cam === k));
}

function dimEnvironment(on) {
  const steel = parts['probe__steel_block'];
  if (!steel) return;
  for (const m of steel.meshes) {
    const b = m.userData.base;
    b.envMapIntensity ??= m.material.envMapIntensity ?? 1;
    b.color ??= m.material.color.clone();
    m.material.envMapIntensity = on ? b.envMapIntensity * 0.45 : b.envMapIntensity;
    m.material.color.copy(b.color).multiplyScalar(on ? 0.7 : 1);
  }
}

function renderModes() {
  const nav = $('modes');
  nav.innerHTML = '';
  const top = topModeOf(S.mode);
  for (const [mode, label] of Object.entries(UI.modes)) {
    const page = mode === 'standard';
    const taskTab = mode === 'task';
    const on = page ? S.stdPage : taskTab ? S.taskPage || (!S.stdPage && top === 'task') : !S.stdPage && !S.taskPage && mode === top;
    const b = el('button', on ? 'active' : '', esc(label));
    b.setAttribute('role', 'tab');
    const need = { equipment: 'equipment', principle: 'physics', assessment: 'practice' }[mode] || mode;
    const open = topOpen(mode);
    const exam = mode === 'assessment';
    b.disabled = page
      ? S.exam && !S.taskOn && rubricDoc.teacher_config.exam.standard_page === false
      : taskTab ? !open || replayOn()
        : !STATES[need] || ((mode === 'practice' || exam) && !practice) || (exam && (!STATES.equipment || !assembly)) || !open;
    if (!open) b.title = UI.locked;
    b.onclick = page
      ? () => openStdPage()
      : taskTab ? () => openTaskPage()
      : () => {
        closeStdPage();
        closeTaskPage();
        if (exam) return openExam();
        const wasExam = S.exam;
        if (wasExam) swapContext(false);
        const prevMode = S.mode;
        if (mode === 'equipment') setMode(S.eqMode || 'equipment');
        else if (mode === 'principle') setMode(S.prMode || 'physics');
        else setMode(mode);
        if (wasExam && S.mode === prevMode) { renderModes(); renderPanel(); }
      };
    nav.appendChild(b);
  }
  const eq = $('eqview');
  eq.innerHTML = '';
  eq.hidden = S.stdPage || S.taskPage || (top !== 'equipment' && top !== 'principle');
  const views = top === 'principle' ? UI.principle_views : UI.equipment_views;
  for (const [view, label] of Object.entries(views)) {
    const b = el('button', subOn(view) ? 'active' : '', esc(label));
    b.setAttribute('role', 'tab');
    b.onclick = () => openSub(view);
    eq.appendChild(b);
  }
  const sub = $('sview');
  sub.innerHTML = '';
  sub.hidden = S.stdPage || S.taskPage || (S.mode !== 'exterior' && S.mode !== 'structure');
  for (const [view, label] of Object.entries(UI.probe_views)) {
    const on = view === 'exterior' ? S.mode === 'exterior' : S.mode === 'structure' && S.sview === view;
    const b = el('button', on ? 'active' : '', esc(label));
    b.setAttribute('role', 'tab');
    b.onclick = () => (view === 'exterior' ? setMode('exterior') : setMode('structure', { view }));
    sub.appendChild(b);
  }
}

function subOn(view) {
  if (view === 'equipment') return S.mode === 'equipment';
  if (view === 'probe') return S.mode === 'exterior' || S.mode === 'structure';
  if (view === 'lab') return S.mode === 'lab';
  return S.mode === 'physics' && S.prView === view;
}

function openSub(view) {
  if (view === 'equipment' || view === 'lab') return setMode(view);
  if (view === 'probe') return S.mode === 'exterior' || S.mode === 'structure' ? null : setMode('exterior');
  S.prView = view;
  if (S.mode !== 'physics') return setMode('physics');
  if (S.scene) return sceneHome();
  renderModes();
  renderPanel();
}

function principleOpen() {
  return topOpen('principle') && !!STATES.physics;
}

// ------------------------------------------------------------------ scenes
let physics = null;
let lastPhase = 0;
let sceneLoops = 0;
const LOOPS_PER_STEP = 2;
const BACKING_ID = 'probe__backing';
const COUPLANT_ID = 'probe__couplant';
const ELEC = new THREE.Color(UI.chains.electrical.color);

const curStep = () => (S.scene ? SCENES[S.scene].steps[S.sceneStep] : null);
const beamOn = () => S.beam && (!S.scene || !!curStep().beam);

function applySceneState(st) {
  const want = new Set();
  if (st && st.backing === false) want.add(BACKING_ID);
  if (st && st.remove) want.add(st.remove);
  let changed = false;
  for (const pid of new Set([...S.ghost, ...want])) {
    const on = want.has(pid);
    if (S.ghost.has(pid) === on) continue;
    if (on) S.ghost.add(pid);
    else S.ghost.delete(pid);
    changed = true;
    emit('removal:simulate', { part_id: pid, enabled: on });
  }
  if (changed) refreshMaterials(true);
  const medium = (st && st.medium) || 'couplant';
  const air = medium === 'air';
  if (S.hidden.has(COUPLANT_ID) !== air) {
    if (air) S.hidden.add(COUPLANT_ID);
    else S.hidden.delete(COUPLANT_ID);
    updateVisibility();
    emit('couplant:medium', { medium });
  }
  S.warn = (st && st.warn) || [];
  if (!(st && st.wobble) && S.wobble) {
    S.wobble = 0;
    applyLayout();
  }
}

function startScene(id, step = 0, view = null) {
  if (!S.scene) S.mlBefore = S.ml;
  S.scene = id;
  S.prView = view || (SCENES[id].kind === 'removal' ? 'parts' : 'scenes');
  S.playing = S.study !== 'classroom';
  if (S.selected) {
    S.selected = null;
    S.isolated = null;
    updateVisibility();
    refreshMaterials(true);
    syncControls();
  }
  if (S.mode !== 'physics') setMode('physics', { keepCamera: true });
  else renderModes();
  setSceneStep(step);
}

function setSceneStep(i, { fly = true } = {}) {
  const sc = SCENES[S.scene];
  S.sceneStep = Math.max(0, Math.min(sc.steps.length - 1, i));
  const st = curStep();
  if ('ml' in st && st.ml !== S.ml) setMatchingLayer(st.ml);
  physics.configure({
    anim: st.anim, reverse: !!st.reverse, beam: beamOn(), backing: st.backing !== false,
    medium: st.medium || 'couplant', stopAfter: st.stop_after ?? 6,
  });
  physics.setActive(true);
  applySceneState(st);
  sceneLoops = 0;
  lastPhase = 0;
  if (fly) flyTo(viewPose(scenesDoc.cameras[st.camera]), 1000);
  renderPanel();
  renderStage();
  renderLegend();
  updateBadges();
  syncControls();
  lastLabelKey = '';
  anchorsDirty = true;
  emit('scene:step', { scene_id: S.scene, step: S.sceneStep });
}

function stopScene() {
  S.scene = null;
  S.playing = false;
  applySceneState(null);
  if (S.ml !== S.mlBefore) setMatchingLayer(S.mlBefore);
  physics.setActive(false);
  S.strain = 0;
  applyLayout();
  refreshMaterials(false);
  renderStage();
  updateBadges();
  syncControls();
}

function sceneHome() {
  stopScene();
  physics.configure({ anim: 'idle', reverse: false, beam: beamOn(), backing: true, medium: 'couplant', stopAfter: 6 });
  physics.setActive(true);
  flyTo(viewPose(VIEWS.physics), 1000);
  renderModes();
  renderPanel();
  renderLegend();
  updateBadges();
  lastLabelKey = '';
  anchorsDirty = true;
  emit('scene:step', { scene_id: null, step: 0 });
}

function setPlaying(on) {
  S.playing = on;
  if (on && S.sceneStep === SCENES[S.scene].steps.length - 1 && sceneLoops >= LOOPS_PER_STEP) setSceneStep(0);
  else renderPanel();
}

const WARN = new THREE.Color('#dc2626');
const GLOW_COLOR = {};
for (const [, ch] of Object.entries(UI.chains)) for (const id of ch.ids) GLOW_COLOR[id] = new THREE.Color(ch.color);
const GLOW_IDS = [...new Set([...UI.chains.electrical.ids, ML_ID, ...scenesDoc.scenes.flatMap((s) => s.steps.flatMap((st) => st.warn || []))])];

function tickPhysics(now) {
  if (!physics || !physics.state.active) return;
  const r = physics.update(now);
  const warnK = 0.35 + 0.35 * Math.sin(now / 160);
  const extra = inspOn() ? inspGlow : {};
  for (const pid of inspOn() ? INSP_GLOW_IDS : GLOW_IDS) {
    const p = parts[pid];
    if (!p || pid === S.selected || pid === S.hovered) continue;
    const warn = S.warn.includes(pid);
    const k = warn ? warnK : Math.max(r.glow[pid] || 0, extra[pid] || 0);
    for (const m of p.meshes) {
      const b = m.userData.base;
      if (k > 0.01) {
        m.material.emissive.copy(warn ? WARN : GLOW_COLOR[pid] || ELEC);
        m.material.emissiveIntensity = 1.2 * k;
      } else {
        m.material.emissive.copy(b.emissive);
        m.material.emissiveIntensity = b.emissiveIntensity;
      }
    }
  }
  S.strain = r.strain || 0;
  S.wobble = curStep()?.wobble ? 0.0007 * Math.sin(now / 90) * Math.sin(now / 410) : 0;
  applyLayout();
  if (qwCanvas) drawQuarterWave(qwCanvas, qwOpts(now));
  if (r.phase < lastPhase) {
    sceneLoops += 1;
    if (S.scene && S.playing && sceneLoops >= LOOPS_PER_STEP) {
      if (S.sceneStep < SCENES[S.scene].steps.length - 1) setSceneStep(S.sceneStep + 1);
      else { S.playing = false; renderPanel(); }
    }
  }
  lastPhase = r.phase ?? 0;
}

const markersBox = $('markers');
const markerEls = {};
const breakMarker = { key: 'break', pos: new THREE.Vector3(), text: '✕' };
function updateMarkers() {
  const list = physics ? [...physics.visibleMarkers()] : [];
  const st = curStep();
  if (S.mode === 'physics' && st && st.remove && (st.stop_after ?? 6) < 6) {
    tmpBox.setFromObject(parts[st.remove].obj);
    tmpBox.getCenter(breakMarker.pos);
    breakMarker.pos.x = Math.max(breakMarker.pos.x, 0);
    list.push(breakMarker);
  }
  const keys = new Set(list.map((m) => m.key));
  for (const [k, n] of Object.entries(markerEls)) n.hidden = !keys.has(k);
  const W = viewport.clientWidth;
  const H = viewport.clientHeight;
  for (const m of list) {
    const n = markerEls[m.key] ||= markersBox.appendChild(el('div', `marker m-${m.key}`, esc(m.text)));
    if (n.textContent !== m.text) n.textContent = m.text;
    tmpV.copy(m.pos).project(camera);
    n.hidden = tmpV.z > 1 || Math.abs(tmpV.x) > 0.9 || Math.abs(tmpV.y) > 0.9;
    n.style.left = `${(tmpV.x * 0.5 + 0.5) * W}px`;
    n.style.top = `${(-tmpV.y * 0.5 + 0.5) * H}px`;
  }
}

function renderLegend() {
  const box = $('chainlegend');
  box.hidden = S.mode !== 'physics' && S.mode !== 'lab';
  if (box.hidden) return;
  const focus = S.mode === 'lab' ? 'propagation' : curStep()?.chain_focus;
  box.innerHTML = Object.entries(UI.chains).map(([k, ch]) => `<div class="lg${focus && focus !== k ? ' dim' : ''}${focus === k ? ' on' : ''}" style="--chain:${ch.color}"><i></i>${esc(ch.name)}</div>`).join('');
}

const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
function sci(x) {
  if (x >= 0.1 && x < 100) return x.toFixed(1);
  const e = Math.floor(Math.log10(x));
  return `${(x / 10 ** e).toFixed(1)}×10${String(e).split('').map((c) => SUP[c]).join('')}`;
}

function impedanceTable() {
  const ref = manifest.reference_physics;
  const imp = scenesDoc.teaching_settings.impedance;
  const Zs = ref.steel_rho_kg_m3 * ref.steel_cL_m_s;
  const Za = imp.Z_air_Pa_s_m;
  const Zw = imp.Z_solid_min_Pa_s_m;
  const tp = (z1, z2) => (2 * z2) / (z1 + z2);
  const ti = (z1, z2) => (4 * z1 * z2) / (z1 + z2) ** 2;
  const L = UI.scene_labels;
  const rows = [
    { from: KB['probe__wear_face'].name_zh, to: L.air, z1: `≥ ${sci(Zw)}`, z2: sci(Za), tp: `≤ ${sci(tp(Zw, Za))}`, ti: `≤ ${sci(ti(Zw, Za))}` },
    { from: L.air, to: KB['probe__steel_block'].name_zh, z1: sci(Za), z2: sci(Zs), tp: `≈ ${sci(tp(Za, Zs))}`, ti: `≈ ${sci(ti(Za, Zs))}` },
  ];
  const f = KB[COUPLANT_ID].formulas[1];
  return `<table class="imp">
    <thead><tr><th>${esc(L.interface)}</th><th>Z₁ → Z₂ <small>Pa·s/m</small></th><th>${esc(L.pressure_t)} <small>t<sub>p</sub></small></th><th>${esc(L.intensity_t)} <small>T<sub>I</sub></small></th></tr></thead>
    <tbody>${rows.map((r, i) => `<tr><td><span class="ino">${i + 1}</span>${esc(r.from)} → ${esc(r.to)}</td><td class="num">${r.z1} → ${r.z2}</td><td class="num">${r.tp}</td><td class="num hl">${r.ti}</td></tr>`).join('')}</tbody>
  </table>
  <div class="imp-foot">${katex.renderToString(f.latex, { throwOnError: false })}<span>${richText(f.conditions)}</span></div>`;
}

const stageCard = $('stagecard');
let qwCanvas = null;
const qwOpts = (now) => ({
  cycles: scenesDoc.teaching_settings.quarter_wave.cycles_shown,
  phase: ((now / 1000) * 0.6) % 1,
  colors: { r1: UI.chains.acoustic.color, r2: '#b42318', sum: '#0f172a' },
  text: { r1: UI.scene_labels.reflect_1, r2: UI.scene_labels.reflect_2, sum: UI.scene_labels.sum, delta: UI.scene_labels.qw_delta },
  laneH: S.study === 'classroom' ? 66 : 56,
});
function renderStage() {
  const st = S.mode === 'physics' ? curStep() : null;
  stageCard.innerHTML = '';
  stageCard.className = '';
  qwCanvas = null;
  if (!st || (!st.ascan && !st.impedance_table && !st.quarter_wave)) { stageCard.hidden = true; return; }
  stageCard.hidden = false;
  const L = UI.scene_labels;
  if (st.quarter_wave) {
    stageCard.classList.add('sc-ascan', 'sc-qw');
    stageCard.appendChild(el('div', 'sc-title', `<i></i>${esc(L.quarter_wave)}`));
    qwCanvas = el('canvas', 'ascan');
    stageCard.appendChild(qwCanvas);
    drawQuarterWave(qwCanvas, qwOpts(performance.now()));
  } else if (st.ascan) {
    stageCard.classList.add('sc-ascan');
    stageCard.appendChild(el('div', 'sc-title', `<i></i>${esc(L.ascan)}`));
    const cnv = el('canvas', 'ascan');
    stageCard.appendChild(cnv);
    const as = scenesDoc.teaching_settings.ascan;
    const ref = manifest.reference_physics;
    const TR = {
      with: { label: L.with_backing, cycles: as.cycles_with_backing, color: UI.chains.acoustic.color },
      without: { label: L.without_backing, cycles: as.cycles_without_backing, color: '#b42318' },
    };
    drawAscan(cnv, {
      traces: st.ascan.map((k) => TR[k]),
      f0: ref.f0_MHz,
      c: ref.steel_cL_m_s / 1000,
      depths: as.reflector_depths_mm,
      window: as.window_us,
      marks: !!st.ascan_marks,
      text: { main_bang: L.main_bang },
      laneH: S.study === 'classroom' ? 100 : 88,
    });
  } else {
    stageCard.classList.add('sc-imp');
    stageCard.appendChild(el('div', 'sc-title', `<i></i>${esc(L.interface)}`));
    stageCard.appendChild(el('div', 'sc-body', impedanceTable()));
  }
}

// ------------------------------------------------------------------ variants
function setMatchingLayer(on) {
  if (S.ml === on) return Promise.resolve(true);
  S.ml = on;
  syncControls();
  if (!S.selected && S.mode !== 'physics') renderPanel();
  emit('variant:matching_layer', { enabled: on });
  const step = (k) => {
    const was = S.mlK > 0.001;
    S.mlK = k;
    applyLayout();
    if (was !== S.mlK > 0.001) {
      updateVisibility();
      updateBadges();
    }
  };
  return tween('ml', S.mlK, on ? 1 : 0, 700, step).then((done) => {
    updateVisibility();
    updateBadges();
    anchorsDirty = true;
    lastLabelKey = '';
    return done;
  });
}

const MAG_VIEWS = ['cutaway', 'exploded', 'physics', 'lab'];
function setMagnify(f, { silent = false } = {}) {
  S.mag = Math.max(1, Math.min(10, f));
  applyLayout();
  anchorsDirty = true;
  syncControls();
  if (!silent) emit('view:thin_layer_magnify', { factor: S.mag });
}

// ------------------------------------------------------------------ controls bar
const ctl = {};
function buildControls() {
  const bar = $('controls');
  const btn = (keyName, onClick) => {
    const b = el('button', '', esc(UI.controls[keyName]));
    b.onclick = onClick;
    bar.appendChild(b);
    ctl[keyName] = b;
    return b;
  };
  const sep = () => bar.appendChild(el('div', 'sep'));

  // Kept for event-contract wiring; not shown on the bottom bar.
  btn('reset_camera', () => {
    S.isolated = null;
    S.xray = false;
    updateVisibility();
    refreshMaterials(true);
    syncControls();
    setEqPan(0, { move: false });
    flyTo(viewPose(currentView()));
    emit('view:reset');
  });
  ctl.reset_camera.hidden = true;
  btn('isolate', () => {
    if (!S.selected) return;
    S.isolated = S.isolated ? null : S.selected;
    updateVisibility();
    syncControls();
    if (S.isolated) focusPart(S.isolated);
    else flyTo(viewPose(currentView()));
    emit('part:isolate', { part_id: S.isolated });
  });
  btn('xray', () => {
    S.xray = !S.xray;
    refreshMaterials(true);
    syncControls();
    anchorsDirty = true;
    emit('view:xray', { enabled: S.xray });
  });
  btn('labels', () => {
    S.labels = !S.labels;
    document.body.classList.toggle('show-labels', !!S.labels);
    syncControls();
    anchorsDirty = true;
    emit('view:labels', { enabled: S.labels });
  });
  ctl.labels.hidden = true;
  sep();
  btn('explode', () => setMode('structure', { view: 'exploded' }));
  btn('assemble', () => setMode('exterior'));
  btn('export_image', () => export3d());
  const slider = el('input');
  slider.type = 'range';
  slider.min = '0';
  slider.max = '1';
  slider.step = '0.01';
  slider.oninput = () => {
    const prev = tweens.get('explode');
    if (prev) { tweens.delete('explode'); prev.resolve(false); }
    const f = parseFloat(slider.value);
    applyExplode(f);
    emit('view:explode', { factor: f, animate: false });
  };
  bar.appendChild(slider);
  ctl.slider = slider;
  sep();
  btn('beam', () => {
    S.beam = !S.beam;
    physics.configure({ beam: beamOn() });
    lastPhase = 0;
    syncControls();
    updateBadges();
    emit('view:beam', { enabled: S.beam });
  });
  sep();
  btn('matching_layer', () => setMatchingLayer(!S.ml));
  const mag = el('label', 'mag');
  mag.appendChild(el('span', 'mag-name', esc(UI.controls.magnify)));
  const magIn = el('input');
  magIn.type = 'range';
  magIn.min = '1';
  magIn.max = '10';
  magIn.step = '0.5';
  magIn.value = '1';
  magIn.oninput = () => setMagnify(parseFloat(magIn.value));
  mag.appendChild(magIn);
  const magVal = el('span', 'mag-val');
  mag.appendChild(magVal);
  bar.appendChild(mag);
  ctl.mag = magIn;
  ctl.magVal = magVal;
}

function currentView() {
  if (S.mode === 'physics' && S.scene) {
    return scenesDoc.cameras[SCENES[S.scene].steps[S.sceneStep].camera];
  }
  if (S.mode === 'inspection') return scenesDoc.cameras[INSP_CAMS[S.inspCam]];
  if (S.mode === 'practice' && practice) return practiceView(S.inspCam);
  return VIEWS[stateKey()];
}

function syncControls() {
  if (!ctl.isolate) return;
  const probeTools = ['exterior', 'structure', 'physics', 'lab'].includes(S.mode) && !S.stdPage && !S.taskPage;
  ctl.explode.hidden = !probeTools;
  ctl.assemble.hidden = !probeTools;
  ctl.isolate.disabled = !S.selected || isSystemPart(S.selected);
  ctl.isolate.classList.toggle('on', !!S.isolated);
  ctl.xray.classList.toggle('on', S.xray);
  ctl.explode.classList.toggle('on', stateKey() === 'exploded');
  ctl.slider.disabled = stateKey() !== 'exploded';
  ctl.slider.value = String(S.explode);
  ctl.beam.disabled = S.mode !== 'physics' && S.mode !== 'lab';
  ctl.beam.classList.toggle('on', (S.mode === 'physics' || S.mode === 'lab') && S.beam);
  ctl.matching_layer.disabled = S.mode === 'exterior' || S.mode === 'lab' || sysMode() || !!(S.scene && 'ml' in curStep());
  ctl.matching_layer.classList.toggle('on', S.ml);
  ctl.mag.disabled = !MAG_VIEWS.includes(stateKey());
  ctl.mag.value = String(S.mag);
  ctl.magVal.textContent = `×${S.mag % 1 ? S.mag.toFixed(1) : S.mag}`;
}

// ------------------------------------------------------------------ badges
// Teaching-boundary badges (thin layer magnified, amplitude exaggerated, schematic, amplitude model…) stay registered in
// the contract but are not shown on screen; only badges that carry knowledge or a live state are displayed.
function badgeActive(badge) {
  switch (badge) {
    case 'near_surface_masking':
      return S.ghost.has(BACKING_ID);
    case 'slow_motion':
      return S.mode === 'inspection' && inspOn() && !!insp && insp.st.running;
    default:
      return false;
  }
}
function updateBadges() {
  badgesBox.innerHTML = '';
  for (const rule of contract.badge_rules) {
    if (!badgeActive(rule.badge)) continue;
    let text = UI.badges[rule.badge] ?? UI.inspection[rule.badge];
    if (rule.badge === 'slow_motion') text += ` ×${sci(insp.view(S.insp).slowFactor)}`;
    badgesBox.appendChild(el('div', 'badge', esc(text)));
  }
}

// ------------------------------------------------------------------ knowledge panel
// Truth-level annotations (UNKNOWN / VENDOR-DEPENDENT, "teaching reference" suffixes, the matching-layer variant tag)
// stay in the knowledge data for QA; cards show the facts only.
const VENDOR_RE = /UNKNOWN|VENDOR-DEPENDENT/;
const TEACH_SUFFIX_RE = /：[^：]*\u6559\u5b66[^：]*$/;
const VARIANT_TAG = '\u2014\u2014\u6559\u5b66\u7ed3\u6784\u53d8\u4f53';
function shownNote(t) {
  if (typeof t !== 'string') return t;
  let s = t.replace(/（[^（）]*VENDOR-DEPENDENT[^（）]*）/g, '').split('；')
    .filter((seg) => !seg.includes('UNKNOWN')).map((seg) => seg.replace(/：VENDOR-DEPENDENT$/, '')).join('；');
  if (!s || VENDOR_RE.test(s)) return null;
  if (TEACH_SUFFIX_RE.test(s)) {
    s = s.replace(TEACH_SUFFIX_RE, '');
    if (!/\d/.test(s)) return null;
  }
  if (s.includes(VARIANT_TAG)) return null;
  return s.trim() || null;
}
const shownNotes = (items) => (items || []).map(shownNote).filter(Boolean);
const shownText = (t) => String(t ?? '').split(VARIANT_TAG).join('');

function list(raw, ordered = false) {
  const items = shownNotes(raw);
  if (!items.length) return `<p class="empty">${esc(UI.card_labels.none)}</p>`;
  const tag = ordered ? 'ol' : 'ul';
  return `<${tag}>${items.map((t) => `<li>${richText(t)}</li>`).join('')}</${tag}>`;
}

const empty = () => `<p class="empty">${esc(UI.card_labels.none)}</p>`;
const section = (title, body, extra = '') => `<section class="sec"><h3><i></i>${esc(title)}${extra}</h3>${body}</section>`;

function titled(t) {
  const m = /^([^：]{2,10})：(.+)$/.exec(t);
  return m ? `<b>${richText(m[1])}</b><span>${richText(m[2])}</span>` : `<span>${richText(t)}</span>`;
}

function tiles(raw, kind) {
  const items = shownNotes(raw);
  if (!items.length) return empty();
  return `<div class="tiles ${kind}">${items.map((t, i) => `<div class="tile"><span class="ti">${String(i + 1).padStart(2, '0')}</span><div class="tt">${titled(t)}</div></div>`).join('')}</div>`;
}

function tabBody(kb, tab) {
  const L = UI.card_labels;
  switch (tab) {
    case 'definition':
      return `<div class="lead">${richText(shownText(kb.definition))}</div>
        ${section(L.functions, tiles(kb.functions, 'fn'))}
        ${section(L.structure_notes, list(kb.structure_notes).replace('<ul>', '<ul class="notes">'))}`;
    case 'design_driver':
      return `<div class="driver"><span class="qm">“</span>${richText(kb.design_driver)}</div>`;
    case 'principles':
      if (!kb.principles.length) return empty();
      return `<ol class="steps">${kb.principles.map((t) => `<li><div class="st">${titled(t)}</div></li>`).join('')}</ol>`;
    case 'performance_impacts':
      return tiles(kb.performance_impacts, 'impact');
    case 'removal_effects':
      return tiles(kb.removal_effects, 'removal');
    case 'formulas':
      if (!kb.formulas.length) return empty();
      return kb.formulas.map((f) => `<div class="formula">
          <div class="fname">${esc(f.name)}</div>
          <div class="tex">${katex.renderToString(f.latex, { displayMode: true, throwOnError: false })}</div>
          <div class="frow meaning"><b>${esc(L.meaning)}</b><span>${richText(f.meaning)}</span></div>
          <div class="frow cond"><b>${esc(L.conditions)}</b><span>${richText(f.conditions)}</span></div>
        </div>`).join('');
    case 'misconceptions':
      if (!kb.misconceptions.length) return empty();
      return kb.misconceptions.map((m) => `<div class="mis">
          <div class="w"><b><span class="mk">✗</span>${esc(L.wrong)}</b><p>${richText(m.wrong)}</p></div>
          <div class="c"><b><span class="mk">✓</span>${esc(L.correct)}</b><p>${richText(m.correct)}</p></div>
        </div>`).join('');
    default:
      return '';
  }
}

function partIndex(pid) {
  const shown = partsDoc.parts.filter((kb) => parts[kb.id] && (parts[kb.id].ud.default_visible || (kb.id === ML_ID && S.ml))).map((kb) => kb.id);
  const i = shown.indexOf(pid);
  const pad = (n) => String(n).padStart(2, '0');
  return i < 0 ? '' : `${pad(i + 1)} / ${pad(shown.length)}`;
}

function renderSceneHome() {
  const partsView = S.prView === 'parts';
  const rows = partsView
    ? partsDoc.parts.filter((kb) => REMOVAL_BY_PART[kb.id] && parts[kb.id]).map((kb) => {
      const [sid, i] = REMOVAL_BY_PART[kb.id];
      const sc = SCENES[sid];
      return {
        pid: kb.id, title: sc.kind === 'removal' ? sc.title : sc.steps[i].title,
        steps: sc.kind === 'removal' ? sc.steps.length : 1, go: () => startScene(sid, i, 'parts'),
      };
    })
    : MAIN_SCENES.map((sc) => ({ pid: sc.part_id, title: sc.title, steps: sc.steps.length, go: () => startScene(sc.id, 0, 'scenes') }));
  const home = el('div', `home scenes-home${partsView ? ' parts-home' : ''}`);
  home.appendChild(el('div', 'hero home-hero phys-hero', `<h2>${esc(UI.principle_views[S.prView])}</h2><span class="count">${rows.length}</span>`));
  const ul = el('ul', `scene-list${partsView ? ' rm-list' : ''}`);
  rows.forEach((r, i) => {
    const color = UI.chains[CHAIN_OF[r.pid]]?.color || '#64748b';
    const li = el('li');
    const head = partsView ? `<span class="sn">${esc(KB[r.pid].name_zh)}</span><span class="sp"><i style="background:${color}"></i>${esc(r.title)}</span>`
      : `<span class="sn">${esc(r.title)}</span><span class="sp"><i style="background:${color}"></i>${esc(KB[r.pid].name_zh)}</span>`;
    const b = el('button', '', `<span class="si">${String(i + 1).padStart(2, '0')}</span>
      <span class="sb">${head}</span>
      <span class="ss">${'<i></i>'.repeat(r.steps)}</span><span class="go">▶</span>`);
    b.style.setProperty('--chain', color);
    b.onclick = r.go;
    li.appendChild(b);
    ul.appendChild(li);
  });
  home.appendChild(ul);
  const lg = el('div', 'chain-card');
  lg.appendChild(el('div', 'cc-title', esc(UI.scene_labels.chains)));
  for (const [, ch] of Object.entries(UI.chains)) {
    const names = ch.ids.filter((id) => parts[id] && parts[id].ud.default_visible).map((id) => esc(KB[id].name_zh));
    lg.appendChild(el('div', 'cc-row', `<span class="cc-name" style="--chain:${ch.color}"><i></i>${esc(ch.name)}</span><span class="cc-parts">${names.join('<em>›</em>')}</span>`));
  }
  home.appendChild(lg);
  panel.appendChild(home);
}

function formulaBlock(f, compact = false) {
  const L = UI.card_labels;
  return `<div class="formula${compact ? ' compact' : ''}">
      <div class="fname">${esc(f.name)}</div>
      <div class="tex">${katex.renderToString(f.latex, { displayMode: true, throwOnError: false })}</div>
      <div class="frow meaning"><b>${esc(L.meaning)}</b><span>${richText(f.meaning)}</span></div>
      ${compact ? '' : `<div class="frow cond"><b>${esc(L.conditions)}</b><span>${richText(f.conditions)}</span></div>`}
    </div>`;
}

function renderScenePanel() {
  const sc = SCENES[S.scene];
  const removal = sc.kind === 'removal';
  const group = removal ? REMOVAL_SCENES : MAIN_SCENES;
  const idx = group.indexOf(sc);
  const P = UI.player;
  const pad = (n) => String(n).padStart(2, '0');
  const head = el('div', `hero scene-hero${removal ? ' removal-hero' : ''}`);
  head.style.setProperty('--chain', UI.chains[CHAIN_OF[sc.part_id]]?.color || '#64748b');
  const pill = removal ? `<span class="rm-pill"><span class="ic">−</span>${esc(UI.why_buttons.remove)}</span>` : '';
  const top = el('div', 'hero-top', `<span class="idx">${pad(idx + 1)} / ${pad(group.length)}</span>${pill}`);
  const back = el('button', 'card-close', '×');
  back.title = P.back;
  back.onclick = () => sceneHome();
  top.appendChild(back);
  head.appendChild(top);
  head.appendChild(el('h2', '', esc(sc.title)));
  const partBtn = el('button', 'en scene-part', esc(KB[sc.part_id].name_zh));
  partBtn.onclick = () => { S.selected = null; select(sc.part_id); };
  head.appendChild(partBtn);
  panel.appendChild(head);

  const last = sc.steps.length - 1;
  const bar = el('div', 'player');
  const pbtn = (cls, icon, label, fn, dis = false) => {
    const b = el('button', cls, `<span class="pic">${icon}</span><span class="plb">${esc(label)}</span>`);
    b.disabled = dis;
    b.onclick = fn;
    bar.appendChild(b);
  };
  pbtn('prev', '‹', P.prev, () => setSceneStep(S.sceneStep - 1), S.sceneStep === 0);
  pbtn(`play${S.playing ? ' on' : ''}`, S.playing ? '❚❚' : '▶', S.playing ? P.pause : P.play, () => setPlaying(!S.playing));
  pbtn('next', '›', P.next, () => setSceneStep(S.sceneStep + 1), S.sceneStep === last);
  pbtn('replay', '↻', P.replay, () => setSceneStep(S.sceneStep, { fly: false }));
  panel.appendChild(bar);

  const prog = el('div', 'sprog', sc.steps.map((_, i) => `<i class="${i < S.sceneStep ? 'done' : i === S.sceneStep ? 'cur' : ''}"></i>`).join(''));
  panel.appendChild(prog);

  const ol = el('ol', 'scene-steps');
  sc.steps.forEach((st, i) => {
    const cur = i === S.sceneStep;
    const li = el('li', `${cur ? 'cur' : i < S.sceneStep ? 'done' : ''} ch-${st.chain_focus || ''}`);
    li.style.setProperty('--chain', UI.chains[st.chain_focus]?.color || '#64748b');
    const h = el('button', 'sh', `<span class="sno">${i + 1}</span><span class="stl">${esc(st.title)}</span>`);
    h.onclick = () => setSceneStep(i);
    li.appendChild(h);
    if (cur) {
      const body = el('div', 'sbody');
      body.innerHTML = `<ul class="caps">${st.refs.map((r) => `<li>${titled(resolveRef(r))}</li>`).join('')}</ul>`
        + (st.formulas || []).map((r) => formulaBlock(resolveRef(r), S.study === 'classroom')).join('');
      const chain = resolveChain(st.chain);
      if (chain.length) {
        body.innerHTML += `<div class="kchain"><div class="kc-t">${esc(UI.scene_labels.chain)}</div><div class="chips">${chain.map((c) => `<span>${esc(c)}</span>`).join('<em>›</em>')}</div></div>`;
      }
      li.appendChild(body);
    }
    ol.appendChild(li);
  });
  panel.appendChild(ol);
  requestAnimationFrame(() => ol.querySelector('li.cur')?.scrollIntoView({ block: 'nearest' }));
}

function renderLabPanel() {
  const L = UI.lab;
  const d = labDerived();
  const home = el('div', 'home lab-home');
  home.appendChild(el('div', 'hero home-hero lab-hero', `<h2>${esc(L.title)}</h2>`));

  const ctrls = el('div', 'lab-ctrls');
  const mkRange = (key, name, min, max, step, val, unit, onInput) => {
    const row = el('div', 'lab-row');
    row.appendChild(el('div', 'lab-name', esc(name)));
    const input = el('input');
    input.type = 'range';
    input.dataset.lab = key;
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(val);
    const out = el('span', 'lab-val', `${val % 1 && step < 1 ? val.toFixed(1) : val} ${esc(unit)}`);
    input.oninput = () => {
      const v = parseFloat(input.value);
      out.textContent = `${v % 1 && step < 1 ? v.toFixed(1) : v} ${unit}`;
      onInput(v);
    };
    row.append(input, out);
    return row;
  };
  ctrls.appendChild(mkRange('f', L.frequency, LAB.f_min_MHz, LAB.f_max_MHz, 0.1, S.labF, L.unit_MHz, setLabFrequency));
  ctrls.appendChild(mkRange('D', L.diameter, LAB.D_min_mm, LAB.D_max_mm, 0.5, S.labD, L.unit_mm, setLabDiameter));

  const damp = el('div', 'lab-row damp');
  damp.appendChild(el('div', 'lab-name', esc(L.damping)));
  const group = el('div', 'lab-damp');
  for (const [k, name] of Object.entries(L.damping_levels)) {
    const b = el('button', k === S.labDamp ? 'on' : '', esc(name));
    b.dataset.level = k;
    b.onclick = () => setLabDamping(k);
    group.appendChild(b);
  }
  damp.appendChild(group);
  ctrls.appendChild(damp);

  const reset = el('button', 'lab-reset', esc(L.reset));
  reset.onclick = () => resetLab();
  ctrls.appendChild(reset);
  home.appendChild(ctrls);

  const derived = el('div', 'lab-derived');
  derived.appendChild(el('div', 'cc-title', esc(L.derived)));
  const fmt = (x, n = 2) => (Math.abs(x) >= 100 ? x.toFixed(1) : x.toFixed(n));
  const rows = [
    [L.lambda, `${fmt(d.lambda_mm)} ${L.unit_mm}`],
    [L.near_field, `${fmt(d.N_mm, 1)} ${L.unit_mm}`],
    [L.half_angle, `${fmt(d.half_angle_deg, 1)}${L.unit_deg}`],
    [L.thickness, `${fmt(d.t_mm)} ${L.unit_mm}`],
  ];
  for (const [name, val] of rows) {
    derived.appendChild(el('div', 'lab-kv', `<span>${esc(name)}</span><b>${esc(val)}</b>`));
  }
  home.appendChild(derived);

  const ascanBox = el('div', 'lab-ascan');
  ascanBox.appendChild(el('div', 'cc-title', esc(L.ascan)));
  ascanBox.appendChild(el('canvas', 'ascan'));
  home.appendChild(ascanBox);

  const forms = el('div', 'lab-forms');
  for (const ref of LAB.formulas) {
    forms.innerHTML += formulaBlock(resolveRef(ref), S.study === 'classroom');
  }
  home.appendChild(forms);
  panel.appendChild(home);
  requestAnimationFrame(drawLabAscan);
}

function renderInspectionPanel() {
  const L = UI.inspection;
  const sc = INSP_SCENES[S.insp.scene];
  if (ssEquip()) { renderSsWave(sc); return; }
  const home = el('div', 'home insp-home');
  home.appendChild(el('div', 'hero home-hero insp-hero', `<h2>${esc(L.title)}</h2>`));
  const exp = el('div', 'insp-exp');
  exp.id = 'inspExp';
  home.appendChild(exp);
  const extra = el('details', 'workflow-advanced');
  extra.appendChild(el('summary', '', esc(WF.inspection_more)));
  const extraBody = el('div', 'workflow-advanced-body');
  extra.appendChild(extraBody);

  const scenes = el('div', 'insp-scenes');
  for (const s of inspDoc.scenarios) {
    const b = el('button', s.id === sc.id ? 'on' : '', esc(s.title));
    b.dataset.scene = s.id;
    b.onclick = () => setInspScene(s.id);
    scenes.appendChild(b);
  }
  extraBody.appendChild(scenes);

  const cams = el('div', 'insp-cams');
  for (const [k, name] of Object.entries(L.cameras)) {
    const b = el('button', k === S.inspCam ? 'active' : '', esc(name));
    b.dataset.cam = k;
    b.onclick = () => setInspCamera(k);
    cams.appendChild(b);
  }
  home.appendChild(cams);

  const ops = el('div', 'insp-ops');
  const op = (id, label, fn, cls = '') => {
    const b = el('button', cls, esc(label));
    b.id = id;
    b.onclick = fn;
    ops.appendChild(b);
  };
  op('inspPulse', L.pulse, () => inspPulse(), 'primary');
  op('inspCont', L.continuous, () => inspContinuous());
  op('inspPause', L.pause, () => inspPause());
  op('inspReset', L.reset, () => inspReset());
  home.appendChild(ops);

  const scope = el('div', 'insp-scope');
  const ititle = el('div', 'cc-title');
  ititle.appendChild(el('span', '', `${esc(L.ascan)}<span class="insp-scene">${esc(sc.title)} · ${esc(sc.material.name_zh)} ${sc.thickness_mm} ${esc(L.unit_mm)}</span>`));
  const iexp = el('button', 'scope-export', esc(PL.export_wave));
  iexp.type = 'button';
  iexp.onclick = () => exportPracticeWave();
  ititle.appendChild(iexp);
  scope.appendChild(ititle);
  const cv = el('canvas', 'insp-canvas');
  cv.id = 'inspScope';
  scope.appendChild(cv);
  const live = el('div', 'insp-live');
  live.id = 'inspLive';
  scope.appendChild(live);
  home.appendChild(scope);

  const phase = el('div', 'insp-phase');
  phase.id = 'inspPhase';
  home.appendChild(phase);
  extraBody.appendChild(inspControls());

  const read = el('div', 'insp-read');
  read.appendChild(el('div', 'cc-title', esc(L.readout)));
  const tbl = el('table', 'insp-table');
  tbl.innerHTML = `<thead><tr><th></th><th>${esc(L.time)} / ${esc(L.unit_us)}</th><th>${esc(L.depth)} / ${esc(L.unit_mm)}</th><th>${esc(L.fsh)}</th></tr></thead><tbody id="inspRead"></tbody>`;
  read.appendChild(tbl);
  extraBody.appendChild(read);

  if (S.study !== 'classroom') {
    const pts = el('div', 'insp-points');
    pts.appendChild(el('div', 'cc-title', esc(L.concepts)));
    for (const cid of sc.concepts) {
      const c = inspDoc.concepts[cid];
      pts.appendChild(el('div', 'ip-concept', `<b>${esc(c.name_zh)}</b><ul>${c.points.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>`));
    }
    if (sc.questions.length) pts.appendChild(el('div', 'ip-qs', `<span>${esc(L.questions)}</span><ol>${sc.questions.map((q) => `<li>${esc(q)}</li>`).join('')}</ol>`));
    extraBody.appendChild(pts);
  }

  const forms = el('div', 'lab-forms');
  for (const id of ['formula__tof', 'formula__depth_display', 'formula__gain_db']) forms.innerHTML += formulaBlock(inspDoc.formulas[id], S.study === 'classroom');
  extraBody.appendChild(forms);
  home.appendChild(extra);
  panel.appendChild(home);
  renderInspPhase();
  renderInspExp();
  syncInspOps();
  syncInspCtrls();
  inspKey = '';
}

// Self-study wave analysis: readings and key points on the right; views, pulse and free tuning in a bar under the 3D view.
function renderSsWave(sc) {
  const L = UI.inspection;
  const home = el('div', 'home insp-home ss-wave');
  const phase = el('div', 'insp-phase');
  phase.id = 'inspPhase';
  home.appendChild(phase);
  const read = el('div', 'insp-read');
  read.appendChild(el('div', 'cc-title', esc(L.readout)));
  const tbl = el('table', 'insp-table');
  tbl.innerHTML = `<thead><tr><th></th><th>${esc(L.time)} / ${esc(L.unit_us)}</th><th>${esc(L.depth)} / ${esc(L.unit_mm)}</th><th>${esc(L.fsh)}</th></tr></thead><tbody id="inspRead"></tbody>`;
  read.appendChild(tbl);
  home.appendChild(read);
  const pts = el('div', 'insp-points');
  pts.appendChild(el('div', 'cc-title', esc(L.concepts)));
  for (const cid of sc.concepts) {
    const c = inspDoc.concepts[cid];
    pts.appendChild(el('div', 'ip-concept', `<b>${esc(c.name_zh)}</b><ul>${c.points.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>`));
  }
  home.appendChild(pts);
  panel.appendChild(home);
  renderInspPhase();
  syncInspOps();
  syncInspCtrls();
  inspKey = '';
}

function renderPracticePanel() {
  if (replayOn()) { renderReplayPanel(); return; }
  if (examLocked()) { if (S.taskOn) renderTaskDone(); else renderExamDone(); return; }
  const L = UI.inspection;
  const id = S.prac.specimen;
  const home = el('div', `home insp-home prac-home${S.exam ? ' exam' : ''}${S.taskOn ? ' task' : ''}`);
  const head = detectionTraining() ? V4.detection_title : studyFullFlow() ? V4.flow_title : S.taskOn ? `${TK.tab} · ${taskNo(S.taskRun)}` : S.exam ? assessDoc.title : practiceDoc.title;
  const flow = ssBarOn();
  const dtFlow = flow && detectionTraining();
  if (dtFlow) home.classList.add('dt-flow');
  if (!flow) home.appendChild(el('div', 'hero home-hero insp-hero', `<h2>${esc(head)}</h2>`));
  home.appendChild(sessionBar());
  if (S.taskOn) home.appendChild(el('p', 'workflow-note', esc(WF.actual_kit)));
  const introduction = detectionTraining() ? '' : S.learning.route === 'fullscan' ? [WF.fullscan_intro, presetsOn() ? WF.preset : ''].filter(Boolean).join(' ')
    : presetsOn() ? WF.preset : S.taskOn ? (S.learning.taskMode === 'guided' ? WF.guided : WF.independent) : WF.calibration_intro;
  if (introduction) home.appendChild(el('p', 'workflow-note', esc(introduction)));
  if (detectionTraining()) {
    const target = el('section', 'v5-target'); target.id = 'detectionTarget';
    home.appendChild(target);
  }

  const steps = el('div', 'prac-steps');
  buildSteps(steps);
  home.appendChild(steps);
  if (dtFlow) {
    const tips = el('section', 'dt-guide');
    tips.id = 'dtGuide';
    home.appendChild(tips);
    guideKey = '';
  }

  const specs = el('div', 'insp-scenes prac-specs');
  for (const sid of SPEC_IDS) {
    if (S.taskOn || (examCase() && sid === EVAL_SPEC)) continue;
    if (S.learning.route === 'calibration' && ![CAL_RULES.specimen, PR.dac.specimen].includes(sid)) continue;
    const b = el('button', sid === id ? 'on' : '', esc(practiceDoc.specimens[sid].name));
    b.dataset.spec = sid;
    b.onclick = () => setSpecimen(sid);
    specs.appendChild(b);
  }
  if ((!S.exam || examCase()) && S.learning.route !== 'calibration') {
    const b = el('button', id === CASE_ID ? 'on' : '', esc(caseName()));
    b.dataset.spec = CASE_ID;
    b.onclick = () => (S.exam ? setSpecimen(CASE_ID) : openCase());
    specs.appendChild(b);
  }
  if (S.learning.route !== 'fullscan' && !detectionTraining()) home.appendChild(specs);
  if (!S.exam && id === CASE_ID && S.learning.role === 'teacher' && S.learning.route !== 'fullscan') {
    const row = el('div', 'insp-scenes prac-case');
    for (const t of CASE_TPLS) {
      const b = el('button', t === S.caseTpl ? 'on' : '', esc(CASE_TEXT.templates[t]));
      b.dataset.tpl = t;
      b.onclick = () => loadCase(t);
      row.appendChild(b);
    }
    const nb = el('button', 'case-new', esc(CASE_TEXT.new_plate));
    nb.onclick = () => loadCase();
    row.appendChild(nb);
    home.appendChild(row);
  }
  const level = detectionTraining() ? S.prac.eval.level || S.prac.presetCard?.level : null;
  home.appendChild(el('div', 'prac-std', esc(level ? `${specHeader(id)} · ${PL.level} ${levelText(level)}` : specHeader(id))));

  const cams = el('div', 'insp-cams');
  for (const [k, name] of Object.entries(L.cameras)) {
    const b = el('button', k === S.inspCam ? 'active' : '', esc(name));
    b.dataset.cam = k;
    b.onclick = () => setInspCamera(k);
    cams.appendChild(b);
  }
  if (!ssBarOn()) home.appendChild(cams);

  const bar = el('div', 'prac-bar');
  const pos = el('div', 'prac-pos');
  pos.id = 'pracPos';
  const sec = el('div', 'prac-sec', `<span>${esc(PL.section)}</span>`);
  for (const m of SECTION_MODES) {
    const b = el('button', m === S.prac.section ? 'on' : '', esc(SECTION_LABEL[m]));
    b.dataset.sec = m;
    b.onclick = () => setPracticeSection(m);
    sec.appendChild(b);
  }
  bar.append(pos);
  if (!flow) bar.appendChild(sec);
  else if (S.prac.section && S.prac.section !== 'off') setPracticeSection('off');
  home.appendChild(bar);

  const scope = el('div', 'insp-scope');
  if (flow) {
    const read = el('div', 'prac-read');
    read.id = 'pracRead';
    scope.appendChild(read);
    scope.classList.add('ss-read');
    home.appendChild(scope);
  }
  const title = el('div', 'cc-title');
  title.appendChild(el('span', '', `${esc(L.ascan)}<span class="insp-scene">${esc(specName(id))} · ${specT(id)} ${esc(L.unit_mm)}</span>`));
  const exp = el('button', 'scope-export', esc(PL.export_wave));
  exp.type = 'button';
  exp.onclick = () => exportPracticeWave();
  if (detectionTraining()) {
    const acts = el('span', 'scope-acts');
    acts.id = 'scopeActs';
    title.appendChild(acts);
  }
  title.appendChild(exp);
  if (!flow) {
    scope.appendChild(title);
    const cv = el('canvas', 'insp-canvas');
    cv.id = 'inspScope';
    scope.appendChild(cv);
    const read = el('div', 'prac-read');
    read.id = 'pracRead';
    scope.appendChild(read);
    home.appendChild(scope);
  }

  const card = el('div', 'prac-card');
  card.id = 'pracCard';
  home.appendChild(card);

  if (floatControls()) mountQuickControls();
  else home.appendChild(inspControls({ practice: true }));
  const kc = el('div', 'insp-points prac-cards');
  kc.id = 'pracCards';
  home.appendChild(kc);
  if (!detectionTraining()) home.appendChild(modelBoundary());
  panel.appendChild(home);
  renderStepCard();
  renderPracCards();
  syncDetectionTarget();
  syncInspCtrls();
  syncPracticeReadout();
  syncCompact();
  inspKey = '';
}

function buildSteps(box) {
  box.innerHTML = '';
  const full = studyFullFlow();
  if (full) {
    const button = el('button', S.mode === 'equipment' ? 'on' : '', '<i>1</i>' + esc(V4.assembly_step));
    button.dataset.step = 'assembly'; button.onclick = () => setMode('equipment'); box.appendChild(button);
  }
  const list = detectionTraining() ? practiceDoc.steps.filter((step) => ['scan', 'quantify', 'evaluate'].includes(step.id)) : practiceDoc.steps;
  list.forEach((step, index) => {
    const open = stepOpen(step.id), current = step.id === S.prac.step && S.mode === 'practice';
    const button = el('button', [current ? 'on' : '', open ? '' : 'locked'].filter(Boolean).join(' '), '<i>' + (index + 1 + (full ? 1 : 0)) + '</i>' + esc(step.name));
    button.dataset.step = step.id; button.disabled = !open;
    button.onclick = () => {
      if (full && S.mode !== 'practice') { prepareLearningStep(step.id); S.prac.step = step.id; setMode('practice'); }
      setPracticeStep(step.id);
    };
    box.appendChild(button);
  });
}

function syncDetectionTarget() {
  const box = $('detectionTarget');
  if (!box || !detectionTraining()) return;
  const count = detectionCaseSummary(S.case, S.prac.scan.found);
  const n = S.prac.hints?.length || 0;
  const values = { ...count, recorded_determined: count.recordedDetermined,
    minor: count.total - count.determined, n, p: n * REGION_HINT_POINTS };
  const progress = count.determined
    ? v4Format(V5.target_progress, values)
    : V5.target_none;
  const showHint = count.determined > 0 && !count.complete;
  box.innerHTML = '<div class="v5-target-head"><span>' + esc(V5.target_title) + '</span><strong>'
    + esc(v4Format(V5.target_number, values)) + '</strong></div>'
    + (values.minor ? '<p>' + esc(v4Format(V5.target_detail, values)) + '</p>' : '')
    + '<div class="v5-target-progress"><span>' + esc(progress)
    + (n ? ' · ' + esc(v4Format(V5.hint_used, values)) : showHint ? ' · ' + esc(v4Format(V5.hint_cost, { n: REGION_HINT_POINTS })) : '')
    + '</span>'
    + (showHint ? '<button type="button" class="v5-hint" data-act="defect-hint">' + esc(V5.hint) + '</button>' : '') + '</div>';
  const b = box.querySelector('[data-act=defect-hint]');
  if (b) b.onclick = () => showDefectHint();
}

// Zone hint for one unrecorded criterion defect: a disc that contains the indication
// without being centred on it; every use is kept in the record and scored down.
const HINT_RADIUS_MM = 50;
const HINT_MS = 8000;
let hintTimer = 0;
function showDefectHint() {
  if (!detectionTraining() || examLocked() || replayOn() || !S.case || !practice) return null;
  const P = S.prac;
  const done = new Set(P.plates[CASE_ID].scan.found.filter((f) => f.confirmed).map((f) => f.id));
  const det = new Set(S.case.reference.items.filter((it) => it.determined).map((it) => it.id));
  const d = S.case.plate.defects.filter((x) => det.has(x.id) && !done.has(x.id))[0];
  if (!d) { panelMsg(V5.hint_none); return null; }
  let h = 7;
  for (const ch of `${S.case.library_id || S.case.case_id}:${d.id}`) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const a = ((h % 360) * Math.PI) / 180;
  const k = HINT_RADIUS_MM * (0.25 + (((h >>> 9) % 100) / 100) * 0.35);
  const dims = S.case.plate.dims;
  const lx = dims.length.value / 2, ly = dims.width.value / 2;
  const zone = { x: Math.max(-lx, Math.min(lx, d.centre_mm[0] + k * Math.cos(a))), y: Math.max(-ly, Math.min(ly, d.centre_mm[1] + k * Math.sin(a))), r: HINT_RADIUS_MM };
  practice.setHint(CASE_ID, zone);
  clearTimeout(hintTimer);
  hintTimer = setTimeout(() => practice.setHint(CASE_ID, null), HINT_MS);
  (P.hints ||= []).push({ id: d.id, at: new Date().toISOString() });
  emit('practice:hint', { indication_id: d.id, count: P.hints.length });
  syncDetectionTarget();
  return zone;
}

function renderPracState() {
  if (S.mode !== 'practice') return;
  const bar = panel.querySelector('.prac-steps');
  if (bar) buildSteps(bar);
  renderStepCard();
  renderPracCards();
  syncDetectionTarget();
  if ($('inspCtrls')) { compactPracticeControls($('inspCtrls')); syncInspCtrls(); }
  inspKey = '';
}

function renderPracCards() {
  const box = $('pracCards');
  if (!box) return;
  const st = practiceDoc.steps.find((s) => s.id === S.prac.step);
  const cards = !learningHelpOn() ? [] : (st.cards || []).map((id) => practiceDoc.cards.find((k) => k.id === id)).filter(Boolean);
  box.hidden = !cards.length;
  const list = (items) => `<ul>${items.map((p) => `<li>${withChips(esc(p))}</li>`).join('')}</ul>`;
  box.innerHTML = cards.map((c) => `<div class="pw-title">${esc(c.title)}</div>`
    + `<div class="pw-sec goal"><h4>${esc(PL.why_goal)}</h4><p>${withChips(esc(c.goal))}</p></div>`
    + `<div class="pw-sec reason"><h4>${esc(PL.why_reason)}</h4>${list(c.reason)}</div>`
    + `<div class="pw-sec done"><h4>${esc(PL.why_done)}</h4>${list(c.done)}</div>`).join('');
}

// ------------------------------------------------------------------ practice guide (viewport overlay)
const GUIDE = practiceDoc.guide;
let guideBox = null;
let guideBtn = null;
let guideKey = '';
let guideStep = '';
let guideCur = '';
let guideLast = 0;
let stdBox = null;
let stdBtn = null;
let stdKey = '';
let stdPageEl = null;

// Live state of each guide item of `step`: true done, false open, null not checkable.
function guideChecks(step) {
  const P = S.prac;
  if (detectionTraining()) {
    if (step === 'scan') {
      const sum = detectionCaseSummary(S.case, P.scan.found);
      const moved = P.scan.trail.length >= PR.scan.guide_trail_points;
      // Zero-criterion plates need no record; otherwise flag completes when every criterion defect is recorded.
      return { spec: isPlate(P.specimen), move: moved,
        flag: sum.determined ? sum.complete : moved, next: null };
    }
    if (step === 'quantify') {
      const sum = detectionCaseSummary(S.case, P.scan.found);
      if (!sum.determined) return { target: true, points: true, eq: true, result: true };
      const id = P.quant.target;
      return { target: !!id, points: !!id && ((P.quant.pts[id] || []).length >= PR.quantify.min_points || (P.quant.subs[id] || []).length > 0),
        eq: !!id && !!P.quant.eq[id], result: !!id && !!P.quant.results[id] };
    }
    if (step === 'evaluate') return { level: !!P.eval.level,
      verdict: evalItems().every((it) => !!P.eval.verdicts[it.id]) && !!P.eval.plate && !!P.eval.conclusion,
      submit: !!P.done.evaluate };
    return {};
  }
  const ins = S.insp;
  const e = lastGate && lastGate.echo;
  const rejOk = !(ins.reject_percent > 0);
  let c = {};
  if (step === 'calibrate') {
    const T = CAL_RULES.targets_mm;
    const tol = CAL_RULES.qa_tolerance_mm + 1e-9;
    const ech = P.specimen === CAL_RULES.specimen ? wave.echoes(ins) : [];
    const b1 = ech.find((x) => x.id === 'B1');
    const b2 = ech.find((x) => x.id === 'B2');
    const velOk = !!b1 && !!b2 && Math.abs(b2.x_mm - b1.x_mm - (T.B2 - T.B1)) <= CAL_RULES.interval_tolerance_mm + 1e-9;
    const recB1 = P.calib.points.B1 != null;
    const onB1 = !!e && e.id === 'B1';
    c = {
      reject: rejOk, gate: onB1 || recB1, gain: (onB1 && e.pct >= 50 && e.pct <= CLIP_PCT) || recB1,
      velocity: velOk, zero: velOk && Math.abs(b1.x_mm - T.B1) <= tol,
      rec_b1: recB1, rec_b2: P.calib.points.B2 != null, next: null,
    };
  } else if (step === 'dac') {
    const R = PR.dac.record;
    const onSpec = P.specimen === PR.dac.specimen;
    const pr = P.probe[P.specimen];
    c = { spec: onSpec, reject: rejOk, peak: !!ins.peak_memory };
    for (const h of specMan.specimens[PR.dac.specimen].holes) {
      const rec = P.dac.points.some((p) => p.id === h.id);
      const r = Math.hypot(pr.x - h.x_mm, pr.y - h.y_mm);
      const onHole = onSpec && -20 * Math.log10(wave.gLat(r, h.S_mm) ** 2) <= R.peak_tolerance_dB;
      const inGate = onHole && !!e && e.id === h.id;
      c[`pos_${h.id}`] = rec || onHole;
      c[`gate_${h.id}`] = rec || inGate;
      c[`gain_${h.id}`] = rec || (inGate && e.pct >= R.height_window_percent[0] && e.pct <= R.height_window_percent[1]);
      c[`rec_${h.id}`] = rec;
    }
  } else if (step === 'sensitivity') {
    const base = proc.gBase(dacPts());
    c = {
      base: base != null,
      gain: base != null && Math.abs(ins.gain_dB - (base + scanPlus())) <= PR.sensitivity_record.tolerance_dB + 1e-9,
      rec: !!P.done.sensitivity,
    };
  } else if (step === 'scan') {
    c = {
      spec: isPlate(P.specimen),
      gain: !!P.sens && Math.abs(ins.gain_dB - P.sens.scan) <= PR.sensitivity_record.tolerance_dB + 1e-9,
      move: P.scan.trail.length >= PR.scan.guide_trail_points, flag: P.scan.found.length > 0, next: null,
    };
  } else if (step === 'quantify') {
    const t = P.quant.target;
    const required = t ? judgedOf(t) : [];
    const result = t && P.quant.results[t];
    const count = t ? (P.quant.pts[t] || []).length : 0;
    const incomplete = typeOf(t) === 'cluster' && count > 0 && count < PR.quantify.min_points;
    const eqOk = required.includes('equivalent') ? result?.judge?.equivalent === true : null;
    c = { target: !!t, points: !!t && (count >= PR.quantify.min_points || (P.quant.subs[t] || []).length > 0), eq: eqOk,
      result: !!t && !incomplete && required.length > 0 && required.every((key) => result?.judge?.[key] === true) };
  } else if (step === 'evaluate') {
    const E = P.eval;
    const items = evalItems();
    const es = evalSpec();
    c = {
      spec: P.specimen === es,
      find: es === CASE_ID ? !!E.result && !E.result.missed.length : items.length >= specMan.specimens[EVAL_SPEC].defects.length,
      quant: items.length > 0 && items.every((it) => !it.determined || (it.S_mm2 != null && (it.D_dB != null || !proc.needsD(it)))),
      level: !!E.level,
      verdict: items.length > 0 && items.every((it) => !!E.verdicts[it.id]),
      plate: !!E.plate && !!E.conclusion,
      submit: !!P.done.evaluate,
    };
  }
  return c;
}

// DAC: fixed items + guide.dac_hole expanded per CBII-2 hole ({S} depth, {X} probe X, {G} gate start).
function guideItems(step) {
  if (detectionTraining()) {
    const source = systemQuant() && V4.detection_guide_system[step] ? V4.detection_guide_system : V4.detection_guide;
    const card = S.prac.presetCard;
    const values = card ? { edge: card.edge_zone_mm, overlap_spacing: STD_TOKENS.spacing, line_spacing: card.spacing_mm } : {};
    const fmt = (p) => (Array.isArray(p) ? p.map((x) => v4Format(x, values)) : v4Format(p, values));
    const items = (source[step] || []).map((item) => ({ ...item, page: fmt(item.page) }));
    return step === 'quantify' && S.prac.quant.target && !judgedOf(S.prac.quant.target).includes('equivalent')
      ? items.filter((item) => item.id !== 'eq') : items;
  }
  const items = GUIDE.steps[step] || [];
  if (step === 'quantify' && S.prac.quant.target && !judgedOf(S.prac.quant.target).includes('equivalent')) return items.filter((item) => item.id !== 'eq');
  if (step !== 'dac') return items;
  const fill = (s, h) => s && s.replace(/\{S\}/g, String(h.S_mm)).replace(/\{X\}/g, String(h.x_mm).replace('-', '−'))
    .replace(/\{G\}/g, String(h.S_mm - 5));
  const holes = specMan.specimens[PR.dac.specimen].holes;
  return [...items, ...holes.flatMap((h) => GUIDE.dac_hole.map((t) => ({ id: `${t.id}_${h.id}`, do: fill(t.do, h), page: fill(t.page, h), device: fill(t.device, h), why: fill(t.why, h) })))];
}

function setGuide(on) {
  S.prac.guide = on;
  if (on) S.prac.std = false;
  guideKey = '';
  stdKey = '';
}

function buildGuide() {
  const tools = el('div', 'vp-tools');
  stdBtn = el('button', 'guide-btn std-btn', `<i>§</i>${esc(stdDoc.title)}`);
  stdBtn.onclick = () => setStd(!S.prac.std);
  guideBtn = el('button', 'guide-btn', `<i>?</i>${esc(GUIDE.show)}`);
  guideBtn.onclick = () => setGuide(!S.prac.guide);
  tools.append(stdBtn, guideBtn);
  stdBox = el('div', 'guide std-box');
  stdBox.hidden = true;
  stdBox.addEventListener('click', (ev) => {
    if (ev.target.closest('.gd-x')) setStd(false);
    else if (ev.target.closest('.sd-all')) openStdPage(S.prac.stdFocus);
  });
  viewport.append(tools, stdBox);
  guideBox = el('div', 'guide');
  guideBox.hidden = true;
  guideBox.addEventListener('click', (ev) => {
    if (ev.target.closest('.gd-x')) { setGuide(false); return; }
    const li = ev.target.closest('li[data-i]');
    if (!li) return;
    const i = Number(li.dataset.i);
    S.prac.guideItem = S.prac.guideItem === i ? null : i;
    guideKey = '';
  });
  viewport.append(guideBox);
}

function updateGuide(now) {
  if (!guideBtn) buildGuide();
  const on = S.mode === 'practice' && !!practice && !!proc;
  const stdOn = on && (!S.exam || S.taskOn || rubricDoc.teacher_config.exam.standard_page !== false);
  const dtBox = on && detectionTraining() ? $('dtGuide') : null;
  guideBtn.hidden = !on || (!learningHelpOn() && !detectionTraining());
  if (dtBox) guideBtn.hidden = true;
  stdBtn.hidden = !stdOn;
  updateQuantCap(now);
  if (!stdOn) { stdBox.hidden = true; stdKey = ''; }
  if (!on) { guideBox.hidden = true; guideKey = ''; return; }
  if (stdOn) updateStdBox();
  if (dtBox) { guideBox.hidden = true; updateDtGuide(dtBox, now); return; }
  if (!learningHelpOn() && !detectionTraining()) { guideBox.hidden = true; guideKey = ''; return; }
  if (now - guideLast < 150 && guideKey) return;
  guideLast = now;
  guideBtn.classList.toggle('on', S.prac.guide);
  guideBox.hidden = !S.prac.guide;
  if (!S.prac.guide) return;
  const step = S.prac.step;
  if (step !== guideStep) { guideStep = step; S.prac.guideItem = null; }
  const items = guideItems(step);
  const chk = guideChecks(step);
  const states = items.map((it) => chk[it.id] ?? null);
  const cur = states.findIndex((s) => s !== true);
  const target = S.prac.quant.target;
  const boundary = step === 'quantify' && !detectionTraining() ? measuredBoundaryState(S.prac.quant.results[target],
    (S.prac.quant.pts[target] || []).length + (S.prac.quant.subs[target] || []).flat().length, PR.quantify.min_points) : null;
  const key = `${step}|${states.join()}|${boundary}|${cur}|${S.prac.guideItem}|${S.study}`;
  if (key === guideKey) return;
  guideKey = key;
  const si = STEP_IDS.indexOf(step);
  const rows = items.map((it, i) => {
    const done = states[i] === true;
    const open = i === cur || i === S.prac.guideItem;
    const how = (tag, cls, text) => (Array.isArray(text) ? `<ol class="gd-sub">${text.map((t, k) => `<li><em>${esc((GUIDE.sub_step || '{n}').replace('{n}', k + 1))}</em>${esc(t)}</li>`).join('')}</ol>`
      : text ? `<div class="gd-how"><span class="gd-tag ${cls}">${esc(tag)}</span><span>${esc(text)}</span></div>` : '');
    const recordOnly = step === 'quantify' && it.id === 'points' && done;
    const label = recordOnly ? WF.boundary_recorded : !detectionTraining() && step === 'quantify' && it.id === 'result' && boundary !== 'open'
      ? (states[i] === true ? WF.boundary_verified : WF.boundary_recheck) : it.do;
    return `<li data-i="${i}" class="${[done ? (recordOnly ? 'recorded' : 'done') : '', i === cur ? 'cur' : '', open ? 'open' : ''].filter(Boolean).join(' ')}">`
      + `<div class="gd-do"><i>${done ? esc(recordOnly ? WF.step_recorded : PL.ok) : i + 1}</i><b>${esc(label)}</b></div>`
      + (open ? how(GUIDE.page, 'page', it.page) + how(GUIDE.device, 'dev', it.device) + how(GUIDE.why, 'why', it.why) : '') + '</li>';
  }).join('');
  guideBox.innerHTML = `<div class="gd-head"><b>${esc(GUIDE.title)}</b><span>${si + 1} ${esc(practiceDoc.steps[si].name)}</span>`
    + `<button class="gd-x" title="${esc(GUIDE.close)}">×</button></div><ol class="gd-list">${rows}</ol>`;
  const curKey = `${step}|${cur}`;
  if (curKey !== guideCur) {
    guideCur = curKey;
    const li = guideBox.querySelector('li.cur');
    const head = guideBox.querySelector('.gd-head').offsetHeight;
    if (li && (li.offsetTop - head < guideBox.scrollTop || li.offsetTop + li.offsetHeight > guideBox.scrollTop + guideBox.clientHeight)) {
      guideBox.scrollTop = Math.max(0, li.offsetTop - head - 8);
    }
  }
}

// Detection training: operation guide in the right panel; each step in which it is shown is recorded (P.tips) and scored down.
function updateDtGuide(box, now) {
  const G = V5.guide;
  const P = S.prac;
  const step = P.step;
  const on = !!P.guide;
  if (on && !examLocked() && !P.tips.some((t) => t.step === step)) {
    P.tips.push({ step, at: new Date().toISOString() });
    emit('practice:guide', { step, count: P.tips.length });
  }
  if (now - guideLast < 150 && guideKey) return;
  guideLast = now;
  if (step !== guideStep) { guideStep = step; P.guideItem = null; }
  const items = on ? guideItems(step) : [];
  const chk = on ? guideChecks(step) : {};
  const states = items.map((it) => chk[it.id] ?? null);
  const cur = states.findIndex((s) => s !== true);
  const used = new Set(P.tips.map((t) => t.step)).size * GUIDE_TIP_POINTS;
  const key = `dt|${on}|${step}|${states.join()}|${cur}|${P.guideItem}|${used}`;
  if (key === guideKey && box.firstChild) return;
  guideKey = key;
  const rows = items.map((it, i) => {
    const done = states[i] === true;
    const open = i === cur || i === P.guideItem;
    const page = Array.isArray(it.page) ? it.page : it.page ? [it.page] : [];
    return `<li data-i="${i}" class="${[done ? 'done' : '', i === cur ? 'cur' : '', open ? 'open' : ''].filter(Boolean).join(' ')}">`
      + `<div class="dg-do"><i>${done ? esc(PL.ok) : i + 1}</i><b>${esc(it.do)}</b></div>`
      + (open && page.length ? `<ol class="dg-sub">${page.map((t) => `<li>${esc(t)}</li>`).join('')}</ol>` : '') + '</li>';
  }).join('');
  box.classList.toggle('on', on);
  box.innerHTML = `<div class="dg-head"><b>${esc(G.title)}</b><span class="dg-cost${used ? ' used' : ''}">${esc(v4Format(used ? G.used : G.cost, { n: used || GUIDE_TIP_POINTS }))}</span>`
    + `<button type="button" class="dg-tog${on ? '' : ' primary'}" data-act="guide">${esc(on ? G.off : G.on)}</button></div>`
    + (on ? `<ol class="dg-list">${rows}</ol>` : '');
  box.querySelector('.dg-tog').onclick = () => { P.guide = !P.guide; guideKey = ''; };
  box.querySelectorAll('.dg-list > li[data-i]').forEach((li) => {
    li.onclick = () => { const i = Number(li.dataset.i); P.guideItem = P.guideItem === i ? null : i; guideKey = ''; };
  });
}

// Detection training, system quantify: caption over the 3D view naming the button to press, the run in progress and the result.
let quantCap = null;
let quantPhase = null;
let quantCapKey = '';
let quantCapLast = 0;
let quantMark = null;
function updateQuantCap(now) {
  if (now - quantCapLast < 120) return;
  quantCapLast = now;
  if (!quantCap) {
    quantCap = el('div', 'help-cap dt-cap');
    quantCap.hidden = true;
    viewport.appendChild(quantCap);
  }
  const P = S.prac;
  const Q = V5.quant_cap;
  const fill = v4Format;
  let lines = [];
  let sel = '';
  if (systemQuant() && S.mode === 'practice' && P.step === 'quantify' && !examLocked() && !replayOn()) {
    const found = P.scan.found.map((f, i) => ({ f, name: `${plateTag()} ${i + 1}` })).filter((x) => x.f.flags.length);
    const t = P.quant.target;
    const cur = found.find((x) => x.f.id === t);
    const next = found.find((x) => x.f.id !== t && !P.quant.results[x.f.id]);
    const pick = (x) => `#pracCard .pc-targets button[data-def="${x.f.id}"]`;
    if (quantRun && cur) {
      const ph = quantPhase;
      lines = [fill(Q.run, { name: cur.name }), !ph ? '' : ph.eq ? Q.run_eq
        : (ph.nb > 1 ? fill(Q.run_block, { b: ph.b + 1 }) : '') + fill(Q.run_pt, { dir: Q.dirs[ph.k], k: ph.k + 1 })];
    } else if (cur && P.quant.results[t]) {
      const r = P.quant.results[t];
      const R = practiceDoc.results;
      const eq = r.eq == null ? '' : fill(Q.done_eq, { eq: R.equivalent_format.replace('{sign}', r.eq >= 0 ? '+' : '−').replace('{value}', Math.abs(r.eq).toFixed(1)) });
      lines = [fill(Q.done, { name: cur.name }), fill(Q.done_res, { length: r.length.toFixed(1), area: r.area.toFixed(0) }) + eq,
        next ? fill(Q.next, { name: next.name }) : Q.all];
      sel = next ? pick(next) : '.prac-steps button[data-step=evaluate]';
    } else if (cur) {
      const it = evalItems().find((x) => x.id === t);
      lines = [Q.ready, fill(it && proc.needsD(it) ? Q.ready_eq : Q.ready_sub, { name: cur.name })];
      sel = '#pracCard .pc-btns button.primary';
    } else if (found.length) {
      const first = found.find((x) => !P.quant.results[x.f.id]) || found[0];
      lines = [Q.pick, fill(Q.pick_sub, { name: first.name })];
      sel = pick(first);
    }
  }
  const key = lines.join('|');
  if (key !== quantCapKey) {
    quantCapKey = key;
    const html = lines.length
      ? `<b>${esc(lines[0])}</b>${lines.slice(1).filter(Boolean).map((s) => `<span>${esc(s)}</span>`).join('')}`
      : '';
    paintCap(quantCap, html, key);
  }
  const mark = sel ? document.querySelector(sel) : null;
  if (mark !== quantMark) {
    quantMark?.classList.remove('dt-mark');
    mark?.classList.add('dt-mark');
    quantMark = mark;
  }
}

// ------------------------------------------------------------------ learning help (teacher / self study): step checklist, auto demo, learning record
// Ticks come from what the learner did in the step; ticks produced by a demo are shown but not recorded (help.demoSeen,
// help.skip). The learning record calls are no-ops outside the student role.
const HELP = UI.help;
const HELP_ROUTES = new Set(['equipment', 'principle', 'inspection', 'fullscan', 'task', 'angle-structure']);
const DEMO_STOP = Symbol('demo-stop');
const help = { key: '', topic: null, seen: new Set(), demoSeen: new Set(), skip: new Set(), sent: '', total: 0, item: null,
  open: true, run: null, last: 0, rkey: '', lab0: null, reasons: {}, tasks: new Set(), label: '', seenBy: {}, hold: '' };
const inspTry = { n: 0, by: '', scored: 0 };
let helpBox = null;
let helpBtn = null;
let demoBtn = null;
let helpCap = null;

function helpTopic() {
  const L = S.learning;
  if (!['teacher', 'student'].includes(L.role) || S.exam || S.taskOn || S.stdPage || replayOn()) return null;
  if (document.body.dataset.learningRoute !== L.route) return null;
  if (L.route === 'task') return S.taskPage && referenceCardLearning() && S.task.id ? { module: 'task', step: S.task.step } : null;
  if (L.route === 'design' && S.taskPage && S.task.id && S.task.step === 'learn') return { module: 'task', step: 'learn' };
  if (S.taskPage) return null;
  if (!HELP_ROUTES.has(L.route)) return null;
  if (L.route === 'fullscan') {
    if (S.mode === 'equipment') return { module: 'fullscan', step: 'assembly' };
    return S.mode === 'practice' ? { module: 'fullscan', step: S.prac.step } : null;
  }
  if (ssEquip()) {
    const mod = S.learning.route === 'angle-structure' ? 'angle-structure' : 'equipment';
    if (S.mode === 'equipment') return { module: mod, step: S.ssEq || 'devices' };
    if (mod === 'equipment' && (S.mode === 'exterior' || S.mode === 'structure' || S.mode === 'physics')) {
      return { module: 'equipment', step: 'probe' };
    }
    return mod === 'equipment' && S.mode === 'inspection' ? { module: 'equipment', step: 'wave' } : null;
  }
  if (S.mode === 'equipment') return { module: 'equipment', step: 'bench' };
  if (S.mode === 'exterior' || S.mode === 'structure') return { module: 'equipment', step: S.selected ? 'parts' : 'views' };
  if (S.mode === 'physics') return { module: 'principle', step: S.prView === 'parts' ? 'roles' : 'scenes' };
  if (S.mode === 'lab') return { module: 'principle', step: 'lab' };
  if (S.mode === 'inspection' && S.inspExp) return { module: 'inspection', step: S.inspExp.id };
  return null;
}

const helpExp = (id) => theoryDoc.experiments.find((e) => e.id === id);
const fsGuide = (t) => t.module === 'fullscan' && t.step !== 'assembly';

function helpItems(t) {
  const base = baseHelpItems(t);
  const def = studyCardOn() && studyStepDef(t);
  return def?.items ? studyItems(def.items, base) : base;
}

function baseHelpItems(t) {
  if (fsGuide(t)) return guideItems(t.step);
  if (t.module === 'task') {
    if (t.step === 'check') return HELP.task_check;
    if (t.step === 'learn') return HELP.task_card;
    return [];
  }
  if (t.module === 'inspection') {
    const exp = helpExp(t.step), E = HELP.exp;
    const items = S.learning.role === 'teacher' ? [] : [{ id: 'predict', ...E.predict }];
    exp.steps.forEach((s, i) => {
      const src = i ? E.step : E.first, label = expStepLabel(s);
      items.push({ id: `s${i}`, do: v4Format(src.do, { label }), page: v4Format(src.page, { label }) });
    });
    return [...items, { id: 'result', do: E.result.do, page: exp.observation, why: exp.explanation }];
  }
  return HELP[t.step === 'assembly' ? 'bench' : t.step] || [];
}

// true done, false open, null / missing not checkable; `seen` holds the observations used for the view-type steps.
function helpChecks(t, seen) {
  const base = baseHelpChecks(t, seen);
  help.base = base;
  const def = studyCardOn() && studyStepDef(t);
  if (!def?.items) return base;
  return Object.fromEntries(helpItems(t).map((it) => {
    const v = it.of.map((k) => base[k]);
    return [it.id, v.includes(false) ? false : v.includes(true) ? true : null];
  }));
}

function baseHelpChecks(t, seen) {
  if (fsGuide(t)) return guideChecks(t.step);
  const count = (pre) => [...seen].filter((k) => k.startsWith(pre)).length;
  if (t.step === 'bench' || t.step === 'assembly') {
    const s = assembly?.status();
    return s ? { ...s.steps, echo: s.done } : {};
  }
  if (t.step === 'prep') {
    return {
      'prep:weld': seen.has('prep:weld'),
      'prep:tools': seen.has('prep:tools'),
      'prep:grind': seen.has('prep:grind'),
    };
  }
  if (t.step === 'views') return { exterior: seen.has('v:exterior'), cutaway: seen.has('v:cutaway'), exploded: seen.has('v:exploded'), pick: seen.has('pick') };
  if (t.step === 'devices') return Object.fromEntries(eqMan.order.map((id) => [`eq:${id}`, seen.has(`eq:${id}`)]));
  if (t.step === 'probe') return Object.fromEntries(['v:exterior', 'v:cutaway', 'v:exploded', 'sc', 'end'].map((k) => [k, seen.has(k)]));
  if (t.step === 'wave') {
    return { pulse: seen.has('pulse'), 'cam:panel': seen.has('cam:panel'), keys: count('key:') >= 3, tune: seen.has('tune'),
      ...Object.fromEntries(['gain_dB', 'range_mm', 'velocity_m_s', 'gate'].map((k) => [`set:${k}`, seen.has(`set:${k}`)])) };
  }
  if (t.step === 'parts') return { pick: seen.has('pick'), why: seen.has('why'), work: seen.has('work'), remove: seen.has('remove'), more: count('p:') >= 3 };
  if (t.step === 'scenes') return { open: count('sc:') > 0, play: seen.has('end'), two: count('sc:') >= 2 };
  if (t.step === 'roles') {
    const all = partsDoc.parts.filter((kb) => REMOVAL_BY_PART[kb.id] && parts[kb.id]).length;
    return { open: count('rm:') > 0, three: count('rm:') >= 3, all: count('rm:') >= all };
  }
  if (t.step === 'lab') return { freq: seen.has('f'), diam: seen.has('D'), damp: seen.has('damp') };
  if (t.module === 'inspection') {
    const exp = helpExp(t.step), last = exp.steps.length - 1;
    const c = { predict: !!S.inspPrediction };
    exp.steps.forEach((s, i) => { c[`s${i}`] = seen.has(`s${i}`); });
    c.result = seen.has(`s${last}`) && (S.learning.role === 'teacher' || !!S.inspPrediction);
    return c;
  }
  if (t.module === 'task' && t.step === 'learn') {
    const done = new Set(taskLearnState(S.task.id).done);
    if (taskSeenCount() >= 2) done.add('other');
    return Object.fromEntries(HELP.task_card.map((it) => [it.id, done.has(it.id)]));
  }
  if (t.module === 'task' && t.step === 'check') {
    const st = taskTest(S.task.id);
    return { fill: taskcard.parse(st.raw).ok, check: !!st.score, fix: !!st.score && st.score.points >= st.score.max };
  }
  if (t.module === 'task') return {};
  return {};
}

function helpObserve(t, seen) {
  if (t.step === 'views') {
    seen.add(`v:${S.mode === 'exterior' ? 'exterior' : S.sview}`);
    if (S.selected) seen.add('pick');
  } else if (t.step === 'probe') {
    if (S.mode !== 'physics') seen.add(`v:${S.mode === 'exterior' ? 'exterior' : S.sview}`);
    else if (S.scene && SCENES[S.scene].kind !== 'removal') {
      seen.add('sc');
      if (S.sceneStep === SCENES[S.scene].steps.length - 1) seen.add('end');
    }
  } else if (t.step === 'parts' && S.selected) {
    const cls = S.study === 'classroom' && CC[S.selected];
    seen.add('pick');
    seen.add(`p:${S.selected}`);
    if (S.tab === 'design_driver' || cls) seen.add('why');
    if (S.tab === 'principles') seen.add('work');
    if (S.tab === 'removal_effects' || (cls && S.step >= 1)) seen.add('remove');
  } else if (t.step === 'scenes' && S.scene && SCENES[S.scene].kind !== 'removal') {
    seen.add(`sc:${S.scene}`);
    if (S.sceneStep === SCENES[S.scene].steps.length - 1) seen.add('end');
  } else if (t.step === 'roles' && S.scene) {
    for (const [pid, [sid, i]] of Object.entries(REMOVAL_BY_PART)) if (sid === S.scene && i === S.sceneStep) seen.add(`rm:${pid}`);
  } else if (t.step === 'lab' && help.lab0) {
    if (S.labF !== help.lab0.f) seen.add('f');
    if (S.labD !== help.lab0.D) seen.add('D');
    if (S.labDamp !== help.lab0.damp) seen.add('damp');
  } else if (t.module === 'inspection' && S.inspExp) seen.add(`s${S.inspExp.step}`);
}

// Self-study (equipment module): actions outside the checklist's own observations, kept under the step they belong to.
function ssStudyMod() {
  return S.learning.route === 'angle-structure' ? 'angle-structure' : 'equipment';
}
function ssDevicesSeen() {
  return help.seenBy[`${ssStudyMod()}/devices`]?.seen || new Set();
}
function markProbeTour(kind) {
  const key = `${ssStudyMod()}/devices`;
  const kept = (help.seenBy[key] ||= { seen: new Set(), demoSeen: new Set() });
  kept.seen.add(`probe:${kind}`);
  if (help.key === key) help.seen.add(`probe:${kind}`);
  help.rkey = '';
}
function ssProbeTourDone(mod) {
  const seen = help.seenBy[`${mod}/devices`]?.seen;
  return !!(seen?.has('probe:enter') && seen?.has('probe:back'));
}

function ssMark(k, step) {
  if (!ssEquip() && S.learning.route !== 'angle-structure') return;
  const key = `${ssStudyMod()}/${step}`;
  const kept = (help.seenBy[key] ||= { seen: new Set(), demoSeen: new Set() });
  const bag = help.run ? 'demoSeen' : 'seen';
  kept[bag].add(k);
  if (help.key === key) help[bag].add(k);
  help.rkey = '';
}

function helpName(t) {
  if (t.module === 'inspection') return helpExp(t.step).title;
  if (t.module === 'task') return HELP.task_steps[t.step];
  return HELP.names[t.step];
}

function buildHelp() {
  const tools = guideBtn.parentElement;
  demoBtn = el('button', 'guide-btn demo-btn', '');
  demoBtn.onclick = () => toggleDemo();
  helpBtn = el('button', 'guide-btn help-btn', `<i>?</i>${esc(HELP.show)}`);
  helpBtn.onclick = () => { help.open = !help.open; help.rkey = ''; };
  tools.prepend(demoBtn, helpBtn);
  helpBox = el('div', 'guide help-box');
  helpBox.hidden = true;
  helpBox.addEventListener('click', (ev) => {
    if (ev.target.closest('.gd-x')) { help.open = false; help.rkey = ''; return; }
    const li = ev.target.closest('li[data-i]');
    if (li) toggleHelpItem(Number(li.dataset.i));
  });
  helpCap = el('div', 'help-cap');
  helpCap.hidden = true;
  viewport.append(helpBox, helpCap);
  // The learner working in the step again takes over the state a demo left.
  const act = (ev) => {
    const n = ev.target;
    if (help.run || !help.skip.size || !(n instanceof Element) || n.closest('.vp-tools, .guide, .help-demo, .tk-steps, .tk-learn')) return;
    if (n.closest('#panel, #viewport, #taskPage')) help.skip.clear();
  };
  document.addEventListener('pointerdown', act, true);
  document.addEventListener('keydown', act, true);
}

function toggleHelpItem(i) {
  help.item = help.item === i ? null : i;
  help.rkey = '';
}

function setCaption(main, sub = '') {
  if (!helpCap) return;
  const html = main ? `<b>${esc(main)}</b>${sub ? `<span>${esc(sub)}</span>` : ''}` : '';
  paintCap(helpCap, html, html);
}

function helpRows(items, states, cur) {
  return items.map((it, i) => {
    const done = states[i] === true;
    const open = i === cur || (i === help.item && i <= Math.max(cur, 0)) || (i === help.item && cur < 0);
    const how = (tag, cls, text) => (text ? `<div class="gd-how"><span class="gd-tag ${cls}">${esc(tag)}</span><span>${esc(text)}</span></div>` : '');
    return `<li data-i="${i}" class="${[done ? 'done' : '', i === cur ? 'cur' : '', open ? 'open' : ''].filter(Boolean).join(' ')}">`
      + `<div class="gd-do"><i>${done ? esc(PL.ok) : i + 1}</i><b>${esc(it.do)}</b></div>`
      + (open ? how(HELP.how, 'page', it.page) + how(HELP.why, 'why', it.why) : '') + '</li>';
  }).join('');
}

function updateHelp(now) {
  if (!guideBtn) return;
  if (!helpBtn) buildHelp();
  const t = helpTopic();
  const card = mountStudyCard(t);
  const key = t ? `${t.module}/${t.step}` : '';
  if (help.run && (!t || t.module !== help.run.module || !help.run.keep.has(t.step))) stopDemo();
  if (key !== help.key) {
    const kept = (help.seenBy[key] ||= { seen: new Set(), demoSeen: new Set() });
    Object.assign(help, { key, topic: t, ...kept, skip: new Set(), sent: '', total: 0, item: null, rkey: '',
      lab0: { f: S.labF, D: S.labD, damp: S.labDamp } });
    if (t) learnVisit(t.module, t.step);
  }
  ssSync();
  const boxOn = !!t && t.module !== 'task' && !fsGuide(t) && !card;
  helpBtn.hidden = !boxOn;
  if (!boxOn) helpBox.hidden = true;
  demoBtn.hidden = !t || t.module === 'task';
  const label = help.run ? 'stop' : 'demo';
  if (label !== help.label) {
    help.label = label;
    demoBtn.innerHTML = `<i>${help.run ? '■' : '▶'}</i>${esc(HELP[label])}`;
    demoBtn.classList.toggle('on', !!help.run);
    const tk = taskPageEl?.querySelector('.tk-demo');
    if (tk) tk.textContent = HELP[label];
  }
  if (!t) { helpBox.hidden = true; return; }
  if (now - help.last < 150 && help.rkey) return;
  help.last = now;
  if (t.module === 'task' && S.task.id) help.tasks.add(S.task.id);
  const sig = viewSig();
  if (help.hold && sig !== help.hold) help.hold = '';
  const obs = help.run || help.hold ? help.demoSeen : help.seen;
  helpObserve(t, obs);
  if (t.step === 'probe' && S.mode === 'physics' && S.scene && SCENES[S.scene]?.kind !== 'removal'
    && obs.has('end') && S.sceneStep === SCENES[S.scene].steps.length - 1) {
    const sk = S.scene;
    if (ss.sceneToastKey !== sk) {
      ss.sceneToastKey = sk;
      showSsToast(fillTpl(SC.scene_done, { name: SCENES[sk].title }));
    }
  } else if (t.step !== 'probe') {
    ss.sceneToastKey = '';
  }
  const items = helpItems(t);
  const shown = helpChecks(t, help.demoSeen.size ? new Set([...help.seen, ...help.demoSeen]) : help.seen);
  const own = help.demoSeen.size ? helpChecks(t, help.seen) : shown;
  const total = items.filter((it) => shown[it.id] != null).length;
  if (total !== help.total) { help.total = total; learnTotal(t.module, t.step, total); }
  for (const it of items) {
    if (help.run && own[it.id] === true) help.skip.add(it.id);
    else if (!help.run && own[it.id] !== true) help.skip.delete(it.id);
  }
  const mine = items.filter((it) => own[it.id] === true && !help.skip.has(it.id)).map((it) => it.id);
  if (mine.join() !== help.sent) { help.sent = mine.join(); learnDone(t.module, t.step, mine); }
  inspScore(t);
  if (card) { renderStudyCard(t, items, shown); ssSync(); return; }
  if (fsGuide(t)) return;
  const states = items.map((it) => shown[it.id] ?? null);
  const cur = states.findIndex((s) => s !== true);
  const rkey = `${key}|${states.join()}|${cur}|${help.item}|${help.open}|${S.task.id}`;
  const head = `<div class="gd-head"><b>${esc(HELP.title)}</b><span>${esc(helpName(t))}</span>`;
  const list = `<ol class="gd-list">${helpRows(items, states, cur)}</ol>`;
  if (t.module === 'task') {
    helpBox.hidden = true;
    help.rkey = rkey;
    return;
  }
  helpBtn.classList.toggle('on', help.open);
  helpBox.hidden = !help.open;
  if (rkey === help.rkey) return;
  help.rkey = rkey;
  helpBox.innerHTML = `${head}<button class="gd-x" title="${esc(HELP.close)}">×</button></div>${list}`;
}

// View state left by a demo: observations count for the learner only after it changes.
const viewSig = () => [S.mode, S.sview, S.selected, S.tab, S.step, S.scene, S.sceneStep, S.labF, S.labD, S.labDamp, S.inspExp?.id, S.inspExp?.step].join('|');

// ------------------------------------------------------------------ self-study step card (student, plate track)
// Takes the place of the checklist float, the practice guide float and the view tabs: one card on top of the right panel
// with the module's steps, the current checklist and previous / next. Catalog: plate track of knowledge/study_report.json;
// an item ticks when all checkpoints in `of` do, `each: "hole"` repeats it per CBII-2 hole, `optional` drops it when the
// step offers none of its checkpoints. `sub` steps (probe structure) open from the equipment page, not by previous / next;
// `caption` steps show the current item as a caption over the 3D view and mark its `target` control.
const STUDY_PLATE = studyDoc.tracks.find((tr) => tr.id === 'plate');
const STUDY_WELD = studyDoc.tracks.find((tr) => tr.id === 'weld');
const SC = studyDoc.card;
const EQ_DRAWINGS = { cbii_2: cbii2DrawingUrl, csk_ia: cskIaDrawingUrl };
function eqName(id) {
  return eqDoc.items[id]?.name || id;
}
function eqIntroOf(id) {
  return eqDoc.items[id]?.intro || null;
}
function eqSectionsOf(id) {
  return eqDoc.items[id]?.sections || {};
}
function eqClausesOf(id) {
  return eqDoc.items[id]?.clauses || [];
}
const studyTrackOf = () => (
  document.body.dataset.track === 'weld' || S.learning.route?.startsWith('angle-') ? STUDY_WELD : STUDY_PLATE
);
const studyStepsOf = (track = studyTrackOf()) => (track?.modules || [])
  .flatMap((m) => m.steps.filter((s) => !s.sub).map((s) => ({ module: m.id, step: s.id })));
const studyMod = (id) => STUDY_PLATE.modules.find((m) => m.id === id)
  || STUDY_WELD?.modules.find((m) => m.id === id);
const studyStepDef = (t) => studyMod(t.module)?.steps.find((s) => s.id === t.step);
const studyTitle = (id) => learningDoc.roles.student.items.find((it) => it.route === id)?.title || id;
const fillTpl = (tpl, map) => String(tpl || '').replace(/\{(\w+)\}/g, (_, k) => map[k] ?? '');
/** Self-study equipment module: only gear for the current method (plate = straight beam). */
const PLATE_METHOD_EQ = [
  'eq__instrument', 'eq__probe_straight', 'eq__cable', 'eq__couplant',
  'eq__compare', 'eq__cbii_2', 'eq__plate',
];
const WELD_METHOD_EQ = [
  'eq__instrument', 'eq__probe_angle', 'eq__cable', 'eq__couplant', 'eq__csk_ia',
];
const PAUT_METHOD_EQ = ['eq__instrument_paut', 'eq__probe_paut', 'eq__probe_tofd'];
const PAUT_BENCH_OPEN = {
  eq__probe_paut: '#probe/pa',
  eq__instrument_paut: '#paut/tx',
  eq__probe_tofd: '#tofd/wave',
};
const PROBE_TEARDOWN_EQ = new Set(['eq__probe_straight', 'eq__probe_angle']);
const WELD_CSK_POSE = { x: -150, z: 250, yaw: (40 * Math.PI) / 180 };
function stationBlockFixed(id) {
  return stationDef()?.id === 'weld' && id === 'eq__csk_ia';
}
function pinStationBlocks() {
  if (!equipment || stationDef()?.id !== 'weld') return;
  const place = () => {
    if (stationDef()?.id !== 'weld' || stationProgOf().packed) return;
    equipment.setPose?.('eq__csk_ia', WELD_CSK_POSE);
  };
  place();
  equipment.displaysReady?.then?.(place);
}
function applyStudyMethodFilter() {
  if (!equipment) return;
  if (studyBenchGate()) {
    const packed = !!stationProgOf().packed;
    const ids = packed ? [] : studyRevealedIds();
    equipment.setMethodFilter(ids);
    equipment.setCskIaStyle(stationDef()?.csk === 'angle' ? 'angle' : stationDef()?.csk === 'both' ? 'both' : 'plate');
    equipment.setKitCase?.({ show: true, open: packed ? false : (stationKitOpened() || !!stationProgOf().kit) });
    pinStationBlocks();
  } else if (pautBenchGate()) {
    equipment.setMethodFilter(PAUT_METHOD_EQ);
  } else if (weldExamKitGate() || examKitGate() || pautExamKitGate()) {
    equipment.setMethodFilter(null);
  } else if (S.learning.role === 'student' && S.learning.route === 'angle-structure' && S.mode === 'equipment') {
    equipment.setMethodFilter(WELD_METHOD_EQ);
  } else if (ssEquip() || (S.learning.role === 'student' && S.learning.route === 'equipment')) {
    equipment.setMethodFilter(PLATE_METHOD_EQ);
  }
  if (!studyBenchGate()) {
    equipment.setKitCase?.({ show: false, open: false });
    const weldCsk = weldExamKitGate()
      || S.learning.route === 'angle-structure'
      || (document.body.dataset.track === 'weld' && S.mode === 'equipment');
    equipment.setCskIaStyle(weldCsk ? 'angle' : 'plate');
  }
  const anglePlug = stationDef()?.id === 'weld'
    || document.body.dataset.station === 'weld'
    || (S.learning.role === 'student' && S.learning.route === 'angle-structure' && S.mode === 'equipment');
  assembly?.setProbeTarget?.(anglePlug ? 'eq__probe_angle' : 'eq__probe_straight');
  if (anglePlug) equipment.displaysReady?.then?.(() => assembly?.updateCable?.(80));
  syncWeldPrep();
}
let studyCard = null;
let studyKey = '';

function studyCardOn() {
  const L = S.learning;
  if (!(L.role === 'student' && !S.exam && !S.taskOn && !replayOn() && L.route !== 'task'
    && !!studyMod(L.route) && document.body.dataset.learningRoute === L.route)) return false;
  if (L.route === 'angle-structure') return !angleApp?.isOpen?.();
  if (L.route?.startsWith('angle-') || (document.body.dataset.track === 'weld' && !document.body.dataset.weldBench)) {
    return false;
  }
  return true;
}

function ssWeldPage() {
  return ['devices', 'bench', 'prep'].includes(S.ssEq || 'devices');
}
function ssEquip() {
  if (!studyCardOn()) return false;
  return S.learning.route === 'equipment'
    || (S.learning.route === 'angle-structure' && ssWeldPage());
}
function ssDevicesPage() {
  return ssEquip() && (S.ssEq || 'devices') === 'devices';
}
function weldPrepOn() {
  return !!weldPrep && S.mode === 'equipment' && S.learning.route === 'angle-structure' && (S.ssEq || 'devices') === 'prep';
}
function syncWeldPrep() {
  weldPrep?.setActive(weldPrepOn());
}
function lookWeldPrep() {
  const pose = weldPrep?.focusTarget?.();
  if (pose) flyTo(pose, 700);
}
async function runWeldPrep(act) {
  if (!weldPrepOn()) return;
  if (act === 'weld') {
    await weldPrep.showWeld();
    if (weldPrep.status().weld) ssMark('prep:weld', 'prep');
  } else if (act === 'tools') {
    if (!weldPrep.status().weld) return;
    await weldPrep.showTools();
    if (weldPrep.status().tools) ssMark('prep:tools', 'prep');
  } else if (act === 'grind') {
    if (!weldPrep.status().tools || weldPrep.playing) return;
    await weldPrep.playGrind(() => {
      ssMark('prep:grind', 'prep');
      help.rkey = '';
    });
  }
  help.rkey = '';
  lookWeldPrep();
}

function keepEqView() {
  if (weldExamKitGate() || examKitGate() || pautExamKitGate() || studyBenchGate() || pautBenchGate()) return true;
  if (S.learning.role !== 'student' || S.mode !== 'equipment') return false;
  if ((S.ssEq || 'devices') !== 'devices') return false;
  return S.learning.route === 'equipment' || S.learning.route === 'angle-structure';
}

function studyItems(defs, base) {
  const ids = new Set(base.map((it) => it.id));
  return defs.flatMap((d) => {
    if (d.each === 'hole') {
      return specMan.specimens[PR.dac.specimen].holes.map((h) => {
        const fill = (s) => (Array.isArray(s) ? s.map(fill) : s && s.replace(/\{S\}/g, String(h.S_mm)).replace(/\{X\}/g, String(h.x_mm).replace('-', '−')).replace(/\{G\}/g, String(h.S_mm - 5)));
        const target = d.target && typeof d.target === 'object' ? Object.fromEntries(Object.entries(d.target).map(([k, v]) => [`${k}_${h.id}`, v])) : d.target;
        return { id: `${d.id}_${h.id}`, do: fill(d.do), page: fill(d.page), look: fill(d.look), target, of: d.of.map((k) => `${k}_${h.id}`) };
      });
    }
    return d.optional && !d.of.some((k) => ids.has(k)) ? [] : [d];
  });
}

function studyNeighbor(t, d) {
  const steps = studyStepsOf();
  const i = steps.findIndex((x) => x.module === t.module && x.step === t.step);
  const n = i < 0 ? null : steps[i + d] || null;
  if (n && S.labStation != null && n.module === 'task') return null;
  if (n && S.labStation != null && t.module === 'equipment' && n.module === 'equipment'
    && (n.step === 'devices' || n.step === 'bench')) return null;
  return n;
}

async function enterProbeTeardown() {
  markProbeTour('enter');
  if (S.learning.route === 'angle-structure') return studyGo('angle-structure', 'display');
  return studyGo('equipment', 'probe');
}

async function studyGo(module, step) {
  stopDemo();
  if (S.learning.route !== module) {
    if (S.labStation != null) {
      Object.assign(S.learning, { role: 'student', route: module, taskMode: 'guided' });
      document.body.dataset.learningRole = 'student';
      document.body.dataset.learningRoute = module;
      learningShell?.update(S.learning);
    } else if (!(await learningShell?.openRoute('student', module))) return;
  }
  if (module === 'equipment') {
    if (S.selected) select(null);
    if (step === 'devices' || step === 'bench') {
      if (step === 'devices' && (S.mode === 'exterior' || S.mode === 'structure' || S.mode === 'physics')) markProbeTour('back');
      S.ssEq = step;
      if (step === 'bench') S.ssDev = null;
      if (S.mode !== 'equipment') await setMode('equipment');
      else renderPanel();
      applyStudyMethodFilter();
    } else if (step === 'probe') {
      markProbeTour('enter');
      S.ssDev = null;
      S.prView = 'scenes';
      if (S.mode !== 'exterior' && S.mode !== 'structure') await setMode('exterior');
    } else if (step === 'wave') {
      S.inspExp = null;
      S.inspPrediction = null;
      if (S.mode !== 'inspection') await setMode('inspection');
      else renderPanel();
    }
  } else if (module === 'angle-structure') {
    if (step === 'devices' || step === 'bench' || step === 'prep') return openWeldDevices(step);
    markProbeTour('enter');
    delete document.body.dataset.weldBench;
    document.body.dataset.track = 'weld';
    Object.assign(S.learning, { role: 'student', route: 'angle-structure', taskMode: 'guided' });
    document.body.dataset.learningRole = 'student';
    document.body.dataset.learningRoute = 'angle-structure';
    setStudy('self');
    if ((await openAngle('angle-structure')) === false) return;
    if (step && step !== 'devices' && step !== 'display') angleApp?.show?.(step);
    else angleApp?.show?.('display');
    learningShell?.update(S.learning);
    syncLabRoomBack();
  } else if (typeof module === 'string' && module.startsWith('angle-')) {
    const ok = await launchWeld({ role: 'student', route: module });
    if (ok && step) angleApp?.show?.(step);
  } else if (module === 'inspection') runExperiment(step);
  else if (module === 'fullscan') {
    if (S.mode !== 'practice') {
      S.prac.flowAssemblyDone = true;
      prepareLearningStep(step);
      S.prac.step = step;
      await setMode('practice');
    }
    setPracticeStep(step);
  } else if (module === 'task') setTaskStep(step);
  if (S.labStation != null) syncLabRoomBack();
}

function buildStudyCard() {
  studyCard = el('section', 'ss-card');
  studyCard.addEventListener('click', (ev) => {
    const t = help.topic;
    const b = ev.target.closest('button');
    if (!t) return;
    if (!b) {
      const li = ev.target.closest('li[data-i]');
      if (li?.dataset.dev) S.ssDev = li.dataset.dev;
      else if (li) toggleHelpItem(Number(li.dataset.i));
      return;
    }
    const act = b.dataset.act;
    if (b.dataset.go) studyGo(t.module, b.dataset.go);
    else if (b.dataset.view) {
      if (S.selected) select(null);
      if (b.dataset.view === 'exterior') setMode('exterior');
      else setMode('structure', { view: b.dataset.view });
    }     else if (act === 'demo') toggleDemo();
    else if (act === 'probe') enterProbeTeardown();
    else if (act === 'dev-close') closeSsDev();
    else if (act === 'drawing' && S.ssDev) openSsDrawing(S.ssDev);
    else if (act === 'back') {
      markProbeTour('back');
      if (S.labStation != null) return openStationParent();
      if (S.learning.route === 'angle-structure') studyGo('angle-structure', 'devices');
      else studyGo('equipment', 'devices');
    }
    else if (act === 'prep-weld') runWeldPrep('weld');
    else if (act === 'prep-tools') runWeldPrep('tools');
    else if (act === 'prep-grind') runWeldPrep('grind');
    else if (act === 'auto') autoAssemble();
    else if (act === 'manual') {
      if (autoTimer || assembly?.status().done) redoAssembly();
      help.rkey = '';
    } else if (act === 'prev' || act === 'next') {
      const to = studyNeighbor(t, act === 'next' ? 1 : -1);
      if (to) studyGo(to.module, to.step);
    }
  });
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if ($('ssDraw')) $('ssDraw').remove();
    else if ($('ssPlan')) closeSsPlan();
    else if (S.ssDev) closeSsDev();
  });
}

// Card on top of the panel while a catalogued step is open; the panel content below is rebuilt by renderPanel.
function mountStudyCard(t) {
  const on = studyCardOn();
  document.body.classList.toggle('ut-ss', on);
  if (!on || !t || !studyStepDef(t)) {
    if (studyCard?.isConnected) studyCard.remove();
    return false;
  }
  if (!studyCard) buildStudyCard();
  if (panel.firstElementChild !== studyCard) { panel.prepend(studyCard); studyKey = ''; }
  return true;
}

function ssStepDone(module, s) {
  const rec = learnRecord();
  return stepScore(rec?.modules?.[module]?.steps?.[s.id] ?? (s.from ? rec?.modules?.[s.from]?.steps?.[s.id] : undefined), !!s.test).status === 'done';
}

const ssDevId = (it) => it.of[0].replace(/^eq:/, '');
// A target map picks the control of the first open checkpoint of the item.
const itemTarget = (it) => (it.target && typeof it.target === 'object' ? it.target[it.of.find((k) => help.base?.[k] === false)] || null : it.target || null);
const ssHow = (it) => (Array.isArray(it.page) ? `<ol class="ss-how">${it.page.map((p) => `<li>${esc(p)}</li>`).join('')}</ol>` : `<p>${esc(it.page)}</p>`)
  + (it.look ? `<p class="ss-look"><span>${esc(SC.look)}</span>${esc(it.look)}</p>` : '');

function renderStudyCard(t, items, shown) {
  const mod = studyMod(t.module);
  const def = studyStepDef(t);
  const states = items.map((it) => shown[it.id] ?? null);
  const cur = states.findIndex((s) => s !== true);
  const allDone = items.length > 0 && states.every((s) => s === true);
  const tour = t.step !== 'devices' || ssProbeTourDone(t.module);
  ss.cap = def.caption && cur >= 0 && !allDone ? items[cur] : null;
  if (t.step === 'devices' && allDone && !tour) {
    const name = t.module === 'angle-structure' ? '斜探头' : '直探头';
    ss.cap = {
      do: fillTpl(SC.probe_found || '您已找到{name}，请点击右侧下方探头结构按钮进入原理学习页面', { name }),
      target: '.ss-acts [data-act=probe], .ss-dev-inline [data-act=probe]',
    };
  }
  ss.pageDone = allDone && tour && !def.sub;
  ss.target = ss.cap?.target || (t.module === 'fullscan' && cur >= 0 ? itemTarget(items[cur]) : null);
  const nextHint0 = allDone && tour && !def.sub && t.step !== 'probe' ? studyNeighbor(t, 1) : null;
  ss.nextGo = nextHint0 && nextHint0.module === t.module ? nextHint0.step : '';
  const view = t.step === 'probe' && S.mode !== 'physics' ? (S.mode === 'exterior' ? 'exterior' : S.sview) : '';
  const foundDev = !!S.ssDev && ssDevicesSeen().has(`eq:${S.ssDev}`);
  const key = `${t.module}/${t.step}|${states.join()}|${cur}|${help.item}|${!!help.run}|${view}|${!!autoTimer}|${S.ssDev || ''}|${foundDev}|${allDone}|${tour}|${weldPrep?.sig?.() || ''}`;
  help.rkey = key;
  if (key === studyKey) return;
  studyKey = key;
  const hideEqNav = S.labStation != null && t.module === 'equipment';
  const main = mod.steps.filter((s) => !s.sub && !(hideEqNav && (s.id === 'devices' || s.id === 'bench')));
  const si = main.findIndex((s) => s.id === t.step);
  const rows = items.map((it, i) => {
    const done = states[i] === true;
    const open = i === cur || i === help.item;
    const id = t.step === 'devices' ? ssDevId(it) : '';
    const onDev = id && id === S.ssDev;
    const dev = id ? ` data-dev="${esc(id)}"` : '';
    return `<li data-i="${i}"${dev} class="${[done ? 'done' : '', i === cur ? 'cur' : '', open ? 'open' : '', onDev ? 'sel' : ''].filter(Boolean).join(' ')}">`
      + `<div class="ss-do"><i>${done ? esc(PL.ok) : i + 1}</i><b>${esc(it.do)}</b></div>${open && it.page ? ssHow(it) : ''}</li>`;
  }).join('');
  const btn = (act, label, cls = '', off = false) => `<button type="button" data-act="${act}" class="${cls}"${off ? ' disabled' : ''}>${label}</button>`;
  // Probe teardown: only the local checklist + views + return (no parent module step chips).
  if (def.sub || t.step === 'probe') {
    const views = `<div class="ss-views">${Object.entries(SC.views).map(([v, label]) => `<button type="button" data-view="${v}" class="${v === view ? 'on' : ''}">${esc(label)}</button>`).join('')}</div>`;
    const retTip = allDone ? `<p class="ss-return-tip">${esc(SC.probe_return)}</p>` : '';
    studyCard.classList.toggle('ss-wide', true);
    studyCard.classList.toggle('ss-flow', false);
    studyCard.classList.toggle('ss-static', true);
    studyCard.classList.toggle('ss-probe', true);
    const backLabel = S.labStation != null
      ? (stationTreeChild() ? (learningDoc.to_parent || '返回上一级') : (learningDoc.to_bench || SC.back))
      : SC.back;
    studyCard.innerHTML = `<header class="ss-head"><b>${esc(def.title || SC.probe)}</b></header>`
      + `<ol class="ss-list">${rows}</ol>${views}${retTip}`
      + `<div class="ss-acts">${btn('back', esc(backLabel), allDone ? 'primary ss-return-btn' : 'primary')}</div>`;
    ss.pageDone = false;
    ss.nextGo = '';
    return;
  }
  const nextSame = ss.nextGo;
  const chips = main.length > 1 ? main.map((s, i) => {
    const done = s.id === t.step ? ss.pageDone : ssStepDone(t.module, s);
    return `<li><button type="button" data-go="${esc(s.id)}" class="${[s.id === t.step ? 'on' : '', done ? 'done' : '', nextSame && s.id === nextSame ? 'ss-target' : ''].filter(Boolean).join(' ')}">`
      + `<i>${done ? esc(PL.ok) : i + 1}</i>${esc(s.title)}</button></li>`;
  }).join('') : '';
  const prev = studyNeighbor(t, -1), next = studyNeighbor(t, 1);
  const nextLabel = ss.pageDone ? (SC.page_done_btn || '本页已完成') : (next && next.module !== t.module ? SC.next_module : SC.next);
  const nextOff = !next || ss.pageDone || (t.step === 'devices' && allDone && !tour);
  const nav = btn('prev', esc(SC.prev), '', !prev)
    + btn('next', esc(nextLabel), ss.pageDone ? 'ss-page-done-btn' : '', nextOff);
  let acts = nav;
  if (t.step === 'devices' && !tour) {
    const probeId = t.module === 'angle-structure' ? 'eq__probe_angle' : 'eq__probe_straight';
    if (ssDevicesSeen().has(`eq:${probeId}`)) acts = btn('probe', esc(SC.probe_btn || '探头结构'), 'primary') + acts;
  }
  if (t.step === 'bench' && t.module === 'equipment') acts = btn('auto', esc(SC.auto), autoTimer ? 'on' : '', !!autoTimer) + btn('manual', esc(SC.manual)) + nav;
  else if (t.step === 'prep' && t.module === 'angle-structure') {
    const wp = weldPrep?.status?.() || {};
    const busy = !!weldPrep?.playing;
    acts = btn('prep-weld', '取出焊缝', wp.weld ? 'on' : 'primary', !!wp.weld || busy)
      + btn('prep-tools', '工具准备', wp.tools ? 'on' : (wp.weld ? 'primary' : ''), !wp.weld || !!wp.tools || busy)
      + btn('prep-grind', '打磨清理焊缝', wp.grind ? 'on' : (wp.tools ? 'primary' : ''), !wp.tools || busy)
      + nav;
  }
  else if (t.module !== 'equipment' && t.module !== 'angle-structure' && DEMOS[t.step]) {
    acts = btn('demo', `<i>${help.run ? '■' : '▶'}</i>${esc(help.run ? SC.stop : SC.demo)}`, help.run ? 'on' : '') + nav;
  }
  const detail = t.step === 'devices' && S.ssDev && eqIntroOf(S.ssDev)
    ? `<div class="ss-dev-inline">${ssDevHtml(S.ssDev, foundDev)}</div>` : '';
  studyCard.classList.toggle('ss-wide', t.module === 'equipment' || t.module === 'angle-structure');
  studyCard.classList.toggle('ss-flow', t.module === 'fullscan');
  studyCard.classList.toggle('ss-static', false);
  studyCard.classList.toggle('ss-probe', false);
  const stepMark = main.length > 1 ? `<span>${Math.max(1, si + 1)} / ${main.length}</span>` : '';
  studyCard.innerHTML = `<header class="ss-head"><b>${esc(hideEqNav && t.step === 'wave' ? (studyStepDef(t)?.title || studyTitle(t.module)) : studyTitle(t.module))}</b>${stepMark}</header>`
    + (chips ? `<ol class="ss-steps">${chips}</ol>` : '') + `<ol class="ss-list">${rows}</ol>`
    + detail
    + `<div class="ss-acts">${acts}</div>`;
}

// Equipment module overlays: module menu (start button), caption and the marked control of the current item.
const ss = {
  cap: null, pageDone: false, target: null, nextGo: '', tk: null, dk: '', ck: '', pk: '', tgt: [], dm: [],
  devEl: null, capEl: null, probeTip: null, doneEl: null, restoreEl: null, sceneToastKey: '',
};

function capX() {
  return `<button type="button" class="ss-cap-x" title="${esc(SC.cap_close || SC.close)}">×</button>`;
}
function paintCap(box, html, key) {
  if (!box) return;
  if (box.dataset.ck !== key) {
    box.dataset.ck = key;
    box.classList.remove('ss-cap-off');
  }
  box.hidden = !html;
  box.innerHTML = html ? `${capX()}${html}` : '';
  syncCapRestore();
}
function syncCapRestore() {
  const boxes = [ss.capEl, ss.doneEl, helpCap, quantCap].filter((n) => n && !n.hidden && n.classList.contains('ss-cap-off'));
  if (!ss.restoreEl) {
    ss.restoreEl = el('button', 'ss-cap-restore', esc(SC.cap_show || '提示'));
    ss.restoreEl.type = 'button';
    ss.restoreEl.hidden = true;
    ss.restoreEl.onclick = () => {
      [ss.capEl, ss.doneEl, helpCap, quantCap].forEach((n) => n?.classList.remove('ss-cap-off'));
      ss.restoreEl.hidden = true;
    };
    viewport.appendChild(ss.restoreEl);
  }
  ss.restoreEl.hidden = !boxes.length;
}
viewport.addEventListener('click', (ev) => {
  const x = ev.target instanceof Element ? ev.target.closest('.ss-cap-x') : null;
  if (!x || !viewport.contains(x)) return;
  ev.preventDefault();
  ev.stopPropagation();
  const box = x.closest('.ss-cap, .ss-page-done, .help-cap');
  if (!box) return;
  box.classList.add('ss-cap-off');
  syncCapRestore();
});

function openSsPlan() {
  closeSsPlan();
  const route = S.learning.route === 'angle-structure' ? 'angle-structure' : 'equipment';
  const mod = studyMod(route);
  if (!mod) return;
  const found = ssDevicesSeen();
  const secs = mod.steps.filter((s) => !s.sub).map((s, i) => {
    const done = ssStepDone(route, s);
    const devs = s.id !== 'devices' ? '' : `<div class="ssp-devs">${s.items.map((it) => {
      const id = ssDevId(it), f = found.has(it.of[0]);
      return `<button type="button" data-dev="${esc(id)}" class="${f ? 'done' : ''}">${f ? `<i>${esc(PL.ok)}</i>` : ''}${esc(eqName(id))}</button>`;
    }).join('')}</div>`;
    return `<section class="${done ? 'done' : ''}"><button type="button" class="ssp-head" data-go="${esc(s.id)}"><i>${done ? esc(PL.ok) : i + 1}</i>`
      + `<b>${esc(s.title)}</b><span>${esc(done ? studyDoc.status.done : studyDoc.status.todo)}</span></button>${devs}</section>`;
  }).join('');
  const box = el('div', 'ss-plan', `<div class="ssp-box"><header><b>${esc(studyTitle(route))}</b>`
    + `<button type="button" class="ssp-x" title="${esc(SC.close)}">×</button></header>${secs}</div>`);
  box.id = 'ssPlan';
  box.addEventListener('click', (ev) => {
    const b = ev.target.closest('button');
    if (!b) { if (ev.target === box) closeSsPlan(); return; }
    closeSsPlan();
    if (b.dataset.dev) studyGo(route, 'devices').then(() => { S.ssDev = b.dataset.dev; });
    else if (b.dataset.go) studyGo(route, b.dataset.go);
  });
  document.body.appendChild(box);
}

function showSsToast(text) {
  if (!text) return;
  let tip = $('ssToast');
  if (!tip) {
    tip = el('div', 'ss-toast');
    tip.id = 'ssToast';
    viewport.appendChild(tip);
  }
  tip.textContent = text;
  tip.classList.add('show');
  clearTimeout(showSsToast.timer);
  showSsToast.timer = setTimeout(() => tip.classList.remove('show'), 2200);
}

function closeSsPlan() {
  $('ssPlan')?.remove();
}

function closeSsDev() {
  if (S.eqId && S.mode === 'equipment') selectEq(null);
  S.ssDev = null;
}

function ssDevHtml(id, found) {
  const it = eqDoc.items[id], o = eqIntroOf(id);
  if (!it || !o) return '';
  const screen = o.screen ? `<h4>${esc(SC.screen)}</h4><dl>${o.screen.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>` : '';
  const isProbe = PROBE_TEARDOWN_EQ.has(id);
  const tip = isProbe ? `<p class="ss-probe-tip">${esc(SC.probe_tip)}</p>` : '';
  const probe = isProbe ? `<button type="button" class="primary" data-act="probe">${esc(SC.probe_btn || '探头结构')}</button>` : '';
  const src = EQ_DRAWINGS[o.drawing];
  const drawing = src ? `<h4>${esc(SC.drawing)}</h4><button type="button" class="ssd-draw" data-act="drawing"><img src="${src}" alt="${esc(eqName(id))}"></button>` : '';
  return `<header><b>${esc(eqName(id))}</b><span class="${found ? 'ok' : ''}">${esc(found ? SC.found : SC.find)}</span>`
    + `<button type="button" class="ssd-x" title="${esc(SC.close)}" data-act="dev-close">×</button></header>`
    + `<div class="ssd-body"><h4>${esc(SC.role)}</h4><p>${esc(o.role)}</p><h4>${esc(SC.parts)}</h4>`
    + `<ul>${o.parts.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>${drawing}${screen}${tip}${probe}</div>`;
}

function openSsDrawing(id) {
  $('ssDraw')?.remove();
  const it = eqDoc.items[id];
  const o = eqIntroOf(id);
  const src = EQ_DRAWINGS[o?.drawing];
  if (!src) return;
  const box = el('div', 'ss-draw', `<figure><header><b>${esc(eqName(id))} · ${esc(SC.drawing)}</b>`
    + `<button type="button" class="ssd-x" title="${esc(SC.close)}">×</button></header><img src="${src}" alt="${esc(eqName(id))}"></figure>`);
  box.id = 'ssDraw';
  box.addEventListener('click', (ev) => { if (ev.target === box || ev.target.closest('.ssd-x')) box.remove(); });
  viewport.appendChild(box);
}

// Bottom bar on the self-study equipment and plate-flow pages: views, tuning, firing, bench pan, export.
const ssBar = { key: '', l: null, m: null, r: null, tune: null, saved: null };
function ssBarOn() {
  return (studyCardOn() && (S.learning.route === 'equipment' || S.learning.route === 'angle-structure' || S.learning.route === 'fullscan'))
    || (detectionTraining() && S.mode === 'practice' && !examLocked() && !replayOn());
}
function mountSsBar() {
  ssBar.l = el('div', 'ss-bar ssb-l');
  ssBar.m = el('div', 'ssb-m');
  ssBar.r = el('div', 'ss-bar ssb-r');
  ctl.explode.before(ssBar.l);
  ctl.export_image.before(ssBar.r);
  $('controls').appendChild(ssBar.m);
}
function toggleSsTune() {
  if (S.mode === 'practice') {
    quickFloat.off = !quickFloat.off;
    $('v5Float')?.classList.toggle('ss-off', quickFloat.off);
    return;
  }
  const pop = $('ssPop');
  if (!pop) return;
  pop.hidden = !pop.hidden;
  if (pop.hidden) return;
  if (S.mode === 'equipment') syncBenchInsp();
  if (S.mode === 'inspection') ssMark('tune', 'wave');
  syncInspCtrls();
}
// The bench screen runs its own calibrated setup: the tuning panel and the panel keys read and write it there.
function syncBenchInsp() {
  if (!wave || !practice) return;
  const b = benchInst();
  ssBar.saved ||= { ...S.insp };
  for (const k of Object.keys(waveRules.controls)) if (k in b && k in S.insp) S.insp[k] = b[k];
}
function buildSsBar(mode) {
  const L = UI.inspection;
  const btn = (label, fn, cls = '') => {
    const b = el('button', cls, esc(label));
    b.type = 'button';
    b.onclick = fn;
    return b;
  };
  const cams = el('div', 'insp-cams');
  for (const [k, name] of Object.entries(L.cameras)) {
    const b = btn(name, () => setInspCamera(k), k === S.inspCam ? 'active' : '');
    b.dataset.cam = k;
    cams.appendChild(b);
  }
  ssBar.tune = btn(SC.tune, toggleSsTune, 'ss-tune');
  ssBar.tune.dataset.act = 'tune';
  ssBar.l.append(el('div', 'sep'), cams, ssBar.tune);
  if (mode === 'inspection') {
    const ops = el('div', 'insp-ops');
    for (const [id, label, fn, cls] of [['inspPulse', L.pulse, inspPulse, 'primary'], ['inspCont', L.continuous, inspContinuous],
      ['inspPause', L.pause, inspPause], ['inspReset', L.reset, inspReset]]) {
      const b = btn(label, () => fn(), cls);
      b.id = id;
      ops.appendChild(b);
    }
    ssBar.r.append(ops, el('div', 'sep'));
    syncInspOps();
  }
  if (mode === 'practice') {
    const wexp = btn(PL.export_wave, () => exportPracticeWave());
    wexp.dataset.act = 'export-wave';
    ssBar.r.appendChild(wexp);
  }
  if (mode === 'equipment') syncBenchInsp();
  if (mode !== 'practice') {
    const pop = el('div', 'ss-pop');
    pop.id = 'ssPop';
    pop.dataset.mode = mode;
    pop.hidden = true;
    pop.appendChild(inspControls());
    viewport.appendChild(pop);
    syncInspCtrls();
  }
}
function syncSsBar() {
  if (!ssBar.l) return;
  const on = ssBarOn();
  const sys = on && sysMode();
  document.body.classList.toggle('ss-bar', on);
  const key = sys ? S.mode : '';
  if (key !== ssBar.key) {
    ssBar.key = key;
    ssBar.l.innerHTML = '';
    ssBar.r.innerHTML = '';
    ssBar.tune = null;
    $('ssPop')?.remove();
    if (ssBar.saved && S.mode !== 'equipment') { Object.assign(S.insp, ssBar.saved); ssBar.saved = null; inspKey = ''; }
    if (sys) buildSsBar(S.mode);
  }
  const home = sys ? ssBar.m : viewport;
  if (eqPanBox.parentNode !== home) home.appendChild(eqPanBox);
  eqPanBox.hidden = !sys && S.mode !== 'equipment';
  ssBar.tune?.classList.toggle('on', S.mode === 'practice' ? !!$('v5Float') && !quickFloat.off : !$('ssPop')?.hidden);
}

function ssSync() {
  syncSsBar();
  syncExamKitCap();
  const t = help.topic;
  const on = !!t && (t.module === 'equipment' || t.module === 'angle-structure') && ssEquip();
  if (!on && $('ssPlan')) closeSsPlan();
  if (!ss.capEl) {
    ss.capEl = el('div', 'ss-cap');
    ss.capEl.hidden = true;
    viewport.appendChild(ss.capEl);
  }
  if (!ss.doneEl) {
    ss.doneEl = el('div', 'ss-page-done');
    ss.doneEl.hidden = true;
    viewport.appendChild(ss.doneEl);
  }
  // Device intro lives in the right-hand study card (ss-dev-inline), not a viewport popup.
  if (ss.devEl) { ss.devEl.remove(); ss.devEl = null; }
  const dev = on && S.mode === 'equipment' && eqIntroOf(S.ssDev) ? S.ssDev : null;
  if (!dev) $('ssDraw')?.remove();
  const found = !!dev && ssDevicesSeen().has(`eq:${dev}`);
  const dk = dev ? `${dev}|${found}` : '';
  if (dk !== ss.dk) {
    ss.dk = dk;
    studyKey = '';
  }
  const tipOn = false;
  if (tipOn && !ss.probeTip) {
    ss.probeTip = el('button', 'ss-probe-banner', esc(SC.probe_tip));
    ss.probeTip.type = 'button';
    ss.probeTip.onclick = () => enterProbeTeardown();
    viewport.appendChild(ss.probeTip);
  } else if (!tipOn && ss.probeTip) {
    ss.probeTip.remove();
    ss.probeTip = null;
  }
  const pageDoneOn = !!ss.pageDone && studyCardOn() && !help.run && !$('ssPlan');
  const nextName = pageDoneOn && ss.nextGo ? (studyStepDef({ module: t.module, step: ss.nextGo })?.title || '') : '';
  const pk = pageDoneOn ? `${t?.module}/${t?.step}|${nextName}` : '';
  if (pk !== ss.pk) {
    ss.pk = pk;
    paintCap(ss.doneEl, pageDoneOn
      ? `<b>${esc(nextName ? fillTpl(SC.page_done, { name: nextName }) : (SC.page_done_end || SC.page_done))}</b>`
      : '', pk);
  }
  const cap = on && !help.run && !$('ssPlan') && !pageDoneOn ? ss.cap : null;
  const ck = cap ? `${cap.do}|${cap.page}` : '';
  if (ck !== ss.ck) {
    ss.ck = ck;
    paintCap(ss.capEl, cap
      ? `<b>${esc(cap.do)}</b>${cap.page ? `<span>${esc(cap.page)}</span>` : ''}${ss.target ? `<span class="ss-cap-aim">${esc(SC.cap_aim || '请点击黄色框标出的控件')}</span>` : ''}`
      : '', ck);
  }
  const flow = !!t && t.module === 'fullscan' && studyCardOn() && !help.run;
  const tgt = (on || flow) && ss.target ? [...document.querySelectorAll(ss.target)] : [];
  for (const n of ss.tgt || []) if (!tgt.includes(n)) n.classList.remove('ss-target');
  for (const n of tgt) n.classList.add('ss-target');
  if (flow && ss.target !== ss.tk) {
    ss.tk = ss.target;
    tgt.find((n) => panel.contains(n))?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
  ss.tgt = tgt;
  const dm = help.run?.mark ? [...document.querySelectorAll(help.run.mark)] : [];
  for (const n of ss.dm) if (!dm.includes(n)) n.classList.remove('ss-demo');
  for (const n of dm) n.classList.add('ss-demo');
  ss.dm = dm;
  const pop = $('ssPop');
  const open = !!pop && !pop.hidden;
  pop?.classList.toggle('focus', open && tgt.some((n) => pop.contains(n)));
  // Keep caption centered on the stage (amber card); only compact when the tune pop is open.
  ss.capEl.classList.toggle('up', open);
  ss.capEl.style.bottom = '';
  ss.capEl.style.top = '';
}

function inspScore(t) {
  if (t.module !== 'inspection' || S.learning.role !== 'student' || inspTry.by !== 'learner' || inspTry.scored === inspTry.n) return;
  const exp = helpExp(t.step);
  if (S.inspExp.step !== exp.steps.length - 1 || !S.inspPrediction) return;
  inspTry.scored = inspTry.n;
  learnScore('inspection', exp.id, S.inspPrediction === exp.correct_answer ? 1 : 0, 1);
}

// Demo runner: one demo at a time; the stop button, a step change or a new demo ends it (DEMO_STOP at the next await).
const DEMO_SLOW = 2;
function runDemo(t, fn, keep) {
  stopDemo();
  const run = { module: t.module, keep: new Set(keep), clean: [], mark: '' };
  help.run = run;
  learnDemo(t.module, t.step);
  const check = () => { if (help.run !== run) throw DEMO_STOP; };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const slow = t.module === 'fullscan' ? DEMO_SLOW : 1;
  const page = (it, i) => (Array.isArray(it.page) ? it.page[Math.min(i, it.page.length - 1)] : it.page);
  const a = {
    check,
    slow,
    glide: slow,
    wait: async (ms) => { check(); await sleep(ms * slow); check(); },
    until: async (pred, ms = 8000) => {
      const t0 = performance.now();
      while (!pred() && performance.now() - t0 < ms) await a.wait(60);
      check();
    },
    lerp: async (from, to, ms, set) => {
      const t0 = performance.now();
      for (;;) {
        check();
        const k = Math.min(1, (performance.now() - t0) / (ms * slow));
        set(from + (to - from) * ease(k));
        if (k >= 1) return;
        await sleep(40);
      }
    },
    cap: (it, sub) => { check(); if (typeof it === 'string' || !it) setCaption(it || '', sub); else setCaption(it.do, it.why || page(it, 0)); },
    // Sub-step `i` of a card item as the caption; `sel` marks the control it operates.
    show: (it, i = 0, sel = '') => { check(); setCaption(it.do, page(it, i)); run.mark = sel; },
    look: (it, sel = '') => { check(); setCaption(it.do, it.look ? `${SC.look}：${it.look}` : page(it, Infinity)); run.mark = sel; },
    onStop: (f) => run.clean.push(f),
  };
  helpRefresh();
  Promise.resolve().then(() => fn(a)).catch((e) => { if (e !== DEMO_STOP) console.error(e); }).finally(() => endDemo(run));
}

function stopDemo() {
  if (help.run) endDemo(help.run);
}

function endDemo(run) {
  if (help.run !== run) return;
  help.run = null;
  for (const f of run.clean) { try { f(); } catch (e) { console.error(e); } }
  help.hold = viewSig();
  setCaption('');
  helpRefresh();
}

function helpRefresh() {
  help.rkey = '';
  help.label = '';
  if (!S.selected && (S.mode === 'exterior' || S.mode === 'structure') && !S.taskPage) renderPanel();
}

function toggleDemo(which) {
  if (help.run) { stopDemo(); return; }
  const t = helpTopic();
  if (!t) return;
  const step = which || t.step;
  const fn = t.module === 'inspection' ? DEMOS.exp : t.module === 'task' ? DEMOS[`task_${t.step}`] : DEMOS[step === 'assembly' ? 'bench' : step];
  if (fn) runDemo({ module: t.module, step }, fn, step === 'parts' ? ['views', 'parts'] : [t.step]);
}

const guideItem = (step, id) => guideItems(step).find((it) => it.id === id);

// Probe glide on the current specimen at constant speed (a scan stays below the standard scan speed); `each` runs on
// every frame of the glide.
async function demoGlide(a, x, y, mmps, { track = false, each = null } = {}) {
  const P = S.prac, id = P.specimen, p0 = { ...P.probe[id] }, run = help.run;
  const ms = Math.max(300, (Math.hypot(x - p0.x, y - p0.y) / (mmps / (a.glide || 1))) * 1000);
  const t0 = performance.now();
  const ok = await new Promise((done) => {
    const step = () => {
      if (help.run !== run || P.specimen !== id) { done(false); return; }
      const k = Math.min(1, (performance.now() - t0) / ms);
      placeProbe(p0.x + (x - p0.x) * k, p0.y + (y - p0.y) * k, { track });
      each?.();
      if (k >= 1) done(true); else requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
  a.check();
  if (!ok) throw DEMO_STOP;
  placeProbe(x, y, { final: true, track });
  emitProbeMove();
}

// Gain until the gated echo is readable, then auto gain to 80 %FSH.
async function demoGain(a) {
  const A = waveRules.auto_gain;
  for (let k = 0; k < 4; k++) {
    const g = gateReading(wave.synth(S.insp, { columns: 480, noise: false }), gateOf());
    if (g?.top && g.top.pct >= A.min_percent) break;
    await a.lerp(S.insp.gain_dB, Math.min(waveRules.controls.gain_dB.max, S.insp.gain_dB + 12), 500, (v) => setInsp('gain_dB', v));
  }
  autoGain();
  await a.wait(700);
}

async function demoGate(a, start, width) {
  if (!S.insp.gate_on) setInsp('gate_on', true);
  await a.lerp(S.insp.gate_start_mm, start, 700, (v) => setInsp('gate_start_mm', v));
  setInsp('gate_width_mm', width);
  await a.wait(400);
}

// Demo captions: the step card item holding checkpoint `id` on the self-study card, else the practice guide item.
function demoItem(step, id) {
  const t = { module: 'fullscan', step };
  if (studyCardOn() && studyStepDef(t)?.items) {
    const it = helpItems(t).find((x) => x.of.includes(id));
    if (it) return it;
  }
  return guideItem(step, id);
}
const DEMO_SEL = { tune: '.ss-bar [data-act=tune]', rec: '#pracCard .pc-btns .primary', hole: '#pracCard .find-hole',
  target: '#pracCard .pc-targets button', level: '#pracCard [data-lv]', verdict: '#pracCard select[data-vd]', plate: '#pracCard [data-pg], #pracCard [data-cc]' };
const ctlSel = (k) => `#v5Float .ic-row[data-k=${k}]`;

// Opens the docked quick controls from the bottom bar, showing sub-step `i` of `it` on the button first.
async function demoQuick(a, it, i = 0) {
  if (!ssBarOn() || !quickFloat.off) return;
  a.show(it, i, DEMO_SEL.tune);
  await a.wait(1400);
  toggleSsTune();
  await a.wait(700);
}

async function demoRecord(a, it, i) {
  a.show(it, i, DEMO_SEL.rec);
  await a.wait(900);
  practiceRecord();
  await a.wait(900);
}

const DEMOS = {
  async bench(a) {
    if (!eqOn() || !assembly) return;
    if (assembly.status().done) { redoAssembly(); await a.wait(500); }
    a.onStop(stopAutoAssemble);
    autoAssemble();
    await a.until(() => {
      const s = assembly.status();
      const it = HELP.bench.find((x) => !(x.id === 'echo' ? s.done : s.steps[x.id]));
      a.cap(it || HELP.bench[HELP.bench.length - 1]);
      return s.done && !autoTimer;
    }, 20000);
    await a.wait(2500);
  },
  async views(a) {
    if (S.selected) select(null);
    for (const it of HELP.views) {
      a.cap(it);
      await (it.id === 'exterior' ? setMode('exterior') : setMode('structure', { view: it.id }));
      await a.wait(3500);
    }
    await setMode('structure', { view: 'cutaway' });
  },
  async parts(a) {
    if (S.mode !== 'exterior' && S.mode !== 'structure') await setMode('structure', { view: 'cutaway' });
    const ids = ['probe__active_element', 'probe__backing', 'probe__wear_face', 'probe__connector'].filter((id) => parts[id] && KB[id]);
    a.onStop(() => { if (S.selected) select(null); });
    for (const id of ids) {
      a.cap(KB[id].name_zh);
      select(id);
      await a.wait(1800);
      if (S.study === 'classroom' && CC[id]) {
        a.cap(KB[id].name_zh, UI.why_buttons.remove);
        setStep(1);
        await a.wait(2500);
        setStep(2);
      }
      for (const tab of ['design_driver', 'principles', 'removal_effects']) {
        a.cap(KB[id].name_zh, UI.card_tabs[tab]);
        setTab(tab);
        await a.wait(2500);
      }
    }
    select(null);
  },
  async scenes(a) {
    const sid = S.scene && SCENES[S.scene].kind !== 'removal' ? S.scene : MAIN_SCENES[0].id;
    a.onStop(() => { if (S.scene && S.playing) setPlaying(false); });
    startScene(sid, 0, 'scenes');
    S.playing = true;
    renderPanel();
    await a.until(() => { a.cap(SCENES[sid].title, curStep()?.title); return !S.playing || S.scene !== sid; }, 180000);
    await a.wait(1500);
  },
  async roles(a) {
    const ids = partsDoc.parts.filter((kb) => REMOVAL_BY_PART[kb.id] && parts[kb.id]).map((kb) => kb.id);
    a.onStop(() => { if (S.scene && S.playing) setPlaying(false); });
    for (const pid of ids) {
      const [sid, i] = REMOVAL_BY_PART[pid];
      startScene(sid, i, 'parts');
      S.playing = false;
      renderPanel();
      const sc = SCENES[sid];
      a.cap(KB[pid].name_zh, sc.kind === 'removal' ? sc.title : sc.steps[i].title);
      const t0 = performance.now();
      await a.until(() => sceneLoops >= LOOPS_PER_STEP && performance.now() - t0 > 2500, 5000);
    }
    sceneHome();
  },
  async lab(a) {
    const [fi, di, dm] = HELP.lab;
    const slide = async (key, from, to, ms, round) => {
      let last = null;
      await a.lerp(from, to, ms, (v) => {
        const r = Math.round(v * round) / round;
        if (r === last) return;
        last = r;
        if (key === 'f') setLabFrequency(r); else setLabDiameter(r);
      });
    };
    a.cap(fi);
    await slide('f', S.labF, LAB.f_min_MHz, 1200, 10);
    await slide('f', LAB.f_min_MHz, LAB.f_max_MHz, 3500, 10);
    await slide('f', LAB.f_max_MHz, LAB.f_default_MHz, 1500, 10);
    a.cap(di);
    await slide('D', S.labD, LAB.D_min_mm, 1200, 2);
    await slide('D', LAB.D_min_mm, LAB.D_max_mm, 3500, 2);
    await slide('D', LAB.D_max_mm, LAB.D_default_mm, 1500, 2);
    a.cap(dm);
    for (const lv of ['low', 'medium', 'high']) { setLabDamping(lv); await a.wait(2000); }
    setLabDamping(LAB.damping_default);
    await a.wait(800);
  },
  async exp(a) {
    const exp = helpExp(S.inspExp.id);
    const E = HELP.exp;
    S.inspPrediction = null;
    runExperiment(exp.id, 0);
    inspTry.n += 1; inspTry.scored = inspTry.n; inspTry.by = 'demo';
    if (S.learning.role !== 'teacher') {
      a.cap(E.predict.do, exp.question);
      await a.wait(2200);
      S.inspPrediction = exp.correct_answer;
      renderInspExp();
      a.cap(E.predict.do, exp.options.find((o) => o.id === exp.correct_answer)?.label);
      await a.wait(2200);
    }
    for (const [i, s] of exp.steps.entries()) {
      runExperiment(exp.id, i);
      a.cap(expStepLabel(s));
      await a.wait(s.action === 'pulse' ? 5000 : 3200);
    }
    a.cap(E.result.do, exp.observation);
    await a.wait(4000);
  },
  async calibrate(a) {
    const P = S.prac, T = CAL_RULES.targets_mm, it = (id) => demoItem('calibrate', id), gate = ctlSel('gate_on');
    a.onStop(stopProbeGlide);
    if (P.specimen !== CAL_RULES.specimen) { setSpecimen(CAL_RULES.specimen); await a.wait(800); }
    const p = probeStart(CAL_RULES.specimen);
    placeProbe(p.x + 60, p.y, { track: false });
    await demoGlide(a, p.x, p.y, 60);
    setInsp('range_mm', 100);
    const rj = it('reject');
    await demoQuick(a, rj);
    a.show(rj, 1, ctlSel('reject_percent'));
    await a.wait(700);
    if (S.insp.reject_percent > 0) await a.lerp(S.insp.reject_percent, 0, 800, (v) => setPracCtl('reject_percent', Math.round(v)));
    await a.wait(1000);
    const g = it('gate');
    a.show(g, 0, gate);
    await a.wait(700);
    if (!S.insp.gate_on) setInsp('gate_on', true);
    await a.wait(900);
    a.show(g, 1, gate);
    await demoGate(a, T.B1 - 5, 10);
    a.show(g, 2, gate);
    await a.wait(1300);
    a.look(g);
    await a.wait(1300);
    const gn = it('gain');
    a.show(gn, 0, gate);
    await a.wait(700);
    await demoGain(a);
    a.look(gn);
    await a.wait(1300);
    const v = it('velocity');
    a.show(v, 0, gate);
    await a.wait(1500);
    a.show(v, 1, gate);
    await demoGate(a, T.B2 - 5, 10);
    await a.wait(1000);
    a.show(v, 2, ctlSel('velocity_m_s'));
    await a.wait(800);
    await a.lerp(S.insp.velocity_m_s, CAL_STATE.velocity_m_s, 1500, (x) => setInsp('velocity_m_s', Math.round(x / 10) * 10));
    a.show(v, 3, ctlSel('velocity_m_s'));
    await a.wait(1300);
    a.look(v);
    await a.wait(1500);
    const z = it('zero');
    a.show(z, 0, gate);
    await demoGate(a, T.B1 - 5, 10);
    a.show(z, 1, ctlSel('zero_us'));
    await a.wait(800);
    await a.lerp(S.insp.zero_us, CAL_STATE.zero_us, 1500, (x) => setPracCtl('zero_us', Math.round(x * 100) / 100));
    a.show(z, 2, ctlSel('zero_us'));
    await a.wait(1200);
    a.look(z);
    await a.wait(1500);
    const r1 = it('rec_b1');
    a.show(r1, 0, gate);
    await demoGain(a);
    await demoRecord(a, r1, 1);
    a.look(r1);
    await a.wait(1200);
    const r2 = it('rec_b2');
    a.show(r2, 0, gate);
    await demoGate(a, T.B2 - 5, 10);
    a.show(r2, 1, gate);
    await demoGain(a);
    await demoRecord(a, r2, 2);
    a.look(r2);
    await a.wait(1800);
  },
  async dac(a) {
    const P = S.prac, it = (id) => demoItem('dac', id), sid = dacSpecimen(), gate = ctlSel('gate_on');
    a.onStop(stopProbeGlide);
    if (P.specimen !== sid) { setSpecimen(sid); await a.wait(800); }
    setInsp('range_mm', 100);
    const sp = it('spec');
    a.show(sp, 0);
    await a.wait(1200);
    a.show(sp, 1);
    await a.wait(1300);
    const rj = it('reject');
    await demoQuick(a, rj);
    a.show(rj, 0, ctlSel('reject_percent'));
    setPracCtl('reject_percent', 0);
    await a.wait(1100);
    const pk = it('peak');
    a.show(pk, 0, ctlSel('peak_memory'));
    await a.wait(800);
    if (!S.insp.peak_memory) setPracCtl('peak_memory', true);
    await a.wait(700);
    a.look(pk);
    await a.wait(1300);
    for (const h of specMan.specimens[sid].holes) {
      if (P.dac.points.some((q) => q.id === h.id)) continue;
      const pos = it(`pos_${h.id}`);
      a.show(pos, 0, DEMO_SEL.hole);
      await a.wait(900);
      findHole();
      await a.wait(100);
      await a.until(() => !tweens.has('probe'), PR.dac.find_hole.glide_ms + 2000);
      a.show(pos, 1);
      await a.wait(1300);
      a.show(it(`gate_${h.id}`), 2, gate);
      await demoGate(a, h.S_mm - 5, 10);
      a.show(it(`gain_${h.id}`), 3, gate);
      await demoGain(a);
      const rec = it(`rec_${h.id}`);
      await demoRecord(a, rec, 4);
      a.look(rec);
      await a.wait(1300);
    }
  },
  async sensitivity(a) {
    const it = (id) => demoItem('sensitivity', id);
    const base = proc.gBase(dacPts());
    if (base == null) return;
    const b = it('base');
    a.show(b, 0, '#pracCard');
    await a.wait(1600);
    await demoQuick(a, b, 1);
    a.show(b, 1, ctlSel('gain_dB'));
    await a.lerp(S.insp.gain_dB, base, 1200, (v) => setInsp('gain_dB', v));
    a.look(b);
    await a.wait(1300);
    const g = it('gain');
    a.show(g, 0, ctlSel('gain_dB'));
    await a.wait(1000);
    setInsp('gain_dB', base + scanPlus());
    await a.wait(800);
    a.look(g);
    await a.wait(1400);
    const r = it('rec');
    await demoRecord(a, r, 0);
    a.look(r);
    await a.wait(1600);
  },
  async scan(a) {
    const P = S.prac, it = (id) => demoItem('scan', id);
    a.glide = 1;
    a.onStop(stopProbeGlide);
    if (!isPlate(P.specimen)) { setSpecimen(onCase() ? CASE_ID : STEP_PRESETS.scan.specimen); await a.wait(800); }
    const sp = specMan.specimens[P.specimen];
    if (P.sens) setInsp('gain_dB', P.sens.scan);
    const X = sp.dims.length.value / 2 - 15, Y = sp.dims.width.value / 2 - 15;
    const grid = [];
    for (let x = -X; x <= X + 1e-6; x += 60) grid.push(Math.round(x));
    const xs = [...new Set([...grid, ...(sp.defects || []).map((d) => d.centre_mm[0])])].sort((p, q) => p - q);
    const best = {};
    let t0 = 0;
    const each = () => {
      const now = performance.now();
      if (now - t0 < 40) return;
      t0 = now;
      drawInspection();
      const c = currentRecordCandidate();
      const p = P.probe[P.specimen];
      if (!c) return;
      const b = (best[c.id] ||= { x: p.x, y0: p.y, y1: p.y });
      if (b.x === p.x) b.y1 = p.y;
    };
    const m = it('move');
    a.show(m, 0);
    await a.wait(1300);
    a.show(m, 2);
    await demoGlide(a, xs[0], -Y, 120);
    let dir = 1;
    for (const x of xs) {
      await demoGlide(a, x, -dir * Y, 120, { track: true });
      await demoGlide(a, x, dir * Y, 60, { track: true, each });
      dir = -dir;
      for (const [id, b] of Object.entries(best)) {
        if (b.tried || P.scan.found.some((f) => f.id === id && f.confirmed)) continue;
        b.tried = true;
        const fl = it('flag');
        a.show(fl, 0);
        await demoGlide(a, b.x, (b.y0 + b.y1) / 2, 80, { track: true });
        a.show(fl, 1);
        await a.wait(1100);
        a.show(fl, 2, DEMO_SEL.rec);
        await a.wait(900);
        markIndication();
        await a.wait(700);
        a.look(fl);
        await a.wait(1300);
        a.show(m, 2);
      }
    }
    await a.wait(1000);
  },
  async quantify(a) {
    const P = S.prac, it = (id) => demoItem('quantify', id);
    a.onStop(() => { quantRun = null; stopProbeGlide(); });
    const list = P.scan.found.filter((f) => f.flags?.length && (S.learning.role === 'teacher' || f.confirmed));
    const todo = list.filter((f) => !P.quant.results[f.id]);
    for (const f of todo.length ? todo : list.slice(0, 1)) {
      a.show(it('target'), 0, DEMO_SEL.target);
      await a.wait(800);
      setQuantTarget(f.id);
      await a.wait(1000);
      const pt = it('points');
      a.show(pt, 0);
      await a.wait(1200);
      a.show(pt, 2);
      await autoQuantify();
      a.check();
      a.look(pt);
      await a.wait(1400);
      a.show(it('result'), 0, '#pracCard');
      await a.wait(1600);
    }
  },
  async evaluate(a) {
    const P = S.prac, E = P.eval, it = (id) => demoItem('evaluate', id), es = evalSpec();
    if (P.specimen !== es) { setSpecimen(es); await a.wait(800); }
    const items = evalItems();
    if (!items.length) return;
    const lv = it('level');
    a.show(lv, 0, DEMO_SEL.level);
    await a.wait(900);
    presetLevel(P);
    if (!E.level) setEval('level', STD.grading.levels[1]);
    await a.wait(700);
    a.show(lv, 1);
    await a.wait(1300);
    const area = plateArea(es);
    const truth = proc.grade(E.level, items, area);
    const vd = it('verdict');
    a.show(vd, 0, DEMO_SEL.verdict);
    await a.wait(900);
    a.show(vd, 1, DEMO_SEL.verdict);
    for (const x of items) { setEval('verdict', [x.id, truth.verdicts[x.id]]); await a.wait(900); }
    a.show(it('plate'), 0, DEMO_SEL.plate);
    await a.wait(800);
    setEval('plate', proc.plateGrade(items, area));
    await a.wait(1000);
    setEval('conclusion', truth.pass ? 'accept' : 'reject');
    await a.wait(1000);
    a.show(it('submit'), 1, DEMO_SEL.rec);
    await a.wait(900);
    submitEval();
    await a.wait(2000);
  },
  async task_learn(a) {
    const id = S.task.id;
    const items = HELP.task_card;
    S.task.step = 'learn';
    const st = taskLearnState(id);
    st.i = 0;
    st.complete = false;
    renderTaskPage();
    for (let i = 0; i < items.length; i++) {
      st.i = i;
      if (!st.done.includes(items[i].id)) st.done.push(items[i].id);
      renderTaskPage();
      await a.wait(2200);
    }
    st.complete = true;
    S.task.step = referenceCardLearning() ? 'card' : 'fill';
    renderTaskPage();
    await a.wait(800);
  },
  async task_card(a) {
    const root = taskPageEl;
    const clear = () => root.querySelectorAll('.demo-on').forEach((n) => n.classList.remove('demo-on'));
    a.onStop(clear);
    for (const f of taskcard.fields()) {
      clear();
      root.querySelector(`.tk-f[data-f="${f.id}"]`)?.classList.add('demo-on');
      const d = root.querySelector(`details[data-f="${f.id}"]`);
      if (d) { d.open = true; d.classList.add('demo-on'); d.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
      await a.wait(2600);
      if (d) d.open = false;
    }
  },
  async task_check(a) {
    const id = S.task.id, t = taskcard.task(id);
    delete S.task.tests[id];
    renderTaskPage();
    const ref = makeReferenceCard(taskcard, t, taskcard.plateThickness(t));
    const st = taskTest(id);
    for (const f of taskcard.fields()) {
      if (f.id === 'level') continue;
      st.raw[f.id] = ref[f.id];
      const input = taskPageEl.querySelector(`.tk-card [name="${f.id}"]`);
      if (input) {
        input.value = String(ref[f.id] ?? '');
        input.closest('.tk-f')?.classList.add('demo-on');
        input.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
      await a.wait(800);
    }
    checkTaskCard();
    await a.wait(2000);
  },
};

// ------------------------------------------------------------------ standard (overlay in practice + full page tab)
const stdCtx = () => ({ t_mm: specT(S.taskOn || onCase() ? CASE_ID : EVAL_SPEC), level: S.prac.eval?.level ?? null });
const stdHead = () => `<div class="sd-code"><b>${esc(stdPack.code)}</b><span>${esc(stdPack.title)}</span></div>`;

function setStd(on, focus = null) {
  S.prac.std = on;
  S.prac.stdFocus = on ? focus : null;
  if (on) S.prac.guide = false;
  stdKey = '';
  guideKey = '';
}

function updateStdBox() {
  stdBtn.classList.toggle('on', S.prac.std);
  stdBox.hidden = !S.prac.std;
  if (!S.prac.std) return;
  const step = S.prac.step;
  const ctx = stdCtx();
  const key = `${step}|${S.prac.stdFocus}|${ctx.level}|${S.study}`;
  if (key === stdKey) return;
  stdKey = key;
  const f = S.prac.stdFocus;
  const ids = stdView.stepIds(step);
  const list = f && !ids.includes(f) ? [f, ...ids] : ids;
  const si = STEP_IDS.indexOf(step);
  stdBox.innerHTML = `<div class="gd-head"><b>${esc(stdDoc.title)}</b><span>${si + 1} ${esc(practiceDoc.steps[si].name)}</span>`
    + `<button class="gd-x" title="${esc(stdDoc.close)}">×</button></div>${stdHead()}`
    + `<div class="sd-list">${list.map((id) => stdView.clauseHtml(id, ctx)).join('')}</div>`
    + `<div class="sd-foot"><button class="sd-all">${esc(stdDoc.all)}</button></div>`;
  if (f) {
    const sec = stdBox.querySelector(`[data-clause="${f}"]`);
    if (sec) {
      sec.classList.add('focus');
      stdBox.scrollTop = Math.max(0, sec.offsetTop - stdBox.querySelector('.gd-head').offsetHeight - 8);
    }
  } else stdBox.scrollTop = 0;
}

function renderStdPage() {
  if (!stdPageEl) {
    stdPageEl = el('section', 'std-page');
    stdPageEl.id = 'stdPage';
    stdPageEl.hidden = true;
    stdPageEl.addEventListener('click', (ev) => {
      const a = ev.target.closest('[data-goto]');
      if (a) stdPageGoto(a.dataset.goto);
    });
    $('stage').appendChild(stdPageEl);
  }
  const ctx = stdCtx();
  const nav = stdView.groups.map((g) => `<div class="sdp-g">${esc(g.name)}</div>`
    + g.items.map((id) => `<button data-goto="${id}"><span class="sd-no">${esc(stdView.clauseNo(id))}</span>${esc(stdDoc.items[id].title)}</button>`).join('')).join('');
  const body = stdView.groups.map((g) => `<h3 class="sdp-gh">${esc(g.name)}</h3>${g.items.map((id) => stdView.clauseHtml(id, ctx)).join('')}`).join('');
  stdPageEl.innerHTML = `<nav class="sdp-nav">${nav}</nav><div class="sdp-main"><div class="sdp-doc">${stdHead()}${body}</div></div>`;
}

function openStdPage(focus = null) {
  closeTaskPage();
  S.stdPage = true;
  renderStdPage();
  stdPageEl.hidden = false;
  document.body.classList.add('std-open');
  renderModes();
  if (focus) stdPageGoto(focus);
  else stdPageEl.querySelector('.sdp-main').scrollTop = 0;
}

function stdPageGoto(id) {
  const main = stdPageEl.querySelector('.sdp-main');
  const sec = stdPageEl.querySelector(`.sd-clause[data-clause="${id}"]`);
  if (!sec) return;
  stdPageEl.querySelectorAll('.sd-clause.focus').forEach((s) => s.classList.remove('focus'));
  sec.classList.add('focus');
  main.scrollTop += sec.getBoundingClientRect().top - main.getBoundingClientRect().top - 16;
}

function closeStdPage() {
  if (!S.stdPage) return;
  S.stdPage = false;
  stdPageEl.hidden = true;
  document.body.classList.remove('std-open');
  renderModes();
}

// ------------------------------------------------------------------ field task (docs/M10_SCOPE.md §2–§4)
const TK = taskDoc;
const taskcard = createTaskcard({ tasks: tasksDoc, standard: stdPack, rules: waveRules, manifest, specimens: specManGlb, thickness: thicknessDoc });
const TASK_PLATE = specManGlb.runtime_specimens.specimen__plate_p02;
let taskPageEl = null;

function taskCard(id) {
  if (!S.task.cards[id]) {
    S.task.context ||= { role: S.learning.role, taskMode: S.learning.taskMode };
    const task = taskcard.task(id);
    const guided = referenceCardLearning();
    const raw = guided ? makeReferenceCard(taskcard, task, taskcard.plateThickness(task)) : { level: task?.level };
    S.task.cards[id] = { raw, card: guided ? { ...raw } : null, confirmed: guided, miss: [], score: null };
  }
  return S.task.cards[id];
}
const taskNo = (id) => TK.task_no.replace('{id}', id);
const levelText = (lv) => practiceDoc.levels[lv] || lv;

function taskBriefRows(t) {
  const d = TASK_PLATE.dims;
  const T = taskcard.plateThickness(t);
  const v = {
    task_id: t.id,
    work_piece: TK.values.work_piece,
    material: TK.values.material,
    size: `${d.length.value} × ${d.width.value} × ${T} ${UI.inspection.unit_mm}`,
    rolling: TASK_PLATE.rolling_direction.replace(/^[+-]/, ''),
    standard: stdPack.code,
    level: levelText(t.level),
  };
  return tasksDoc.brief.fields.map((f) => [TK.brief_fields[f.id], v[f.id]]);
}

function taskTest(id) {
  return S.task.tests[id] ||= { raw: { level: taskcard.task(id)?.level }, card: null, confirmed: false, miss: [], score: null, test: true };
}

function taskDesign(id) {
  S.task.designs ||= {};
  if (!S.task.designs[id]) {
    const task = taskcard.task(id);
    S.task.designs[id] = { raw: { level: task?.level }, card: null, confirmed: false, miss: [], score: null };
  }
  return S.task.designs[id];
}

const designWorking = () => S.learning.route === 'design' || (S.learning.route === 'task' && S.task.step === 'fill');
const designState = (id) => (S.learning.route === 'design' ? taskCard(id) : taskDesign(id));

function taskFieldHtml(f, st, chk = null) {
  const v = st.raw[f.id] ?? '';
  const guidedLock = referenceCardLearning() && S.task.step !== 'fill' && !st.test;
  const dis = st.confirmed || guidedLock || f.id === 'level' ? ' disabled' : '';
  const miss = (st.miss.includes(f.id) ? ' miss' : '') + (chk?.fields[f.id] ? ' ok' : '');
  if (f.input === 'select') {
    const opts = taskcard.options(f.id).map((o) => {
      const text = f.id === 'level' ? levelText(o) : TK.options[f.id][o];
      return `<option value="${esc(o)}"${String(v) === o ? ' selected' : ''}>${esc(text)}</option>`;
    }).join('');
    return `<label class="tk-f${miss}" data-f="${f.id}"><span>${esc(TK.card_fields[f.id])}</span><select name="${f.id}"${dis}><option value="">${esc(PL.no_value)}</option>${opts}</select></label>`;
  }
  return `<label class="tk-f${miss}" data-f="${f.id}"><span>${esc(TK.card_fields[f.id])}</span><input name="${f.id}" inputmode="decimal" autocomplete="off" value="${esc(v)}"${dis}></label>`;
}

const TASK_FIELD_GROUPS = [
  { id: 'probe', fields: ['probe_type', 'frequency_MHz', 'element_mm', 'reference_block'] },
  { id: 'scan', fields: ['edge_zone_mm', 'middle_pattern', 'spacing_mm'] },
  { id: 'sens', fields: ['scan_plus_dB', 'compensation_dB', 'level'] },
];

const taskSeenCount = () => (S.task.seen instanceof Set ? S.task.seen : (S.task.seen = new Set(S.task.seen || []))).size;

function taskLearnState(id) {
  S.task.learn ||= {};
  const st = S.task.learn[id] ||= { i: 0, done: [], complete: false };
  if (!Array.isArray(st.done)) st.done = [];
  if (taskSeenCount() >= 2 && !st.done.includes('other')) st.done.push('other');
  return st;
}

function taskCardStep() {
  return referenceCardLearning() ? 'card' : 'fill';
}

function taskLearnHtml(t) {
  const H = UI.help;
  const items = H.task_card;
  const st = taskLearnState(t.id);
  const i = Math.min(Math.max(0, st.i | 0), items.length - 1);
  st.i = i;
  const it = items[i];
  const last = i >= items.length - 1;
  const nextLabel = last ? H.task_learn_enter : H.task_learn_next;
  const dots = items.map((x, k) => `<i class="${k === i ? 'on' : ''}${st.done.includes(x.id) ? ' done' : ''}"></i>`).join('');
  const demo = `<button type="button" class="tk-demo" data-act="help-demo">${esc(help.run ? H.stop : H.demo)}</button>`;
  return `<div class="tk-learn">`
    + `<div class="tk-learn-head"><b>${esc(H.task_steps.learn)}</b><span>${esc(v4Format(H.task_learn_progress, { i: i + 1, n: items.length }))}</span>${demo}</div>`
    + `<div class="tk-learn-cap"><b>${esc(it.do)}</b><p>${esc(it.page)}</p>${it.why ? `<p class="tk-learn-why">${esc(it.why)}</p>` : ''}</div>`
    + `<div class="tk-learn-dots">${dots}</div>`
    + `<div class="tk-learn-acts">`
    + `<button type="button" data-act="learn-prev"${i === 0 ? ' disabled' : ''}>${esc(H.task_learn_prev)}</button>`
    + `<button type="button" class="primary" data-act="learn-next">${esc(nextLabel)}</button>`
    + `</div></div>`;
}

function taskFormHtml(t, st, chk) {
  const byId = Object.fromEntries(taskcard.fields().map((f) => [f.id, f]));
  const groups = TASK_FIELD_GROUPS.map((g) => {
    const rows = g.fields.map((id) => byId[id]).filter(Boolean).map((f) => taskFieldHtml(f, st, chk)).join('');
    return `<section class="tk-group"><h4>${esc(UI.help.task_groups[g.id])}</h4><div class="tk-fields">${rows}</div></section>`;
  }).join('');
  return `<form class="tk-card${st.confirmed ? ' locked' : ''}" onsubmit="return false">${groups}</form>`;
}

function advanceTaskLearn(dir) {
  const id = S.task.id;
  if (!id || S.task.step !== 'learn') return;
  const items = HELP.task_card;
  const st = taskLearnState(id);
  const i = Math.min(Math.max(0, st.i | 0), items.length - 1);
  if (dir < 0) {
    st.i = Math.max(0, i - 1);
    renderTaskPage();
    return;
  }
  const cur = items[i];
  if (!st.done.includes(cur.id)) st.done.push(cur.id);
  if (i < items.length - 1) {
    st.i = i + 1;
    renderTaskPage();
    return;
  }
  st.complete = true;
  stopDemo();
  S.task.step = taskCardStep();
  renderTaskPage();
}

function renderTaskPage() {
  if (!taskPageEl) {
    taskPageEl = el('section', 'std-page task-page');
    taskPageEl.id = 'taskPage';
    taskPageEl.hidden = true;
    taskPageEl.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-task]');
      if (b) { stopDemo(); openTask(b.dataset.task); return; }
      const ts = ev.target.closest('[data-tstep]');
      if (ts) { setTaskStep(ts.dataset.tstep); return; }
      if (ev.target.closest('[data-act=help-demo]')) { toggleDemo(); return; }
      if (ev.target.closest('[data-act=learn-prev]')) { advanceTaskLearn(-1); return; }
      if (ev.target.closest('[data-act=learn-next]')) { advanceTaskLearn(1); return; }
      if (ev.target.closest('[data-act=task-reset]')) { delete S.task.tests[S.task.id]; renderTaskPage(); return; }
      if (ev.target.closest('[data-act=task-confirm]')) confirmTaskCard();
      if (ev.target.closest('[data-act=task-start]')) startTask();
      if (ev.target.closest('[data-act=task-check]')) checkTaskCard();
      if (ev.target.closest('[data-act=task-edit]') && designWorking()) {
        const card = designState(S.task.id);
        card.confirmed = false; card.score = null; designLog(S.task.id, 'edit'); renderTaskPage();
      }
      if (ev.target.closest('[data-act=design-export]')) exportDesignResult();
      if (ev.target.closest('[data-act=design-print]')) printDesignResult();
    });
    taskPageEl.addEventListener('input', (ev) => {
      const f = ev.target.closest('[name]');
      if (!f || !S.task.id) return;
      if (f.name === 'student-name' || f.name === 'student-no') { if (!licensedStudent()) S.learning.student[f.name === 'student-name' ? 'name' : 'student_no'] = f.value.trim(); return; }
      const test = referenceCardLearning() && S.task.step === 'check';
      const design = designWorking();
      const st = test ? taskTest(S.task.id) : design ? designState(S.task.id) : taskCard(S.task.id);
      if (st.confirmed || (referenceCardLearning() && !test && !design)) return;
      st.raw[f.name] = f.value;
      st.miss = st.miss.filter((x) => x !== f.name);
      f.closest('.tk-f')?.classList.remove('miss', 'ok');
    });
    taskPageEl.addEventListener('toggle', (ev) => {
      const d = ev.target.closest?.('details[data-f]');
      if (d?.open && S.task.id && !help.run) (help.reasons[S.task.id] ||= new Set()).add(d.dataset.f);
    }, true);
    taskPageEl.addEventListener('change', (ev) => {
      const f = ev.target.closest('.tk-card [name]');
      if (!f || !S.task.id || !designWorking() || designState(S.task.id).confirmed) return;
      designLog(S.task.id, 'field', `${TK.card_fields[f.name]}：${cardFieldText(f.name, f.value.trim())}`);
    });
    $('stage').appendChild(taskPageEl);
  }
  const nav = `<div class="sdp-g">${esc(TK.list)}</div>` + taskcard.list().map((t) => {
    const done = S.task.step === 'fill' ? S.task.designs?.[t.id]?.confirmed : S.task.cards[t.id]?.confirmed;
    const cls = [t.id === S.task.id ? 'on' : '', done ? 'done' : ''].filter(Boolean).join(' ');
    return `<button data-task="${t.id}" class="${cls}"><span class="sd-no">${esc(TK.task_no.replace('{id}', t.id))}</span>${esc(levelText(t.level))} · ${taskcard.plateThickness(t)} mm</button>`;
  }).join('');
  const t = taskcard.task(S.task.id);
  let body = '';
  if (t) {
    const guided = referenceCardLearning();
    const designRoute = S.learning.route === 'design';
    const learnDone = taskLearnState(t.id).complete;
    if (S.task.step !== 'learn' && !learnDone) S.task.step = 'learn';
    if (!['learn', 'card', 'check', 'fill'].includes(S.task.step)) S.task.step = 'learn';
    const learnOn = S.task.step === 'learn';
    const H = UI.help;
    const stepKeys = guided ? ['learn', 'card', 'check', 'fill'] : ['learn', 'fill'];
    const steps = `<div class="tk-steps">${stepKeys.map((k) => {
      const locked = k !== 'learn' && !learnDone;
      return `<button type="button" data-tstep="${k}" class="${k === S.task.step ? 'on' : ''}${locked ? ' locked' : ''}"${locked ? ' disabled' : ''}>${esc(H.task_steps[k])}</button>`;
    }).join('')}`
      + (!learnOn && guided && S.task.step !== 'fill' ? `<button type="button" class="tk-demo" data-act="help-demo">${esc(help.run ? H.stop : H.demo)}</button>` : '')
      + `</div>`;
    if (S.task.step === 'learn') {
      body = steps + taskLearnHtml(t);
    } else {
      const test = guided && S.task.step === 'check';
      const design = designWorking();
      const st = test ? taskTest(t.id) : design ? designState(t.id) : taskCard(t.id);
      const chk = (test || (design && st.score)) && st.score ? taskcard.check(st.card, taskcard.plateThickness(t), t.level) : null;
      const brief = taskBriefRows(t).map(([k, v]) => `<div class="tk-kv"><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('');
      const foot = test ? `<div class="tk-foot">${st.score ? `<span class="tk-ok">${esc(v4Format(H.score, { points: +st.score.points.toFixed(1), max: st.score.max }))}</span>`
        : st.miss.length ? `<span class="exam-msg">${esc(TK.need_all)}</span>` : ''}<button type="button" data-act="task-reset">${esc(H.reset)}</button><button type="button" class="primary" data-act="task-check">${esc(H.check)}</button></div>`
        : design ? (st.confirmed ? `<div class="tk-foot"><span class="tk-ok">${esc(V4.design_submitted)} · ${st.score?.total ?? 0} / 100</span><button type="button" data-act="task-edit">${esc(V4.design_edit)}</button><button type="button" data-act="design-export">${esc(V4.design_export)}</button><button type="button" class="primary" data-act="design-print">${esc(assessDoc.report.print)}</button></div>`
          : `<div class="tk-foot">${st.miss.length ? `<span class="exam-msg">${esc(TK.need_all)}</span>` : ''}<button type="button" class="primary" data-act="task-confirm">${esc(V4.design_submit)}</button></div>`)
        : '';
      const reason = test ? st.score ? cardReasonHtml(t, st) : '' : design ? (st.confirmed ? cardReasonHtml(t, st) : '') : guided || st.confirmed ? cardReasonHtml(t, st) : '';
      const identity = design ? `<details class="workflow-boundary"><summary>${esc(V4.design_identity)}</summary>${identityForm()}</details>` : '';
      body = identity + steps
        + `<h3 class="sdp-gh">${esc(TK.brief)}</h3><div class="tk-brief">${brief}</div>`
        + `<h3 class="sdp-gh">${esc(TK.card)}</h3>${taskFormHtml(t, st, chk)}${foot}${reason}`;
    }
  }
  taskPageEl.innerHTML = `<nav class="sdp-nav tk-nav">${nav}</nav><div class="sdp-main"><div class="sdp-doc tk-doc">${body}</div></div>`;
}

function setTaskStep(k) {
  const guided = referenceCardLearning();
  const allowed = guided ? ['learn', 'card', 'check', 'fill'] : ['learn', 'fill'];
  if (!allowed.includes(k) || S.task.step === k) return;
  if (k !== 'learn' && !taskLearnState(S.task.id).complete) return;
  stopDemo();
  S.task.step = k;
  renderTaskPage();
}

function openTask(id) {
  if (!taskcard.task(id) || replayOn()) return false;
  const changed = S.task.id !== id;
  S.task.id = id;
  (S.task.seen instanceof Set ? S.task.seen : (S.task.seen = new Set())).add(id);
  if (changed) {
    emit('task:open', { task_id: id });
    designLog(id, 'open', taskNo(id));
    if (S.task.step !== 'learn') {
      // Already on the card / check / design page: only swap the filled card.
      taskLearnState(id).complete = true;
    } else if (taskLearnState(id).complete) {
      S.task.step = taskCardStep();
    }
  }
  if (S.taskPage) renderTaskPage();
  return true;
}

function confirmTaskCard() {
  const id = S.task.id;
  if (!id || replayOn()) return false;
  const design = S.learning.route === 'design' || S.task.step === 'fill';
  if (referenceCardLearning() && S.task.step !== 'fill') return false;
  const st = S.task.step === 'fill' && S.learning.route !== 'design' ? taskDesign(id) : taskCard(id);
  if (st.confirmed) return false;
  const r = taskcard.parse(st.raw);
  st.miss = r.missing;
  if (!r.ok) { designLog(id, 'missing', r.missing.map((f) => TK.card_fields[f]).join('、')); renderTaskPage(); return false; }
  if (!(r.card.frequency_MHz > 0 && r.card.element_mm > 0 && r.card.spacing_mm > 0 && r.card.edge_zone_mm >= 0)) { designLog(id, 'invalid'); window.alert(WF.invalid_card); return false; }
  st.card = r.card;
  st.confirmed = true;
  if (design) {
    const task = taskcard.task(id);
    const result = taskcard.score(st.card, taskcard.plateThickness(task), task.level);
    st.score = { ...result, total: Math.round(result.points / result.max * 1000) / 10, maxTotal: 100 };
    designLog(id, 'submit', `${st.score.total} / 100`);
    persistDesignResult();
    renderTaskPage();
    return true;
  }
  emit('task:card', { task_id: id, card: { ...r.card } });
  renderTaskPage();
  return true;
}

function openTaskPage() {
  if (!topOpen('task') || replayOn()) return;
  closeStdPage();
  S.taskPage = true;
  renderTaskPage();
  taskPageEl.hidden = false;
  document.body.classList.add('std-open');
  if (!S.task.id) openTask(taskcard.list()[0].id);
  renderModes();
}

function closeTaskPage() {
  if (!S.taskPage) return;
  S.taskPage = false;
  taskPageEl.hidden = true;
  document.body.classList.remove('std-open');
  renderModes();
}

const taskLive = (id) => S.taskRun === id && (S.taskOn || !!S.taskPrac);

// Task run (contracts/tasks.json drive, session): library case plate, calibration and DAC preset, session `task` with the
// card in its header. A run of another task replaces the earlier run; the training context waits as during the exam.
function startTask() {
  if (S.learning.route === 'design' || referenceCardLearning() || selfStudy()) return false;
  const id = S.task.id;
  const st = id && taskCard(id);
  if (!st?.confirmed || !practice || !proc || replayOn()) return false;
  const run = taskLive(id);
  if (!run && S.learning.role !== 'teacher' && (!S.learning.student.name || !S.learning.student.student_no)) { window.alert(WF.need_identity); return false; }
  if (!run && store?.get('task') && !window.confirm(WF.replace_run)) return false;
  const cs = run ? null : taskCaseOf(taskcard.task(id));
  if (!run && (!cs || cs.specimen_id !== CASE_ID)) return false;
  closeTaskPage();
  if (!(S.taskOn && run)) {
    if (S.exam && !S.taskOn) swapContext(false);
    const live = S.mode === 'practice';
    if (live) applyPractice(false);
    if (!S.taskOn) {
      S.pracTrain = S.prac;
      S.caseTrain = S.case;
    }
    if (run) {
      S.prac = S.taskPrac;
      applyCase(S.caseTask);
    } else {
      store?.clear('task');
      S.prac = freshPrac({ exam: true, task: true });
      applyCase(cs);
      freshCasePlate();
      const P = S.prac;
      Object.assign(P, { card: { ...st.card }, asmDone: true, step: STEP_IDS[TASK_FIRST_STEP], specimen: CASE_ID, plateId: CASE_ID });
      fillSteps(STEP_IDS[TASK_FIRST_STEP]);
      Object.assign(P.inst, { velocity_m_s: CAL_STATE.velocity_m_s, zero_us: CAL_STATE.zero_us, specimen_id: CASE_ID, thickness_mm: specT(CASE_ID) });
    }
    S.taskPrac = null;
    S.caseTask = null;
    S.taskRun = id;
    S.taskOn = true;
    S.exam = true;
    if (!run && learningHelpOn()) { S.prac.guide = true; S.prac.cover = true; }
    syncEval();
    if (!run && store) {
      const s = store.begin('task', { ...sessionInit(null), kase: { ...headerCase(), task_id: id, thickness_mm: cs.thickness_mm || specT(CASE_ID), card: { ...st.card } } });
      emit('session:start', { mode: 'task', session_id: s.header.session_id });
      emit('task:card', { task_id: id, card: { ...st.card } });
    }
    if (live) applyPractice(true);
    pushAllMarks();
  }
  if (S.mode !== 'practice') setMode('practice');
  else { renderModes(); renderPanel(); }
  return true;
}

function leaveTask() {
  if (!S.taskOn) return;
  const live = S.mode === 'practice';
  if (live) applyPractice(false);
  practice.setPlan(CASE_ID, null);
  S.taskPrac = S.prac;
  S.caseTask = S.case;
  S.prac = S.pracTrain || freshPrac();
  S.pracTrain = null;
  const c = S.caseTrain;
  S.caseTrain = null;
  if (c) applyCase(c);
  else if (S.case) dropCase();
  S.taskOn = false;
  S.exam = false;
  if (!stepOpen(S.prac.step)) S.prac.step = STEP_IDS[stepReach()];
  if (live) applyPractice(true);
  pushAllMarks();
}

// contracts/tasks.json rubric on the task state and log; stored with the submitted run.
function taskScore() {
  const s = store?.get('task');
  const t = taskcard.task(S.taskRun);
  return taskScoring.score({
    prac: pracToJSON(S.prac),
    events: (s?.log || []).filter((e) => e.kind === 'event'),
    coverage: { [CASE_ID]: coverageOf(CASE_ID).metrics() },
    case: (S.case.thickness_mm && S.case.thickness_mm !== 50 ? thickness().caseGen(S.case.thickness_mm) : caseLib()).scoringContext(S.case),
    card: S.prac.card,
    task: { id: t.id, level: t.level },
    thickness_mm: specT(CASE_ID),
  });
}

function submitTask() {
  const s = store?.get('task');
  if (!s || s.locked) return;
  S.prac.score = taskScore();
  emit('session:submit', { session_id: s.header.session_id, total: S.prac.score.total, max: S.prac.score.max });
  S.prac.submitted = true;
  s.submit(new Date().toISOString());
  store.save('task');
  pushAllMarks();
  renderModes();
  renderPanel();
}

const taskItemName = (id) => TK.rubric[id] || assessDoc.rubric.items[id];
const scoreNum = (v) => (Number.isInteger(v) ? String(v) : v.toFixed(1));

function renderTaskDone() {
  const A = assessDoc.session;
  const R = assessDoc.rubric;
  const s = store?.get('task');
  const box = el('div', 'eq-panel exam-panel exam-done task-done');
  box.appendChild(el('div', 'hero home-hero', `<h2>${esc(`${TK.tab} · ${taskNo(S.taskRun)}`)}</h2><span class="truth">${esc(A.submitted)}</span>`));
  if (s) {
    const rows = [[A.elapsed, fmtDur(s.header.active_ms)], [A.interruptions, String(s.header.interruptions || 0)]];
    box.appendChild(el('div', 'pc-kv exam-kv', rows.map(([k, v]) => `<span>${esc(k)}</span><b>${esc(v)}</b>`).join('')));
  }
  if (practice && s) {
    const sc = (S.prac.score ||= taskScore());
    const rows = sc.items.map((it) => `<tr><td><b>${esc(taskItemName(it.id))}</b></td><td>${scoreNum(it.points)}</td><td>${it.max}</td><td class="sc-${it.status}">${esc(R.status[it.status])}</td></tr>`).join('');
    box.appendChild(el('div', 'exam-score', `<div class="pc-sub">${esc(R.title)}</div><table class="pc-table" id="taskScore"><thead><tr><th>${esc(R.columns.item)}</th><th>${esc(R.columns.points)}</th><th>${esc(R.columns.max)}</th><th>${esc(R.columns.status)}</th></tr></thead>`
      + `<tbody>${rows}</tbody><tfoot><tr><td><b>${esc(R.total)}</b></td><td><b>${scoreNum(sc.total)}</b></td><td>${sc.max}</td><td></td></tr></tfoot></table>`));
  }
  const btns = el('div', 'exam-btns');
  if (practice && s) {
    const rep = el('button', 'primary', esc(A.export_report));
    rep.dataset.act = 'report';
    rep.onclick = () => openTaskReport();
    btns.appendChild(rep);
  }
  if (S.learning.role !== 'exam') {
    const redo = el('button', '', esc(WF.rework));
    redo.onclick = reworkTask; btns.appendChild(redo);
  }
  const exp = el('button', 'primary', esc(A.export_log));
  exp.dataset.act = 'export-log';
  exp.onclick = () => exportSessionLog('task');
  const back = el('button', '', esc(TK.list));
  back.dataset.act = 'task-list';
  back.onclick = () => openTaskPage();
  btns.append(exp, openReplayBtn(), back);
  box.appendChild(btns);
  panel.appendChild(box);
}

// contracts/tasks.json rubric.consistency (report only): scan gain after the sensitivity record against the card target,
// coverage of the card edge zone, share of planned-line samples on swept cells.
function taskConsistency() {
  const P = S.prac;
  const c = P.card;
  const s = store?.get('task');
  const baseG = P.dac.points.length ? P.dac.points[P.dac.points.length - 1].G : PR.acceptance_values.G_base_dB;
  const target = baseG + c.scan_plus_dB + c.compensation_dB;
  let g = s?.header.initial?.inst?.gain_dB ?? null;
  let on = false;
  const gains = [];
  const log = s?.log || [];
  log.forEach((e, i) => {
    if (e.kind === 'key' && e.state?.inst?.gain_dB != null) g = e.state.inst.gain_dB;
    else if (e.kind === 'inst' && e.delta?.gain_dB != null) g = e.delta.gain_dB;
    else if (e.kind === 'event' && e.name === 'practice:sensitivity') on = true;
    else if (e.kind === 'frame' && on && e.specimen_id === CASE_ID) {
      // A recorder tick pushes its frame before its inst delta: that frame already has the new gain.
      const nx = log[i + 1];
      const gf = nx?.kind === 'inst' && nx.delta?.gain_dB != null && nx.t_ms - e.t_ms <= 1 ? nx.delta.gain_dB : g;
      if (gf != null) gains.push(gf);
    }
  });
  const trail = P.plates[CASE_ID].scan.trail;
  const edge = createCoverage({ ...coverageParams({ rules: waveRules, standard: stdPack, specimens: specMan, manifest }, CASE_ID), edge: c.edge_zone_mm }).add(trail).metrics().edge;
  const cov = coverageOf(CASE_ID);
  const plan = taskPlan();
  let n = 0;
  let hit = 0;
  for (const [x0, y0, x1, y1] of plan?.lines || []) {
    const len = Math.hypot(x1 - x0, y1 - y0);
    const k = Math.max(1, Math.round(len / cov.cell));
    for (let i = 0; i <= k; i++) {
      const x = x0 + ((x1 - x0) * i) / k;
      const y = y0 + ((y1 - y0) * i) / k;
      const ci = Math.min(cov.nx - 1, Math.max(0, Math.floor((x + cov.L / 2) / cov.cell)));
      const cj = Math.min(cov.ny - 1, Math.max(0, Math.floor((y + cov.W / 2) / cov.cell)));
      const cell = cj * cov.nx + ci;
      if (!cov.zone[cell]) continue;
      n += 1;
      if (cov.swept[cell]) hit += 1;
    }
  }
  return {
    target,
    gain: gains.length ? [Math.min(...gains), Math.max(...gains)] : null,
    edge,
    lines: n ? hit / n : null,
  };
}

function taskReportModel() {
  const A = assessDoc;
  const RP = A.report;
  const R = A.rubric;
  const RS = practiceDoc.results;
  const LV = practiceDoc.levels;
  const P = S.prac;
  const c = P.card;
  const t = taskcard.task(S.taskRun);
  const h = store?.get('task')?.header || {};
  const mm = UI.inspection.unit_mm;
  const dB = PRD.unit_dB;
  const NA = PL.no_value;
  const f1 = (v) => (Number.isFinite(v) ? (Number.isInteger(v) ? String(v) : v.toFixed(1)) : NA);
  const t0 = h.started_at ? new Date(h.started_at) : null;
  const date = t0 ? `${t0.getFullYear()}-${pad2(t0.getMonth() + 1)}-${pad2(t0.getDate())} ${pad2(t0.getHours())}:${pad2(t0.getMinutes())}` : NA;
  const es = CASE_ID;
  const plate = P.plates[es];
  const sc = (P.score ||= taskScore());
  const pos = (sh) => ` · ${PL.x} ${sh.inst.probe_x_mm.toFixed(0)} · ${PL.y} ${sh.inst.probe_y_mm.toFixed(0)} ${mm}`;

  const T = specT(CASE_ID);
  const chk = taskcard.check(c, T, t.level);
  const ref = chk.reference;
  const kit = taskcard.kit();
  const O = TK.options;
  const range = (r) => (r ? `${r[0]}–${r[1]}` : NA);
  const std = {
    probe_type: ref.probe_type.map((o) => O.probe_type[o]).join(' / '),
    frequency_MHz: range(ref.frequency),
    element_mm: range(ref.element),
    reference_block: O.reference_block[ref.reference_block] ?? NA,
    edge_zone_mm: ref.edge_zone == null ? NA : `≥ ${ref.edge_zone}`,
    middle_pattern: Object.values(O.middle_pattern).join(' / '),
    spacing_mm: `≤ ${ref.scan_plan[c.middle_pattern] ?? ref.scan_plan.lines}`,
    scan_plus_dB: f1(ref.scan_sensitivity),
    compensation_dB: f1(ref.compensation),
    level: levelText(ref.level),
  };
  const E = P.eval;
  const act = {
    probe_type: O.probe_type[kit.probe_type],
    frequency_MHz: f1(kit.frequency_MHz),
    element_mm: f1(kit.element_mm),
    reference_block: O.reference_block[String(c.reference_block)] ?? NA,
    scan_plus_dB: P.sens ? f1(P.sens.scan - P.sens.base - c.compensation_dB) : NA,
    compensation_dB: P.sens ? f1(c.compensation_dB) : NA,
    level: E.level ? levelText(E.level) : NA,
  };
  const cardVal = (f) => (f.id === 'level' ? levelText(c[f.id]) : f.input === 'select' ? O[f.id][c[f.id]] : f1(c[f.id]));
  const cardRows = taskcard.fields().map((f) => [TK.card_fields[f.id], cardVal(f), std[f.id], act[f.id] ?? NA,
    chk.fields[f.id] ? { text: TK.ok, cls: 'ok' } : { text: TK.not_ok, cls: 'ng' }]);

  const k = taskConsistency();
  const pat = O.middle_pattern[c.middle_pattern];
  const consRows = [
    [`${TK.scan_gain} / ${dB}`, f1(k.target), k.gain ? (k.gain[0] === k.gain[1] ? f1(k.gain[0]) : `${f1(k.gain[0])}–${f1(k.gain[1])}`) : NA],
    [TK.card_edge, `${f1(c.edge_zone_mm)} ${mm}`, pct(k.edge)],
    [TK.planned_lines, `${pat} · ${f1(c.spacing_mm)} ${mm}`, k.lines == null ? NA : pct(k.lines)],
  ];

  const sens = {
    caption: A.steps.sensitivity,
    head: ['', `${PRD.G} / ${dB}`],
    rows: [
      [PRD.base, P.sens ? P.sens.base.toFixed(1) : NA],
      [PRD.compensation, f1(c.compensation_dB)],
      [PRD.scan, P.sens ? P.sens.scan.toFixed(1) : NA],
    ],
  };

  const cov = coverageOf(es);
  const m = cov.metrics();
  const OV = COV.overlay;
  const C = A.coverage;
  const LG = RP.legend;
  const D = TASK_DRIVE.overlay;
  const plan = taskPlan();
  const figure = {
    img: coverageImage(cov, {
      trail: plate.scan.trail,
      found: plate.scan.found.map((f, i) => ({ x: f.x, y: f.y, label: String(i + 1) })),
      colors: { ...OV, ...OV.report },
      px: OV.report.px_per_mm,
      maxSeg: COV.max_segment_mm,
      plan: plan ? { ...plan, edge_line: D.edge_line, plan_line: D.plan_line } : null,
    }),
    caption: specHeader(es),
    legend: [
      { color: OV.swept, label: LG.swept }, { color: OV.near, label: LG.near },
      { color: OV.edge_line, label: LG.edge_zone, line: true }, { color: D.edge_line, label: TK.card_edge, line: true },
      { color: D.plan_line, label: TK.planned_lines, line: true }, { color: OV.report.trail, label: LG.trail, line: true },
      { color: OV.report.found, label: LG.found },
    ],
  };

  const shotKeys = ['scan', ...plate.scan.found.map((f) => `quantify:${f.id}`)];
  const caption = (key, sh) => {
    const [step, id] = key.split(':');
    if (step === 'scan') return `${A.steps.scan} · ${defName(plate.scan.found[0].id, es)}${pos(sh)}`;
    return `${A.steps.quantify} · ${defName(id, es)}${pos(sh)}`;
  };
  const images = shotKeys.filter((key) => P.shots[key]).map((key) => ({ img: shotImage(P.shots[key]), caption: caption(key, P.shots[key]) }));

  const qrows = plate.scan.found.filter((f) => plate.quant.results[f.id]).map((f) => {
    const r = plate.quant.results[f.id];
    return [defName(f.id, es), r.length.toFixed(1), r.area.toFixed(0), r.eq == null ? NA : fmtDb(r.eq)];
  });
  const items = evalItems();
  const erows = items.map((it) => [defName(it.id, es), it.length == null ? NA : it.length.toFixed(1), it.S_mm2 == null ? NA : it.S_mm2.toFixed(0),
    it.D_dB == null ? NA : fmtDb(it.D_dB), E.verdicts[it.id] ? practiceDoc.verdicts[E.verdicts[it.id]] : NA]);
  const rt = refTable(es, t.level, plate.scan.found);
  const rrows = rt.rows.map((r) => (r.hit ? r.cells : [{ text: r.cells[0], cls: 'ng' }, ...r.cells.slice(1)]));
  const calls = (E.result?.false_calls || []).map((id) => defName(id, es));
  const srows = sc.items.map((it) => [taskItemName(it.id), scoreNum(it.points), String(it.max), { text: R.status[it.status], cls: `sc-${it.status}` }]);

  return {
    title: TK.report,
    meta: [[WF.name, h.student?.name || NA], [WF.number, h.student?.student_no || NA], [TK.brief_fields.task_id, taskNo(t.id)], [RP.date, date], [A.session.elapsed, fmtDur(h.active_ms)], [A.session.interruptions, String(h.interruptions || 0)]],
    sections: [
      { title: TK.brief, parts: [{ kv: taskBriefRows(t) }] },
      { title: TK.card, cls: 'rp-card', parts: [{ table: { head: ['', TK.columns.card, TK.columns.standard, TK.columns.actual, ''], rows: cardRows } }] },
      { title: TK.consistency, parts: [{ table: { head: ['', TK.columns.card, TK.columns.actual], rows: consRows } }] },
      { title: RP.readings, parts: [{ tables: [sens] }] },
      { title: RP.coverage, parts: [{ figure }, { kv: [[C.edge, pct(m.edge)], [C.middle, pct(m.middle)], [C.whole, pct(m.whole)], ...qualityRows(es)] }] },
      { title: RP.ascan, cls: 'rp-ascan', parts: images.length ? [{ images }] : [{ kv: [[RP.ascan, NA]] }] },
      { title: RP.quantify, parts: [qrows.length ? { table: { head: ['', `${RS.length} / ${RS.unit_mm}`, `${RS.area} / ${RS.unit_mm2}`, RS.equivalent], rows: qrows } } : { kv: [[RS.title, NA]] }] },
      {
        title: RP.evaluate,
        parts: [
          { kv: [[PL.level, E.level ? LV[E.level] : NA]] },
          ...(erows.length ? [{ table: { head: ['', `${RS.length} / ${RS.unit_mm}`, `S / ${RS.unit_mm2}`, `D / ${dB}`, PL.verdict], rows: erows } }] : []),
          { kv: [[PL.plate_grade, E.plate ? LV[E.plate] : NA], [PL.conclusion, E.conclusion ? (E.conclusion === 'accept' ? PL.accept : PL.reject) : NA],
            [WF.self_consistent, sc.self_consistent == null ? NA : sc.self_consistent ? RP.yes : RP.no],
            [WF.missed, (E.result?.missed || []).length ? E.result.missed.map((id) => indName(id)).join(' / ') : WF.missed_none],
            [CASE_TEXT.false_call, calls.length ? calls.join(' / ') : NA]] },
        ],
      },
      {
        title: `${CASE_TEXT.reference} · ${levelText(t.level)}`,
        parts: [
          ...(rrows.length ? [{ table: { head: rt.head, rows: rrows } }] : []),
          { kv: [[PL.plate_grade, LV[rt.plate]], [PL.conclusion, rt.pass == null ? NA : rt.pass ? PL.accept : PL.reject]] },
        ],
      },
      { title: RP.score, parts: [{ table: { head: [R.columns.item, R.columns.points, R.columns.max, R.columns.status], rows: srows, foot: [R.total, scoreNum(sc.total), String(sc.max), ''] } }] },
    ],
  };
}

function openTaskReport() {
  if (!S.taskOn || !S.prac.submitted || !practice || !wave || !proc) return null;
  return openReport(taskReportModel(), {
    printLabel: assessDoc.report.print,
    closeLabel: assessDoc.report.close,
    onPrint: () => emit('session:export', { kind: 'report' }),
  });
}

document.addEventListener('click', (ev) => {
  const c = ev.target.closest('.std-chip');
  if (c) { ev.stopPropagation(); setStd(true, c.dataset.std); }
});

function renderPracRead() {
  const box = $('pracRead');
  if (!box) return;
  const gr = lastGate;
  const e = gr && gr.echo;
  const sat = !!e && e.pct > CLIP_PCT;
  const mm = UI.inspection.unit_mm;
  const d = gateDac(gr);
  const cell = (k, v) => `<span>${esc(k)}</span><b>${esc(v)}</b>`;
  let html = `<div class="pr-vals">${cell(PRD.S, gr && gr.s != null ? `${gr.s.toFixed(1)} ${mm}` : PL.no_value)}`
    + cell(PRD.H, gr ? (sat ? PL.saturated : `${gr.h.toFixed(0)}%`) : PL.no_value)
    + cell(PRD.f1_dac, d == null ? PL.no_value : sat ? PL.saturated : fmtDb(d)) + '</div>';
  const c = S.prac.crit;
  if (c) html += `<div class="pr-crit">${Object.entries(practiceDoc.criteria).map(([k, v]) => `<i class="${c.flags.includes(k) ? 'on' : ''}">${esc(v)}</i>`).join('')}</div>`;
  if (S.prac.step === 'scan') {
    const candidate = currentRecordCandidate();
    const reading = candidate ? `${WF.ready_record} · S ${candidate.S.toFixed(1)} ${mm} · H ${candidate.H.toFixed(0)}%${candidate.saturated ? ` · ${PL.saturated}` : ''}`
      : S.insp.gate_on ? WF.no_visible : WF.gate_required;
    html += `<p class="workflow-note record-preview">${esc(reading)}</p>`;
  }
  if (box.innerHTML !== html) box.innerHTML = html;
}

function syncCritChips() {
  inspKey = '';
}

function renderStepCard() {
  const box = $('pracCard');
  if (!box) return;
  const P = S.prac;
  const step = P.step;
  const mm = UI.inspection.unit_mm;
  const dB = PRD.unit_dB;
  const NA = PL.no_value;
  const title = practiceDoc.steps.find((s) => s.id === step).name;
  const table = (head, rows) => `<table class="pc-table"><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table>`;
  const mark = (ok) => (ok == null || !learningHelpOn() ? '<td></td>' : `<td class="${ok ? 'ok' : 'ng'}">${esc(ok ? PL.ok : PL.out_of_tol)}</td>`);
  const kv = (items) => `<div class="pc-kv">${items.map(([k, v, cls]) => `<span>${esc(k)}</span><b class="${cls || ''}">${esc(v)}</b>`).join('')}</div>`;
  let body = '';
  const btns = [];
  if (step === 'calibrate') {
    const rows = Object.entries(CAL_RULES.targets_mm).map(([k, v]) => {
      const r = P.calib.points[k];
      return `<tr><td><b>${k}</b></td><td>${v.toFixed(1)}</td><td>${r == null ? NA : r.toFixed(2)}</td>${mark(r == null ? null : Math.abs(r - v) <= CAL_RULES.ui_tolerance_mm + 1e-9)}</tr>`;
    }).join('') + (() => {
      const T = CAL_RULES.targets_mm;
      const pts = P.calib.points;
      const both = pts.B1 != null && pts.B2 != null;
      return `<tr><td><b>${esc(PL.interval)}</b></td><td>${(T.B2 - T.B1).toFixed(1)}</td><td>${both ? (pts.B2 - pts.B1).toFixed(2) : NA}</td>${mark(both ? proc.calibIntervalOk(pts) : null)}</tr>`;
    })();
    body = `<div class="pc-sub">${esc(PL.calib_points)}</div>` + table(['', `${PL.target} / ${mm}`, `${PL.reading} / ${mm}`, ''], rows);
    btns.push([PL.record, practiceRecord, 'primary']);
  } else if (step === 'dac') {
    const rows = specMan.specimens[PR.dac.specimen].holes.map((h) => {
      const p = P.dac.points.find((q) => q.id === h.id);
      return `<tr><td><b>Φ${h.diameter_mm}</b></td><td>${h.S_mm.toFixed(0)}</td><td>${p ? p.S.toFixed(1) : NA}</td><td>${p ? p.G.toFixed(1) : NA}</td>${mark(p ? true : null)}</tr>`;
    }).join('');
    body = `<div class="pc-sub">${esc(PL.dac_points)}</div>` + table(['', `S / ${mm}`, `${PL.reading} / ${mm}`, `${PRD.G} / ${dB}`, ''], rows);
    btns.push([PL.record, practiceRecord, 'primary'], [PL.find_hole, findHole, 'find-hole'], [PL.xray, toggleXray, P.xray ? 'xray on' : 'xray']);
  } else if (step === 'sensitivity') {
    const base = proc.gBase(P.dac.points);
    body = kv([
      [PRD.base, base == null ? NA : `${base.toFixed(1)} ${dB}`],
      [PRD.compensation, `${S.taskOn ? taskComp() : STD.compensation.default_dB} ${dB}`],
      [PRD.scan, P.sens ? `${P.sens.scan.toFixed(1)} ${dB}` : NA, P.sens ? 'ok' : ''],
    ]);
    btns.push([PL.record, practiceRecord, 'primary']);
  } else if (step === 'scan') {
    const counted = specMan.specimens[P.plateId].indication_count_shown;
    const tag = plateTag();
    const rows = P.scan.found.map((f, i) => `<tr><td><b>${esc(tag)} ${i + 1}</b><small>${esc(f.confirmed ? WF.recorded : WF.demo_record)}</small></td><td>${f.x.toFixed(0)}</td><td>${f.y.toFixed(0)}</td><td>${f.S == null ? NA : f.S.toFixed(1)}</td><td>${f.H == null ? NA : f.H.toFixed(0)}${f.H == null ? '' : '%'}</td><td>${f.flags.length ? f.flags.map((k) => esc(practiceDoc.criteria[k])).join(' · ') : esc(PL.marked)}</td></tr>`).join('');
    const n = P.scan.found.length;
    body = kv([[PL.found, counted && !S.exam ? PL.count_format.replace('{total}', String(specMan.specimens[P.plateId].defects.length)).replace('{n}', String(n)) : String(n)]]) + (rows ? table(['', PL.x, PL.y, `S / ${mm}`, 'H', ''], rows) : '');
    btns.push([PL.mark, markIndication, 'primary']);
    body += `<p class="workflow-note">${esc(WF.student_record)}</p>`;
    btns.push([`${PL.clear} ${PL.trail}`, () => { clearTrail(); renderPracState(); }, ''], [PL.xray, toggleXray, P.xrayPlate ? 'xray on' : 'xray']);
  } else if (step === 'quantify') {
    const t = P.quant.target;
    const cluster = !!t && typeOf(t) === 'cluster';
    const targets = P.scan.found.map((f, i) => (f.flags.length ? `<button data-def="${f.id}" class="${f.id === t ? 'on' : ''}"${quantRun ? ' disabled' : ''}>${esc(plateTag())} ${i + 1}${systemQuant() && P.quant.results[f.id] ? ' ✓' : ''}</button>` : '')).join('');
    const pts = (t && P.quant.pts[t]) || [];
    const rows = pts.map((p, i) => `<tr><td>${i + 1}</td><td>${p[0].toFixed(1)}</td><td>${p[1].toFixed(1)}</td></tr>`).join('');
    const eq = t && P.quant.eq[t];
    const R = practiceDoc.results;
    const subs = (cluster && P.quant.subs[t]) || [];
    const blocks = subs.length ? `<div class="pc-sub">${esc(PL.block)}</div>` + table(['', `${R.length} / ${R.unit_mm}`, `${R.area} / ${R.unit_mm2}`], subs.map((s, i) => {
      const r = proc.rect(s);
      return `<tr><td>${i + 1}</td><td>${r.length.toFixed(1)}</td><td>${r.area.toFixed(0)}</td></tr>`;
    }).join('')) : '';
    body = `<div class="pc-targets">${targets || `<span>${esc(NA)}</span>`}</div>` + blocks
      + `<div class="pc-sub">${esc(PL.boundary)} ${pts.length}${cluster ? ` · ${PL.block} ${subs.length + 1}` : ''}</div>` + (rows ? table(['', `${PL.x} / ${mm}`, `${PL.y} / ${mm}`], rows) : '')
      + kv([[R.equivalent, eq ? R.equivalent_format.replace('{sign}', eq.dB >= 0 ? '+' : '−').replace('{value}', Math.abs(eq.dB).toFixed(1)) : NA], [PRD.depth, eq ? `${eq.S.toFixed(1)} ${mm}` : NA]]);
    const res = Object.entries(P.quant.results);
    if (res.length) {
      const jm = (r, k) => (k in r.judge && learningHelpOn() ? `<em class="${r.judge[k] ? 'ok' : 'ng'}">${esc(r.judge[k] ? PL.result_ok : PL.result_ng)}</em>` : '');
      const sum = (r) => (r.blocks ? `<em class="${r.merged ? 'ok' : 'ng'}">${esc(r.merged ? `${PL.merged} · ${PL.sum_area}` : PL.no_value)}</em>` : '');
      const rrows = res.map(([id, r]) => `<tr><td><b>${esc(defName(id))}</b></td><td>${r.length.toFixed(1)}${jm(r, 'length')}</td><td>${r.area.toFixed(0)}${jm(r, 'area')}${sum(r)}</td><td>${r.eq == null ? NA : fmtDb(r.eq)}${jm(r, 'equivalent')}</td></tr>`).join('');
      body += `<div class="pc-sub">${esc(R.title)}</div>` + table(['', `${R.length} / ${R.unit_mm}`, `${R.area} / ${R.unit_mm2}`, R.equivalent], rrows);
    }
    if (systemQuant()) btns.push([PL.run_quantify, autoQuantify, quantRun ? 'primary busy' : 'primary']);
    else {
      btns.push([PL.record_boundary, practiceRecord, 'primary'], [PL.undo, undoBoundary, '']);
      if (cluster) btns.push([PL.next_block, nextBlock, '']);
      btns.push([PL.record_eq, recordEq, '']);
    }
    btns.push([PL.xray, toggleXray, P.xrayPlate ? 'xray on' : 'xray']);
  } else if (step === 'evaluate') {
    const E = P.eval;
    if (S.taskOn) E.level = P.card.level;
    presetLevel(P);
    const G = { ...PR.grading, plate_area_m2: plateArea(evalSpec()) };
    const GS = STD.grading;
    const phi = `Φ${STD.reference_block.phi_mm}`;
    const items = evalItems();
    const es = evalSpec();
    const onC = es === CASE_ID;
    const total = specMan.specimens[es].defects.length;
    const res = S.exam ? null : E.result;
    const LV = practiceDoc.levels;
    const VD = practiceDoc.verdicts;
    const seg = (attr, list, cur) => `<div class="pc-targets">${list.map(([k, v]) => `<button data-${attr}="${k}" class="${k === cur ? 'on' : ''}">${esc(v)}</button>`).join('')}</div>`;
    body = kv([[PL.found, S.exam || onC ? String(items.length) : PL.count_format.replace('{total}', String(total)).replace('{n}', String(items.length))], [PL.plate_area, `${G.plate_area_m2} m²`]])
      + `<div class="pc-sub">${esc(PL.level)}${stdChip('grading')}</div>` + seg('lv', (S.taskOn || detectionTraining() ? [E.level] : GS.levels).map((k) => [k, LV[k]]), E.level);
    if (E.level) {
      const L = GS.table[E.level];
      const n = (L.max_count_per_m2 * G.plate_area_m2) / GS.count_area_m2;
      body += kv([
        [PL.limit_max, `S ≤ ${L.max_S_mm2} mm²${L.max_D_dB != null ? ` · D ≤ ${phi} +${L.max_D_dB} ${dB}` : ''}`],
        [PL.limit_count, `${L.count_S_mm2[0]} < S ≤ ${L.count_S_mm2[1]} mm²${L.count_D_dB ? ` · ${phi} ${L.count_D_dB[0] ? `+${L.count_D_dB[0]} ${dB} ` : ''}< D ≤ ${phi} +${L.count_D_dB[1]} ${dB}` : ''}`],
        [PL.limit_n, `${L.max_count_per_m2} × ${G.plate_area_m2} = ${Number(n.toFixed(2))}`],
      ]);
    }
    const R = practiceDoc.results;
    const opts = (id) => `<select data-vd="${id}" data-tip="vd:${id}"><option value="">${esc(NA)}</option>${G.verdicts.map((v) => `<option value="${v}"${E.verdicts[id] === v ? ' selected' : ''}>${esc(VD[v])}</option>`).join('')}</select>`;
    const rows = items.map((it, i) => {
      const okv = res ? res.ok[it.id] : null;
      const name = `${PL.indication} ${i + 1}${res ? ` · ${indName(it.id)}` : ''}`;
      const vb = detectionTraining() && E.level ? verdictBands(E.level, it) : null;
      const use = (q) => (vb?.q === q ? ' class="use"' : '');
      return `<tr${vb ? ' class="has-lim"' : ''}><td><b>${esc(name)}</b></td><td>${it.length == null ? NA : it.length.toFixed(1)}</td><td${use('S')}>${it.S_mm2 == null ? NA : it.S_mm2.toFixed(0)}</td><td${use('D')}>${it.D_dB == null ? NA : `${it.D_dB >= 0 ? '+' : '−'}${Math.abs(it.D_dB).toFixed(1)}`}</td>`
        + `<td class="${okv == null ? '' : okv ? 'ok' : 'ng'}">${opts(it.id)}${okv === false ? `<em class="ng">${esc(PL.expected)} ${esc(VD[res.truth.verdicts[it.id]])}</em>` : ''}</td></tr>`
        + (vb ? `<tr class="pc-lim"><td colspan="5">${esc(vb.text)}</td></tr>` : '');
    }).join('');
    if (rows) body += table(['', `${R.length} / ${R.unit_mm}`, `S / ${R.unit_mm2}`, `D / ${dB}`, PL.verdict], rows);
    body += `<div data-tip="pg"><div class="pc-sub">${esc(PL.plate_grade)}</div>` + seg('pg', [...GS.levels, GS.fail_level].map((k) => [k, LV[k]]), E.plate) + '</div>'
      + `<div data-tip="cc"><div class="pc-sub">${esc(PL.conclusion)}</div>` + seg('cc', [['accept', PL.accept], ['reject', PL.reject]], E.conclusion) + '</div>';
    if (res) {
      const handle = items.filter((it) => res.truth.verdicts[it.id] === 'exceed').map((it) => defName(it.id, es));
      body += kv([
        ...(res.missed?.length ? [[PL.found, PL.need_all, 'ng']] : []),
        ...(res.false_calls?.length ? [[CASE_TEXT.false_call, res.false_calls.map((id) => defName(id, es)).join(' / '), 'ng']] : []),
        [PL.counted_n, `${res.truth.counted} / ${Number(res.truth.maxCount.toFixed(2))}`],
        [PL.plate_grade, res.plate ? LV[E.plate] : `${LV[E.plate]} · ${PL.expected} ${LV[res.grade]}`, res.plate ? 'ok' : 'ng'],
        [PL.conclusion, res.conclusion ? (E.conclusion === 'accept' ? PL.accept : PL.reject) : `${PL.expected} ${res.concl === 'accept' ? PL.accept : PL.reject}`, res.conclusion ? 'ok' : 'ng'],
        [PL.must_handle, handle.length ? handle.join(' · ') : PL.no_value, handle.length ? 'ng' : ''],
        ['', res.correct ? PL.correct : PL.wrong, res.correct ? 'ok' : 'ng'],
      ]);
      if (onC && S.caseRef) body += caseRefHtml(E.level);
    }
    btns.push([PL.submit, submitEval, 'primary'], [PL.xray, toggleXray, P.xrayPlate ? 'xray on' : 'xray']);
    if (onC && res) btns.push([CASE_TEXT.reference, toggleCaseRef, S.caseRef ? 'case-ref on' : 'case-ref']);
    if (res && S.learning.route === 'fullscan' && teacherAccess()) btns.push([assessDoc.session.export_report, openTrainingReport, 'primary']);
  }
  if ((step === 'scan' || step === 'quantify' || step === 'evaluate') && learningHelpOn()) {
    if (P.cover && isPlate(P.specimen)) body += `<div class="pc-sub">${esc(assessDoc.coverage.title)}</div><div class="pc-kv pc-cov" id="pcCov">${covKv(P.plateId)}</div>`;
    btns.push([assessDoc.coverage.toggle, toggleCoverage, P.cover ? 'cov on' : 'cov']);
  }
  btns.push([PL.redo, redoStep, '']);
  if (presetsOn()) btns.push([WF.load_demo, loadStepDemo, 'demo-load']);
  if (S.learning.route === 'calibration' && step === 'sensitivity' && P.done.sensitivity) btns.push([WF.continue_fullscan, () => launchLearning({ role: S.learning.role || 'student', route: 'fullscan' }), 'primary']);
  box.innerHTML = `<div class="pc-head"><b>${esc(title)}</b>${P.done[step] ? `<span class="pc-done">${esc(PL.done)}</span>` : ''}</div>${body}<div class="pc-btns"></div>`;
  const bb = box.querySelector('.pc-btns');
  for (let [label, fn, cls] of btns) {
    if (!learningHelpOn() && /xray|find-hole|cov/.test(cls)) continue;
    if (selfStudy() && step === 'quantify' && label === PL.record_boundary) label = V4.measure_boundary;
    if (selfStudy() && step === 'quantify' && label === PL.record_eq) label = V4.measure_equivalent;
    if (selfStudy() && step === 'evaluate' && label === PL.submit) label = V4.check_evaluation;
    const b = el('button', cls, esc(label));
    b.disabled = /busy/.test(cls);
    b.onclick = () => fn();
    bb.appendChild(b);
  }
  const acts = $('scopeActs');
  if (acts) {
    acts.replaceChildren();
    const quick = step === 'scan' ? [[PL.mark, markIndication]]
      : step === 'quantify' && systemQuant() ? [[PL.run_quantify, autoQuantify]]
      : step === 'quantify' ? [[selfStudy() ? V4.measure_boundary : PL.record_boundary, practiceRecord], [selfStudy() ? V4.measure_equivalent : PL.record_eq, recordEq]] : [];
    for (const [label, fn] of quick) {
      const b = el('button', 'scope-act', esc(label));
      b.type = 'button';
      b.disabled = !!quantRun;
      b.onclick = () => fn();
      acts.appendChild(b);
    }
  }
  box.querySelectorAll('button[data-def]').forEach((b) => { b.onclick = () => setQuantTarget(b.dataset.def); });
  box.querySelectorAll('button[data-lv]').forEach((b) => { b.onclick = () => setEval('level', b.dataset.lv); });
  box.querySelectorAll('button[data-pg]').forEach((b) => { b.onclick = () => setEval('plate', b.dataset.pg); });
  box.querySelectorAll('button[data-cc]').forEach((b) => { b.onclick = () => setEval('conclusion', b.dataset.cc); });
  box.querySelectorAll('select[data-vd]').forEach((s) => { s.onchange = () => setEval('verdict', [s.dataset.vd, s.value]); });
}

function inspControls({ practice: prac = false } = {}) {
  const L = UI.inspection;
  const C = waveRules.controls;
  const box = el('div', 'insp-ctrls');
  box.id = 'inspCtrls';
  const floating = prac && floatControls();
  if (floating) {
    box.classList.add('v5-quick-controls');
    box.appendChild(el('h3', 'v5-control-title', esc(V5.controls_title)));
  }
  const sc = INSP_SCENES[S.insp.scene];
  const classroom = S.study === 'classroom';
  const CLASSROOM_KEEP = ['gain_dB', 'range_mm', 'velocity_m_s', 'coupling', 'gate_on'];
  const PRACTICE_SKIP = ['coupling', 'damping', 'defect_depth_mm'];
  const row = (key, name, ...kids) => {
    if (prac && PRACTICE_SKIP.includes(key)) return;
    if (prac && detectionTraining() && !['gain_dB', 'gate_on', 'peak_memory', 'dac_alarm_enabled', 'probe_move'].includes(key)) return;
    if (!prac && classroom && !CLASSROOM_KEEP.includes(key) && !sc.adjustable.includes(key)) return;
    const r = el('div', `ic-row${sc.adjustable.includes(key) ? ' key' : ''}`);
    r.dataset.k = key;
    r.appendChild(el('div', 'ic-name', esc(name)));
    const body = el('div', 'ic-body');
    body.append(...kids);
    r.appendChild(body);
    box.appendChild(r);
  };
  const seg = (key, options, cls = '') => {
    const g = el('div', `ic-seg ${cls}`);
    for (const [v, label] of options) {
      const b = el('button', '', label);
      b.dataset.k = key;
      b.dataset.v = String(v);
      const d = C[key].default;
      b.onclick = () => setInsp(key, typeof d === 'number' ? Number(v) : typeof d === 'boolean' ? v === true : v);
      g.appendChild(b);
    }
    return g;
  };
  const slider = (key) => {
    const c = C[key];
    const i = el('input');
    i.type = 'range';
    i.dataset.k = key;
    Object.assign(i, { min: String(c.min), max: String(c.max), step: String(c.step) });
    i.oninput = () => setInsp(key, parseFloat(i.value), { silent: true });
    i.onchange = () => setInsp(key, parseFloat(i.value));
    return i;
  };

  const gain = el('div', 'ic-gain');
  const step = (d) => {
    const b = el('button', 'ic-step', `${d > 0 ? '+' : '−'}${Math.abs(d)}`);
    b.onclick = () => setInsp('gain_dB', S.insp.gain_dB + d);
    return b;
  };
  const [m6, m1, p1, p6] = C.gain_dB.buttons.map(step);
  const gv = el('span', 'ic-val');
  gv.id = 'inspGainVal';
  gain.append(m6, m1, gv, p1, p6);

  if (sc.adjustable.includes('defect_depth_mm')) {
    const dd = el('div', 'ic-vel');
    const dv = el('span', 'ic-val');
    dv.id = 'inspDepthVal';
    dd.append(slider('defect_depth_mm'), dv);
    row('defect_depth_mm', L.defect_depth, dd);
    box.lastChild?.classList.add('wide');
  }
  const gainReset = el('div', 'v5-gain-reset');
  if (prac && detectionTraining()) {
    for (const [kind, text] of [['scan', V5.restore_scan], ['base', V5.restore_base]]) {
      const b = el('button', 'ic-step', esc(text)); b.dataset.restore = kind;
      b.onclick = () => restoreDetectionGain(kind); gainReset.appendChild(b);
    }
  }
  row('gain_dB', L.gain, gain, slider('gain_dB'), gainReset);

  row('range_mm', L.range, seg('range_mm', C.range_mm.presets.map((v) => [v, `${v}`])));

  const vel = el('div', 'ic-vel');
  const vv = el('span', 'ic-val');
  vv.id = 'inspVelVal';
  vel.append(slider('velocity_m_s'), vv);
  const nudge = (d, fn, text) => {
    const b = el('button', 'ic-step', text);
    b.onclick = () => fn(d);
    return b;
  };
  const nudges = (list, fn, fmt, valId) => {
    const g = el('div', 'ic-gain');
    const half = list.length / 2;
    const val = el('span', 'ic-val');
    if (valId) val.id = valId;
    g.append(...list.slice(0, half).map((d) => nudge(d, fn, fmt(d))), ...(valId ? [val] : []), ...list.slice(half).map((d) => nudge(d, fn, fmt(d))));
    return g;
  };
  const sgn = (d, digits = 0) => `${d > 0 ? '+' : '−'}${Math.abs(d).toFixed(digits)}`;
  if (prac) {
    const VA = CAL_RULES.velocity_adjust;
    row('velocity_m_s', L.velocity, vel, nudges([-VA.side_m_s, -VA.encoder_m_s, VA.encoder_m_s, VA.side_m_s], (d) => setInsp('velocity_m_s', S.insp.velocity_m_s + d), (d) => sgn(d)));
  } else {
    const presets = seg('velocity_m_s', C.velocity_m_s.presets.map((v) => {
      const name = inspDoc.velocity_presets[String(v)];
      return [v, `<b>${v}</b>${name ? `<small>${esc(name)}</small>` : ''}`];
    }), 'ic-presets');
    row('velocity_m_s', L.velocity, vel, presets);
  }

  if (prac) {
    const ZA = CAL_RULES.zero_adjust;
    const pslider = (key) => {
      const c = PRAC_CTL[key];
      const i = el('input');
      i.type = 'range';
      i.dataset.k = key;
      Object.assign(i, { min: String(c.min), max: String(c.max), step: String(c.step) });
      i.oninput = () => setPracCtl(key, parseFloat(i.value), { silent: true });
      i.onchange = () => setPracCtl(key, parseFloat(i.value));
      return i;
    };
    const pseg = (key, fn) => {
      const g = el('div', 'ic-seg');
      for (const v of [true, false]) {
        const b = el('button', '', esc(v ? PL.on : PL.off));
        b.dataset.k = key;
        b.dataset.v = String(v);
        b.onclick = () => fn(v);
        g.appendChild(b);
      }
      return g;
    };
    row('zero_us', PANEL.fn.zero, nudges([-ZA.side_us, -ZA.encoder_us, ZA.encoder_us, ZA.side_us], (d) => setPracCtl('zero_us', S.insp.zero_us + d), (d) => sgn(d, 2), 'inspZeroVal'), pslider('zero_us'));
    const rj = el('div', 'ic-vel');
    const rv = el('span', 'ic-val');
    rv.id = 'inspRejVal';
    rj.append(pslider('reject_percent'), rv);
    row('reject_percent', PANEL.fn.reject, rj);
    const pk = el('div', 'ic-pk');
    pk.append(pseg('peak_memory', (v) => setPracCtl('peak_memory', v)), el('span', 'ic-gl', esc(PL.dac)), pseg('dac_show', (v) => setDacShow(v)));
    row('peak_memory', PL.peak, pk);
    if (detectionTraining()) {
      const status = el('span', 'v5-alarm-status', esc(V5.alarm_ready)); status.id = 'dacAlarmStatus';
      row('dac_alarm_enabled', V5.alarm_title, pseg('dac_alarm_enabled', setDacAlarmEnabled), status);
    }
  }

  row('display', L.display, seg('display', C.display.options.map((v) => [v, esc(L.display_modes[v])])));

  const G = PANEL.gate;
  const gateTop = el('div', 'ic-gate');
  const auto = el('button', 'ic-step ic-auto', esc(PANEL.auto_gain));
  auto.onclick = () => autoGain();
  gateTop.append(seg('gate_on', C.gate_on.options.map((v) => [v, esc(v ? G.on : G.off)])), auto);
  const gateSl = el('div', 'ic-gate-sl');
  GATE_SUBS.forEach((k, i) => {
    const label = G[['start', 'width', 'threshold'][i]];
    const val = el('span', 'ic-val'); val.id = `inspVal_${k}`;
    if (prac && detectionTraining()) {
      gateSl.classList.add('v5-gate-sl');
      const item = el('div', 'v5-gate-item');
      const input = el('input', 'v5-gate-number'); input.type = 'number'; input.dataset.k = k;
      const c = C[k]; Object.assign(input, { min: String(c.min), max: String(c.max), step: String(c.step) });
      input.setAttribute('aria-label', label); input.onchange = () => { if (input.value !== '' && Number.isFinite(Number(input.value))) setInsp(k, Number(input.value)); };
      const unit = el('span', 'v5-gate-unit', esc(i === 2 ? V5.percent : L.unit_mm));
      const buttons = nudges(i === 2 ? [-5, 5] : [-5, -1, 1, 5], (d) => setInsp(k, S.insp[k] + d), (d) => sgn(d));
      item.append(el('label', 'ic-gl', esc(label)), input, unit, buttons);
      gateSl.appendChild(item);
    } else gateSl.append(el('span', 'ic-gl', esc(label)), slider(k), val);
  });
  row('gate_on', G.title, gateTop, gateSl);

  if (floating) {
    const pad = el('div', 'v5-move');
    for (const [dir, dx, dy, glyph] of [['left', -1, 0, '←'], ['down', 0, -1, '↓'], ['up', 0, 1, '↑'], ['right', 1, 0, '→']]) {
      const b = el('button', 'ic-step', glyph);
      b.type = 'button';
      b.dataset.dir = dir;
      b.title = V5.move_dirs[dir];
      b.setAttribute('aria-label', V5.move_dirs[dir]);
      holdRepeat(b, () => nudgeProbe(dx, dy));
      pad.appendChild(b);
    }
    const stepSeg = el('div', 'ic-seg v5-move-step');
    for (const v of [PLIM.keyboard_step_mm, PROBE_FINE_MM]) {
      const b = el('button', probeStep() === v ? 'on' : '', `${v} ${esc(L.unit_mm)}`);
      b.type = 'button';
      b.dataset.step = String(v);
      b.onclick = () => { quickFloat.step = v; stepSeg.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); };
      stepSeg.appendChild(b);
    }
    row('probe_move', V5.probe_move, pad, stepSeg);
  }

  row('coupling', L.coupling, seg('coupling', C.coupling.options.map((v) => [v, esc(L.coupling_levels[v])])));
  row('damping', L.damping, seg('damping', Object.entries(UI.lab.damping_levels).map(([v, name]) => [v, esc(name)])));
  if (prac) compactPracticeControls(box);
  return box;
}

function examKitItems() {
  return V4.kit_items || [
    { id: 'eq__instrument', label: '数字探伤仪' },
    { id: 'eq__probe_straight', label: '直探头' },
    { id: 'eq__couplant', label: '耦合剂' },
    { id: 'eq__compare', label: '对比试块' },
    { id: 'eq__cbii_2', label: 'CBII-2' },
  ];
}

function examKitGate() {
  return !!S.exam && !S.taskOn && !store?.get('exam');
}

const WELD_EXAM_NEED = [
  { id: 'eq__instrument', label: '探伤仪' },
  { id: 'eq__probe_angle', label: '斜探头' },
  { id: 'eq__cable', label: '连接线' },
  { id: 'eq__couplant', label: '耦合剂' },
];
const EXAM_KIT_OPTIONAL = new Set([
  'eq__cable', 'eq__csk_ia', 'eq__compare', 'eq__cbii_2', 'eq__plate',
]);
const EXAM_KIT_WRONG = new Set([
  'eq__instrument_paut', 'eq__probe_straight', 'eq__probe_angle', 'eq__probe_paut', 'eq__probe_tofd',
]);
function examPickOk(kit, probeId) {
  if (!kit?.eq__instrument || !kit?.[probeId] || !kit?.eq__couplant) return false;
  for (const id of Object.keys(kit)) {
    if (!kit[id]) continue;
    if (id === 'eq__instrument' || id === probeId || id === 'eq__couplant') continue;
    if (EXAM_KIT_OPTIONAL.has(id)) continue;
    if (EXAM_KIT_WRONG.has(id)) return false;
    return false;
  }
  return true;
}
const WELD_COUPLANT_OPTS = [
  ['', '请选择耦合剂类型'],
  ['oil', '机油'],
  ['paste', '化学浆糊'],
  ['glycerin', '甘油'],
  ['water', '水'],
];
function weldExamKitGate() {
  return S.learning.role === 'exam' && S.learning.route === 'angle-exam'
    && document.body.dataset.weldBench === '1' && !S.weldExamKitDone;
}
function weldExamNeedOk() {
  return examPickOk(S.weldExamKit, 'eq__probe_angle');
}
function weldExamLabel(id) {
  return eqName(id)
    || WELD_EXAM_NEED.find((it) => it.id === id)?.label
    || PAUT_EXAM_NEED.find((it) => it.id === id)?.label
    || id;
}
function resetWeldExamKit() {
  S.weldExamKit = {};
  S.weldExamKitOrder = [];
  S.weldExamCouplant = '';
  S.weldExamPrep = null;
  S.weldExamKitDone = false;
  hideWeldExamWarn();
}
/** @returns {'on'|'off'|null} */
function toggleWeldExamKit(id) {
  if (!id || !weldExamKitGate()) return null;
  S.weldExamKit = S.weldExamKit || {};
  S.weldExamKitOrder = S.weldExamKitOrder || [];
  if (S.weldExamKit[id]) {
    delete S.weldExamKit[id];
    S.weldExamKitOrder = S.weldExamKitOrder.filter((x) => x !== id);
    if (id === 'eq__couplant') S.weldExamCouplant = '';
    return 'off';
  }
  S.weldExamKit[id] = true;
  S.weldExamKitOrder.push(id);
  return 'on';
}

function examKitReady() {
  return examPickOk(S.eqKit, 'eq__probe_straight');
}

function resetExamKit() {
  S.eqKit = {};
  S.eqKitOrder = [];
  S.eqExamCouplant = '';
  S.eqKitDrawn = null;
  hideWeldExamWarn();
}

function examPlateDrawnOk(drawn) {
  return !!(drawn?.case && !drawn.case.failed && drawn.case.specimen_id === CASE_ID);
}

function ensureExamPlateDrawn() {
  if (examPlateDrawnOk(S.eqKitDrawn)) return S.eqKitDrawn;
  const drawn = drawLibraryCase({ caselib: caseLib() });
  if (!examPlateDrawnOk(drawn)) return null;
  S.eqKitDrawn = drawn;
  return drawn;
}

function examPlatePickLine(cs) {
  const raw = cs?.library_id ?? cs?.case_id ?? '';
  const n = /^\d+$/.test(String(raw)) ? String(Number(raw)) : String(raw);
  const count = cs?.plate?.defects?.length ?? 0;
  return (V4.plate_pick_line || '您已选择{n}号钢板，温馨提示共有{count}处缺陷')
    .replace('{n}', n).replace('{count}', String(count));
}

/** @returns {'on'|'off'|null} */
function toggleExamKit(id) {
  if (!id || !examKitGate()) return null;
  S.eqKit = S.eqKit || {};
  S.eqKitOrder = S.eqKitOrder || [];
  if (S.eqKit[id]) {
    delete S.eqKit[id];
    S.eqKitOrder = S.eqKitOrder.filter((x) => x !== id);
    if (id === 'eq__couplant') S.eqExamCouplant = '';
    return 'off';
  }
  S.eqKit[id] = true;
  S.eqKitOrder.push(id);
  if (id === 'eq__plate') ensureExamPlateDrawn();
  return 'on';
}

const PAUT_EXAM_NEED = [
  { id: 'eq__instrument_paut', label: '相控阵探伤仪' },
  { id: 'eq__probe_paut', label: '相控阵探头' },
  { id: 'eq__probe_tofd', label: 'TOFD探头' },
  { id: 'eq__couplant', label: '耦合剂' },
];
function pautExamKitGate() {
  return S.learning.role === 'exam' && S.learning.route === 'paut-exam'
    && document.body.dataset.pautExamBench === '1' && !S.taskOn;
}
function pautExamNeedOk() {
  const kit = S.pautExamKit;
  if (!kit?.eq__instrument_paut || !kit?.eq__probe_paut || !kit?.eq__probe_tofd || !kit?.eq__couplant) return false;
  const need = new Set(['eq__instrument_paut', 'eq__probe_paut', 'eq__probe_tofd', 'eq__couplant']);
  for (const id of Object.keys(kit)) {
    if (!kit[id]) continue;
    if (need.has(id) || EXAM_KIT_OPTIONAL.has(id)) continue;
    return false;
  }
  return true;
}
function resetPautExamKit() {
  S.pautExamKit = {};
  S.pautExamKitOrder = [];
  S.pautExamCouplant = '';
  S.pautExamPrep = null;
  S.pautExamKitDone = false;
  hideWeldExamWarn();
}
/** @returns {'on'|'off'|null} */
function togglePautExamKit(id) {
  if (!id || !pautExamKitGate()) return null;
  S.pautExamKit = S.pautExamKit || {};
  S.pautExamKitOrder = S.pautExamKitOrder || [];
  if (S.pautExamKit[id]) {
    delete S.pautExamKit[id];
    S.pautExamKitOrder = S.pautExamKitOrder.filter((x) => x !== id);
    if (id === 'eq__couplant') S.pautExamCouplant = '';
    return 'off';
  }
  S.pautExamKit[id] = true;
  S.pautExamKitOrder.push(id);
  return 'on';
}

let examKitToastTimer = 0;
function examKitToast(text) {
  let tip = $('examKitToast');
  if (!tip) {
    tip = el('div', 'exam-kit-toast');
    tip.id = 'examKitToast';
    viewport.appendChild(tip);
  }
  tip.textContent = text;
  tip.classList.add('show');
  clearTimeout(examKitToastTimer);
  examKitToastTimer = setTimeout(() => tip.classList.remove('show'), 1800);
}

function hideWeldExamWarn() {
  $('weldExamWarn')?.remove();
}
function showWeldExamWarn() {
  let box = $('weldExamWarn');
  if (!box) {
    box = el('div', 'ss-cap');
    box.id = 'weldExamWarn';
    viewport.appendChild(box);
  }
  box.classList.remove('ss-cap-off');
  box.hidden = false;
  box.innerHTML = `${capX()}<b>仪器设备选择有误，请重新选取。</b><span>请点击取消选取的错误设备，重新选择。</span>`;
}

function syncExamKitCap() {
  $('examKitCap')?.remove();
  $('examKitToast')?.remove();
}

const STUDY_KIT_KEY = 'ut.study.kit.v3';
const STUDY_MOD_MS = 1050;
let studyRevealPlaying = false;
let studyCapTimer = 0;
function stationDef() {
  return (learningDoc.stations || [])[S.labStation] || null;
}
function stationProgOf(i = S.labStation) {
  const key = String(i);
  S.stationProg = S.stationProg || {};
  return S.stationProg[key] ||= { kit: false, opened: false, prep: false, train: false, packed: false };
}
function stationTreeOn() {
  const id = stationDef()?.id;
  return id === 'plate' || id === 'weld';
}
function stationSitReady(i) {
  if (reviewOpen()) return true;
  const specs = labRoomCopy.stations || [];
  for (let k = 0; k < i; k++) {
    if (!specs[k]?.open) continue;
    if (!stationProgOf(k).packed) return false;
  }
  return true;
}
function nextSitStationIndex() {
  const specs = labRoomCopy.stations || [];
  for (let i = 0; i < specs.length; i++) {
    if (!specs[i]?.open) continue;
    if (!stationProgOf(i).packed) return i;
  }
  return -1;
}
function studyModules() {
  const kit = stationDef()?.kit;
  if (kit?.length) return [{ id: 'kit', title: '本实验器材', items: kit }];
  return learningDoc.bench_gate?.modules || [];
}
function studyKitItems() {
  return studyModules().flatMap((m) => m.items || []);
}
function studyKitGuest() {
  return licenseHolder()?.via === 'account';
}
function studyKitWho() {
  const h = licenseHolder();
  if (!h) return '';
  if (h.via === 'account') return `account:${h.account || 'review'}`;
  if (h.role === 'teacher') return 'teacher';
  if (h.role === 'student') return `student:${h.no || ''}:${h.name || ''}`;
  return '';
}
function studyKitLoad() {
  if (studyKitGuest()) return {};
  try {
    const who = studyKitWho();
    if (!who) return {};
    const raw = JSON.parse(localStorage.getItem(STUDY_KIT_KEY) || '{}');
    const mine = raw && typeof raw === 'object' ? raw[who] : null;
    return mine && typeof mine === 'object' && !Array.isArray(mine) ? mine : {};
  } catch { return {}; }
}
function studyKitSave() {
  if (studyKitGuest()) return;
  try {
    const who = studyKitWho();
    if (!who) return;
    const raw = JSON.parse(localStorage.getItem(STUDY_KIT_KEY) || '{}');
    const store = raw && typeof raw === 'object' ? raw : {};
    store[who] = S.studyKit || {};
    localStorage.setItem(STUDY_KIT_KEY, JSON.stringify(store));
  } catch { /* ignore */ }
}
function studyKitDone() {
  const kit = S.studyKit || {};
  const items = studyKitItems();
  return items.length > 0 && items.every((it) => kit[it.id]);
}
function studyRevealedIds() {
  const kit = S.studyKit || {};
  return studyKitItems().filter((it) => kit[it.id]).map((it) => it.id);
}
function studyModuleDone(mod) {
  return !!mod?.items?.length && mod.items.every((it) => S.studyKit?.[it.id]);
}
function reviewOpen() { return isReviewSession(); }
function stationKitOpened() { return !!stationProgOf().opened; }
function stationKitDone() { return !!stationProgOf().kit || studyKitDone() || reviewOpen(); }
function studyBenchGate() {
  return S.learning.role === 'student' && S.learning.route === 'bench' && !S.exam && !S.taskOn;
}
function pautBenchGate() {
  return S.learning.role === 'student' && S.learning.route === 'paut-bench' && !S.exam && !S.taskOn;
}
function studyBenchPicking() {
  return studyBenchGate() && S.studyKitPhase === 'picking';
}
function markStudyKit(id) {
  if (!id || !studyBenchPicking()) return false;
  if (!studyKitItems().some((it) => it.id === id)) return false;
  S.studyKit = S.studyKit || {};
  if (S.studyKit[id]) return false;
  S.studyKit[id] = true;
  stationProgOf().ids = { ...S.studyKit };
  studyKitSave();
  return true;
}
function hideStudyStageCap() {
  clearTimeout(studyCapTimer);
  $('studyStageCap')?.remove();
}
function examItemTitle(trackOrRoute) {
  const items = learningDoc.roles?.exam?.items || [];
  return items.find((it) => it.track === trackOrRoute || it.route === trackOrRoute)?.title || '';
}
function examWorkbenchTitle() {
  if (S.learning.role !== 'exam' || S.taskOn) return '';
  const route = S.learning.route;
  if (pautExamKitGate()) return examItemTitle('paut-exam');
  if (weldExamKitGate()) return examItemTitle('angle-exam');
  if (examKitGate() || (route === 'assessment' && S.exam)) return examItemTitle('assessment');
  return '';
}
function syncStudyBenchBanner() {
  const G = learningDoc.bench_gate || {};
  const examTitle = examWorkbenchTitle();
  let box = $('studyBenchBanner');
  if (!studyBenchGate() && !examTitle) {
    box?.remove();
    return;
  }
  if (!box) {
    box = el('div', 'study-bench-banner');
    box.id = 'studyBenchBanner';
    viewport.appendChild(box);
  }
  box.classList.toggle('exam-exp', !!examTitle);
  const stTitle = (labRoomCopy.stations || [])[S.labStation]?.title;
  const title = examTitle || stTitle || G.banner || '能源装备超声波探伤虚拟仿真实验教学系统';
  box.innerHTML = `<strong>${esc(title)}</strong>`;
}
function showStudyStageCap(item, ms = STUDY_MOD_MS + 80) {
  hideStudyStageCap();
  const box = el('div', 'ss-cap ss-stage');
  box.id = 'studyStageCap';
  box.innerHTML = `<b>${esc(item.label || '')}</b>${item.line ? `<span>${esc(item.line)}</span>` : ''}`;
  viewport.appendChild(box);
  studyCapTimer = setTimeout(() => { if (box.isConnected) box.remove(); }, ms);
}
function showLabSitCap() {
  const specs = labRoomCopy.stations || [];
  const i = nextSitStationIndex();
  const idx = i >= 0 ? i : 0;
  const spec = specs[idx] || {};
  const caps = labRoomCopy.sit_caps || [];
  showStudyStageCap({
    label: caps[idx] || labRoomCopy.sit_cap || '请进入1号工位开始第一项实验',
    line: spec.title || '',
  }, 5200);
}
function waitStudyMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
async function playStudyModule(mod) {
  if (!mod?.items?.length || studyRevealPlaying || !studyBenchPicking()) return;
  studyRevealPlaying = true;
  stationProgOf().opened = true;
  equipment?.setKitCase?.({ show: true, open: true });
  renderPanel();
  const replay = studyModuleDone(mod);
  for (const item of mod.items) {
    const first = markStudyKit(item.id);
    applyStudyMethodFilter();
    equipment?.setKitCase?.({ show: true, open: true });
    if (item.id === 'eq__csk_ia') pinStationBlocks();
    if (first && !replay) equipment?.dropIn?.(item.id);
    equipment?.setSelected?.(item.id);
    if (stationDef()?.id !== 'weld') showStudyStageCap(item);
    await waitStudyMs(STUDY_MOD_MS);
  }
  stationProgOf().kit = true;
  studyRevealPlaying = false;
  renderPanel();
}
function playStationKit() {
  const mod = studyModules()[0];
  if (!mod) return;
  return playStudyModule(mod);
}

function selectEq(id, { from = 'scene' } = {}) {
  if (!equipment) return;
  if (id === 'eq__kitcase' && studyBenchPicking() && from === 'scene' && !studyRevealPlaying) {
    if (stationProgOf().packed) {
      stationProgOf().packed = false;
      applyStudyMethodFilter();
      renderPanel();
      return;
    }
    if (!stationProgOf().kit) {
      playStationKit();
      return;
    }
  }
  if (S.stationPanel === 'principle' && studyBenchGate() && from === 'scene' && id) {
    if (id === 'eq__probe_straight' || id === 'eq__probe_angle') { void enterStationProbe(); return; }
    if (id === 'eq__instrument') { void enterStationInstrument(); return; }
    if (id === 'eq__compare' || id === 'eq__cbii_2') { openStationEqDialog([id]); }
    else if (id === 'eq__couplant') { openStationEqDialog(['eq__couplant']); }
  }
  const next = id && eqMan.equipment[id] ? id : null;
  if (pautBenchGate() && next && PAUT_BENCH_OPEN[next] && from === 'scene') {
    void openPautModule(PAUT_BENCH_OPEN[next]);
    return;
  }
  if (ssDevicesPage()) {
    S.ssDev = next;
    if (next && from === 'scene') ssMark(`eq:${next}`, 'devices');
    studyKey = '';
  }
  let kitChanged = false;
  let kitOff = false;
  if (next && from === 'scene') {
    const examPick = toggleExamKit(next);
    if (examPick === 'off') { kitChanged = true; kitOff = true; }
    else if (examPick === 'on') kitChanged = true;
    const weldPick = toggleWeldExamKit(next);
    if (weldPick === 'off') { kitChanged = true; kitOff = true; }
    else if (weldPick === 'on') kitChanged = true;
    const pautPick = togglePautExamKit(next);
    if (pautPick === 'off') { kitChanged = true; kitOff = true; }
    else if (pautPick === 'on') kitChanged = true;
    kitChanged = markStudyKit(next) || kitChanged;
  }
  if (kitOff) {
    if (S.eqId === next) {
      S.eqId = null;
      equipment.setSelected(null);
    }
    renderPanel();
    syncExamKitCap();
    anchorsDirty = true;
    return;
  }
  if (next === S.eqId && next) {
    markEqLearned(next);
    if (kitChanged) renderPanel();
    else syncExamKitCap();
    return;
  }
  S.eqId = next;
  equipment.setSelected(next);
  if (next) {
    markEqLearned(next);
    emit('equipment:select', { equipment_id: next, from });
    if (!keepEqView()) {
      const pose = equipment.focusPose(next);
      if (pose) { setEqPan(0, { move: false }); flyTo(viewPose(pose), 700); }
    }
  } else if (S.mode === 'equipment' && !keepEqView()) {
    setEqPan(0, { move: false });
    flyTo(viewPose(VIEWS.equipment), 700);
  }
  renderPanel();
  syncExamKitCap();
  anchorsDirty = true;
}

function markEqLearned(id) {
  if (!id || S.eqLearned[id]) return;
  S.eqLearned[id] = true;
  emit('equipment:learned', { equipment_id: id });
}

function renderEquipmentPanel() {
  const box = el('div', 'eq-panel');
  if (ssEquip()) { panel.appendChild(box); return; }
  box.appendChild(el('div', 'hero home-hero', '<h2>' + esc(studyFullFlow() ? V4.flow_assembly_title : eqDoc.title) + '</h2><div class="hint">' + esc(V4.assembly_hint) + '</div>'));
  if (studyFullFlow()) { const steps = el('div', 'prac-steps'); buildSteps(steps); box.appendChild(steps); }
  if (assembly) {
    const asm = el('div', 'eq-asm');
    asm.id = 'eqAsm';
    box.appendChild(asm);
  }
  const ul = el('ul', 'eq-list');
  for (const id of eqMan.order) {
    const it = eqDoc.items[id];
    if (!it) continue;
    const li = el('li');
    const on = id === S.eqId ? ' on' : '';
    const done = S.eqLearned[id] ? `<i class="eq-done">${esc(eqDoc.learned)}</i>` : '';
    const b = el('button', `eq-item${on}`, `<span class="pn">${esc(eqName(id))}</span>${done}`);
    b.onclick = () => selectEq(id, { from: 'list' });
    li.appendChild(b);
    ul.appendChild(li);
  }
  box.appendChild(ul);
  if (S.eqId && eqDoc.items[S.eqId]) {
    const it = eqDoc.items[S.eqId];
    const card = el('div', 'eq-card');
    card.appendChild(el('h3', '', esc(eqName(S.eqId))));
    const sections = eqSectionsOf(S.eqId);
    for (const [sec, title] of Object.entries(eqDoc.section_titles)) {
      const lines = sections?.[sec] || [];
      if (!lines.length) continue;
      card.appendChild(el('h4', '', esc(title)));
      const list = el('ul');
      for (const line of lines) list.appendChild(el('li', '', esc(line)));
      card.appendChild(list);
    }
    const clauses = eqClausesOf(S.eqId);
    if (clauses.length) {
      const row = el('div', 'eq-clauses');
      for (const cid of clauses) row.insertAdjacentHTML('beforeend', stdChip(cid));
      card.appendChild(row);
      row.querySelectorAll('.std-chip').forEach((c) => {
        c.onclick = (ev) => { ev.stopPropagation(); setStd(true, c.dataset.std); };
      });
    }
    if (eqMan.equipment[S.eqId]?.detail_modes?.length) {
      const go = el('button', 'eq-detail', esc(eqDoc.open_detail));
      go.onclick = () => setMode('exterior');
      card.appendChild(go);
    }
    box.appendChild(card);
  }
  panel.appendChild(box);
  renderAsm();
}

// Assembly card: recommended steps with the live connection state, short labels (hint), redo / auto (classroom).
function renderAsm() {
  const box = $('eqAsm');
  if (!box || !assembly) return;
  const s = assembly.status();
  const steps = Object.entries(eqDoc.assembly_steps)
    .map(([k, name]) => `<li class="${s.steps[k] ? 'ok' : ''}" data-step="${k}"><i></i>${esc(name)}</li>`).join('');
  const tags = [];
  if (s.done) tags.push(['done', eqDoc.done]);
  else if (S.eqHint && !S.exam) {
    if (s.portWrong) tags.push(['err', eqDoc.labels.port_wrong]);
    if (s.onPlate && !s.coupled) {
      tags.push(['err', eqDoc.labels.no_couplant]);
      if (s.connected) tags.push(['err', eqDoc.labels.no_echo]);
    }
  }
  box.innerHTML = `<h3>${esc(eqDoc.assemble)}</h3><ol class="asm-steps">${steps}</ol>`
    + `<div class="asm-tags">${tags.map(([c, t]) => `<span class="${c}" data-tag="${c}">${esc(t)}</span>`).join('')}</div>`
    + '<canvas id="eqScope"></canvas><div class="asm-btns"></div>';
  const btns = box.querySelector('.asm-btns');
  const hint = el('button', S.eqHint ? 'on' : '', esc(eqDoc.hint));
  hint.dataset.act = 'hint';
  hint.onclick = () => { S.eqHint = !S.eqHint; renderAsm(); };
  const redo = el('button', '', esc(eqDoc.redo));
  redo.dataset.act = 'redo';
  redo.onclick = redoAssembly;
  if (!S.exam) btns.append(hint, redo);
  else if (!S.prac.asmDone) btns.append(redo);
  if (!S.exam) {
    const auto = el('button', '', esc(eqDoc.auto_assemble));
    auto.dataset.act = 'auto';
    auto.disabled = !!autoTimer || s.done;
    auto.onclick = autoAssemble;
    btns.appendChild(auto);
  }
  if (studyFullFlow()) {
    const next = el('button', s.done ? 'primary' : '', esc(V4.next_calibrate));
    next.onclick = () => { S.prac.flowAssemblyDone = true; S.prac.step = 'calibrate'; prepareLearningStep('calibrate'); setMode('practice'); };
    btns.appendChild(next);
  }
  const wexp = el('button', '', esc(PL.export_wave));
  wexp.dataset.act = 'export-wave';
  wexp.onclick = () => exportPracticeWave();
  btns.appendChild(wexp);
  benchKey = '';
}

// Detection quick controls float over the 3D view (bottom left), draggable by the title, foldable.
const quickFloat = { pos: null, fold: false, step: null, compactInit: false, off: true };

// Press: one call; hold: repeated calls until release. Keyboard activation (click without pointer) calls once.
function holdRepeat(b, fn) {
  let timer = null;
  const stop = () => { clearTimeout(timer); clearInterval(timer); timer = null; };
  const tick = () => { if (!b.isConnected) stop(); else fn(); };
  b.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    stop();
    fn();
    timer = setTimeout(() => { timer = setInterval(tick, 80); }, 350);
  });
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(ev, stop);
  b.addEventListener('click', (e) => { if (e.detail === 0) fn(); });
}
function mountQuickControls() {
  $('v5Float')?.remove();
  const vp = $('viewport');
  if (document.body.classList.contains('compact') && !quickFloat.compactInit) { quickFloat.fold = true; quickFloat.compactInit = true; }
  const dock = ssBarOn();
  const host = el('div', `v5-float${detectionTraining() ? '' : ' study'}${quickFloat.fold && !dock ? ' fold' : ''}${dock ? ' ss-dock' : ''}`);
  host.id = 'v5Float';
  host.classList.toggle('ss-off', quickFloat.off && dock);
  const box = inspControls({ practice: true });
  host.appendChild(box);
  const head = box.querySelector('.v5-control-title');
  const fold = el('button', 'v5-fold', esc(quickFloat.fold && !dock ? V5.unfold : V5.fold));
  fold.type = 'button';
  if (dock) {
    fold.onclick = () => toggleSsTune();
    head.appendChild(fold);
    vp.appendChild(host);
    return host;
  }
  fold.onclick = () => {
    quickFloat.fold = !quickFloat.fold;
    host.classList.toggle('fold', quickFloat.fold);
    fold.textContent = quickFloat.fold ? V5.unfold : V5.fold;
  };
  head.appendChild(fold);
  const place = (x, y) => {
    const r = vp.getBoundingClientRect();
    const nx = Math.max(0, Math.min(r.width - host.offsetWidth, x));
    const ny = Math.max(0, Math.min(r.height - host.offsetHeight, y));
    Object.assign(host.style, { left: `${nx}px`, top: `${ny}px`, bottom: 'auto' });
    quickFloat.pos = { x: nx, y: ny };
  };
  head.addEventListener('pointerdown', (ev) => {
    if (ev.button !== 0 || ev.target.closest('button')) return;
    const r0 = host.getBoundingClientRect();
    const dx = ev.clientX - r0.left, dy = ev.clientY - r0.top;
    head.setPointerCapture(ev.pointerId);
    const move = (e) => { const r = vp.getBoundingClientRect(); place(e.clientX - r.left - dx, e.clientY - r.top - dy); };
    const up = () => { head.removeEventListener('pointermove', move); head.removeEventListener('pointerup', up); head.removeEventListener('pointercancel', up); };
    head.addEventListener('pointermove', move);
    head.addEventListener('pointerup', up);
    head.addEventListener('pointercancel', up);
    ev.preventDefault();
  });
  vp.appendChild(host);
  if (quickFloat.pos) place(quickFloat.pos.x, quickFloat.pos.y);
  return host;
}

function renderPanel() {
  $('v5Float')?.remove();
  panel.innerHTML = '';
  panel.scrollTop = 0;
  if (S.mode === 'labroom') {
    $('studyBenchBanner')?.remove();
    return;
  }
  syncStudyBenchBanner();
  syncStationBenchBack();
  if (studyBenchGate()) {
    renderStudyBench();
    return;
  }
  if (pautBenchGate()) {
    renderPautBench();
    return;
  }
  if (S.learning.route === 'preparation' && S.learning.role === 'teacher' && !S.exam && !S.taskOn && S.mode === 'equipment') {
    renderTeachingPreparation();
    return;
  }
  if (!S.selected && S.mode === 'equipment') {
    if (weldExamKitGate()) renderWeldExamKit();
    else if (pautExamKitGate()) renderPautExamKit();
    else if (S.exam) renderExamBench();
    else if (S.learning.role === 'student' && !S.learning.route && !S.exam && !S.taskOn) return;
    else renderEquipmentPanel();
    return;
  }
  if (!S.selected && S.mode === 'lab') {
    renderLabPanel();
    return;
  }
  if (!S.selected && S.mode === 'physics') {
    if (S.scene) renderScenePanel();
    else renderSceneHome();
    return;
  }
  if (!S.selected && S.mode === 'inspection') {
    renderInspectionPanel();
    return;
  }
  if (!S.selected && S.mode === 'practice') {
    renderPracticePanel();
    return;
  }
  if (!S.selected && ssEquip()) {
    S.prView = 'scenes';
    renderSceneHome();
    return;
  }
  if (!S.selected) {
    const home = el('div', 'home');
    const shown = partsDoc.parts.filter((kb) => parts[kb.id] && (parts[kb.id].ud.default_visible || (kb.id === ML_ID && S.ml)));
    home.appendChild(el('div', 'hero home-hero', `<h2>${esc(UI.panel.parts)}</h2><span class="count">${shown.length}</span><div class="hint">${esc(UI.panel.hint)}</div>`));
    if (helpTopic()) {
      const demo = el('button', 'help-demo', `<i>${help.run ? '■' : '▶'}</i>${esc(help.run ? HELP.stop : HELP.parts_demo)}`);
      demo.onclick = () => toggleDemo('parts');
      home.appendChild(demo);
    }
    const ul = el('ul', 'part-list');
    for (const [i, kb] of shown.entries()) {
      const li = el('li');
      const b = el('button', `t-${kb.truth_level}`, `<span class="pi">${String(i + 1).padStart(2, '0')}</span><span class="pn">${esc(kb.name_zh)}</span><span class="en">${esc(kb.name_en)}</span>`);
      b.onclick = () => select(kb.id);
      b.onmouseenter = () => { S.hovered = kb.id; refreshMaterials(false); };
      b.onmouseleave = () => { S.hovered = null; refreshMaterials(false); };
      li.appendChild(b);
      ul.appendChild(li);
    }
    home.appendChild(ul);
    panel.appendChild(home);
    return;
  }
  const kb = KB[S.selected];
  const head = el('div', `hero card-hero ${kb.truth_level}`);
  const top = el('div', 'hero-top', `<span class="idx">${partIndex(kb.id)}</span>`);
  const close = el('button', 'card-close', '×');
  close.onclick = () => select(null);
  top.appendChild(close);
  head.appendChild(top);
  head.appendChild(el('h2', '', esc(kb.name_zh)));
  head.appendChild(el('div', 'en', esc(kb.name_en)));
  panel.appendChild(head);
  const sid = SCENE_BY_PART[kb.id];
  if (sid && S.scene !== sid && principleOpen()) {
    const go = el('button', 'scene-go', `<span class="pic">▶</span>${esc(UI.player.scenes)}<b>${esc(SCENES[sid].title)}</b>`);
    go.style.setProperty('--chain', UI.chains[CHAIN_OF[kb.id]].color);
    go.onclick = () => startScene(sid);
    panel.appendChild(go);
  }

  if (S.study === 'classroom' && S.step < 2 && CC[kb.id]) {
    renderClassroomCard(kb);
    return;
  }

  const why = el('div', 'why-row');
  const bWhy = el('button', `why${S.tab === 'design_driver' ? ' on' : ''}`, `<span class="ic">?</span>${esc(UI.why_buttons.why)}`);
  bWhy.onclick = () => { setTab('design_driver'); emit('why:open', { part_id: S.selected }); };
  const bRemove = el('button', `remove${S.tab === 'removal_effects' ? ' on' : ''}`, `<span class="ic">−</span>${esc(UI.why_buttons.remove)}`);
  bRemove.onclick = () => setTab('removal_effects');
  why.append(bWhy, bRemove);
  panel.appendChild(why);

  const tabs = el('div', 'tabs');
  TAB_KEYS.forEach((k, i) => {
    const b = el('button', `tab-${k}${k === S.tab ? ' active' : ''}`, `<span class="n">${TAB_NUM[i]}</span><span class="tl">${esc(UI.card_tabs[k])}</span>`);
    b.onclick = () => setTab(k);
    tabs.appendChild(b);
  });
  panel.appendChild(tabs);
  const body = el('div', `tab-body tb-${S.tab}`);
  body.appendChild(el('div', 'tb-title', `<span class="n">${TAB_NUM[TAB_KEYS.indexOf(S.tab)]}</span>${esc(UI.card_tabs[S.tab])}`));
  body.appendChild(el('div', 'tb-content', tabBody(kb, S.tab)));
  if (S.tab === 'removal_effects') demoButton(kb.id, body);
  panel.appendChild(body);
}

function demoButton(pid, box) {
  const hit = REMOVAL_BY_PART[pid];
  if (!hit || !principleOpen()) return;
  const [sid, i] = hit;
  if (S.scene === sid && S.sceneStep === i) return;
  const sc = SCENES[sid];
  const title = sc.kind === 'removal' ? sc.title : sc.steps[i].title;
  const b = el('button', 'rm-demo', `<span class="pic">▶</span>${esc(UI.player.demo)}<b>${esc(title)}</b>`);
  b.onclick = () => startScene(sid, i, 'parts');
  box.appendChild(b);
}

function coreLines(text) {
  return text.split(classroomDoc.separator).map((seg) => `<li>${esc(seg)}</li>`).join('');
}

function renderClassroomCard(kb) {
  const cc = CC[kb.id];
  const box = el('div', 'cls');
  box.appendChild(el('div', 'cls-block why', `<div class="q"><span class="ic">?</span>${esc(UI.why_buttons.why)}</div><ul>${coreLines(cc.why_core)}</ul>`));
  if (S.step >= 1) {
    const wo = el('div', 'cls-block without', `<div class="q"><span class="ic">−</span>${esc(UI.why_buttons.remove)}</div><ul>${coreLines(cc.without_core)}</ul>`);
    demoButton(kb.id, wo);
    box.appendChild(wo);
  }
  const next = el('button', 'cls-next', esc(S.step === 0 ? UI.why_buttons.remove : UI.classroom.full_card));
  next.onclick = () => setStep(S.step + 1);
  box.appendChild(next);
  panel.appendChild(box);
}

function setTab(k) {
  S.tab = k;
  renderPanel();
}

// ------------------------------------------------------------------ labels
let anchorsDirty = true;
let lastAnchorPass = 0;
const camPos = new THREE.Vector3();

function computeAnchors() {
  camera.getWorldPosition(camPos);
  for (const p of allParts()) {
    p.anchorOk = false;
    if (!p.obj.visible || !S.labels) continue;
    tmpBox.setFromObject(p.obj);
    const c = tmpBox.getCenter(new THREE.Vector3());
    const h = tmpBox.getSize(new THREE.Vector3()).multiplyScalar(0.5);
    const candidates = [
      c.clone(),
      c.clone().add(new THREE.Vector3(0, 0, h.z * 0.9)),
      c.clone().add(new THREE.Vector3(0, h.y * 0.35, h.z * 0.9)),
      c.clone().add(new THREE.Vector3(0, -h.y * 0.35, h.z * 0.9)),
      c.clone().add(new THREE.Vector3(h.x * 0.6, 0, h.z * 0.6)),
      ...p.samples.map((s) => s.mesh.localToWorld(s.v.clone())),
    ];
    for (const target of candidates) {
      const dir = target.clone().sub(camPos);
      const dist = dir.length();
      dir.normalize();
      const hits = castRay(camPos, dir, dist + 0.02);
      let point = null;
      if (S.xray) {
        const own = hits.find((x) => meshToPart.get(x.object) === p);
        if (own) point = own.point;
      } else if (hits.length && meshToPart.get(hits[0].object) === p) {
        point = hits[0].point;
      }
      if (point) {
        p.anchorLocal = p.obj.worldToLocal(point.clone());
        p.anchorOk = true;
        break;
      }
    }
  }
}

let lastLabelKey = '';
const INSP_LABELS = ['instrument__housing', 'instrument__screen', 'instrument__keypad', 'instrument__encoder', 'instrument__port_tr', 'system__probe_cable', 'probe__steel_block'];
const probePartId = (id) => String(id || '').startsWith('probe__');
const structureProbeLabelsOn = () => S.mode === 'structure' && (S.sview === 'cutaway' || S.sview === 'exploded');
function layoutLabels() {
  const W = viewport.clientWidth;
  const H = viewport.clientHeight;
  const items = [];
  const allow = S.mode === 'physics' && S.scene ? new Set([...curStep().labels, S.selected])
    : S.mode === 'practice' ? new Set([S.selected])
    : eqOn() ? new Set(keepEqView() ? [] : [...(S.eqId ? eqMan.equipment[S.eqId]?.labels || [] : []), S.selected])
    : inspOn() ? new Set([...(S.inspCam === 'screen' || S.inspCam === 'panel' ? [] : INSP_LABELS), S.selected]) : null;
  if (S.labels && root) {
    for (const p of allParts()) {
      if (!p.anchorOk || !p.obj.visible) continue;
      if (probePartId(p.pid) && !structureProbeLabelsOn()) continue;
      if (allow && !allow.has(p.pid)) continue;
      tmpV.copy(p.anchorLocal);
      p.obj.localToWorld(tmpV);
      const axis = new THREE.Vector3(inspOn() ? -0.1 : 0, tmpV.y, 0).project(camera);
      tmpV.project(camera);
      if (tmpV.z > 1 || Math.abs(tmpV.x) > 0.98 || Math.abs(tmpV.y) > 0.98) continue;
      items.push({ p, x: (tmpV.x * 0.5 + 0.5) * W, y: (-tmpV.y * 0.5 + 0.5) * H, ax: (axis.x * 0.5 + 0.5) * W });
    }
  }
  const labelKey = `${W}x${H}|${S.selected}|${S.study}|${S.mode}|${S.sview}|${S.scene}|${S.sceneStep}|` + items.map((i) => `${i.p.pid}:${i.x.toFixed(1)},${i.y.toFixed(1)}`).join(';');
  if (labelKey === lastLabelKey) return;
  lastLabelKey = labelKey;
  labelsBox.innerHTML = '';
  leaders.innerHTML = '';
  if (!items.length) return;
  items.sort((a, b) => a.y - b.y);

  const big = S.study === 'classroom';
  const gap = big ? 40 : 34;
  const labelW = big ? 230 : 190;
  const cols = [[], []];
  let alt = 1;
  for (const it of items) {
    const dx = it.x - it.ax;
    if (items.length <= 3 || dx > 12) cols[1].push(it);
    else if (dx < -12) cols[0].push(it);
    else { cols[alt].push(it); alt ^= 1; }
  }
  const topLeft = badgesBox.offsetHeight + 36;
  const layout = (col, x, top) => {
    const ys = col.map((i) => i.y);
    for (let i = 1; i < ys.length; i++) ys[i] = Math.max(ys[i], ys[i - 1] + gap);
    const over = ys[ys.length - 1] - (H - 24);
    if (over > 0) for (let i = 0; i < ys.length; i++) ys[i] -= over;
    for (let i = 0; i < ys.length; i++) ys[i] = Math.max(ys[i], top + i * gap);
    return col.map((it, i) => ({ it, x, y: ys[i] }));
  };
  const placed = [];
  if (cols[1].length) {
    const x = Math.min(Math.max(...cols[1].map((i) => i.x)) + 60, W - labelW);
    placed.push(...layout(cols[1], x, 24).map((q) => ({ ...q, side: 'r' })));
  }
  if (cols[0].length) {
    const x = Math.max(Math.min(...cols[0].map((i) => i.x)) - 60, labelW);
    placed.push(...layout(cols[0], x, topLeft).map((q) => ({ ...q, side: 'l' })));
  }

  const NS = 'http://www.w3.org/2000/svg';
  for (const { it, x, y, side } of placed) {
    const sel = it.p.pid === S.selected;
    const line = document.createElementNS(NS, 'line');
    line.setAttribute('x1', it.x);
    line.setAttribute('y1', it.y);
    line.setAttribute('x2', side === 'r' ? x - 4 : x + 4);
    line.setAttribute('y2', y);
    if (sel) line.setAttribute('class', 'sel');
    const dot = document.createElementNS(NS, 'circle');
    dot.setAttribute('cx', it.x);
    dot.setAttribute('cy', it.y);
    dot.setAttribute('r', sel ? 4.5 : 3.2);
    if (sel) dot.setAttribute('class', 'sel');
    leaders.append(line, dot);
    const chain = S.mode === 'physics' ? UI.chains[CHAIN_OF[it.p.pid]] : null;
    const lab = el('div', `label ${side}${sel ? ' sel' : ''}${chain ? ' chain' : ''}`, esc(it.p.kb.name_zh));
    if (chain) lab.style.setProperty('--chain', chain.color);
    lab.style.left = `${x}px`;
    lab.style.top = `${y}px`;
    lab.onclick = () => select(it.p.pid);
    labelsBox.appendChild(lab);
  }
}

const EXTERNAL_IDS = new Set(['probe__couplant', 'probe__steel_block']);
function probeHeightRatio() {
  let lo = Infinity;
  let hi = -Infinity;
  for (const p of Object.values(parts)) {
    if (!p.obj.visible || EXTERNAL_IDS.has(p.pid)) continue;
    for (const m of p.meshes) {
      const pos = m.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        tmpV.fromBufferAttribute(pos, i);
        m.localToWorld(tmpV).project(camera);
        lo = Math.min(lo, tmpV.y);
        hi = Math.max(hi, tmpV.y);
      }
    }
  }
  return (hi - lo) / 2;
}

// ------------------------------------------------------------------ compact / mobile practice tabs
function syncCompact() {
  const compact = Math.min(window.innerWidth, viewport.clientWidth || window.innerWidth) < 960 || window.innerHeight < 520;
  const practice = compact && compactPracticeFlow();
  if (compact && !document.body.classList.contains('compact') && S.labels) {
    S.labels = false;
    anchorsDirty = true;
  }
  document.body.classList.toggle('compact', compact);
  document.body.classList.toggle('compact-practice', practice);
  document.body.classList.toggle('show-labels', !!S.labels);
  if (practice) {
    if (!MOBILE_TABS.includes(document.body.dataset.mobileTab)) document.body.dataset.mobileTab = mobileTabOf();
    mountMobileTabs();
  } else {
    delete document.body.dataset.mobileTab;
    $('mobileTabs')?.remove();
  }
}

function setMobileTab(tab) {
  if (!MOBILE_TABS.includes(tab)) return;
  document.body.dataset.mobileTab = tab;
  try { localStorage.setItem(MOBILE_TAB_KEY, tab); } catch { /* keep in-memory */ }
  mountMobileTabs();
  requestAnimationFrame(() => {
    resize();
    if (S.mode === 'practice') drawInspection();
    anchorsDirty = true;
  });
}

function mountMobileTabs() {
  if (!document.body.classList.contains('compact-practice')) { $('mobileTabs')?.remove(); return; }
  const tabs = V5.mobile_tabs || {};
  let bar = $('mobileTabs');
  if (!bar) {
    bar = el('nav', 'mobile-tabs');
    bar.id = 'mobileTabs';
    bar.setAttribute('role', 'tablist');
    $('app')?.appendChild(bar);
  }
  const cur = document.body.dataset.mobileTab || mobileTabOf();
  bar.innerHTML = MOBILE_TABS.map((id) => `<button type="button" role="tab" data-tab="${id}" class="${id === cur ? 'on' : ''}" aria-selected="${id === cur}">${esc(tabs[id] || id)}</button>`).join('');
  bar.querySelectorAll('button[data-tab]').forEach((b) => { b.onclick = () => setMobileTab(b.dataset.tab); });
}

// ------------------------------------------------------------------ loop
function resize() {
  syncCompact();
  const w = viewport.clientWidth;
  const h = viewport.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / Math.max(1, h);
  camera.updateProjectionMatrix();
  anchorsDirty = true;
}
new ResizeObserver(resize).observe(viewport);
window.addEventListener('resize', syncCompact);
controls.addEventListener('change', () => { anchorsDirty = true; });


// ------------------------------------------------------------------ V2 learning entry and compact operation path
document.addEventListener('input', (ev) => {
  const f = ev.target;
  if (!['student-name', 'student-no'].includes(f.name) || licensedStudent()) return;
  S.learning.student[f.name === 'student-name' ? 'name' : 'student_no'] = f.value.trim();
  const mode = sessMode(), session = mode && store?.get(mode);
  if (session && !session.locked) { session.header.student = { ...S.learning.student }; store.touch(mode); }
});
let learningShell = null;
function plateArea(id) {
  const d = specMan.specimens[id].dims;
  return d.length.value * (d.width || d.width_b).value / 1e6;
}
function modelBoundary() {
  return el('details', 'workflow-boundary', `<summary>${esc(UI.inspection.model_boundary_title)}</summary>`
    + `<ul>${UI.inspection.model_boundaries.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`);
}
function compactPracticeControls(box) {
  const old = box.querySelector('details.workflow-advanced');
  const rows = [...box.querySelectorAll('.ic-row')];
  if (old) old.remove();
  if (detectionTraining()) { rows.forEach((row) => box.appendChild(row)); return; }
  const step = S.prac.step;
  const primary = [...(step === 'calibrate' ? ['gain_dB', 'range_mm', 'velocity_m_s', 'zero_us', 'gate_on', 'reject_percent']
    : step === 'dac' ? ['gain_dB', 'range_mm', 'gate_on', 'peak_memory', 'reject_percent']
    : step === 'quantify' ? ['gain_dB', 'range_mm', 'gate_on', 'peak_memory']
      : step === 'scan' ? ['gain_dB', 'range_mm', 'gate_on'] : ['gain_dB', 'range_mm']), 'probe_move'];
  const extra = el('details', 'workflow-advanced');
  extra.appendChild(el('summary', '', esc(WF.advanced_controls)));
  const body = el('div', 'workflow-advanced-body'); extra.appendChild(body);
  for (const row of rows) (primary.includes(row.dataset.k) ? box : body).appendChild(row);
  box.appendChild(extra);
}
function scanQualityOf(id, P = S.prac) {
  const c = coverageParams({ rules: waveRules, standard: stdPack, specimens: specMan, manifest }, id);
  const sc = P.plates[id].scan;
  return scanQuality({ trail: sc.trail, speed: sc.speed, edge: c.edge,
    limits: { x: [-c.L / 2, c.L / 2], y: [-c.W / 2, c.W / 2] },
    pattern: P.card?.middle_pattern || 'lines', maxSegment: COV.max_segment_mm, toleranceDeg: COV.direction_tolerance_deg });
}
function qualityRows(id) {
  const q = scanQualityOf(id);
  return [[WF.overspeed, q.overspeed == null ? WF.quality_empty : pct(q.overspeed)],
    [WF.direction, q.direction == null ? WF.quality_empty : pct(q.direction)], [WF.quality_note, '']];
}
function identityForm() {
  const lic = licensedStudent();
  const st = lic || S.learning.student;
  const ro = lic ? ' readonly' : '';
  return `<div class="workflow-identity"><b>${esc(WF.identity)}</b><label>${esc(WF.name)}<input name="student-name" maxlength="32" value="${esc(st.name)}"${ro}></label>`
    + `<label>${esc(WF.number)}<input name="student-no" maxlength="32" value="${esc(st.student_no)}"${ro}></label></div>`;
}
function checkTaskCard() {
  if (S.learning.taskMode !== 'guided' || !S.task.id) return;
  const test = S.task.step === 'check';
  const st = test ? taskTest(S.task.id) : taskCard(S.task.id), r = taskcard.parse(st.raw);
  if (!r.ok) { st.miss = r.missing; renderTaskPage(); return; }
  const t = taskcard.task(S.task.id);
  const chk = taskcard.check(r.card, taskcard.plateThickness(t), t.level);
  st.miss = Object.keys(chk.fields).filter((k) => !chk.fields[k]);
  if (test) {
    st.card = r.card;
    st.score = taskcard.score(r.card, taskcard.plateThickness(t), t.level);
    if (!help.run) learnScore('task', 'check', st.score.points, st.score.max);
    renderTaskPage();
    return;
  }
  renderTaskPage();
  window.alert(chk.ok ? WF.card_ok : `${WF.card_recheck}\n${st.miss.map((id) => TK.card_fields[id]).join('\n')}`);
}
function reworkTask() {
  if (!S.taskOn || S.learning.role === 'exam' || !window.confirm(WF.rework_confirm)) return false;
  closeReport();
  const id = S.taskRun;
  leaveTask();
  S.taskPrac = null; S.caseTask = null; S.taskRun = null;
  store?.clear('task');
  const st = taskCard(id); st.confirmed = false;
  S.task.id = id;
  openTaskPage();
  return true;
}
function openTrainingReport() {
  if (S.exam || !S.prac.eval.result || !practice) return null;
  S.prac.score = null;
  const report = reportModel();
  report.title = WF.report_training;
  report.sections = report.sections.filter((x) => x.title !== assessDoc.report.score);
  return openReport(report, { printLabel: assessDoc.report.print, closeLabel: assessDoc.report.close,
    onPrint: () => emit('session:export', { kind: 'report' }) });
}

// Complete flow: every step before `id` is completed with reference results; the step itself is left to the learner.
function prepareLearningStep(id) {
  const P = S.prac, i = STEP_IDS.indexOf(id);
  const inst = S.mode === 'practice' ? S.insp : P.inst;
  if (i > 0 && !P.done.calibrate) {
    P.calib.points = { ...CAL_RULES.targets_mm };
    inst.velocity_m_s = CAL_STATE.velocity_m_s; inst.zero_us = CAL_STATE.zero_us;
    P.done.calibrate = true;
  }
  if (i > 1 && !P.done.dac) { P.dac.points = presetDac(); P.done.dac = true; }
  if (i > 2 && !P.done.sensitivity) {
    const base = proc.gBase(P.dac.points);
    P.sens = { base, scan: base + STD.scan_sensitivity.plus_dB };
    P.done.sensitivity = true;
  }
  if (i > 3) {
    const pid = i > 4 ? evalSpec() : isPlate(P.specimen) ? P.specimen : onCase() ? CASE_ID : STEP_PRESETS.quantify.specimen;
    const pl = P.plates[pid];
    if (pl) {
      const ref = plateRef(pid, inst);
      for (const f of ref.found) if (!pl.scan.found.some((x) => x.id === f.id)) pl.scan.found.push(f);
      pl.quant.target ||= pl.scan.found.find((f) => f.flags?.length)?.id ?? null;
      P.done.scan = true;
      if (i > 4) {
        for (const [k, r] of Object.entries(ref.results)) if (!pl.quant.results[k]) pl.quant.results[k] = r;
        P.done.quantify = true;
      }
    }
  }
  if (P.sens && ['sensitivity', 'scan', 'quantify', 'evaluate'].includes(id)) {
    inst.gain_dB = id === 'scan' || id === 'sensitivity' ? P.sens.scan : P.sens.base;
  }
  if (['scan', 'quantify', 'evaluate'].includes(id)) {
    inst.gate_on = true; inst.gate_start_mm = 1;
    inst.gate_width_mm = Math.max(1, specT(CASE_ID) - 1.5);
    inst.range_mm = waveRules.controls.range_mm.presets.find((x) => x >= specT(CASE_ID) * 2 + 10) || 200;
    clearGateOfMainBang(inst);
  }
}

// Indications a complete scan of plate `pid` records and their quantification: reference values on P-02 and the case
// plate; on other plates the criteria at each defect centre (no reference quantification).
function plateRef(pid, inst) {
  const defs = specMan.specimens[pid]?.defects || [];
  const onC = pid === CASE_ID && !!S.case;
  const items = onC ? S.case.reference.items : pid === EVAL_SPEC ? PR.grading.reference_items : null;
  const confirmed = S.learning.role !== 'teacher';
  const found = [], results = {};
  if (!items) {
    for (const d of defs) {
      const [x, y] = d.centre_mm;
      const c = proc.criteria({ ...inst, specimen_id: pid, thickness_mm: specT(pid), probe_x_mm: x, probe_y_mm: y }, dacPts(), critG());
      found.push({ id: d.id, x, y, flags: c.defect === d.id ? [...c.flags] : [], confirmed });
    }
    return { found, results };
  }
  const AV = PR.acceptance_values;
  for (const it of items) {
    const d = defs.find((x) => x.id === it.id);
    if (!d) continue;
    found.push({ id: it.id, x: d.centre_mm[0], y: d.centre_mm[1], flags: [...it.flags], confirmed });
    if (!it.determined) continue;
    const cl = d.type === 'cluster';
    const r = onC ? S.case.reference.rects[it.id] : AV[`${it.id}_reference_mm`];
    const eq = onC ? S.case.reference.equivalents[it.id] ?? it.D_dB ?? null : AV[`${it.id}_equivalent_dB`] ?? null;
    results[it.id] = { length: r.length, area: r.area_mm2, eq, S: null, judge: {},
      ...(cl ? { merged: onC ? r.merged : true, blocks: onC ? d.members.length : AV.CLU_01_member_area_mm2.length } : {}) };
  }
  return { found, results };
}

function setDetectionGain(id) {
  const P = S.prac;
  if (!P.sens) return;
  const inst = S.mode === 'practice' ? S.insp : P.inst;
  inst.gain_dB = id === 'scan' ? P.sens.scan : P.sens.base + (P.sens.comp || 0);
  keepDetectionUnsaturated();
  inspKey = '';
}

function restoreDetectionGain(kind) {
  if (!detectionTraining() || S.mode !== 'practice' || replayOn() || examLocked() || !S.prac.sens) return;
  const sens = S.prac.sens;
  setInsp('gain_dB', kind === 'scan' ? sens.scan : sens.base + (sens.comp || 0));
}

function keepDetectionUnsaturated() {
  if (!detectionTraining() || S.mode !== 'practice' || S.panel.frozen || !['quantify', 'evaluate'].includes(S.prac.step)) return;
  const base = S.prac.sens.base + (S.prac.sens.comp || 0);
  const echoes = wave.echoes({ ...S.insp, gain_dB: base });
  const target = S.prac.quant.target;
  const first = echoes.filter((e) => e.type === 'defect' && e.k === 1 && (!target || e.id === target));
  const peak = Math.max(0, ...first.map((e) => e.pct));
  const gain = Math.max(waveRules.controls.gain_dB.min, base - (peak > 80 ? 20 * Math.log10(peak / 80) : 0));
  if (Math.abs(S.insp.gain_dB - gain) > 1e-6) { S.insp.gain_dB = gain; inspKey = ''; }
}

function cardReasons(task) {
  const R = taskcard.reference(taskcard.plateThickness(task), task.level);
  const values = { frequency: R.frequency.join('~'), element: R.element.join('~'), block: R.reference_block,
    edge: R.edge_zone, lines: R.scan_plan.lines, grid: R.scan_plan.grid, scan: R.scan_sensitivity,
    comp: R.compensation, level: levelText(task.level) };
  return Object.fromEntries(Object.entries(V4.card_reasons).map(([key, text]) => [key, v4Format(text, values)]));
}

function cardReasonHtml(task, st) {
  const why = cardReasons(task);
  const checked = st.score ? taskcard.check(st.card, taskcard.plateThickness(task), task.level) : null;
  return '<div class="v4-card-reasons">' + taskcard.fields().map((f) => `<details data-f="${f.id}"><summary>` + esc(TK.card_fields[f.id])
    + ' · ' + esc(checked ? checked.fields[f.id] ? V4.reason_ok : V4.reason_revise : V4.reason_basis)
    + '</summary><p>' + esc(why[f.id]) + '</p></details>').join('') + '</div>';
}

function designResult() {
  const st = designWorking() ? designState(S.task.id) : S.task.cards[S.task.id];
  return st?.score ? { version: 'M11', project: V4.design_project, student: { ...S.learning.student }, task_id: S.task.id,
    task: taskBriefRows(taskcard.task(S.task.id)), card: { ...st.card }, score: st.score, submitted_at: new Date().toISOString() } : null;
}
function persistDesignResult() {
  if (!designWorking() && S.learning.route !== 'design') return;
  if (S.learning.route !== 'design' && S.task.step !== 'fill') return;
  try {
    const cards = S.learning.route === 'design' ? S.task.cards : S.task.designs;
    localStorage.setItem('ut.m11.design', JSON.stringify({ cards, id: S.task.id, student: S.learning.student }));
  } catch { /* result remains available in this page */ }
}
function designLog(id, act, detail = '') {
  if (!id || !designWorking()) return;
  const st = designState(id);
  (st.log ||= []).push({ at: new Date().toISOString(), act, detail: String(detail) });
  persistDesignResult();
}

function cardFieldText(name, value) {
  if (value === '' || value == null) return PL.no_value;
  if (!taskcard.options(name)) return String(value);
  return name === 'level' ? levelText(value) : TK.options[name]?.[value] ?? String(value);
}

function designRecordModel(result) {
  const id = result.task_id;
  const st = designWorking() ? designState(id) : S.task.cards[id];
  const task = taskcard.task(id);
  const chk = taskcard.check(st.card, taskcard.plateThickness(task), task.level);
  const why = cardReasons(task);
  const fields = taskcard.fields();
  const log = st.log || [];
  const L = V4.design_log;
  const clock = (iso) => new Date(iso).toLocaleTimeString('zh-CN', { hour12: false });
  const t0 = log[0]?.at;
  const t1 = [...log].reverse().find((e) => e.act === 'submit')?.at;
  const count = (act) => String(log.filter((e) => e.act === act).length);
  const groupName = (g) => TK.card_fields[fields.find((f) => f.group === g)?.id] ?? g;
  const num = (v) => (Number.isInteger(v) ? String(v) : v.toFixed(1));
  const scale = 100 / result.score.max;
  return {
    title: V4.design_record_title,
    meta: [[V4.name, result.student.name || PL.no_value], [V4.number, result.student.student_no || PL.no_value], [V4.design_task, taskNo(id)],
      [V4.export_time, new Date().toLocaleString('zh-CN', { hour12: false })], [V4.design_elapsed, t0 && t1 ? fmtDur(Date.parse(t1) - Date.parse(t0)) : PL.no_value]],
    sections: [
      { title: TK.brief, parts: [{ kv: result.task }] },
      { title: TK.card, parts: [{ table: { head: [V4.col_item, V4.col_value, V4.col_check, V4.col_basis],
        rows: fields.map((f) => [TK.card_fields[f.id], cardFieldText(f.id, st.raw[f.id]),
          { text: chk.fields[f.id] ? V4.reason_ok : V4.reason_revise, cls: chk.fields[f.id] ? 'ok' : 'ng' }, { text: why[f.id] ?? '', cls: 'l' }]) } }] },
      { title: V4.design_score, parts: [{ table: { head: [V4.col_item, V4.score_points, V4.score_max],
        rows: result.score.parts.filter((p) => p.max > 0).map((p) => [groupName(p.group), { text: num(p.points * scale), cls: p.ok ? 'ok' : 'ng' }, num(p.max * scale)]),
        foot: [V4.score_total, num(result.score.total), '100'] } }] },
      { title: V4.design_process, parts: [{ kv: [[V4.submit_count, count('submit')], [V4.edit_count, count('edit')]] },
        { table: { head: [V4.col_time, V4.col_action, V4.col_content], rows: log.map((e) => [clock(e.at), L[e.act] ?? e.act, { text: e.detail, cls: 'l' }]) } }] },
    ],
  };
}

function exportDesignResult() {
  if (!designResult()) return null;
  designLog(S.task.id, 'export');
  const result = { ...designResult(), log: [...(S.task.cards[S.task.id].log || [])] };
  const model = designRecordModel(result);
  const html = htmlDoc(model.title, reportHTML(model), embedJson(JSON.stringify(result)));
  const who = (result.student.student_no || result.student.name || '').replace(/[\\/:*?"<>|\s]/g, '_');
  downloadBlob(new Blob([html], { type: 'text/html' }), `${V4.design_file_prefix}${S.task.id}${who ? `_${who}` : ''}_${fileStamp()}.html`);
  return result;
}

function printDesignResult() {
  if (!designResult()) return null;
  designLog(S.task.id, 'export');
  const result = { ...designResult(), log: [...(S.task.cards[S.task.id].log || [])] };
  const model = designRecordModel(result);
  const who = (result.student.student_no || result.student.name || '').replace(/[\\/:*?"<>|\s]/g, '_');
  const view = stampReport(openReport(model, { printLabel: assessDoc.report.print, closeLabel: assessDoc.report.close }),
    `${V4.design_file_prefix}${S.task.id}${who ? `_${who}` : ''}_${fileStamp()}`);
  setTimeout(() => window.print(), 250);
  return view;
}

// Weld track (angle-beam probe, ./angle): its views cover the workspace while open; the plate scene stops rendering.
let angleApp = null;
const isAngleRoute = (route) => typeof route === 'string' && route.startsWith('angle-');
const isPautRoute = (route) => route === 'paut-home' || (typeof route === 'string' && route.startsWith('paut-'));
const PAUT_BENCH_ITEMS = [
  { id: 'eq__probe_paut', label: '相控阵探头', hash: '#probe/pa' },
  { id: 'eq__instrument_paut', label: '相控阵探伤仪', hash: '#paut/tx' },
  { id: 'eq__probe_tofd', label: 'TOFD 探头', hash: '#tofd/wave' },
];
async function openAngle(route) {
  angleApp ||= (await import('./angle/app.js')).mountAngle(document.body);
  document.body.dataset.track = 'weld';
  return angleApp.open(route);
}
function closeAngle() {
  angleApp?.close();
  if (document.body.dataset.track === 'weld' && S.learning.route !== 'angle-structure') {
    document.body.dataset.track = 'plate';
    delete document.body.dataset.weldBench;
  }
}

let pautExamApp = null;
function closePautExamPage() {
  pautExamApp?.close();
}
async function openPautExamPage() {
  closeStdPage(); closeTaskPage(); closeReport();
  await closePaut();
  closeAngle();
  closeStudy();
  if (S.taskOn) leaveTask();
  Object.assign(S.learning, { role: 'exam', route: 'paut-exam', taskMode: 'guided' });
  document.body.dataset.learningRole = 'exam';
  document.body.dataset.learningRoute = 'paut-exam';
  delete document.body.dataset.pautExamBench;
  delete document.body.dataset.pautBench;
  delete document.body.dataset.weldBench;
  setStudy('self');
  pautExamApp ||= mountPautExam(document.body);
  pautExamApp.open({ couplant: S.pautExamPrep?.couplant || S.pautExamCouplant || '' });
  learningShell?.update(S.learning);
  $('legacyMore').open = false;
  return true;
}

async function openWeldDevices(step = 'devices') {
  if (!practice || !assembly) return false;
  closeStdPage(); closeTaskPage(); closeReport();
  await closePaut();
  closeAngle();
  closePautExamPage();
  closeStudy();
  if (S.taskOn) leaveTask();
  if (S.exam) swapContext(false);
  S.selected = null; S.isolated = null; updateVisibility(); refreshMaterials(true);
  S.ssEq = ['devices', 'bench', 'prep'].includes(step) ? step : 'devices';
  S.ssDev = null;
  selectEq(null);
  Object.assign(S.learning, { role: 'student', route: 'angle-structure', taskMode: 'guided' });
  document.body.dataset.learningRole = 'student';
  document.body.dataset.learningRoute = 'angle-structure';
  if (ssDevicesSeen().has('probe:enter')) markProbeTour('back');
  // Keep plate track so the shared equipment WebGL loop keeps painting (weld track skips frame()).
  document.body.dataset.track = 'plate';
  document.body.dataset.weldBench = '1';
  delete document.body.dataset.pautBench;
  setStudy('self');
  if (S.mode !== 'equipment') await setMode('equipment', { force: true });
  else { renderModes(); renderPanel(); }
  applyStudyMethodFilter();
  learningShell?.update(S.learning);
  $('legacyMore').open = false;
  return true;
}

async function openWeldExamKit() {
  if (!practice || !assembly) return false;
  closeStdPage(); closeTaskPage(); closeReport();
  await closePaut();
  closeAngle();
  closePautExamPage();
  closeStudy();
  if (S.taskOn) leaveTask();
  if (S.exam) swapContext(false);
  resetWeldExamKit();
  S.selected = null; S.isolated = null; updateVisibility(); refreshMaterials(true);
  S.ssEq = 'devices';
  S.ssDev = null;
  selectEq(null);
  Object.assign(S.learning, { role: 'exam', route: 'angle-exam', taskMode: 'guided' });
  document.body.dataset.learningRole = 'exam';
  document.body.dataset.learningRoute = 'angle-exam';
  document.body.dataset.track = 'plate';
  document.body.dataset.weldBench = '1';
  delete document.body.dataset.pautExamBench;
  delete document.body.dataset.pautBench;
  resetPautExamKit();
  setStudy('self');
  if (S.mode !== 'equipment') await setMode('equipment', { force: true });
  else { renderModes(); renderPanel(); }
  applyStudyMethodFilter();
  learningShell?.update(S.learning);
  $('legacyMore').open = false;
  return true;
}

async function finishWeldExamKit() {
  if (!reviewOpen() && !weldExamNeedOk()) {
    showWeldExamWarn();
    return;
  }
  hideWeldExamWarn();
  S.weldExamPrep = { couplant: S.weldExamCouplant, rough: '3.2' };
  S.weldExamKitDone = true;
  delete document.body.dataset.weldBench;
  const ok = await launchWeld({ role: 'exam', route: 'angle-exam' });
  if (!ok) {
    S.weldExamKitDone = false;
    document.body.dataset.weldBench = '1';
    document.body.dataset.track = 'plate';
    renderPanel();
  }
}

function renderExamPickKit({ order, couplantOn, couplantVal, setCouplant, onFinish }) {
  const box = el('div', 'eq-panel exam-panel weld-exam-kit');
  box.appendChild(el('div', 'weld-exam-cap', '<b>请从工作台上点击选择正确的仪器设备。</b>'));
  const lines = order || [];
  if (lines.length) {
    const ul = el('ul', 'weld-exam-picked');
    for (const id of lines) {
      const li = el('li');
      li.appendChild(el('span', '', esc(`已选择${weldExamLabel(id)}`)));
      if (id === 'eq__plate' && examKitGate() && examPlateDrawnOk(S.eqKitDrawn)) {
        li.appendChild(el('span', 'weld-exam-plate-tip', esc(examPlatePickLine(S.eqKitDrawn.case))));
      }
      ul.appendChild(li);
    }
    box.appendChild(ul);
  }
  if (couplantOn) {
    const lab = el('label', 'weld-exam-coup');
    lab.appendChild(el('span', '', '耦合剂类型'));
    const sel = el('select');
    for (const [v, name] of WELD_COUPLANT_OPTS) {
      const o = document.createElement('option');
      o.value = v;
      o.textContent = name;
      if (v === (couplantVal || '')) o.selected = true;
      sel.appendChild(o);
    }
    sel.onchange = () => {
      setCouplant(sel.value);
      renderPanel();
    };
    lab.appendChild(sel);
    box.appendChild(lab);
  }
  const go = el('button', 'primary', '已完成仪器设备准备工作');
  go.type = 'button';
  go.onclick = () => onFinish();
  box.appendChild(go);
  panel.appendChild(box);
}

function renderWeldExamKit() {
  renderExamPickKit({
    order: S.weldExamKitOrder,
    couplantOn: !!S.weldExamKit?.eq__couplant,
    couplantVal: S.weldExamCouplant,
    setCouplant: (v) => { S.weldExamCouplant = v; },
    onFinish: finishWeldExamKit,
  });
}

async function openPautExamKit() {
  if (!practice || !assembly) return false;
  closeStdPage(); closeTaskPage(); closeReport();
  await closePaut();
  closeAngle();
  closePautExamPage();
  closeStudy();
  if (S.taskOn) leaveTask();
  if (S.exam) swapContext(false);
  resetPautExamKit();
  S.selected = null; S.isolated = null; updateVisibility(); refreshMaterials(true);
  S.ssEq = 'devices';
  S.ssDev = null;
  selectEq(null);
  Object.assign(S.learning, { role: 'exam', route: 'paut-exam', taskMode: 'guided' });
  document.body.dataset.learningRole = 'exam';
  document.body.dataset.learningRoute = 'paut-exam';
  document.body.dataset.track = 'plate';
  document.body.dataset.pautExamBench = '1';
  delete document.body.dataset.weldBench;
  delete document.body.dataset.pautBench;
  setStudy('self');
  if (S.mode !== 'equipment') await setMode('equipment', { force: true });
  else { renderModes(); renderPanel(); }
  applyStudyMethodFilter();
  learningShell?.update(S.learning);
  $('legacyMore').open = false;
  return true;
}

function renderPautExamKit() {
  renderExamPickKit({
    order: S.pautExamKitOrder,
    couplantOn: !!S.pautExamKit?.eq__couplant,
    couplantVal: S.pautExamCouplant,
    setCouplant: (v) => { S.pautExamCouplant = v; },
    onFinish: finishPautExamKit,
  });
}

async function finishPautExamKit() {
  if (!reviewOpen() && !pautExamNeedOk()) {
    showWeldExamWarn();
    return;
  }
  hideWeldExamWarn();
  S.pautExamPrep = { couplant: S.pautExamCouplant };
  S.pautExamKitDone = true;
  delete document.body.dataset.pautExamBench;
  const ok = await openPautExamPage();
  if (!ok) {
    S.pautExamKitDone = false;
    document.body.dataset.pautExamBench = '1';
    document.body.dataset.track = 'plate';
    renderPanel();
  }
}

function finishPlateExamKit() {
  if (!reviewOpen() && !examKitReady()) {
    showWeldExamWarn();
    return;
  }
  hideWeldExamWarn();
  const st = licensedStudent() || S.learning.student || {};
  startExam(st.name, st.student_no);
}

async function launchWeld({ role, route }) {
  if (!practice || !assembly || !['teacher', 'student', 'exam'].includes(role)) return false;
  if (role === 'teacher' && !learningShell?.teacherUnlocked()) return false;
  if (replayOn()) exitReplay();
  S.selected = null; S.isolated = null; updateVisibility(); refreshMaterials(true);
  closeStdPage(); closeTaskPage(); closeReport();
  await closePaut();
  if (S.taskOn) leaveTask();
  if (S.exam) swapContext(false);
  closePautExamPage();
  if (role === 'student' && (route === 'angle-structure' || route === 'angle-principle')) return openWeldDevices();
  if (role === 'exam' && route === 'angle-exam' && !S.weldExamKitDone) {
    if (!reviewOpen()) return openWeldExamKit();
    S.weldExamKitDone = true;
  }
  const prevRole = document.body.dataset.learningRole;
  const prevRoute = document.body.dataset.learningRoute;
  document.body.dataset.learningRole = role; document.body.dataset.learningRoute = route;
  document.body.dataset.track = 'weld';
  angleApp ||= (await import('./angle/app.js')).mountAngle(document.body);
  if (role === 'exam' && route === 'angle-exam') angleApp.setExamPrep?.(S.weldExamPrep || null);
  if ((await openAngle(route)) === false) {
    closeAngle();
    document.body.dataset.learningRole = prevRole; document.body.dataset.learningRoute = prevRoute;
    return false;
  }
  Object.assign(S.learning, { role, route, taskMode: 'guided' });
  S.caseRef = false;
  setStudy(role === 'teacher' ? 'classroom' : 'self');
  learningShell?.update(S.learning);
  $('legacyMore').open = false;
  syncLabRoomBack();
  return true;
}

async function openPautBench() {
  if (!practice || !assembly) return false;
  hidePaut();
  closeStdPage(); closeTaskPage(); closeReport();
  closeAngle();
  closeStudy();
  if (S.taskOn) leaveTask();
  if (S.exam) swapContext(false);
  S.selected = null; S.isolated = null; updateVisibility(); refreshMaterials(true);
  S.ssEq = 'devices';
  S.ssDev = null;
  S.eqId = null;
  equipment?.setSelected(null);
  Object.assign(S.learning, { role: 'student', route: 'paut-bench', taskMode: 'guided' });
  document.body.dataset.learningRole = 'student';
  document.body.dataset.learningRoute = 'paut-bench';
  document.body.dataset.track = 'plate';
  document.body.dataset.pautBench = '1';
  delete document.body.dataset.weldBench;
  delete document.body.dataset.pautExamBench;
  setStudy('self');
  applyStudyMethodFilter();
  if (S.mode !== 'equipment') await setMode('equipment', { force: true });
  else { renderModes(); renderPanel(); }
  learningShell?.update(S.learning);
  $('legacyMore').open = false;
  return true;
}

function renderPautBench() {
  const box = el('div', 'eq-panel exam-panel study-bench-panel');
  box.appendChild(el('div', 'hero home-hero', `<h2>${esc('相控阵与 TOFD')}</h2>`));
  box.appendChild(el('p', 'hint study-bench-intro', esc('在工作台点击相控阵探头、相控阵探伤仪或 TOFD 探头。')));
  const list = el('div', 'study-mod-list');
  for (const row of PAUT_BENCH_ITEMS) {
    const btn = el('button', 'study-mod');
    btn.type = 'button';
    btn.innerHTML = `<span class="study-mod-lab">${esc(row.label)}</span>`;
    btn.onclick = () => { void openPautModule(row.hash); };
    list.appendChild(btn);
  }
  box.appendChild(list);
  panel.appendChild(box);
}

function returnFromPautPage() {
  hidePaut();
  if (pautBenchGate()) {
    document.body.dataset.track = 'plate';
    applyStudyMethodFilter();
    renderPanel();
    return;
  }
  void openPautBench();
}

async function openPautModule(hash) {
  if (!hash) return false;
  closeStdPage(); closeTaskPage(); closeReport(); closeAngle(); closeStudy();
  if (S.taskOn) leaveTask();
  if (S.exam) swapContext(false);
  S.eqId = null;
  equipment?.setSelected(null);
  document.body.dataset.learningRole = 'student';
  document.body.dataset.learningRoute = S.learning.route || 'paut-bench';
  document.body.dataset.pautBench = '1';
  setStudy('self');
  try {
    await openPaut({ hash, onHome: returnFromPautPage });
  } catch (e) {
    console.error(e);
    await closePaut();
    return false;
  }
  learningShell?.update(S.learning);
  $('legacyMore').open = false;
  return true;
}

async function launchPaut({ role, route }) {
  if (!['teacher', 'student', 'exam'].includes(role)) return false;
  if (role === 'teacher' && !learningShell?.teacherUnlocked()) return false;
  if (replayOn()) exitReplay();
  closeStdPage(); closeTaskPage(); closeReport(); closeAngle(); closePautExamPage(); closeStudy();
  if (S.taskOn) leaveTask();
  if (S.exam) swapContext(false);
  if (role === 'student' && (route === 'paut-home' || route === 'paut-bench')) return openPautBench();
  if (role === 'exam') {
    if (S.pautExamKitDone || reviewOpen()) {
      S.pautExamKitDone = true;
      return openPautExamPage();
    }
    return openPautExamKit();
  }
  closePautExamPage();
  await closePaut();
  Object.assign(S.learning, { role, route: route || 'paut-home', taskMode: 'guided' });
  document.body.dataset.learningRole = role;
  document.body.dataset.learningRoute = route || 'paut-home';
  document.body.dataset.track = 'paut';
  delete document.body.dataset.pautBench;
  setStudy(role === 'teacher' ? 'classroom' : 'self');
  try {
    await openPaut();
  } catch (e) {
    console.error(e);
    await closePaut();
    return false;
  }
  learningShell?.update(S.learning);
  $('legacyMore').open = false;
  return true;
}

async function launchStudy({ role, route }) {
  if (role !== 'student') return false;
  if (replayOn()) exitReplay();
  closeStdPage(); closeTaskPage(); closeReport(); closeAngle(); closePautExamPage();
  await closePaut();
  if (S.taskOn) leaveTask();
  if (S.exam) swapContext(false);
  Object.assign(S.learning, { role, route, taskMode: 'guided' });
  document.body.dataset.learningRole = role; document.body.dataset.learningRoute = route;
  const track = STUDY_ROUTES[route];
  if (!track) return false;
  // Keep the evaluation page on the same probe track (closeAngle() resets body track to plate).
  document.body.dataset.track = track;
  const sc = S.prac?.score;
  const trained = S.labStation != null && stationProgOf().train;
  const practice = sc && sc.total != null
    ? { text: `实训得分 ${sc.total} / ${sc.max}` }
    : { text: trained ? '已完成实训操作' : '尚未完成实训操作' };
  openStudy(track, {
    go: (module, step) => (track === 'plate' ? studyGo(module, step) : learningShell?.openRoute('student', module)),
    practice,
    onBench: S.labStation != null ? () => openStationParent() : null,
  });
  learningShell?.update(S.learning);
  $('legacyMore').open = false;
  syncLabRoomBack();
  return true;
}

// Self study: the bench is the first step of the equipment module, so the plate flow opens at calibration.
async function launchFlowStudy(payload) {
  closeAngle();
  await closePaut();
  const ok = await launchLearning(payload);
  if (ok && S.mode === 'equipment') await studyGo('fullscan', S.prac.step);
  return ok;
}

async function launchLearning({ role, route, taskMode = 'guided' }) {
  if (!practice || !assembly || !['teacher', 'student', 'exam'].includes(role)) return false;
  if (role === 'teacher' && !learningShell?.teacherUnlocked()) return false;
  if (role !== 'teacher' && route === 'preparation') return false;
  if (role === 'student' && route !== 'bench' && S.labStation != null && !stationKitDone() && !reviewOpen()) return openStationBench();
  if (replayOn()) exitReplay();
  S.selected = null; S.isolated = null; updateVisibility(); refreshMaterials(true);
  closeStdPage(); closeTaskPage(); closeReport();
  await closePaut();
  if (S.taskOn) leaveTask();
  if (route !== 'assessment' && S.exam) swapContext(false);
  const design = route === 'design';
  const cardRoute = route === 'task' || design;
  if (cardRoute) {
    const nextMode = design ? 'independent' : 'guided';
    if (S.task.context?.taskMode !== nextMode) {
      S.task.cards = {}; S.task.designs = {}; S.task.id = null; S.task.learn = {}; S.task.seen = new Set();
    }
    taskMode = nextMode;
    S.task.context = { role, taskMode };
    S.task.step = 'learn';
    try {
      const saved = JSON.parse(localStorage.getItem('ut.m11.design') || 'null');
      if (saved?.cards) {
        if (design && !Object.keys(S.task.cards).length) {
          S.task.cards = saved.cards; S.task.id = saved.id; Object.assign(S.learning.student, saved.student);
        } else if (!design && !Object.keys(S.task.designs || {}).length) {
          S.task.designs = saved.cards;
          if (saved.id) S.task.id = saved.id;
          Object.assign(S.learning.student, saved.student || {});
        }
      }
    } catch { /* new design */ }
  }
  Object.assign(S.learning, { role, route, taskMode });
  S.caseRef = false;
  document.body.dataset.learningRole = role; document.body.dataset.learningRoute = route;
  setStudy(role === 'teacher' ? 'classroom' : 'self');
  if (route === 'bench') return openStationBench();
  if (cardRoute) openTaskPage();
  else if (route === 'assessment') openExam();
  else if (route === 'fullscan') {
    const selected = role === 'teacher' ? S.teacher.selectedId || casesDoc.library.cases[0].id : casesDoc.library.cases[0].id;
    const resume = S.prac.flowRole === role && S.prac.flowCaseId === selected;
    if (!resume) {
      if (S.mode === 'practice') await setMode('equipment');
      S.prac = freshPrac();
      const cs = caseLib().libraryCase(selected);
      if (!cs || cs.failed) return false;
      applyCase({ ...cs, thickness_mm: 50 }); freshCasePlate();
      Object.assign(S.prac, { flowRole: role, flowCaseId: selected, flowAssemblyDone: false, cover: true });
      resetExamBench();
    }
    if (!resume || !S.prac.flowAssemblyDone) await setMode('equipment', { force: true });
    else await setMode('practice', { force: true });
    renderPanel();
  }
  else if (route === 'equipment') {
    if (role === 'student') {
      S.ssEq = 'devices';
      S.ssDev = null;
      await setMode('equipment', { force: true });
    } else await setMode('structure', { view: 'cutaway' });
  }
  else if (route === 'principle') { await setMode('physics'); startScene(MAIN_SCENES.find((item) => item.part_id === 'probe__active_element')?.id || MAIN_SCENES[0].id); }
  else if (route === 'inspection') { await setMode('inspection'); runExperiment(theoryDoc.experiments[0].id); }
  else if (route === 'preparation') await setMode('equipment', { force: true });
  else return false;
  learningShell?.update(S.learning);
  $('legacyMore').open = false;
  syncLabRoomBack();
  return true;
}

function initLearningShell() {
  if (learningShell) return;
  $('moreLabel').textContent = WF.more;
  document.body.dataset.learningRole = S.learning.role || 'home';
  document.body.dataset.learningRoute = S.learning.route || 'home';
  S.studyKit = studyKitLoad();
  learningShell = createLearningShell({ mount: $('learningMount'), getState: () => S.learning,
    onLaunch: async (payload) => {
      closeStudy();
      if (payload.role === 'student' && payload.route !== 'bench' && S.labStation != null && !stationKitDone() && !reviewOpen()) {
        await openStationBench();
        return false;
      }
      if (STUDY_ROUTES[payload.route]) return launchStudy(payload);
      if (payload.role === 'student' && payload.route === 'fullscan') return launchFlowStudy(payload);
      if (isPautRoute(payload.route)) return launchPaut(payload);
      if (isAngleRoute(payload.route)) return launchWeld(payload);
      closeAngle();
      closePautExamPage();
      closePaut();
      const ok = await launchLearning(payload);
      if (ok && (payload.route === 'equipment' || payload.route === 'angle-structure')) applyStudyMethodFilter();
      return ok;
    },
    onEntryRoute: async ({ role, route }) => {
      if (role === 'student' || role === 'exam' || route === 'bench' || route === 'lab') return openLabRoom();
      return false;
    },
    onReturnBench: () => (S.labStation != null ? openStationParent() : openLabRoom()),
    onRoleChange: (role) => {
      closeStdPage(); closeTaskPage(); closeReport(); closeAngle(); closePautExamPage(); closeStudy();
      closePaut();
      if (role !== 'exam' && S.exam) swapContext(false);
      resetWeldExamKit();
      resetPautExamKit();
      S.learning.role = role; S.learning.route = null;
      S.caseRef = false; S.teacher.open = false;
      document.body.dataset.learningRole = role || 'home'; document.body.dataset.learningRoute = 'home';
      delete document.body.dataset.weldBench;
      delete document.body.dataset.pautBench;
      delete document.body.dataset.pautExamBench;
      setStudy(role === 'teacher' ? 'classroom' : 'self');
      equipment?.setMethodFilter(null);
    }, esc });
  if (import.meta.env.DEV) window.__learningShell = learningShell;
  const bar = $('controls');
  const leftover = el('div', 'workflow-tools-legacy');
  leftover.hidden = true;
  const basicTools = new Set([ctl.explode, ctl.assemble, ctl.export_image]);
  [...bar.children].filter((node) => !basicTools.has(node)).forEach((node) => leftover.appendChild(node));
  bar.appendChild(leftover);
  mountSsBar();
  new ResizeObserver(() => document.documentElement.style.setProperty('--ut-workspace-top', `${$('learningMount').getBoundingClientRect().bottom}px`)).observe($('learningMount'));
  document.documentElement.style.setProperty('--ut-workspace-top', `${$('learningMount').getBoundingClientRect().bottom}px`);
}

// ------------------------------------------------------------------ sessions (M8.1): process log, local restore, exam context
// Exam and training keep separate practice data and bench assembly; the inactive context is stashed in S.pracTrain / S.examPrac
// and S.benchTrain / S.benchExam. Training is logged while in mode practice; the exam log starts at the start form.
// The task run (M10.2) has its own session `task`; the training data wait in S.pracTrain as during the exam.
const sessMode = () => (S.learning.role === 'exam' && S.exam && !S.taskOn ? 'exam' : null);

function recordEvent(name, payload) {
  if (S.learning.role !== 'exam') return;
  // Self study and teacher demonstrations have no persistent process log.
  if (!store || (name.startsWith('task:') && !S.taskOn)) return;
  let mode = null;
  if (name === 'session:start' || name === 'session:restore') mode = payload.mode;
  else {
    if (!S.exam && S.mode === 'practice' && !store.get('train')) beginTrain();
    mode = sessMode();
  }
  const s = mode && store.get(mode);
  if (s && s.event(name, payload)) store.touch(mode);
}

function pracToJSON(P) {
  const o = {};
  for (const [k, v] of Object.entries(P)) if (k !== 'scan' && k !== 'quant' && k !== 'crit') o[k] = v;
  return JSON.parse(JSON.stringify(o, (k, v) => (v instanceof Set ? [...v] : v)));
}

function pracFromJSON(o, { exam = false, withCase = !exam && !!S.case, task = false } = {}) {
  const P = freshPrac({ exam, task });
  if (!o) return P;
  for (const [k, v] of Object.entries(o)) if (k in P && k !== 'scan' && k !== 'quant') P[k] = v;
  P.inst = { ...practiceInst(), ...(o.inst || {}) };
  P.probe = { ...freshPrac().probe, ...(o.probe || {}) };
  const ids = withCase && o.plates?.[CASE_ID] ? [...PLATE_IDS, CASE_ID] : PLATE_IDS;
  P.plates = Object.fromEntries(ids.map((id) => {
    const pl = o.plates?.[id];
    return [id, { scan: { ...freshScan(), ...(pl?.scan || {}), cells: new Set(pl?.scan?.cells || []) }, quant: { ...freshQuant(), ...(pl?.quant || {}) } }];
  }));
  if (ids.includes(CASE_ID)) {
    P.probe[CASE_ID] = o.probe?.[CASE_ID] || probeStart(CASE_ID);
    if (o.evalOf) { P.evalOf = o.evalOf; P.evals = o.evals || {}; }
  } else if (o.evalOf && o.evalOf !== EVAL_SPEC) P.eval = o.evals?.[EVAL_SPEC] || freshEval();
  if (!ids.includes(P.plateId)) P.plateId = PLATE_IDS[0];
  if (!specMan.specimens[P.specimen] || (P.specimen === CASE_ID && !ids.includes(CASE_ID))) P.specimen = SPEC_IDS[0];
  if (!STEP_IDS.includes(P.step)) P.step = STEP_IDS[0];
  P.crit = null;
  return P;
}

// Assembly t0 is a performance.now() stamp: stored as elapsed so it survives a reload.
function benchSnap() {
  if (!assembly || !equipment) return null;
  const asm = assembly.state;
  const t0 = asm.t0;
  asm.t0 = null;
  return { asm, asm_ms: t0 == null ? null : performance.now() - t0, layout: equipment.layoutState(), entered: S.asmEntered };
}

function benchLoad(b) {
  if (!assembly || !equipment) return;
  endBenchDrag();
  stopAutoAssemble();
  equipment.loadLayout(b?.layout || []);
  const asm = b?.asm ? { ...b.asm, t0: b.asm_ms == null ? null : performance.now() - b.asm_ms } : null;
  assembly.load(asm, { place: eqOn() });
  S.asmEntered = !!b?.entered;
  benchKey = '';
}

// During a task run the training data sit in S.pracTrain with the training bench live; a left run waits in S.taskPrac.
function learningStateOf(mode, active) {
  const header = store?.get(mode)?.header;
  const state = active ? S.learning : header?.initial?.learning || S.learning;
  return { ...state, student: { ...(header?.student || state.student) } };
}

function taskStateOf(mode) {
  const P = mode === 'task' ? (S.taskOn ? S.prac : S.taskPrac) : mode === 'exam' ? S.examPrac : S.pracTrain;
  const ids = P && practice ? [...PLATE_IDS, ...(P.plates[CASE_ID] && specMan.specimens[CASE_ID] ? [CASE_ID] : [])] : [];
  return {
    prac: P ? pracToJSON(P) : null,
    coverage: P && practice ? Object.fromEntries(ids.map((id) => [id, coverageSummary(id, P)])) : null,
    bench: mode === 'exam' ? S.benchExam : benchSnap(),
    active: mode === 'task' ? S.taskOn : false,
    unlocked: S.asmDone,
    learning: learningStateOf(mode, mode === 'task' && S.taskOn),
  };
}

function stateOf(mode) {
  if (mode === 'task' || S.taskOn) return taskStateOf(mode);
  const exam = mode === 'exam';
  const cur = exam === S.exam;
  const P = cur ? S.prac : exam ? S.examPrac : S.pracTrain;
  return {
    prac: P ? pracToJSON(P) : null,
    coverage: P && practice ? Object.fromEntries([...PLATE_IDS, ...(P.plates[CASE_ID] && specMan.specimens[CASE_ID] ? [CASE_ID] : [])].map((id) => [id, coverageSummary(id, P)])) : null,
    bench: cur ? benchSnap() : exam ? S.benchExam : S.benchTrain,
    active: exam ? S.exam : false,
    unlocked: S.asmDone,
    learning: learningStateOf(mode, cur && (exam || S.mode === 'practice')),
  };
}

const keyState = () => ({
  mode: S.mode,
  step: S.prac.step,
  specimen: S.prac.specimen,
  probe: { ...S.prac.probe[S.prac.specimen] },
  inst: { ...S.prac.inst },
  done: { ...S.prac.done },
  ...(S.mode === 'equipment' && assembly ? { bench: assembly.status().steps } : {}),
  ...(S.mode === 'practice' && practice && isPlate(S.prac.specimen) ? { coverage: covKey(S.prac.specimen) } : {}),
});
const covKey = (id) => {
  const { edge, middle, whole, overspeed_ratio } = coverageSummary(id);
  return { edge, middle, whole, overspeed_ratio };
};

// Header case fields: the exam plate (the case of the case code, else fixed P-02), or the current training random plate.
function headerCase(code = null) {
  if (S.exam && !S.case) return { case_id: FIXED_TPL.defect_set_id, template_id: FIXED_TPL.id, case_code: code, random_seed: null };
  return S.case ? { case_id: S.case.case_id, template_id: S.case.template_id, case_code: S.exam ? code : null, random_seed: S.case.seed } : null;
}

function sessionInit(student, code = null) {
  return {
    student: student || (S.learning.student.name && S.learning.student.student_no ? { ...S.learning.student } : null),
    kase: headerCase(code),
    initial: {
      study: S.study,
      learning: { ...S.learning, student: { ...S.learning.student } },
      step: S.prac.step,
      ...(S.prac.presetPlan ? { presetPlan: { ...S.prac.presetPlan }, presetCard: { ...S.prac.presetCard } } : {}),
      specimen: S.prac.specimen,
      probe: JSON.parse(JSON.stringify(S.prac.probe)),
      inst: { ...S.prac.inst },
      bench: benchSnap(),
    },
    specimens: Object.entries(specMan.specimens).filter(([id]) => id !== CASE_ID).map(([id, sp]) => ({ specimen_id: id, defect_set_id: sp.defect_set_id ?? null })),
    probe: {
      probe_id: manifest.model_id,
      model_version: manifest.model_version,
      active_element_diameter_mm: manifest.parameters.active_element_diameter.value,
      yaw_deg: 0,
      tilt_deg: 0,
    },
  };
}

function beginTrain() { return; }

function pushAllMarks() {
  if (practice && proc) for (const id of PLATE_IDS) pushMarks(id);
  if (practice && proc && S.prac.plates[CASE_ID] && practice.specimens[CASE_ID]) pushMarks(CASE_ID);
  marksDirty = true;
  xrayKey = '';
  guideKey = '';
  stdKey = '';
  inspKey = '';
}

function swapContext(exam) {
  if (S.taskOn) leaveTask();
  if (S.exam === exam || !practice) return;
  const live = S.mode === 'practice';
  if (live) applyPractice(false);
  const nextCase = exam ? S.caseExam : S.caseTrain;
  if (exam) {
    S.pracTrain = S.prac;
    S.caseTrain = S.case;
    S.prac = S.examPrac || freshPrac({ exam: true });
    S.examPrac = null;
    S.caseExam = null;
    S.benchTrain = benchSnap();
    benchLoad(S.benchExam);
    S.benchExam = null;
  } else {
    S.examPrac = S.prac;
    S.caseExam = S.case;
    S.prac = S.pracTrain || freshPrac();
    S.pracTrain = null;
    S.caseTrain = null;
    S.benchExam = benchSnap();
    benchLoad(S.benchTrain);
    S.benchTrain = null;
    if (!stepOpen(S.prac.step)) S.prac.step = STEP_IDS[stepReach()];
  }
  if (nextCase) applyCase(nextCase);
  else if (S.case) dropCase();
  S.exam = exam;
  if (live) applyPractice(true);
  pushAllMarks();
}

function openExam() {
  if (!practice || !assembly) return;
  closeStdPage();
  closePautExamPage();
  delete document.body.dataset.weldBench;
  delete document.body.dataset.pautExamBench;
  delete document.body.dataset.pautBench;
  resetPautExamKit();
  swapContext(true);
  if (!store?.get('exam')) resetExamKit();
  const target = store?.get('exam') && S.prac.asmDone ? 'practice' : 'equipment';
  if (S.mode === target) { renderModes(); renderPanel(); }
  else setMode(target);
  applyStudyMethodFilter();
  syncExamKitCap();
}

function resetExamBench() {
  if (!assembly) return;
  endBenchDrag();
  stopAutoAssemble();
  assembly.reset();
  S.asmEntered = false;
  benchKey = '';
}

// Case code (optional) + student no. → the exam plate; null: no code; false: invalid code.
function examCaseOf(code, no) {
  if (!String(code ?? '').trim()) return null;
  const r = caseLib().fromCode(code, no);
  return r.ok && !r.failed ? r : false;
}

function defaultValidationCase(no) {
  const ids = validationCaseIds(casesDoc);
  if (!ids.length) return false;
  const code = caseLib().encodeLibrary(ids);
  const result = caseLib().fromCode(code, no);
  return result.ok && !result.failed ? result : false;
}

// The prepared gate keeps its end; its start moves past the initial pulse at the prepared gain,
// so the gate reading never shows the initial pulse as a 100 % reading near 1 mm.
function clearGateOfMainBang(inst) {
  const columns = 960;
  const fr = wave.synth({ ...inst }, { columns, noise: false });
  const mmCol = inst.range_mm / columns;
  let i = 0;
  while (i < columns && fr.hi[i] >= inst.gate_threshold_pct) i += 1;
  const end = inst.gate_start_mm + inst.gate_width_mm;
  const start = Math.min(Math.ceil(((i + 1) * mmCol + 0.5) * 2) / 2, end / 3);
  if (start <= inst.gate_start_mm) return;
  inst.gate_start_mm = start;
  inst.gate_width_mm = Number((end - start).toFixed(1));
}

function startExam(name = '', no = '') {
  if (!S.exam || S.taskOn || !store || store.get('exam')) return false;
  const student = { name: String(name).trim(), student_no: String(no).trim() };
  const drawn = examPlateDrawnOk(S.eqKitDrawn)
    ? S.eqKitDrawn
    : drawLibraryCase({ caselib: caseLib(), thickness: thickness() });
  const cs = drawn.case;
  if (cs.specimen_id !== CASE_ID) return false;
  const live = S.mode === 'practice';
  if (live) applyPractice(false);
  S.learning.student = student;
  S.prac = freshPrac({ exam: true });
  applyCase(cs); freshCasePlate();
  const task = { level: 'II' }, t = specT(CASE_ID);
  const reference = makeReferenceCard(taskcard, task, t);
  const prepared = presetDetectionPractice({ prac: S.prac, instrument: S.prac.inst, rules: waveRules, standard: stdPack,
    taskcard, task, thickness_mm: t, dacPoints: presetDac(reference),
    blockSpecimen: specMan.specimens[blockIdOf(reference.reference_block)], caseSpecimenId: CASE_ID });
  const { scan: preparedScan, quant: preparedQuant, ...preparedState } = prepared.prac;
  Object.assign(S.prac, preparedState);
  clearGateOfMainBang(S.prac.inst);
  syncEval();
  S.prac.eval.level = task.level;
  S.prac.guide = false; S.prac.cover = false;
  S.prac.librarySelection = drawn.selection;
  S.examExported = false; S.caseRef = false;
  if (live) applyPractice(true);
  const session = store.begin('exam', sessionInit(student));
  emit('session:start', { mode: 'exam', session_id: session.header.session_id });
  emit('case:load', { case_id: cs.case_id, template_id: cs.template_id, seed: cs.seed, defect_set_id: cs.defect_set_id, source: 'exam' });
  pushAllMarks();
  if (S.mode !== 'practice') setMode('practice'); else renderPanel();
  syncExamKitCap();
  return true;
}

// contracts/rubric.json on the exam state and log (docs/M8_SCOPE.md §5); stored with the submitted exam.
const SCORE_FILES = { waveform_rules: waveRules, standard: stdPack, specimens_manifest: specManGlb, model_manifest: manifest, practice_doc: practiceDoc };
const scoring = createDetectionScoring({ rubric: rubricDoc, files: SCORE_FILES });
const taskScoring = createTaskScoring({ rubric: rubricDoc, tasks: tasksDoc, files: SCORE_FILES, taskcard });
function examScore() {
  const s = store?.get(S.exam ? 'exam' : 'train');
  return scoring.score({
    prac: pracToJSON(S.prac),
    events: (s?.log || []).filter((e) => e.kind === 'event'),
    coverage: Object.fromEntries(examPlates().map((id) => [id, coverageOf(id).metrics()])),
    case: S.case ? caseLib().scoringContext(S.case) : null,
  });
}

function submitExam() {
  const s = store?.get('exam');
  if (!s || s.locked) return;
  S.prac.score = examScore();
  emit('session:submit', { session_id: s.header.session_id, total: S.prac.score.total, max: S.prac.score.max });
  S.prac.submitted = true;
  s.submit(new Date().toISOString());
  store.save('exam');
  pushAllMarks();
  renderModes();
  renderPanel();
}

const pad2 = (n) => String(n).padStart(2, '0');
function fmtDur(ms) {
  const t = Math.max(0, Math.floor((ms || 0) / 1000));
  const h = Math.floor(t / 3600);
  return `${h ? `${h}:` : ''}${pad2(Math.floor(t / 60) % 60)}:${pad2(t % 60)}`;
}

function exportSessionLog(mode = S.taskOn ? 'task' : S.exam ? 'exam' : 'train') {
  const s = store?.get(mode);
  if (!s) return null;
  emit('session:export', { kind: 'log' });
  store.save(mode);
  const data = s.toJSON(stateOf(mode));
  const who = `${mode === 'task' ? `task-${s.header.task_id}` : mode}-${s.header.student?.student_no || 'demo'}`.replace(/[^\w-]/g, '_');
  const asReport = mode === 'exam' && s.locked && !!(practice && wave && proc);
  const json = JSON.stringify(data);
  let body = json;
  if (asReport) {
    const model = reportModel();
    body = htmlDoc(model.title, reportHTML(model), embedJson(json));
  }
  const name = `UTlog_${who}_${fileStamp()}.${asReport ? 'html' : 'json'}`;
  const blob = new Blob([body], { type: asReport ? 'text/html' : 'application/json' });
  downloadBlob(blob, name);
  if (mode === 'exam' && s.locked && !S.examExported) { S.examExported = true; renderPanel(); }
  return { name, bytes: blob.size, data };
}

const svgDataUrl = (svg) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" '))}`;
const fileStamp = (d = new Date()) => `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}-${pad2(d.getHours())}${pad2(d.getMinutes())}`;
const SESSION_TAG = 'ut-session';
const embedJson = (json) => `<script type="application/json" id="${SESSION_TAG}">${json.replace(/</g, '\\u003c')}</script>`;
// Session JSON embedded by embedJson in an exported HTML record, or the text itself.
function sessionText(text) {
  const m = /<script type="application\/json" id="ut-session">([\s\S]*?)<\/script>/.exec(text);
  return m ? m[1] : text;
}

function downloadBlob(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

function reportCss() {
  const out = [];
  for (const sheet of document.styleSheets) {
    let rules;
    try { rules = sheet.cssRules; } catch { continue; }
    for (const r of rules) if (r.cssText.includes('.rp-') && !r.cssText.includes('rp-view') && !r.cssText.includes('rp-bar')) out.push(r.cssText);
  }
  return out.join('\n');
}

function htmlDoc(title, inner, extra = '') {
  const esc1 = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>${esc1(title)}</title>`
    + `<style>body{margin:0;background:#e5e7eb;font-family:"Microsoft YaHei","PingFang SC",system-ui,sans-serif}@media print{body{background:#fff}.rp-doc{width:auto;max-width:none;margin:0;padding:0;box-shadow:none}}\n${reportCss()}</style>`
    + `</head><body>${inner}${licenseMark() ? `<p style="margin:0 auto 24px;text-align:center;font-size:12px;color:#6b7280">${esc1(licenseMark())}</p>` : ''}${extra}</body></html>`;
}

function clearExam({ confirmed = false, message = assessDoc.session.clear_confirm } = {}) {
  if (!S.exam || S.taskOn || !store || !store.get('exam')) return false;
  if (!confirmed && !window.confirm(message)) return false;
  closeReport();
  store.clear('exam');
  const live = S.mode === 'practice';
  if (live) applyPractice(false);
  S.prac = freshPrac({ exam: true });
  if (S.case) dropCase();
  if (live) applyPractice(true);
  S.examExported = false;
  resetExamKit();
  pushAllMarks();
  if (S.mode !== 'equipment') setMode('equipment');
  resetExamBench();
  renderModes();
  renderPanel();
  syncExamKitCap();
  return true;
}

function restartTraining({ confirmed = false } = {}) {
  if (S.exam || !store || !practice || replayOn()) return false;
  if (!confirmed && !window.confirm(assessDoc.session.restart_confirm)) return false;
  store.clear('train');
  const live = S.mode === 'practice';
  if (live) applyPractice(false);
  S.prac = freshPrac();
  if (live) applyPractice(true);
  pushAllMarks();
  if (live) beginTrain();
  renderPanel();
  return true;
}

function replayFileInput() {
  let inp = $('replayFile');
  if (!inp) {
    inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = 'application/json,.json,text/html,.html';
    inp.id = 'replayFile';
    inp.hidden = true;
    inp.onchange = () => {
      const f = inp.files && inp.files[0];
      inp.value = '';
      if (!f) return;
      f.text().then((t) => openReplay(t)).catch(() => window.alert(assessDoc.replay.bad_file));
    };
    document.body.appendChild(inp);
  }
  return inp;
}
function pickReplayFile() { replayFileInput().click(); }

function openReplayBtn() {
  const b = el('button', '', esc(assessDoc.replay.open));
  b.dataset.act = 'replay-open';
  b.onclick = () => pickReplayFile();
  return b;
}

function openReplay(input) {
  const meta = typeof __BUILD_META__ === 'undefined' ? {} : __BUILD_META__;
  const parsed = parseSession(typeof input === 'string' ? sessionText(input) : input, meta);
  if (!parsed.ok) {
    window.alert(assessDoc.replay.bad_file);
    emit('replay:load', { session_id: '', ok: false, version_match: false });
    return null;
  }
  if (S.replay) exitReplay();
  if (S.taskOn) swapContext(false);
  S.replayHold = { exam: S.exam, mode: S.mode, prac: pracToJSON(S.prac), case: S.case };
  const doc = parsed.doc;
  const card = doc.mode === 'task' && doc.card ? { ...doc.card } : null;
  S.replay = {
    player: createReplay(doc, { caseSpecimen: CASE_ID }), t: 0, speed: 1, playing: false,
    version_match: parsed.version_match, last: 0, card,     task_id: card ? doc.task_id ?? null : null,
    thickness_mm: card ? doc.thickness_mm ?? 50 : null,
  };
  if (card) {
    const P = S.prac;
    P.calib.points = { ...CAL_RULES.targets_mm };
    P.dac.points = presetDac(card);
    Object.assign(P.done, { calibrate: true, dac: true });
  }
  emit('replay:load', { session_id: parsed.doc.session_id || '', ok: true, version_match: parsed.version_match });
  const go = () => { seekReplay(0, { user: true }); renderModes(); renderPanel(); };
  if (S.mode !== 'practice') setMode('practice').then(go);
  else go();
  return S.replay;
}

function exitReplay() {
  if (!S.replay) return false;
  const hold = S.replayHold;
  S.replay = null;
  S.replayHold = null;
  if (S.mode === 'practice') applyPractice(false);
  if (hold.case && S.case !== hold.case) applyCase(hold.case);
  else if (!hold.case && S.case) dropCase();
  S.prac = pracFromJSON(hold.prac, { exam: hold.exam, withCase: !!hold.case });
  S.exam = hold.exam;
  const finish = () => {
    if (S.mode === 'practice') applyPractice(true);
    pushAllMarks();
    renderModes();
    renderPanel();
  };
  if (S.mode !== hold.mode) setMode(hold.mode).then(finish);
  else finish();
  return true;
}

// Logged case plate rebuilt from template + seed (no event); its plate data restart with the plate.
function replayCase(c) {
  if (!c || sameCase(S.case, c)) return !!c;
  if (!rebuildCase(c)) return false;
  freshCasePlate();
  return true;
}

function applyReplayView(view) {
  if (!view?.specimen_id) return;
  const onCasePlate = replayCase(view.case);
  if (view.specimen_id === CASE_ID && !onCasePlate) return;
  if (!specMan.specimens[view.specimen_id]) return;
  const id = view.specimen_id;
  S.prac.specimen = id;
  if (isPlate(id)) S.prac.plateId = id;
  if (view.step && STEP_IDS.includes(view.step)) S.prac.step = view.step;
  Object.assign(S.prac.inst, view.inst);
  S.prac.inst.thickness_mm = specT(id);
  S.prac.inst.specimen_id = id;
  for (const pid of PLATE_IDS) S.prac.plates[pid].scan.trail = (view.trails[pid] || []).map((p) => [...p]);
  if (onCasePlate) {
    if (!S.prac.plates[CASE_ID]) freshCasePlate();
    S.prac.plates[CASE_ID].scan.trail = (view.trails[CASE_ID] || []).map((p) => [...p]);
  }
  for (const [sid, p] of Object.entries(view.probes || {})) {
    if (S.prac.probe[sid]) S.prac.probe[sid] = { x: p.x, y: p.y };
  }
  S.prac.probe[id] = { x: view.x_mm, y: view.y_mm };
  if (S.mode === 'practice' && practice) {
    practice.show(id);
    if (S.insp) {
      S.insp.thickness_mm = specT(id);
      S.insp.specimen_id = id;
    }
    placeProbe(view.x_mm, view.y_mm, { final: true, track: false });
    pushAllMarks();
  }
  inspKey = '';
}

function seekReplay(tMs, { user = false } = {}) {
  if (!S.replay) return null;
  const view = S.replay.player.seek(tMs);
  S.replay.t = view.t_ms;
  applyReplayView(view);
  if (user) emit('replay:seek', { t_ms: Math.round(view.t_ms) });
  syncReplayUi();
  return view;
}

function playReplay(on) {
  if (!S.replay) return;
  S.replay.playing = !!on;
  S.replay.last = on ? performance.now() : 0;
  if (on && S.replay.t >= S.replay.player.duration) seekReplay(0);
  syncReplayUi();
}

function tickReplay(now) {
  const rp = S.replay;
  if (!rp) return;
  if (rp.playing) {
    const dt = rp.last ? now - rp.last : 0;
    rp.last = now;
    const t = Math.min(rp.player.duration, rp.t + dt * rp.speed);
    seekReplay(t);
    if (t >= rp.player.duration) playReplay(false);
  } else if (now - timerLast > 250) {
    timerLast = now;
    syncReplayUi();
  }
}

function syncReplayUi() {
  const rp = S.replay;
  if (!rp) return;
  const t = $('replayTimer');
  if (t) t.textContent = fmtDur(rp.t);
  const sl = $('replaySeek');
  if (sl && document.activeElement !== sl) sl.value = String(Math.round(rp.t));
  const play = panel.querySelector('[data-act="replay-play"]');
  if (play) play.textContent = rp.playing ? assessDoc.replay.pause : assessDoc.replay.play;
}

function replayBar() {
  const R = assessDoc.replay;
  const rp = S.replay;
  const bar = el('div', 'sess-bar replay-bar');
  const dur = rp.player.duration;
  const marks = rp.player.markers.map((m) => {
    const pct = dur ? (100 * m.t_ms / dur) : 0;
    return `<button type="button" data-act="replay-mark" data-t="${m.t_ms}" style="left:${pct}%">${esc(R.markers[m.mark] || m.mark)}</button>`;
  }).join('');
  bar.innerHTML = `<div class="replay-top"><div class="sess-info"><span>${esc(R.title)}</span>`
    + `<b id="replayTimer">${fmtDur(rp.t)}</b><span>/ ${esc(fmtDur(dur))}</span></div><div class="replay-btns"></div></div>`
    + `<div class="replay-track"><div class="replay-marks">${marks}</div>`
    + `<input id="replaySeek" type="range" min="0" max="${Math.max(dur, 1)}" value="${Math.round(rp.t)}"></div>`;
  const btns = bar.querySelector('.replay-btns');
  const play = el('button', 'primary', esc(rp.playing ? R.pause : R.play));
  play.dataset.act = 'replay-play';
  play.onclick = () => playReplay(!S.replay.playing);
  btns.appendChild(play);
  for (const sp of REPLAY_SPEEDS) {
    const b = el('button', S.replay.speed === sp ? 'on' : '', `${sp}×`);
    b.dataset.act = 'replay-speed';
    b.dataset.speed = String(sp);
    b.onclick = () => { S.replay.speed = sp; syncReplayUi(); bar.querySelectorAll('[data-act=replay-speed]').forEach((x) => x.classList.toggle('on', Number(x.dataset.speed) === S.replay.speed)); };
    btns.appendChild(b);
  }
  const ex = el('button', '', esc(R.exit));
  ex.dataset.act = 'replay-exit';
  ex.onclick = () => exitReplay();
  btns.appendChild(ex);
  bar.querySelectorAll('[data-act=replay-mark]').forEach((b) => {
    b.onclick = () => { playReplay(false); seekReplay(Number(b.dataset.t), { user: true }); };
  });
  const sl = bar.querySelector('#replaySeek');
  sl.oninput = () => seekReplay(Number(sl.value));
  sl.onchange = () => seekReplay(Number(sl.value), { user: true });
  return bar;
}

function renderReplayPanel() {
  const A = assessDoc;
  const R = A.replay;
  const rp = S.replay;
  const L = UI.inspection;
  const id = S.prac.specimen;
  const home = el('div', 'home insp-home prac-home replay-home');
  const hero = el('div', 'hero home-hero insp-hero', `<h2>${esc(R.title)}${rp.task_id ? ` · ${esc(taskNo(rp.task_id))}` : ''}</h2>`);
  if (!rp.version_match) hero.insertAdjacentHTML('beforeend', `<span class="replay-tag">${esc(R.version_mismatch)}</span>`);
  home.appendChild(hero);
  home.appendChild(replayBar());
  home.appendChild(el('div', 'prac-std', esc(practiceDoc.specimens[id]?.header || '')));
  const cams = el('div', 'insp-cams');
  for (const [k, name] of Object.entries(L.cameras)) {
    const b = el('button', k === S.inspCam ? 'active' : '', esc(name));
    b.dataset.cam = k;
    b.onclick = () => setInspCamera(k);
    cams.appendChild(b);
  }
  home.appendChild(cams);
  const pos = el('div', 'prac-pos');
  pos.id = 'pracPos';
  home.appendChild(pos);
  const scope = el('div', 'insp-scope');
  const title = el('div', 'cc-title', `${esc(L.ascan)}<span class="insp-scene">${esc(practiceDoc.specimens[id]?.name || '')} · ${specT(id)} ${esc(L.unit_mm)}</span>`
    + (rp.version_match ? '' : `<span class="replay-ref">${esc(R.reference_only)}</span>`));
  scope.appendChild(title);
  const cv = el('canvas', 'insp-canvas');
  cv.id = 'inspScope';
  scope.appendChild(cv);
  const read = el('div', 'prac-read');
  read.id = 'pracRead';
  scope.appendChild(read);
  home.appendChild(scope);
  if (isPlate(id)) {
    home.appendChild(el('div', 'pc-sub', esc(A.coverage.title)));
    const box = el('div', 'pc-kv');
    box.id = 'pcCov';
    box.innerHTML = covKv(id);
    home.appendChild(box);
  }
  panel.appendChild(home);
  syncPracticeReadout();
  inspKey = '';
}

function sessionBar() {
  if (S.learning.role !== 'exam') return document.createDocumentFragment();
  const A = assessDoc.session;
  const s = store?.get(S.taskOn ? 'task' : S.exam ? 'exam' : 'train');
  const bar = el('div', 'sess-bar');
  bar.id = 'sessBar';
  const st = s?.header.student;
  bar.innerHTML = '<div class="sess-info">'
    + (st ? `<b class="sess-who">${esc(st.name)}</b><span>${esc(st.student_no)}</span>` : '')
    + (S.taskOn ? `<b class="sess-who">${esc(taskNo(S.taskRun))}</b>` : '')
    + `<span>${esc(A.elapsed)}</span><b id="sessTimer">${fmtDur(s ? s.activeMs() : 0)}</b>`
    + (s?.header.interruptions ? `<span class="sess-int">${esc(A.interruptions)} ${s.header.interruptions}</span>` : '')
    + '</div><div class="sess-btns"></div>';
  const btns = bar.querySelector('.sess-btns');
  const exp = el('button', '', esc(A.export_log));
  exp.dataset.act = 'export-log';
  exp.disabled = !s;
  exp.onclick = () => exportSessionLog();
  btns.appendChild(exp);
  if (S.taskOn) return bar;
  btns.appendChild(openReplayBtn());
  if (!S.exam) {
    const re = el('button', '', esc(A.restart));
    re.dataset.act = 'restart';
    re.onclick = () => restartTraining();
    btns.appendChild(re);
  } else if (s && !s.locked) {
    const ab = el('button', '', esc(A.abandon));
    ab.dataset.act = 'abandon';
    ab.onclick = () => clearExam({ message: A.abandon_confirm });
    btns.appendChild(ab);
  }
  return bar;
}

// Top view of a plate (x right, y up): reference rectangles, regions and points, numbered in plate order.
function plateMapSvg(defects, ref, dims) {
  const L = dims.length.value;
  const W = dims.width.value;
  const pad = 14;
  const X = (x) => (pad + L / 2 + x).toFixed(1);
  const Y = (y) => (pad + W / 2 - y).toFixed(1);
  const box = (r, c, dash) => `<rect x="${X(r.x0)}" y="${Y(r.y1)}" width="${(r.x1 - r.x0).toFixed(1)}" height="${(r.y1 - r.y0).toFixed(1)}" fill="${c}" fill-opacity="0.25" stroke="${c}" stroke-width="1.5"${dash ? ' stroke-dasharray="6 4"' : ''}/>`;
  const dot = (x, y, c, r = 4) => `<circle cx="${X(x)}" cy="${Y(y)}" r="${r}" fill="${c}"/>`;
  const marks = defects.map((d, i) => {
    const c = d.color || '#b45309';
    const r = ref.rects?.[d.id];
    const [cx, cy] = d.centre_mm;
    let g = '';
    if (r && r.x0 != null) g += box(r, c, false);
    else if (d.type === 'segregation') g += box({ x0: d.region_mm.x[0], x1: d.region_mm.x[1], y0: d.region_mm.y[0], y1: d.region_mm.y[1] }, c, true);
    if (d.type === 'cluster') g += d.members.map((m) => dot(m.x_mm, m.y_mm, c, 2.5)).join('');
    else if (!r || r.x0 == null) g += dot(cx, cy, c);
    return `${g}<text x="${X(cx)}" y="${Y(cy)}" dx="7" dy="-7" font-size="15" font-weight="800" fill="#0f172a">${i + 1}</text>`;
  }).join('');
  return `<svg class="tz-map" viewBox="0 0 ${L + 2 * pad} ${W + 2 * pad}"><rect x="${pad}" y="${pad}" width="${L}" height="${W}" fill="#f8fafc" stroke="#64748b" stroke-width="2"/>`
    + `<line x1="${pad}" y1="${pad + W / 2}" x2="${pad + L}" y2="${pad + W / 2}" stroke="#cbd5e1" stroke-dasharray="4 6"/>`
    + `<line x1="${pad + L / 2}" y1="${pad}" x2="${pad + L / 2}" y2="${pad + W}" stroke="#cbd5e1" stroke-dasharray="4 6"/>${marks}</svg>`;
}

// Plate of case `cs` (a fixed-template code: P-02) with its reference answer at the teacher's level.
function tzPreview(cs) {
  const T = S.teacher;
  const LV = practiceDoc.levels;
  const GS = STD.grading;
  const fixed = cs.specimen_id !== CASE_ID;
  const sp = fixed ? specMan.specimens[EVAL_SPEC] : cs.plate;
  const src = fixed ? refOf(EVAL_SPEC) : { defects: cs.plate.defects, ref: cs.reference };
  const t = refTable(cs.specimen_id, T.level, null, src);
  const tpl = cs.library_id ? `${CASE_TEXT.library} · ${caseNo(cs.library_id)}`
    : cs.requested_template && cs.requested_template !== cs.template_id
      ? `${CASE_TEXT.templates[cs.requested_template]} · ${CASE_TEXT.templates[cs.template_id]}` : CASE_TEXT.templates[cs.template_id];
  const out = el('div', 'tz-preview');
  out.innerHTML = `<div class="pc-kv"><span>${esc(CASE_TEXT.template)}</span><b>${esc(tpl)}</b><span>${esc(CASE_TEXT.plate_code)}</span><b>${esc(fixed ? practiceDoc.specimens[EVAL_SPEC].name : sp.code)}</b></div>`
    + plateMapSvg(src.defects, src.ref, sp.dims)
    + `<div class="pc-sub">${esc(PL.level)}</div><div class="pc-targets">${GS.levels.map((k) => `<button data-tzlv="${k}" class="${k === T.level ? 'on' : ''}">${esc(LV[k])}</button>`).join('')}</div>`
    + refTableHtml(t);
  return out;
}

const caseNo = (id) => CASE_TEXT.case_no.replace('{id}', id);

// Reference table rows of refTable(…, null, src) with the plate grade and conclusion.
function refTableHtml(t) {
  const LV = practiceDoc.levels;
  return (t.rows.length ? `<table class="pc-table pc-ref"><thead><tr>${t.head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${t.rows.map((r) => `<tr>${r.cells.map((c, i) => (i ? `<td>${esc(c)}</td>` : `<td><b>${esc(c)}</b></td>`)).join('')}</tr>`).join('')}</tbody></table>` : '')
    + `<div class="pc-kv"><span>${esc(PL.plate_grade)}</span><b>${esc(LV[t.plate])}</b><span>${esc(PL.conclusion)}</span><b>${esc(t.pass == null ? PL.no_value : t.pass ? PL.accept : PL.reject)}</b></div>`;
}

// ------------------------------------------------------------------ case library page (contracts/cases.json library)
let libCache = null;
const libCases = () => (libCache ||= caseLib().library().map((e) => caseLib().libraryCase(e.id)).filter(Boolean));
const LIB = { sel: new Set(), active: null, level: null, code: null, codeIds: [] };

function libDetail(cs) {
  const t = refTable(CASE_ID, LIB.level, null, { defects: cs.plate.defects, ref: cs.reference });
  return `<section class="rp-sec lib-detail" data-detail="${cs.library_id}"><h2>${esc(caseNo(cs.library_id))} · ${esc(CASE_TEXT.templates[cs.template_id])} · ${esc(cs.plate.code)}</h2>`
    + `<div class="lib-detail-body">${plateMapSvg(cs.plate.defects, cs.reference, cs.plate.dims)}<div>${refTableHtml(t)}</div></div></section>`;
}

function libCard(cs) {
  const LV = practiceDoc.levels;
  const exp = cs.reference.expected;
  const id = cs.library_id;
  const types = [...new Set(cs.plate.defects.map((d) => CASE_TEXT.types[d.type]))].join(' · ');
  const concl = LIB.level ? `<span>${esc(PL.conclusion)} <b>${esc(exp[LIB.level].pass ? PL.accept : PL.reject)}</b></span>` : '';
  return `<div class="lib-card${LIB.sel.has(id) ? ' on' : ''}${LIB.active === id ? ' active' : ''}" data-lib="${id}">`
    + `<label class="lib-pick"><input type="checkbox" data-pick="${id}"${LIB.sel.has(id) ? ' checked' : ''}><b>${esc(caseNo(id))}</b></label>`
    + plateMapSvg(cs.plate.defects, cs.reference, cs.plate.dims)
    + `<div class="lib-kv"><span>${esc(CASE_TEXT.displays.replace('{n}', cs.plate.defects.length))}</span><span>${esc(types)}</span>`
    + `<span>${esc(PL.plate_grade)} <b>${esc(LV[exp.plate_grade])}</b></span>${concl}</div></div>`;
}

function libHtml() {
  const all = libCases();
  const LV = practiceDoc.levels;
  const GS = STD.grading;
  const groups = [...new Set(all.map((c) => c.template_id))];
  const codeKv = LIB.code ? `<div class="pc-kv lib-code"><span>${esc(CASE_TEXT.code)}</span><b>${esc(LIB.code)}</b><span>${esc(CASE_TEXT.selected)}</span><b>${esc(LIB.codeIds.join(' · '))}</b></div>` : '';
  const book = all.filter((c) => !LIB.sel.size || LIB.sel.has(c.library_id));
  const active = all.find((c) => c.library_id === LIB.active);
  return `<h1>${esc(CASE_TEXT.library)}</h1>`
    + `<div class="lib-screen"><div class="lib-tools"><div class="pc-targets">${GS.levels.map((k) => `<button data-liblv="${k}" class="${k === LIB.level ? 'on' : ''}">${esc(LV[k])}</button>`).join('')}</div>`
    + `<button data-act="lib-all">${esc(CASE_TEXT.select_all)}</button><button data-act="lib-clear">${esc(CASE_TEXT.clear)}</button>`
    + `<span class="lib-count">${esc(CASE_TEXT.selected)} ${LIB.sel.size}</span></div>${codeKv}`
    + (active ? libDetail(active) : '')
    + groups.map((g) => `<section class="rp-sec"><h2>${esc(CASE_TEXT.templates[g])}</h2><div class="lib-grid">${all.filter((c) => c.template_id === g).map(libCard).join('')}</div></section>`).join('')
    + `</div><div class="lib-book">${codeKv}${book.map(libDetail).join('')}</div>`;
}

// Teacher case library: browse, select, case code, print; no events, live state untouched.
function openLibrary() {
  if (S.learning.role !== 'teacher') return;
  if (!practice) return null;
  closeReport();
  const view = document.createElement('div');
  view.id = 'reportView';
  view.className = 'rp-view lib-view';
  view.innerHTML = `<div class="rp-bar"><button class="primary" data-act="lib-code">${esc(CASE_TEXT.make_code)}</button>`
    + `<button data-act="print">${esc(assessDoc.report.print)}</button><button data-act="close">${esc(assessDoc.report.close)}</button></div><article class="rp-doc lib-doc"></article>`;
  const doc = view.querySelector('.lib-doc');
  const draw = () => {
    doc.innerHTML = libHtml();
    view.querySelector('[data-act=lib-code]').disabled = !LIB.sel.size;
  };
  const setSel = (fn) => { fn(); LIB.code = null; LIB.codeIds = []; draw(); };
  view.addEventListener('click', (ev) => {
    const t = ev.target;
    const pick = t.closest('[data-pick]');
    if (pick) { const id = pick.dataset.pick; setSel(() => (LIB.sel.has(id) ? LIB.sel.delete(id) : LIB.sel.add(id))); return; }
    if (t.closest('.lib-pick')) return;
    const lv = t.closest('[data-liblv]');
    if (lv) { LIB.level = LIB.level === lv.dataset.liblv ? null : lv.dataset.liblv; draw(); return; }
    const act = t.closest('[data-act]')?.dataset.act;
    if (act === 'lib-all') { setSel(() => libCases().forEach((c) => LIB.sel.add(c.library_id))); return; }
    if (act === 'lib-clear') { setSel(() => LIB.sel.clear()); return; }
    if (act === 'lib-code' && LIB.sel.size) {
      LIB.codeIds = libCases().map((c) => c.library_id).filter((id) => LIB.sel.has(id));
      LIB.code = caseLib().encodeLibrary(LIB.codeIds);
      S.teacher.code = LIB.code;
      S.teacher.cs = null;
      S.teacher.bad = false;
      draw();
      return;
    }
    if (act === 'print') { window.print(); return; }
    if (act === 'close') { closeReport(); renderPanel(); return; }
    const card = t.closest('[data-lib]');
    if (card) {
      LIB.active = LIB.active === card.dataset.lib ? null : card.dataset.lib;
      draw();
      if (LIB.active) doc.querySelector('.lib-detail')?.scrollIntoView({ block: 'nearest' });
    }
  });
  draw();
  document.body.appendChild(view);
  document.body.classList.add('rp-open');
  return view;
}

function renderTeachingPreparation() {
  const home = el('div', 'home teaching-preparation');
  home.appendChild(el('div', 'hero home-hero', `<h2>${esc(WF.preparation_title)}</h2>`));
  home.appendChild(el('ol', 'preparation-steps', WF.preparation_steps.map((step) => `<li>${esc(step)}</li>`).join('')));
  S.teacher.open = true;
  home.appendChild(quantModeBox());
  home.appendChild(teacherZone());
  panel.appendChild(home);
}

function quantModeBox() {
  const Q = V5.quant_mode;
  const box = el('div', 'v5-quant-mode');
  if (!teacherAccess()) return box;
  const draw = () => {
    const cur = quantMode();
    box.innerHTML = `<div class="pc-sub">${esc(Q.title)}</div><div class="pc-targets">${[['system', Q.system], ['manual', Q.manual]]
      .map(([k, v]) => `<button type="button" data-qm="${k}" class="${k === cur ? 'on' : ''}" aria-pressed="${k === cur}">${esc(v)}</button>`).join('')}</div>`;
    box.querySelectorAll('button[data-qm]').forEach((b) => { b.onclick = () => { setQuantMode(b.dataset.qm); draw(); }; });
  };
  draw();
  return box;
}

// Teacher zone: case codes and plate preview; no events, live state untouched.
function teacherZone() {
  const box = el('div', 'v4-teacher-cases');
  if (!teacherAccess()) return box;
  const select = el('select'); select.setAttribute('aria-label', V4.select_case);
  const selected = S.teacher.selectedId || casesDoc.library.cases[0].id;
  select.innerHTML = casesDoc.library.cases.map((entry) => '<option value="' + esc(entry.id) + '"' + (entry.id === selected ? ' selected' : '') + '>' + esc(V4.case_prefix + entry.id) + '</option>').join('');
  box.appendChild(select);
  const content = el('div'); box.appendChild(content);
  const show = () => {
    S.teacher.selectedId = select.value || selected;
    const cs = caseLib().libraryCase(S.teacher.selectedId);
    S.teacher.cs = cs; content.innerHTML = '';
    if (cs && !cs.failed) content.appendChild(tzPreview(cs));
  };
  select.onchange = show; show();
  const button = el('button', 'primary', esc(V4.teach_case));
  button.onclick = () => launchLearning({ role: 'teacher', route: 'fullscan' }); box.appendChild(button);
  return box;
}

function renderExamBench() {
  if (replayOn()) { renderReplayPanel(); return; }
  if (examLocked()) { renderExamDone(); return; }
  if (!store?.get('exam')) {
    renderExamPickKit({
      order: S.eqKitOrder,
      couplantOn: !!S.eqKit?.eq__couplant,
      couplantVal: S.eqExamCouplant,
      setCouplant: (v) => { S.eqExamCouplant = v; },
      onFinish: finishPlateExamKit,
    });
    return;
  }
  const box = el('div', 'eq-panel exam-panel');
  box.appendChild(el('div', 'hero home-hero', '<h2>' + esc(V4.detection_title) + '</h2>'));
  syncExamKitCap();
  box.appendChild(sessionBar());
  const button = el('button', 'primary', esc(V4.continue_detection)); button.onclick = () => setMode('practice'); box.appendChild(button);
  panel.appendChild(box);
}

async function openStationBench(opts = {}) {
  if (!practice || !assembly) return false;
  if (S.labStation == null) S.labStation = 0;
  const st = stationDef();
  const track = st?.id || 'plate';
  closeStdPage(); closeTaskPage(); closeReport();
  await closePaut();
  closePautExamPage();
  $('stationEqDlg')?.remove();
  Object.assign(S.learning, { role: 'student', route: 'bench' });
  document.body.dataset.learningRole = 'student';
  document.body.dataset.learningRoute = 'bench';
  document.body.dataset.track = track === 'weld' ? 'plate' : track;
  document.body.dataset.station = track;
  delete document.body.dataset.weldBench;
  delete document.body.dataset.pautBench;
  delete document.body.dataset.pautExamBench;
  closeAngle();
  closeStudy();
  if (S.taskOn) leaveTask();
  if (S.exam) swapContext(false);
  S.selected = null; S.isolated = null; updateVisibility(); refreshMaterials(true);
  S.ssDev = null;
  S.ssEq = 'devices';
  S.stationPanel = opts.panel === 'principle' || opts.panel === 'flow' ? opts.panel : 'phases';
  S.studyKit = { ...(stationProgOf().ids || {}) };
  S.studyKitPhase = 'picking';
  hideStudyStageCap();
  setStudy('self');
  selectEq(null);
  if (S.mode !== 'equipment') await setMode('equipment', { force: true });
  else { renderModes(); renderPanel(); }
  applyStudyMethodFilter();
  learningShell?.update({ role: 'student', route: 'bench' });
  syncLabRoomBack();
  return true;
}
function openStudyBench(opts) { return openStationBench(opts); }

async function openStationPrep() {
  const st = stationDef();
  if (!st || (!stationKitDone() && !reviewOpen())) return;
  stationProgOf().prep = true;
  if (stationTreeOn()) {
    S.stationPanel = 'prep';
    renderPanel();
    return;
  }
  const track = st.id;
  S.learning.route = st.prep?.[0] || null;
  document.body.dataset.learningRoute = S.learning.route || 'home';
  document.body.dataset.track = track;
  learningShell?.showTopics?.({ track, lockTrack: true });
  renderPanel();
}

function openStationPrinciple() {
  if ((!stationKitDone() && !reviewOpen()) || !stationTreeOn()) return;
  S.stationPanel = 'principle';
  renderPanel();
}

async function openStationFlow() {
  const st = stationDef();
  if ((!stationKitDone() && !reviewOpen()) || !st) return;
  stationProgOf().prep = true;
  if (st.id === 'weld') {
    S.stationPanel = 'flow';
    renderPanel();
    return;
  }
  if (st.id !== 'plate') return;
  return launchFlowStudy({ role: 'student', route: 'fullscan' });
}

async function enterStationProbe() {
  const id = stationDef()?.id;
  if (id === 'weld') return studyGo('angle-structure', 'display');
  if (id !== 'plate') return;
  return enterProbeTeardown();
}

async function openStationCalib() {
  if (stationDef()?.id !== 'weld' || (!stationKitDone() && !reviewOpen())) return;
  stationProgOf().prep = true;
  return launchWeld({ role: 'student', route: 'angle-calib' });
}

async function openStationScan() {
  if (stationDef()?.id !== 'weld' || (!stationKitDone() && !reviewOpen())) return;
  stationProgOf().prep = true;
  return launchWeld({ role: 'student', route: 'angle-scan' });
}

async function enterStationInstrument() {
  if (stationDef()?.id !== 'plate') return;
  return studyGo('equipment', 'wave');
}

function stationEqCard(id) {
  const o = eqIntroOf(id);
  if (!o) return '';
  const src = EQ_DRAWINGS[o.drawing];
  const drawing = src
    ? `<h4>${esc(SC.drawing)}</h4><button type="button" class="ssd-draw" data-act="drawing" data-eq="${esc(id)}"><img src="${src}" alt="${esc(eqName(id))}"></button>`
    : '';
  const mats = eqSectionsOf(id).material || [];
  const material = mats.length
    ? `<h4>${esc(eqDoc.section_titles.material)}</h4><ul>${mats.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`
    : '';
  return `<section class="station-eq-card"><h3>${esc(eqName(id))}</h3>`
    + `<h4>${esc(SC.role)}</h4><p>${esc(o.role)}</p>`
    + `<h4>${esc(SC.parts)}</h4><ul>${(o.parts || []).map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`
    + `${drawing}${material}</section>`;
}

function openStationEqDialog(ids) {
  const list = [].concat(ids).filter((id) => eqIntroOf(id));
  if (!list.length) return;
  $('stationEqDlg')?.remove();
  const flow = learningDoc.station_flow || {};
  const title = list.length > 1 ? (flow.blocks || eqName(list[0])) : eqName(list[0]);
  const box = el('div', 'ss-draw station-eq-dlg');
  box.id = 'stationEqDlg';
  box.innerHTML = `<div class="ss-dev"><header><b>${esc(title)}</b>`
    + `<button type="button" class="ssd-x" title="${esc(SC.close)}">×</button></header>`
    + `<div class="ssd-body">${list.map(stationEqCard).join('')}</div></div>`;
  box.addEventListener('click', (ev) => {
    const draw = ev.target.closest('[data-act=drawing]');
    if (draw?.dataset.eq) { openSsDrawing(draw.dataset.eq); return; }
    if (ev.target === box || ev.target.closest('.ssd-x')) box.remove();
  });
  viewport.appendChild(box);
}

async function openStationTrain() {
  const st = stationDef();
  if (!st || (!stationProgOf().prep && !reviewOpen())) return;
  stationProgOf().train = true;
  const route = st.train;
  if (route === 'assessment') return launchLearning({ role: 'exam', route: 'assessment' });
  if (route === 'angle-exam') return launchWeld({ role: 'exam', route: 'angle-exam' });
  if (route === 'paut-exam') return launchPaut({ role: 'exam', route: 'paut-exam' });
}

async function openStationEval() {
  const st = stationDef();
  if (!st || (!stationProgOf().train && !reviewOpen())) return;
  const route = st.eval;
  if (STUDY_ROUTES[route]) return launchStudy({ role: 'student', route });
}

function packStationKit() {
  if (!reviewOpen() && (!stationKitDone() || !stationProgOf().train)) return;
  stationProgOf().packed = true;
  assembly?.reset?.();
  equipment?.resetLayout?.();
  selectEq(null);
  applyStudyMethodFilter();
  renderPanel();
}

function endStationExperiment() {
  packStationKit();
  return openLabRoom().then(() => showLabSitCap());
}

function studyKitHead(title, backLabel, onBack) {
  const head = el('div', 'study-kit-head');
  head.appendChild(el('h2', '', esc(title)));
  const back = el('button', 'study-kit-back', esc(backLabel));
  back.type = 'button';
  back.onclick = onBack;
  head.appendChild(back);
  return head;
}

function studyKitMods(items) {
  const list = el('div', 'study-kit-list');
  items.forEach((ph, i) => {
    const locked = !!ph.locked;
    const row = el(ph.subs ? 'div' : 'button', `study-kit-mod${ph.on ? ' on' : ''}${locked ? ' wait' : ''}`);
    if (!ph.subs) {
      row.type = 'button';
      row.disabled = locked;
    }
    row.innerHTML = `<span class="study-kit-idx">${String(i + 1).padStart(2, '0')}</span>`
      + `<span class="study-kit-ico" data-kind="${esc(ph.kind || 'instruments')}" aria-hidden="true"></span>`
      + `<span class="study-kit-body"><b>${esc(ph.label)}</b></span>`
      + `<span class="study-kit-mark" aria-hidden="true"></span>`;
    if (!ph.subs && !locked) row.onclick = ph.go;
    if (!ph.subs) {
      list.appendChild(row);
      return;
    }
    const wrap = el('div', 'study-kit-end');
    wrap.appendChild(row);
    const acts = el('div', 'study-kit-end-acts');
    for (const sub of ph.subs) {
      const b = el('button', 'study-kit-end-act', esc(sub.label));
      b.type = 'button';
      b.disabled = locked;
      if (!locked) b.onclick = sub.go;
      acts.appendChild(b);
    }
    wrap.appendChild(acts);
    list.appendChild(wrap);
  });
  return list;
}

function stationPrepMods() {
  const flow = learningDoc.station_flow || {};
  const weld = stationDef()?.id === 'weld';
  return [
    { id: 'principle', label: flow.principle || '实验原理', go: () => openStationPrinciple() },
    { id: 'flow', label: weld ? (flow.flow_group || '实验流程') : (flow.flow || '检测流程'), go: () => openStationFlow() },
  ];
}
function stationPrincipleMods() {
  const flow = learningDoc.station_flow || {};
  if (stationDef()?.id === 'weld') {
    return [
      { id: 'probe', label: flow.angle_probe || '斜探头', kind: 'probes', go: () => enterStationProbe() },
    ];
  }
  return [
    { id: 'probe', label: flow.probe || '直探头', kind: 'probes', go: () => enterStationProbe() },
    { id: 'inst', label: flow.instrument || '探伤仪', kind: 'instruments', go: () => enterStationInstrument() },
    { id: 'block', label: flow.blocks || '标准试块', kind: 'blocks', go: () => openStationEqDialog(['eq__compare', 'eq__cbii_2']) },
    { id: 'coup', label: flow.couplant || '耦合剂', kind: 'couplant', go: () => openStationEqDialog(['eq__couplant']) },
  ];
}
function stationFlowMods() {
  const flow = learningDoc.station_flow || {};
  return [
    { id: 'calib', label: flow.calib || '试块与校准', kind: 'blocks', go: () => openStationCalib() },
    { id: 'scan', label: flow.flow || '检测流程', kind: 'accessories', go: () => openStationScan() },
  ];
}

function renderStudyBench() {
  syncStudyBenchBanner();
  S.studyKitPhase = 'picking';
  const flow = learningDoc.station_flow || {};
  const spec = (labRoomCopy.stations || [])[S.labStation] || {};
  const box = el('div', 'eq-panel exam-panel study-bench-panel');
  const panelKind = stationTreeOn() ? (S.stationPanel || 'phases') : 'phases';
  if (panelKind === 'prep') {
    box.appendChild(studyKitHead(flow.prep || '实验预习', SC.back || '返回', () => { S.stationPanel = 'phases'; renderPanel(); }));
    box.appendChild(studyKitMods(stationPrepMods()));
    panel.appendChild(box);
    return;
  }
  if (panelKind === 'principle') {
    box.appendChild(studyKitHead(flow.principle || '实验原理', SC.back || '返回', () => { S.stationPanel = 'prep'; renderPanel(); }));
    box.appendChild(studyKitMods(stationPrincipleMods()));
    panel.appendChild(box);
    return;
  }
  if (panelKind === 'flow') {
    box.appendChild(studyKitHead(flow.flow_group || '实验流程', SC.back || '返回', () => { S.stationPanel = 'prep'; renderPanel(); }));
    box.appendChild(studyKitMods(stationFlowMods()));
    panel.appendChild(box);
    return;
  }
  box.appendChild(studyKitHead(spec.kit_label || spec.title || '本实验', labRoomCopy.back, () => openLabRoom()));
  const cap = el('aside', 'study-kit-cap');
  cap.innerHTML = `<p>${esc(spec.title || '')}</p><p>${esc(flow.open || '点击工具箱，核对本实验器材')}</p>`;
  box.appendChild(cap);
  const kitReady = stationKitDone();
  const prog = stationProgOf();
  const free = reviewOpen();
  box.appendChild(studyKitMods([
    { id: 'prep', label: flow.prep || '实验预习', locked: !free && (!kitReady || studyRevealPlaying), on: !!prog.prep, go: () => openStationPrep() },
    { id: 'train', label: flow.train || '实训操作', locked: !free && (!prog.prep || studyRevealPlaying), on: !!prog.train, go: () => openStationTrain() },
    { id: 'eval', label: flow.eval || '实验评价', locked: !free && (!prog.train || studyRevealPlaying), on: !!prog.train, go: () => openStationEval() },
    {
      id: 'end', label: flow.end || '结束实验', kind: 'accessories',
      locked: !free && (!prog.train || studyRevealPlaying), on: !!prog.packed,
      subs: [
        { label: flow.tidy || '整理工具', go: () => packStationKit() },
        { label: flow.end || '结束实验', go: () => endStationExperiment() },
      ],
    },
  ]));
  panel.appendChild(box);
}

// ------------------------------------------------------------------ process report (docs/M8_SCOPE.md §6)
// Same scope drawing as the live screen; noise seed fixed so the record reproduces.
function shotImage(sh, w = 640) {
  const st = sh.inst;
  const fr = wave.synth(st, { columns: 480, noise: true, seed: 1 });
  applyReject(fr, st.reject_percent);
  const gate = gateOf(st);
  const gateRead = gateReading(fr, gate);
  const e = gateRead && gateRead.echo;
  const d = e && sh.dac.length >= 2 ? proc.f1MinusDac(sh.dac, e.x_mm, e.pct, st.gain_dB) : null;
  const off = document.createElement('canvas');
  drawScope(off, fr, {
    header: scopeHeader(st, null, true), labels: scopeLabels(), sweepUs: null,
    gate, gateRead, gateText: { s: PANEL.gate.s, h: PANEL.gate.h, mm: UI.inspection.unit_mm },
    tag: scopeTag(st, false, true), message: null, peak: null,
    dac: st.dac_show && sh.dac.length ? proc.curve(sh.dac, st.gain_dB) : null, dacLabel: PL.dac,
    gateExtra: d == null ? null : `${PRD.f1_dac} ${fmtDb(d)}`,
    width: w, height: Math.round(w * 0.75), dpr: 2, scale: w / 320,
  });
  return off.toDataURL('image/png');
}

function reportModel() {
  const A = assessDoc;
  const RP = A.report;
  const R = A.rubric;
  const RS = practiceDoc.results;
  const LV = practiceDoc.levels;
  const P = S.prac;
  const h = store?.get(S.exam ? 'exam' : 'train')?.header || {};
  const mm = UI.inspection.unit_mm;
  const dB = PRD.unit_dB;
  const NA = PL.no_value;
  const num = (v) => (Number.isInteger(v) ? String(v) : v.toFixed(1));
  const t0 = h.started_at ? new Date(h.started_at) : null;
  const date = t0 ? `${t0.getFullYear()}-${pad2(t0.getMonth() + 1)}-${pad2(t0.getDate())} ${pad2(t0.getHours())}:${pad2(t0.getMinutes())}` : NA;
  const es = evalSpec();
  const plate = P.plates[es];
  const holes = specMan.specimens[dacSpecimen()].holes;
  const sc = (P.score ||= examScore());
  const pos = (sh) => ` · ${PL.x} ${sh.inst.probe_x_mm.toFixed(0)} · ${PL.y} ${sh.inst.probe_y_mm.toFixed(0)} ${mm}`;

  const specs = [CAL_RULES.specimen, dacSpecimen(), es];
  const codeTpl = h.case_code ? caseLib().decode(h.case_code).template_id : null;
  const kit = [
    ...specs.map((id, i) => [i ? '' : RP.specimen, specHeader(id)]),
    [CASE_TEXT.template, codeTpl === casesDoc.library?.id ? `${CASE_TEXT.library} · ${caseNo(caseLib().libraryOf(S.case) ?? '')}` : CASE_TEXT.templates[codeTpl || h.template_id || FIXED_TPL.id]],
    ...(h.case_code ? [[CASE_TEXT.code, h.case_code]] : []),
    [RP.probe, `${UI.scope} · ${manifest.reference_physics.f0_MHz} ${UI.lab.unit_MHz} · Φ${manifest.parameters.active_element_diameter.value} ${mm}`],
  ];

  const cp = P.calib.points;
  const T = CAL_RULES.targets_mm;
  const both = cp.B1 != null && cp.B2 != null;
  const calInst = P.shots.calibrate?.inst || P.inst;
  const calib = {
    caption: A.steps.calibrate,
    head: ['', `${PL.target} / ${mm}`, `${PL.reading} / ${mm}`],
    rows: [
      ...Object.entries(T).map(([k, v]) => [k, v.toFixed(1), cp[k] == null ? NA : cp[k].toFixed(2)]),
      [PL.interval, (T.B2 - T.B1).toFixed(1), both ? (cp.B2 - cp.B1).toFixed(2) : NA],
      [UI.inspection.velocity, '', P.done.calibrate ? `${calInst.velocity_m_s} ${UI.inspection.unit_m_s}` : NA],
      [PRD.zero, '', P.done.calibrate ? `${calInst.zero_us.toFixed(2)} ${PRD.unit_us}` : NA],
    ],
  };
  const dac = {
    caption: A.steps.dac,
    head: ['', `S / ${mm}`, `${PL.reading} / ${mm}`, `${PRD.G} / ${dB}`],
    rows: holes.map((hl) => {
      const p = P.dac.points.find((q) => q.id === hl.id);
      return [`Φ${hl.diameter_mm}`, hl.S_mm.toFixed(0), p ? p.S.toFixed(1) : NA, p ? p.G.toFixed(1) : NA];
    }),
  };
  const sens = {
    caption: A.steps.sensitivity,
    head: ['', `${PRD.G} / ${dB}`],
    rows: [
      [PRD.base, P.sens ? P.sens.base.toFixed(1) : NA],
      [PRD.compensation, String(STD.compensation.default_dB)],
      [PRD.scan, P.sens ? P.sens.scan.toFixed(1) : NA],
    ],
  };

  const cov = coverageOf(es);
  const m = cov.metrics();
  const O = COV.overlay;
  const C = A.coverage;
  const LG = RP.legend;
  const figure = {
    img: coverageImage(cov, {
      trail: plate.scan.trail,
      found: plate.scan.found.map((f, i) => ({ x: f.x, y: f.y, label: String(i + 1) })),
      colors: { ...O, ...O.report },
      px: O.report.px_per_mm,
      maxSeg: COV.max_segment_mm,
    }),
    caption: specHeader(es),
    legend: [
      { color: O.swept, label: LG.swept }, { color: O.near, label: LG.near },
      { color: O.edge_line, label: LG.edge_zone, line: true }, { color: O.report.trail, label: LG.trail, line: true },
      { color: O.report.found, label: LG.found },
    ],
  };

  const scanKeys = plate.scan.found.map((f) => `scan:${f.id}`).filter((k) => P.shots[k]);
  const shotKeys = ['calibrate', ...holes.map((hl) => `dac:${hl.id}`), ...(scanKeys.length ? scanKeys : ['scan']),
    ...plate.scan.found.flatMap((f) => [`quantify:${f.id}`, `quantify:${f.id}:eq`])];
  const caption = (k, sh) => {
    const [step, id, sub] = k.split(':');
    if (step === 'calibrate') return `${A.steps.calibrate} · ${PL.done}`;
    if (step === 'dac') return `${A.steps.dac} · S ${holes.find((hl) => hl.id === id).S_mm} ${mm}`;
    if (step === 'scan') return `${A.steps.scan} · ${V5.scan_shot} · ${defName(id ?? plate.scan.found[0].id, es)}${pos(sh)}`;
    if (sub === 'eq') return `${A.steps.quantify} · ${V5.eq_shot} · ${defName(id, es)}${pos(sh)}`;
    return `${A.steps.quantify} · ${defName(id, es)}${pos(sh)}`;
  };
  const images = shotKeys.filter((k) => P.shots[k]).map((k) => ({ img: shotImage(P.shots[k]), caption: caption(k, P.shots[k]) }));

  const qrows = plate.scan.found.filter((f) => plate.quant.results[f.id]).map((f) => {
    const r = plate.quant.results[f.id];
    return [defName(f.id, es), r.length.toFixed(1), r.area.toFixed(0), r.eq == null ? NA : fmtDb(r.eq)];
  });

  const E = P.eval;
  const items = evalItems();
  const erows = items.map((it) => [defName(it.id, es), it.length == null ? NA : it.length.toFixed(1), it.S_mm2 == null ? NA : it.S_mm2.toFixed(0),
    it.D_dB == null ? NA : fmtDb(it.D_dB), E.verdicts[it.id] ? practiceDoc.verdicts[E.verdicts[it.id]] : NA]);

  const srows = sc.items.map((it) => [R.items[it.id], num(it.points), it.max ? String(it.max) : '', { text: R.status[it.status], cls: `sc-${it.status}` }]);

  const rt = refTable(es, E.level || null, plate.scan.found);
  const rrows = rt.rows.map((r) => (r.hit ? r.cells : [{ text: r.cells[0], cls: 'ng' }, ...r.cells.slice(1)]));
  const calls = (E.result?.false_calls || []).map((id) => defName(id, es));

  return {
    title: RP.title,
    meta: [[A.start.name, h.student?.name ?? ''], [A.start.student_no, h.student?.student_no ?? ''], [RP.date, date],
      [A.session.elapsed, fmtDur(h.active_ms)], [A.session.interruptions, String(h.interruptions || 0)]],
    sections: [
      { title: `${RP.specimen} / ${RP.probe}`, parts: [{ kv: kit }] },
      { title: P.presetPlan ? `${RP.readings} · ${V4.prepared_by_system}` : RP.readings, parts: [{ tables: [calib, dac, sens] }] },
      { title: RP.coverage, parts: [{ figure }, { kv: [[C.edge, pct(m.edge)], [C.middle, pct(m.middle)], [C.whole, pct(m.whole)], ...qualityRows(es),
        ...(detectionTraining() ? [[V5.hint_count, String(P.hints?.length || 0)], [V5.tip_count, String(new Set((P.tips || []).map((t) => t.step)).size)]] : [])] }] },
      { title: RP.ascan, cls: 'rp-ascan', parts: images.length ? [{ images }] : [{ kv: [[RP.ascan, NA]] }] },
      { title: RP.quantify, parts: [qrows.length ? { table: { head: ['', `${RS.length} / ${RS.unit_mm}`, `${RS.area} / ${RS.unit_mm2}`, RS.equivalent], rows: qrows } } : { kv: [[RS.title, NA]] }] },
      {
        title: RP.evaluate,
        parts: [
          { kv: [[PL.level, E.level ? LV[E.level] : NA]] },
          ...(erows.length ? [{ table: { head: ['', `${RS.length} / ${RS.unit_mm}`, `S / ${RS.unit_mm2}`, `D / ${dB}`, PL.verdict], rows: erows } }] : []),
          { kv: [[PL.plate_grade, E.plate ? LV[E.plate] : NA], [PL.conclusion, E.conclusion ? (E.conclusion === 'accept' ? PL.accept : PL.reject) : NA],
            [WF.self_consistent, sc.self_consistent == null ? NA : sc.self_consistent ? RP.yes : RP.no],
            [WF.missed, (E.result?.missed || []).length ? E.result.missed.map((id) => indName(id)).join(' / ') : WF.missed_none],
            [CASE_TEXT.false_call, calls.length ? calls.join(' / ') : NA]] },
        ],
      },
      {
        title: CASE_TEXT.reference,
        parts: [
          ...(rrows.length ? [{ table: { head: rt.head, rows: rrows } }] : []),
          { kv: [[PL.plate_grade, LV[rt.plate]], [PL.conclusion, rt.pass == null ? NA : rt.pass ? PL.accept : PL.reject]] },
        ],
      },
      ...(es === CASE_ID && S.case ? [{ title: V5.case_map, parts: [{ figure: {
        img: svgDataUrl(plateMapSvg(S.case.plate.defects, S.case.reference, S.case.plate.dims)),
        caption: `${S.case.library_id ? `${caseNo(S.case.library_id)} · ` : ''}${specHeader(es)}`,
      } }] }] : []),
      { title: RP.score, parts: [{ table: { head: [R.columns.item, R.columns.points, R.columns.max, R.columns.status], rows: srows, foot: [R.total, num(sc.total), String(sc.max), ''] } }] },
    ],
  };
}

function openExamReport() {
  if (!examLocked() || !practice || !wave || !proc) return null;
  const no = String(store?.get('exam')?.header.student?.student_no || '').replace(/[^\w-]/g, '_');
  return stampReport(openReport(reportModel(), {
    printLabel: assessDoc.report.print,
    closeLabel: assessDoc.report.close,
    onPrint: () => emit('session:export', { kind: 'report' }),
  }), `UTreport_exam${no ? `-${no}` : ''}_${fileStamp()}`);
}

// Signature line under a printed report; `pdfName` becomes the document title while printing (default PDF file name).
function stampReport(view, pdfName = '') {
  if (!view) return view;
  const mark = licenseMark();
  if (mark) view.insertAdjacentHTML('beforeend', `<p class="rp-lic">${esc(mark)}</p>`);
  if (pdfName) view.dataset.pdf = pdfName;
  return view;
}
let printTitle = document.title;
addEventListener('beforeprint', () => {
  const name = document.getElementById('reportView')?.dataset.pdf;
  printTitle = document.title;
  if (name) document.title = name;
});
addEventListener('afterprint', () => { document.title = printTitle; });

// Per-indication verdict, correct verdict and the limit band it falls in; plate grade and conclusion.
function evalFeedback() {
  const E = S.prac.eval;
  const res = E.result;
  const VD = practiceDoc.verdicts;
  const LV = practiceDoc.levels;
  const NA = PL.no_value;
  const C = V5.eval_feedback;
  const rows = evalItems().map((it, i) => {
    const vb = verdictBands(E.level, it);
    const truth = res.truth.verdicts[it.id];
    const ok = res.ok[it.id];
    const basis = vb && vb.at != null ? `${vb.value} · ${vb.bands[vb.at][0]}` : VD.none;
    return `<tr class="has-lim"><td><b>${esc(PL.indication)} ${i + 1}</b><small>${esc(CASE_TEXT.types[typeOf(it.id)] || '')}</small></td><td>${esc(vb?.value || NA)}</td>`
      + `<td class="${ok ? 'ok' : 'ng'}">${esc(VD[E.verdicts[it.id]] || NA)}</td><td>${esc(VD[truth] || NA)}</td></tr>`
      + `<tr class="pc-lim"><td colspan="4">${esc(C.basis)}：${esc(basis)}</td></tr>`;
  }).join('');
  const kv = [
    [WF.missed, res.missed?.length ? res.missed.map((id) => CASE_TEXT.types[typeOf(id)] || id).join(' / ') : WF.missed_none, res.missed?.length ? 'ng' : 'ok'],
    [PL.counted_n, `${res.truth.counted} / ${Number(res.truth.maxCount.toFixed(2))}`],
    [PL.plate_grade, res.plate ? LV[E.plate] : `${LV[E.plate]} · ${PL.expected} ${LV[res.grade]}`, res.plate ? 'ok' : 'ng'],
    [PL.conclusion, res.conclusion ? (E.conclusion === 'accept' ? PL.accept : PL.reject) : `${PL.expected} ${res.concl === 'accept' ? PL.accept : PL.reject}`, res.conclusion ? 'ok' : 'ng'],
  ];
  return el('div', 'exam-eval', `<div class="pc-sub">${esc(C.title)} · ${esc(PL.level)} ${esc(LV[E.level] || '')}</div>`
    + `<table class="pc-table" id="examEval"><thead><tr><th></th><th>${esc(C.measured)}</th><th>${esc(C.yours)}</th><th>${esc(C.truth)}</th></tr></thead><tbody>${rows}</tbody></table>`
    + `<div class="pc-kv exam-kv">${kv.map(([k, v, cls]) => `<span>${esc(k)}</span><b class="${cls || ''}">${esc(v)}</b>`).join('')}</div>`);
}

function renderExamDone() {
  const A = assessDoc;
  const s = store?.get('exam');
  const box = el('div', 'eq-panel exam-panel exam-done');
  box.appendChild(el('div', 'hero home-hero', `<h2>${esc(A.title)}</h2><span class="truth">${esc(A.session.submitted)}</span>`));
  if (s) {
    const h = s.header;
    const rows = [[A.start.name, h.student?.name], [A.start.student_no, h.student?.student_no], [A.session.elapsed, fmtDur(h.active_ms)], [A.session.interruptions, String(h.interruptions || 0)],
      ...(detectionTraining() ? [[V5.hint_count, String(S.prac.hints?.length || 0)], [V5.tip_count, String(new Set((S.prac.tips || []).map((t) => t.step)).size)]] : [])];
    box.appendChild(el('div', 'pc-kv exam-kv', rows.map(([k, v]) => `<span>${esc(k)}</span><b>${esc(v ?? '')}</b>`).join('')));
  }
  if (practice && s) {
    const R = A.rubric;
    const sc = (S.prac.score ||= examScore());
    const num = (v) => (Number.isInteger(v) ? String(v) : v.toFixed(1));
    const rows = sc.items.map((it) => `<tr><td><b>${esc(R.items[it.id])}</b></td><td>${num(it.points)}</td><td>${it.max || ''}</td><td class="sc-${it.status}">${esc(R.status[it.status])}</td></tr>`).join('');
    box.appendChild(el('div', 'exam-score', `<div class="pc-sub">${esc(R.title)}</div><table class="pc-table" id="examScore"><thead><tr><th>${esc(R.columns.item)}</th><th>${esc(R.columns.points)}</th><th>${esc(R.columns.max)}</th><th>${esc(R.columns.status)}</th></tr></thead>`
      + `<tbody>${rows}</tbody><tfoot><tr><td><b>${esc(R.total)}</b></td><td><b>${num(sc.total)}</b></td><td>${sc.max}</td><td></td></tr></tfoot></table>`));
  }
  if (practice && detectionTraining() && S.prac.eval?.result) box.appendChild(evalFeedback());
  if (practice) {
    const C = A.coverage;
    const rows = examPlates().map((id) => {
      const m = coverageOf(id).metrics();
      return `<tr><td><b>${esc(specName(id))}</b></td><td>${pct(m.edge)}</td><td>${pct(m.middle)}</td><td>${pct(m.whole)}</td></tr>`;
    }).join('');
    box.appendChild(el('div', 'exam-cov', `<div class="pc-sub">${esc(C.title)}</div><table class="pc-table" id="examCov"><thead><tr><th></th><th>${esc(C.edge)}</th><th>${esc(C.middle)}</th><th>${esc(C.whole)}</th></tr></thead><tbody>${rows}</tbody></table>`));
  }
  const btns = el('div', 'exam-btns');
  if (practice && s) {
    const rep = el('button', 'primary', esc(A.session.export_report));
    rep.dataset.act = 'report';
    rep.onclick = () => openExamReport();
    btns.appendChild(rep);
  }
  const exp = el('button', 'primary', esc(A.session.export_log));
  exp.dataset.act = 'export-log';
  exp.onclick = () => exportSessionLog('exam');
  btns.appendChild(exp);
  btns.appendChild(openReplayBtn());
  const clr = el('button', '', esc(A.session.exit));
  clr.dataset.act = 'clear';
  clr.onclick = () => clearExam({ message: S.examExported ? A.session.exit_confirm : A.session.exit_unexported });
  btns.appendChild(clr);
  box.appendChild(btns);
  panel.appendChild(box);
}

let recLast = 0;
let timerLast = 0;
function recTick(now) {
  if (replayOn()) { tickReplay(now); return; }
  if (S.learning.role !== 'exam' || !store || now - recLast < 50) return;
  recLast = now;
  const mode = sessMode();
  const s = mode && store.get(mode);
  if (!s) return;
  if (!s.locked) {
    let moved = false;
    if (S.mode === 'practice' && practice) {
      const p = S.prac.probe[S.prac.specimen];
      if (p) moved = s.frame(S.prac.specimen, p.x, p.y);
      moved = s.inst(S.prac.inst) || moved;
    }
    moved = s.keyframe(keyState) || moved;
    if (moved) store.touch(mode);
  }
  if (now - timerLast > 500) {
    timerLast = now;
    const t = $('sessTimer');
    if (t) t.textContent = fmtDur(s.activeMs());
  }
}

function bootSessions() {
  if (!store || !practice || !assembly) return;
  const saved = store.load('exam');
  if (saved) {
    const { session } = store.resume('exam', saved);
    const selection = saved.state?.prac?.librarySelection;
    const cs = selection?.source === 'thickness' ? thickness().libraryCase(selection.id)
      : selection ? caseLib().libraryCase(selection.id) : replayCase(caseAt(session.header, session.log));
    S.caseExam = cs && !cs.failed ? cs : null;
    if (S.caseExam) specMan.specimens[CASE_ID] = S.caseExam.plate;
    S.examPrac = pracFromJSON(saved.state?.prac, { exam: true, withCase: !!S.caseExam });
    if (saved.state?.prac?.presetPlan) {
      S.examPrac.presetPlan = saved.state.prac.presetPlan;
      S.examPrac.presetCard = saved.state.prac.presetCard;
      S.examPrac.librarySelection = selection;
      const block = blockIdOf(S.examPrac.presetCard.reference_block);
      if (block !== PR.dac.specimen) addBlock(block);
    }
  }
  S.learning.role = null; S.learning.route = null;
  document.body.dataset.learningRole = 'home'; document.body.dataset.learningRoute = 'home';
  setStudy('self'); renderModes(); renderPanel();
}

// Task run from the stored task session: plate from the header case, card from the header; true when it was the live context.
function restoreTask() {
  const tk = store.load('task');
  if (!tk) return false;
  const { session, gap_s } = store.resume('task', tk);
  const h = session.header;
  if (tk.state?.active && tk.state?.learning) Object.assign(S.learning, tk.state.learning);
  if (tk.state?.active && h.student) S.learning.student = { ...h.student };
  const c = caseAt(h, session.log);
  const cs = c ? makeCase(c.template_id, c.seed, h.thickness_mm || 50) : null;
  if (!taskcard.task(h.task_id) || !h.card || !cs || cs.failed || cs.specimen_id !== CASE_ID) {
    store.clear('task');
    return false;
  }
  S.caseTask = { ...cs, library_id: cs.library_id || caseLib().libraryOf(cs) };
  S.taskPrac = pracFromJSON(tk.state?.prac, { exam: true, withCase: true, task: true });
  Object.assign(S.taskPrac, { specimen: CASE_ID, plateId: CASE_ID });
  S.taskPrac.card ||= { ...h.card };
  const bid = blockIdOf(h.card.reference_block);
  if (bid !== PR.dac.specimen) addBlock(bid);
  S.task.context = h.initial?.learning ? { role: h.initial.learning.role, taskMode: h.initial.learning.taskMode } : null;
  S.taskRun = h.task_id;
  S.task.id = h.task_id;
  Object.assign(taskCard(h.task_id), { raw: Object.fromEntries(Object.entries(h.card).map(([k, v]) => [k, String(v)])), card: { ...h.card }, confirmed: true, miss: [] });
  emit('session:restore', { mode: 'task', session_id: h.session_id, gap_s });
  return !!tk.state?.active;
}

function frame(now) {
  requestAnimationFrame(frame);
  stepTweens(now);
  recTick(now);
  // Angle overlay owns the frame; weld-method equipment on the shared bench must keep rendering.
  if (document.body.dataset.track === 'weld' && !document.body.dataset.weldBench) return;
  controls.update();
  if (S.mode === 'labroom') {
    camera.near = 0.15;
    camera.far = 56;
    labRoom?.updateShell(camera.position);
    labRoom?.tick?.(now);
  } else if (S.mode === 'equipment') {
    const dist = camera.position.distanceTo(controls.target);
    camera.near = Math.max(0.02, dist / 35);
    camera.far = Math.max(16, dist * 10);
  } else {
    camera.near = 0.002;
    camera.far = 12;
  }
  camera.updateProjectionMatrix();
  if (root && S.mode !== 'labroom') {
    if (hoverQueued) {
      const { x, y } = hoverQueued;
      hoverQueued = null;
      const ctl = pickControlAt(x, y);
      if (ctl) {
        setHover(null);
        const r = viewport.getBoundingClientRect();
        tooltip.hidden = false;
        tooltip.textContent = controlName(ctl);
        tooltip.style.left = `${x - r.left}px`;
        tooltip.style.top = `${y - r.top}px`;
        canvas.style.cursor = 'pointer';
      } else setHover(pickAt(x, y), x, y);
    }
    if (anchorsDirty && now - lastAnchorPass > 140) {
      computeAnchors();
      anchorsDirty = false;
      lastAnchorPass = now;
    }
    updateCable();
    weldPrep?.tick?.(now);
    equipment?.tick?.(now);
    updateMarks();
    updateXray();
    updateGuide(now);
    updateHelp(now);
    tickInspection(now);
    tickBench(now);
    tickPhysics(now);
    layoutLabels();
    updateMarkers();
  }
  renderer.render(scene, camera);
}

// ------------------------------------------------------------------ boot
store = createSessionStore({
  meta: { ...(typeof __BUILD_META__ === 'undefined' ? {} : __BUILD_META__), rubric_version: scoring.rubric().rubric_version },
  stateOf,
});
window.addEventListener('pagehide', () => store.flush());
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') store.flush(); });
renderModes();
renderStudy();
buildControls();
new GLTFLoader().load(glbUrl, (gltf) => {
  const labelTexture = new THREE.TextureLoader().load(nameplateUrl);
  labelTexture.colorSpace = THREE.SRGBColorSpace;
  labelTexture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  applyProbeAppearance(gltf.scene, { appearance: probeAppearance, manifest, labelTexture });
  initParts(gltf);
  initStack();
  physics = createPhysics({
    scene,
    parts,
    physicsRef: derived.physics,
    chainColors: Object.fromEntries(Object.entries(UI.chains).map(([k, c]) => [k, c.color])),
    airLabel: UI.scene_labels.air,
  });
  applyExplode(0);
  refreshMaterials(true);
  dimEnvironment(false);
  resize();
  const pose = viewPose(VIEWS.equipment || VIEWS.exterior);
  camera.position.copy(pose.pos);
  controls.target.copy(pose.target);
  wave = createWaveform({ rules: waveRules, manifest, dampingCycles: scenesDoc.teaching_settings.lab.damping_cycles, scenarios: inspDoc.scenarios, specimens: specMan });
  insp = createInspection({ rules: waveRules, wave, scenarios: inspDoc.scenarios });
  proc = createProcedure({ rules: waveRules, wave, specimens: specMan, standard: stdPack });
  ROOT_BASE.copy(root.position);
  new GLTFLoader().load(instGlbUrl, (ig) => {
    const connectorTopY = tmpBox.setFromObject(parts['probe__connector'].obj).max.y;
    CONNECTOR_TOP = connectorTopY;
    instrument = createInstrument({ scene, gltf: ig, man: instMan, connectorTopY, signalColor: UI.chains.electrical.color });
    instrument.place.updateMatrixWorld(true);
    INST_HOME_INV.copy(instrument.place.matrixWorld).invert();
    instrument.labelKeys(Object.fromEntries(Object.entries(PANEL.keys).map(([k, v]) => [k, v.label])), PANEL_INACTIVE);
    for (const p of instrument.parts) {
      p.kb = KB[p.pid];
      for (const m of p.meshes) meshToPart.set(m, p);
    }
    new GLTFLoader().load(specGlbUrl, (sg) => {
      practice = createPractice({ scene, gltf: sg, man: specMan, benchY: instMan.system_layout.bench_top_y_mm * 0.001 });
      window.__probe.practice = practice;
      new GLTFLoader().load(eqGlbUrl, (eg) => {
        equipment = createEquipment({
          scene, man: eqMan, gltf: eg, practice, instrument, root, rootBase: ROOT_BASE, parts,
          benchY: instMan.system_layout.bench_top_y_mm * 0.001,
          angleGlbUrl, pautGlbUrl: pautProbeGlbUrl, tofdGlbUrl: tofdProbeGlbUrl,
          pautInstrumentGlbUrl, cskIaGlbUrl,
        });
        assembly = createAssembly({
          scene, man: eqMan, equipment, instrument, practice, probeRoot: root,
          benchY: instMan.system_layout.bench_top_y_mm * 0.001, connectorTop: CONNECTOR_TOP, placeProbe: benchProbe,
        });
        weldPrep = createWeldPrep({ scene, benchY: instMan.system_layout.bench_top_y_mm * 0.001 });
        window.__probe.equipment = equipment;
        window.__probe.selectEq = selectEq;
        Object.assign(window.__probe, {
          assembly, autoAssemble, redoAssembly, setEqPan,
          benchScan: () => benchFrame && {
            pulse: benchPulse,
            echoes: benchFrame.echoes.map((e) => ({ type: e.type, id: e.id, pct: Math.round(e.pct * 10) / 10, x_mm: Math.round(e.x_mm * 10) / 10 })),
            peak: Math.round(Math.max(...benchFrame.hi) * 10) / 10,
          },
          // Screen point (client px) of a bench handle / target, for drag tests.
          benchScreen: (name) => {
            const st = assembly.state;
            const MMv = 0.001;
            const by = instMan.system_layout.bench_top_y_mm * MMv;
            let w;
            if (name === 'plug_a' || name === 'plug_b') {
              const g = name === 'plug_a' ? instrument.plugA : instrument.plugB;
              w = new THREE.Vector3(0, instMan.cable.plug.length_mm * 0.5 * MMv, 0).applyMatrix4(g.matrixWorld);
            } else if (name === 'port_tr' || name === 'port_r') w = instrument.portEnd(name === 'port_tr' ? 'tr' : 'r').pos;
            else if (name === 'connector') w = probeOffset.clone().setY(probeOffset.y + CONNECTOR_TOP);
            else if (name === 'probe') w = probeOffset.clone().setY(probeOffset.y + CONNECTOR_TOP * 0.45);
            else if (name === 'bottle') w = equipment.bottle.localToWorld(new THREE.Vector3(0, 0.06, 0));
            else if (name === 'plate') { const b = equipment.poseOf('eq__plate'); w = new THREE.Vector3(b.x * MMv, assembly.plateTop, b.z * MMv); }
            else if (name.startsWith('eq__')) {
              const c = equipment.hullCircle(name), f = equipment.footprints()[name];
              if (c && f) w = new THREE.Vector3(c.x * MMv, (f.y0 + (f.y1 - f.y0) * 0.6) * MMv, c.z * MMv);
            }
            else if (name === 'bench') w = new THREE.Vector3(st.probe.x * MMv - 0.08, by, st.probe.z * MMv);
            if (!w) return null;
            return P_screen(w);
          },
          worldScreen: (x, y, z) => P_screen(new THREE.Vector3(x, y, z)),
        });
        function P_screen(w) {
          const p = w.clone().project(camera), r = canvas.getBoundingClientRect();
          return { x: r.left + (p.x + 1) / 2 * r.width, y: r.top + (1 - p.y) / 2 * r.height };
        }
        Object.assign(window.__probe, {
          openExam, startExam, submitExam, exportSessionLog, clearExam, restartTraining, swapContext, stateOf,
          openReplay, exitReplay, seekReplay, playReplay, parseSession,
          setMobileTab, syncCompact,
          get store() { return store; },
          session: (mode) => store.get(mode || sessMode() || 'train'),
        });
        labRoom = createLabRoom(scene, { onBriefDone: () => showLabSitCap(), freeSit: () => reviewOpen() });
        labRoom.mountHint(viewport);
        labRoom.hint.addEventListener('click', (ev) => {
          if (ev.target.closest('[data-lab-catalog]')) {
            ev.preventDefault();
            openLabCatalog();
          }
        });
        renderModes();
        bootSessions();
        initLearningShell();
        worldReady = true;
        openLabRoom().finally(() => {
          $('loading').classList.add('done');
          showLicenseGate();
        });
      }, undefined, (err) => {
        window.__probeError = String(err && (err.stack || err.message || err));
        console.error(err);
      });
    }, undefined, (err) => {
      window.__probeError = String(err && (err.stack || err.message || err));
      console.error(err);
    });
    renderModes();
    renderPanel();
    syncControls();
    window.__probe = { S, parts, launchLearning, setMode, select, emit, on, setStudy, probeHeightRatio, startScene, setSceneStep, sceneHome, setPlaying, setMatchingLayer, setMagnify, setLabFrequency, setLabDiameter, setLabDamping, resetLab, setStep, physics, instrument, wave, insp, setInspCamera, drawInspection, exportPracticeWave, inspPulse, inspContinuous, inspPause, inspReset, setInsp, setInspScene, runExperiment,
      pressPanelKey, turnPanelEncoder, softKeys, setStd, openStdPage, closeStdPage, stdView, selectEq, gateNow: () => lastFrame && gateReading(lastFrame, gateOf()), pickControlAt,
      keyScreen: (id) => {
        const o = id === 'encoder' ? instrument.encoder : instrument.keys[id]?.obj;
        if (!o) return null;
        const p = o.getWorldPosition(new THREE.Vector3()).project(camera), r = canvas.getBoundingClientRect();
        return { x: r.left + (p.x + 1) / 2 * r.width, y: r.top + (1 - p.y) / 2 * r.height };
      },
      inspSeek: (tc) => { insp.seek(tc); inspKey = ''; onInspPhase(insp.st.phase); }, inspView: () => inspView,
      setSpecimen, setPracticeSection, setPracticeStep, practiceRecord, setPracCtl, recordEq, undoBoundary, setQuantTarget, clearTrail, setGuide, guideChecks, findHole, toggleXray,
      markIndication, nextBlock, setEval, submitEval, evalItems, toggleCoverage, coverageSummary, help, toggleDemo, placeProbe, currentRecordCandidate,
      coverageOf: (id, P) => coverageOf(id, P).metrics(), examScore, scoring, reportModel, openExamReport, closeReport,
      coverVisible: (id) => practice.coverVisible(id ?? S.prac.plateId),
      loadCase, openCase, toggleCaseRef, caseLib, openLibrary,
      taskcard, openTaskPage, closeTaskPage, openTask, confirmTaskCard, startTask, taskPlan, dacPts,
      taskScore, taskConsistency, taskReportModel, openTaskReport, liveCard, thickness, addBlock, showThicknessCase,
      presetDac, taskCaseOf, dacSpecimen, blockIdOf,
      planVisible: () => practice.planVisible(CASE_ID),
      get case() { return S.case; },
      get proc() { return proc; },
      get dacAlarm() { return dacAlarmOn; },
      get angle() { return angleApp; },
      placeProbe: (x, y) => { const c = placeProbe(x, y, { final: true }); emitProbeMove(); return c; },
      probeScreen: () => {
        const p = probeOffset.clone().setY(probeOffset.y + 0.02).project(camera), r = canvas.getBoundingClientRect();
        return { x: r.left + (p.x + 1) / 2 * r.width, y: r.top + (1 - p.y) / 2 * r.height };
      },
      cable: () => instrument.endpoints() };
  }, undefined, (err) => {
    window.__probeError = String(err && (err.stack || err.message || err));
    console.error(err);
  });
}, undefined, (err) => {
  window.__probeError = String(err && (err.stack || err.message || err));
  console.error(err);
});
window.addEventListener('error', (e) => { window.__probeError = String(e.error && e.error.stack || e.message); });
requestAnimationFrame(frame);

