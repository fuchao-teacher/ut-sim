// Modal player for the angle-probe lesson clip (compressed MP4 baked into the page at build time).
import './lesson-video.css';
import lessonMp4 from './assets/angle-structure.mp4?inline';

export function lessonVideoUrl() {
  return lessonMp4;
}

let box = null;

export function closeLessonVideo() {
  const v = box?.querySelector('video');
  if (v) {
    v.pause();
    v.removeAttribute('src');
    v.load();
  }
  box?.remove();
  box = null;
}

export function openLessonVideo({ title = '视频讲解', src = lessonVideoUrl() } = {}) {
  if (box) {
    box.querySelector('video')?.focus();
    return box;
  }
  box = document.createElement('div');
  box.className = 'ag-video-gate';
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  box.setAttribute('aria-label', title);
  box.innerHTML = `
    <div class="ag-video-card">
      <header class="ag-video-head">
        <h2>${esc(title)}</h2>
        <button type="button" class="ag-video-close" data-ag-video-close>关闭</button>
      </header>
      <div class="ag-video-stage">
        <video controls playsinline preload="metadata"></video>
        <p class="ag-video-miss" hidden>视频未能加载，请换用 Chrome / Edge 再试。</p>
      </div>
    </div>`;
  const video = box.querySelector('video');
  const miss = box.querySelector('.ag-video-miss');
  video.src = src;
  video.addEventListener('error', () => { miss.hidden = false; });
  video.addEventListener('loadeddata', () => { miss.hidden = true; });

  const close = () => closeLessonVideo();
  box.addEventListener('click', (e) => {
    const t = e.target instanceof Element ? e.target : null;
    if (t === box || t?.closest('[data-ag-video-close]')) close();
  });
  box.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Escape') close();
  });
  document.body.appendChild(box);
  box.querySelector('.ag-video-close').focus();
  video.play().catch(() => { /* user can press play */ });
  return box;
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

export function makeLessonVideoButton(label, title) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'ag-chip ag-video-btn';
  b.textContent = label;
  b.addEventListener('click', () => openLessonVideo({ title }));
  return b;
}
