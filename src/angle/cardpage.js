// Weld technique card page: reference card (ref), self check (try), exam design with score, record and report (design).
import { button } from './diagrams.js';
import { make, card, readouts } from './beam.js';
import { createWeldCard } from './weldcard.js';
import { openReport } from '../report.js';
import { licenseMark, licensedStudent } from '../license.js';
import { createCalibHelp } from './calibhelp.js';
import { learnScore } from '../learnlog.js';

const STORE = 'ut.angle.design';
const pad2 = (n) => String(n).padStart(2, '0');
const fmt = (v) => (v == null ? '' : Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100));
const floor2 = (v) => Math.floor(v * 100 + 1e-9) / 100;
const fill = (s, v) => s.replace(/\{(\w+)\}/g, (_, k) => (v[k] ?? `{${k}}`));
const stamp = (d) => `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}-${pad2(d.getHours())}${pad2(d.getMinutes())}`;
const clock = (iso) => new Date(iso).toLocaleTimeString('zh-CN', { hour12: false });
const dur = (ms) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${pad2(s % 60)}`;
};

let WC = null;
const ST = { try: { id: null, raw: {}, check: null, picked: false }, ref: { picked: false, seen: new Set() }, design: null };

function wcOf(ctx) {
  WC ??= createWeldCard(ctx.tasks, ctx.std);
  return WC;
}

function designState() {
  const lic = licensedStudent();
  if (ST.design && (!lic || ST.design.student.no === lic.student_no)) return ST.design;
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(STORE) || 'null'); } catch { saved = null; }
  if (lic && saved?.student?.no && saved.student.no !== lic.student_no) saved = null;
  ST.design = saved?.raws ? saved : { id: null, raws: {}, results: {}, submits: {}, log: [], student: { name: '', no: '' } };
  return ST.design;
}
function saveDesign() {
  try { localStorage.setItem(STORE, JSON.stringify(ST.design)); } catch { /* kept in this page */ }
}
function logDesign(act, detail = '') {
  const d = designState();
  d.log.push({ at: new Date().toISOString(), act, detail: String(detail) });
  saveDesign();
}

export function basisValues(wc, tk, card, X) {
  const r = wc.reference(tk);
  const k = typeof card?.K === 'number' && card.K > 0 ? card.K : r.card.K;
  return {
    t: fmt(tk.t_mm), kt0: fmt(r.Ktable[0]), kt1: fmt(r.Ktable[1]), b0: fmt(r.bottom[0]), b1: fmt(r.bottom[1]), kmax: fmt(floor2(r.K[1])),
    f0: fmt(r.MHz[0]), f1: fmt(r.MHz[1]), block: r.block, sides: r.sides.map((s) => X.options.sides[s]).join(' / '),
    k: fmt(k), zmin: fmt(Math.ceil(r.zone_coef * k * 10) / 10), beside: fmt(r.beside), dac_ref: r.dac_ref, EL: fmt(r.EL), SL: fmt(r.SL), RL: fmt(r.RL),
    pct: fmt(r.el_pct), trans: fmt(r.trans), comp: fmt(r.comp), acc: X.options.acceptance[r.acceptance],
  };
}

export function basisText(wc, tk, id, card, X) {
  const v = basisValues(wc, tk, card, X);
  if (id === 'table') return X.basis[tk.work === 'pipe' ? 'table_pipe' : 'table_vessel'];
  return fill(X.basis[id], v);
}

export function rangeText(wc, tk, id, X) {
  const r = wc.reference(tk);
  const R = X.range;
  const opt = (k, v) => X.options[k]?.[v] ?? v;
  switch (id) {
    case 'K': return fill(R.between, { a: fmt(r.K[0]), b: fmt(floor2(r.K[1])) });
    case 'MHz': return fill(R.between, { a: fmt(r.MHz[0]), b: fmt(r.MHz[1]) });
    case 'zone': return fill(R.min, { a: `${fmt(r.zone_coef / tk.t_mm)}·K·t` });
    case 'beside': return fill(R.min, { a: fmt(r.beside) });
    case 'el_pct': return fill(R.between, { a: fmt(r.el_pct), b: '100' });
    case 'comp': return `${fmt(r.comp)} ± ${fmt(wc.tolerance.comp_dB)}`;
    case 'sides': return r.sides.map((s) => opt('sides', s)).join(' / ');
    case 'block': case 'level': case 'table': case 'acceptance': return opt(id, r[id]);
    default: return fmt(r[id]);
  }
}

export function valueText(wc, id, v, X) {
  if (v == null || v === '') return X.pick;
  const f = wc.field(id);
  return f.type === 'select' ? X.options[id]?.[v] ?? String(v) : fmt(v);
}

export function briefRows(tk, X) {
  const B = X.brief_rows;
  const rows = [[B.id, tk.id], [B.work, X.works[tk.work]], [B.material, tk.material], [B.t, `${fmt(tk.t_mm)} mm`]];
  if (tk.od_mm) rows.push([B.od, `${fmt(tk.od_mm)} mm`]);
  rows.push([B.joint, X.joint], [B.acceptance, X.options.acceptance[tk.acceptance]], [B.loss, `${fmt(tk.loss_dB)} dB`], [B.probe, X.probe]);
  return rows;
}

function kvCard(side, title, rows) {
  const c = card(side, title);
  const dl = make('dl', 'ag-params ag-bm-read');
  for (const [k, v] of rows) dl.append(make('dt', '', k), make('dd', '', v));
  c.appendChild(dl);
  return c;
}

function selectOf(opts, value, onChange) {
  const s = document.createElement('select');
  for (const [v, lab] of opts) {
    const o = document.createElement('option');
    o.value = v;
    o.textContent = lab;
    s.appendChild(o);
  }
  s.value = value ?? '';
  s.addEventListener('change', () => onChange(s.value));
  return s;
}

function taskChips(host, wc, X, current, onPick) {
  const row = make('div', 'ag-wc-tasks');
  for (const tk of wc.tasks()) {
    const b = make('button', `ag-chip${tk.id === current ? ' active' : ''}`);
    b.type = 'button';
    b.dataset.task = tk.id;
    b.append(make('b', '', tk.id), make('span', '', ` ${fmt(tk.t_mm)} mm · ${X.works[tk.work].slice(0, 4)}`));
    b.addEventListener('click', () => onPick(tk.id));
    row.appendChild(b);
  }
  host.appendChild(row);
  return row;
}

// ---------------------------------------------------------------- reference card
function renderRef(main, side, ctx) {
  const X = ctx.cardText;
  const wc = wcOf(ctx);
  const st = ST.try;
  st.id ??= wc.tasks()[0].id;
  const head = make('div', 'dg-head');
  head.append(make('h3', '', X.topics.ref), make('div', 'dg-controls'));
  main.appendChild(head);
  const lr = ST.ref;
  taskChips(main, wc, X, st.id, (id) => { help?.cancel(); lr.picked = true; st.id = id; st.raw = {}; st.check = null; ctx.rerender('ref'); });
  const tk = wc.task(st.id);
  const r = wc.reference(tk);
  const wrap = make('div', 'ag-ev-wrap ag-wc-wrap');
  const table = make('table', 'ag-media ag-ev-table ag-wc-table');
  const hr = make('tr');
  for (const h of X.ref_head) hr.appendChild(make('th', '', h));
  table.appendChild(hr);
  const rows = {};
  const pickRow = (id) => {
    for (const tr of Object.values(rows)) tr.classList.toggle('on', tr === rows[id]);
    lr.seen.add(id);
    help?.tick();
  };
  for (const g of wc.groups()) {
    const gr = make('tr', 'ag-wc-group');
    const gc = make('td', '', X.groups[g]);
    gc.colSpan = 4;
    gr.appendChild(gc);
    table.appendChild(gr);
    for (const f of wc.fields().filter((q) => q.group === g)) {
      const tr = make('tr', 'ag-wc-pick');
      tr.dataset.field = f.id;
      tr.append(make('td', '', X.fields[f.id]), make('td', 'ag-wc-val', valueText(wc, f.id, r.card[f.id], X)), make('td', '', rangeText(wc, tk, f.id, X)), make('td', 'ag-wc-basis', basisText(wc, tk, f.id, r.card, X)));
      tr.addEventListener('click', () => { help?.cancel(); pickRow(f.id); });
      rows[f.id] = tr;
      table.appendChild(tr);
    }
  }
  wrap.appendChild(table);
  main.appendChild(wrap);
  const tipHost = make('div', 'ag-guide-dock');
  side.prepend(tipHost);
  kvCard(side, X.brief, briefRows(tk, X));

  const H = X.help;
  const groupDone = (g) => wc.fields().filter((f) => f.group === g).every((f) => lr.seen.has(f.id));
  const help = createCalibHelp({
    ctl: head.lastChild, stage: tipHost, text: { common: { ...H, demo: H.ref_demo } }, topic: 'ref', module: 'angle-card',
    startOpen: document.body.dataset.learningRole === 'student',
    items: [{ id: 'task', ...H.task }, ...wc.groups().map((g) => ({ id: g, do: fill(H.ref_do, { g: X.groups[g] }), page: H.ref_page, why: H.why[g] }))],
    onTopicDone: () => ctx.onTopicDone?.('ref'),
    checks: () => ({ task: lr.picked, ...Object.fromEntries(wc.groups().map((g) => [g, groupDone(g)])) }),
    demo: async (d) => {
      lr.picked = true;
      for (const f of wc.fields()) {
        pickRow(f.id);
        rows[f.id].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        await d.wait(1100);
      }
      pickRow(null);
    },
  });
  help.tick();
  return { stop: () => help.stop(), state: () => ({ id: st.id, card: r.card }) };
}

// ---------------------------------------------------------------- fill-in card (try / design)
function cardForm(host, wc, tk, raw, check, X, { onEdit, locked = false }) {
  const wrap = make('div', 'ag-ev-wrap ag-wc-wrap');
  const table = make('table', 'ag-media ag-ev-table ag-wc-table');
  const hr = make('tr');
  for (const h of X.head) hr.appendChild(make('th', '', h));
  table.appendChild(hr);
  const card0 = wc.parse(raw);
  for (const g of wc.groups()) {
    const gr = make('tr', 'ag-wc-group');
    const gc = make('td', '', X.groups[g]);
    gc.colSpan = 4;
    gr.appendChild(gc);
    table.appendChild(gr);
    for (const f of wc.fields().filter((q) => q.group === g)) {
      const tr = make('tr');
      tr.dataset.field = f.id;
      tr.appendChild(make('td', '', X.fields[f.id]));
      const cell = make('td', `ag-ev-in${check ? (check.ok[f.id] ? ' ok' : ' bad') : ''}`);
      let input;
      if (f.type === 'select') {
        input = selectOf([['', X.pick], ...f.options.map((o) => [o, X.options[f.id]?.[o] ?? o])], raw[f.id] ?? '', (v) => onEdit(f.id, v));
      } else {
        input = Object.assign(document.createElement('input'), { type: 'number', step: f.step ?? 'any', inputMode: 'decimal' });
        input.value = raw[f.id] ?? '';
        input.addEventListener('change', () => onEdit(f.id, input.value));
      }
      input.name = f.id;
      input.disabled = locked;
      cell.appendChild(input);
      tr.appendChild(cell);
      tr.appendChild(make('td', check ? (check.ok[f.id] ? 'ok' : 'bad') : '', check ? (check.ok[f.id] ? X.ok : X.ng) : ''));
      tr.appendChild(make('td', 'ag-wc-basis', check ? basisText(wc, tk, f.id, card0, X) : ''));
      table.appendChild(tr);
    }
  }
  wrap.appendChild(table);
  host.appendChild(wrap);
  return table;
}

function scoreCard(side, wc, check, X, title) {
  const c = card(side, title);
  const t = make('table', 'ag-media ag-cb-pts');
  const hr = make('tr');
  for (const h of X.report.score_head) hr.appendChild(make('th', '', h));
  t.appendChild(hr);
  for (const g of check.groups) {
    const r = make('tr');
    r.append(make('td', '', X.groups[g.group]), make('td', g.ok ? 'ok' : 'bad', fmt(g.points)), make('td', '', fmt(g.max)));
    t.appendChild(r);
  }
  const fr = make('tr', 'ag-wc-total');
  fr.append(make('th', '', X.total), make('th', '', fmt(check.score)), make('th', '', fmt(check.max)));
  t.appendChild(fr);
  c.appendChild(t);
  return c;
}

function renderTry(main, side, ctx) {
  const X = ctx.cardText;
  const wc = wcOf(ctx);
  const st = ST.try;
  st.id ??= wc.tasks()[0].id;
  const head = make('div', 'dg-head');
  const ctl = make('div', 'dg-controls');
  head.append(make('h3', '', X.topics.try), ctl);
  main.appendChild(head);
  const runCheck = () => { st.check = wc.check(wc.parse(st.raw), wc.task(st.id)); ctx.rerender('try'); };
  const bCheck = button(ctl, X.check, () => {
    help?.cancel();
    runCheck();
    learnScore('angle-card', 'try', st.check.score, st.check.max);
  });
  bCheck.classList.add('ag-cb-rec');
  button(ctl, X.clear, () => { help?.cancel(); st.raw = {}; st.check = null; ctx.rerender('try'); });
  taskChips(main, wc, X, st.id, (id) => { help?.cancel(); st.picked = true; st.id = id; st.raw = {}; st.check = null; ctx.rerender('try'); });
  const tk = wc.task(st.id);
  const table = cardForm(main, wc, tk, st.raw, st.check, X, {
    onEdit: (id, v) => {
      help?.cancel();
      st.raw[id] = v;
      if (st.check) { st.check = null; ctx.rerender('try'); } else help?.tick();
    },
  });
  const tipHost = make('div', 'ag-guide-dock');
  side.prepend(tipHost);
  kvCard(side, X.brief, briefRows(tk, X));
  if (st.check) scoreCard(side, wc, st.check, X, X.score);

  const H = X.help;
  const filled = (g) => wc.fields().filter((f) => f.group === g).every((f) => st.raw[f.id] != null && st.raw[f.id] !== '');
  const help = createCalibHelp({
    ctl, stage: tipHost, text: { common: { ...H, demo: H.try_demo } }, topic: 'try', module: 'angle-card',
    startOpen: document.body.dataset.learningRole === 'student',
    items: [{ id: 'task', ...H.task }, ...wc.groups().map((g) => ({ id: g, do: fill(H.fill_do, { g: X.groups[g] }), page: H.fill_page, why: H.why[g] })),
      { id: 'check', ...H.check }, { id: 'fix', ...H.fix }],
    onTopicDone: () => ctx.onTopicDone?.('try'),
    checks: () => ({ task: st.picked || !!st.check, ...Object.fromEntries(wc.groups().map((g) => [g, filled(g)])), check: !!st.check, fix: !!st.check && st.check.score === st.check.max }),
    demo: async (d) => {
      const ref = wc.reference(tk).card;
      st.picked = true;
      st.check = null;
      st.raw = {};
      for (const f of wc.fields()) {
        const el = table.querySelector(`[name="${f.id}"]`);
        if (!el) continue;
        el.value = '';
        el.closest('td').classList.remove('ok', 'bad');
      }
      for (const f of wc.fields()) {
        const el = table.querySelector(`[name="${f.id}"]`);
        const v = ref[f.id];
        if (!el || v == null) continue;
        el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        el.closest('tr').classList.add('on');
        await d.wait(450);
        el.value = f.type === 'select' ? String(v) : fmt(v);
        st.raw[f.id] = el.value;
        help.tick();
        await d.wait(650);
        el.closest('tr').classList.remove('on');
      }
      await d.wait(400);
      runCheck();
    },
  });
  help.tick();
  return { stop: () => help.stop(), check: () => bCheck.click(), state: () => ({ id: st.id, raw: { ...st.raw }, check: st.check }) };
}

// ---------------------------------------------------------------- exam design
function renderDesign(main, side, ctx) {
  const X = ctx.cardText;
  const wc = wcOf(ctx);
  const d = designState();
  const lic = licensedStudent();
  if (lic) d.student = { name: lic.name, no: lic.student_no };
  d.id ??= wc.tasks()[0].id;
  if (!d.log.length) logDesign('start');
  const head = make('div', 'dg-head');
  const ctl = make('div', 'dg-controls');
  head.append(make('h3', '', X.topics.design), ctl);
  main.appendChild(head);
  const bSubmit = button(ctl, X.submit, () => submit());
  bSubmit.classList.add('ag-cb-rec');
  const bRecord = button(ctl, X.record, () => openRecord());
  taskChips(main, wc, X, d.id, (id) => {
    if (id === d.id) return;
    d.id = id;
    logDesign('task', id);
    ctx.rerender('design');
  });
  const tk = wc.task(d.id);
  const raw = (d.raws[d.id] ??= {});
  const res = d.results[d.id];
  const fresh = res && JSON.stringify(res.raw) === JSON.stringify(raw);
  cardForm(main, wc, tk, raw, fresh ? res.check : null, X, {
    onEdit: (id, v) => {
      raw[id] = v;
      logDesign('edit', `${d.id} ${X.fields[id]} = ${valueText(wc, id, wc.parse({ [id]: v })[id], X)}`);
      if (fresh) ctx.rerender('design');
    },
  });

  const sc = card(side, X.student.title);
  for (const k of ['name', 'no']) {
    const l = make('label', 'ag-sc-row ag-cb-num ag-wc-stu');
    const inp = Object.assign(document.createElement('input'), { type: 'text', value: d.student[k] ?? '', name: `student_${k}` });
    inp.readOnly = !!lic;
    inp.addEventListener('change', () => { d.student[k] = inp.value.trim(); saveDesign(); });
    l.append(make('span', '', X.student[k]), inp);
    sc.appendChild(l);
  }
  kvCard(side, X.brief, briefRows(tk, X));
  if (res) {
    const c = scoreCard(side, wc, res.check, X, `${X.score} · ${X.submitted} ${clock(res.at)}`);
    const dl = make('dl', 'ag-params ag-bm-read');
    dl.append(make('dt', '', X.submits), make('dd', '', String(d.submits[d.id] ?? 0)));
    c.appendChild(dl);
  }
  bRecord.disabled = !res;

  function submit() {
    if (!d.student.name || !d.student.no) {
      window.alert(X.exam.missing);
      return;
    }
    const check = wc.check(wc.parse(raw), tk);
    d.results[d.id] = { raw: { ...raw }, check, at: new Date().toISOString() };
    d.submits[d.id] = (d.submits[d.id] ?? 0) + 1;
    logDesign('submit', `${d.id} ${fmt(check.score)}`);
    ctx.rerender('design');
  }

  function openRecord() {
    const r = d.results[d.id];
    if (!r) return null;
    logDesign('export', d.id);
    const R = X.report;
    const now = new Date();
    const card0 = wc.parse(r.raw);
    const t0 = d.log.find((e) => e.act === 'start')?.at;
    const model = {
      title: R.title,
      meta: [[R.meta.name, d.student.name || X.pick], [R.meta.no, d.student.no || X.pick], [R.meta.task, tk.id],
        [R.meta.time, new Date(r.at).toLocaleString('zh-CN', { hour12: false })], [R.meta.elapsed, t0 ? dur(Date.parse(r.at) - Date.parse(t0)) : X.pick],
        [R.meta.submits, String(d.submits[d.id] ?? 0)]],
      sections: [
        { title: R.sections.brief, parts: [{ kv: briefRows(tk, X) }] },
        { title: R.sections.card, parts: [{ table: { head: X.head, rows: wc.fields().map((f) => [X.fields[f.id], valueText(wc, f.id, card0[f.id], X),
          { text: r.check.ok[f.id] ? X.ok : X.ng, cls: r.check.ok[f.id] ? 'ok' : 'ng' }, { text: basisText(wc, tk, f.id, card0, X), cls: 'l' }]) } }] },
        { title: R.sections.score, parts: [{ table: { head: R.score_head,
          rows: r.check.groups.map((g) => [X.groups[g.group], { text: fmt(g.points), cls: g.ok ? 'ok' : 'ng' }, fmt(g.max)]),
          foot: [X.total, fmt(r.check.score), fmt(r.check.max)] } }] },
        { title: R.sections.log, parts: [{ table: { head: R.log_head, rows: d.log.map((e) => [clock(e.at), X.log[e.act] ?? e.act, { text: e.detail, cls: 'l' }]) } }] },
      ],
    };
    const view = openReport(model, { printLabel: R.print, closeLabel: R.close });
    const mark = licenseMark();
    if (mark) view.appendChild(make('p', 'rp-lic', mark));
    const who = String(d.student.no || d.student.name || '').replace(/[\\/:*?"<>|\s]/g, '_');
    view.dataset.pdf = `${R.file}_${tk.id}${who ? `_${who}` : ''}_${stamp(now)}`;
    return view;
  }

  return { stop: () => {}, submit, record: openRecord, state: () => ({ id: d.id, raw: { ...raw }, result: d.results[d.id] ?? null, student: { ...d.student }, log: d.log.slice() }) };
}

export const CARD_TOPICS = { 'angle-card': ['ref', 'try', 'design'], 'angle-design': ['design'] };

export function renderCardTopic(topic, main, side, ctx) {
  main.innerHTML = '';
  side.innerHTML = '';
  if (topic === 'design') return renderDesign(main, side, ctx);
  return topic === 'try' ? renderTry(main, side, ctx) : renderRef(main, side, ctx);
}

export function resetDesign() {
  ST.design = null;
  ST.try = { id: null, raw: {}, check: null, picked: false };
  ST.ref = { picked: false, seen: new Set() };
  try { localStorage.removeItem(STORE); } catch { /* none */ }
}
