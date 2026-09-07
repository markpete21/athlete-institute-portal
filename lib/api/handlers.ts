import 'server-only';
import { timingSafeEqual } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Route-handler wrappers — the shared front door for every `app/api/**` route.
 *
 * Each wrapper owns exactly one policy so the routes themselves are just the
 * business step:
 *
 *   cronRoute(fn)      — Vercel cron: `Authorization: Bearer $CRON_SECRET`.
 *                        FAILS CLOSED in production when the secret is unset
 *                        (a cron that can be triggered by anyone is a cost and
 *                        a data-integrity hazard); dev/test run open so the
 *                        route can be hit from a browser.
 *   secretRoute(fn)    — server-to-server callers (ecosystem apps) presenting a
 *                        shared secret in a named header. Closed until set.
 *   devOnlyRoute(fn)   — `/api/dev/*-verify` harnesses: 404 in production.
 *
 * Secrets compare in constant time, errors return a uniform JSON shape, and an
 * unhandled throw becomes a 500 with the message logged (never leaked).
 */

type Handler = (req: NextRequest, ctx: RouteContext) => Promise<Response> | Response;
export interface RouteContext {
  params: Record<string, string | string[]>;
}

export function jsonError(message: string, status: number, extra?: Record<string, unknown>): NextResponse {
  return NextResponse.json({ error: message, ...extra }, { status });
}

/** Constant-time string equality (length leak is acceptable; content is not). */
export function secretsMatch(presented: string | null | undefined, expected: string | null | undefined): boolean {
  if (!presented || !expected) return false;
  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** `Authorization: Bearer <token>` → token, or null. */
export function bearerToken(req: NextRequest): string | null {
  const h = req.headers.get('authorization') ?? '';
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m ? m[1].trim() : null;
}

function withErrorBoundary(label: string, fn: Handler): Handler {
  return async (req, ctx) => {
    try {
      return await fn(req, ctx);
    } catch (err) {
      console.error(`[api:${label}]`, err);
      return jsonError('Internal error', 500);
    }
  };
}

/** Vercel cron guard (see module doc). */
export function cronRoute(fn: Handler): Handler {
  return withErrorBoundary('cron', async (req, ctx) => {
    const secret = process.env.CRON_SECRET;
    if (!secret) {
      if (process.env.NODE_ENV === 'production') {
        console.error('[cron] CRON_SECRET is not set — refusing to run');
        return jsonError('Cron not configured', 503);
      }
    } else if (!secretsMatch(bearerToken(req), secret)) {
      return jsonError('Unauthorized', 401);
    }
    return fn(req, ctx);
  });
}

/** Shared-secret header guard for server-to-server callers. */
export function secretRoute(header: string, envVar: string, fn: Handler): Handler {
  return withErrorBoundary(envVar, async (req, ctx) => {
    const expected = process.env[envVar];
    if (!expected) return jsonError('Endpoint not configured', 503); // closed until the secret exists
    if (!secretsMatch(req.headers.get(header), expected)) return jsonError('Unauthorized', 401);
    return fn(req, ctx);
  });
}

/** Dev-only verify harnesses: never reachable in production. */
export function devOnlyRoute(fn: Handler): Handler {
  return async (req, ctx) => {
    if (process.env.NODE_ENV === 'production') return jsonError('Not found', 404);
    return fn(req, ctx);
  };
}

/** Parse a JSON body, returning `null` (not throwing) when it is missing or malformed. */
export async function readJson<T>(req: NextRequest): Promise<T | null> {
  try {
    return (await req.json()) as T;
  } catch {
    return null;
  }
}
