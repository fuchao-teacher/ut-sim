import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleTutorRequest, tutorReady } from './tools/tutor_api.mjs';

// Session header versions (docs/M8_SCOPE.md §3.2): short content hashes of the sources a recorded session depends on.
const here = dirname(fileURLToPath(import.meta.url));
const hashDir = (dir, keep = () => true, h = createHash('sha256'), top = true) => {
  for (const f of readdirSync(dir).sort()) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) { h.update(`${f}/`); hashDir(p, keep, h, false); } else if (keep(f)) h.update(f).update(readFileSync(p));
  }
  return top ? h.digest('hex').slice(0, 12) : '';
};
const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 13);
const buildMeta = {
  build_id: `${stamp}-${hashDir(join(here, 'src'))}`,
  knowledge_version: hashDir(join(here, '..', 'knowledge'), (f) => f.endsWith('.json') && !f.startsWith('angle_')),
  contracts_version: hashDir(join(here, '..', 'contracts'), (f) => f.endsWith('.json') && f !== 'rubric.json' && !f.startsWith('angle_')),
};

// KaTeX ships woff2 + woff + ttf for every face; keep only woff2 so the single-file build stays small.
const katexWoff2Only = {
  name: 'katex-woff2-only',
  enforce: 'pre',
  transform(code, id) {
    if (!/katex(\.min)?\.css$/.test(id)) return null;
    return code.replace(/,\s*url\([^)]*\.woff\)\s*format\("woff"\)\s*,\s*url\([^)]*\.ttf\)\s*format\("truetype"\)/g, '');
  },
};

const tutorDevProxy = {
  name: 'tutor-deepseek-proxy',
  configureServer(server) {
    server.middlewares.use(async (req, res, next) => {
      if (!req.url?.startsWith('/api/tutor/')) return next();
      if (req.url.startsWith('/api/tutor/health')) {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({ ok: tutorReady(), model: process.env.DEEPSEEK_MODEL || 'deepseek-flash' }));
        return;
      }
      try {
        await handleTutorRequest(req, res);
      } catch (e) {
        if (!res.headersSent) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify({ error: String(e?.message || e) }));
        }
      }
    });
    if (!tutorReady()) {
      server.config.logger.warn('[tutor] DEEPSEEK_API_KEY missing — chat proxy will return 503 until set.');
    } else {
      server.config.logger.info('[tutor] DeepSeek proxy ready at /api/tutor/chat');
    }
  },
};

const pautWeb = join(here, '..', '..', 'paut_tofd_teaching_v1', 'webapp');
const pautSrc = join(pautWeb, 'src');
const pautAssets = join(here, '..', '..', 'paut_tofd_teaching_v1', 'assets');

export default defineConfig({
  base: './',
  define: {
    __BUILD_META__: JSON.stringify(buildMeta),
    // Course choice: bake DeepSeek credentials into the page so students can use the tutor offline-of-proxy.
    __DEEPSEEK_API_KEY__: JSON.stringify(process.env.DEEPSEEK_API_KEY || ''),
    __DEEPSEEK_BASE__: JSON.stringify(process.env.DEEPSEEK_BASE || 'https://api.deepseek.com'),
    __DEEPSEEK_MODEL__: JSON.stringify(process.env.DEEPSEEK_MODEL || 'deepseek-flash'),
  },
  resolve: {
    alias: {
      '@paut': pautSrc,
      '@paut-assets': pautAssets,
    },
  },
  plugins: [katexWoff2Only, tutorDevProxy, viteSingleFile()],
  assetsInclude: ['**/*.glb', '**/*.mp4'],
  server: { fs: { allow: ['..', pautWeb, join(here, '..', '..', 'paut_tofd_teaching_v1')] } },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // Lesson MP4 (~5 MB) + PAUT GLBs are inlined into the single-file HTML.
    assetsInlineLimit: 12 * 1024 * 1024,
    chunkSizeWarningLimit: 40000,
  },
});
