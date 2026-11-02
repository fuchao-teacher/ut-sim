// Shared DeepSeek proxy handler for Vite middleware and standalone tutor_proxy.

const API = process.env.DEEPSEEK_BASE || 'https://api.deepseek.com';
const MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-flash';

export function tutorReady() {
  return !!String(process.env.DEEPSEEK_API_KEY || '').trim();
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve(raw ? JSON.parse(raw) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

export async function handleTutorRequest(req, res) {
  if (req.method !== 'POST' || !req.url?.includes('/api/tutor/chat')) {
    res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'not found' }));
    return;
  }
  const key = String(process.env.DEEPSEEK_API_KEY || '').trim();
  if (!key) {
    res.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'DEEPSEEK_API_KEY not configured' }));
    return;
  }

  let body;
  try {
    body = await readBody(req);
  } catch {
    res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'invalid json' }));
    return;
  }

  const messages = Array.isArray(body.messages) ? body.messages.slice(0, 24) : [];
  if (!messages.length) {
    res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'messages required' }));
    return;
  }

  const stream = body.stream !== false;
  const payload = {
    model: MODEL,
    messages: messages.map((m) => ({
      role: m.role === 'assistant' || m.role === 'system' ? m.role : 'user',
      content: String(m.content ?? '').slice(0, 8000),
    })),
    temperature: 0.4,
    max_tokens: 8192,
    stream,
    // deepseek-flash thinks by default; CoT shares the token budget and truncates classroom answers.
    thinking: { type: 'disabled' },
    reasoning_effort: 'none',
  };

  let upstream;
  try {
    upstream = await fetch(`${API}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: `upstream ${e.message || e}` }));
    return;
  }

  if (!upstream.ok) {
    const text = await upstream.text().catch(() => '');
    res.writeHead(upstream.status, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: text.slice(0, 400) || `DeepSeek HTTP ${upstream.status}` }));
    return;
  }

  if (!stream) {
    const data = await upstream.json();
    const reply = data.choices?.[0]?.message?.content || '';
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ reply }));
    return;
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
  });

  const reader = upstream.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() || '';
      for (const line of lines) {
        const t = line.trim();
        if (!t.startsWith('data:')) continue;
        const raw = t.slice(5).trim();
        if (raw === '[DONE]') {
          res.write('data: [DONE]\n\n');
          continue;
        }
        try {
          const j = JSON.parse(raw);
          const delta = j.choices?.[0]?.delta?.content || '';
          const finish_reason = j.choices?.[0]?.finish_reason || null;
          if (delta || finish_reason) {
            res.write(`data: ${JSON.stringify({ delta, finish_reason })}\n\n`);
          }
        } catch {
          /* skip */
        }
      }
    }
  } catch (e) {
    res.write(`data: ${JSON.stringify({ delta: `\n（连接中断：${e.message || e}）` })}\n\n`);
  }
  res.write('data: [DONE]\n\n');
  res.end();
}
