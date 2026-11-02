// V4 learning references and detection-only assessment. Existing standard contracts remain authoritative.
import { createScoring } from './scoring.js';

const clone = (value) => structuredClone(value);
const DETECTION_IDS = ['scan', 'detect', 'quantify', 'evaluate', 'conduct'];

export function makeReferenceCard(taskcard, task, t = taskcard.plateThickness(task)) {
  if (!task || !Number.isFinite(t)) throw new Error('A task and a valid plate thickness are required');
  const ref = taskcard.reference(t, task.level);
  const kit = taskcard.kit();
  const card = {
    probe_type: kit.probe_type,
    frequency_MHz: kit.frequency_MHz,
    element_mm: kit.element_mm,
    reference_block: ref.reference_block,
    edge_zone_mm: ref.edge_zone,
    middle_pattern: 'lines',
    spacing_mm: ref.scan_plan.lines,
    scan_plus_dB: ref.scan_sensitivity,
    compensation_dB: ref.compensation,
    level: task.level,
  };
  const parsed = taskcard.parse(card);
  if (!parsed.ok || !taskcard.check(parsed.card, t, task.level).ok) {
    throw new Error(`The actual classroom probe cannot support the reference card for ${t} mm`);
  }
  return parsed.card;
}

// This is system preparation, never a student operation. The caller applies it once when a new
// detection case starts, after creating the case plate. Continuing an existing case keeps its data.
// dacPoints must come from the reference card's correct block, not from the student's design card.
export function presetDetectionPractice({
  prac, instrument = prac?.inst, rules, standard, taskcard, task,
  thickness_mm = taskcard.plateThickness(task), dacPoints, blockSpecimen = null,
  caseSpecimenId = prac?.specimen,
}) {
  const referenceCard = makeReferenceCard(taskcard, task, thickness_mm);
  const points = (dacPoints || []).map((point) => {
    const hole = blockSpecimen?.holes?.find((h) => h.id === point.id || h.S_mm === point.S);
    return {
      ...clone(point), id: point.id || hole?.id || `H${point.S}`,
      S: point.S, G: point.G,
      x: point.x ?? hole?.x_mm ?? null, y: point.y ?? hole?.y_mm ?? null,
      automatic: true, preset: true,
    };
  }).sort((a, b) => a.S - b.S);
  const row = standard.items.reference_block.rows.find((r) => String(r.no) === referenceCard.reference_block);
  if (!row || points.length !== row.S_mm.length
    || !points.every((p, i) => p.S === row.S_mm[i] && Number.isFinite(p.G))) {
    throw new Error('Detection preparation requires every DAC depth of the correct reference block');
  }
  const base = points.at(-1).G;
  const comp = referenceCard.compensation_dB;
  const scan = base + referenceCard.scan_plus_dB + comp;
  const cal = rules.practice.calibration.calibrated_state;
  const rangeNeeded = 2 * thickness_mm + 10;
  const ranges = [...rules.controls.range_mm.presets].sort((a, b) => a - b);
  const range = ranges.find((r) => r >= rangeNeeded) ?? rangeNeeded;
  const inst = {
    ...clone(instrument || {}), velocity_m_s: cal.velocity_m_s, zero_us: cal.zero_us,
    gain_dB: scan, reject_percent: 0, range_mm: range,
    thickness_mm, specimen_id: caseSpecimenId, coupling: 'good',
    gate_on: true, gate_start_mm: 1, gate_width_mm: Math.max(1, thickness_mm - 1.5),
    gate_threshold_pct: rules.controls.gate_threshold_pct.default,
    dac_show: true, peak_memory: false,
  };
  const prepared = clone(prac || {});
  // A design submitted elsewhere must never affect the detection bench.
  delete prepared.card;
  Object.assign(prepared, {
    specimen: caseSpecimenId, plateId: caseSpecimenId, step: 'scan', inst,
    asmDone: true, done: { ...prepared.done, calibrate: true, dac: true, sensitivity: true },
    calib: { points: { ...rules.practice.calibration.targets_mm }, automatic: true, preset: true },
    dac: { points, automatic: true, preset: true },
    sens: { base, scan, comp, automatic: true, preset: true },
    presetCard: referenceCard,
    presetPlan: { thickness_mm, reference_block: referenceCard.reference_block, base, scan, comp, source: 'system' },
  });
  return {
    prac: prepared, instrument: inst, referenceCard,
    presetEvent: {
      name: 'practice:system_preset',
      payload: { preset: true, source: 'system', specimen_id: caseSpecimenId,
        thickness_mm, reference_block: referenceCard.reference_block, base_dB: base, scan_dB: scan,
        excluded_from_student_scoring: ['assembly', 'calibrate', 'dac', 'sensitivity'] },
    },
  };
}

