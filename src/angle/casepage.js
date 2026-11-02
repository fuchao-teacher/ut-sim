// Weld case library (teacher): seeded 22 mm plates with the reference evaluation; exam plate lookup by plate code.
import { make, card } from './beam.js';
import { weldOf, caseOf } from './scanpage.js';
import { natureOf } from './evaluate.js';

const f1 = (v) => v.toFixed(1);
const cache = new Map();
const ST = { seed: null, extra: [], lookup: '' };

function evalSeed(w, seed) {
  if (!cache.has(seed)) {
    const cs = caseOf(w, 'random', seed);
    cache.set(seed, { cs, ev: w.evaluateCase(cs.defs, cs.built) });
  }
  return cache.get(seed);
}

function renderCases(main, side, ctx) {
  const X = ctx.cardText;
  const K = X.cases;
  const SC = ctx.text;
  const E = SC.eval;
  const Cm = SC.common;
  const w = weldOf(ctx);
  const seeds = [...ctx.tasks.exam.library, ...ST.extra.filter((s) => !ctx.tasks.exam.library.includes(s))];
  ST.seed ??= seeds[0];

  const head = make('div', 'dg-head');
  head.append(make('h3', '', K.title), make('div', 'dg-controls'));
  main.appendChild(head);
  const wrap = make('div', 'ag-ev-wrap ag-cs-wrap');
  const table = make('table', 'ag-media ag-ev-table ag-cs-table');
  const hr = make('tr');
  for (const h of K.head) hr.appendChild(make('th', '', h));
  table.appendChild(hr);
  for (const s of seeds) {
    const { cs, ev } = evalSeed(w, s);
    const r = make('tr', s === ST.seed ? 'sel' : '');
    r.dataset.seed = String(s);
    const kinds = [...new Set(cs.built.map((b) => SC.types[b.meta.type]))].join(' / ');
    r.append(make('td', '', String(s)), make('td', '', `${fill(K.count, { n: cs.built.length })} · ${kinds}`), make('td', '', E.grades[ev.level]), make('td', ev.verdict === 'accept' ? 'ok' : 'bad', E.verdicts[ev.verdict]));
    r.addEventListener('click', () => { ST.seed = s; ctx.rerender('cases'); });
    table.appendChild(r);
  }
  wrap.appendChild(table);
  main.appendChild(wrap);

  const { ev } = evalSeed(w, ST.seed);
  const det = make('div', 'ag-ev-wrap ag-cs-wrap');
  det.appendChild(make('h4', 'ag-cs-sub', `${K.seed} ${ST.seed} · ${E.grades[ev.level]} · ${E.verdicts[ev.verdict]}`));
  const dt = make('table', 'ag-media ag-ev-table ag-cs-def');
  const dh = make('tr');
  for (const h of K.def_head) dh.appendChild(make('th', '', h));
  dt.appendChild(dh);
  const { cs } = evalSeed(w, ST.seed);
  const metaOf = Object.fromEntries(cs.built.map((b) => [b.meta.id, b.meta]));
  for (const q of ev.indications) {
    const m = metaOf[q.id];
    const len = q.length == null ? E.methods[q.method] ?? Cm.none : `${f1(q.length)} ${Cm.mm} (${E.methods[q.method]})`;
    const r = make('tr');
    r.append(make('td', '', q.id), make('td', '', `${E.natures[natureOf(q.type)]}${q.type === 'transverse_crack' ? ` (${SC.types.transverse_crack})` : ''}`),
      make('td', '', m.transverse ? f1(m.y0) : `${f1(m.y0)}–${f1(m.y1)}`), make('td', '', `${f1(m.z[0])}–${f1(m.z[1])}`),
      make('td', '', Cm.zones[q.zone]), make('td', '', len), make('td', q.grade === 'reject' || q.grade === 'III' ? 'bad' : '', E.grades[q.grade]));
    dt.appendChild(r);
  }
  det.appendChild(dt);
  main.appendChild(det);

  const lc = card(side, K.lookup);
  const l = make('label', 'ag-sc-row ag-cb-num ag-wc-stu');
  const inp = Object.assign(document.createElement('input'), { type: 'number', min: 1, max: ctx.tasks.exam.seed_space, step: 1, name: 'lookup_seed', value: ST.lookup });
  l.append(make('span', '', K.seed), inp);
  lc.appendChild(l);
  const b = make('button', 'ag-chip active', K.query);
  b.type = 'button';
  b.addEventListener('click', () => {
    const s = parseInt(inp.value, 10);
    if (!(s >= 1 && s <= ctx.tasks.exam.seed_space)) return;
    ST.lookup = `${s}`;
    if (!seeds.includes(s)) ST.extra.push(s);
    ST.seed = s;
    ctx.rerender('cases');
  });
  lc.appendChild(b);
  const pc = card(side, Cm.plate);
  pc.appendChild(make('p', 'ag-ev-note', X.exam.plate));
  return { stop: () => {}, state: () => ({ seed: ST.seed, level: ev.level, verdict: ev.verdict, seeds }) };
}

const fill = (s, v) => s.replace(/\{(\w+)\}/g, (_, k) => (v[k] ?? `{${k}}`));

export function renderCasesTopic(topic, main, side, ctx) {
  main.innerHTML = '';
  side.innerHTML = '';
  return renderCases(main, side, ctx);
}
