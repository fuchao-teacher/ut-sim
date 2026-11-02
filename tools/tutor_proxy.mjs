#!/usr/bin/env node
/**
 * DeepSeek chat proxy for the UT teaching tutor.
 * Key stays on the server: set DEEPSEEK_API_KEY, then:
 *   node tools/tutor_proxy.mjs
 * Dev server (vite) embeds the same handler via vite.config.js.
 */
import http from 'node:http';
import { handleTutorRequest, tutorReady } from './tutor_api.mjs';

const port = Number(process.env.TUTOR_PORT || 8787);
const host = process.env.TUTOR_HOST || '127.0.0.1';

if (!tutorReady()) {
  console.error('Missing DEEPSEEK_API_KEY. Set it in the environment before starting the proxy.');
  process.exit(1);
}

const server = http.createServer(async (req, res) => {
  // Browser single-file page may sit on another origin / file://
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }
  if (req.url?.startsWith('/api/tutor/')) {
    await handleTutorRequest(req, res);
    return;
  }
  if (req.url === '/api/tutor/health' || req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: true, model: process.env.DEEPSEEK_MODEL || 'deepseek-flash' }));
    return;
  }
  res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ error: 'not found' }));
});

server.listen(port, host, () => {
  console.log(`Tutor proxy http://${host}:${port}  (POST /api/tutor/chat)`);
});
