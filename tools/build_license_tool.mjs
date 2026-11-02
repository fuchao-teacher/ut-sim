// usage: node tools/build_license_tool.mjs <out.html>
// Builds the teacher-only licence code generator from src/license-core.js and knowledge/license.json.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const out = process.argv[2];
if (!out) { console.error('usage: node tools/build_license_tool.mjs <out.html>'); process.exit(1); }
const core = readFileSync(resolve(here, '../src/license-core.js'), 'utf8').replace(/^export /gm, '');
const T = JSON.parse(readFileSync(resolve(here, '../../knowledge/license.json'), 'utf8'));
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const html = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(T.product)} · ${esc(T.tool_title)}</title>
<style>
body{margin:0;background:#f1f5f9;color:#0f172a;font:14px/1.6 "Microsoft YaHei","PingFang SC",system-ui,sans-serif}
main{max-width:860px;margin:24px auto;padding:22px 26px;background:#fff;border-radius:14px;box-shadow:0 6px 24px rgba(15,23,42,.1);border-top:5px solid #b45309}
h1{margin:0 0 4px;font-size:22px}h1 small{font-size:14px;color:#b45309;margin-left:8px}
.hint{color:#64748b;margin:6px 0}
textarea{width:100%;box-sizing:border-box;min-height:180px;padding:10px;border:1px solid #cbd5e1;border-radius:10px;font:14px/1.6 Consolas,"Microsoft YaHei",monospace}
.bar{display:flex;gap:10px;margin:12px 0}
button{padding:8px 18px;border:1px solid #cbd5e1;border-radius:9px;background:#fff;font:inherit;font-weight:700;cursor:pointer}
button.primary{background:#b45309;border-color:#b45309;color:#fff}
table{width:100%;border-collapse:collapse;margin-top:8px}
th,td{border:1px solid #e2e8f0;padding:6px 10px;text-align:center}
th{background:#f8fafc}
td.code{font:700 15px Consolas,monospace;letter-spacing:.08em;color:#92400e}
.foot{margin-top:14px;color:#94a3b8;font-size:12px;text-align:center}
@media print{body{background:#fff}main{box-shadow:none;margin:0;max-width:none}.bar,textarea,.hint{display:none}}
</style></head><body><main>
<h1>${esc(T.product)}<small>${esc(T.tool_title)}</small></h1>
<p class="hint">${esc(T.tool_hint)}</p>
<textarea id="roster"></textarea>
<div class="bar"><button class="primary" id="gen">${esc(T.tool_generate)}</button><button id="csv">${esc(T.tool_export)}</button><button id="print">${esc(T.tool_print)}</button></div>
<table><thead><tr><th>${esc(T.tool_index)}</th><th>${esc(T.name)}</th><th>${esc(T.number)}</th><th>${esc(T.code)}</th></tr></thead><tbody id="rows"></tbody></table>
<p class="foot">${esc(T.copyright)} · ${esc(T.valid_until.replace('{date}', T.expires))}</p>
</main>
<script>
${core}
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
let list = [];
function parse(text) {
  return text.split(/\\r?\\n/).map((l) => l.trim()).filter(Boolean).map((l) => {
    const parts = l.split(/[\\t,，;；]+|\\s+/).filter(Boolean);
    if (parts.length < 2) return null;
    const noIdx = parts.findIndex((p) => /\\d{4,}/.test(p));
    if (noIdx < 0) return null;
    const no = parts[noIdx];
    const name = parts.filter((_, i) => i !== noIdx).join('');
    return { name: normName(name), no: normNo(no), code: licenseCode(name, no) };
  }).filter(Boolean);
}
$('gen').onclick = () => {
  list = parse($('roster').value);
  $('rows').innerHTML = list.map((r, i) => '<tr><td>' + (i + 1) + '</td><td>' + esc(r.name) + '</td><td>' + esc(r.no) + '</td><td class="code">' + r.code + '</td></tr>').join('');
};
$('csv').onclick = () => {
  if (!list.length) $('gen').onclick();
  const head = ${JSON.stringify([T.tool_index, T.name, T.number, T.code].join(','))};
  const body = list.map((r, i) => [i + 1, r.name, r.no, r.code].join(',')).join('\\r\\n');
  const blob = new Blob(['\\ufeff' + head + '\\r\\n' + body], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = ${JSON.stringify(T.code)} + '_' + new Date().toISOString().slice(0, 10) + '.csv';
  a.click();
};
$('print').onclick = () => { if (!list.length) $('gen').onclick(); window.print(); };
</script></body></html>
`;
writeFileSync(out, html, 'utf8');
console.log('written', out);
