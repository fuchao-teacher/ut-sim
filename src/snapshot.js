// PNG export of a rendered canvas (A-scan screen or 3D view): footer strip with the licence mark and time.
import { licenseMark } from './license.js';

const pad2 = (n) => String(n).padStart(2, '0');
export const shotStamp = (d = new Date()) =>
  `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}-${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}`;
const safe = (s) => String(s ?? '').replace(/[\\/:*?"<>|\s]+/g, '_').replace(/^_+|_+$/g, '');
export const shotName = (...parts) => `${parts.map(safe).filter(Boolean).join('_')}_${shotStamp()}.png`;

// First non-transparent background colour up the DOM tree (3D canvases are rendered with alpha).
export function backdropOf(node, fallback = '#e9eef3') {
  for (let n = node; n && n.nodeType === 1; n = n.parentElement) {
    const c = getComputedStyle(n).backgroundColor;
    if (c && c !== 'transparent' && !/rgba\([^)]*,\s*0\)$/.test(c)) return c;
  }
  return fallback;
}

// Copy of a WebGL canvas taken right after a render call (no preserveDrawingBuffer needed).
export function grabGl(renderer, scene, camera, bg) {
  renderer.render(scene, camera);
  const src = renderer.domElement;
  const out = document.createElement('canvas');
  out.width = src.width;
  out.height = src.height;
  const c = out.getContext('2d');
  if (bg) {
    c.fillStyle = bg;
    c.fillRect(0, 0, out.width, out.height);
  }
  c.drawImage(src, 0, 0);
  return out;
}

export function framed(src) {
  const w = src.width;
  const h = src.height;
  const fs = Math.max(12, Math.round(w / 72));
  const strip = Math.round(fs * 2.2);
  const out = document.createElement('canvas');
  out.width = w;
  out.height = h + strip;
  const c = out.getContext('2d');
  c.fillStyle = '#0f1b27';
  c.fillRect(0, 0, w, h + strip);
  c.drawImage(src, 0, 0);
  c.fillStyle = '#c3d1dc';
  c.font = `${fs}px "Microsoft YaHei", "PingFang SC", Arial, sans-serif`;
  c.textBaseline = 'middle';
  const y = h + strip / 2;
  c.textAlign = 'left';
  c.fillText(licenseMark(), fs * 0.8, y);
  c.textAlign = 'right';
  c.fillText(new Date().toLocaleString('zh-CN', { hour12: false }), w - fs * 0.8, y);
  return out;
}

export function savePng(src, name) {
  if (!src) return null;
  const cv = framed(src);
  cv.toBlob((blob) => {
    if (!blob) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }, 'image/png');
  return { name, width: cv.width, height: cv.height };
}
