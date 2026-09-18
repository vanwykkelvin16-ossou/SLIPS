'use client';

export interface ApiFailure {
  message: string;
  code: string;
  status: number;
  fields?: Record<string, string>;
}

export class ApiError extends Error implements ApiFailure {
  readonly code: string;
  readonly status: number;
  readonly fields?: Record<string, string>;

  constructor(failure: ApiFailure) {
    super(failure.message);
    this.name = 'ApiError';
    this.code = failure.code;
    this.status = failure.status;
    this.fields = failure.fields;
  }

  /** True when the request never reached the server. */
  get isOffline(): boolean {
    return this.code === 'offline';
  }
}

/**
 * Small fetch wrapper: JSON in, JSON out, typed errors, and a clear offline
 * signal so the UI can queue work instead of showing a scary failure.
 */
export async function apiFetch<T = unknown>(
  input: string,
  init: RequestInit & { json?: unknown } = {},
): Promise<T> {
  const { json, headers, ...rest } = init;

  let response: Response;
  try {
    response = await fetch(input, {
      ...rest,
      headers: {
        Accept: 'application/json',
        ...(json !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...headers,
      },
      ...(json !== undefined ? { body: JSON.stringify(json) } : {}),
      credentials: 'same-origin',
    });
  } catch {
    throw new ApiError({
      message: 'We could not reach Slipsy. Check your connection and try again.',
      code: 'offline',
      status: 0,
    });
  }

  if (response.status === 204) return undefined as T;

  const contentType = response.headers.get('content-type') ?? '';
  const payload = contentType.includes('application/json') ? await response.json().catch(() => null) : null;

  if (!response.ok) {
    throw new ApiError({
      message: payload?.error ?? 'Something went wrong. Please try again.',
      code: payload?.code ?? 'error',
      status: response.status,
      fields: payload?.fields,
    });
  }

  return payload as T;
}
