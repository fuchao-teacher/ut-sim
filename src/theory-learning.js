import { gateReading, inMainBang } from './waveform.js';

const escapeHTML = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char]));

const stepIndex = (experiment, step) => Math.min(experiment.steps.length - 1, Math.max(0, Math.floor(Number(step) || 0)));

// The live page and the comparison model must use the same cumulative presets.
// Each short experiment starts with a clean inspection model, not a practice specimen.
export function theoryStateAtStep(experiment, state = {}, step = 0, baseline = {}) {
  const result = { ...state, ...baseline, ...experiment.baseline,
    scene: experiment.scenario, specimen_id: null, defects: null,
    thickness_mm: experiment.thickness_mm, zero_us: 0, reject_percent: 0 };
  for (const item of experiment.steps.slice(0, stepIndex(experiment, step) + 1)) Object.assign(result, item.set || {});
  return result;
}

export function sampleTheoryReading({ experiment, wave, state = {}, step = 0, baseline = {}, gateReader = gateReading }) {
  const index = stepIndex(experiment, step);
  const prepared = theoryStateAtStep(experiment, state, index, baseline);
  const pulse = experiment.steps[index].pulse !== false;
  const frame = wave.synth(prepared, { columns: 480, noise: false, pulse });
  const gate = { on: prepared.gate_on, start_mm: prepared.gate_start_mm,
    width_mm: prepared.gate_width_mm, threshold_pct: prepared.gate_threshold_pct };
  const reading = gateReader(frame, gate);
  // A range experiment explicitly distinguishes a known reference echo from a visible screen echo.
  const referenceState = { ...prepared, range_mm: Math.max(prepared.range_mm, experiment.measure.reference_range_mm || 200) };
  const target = experiment.measure.mode === 'gate' ? reading?.echo?.id : experiment.measure.target_echo;
  const reference = pulse && target ? wave.echoes(referenceState).find((echo) => echo.id === target) : null;
  const actual = pulse && target ? frame.echoes.find((echo) => echo.id === target) : null;
  const visible = !!actual && actual.x_mm >= 0 && actual.x_mm <= prepared.range_mm
    && actual.pct >= prepared.gate_threshold_pct && !inMainBang(actual, frame);
  return {
    state: prepared, frame, gate: reading, reference, visible,
    metrics: {
      visible, gain_dB: prepared.gain_dB, velocity_m_s: prepared.velocity_m_s,
      coupling: prepared.coupling, range_mm: prepared.range_mm, thickness_mm: prepared.thickness_mm,
      roundtrip_us: reference?.t ?? null,
      roundtrip_path_mm: reference ? wave.cTrue * reference.t / 1000 : null,
      sound_path_mm: reference?.x_mm ?? null,
      height_percent: pulse && reading ? Math.min(100, Math.max(0, reading.h)) : null,
      gate_sound_path_mm: reading?.s ?? null,
      gate_echo: reading?.echo?.id ?? null,
    },
  };
}

export function compareTheoryReadings({ experiment, wave, state = {}, baseline = {}, gateReader = gateReading }) {
  const options = { experiment, wave, state, baseline, gateReader };
  const stages = experiment.steps.map((_, step) => sampleTheoryReading({ ...options, step }));
  const before = stages[0];
  const after = stages[stages.length - 1];
  const linear = !experiment.linear_height_check || [before, after].every((sample) =>
    sample.visible && sample.reference && sample.reference.pct < 100 && sample.metrics.height_percent < 100);
  return { before, after, stages, linear };
}

export function theoryLearningModel({ text, experimentId, step = 0, wave, state = {}, prediction = null, teacher = false }) {
  const experiment = text.experiments.find((item) => item.id === experimentId);
  if (!experiment) return null;
  const selected = experiment.options.find((option) => option.id === prediction) || null;
  const index = stepIndex(experiment, step);
  const mayCompare = teacher || !!selected;
  const ready = mayCompare && (teacher || index === experiment.steps.length - 1);
  const comparison = compareTheoryReadings({ experiment, wave, state, baseline: text.baseline });
  return { experiment, selected, step: index, mayCompare, ready, comparison,
    correct: ready && selected && comparison.linear ? selected.id === experiment.correct_answer : null,
    answer: experiment.options.find((option) => option.id === experiment.correct_answer) || null };
}

