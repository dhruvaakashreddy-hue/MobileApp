import react from '@vitejs/plugin-react';
import type { IncomingMessage } from 'node:http';
import { defineConfig, loadEnv, type Plugin } from 'vite';

const SKIPPED_REQUEST_HEADERS = new Set(['host', 'connection', 'content-length']);

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

/**
 * Mounts the same handler that Vercel runs, so `npm run dev` exercises the real API
 * against the real database. Nothing here is a mock.
 */
function apiDevServer(): Plugin {
  return {
    name: 'bizzar-api-dev-server',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url || !(req.url === '/api' || req.url.startsWith('/api/'))) return next();
        try {
          const mod = await server.ssrLoadModule('/api/[...path].ts');
          const headers = new Headers();
          for (const [name, value] of Object.entries(req.headers)) {
            if (SKIPPED_REQUEST_HEADERS.has(name) || value === undefined) continue;
            if (Array.isArray(value)) value.forEach((item) => headers.append(name, item));
            else headers.set(name, value);
          }
          const method = (req.method ?? 'GET').toUpperCase();
          const body = method === 'GET' || method === 'HEAD' ? undefined : new Uint8Array(await readBody(req));
          const request = new Request(new URL(req.url, `http://${req.headers.host ?? 'localhost'}`), {
            method,
            headers,
            body,
          });
          const handler = mod[method] as (request: Request) => Promise<Response>;
          const response = await handler(request);

          res.statusCode = response.status;
          response.headers.forEach((value, name) => {
            if (name !== 'set-cookie') res.setHeader(name, value);
          });
          const cookies = response.headers.getSetCookie();
          if (cookies.length > 0) res.setHeader('Set-Cookie', cookies);
          res.end(Buffer.from(await response.arrayBuffer()));
        } catch (error) {
          server.ssrFixStacktrace(error as Error);
          next(error);
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  // The server reads plain environment variables. Load .env into process.env for the dev server.
  const env = loadEnv(mode, process.cwd(), '');
  for (const [key, value] of Object.entries(env)) {
    if (process.env[key] === undefined) process.env[key] = value;
  }

  return {
    plugins: [react(), apiDevServer()],
    server: { port: 5173, strictPort: false },
    build: { sourcemap: false },
  };
});
