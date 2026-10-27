/**
 * Translates errors raised while querying OpenSearch into a status code and
 * a message that is safe to show in the browser.
 *
 * The raw error (which may contain transport details, internal addresses or
 * the full upstream response body) is never returned to the client; it is
 * logged server-side instead by the caller.
 */

export interface SanitizedError {
  statusCode: number;
  message: string;
}

interface ErrorLike {
  name?: unknown;
  statusCode?: unknown;
  meta?: { statusCode?: unknown };
}

/**
 * Extracts the HTTP status code returned by OpenSearch, if any.
 * Handles both the opensearch-js `ResponseError` shape (`statusCode` getter
 * backed by `meta.statusCode`) and plain objects carrying `meta.statusCode`.
 */
export function getUpstreamStatusCode(err: unknown): number | null {
  if (!err || typeof err !== 'object') return null;
  const candidate = (err as ErrorLike).statusCode ?? (err as ErrorLike).meta?.statusCode;
  return typeof candidate === 'number' && Number.isInteger(candidate) ? candidate : null;
}

function getErrorName(err: unknown): string | null {
  if (!err || typeof err !== 'object') return null;
  const name = (err as ErrorLike).name;
  return typeof name === 'string' ? name : null;
}

/**
 * @param err - The caught error.
 * @param resource - Human-readable name of what the route fetches
 *   (e.g. "node statistics"), used in messages.
 * @param requiredPrivilege - The OpenSearch privilege the route needs, shown
 *   on authorization failures so operators know what to grant.
 */
export function sanitizeError(
  err: unknown,
  resource: string,
  requiredPrivilege: string
): SanitizedError {
  const status = getUpstreamStatusCode(err);
  const name = getErrorName(err);

  if (status === 401) {
    return { statusCode: 401, message: `Authentication is required to read ${resource}.` };
  }
  if (status === 403) {
    return {
      statusCode: 403,
      message: `You are not allowed to read ${resource}. Required privilege: ${requiredPrivilege}.`,
    };
  }
  if (status === 404) {
    return { statusCode: 404, message: `OpenSearch could not find ${resource}.` };
  }
  if (status === 429) {
    return {
      statusCode: 429,
      message: `OpenSearch rejected the request for ${resource} because it is overloaded. Try again later.`,
    };
  }
  if (name === 'TimeoutError' || status === 408 || status === 504) {
    return { statusCode: 504, message: `OpenSearch did not return ${resource} in time.` };
  }
  if (name === 'ConnectionError' || name === 'NoLivingConnectionsError' || status === 503) {
    return {
      statusCode: 503,
      message: `OpenSearch is unavailable; ${resource} could not be retrieved.`,
    };
  }
  if (status !== null && status >= 500) {
    return { statusCode: 502, message: `OpenSearch returned an error while reading ${resource}.` };
  }
  return { statusCode: 500, message: `Failed to retrieve ${resource}.` };
}
