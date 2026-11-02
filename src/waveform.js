// Teaching A-scan engine (contracts/waveform_rules.json). Pure functions of the inspection state;
// tools/qa_m5_rules.py holds the reference implementation the numbers are checked against.

export function createWaveform({ rules, manifest, dampingCycles, scenarios, specimens = null }) {
  const PH = manifest.reference_physics;
  const F = PH.f0_MHz;
  const C_TRUE = PH.steel_cL_m_s;
  const D_EL = manifest.parameters.active_element_diameter.value;
  const A = rules.amplitude;
  const G_REF = A.gain.G_ref_dB;
  const FSH = A.gain.fsh_at_ref_percent;
  const ALPHA = A.attenuation.alpha_dB_per_mm;
  const KAPPA = A.coupling.pass_factor;
  const S_DAMP = rules.pulse.damping_sensitivity;
  const MB = rules.pulse.main_bang;
  const CLIP = rules.display.clip_percent;
  const DT = rules.display.sample_dt_ns * 1e-3;
  const MAX_K = rules.time_of_flight.back_wall_max_k;
  const LAM = (C_TRUE / (F * 1e6)) * 1e3;
  const NF = (D_EL * D_EL) / (4 * LAM);
  const H_REF = rules.practice.back_wall_thickness.H_ref_mm;
  const SC = Object.fromEntries(scenarios.map((s) => [s.id, s]));

  const tof = (pathMm, c = C_TRUE) => (pathMm / c) * 1e3;
  const depth = (tUs, cSet) => (cSet * tUs) / 2 * 1e-3;
  const windowUs = (st) => ((2 * st.range_mm) / st.velocity_m_s) * 1e3;
  const pulseUs = (damping) => dampingCycles[damping] / F;
  const gainK = (g) => 10 ** ((g - G_REF) / 20);

  function fbhRatio(d, phi, H) {
    const dEff = Math.max(d, NF);
    return ((Math.PI * phi * phi * H) / (2 * LAM * dEff * dEff)) * 10 ** ((-ALPHA * 2 * (d - H)) / 20);
  }

  // practice.back_wall_thickness: T = H_REF reproduces amplitude.back_wall; FBH amplitude does not depend on T.
  const backWall = (k, H) => (H_REF / (k * H)) * 10 ** ((-ALPHA * 2 * (k * H - H_REF)) / 20);

  // ---------------------------------------------------------------- practice reflectors (waveform_rules.practice)
  // tools/qa_m6_rules.py holds the reference implementation (bessj1, g_lat, disk, coverage, strip_coverage).
  const P = rules.practice;
  const KA = (Math.PI * D_EL) / LAM;
  const X0 = 3.8317;
  const GRID = 0.5;
  const DELAY = P.probe_delay.true_delay_us;

  function bessj1(x) {
    const ax = Math.abs(x);
    if (ax < 8) {
      const y = x * x;
      const a1 = x * (72362614232.0 + y * (-7895059235.0 + y * (242396853.1 + y * (-2972611.439 + y * (15704.48260 + y * -30.16036606)))));
      const a2 = 144725228442.0 + y * (2300535178.0 + y * (18583304.74 + y * (99447.43394 + y * (376.9991397 + y))));
      return a1 / a2;
    }
    const z = 8 / ax;
    const y = z * z;
    const xx = ax - 2.356194491;
    const a1 = 1 + y * (0.183105e-2 + y * (-0.3516396496e-4 + y * (0.2457520174e-5 + y * -0.240337019e-6)));
    const a2 = 0.04687499995 + y * (-0.2002690873e-3 + y * (0.8449199096e-5 + y * (-0.88228987e-6 + y * 0.105787412e-6)));
    const a = Math.sqrt(0.636619772 / ax) * (Math.cos(xx) * a1 - z * Math.sin(xx) * a2);
    return x > 0 ? a : -a;
  }

  function gLat(r, d) {
    const de = Math.max(d, NF);
    const x = (KA * r) / Math.sqrt(r * r + de * de);
    return x < 1e-9 ? 1 : (2 * bessj1(x)) / x;
  }

  const mainLobeR = (d) => Math.max(d, NF) * Math.tan(Math.asin(X0 / KA));

  const diskCache = new Map();
  function disk(d) {
    const key = d.toFixed(3);
    let v = diskCache.get(key);
    if (!v) {
      const r0 = mainLobeR(d);
      const n = Math.floor(r0 / GRID) + 1;
      const pts = [];
      let tot = 0;
      for (let i = -n; i <= n; i++) {
        for (let j = -n; j <= n; j++) {
          const dx = i * GRID;
          const dy = j * GRID;
          const r = Math.hypot(dx, dy);
          if (r <= r0) {
            const w = gLat(r, d) ** 2;
            pts.push([dx, dy, w]);
            tot += w;
          }
        }
      }
      v = { pts, tot };
      diskCache.set(key, v);
    }
    return v;
  }

  function coverage(px, py, cx, cy, sx, sy, d) {
    const { pts, tot } = disk(d);
    const hx = sx / 2;
    const hy = sy / 2;
    let s = 0;
    for (const [dx, dy, w] of pts) if (Math.abs(px + dx - cx) <= hx && Math.abs(py + dy - cy) <= hy) s += w;
    return s / tot;
  }

  function stripCoverage(px, py, cx, cy, length, thickness, d) {
    const { pts, tot } = disk(d);
    let s = 0;
    for (const [dx, dy, w] of pts) if (Math.abs(py + dy - cy) < GRID / 2 - 1e-9 && Math.abs(px + dx - cx) <= length / 2) s += w;
    return (s * thickness) / GRID / tot;
  }

  // Hashed uniform [0, 1) per (i, j, k, seed): deterministic scatterer layout.
  function hash01(i, j, k, seed) {
    let x = Math.imul(i, 73856093) ^ Math.imul(j, 19349663) ^ Math.imul(k, 83492791) ^ Math.imul(seed, 2654435761);
    x = Math.imul(x ^ (x >>> 13), 0x5bd1e995);
    x ^= x >>> 15;
    return (x >>> 0) / 4294967296;
  }

  // Segregation band scatterers within the main lobe of the probe (specimens_manifest SEG type).
  function segregation(d, px, py, b1, out) {
    const [x0, x1] = d.region_mm.x;
    const [y0, y1] = d.region_mm.y;
    const [z0, z1] = d.depth_range_mm;
    const c = d.cell_mm;
    const r0 = mainLobeR(z1);
    const i0 = Math.max(0, Math.floor((px - r0 - x0) / c));
    const i1 = Math.min(Math.ceil((x1 - x0) / c) - 1, Math.floor((px + r0 - x0) / c));
    const j0 = Math.max(0, Math.floor((py - r0 - y0) / c));
    const j1 = Math.min(Math.ceil((y1 - y0) / c) - 1, Math.floor((py + r0 - y0) / c));
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        const sx = x0 + (i + 0.2 + 0.6 * hash01(i, j, 1, d.seed)) * c;
        const sy = y0 + (j + 0.2 + 0.6 * hash01(i, j, 2, d.seed)) * c;
        const r = Math.hypot(px - sx, py - sy);
        if (r > r0) continue;
        const z = z0 + (z1 - z0) * hash01(i, j, 3, d.seed);
        const lv = d.level_dB[0] + (d.level_dB[1] - d.level_dB[0]) * hash01(i, j, 4, d.seed);
        out.push({ type: 'defect', id: d.id, k: 1, minor: true, t: tof(2 * z), raw: b1 * fbhRatio(z, 5, H_REF) * 10 ** (lv / 20) * gLat(r, z) ** 2, depth_mm: z });
      }
    }
    return coverage(px, py, (x0 + x1) / 2, (y0 + y1) / 2, x1 - x0, y1 - y0, (z0 + z1) / 2);
  }

  // Reflector echoes of the specimen under the probe; returns the back-wall transmission factor.
  function practiceReflectors(st, b1, tWin, out) {
    const sp = specimens.specimens[st.specimen_id] || specimens.runtime_specimens?.[st.specimen_id];
    const px = st.probe_x_mm ?? 0;
    const py = st.probe_y_mm ?? 0;
    let shadow = 0;
    let crack = 0;
    let loss = 1;
    for (const h of sp.holes || []) {
      const r = Math.hypot(px - h.x_mm, py - h.y_mm);
      out.push({ type: 'defect', id: h.id, k: 1, t: tof(2 * h.S_mm), raw: b1 * fbhRatio(h.S_mm, h.diameter_mm, H_REF) * gLat(r, h.S_mm) ** 2, depth_mm: h.S_mm });
    }
    for (const d of sp.defects || []) {
      const [cx, cy] = d.centre_mm;
      if (d.type === 'lamination') {
        const c = coverage(px, py, cx, cy, d.size_mm.x, d.size_mm.y, d.depth_mm);
        shadow = Math.max(shadow, c);
        if (c <= 0) continue;
        for (let k = 1; tof(2 * k * d.depth_mm) <= tWin; k++) {
          out.push({ type: 'defect', id: d.id, k, t: tof(2 * k * d.depth_mm), raw: b1 * c * backWall(k, d.depth_mm), depth_mm: k * d.depth_mm, coverage: c });
        }
      } else if (d.type === 'inclusion' || d.type === 'pore') {
        const r = Math.hypot(px - cx, py - cy);
        const eq = d.equivalent;
        out.push({ type: 'defect', id: d.id, k: 1, t: tof(2 * d.depth_mm), raw: b1 * fbhRatio(d.depth_mm, eq.phi_mm, H_REF) * 10 ** (eq.plus_dB / 20) * gLat(r, d.depth_mm) ** 2, depth_mm: d.depth_mm });
      } else if (d.type === 'cluster') {
        d.members.forEach((m, i) => {
          const r = Math.hypot(px - m.x_mm, py - m.y_mm);
          out.push({ type: 'defect', id: d.id, member: i, k: 1, t: tof(2 * m.depth_mm), raw: b1 * fbhRatio(m.depth_mm, d.equivalent.phi_mm, H_REF) * 10 ** (m.plus_dB / 20) * gLat(r, m.depth_mm) ** 2, depth_mm: m.depth_mm });
        });
      } else if (d.type === 'segregation') {
        loss *= 10 ** ((-d.b1_loss_dB * segregation(d, px, py, b1, out)) / 20);
      } else if (d.type === 'vertical_crack') {
        crack = Math.max(crack, stripCoverage(px, py, cx, cy, d.size_mm.length_x, d.visual_thickness_mm, d.depth_range_mm[1]));
      }
    }
    return (1 - shadow) * (1 - crack) * loss;
  }

  function echoes(st) {
    const sc = SC[st.scene];
    const H = st.thickness_mm ?? sc.thickness_mm;
    const k2 = KAPPA[st.coupling] ** 2;
    const b1 = k2 * S_DAMP[st.damping];
    const out = [{ type: 'main_bang', id: 'main', k: 0, t: 0, raw: MB.raw_amplitude }];
    const tWin = windowUs(st);
    const prac = !!(st.specimen_id && specimens);
    let pass = 1;
    if (prac) {
      pass = practiceReflectors(st, b1, tWin, out);
    } else {
      for (const d of st.defects ?? sc.defects) {
        const dd = d.near_surface || st.defect_depth_mm == null ? d.depth_mm : st.defect_depth_mm;
        out.push({ type: 'defect', id: d.id, k: 0, t: tof(2 * dd), raw: b1 * fbhRatio(dd, d.diameter_mm, H_REF), depth_mm: dd });
      }
    }
    for (let k = 1; k <= MAX_K; k++) {
      const t = tof(2 * k * H);
      if (t > tWin) break;
      out.push({ type: 'back_wall', id: `B${k}`, k, t, raw: b1 * backWall(k, H) * pass });
    }
    if (prac) {
      const zero = st.zero_us ?? 0;
      for (const e of out) e.t += (e.type === 'main_bang' ? 0 : DELAY) - zero;
    }
    const g = gainK(st.gain_dB) * FSH;
    for (const e of out) {
      e.pct = e.raw * g;
      e.x_mm = depth(e.t, st.velocity_m_s);
    }
    return out;
  }

  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Returns screen columns: rectified -> hi[] (0..CLIP); rf -> hi[] / lo[] (-CLIP..CLIP).
  // pulse false: the probe is not driven (cable open / wrong socket) -> baseline noise only.
  function synth(st, { columns = 480, noise = true, seed = 1, revealUs = Infinity, pulse = true } = {}) {
    const tWin = windowUs(st);
    const n = Math.floor(tWin / DT) + 1;
    const L = pulseUs(st.damping);
    const g = gainK(st.gain_dB) * FSH;
    const rf = new Float32Array(n);
    const list = pulse ? echoes(st) : [];
    for (const e of list) {
      const len = e.type === 'main_bang' ? L * MB.length_factor : L;
      e.len = len;
      const sg = len / 4.29;
      const tc = e.t + len / 2;
      const i0 = Math.max(0, Math.floor((tc - 4 * sg) / DT));
      const i1 = Math.min(n, Math.floor((tc + 4 * sg) / DT) + 1);
      const a = e.raw * g;
      for (let i = i0; i < i1; i++) {
        const t = i * DT - tc;
        rf[i] += a * Math.exp(-(t * t) / (2 * sg * sg)) * Math.cos(2 * Math.PI * F * t);
      }
    }
    if (noise) {
      const r = rng(seed);
      const na = A.noise.percent_fsh_at_G_ref * gainK(st.gain_dB);
      for (let i = 0; i < n; i++) rf[i] += (r() * 2 - 1) * na;
    }
    const rect = st.display !== 'rf';
    let sig = rf;
    if (rect) {
      const decay = Math.exp(-DT / (rules.display.modes.rectified.video_tau_cycles / F));
      sig = new Float32Array(n);
      let y = 0;
      for (let i = 0; i < n; i++) {
        y = Math.max(Math.abs(rf[i]), y * decay);
        sig[i] = y;
      }
    }
    const hi = new Float32Array(columns);
    const lo = new Float32Array(columns);
    const per = n / columns;
    const nReveal = Math.min(n, Math.floor(revealUs / DT) + 1);
    let lastCol = columns;
    for (let c = 0; c < columns; c++) {
      const a = Math.floor(c * per);
      const b = Math.max(a + 1, Math.floor((c + 1) * per));
      if (a >= nReveal) { lastCol = c; break; }
      let mx = -Infinity;
      let mn = Infinity;
      for (let i = a; i < Math.min(b, nReveal); i++) {
        if (sig[i] > mx) mx = sig[i];
        if (sig[i] < mn) mn = sig[i];
      }
      hi[c] = Math.min(CLIP, Math.max(-CLIP, mx));
      lo[c] = Math.min(CLIP, Math.max(-CLIP, mn));
    }
    return { hi, lo, rect, columns, shown: lastCol, tWin, echoes: list, state: { ...st } };
  }

  return { echoes, synth, tof, depth, windowUs, pulseUs, lambda: LAM, nearField: NF, cTrue: C_TRUE, f: F, gLat, mainLobeR, coverage, stripCoverage };
}

