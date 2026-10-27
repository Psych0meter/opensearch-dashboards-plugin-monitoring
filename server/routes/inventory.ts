import { promises as dns } from 'dns';
import { ExpectedHost, isIpAddress, normalizeHost } from '../../common/node_inventory';

/** How long a resolved host is reused before being looked up again. */
const CACHE_TTL_MS = 5 * 60 * 1000;
/** Upper bound for a single lookup, so a slow resolver can't stall the route. */
const LOOKUP_TIMEOUT_MS = 2000;

export type LookupFn = (host: string) => Promise<string[]>;

const defaultLookup: LookupFn = async (host) => {
  const results = await dns.lookup(host, { all: true });
  return results.map((entry) => entry.address);
};

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`DNS lookup timed out after ${ms}ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

/**
 * Resolves the hosts OpenSearch Dashboards is configured to talk to into
 * their IP addresses, so they can be matched against the nodes' publish
 * addresses even when names differ.
 *
 * Results (including failures, as an empty list) are cached per host: the
 * connection pool is static for the process lifetime, and the route is hit
 * on every dashboard refresh.
 */
export class HostResolver {
  private readonly cache = new Map<string, { expires: number; addresses: string[] }>();

  constructor(
    private readonly lookup: LookupFn = defaultLookup,
    private readonly now: () => number = Date.now
  ) {}

  public async resolve(host: string): Promise<string[]> {
    const normalized = normalizeHost(host);
    if (isIpAddress(normalized)) return [normalized];

    const cached = this.cache.get(normalized);
    if (cached && cached.expires > this.now()) return cached.addresses;

    let addresses: string[];
    try {
      addresses = Array.from(new Set(await withTimeout(this.lookup(normalized), LOOKUP_TIMEOUT_MS)));
    } catch {
      // Unresolvable hosts are still matched by name; they just don't
      // contribute addresses.
      addresses = [];
    }
    this.cache.set(normalized, { expires: this.now() + CACHE_TTL_MS, addresses });
    return addresses;
  }

  public async resolveAll(hosts: string[]): Promise<ExpectedHost[]> {
    return Promise.all(
      hosts.map(async (host) => ({ host, addresses: await this.resolve(host) }))
    );
  }
}

/**
 * Extracts the distinct host names from the OpenSearch client's connection
 * pool, which is built from `opensearch.hosts`.
 */
export function getConfiguredHosts(transport: unknown): string[] {
  const connections =
    (transport as { connectionPool?: { connections?: { url?: URL }[] } } | undefined)
      ?.connectionPool?.connections ?? [];
  return Array.from(
    new Set(
      connections
        .map((connection) => connection.url?.hostname)
        .filter((hostname): hostname is string => Boolean(hostname))
        .map(normalizeHost)
    )
  ).sort();
}
