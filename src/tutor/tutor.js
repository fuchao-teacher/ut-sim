// Floating DeepSeek teaching tutor: avatar launcher + chat panel.
import T from '../../../knowledge/tutor.json';
import avatarUrl from './avatar.jpg?url';
import { packContext, buildSystemPrompt, examBlocked } from './prompt.js';
import { deepseekKey, deepseekChat, deepseekModel, readDeepseekStream } from '../deepseek.js';
import './tutor.css';

const STORE_KEY = 'ut.tutor.key';
const STORE_EP = 'ut.tutor.endpoint';

function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function gatherContext() {
  const role = document.body.dataset.learningRole || 'home';
  const route = document.body.dataset.learningRoute || '';
  const track = document.body.dataset.track || '';
  const station = document.body.dataset.station || '';
  const labRoom = document.body.dataset.labRoom === '1';
  const angle = document.querySelector('.angle-root:not([hidden])');
  const page = angle?.dataset?.page || '';
  const topic = angle?.querySelector('.ag-nav-tabs button.active')?.textContent?.trim()
    || document.querySelector('.ut-learning-topics button[aria-current="page"]')?.textContent?.trim()
    || '';
  return packContext({
    role, route, track, page, topic, station, labRoom,
    title: document.title,
  });
}

export function mountTutor(parent = document.body) {
  if (document.querySelector('.ut-tutor-root')) return document.querySelector('.ut-tutor-root');

  const root = document.createElement('div');
  root.className = 'ut-tutor-root';
  root.dataset.open = '0';
  root.innerHTML = `
    <div class="ut-tutor-panel" hidden>
      <header class="ut-tutor-head">
        <img class="ut-tutor-head-avatar" src="${esc(avatarUrl)}" alt="">
        <div>
          <h2>${esc(T.name)}</h2>
          <p>${esc(T.footer)}</p>
        </div>
        <div class="ut-tutor-head-acts">
          <button type="button" class="ut-tutor-icon" data-act="clear">${esc(T.clear)}</button>
          <button type="button" class="ut-tutor-icon" data-act="close">${esc(T.close)}</button>
        </div>
      </header>
      <div class="ut-tutor-ctx" data-ctx></div>
      <div class="ut-tutor-hints"></div>
      <div class="ut-tutor-log" data-log></div>
      <form class="ut-tutor-form">
        <textarea name="q" rows="2" placeholder="${esc(T.placeholder)}" aria-label="${esc(T.placeholder)}"></textarea>
        <button type="submit" class="ut-tutor-send">${esc(T.send)}</button>
      </form>
      <div class="ut-tutor-foot">${esc(T.footer)}</div>
    </div>
    <button type="button" class="ut-tutor-fab" aria-label="${esc(T.open)}" title="${esc(T.open)}">
      <span class="ut-tutor-fab-pulse" aria-hidden="true"></span>
      <span class="ut-tutor-fab-tag">${esc(T.short)}</span>
      <img src="${esc(avatarUrl)}" width="72" height="72" alt="">
    </button>`;
  parent.appendChild(root);

  const panel = root.querySelector('.ut-tutor-panel');
  const log = root.querySelector('[data-log]');
  const ctxEl = root.querySelector('[data-ctx]');
  const form = root.querySelector('.ut-tutor-form');
  const input = form.querySelector('textarea');
  const sendBtn = form.querySelector('.ut-tutor-send');
  const hints = root.querySelector('.ut-tutor-hints');
  const fab = root.querySelector('.ut-tutor-fab');

  for (const h of T.hints || []) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'ut-tutor-hint';
    b.textContent = h;
    b.addEventListener('click', () => {
      input.value = h;
      input.focus();
      form.requestSubmit();
    });
    hints.appendChild(b);
  }

  const history = [];
  let abort = null;
  let busy = false;

  const addMsg = (role, text, cls = '') => {
    const el = document.createElement('div');
    el.className = `ut-tutor-msg ${role}${cls ? ` ${cls}` : ''}`;
    el.textContent = text;
    log.appendChild(el);
    log.scrollTop = log.scrollHeight;
    return el;
  };

  const refreshCtx = () => {
    const c = gatherContext();
    ctxEl.textContent = `${c.scene} · ${c.station} · ${c.role}${c.topic && c.topic !== '—' ? ` · ${c.topic}` : ''}`;
    return c;
  };

  const setOpen = (on) => {
    root.dataset.open = on ? '1' : '0';
    panel.hidden = !on;
    if (on) {
      refreshCtx();
      if (!log.childElementCount) addMsg('bot', T.greeting);
      input.focus();
    }
  };

  fab.addEventListener('click', () => setOpen(root.dataset.open !== '1'));
  root.querySelector('[data-act=close]').addEventListener('click', () => setOpen(false));
  root.querySelector('[data-act=clear]').addEventListener('click', () => {
    history.length = 0;
    log.innerHTML = '';
    addMsg('bot', T.greeting);
  });

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const q = input.value.trim();
    if (!q || busy) return;
    const ctx = refreshCtx();
    input.value = '';
    addMsg('user', q);
    hints.hidden = true;

    if (examBlocked(q, document.body.dataset.learningRole)) {
      addMsg('bot', T.exam_refuse);
      return;
    }

    busy = true;
    sendBtn.disabled = true;
    sendBtn.textContent = T.stop;
    const thinking = addMsg('bot', T.thinking, 'busy');
    abort = new AbortController();

    const stopBusy = () => {
      busy = false;
      sendBtn.disabled = false;
      sendBtn.textContent = T.send;
      abort = null;
    };

    sendBtn.onclick = (e) => {
      if (!busy) return;
      e.preventDefault();
      abort?.abort();
      stopBusy();
    };

    try {
      const system = buildSystemPrompt(ctx, { exam: document.body.dataset.learningRole === 'exam' });
      const messages = [
        { role: 'system', content: system },
        ...history.slice(-8),
        { role: 'user', content: q },
      ];
      const paint = (delta) => {
        thinking.textContent += delta;
        thinking.classList.remove('busy');
        log.scrollTop = log.scrollHeight;
      };
      const runOnce = async (msgs, stream) => {
        thinking.textContent = stream ? '' : thinking.textContent;
        const res = await deepseekChat({ messages: msgs, signal: abort.signal, stream });
        let text = '';
        const { text: body, finishReason } = await readDeepseekStream(res, (delta) => {
          text += delta;
          paint(delta);
        });
        return { text: body || text, finishReason };
      };

      let reply = '';
      let finishReason = null;
      try {
        ({ text: reply, finishReason } = await runOnce(messages, true));
      } catch (streamErr) {
        ({ text: reply, finishReason } = await runOnce(messages, false));
        if (!reply.trim()) throw streamErr;
      }
      // Empty / mid-stream drop → non-stream retry.
      if (!reply.trim() || !finishReason) {
        thinking.textContent = '';
        ({ text: reply, finishReason } = await runOnce(messages, false));
      }
      // Hit token cap → one seamless continuation.
      if (finishReason === 'length' && reply.trim()) {
        const cont = [
          ...messages,
          { role: 'assistant', content: reply },
          { role: 'user', content: '请从上一句中断处无缝续写完整，不要重复已写内容，写完自然收尾。' },
        ];
        const more = await runOnce(cont, false);
        if (more.text.trim()) {
          reply += more.text;
          finishReason = more.finishReason;
        }
      }
      if (!reply.trim()) thinking.textContent = T.error;
      else {
        history.push({ role: 'user', content: q });
        history.push({ role: 'assistant', content: reply });
      }
    } catch (err) {
      if (err?.name === 'AbortError') {
        if (!thinking.textContent || thinking.textContent === T.thinking) thinking.textContent = '（已停止）';
      } else {
        const offline = /Failed to fetch|NetworkError|HTTP 5|ECONNREFUSED|Failed to resolve/i.test(String(err?.message || err));
        thinking.textContent = offline ? T.offline : `${T.error}${err?.message ? `（${String(err.message).slice(0, 120)}）` : ''}`;
        thinking.classList.add('sys');
      }
    } finally {
      sendBtn.onclick = null;
      stopBusy();
    }
  });

  input.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' && !ev.shiftKey) {
      ev.preventDefault();
      form.requestSubmit();
    }
  });

  try {
    if (typeof window !== 'undefined') window.__UT_DEEPSEEK_MODEL__ = deepseekModel();
  } catch { /* ignore */ }

  return {
    root,
    open: () => setOpen(true),
    close: () => setOpen(false),
    setKey: (key) => {
      try { localStorage.setItem(STORE_KEY, String(key || '')); } catch { /* ignore */ }
    },
    setEndpoint: (url) => {
      try { localStorage.setItem(STORE_EP, String(url || '')); } catch { /* ignore */ }
    },
    hasKey: () => !!deepseekKey(),
    model: () => deepseekModel(),
  };
}
