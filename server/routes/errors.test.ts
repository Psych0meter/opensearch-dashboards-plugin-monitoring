import { getUpstreamStatusCode, sanitizeError } from './errors';

const upstream = (statusCode: number, message = 'raw upstream body with 10.0.0.1:9200') =>
  Object.assign(new Error(message), { name: 'ResponseError', meta: { statusCode } });

describe('getUpstreamStatusCode', () => {
  it('reads statusCode or meta.statusCode', () => {
    expect(getUpstreamStatusCode({ statusCode: 403 })).toBe(403);
    expect(getUpstreamStatusCode(upstream(404))).toBe(404);
    expect(getUpstreamStatusCode(new Error('boom'))).toBeNull();
    expect(getUpstreamStatusCode('boom')).toBeNull();
  });
});

describe('sanitizeError', () => {
  it('preserves authorization failures and names the required privilege', () => {
    const result = sanitizeError(upstream(403), 'node statistics', 'cluster:monitor/nodes/stats');
    expect(result.statusCode).toBe(403);
    expect(result.message).toContain('cluster:monitor/nodes/stats');
  });

  it.each([
    [401, 401],
    [404, 404],
    [429, 429],
    [500, 502],
    [503, 503],
    [504, 504],
  ])('maps upstream %i to %i', (upstreamStatus, expected) => {
    expect(sanitizeError(upstream(upstreamStatus), 'x', 'y').statusCode).toBe(expected);
  });

  it('maps transport failures without a status code', () => {
    const timeout = Object.assign(new Error('Request timed out'), { name: 'TimeoutError' });
    const noConn = Object.assign(new Error('There are no living connections'), {
      name: 'NoLivingConnectionsError',
    });
    expect(sanitizeError(timeout, 'x', 'y').statusCode).toBe(504);
    expect(sanitizeError(noConn, 'x', 'y').statusCode).toBe(503);
  });

  it('never returns the raw upstream message', () => {
    for (const status of [400, 401, 403, 404, 429, 500, 503]) {
      expect(sanitizeError(upstream(status), 'x', 'y').message).not.toContain('10.0.0.1');
    }
    expect(sanitizeError(new Error('secret detail'), 'x', 'y')).toEqual({
      statusCode: 500,
      message: 'Failed to retrieve x.',
    });
  });
});
