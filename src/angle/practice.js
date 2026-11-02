// Practice layout shared by calibration and scanning: head bar, 3D bench stage with bottom quick bar
// (views / probe pad / tune / scope), flaw-detector screen as a toggle overlay; side panel for tips & readouts.
import AB from '../../../knowledge/angle_bench.json';
import learningDoc from '../../../knowledge/learning.json';
import { savePng, shotName } from '../snapshot.js';

const VIEW_KEYS = ['system', 'probe', 'screen', 'panel', 'cutaway'];

const make = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};
const withTip = (el, text) => {
  if (text) el.dataset.tip = text;
  return el;
};

export function practiceStage(main, side, ctx, title) {
  main.classList.add('ag-op-main');
  const tipHost = make('div', 'ag-guide-dock');
  side.appendChild(tipHost);
  // Match plate ss-bar: views + tune | pad | ops; no duplicate quick controls above the stage.
  const stage = make('div', 'ag-op-stage');
  main.appendChild(stage);
  const examTitle = ctx.exam
    ? (learningDoc.roles?.exam?.items || []).find((it) => it.route === 'angle-exam' || it.track === 'weld')?.title
    : '';
  if (examTitle) {
    const banner = make('div', 'study-bench-banner exam-exp');
    const strong = make('strong');
    strong.textContent = examTitle;
    banner.appendChild(strong);
    stage.appendChild(banner);
  }
  const msg = make('div', 'ag-cb-msg ag-op-msg');
  stage.appendChild(msg);

  const bar = make('div', 'ag-op-bar');
  const barL = make('div', 'ag-op-bar-l');
  const barM = make('div', 'ag-op-bar-m');
  const barR = make('div', 'ag-op-bar-r');
  const ctl = make('div', 'dg-controls ag-op-ctl');
  bar.append(barL, barM, barR);
  main.appendChild(bar);

  const Tips = AB.tips || {};
  const viewBtns = {};
  for (const k of VIEW_KEYS) {
    const b = withTip(make('button', 'ag-chip', AB.views[k]), Tips[k]);
    b.type = 'button';
    b.dataset.view = k;
    b.addEventListener('click', () => {
      B.view(k);
      syncViews();
    });
    barL.appendChild(b);
    viewBtns[k] = b;
  }
  const bTune = withTip(make('button', 'ag-chip ag-op-tune', AB.bar.tune), Tips.tune);
  bTune.type = 'button';
  barL.appendChild(bTune);
  const bScope = withTip(make('button', 'ag-chip ag-op-scope', AB.bar.scope), Tips.scope);
  bScope.type = 'button';
  const bShot = withTip(make('button', 'ag-chip', AB.export_image), Tips.export_image);
  bShot.type = 'button';
  bShot.addEventListener('click', () => savePng(B.snapshot(), shotName(AB.shot_3d, title)));
  // Topic-specific ops (beam / clear / demo / guide) land in ctl; keep scope + export on the right like plate.
  barR.append(ctl, bScope, bShot);

  const B = ctx.bench();
  const sc = ctx.scope();
  const scr = make('div', 'ag-card ag-scope-card ag-scope-float');
  scr.hidden = true;
  scr.appendChild(make('h3', '', AB.ascan));
  const exp = withTip(make('button', 'ag-chip ag-scope-export', AB.export_wave), Tips.export_wave);
  exp.type = 'button';
  exp.addEventListener('click', () => savePng(sc.exportCanvas(), shotName(AB.shot_ascan, title)));
  const closeSc = withTip(make('button', 'ag-chip ag-scope-x', AB.bar.close), Tips.close);
  closeSc.type = 'button';
  closeSc.addEventListener('click', () => setScope(false));
  scr.append(exp, closeSc);
  stage.appendChild(scr);

  let on = false;
  let scopeOn = false;
  let tuneOn = false;
  let panelEl = null;

  function syncViews() {
    const cur = B.viewKey;
    for (const [k, b] of Object.entries(viewBtns)) b.classList.toggle('active', k === cur);
  }
  function setScope(v) {
    scopeOn = v;
    scr.hidden = !v;
    bScope.classList.toggle('active', v);
    if (v) sc.refresh();
  }
  function setTune(v) {
    tuneOn = v;
    bTune.classList.toggle('active', v);
    if (panelEl) panelEl.classList.toggle('ag-qp-open', v);
  }
  bScope.addEventListener('click', () => setScope(!scopeOn));
  bTune.addEventListener('click', () => setTune(!tuneOn));

  return {
    ctl, stage, tipHost, msg, B, sc, scr, bar, barL, barM, barR,
    // Kept for callers that still destructure `head` from older practice pages.
    head: null,
    showScope: setScope,
    showTune: setTune,
    // cfg: scope config + drag(x, y, phase); rows: extra quick-panel rows [[label, (host, btn) => {}]]
    start(cfg, rows) {
      sc.attach(cfg);
      sc.mountScreen(scr);
      B.attach(stage, {
        control: (hit) => (hit.id === 'encoder' ? sc.turn(hit.side) : sc.press(hit.id)),
        tick: () => sc.tick(),
        drag: cfg.drag,
        kitPick: cfg.kitPick,
        view: () => syncViews(),
      });
      panelEl = sc.mountPanel(stage, rows);
      panelEl?.classList.add('ag-qp-dock');
      setTune(false);
      setScope(false);
      syncViews();
      on = true;
      B.ready.then(() => { if (on) sc.refresh(); });
    },
    stop() {
      on = false;
      sc.detach();
      B.release();
      panelEl = null;
      main.classList.remove('ag-op-main');
    },
  };
}
