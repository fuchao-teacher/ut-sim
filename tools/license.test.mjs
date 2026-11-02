import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { sha256, licenseCode, normCode, teacherGateOk } from '../src/license-core.js';

test('licence-gate teacher entry accepts only its own password and ships no plaintext', () => {
  assert.equal(teacherGateOk('s08040601'), true);
  assert.equal(teacherGateOk(' s08040601 '), true);
  for (const bad of ['4404', '', 'S08040601', 's0804060']) assert.equal(teacherGateOk(bad), false);
  for (const f of ['../src/license-core.js', '../src/license.js', '../../knowledge/license.json']) {
    assert.equal(readFileSync(new URL(f, import.meta.url), 'utf8').includes('s08040601'), false);
  }
});

test('licence sha256 matches node crypto across block boundaries', () => {
  for (const s of ['', 'abc', 'x'.repeat(55), 'y'.repeat(56), 'z'.repeat(64), '\u8d85\u58f0'.repeat(50)]) {
    assert.equal(Buffer.from(sha256(s)).toString('hex'), createHash('sha256').update(s).digest('hex'));
  }
});

test('licence code is stable, formatted, whitespace-insensitive and student-specific', () => {
  const a = licenseCode('\u5f20\u4e09', '2022010101');
  assert.match(a, /^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
  assert.equal(licenseCode(' \u5f20 \u4e09 ', ' 2022010101 '), a);
  assert.equal(normCode(a.toLowerCase().replace('-', ' ')), normCode(a));
  assert.notEqual(licenseCode('\u5f20\u4e09', '2022010102'), a);
  assert.notEqual(licenseCode('\u674e\u56db', '2022010101'), a);
  const codes = new Set(Array.from({ length: 200 }, (_, i) => licenseCode('s', String(2022000000 + i))));
  assert.equal(codes.size, 200);
});
