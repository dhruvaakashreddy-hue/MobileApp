/**
 * Small shared helpers for the handlers in this folder.
 *
 * These are written against a minimal `(req, res)` shape rather than an
 * imported framework type, so the same files run on Vercel, Netlify Functions,
 * Cloudflare (with a shim) or a plain Express app without changes.
 */

export interface ApiRequest {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  query?: Record<string, string | string[] | undefined>;
  url?: string;
  body?: unknown;
  /** Raw, unparsed bytes. Only the webhook needs these. */
  rawBody?: string | Buffer;
}

export interface ApiResponse {
  status: (code: number) => ApiResponse;
  json: (body: unknown) => void;
  setHeader: (name: string, value: string) => void;
  send?: (body: string) => void;
  end?: (body?: string) => void;
}

/**
 * The app calls this API from a WebView origin (`capacitor://localhost`,
 * `http://localhost` on Android, or a Vite dev server), so every response needs
 * CORS headers or the browser discards it before the app ever sees it.
 *
 * ALLOWED_ORIGINS is a comma-separated allow-list. Leaving it unset allows any
 * origin, which is acceptable here only because none of these endpoints trust
 * the caller's identity — but set it in production anyway.
 */
export function applyCors(req: ApiRequest, res: ApiResponse): void {
  const configured = (process.env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  const origin = header(req, 'origin');
  const allow =
    configured.length === 0
      ? '*'
      : origin && configured.includes(origin)
        ? origin
        : configured[0];

  res.setHeader('Access-Control-Allow-Origin', allow);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');
}

/** Handles the CORS preflight. Returns true when the request is done with. */
export function handledPreflight(req: ApiRequest, res: ApiResponse): boolean {
  applyCors(req, res);
  if (req.method === 'OPTIONS') {
    res.status(204).json(null);
    return true;
  }
  return false;
}

export function header(req: ApiRequest, name: string): string | undefined {
  const raw = req.headers?.[name] ?? req.headers?.[name.toLowerCase()];
  return Array.isArray(raw) ? raw[0] : raw;
}

/** Reads a query parameter, whether the host parsed the URL for us or not. */
export function queryParam(req: ApiRequest, name: string): string | undefined {
  const fromHost = req.query?.[name];
  if (typeof fromHost === 'string') return fromHost;
  if (Array.isArray(fromHost)) return fromHost[0];
  if (!req.url) return undefined;
  try {
    return new URL(req.url, 'http://localhost').searchParams.get(name) ?? undefined;
  } catch {
    return undefined;
  }
}

/** Parses a JSON body that the host may or may not have parsed already. */
export function jsonBody<T>(req: ApiRequest): T | null {
  const body = req.body;
  if (body == null) return null;
  if (typeof body === 'string') {
    try {
      return JSON.parse(body) as T;
    } catch {
      return null;
    }
  }
  if (typeof body === 'object') return body as T;
  return null;
}

/** Escapes a value for safe interpolation into an HTML page. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Serialises a value for embedding inside an inline `<script>` block.
 *
 * `JSON.stringify` alone is NOT enough: it escapes quotes but leaves `<` and
 * `>` intact, so a value containing `</script>` closes the block early — the
 * HTML parser does not care that it is inside a JavaScript string — and
 * everything after it is parsed as markup. Escaping the angle brackets as
 * `\u003c` / `\u003e` keeps the value identical to JavaScript while making it
 * inert to the HTML parser. U+2028/2029 are escaped because they are line
 * terminators in older JavaScript parsers.
 */
export function jsonForScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

/** Sends an HTML document, tolerating hosts that expose `send` or only `end`. */
export function sendHtml(res: ApiResponse, status: number, html: string): void {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  // The checkout page embeds a per-request subscription id and must never be
  // cached by a CDN and handed to the next person who opens it.
  res.setHeader('Cache-Control', 'no-store');
  res.status(status);
  if (res.send) res.send(html);
  else if (res.end) res.end(html);
  else res.json(html);
}
