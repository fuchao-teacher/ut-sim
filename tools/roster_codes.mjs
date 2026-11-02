import { readFileSync, writeFileSync } from 'node:fs';
import { licenseCode, normName, normNo } from '../src/license-core.js';

const [src, out] = process.argv.slice(2);
const rows = JSON.parse(readFileSync(src, 'utf8'))
  .filter((r) => /^\d+$/.test(String(r.no).trim()))
  .map((r) => ({ ...r, name: normName(r.name), no: normNo(r.no), code: licenseCode(r.name, r.no) }));
const codes = new Set(rows.map((r) => r.code));
if (codes.size !== rows.length) throw new Error('duplicate code');
writeFileSync(out, JSON.stringify(rows, null, 1), 'utf8');
console.log(rows.length);
