import { getDeps, type Deps } from './deps.ts';
import { AppError } from './errors.ts';
import { assertSameOrigin, cookieValue, errorResponse, json, SESSION_COOKIE } from './http.ts';
import { resolveSession } from './services/auth.ts';
import { routes, type Ctx, type Route } from './routes.ts';

function matchPath(pattern: string, path: string): Record<string, string> | null {
  const expected = pattern.split('/').filter(Boolean);
  const actual = path.split('/').filter(Boolean);
  if (expected.length !== actual.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < expected.length; i += 1) {
    if (expected[i].startsWith(':')) {
      params[expected[i].slice(1)] = decodeURIComponent(actual[i]);
    } else if (expected[i] !== actual[i]) {
      return null;
    }
  }
  return params;
}

/**
 * The one entry point for every /api request, on Vercel and in the local dev server.
 * Routes are matched in order. Cross-site writes are refused, and only error envelopes ever
 * leave this function, never stack traces or database messages.
 */
export async function handleApiRequest(request: Request, deps: Deps = getDeps()): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api(?=\/|$)/, '') || '/';
  const method = request.method.toUpperCase() as Route['method'];

  try {
    let pathMatched = false;
    for (const route of routes) {
      const params = matchPath(route.path, path);
      if (!params) continue;
      pathMatched = true;
      if (route.method !== method) continue;

      const unsafe = method !== 'GET';
      if (unsafe && !route.external) assertSameOrigin(request, deps.config.publicOrigin);

      const token = cookieValue(request, SESSION_COOKIE);
      const ctx: Ctx = {
        request,
        deps,
        params,
        search: url.searchParams,
        viewer: token ? await resolveSession(deps, token) : null,
      };
      const result = await route.handler(ctx);
      return result instanceof Response ? result : json(result);
    }
    if (pathMatched) throw new AppError(405, 'method_not_allowed', 'That method is not allowed here.');
    throw new AppError(404, 'not_found', 'There is no such API route.');
  } catch (error) {
    if (error instanceof AppError) return errorResponse(error);
    console.error(
      JSON.stringify({
        level: 'error',
        msg: 'api_error',
        method,
        path,
        message: error instanceof Error ? error.message : 'unknown',
      }),
    );
    return json({ error: { code: 'internal_error', message: 'Something went wrong on our side. Try again.' } }, 500);
  }
}
