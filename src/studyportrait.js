// Derive a student learning portrait from trackScore + learnRecord (aggregate fields only).
import { trackScore } from './studyscore.js';

const pct = (n, d) => (d > 0 ? Math.round((100 * n) / d) : 0);

function moduleTitleOf(id, titles) {
  return titles?.[id] || id;
}

/** @param {object} track study_report track
 *  @param {object} record learnRecord()
 *  @param {{ moduleTitles?: Record<string,string> }} [opt] */
export function buildPortrait(track, record, opt = {}) {
  const score = trackScore(track, record);
  const titles = opt.moduleTitles || {};
  const totalSec = score.seconds || 0;

  const modules = score.modules.map((m) => ({
    id: m.id,
    title: moduleTitleOf(m.id, titles),
    finished: m.finished,
    count: m.count,
    seconds: m.seconds,
    status: m.status,
    progress: pct(m.finished, m.count),
    timeShare: pct(m.seconds, totalSec),
  }));

  const path = [];
  for (const m of score.modules) {
    for (const s of m.steps) {
      if (!s.first) continue;
      path.push({
        moduleId: m.id,
        moduleTitle: moduleTitleOf(m.id, titles),
        stepId: s.id,
        title: s.title || s.id,
        first: s.first,
        last: s.last,
        seconds: s.seconds,
        visits: s.visits,
        status: s.status,
        done: s.done,
        total: s.total,
      });
    }
  }
  path.sort((a, b) => String(a.first).localeCompare(String(b.first)));

  const skim = [];
  const weak = [];
  let demos = 0;
  let testAttempts = 0;
  for (const m of score.modules) {
    for (const s of m.steps) {
      demos += s.demos || 0;
      testAttempts += s.tests || 0;
      if (s.status !== 'done' && s.visits >= 3) {
        skim.push({
          moduleId: m.id,
          moduleTitle: moduleTitleOf(m.id, titles),
          stepId: s.id,
          title: s.title || s.id,
          visits: s.visits,
          seconds: s.seconds,
          status: s.status,
        });
      }
      if (s.status !== 'done' && (s.seconds >= 60 || s.visits >= 1)) {
        weak.push({
          moduleId: m.id,
          moduleTitle: moduleTitleOf(m.id, titles),
          stepId: s.id,
          title: s.title || s.id,
          visits: s.visits,
          seconds: s.seconds,
          done: s.done,
          total: s.total,
          status: s.status,
        });
      }
    }
  }
  weak.sort((a, b) => (b.seconds - a.seconds) || (b.visits - a.visits));
  skim.sort((a, b) => b.visits - a.visits);

  const orid = record?.orid || {};
  const oridFilled = ['o', 'r', 'i', 'd'].filter((k) => String(orid[k] || '').trim()).length;

  const since = record?.since || null;
  let days = null;
  if (since) {
    const t0 = Date.parse(since);
    if (Number.isFinite(t0)) days = Math.max(1, Math.ceil((Date.now() - t0) / 86400000));
  }

  return {
    trackId: track.id,
    trackTitle: track.title,
    progress: pct(score.finished, score.count),
    finished: score.finished,
    count: score.count,
    seconds: totalSec,
    status: score.status,
    since,
    days,
    modules,
    path,
    weak: weak.slice(0, 8),
    skim: skim.slice(0, 6),
    habits: {
      demos,
      testAttempts,
      pathSteps: path.length,
      oridFilled,
      oridTotal: 4,
    },
    ai: record?.ai || null,
    score,
  };
}

/** Compact fact object for DeepSeek — no invented events. */
export function portraitFacts(portrait, { orid = {}, student = {} } = {}) {
  return {
    track: portrait.trackTitle,
    student: { name: student.name || '', no: student.no || '' },
    progress: `${portrait.finished}/${portrait.count}`,
    progress_pct: portrait.progress,
    total_seconds: portrait.seconds,
    since: portrait.since,
    days: portrait.days,
    modules: portrait.modules.map((m) => ({
      name: m.title,
      done: `${m.finished}/${m.count}`,
      seconds: m.seconds,
      status: m.status,
    })),
    path: portrait.path.slice(0, 40).map((p) => ({
      at: p.first,
      module: p.moduleTitle,
      step: p.title,
      seconds: p.seconds,
      visits: p.visits,
      status: p.status,
    })),
    weak: portrait.weak.map((w) => ({
      module: w.moduleTitle,
      step: w.title,
      seconds: w.seconds,
      visits: w.visits,
      checkpoints: w.total ? `${w.done}/${w.total}` : null,
    })),
    skim: portrait.skim.map((s) => ({
      module: s.moduleTitle,
      step: s.title,
      visits: s.visits,
    })),
    habits: portrait.habits,
    orid_filled: portrait.habits.oridFilled,
    orid_preview: {
      o: String(orid.o || '').slice(0, 200),
      r: String(orid.r || '').slice(0, 200),
      i: String(orid.i || '').slice(0, 200),
      d: String(orid.d || '').slice(0, 200),
    },
  };
}

export const PORTRAIT_AI_SYSTEM = [
  '你是超声检测课程的学习过程分析助手。',
  '只根据用户给出的 JSON 事实写分析，禁止编造未出现的操作、时长或成绩。',
  '用简体中文，分三段，每段用标题开头：',
  '【优势】',
  '【薄弱】',
  '【建议补学顺序】',
  '每段 2～5 句，具体到模块或步骤名称；语气简洁、可操作。',
].join('\n');
