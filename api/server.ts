/**
 * Local runner for the handlers in this folder.
 *
 * The handlers themselves are host-agnostic `(req, res)` functions, which is
 * what lets them deploy to Vercel unchanged. This file exists so you can also
 * run them on your own machine while wiring Razorpay up:
 *
 *     npm run api
 *
 * It is a plain Node HTTP server with no dependencies. It is fine for local
 * development and for a small VPS; on a serverless host the files are deployed
 * directly and this runner is not used at all.
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import createSubscription from './create-subscription.ts';
import subscriptionStatus from './subscription-status.ts';
import cancel from './cancel-subscription.ts';
import checkout from './checkout.ts';
import webhook from './webhook.ts';
import type { ApiRequest, ApiResponse } from './_http.ts';

type Handler = (req: ApiRequest, res: ApiResponse) => void | Promise<void>;

const routes: Record<string, Handler> = {
  '/create-subscription': createSubscription,
  '/subscription-status': subscriptionStatus,
  '/cancel-subscription': cancel,
  '/checkout': checkout,
  '/webhook': webhook,
};

const PORT = Number(process.env.PORT ?? 5060);

const server = createServer((req, res) => {
  void handle(req, res);
});

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  const handler = routes[url.pathname];

  if (!handler) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found', routes: Object.keys(routes) }));
    return;
  }

  // The webhook signature is computed over the exact bytes Razorpay sent, so
  // the raw buffer is kept alongside the parsed body rather than instead of it.
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const rawBody = Buffer.concat(chunks);

  const apiReq: ApiRequest = {
    method: req.method,
    headers: req.headers as Record<string, string | string[] | undefined>,
    url: req.url,
    query: Object.fromEntries(url.searchParams),
    rawBody,
    body: parseJson(rawBody),
  };

  const apiRes = adapt(res);

  try {
    await handler(apiReq, apiRes);
  } catch (err) {
    console.error(`[nudge] ${url.pathname} threw`, err);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal error' }));
    }
  }
}

function parseJson(raw: Buffer): unknown {
  if (raw.length === 0) return undefined;
  try {
    return JSON.parse(raw.toString('utf8'));
  } catch {
    return undefined;
  }
}

/** Bridges the handlers' minimal response shape onto Node's. */
function adapt(res: ServerResponse): ApiResponse {
  let code = 200;
  const api: ApiResponse = {
    status(next) {
      code = next;
      return api;
    },
    setHeader(name, value) {
      res.setHeader(name, value);
    },
    json(body) {
      if (!res.hasHeader('Content-Type')) {
        res.setHeader('Content-Type', 'application/json');
      }
      res.writeHead(code);
      res.end(body === null ? '' : JSON.stringify(body));
    },
    send(body) {
      res.writeHead(code);
      res.end(body);
    },
    end(body) {
      res.writeHead(code);
      res.end(body ?? '');
    },
  };
  return api;
}

server.listen(PORT, () => {
  const configured = !!process.env.RAZORPAY_KEY_ID && !!process.env.RAZORPAY_KEY_SECRET;
  console.log(`[nudge] subscription API on http://localhost:${PORT}`);
  console.log(`[nudge] routes: ${Object.keys(routes).join(', ')}`);
  if (!configured) {
    console.warn(
      '[nudge] RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET are not set — ' +
        'create-subscription will return 500 until they are. See api/README.md.',
    );
  }
});