function readingText(value, row, text) {
  if (value == null || (typeof value === 'number' && !Number.isFinite(value))) return text.labels.none;
  if (typeof value === 'boolean') return value ? text.labels.visible : text.labels.hidden;
  if (row.key === 'coupling') return text.coupling_values[value] || value;
  if (typeof value !== 'number') return String(value);
  const digits = row.digits ?? 1;
  const result = value > 0 && value < 10 ** -digits ? `<${(10 ** -digits).toFixed(digits)}` : value.toFixed(digits);
  return row.unit ? `${result} ${row.unit}` : result;
}

// Pure HTML output: caller delegates data-theory-option clicks and stores the selected option id.
// Clear prediction on experiment/route changes; keep it when only the same experiment's step changes.
export function renderTheoryLearning(options) {
  const model = theoryLearningModel(options);
  if (!model) return '';
  const { text, teacher = false } = options;
  const { experiment, selected, ready, mayCompare, comparison, answer } = model;
  const L = text.labels;
  const e = escapeHTML;
  const choices = experiment.options.map((option) => `<button type="button" data-theory-option="${e(option.id)}" data-theory-experiment="${e(experiment.id)}" aria-pressed="${selected?.id === option.id}" class="theory-option${selected?.id === option.id ? ' selected' : ''}">${e(option.label)}</button>`).join('');
  const prediction = teacher ? '' : `<fieldset class="theory-prediction"><legend>${e(L.predict)}</legend><p>${e(experiment.question)}</p><div class="theory-options">${choices}</div>${!selected ? `<p class="theory-hint">${e(L.choose_prompt)}</p>` : ''}</fieldset>`;
  let comparisonHTML = '';
  if (mayCompare) {
    const rows = experiment.rows.map((row) => `<tr><th scope="row">${e(row.label)}</th><td>${e(readingText(comparison.before.metrics[row.key], row, text))}</td><td>${e(ready ? readingText(comparison.after.metrics[row.key], row, text) : L.pending)}</td></tr>`).join('');
    comparisonHTML = `<div class="theory-comparison"><h4>${e(L.compare)}</h4><p class="theory-observe"><b>${e(L.observation)}</b> ${e(experiment.observation)}</p><div class="theory-table-wrap"><table><thead><tr><th></th><th>${e(experiment.steps[0].label)}</th><th>${e(experiment.steps[experiment.steps.length - 1].label)}</th></tr></thead><tbody>${rows}</tbody></table></div>${ready ? '' : `<p class="theory-hint">${e(L.wait_condition)}</p>`}</div>`;
  }
  let explanation = '';
  if (ready) {
    const resultText = model.correct == null ? L.inapplicable : model.correct ? L.correct : L.incorrect;
    const result = teacher ? '' : `<p class="theory-result ${model.correct ? 'correct' : 'recheck'}">${e(resultText)}</p>`;
    explanation = `<div class="theory-explanation" aria-live="polite"><h4>${e(L.explain)}</h4>${result}<p><b>${e(L.correct_answer)}</b> ${e(answer?.label)}</p><p>${e(experiment.explanation)}</p><p class="theory-condition"><b>${e(L.conditions)}</b> ${e(experiment.conditions)}</p>${!comparison.linear ? `<p class="theory-warning">${e(L.saturation_note)}</p>` : ''}</div>`;
  }
  return `<section class="theory-learning" data-theory-experiment="${e(experiment.id)}"><h3>${e(text.title)} · ${e(experiment.title)}</h3>${prediction}${comparisonHTML}${explanation}</section>`;
}
