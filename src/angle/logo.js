import LOGO from '../../../knowledge/angle_logo.json';

const NS = 'http://www.w3.org/2000/svg';
export const LOGO_INK = '#0e4f63';
export const LOGO_PAPER = '#f1f5f9';

// Badge centred at (0, 0) in logo units (mm); radius = LOGO.disc_r.
export function logoGroup(parent, { x = 0, y = 0, radius = LOGO.disc_r } = {}) {
  const k = radius / LOGO.disc_r;
  const g = document.createElementNS(NS, 'g');
  g.setAttribute('transform', `translate(${x} ${y}) scale(${k})`);
  const [r0, r1] = LOGO.ring_r;
  const add = (tag, attrs) => {
    const e = document.createElementNS(NS, tag);
    for (const [a, v] of Object.entries(attrs)) e.setAttribute(a, v);
    g.appendChild(e);
  };
  add('circle', { r: LOGO.disc_r, fill: LOGO_PAPER });
  add('circle', { r: (r0 + r1) / 2, fill: 'none', stroke: LOGO_INK, 'stroke-width': r1 - r0 });
  add('path', { d: LOGO.path, fill: LOGO_INK });
  parent.appendChild(g);
  return g;
}

export function logoSvg(label) {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', LOGO.viewBox.join(' '));
  svg.setAttribute('role', 'img');
  if (label) svg.setAttribute('aria-label', label);
  logoGroup(svg);
  return svg;
}
