// Calibration help: step tips with live checks, and one-click animated demos on the 3D bench
// (teacher / self-study); visits, demos and reached checkpoints go to the self-study learning record.
// Labels from knowledge/angle_calib.json. Student default: one-step large caption in the side dock (draggable).
import { learnVisit, learnTotal, learnDone, learnDemo } from '../learnlog.js';

const make = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

const ease = (k) => (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2);
// Timer step (rAF stalls in background tabs).
const step = () => new Promise((r) => setTimeout(r, 16));

export function helpAllowed() {
  const r = document.body.dataset.learningRole;
  return r === 'teacher' || r === 'student';
}

function resolveMode(mode) {
  if (mode === 'caption' || mode === 'list') return mode;
  return document.body.dataset.learningRole === 'student' ? 'caption' : 'list';
}

function bindDrag(box, head) {
  head.classList.add('ag-guide-drag');
  head.addEventListener('pointerdown', (ev) => {
    if (ev.button !== 0 || ev.target.closest('button')) return;
    const r = box.getBoundingClientRect();
    box.classList.add('ag-guide-float');
    Object.assign(box.style, {
      left: `${r.left}px`,
      top: `${r.top}px`,
      width: `${Math.min(r.width, 420)}px`,
      right: 'auto',
      bottom: 'auto',
      transform: 'none',
    });
    const dx = ev.clientX - r.left;
    const dy = ev.clientY - r.top;
    head.setPointerCapture(ev.pointerId);
    const move = (e) => {
      const x = Math.max(8, Math.min(window.innerWidth - box.offsetWidth - 8, e.clientX - dx));
      const y = Math.max(8, Math.min(window.innerHeight - box.offsetHeight - 8, e.clientY - dy));
      box.style.left = `${x}px`;
      box.style.top = `${y}px`;
    };
    const up = () => {
      head.removeEventListener('pointermove', move);
      head.removeEventListener('pointerup', up);
    };
    head.addEventListener('pointermove', move);
    head.addEventListener('pointerup', up);
    ev.preventDefault();
  });
}

