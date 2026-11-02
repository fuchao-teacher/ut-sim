// Angle-beam probe views (weld track): structure (display / explode / principle tabs in student self-study) and principle topics.
// Mounted once into the straight-probe page; open(route) / close() toggle it over the workspace.
import 'katex/dist/katex.min.css';
import './angle.css';
import katex from 'katex';
import glbUrl from '../../../assets/probe_angle_beam.glb?url';
import KN from '../../../knowledge/angle_parts.json';
import UI0 from '../../../knowledge/angle_ui.json';
import PR from '../../../knowledge/angle_principle.json';
import BM from '../../../knowledge/angle_beam.json';
import CB from '../../../knowledge/angle_calib.json';
import SC from '../../../knowledge/angle_scan.json';
import CD from '../../../knowledge/angle_card.json';
import AB from '../../../knowledge/angle_bench.json';
import ST from '../../../knowledge/angle_structure.json';
import cases from '../../../contracts/angle_cases.json';
import tasks from '../../../contracts/angle_tasks.json';
import derived from '../../../contracts/angle_derived_layout.json';
import manifest from '../../../contracts/angle_model_manifest.json';
import rules from '../../../contracts/angle_waveform_rules.json';
import blocks from '../../../contracts/angle_blocks.json';
import cal from '../../../contracts/angle_calibration.json';
import std from '../../../contracts/angle_standard_nbt47013_3_weld.json';
import { createViewer } from './viewer.js';
import { createBench } from './bench.js';
import { savePng, shotName, backdropOf } from '../snapshot.js';
import { createScope } from './scope.js';
import { renderDiagram } from './diagrams.js';
import { renderRefraction } from './principle.js';
import { renderBeamTopic } from './beam.js';
import { renderCalibTopic, resetCalib, CALIB_TOPICS } from './calibpage.js';
import { renderScanTopic, resetScan, resetExam, examSession, setExamBenchPrep, SCAN_TOPICS } from './scanpage.js';
import { renderCardTopic, resetDesign, CARD_TOPICS } from './cardpage.js';
import { renderCasesTopic } from './casepage.js';
import { createCalibHelp } from './calibhelp.js';
import { makeLessonVideoButton, closeLessonVideo } from './lesson-video.js';
import { learnVisit } from '../learnlog.js';

