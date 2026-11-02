import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { energySplit, criticalAngles, snellAngles } from '../src/angle/interface.js';

const RULES = JSON.parse(readFileSync(new URL('../../contracts/angle_waveform_rules.json', import.meta.url), 'utf8'));
const { wedge, steel } = RULES.interface;

// tools/angle_interface_ref.py output
const REF = [
  [0, 0.757, 0.0, 0.243, 0.0],
  [20, 0.583, 0.171, 0.22, 0.026],
  [30, 0.346, 0.412, 0.0, 0.243],
  [45, 0.056, 0.752, 0.0, 0.191],
  [49.11, 0.022, 0.799, 0.0, 0.179],
  [57, 0.006, 0.906, 0.0, 0.089],
  [70, 0.432, 0.568, 0.0, 0.0],
];

test('interface: critical angles', () => {
  const [c1, c2] = criticalAngles(wedge, steel);
  assert.ok(Math.abs(c1 - 27.56) < 0.01, `c1 ${c1}`);
  assert.ok(Math.abs(c2 - 57.69) < 0.01, `c2 ${c2}`);
});

test('interface: energy conservation 0..89.9 deg', () => {
  for (let k = 0; k < 900; k++) {
    const e = energySplit(k * 0.1, wedge, steel);
    const s = e.RL + e.RS + e.TL + e.TS;
    assert.ok(Math.abs(s - 1) < 1e-9, `alpha ${k * 0.1}: ${s}`);
    for (const v of Object.values(e)) assert.ok(v >= -1e-12 && v <= 1 + 1e-12);
  }
});

test('interface: matches python reference', () => {
  for (const [al, rl, rs, tl, ts] of REF) {
    const e = energySplit(al, wedge, steel);
    for (const [got, want] of [[e.RL, rl], [e.RS, rs], [e.TL, tl], [e.TS, ts]]) {
      assert.ok(Math.abs(got - want) < 0.0006, `alpha ${al}: ${got} vs ${want}`);
    }
  }
});

test('interface: nominal K2 refraction', () => {
  const a = snellAngles(49.11, wedge, steel);
  assert.equal(a.L, null);
  assert.ok(Math.abs(a.S - 63.43) < 0.05, `beta ${a.S}`);
});
