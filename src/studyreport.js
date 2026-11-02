// Self-study evaluation: visual learning portrait, ORID, AI process analysis, printable PDF.
import SR from '../../knowledge/study_report.json';
import LJ from '../../knowledge/learning.json';
import { learnRecord, learnOrid, learnReset, learnLeave, learnAiReport } from './learnlog.js';
import { trackScore } from './studyscore.js';
import { buildPortrait, portraitFacts, PORTRAIT_AI_SYSTEM } from './studyportrait.js';
import { deepseekKey, deepseekChat, readDeepseekStream, deepseekReady } from './deepseek.js';
import { openReport } from './report.js';
import { licensedStudent, licenseMark } from './license.js';
import './study.css';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const pad2 = (n) => String(n).padStart(2, '0');
const day = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const clock = (iso) => {
  if (!iso) return SR.none;
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return SR.none;
  return `${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
};
const U = SR.units;
const N = SR.none;
const P = SR.portrait;
const AI = SR.ai;

export const STUDY_ROUTES = { 'study-plate': 'plate', 'study-weld': 'weld', 'study-paut': 'paut' };

const trackOf = (id) => SR.tracks.find((t) => t.id === id) || SR.tracks[0];
const moduleTitles = () => Object.fromEntries((LJ.roles.student.items || []).map((it) => [it.route, it.title]));
const moduleTitle = (id) => moduleTitles()[id] || id;
const stepTitle = (track, mid, sid) => track.modules.find((m) => m.id === mid)?.steps.find((s) => s.id === sid)?.title || sid;
const dur = (s) => (!s ? N : s < 60 ? `${s} ${U.s}` : `${Math.round(s / 60)} ${U.min}`);
const points = (s) => (s.total ? `${s.done} / ${s.total}` : N);
const state = (st) => ({ text: SR.status[st], cls: `st-${st}` });

const WHO = 'ut.study.who';
function student() {
  const lic = licensedStudent();
  if (lic) return { name: lic.name || '', no: lic.student_no || '', fixed: true };
  try { return { name: '', no: '', ...JSON.parse(localStorage.getItem(WHO) || '{}'), fixed: false }; } catch { return { name: '', no: '', fixed: false }; }
}
function saveStudent(v) {
  const { name, no } = { ...student(), ...v };
  try { localStorage.setItem(WHO, JSON.stringify({ name, no })); } catch { /* kept on screen only */ }
}

function summary(res) {
  return res.modules.map((m) => [moduleTitle(m.id), `${m.finished} / ${m.count}`, dur(m.seconds), state(m.status)]);
}

function stepRows(track, m) {
  return m.steps.map((s) => [stepTitle(track, m.id, s.id), points(s), dur(s.seconds), state(s.status)]);
}

function ringSvg(pct) {
  const r = 54;
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(100, pct));
  const dash = (p / 100) * c;
  return `<svg class="ut-study-ring" viewBox="0 0 128 128" aria-hidden="true">`
    + `<circle class="ut-study-ring-bg" cx="64" cy="64" r="${r}" fill="none" stroke-width="10"/>`
    + `<circle class="ut-study-ring-fg" cx="64" cy="64" r="${r}" fill="none" stroke-width="10"`
    + ` stroke-dasharray="${dash.toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 64 64)"/>`
    + `<text x="64" y="60" text-anchor="middle" class="ut-study-ring-pct">${p}%</text>`
    + `<text x="64" y="78" text-anchor="middle" class="ut-study-ring-label">${esc(P.ring)}</text></svg>`;
}

function moduleDots(mods) {
  return `<div class="ut-study-moddots">${mods.map((m) => `<div class="ut-study-moddot st-${esc(m.status)}" title="${esc(m.title)}">`
    + `<span class="ut-study-moddot-bar"><i style="height:${m.progress}%"></i></span>`
    + `<b>${esc(m.title)}</b><em>${m.finished}/${m.count}</em></div>`).join('')}</div>`;
}

function timeBars(mods) {
  const max = Math.max(1, ...mods.map((m) => m.seconds));
  return `<div class="ut-study-bars">${mods.map((m) => {
    const w = Math.round((100 * m.seconds) / max);
    return `<div class="ut-study-bar-row"><span>${esc(m.title)}</span>`
      + `<div class="ut-study-bar-track"><i style="width:${w}%"></i></div>`
      + `<em>${esc(dur(m.seconds))}</em></div>`;
  }).join('')}</div>`;
}

function pathHtml(path, goStep) {
  if (!path.length) return `<p class="ut-study-empty">${esc(P.path_empty)}</p>`;
  return `<ol class="ut-study-path">${path.map((p) => {
    const go = goStep && p.status !== 'done'
      ? `<button type="button" class="ut-study-go" data-go="${esc(p.moduleId)}" data-step="${esc(p.stepId)}">${esc(SR.actions.go)}</button>`
      : '';
    return `<li class="st-${esc(p.status)}"><time>${esc(clock(p.first))}</time>`
      + `<div><b>${esc(p.title)}</b><span>${esc(p.moduleTitle)} · ${esc(dur(p.seconds))} · ${esc(SR.status[p.status])}</span></div>${go}</li>`;
  }).join('')}</ol>`;
}

function weakHtml(list) {
  if (!list.length) return `<p class="ut-study-empty">${esc(P.weak_empty)}</p>`;
  return `<ul class="ut-study-weak">${list.map((w) => `<li><b>${esc(w.title)}</b>`
    + `<span>${esc(w.moduleTitle)} · ${esc(dur(w.seconds))} · ${w.visits} ${U.times}</span></li>`).join('')}</ul>`;
}

let host = null;
let goStep = null;
let aiAbort = null;
let detailOpen = false;
let practiceNote = null;

export function closeStudy() {
  aiAbort?.abort();
  aiAbort = null;
  host?.remove();
  host = null;
  document.body.classList.remove('ut-study-open');
}

let onBench = null;

export function openStudy(trackId, { go = null, practice = null, onBench: bench = null } = {}) {
  closeStudy();
  learnLeave();
  goStep = go;
  practiceNote = practice;
  onBench = typeof bench === 'function' ? bench : null;
  detailOpen = false;
  const track = trackOf(trackId);
  host = document.createElement('section');
  host.className = 'ut-study';
  document.body.appendChild(host);
  document.body.classList.add('ut-study-open');
  render(track);
  return host;
}

function portraitOf(track, rec) {
  return buildPortrait(track, rec, { moduleTitles: moduleTitles() });
}

function render(track) {
  if (!host) return;
  const rec = learnRecord();
  const res = trackScore(track, rec);
  const portrait = portraitOf(track, rec);
  const who = student();
  const S = SR.student;
  const field = (k) => (who.fixed ? esc(who[k] || N) : `<input type="text" name="study_${k}" value="${esc(who[k])}">`);
  const meta = [
    [S.name, field('name')], [S.no, field('no')], [S.track, esc(track.title)],
    [S.since, esc(rec.since ? day(new Date(rec.since)) : N)],
    [S.total_time, esc(dur(res.seconds))], [S.progress, esc(`${res.finished} / ${res.count}`)],
  ];
  if (portrait.days) meta.push([P.days, String(portrait.days)]);

  const th = (h) => `<tr>${h.map((x) => `<th>${esc(x)}</th>`).join('')}</tr>`;
  const td = (c) => (c && typeof c === 'object' ? `<td class="${esc(c.cls)}">${esc(c.text)}</td>` : `<td>${esc(c)}</td>`);
  const rows = (rs) => rs.map((r) => `<tr>${r.map(td).join('')}</tr>`).join('');
  const go = (m, s) => (goStep && s.status !== 'done'
    ? `<td><button type="button" class="ut-study-go" data-go="${esc(m.id)}" data-step="${esc(s.id)}">${esc(SR.actions.go)}</button></td>` : (goStep ? '<td></td>' : ''));
  const steps = (m) => `${th(goStep ? [...SR.step_head, ''] : SR.step_head)}`
    + stepRows(track, m).map((r, i) => `<tr>${r.map(td).join('')}${go(m, m.steps[i])}</tr>`).join('');
  const orid = rec.orid || {};
  const aiText = rec.ai?.text || '';
  const aiAt = rec.ai?.at ? clock(rec.ai.at) : '';

  host.innerHTML = `<div class="ut-study-doc">`
    + `<header class="ut-study-head"><h2>${esc(SR.report_title)}</h2><div class="ut-study-acts">`
    + (onBench ? `<button type="button" data-act="bench">${esc(SR.actions.to_bench)}</button>` : '')
    + `<button type="button" class="primary" data-act="export">${esc(SR.actions.export)}</button>`
    + `<button type="button" data-act="reset">${esc(SR.actions.reset)}</button></div></header>`
    + `<dl class="ut-study-meta">${meta.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${v}</dd></div>`).join('')}</dl>`

    + `<h3>${esc(P.title)}</h3>`
    + `<div class="ut-study-hero">`
    + `<div class="ut-study-hero-ring">${ringSvg(portrait.progress)}`
    + `<div class="ut-study-hero-stats">`
    + `<div><span>${esc(P.steps)}</span><b>${portrait.finished}<small> / ${portrait.count}</small></b></div>`
    + `<div><span>${esc(P.time)}</span><b>${esc(dur(portrait.seconds))}</b></div>`
    + (portrait.days ? `<div><span>${esc(P.days)}</span><b>${portrait.days}</b></div>` : '')
    + `</div></div>`
    + `<div class="ut-study-hero-mods"><h4>${esc(P.modules)}</h4>${moduleDots(portrait.modules)}</div>`
    + `<div class="ut-study-hero-time"><h4>${esc(P.time_bars)}</h4>${timeBars(portrait.modules)}</div>`
    + `</div>`

    + `<div class="ut-study-split">`
    + `<section class="ut-study-panel"><h4>${esc(P.path)}</h4>${pathHtml(portrait.path, goStep)}</section>`
    + `<section class="ut-study-panel"><h4>${esc(P.weak)}</h4>${weakHtml(portrait.weak)}`
    + (portrait.skim.length ? `<h4 class="ut-study-subh">${esc(P.skim)}</h4>${weakHtml(portrait.skim)}` : '')
    + `</section></div>`

    + `<h3>${esc(AI.title)}</h3>`
    + `<div class="ut-study-ai">`
    + `<div class="ut-study-ai-acts">`
    + `<button type="button" class="primary" data-act="ai">${esc(aiText ? AI.rerun : AI.run)}</button>`
    + `<button type="button" data-act="ai-stop" hidden>${esc(AI.stop)}</button>`
    + (aiAt ? `<span class="ut-study-ai-at">${esc(AI.saved_at)} ${esc(aiAt)}</span>` : '')
    + `</div>`
    + `<div class="ut-study-ai-body" data-ai></div>`
    + `</div>`

    + `<h3>${esc(SR.practice?.title || SR.summary)}</h3>`
    + `<p class="ut-study-practice">${esc(practiceNote?.text || SR.practice?.none || '')}</p>`
    + `<h3>${esc(SR.summary)}</h3><div class="ut-study-scroll"><table class="ut-study-table">${th(SR.module_head)}${rows(summary(res))}</table></div>`
    + `<button type="button" class="ut-study-toggle" data-act="detail">${esc(detailOpen ? SR.actions.hide_detail : SR.actions.detail)}</button>`
    + `<div class="ut-study-mods" data-detail ${detailOpen ? '' : 'hidden'}>`
    + res.modules.map((m) => `<article class="ut-study-mod st-${m.status}"><header><b>${esc(moduleTitle(m.id))}</b>`
      + `<span class="ut-study-badge st-${m.status}">${esc(SR.status[m.status])}</span><span class="ut-study-score">${m.finished}<small> / ${m.count}</small></span></header>`
      + `<table class="ut-study-table">${steps(m)}</table></article>`).join('')
    + `</div><h3>${esc(SR.orid.title)}</h3><div class="ut-study-orid">`
    + SR.orid.items.map((it) => `<label><span class="ut-study-tag">${esc(it.tag)}</span><b>${esc(it.label)}</b>`
      + `<textarea name="orid_${esc(it.id)}" rows="4" placeholder="${esc(it.prompt)}">${esc(orid[it.id] || '')}</textarea></label>`).join('')
    + `</div></div>`;

  bind(track);
}

function bind(track) {
  for (const it of SR.orid.items) {
    const ta = host.querySelector(`[name="orid_${it.id}"]`);
    ta.addEventListener('input', () => learnOrid({ [it.id]: ta.value }));
  }
  for (const k of ['name', 'no']) {
    const inp = host.querySelector(`[name="study_${k}"]`);
    inp?.addEventListener('input', () => saveStudent({ [k]: inp.value.trim() }));
  }
  host.querySelectorAll('[data-go]').forEach((b) => { b.onclick = () => goStep?.(b.dataset.go, b.dataset.step); });
  host.querySelector('[data-act=bench]')?.addEventListener('click', () => onBench?.());
  host.querySelector('[data-act=export]').onclick = () => exportPdf(track);
  host.querySelector('[data-act=reset]').onclick = () => {
    if (!window.confirm(SR.actions.reset_confirm)) return;
    learnReset();
    render(track);
  };
  host.querySelector('[data-act=detail]').onclick = (e) => {
    detailOpen = !detailOpen;
    const box = host.querySelector('[data-detail]');
    box.hidden = !detailOpen;
    e.currentTarget.textContent = detailOpen ? SR.actions.hide_detail : SR.actions.detail;
  };
  host.querySelector('[data-act=ai]').onclick = () => runAi(track);
  host.querySelector('[data-act=ai-stop]').onclick = () => { aiAbort?.abort(); };
  const aiBody = host.querySelector('[data-ai]');
  const savedAi = learnRecord().ai?.text || '';
  if (savedAi) aiBody.textContent = savedAi;
  else aiBody.innerHTML = `<span class="ut-study-empty">${esc(AI.empty)}</span>`;
}

async function runAi(track) {
  const body = host.querySelector('[data-ai]');
  const btn = host.querySelector('[data-act=ai]');
  const stop = host.querySelector('[data-act=ai-stop]');
  const rec = learnRecord();
  const portrait = portraitOf(track, rec);
  if (portrait.finished === 0 && portrait.path.length === 0) {
    window.alert(AI.need_progress);
    return;
  }
  if (!deepseekReady() && !deepseekKey()) {
    body.innerHTML = `<span class="ut-study-empty">${esc(AI.offline)}</span>`;
    return;
  }
  aiAbort?.abort();
  aiAbort = new AbortController();
  btn.disabled = true;
  stop.hidden = false;
  body.textContent = AI.busy;
  const who = student();
  const facts = portraitFacts(portrait, { orid: rec.orid || {}, student: who });
  const messages = [
    { role: 'system', content: PORTRAIT_AI_SYSTEM },
    { role: 'user', content: JSON.stringify(facts) },
  ];
  try {
    let res;
    try {
      res = await deepseekChat({ messages, signal: aiAbort.signal, stream: true, max_tokens: 4096 });
    } catch {
      res = await deepseekChat({ messages, signal: aiAbort.signal, stream: false, max_tokens: 4096 });
    }
    body.textContent = '';
    let reply = '';
    const read = await readDeepseekStream(res, (delta) => {
      reply += delta;
      body.textContent = reply;
    });
    reply = read.text || reply;
    if (!reply.trim()) body.textContent = AI.error;
    else {
      learnAiReport({ text: reply });
      const at = host.querySelector('.ut-study-ai-at');
      const stamp = `${AI.saved_at} ${clock(new Date().toISOString())}`;
      if (at) at.textContent = stamp;
      else {
        const acts = host.querySelector('.ut-study-ai-acts');
        const span = document.createElement('span');
        span.className = 'ut-study-ai-at';
        span.textContent = stamp;
        acts?.appendChild(span);
      }
      btn.textContent = AI.rerun;
    }
  } catch (err) {
    if (err?.name === 'AbortError') {
      if (!body.textContent || body.textContent === AI.busy) body.textContent = AI.empty;
    } else {
      const offline = /Failed to fetch|NetworkError|HTTP 5|ECONNREFUSED/i.test(String(err?.message || err));
      body.textContent = offline ? AI.offline : `${AI.error}${err?.message ? `（${String(err.message).slice(0, 100)}）` : ''}`;
    }
  } finally {
    btn.disabled = false;
    stop.hidden = true;
    aiAbort = null;
  }
}

export function studyModel(track, rec = learnRecord(), now = new Date()) {
  const res = trackScore(track, rec);
  const portrait = portraitOf(track, rec);
  const who = student();
  const S = SR.student;
  const orid = rec.orid || {};
  const progress = `${res.finished} / ${res.count}`;
  const sections = [
    {
      title: P.title,
      cls: 'rp-sum',
      parts: [{
        table: {
          head: P.head_mod,
          rows: portrait.modules.map((m) => [
            m.title,
            `${m.finished} / ${m.count}`,
            dur(m.seconds),
            `${m.timeShare}%`,
          ]),
          foot: [S.progress, progress, dur(res.seconds), ''],
        },
      }],
    },
    { title: SR.summary, cls: 'rp-sum', parts: [{ table: { head: SR.module_head, rows: summary(res), foot: [S.progress, progress, dur(res.seconds), ''] } }] },
    { title: SR.process, cls: 'rp-long', parts: res.modules.map((m) => ({ table: { caption: `${moduleTitle(m.id)} · ${m.finished} / ${m.count}`, head: SR.step_head, rows: stepRows(track, m) } })) },
  ];
  if (rec.ai?.text) {
    sections.push({
      title: AI.title,
      cls: 'rp-orid',
      parts: [{ table: { head: [AI.title], rows: [[{ text: rec.ai.text, cls: 'l' }]] } }],
    });
  }
  sections.push(
    { title: SR.orid.title, cls: 'rp-orid', parts: [{ table: { head: SR.orid.head, rows: SR.orid.items.map((it) => [`${it.tag} ${it.label}`, { text: orid[it.id] || '', cls: 'l' }]) } }] },
    { title: SR.sign.title, cls: 'rp-sign', parts: [{ kv: [[SR.sign.score, ''], [SR.sign.teacher, ''], [SR.sign.comment, ''], [SR.sign.date, '']] }] },
  );
  return {
    title: SR.report_title,
    meta: [[S.name, who.name || N], [S.no, who.no || N], [S.track, track.title], [S.since, rec.since ? day(new Date(rec.since)) : N],
      [S.date, day(now)], [S.total_time, dur(res.seconds)], [S.progress, progress]],
    sections,
  };
}

function exportPdf(track) {
  const rec = learnRecord();
  const who = student();
  if (!who.name || !who.no) {
    window.alert(SR.student.missing);
    host?.querySelector('[name^="study_"]')?.focus();
    return null;
  }
  if (SR.orid.items.some((it) => !String(rec.orid?.[it.id] || '').trim())) {
    window.alert(SR.orid.missing);
    host?.querySelector('.ut-study-orid textarea')?.focus();
    return null;
  }
  if (!rec.ai?.text && !window.confirm(AI.missing_export)) return null;
  const now = new Date();
  const view = openReport(studyModel(track, rec, now), { printLabel: SR.actions.export, closeLabel: SR.actions.close });
  const mark = licenseMark();
  if (mark) view.insertAdjacentHTML('beforeend', `<p class="rp-lic">${esc(mark)}</p>`);
  const tag = [who.name, who.no].filter(Boolean).join('_').replace(/[\\/:*?"<>|\s]/g, '_');
  view.dataset.pdf = `${SR.file}_${track.title.split(' ')[0]}${tag ? `_${tag}` : ''}_${day(now)}`;
  setTimeout(() => window.print(), 250);
  return view;
}