// An echo whose leading edge lies inside the main-bang ring-down cannot be read off the screen.
export function inMainBang(e, frame) {
  const mb = frame.echoes.find((x) => x.type === 'main_bang');
  return e.type !== 'main_bang' && !!mb && e.t < mb.t + (mb.len || 0);
}

// Gate A in peak mode (waveform_rules.gate). gate = { on, start_mm, width_mm, threshold_pct } in displayed depth.
// Returns null when the gate is off; h = highest screen value in the gate, s = reading depth or null,
// echo = reading echo (>= threshold), top = highest unmasked echo peaking inside the gate (auto gain).
export function gateReading(frame, gate) {
  if (!gate || !gate.on) return null;
  const st = frame.state;
  const n = frame.columns;
  const mmCol = st.range_mm / n;
  const g1 = gate.start_mm + gate.width_mm;
  const c0 = Math.max(0, Math.floor(gate.start_mm / mmCol));
  const c1 = Math.min(frame.shown, Math.ceil(g1 / mmCol));
  let h = 0;
  let hc = -1;
  for (let c = c0; c < c1; c++) {
    const v = frame.rect ? frame.hi[c] : Math.max(Math.abs(frame.hi[c]), Math.abs(frame.lo[c]));
    if (v > h) { h = v; hc = c; }
  }
  const revealT = (frame.shown / n) * frame.tWin;
  const peakMm = (e) => (st.velocity_m_s * (e.t + (e.len || 0) / 2)) / 2 * 1e-3;
  const inGate = frame.echoes
    .filter((e) => e.type !== 'main_bang' && !inMainBang(e, frame) && e.t + (e.len || 0) / 2 <= revealT)
    .filter((e) => { const p = peakMm(e); return p >= gate.start_mm && p <= g1; })
    .sort((a, b) => b.pct - a.pct);
  const top = inGate[0] || null;
  const echo = top && top.pct >= gate.threshold_pct ? top : null;
  const s = echo ? echo.x_mm : h >= gate.threshold_pct && hc >= 0 ? (hc + 0.5) * mmCol : null;
  return { h, s, echo, top };
}

