// Dependency-free static file server for the canvas e2e (issue #17).
//
// The Playwright canvas specs need a real browser to load the *built* ESM
// (`/dist/canvas/index.js`) plus gridstack from `/node_modules`, which a raw
// `file://` page cannot resolve. This tiny server serves the repo root over HTTP
// so the fixture page's import map and module graph resolve exactly as a real
// host's would — without pulling in a bundler or an http-server dependency the
// scaffold has no other use for. Started by `playwright.config.ts`'s `webServer`.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// repo root = e2e/server.mjs -> up two levels.
const root = resolve(fileURLToPath(import.meta.url), '..', '..');
const port = Number(process.env.GM_E2E_PORT ?? 4173);

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

const server = createServer((req, res) => {
  const urlPath = (req.url ?? '/').split('?')[0];
  // Strip any leading `../` so a request can never escape the served root.
  const rel = normalize(urlPath).replace(/^(\.\.[/\\])+/, '');
  const filePath = join(root, rel);
  if (filePath !== root && !filePath.startsWith(root + sep)) {
    res.writeHead(403);
    res.end('forbidden');
    return;
  }
  readFile(filePath)
    .then((body) => {
      res.writeHead(200, { 'content-type': CONTENT_TYPES[extname(filePath)] ?? 'application/octet-stream' });
      res.end(body);
    })
    .catch(() => {
      res.writeHead(404);
      res.end('not found');
    });
});

server.listen(port, () => {
  console.log(`[e2e] serving ${root} at http://localhost:${port}`);
});
