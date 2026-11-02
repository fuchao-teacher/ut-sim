// In-app operation manual (same source as the Word manual: manual.json).
import M from './manual.json';
import './manual.css';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function table({ head, rows }) {
  return `<table class="man-table"><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead>`
    + `<tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}

function section(s, no) {
  let h = `<section class="man-sec" id="man-${s.id}"><h3><span>${no}</span>${esc(s.title)}`;
  if (s.route && navigate) h += `<button type="button" class="man-go" data-man-open="${esc(s.role)}|${esc(s.route)}">打开此页</button>`;
  h += '</h3>';
  if (s.ops) h += `<h4>操作</h4>${table({ head: ['操作', '说明'], rows: s.ops })}`;
  if (s.table) h += table(s.table);
  if (s.principle) h += `<h4>原理</h4>${s.principle.map((p) => `<p>${esc(p)}</p>`).join('')}`;
  if (s.formulas) h += `<pre class="man-formula">${s.formulas.map(esc).join('\n')}</pre>`;
  if (s.notes) h += `<ul class="man-notes">${s.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>`;
  return `${h}</section>`;
}

let box = null;
let navigate = null;

export const manualOpen = () => !!box;

/** fn(role, route) opens a learning page from a manual section. */
export function setManualNavigator(fn) {
  navigate = fn;
}

export function closeManual() {
  box?.remove();
  box = null;
}

/** at: section id or learning route */
export function openManual(at) {
  if (box) return;
  const toc = M.chapters.map((c, i) => `<li><a href="#" data-man="${c.id}">${i + 1}　${esc(c.title)}</a><ol>`
    + c.sections.map((s, j) => `<li><a href="#" data-man="${s.id}">${i + 1}.${j + 1}　${esc(s.title)}</a></li>`).join('')
    + '</ol></li>').join('');
  const body = M.chapters.map((c, i) => `<h2 id="man-${c.id}">${i + 1}　${esc(c.title)}</h2>`
    + c.sections.map((s, j) => section(s, `${i + 1}.${j + 1}`)).join('')).join('');
  box = document.createElement('div');
  box.className = 'man-gate';
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  box.innerHTML = `<div class="man-card"><header class="man-head"><h1>${esc(M.title)}<small>${esc(M.subtitle)}</small></h1>`
    + `<button type="button" class="man-close" data-man-close>关闭</button></header>`
    + `<nav class="man-toc"><ol>${toc}</ol></nav><article class="man-body">${body}</article></div>`;
  const article = box.querySelector('.man-body');
  box.addEventListener('click', (e) => {
    const t = e.target instanceof Element ? e.target : null;
    const jump = t?.closest('[data-man]');
    if (jump) {
      e.preventDefault();
      article.querySelector(`#man-${jump.dataset.man}`)?.scrollIntoView({ block: 'start' });
      return;
    }
    const open = t?.closest('[data-man-open]');
    if (open) {
      const [role, route] = open.dataset.manOpen.split('|');
      closeManual();
      navigate?.(role, route);
      return;
    }
    if (t?.closest('[data-man-close]')) closeManual();
    else if (t === box) closeManual();
  });
  box.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Escape') closeManual();
  });
  document.body.appendChild(box);
  box.querySelector('.man-close').focus();
  const sec = at && M.chapters.flatMap((c) => c.sections).find((s) => s.id === at || s.route === at || s.alias?.includes(at));
  const target = sec && article.querySelector(`#man-${sec.id}`);
  if (target) article.scrollTo({ top: target.getBoundingClientRect().top - article.getBoundingClientRect().top - 8, behavior: 'instant' });
}
