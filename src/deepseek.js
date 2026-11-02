// Shared tutor chat: local proxy first, then remote API.

const STORE_KEY = 'ut.tutor.key';
const STORE_EP = 'ut.tutor.endpoint';

function bakedKey() {
  try {
    // eslint-disable-next-line no-undef
    return String(typeof __DEEPSEEK_API_KEY__ !== 'undefined' ? __DEEPSEEK_API_KEY__ : '');
  } catch {
    return '';
  }
}
function bakedBase() {
  try {
    // eslint-disable-next-line no-undef
    return String(typeof __DEEPSEEK_BASE__ !== 'undefined' ? __DEEPSEEK_BASE__ : 'https://api.deepseek.com');
  } catch {
    return 'https://api.deepseek.com';
  }
}
function bakedModel() {
  try {
    // eslint-disable-next-line no-undef
    return String(typeof __DEEPSEEK_MODEL__ !== 'undefined' ? __DEEPSEEK_MODEL__ : 'deepseek-flash');
  } catch {
    return 'deepseek-flash';
  }
}

export function deepseekKey() {
  try {
    const saved = localStorage.getItem(STORE_KEY);
    if (saved?.trim()) return saved.trim();
  } catch { /* ignore */ }
  if (typeof window !== 'undefined' && window.__UT_DEEPSEEK_KEY__) return String(window.__UT_DEEPSEEK_KEY__).trim();
  return bakedKey().trim();
}

export function deepseekReady() {
  return true;
}

/** Exposed for UI smoke checks. */
export function deepseekModel() {
  return bakedModel();
}

function apiBase() {
  return bakedBase().replace(/\/$/, '') || 'https://api.deepseek.com';
}

const LOCAL_DEFAULT = 'http://127.0.0.1:8787';
const LOCAL_TIMEOUT_MS = 1800;

function localBase() {
  try {
    const saved = localStorage.getItem(STORE_EP);
    if (saved) return saved.replace(/\/$/, '');
  } catch { /* ignore */ }
  return typeof import.meta !== 'undefined' && import.meta.env?.DEV ? '' : LOCAL_DEFAULT;
}

function aborted(signal) {
  return !!(signal && signal.aborted);
}

function timeoutSignal(parent, ms) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  const onAbort = () => ctrl.abort();
  if (parent) {
    if (parent.aborted) ctrl.abort();
    else parent.addEventListener('abort', onAbort);
  }
  return {
    signal: ctrl.signal,
    done() {
      clearTimeout(t);
      parent?.removeEventListener('abort', onAbort);
    },
  };
}

function deltaOf(chunk) {
  if (!chunk || typeof chunk !== 'object') return '';
  if (chunk.delta) return String(chunk.delta);
  if (chunk.content) return String(chunk.content);
  return String(chunk.choices?.[0]?.delta?.content || chunk.choices?.[0]?.message?.content || '');
}

/**
 * Read chat completion (SSE or JSON).
 * @returns {{ text: string, finishReason: string|null }}
 */
export async function readDeepseekStream(res, onDelta) {
  const ctype = res.headers.get('content-type') || '';
  if (!res.body || !ctype.includes('text/event-stream')) {
    const data = await res.json();
    const text = data.reply || data.message || data.choices?.[0]?.message?.content || '';
    if (text) onDelta?.(text);
    return {
      text: String(text || ''),
      finishReason: data.choices?.[0]?.finish_reason || (text ? 'stop' : null),
    };
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  let full = '';
  let finishReason = null;
  let sawDone = false;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const parts = buf.split('\n');
    buf = parts.pop() || '';
    for (const line of parts) {
      const t = line.trim();
      if (!t.startsWith('data:')) continue;
      const raw = t.slice(5).trim();
      if (raw === '[DONE]') {
        sawDone = true;
        continue;
      }
      try {
        const j = JSON.parse(raw);
        const fr = j.finish_reason || j.choices?.[0]?.finish_reason;
        if (fr) finishReason = fr;
        const piece = deltaOf(j);
        if (piece) {
          full += piece;
          onDelta?.(piece);
        }
      } catch { /* skip */ }
    }
  }
  // Proxy SSE may omit finish_reason; [DONE] still means a clean end.
  if (!finishReason && sawDone && full) finishReason = 'stop';
  return { text: full, finishReason };
}

/** Chat: local tutor-proxy first (127.0.0.1:8787 or ut.tutor.endpoint), then remote API.
 *  Classroom calls disable thinking unless opted in. */
export async function deepseekChat({
  messages,
  signal,
  stream = true,
  temperature = 0.4,
  max_tokens = 8192,
  thinking = false,
} = {}) {
  if (aborted(signal)) throw new DOMException('Aborted', 'AbortError');
  try {
    return await chatLocal({ messages, signal, stream });
  } catch (e) {
    if (e?.name === 'AbortError' && aborted(signal)) throw e;
    if (!deepseekKey()) throw e;
    return await chatApi({
      messages, signal, stream, temperature, max_tokens, thinking,
    });
  }
}

async function chatLocal({ messages, signal, stream }) {
  const timed = timeoutSignal(signal, LOCAL_TIMEOUT_MS);
  try {
    const res = await fetch(`${localBase()}/api/tutor/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages, stream }),
      signal: timed.signal,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    return res;
  } finally {
    timed.done();
  }
}

async function chatApi({
  messages, signal, stream, temperature, max_tokens, thinking,
}) {
  const payload = {
    model: bakedModel(),
    messages: messages.map((m) => ({
      role: m.role === 'assistant' || m.role === 'system' ? m.role : 'user',
      content: String(m.content ?? '').slice(0, 12000),
    })),
    max_tokens,
    stream,
    thinking: { type: thinking ? 'enabled' : 'disabled' },
    reasoning_effort: thinking ? 'high' : 'none',
  };
  if (!thinking) payload.temperature = temperature;

  const res = await fetch(`${apiBase()}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${deepseekKey()}`,
    },
    body: JSON.stringify(payload),
    signal,
  });
  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(err.slice(0, 200) || `HTTP ${res.status}`);
  }
  return res;
}
