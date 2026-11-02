import { gateReading, inMainBang } from './waveform.js';

// Student records are derived from the current visible A-scan, never a larger hidden range.
function recordableEchoes(frame, { state, procedure, points, baseGain, minDb, minPercent = 5 }) {
  const criteria = procedure.criteria(state, points, baseGain);
  const candidates = [];
  for (const echo of frame.echoes) {
    if (echo.type !== 'defect' || echo.k !== 1 || echo.x_mm < 0 || echo.x_mm > state.range_mm
      || inMainBang(echo, frame) || echo.pct < minPercent || echo.pct < (state.reject_percent || 0)) continue;
    const peakS = state.velocity_m_s * (echo.t + (echo.len || 0) / 2) / 2 * 1e-3;
    // The envelope peak must actually fit on the current screen, as in gateReading and echo labels.
    if (peakS < 0 || peakS > state.range_mm
      || (frame.shown != null && frame.columns && echo.t + (echo.len || 0) / 2 > frame.shown / frame.columns * frame.tWin)) continue;
    const dB = procedure.f1MinusDac(points, echo.x_mm, echo.pct, state.gain_dB);
    if (dB == null || dB < minDb) continue;
    candidates.push({ echo, record: { id: echo.id, S: echo.x_mm, H: Math.min(100, echo.pct),
      peakS, rawH: echo.pct, saturated: echo.pct > 100, dB,
      flags: criteria.defect === echo.id ? [...criteria.flags] : [] } });
  }
  return candidates.sort((a, b) => b.record.rawH - a.record.rawH);
}

// All recordable first echoes, strongest first. S is the labelled leading-edge reading;
// peakS locates the envelope peak used by the gate. rawH explains a clipped H and is not a screen reading.
export function visibleIndications(options) {
  const frame = options.frame || options.wave.synth(options.state, { columns: 480, noise: false });
  return recordableEchoes(frame, options).map((candidate) => candidate.record);
}

// Omitting gate preserves the legacy strongest-echo selection. An explicit gate must be on and must
// select a recordable first defect echo; a bottom echo, multiple echo or noise trigger never falls back.
export function visibleIndication(options) {
  const frame = options.frame || options.wave.synth(options.state, { columns: 480, noise: false });
  const candidates = recordableEchoes(frame, options);
  if (options.gate === undefined) return candidates[0]?.record || null;
  const reading = gateReading(frame, options.gate);
  if (!reading?.echo || reading.echo.type !== 'defect' || reading.echo.k !== 1
    || reading.h < (options.minPercent ?? 5) || reading.h < (options.state.reject_percent || 0)) return null;
  // Echo identity also distinguishes several cluster members or segregation scatterers sharing an id.
  const chosen = candidates.find((candidate) => candidate.echo === reading.echo);
  if (!chosen) return null;
  const baseHeight = chosen.echo.pct * 10 ** ((options.baseGain - options.state.gain_dB) / 20);
  const baseDb = options.procedure.f1MinusDac(options.points, chosen.echo.x_mm, baseHeight, options.baseGain);
  // The selected echo owns its F1 criterion even if a stronger echo owns the overall alarm. Bottom-wall
  // loss still belongs only to the indication identified by the original procedure criteria.
  const flags = chosen.record.flags.filter((flag) => flag === 'B1_below_50');
  if (baseDb != null && baseDb > 0) flags.unshift('F1_over_dac');
  return { ...chosen.record, S: reading.s, H: Math.min(100, reading.h), flags };
}

// Direction feedback is independent from geometric path coverage.
export function scanQuality({ trail = [], speed = {}, edge, limits, pattern = 'lines', maxSegment, toleranceDeg = 30 }) {
  let middle = 0;
  let aligned = 0;
  for (let i = 1; i < trail.length; i++) {
    const a = trail[i - 1], b = trail[i];
    const dx = b[0] - a[0], dy = b[1] - a[1], d = Math.hypot(dx, dy);
    if (!d || d > maxSegment) continue;
    const x = (a[0] + b[0]) / 2, y = (a[1] + b[1]) / 2;
    if (x < limits.x[0] + edge || x > limits.x[1] - edge || y < limits.y[0] + edge || y > limits.y[1] - edge) continue;
    middle += d;
    const axis = pattern === 'grid' ? Math.max(Math.abs(dx), Math.abs(dy)) : Math.abs(dy);
    if (axis / d >= Math.cos(toleranceDeg * Math.PI / 180)) aligned += d;
  }
  return { overspeed: speed.len_mm > 0 ? speed.over_mm / speed.len_mm : null,
    direction: middle > 0 ? aligned / middle : null };
}
