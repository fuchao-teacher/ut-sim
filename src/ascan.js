// Qualitative A-scan: RF bursts with Hann envelope; main bang plus reflector echoes.
// Only cycle counts and depths come from knowledge/scenes.json teaching_settings; no bandwidth figures.

const TAU = Math.PI * 2;

function burst(u, f0, cycles) {
  const D = cycles / f0;
  if (u <= 0 || u >= D) return 0;
  const e = Math.sin((Math.PI * u) / D) ** 2;
  return e * Math.sin(TAU * f0 * u);
}

export function drawAscan(cnv, opt) {
  const { traces, f0, c, depths, window: win, marks, text } = opt;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const W = cnv.clientWidth;
  const laneH = opt.laneH || 88;
  const axisH = 26;
  const H = traces.length * laneH + axisH;
  cnv.style.height = `${H}px`;
  cnv.width = Math.round(W * dpr);
  cnv.height = Math.round(H * dpr);
  const g = cnv.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, W, H);

  const padL = 12;
  const padR = 12;
  const t0 = 0.2;
  const X = (t) => padL + (t / win) * (W - padL - padR);
  const echoT = depths.map((d) => t0 + (2 * d) / c);
  const font = (px, w = 500) => `${w} ${px}px "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif`;

  traces.forEach((tr, li) => {
    const top = li * laneH;
    const mid = top + laneH * 0.54;
    const amp = laneH * 0.3;
    g.fillStyle = li % 2 ? '#f1f4f8' : '#f7f9fc';
    g.fillRect(0, top, W, laneH);

    g.strokeStyle = '#cfd6e0';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(padL, mid);
    g.lineTo(W - padR, mid);
    g.stroke();

    g.strokeStyle = tr.color;
    g.lineWidth = 1.5;
    g.beginPath();
    const n = Math.round((W - padL - padR) * 3);
    for (let i = 0; i <= n; i++) {
      const t = (i / n) * win;
      let y = burst(t - t0, f0, tr.cycles);
      echoT.forEach((te, k) => { y += (k ? 0.36 : 0.5) * burst(t - te, f0, tr.cycles); });
      const px = X(t);
      const py = mid - Math.max(-1.2, Math.min(1.2, y)) * amp;
      if (i) g.lineTo(px, py); else g.moveTo(px, py);
    }
    g.stroke();

    g.fillStyle = tr.color;
    g.fillRect(padL, top + 8, 3, 14);
    g.font = font(12.5, 600);
    g.textBaseline = 'middle';
    g.fillText(tr.label, padL + 9, top + 15);

    g.font = font(11);
    g.fillStyle = '#64748b';
    if (!marks) g.fillText(text.main_bang, X(t0), top + laneH - 8);
    g.textAlign = 'center';
    echoT.forEach((te, k) => {
      const x = X(te + 0.4);
      g.strokeStyle = '#94a3b8';
      g.setLineDash([2, 3]);
      g.beginPath();
      g.moveTo(X(te), top + 26);
      g.lineTo(X(te), mid + amp);
      g.stroke();
      g.setLineDash([]);
      g.fillText(`${depths[k]} mm`, x, top + 30);
    });
    g.textAlign = 'left';

    if (marks) {
      const tau = tr.cycles / f0;
      const dz = (c * tau) / 2;
      const yb = top + laneH - 7;
      g.strokeStyle = tr.color;
      g.lineWidth = 1.2;
      g.beginPath();
      g.moveTo(X(t0), yb - 4); g.lineTo(X(t0), yb); g.lineTo(X(t0 + tau), yb); g.lineTo(X(t0 + tau), yb - 4);
      g.stroke();
      g.font = font(11.5, 600);
      g.fillStyle = tr.color;
      g.textAlign = 'right';
      g.fillText(`τ ≈ ${tau.toFixed(1)} μs · Δz ≈ ${dz.toFixed(1)} mm`, W - padR, top + 15);
      g.textAlign = 'left';
    }
  });

  const ay = traces.length * laneH;
  g.strokeStyle = '#94a3b8';
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(padL, ay + 4);
  g.lineTo(W - padR, ay + 4);
  g.stroke();
  g.font = font(10.5);
  g.fillStyle = '#64748b';
  g.textAlign = 'center';
  for (let t = 0; t <= win; t += 1) {
    g.beginPath();
    g.moveTo(X(t), ay + 4);
    g.lineTo(X(t), ay + 8);
    g.stroke();
    if (t < win) g.fillText(String(t), X(t), ay + 17);
  }
  g.textAlign = 'right';
  g.fillText('t / μs', W - padR, ay + 17);
  g.textAlign = 'left';
}

// Two equal interface reflections, the second delayed by half a period (2d = λ_m/2), and their sum.
export function drawQuarterWave(cnv, opt) {
  const { cycles, phase, colors, text } = opt;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const W = cnv.clientWidth;
  const laneH = opt.laneH || 58;
  const H = 3 * laneH + 22;
  if (cnv.width !== Math.round(W * dpr) || cnv.height !== Math.round(H * dpr)) {
    cnv.style.height = `${H}px`;
    cnv.width = Math.round(W * dpr);
    cnv.height = Math.round(H * dpr);
  }
  const g = cnv.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, W, H);
  const font = (px, w = 500) => `${w} ${px}px "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif`;
  const padL = 112;
  const padR = 14;
  const span = W - padL - padR;
  const wl = span / cycles;
  const lanes = [
    { label: text.r1, color: colors.r1, s: 1 },
    { label: text.r2, color: colors.r2, s: -1 },
    { label: text.sum, color: colors.sum, s: 0 },
  ];
  lanes.forEach((ln, li) => {
    const top = li * laneH;
    const mid = top + laneH / 2;
    const amp = laneH * 0.32;
    g.fillStyle = li === 2 ? '#eef4ff' : li % 2 ? '#f1f4f8' : '#f7f9fc';
    g.fillRect(0, top, W, laneH);
    g.strokeStyle = '#cfd6e0';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(padL, mid);
    g.lineTo(W - padR, mid);
    g.stroke();
    g.fillStyle = ln.color;
    g.fillRect(12, mid - 7, 3, 14);
    g.font = font(12.5, 600);
    g.textBaseline = 'middle';
    g.fillText(ln.label, 21, mid);
    g.strokeStyle = ln.color;
    g.lineWidth = li === 2 ? 2.4 : 1.7;
    g.beginPath();
    for (let x = 0; x <= span; x += 1) {
      const y = ln.s * Math.sin(TAU * (x / wl - phase));
      const px = padL + x;
      const py = mid - y * amp;
      if (x) g.lineTo(px, py); else g.moveTo(px, py);
    }
    g.stroke();
  });
  g.strokeStyle = '#94a3b8';
  g.setLineDash([2, 3]);
  for (let k = 0; k < cycles; k++) {
    const x = padL + (((k + 0.25 + phase) % cycles + cycles) % cycles) * wl;
    g.beginPath();
    g.moveTo(x, 6);
    g.lineTo(x, 2 * laneH - 6);
    g.stroke();
  }
  g.setLineDash([]);
  g.font = font(12, 600);
  g.fillStyle = '#334155';
  g.textAlign = 'right';
  g.fillText(text.delta, W - padR, 3 * laneH + 12);
  g.textAlign = 'left';
}