const UI = {
  ...UI0,
  diagrams: {
    ...UI0.diagrams,
    damping: { ...UI0.diagrams.damping, levels: { none: PR.damping_none, ...UI0.diagrams.damping.levels } },
  },
};
const BEAM_TOPIC_IDS = ['skip', 'block', 'exercise'];
const BEAM_TOPIC_SET = new Set(BEAM_TOPIC_IDS);
const PRINCIPLE_FLAT = new Set(['refraction', 'wedge_echo', 'damping']);
const PRINCIPLE_PAGES = ['refraction', 'wedge_echo', 'damping', ...BEAM_TOPIC_IDS];
export const ANGLE_ROUTES = {
  'angle-structure': ['display', 'explode'],
  'angle-principle': PRINCIPLE_PAGES,
  'angle-beam': BEAM_TOPIC_IDS,
  'angle-calib': CALIB_TOPICS,
  'angle-scan': SCAN_TOPICS,
  ...CARD_TOPICS,
  'angle-cases': ['cases'],
  'angle-exam': SCAN_TOPICS,
};
const ROUTE_PAGE = {
  'angle-principle': 'principle', 'angle-beam': 'beam', 'angle-calib': 'calib', 'angle-scan': 'scan',
  'angle-card': 'card', 'angle-design': 'card', 'angle-cases': 'cases', 'angle-exam': 'scan',
};
const ROUTE_TOPICS = {
  'angle-structure': { ...PR.topics, ...BM.topics },
  'angle-principle': { ...PR.topics, ...BM.topics },
  'angle-beam': BM.topics,
  'angle-calib': CB.topics, 'angle-scan': SC.topics,
  'angle-card': CD.topics, 'angle-design': CD.topics, 'angle-cases': CD.topics, 'angle-exam': SC.topics,
};
const TOPIC_DIAGRAM = { refraction: 'snell', wedge_echo: 'wedge_echo', damping: 'damping' };
const CARDS = Object.fromEntries(KN.parts.map((p) => [p.id, p]));
const NAMES = Object.fromEntries(KN.parts.map((p) => [p.id, p.name_zh]));
const TAB_KEYS = Object.keys(UI.parts.tabs);
const SCAN_STEP = { move: 1, move_fast: 5, turn: 3, turn_fast: 15 };
const KEY_MOVES = { ArrowUp: [0, 1], ArrowDown: [0, -1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
const KEY_PARTS = ['angle__wedge', 'angle__active_element', 'angle__backing', 'angle__absorber'];
const PRINCIPLE_TABS = { wedge_echo: ['principles', 'removal_effects'], damping: ['performance_impacts', 'misconceptions'] };
const guideOpen = () => document.body.dataset.learningRole === 'student';
const fillTip = (tpl, name) => String(tpl || '').replace(/\{name\}/g, name);

const make = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};
const SUB = /([A-Za-z\u0370-\u03ff])_([A-Za-z0-9]+)/g;
function rich(e, text) {
  let last = 0;
  for (const m of text.matchAll(SUB)) {
    e.appendChild(document.createTextNode(text.slice(last, m.index) + m[1]));
    e.appendChild(make('sub', '', m[2]));
    last = m.index + m[0].length;
  }
  e.appendChild(document.createTextNode(text.slice(last)));
  return e;
}
const makeRich = (tag, cls, text) => rich(make(tag, cls), text);
const listOf = (items) => {
  const ul = make('ul');
  for (const s of items) ul.appendChild(makeRich('li', '', s));
  return ul;
};

export function mountAngle(parent) {
  const root = make('div', 'angle-root');
  root.hidden = true;
  const nav = make('nav', 'ag-nav');
  const navTabs = make('div', 'ag-nav-tabs');
  const des = make('span', 'ag-designation', manifest.designation.marking);
  nav.append(navTabs, des);
  const body = make('div', 'ag-body');
  const loading = make('div', 'ag-loading');
  loading.append(make('div', 'ag-spinner'), make('span', '', UI.app.loading));
  loading.hidden = true;
  root.append(nav, body, loading);
  parent.appendChild(root);

  const page = (id, cls = '') => {
    const s = make('section', `ag-page ${cls}`.trim());
    s.dataset.page = id;
    body.appendChild(s);
    return s;
  };

  /** Vertical resize for cards / caption dock inside a side panel. */
  function bindSideCards(sideEl) {
    if (!sideEl || sideEl.dataset.cardSplitBound) return;
    sideEl.dataset.cardSplitBound = '1';
    const can = (el) => el?.classList
      && (el.classList.contains('ag-card') || el.classList.contains('ag-guide-dock') || el.classList.contains('ag-know'))
      && !el.hidden;
    const attach = (el) => {
      if (!can(el) || el.dataset.resz) return;
      el.dataset.resz = '1';
      el.classList.add('ag-card-resz');
      const grip = make('div', 'ag-card-split');
      grip.setAttribute('aria-hidden', 'true');
      el.appendChild(grip);
      let drag = null;
      grip.addEventListener('pointerdown', (ev) => {
        if (ev.button !== 0) return;
        drag = { y0: ev.clientY, h0: el.getBoundingClientRect().height };
        grip.setPointerCapture(ev.pointerId);
        el.classList.add('ag-card-sizing');
        ev.preventDefault();
        ev.stopPropagation();
      });
      grip.addEventListener('pointermove', (ev) => {
        if (!drag) return;
        const h = Math.max(72, Math.min(window.innerHeight * 0.7, drag.h0 + (ev.clientY - drag.y0)));
        el.style.height = `${Math.round(h)}px`;
        el.style.flex = '0 0 auto';
      });
      const end = () => { drag = null; el.classList.remove('ag-card-sizing'); };
      grip.addEventListener('pointerup', end);
      grip.addEventListener('pointercancel', end);
    };
    const scan = () => { [...sideEl.children].forEach(attach); };
    scan();
    new MutationObserver(scan).observe(sideEl, { childList: true, subtree: false });
  }

  /** Drag the boundary of `.ag-side` to resize model / side panels (survives side.innerHTML clears). */
  function bindSideSplit(pageEl) {
    const side = () => [...pageEl.children].find((el) => el.classList?.contains('ag-side'));
    if (!side()) return;
    const s0 = side();
    bindSideCards(s0);
    if (pageEl.querySelector(':scope > .ag-split')) return;
    pageEl.classList.add('ag-page-split');
    const grip = make('div', 'ag-split');
    grip.setAttribute('aria-hidden', 'true');
    pageEl.appendChild(grip);
    const place = () => {
      const s = side();
      if (!s) { grip.hidden = true; return; }
      grip.hidden = false;
      const pr = pageEl.getBoundingClientRect();
      const sr = s.getBoundingClientRect();
      grip.style.left = `${sr.left - pr.left - 5}px`;
    };
    let drag = null;
    grip.addEventListener('pointerdown', (ev) => {
      const s = side();
      if (ev.button !== 0 || !s) return;
      const pr = pageEl.getBoundingClientRect();
      const sr = s.getBoundingClientRect();
      drag = {
        x0: ev.clientX,
        w0: sr.width,
        min: 220,
        max: Math.max(260, Math.min(pr.width * 0.55, pr.width - 260)),
      };
      grip.setPointerCapture(ev.pointerId);
      pageEl.classList.add('ag-splitting');
      ev.preventDefault();
    });
    grip.addEventListener('pointermove', (ev) => {
      if (!drag) return;
      const w = Math.max(drag.min, Math.min(drag.max, drag.w0 + (drag.x0 - ev.clientX)));
      pageEl.style.setProperty('--ag-side-w', `${Math.round(w)}px`);
      place();
    });
    const end = () => { drag = null; pageEl.classList.remove('ag-splitting'); place(); };
    grip.addEventListener('pointerup', end);
    grip.addEventListener('pointercancel', end);
    new ResizeObserver(place).observe(pageEl);
    requestAnimationFrame(place);
  }
  const pDisplay = page('display', 'ag-page-stage');
  const pExplode = page('explode', 'ag-page-stage');
  const pParts = page('parts');
  const pPrin = page('principle');
  const pBeam = page('beam');
  const pCal = page('calib');
  const pScan = page('scan');
  const pCard = page('card');
  const pCases = page('cases');

  const ui = { route: null, page: null, partId: KN.groups[0].parts[0], partReturn: 'display', tab: 'definition', displayMode: 'exterior', labels: true, beam: false, defects: false, explode: 0, stopDiagram: null, topic: 'refraction', loaded: null, refr: null, bm: null, cal: null, sc: null };
  let viewer = null;
  const slots = {};

  // Guided learning (teacher / self-study): per-topic interaction record behind the guide ticks.
  const learn = {
    display: { orbit: false, modes: new Set(), beam: false, info: new Set(), hit: false },
    explode: { dis: false, order: new Set(), medium: new Set(), asm: false },
    parts: { parts: new Set(), tabs: new Set(), diagram: false },
    refraction: { seen: {}, away: false, nominal: false, curve: false },
    wedge_echo: { seen: new Set(), back: false, tabs: new Set() },
    damping: { seen: new Set(), tabs: new Set() },
  };
  let help = null;
  let helpKey = null;
  let coachEl = null;
  let driving = 0;
  const auto = (fn) => { driving++; try { return fn(); } finally { driving--; } };
  const userAct = () => { if (!driving) help?.cancel(); };
  const tick = () => help?.tick();
  function hideCoach() {
    coachEl?._agPlaceOff?.();
    coachEl?.remove();
    coachEl = null;
    navTabs.querySelectorAll('.ag-nav-pulse').forEach((b) => b.classList.remove('ag-nav-pulse'));
  }
  function pagesOf(route = ui.route) {
    if (route === 'angle-structure' && document.body.dataset.learningRole === 'student') {
      return [...ANGLE_ROUTES['angle-structure'], ...PRINCIPLE_PAGES];
    }
    return ANGLE_ROUTES[route] || [];
  }
  function nextTopicOf(id) {
    const route = pagesOf();
    const i = route.indexOf(id);
    return i >= 0 && i < route.length - 1 ? route[i + 1] : null;
  }
  function navLabelOf(id) {
    return ROUTE_TOPICS[ui.route]?.[id] ?? UI.nav[id] ?? id;
  }
  function showNextCoach(fromId, Cm) {
    if (!guideOpen() || !Cm) return;
    const nextId = nextTopicOf(fromId);
    hideCoach();
    if (!nextId) return;
    const btn = navTabs.querySelector(`button[data-page="${nextId}"]`);
    if (!btn) return;
    const name = navLabelOf(nextId);
    const tipTpl = Cm.guide_next_tips?.[fromId] || Cm.guide_next_tip;
    const tip = fillTip(tipTpl, name);
    if (!tip) return;
    btn.classList.add('ag-nav-pulse');
    const box = make('div', 'ag-next-coach ag-stage-note');
    box.appendChild(make('p', '', tip));
    const actions = make('div', 'ag-next-coach-actions');
    const go = make('button', 'ag-btn ag-coach-go', Cm.guide_go || name);
    go.type = 'button';
    go.addEventListener('click', () => { hideCoach(); show(nextId); });
    const later = make('button', 'ag-chip', Cm.guide_next_close || '');
    later.type = 'button';
    later.addEventListener('click', () => hideCoach());
    actions.append(go, later);
    box.appendChild(actions);
    root.appendChild(box);
    coachEl = box;
    // Center over the left bench / stage (not under the top tab strip).
    const stageOf = () => {
      const page = root.querySelector('.ag-page.active');
      return page?.querySelector('.ag-op-stage, .ag-stage, .ag-main, .dg-stage')
        || page?.querySelector(':scope > :not(.ag-side):not(.ag-split)')
        || page
        || root;
    };
    const place = () => {
      if (!coachEl || !coachEl.isConnected) return;
      const host = stageOf();
      const rr = root.getBoundingClientRect();
      const hr = host.getBoundingClientRect();
      const w = box.offsetWidth || 420;
      const h = box.offsetHeight || 160;
      const left = hr.left - rr.left + Math.max(12, (hr.width - w) / 2);
      const top = hr.top - rr.top + Math.max(12, (hr.height - h) / 2);
      box.style.left = `${Math.round(left)}px`;
      box.style.top = `${Math.round(top)}px`;
    };
    requestAnimationFrame(place);
    const onResize = () => place();
    window.addEventListener('resize', onResize);
    box._agPlaceOff = () => window.removeEventListener('resize', onResize);
  }
  const topicDone = (id, Cm) => () => showNextCoach(id, Cm);
  function stopHelp() {
    help?.stop();
    help = null;
    helpKey = null;
    hideCoach();
  }

  // ---------------------------------------------------------------- display
  const dStage = make('div', 'ag-stage');
  const dBar = make('div', 'ag-toolbar');
  const dSide = make('aside', 'ag-side');
  const paramsCard = make('div', 'ag-card');
  const scanCard = make('div', 'ag-card');
  const infoCard = make('div', 'ag-card');
  infoCard.hidden = true;
  const dDock = make('div', 'ag-guide-dock');
  dSide.append(dDock, paramsCard, scanCard, infoCard);
  pDisplay.append(dStage, dBar, dSide);
  bindSideSplit(pDisplay);
  slots.display = dStage;

  const modes = make('div', 'ag-seg');
  for (const [m, label] of Object.entries(UI.display.modes)) {
    const b = make('button', m === ui.displayMode ? 'active' : '', label);
    b.type = 'button';
    b.dataset.mode = m;
    b.addEventListener('click', () => { userAct(); setMode(m); });
    modes.appendChild(b);
  }
  function setMode(m) {
    ui.displayMode = m;
    modes.querySelectorAll('button').forEach((x) => x.classList.toggle('active', x.dataset.mode === m));
    syncBeamToggle();
    viewer?.setMode(m);
    viewer?.resetView();
    learn.display.modes.add(m);
    if (m === 'section' && ui.beam) learn.display.beam = true;
    tick();
  }
  const toggles = make('div', 'ag-seg ag-toggles');
  for (const [k, label] of Object.entries(UI.display.toggles)) {
    const b = make('button', ui[k] ? 'active' : '', label);
    b.type = 'button';
    b.dataset.toggle = k;
    if (UI.display.scan.keys[k]) b.title = UI.display.scan.keys[k];
    b.addEventListener('click', () => { userAct(); toggle(k); });
    toggles.appendChild(b);
  }
  const reset = make('button', 'ag-chip', UI.display.reset);
  reset.type = 'button';
  reset.addEventListener('click', () => { userAct(); viewer?.resetView(); });
  const shotBtn = (stage) => {
    const b = make('button', 'ag-chip', AB.export_image);
    b.type = 'button';
    b.addEventListener('click', () => { if (viewer) savePng(viewer.snapshot(backdropOf(stage)), shotName(AB.shot_probe)); });
    return b;
  };
  const videoBtn = () => makeLessonVideoButton(UI.video.button, UI.video.title);
  dBar.append(modes, toggles, reset, videoBtn(), shotBtn(dStage));

  function syncBeamToggle() {
    const b = toggles.querySelector('[data-toggle="beam"]');
    if (b) b.disabled = ui.displayMode !== 'section';
  }
  syncBeamToggle();
  function toggle(k) {
    ui[k] = !ui[k];
    toggles.querySelector(`[data-toggle="${k}"]`)?.classList.toggle('active', ui[k]);
    if (!viewer) return;
    if (k === 'labels') viewer.setLabels(ui.labels);
    else if (k === 'beam') viewer.setBeam(ui.beam);
    else viewer.setDefects(ui.defects);
    if (k === 'beam' && ui.beam && ui.displayMode === 'section') learn.display.beam = true;
    trackHits(viewer.track());
  }
  function trackHits(t) {
    if (ui.page === 'display' && ui.defects && t?.hits?.length) learn.display.hit = true;
    tick();
  }

  {
    const ph = derived.physics;
    const d = manifest.designation;
    const u = UI.units;
    const vals = {
      designation: d.marking,
      frequency: `${d.frequency_MHz} ${u.MHz}`,
      element: `${d.element_mm[0]} × ${d.element_mm[1]} ${u.mm}`,
      K: `${d.K}`,
      beta: `${ph.beta_deg.toFixed(1)}${u.deg}`,
      alpha: `${ph.alpha_deg.toFixed(1)}${u.deg}`,
      front_length: `${derived.front_length_mm.toFixed(0)} ${u.mm}`,
      wedge_path: `${manifest.parameters.wedge_axis_path.value} ${u.mm}`,
      near_field: `${ph.near_field_steel_mm.toFixed(1)} ${u.mm}`,
    };
    paramsCard.appendChild(make('h3', '', UI.params.title));
    const dl = make('dl', 'ag-params');
    for (const [k, label] of Object.entries(UI.params.rows)) dl.append(make('dt', '', label), make('dd', '', vals[k]));
    paramsCard.appendChild(dl);
  }

  const scanRows = {};
  const SCAN_MOVES = {
    up: () => viewer?.nudge(0, 1, SCAN_STEP.move),
    down: () => viewer?.nudge(0, -1, SCAN_STEP.move),
    left: () => viewer?.nudge(-1, 0, SCAN_STEP.move),
    right: () => viewer?.nudge(1, 0, SCAN_STEP.move),
    ccw: () => viewer?.swivel(-SCAN_STEP.turn),
    cw: () => viewer?.swivel(SCAN_STEP.turn),
  };
  {
    const S = UI.display.scan;
    scanCard.appendChild(make('h3', '', S.title));
    const pad = make('div', 'ag-scan-pad');
    for (const k of ['ccw', 'up', 'cw', 'left', 'down', 'right']) {
      const b = make('button', 'ag-pad', S.pad[k]);
      b.type = 'button';
      b.title = S.keys[k];
      b.dataset.pad = k;
      let timer = null;
      const stop = () => { clearInterval(timer); timer = null; };
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        userAct();
        SCAN_MOVES[k]();
        stop();
        timer = setInterval(SCAN_MOVES[k], 70);
      });
      for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(ev, stop);
      pad.appendChild(b);
    }
    const acts = make('div', 'ag-scan-actions');
    const side = make('button', 'ag-chip', S.switch_side);
    side.type = 'button';
    side.addEventListener('click', () => { userAct(); viewer?.switchSide(); });
    const home = make('button', 'ag-chip', S.home);
    home.type = 'button';
    home.addEventListener('click', () => { userAct(); viewer?.home(); });
    acts.append(side, home);
    const dl = make('dl', 'ag-params');
    for (const k of ['side', 'to_weld', 'along', 'swivel', 'axis_depth', 'hits']) {
      scanRows[k] = make('dd', k === 'hits' ? 'wide' : '');
      dl.append(make('dt', k === 'hits' ? 'wide' : '', S[k]), scanRows[k]);
    }
    scanCard.append(pad, acts, dl);
  }

  function showPose(p, t) {
    const S = UI.display.scan;
    const WD = UI.diagrams.weld_defects;
    const leg = (n) => (n === 1 ? WD.first : WD.second);
    scanRows.axis_depth.textContent = t?.axis ? `${t.axis.depth.toFixed(1)} ${UI.units.mm} · ${leg(t.axis.leg)}` : S.none;
    scanRows.hits.replaceChildren(...(t?.hits?.length
      ? t.hits.map((h) => make('div', 'hit', `${h.id} ${WD.defects[h.id]} · ${leg(h.leg)}`))
      : [document.createTextNode(S.none)]));
    const xc = derived.parts.angle__steel_block.weld.xc;
    const right = p.x > xc;
    let rel = ((p.psi * 180) / Math.PI - (right ? 180 : 0)) % 360;
    if (rel > 180) rel -= 360;
    if (rel <= -180) rel += 360;
    scanRows.side.textContent = right ? S.right : S.left;
    scanRows.to_weld.textContent = `${Math.abs(xc - p.x).toFixed(1)} ${UI.units.mm}`;
    scanRows.along.textContent = `${p.y.toFixed(1)} ${UI.units.mm}`;
    scanRows.swivel.textContent = `${(Math.abs(rel) < 1e-9 ? 0 : rel).toFixed(0)}${UI.units.deg}`;
  }

  function showInfo(pid) {
    infoCard.innerHTML = '';
    infoCard.hidden = !pid;
    if (!pid) return;
    learn.display.info.add(pid);
    tick();
    const c = CARDS[pid];
    const h = make('h3', '', c.name_zh);
    h.appendChild(make('span', 'en', c.name_en));
    const go = make('button', 'ag-btn', UI.display.open_part);
    go.type = 'button';
    go.addEventListener('click', () => goPart(pid));
    infoCard.append(h, makeRich('p', '', c.definition), go);
  }

  function onKey(e) {
    if (root.hidden || ui.page !== 'display' || e.ctrlKey || e.metaKey || e.altKey || /input|textarea|select/i.test(e.target.tagName)) return;
    const fast = e.shiftKey;
    if (KEY_MOVES[e.key] || /^[qed]$/i.test(e.key)) userAct();
    if (KEY_MOVES[e.key]) {
      e.preventDefault();
      const [r, a] = KEY_MOVES[e.key];
      viewer?.nudge(r, a, fast ? SCAN_STEP.move_fast : SCAN_STEP.move);
      return;
    }
    const k = e.key.toLowerCase();
    if (k === 'q' || k === 'e') viewer?.swivel((k === 'q' ? -1 : 1) * (fast ? SCAN_STEP.turn_fast : SCAN_STEP.turn));
    else if (k === 'd' && !e.repeat) toggle('defects');
  }
  window.addEventListener('keydown', onKey);

  // ---------------------------------------------------------------- explode
  const eStage = make('div', 'ag-stage');
  const eBar = make('div', 'ag-toolbar');
  const eSide = make('aside', 'ag-side');
  const orderCard = make('div', 'ag-card');
  const eInfo = make('div', 'ag-card');
  eInfo.hidden = true;
  const eDock = make('div', 'ag-guide-dock');
  eSide.append(eDock, orderCard, eInfo);
  pExplode.append(eStage, eBar, eSide);
  bindSideSplit(pExplode);
  slots.explode = eStage;
  const syncExplode = (f) => { ui.explode = f; expSlider.value = Math.round(f * 100); };
  const dis = make('button', 'ag-chip primary', UI.explode.disassemble);
  const asm = make('button', 'ag-chip', UI.explode.assemble);
  dis.type = asm.type = 'button';
  const expLab = make('label', 'ag-slider');
  expLab.appendChild(make('span', '', UI.explode.slider));
  const expSlider = Object.assign(document.createElement('input'), { type: 'range', min: 0, max: 100, step: 1, value: 0 });
  expLab.appendChild(expSlider);
  eBar.append(dis, asm, expLab, videoBtn(), shotBtn(eStage));
  expSlider.addEventListener('input', () => {
    userAct();
    ui.explode = expSlider.value / 100;
    viewer?.setExplode(ui.explode);
    const L = learn.explode;
    if (ui.explode >= 0.95) L.dis = true;
    else if (ui.explode <= 0.05 && L.dis) L.asm = true;
    tick();
  });
  dis.addEventListener('click', () => { userAct(); learn.explode.dis = true; tick(); viewer?.animateExplode(1, 1600, syncExplode); });
  asm.addEventListener('click', () => {
    userAct();
    if (learn.explode.dis) learn.explode.asm = true;
    tick();
    viewer?.animateExplode(0, 1600, syncExplode);
  });
  const orderItem = (pid) => {
    const li = make('li');
    li.dataset.pid = pid;
    const name = make('button', 'ag-link', NAMES[pid]);
    name.type = 'button';
    name.addEventListener('click', () => { userAct(); viewer?.select(pid); markOrder(pid); });
    const go = make('button', 'ag-go', '›');
    go.type = 'button';
    go.title = UI.display.open_part;
    go.addEventListener('click', () => { userAct(); goPart(pid); });
    li.append(name, go);
    return li;
  };
  orderCard.appendChild(make('h3', '', UI.explode.order_title));
  const ol = make('ol', 'ag-order');
  for (const pid of UI.explode.order) ol.appendChild(orderItem(pid));
  orderCard.appendChild(ol);
  orderCard.appendChild(make('h3', '', UI.explode.medium_title));
  const ulm = make('ul', 'ag-order medium');
  for (const pid of UI.explode.medium) ulm.appendChild(orderItem(pid));
  orderCard.appendChild(ulm);
  function showExplodeInfo(pid) {
    eInfo.innerHTML = '';
    eInfo.hidden = !pid || !CARDS[pid];
    if (!pid || !CARDS[pid]) return;
    const c = CARDS[pid];
    const h = make('h3', '', c.name_zh);
    h.appendChild(make('span', 'en', c.name_en));
    const go = make('button', 'ag-btn', UI.display.open_part);
    go.type = 'button';
    go.addEventListener('click', () => { userAct(); goPart(pid); });
    eInfo.append(h, makeRich('p', '', c.definition), go);
  }
  const markOrder = (pid) => {
    orderCard.querySelectorAll('li').forEach((li) => li.classList.toggle('active', li.dataset.pid === pid));
    if (pid && UI.explode.order.includes(pid)) learn.explode.order.add(pid);
    if (pid && UI.explode.medium.includes(pid)) learn.explode.medium.add(pid);
    showExplodeInfo(pid);
    tick();
  };

  // ---------------------------------------------------------------- parts
  const partList = make('aside', 'ag-plist');
  const pCenter = make('div', 'ag-pcenter');
  const partHead = make('div', 'ag-phead');
  const pCtl = make('div', 'ag-help-ctl');
  const pStage = make('div', 'ag-stage');
  const diagram = make('div', 'ag-diagram');
  const onDiagram = (e) => {
    if (e.type === 'click' && !e.target.closest('button')) return;
    userAct();
    learn.parts.diagram = true;
    tick();
  };
  diagram.addEventListener('click', onDiagram);
  diagram.addEventListener('input', onDiagram);
  pCenter.append(partHead, pStage, diagram);
  const knowledge = make('article', 'ag-know');
  const pDock = make('div', 'ag-guide-dock');
  const pKnowWrap = make('div', 'ag-side ag-pr-side');
  pKnowWrap.append(pDock, knowledge);
  pParts.append(partList, pCenter, pKnowWrap);
  bindSideSplit(pParts);
  slots.parts = pStage;
  for (const g of KN.groups) {
    partList.appendChild(make('h4', '', g.name_zh));
    for (const pid of g.parts) {
      const b = make('button', '', NAMES[pid]);
      b.type = 'button';
      b.dataset.pid = pid;
      b.addEventListener('click', () => { userAct(); goPart(pid); });
      partList.appendChild(b);
    }
  }

  function section(key, c) {
    const S = UI.parts;
    const box = make('div', 'ag-tab-body');
    box.dataset.tab = key;
    if (key === 'definition') {
      box.appendChild(makeRich('p', 'ag-lead', c.definition));
      const q = make('div', 'ag-question');
      q.append(make('span', 'ag-tag', S.question), makeRich('p', '', c.design_driver));
      box.appendChild(q);
    } else if (key === 'principles') {
      box.append(make('h4', '', S.functions), listOf(c.functions), make('h4', '', S.principles), listOf(c.principles));
    } else if (key === 'formulas') {
      for (const f of c.formulas) {
        const fb = make('div', 'ag-formula');
        fb.appendChild(make('h4', '', f.name));
        const m = make('div', 'ag-math');
        m.innerHTML = katex.renderToString(f.latex, { displayMode: true, throwOnError: false });
        fb.append(m, makeRich('p', '', f.meaning));
        const cond = make('p', 'ag-cond');
        cond.appendChild(make('span', 'ag-tag', S.conditions));
        rich(cond, f.conditions);
        fb.appendChild(cond);
        box.appendChild(fb);
      }
    } else if (key === 'misconceptions') {
      for (const m of c.misconceptions) {
        const mb = make('div', 'ag-mis');
        const w = make('p', 'wrong');
        w.appendChild(make('span', 'ag-tag', S.wrong));
        rich(w, m.wrong);
        const r = make('p', 'right');
        r.appendChild(make('span', 'ag-tag', S.correct));
        rich(r, m.correct);
        mb.append(w, r);
        box.appendChild(mb);
      }
    } else {
      box.appendChild(listOf(c[key]));
    }
    return box;
  }

  function renderKnowledge(host, c) {
    host.innerHTML = '';
    const tabs = make('div', 'ag-tabs');
    const bodies = make('div', 'ag-tab-bodies');
    const keys = TAB_KEYS.filter((k) => k === 'definition' || c[k]?.length);
    if (!keys.includes(ui.tab)) ui.tab = 'definition';
    for (const key of keys) {
      const b = make('button', key === ui.tab ? 'active' : '', UI.parts.tabs[key]);
      b.type = 'button';
      b.dataset.tab = key;
      b.addEventListener('click', () => {
        ui.tab = key;
        tabs.querySelectorAll('button').forEach((x) => x.classList.toggle('active', x === b));
        bodies.querySelectorAll('.ag-tab-body').forEach((x) => x.classList.toggle('active', x.dataset.tab === key));
        bodies.scrollTop = 0;
        userAct();
        (host === knowledge ? learn.parts : learn[ui.topic])?.tabs?.add(key);
        tick();
      });
      tabs.appendChild(b);
      const bd = section(key, c);
      bd.classList.toggle('active', key === ui.tab);
      bodies.appendChild(bd);
    }
    host.append(tabs, bodies);
  }

  function stopDiagram() {
    ui.stopDiagram?.();
    ui.stopDiagram = null;
    ui.refr = null;
    ui.dg = null;
    ui.bm = null;
    ui.cal = null;
    ui.sc = null;
  }

  function renderPart(pid) {
    const c = CARDS[pid];
    ui.partId = pid;
    partList.querySelectorAll('button').forEach((a) => a.classList.toggle('active', a.dataset.pid === pid));
    const back = make('button', 'ag-chip ag-part-back', UI.parts.back);
    back.type = 'button';
    back.addEventListener('click', () => { userAct(); leavePart(); });
    partHead.replaceChildren(back, make('h2', '', c.name_zh), make('span', 'en', c.name_en), pCtl);
    renderKnowledge(knowledge, c);
    learn.parts.parts.add(pid);
    tick();
    stopDiagram();
    ui.stopDiagram = renderDiagram(diagram, c.diagram, { strings: UI, derived, manifest, partId: pid });
    viewer?.setSolo(pid);
    viewer?.setLabels(true, [pid], 'front');
  }

  function flashLearned() {
    root.querySelector('.ag-learned-toast')?.remove();
    const tip = make('div', 'ag-learned-toast ag-stage-note', ST.help.learned);
    root.appendChild(tip);
    const place = () => {
      if (!tip.isConnected) return;
      const page = root.querySelector('.ag-page.active');
      const host = page?.querySelector('.ag-op-stage, .ag-stage, .ag-pcenter, .ag-main') || page || root;
      const rr = root.getBoundingClientRect();
      const hr = host.getBoundingClientRect();
      const w = tip.offsetWidth || 280;
      const h = tip.offsetHeight || 64;
      tip.style.left = `${Math.round(hr.left - rr.left + Math.max(12, (hr.width - w) / 2))}px`;
      tip.style.top = `${Math.round(hr.top - rr.top + Math.max(12, (hr.height - h) / 2))}px`;
    };
    requestAnimationFrame(() => { place(); tip.classList.add('show'); });
    setTimeout(() => { tip.classList.remove('show'); setTimeout(() => tip.remove(), 280); }, 2200);
  }

  function goPart(pid) {
    if (!pid || !CARDS[pid]) return;
    if (!driving && learn.parts.parts.has(pid)) flashLearned();
    if (ui.page && ui.page !== 'parts') ui.partReturn = ui.page;
    ui.partId = pid;
    show('parts');
  }

  function leavePart() {
    show(ui.partReturn === 'explode' ? 'explode' : 'display');
  }

  // ---------------------------------------------------------------- principle
  const prMain = make('div', 'ag-pr-main');
  const prSide = make('aside', 'ag-side ag-pr-side');
  const mediaCard = make('div', 'ag-card');
  const prKnow = make('article', 'ag-know ag-card');
  const prDock = make('div', 'ag-guide-dock');
  prSide.append(prDock, mediaCard, prKnow);
  pPrin.append(prMain, prSide);
  bindSideSplit(pPrin);
  {
    const T = PR.refraction;
    const { wedge, steel } = rules.interface;
    mediaCard.appendChild(make('h3', '', T.media));
    const tb = make('table', 'ag-media');
    const tr = (cells, th = false) => {
      const r = make('tr');
      cells.forEach((s, i) => r.appendChild(make(th || i === 0 ? 'th' : 'td', '', s)));
      return r;
    };
    tb.append(
      tr(['', T.wedge, T.steel], true),
      tr([`c_L (${T.unit_v})`, String(wedge.cL), String(steel.cL)]),
      tr([`c_S (${T.unit_v})`, String(wedge.cS), String(steel.cS)]),
      tr([`ρ (${T.unit_rho})`, String(wedge.rho), String(steel.rho)]),
    );
    tb.querySelectorAll('th, td').forEach((c) => { const s = c.textContent; c.textContent = ''; rich(c, s); });
    mediaCard.appendChild(tb);
  }

  function trackRefr(src) {
    const r = learn.refraction;
    const s = ui.refr?.state();
    if (!s) return;
    r.seen[s.L != null ? 'both' : s.S != null ? 'shear' : 'none'] = true;
    const off = Math.abs(s.alpha - ui.refr.nominal);
    if (off > 1) r.away = true;
    else if (r.away && off < 0.15) r.nominal = true;
    if (src === 'curve') r.curve = true;
    tick();
  }
  function trackDiag() {
    const mode = ui.dg?.state().mode;
    const L = learn[ui.topic];
    if (!mode || !L) return;
    if (ui.topic === 'wedge_echo' && mode === 'with' && L.seen.has('without')) L.back = true;
    L.seen.add(mode);
    tick();
  }
  const prTabs = async (d, keys) => {
    for (const k of keys) {
      const b = prKnow.querySelector(`.ag-tabs button[data-tab="${k}"]`);
      if (!b) continue;
      auto(() => b.click());
      await d.wait(1600);
    }
  };
  const PRINCIPLE_HELP = {
    refraction: {
      checks: () => {
        const r = learn.refraction;
        return { both: !!r.seen.both, shear: !!r.seen.shear, none: !!r.seen.none, nominal: r.nominal, curve: r.curve };
      },
      demo: async (d) => {
        const R = ui.refr;
        const [c1, c2] = R.crit;
        const go = (a) => { R.set(a); trackRefr('demo'); };
        await d.lerp(R.state().alpha, 0, 900, (a) => R.set(a));
        go(0);
        await d.wait(1200);
        await d.lerp(0, c1, 2600, go);
        go(c1);
        await d.wait(1400);
        await d.lerp(c1, (c1 + c2) / 2, 1200, go);
        await d.wait(1400);
        await d.lerp((c1 + c2) / 2, c2, 1200, go);
        go(c2);
        await d.wait(1400);
        await d.lerp(c2, Math.min(80, c2 + 8), 900, go);
        await d.wait(1600);
        await d.lerp(R.state().alpha, R.nominal, 1800, go);
        go(R.nominal);
      },
    },
    wedge_echo: {
      checks: () => {
        const L = learn.wedge_echo;
        return { without: L.seen.has('without'), with: L.back, card: PRINCIPLE_TABS.wedge_echo.every((k) => L.tabs.has(k)) };
      },
      demo: async (d) => {
        const D = ui.dg;
        D.set('with');
        D.mark(false);
        await d.wait(700);
        D.set('without');
        trackDiag();
        await d.wait(900);
        D.mark(true);
        await d.wait(2400);
        D.set('with');
        trackDiag();
        await d.wait(2400);
        D.mark(false);
        await prTabs(d, PRINCIPLE_TABS.wedge_echo);
      },
    },
    damping: {
      checks: () => {
        const L = learn.damping;
        return { none: L.seen.has('none'), high: L.seen.has('high'), all: L.seen.size >= 4, card: PRINCIPLE_TABS.damping.every((k) => L.tabs.has(k)) };
      },
      demo: async (d) => {
        for (const k of ['none', 'low', 'mid', 'high']) {
          ui.dg.set(k);
          trackDiag();
          await d.wait(1900);
        }
        ui.dg.set('mid');
        await d.wait(600);
        await prTabs(d, PRINCIPLE_TABS.damping);
      },
    },
  };

  function renderTopic(topic) {
    ui.topic = topic;
    stopDiagram();
    stopHelp();
    mediaCard.hidden = topic !== 'refraction';
    let ctl;
    if (topic === 'refraction') {
      ui.refr = renderRefraction(prMain, { text: PR, media: rules.interface, derived, manifest, onInput: (src) => { userAct(); trackRefr(src); } });
      ui.stopDiagram = ui.refr.stop;
      ctl = ui.refr.ctl;
    } else {
      ui.dg = renderDiagram(prMain, topic, { strings: UI, derived, manifest, partId: null, onInput: () => { userAct(); ui.dg?.mark?.(false); trackDiag(); } });
      ui.stopDiagram = ui.dg;
      ctl = ui.dg.ctl;
    }
    const part = KN.parts.find((p) => p.diagram === TOPIC_DIAGRAM[topic]);
    ui.tab = 'definition';
    if (part) renderKnowledge(prKnow, part);
    prKnow.hidden = !part;
    const H = PR.help;
    const cfg = PRINCIPLE_HELP[topic];
    if (!cfg || !H?.[topic]) return;
    helpKey = topic;
    prDock.replaceChildren();
    help = createCalibHelp({
      ctl, stage: prDock, text: { common: H.common }, topic, items: H[topic], module: ui.route || 'angle-principle', startOpen: guideOpen(),
      checks: cfg.checks, demo: cfg.demo, onTopicDone: topicDone(topic, H.common),
    });
    help.tick();
  }

  // ---------------------------------------------------------------- beam & positioning
  const bmMain = make('div', 'ag-pr-main ag-bm-main');
  const bmSide = make('aside', 'ag-side ag-pr-side ag-bm-side');
  pBeam.append(bmMain, bmSide);
  bindSideSplit(pBeam);
  const bmCtx = {
    text: BM, rules, blocks, std, marking: manifest.designation.marking,
    tex: (s) => katex.renderToString(s, { displayMode: false, throwOnError: false }),
    active: () => !root.hidden && ui.page === 'beam',
    onTopicDone: (topic) => showNextCoach(topic, BM.help.common),
  };
  function renderBeam(topic) {
    ui.topic = topic;
    stopDiagram();
    ui.bm = renderBeamTopic(topic, bmMain, bmSide, bmCtx);
    ui.stopDiagram = ui.bm.stop;
  }

  // ---------------------------------------------------------------- practice bench (calibration / scanning)
  let bench = null;
  let scope = null;
  const ensureBench = () => {
    bench ??= createBench({ probeGlbUrl: glbUrl, manifest });
    return bench;
  };
  const ensureScope = () => {
    scope ??= createScope({ getInstrument: () => bench?.instrument });
    return scope;
  };

  // ---------------------------------------------------------------- calibration
  const cbMain = make('div', 'ag-pr-main ag-bm-main ag-cb-main');
  const cbSide = make('aside', 'ag-side ag-pr-side ag-bm-side ag-cb-side');
  pCal.append(cbMain, cbSide);
  bindSideSplit(pCal);
  const cbCtx = {
    text: CB, rules, blocks, cal, std, marking: manifest.designation.marking,
    tex: bmCtx.tex,
    active: () => !root.hidden && ui.page === 'calib',
    rerender: (topic) => renderCal(topic),
    bench: ensureBench,
    scope: ensureScope,
    onTopicDone: (topic) => showNextCoach(topic, CB.common),
  };
  function renderCal(topic) {
    ui.topic = topic;
    stopDiagram();
    ui.cal = renderCalibTopic(topic, cbMain, cbSide, cbCtx);
    ui.stopDiagram = ui.cal.stop;
  }

  // ---------------------------------------------------------------- weld scanning
  const scMain = make('div', 'ag-pr-main ag-bm-main ag-sc-main');
  const scSide = make('aside', 'ag-side ag-pr-side ag-bm-side ag-sc-side');
  pScan.append(scMain, scSide);
  bindSideSplit(pScan);
  const scCtx = {
    text: SC, cardText: CD, rules, cases, std, tasks, cal, blocks, marking: manifest.designation.marking,
    tex: bmCtx.tex,
    active: () => !root.hidden && ui.page === 'scan',
    get exam() { return ui.route === 'angle-exam'; },
    rerender: (topic) => { if (!root.hidden && ui.page === 'scan') show(topic); },
    bench: ensureBench,
    scope: ensureScope,
    onTopicDone: (topic) => showNextCoach(topic, SC.help),
  };
  function renderSc(topic) {
    ui.topic = topic;
    stopDiagram();
    ui.sc = renderScanTopic(topic, scMain, scSide, scCtx);
    ui.stopDiagram = ui.sc.stop;
  }

  // ---------------------------------------------------------------- technique card / case library
  const wcMain = make('div', 'ag-pr-main ag-bm-main ag-wc-main');
  const wcSide = make('aside', 'ag-side ag-pr-side ag-bm-side ag-wc-side');
  pCard.append(wcMain, wcSide);
  bindSideSplit(pCard);
  const csMain = make('div', 'ag-pr-main ag-bm-main ag-wc-main');
  const csSide = make('aside', 'ag-side ag-pr-side ag-bm-side ag-wc-side');
  pCases.append(csMain, csSide);
  bindSideSplit(pCases);
  const wcCtx = {
    text: SC, cardText: CD, rules, cases, std, tasks,
    rerender: (topic) => { if (!root.hidden && (ui.page === 'card' || ui.page === 'cases')) show(topic); },
    onTopicDone: (topic) => showNextCoach(topic, CD.help),
  };
  function renderWc(topic) {
    ui.topic = topic;
    stopDiagram();
    ui.wc = renderCardTopic(topic, wcMain, wcSide, wcCtx);
    ui.stopDiagram = ui.wc.stop;
  }
  function renderCs(topic) {
    ui.topic = topic;
    stopDiagram();
    ui.wc = renderCasesTopic(topic, csMain, csSide, wcCtx);
    ui.stopDiagram = ui.wc.stop;
  }

  // ---------------------------------------------------------------- structure demos & guides
  async function demoDisplay(d) {
    const v = viewer;
    v.home();
    v.select(null);
    showInfo(null);
    setMode('exterior');
    if (!ui.labels) toggle('labels');
    await d.wait(600);
    let a0 = 0;
    await d.lerp(0, 360, 5200, (a) => { v.orbit(a - a0); a0 = a; });
    let z = 1;
    const zoom = (s) => { v.zoom(s / z); z = s; };
    await d.lerp(1, 0.62, 1000, zoom);
    await d.wait(700);
    await d.lerp(0.62, 1, 1000, zoom);
    learn.display.orbit = true;
    tick();
    setMode('section');
    await d.wait(1500);
    if (!ui.beam) toggle('beam');
    await d.wait(2200);
    for (const pid of KEY_PARTS) {
      v.select(pid);
      showInfo(pid);
      await d.wait(900);
      auto(() => goPart(pid));
      await d.wait(1400);
      auto(() => show('display'));
      await d.wait(500);
    }
    v.select(null);
    showInfo(null);
    setMode('xray');
    await d.wait(1200);
    if (!ui.defects) toggle('defects');
    const p0 = v.pose();
    let best = { n: -1, x: p0.x };
    for (let x = -40; x <= 0; x += 1) {
      if (v.moveTo(x, p0.y, 0) && v.track().hits.length > best.n) best = { n: v.track().hits.length, x };
    }
    v.moveTo(p0.x, p0.y, p0.psi);
    await d.wait(400);
    await d.lerp(p0.x, -40, 1800, (x) => v.moveTo(x, p0.y, 0));
    await d.lerp(-40, best.x, 2600, (x) => v.moveTo(x, p0.y, 0));
  }

  async function demoExplode(d) {
    const v = viewer;
    v.select(null);
    markOrder(null);
    if (ui.explode < 0.95) {
      v.animateExplode(1, 1600, syncExplode);
      await d.wait(1900);
    }
    learn.explode.dis = true;
    tick();
    for (const pid of [...UI.explode.order, ...UI.explode.medium]) {
      v.select(pid);
      markOrder(pid);
      await d.wait(900);
      if (KEY_PARTS.includes(pid)) {
        auto(() => goPart(pid));
        await d.wait(1200);
        auto(() => show('explode'));
        await d.wait(400);
      }
    }
    v.select(null);
    markOrder(null);
    await d.wait(400);
    v.animateExplode(0, 1600, syncExplode);
    await d.wait(1900);
    learn.explode.asm = true;
    tick();
  }

  async function demoParts(d) {
    for (const [i, pid] of KEY_PARTS.entries()) {
      ui.tab = 'definition';
      auto(() => goPart(pid));
      await d.wait(1400);
      const keys = i === 0 ? TAB_KEYS.filter((k) => k !== 'definition') : ['principles', 'misconceptions'];
      for (const k of keys) {
        const b = knowledge.querySelector(`.ag-tabs button[data-tab="${k}"]`);
        if (!b) continue;
        auto(() => b.click());
        await d.wait(1300);
      }
      const c = diagram.querySelector('.dg-controls button:not(.active)');
      if (c) {
        auto(() => c.click());
        await d.wait(1500);
      }
    }
  }

  const partPrincipleDone = () => KEY_PARTS.every((p) => learn.parts.parts.has(p));
  const STRUCT_HELP = {
    display: {
      ctl: dBar, stage: dDock, demo: demoDisplay,
      checks: () => {
        const L = learn.display;
        return {
          orbit: L.orbit,
          section: L.modes.has('section') && L.modes.has('xray'),
          beam: L.beam,
          info: partPrincipleDone(),
          scan: L.hit,
        };
      },
    },
    explode: {
      ctl: eBar, stage: eDock, demo: demoExplode,
      checks: () => {
        const L = learn.explode;
        return {
          dis: L.dis,
          order: UI.explode.order.every((p) => L.order.has(p)),
          principle: partPrincipleDone(),
          medium: UI.explode.medium.every((p) => L.medium.has(p)),
          asm: L.asm,
        };
      },
    },
    parts: {
      ctl: pCtl, stage: pDock, demo: demoParts,
      checks: () => {
        const L = learn.parts;
        return { key: KEY_PARTS.every((p) => L.parts.has(p)), tabs: [...L.tabs].filter((k) => k !== 'misconceptions').length >= 4, mis: L.tabs.has('misconceptions'), diagram: L.diagram };
      },
    },
  };
  function structHelp(id) {
    const cfg = STRUCT_HELP[id];
    if (!cfg || ui.route !== 'angle-structure' || !ST.guide?.[id]) return;
    helpKey = id;
    cfg.stage.replaceChildren();
    help = createCalibHelp({
      ctl: cfg.ctl, stage: cfg.stage, text: { common: ST.help }, topic: id, items: ST.guide[id], module: 'angle-structure', startOpen: guideOpen(),
      checks: cfg.checks, demo: cfg.demo, onTopicDone: topicDone(id, ST.help),
    });
    help.tick();
  }

  // ---------------------------------------------------------------- navigation
  function buildNav() {
    navTabs.innerHTML = '';
    for (const id of pagesOf()) {
      const b = make('button', '', ROUTE_TOPICS[ui.route]?.[id] ?? UI.nav[id]);
      b.type = 'button';
      b.dataset.page = id;
      b.addEventListener('click', () => show(id));
      navTabs.appendChild(b);
    }
  }

  function ensureViewer() {
    if (viewer) return ui.loaded;
    viewer = createViewer({
      glbUrl, derived, manifest, names: NAMES, assemblyName: UI.display.assembly_label,
      defectNames: UI.diagrams.weld_defects.defects,
      onPose: (p, t) => { showPose(p, t); trackHits(t); },
      onPick: (pid) => {
        userAct();
        if (ui.page === 'display') showInfo(pid);
        else if (ui.page === 'explode') markOrder(pid);
        else if (ui.page === 'parts' && pid && pid !== ui.partId) goPart(pid);
      },
    });
    viewer.onOrbit(() => {
      userAct();
      if (ui.page !== 'display') return;
      learn.display.orbit = true;
      tick();
    });
    loading.hidden = false;
    ui.loaded = viewer.load(UI.display.beam_labels).then(() => {
      showPose(viewer.pose(), viewer.track());
      loading.hidden = true;
    });
    return ui.loaded;
  }

  async function show(id) {
    const flat = ROUTE_PAGE[ui.route];
    const pageId = BEAM_TOPIC_SET.has(id) ? 'beam'
      : PRINCIPLE_FLAT.has(id) ? 'principle'
      : (flat || id);
    const prev = ui.page;
    hideCoach();
    if (helpKey !== id) stopHelp();
    ui.page = pageId;
    ui.topic = id;
    // Safety net: every topic switch counts toward the weld self-study evaluation.
    if (ui.route) learnVisit(ui.route, id);
    root.dataset.page = pageId;
    navTabs.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.page === id));
    body.querySelectorAll('.ag-page').forEach((s) => s.classList.toggle('active', s.dataset.page === pageId));
    if (flat || pageId === 'beam' || pageId === 'principle') {
      viewer?.setActive(false);
      if (pageId === 'beam') renderBeam(id);
      else if (flat === 'calib') renderCal(id);
      else if (flat === 'scan') renderSc(id);
      else if (flat === 'card') renderWc(id);
      else if (flat === 'cases') renderCs(id);
      else if (pageId === 'principle') renderTopic(id);
      return;
    }
    if (pageId !== 'parts') stopDiagram();
    await ensureViewer();
    if (ui.page !== pageId || root.hidden) return;
    viewer.setActive(true);
    viewer.attach(slots[pageId]);
    viewer.setScan(pageId === 'display');
    viewer.setDefects(pageId === 'display' && ui.defects);
    if (pageId === 'display') {
      viewer.setSolo(null);
      viewer.setExplode(0);
      viewer.setMode(ui.displayMode);
      viewer.setLabels(ui.labels);
      viewer.setBeam(ui.beam);
      viewer.select(null);
      showInfo(null);
      viewer.resetView();
    } else if (pageId === 'explode') {
      viewer.setSolo(null);
      viewer.setMode('exterior');
      viewer.setBeam(false);
      viewer.setLabels(true);
      viewer.select(null);
      markOrder(null);
      viewer.setExplode(ui.explode);
      viewer.frameAll(1);
      if (prev !== 'explode' && ui.explode === 0) setTimeout(() => { if (ui.page === 'explode') viewer.animateExplode(1, 1600, syncExplode); }, 300);
    } else {
      viewer.setExplode(0);
      viewer.setMode('exterior');
      viewer.setBeam(false);
      renderPart(ui.partId);
    }
    if (helpKey !== pageId) structHelp(pageId);
  }

  return {
    root,
    routes: Object.keys(ANGLE_ROUTES),
    open(route) {
      if (!ANGLE_ROUTES[route]) return false;
      const same = ui.route === route && !root.hidden;
      ui.route = route;
      root.dataset.route = route;
      root.hidden = false;
      buildNav();
      if (!same) return show(pagesOf(route)[0]);
      navTabs.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.page === (ui.topic || ui.page)));
      return true;
    },
    close() {
      if (root.hidden) return;
      root.hidden = true;
      closeLessonVideo();
      stopHelp();
      stopDiagram();
      viewer?.setActive(false);
      ui.page = null;
    },
    isOpen: () => !root.hidden,
    setExamPrep: setExamBenchPrep,
    show,
    debug: { ui, learn, help: () => help, viewer: () => viewer, setAlpha: (a) => ui.refr?.set(a), refraction: () => ui.refr?.state(), beam: () => ui.bm, calib: () => ui.cal, resetCalib: (s) => { resetCalib(cbCtx, s); if (ui.page === 'calib') renderCal(ui.topic); }, scan: () => ui.sc, resetScan: () => { resetScan(); if (ui.page === 'scan') renderSc(ui.topic); },
      card: () => ui.wc, resetDesign: () => { resetDesign(); if (ui.page === 'card') renderWc(ui.topic); },
      resetExam: () => { resetExam(); if (ui.page === 'scan') renderSc(ui.topic); }, exam: () => examSession(),
      bench: () => bench, scope: () => scope },
  };
}
