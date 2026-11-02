// Task rubric (contracts/tasks.json rubric, docs/M10_SCOPE.md §6): card and card sensitivity scored here; scan, detect, quantify,
// evaluate, conduct marked by the rubric.json rules through createScoring, with the task points. Points come from the contracts only.
import { createScoring } from './scoring.js';

const r1 = (x) => Math.round(x * 10) / 10;
const r2 = (x) => Math.round(x * 100) / 100;

// rubric.json items named by the task rubric, points scaled to the task points; sensitivity stays as a 0-point link
// so the rubric chain (scan requires sensitivity) holds; the preset steps leave the chain.
export function deriveRubric(rubric, tasks) {
  const T = tasks.rubric.items;
  const ids = T.filter((t) => t.from).map((t) => /^rubric:items\.(\w+)$/.exec(t.from)[1]);
  const scaled = (src, points) => {
    const k = src.points ? points / src.points : 0;
    return { ...src, points, parts: src.parts.map((p) => (typeof p.points === 'number' ? { ...p, points: p.points * k } : { ...p })) };
  };
  const items = [];
  const sens = rubric.items.find((it) => it.id === 'sensitivity');
  items.push({ ...scaled(sens, 0), requires: [] });
  for (const id of ids) {
    const src = rubric.items.find((it) => it.id === id);
    const t = T.find((x) => x.from === `rubric:items.${id}`);
    items.push({ ...scaled(src, t.points), requires: (src.requires || []).filter((q) => q === 'sensitivity' || ids.includes(q)) });
  }
  const have = items.map((it) => it.id);
  return { ...rubric, chain: rubric.chain.filter((id) => have.includes(id)), items, max_total: tasks.rubric.max_total };
}

export function createTaskScoring({ rubric, tasks, files, taskcard }) {
  const derived = deriveRubric(rubric, tasks);
  const engine = createScoring({ rubric: derived, files });
  const T = tasks.rubric.items;
  const def = (id) => T.find((t) => t.id === id);
  const tol = files.waveform_rules.practice.sensitivity_record.tolerance_dB;

  // prac / events / coverage / case as for createScoring (found[].confirmed must be true for student detection);
  // practice:evaluate.payload.self_consistent is reported separately from overall correctness.
  // card: confirmed card; task: { id, level }; thickness_mm: plate thickness.
  // Preset calibration counts as calibrated from the session start (conduct: velocity / zero changes void it).
  function score({ prac, events, coverage, case: kase, card, task, thickness_mm }) {
    const ev = [{ name: 'practice:calib_done', payload: {} }, ...(events || [])];
    const p = { ...prac, eval: { ...(prac.eval || {}), level: task.level } };
    const base = engine.score({ prac: p, events: ev, coverage, case: kase });
    const byId = Object.fromEntries(base.items.map((it) => [it.id, it]));

    const cs = taskcard.score(card, thickness_mm, task.level);
    const cardItem = {
      id: 'card', points: r1(cs.points), max: cs.max, valid: !!card,
      status: !card ? 'missing' : cs.points >= cs.max - 1e-9 ? 'ok' : 'partial',
      parts: cs.parts.map((x) => ({ id: x.group, points: r2(x.points), max: x.max, status: x.ok ? 'ok' : 'partial', evidence: [] })),
    };

    const sd = def('sensitivity');
    const s = prac.sens;
    const want = card ? card.scan_plus_dB + card.compensation_dB : null;
    const got = s ? s.scan - s.base : null;
    const has = (events || []).some((e) => e.name === 'practice:sensitivity') && !!prac.done?.sensitivity && !!s;
    const okS = has && want != null && Math.abs(got - want) <= tol + 1e-9;
    const sensItem = {
      id: 'sensitivity', points: okS ? sd.points : 0, max: sd.points, valid: has,
      status: !has ? 'missing' : okS ? 'ok' : 'partial',
      parts: [{ id: 'scan', points: okS ? sd.points : 0, max: sd.points, status: okS ? 'ok' : has ? 'partial' : 'missing',
        evidence: [{ ref: 'card:scan_plus_dB + card:compensation_dB', value: got, reference: want, tolerance: tol }] }],
    };

    const items = T.map((t) => (t.id === 'card' ? cardItem : t.id === 'sensitivity' ? sensItem : byId[t.id]));
    return {
      tasks_version: tasks.tasks_version,
      rubric_version: rubric.rubric_version,
      task_id: task.id,
      level: task.level,
      case_id: base.case_id,
      template_id: base.template_id,
      total: r1(items.reduce((a, it) => a + it.points, 0)),
      max: tasks.rubric.max_total,
      items,
      self_consistent: base.self_consistent,
    };
  }

  return { score, rubric: () => JSON.parse(JSON.stringify(derived)) };
}