// Oscilloscope-style A-scan renderer shared by the right-panel module and the 3D instrument screen.
// Optional: gate { start_mm, width_mm, threshold_pct }, gateRead (gateReading result), gateText { s, h, mm },
// menu [ { label, sub, on } x soft keys ] (3D screen), tag (top-right), message (centre); header items may
// carry a third element `true` to mark the parameter selected on the instrument.
// Practice: peak (per-column peak-memory envelope, rectified), dac ([[depth_mm, pct], ...]), dacLabel (curve tag),
// gateExtra (text after the gate readout), alarm (red box under the tag, null = off).
// Angle-beam screen: curves [{ pts: [[mm, pct], ...], color, label?, dash?, width? }], marks [{ mm, pct, label, color }].
export function drawScope(canvas, frame, opts = {}) {
  const {
    width = canvas.clientWidth || canvas.width, height = canvas.clientHeight || canvas.height,
    dpr = 1, header = [], labels = {}, sweepUs = null, font = 'system-ui, sans-serif', scale = 1,
    colors = {}, gate = null, gateRead = null, gateText = null, menu = null, tag = null, message = null,
    peak = null, dac = null, dacLabel = null, gateExtra = null, alarm = null, curves = null, marks = null,
  } = opts;
  const C = {
    bg: '#0b1016', grid: '#1d2833', axis: '#3a4a58', trace: '#e6f25c', text: '#9fb3c4', head: '#e8eef4',
    sweep: '#38bdf8', tag: '#fbbf24', gate: '#fb7185', menu: '#111a24', menuOn: '#1d4ed8', peak: '#f472b6', dac: '#34d399',
    alarm: '#dc2626', ...colors,
  };
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, width, height);
  const fs = 11 * scale;
  const headH = header.length ? 20 * scale : 4 * scale;
  const padL = 30 * scale;
  const padR = 10 * scale;
  const menuH = menu ? 30 * scale : 0;
  const padB = 20 * scale + menuH;
  const x0 = padL;
  const y0 = headH + (labels.x || labels.y ? 16 : 6) * scale;
  const w = width - padL - padR;
  const h = height - y0 - padB;

  if (header.length) {
    ctx.font = `600 ${fs}px ${font}`;
    ctx.textBaseline = 'middle';
    const cw = (width - 20 * scale) / header.length;
    header.forEach(([k, v, active], i) => {
      const x = 12 * scale + i * cw;
      const kw = ctx.measureText(k).width;
      if (active) {
        const vw = ctx.measureText(v).width;
        ctx.fillStyle = C.menuOn;
        ctx.fillRect(x + kw + 1 * scale, 2 * scale, vw + 6 * scale, headH - 2 * scale);
      }
      ctx.fillStyle = C.text;
      ctx.fillText(k, x, headH / 2 + 2 * scale);
      ctx.fillStyle = C.head;
      ctx.fillText(v, x + kw + 4 * scale, headH / 2 + 2 * scale);
    });
  }

  if (menu) {
    const my = height - menuH;
    const mw = width / menu.length;
    ctx.fillStyle = C.menu;
    ctx.fillRect(0, my, width, menuH);
    ctx.textAlign = 'center';
    menu.forEach((m, i) => {
      if (!m || !m.label) return;
      const mx = i * mw;
      ctx.fillStyle = m.on ? C.menuOn : '#1a2532';
      ctx.fillRect(mx + 2 * scale, my + 2 * scale, mw - 4 * scale, menuH - 4 * scale);
      ctx.fillStyle = C.head;
      ctx.textBaseline = 'middle';
      if (m.sub) {
        ctx.font = `600 ${fs * 0.92}px ${font}`;
        ctx.fillText(m.label, mx + mw / 2, my + menuH * 0.33);
        ctx.font = `${fs * 0.78}px ${font}`;
        ctx.fillStyle = m.on ? C.head : C.text;
        ctx.fillText(m.sub, mx + mw / 2, my + menuH * 0.72);
      } else {
        ctx.font = `600 ${fs}px ${font}`;
        ctx.fillText(m.label, mx + mw / 2, my + menuH / 2);
      }
    });
    ctx.textAlign = 'left';
  }

  ctx.strokeStyle = C.grid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i <= 10; i++) {
    const gx = x0 + (w * i) / 10;
    const gy = y0 + (h * i) / 10;
    ctx.moveTo(gx, y0);
    ctx.lineTo(gx, y0 + h);
    ctx.moveTo(x0, gy);
    ctx.lineTo(x0 + w, gy);
  }
  ctx.stroke();
  ctx.strokeStyle = C.axis;
  ctx.strokeRect(x0, y0, w, h);

  const st = frame.state;
  ctx.fillStyle = C.text;
  ctx.font = `${fs * 0.9}px ${font}`;
  ctx.textBaseline = 'top';
  ctx.textAlign = 'center';
  for (let i = 0; i <= 5; i++) {
    const v = (st.range_mm * i) / 5;
    ctx.fillText(v % 1 ? v.toFixed(1) : String(v), x0 + (w * i) / 5, y0 + h + 4 * scale);
  }
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  const yTicks = frame.rect ? [0, 50, 100] : [-100, 0, 100];
  const yOf = frame.rect ? (p) => y0 + h - (p / 100) * h : (p) => y0 + h / 2 - (p / 100) * (h / 2);
  for (const p of yTicks) ctx.fillText(String(p), x0 - 4 * scale, yOf(p));
  if (labels.x) {
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillText(labels.x, x0 + w, y0 - 2 * scale);
  }
  if (labels.y) {
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText(labels.y, 2 * scale, y0 - 2 * scale);
  }

  ctx.save();
  ctx.beginPath();
  ctx.rect(x0, y0 - 1, w, h + 2);
  ctx.clip();
  const n = frame.columns;
  const colX = (c) => x0 + ((c + 0.5) / n) * w;
  if (peak && frame.rect) {
    ctx.strokeStyle = C.peak;
    ctx.lineWidth = 1.2 * scale;
    ctx.beginPath();
    for (let c = 0; c < Math.min(peak.length, n); c++) {
      if (c === 0) ctx.moveTo(colX(c), yOf(peak[c]));
      else ctx.lineTo(colX(c), yOf(peak[c]));
    }
    ctx.stroke();
  }
  if (dac && dac.length > 1) {
    ctx.strokeStyle = C.dac;
    ctx.lineWidth = 1.8 * scale;
    ctx.setLineDash([6 * scale, 4 * scale]);
    ctx.beginPath();
    // Heights above ~98 %FSH are clamped just under the top of the grid (stroke would
    // otherwise sit on the clip edge and vanish). Same idea as digital flaw detectors.
    dac.forEach(([mm, pct], i) => {
      const x = x0 + (mm / st.range_mm) * w;
      const y = yOf(Math.min(98, Math.max(0, pct)));
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = C.dac;
    for (const [mm, pct] of dac) {
      if (Math.abs(mm / 15 - Math.round(mm / 15)) > 1e-6) continue;
      const x = x0 + (mm / st.range_mm) * w;
      const y = yOf(Math.min(98, Math.max(0, pct)));
      ctx.beginPath();
      ctx.arc(x, y, 2.4 * scale, 0, Math.PI * 2);
      ctx.fill();
    }
    const last = dac[dac.length - 1];
    if (last && dacLabel) {
      ctx.font = `700 ${fs * 0.85}px ${font}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.fillText(dacLabel, x0 + (last[0] / st.range_mm) * w + 4 * scale, yOf(Math.min(98, Math.max(0, last[1]))) - 2 * scale);
    }
  }
  for (const cv of curves || []) {
    if (!cv.pts || cv.pts.length < 2) continue;
    ctx.strokeStyle = cv.color;
    ctx.lineWidth = (cv.width ?? 1.4) * scale;
    ctx.setLineDash(cv.dash ? cv.dash.map((d) => d * scale) : []);
    ctx.beginPath();
    cv.pts.forEach(([mm, pct], i) => {
      const x = x0 + (mm / st.range_mm) * w;
      const y = yOf(Math.min(103, Math.max(0, pct)));
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.setLineDash([]);
    if (cv.dots) {
      ctx.fillStyle = cv.color;
      for (const [mm, pct] of cv.dots) {
        ctx.beginPath();
        ctx.arc(x0 + (mm / st.range_mm) * w, yOf(Math.min(98, Math.max(0, pct))), 2.6 * scale, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    if (cv.label) {
      const [mm, pct] = cv.pts[cv.pts.length - 1];
      ctx.font = `700 ${fs * 0.85}px ${font}`;
      ctx.fillStyle = cv.color;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      const lx = Math.min(x0 + w, x0 + (mm / st.range_mm) * w) - 3 * scale;
      ctx.fillText(cv.label, lx, Math.max(y0 + fs * 2.2, yOf(Math.min(98, Math.max(0, pct))) - 2 * scale));
    }
  }
  ctx.strokeStyle = C.trace;
  ctx.lineWidth = 1.4 * scale;
  ctx.shadowColor = C.trace;
  ctx.shadowBlur = 4 * scale;
  ctx.beginPath();
  if (frame.rect) {
    for (let c = 0; c < frame.shown; c++) {
      const x = colX(c);
      const y = yOf(frame.hi[c]);
      if (c === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
  } else {
    for (let c = 0; c < frame.shown; c++) {
      const x = colX(c);
      ctx.moveTo(x, yOf(frame.lo[c]));
      ctx.lineTo(x, yOf(frame.hi[c]));
    }
  }
  ctx.stroke();
  ctx.restore();

  for (const mk of marks || []) {
    if (!(mk.mm >= 0 && mk.mm <= st.range_mm)) continue;
    const x = x0 + (mk.mm / st.range_mm) * w;
    const y = Math.max(y0 + 12 * scale, yOf(Math.min(100, mk.pct)) - 3 * scale);
    ctx.fillStyle = mk.color || C.tag;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - 4.5 * scale, y - 8 * scale);
    ctx.lineTo(x + 4.5 * scale, y - 8 * scale);
    ctx.closePath();
    ctx.fill();
    if (mk.label) {
      ctx.font = `700 ${fs * 0.95}px ${font}`;
      ctx.textAlign = x > x0 + w - 40 * scale ? 'right' : 'left';
      ctx.textBaseline = 'bottom';
      ctx.fillText(mk.label, x + (ctx.textAlign === 'right' ? -7 : 7) * scale, y - 2 * scale);
    }
  }

  if (sweepUs != null && sweepUs <= frame.tWin) {
    const sx = x0 + (sweepUs / frame.tWin) * w;
    ctx.strokeStyle = C.sweep;
    ctx.lineWidth = 1.5 * scale;
    ctx.beginPath();
    ctx.moveTo(sx, y0);
    ctx.lineTo(sx, y0 + h);
    ctx.stroke();
  }

  if (labels.echo) {
    ctx.font = `700 ${fs}px ${font}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    const minPct = labels.minPct ?? 5;
    const revealT = (frame.shown / n) * frame.tWin;
    for (const e of frame.echoes) {
      if (e.t + (e.len || 0) / 2 > Math.min(frame.tWin, revealT)) continue;
      if (inMainBang(e, frame) || e.minor) continue;
      const shownPct = Math.min(100, e.pct);
      if (e.type !== 'main_bang' && shownPct < minPct) continue;
      const tag = e.type === 'main_bang' ? labels.echo.main_bang : e.type === 'defect' ? `${labels.echo.defect}${e.k || ''}` : `${labels.echo.back_wall}${e.k}`;
      ctx.fillStyle = C.tag;
      if (e.type === 'main_bang') {
        ctx.textAlign = 'left';
        ctx.fillText(tag, x0 + ((e.t + (e.len || 0)) / frame.tWin) * w + 4 * scale, y0 + fs + 4 * scale);
        ctx.textAlign = 'center';
        continue;
      }
      const xc = x0 + ((e.t + (e.len || 0) / 2) / frame.tWin) * w;
      if (shownPct >= 95) {
        ctx.textAlign = 'left';
        ctx.fillText(tag, Math.min(x0 + w - 20 * scale, xc + 6 * scale), y0 + fs + 4 * scale);
        ctx.textAlign = 'center';
        continue;
      }
      const x = Math.min(x0 + w - 12 * scale, Math.max(x0 + 12 * scale, xc));
      const y = Math.max(y0 + fs + 2 * scale, yOf(shownPct) - 3 * scale);
      ctx.fillText(tag, x, y);
    }
  }

  if (gate && gate.on && gate.start_mm < st.range_mm) {
    const g1 = gate.start_mm + gate.width_mm;
    const gx0 = x0 + (Math.max(0, gate.start_mm) / st.range_mm) * w;
    const gx1 = x0 + (Math.min(st.range_mm, g1) / st.range_mm) * w;
    const gy = yOf(gate.threshold_pct);
    ctx.strokeStyle = C.gate;
    ctx.lineWidth = 2 * scale;
    ctx.beginPath();
    ctx.moveTo(gx0, gy);
    ctx.lineTo(gx1, gy);
    ctx.moveTo(gx0, gy - 4 * scale);
    ctx.lineTo(gx0, gy + 4 * scale);
    if (g1 <= st.range_mm) {
      ctx.moveTo(gx1, gy - 4 * scale);
      ctx.lineTo(gx1, gy + 4 * scale);
    }
    ctx.stroke();
  }
  if (gateText && gateRead) {
    const hTxt = gateRead.echo && gateRead.echo.pct > 100 ? '100+' : gateRead.h.toFixed(0);
    const sTxt = gateRead.s == null ? '--' : gateRead.s.toFixed(1);
    const dTxt = gateRead.d == null ? null : gateRead.d.toFixed(1);
    const depthBit = gateText.d && dTxt != null ? `   ${gateText.d} ${dTxt} ${gateText.mm}` : '';
    ctx.font = `700 ${fs * 0.95}px ${font}`;
    ctx.fillStyle = C.gate;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText(`${gateText.s} ${sTxt} ${gateText.mm}${depthBit}   ${gateText.h} ${hTxt}%${gateExtra ? `   ${gateExtra}` : ''}`, x0 + 6 * scale, y0 - 2 * scale);
  }
  const box = (text, cx, cy, align, fg, bg) => {
    ctx.font = `700 ${fs}px ${font}`;
    const tw = ctx.measureText(text).width;
    const bw = tw + 12 * scale;
    const bh = fs + 8 * scale;
    const bx = align === 'right' ? cx - bw : cx - bw / 2;
    ctx.fillStyle = bg;
    ctx.fillRect(bx, cy - bh / 2, bw, bh);
    ctx.fillStyle = fg;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, bx + bw / 2, cy);
  };
  if (tag) box(tag, x0 + w - 4 * scale, y0 + fs, 'right', '#0b1016', C.sweep);
  if (alarm) box(alarm, x0 + w - 4 * scale, y0 + fs * (tag ? 2.9 : 1), 'right', '#ffffff', C.alarm);
  if (message) box(message, x0 + w / 2, y0 + h / 2, 'center', C.head, 'rgba(29,78,216,0.92)');
}
