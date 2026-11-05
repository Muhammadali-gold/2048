// Static file server plus module hosting for 2048.
//
// Why it exists: browsers cannot import ES modules from the filesystem, and the browser has to
// run the exact same logic modules the tests exercise. So `src/core/*.mjs` is served under
// `/core/` and `public/` is served as the document root. Optional project API lives in
// `src/api.mjs` and default-exports (req, res, url) => boolean handled.
//
// Zero dependencies. Node 22+.

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const PUBLIC_DIR = path.join(ROOT, 'public');
const CORE_DIR = path.join(ROOT, 'src', 'core');
const PORT = Number(process.env.PORT ?? 4408);
const HOST = process.env.HOST ?? '127.0.0.1';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

let apiHandler = null;
const apiPath = path.join(ROOT, 'src', 'api.mjs');
if (existsSync(apiPath)) {
  const mod = await import(pathToFileURL(apiPath).href);
  apiHandler = mod.default;
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'cache-control': 'no-store', ...headers });
  res.end(body);
}

function sendJson(res, status, value) {
  send(res, status, JSON.stringify(value), { 'content-type': 'application/json; charset=utf-8' });
}

async function sendFile(res, file) {
  try {
    if (!existsSync(file) || !statSync(file).isFile()) return send(res, 404, 'Not found');
    const body = await readFile(file);
    const type = MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream';
    send(res, 200, body, { 'content-type': type });
  } catch (err) {
    send(res, 500, `Read error: ${err.message}`);
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  try {
    if (url.pathname === '/health') {
      return sendJson(res, 200, {
        status: 'ok',
        service: '2048',
        uptime: Number(process.uptime().toFixed(2)),
      });
    }
    if (apiHandler && (await apiHandler(req, res, url))) return;

    if (url.pathname.startsWith('/core/')) {
      const name = url.pathname.slice('/core/'.length);
      if (!/^[\w.-]+\.m?js$/.test(name)) return send(res, 400, 'Bad module name');
      return sendFile(res, path.join(CORE_DIR, name));
    }

    const rel = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1));
    const candidate = path.join(PUBLIC_DIR, rel);
    if (!candidate.startsWith(PUBLIC_DIR)) return send(res, 403, 'Forbidden');
    if (existsSync(candidate) && statSync(candidate).isFile()) return sendFile(res, candidate);
    if (!path.extname(rel)) return sendFile(res, path.join(PUBLIC_DIR, 'index.html'));
    return send(res, 404, 'Not found');
  } catch (err) {
    return sendJson(res, 500, { error: err.message });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`2048 ready on http://${HOST}:${PORT}`);
});
