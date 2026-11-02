// Self-study learning record, kept per licensed student in localStorage (student role only).
// Module = learning-shell route (e.g. 'fullscan', 'angle-calib'); step = the module's tab / stage id.
// Per step: first / last visit, active seconds, visits, demos watched, guide checkpoints reached (of total), self-test scores.
import { licenseHolder } from './license.js';

const KEY = 'ut.learn.v1';
const TICK_S = 5;
const IDLE_S = 120;

let cur = null;
let lastInput = Date.now();
let timer = null;

const role = () => document.body?.dataset?.learningRole || '';
export const learnActive = () => role() === 'student';

function who() {
  const h = licenseHolder();
  return h?.role === 'student' ? `${h.no || ''}:${h.name || ''}` : 'anon';
}

function readAll() {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { return {}; }
}

function load() {
  const all = readAll();
  const k = who();
  all[k] ??= { modules: {}, orid: { o: '', r: '', i: '', d: '' }, since: new Date().toISOString() };
  return { all, rec: all[k] };
}

function save(all) {
  try { localStorage.setItem(KEY, JSON.stringify(all)); } catch { /* storage full or blocked */ }
}

function edit(fn) {
  const { all, rec } = load();
  fn(rec);
  save(all);
}

function stepOf(rec, module, step) {
  const m = (rec.modules[module] ??= { steps: {} });
  return (m.steps[step] ??= { visits: 0, seconds: 0, demos: 0, done: [], total: 0, first: null, last: null, tests: [] });
}

function ensureTimer() {
  if (timer || typeof window === 'undefined') return;
  for (const ev of ['pointerdown', 'keydown', 'wheel', 'touchstart']) window.addEventListener(ev, () => { lastInput = Date.now(); }, { passive: true, capture: true });
  timer = setInterval(() => {
    if (!cur || !learnActive() || document.visibilityState !== 'visible') return;
    if (Date.now() - lastInput > IDLE_S * 1000) return;
    if (document.body.dataset.learningRoute && document.body.dataset.learningRoute !== cur.module) return;
    edit((rec) => { stepOf(rec, cur.module, cur.step).seconds += TICK_S; });
  }, TICK_S * 1000);
}

// Entering a step (call on every tab / stage switch).
export function learnVisit(module, step) {
  if (!learnActive() || !module || !step) return;
  ensureTimer();
  lastInput = Date.now();
  if (cur && cur.module === module && cur.step === step) return;
  cur = { module, step };
  const now = new Date().toISOString();
  edit((rec) => {
    const s = stepOf(rec, module, step);
    s.visits += 1;
    s.first ??= now;
    s.last = now;
  });
}

// A one-click demo of the step was played.
export function learnDemo(module, step) {
  if (!learnActive()) return;
  edit((rec) => { stepOf(rec, module, step).demos += 1; });
}

// Number of guide checkpoints of the step (called when the guide is built).
export function learnTotal(module, step, total) {
  if (!learnActive() || !(total > 0)) return;
  edit((rec) => { stepOf(rec, module, step).total = total; });
}

// Guide checkpoints reached; ids are merged into the step's done set.
export function learnDone(module, step, ids) {
  if (!learnActive()) return;
  const list = (Array.isArray(ids) ? ids : [ids]).filter(Boolean).map(String);
  if (!list.length) return;
  const { all, rec } = load();
  const s = stepOf(rec, module, step);
  const add = list.filter((id) => !s.done.includes(id));
  if (!add.length) return;
  s.done.push(...add);
  save(all);
}

// Self-test / exercise result (kept in order; the report shows attempts, best and last).
export function learnScore(module, step, score, max) {
  if (!learnActive() || !(max > 0) || !Number.isFinite(score)) return;
  edit((rec) => { stepOf(rec, module, step).tests.push({ score, max, at: new Date().toISOString() }); });
}

// Leaving the learning modules (e.g. for the evaluation page): the next step entry counts as a new visit.
export function learnLeave() {
  cur = null;
}

export function learnRecord() {
  return load().rec;
}

export function learnOrid(v) {
  edit((rec) => { rec.orid = { ...rec.orid, ...v }; });
}

/** Persist AI portrait analysis text for the evaluation page / PDF. */
export function learnAiReport({ text, at } = {}) {
  const body = String(text || '').trim();
  if (!body) return;
  edit((rec) => {
    rec.ai = { text: body, at: at || new Date().toISOString() };
  });
}

export function learnReset() {
  const all = readAll();
  delete all[who()];
  save(all);
  cur = null;
}
