import './paut-exam.css';
import { createPautExamScene } from './scene.js';
import { PIPE, DEFECTS } from './pipe.js';
import { drawPaut, SW, SH } from '@paut/screen_paut.js';
import { savePng, shotName } from '../snapshot.js';
import * as P from '@paut/physics.js';

const TITLE = '输氢管道环焊缝相控阵与 TOFD 协同检测创新实验';
const COUP = { oil: '机油', paste: '化学浆糊', glycerin: '甘油', water: '水' };

const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
};

let root = null;
let scene = null;
let sideScan = null;
let readEls = {};
let fanBtn = null;

function fmt(v, d = 1) {
  return Number.isFinite(v) ? v.toFixed(d) : '—';
}

function fillSide(side, { couplant } = {}) {
  side.replaceChildren();
  const coup = COUP[couplant] || '—';
  const card = (title) => {
    const b = el('section', 'px-card');
    b.appendChild(el('h3', '', title));
    return b;
  };

  const spec = card('试件');
  const dl = el('dl', 'px-dl');
  for (const [k, v] of [
    ['规格', `Φ${PIPE.odMm} × ${PIPE.wtMm} mm`],
    ['单段长度', `${PIPE.segMm} mm × 2`],
    ['焊缝', '钢管环焊缝'],
    ['耦合剂', coup],
  ]) {
    dl.appendChild(el('dt', '', k));
    dl.appendChild(el('dd', '', v));
  }
  spec.appendChild(dl);
  side.appendChild(spec);

  const def = card('埋藏缺陷');
  const ul = el('ul', 'px-list');
  for (const d of DEFECTS) {
    ul.appendChild(el('li', '', `${d.name}　周向 ${d.pos0}–${d.pos1} mm　深度 ${d.depth0}–${d.depth1} mm`));
  }
  def.appendChild(ul);
  const tog = el('label', 'px-check');
  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.checked = true;
  cb.addEventListener('change', () => scene?.set({ showDefects: cb.checked }));
  tog.append(cb, document.createTextNode('显示缺陷'));
  def.appendChild(tog);
  side.appendChild(def);

  const pose = card('探头姿态');
  const poseDl = el('dl', 'px-dl');
  readEls = {};
  for (const [id, lab] of [
    ['pos', '周向位置'],
    ['axial', '轴向距离'],
    ['skew', '探头转角'],
    ['angle', '声束角'],
    ['hit', '当前缺陷'],
    ['amp', '闸门波高'],
  ]) {
    poseDl.appendChild(el('dt', '', lab));
    const dd = el('dd', '', '—');
    readEls[id] = dd;
    poseDl.appendChild(dd);
  }
  pose.appendChild(poseDl);

  const pad = el('div', 'px-pad');
  const mk = (label, fn) => {
    const b = el('button', 'px-chip', label);
    b.type = 'button';
    b.addEventListener('click', fn);
    return b;
  };
  pad.append(
    mk('周向 −', () => scene?.nudge('circ', -1)),
    mk('周向 ＋', () => scene?.nudge('circ', 1)),
    mk('轴向 −', () => scene?.nudge('axial', -1)),
    mk('轴向 ＋', () => scene?.nudge('axial', 1)),
    mk('左转', () => scene?.nudge('skew', -1)),
    mk('右转', () => scene?.nudge('skew', 1)),
    mk('声束 −', () => scene?.nudge('angle', -1)),
    mk('声束 ＋', () => scene?.nudge('angle', 1)),
  );
  pose.appendChild(pad);
  pose.appendChild(el('p', 'px-hint', '拖动探头：沿环焊缝与轴向移动。拖动仪器：平移。方向键移动探头，Q/E 转角，[ / ] 声束角。'));
  side.appendChild(pose);

  const scan = card('扇形扫描');
  fanBtn = mk('播放扇扫', () => {
    const st = scene?.getState();
    const on = !st?.fanPlay;
    scene?.set({ fanPlay: on });
    fanBtn.textContent = on ? '停止扇扫' : '播放扇扫';
  });
  const beamCbLab = el('label', 'px-check');
  const beamCb = document.createElement('input');
  beamCb.type = 'checkbox';
  beamCb.checked = true;
  beamCb.addEventListener('change', () => scene?.set({ showBeam: beamCb.checked }));
  beamCbLab.append(beamCb, document.createTextNode('显示声束'));
  scan.append(fanBtn, beamCbLab);
  side.appendChild(scan);

  const scr = card('仪器屏幕');
  const cv = el('canvas', 'px-scan');
  cv.width = SW;
  cv.height = SH;
  scr.appendChild(cv);
  side.appendChild(scr);
  sideScan = cv;

  const ops = card('视角');
  const bar = el('div', 'px-views');
  for (const [id, name] of [['bench', '工作台'], ['weld', '焊缝'], ['probe', '探头'], ['inst', '仪器']]) {
    bar.appendChild(mk(name, () => scene?.setView(id)));
  }
  ops.appendChild(bar);
  side.appendChild(ops);
}