export function createCalibHelp({
  ctl, stage, text, topic, items, checks, demo, extra = [], startOpen = true,
  module = document.body.dataset.learningRoute, mode, onStep, onTopicDone,
}) {
  // Always log the visit in student mode, even when the guide UI is off (exam / teacher gate).
  learnVisit(module, topic);
  if (!helpAllowed()) return { stop() {}, tick() {}, busy: () => false, cancel() {} };
  learnTotal(module, topic, items.length);
  let logged = '';
  const logChecks = () => {
    const st = checks();
    const ids = items.filter((it) => st[it.id] === true).map((it) => it.id);
    const key = ids.join();
    if (key === logged) return;
    logged = key;
    learnDone(module, topic, ids);
  };

  const Cm = text.common || text;
  const uiMode = resolveMode(mode);
  let open = false;
  let running = false;
  let gen = 0;
  let selected = null;
  let capIndex = 0;
  let lastKey = '';
  let topicAllDone = false;

  const demos = [{ label: Cm.demo, run: demo }, ...extra].map((d) => {
    const b = make('button', 'chip ag-cb-demo', d.label);
    b.type = 'button';
    return { ...d, b };
  });
  const bGuide = make('button', 'chip ag-cb-guide', Cm.guide);
  bGuide.type = 'button';
  ctl.append(...demos.map((d) => d.b), bGuide);

  const box = make('div', uiMode === 'caption' ? 'ag-guide ag-guide-cap' : 'ag-guide');
  box.hidden = true;
  const head = make('div', 'ag-guide-head');
  head.append(make('b', '', Cm.guide), make('button', 'ag-guide-x', Cm.guide_close));
  const list = make('ol', 'ag-guide-list');
  const cap = make('div', 'ag-cap');
  const capNum = make('div', 'ag-cap-num');
  const capDo = make('b', 'ag-cap-do');
  const capPage = make('span', 'ag-cap-page');
  const capWhy = make('span', 'ag-cap-why');
  const capNav = make('div', 'ag-cap-nav');
  const labPrev = Cm.guide_prev || 'Prev';
  const labNext = Cm.guide_next || 'Next';
  const labDone = Cm.guide_done || 'Done';
  const labPending = Cm.guide_pending || '…';
  const labOk = Cm.guide_ok || 'OK';
  const labNextTopic = Cm.guide_next_topic || labNext;
  const bPrev = make('button', 'ag-cap-nav-b', labPrev);
  const bNext = make('button', 'ag-cap-nav-b primary', labNext);
  const capStatus = make('span', 'ag-cap-status', labPending);
  bPrev.type = 'button';
  bNext.type = 'button';
  capNav.append(bPrev, capStatus, bNext);
  cap.append(capNum, capDo, capPage, capWhy, capNav);
  if (uiMode === 'caption') {
    box.append(head, cap);
    bindDrag(box, head);
  } else box.append(head, list);
  stage.appendChild(box);

  const busy = () => running;

  function setOpen(on) {
    open = on;
    box.hidden = !on;
    bGuide.classList.toggle('active', on);
    if (on) paint(true);
  }

  function paintList(force, st, states, cur) {
    const key = `${topic}|${states.join()}|${cur}|${selected}|${running}`;
    if (!force && key === lastKey) return;
    lastKey = key;
    list.innerHTML = '';
    items.forEach((it, i) => {
      const done = states[i] === true;
      const isCur = i === cur;
      const show = i === cur || i === selected || done;
      const li = make('li', [done ? 'done' : '', isCur ? 'cur' : '', show ? 'open' : ''].filter(Boolean).join(' '));
      li.dataset.i = String(i);
      const row = make('div', 'ag-guide-do');
      row.append(make('i', '', done ? '✓' : String(i + 1)), make('b', '', it.do));
      li.appendChild(row);
      if (show) {
        if (it.page) {
          const how = make('div', 'ag-guide-how');
          how.append(make('span', 'ag-guide-tag', Cm.guide_page), make('span', '', it.page));
          li.appendChild(how);
        }
        if (it.device) {
          const how = make('div', 'ag-guide-how');
          how.append(make('span', 'ag-guide-tag device', Cm.guide_device), make('span', '', it.device));
          li.appendChild(how);
        }
        if (it.why && Cm.guide_why) {
          const how = make('div', 'ag-guide-how why');
          how.append(make('span', 'ag-guide-tag why', Cm.guide_why), make('span', '', it.why));
          li.appendChild(how);
        }
      }
      list.appendChild(li);
    });
  }

  function paintCaption(force, st, states) {
    // Stay on the current tip until the student clicks 下一步; only refresh ✅已完成.
    const i = Math.max(0, Math.min(items.length - 1, capIndex));
    capIndex = i;
    const it = items[i];
    const done = states[i] === true;
    const all = topicAllDone;
    const key = `${topic}|cap|${i}|${states.join()}|${done}|${all}|${running}`;
    if (!force && key === lastKey) return;
    lastKey = key;
    box.classList.toggle('done', done);
    capNum.textContent = `${i + 1} / ${items.length}${done ? ' · ✓' : ''}`;
    capDo.textContent = it.do;
    const pageBits = [it.page, it.device].filter(Boolean);
    capPage.textContent = pageBits.join(' · ');
    capPage.hidden = !pageBits.length;
    capWhy.textContent = it.why || '';
    capWhy.hidden = !it.why;
    bPrev.disabled = i <= 0;
    bNext.disabled = false;
    if (i >= items.length - 1) bNext.textContent = all ? labNextTopic : labDone;
    else bNext.textContent = labNext;
    capStatus.textContent = done ? labOk : labPending;
    capStatus.classList.toggle('ok', done);
    capStatus.classList.toggle('wait', !done);
  }

  function paint(force = false) {
    const st = checks();
    const states = items.map((it) => st[it.id] ?? null);
    topicAllDone = states.length > 0 && states.every((s) => s === true);
    if (!open) return;
    const cur = states.findIndex((s) => s !== true);
    if (uiMode === 'caption') paintCaption(force, st, states);
    else paintList(force, st, states, cur);
  }

  async function wait(ms, token) {
    const t0 = performance.now();
    while (performance.now() - t0 < ms) {
      if (token !== gen) throw new Error('cancel');
      await step();
    }
  }

  async function lerp(from, to, ms, apply, token) {
    if (from === to) { apply(to); return; }
    const t0 = performance.now();
    while (true) {
      if (token !== gen) throw new Error('cancel');
      const k = Math.min(1, (performance.now() - t0) / ms);
      apply(from + (to - from) * ease(k));
      if (k >= 1) break;
      await step();
    }
  }

  function idle() {
    running = false;
    for (const d of demos) {
      d.b.textContent = d.label;
      d.b.classList.remove('active');
    }
  }

  function cancel() {
    if (!running) return;
    gen++;
    idle();
    paint(true);
  }

  async function runDemo(d) {
    if (running) {
      const same = d.b.classList.contains('active');
      cancel();
      if (same) return;
    }
    const token = ++gen;
    running = true;
    learnDemo(module, topic);
    d.b.textContent = Cm.stop_demo;
    d.b.classList.add('active');
    setOpen(true);
    try {
      await d.run({
        wait: (ms) => wait(ms, token),
        lerp: (a, b, ms, fn) => lerp(a, b, ms, fn, token),
        token: () => token === gen,
      });
    } catch (e) {
      if (e?.message !== 'cancel') console.error(e);
    } finally {
      if (token === gen) {
        idle();
        paint(true);
      }
    }
  }

  for (const d of demos) d.b.addEventListener('click', () => { runDemo(d); });
  bGuide.addEventListener('click', () => setOpen(!open));
  const goCap = (dir, ev) => {
    ev.stopPropagation();
    const next = Math.max(0, Math.min(items.length - 1, capIndex + dir));
    if (next === capIndex) {
      // Last tip: only leave for the next page when the student clicks after all steps are done.
      if (dir > 0 && next >= items.length - 1) {
        if (topicAllDone) onTopicDone?.(topic);
        else setOpen(false);
      }
      return;
    }
    capIndex = next;
    lastKey = '';
    onStep?.(capIndex, items[capIndex]);
    paint(true);
  };
  bPrev.addEventListener('click', (ev) => goCap(-1, ev));
  bNext.addEventListener('click', (ev) => goCap(1, ev));
  box.addEventListener('click', (ev) => {
    if (ev.target.closest('.ag-guide-x')) { setOpen(false); return; }
    if (uiMode === 'caption') return;
    const li = ev.target.closest('li[data-i]');
    if (!li) return;
    const i = Number(li.dataset.i);
    selected = selected === i ? null : i;
    paint(true);
  });

  setOpen(startOpen);

  return {
    busy,
    cancel,
    tick: () => { logChecks(); paint(false); },
    stop() {
      gen++;
      running = false;
      for (const d of demos) d.b.remove();
      bGuide.remove();
      box.remove();
    },
  };
}

// Locate the peak on a fine grid, then animate a time-based sweep through it and settle on the peak.
export async function sweepMax(api, { from, to, step = 0.5, read, set, ms = 900 }) {
  let best = { v: -Infinity, at: from };
  const n = Math.max(1, Math.round(Math.abs(to - from) / step));
  const dir = to >= from ? 1 : -1;
  for (let i = 0; i <= n; i++) {
    const x = from + dir * i * step;
    set(x);
    const v = read();
    if (v > best.v) best = { v, at: x };
  }
  set(from);
  await api.wait(120);
  const q = (x) => set(Math.round(x / step) * step);
  await api.lerp(from, to, ms, q);
  await api.lerp(to, best.at, Math.max(350, ms * 0.35), q);
  set(best.at);
  return best;
}
