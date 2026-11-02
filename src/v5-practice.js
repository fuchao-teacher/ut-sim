import { gateReading, inMainBang } from './waveform.js';

// One physical indication is one plate entry. Cluster members are not separate entries.
// Only counts leave this helper; case positions, types and individual verdicts stay private.
export function detectionCaseSummary(cs, recordedIds = []) {
  const defects = cs?.plate?.defects || [];
  const physicalIds = new Set(defects.map((defect) => defect.id));
  const determinedIds = new Set((cs?.reference?.items || [])
    .filter((item) => item.determined && physicalIds.has(item.id)).map((item) => item.id));
  const recorded = new Set([...recordedIds].filter((entry) => typeof entry !== 'object' || entry?.confirmed === true)
    .map((entry) => typeof entry === 'object' ? entry?.id : entry).filter((id) => physicalIds.has(id)));
  const total = defects.length;
  const determined = determinedIds.size;
  const recordedDetermined = [...recorded].filter((id) => determinedIds.has(id)).length;
  // Task completion tracks criterion defects only: low-level (undetermined) echoes are not recorded.
  return { total, determined, recorded: recorded.size, recordedDetermined,
    remaining: Math.max(0, determined - recordedDetermined), complete: recordedDetermined >= determined };
}

// DAC is compared against the same actual gain as the selected first echo. Increasing gain
// therefore does not change F1 - DAC. Screen clipping does not turn an over-DAC echo into silence.
// Gate choice belongs to the displayed A-scan: a bottom echo, multiple echo or off-screen
// reflector cannot borrow another echo's positive global criterion to trigger an alarm.
export function detectionDacAlarm({ enabled = true, state, wave, procedure, points, gate, frame = null }) {
  const off = (reason) => ({ enabled: !!enabled, on: false, reason,
    defectId: null, delta_dB: null, S: null, H: null, saturated: false });
  if (!enabled) return off('disabled');
  if (!gate?.on) return off('gate_off');
  if (!state || !wave || !procedure || (points || []).length < 2) return off('not_ready');
  const actual = frame || wave.synth(state, { columns: 480, noise: false });
  const reading = gateReading(actual, gate);
  const echo = reading?.echo;
  if (!echo || echo.type !== 'defect' || echo.k !== 1 || inMainBang(echo, actual)) return off('no_first_defect');
  const visibleState = actual.state || state;
  const floor = Math.max(gate.threshold_pct || 0, visibleState.reject_percent || 0);
  if (!(echo.pct > 0) || !(reading.h >= floor) || echo.x_mm < 0 || echo.x_mm > visibleState.range_mm) return off('below_gate');
  const dB = procedure.f1MinusDac(points, echo.x_mm, echo.pct, visibleState.gain_dB);
  if (dB == null || !Number.isFinite(dB)) return off('outside_dac');
  if (!(dB > 0)) return off('below_dac');
  return { enabled: true, on: true, reason: 'over_dac', defectId: echo.id,
    delta_dB: dB, S: reading.s, H: Math.min(100, reading.h), saturated: echo.pct > 100 };
}
