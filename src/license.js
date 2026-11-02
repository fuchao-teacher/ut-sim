// Offline student licence + expert account; first-run notice, watermark, export mark.
import T from '../../knowledge/license.json';
import './license.css';
import {
  SECRET, normName, normNo, normCode, licenseCode, teacherGateOk,
  REVIEW_ACCOUNT, reviewSessionSig,
} from './license-core.js';

const STORE_KEY = 'ut.license.v2';
const WIPE_GEN = 'ut.wipe.2026r2';
const WIPE_KEEP = new Set([WIPE_GEN, 'ut.tutor.key', 'ut.tutor.endpoint']);
// v2: teacher grants made with the former shared password are no longer accepted.
const teacherSig = () => licenseCode('teacher-v2', SECRET.length);
const fill = (s, v) => String(s).replace(/\{([a-z_]+)\}/g, (m, k) => (k in v ? String(v[k]) : m));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function wipeStaleTraces() {
  try {
    if (localStorage.getItem(WIPE_GEN) === '1') return;
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i));
    for (const k of keys) {
      if (!k || WIPE_KEEP.has(k)) continue;
      if (k.startsWith('ut.') || k.startsWith('paut')) localStorage.removeItem(k);
    }
    localStorage.setItem(WIPE_GEN, '1');
  } catch { /* storage unavailable */ }
}

function expired(now = new Date()) {
  const [y, mo, d] = T.expires.split('-').map(Number);
  return now > new Date(y, mo - 1, d, 23, 59, 59, 999);
}

function readStored() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); } catch { return null; }
}
function writeStored(v) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(v)); } catch { /* storage unavailable */ }
}

function reviewHolder(account) {
  return { role: 'student', via: 'account', account, name: T.review_name, no: T.review_no };
}

function validHolder(h) {
  if (!h) return null;
  if (h.role === 'teacher') return h.sig === teacherSig() ? { role: 'teacher' } : null;
  if (h.via === 'account' && h.account === REVIEW_ACCOUNT && h.sig === reviewSessionSig(h.account)) {
    return reviewHolder(h.account);
  }
  if (h.role === 'student' && h.name && h.no && normCode(h.code) === normCode(licenseCode(h.name, h.no))) {
    return { role: 'student', name: normName(h.name), no: normNo(h.no) };
  }
  return null;
}

let holder = null;

export const licenseHolder = () => holder;
export const licensedStudent = () => (holder?.role === 'student' ? { name: holder.name, student_no: holder.no } : null);
export const isReviewSession = () => holder?.via === 'account';
export const licenseOpen = () => !!document.querySelector('.lic-gate');

export function licenseMark() {
  if (!holder) return '';
  const who = holder.role === 'student' ? { name: holder.name, no: holder.no } : { name: T.teacher_holder, no: '—' };
  return fill(T.export_mark, { product: T.product, owner: T.owner, ...who });
}

function applyWatermark() {
  document.querySelectorAll('.lic-wm').forEach((n) => n.remove());
}

function expertEnterHtml() {
  return `<aside class="lic-expert">`
    + `<p class="lic-expert-hint">${esc(T.expert_hint)}</p>`
    + `<button type="button" class="lic-primary" data-act="expert">${esc(T.expert_enter)}</button>`
    + `</aside>`;
}

const noticeHtml = ({ expert = false } = {}) => `<h2>${esc(T.notice_title)}</h2><ol class="lic-notice">${T.notice.map((p) => `<li>${esc(p)}</li>`).join('')}</ol>`
  + `<p class="lic-copy">${esc(T.copyright)}</p>`
  + (expert ? expertEnterHtml() : '');

function overlay(inner) {
  const box = document.createElement('div');
  box.className = 'lic-gate';
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  box.innerHTML = `<div class="lic-card">${inner}</div>`;
  for (const type of ['keydown', 'keyup']) box.addEventListener(type, (ev) => ev.stopPropagation());
  document.body.classList.add('lic-open');
  document.body.appendChild(box);
  return box;
}

function closeGate(box) {
  box.remove();
  if (!document.querySelector('.lic-gate')) document.body.classList.remove('lic-open');
}

function grant(h, stored, onGrant) {
  holder = h;
  if (stored) writeStored(stored);
  applyWatermark();
  onGrant?.(holder);
}

function enterReview(box, onGrant) {
  closeGate(box);
  const h = reviewHolder(REVIEW_ACCOUNT);
  grant(h, { ...h, sig: reviewSessionSig(REVIEW_ACCOUNT) }, onGrant);
}

