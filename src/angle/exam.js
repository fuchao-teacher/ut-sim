// Weld detection exam: randomly drawn plate seed, instrument preset; score by contracts/angle_tasks.json exam.rubric
// (coverage, detection, location, quantification, evaluation, conduct) on top of evaluate.js checkMarks.
import { checkMarks, matchDefect } from './evaluate.js';

export const drawSeed = (space, rnd = Math.random) => 1 + Math.floor(rnd() * space);

const round1 = (v) => Math.round(v * 10) / 10;

// Specimen preparation: prep = { rough, couplant } against key = { rough: [...], couplant: [...] }.
export const prepOk = (prep, key) => !!prep && key.rough.includes(prep.rough) && key.couplant.includes(prep.couplant);

// run: { marks, plate, cov (longitudinal coverage ratio), transTravel (mm along y in the transverse scan), sides (Set of
// longitudinal scan sides), g0 (scan gain dB), prepOk }.
export function scoreExam(W, built, ev, run, rubric) {
  const ck = checkMarks(W, built, ev, run.marks, run.plate);
  const rec = ev.indications.filter((r) => r.zone !== 'below');
  const n = rec.length;
  const meta = Object.fromEntries(built.map((b) => [b.meta.id, b.meta]));
  const first = new Map();
  ck.rows.forEach((r, i) => { if (r.defect && !r.dup && !first.has(r.defect)) first.set(r.defect, i); });
  const hits = rec.filter((r) => first.has(r.id)).map((r) => ({ r, row: ck.rows[first.get(r.id)], mk: run.marks[first.get(r.id)] }));
  const falseN = ck.rows.filter((r) => !r.defect).length;
  const share = (k) => (n ? hits.filter(k).length / n : 1);

  const Rc = rubric.coverage;
  // Transverse coverage needs both travel and at least one recorded transverse defect (not travel alone).
  const transHit = (run.marks || []).some((m) => {
    if (m.mode !== 'trans' || m.zone === 'below') return false;
    const id = matchDefect(built, m);
    return !!(id && meta[id]?.transverse);
  });
  const needTrans = (ev.indications || []).some((r) => r.scan === 'transverse' && r.zone !== 'below');
  const transOk = run.transTravel >= Rc.trans_travel_mm && (!needTrans || transHit);
  const covPts = Rc.long_points * Math.min(1, run.cov / Rc.long_full_ratio) + (transOk ? Rc.trans_points : 0);

  const Rd = rubric.detection;
  const det = Math.max(0, Rd.points * (n ? hits.length / n : 1) - Rd.false_penalty * falseN);

  const Rl = rubric.location;
  const located = ({ r, mk }) => {
    const m = meta[r.id];
    return mk.y >= m.y0 - Rl.y_mm && mk.y <= m.y1 + Rl.y_mm && mk.depth >= m.z[0] - Rl.depth_mm && mk.depth <= m.z[1] + Rl.depth_mm;
  };
  const loc = Rl.points * share(located);

  const Rq = rubric.quantification;
  const quant = Rq.points * (Rq.zone * share((h) => h.row.ok.zone) + Rq.length * share((h) => h.row.ok.len));

  const Re = rubric.evaluation;
  const evalPts = Re.nature * share((h) => h.row.ok.nature) + Re.grade * share((h) => h.row.ok.grade)
    + (ck.plate.level ? Re.plate_level : 0) + (ck.plate.verdict ? Re.verdict : 0);

  const Rk = rubric.conduct;
  const gainOk = run.marks.length > 0 && run.marks.every((mk) => mk.gain != null && mk.gain >= run.g0 + (mk.mode === 'trans' ? W.transPlus : 0) - Rk.gain_slack_dB);
  const sidesOk = run.sides.has(1) && run.sides.has(-1);
  const prep = !!run.prepOk;
  const conduct = (gainOk ? Rk.gain : 0) + (sidesOk ? Rk.both_sides : 0) + (prep ? Rk.prep ?? 0 : 0);

  const parts = [
    { id: 'coverage', points: round1(covPts), max: Rc.points, detail: { cov: run.cov, transTravel: run.transTravel } },
    { id: 'detection', points: round1(det), max: Rd.points, detail: { found: hits.length, n, false: falseN } },
    { id: 'location', points: round1(loc), max: Rl.points, detail: { ok: hits.filter(located).length, n } },
    { id: 'quantification', points: round1(quant), max: Rq.points, detail: { zone: hits.filter((h) => h.row.ok.zone).length, len: hits.filter((h) => h.row.ok.len).length, n } },
    { id: 'evaluation', points: round1(evalPts), max: Re.points, detail: { nature: hits.filter((h) => h.row.ok.nature).length, grade: hits.filter((h) => h.row.ok.grade).length, n, level: ck.plate.level, verdict: ck.plate.verdict } },
    { id: 'conduct', points: round1(conduct), max: Rk.points, detail: { gain: gainOk, sides: sidesOk, prep } },
  ];
  return { check: ck, parts, total: round1(parts.reduce((a, p) => a + p.points, 0)), max: parts.reduce((a, p) => a + p.max, 0) };
}