function syncReadout(st) {
  if (!st || !readEls.pos) return;
  readEls.pos.textContent = `${fmt(st.pos)} mm`;
  readEls.axial.textContent = `${fmt(st.axialMm)} mm`;
  readEls.skew.textContent = `${fmt(st.skewDeg, 0)}°`;
  readEls.angle.textContent = `${fmt(st.angle, 0)}°（${P.PA_A0}–${P.PA_A1}°）`;
  readEls.hit.textContent = st.hits?.length ? st.hits.join('、') : '—';
  readEls.amp.textContent = st.readout ? `${fmt(st.readout.amp * 100, 0)} %FSH` : '闸门外';
  if (sideScan) drawPaut(sideScan.getContext('2d'), { angle: st.angle, pos: st.pos, focus: '' });
  if (fanBtn) fanBtn.textContent = st.fanPlay ? '停止扇扫' : '播放扇扫';
}

export function mountPautExam(parent) {
  if (root) return api();
  root = el('div', 'paut-exam-root');
  root.hidden = true;
  const head = el('header', 'px-head');
  const shot = el('button', 'px-chip', '导出图像');
  shot.type = 'button';
  shot.addEventListener('click', () => {
    const canvas = scene?.snapshot();
    if (canvas) savePng(canvas, shotName('paut-exam', '环焊缝'));
  });
  head.appendChild(shot);
  const body = el('div', 'px-body');
  const stage = el('div', 'px-stage');
  const banner = el('div', 'study-bench-banner exam-exp');
  const titleEl = el('strong');
  titleEl.textContent = TITLE;
  banner.appendChild(titleEl);
  stage.appendChild(banner);
  const bar = el('div', 'px-stage-bar');
  bar.appendChild(el('span', '', '拖动探头 / 仪器　方向键移动　Q E 转角　[ ] 声束'));
  stage.appendChild(bar);
  const side = el('aside', 'px-side');
  body.append(stage, side);
  root.append(head, body);
  parent.appendChild(root);

  function api() {
    return {
      open(opts = {}) {
        root.hidden = false;
        document.body.dataset.track = 'paut-exam';
        fillSide(side, opts);
        if (!scene) {
          scene = createPautExamScene(stage, { onChange: syncReadout });
        } else {
          syncReadout(scene.getState());
        }
        requestAnimationFrame(() => syncReadout(scene?.getState()));
      },
      close() {
        root.hidden = true;
        scene?.set({ fanPlay: false });
        if (document.body.dataset.track === 'paut-exam') document.body.dataset.track = 'plate';
      },
      dispose() {
        scene?.dispose();
        scene = null;
        root.remove();
        root = null;
      },
      opened: () => !!root && !root.hidden,
    };
  }
  return api();
}
