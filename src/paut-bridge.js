// Lazy bridge: load the PAUT/TOFD app only when the third learning track is opened.
import { licenseHolder } from './license.js';

let host = null;
let api = null;

function ensureHost() {
  if (host?.isConnected) return host;
  host = document.createElement('div');
  host.id = 'pautMount';
  host.className = 'paut-mount';
  host.hidden = true;
  document.body.appendChild(host);
  return host;
}

function hostHolder() {
  const h = licenseHolder();
  if (!h) return { role: 'teacher' };
  if (h.role === 'teacher') return { role: 'teacher' };
  if (h.role === 'student') return { role: 'student', name: h.name, no: h.no };
  return { role: 'teacher' };
}

export async function openPaut({ hash, onHome } = {}) {
  const el = ensureHost();
  el.hidden = false;
  document.body.dataset.track = 'paut';
  if (api) {
    api.setHome?.(onHome);
    if (hash) api.goto?.(hash);
    return api;
  }
  const mod = await import('@paut/main.js');
  api = await mod.mountPautApp(el, {
    skipLicense: true,
    holder: hostHolder(),
    startHash: hash || '',
    onHome,
  });
  return api;
}

export function hidePaut() {
  if (document.body.dataset.track === 'paut') document.body.dataset.track = 'plate';
  if (host) host.hidden = true;
}

export async function closePaut() {
  document.body.dataset.track = document.body.dataset.track === 'paut' ? 'plate' : document.body.dataset.track;
  if (!api) {
    if (host) host.hidden = true;
    return;
  }
  try {
    await (api.unmount?.() || import('@paut/main.js').then((m) => m.unmountPautApp()));
  } catch (e) {
    console.warn('paut unmount', e);
  }
  api = null;
  if (host) {
    host.hidden = true;
    host.innerHTML = '';
  }
}

export const pautOpen = () => !!api && !host?.hidden;