// Allocate an integer 100-point rubric by the largest remainder method. The original retained
// proportions (15:15:10:10:5) become 28:27:18:18:9; ties follow the original item order.
export function deriveDetectionRubric(rubric) {
  const source = DETECTION_IDS.map((id) => rubric.items.find((item) => item.id === id));
  if (source.some((item) => !item)) throw new Error('The detection rubric is incomplete');
  const weight = source.reduce((sum, item) => sum + item.points, 0);
  const allocation = source.map((item, index) => ({ index, exact: item.points * 100 / weight,
    points: Math.floor(item.points * 100 / weight) }));
  let left = 100 - allocation.reduce((sum, item) => sum + item.points, 0);
  for (const item of [...allocation].sort((a, b) => (b.exact - b.points) - (a.exact - a.points) || a.index - b.index)) {
    if (left-- > 0) item.points += 1;
  }
  const items = source.map((item, index) => {
    const max = allocation[index].points;
    const ratio = max / item.points;
    return {
      ...clone(item), points: max,
      requires: (item.requires || []).filter((id) => DETECTION_IDS.includes(id)),
      parts: item.parts.map((part) => ({ ...clone(part),
        ...(typeof part.points === 'number' ? { points: part.points * ratio } : {}) })),
      ...(item.id === 'conduct'
        ? { conduct_events: item.conduct_events.filter((event) => !['calibration_voided', 'assembly_error'].includes(event.id)) }
        : {}),
    };
  });
  return { ...clone(rubric), rubric_version: `${rubric.rubric_version}-V4-detection`,
    scope: { ...clone(rubric.scope), mode: 'detection' },
    chain: DETECTION_IDS.filter((id) => id !== 'conduct'), items, max_total: 100 };
}

// Points taken off for each detection step in which the operation guide was shown.
export const GUIDE_TIP_POINTS = 2;
// Points taken off for each use of the zone (region) hint on the plate.
export const REGION_HINT_POINTS = 2;

export function createDetectionScoring({ rubric, files }) {
  const derived = deriveDetectionRubric(rubric);
  const engine = createScoring({ rubric: derived, files });
  return {
    rubric: () => clone(derived),
    score(input) {
      // Preparation and instruments fixed by the system are not scored as student actions.
      // Rejected/saturated student records remain conduct evidence under the original rules.
      const events = (input.events || []).filter((event) => event.payload?.preset !== true
        && !['assembly:done', 'assembly:error', 'practice:calib_point', 'practice:calib_done',
          'practice:dac_point', 'practice:dac_done', 'practice:sensitivity',
          'instrument:velocity', 'instrument:zero'].includes(event.name));
      const out = { ...engine.score({ ...input, events }), assessment: 'detection', preparation: 'system_preset' };
      const tipCut = new Set((input.prac?.tips || []).map((tip) => tip.step)).size * GUIDE_TIP_POINTS;
      const hintCut = (input.prac?.hints || []).length * REGION_HINT_POINTS;
      const cut = tipCut + hintCut;
      if (!cut) return out;
      const extras = [];
      if (tipCut) extras.push({ id: 'tips', points: -tipCut, max: 0, status: 'deduct', valid: true, parts: [] });
      if (hintCut) extras.push({ id: 'hints', points: -hintCut, max: 0, status: 'deduct', valid: true, parts: [] });
      return { ...out, total: Math.max(0, Math.round((out.total - cut) * 10) / 10),
        tip_deduction: tipCut, hint_deduction: hintCut, items: [...out.items, ...extras] };
    },
  };
}

// Draw only named, already-designed library entries; no arbitrary template/seed generation here.
// The caller owns when a fresh draw is allowed. Passing currentCase resumes the exact same plate.
export function drawLibraryCase({ caselib, thickness = null, currentCase = null, rng = Math.random, excludeIds = [] }) {
  if (currentCase && !currentCase.failed) return { case: currentCase, reused: true, selection: null };
  const excluded = new Set(excludeIds.map(String));
  const entries = [
    ...caselib.library().map((entry) => ({ id: entry.id, source: 'plate50' })),
    ...(thickness?.library() || []).map((entry) => ({ id: entry.id, source: 'thickness' })),
  ].filter((entry) => !excluded.has(String(entry.id)));
  if (!entries.length) throw new Error('The existing case library is empty');
  const random = rng();
  if (!Number.isFinite(random) || random < 0 || random >= 1) throw new Error('Random value must be in [0, 1)');
  const selection = entries[Math.floor(random * entries.length)];
  const cs = selection.source === 'plate50' ? caselib.libraryCase(selection.id) : thickness.libraryCase(selection.id);
  if (!cs || cs.failed) throw new Error(`The selected existing case cannot load: ${selection.id}`);
  return { case: cs, reused: false, selection };
}
