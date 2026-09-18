import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getWorkspaceSession, type WorkspaceSession } from '@/lib/session';
import { checkRateLimit, type RateLimitName } from '@/lib/security/rate-limit';
import { clientIp } from '@/lib/security/request';
import { isSameOrigin } from '@/lib/security/request';
import { fieldErrors } from '@/lib/validation';

export interface ApiErrorBody {
  error: string;
  code: string;
  fields?: Record<string, string>;
}

export function jsonError(message: string, status: number, code = 'error', fields?: Record<string, string>) {
  const body: ApiErrorBody = { error: message, code, ...(fields ? { fields } : {}) };
  return NextResponse.json(body, { status });
}

export const unauthorized = () => jsonError('Please sign in to continue.', 401, 'unauthorized');
export const forbidden = () => jsonError('You do not have access to that.', 403, 'forbidden');
export const notFound = (what = 'That item') => jsonError(`${what} could not be found.`, 404, 'not_found');

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code = 'error',
    readonly fields?: Record<string, string>,
  ) {
    super(message);
  }
}

interface HandlerContext<Params> {
  request: Request;
  session: WorkspaceSession;
  params: Params;
}

interface RouteOptions {
  rateLimit?: RateLimitName;
  /** Allow the route before onboarding has been completed. */
  allowUnonboarded?: boolean;
}

/**
 * Wraps an authenticated route handler with the checks every workspace route
 * needs: valid session, same-origin for mutations, rate limiting, and error
 * shaping that never leaks internals to the client.
 */
export function withWorkspace<Params = Record<string, string>>(
  handler: (context: HandlerContext<Params>) => Promise<Response>,
  options: RouteOptions = {},
) {
  return async (request: Request, routeContext?: { params?: Params }): Promise<Response> => {
    try {
      if (!isSameOrigin(request)) {
        return jsonError('This request could not be verified. Please refresh and try again.', 403, 'csrf');
      }

      const session = await getWorkspaceSession();
      if (!session) return unauthorized();

      if (!session.onboarded && !options.allowUnonboarded) {
        return jsonError('Finish setting up your workspace first.', 409, 'onboarding_required');
      }

      const limitName: RateLimitName =
        options.rateLimit ?? (request.method.toUpperCase() === 'GET' ? 'read' : 'mutation');
      const limit = await checkRateLimit(limitName, `${session.userId}`);
      if (!limit.allowed) {
        return NextResponse.json(
          { error: 'You are doing that a little too quickly. Please try again shortly.', code: 'rate_limited' },
          { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } },
        );
      }

      return await handler({ request, session, params: (routeContext?.params ?? {}) as Params });
    } catch (error) {
      return handleRouteError(error);
    }
  };
}

/** Same wrapper for routes that must work without a session (auth endpoints). */
export function withPublicRoute(
  handler: (context: { request: Request }) => Promise<Response>,
  options: { rateLimit?: RateLimitName } = {},
) {
  return async (request: Request): Promise<Response> => {
    try {
      if (!isSameOrigin(request)) {
        return jsonError('This request could not be verified. Please refresh and try again.', 403, 'csrf');
      }

      if (options.rateLimit) {
        const limit = await checkRateLimit(options.rateLimit, clientIp(request));
        if (!limit.allowed) {
          return NextResponse.json(
            { error: 'Too many attempts. Please wait a few minutes and try again.', code: 'rate_limited' },
            { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } },
          );
        }
      }

      return await handler({ request });
    } catch (error) {
      return handleRouteError(error);
    }
  };
}

function handleRouteError(error: unknown): Response {
  // Next.js signals "this route must be dynamic" by throwing during static
  // analysis. Swallowing it would turn a build-time hint into a runtime 500.
  if (error instanceof Error && error.name === 'DynamicServerError') throw error;

  if (error instanceof HttpError) {
    return jsonError(error.message, error.status, error.code, error.fields);
  }
  if (error instanceof z.ZodError) {
    return jsonError('Please check the highlighted fields.', 422, 'validation', fieldErrors(error));
  }
  // Log the detail server-side; return nothing identifying to the client.
  // eslint-disable-next-line no-console
  console.error('[api] unhandled error', error);
  return jsonError('Something went wrong on our side. Please try again.', 500, 'server_error');
}

/** Parses and validates a JSON body, throwing a shaped 422 on failure. */
export async function parseJson<T extends z.ZodTypeAny>(request: Request, schema: T): Promise<z.infer<T>> {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    throw new HttpError(400, 'We could not read that request.', 'bad_json');
  }
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    throw new HttpError(422, 'Please check the highlighted fields.', 'validation', fieldErrors(parsed.error));
  }
  return parsed.data;
}

export function parseQuery<T extends z.ZodTypeAny>(request: Request, schema: T): z.infer<T> {
  const url = new URL(request.url);
  const raw: Record<string, string> = {};
  url.searchParams.forEach((value, key) => {
    if (value !== '') raw[key] = value;
  });
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new HttpError(422, 'Those filters are not valid.', 'validation', fieldErrors(parsed.error));
  }
  return parsed.data;
}
