// Hover / focus hint box for form fields: a title and tagged lines, placed below (or above) the field.
let box = null;

const make = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

export function showHint(target, c) {
  const root = target.closest('.angle-root') ?? document.body;
  box ??= make('div', 'ag-hint');
  if (box.parentNode !== root) root.appendChild(box);
  box.innerHTML = '';
  if (c.title) box.appendChild(make('b', 'ag-hint-t', c.title));
  for (const [tag, text, cls] of c.rows) {
    if (!text) continue;
    const r = make('div', `ag-hint-r${cls ? ` ${cls}` : ''}`);
    if (tag) r.appendChild(make('span', 'ag-hint-tag', tag));
    r.appendChild(make('span', '', text));
    box.appendChild(r);
  }
  box.hidden = false;
  const r = target.getBoundingClientRect();
  const bw = box.offsetWidth;
  const bh = box.offsetHeight;
  let y = r.bottom + 6;
  if (y + bh > window.innerHeight - 8) y = Math.max(8, r.top - bh - 6);
  const x = Math.max(8, Math.min(r.left, window.innerWidth - bw - 8));
  box.style.left = `${x}px`;
  box.style.top = `${y}px`;
}

export function hideHint() {
  if (box) box.hidden = true;
}

// get() -> { title, rows: [[tag, text, cls?], ...] } | null
export function hint(el, get) {
  const on = () => {
    const c = get();
    if (c) showHint(el, c);
  };
  el.addEventListener('mouseenter', on);
  el.addEventListener('focusin', on);
  el.addEventListener('mouseleave', hideHint);
  el.addEventListener('focusout', hideHint);
}