function showGate({ onGrant, isExpired }) {
  const head = `<div class="lic-head"><span>${esc(T.welcome)}</span><h1>${esc(T.product)}</h1></div>`;
  const studentForm = isExpired
    ? `<div class="lic-expired"><b>${esc(T.expired_title)}</b><p>${esc(fill(T.expired_text, { date: T.expires }))}</p></div>`
    : `<form class="lic-form" data-form="student" autocomplete="off">`
      + `<p class="lic-form-cap">${esc(T.student_form)}</p>`
      + `<label>${esc(T.name)}<input name="name" maxlength="32"></label>`
      + `<label>${esc(T.number)}<input name="no" maxlength="32"></label>`
      + `<label>${esc(T.code)}<input name="code" maxlength="12" placeholder="${esc(T.code_placeholder)}"></label>`
      + `<p class="lic-err" data-err="student" hidden></p>`
      + `<button type="submit" class="lic-primary">${esc(T.agree)}</button></form>`;
  const teacherForm = `<form class="lic-form lic-teacher" data-form="teacher" autocomplete="off" hidden>`
    + `<label>${esc(T.teacher_password)}<input name="pwd" type="password" autocapitalize="off" autocorrect="off" spellcheck="false"></label>`
    + `<p class="lic-err" data-err="teacher" hidden></p>`
    + `<div class="lic-row"><button type="submit" class="lic-primary">${esc(T.teacher_enter)}</button><button type="button" data-act="back">${esc(T.back)}</button></div></form>`;
  const box = overlay(`${head}<div class="lic-body">${noticeHtml({ expert: !isExpired })}</div>${studentForm}${teacherForm}<button type="button" class="lic-link" data-act="teacher">${esc(T.teacher)}</button>`);
  const sf = box.querySelector('[data-form=student]');
  const tf = box.querySelector('[data-form=teacher]');
  const tl = box.querySelector('[data-act=teacher]');
  const eb = box.querySelector('[data-act=expert]');
  const err = (kind, msg) => { const p = box.querySelector(`[data-err=${kind}]`); if (p) { p.textContent = msg; p.hidden = !msg; } };
  const showTeacher = () => {
    tf.hidden = false;
    tl.hidden = true;
    if (eb) eb.closest('.lic-expert').hidden = true;
    if (sf) sf.hidden = true;
    tf.querySelector('input').focus();
  };
  const showMain = () => {
    tf.hidden = true;
    tl.hidden = false;
    if (eb) eb.closest('.lic-expert').hidden = false;
    if (sf) sf.hidden = false;
    err('teacher', '');
  };
  tl.onclick = showTeacher;
  box.querySelector('[data-act=back]').onclick = showMain;
  eb?.addEventListener('click', () => enterReview(box, onGrant));
  sf?.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const name = normName(sf.elements.name.value);
    const no = normNo(sf.elements.no.value);
    const code = normCode(sf.elements.code.value);
    if (!name || !no || !code) return err('student', T.error_empty);
    if (code !== normCode(licenseCode(name, no))) return err('student', T.error_code);
    closeGate(box);
    grant({ role: 'student', name, no }, { role: 'student', name, no, code: licenseCode(name, no) }, onGrant);
  });
  tf.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const input = tf.elements.pwd;
    if (!teacherGateOk(input.value)) { input.value = ''; return err('teacher', T.error_password); }
    closeGate(box);
    grant({ role: 'teacher' }, { role: 'teacher', sig: teacherSig() }, onGrant);
  });
  (eb || sf?.elements.name || tl).focus();
}

export function showLicenseNotice() {
  const who = holder ? (holder.role === 'student' ? fill(T.holder, { name: holder.name, no: holder.no }) : T.teacher_holder) : '';
  const box = overlay(`<div class="lic-body">${noticeHtml()}${who ? `<p class="lic-who">${esc(who)}</p>` : ''}</div>`
    + `<div class="lic-row"><button type="button" class="lic-primary" data-act="close">${esc(T.close)}</button></div>`);
  box.querySelector('[data-act=close]').onclick = () => closeGate(box);
}

let pendingOnGrant = null;

export function initLicense({ onGrant }) {
  wipeStaleTraces();
  pendingOnGrant = onGrant;
}

export function showLicenseGate() {
  if (document.querySelector('.lic-gate')) return;
  showGate({ onGrant: pendingOnGrant, isExpired: expired() });
}

export const licenseText = T;
