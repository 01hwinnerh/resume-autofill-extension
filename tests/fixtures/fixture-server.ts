import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, sep } from 'node:path';

const fixtureRoot = dirname(fileURLToPath(import.meta.url));
const allowedFixtures = new Set([
  'basic-form.html',
  'comprehensive-form.html',
  'controlled-form.html',
  'dynamic-form.html',
  'unsupported-form.html',
]);
const requestedPort = process.argv.slice(2).indexOf('--port');
const port = requestedPort >= 0 ? Number(process.argv[requestedPort + 3]) : 4173;

const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://127.0.0.1').pathname);
    const filename = pathname === '/' ? 'comprehensive-form.html' : pathname.slice(1);
    const filePath = resolve(fixtureRoot, filename);
    if (!allowedFixtures.has(filename) || !filePath.startsWith(`${fixtureRoot}${sep}`)) {
      response.writeHead(404).end('Not found');
      return;
    }

    const content = await readFile(filePath, 'utf8');
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(content);
  } catch {
    response.writeHead(500).end('Fixture unavailable');
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Fixture server listening on http://127.0.0.1:${port}`);
});
