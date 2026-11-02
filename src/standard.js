// Standard view: clause blocks and tables from contracts/standard_nbt47013_3.json (values) + knowledge/standard.json (text).
// Text templates: {path} item value, {@item.path} value of another item, {key|pct} ratio x 100, {key|lv} level name, {L1}.. / {levels_d} level names.
export function createStandardView({ pack, doc, levels, sep, esc }) {
  const IT = pack.items;
  const G = IT.grading;
  const lv = (k) => levels[k] ?? k;
  const get = (o, path) => path.split('.').reduce((v, k) => (v == null ? v : v[k]), o);
  const dLevels = G.levels.filter((k) => G.table[k].max_D_dB != null);
  const extra = { levels_d: dLevels.map(lv).join(sep) };
  G.levels.forEach((k, i) => { extra[`L${i + 1}`] = lv(k); });
  const fmt = (v) => (Array.isArray(v) ? v.join(sep) : String(v));
  const fill = (s, item) => s.replace(/\{(@?)([A-Za-z_0-9.]+)(?:\|(pct|lv))?\}/g, (m, at, path, f) => {
    let v;
    if (at) { const [id, ...rest] = path.split('.'); v = get(IT[id], rest.join('.')); } else v = path in extra ? extra[path] : get(item, path);
    if (v == null) return m;
    if (f === 'pct') v = Math.round(v * 100);
    if (f === 'lv') v = lv(v);
    return fmt(v);
  });
  const clauseNo = (id) => IT[id].clause.replace(/table (\d+)/g, `${doc.table_word} $1`).replace(' / ', ' · ');
  const range = ([a, b], first) => (b == null ? `> ${a}` : a === 0 ? `< ${b}` : `${first ? '' : '> '}${a}–${b}`);
  const inRange = ([a, b], t) => t > a && (b == null || t <= b);
  const table = (head, rows) => `<table class="sd-table"><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table>`;
  const tr = (cells, on) => `<tr${on ? ' class="on"' : ''}>${cells.map((c) => `<td>${esc(String(c))}</td>`).join('')}</tr>`;

  // ctx: { t_mm: plate thickness, level: selected level } marks the matching table row.
  function tableOf(id, ctx) {
    const H = doc.tables[id];
    const it = IT[id];
    if (id === 'probe_selection') return table(H, it.rows.map((r, i) => tr([range(r.t_mm, i === 0), doc.probe_types[r.probe], r.MHz.join('–')], ctx.t_mm != null && (i === 0 ? ctx.t_mm >= r.t_mm[0] && ctx.t_mm <= r.t_mm[1] : inRange(r.t_mm, ctx.t_mm)))));
    if (id === 'reference_block') return table(H, it.rows.map((r) => tr([r.no, range(r.t_mm), r.S_mm.join(sep), r.T_mm, r.b_mm], ctx.t_mm != null && inRange(r.t_mm, ctx.t_mm))));
    if (id === 'scan_pattern') return table(H, it.edge_zone.map((z) => tr([z.t_mm[1] == null ? `≥ ${z.t_mm[0]}` : z.t_mm[0] === 0 ? `< ${z.t_mm[1]}` : `${z.t_mm[0]}–${z.t_mm[1]}`, z.width_mm], ctx.t_mm != null && ctx.t_mm >= z.t_mm[0] && (z.t_mm[1] == null || ctx.t_mm < z.t_mm[1]))));
    if (id === 'grading') {
      const phi = `Φ${IT.reference_block.phi_mm}`;
      const rows = G.levels.map((k) => {
        const L = G.table[k];
        const max = `S ≤ ${L.max_S_mm2}${L.max_D_dB != null ? ` · D ≤ ${phi}+${L.max_D_dB} dB` : ''}`;
        const cnt = `${L.count_S_mm2[0]} < S ≤ ${L.count_S_mm2[1]}${L.count_D_dB ? ` · ${L.count_D_dB[0] ? `${phi}+${L.count_D_dB[0]}` : phi} < D ≤ ${phi}+${L.count_D_dB[1]}` : ''}`;
        return tr([lv(k), max, cnt, L.max_count_per_m2], ctx.level === k);
      });
      rows.push(`<tr class="fail"><td>${esc(lv(G.fail_level))}</td><td colspan="3">${esc(fill(doc.fail_row, IT.grading))}</td></tr>`);
      return table(H, rows);
    }
    return '';
  }

  function clauseHtml(id, ctx = {}) {
    const d = doc.items[id];
    const it = IT[id];
    if (!d || !it) return '';
    return `<section class="sd-clause" data-clause="${id}"><h4><span class="sd-no">${esc(clauseNo(id))}</span>${esc(d.title)}</h4>`
      + d.text.map((s) => `<p>${esc(fill(s, it))}</p>`).join('') + (doc.tables[id] ? tableOf(id, ctx) : '') + '</section>';
  }

  const stepIds = (step) => doc.steps[step] || [];
  const allIds = () => doc.groups.flatMap((g) => g.items);
  const unresolved = () => allIds().flatMap((id) => doc.items[id].text.map((s) => fill(s, IT[id])).filter((s) => /\{[^}]+\}/.test(s)).map(() => id))
    .concat(/\{/.test(fill(doc.fail_row, G)) ? ['fail_row'] : []);

  return { clauseHtml, clauseNo, stepIds, allIds, unresolved, groups: doc.groups };
}
