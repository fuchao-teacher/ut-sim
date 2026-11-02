// Checking recorded indications of the weld plate against the reference evaluation (weld.js evaluateCase):
// mark -> defect matching by position, zone / length / nature / grade per mark, missed defects, plate level and verdict.

export const NATURES = ['pore', 'cluster', 'slag', 'lop', 'lof', 'crack'];
export const GRADES = ['I', 'II', 'III', 'reject'];
export const MATCH_MM = 10;
export const ZONE_SLACK_DB = 2;

export const natureOf = (type) => (type === 'toe_crack' || type === 'transverse_crack' ? 'crack' : type);
export const lengthTol = (ref) => Math.max(3, 0.2 * ref);

const NOT_ALLOWED = new Set(['lop', 'lof', 'crack']);
export const natureNotAllowed = (n) => NOT_ALLOWED.has(n);

function boxes(built) {
  return built.map(({ el, meta }) => {
    const xs = el.map((e) => e.x);
    return { id: meta.id, meta, x0: Math.min(...xs), x1: Math.max(...xs), y0: meta.y0, y1: meta.y1 };
  });
}

// Nearest defect whose plan box lies within MATCH_MM of the mark (x across, y along the weld).
export function matchDefect(built, mark, bx = boxes(built)) {
  let best = null;
  let bd = Infinity;
  for (const b of bx) {
    const dy = Math.max(0, b.y0 - mark.y, mark.y - b.y1);
    const dx = Math.max(0, b.x0 - mark.x, mark.x - b.x1);
    if (dy > MATCH_MM || dx > MATCH_MM) continue;
    const d = Math.hypot(dx, dy);
    if (d < bd) {
      bd = d;
      best = b.id;
    }
  }
  return best;
}

const num = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

export function checkMarks(W, built, ev, marks, plate) {
  const bx = boxes(built);
  const R = Object.fromEntries(ev.indications.map((r) => [r.id, r]));
  const seen = new Set();
  const rows = marks.map((mk) => {
    const id = matchDefect(built, mk, bx);
    if (!id) return { defect: null, dup: false, ref: null, ok: { zone: false, len: false, nature: false, grade: false } };
    const dup = seen.has(id);
    seen.add(id);
    const r = R[id];
    const tr = r.scan === 'transverse';
    const zones = new Set([-ZONE_SLACK_DB, 0, ZONE_SLACK_DB].map((s) => W.zone(r.h + s, tr)));
    const zoneOk = zones.has(mk.zone);
    const len = num(mk.len);
    const lenOk = r.length === null ? true : len !== null && Math.abs(len - r.length) <= lengthTol(r.length) + 1e-9;
    const natureOk = mk.nature === natureOf(r.type);
    const own = zoneOk && lenOk ? W.grade(mk.zone, r.length === null ? null : len, NOT_ALLOWED.has(natureOf(r.type))) : null;
    const gradeOk = mk.grade === r.grade || (own !== null && mk.grade === own);
    return {
      defect: id, dup,
      ref: { type: r.type, nature: natureOf(r.type), zone: r.zone, h: r.h, length: r.length, method: r.method, grade: r.grade, scan: r.scan },
      ok: { zone: zoneOk, len: lenOk, nature: natureOk, grade: gradeOk },
    };
  });
  const missed = ev.indications.filter((r) => r.zone !== 'below' && !seen.has(r.id)).map((r) => r.id);
  return {
    rows, missed,
    plate: { level: plate.level === ev.level, verdict: plate.verdict === ev.verdict, ref: { level: ev.level, verdict: ev.verdict } },
  };
}

// Indicated length of the defect under a mark: lateral scan at the recorded index distance (longitudinal marks) or at
// the reference best position; transverse cracks take the geometric length across the weld.
export function systemLength(W, built, ev, mark) {
  const id = matchDefect(built, mark);
  if (!id) return null;
  const { el, meta } = built.find((b) => b.meta.id === id);
  if (meta.transverse) return { length: meta.len_true, method: 'geometric' };
  const r = ev.indications.find((q) => q.id === id);
  const own = mark.mode === 'long' && mark.pose;
  const ys = W.lateralYs(meta);
  const ml = W.measureLength(ys, W.lateral(el, own ? mark.pose.side : r.side, own ? mark.pose.d : r.d, ys).map((q) => q.h));
  return { length: ml.length, method: ml.method };
}

// Indications as found by scanning: one per reference indication at or above EL, at its best probe position.
export function carryMarks(built, ev) {
  const byId = new Map(built.map((b) => [b.meta.id, b]));
  return ev.indications.filter((r) => r.zone !== 'below').map((r) => {
    const { el, meta } = byId.get(r.id);
    const tr = r.scan === 'transverse';
    const xs = el.map((e) => e.x);
    const yc = (meta.y0 + meta.y1) / 2;
    return {
      y: tr ? meta.y0 : yc,
      x: tr ? (Math.min(...xs) + Math.max(...xs)) / 2 : r.x_est,
      depth: tr ? (meta.z[0] + meta.z[1]) / 2 : r.depth_est,
      S: r.S, leg: r.leg, h: r.h, zone: r.zone, mode: tr ? 'trans' : 'long',
      pose: tr ? null : { side: r.side, d: r.d, py: yc, sw: 0 },
    };
  });
}

// Exam tip: defects at or above EL, how many are already recorded, and which remain.
export function examTargetSummary(built, ev, marks = []) {
  const targets = ev.indications.filter((r) => r.zone !== 'below');
  const found = new Set();
  for (const mk of marks) {
    const id = matchDefect(built, mk);
    if (id) found.add(id);
  }
  const remaining = targets.filter((r) => !found.has(r.id));
  return { total: targets.length, recorded: targets.length - remaining.length, remaining, complete: !remaining.length };
}

// Approximate zone for one defect: a disc that contains it without being centred on it (salt = case seed).
export function hintZoneOf(built, id, radius, salt = '') {
  const b = built.find((x) => x.meta.id === id);
  if (!b) return null;
  const xs = b.el.map((e) => e.x);
  const xc = (Math.min(...xs) + Math.max(...xs)) / 2;
  const yc = (b.meta.y0 + b.meta.y1) / 2;
  let h = 7;
  for (const ch of `${salt}:${id}`) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const a = ((h % 360) * Math.PI) / 180;
  const k = radius * (0.25 + (((h >>> 9) % 100) / 100) * 0.35);
  return { x: xc + k * Math.cos(a), y: yc + k * Math.sin(a), r: radius, id };
}

// Plate result implied by the student's own grades (the worst grade; any not-allowed defect -> III, reject).
export function ownPlate(W, grades) {
  const g = grades.filter(Boolean);
  return g.length ? W.plateVerdict(g) : null;
}
