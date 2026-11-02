// Process report (docs/M8_SCOPE.md §6): printable document built from a report model; all text arrives in the model.
// Model: { title, meta: [[k, v]], sections: [{ title, cls?, parts: [{ kv } | { table } | { figure } | { images }] }] }
//   kv: [[k, v]]; table: { caption?, head: [..], rows: [[cell]], foot?: [cell] }, cell = string | { text, cls };
//   figure: { img, caption?, legend?: [{ color, label, line? }] }; images: [{ img, caption }].

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const cell = (c, tag) => (c && typeof c === 'object' ? `<${tag} class="${esc(c.cls || '')}">${esc(c.text)}</${tag}>` : `<${tag}>${esc(c)}</${tag}>`);

function table(t) {
  return `<div class="rp-table">${t.caption ? `<div class="rp-cap">${esc(t.caption)}</div>` : ''}<table>`
    + `<thead><tr>${t.head.map((h) => cell(h, 'th')).join('')}</tr></thead>`
    + `<tbody>${t.rows.map((r) => `<tr>${r.map((c) => cell(c, 'td')).join('')}</tr>`).join('')}</tbody>`
    + (t.foot ? `<tfoot><tr>${t.foot.map((c) => cell(c, 'td')).join('')}</tr></tfoot>` : '')
    + '</table></div>';
}

function part(p) {
  if (p.kv) return `<div class="rp-kv">${p.kv.map(([k, v]) => `<span>${esc(k)}</span><b>${esc(v)}</b>`).join('')}</div>`;
  if (p.table) return table(p.table);
  if (p.tables) return `<div class="rp-row">${p.tables.map(table).join('')}</div>`;
  if (p.figure) {
    const f = p.figure;
    const lg = (f.legend || []).map((l) => `<span><i class="${l.line ? 'line' : ''}" style="background:${esc(l.color)}"></i>${esc(l.label)}</span>`).join('');
    return `<figure class="rp-fig"><img src="${f.img}" alt="">${lg ? `<figcaption class="rp-legend">${lg}</figcaption>` : ''}${f.caption ? `<figcaption>${esc(f.caption)}</figcaption>` : ''}</figure>`;
  }
  if (p.images) return `<div class="rp-shots">${p.images.map((s) => `<figure><img src="${s.img}" alt=""><figcaption>${esc(s.caption)}</figcaption></figure>`).join('')}</div>`;
  return '';
}

export function reportHTML(m) {
  return `<article class="rp-doc"><h1>${esc(m.title)}</h1>`
    + `<div class="rp-meta">${m.meta.map(([k, v]) => `<div><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('')}</div>`
    + m.sections.map((s) => `<section class="rp-sec ${esc(s.cls || '')}"><h2>${esc(s.title)}</h2>${s.parts.map(part).join('')}</section>`).join('')
    + '</article>';
}

// Plate top view: reachable cells by coverage state, edge-zone outline, trail, found indications. cov = createCoverage().
// Trail segments longer than maxSeg are jumps, left undrawn as in the coverage computation.
// plan: { edge: [ex, ey] | null, lines: [[x0, y0, x1, y1]], edge_line, plan_line } drawn under the trail.
export function coverageImage(cov, { trail = [], found = [], colors, px = 2, maxSeg = Infinity, plan = null }) {
  const { L, W, nx, ny, cell: c, edge } = cov;
  const pad = 6;
  const cv = document.createElement('canvas');
  cv.width = Math.round(L * px) + pad * 2;
  cv.height = Math.round(W * px) + pad * 2;
  const g = cv.getContext('2d');
  const X = (x) => pad + (x + L / 2) * px;
  const Y = (y) => pad + (W / 2 - y) * px;
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, cv.width, cv.height);
  g.fillStyle = colors.plate;
  g.fillRect(pad, pad, L * px, W * px);
  const fill = [null, colors.near, colors.swept];
  g.globalAlpha = colors.alpha ?? 1;
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const col = fill[cov.state(j * nx + i)];
      if (!col) continue;
      g.fillStyle = col;
      g.fillRect(X(-L / 2 + i * c), Y(-W / 2 + (j + 1) * c), c * px, c * px);
    }
  }
  g.globalAlpha = 1;
  g.strokeStyle = colors.edge_line;
  g.lineWidth = 1.5;
  g.setLineDash([6, 4]);
  g.strokeRect(X(-L / 2 + edge), Y(W / 2 - edge), (L - 2 * edge) * px, (W - 2 * edge) * px);
  g.setLineDash([]);
  if (plan) {
    g.strokeStyle = plan.plan_line;
    g.lineWidth = 1;
    g.beginPath();
    for (const [x0, y0, x1, y1] of plan.lines || []) { g.moveTo(X(x0), Y(y0)); g.lineTo(X(x1), Y(y1)); }
    g.stroke();
    if (plan.edge) {
      const [ex, ey] = plan.edge;
      g.strokeStyle = plan.edge_line;
      g.lineWidth = 1.5;
      g.strokeRect(X(-ex), Y(ey), 2 * ex * px, 2 * ey * px);
    }
  }
  if (trail.length > 1) {
    g.strokeStyle = colors.trail;
    g.lineWidth = 0.8;
    g.globalAlpha = 0.55;
    g.beginPath();
    trail.forEach(([x, y], k) => {
      const q = trail[k - 1];
      if (k && Math.hypot(x - q[0], y - q[1]) <= maxSeg) g.lineTo(X(x), Y(y));
      else g.moveTo(X(x), Y(y));
    });
    g.stroke();
    g.globalAlpha = 1;
  }
  g.font = `bold ${Math.round(6 * px)}px sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  found.forEach(({ x, y, label }) => {
    g.fillStyle = colors.found;
    g.beginPath();
    g.arc(X(x), Y(y), 5 * px, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#ffffff';
    g.fillText(label, X(x), Y(y) + 0.5);
  });
  g.strokeStyle = '#475569';
  g.lineWidth = 1;
  g.strokeRect(pad, pad, L * px, W * px);
  return cv.toDataURL('image/png');
}

// Full-page overlay; print hides everything else (style.css @media print, body.rp-open).
export function openReport(model, { printLabel, closeLabel, onPrint, onClose }) {
  closeReport();
  const view = document.createElement('div');
  view.id = 'reportView';
  view.className = 'rp-view';
  view.innerHTML = `<div class="rp-bar"><button class="primary" data-act="print">${esc(printLabel)}</button><button data-act="close">${esc(closeLabel)}</button></div>${reportHTML(model)}`;
  view.querySelector('[data-act=print]').onclick = () => { onPrint?.(); window.print(); };
  view.querySelector('[data-act=close]').onclick = () => { closeReport(); onClose?.(); };
  document.body.appendChild(view);
  document.body.classList.add('rp-open');
  return view;
}

export function closeReport() {
  document.getElementById('reportView')?.remove();
  document.body.classList.remove('rp-open');
}
