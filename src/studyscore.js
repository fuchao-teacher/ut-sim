// Self-study progress from the learning record (learnlog.js) and the step catalog (knowledge/study_report.json).
// A step is done once it was entered, every checkpoint is ticked and, for a self-test step, a test was taken.
// A step with `from` also reads the record kept under that module id by earlier versions.

export function stepScore(rec, test = false) {
  const visits = rec?.visits ?? 0;
  const total = rec?.total ?? 0;
  const done = Math.min(rec?.done?.length ?? 0, total);
  const tests = rec?.tests ?? [];
  // No guide checkpoints → a visit completes the step; otherwise all checkpoints (and a test if required).
  const guideOk = total === 0 || done >= total;
  const finished = visits > 0 && guideOk && (!test || tests.length > 0);
  const best = tests.reduce((a, t) => Math.max(a, Number(t.score) || 0), 0);
  const last = tests.length ? tests[tests.length - 1] : null;
  return {
    visits,
    seconds: rec?.seconds ?? 0,
    demos: rec?.demos ?? 0,
    done,
    total,
    tests: tests.length,
    first: rec?.first || null,
    last: rec?.last || null,
    bestScore: tests.length ? best : null,
    lastScore: last ? Number(last.score) || 0 : null,
    lastMax: last ? Number(last.max) || 0 : null,
    status: finished ? 'done' : visits > 0 ? 'doing' : 'todo',
  };
}

export function moduleScore(mod, rec, record = null) {
  const steps = mod.steps.map((s) => ({
    id: s.id,
    title: s.title || s.id,
    test: !!s.test,
    ...stepScore(rec?.steps?.[s.id] ?? (s.from ? record?.modules?.[s.from]?.steps?.[s.id] : undefined), !!s.test),
  }));
  const finished = steps.filter((s) => s.status === 'done').length;
  const status = finished === steps.length ? 'done' : steps.some((s) => s.status !== 'todo') ? 'doing' : 'todo';
  return { id: mod.id, steps, status, finished, count: steps.length, seconds: steps.reduce((a, s) => a + s.seconds, 0) };
}

export function trackScore(track, record) {
  const modules = track.modules.map((m) => moduleScore(m, record?.modules?.[m.id], record));
  const status = modules.every((m) => m.status === 'done') ? 'done' : modules.some((m) => m.status !== 'todo') ? 'doing' : 'todo';
  return {
    id: track.id,
    title: track.title,
    modules,
    status,
    seconds: modules.reduce((a, m) => a + m.seconds, 0),
    finished: modules.reduce((a, m) => a + m.finished, 0),
    count: modules.reduce((a, m) => a + m.count, 0),
  };
}
